package flowlens;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * flow-lens: log diagnostyczny (wstrzyknięty — tylko w kopii aplikacji, gałąź flowlens-diag).
 * Jedna linia JSON na zdarzenie, w osobnym pliku na proces: {@code <katalog>/<pid>.jsonl}. Bez zależności, Java 8+.
 * Format: zrodla/diag.mjs w skillu flow-lens.
 *
 * Korelacja: pierwsze wejście do metody z mapy na wątku bez bieżącego „kor” otwiera nowy kor (wejście do aplikacji);
 * wyjście z niego go zamyka. Transakcja otwarta na wątku przed wejściem (proxy @Transactional zakłada ją przed
 * wywołaniem metody) trafia do kor, który zaraz się otworzy; commit i SQL po wyjściu (flush ORM przy commicie)
 * — do kor, w którym transakcja się zaczęła.
 */
public final class Diag {
    static final String KATALOG = "@@KATALOG@@";
    private static final AtomicLong SEK = new AtomicLong();
    private static final AtomicLong KORY = new AtomicLong();
    private static final String PID = pid();
    private static final long T0 = System.currentTimeMillis(), N0 = System.nanoTime();   // zegar monotoniczny w ms
    private static Writer pisarz;

    private static final class Watek {
        String kor;          // bieżący request na tym wątku
        int glebokosc;       // zagnieżdżenie metod z mapy
        String korTx;        // kor transakcji otwartej na tym wątku (żyje dłużej niż wejście)
        String blad;         // wyjątek przechodzący przez metody (do najbliższych out)
        final List<String> czekajace = new ArrayList<String>(); // zdarzenia przed wejściem (BEGIN z proxy)
        String beginZrodlo;  // BEGIN z proxy @Transactional w trwającym kor: czeka na in() metody, którą proxy owija
        String beginKlasa;   // klasa za proxy (null = nieznana, np. proxy JDK) — tylko jej in() przejmuje BEGIN
        double beginTs;      // chwila odłożonego BEGIN (SQL po nim ma start ts − ms: z czasem zapisu wypadałby przed BEGIN)
        double ostTs;        // ts ostatniego zdarzenia tego wątku
        String ostKor;       // ostatnio zamknięty kor na tym wątku (publikacja frameworka już po wyjściu z metody)
        double ostKorTs;     // chwila zamknięcia ostKor
        int zewKafka;        // wstrzyknięte zew("KAFKA") czekające na swoje send (interceptor ich nie dubluje)
    }
    private static final ThreadLocal<Watek> W = new ThreadLocal<Watek>() {
        @Override protected Watek initialValue() { return new Watek(); }
    };

    private Diag() {}

    public static void in(String klasa, String metoda) { in(klasa, metoda, null, null, null); }

    /** rodzaj: http | soap | kolejka | komenda | zdarzenie | job | test | cli (dla wejść do aplikacji) */
    public static void in(String klasa, String metoda, String rodzaj, String httpMetoda, String sciezka) {
        try {
            Watek w = W.get();
            StringBuilder s = new StringBuilder();
            boolean nowy = w.glebokosc == 0 && w.kor == null;
            boolean przejmuje = w.beginZrodlo != null && (w.beginKlasa == null || w.beginKlasa.equals(klasa));
            if (w.beginZrodlo != null && !przejmuje) wypiszBegin(w);    // BEGIN innej metody: zostaje przed tym wejściem
            if (nowy) w.kor = "k-" + PID + "-" + KORY.incrementAndGet();
            w.glebokosc++;
            w.blad = null;
            naglowek(s, w.kor, "in").append(",\"klasa\":").append(str(klasa)).append(",\"metoda\":").append(str(metoda));
            if (nowy) {
                // bez znanego wejścia: na wątku innym niż main to praca w tle (pula, @Async, Timer) — przebieg zostaje
                String r = rodzaj != null ? rodzaj : "main".equals(Thread.currentThread().getName()) ? "wywolanie" : "w tle";
                s.append(",\"wejscie\":{\"rodzaj\":").append(str(r));
                if (httpMetoda != null) s.append(",\"metoda\":").append(str(httpMetoda));
                if (sciezka != null) s.append(",\"sciezka\":").append(str(sciezka));
                s.append(",\"nazwa\":").append(str(httpMetoda != null ? httpMetoda + " " + sciezka : krotka(klasa) + "." + metoda)).append('}');
            }
            pisz(s.append('}'));
            if (przejmuje) wypiszBegin(w);                              // BEGIN jako pierwsze zdarzenie metody @Transactional
            if (nowy && !w.czekajace.isEmpty()) {          // BEGIN z proxy przed wejściem → do tego kor, zaraz po in
                if (w.korTx == null) w.korTx = w.kor;
                for (String z : w.czekajace) pisz(new StringBuilder(z.replace("\"kor\":null", "\"kor\":" + str(w.kor))));
                w.czekajace.clear();
            }
        } catch (Throwable ignoruj) { /* diagnostyka nie może zepsuć aplikacji */ }
    }

    /** granice requestu HTTP (filtr serwletów): otwiera kor zanim zadziała jakakolwiek klasa aplikacji */
    public static void httpStart(String metoda, String uri) { in("http", uri, "http", metoda, uri); }

    /** koniec requestu: status, szablon ścieżki z frameworka („/zamowienia/{id}”), wyjątek nieobsłużony */
    public static void httpKoniec(String uri, int status, String wzorzec, Throwable blad) {
        try {
            Watek w = W.get();
            if (w.beginZrodlo != null) wypiszBegin(w);
            StringBuilder s = naglowek(new StringBuilder(), w.kor, "out").append(",\"klasa\":\"http\",\"metoda\":").append(str(uri)).append(",\"status\":").append(status);
            if (wzorzec != null) s.append(",\"sciezka\":").append(str(wzorzec));
            if (blad != null) s.append(",\"blad\":").append(str(opisBledu(blad)));
            pisz(s.append('}'));
            zamknijKor(w);
            w.glebokosc = 0; w.blad = null; w.beginZrodlo = null; w.beginKlasa = null;
        } catch (Throwable ignoruj) { }
    }

    private static void zamknijKor(Watek w) {
        if (w.kor != null) { w.ostKor = w.kor; w.ostKorTs = teraz(); }
        w.kor = null; w.zewKafka = 0;
    }

    public static void blad(String klasa, String metoda, Throwable t) {
        try { W.get().blad = t.getClass().getName() + (t.getMessage() != null ? ": " + t.getMessage() : ""); } catch (Throwable ignoruj) { }
    }

    public static void out(String klasa, String metoda) {
        try {
            Watek w = W.get();
            if (w.beginZrodlo != null) wypiszBegin(w);
            StringBuilder s = naglowek(new StringBuilder(), w.kor, "out").append(",\"klasa\":").append(str(klasa)).append(",\"metoda\":").append(str(metoda));
            if (w.blad != null) s.append(",\"blad\":").append(str(w.blad));
            pisz(s.append('}'));
            if (w.glebokosc > 0 && --w.glebokosc == 0) { zamknijKor(w); w.blad = null; }
        } catch (Throwable ignoruj) { }
    }

    public static void sql(String sql, double ms, String baza, String blad) { sql(sql, ms, baza, blad, 0); }

    /** partia: liczba wierszy executeBatch (0 = zwykłe wykonanie); SQL partii bez wartości (szablon) */
    public static void sql(String sql, double ms, String baza, String blad, int partia) {
        try {
            Watek w = W.get();
            if (w.beginZrodlo != null) wypiszBegin(w);
            String kor = w.kor != null ? w.kor : w.korTx;
            StringBuilder s = naglowek(new StringBuilder(), kor, "sql").append(",\"sql\":").append(str(sql))
                .append(",\"ms\":").append(Math.round(ms * 1000) / 1000.0);
            if (baza != null) s.append(",\"baza\":").append(str(baza));
            if (blad != null) s.append(",\"blad\":").append(str(blad));
            if (partia > 0) s.append(",\"partia\":").append(partia);
            pisz(s.append('}'));
        } catch (Throwable ignoruj) { }
    }

    /** wywołanie innego systemu (wstawiane przed instrukcją z klientem: Kafka, RabbitMQ, JMS, HTTP) */
    public static void zew(String system, String cel) {
        try {
            Watek w = W.get();
            if (w.beginZrodlo != null) wypiszBegin(w);
            if ("KAFKA".equals(system)) w.zewKafka++;
            pisz(naglowek(new StringBuilder(), w.kor != null ? w.kor : w.korTx, "zew").append(",\"system\":").append(str(system))
                .append(",\"cel\":").append(str(cel)).append('}'));
        } catch (Throwable ignoruj) { }
    }

    /** okno, w którym publikacja bez kor należy jeszcze do ostatnio zamkniętego kor wątku (ms) */
    static final double OKNO_PUBLIKACJI = 3000;

    /**
     * wysłanie wiadomości Kafka widziane przez interceptor KafkaTemplate (DiagSpring), na wątku wysyłającym. W kor:
     * tylko to, czego nie złapało wstrzyknięte zew przed instrukcją z klientem (wysyłka z kodu frameworka). Bez kor:
     * publikacja frameworka po wyjściu z metody — Spring Kafka DefaultErrorHandler → DeadLetterPublishingRecoverer
     * wysyła na „.DLT” po ostatniej próbie konsumenta — trafia do ostatnio zamkniętego kor tego wątku.
     */
    public static void kafka(String temat) {
        try {
            Watek w = W.get();
            if (w.kor != null || w.korTx != null) {
                if (w.zewKafka > 0) { w.zewKafka--; return; }
                zew("KAFKA", temat); w.zewKafka = Math.max(0, w.zewKafka - 1);
                return;
            }
            if (w.ostKor == null || teraz() - w.ostKorTs > OKNO_PUBLIKACJI) return;
            pisz(naglowek(new StringBuilder(), w.ostKor, "zew").append(",\"system\":\"KAFKA\",\"cel\":").append(str(temat)).append('}'));
        } catch (Throwable ignoruj) { }
    }

    /** faza: begin | commit | rollback */
    public static void tx(String faza, String zrodlo) {
        try {
            Watek w = W.get();
            if (w.beginZrodlo != null) wypiszBegin(w);
            if ("begin".equals(faza) && w.kor != null) {
                String za = zaProxyTransakcji();
                if (za != null) { w.beginZrodlo = zrodlo; w.beginKlasa = za.isEmpty() ? null : za; w.beginTs = teraz(); return; }
            }
            String kor = w.kor != null ? w.kor : w.korTx;
            StringBuilder s = naglowek(new StringBuilder(), kor, "tx").append(",\"faza\":").append(str(faza)).append(",\"zrodlo\":").append(str(zrodlo)).append('}');
            if ("begin".equals(faza)) {
                if (w.kor == null) { w.czekajace.add(s.toString()); return; }   // przed wejściem: czeka na kor
                w.korTx = w.kor;
            } else {
                w.czekajace.clear();
                w.korTx = null;
                if (kor == null) return;                                         // poza requestem (np. setup testu)
            }
            pisz(s);
        } catch (Throwable ignoruj) { }
    }

    private static void wypiszBegin(Watek w) throws Exception {
        String zrodlo = w.beginZrodlo;
        w.beginZrodlo = null; w.beginKlasa = null;
        w.korTx = w.kor;
        // chwila odłożenia, ale nie wcześniej niż poprzednie zdarzenie wątku (in() metody, którą proxy owija):
        // kolejność po ts zostaje, a SQL transakcji nie zaczyna się przed jej BEGIN
        pisz(naglowek(new StringBuilder(), w.kor, "tx", Math.max(w.beginTs, w.ostTs)).append(",\"faza\":\"begin\",\"zrodlo\":").append(str(zrodlo)).append('}'));
    }

    /**
     * BEGIN otwierany przez proxy/aspekt @Transactional (TransactionAspectSupport) przed ciałem metody: klasa za proxy
     * (CGLIB „X$$SpringCGLIB$$0” → X, AspectJ: sama klasa), "" gdy nieznana (proxy JDK), null gdy BEGIN nie z proxy
     * (TransactionTemplate, ręczny JDBC — zostaje tam, gdzie padł).
     */
    static String zaProxyTransakcji() {
        StackTraceElement[] st = Thread.currentThread().getStackTrace();
        int i = 0;
        while (i < st.length && !st[i].getClassName().startsWith("org.springframework.transaction.interceptor.TransactionAspectSupport")
            && !st[i].getClassName().startsWith("org.springframework.transaction.aspectj.")) i++;
        if (i >= st.length) return null;
        for (i++; i < st.length; i++) {
            String c = st[i].getClassName();
            if (INFRA.matcher(c).lookingAt()) continue;              // łańcuch interceptorów i refleksja
            if (c.startsWith("com.sun.proxy.") || c.startsWith("jdk.proxy") || c.contains(".$Proxy")) return "";
            int d = c.indexOf("$$");
            if (d > 0) return c.substring(0, d).replace('$', '.');  // CGLIB: X$$SpringCGLIB$$0, X$$EnhancerBySpringCGLIB$$…
            return c.replace('$', '.');                              // AspectJ: aspekt wpleciony w samą klasę
        }
        return "";
    }
    private static final java.util.regex.Pattern INFRA = java.util.regex.Pattern.compile(
        "org\\.springframework\\.(transaction|aop|cglib|dao|validation|security|cache|retry|resilience|beans|context|orm|data|aot|scheduling|util)\\.|org\\.aopalliance\\.|java\\.lang\\.reflect\\.|jdk\\.internal\\.|sun\\.reflect\\.|net\\.sf\\.cglib\\.|io\\.micrometer\\.");

    /** wyjątek z najgłębszą przyczyną (framework często opakowuje: „Unhandled exception in exception handler”) */
    static String opisBledu(Throwable t) {
        String s = t.getClass().getName() + (t.getMessage() != null ? ": " + t.getMessage() : "");
        Throwable g = t;
        for (int i = 0; i < 20; i++) {
            Throwable n = g.getCause();
            if (n == null) try { Object r = g.getClass().getMethod("getRootCause").invoke(g); if (r instanceof Throwable) n = (Throwable) r; } catch (Exception brak) { }
            if (n == null || n == g) break;
            g = n;
        }
        return g == t ? s : s + " | przyczyna: " + g.getClass().getName() + (g.getMessage() != null ? ": " + g.getMessage() : "");
    }

    private static double teraz() { return T0 + (System.nanoTime() - N0) / 1e6; }

    private static StringBuilder naglowek(StringBuilder s, String kor, String ev) { return naglowek(s, kor, ev, teraz()); }

    private static StringBuilder naglowek(StringBuilder s, String kor, String ev, double ts) {
        W.get().ostTs = ts;
        return s.append("{\"v\":1,\"ts\":").append(String.format(java.util.Locale.ROOT, "%.3f", ts)).append(",\"pid\":").append(PID)
            .append(",\"w\":").append(str(Thread.currentThread().getName())).append(",\"kor\":").append(kor == null ? "null" : str(kor))
            .append(",\"sek\":").append(SEK.incrementAndGet()).append(",\"ev\":\"").append(ev).append('"');
    }

    private static synchronized void pisz(StringBuilder linia) throws Exception {
        if (pisarz == null) {
            String k = System.getProperty("flowlens.diag", System.getenv("FLOWLENS_DIAG") != null ? System.getenv("FLOWLENS_DIAG") : KATALOG);
            File d = new File(k);
            d.mkdirs();
            pisarz = new OutputStreamWriter(new FileOutputStream(new File(d, PID + ".jsonl"), true), StandardCharsets.UTF_8);
        }
        pisarz.write(linia.append('\n').toString());
        pisarz.flush();
    }

    static String str(String t) {
        if (t == null) return "null";
        StringBuilder s = new StringBuilder(t.length() + 2).append('"');
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            switch (c) {
                case '"': s.append("\\\""); break;
                case '\\': s.append("\\\\"); break;
                case '\n': s.append("\\n"); break;
                case '\r': s.append("\\r"); break;
                case '\t': s.append("\\t"); break;
                default: if (c < 0x20) s.append(String.format("\\u%04x", (int) c)); else s.append(c);
            }
        }
        return s.append('"').toString();
    }

    private static String krotka(String klasa) { return klasa.substring(klasa.lastIndexOf('.') + 1); }

    private static String pid() {
        String n = ManagementFactory.getRuntimeMXBean().getName();
        int i = n.indexOf('@');
        return i > 0 ? n.substring(0, i) : String.valueOf(System.identityHashCode(Diag.class));
    }
}

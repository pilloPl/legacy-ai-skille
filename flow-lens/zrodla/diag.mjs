// Źródło: nasz log diagnostyczny (dla aplikacji bez OpenTelemetry). Jedna linia = jedno zdarzenie JSON, w osobnym
// pliku (nie miesza się z logami aplikacji). Piszą go pomocniki wstrzyknięte do aplikacji (wstrzykniecie/<jezyk>/).
//
// Format (v1):
//   {"v":1,"ts":1792523432857.25,"pid":123,"w":"http-nio-8080-exec-1","kor":"k-7f3a","sek":12,"ev":"in",
//    "klasa":"pkg.Klasa","metoda":"m","wejscie":{"rodzaj":"http","metoda":"POST","sciezka":"/x"}}
//   ev: in | out | sql | tx | log | blad
//     in   — wejście do metody (z „wejscie” na wejściu do aplikacji: http, soap, kolejka, komenda, zdarzenie, job, test, cli)
//     out  — wyjście z metody (opcjonalnie „blad”, „status”)
//     sql  — zapytanie: "sql", "ms" (czas), "baza"
//     tx   — transakcja: "faza": begin | commit | rollback, "zrodlo" (np. "spring", "ado", "pdo")
//     log  — log aplikacji przechwycony przez pomocnika: "poziom", "tekst"
//     zew  — wywołanie innego systemu: "metoda", "url" (HTTP) albo "system" + "cel" (kolejka, RPC), "ms"
//   kor — identyfikator korelacji nadany na wejściu i niesiony przez kontekst (ThreadLocal, contextvars,
//         AsyncLocalStorage, AsyncLocal<T>, zmienna requestu w PHP). Brak kor = wątek + kolejność (gorsza korelacja).
//   sek — licznik zdarzeń w procesie: kolejność przy równym ts.
//   id, rodzic (opcjonalnie) — jawne powiązanie wywołań, gdy jeden request robi kilka rzeczy naraz (Node: Promise.all,
//         Python: asyncio.gather) i stos per wątek się przeplata; out z „id” zamyka dokładnie to wywołanie.
//
// Wynik: rekordy w kształcie spanów i logów z otlp.mjs — dalej działa ten sam przebieg.mjs i Zbieracz.
import fs from "node:fs";
import path from "node:path";

export const nazwa = "diag";
export const PRZERWA_TLA = 300;
const KIND = { INTERNAL: 1, SERVER: 2, CLIENT: 3, CONSUMER: 5 };
const RODZAJ_WEJSCIA = { http: KIND.SERVER, soap: KIND.SERVER, grpc: KIND.SERVER, kolejka: KIND.CONSUMER, komenda: KIND.CONSUMER, zdarzenie: KIND.CONSUMER };

// Składanie par in/out w spany. Stan per proces: stosy per (kor || wątek).
export class Diag {
  // korzenie: kor → span wejścia (BEGIN z proxy przed wejściem i COMMIT/flush po wyjściu podpinamy pod niego);
  // czekajace: kor → SQL/tx, które przyszły, zanim wejście tego kor się otworzyło
  // tla: wątek → otwarta praca w tle (SQL bez kor i bez otwartej metody: @Async, pula, wątek własny spoza mapy)
  // ostTx: stos → ts ostatniej granicy transakcji (SQL po niej nie zaczyna się przed nią)
  constructor() { this.stosy = new Map(); this.licznik = 0; this.traceWatku = new Map(); this.korzenie = new Map(); this.czekajace = new Map(); this.tla = new Map(); this.ostTx = new Map(); }

  // praca w tle kończy się ciszą na wątku (PRZERWA_TLA ms) — zamknięcie daje span korzenia „w tle · wątek”
  domknij(teraz) {
    const wynik = [];
    for (const [k, t] of this.tla) {
      if (teraz - t.ost <= PRZERWA_TLA) continue;
      this.tla.delete(k);
      wynik.push({ typ: "span", zrodlo: nazwa, trace: t.trace, span: t.span, rodzic: "", nazwa: `w tle · ${t.w}`, rodzaj: KIND.INTERNAL, start: t.start, koniec: t.ost,
        atrybuty: { "thread.name": t.w, "flowlens.wejscie": "w tle" }, zdarzenia: [], status: { kod: 0, opis: "" }, zasob: {}, zakres: "flowlens.diag" });
    }
    return wynik;
  }

  id() { return (++this.licznik).toString(16).padStart(16, "0"); }

  // klucz stosu: kor i wątek (async może przeskoczyć wątek w obrębie jednego kor — wtedy osobny stos z rodzicem
  // = ostatni otwarty span tego kor na innym wątku)
  stos(z) {
    const k = `${z.pid ?? ""}|${z.kor || ""}|${z.w || ""}`;
    if (!this.stosy.has(k)) this.stosy.set(k, []);
    return this.stosy.get(k);
  }
  trace(z) {
    if (z.kor) return String(z.kor);
    // bez kor: nowy trace przy wejściu na pustym stosie wątku
    const k = `${z.pid ?? ""}|${z.w || ""}`;
    if (!this.traceWatku.has(k) || (z.ev === "in" && z.wejscie)) this.traceWatku.set(k, `w-${k}-${this.id()}`);
    return this.traceWatku.get(k);
  }
  rodzic(z, stos) {
    if (z._tlo) return z._tlo;
    if (z.rodzic != null && this.jawne?.has(`${z.pid}|${z.rodzic}`)) return this.jawne.get(`${z.pid}|${z.rodzic}`).span;
    if (stos.length) return stos[stos.length - 1].span;
    if (!z.kor) return "";
    // ten sam kor na innym wątku (async): najgłębszy otwarty span tego kor
    for (const [k, s] of this.stosy) if (s.length && k.split("|")[1] === z.kor && s !== stos) return s[s.length - 1].span;
    return this.korzenie.get(z.kor)?.span || "";
  }

  // start otwartego spanu-rodzica (stos, jawne id, korzeń kor)
  startSpanu(rodzic, stos, z) {
    if (!rodzic) return null;
    const r = stos.findLast(x => x.span === rodzic) || (z.rodzic != null && this.jawne?.get(`${z.pid}|${z.rodzic}`))
      || (z.kor && this.korzenie.get(z.kor)?.span === rodzic ? this.korzenie.get(z.kor) : null);
    return r?.span === rodzic ? r.z.ts : null;
  }

  span(r, z, atr, ten = true) {
    // koniec requestu może przynieść szablon ścieżki z frameworka (filtr HTTP): nazwa jak w OTel — „GET /x/{id}”
    const wej = r.z.wejscie && z.sciezka && ten ? { ...r.z.wejscie, sciezka: z.sciezka, nazwa: `${r.z.wejscie.metoda || ""} ${z.sciezka}`.trim() } : r.z.wejscie;
    // szablon zastępuje ścieżkę z „in” — ta była faktycznym adresem (filtr HTTP): zostaje jako url.path, jak w OTel
    // („/Basket” wobec „/Basket/{handler?}”: przypadek dopasowuje się po adresie)
    const adres = wej !== r.z.wejscie && r.z.wejscie.sciezka && r.z.wejscie.sciezka !== z.sciezka ? { "url.path": r.z.wejscie.sciezka } : {};
    const a = { ...atr, "thread.name": r.z.w, "code.namespace": r.z.klasa, "code.function": r.z.metoda };
    if (wej?.rodzaj === "http" || wej?.rodzaj === "soap") Object.assign(a, { "http.request.method": wej.metoda || "", "http.route": wej.sciezka || "", ...adres, ...(z.status != null ? { "http.response.status_code": z.status } : {}) });
    if (wej && !["http", "soap"].includes(wej.rodzaj)) Object.assign(a, { "flowlens.wejscie": wej.rodzaj, ...(wej.nazwa ? { "messaging.destination.name": wej.nazwa } : {}) });
    return {
      typ: "span", zrodlo: nazwa, trace: r.trace, span: r.span, rodzic: r.rodzic,
      nazwa: wej?.nazwa || `${String(r.z.klasa).split(".").pop()}.${r.z.metoda}`,
      rodzaj: wej ? (RODZAJ_WEJSCIA[wej.rodzaj] ?? KIND.INTERNAL) : KIND.INTERNAL,
      start: r.z.ts, koniec: z.ts, atrybuty: a, zdarzenia: [],
      status: { kod: z.blad ? 2 : 0, opis: z.blad || "" }, zasob: {}, zakres: "flowlens.diag",
    };
  }

  czytaj(z) {
    if (!z || typeof z !== "object" || !z.ev) return [];
    const stos = this.stos(z), trace = this.trace(z);
    const atr = { "thread.name": z.w, ...(z.atrybuty || {}) };
    if (z.ev === "in" && z.id != null) {                                   // jawne id: bez stosu
      this.jawne ||= new Map();
      const r = { span: this.id(), rodzic: z.rodzic != null ? this.jawne.get(`${z.pid}|${z.rodzic}`)?.span || "" : "", trace, z };
      if (!r.rodzic && z.kor && this.korzenie.has(z.kor)) r.rodzic = this.korzenie.get(z.kor).span;
      this.jawne.set(`${z.pid}|${z.id}`, r);
      if (z.kor && !r.rodzic && !this.korzenie.has(z.kor)) {
        this.korzenie.set(z.kor, r);
        const czeka = this.czekajace.get(z.kor) || [];
        this.czekajace.delete(z.kor);
        return czeka.flatMap(c => this.czytaj({ ...c, ts: Math.max(c.ts, z.ts) }));
      }
      return [];
    }
    if (z.ev === "out" && z.id != null && this.jawne?.has(`${z.pid}|${z.id}`)) {
      const r = this.jawne.get(`${z.pid}|${z.id}`);
      this.jawne.delete(`${z.pid}|${z.id}`);
      return [this.span(r, z, atr)];
    }
    if (z.ev === "in") {
      const r = { span: this.id(), rodzic: this.rodzic(z, stos), trace, z };
      stos.push(r);
      if (z.kor && !r.rodzic && !this.korzenie.has(z.kor)) {
        this.korzenie.set(z.kor, r);
        const czeka = this.czekajace.get(z.kor) || [];
        this.czekajace.delete(z.kor);
        return czeka.flatMap(c => this.czytaj({ ...c, ts: Math.max(c.ts, z.ts) }));
      }
      return [];
    }
    if (z.ev === "out") {
      // zdejmij do pasującego wejścia (zgubione out-y w środku zamykamy razem z nim)
      let i = stos.length - 1;
      while (i >= 0 && !(stos[i].z.klasa === z.klasa && stos[i].z.metoda === z.metoda)) i--;
      if (i < 0) return [];
      const zamykane = stos.splice(i);
      return zamykane.reverse().map(r => this.span(r, z, atr, r === zamykane.at(-1)));
    }
    const rodzic = this.rodzic(z, stos);
    if ((z.ev === "sql" || z.ev === "tx" || z.ev === "zew") && !z.kor && !rodzic) {
      const k = `${z.pid ?? ""}|${z.w || ""}`;
      const wynik = [];
      let t = this.tla.get(k);
      if (t && z.ts - t.ost > PRZERWA_TLA) { wynik.push(...this.domknij(z.ts)); t = null; }
      if (!t) { t = { w: z.w || "?", start: z.ts - (Number(z.ms) || 0), ost: z.ts, span: this.id(), trace: `tlo-${k}-${this.id()}` }; this.tla.set(k, t); }
      t.ost = z.ts;
      return [...wynik, ...this.czytaj({ ...z, kor: t.trace, _tlo: t.span })];
    }
    if ((z.ev === "sql" || z.ev === "tx") && z.kor && !rodzic && !z._tlo) {            // przed wejściem swojego kor: poczekaj
      if (!this.czekajace.has(z.kor)) this.czekajace.set(z.kor, []);
      this.czekajace.get(z.kor).push(z);
      return [];
    }
    if (z.ev === "sql" || z.ev === "tx") {
      const sql = z.ev === "sql" ? z.sql : { begin: "BEGIN", commit: "COMMIT", rollback: "ROLLBACK" }[z.faza] || String(z.faza || "").toUpperCase();
      const czas = Number(z.ms) || 0;
      // start = ts − ms, ale nie przed rodzicem ani przed granicą transakcji zapisaną wcześniej na tym samym stosie:
      // kolejność zdarzeń (ts, sek) jest pewna, a ts granicy bywa chwilą zapisu (BEGIN odłożony do in() metody za
      // proxy @Transactional) — inaczej sortowanie rodzeństwa po start stawia SQL przed BEGIN swojej transakcji
      const kStosu = `${z.pid ?? ""}|${z.kor || ""}|${z.w || ""}`;
      const granica = Math.max(this.ostTx.get(kStosu) ?? -Infinity, this.startSpanu(rodzic, stos, z) ?? -Infinity);
      const start = Math.min(z.ts, Math.max(z.ts - czas, granica));
      if (z.ev === "tx") this.ostTx.set(kStosu, z.ts);
      return [{
        typ: "span", zrodlo: nazwa, trace, span: this.id(), rodzic, nazwa: sql.split(/\s+/)[0], rodzaj: KIND.CLIENT,
        start, koniec: z.ts, atrybuty: { ...atr, "db.statement": sql, ...(z.szablon ? { "db.statement.szablon": z.szablon } : {}), "db.name": z.baza || "baza", ...(z.tabela ? { "db.sql.table": z.tabela } : {}), ...(z.partia ? { "db.operation.batch.size": z.partia } : {}), ...(z.flush ? { "flowlens.flush": true } : {}) },
        zdarzenia: [], status: { kod: z.blad ? 2 : 0, opis: z.blad || "" }, zasob: {}, zakres: z.ev === "tx" ? `flowlens.tx.${z.zrodlo || ""}` : "flowlens.sql",
      }];
    }
    if (z.ev === "zew") {
      const czas = Number(z.ms) || 0;
      let host = z.cel || ""; try { if (z.url) host = new URL(z.url).host; } catch {}
      return [{
        typ: "span", zrodlo: nazwa, trace, span: this.id(), rodzic, nazwa: z.url ? `${z.metoda || "HTTP"} ${z.url}` : `${z.system || "wywołanie"} ${z.cel || ""}`.trim(),
        rodzaj: KIND.CLIENT, start: z.ts - czas, koniec: z.ts, zdarzenia: [], status: { kod: z.blad ? 2 : 0, opis: z.blad || "" }, zasob: {}, zakres: "flowlens.zew",
        atrybuty: { ...atr, ...(z.url ? { "http.request.method": z.metoda || "GET", "url.full": z.url } : {}), ...(z.system ? { "messaging.system": z.system, "messaging.destination.name": z.cel } : {}), "server.address": host },
      }];
    }
    if (z.ev === "log" || z.ev === "blad")
      return [{ typ: "log", zrodlo: nazwa, ts: z.ts, poziom: z.poziom || (z.ev === "blad" ? "ERROR" : "INFO"), tekst: z.tekst || "", atrybuty: { "thread.name": z.w }, trace, span: rodzic, zakres: "flowlens.diag" }];
    return [];
  }
}

export function parsujLinie(linia) {
  const t = linia.trim();
  if (!t.startsWith("{")) return null;
  try { const o = JSON.parse(t); return o && o.ev ? o : null; } catch { return null; }
}

// Śledzi katalog (albo plik) naszych logów od końca; nowe pliki (nowe procesy) też.
export function sledzDiag(cel, naRekordy, { co = 250 } = {}) {
  const diag = new Diag(), pozycje = new Map(), reszty = new Map();
  const pliki = () => {
    try { return fs.statSync(cel).isDirectory() ? fs.readdirSync(cel).filter(f => f.endsWith(".jsonl")).map(f => path.join(cel, f)) : [cel]; }
    catch { return []; }
  };
  for (const f of pliki()) pozycje.set(f, fs.statSync(f).size);        // tylko to, co przyjdzie po starcie
  // rekordy ze wszystkich plików (procesów) z jednego kroku czytamy razem, po czasie: przebieg z korelacją przez HTTP
  // (wołający i wołany proces w jednym kor) ma korzeń u wołającego, nie u tego, którego plik przyszedł pierwszy
  const krok = () => {
    const zd = [];
    for (const f of pliki()) {
      let st; try { st = fs.statSync(f); } catch { continue; }
      let poz = pozycje.get(f) ?? 0;                                   // nowy plik (nowy proces): od początku
      if (st.size < poz) poz = 0;
      if (st.size <= poz) { pozycje.set(f, poz); continue; }
      const fd = fs.openSync(f, "r"), buf = Buffer.alloc(st.size - poz);
      fs.readSync(fd, buf, 0, buf.length, poz); fs.closeSync(fd);
      pozycje.set(f, st.size);
      const linie = ((reszty.get(f) || "") + buf.toString("utf8")).split("\n");
      reszty.set(f, linie.pop());
      zd.push(...linie.map(parsujLinie).filter(Boolean));
    }
    const rek = zd.sort((a, b) => a.ts - b.ts || (a.sek ?? 0) - (b.sek ?? 0)).flatMap(z => diag.czytaj(z));
    if (rek.length) naRekordy(rek);
    const bezczynne = diag.domknij(Date.now());
    if (bezczynne.length) naRekordy(bezczynne);
  };
  const zegar = setInterval(krok, co);
  return () => clearInterval(zegar);
}

// Cały plik naraz (przeliczanie, testy)
export function czytajDiag(tekst) {
  const diag = new Diag();
  return [...tekst.split("\n").map(parsujLinie).filter(Boolean).sort((a, b) => a.ts - b.ts || (a.sek ?? 0) - (b.sek ?? 0)).flatMap(z => diag.czytaj(z)), ...diag.domknij(Infinity)];
}

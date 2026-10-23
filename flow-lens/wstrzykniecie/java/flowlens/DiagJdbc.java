package flowlens;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import javax.sql.DataSource;

/**
 * flow-lens: owinięcie DataSource (JDBC, bez zależności). Łapie każde zapytanie niezależnie od tego, kto je wysyła —
 * repozytorium Spring Data, Hibernate, JdbcTemplate, MyBatis, jOOQ czy ręczny JDBC — z wartościami parametrów
 * i czasem. Transakcje: setAutoCommit(false) = begin, commit(), rollback().
 * Użycie: {@code dataSource = DiagJdbc.owin(dataSource)} (Spring robi to sam przez DiagSpring).
 */
public final class DiagJdbc {
    private DiagJdbc() {}

    // kilka warstw DataSource (pula + TransactionAwareDataSourceProxy, obie owinięte): zapisuje tylko zewnętrzna
    private static final ThreadLocal<int[]> GLEBOKOSC = new ThreadLocal<int[]>() {
        @Override protected int[] initialValue() { return new int[1]; }
    };

    public static DataSource owin(DataSource ds) {
        if (ds == null || Proxy.isProxyClass(ds.getClass()) && Proxy.getInvocationHandler(ds) instanceof Owijka) return ds;
        return (DataSource) proxy(ds, new Owijka(ds, null, null));
    }

    private static Object proxy(Object cel, InvocationHandler h) {
        Set<Class<?>> interfejsy = new LinkedHashSet<Class<?>>();
        for (Class<?> c = cel.getClass(); c != null; c = c.getSuperclass())
            for (Class<?> i : c.getInterfaces()) if (java.lang.reflect.Modifier.isPublic(i.getModifiers())) interfejsy.add(i);
        try { return Proxy.newProxyInstance(cel.getClass().getClassLoader(), interfejsy.toArray(new Class<?>[0]), h); }
        catch (IllegalArgumentException niewidoczne) {                      // interfejs spoza class loadera: tylko JDBC
            Class<?> i = cel instanceof DataSource ? DataSource.class : cel instanceof Connection ? Connection.class
                : cel instanceof java.sql.CallableStatement ? java.sql.CallableStatement.class : cel instanceof PreparedStatement ? PreparedStatement.class : Statement.class;
            return Proxy.newProxyInstance(DiagJdbc.class.getClassLoader(), new Class<?>[] { i }, h);
        }
    }

    private static final class Owijka implements InvocationHandler {
        final Object cel;
        final String sql;                                 // dla PreparedStatement / CallableStatement
        final String baza;                                // nazwa bazy (katalog połączenia)
        final Map<Integer, String> parametry = new TreeMap<Integer, String>();

        Owijka(Object cel, String sql, String baza) { this.cel = cel; this.sql = sql; this.baza = baza; }

        @Override public Object invoke(Object p, Method m, Object[] a) throws Throwable {
            String n = m.getName();
            int[] gl = GLEBOKOSC.get();
            if (gl[0] > 0 && !n.equals("equals") && !n.equals("hashCode")) {          // warstwa wewnętrzna: bez zapisu
                Object w = wywolaj(m, a);
                if (w instanceof Connection && n.equals("getConnection")) return proxy(w, new Owijka(w, null, katalog((Connection) w)));
                if (w instanceof Statement && (n.equals("prepareStatement") || n.equals("prepareCall") || n.equals("createStatement")))
                    return proxy(w, new Owijka(w, a != null && a.length > 0 && a[0] instanceof String ? (String) a[0] : null, baza));
                return w;
            }
            gl[0]++;
            try { return wykonaj(p, m, a, n); } finally { gl[0]--; }
        }

        private Object wykonaj(Object p, Method m, Object[] a, String n) throws Throwable {
            // tożsamość proxy: equals(proxy) musi być true (Spring porównuje DataSource menedżera transakcji i kontekstu)
            if (n.equals("equals") && a != null && a.length == 1) return a[0] == p || a[0] == cel;
            if (n.equals("hashCode") && (a == null || a.length == 0)) return cel.hashCode();
            if (cel instanceof Connection) {
                if (n.equals("setAutoCommit") && a != null && Boolean.FALSE.equals(a[0]) && ((Connection) cel).getAutoCommit()) Diag.tx("begin", "jdbc");
                else if (n.equals("commit")) { Object w = wywolaj(m, a); Diag.tx("commit", "jdbc"); return w; }
                else if (n.equals("rollback") && (a == null || a.length == 0)) { Object w = wywolaj(m, a); Diag.tx("rollback", "jdbc"); return w; }
            }
            if (cel instanceof PreparedStatement && n.startsWith("set") && a != null && a.length >= 2 && a[0] instanceof Integer)
                parametry.put((Integer) a[0], n.equals("setNull") ? "NULL" : literal(a[1]));
            if (cel instanceof PreparedStatement && n.equals("clearParameters")) parametry.clear();
            boolean wykonanie = cel instanceof Statement && (n.equals("execute") || n.equals("executeQuery") || n.equals("executeUpdate")
                || n.equals("executeLargeUpdate") || n.equals("executeBatch") || n.equals("executeLargeBatch"));
            String tekst = wykonanie ? (a != null && a.length > 0 && a[0] instanceof String ? (String) a[0] : zWartosciami()) : null;
            long t0 = System.nanoTime();
            Object w;
            try { w = wywolaj(m, a); }
            catch (Throwable t) { if (tekst != null) Diag.sql(tekst, (System.nanoTime() - t0) / 1e6, baza, t.toString(), 0); throw t; }
            if (tekst != null) Diag.sql(n.endsWith("Batch") && sql != null ? sql : tekst, (System.nanoTime() - t0) / 1e6, baza, null, n.endsWith("Batch") ? rozmiar(w) : 0);
            if (w instanceof Connection && (n.equals("getConnection")))
                return proxy(w, new Owijka(w, null, katalog((Connection) w)));
            if (w instanceof Statement && (n.equals("prepareStatement") || n.equals("prepareCall") || n.equals("createStatement")))
                return proxy(w, new Owijka(w, a != null && a.length > 0 && a[0] instanceof String ? (String) a[0] : null, baza));
            return w;
        }

        private Object wywolaj(Method m, Object[] a) throws Throwable {
            if (!m.isAccessible()) m.setAccessible(true);
            try { return m.invoke(cel, a); } catch (InvocationTargetException e) { throw e.getCause(); }
        }

        private String zWartosciami() {
            if (sql == null) return "?";
            if (parametry.isEmpty()) return sql;
            StringBuilder s = new StringBuilder();
            int nr = 0;
            boolean wNapisie = false;
            for (int i = 0; i < sql.length(); i++) {
                char c = sql.charAt(i);
                if (c == '\'') wNapisie = !wNapisie;
                if (c == '?' && !wNapisie) { String v = parametry.get(++nr); s.append(v != null ? v : "?"); }
                else s.append(c);
            }
            return s.toString();
        }
    }

    private static String katalog(Connection c) {
        try { return c.getCatalog(); } catch (Throwable t) { return null; }
    }

    private static int rozmiar(Object wynikPartii) {
        if (wynikPartii instanceof int[]) return ((int[]) wynikPartii).length;
        if (wynikPartii instanceof long[]) return ((long[]) wynikPartii).length;
        return 0;
    }

    static String literal(Object v) {
        if (v == null) return "NULL";
        if (v instanceof Number || v instanceof Boolean) return v.toString();
        String t = String.valueOf(v);
        if (t.length() > 200) t = t.substring(0, 200) + "…";
        return "'" + t.replace("'", "''") + "'";
    }
}

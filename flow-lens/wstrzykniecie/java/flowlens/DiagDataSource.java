package flowlens;

import java.io.PrintWriter;
import java.lang.reflect.Method;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.SQLFeatureNotSupportedException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.logging.Logger;
import javax.sql.DataSource;

/**
 * flow-lens: DataSource definiowany przez aplikację bez Springa (Jakarta EE: {@code <data-source>} w web.xml,
 * {@code @DataSourceDefinition}). Wstrzyknięcie podmienia class-name na tę klasę i dokłada właściwość
 * {@code flowlensKlasa} z oryginalną klasą. Serwer ustawia właściwości setterami (url, user, password, serverName…) —
 * zbieramy je i przy pierwszym połączeniu tworzymy oryginalny DataSource, ustawiamy mu te same właściwości i owijamy
 * DiagJdbc (SQL z parametrami, setAutoCommit(false)/commit/rollback lokalnej transakcji puli).
 */
public class DiagDataSource implements DataSource {
    private final Map<String, Object> wlasciwosci = new LinkedHashMap<String, Object>();
    private String klasa;
    private volatile DataSource cel;
    private PrintWriter logWriter;
    private int loginTimeout;

    public void setFlowlensKlasa(String k) { klasa = k; }
    public String getFlowlensKlasa() { return klasa; }

    // standardowe właściwości DataSource (JDBC 4, 9.6.1) i najczęstsze sterownikowe
    public void setUrl(String v) { ustaw("url", v); }
    public void setURL(String v) { ustaw("url", v); }
    public void setUser(String v) { ustaw("user", v); }
    public void setPassword(String v) { ustaw("password", v); }
    public void setServerName(String v) { ustaw("serverName", v); }
    public void setPortNumber(int v) { ustaw("portNumber", v); }
    public void setDatabaseName(String v) { ustaw("databaseName", v); }
    public void setDescription(String v) { ustaw("description", v); }
    public void setDataSourceName(String v) { ustaw("dataSourceName", v); }
    public void setNetworkProtocol(String v) { ustaw("networkProtocol", v); }
    public void setRoleName(String v) { ustaw("roleName", v); }

    private synchronized void ustaw(String n, Object v) { if (v != null) wlasciwosci.put(n, v); cel = null; }

    private DataSource cel() throws SQLException {
        DataSource d = cel;
        if (d != null) return d;
        synchronized (this) {
            if (cel != null) return cel;
            if (klasa == null) throw new SQLException("flow-lens: brak właściwości flowlensKlasa (oryginalna klasa DataSource)");
            try {
                Class<?> c;
                try { c = Class.forName(klasa, true, Thread.currentThread().getContextClassLoader()); }
                catch (ClassNotFoundException e) { c = Class.forName(klasa); }
                Object o = c.getDeclaredConstructor().newInstance();
                // class-name bywa sterownikiem (java.sql.Driver z url) — serwery to dopuszczają
                DataSource ds = o instanceof java.sql.Driver ? new Sterownik((java.sql.Driver) o, wlasciwosci) : (DataSource) o;
                if (!(o instanceof java.sql.Driver)) for (Map.Entry<String, Object> w : wlasciwosci.entrySet()) ustawWlasciwosc(ds, w.getKey(), w.getValue());
                if (logWriter != null) ds.setLogWriter(logWriter);
                if (loginTimeout != 0) ds.setLoginTimeout(loginTimeout);
                cel = DiagJdbc.owin(ds);
                return cel;
            } catch (SQLException e) { throw e; }
            catch (Exception e) { throw new SQLException("flow-lens: nie da się utworzyć " + klasa, e); }
        }
    }

    // setter bez względu na wielkość liter (setURL / setUrl), wartość tekstowa zamieniana na typ parametru
    private static void ustawWlasciwosc(Object o, String n, Object v) throws Exception {
        for (Method m : o.getClass().getMethods()) {
            if (m.getParameterTypes().length != 1 || !m.getName().equalsIgnoreCase("set" + n)) continue;
            Class<?> t = m.getParameterTypes()[0];
            String s = String.valueOf(v);
            Object w = t.isInstance(v) ? v : t == String.class ? s : t == int.class || t == Integer.class ? Integer.valueOf(s)
                : t == long.class || t == Long.class ? Long.valueOf(s) : t == boolean.class || t == Boolean.class ? Boolean.valueOf(s)
                : t == short.class || t == Short.class ? Short.valueOf(s) : null;
            if (w == null) continue;
            m.invoke(o, w);
            return;
        }
    }

    /** sterownik JDBC jako DataSource: url + user/password (i reszta właściwości) do Driver.connect */
    static final class Sterownik implements DataSource {
        private final java.sql.Driver d;
        private final java.util.Properties p = new java.util.Properties();
        private final String url;
        Sterownik(java.sql.Driver d, Map<String, Object> w) {
            this.d = d;
            for (Map.Entry<String, Object> e : w.entrySet()) if (!e.getKey().equals("url")) p.setProperty(e.getKey(), String.valueOf(e.getValue()));
            url = w.get("url") != null ? String.valueOf(w.get("url")) : null;
        }
        @Override public Connection getConnection() throws SQLException { return d.connect(url, p); }
        @Override public Connection getConnection(String u, String h) throws SQLException {
            java.util.Properties q = new java.util.Properties(); q.putAll(p);
            if (u != null) q.setProperty("user", u);
            if (h != null) q.setProperty("password", h);
            return d.connect(url, q);
        }
        @Override public PrintWriter getLogWriter() { return null; }
        @Override public void setLogWriter(PrintWriter out) { }
        @Override public void setLoginTimeout(int s) { }
        @Override public int getLoginTimeout() { return 0; }
        @Override public Logger getParentLogger() throws SQLFeatureNotSupportedException { return d.getParentLogger(); }
        @Override public <T> T unwrap(Class<T> i) throws SQLException { if (i.isInstance(this)) return i.cast(this); throw new SQLException("flow-lens: brak " + i); }
        @Override public boolean isWrapperFor(Class<?> i) { return i.isInstance(this); }
    }

    @Override public Connection getConnection() throws SQLException { return cel().getConnection(); }
    @Override public Connection getConnection(String u, String p) throws SQLException { return cel().getConnection(u, p); }
    @Override public PrintWriter getLogWriter() throws SQLException { return cel != null ? cel.getLogWriter() : logWriter; }
    @Override public void setLogWriter(PrintWriter out) throws SQLException { logWriter = out; if (cel != null) cel.setLogWriter(out); }
    @Override public void setLoginTimeout(int s) throws SQLException { loginTimeout = s; if (cel != null) cel.setLoginTimeout(s); }
    @Override public int getLoginTimeout() throws SQLException { return cel != null ? cel.getLoginTimeout() : loginTimeout; }
    @Override public Logger getParentLogger() throws SQLFeatureNotSupportedException {
        try { return cel().getParentLogger(); } catch (SQLException e) { throw new SQLFeatureNotSupportedException(e); }
    }
    @Override public <T> T unwrap(Class<T> i) throws SQLException { return i.isInstance(this) ? i.cast(this) : cel().unwrap(i); }
    @Override public boolean isWrapperFor(Class<?> i) throws SQLException { return i.isInstance(this) || cel().isWrapperFor(i); }
}

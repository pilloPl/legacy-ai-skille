package flowlens;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import javax.sql.DataSource;
import org.springframework.beans.factory.config.SmartInstantiationAwareBeanPostProcessor;
import org.springframework.core.Ordered;
import org.springframework.core.PriorityOrdered;

/**
 * flow-lens: w aplikacji Spring owija każdy bean DataSource (DiagJdbc). Rejestracja przez autokonfigurację
 * (META-INF/spring/…AutoConfiguration.imports dla Boot 2.7+/3, META-INF/spring.factories dla Boot 1/2) — bez zmian
 * w kodzie aplikacji. Spring bez Boota (XML): {@code <bean class="flowlens.DiagSpring"/>}.
 * Wczesne referencje (zależności cykliczne, np. EntityManagerFactory ↔ DataSource) dostają ten sam obiekt co
 * kontekst — inaczej Hibernate pisałby obok proxy, a menedżer transakcji widziałby inny DataSource niż reszta.
 * Repozytoria-interfejsy z mapy (Spring Data: bez ciała w źródle, nie da się wstrzyknąć) owijamy proxy z in/out.
 * KafkaTemplate (Spring Kafka 3+) dostaje interceptor wysyłki (Diag.kafka): publikacje frameworka, których nie widać
 * w kodzie aplikacji (DeadLetterPublishingRecoverer na „.DLT” po ostatniej próbie konsumenta). Bez zależności od Kafki.
 */
public class DiagSpring implements SmartInstantiationAwareBeanPostProcessor, PriorityOrdered {
    private final Map<String, Object> wczesne = new ConcurrentHashMap<String, Object>();

    @Override public int getOrder() { return Ordered.HIGHEST_PRECEDENCE; }

    @Override public Object getEarlyBeanReference(Object bean, String nazwa) {
        if (!(bean instanceof DataSource)) return bean;
        Object p = DiagJdbc.owin((DataSource) bean);
        wczesne.put(nazwa, p);
        return p;
    }

    @Override public Object postProcessBeforeInitialization(Object bean, String nazwa) { return bean; }

    @Override public Object postProcessAfterInitialization(Object bean, String nazwa) {
        if (!(bean instanceof DataSource)) { kafka(bean); return repozytorium(bean); }
        Object p = wczesne.remove(nazwa);
        return p != null ? p : DiagJdbc.owin((DataSource) bean);
    }

    private static Object repozytorium(Object bean) {
        if (DiagRepozytoria.KLASY.length == 0 || bean == null) return bean;
        // już owinięty (dwa konteksty XML z beanem DiagSpring, kontekst-rodzic i dziecko)
        if (Proxy.isProxyClass(bean.getClass()) && Proxy.getInvocationHandler(bean).getClass().getEnclosingClass() == DiagSpring.class) return bean;
        Set<Class<?>> interfejsy = new LinkedHashSet<Class<?>>();
        for (Class<?> c = bean.getClass(); c != null; c = c.getSuperclass()) interfejsy.addAll(Arrays.asList(c.getInterfaces()));
        Class<?> repo = null;
        for (Class<?> i : interfejsy) if (Arrays.asList(DiagRepozytoria.KLASY).contains(i.getName().replace('$', '.'))) { repo = i; break; }
        if (repo == null) return bean;
        final String fqn = repo.getName().replace('$', '.');
        final Set<String> metody = new HashSet<String>();
        for (String m : DiagRepozytoria.METODY) if (m.startsWith(fqn + "#")) metody.add(m.substring(fqn.length() + 1));
        final Set<Method> repoMetody = new HashSet<Method>(Arrays.asList(repo.getMethods()));
        final Object cel = bean;
        InvocationHandler h = new InvocationHandler() {
            @Override public Object invoke(Object p, Method m, Object[] a) throws Throwable {
                if (m.getName().equals("equals") && a != null && a.length == 1) return a[0] == p || a[0] == cel;
                if (m.getName().equals("hashCode") && (a == null || a.length == 0)) return cel.hashCode();
                // wszystkie metody repozytorium (także odziedziczone save/findById…), jak instrumentacja Spring Data w OTel
                boolean sledz = m.getDeclaringClass() != Object.class && (repoMetody.contains(m) || metody.contains(m.getName()));
                if (!sledz) return wywolaj(cel, m, a);
                Diag.in(fqn, m.getName());
                try { return wywolaj(cel, m, a); }
                catch (Throwable t) { Diag.blad(fqn, m.getName(), t); throw t; }
                finally { Diag.out(fqn, m.getName()); }
            }
        };
        try { return Proxy.newProxyInstance(bean.getClass().getClassLoader(), interfejsy.toArray(new Class<?>[0]), h); }
        catch (IllegalArgumentException e) { return bean; }
    }

    /** interceptor wysyłki na KafkaTemplate; istniejący interceptor aplikacji zostaje (wołany po nas) */
    static void kafka(Object bean) {
        try {
            Class<?> kt = null;
            for (Class<?> c = bean.getClass(); c != null; c = c.getSuperclass()) if (c.getName().equals("org.springframework.kafka.core.KafkaTemplate")) { kt = c; break; }
            if (kt == null) return;
            final Class<?> pi = Class.forName("org.apache.kafka.clients.producer.ProducerInterceptor", false, kt.getClassLoader());
            java.lang.reflect.Field pole = kt.getDeclaredField("producerInterceptor");
            pole.setAccessible(true);
            final Object stary = pole.get(bean);
            if (stary != null && Proxy.isProxyClass(stary.getClass()) && Proxy.getInvocationHandler(stary) instanceof Wysylka) return;
            Object nowy = Proxy.newProxyInstance(kt.getClassLoader(), new Class<?>[] { pi }, new Wysylka(stary));
            kt.getMethod("setProducerInterceptor", pi).invoke(bean, nowy);
        } catch (Throwable brak) { /* Spring Kafka < 3 albo inna wersja: bez interceptora */ }
    }

    private static final class Wysylka implements InvocationHandler {
        private final Object stary;
        Wysylka(Object stary) { this.stary = stary; }
        @Override public Object invoke(Object p, Method m, Object[] a) throws Throwable {
            if (m.getName().equals("onSend") && a != null && a.length == 1) {
                try { Diag.kafka(String.valueOf(a[0].getClass().getMethod("topic").invoke(a[0]))); } catch (Throwable ignoruj) { }
                return stary != null ? wywolaj(stary, m, a) : a[0];
            }
            if (m.getName().equals("equals") && a != null && a.length == 1) return a[0] == p;
            if (m.getName().equals("hashCode") && (a == null || a.length == 0)) return System.identityHashCode(p);
            if (m.getName().equals("toString") && (a == null || a.length == 0)) return "flowlens.DiagSpring.Wysylka";
            return stary != null ? wywolaj(stary, m, a) : null;
        }
    }

    private static Object wywolaj(Object cel, Method m, Object[] a) throws Throwable {
        if (!m.isAccessible()) m.setAccessible(true);                     // interfejs pakietowy (bez public)
        try { return m.invoke(cel, a); } catch (InvocationTargetException e) { throw e.getCause(); }
    }
}

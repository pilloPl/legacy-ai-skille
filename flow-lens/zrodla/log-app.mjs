// Źródło: logi, które aplikacja JUŻ pisze (bez OTel i bez wstrzykiwania) — wystarczy podnieść poziom logowania
// kilku loggerów frameworka. Linie → zdarzenia jak w naszym logu diagnostycznym (in/out/sql/tx) → ten sam Diag
// (stosy, korelacja, spany) → ten sam przebieg.
//
// Korelacja: wątek. Request = od „POST "/x"” do „Completed 200” DispatcherServleta na tym samym wątku (w Tomcacie wątek
// obsługuje jeden request naraz). Poza requestem (job, konsument) — od otwarcia transakcji do jej końca.
//
// Spring Boot / Hibernate — do włączenia (application.properties albo argumenty --logging.level.…):
//   org.springframework.web.servlet.DispatcherServlet=DEBUG                         granice requestu, status
//   org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping=DEBUG   kontroler#metoda
//   org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver=DEBUG  wyjątek → status
//     (400 z walidacji argumentu: kontroler się nie wykonał — „Mapped to” nie jest wtedy krokiem)
//   org.springframework.orm.jpa.JpaTransactionManager=DEBUG (albo …jdbc.support.JdbcTransactionManager,
//     …jdbc.datasource.DataSourceTransactionManager)                               BEGIN/COMMIT/ROLLBACK, REQUIRES_NEW
//   org.springframework.transaction.interceptor=TRACE                               KAŻDA metoda @Transactional (in/out),
//                                                                                  także repozytoria Spring Data
//     (SimpleJpaRepository/SimpleJdbcRepository → interfejs repozytorium z mapy: po metodzie albo tabeli SQL)
//   org.springframework.cache.interceptor.CacheAspectSupport=TRACE                 trafienie w @Cacheable: metoda się
//                                                                                  nie wykonała (proxy transakcji tak)
//   org.hibernate.SQL=DEBUG, org.hibernate.orm.jdbc.bind=TRACE (Hibernate 6)
//     albo org.hibernate.type.descriptor.sql.BasicBinder=TRACE (Hibernate 5)      SQL z wartościami
//   org.springframework.jdbc.core.JdbcTemplate=DEBUG                               SQL z JdbcTemplate
//   org.springframework.jdbc.core.StatementCreatorUtils=TRACE                      … i jego parametry
//   org.springframework.web.client=DEBUG                                          wywołania HTTP (RestTemplate, RestClient)
//   org.quartz.core.JobRunShell=DEBUG                                              start joba Quartz (koniec: cisza na wątku)
//   <pakiet mapperów MyBatis>=DEBUG                                                SQL i parametry MyBatis (krok mappera)
//   net.sourceforge.stripes.controller.DispatcherHelper=DEBUG                      zdarzenie ActionBeana Stripes (bez
//                                                                                  ścieżki i statusu; koniec: cisza)
// SQL na wątku bez requestu i transakcji (joby @Scheduled, wątki własne) → przebieg „w tle”, przybliżony: od pierwszego
// zdarzenia do ciszy na wątku (PRZERWA ms). Gdy na tym wątku przyjdzie potem początek albo koniec requestu (filtr przed
// DispatcherServletem, middleware sesji w Django, access log po odpowiedzi), praca „w tle” staje się tym requestem.
//
// Python (logging): format z %(asctime)s [%(threadName)s] LEVEL name - msg (jak logback), domyślny basicConfig
// („INFO:nazwa:treść”), „asctime LEVEL name treść” (echo SQLAlchemy), „asctime - name - LEVEL - msg”, format
// OTEL_PYTHON_LOG_CORRELATION (wątek = trace_id) i loguru. Loggery: sqlalchemy.engine (SQL, parametry w kolejnej
// linii, BEGIN (implicit)/COMMIT/ROLLBACK), django.db.backends (SQL z czasem, BEGIN/COMMIT w Django 5),
// django_structlog (request_started/finished), access log uvicorn / werkzeug / django.server (koniec requestu).
// Kanboard (PicoDb w trybie DEBUG): SQL hurtem na końcu żądania, granice „APP: …” i „###”, status z access logu php -S.
// Fastify: pino (JSON, „incoming request” / „request completed”) + knex (DEBUG=knex:query,knex:bindings,knex:tx).
// .NET: Razor Pages (zakres strony, handler z PageActionInvoker), view component z mapy, EF „Failed executing DbCommand”.
// Payara / GlassFish: server.log (ODL) z EclipseLink SQL (FINE) — bez granic requestu (access log Grizzly to osobny plik).
// Python z %(threadName)s: pula AnyIO ma jedną nazwę wątków — lepiej %(thread)d (praca puli bez linii logu dłuższa niż
// okno rozstrzyga się po transakcji: dostepCzeka).
// Czego logi nie dadzą bez zmian w aplikacji: SQL Prismy 4/5 (tylko new PrismaClient({ log: ['query'] })) i asyncpg (log
// bazy), granic requestu w Nest (Nest ich nie loguje — middleware jak DziennikHttp), statusu w Express bez morgana.
import fs from "node:fs";
import { Diag } from "./diag.mjs";

export const nazwa = "log-app";

// nagłówek linii: czas, poziom, wątek, logger, treść (Spring Boot 2/3, logback „[wątek] LEVEL logger - msg”)
const BOOT = /^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d[.,]\d+(?:Z|[+-]\d\d:?\d\d)?)\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+\d*\s*---\s+(?:\[[^\]]*\]\s+)?\[\s*([^\]]+?)\s*\]\s+(\S+)\s*:\s?(.*)$/;
const LOGBACK = /^(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d[.,]\d+|\d\d:\d\d:\d\d[.,]\d+)\s+\[([^\]]+)\]\s+(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|CRITICAL|FATAL)\s+(\S+)\s+-\s?(.*)$/;
// slf4j: znacznik (Marker) przed treścią — most commons-logging (spring-jcl przez slf4j-simple) pisze „ COMMONS-LOGGING …”
const ZNACZNIK = /^\s*(?:COMMONS-LOGGING\s+)?/;
const POZIOM_PY = { WARNING: "WARN", CRITICAL: "ERROR", FATAL: "ERROR", SUCCESS: "INFO" };
const poziom = p => POZIOM_PY[p] || p;

// Python: OTel log correlation („… LEVEL [logger] [plik:linia] [trace_id=… span_id=… …] - treść”), „asctime - logger -
// LEVEL - treść”, „asctime LEVEL logger treść” (echo SQLAlchemy), basicConfig bez formatu („INFO:logger:treść”, bez
// czasu), uvicorn bez konfiguracji („INFO:     treść”), loguru („czas | LEVEL | moduł:funkcja:linia - treść”)
const PY_POZ = "(DEBUG|INFO|WARNING|ERROR|CRITICAL)";
const PY_OTEL = new RegExp(`^(\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d{3}) ${PY_POZ} \\[([^\\]]+)\\] \\[[^\\]]*\\] \\[trace_id=(\\w+) span_id=\\w+[^\\]]*\\] - ?(.*)$`);
const PY_MYSLNIKI = new RegExp(`^(\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d{3}) - ([\\w.]+) - ${PY_POZ} - ?(.*)$`);
const PY_PROSTY = new RegExp(`^(\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d{3}) ${PY_POZ} ([\\w.]+):? (.*)$`);
// z wątkiem w nawiasie przed albo po poziomie i „logger: treść” („asctime LEVEL [threadName] name: msg”, „asctime
// [threadName] LEVEL name: msg”) — wątek rozdziela requesty (runserver Django: „Thread-N (process_request_thread)”)
const PY_POZ_WATEK = new RegExp(`^(\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d{3}) ${PY_POZ} \\[([^\\]]+)\\] ([\\w.]+): ?(.*)$`);
const PY_WATEK_POZ = new RegExp(`^(\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d,\\d{3}) \\[([^\\]]+)\\] ${PY_POZ} ([\\w.]+): ?(.*)$`);
const PY_DOMYSLNY = new RegExp(`^${PY_POZ}:([\\w.]+):(.*)$`);
const UVICORN = new RegExp(`^${PY_POZ}:\\s{2,}(.*)$`);
const LOGURU = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+) \| (\w+)\s*\| ([\w.<>-]+):[\w<>]+:\d+ - (.*)$/;

// Node: logger Nesta („[Nest] PID - data LEVEL [Kontekst] treść”), TypeORM („query: …” bez nagłówka), Prisma
// („prisma:query …”), knex (DEBUG=knex:query). Bez czasu i wątku w linii: czas z ostatniego nagłówka + kolejność linii,
// wątek „main” (Node jest jednowątkowy; przy ruchu sekwencyjnym granice requestu wyznaczają linie start/koniec).
const ANSI = /\x1b\[[0-9;]*m/g;
const NEST = /^\[Nest\]\s+\d+\s+-\s+(\d\d?\/\d\d?\/\d{4},?\s+\d\d?:\d\d:\d\d(?:\s*[AP]M)?)\s+(LOG|ERROR|WARN|DEBUG|VERBOSE|FATAL)\s+\[([^\]]+)\]\s+(.*)$/;
const BEZ_NAGLOWKA = [[/^(query(?: failed)?|error|query is slow):\s/, "TypeORM"], [/^prisma:(query|info|warn|error)\s/, "Prisma"], [/^\s*knex:(query|bindings|tx)\s/, "knex"]];
// koa-logger / hono („<-- GET /x”, „--> GET /x 200 12ms”) i winston format.simple z linią requestu („info: GET /x 200 3ms”)
const METODY = "GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS";
const STRZALKI = new RegExp(`^\\s*((?:<--|-->|xxx)\\s+(?:${METODY})\\s.*)$`);
const WINSTON = new RegExp(`^(?:error|warn|info|http|verbose|debug|silly):\\s+((?:${METODY})\\s+\\S+\\s+\\d{3}\\b.*)$`);
let ostatniCzas = Date.now(), poLinii = 0;
// koniec rekordu SQL w wielu liniach: parametry TypeORM / Prismy albo czas Prismy na końcu
const RAMKA_NET = /^\s+at ([\w.`+<>]+?)\.([\w<>]+)(?:\[[^\]]*\])?\(/;
const KONIEC_REKORDU_SQL = / --\s+PARAMETERS:\s|--\s*params:\s*\[|\(\d+(?:\.\d+)?\s*ms\)\s*$/;

// Laravel (Monolog): „[2026-10-21 08:31:48] local.DEBUG: wiadomość {kontekst JSON}” (czas w UTC — domyślna strefa
// aplikacji). `php artisan serve` przepisuje linie workerów BEZ czasu („  local.DEBUG: …”), a po requeście dopisuje
// „  2026-10-21 08:31:49 /ścieżka ..... ~ 5ms” — czas z ostatniej linii z czasem + kolejność (przybliżony).
const LARAVEL = /^\s*(?:\[(\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?(Z|[+-]\d\d:?\d\d)?)\]\s+)?[\w-]+\.(DEBUG|INFO|NOTICE|WARNING|ERROR|CRITICAL|ALERT|EMERGENCY):\s?(.*)$/;
const SERVE = /^\s+(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\s+\S+\s+\.{3,}/;
// Kanboard (własny logger): „[2026-10-21 10:26:54] [debug] treść”; access log `php -S`: „[pid] [Wed Oct 21 10:26:54 2026]
// 192.168.65.1:57756 [200]: POST /jsonrpc.php”
const KANBOARD = /^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\] \[(debug|info|notice|warning|error|critical|alert|emergency)\] (.*)$/;
const PHP_S = new RegExp(`^\\[\\d+\\] \\[\\w{3} \\w{3} +\\d+ \\d\\d:\\d\\d:\\d\\d \\d{4}\\] \\S+ \\[(\\d{3})\\]: (${METODY}) (\\S+)`);
let czasZLogu = false;
// stan zegara linii bez czasu jest modułowy — każdy odczyt pliku (czytajLogApp) i każde śledzenie zaczyna od zera,
// inaczej drugi odczyt w tym samym procesie dziedziczy czas końca poprzedniego
const zerujZegar = () => { ostatniCzas = Date.now(); poLinii = 0; czasZLogu = false; pinoReq = new Map(); };
const zegar = (t, strefa) => {
  const ts = Date.parse(t.replace(" ", "T") + (strefa ? "" : "Z"));
  if (!Number.isFinite(ts)) return;
  // znacznik z ułamkiem sekundy jest dokładny; bez ułamka (artisan serve) czas idzie dalej tylko z nową sekundą
  if (/\.\d/.test(t) || !czasZLogu || Math.floor(ts / 1000) > Math.floor(ostatniCzas / 1000)) { ostatniCzas = ts; poLinii = 0; czasZLogu = true; }
};

// Payara / GlassFish (server.log, format ODL/ULF): „[#|2026-…+0200|FINE|Payara 6|logger|_ThreadID=1;_ThreadName=x;
// _TimeMillis=…;|treść” — treść do „|#]”, zwykle w kolejnych liniach. EclipseLink (eclipselink.logging.level.sql=FINE):
// SQL i „bind => [wartości]” (eclipselink.logging.parameters=true; bez tego „[N parameters bound]”). Granic requestu ten log
// nie ma (access log Grizzly to osobny plik) — praca wątków http-thread-pool idzie „w tle”, transakcji JTA EclipseLink nie loguje
const ODL = /^\[#\|(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?)\|(\w+)\|[^|]*\|([^|]*)\|([^|]*)\|([\s\S]*)$/;
const POZIOM_JUL = { SEVERE: "ERROR", WARNING: "WARN", INFO: "INFO", CONFIG: "DEBUG", FINE: "DEBUG", FINER: "TRACE", FINEST: "TRACE" };
function odl(l) {
  const m = ODL.exec(l);
  if (!m) return null;
  const kv = Object.fromEntries(m[4].split(";").filter(Boolean).map(x => x.split("=")).map(([k, ...v]) => [k, v.join("=")]));
  const ts = Number(kv._TimeMillis) || czas(m[1]);
  ostatniCzas = ts; poLinii = 0;
  const koniec = /\|#\]\s*$/.test(m[5]);
  return { ts, poziom: POZIOM_JUL[m[2]] || m[2], watek: kv._ThreadName || "main", logger: /^org\.eclipse\.persistence\b/.test(m[3]) ? "EclipseLink" : m[3].replace(/\//g, "."), tekst: m[5].replace(/\|#\]\s*$/, ""), odl: true, ...(koniec ? {} : { otwarty: true }) };
}

// .NET (Microsoft.Extensions.Logging, konsola): „08:14:26.300 info: Kategoria[EventId] => zakres => zakres treść”
// (SingleLine + TimestampFormat) albo domyślny układ: „info: Kategoria[EventId]” i treść w kolejnych liniach z wcięciem.
// Kategoria z kropkami → z podkreśleniami (reguły dopasowują pełną nazwę, nie ostatni człon: Npgsql.Command ≠ EF …Command).
const DOTNET = /^(?:(\d{4}-\d\d-\d\d[T ])?(\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?)\s+)?(trce|dbug|info|warn|fail|crit):\s+([\w.`+-]+)\[(\d+)\]\s?(.*)$/;
// linia z samą godziną bez strefy (do kalibracji strefy z pliku)
const GODZINA = /^(\d\d:\d\d:\d\d(?:[.,]\d+)?)\s/;
const POZIOM_NET = { trce: "TRACE", dbug: "DEBUG", info: "INFO", warn: "WARN", fail: "ERROR", crit: "ERROR" };

// biblioteka debug (Express DEBUG=router, knex) i morgan: „2026-…Z przestrzeń treść”; debug 2.x bez TTY (Express 4):
// „Wed, 21 Oct 2026 09:13:17 GMT express:router treść” (toUTCString, dokładność do sekundy)
const KOLEKTOR = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3})(\d*)(Z|[+-]\d\d:\d\d) /;
const DEBUG_ISO = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)\s+(\S+)\s+(.*)$/;
const DEBUG_UTC = /^(\w{3}, \d\d \w{3} \d{4} \d\d:\d\d:\d\d GMT)\s+(\S+)\s+(.*)$/;
const bezCzasu = (logger, tekst, reszta = {}) => ({ ts: ostatniCzas + (poLinii += 0.01), poziom: "DEBUG", watek: "main", logger, tekst, przyblizone: true, ...reszta });

// pino (Fastify, pino-http) i bunyan: linia JSON {"level":30,"time":<ms|ISO>,"msg":…}. Requesty Fastify: „incoming
// request” (reqId, req.method, req.url) i „request completed” (reqId, res.statusCode, responseTime; pino-http: req
// w linii końca). Wątek „main” jak reszta Node (knex i debug nie znają reqId) — treść jak linie logu HTTP („--> GET /x”,
// „<-- GET /x 200 3ms”), więc działają te same reguły (zagnieżdżone i równoległe requesty); level ≥ 50 z err → błąd
const POZIOMY_PINO = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const poziomPino = p => (p >= 50 ? "ERROR" : p >= 40 ? "WARN" : p >= 30 ? "INFO" : p >= 20 ? "DEBUG" : "TRACE");
let pinoReq = new Map();
function pino(l) {
  if (l[0] !== "{" || !/"level"\s*:/.test(l) || !/"msg"\s*:/.test(l)) return null;
  let o; try { o = JSON.parse(l); } catch { return null; }
  const p = typeof o.level === "number" ? o.level : POZIOMY_PINO[o.level];
  if (p == null || typeof o.msg !== "string") return null;
  const ts = typeof o.time === "number" ? o.time : Date.parse(o.time);
  if (Number.isFinite(ts)) { ostatniCzas = ts; poLinii = 0; czasZLogu = true; }
  const n = { ts: Number.isFinite(ts) ? ts : ostatniCzas + (poLinii += 0.01), poziom: poziomPino(p), watek: "main", logger: "pino", przyblizone: true, ...(Number.isFinite(ts) ? { dokladny: true } : {}) };
  const { req, res } = o;
  if (o.msg === "incoming request" && req?.method && req.url) {
    if (o.reqId != null) { pinoReq.set(o.reqId, req); if (pinoReq.size > 1000) pinoReq.delete(pinoReq.keys().next().value); }
    return { ...n, tekst: `--> ${req.method} ${req.url}` };
  }
  if (o.msg === "request completed" && res?.statusCode) {
    const r = req?.method ? req : pinoReq.get(o.reqId);
    pinoReq.delete(o.reqId);
    return { ...n, tekst: r ? `<-- ${r.method} ${r.url} ${res.statusCode}${o.responseTime != null ? ` ${Math.round(o.responseTime)}ms` : ""}` : `request completed ${res.statusCode}` };
  }
  if (p >= 50 && o.err) return { ...n, tekst: `błąd ${o.err.type || "Error"}: ${String(o.err.message || "").slice(0, 2000)}` };
  return { ...n, tekst: o.msg };
}
export function naglowek(l) {
  l = l.replace(ANSI, "");
  const pn = pino(l);
  if (pn) return pn;
  const od = l.startsWith("[#|") && odl(l);
  if (od) return od;
  const lv = LARAVEL.exec(l);
  if (lv) {
    if (lv[1]) zegar(lv[1], lv[2]);
    return { ts: ostatniCzas + (poLinii += 0.01), poziom: lv[3], watek: "laravel", logger: "laravel", tekst: lv[4], przyblizone: true, ...(lv[1] && /\.\d/.test(lv[1]) ? { dokladny: true } : {}) };
  }
  const kb = KANBOARD.exec(l);
  if (kb) { zegar(kb[1]); return { ts: ostatniCzas + (poLinii += 0.01), poziom: kb[2].toUpperCase(), watek: "kanboard", logger: "kanboard", tekst: kb[3], przyblizone: true }; }
  const ps = PHP_S.exec(l);
  if (ps) return { ts: ostatniCzas + (poLinii += 0.01), poziom: "INFO", watek: "php-serwer", logger: "php-serwer", tekst: l, status: Number(ps[1]), metoda: ps[2], uri: ps[3], przyblizone: true };
  const dn = DOTNET.exec(l);
  if (dn) {
    const ts = dn[2] ? czas((dn[1] || "") + dn[2]) : ostatniCzas + (poLinii += 0.01);
    if (dn[2]) { ostatniCzas = ts; poLinii = 0; }
    return { ts, poziom: POZIOM_NET[dn[3]], watek: "main", logger: dn[4].replace(/\./g, "_"), kategoria: dn[4], tekst: dn[6], dotnet: true, ...(dn[2] ? {} : { przyblizone: true }) };
  }
  const sv = SERVE.exec(l);
  if (sv) { zegar(sv[1]); return { ts: ostatniCzas + (poLinii += 0.01), poziom: "INFO", watek: "serve", logger: "artisan-serve", tekst: l.trim(), przyblizone: true }; }
  const d = DEBUG_ISO.exec(l) || DEBUG_UTC.exec(l);
  if (d) {
    const ts = Date.parse(d[1]);
    if (Number.isFinite(ts) && (/T/.test(d[1]) || Math.floor(ts / 1000) !== Math.floor(ostatniCzas / 1000))) { ostatniCzas = ts; poLinii = 0; }
    const [, , ns, reszta] = d;
    const t = /T/.test(d[1]) ? ostatniCzas : ostatniCzas + (poLinii += 0.01);
    const dk = /T/.test(d[1]) ? { dokladny: true } : {};                  // ISO z milisekundami: czas tej linii
    if (/^knex:/.test(ns)) return { ts: t, poziom: "DEBUG", watek: "main", logger: "knex", tekst: `${ns} ${reszta}`, przyblizone: true, ...dk };
    if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/.test(ns)) return { ts: t, poziom: "INFO", watek: "main", logger: "morgan", tekst: `${ns} ${reszta}`, przyblizone: true, ...dk };
    if (/^[\w:.-]+$/.test(ns) && !/^\d/.test(ns)) return { ts: t, poziom: "DEBUG", watek: "main", logger: ns, tekst: reszta, przyblizone: true, ...dk };
  }
  const n = NEST.exec(l);
  if (n) {
    const ts = Date.parse(n[1].replace(",", ""));
    if (Number.isFinite(ts) && Math.floor(ts / 1000) !== Math.floor(ostatniCzas / 1000)) { ostatniCzas = ts; poLinii = 0; }
    return { ts: ostatniCzas + (poLinii += 0.01), poziom: n[2] === "LOG" ? "INFO" : n[2], watek: "main", logger: n[3], tekst: n[4], przyblizone: true };
  }
  let m = WINSTON.exec(l);
  if (m) return bezCzasu("winston", m[1], { poziom: "INFO" });
  m = STRZALKI.exec(l);
  if (m) return bezCzasu("http-log", m[1], { poziom: "INFO" });
  for (const [re, logger] of BEZ_NAGLOWKA) if (re.test(l)) return bezCzasu(logger, l.trim());
  m = BOOT.exec(l);
  if (m) return { ts: czas(m[1]), poziom: m[2], watek: m[3], logger: m[4], tekst: m[5].replace(ZNACZNIK, "") };
  m = LOGBACK.exec(l);
  if (m) return { ts: czas(m[1]), poziom: poziom(m[3]), watek: m[2], logger: m[4], tekst: m[5].replace(ZNACZNIK, "") };
  // Python
  m = PY_OTEL.exec(l);
  if (m) {
    const ts = czas(m[1]); ostatniCzas = ts; poLinii = 0;
    const trace = /^0+$/.test(m[4]) ? null : m[4];
    return { ts, poziom: poziom(m[2]), watek: trace ? `trace-${trace.slice(0, 8)}` : "main", logger: m[3], tekst: m[5], ...(trace ? {} : { bezWatku: true }) };
  }
  m = PY_MYSLNIKI.exec(l);
  if (m) { const ts = czas(m[1]); ostatniCzas = ts; poLinii = 0; return { ts, poziom: poziom(m[3]), watek: "main", logger: m[2], tekst: m[4] }; }
  m = PY_POZ_WATEK.exec(l);
  if (m) { const ts = czas(m[1]); ostatniCzas = ts; poLinii = 0; return { ts, poziom: poziom(m[2]), watek: m[3], logger: m[4], tekst: m[5] }; }
  m = PY_WATEK_POZ.exec(l);
  if (m) { const ts = czas(m[1]); ostatniCzas = ts; poLinii = 0; return { ts, poziom: poziom(m[3]), watek: m[2], logger: m[4], tekst: m[5] }; }
  m = PY_PROSTY.exec(l);
  if (m) { const ts = czas(m[1]); ostatniCzas = ts; poLinii = 0; return { ts, poziom: poziom(m[2]), watek: "main", logger: m[3], tekst: m[4] }; }
  m = LOGURU.exec(l);
  if (m) { const ts = czas(m[1]); ostatniCzas = ts; poLinii = 0; return { ts, poziom: poziom(m[2]), watek: "main", logger: m[3], tekst: m[4] }; }
  m = PY_DOMYSLNY.exec(l);
  if (m) return bezCzasu(m[2], m[3], { poziom: poziom(m[1]) });
  m = UVICORN.exec(l);
  if (m) return bezCzasu("uvicorn", m[2], { poziom: poziom(m[1]) });
  return null;
}
function czas(t) {
  t = t.replace(",", ".").replace(" ", "T").replace(/([+-]\d\d)(\d\d)$/, "$1:$2");
  if (/^\d\d:/.test(t)) return czasDnia(t);
  const v = Date.parse(t);
  return Number.isFinite(v) ? v : Date.now();
}
// Sama godzina („08:14:26.300”, konsola .NET, logback %d{HH:mm:ss.SSS}): bez daty i zwykle bez strefy. Strefa procesu
// (kontener: UTC) = przesunięcie godziny z logu względem chwili odniesienia: na żywo chwila odczytu linii, z pliku
// — „odniesienie” (np. mtime) wobec ostatniej godziny w pliku; bez odniesienia UTC. Dzień: najbliższy poprzedniej
// linii (przejście przez północ), na początku najbliższy chwili odniesienia — nie data odczytu.
const DOBA = 86400000, KWADRANS = 900000;
const zegarDnia = { odniesienie: null, przes: 0, ost: null };
// naZywo: strefa z chwili odczytu pierwszej godziny (linie czytane tuż po zapisaniu)
export function ustawZegarDnia({ odniesienie = null, przes = 0, naZywo = false } = {}) { Object.assign(zegarDnia, { odniesienie, przes: naZywo ? null : przes, ost: null }); }
const wDobie = x => ((x % DOBA) + DOBA) % DOBA;
const godzinaDnia = t => Date.parse("1970-01-01T" + t + (/(Z|[+-]\d\d:\d\d)$/.test(t) ? "" : "Z"));
// przesunięcie strefy (wielokrotność kwadransa) z godziny w logu i chwili, w której ją zapisano
export const przesuniecieStrefy = (godzina, chwila) => { const d = wDobie(godzina - chwila); return Math.round((d > DOBA / 2 ? d - DOBA : d) / KWADRANS) * KWADRANS; };
function czasDnia(t) {
  const g = godzinaDnia(t);
  if (!Number.isFinite(g)) return Date.now();
  const zeStrefa = /(Z|[+-]\d\d:\d\d)$/.test(t);
  if (!zeStrefa && zegarDnia.przes == null) zegarDnia.przes = przesuniecieStrefy(g, Date.now());
  const u = wDobie(g - (zeStrefa ? 0 : zegarDnia.przes));
  const wzgl = zegarDnia.ost ?? zegarDnia.odniesienie ?? Date.now();
  let ts = Math.floor(wzgl / DOBA) * DOBA + u;
  if (ts - wzgl > DOBA / 2) ts -= DOBA; else if (wzgl - ts > DOBA / 2) ts += DOBA;
  return (zegarDnia.ost = ts);
}
// loggery, których ostatni człon jest zbyt ogólny („error”) — reguły dopasowują je po pełnej nazwie (także skróconej
// przez Spring Boot: „o.h.orm.jdbc.error”), pod własnym aliasem
const PELNE_NAZWY = [[/(?:^|\.)orm\.jdbc\.error$/, "HibernateJdbcError"]];
const krotki = logger => PELNE_NAZWY.find(([re]) => re.test(logger))?.[1] || logger.split(".").pop();

// wartości parametrów jako literały SQL → wstawienie w miejsca parametrów (%(nazwa)s, $1, :nazwa, %s, ?)
function wstaw(sql, par, gotowe = false) {
  if (!Object.keys(par).length) return sql;
  const lit = v => (gotowe || /^-?\d+(\.\d+)?$/.test(v) ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const daj = (a, k) => (par[k] == null ? a : lit(par[k]));
  let i = 0;
  if (/%\(\w+\)s/.test(sql)) return sql.replace(/%\((\w+)\)s/g, (a, k) => daj(a, k));
  if (/\$\d/.test(sql)) return sql.replace(/\$(\d+)/g, (a, k) => daj(a, k));
  if (Object.keys(par).some(k => !/^\d+$/.test(k))) return sql.replace(/(?<![:\w]):(\w+)/g, (a, k) => daj(a, k));
  if (/%s/.test(sql)) return sql.replace(/%s/g, a => daj(a, String(++i)));
  return sql.replace(/\?/g, a => daj(a, String(++i)));
}
// repr Pythona ({'a': 1, 'b': 'x'}, (1, 'x'), [(…)] przy executemany — pierwszy zestaw) → { klucz|nr: literał SQL }
// podział po znaku `zn` na najwyższym poziomie (poza napisami i nawiasami)
function podziel(t, zn = ",", raz = false) {
  const czesci = []; let gl = 0, cud = null, od = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (cud) { if (c === "\\") i++; else if (c === cud) cud = null; continue; }
    if (c === "'" || c === '"') cud = c;
    else if ("([{".includes(c)) gl++;
    else if (")]}".includes(c)) gl--;
    else if (c === zn && gl === 0) { czesci.push(t.slice(od, i)); od = i + 1; if (raz) break; }
  }
  czesci.push(t.slice(od));
  return czesci.map(x => x.trim()).filter(Boolean);
}
const literalPy = v => {
  let m;
  if ((m = /^[bru]?(['"])([\s\S]*)\1$/.exec(v))) return `'${m[2].replace(/\\(['"\\])/g, "$1").replace(/'/g, "''")}'`;
  if (v === "None") return "NULL";
  if (v === "True" || v === "False") return v.toLowerCase();
  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)) return v;
  if ((m = /^(?:Decimal|UUID)\((['"])(.*)\1\)$/.exec(v))) return /^Decimal/.test(v) ? m[2] : `'${m[2]}'`;
  if ((m = /^datetime\.(?:datetime|date)\(([\d, ]+)\)/.exec(v))) {
    const [r, mi, dz, g = 0, mn = 0, s = 0] = m[1].split(",").map(x => Number(x.trim()));
    const p = x => String(x).padStart(2, "0");
    return `'${r}-${p(mi)}-${p(dz)}${/datetime\(/.test(v) ? ` ${p(g)}:${p(mn)}:${p(s)}` : ""}'`;
  }
  return `'${v.replace(/'/g, "''")}'`;
};
export function parametryPy(t) {
  t = t.trim();
  if (!/^[[({]/.test(t)) return {};
  let czesci = podziel(t.slice(1, -1));
  if (t[0] === "[" && /^[({]/.test(czesci[0] || "")) return parametryPy(czesci[0]);   // executemany: pierwszy wiersz
  const par = {};
  if (t[0] === "{") for (const c of czesci) { const [k, v] = podziel(c, ":", true); if (v != null) par[k.replace(/^['"]|['"]$/g, "")] = literalPy(v); }
  else czesci.forEach((c, i) => (par[i + 1] = literalPy(c)));
  return par;
}
// MyBatis: „==> Parameters: 1000(Integer), j2ee(String), null” → literały SQL
const LICZBY_JAVA = /^(Integer|Long|Short|Byte|Double|Float|BigDecimal|BigInteger|Boolean)$/;
function parametryMyBatis(t) {
  const par = {}; let i = 0;
  for (const m of t.matchAll(/(null|[\s\S]*?)\((\w+(?:\[\])?)\)(?:, |$)|null(?:, |$)/g)) {
    if (!m[0]) break;
    const v = m[2] ? m[1] : "null", typ = m[2];
    par[++i] = v === "null" && !typ ? "NULL" : typ && LICZBY_JAVA.test(typ) ? v : `'${v.replace(/'/g, "''")}'`;
  }
  return par;
}
// knex: „[ 1, 'x', 2026-…Z ]” (util.inspect) → $1, $2 …; rekord zamknięty — dalsze linie bez nagłówka to nie SQL
function wiazaniaKnex(q, t) {
  podziel(t).forEach((v, i) => (q.par[i + 1] = v.replace(/^'([\s\S]*)'$/, "$1").replace(/\\'/g, "'")));
  q.zamkniety = true;
}
// pierwsza tabela z SQL (do przypisania repozytorium Spring Data)
const tabelaSql = sql => (/\b(?:from|into|update|join)\s+["`[]?(?:\w+["`\]]?\.)?["`[]?(\w+)/i.exec(sql || "")?.[1]
  || /nextval\s*\(\s*'(?:\w+\.)?(\w+?)(?:_id)?_seq'/i.exec(sql || "")?.[1])?.toLowerCase() || null;   // sekwencja „tabela_seq”
const pojedyncza = w => w.replace(/ies$/, "y").replace(/(ss|x|ch|sh)es$/, "$1").replace(/s$/, "");
const slowaNazwy = n => n.replace(/(Repository|Repo|Dao|DAO)(Impl)?$/, "").replace(/^(SpringData|Jpa|Jdbc|Mongo|R2dbc|Crud)(?=[A-Z])/, "")
  .split(/(?=[A-Z])/).map(x => pojedyncza(x.toLowerCase())).filter(Boolean);

// Reguły: [krótka nazwa loggera (regex), regex treści, akcja]. Kolejność ma znaczenie.
export const REGULY = [
  // .NET: granice requestu (Hosting.Diagnostics), akcja kontrolera, HttpClient, wyjątek nieobsłużony; SQL i transakcje
  // ze sterownika (Npgsql: też Dapper, FromSqlRaw, TransactionScope, rollback przez Dispose), EF Core — gdy sterownik
  // nie loguje (SqlClient)
  [/^Microsoft_AspNetCore_Hosting_Diagnostics$/, /^Request starting HTTP\/[\d.]+ (GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) \w+:\/\/[^/\s]+([^?\s]*)/, "start"],
  [/^Microsoft_AspNetCore_Hosting_Diagnostics$/, /^Request finished HTTP\/[\d.]+ \w+ \S+ - (\d{3})/, "koniec"],
  [/ControllerActionInvoker$/, /^Executing action method ([\w.`+]+)\.(\w+) \(/, "cel"],
  // Razor Pages: metoda handlera strony (OnGet, OnPostAsync…) — klasa wejścia; „implicit handler” to brak handlera
  [/PageActionInvoker$/, /^Executing handler method ([\w.`+]+)\.(\w+) - /, "cel"],
  // ASP.NET Core 8: [101] „Executing action method” jest na Information tylko przy słuchaczu DiagnosticListener (np.
  // OTel) — [102] „Route matched…” i „Executing endpoint” są zawsze
  [/ControllerActionInvoker$/, /^Route matched with \{action = "(\w+)"[^}]*\}\. Executing controller action with signature [\s\S]*? on controller ([\w.`+]+) \(/, "cel_net"],
  [/EndpointMiddleware$/, /^Executing endpoint '([\w.`+]+)\.(\w+) \([\w.]+\)'/, "cel"],
  [/^System_Net_Http_HttpClient_.*_LogicalHandler$/, /^Start processing HTTP request (\w+) (\S+)/, "zew"],
  [/(Kestrel|ExceptionHandlerMiddleware|DeveloperExceptionPageMiddleware|ProblemDetailsMiddleware|Exception\w*Middleware)$/, /unhandled exception[^.]*\.\s*(.+?)(?:\s{2,}at\s|\n|$)/i, "blad"],
  [/^Npgsql_Transaction$/, /^Starting transaction/, "begin"],
  [/^Npgsql_Transaction$/, /^Committed transaction/, "commit_sql"],
  [/^Npgsql_Transaction$/, /^Rolled back transaction/, "rollback_sql"],
  [/^Npgsql_Command$/, /^(Command|Batch) execution completed \(duration=(\d+)ms\):\s*([\s\S]+)$/, "sql_npgsql"],
  [/^Microsoft_EntityFrameworkCore_Database_Command$/, /^(?:Executed|(Failed) executing) DbCommand \((\d+)ms\) \[Parameters=\[([\s\S]*?)\], CommandType='\w+', CommandTimeout='\d+'\]\s*([\s\S]+)$/, "sql_ef"],
  // nieudany zapis (SaveChanges): opis błędu bazy z wyjątku wewnętrznego — dla instrukcji z „Failed executing DbCommand”
  [/^Microsoft_EntityFrameworkCore_Update$/, /---> [\w.]+(?:Exception|Error)(?: \(0x[0-9A-Fa-f]+\))?: (.+?)(?:\s{2,}at\s|\s+--->|$)/, "sql_blad_opis"],
  [/^Microsoft_EntityFrameworkCore_Database_Transaction$/, /^(Began|Committed|Rolled back) transaction/, "ef_tx"],
  [/^Microsoft_EntityFrameworkCore_Database_Transaction$/, /^(Created|Released|Rolled back to) transaction savepoint/, "ef_savepoint"],
  // dowolny middleware wyjątków (Hellang ProblemDetails, własne): komunikat ASP.NET o wyjątku nieobsłużonym
  [/./, /^An unhandled exception has occurred while executing the request\.\s*(.+?)(?:\s{2,}at\s|\n|$)/, "blad"],
  // .NET: nieudane wywołanie HTTP bez logów HttpClient (new HttpClient(), np. health check) — „HttpRequestException: … (host:port)”
  [/./, /HttpRequestException: ([^(]*?)\s*\(([\w.-]+:\d+)\)/, "zew_blad"],
  // granice requestu z logu HTTP: „--> GET /x” / „<-- GET /x 200 12ms” (middleware aplikacji) albo odwrotnie
  // (koa-logger, hono: „<-- GET /x” na wejściu, „--> GET /x 200 12ms” na wyjściu) — początek to linia bez statusu
  [/./, new RegExp(`^(?:-->|<--)\\s+(${METODY})\\s+([^\\s?]+)\\S*\\s*$`), "start"],
  [/./, new RegExp(`^(?:<--|-->|xxx)\\s+(?:${METODY})\\s+([^\\s?]+)\\S*\\s+(\\d{3})`), "koniec_http"],
  [/^ExceptionsHandler$/, /^(.+)$/, "blad"],
  // pino: koniec requestu bez linii początku (reqId nieznany) i błąd (level ≥ 50 z err)
  [/^pino$/, /^request completed (\d{3})/, "koniec"],
  [/^pino$/, /^błąd ([\s\S]+)$/, "blad_json"],
  // MikroORM w loggerze Nesta: „[query] begin|commit|rollback”, „[query] SQL [took 1 ms, 3 results]” (wartości wstawione)
  [/^MikroORM$/, /^\[query\]\s+(begin|commit|rollback)\b/i, "sql_tx"],
  [/^MikroORM$/, /^\[query\]\s+([\s\S]+?)(?:\s+\(via \w+ connection '[^']*'\))?(?:\s+\[took (\d+(?:\.\d+)?) ms[^\]]*\])?\s*$/, "sql_ms"],
  // TypeORM: transakcja i SQL jako „query: …” (parametry w JSON na końcu)
  [/^TypeORM$/, /^query:\s+(START TRANSACTION|BEGIN(?: TRANSACTION)?)\s*$/i, "begin"],
  [/^TypeORM$/, /^query:\s+COMMIT\s*$/i, "commit_sql"],
  [/^TypeORM$/, /^query:\s+ROLLBACK\s*$/i, "rollback_sql"],
  [/^TypeORM$/, /^query:\s+([\s\S]+?)(?:\s+--\s+PARAMETERS:\s+(\[[\s\S]*\]))?$/, "sql_json"],
  // błąd instrukcji: „query failed: SQL -- PARAMETERS: […]”, potem „error: <wyjątek sterownika>” (stos w kolejnych liniach)
  [/^TypeORM$/, /^query failed:\s+([\s\S]+?)(?:\s+--\s+PARAMETERS:\s+(\[[\s\S]*\]))?$/, "sql_blad"],
  [/^TypeORM$/, /^error:\s+(?:error:\s+)?(.+)/, "sql_blad_opis"],
  // Prisma: „prisma:query SQL” (BEGIN/COMMIT jako SQL), parametry w osobnej linii „params: […]” zależnie od konfiguracji
  [/^Prisma$/, /^prisma:query\s+(BEGIN|START TRANSACTION)\b/i, "begin"],
  [/^Prisma$/, /^prisma:query\s+COMMIT\b/i, "commit_sql"],
  [/^Prisma$/, /^prisma:query\s+ROLLBACK\b/i, "rollback_sql"],
  [/^Prisma$/, /^prisma:query\s+([\s\S]+?)(?:\s+--\s*params:\s*(\[[\s\S]*?\]))?(?:\s+\(\d+(?:\.\d+)?\s*ms\))?$/, "sql_json"],
  [/^knex$/, /^knex:query\s+(BEGIN|COMMIT|ROLLBACK)\b/i, "knex_tx"],
  [/^knex$/, /^knex:query\s+([\s\S]+?)(?:\s+(?:undefined|trx\d+))?$/, "sql"],
  // długa lista (util.inspect) w wielu liniach: „knex:bindings [”, wartości z wcięciem, „] trx8” — reszta to ciąg dalszy
  [/^knex$/, /^knex:bindings\s+\[([\s\S]*?)(\]\s*(?:undefined|trx\d+)?)?\s*$/, "param_lista"],
  // Express: router loguje „dispatching” w każdym zagnieżdżonym routerze; w Express 4 (express:router) request
  // otwiera warstwa expressInit aplikacji (jest tylko w głównym routerze)
  [/^(?:express:)?router$/, /^dispatching\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+([^\s?]+)/, "start_router"],
  [/^express:router$/, /^expressInit\s+:\s+([^\s?]+)/, "express_init"],
  [/^koa-router$/, new RegExp(`^(${METODY})\\s+([^\\s?]+)\\S*\\s*$`), "start"],
  [/^morgan$/, /^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+([^\s?]+)\S*\s+(\d{3})\b/, "koniec_http"],
  [/^winston$/, new RegExp(`^(${METODY})\\s+([^\\s?]+)\\S*\\s+(\\d{3})\\b`), "koniec_dostep"],
  [/^DispatcherServlet$/, /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS) "([^"?]*)/, "start"],
  [/^JobRunShell$/, /^Calling execute on job ([\w.$-]+)/, "job"],
  [/^DispatcherServlet$/, /^Completed (\d{3})/, "koniec"],
  [/^DispatcherServlet$/, /^Failed to complete request:?\s*(.*)/, "koniec_blad"],       // wyjątek nieobsłużony → 500
  [/^RequestMappingHandlerMapping$/, /^Mapped to ([\w.$]+)#(\w+)\(/, "cel"],
  [/HandlerExceptionResolver$/, /^Resolved \[?([\w.$]+(?:Exception|Error)[^\]]*)/, "blad"],
  // SimpleMappingExceptionResolver z warnLogCategory: „Resolved [X…]” z loggera o dowolnej nazwie (na WARN), a widok błędu
  // z modelem wyjątku loguje DispatcherServlet
  [/./, /^Resolved \[([\w.$]+(?:Exception|Error)[^\]]*)/, "blad_warn"],
  [/^DispatcherServlet$/, /^Using resolved error view: [\s\S]*?\bexception=([\w.$]+(?:Exception|Error)[^,}\]]*)/, "blad"],
  // Stripes: wyjątek z ActionBeana (stos w kolejnych liniach — pierwsza to „klasa wyjątku: komunikat”)
  [/^DefaultExceptionHandler$/, /^(Unhandled exception[\s\S]*)$/, "blad_stos"],
  [/^TransactionInterceptor$/, /^Getting transaction for \[([\w.$]+)\.(\w+)\]/, "in"],
  [/^TransactionInterceptor$/, /^Completing transaction for \[([\w.$]+)\.(\w+)\](?: after exception: (.*))?/, "out"],
  // metoda bez transakcji (@Query bez @Transactional, fragment …Impl): sam początek — koniec przy następnej linii
  // interceptora/menedżera transakcji na tym wątku albo z końcem requestu; SQL pomiędzy należy do niej
  [/^TransactionInterceptor$/, /^No need to create transaction for \[([\w.$]+)\.(\w+)\]/, "in_bez_tx"],
  [/^(CacheAspectSupport|CacheInterceptor)$/, /^Cache entry for key '[\s\S]*' found in cache/, "cache_hit"],
  [/TransactionManager$/, /^Creating new transaction with name \[(?:([\w.$]+)\.(\w+)|[^\]]*)\]/, "begin"],
  [/TransactionManager$/, /^Suspending current transaction, creating new transaction with name \[(?:([\w.$]+)\.(\w+)|[^\]]*)\]/, "begin"],
  [/TransactionManager$/, /^Committing (?:JPA|JDBC|Hibernate)? ?transaction/, "commit"],
  [/TransactionManager$/, /^Rolling back (?:JPA|JDBC|Hibernate)? ?transaction/, "rollback"],
  // koniec transakcji: EntityManager zamknięty albo — przy Open Session in View — zostawiony do końca requestu
  [/TransactionManager$/, /^(?:Closing JPA EntityManager|Releasing JDBC Connection|Not closing pre-bound JPA EntityManager)\b.* after transaction/, "po_tx"],
  [/^SQL$/, /^([\s\S]*)$/, "sql"],
  // EclipseLink (FINE): SQL, w następnej linii „bind => [wartości]”
  [/^EclipseLink$/, /^\s*((?:SELECT|INSERT|UPDATE|DELETE|WITH|CALL|MERGE)\b[\s\S]*?)(?:\s+bind => \[([\s\S]*)\])?\s*$/, "sql_el"],                                                 // org.hibernate.SQL (format_sql: SQL od nowej linii)
  // błąd instrukcji Hibernate'a: „HHH000247: ErrorCode: 0, SQLState: 23503” (Hibernate 7, org.hibernate.orm.jdbc.error)
  // albo „SQL Error: 0, SQLState: 23503” (5/6, SqlExceptionHelper), w następnej linii tego loggera komunikat bazy
  [/^(HibernateJdbcError|SqlExceptionHelper)$/, /^(?:HHH\d+: )?(?:ErrorCode|SQL Error): -?\d+, SQLState: (\w+)/, "sql_blad_stan"],
  [/^(HibernateJdbcError|SqlExceptionHelper)$/, /^(?!(?:HHH\d+: )?(?:SQL )?Warning)(\S[\s\S]*)$/i, "sql_blad_opis"],
  [/^JdbcTemplate$/, /^Executing (?:prepared )?SQL (?:statement|query|update|batch update)(?: of)? \[([\s\S]+?)\]?$/, "sql"],
  [/^(?:bind|BasicBinder)$/, /^binding parameter (?:\((\d+):\w+\) <- \[|\[(\d+)\] as \[\w+\] - \[)([\s\S]*)\]$/, "param"],
  [/^(RestTemplate|DefaultRestClient|WebClient|ExchangeFunctions)$/, /^HTTP (GET|POST|PUT|DELETE|PATCH|HEAD) (\S+)/, "zew"],
  [/^StatementCreatorUtils$/, /^Setting SQL statement parameter value: column index (\d+)()?, parameter value \[([\s\S]*?)\], value class/, "param"],
  // MyBatis: logger = przestrzeń mappera + id instrukcji
  [/./, /^==>\s+Preparing:\s+([\s\S]+)$/, "mybatis_sql"],
  [/./, /^==>\s+Parameters:\s*([\s\S]*)$/, "mybatis_param"],
  [/./, /^<==\s+(?:Total|Updates):\s*\d+/, "mybatis_koniec"],
  [/^DispatcherHelper$/, /^Resolved event: (\w+); will invoke: ([\w$]+)\.(\w+)\(\)/, "stripes"],
  // Python: SQLAlchemy (sqlalchemy.engine.Engine; parametry w kolejnej linii), Django (django.db.backends: czas, SQL
  // z wartościami, „; args=…; alias=…”), django_structlog, access log uvicorn / werkzeug / django.server
  [/^Engine$/, /^(BEGIN|COMMIT|ROLLBACK)(?: \(implicit\))?\s*$/, "sql_tx"],
  [/^Engine$/, /^\[(?:generated in|cached since|raw sql|no key|dialect|insertmanyvalues|SQL parameters)[^\]]*\]\s*([\s\S]*)$/, "param_py"],
  [/^Engine$/, /^([[({][\s\S]*[\])}])\s*$/, "param_py"],                           // SQLAlchemy < 1.4: same parametry
  [/^Engine$/, /^([\s\S]*)$/, "sql"],                                              // tekst() z nową linią na początku
  // „ROLLBACK TO SAVEPOINT …” to nie koniec transakcji — idzie jako SQL (savepoint rozpoznaje przebieg.mjs)
  [/^backends$/, /^\([\d.]+\)\s+(BEGIN|COMMIT|ROLLBACK)(?!\s+TO\b)\b/, "sql_tx"],
  // surowy SQL z nowej linii („(0.004) ” i dalej linie z wcięciem, na końcu „; args=…; alias=…”) — doklejany jako ciąg dalszy
  [/^backends$/, /^\(([\d.]+)\)(?:\s+([\s\S]*))?$/, "sql_django"],
  // Celery przez django_structlog.celery.receivers: task_enqueued (wysłanie do kolejki z wątku wołającego), task_started
  // (początek zadania w workerze), task_succeeded / task_retrying / task_failed (koniec)
  [/^receivers$/, /['"]event['"]: ['"](task_(?:enqueued|started|succeeded|retrying|failed|revoked|rejected|unknown|not_found))['"]/, "celery"],
  [/^request$/, new RegExp(`^(?=[\\s\\S]*['"]event['"]: ['"]request_started['"])[\\s\\S]*?['"]request['"]: ['"](${METODY}) ([^'"?\\s]*)`), "start"],
  [/^request$/, /^(?=[\s\S]*['"]event['"]: ['"]request_(?:finished|failed)['"])[\s\S]*?['"]code['"]: (\d{3})/, "status_po"],
  // klient HTTP Pythona — wywołanie innego systemu, nie linia dostępu: urllib3 (requests) „http://host:port "POST /x
  // HTTP/1.1" 202 17” (po odpowiedzi), httpx „HTTP Request: GET http://host/x "HTTP/1.1 200 OK"”
  [/^connectionpool$/, new RegExp(`^(https?://[^\\s"]+) "(${METODY}) ([^\\s"]+) HTTP\\/[\\d.]+" \\d{3}`), "zew_urllib3"],
  [/^(httpx|_client)$/, new RegExp(`^HTTP Request: (${METODY}) (\\S+) "HTTP\\/`), "zew"],
  [/./, new RegExp(`"(${METODY}) ([^\\s"?]+)[^\\s"]* HTTP\\/[\\d.]+" (\\d{3})\\b`), "koniec_dostep"],
  // walidacja argumentu w Springu (BindingResult w treści) — przy 400 bez kroków w środku kontroler się nie wykonał
  [/./, /Field error in object '[\w$]+' on field '|Validation failed for argument \[\d+\]/, "walidacja"],
];
const WALIDACJA = /MethodArgumentNotValid|BindException|HandlerMethodValidation|MissingServletRequest|MethodArgumentTypeMismatch|HttpMessageNotReadable/;

// .NET: zakresy przed treścią („=> SpanId:…, TraceId:…, ParentId:… => ConnectionId:… => RequestPath:/x RequestId:…
// => Ns.Klasa.Metoda (Asm) => HTTP POST url”). Wątek = RequestId (bez niego: Request id z treści, inaczej „main”).
// Razor Pages: zakres strony „=> /Basket/Index”; view component i zakresy bez własnego ToString (nazwa typu): „=> Ns.Klasa”
// bez „(Asm)” — pełna nazwa (komponent z mapy: krok InvokeAsync)
export function zakresyDotnet(tekst) {
  let r = tekst.replace(/^\s+/, ""), watek = null, akcja = null, strona = null, komponent = null, trace = null, rodzic = null;
  while (r.startsWith("=> ")) {
    r = r.slice(3);
    let m;
    if ((m = /^SpanId:\S+, TraceId:(\w+), ParentId:(\w+)\s*/.exec(r))) { trace = m[1]; rodzic = /^0+$/.test(m[2]) ? null : m[2]; r = r.slice(m[0].length); }
    else if ((m = /^ConnectionId:\S+\s*/.exec(r))) r = r.slice(m[0].length);
    else if ((m = /^RequestPath:\S* RequestId:(\S+)\s*/.exec(r))) { watek = m[1]; r = r.slice(m[0].length); }
    else if ((m = /^([\w.`+<>]+)\.(\w+) \([\w.]+\)\s*/.exec(r))) { akcja = [m[1], m[2]]; r = r.slice(m[0].length); }
    else if ((m = /^HTTP \w+ \S+\s*/.exec(r))) r = r.slice(m[0].length);
    else if ((m = /^(\/\S*)\s+/.exec(r))) { strona = m[1]; r = r.slice(m[0].length); }
    else if (r.indexOf(" => ") < 0 && (m = /^([A-Za-z_][\w`+<>]*(?:\.[\w`+<>]+)+)\s+/.exec(r))) { komponent = m[1]; r = r.slice(m[0].length); }
    else { const i = r.indexOf(" => "); if (i < 0) break; r = r.slice(i + 1); }
  }
  watek ||= /Request id "([^"]+)"/.exec(r)?.[1] || "main";
  return { watek, akcja, tekst: r.trim(), ...(strona ? { strona } : {}), ...(komponent ? { komponent } : {}), ...(trace ? { trace } : {}), ...(rodzic ? { rodzic } : {}) };
}

const METODY_CRUD = /^(save|saveAll|saveAndFlush|saveAllAndFlush|findById|findAll|findAllById|existsById|count|delete|deleteById|deleteAll|deleteAllById|deleteAllInBatch|deleteInBatch|flush|getById|getOne|getReferenceById|findOne|exists)$/;

// Stan per wątek → zdarzenia diag {ev, kor, w, ts, …}
// job ma znany start, a w środku bywają długie wywołania; praca „w tle” w otwartej transakcji (hashowanie hasła, wywołanie
// bez logu przed COMMIT) też czeka dłużej
export const PRZERWA = 300, PRZERWA_JOBA = 5000;
const PULA = /worker|pool|executor|^asyncio_\d+$/i, OKNO_PULI = 15;  // wątek z puli; ostatnia praca przed linią dostępu
const OKNO_PO_ODP = 50;                                  // wyjątek po odpowiedzi (uvicorn) najpóźniej tyle po linii dostępu
export class LogAplikacji {
  // mapa (opcjonalnie): nazwa joba Quartz („DEFAULT.eventRetryJob”) → klasa z mapy („…EventRetryJob”); klasy po krótkiej
  // nazwie (ActionBean Stripes), interfejsy repozytoriów (Spring Data)
  constructor({ mapa = null } = {}) {
    this.watki = new Map(); this.kory = 0; this.ost = null; this.mapa = mapa;
    this.lar = null; this.larBegin = null; this.larTx = []; this.pidW = new Map(); this.larBeginPid = new Map();
    this.klasyJobow = new Map(); this.krotkie = new Map(); this.repozytoria = []; this.fragmenty = []; this.phpDostep = [];
    this.pliki = new Map();                                                 // plik źródłowy → klasy / moduły z mapy (stos Pythona)
    for (const [fqn, k] of Object.entries(mapa?.klasy || {})) {
      const n = fqn.split(/[.$]/).pop();
      const pl = /^(.+?)(?::(\d+))?$/.exec(String(k.plik || ""));
      if (pl && k.metody?.length) { if (!this.pliki.has(pl[1])) this.pliki.set(pl[1], []); this.pliki.get(pl[1]).push({ fqn, linia: Number(pl[2]) || 0, metody: k.metody, modul: !!k.modul }); }
      this.klasyJobow.set(n[0].toLowerCase() + n.slice(1), { fqn, metoda: k.metody?.length === 1 ? k.metody[0] : "execute" });
      if (!this.krotkie.has(n)) this.krotkie.set(n, fqn);
      // tabele: z mapy, gdy ją zna (encja repozytorium → @Table), inaczej słowa nazwy wobec nazwy tabeli
      if (k.rola === "repozytorium" && k.interfejs) this.repozytoria.push({ fqn, metody: k.metody || [], slowa: slowaNazwy(n), springData: /^(SpringData|Jpa|Jdbc|Crud)|(Jpa|Jdbc|Crud|Mongo)Repository$/.test(n), tabele: [k.tabele || []].flat().map(t => String(t).toLowerCase().split(".").pop()) });
      // fragment Spring Data („…RepositoryImpl” obok interfejsu): jego metody wykonują się zamiast SimpleJpaRepository
      if (k.rola === "repozytorium" && !k.interfejs && /Impl$/.test(n)) this.fragmenty.push({ fqn, metody: k.metody || [], baza: fqn.replace(/Impl$/, "") });
    }
  }

  // Spring Data: TransactionInterceptor podaje klasę docelową proxy (SimpleJpaRepository), nie interfejs aplikacji —
  // interfejs z mapy po metodzie (zadeklarowanej tylko w nim) albo po tabeli pierwszego SQL w tym wywołaniu
  // (wszystkie: SQL całego wywołania — gdy tabel jest kilka, np. delete z kaskadą, rozstrzyga nazwa metody wołającej)
  repozytorium(metoda, sql, { wolajacy = null, wszystkie = null } = {}) {
    // metody CrudRepository/PagingAndSorting są w każdym repozytorium (dziedziczone) — o wyborze decyduje tabela
    const zMetoda = METODY_CRUD.test(metoda) ? [] : this.repozytoria.filter(r => r.metody.includes(metoda));
    if (zMetoda.length === 1) return this.fragment(zMetoda[0].fqn, metoda);
    const pula = zMetoda.length ? zMetoda : this.repozytoria;
    const wybor = [...new Set((wszystkie || [sql]).map(tabelaSql).filter(Boolean))].map(t => this.poTabeli(pula, t)).filter(Boolean);
    let naj = wybor[0] || null;
    if (new Set(wybor).size > 1 && wolajacy) {
      const sw = slowaNazwy(wolajacy[0].toUpperCase() + wolajacy.slice(1));
      const z = [...new Set(wybor)].filter(f => this.repozytoria.find(r => r.fqn === f).slowa.every(x => sw.includes(x)));
      if (z.length === 1) naj = z[0];
    }
    return naj && this.fragment(naj, metoda);
  }
  fragment(fqn, metoda) { return this.fragmenty.find(f => f.baza === fqn && f.metody.includes(metoda))?.fqn || fqn; }
  poTabeli(pula, t) {
    const slowaT = t.split(/_+/).map(pojedyncza);
    let naj = null, ocena = 0;
    for (const r of pula) {
      // tabela z mapy; słowa nazwy repozytorium w nazwie tabeli; nazwa tabeli krótsza niż encja (@Table: PetType → types)
      const o = r.tabele.includes(t) ? 2 : !r.slowa.length ? 0 : r.slowa.every(x => slowaT.includes(x)) ? r.slowa.length / slowaT.length
        : slowaT.every(x => r.slowa.includes(x)) ? slowaT.length / r.slowa.length / 4 : 0;
      if (!o) continue;
      const oc = o + (r.springData ? 0.5 : 0);
      if (oc > ocena) { naj = r.fqn; ocena = oc; } else if (oc === ocena) naj = null;    // remis — nie zgadujemy
    }
    return naj;
  }

  // przebiegi „w tle” (job, wątek bez requestu) kończymy ciszą na wątku — wołane przy każdej linii i co chwilę; na końcu
  // pliku (Infinity) zamykamy wszystko, co otwarte (request bez linii końca, np. Express bez morgana)
  domknij(teraz, tylko = null) {
    const wynik = [];
    if (this.dostepCzeka && teraz - this.dostepCzeka.ts > PRZERWA) { const dc = this.dostepCzeka; this.dostepCzeka = null; wynik.push(...this.dostepBezPracy(dc)); }
    if (this.lar && !tylko && teraz - this.lar.ts > 2000) { const z = this.lar; this.lar = null; wynik.push(...this.zalegla(z)); }
    if (this.typeorm && !tylko && teraz - this.typeorm.ts > PRZERWA) wynik.push(...this.typeormZalegly());
    for (const [w, s] of this.watki) {
      if (tylko && w !== tylko) continue;
      const wszystko = teraz === Infinity && !s.lar;
      if (!s.kor || !(s.wTle || s.poKoncu || wszystko) || teraz - s.ostTs <= (s.job || s.wTle && s.tx.length ? PRZERWA_JOBA : PRZERWA)) continue;
      if (s.wstrzym) { wynik.push(...s.wstrzym); s.wstrzym = null; }
      wynik.push(...this.sqlZalegle(s, w));
      const reszta = { ...(s.poKoncu || {}), ...(s.blad ? { blad: s.blad } : {}) };
      s.blad = null;
      if (s.wejscie?.sciezka) s.zamkniety = { sciezka: s.wejscie.sciezka, ts: s.ostTs, klucz: null };
      if (!s.stos.length && s.wejscie?.sciezka) {
        wynik.push(this.zd(s, w, s.startTs ?? s.ostTs, "in", { klasa: "http", metoda: s.wejscie.sciezka, wejscie: s.wejscie }));
        s.stos.push({ klasa: "http", metoda: s.wejscie.sciezka });
      }
      while (s.stos.length) { const r = s.stos.pop(); if (r.pomin) continue; wynik.push(this.zd(s, w, s.ostTs, "out", { klasa: r.klasa, metoda: r.metoda, ...(s.stos.length ? {} : reszta) })); }
      Object.assign(s, { kor: null, wejscie: null, tx: [], wTle: false, job: false, odlozone: [], tloZd: null, poKoncu: null, walidacja: false, mybatis: null, czekaTx: null, zPuli: false, komponent: null, trace: null });
    }
    return wynik;
  }

  stan(w) {
    if (!this.watki.has(w)) this.watki.set(w, { kor: null, stos: [], sql: null, wejscie: null, tx: [], odlozone: [] });
    return this.watki.get(w);
  }
  zd(s, w, ts, ev, reszta = {}) { return { v: 1, ts, pid: "app", w, kor: s.kor, ev, ...reszta }; }
  // praca wątku z puli przejmowana przez linię dostępu: wątek bywa wcześniej zajęty czymś innym (zadanie po odpowiedzi
  // poprzedniego requestu — BackgroundTasks) — przerwa > OKNO_PULI poza transakcją oddziela tamtą pracę (zostaje „w tle”)
  // od requestu; wstrzymane zdarzenia dzielimy na dwa przebiegi
  podzielTlo(s, w) {
    const zd = s.wstrzym;
    if (!zd || zd[0] !== s.tloZd || s.stos.length !== 1) return;
    let gl = 0, ciecie = -1;
    for (let i = 1; i < zd.length; i++) {
      const z = zd[i - 1];
      if (z.ev === "tx") gl = Math.max(0, gl + (z.faza === "begin" ? 1 : -1));
      if (gl === 0 && i > 1 && zd[i].ts - z.ts > OKNO_PULI) ciecie = i;
    }
    if (ciecie < 0) return;
    const przed = zd.slice(0, ciecie), po = zd.slice(ciecie), r = s.stos[0];
    // tamta praca zaczęła się tuż po odpowiedzi requestu bez własnej pracy (202 + BackgroundTasks) — to jego praca po
    // odpowiedzi (jak w OTel: pod korzeniem requestu, po jego końcu), nie osobny przebieg „w tle”
    const dalej = przed.slice(1), t0 = dalej[0]?.ts;
    const bp = (this.bezPracy || []).findLast(b => b.w === s.dostepW && b.ts <= t0);
    const poOdp = bp && t0 - bp.ts <= OKNO_PULI;
    if (poOdp) for (const z of dalej) z.kor = bp.kor;
    const out = this.zd(s, w, przed.at(-1).ts, "out", { klasa: r.klasa, metoda: r.metoda });
    s.kor = `a-${++this.kory}`; s.wejscie = { rodzaj: "w tle", nazwa: `w tle · ${w}` };
    const nowy = { klasa: r.klasa, metoda: r.metoda };
    nowy.zd = this.zd(s, w, po[0].ts - 0.001, "in", { ...nowy, wejscie: s.wejscie });
    for (const z of po) z.kor = s.kor;
    s.stos[0] = nowy; s.tloZd = nowy.zd; s.wstrzym = [...(poOdp ? dalej : [...przed, out]), nowy.zd, ...po];
  }

  // praca „w tle” otwarta poza linią z regułą (traceback): zdarzenia wstrzymane, aż wiadomo, czy to request
  otworzTlo(s, w, ts) {
    Object.assign(s, { kor: `a-${++this.kory}`, wejscie: { rodzaj: "w tle", nazwa: `w tle · ${w}` }, korzen: null, blad: null, ostSql: null, wTle: true, ostTs: ts });
    const r = { klasa: `wątek ${w}`, metoda: "praca" };
    r.zd = this.zd(s, w, ts, "in", { ...r, wejscie: s.wejscie });
    s.stos.push(r); s.tloZd = r.zd; s.wstrzym = [...(s.wstrzym || []), r.zd];
  }

  // zamknij zaległe SQL (parametry przychodzą w kolejnych liniach)
  sqlZalegle(s, w) {
    if (!s.sql) return [];
    const q = s.sql; s.sql = null;
    if (q.nawias) q.sql = q.sql.replace(/\]\s*$/, "");
    if (q.django) q.sql = q.sql.replace(/;\s*args=[\s\S]*$/, "").trim();
    if (!q.sql.trim()) return [];
    return [this.zd(s, w, q.ts, "sql", { sql: wstaw(q.sql.trim(), q.par, q.lit), ms: q.ms || 0, ...(q.flush ? { flush: true } : {}) })];
  }

  linia(l) {
    // stos wyjątku .NET skończony (pierwsza linia, która nie jest ramką „   at …”) — kroki z ramek
    if (this.tbNet && !RAMKA_NET.test(l)) { const tb = this.tbNet; this.tbNet = null; return [...this.zeStosuPy(tb, tb.wyjatek, x => x), ...this.linia(l)]; }
    // traceback Pythona przerwany nową linią z nagłówkiem (bez linii wyjątku) — kroki z ramek bez błędu
    if (this.tb && naglowek(l.replace(KOLEKTOR, "")) && !/^\s/.test(l)) { const tb = this.tb; this.tb = null; return [...this.zeStosuPy(tb, null), ...this.liniaWew(l)]; }
    return this.liniaWew(l);
  }

  // Python: traceback po linii błędu (logger.exception) — ramki z plików projektu (klasy i funkcje modułów z mapy)
  // to łańcuch wywołań do miejsca wyjątku; kroki bez czasów, błąd na najgłębszym
  ramkaPy({ plik, linia, fn }) {
    if (fn.startsWith("<")) return null;                                   // <lambda>, <module>, <listcomp>
    for (const [p, wpisy] of this.pliki) {
      if (plik !== p && !plik.endsWith("/" + p)) continue;
      const z = wpisy.filter(x => x.metody.includes(fn));
      const k = z.filter(x => !x.modul && x.linia <= linia).sort((a, b) => b.linia - a.linia)[0] || z.find(x => x.modul) || z[0];
      if (k) return { klasa: k.fqn, metoda: fn };
    }
    return null;
  }
  // .NET: ramka „   at Ns.Klasa`2.Metoda[T](…) in /src/…cs:line N” (async bez nowego runtime: „Ns.Klasa.<Metoda>d__5.MoveNext()”)
  // → krok klasy z mapy, gdy ma tę metodę; ramki frameworka i lambdy pomijamy
  ramkaNet(cls, met) {
    const a = /^(.+)\.<(\w+)>d__\d+$/.exec(cls);
    if (a && met === "MoveNext") [cls, met] = [a[1], a[2]];
    cls = cls.replace(/`\d+/g, "");
    return this.mapa?.klasy?.[cls]?.metody?.includes(met) ? { klasa: cls, metoda: met } : null;
  }
  zeStosuPy(tb, wyjatek, ramka = r => this.ramkaPy(r)) {
    const { s, w, ts } = tb;
    if (!s.kor) return [];
    const otwarte = new Set(s.stos.map(r => `${r.klasa}.${r.metoda}`));
    s.tbKroki ||= new Set();
    if (s.tbKor !== s.kor) { s.tbKor = s.kor; s.tbKroki.clear(); }
    const ramki = tb.ramki.map(ramka).filter(r => r && !otwarte.has(`${r.klasa}.${r.metoda}`));
    // ten sam łańcuch w drugim tracebacku (wyjątek zalogowany drugi raz wyżej) — bez powtórek
    if (!ramki.length || ramki.every(r => s.tbKroki.has(`${r.klasa}.${r.metoda}`))) return [];
    ramki.forEach(r => s.tbKroki.add(`${r.klasa}.${r.metoda}`));
    // korzeń requestu jeszcze nie wysłany (wysyła go koniec requestu) — najpierw on, żeby kroki były pod nim
    const korzen = !s.stos.length && s.wejscie?.sciezka ? [this.zd(s, w, s.startTs ?? ts, "in", { klasa: "http", metoda: s.wejscie.sciezka, wejscie: s.wejscie })] : [];
    if (korzen.length) s.stos.push({ klasa: "http", metoda: s.wejscie.sciezka });
    const zd = [...korzen, ...ramki.map((r, i) => this.zd(s, w, ts + i * 0.0001, "in", r)),
      ...ramki.map((r, i) => i).reverse().map(i => this.zd(s, w, ts + ramki.length * 0.0001 + (ramki.length - i) * 0.0001, "out", { ...ramki[i], ...(i === ramki.length - 1 && wyjatek ? { blad: wyjatek.slice(0, 300) } : {}) }))];
    if (s.czekaTx) s.czekaTx.ts = Math.max(s.czekaTx.ts, zd.at(-1).ts);     // request czeka na koniec — po krokach z ramek
    if (s.wstrzym) { s.wstrzym.push(...zd); return []; }
    return zd;
  }

  liniaWew(l) {
    // Payara (ODL): rekord do „|#]” — linie w środku to treść, nawet gdy wyglądają jak nagłówek
    if (this.lar?.otwarty) {
      const t = l.replace(ANSI, ""), k = /\|#\]\s*$/.test(t);
      this.lar.tekst += "\n" + t.replace(/\|#\]\s*$/, "");
      if (!k) return [];
      const z = this.lar; this.lar = null; z.otwarty = false;
      return this.liniaInna(null, z);
    }
    let n = this.naglowekKolektora(l);
    if (n?.ciagDalszy != null) { l = n.ciagDalszy; n = null; }
    // TypeORM, Prisma: SQL w wielu liniach (CTE, zapytanie z kodu, $queryRaw) — linie bez nagłówka z wcięciem albo „)”
    // doklejamy do otwartego „query:” / „query failed:” / „prisma:query”; rekord kończy linia z parametrami („--
    // PARAMETERS:” TypeORM, „-- params: […]” albo czas „(N ms)” Prismy) albo pierwsza linia, która nie jest ciągiem dalszym
    if (!n && this.typeorm && /^[\s)]/.test(l) && l.trim()) {
      this.typeorm.tekst += "\n" + l.replace(ANSI, "").trimEnd();
      return KONIEC_REKORDU_SQL.test(l) ? this.typeormZalegly() : [];
    }
    const zaleglyTo = this.typeormZalegly();
    if ((n?.logger === "TypeORM" && /^query(?: failed)?:/.test(n.tekst) || n?.logger === "Prisma" && /^prisma:query\b/.test(n.tekst)) && !KONIEC_REKORDU_SQL.test(n.tekst)) { this.typeorm = n; return zaleglyTo; }
    if (zaleglyTo.length) return [...zaleglyTo, ...this.liniaWew2(l, n)];
    return this.liniaWew2(l, n);
  }
  typeormZalegly() {
    if (!this.typeorm) return [];
    const n = this.typeorm; this.typeorm = null;
    return this.liniaInna(null, n);
  }

  liniaWew2(l, n) {
    // Laravel: wiadomość bywa w wielu liniach (SQL z \n, stos wyjątku) — przetwarzamy ją przy następnym nagłówku
    // (ciąg dalszy tylko, gdy kontekst JSON jeszcze się nie domknął — inne linie, np. baner serwera, to nie ciąg dalszy)
    if (!n && this.lar && (this.lar.dotnet ? /^\s/.test(l) : !kompletna(this.lar.tekst))) { if (l.trim()) this.lar.tekst += (this.lar.dotnet ? " " : "\n") + l.trim(); return []; }
    // access log `php -S` (Kanboard): tylko status i metoda dla bloku żądania — nie przerywa wiadomości w wielu liniach
    if (n?.logger === "php-serwer") { this.phpDostep.push(n); if (this.phpDostep.length > 200) this.phpDostep.shift(); return []; }
    const zalegla = n && this.lar ? this.zalegla(this.lar) : [];
    if (n) this.lar = null;
    if (n?.logger === "laravel") { this.lar = { ...n }; return zalegla; }
    if (n?.logger === "kanboard") { this.ost = null; return [...zalegla, ...this.kanboard(n)]; }
    // .NET w domyślnym układzie: nagłówek bez treści, treść (z zakresami) w liniach z wcięciem
    if (n?.dotnet && !n.tekst.trim()) { this.lar = { ...n }; return zalegla; }
    if (n?.otwarty) { this.lar = { ...n }; return zalegla; }
    if (n?.dotnet) Object.assign(n, zakresyDotnet(n.tekst));
    if (zalegla.length) return [...zalegla, ...this.liniaInna(l, n)];
    return this.liniaInna(l, n);
  }

  // Prefiks czasu kolektora logów (`docker logs -t`, Kubernetes, journald w RFC 3339 z ułamkiem): chwila odbioru linii,
  // dokładniejsza niż znacznik aplikacji z dokładnością do sekundy (Nest, Laravel, Express 4) albo jego brak (TypeORM,
  // Prisma). Linia bez nagłówka za prefiksem = ciąg dalszy wiadomości (stos, SQL w wielu liniach).
  naglowekKolektora(l) {
    const k = KOLEKTOR.exec(l);
    if (!k) return naglowek(l);
    const reszta = l.slice(k[0].length), n = naglowek(reszta);
    if (!n) return naglowek(l) || { ciagDalszy: reszta };
    const ts = Date.parse(k[1] + k[3]) + Number(`0.${k[2] || "0"}`);   // ułamek poniżej milisekundy (ns) zachowujemy
    if (Number.isFinite(ts) && (n.przyblizone || n.ts == null)) { n.ts = ts; ostatniCzas = ts; poLinii = 0; n.dokladny = true; czasZLogu = true; }
    return n;
  }

  zalegla(z) {
    if (z.odl) return this.liniaInna(null, { ...z, otwarty: false });
    if (!z.dotnet) return this.laravel(z);
    return this.liniaInna(null, { ...z, ...zakresyDotnet(z.tekst) });
  }

  // linia dostępu bez wątku (werkzeug przy korelacji po trace_id): ostatnio aktywny otwarty przebieg tej ścieżki albo „w tle”
  watekDostepu(sciezka) {
    let naj = null;
    for (const [w, s] of this.watki) if (s.kor && (s.wejscie?.sciezka === sciezka || s.tloZd) && (!naj || s.ostTs > naj[1].ostTs)) naj = [w, s];
    return naj?.[0];
  }
  // linia dostępu na wątku pętli zdarzeń (uvicorn.access na MainThread), a request wykonał się w puli wątków (endpoint
  // synchroniczny FastAPI/Starlette: „AnyIO worker thread”, ThreadPoolExecutor, domyślny executor asyncio): wątek
  // dostępu nie ma nic otwartego — request to praca „w tle” wątku z puli, aktywna tuż przed linią (≤ OKNO_PULI ms;
  // dalej to już coś innego: request, który czeka na wywołanie samej aplikacji, albo zadanie po odpowiedzi).
  // Wątki z nazwą jednego requestu (Django runserver „Thread-N”) logują dostęp same — ich pracy nie przejmujemy.
  watekRoboczy(w, ts) {
    if (this.watki.get(w)?.kor) return null;
    let naj = null;
    for (const [x, s] of this.watki) if (x !== w && PULA.test(x) && s.kor && s.tloZd && !s.job && ts - s.ostTs <= OKNO_PULI && ts >= s.ostTs && (!naj || s.ostTs > naj[1].ostTs)) naj = [x, s];
    if (naj) Object.assign(naj[1], { zPuli: true, dostepW: w });
    return naj?.[0];
  }
  // wątek z puli z pracą „w tle” w otwartej transakcji, ostatnio aktywny przed linią dostępu (bez limitu przerwy)
  pulaWTx(w, ts) {
    let naj = null;
    for (const [x, s] of this.watki) if (x !== w && PULA.test(x) && s.kor && s.tloZd && !s.job && s.tx.length && ts >= s.ostTs && (!naj || s.ostTs > naj[1].ostTs)) naj = [x, s];
    return naj?.[0];
  }
  // linia dostępu, która czekała (dostepCzeka), okazała się requestem bez pracy (jak endpoint async na pętli zdarzeń)
  dostepBezPracy(dc) {
    const s = this.stan(dc.wd), kor0 = s.kor, sc = dc.sciezka;
    s.kor = `a-${++this.kory}`;
    const wejscie = { rodzaj: "http", metoda: dc.metoda, sciezka: sc, nazwa: `${dc.metoda} ${sc}` };
    const zd = [this.zd(s, dc.wd, dc.ts, "in", { klasa: "http", metoda: sc, wejscie }), this.zd(s, dc.wd, dc.ts, "out", { klasa: "http", metoda: sc, status: dc.status })];
    (this.bezPracy ||= []).push({ kor: s.kor, ts: dc.ts, w: dc.wd });
    if (this.bezPracy.length > 50) this.bezPracy.shift();
    this.poDostepie = { zd: zd[1], kor: s.kor, ts: dc.ts, wd: dc.wd };
    s.zamkniety = { sciezka: sc, ts: dc.ts, klucz: dc.klucz };
    s.kor = kor0;
    return zd;
  }

  // Wstrzymane zdarzenia wątku: praca „w tle”, która może okazać się requestem (tloZd), i kroki odłożone do pierwszego
  // zdarzenia w środku (odlozone): kontroler z „Mapped to” (400 z walidacji = nie wykonał się), metoda z proxy
  // transakcji (trafienie w @Cacheable = nie wykonała się), repozytorium Spring Data (nazwa z mapy po SQL)
  // zdarzenie w środku (SQL, wywołanie, inny system) rozstrzyga kroki otwarte przed nim; odłożone później czekają dalej
  rozstrzygnij(s, nowe) {
    if (!s.odlozone.length) return;
    const wlasne = new Set(s.odlozone.map(o => o.r.zd));
    const srodek = nowe.find(z => (z.ev === "sql" || z.ev === "in" || z.ev === "zew") && !wlasne.has(z));
    if (!srodek) return;
    const poz = nowe.indexOf(srodek), przed = o => nowe.indexOf(o.r.zd) < poz;
    const czeka = new Set();
    const nazwij = (o, f) => { for (const x of [o.r, o.r.zd, o.r.zdOut]) if (x) x.klasa = f; };
    for (const o of s.odlozone) if (o.rodzaj === "repo" && przed(o)) {
      const q = nowe.find(z => z.ev === "sql" && tabelaSql(z.sql) && nowe.indexOf(z) >= poz);
      const f = q && this.repozytorium(o.r.metoda, q.sql, { wolajacy: o.r.wolajacy });
      if (f) nazwij(o, f); else if (!q) czeka.add(o);   // SQL bez tabeli (np. inne wywołanie) — czekamy dalej
    } else if (o.rodzaj === "repo_cale") czeka.add(o);                     // rozstrzyga koniec wywołania (wszystkie SQL)
    else if (o.rodzaj === "repo_flush") {
      // zapis bez SQL w wywołaniu (delete/save flushowany przy commicie): tabela z SQL flusha tej transakcji
      const fl = nowe.filter(z => z.ev === "sql" && z.flush && tabelaSql(z.sql));
      const f = fl.length && this.repozytorium(o.r.metoda, null, { wolajacy: o.r.wolajacy, wszystkie: fl.map(z => z.sql) });
      if (f) nazwij(o, f); else czeka.add(o);
    }
    s.odlozone = s.odlozone.filter(o => !przed(o) || czeka.has(o));
  }

  wstrzymane(s, wynik, od) {
    if (!s.wstrzym) return wynik;
    const nowe = wynik.splice(od);
    this.rozstrzygnij(s, nowe);
    s.wstrzym.push(...nowe);
    if (!s.odlozone.length && !s.tloZd) { wynik.push(...s.wstrzym); s.wstrzym = null; }
    return wynik;
  }

  liniaInna(l, n) {
    if (!n) {                                                                 // ciąg dalszy (SQL w wielu liniach)
      const t = l.trim();
      // tylko traceback zalogowany linią błędu (logger.exception), jeden na linię — nie wyjątek, który zabił proces
      // (wypisany przez interpreter po ostatniej linii logu, bez nagłówka)
      // wątek bez otwartego przebiegu (pierwsza linia requestu to błąd, np. Flask „Exception on /x [POST]” przy korelacji
      // po trace_id): praca „w tle” ze wstrzymaniem — linia dostępu po odpowiedzi przejmie ją jako request
      if (t === "Traceback (most recent call last):" && this.ost && /^(ERROR|CRITICAL)$/.test(this.ostN?.poziom) && !this.ostN.tb) {
        this.ostN.tb = true;
        if (!this.ost.kor) this.otworzTlo(this.ost, this.ostN.watek, this.ostN.ts);
        if (!this.tb) this.tb = { s: this.ost, w: this.ostN.watek, ts: this.ostN.ts, ramki: [] };
        return [];
      }
      if (this.tb) {
        const f = /^File "([^"]+)", line (\d+), in (\S+)/.exec(t);
        if (f) { this.tb.ramki.push({ plik: f[1], linia: Number(f[2]), fn: f[3] }); return []; }
        if (/^(During handling of|The above exception)/.test(t)) { const tb = this.tb; this.tb = null; return this.zeStosuPy(tb, null); }
        // linia wyjątku (bez wcięcia): koniec tracebacku; linie kodu i znaczniki ^^^ pomijamy
        if (/^\S/.test(l) && t) { const tb = this.tb; this.tb = null; return this.zeStosuPy(tb, t); }
        return [];
      }
      // stos wyjątku .NET (Serilog / konsola wypisują go pod linią błędu, bez nagłówka) w otwartym requestcie .NET:
      // ramki od najgłębszej — łańcuch wywołań aplikacji do miejsca wyjątku (jak traceback Pythona)
      const rn = this.ostN?.dotnet && this.ost?.kor && RAMKA_NET.exec(l);
      if (rn) {
        const r = this.ramkaNet(rn[1], rn[2]);
        this.tbNet ||= { s: this.ost, w: this.ostN.watek, ts: this.ostN.ts, ramki: [], wyjatek: /^[\w.]+(?:Exception|Error)\b/.test(this.ostCiag || "") ? this.ostCiag : null };
        if (r) this.tbNet.ramki.unshift(r);
        return [];
      }
      this.ostCiag = t;
      // stos wyjątku po linii błędu: pierwsza linia „klasa.Wyjatku: komunikat” uzupełnia błąd przebiegu
      const wy = this.czekaWyjatek && /^([\w.$]+(?:Exception|Error|Throwable))(?::\s*(.*))?$/.exec(l.trim());
      if (wy) { this.czekaWyjatek.blad = `${wy[1]}${wy[2] ? ": " + wy[2] : ""}`.slice(0, 300); this.czekaWyjatek = null; }
      const qw = this.ost?.sql;
      if (qw?.wiazania != null) {                                            // parametry knex w wielu liniach
        const k = /^\]\s*(?:undefined|trx\d+)?\s*$/.test(t);
        if (k) { wiazaniaKnex(qw, qw.wiazania); qw.wiazania = null; } else qw.wiazania += " " + t;
        return [];
      }
      // nie ciąg dalszy: rekord już zamknięty (knex:bindings po knex:query) i kompletny JSON (log strukturalny obok)
      if (this.ost?.sql && !this.ost.sql.zamkniety && t && !/^\s+at /.test(l) && !(/^\{[\s\S]*\}$/.test(t) && kompletna(t))) this.ost.sql.sql += " " + t;
      return [];
    }
    this.czekaWyjatek = null;
    const lg = krotki(n.logger);
    let akcja = null, m = null;
    for (const [rl, rt, a] of REGULY) if (rl.test(lg) && (m = rt.exec(n.tekst))) { akcja = a; break; }
    const wLinii = n.watek;
    if (n.bezWatku && akcja === "koniec_dostep") n.watek = this.watekDostepu(m[2]) || n.watek;
    else if (akcja === "koniec_dostep" && !n.przyblizone) n.watek = this.watekRoboczy(n.watek, n.ts) || n.watek;
    const s = this.stan(n.watek), w = n.watek, wynik = this.domknij(n.ts, n.watek), od = wynik.length;
    // request z puli czeka na koniec transakcji, a wątek robi już coś innego (BEGIN, SQL następnego requestu)
    const koniecTx = /^(sql_tx|commit_sql|rollback_sql|knex_tx|ef_tx)$/.test(akcja) && !/^beg/i.test(m?.[1] || "");
    // linia dostępu bez pracy w oknie czeka na następną linię wątku z puli (dostepCzeka): koniec jego transakcji = praca
    // tego requestu (przejmujemy), cokolwiek innego = request bez pracy
    const dc = this.dostepCzeka;
    let przejmij = false;
    if (dc && (akcja === "koniec_dostep" || w === dc.wp)) {
      this.dostepCzeka = null;
      if (w === dc.wp && koniecTx && s.kor === dc.kor && s.tloZd) przejmij = true;
      else wynik.push(...this.dostepBezPracy(dc));
    }
    this.ost = s; this.ostN = n;
    // błąd z tracebackiem na wątku dostępu tuż po 5xx requestu z puli — traceback należy do tamtego requestu
    const p5 = this.po500;
    if (p5 && n.watek !== p5.w) {
      if (!akcja && /^(ERROR|CRITICAL)$/.test(n.poziom) && n.watek === p5.wd && n.ts - p5.ts <= OKNO_PULI && p5.s.czekaTx) { this.ost = p5.s; this.ostN = { ...n, watek: p5.w }; }
      this.po500 = null;
    }
    // wyjątek po odpowiedzi (uvicorn: „Exception in ASGI application” po linii dostępu, np. błąd przy wysyłaniu nagłówków;
    // przy korelacji po trace_id ze spanem już zamkniętym: trace_id=0) — błąd tamtego requestu, także przy statusie < 500
    const pd = this.poDostepie;
    if (pd && !akcja && this.ost === s && /^(ERROR|CRITICAL)$/.test(n.poziom) && /^Exception in ASGI application/.test(n.tekst)) {
      this.poDostepie = null;
      const cel = pd.s?.kor === pd.kor && pd.s.czekaTx ? pd.s : pd.zd;
      if (cel && n.ts - pd.ts <= OKNO_PO_ODP && (wLinii === pd.wd || n.bezWatku)) {
        cel.blad ||= "wyjątek po odpowiedzi";
        this.czekaWyjatek = cel; this.ost = null; this.ostN = null;     // traceback: linia wyjątku to opis błędu
      }
    }
    s.ostTs = n.ts;
    if (!/^(param|param_py|mybatis_param|param_lista)$/.test(akcja)) { const q = this.sqlZalegle(s, w); this.rozstrzygnij(s, q); wynik.push(...q); }
    if (lg === "Npgsql_Transaction") this.sterownikTx = true;              // .NET: transakcje ze sterownika, nie z EF
    // .NET: view component z mapy (zakres z jego pełną nazwą) — krok InvokeAsync od pierwszej do ostatniej linii z zakresem
    if (n.dotnet && s.kor) {
      const k = n.komponent && this.mapa?.klasy?.[n.komponent]?.metody?.includes("InvokeAsync") ? n.komponent : null;
      if (s.komponent && s.komponent.klasa !== k) {
        if (s.stos.at(-1) === s.komponent) { s.stos.pop(); wynik.push(this.zd(s, w, s.komponent.ts, "out", { klasa: s.komponent.klasa, metoda: "InvokeAsync" })); }
        s.komponent = null;
      }
      if (k && !s.komponent && s.stos.length) {
        const r = s.komponent = { klasa: k, metoda: "InvokeAsync" };
        r.zd = this.zd(s, w, n.ts - 0.001, "in", { klasa: k, metoda: "InvokeAsync" }); s.stos.push(r); wynik.push(r.zd);
      }
      if (s.komponent) s.komponent.ts = n.ts;
    }
    // .NET: WARN/ERROR z loggera klasy aplikacji z mapy (ILogger<Klasa>) w requeście — wyjątek obsłużony w aplikacji
    // (np. komunikat dla użytkownika przy 302) to błąd tego przebiegu
    if (!akcja && n.dotnet && s.kor && /^(WARN|ERROR)$/.test(n.poziom) && this.mapa?.klasy?.[n.kategoria]) s.blad ||= `${n.kategoria.split(".").pop()}: ${n.tekst}`.slice(0, 300);
    if (!akcja) return this.wstrzymane(s, wynik, od);
    if (!/^(start|start_router|express_init)$/.test(akcja)) s.poStarcie = false;
    const otworz = (ts, wejscie) => { if (!s.kor) { s.kor = `a-${++this.kory}`; s.wejscie = wejscie; s.korzen = null; s.blad = null; s.ostSql = null; s.startDokladny = false; } };
    const in_ = (klasa, metoda, ts, wejscie = null) => {
      const r = { klasa, metoda }; s.stos.push(r);
      r.zd = this.zd(s, w, ts, "in", { klasa, metoda, ...(wejscie ? { wejscie } : {}) });
      wynik.push(r.zd); return r;
    };
    const odloz = (r, rodzaj) => { s.wstrzym ||= []; s.odlozone.push({ r, rodzaj }); };
    const out = (ts, reszta = {}) => {
      const r = s.stos.pop();
      if (!r) return;
      const o = s.odlozone.find(x => x.r === r);
      if (o?.rodzaj === "repo_cale") {                                        // wywołanie bez transakcji: SQL od wejścia
        const zd = [...(s.wstrzym || []), ...wynik], i = zd.indexOf(r.zd);
        const f = this.repozytorium(r.metoda, null, { wolajacy: r.wolajacy, wszystkie: zd.slice(i + 1).filter(z => z.ev === "sql").map(z => z.sql) });
        if (f) { r.klasa = f; r.zd.klasa = f; }
      }
      // repozytorium bez SQL w środku, zapis (delete/save): nazwa po SQL flusha przy commicie — czeka dalej
      const flush = o?.rodzaj === "repo" && /^(save|delete)/.test(r.metoda) && s.tx.length;
      if (flush) o.rodzaj = "repo_flush";
      s.odlozone = s.odlozone.filter(x => x.r !== r || flush);
      if (r.pomin) {                                                          // nie wykonała się (cache) — bez kroku
        for (const b of [s.wstrzym, wynik]) { const i = b ? b.indexOf(r.zd) : -1; if (i >= 0) b.splice(i, 1); }
        return;
      }
      r.zdOut = this.zd(s, w, ts, "out", { klasa: r.klasa, metoda: r.metoda, ...reszta });
      wynik.push(r.zdOut);
    };
    const zamknij = (ts, reszta) => {
      if (s.blad && !reszta.blad) reszta = { ...reszta, blad: s.blad };    // błąd z logu bez linii końca (Stripes, job)
      // status znany przed końcem (500 z handlera wyjątków Stripes, structlog) — także gdy przebieg zamyka następny
      // request na tym wątku, a nie cisza
      reszta = { ...(s.poKoncu || {}), ...reszta };
      s.blad = null;
      while (s.stos.length) out(ts, s.stos.length === 1 ? reszta : {});
      Object.assign(s, { kor: null, wejscie: null, tx: [], odlozone: [], tloZd: null, poKoncu: null, walidacja: false, mybatis: null, wTle: false, czekaTx: null, zPuli: false, komponent: null, trace: null });
    };
    const zamknijHttp = (ts, status, blad = null, klucz = null) => {
      if (!s.stos.length) in_("http", s.wejscie?.sciezka || "?", s.startTs ?? ts, s.wejscie);
      if (s.wejscie?.sciezka) s.zamkniety = { sciezka: s.wejscie.sciezka, ts, klucz: klucz ?? (akcja === "koniec_dostep" ? n.tekst.replace(/\s+/g, " ").trim() : null) };
      const b = blad || s.blad, korzen = s.stos[0], kor = s.kor;
      zamknij(ts, { ...(status != null ? { status } : {}), ...(b ? { blad: b } : {}) });
      // zamknięcie linią dostępu (albo request czekający po niej na koniec transakcji): wyjątek po odpowiedzi trafi tu
      if (akcja === "koniec_dostep") this.poDostepie = { zd: korzen?.zdOut, kor, ts, wd: wLinii };
      else if (this.poDostepie?.kor === kor) this.poDostepie.zd = korzen?.zdOut;
      s.blad = null;
      const z = s.zawieszone?.pop();
      if (z) Object.assign(s, z);
    };
    const wTle = (ts, klasa, metoda, rodzaj, nazwa) => {                     // job / wątek bez requestu
      otworz(ts, { rodzaj, nazwa });
      s.wTle = true;
      const r = in_(klasa, metoda, ts, s.wejscie);
      if (rodzaj === "w tle") { s.tloZd = r.zd; s.wstrzym ||= []; }
    };
    const tlo = () => wTle(n.ts, `wątek ${w}`, "praca", "w tle", `w tle · ${w}`);
    // praca „w tle” na tym wątku okazała się requestem (SQL przed linią startu albo access log po odpowiedzi)
    const naHttp = wej => {
      const z = s.tloZd;
      Object.assign(z, { klasa: "http", metoda: wej.sciezka, wejscie: wej });
      Object.assign(s.stos[0], { klasa: "http", metoda: wej.sciezka });
      Object.assign(s, { wejscie: wej, wTle: false, startTs: z.ts, tloZd: null });
    };
    const wejscieHttp = (metoda, sciezka) => ({ rodzaj: "http", metoda, sciezka, nazwa: `${metoda} ${sciezka}` });
    const start = (metoda, sciezka, { duplikat = true } = {}) => {
      // ten sam request drugi raz, zanim cokolwiek się stało (zagnieżdżony router Express/Koa loguje dispatch ponownie)
      if (duplikat && s.kor && s.poStarcie && s.wejscie?.metoda === metoda && s.wejscie.sciezka && (s.wejscie.sciezka === sciezka || s.wejscie.sciezka.endsWith(sciezka))) return;
      // praca „w tle” tuż przed startem na tym samym wątku = część requestu (filtr, middleware sesji) — tylko przy
      // prawdziwych wątkach; w Node („main”) to zwykle praca po poprzedniej odpowiedzi
      if (s.kor && s.tloZd && !n.przyblizone) { naHttp(wejscieHttp(metoda, sciezka)); s.poStarcie = true; return; }
      if (s.kor && n.przyblizone && s.wejscie?.sciezka && this.saKonce) {
        // log bez wątku (Node): nowy request, gdy poprzedni trwa = zagnieżdżony (aplikacja woła samą siebie) albo
        // równoległy — poprzedni zawieszamy, wraca po „<-- jego ścieżka”
        // dla zawieszonego: wywołanie innego systemu (tu: samej aplikacji) — jak zew z klienta HTTP
        wynik.push(this.zd(s, w, n.ts, "zew", { metoda, url: sciezka }));
        (s.zawieszone ||= []).push({ kor: s.kor, stos: s.stos, wejscie: s.wejscie, tx: s.tx, startTs: s.startTs, blad: s.blad });
        Object.assign(s, { kor: null, stos: [], wejscie: null, tx: [], blad: null });
      } else if (s.kor && s.wejscie?.sciezka) zamknijHttp(n.ts, null);        // poprzedni bez linii końca
      else if (s.kor) zamknij(n.ts, {});
      otworz(n.ts, wejscieHttp(metoda, sciezka));
      s.startTs = n.ts; s.startDokladny = !n.przyblizone || !!n.dokladny;
      s.poStarcie = true;
    };
    if (przejmij) {
      Object.assign(s, { zPuli: true, dostepW: dc.wd });
      this.podzielTlo(s, w);
      naHttp(wejscieHttp(dc.metoda, dc.sciezka));
      Object.assign(s, { zPuli: false, poKoncu: { status: dc.status }, czekaTx: { ts: dc.ts, status: dc.status, klucz: dc.klucz } });
      this.poDostepie = { s, kor: s.kor, ts: dc.ts, wd: dc.wd };
    }
    if (s.czekaTx && !koniecTx) { const c = s.czekaTx; s.czekaTx = null; zamknijHttp(c.ts, c.status, null, c.klucz); }
    if ((lg === "TransactionInterceptor" || /TransactionManager$/.test(lg)) && s.stos.at(-1)?.bezKonca) out(n.ts);
    if (!s.kor && akcja === "begin" && lg !== "TransactionInterceptor" && !/TransactionManager$/.test(lg)) tlo();
    if (!s.kor && /^(sql|sql_django|sql_ms)$/.test(akcja)) tlo();
    switch (akcja) {
      case "job": {
        if (s.kor) { s.ostTs = -Infinity; wynik.push(...this.domknij(n.ts, w)); if (s.kor) zamknij(n.ts, {}); s.ostTs = n.ts; }
        const j = this.klasyJobow.get(m[1].split(".").pop()) || { fqn: m[1], metoda: "execute" };
        // QuartzJobBean: execute() zawsze woła executeInternal() — rama frameworka, której logi nie pokazują
        if (j.metoda === "executeInternal") { wTle(n.ts, j.fqn, "execute", "job", m[1]); in_(j.fqn, "executeInternal", n.ts); }
        else wTle(n.ts, j.fqn, j.metoda, "job", m[1]);
        s.job = true;
        break;
      }
      case "start": {
        start(m[1], m[2]);
        if (n.trace) s.trace = n.trace;
        // .NET: request z rodzicem w tym samym śladzie (traceparent) wołany przez otwarty request tej aplikacji albo
        // drugiego procesu w tym logu — u wołającego krok „inny system”
        const rodzic = n.rodzic && [...this.watki].find(([x, t]) => x !== w && t.kor && t.trace === n.trace);
        if (rodzic) wynik.push(this.zd(rodzic[1], rodzic[0], n.ts, "zew", { metoda: m[1], url: /\w+:\/\/\S+/.exec(n.tekst)?.[0] || m[2] }));
        break;
      }
      case "start_router":
        s.dispatch = m[1];
        if (!(this.express4 && lg === "express:router")) start(m[1], m[2]);
        break;
      case "express_init": {
        const pierwszy = !this.express4;
        this.express4 = true;
        start(s.dispatch || "GET", m[1], { duplikat: pierwszy });
        break;
      }
      case "stripes": {                                                       // Stripes: zdarzenie ActionBeana = request
        const fqn = this.krotkie.get(m[2]) || m[2];
        if (s.kor) zamknij(n.ts, {});                                        // poprzedni request na wątku (koniec: cisza)
        // URL z konwencji NameBasedActionResolver: pakiet od web/www/stripes/action + nazwa bez ActionBean → „.action”
        const cz = fqn.split("."), i = cz.findLastIndex((x, j) => j < cz.length - 1 && /^(web|www|stripes|action)$/.test(x));
        const sciezka = "/" + [...cz.slice(i + 1, -1), cz.at(-1).replace(/(ActionBean|Action|Bean)$/, "")].join("/") + ".action";
        otworz(n.ts, { rodzaj: "http", sciezka, nazwa: `${m[2]}.${m[3]}` });
        s.wTle = true;
        in_(fqn, m[3], n.ts, s.wejscie);
        break;
      }
      case "koniec_http": case "koniec_dostep": {
        // koniec_dostep: linia dostępu po odpowiedzi (metoda, ścieżka, status) — bywa jedyną linią requestu
        const [metoda, sciezka, status] = akcja === "koniec_http" ? [null, m[1], Number(m[2])] : [m[1], m[2], Number(m[3])];
        this.saKonce = true;
        // linia końca bez własnego czasu (winston, koa-logger — czas z poprzedniej linii + kolejność) po początku
        // z dokładnym czasem: koniec = początek + czas trwania z linii („201 18ms”), gdy późniejszy; zegar przesuwamy
        // dalej jak w sql_ms. Oba końce przybliżone (Nest, do sekundy) — bez zmian
        const ms = n.przyblizone && !n.dokladny && s.kor && s.wejscie?.sciezka === sciezka && s.startTs != null && s.startDokladny && /\b(\d+(?:\.\d+)?)\s*ms\b/.exec(n.tekst)?.[1];
        const przes = ms ? s.startTs + Number(ms) - n.ts : 0;
        if (przes > 0) { poLinii += przes; s.ostTs = n.ts += przes; }
        if (akcja === "koniec_dostep") {
          // ten sam request już zamknięty: ta sama linia drugi raz (uvicorn + loguru) albo access log po linii końca
          // frameworka (DispatcherServlet, structlog z ciszą)
          const klucz = n.tekst.replace(/\s+/g, " ").trim(), z = s.zamkniety;
          const dubel = z && n.ts - z.ts < 1000 && (z.klucz ? z.klucz === klucz : z.sciezka === sciezka);
          if (dubel && !(s.kor && s.wejscie?.sciezka === sciezka)) break;
          if (s.kor && s.tloZd) {
            if (s.zPuli) this.podzielTlo(s, w);
            naHttp(wejscieHttp(metoda, sciezka));
            // wątek z puli: sesja (zależność z yield) zamyka transakcję po odpowiedzi — ROLLBACK/COMMIT tuż po linii
            // dostępu należy jeszcze do requestu; zamykamy go z końcem transakcji (albo przy następnej pracy wątku)
            // 5xx: uvicorn loguje wyjątek („Exception in ASGI application” + traceback) PO linii dostępu, na jej wątku —
            // request czeka na traceback (ramki to kroki requestu), zamyka go następna praca wątku z puli albo cisza
            // to samo przy korelacji po trace_id (wątek = trace): ROLLBACK z tym samym trace_id po linii dostępu
            if (s.tx.length && (s.zPuli || !n.przyblizone) || s.zPuli && status >= 500) {
              s.poKoncu = { status }; s.czekaTx = { ts: n.ts, status, klucz };
              this.po500 = s.zPuli && status >= 500 ? { s, w, wd: s.dostepW, ts: n.ts } : null;
              this.poDostepie = { s, kor: s.kor, ts: n.ts, wd: wLinii };
              s.zPuli = false;
              break;
            }
            s.zPuli = false;
            zamknijHttp(n.ts, status); break;
          }
          // nic w oknie puli, ale wątek z puli ma otwartą transakcję (praca bez linii logu: hashowanie hasła, wywołanie
          // bez logu) — rozstrzyga następna linia tego wątku (dostepCzeka)
          const wp = !s.kor && !n.przyblizone && !n.bezWatku && this.pulaWTx(w, n.ts);
          if (wp) {
            this.dostepCzeka = { wd: w, wp, kor: this.watki.get(wp).kor, ts: n.ts, metoda, sciezka, status, klucz };
            break;
          }
          if (!s.kor) {
            otworz(n.ts, wejscieHttp(metoda, sciezka)); s.startTs = n.ts;
            (this.bezPracy ||= []).push({ kor: s.kor, ts: n.ts, w });         // request bez pracy przed odpowiedzią (202)
            if (this.bezPracy.length > 50) this.bezPracy.shift();
            zamknijHttp(n.ts, status); break;
          }
        }
        if (s.kor && s.wejscie?.sciezka === sciezka) { zamknijHttp(n.ts, status); break; }
        const i = (s.zawieszone || []).findIndex(z => z.wejscie?.sciezka === sciezka);
        if (i >= 0) {                                                          // kończy się request zawieszony
          const biezacy = { kor: s.kor, stos: s.stos, wejscie: s.wejscie, tx: s.tx, startTs: s.startTs, blad: s.blad };
          Object.assign(s, s.zawieszone.splice(i, 1)[0]);
          s.zawieszone.push(biezacy);
          zamknijHttp(n.ts, status);
        } else if (s.kor) zamknijHttp(n.ts, status);
        break;
      }
      case "status_po":                                                       // status znany, praca jeszcze trwa (middleware)
        if (s.kor && s.wejscie?.sciezka) s.poKoncu = { status: Number(m[1]) };
        break;
      case "cel": case "cel_net": {                                          // kontroler = wejście (span korzenia)
        const [klasa, metoda] = akcja === "cel_net" ? (n.akcja || [m[2], m[1]]) : [m[1], m[2]];
        if (s.kor && s.tloZd && !s.wejscie?.sciezka) break;
        if (s.kor && !s.stos.length) odloz(in_(klasa, metoda, s.startTs ?? n.ts, s.wejscie), "cel");
        break;
      }
      case "walidacja": s.walidacja = true; break;
      case "koniec": {
        if (!s.kor) break;
        const status = Number(m[1]);
        // 400 z walidacji argumentu, a w kontrolerze nic się nie stało: Spring odrzucił request przed wywołaniem metody
        const cel = s.odlozone.find(o => o.rodzaj === "cel" && o.r === s.stos[0]);
        if (cel && s.stos.length === 1 && status === 400 && s.walidacja) {
          const sc = s.wejscie?.sciezka || "?";
          Object.assign(cel.r, { klasa: "http", metoda: sc }); Object.assign(cel.r.zd, { klasa: "http", metoda: sc });
        }
        zamknijHttp(n.ts, status);
        break;
      }
      case "blad":
        s.blad = m[1].slice(0, 300);
        if (WALIDACJA.test(m[1])) s.walidacja = true;
        break;
      case "blad_json": {
        if (!s.kor) break;
        s.blad = m[1].slice(0, 300);
        // błąd sterownika z knex: „<SQL z wartościami> - <komunikat bazy>” — błąd ostatniej instrukcji tego przebiegu
        const e = /^[\w.]+: ((?:select|insert|update|delete|with|replace)\b[\s\S]*?) - ([\s\S]+)$/i.exec(m[1]);
        const q = e && (wynik.slice(od).findLast(z => z.ev === "sql") || (s.ostSql?.kor === s.kor ? s.ostSql : null));
        if (q && !q.blad && q.sql.split(/\s+/)[0].toLowerCase() === e[1].split(/\s+/)[0].toLowerCase()) q.blad = e[2].slice(0, 300);
        break;
      }
      case "blad_warn":
        if (n.poziom !== "WARN" && n.poziom !== "ERROR") break;
        s.blad = m[1].slice(0, 300);
        if (WALIDACJA.test(m[1])) s.walidacja = true;
        break;
      case "blad_stos":                                                       // wyjątek oddany kontenerowi serwletów → 500
        if (!s.kor) break;
        s.blad = m[1].slice(0, 300);
        this.czekaWyjatek = s;
        if (s.wejscie?.rodzaj === "http") s.poKoncu = { ...(s.poKoncu || {}), status: 500 };
        break;
      case "koniec_blad":
        if (!s.kor) break;
        zamknijHttp(n.ts, 500, m[1].slice(0, 300) || "wyjątek");
        break;
      case "in": case "in_bez_tx": {
        // ta sama metoda otwarta przed chwilą z nazwy transakcji („creating new transaction with name [X.m]” jest
        // logowane PRZED „Getting transaction for [X.m]”) — to jedna ramka, nie wywołanie przez this
        if (s.stos.at(-1)?.zBegin && s.stos.at(-1).klasa === m[1] && s.stos.at(-1).metoda === m[2]) { s.stos.at(-1).zBegin = false; break; }
        if (!s.kor) otworz(n.ts, null);
        const r = in_(m[1], m[2], n.ts, s.stos.length ? null : { rodzaj: "wywolanie", nazwa: `${m[1].split(".").pop()}.${m[2]}` });
        r.wolajacy = s.stos.at(-2)?.metoda;
        if (akcja === "in_bez_tx") r.bezKonca = true;
        odloz(r, !/\.Simple\w*Repository$/.test(m[1]) ? "proxy" : akcja === "in_bez_tx" ? "repo_cale" : "repo");
        break;
      }
      case "cache_hit": {                                                     // @Cacheable: wartość z cache, metoda nie ruszyła
        const o = s.odlozone.find(x => x.r === s.stos.at(-1));
        if (o) o.r.pomin = true;
        break;
      }
      case "out": {
        // metoda, która otworzyła transakcję: „Completing transaction” jest PRZED commitem i flushem — ramkę zamykamy
        // dopiero z końcem transakcji, żeby SQL flusha i COMMIT były w niej
        const ramka = s.stos.at(-1);
        if (ramka && ramka.metoda === m[2] && s.tx.some(x => x.ramka === ramka)) { ramka.blad = m[3] ? m[3].slice(0, 300) : null; break; }
        if (s.stos.length && s.stos.at(-1).metoda === m[2]) out(n.ts, m[3] ? { blad: m[3].slice(0, 300) } : {});
        if (!s.stos.length && !s.wejscie?.sciezka && !s.wTle) { s.kor = null; s.wejscie = null; }
        break;
      }
      case "begin": {
        if (!s.kor) otworz(n.ts, null);
        // bez TRACE interceptora: nazwa transakcji = metoda @Transactional → krok; z TRACE ten krok już jest
        const [klasa, metoda] = m[2] ? [m[1], m[2]] : [null, null];          // nazwa transakcji = Klasa.metoda (Spring)
        const jest = klasa && s.stos.at(-1)?.klasa === klasa && s.stos.at(-1)?.metoda === metoda;
        if (klasa && !jest) {
          const r = in_(klasa, metoda, n.ts, s.stos.length ? null : { rodzaj: "wywolanie", nazwa: `${klasa.split(".").pop()}.${metoda}` });
          r.zBegin = true; r.wolajacy = s.stos.at(-2)?.metoda; s.tx.push({ wlasna: true, ramka: r });
          odloz(r, /\.Simple\w*Repository$/.test(klasa) ? "repo" : "proxy");
        } else s.tx.push({ wlasna: false });
        wynik.push(this.zd(s, w, n.ts, "tx", { faza: "begin", zrodlo: "spring" }));
        break;
      }
      case "commit": case "rollback":
        // Spring loguje „Committing” PRZED flushem Hibernate'a (INSERT/UPDATE lecą w commit()) — zdarzenie wysyłamy
        // przy zamknięciu transakcji, żeby SQL flusha był przed COMMIT
        if (s.kor && s.tx.length) { s.tx.at(-1).koniec = akcja; s.wFlushu = true; }
        break;
      case "po_tx": {                                                         // po commicie (flush już był) — koniec metody
        const t = s.tx.pop();
        s.wFlushu = false;
        s.odlozone = s.odlozone.filter(o => o.rodzaj !== "repo_flush" || s.tx.length);   // flush tej transakcji już był
        if (t?.koniec) wynik.push(this.zd(s, w, n.ts, "tx", { faza: t.koniec, zrodlo: "spring" }));
        if (t?.wlasna && s.stos.at(-1) === t.ramka) out(n.ts, t.ramka.blad ? { blad: t.ramka.blad } : {});
        if (!s.stos.length && !s.wejscie?.sciezka && !s.wTle) { s.kor = null; s.wejscie = null; }
        break;
      }
      case "commit_sql": case "rollback_sql":                               // ORM loguje COMMIT po instrukcjach
        if (s.kor) wynik.push(this.zd(s, w, n.ts, "tx", { faza: akcja === "commit_sql" ? "commit" : "rollback", zrodlo: lg }));
        { const t = s.tx.pop(); if (t?.wlasna && s.stos.at(-1) === t.ramka) out(n.ts); }
        if (!s.stos.length && !s.wejscie?.sciezka && !s.wTle) { s.kor = null; s.wejscie = null; }
        break;
      case "knex_tx": {
        const f = m[1].toLowerCase();
        // BEGIN bez otwartego przebiegu: praca „w tle” (z wejściem — sam kor bez kroku ginął z SQL i transakcjami)
        if (f === "begin") { if (!s.kor) tlo(); s.tx.push({ wlasna: false }); wynik.push(this.zd(s, w, n.ts, "tx", { faza: "begin", zrodlo: "knex" })); }
        else if (s.kor) { s.tx.pop(); wynik.push(this.zd(s, w, n.ts, "tx", { faza: f, zrodlo: "knex" })); }
        break;
      }
      case "sql_tx": {                                                        // BEGIN/COMMIT/ROLLBACK jako linia SQL ORM-u
        const f = m[1].toLowerCase();
        // Django: „BEGIN” idzie do logu przy set_autocommit(False) (wejście w atomic), a sterownik (psycopg) wysyła BEGIN
        // dopiero z pierwszym zapytaniem — BEGIN odkładamy do pierwszej instrukcji; atomic bez SQL nie ma transakcji
        if (f === "begin" && lg === "backends") { s.tx.push({ wlasna: false, odlozony: { ts: n.ts } }); break; }
        if (f === "begin") { if (!s.kor) tlo(); s.tx.push({ wlasna: false }); wynik.push(this.zd(s, w, n.ts, "tx", { faza: "begin", zrodlo: lg })); }
        else if (s.tx.at(-1)?.odlozony) s.tx.pop();
        else if (s.kor) { s.tx.pop(); wynik.push(this.zd(s, w, n.ts, "tx", { faza: f, zrodlo: lg })); }
        break;
      }
      case "celery": {
        const pole = k => new RegExp(`['"]${k}['"]: ['"]([^'"]+)['"]`).exec(n.tekst)?.[1];
        const zadanie = pole("task") || pole("child_task_name");
        if (m[1] === "task_enqueued") { if (s.kor && pole("child_task_name")) wynik.push(this.zd(s, w, n.ts, "zew", { system: "celery", cel: pole("child_task_name") })); break; }
        if (m[1] === "task_started" && zadanie) {
          if (s.kor) { s.ostTs = -Infinity; wynik.push(...this.domknij(n.ts, w)); if (s.kor) zamknij(n.ts, {}); s.ostTs = n.ts; }
          // zadanie = funkcja modułu: krok „moduł.funkcja” (jak w mapie: klasa = moduł)
          const i = zadanie.lastIndexOf("."), modul = i > 0 ? zadanie.slice(0, i) : zadanie, fn = i > 0 ? zadanie.slice(i + 1) : "run";
          wTle(n.ts, modul, fn, "kolejka", zadanie);
          s.job = true; s.celery = pole("task_id") || zadanie;
          break;
        }
        if (s.kor && s.celery && (!pole("task_id") || pole("task_id") === s.celery)) {
          const blad = m[1] === "task_succeeded" ? null : (/['"]reason['"]: ([^,}]+(?:\([^)]*\))?)/.exec(n.tekst)?.[1] || /['"]exception['"]: ['"]([^'"]+)/.exec(n.tekst)?.[1] || m[1]);
          s.celery = null;
          zamknij(n.ts, blad ? { blad: String(blad).slice(0, 300) } : {});
        }
        break;
      }
      case "sql_json": {                                                       // parametry jako tablica JSON ($1, $2 …)
        if (!s.kor) tlo();
        let par = []; try { par = m[2] ? JSON.parse(m[2]) : []; } catch {}
        const lit = v => (v == null ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
        const tekst = (m[1] || m[2] || "").trim().replace(/\$(\d+)/g, (a, i) => (par[i - 1] !== undefined ? lit(par[i - 1]) : a));
        wynik.push(this.zd(s, w, n.ts, "sql", { sql: tekst, ms: 0 }));
        break;
      }
      case "sql_blad": {                                                      // ostatnia instrukcja (ta sama) nie wykonała się
        let par = []; try { par = m[2] ? JSON.parse(m[2]) : []; } catch {}
        const lit = v => (v == null ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
        const tekst = m[1].trim().replace(/\$(\d+)/g, (a, i) => (par[i - 1] !== undefined ? lit(par[i - 1]) : a));
        if (s.ostSql && s.ostSql.kor === s.kor && s.ostSql.sql === tekst) s.ostSql.blad = "query failed";
        else { if (!s.kor) tlo(); wynik.push(this.zd(s, w, n.ts, "sql", { sql: tekst, ms: 0, blad: "query failed" })); }
        s.bladSql = s.ostSql?.sql === tekst && s.ostSql.kor === s.kor ? s.ostSql : wynik.at(-1);
        break;
      }
      case "sql_blad_stan": {                                                 // błąd ostatniej instrukcji wątku (Hibernate)
        const q = wynik.slice(od).findLast(z => z.ev === "sql") || (s.ostSql?.kor === s.kor ? s.ostSql : null);
        if (q && s.kor) { q.blad ||= `SQLState: ${m[1]}`; s.bladSql = q; }
        break;
      }
      case "sql_blad_opis":
        if (s.bladSql) { s.bladSql.blad = m[1].trim().slice(0, 300); s.bladSql = null; }
        break;
      case "sql_ms": {                                                         // SQL z wartościami i czasem (MikroORM)
        // czas linii przybliżony (do sekundy + kolejność): przesuwamy zegar o czas trwania, żeby początek instrukcji
        // (koniec − ms) nie wypadł przed poprzednią linią
        const ms = Number(m[2]) || 0;
        if (n.przyblizone && ms) { poLinii += ms; s.ostTs = n.ts += ms; }
        wynik.push(this.zd(s, w, n.ts, "sql", { sql: m[1].trim(), ms }));
        break;
      }
      case "sql_npgsql": {
        this.sterownikSql = true;
        if (!s.kor) tlo();
        const lit = v => (/^(-?\d+(\.\d+)?|true|false|NULL)$/i.test(v) ? v : `'${String(v).replace(/'/g, "''")}'`);
        if (m[1] === "Batch") {
          // paczka: „[(SQL1, System.Object[]), (SQL2, …)]” bez wartości — wartości z poprzedzającej linii EF Core, jeśli pasuje
          const instr = [...m[3].matchAll(/\(([\s\S]+?), System\.Object\[\]\)/g)].map(x => x[1].trim());
          const ef = s.ostEF && n.ts - s.ostEF.ts < 50 && s.ostEF.instr.length === instr.length ? s.ostEF.instr : null;
          (ef || instr).forEach(q => wynik.push(this.zd(s, w, n.ts, "sql", { sql: q, ms: Number(m[2]) / instr.length })));
          s.ostEF = null;
          break;
        }
        const [, sql, par] = /^([\s\S]+?)(?:\s{2,}Parameters: \[([\s\S]*)\])?\s*$/.exec(m[3]);
        if (/^\s*(RELEASE )?SAVEPOINT\b/i.test(sql)) this.sterownikSavepoint = true;
        const wart = par ? par.split(/,\s*/) : [];
        wynik.push(this.zd(s, w, n.ts, "sql", { sql: sql.trim().replace(/\$(\d+)/g, (a, i) => (wart[i - 1] !== undefined ? lit(wart[i - 1].trim()) : a)), ms: Number(m[2]) }));
        s.ostEF = null;
        break;
      }
      case "sql_ef": {
        const [, nieudany, msEf, parEf, sqlEf] = m;
        m = [m[0], msEf, parEf, sqlEf];
        const wart = {};
        for (const x of m[2].matchAll(/@(\w+)=(?:'((?:[^']|'')*)'|(NULL))(?: \([^)]*\))?/g)) wart[x[1]] = x[3] ? "NULL" : x[2].replace(/''/g, "'");
        const lit = v => (/^(-?\d+(\.\d+)?|True|False|NULL)$/.test(v) ? v.toLowerCase() === "true" || v.toLowerCase() === "false" ? v.toLowerCase() : v : `'${String(v).replace(/'/g, "''")}'`);
        const tekst = m[3].trim().replace(/@(\w+)/g, (a, k) => (wart[k] !== undefined ? lit(wart[k]) : a));
        const instr = tekst.split(/;\s*(?=\S)/).map(x => x.replace(/;\s*$/, "").trim()).filter(Boolean);
        s.ostEF = { ts: n.ts, instr };
        // nieudane polecenie (fail [20102]): błąd ostatniej instrukcji paczki, opis z wyjątku w Update[10000]
        if (this.sterownikSql) {                                             // ten sam SQL przyjdzie ze sterownika
          if (nieudany && s.ostSql?.kor === s.kor && s.ostSql.sql === instr.at(-1)) { s.ostSql.blad ||= "Failed executing DbCommand"; s.bladSql = s.ostSql; }
          break;
        }
        if (!s.kor) tlo();
        instr.forEach((q, i) => wynik.push(this.zd(s, w, n.ts, "sql", { sql: q, ms: Number(m[1]) / instr.length, ...(nieudany && i === instr.length - 1 ? { blad: "Failed executing DbCommand" } : {}) })));
        if (nieudany) s.bladSql = wynik.at(-1);
        break;
      }
      case "ef_tx": {
        if (this.sterownikTx) break;
        const f = m[1] === "Began" ? "begin" : m[1] === "Committed" ? "commit" : "rollback";
        if (f === "begin") { if (!s.kor) tlo(); s.tx.push({ wlasna: false }); }
        else s.tx.pop();
        if (s.kor) wynik.push(this.zd(s, w, n.ts, "tx", { faza: f, zrodlo: "ef" }));
        break;
      }
      case "ef_savepoint": {                                                  // EF Core: savepoint w SaveChanges przy własnej transakcji
        if (this.sterownikSavepoint || !s.kor) break;
        const sql = { Created: "SAVEPOINT", Released: "RELEASE SAVEPOINT", "Rolled back to": "ROLLBACK TO SAVEPOINT" }[m[1]];
        wynik.push(this.zd(s, w, n.ts, "sql", { sql: `${sql} "__EFSavePoint"`, ms: 0 }));
        break;
      }
      case "zew":
        if (s.kor) wynik.push(this.zd(s, w, n.ts, "zew", { metoda: m[1], url: m[2] }));
        break;
      case "zew_blad":
        if (s.kor) wynik.push(this.zd(s, w, n.ts, "zew", { url: `http://${m[2]}`, blad: `HttpRequestException: ${m[1]}`.slice(0, 300) }));
        break;
      case "zew_urllib3":
        if (s.kor) wynik.push(this.zd(s, w, n.ts, "zew", { metoda: m[2], url: m[1] + m[3] }));
        break;
      case "sql":
        // JdbcTemplate: „[SQL]” — w wielu liniach nawias zamykający jest w ostatniej (zdejmujemy przy zamknięciu)
        s.sql = { sql: m[1].trim().replace(/\s+/g, " "), ts: n.ts, par: {}, nawias: lg === "JdbcTemplate", flush: !!s.wFlushu };
        break;
      case "sql_el": {
        if (!s.kor) tlo();
        const par = {};
        if (m[2] && !/^\d+ parameters? bound$/.test(m[2].trim())) podziel(m[2]).forEach((v, i) => (par[i + 1] = v === "null" ? "NULL" : /^-?\d+(\.\d+)?$/.test(v) ? v : `'${v.replace(/'/g, "''")}'`));
        wynik.push(this.zd(s, w, n.ts, "sql", { sql: wstaw(m[1].trim().replace(/\s+/g, " "), par, true), ms: 0 }));
        break;
      }
      case "sql_django": {                                                    // „(0.001) SQL; args=…; alias=default”
        const t = s.tx.find(x => x.odlozony);                                // odłożony BEGIN Django: wysłany z tą instrukcją
        if (t) { wynik.push(this.zd(s, w, t.odlozony.ts, "tx", { faza: "begin", zrodlo: lg })); t.odlozony = null; }
        s.sql = { sql: (m[2] || "").trim().replace(/\s+/g, " "), ts: n.ts, par: {}, ms: Number(m[1]) * 1000, django: true };
        break;
      }
      case "param_py": {
        const q = this.ost?.sql;
        if (q) { q.par = parametryPy(m[1]); q.lit = true; }
        break;
      }
      case "mybatis_sql": {
        if (!s.kor) tlo();
        if (s.mybatis && s.stos.at(-1) === s.mybatis) out(n.ts);            // poprzednia instrukcja bez „<==”
        const cz = n.logger.split("."), ns = cz.slice(0, -1).join(".") || n.logger;
        s.mybatis = in_(this.krotkie.get(ns.split(".").pop()) || ns, cz.at(-1), n.ts);
        s.sql = { sql: m[1].trim().replace(/\s+/g, " "), ts: n.ts, par: {}, lit: true };
        break;
      }
      case "mybatis_param": {
        const q = s.sql;
        if (q) { q.par = parametryMyBatis(m[1]); q.lit = true; }
        break;
      }
      case "mybatis_koniec":
        if (s.mybatis && s.stos.at(-1) === s.mybatis) out(n.ts);
        s.mybatis = null;
        break;
      case "param_lista": {                                                    // „[ 1, 'x', 2026-…Z ]” → $1, $2 …
        const q = this.ost?.sql;
        if (!q) break;
        if (m[2]) wiazaniaKnex(q, m[1]); else q.wiazania = m[1];
        break;
      }
      case "param": {
        const q = this.ost?.sql;
        if (q) q.par[m[1] || m[2]] = m[3];
        break;
      }
    }
    if (s.czekaTx && koniecTx && !s.tx.length) { const c = s.czekaTx; s.czekaTx = null; zamknijHttp(n.ts, c.status, null, c.klucz); }
    for (let i = od; i < wynik.length; i++) if (wynik[i].ev === "sql") s.ostSql = wynik[i];
    return this.wstrzymane(s, wynik, od);
  }
}

// Laravel: framework nie loguje SQL ani transakcji sam — ma zdarzenia (QueryExecuted, TransactionBeginning/Committed/
// RolledBack, RouteMatched, RequestHandled, JobProcessing/Processed, CommandStarting/Finished, Http RequestSending).
// Provider słuchający ich i piszący „sql {sql,bindings,ms}”, „tx begin {poziom}”, „request start {method,path,akcja}”,
// „request {…,route,status}”, „http client -> {method,url}”, „job start {job}”, „komenda start {komenda}” — patrz
// SKILL.md. Jeden strumień (stderr) dla workerów HTTP, workera kolejki i komend artisan, bez pid i wątku, więc linie
// rozdzielamy na logiczne wątki: http (requesty, zagnieżdżone = aplikacja woła samą siebie), kolejka (SQL na „jobs”
// i praca joba), komenda. Transakcja należy do wątku pierwszego SQL po BEGIN; poziom > 1 = savepoint (trans2…).
// Z „pid” w kontekście (getmypid() w providerze) transakcja i SQL należą do wątku logicznego procesu, który je zalogował.
// Pobranie z kolejki bez wiadomości (sam SELECT … SKIP LOCKED) to szum — pomijamy.
// Monolog wypisuje znaki nowej linii z wartości (SQL w wielu liniach, stos wyjątku) wprost — w JSON to \n w napisie
const jsonZLinii = s => s.trim().replace(/\r?\n/g, "\\n");
function kompletna(tekst) {
  const i = tekst.indexOf("{");
  if (i < 0) return true;
  try { JSON.parse(jsonZLinii(tekst.slice(i))); return true; } catch { return false; }
}
const DLUGIE_KOMENDY = /^(queue:work|queue:listen|serve|schedule:work|horizon|octane:\w+|reverb:start|messenger:consume)$/;
LogAplikacji.prototype.laravel = function ({ ts, poziom, tekst, dokladny }) {
  // czas linii do sekundy + kolejność: SQL kończy się w chwili linii, a zaczyna ms wcześniej — przesuwamy zegar o ms
  // (jak w sql_ms), żeby początek instrukcji nie wypadł przed poprzednią linią i kolejność kroków była jak w logu
  if (!dokladny && this.larOst != null && ts < this.larOst) ts = this.larOst;
  const m = /^([\s\S]*?)\s*(\{[\s\S]*\}|\[\])?\s*$/.exec(tekst.trim());
  const msg = m[1].split("\n")[0].trim();
  let c = {}; try { if (m[2]) c = JSON.parse(jsonZLinii(m[2])); } catch {}
  const wynik = [];
  const W = { http: this.stan("http"), kolejka: this.stan("kolejka"), komenda: this.stan("komenda") };
  for (const s of Object.values(W)) s.lar = true;
  const kl = a => String(a || "").replace(/\\+/g, ".");
  const pid = c.pid ?? null, wPid = pid != null ? this.pidW.get(pid) : null;
  const emit = (w, ev, reszta = {}) => {
    const s = W[w] || this.stan(w);
    const z = this.zd(s, w, ts, ev, reszta);
    if (w === "kolejka" && s.bufor) s.bufor.push(z); else wynik.push(z);
    return z;
  };
  const otworz = (w, wejscie) => { const s = W[w] || this.stan(w); Object.assign(s, { kor: `a-${++this.kory}`, wejscie, stos: [], tx: [], blad: null }); return s; };
  const in_ = (w, klasa, metoda, wejscie = null) => { (W[w] || this.stan(w)).stos.push({ klasa, metoda }); emit(w, "in", { klasa, metoda, ...(wejscie ? { wejscie } : {}) }); };
  const zamknij = (w, reszta = {}) => {
    const s = W[w] || this.stan(w);
    while (s.stos.length) { const r = s.stos.pop(); emit(w, "out", { klasa: r.klasa, metoda: r.metoda, ...(s.stos.length ? {} : reszta) }); }
    Object.assign(s, { kor: null, wejscie: null, tx: [] });
    this.larTx = this.larTx.filter(x => x !== w);
  };
  // klasa komendy z mapy: nazwa komendy zapisana w mapie (sygnatura Laravela, #[AsCommand(name:)], $defaultName), potem
  // ostatni człon sygnatury (konwencja Laravela: „sklep:porzadki” → Porzadki/PorzadkiCommand), potem wszystkie człony
  // poza przestrzenią (Symfony: „codely:domain-events:mysql:consume” → ConsumeMySqlDomainEventsCommand)
  const klasaKomendy = k => {
    const klasy = this.mapa?.klasy || {}, nazwy = Object.keys(klasy);
    const met = f => (klasy[f].metody?.includes("handle") ? "handle" : klasy[f].metody?.includes("execute") ? "execute" : klasy[f].metody?.[0] || "handle");
    const bez = n => n.toLowerCase().replace(/(command|cmd)$/, "");
    let f = nazwy.find(f => [klasy[f].komenda, klasy[f].sygnatura].flat().some(x => x && String(x).trim().split(/[\s{]/)[0] === k));
    const ost = String(k).split(":").pop().replace(/[-_]/g, "").toLowerCase();
    f ||= nazwy.find(f => { const n = f.split(".").pop(); return n.toLowerCase() === ost || bez(n) === ost; });
    if (!f) {
      const cz = String(k).split(":"), czesci = cz.slice(cz.length > 1 ? 1 : 0).flatMap(x => x.split(/[-_]/)).map(x => x.toLowerCase()).filter(Boolean);
      let naj = null, ocena = 0;
      for (const kand of nazwy) {
        const n = kand.split(".").pop();
        if (!/(Command|Cmd)$/.test(n) && !/komend|command/i.test(klasy[kand].powod || "")) continue;
        const b = bez(n), traf = czesci.filter(x => b.includes(x));
        const pokrycie = traf.reduce((a, x) => a + x.length, 0) / b.length;
        if (traf.length < Math.min(2, czesci.length) || pokrycie < 0.6) continue;
        const o = pokrycie + (traf.length === czesci.length ? 1 : 0);
        if (o > ocena) { naj = kand; ocena = o; } else if (o === ocena) naj = null;
      }
      f = naj;
    }
    return f ? [f, met(f)] : ["komenda", String(k)];
  };
  // wątek dla SQL / transakcji: SQL na tabeli jobs (poza dispatchem) → kolejka; otwarta transakcja; request; job; komenda
  const naJobs = sql => /\b(?:from|update|into)\s+(?:["`[]?\w+["`\]]?\.)?["`[]?jobs["`\]]?(?![\w"`\]])/i.test(sql) && !/^\s*insert\b/i.test(sql);   // "jobs", `jobs` (MySQL), [jobs]
  const watekSql = sql => {
    if (naJobs(sql)) return "kolejka";
    if (this.larTx.length) return this.larTx.at(-1);
    if (W.http.kor) return "http";
    if (W.kolejka.kor) return "kolejka";
    if (W.komenda.kor) return "komenda";
    return "laravel";
  };
  // wątek procesu z „pid” (gdy provider go pisze): request po zakończeniu → praca po odpowiedzi („laravel”)
  const watekPid = () => (wPid && (wPid !== "http" || W.http.kor) && (wPid !== "komenda" || W.komenda.kor) ? wPid : wPid ? "laravel" : null);
  const przygotuj = w => {
    const s = W[w] || this.stan(w);
    if (w === "kolejka" && !s.kor) { otworz(w, { rodzaj: "kolejka", nazwa: "kolejka · pobranie" }); s.bufor = []; s.pobranie = true; in_(w, "kolejka", "pobranie", s.wejscie); }
    if (w === "laravel" && !s.kor) { otworz(w, { rodzaj: "w tle", nazwa: "w tle · laravel" }); s.wTle = true; in_(w, "wątek laravel", "praca", s.wejscie); }
  };
  const koniecPobrania = () => {
    const s = W.kolejka;
    if (!s.pobranie || this.larTx.includes("kolejka")) return;
    const bufor = s.bufor; s.bufor = null;
    zamknij("kolejka");
    const out = wynik.splice(wynik.length - 1, 1);
    s.pobranie = false;
    // sama próba pobrania (SELECT … FOR UPDATE SKIP LOCKED, brak wiadomości) — szum
    if (bufor.some(z => z.ev === "sql" && !/skip\s+locked/i.test(z.sql))) wynik.push(...bufor, ...out);
  };
  const literal = v => (v == null ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

  if (msg === "sql" && c.sql != null) {
    const sql = c.sql.trim();
    let w, begin;
    if (wPid) {
      w = watekSql(sql) === "kolejka" ? "kolejka" : watekPid();
      begin = this.larBeginPid.get(pid); this.larBeginPid.delete(pid);
    } else if (c.tx === 0) {
      // poziom transakcji z providera („tx”: transactionLevel()) = 0: instrukcja poza transakcją swojego połączenia — nie
      // należy do otwartej transakcji z larTx ani nie zużywa leniwego BEGIN (ten czeka na SQL z tx ≥ 1: przeplot
      // requestu z odpytaniem workera kolejki, który właśnie zaczął transakcję)
      w = naJobs(sql) ? "kolejka" : W.http.kor ? "http" : W.kolejka.kor ? "kolejka" : W.komenda.kor ? "komenda" : "laravel";
    } else {
      w = this.larBegin ? (watekSql(sql) === "kolejka" ? "kolejka" : W.http.kor ? "http" : W.kolejka.kor ? "kolejka" : W.komenda.kor ? "komenda" : "laravel") : watekSql(sql);
      begin = this.larBegin; this.larBegin = null;
      if (pid != null && w === "kolejka") this.pidW.set(pid, "kolejka");
    }
    przygotuj(w);
    if (begin) { emit(w, "tx", { faza: "begin", zrodlo: "laravel" }); this.larTx.push(w); }
    let i = 0;
    const b = Array.isArray(c.bindings) ? c.bindings : Object.values(c.bindings || {});
    const ms = Number(c.ms) || 0;
    if (!dokladny) ts += ms;
    (W[w] || this.stan(w)).ostSql = emit(w, "sql", { sql: sql.replace(/\?/g, a => (i < b.length ? literal(b[i++]) : a)), ms });
  } else if (/^tx (begin|commit|rollback)$/.test(msg)) {
    const faza = msg.slice(3), p = Number(c.poziom) || 1;
    if (wPid && p === 1 && faza === "begin") this.larBeginPid.set(pid, { ts });
    else if (wPid && p === 1 && this.larBeginPid.has(pid)) this.larBeginPid.delete(pid);   // pusta transakcja
    else if (!wPid && faza === "begin" && p === 1) this.larBegin = { ts };
    else if (!wPid && faza !== "begin" && p === 1 && this.larBegin) this.larBegin = null;          // pusta transakcja
    else {
      const wp = wPid ? watekPid() : null;
      const w = wp && this.larTx.includes(wp) ? wp : this.larTx.at(-1) || (W.http.kor ? "http" : "laravel");
      przygotuj(w);
      if (p > 1) emit(w, "sql", { sql: faza === "begin" ? `SAVEPOINT trans${p}` : faza === "commit" ? `RELEASE SAVEPOINT trans${p}` : `ROLLBACK TO SAVEPOINT trans${p}`, ms: 0 });
      else { emit(w, "tx", { faza, zrodlo: "laravel" }); this.larTx.splice(this.larTx.lastIndexOf(w), 1); if (w === "kolejka") koniecPobrania(); }
    }
  } else if (msg === "request start" && c.path) {
    const H = W.http, [klasa, metoda] = kl(c.akcja).split("@");
    if (pid != null) this.pidW.set(pid, "http");
    if (H.kor) {                                                              // aplikacja woła samą siebie: zagnieżdżony
      if (!H.poZew) emit("http", "zew", { metoda: c.method, url: c.path });
      (H.zawieszone ||= []).push({ kor: H.kor, stos: H.stos, wejscie: H.wejscie, tx: H.tx, blad: H.blad });
    }
    H.poZew = false;
    const wejscie = { rodzaj: "http", metoda: c.method, sciezka: c.path, nazwa: `${c.method} ${c.path}` };
    otworz("http", wejscie);
    if (klasa && metoda) in_("http", klasa, metoda, wejscie); else in_("http", "http", c.path, wejscie);
  } else if (msg === "request" && c.path) {
    const H = W.http;
    const reszta = { status: Number(c.status) || 200, ...(c.route != null ? { sciezka: "/" + String(c.route).replace(/^\/+/, "") } : {}) };
    if (!(H.kor && H.wejscie?.sciezka === c.path)) {
      const i = (H.zawieszone || []).findIndex(z => z.wejscie?.sciezka === c.path);
      if (i >= 0) { const biezacy = { kor: H.kor, stos: H.stos, wejscie: H.wejscie, tx: H.tx, blad: H.blad }; Object.assign(H, H.zawieszone.splice(i, 1)[0]); if (biezacy.kor) H.zawieszone.push(biezacy); }
      else {                                                                   // bez „request start” (np. 404/405 bez trasy)
        // otwarty request innej ścieżki czeka (zawieszony), a ten dostaje własny przebieg
        const wejscie = { rodzaj: "http", metoda: c.method, sciezka: c.path, nazwa: `${c.method} ${c.path}` };
        if (H.kor) (H.zawieszone ||= []).push({ kor: H.kor, stos: H.stos, wejscie: H.wejscie, tx: H.tx, blad: H.blad });
        otworz("http", wejscie); in_("http", "http", c.path, wejscie);
      }
    }
    zamknij("http", { ...reszta, ...(H.blad ? { blad: H.blad } : {}) });
    H.blad = null;
    const z = H.zawieszone?.pop();
    if (z) Object.assign(H, z);
  } else if (msg === "http client ->" && c.url) {
    const w = W.http.kor ? "http" : W.kolejka.kor ? "kolejka" : W.komenda.kor ? "komenda" : null;
    if (w) { emit(w, "zew", { metoda: c.method, url: c.url }); if (w === "http") W.http.poZew = true; }
  } else if (msg === "job start" && c.job) {
    if (pid != null) this.pidW.set(pid, "kolejka");
    if (W.kolejka.kor && !W.kolejka.pobranie) zamknij("kolejka");
    if (W.kolejka.pobranie) koniecPobrania();
    const fqn = kl(c.job), met = this.mapa?.klasy?.[fqn]?.metody;
    const metoda = met?.includes("handle") ? "handle" : met?.[0] || "handle";
    otworz("kolejka", { rodzaj: "job", nazwa: `${fqn.split(".").pop()}.${metoda}` });   // jak w OTel i haku PHP
    in_("kolejka", fqn, metoda, W.kolejka.wejscie);
  } else if (/^job (koniec|failed|blad)$/.test(msg)) {
    if (W.kolejka.kor) zamknij("kolejka", msg === "job koniec" ? {} : { blad: c.blad || c.exception || "job nieudany" });
  } else if (msg === "komenda start" && c.komenda && DLUGIE_KOMENDY.test(c.komenda)) {
    if (pid != null && /^(queue|horizon|messenger)/.test(c.komenda)) this.pidW.set(pid, "kolejka");
  } else if (msg === "komenda start" && c.komenda && !DLUGIE_KOMENDY.test(c.komenda)) {
    if (pid != null) this.pidW.set(pid, "komenda");
    if (W.komenda.kor) zamknij("komenda");
    const [klasa, metoda] = klasaKomendy(c.komenda);
    otworz("komenda", { rodzaj: "job", nazwa: c.komenda });
    in_("komenda", klasa, metoda, W.komenda.wejscie);
  } else if (msg === "komenda koniec" && c.komenda && !DLUGIE_KOMENDY.test(c.komenda)) {
    if (W.komenda.kor) zamknij("komenda", Number(c.kod) ? { blad: `kod wyjścia ${c.kod}` } : {});
  } else if (/^(ERROR|CRITICAL|ALERT|EMERGENCY)$/.test(poziom)) {
    // wyjątek: „komunikat {"exception":"[object] (Klasa\\Wyjatku(code: 0): komunikat at plik:linia)…”
    const klasa = /\(([\w\\]+)\(code: /.exec(String(c.exception ?? ""))?.[1] || /\(([\w\\]+)\(code: /.exec(tekst)?.[1];
    const opis = `${klasa ? kl(klasa) + ": " : ""}${msg}`.slice(0, 300);
    const w = this.larTx.at(-1) || (W.http.kor ? "http" : W.kolejka.kor ? "kolejka" : W.komenda.kor ? "komenda" : null);
    if (w) {
      const s = W[w] || this.stan(w);
      s.blad = opis;
      // wyjątek bazy (Doctrine DBAL, QueryException, PDOException, SQLSTATE) — błąd ostatniej instrukcji tego przebiegu
      // (między nią a wyjątkiem bywa tylko ROLLBACK)
      if ((/\\DBAL\\Exception\\|QueryException|PDOException/.test(klasa || "") || /SQLSTATE\[/.test(msg)) && s.ostSql?.kor === s.kor && !s.ostSql.blad)
        s.ostSql.blad = (/SQLSTATE\[[\s\S]*/.exec(msg)?.[0] || opis).slice(0, 300);
    }
  }
  this.larOst = ts;
  return wynik;
};

// Kanboard (PicoDb, tryb DEBUG): SQL („SQL: …”, „SQL: param[n]: 'v'”, „SQL: query_duration=s”) wypisuje hurtem
// BootstrapSubscriber::__destruct, na końcu żądania — tuż przed „APP: nb_queries=N”, więc N ostatnich instrukcji należy
// do tego żądania (zagnieżdżone żądanie, np. webhook do samej aplikacji, kończy się wcześniej i bierze swoje).
// „APP: uri=…” i separator „###” zamykają blok; metoda i status z access logu `php -S`. Kolejność zachowana, czasy
// przybliżone (do sekundy, wypis w destruktorze), transakcji ten log nie pokazuje.
LogAplikacji.prototype.kanboard = function ({ ts, tekst }) {
  const kb = this.kb ||= { sql: [], q: null, blok: null, kontroler: null, klasy: [], wHttp: false };
  // klasy z linii logu („Subscriber executed: FQN::m”, „FQN::m …”, „Job executed synchronously: FQN”, „=> FQN”
  // middleware'u) — kroki bez czasów (kolejność względem SQL nieznana: SQL wypisuje destruktor); z mapą tylko jej klasy
  const klasa = (f, metoda) => { const fqn = f.replace(/^\\/, "").replace(/\\+/g, "."); if (this.mapa?.klasy && !this.mapa.klasy[fqn]) return; kb.klasy.push({ klasa: fqn, metoda, ts }); };
  // Runner::executeMiddleware / ::executeController to metody chronione, które woła tylko publiczne execute() tej klasy
  // (z mapy) — żądanie przeszło przez execute(), choć log jej nie wymienia
  const wykonawca = f => { const fqn = f.replace(/^\\/, "").replace(/\\+/g, "."); return this.mapa?.klasy?.[fqn]?.metody?.includes("execute") ? fqn : null; };
  const domknijSql = () => { if (kb.q) { kb.sql.push(kb.q); kb.q = null; if (kb.sql.length > 1000) kb.sql.shift(); } };
  let m;
  if ((m = /^SQL: param\[(\w+)\]: ([\s\S]*)$/.exec(tekst))) { if (kb.q) kb.q.par[m[1]] = m[2].trim(); }
  else if ((m = /^SQL: query_duration=([\d.eE+-]+)/.exec(tekst))) { if (kb.q) kb.q.ms = Number(m[1]) * 1000; domknijSql(); }
  else if (/^SQL: total_execution_time=/.test(tekst)) {}
  else if (/^SQL: SQLSTATE\[/.test(tekst)) { const q = kb.q || kb.sql.at(-1); if (q) q.blad = tekst.slice(5, 300); }   // błąd instrukcji
  else if ((m = /^SQL: ([\s\S]+)$/.exec(tekst))) { domknijSql(); kb.q = { sql: m[1].trim().replace(/\s+/g, " "), par: {}, ts, ms: 0 }; }
  else if ((m = /^APP: nb_queries=(\d+)/.exec(tekst))) { domknijSql(); const n = Number(m[1]); kb.blok = { sql: n ? kb.sql.splice(-n) : [], ts, kontroler: kb.kontroler, runner: kb.runner, klasy: kb.wHttp ? [] : kb.klasy.splice(0) }; kb.kontroler = null; kb.runner = null; }
  else if ((m = /^APP: uri=(.*)$/.exec(tekst))) { if (kb.blok) kb.blok.uri = m[1].trim(); }
  else if ((m = /^\\?([\w\\]*Runner)::executeController => \\?([\w\\]+)::(\w+)/.exec(tekst))) { kb.kontroler = [m[2].replace(/\\+/g, "."), m[3]]; kb.runner ||= wykonawca(m[1]); }
  // HttpClient: „::doRequest” przed wysłaniem — żądanie zakończone przed „url=” to zagnieżdżone (webhook do samej
  // aplikacji), nie bierze klas wołającego; „url=” i „payload=” (POST) to wywołanie innego systemu
  else if (/^HttpClient::doRequest\b/.test(tekst)) kb.wHttp = true;
  // klient z mapy (Kanboard\Core\Http\Client, rola zewnetrzne) — krok jego metody przed wywołaniem: get, a przy
  // niepustym payload postJson (JSON) albo postForm; pusty payload loguje też GET
  else if ((m = /^HttpClient: url=(\S+)/.exec(tekst))) {
    kb.wHttp = false;
    const kl = this.mapa?.klasy || {}, klient = Object.keys(kl).find(f => /\.Http\.Client$/.test(f) && kl[f].rola === "zewnetrzne");
    if (klient) kb.klasy.push({ klasa: klient, metoda: "get", ts, klient: true });
    kb.klasy.push({ zew: { metoda: "GET", url: m[1] }, ts });
  }
  else if ((m = /^HttpClient: payload=(\S[\s\S]*)$/.exec(tekst))) {
    const i = kb.klasy.findLastIndex(k => k.zew);
    if (i >= 0) { kb.klasy[i].zew.metoda = "POST"; if (kb.klasy[i - 1]?.klient) kb.klasy[i - 1].metoda = /^[[{]/.test(m[1]) ? "postJson" : "postForm"; }
  }
  else if ((m = /^Subscriber executed: \\?([\w\\]+)::(\w+)/.exec(tekst))) klasa(m[1], m[2]);
  else if ((m = /^\\?((?:[A-Z]\w*\\)+[A-Z]\w*)::(\w+)\b(.*)$/.exec(tekst))) {
    klasa(m[1], m[2]);
    if (/^execute\w+$/.test(m[2])) kb.runner ||= wykonawca(m[1]);
    const j = /(?:Job executed synchronously:|=>)\s*\\?((?:[A-Z]\w*\\)+[A-Z]\w*)\s*$/.exec(m[3]);
    if (j) klasa(j[1], "execute");
  }
  else if (/^#{10,}/.test(tekst) && kb.blok) {
    const b = kb.blok; kb.blok = null;
    const uri = b.uri || "", i = this.phpDostep.findIndex(d => d.uri === uri);
    const d = i >= 0 ? this.phpDostep.splice(i, 1)[0] : null;
    // metoda z access logu (php -S nie loguje wszystkich żądań — wtedy GET); pusty uri = wywołanie z CLI (cronjob)
    const sciezka = uri.replace(/\?.*$/, "") || "/", metoda = d?.metoda || "GET";
    const s = this.stan("kanboard"), w = "kanboard";
    s.kor = `a-${++this.kory}`;
    const wejscie = b.uri ? { rodzaj: "http", metoda, sciezka, nazwa: `${metoda} ${sciezka}` } : { rodzaj: "komenda", nazwa: "kanboard cli" };
    const t0 = Math.min(b.sql[0]?.ts ?? b.ts, b.ts) - 0.005, wynik = [this.zd(s, w, t0, "in", { klasa: "http", metoda: sciezka, wejscie })];
    if (b.kontroler) wynik.push(this.zd(s, w, t0 + 0.001, "in", { klasa: b.kontroler[0], metoda: b.kontroler[1] }));
    // czasy linii to sekunda + kolejność: instrukcje układamy jedna po drugiej według ich czasu trwania
    let t = t0 + 0.002;
    // Runner.execute jako pierwszy krok pod wejściem (nie rodzic kontrolera: wejście przebiegu = kontroler z trasy)
    for (const k of [...(b.runner ? [{ klasa: b.runner, metoda: "execute" }] : []), ...(b.klasy || [])]) {
      if (k.zew) wynik.push(this.zd(s, w, t, "zew", k.zew));
      else wynik.push(this.zd(s, w, t, "in", { klasa: k.klasa, metoda: k.metoda }), this.zd(s, w, t + 0.0002, "out", { klasa: k.klasa, metoda: k.metoda }));
      t += 0.0005;
    }
    for (const q of b.sql) { t = Math.max(t, q.ts) + (q.ms || 0); wynik.push(this.zd(s, w, t, "sql", { sql: wstaw(q.sql, q.par, true), ms: q.ms, ...(q.blad ? { blad: q.blad } : {}) })); t += 0.001; }
    const tk = Math.max(t, ts);
    if (b.kontroler) wynik.push(this.zd(s, w, tk, "out", { klasa: b.kontroler[0], metoda: b.kontroler[1] }));
    wynik.push(this.zd(s, w, tk, "out", { klasa: "http", metoda: sciezka, ...(d ? { status: d.status } : {}) }));
    s.kor = null;
    return wynik;
  }
  return [];
};

// Plik → zdarzenia → rekordy (spany/logi) jak z diag.mjs
export function czytajLogApp(tekst, { mapa = null, odniesienie = null } = {}) {
  // sama godzina bez strefy: z odniesieniem (chwila końca pliku) strefa z ostatniej godziny w pliku, bez niego UTC
  let ost = null;
  if (odniesienie != null) for (const l of tekst.split("\n")) { const g = GODZINA.exec(l.replace(ANSI, "")); if (g) ost = g[1]; }
  const g = ost && godzinaDnia(ost.replace(",", "."));
  ustawZegarDnia({ odniesienie: odniesienie ?? Date.now(), przes: Number.isFinite(g) ? przesuniecieStrefy(g, odniesienie) : 0 });
  zerujZegar();
  const p = new LogAplikacji({ mapa }), d = new Diag();
  return [...tekst.split("\n").flatMap(l => p.linia(l)), ...p.domknij(Infinity)].flatMap(z => d.czytaj(z));
}

export function sledzLogApp(plik, naRekordy, { co = 250, mapa = null } = {}) {
  ustawZegarDnia({ naZywo: true });
  zerujZegar();
  const p = new LogAplikacji({ mapa }), d = new Diag();
  let poz = fs.existsSync(plik) ? fs.statSync(plik).size : 0, reszta = "";
  const zegar = setInterval(() => {
    const bezczynne = p.domknij(Date.now()).flatMap(z => d.czytaj(z));
    if (bezczynne.length) naRekordy(bezczynne);
    let st; try { st = fs.statSync(plik); } catch { return; }
    if (st.size < poz) poz = 0;
    if (st.size === poz) return;
    const fd = fs.openSync(plik, "r"), buf = Buffer.alloc(st.size - poz);
    fs.readSync(fd, buf, 0, buf.length, poz); fs.closeSync(fd); poz = st.size;
    const linie = (reszta + buf.toString("utf8")).split("\n");
    reszta = linie.pop();
    const rek = linie.flatMap(l => p.linia(l)).flatMap(z => d.czytaj(z));
    if (rek.length) naRekordy(rek);
  }, co);
  return () => clearInterval(zegar);
}

// Filtr i atrybucja: surowe rekordy jednego trace (spany + logi z dowolnego źródła) → uproszczony przebieg.
// Widok dostaje tylko przebieg; nic tu nie zależy od widoku, a widok nie zależy od OTel.
//
// Krok ma rodzaj, bo każdy rysuje się inaczej:
//   wejscie     — request HTTP / job / wiadomość z kolejki (od kogoś z zewnątrz do pierwszej klasy)
//   klasa       — wejście do metody klasy z mapy (także klasa → ta sama klasa, przez this)
//   repozytorium— wywołanie repozytorium/DAO (Spring Data itp.), jeśli mapa je rysuje
//   sql         — zapytanie do bazy (tekst, tabela, czas)
//   zewnetrzne  — wywołanie innego systemu (HTTP klient, kolejka)
//   transakcja  — start (z adnotacji w mapie) / commit (z Hibernate/ORM)
//   powrot      — powrót z metody do wołającej klasy (warstwa domyślnie wyłączona)
// Logi nie są krokami — są przypięte do kroku, w którym się pojawiły.

import { oknoRequestu } from "./korelacja.mjs";
import { tabele } from "./hybryda.mjs";
import { normalizuj } from "./zrodla/log-bazy.mjs";

const KIND = { INTERNAL: 1, SERVER: 2, CLIENT: 3, PRODUCER: 4, CONSUMER: 5 };
const RYSOWANE = new Set(["wejscie", "aplikacja", "domena", "repozytorium"]);

// ---------------------------------------------------------------- rozpoznanie spanu (niezależne od technologii,
// opiera się na konwencjach semantycznych OTel: code.*, db.*, http.*, messaging.*, rpc.*)
export function klasaMetoda(s) {
  const a = s.atrybuty || {};
  if (a["code.namespace"]) return { klasa: a["code.namespace"], metoda: a["code.function"] || a["code.function.name"] || "" };
  const fn = a["code.function.name"];                    // nowsze konwencje: "pkg.Klasa.metoda"
  if (fn && fn.includes(".")) { const i = fn.lastIndexOf("."); return { klasa: fn.slice(0, i), metoda: fn.slice(i + 1) }; }
  return null;
}
const sqlSpanu = s => s.atrybuty?.["db.statement"] ?? s.atrybuty?.["db.query.text"] ?? null;
// id połączenia z bazą (log bazy: pid backendu, diag: threadId mysql2 / processID pg) — rozdziela zapytania z puli
const polaczenieSpanu = s => (s.atrybuty?.["db.pid"] != null ? { polaczenie: String(s.atrybuty["db.pid"]) } : {});
const bazaSpanu = s => s.atrybuty?.["db.name"] || s.atrybuty?.["db.namespace"] || s.atrybuty?.["db.system"] || "baza";

const BAZY_NIE_SQL = /^(redis|memcached|mongodb|elasticsearch|opensearch|cassandra|couchbase|couchdb|dynamodb|aws\.dynamodb|hbase|neo4j|cosmosdb|azure\.cosmosdb|geode|coherence|etcd|valkey)$/;
const SQL_TECHNICZNY = /^\s*(select\s+pg_advisory_unlock_all\(\)\s*;\s*close\s+all\b|reset\s+all\s*;?\s*$|discard\s+all\s*;?\s*$|select\s+pg_catalog\.version\(\)\s*;?\s*$|select\s+current_schema\(\)\s*;?\s*$|show\s+transaction\s+isolation\s+level\s*;?\s*$|show\s+standard_conforming_strings\s*;?\s*$|;?\s*$|select\s+typname\b[\s\S]*\bfrom\s+pg_type\b)/i;
const REPO_OGOLNE =/\.(Simple(Jpa|Mongo|ReactiveMongo|Jdbc|R2dbc|Neo4j|Elasticsearch|Redis|Key[Vv]alue)Repository|QuerydslJpaPredicateExecutor)$/;
export function rozpoznaj(s, mapa) {
  const fnSter = String(s.atrybuty?.["code.function.name"] || "");
  // PDO (PHP): prepare to nie wykonanie (SQL idzie w PDOStatement::execute); beginTransaction / commit / rollBack
  // sterownika = granice transakcji jak BEGIN / COMMIT w SQL
  // fetch* to czytanie wyniku już wykonanego zapytania (auto-pdo z DISTRIBUTE_STATEMENT_TO_LINKED_SPANS daje mu tekst
  // SQL — nie drugie zapytanie)
  if (/^(PDO::prepare|PDOStatement::(fetch\w*|nextRowset|closeCursor))$/i.test(fnSter)) return { typ: "zwin" };
  const txSter = /^PDO::(beginTransaction|commit|rollBack)$/i.exec(fnSter);
  if (txSter) return { typ: "txsql", faza: /^begin/i.test(txSter[1]) ? "start" : txSter[1].toLowerCase() };
  const a = s.atrybuty || {};
  // baza, która nie jest SQL (Redis, Mongo, Elasticsearch…) — inny system, nie krok SQL (db.statement to tu komenda)
  const sysDb = String(a["db.system"] || a["db.system.name"] || "").toLowerCase();
  if (BAZY_NIE_SQL.test(sysDb)) {
    const op = String(a["db.operation"] || a["db.operation.name"] || sqlSpanu(s)?.trim().split(/\s+/)[0] || s.nazwa || "").toUpperCase();
    return { typ: "zewnetrzne", cel: sysDb, opis: `${sysDb} ${op}`.trim() };
  }
  const sql = sqlSpanu(s);
  // SQL techniczny sterownika / puli, nie aplikacji: reset połączenia przy zwrocie do puli (asyncpg), inicjalizacja
  // dialektu przy pierwszym połączeniu (SQLAlchemy: version(), current_schema(), psycopg TypeInfo z pg_type), ping
  // puli (pool_pre_ping psycopg: puste „;”) — zwijamy. „SELECT 1” zostaje: bywa zapytaniem aplikacji (exists, testy)
  if (sql != null && SQL_TECHNICZNY.test(sql)) return { typ: "zwin", techniczny: true };
  if (sql != null) {
    // savepoint (transakcja zagnieżdżona: begin_nested, atomic() w atomic(), NESTED) — z samego tekstu SQL, więc
    // działa też dla logu bazy; ROLLBACK TO SAVEPOINT to nie koniec całej transakcji
    const sp = /^\s*(SAVEPOINT|RELEASE(?:\s+SAVEPOINT)?|ROLLBACK\s+TO(?:\s+SAVEPOINT)?)\s+(\S+)/i.exec(sql);
    // savepointy, które ORM zakłada sam przy każdym zapisie (EF Core: __EFSavePoint) — to nie transakcja z kodu
    if (sp && /^"?__EF/i.test(sp[2])) return { typ: "sql", sql };
    // nazwa savepointu: RELEASE / ROLLBACK TO zamyka tylko savepoint o tej nazwie (Django: RELEASE po ROLLBACK TO)
    if (sp) return { typ: "txsql", faza: /^SAVEPOINT/i.test(sp[1]) ? "start" : /^RELEASE/i.test(sp[1]) ? "commit" : "rollback", savepoint: true, nazwa: sp[2].replace(/[";`]/g, "") };
    const tx = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)\b/i.exec(sql);
    if (tx) return { typ: "txsql", faza: /^(BEGIN|START)/i.test(tx[1]) ? "start" : tx[1].toLowerCase() };
    return { typ: "sql", sql };
  }
  const km = klasaMetoda(s);
  if (km) {
    const wpis = mapa?.klasy?.[km.klasa];
    const repo = /spring-data|repository|dao/i.test(s.zakres || "");
    const rola = wpis?.rola || (repo ? "repozytorium" : null);
    // klasa-klient innego systemu (mapa: rola „zewnetrzne”) — krok do innego systemu, z klasą i metodą
    if (rola === "zewnetrzne") return { typ: "zewnetrzne", cel: wpis?.nazwa || km.klasa.split(".").pop(), ...km };
    if (rola && RYSOWANE.has(rola)) return { typ: rola === "repozytorium" ? "repozytorium" : "klasa", ...km, rola, wpis };
    // implementacja repozytorium frameworka (log transakcji: „SimpleJpaRepository.save”) — wiadomo, że to dostęp do
    // danych i jaka metoda, nie wiadomo które repozytorium (rozstrzyga szkielet statyczny: hybryda.mjs wzbogac)
    if (REPO_OGOLNE.test(km.klasa)) return { typ: "repozytorium", ...km, rola: "repozytorium", ogolne: true };
    return { typ: "zwin", ...km };
  }
  if (/Transaction\.commit|\bcommit\b/i.test(s.nazwa) && /hibernate|jpa|orm|transaction/i.test(s.zakres || s.nazwa))
    return { typ: "commit" };
  // JDBC (agent OTel z jdbc.experimental.transaction): span „COMMIT”/„ROLLBACK” bez tekstu SQL — koniec transakcji
  const opDb = String(s.atrybuty?.["db.operation.name"] || s.atrybuty?.["db.operation"] || s.nazwa || "").toUpperCase();
  if ((s.atrybuty?.["db.system"] || s.atrybuty?.["db.system.name"] || /jdbc/i.test(s.zakres || "")) && /^(COMMIT|ROLLBACK)$/.test(opDb))
    return { typ: "commit", faza: opDb.toLowerCase() };
  if (s.rodzaj === KIND.CLIENT || s.rodzaj === KIND.PRODUCER) {
    if (a["http.request.method"] || a["http.method"] || a["url.full"] || a["rpc.system"] || a["messaging.system"])
      return { typ: "zewnetrzne", cel: a["server.address"] || a["net.peer.name"] || a["messaging.destination.name"] || a["rpc.service"] || s.nazwa };
    // producent wiadomości bez messaging.system (Celery: messaging.destination, celery.action) — wysłanie do kolejki
    if (s.rodzaj === KIND.PRODUCER && Object.keys(a).some(k => /^(messaging|celery)\./.test(k)))
      return { typ: "zewnetrzne", cel: a["messaging.destination.name"] || a["messaging.destination"] || a["celery.task_name"] || s.nazwa };
  }
  return { typ: "zwin" };
}

// opis błędu spanu: typ i treść wyjątku ze zdarzenia „exception” (konwencja OTel), inaczej opis statusu
function opisBledu(s) {
  const e = (s.zdarzenia || []).find(z => z.nazwa === "exception")?.atrybuty || {};
  if (e["exception.type"]) return `${e["exception.type"]}${e["exception.message"] ? ": " + e["exception.message"] : ""}`;
  return s.status?.opis || "wyjątek";
}

// Spring: rollback przy wyjątku unchecked (RuntimeException, Error), commit przy checked — gdy dane nie mówią,
// jak transakcja się skończyła (OTel nie widzi rollbacku), wnioskujemy z typu wyjątku na metodzie @Transactional
const UNCHECKED_JDK = /^(java\.lang\.(RuntimeException|IllegalStateException|IllegalArgumentException|NullPointerException|UnsupportedOperationException|ArithmeticException|IndexOutOfBoundsException|ArrayIndexOutOfBoundsException|ClassCastException|NumberFormatException|SecurityException|\w*Error)|java\.util\.(NoSuchElementException|ConcurrentModificationException)|java\.util\.concurrent\.CompletionException|org\.springframework\.(dao|transaction|orm)\.\w+|jakarta\.persistence\.\w+|javax\.persistence\.\w+|org\.hibernate\.\w+)/;
const CHECKED_JDK = /^(java\.lang\.Exception|java\.io\.\w+|java\.sql\.\w+|java\.util\.concurrent\.(TimeoutException|ExecutionException)|java\.lang\.(InterruptedException|ReflectiveOperationException|ClassNotFoundException|CloneNotSupportedException))$/;
export function rodzajWyjatku(blad, mapa) {
  const typ = String(blad || "").split(":")[0].trim();
  if (!typ || !typ.includes(".")) return null;
  if (mapa?.wyjatki?.[typ]) return mapa.wyjatki[typ];
  if (UNCHECKED_JDK.test(typ)) return "unchecked";
  if (CHECKED_JDK.test(typ)) return "checked";
  return null;
}

// składowa „TX start” kroku metody @Transactional; z mapy: propagacja (REQUIRES_NEW → osobna transakcja) i readOnly
function skladowaTx(a = {}) {
  const opis = ["@Transactional", a.propagacja ? `(${a.propagacja})` : "", a.tylkoOdczyt ? "(readOnly)" : "", "· proxy"].filter(Boolean).join(" ");
  return { rodzaj: "transakcja", faza: "start", zrodlo: "adnotacja", opis, ...(a.propagacja ? { propagacja: a.propagacja } : {}), ...(a.tylkoOdczyt ? { tylkoOdczyt: true } : {}) };
}
const NOWA_TX = new Set(["REQUIRES_NEW", "NESTED"]);

// jedna normalizacja SQL dla całego flow-lens (te same zasady w porownaj, hybryda i log-bazy)
const normSql = t => normalizuj(String(t || ""));

const pasuje = (wzorce, tekst) => (wzorce || []).some(w => new RegExp(w).test(tekst));

// Szablon ścieżki wejścia HTTP z http.route i faktycznego adresu. Instrumentacje różnie podają trasę:
//  • bez wiodącego „/” (ASP.NET Core, Django: „api/users/{id}”) → dokładamy „/”;
//  • tylko końcówkę (Express z podrouterem bez ścieżki gubi prefiks: „/articles/:slug” dla „/api/articles/x”) →
//    brakujący prefiks z adresu;
//  • nazwę trasy zamiast ścieżki (Symfony: „courses_put”) albo wzorzec serwletu („/*.action”) → adres;
//  • brak trasy (request odrzucony przed routerem, np. 401 z koa-jwt) → adres.
const PARAM_SEG = /^(:\w|\{.*\}$|<.*>$|\*|\(.*\)$|\[.*\]$)/;
export const bezMacierzy = sciezka => String(sciezka).replace(/;[^/?#]*/g, "");
export function szablonTrasy(trasa, adres) {
  const raw = String(trasa ?? "").trim();
  if (!raw) return adres ? { szablon: adres } : null;
  const t = raw.startsWith("/") ? raw : "/" + raw;
  if (!adres) return { szablon: raw.includes("/") || !/^[\w.-]+$/.test(raw) ? t : raw };
  const st = t.split("/").filter(Boolean), sa = adres.split("/").filter(Boolean);
  const zgodny = (w, s) => PARAM_SEG.test(w) || w === s || (w.includes("*") && new RegExp("^" + w.split("*").map(x => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(s));
  const odKonca = st.length && st.length <= sa.length && st.every((w, i) => zgodny(w, sa[sa.length - st.length + i]));
  if (odKonca && !st.some(w => w.includes("*"))) {
    const prefiks = sa.slice(0, sa.length - st.length);
    return { szablon: (prefiks.length ? "/" + prefiks.join("/") : "") + t };
  }
  if (!st.length && !sa.length) return { szablon: t };
  // nazwa trasy (bez „/”) albo wzorzec z „*” — konkretny adres mówi więcej
  if (!raw.includes("/") || raw.includes("*")) return { szablon: adres, ...(raw !== adres ? { trasa: raw } : {}) };
  return { szablon: t };
}

// ---------------------------------------------------------------- przebieg z rekordów jednego trace
// Konsument wiadomości (span CONSUMER) w środku cudzego śladu — kontekst przeszedł przez kolejkę (Kafka, RabbitMQ,
// SQS) od producenta. Przetworzenie wiadomości to osobne wejście: jego poddrzewo (i logi) wycinamy do osobnej grupy.
export function rozetnijKonsumentow(rekordy) {
  const spany = rekordy.filter(r => r.typ === "span");
  const poId = new Map(spany.map(s => [s.span, s]));
  // także konsumenci pod nieobecnym rodzicem, gdy jest ich kilku: worker kolejki z jednym długim śladem (Laravel
  // queue:work — każde „receive” to osobne pobranie z kolejki pod spanem procesu, który nie kończy się do zamknięcia)
  const konsumenci = spany.filter(s => s.rodzaj === KIND.CONSUMER && s.rodzic);
  const ciecia = konsumenci.filter(s => poId.has(s.rodzic) || konsumenci.length > 1);
  if (!ciecia.length) return [rekordy];
  const grupa = new Map();                                     // span → id cięcia (najbliższy konsument-przodek)
  const doCiecia = s => {
    if (grupa.has(s.span)) return grupa.get(s.span);
    const g = ciecia.includes(s) ? s.span : s.rodzic && poId.has(s.rodzic) ? doCiecia(poId.get(s.rodzic)) : null;
    grupa.set(s.span, g);
    return g;
  };
  const wynik = new Map([[null, []]]);
  for (const r of rekordy) {
    const g = r.typ === "span" ? doCiecia(r) : r.span && poId.has(r.span) ? doCiecia(poId.get(r.span)) : null;
    if (!wynik.has(g)) wynik.set(g, []);
    wynik.get(g).push(g && r.span === g && r.typ === "span" ? { ...r, rodzic: "", trace: `${r.trace}/${g}` } : g ? { ...r, trace: `${r.trace}/${g}` } : r);
  }
  // puste pobranie z kolejki (polling bez wiadomości: brak messaging.message.id, w środku tylko SQL frameworka) — szum
  const pustePobranie = g => { const k = g.find(r => r.typ === "span" && !r.rodzic && r.rodzaj === KIND.CONSUMER);
    return k && !k.atrybuty?.["messaging.message.id"] && !g.some(r => r.typ === "span" && klasaMetoda(r)?.klasa?.includes(".")); };
  return [...wynik.values()].filter(x => x.length && !pustePobranie(x));
}

// PDO (auto-pdo bez DISTRIBUTE_STATEMENT_TO_LINKED_SPANS): tekst SQL jest tylko na PDO::prepare, a
// PDOStatement::execute ma do niego link — wykonanie dostaje tekst z linku albo z ostatniego prepare u tego samego rodzica
export function tekstZPrepare(spany) {
  const fn = s => String(s.atrybuty?.["code.function.name"] || "");
  if (!spany.some(s => /^PDOStatement::execute$/i.test(fn(s)) && sqlSpanu(s) == null)) return spany;
  const poId = new Map(spany.map(s => [s.span, s]));
  const prep = spany.filter(s => /^PDO::prepare$/i.test(fn(s)) && sqlSpanu(s) != null).sort((x, y) => x.start - y.start);
  return spany.map(s => {
    if (!/^PDOStatement::execute$/i.test(fn(s)) || sqlSpanu(s) != null) return s;
    const p = (s.linki || []).map(l => poId.get(l.span)).find(x => x && sqlSpanu(x) != null)
      || prep.filter(x => x.rodzic === s.rodzic && x.trace === s.trace && x.start <= s.start + 0.001).at(-1);
    if (!p) return s;
    // to samo zapytanie widziane już wyżej (span zapytania ORM jako rodzeństwo albo przodek: Laravel „sql SELECT”) —
    // wykonanie PDO zostaje bez tekstu, inaczej SQL byłby dwa razy
    const n = normSql(sqlSpanu(p));
    const wyzej = x => x && x !== s && !/^PDO/i.test(fn(x)) && sqlSpanu(x) != null && normSql(sqlSpanu(x)) === n;
    for (let x = poId.get(s.rodzic); x; x = poId.get(x.rodzic)) if (wyzej(x)) return s;
    if (spany.some(x => x.rodzic === s.rodzic && wyzej(x) && x.start <= s.koniec + 1 && x.koniec >= s.start - 1)) return s;
    return { ...s, atrybuty: { ...s.atrybuty, "db.query.text": sqlSpanu(p) } };
  });
}

// SQL schematu i katalogu bazy; tabele migracji (EF Core, Flyway, Liquibase, Laravel/Doctrine/Django)
const SCHEMAT = /^\s*(create|alter|drop)\s|information_schema|pg_catalog\.|sqlite_master/i;
const MIGRACJE = /^\s*pragma\s|__EFMigrations(History|Lock)|flyway_schema_history|databasechangelog(lock)?\b|\b(migrations|doctrine_migration_versions|django_migrations)\b/i;

// Kolejność rodzeństwa po starcie. SDK OTel JS 2.x bierze start z Date.now() (pełne ms), więc zapytania z tej samej
// ms mają ten sam start, a przy remisie rozstrzyga kolejność nadejścia (końca spanu) — koniec z innego zegara też nie
// mówi, co poszło pierwsze. Remis startu spanów OTLP: granice transakcji według sensu — BEGIN przed resztą, COMMIT /
// ROLLBACK po reszcie (zapytanie z błędem kończy się po ROLLBACK, który wysłał jego handler); reszta w kolejności
// nadejścia. Gdy w remisie są oba rodzaje granic (COMMIT jednej i BEGIN następnej transakcji) — bez zmian.
// Rekordy z logów (zrodlo: log bazy, log diagnostyczny, log frameworka) mają kolejność zapisu — remis zostaje bez zmian.
const GRANICA_TX = s => {
  const t = String(sqlSpanu(s) ?? "");
  if (/^\s*(BEGIN|START\s+TRANSACTION|SAVEPOINT)\b/i.test(t) || /^PDO::beginTransaction$/i.test(s.atrybuty?.["code.function.name"] || "")) return -1;
  if (/^\s*(COMMIT|ROLLBACK|RELEASE)\b/i.test(t) || /^PDO::(commit|rollBack)$/i.test(s.atrybuty?.["code.function.name"] || "")) return 1;
  if (!t && /^(COMMIT|ROLLBACK)$/i.test(String(s.atrybuty?.["db.operation.name"] || s.atrybuty?.["db.operation"] || s.nazwa || ""))) return 1;
  return 0;
};
function poKolei(l) {
  l.sort((a, b) => a.start - b.start);
  for (let i = 0; i < l.length;) {
    let j = i + 1;
    while (j < l.length && l[j].start === l[i].start) j++;
    const remis = l.slice(i, j);
    if (remis.length > 1 && remis.every(s => !s.zrodlo || s.zrodlo === "otlp")) {
      const g = remis.map(GRANICA_TX);
      if (!(g.includes(-1) && g.includes(1))) { remis.sort((a, b) => GRANICA_TX(a) - GRANICA_TX(b)); l.splice(i, remis.length, ...remis); }
    }
    i = j;
  }
  return l;
}

export function zlozPrzebieg(rekordy, mapa = null) {
  const spany = tekstZPrepare(rekordy.filter(r => r.typ === "span"));
  const logi = rekordy.filter(r => r.typ === "log").sort((a, b) => a.ts - b.ts);
  if (!spany.length) return null;
  const poId = new Map(spany.map(s => [s.span, s]));
  const dzieci = new Map();
  const korzenie = [];
  for (const s of spany) {
    if (s.rodzic && poId.has(s.rodzic)) {
      if (!dzieci.has(s.rodzic)) dzieci.set(s.rodzic, []);
      dzieci.get(s.rodzic).push(s);
    } else korzenie.push(s);
  }
  for (const l of dzieci.values()) poKolei(l);
  poKolei(korzenie);
  const korzen = korzenie.find(s => s.rodzaj === KIND.SERVER || s.rodzaj === KIND.CONSUMER) || korzenie[0];
  const t0 = Math.min(...spany.map(s => s.start));

  // uczestnicy rysunku
  const uczestnicy = new Map();
  const uczestnik = (id, dane) => { if (!uczestnicy.has(id)) uczestnicy.set(id, { id, ...dane }); return id; };

  const a = korzen.atrybuty || {};
  const http = a["http.request.method"] || a["http.method"];
  const kmKorzenia = klasaMetoda(korzen);
  // faktyczny adres requestu — gdy trasa to wzorzec serwletu („/wypozyczenia/*”), dopiero on mówi, co wywołano
  // bez parametrów macierzowych w segmentach (serwlety: „;jsessionid=…” w adresie, gdy przeglądarka nie ma jeszcze
  // ciasteczka — JSF wpisuje go w action formularza): to ten sam zasób
  const adres = (a["url.path"] || a["http.target"]) ? bezMacierzy(String(a["url.path"] || a["http.target"]).split("?")[0]) : null;
  const tr = http ? szablonTrasy(a["http.route"], adres) : null;
  const wejscie = {
    rodzaj: korzen.rodzaj === KIND.CONSUMER ? "kolejka" : http ? "http" : "job",
    // nazwa jak „METODA /szablon” (jedna dla wszystkich źródeł): span serwera nazwany samą metodą (request odrzucony
    // przed routerem) albo trasą bez „/”, nazwą trasy, wzorcem serwletu — przebudowujemy z szablonu
    nazwa: tr && [http, `${http} ${a["http.route"] ?? ""}`.trim(), String(a["http.route"] ?? "")].includes(korzen.nazwa) && tr.szablon ? `${http} ${tr.szablon}` : korzen.nazwa,
    metoda: http || "", sciezka: tr?.szablon || a["http.route"] || adres || "",
    ...(tr?.trasa ? { trasa: tr.trasa } : {}),
    ...(adres ? { adres } : {}),
    // zdarzenie w parametrze, nie w ścieżce (JSON-RPC: rpc.method) — ta sama nazwa wejścia dla wielu operacji
    ...(a["rpc.method"] ? { zdarzenie: a["rpc.method"] } : {}),
    status: a["http.response.status_code"] ?? a["http.status_code"] ?? null,
    blad: korzen.status?.kod === 2 ? (korzen.status.opis || "błąd") : null,
  };
  if (mapa && pasuje(mapa.pomin_sciezki, wejscie.sciezka || wejscie.nazwa)) return null;
  // Korzeń bez requestu (test, job, wątek tła) liczy się jako przebieg, gdy jest wejściem albo fasadą/serwisem
  // aplikacji. Wywołanie samego obiektu domenowego (np. Id.newOne() z testu) to szum, nie przepływ — chyba że pod
  // nim jest dostęp do danych, inny system albo warstwa aplikacji (konsument wiadomości bez spanu CONSUMER, którego
  // korzeniem jest szyna z rolą domeny: MessageBus.handle) — sprawdzamy to po złożeniu kroków.
  let korzenDomenowy = false;
  if (mapa && kmKorzenia && korzen.rodzaj !== KIND.SERVER && korzen.rodzaj !== KIND.CONSUMER && !mapa.korzenie_domenowe) {
    const rk = rozpoznaj(korzen, mapa);
    korzenDomenowy = rk.typ === "klasa" && rk.rola === "domena" && !/^(w tle|job)$/.test(korzen.atrybuty?.["flowlens.wejscie"] || "");
  }
  const KTO = uczestnik("wejscie", { rodzaj: "wejscie", nazwa: wejscie.rodzaj === "http" ? "użytkownik / klient HTTP" : wejscie.rodzaj === "kolejka" ? "kolejka" : "w tle (job / test)", poziom: -1 });

  const kroki = [];
  let zwiniete = 0;

  // r = krok nadrzędny (najbliższy zachowany przodek) — widok rysuje strzałkę od niego, gdy uczestnik jest ukryty
  const watek = s => { const a = poId.get(s)?.atrybuty || {}; return a["thread.name"] ?? (a["thread.id"] != null ? String(a["thread.id"]) : null); };
  const dodaj = (k, r = null) => { k.nr = kroki.length; k.ts = +(k.ts - t0).toFixed(3); k._r = r; k.watek = watek(k.span); kroki.push(k); return k; };

  // kto = uczestnik, z którego „wychodzi” wywołanie (najbliższy zachowany przodek); spany zwinięte nie zmieniają kto
  function odwiedz(s, kto, glebokosc, krokRodzica) {
    let r = s === korzen && !kmKorzenia ? { typ: "zwin" } : rozpoznaj(s, mapa);
    // repozytorium w repozytorium (proxy Spring Data → implementacja): ta sama metoda dwa razy — wewnętrzne zwijamy
    if (r.typ === "repozytorium" && kto === r.klasa && krokRodzica?.metoda === r.metoda) r = { typ: "zwin" };
    if (r.typ === "klasa" || r.typ === "repozytorium") {
      const id = uczestnik(r.klasa, {
        rodzaj: r.typ === "repozytorium" ? "repozytorium" : "klasa", rola: r.rola, klasa: r.klasa,
        nazwa: r.wpis?.nazwa || r.klasa.split(/[.$]/).pop(), poziom: r.wpis?.poziom ?? (r.typ === "repozytorium" ? 98 : null),
        plik: r.wpis?.plik || null,
      });
      const zKogo = kto;
      const transakcyjna = (r.wpis?.transakcyjne || []).includes(r.metoda);
      const k = dodaj({
        rodzaj: r.typ, z: zKogo, do: id, klasa: r.klasa, metoda: r.metoda,
        ts: s.start, czas: +(s.koniec - s.start).toFixed(3), span: s.span, glebokosc, samWsobie: zKogo === id,
        blad: s.status?.kod === 2 ? opisBledu(s) : null, logi: [],
        ...(transakcyjna && zKogo === id ? { ostrzezenie: "@Transactional wywołane przez this — bez proxy adnotacja nie działa" } : {}),
        // składowe: to, co wykonuje się wokół kroku (proxy / aspekt), w tej samej chwili — nie osobny krok
        ...(transakcyjna && zKogo !== id ? { skladowe: [skladowaTx(r.wpis?.transakcje?.[r.metoda])] } : {}),
      }, krokRodzica);
      for (const d of dzieci.get(s.span) || []) odwiedz(d, id, glebokosc + 1, k);
      if (zKogo !== id && zKogo !== KTO) dodaj({ rodzaj: "powrot", z: id, do: zKogo, klasa: r.klasa, metoda: r.metoda, ts: s.koniec, czas: 0, span: s.span, glebokosc }, krokRodzica);
      return;
    }
    if (r.typ === "sql") {
      // ten sam SQL z dwóch warstw instrumentacji jako rodzeństwo (ORM i sterownik), nakładający się w czasie —
      // jedno zapytanie; powtórka N+1 idzie po kolei, nie w środku poprzedniej. Dwa rekordy z jednej warstwy (ten sam
      // zakres i źródło: log EF Core z dokładnością do 1 ms i czasem 0 ms, paczka rozbita na polecenia) to dwa
      // polecenia, chyba że drugie zaczyna się ściśle w środku pierwszego
      // granica transakcji z warstwy sterownika w środku spanu zapytania ORM (asyncpg „BEGIN;” w spanie SQLAlchemy)
      // nie rozdziela tych dwóch spanów — porównujemy z zapytaniem sprzed niej
      let ip = kroki.length - 1;
      while (ip > 0 && kroki[ip].rodzaj === "transakcja" && kroki[ip - 1].rodzaj === "sql" && kroki[ip - 1]._okno
             && poId.get(kroki[ip].span)?.start >= kroki[ip - 1]._okno[0] && poId.get(kroki[ip].span)?.start <= kroki[ip - 1]._okno[1]) ip--;
      const pop = kroki[ip], sPop = pop && poId.get(pop.span);
      const taSamaWarstwa = sPop && (sPop.zakres || "") === (s.zakres || "") && (sPop.zrodlo || "") === (s.zrodlo || "");
      if (pop?.rodzaj === "sql" && pop._r === krokRodzica && pop._okno && s.start >= pop._okno[0] - 0.01
          && (taSamaWarstwa ? s.start < pop._okno[1] - 0.001 : s.start <= pop._okno[1] + 0.01)
          && normSql(pop.sql) === normSql(s.atrybuty?.["db.statement.z_wartosciami"] || r.sql)) return;
      const baza = uczestnik("baza:" + bazaSpanu(s), { rodzaj: "baza", nazwa: bazaSpanu(s), poziom: 99 });
      const k = dodaj({
        rodzaj: "sql", z: kto, do: baza, sql: s.atrybuty?.["db.statement.z_wartosciami"] || r.sql, ...(s.zrodlo === "log-bazy" ? { zrodloSql: "log-bazy" } : {}),
        ...polaczenieSpanu(s),
        // surowy tekst z placeholderami (diag Pythona, log bazy), gdy sql ma wpisane wartości — do porównań z OTel
        ...(s.atrybuty?.["db.statement.szablon"] && s.atrybuty["db.statement.szablon"] !== (s.atrybuty?.["db.statement.z_wartosciami"] || r.sql) ? { szablon: s.atrybuty["db.statement.szablon"] } : {}),
        ...(s.atrybuty?.["flowlens.flush"] ? { flush: true } : {}), operacja: s.atrybuty?.["db.operation"] || s.atrybuty?.["db.operation.name"] || r.sql.trim().split(/\s+/)[0].toUpperCase(),
        // bez atrybutu (instrumentacja pg, mysql2, log diagnostyczny) — pierwsza tabela z tekstu instrukcji
        tabela: s.atrybuty?.["db.sql.table"] || s.atrybuty?.["db.collection.name"] || tabele(r.sql)[0] || null,
        ts: s.start, czas: +(s.koniec - s.start).toFixed(3), span: s.span, glebokosc, logi: [],
        blad: s.status?.kod === 2 ? opisBledu(s) : null,
      }, krokRodzica);
      Object.defineProperty(k, "_okno", { value: [s.start, s.koniec], enumerable: false });
      // span bazy w spanie bazy = ta sama operacja niżej (ORM → sterownik: SQLAlchemy + psycopg, Hibernate + JDBC):
      // pomijamy go, ale jego dzieci (inne niż baza) zostają
      const pomin = d => { const rd = rozpoznaj(d, mapa); return rd.typ === "sql" || rd.typ === "txsql"; };
      for (const d of dzieci.get(s.span) || []) {
        if (pomin(d)) { for (const dd of dzieci.get(d.span) || []) if (!pomin(dd)) odwiedz(dd, kto, glebokosc, k); continue; }
        odwiedz(d, kto, glebokosc, k);
      }
      return;
    }
    if (r.typ === "zewnetrzne") {
      const cel = uczestnik("zew:" + r.cel, { rodzaj: "zewnetrzny", nazwa: r.cel, poziom: null });
      const k = dodaj({ rodzaj: "zewnetrzne", z: kto, do: cel, opis: r.klasa ? `${r.cel}.${r.metoda}()` : r.opis || s.nazwa, ...(r.klasa ? { klasa: r.klasa, metoda: r.metoda } : {}), ts: s.start, czas: +(s.koniec - s.start).toFixed(3), span: s.span, glebokosc, logi: [], atrybuty: wybraneAtrybuty(s) }, krokRodzica);
      for (const d of dzieci.get(s.span) || []) odwiedz(d, kto, glebokosc, k);
      return;
    }
    if (r.typ === "txsql") {
      // ta sama faza transakcji z dwóch źródeł (instrumentacja sterownika i zdarzenie ORM: ADO.NET „BEGIN” i EF
      // TransactionStarted) — jeden krok: tuż po sobie w czasie albo pod tym samym rodzicem bez niczego pomiędzy
      const ost = kroki.at(-1);
      // transakcja z samym SQL technicznym (inicjalizacja połączenia: BEGIN, SELECT … FROM pg_type, COMMIT) — nie
      // transakcja aplikacji: usuwamy BEGIN i pomijamy jej koniec
      if (r.faza !== "start" && ost?._techniczna && ost._r === krokRodzica && !r.savepoint) { kroki.pop(); return; }
      if (ost?.rodzaj === "transakcja" && ost.faza === r.faza && !!r.savepoint === !!ost.savepoint && (ost.savepointNazwa ?? null) === (r.nazwa ?? null)
          && (Math.abs((s.start - t0) - ost.ts) < 3 || (ost._r === krokRodzica && ost._zakres !== (s.zakres || "")))) return;
      // ta sama faza z innej warstwy pod tym samym rodzicem, a od tamtej nie było żadnej innej granicy transakcji:
      // sterownik wysyła BEGIN leniwie, razem z pierwszym zapytaniem (asyncpg „BEGIN;” w środku spanu zapytania
      // SQLAlchemy, a BEGIN ORM-u — flowlens.metody — był przed nim), więc między nimi stoi już krok SQL
      const ostTx = kroki.findLast(x => x.rodzaj === "transakcja");
      if (ostTx && ostTx !== ost && ostTx._r === krokRodzica && ostTx.faza === r.faza && !r.savepoint && !ostTx.savepoint
          && ostTx._zakres != null && ostTx._zakres !== (s.zakres || "")) return;
      // BEGIN jako pierwsze dziecko metody @Transactional = ta sama transakcja, którą otwiera proxy: potwierdzenie
      // składowej „TX start” (log diagnostyczny, proxy JDBC), nie osobny krok
      const skl = r.faza === "start" && !r.savepoint && krokRodzica?.skladowe?.find(x => x.rodzaj === "transakcja" && x.faza === "start");
      if (skl && !kroki.some(x => x._r === krokRodzica)) {
        if (!skl.potwierdzona) { skl.potwierdzona = "SQL"; skl.opis += " · BEGIN w bazie"; skl._zakres = s.zakres || ""; return; }
        if (skl._zakres !== (s.zakres || "")) return;              // ten sam BEGIN z drugiego źródła
      }
      const k = dodaj({ rodzaj: "transakcja", faza: r.faza, zrodlo: "SQL", ...polaczenieSpanu(s), ...(r.savepoint ? { savepoint: true } : {}), ...(r.nazwa ? { savepointNazwa: r.nazwa } : {}), z: kto, do: kto, ts: s.start, czas: +(s.koniec - s.start).toFixed(3), span: s.span, glebokosc, logi: [] }, krokRodzica);
      Object.defineProperty(k, "_zakres", { value: s.zakres || "", enumerable: false });
      return;
    }
    if (r.typ === "commit") {
      // commit w commicie (Hibernate → JDBC) to ta sama operacja niżej — pomijamy, dzieci zostają pod wyższym
      if (krokRodzica?.rodzaj === "transakcja" && ["commit", "rollback"].includes(krokRodzica.faza)) {
        for (const d of dzieci.get(s.span) || []) odwiedz(d, kto, glebokosc, krokRodzica);
        return;
      }
      // ten sam commit z dwóch warstw połączenia (pula + TransactionAwareDataSourceProxy) — jeden krok
      const ost = kroki.at(-1);
      if (ost?.rodzaj === "transakcja" && ost.faza === (r.faza || "commit") && !ost.savepoint
          && (Math.abs((s.start - t0) - ost.ts) < 3 || (ost._r === krokRodzica && ost._zakres !== (s.zakres || "")))) return;
      const k = dodaj({ rodzaj: "transakcja", faza: r.faza || "commit", zrodlo: s.zakres || "orm", z: kto, do: kto, ts: s.start, czas: +(s.koniec - s.start).toFixed(3), span: s.span, glebokosc, logi: [] }, krokRodzica);
      Object.defineProperty(k, "_zakres", { value: s.zakres || "", enumerable: false });
      for (const d of dzieci.get(s.span) || []) odwiedz(d, kto, glebokosc, k);
      return;
    }
    // zwinięty (klasa spoza mapy, Hibernate Query, Tomcat…): dzieci idą do najbliższego zachowanego przodka
    if (s !== korzen) zwiniete += 1;
    // SQL techniczny tuż po BEGIN (psycopg TypeInfo w swojej transakcji) — znacznik dla COMMIT, który ją zamknie
    const ostK = kroki.at(-1);
    if (r.techniczny && ostK?.rodzaj === "transakcja" && ostK.faza === "start" && ostK._r === krokRodzica)
      Object.defineProperty(ostK, "_techniczna", { value: true, configurable: true });
    for (const d of dzieci.get(s.span) || []) odwiedz(d, kto, glebokosc, krokRodzica);
  }
  for (const k of korzenie) odwiedz(k, KTO, 0, null);

  // Gdy pierwszą klasą jest kontroler/listener z mapy — to on jest wejściem. Inaczej (bez mapy, albo kontroler
  // spoza mapy) wejściem jest sam endpoint: osobny uczestnik na górze, a wywołania „od świata” idą od niego.
  // request bez żadnego kroku (bez SQL, poza mapą) to nadal request: zostaje samo wejście (endpoint)
  // (job oznaczony przez źródło — łatka na cron, log frameworka — też: wejście jest, nawet gdy w środku jest tylko log)
  const wTle = /^(w tle|job)$/.test(korzen.atrybuty?.["flowlens.wejscie"] || "");
  if (!kroki.length && korzen.rodzaj !== KIND.SERVER && korzen.rodzaj !== KIND.CONSUMER && korzen.atrybuty?.["flowlens.wejscie"] !== "job") return null;
  // bez requestu i bez żadnej klasy z mapy (np. pg-pool.connect, odpytywanie kolejki w tle) — szum bibliotek
  // (wyjątek: praca w tle rozpoznana przez źródło — log frameworka oznacza ją jako wejście „w tle” albo job)
  if (mapa && !wTle && korzen.rodzaj !== KIND.SERVER && korzen.rodzaj !== KIND.CONSUMER && !kroki.some(k => k.rodzaj === "klasa" || k.rodzaj === "repozytorium")) return null;
  if (korzenDomenowy && !kroki.some(k => ["sql", "zewnetrzne", "repozytorium"].includes(k.rodzaj)
      || (k.rodzaj === "transakcja" && k.faza === "start") || (k.rodzaj === "klasa" && ["wejscie", "aplikacja"].includes(uczestnicy.get(k.do)?.rola)))) return null;
  const pierwszy = kroki.find(k => k.z === KTO && k.rodzaj !== "transakcja");
  const bezRequestu = korzen.rodzaj !== KIND.SERVER && korzen.rodzaj !== KIND.CONSUMER;
  // praca w tle z samym SQL schematu (TypeORM synchronize, CREATE TABLE IF NOT EXISTS przy starcie) — start aplikacji,
  // nie request ani job: oznaczenie, żeby porównania i listy mogły go pominąć (OTel go nie widzi — spany bez korzenia)
  // To samo, gdy przebieg ma kroki klas (tryby z metodami: DatabaseInitializer.InitializeAsync → DbContext.OnModelCreating),
  // a każdy jego SQL to schemat, katalog albo tabela migracji (EF __EFMigrationsHistory/Lock, Flyway, Liquibase, Laravel)
  const sqlKroki = kroki.filter(k => k.rodzaj === "sql");
  if (bezRequestu && sqlKroki.length && (kroki.every(k => k.rodzaj === "transakcja" || k.rodzaj === "sql")
        ? sqlKroki.some(k => SCHEMAT.test(k.sql)) : sqlKroki.every(k => SCHEMAT.test(k.sql) || MIGRACJE.test(k.sql)))) wejscie.start = true;
  // zdarzenie jako nazwa parametru (Stripes/Struts: „?viewCategory=&categoryId=…”) — gdy jest nią metoda pierwszej klasy
  const query = String(a["url.query"] || (String(a["http.target"] || "").split("?")[1] ?? "")).replace(/^\?/, "");
  const pierwszaKlasa = kroki.find(k => k.rodzaj === "klasa" && k.metoda);
  // wiadomość bez nazwy (auto-laravel: „process (anonymous)”) — nazwa od klasy-wejścia z mapy (job: DispatchWebhookJob.handle)
  const klasaWejscia = /\(anonymous\)/.test(wejscie.nazwa) && kroki.find(k => k.rodzaj === "klasa" && uczestnicy.get(k.do)?.rola === "wejscie");
  if (klasaWejscia) { wejscie.nazwaZrodla = wejscie.nazwa; wejscie.nazwa = `${uczestnicy.get(klasaWejscia.do).nazwa}.${klasaWejscia.metoda}`; }
  if (!wejscie.zdarzenie && query && pierwszaKlasa && query.split("&").some(p => p.split("=")[0] === pierwszaKlasa.metoda))
    wejscie.zdarzenie = pierwszaKlasa.metoda;
  if (pierwszy && pierwszy.rodzaj === "klasa" && (uczestnicy.get(pierwszy.do)?.rola === "wejscie" || bezRequestu)) {
    pierwszy.rodzaj = "wejscie"; pierwszy.wejscie = wejscie;
  } else {
    const ep = uczestnik("endpoint", { rodzaj: "endpoint", nazwa: wejscie.sciezka ? `${wejscie.metoda} ${wejscie.sciezka}`.trim() : wejscie.nazwa, poziom: 0 });
    for (const k of kroki) { if (k.z === KTO) k.z = ep; if (k.do === KTO) k.do = ep; }
    kroki.unshift({ rodzaj: "wejscie", z: KTO, do: ep, ts: +(korzen.start - t0).toFixed(3), czas: +(korzen.koniec - korzen.start).toFixed(3), span: korzen.span, glebokosc: 0, wejscie, logi: [], watek: watek(korzen.span) });
    kroki.forEach((k, i) => (k.nr = i));
  }

  if (mapa?.zwijaj_powtorzenia !== false) {
    const zostaja = zwinPowtorzenia(kroki);
    kroki.length = 0;
    kroki.push(...zostaja);
    kroki.forEach((k, i) => (k.nr = i));
  }
  if (mapa?.zwijaj_wewnetrzne !== false) {
    const zostaja = zwinWewnetrzne(kroki);
    kroki.length = 0;
    kroki.push(...zostaja);
    kroki.forEach((k, i) => (k.nr = i));
  }
  for (const k of kroki) { k.rodzic = k._r ? k._r.nr : k === kroki[0] ? null : kroki[0].nr; delete k._r; }
  // klasa, z której SQL wychodzi bez repozytorium (sam sterownik, JdbcTemplate, query builder albo leniwe ładowanie
  // ORM) też należy do warstwy dostępu do danych — oznaczenie dla rysunku i oceny
  for (const k of kroki) if (k.rodzaj === "sql" && uczestnicy.get(k.z)?.rodzaj === "klasa") uczestnicy.get(k.z).wysylaSql = true;
  const transakcje = liczTransakcje(kroki, mapa);

  // logi → krok: ostatni krok (do chwili logu) w poddrzewie najbliższej klasy z mapy. Log pojawia się w przebiegu
  // dokładnie wtedy, kiedy padł: po SQL-u, który był przed nim, a nie przy wejściu do klasy.
  const przodkowie = s => { const w = []; for (let x = poId.get(s); x; x = poId.get(x.rodzic)) w.push(x.span); return w; };
  const wejsciowe = new Set(kroki.filter(k => ["klasa", "repozytorium", "wejscie"].includes(k.rodzaj)).map(k => k.span));
  const odTylu = [...kroki].reverse().filter(k => k.rodzaj !== "powrot");
  for (const l of logi) {
    const tsl = l.ts - t0;
    let cel = null;
    if (l.span && poId.has(l.span)) {
      const A = przodkowie(l.span).find(s => wejsciowe.has(s));
      if (A) cel = odTylu.find(k => k.ts <= tsl + 0.001 && (k.span === A || przodkowie(k.span).includes(A)));
    }
    cel = cel || odTylu.find(k => k.ts <= tsl + 0.001) || kroki[0];
    (cel.logi = cel.logi || []).push({ ts: +tsl.toFixed(3), poziom: l.poziom, tekst: l.tekst, zrodlo: l.zrodlo || "otlp", zakres: l.zakres });
  }

  return {
    kind: "przebieg", id: korzen.trace, projekt: mapa?.projekt || null, ts: t0, czas: +(Math.max(...spany.map(s => s.koniec)) - t0).toFixed(3),
    wejscie, uczestnicy: [...uczestnicy.values()], kroki, transakcje,
    zrodla: [...new Set(rekordy.map(r => r.zrodlo || "otlp"))],
    statystyki: { spany: spany.length, zwiniete, sql: kroki.filter(k => k.rodzaj === "sql").length, logi: logi.length },
    bezMapy: !mapa,
  };
}

// Transakcje jako zakresy przebiegu (problem ortogonalny do warstw: jedna transakcja obejmuje kilka klas, kilka
// warstw i bazę). Skąd wiemy, gdzie się zaczyna i kończy — bez zgadywania, z tego, co faktycznie się wykonało:
//  • adnotacja (@Transactional z mapy) przy wejściu z innej klasy (przez proxy): od wejścia do końca tej metody —
//    start jest składową kroku wejścia (dzieje się nad nim, w proxy), nie osobnym krokiem;
//    jeśli na tym samym wątku trwa już transakcja — to dołączenie (propagacja REQUIRED), nie nowa;
//  • BEGIN … COMMIT/ROLLBACK wysłane jako SQL: od BEGIN do COMMIT na tym samym wątku;
//  • commit ORM bez adnotacji nad nim (np. repozytorium Spring Data ma własną): zakres = krok nadrzędny.
// Krok w zakresie na innym wątku niż ten, który otworzył transakcję = poza transakcją (kontekst transakcji jest
// przypięty do wątku: @Async, pula wątków, CompletableFuture). Krok wywołany przez this z adnotacją — bez proxy.
export function liczTransakcje(kroki, mapaTx = null) {
  const poNr = kroki;
  const potomek = (k, przodek) => { for (let r = k.rodzic; r != null; r = poNr[r].rodzic) if (r === przodek.nr) return true; return false; };
  const koniecPoddrzewa = glowa => { let j = glowa.nr; for (let i = glowa.nr + 1; i < kroki.length; i++) if (potomek(kroki[i], glowa) || kroki[i].span === glowa.span) j = i; return j; };
  const wynik = [];
  const otwarta = (i, w) => wynik.find(t => t.od <= i && i <= t.do && (t.watek ?? null) === (w ?? null));
  // transakcje z BEGIN widzianym w danych (log diagnostyczny, log bazy, log frameworka): stos per wątek —
  // COMMIT/ROLLBACK zamyka ostatnią otwartą; BEGIN w środku otwartej = osobna transakcja (REQUIRES_NEW, inne połączenie)
  const stosTx = new Map();
  // commit tuż po końcu transakcji z adnotacji (pomiędzy same powroty) = jej koniec: robi go proxy na granicy metody,
  // którego nie instrumentujemy — dlatego span commitu wisi pod wołającym, poziom wyżej. Także wewnątrz innej
  // transakcji (REQUIRES_NEW kończy się commitem pod metodą wołającą, w trakcie zewnętrznej).
  const proxyCommit = k => {
    const ost = wynik.filter(t => t.zrodlo.startsWith("adnotacja") && t.watek === k.watek && t.do < k.nr && t.commitProxy == null)
      .reduce((m, t) => (!m || t.do > m.do ? t : m), null);
    if (!ost || !kroki.slice(ost.do + 1, k.nr).every(x => x.rodzaj === "powrot")) return false;
    ost.commitProxy = k.nr;
    k.z = k.do = ost.wlasciciel;                          // na rysunku przy klasie, której transakcja się kończy
    k.przezProxy = true;
    return true;
  };
  const stos = w => { if (!stosTx.has(w ?? null)) stosTx.set(w ?? null, []); return stosTx.get(w ?? null); };
  for (const k of kroki) {
    const tx = k.skladowe?.find(x => x.rodzaj === "transakcja");
    if (tx) {
      // wejście do metody @Transactional przez proxy: transakcja startuje NAD tym krokiem (składowa), albo dołącza;
      // BEGIN w danych zaraz po wejściu = nowa transakcja także w środku innej (REQUIRES_NEW)
      // BEGIN tuż przed wejściem (proxy otwiera transakcję — setAutoCommit(false) — zanim log diagnostyczny zobaczy
      // wejście do metody; span BEGIN wisi wtedy pod wołającym) to ta sama transakcja: region z BEGIN przejmuje metoda
      // z adnotacją. Sprawdzane przed dołączeniem — inaczej świeży region z BEGIN wyglądałby na trwającą transakcję.
      const sw = stos(k.watek), tuz = sw.at(-1);
      if (!tx.potwierdzona && tuz?.zrodlo === "SQL" && !tuz.savepoint && kroki.slice(tuz.od + 1, k.nr).every(x => x.rodzaj === "powrot")) {
        sw.pop(); wynik.splice(wynik.indexOf(tuz), 1);
        tx.potwierdzona = "SQL";
        tx.opis += " · BEGIN w bazie";
        const b = kroki[tuz.od];                             // krok BEGIN rysujemy przy metodzie, jak commit proxy
        if (b) { b.z = b.do = k.do; b.przezProxy = true; }
      }
      const nad = otwarta(k.nr, k.watek);
      if (nad && !tx.potwierdzona && !NOWA_TX.has(tx.propagacja)) { tx.faza = "dolacza"; nad.dolaczenia.push(k.nr); continue; }
      const nad2 = nad;
      const r = { od: k.nr, do: koniecPoddrzewa(k), wlasciciel: k.do, metoda: k.metoda, zrodlo: tx.potwierdzona ? "adnotacja + BEGIN w bazie" : "adnotacja", watek: k.watek, glowa: k.nr, dolaczenia: [], ...(nad2 ? { zagniezdzona: true, wewnatrz: wynik.indexOf(nad2) } : {}) };
      wynik.push(r);
      if (tx.potwierdzona) sw.push(r);
      continue;
    }
    if (k.rodzaj !== "transakcja") continue;
    if (k.zrodlo === "SQL" && k.faza === "start") {
      const nad = stos(k.watek).at(-1) || otwarta(k.nr, k.watek);
      const r = { od: k.nr, do: kroki.length - 1, wlasciciel: k.z, metoda: null, zrodlo: "SQL", watek: k.watek, ...(k.polaczenie != null ? { polaczenie: k.polaczenie } : {}), ...(k.savepoint ? { savepoint: true } : {}), ...(k.savepointNazwa ? { savepointNazwa: k.savepointNazwa } : {}), ...(nad ? { zagniezdzona: true, wewnatrz: wynik.indexOf(nad) } : {}) };
      wynik.push(r);
      stos(k.watek).push(r);
    } else if (k.zrodlo === "SQL" && ["commit", "rollback"].includes(k.faza)) {
      // COMMIT / ROLLBACK całej transakcji kończy też otwarte w niej savepointy (Laravel nie robi RELEASE przy
      // zagnieżdżonym DB::transaction): savepoint kończy się razem z nadrzędną, na końcu kroku, który go założył
      const sw = stos(k.watek);
      const zamknijNiejawnie = (s, opis) => {
        const rodzic = kroki[s.od]?.rodzic;
        s.do = rodzic != null && kroki[rodzic].rodzaj !== "wejscie" ? Math.min(koniecPoddrzewa(kroki[rodzic]), k.nr) : k.nr;
        s.koniec = k.faza; s.koniecNiejawny = opis;
      };
      while (!k.savepoint && sw.at(-1)?.savepoint && sw.length > 1)
        zamknijNiejawnie(sw.pop(), `z ${k.faza === "commit" ? "COMMIT" : "ROLLBACK"} transakcji nadrzędnej`);
      let r;
      if (k.savepoint) {
        // RELEASE / ROLLBACK TO zamyka savepoint o swojej nazwie (i savepointy założone po nim), nigdy transakcji
        // bez savepointu; RELEASE po ROLLBACK TO tej samej nazwy (Django) albo nieznanej nazwy — pomijamy
        const i = sw.findLastIndex(t => t.savepoint && (!k.savepointNazwa || !t.savepointNazwa || t.savepointNazwa === k.savepointNazwa));
        if (i < 0) continue;
        while (sw.length - 1 > i) zamknijNiejawnie(sw.pop(), `z ${k.faza === "commit" ? "RELEASE" : "ROLLBACK TO"} savepointu ${k.savepointNazwa || ""}`.trim());
        r = sw.pop();
      } else {
        // COMMIT na znanym połączeniu zamyka transakcję tego połączenia (dwie otwarte na jednym wątku: inne połączenia)
        const i = k.polaczenie != null ? sw.findLastIndex(t => !t.savepoint && t.polaczenie === k.polaczenie) : -1;
        r = i >= 0 && i < sw.length - 1 ? sw.splice(i, 1)[0] : sw.pop();
      }
      if (r) {
        // COMMIT / ROLLBACK proxy po wyjściu z metody @Transactional — na rysunku przy jej klasie (jak commit proxy)
        if (r.zrodlo.startsWith("adnotacja") && k.nr > r.do && kroki.slice(r.do + 1, k.nr).every(x => x.rodzaj === "powrot")) { k.z = k.do = r.wlasciciel; k.przezProxy = true; }
        r.do = Math.max(r.zrodlo === "SQL" ? k.nr : r.do, k.nr); r.koniec = k.faza; r.koniecNr = k.nr;
        // właściciel transakcji z SQL: najbliższy wspólny przodek BEGIN i COMMIT — ORM otwiera transakcję leniwie
        // (BEGIN przy pierwszym zapytaniu, głęboko w repozytorium), a zamyka ją kod, który ją objął (serwis)
        if (r.zrodlo === "SQL") {
          const przodkowie = n => { const w = []; for (let x = kroki[n]?.rodzic; x != null; x = kroki[x].rodzic) w.push(x); return w; };
          const zKonca = new Set(przodkowie(k.nr));
          const wspolny = przodkowie(r.od).find(x => zKonca.has(x));
          const g = wspolny != null ? kroki[wspolny] : null;
          if (g && ["klasa", "repozytorium", "wejscie"].includes(g.rodzaj) && g.do) { r.wlasciciel = g.do; r.metoda = g.metoda; r.glowa = g.nr; }
        }
      }
    } else if (["commit", "rollback"].includes(k.faza) && k.zrodlo !== "SQL" && proxyCommit(k)) {
      continue;
    } else if (["commit", "rollback"].includes(k.faza) && k.zrodlo !== "SQL" && !otwarta(k.nr, k.watek)) {
      const glowa = k.rodzic != null ? kroki[k.rodzic] : null;
      if (!glowa || glowa.rodzaj === "wejscie" && !glowa.metoda) continue;
      // commit znamy dokładnie, początek nie (ORM otwiera transakcję leniwie): od pierwszego dostępu do bazy pod tym
      // samym krokiem po końcu poprzedniej transakcji na tym wątku
      const poprz = wynik.filter(t => t.watek === k.watek && t.do < k.nr).reduce((m, t) => Math.max(m, t.do), glowa.nr);
      const start = kroki.find(x => x.nr > poprz && x.nr < k.nr && (x.rodzaj === "sql" || x.rodzaj === "repozytorium") && (potomek(x, glowa)));
      // commit bez żadnego dostępu do danych od końca poprzedniej transakcji = obsługa połączenia (pula przywraca
      // autocommit po rollbacku), nie transakcja
      const poprzKoniec = wynik.filter(t => t.watek === k.watek && t.do < k.nr).reduce((m, t) => Math.max(m, t.do), -1);
      const bezSql = !kroki.slice(poprzKoniec + 1, k.nr).some(x => x.rodzaj === "sql") && !kroki.some(x => x.rodzic === k.nr && x.rodzaj === "sql");
      if (!start && poprzKoniec >= 0 && bezSql) continue;
      const od = start ? (start.rodzaj === "sql" && start.rodzic != null && kroki[start.rodzic].rodzaj === "repozytorium" ? start.rodzic : start.nr) : k.nr;
      wynik.push({ od, do: k.nr, wlasciciel: glowa.do, metoda: glowa.metoda, zrodlo: glowa.rodzaj === "repozytorium" ? "repozytorium" : "ORM",
        watek: k.watek, glowa: glowa.nr, przyblizonyStart: true });
    }
    if (wynik.length) wynik.at(-1).dolaczenia ||= [];
  }
  for (const s of stosTx.values()) for (const r of s) if (r.zrodlo === "SQL") r.koniec = "brak końca w przebiegu";
  // transakcja z adnotacji bez końca w danych, a metoda wyszła wyjątkiem: koniec z reguły Springa (wywnioskowany)
  for (const r of wynik) {
    if (r.koniec || !r.zrodlo.startsWith("adnotacja") || r.glowa == null || !kroki[r.glowa]?.blad || r.commitProxy != null) continue;
    if (kroki.slice(r.od, r.do + 1).some(x => x.rodzaj === "transakcja" && ["commit", "rollback"].includes(x.faza))) continue;
    const rodzaj = rodzajWyjatku(kroki[r.glowa].blad, mapaTx);
    if (rodzaj) { r.koniec = rodzaj === "unchecked" ? "rollback" : "commit"; r.koniecWywnioskowany = `${rodzaj} → ${r.koniec} (reguła Springa)`; }
  }
  // transakcja z BEGIN w danych, w której jest tylko SQL techniczny (log bazy: psycopg TypeInfo przy pierwszym
  // połączeniu we własnym BEGIN … COMMIT) — inicjalizacja połączenia, nie transakcja aplikacji
  const techniczna = t => t.zrodlo === "SQL" && !t.savepoint && t.koniecNr != null && (() => {
    const w = kroki.slice(t.od + 1, t.koniecNr);
    return w.length && w.every(x => x.rodzaj === "sql" && SQL_TECHNICZNY.test(x.sql || ""));
  })();
  if (wynik.some(techniczna)) {
    const stare = [...wynik];
    const zostaja = stare.filter(t => !techniczna(t));
    for (const t of zostaja) if (t.wewnatrz != null) {
      const nad = zostaja.indexOf(stare[t.wewnatrz]);
      if (nad >= 0) t.wewnatrz = nad; else { delete t.wewnatrz; delete t.zagniezdzona; }
    }
    wynik.length = 0; wynik.push(...zostaja);
  }
  // SQL z innego połączenia niż to, na którym padł BEGIN (findById bez trx w czasie otwartej transakcji: inne
  // połączenie z puli) — poza transakcją, choć w jej oknie; id połączenia: db.pid z logu bazy albo z diag
  const innePolaczenie = (t, x) => t.polaczenie != null && x.rodzaj === "sql" && x.polaczenie != null && x.polaczenie !== t.polaczenie;
  for (const [n, t] of wynik.entries()) {
    t.nr = n;
    t.dolaczenia ||= [];
    if (t.commitProxy != null) t.do = t.commitProxy;
    const wOknie = kroki.slice(t.od, t.do + 1).filter(x => t.glowa == null || x.nr === t.od || x.nr === t.glowa || potomek(x, kroki[t.glowa]) || x.rodzaj === "transakcja");
    const w = wOknie.filter(x => !innePolaczenie(t, x));
    const kon = t.koniecNr != null ? kroki[t.koniecNr] : w.filter(x => x.rodzaj === "transakcja" && ["commit", "rollback"].includes(x.faza)).at(-1);
    t.koniec ||= kon ? kon.faza : "koniec metody";
    t.koniecNr = kon ? kon.nr : t.do;
    // wołający transakcyjną metodę (przed proxy) nie jest w transakcji — z kroku startu i wejścia liczy się tylko cel
    // commit/rollback nie dokłada uczestników (span wisi pod wołającym, bo proxy nie jest instrumentowany)
    const tylkoCel = x => x.nr === t.od || x.nr === t.glowa;
    t.uczestnicy = [...new Set(w.filter(x => !(x.rodzaj === "transakcja" && x.faza !== "start")).flatMap(x => (tylkoCel(x) ? [x.do] : [x.z, x.do])).filter(u => u !== "wejscie"))];
    t.poza = [...w.filter(x => x.rodzaj !== "powrot" && t.watek != null && x.watek != null && x.watek !== t.watek).map(x => ({ nr: x.nr, watek: x.watek })),
      ...wOknie.filter(x => innePolaczenie(t, x)).map(x => ({ nr: x.nr, polaczenie: x.polaczenie }))].sort((x, y) => x.nr - y.nr);
    t.kroki = w.map(x => x.nr);
  }
  return wynik;
}

// Pętla w kodzie domenowym: te same wywołania (ta sama klasa, metoda, wołający) powtarzają się jedno po drugim —
// pojedynczo albo jako ciało pętli z kilku wywołań (do 6) — bez SQL, innych systemów i transakcji w środku.
// Zostaje pierwszy obrót pętli z całym wnętrzem; jego pierwszy krok dostaje `powtorzen` (ile obrotów) i `petla`
// (ile wywołań w obrocie). Powtarzanego SQL nie zwijamy — N+1 ma być widać. Kroki mają tu jeszcze `_r`.
export function zwinPowtorzenia(kroki) {
  const potomek = (x, k) => { for (let r = x._r; r; r = r._r) if (r === k) return true; return false; };
  const czysty = blok => !blok.some(x => ["sql", "zewnetrzne", "transakcja"].includes(x.rodzaj));
  function zwin(lista) {
    // podział na bloki rodzeństwa: krok + jego wnętrze + jego powrót
    const bloki = [];
    for (let i = 0; i < lista.length;) {
      const k = lista[i];
      let e = i + 1;
      while (e < lista.length && potomek(lista[e], k)) e++;
      const ogon = e < lista.length && lista[e].rodzaj === "powrot" && lista[e].span === k.span ? 1 : 0;
      const wszystko = lista.slice(i, e + ogon);
      bloki.push({ k, wnetrze: lista.slice(i + 1, e), ogon: lista.slice(e, e + ogon),
        podpis: ["klasa", "repozytorium"].includes(k.rodzaj) ? `${k.rodzaj}|${k.z}|${k.do}|${k.metoda}|${k._r?.nr}` : null,
        czysty: czysty(wszystko), wszystko });
      i = e + ogon;
    }
    const wynik = [];
    for (let i = 0; i < bloki.length;) {
      // najdłuższe pokrycie powtórzeniami wzorca długości p (1–6) od bloku i
      let best = { p: 1, n: 1 };
      for (let p = 1; p <= 6 && i + 2 * p <= bloki.length; p++) {
        const wz = bloki.slice(i, i + p);
        if (!wz.every(b => b.podpis && b.czysty)) continue;
        let n = 1;
        while (i + (n + 1) * p <= bloki.length && bloki.slice(i + n * p, i + (n + 1) * p).every((b, j) => b.podpis === wz[j].podpis && b.czysty)) n++;
        if (n > 1 && n * p > best.n * best.p) best = { p, n };
      }
      const obrot = bloki.slice(i, i + best.p);
      for (const b of obrot) wynik.push(b.k, ...zwin(b.wnetrze), ...b.ogon);
      if (best.n > 1) {
        const glowa = obrot[0].k, reszta = bloki.slice(i + best.p, i + best.n * best.p);
        glowa.powtorzen = best.n;
        if (best.p > 1) glowa.petla = best.p;
        glowa.czasRazem = +[...obrot, ...reszta].reduce((s, b) => s + (b.k.czas || 0), 0).toFixed(3);
        for (const b of reszta) for (const x of b.wszystko) if (x.logi?.length) (glowa.logi = glowa.logi || []).push(...x.logi);
      }
      i += best.n * best.p;
    }
    return wynik;
  }
  return zwin(kroki);
}

// Wywołania wewnętrzne: klasa woła swoje metody przez this, a one „nic nie robią” na zewnątrz — w ich wnętrzu są
// tylko kolejne wywołania tej samej klasy (bez SQL, innych klas, innych systemów, transakcji, ostrzeżeń). To nie są kroki
// przepływu, tylko składowa kroku, który wszedł do klasy: „wewnętrzne: describeComponents(), price() ×2”.
// Wywołanie przez this, które coś robi (np. SQL), zostaje krokiem — tłumaczy, skąd to się bierze.
export function zwinWewnetrzne(kroki) {
  const potomek = (x, k) => { for (let r = x._r; r; r = r._r) if (r === k) return true; return false; };
  const usun = new Set();
  for (const k of kroki) {
    if (usun.has(k) || k.rodzaj !== "klasa" || !k.samWsobie) continue;
    const gospodarz = k._r;
    if (!gospodarz || gospodarz.do !== k.do || usun.has(gospodarz)) continue;
    const wnetrze = kroki.filter(x => x !== k && (potomek(x, k) || (x.rodzaj === "powrot" && x.span === k.span)));
    // krok z ostrzeżeniem (np. @Transactional przez this) zostaje — to informacja, nie szum
    const czyste = !k.ostrzezenie && wnetrze.every(x => x.rodzaj === "powrot" || (x.rodzaj === "klasa" && x.do === k.do && x.z === k.do && !x.ostrzezenie));
    if (!czyste) continue;
    const skl = (gospodarz.skladowe ||= []).find(x => x.rodzaj === "wewnetrzne")
      || (gospodarz.skladowe.push({ rodzaj: "wewnetrzne", opis: "wywołania wewnętrzne (this)", metody: [] }), gospodarz.skladowe.at(-1));
    for (const x of [k, ...wnetrze.filter(x => x.rodzaj === "klasa")]) {
      const m = skl.metody.find(y => y.metoda === x.metoda);
      m ? (m.razy += x.powtorzen || 1) : skl.metody.push({ metoda: x.metoda, razy: x.powtorzen || 1 });
    }
    for (const x of [k, ...wnetrze]) { usun.add(x); if (x.logi?.length) (gospodarz.logi ||= []).push(...x.logi); }
  }
  return kroki.filter(k => !usun.has(k));
}

function wybraneAtrybuty(s) {
  const a = s.atrybuty || {}, w = {};
  for (const k of Object.keys(a)) if (/^(http|url|server|rpc|messaging)\./.test(k)) w[k] = a[k];
  return w;
}

// ---------------------------------------------------------------- zbieracz: rekordy na żywo → gotowe przebiegi
// Span przychodzi po swoim końcu, dzieci przed rodzicem, logi osobnym kanałem. Przebieg składamy, gdy przyszedł
// korzeń i przez chwilę nic nowego nie doszło do tego trace (cisza), albo po twardym limicie.
export class Zbieracz {
  // bufor (opcjonalnie BuforLogow z korelacja.mjs): linie logów bez identyfikatora dopasowywane wątkiem i czasem
  constructor({ mapa = null, cisza = 400, limit = 15000, naPrzebieg = () => {}, bufor = null } = {}) {
    Object.assign(this, { mapa, cisza, limit, naPrzebieg, bufor });
    this.trace = new Map();
    this.okna = new Map();                              // ostatnie okna requestów (korelacja logów bez id)
  }
  dodaj(rekordy) {
    const bezId = [];
    for (const r of rekordy) {
      if (!r.trace) { if ((r.typ === "log" || r.typ === "span") && this.bufor) bezId.push(r); continue; }   // bez trace → korelacja
      let t = this.trace.get(r.trace);
      if (!t) { t = { rekordy: [], pierwszy: Date.now(), korzen: false, zegar: null }; this.trace.set(r.trace, t); }
      t.rekordy.push(r);
      if (r.typ === "span" && !r.rodzic) t.korzen = true;
      this.planuj(r.trace, t);
    }
    if (bezId.length) this.bufor.dodaj(bezId);
  }
  planuj(id, t) {
    clearTimeout(t.zegar);
    const zaIle = t.korzen ? this.cisza : Math.max(0, this.limit - (Date.now() - t.pierwszy));
    t.zegar = setTimeout(() => this.zamknij(id), zaIle);
    t.zegar.unref?.();
  }
  zamknij(id) {
    const t = this.trace.get(id);
    if (!t) return;
    this.trace.delete(id);
    if (this.bufor) {
      // okna: zamykany + trwające + ostatnio zamknięte — żeby linia nie trafiła tu, jeśli pasuje też gdzie indziej
      const okno = oknoRequestu(t.rekordy);
      if (okno) this.okna.set(id, okno);
      for (const [tid, tt] of this.trace) { const o = oknoRequestu(tt.rekordy); if (o) this.okna.set(tid, o); }
      t.rekordy.push(...this.bufor.dopasuj(id, this.okna));
      t.rekordy = scalZapytaniaBazy(t.rekordy);
      if (this.okna.size > 300) this.okna = new Map([...this.okna].slice(-200));
    }
    for (const g of rozetnijKonsumentow(t.rekordy)) {
      const p = zlozPrzebieg(g, this.mapa);
      if (p) this.naPrzebieg(p, g);
    }
  }
  oproznij() { for (const id of [...this.trace.keys()]) { clearTimeout(this.trace.get(id).zegar); this.zamknij(id); } }
}

// Zapytania z logu bazy (zrodlo "log-bazy") już złapane przez OTel / diag → dokładamy wartości parametrów do
// istniejącego spanu i nie dublujemy; pozostałe zostają (SQL, którego aplikacja nie pokazała — np. bez OTel).
export function scalZapytaniaBazy(rekordy) {
  const zBazy = rekordy.filter(r => r.typ === "span" && r.zrodlo === "log-bazy");
  if (!zBazy.length) return rekordy;
  const inne = rekordy.filter(r => r.typ === "span" && r.zrodlo !== "log-bazy" && r.atrybuty?.["db.statement"] != null);
  const wziete = new Set(), usun = new Set();
  for (const b of zBazy) {
    const nb = normalizuj(b.atrybuty["db.statement.szablon"] || b.atrybuty["db.statement"]);
    const para = inne.find(s => !wziete.has(s) && normalizuj(s.atrybuty["db.statement"]) === nb && Math.abs(s.start - b.start) < 80);
    if (!para) continue;
    wziete.add(para); usun.add(b);
    para.atrybuty = { ...para.atrybuty, "db.statement.z_wartosciami": b.atrybuty["db.statement"], ...(b.atrybuty["db.parametry"] ? { "db.parametry": b.atrybuty["db.parametry"] } : {}) };
  }
  return rekordy.filter(r => !usun.has(r));
}

// Publikacja po błędzie konsumenta (Spring Kafka DefaultErrorHandler → DeadLetterPublishingRecoverer na „.DLT”):
// recoverer wysyła wiadomość po zamknięciu spanu „process” ostatniej próby, więc PRODUCER jest korzeniem nowego śladu.
// Doklejamy go do tamtego przetworzenia: korzeń-PRODUCER bez rodzica na wątku konsumenta, po ostatnim przetworzeniu na tym
// wątku (bez innej pracy pomiędzy, najwyżej OKNO_PUBLIKACJI ms), a gdy obie strony mają klucz wiadomości — ten sam klucz.
const OKNO_PUBLIKACJI = 3000;
export function doklejPublikacjePoKonsumencie(rekordy) {
  const spany = rekordy.filter(r => r.typ === "span");
  const w = s => s.atrybuty?.["thread.name"] ?? null;
  const sieroty = spany.filter(s => !s.rodzic && s.rodzaj === KIND.PRODUCER && w(s) != null);
  if (!sieroty.length) return rekordy;
  const naWatku = new Map();
  for (const s of spany) if (w(s) != null) { if (!naWatku.has(w(s))) naWatku.set(w(s), []); naWatku.get(w(s)).push(s); }
  const klucz = s => s.atrybuty?.["messaging.kafka.message.key"] ?? s.atrybuty?.["messaging.kafka.message_key"] ?? null;
  const przenies = new Map();                                       // trace sieroty → { trace, rodzic }
  for (const p of sieroty) {
    const tam = naWatku.get(w(p)).filter(s => s.trace !== p.trace);
    const k = tam.filter(s => s.rodzaj === KIND.CONSUMER && s.koniec <= p.start + 0.001 && p.start - s.koniec <= OKNO_PUBLIKACJI)
      .reduce((m, s) => (!m || s.koniec > m.koniec ? s : m), null);
    if (!k || tam.some(s => s.start > k.koniec && s.start < p.start)) continue;
    if (klucz(k) != null && klucz(p) != null && String(klucz(k)) !== String(klucz(p))) continue;
    // ślad sieroty to tylko ta publikacja (i jej konsumenci) — nie cudzy request z własnym wejściem
    if (spany.some(s => s.trace === p.trace && !s.rodzic && s !== p)) continue;
    przenies.set(p.trace, { trace: k.trace, rodzic: k.span, span: p.span });
  }
  if (!przenies.size) return rekordy;
  return rekordy.map(r => {
    const c = r.trace && przenies.get(r.trace);
    if (!c) return r;
    return { ...r, trace: c.trace, ...(r.typ === "span" && r.span === c.span ? { rodzic: c.rodzic } : {}) };
  });
}

// Span metody klasy z mapy, który zaczął NOWY ślad, a na tym samym wątku czasowo obejmuje span CONSUMER innego śladu
// (MDB: rada metod agenta Java — otel.instrumentation.methods — owija onMessage z zewnątrz, zanim instrumentacja JMS
// odtworzy kontekst z wiadomości; „X process” i cała praca w środku są w śladzie nadawcy). To jedno przetworzenie
// wiadomości: metoda idzie pod CONSUMER, a dzieci konsumenta z jej okna — pod nią. Tylko ślad z jednym korzeniem
// (samą metodą), bez requestu i bez innej pracy.
export function doklejMetodeDoKonsumenta(rekordy) {
  const spany = rekordy.filter(r => r.typ === "span");
  const w = s => s.atrybuty?.["thread.id"] ?? s.atrybuty?.["thread.name"] ?? null;
  const konsumenci = spany.filter(s => s.rodzaj === KIND.CONSUMER && w(s) != null);
  if (!konsumenci.length) return rekordy;
  const wSladzie = new Map();
  for (const s of spany) { if (!wSladzie.has(s.trace)) wSladzie.set(s.trace, []); wSladzie.get(s.trace).push(s); }
  const przenies = new Map(), podMetode = new Map();                    // trace metody → konsument; span → nowy rodzic
  for (const [trace, ss] of wSladzie) {
    const korzenie = ss.filter(s => !s.rodzic);
    const m = korzenie[0];
    if (korzenie.length !== 1 || m.rodzaj !== KIND.INTERNAL || !klasaMetoda(m) || w(m) == null) continue;
    if (ss.some(s => s.rodzaj === KIND.SERVER || s.rodzaj === KIND.CONSUMER)) continue;
    const k = konsumenci.filter(c => c.trace !== trace && String(w(c)) === String(w(m)) && c.start >= m.start - 0.001 && c.koniec <= m.koniec + 0.001)
      .sort((x, y) => x.start - y.start)[0];
    if (!k) continue;
    przenies.set(trace, { trace: k.trace, rodzic: k.span, span: m.span });
    for (const d of spany) if (d.rodzic === k.span && d.trace === k.trace && d.start >= m.start - 0.001 && d.koniec <= m.koniec + 0.001) podMetode.set(d.span, m.span);
  }
  if (!przenies.size) return rekordy;
  return rekordy.map(r => {
    const c = r.trace && przenies.get(r.trace);
    if (c) return { ...r, trace: c.trace, ...(r.typ === "span" && r.span === c.span ? { rodzic: c.rodzic } : {}) };
    if (r.typ === "span" && podMetode.has(r.span)) return { ...r, rodzic: podMetode.get(r.span) };
    return r;
  });
}

// rekordy z wielu trace naraz (np. przeliczenie nagrania po zmianie mapy)
export function przebiegiZRekordow(rekordy, mapa = null) {
  rekordy = doklejMetodeDoKonsumenta(doklejPublikacjePoKonsumencie(rekordy));
  const wg = new Map();
  for (const r of rekordy) { if (!r.trace) continue; if (!wg.has(r.trace)) wg.set(r.trace, []); wg.get(r.trace).push(r); }
  return [...wg.values()].flatMap(rozetnijKonsumentow).map(g => zlozPrzebieg(g, mapa)).filter(Boolean).sort((a, b) => a.ts - b.ts);
}

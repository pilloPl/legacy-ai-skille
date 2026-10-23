// Źródło: log bazy danych — SQL, który baza NAPRAWDĘ wykonała, z wartościami parametrów. Działa dla każdej
// technologii aplikacji (nic w niej nie zmieniamy). Włączenie (Postgres; flow.mjs robi to sam dla kontenera):
//   ALTER SYSTEM SET log_min_duration_statement = 0;   -- każde zapytanie z czasem
//   ALTER SYSTEM SET log_line_prefix = '%m [%p] %a@%d ';
//   SELECT pg_reload_conf();
// MySQL/MariaDB: SET GLOBAL general_log=1 (plik general log: "<ts>\t<id> Query\t<sql>").
// Wynik: zapytania {ts, pid, sql, parametry, ms, baza, aplikacja}; dalej albo korelacja z oknami requestów
// (rekordy „span” bez trace → bufor w Zbieraczu), albo — gdy nie ma żadnych okien — sesje po połączeniu (hybryda).
import { spawn } from "node:child_process";
import fs from "node:fs";

export const nazwa = "log-bazy";

const PG = /^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?)(?: ([A-Z]{2,5}|[+-]\d\d(?::?\d\d)?))? \[(\d+)\] (?:(.*?)@(\S*) )?(LOG|DETAIL|ERROR|STATEMENT|CONTEXT|HINT|WARNING|NOTICE|INFO|FATAL|PANIC):\s*(.*)$/;
// „statement: ” może kończyć linię — SQL z session.execute("""…""") zaczyna się w liniach ciągu dalszego
const PG_TRESC = /^(?:duration: ([\d.]+) ms\s+)?(?:(?:statement|execute [^:]*|bind [^:]*|parse [^:]*):(?: |$))?([\s\S]*)$/;
// Babelfish (TDS, SQL Server na Postgresie): „Query: <SQL> duration: X ms” — czas na końcu, często w linii ciągu
// dalszego; transakcje nie jako SQL, tylko komunikaty TDS Transaction Manager (TM_BEGIN_XACT …)
const BABELFISH = /^Query:\s?([\s\S]*)$/;
const BABELFISH_CZAS = /\s*duration: ([\d.]+) ms\s*$/;
const BABELFISH_TX = /^message_type: .*txn_request_type: TM_(BEGIN|COMMIT|ROLLBACK)_XACT\b/;
const BABELFISH_TX_SQL = { BEGIN: "BEGIN TRANSACTION", COMMIT: "COMMIT", ROLLBACK: "ROLLBACK" };
// polecenia sterownika i samego flow-lens, nie aplikacji: sprzątanie prepared statements (PDO pgsql: DEALLOCATE
// pdo_stmt_…, pula: DISCARD ALL, asyncpg przy oddaniu połączenia do puli: „SELECT pg_advisory_unlock_all(); CLOSE ALL;
// UNLISTEN *; RESET ALL;”), włączenie logu zapytań (wlaczLogowaniePostgres), USE [db] przy logowaniu TDS, puste polecenie
// (ping pool_pre_ping SQLAlchemy na psycopg: cursor.execute(";"))
const POLECENIE_STEROWNIKA = /^\s*(;\s*$|deallocate\b|discard\s+all\b|reset\s+all\s*;?\s*$|select\s+pg_advisory_unlock_all\s*\(\s*\)\s*;\s*close\s+all\b|alter\s+system\b|select\s+pg_reload_conf\s*\(\s*\)\s*;?\s*$|use\s+\[[^\]]+\]\s*;?\s*$)/i;
// zapytanie gotowe do wydania: SQL bez pustych brzegów, Babelfish — bez sufiksu z czasem (ten idzie do ms);
// puste (sama linia „statement:” bez ciągu dalszego) i polecenia sterownika — pominięte
function gotowe(z) {
  if (!z || z.czekaBind) return null;
  if (z.babelfish) {
    const c = BABELFISH_CZAS.exec(z.sql);
    if (c) { z.sql = z.sql.slice(0, c.index); z.ms = +(z.ms + Number(c[1])).toFixed(3); }
    delete z.babelfish;
  }
  z.sql = z.sql.trim();
  // sqlcommenter (Prisma tracing, opentelemetry-sqlcommenter): /* traceparent='00-<trace>-<span>-01' */ — klucz
  // requestu w samym SQL; normalizuj i tak zdejmuje komentarz
  const tp = /traceparent\s*=\s*'?00-([0-9a-f]{32})-([0-9a-f]{16})-/i.exec(z.sql);
  if (tp) { z.trace = tp[1].toLowerCase(); z.spanRodzic = tp[2].toLowerCase(); }
  return z.sql && !POLECENIE_STEROWNIKA.test(z.sql) ? z : null;
}
// general log MySQL 8: „<ISO>Z\t<id> Query\t<sql>”; MariaDB: „YYMMDD HH:MM:SS\t<id> Query\t<sql>”, a kolejne linie
// z tej samej sekundy bez czasu („\t\t<id> Query\t…”); SQL z kilku linii (heredoc) — linie bez nagłówka to ciąg dalszy
const MYSQL = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z)\s+(\d+)\s+(Query|Execute|Prepare|Connect|Quit|Init DB|Close stmt|Field List|Statistics|Ping)\b\t?(.*)$/;
const MARIADB = /^(?:(\d\d)(\d\d)(\d\d) +(\d{1,2}):(\d\d):(\d\d))?\t+\s*(\d+) (Query|Execute|Prepare|Connect|Quit|Init DB|Close stmt|Field List|Statistics|Ping)\b\t?(.*)$/;

function czasPg(ts, strefa) {
  const iso = ts.replace(" ", "T");
  if (!strefa || /^(UTC|GMT)$/.test(strefa)) return Date.parse(iso + "Z");
  if (/^[+-]/.test(strefa)) return Date.parse(iso + (strefa.length === 3 ? strefa + ":00" : strefa.replace(/(\d\d)(\d\d)$/, "$1:$2")));
  return Date.parse(iso);                                                // skrót strefy (CEST…): czas lokalny
}

// Parser strumienia linii logu: składa zapytanie z ewentualnym DETAIL (parametry) w następnej linii.
// Zapytanie, które padło, Postgres loguje bez „duration … execute”: ERROR (treść błędu), DETAIL (szczegół) i
// STATEMENT (SQL) — z niego też powstaje zapytanie, z parametrami z ostatniego bind tego połączenia i polem blad.
export class ParserLoguBazy {
  constructor() { this.oczekujace = new Map(); this.pominiete = new Map(); this.bind = new Map(); this.bledy = new Map(); }  // pid → zapytanie czekające na DETAIL; pid → ms parse/bind; pid → parametry bind; pid → treść ERROR
  linia(l) {
    const wynik = [];
    let m = PG.exec(l);
    if (m) {
      const [, ts, strefa, pid, aplikacja, baza, poziom, tresc] = m;
      const nowe = (sql, ms, reszta = {}) => ({ ts: czasPg(ts, strefa), pid, sql, ms, baza: baza || "", aplikacja: aplikacja || "", parametry: null, ...reszta });
      if (poziom === "DETAIL" && /^parameters:/.test(tresc)) {
        if (this.oczekujace.get(pid)?.czekaBind) { this.bind.set(pid, parametry(tresc)); return wynik; }   // parametry bind (te same przyjdą po execute)
        const z = this.oczekujace.get(pid);
        if (z) { z.parametry = parametry(tresc); }
        return wynik;
      }
      if (poziom === "ERROR") { this.bledy.set(pid, tresc.trim()); this.ostatni = null; return wynik; }
      if (poziom === "DETAIL") {                                   // szczegół błędu („Key (pet_id)=(9999) is not present…”)
        if (this.bledy.has(pid)) this.bledy.set(pid, `${this.bledy.get(pid)} (${tresc.trim()})`);
        return wynik;
      }
      if (poziom === "STATEMENT") {
        const blad = this.bledy.get(pid);
        this.bledy.delete(pid);
        if (!blad) return wynik;
        this.wydaj(wynik, pid);
        const dodatkowe = this.pominiete.get(pid) || 0;
        this.pominiete.delete(pid);
        const z = nowe(tresc.trim(), +dodatkowe.toFixed(3), { parametry: this.bind.get(pid) || null, blad });
        this.bind.delete(pid);
        this.oczekujace.set(pid, z);                               // emisja przy następnej linii albo oproznij (ciąg dalszy SQL)
        this.ostatni = z;
        return wynik;
      }
      if (poziom !== "LOG") { this.ostatni = null; return wynik; }     // CONTEXT, HINT, WARNING…: nie ciąg dalszy SQL
      // Babelfish: transakcja z komunikatu TDS → syntetyczne BEGIN / COMMIT / ROLLBACK (wykrywanie transakcji z SQL
      // działa dalej bez zmian); pozostałe komunikaty protokołu (logowanie TDS7, RPC sp_executesql) — pominięte
      if (/^message_type: /.test(tresc)) {
        const tx = BABELFISH_TX.exec(tresc);
        this.ostatni = null;
        if (tx) { this.wydaj(wynik, pid); wynik.push(nowe(BABELFISH_TX_SQL[tx[1]], 0)); }
        return wynik;
      }
      const bf = BABELFISH.exec(tresc);
      if (bf) {
        this.wydaj(wynik, pid);
        // błąd Babelfisha: ERROR (+ CONTEXT „SQL statement …”) przychodzi PRZED linią Query tego samego zapytania
        const blad = this.bledy.get(pid);
        this.bledy.delete(pid);
        const z = nowe(bf[1], 0, { babelfish: true, ...(blad ? { blad } : {}) });
        this.oczekujace.set(pid, z);
        this.ostatni = z;
        return wynik;
      }
      // protokół rozszerzony (JDBC, psycopg3, npgsql…): to samo zapytanie jako parse, bind i execute — liczy się execute
      // czas parse+bind doliczamy do execute
      const pb = /^duration: ([\d.]+) ms\s+(parse|bind) /.exec(tresc);
      if (pb) {
        this.pominiete.set(pid, (this.pominiete.get(pid) || 0) + Number(pb[1]));
        this.wydaj(wynik, pid);
        this.oczekujace.set(pid, { czekaBind: true });             // DETAIL po parse/bind = parametry bind
        if (pb[2] === "parse") this.bind.delete(pid);
        // ciąg dalszy SQL z parse/bind (np. „\tRETURNING *”) nie należy do poprzedniego zapytania — execute powtórzy całość
        this.ostatni = null;
        return wynik;
      }
      const dodatkowe = this.pominiete.get(pid) || 0;
      this.pominiete.delete(pid);
      this.bind.delete(pid);
      const t = PG_TRESC.exec(tresc);
      // pusta reszta po „statement:” — SQL przyjdzie w liniach ciągu dalszego; bez prefiksu i bez treści — nic
      const pusty = t && !t[2].trim() && /(?:statement|execute [^:]*):\s*$/.test(tresc);
      if (!t || (!t[2].trim() && !pusty) || /^(connection|disconnection|checkpoint|database system|redo|autovacuum|automatic|received (SIGHUP|fast|smart)|parameter "|listening on|starting PostgreSQL|background worker|shutting down|could not)/i.test(t[2])) { this.ostatni = null; return wynik; }
      this.wydaj(wynik, pid);
      const z = nowe(t[2].trim(), +((t[1] ? Number(t[1]) : 0) + dodatkowe).toFixed(3));
      this.oczekujace.set(pid, z);
      this.ostatni = z;
      return wynik;
    }
    // MySQL / MariaDB: zapytanie czeka na ewentualny ciąg dalszy do następnego nagłówka
    const my = MYSQL.exec(l), ma = !my && MARIADB.exec(l);
    if (my || ma) {
      const z = gotowe(this.mysql);
      if (z) wynik.push(z);
      this.mysql = null; this.ostatni = null;
      let ts, pid, polecenie, sql;
      if (my) [ts, pid, polecenie, sql] = [Date.parse(my[1]), my[2], my[3], my[4]];
      else {
        // czas lokalny serwera (kontener: UTC); bez czasu — poprzedni, o mikrosekundę dalej (kolejność zostaje)
        ts = ma[1] ? Date.UTC(2000 + Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]), Number(ma[4]), Number(ma[5]), Number(ma[6])) : (this.czasMy ?? 0) + 0.001;
        [pid, polecenie, sql] = [ma[7], ma[8], ma[9]];
      }
      this.czasMy = ts;
      // general log zapisuje zapytanie przed wykonaniem i nie zapisuje błędów — bezBledow (hybryda może błąd wywnioskować)
      if (polecenie === "Query" || polecenie === "Execute") this.ostatni = this.mysql = { ts, pid, sql, ms: 0, baza: "", aplikacja: "", parametry: null, bezBledow: true };
      return wynik;
    }
    // ciąg dalszy zapytania w wielu liniach (SQL z text blocku, sformatowany) — linia bez prefiksu logu
    if (l.trim() && !/^\d{4}-\d\d-\d\d[ T]/.test(l) && this.ostatni && !this.ostatni.czekaBind) { this.ostatni.sql = `${this.ostatni.sql} ${l.trim()}`.trim(); return wynik; }
    return wynik;
  }
  // zapytania czekające dłużej niż chwilę (DETAIL już nie przyjdzie)
  oproznij() { const w = [...this.oczekujace.values(), this.mysql].map(gotowe).filter(Boolean); this.oczekujace.clear(); this.mysql = null; this.ostatni = null; return w; }
  // zapytanie czekające na tym połączeniu (na DETAIL, ciąg dalszy) — do wyniku, bo zaczyna się następne
  wydaj(wynik, pid) { const z = gotowe(this.oczekujace.get(pid)); if (z) wynik.push(z); if (!this.oczekujace.get(pid)?.czekaBind) this.oczekujace.delete(pid); }
}
function parametry(tresc) {
  const p = {};
  for (const m of tresc.matchAll(/\$(\d+) = ('(?:[^']|'')*'|NULL|[^,]+)/g)) p[m[1]] = m[2];
  return p;
}
// SQL z wartościami w miejscu $1… (do pokazania)
export const zParametrami = z => (z.parametry ? z.sql.replace(/\$(\d+)/g, (a, n) => z.parametry[n] ?? a) : z.sql);
// postać do porównań (szablon OTel ≡ SQL z wartościami z logu / diag): każdy parametr i literał → ?, bez komentarzy,
// rzutowań i różnic w spacjach. Placeholdery: ?, $1 (Postgres), %s / %(x)s (psycopg2), :x / :1 (PDO, SQLAlchemy,
// JPA, Oracle), @x (ADO.NET, EF Core; @@zmienna MySQL zostaje). Listy (?, ?, ?) → (?), bo IN i wielowierszowe VALUES
// mają tyle ?, ile wartości. Końcowe „RETURNING *” (dopisek sterownika) — pomijane. Idempotentna (SQL szkieletu przychodzi już znormalizowany po stronie Pythona).
const RZUT = /::\s*[a-z_]\w*(?:\s+(?:varying|precision|with(?:out)?\s+time\s+zone))?(?:\s*\([\d\s,]*\))?(?:\s*\[\])*/g;
export const normalizuj = sql => String(sql || "").toLowerCase()
  .replace(/'(?:[^']|'')*'/g, "?")                                       // literały (przed komentarzami: '/*' w napisie)
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")            // komentarze, np. sqlcommenter /*traceparent=…*/
  .replace(RZUT, "")                                                     // rzutowania Postgresa ?::int, ::character varying(255)
  .replace(/%\(\w+\)s|%s|\$\d+|\?\d+|(?<![\w:@]):(?:[a-z_]\w*|\d+)|(?<![\w@])@[a-z_]\w*/g, "?")
  .replace(/(?<![\w.?])\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![\w.])|\?\.\?/g, "?") // liczby, też dziesiętne (?.? — dawna postać 18.50)
  .replace(/\b(?:null|true|false)\b/g, "?")
  .replace(/([=<>(,]\s*)-\s*\?/g, "$1?")                                  // liczby ujemne
  .replace(/\s+/g, " ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s*,\s*/g, ", ").replace(/\s*;\s*$/, "")
  .replace(/\(\?(?:, \?)*\)/g, "(?)").replace(/\(\?\)(?:, \(\?\))+/g, "(?)")
  // „RETURNING *” dopisuje sterownik (pgjdbc przy getGeneratedKeys) — w OTel i logu ORM-u go nie ma; jawne
  // „RETURNING id” z kodu zostaje
  .replace(/\s*\breturning \*\s*$/, "")
  .trim();

let licznik = 0;
// zapytanie → rekord „span” bez trace (dopasuje go korelacja do okna requestu)
export function naSpan(z) {
  return {
    typ: "span", zrodlo: nazwa, trace: "", span: `db${(++licznik).toString(16).padStart(14, "0")}`, rodzic: "", nazwa: z.sql.split(/\s+/)[0],
    rodzaj: 3, start: z.ts - z.ms, koniec: z.ts, zdarzenia: [], status: z.blad ? { kod: 2, opis: z.blad } : { kod: 0, opis: "" }, zasob: {}, zakres: nazwa,
    atrybuty: { "db.statement": zParametrami(z), "db.statement.szablon": z.sql, "db.name": z.baza || "baza", "db.pid": z.pid, ...(z.aplikacja ? { "db.aplikacja": z.aplikacja } : {}), ...(z.parametry ? { "db.parametry": z.parametry } : {}) },
  };
}

// Czytaj log: plik (ogon) albo kontener dockera ("docker:<nazwa>") — strumień linii → naZapytania([...])
export function sledzLogBazy(cel, naZapytania) {
  const parser = new ParserLoguBazy();
  let reszta = "";
  const przyjmij = tekst => {
    const linie = (reszta + tekst).split("\n");
    reszta = linie.pop();
    const z = linie.flatMap(l => parser.linia(l));
    if (z.length) naZapytania(z);
  };
  const oproznianie = setInterval(() => { const z = parser.oproznij(); if (z.length) naZapytania(z); }, 300);
  oproznianie.unref?.();
  if (cel.startsWith("docker:")) {
    const p = spawn("docker", ["logs", "-f", "--since", "1s", cel.slice(7)], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", d => przyjmij(String(d)));
    p.stderr.on("data", d => przyjmij(String(d)));
    return () => { clearInterval(oproznianie); p.kill(); };
  }
  let poz = fs.existsSync(cel) ? fs.statSync(cel).size : 0;
  const zegar = setInterval(() => {
    let st; try { st = fs.statSync(cel); } catch { return; }
    if (st.size < poz) poz = 0;
    if (st.size === poz) return;
    const fd = fs.openSync(cel, "r"), buf = Buffer.alloc(st.size - poz);
    fs.readSync(fd, buf, 0, buf.length, poz); fs.closeSync(fd); poz = st.size;
    przyjmij(buf.toString("utf8"));
  }, 250);
  return () => { clearInterval(zegar); clearInterval(oproznianie); };
}

// Włącza logowanie zapytań w kontenerze Postgresa (ALTER SYSTEM + reload). Zwraca opis albo rzuca.
export function wlaczLogowaniePostgres(kontener, uzytkownik = "postgres", baza = "postgres") {
  return new Promise((ok, zle) => {
    // każde polecenie osobno: ALTER SYSTEM nie może być w bloku transakcji (a jedno -c z kilkoma poleceniami nim jest)
    const polecenia = ["ALTER SYSTEM SET log_min_duration_statement = 0", "ALTER SYSTEM SET log_line_prefix = '%m [%p] %a@%d '", "SELECT pg_reload_conf()"];
    const p = spawn("docker", ["exec", kontener, "psql", "-U", uzytkownik, "-d", baza, ...polecenia.flatMap(c => ["-c", c])], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", d => (err += d));
    p.on("exit", kod => (kod === 0 ? ok(`log zapytań włączony w ${kontener}`) : zle(new Error(err || `psql: ${kod}`))));
  });
}

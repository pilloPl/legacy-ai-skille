// Przebieg hybrydowy: statyczny szkielet z CodeGraph (mapa/statyczne.py → .flow-lens/statyczne.json) + SQL złapany
// w runtime (log bazy), gdy aplikacja nie daje ani OTel, ani naszego logu diagnostycznego.
//
// 1. Sesje SQL: zapytania jednego połączenia (pid) od BEGIN do COMMIT/ROLLBACK albo rozdzielone przerwą (> 150 ms).
// 2. Wejście: ze statycznych wejść wybieramy to, którego tabele najlepiej pokrywają tabele sesji (podobieństwo
//    Jaccarda; przy remisie — mniej nadmiarowych tabel). To przypuszczenie — przebieg ma tryb „hybryda”.
// 3. Kroki: drzewo statyczne w kolejności kodu. Zapytanie trafia pod węzeł dostępu do danych z tą tabelą (pierwszy
//    niewykorzystany) → ścieżka do niego „potwierdzona”. Gałęzie z dostępem do danych bez żadnego potwierdzenia
//    odpadają (ich SQL nie padł, więc pewnie się nie wykonały); gałęzie bez dostępu do danych zostają jako „możliwe”.
//    Zapytania bez pasującego węzła idą pod wejście jako „niedopasowane”.
import { normalizuj, zParametrami } from "./zrodla/log-bazy.mjs";
import { liczTransakcje } from "./przebieg.mjs";
import { wejscieDlaSciezki, wejsciaDlaSciezki, wyrownajDoZapytan, bezParametrow } from "./zrodla/log-dostepu.mjs";

// identyfikator: zwykły, "Postgres/ANSI", `MySQL`, [SQL Server]; z opcjonalnym schematem (schemat.tabela, [a].[b])
const IDENT = String.raw`(?:"[^"]+"|\`[^\`]+\`|\[[^\]]+\]|[\w$#]+)`;
// „FOR UPDATE [SKIP LOCKED | NOWAIT | OF t]”, „FOR NO KEY UPDATE” — blokada wierszy, nie instrukcja UPDATE
const TABELA = new RegExp(String.raw`\b(?:from|join|into|(?<!\bfor\s+(?:no\s+key\s+)?)update|delete\s+from|merge\s+into)\s+(${IDENT}(?:\s*\.\s*${IDENT})*)`, "gi");
export function tabele(sql) {
  const w = [];
  for (const m of String(sql).replace(/'(?:[^']|'')*'/g, "''").matchAll(TABELA)) {
    const t = m[1].split(/\s*\.\s*(?=["`\[\w$#])/).pop().replace(/["`[\]]/g, "").toLowerCase();
    if (!["select", "lateral", "values", "dual", "set"].includes(t) && !w.includes(t)) w.push(t);
  }
  return w;
}
const TX_ = /^\s*(begin|start\s+transaction|commit|rollback(?!\s+to\b))\b/i;
// savepoint (atomic() w atomic(), begin_nested, NESTED): SAVEPOINT / RELEASE / ROLLBACK TO — transakcja zagnieżdżona,
// nie koniec całej; savepointy zakładane przez ORM przy każdym zapisie (EF Core: __EFSavePoint) to zwykły SQL
const SP = /^\s*(savepoint|release\s+savepoint|release|rollback\s+to\s+savepoint|rollback\s+to)\s+(?!savepoint\b)("?)(?!__EF)([^\s";]+)\2/i;
const TX = { test: sql => TX_.test(sql) || SP.test(sql) };

const TX_START = /^\s*(begin|start\s+transaction)\b/i;
const TX_KONIEC = /^\s*(commit|rollback(?!\s+to\b))\b/i;
const DDL = /^\s*(create|drop|alter|truncate)\s+(table|index|unique|sequence|view|schema|type|extension|function|trigger|if)\b/i;
// SQL samego połączenia, nie aplikacji: inicjalizacja dialektu przy pierwszym połączeniu z puli (SQLAlchemy: version(),
// current_schema(), SHOW …; psycopg 3: TypeInfo z pg_type we własnym BEGIN/COMMIT), ustawienia sesji, ping puli.
// Pojedyncze polecenie („SET NOCOUNT ON; INSERT …” to już praca aplikacji)
const SQL_POLACZENIA = /^\s*(?:(?:show|set)\s[^;]*|select\s+(?:1|version\s*\(\s*\)|current_schema\s*\(\s*\)|pg_catalog\.version\s*\(\s*\)|@@[\w.]+(?:\s*,\s*@@[\w.]+)*)|select\s+typname\b[^;]*\bfrom\s+pg_type\b[^;]*)\s*;?\s*$/i;

export function sesje(zapytania, { przerwa = 150, lacz = 40, tenSamPid = false } = {}) {
  const poPid = new Map();
  for (const z of [...zapytania].sort((a, b) => a.ts - b.ts)) {
    if (!poPid.has(z.pid)) poPid.set(z.pid, []);
    poPid.get(z.pid).push(z);
  }
  const wynik = [];
  for (const lista of poPid.values()) {
    let biez = [], wTx = false;
    const zamknij = () => { if (biez.some(z => !TX.test(z.sql) && !/^\s*(set|show|select\s+1\b)/i.test(z.sql))) wynik.push(biez); biez = []; };
    for (const z of lista) {
      const ost = biez.at(-1);
      if (ost && !wTx && z.ts - ost.ts > przerwa) zamknij();
      biez.push(z);
      if (/^\s*(begin|start\s+transaction)/i.test(z.sql)) wTx = true;
      if (/^\s*(commit|rollback(?!\s+to\b))/i.test(z.sql)) { wTx = false; zamknij(); }
    }
    zamknij();
  }
  wynik.sort((a, b) => a[0].ts - b[0].ts);
  // jeden request = często kilka transakcji (i połączeń z puli) jedna po drugiej: sklejamy, gdy przerwa < łącz ms
  const sklejone = [];
  for (const s of wynik) {
    const ost = sklejone.at(-1);
    if (ost && s[0].ts - ost.at(-1).ts < lacz && (!tenSamPid || ost[0].pid === s[0].pid)) ost.push(...s);
    else sklejone.push([...s]);
  }
  return sklejone.map(s => s.sort((a, b) => a.ts - b.ts));
}

function tabeleDrzewa(w, acc = new Set(), mozliwe = new Set()) {
  (w.tabele || []).forEach(t => acc.add(t));
  (w.tabele_mozliwe || []).forEach(t => mozliwe.add(t));
  for (const d of w.dzieci || []) tabeleDrzewa(d, acc, mozliwe);
  return { pewne: acc, mozliwe };
}

// tabele kolejki zadań frameworka (Laravel jobs, Celery wyniki, django-q, Hangfire, Messenger, Que/GoodJob/Oban…):
// rezerwacja i usunięcie zadania przez workera, nie praca żadnego wejścia — nie liczą się do pokrycia
const KOLEJKA_FW = /^(jobs|failed_jobs|job_batches|celery_taskmeta|celery_tasksetmeta|django_celery_results_\w+|django_q_\w+|messenger_messages|que_jobs|good_jobs|solid_queue_\w+|delayed_jobs|oban_jobs)$/;
const HANGFIRE = /(?:\[hangfire\]|"hangfire"|\bhangfire)\s*\./i;          // schemat Hangfire: job, state, set, lock…
const tabeleFw = z => (HANGFIRE.test(z.sql) ? tabele(z.sql) : tabele(z.sql).filter(t => KOLEJKA_FW.test(t)));
const tabeleSesji = sesja => {
  const t = [...new Set(sesja.flatMap(z => tabele(z.sql)))], fw = new Set(sesja.flatMap(tabeleFw));
  const reszta = t.filter(x => !fw.has(x));
  return reszta.length ? reszta : t;
};
// zapisy sesji (INSERT / UPDATE / DELETE) do tabel, których drzewo wejścia w ogóle nie zna (ani jawnie, ani przez
// relacje encji) — praca innego wejścia (beat Celery, inny wątek), nie tego
export function zapisPozaDrzewem(sesja, w) {
  const { pewne, mozliwe } = w._tabele ||= tabeleDrzewa(w.drzewo);
  return sesja.some(z => ZAPIS.test(z.sql) && !tabeleFw(z).length && tabele(z.sql).some(t => !pewne.has(t) && !mozliwe.has(t)));
}

export function najlepszeWejscie(sesja, statyczne) {
  const ts = new Set(tabeleSesji(sesja));
  let naj = null;
  for (const w of statyczne?.wejscia || []) {
    const { pewne, mozliwe } = w._tabele ||= tabeleDrzewa(w.drzewo);
    if (!pewne.size) continue;
    // tabele sesji wyjaśnione: jawnie (repozytorium, SQL w kodzie) = 1, przez relacje encji = 0,6;
    // kara za tabele jawne wejścia, których w sesji nie było (inna gałąź / inny request)
    let wyj = 0;
    for (const t of ts) wyj += pewne.has(t) ? 1 : mozliwe.has(t) ? 0.6 : 0;
    if (!wyj) continue;
    const pokrycie = wyj / ts.size, nadmiar = [...pewne].filter(t => !ts.has(t)).length / pewne.size;
    const ocena = pokrycie * 2 - nadmiar;
    if (!naj || ocena > naj.ocena) naj = { w, ocena, pokrycie, nadmiar };
  }
  return naj;
}

// request: opcjonalnie { metoda, sciezka, status, start, koniec } z access logu — wtedy wejście jest znane (po ścieżce),
// a nie zgadywane po tabelach
export function zlozHybryde(sesja, statyczne, mapa = null, request = null, wejscieZnane = null) {
  const naj = wejscieZnane ? { w: wejscieZnane, ocena: 9 } : najlepszeWejscie(sesja, statyczne);
  if (!naj) return null;
  const { w } = naj;
  if (!sesja.length && !request) return null;
  const t0 = request ? request.start : sesja[0].ts - (sesja[0].ms || 0);
  const zapytania = sesja.filter(z => !TX.test(z.sql)).map(z => ({ z, tabele: tabele(z.sql), uzyte: false }));
  const uczestnicy = new Map();
  const uczestnik = (id, dane) => { if (!uczestnicy.has(id)) uczestnicy.set(id, { id, ...dane }); return id; };
  const KTO = uczestnik("wejscie", { rodzaj: "wejscie", nazwa: w.http ? "użytkownik / klient HTTP" : "w tle (job / test)", poziom: -1 });
  const baza = uczestnik("baza:" + (sesja[0]?.baza || "baza"), { rodzaj: "baza", nazwa: sesja[0]?.baza || "baza", poziom: 99 });
  const rola = klasa => mapa?.klasy?.[klasa]?.rola;

  const wpisTx = n => (mapa?.klasy?.[n.klasa]?.transakcyjne || []).includes(n.metoda);
  // request skończony 5xx bez BEGIN w logu bazy: ORM otwiera transakcję leniwie (przy pierwszym zapytaniu), więc
  // metoda transakcyjna, która rzuciła wyjątek przed SQL, nie zostawia śladu w bazie. Ze szkieletu: najpłytsza metoda
  // transakcyjna (mapa: transakcyjne) na drodze wejścia — zostaje w przebiegu z transakcją wywnioskowaną (rollback).
  const wymus = new Set();
  const bezTx = !sesja.some(z => TX.test(z.sql));
  const doTx = request?.status >= 500 && bezTx && mapa ? sciezka(w.drzewo, wpisTx, 4) : null;
  doTx?.forEach(n => wymus.add(n));

  // przydział SQL do węzłów szkieletu, po całym drzewie w kolejności kodu (najgłębsze pierwsze), od najmocniejszej kotwicy: (1) tekst SQL
  // z kodu, (2) jawne tabele węzła (repozytorium, SQL w kodzie) — bez węzłów, które już mają swój SQL po tekście
  // (zapytanie tylko z jedną z ich tabel to cudze), (3) tabele możliwe (relacje encji) dla zapytań, które zostały wolne,
  // w tym samym odcinku transakcji co własny SQL węzła (ORM doczytuje relacje zaraz po zapytaniu głównym),
  // (4) jawne tabele węzłów z SQL po tekście — tylko dla zapytań, których nie wziął nikt inny
  const przypisane = new Map();                     // węzeł → zapytania przypięte bez kotwicy tabeli (drugie przejście)
  const odcinek = new Map();
  { const licz = new Map(); for (const z of [...sesja].sort((a, b) => a.ts - b.ts)) { if (TX.test(z.sql)) licz.set(z.pid, (licz.get(z.pid) || 0) + 1); else odcinek.set(z, `${z.pid}:${licz.get(z.pid) || 0}`); } }
  function przydziel() {
    // potomkowie przed rodzicem (postorder): rodzic ma w szkielecie SQL i tabele zebrane także z wywołań, a zapytanie
    // wysłało najgłębsze z nich; rodzeństwo nadal w kolejności kodu
    const wezly = [];
    (function chodz(n) { (n.dzieci || []).forEach(chodz); wezly.push(n); })(w.drzewo);
    for (const n of wezly) n._sql = [...(przypisane.get(n) || [])];
    const wez = (n, q) => { q.uzyte = true; n._sql.push(q); for (const r of zapytania) if (!r.uzyte && r.z.sql === q.z.sql) { r.uzyte = true; n._sql.push(r); } };
    // zapis (INSERT/UPDATE/DELETE) nie trafia pod metodę odczytu (findById z relacją do tej tabeli)
    // SQL wygenerowany przez ORM (aliasy v1_0) nie pochodzi z węzła z ręcznie napisanym SQL na tę tabelę (inna
    // implementacja interfejsu: Jdbc* obok Jpa*), chyba że tekst się zgadza (wtedy wziął go już krok 1)
    const natywny = (n, x) => !!n.sql?.length && ALIAS_ORM.test(x.z.sql) && n.sql.some(y => tabele(y).some(t => x.tabele.includes(t)));
    const poTabeli = (n, t, warunek = () => true) => {
      const wolne = x => !x.uzyte && x.tabele.includes(t) && warunek(x) && !natywny(n, x);
      const q = zapytania.find(x => wolne(x) && pasujeOperacja(n, x.z.sql))
        || zapytania.find(x => wolne(x) && !(ZAPIS.test(x.z.sql) && OPERACJE.select.test(n.metoda || "")));
      if (q) wez(n, q);
    };
    // SQL szkieletu znormalizowany po stronie Pythona — jeszcze raz tu, żeby obie strony miały tę samą postać
    const poTekscie = new Set();
    for (const n of wezly) for (const s of (n.sql || []).map(normalizuj)) for (const q of zapytania.filter(x => !x.uzyte && normalizuj(x.z.sql) === s)) { q.uzyte = true; n._sql.push(q); poTekscie.add(n); }
    for (const n of wezly) if (!poTekscie.has(n)) for (const t of n.tabele || []) poTabeli(n, t);
    for (const n of wezly) {
      if (poTekscie.has(n)) continue;
      const swoje = new Set(n._sql.map(q => odcinek.get(q.z)));
      for (const t of n.tabele_mozliwe || []) poTabeli(n, t, x => !swoje.size || swoje.has(odcinek.get(x.z)));
    }
    for (const n of wezly) if (poTekscie.has(n)) for (const t of n.tabele || []) poTabeli(n, t);
  }
  // przytnij drzewo: zostaw węzły potwierdzone (pod nimi padł SQL) i gałęzie bez dostępu do danych
  function potwierdz(n) {
    n._dzieci = (n.dzieci || []).map(potwierdz).filter(Boolean);
    const maDane = !!n.tabele?.length || n._dzieci.some(d => d._maDane);
    n._maDane = maDane;
    n._potw = n._sql.length > 0 || n._dzieci.some(d => d._potw);
    return (!maDane || n._potw || wymus.has(n)) ? n : null;
  }
  przydziel();
  let korzen = potwierdz(w.drzewo);
  // zapytania bez węzła z ich tabelą: metoda repozytorium bez tabel w szkielecie (interfejs Spring Data, save(encja)),
  // jedyna w drzewie wejścia z operacją pasującą do SQL — pod nią (relacje doczytywane zaraz potem też)
  const bezTabel = [];
  (function chodz(n) { if (n.rola === "repozytorium" && !n.tabele?.length && !n.sql?.length && !bezTabel.includes(n)) bezTabel.push(n); (n.dzieci || []).forEach(chodz); })(w.drzewo);
  let poprzedni = null;
  for (const q of zapytania.filter(x => !x.uzyte)) {
    const kand = bezTabel.filter(n => pasujeOperacja(n, q.z.sql));
    const cel = new Set(kand.map(n => `${n.klasa}#${n.metoda}`)).size === 1 ? kand[0] : operacja(q.z.sql) === "select" && poprzedni ? poprzedni : null;
    if (!cel) { poprzedni = null; continue; }
    if (!przypisane.has(cel)) przypisane.set(cel, []);
    przypisane.get(cel).push(q);
    poprzedni = cel;
  }
  if (przypisane.size) {
    zapytania.forEach(x => (x.uzyte = false));
    for (const l of przypisane.values()) l.forEach(x => (x.uzyte = true));
    przydziel();
    korzen = potwierdz(w.drzewo);
  }
  korzen ||= { ...w.drzewo, _dzieci: [], _sql: [] };

  const kroki = [];
  let ts = 0;
  const dodaj = (k, rodzic = null) => { k.nr = kroki.length; k.ts = +ts.toFixed(3); k.logi = []; k._r = rodzic; kroki.push(k); return k; };
  function odwiedz(n, kto, glebokosc, rodzic) {
    const r_ = rola(n.klasa) || n.rola;
    // wejście bez klasy (ścieżka spoza szkieletu, idiom bez klas: trasy Fastify jako funkcje): sam endpoint, jak w
    // przebieg.mjs — inaczej uczestnik o pustym id i właściciel transakcji „”
    const id = n === korzen && !n.klasa ? uczestnik("endpoint", { rodzaj: "endpoint", nazwa: request ? `${request.metoda} ${request.sciezka}` : w.http ? `${w.http.metoda} ${w.http.sciezka}`.trim() : w.id || "wejście", poziom: 0 })
      : r_ === "zewnetrzne" ? uczestnik("zew:" + n.nazwa, { rodzaj: "zewnetrzny", nazwa: n.nazwa, poziom: null })
      : uczestnik(n.klasa, { rodzaj: r_ === "repozytorium" ? "repozytorium" : "klasa", rola: r_, klasa: n.klasa, nazwa: n.nazwa, poziom: mapa?.klasy?.[n.klasa]?.poziom ?? null });
    const k = dodaj({ rodzaj: n === korzen ? "wejscie" : (r_ === "repozytorium" ? "repozytorium" : r_ === "zewnetrzne" ? "zewnetrzne" : "klasa"), ...(r_ === "zewnetrzne" ? { opis: `${n.nazwa}.${n.metoda}()` } : {}), z: kto, do: id, klasa: n.klasa, metoda: n.metoda,
      czas: 0, glebokosc, samWsobie: kto === id, statyczny: true, potwierdzony: !!n._potw, zgadniety: !!n.zgadniety,
      ...(n === korzen ? { wejscie: { rodzaj: w.http ? "http" : "job", nazwa: w.http ? `${w.http.metoda} ${w.http.sciezka}`.trim() : w.id, metoda: w.http?.metoda || "", sciezka: w.http?.sciezka || "", status: null, blad: null } } : {}) }, rodzic);
    k._n = n;
    for (const q of n._sql) {
      ts = Math.max(ts, q.z.ts - t0);
      dodaj({ rodzaj: "sql", z: id, do: baza, sql: zParametrami(q.z), szablon: q.z.sql, operacja: operacja(q.z.sql).toUpperCase(), tabela: q.tabele[0] || null,
        czas: q.z.ms || 0, glebokosc: glebokosc + 1, zrodloSql: "log-bazy", ...(q.z.blad ? { blad: q.z.blad } : {}) }, k)._z = q.z;
    }
    // dzieci z SQL w kolejności czasu ich pierwszego zapytania (gałąź wykonana po COMMIT nie wchodzi przed nim);
    // dzieci bez SQL zostają na swoich miejscach w kolejności kodu
    const pierwsze = d => Math.min(...d._sql.map(q => q.z.ts), ...d._dzieci.map(pierwsze));
    const zSql = n._dzieci.map((d, i) => [i, pierwsze(d)]).filter(([, t]) => Number.isFinite(t));
    const dzieci = [...n._dzieci], kolejne = zSql.map(([i]) => n._dzieci[i]).sort((a, b) => pierwsze(a) - pierwsze(b));
    zSql.forEach(([i], j) => (dzieci[i] = kolejne[j]));
    for (const d of dzieci) odwiedz(d, id, glebokosc + 1, k);
  }
  odwiedz(korzen, KTO, 0, null);
  // niedopasowane — pod wejściem, w kolejności czasu (za ostatnim zapytaniem, które padło wcześniej), nie na końcu:
  // inaczej koniec transakcji, który idzie za ostatnim jej zapytaniem, obejmuje gałęzie wykonane już po nim
  for (const q of zapytania.filter(x => !x.uzyte)) {
    ts = Math.max(ts, q.z.ts - t0);
    const po = kroki.findLastIndex(k => k._z && k._z.ts <= q.z.ts);
    const nowy = dodaj({ rodzaj: "sql", z: kroki[0].do, do: baza, sql: zParametrami(q.z), szablon: q.z.sql, operacja: operacja(q.z.sql).toUpperCase(), tabela: q.tabele[0] || null,
      czas: q.z.ms || 0, glebokosc: 1, niedopasowane: true, zrodloSql: "log-bazy", ...(q.z.blad ? { blad: q.z.blad } : {}) }, kroki[0]);
    nowy._z = q.z;
    // za nim kroki możliwe (bez danych, potwierdzony: false) — nie wiadomo kiedy padły, więc zostają przed (flush przy
    // COMMIT idzie za nimi); przed wszystkimi zapytaniami — zaraz po wejściu
    let gdzie = po >= 0 ? po + 1 : kroki.some(k => k._z && k !== nowy) ? 1 : -1;
    while (gdzie > 0 && gdzie < kroki.length - 1 && kroki[gdzie].potwierdzony === false) gdzie++;
    if (gdzie > 0 && gdzie < kroki.length - 1) { kroki.pop(); nowy.ts = +(q.z.ts - t0).toFixed(3); kroki.splice(gdzie, 0, nowy); }
  }
  // BEGIN/COMMIT z logu bazy → kroki transakcji pod metodą, która ją objęła: najbardziej zewnętrzna metoda
  // transakcyjna (mapa: transakcyjne) nad zapytaniami tej transakcji, a bez niej ich najbliższy wspólny przodek
  // (ORM otwiera transakcję leniwie, BEGIN przychodzi tuż przed pierwszym zapytaniem). Kolejność: po czasie zapytań.
  const przodkowie = k => { const w_ = []; for (let x = k._r; x; x = x._r) w_.push(x); return w_; };
  const wlasciciel = sql => {
    if (!sql.length) return kroki.find(k => k._n && k._n !== korzen && wpisTx(k._n) && k.potwierdzony) || kroki[0];
    let wspolne = przodkowie(sql[0]);
    for (const q of sql.slice(1)) { const p_ = new Set(przodkowie(q)); wspolne = wspolne.filter(x => p_.has(x)); }
    const tx = wspolne.filter(x => x._n && wpisTx(x._n)).at(-1);
    return tx || wspolne[0] || kroki[0];
  };
  // savepoint: właściciel to najgłębsza metoda transakcyjna nad jego zapytaniami, a bez niej ich najbliższy wspólny
  // przodek spoza repozytoriów (zewnętrzna transakcja obejmuje też zapytania savepointów — jej właściciel bywa wyżej)
  const wlascicielSp = sql => {
    if (!sql.length) return null;
    let wspolne = przodkowie(sql[0]);
    for (const q of sql.slice(1)) { const p_ = new Set(przodkowie(q)); wspolne = wspolne.filter(x => p_.has(x)); }
    return wspolne.find(x => x._n && wpisTx(x._n)) || wspolne.find(x => x.rodzaj !== "repozytorium") || wspolne[0] || null;
  };
  const odcinki = [], otwarte = new Map();                       // pid → stos otwartych (transakcja, savepointy)
  for (const z of [...sesja].sort((a, b) => a.ts - b.ts)) {
    const stos = otwarte.get(z.pid) || [];
    otwarte.set(z.pid, stos);
    const sp = SP.exec(z.sql);
    if (!TX.test(z.sql)) { stos.forEach(o => o.sql.push(z)); continue; }
    if (sp && /^savepoint/i.test(sp[1])) { const o = { pid: z.pid, begin: z, sql: [], koniec: null, savepoint: sp[3] }; odcinki.push(o); stos.push(o); continue; }
    if (sp) {                                                     // RELEASE / ROLLBACK TO: savepoint tej nazwy (i późniejsze)
      const i = stos.findLastIndex(o => o.savepoint === sp[3]);
      if (i < 0) continue;                                         // RELEASE po ROLLBACK TO tej samej nazwy (Django)
      const o = stos[i];
      o.koniec = z; o.faza = /^release/i.test(sp[1]) ? "commit" : "rollback";
      stos.splice(i);
      continue;
    }
    if (/^\s*(begin|start)/i.test(z.sql)) { const o = { pid: z.pid, begin: z, sql: [], koniec: null }; odcinki.push(o); stos.push(o); continue; }
    const i = stos.findLastIndex(o => !o.savepoint);
    if (i >= 0) { stos[i].koniec = z; stos.splice(i); } else odcinki.push({ pid: z.pid, begin: null, sql: [], koniec: z });
  }
  const krokTx = (z, faza, kto, o = {}) => ({ rodzaj: "transakcja", faza, zrodlo: "SQL", ...(o.savepoint ? { savepoint: true, savepointNazwa: o.savepoint } : {}),
    z: kto.do, do: kto.do, czas: 0, glebokosc: (kto.glebokosc ?? 0) + 1, logi: [], ts: +(z.ts - t0).toFixed(3), _r: kto });
  const koniecPoddrzewa = k => { let i = kroki.indexOf(k); for (let j = i + 1; j < kroki.length && przodkowie(kroki[j]).includes(k); j++) i = j; return i; };
  // miejsce w kolejności po czasie: za ostatnim krokiem SQL / transakcji, który padł nie później niż t
  const poCzasie = t => { let i = 0; kroki.forEach((k, j) => { if (j && (k._z ? k._z.ts <= t : k.rodzaj === "transakcja" && k.ts <= t - t0)) i = j; }); return i + 1; };
  // właściciele: zapytania dopasowane do szkieletu (niedopasowane wiszą pod wejściem na końcu — nie przesądzają)
  for (const o of odcinki) {
    const wsz = kroki.filter(k => k._z && o.sql.includes(k._z)), dop = wsz.filter(k => !k.niedopasowane);
    o.kroki = wsz;
    o.kto = (o.savepoint && wlascicielSp(dop.length ? dop : wsz)) || wlasciciel(dop.length ? dop : wsz);
  }
  // transakcja z savepointem w środku należy do metody NAD właścicielem savepointu (atomic() w atomic())
  for (const o of odcinki) {
    if (o.savepoint || !o.begin) continue;
    const sp = odcinki.find(x => x.savepoint && x.pid === o.pid && x.begin.ts >= o.begin.ts && (!o.koniec || x.begin.ts <= o.koniec.ts));
    if (!sp || (o.kto !== sp.kto && przodkowie(sp.kto).includes(o.kto))) continue;
    const nad = przodkowie(sp.kto);
    o.kto = nad.filter(x => x._n && wpisTx(x._n)).at(-1) || nad[0] || kroki[0];
  }
  // SQL innego połączenia (z puli, bez przekazanej transakcji: findById bez trx po UPDATE w trx) w czasie otwartej
  // transakcji: krok w kolejności czasu — BEGIN przed nim, gdy padł wcześniej, COMMIT za nim, gdy padł później
  const obcy = (k, o, przed) => k?._z && k._z.pid !== o.pid && (przed ? k._z.ts >= o.begin.ts : k._z.ts <= o.koniec.ts);
  for (const o of odcinki) {
    const { kroki: sql, kto } = o;
    // transakcja z samym SQL połączenia (inicjalizacja dialektu przy pierwszym połączeniu, TypeInfo psycopg) — nie
    // transakcja aplikacji; jej zapytania zostają krokami
    if (o.sql.length && o.sql.every(z => SQL_POLACZENIA.test(z.sql))) continue;
    let start = null;
    if (o.begin) {
      let i = sql.length ? kroki.indexOf(sql[0]) : poCzasie(o.begin.ts);
      while (sql.length && i > 1 && obcy(kroki[i - 1], o, true)) i--;
      kroki.splice(i, 0, (start = krokTx(o.begin, "start", kto, o)));
    }
    if (o.koniec) {
      const faza = o.faza || o.koniec.sql.trim().split(/[\s;]+/)[0].toLowerCase();      // asyncpg: „COMMIT;”
      // bez zapytań: po czasie, ale nie przed swoim początkiem
      let ost = sql.length ? kroki.indexOf(sql.at(-1)) : Math.max(start ? kroki.indexOf(start) : 0, poCzasie(o.koniec.ts) - 1);
      while (sql.length && obcy(kroki[ost + 1], o, false)) ost++;
      kroki.splice(ost + 1, 0, krokTx(o.koniec, faza, kto, o));
      // koniec transakcji przy samym wejściu (nikt w szkielecie jej nie objął): jednostka pracy z mapy, zgadnięta
      // — także pod metodą, która sama transakcji nie prowadzi (widok z zapytaniem w `with uow:`), byle nie pod metodą
      // transakcyjną z mapy ani pod samą jednostką pracy
      const zwykly = kto === kroki[0] || (kto._n && !wpisTx(kto._n) && kto.rodzaj !== "repozytorium" && !przodkowie(kto).some(x => x._n && wpisTx(x._n)));
      const uow0 = zwykly && !o.savepoint && ["commit", "rollback"].includes(faza) ? jednostkaPracyZMapy(mapa, faza) : null;
      const uow = uow0 && kto.klasa !== uow0 && !przodkowie(kto).some(x => x.klasa === uow0) ? uow0 : null;
      if (uow) {
        const r_ = rola(uow) || "aplikacja";
        const id = uczestnik(uow, { rodzaj: r_ === "repozytorium" ? "repozytorium" : "klasa", rola: r_, klasa: uow, nazwa: uow.split(".").pop(), poziom: mapa?.klasy?.[uow]?.poziom ?? null });
        kroki.splice(ost + 1, 0, { rodzaj: r_ === "repozytorium" ? "repozytorium" : "klasa", z: kto.do, do: id, klasa: uow, metoda: faza, czas: 0, glebokosc: (kto.glebokosc ?? 0) + 1,
          samWsobie: false, statyczny: true, potwierdzony: true, zgadniety: true, logi: [], ts: +(o.koniec.ts - t0).toFixed(3), _r: kto });
      }
    }
  }
  // log bazy bez błędów zapytań (general log MySQL zapisuje zapytanie przed wykonaniem): request skończony 5xx —
  // padło ostatnie zapytanie wycofanej transakcji, a bez transakcji ostatni zapis requestu (autocommit, FK w INSERT).
  // Błąd wywnioskowany (bladWywnioskowany), nie z logu; log z błędami (Postgres ERROR) — bez zgadywania
  if (request?.status >= 500 && sesja.length && sesja.every(z => z.bezBledow) && !kroki.some(k => k.blad)) {
    const wycofane = odcinki.filter(o => !o.savepoint && o.koniec && /^\s*rollback\b/i.test(o.koniec.sql) && o.sql.length);
    const aplikacji = l => l.filter(z => !TX.test(z.sql) && !SQL_POLACZENIA.test(z.sql));
    const ost = aplikacji(sesja).at(-1);
    const cel = wycofane.length ? aplikacji(wycofane.at(-1).sql).at(-1) : ost && ZAPIS.test(ost.sql) ? ost : null;
    const k = cel && kroki.find(x => x._z === cel);
    if (k) Object.assign(k, { blad: `wywnioskowany: ${request.status}${wycofane.length ? ", ROLLBACK po zapytaniu" : ""} (log bazy bez błędów)`, bladWywnioskowany: true });
  }
  if (doTx) {
    const k = kroki.find(x => x._n === doTx.at(-1));
    if (k && !k.potwierdzony) {
      k.skladowe = [{ rodzaj: "transakcja", faza: "start", zrodlo: "adnotacja", opis: "@Transactional · proxy · wywnioskowana (bez SQL w logu bazy)" }];
      k.wnioskowanaTx = true;
      kroki.splice(koniecPoddrzewa(k) + 1, 0, { rodzaj: "transakcja", faza: "rollback", zrodlo: "wnioskowana", z: k.do, do: k.do, czas: 0, glebokosc: (k.glebokosc ?? 0) + 1, logi: [], ts: k.ts, wnioskowana: `${request.status} bez BEGIN/ROLLBACK w logu bazy`, _r: k });
    }
  }
  kroki.forEach((k, i) => (k.nr = i));
  for (const k of kroki) { k.rodzic = k._r ? k._r.nr : null; delete k._r; delete k._n; delete k._z; }
  const wszystkie = sesja.filter(z => !TX.test(z.sql)).length;
  return {
    kind: "przebieg", id: `h-${request ? request.start : sesja[0].pid + "-" + sesja[0].ts}`, projekt: mapa?.projekt || null, tryb: "hybryda", ts: t0,
    czas: +(request ? request.koniec - request.start : sesja.at(-1).ts - t0).toFixed(3),
    wejscie: request ? { ...kroki[0].wejscie, nazwa: `${request.metoda} ${request.sciezka}`, status: request.status }
      : { ...kroki[0].wejscie, nazwa: `≈ ${kroki[0].wejscie.nazwa}` },
    uczestnicy: [...uczestnicy.values()], kroki, transakcje: liczTransakcje(kroki, mapa),
    zrodla: request ? ["codegraph", "log-bazy", "log-dostepu"] : ["codegraph", "log-bazy"],
    statystyki: { spany: 0, zwiniete: 0, sql: wszystkie, logi: 0, dopasowanieWejscia: +naj.ocena.toFixed(2), sqlNiedopasowane: zapytania.filter(x => !x.uzyte).length },
    bezMapy: !mapa,
  };
}

// ---------------------------------------------------------------- wzbogacenie przebiegu szkieletem statycznym
// Przebieg z dowolnego źródła, które nie widzi wszystkich klas (log frameworka: tylko wejście, metody @Transactional
// i SQL; log bazy; częściowe wstrzyknięcie). Między dwoma krokami z runtime (rodzic → dziecko) wstawiamy klasy ze
// ścieżki statycznej, a SQL — pod węzeł szkieletu z jego tabelą (repozytorium). Wstawione kroki: statyczny: true
// (rysowane przerywaną linią), potwierdzony: true (oba końce ścieżki widziane w runtime). Kroki z runtime zostają.
const indeksy = new WeakMap();
function indeks(statyczne) {
  if (indeksy.has(statyczne)) return indeksy.get(statyczne);
  const poWejsciu = new Map(), poMetodzie = new Map(), poKlasie = new Map();
  for (const w of statyczne?.wejscia || []) {
    const kl = `${w.klasa}#${w.metoda}`;                // przeciążone akcje (Get() i Get(slug)) — kilka wejść
    if (!poWejsciu.has(kl)) poWejsciu.set(kl, []);
    poWejsciu.get(kl).push(w);
    (function chodz(n) { const k = `${n.klasa}#${n.metoda}`; if (!poMetodzie.has(k)) poMetodzie.set(k, n); if (!poKlasie.has(n.klasa)) poKlasie.set(n.klasa, n); for (const d of n.dzieci || []) chodz(d); })(w.drzewo);
  }
  const ix = { poWejsciu, poMetodzie, poKlasie };
  indeksy.set(statyczne, ix);
  return ix;
}
// węzły poddrzewa w kolejności kodu (preorder) z drogą od korzenia (bez niego)
function preorder(od, maks = 8) {
  const wynik = [];
  (function chodz(n, droga) {
    if (droga.length > maks) return;
    for (const d of n.dzieci || []) { const nowa = [...droga, d]; wynik.push(nowa); chodz(d, nowa); }
  })(od, []);
  return wynik;
}
const OPERACJE = { select: /^(find|get|load|read|query|search|list|exists|count|fetch|by)/i, insert: /^(save|persist|add|create|insert|store|register|zapisz|dodaj)/i,
  update: /^(save|update|merge|set|change|mark|flag|move|zapisz|zmien|anuluj)/i, delete: /^(delete|remove|purge|clean|usun)/i };
export const REPO_OGOLNE = /\.(Simple(Jpa|Mongo|ReactiveMongo|Jdbc|R2dbc|Neo4j|Elasticsearch|Redis|Key[Vv]alue)Repository|QuerydslJpaPredicateExecutor)$/;
// operacja SQL: pierwsze słowo, bez prefiksu sesji EF Core na SQL Serverze („SET NOCOUNT ON; INSERT …”)
const bezPrefiksu = sql => String(sql).replace(/^\s*set\s+nocount\s+on\s*;\s*/i, "");
const operacja = sql => bezPrefiksu(sql).trim().split(/[\s;(]+/)[0].toLowerCase();
// metoda jednostki pracy ORM-u (EF Core SaveChanges(Async), Session.flush) wysyła każdy zapis: INSERT, UPDATE i DELETE
const JEDNOSTKA = /^_?(save_?changes|flush)/i;
const pasujeOperacja = (n, sql) => (OPERACJE[operacja(sql)]?.test(n.metoda) ?? false) || (["insert", "update", "delete", "merge"].includes(operacja(sql)) && JEDNOSTKA.test(n.metoda || ""));
const ZAPIS_ = /^\s*(insert|update|delete|merge)\b/i;
const ZAPIS = { test: sql => ZAPIS_.test(bezPrefiksu(sql)) };
// sterowanie transakcją i sesją (SAVEPOINT EF Core, SET, SHOW) — nie wywołanie repozytorium, nie przerywa łańcucha
const POMOCNICZY_SQL = /^\s*(savepoint|release|begin|start\s+transaction|commit|rollback|set|show|select\s+1\b)/i;
const pomocniczy = k => k.rodzaj === "transakcja" || (k.rodzaj === "sql" && POMOCNICZY_SQL.test(k.szablon || k.sql || ""));
// aliasy generowane przez ORM (Hibernate 6: v1_0, Hibernate 5: vet0_, EF Core: "p"."x" nie) — SQL nie był pisany ręcznie
// metody transakcji w szkielecie po fazie kroku transakcji z logu
const TX_METODA = { start: /^(begin|start)\w*transaction/i, commit: /^commit(transaction)?(async)?$/i, rollback: /^rollback(transaction)?(async)?$/i };
const ALIAS_ORM = /\b[a-z]\w*?\d+_\d+\b|\b[a-z]\w*?\d+_(?=\.)/i;
const pakiet = n => String(n.klasa || "").split(".").slice(0, -1).join(".");
const maDaneW = n => !!(n.tabele?.length) || (n.dzieci || []).some(maDaneW);

// COMMIT / ROLLBACK bez metody, która go zrobiła: jednostka pracy z mapy (klasa z metodami commit i rollback — Unit
// of Work, `with uow:` → __exit__ → rollback) — jej metoda tej fazy; kilka kandydatów → konkretny (nie Abstract*/
// Base*), a gdy i tych kilka — nic
function jednostkaPracyZMapy(mapa, faza) {
  const kand = Object.entries(mapa?.klasy || {}).filter(([, v]) => (v.metody || []).includes(faza) && (v.metody || []).some(m => /^_?commit$/.test(m)) && (v.metody || []).includes("rollback"));
  const konkretne = kand.filter(([k]) => !/^(Abstract|Base)/.test(k.split(".").pop()));
  const r = konkretne.length ? konkretne : kand;
  return r.length === 1 ? r[0][0] : null;
}

// najkrótsza ścieżka w poddrzewie od węzła (bez niego) do pierwszego spełniającego warunek
function sciezka(od, warunek, maks = 8) {
  const kolejka = [[od, []]];
  while (kolejka.length) {
    const [n, droga] = kolejka.shift();
    if (droga.length > maks) continue;
    for (const d of n.dzieci || []) {
      const nowa = [...droga, d];
      if (warunek(d)) return nowa;
      kolejka.push([d, nowa]);
    }
  }
  return null;
}

export function wzbogac(p, statyczne, mapa = null, { mozliwe = false, miedzy = false } = {}) {
  if (!p?.kroki?.length || !statyczne?.wejscia?.length) return p;
  const ix = indeks(statyczne);
  const kroki = p.kroki.map(k => ({ ...k }));
  kroki.forEach(k => (k._rp = k.rodzic != null ? kroki[k.rodzic] : null));
  const ucz = new Map(p.uczestnicy.map(u => [u.id, u]));
  const uczestnik = n => {
    if (n.rola === "zewnetrzne") {                        // klient innego systemu: uczestnik jak z OTel („zew:…”)
      const id = "zew:" + n.nazwa;
      if (!ucz.has(id)) ucz.set(id, { id, rodzaj: "zewnetrzny", nazwa: n.nazwa, poziom: null });
      return id;
    }
    if (!ucz.has(n.klasa)) ucz.set(n.klasa, { id: n.klasa, rodzaj: n.rola === "repozytorium" ? "repozytorium" : "klasa", rola: n.rola, klasa: n.klasa, nazwa: n.nazwa, poziom: mapa?.klasy?.[n.klasa]?.poziom ?? null });
    return n.klasa;
  };
  const rodzajKroku = n => (n.rola === "repozytorium" ? "repozytorium" : n.rola === "zewnetrzne" ? "zewnetrzne" : "klasa");
  const wezel = new Map(), ostatniLancuch = new Map(), kursor = new Map(), odczyty = new Map(), wynik = [];
  let wstawione = 0, zgadnieteWejscie = null;
  const jednostkaPracy = faza => jednostkaPracyZMapy(mapa, faza);
  // rodzina implementacji (pakiet) wybrana dla niejednoznacznego repozytorium (jdbc / jpa / Spring Data) — do końca przebiegu
  let rodzina = null;
  const zapisane = new Set(kroki.filter(k => k.rodzaj === "sql" && ZAPIS.test(k.szablon || k.sql || "")).flatMap(k => tabele(k.szablon || k.sql)));
  const pierwszyBegin = kroki.findIndex(k => k.rodzaj === "transakcja" && k.faza === "start" && !k.savepoint);   // -1: bez BEGIN
  const zamiana = new Map();                                   // uczestnik zastąpiony rozpoznanym wejściem → nowy
  const powroty = [];                                          // powrót z repozytorium rozstrzygniętego szkieletem
  for (const k of kroki) {
    if (zamiana.has(k.z)) k.z = zamiana.get(k.z);
    if (k.rodzaj === "transakcja" && zamiana.has(k.do)) k.do = zamiana.get(k.do);      // z = do = rozpoznane wejście
    if (k._rp?._staryDo) {                                        // dzieci rozstrzygniętego repozytorium
      if (k.z === k._rp._staryDo) k.z = k._rp.do;
      if (k.do === k._rp._staryDo) k.do = k._rp.do;               // krok transakcji: z = do = właściciel
    }
    if (k.rodzaj === "powrot") {
      const i = powroty.findIndex(x => x.stary === k.z && x.metoda === k.metoda);
      if (i >= 0) { k.z = powroty[i].nowy; powroty.splice(i, 1); }
    }
    if (k.rodzaj === "wejscie" || k._rp == null) {
      // korzeń: wejście dokładnie albo (job: metoda execute dziedziczona, nie ma jej w źródle) dowolny węzeł tej klasy
      // kilka wejść o tej samej klasie i metodzie (przeciążenie): to, którego trasa pasuje do ścieżki requestu
      const wejscia = ix.poWejsciu.get(`${k.klasa}#${k.metoda}`) || [];
      const adres = bezParametrow(p.wejscie?.sciezka || p.wejscie?.adres || "");
      const wg = wejscia.length > 1 && adres ? wejscieDlaSciezki({ wejscia }, p.wejscie.metoda, adres) : null;
      let w = (wg || wejscia.at(-1))?.drzewo || ix.poMetodzie.get(`${k.klasa}#${k.metoda}`) || ix.poKlasie.get(k.klasa);
      // request HTTP bez klasy wejścia (log HTTP bez „Mapped to”): wejście ze szkieletu po metodzie i ścieżce
      // 4xx z walidacji argumentu (log-app: walidacja) — framework odrzucił request przed metodą, kroku kontrolera nie było
      const walidacja = (k.walidacja || p.wejscie?.walidacja) && p.wejscie?.status >= 400 && p.wejscie?.status < 500;
      if (!w && !k.klasa && p.wejscie?.metoda && p.wejscie?.sciezka && !walidacja) {
        const e = wejscieDlaSciezki(statyczne, p.wejscie.metoda, p.wejscie.sciezka);
        if (e) {
          w = e.drzewo;
          const u = uczestnik({ klasa: e.klasa, nazwa: e.klasa.split(".").pop(), rola: "wejscie" });
          zamiana.set(k.do, u);
          Object.assign(k, { klasa: e.klasa, metoda: e.metoda, do: u, statyczny: true, potwierdzony: true });
          wstawione++;
        }
      }
      // praca w tle bez logu startu (@Scheduled, wątek własny): wejście nie-HTTP, którego tabele najlepiej pokrywają SQL
      const wTle = String(k.klasa || "").startsWith("wątek ") || (k.rodzaj === "wejscie" && !k.klasa && /^w tle/.test(p.wejscie?.nazwa || ""));
      if (!w && wTle) {
        const sesja = kroki.filter(x => x.rodzaj === "sql").map(x => ({ sql: x.szablon || x.sql }));
        const bezHttp = statyczne.wejscia.filter(e => !e.http);
        let naj = sesja.length ? najlepszeWejscie(sesja, { wejscia: bezHttp }) : null;
        // jedyne wejście nie-HTTP w szkielecie (konsument kolejki, job), którego drzewo nie ma żadnej tabeli (handlery za
        // dyspozycją przez słownik, poza szkieletem), a praca w tle wysłała DML — to ono; zgadnięte. Drzewo z tabelami
        // ocenia pokrycie wyżej (np. migracja przy starcie to nie job porządków).
        if (naj && zapisPozaDrzewem(sesja, naj.w)) naj = najlepszeWejscie(sesja, { wejscia: bezHttp.filter(e => !zapisPozaDrzewem(sesja, e)) });
        const urwane = urwaneWejscie(bezHttp, sesja);
        if (!(naj?.pokrycie >= 0.5) && urwane) naj = { w: urwane, pokrycie: 1 };
        if (naj && naj.pokrycie >= 0.5) {
          w = naj.w.drzewo;
          zgadnieteWejscie = naj.w;
          const u = uczestnik({ klasa: naj.w.klasa, nazwa: naj.w.klasa.split(".").pop(), rola: "wejscie" });
          zamiana.set(k.do, u);
          Object.assign(k, { klasa: naj.w.klasa, metoda: naj.w.metoda, do: u, zgadniety: true, statyczny: true, potwierdzony: true });
          wstawione++;
        }
      }
      if (w) wezel.set(k, w);
      wynik.push(k);
      continue;
    }
    const baza = wezel.get(k._rp);
    let droga = null;
    if (baza && k.rodzaj === "repozytorium" && REPO_OGOLNE.test(k.klasa)) {
      // „SimpleJpaRepository.save” z logu → konkretne repozytorium ze szkieletu: kolejny węzeł repozytorium z tą metodą
      // (w kolejności kodu, od kursora), najlepiej z tabelą SQL-a wysłanego pod tym krokiem
      const lista = preorder(baza), kur = kursor.get(k._rp) ?? 0;
      const tab = new Set(kroki.filter(x => x._rp === k && x.rodzaj === "sql").flatMap(x => tabele(x.szablon || x.sql)));
      const repo = i => lista[i].at(-1).rola === "repozytorium" && lista[i].at(-1).metoda === k.metoda;
      const kolej = [...lista.keys()].slice(kur).concat([...lista.keys()].slice(0, kur));
      // bez tabeli zgodnej z SQL: węzeł o tej samej nazwie metody, ale z innymi tabelami (krawędź po nazwie do innego
      // repozytorium) odpada — zostaje dowolne repozytorium ze szkieletu z tą tabelą, a bez niego krok ogólny
      const zgodne = i => !tab.size || !(lista[i].at(-1).tabele || []).length || (lista[i].at(-1).tabele || []).some(x => tab.has(x));
      const i = kolej.find(i => repo(i) && (lista[i].at(-1).tabele || []).some(x => tab.has(x))) ?? kolej.find(i => repo(i) && zgodne(i));
      const zTabela = i == null && tab.size ? [...ix.poMetodzie.values()].find(n => n.rola === "repozytorium" && (n.tabele || []).some(x => tab.has(x))) : null;
      if (zTabela) {
        wezel.set(k, { ...zTabela, metoda: k.metoda, dzieci: [] });
        powroty.push({ stary: k.do, nowy: uczestnik(zTabela), metoda: k.metoda });
        k._staryDo = k.do;
        Object.assign(k, { klasa: zTabela.klasa, do: uczestnik(zTabela), zgadniety: true, repoOgolne: true });
        wstawione++;
      }
      if (i != null) {
        const n = lista[i].at(-1);
        droga = lista[i].slice(0, -1);
        kursor.set(k._rp, i);
        wezel.set(k, n);
        powroty.push({ stary: k.do, nowy: uczestnik(n), metoda: k.metoda });
        k._staryDo = k.do;
        Object.assign(k, { klasa: n.klasa, do: uczestnik(n), zgadniety: true, repoOgolne: true });
        wstawione++;
      }
    } else if (baza && (k.rodzaj === "klasa" || k.rodzaj === "repozytorium") && k.klasa) {
      // w kolejności kodu od kursora (po ostatnio użytym węźle tego rodzica): drugie takie samo wywołanie w requeście
      // to następne wystąpienie w drzewie (publishEvents → … → findByPatronId), a nie znów pierwsze; jedno
      // wystąpienie (pętla) — to samo. Przy kilku: to, którego tabele pokrywają SQL wysłany pod tym krokiem
      const lista = preorder(baza), kur = kursor.get(k._rp);
      const kolej = kur == null ? [...lista.keys()] : [...lista.keys()].slice(kur + 1).concat([...lista.keys()].slice(0, kur + 1));
      const ten = i => lista[i].at(-1).klasa === k.klasa && lista[i].at(-1).metoda === k.metoda;
      const tab = new Set(kroki.filter(x => x._rp === k && x.rodzaj === "sql").flatMap(x => tabele(x.szablon || x.sql)));
      const i = kolej.find(i => ten(i) && (lista[i].at(-1).tabele || []).some(t => tab.has(t))) ?? kolej.find(ten);
      if (i != null) { droga = lista[i]; kursor.set(k._rp, i); wezel.set(k, droga.at(-1)); droga = droga.slice(0, -1); }
      else if (ix.poMetodzie.has(`${k.klasa}#${k.metoda}`)) wezel.set(k, ix.poMetodzie.get(`${k.klasa}#${k.metoda}`));
    } else if (baza && k.rodzaj === "zewnetrzne" && !k.klasa) {
      // wywołanie innego systemu z runtime (HTTP z logu) → klasa-klient ze szkieletu (rola „zewnetrzne”), od kursora
      const lista = preorder(baza), kur = kursor.get(k._rp) ?? 0;
      const kolej = [...lista.keys()].slice(kur).concat([...lista.keys()].slice(0, kur));
      // bez roli „zewnetrzne” w mapie: węzeł bez danych, którego nazwa (klasa, metoda) pasuje do adresu wywołania
      // (GET /zewn/opisy/… ↔ KatalogZewnetrzny.opis) albo mówi, że to klient innego systemu (OkladkiClient)
      const slowa = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-ząćęłńóśźż]+/).filter(x => x.length >= 4);
      const adres = slowa(String(k.opis || k.adres || k.nazwa || "").replace(/^[A-Z]+\s+/, "").replace(/^\w+:\/\/[^/]+/, ""));
      const zgodne = (a, b) => a.startsWith(b) || b.startsWith(a);
      const ocena = n => { if (maDaneW(n) || n.zgadniety) return 0; const s = slowa(`${n.klasa.split(".").pop()} ${n.metoda}`);
        return s.filter(x => adres.some(y => zgodne(x, y))).length * 2 + (/client|klient|zewn|extern|gateway/i.test(n.klasa.split(".").pop()) ? 1 : 0); };
      let i = kolej.find(i => lista[i].at(-1).rola === "zewnetrzne");
      if (i == null) { let naj = 0; for (const j of kolej) { const o = ocena(lista[j].at(-1)); if (o > naj && o >= 2) { naj = o; i = j; } } }
      if (i != null) { droga = lista[i]; kursor.set(k._rp, i); }
    } else if (baza && k.rodzaj === "transakcja" && k.zrodlo === "SQL" && k._rp?.rodzaj === "wejscie" && k.z === k._rp.do && TX_METODA[k.faza]) {
      // BEGIN / COMMIT / ROLLBACK z logu ORM-u (EF: Beginning / Committing / Rolling back transaction) przy wejściu:
      // węzeł szkieletu z metodą tej fazy (BeginTransactionAsync, CommitTransactionAsync…) — droga do niego, a krok
      // transakcji pod nim (właścicielem zostaje wspólny przodek początku i końca: potok z transakcją)
      const lista = preorder(baza);
      // najkrótsza droga, nie przez metodę innej fazy (RollbackTransactionAsync w catch CommitTransactionAsync — commitu
      // nie było, rollback jest rodzeństwem pod potokiem)
      const innaFaza = n => Object.entries(TX_METODA).some(([f, re]) => f !== k.faza && re.test(n.metoda || ""));
      const i = [...lista.keys()].filter(i => TX_METODA[k.faza].test(lista[i].at(-1).metoda || "") && !lista[i].at(-1).zgadniety && !lista[i].slice(0, -1).some(innaFaza))
        .sort((a, b) => lista[a].length - lista[b].length || a - b)[0];
      if (i != null) { droga = lista[i]; k._txDoWezla = true; }
    } else if (baza && k.rodzaj === "sql" && !k.flush) {          // flush przy commicie nie pochodzi z wywołania repozytorium
      // w kolejności kodu: kolejny węzeł z tabelą tego SQL od kursora (ostatnio użytego), z metodą pasującą do operacji
      const t = tabele(k.szablon || k.sql);
      const sqlK = k.szablon || k.sql;
      const tekst = normalizuj(sqlK);
      const maTekst = n => (n.sql || []).some(x => normalizuj(x) === tekst);
      const zapis = ZAPIS.test(sqlK);
      const lista = preorder(baza);
      // zapis ORM-u (EF Core SaveChanges, Session.flush, persist): wywołanie metody repozytorium bez tabel w szkielecie
      // (tabela wynika z encji w pamięci), choć gospodarz sam ma tabelę z zapytań LINQ
      const zapisRepo = i => zapis && lista[i].at(-1).rola === "repozytorium" && !(lista[i].at(-1).tabele || []).length && pasujeOperacja(lista[i].at(-1), sqlK);
      const bazaMa = (baza.tabele || []).some(x => t.includes(x)) || maTekst(baza);
      if ((t.length || lista.some(d => maTekst(d.at(-1)))) && (!bazaMa || lista.some((_, i) => zapisRepo(i))) && !maTekst(baza)) {
        const kur = kursor.get(k._rp) ?? 0;
        const zTabela = i => (lista[i].at(-1).tabele || []).some(x => t.includes(x));
        const zMozliwa = i => (lista[i].at(-1).tabele_mozliwe || []).some(x => t.includes(x));
        const zTekstem = i => maTekst(lista[i].at(-1));
        // SQL wygenerowany przez ORM (aliasy v1_0) to nie ręcznie napisany natywny SQL kandydata na te same tabele
        const orm = ALIAS_ORM.test(sqlK);
        const inny = i => { const n = lista[i].at(-1); return orm && !!n.sql?.length && !maTekst(n) && n.sql.some(x => tabele(x).some(y => t.includes(y))); };
        // SELECT: od początku drzewa, najpłytszy węzeł (zapytania do wszechobecnych tabel — uprawnienia, słowniki —
        // pasują też głęboko w innych gałęziach) i bez przesuwania kursora; zapis: w kolejności kodu od kursora
        const odczyt = ["select", "with"].includes(operacja(sqlK));
        // przy tej samej głębokości: najpierw węzły od kursora zapisów (kod już przeszedł za wcześniejsze rodzeństwo —
        // SELECT deletions w autoClearOld po ActivityLogger.add, nie w softDestroyPage przed nim)
        const zaKursorem = i => (kursor.has(k._rp) && i < kur ? 1 : 0);
        const kolej = odczyt ? [...lista.keys()].sort((a, b) => lista[a].length - lista[b].length || zaKursorem(a) - zaKursorem(b) || a - b)
          : [...lista.keys()].slice(kur).concat([...lista.keys()].slice(0, kur));
        // rodzeństwo niejednoznaczne (kilka implementacji interfejsu): ta sama rodzina co poprzednio wybrana
        // SQL przed BEGIN requestu (uwierzytelnianie w middleware, zanim ruszył potok), gdy BEGIN przyszedł później:
        // nie przez węzeł, który dopiero otwiera transakcję (dziecko BeginTransactionAsync) — ten się jeszcze nie zaczął
        const przedTx = kroki.indexOf(k) < pierwszyBegin;
        const zaBeginem = i => przedTx && lista[i].some(n => (n.dzieci || []).some(d => TX_METODA.start.test(d.metoda || "")));
        const wybierz = warunek => {
          const kand = kolej.filter(i => warunek(i) && !inny(i) && !zaBeginem(i));
          if (rodzina) { const r = kand.find(i => lista[i].at(-1).niejednoznaczny && pakiet(lista[i].at(-1)) === rodzina); if (r != null) return r; }
          return kand.find(i => !(rodzina && lista[i].at(-1).niejednoznaczny && pakiet(lista[i].at(-1)) !== rodzina && kand.some(j => j !== i && !lista[j].at(-1).niejednoznaczny))) ?? kand[0];
        };
        // zapis bez kotwicy tabeli: jedyna metoda repozytorium z pasującą operacją (po odrzuceniu innych rodzin)
        const jedyny = () => {
          const kand = kolej.filter(i => lista[i].at(-1).rola === "repozytorium" && !(lista[i].at(-1).tabele || []).length && pasujeOperacja(lista[i].at(-1), sqlK));
          const r = rodzina ? kand.filter(i => !lista[i].at(-1).niejednoznaczny || pakiet(lista[i].at(-1)) === rodzina) : kand;
          return r.length === 1 ? r[0] : undefined;
        };
        // odczyt bez operacji w nazwie: nie pod metodę zapisu (BookRepo.update z tą samą tabelą, gdy request skończył
        // się przed zapisem), dopóki jest inny węzeł z tabelą
        const zapisNazwa = i => { const m = lista[i].at(-1).metoda || ""; return odczyt && !OPERACJE.select.test(m) && (OPERACJE.insert.test(m) || OPERACJE.update.test(m) || OPERACJE.delete.test(m)); };
        // repozytorium bez tabel (zapis ORM-u) tylko, gdy każdy węzeł poddrzewa z tabelą tego SQL leży na drodze do
        // niego (gospodarz z LINQ nad SaveChanges) — węzeł z tą tabelą w innej gałęzi ma ją jawnie (szyna zdarzeń z
        // INSERT INTO domain_events obok FileCourseRepository.save, złej implementacji interfejsu)
        const zTab = [...lista.keys()].filter(zTabela).map(j => lista[j].at(-1));
        const zapisRepoNaDrodze = i => zapisRepo(i) && zTab.every(n => lista[i].includes(n));
        // odczyt nie otwiera gałęzi przez metodę zapisu (PageRepo.move → … → rebuildPermissions przy SELECT roles z
        // uwierzytelniania) ani przez krawędź zgadniętą, dopóki jest droga bez nich
        const zapisMetoda = m => !OPERACJE.select.test(m) && (OPERACJE.insert.test(m) || OPERACJE.update.test(m) || OPERACJE.delete.test(m));
        // metoda zapisu repozytorium potwierdzona, gdy w przebiegu jest zapis do tabeli z jej poddrzewa (saveNewRole → INSERT joint_permissions)
        const niepotwierdzonyZapis = n => n.rola === "repozytorium" && zapisMetoda(n.metoda || "") && ![...(n._tabele ||= tabeleDrzewa(n)).pewne].some(x => zapisane.has(x));
        const przezZapis = i => lista[i].slice(0, -1).some(niepotwierdzonyZapis), przezZgadniete = i => lista[i].some(n => n.zgadniety);
        const drogaZapisu = i => odczyt && (przezZapis(i) || przezZgadniete(i));
        // jedyna droga przez metodę zapisu, która nie padła, i to jeszcze krawędzią zgadniętą — SELECT zostaje przy rodzicu
        const zgadywany = i => odczyt && przezZapis(i) && przezZgadniete(i);
        let i = wybierz(zTekstem) ?? wybierz(i => zTabela(i) && pasujeOperacja(lista[i].at(-1), sqlK)) ?? wybierz(zapisRepoNaDrodze)
          ?? (bazaMa ? wybierz(zapisRepo) : wybierz(i => zTabela(i) && !zapisNazwa(i) && !drogaZapisu(i)) ?? wybierz(i => zTabela(i) && !zapisNazwa(i) && !zgadywany(i)) ?? wybierz(i => zTabela(i) && !zgadywany(i)) ?? wybierz(zapisRepo) ?? wybierz(zMozliwa) ?? (zapis ? jedyny() : undefined));
        // ten sam odczyt drugi raz pod tym samym rodzicem, a jego węzeł już go dostał: kolejny w kolejności kodu za
        // poprzednim odczytem węzeł z tą tabelą (findBy w handlerze zdarzenia po find w serwisie), a bez niego — ten sam
        if (i != null && odczyt) {
          const uzyte = odczyty.get(k._rp) || { wezly: new Map(), kur: -1 };
          odczyty.set(k._rp, uzyte);
          const juz = j => uzyte.wezly.get(lista[j].at(-1))?.has(tekst);
          if (juz(i)) {
            const alt = [...lista.keys()].find(j => j > uzyte.kur && j !== i && zTabela(j) && !juz(j) && !inny(j) && !zaBeginem(j) && !zapisNazwa(j));
            if (alt != null) i = alt;
          }
          const n = lista[i].at(-1);
          if (!uzyte.wezly.has(n)) uzyte.wezly.set(n, new Set());
          uzyte.wezly.get(n).add(tekst);
          uzyte.kur = Math.max(uzyte.kur, i);
        }
        if (i == null && !bazaMa && t.length) k._bezKotwicy = true;
        if (i != null) {
          droga = lista[i];
          // tabela węzła tylko zebrana z wywołań (user_create ← create_user): w dół, dopóki dokładnie jedno dziecko ma
          // tę tabelę, a węzeł nie ma własnego SQL na nią; zapis — także do jedynego dziecka-repozytorium bez tabel z
          // pasującą operacją (DoctrineCourseRepository.save → DoctrineRepository.persist, flush ORM-u)
          for (let n = droga.at(-1), krok = 0; krok < 6; krok++) {
            if ((n.sql || []).some(x => tabele(x).some(y => t.includes(y)) || normalizuj(x) === tekst)) break;
            const zT = (n.dzieci || []).filter(d => (d.tabele || []).some(x => t.includes(x)));
            const zgodneDz = new Set(zT.map(d => `${d.klasa}#${d.metoda}`));
            let dalej = zgodneDz.size === 1 && zT[0].klasa !== n.klasa ? zT[0] : null;
            if (!dalej && !zT.length && zapis && (n.tabele || []).some(x => t.includes(x))) {
              const repo = (n.dzieci || []).filter(d => d.rola === "repozytorium" && !(d.tabele || []).length && !d.niejednoznaczny && pasujeOperacja(d, sqlK));
              if (new Set(repo.map(d => `${d.klasa}#${d.metoda}`)).size === 1) dalej = repo[0];
            }
            if (!dalej) break;
            droga = [...droga, dalej]; n = dalej;
          }
          if (!odczyt) kursor.set(k._rp, i);
          const n = lista[i].at(-1);
          if (n.niejednoznaczny && !rodzina) rodzina = pakiet(n);
        }
      }
    }
    // SQL bez węzła w szkielecie (relacje doczytywane przez ORM, N+1) tuż po łańcuchu do repozytorium pod tym samym
    // rodzicem: wysłało go to repozytorium — pod nie, a łańcuch trwa dalej (kolejne wywołania bez powtórki)
    if (k._bezKotwicy && !droga?.length) {
      const ost = ostatniLancuch.get(k._rp), ostatniIstotny = wynik.findLast(x => !pomocniczy(x) && x.rodzaj !== "powrot");
      const wSrodku = x => { for (let r = x; r; r = r._rp) if (r === ost?.kroki[0]) return true; return false; };
      if (ost?.kroki.length && ost.wezly.at(-1)?.rola === "repozytorium" && ostatniIstotny && wSrodku(ostatniIstotny)) {
        const og = ost.kroki.at(-1);
        k._rp = og; k.z = og.do; k.glebokosc = (og.glebokosc ?? 0) + 1;
      }
    }
    delete k._bezKotwicy;
    // ścieżka zaczynająca się od tej samej metody co baza (przeciążenie, wywołanie przez this) — bez powtórki
    while (droga?.length && baza && droga[0].klasa === baza.klasa && droga[0].metoda === baza.metoda) droga = droga.slice(1);
    if (droga?.length) {
      // łańcuch o wspólnym początku z poprzednim tego rodzica (kilka SQL przez to samo repozytorium, kolejne wywołania
      // w tej samej metodzie) — wspólne ogniwa bez powtórki, o ile od tamtej pory było tylko wnętrze tego łańcucha
      // (kroki SAVEPOINT / SET / transakcji i powroty z jego wywołań nie przerywają ciągłości)
      const ost = ostatniLancuch.get(k._rp);
      const ostatniIstotny = wynik.findLast(x => !pomocniczy(x) && x.rodzaj !== "powrot");
      const wSrodku = x => { for (let r = x; r; r = r._rp) if (r === ost?.kroki[0]) return true; return false; };
      let wspolne = 0;
      if (ost && ostatniIstotny && wSrodku(ostatniIstotny))
        while (wspolne < droga.length && wspolne < ost.wezly.length && droga[wspolne].klasa === ost.wezly[wspolne].klasa && droga[wspolne].metoda === ost.wezly[wspolne].metoda) wspolne++;
      let rodzic = wspolne ? ost.kroki[wspolne - 1] : k._rp, z = wspolne ? rodzic.do : k.z;
      const nowe = wspolne ? ost.kroki.slice(0, wspolne) : [];
      for (const n of droga.slice(wspolne)) {
        const s = { rodzaj: rodzajKroku(n), ...(n.rola === "zewnetrzne" ? { opis: `${n.nazwa}.${n.metoda}()` } : {}), z, do: uczestnik(n), klasa: n.klasa, metoda: n.metoda, czas: 0, ts: k.ts,
          glebokosc: (rodzic.glebokosc ?? 0) + 1, samWsobie: z === n.klasa, statyczny: true, potwierdzony: true, zgadniety: !!n.zgadniety, logi: [], watek: k.watek, span: null, _rp: rodzic };
        wynik.push(s); wstawione++;
        wezel.set(s, n);
        nowe.push(s);
        rodzic = s; z = s.do;
      }
      const ogniwo = rodzic;
      ostatniLancuch.set(k._rp, { wezly: droga, kroki: nowe });
      k._rp = ogniwo; k.z = ogniwo.do; k.glebokosc = (ogniwo.glebokosc ?? 0) + 1;
      if (k._txDoWezla) k.do = ogniwo.do;                          // krok transakcji: z = do = metoda tej fazy
    }
    delete k._txDoWezla;
    // COMMIT / ROLLBACK z logu silnika SQL bez metody, która go zrobiła (log widzi tylko wejście): jednostka pracy
    // z mapy (klasa z metodami commit i rollback — Unit of Work, `with uow:` → __exit__ → rollback) — jej metoda
    // tej fazy, zgadnięta; kilka kandydatów → konkretny (nie Abstract*/Base*), a gdy i tych kilka — nic
    if (k.rodzaj === "transakcja" && k.zrodlo === "SQL" && ["commit", "rollback"].includes(k.faza) && k._rp?.rodzaj === "wejscie" && k.z === k._rp.do) {
      const uow = jednostkaPracy(k.faza);
      if (uow) {
        const n = { klasa: uow, nazwa: uow.split(".").pop(), metoda: k.faza, rola: mapa.klasy[uow].rola };
        const s = { rodzaj: rodzajKroku(n), z: k._rp.do, do: uczestnik(n), klasa: uow, metoda: k.faza, czas: 0, ts: k.ts, glebokosc: (k._rp.glebokosc ?? 0) + 1, samWsobie: false,
          statyczny: true, potwierdzony: true, zgadniety: true, logi: [], watek: k.watek, span: null, _rp: k._rp };
        wynik.push(s); wstawione++;
      }
    }
    wynik.push(k);
  }
  // BEGIN / COMMIT z logu silnika przy wejściu, a zapytania między nimi poszły łańcuchem ze szkieletu: transakcja
  // należy do metody, która ją objęła — najbardziej zewnętrznej transakcyjnej (mapa) nad tymi zapytaniami, a bez
  // niej do ich najbliższego wspólnego przodka, gdy to repozytorium (Doctrine flush w persist, ORM otwiera transakcję
  // leniwie). Inaczej — bez zmian.
  {
    const wpisTx = n => (mapa?.klasy?.[n.klasa]?.transakcyjne || []).includes(n.metoda);
    const przodkowie = k => { const w_ = []; for (let x = k._rp; x; x = x._rp) w_.push(x); return w_; };
    for (let i = 0; i < wynik.length; i++) {
      const b = wynik[i];
      if (b.rodzaj !== "transakcja" || b.faza !== "start" || b.zrodlo !== "SQL" || b.savepoint || b._rp?.rodzaj !== "wejscie" || b.z !== b._rp.do) continue;
      const j = wynik.findIndex((e, x) => x > i && e.rodzaj === "transakcja" && ["commit", "rollback"].includes(e.faza) && !e.savepoint && e._rp === b._rp);
      if (j < 0) continue;
      const sql = wynik.slice(i + 1, j).filter(x => x.rodzaj === "sql" && !pomocniczy(x));
      if (!sql.length || sql.some(x => x._rp === b._rp)) continue;
      let wspolne = przodkowie(sql[0]);
      for (const q of sql.slice(1)) { const p_ = new Set(przodkowie(q)); wspolne = wspolne.filter(x => p_.has(x)); }
      wspolne = wspolne.filter(x => x !== b._rp && x.rodzaj !== "wejscie");
      // bez metody transakcyjnej z mapy tylko repozytorium (flush ORM-u w nim otwiera transakcję); wspólny przodek
      // z warstwy aplikacji to za mało — transakcja bywa całego requestu (Django ATOMIC_REQUESTS, `with uow:` w widoku)
      const kto = wspolne.filter(x => wezel.get(x) && wpisTx(wezel.get(x))).at(-1) || (wspolne[0]?.rodzaj === "repozytorium" ? wspolne[0] : null);
      if (!kto) continue;
      for (const t of [b, wynik[j]]) Object.assign(t, { _rp: kto, z: kto.do, do: kto.do, glebokosc: (kto.glebokosc ?? 0) + 1 });
      wstawione++;
    }
  }
  const maDane = n => !!(n.tabele?.length) || (n.dzieci || []).some(maDane);
  // wywołania bez dostępu do danych (domena w pamięci, hasher, generator tokenu) leżące w kodzie PRZED ostatnim
  // potwierdzonym wywołaniem tej samej metody: skoro późniejsze się wykonało, wcześniejsze też (chyba że w gałęzi
  // warunku — szkielet tego nie mówi, stąd potwierdzony: false i miedzy: true). Węzły z danymi bez SQL — pominięte
  // (ich zapytanie nie padło), zgadnięte i niejednoznaczne — też. Na żądanie (miedzy), bo domyślnie przebieg ma tylko
  // kroki z runtime i drogi do nich; przy opcji mozliwe zbędne (ona dokłada wszystkie gałęzie bez danych).
  //
  // Zakończony rodzic: gdy za poddrzewem kroku jest późniejszy krok klasy spoza niego (rodzeństwo, metoda wołającego)
  // i w poddrzewie nie było błędu, metoda doszła do końca — jej wywołania bez danych ZA ostatnim potwierdzonym (albo
  // przy samym SQL pod nią, bez potwierdzonego dziecka) też padły. Pozycja dziecka: m-te wywołanie tej samej metody to
  // m-te jej wystąpienie w ciele (SaveChanges w pętli i na końcu). Przeciążenia (ta sama klasa#metoda, kilka definicji
  // — @EventListener handle(A) / handle(B)): krok z logu nie mówi, które, więc tylko dzieci wspólne wszystkim.
  if (miedzy && !mozliwe) {
    const wstaw = [];
    const klucz = d => `${d.klasa}#${d.metoda}`;
    const definicje = new Map();                                 // klasa#metoda → linia definicji → klucze dzieci
    for (const e of statyczne.wejscia) (function chodz(n) {
      if (n.linia != null) { const m = definicje.get(klucz(n)) || new Map(); definicje.set(klucz(n), m); const s = m.get(n.linia) || new Set(); m.set(n.linia, s); (n.dzieci || []).forEach(d => s.add(klucz(d))); }
      (n.dzieci || []).forEach(chodz);
    })(e.drzewo);
    const wspolne = n => { const m = definicje.get(klucz(n)); if (!m || m.size < 2) return null; const l = [...m.values()].filter(s => s.size); return l.length ? new Set([...l[0]].filter(x => l.every(s => s.has(x)))) : new Set(); };
    const potomek = (x, k) => { for (let r = x._rp; r; r = r._rp) if (r === k) return true; return false; };
    for (const k of wynik) {
      const n = wezel.get(k);
      if (!n?.dzieci?.length || k.rodzaj === "sql" || k.rodzaj === "transakcja" || k.rodzaj === "powrot") continue;
      const tylko = wspolne(n);
      const wyst = new Map();
      n.dzieci.forEach((d, i) => { if (!wyst.has(klucz(d))) wyst.set(klucz(d), []); wyst.get(klucz(d)).push(i); });
      const dzieci = wynik.filter(x => x._rp === k && x.klasa && x.rodzaj !== "powrot" && wyst.has(klucz(x)));
      const poz = new Map(), licz = new Map();
      for (const x of dzieci) { const l = wyst.get(klucz(x)), m = licz.get(klucz(x)) || 0; licz.set(klucz(x), m + 1); poz.set(x, l[Math.min(m, l.length - 1)]); }
      const ix_ = wynik.indexOf(k);
      let ostPotomek = ix_;
      for (let j = ix_ + 1; j < wynik.length; j++) if (potomek(wynik[j], k)) ostPotomek = j;
      const zakonczony = wynik.slice(ostPotomek + 1).some(y => y.klasa && y.rodzaj !== "powrot" && !y.miedzy && !potomek(k, y))
        && !wynik.slice(ix_, ostPotomek + 1).some(y => y.blad);
      if (!dzieci.length && !zakonczony) continue;
      const obecne = new Set(dzieci.map(klucz));
      const ost = zakonczony ? n.dzieci.length : Math.max(...dzieci.map(x => poz.get(x)));
      const pierwsza = dzieci.length ? Math.min(...dzieci.map(x => poz.get(x))) : Infinity;
      n.dzieci.forEach((d, j) => {
        if (j >= ost || obecne.has(klucz(d)) || maDane(d) || d.zgadniety || d.niejednoznaczny || (d.klasa === n.klasa && d.metoda === n.metoda) || (tylko && !tylko.has(klucz(d)))) return;
        // przed pierwszym potwierdzonym dzieckiem: zaraz po wejściu w metodę (przed jej SQL); dalej — przed następnym
        // potwierdzonym; za ostatnim (zakończony rodzic) — przed pierwszym krokiem spoza poddrzewa
        const przed = j < pierwsza && dzieci.length ? wynik[ix_ + 1] : dzieci.filter(x => poz.get(x) > j).sort((a, b) => poz.get(a) - poz.get(b))[0] || wynik[ostPotomek + 1] || null;
        const ts = przed?.ts ?? wynik[ostPotomek].ts;
        const s = { rodzaj: rodzajKroku(d), ...(d.rola === "zewnetrzne" ? { opis: `${d.nazwa}.${d.metoda}()` } : {}), z: k.do, do: uczestnik(d), klasa: d.klasa, metoda: d.metoda, czas: 0, ts, glebokosc: (k.glebokosc ?? 0) + 1, samWsobie: k.do === d.klasa,
          statyczny: true, potwierdzony: false, miedzy: true, zgadniety: false, logi: [], watek: k.watek, span: null, _rp: k };
        obecne.add(klucz(d));
        wstaw.push([przed, s]);
      });
    }
    for (const [przed, s] of wstaw) { const i = przed ? wynik.indexOf(przed) : -1; if (i >= 0) wynik.splice(i, 0, s); else wynik.push(s); wezel.set(s, null); wstawione++; }
  }
  // gałęzie bez dostępu do danych pod krokami ze znanym węzłem (np. metody encji, reguły domenowe) — ślad po nich
  // nie zostaje w żadnym logu; dokładamy je jako „możliwe” (potwierdzony: false), zaraz po kroku-rodzicu
  if (mozliwe) {
    const zDziecmi = [];
    for (const k of wynik) {
      const n = wezel.get(k);
      if (!n || k.rodzaj === "sql") continue;
      const obecne = new Set(wynik.filter(x => x._rp === k).map(x => `${x.klasa}#${x.metoda}`));
      const dodatki = [];
      (function dodaj(w, rodzic, gl, z) {
        for (const d of w.dzieci || []) {
          if (dodatki.length >= 8 || maDane(d) || obecne.has(`${d.klasa}#${d.metoda}`) || (d.klasa === w.klasa && d.metoda === w.metoda)) continue;
          const s = { rodzaj: rodzajKroku(d), ...(d.rola === "zewnetrzne" ? { opis: `${d.nazwa}.${d.metoda}()` } : {}), z, do: uczestnik(d), klasa: d.klasa, metoda: d.metoda, czas: 0, ts: k.ts, glebokosc: gl, samWsobie: z === d.klasa,
            statyczny: true, potwierdzony: false, zgadniety: !!d.zgadniety, logi: [], watek: k.watek, span: null, _rp: rodzic };
          dodatki.push(s);
          if (gl - (k.glebokosc ?? 0) < 2) dodaj(d, s, gl + 1, s.do);
        }
      })(n, k, (k.glebokosc ?? 0) + 1, k.do);
      if (dodatki.length) zDziecmi.push([k, dodatki]);
    }
    for (const [k, dodatki] of zDziecmi.reverse()) { wynik.splice(wynik.indexOf(k) + 1, 0, ...dodatki); wstawione += dodatki.length; }
  }
  if (!wstawione) return p;
  wynik.forEach((k, i) => (k.nr = i));
  const uzywani = new Set(wynik.flatMap(k => [k.z, k.do]));
  for (const id of [...ucz.keys()]) if (!uzywani.has(id) && ucz.get(id).rodzaj !== "wejscie") ucz.delete(id);
  for (const k of wynik) { k.rodzic = k._rp ? k._rp.nr : null; delete k._rp; delete k._staryDo; }
  const nowy = { ...p, kroki: wynik, uczestnicy: [...ucz.values()], zrodla: [...new Set([...(p.zrodla || []), "codegraph"])],
    ...(zgadnieteWejscie ? { wejscie: { ...p.wejscie, rodzaj: "job", nazwa: `≈ ${zgadnieteWejscie.klasa.split(".").pop()}.${zgadnieteWejscie.metoda}` } } : {}),
    statystyki: { ...p.statystyki, wstawioneStatycznie: wstawione } };
  nowy.transakcje = liczTransakcje(wynik, mapa);
  return nowy;
}

// Okno requestu ma SQL ze wszystkich połączeń w tym czasie, także pracy w tle (beat Celery, fire-and-forget na
// innym połączeniu). Gdy w oknie jest kilka połączeń, a wejście jest znane ze szkieletu, cudze jest połączenie z
// tabelami, z których żadna nie występuje w drzewie wejścia, gdy:
//  (a) inne połączenie żyje tylko w tym oknie (runserver Django: nowe połączenie na request), a to ma ruch także
//      przed albo po — request ma swoje połączenie;
//  (b) inne połączenie w oknie do drzewa pasuje, a tabele tego występują w drzewie innego wejścia — praca innego
//      wejścia (tabele spoza całego szkieletu, np. widoki Dappera, zostają: szkielet ich nie zna).
// Cudze zostają w buforze (praca w tle, sesje poza requestami). Połączenie bez tabel (sam BEGIN/COMMIT) — bez zmian.
export function tegoRequestu(okno, wej, { zakres = null, statyczne = null, od = -Infinity, do: do_ = Infinity, poprzednie = [] } = {}) {
  const pidy = [...new Set(okno.map(z => z.pid))];
  if (pidy.length < 2 || !wej?.drzewo?.dzieci?.length) return okno;         // wejście bez drzewa: nic nie wiadomo
  const { pewne, mozliwe } = wej._tabele ||= tabeleDrzewa(wej.drzewo);
  const tab = new Map(pidy.map(p => [p, new Set(okno.filter(z => z.pid === p).flatMap(z => tabele(z.sql)))]));
  const pasuje = p => [...tab.get(p)].some(t => pewne.has(t) || mozliwe.has(t));
  const wlasny = p => !!zakres?.get(p) && zakres.get(p)[0] >= od && zakres.get(p)[1] <= do_;
  const gdzieIndziej = t => (statyczne?.wejscia || []).some(e => e !== wej && (e._tabele ||= tabeleDrzewa(e.drzewo)).pewne.has(t));
  const obce = new Set(pidy.filter(p => tab.get(p).size && !pasuje(p) && (
    (!wlasny(p) && pidy.some(q => q !== p && wlasny(q))) || (pidy.some(q => q !== p && pasuje(q)) && [...tab.get(p)].some(gdzieIndziej)))));
  // cudze zapytania po wcześniejszym requescie (do 10 s), którego drzewo je wyjaśnia najlepiej (praca po odpowiedzi,
  // fire-and-forget): wskazówka dla hybrydaWTle zamiast zgadywania wśród wejść nie-HTTP
  for (const p of obce) {
    const zp = okno.filter(z => z.pid === p);
    const kand = [...new Set(poprzednie.filter(x => x.wej && x.wej !== wej && x.start <= zp[0].ts && zp[0].ts - x.start < 10000).map(x => x.wej))];
    const r = najlepszeWejscie(zp, { wejscia: kand });
    if (r?.pokrycie >= 0.5) zp.forEach(z => wskazowka.set(z, r.w));
  }
  return obce.size ? okno.filter(z => !obce.has(z.pid)) : okno;
}
const wskazowka = new WeakMap();                               // zapytanie → wejście, które je (najpewniej) wysłało
const poRequescie = new WeakMap();                             // zapytanie spoza requestów → wejścia HTTP skończone ≤ 2 s przed nim

// Requesty z access logu + zapytania z logu bazy → przebiegi hybrydowe. SQL z okna requestu (± 5 ms); wejście po
// ścieżce (szablon ze szkieletu), a gdy ścieżki nie ma w szkielecie — po tabelach. Zwraca też niewykorzystane zapytania.
export function hybrydaZRequestow(zapytania, requesty, statyczne, mapa = null) {
  let bufor = [...zapytania];
  const wynik = [];
  const poprzednie = [];                                       // requesty już rozpatrzone (wejście, start)
  const zakres = new Map();                                    // połączenie → [pierwsze, ostatnie zapytanie] w całym logu
  for (const z of zapytania) { const r = zakres.get(z.pid); if (!r) zakres.set(z.pid, [z.ts, z.ts]); else { r[0] = Math.min(r[0], z.ts); r[1] = Math.max(r[1], z.ts); } }
  // jeden znacznik czasu w access logu: początek albo koniec requestu — rozstrzyga pokrycie SQL
  const lista = wyrownajDoZapytan(requesty, zapytania).sort((a, b) => a.start - b.start);
  // margines ± 5 ms dwóch sąsiednich requestów zachodzi na siebie (wywołanie /zewn/* tuż przed requestem): zapytanie
  // należy do requestu, w którego oknie leży, a poza oknami — do najbliższego
  const odl = (r, z) => (z.ts < r.start ? r.start - z.ts : z.ts > r.koniec ? z.ts - r.koniec : 0);
  const wlasciciel = new Map();
  for (const z of zapytania) {
    let naj = null;
    for (const r of lista) if (odl(r, z) <= 5 && (!naj || odl(r, z) < odl(naj, z))) naj = r;
    if (naj) wlasciciel.set(z, naj);
  }
  // okna przybliżone (czas do sekundy: php -S, CLF bez czasu trwania) zachodzą na siebie przy kilku requestach w
  // sekundzie: ciąg zapytań jednego połączenia (bez przerwy > 300 ms) idzie w całości do jednego requestu — z tych,
  // których okno go mieści, pierwszego jeszcze bez SQL o najwcześniejszym końcu (ruch po kolei)
  const przybl = lista.filter(r => r.przyblizone);
  if (przybl.length > 1) {
    const zajete = new Set();
    for (const s of sesje(zapytania, { tenSamPid: true, lacz: 0, przerwa: 300 })) {
      const kand = przybl.filter(r => s[0].ts >= r.start - 5 && s.at(-1).ts <= r.koniec + 5);
      const r = kand.length > 1 ? kand.filter(x => !zajete.has(x)).sort((x, y) => x.koniec - y.koniec || x.start - y.start)[0] : kand[0];
      if (!r) continue;
      zajete.add(r);
      if (kand.length > 1) s.forEach(z => wlasciciel.set(z, r));
    }
  }
  // linia logu po odpowiedzi (czasKonca: uvicorn.access, morgan): COMMIT / ROLLBACK połączenia, którego poprzednie
  // zapytanie należy do requestu, zaraz po jego końcu (≤ 100 ms: zamknięcie sesji w zależności get_db po wysłaniu
  // odpowiedzi) — koniec transakcji tego requestu, nie następnego
  const poPid = new Map();
  for (const z of [...zapytania].sort((a, b) => a.ts - b.ts)) { if (!poPid.has(z.pid)) poPid.set(z.pid, []); poPid.get(z.pid).push(z); }
  for (const l of poPid.values()) for (let i = 1; i < l.length; i++) {
    const z = l[i], r = wlasciciel.get(l[i - 1]);
    if (r?.czasKonca && TX_KONIEC.test(z.sql) && wlasciciel.get(z) !== r && z.ts > r.koniec && z.ts - r.koniec <= 100) wlasciciel.set(z, r);
  }
  // transakcja (BEGIN … COMMIT/ROLLBACK jednego połączenia) nie dzieli się między requesty: okna zgadnięte z linii logu
  // bez czasu trwania (uvicorn.access) tną ją na granicy — cała do requestu z większością jej zapytań (remis: z
  // pierwszym), a bez zapytań — do requestu z BEGIN
  for (const l of poPid.values()) {
    let od = -1;
    for (let i = 0; i < l.length; i++) {
      if (TX_START.test(l[i].sql)) { od = i; continue; }
      if (od < 0 || !TX_KONIEC.test(l[i].sql)) continue;
      const tx = l.slice(od, i + 1), wl = new Set(tx.map(z => wlasciciel.get(z)));
      od = -1;
      if (wl.size < 2) continue;
      const ile = new Map();
      for (const z of tx) if (!TX.test(z.sql) && wlasciciel.has(z)) ile.set(wlasciciel.get(z), (ile.get(wlasciciel.get(z)) || 0) + 1);
      const r = [...ile].sort((a, b) => b[1] - a[1])[0]?.[0] || wlasciciel.get(tx[0]);
      if (r) tx.forEach(z => wlasciciel.set(z, r));
    }
  }
  for (const r of lista) {
    const okno = bufor.filter(z => wlasciciel.get(z) === r || (!wlasciciel.has(z) && z.ts >= r.start - 5 && z.ts <= r.koniec + 5));
    // kilka wejść na tej samej trasie (procedury JSON-RPC, resolvery GraphQL): to, którego tabele pokrywają SQL okna
    const kand = wejsciaDlaSciezki(statyczne, r.metoda, r.sciezka);
    const wej = (kand.length > 1 && okno.length && najlepszeWejscie(okno, { wejscia: kand })?.w) || kand[0] || null;
    const w = tegoRequestu(okno, wej, { zakres, statyczne, od: r.start - 5, do: r.koniec + 5, poprzednie });
    poprzednie.push({ wej, start: r.start, koniec: r.koniec });
    bufor = bufor.filter(z => !w.includes(z));
    const p = wej ? zlozHybryde(w, statyczne, mapa, r, wej) : w.length ? zlozHybryde(w, statyczne, mapa, r) : null;
    if (p) wynik.push(p);
  }
  // start aplikacji przed pierwszym requestem (migracje, DDL, dane startowe z entrypointu): nie praca w tle — bez
  // zgadywania wejścia. Połączenia z DDL przed ruchem albo bez żadnego zapytania od początku ruchu.
  const r0 = Math.min(...requesty.map(r => r.start)) - 5;
  if (Number.isFinite(r0)) {
    const przed = bufor.filter(z => z.ts < r0);
    // bez DDL zostaje połączenie, którego zapytania w całości wyjaśnia jedno wejście nie-HTTP (komenda przy starcie:
    // manage.py setup_periodic_tasks) — to jego przebieg, nie dane startowe
    const bezHttp = { wejscia: (statyczne?.wejscia || []).filter(w => !w.http) };
    const komenda = p => { const r = najlepszeWejscie(przed.filter(z => z.pid === p), bezHttp); return r?.pokrycie === 1 && r.nadmiar === 0; };
    const startowe = new Set([...new Set(przed.map(z => z.pid))].filter(p => przed.some(z => z.pid === p && DDL.test(z.sql)) || (!zapytania.some(z => z.pid === p && z.ts >= r0) && !komenda(p))));
    bufor = bufor.filter(z => !(z.ts < r0 && startowe.has(z.pid)));
  }
  for (const z of bufor) {
    const kand = poprzednie.filter(x => x.wej && x.koniec <= z.ts && z.ts - x.koniec <= 2000).map(x => x.wej);
    if (kand.length) poRequescie.set(z, kand);
  }
  return { przebiegi: wynik, reszta: bufor };
}

// SQL poza requestami (joby bez logu startu, konsumenci): sesje po połączeniu → wejście nie-HTTP po tabelach (≈).
// Bez requestu nie ma czego sklejać: sesja = jedno połączenie (konsumenci różnych grup tej samej wiadomości działają
// równolegle na kilku połączeniach). Sesje z DDL (CREATE / DROP / ALTER — migracja, schemat przy starcie) — pominięte.
export function hybrydaWTle(zapytania, statyczne, mapa = null, { minPokrycie = 0.5 } = {}) {
  const bezHttp = { wejscia: (statyczne?.wejscia || []).filter(w => !w.http) };
  const wynik = [];
  for (const s of sesje(zapytania, { tenSamPid: true })) {
    if (s.some(z => DDL.test(z.sql))) continue;
    const wsk = s.map(z => wskazowka.get(z)).filter(Boolean);
    // większość zapytań sesji ze wskazówką jednego wejścia (reszta sesji padła już po oknie tamtego requestu)
    let naj = wsk.length * 2 >= s.length && new Set(wsk).size === 1 ? { w: wsk[0], pokrycie: 1 } : null;
    // zgadywanie po tabelach: bez wejść, których drzewo nie zna tabeli zapisanej w sesji (beat Celery zmienia
    // periodictask — komenda, która je tylko czyta, to nie ona)
    if (!naj) naj = najlepszeWejscie(s, { wejscia: bezHttp.wejscia.filter(w => !zapisPozaDrzewem(s, w)) });
    // urwany szkielet: jedyne wejście nie-HTTP bez żadnej tabeli w drzewie (handlery za dyspozycją przez słownik)
    if (!(naj?.pokrycie >= minPokrycie)) { const u = urwaneWejscie(bezHttp.wejscia, s); if (u) naj = { w: u, pokrycie: 1 }; }
    // praca po odpowiedzi (Task.Run, setImmediate, wątek bez await): drzewo wejścia HTTP, którego request skończył się
    // tuż przed sesją, wyjaśnia jej tabele — „w tle po …”
    if (!(naj?.pokrycie >= minPokrycie)) {
      const kand = [...new Set(s.flatMap(z => poRequescie.get(z) || []))];
      const r = kand.length ? najlepszeWejscie(s, { wejscia: kand.filter(w => !zapisPozaDrzewem(s, w)) }) : null;
      if (r?.pokrycie >= minPokrycie && r.nadmiar < 1) naj = r;
    }
    if (!naj || naj.pokrycie < minPokrycie) continue;
    const p = zlozHybryde(s, statyczne, mapa, null, naj.w);
    if (p) { p.wejscie = { ...p.wejscie, rodzaj: "job", nazwa: `≈ ${naj.w.http ? "w tle po " : ""}${naj.w.klasa.split(".").pop()}.${naj.w.metoda}` }; wynik.push(p); }
  }
  return wynik;
}

// jedyne wejście nie-HTTP w szkielecie (konsument kolejki, job), którego drzewo nie ma żadnej tabeli, a praca w tle
// wysłała SQL na dane — to ono (zgadnięte); drzewo z tabelami ocenia pokrycie wyżej
function urwaneWejscie(bezHttp, sesja) {
  return bezHttp.length === 1 && !(bezHttp[0]._tabele ||= tabeleDrzewa(bezHttp[0].drzewo)).pewne.size
    && sesja.some(x => /^\s*(select|insert|update|delete|with)\b/i.test(x.sql) && !/^\s*select\s+1\b/i.test(x.sql)) ? bezHttp[0] : null;
}

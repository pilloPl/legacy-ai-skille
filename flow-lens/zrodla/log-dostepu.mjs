// Źródło: access log serwera HTTP (Tomcat/Spring Boot, nginx, Apache, IIS) — granice requestów bez żadnej zmiany
// w kodzie, tylko konfiguracja. Daje okno [start, koniec], metodę, ścieżkę i status. Z logiem bazy (SQL w oknie)
// i szkieletem z CodeGraph (wejście po ścieżce) składa przebieg hybrydowy.
//
// Zalecane wzorce (z czasem trwania i milisekundami):
//   Spring Boot / Tomcat: server.tomcat.accesslog.enabled=true
//                         server.tomcat.accesslog.pattern=%{begin:yyyy-MM-dd'T'HH:mm:ss.SSSZ}t %m %U %s %{ms}T
//                         (begin: = początek requestu — samo %{…}t to w Tomcat 10.1+ KONIEC; %{ms}T = czas w ms;
//                         samo %D w Tomcat 10+ to mikrosekundy). Można też dać dwa czasy: %{begin:…}t %{end:…}t.
//   nginx:  log_format flowlens '$time_iso8601 $msec $request_method $request_uri $status $request_time';
//           ($msec i $time_iso8601 to czas zapisu linii = koniec; start = $msec − $request_time)
//   Apache: LogFormat "%{%Y-%m-%dT%H:%M:%S}t.%{msec_frac}t %m %U%q %>s %D" flowlens   (%t Apache = początek)
// Obsługujemy też zwykły Common/Combined Log Format (sekundy, bez czasu trwania — okno szacowane).
// Gdy z linii nie wiadomo, czy czas jest początkiem, czy końcem (jeden znacznik %t), rozstrzyga wyrownajDoZapytan:
// która interpretacja obejmuje oknami więcej SQL z logu bazy.
import fs from "node:fs";
import { spawn } from "node:child_process";

export const nazwa = "log-dostepu";

const CZAS = String.raw`\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?`;
// [czas] [drugi czas = koniec (%{end:…}t)] [epoka z ułamkiem = $msec nginx, koniec] metoda ścieżka status trwanie
const ISO = new RegExp(String.raw`^(${CZAS})\s+(?:(${CZAS})\s+)?(?:(\d+\.\d+)\s+)?([A-Z]+)\s+(\S+)\s+(\d{3})\s+([\d.]+)(?:\s*(ms|us|µs|μs|s)(?![\w]))?`);
const czasIso = t => Date.parse(t.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"));
const CLF = /^\S+ \S+ \S+ \[(\d\d)\/(\w{3})\/(\d{4}):(\d\d):(\d\d):(\d\d) ([+-]\d{4})\] "([A-Z]+) (\S+)[^"]*" (\d{3}) \S+(?: "[^"]*" "[^"]*")?(?:\s+([\d.]+))?/;
const MIES = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
// wbudowany serwer PHP (php -S, PHP_CLI_SERVER_WORKERS): „[pid] [Wed Oct 21 21:20:54 2026] ip:port Accepted” na
// początku i „… ip:port [200]: GET /index.php?route=…” po odpowiedzi (czas do sekundy, bez strefy — kontener w UTC).
// Okno: od sekundy „Accepted” tego połączenia (pid + ip:port) do końca sekundy linii ze statusem.
const PHP_S = /^\[(\d+)\] \[\w{3} (\w{3}) +(\d+) (\d\d):(\d\d):(\d\d) (\d{4})\] (\S+) (?:Accepted$|\[(\d{3})\]: ([A-Z]+) (\S+))/;
const przyjetePhp = new Map();                                         // „pid ip:port” → czas linii Accepted
const czasPhp = m => Date.parse(`${m[7]}-${MIES[m[2]]}-${m[3].padStart(2, "0")}T${m[4]}:${m[5]}:${m[6]}Z`);
// ścieżka bez zapytania i bez parametrów macierzowych segmentów („/track.xhtml;jsessionid=…” — JSF/servlet przepisuje
// action formularza, póki przeglądarka nie ma ciasteczka sesji)
export const bezParametrow = s => String(s).split("?")[0].replace(/;[^/]*/g, "");

// jednostka czasu trwania: „us” (Tomcat %D < 10, Apache %D), „ms” (Tomcat 10+ %D, nginx $request_time*1000), „s” (nginx)
// czasJestKoncem: true / false wymusza znaczenie jedynego znacznika czasu; domyślnie (null) nie wiadomo → niepewnyStart
// phpSerwer: linie `php -S` jako access log — tylko na życzenie (sledzLogDostepu: plik wskazany jako access log), bo
// te same linie stoją w logu frameworka aplikacji PHP (Kanboard, Symfony) i tam granice daje log frameworka
export function parsujLinie(l, { jednostka = "auto", czasJestKoncem = null, phpSerwer = false } = {}) {
  let m = ISO.exec(l.trim()), start, metoda, sciezka, status, trwa, koniec = null;
  if (m) {
    start = czasIso(m[1]); metoda = m[4]; sciezka = m[5]; status = Number(m[6]); trwa = Number(m[7]);
    if (m[2]) koniec = czasIso(m[2]);                                    // %{begin:…}t %{end:…}t
    else if (m[3]) koniec = Math.round(Number(m[3]) * 1000);             // nginx $msec
    // jawna jednostka po liczbie (morgan: „18.051 ms”) ważniejsza od heurystyki kropki (nginx $request_time: s)
    if (jednostka === "auto") jednostka = m[8] ? (m[8] === "s" ? "s" : m[8] === "ms" ? "ms" : "us") : m[7].includes(".") ? "s" : "ms";
  } else if ((m = CLF.exec(l.trim()))) {
    start = Date.parse(`${m[3]}-${MIES[m[2]]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${m[7].slice(0, 3)}:${m[7].slice(3)}`);
    metoda = m[8]; sciezka = m[9]; status = Number(m[10]); trwa = m[11] ? Number(m[11]) : NaN;
    if (jednostka === "auto") jednostka = "us";
  } else if (phpSerwer && (m = PHP_S.exec(l.trim()))) {
    const t = czasPhp(m), klucz = `${m[1]} ${m[8]}`;
    if (!m[9]) { przyjetePhp.set(klucz, t); if (przyjetePhp.size > 500) przyjetePhp.delete(przyjetePhp.keys().next().value); return null; }
    const od = przyjetePhp.get(klucz);
    przyjetePhp.delete(klucz);
    if (!Number.isFinite(t)) return null;
    const pocz = Number.isFinite(od) && od <= t && t - od < 60000 ? od : t;
    return { start: pocz, koniec: t + 999, metoda: m[10], sciezka: bezParametrow(m[11]), status: Number(m[9]), przyblizone: true, phpSerwer: true, ...(m[11].includes("?") ? { zapytanie: m[11].split("?").slice(1).join("?") } : {}) };
  } else return null;
  if (!Number.isFinite(start)) return null;
  const ms = !Number.isFinite(trwa) ? 1000 : jednostka === "us" ? trwa / 1000 : jednostka === "s" ? trwa * 1000 : trwa;
  const r = { metoda, sciezka: bezParametrow(sciezka), status, przyblizone: !Number.isFinite(trwa), ...(m[8] ? { jednostkaJawna: true } : {}) };
  if (Number.isFinite(koniec) && koniec > start) return { start, koniec, ...r };                        // dwa czasy
  if (Number.isFinite(koniec)) return { start: koniec - ms, koniec, ...r };                             // $msec = koniec
  if (czasJestKoncem) start -= ms;
  return { start, koniec: start + ms, ...r, ...(czasJestKoncem == null ? { niepewnyStart: true } : {}) };
}

// Jeden znacznik czasu (%t, %{…}t, $time_iso8601): początek czy koniec requestu? Ta interpretacja, której okna
// obejmują więcej zapytań z logu bazy (SQL requestu pada w jego trakcie). Przy gęstym ruchu obie obejmują podobnie
// dużo (okna sąsiadów) — wtedy rozstrzyga, w ilu oknach mieści się cała transakcja jednego połączenia (BEGIN …
// COMMIT/ROLLBACK), a przy dalszym remisie format: jawna jednostka po czasie trwania („… 200 5.507 ms”, morgan
// w Expressie) to linia pisana po odpowiedzi, czyli koniec. Inaczej — bez zmian (początek).
const MARGINES = 5;
const TX_START = /^\s*(begin|start\s+transaction)\b/i, TX_KONIEC = /^\s*(commit|rollback(?!\s+to\b))\b/i;
export function wyrownajDoZapytan(requesty, zapytania) {
  const niepewne = requesty.filter(r => r.niepewnyStart && !r.przyblizone);
  if (!niepewne.length || !zapytania.length) return requesty;
  const ts = zapytania.map(z => z.ts).sort((a, b) => a - b);
  // transakcje: [początek, koniec] na połączenie
  const tx = [], otwarte = new Map();
  for (const z of [...zapytania].sort((a, b) => a.ts - b.ts)) {
    if (TX_START.test(z.sql || "")) otwarte.set(z.pid, z.ts);
    else if (TX_KONIEC.test(z.sql || "") && otwarte.has(z.pid)) { tx.push([otwarte.get(z.pid), z.ts]); otwarte.delete(z.pid); }
  }
  const ocena = przesun => {
    const okna = niepewne.map(r => [r.start - przesun(r) - MARGINES, r.koniec - przesun(r) + MARGINES]);
    let n = 0;
    for (const t of ts) if (okna.some(([a, b]) => t >= a && t <= b)) n++;
    const calych = tx.filter(([a, b]) => okna.some(([x, y]) => a >= x && b <= y)).length;
    return { n, calych };
  };
  const pocz = ocena(() => 0), kon = ocena(r => r.koniec - r.start);
  const blisko = Math.abs(kon.n - pocz.n) <= 0.1 * Math.max(kon.n, pocz.n);
  const koniec = !blisko ? kon.n > pocz.n
    : kon.calych !== pocz.calych ? kon.calych > pocz.calych
      : kon.n !== pocz.n ? kon.n > pocz.n : niepewne.every(r => r.jednostkaJawna);
  if (!koniec) return requesty;
  return requesty.map(r => (niepewne.includes(r) ? { ...r, start: 2 * r.start - r.koniec, koniec: r.start, czasKonca: true } : r));
}

export function sledzLogDostepu(cel, naRequesty, opcje = {}) {
  let reszta = "";
  const przyjmij = t => {
    const linie = (reszta + t).split("\n");
    reszta = linie.pop();
    const r = linie.map(l => parsujLinie(l, { phpSerwer: true, ...opcje })).filter(Boolean);
    if (r.length) naRequesty(r);
  };
  if (cel.startsWith("docker:")) {
    const p = spawn("docker", ["logs", "-f", "--since", "1s", cel.slice(7)], { stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", d => przyjmij(String(d))); p.stderr.on("data", d => przyjmij(String(d)));
    return () => p.kill();
  }
  // katalog (Tomcat pisze plik per dzień) albo plik
  const pliki = () => { try { return fs.statSync(cel).isDirectory() ? fs.readdirSync(cel).map(f => `${cel}/${f}`) : [cel]; } catch { return []; } };
  const poz = new Map(pliki().map(f => [f, fs.statSync(f).size]));
  const zegar = setInterval(() => {
    for (const f of pliki()) {
      let st; try { st = fs.statSync(f); } catch { continue; }
      let p = poz.get(f) ?? 0;
      if (st.size < p) p = 0;                                            // rotacja / obcięcie
      if (st.size <= p) { poz.set(f, p); continue; }
      const fd = fs.openSync(f, "r"), buf = Buffer.alloc(st.size - p);
      fs.readSync(fd, buf, 0, buf.length, p); fs.closeSync(fd); poz.set(f, st.size);
      przyjmij(buf.toString("utf8"));
    }
  }, 250);
  return () => clearInterval(zegar);
}

// wejście statyczne dla ścieżki: dokładnie albo przez szablon ({id}, :id, *)
export function wejscieDlaSciezki(statyczne, metoda, sciezka) {
  return wejsciaDlaSciezki(statyczne, metoda, sciezka)[0] || null;
}
// wszystkie pasujące wejścia: dokładne, a bez nich — z szablonu. Kilka wejść na jednej trasie, różnych tylko
// operacją z ciała requestu (JSON-RPC: POST /jsonrpc.php → procedura, GraphQL: POST /graphql → resolver), log
// requestu nie rozróżnia — wybiera wołający (hybryda: po tabelach SQL okna)
export function wejsciaDlaSciezki(statyczne, metoda, sciezka) {
  const wej = (statyczne?.wejscia || []).filter(w => w.http);
  if (typeof sciezka === "string" && /[;?]/.test(sciezka)) sciezka = bezParametrow(sciezka);
  const zgodne = w => !w.http.metoda || !metoda || w.http.metoda === metoda;
  const dokladne = wej.filter(w => zgodne(w) && w.http.sciezka === sciezka);
  if (dokladne.length) return dokladne;
  const szablon = wej.find(w => {
    if (!zgodne(w)) return false;
    const re = new RegExp("^" + w.http.sciezka.replace(/[.+?^$()|[\]\\]/g, "\\$&").replace(/\{[^}]+\}|:\w+/g, "[^/]+").replace(/\*\*?/g, ".*") + "/?$");
    return re.test(sciezka);
  });
  return szablon ? wej.filter(w => zgodne(w) && w.http.sciezka === szablon.http.sciezka) : [];
}

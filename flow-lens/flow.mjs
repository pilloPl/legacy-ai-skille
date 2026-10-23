#!/usr/bin/env node
// flow-lens: odbiornik OpenTelemetry (i innych źródeł) + widok przebiegu jednego requestu przez klasy domenowe.
//
//   node flow.mjs                      odbiornik OTLP na :4318, widok na http://localhost:7788/_flow/
//   node flow.mjs -- <komenda…>        to samo i uruchamia aplikację podpiętą pod odbiornik
//                                      (Java: sam dokłada -javaagent i listę metod z mapy)
//   node flow.mjs agent                pobiera agenta OTel dla Javy do ~/.flow-lens/
//   node flow.mjs otel                 zapisuje .flow-lens/otel.properties z mapy (do ręcznego uruchomienia)
//
// Opcje: --mapa <plik> (domyślnie ./.flow-lens/mapa.json), --adnotacje <plik> (./.flow-lens/adnotacje.json),
//        --log <plik> [--wzorzec <regex z grupami ts,poziom,trace,span,tekst,watek>]  — plik logu aplikacji
//        (linie bez id requestu dopasowuje korelacja: wątek + czas),
//        --diag [katalog] (domyślnie ./.flow-lens/diag) — nasz log diagnostyczny (aplikacje bez OTel; bez tej opcji
//        czytany tylko z --bez-otel).
// Porty: FLOW_PORT (7788, widok), FLOW_OTLP_PORT (4318, standardowy port OTLP/HTTP).
// Nagrania: ~/.flow-lens/przebiegi/<czas>.jsonl (przebiegi) i <czas>.surowe.jsonl (rekordy ze źródeł — do
// przeliczenia po zmianie mapy). Bez zależności, Node 18+.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { czytajOtlp, odpowiedz } from "./zrodla/otlp.mjs";
import { sledzPlik } from "./zrodla/log-tekst.mjs";
import { sledzDiag } from "./zrodla/diag.mjs";
import { sledzLogApp } from "./zrodla/log-app.mjs";
import { BuforLogow } from "./korelacja.mjs";
import { sledzLogBazy, wlaczLogowaniePostgres, naSpan } from "./zrodla/log-bazy.mjs";
import { sesje, zlozHybryde, wzbogac, hybrydaZRequestow } from "./hybryda.mjs";
import { sledzLogDostepu, wejscieDlaSciezki } from "./zrodla/log-dostepu.mjs";
import { Zbieracz, przebiegiZRekordow } from "./przebieg.mjs";
import { wstrzyknij, usunWstrzykniecie } from "./wstrzykniecie/worktree.mjs";
import { AGENT_JAR, URL_AGENTA, srodowisko, zapiszWlasciwosci, toJava, include, toPython, srodowiskoPythona, toNode, srodowiskoNode } from "./mapa/agent_otel.mjs";

const TU = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.FLOW_PORT || 7788);
const PORT_OTLP = Number(process.env.FLOW_OTLP_PORT || 4318);
const KATALOG = path.join(os.homedir(), ".flow-lens", "przebiegi");
const WIDOK = path.join(TU, "widok");
const PRZYKLADY = path.join(TU, "przyklady");
const TYPY = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
  ".jsonl": "application/x-ndjson", ".woff2": "font/woff2" };

// ---------------------------------------------------------------- argumenty
const argv = process.argv.slice(2);
const kreska = argv.indexOf("--");
const opcje = kreska >= 0 ? argv.slice(0, kreska) : argv;
const komenda = kreska >= 0 ? argv.slice(kreska + 1) : [];
const opcja = n => { const i = opcje.indexOf(n); return i >= 0 ? opcje[i + 1] : null; };
const PODKOMENDA = ["agent", "otel", "wstrzyknij", "usun-wstrzykniecie"].includes(opcje[0]) ? opcje[0] : null;
const PLIK_MAPY = path.resolve(opcja("--mapa") || path.join(".flow-lens", "mapa.json"));
const PLIK_ADNOTACJI = path.resolve(opcja("--adnotacje") || path.join(path.dirname(PLIK_MAPY), "adnotacje.json"));
const PLIK_LOGU = opcja("--log");
const LOG_APP = opcja("--log-app");                 // logi frameworka (Spring/Hibernate na DEBUG/TRACE) → przebiegi
// nasz log diagnostyczny (aplikacje bez OTel, wstrzyknięte pomocniki): --diag [katalog], domyślnie <repo>/.flow-lens/diag
const BEZ_OTEL = opcje.includes("--bez-otel");      // w trybie polecenia: log diagnostyczny zamiast OTel (Python, Node)
const iDiag = opcje.indexOf("--diag"), poDiag = iDiag >= 0 ? opcje[iDiag + 1] : null;
const KATALOG_DIAG = path.resolve(poDiag && !poDiag.startsWith("--") ? poDiag : path.join(".flow-lens", "diag"));
// śledzimy go tylko na życzenie albo bez OTel: inaczej nagranie OTel (np. kopia C#: OTel + metody, która pisze też
// log diagnostyczny do <kopia>/.flow-lens/diag) dostaje drugi komplet przebiegów z logu
const SLEDZ_DIAG = iDiag >= 0 || BEZ_OTEL;
// log bazy: plik albo "docker:<kontener>" (Postgres: logowanie zapytań włączane samo); --hybryda: bez OTel i diag
// składamy przebiegi z samego logu bazy i statycznego szkieletu z CodeGraph (.flow-lens/statyczne.json)
const BAZA_LOG = opcja("--baza-log");
const BAZA_UZYTKOWNIK = opcja("--baza-uzytkownik") || "postgres";
const HYBRYDA = opcje.includes("--hybryda");
// access log serwera HTTP: granice requestów (plik/katalog albo docker:<kontener>) — w hybrydzie wejście po ścieżce
const DOSTEP_LOG = opcja("--dostep-log");
const PLIK_STATYCZNE = path.resolve(path.join(path.dirname(PLIK_MAPY), "statyczne.json"));
const WZORZEC = opcja("--wzorzec") ? new RegExp(opcja("--wzorzec"), "i") : null;
// --szkielet: przebiegi z niepełnych źródeł (log frameworka, log bazy) uzupełniane klasami ze ścieżek statycznych
// (CodeGraph) między krokami widzianymi w runtime; --mozliwe: także gałęzie bez dostępu do danych (przerywane);
// --miedzy: wywołania bez dostępu do danych leżące w kodzie przed potwierdzonym krokiem (potwierdzony: false)
const SZKIELET = opcje.includes("--szkielet");
const MOZLIWE = opcje.includes("--mozliwe");
const MIEDZY = opcje.includes("--miedzy");
// start serwera Payara/GlassFish (asadmin, appserver-cli.jar, glassfish.jar, payara-micro)
const SERWER_Z_OTEL = /(^|[\s/\\])(asadmin|appserver-cli\.jar|glassfish\.jar|payara-micro[\w.-]*\.jar)(\s|$)|[/\\](payara\d*|glassfish\d*)[/\\]/i;

// ---------------------------------------------------------------- konfiguracja (mapa + adnotacje), na gorąco
const czytajJson = plik => { try { return JSON.parse(fs.readFileSync(plik, "utf8")); } catch { return null; } };
let mapa = czytajJson(PLIK_MAPY);
let adnotacje = czytajJson(PLIK_ADNOTACJI);

// do widoku idzie tylko to, co rysowane (nie cała lista pominiętych klas). Przykład ma własną mapę i adnotacje
// obok nagrania (<nazwa>.mapa.json, <nazwa>.adnotacje.json); nagrania z sesji — bieżące z projektu.
function konfig(przyklad = null) {
  let mapa_ = mapa, adnotacje_ = adnotacje;
  if (przyklad) {
    const baza = path.join(PRZYKLADY, path.basename(przyklad).replace(/\.jsonl$/, ""));
    mapa_ = czytajJson(`${baza}.mapa.json`);
    adnotacje_ = czytajJson(`${baza}.adnotacje.json`);
  }
  const klasy = {};
  for (const [fq, k] of Object.entries(mapa_?.klasy || {}))
    if (k.rola !== "pomin") klasy[fq] = { rola: k.rola, poziom: k.poziom, nazwa: k.nazwa, plik: k.plik, powod: k.powod, pewnosc: k.pewnosc };
  return { mapa: mapa_ ? { projekt: mapa_.projekt, plik: przyklad ? null : PLIK_MAPY, technologie: mapa_.technologie, zatwierdzona: mapa_.zatwierdzona, klasy } : null,
           adnotacje: adnotacje_ || null, plikAdnotacji: przyklad ? null : PLIK_ADNOTACJI };
}

function obserwuj(plik, naZmiane) {
  let zegar = null;
  try {
    fs.watch(path.dirname(plik), (_, nazwa) => {
      if (nazwa && nazwa !== path.basename(plik)) return;
      clearTimeout(zegar);
      zegar = setTimeout(naZmiane, 150);
    });
  } catch {}
}

// ---------------------------------------------------------------- zapis i SSE
fs.mkdirSync(KATALOG, { recursive: true });
// nazwa nagrania: czas z ms i pid; plik zakładany wyłącznie (wx) — dwa odbiorniki uruchomione w tej samej chwili
// (równoległe rundy) pisały do jednego pliku i każdy dostawał przebiegi drugiej aplikacji
function zalozNagranie(katalog, teraz = new Date(), pid = process.pid) {
  const baza = `${teraz.toISOString().replace(/[:.]/g, "-").slice(0, 23)}-${pid}`;
  for (let i = 0; ; i++) {
    const stempel = i ? `${baza}-${i}` : baza;
    try { fs.writeFileSync(path.join(katalog, `${stempel}.jsonl`), "", { flag: "wx" }); return stempel; }
    catch (e) { if (e.code !== "EEXIST" || i > 100) throw e; }
  }
}
const stempel = PODKOMENDA ? null : zalozNagranie(KATALOG);
const PLIK = stempel ? path.join(KATALOG, `${stempel}.jsonl`) : null;
const PLIK_SUROWY = stempel ? path.join(KATALOG, `${stempel}.surowe.jsonl`) : null;
const sluchacze = new Set();
const NA_ZYWO = komenda.length > 0;

function rozeslij(rekord) {
  const linia = `data: ${JSON.stringify(rekord)}\n\n`;
  for (const res of sluchacze) res.write(linia);
}
let pamiecSzkieletu = { mtime: 0, st: null };
function szkielet() {                                       // statyczne.json czytany ponownie tylko po zmianie
  let m = 0; try { m = fs.statSync(PLIK_STATYCZNE).mtimeMs; } catch { return null; }
  if (m !== pamiecSzkieletu.mtime) pamiecSzkieletu = { mtime: m, st: czytajJson(PLIK_STATYCZNE) };
  return pamiecSzkieletu.st;
}
function zapisz(przebieg) {
  if (SZKIELET && przebieg.tryb !== "hybryda") {
    const st = szkielet();
    if (st) przebieg = wzbogac(przebieg, st, mapa, { mozliwe: MOZLIWE, miedzy: MIEDZY });
  }
  fs.appendFileSync(PLIK, JSON.stringify(przebieg) + "\n");
  rozeslij(przebieg);
}

const zbieracz = new Zbieracz({ mapa, naPrzebieg: zapisz, bufor: new BuforLogow() });
function przyjmij(rekordy) {
  if (!rekordy.length) return;
  fs.appendFileSync(PLIK_SUROWY, rekordy.map(r => JSON.stringify(r)).join("\n") + "\n");
  zbieracz.dodaj(rekordy);
}

obserwuj(PLIK_MAPY, () => { mapa = czytajJson(PLIK_MAPY); zbieracz.mapa = mapa; rozeslij({ kind: "konfig" }); });
obserwuj(PLIK_ADNOTACJI, () => { adnotacje = czytajJson(PLIK_ADNOTACJI); rozeslij({ kind: "konfig" }); });
// log aplikacji: także linie bez identyfikatora requestu — dopasuje je korelacja (wątek + czas)
if (PLIK_LOGU) sledzPlik(path.resolve(PLIK_LOGU), przyjmij, { wzorzec: WZORZEC, bezId: true });
if (SLEDZ_DIAG) { fs.mkdirSync(KATALOG_DIAG, { recursive: true }); sledzDiag(KATALOG_DIAG, przyjmij); }
else if (!PODKOMENDA && (() => { try { return fs.readdirSync(KATALOG_DIAG).some(f => f.endsWith(".jsonl")); } catch { return false; } })())
  console.log(`log diagnostyczny ${KATALOG_DIAG} pomijam — dołączysz go z --diag`);
if (LOG_APP) sledzLogApp(path.resolve(LOG_APP), przyjmij, { mapa });
if (BAZA_LOG) {
  if (BAZA_LOG.startsWith("docker:"))
    wlaczLogowaniePostgres(BAZA_LOG.slice(7), BAZA_UZYTKOWNIK).then(m => console.log(m), e => console.error(`log bazy: ${e.message.trim()} (włącz ręcznie: log_min_duration_statement=0)`));
  if (HYBRYDA) {
    // tryb hybrydowy: sesje SQL per połączenie → wejście dopasowane po tabelach → szkielet statyczny + SQL
    const statyczne = czytajJson(PLIK_STATYCZNE);
    if (!statyczne) console.error(`hybryda: brak ${PLIK_STATYCZNE} — zbuduj: python3 ${path.join(TU, "mapa", "statyczne.py")} <repo>`);
    let bufor = [], requesty = [];
    sledzLogBazy(BAZA_LOG, z => { fs.appendFileSync(PLIK_SUROWY, z.map(x => JSON.stringify({ typ: "zapytanie-bazy", ...x })).join("\n") + "\n"); bufor.push(...z); });
    if (DOSTEP_LOG) sledzLogDostepu(DOSTEP_LOG, r => { fs.appendFileSync(PLIK_SUROWY, r.map(x => JSON.stringify({ typ: "request-http", ...x })).join("\n") + "\n"); requesty.push(...r); });
    setInterval(() => {
      if (!statyczne) return;
      const granica = Date.now() - 800;
      if (DOSTEP_LOG) {
        // z access logiem: SQL z okna requestu (± 5 ms) → wejście po ścieżce; nakładające się okna = przybliżone
        const gotowe = requesty.filter(r => r.koniec < granica);
        requesty = requesty.filter(r => r.koniec >= granica);
        const { przebiegi, reszta } = hybrydaZRequestow(bufor, gotowe, statyczne, mapa);
        przebiegi.forEach(zapisz);
        bufor = reszta.filter(z => z.ts >= Date.now() - 60000);
        return;
      }
      // tylko log bazy: sesje po połączeniu, wejście zgadywane po tabelach (przybliżone)
      const gotowe = bufor.filter(z => z.ts < granica), reszta = bufor.filter(z => z.ts >= granica);
      if (!gotowe.length) return;
      bufor = reszta;
      for (const s_ of sesje(gotowe)) { const p = zlozHybryde(s_, statyczne, mapa); if (p) zapisz(p); }
    }, 500).unref?.();
  } else sledzLogBazy(BAZA_LOG, z => przyjmij(z.map(naSpan)));
}

// ---------------------------------------------------------------- HTTP
function plikStatyczny(res, plik) {
  if (!fs.existsSync(plik) || fs.statSync(plik).isDirectory()) { res.writeHead(404); return res.end("brak"); }
  res.writeHead(200, { "content-type": TYPY[path.extname(plik)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(plik).pipe(res);
}

function listaNagran() {
  const wpisy = [];
  for (const [zrodlo, kat] of [["przyklad", PRZYKLADY], ["sesja", KATALOG]]) {
    if (!fs.existsSync(kat)) continue;
    for (const f of fs.readdirSync(kat).filter(f => f.endsWith(".jsonl") && !f.endsWith(".surowe.jsonl"))) {
      const st = fs.statSync(path.join(kat, f));
      if (st.size === 0 && path.join(kat, f) !== PLIK) continue;
      const surowe = path.join(kat, f.replace(/\.jsonl$/, ".surowe.jsonl"));
      wpisy.push({ zrodlo, plik: f, rozmiar: st.size, zmiana: st.mtimeMs, biezaca: path.join(kat, f) === PLIK, surowe: fs.existsSync(surowe) });
    }
  }
  // przykłady alfabetycznie, sesje od najnowszej
  return wpisy.sort((a, b) => (a.zrodlo !== b.zrodlo ? (a.zrodlo === "przyklad" ? -1 : 1) : a.zrodlo === "przyklad" ? a.plik.localeCompare(b.plik) : b.zmiana - a.zmiana));
}

function json(res, o) { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(o)); }

function widok(req, res, url) {
  const p = url.pathname.slice("/_flow".length) || "/";
  if (p === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": ok\n\n");
    sluchacze.add(res);
    req.on("close", () => sluchacze.delete(res));
    return;
  }
  if (p === "/api/nagrania") return json(res, { biezaca: path.basename(PLIK), nagrania: listaNagran(), naZywo: NA_ZYWO, otlp: PORT_OTLP });
  if (p === "/api/konfig") return json(res, konfig(url.searchParams.get("zrodlo") === "przyklad" ? url.searchParams.get("plik") : null));
  if (p === "/api/nagranie") {
    const kat = url.searchParams.get("zrodlo") === "przyklad" ? PRZYKLADY : KATALOG;
    const plik = path.join(kat, path.basename(url.searchParams.get("plik") || ""));
    // przelicz=1: przebiegi od nowa z rekordów surowych i bieżącej mapy (np. po zmianie mapy)
    const surowy = plik.replace(/\.jsonl$/, ".surowe.jsonl");
    // nagranie zapisane starszą wersją (np. bez transakcji) przeliczamy z rekordów surowych, gdy są
    // — tylko nagranie tego samego projektu co bieżąca mapa (inaczej mapa nie pasuje i przebiegi by zniknęły)
    let pierwsza = "";
    try { pierwsza = fs.readFileSync(plik, "utf8").split("\n").find(Boolean) || ""; } catch {}
    const projektNagrania = /"projekt":"([^"]*)"/.exec(pierwsza)?.[1];
    const tenProjekt = !!projektNagrania && projektNagrania === mapa?.projekt;
    const stare = !!pierwsza && !pierwsza.includes('"transakcje"');
    if (tenProjekt && (url.searchParams.get("przelicz") === "1" || stare) && fs.existsSync(surowy)) {
      const rekordy = fs.readFileSync(surowy, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      res.writeHead(200, { "content-type": TYPY[".jsonl"], "cache-control": "no-store" });
      return res.end(przebiegiZRekordow(rekordy, mapa).map(p => JSON.stringify(p)).join("\n") + "\n");
    }
    return plikStatyczny(res, plik);
  }
  const wzgl = path.normalize(p === "/" ? "index.html" : p.slice(1));
  if (wzgl.startsWith("..")) { res.writeHead(403); return res.end(); }
  return plikStatyczny(res, path.join(WIDOK, wzgl));
}

// OTLP/HTTP: /v1/traces i /v1/logs (protobuf albo JSON, opcjonalnie gzip)
function otlp(req, res, url) {
  const k = [];
  req.on("data", c => k.push(c));
  req.on("end", () => {
    const jsonowy = String(req.headers["content-type"] || "").includes("json");
    try {
      przyjmij(czytajOtlp(url.pathname, req.headers, Buffer.concat(k)));
    } catch (e) {
      console.error(`OTLP: nie umiem odczytać ${url.pathname}: ${e.message}`);
    }
    const o = odpowiedz(jsonowy);
    res.writeHead(200, { "content-type": o.typ });
    res.end(o.cialo);
  });
}

function obsluga(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && /\/v1\/(traces|logs)$/.test(url.pathname)) return otlp(req, res, url);
  if (req.method === "POST" && /\/v1\/metrics$/.test(url.pathname)) { req.resume(); res.writeHead(200); return res.end(); }
  if (url.pathname === "/_flow" || url.pathname.startsWith("/_flow/")) return widok(req, res, url);
  if (req.method === "GET" && url.pathname === "/") { res.writeHead(302, { location: "/_flow/" }); return res.end(); }
  res.writeHead(404); res.end("flow-lens: nieznana ścieżka");
}

function otworzPrzegladarke(u) {
  if (process.env.FLOW_NO_BROWSER) return;
  const [cmd, args] = process.platform === "darwin" ? ["open", [u]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", u]] : ["xdg-open", [u]];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch {}
}

function pobierz(url, cel) {
  return new Promise((ok, zle) => {
    https.get(url, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return pobierz(r.headers.location, cel).then(ok, zle);
      if (r.statusCode !== 200) return zle(new Error(`HTTP ${r.statusCode}`));
      fs.mkdirSync(path.dirname(cel), { recursive: true });
      const tmp = cel + ".pobieranie", f = fs.createWriteStream(tmp);
      r.pipe(f);
      f.on("finish", () => { f.close(); fs.renameSync(tmp, cel); ok(cel); });
    }).on("error", zle);
  });
}
async function agentJavy() {
  if (fs.existsSync(AGENT_JAR)) return AGENT_JAR;
  console.log(`Pobieram agenta OpenTelemetry dla Javy → ${AGENT_JAR}`);
  return pobierz(URL_AGENTA, AGENT_JAR);
}

// ---------------------------------------------------------------- podkomendy bez serwera
if (PODKOMENDA === "agent") {
  agentJavy().then(p => { console.log(p); process.exit(0); }, e => { console.error(e.message); process.exit(1); });
} else if (PODKOMENDA === "otel") {
  if (!mapa) { console.error(`Brak mapy ${PLIK_MAPY}. Zbuduj ją: python3 ${path.join(TU, "mapa", "zbuduj_mape.py")} <repo>`); process.exit(1); }
  const plik = zapiszWlasciwosci(mapa, path.join(path.dirname(PLIK_MAPY), "otel.properties"), { port: PORT_OTLP });
  console.log(plik);
  console.log(`java -javaagent:${AGENT_JAR} -Dotel.javaagent.configuration-file=${plik} -jar <aplikacja>.jar`);
  process.exit(0);
} else if (PODKOMENDA === "wstrzyknij") {
  if (!mapa) { console.error(`Brak mapy ${PLIK_MAPY}. Zbuduj ją: python3 ${path.join(TU, "mapa", "zbuduj_mape.py")} <repo>`); process.exit(1); }
  try { wstrzyknij(process.cwd(), mapa, { katalogDiag: KATALOG_DIAG }); process.exit(0); } catch (e) { console.error(e.message); process.exit(1); }
} else if (PODKOMENDA === "usun-wstrzykniecie") {
  try { usunWstrzykniecie(process.cwd()); process.exit(0); } catch (e) { console.error(e.message); process.exit(1); }
} else start();

// ---------------------------------------------------------------- serwer
function start() {
  const adres = `http://localhost:${PORT}`;
  const serwery = [http.createServer(obsluga)];
  if (PORT_OTLP !== PORT) serwery.push(http.createServer(obsluga));
  let gotowe = 0;
  for (const [i, s] of serwery.entries()) {
    const port = i === 0 ? PORT : PORT_OTLP;
    s.on("error", err => {
      if (err.code === "EADDRINUSE") console.error(`Port ${port} zajęty — flow-lens już działa albo inny odbiornik OTel (kolektor, Jaeger)? ` +
        `Ustaw inny: ${i === 0 ? "FLOW_PORT" : "FLOW_OTLP_PORT"}=…`);
      else console.error(err);
      process.exit(1);
    });
    s.listen(port, "127.0.0.1", () => { if (++gotowe === serwery.length) poStarcie(adres); });
  }
  const koniec = () => { zbieracz.oproznij(); process.exit(0); };
  process.on("SIGINT", koniec);
  process.on("SIGTERM", koniec);
}

async function poStarcie(adres) {
  console.log(`flow-lens  ${adres}/_flow/   OTLP: http://localhost:${PORT_OTLP}   (nagranie: ${PLIK})`);
  console.log(mapa ? `mapa: ${PLIK_MAPY} (${Object.values(mapa.klasy || {}).filter(k => k.rola !== "pomin").length} klas rysowanych)`
    : `mapa: brak (${PLIK_MAPY}) — widać tylko wejścia, repozytoria, SQL i wywołania zewnętrzne`);
  if (!komenda.length) {
    console.log(`Podepnij aplikację: OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:${PORT_OTLP} (+ agent/SDK OpenTelemetry swojej technologii).\n` +
      `Java w jednym kroku: node ${path.join(TU, "flow.mjs")} -- java -jar aplikacja.jar`);
    return;
  }
  const [polecenie, ...argumenty] = komenda;
  const env = { ...process.env, ...srodowisko({ port: PORT_OTLP, nazwa: mapa?.projekt }) };
  if (toJava(polecenie, argumenty)) {
    try { await agentJavy(); } catch (e) { console.error(`Nie udało się pobrać agenta: ${e.message}`); process.exit(1); }
    const props = zapiszWlasciwosci(mapa, path.join(path.dirname(PLIK_MAPY), "otel.properties"), { port: PORT_OTLP });
    const { odrzucone } = include(mapa);
    if (odrzucone.length) console.log(`pomijam ${odrzucone.length} wpisów mapy, których agent nie przyjmie (np. ${odrzucone[0].slice(0, 80)})`);
    env.JAVA_TOOL_OPTIONS = [process.env.JAVA_TOOL_OPTIONS, `-javaagent:${AGENT_JAR}`, `-Dotel.javaagent.configuration-file=${props}`].filter(Boolean).join(" ");
    // serwer aplikacyjny z własnym OpenTelemetry (Payara/GlassFish: MicroProfile Telemetry, niecieniowane
    // io.opentelemetry): most opentelemetry-api agenta podpina jego kontekst i spany metod EJB stają się korzeniami
    // nowych śladów, a span HTTP zostaje pusty. Bez mostu — chyba że ustawione jawnie
    if (SERWER_Z_OTEL.test([polecenie, ...argumenty].join(" ")) && process.env.OTEL_INSTRUMENTATION_OPENTELEMETRY_API_ENABLED == null) {
      env.OTEL_INSTRUMENTATION_OPENTELEMETRY_API_ENABLED = "false";
      console.log("Java: serwer z własnym OpenTelemetry (Payara/GlassFish) — most opentelemetry-api agenta wyłączony");
    }
    console.log(`Java: agent OTel + ${props}`);
  } else if (toPython(polecenie, argumenty)) {
    // jawnie ustawione w środowisku (np. runda.json logi.env: OTEL_PYTHON_LOG_CORRELATION=false — log w formacie
    // aplikacji, bez trace_id OTel, który zawyżał tryby bez OTel) wygrywa z domyślnym
    const py = srodowiskoPythona(path.join(TU, "zrodla"), PLIK_MAPY, process.env);
    for (const k of ["OTEL_PYTHON_LOG_CORRELATION", "OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED"]) if (process.env[k] != null) delete py[k];
    Object.assign(env, py);
    if (BEZ_OTEL) {                                    // log diagnostyczny zamiast OTel (bez pakietów OTel w aplikacji)
      env.FLOWLENS_DIAG = KATALOG_DIAG;
      console.log(`Python bez OTel: log diagnostyczny → ${KATALOG_DIAG} (metody z mapy, HTTP, SQL, transakcje, inne systemy)`);
    } else console.log(`Python: auto-instrumentacja OTel + spany metod klas z mapy (${path.join(TU, "zrodla", "python")})`);
  } else if (toNode(polecenie, argumenty)) {
    Object.assign(env, srodowiskoNode(path.join(TU, "zrodla"), PLIK_MAPY, process.env, { bezOtel: BEZ_OTEL ? KATALOG_DIAG : null }));
    console.log(BEZ_OTEL ? `Node bez OTel: log diagnostyczny → ${KATALOG_DIAG} (metody z mapy, HTTP, SQL, inne systemy)`
      : `Node: auto-instrumentacja OTel + spany metod klas z mapy (${path.join(TU, "zrodla", "node")})`);
  }
  otworzPrzegladarke(`${adres}/_flow/`);
  const uruchom = przezPowloke => {
    const args = przezPowloke ? argumenty.map(a => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : argumenty;
    const d = spawn(polecenie, args, { stdio: "inherit", shell: przezPowloke, env });
    d.on("error", err => {
      if (!przezPowloke && process.platform === "win32" && err.code === "ENOENT") return uruchom(true);
      console.error(`Nie mogę uruchomić „${polecenie}”: ${err.message}`);
      process.exit(127);
    });
    d.on("exit", kod => { zbieracz.oproznij(); console.log(`\nNagranie: ${PLIK}\nOdtworzysz je: node ${path.join(TU, "flow.mjs")}`); process.exit(kod ?? 0); });
  };
  uruchom(false);
}

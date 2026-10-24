#!/usr/bin/env node
// harness-lens: lokalny proxy + widok pokazujący, co harness agenta wysyła do modelu.
//
//   node lens.mjs                 serwer na 127.0.0.1:7777 (proxy + widok)
//   node lens.mjs claude [arg…]   to samo i od razu uruchamia `claude` przez proxy
//
// Proxy jest przezroczysty: nagłówki (w tym logowanie) idą dalej bez zmian, do pliku trafiają
// zredagowane. Nagrania: ~/.harness-lens/sesje/*.jsonl. Bez zależności, Node 18+.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LENS_PORT || 7777);
// Firmowa bramka (ANTHROPIC_BASE_URL w środowisku albo w ~/.claude/settings.json) staje się celem proxy,
// więc z bramką działa ta sama komenda. LENS_UPSTREAM wygrywa ze wszystkim.
const bramkaZUstawien = () => {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")).env?.ANTHROPIC_BASE_URL; }
  catch { return undefined; }
};
const toLens = u => new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${PORT}/?$`).test(u);
const BRAMKA = [process.env.ANTHROPIC_BASE_URL, bramkaZUstawien()].find(u => u && !toLens(u));
const UPSTREAM = new URL(process.env.LENS_UPSTREAM || BRAMKA || "https://api.anthropic.com");
const KATALOG = path.join(os.homedir(), ".harness-lens", "sesje");
const WIDOK = path.join(TU, "widok");
const PRZYKLADY = path.join(TU, "przyklady");
// nagranie pokazywane bez ruchu: pytanie z zadania szkolenia na campsite-power (przyklady/nagraj-campsite.sh)
const PRZYKLAD_DOMYSLNY = process.env.LENS_PRZYKLAD || "campsite.jsonl";
const TAJNE = /^(authorization|x-api-key|cookie|set-cookie|proxy-authorization)$|token|secret/i;
const TYPY = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
  ".jsonl": "application/x-ndjson", ".woff2": "font/woff2" };

fs.mkdirSync(KATALOG, { recursive: true });
const stempel = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const PLIK = path.join(KATALOG, `${stempel}.jsonl`);
const sluchacze = new Set();
// `--metafory` (albo LENS_METAFORY=1): w widoku pojawia się przełącznik metafor dla nietechnicznych; domyślnie go nie ma
const METAFORY = process.argv.includes("--metafory") || process.env.LENS_METAFORY === "1";
const ARGUMENTY = process.argv.slice(2).filter(a => a !== "--metafory");
// tryb z komendą (`node lens.mjs claude`): widok startuje od razu „na żywo” i otwiera się sam
const Z_KOMENDA = ARGUMENTY.length > 0;
let licznik = 0;

function zapisz(rekord) {
  fs.appendFileSync(PLIK, JSON.stringify(rekord) + "\n");
  const linia = `data: ${JSON.stringify(rekord)}\n\n`;
  for (const res of sluchacze) res.write(linia);
}

function zredaguj(naglowki) {
  const wynik = {};
  for (const [k, v] of Object.entries(naglowki)) wynik[k] = TAJNE.test(k) ? "[ukryte]" : v;
  return wynik;
}

// Strumień SSE z /v1/messages składamy w jedną gotową wiadomość (jak zwraca API bez stream).
function zlozStrumien(tekst) {
  let wiad = null;
  const json = {};
  for (const blok of tekst.split(/\n\n/)) {
    const dane = blok.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
    if (!dane) continue;
    let e;
    try { e = JSON.parse(dane); } catch { continue; }
    if (e.type === "message_start") wiad = { ...e.message, content: [] };
    else if (!wiad) continue;
    else if (e.type === "content_block_start") { wiad.content[e.index] = { ...e.content_block }; json[e.index] = ""; }
    else if (e.type === "content_block_delta") {
      const b = wiad.content[e.index], d = e.delta;
      if (d.type === "text_delta") b.text = (b.text || "") + d.text;
      else if (d.type === "thinking_delta") b.thinking = (b.thinking || "") + d.thinking;
      else if (d.type === "input_json_delta") json[e.index] += d.partial_json;
      else if (d.type === "signature_delta") b.signature = "[podpis]";
    } else if (e.type === "content_block_stop") {
      const b = wiad.content[e.index];
      if (b && json[e.index]) { try { b.input = JSON.parse(json[e.index]); } catch { b.input = json[e.index]; } }
    } else if (e.type === "message_delta") {
      Object.assign(wiad, e.delta);
      wiad.usage = { ...wiad.usage, ...e.usage };
    } else if (e.type === "error") wiad.error = e.error;
  }
  return wiad;
}

function proxy(req, res) {
  const kawalki = [];
  req.on("data", c => kawalki.push(c));
  req.on("end", () => {
    const body = Buffer.concat(kawalki);
    const id = ++licznik;
    const start = Date.now();
    const sledzony = req.method === "POST" && /\/v1\/messages/.test(req.url);
    if (sledzony) {
      let tresc = null;
      try { tresc = JSON.parse(body.toString("utf8")); } catch {}
      zapisz({ kind: "request", id, ts: start, method: req.method, url: req.url,
               headers: zredaguj(req.headers), body: tresc });
    }
    const naglowki = { ...req.headers, host: UPSTREAM.host, "accept-encoding": "identity" };
    delete naglowki.connection;
    naglowki["content-length"] = body.length;
    const klient = (UPSTREAM.protocol === "http:" ? http : https).request({
      hostname: UPSTREAM.hostname, port: UPSTREAM.port || undefined,
      path: UPSTREAM.pathname.replace(/\/$/, "") + req.url, method: req.method, headers: naglowki,
    }, up => {
      res.writeHead(up.statusCode, up.headers);
      const odp = [];
      up.on("data", c => { res.write(c); if (sledzony) odp.push(c); });
      up.on("end", () => {
        res.end();
        if (!sledzony) return;
        const tekst = Buffer.concat(odp).toString("utf8");
        const sse = String(up.headers["content-type"] || "").includes("event-stream");
        let wiad = null;
        try { wiad = sse ? zlozStrumien(tekst) : JSON.parse(tekst); } catch { wiad = { surowe: tekst.slice(0, 4000) }; }
        zapisz({ kind: "response", id, ts: Date.now(), ms: Date.now() - start, status: up.statusCode,
                 stream: sse, body: wiad });
      });
    });
    klient.on("error", err => {
      if (sledzony) zapisz({ kind: "response", id, ts: Date.now(), status: 502, body: { error: String(err) } });
      if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "lens_proxy", message: String(err) } }));
    });
    klient.end(body);
  });
}

// Zapis rozmowy Claude Code (JSONL): wpisy user/assistant poza podagentami; jedna odpowiedź modelu bywa rozbita
// na kilka wpisów (po jednym na blok), więc łączymy je po id wiadomości. Najwyżej 400 ostatnich wiadomości.
function wczytajRozmowe(plik) {
  let linie;
  try { linie = fs.readFileSync(plik, "utf8").split("\n"); } catch { return []; }
  const wynik = [];
  for (const l of linie) {
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    if (!["user", "assistant"].includes(o.type) || o.isSidechain || !o.message?.role) continue;
    const tresc = typeof o.message.content === "string" ? [{ type: "text", text: o.message.content }] : o.message.content || [];
    const ost = wynik[wynik.length - 1];
    if (o.type === "assistant" && ost?.role === "assistant" && o.message.id && ost.id === o.message.id) ost.content.push(...tresc);
    else wynik.push({ role: o.message.role, id: o.message.id, content: [...tresc] });
  }
  return wynik.slice(-400).map(({ role, content }) => ({ role, content }));
}

function plikStatyczny(res, plik) {
  if (!fs.existsSync(plik) || fs.statSync(plik).isDirectory()) { res.writeHead(404); return res.end("brak"); }
  res.writeHead(200, { "content-type": TYPY[path.extname(plik)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(plik).pipe(res);
}

function listaNagran() {
  const wpisy = [];
  for (const [zrodlo, kat] of [["przyklad", PRZYKLADY], ["sesja", KATALOG]]) {
    if (!fs.existsSync(kat)) continue;
    for (const f of fs.readdirSync(kat).filter(f => f.endsWith(".jsonl"))) {
      const st = fs.statSync(path.join(kat, f));
      if (st.size === 0) continue;
      wpisy.push({ zrodlo, plik: f, rozmiar: st.size, zmiana: st.mtimeMs, biezaca: path.join(kat, f) === PLIK });
    }
  }
  // domyślny przykład pierwszy (kolejność plików po git clone jest przypadkowa); potem najnowsze
  const pierwszy = w => (w.zrodlo === "przyklad" && w.plik === PRZYKLAD_DOMYSLNY ? 0 : 1);
  return wpisy.sort((a, b) => pierwszy(a) - pierwszy(b)
    || (a.zrodlo === b.zrodlo ? b.zmiana - a.zmiana : a.zrodlo === "przyklad" ? -1 : 1));
}

function lens(req, res, url) {
  const p = url.pathname.slice("/_lens".length) || "/";
  if (p === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
    res.write(": ok\n\n");
    sluchacze.add(res);
    req.on("close", () => sluchacze.delete(res));
    return;
  }
  if (p === "/hook" && req.method === "POST") {
    const k = [];
    req.on("data", c => k.push(c));
    req.on("end", () => {
      let dane = null;
      try { dane = JSON.parse(Buffer.concat(k).toString("utf8")); } catch {}
      if (dane) zapisz({ kind: "hook", ts: Date.now(), event: dane.hook_event_name, body: dane });
      // wznowiona sesja: harness wczytał zapisaną rozmowę z dysku — pokazujemy ją, zanim pójdzie pierwszy request
      if (dane?.hook_event_name === "SessionStart" && dane.source === "resume" && dane.transcript_path) {
        const messages = wczytajRozmowe(dane.transcript_path);
        if (messages.length) zapisz({ kind: "wczytana-historia", ts: Date.now(), plik: dane.transcript_path, messages });
      }
      res.end("ok");
    });
    return;
  }
  if (p === "/api/nagrania") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ biezaca: path.basename(PLIK), nagrania: listaNagran(), naZywo: Z_KOMENDA, metafory: METAFORY }));
  }
  if (p === "/api/nagranie") {
    const zrodlo = url.searchParams.get("zrodlo") === "przyklad" ? PRZYKLADY : KATALOG;
    return plikStatyczny(res, path.join(zrodlo, path.basename(url.searchParams.get("plik") || "")));
  }
  const wzgl = path.normalize(p === "/" ? "index.html" : p.slice(1));
  if (wzgl.startsWith("..")) { res.writeHead(403); return res.end(); }
  return plikStatyczny(res, path.join(WIDOK, wzgl));
}

const serwer = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/_lens" || url.pathname.startsWith("/_lens/")) return lens(req, res, url);
  if (req.method === "GET" && url.pathname === "/" && /text\/html/.test(req.headers.accept || "")) {
    res.writeHead(302, { location: "/_lens/" });
    return res.end();
  }
  return proxy(req, res);
});

const adres = `http://localhost:${PORT}`;

// Tryb z komendą: agent `claude` dostaje hooki lensa domyślnie (osobne źródło ustawień, nie zastępuje własnych).
// Plik ustawień powstaje przy każdym starcie z pełnymi ścieżkami (działa też na Windows). Wyłączenie: LENS_BEZ_HOOKOW=1.
const ZDARZENIA_HOOKOW = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Notification",
  "Stop", "SubagentStop", "PreCompact", "SessionEnd"];
const Z_NARZEDZIEM = new Set(["PreToolUse", "PermissionRequest", "PostToolUse"]);
function zHookami(polecenie, argumenty) {
  const toClaude = /^claude(\.exe|\.cmd)?$/i.test(path.basename(polecenie)) || process.env.LENS_WSTRZYKNIJ_HOOKI === "1";
  if (!toClaude || process.env.LENS_BEZ_HOOKOW === "1") return argumenty;
  if (argumenty.includes("--settings")) {
    console.log(`Masz własne --settings, więc nie dokładam hooków lensa. Dopisz je do swoich ustawień z: ${path.join(TU, "hooks.json")}`);
    return argumenty;
  }
  const cmd = `"${process.execPath}" "${path.join(TU, "hook.mjs")}"`;
  const hooks = Object.fromEntries(ZDARZENIA_HOOKOW.map(e => [e, [{ ...(Z_NARZEDZIEM.has(e) ? { matcher: "*" } : {}), hooks: [{ type: "command", command: cmd }] }]]));
  const plik = path.join(os.homedir(), ".harness-lens", "hooks-lensa.json");
  // env w --settings ma pierwszeństwo przed ~/.claude/settings.json, więc ruch idzie przez lens także przy firmowej bramce
  fs.writeFileSync(plik, JSON.stringify({ hooks, env: { ANTHROPIC_BASE_URL: adres } }, null, 2));
  console.log(`hooki lensa: włączone (${plik}); wyłączysz je przez LENS_BEZ_HOOKOW=1`);
  return [...argumenty, "--settings", plik];
}

function otworzPrzegladarke(u) {
  if (process.env.LENS_NO_BROWSER) return;
  const [cmd, args] = process.platform === "darwin" ? ["open", [u]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", u]] : ["xdg-open", [u]];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref(); } catch {}
}
serwer.on("error", err => {
  if (err.code === "EADDRINUSE") console.error(`Port ${PORT} zajęty — lens już działa? Ustaw inny: LENS_PORT=7778`);
  else console.error(err);
  process.exit(1);
});
serwer.listen(PORT, "127.0.0.1", () => {
  const [polecenie, ...argumenty] = ARGUMENTY;
  console.log(`harness-lens  ${adres}/_lens/   (nagranie: ${PLIK})`);
  if (UPSTREAM.href !== "https://api.anthropic.com/") console.log(`cel proxy: ${UPSTREAM.href}`);
  if (!polecenie) {
    console.log(`W drugim terminalu uruchom agenta przez proxy:\n` +
      `  mac / Linux / Git Bash:  ENABLE_TOOL_SEARCH=true ANTHROPIC_BASE_URL=${adres} claude\n` +
      `  PowerShell:              $env:ENABLE_TOOL_SEARCH="true"; $env:ANTHROPIC_BASE_URL="${adres}"; claude`);
    return;
  }
  otworzPrzegladarke(`${adres}/_lens/`);
  const argumentyAgenta = zHookami(polecenie, argumenty);
  // Najpierw bez powłoki (claude.exe, ścieżki ze spacjami); na Windows przez powłokę tylko dla skryptów .cmd (claude z npm).
  // Przez proxy Claude Code sam wyłącza tool search; włączamy go, żeby było widać narzędzia „tylko z nazwy”.
  const env = { ENABLE_TOOL_SEARCH: "true", ...process.env, ANTHROPIC_BASE_URL: adres };
  const uruchom = przezPowloke => {
    // przez powłokę argumenty idą jednym napisem: ścieżki ze spacjami trzeba ująć w cudzysłów
    const args = przezPowloke ? argumentyAgenta.map(a => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : argumentyAgenta;
    const d = spawn(polecenie, args, { stdio: "inherit", shell: przezPowloke, env });
    d.on("error", err => {
      if (!przezPowloke && process.platform === "win32" && err.code === "ENOENT") return uruchom(true);
      console.error(`Nie mogę uruchomić „${polecenie}”: ${err.message}`);
      process.exit(127);
    });
    d.on("exit", kod => { console.log(`\nNagranie: ${PLIK}\nOdtworzysz je: node ${path.join(TU, "lens.mjs")}`); process.exit(kod ?? 0); });
  };
  uruchom(false);
});

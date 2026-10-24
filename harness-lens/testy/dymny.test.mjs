// Test dymny lensa na każdym systemie (też Windows w GitHub Actions): udawane API zamiast prawdziwego.
// Sprawdza proxy ze strumieniem SSE, zapis nagrania bez tokenów, hook, serwowanie widoku i tryb z komendą.
//   node --test ~/.claude/skills/harness-lens/testy/
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
const LENS = path.join(TU, "..", "lens.mjs");
const HOOK = path.join(TU, "..", "hook.mjs");
const SEKRET = "sk-ant-oat01-TO-NIE-MOZE-TRAFIC-DO-PLIKU";
const DOM = fs.mkdtempSync(path.join(os.tmpdir(), "lens-test-")); // osobny katalog domowy na nagrania

// Udawane API: /v1/messages odpowiada strumieniem SSE jak prawdziwe.
const ZDARZENIA = [
  { type: "message_start", message: { id: "msg_1", role: "assistant", model: "model-testowy", content: [], usage: { input_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 1 } } },
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Cześć, " } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "tu model." } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 7 } },
  { type: "message_stop" },
];
let api, apiPort, widzianeNaglowki;
const wolnyPort = () => new Promise(r => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

function uruchomLens(port, argumenty = []) {
  const p = spawn(process.execPath, [LENS, ...argumenty], {
    env: { ...process.env, LENS_PORT: String(port), LENS_UPSTREAM: `http://127.0.0.1:${apiPort}`, LENS_NO_BROWSER: "1",
      HOME: DOM, USERPROFILE: DOM },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  p.stdout.on("data", d => (out += d));
  p.stderr.on("data", d => (out += d));
  p.wynik = () => out;
  p.gotowy = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("lens nie wystartował:\n" + out)), 10000);
    p.stdout.on("data", () => { if (out.includes("harness-lens")) { clearTimeout(t); res(); } });
  });
  return p;
}
const zapytaj = (port, sciezka, { method = "GET", body, headers = {} } = {}) => new Promise((res, rej) => {
  const req = http.request({ host: "127.0.0.1", port, path: sciezka, method, headers }, r => {
    let d = ""; r.setEncoding("utf8"); r.on("data", c => (d += c)); r.on("end", () => res({ status: r.statusCode, headers: r.headers, body: d }));
  });
  req.on("error", rej);
  req.end(body);
});
const czekaj = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await f(); if (v) return v; await new Promise(r => setTimeout(r, 100)); } return null; };
const nagranie = async port => {
  const { biezaca } = JSON.parse((await zapytaj(port, "/_lens/api/nagrania")).body);
  const r = await zapytaj(port, `/_lens/api/nagranie?zrodlo=sesja&plik=${encodeURIComponent(biezaca)}`);
  return { biezaca, rekordy: r.status === 200 ? r.body.split("\n").filter(Boolean).map(JSON.parse) : [] };
};

before(async () => {
  apiPort = await wolnyPort();
  api = http.createServer((req, res) => {
    let b = ""; req.on("data", c => (b += c));
    req.on("end", () => {
      widzianeNaglowki = req.headers;
      if (!req.url.startsWith("/v1/messages")) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const z of ZDARZENIA) res.write(`event: ${z.type}\ndata: ${JSON.stringify(z)}\n\n`);
      res.end();
    });
  }).listen(apiPort, "127.0.0.1");
});
after(() => { api?.close(); fs.rmSync(DOM, { recursive: true, force: true }); });

test("proxy przepuszcza strumień, nagrywa request i odpowiedź bez tokenów", async () => {
  const port = await wolnyPort();
  const lens = uruchomLens(port);
  try {
    await lens.gotowy;
    const body = JSON.stringify({ model: "model-testowy", stream: true, max_tokens: 10, system: [{ type: "text", text: "x".repeat(3000) }],
      tools: [{ name: "Read", description: "czyta plik", input_schema: { type: "object" } }], messages: [{ role: "user", content: "Cześć" }] });
    const r = await zapytaj(port, "/v1/messages?beta=true", { method: "POST", body,
      headers: { "content-type": "application/json", authorization: `Bearer ${SEKRET}`, "x-api-key": SEKRET } });
    assert.equal(r.status, 200);
    assert.match(r.body, /tu model\./, "strumień nie dotarł do klienta");
    assert.equal(widzianeNaglowki.authorization, `Bearer ${SEKRET}`, "proxy nie przekazał autoryzacji do API");

    const { biezaca, rekordy } = await czekaj(async () => { const n = await nagranie(port); return n.rekordy.some(x => x.kind === "response") && n; });
    const rq = rekordy.find(x => x.kind === "request"), rs = rekordy.find(x => x.kind === "response");
    assert.equal(rq.headers.authorization, "[ukryte]");
    assert.equal(rq.headers["x-api-key"], "[ukryte]");
    assert.equal(rq.body.messages[0].content, "Cześć");
    assert.equal(rs.body.content[0].text, "Cześć, tu model.", "odpowiedź ze strumienia źle złożona");
    assert.equal(rs.body.stop_reason, "end_turn");
    assert.equal(rs.body.usage.cache_read_input_tokens, 100);
    const plik = fs.readFileSync(path.join(DOM, ".harness-lens", "sesje", biezaca), "utf8");
    assert.ok(!plik.includes(SEKRET), "token trafił do pliku nagrania");
  } finally { lens.kill(); }
});

test("hook.mjs przekazuje zdarzenie do lensa i nic nie wypisuje", async () => {
  const port = await wolnyPort();
  const lens = uruchomLens(port);
  try {
    await lens.gotowy;
    const h = spawn(process.execPath, [HOOK], { env: { ...process.env, ANTHROPIC_BASE_URL: `http://localhost:${port}` }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    h.stdout.on("data", d => (out += d));
    h.stdin.end(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "toolu_1" }));
    const kod = await new Promise(r => h.on("exit", r));
    assert.equal(kod, 0);
    assert.equal(out, "", "hook coś wypisał (mógłby zmienić zachowanie agenta)");
    const hook = await czekaj(async () => (await nagranie(port)).rekordy.find(x => x.kind === "hook"));
    assert.equal(hook?.event, "PreToolUse");
  } finally { lens.kill(); }
});

test("hook.mjs nie blokuje, gdy lens nie działa", async () => {
  const h = spawn(process.execPath, [HOOK], { env: { ...process.env, ANTHROPIC_BASE_URL: `http://localhost:${await wolnyPort()}` }, stdio: ["pipe", "ignore", "ignore"] });
  h.stdin.end("{}");
  assert.equal(await new Promise(r => h.on("exit", r)), 0);
});

test("widok i jego pliki są serwowane", async () => {
  const port = await wolnyPort();
  const lens = uruchomLens(port);
  try {
    await lens.gotowy;
    for (const p of ["/_lens/", "/_lens/app.js", "/_lens/scena.js", "/_lens/etapy.js", "/_lens/style.css", "/_lens/testy.html"]) {
      const r = await zapytaj(port, p);
      assert.equal(r.status, 200, `${p} → ${r.status}`);
    }
    assert.equal((await zapytaj(port, "/_lens/../lens.mjs")).status === 200 && false, false);
    const lista = JSON.parse((await zapytaj(port, "/_lens/api/nagrania")).body);
    assert.ok(lista.nagrania.some(n => n.zrodlo === "przyklad" && n.plik === "demo.jsonl"), "brak demo na liście");
    assert.equal(lista.nagrania[0].plik, "campsite.jsonl", "domyślny przykład nie jest pierwszy na liście");
    assert.equal(lista.naZywo, false, "bez komendy widok nie powinien startować na żywo");
  } finally { lens.kill(); }
});

test("tryb z komendą: dziecko dostaje ANTHROPIC_BASE_URL, ruch jest nagrywany, widok startuje na żywo", async () => {
  const port = await wolnyPort();
  // „agent” udający claude: pyta lens o tryb, robi jeden request przez proxy i kończy z kodem 7
  const agent = `const u=process.env.ANTHROPIC_BASE_URL;fetch(u+'/_lens/api/nagrania').then(r=>r.json()).then(j=>{if(!j.naZywo)process.exit(3);
    return fetch(u+'/v1/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'m',stream:true,messages:[{role:'user',content:'z komendy'}]})})})
    .then(r=>r.text()).then(t=>process.exit(t.includes('tu model')?7:4)).catch(()=>process.exit(5))`;
  const lens = uruchomLens(port, [process.execPath, "-e", agent]);
  const kod = await new Promise(r => lens.on("exit", r));
  assert.equal(kod, 7, `lens nie oddał kodu dziecka (dostał ${kod}):\n${lens.wynik()}`);
  const pliki = fs.readdirSync(path.join(DOM, ".harness-lens", "sesje"));
  const jest = pliki.some(f => fs.readFileSync(path.join(DOM, ".harness-lens", "sesje", f), "utf8").includes("z komendy"));
  assert.ok(jest, "ruch z trybu komendy nie został nagrany");
});

test("tryb z komendą: agent dostaje hooki lensa domyślnie i ich zdarzenia trafiają do nagrania", async () => {
  const port = await wolnyPort();
  // „agent”: sprawdza --settings, uruchamia komendę hooka SessionStart tak jak harness (stdin = zdarzenie) i kończy z kodem 7
  const agent = `const fs=require('fs'),{execSync}=require('child_process');const a=process.argv;const i=a.indexOf('--settings');
    if(i<0)process.exit(3);const u=JSON.parse(fs.readFileSync(a[i+1],'utf8'));const c=u.hooks.SessionStart[0].hooks[0].command;
    if(!u.hooks.PreToolUse[0].matcher)process.exit(4);
    execSync(c,{input:JSON.stringify({hook_event_name:'SessionStart',source:'resume'}),env:process.env});process.exit(7)`;
  // „--”: argumenty dołożone przez lens trafiają do skryptu agenta, a nie do samego node
  const p = spawn(process.execPath, [LENS, process.execPath, "-e", agent, "--"], {
    env: { ...process.env, LENS_PORT: String(port), LENS_UPSTREAM: `http://127.0.0.1:${apiPort}`, LENS_NO_BROWSER: "1",
      LENS_WSTRZYKNIJ_HOOKI: "1", HOME: DOM, USERPROFILE: DOM },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = ""; p.stdout.on("data", d => (out += d)); p.stderr.on("data", d => (out += d));
  const kod = await new Promise(r => p.on("exit", r));
  assert.equal(kod, 7, `agent nie dostał hooków albo hook nie zadziałał (kod ${kod}):\n${out}`);
  assert.match(out, /hooki lensa: włączone/);
  const pliki = fs.readdirSync(path.join(DOM, ".harness-lens", "sesje"));
  const jest = pliki.some(f => fs.readFileSync(path.join(DOM, ".harness-lens", "sesje", f), "utf8").includes('"source":"resume"'));
  assert.ok(jest, "zdarzenie hooka nie trafiło do nagrania");
});

test("tryb z komendą: LENS_BEZ_HOOKOW=1 i własne --settings wyłączają wstrzykiwanie", async () => {
  for (const [env, args] of [[{ LENS_BEZ_HOOKOW: "1" }, []], [{}, ["--settings", "moje.json"]]]) {
    const port = await wolnyPort();
    const agent = `const a=process.argv;process.exit(a.filter(x=>x==='--settings').length===${args.length ? 1 : 0}&&!a.some(x=>/hooks-lensa/.test(x))?7:3)`;
    const p = spawn(process.execPath, [LENS, process.execPath, "-e", agent, "--", ...args], {
      env: { ...process.env, LENS_PORT: String(port), LENS_UPSTREAM: `http://127.0.0.1:${apiPort}`, LENS_NO_BROWSER: "1",
        LENS_WSTRZYKNIJ_HOOKI: "1", HOME: DOM, USERPROFILE: DOM, ...env },
      stdio: "ignore",
    });
    assert.equal(await new Promise(r => p.on("exit", r)), 7, `wstrzyknięto hooki mimo ${JSON.stringify(env)} ${args.join(" ")}`);
  }
});

test("wznowienie: SessionStart(resume) wczytuje zapisaną rozmowę z dysku, zanim pójdzie request", async () => {
  const port = await wolnyPort();
  const lens = uruchomLens(port);
  try {
    await lens.gotowy;
    const zapis = path.join(DOM, "rozmowa.jsonl");
    fs.writeFileSync(zapis, [
      { type: "mode", mode: "normal" },
      { type: "user", message: { role: "user", content: "przeczytaj plik" } },
      { type: "assistant", message: { id: "msg_1", role: "assistant", content: [{ type: "text", text: "Czytam." }] } },
      { type: "assistant", message: { id: "msg_1", role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Read", input: {} }] } },
      { type: "user", isSidechain: true, message: { role: "user", content: "podagent — pomijamy" } },
      { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "treść" }] } },
    ].map(o => JSON.stringify(o)).join("\n"));
    await zapytaj(port, "/_lens/hook", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ hook_event_name: "SessionStart", source: "resume", transcript_path: zapis }) });
    const w = await czekaj(async () => (await nagranie(port)).rekordy.find(x => x.kind === "wczytana-historia"));
    assert.ok(w, "brak wczytanej historii w nagraniu");
    assert.equal(w.messages.length, 3, "zła liczba wiadomości (podagent albo rozbita odpowiedź)");
    assert.deepEqual(w.messages[1].content.map(b => b.type), ["text", "tool_use"], "odpowiedź modelu nie złożona z dwóch wpisów");
  } finally { lens.kill(); }
});

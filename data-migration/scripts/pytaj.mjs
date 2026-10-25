// Asks the application the questions of the re-wired places, over HTTP, the way a client does (login, cookie, CSRF).
// One JSON line per request: {"name","login","http","answer"}. Node 22, no dependencies.
//
//   node pytaj.mjs <config.json> <out.jsonl> [--ustaw KLUCZ=wartość ...]
//
// config.json:
// {
//   "base": "http://localhost:18461",
//   "warmup": "/api/console/auth/currentUser",                       // GET before login (sets the CSRF cookie)
//   "csrf": { "cookie": "XSRF-TOKEN", "header": "X-XSRF-TOKEN" },
//   "loginPath": "/api/console/auth/login",
//   "logins": { "hr": { "username": "admin", "password": "demo-admin" }, "it": { … } },  // users with different scope
//   "defaultLogin": "hr",
//   "lever": { "path": "/api/console/administration/setSystemProperty", "body": { "key": "$KEY", "value": "$VALUE" }, "login": "hr" },
//   "requestsFile": "requests.json"            // or "requests": [ { "name", "path", "method"?, "body"?, "login"? } ]
// }
// --ustaw KEY=VALUE (repeatable) sets lever values before the questions (e.g. which model answers, comparison on).
// The single-login format of front-compare.mjs ("login": { "path", "body" }) works too.
// Prints the time per question: when one question takes over ~0.5 s, ask fewer (training: about 50).
import fs from 'node:fs';
import path from 'node:path';

const [cfgPath, outPath, ...rest] = process.argv.slice(2);
if (!cfgPath || !outPath) { console.error('użycie: pytaj.mjs <config.json> <out.jsonl> [--ustaw K=V ...]'); process.exit(2); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
// also the single-login format of front-compare.mjs: "login": { "path", "body" }
if (cfg.login && !cfg.logins) { cfg.loginPath = cfg.login.path; cfg.logins = { domyslny: cfg.login.body }; cfg.defaultLogin = 'domyslny'; }
if (cfg.lever && !cfg.lever.login) cfg.lever.login = cfg.defaultLogin;
const requests = cfg.requests ?? JSON.parse(fs.readFileSync(path.resolve(path.dirname(cfgPath), cfg.requestsFile), 'utf8'));
const ustaw = [];
for (let i = 0; i < rest.length; i++) if (rest[i] === '--ustaw') ustaw.push(rest[++i].split(/=(.*)/s).slice(0, 2));

const sessions = new Map();   // login → cookie jar
async function session(login) {
  if (sessions.has(login)) return sessions.get(login);
  const jar = {};
  const s = { jar, call: (p, body, method = 'POST') => call(jar, p, body, method) };
  if (cfg.warmup) await s.call(cfg.warmup, null, 'GET');
  const creds = cfg.logins?.[login];
  if (!creds) throw new Error(`brak loginu „${login}” w config.logins`);
  const r = await s.call(cfg.loginPath, creds);
  if (r.http >= 400) throw new Error(`logowanie „${login}”: HTTP ${r.http} ${JSON.stringify(r.answer).slice(0, 200)}`);
  sessions.set(login, s);
  return s;
}
async function call(jar, p, body, method) {
  const csrf = cfg.csrf && jar[cfg.csrf.cookie] ? { [cfg.csrf.header]: decodeURIComponent(jar[cfg.csrf.cookie]) } : {};
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  let res;
  try {
    res = await fetch(cfg.base + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...csrf },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  } catch (e) { return { http: 0, answer: `error: ${e.cause?.code ?? e.message}` }; }
  for (const c of res.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
  const t = await res.text();
  let answer; try { answer = t ? JSON.parse(t) : null; } catch { answer = t.slice(0, 500); }
  return { http: res.status, answer };
}

const out = fs.createWriteStream(outPath);
if (ustaw.length) {
  const s = await session(cfg.lever.login ?? cfg.defaultLogin);
  for (const [k, v] of ustaw) {
    const body = JSON.parse(JSON.stringify(cfg.lever.body).replaceAll('$KEY', k).replaceAll('$VALUE', v));
    const r = await s.call(cfg.lever.path, body);
    console.error(`ustaw ${k}=${v}: HTTP ${r.http}`);
    if (r.http >= 400) process.exit(1);
  }
}
const count = {};
const t0 = Date.now();
for (const r of requests) {
  const login = r.login ?? cfg.defaultLogin;
  const s = await session(login);
  const a = await s.call(r.path, r.body, r.method ?? 'POST');
  count[a.http] = (count[a.http] ?? 0) + 1;
  out.write(JSON.stringify({ name: r.name, login, http: a.http, answer: a.answer }) + '\n');
}
out.end();
const sek = (Date.now() - t0) / 1000;
console.error(`${requests.length} pytań → ${outPath}; HTTP: ${Object.entries(count).map(([k, v]) => `${k}×${v}`).join(', ')}; ${sek.toFixed(0)} s (${(sek / Math.max(1, requests.length)).toFixed(2)} s na pytanie)`);

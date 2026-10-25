// Front comparison for swappable-dsl / parallel-model-router (Node 22, no dependencies).
//
// 1) ask:  node front-compare.mjs ask <config.json> <out.jsonl> [KEY=value ...]
//          logs in, optionally sets lever values first (config.lever), sends every request of the config the way the
//          front does, writes one JSON line per request with the picked answer (a failed request: "error: …").
// 2) diff: node front-compare.mjs diff <a.jsonl> <b.jsonl>
//          prints every request: same, ≠ (answers differ) or ✗ (an "error: …" answer, or no answer in one file —
//          never counted as same); exit code 1 when any differs or has an error.
//
// config.json (example for campsite-power):
// {
//   "base": "http://localhost:18092",
//   "warmup": "/api/console/auth/currentUser",
//   "csrf": { "cookie": "XSRF-TOKEN", "header": "X-XSRF-TOKEN" },
//   "login": { "path": "/api/console/auth/login", "body": { "username": "admin", "password": "demo-admin" } },
//            // form login (Django, Symfony, Laravel, ASP.NET): add "form": true — sent urlencoded, a 302 is success.
//            // Django CSRF: "csrf": { "cookie": "csrftoken", "header": "X-CSRFToken" }
//   "lever": { "path": "/api/console/administration/setSystemProperty", "body": { "key": "$KEY", "value": "$VALUE" } },
//   "pick": "check.validationStatus",
//            // dotted path; a segment may pick an array row: "syncStatuses[partnerName=X].status" (first row whose
//            // field equals X, compared as text) or "items[0].id" (by index); several keys: "rows[card=X,socket=1]";
//            // a subset of the list (gives a list, the rest of the path picked from every row):
//            // "cards[uid^=pm-].status" (starts with), "cards[uid in 9900001|9900002]" (one of)
//   "omit": ["updatedAt", "id"],   // fields dropped at any depth of the picked answer (timestamps, generated ids)
//   "sortArrays": true,            // lists are sets: sort before comparing (optional)
//   "requestsFile": "requests.json", // requests built after the seed (ids known only then), instead of "requests";
//                                    // a relative path is resolved against the config file's directory
//   "requests": [
//     { "name": "9900001 @ HR-SCN-BAY-P001", "path": "/api/console/card/checkCardAtSocket",
//       "body": { "cardRfid": "9900001", "pedestalCode": "HR-SCN-BAY-P001", "socketNo": 1 } },
//     { "name": "sync X", "path": "/api/console/sync/status", "method": "GET",
//       "pick": "syncStatuses[partnerName=X].status", "omit": [] }   // per request: overrides the global pick/omit
//   ]
// }
//
// Exports isError/verdict (the one rule for "same"), used by front-story.mjs page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// not an answer: a failed step/locator/request, or none at all
export const isError = v => v === undefined || (typeof v === 'string' && v.startsWith('error:'));

// values: the answers of one case in every run (undefined = that run has no answer for it).
// No answer in any run is 'same' (nothing was read anywhere); otherwise any error → 'error', else 'same' | 'differ'.
export function verdict(values) {
  if (values.every(v => v === undefined)) return 'same';
  if (values.some(isError)) return 'error';
  return values.every(v => JSON.stringify(v) === JSON.stringify(values[0])) ? 'same' : 'differ';
}

const readLines = f => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

function diff(fa, fb) {
  const a = new Map(readLines(fa).map(r => [r.name, r.answer]));
  const b = new Map(readLines(fb).map(r => [r.name, r.answer]));
  const count = { same: 0, differ: 0, error: 0 };
  const show = x => (x === undefined ? '—' : JSON.stringify(x));
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const v = verdict([a.get(name), b.get(name)]);
    count[v]++;
    console.log(`${{ same: '  ', differ: '≠ ', error: '✗ ' }[v]}${name}: ${show(a.get(name))} | ${show(b.get(name))}`);
  }
  console.log(count.differ || count.error
    ? [count.differ && `${count.differ} different answers`, count.error && `${count.error} with errors`].filter(Boolean).join(', ')
    : 'same answers');
  return count.differ || count.error ? 1 : 0;
}

// one condition of a row filter: "k=v" (equal), "k^=v" (starts with), "k in A|B|C" (one of); compared as text
function condition(text) {
  const m = text.match(/^\s*([^=^\s]+)\s+in\s+(.*)$/) ?? text.match(/^\s*([^=^]+?)\s*(\^?=)(.*)$/);
  if (!m) throw new Error(`pick: unknown filter [${text}]`);
  if (m.length === 3) { const values = m[2].split('|').map(s => s.trim()); return { many: true, test: r => values.includes(String(r?.[m[1]])) }; }
  return m[2] === '^=' ? { many: true, test: r => String(r?.[m[1]] ?? '').startsWith(m[3]) }
    : { many: false, test: r => String(r?.[m[1]]) === m[3] };
}

// "a.b[k=v].c" / "a[0]" / "a[k=v,l=w]" → the value; "a[k^=pm-].c" / "a[k in A|B].c" → a list (the rest of the path
// picked from every matching row); a missing step gives undefined
export function picked(obj, p) {
  if (!p) return obj;
  const segs = [...p.matchAll(/([^.[\]]+)|\[(\d+)\]|\[([^\]]+)\]/g)];
  const walk = (o, i) => {
    for (; i < segs.length; i++) {
      const m = segs[i];
      if (m[1] !== undefined) o = o?.[m[1]];
      else if (m[2] !== undefined) o = o?.[+m[2]];
      else {
        // conditions joined by "," must all hold; any ^= / in makes it a subset of the list, otherwise the first row
        const conds = m[3].split(',').map(condition);
        if (!Array.isArray(o)) return undefined;
        const rows = o.filter(r => conds.every(c => c.test(r)));
        if (!conds.some(c => c.many)) o = rows[0];
        else return rows.map(r => walk(r, i + 1));
      }
    }
    return o;
  };
  return walk(obj, 0);
}

const without = (v, keys) => !keys.length ? v : Array.isArray(v) ? v.map(x => without(x, keys))
  : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)).map(([k, x]) => [k, without(x, keys)])) : v;
const norm = v => Array.isArray(v) ? v.map(norm).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1))
  : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;

// the answer of one request: its own pick/omit, else the config's
export function answerOf(body, req, config) {
  const v = without(picked(body, req.pick ?? config.pick), req.omit ?? config.omit ?? []);
  return config.sortArrays ? norm(v) : v;
}

async function ask(args) {
  const config = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const out = args[1];
  const leverValues = args.slice(2);
  const jar = new Map();

  async function call(path, body, method = 'POST', form = false) {
    const headers = { 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json',
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (config.csrf && jar.has(config.csrf.cookie)) headers[config.csrf.header] = jar.get(config.csrf.cookie);
    const res = await fetch(config.base + path, {
      method, headers, redirect: 'manual',
      body: method === 'GET' ? undefined : form ? new URLSearchParams(body ?? {}).toString() : JSON.stringify(body ?? {}),
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* plain text */ }
    return { status: res.status, body: parsed };
  }

  if (config.warmup) await call(config.warmup, null, 'GET');
  if (config.login) {
    const r = await call(config.login.path, config.login.body, 'POST', config.login.form === true);
    if (r.status >= 400) { console.error('login failed', r.status, r.body); process.exit(1); }
  }
  for (const kv of leverValues) {
    const [key, value] = kv.split('=');
    const body = JSON.parse(JSON.stringify(config.lever.body).replace('$KEY', key).replace('$VALUE', value));
    const r = await call(config.lever.path, body);
    console.error(`lever ${key}=${value}: HTTP ${r.status}`);
  }
  const lines = [];
  const requestsPath = config.requestsFile && path.resolve(path.dirname(path.resolve(args[0])), config.requestsFile);
  const requests = requestsPath ? JSON.parse(fs.readFileSync(requestsPath, 'utf8')) : config.requests;
  for (const req of requests) {
    try {
      const r = await call(req.path, req.body, req.method ?? 'POST');
      lines.push(JSON.stringify({ name: req.name, http: r.status, answer: r.status < 300 ? answerOf(r.body, req, config) : r.body }));
    } catch (e) {
      console.error(`${req.name}: ${e.message}`);
      lines.push(JSON.stringify({ name: req.name, answer: `error: ${e.message.split('\n')[0]}` }));
    }
  }
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.error(`${lines.length} answers → ${out}`);
}

// run as a script only, not when imported
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === 'diff') process.exit(diff(args[0], args[1]));
  if (mode !== 'ask') {
    console.error('usage: front-compare.mjs ask <config.json> <out.jsonl> [KEY=value ...] | diff <a> <b>');
    process.exit(2);
  }
  await ask(args);
}

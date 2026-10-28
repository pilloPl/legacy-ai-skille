// Front story for swappable-dsl / parallel-model-router (Node 22 + Playwright): what a person sees on the screen
// with each model — captioned screenshots, a short video, the answers read off the screen, and one page with both
// models side by side.
//
// 1) record: node front-story.mjs record <story.json> <out-dir> <label> [KEY=value ...]
//            opens the front in Chromium, runs the steps, shoots a captioned screenshot after every `shot`/`answer`
//            step, records a video of the whole run; writes <out-dir>/<label>/{NN-*.png, video.webm, answers.jsonl}.
//            KEY=value pairs set the lever before the cases (same lever as front-compare.mjs).
// 2) page:   node front-story.mjs page <out-dir> <labelA> <labelB> [...]
//            writes <out-dir>/story.html: per case the screenshots of every label next to each other, ≠ where the
//            answers differ, ✗ where a run has an "error: …" answer (or none) — never counted as same — and the videos
//            on top; exit code 1 when any case differs or has an error. Cases with "compare": false are shown (screenshots,
//            answer) without a verdict and are not counted. Same rule as `front-compare.mjs diff` (imported
//            from it, keep both files together). answers.jsonl has the format of front-compare.mjs (its `diff` works).
//
// Playwright: the project's own when the front has it (`"playwright": "<front dir>"` in story.json, relative to the
// dir of story.json, after a one-off `npm ci` there); otherwise `npm i --no-save playwright && npx playwright install chromium` in the dir of story.json.
//
// story.json (example for campsite-power, console behind the Vite dev server):
// {
//   "base": "http://localhost:5179", "playwright": "../../campsite-console", "slowMo": 120,
//   "lever": { "path": "/api/console/administration/setSystemProperty", "body": { "key": "$KEY", "value": "$VALUE" },
//              "csrf": { "cookie": "XSRF-TOKEN", "header": "X-XSRF-TOKEN" } },
//   "login": [ { "goto": "/login" }, { "fill": { "label": "Username" }, "value": "admin" },
//              { "fill": { "label": "Password" }, "value": "demo-admin" },
//              { "click": { "role": "button", "name": "Log in" } }, { "see": { "testId": "current-user" } },
//              { "click": { "role": "tab", "name": "Cards" } } ],
//   "steps": [ { "click": { "testId": "check-card" } },
//              { "fill": { "label": "Card RFID", "in": { "role": "dialog" } }, "value": "$card" },
//              { "choose": { "label": "Pedestal", "in": { "role": "dialog" } }, "option": "$pedestal" },
//              { "shot": "$name: question" },
//              { "click": { "role": "button", "name": "Check" } },
//              { "answer": { "testId": "card-check-result" }, "pick": "Card \\S+ at socket \\S+: (.*)" },
//              { "click": { "css": "[data-testid=card-check-result] button" } } ],
//   "cases": [ { "name": "9900001 @ HR-SCN-BAY-P001", "card": "9900001", "pedestal": "HR-SCN-BAY-P001" } ]
//   // or "casesFile": "cases.json" (built after the seed), resolved against the dir of story.json
// }
// No "cases", "casesFile" nor "groups": the top-level "steps" run once, as one case named "name" of story.json (else the
// label) — a recording of a screen alone (e.g. the lever screen).
// Cases on different screens: a case may have its own "steps" (they replace the shared "steps" for that case), or
// "groups": [ { "steps": [...], "cases": [...] | "casesFile": "…" }, ... ] — each group's cases run its steps; groups
// run after "cases"/"casesFile". A case without steps of its own, outside a group, uses the shared "steps".
// Steps: goto, click, fill+value, choose+option (select: opens it, clicks the option starting with the text), see,
// scroll (a locator, scrolled into view), key, wait (ms), lever ({ "KEY": "value" } mid-story — the lever flipped
// live on the video), exec (a shell command run before the next step, in the dir of story.json, e.g.
// { "exec": "cp inputs/$file /srv/import/in.csv" } — the input put in place right before the click; a non-zero exit
// fails the case; optional "timeout" in ms, default 60 s), shot (caption), answer (+ optional pick: regex, group 1 is
// the answer; + optional "as": several readings in one case, each its own case in answers.jsonl named "<case> · <as>",
// e.g. { "answer": { "testId": "counter" }, "as": "licznik" } → "M3 · licznik"; + optional "shot": false — read
// without a screenshot).
// Locators: role+name, label, testId, text, css; "in": a locator to search within (a dialog).
// $field in any string is taken from the case (and $name from its name), else from "vars" of story.json (shared
// values, e.g. "vars": { "backend": "http://localhost:$ENV_BACKEND_PORT" }); unknown $NAMES stay as they are (exec: the
// shell expands them). $ENV_NAME anywhere in story.json and in casesFile = the environment variable NAME (missing →
// the run stops before the browser starts). Case values go into exec as they are — no shell quoting.
// A failed step makes the case answer "error: …" (with a screenshot) — every reading of the case not read yet; page
// and diff count it as an error.
// "compare": false on a case (or on its group): the case is recorded and shown, but takes no part in the comparison —
// its readings go to shown.jsonl, not to answers.jsonl, so page gives no verdict and front-compare diff and the gate
// never see them (e.g. a list the screen loads for a default object outside the seed).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { isError, verdict } from './front-compare.mjs';

const [mode, ...args] = process.argv.slice(2);

if (mode === 'page') {
  const [dir, ...labels] = args;
  const runs = labels.map(label => ({
    label,
    answers: new Map(readLines(path.join(dir, label, 'answers.jsonl')).map(r => [r.name, r.answer])),
    shots: readLines(path.join(dir, label, 'shots.jsonl')),
    shown: new Map(readLines(path.join(dir, label, 'shown.jsonl')).map(r => [r.name, r.answer])),
  }));
  const names = [...new Set(runs.flatMap(r => [...r.shots.map(s => s.case), ...r.answers.keys(), ...r.shown.keys()]))].filter(Boolean);
  // a name that is only in shown.jsonl (compare: false) gets no verdict
  const notCompared = name => runs.some(r => r.shown.has(name)) && !runs.some(r => r.answers.has(name));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const count = { same: 0, differ: 0, error: 0 };
  let shownCount = 0;
  const cases = names.map(name => {
    const shown = notCompared(name);
    const v = shown ? 'shown' : verdict(runs.map(r => r.answers.get(name)));
    if (shown) shownCount++; else count[v]++;
    const cols = runs.map(r => {
      const a = shown ? r.shown.get(name) : r.answers.get(name);
      const bad = v === 'error' && isError(a);
      return `<figure><figcaption>${esc(r.label)}: <b${bad ? ' class="err"' : ''}>${esc(a ?? (bad ? 'no answer' : '—'))}</b></figcaption>${
        r.shots.filter(s => s.case === name).map(s => `<a href="${esc(r.label)}/${esc(s.file)}"><img src="${esc(r.label)}/${
          esc(s.file)}" alt="${esc(s.caption)}" title="${esc(s.caption)}"></a>`).join('')}</figure>`;
    }).join('');
    return `<section class="${v}"><h2>${{ same: '', differ: '≠ ', error: '✗ ', shown: '' }[v]}${esc(name)}${shown ? ' <small>(not compared)</small>' : ''}</h2><div class="cols">${cols}</div></section>`;
  }).join('\n');
  const summary = count.differ || count.error
    ? [count.differ && `${count.differ} cases differ`, count.error && `${count.error} cases with errors`].filter(Boolean).join(', ')
    : 'same answers on the screen';
  const shownNote = shownCount ? ` (+ ${shownCount} shown, not compared)` : '';
  const videos = runs.map(r => `<figure><figcaption>${esc(r.label)}</figcaption><video src="${esc(r.label)}/video.webm" controls muted></video></figure>`).join('');
  fs.writeFileSync(path.join(dir, 'story.html'), `<!doctype html><meta charset="utf-8"><title>Front story</title>
<style>body{font:14px system-ui;margin:16px;background:#fff;color:#222}.cols{display:grid;grid-template-columns:repeat(${runs.length},1fr);gap:12px}
img,video{width:100%;border:1px solid #ccc;margin-bottom:6px}section.differ h2{color:#b00020}figure{margin:0}
section.shown h2{color:#666}section.error h2,.err{color:#fff;background:#b00020;padding:0 4px}p.bad{color:#b00020;font-weight:600}</style>
<h1>Front story: ${runs.map(r => esc(r.label)).join(' | ')}</h1><p${count.error ? ' class="bad"' : ''}>${summary}${shownNote}</p>
<div class="cols">${videos}</div>${cases}`);
  console.log(`${names.length - shownCount} cases, ${summary}${shownNote} → ${path.join(dir, 'story.html')}`);
  process.exit(count.differ || count.error ? 1 : 0);
}

if (mode !== 'record') {
  console.error('usage: front-story.mjs record <story.json> <out-dir> <label> [KEY=value ...] | page <out-dir> <label> <label> ...');
  process.exit(2);
}

// $ENV_NAME → process.env.NAME, in every string; a missing variable stops the run (a half-filled address would
// only fail later, on the first step)
function fromEnv(v, where) {
  if (typeof v === 'string') return v.replace(/\$ENV_(\w+)/g, (m, k) => {
    if (process.env[k] === undefined) { console.error(`${where}: environment variable ${k} is not set (${m})`); process.exit(2); }
    return process.env[k];
  });
  if (Array.isArray(v)) return v.map(x => fromEnv(x, where));
  return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fromEnv(x, where)])) : v;
}

const storyPath = path.resolve(args[0]);
const storyDir = path.dirname(storyPath);
const story = fromEnv(JSON.parse(fs.readFileSync(storyPath, 'utf8')), args[0]);
const label = args[2];
const out = path.join(path.resolve(args[1]), label);
const leverValues = Object.fromEntries(args.slice(3).map(kv => kv.split('=')));

const pwDir = path.resolve(storyDir, story.playwright ?? '.');
const require = createRequire(path.join(pwDir, 'package.json'));
const load = name => { try { return require(name); } catch { return null; } };
const pw = load('playwright') ?? load('@playwright/test');
if (!pw) {
  console.error(`Playwright not found from ${pwDir} ("playwright": ${JSON.stringify(story.playwright ?? '.')} in story.json is `
    + `relative to the dir of story.json, ${storyDir}). Run \`npm ci\` there once, or \`npm i --no-save playwright && `
    + `npx playwright install chromium\` next to story.json.`);
  process.exit(2);
}
const { chromium } = pw;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ slowMo: story.slowMo ?? 100 });
const viewport = story.viewport ?? { width: 1280, height: 800 };
const context = await browser.newContext({ baseURL: story.base, viewport, recordVideo: { dir: out, size: viewport } });
const page = await context.newPage();

// cases with their steps: own "steps" > the group's > the shared ones
const casesOf = g => (g.casesFile ? fromEnv(JSON.parse(fs.readFileSync(path.resolve(storyDir, g.casesFile), 'utf8')), g.casesFile) : g.cases) ?? [];
// no cases anywhere: the top-level steps run once (a recording of a screen alone)
const noCases = !story.cases && !story.casesFile && !(story.groups ?? []).length;
const cases = noCases && story.steps ? [{ c: { name: story.name ?? label }, steps: story.steps }]
  : [story, ...(story.groups ?? [])].flatMap(g => casesOf(g).map(c => ({ c, steps: c.steps ?? g.steps ?? story.steps,
    compare: (c.compare ?? (g === story ? undefined : g.compare)) !== false })));
const answers = [];
const shown = []; // readings of cases with "compare": false
const shots = [];
let shotNo = 0;

// c: the case's fields over story.vars (login steps: only vars)
const fillIn = (v, c) => typeof v === 'string' ? v.replace(/\$(\w+)/g, (m, k) => (c && k in c ? String(c[k]) : m))
  : Array.isArray(v) ? v.map(x => fillIn(x, c)) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillIn(x, c)])) : v;
const fieldsOf = c => ({ ...(story.vars ?? {}), ...(c ?? {}) });

// the name of a reading: the case, or "<case> · <as>" when one case reads several answers
const answerName = (s, c) => (s.as ? `${c.name} · ${s.as}` : c.name);

// "in": a locator to search within, e.g. { "label": "Pedestal", "in": { "role": "dialog" } }
function locate(l) {
  const base = l.in ? locate(l.in) : page;
  if (l.role) return base.getByRole(l.role, l.name ? { name: l.name, exact: l.exact ?? true } : {});
  if (l.label) return base.getByLabel(l.label, { exact: l.exact ?? false });
  if (l.testId) return base.getByTestId(l.testId);
  if (l.text) return base.getByText(l.text, { exact: l.exact ?? false });
  return base.locator(l.css);
}

// The caption is a banner inside the page: it is on the screenshot and on the video.
async function caption(text) {
  await page.evaluate(t => {
    let el = document.getElementById('__story_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__story_caption';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;padding:8px 14px;'
        + 'background:rgba(20,20,20,.85);color:#fff;font:600 16px system-ui;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text).catch(() => undefined);
}

async function shoot(text, caseName) {
  const full = `${label} · ${text}`;
  await caption(full);
  await page.waitForTimeout(story.pause ?? 400);
  const file = `${String(++shotNo).padStart(2, '0')}-${text.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60)}.png`;
  await page.screenshot({ path: path.join(out, file) });
  shots.push({ case: caseName, caption: full, file });
}

async function flipLever(values) {
  const lever = story.lever;
  const cookies = await context.cookies();
  const csrf = lever.csrf && cookies.find(c => c.name === lever.csrf.cookie);
  for (const [key, value] of Object.entries(values)) {
    const body = JSON.parse(JSON.stringify(lever.body).replace('$KEY', key).replace('$VALUE', value));
    const r = await page.request.post(lever.path, { data: body, headers: csrf ? { [lever.csrf.header]: csrf.value } : {} });
    console.error(`lever ${key}=${value}: HTTP ${r.status()}`);
    await caption(`${label} · lever ${key}=${value}`);
  }
}

async function run(steps, c, read = new Set(), into = answers) {
  for (const raw of steps) {
    const s = fillIn(raw, fieldsOf(c));
    if (s.goto) await page.goto(s.goto);
    else if (s.click) await locate(s.click).click();
    else if (s.fill) await locate(s.fill).fill(s.value);
    else if (s.choose) {
      await locate(s.choose).click();
      await page.getByRole('option').filter({ hasText: s.option }).first().click();
    } else if (s.see) await locate(s.see).waitFor({ state: 'visible', timeout: s.timeout ?? 15_000 });
    else if (s.scroll) await locate(s.scroll).scrollIntoViewIfNeeded();
    else if (s.exec) {
      try { execSync(s.exec, { cwd: storyDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: s.timeout ?? 60_000, shell: '/bin/bash' }); }
      catch (e) { throw new Error(`exec failed (${e.status ?? e.signal}): ${s.exec} ${String(e.stderr ?? '').trim().split('\n')[0]}`); }
    } else if (s.key) await page.keyboard.press(s.key);
    else if (s.wait) await page.waitForTimeout(s.wait);
    else if (s.lever) await flipLever(s.lever);
    else if (s.shot) await shoot(s.shot, c?.name ?? '');
    else if (s.answer) {
      const el = locate(s.answer);
      await el.waitFor({ state: 'visible', timeout: s.timeout ?? 15_000 });
      const text = (await el.innerText()).replace(/\s+/g, ' ').trim();
      const answer = s.pick ? (text.match(new RegExp(s.pick))?.[1] ?? text) : text;
      const name = answerName(s, c);
      into.push({ name, answer });
      read.add(name);
      if (s.shot !== false) await shoot(`${name}: ${answer}`, name);
    } else throw new Error(`unknown step ${JSON.stringify(raw)}`);
  }
}

try {
  await run(story.login ?? [], null);
  if (Object.keys(leverValues).length) await flipLever(leverValues);
  for (const { c, steps, compare } of cases) {
    const read = new Set();
    const into = compare ? answers : shown;
    try {
      if (!steps) throw new Error('no steps: neither the case, its group nor the story has "steps"');
      await run(steps, c, read, into);
    }
    catch (e) {
      console.error(`${c.name}: ${e.message.split('\n')[0]}`);
      // every reading not read yet gets the error, so that each one is ✗ against the other run, not "no answer"
      const expected = (steps ?? []).filter(s => s.answer).map(s => answerName(fillIn(s, fieldsOf(c)), c));
      const missing = [...new Set(expected)].filter(n => !read.has(n));
      const failed = missing.length ? missing : [c.name];
      for (const name of failed) into.push({ name, answer: `error: ${e.message.split('\n')[0]}` });
      // the screenshot of the failure goes with the first reading it cost
      await shoot(`${failed[0]}: error`, failed[0]);
      await page.keyboard.press('Escape').catch(() => undefined);
    }
  }
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) fs.renameSync(await video.path(), path.join(out, 'video.webm'));
}
fs.writeFileSync(path.join(out, 'answers.jsonl'), answers.map(a => JSON.stringify(a)).join('\n') + '\n');
fs.writeFileSync(path.join(out, 'shots.jsonl'), shots.map(s => JSON.stringify(s)).join('\n') + '\n');
if (shown.length) fs.writeFileSync(path.join(out, 'shown.jsonl'), shown.map(a => JSON.stringify(a)).join('\n') + '\n');
const failed = answers.filter(a => isError(a.answer)).length;
console.error(`${answers.length} answers${failed ? ` (${failed} with errors)` : ''}${shown.length ? `, ${shown.length} shown without comparison` : ''}, ${shots.length} screenshots, video → ${out}`);

function readLines(f) {
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
}

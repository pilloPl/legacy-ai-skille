// Gate of a parallel-models step. The deterministic part: runs the tests, lists what changed (legacy changed since
// baza — the whole branch, ★ marks this step; added in this step; spec files added in this step),
// appends the results to bramki.jsonl, sets the step in stan.json, rebuilds specyfikacja.html. The human decision is asked by Claude
// (AskUserQuestion) and written back with --decyzja.
// Forbidden vocabulary: when stan.json has `zakazane` (code forms) and `slownik_pliki` (paths/globs of the port, port
// types, world interface, DSL, scenarios, new solution module), every gate greps them (`grep -rnwF`, Legacy* and
// CLAUDE.md exempt) and appends { typ: 'slownik', ok, trafienia (lines with a hit), pierwsze }; any hit = red.
// In swappable-dsl.3/.4 a non-empty `zakazane` without `slownik_pliki` is red too.
// stan.json values that are "" or "<…>" mean "not filled yet" (placeholders of later steps).
//
//   node bramka.mjs <katalog specyfikacji> <krok> [--testy krok|pelne|oba|front] [--front tak] [--env KLUCZ=wartość ...] [--opis "…"]
//                            one --opis for several runs gets a suffix: " — krok" / " — pełne" (--testy oba), " — front"
//                            warns (does not fail) on a duplicated "## " heading in specyfikacja.md
//   … --porownanie <a.jsonl> <b.jsonl> [--porownanie <a2.jsonl> <b2.jsonl> ...]
//                            compares two answers.jsonl (front-compare.mjs ask / front-story.mjs record; paths relative
//                            to the current dir) with the rule of `front-compare.mjs diff`: per case same / different /
//                            with an error ("error: …" or no answer in one file — never same); prints up to 10 that are
//                            not same and appends { typ: 'porownanie', co: --opis or '<a> vs <b>', wynik: 'n/n takie same' | …, ok }.
//                            Every pair = its own entry. With or without --testy; not same = red
//   … --porownanie-katalog <katalog> <etykieta A> <etykieta B>
//                            pairs every <źródło>-<A>.jsonl with <źródło>-<B>.jsonl in the dir (e.g. front-legacy.jsonl
//                            + front-party.jsonl, api-legacy.jsonl + api-party.jsonl); case names get the source prefix
//                            ("api · M2 …"); a file without its pair = all its cases with an error. One entry: the sum
//                            and per source (zrodla: { <źródło>: { takie_same, rozne, bledy } })
//   … --roznice <katalog> [--seed <plik>]
//                            counts the entries of every JSON Lines file (*.jsonl) in the reconciliation directory
//                            (format: parallel-model-router/reconciliation.md); no directory = no differences. An entry
//                            is "seed" when any identifier from --seed (one per line, # comments) equals a value of its
//                            `input` (by value, nested values too); without --seed every entry counts as seed. Red only
//                            on seed differences (or unreadable lines); the rest is the data-migration finding. Appends
//                            { typ: 'roznice', co, wynik, ok, seed, poza_seedem, nieczytelne, pytania: { <question>: { seed, poza_seedem } },
//                            pierwsze_seed, pierwsze_poza_seedem } (up to 5 examples each)
//   node bramka.mjs <katalog specyfikacji> <krok> --decyzja "Akceptuję|Poprawki|Stop" [--uwagi "…"] [--kto <nick>]
//   (kto: --kto, else the GitHub login from gh, else git user.name, else the OS user)
//
// <krok> is a step id from workflow.json (e.g. swappable-dsl.3). Exit code 1 when tests are red, answers not same,
// a seed difference is in the reconciliation directory or a forbidden word is found.
import { execSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSpec, setState, appendGate, tableRows, repoRoot, changes, git } from './spec.mjs';
import { build } from './specyfikacja.mjs';

const [dir, krok, ...rest] = process.argv.slice(2);
if (!dir || !krok) {
  console.error('użycie: bramka.mjs <katalog specyfikacji> <krok> [--testy krok|pelne|oba] [--env K=V] [--opis "…"] [--porownanie <a.jsonl> <b.jsonl> ...] [--porownanie-katalog <katalog> <A> <B>] [--roznice <katalog> [--seed <plik>]] | --decyzja "…" [--uwagi "…"]');
  process.exit(2);
}
const opt = { env: {}, porownanie: [] };
for (let i = 0; i < rest.length; i++) {
  const k = rest[i];
  if (k === '--env') { const [a, ...b] = rest[++i].split('='); opt.env[a] = b.join('='); }
  else if (k === '--porownanie') opt.porownanie.push([rest[++i], rest[++i]]);
  else if (k === '--porownanie-katalog') opt.katalog = [rest[++i], rest[++i], rest[++i]];
  else if (k.startsWith('--')) opt[k.slice(2)] = rest[++i];
}
{
  const brak = opt.porownanie.flat().filter(f => !f || !fs.existsSync(path.resolve(f)));
  if (brak.length) { console.error(`--porownanie: brak pliku ${brak.map(f => f ?? '(nie podano)').join(', ')}`); process.exit(2); }
}
// --porownanie-katalog: the sources are the file prefixes before -<A>.jsonl / -<B>.jsonl
if (opt.katalog) {
  const [kat, la, lb] = opt.katalog;
  if (!kat || !la || !lb) { console.error('--porownanie-katalog: podaj katalog i dwie etykiety, np. --porownanie-katalog ekran legacy party'); process.exit(2); }
  if (!fs.existsSync(path.resolve(kat))) { console.error(`--porownanie-katalog: brak katalogu ${kat}`); process.exit(2); }
  const suffix = l => `-${l}.jsonl`;
  const zrodla = [...new Set(fs.readdirSync(path.resolve(kat)).flatMap(f => [la, lb]
    .filter(l => f.endsWith(suffix(l)) && f.length > suffix(l).length).map(l => f.slice(0, -suffix(l).length))))].sort();
  if (!zrodla.length) { console.error(`--porownanie-katalog: w ${kat} nie ma plików *-${la}.jsonl ani *-${lb}.jsonl`); process.exit(2); }
  opt.katalog = { kat, la, lb, zrodla: zrodla.map(z => ({ z, a: path.join(kat, z + suffix(la)), b: path.join(kat, z + suffix(lb)) })) };
}
if ('roznice' in opt || 'seed' in opt) {
  if (!opt.roznice) { console.error('--roznice: podaj katalog różnic, np. --roznice "$(pwd)/target/reconciliation"'); process.exit(2); }
  if ('seed' in opt && (!opt.seed || !fs.existsSync(path.resolve(opt.seed)))) { console.error(`--seed: brak pliku ${opt.seed ?? '(nie podano)'}`); process.exit(2); }
}
const root = repoRoot(dir);
const specRel = path.relative(root, path.resolve(dir)) + '/';

function who() {
  const run = (c, a) => { try { return execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim(); } catch { return ''; } };
  const gh = run('gh', ['api', 'user', '--jq', '.login']);
  return gh ? `@${gh}` : run('git', ['-C', dir, 'config', 'user.name']) || os.userInfo().username;
}

if (opt.decyzja) {
  const kto = opt.kto ?? who();
  appendGate(dir, { krok, typ: 'czlowiek', decyzja: opt.decyzja, uwagi: opt.uwagi ?? '', kto });
  build(dir);
  console.log(`bramka człowieka: ${krok} — ${opt.decyzja} (${kto})`);
  process.exit(0);
}

// which version of the skills ran this step (the skills folder is usually outside the repository's history)
const skille = (() => { try { return execFileSync('git', ['-C', path.dirname(new URL(import.meta.url).pathname), 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } })();
const front = setState(dir, { krok, ...(skille ? { skille } : {}) });
let red = false;
// "" or "<…>" in stan.json = not filled yet
const isSet = v => typeof v === 'string' && v.trim() !== '' && !v.trim().startsWith('<');

function runTests(which) {
  const cmd = front[`testy_${which}`];
  if (!isSet(cmd)) { console.log(`testy ${which}: brak komendy w stan.json (testy_${which})`); return; }
  const envNote = Object.entries(opt.env).map(([k, v]) => `${k}=${v}`).join(' ');
  // one --opis covers several entries (--testy oba, --front tak): suffix them so they do not blur together
  const suffix = !opt.opis ? '' : which === 'front' ? ' — front'
    : opt.testy === 'oba' ? ({ krok: ' — krok', pelne: ' — pełne' }[which] ?? '') : '';
  const label = `${opt.opis ? opt.opis + suffix : ({ pelne: 'pełna regresja', front: 'testy frontu' }[which] ?? 'testy kroku')}${envNote ? ` (${envNote})` : ''}`;
  // long runs print nothing until the end: say what is running before it starts
  console.log(`${label}: start…`);
  const start = Date.now();
  let out = '', code = 0;
  try { out = execSync(cmd, { cwd: root, env: { ...process.env, ...opt.env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 << 20, shell: '/bin/bash' }); }
  catch (e) { code = e.status ?? 1; out = (e.stdout ?? '') + (e.stderr ?? ''); }
  // Maven prints one summary per module (lines without „Time elapsed”); per-class lines are skipped, modules summed
  const runs = [...out.matchAll(/Tests run: (\d+), Failures: (\d+), Errors: (\d+), Skipped: (\d+)(.*)$/gm)]
    .filter(m => !m[5].includes('Time elapsed'))
    .reduce((s, m) => s ? s.map((x, i) => i ? x + +m[i] : x) : [m[0], +m[1], +m[2], +m[3], +m[4]], null);
  const jest = out.match(/Tests:\s+(.*total)/) ?? out.match(/Tests\s+(\d+ (?:passed|failed).*\(\d+\))/); // jest | vitest
  const count = runs ? `${runs[1]} testów, ${+runs[2] + +runs[3]} czerwonych, ${runs[4]} pominiętych` : jest ? jest[1] : '';
  const secs = Math.round((Date.now() - start) / 1000);
  const wynik = code === 0 ? `✓ zielone${count ? ` (${count})` : ''}, ${secs} s` : `✗ czerwone, kod ${code}${count ? ` (${count})` : ''}`;
  if (code !== 0) { red = true; console.log(out.split('\n').slice(-40).join('\n')); }
  appendGate(dir, { krok, typ: 'testy', co: label, wynik, ok: code === 0 });
  console.log(`${label}: ${wynik}`);
}

// The same rule as swappable-dsl/examples/front-compare.mjs (isError/verdict) — copied, not imported: the gate does
// not depend on another skill's example. An "error: …" answer, or none in one file, is never same.
const isError = v => v === undefined || (typeof v === 'string' && v.startsWith('error:'));
function verdict(values) {
  if (values.every(v => v === undefined)) return 'same';
  if (values.some(isError)) return 'error';
  return values.every(v => JSON.stringify(v) === JSON.stringify(values[0])) ? 'same' : 'differ';
}

// one pair of files; a missing file (its pair absent in --porownanie-katalog) = no answers; prefix = source of the case names
function countPair(fa, fb, prefix = '') {
  const read = f => !f || !fs.existsSync(path.resolve(f)) ? new Map()
    : new Map(fs.readFileSync(path.resolve(f), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).map(r => [r.name, r.answer]));
  const a = read(fa), b = read(fb);
  const count = { same: 0, differ: 0, error: 0 };
  const notSame = [];
  const show = x => (x === undefined ? '—' : JSON.stringify(x));
  for (const name of new Set([...a.keys(), ...b.keys()])) {
    const v = verdict([a.get(name), b.get(name)]);
    count[v]++;
    if (v !== 'same') notSame.push(`${v === 'error' ? '✗' : '≠'} ${prefix}${name}: ${show(a.get(name))} | ${show(b.get(name))}`);
  }
  return { count, notSame };
}

const total = c => c.same + c.differ + c.error;
const wynikOf = c => total(c) > 0 && c.same === total(c) ? `✓ ${total(c)}/${total(c)} takie same`
  : `✗ ${c.same}/${total(c)} takie same, różnych: ${c.differ}, z błędem: ${c.error}`;

// one gate entry: co (--opis, else the files), the sum and, from a directory, the split per source
function reportComparison(co, count, notSame, zrodla) {
  const n = total(count);
  const ok = n > 0 && count.same === n;
  const perSource = zrodla ? ` (${Object.entries(zrodla).map(([z, c]) => `${z} ${c.takie_same}/${c.takie_same + c.rozne + c.bledy}`).join(', ')})` : '';
  const wynik = wynikOf(count) + perSource;
  if (notSame.length) console.log(`różnice (${notSame.length}${notSame.length > 10 ? ', pierwsze 10' : ''}):\n  ${notSame.slice(0, 10).join('\n  ')}`);
  if (!ok) red = true;
  appendGate(dir, { krok, typ: 'porownanie', co, wynik, ok, takie_same: count.same, rozne: count.differ, bledy: count.error, ...(zrodla ? { zrodla } : {}) });
  console.log(`porównanie ${co}: ${wynik}`);
}

function comparePairs(pairs) {
  for (const [fa, fb] of pairs) {
    const { count, notSame } = countPair(fa, fb);
    // one --opis for several pairs: the files are added so that the entries do not blur together
    const co = opt.opis ? (pairs.length > 1 ? `${opt.opis} — ${fa} vs ${fb}` : opt.opis) : `${fa} vs ${fb}`;
    reportComparison(co, count, notSame);
  }
}

function compareDir({ kat, la, lb, zrodla }) {
  const sum = { same: 0, differ: 0, error: 0 };
  const notSame = [], perSource = {};
  for (const { z, a, b } of zrodla) {
    const r = countPair(a, b, `${z} · `);
    for (const k of Object.keys(sum)) sum[k] += r.count[k];
    notSame.push(...r.notSame);
    perSource[z] = { takie_same: r.count.same, rozne: r.count.differ, bledy: r.count.error };
    const brak = [a, b].filter(f => !fs.existsSync(f));
    if (brak.length) console.log(`  ${z}: brak pliku ${brak.join(', ')} — przypadki z drugiego pliku liczone z błędem`);
  }
  reportComparison(opt.opis ?? `${kat}/*-${la}.jsonl vs *-${lb}.jsonl`, sum, notSame, perSource);
}

if (opt.testy === 'krok' || opt.testy === 'oba') runTests('krok');
if (opt.testy === 'pelne' || opt.testy === 'oba') runTests('pelne');
if (opt.testy === 'front' || opt.front) runTests('front');
if (opt.porownanie.length) comparePairs(opt.porownanie);
if (opt.katalog) compareDir(opt.katalog);
if (opt.roznice) countDifferences(opt.roznice, opt.seed);
if (!opt.testy && !opt.porownanie.length && !opt.katalog && !opt.roznice) appendGate(dir, { krok, typ: 'krok', co: opt.opis ?? 'krok bez testów', ok: true });
checkVocabulary();
warnDuplicateHeadings();

// Reconciliation directory of the router: differences for seed cases are a stop, the others are the finding
// "needs data migration" (data the new solution does not have). Seed = an identifier from the seed file among the
// values of `input`.
function countDifferences(kat, seedFile) {
  const abs = path.resolve(kat);
  const ids = seedFile ? new Set(fs.readFileSync(path.resolve(seedFile), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) : null;
  const values = v => v === null || v === undefined ? [] : typeof v === 'object' ? Object.values(v).flatMap(values) : [String(v)];
  const isSeed = e => !ids || values(e.input).some(v => ids.has(v));
  const files = fs.existsSync(abs) ? fs.readdirSync(abs).filter(f => f.endsWith('.jsonl')).sort() : [];
  const count = { seed: 0, poza_seedem: 0, nieczytelne: 0 };
  const pytania = {}, pierwsze = { seed: [], poza_seedem: [] };
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(abs, f), 'utf8').split('\n').filter(l => l.trim())) {
      let e;
      try { e = JSON.parse(line); } catch { count.nieczytelne++; continue; }
      const kind = isSeed(e) ? 'seed' : 'poza_seedem';
      count[kind]++;
      const q = e.question ?? '?';
      pytania[q] ??= { seed: 0, poza_seedem: 0 };
      pytania[q][kind]++;
      if (pierwsze[kind].length < 5) pierwsze[kind].push(`${q} ${JSON.stringify(e.input ?? {})}: ${e.diff ?? ''}`.trim());
    }
  }
  const ok = count.seed === 0 && count.nieczytelne === 0;
  const extra = `poza seedem: ${count.poza_seedem}${count.nieczytelne ? `, nieczytelnych linii: ${count.nieczytelne}` : ''}${ids ? '' : ' (bez --seed: każdy wpis liczony jako seed)'}`;
  const wynik = `${ok ? '✓ 0' : '✗'} różnic dla seedu${ok ? '' : `: ${count.seed}`}, ${extra}`;
  if (!ok) red = true;
  const co = opt.opis ?? `katalog różnic ${kat}`;
  appendGate(dir, { krok, typ: 'roznice', co, wynik, ok, ...count, pytania, pierwsze_seed: pierwsze.seed, pierwsze_poza_seedem: pierwsze.poza_seedem });
  console.log(`różnice ${co}: ${wynik}${files.length ? '' : ' — brak plików *.jsonl'}`);
  for (const [k, label] of [['seed', 'seed'], ['poza_seedem', 'poza seedem (wymaga migracji danych)']])
    if (pierwsze[k].length) console.log(`  ${label}:\n    ${pierwsze[k].join('\n    ')}`);
}

// A step replaces its section at the template placeholder; a second "## <same>" means it was appended instead.
// Only a warning: the gate stays green, the step fixes the specification before the commit.
function warnDuplicateHeadings() {
  let fenced = false;
  const seen = new Map();
  for (const line of readSpec(dir).text.split('\n')) {
    if (line.trimStart().startsWith('```')) { fenced = !fenced; continue; }
    if (fenced || !line.startsWith('## ')) continue;
    const h = line.trim();
    seen.set(h, (seen.get(h) ?? 0) + 1);
  }
  const dup = [...seen].filter(([, n]) => n > 1);
  if (dup.length) console.log(`⚠ specyfikacja.md: zdublowany nagłówek — ${dup.map(([h, n]) => `„${h}” ×${n}`).join(', ')} (sekcję kroku podmieniasz w miejscu placeholdera)`);
}

// Forbidden vocabulary grep: whole words, case-sensitive, fixed strings (forms like `GroupType.SITE` are literal).
function checkVocabulary() {
  const forms = (Array.isArray(front.zakazane) ? front.zakazane : []).filter(isSet);
  if (!forms.length) return;
  const entries = (Array.isArray(front.slownik_pliki) ? front.slownik_pliki : []).filter(isSet);
  const required = krok === 'swappable-dsl.3' || krok === 'swappable-dsl.4';
  if (!entries.length) {
    if (!required) return;
    red = true;
    appendGate(dir, { krok, typ: 'slownik', co: 'słownik zakazany', wynik: '✗ brak slownik_pliki w stan.json', ok: false, trafienia: 0, pierwsze: [] });
    console.log('słownik zakazany: ✗ brak slownik_pliki w stan.json (lista plików portu, DSL, scenariuszy, nowego modułu)');
    return;
  }
  // globs expanded relative to the repository root; legacy adapters and module CLAUDE.md are exempt
  const exempt = f => /^Legacy/.test(path.basename(f)) || path.basename(f) === 'CLAUDE.md';
  const files = [], missing = [];
  for (const e of entries) {
    const found = /[*?[]/.test(e) ? fs.globSync(e, { cwd: root }) : (fs.existsSync(path.join(root, e)) ? [e] : []);
    if (!found.length) missing.push(e);
    files.push(...found.filter(f => !exempt(f)));
  }
  let out = '';
  if (files.length) {
    const args = ['-rnwF', '-I', '--exclude=Legacy*', '--exclude=CLAUDE.md', ...forms.flatMap(f => ['-e', f]), '--', ...files];
    try { out = execFileSync('grep', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (e) { out = e.stdout ?? ''; } // exit 1 = no hits
  }
  const hits = out.split('\n').filter(Boolean);
  const ok = hits.length === 0 && files.length > 0;
  const wynik = !files.length ? '✗ żaden plik z slownik_pliki nie istnieje'
    : ok ? `✓ 0 trafień (${forms.length} form, ${files.length} ścieżek)` : `✗ trafienia w ${hits.length} liniach`;
  if (!ok) red = true;
  appendGate(dir, { krok, typ: 'slownik', co: 'słownik zakazany', wynik, ok, trafienia: hits.length, pierwsze: hits.slice(0, 10) });
  console.log(`słownik zakazany: ${wynik}`);
  if (hits.length) console.log(`  ${hits.slice(0, 10).join('\n  ')}${hits.length > 10 ? '\n  …' : ''}`);
  if (missing.length) console.log(`  brak plików dla: ${missing.join(', ')}`);
}

// rebuild the view first, so that specyfikacja.html (new in step 1) is on the SPECYFIKACJA list below
const html = build(dir);

// what this step changed (working tree vs last commit); legacy changes are listed for the whole branch (since baza)
const baza = isSet(front.baza) ? front.baza : null;
const c = changes(root, baza, specRel);
const branch = baza ? changes(root, baza, specRel, baza) : c;
const thisStep = new Set(c.legacy);
const reasons = new Set(tableRows(readSpec(dir).text, 'Odstępstwa (zmienione pliki legacy)').map(r => r[1].replace(/`/g, '')));
console.log(`\nZMIENIONE w legacy${baza ? ` (od bazy ${baza.slice(0, 8)}, ★ = ten krok)` : ''}:`);
for (const f of branch.legacy) {
  const noReason = [...reasons].some(r => f === r || (r.includes('/') && f.endsWith('/' + r))) ? '' : '   ← brak wpisu w „Odstępstwa”';
  console.log(`  ◆ ${f}${baza && thisStep.has(f) ? '  ★' : ''}${noReason}`);
}
if (!branch.legacy.length) console.log('  —');
// spec files added by this step (not in the last commit)
const specAdded = c.specyfikacja.filter(f => !git(root, 'ls-tree', 'HEAD', '--', f).trim());
if (specAdded.length) console.log(`SPECYFIKACJA: ${collapse(specAdded.map(f => path.relative(specRel, f))).join(', ')}`);
if (c.nasze.length) { console.log('ZMIENIONE nasze (z wcześniejszych kroków):'); for (const f of c.nasze) console.log(`  ~ ${f}`); }
console.log(`DODANE (${c.dodane.length}):`);
for (const f of collapse(c.dodane)) console.log(`  + ${f}`);
if (c.usuniete.length) { console.log('USUNIĘTE:'); for (const f of collapse(c.usuniete)) console.log(`  - ${f}`); }

// a directory with more than 5 files of the list is one line, e.g. "ekran/front/legacy/ (37 plików)"; order kept
function collapse(files) {
  const perDir = new Map();
  for (const f of files) { const d = path.dirname(f); perDir.set(d, (perDir.get(d) ?? 0) + 1); }
  const plural = n => n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? 'pliki' : 'plików';
  const out = [], shown = new Set();
  for (const f of files) {
    const d = path.dirname(f), n = perDir.get(d);
    if (n <= 5) out.push(f);
    else if (!shown.has(d)) { shown.add(d); out.push(`${d}/ (${n} ${plural(n)})`); }
  }
  return out;
}

console.log(`\nspecyfikacja: ${html}`);
process.exit(red ? 1 : 0);

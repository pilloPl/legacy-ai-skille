// Builds <katalog specyfikacji>/specyfikacja.html: the workflow drawing (steps, human, specification, code, commits),
// the step panels and the specification itself. Data: workflow.json, specyfikacja.md, stan.json, bramki.jsonl, zrodlo.md, git history.
//
//   node specyfikacja.mjs <katalog specyfikacji>
//   node specyfikacja.mjs --demo <dane.json> <wyjście.html>      (drawing from prepared data, no repository)
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readSpec, readState, readGates, repoRoot, git, changes } from './spec.mjs';

const workflow = () => JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'workflow.json'), 'utf8'));
const template = () => fs.readFileSync(path.join(SKILL_DIR, 'widok', 'specyfikacja.html'), 'utf8');

export function collect(dir) {
  const { text, body } = readSpec(dir);
  const stan = readState(dir);
  const root = repoRoot(dir);
  const specRel = path.relative(root, path.resolve(dir)) + '/';
  const read = n => fs.existsSync(path.join(dir, n)) ? fs.readFileSync(path.join(dir, n), 'utf8') : '';
  const commits = [];
  const log = git(root, 'log', '--reverse', '--format=%H%x09%h%x09%ad%x09%s', '--date=format:%Y-%m-%d %H:%M',
    `--grep=^parallel-models(${stan.obszar})`).trim();
  for (const line of log ? log.split('\n') : []) {
    const [full, hash, date, subject] = line.split('\t');
    const krok = subject.match(/^parallel-models\([^)]*\): (\S+)/)?.[1] ?? '';
    const ch = changes(root, stan.baza, specRel, `${full}^`, full);
    commits.push({ hash, full, date, subject, krok, ...ch });
  }
  // link to the commit on GitHub, when origin is a GitHub repository (ssh or https)
  let repoUrl = null;
  try { const u = git(root, "remote", "get-url", "origin").trim();
    const m = u.match(/github\.com[:/](.+?)(\.git)?$/); if (m) repoUrl = `https://github.com/${m[1]}`; } catch {}
  const pending = changes(root, stan.baza, specRel);
  // published artifacts: every file in the specification folder, with the step whose commit added it
  const artefakty = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name !== 'specyfikacja.html' && !e.name.startsWith('.')) {
      const rel = path.relative(dir, p);
      const added = git(root, 'log', '--diff-filter=A', '--format=%s', '--', path.relative(root, p)).trim().split('\n').pop() || '';
      const rozmiar = fs.statSync(p).size;
      const tresc = /\.(md|json|jsonl|txt|csv|ya?ml)$/.test(e.name) && rozmiar < 300000 ? fs.readFileSync(p, 'utf8') : undefined;
      artefakty.push({ plik: rel, krok: added.match(/^parallel-models\([^)]*\): (\S+)/)?.[1] ?? '', rozmiar, tresc });
    } } };
  walk(dir);
  return {
    artefakty,
    raw: text, stan, body, zrodlo: read('zrodlo.md'), miejsca: read('miejsca.md'), bramki: readGates(dir),
    commits, pending, repoUrl, built: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
}

function render(data, out) {
  const json = JSON.stringify({ workflow: workflow(), ...data }).replace(/</g, '\\u003c');
  fs.writeFileSync(out, template().replace('/*DANE*/', json));
  return out;
}

export function build(dir) { return render(collect(dir), path.join(dir, 'specyfikacja.html')); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const [a, b, c] = process.argv.slice(2);
  if (a === '--demo') console.log(render(JSON.parse(fs.readFileSync(b, 'utf8')), c));
  else if (a) console.log(build(a));
  else { console.error('użycie: specyfikacja.mjs <katalog specyfikacji> | --demo <dane.json> <wyjście.html>'); process.exit(2); }
}

// The specification folder: specyfikacja.md (content, markdown tables), stan.json (run state: step, base, commands),
// bramki.jsonl (one line per gate event: tests, human decision). Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SKILL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export function specPath(dir) { return path.join(dir, 'specyfikacja.md'); }

export function readSpec(dir) {
  const text = fs.readFileSync(specPath(dir), 'utf8');
  return { text, body: text };
}

// run state, read at the start of every step instead of the whole specification
export function readState(dir) {
  const p = path.join(dir, 'stan.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

export function setState(dir, patch) {
  const s = { ...readState(dir), ...patch };
  fs.writeFileSync(path.join(dir, 'stan.json'), JSON.stringify(s, null, 2) + '\n');
  return s;
}

// gate log: append-only JSON Lines; {data, krok, typ: 'testy'|'czlowiek', ...}
export function appendGate(dir, entry) {
  fs.appendFileSync(path.join(dir, 'bramki.jsonl'), JSON.stringify({ data: now(), ...entry }) + '\n');
}

export function readGates(dir) {
  const p = path.join(dir, 'bramki.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// rows of the first table under "## <heading>"
export function tableRows(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim() === `## ${heading}`);
  if (start < 0) return [];
  const rows = [];
  let seenTable = false;
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    const l = lines[i].trim();
    if (!l.startsWith('|')) { if (seenTable) break; continue; }
    seenTable = true;
    if (/^\|\s*-/.test(l)) continue;
    rows.push(l.slice(1, -1).split('|').map(c => c.trim()));
  }
  return rows.slice(1); // without the header row
}


// core.quotepath=off: paths with non-ASCII letters (e.g. Polish) come out as they are, not as "\305\202" escapes
export function git(cwd, ...args) {
  try { return execFileSync('git', ['-c', 'core.quotepath=off', ...args], { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
}

export function repoRoot(dir) { return git(dir, 'rev-parse', '--show-toplevel').trim() || path.resolve(dir); }

export function now() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// files changed since `base` (default: working tree vs HEAD), split into legacy changed / ours changed / added
export function changes(root, baza, specRel, fromRef = 'HEAD', toRef = null) {
  const lines = toRef
    ? git(root, 'diff', '--name-status', '--no-renames', fromRef, toRef).trim().split('\n')
    : [...git(root, 'diff', '--name-status', '--no-renames', fromRef).trim().split('\n'),
       ...git(root, 'ls-files', '--others', '--exclude-standard').trim().split('\n').filter(Boolean).map(f => `A\t${f}`)];
  const out = { legacy: [], nasze: [], dodane: [], specyfikacja: [], usuniete: [] };
  const seen = new Set();
  for (const l of lines.filter(Boolean)) {
    const [st, file] = l.split('\t');
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (specRel && file.startsWith(specRel)) { out.specyfikacja.push(file); continue; }
    const inBase = !!baza && git(root, 'ls-tree', baza, '--', file).trim() !== '';
    if (st === 'D') out.usuniete.push(file);
    else if (st === 'A' || !inBase) (st === 'A' ? out.dodane : out.nasze).push(file);
    else out.legacy.push(file);
  }
  return out;
}

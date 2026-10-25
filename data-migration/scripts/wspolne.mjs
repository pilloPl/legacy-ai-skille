// The migration folder: migracja.md (scope, dictionary of two languages, notes; the line `SQL: `…`` says how to
// query the old data), decyzje.json (decision log), problemy.json (what the new model cannot say directly, difference
// groups), liczby.jsonl (one line per measured round: answers before/after the transfer, the independent control).
// No run state: what was done is visible from these files. Node 22, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const SKILL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export function readSpec(dir) {
  const p = path.join(dir, 'migracja.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

// the command that reads one query from stdin and prints the result: env MIGRACJA_SQL or the line `SQL: `…`` in migracja.md
export function sqlCommand(dir) {
  if (process.env.MIGRACJA_SQL) return process.env.MIGRACJA_SQL;
  return readSpec(dir).match(/^SQL:\s*`(.+)`\s*$/m)?.[1] ?? '';
}

export function readJson(dir, name, empty) {
  const p = path.join(dir, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : empty;
}

export function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + '\n');
}

export const readStdin = () => fs.readFileSync(0, 'utf8');

// --opt value pairs after positional arguments
export function options(args) {
  const pos = [], opt = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { const k = args[i].slice(2); const v = args[i + 1]; if (v === undefined || v.startsWith('--')) opt[k] = true; else { opt[k] = v; i++; } }
    else pos.push(args[i]);
  }
  return { pos, opt };
}

// measured rounds: append-only JSON Lines {data, runda, typ: 'roznice'|'kontrola', ...}
export function appendNumbers(dir, entry) {
  fs.appendFileSync(path.join(dir, 'liczby.jsonl'), JSON.stringify({ data: now(), ...entry }) + '\n');
}

export function readNumbers(dir) {
  const p = path.join(dir, 'liczby.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function git(cwd, ...args) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch { return ''; }
}

export function repoRoot(dir) { return git(dir, 'rev-parse', '--show-toplevel').trim() || path.resolve(dir); }

export function now() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

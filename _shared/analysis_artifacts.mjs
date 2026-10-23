// Small, dependency-free provenance helpers shared by calibration and graph lifecycle.
// Node 22 port of analysis_artifacts.py (same files, same checks); standard library only.
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function read(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function git(repo, ...args) {
  const p = spawnSync('git', ['-C', String(repo), ...args], { encoding: 'utf8', maxBuffer: 1 << 30 });
  return p.status === 0 ? p.stdout.replace(/\n+$/, '') : null;
}

const expandUser = p => (p === '~' || p.startsWith('~/') || p.startsWith('~\\') ? path.join(os.homedir(), p.slice(1)) : p);

// Like Path.resolve(): absolute, symlinks resolved for the part that exists, the rest appended.
export function resolvePath(p) {
  let rest = [], cur = path.resolve(expandUser(String(p)));
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) break;
    rest.unshift(path.basename(cur)); cur = parent;
  }
  return path.join(fs.existsSync(cur) ? fs.realpathSync.native(cur) : cur, ...rest);
}

const isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isInside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out); else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
}

export function sourceState(repo) {
  repo = resolvePath(repo);
  const listed = git(repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard');
  let rels;
  if (listed === null) { rels = []; walk(repo, repo, rels); } else rels = [...new Set(listed.split('\0'))].filter(Boolean);
  const files = {};
  for (const rel of rels.sort()) {
    if (rel.startsWith('.codegraph/') || rel.split('/').includes('__pycache__')) continue;
    const full = path.join(repo, ...rel.split('/'));
    files[rel] = isFile(full) ? digest(full) : null;
  }
  return { repo, revision: git(repo, 'rev-parse', 'HEAD'), files };
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const today = () => new Date().toISOString().slice(0, 10);

export function newRun(workspace, category, repo) {
  workspace = resolvePath(workspace); repo = resolvePath(repo);
  if (workspace === repo) throw new Error('Use a workspace directory, not the repository root (default: <repo>/analiza/).');
  fs.mkdirSync(workspace, { recursive: true });
  if (isInside(workspace, repo) && !fs.existsSync(path.join(workspace, '.gitignore')))
    fs.writeFileSync(path.join(workspace, '.gitignore'), '*\n'); // workspace inside the repo stays out of git
  const marker = path.join(workspace, 'analysis-repository.json');
  if (fs.existsSync(marker) && read(marker).repo !== repo) throw new Error('Workspace belongs to another repository.');
  const old = path.join(workspace, 'system-map.json');
  if (fs.existsSync(old) && resolvePath(read(old).repo) !== repo) throw new Error('Legacy workspace belongs to another repository.');
  write(marker, { repo });
  const run = path.join(workspace, category, stamp() + '-' + randomUUID().replace(/-/g, '').slice(0, 8));
  fs.mkdirSync(run, { recursive: true });
  return run;
}

export function register(workspace, artifactId, kind, location, consumer) {
  const file = path.join(workspace, 'evidence-plan.json');
  const plan = fs.existsSync(file) ? read(file) : { $schema_version: 'evidence-plan/1.0', artifacts: [], gaps: [] };
  (plan.artifacts ??= []).push({ id: artifactId, kind, status: 'found', location: resolvePath(location),
    treatment: 'read-fully', closes_gaps: [], added_by: consumer, added_on: today() });
  (plan.log ??= []).push({ date: today(), by: consumer, change: 'Registered ' + artifactId + '; no gaps automatically closed.' });
  write(file, plan);
}

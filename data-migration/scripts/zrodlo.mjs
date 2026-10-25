// Assembles the source of a migration: one folder (<katalog>/zrodlo/) with copies of what is known about the new model,
// the re-wired places and the pains of the old model, plus README.md (table of contents, reading order). Copies,
// never edits: a section is cut from its heading to the next heading of the same or higher level.
//
//   node zrodlo.mjs <katalog migracji> "<ścieżka>[#<nagłówek>]=<po co>" ... [--tytul "…" --sql "<komenda czytająca SQL ze stdin>"]
// Gdy nie ma migracja.md, zakłada go: tytuł, linia SQL i puste sekcje.
//     e.g. "specyfikacje/akceptacja-kart/miejsca.md=przepięte miejsca"
//          "analiza/archetypy.md#Pogłębienie: party=Co i jak, bolączki z adresami"
//          "campsite-party/src/main/java=kod nowego modelu"      (a folder: copied whole, without build output)
// Paths are relative to the repository root. Running it again replaces zrodlo/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot, options } from './wspolne.mjs';
import { build } from './widok.mjs';

const { pos: [dir, ...wpisy], opt } = options(process.argv.slice(2));
if (!dir || !wpisy.length) { console.error('użycie: zrodlo.mjs <katalog migracji> "<ścieżka>[#<nagłówek>]=<po co>" ...'); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
const root = repoRoot(dir);
const specFile = path.join(dir, 'migracja.md');
if (!fs.existsSync(specFile)) {
  const run = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  fs.writeFileSync(specFile, `# ${opt.tytul ?? `Migracja: ${path.basename(path.resolve(dir))}`}\n\n` +
    `SQL: \`${typeof opt.sql === 'string' ? opt.sql : '<komenda, która czyta jedno zapytanie ze stdin>'}\`\n` +
    `Start: ${run('rev-parse', '--abbrev-ref', 'HEAD')} @ ${run('rev-parse', '--short', 'HEAD')}\n\n` +
    ['Zakres', 'Słownik dwóch języków', 'Translator', 'Kontrola', 'Notatki'].map(h => `## ${h}\n\n`).join(''));
}
const cel = path.join(dir, 'zrodlo');
fs.rmSync(cel, { recursive: true, force: true });
fs.mkdirSync(cel, { recursive: true });
const SKIP = new Set(['target', 'build', 'node_modules', '.git', 'dist', 'out']);

function section(text, heading) {
  const lines = text.split('\n');
  const i = lines.findIndex(l => /^#{1,6} /.test(l) && l.replace(/^#+\s*/, '').trim() === heading.trim());
  if (i < 0) return null;
  const lvl = lines[i].match(/^#+/)[0].length;
  let j = i + 1;
  while (j < lines.length && !(lines[j].match(/^#+ /) && lines[j].match(/^#+/)[0].length <= lvl)) j++;
  return lines.slice(i, j).join('\n').trimEnd() + '\n';
}
function copyDir(from, to) {
  let n = 0;
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); n += copyDir(a, b); }
    else { fs.copyFileSync(a, b); n++; }
  }
  return n;
}

const spis = [], braki = [];
for (const w of wpisy) {
  const [lewa, ...po] = w.split('=');
  const [rel, naglowek] = lewa.split('#');
  const poCo = po.join('=').trim();
  const zrodlo = path.join(root, rel);
  if (!fs.existsSync(zrodlo)) { braki.push(rel); continue; }
  const nazwa = rel.replace(/[\\/]/g, '__') + (naglowek ? `__${naglowek.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.md` : '');
  if (fs.statSync(zrodlo).isDirectory()) {
    fs.mkdirSync(path.join(cel, nazwa), { recursive: true });
    const n = copyDir(zrodlo, path.join(cel, nazwa));
    spis.push({ plik: nazwa + '/', skad: rel, po_co: poCo, rozmiar: `${n} plików` });
  } else {
    const text = fs.readFileSync(zrodlo, 'utf8');
    const out = naglowek ? section(text, naglowek) : text;
    if (out === null) { braki.push(`${rel} § ${naglowek}`); continue; }
    fs.writeFileSync(path.join(cel, nazwa), out);
    spis.push({ plik: nazwa, skad: rel + (naglowek ? ` § ${naglowek}` : ''), po_co: poCo, rozmiar: `${Math.round(out.length / 1024)} KB` });
  }
}
const readme = `# Źródło migracji\n\nKopie bez zmian, w kolejności czytania. Skąd: ścieżka w repo w chwili złożenia.\n\n| # | Plik | Skąd | Po co | Rozmiar |\n|---|---|---|---|---|\n${spis.map((s, i) => `| ${i + 1} | [${s.plik}](${s.plik}) | \`${s.skad}\` | ${s.po_co} | ${s.rozmiar} |`).join('\n')}\n${braki.length ? `\n**Brak:** ${braki.map(b => `\`${b}\``).join(', ')}\n` : ''}`;
fs.writeFileSync(path.join(cel, 'README.md'), readme);
build(dir);
console.log(readme);
process.exit(braki.length ? 1 : 0);

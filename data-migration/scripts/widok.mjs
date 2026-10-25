// Builds <katalog>/migracja.html: numbers (before / after the transfer, control), the funnel with what each stage
// left, decisions with evidence, problems, transfer report, files. Read-only view: the tool decides, the human reads.
// Data: migracja.md, decyzje.json, problemy.json, liczby.jsonl, raport-przeniesienia.json, roznice/, kontrola/.
//
//   node widok.mjs <katalog>
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR, readSpec, readJson, readNumbers } from './wspolne.mjs';

export function collect(dir) {
  const artefakty = [];
  const walk = d => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'zrodlo' && e.name !== 'aplikacja') walk(p); }
    else if (e.name !== 'migracja.html' && !e.name.startsWith('.')) {
      const rel = path.relative(dir, p), rozmiar = fs.statSync(p).size;
      artefakty.push({ plik: rel, rozmiar, tresc: /\.(md|json|jsonl|txt|csv|sql)$/.test(e.name) && rozmiar < 200000 ? fs.readFileSync(p, 'utf8') : undefined });
    } } };
  walk(dir);
  const zr = path.join(dir, 'zrodlo', 'README.md');
  return {
    obszar: path.basename(path.resolve(dir)), md: readSpec(dir), decyzje: readJson(dir, 'decyzje.json', { decyzje: [] }).decyzje,
    problemy: readJson(dir, 'problemy.json', { problemy: [] }).problemy, raport: readJson(dir, 'raport-przeniesienia.json', null),
    liczby: readNumbers(dir), zrodlo: fs.existsSync(zr) ? fs.readFileSync(zr, 'utf8') : '', artefakty,
    built: new Date().toISOString().slice(0, 16).replace('T', ' '),
  };
}

export function build(dir) {
  const json = JSON.stringify(collect(dir)).replace(/</g, '\\u003c');
  const out = path.join(dir, 'migracja.html');
  fs.writeFileSync(out, fs.readFileSync(path.join(SKILL_DIR, 'widok', 'migracja.html'), 'utf8').replace('/*DANE*/', json));
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.argv[2]) { console.error('użycie: widok.mjs <katalog>'); process.exit(2); }
  console.log(build(process.argv[2]));
}

// Difference file of the application → groups. Reads the JSON Lines the application writes when both models answer
// the same question (differences and „not known to the new model”), keeps lines from --od on, groups them by question
// and by the reason with identifiers blanked out (numbers, codes in quotes), prints the groups with counts and
// examples, writes roznice/grupy-<n>.json and appends the round to liczby.jsonl.
//
//   node roznice.mjs <katalog migracji> --runda "przed|po|po-2…" [--od "2026-10-24T18:00:00Z"] [--liczby "zgodne=120,rozne=4,nieznam=0"]
//        [--pliki <katalog z plikami różnic aplikacji>]   (domyślnie <katalog migracji>/roznice/aplikacja)
//        [--klucz question,login]                          (pola, które nazywają pytanie; domyślnie question)
// --od w UTC, z „Z”: aplikacja zapisuje czas w UTC. --liczby: liczniki z ekranu albo endpointu wajchy.
import fs from 'node:fs';
import path from 'node:path';
import { appendNumbers, options } from './wspolne.mjs';
import { build } from './widok.mjs';

const { pos: [dir], opt } = options(process.argv.slice(2));
if (!dir || !opt.runda) { console.error('użycie: roznice.mjs <katalog migracji> --runda przed|po [--od czas] [--liczby "zgodne=…,rozne=…,nieznam=…"] [--pliki katalog]'); process.exit(2); }
const src = path.resolve(opt.pliki ?? path.join(dir, 'roznice', 'aplikacja'));
if (!fs.existsSync(src)) fs.mkdirSync(src, { recursive: true });   // no file yet = nothing reported
const klucz = opt.klucz ? String(opt.klucz).split(',') : ['question'];
if (opt.od && !/Z|[+-]\d\d:?\d\d$/.test(opt.od)) { console.error('--od podaj ze strefą, np. 2026-10-24T18:00:00Z (aplikacja pisze czas w UTC)'); process.exit(2); }
const od = opt.od ? new Date(opt.od).getTime() : 0;

// identifiers out, so that one cause gives one group
const norm = s => String(s ?? '').replace(/"[^"]*"/g, '"…"').replace(/\b[A-Z]{1,6}[-_*][\w-]*\d[\w-]*/g, '#').replace(/\d{2,}/g, '#').slice(0, 200);
const groups = new Map();
let n = 0;
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.jsonl')).sort()) {
  for (const line of fs.readFileSync(path.join(src, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    const at = Date.parse(e.at ?? e.data ?? '') || 0;
    if (at < od) continue;
    const rodzaj = /unknown|nie-?znam/i.test(f) || e.party === 'unknown' ? 'nie znam' : 'różnica';
    const pytanie = klucz.map(k => e[k]).filter(Boolean).join(' · ') || '(pytanie)';
    const przyczyna = rodzaj === 'nie znam' ? norm(e.reason) : norm(e.diff ?? JSON.stringify([e.legacy, e.party]));
    const key = `${rodzaj}|${pytanie}|${przyczyna}`;
    const g = groups.get(key) ?? { rodzaj, pytanie, przyczyna, ile: 0, przyklady: [] };
    g.ile++;
    if (g.przyklady.length < 5) g.przyklady.push({ input: e.input, ...(rodzaj === 'nie znam' ? { reason: e.reason } : { legacy: e.legacy, party: e.party, diff: e.diff }) });
    groups.set(key, g);
    n++;
  }
}
const lista = [...groups.values()].sort((a, b) => b.ile - a.ile);
const liczby = Object.fromEntries((opt.liczby ?? '').split(',').filter(Boolean).map(p => p.split('=')).map(([k, v]) => [k.trim(), Number(v)]));
const wyj = path.join(dir, 'roznice');
fs.mkdirSync(wyj, { recursive: true });
const nr = fs.readdirSync(wyj).filter(f => /^grupy-\d+\.json$/.test(f)).length + 1;
const plik = path.join(wyj, `grupy-${nr}.json`);
fs.writeFileSync(plik, JSON.stringify({ runda: opt.runda, od: opt.od ?? null, liczby, wpisy: n, grupy: lista }, null, 2) + '\n');
for (const g of lista) console.log(`${String(g.ile).padStart(6)}  [${g.rodzaj}] ${g.pytanie}: ${g.przyczyna}\n        np. ${JSON.stringify(g.przyklady[0]).slice(0, 220)}`);
const nz = lista.filter(g => g.rodzaj === 'nie znam').reduce((s, g) => s + g.ile, 0), rz = n - nz;
appendNumbers(dir, { typ: 'roznice', runda: opt.runda, liczby, roznice: rz, nie_znam: nz, grupy: lista.length, plik: path.relative(dir, plik) });
build(dir);
console.log(`\n${opt.runda}: ${n} wpisów, ${lista.length} grup (różnice ${rz}, nie znam ${nz}) → ${plik}`);

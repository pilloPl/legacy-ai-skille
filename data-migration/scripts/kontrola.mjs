// Independent control: compares the expected answers (computed straight from the old tables, without the translator)
// with the answers of the new model after the transfer. Both files are JSON Lines {"name","answer"}. Lists are sets:
// sorted the same way on both sides (database and code collations differ). Appends the result to liczby.jsonl.
//
//   node kontrola.mjs <katalog migracji> <oczekiwane.jsonl> <nowy.jsonl> [--wyjasnione "<regex nazwy>=D14" ...]
// --wyjasnione: differences of these questions are intended (a decision says why, e.g. outside the portion).
// Exit code 1 when a difference has no explanation.
import fs from 'node:fs';
import path from 'node:path';
import { appendNumbers } from './wspolne.mjs';
import { build } from './widok.mjs';

const args = process.argv.slice(2);
const wyjasnione = [];
for (let i = args.indexOf('--wyjasnione'); i >= 0; i = args.indexOf('--wyjasnione')) {
  const [re, dec] = args.splice(i, 2)[1].split(/=(?=[^=]*$)/);
  wyjasnione.push({ re: new RegExp(re), dec });
}
const [dir, fa, fb] = args;
if (!dir || !fa || !fb) { console.error('użycie: kontrola.mjs <katalog> <oczekiwane.jsonl> <nowy.jsonl> [--wyjasnione "<regex>=Dxx"]'); process.exit(2); }
const norm = v => Array.isArray(v) ? v.map(norm).sort((x, y) => JSON.stringify(x) < JSON.stringify(y) ? -1 : 1)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, norm(v[k])])) : v;
const read = f => new Map(fs.readFileSync(path.resolve(f), 'utf8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l)).map(r => [r.name, norm(r.answer)]));
const [a, b] = [fa, fb].map(read);
let same = 0, diff = 0;
const notSame = [], poDecyzji = {};
for (const name of new Set([...a.keys(), ...b.keys()])) {
  if (a.has(name) && b.has(name) && JSON.stringify(a.get(name)) === JSON.stringify(b.get(name))) { same++; continue; }
  const w = wyjasnione.find(x => x.re.test(name));
  if (w) { poDecyzji[w.dec] = (poDecyzji[w.dec] ?? 0) + 1; continue; }
  diff++;
  if (notSame.length < 20) notSame.push(`≠ ${name}: ${JSON.stringify(a.get(name))} | ${JSON.stringify(b.get(name))}`);
}
if (notSame.length) console.log(notSame.join('\n') + (diff > notSame.length ? `\n… (${diff} różnych)` : ''));
const total = same + diff + Object.values(poDecyzji).reduce((s, n) => s + n, 0);
const ok = diff === 0 && same > 0;
appendNumbers(dir, { typ: 'kontrola', runda: 'kontrola', ok, takie_same: same, razem: total, rozne: diff, wyjasnione: poDecyzji,
  pliki: [fa, fb].map(f => path.relative(dir, path.resolve(f))) });
build(dir);
const wyj = Object.entries(poDecyzji).map(([d, n]) => `${n} wyjaśnione ${d}`).join(', ');
console.log(`kontrola: ${same}/${total} takie same${wyj ? `, ${wyj}` : ''}${diff ? `, różnych bez wyjaśnienia: ${diff}` : ''}`);
process.exit(ok ? 0 : 1);

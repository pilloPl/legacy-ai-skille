// End-of-run check of a migration folder. Deterministic, read-only: says what is still missing before the run can be
// called done — sections of migracja.md, decisions without evidence or still hipoteza, confidence above 89 without
// a query, unexplained problems, skipped rows without a decision, missing rounds (before / after / control).
// Rebuilds migracja.html. Exit code 1 when something is missing.
//
//   node sprawdz.mjs <katalog migracji>
import { readSpec, readJson, readNumbers } from './wspolne.mjs';
import { readDecisions } from './decyzja.mjs';
import { readProblems } from './problem.mjs';
import { build } from './widok.mjs';

const dir = process.argv[2];
if (!dir) { console.error('użycie: sprawdz.mjs <katalog migracji>'); process.exit(2); }
let red = false;
const check = (co, ok, wynik) => { if (!ok) red = true; console.log(`${ok ? '✓' : '✗'} ${co}: ${wynik}`); };
const spec = readSpec(dir);
const { decyzje } = readDecisions(dir);
const { problemy } = readProblems(dir);
const raport = readJson(dir, 'raport-przeniesienia.json', null);
const liczby = readNumbers(dir);
const ids = a => a.map(x => x.id).join(', ');

const brakSekcji = ['Zakres', 'Słownik dwóch języków', 'Translator', 'Kontrola'].filter(h => !new RegExp(`^## ${h}\\s*\\n+(?!## )\\S`, 'm').test(spec));
check('migracja.md', !brakSekcji.length, brakSekcji.length ? `puste albo brak: ${brakSekcji.join(', ')}` : 'zakres, słownik, translator, kontrola');
const hip = decyzje.filter(d => d.status === 'hipoteza');
check('decyzje rozstrzygnięte', decyzje.length > 0 && !hip.length, !decyzje.length ? 'brak decyzji' : hip.length ? `hipotezy: ${ids(hip)}` : `${decyzje.length} decyzji`);
const bezDowodu = decyzje.filter(d => d.status === 'przyjęta' && !d.zapytania?.length && !d.bez_zapytania && !/człowiek|przepis/.test(d.podstawa));
check('przyjęte z dowodem w danych', !bezDowodu.length, bezDowodu.length ? `bez zapytania: ${ids(bezDowodu)}` : 'tak');
const zaWysoko = decyzje.filter(d => d.pewnosc > 89 && !d.zapytania?.length);
check('pewność > 89 tylko z danymi', !zaWysoko.length, zaWysoko.length ? ids(zaWysoko) : 'tak');
const otwarte = problemy.filter(p => !p.wyjasnienie || p.wyjasnienie.jak === 'do kontroli');
check('problemy wyjaśnione', !otwarte.length, otwarte.length ? `niewyjaśnione: ${ids(otwarte)}` : `${problemy.length} problemów (otwarte z opisem: ${problemy.filter(p => p.wyjasnienie?.jak === 'otwarty').length})`);
if (!raport) check('raport przeniesienia', false, 'brak raport-przeniesienia.json');
else {
  const pom = raport.pominiete ?? [];
  const bez = pom.filter(p => !p.powod || !p.decyzja);
  check('raport przeniesienia', !bez.length, `przeniesione: ${Object.entries(raport.przeniesione ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}; pominięte: ${pom.reduce((s, p) => s + (p.ile ?? 0), 0)}${bez.length ? `; bez powodu albo decyzji: ${bez.length}` : ''}`);
}
const rundy = liczby.filter(l => l.typ === 'roznice');
const przed = rundy.find(l => l.runda === 'przed'), po = rundy.filter(l => l.runda !== 'przed').at(-1), kontrola = liczby.filter(l => l.typ === 'kontrola').at(-1);
check('runda przed przeniesieniem', !!przed, przed ? `różnice ${przed.roznice}, nie znam ${przed.nie_znam}` : 'brak (roznice.mjs --runda przed)');
check('runda po przeniesieniu', !!po, po ? `różnice ${po.roznice}, nie znam ${po.nie_znam}` : 'brak (roznice.mjs --runda po)');
check('kontrola niezależna', !!kontrola?.ok, kontrola ? `${kontrola.takie_same}/${kontrola.razem} takie same${kontrola.rozne ? `, bez wyjaśnienia ${kontrola.rozne}` : ''}` : 'brak (kontrola.mjs)');
console.log(`\nwidok: ${build(dir)}`);
process.exit(red ? 1 : 0);

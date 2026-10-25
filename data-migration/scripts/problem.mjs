// Problems of a migration: problemy.json in the migration folder. A problem is something the data shows and the new
// model cannot say directly, or a group of differences / „not known” answers from the application, or a group of
// skipped rows. Every problem ends explained: by a decision (świadoma różnica, kompromis), by a translator fix, or
// stays open (otwarty) with what is missing.
//
//   node problem.mjs <katalog> nowy  < {"rodzaj","opis","ile"?,"przyklady"?,"zrodlo"?}
//        rodzaj: układ (nietypowy układ danych) | różnica | nie znam | pominięte | niedostępne (pytania nie da się zadać żadnym wejściem) | kontrola
//   node problem.mjs <katalog> wyjasnij <id> --decyzja D07 | --poprawka "co zmienione w translatorze" | --otwarty "czego brakuje"
//                                         | --do-kontroli ["…"]   (pytanie niedostępne w aplikacji: sprawdzi kontrola)
//                                         | --sprawdzone "wynik kontroli"   (po kontroli: pytania niedostępne sprawdzone na starych tabelach)
//   node problem.mjs <katalog> ile <id> <liczba>            (nowa liczność po kolejnym przebiegu)
//   node problem.mjs <katalog> lista
import { readJson, writeJson, readStdin, options, now } from './wspolne.mjs';
import { build } from './widok.mjs';

export const RODZAJE = ['układ', 'różnica', 'nie znam', 'pominięte', 'niedostępne', 'kontrola'];
const PLIK = 'problemy.json';
export const readProblems = dir => readJson(dir, PLIK, { problemy: [] });
function fail(msg) { console.error(msg); process.exit(2); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pos: [dir, cmd, ...args], opt } = options(process.argv.slice(2));
  if (!dir || !cmd) fail('użycie: problem.mjs <katalog> nowy|wyjasnij|ile|lista …');
  const log = readProblems(dir);
  const byId = id => log.problemy.find(p => p.id === id) ?? fail(`nie ma problemu ${id}`);
  const save = () => { writeJson(dir, PLIK, log); build(dir); };
  if (cmd === 'nowy') {
    const p = JSON.parse(readStdin());
    if (!RODZAJE.includes(p.rodzaj)) fail(`rodzaj spoza listy: ${RODZAJE.join(', ')}`);
    if (!p.opis) fail('nowy: brak opisu');
    const id = `P${String(log.problemy.length + 1).padStart(2, '0')}`;
    log.problemy.push({ id, data: now(), etap: p.etap ?? p.krok ?? '', rodzaj: p.rodzaj, opis: p.opis, ile: p.ile ?? null,
      przyklady: p.przyklady ?? [], zrodlo: p.zrodlo ?? '', wyjasnienie: null, historia: p.ile != null ? [{ data: now(), ile: p.ile }] : [] });
    save();
    console.log(`${id} [${p.rodzaj}] ${p.opis}${p.ile != null ? ` (${p.ile})` : ''}`);
  } else if (cmd === 'wyjasnij') {
    const p = byId(args[0]);
    if (opt.decyzja) p.wyjasnienie = { jak: 'decyzja', decyzja: opt.decyzja, data: now() };
    else if (opt.poprawka) p.wyjasnienie = { jak: 'poprawka', opis: opt.poprawka, data: now() };
    else if (opt.otwarty) p.wyjasnienie = { jak: 'otwarty', opis: opt.otwarty, data: now() };
    else if (opt.sprawdzone) p.wyjasnienie = { jak: 'sprawdzone', opis: opt.sprawdzone, data: now() };
    else if (opt['do-kontroli']) p.wyjasnienie = { jak: 'do kontroli', opis: opt['do-kontroli'] === true ? '' : opt['do-kontroli'], data: now() };
    else fail('wyjasnij: --decyzja <id> | --poprawka "…" | --otwarty "…" | --do-kontroli ["…"] | --sprawdzone "…"');
    save();
    console.log(`${p.id}: ${p.wyjasnienie.jak}`);
  } else if (cmd === 'ile') {
    const p = byId(args[0]);
    p.ile = Number(args[1]);
    p.historia.push({ data: now(), ile: p.ile });
    save();
    console.log(`${p.id}: ${p.ile}`);
  } else if (cmd === 'lista') {
    for (const p of log.problemy) console.log(`${p.id} [${p.rodzaj}${p.ile != null ? `, ${p.ile}` : ''}] ${p.opis} → ${p.wyjasnienie ? p.wyjasnienie.jak + (p.wyjasnienie.decyzja ? ' ' + p.wyjasnienie.decyzja : '') : 'NIEWYJAŚNIONY'}`);
  } else fail(`nieznane polecenie: ${cmd}`);
}

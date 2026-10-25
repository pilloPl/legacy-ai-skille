// Decision log of a migration: decyzje.json in the migration folder. Every decision: what it concerns, how it looks in
// the old model and in the new one, the decision and why, the source (file:line), the basis (kod / dane / przepis /
// człowiek), confidence %, queries with their result, status and history. The tool decides; the human reads the log
// in migracja.html.
//
//   node decyzja.mjs <katalog> nowa            < {"obszar","stary","nowy","decyzja","dlaczego","zrodlo","podstawa","pewnosc"?,"status"?,"warianty"?}
//   node decyzja.mjs <katalog> status <id> <status> [--pewnosc N] [--uwagi "…"] [--podstawa "…"] [--zastepuje-ja D12]
//   node decyzja.mjs <katalog> zapytanie <id>  < {"sql","cel","wynik"}         (sql.mjs --decyzja robi to samo)
//   node decyzja.mjs <katalog> dowod <id> --z <inna id>                       (te same zapytania co w innej decyzji)
//   node decyzja.mjs <katalog> bez-zapytania <id> "dlaczego danych nie da się zapytać"   (np. decyzja o celu trwałym)
//   node decyzja.mjs <katalog> wczytaj <plik.json>                            (decyzje z wcześniejszego mapowania)
//   node decyzja.mjs <katalog> lista [słowo]
//
// Rules the script keeps: confidence above 89 needs a query with a result (data, not only code); a changed decision
// is never deleted, only gets a new status (history stays); statuses: hipoteza → przyjęta | odrzucona | zastąpiona.
// Loaded decisions start as hipoteza with at most 89%: they were checked on other data, so they are checked again.
import { readJson, writeJson, readStdin, options, now } from './wspolne.mjs';
import { build } from './widok.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const STATUSY = ['hipoteza', 'przyjęta', 'odrzucona', 'zastąpiona'];
const PLIK = 'decyzje.json';
const pusty = () => ({
  _skala_pewnosci: '90–100: potwierdzone w danych (i w kodzie); 60–89: z kodu albo dokumentacji; 0–59: heurystyka, zgadywanie',
  decyzje: [],
});

export const readDecisions = dir => readJson(dir, PLIK, pusty());

function fail(msg) { console.error(msg); process.exit(2); }

export function addQuery(dir, id, q) {
  const log = readDecisions(dir);
  const d = log.decyzje.find(x => x.id === id) ?? fail(`nie ma decyzji ${id}`);
  for (const k of ['sql', 'cel', 'wynik']) if (!q[k]) fail(`zapytanie: brak pola ${k}`);
  (d.zapytania ||= []).push({ data: now(), ...q });
  writeJson(dir, PLIK, log);
  return d;
}

const nextId = log => `D${String(log.decyzje.length + 1).padStart(2, '0')}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pos: [dir, cmd, ...args], opt } = options(process.argv.slice(2));
  if (!dir || !cmd) fail('użycie: decyzja.mjs <katalog> nowa|status|zapytanie|dowod|bez-zapytania|wczytaj|lista …');
  fs.mkdirSync(dir, { recursive: true });
  const log = readDecisions(dir);
  const byId = id => log.decyzje.find(d => d.id === id) ?? fail(`nie ma decyzji ${id}`);
  const save = () => { writeJson(dir, PLIK, log); build(dir); };

  if (cmd === 'nowa') {
    const d = JSON.parse(readStdin());
    for (const k of ['obszar', 'stary', 'nowy', 'decyzja', 'dlaczego', 'zrodlo', 'podstawa']) if (!d[k]) fail(`nowa: brak pola ${k}`);
    const pewnosc = Number(d.pewnosc ?? 50);
    const status = d.status ?? 'hipoteza';
    if (!STATUSY.includes(status)) fail(`status spoza listy: ${STATUSY.join(', ')}`);
    // "dowod_z": "D03" — the same evidence as another decision
    if (d.dowod_z) { const z = log.decyzje.find(x => x.id === d.dowod_z) ?? fail(`dowod_z: nie ma decyzji ${d.dowod_z}`); d.zapytania = [...(d.zapytania ?? []), ...(z.zapytania ?? []).map(q => ({ ...q, z: z.id }))]; }
    if (pewnosc > 89 && !(d.zapytania?.length)) fail('pewność > 89 tylko z zapytaniem do danych (dodaj „zapytania” albo „dowod_z”, albo obniż pewność)');
    const id = d.id ?? nextId(log);
    if (log.decyzje.some(x => x.id === id)) fail(`decyzja ${id} już jest — zmień status zamiast dublować`);
    log.decyzje.push({ id, data: now(), etap: d.etap ?? d.krok ?? '', obszar: d.obszar, stary: d.stary, nowy: d.nowy, decyzja: d.decyzja,
      dlaczego: d.dlaczego, ...(d.warianty ? { warianty: d.warianty } : {}), zrodlo: d.zrodlo, podstawa: d.podstawa, pewnosc, status,
      zapytania: d.zapytania ?? [], historia: [{ data: now(), status, pewnosc }] });
    save();
    console.log(`${id} [${status}, ${pewnosc}%] ${d.obszar}: ${d.decyzja}`);
  } else if (cmd === 'status') {
    const [id, status] = args;
    if (!STATUSY.includes(status)) fail(`status spoza listy: ${STATUSY.join(', ')}`);
    const d = byId(id);
    const pewnosc = opt.pewnosc !== undefined ? Number(opt.pewnosc) : d.pewnosc;
    if (pewnosc > 89 && !d.zapytania?.length) fail(`${id}: pewność > 89 tylko z zapytaniem do danych (sql.mjs --decyzja ${id})`);
    if (status === 'zastąpiona' && !opt['zastepuje-ja']) fail('zastąpiona: podaj --zastepuje-ja <id nowej decyzji>');
    Object.assign(d, { status, pewnosc, ...(opt.podstawa ? { podstawa: opt.podstawa } : {}), ...(opt['zastepuje-ja'] ? { zastapiona_przez: opt['zastepuje-ja'] } : {}) });
    d.historia.push({ data: now(), status, pewnosc, ...(opt.uwagi ? { uwagi: opt.uwagi } : {}) });
    save();
    console.log(`${id} → ${status} (${pewnosc}%)`);
  } else if (cmd === 'zapytanie') {
    const d = addQuery(dir, args[0], JSON.parse(readStdin()));
    build(dir);
    console.log(`${d.id}: ${d.zapytania.length} zapytań`);
  } else if (cmd === 'dowod') {
    const d = byId(args[0]), z = byId(opt.z ?? fail('dowod: --z <id decyzji z zapytaniami>'));
    if (!z.zapytania?.length) fail(`${z.id} nie ma zapytań`);
    (d.zapytania ||= []).push(...z.zapytania.map(q => ({ ...q, z: z.id })));
    save();
    console.log(`${d.id}: +${z.zapytania.length} zapytań z ${z.id}`);
  } else if (cmd === 'bez-zapytania') {
    const d = byId(args[0]);
    if (!args[1]) fail('bez-zapytania: podaj powód');
    d.bez_zapytania = args[1];
    save();
    console.log(`${d.id}: bez zapytania — ${args[1]}`);
  } else if (cmd === 'wczytaj') {
    // decisions of an earlier mapping (decyzje.json of an earlier run, or a list of objects with at least obszar and decyzja)
    const plik = args[0] ?? fail('wczytaj: podaj plik');
    const raw = JSON.parse(fs.readFileSync(plik, 'utf8'));
    const lista = Array.isArray(raw) ? raw : raw.decyzje ?? fail('wczytaj: plik bez listy decyzji');
    let n = 0;
    for (const s of lista) {
      if (!s.obszar || !s.decyzja) continue;
      if (['odrzucona', 'zastąpiona'].includes(s.status)) continue;   // only what the earlier mapping kept
      const id = nextId(log);
      const pewnosc = Math.min(Number(s.pewnosc ?? 60), 89);
      log.decyzje.push({ id, data: now(), etap: 'wczytane', obszar: s.obszar, stary: s.stary ?? '—', nowy: s.nowy ?? '—', decyzja: s.decyzja,
        dlaczego: s.dlaczego ?? '', zrodlo: s.zrodlo ?? '', podstawa: s.podstawa ?? 'wcześniejsze mapowanie', pewnosc, status: 'hipoteza',
        zapytania: [], z_pliku: { plik: path.basename(plik), id: s.id ?? null, status: s.status ?? null, pewnosc: s.pewnosc ?? null, zapytania: (s.zapytania ?? []).length },
        historia: [{ data: now(), status: 'hipoteza', pewnosc, uwagi: `wczytana z ${path.basename(plik)}${s.id ? ` (${s.id})` : ''}: sprawdzić na tych danych` }] });
      n++;
    }
    save();
    console.log(`wczytane: ${n} decyzji jako hipotezy (pewność ≤ 89 do ponownego zapytania)`);
  } else if (cmd === 'lista') {
    const s = (args[0] ?? '').toLowerCase();
    for (const d of log.decyzje.filter(d => !s || JSON.stringify(d).toLowerCase().includes(s)))
      console.log(`${d.id} [${d.status}, ${d.pewnosc}%] ${d.obszar}: ${d.decyzja}`);
  } else fail(`nieznane polecenie: ${cmd}`);
}

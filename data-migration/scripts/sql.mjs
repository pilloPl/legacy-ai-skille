// Read-only query to the old data. The command that runs SQL from stdin: the line `SQL: `…`` in migracja.md
// (or env MIGRACJA_SQL), e.g.
//   docker exec -i <kontener> psql -U <user> <baza> -A -F "|" -P footer=off      (Postgres w kontenerze)
// Prints the result (up to --limit rows, default 40). With --decyzja <id> --cel "…" the query and its result go to
// the decision (decyzje.json): the result is what you keep as evidence, so aggregate (counts, distributions, a few ids)
// — never rows with names or personal data.
//
//   node sql.mjs <katalog> "select …" [--decyzja D03[,D07] --cel "po co"] [--limit 40] [--wynik "streszczenie wyniku"]
//   node sql.mjs <katalog> --plik zapytanie.sql …
//   node sql.mjs <katalog> "select …" --zapisz wiersze.txt          (wszystkie wiersze bez nagłówka do pliku, np. JSON pod pytania)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { sqlCommand, options } from './wspolne.mjs';
import { addQuery } from './decyzja.mjs';
import { build } from './widok.mjs';

const { pos: [dir, sqlArg], opt } = options(process.argv.slice(2));
const sql = (opt.plik ? fs.readFileSync(opt.plik, 'utf8') : sqlArg ?? '').trim();
if (!dir || !sql) { console.error('użycie: sql.mjs <katalog> "select …" [--decyzja D03 --cel "…"] [--limit N]'); process.exit(2); }
// read-only: one statement, SELECT or WITH … SELECT, nothing that writes
const bez = sql.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
if (!/^\s*(select|with)\b/i.test(bez) || /;\s*\S/.test(bez) || /\b(insert|update|delete|truncate|drop|alter|create|grant|copy|call|do)\b/i.test(bez.replace(/^\s*with\b[\s\S]*?\bselect\b/i, 'select'))) {
  console.error('sql.mjs: tylko jedno zapytanie SELECT (albo WITH … SELECT), bez zmian w danych'); process.exit(2);
}
const komenda = sqlCommand(dir);
if (!komenda) { console.error('migracja.md: brak linii SQL: `<komenda, która czyta SQL ze stdin>` (albo zmiennej MIGRACJA_SQL)'); process.exit(2); }
const start = Date.now();
let out;
// psql returns 0 on a SQL error and writes it to stderr: an ERROR line is a failure, never „0 rows”
const r = spawnSync('/bin/bash', ['-c', komenda], { input: sql.endsWith(';') ? sql : sql + ';', encoding: 'utf8', maxBuffer: 256 << 20 });
out = r.stdout ?? '';
if (r.status || /(^|\n)\s*(ERROR|BŁĄD|FATAL)\b/.test(r.stderr ?? '') || r.error) { console.error(((r.stderr || '') + (r.error?.message ?? '')).trim() || `kod ${r.status}`); process.exit(1); }
const lines = out.trimEnd().split('\n');
// --zapisz <plik>: all rows to a file (e.g. to build questions for the application), only a count on the screen
// the configured command prints a header line (psql -A): the file gets the rows only
if (opt.zapisz) { const rows = lines.slice(1).filter(l => l.length); fs.writeFileSync(opt.zapisz, rows.join('\n') + '\n'); console.log(`${rows.length} wierszy → ${opt.zapisz}`); process.exit(0); }
const limit = Number(opt.limit ?? 40);
console.log(lines.slice(0, limit + 1).join('\n') + (lines.length > limit + 1 ? `\n… (${lines.length - 1} wierszy)` : ''));
console.log(`(${lines.length - 1} wierszy, ${Date.now() - start} ms)`);
if (opt.decyzja) {
  if (!opt.cel) { console.error('--decyzja wymaga --cel "po co"'); process.exit(2); }
  const wynik = opt.wynik ?? (lines.length <= 12 ? lines.join('\n') : `${lines.slice(0, 11).join('\n')}\n… (${lines.length - 1} wierszy)`);
  // one query can be evidence for several decisions: --decyzja D03,D07
  const ids = String(opt.decyzja).split(',').map(x => x.trim()).filter(Boolean);
  for (const id of ids) addQuery(dir, id, { sql, cel: opt.cel, wynik });
  build(dir);
  console.log(`→ zapisane w ${ids.join(', ')}`);
}

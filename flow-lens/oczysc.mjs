#!/usr/bin/env node
// Czyści nagranie (przebiegi albo rekordy surowe) przed pokazaniem lub udostępnieniem: ścieżka domowa → ~,
// nazwa użytkownika, e-maile, a z --sql także literały w zapytaniach i treści logów (dane klientów).
//   node oczysc.mjs <wejscie.jsonl> <wyjscie.jsonl> [--sql] [--zamien "tekst=>zamiennik" ...]
import fs from "node:fs";
import os from "node:os";

const [wej, wyj, ...reszta] = process.argv.slice(2);
if (!wej || !wyj) { console.error('użycie: node oczysc.mjs <wejscie.jsonl> <wyjscie.jsonl> [--sql] [--zamien "a=>b"]'); process.exit(1); }
const zamiany = [];
for (let i = 0; i < reszta.length; i++) if (reszta[i] === "--zamien") zamiany.push(reszta[++i].split("=>"));
zamiany.push([os.homedir(), "~"], [os.userInfo().username, "uczestnik"]);
const SQL = reszta.includes("--sql");

// literały w SQL: 'tekst' → '?', liczby po = / IN / VALUES → ?
export const bezLiteralow = s => String(s).replace(/'(?:[^']|'')*'/g, "'?'").replace(/([=<>(,]\s*)-?\d+(\.\d+)?\b/g, "$1?");

const wynik = fs.readFileSync(wej, "utf8").split("\n").filter(Boolean).map(linia => {
  const r = JSON.parse(linia);
  if (r.zasob) r.zasob = { "service.name": r.zasob["service.name"] };     // linia poleceń, host, ścieżki procesu
  if (SQL) {
    for (const k of r.kroki || []) {
      if (k.sql) k.sql = bezLiteralow(k.sql);
      for (const l of k.logi || []) l.tekst = l.tekst.replace(/\d{3,}/g, "…");
    }
    for (const a of ["db.statement", "db.query.text"]) if (r.atrybuty?.[a]) r.atrybuty[a] = bezLiteralow(r.atrybuty[a]);
    if (r.typ === "log") r.tekst = r.tekst.replace(/\d{3,}/g, "…");
  }
  let s = JSON.stringify(r);
  for (const [a, b] of zamiany) s = s.split(a).join(b).split(JSON.stringify(a).slice(1, -1)).join(b);
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, m => /@(example\.(com|org)|localhost)$/.test(m) ? m : "uczestnik@example.com");
  return s;
});
fs.writeFileSync(wyj, wynik.join("\n") + "\n");
console.log(`${wynik.length} rekordów → ${wyj}`);

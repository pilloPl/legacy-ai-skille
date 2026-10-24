#!/usr/bin/env node
// Czyści nagranie przed pokazaniem lub udostępnieniem: ścieżka domowa → ~, nazwa użytkownika, e-maile, identyfikatory konta.
//   node oczysc.mjs <wejscie.jsonl> <wyjscie.jsonl> [--zamien "tekst=>zamiennik" ...]
import fs from "node:fs";
import os from "node:os";

const [wej, wyj, ...reszta] = process.argv.slice(2);
if (!wej || !wyj) { console.error("użycie: node oczysc.mjs <wejscie.jsonl> <wyjscie.jsonl> [--zamien \"a=>b\"]"); process.exit(1); }
const zamiany = [];
for (let i = 0; i < reszta.length; i++) if (reszta[i] === "--zamien") zamiany.push(reszta[++i].split("=>"));
zamiany.push([os.homedir(), "~"], [os.userInfo().username, "uczestnik"]);

const wynik = fs.readFileSync(wej, "utf8").split("\n").filter(Boolean).map(linia => {
  const r = JSON.parse(linia);
  if (r.body?.metadata) delete r.body.metadata;
  let s = JSON.stringify(r);
  for (const [a, b] of zamiany) s = s.split(a).join(b).split(JSON.stringify(a).slice(1, -1)).join(b);
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, m => /@(example\.com|localhost|anthropic\.com)$/.test(m) ? m : "uczestnik@example.com");
  s = s.replace(/"(account_uuid|device_id|organization_uuid)":"[^"]*"/g, '"$1":"[ukryte]"');
  return s;
});
fs.writeFileSync(wyj, wynik.join("\n") + "\n");
console.log(`${wynik.length} rekordów → ${wyj}`);

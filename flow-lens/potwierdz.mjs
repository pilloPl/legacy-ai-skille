#!/usr/bin/env node
// Potwierdzenie człowieka: „na tym repo tryb X dał sensowny przebieg” (albo nie). Tylko takie wpisy i pomiary
// względem niezależnej wyroczni OTel uczą flow-lens (rekomendacje w rozpoznaj.mjs, poprawki reguł i parserów).
// Zapis lokalny (~/.flow-lens/doswiadczenia.json) — nazwy repo bywają poufne, więc nie trafiają do repo skilli.
//
//   node potwierdz.mjs [repo] --tryb <otel|diag|log_app|hybryda|…> --ocena <ok|czesciowo|zle> [--uwaga "…"]
//   node potwierdz.mjs --lista                        pokaż zapisane potwierdzenia
import fs from "node:fs";
import path from "node:path";
import { rozpoznaj, PLIK_POTWIERDZEN } from "./rozpoznaj.mjs";

const arg = process.argv.slice(2);
const opcja = n => { const i = arg.indexOf(n); return i >= 0 ? arg[i + 1] : undefined; };
let baza = { doswiadczenia: [] };
try { baza = JSON.parse(fs.readFileSync(PLIK_POTWIERDZEN, "utf8")); } catch {}

if (arg.includes("--lista")) {
  for (const d of baza.doswiadczenia) console.log(`${d.data} ${d.repo}: ${Object.entries(d.tryby).map(([t, m]) => `${t} ${m.ocena}${m.uwaga ? ` (${m.uwaga})` : ""}`).join("; ")}`);
  process.exit(0);
}
const tryb = opcja("--tryb"), ocena = opcja("--ocena");
if (!tryb || !["ok", "czesciowo", "zle"].includes(ocena)) {
  console.error("użycie: node potwierdz.mjs [repo] --tryb <tryb> --ocena ok|czesciowo|zle [--uwaga \"…\"]");
  process.exit(2);
}
const pozycyjne = arg.filter((a, i) => !a.startsWith("--") && !arg[i - 1]?.startsWith("--"));
const repo = path.resolve(pozycyjne[0] || ".");
let r;
try { r = JSON.parse(fs.readFileSync(path.join(repo, ".flow-lens", "rozpoznanie.json"), "utf8")); } catch { r = rozpoznaj(repo); }
const data = new Date().toISOString().slice(0, 10);
let wpis = baza.doswiadczenia.find(d => d.repo === repo);
if (!wpis) baza.doswiadczenia.push(wpis = { repo, zrodlo: "czlowiek", skladniki: [], tryby: {} });
Object.assign(wpis, { skladniki: r.skladniki.map(s => s.id), data });
wpis.tryby[tryb] = { ocena, ...(opcja("--uwaga") ? { uwaga: opcja("--uwaga") } : {}), data };
fs.mkdirSync(path.dirname(PLIK_POTWIERDZEN), { recursive: true });
fs.writeFileSync(PLIK_POTWIERDZEN, JSON.stringify(baza, null, 1) + "\n");
console.log(`zapisano: ${path.basename(repo)} — ${tryb}: ${ocena} → ${PLIK_POTWIERDZEN}`);

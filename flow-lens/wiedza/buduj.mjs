// Katalog wiedzy z dziennika workflow „flow-lens-wiedza” (research → weryfikacja → korpus): skrypt zamiast
// przepisywania przez model (duże JSON-y bywały przerywane). Weryfikacja zwraca PEŁNĄ poprawioną listę wpisów.
//   node wiedza/buduj.mjs <journal.jsonl> [tech…]      → wiedza/<tech>.json, wiedza/<tech>.md, trening/korpus/kandydaci-<tech>.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
const [dziennik, ...tylko] = process.argv.slice(2);
const NAZWY = { java: "Java / JVM", python: "Python", node: "Node.js / TypeScript", dotnet: ".NET", php: "PHP" };
const TEMATY = [["wejscia", "Wejścia"], ["dane", "Dostęp do danych"], ["transakcje", "Transakcje"], ["logi", "Logi"], ["wstrzykiwanie", "Wstrzykiwanie"]];

const wpisy = fs.readFileSync(dziennik, "utf8").trim().split("\n").map(l => JSON.parse(l));
const etykieta = {};
for (const e of wpisy) if (e.label) etykieta[e.key] = e.label;
const wynik = l => wpisy.find(e => e.type === "result" && etykieta[e.key] === l)?.result;

const komorka = t => String(t ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, 220) + (String(t ?? "").length > 220 ? "…" : "");
const tekstWyjatku = w => (typeof w === "string" ? w : [w.nazwa || w.przypadek || w.opis, w.wplyw || w.wpływ || w.skutek].filter(Boolean).join(" — "));

for (const tech of tylko.length ? tylko : Object.keys(NAZWY)) {
  const katalog = { technologia: tech, nazwa: NAZWY[tech], tematy: {}, obalone: {}, luki: {} };
  for (const [t] of TEMATY) {
    const r = wynik(`research:${tech}:${t}`), w = wynik(`weryfikacja:${tech}:${t}`);
    katalog.tematy[t] = w?.poprawione || r?.wpisy || [];
    katalog.obalone[t] = w?.obalone || [];
    katalog.luki[t] = r?.luki || [];
  }
  const kandydaci = wynik(`korpus:${tech}`)?.repozytoria || [];
  fs.writeFileSync(path.join(TU, `${tech}.json`), JSON.stringify(katalog, null, 1) + "\n");
  fs.mkdirSync(path.join(TU, "..", "trening", "korpus"), { recursive: true });
  fs.writeFileSync(path.join(TU, "..", "trening", "korpus", `kandydaci-${tech}.json`), JSON.stringify(kandydaci, null, 1) + "\n");

  const ile = t => katalog.tematy[t].length, wyj = t => katalog.tematy[t].reduce((a, x) => a + (x.wyjatki?.length || 0), 0);
  let md = `# Katalog wiedzy flow-lens: ${NAZWY[tech]}\n\nŹródło danych: \`${tech}.json\` (pełne pola, źródła i wersje). Ten plik to czytelne podsumowanie,\n` +
    `zbudowane skryptem \`wiedza/buduj.mjs\` z dziennika workflow (research → weryfikacja).\n\n| Temat | Wpisy | Wyjątki |\n|---|---|---|\n`;
  for (const [t, n] of TEMATY) md += `| ${n} | ${ile(t)} | ${wyj(t)} |\n`;
  md += `| **Razem** | **${TEMATY.reduce((a, [t]) => a + ile(t), 0)}** | **${TEMATY.reduce((a, [t]) => a + wyj(t), 0)}** |\n`;
  for (const [t, n] of TEMATY) {
    md += `\n## ${n}\n\n### Mechanizmy\n\n| Nazwa | Jak rozpoznać statycznie | W logu | W OTel | Wstrzyknięcie |\n|---|---|---|---|---|\n`;
    for (const x of katalog.tematy[t]) md += `| ${komorka(x.nazwa)} | ${komorka(x.sygnal_statyczny)} | ${komorka(x.sygnal_log)} | ${komorka(x.sygnal_otel)} | ${komorka(x.punkt_wstrzykniecia)} |\n`;
    md += `\n### Wyjątki\n\n`;
    for (const x of katalog.tematy[t]) for (const w of x.wyjatki || []) md += `- **${komorka(x.nazwa).slice(0, 60)}**: ${komorka(tekstWyjatku(w))}\n`;
    if (katalog.obalone[t].length) { md += `\n### Obalone przy weryfikacji\n\n`; for (const o of katalog.obalone[t]) md += `- ${komorka(o.nazwa)} — ${komorka(o.dlaczego)}\n`; }
  }
  md += `\n## Luki\n\n`;
  for (const [t, n] of TEMATY) for (const l of katalog.luki[t]) md += `- (${n}) ${komorka(typeof l === "string" ? l : JSON.stringify(l))}\n`;
  md += `\n## Przypadki testowe do napisania\n\n`;
  for (const [t, n] of TEMATY) for (const x of katalog.tematy[t]) if (x.przypadek_testowy) md += `- (${n}) ${komorka(x.przypadek_testowy)}\n`;
  fs.writeFileSync(path.join(TU, `${tech}.md`), md);
  console.log(`${tech}: ${TEMATY.reduce((a, [t]) => a + ile(t), 0)} wpisów, ${TEMATY.reduce((a, [t]) => a + wyj(t), 0)} wyjątków, ${kandydaci.length} kandydatów do korpusu`);
}

// flow-lens: hook ładowania modułów. Do pliku z klasami z mapy dopisuje na końcu owinięcie ich metod w spany
// (globalThis.__flowlensOwin z flowlens.cjs / flowlens-diag.cjs). Reszta modułów przechodzi bez zmian.
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { zDopiskiem } from "./dopisek.cjs";
const prawdziwa = p => { try { return fs.realpathSync(p); } catch { return p; } };

let pliki = new Map();
export async function initialize(dane) {
  pliki = new Map(Object.entries(dane?.pliki || {}));
}

export async function load(url, kontekst, dalej) {
  const wynik = await dalej(url, kontekst);
  if (!url.startsWith("file:") || wynik.source == null) return wynik;
  const klasy = pliki.get(fileURLToPath(url)) || pliki.get(prawdziwa(fileURLToPath(url)));
  if (!klasy) return wynik;
  return { ...wynik, source: zDopiskiem(wynik.source, klasy) };
}

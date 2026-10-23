// flow-lens: kod dopisywany na końcu pliku z klasami z mapy (wspólny dla hooka ESM i _compile CommonJS).
// Klasa → globalThis.__flowlensOwin(Klasa, fqn, metody). Moduł funkcji („klasa-moduł” w mapie, albo identyfikator
// klasy niezdefiniowany w pliku) → globalThis.__flowlensOwinModul(module.exports, …) — tylko CommonJS (w ESM
// `module` nie istnieje, a eksportów nie da się podmienić z zewnątrz).
// Funkcje najwyższego poziomu modułu funkcji (także nieeksportowane: `const sprawdz = async (…) => …`, `function f(…)`)
// owijamy przez podmianę wiązania w samym module (globalThis.__flowlensOwinFunkcje): wywołania wewnątrz modułu idą
// przez wiązanie lokalne, nie przez module.exports, a w ESM to jedyny sposób. `const` takiej funkcji staje się `let`.
"use strict";
const ID = /^[A-Za-z_$][\w$]*$/;
const jestModul = k => k.modul || !ID.test(k.nazwa || "");

function dopisek(klasy, funkcje = []) {
  const kod = klasy.map(k => {
    const a = `${JSON.stringify(k.fqn)}, ${JSON.stringify(k.metody)}`;
    const modul = `typeof module === "object" && module && globalThis.__flowlensOwinModul?.(module.exports, ${a})`;
    return jestModul(k) ? `try { ${modul}; } catch {}`
      : `try { if (typeof ${k.nazwa} === "function") globalThis.__flowlensOwin?.(${k.nazwa}, ${a}); else ${modul}; } catch {}`;
  });
  const fqn = klasy.find(jestModul)?.fqn;
  for (const f of fqn ? funkcje : [])
    kod.push(`try { if (typeof ${f} === "function" && globalThis.__flowlensOwinFunkcje) ${f} = globalThis.__flowlensOwinFunkcje(${f}, ${JSON.stringify(fqn)}, ${JSON.stringify(f)}); } catch {}`);
  return kod.join("\n");
}

// deklaracje funkcji od początku linii (najwyższy poziom): function f(…) / async function f(…) / const f = (…) =>
// / const f = async (…) => / const f = x => / const f = function. Bez wyrażeń, które tylko zwracają funkcję
// (const router = Router(), const x = (0, express_1.Router)()) — to nie są funkcje z kodu modułu.
const FUNKCJA = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*[(<]/gm;
const STALA = /^((?:export\s+)?)const(\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:function\b|\((?:[^()]|\([^()]*\))*\)\s*(?::[^=\n]+)?=>|[A-Za-z_$][\w$]*\s*=>))/gm;
function przepisz(tresc, klasy) {
  if (!klasy.some(jestModul)) return { tresc, funkcje: [] };
  const zajete = new Set(klasy.map(k => k.nazwa));
  const funkcje = new Set();
  for (const m of tresc.matchAll(FUNKCJA)) if (!zajete.has(m[1])) funkcje.add(m[1]);
  const nowa = tresc.replace(STALA, (cale, eksport, reszta, nazwa) => {
    if (zajete.has(nazwa)) return cale;
    funkcje.add(nazwa);
    return `${eksport}let${reszta}`;
  });
  return { tresc: nowa, funkcje: [...funkcje] };
}

// cały plik z dopiskiem: przepisane wiązania funkcji modułu + owinięcie klas, eksportów i funkcji
function zDopiskiem(tresc, klasy) {
  const p = przepisz(String(tresc), klasy);
  return `${p.tresc}\n;${dopisek(klasy, p.funkcje)}\n`;
}
module.exports = { dopisek, przepisz, zDopiskiem };

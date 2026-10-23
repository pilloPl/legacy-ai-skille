// Wstrzykiwanie do kopii aplikacji C# (worktree). Metody klas z mapy dostają ciało:
//   using var __flowlens = flowlens.Diag.Metoda("Ns.Klasa", "Metoda"); try { …stare ciało… }
//   catch (System.Exception __flowlensE) when (flowlens.Diag.Blad(__flowlens, __flowlensE)) { throw; }
// (Activity ze źródła „flowlens.metody”; using zamyka ją z końcem metody — także async i iteratorów; filtr oznacza
// wyjątek, który z metody wychodzi, i nigdy go nie łapie. Iteratory: sam using).
// Diag.cs (FlowlensDiag.cs) rejestruje się sam ([ModuleInitializer]), Program.cs bez zmian. Trafia do JEDNEGO projektu:
// najniższego, który referencjonują (wprost lub przez innych) wszystkie projekty z wstrzyknięciem — public; projekty
// wykonywalne dostają FlowlensStart.cs (start przy rozruchu, bo moduł biblioteki ładuje się leniwie). Bez wspólnego
// projektu: kopia w każdym (internal, słucha tylko pierwsza). Projekty testowe pomijamy.
// Metody z ciałem-wyrażeniem (=> …) zamieniamy na blok; konstruktory i rozruch (Main, Configure*, klasy Program/Startup)
// pomijamy — ich Activity trwałaby całe życie aplikacji i stawała się rodzicem jobów i wątków w tle.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TU = path.dirname(fileURLToPath(import.meta.url));
const RYSOWANE = new Set(["wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"]);

// maska C#: komentarze, "…", @"…" (bez escape'ów, "" w środku), $"…", """…""" (raw), '…'
export function maskaCs(t) {
  const m = t.split("");
  const zatrzyj = (a, b) => { for (let k = a; k < b; k++) if (m[k] !== "\n") m[k] = " "; };
  let i = 0;
  while (i < t.length) {
    const c = t[i], d = t[i + 1];
    if (c === "/" && d === "/") { const k = t.indexOf("\n", i); const e = k < 0 ? t.length : k; zatrzyj(i, e); i = e; }
    else if (c === "/" && d === "*") { const k = t.indexOf("*/", i + 2); const e = k < 0 ? t.length : k + 2; zatrzyj(i, e); i = e; }
    else if (c === '"' && t.startsWith('"""', i)) { const k = t.indexOf('"""', i + 3); const e = k < 0 ? t.length : k + 3; zatrzyj(i + 1, e - 1); i = e; }
    else if (c === '"' && (t[i - 1] === "@" || (t[i - 1] === "$" && t[i - 2] === "@") || (t[i - 1] === "@" && t[i - 2] === "$"))) {
      let k = i + 1;
      while (k < t.length && !(t[k] === '"' && t[k + 1] !== '"')) k += t[k] === '"' ? 2 : 1;
      zatrzyj(i + 1, k); i = k + 1;
    } else if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < t.length && t[k] !== c && t[k] !== "\n") k += t[k] === "\\" ? 2 : 1;
      zatrzyj(i + 1, k); i = k + 1;
    } else i++;
  }
  return m.join("");
}

// pary nawiasów klamrowych (w masce kodu): otwarcie → zamknięcie
function klamry(kod) {
  const para = new Map(), stos = [];
  for (let i = 0; i < kod.length; i++) {
    if (kod[i] === "{") stos.push(i);
    else if (kod[i] === "}") { const o = stos.pop(); if (o != null) para.set(o, i); }
  }
  return para;
}
function zamykajacyNawias(kod, i) {          // kod[i] === "("
  for (let k = i, g = 0; k < kod.length; k++) { if (kod[k] === "(") g++; else if (kod[k] === ")" && --g === 0) return k; }
  return -1;
}
// ciało typu o prostej nazwie: [otwarcie, zamknięcie]; record bez ciała („record X(int A);”) → null
function cialoTypu(kod, para, nazwa) {
  const m = new RegExp(`\\b(?:class|struct|record|interface)\\s+${nazwa}\\b`).exec(kod);
  if (!m) return null;
  const o = kod.indexOf("{", m.index), s = kod.indexOf(";", m.index);
  return o < 0 || (s >= 0 && s < o) || !para.has(o) ? null : [o, para.get(o)];
}

// metody C# o danych nazwach z ciałem-blokiem, bezpośrednio w ciele typu → [{nazwa, otwarcie, zamkniecie}].
// Także generyczne: Nazwa<T>(…) where T : class, new() { … }
export function metodyKlasyCs(kod, nazwaKlasy, nazwy) {
  if (!nazwy.length) return [];
  const para = klamry(kod), cialo = cialoTypu(kod, para, nazwaKlasy);
  if (!cialo) return [];
  const [od, do_] = cialo, wynik = [];
  const zajete = [...para].filter(([o, z]) => o > od && z < do_);
  const wSrodku = i => zajete.some(([o, z]) => i > o && i < z);
  const re = new RegExp(`\\b(${nazwy.join("|")})\\s*(?:<[\\w\\s,.<>?\\[\\]()]*?>)?\\s*\\(`, "g");
  re.lastIndex = od;
  let m;
  while ((m = re.exec(kod)) && m.index < do_) {
    if (wSrodku(m.index)) continue;
    const przed = kod.slice(Math.max(od, m.index - 40), m.index).trimEnd();
    if (/(\bnew|\.|=|\breturn|\bawait|,|\()$/.test(przed)) continue;              // wywołanie, nie deklaracja
    if (/\b(abstract|extern)\b[^;{}]*$/.test(kod.slice(od, m.index).split(/[;{}]/).pop())) continue;
    const zam = zamykajacyNawias(kod, kod.indexOf("(", m.index));
    if (zam < 0) continue;
    const reszta = /^\s*(?:where\b[^{;=]*?)?\s*([{;]|=>)/.exec(kod.slice(zam + 1));
    if (!reszta || reszta[1] !== "{") continue;
    const otw = zam + 1 + reszta[0].length - 1;
    if (!para.has(otw)) continue;
    wynik.push({ nazwa: m[1], otwarcie: otw, zamkniecie: para.get(otw) });
    re.lastIndex = para.get(otw);
  }
  return wynik;
}

// rozruch aplikacji: metody i klasy, które trwają całe życie procesu (albo tylko je konfigurują)
const ROZRUCH_METODY = /^(Main|Configure\w*|Create\w*HostBuilder|BuildWebHost)$/;
const ROZRUCH_KLASY = /^(Program|Startup|\w+Startup)$/;
export const rozruch = (klasa, metoda) => ROZRUCH_KLASY.test(klasa) || ROZRUCH_METODY.test(metoda);

// metody z ciałem-wyrażeniem: Typ Nazwa(…) => wyrażenie;  → [początek „=>”, koniec „;”, czy zwraca wartość]
function metodyWyrazenia(kod, tekst, nazwaKlasy, nazwy) {
  const kl = new RegExp(`\\b(?:class|struct|record)\\s+${nazwaKlasy}\\b`).exec(kod);
  if (!kl) return [];
  const wynik = [];
  const re = new RegExp(`\\b(${nazwy.join("|")})\\s*(?:<[^()]*?>)?\\s*\\(`, "g");
  re.lastIndex = kl.index;
  let m;
  while ((m = re.exec(kod))) {
    let i = kod.indexOf("(", m.index), g = 0;
    for (; i < kod.length; i++) { if (kod[i] === "(") g++; else if (kod[i] === ")" && --g === 0) break; }
    const po = /^\s*(?:where\s+[^=]+?)?=>/.exec(kod.slice(i + 1));
    if (!po) continue;
    const strzalka = i + 1 + po[0].length - 2;
    let j = strzalka + 2; g = 0;
    for (; j < kod.length; j++) { const c = kod[j]; if ("([{".includes(c)) g++; else if (")]}".includes(c)) g--; else if (c === ";" && g === 0) break; }
    const przed = kod.slice(Math.max(0, Math.max(kod.lastIndexOf(";", m.index), kod.lastIndexOf("}", m.index), kod.lastIndexOf("{", m.index))) + 1, m.index);
    if (/[=.]\s*$/.test(przed) || !/\b(public|private|protected|internal|static|async|override|virtual|void|Task|[\w>\]?]+)\s+$/.test(przed)) continue;
    const bezWartosci = /\bvoid\s+$/.test(przed) || /\basync\b/.test(przed) && /\b(Task|ValueTask)\s+$/.test(przed);
    wynik.push({ nazwa: m[1], strzalka, koniec: j, bezWartosci });
    re.lastIndex = j;
  }
  return wynik;
}

// wyjątek wychodzący z metody: filtr (nigdy nie łapie, stos nietknięty) oznacza jej Activity błędem — using nie wie,
// czy metoda skończyła się wyjątkiem, a złapany wyżej (strona, kontroler → 302) nie zostawiłby śladu
const ZNAK_WYJATKU = "} catch (System.Exception __flowlensE) when (flowlens.Diag.Blad(__flowlens, __flowlensE)) { throw; }";

export function wstrzyknijPlikCs(tekst, klasy) {
  const kod = maskaCs(tekst), wstawki = [], podmiany = [], raport = [];
  for (const k of klasy) {
    const wszystkie = k.metody.filter(n => n !== k.nazwa);
    for (const n of wszystkie.filter(n => rozruch(k.nazwa, n))) raport.push(`! ${k.fqn}.${n} (rozruch aplikacji — pomijam)`);
    const nazwy = wszystkie.filter(n => !rozruch(k.nazwa, n));
    const ms = metodyKlasyCs(kod, k.nazwa, nazwy);
    for (const m of ms) {
      // iterator (yield) nie może stać w try z catch (CS1626) — wtedy sam using, bez znaku wyjątku
      const iterator = /\byield\s+(return|break)\b/.test(kod.slice(m.otwarcie, m.zamkniecie));
      wstawki.push([m.otwarcie + 1, ` using var __flowlens = flowlens.Diag.Metoda(${JSON.stringify(k.fqn)}, ${JSON.stringify(m.nazwa)});${iterator ? "" : " try {"}`, 0]);
      if (!iterator) wstawki.push([m.zamkniecie, `${ZNAK_WYJATKU} `, 1]);
      raport.push(`${k.fqn}.${m.nazwa}`);
    }
    const reszta = nazwy.filter(n => !ms.some(m => m.nazwa === n));
    const wyr = reszta.length ? metodyWyrazenia(kod, tekst, k.nazwa, reszta) : [];
    for (const w of wyr) {
      // => wyrażenie;  →  { using var …; return wyrażenie; }  (void / async Task: bez return)
      const wyrazenie = tekst.slice(w.strzalka + 2, w.koniec).trim();
      podmiany.push([w.strzalka, w.koniec + 1, `{ using var __flowlens = flowlens.Diag.Metoda(${JSON.stringify(k.fqn)}, ${JSON.stringify(w.nazwa)}); try { ${w.bezWartosci ? "" : "return "}${wyrazenie}; ${ZNAK_WYJATKU} }`]);
      raport.push(`${k.fqn}.${w.nazwa} (=>)`);
    }
    for (const n of reszta.filter(n => !wyr.some(w => w.nazwa === n))) raport.push(`! ${k.fqn}.${n} (nie znaleziono deklaracji z ciałem)`);
  }
  let wynik = tekst;
  // od końca; przy równym indeksie (puste ciało „{}”) najpierw zamknięcie — każda wstawka ląduje przed poprzednią
  const zmiany = [...wstawki.map(([i, s, r]) => [i, i, s, r]), ...podmiany].sort((a, b) => b[0] - a[0] || (b[3] ?? 0) - (a[3] ?? 0));
  for (const [od, do_, s] of zmiany) wynik = wynik.slice(0, od) + s + wynik.slice(do_);
  return { tekst: wynik, raport };
}

// ---------------------------------------------------------------- projekty (.csproj) i gdzie dać Diag.cs
const POMIN_KAT = new Set(["bin", "obj", "node_modules", ".git", ".flow-lens", ".codegraph"]);
export function projektyCs(katalog) {
  const wynik = new Map();                                     // katalog projektu → opis
  const chodz = d => {
    let wpisy; try { wpisy = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const w of wpisy) {
      if (w.isDirectory()) { if (!POMIN_KAT.has(w.name)) chodz(path.join(d, w.name)); continue; }
      if (!w.name.endsWith(".csproj")) continue;
      const plik = path.join(d, w.name), x = fs.readFileSync(plik, "utf8");
      const refy = [...x.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map(m => path.dirname(path.resolve(d, m[1].replace(/\\/g, "/"))));
      const tf = [...x.matchAll(/<TargetFrameworks?>([^<]+)</g)].flatMap(m => m[1].split(";")).map(t => t.trim()).filter(Boolean);
      wynik.set(d, { katalog: d, nazwa: w.name.replace(/\.csproj$/, ""), refy,
        test: /Microsoft\.NET\.Test\.Sdk|<IsTestProject>\s*true|Include="(xunit|nunit|NUnit|MSTest\.TestFramework)"/i.test(x),
        wykonywalny: /Sdk="Microsoft\.NET\.Sdk\.(Web|Worker)"|<OutputType>\s*(Exe|WinExe)\s*</i.test(x),
        // Diag.cs potrzebuje .NET 5+ (ModuleInitializer, ActivitySource): netstandard / .NET Framework odpadają
        stary: tf.length > 0 && tf.every(t => /^(netstandard|net[1-4]\d)/.test(t)) });
    }
  };
  chodz(katalog);
  return wynik;
}

// zależności przechodnie projektu (katalogi)
function zaleznosci(projekty, d, widziane = new Set()) {
  for (const r of projekty.get(d)?.refy || []) if (!widziane.has(r)) { widziane.add(r); zaleznosci(projekty, r, widziane); }
  return widziane;
}

// jeden projekt na Diag.cs: najniższy, od którego zależą (lub którym są) wszystkie projekty z wstrzyknięciem
export function projektDiag(projekty, uzyte) {
  const dep = new Map([...projekty.keys()].map(d => [d, zaleznosci(projekty, d)]));
  const kandydaci = [...projekty.values()].filter(p => !p.test && !p.stary && uzyte.every(u => u === p.katalog || dep.get(u)?.has(p.katalog)));
  kandydaci.sort((a, b) => dep.get(a.katalog).size - dep.get(b.katalog).size);
  return kandydaci[0]?.katalog || null;
}

const START = `// flow-lens: start logu diagnostycznego przy rozruchu (Diag jest w bibliotece, która ładuje się dopiero przy pierwszym użyciu)
namespace flowlens
{
    static class DiagStart
    {
#pragma warning disable CA2255
        [System.Runtime.CompilerServices.ModuleInitializer]
#pragma warning restore CA2255
        internal static void Uruchom() => Diag.Uruchom();
    }
}
`;

export function wstrzyknijCsharp(katalog, mapa) {
  const projekty = projektyCs(katalog);
  const projektPliku = p => {                                  // najbliższy katalog z .csproj w górę od pliku
    for (let d = path.dirname(p); d.startsWith(katalog); d = path.dirname(d)) {
      if (projekty.has(d)) return d;
      if (d === katalog) break;
    }
    return null;
  };
  const poPliku = new Map();
  for (const [fqn, k] of Object.entries(mapa.klasy || {})) {
    if (!RYSOWANE.has(k.rola) || !k.metody?.length || !k.plik?.includes(".cs")) continue;
    const plik = k.plik.replace(/:\d+$/, "");
    if (!poPliku.has(plik)) poPliku.set(plik, []);
    poPliku.get(plik).push({ fqn, nazwa: k.nazwa || fqn.split(".").pop(), metody: k.metody });
  }
  const raport = { pliki: 0, metody: [], ostrzezenia: [], moduly: [] };
  const uzyte = new Set(), testowe = new Set();
  for (const [plik, klasy] of poPliku) {
    const p = path.join(katalog, plik);
    if (!fs.existsSync(p)) { raport.ostrzezenia.push(`brak pliku ${plik}`); continue; }
    const proj = projektPliku(p);
    if (proj && projekty.get(proj).test) { testowe.add(proj); continue; }   // testy nie są częścią przebiegu aplikacji
    const tekst = fs.readFileSync(p, "utf8");
    const w = wstrzyknijPlikCs(tekst, klasy);
    if (w.tekst !== tekst) { fs.writeFileSync(p, w.tekst); raport.pliki++; if (proj) uzyte.add(proj); }
    for (const r of w.raport) (r.startsWith("!") ? raport.ostrzezenia : raport.metody).push(r);
  }
  for (const d of testowe) raport.ostrzezenia.push(`! projekt testowy ${path.relative(katalog, d) || "."} — pomijam`);
  const diag = fs.readFileSync(path.join(TU, "csharp", "Diag.cs"), "utf8");
  const wspolny = uzyte.size ? projektDiag(projekty, [...uzyte]) : null;
  if (wspolny) {
    fs.writeFileSync(path.join(wspolny, "FlowlensDiag.cs"), diag);
    raport.moduly.push(path.relative(katalog, wspolny) || ".");
    // projekty wykonywalne zależne od wspólnego: start przy rozruchu
    for (const p of projekty.values())
      if (p.katalog !== wspolny && p.wykonywalny && !p.test && zaleznosci(projekty, p.katalog).has(wspolny)) {
        fs.writeFileSync(path.join(p.katalog, "FlowlensStart.cs"), START);
        raport.moduly.push(`${path.relative(katalog, p.katalog) || "."} (start)`);
      }
  } else {
    if (uzyte.size > 1) raport.ostrzezenia.push(`! brak projektu wspólnego dla ${uzyte.size} projektów — FlowlensDiag.cs (internal) w każdym`);
    const wewnetrzny = diag.replace("public static class Diag", "internal static class Diag");
    for (const d of uzyte) {
      fs.writeFileSync(path.join(d, "FlowlensDiag.cs"), uzyte.size > 1 ? wewnetrzny : diag);
      raport.moduly.push(path.relative(katalog, d) || ".");
    }
  }
  return raport;
}

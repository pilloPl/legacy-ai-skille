// Warstwy: techniczne (co widać w przebiegu) i adnotacje (nasze kolory nałożone na klasy, metody, SQL).
// Techniczna wyłączona → jej kroki znikają z przebiegu (strzałki idą wtedy od najbliższego widocznego).
// Adnotacja wyłączona → znika tylko jej kolor i etykiety; przebieg się nie zmienia.
export const KATEGORIE = [
  { id: "architektura", nazwa: "architektura", opis: "wejścia, aplikacja, domena, dostęp do danych, inne systemy" },
  { id: "baza", nazwa: "baza danych", opis: "kontakt z bazą: zapytania i transakcje" },
  { id: "logi", nazwa: "logi", opis: "dodatkowe logi: kluczowe (SQL z parametrami, wzorce z analizy)" },
  { id: "ocena", nazwa: "ocena", opis: "co jest czym — nasza ocena fragmentów przepływu (reguły do ustalenia)" },
];
// Architektura: wejścia, aplikacja, domena, repozytoria, inne systemy — każdą część można wyłączyć, domyślnie są
// włączone. Ukryta część znika z rysunku, a strzałki idą od najbliższej widocznej klasy wyżej. Gdy inna warstwa musi pokazać coś, co dotyczy wyłączonej części (SQL z repozytorium,
// transakcja przez repozytorium, ocena zaznaczająca repozytorium), ta część włącza się sama.
export const ZAWSZE = [];
export const TECHNICZNE = [
  { id: "wejscia", nazwa: "wejścia", kategoria: "architektura", kolor: "var(--c-wejscie)", domyslnie: true },
  { id: "aplikacja", nazwa: "aplikacja", kategoria: "architektura", kolor: "var(--c-aplikacja)", domyslnie: true },
  { id: "domena", nazwa: "domena", kategoria: "architektura", kolor: "var(--c-domena)", domyslnie: true },
  { id: "repozytoria", nazwa: "dostęp do danych", kategoria: "architektura", kolor: "var(--c-repo)", domyslnie: true },
  { id: "zewnetrzne", nazwa: "inne systemy", kategoria: "architektura", kolor: "var(--c-zew)", domyslnie: true },
  { id: "sql", nazwa: "SQL", kategoria: "baza", kolor: "var(--c-sql)", domyslnie: true },
  { id: "transakcje", nazwa: "transakcje", kategoria: "baza", kolor: "var(--c-tx)", domyslnie: true },
  { id: "logi", nazwa: "kluczowe logi", kategoria: "logi", kolor: "var(--c-log)", domyslnie: true },
];
export const ARCHITEKTURA = TECHNICZNE.filter(w => w.kategoria === "architektura").map(w => w.id);

// Do której części architektury należy uczestnik przebiegu (null = zawsze widoczny: świat, baza — baza idzie z SQL).
export function warstwaUczestnika(u) {
  if (!u) return null;
  if (u.rodzaj === "repozytorium") return "repozytoria";
  if (u.rodzaj === "zewnetrzny") return "zewnetrzne";
  if (u.rodzaj === "endpoint") return "wejscia";
  if (u.rodzaj === "klasa") return u.rola === "wejscie" ? "wejscia" : u.rola === "aplikacja" ? "aplikacja" : "domena";
  return null;
}

// Które części architektury są potrzebne włączonym warstwom innych kategorii w tym przebiegu.
export function potrzebnaArchitektura(W, p, adn) {
  const potrzebne = new Map();                 // id części architektury → powód
  if (!p) return potrzebne;
  const nazwa = id => p.uczestnik?.get(id)?.nazwa || id;
  const dodaj = (u, powod) => {
    const w = warstwaUczestnika(p.uczestnik?.get(u));
    if (w && !W.has(w) && !potrzebne.has(w)) potrzebne.set(w, powod);
  };
  if (W.has("sql")) for (const k of p.kroki) if (k.rodzaj === "sql") dodaj(k.z, `SQL wychodzi z ${nazwa(k.z)}`);
  if (W.has("transakcje")) for (const t of p.transakcje || []) for (const u of t.uczestnicy) dodaj(u, `transakcja obejmuje ${nazwa(u)}`);
  for (const w of warstwyAdnotacji(adn)) {
    if (!W.has(w.id)) continue;
    for (const u of p.uczestnicy) if (u.klasa && adnotacjeKlasy(adn, u.klasa).includes(w.id)) dodaj(u.id, `„${w.nazwa}” zaznacza ${u.nazwa}`);
  }
  return potrzebne;
}

// rodzaj kroku → warstwa, bez której kroku nie ma
export const WARSTWA_KROKU = { sql: "sql", transakcja: "transakcje", zewnetrzne: "zewnetrzne" };

const PALETA = ["#e4572e", "#4c9f70", "#3a86ff", "#f4a259", "#b15fd6", "#2ec4b6", "#e9c46a", "#ff70a6"];

// adnotacje.json → warstwy (rodzaj „adnotacja”), z kolorem domyślnym z palety
export function warstwyAdnotacji(adn) {
  return (adn?.warstwy || []).map((w, i) => ({ id: `a:${w.id}`, nazwa: w.nazwa || w.id, kolor: w.kolor || PALETA[i % PALETA.length], opis: w.opis,
    kategoria: w.kategoria || "ocena", adnotacja: true, domyslnie: true }));
}

// Cel adnotacji: "pkg.Klasa" (klasa), "pkg.Klasa#metoda" (metoda), "Klasa" / "Klasa#metoda" (krótka nazwa),
// "sql:/regex/flagi" (zapytania), "rodzaj:sql|transakcja|zewnetrzne…" (rodzaj kroku), "przebieg:/regex/" (request).
function regexZ(tekst) {
  const m = /^\/(.*)\/([a-z]*)$/.exec(tekst.trim());
  try { return m ? new RegExp(m[1], m[2]) : new RegExp(tekst.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); } catch { return /$^/; }
}
const pasujeKlasa = (wzor, klasa) => !!klasa && (klasa === wzor || klasa.endsWith("." + wzor) || klasa.endsWith("$" + wzor));

export function dopasujCel(cel, { klasa, metoda, krok, przebieg }) {
  if (cel.startsWith("sql:")) return krok?.rodzaj === "sql" && regexZ(cel.slice(4)).test(krok.sql || "");
  if (cel.startsWith("rodzaj:")) return krok?.rodzaj === cel.slice(7);
  if (cel.startsWith("przebieg:")) return !!przebieg && regexZ(cel.slice(9)).test(przebieg.wejscie?.nazwa || "");
  const [k, m] = cel.split("#");
  if (!pasujeKlasa(k, klasa)) return false;
  return m ? metoda === m : true;
}

// Kolory (id warstw adnotacji) dla uczestnika: cele klasowe i metodowe tej klasy.
export function adnotacjeKlasy(adn, klasa) {
  const w = new Set();
  for (const a of adn?.na || []) if (a.cel.split("#")[0] && !a.cel.includes(":") && pasujeKlasa(a.cel.split("#")[0], klasa)) for (const x of a.warstwy || []) w.add(`a:${x}`);
  return [...w];
}
// Kolory dla kroku: cele metodowe, SQL, rodzaj, przebieg.
export function adnotacjeKroku(adn, krok, przebieg) {
  const w = new Set();
  for (const a of adn?.na || []) {
    const metodowy = a.cel.includes("#") || a.cel.includes(":");
    if (metodowy && dopasujCel(a.cel, { klasa: krok.klasa, metoda: krok.metoda, krok, przebieg })) for (const x of a.warstwy || []) w.add(`a:${x}`);
  }
  return [...w];
}
// Etykiety (dymki z tekstem i linkiem) dla klasy albo kroku.
export function etykiety(adn, { klasa, metoda, krok, przebieg }) {
  return (adn?.etykiety || []).filter(e => dopasujCel(e.cel, { klasa, metoda, krok, przebieg }));
}

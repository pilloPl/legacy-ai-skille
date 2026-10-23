// Korelacja linii logów aplikacji bez identyfikatora requestu z przebiegami.
// Kolejność zaufania: (1) trace_id / nasz kor w linii — obsługuje źródło; (2) wątek + okno czasu requestu;
// (3) samo okno czasu, gdy w tej chwili trwał dokładnie jeden request — „przybliżone”; inaczej linia zostaje bez
// przypisania (widoczna jako niepewna, nie trafia do żadnego przebiegu).

// Nazwy wątków w logach bywają ucięte (Spring Boot: 15 znaków, wyrównane do prawej) — porównujemy końcówki.
export function tenSamWatek(a, b) {
  if (!a || !b) return false;
  a = String(a).trim(); b = String(b).trim();
  return a === b || a.endsWith(b) || b.endsWith(a);
}

// okna requestów z rekordów jednego trace: [start, koniec] i wątki (z atrybutu thread.name spanów)
export function oknoRequestu(rekordy) {
  const spany = rekordy.filter(r => r.typ === "span");
  if (!spany.length) return null;
  return {
    start: Math.min(...spany.map(s => s.start)), koniec: Math.max(...spany.map(s => s.koniec)),
    watki: [...new Set(spany.map(s => s.atrybuty?.["thread.name"]).filter(Boolean))], spany,
  };
}

// Przypisz linię (bez trace) do jednego z okien. okna: Map(trace → okno)
export function przypisz(linia, okna) {
  const t = linia.ts ?? (linia.start + linia.koniec) / 2, kandydaci = [...okna].filter(([, o]) => t >= o.start - 1 && t <= o.koniec + 1);
  const poWatku = kandydaci.filter(([, o]) => o.watki.some(w => tenSamWatek(w, linia.watek)));
  if (poWatku.length === 1) return wynik(linia, poWatku[0], "watek+czas");
  if (poWatku.length > 1) return null;                                    // ten sam wątek w dwóch oknach — nie zgadujemy
  if (!linia.watek && kandydaci.length === 1) return wynik(linia, kandydaci[0], "czas (przybliżone)");
  return null;
}
function wynik(linia, [trace, okno], pewnosc) {
  // najgłębszy span (tego wątku, jeśli znany), który trwał w chwili linii; zapytanie z logu bazy — bez spanów bazy
  const t = linia.ts ?? (linia.start + linia.koniec) / 2;
  const sp = okno.spany.filter(s => t >= s.start && t <= s.koniec && !(linia.typ === "span" && s.atrybuty?.["db.statement"] != null)
      && (!linia.watek || tenSamWatek(s.atrybuty?.["thread.name"], linia.watek)))
    .sort((a, b) => (b.start - a.start) || (a.koniec - b.koniec))[0];
  const atrybuty = { ...(linia.atrybuty || {}), "flowlens.korelacja": pewnosc };
  return linia.typ === "span" ? { ...linia, trace, rodzic: sp?.span || "", atrybuty } : { ...linia, trace, span: sp?.span || "", atrybuty };
}

// Bufor linii bez trace: trzymamy je chwilę, aż przebieg się zamknie, wtedy dopasowujemy.
export class BuforLogow {
  constructor({ wiek = 60000 } = {}) { this.linie = []; this.wiek = wiek; }
  dodaj(linie) {
    this.linie.push(...linie);
    const granica = Date.now() - this.wiek;
    this.linie = this.linie.filter(l => (l._przyszla ??= Date.now()) >= granica);
  }
  // dla zamykanego trace: linie, które przypisanie (na tle wszystkich znanych okien) daje temu trace
  dopasuj(trace, okna) {
    if (!okna.has(trace)) return [];
    const wziete = [];
    this.linie = this.linie.filter(l => {
      const p = przypisz(l, okna);
      if (p && p.trace === trace) { wziete.push(p); return false; }
      return true;
    });
    return wziete;
  }
}

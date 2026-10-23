// Etapy kroku: co dzieje się w kroku, po kolei. Zależą od rodzaju kroku i od włączonych warstw.
// Krok bez etapów (np. SQL przy wyłączonej warstwie SQL) znika z przebiegu.
import { WARSTWA_KROKU, warstwaUczestnika } from "./warstwy.js";
import { krotkaKlasa, ms, sqlKrotko, sqlCel } from "./dane.js";

const nazwa = (p, id) => p.uczestnik.get(id)?.nazwa || krotkaKlasa(id);

// Uczestnik, od którego rysujemy strzałkę: z kroku, a gdy jest ukryty (np. wyłączone repozytoria) — od
// najbliższego widocznego przodka (krok nadrzędny z przebiegu).
export function zKogo(k, W) {
  let u = k.z, r = k;
  while (ukryty(k.p, u, W)) {
    r = r.rodzic != null ? r.p.kroki[r.rodzic] : null;
    if (!r) return "wejscie";                         // nikt widoczny wyżej: od świata
    u = r.do !== u ? r.do : r.z;
  }
  return u;
}
// Dokąd rysować krok: zwykle do celu; krok „w miejscu” (commit przy klasie) albo cel ukryty — do najbliższej widocznej.
export const doKogo = (k, W) => (k.z === k.do || ukryty(k.p, k.do, W) ? zKogo(k, W) : k.do);
export const ukryty = (p, id, W) => { const w = warstwaUczestnika(p.uczestnik.get(id)); return !!w && !W.has(w); };

// Log kluczowy = wnosi coś, czego nie ma w spanach: SQL z wartościami parametrów (echo ORM) albo wzorzec, który
// uznaliśmy za ważny w analizie (adnotacje.json: "wazne_logi": ["regex", …]). Pozostałe logi są tylko w konsoli.
const SQL_W_LOGU = /^\s*(select|insert|update|delete|merge|with|call)\b|\b(select\s.+\sfrom|insert\s+into|update\s+\S+\s+set|delete\s+from)\b|^\s*\[(generated|cached)[^\]]*\]\s*[{(]/i;
let WAZNE = [];
export function ustawWazneLogi(wzorce = []) {
  WAZNE = wzorce.map(w => { try { const m = /^\/(.*)\/([a-z]*)$/.exec(w); return m ? new RegExp(m[1], m[2]) : new RegExp(w, "i"); } catch { return null; } }).filter(Boolean);
}
export function kluczowyLog(l) {
  if (SQL_W_LOGU.test(l.tekst || "")) return "SQL / parametry w logu";
  const w = WAZNE.find(r => r.test(l.tekst || ""));
  return w ? `ważny wg analizy (${w.source})` : null;
}

// Składowe kroku: to, co dzieje się wokół niego w tej samej chwili (proxy, aspekty) — nie osobne kroki.
export function opisSkladowych(k, W) {
  const cz = [];
  const tx = k.skladowe?.find(x => x.rodzaj === "transakcja");
  if (tx && W.has("transakcje")) cz.push(tx.faza === "start" ? "start transakcji" : "dołącza do transakcji");
  const wew = k.skladowe?.find(x => x.rodzaj === "wewnetrzne");
  if (wew) cz.push(`wewnątrz: ${wew.metody.map(m => `${m.metoda}()${m.razy > 1 ? ` ×${m.razy}` : ""}`).join(", ")}`);
  return cz.join(" · ");
}

export function etapyKroku(k, W) {
  const warstwa = WARSTWA_KROKU[k.rodzaj];
  if (warstwa && !W.has(warstwa)) return [];
  if (k.rodzaj === "powrot") return [];                                 // powrotów nie pokazujemy
  // wejście do klasy z ukrytej części architektury (np. domena wyłączona) — kroku nie ma
  if (["klasa", "repozytorium", "wejscie"].includes(k.rodzaj) && k.do !== "wejscie" && ukryty(k.p, k.do, W)) return [];
  const p = k.p, E = [];
  const dodaj = (typ, tytul, dlaczego, extra = {}) => E.push({ typ, tytul, dlaczego, ts: k.ts, k, ...extra });
  const z = nazwa(p, zKogo(k, W)), cel = nazwa(p, k.do);
  const czas = k.czas ? ` · ${ms(k.czas)}` : "";
  switch (k.rodzaj) {
    case "wejscie": {
      const w = k.wejscie || p.wejscie;
      dodaj("wejscie", `${w.rodzaj === "http" ? `${w.metoda} ${w.sciezka || w.nazwa}` : w.nazwa} → ${cel}${k.metoda ? `.${k.metoda}()` : ""}`,
        `${w.rodzaj === "http" ? "Request HTTP" : w.rodzaj === "kolejka" ? "Wiadomość z kolejki" : "Zadanie w tle"} wchodzi do aplikacji` +
        `${k.metoda ? ` przez ${cel}.${k.metoda}()` : ""}. Cały request trwał ${ms(p.czas)}${w.status ? `, odpowiedź ${w.status}` : ""}.`);
      break;
    }
    case "klasa": {
      const petla = k.powtorzen ? ` ×${k.powtorzen}${k.petla ? ` (pętla, ${k.petla} wywołania w obrocie)` : ""}` : "";
      const skl = opisSkladowych(k, W);
      // krok ze statycznego szkieletu (CodeGraph): nie widzieliśmy wykonania — „potwierdzony”, gdy pod nim padł SQL
      const stat = k.statyczny ? (k.potwierdzony ? " · statycznie, potwierdzone SQL" : " · statycznie (możliwe)") + (k.zgadniety ? " · wywołanie zgadnięte" : "") : "";
      const txS = W.has("transakcje") && k.skladowe?.find(x => x.rodzaj === "transakcja");
      dodaj("klasa", (k.samWsobie ? `${cel}.${k.metoda}() — wywołanie przez this` : `${z} → ${cel}.${k.metoda}()${czas}`) + petla + (skl ? ` · ${skl}` : "") + stat,
        (k.samWsobie ? `${cel} woła własną metodę ${k.metoda}(). Z zewnątrz nie widać tego wywołania, a proxy (transakcje, cache, bezpieczeństwo) go nie obejmuje.`
          : `${z} woła ${cel}.${k.metoda}(). Metoda trwała ${ms(k.czas)} razem ze wszystkim, co wywołała.`)
        + (k.statyczny ? ` Ten krok pochodzi z grafu kodu (CodeGraph), nie z wykonania${k.potwierdzony ? " — ale pod nim padło zapytanie złapane w logu bazy, więc ta ścieżka się wykonała" : "; nie ma pod nim SQL-a, który by go potwierdził"}.` : "")
        + (k.powtorzen ? ` W pętli: ${k.powtorzen} obrotów bez zapytań do bazy (razem ${ms(k.czasRazem)}) — pokazujemy pierwszy.` : "")
        + (k.skladowe?.find(x => x.rodzaj === "wewnetrzne") ? ` W środku ${cel} woła tylko własne metody, które nie wychodzą poza klasę — zebrane w tym kroku zamiast osobnych kroków.` : "")
        + (txS ? ` Nad tym wejściem (w proxy @Transactional): ${txS.faza === "start" ? "start transakcji — wszystko w środku, aż do commitu, jest w jednej transakcji" : "dołączenie do trwającej transakcji (propagacja REQUIRED): nowej nie ma, wyjątek tutaj wycofa całość"}.` : ""),
        k.ostrzezenie ? { ostrzezenie: k.ostrzezenie } : {});
      break;
    }
    case "repozytorium":
      dodaj("repozytorium", `${z} → ${cel}.${k.metoda}()${czas}`, `Dostęp do danych przez repozytorium ${cel}. Zapytania SQL, które wygenerowało, są kolejnymi krokami.`);
      break;
    case "sql": {
      const n = p.kroki.filter(x => x.rodzaj === "sql" && x.sql === k.sql).length;
      dodaj("sql", `SQL ${k.operacja || ""} ${sqlCel(k)}${czas}${k.zrodloSql === "log-bazy" ? " · z logu bazy" : ""}${k.flush ? " · flush przy commicie" : ""}${k.niedopasowane ? " · niedopasowane" : ""}`.replace(/\s+/g, " "),
        `${z} wysyła do bazy: ${sqlKrotko(k.sql, 160)}` + (n > 1 ? ` To samo zapytanie pada w tym requeście ${n} razy — sprawdź, czy to nie N+1 albo zapytanie w pętli.` : ""),
        { sql: k.sql });
      break;
    }
    case "zewnetrzne":
      dodaj("zewnetrzne", `${z} → ${cel}: ${k.opis || "wywołanie"}${czas}`, `Wywołanie innego systemu (${cel}). Do czasu odpowiedzi request czeka.`);
      break;
    case "transakcja":
      if (k.faza === "start" && k.zrodlo === "SQL") dodaj("tx-start", `transakcja: BEGIN (${z})`, `Kod sam otwiera transakcję w bazie (BEGIN). Trwa do COMMIT/ROLLBACK na tym samym połączeniu.`);
      else if (k.faza === "start") dodaj("tx-start", `transakcja: start przy ${cel}.${k.metoda}()`, `Metoda ma @Transactional (z mapy, czyli z kodu). Wywołanie z innej klasy idzie przez proxy, które otwiera transakcję.`);
      else if (k.faza === "dolacza") dodaj("tx-start", `transakcja: ${cel}.${k.metoda}() dołącza do trwającej`, `Metoda ma @Transactional, ale na tym wątku trwa już transakcja — domyślna propagacja (REQUIRED) dołącza do niej zamiast otwierać nową. Wyjątek tutaj wycofa całość.`);
      else if (k.faza === "rollback") dodaj("tx-commit", `transakcja: ROLLBACK${czas}`, `Transakcja jest wycofywana — zmiany z jej zakresu nie trafią do bazy.`);
      else dodaj("tx-commit", `transakcja: commit${k.przezProxy ? ` przy wyjściu z ${cel}` : ""}${czas}`,
        `Transakcja jest zatwierdzana. Zmiany z sesji ORM trafiają do bazy dopiero teraz (flush), więc tu mogą pojawić się INSERT/UPDATE.`
        + (k.przezProxy ? ` Commit robi proxy @Transactional na granicy ${cel} — po wyjściu z metody, zanim wynik wróci do wołającego.` : ""));
      break;
    case "powrot":
      dodaj("powrot", `${cel} ← ${nazwa(p, k.z)}.${k.metoda}()`, `${nazwa(p, k.z)}.${k.metoda}() zwraca wynik do ${cel}.`);
      break;
    default:
      dodaj(k.rodzaj, k.rodzaj, "");
  }
  // Log to log: na rysunku i w krokach tylko kluczowy (SQL z parametrami, albo wzorzec z analizy); reszta w konsoli
  if (W.has("logi")) for (const [j, l] of (k.logi || []).entries()) {
    const powod = kluczowyLog(l);
    if (powod) E.push({ typ: "log", tytul: `log ${l.poziom || ""}: ${l.tekst}`.replace(/\s+/g, " "), dlaczego: `${powod}: ${l.tekst}`, ts: l.ts, k, log: l, j });
  }
  E.forEach((e, i) => { e.id = `${k.id}:${e.typ}:${e.j ?? i}`; e.i = i; });
  return E;
}

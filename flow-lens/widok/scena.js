// Scena: przebieg jednego requestu przez klasy (SVG). Układ wyliczany z przebiegu: wiersze według poziomu z mapy
// (wejście u góry, baza na dole, inne systemy z prawej), kolumny według kolejności pierwszego udziału.
// Gdy klas jest dużo, scena jest większa niż okno i się przewija — nic się nie ściska.
// Stan sceny zależy od (krok, etap): `rysuj` rysuje stan po etapie, `przejscie` animuje dojście do niego.
import { ukryty, zKogo, doKogo } from "./etapy.js";
import { adnotacjeKlasy, adnotacjeKroku, etykiety } from "./warstwy.js";
import { krotkaKlasa, sqlKrotko, sqlCel, ms, tabeleSql, operacjaSql } from "./dane.js";
const NS = "http://www.w3.org/2000/svg";

export function el(tag, atr = {}, dzieci = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atr)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  for (const d of [].concat(dzieci)) if (d != null) e.append(d instanceof Node ? d : document.createTextNode(String(d)));
  return e;
}
const txt = (x, y, s, klasa = "maly", atr = {}) => el("text", { x, y, class: klasa, ...atr }, s);
export const skrocLinie = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

const BOX = { w: 214, h: 62 }, ODST = { x: 34, y: 70 }, MARG = { l: 150, t: 34, r: 40, b: 40 };
const KOLOR_KROKU = { wejscie: "var(--c-wejscie)", klasa: "var(--accent)", repozytorium: "var(--c-repo)", sql: "var(--c-sql)",
  zewnetrzne: "var(--c-zew)", "tx-start": "var(--c-tx)", "tx-commit": "var(--c-tx)", powrot: "var(--c-powrot)", log: "var(--c-log)" };
const KOLOR_ROLI = { wejscie: "var(--c-wejscie)", aplikacja: "var(--c-aplikacja)", domena: "var(--c-domena)", repozytorium: "var(--c-repo)",
  baza: "var(--c-baza)", zewnetrzny: "var(--c-zew)", endpoint: "var(--c-wejscie)" };
const NAZWA_ROLI = { wejscie: "wejście", aplikacja: "aplikacja", domena: "domena", repozytorium: "dostęp do danych", baza: "baza danych",
  zewnetrzny: "inny system", endpoint: "endpoint", klasa: "klasa", swiat: "z zewnątrz" };

const rolaU = u => (u.rodzaj === "klasa" ? u.rola || "klasa" : u.rodzaj);
const PASMO = { swiat: 0, endpoint: 1, wejscie: 1, aplikacja: 2, domena: 3, klasa: 3, repozytorium: 4, baza: 5 };
const pasmo = u => (u.rodzaj === "wejscie" ? 0 : PASMO[rolaU(u)] ?? 3);

export class Scena {
  constructor(svg, ramka, naCel) {
    Object.assign(this, { svg, ramka, naCel });
    this.klucz = null;
  }

  klik(g, cel, arg) {
    g.classList.add("klik");
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    const wywolaj = e => { e.stopPropagation(); this.naCel(cel, arg); };
    g.addEventListener("click", wywolaj);
    g.addEventListener("keydown", e => { if (e.key === "Enter") wywolaj(e); });
    return g;
  }

  // ——— układ przebiegu (liczony raz na przebieg i zestaw warstw) ———
  uklad(p, W) {
    const pierwszy = new Map();
    p.kroki.forEach((k, i) => { for (const u of [k.z, k.do]) if (!pierwszy.has(u)) pierwszy.set(u, i); });
    const widoczni = p.uczestnicy.filter(u => pierwszy.has(u.id) && !ukryty(p, u.id, W) && !(u.rodzaj === "baza" && !W.has("sql")));
    // Poziom rysunku = pasmo roli (wejście, aplikacja, domena, repozytoria, baza), a w domenie głębokość wywołania
    // w tym przebiegu (najpłycej, gdzie klasa się pojawiła). Wyżej = bliżej wejścia, niżej = bliżej bazy.
    const glebokosc = new Map();
    for (const k of p.kroki) if (["klasa", "wejscie", "repozytorium"].includes(k.rodzaj))
      glebokosc.set(k.do, Math.min(glebokosc.get(k.do) ?? 1e9, k.glebokosc || 0));
    const domenowe = [...new Set(widoczni.filter(u => pasmo(u) === 3).map(u => glebokosc.get(u.id) ?? 0))].sort((a, b) => a - b);
    const poziom = u => pasmo(u) * 1000 + (pasmo(u) === 3 ? domenowe.indexOf(glebokosc.get(u.id) ?? 0) : 0);
    const glowni = widoczni.filter(u => u.rodzaj !== "zewnetrzny");
    const poziomy = [...new Set(glowni.map(poziom))].sort((a, b) => a - b);
    const wiersze = poziomy.map(pz => glowni.filter(u => poziom(u) === pz).sort((a, b) => pierwszy.get(a.id) - pierwszy.get(b.id)));
    const poz = new Map();
    let maxX = 0;
    wiersze.forEach((w, r) => w.forEach((u, c) => {
      const p_ = { x: MARG.l + c * (BOX.w + ODST.x), y: MARG.t + r * (BOX.h + ODST.y), w: BOX.w, h: BOX.h, wiersz: r };
      poz.set(u.id, p_);
      maxX = Math.max(maxX, p_.x + BOX.w);
    }));
    const zew = widoczni.filter(u => u.rodzaj === "zewnetrzny").sort((a, b) => pierwszy.get(a.id) - pierwszy.get(b.id));
    const xZew = maxX + 90;
    zew.forEach((u, j) => poz.set(u.id, { x: xZew, y: MARG.t + (1 + j) * (BOX.h + ODST.y), w: BOX.w, h: BOX.h, wiersz: 1 + j }));
    const szer = (zew.length ? xZew + BOX.w : maxX) + MARG.r;
    // pod bazą lista tabel (do 10 wierszy) — miejsce na nią
    const ileTabel = new Set(p.kroki.filter(k => k.rodzaj === "sql").flatMap(k => tabeleSql(k.sql))).size;
    const podBaza = widoczni.some(u => u.rodzaj === "baza") ? Math.min(ileTabel, 10) * 15 + (ileTabel > 10 ? 15 : 0) + 16 : 0;
    const wys = MARG.t + Math.max(wiersze.length, zew.length + 1) * (BOX.h + ODST.y) - ODST.y + MARG.b + 40 + podBaza;
    return { poz, wiersze, szer: Math.max(szer, 600), wys };
  }

  // ——— statyczna część: wiersze i pudełka uczestników ———
  przygotuj(p, W, kontekst) {
    const klucz = `${p.id}|${["wejscia", "aplikacja", "domena", "repozytoria", "zewnetrzne", "sql"].map(w => W.has(w)).join()}`;
    if (klucz === this.klucz) return;
    this.klucz = klucz;
    this.p = p;
    this.L = this.uklad(p, W);
    const { szer, wys } = this.L;
    this.svg.setAttribute("viewBox", `0 0 ${szer} ${wys}`);
    this.svg.setAttribute("width", szer);
    this.svg.setAttribute("height", wys);
    this.svg.replaceChildren();
    // przebudowa (inny request albo inne warstwy) bez animacji przejść — inaczej nowe pudełka mignęłyby, zanim
    // rysuj() ukryje te, które jeszcze nie brały udziału
    this.svg.classList.add("bez-przejsc");
    requestAnimationFrame(() => requestAnimationFrame(() => this.svg.classList.remove("bez-przejsc")));
    this.tlo = el("g"); this.slady = el("g"); this.tx = el("g"); this.pudla = el("g"); this.ruch = el("g"); this.dymki = el("g");
    this.svg.append(this.tlo, this.slady, this.tx, this.pudla, this.ruch, this.dymki);
    // etykiety wierszy (rola przeważająca w wierszu)
    this.L.wiersze.forEach((w, r) => {
      const y = MARG.t + r * (BOX.h + ODST.y) + BOX.h / 2;
      const role = w.map(u => (u.rodzaj === "wejscie" ? "swiat" : rolaU(u))), rola = role.sort((a, b) => role.filter(x => x === b).length - role.filter(x => x === a).length)[0];
      this.tlo.append(el("line", { x1: 16, y1: y + BOX.h / 2 + ODST.y / 2, x2: this.L.szer - 16, y2: y + BOX.h / 2 + ODST.y / 2, class: "wiersz-linia" }),
        txt(18, y + 4, NAZWA_ROLI[rola] || rola, "wiersz-etyk"));
    });
    this.g = new Map();
    for (const [id, q] of this.L.poz) {
      const u = p.uczestnik.get(id);
      const g = el("g", { id: `u-${this.g.size}`, class: kontekst.odkrywanie ? "uczestnik bez-udzialu" : "uczestnik" });
      const kol = KOLOR_ROLI[rolaU(u)] || "var(--fg2)";
      if (u.rodzaj === "baza") {
        const cx = q.x + q.w / 2, s = { fill: "var(--bg)", stroke: `color-mix(in srgb, ${kol} 60%, var(--line))`, "stroke-width": 1.4 };
        g.append(el("path", { d: `M${q.x} ${q.y + 10} v${q.h - 20} a${q.w / 2} 10 0 0 0 ${q.w} 0 v-${q.h - 20}`, ...s, class: "podswietl" }),
          el("ellipse", { cx, cy: q.y + 10, rx: q.w / 2, ry: 10, ...s }),
          txt(q.x + 12, q.y + 36, "baza danych", "rola"), txt(q.x + 12, q.y + 52, skrocLinie(u.nazwa, 26), "nazwa"));
      } else if (u.rodzaj === "wejscie") {
        g.append(el("rect", { x: q.x, y: q.y, width: q.w, height: q.h, rx: 30, class: "ramka podswietl", fill: "var(--bg)" }),
          txt(q.x + 16, q.y + 24, skrocLinie(u.nazwa, 30), "rola"), txt(q.x + 16, q.y + 44, skrocLinie(kontekst.opisWejscia, 26), "nazwa rozmyj"));
      } else {
        g.append(el("rect", { x: q.x, y: q.y, width: q.w, height: q.h, class: "ramka podswietl", fill: "var(--bg)",
            style: `stroke:color-mix(in srgb, ${kol} 55%, var(--line))` }),
          txt(q.x + 14, q.y + 18, `${NAZWA_ROLI[rolaU(u)] || rolaU(u)}${u.wysylaSql ? " · SQL" : ""}`, "rola", { fill: kol }),
          txt(q.x + 14, q.y + 37, skrocLinie(u.nazwa, 25), "nazwa"),
          el("text", { x: q.x + 14, y: q.y + 54, class: "metoda" }));
        const t = el("title"); t.textContent = (u.klasa || u.nazwa) + (u.wysylaSql ? "\nWysyła SQL bez repozytorium (sterownik, JdbcTemplate, query builder albo leniwe ładowanie ORM) — też dostęp do danych" : ""); g.append(t);
      }
      g.append(el("g", { class: "paski" }));
      this.klik(g, u.rodzaj === "baza" ? "baza" : "uczestnik", id);
      this.pudla.append(g);
      this.g.set(id, g);
    }
  }

  // ——— stan po etapie i kroku ki listy (lista = widoczne kroki bieżącego przebiegu, każdy z .E) ———
  rysuj(lista, ki, i, opcje) {
    const { W, odkrywanie, adn, aktywneAdn } = opcje;
    const k = lista[ki];
    if (!k) return;
    const p = k.p;
    this.przygotuj(p, W, { odkrywanie, opisWejscia: p.wejscie.rodzaj === "http" ? `${p.wejscie.metoda} ${p.wejscie.sciezka}` : p.wejscie.nazwa });
    for (const a of this.svg.getAnimations({ subtree: true })) a.cancel();
    this.ruch.replaceChildren(); this.slady.replaceChildren(); this.tx.replaceChildren(); this.dymki.replaceChildren();
    this.naPudle = new Map();
    const e = k.E[i];
    const dotad = lista.slice(0, ki + 1);
    const od = x => zKogo(x, W), cel = x => doKogo(x, W);

    // udział: kto już brał udział (odkrywanie) + ostatnia metoda na każdym pudełku
    const udzial = new Set(), metoda = new Map();
    for (const x of dotad) {
      udzial.add(od(x)); udzial.add(cel(x));
      if (["klasa", "repozytorium", "wejscie"].includes(x.rodzaj) && x.metoda) metoda.set(x.do, x.metoda);
    }
    const aktywni = new Set([od(k), cel(k)]);
    for (const [id, g] of this.g) {
      g.classList.toggle("bez-udzialu", odkrywanie && !udzial.has(id));
      g.classList.toggle("aktywny", aktywni.has(id));
      const m = g.querySelector(".metoda");
      if (m) m.textContent = metoda.has(id) ? skrocLinie(`${metoda.get(id)}()`, 28) : "";
      // paski adnotacji (klasa i jej metody): jeden pudełko może mieć kilka kolorów
      const u = p.uczestnik.get(id), q = this.L.poz.get(id), pas = g.querySelector(".paski");
      pas.replaceChildren();
      const kol = (u.klasa ? adnotacjeKlasy(adn, u.klasa) : []).filter(a => aktywneAdn.has(a));
      kol.forEach((a, j) => pas.append(el("rect", { x: q.x + 1 + j * 7, y: q.y + 1, width: 6, height: q.h - 2, fill: opcje.kolorWarstwy(a) })));
      if (kol.length) for (const t of g.querySelectorAll("text")) t.setAttribute("x", q.x + 14 + kol.length * 7);
    }

    // ślad: dotychczasowe wywołania (bez bieżącego), zagregowane po parze z → do, z licznikiem powtórzeń
    const pary = new Map();
    for (const x of dotad.slice(0, -1)) {
      if (x.rodzaj === "transakcja") continue;
      const kl = `${od(x)}→${cel(x)}`;
      pary.set(kl, (pary.get(kl) || 0) + 1);
    }
    for (const [kl, n] of pary) {
      const [a, b] = kl.split("→");
      const d = this.sciezka(a, b);
      if (!d) continue;
      this.slady.append(el("path", { d: d.d, class: "slad" }));
      if (n > 1) this.slady.append(txt(d.srodek[0] + 6, d.srodek[1] - 4, `×${n}`, `slad-licznik ${n >= 3 ? "duzo" : ""}`));
    }

    // transakcje: obszar obejmujący wszystkie pudełka, które brały w niej udział do bieżącego kroku (kilka klas,
    // kilka warstw, baza) — od początku do commitu/końca metody; po zakończeniu znika
    if (W.has("transakcje")) for (const t of p.transakcje || []) {
      if (k.nr < t.od || k.nr > t.do) continue;
      const ids = new Set();
      for (const nr of t.kroki) {
        if (nr > k.nr) break;
        const x = p.kroki[nr];
        if (x.rodzaj === "transakcja" && x.faza !== "start") continue;   // commit: span pod wołającym (proxy), bez nowych pudełek
        const kto = nr === t.od || nr === t.glowa ? [x.do] : [od(x), x.do];   // wołający jest przed proxy — poza transakcją
        for (const u of kto) if (this.L.poz.has(u) && p.uczestnik.get(u)?.rodzaj !== "wejscie") ids.add(u);
      }
      if (!ids.size) continue;
      const bb = [...ids].map(u => this.L.poz.get(u)), m = 12 + 6 * (t.nr % 3);
      const x1 = Math.min(...bb.map(q => q.x)) - m, y1 = Math.min(...bb.map(q => q.y)) - m - 14;
      const x2 = Math.max(...bb.map(q => q.x + q.w)) + m, y2 = Math.max(...bb.map(q => q.y + q.h)) + m;
      const konczy = k.nr === t.koniecNr && t.koniec !== "koniec metody";
      this.tx.append(el("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 10, class: "tx-obszar" }),
        txt(x1 + 10, y1 + 12, `transakcja · ${(p.uczestnik.get(t.wlasciciel)?.nazwa || "?")}${t.metoda ? `.${t.metoda}()` : ""} · ${t.zrodlo}${t.przyblizonyStart ? " (start ≈ 1. dostęp do bazy)" : ""}${t.zagniezdzona ? " · osobna, w środku innej (REQUIRES_NEW / inne połączenie)" : ""}${konczy ? ` · ${t.koniec.toUpperCase()}` : ""}`, "tx-etyk"));
      for (const z of t.poza) {
        if (z.nr > k.nr) continue;
        const q = this.L.poz.get(p.kroki[z.nr].do);
        if (q) this.tx.append(txt(q.x, q.y + q.h + 14, `⚠ poza transakcją: wątek ${z.watek}`, "ostrzezenie"));
      }
    }

    // bieżący krok: strzałka, etykieta, karta
    const kol = KOLOR_KROKU[e?.typ] || KOLOR_KROKU[k.rodzaj] || "var(--accent)";
    const d = this.sciezka(od(k), cel(k));
    this.biezaca = null;
    if (d && e && e.typ !== "log") {
      const s = el("g", { class: "strzalka-g" });
      const przerywana = k.statyczny && !k.potwierdzony;           // statycznie, bez potwierdzenia z wykonania
      const path = el("path", { d: d.d, class: "strzalka", stroke: kol, pathLength: 1, "stroke-dasharray": przerywana ? "0.025 0.015" : null, "marker-end": null });
      s.append(path, this.grot(d, kol));
      const kropki = adnotacjeKroku(adn, k, p).filter(a => aktywneAdn.has(a));
      const [lx, ly] = d.srodek;
      kropki.forEach((a, j) => s.append(el("circle", { cx: lx + 8 + j * 12, cy: ly - 18, r: 4.5, fill: opcje.kolorWarstwy(a) })));
      let lxs = lx + 8 + kropki.length * 12;
      const tx = W.has("transakcje") && k.skladowe?.find(x => x.rodzaj === "transakcja");
      if (tx) {                                       // składowa: dzieje się nad tym krokiem (proxy), nie osobny krok
        const t = tx.faza === "start" ? "TX start" : "TX dołącza", w = t.length * 6.6 + 12;
        s.append(el("rect", { x: lxs, y: ly - 27, width: w, height: 17, rx: 8, class: "skladowa" }), txt(lxs + 6, ly - 15, t, "skladowa-etyk"));
        lxs += w + 6;
      }
      const wew = k.skladowe?.find(x => x.rodzaj === "wewnetrzne");
      if (wew) {                                      // składowa: własne metody klasy wołane w środku (bez skutków na zewnątrz)
        const n = wew.metody.reduce((a, m) => a + m.razy, 0), t = `+${n} wewn.`, w = t.length * 6.6 + 12;
        const g = el("g", {}, [el("rect", { x: lxs, y: ly - 27, width: w, height: 17, rx: 8, class: "skladowa-wew" }), txt(lxs + 6, ly - 15, t, "skladowa-wew-etyk")]);
        const tt = el("title"); tt.textContent = wew.metody.map(m => `${m.metoda}()${m.razy > 1 ? ` ×${m.razy}` : ""}`).join(", "); g.append(tt);
        s.append(g);
        lxs += w + 6;
      }
      s.append(txt(lxs, ly - 14, this.etykietaKroku(k), "strzalka-etyk rozmyj", { fill: kol }));
      this.klik(s, "krok", k.id);
      this.ruch.append(s);
      this.biezaca = { path, d, kol };
    }
    if (k.ostrzezenie) {
      const q = this.L.poz.get(k.do);
      if (q) this.ruch.append(txt(q.x, q.y + q.h + 16, `⚠ ${k.ostrzezenie}`, "ostrzezenie"));
    }
    // tabele pod bazą: dotknięte do tego miejsca, bieżące zapytanie podświetlone
    if (W.has("sql")) {
      const biez = e?.typ === "sql" ? new Set(tabeleSql(k.sql)) : new Set();
      const mapa_ = new Map();
      let idBazy = null;
      for (const x of dotad) if (x.rodzaj === "sql") {
        idBazy = idBazy || x.do;
        for (const t of tabeleSql(x.sql)) {
          if (!mapa_.has(t)) mapa_.set(t, new Map());
          const o = operacjaSql(x), m_ = mapa_.get(t);
          m_.set(o, (m_.get(o) || 0) + (x.powtorzen || 1));
        }
      }
      if (idBazy) this.tabeleBazy(idBazy, [...mapa_].map(([tabela, ops]) => ({ tabela, ops, aktywna: biez.has(tabela) }))
        .sort((a, b) => b.aktywna - a.aktywna || [...b.ops.values()].reduce((x, y) => x + y, 0) - [...a.ops.values()].reduce((x, y) => x + y, 0)));
    }

    // etykiety (nasze dymki z linkami) przy klasach, które już brały udział
    for (const [id, q] of this.L.poz) {
      const u = p.uczestnik.get(id);
      if (!u.klasa || (odkrywanie && !udzial.has(id))) continue;
      const ety = etykiety(adn, { klasa: u.klasa, przebieg: p }).filter(x => !x.warstwa || aktywneAdn.has(`a:${x.warstwa}`));
      ety.slice(0, 2).forEach((x, j) => this.dymek(x, q, j, opcje));
    }
    const ety = etykiety(adn, { klasa: k.klasa, metoda: k.metoda, krok: k, przebieg: p }).filter(x => (x.cel.includes("#") || x.cel.includes(":")) && (!x.warstwa || aktywneAdn.has(`a:${x.warstwa}`)));
    const qk = this.L.poz.get(k.do);
    if (qk) ety.slice(0, 2).forEach((x, j) => this.dymek(x, qk, j + 2, opcje));
    // karta z treścią: SQL przy bazie, log przy klasie, która go wypisała
    if (e?.typ === "sql") this.karta(e.sql, this.L.poz.get(k.do), "var(--c-sql)", k.id, "nad");
    if (e?.typ === "log") this.karta(`${e.log.poziom ? e.log.poziom + " " : ""}${e.log.tekst}`, this.L.poz.get(cel(k)) || this.L.poz.get(od(k)), "var(--c-log)", k.id, "pod");

  }

  // Tabele pod bazą: nazwa, operacje z licznikami; bieżące zapytanie podświetla swoje tabele; kropki = requesty (mapa).
  // wpisy: [{ tabela, ops: Map(op → n), aktywna, kolory: [] }]
  tabeleBazy(idBazy, wpisy) {
    const q = this.L.poz.get(idBazy);
    if (!q || !wpisy.length) return;
    const g = el("g", { class: "tabele-bazy" });
    const pokaz = wpisy.slice(0, 10);
    pokaz.forEach((w, j) => {
      const y = q.y + q.h + 18 + j * 15;
      const ops = [...w.ops].map(([o, n]) => `${o[0]}${n > 1 ? `×${n}` : ""}`).join(" ");
      if (w.aktywna) g.append(el("rect", { x: q.x - 4, y: y - 11, width: q.w + 8, height: 14, rx: 3, class: "tabela-aktywna" }));
      (w.kolory || []).forEach((c, i) => g.append(el("circle", { cx: q.x + 4 + i * 8, cy: y - 4, r: 3, fill: c })));
      const x0 = q.x + 4 + (w.kolory?.length || 0) * 8 + (w.kolory?.length ? 4 : 0);
      g.append(txt(x0, y, skrocLinie(w.tabela, 22), `tabela-nazwa ${w.aktywna ? "aktywna" : ""}`), txt(q.x + q.w - 4, y, ops, "tabela-ops", { "text-anchor": "end" }));
    });
    if (wpisy.length > 10) g.append(txt(q.x + 4, q.y + q.h + 18 + 10 * 15, `+${wpisy.length - 10} tabel — kliknij bazę`, "tabela-ops"));
    this.klik(g, "baza", idBazy);
    this.dymki.append(g);
  }

  etykietaKroku(k) {
    if (k.rodzaj === "sql") { const t = tabeleSql(k.sql); return `${operacjaSql(k)} ${t.slice(0, 2).join(", ")}${t.length > 2 ? ` +${t.length - 2}` : ""} · ${ms(k.czas)}`; }
    if (k.rodzaj === "zewnetrzne") return skrocLinie(k.opis, 40);
    if (k.rodzaj === "transakcja") return k.faza === "start" ? `@Transactional ${k.metoda}()` : "commit";
    if (k.rodzaj === "wejscie" && !k.metoda) return k.p.wejscie.nazwa;
    return `${k.metoda}()${k.powtorzen ? ` ×${k.powtorzen}` : ""}${k.czas ? ` · ${ms(k.czasRazem ?? k.czas)}` : ""}`;
  }

  // ścieżka od pudełka a do b (w dół, w górę, w bok, albo pętla dla wywołania przez this)
  sciezka(a, b) {
    const A = this.L.poz.get(a), B = this.L.poz.get(b);
    if (!A || !B) return null;
    if (a === b) {
      const x = A.x + A.w, y1 = A.y + 16, y2 = A.y + A.h - 14;
      return { d: `M${x} ${y1} C ${x + 46} ${y1 - 6}, ${x + 46} ${y2 + 6}, ${x + 2} ${y2}`, srodek: [x + 34, A.y + A.h / 2], kon: [x + 2, y2], kier: [-1, 0] };
    }
    const acx = A.x + A.w / 2, bcx = B.x + B.w / 2;
    if (B.y > A.y + 1) {
      const x1 = acx + Math.max(-A.w / 3, Math.min(A.w / 3, (bcx - acx) / 4)), y1 = A.y + A.h, x2 = bcx - Math.max(-B.w / 3, Math.min(B.w / 3, (bcx - acx) / 4)), y2 = B.y;
      const my = (y1 + y2) / 2;
      // podpis tuż pod źródłem (w odstępie między wierszami), nie w połowie długiej strzałki
      return { d: `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 2}`, srodek: [x1, y1 + 32], kon: [x2, y2 - 2], kier: [0, 1] };
    }
    if (B.y < A.y - 1) {
      const x1 = acx, y1 = A.y, x2 = bcx, y2 = B.y + B.h, my = (y1 + y2) / 2;
      return { d: `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 + 2}`, srodek: [x1, y1 - 18], kon: [x2, y2 + 2], kier: [0, -1] };
    }
    const wPrawo = B.x > A.x, x1 = wPrawo ? A.x + A.w : A.x, x2 = wPrawo ? B.x : B.x + B.w, y = A.y + A.h / 2;
    return { d: `M${x1} ${y} C ${(x1 + x2) / 2} ${y - 26}, ${(x1 + x2) / 2} ${y - 26}, ${x2 + (wPrawo ? -2 : 2)} ${y}`, srodek: [(x1 + x2) / 2, y - 20], kon: [x2 + (wPrawo ? -2 : 2), y], kier: [wPrawo ? 1 : -1, 0] };
  }
  grot(d, kol) {
    const [x, y] = d.kon, [dx, dy] = d.kier, s = 7;
    const px = -dy, py = dx;
    return el("path", { d: `M${x} ${y} L${x - dx * s * 1.4 + px * s * .7} ${y - dy * s * 1.4 + py * s * .7} L${x - dx * s * 1.4 - px * s * .7} ${y - dy * s * 1.4 - py * s * .7} Z`, fill: kol });
  }

  karta(tekst, q, kol, krokId, gdzie) {
    if (!q) return;
    const linie = String(tekst || "").replace(/\s+/g, " ").trim().match(/.{1,46}(\s|$)|.{46}/g)?.slice(0, 4) || [""];
    const w = 330, h = 14 + linie.length * 15;
    // obok pudełka (z prawej, a gdy brak miejsca — z lewej); scena poszerza się, jeśli trzeba
    let x = q.x + q.w + 18;
    if (x + w > this.L.szer - 8) x = q.x - w - 18 >= 8 ? q.x - w - 18 : x;
    const y = (gdzie === "nad" ? q.y + q.h - h : q.y) + 25 * (this.naPudle.get(q) || 0);
    if (this.naPudle.get(q)) x = Math.max(x, q.x + q.w + 52);
    if (x + w + 8 > this.L.szer) { this.L.szer = x + w + 16; this.svg.setAttribute("width", this.L.szer); this.svg.setAttribute("viewBox", `0 0 ${this.L.szer} ${this.L.wys}`); }
    const g = el("g", { class: "karta" });
    g.append(el("rect", { x, y, width: w, height: h, fill: "var(--bg)", stroke: kol, "stroke-width": 1.4 }), el("rect", { x, y, width: 4, height: h, fill: kol }),
      ...linie.map((l, j) => txt(x + 12, y + 17 + j * 15, l.trim(), "maly rozmyj")));
    this.klik(g, "krok", krokId);
    this.ruch.append(g);
    this.kartaG = g;
  }

  dymek(x, q, j, opcje) {
    const n = this.naPudle.get(q) || 0, w = 220, h = 22, dx = q.x + q.w + 52, dy = q.y + n * 25;
    this.naPudle.set(q, n + 1);
    if (dx + w + 8 > this.L.szer) { this.L.szer = dx + w + 16; this.svg.setAttribute("width", this.L.szer); this.svg.setAttribute("viewBox", `0 0 ${this.L.szer} ${this.L.wys}`); }
    const g = el("g", { class: "etykieta-adn" });
    const kol = x.warstwa ? opcje.kolorWarstwy(`a:${x.warstwa}`) : "var(--accent)";
    g.append(el("rect", { x: dx, y: dy, width: w, height: h, fill: "var(--bg2)", stroke: kol, "stroke-width": 1.2, rx: 3 }),
      txt(dx + 8, dy + 15, skrocLinie(`${x.link ? "↗ " : "ⓘ "}${x.tekst}`, 30)));
    const t = el("title"); t.textContent = x.tekst + (x.link ? `\n${x.link}` : ""); g.append(t);
    this.klik(g, "etykieta", x);
    this.dymki.append(g);
  }

  // przewiń tak, żeby aktywne pudełka (i karta) były w oknie
  pokazAktywne() {
    const r = this.ramka, akt = [...this.svg.querySelectorAll(".uczestnik.aktywny"), this.kartaG].filter(x => x?.isConnected);
    if (!akt.length) return;
    const bb = akt.map(x => x.getBBox());
    const x1 = Math.min(...bb.map(b => b.x)) - 40, x2 = Math.max(...bb.map(b => b.x + b.width)) + 40;
    const y1 = Math.min(...bb.map(b => b.y)) - 40, y2 = Math.max(...bb.map(b => b.y + b.height)) + 40;
    let { scrollLeft: sl, scrollTop: st } = r;
    if (x2 <= r.clientWidth) sl = 0;                       // mieści się od lewej: zostaw podpisy wierszy w oknie
    else if (x1 < sl) sl = x1; else if (x2 > sl + r.clientWidth) sl = Math.min(x1, x2 - r.clientWidth);
    if (y1 < st) st = y1; else if (y2 > st + r.clientHeight) st = Math.min(y1, y2 - r.clientHeight);
    if (sl !== r.scrollLeft || st !== r.scrollTop) r.scrollTo({ left: Math.max(0, sl), top: Math.max(0, st) });
  }

  // ——— przejście do etapu: strzałka rysuje się od źródła, karta wjeżdża ———
  async przejscie(lista, ki, i, opcje, T) {
    this.kartaG = null;
    this.rysuj(lista, ki, i, opcje);
    this.pokazAktywne();
    const anims = [];
    const a = (elm, k, d = T, opt = {}) => { const x = elm.animate(k, { duration: d, easing: "cubic-bezier(.4,0,.2,1)", ...opt }); anims.push(x); return x; };
    if (this.biezaca) {
      const { path } = this.biezaca;
      if (!path.getAttribute("stroke-dasharray")) {
        path.setAttribute("stroke-dasharray", "1 1");
        a(path, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], T * .6, { fill: "both" });
      }
      const grot = path.nextSibling;
      if (grot) a(grot, [{ opacity: 0 }, { opacity: 0, offset: .55 }, { opacity: 1 }], T * .65, { fill: "both" });
    }
    if (this.kartaG) a(this.kartaG, [{ opacity: 0, transform: "translate(0, 8px)" }, { opacity: 1, transform: "translate(0, 0)" }], T * .5, { delay: T * .3, fill: "both" });
    const nowe = [...this.svg.querySelectorAll(".uczestnik.aktywny:not(.bez-udzialu)")];
    for (const g of nowe) a(g, [{ opacity: .4 }, { opacity: 1 }], T * .4, { fill: "backwards" });
    await Promise.all(anims.map(x => x.finished.catch(() => {})));
  }

  wyczysc() { this.klucz = null; this.svg.replaceChildren(); this.svg.removeAttribute("width"); this.svg.removeAttribute("height"); }
}

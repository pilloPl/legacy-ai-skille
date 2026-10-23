// Inspektor: prawdziwe dane klikniętego elementu (krok, klasa, SQL, log, etykieta). Rama skopiowana z harness-lens.
import { krotkaKlasa, ms, sqlCel, tabeleSql, operacjaSql } from "./dane.js";
import { adnotacjeKlasy, adnotacjeKroku, etykiety } from "./warstwy.js";

const h = (tag, atr = {}, ...dzieci) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(atr)) {
    if (k === "on") for (const [ev, f] of Object.entries(v)) e.addEventListener(ev, f);
    else if (k === "html") e.innerHTML = v;
    else if (v != null) e.setAttribute(k, v);
  }
  for (const d of dzieci.flat()) if (d != null) e.append(d instanceof Node ? d : document.createTextNode(String(d)));
  return e;
};

// Tekst skrócony do n linii z „pokaż całość”.
export function skrot(tekst, n = 8, znakow = 1600) {
  tekst = String(tekst ?? "");
  let pokaz = tekst.split("\n").slice(0, n).join("\n");
  if (pokaz.length > znakow) pokaz = pokaz.slice(0, znakow);
  const pre = h("pre", { class: "tresc" }, pokaz);
  if (pokaz.length >= tekst.length) return pre;
  const btn = h("button", { class: "skrot" }, `pominięto ${tekst.length - pokaz.length} znaków — pokaż całość`);
  btn.addEventListener("click", () => { pre.textContent = tekst; btn.remove(); });
  return h("div", {}, pre, btn);
}
const wiersz = (glowny, meta, klik, pod) => {
  const e = h(klik ? "button" : "div", { class: "wiersz" }, h("span", { class: "glowny" }, glowny, pod ? h("span", { class: "pod" }, pod) : null), h("span", { class: "meta" }, meta ?? ""));
  if (klik) e.addEventListener("click", klik);
  return e;
};
const znacznik = (t, k) => h("span", { class: `znacznik ${k}` }, t);
const tabela = pary => h("table", { class: "tabela" }, pary.filter(Boolean).map(([a, b]) => h("tr", {}, h("td", {}, a), h("td", {}, b))));
const naglowek = t => h("h3", {}, t);
const surowy = obj => {
  const d = h("div", { class: "surowy" });
  const b = h("button", {}, "pokaż surowy JSON");
  b.addEventListener("click", () => d.replaceChildren(skrot(JSON.stringify(obj, (k, v) => (k === "p" ? undefined : v), 2), 60, 20000)));
  d.append(b);
  return d;
};
const ZNACZNIK_ROLI = { wejscie: "", aplikacja: "k-aplikacja", domena: "k-domena", repozytorium: "k-repo", baza: "k-sql", zewnetrzny: "k-zew" };

export class Inspektor {
  constructor(okruszki, tresc, naCel) {
    Object.assign(this, { okruszki, tresc, naCel });
    this.sciezka = [];
  }
  otworz(cel, arg, ctx, { nowa = false } = {}) {
    if (nowa) this.sciezka = [];
    const i = this.sciezka.findIndex(s => s.cel === cel && s.arg === arg);
    if (i >= 0) this.sciezka = this.sciezka.slice(0, i + 1);
    else this.sciezka.push({ cel, arg });
    this.ctx = ctx;
    this.rysuj();
  }
  odswiez(ctx) { this.ctx = ctx; if (this.sciezka.length) this.rysuj(); }
  rysuj() {
    const { cel, arg } = this.sciezka[this.sciezka.length - 1];
    const widok = this[`v_${cel}`] ? this[`v_${cel}`](arg) : { tytul: cel, el: h("div", { class: "pusto" }, "Brak widoku.") };
    this.okruszki.replaceChildren(h("span", {}, `REQUEST #${this.ctx.p?.nr ?? "–"}`),
      ...this.sciezka.flatMap((s, i) => {
        const t = i === this.sciezka.length - 1 ? widok.tytul : (this[`v_${s.cel}`]?.(s.arg)?.tytul ?? s.cel);
        const e = i === this.sciezka.length - 1 ? h("span", { class: "ost" }, t)
          : h("button", { on: { click: () => { this.sciezka = this.sciezka.slice(0, i + 1); this.rysuj(); } } }, t);
        return [h("span", {}, "›"), e];
      }));
    this.tresc.replaceChildren(widok.el);
    this.tresc.scrollTop = 0;
  }
  idz(cel, arg) { return () => this.otworz(cel, arg, this.ctx); }
  kolory(ids) {
    return ids.map(a => { const w = this.ctx.warstwa(a); return w ? h("span", {}, h("i", { class: "adn-kolor", style: `background:${w.kolor}` }), w.nazwa, " ") : null; });
  }
  etykietyEl(lista) {
    return lista.map(e => wiersz(e.tekst, e.link ? h("a", { href: e.link, target: "_blank", rel: "noopener" }, "otwórz ↗") : "", null, e.cel));
  }

  // ——— widoki ———
  v_krok(id) {
    const { p, adn } = this.ctx;
    const k = p?.kroki.find(x => x.id === id);
    if (!k) return { tytul: "krok", el: h("div", { class: "pusto" }, "Ten krok jest w innym requeście.") };
    const u = x => p.uczestnik.get(x);
    const el = h("div", {});
    el.append(naglowek(`krok ${k.nr} · ${k.rodzaj}`), tabela([
      ["skąd", u(k.z)?.klasa || u(k.z)?.nazwa],
      ["dokąd", h("button", { class: "skrot", on: { click: this.idz("uczestnik", k.do) } }, u(k.do)?.klasa || u(k.do)?.nazwa)],
      k.metoda && ["metoda", `${k.metoda}()`],
      ["czas", ms(k.czas)], ["od startu requestu", ms(k.ts)],
      k.faza && ["transakcja", `${k.faza} (${k.zrodlo})`],
      k.skladowe?.length && ["składowe", k.skladowe.map(x => x.rodzaj === "wewnetrzne"
        ? `${x.opis}: ${x.metody.map(m => `${m.metoda}()${m.razy > 1 ? ` ×${m.razy}` : ""}`).join(", ")}`
        : `${x.opis || x.rodzaj}: ${x.faza === "start" ? "start transakcji" : x.faza === "dolacza" ? "dołącza do trwającej" : x.faza}`).join("; ")],
      k.blad && ["błąd", h("span", { class: "k-deny" }, k.blad)],
      k.ostrzezenie && ["uwaga", h("span", { class: "k-ask" }, k.ostrzezenie)],
    ]));
    const kol = adnotacjeKroku(adn, k, p);
    if (kol.length) el.append(naglowek("adnotacje"), h("div", {}, this.kolory(kol)));
    const ety = etykiety(adn, { klasa: k.klasa, metoda: k.metoda, krok: k, przebieg: p });
    if (ety.length) el.append(naglowek("etykiety"), ...this.etykietyEl(ety));
    if (k.sql) {
      const takie = p.kroki.filter(x => x.rodzaj === "sql" && x.sql === k.sql);
      el.append(naglowek(`SQL · ${k.operacja || ""} ${sqlCel(k)}`), skrot(k.sql, 30, 8000));
      if (takie.length > 1) el.append(h("p", { class: "k-ask" }, `To samo zapytanie ${takie.length} razy w tym requeście (kroki ${takie.map(x => x.nr).join(", ")}).`));
    }
    if (k.wejscie) el.append(naglowek("wejście"), tabela(Object.entries(k.wejscie).filter(([, v]) => v != null && v !== "")));
    if (k.atrybuty) el.append(naglowek("atrybuty"), tabela(Object.entries(k.atrybuty).map(([a, b]) => [a, String(b)])));
    if (k.logi?.length) {
      el.append(naglowek(`logi (${k.logi.length})`));
      for (const l of k.logi) el.append(wiersz(h("span", { class: "rozmyj" }, l.tekst), `${l.poziom || ""} ${ms(l.ts)}`, null, l.zrodlo));
    }
    el.append(surowy(k));
    return { tytul: `krok ${k.nr}`, el };
  }

  v_uczestnik(id) {
    const { p, mapa, adn } = this.ctx;
    const u = p?.uczestnik.get(id);
    if (!u) return { tytul: "klasa", el: h("div", { class: "pusto" }, "Brak w tym requeście.") };
    const wpis = u.klasa ? mapa?.klasy?.[u.klasa] : null;
    const el = h("div", {});
    el.append(naglowek(u.rodzaj === "klasa" ? u.rola : u.rodzaj), tabela([
      ["nazwa", u.klasa || u.nazwa],
      wpis?.plik && ["plik", wpis.plik],
      u.poziom != null && u.poziom < 90 && ["poziom", String(u.poziom)],
      wpis?.powod && ["dlaczego w mapie", `${wpis.powod}${wpis.pewnosc === "pewne" ? "" : " (do potwierdzenia)"}`],
    ]));
    if (u.klasa) {
      const kol = adnotacjeKlasy(adn, u.klasa);
      if (kol.length) el.append(naglowek("adnotacje"), h("div", {}, this.kolory(kol)));
      const ety = etykiety(adn, { klasa: u.klasa, przebieg: p });
      if (ety.length) el.append(naglowek("etykiety"), ...this.etykietyEl(ety));
    }
    const kroki = p.kroki.filter(k => (k.do === id || k.z === id) && k.rodzaj !== "powrot");   // powrotów nie pokazujemy
    el.append(naglowek(`w tym requeście (${kroki.length})`));
    for (const k of kroki.slice(0, 200)) el.append(wiersz(
      k.rodzaj === "sql" ? h("span", { class: "rozmyj" }, `${k.operacja} ${sqlCel(k)}`) : `${k.z === id && k.do !== id ? "→ " + krotkaKlasa(p.uczestnik.get(k.do)?.nazwa) + "." : ""}${k.metoda || k.rodzaj}()`,
      `#${k.nr} · ${ms(k.czas)}`, () => this.naCel("skok", k.id)));
    return { tytul: u.nazwa, el };
  }

  // mapa: kto (które requesty) dotyka tej klasy i jakimi metodami / zapytaniami
  v_mapaKlasa(id) {
    const { naMapie = [], kolorReq, mapa } = this.ctx;
    const u = naMapie.map(p => p.uczestnik.get(id)).find(Boolean);
    if (!u) return { tytul: "klasa", el: h("div", { class: "pusto" }, "Brak na mapie.") };
    const wpis = u.klasa ? mapa?.klasy?.[u.klasa] : null;
    const el = h("div", {});
    el.append(naglowek(u.rodzaj === "klasa" ? u.rola : u.rodzaj), tabela([["nazwa", u.klasa || u.nazwa], wpis?.plik && ["plik", wpis.plik]]));
    const kto = naMapie.filter(p => p.kroki.some(k => k.z === id || k.do === id));
    el.append(naglowek(`requesty, które tu przechodzą (${kto.length}/${naMapie.length})`));
    for (const p of kto) {
      const metody = [...new Set(p.kroki.filter(k => k.do === id && k.metoda).map(k => `${k.metoda}()`))];
      const sql = p.kroki.filter(k => k.rodzaj === "sql" && k.z === id);
      el.append(wiersz(h("span", {}, h("i", { class: "adn-kolor", style: `background:${kolorReq(p.id)}` }), p.wejscie.nazwa),
        `${metody.length} metod · ${sql.length} SQL`, null, [metody.slice(0, 4).join(", "), ...[...new Set(sql.map(k => sqlCel(k)))].slice(0, 3).map(t => `SQL ${t}`)].filter(Boolean).join(" · ")));
    }
    return { tytul: u.nazwa, el };
  }

  // baza: tabele z liczbą zapytań per operacja; w mapie — per request
  v_baza(id) {
    const { p, naMapie = [], kolorReq, naMapieTryb } = this.ctx;
    const przebiegi = naMapieTryb ? naMapie : p ? [p] : [];
    const tab = new Map();
    for (const pr of przebiegi) for (const k of pr.kroki) if (k.rodzaj === "sql" && k.do === id) for (const t of tabeleSql(k.sql)) {
      if (!tab.has(t)) tab.set(t, { ops: new Map(), req: new Map(), przyklad: k });
      const w = tab.get(t), o = operacjaSql(k), n = k.powtorzen || 1;
      w.ops.set(o, (w.ops.get(o) || 0) + n);
      w.req.set(pr, (w.req.get(pr) || 0) + n);
    }
    const el = h("div", {}, naglowek(`tabele (${tab.size})`));
    for (const [t, w] of [...tab].sort((a, b) => [...b[1].ops.values()].reduce((x, y) => x + y) - [...a[1].ops.values()].reduce((x, y) => x + y))) {
      const kto = naMapieTryb ? h("span", {}, ...[...w.req.keys()].map(pr => h("i", { class: "adn-kolor", style: `background:${kolorReq(pr.id)}` }))) : null;
      el.append(wiersz(h("span", {}, kto, t), [...w.ops].map(([o, n]) => `${o} ×${n}`).join(" · "), () => this.naCel("skok", w.przyklad.id), w.przyklad.sql.slice(0, 120)));
    }
    if (!tab.size) el.append(h("div", { class: "pusto" }, "Brak zapytań do tej bazy."));
    return { tytul: "baza", el };
  }

  v_etykieta(e) {
    const el = h("div", {}, naglowek("etykieta"), h("p", {}, e.tekst), tabela([["cel", e.cel], e.warstwa && ["warstwa", e.warstwa]]));
    if (e.link) el.append(h("p", {}, h("a", { href: e.link, target: "_blank", rel: "noopener" }, `otwórz ${e.link} ↗`)));
    return { tytul: "etykieta", el };
  }

  v_przebieg() {
    const { p } = this.ctx;
    const el = h("div", {});
    el.append(naglowek("request"), tabela([
      ["wejście", p.wejscie.nazwa], ["status", String(p.wejscie.status ?? "")], ["czas", ms(p.czas)],
      ["kroki", String(p.kroki.length)], ["SQL", String(p.statystyki.sql)], ["logi", String(p.statystyki.logi)],
      ["spany (wszystkie / zwinięte)", `${p.statystyki.spany} / ${p.statystyki.zwiniete}`], ["źródła", p.zrodla.join(", ")],
      p.bezMapy && ["mapa", h("span", { class: "k-ask" }, "brak — widać tylko wejście, repozytoria, SQL i inne systemy")],
    ]));
    const sql = new Map();
    for (const k of p.kroki.filter(k => k.rodzaj === "sql")) sql.set(k.sql, [...(sql.get(k.sql) || []), k]);
    const powt = [...sql.values()].filter(v => v.length > 1).sort((a, b) => b.length - a.length);
    if (powt.length) {
      el.append(naglowek("powtarzane zapytania"));
      for (const v of powt) el.append(wiersz(h("span", { class: "rozmyj" }, `${v[0].operacja} ${sqlCel(v[0])}`), `×${v.length}`, () => this.naCel("skok", v[0].id), v[0].sql.slice(0, 120)));
    }
    return { tytul: "request", el };
  }
}

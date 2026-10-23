// Mapa: kilka requestów na jednym rysunku — pełne, końcowe wykonanie każdego (bez kroków i odkrywania), żeby
// zobaczyć, gdzie się spotykają: wspólne klasy, wspólne tabele, transakcje i SQL każdego z nich.
// Układ jak w przebiegu (wiersze wg roli i głębokości), liczony z sumy wybranych requestów.
import { Scena, el } from "./scena.js";
import { etapyKroku, zKogo, doKogo, ukryty } from "./etapy.js";
import { adnotacjeKlasy } from "./warstwy.js";
import { sqlCel, ms, tabeleSql, operacjaSql } from "./dane.js";

export const KOLORY_REQ = ["#3a86ff", "#ff7f51", "#2ec4b6", "#e9c46a", "#b15fd6", "#ef476f", "#8ac926", "#4cc9f0"];
const txt = (x, y, s, klasa, atr = {}) => el("text", { x, y, class: klasa, ...atr }, s);

// uczestnicy, którzy coś znaczą przy porównaniu (bez świata, endpointu i bazy — bazę porównujemy tabelami)
const liczy = u => u && !["wejscie", "endpoint", "baza"].includes(u.rodzaj);
export function slad(p) {
  if (!p._slad) {
    const klasy = new Set(p.uczestnicy.filter(liczy).map(u => u.id));
    const tabele = new Set(p.kroki.filter(k => k.rodzaj === "sql").flatMap(k => tabeleSql(k.sql)));
    p._slad = { klasy, tabele };
  }
  return p._slad;
}

// Sugestie: requesty (po jednym na endpoint — najnowszy), które dzielą najwięcej klas i tabel z tym, co jest na mapie.
// Pusta mapa: requesty dotykające klas, przez które przechodzi najwięcej różnych endpointów („węzły”).
export function sugestie(przebiegi, wybrane, ile = 8) {
  const naMapie = new Set(wybrane.map(p => p.id));
  const reprez = new Map();
  for (const p of przebiegi) reprez.set(p.wejscie.nazwa, p);
  const kandydaci = [...reprez.values()].filter(p => !naMapie.has(p.id) && !wybrane.some(w => w.wejscie.nazwa === p.wejscie.nazwa));
  const nazwa = (p, id) => p.uczestnik.get(id)?.nazwa || id;
  if (!wybrane.length) {
    const ileEndpointow = new Map();
    for (const p of reprez.values()) for (const k of slad(p).klasy) ileEndpointow.set(k, (ileEndpointow.get(k) || 0) + 1);
    return kandydaci.map(p => {
      const wezly = [...slad(p).klasy].filter(k => (ileEndpointow.get(k) || 0) > 2).sort((a, b) => ileEndpointow.get(b) - ileEndpointow.get(a));
      return { p, wynik: wezly.length, powod: wezly.length ? `węzły: ${wezly.slice(0, 3).map(k => nazwa(p, k)).join(", ")}${wezly.length > 3 ? ` +${wezly.length - 3}` : ""}` : "" };
    }).filter(s => s.wynik).sort((a, b) => b.wynik - a.wynik).slice(0, ile);
  }
  const klasy = new Set(), tabele = new Set();
  for (const w of wybrane) { slad(w).klasy.forEach(k => klasy.add(k)); slad(w).tabele.forEach(t => tabele.add(t)); }
  return kandydaci.map(p => {
    const wk = [...slad(p).klasy].filter(k => klasy.has(k)), wt = [...slad(p).tabele].filter(t => tabele.has(t));
    const wynik = wk.length + 0.5 * wt.length;
    const cz = [...wk.map(k => nazwa(p, k)), ...wt.map(t => `tabela ${t}`)];
    return { p, wynik, powod: cz.length ? `wspólne: ${cz.slice(0, 3).join(", ")}${cz.length > 3 ? ` +${cz.length - 3}` : ""}` : "" };
  }).filter(s => s.wynik > 0).sort((a, b) => b.wynik - a.wynik).slice(0, ile);
}

// suma wybranych requestów jako jeden „przebieg” do układu
function suma(wybrane) {
  const uczestnik = new Map();
  for (const p of wybrane) for (const u of p.uczestnicy) if (!uczestnik.has(u.id)) uczestnik.set(u.id, u);
  return { id: `mapa:${wybrane.map(p => p.id).join(",")}`, uczestnicy: [...uczestnik.values()], uczestnik, kroki: wybrane.flatMap(p => p.kroki),
    wejscie: { rodzaj: "http", metoda: "", sciezka: `${wybrane.length} request${wybrane.length === 1 ? "" : wybrane.length < 5 ? "y" : "ów"}`, nazwa: "" } };
}

export class MapaScena extends Scena {
  rysujMape(wybrane, opcje) {
    const { W, adn, aktywneAdn, kolorWarstwy, wyrozniony, tylkoWspolne } = opcje;
    this.klucz = null;
    if (!wybrane.length) { this.wyczysc(); return; }
    const S = suma(wybrane);
    this.przygotuj(S, W, { odkrywanie: false, opisWejscia: S.wejscie.sciezka });
    const kolor = new Map(wybrane.map((p, i) => [p.id, KOLORY_REQ[i % KOLORY_REQ.length]]));
    const przyc = p => (wyrozniony && wyrozniony !== p.id ? "przygaszony" : "");

    // kto dotyka którego pudełka (widoczne kroki każdego requestu, z ukrywaniem wg warstw)
    const dotyka = new Map(), metody = new Map();
    for (const p of wybrane) {
      for (const k of p.kroki) {
        if (!etapyKroku(k, W).length) continue;
        for (const u of [zKogo(k, W), doKogo(k, W)]) {
          if (!dotyka.has(u)) dotyka.set(u, new Set());
          dotyka.get(u).add(p.id);
        }
        if (["klasa", "repozytorium", "wejscie"].includes(k.rodzaj) && k.metoda) {
          const u = doKogo(k, W);
          if (!metody.has(u)) metody.set(u, new Set());
          metody.get(u).add(k.metoda);
        }
      }
    }
    // pudełka: wspólne wyróżnione (znaczek + kropki requestów), metody z wszystkich requestów, paski oceny
    for (const [id, g] of this.g) {
      const u = S.uczestnik.get(id), q = this.L.poz.get(id), kto = [...(dotyka.get(id) || [])];
      const liczyU = liczy(u) || u.rodzaj === "baza";
      g.classList.toggle("wspolny", liczyU && kto.length > 1);
      const wspolny = liczyU && kto.length > 1;
      g.classList.toggle("przygaszony", (!!wyrozniony && !kto.includes(wyrozniony)) || (tylkoWspolne && liczyU && !wspolny));
      const m = g.querySelector(".metoda");
      if (m) { const ms_ = [...(metody.get(id) || [])]; m.textContent = ms_.length ? (ms_.length > 2 ? `${ms_.slice(0, 2).join("(), ")}() +${ms_.length - 2}` : `${ms_.join("(), ")}()`) : ""; }
      const pas = g.querySelector(".paski");
      pas.replaceChildren();
      const kol = (u.klasa ? adnotacjeKlasy(adn, u.klasa) : []).filter(a => aktywneAdn.has(a));
      kol.forEach((a, j) => pas.append(el("rect", { x: q.x + 1 + j * 7, y: q.y + 1, width: 6, height: q.h - 2, fill: kolorWarstwy(a) })));
      if (liczyU && kto.length > 1) {
        const w = 22 + kto.length * 9;
        pas.append(el("rect", { x: q.x + q.w - w - 4, y: q.y - 9, width: w, height: 16, rx: 8, class: "wspolny-znaczek" }),
          ...kto.map((rid, j) => el("circle", { cx: q.x + q.w - w + 6 + j * 9, cy: q.y - 1, r: 3.5, fill: kolor.get(rid) })),
          txt(q.x + q.w - 20, q.y + 3, `×${kto.length}`, "wspolny-etyk"));
      }
    }

    // transakcje: obrys w kolorze requestu wokół klas jego transakcji
    if (W.has("transakcje")) for (const [ri, p] of wybrane.entries()) for (const t of p.transakcje || []) {
      const ids = t.uczestnicy.map(u => (ukryty(p, u, W) ? null : u)).filter(u => u && this.L.poz.has(u));
      if (!ids.length) continue;
      const bb = ids.map(u => this.L.poz.get(u)), m = 8 + 4 * (ri % 4);
      const x1 = Math.min(...bb.map(q => q.x)) - m, y1 = Math.min(...bb.map(q => q.y)) - m - 12, x2 = Math.max(...bb.map(q => q.x + q.w)) + m, y2 = Math.max(...bb.map(q => q.y + q.h)) + m;
      this.tx.append(el("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 10, class: `tx-mapa ${przyc(p)}`, stroke: kolor.get(p.id) }),
        txt(x1 + 8 + ri * 150, y1 + 10, `TX #${p.nr} · ${p.uczestnik.get(t.wlasciciel)?.nazwa || ""}`, `tx-etyk ${przyc(p)}`, { fill: kolor.get(p.id) }));
    }

    // strzałki: dla każdego requestu jego wywołania (zagregowane po parze), w jego kolorze, lekko przesunięte
    const n = wybrane.length;
    for (const [ri, p] of wybrane.entries()) {
      const pary = new Map();
      for (const k of p.kroki) {
        if (k.rodzaj === "transakcja" || !etapyKroku(k, W).length) continue;
        const a = zKogo(k, W), b = doKogo(k, W);
        if (a === b && k.rodzaj !== "klasa") continue;
        const kl = `${a}→${b}`;
        pary.set(kl, (pary.get(kl) || 0) + (k.powtorzen || 1));
      }
      const g = el("g", { class: `req-strzalki ${przyc(p)}`, transform: `translate(${(ri - (n - 1) / 2) * 5}, 0)` });
      for (const [kl, ile] of pary) {
        const [a, b] = kl.split("→");
        const d = this.sciezka(a, b);
        if (!d) continue;
        const kol = kolor.get(p.id);
        // „tylko wspólne”: strzałka do / od klasy jednego requestu jest przygaszona
        const sam = id => { const u = S.uczestnik.get(id); return liczy(u) && (dotyka.get(id)?.size || 0) < 2; };
        const cicha = tylkoWspolne && (sam(a) || sam(b)) ? "przygaszony" : "";
        const grot = this.grot(d, kol);
        if (cicha) grot.setAttribute("class", "przygaszony");
        g.append(el("path", { d: d.d, class: `strzalka-mapa ${cicha}`, stroke: kol }), grot);
        if (ile > 1) g.append(txt(d.srodek[0] + 6, d.srodek[1] + 10 + ri * 11, `×${ile}`, "mapa-licznik", { fill: kol }));
      }
      this.slady.append(g);
    }
    this.rysujTabeleMapy(wybrane, kolor, W);
  }

  // (wywoływane na końcu rysujMape) tabele pod bazą z kropkami requestów
  rysujTabeleMapy(wybrane, kolor, W) {
    if (!W.has("sql")) return;
    const wpisy = new Map();
    let idBazy = null;
    for (const p of wybrane) for (const k of p.kroki) if (k.rodzaj === "sql") {
      idBazy = idBazy || k.do;
      for (const t of tabeleSql(k.sql)) {
        if (!wpisy.has(t)) wpisy.set(t, { tabela: t, ops: new Map(), kolory: [], req: new Set() });
        const w = wpisy.get(t), o = operacjaSql(k);
        w.ops.set(o, (w.ops.get(o) || 0) + (k.powtorzen || 1));
        if (!w.req.has(p.id)) { w.req.add(p.id); w.kolory.push(kolor.get(p.id)); }
      }
    }
    if (idBazy) this.tabeleBazy(idBazy, [...wpisy.values()].sort((a, b) => b.req.size - a.req.size || a.tabela.localeCompare(b.tabela)));
  }

  // podsumowanie mapy (do panelu): wspólne klasy i tabele
  static wspolne(wybrane) {
    const klasy = new Map(), tabele = new Map();
    for (const p of wybrane) {
      for (const k of slad(p).klasy) klasy.set(k, [...(klasy.get(k) || []), p]);
      for (const t of slad(p).tabele) tabele.set(t, [...(tabele.get(t) || []), p]);
    }
    const nazwa = id => wybrane.map(p => p.uczestnik.get(id)?.nazwa).find(Boolean) || id;
    return {
      klasy: [...klasy].filter(([, ps]) => ps.length > 1).map(([id, ps]) => ({ id, nazwa: nazwa(id), ps })).sort((a, b) => b.ps.length - a.ps.length),
      tabele: [...tabele].filter(([, ps]) => ps.length > 1).map(([t, ps]) => ({ nazwa: t, ps })).sort((a, b) => b.ps.length - a.ps.length),
    };
  }
}

export const opisReq = p => `${p.wejscie.rodzaj === "http" ? `${p.wejscie.metoda} ${p.wejscie.sciezka || p.wejscie.nazwa}` : p.wejscie.nazwa}`;
export const metaReq = p => `#${p.nr} · ${p.kroki.length} kr. · ${p.statystyki.sql} SQL · ${ms(p.czas)}`;

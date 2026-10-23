// flow-lens: nawigacja po przebiegach (silnik skopiowany z harness-lens: pozycja = (krok, etap), strzałki bez
// zawijania na krańcach, auto/manual z tempem, warstwy 1–9, log z „dlaczego”, narracja, rozdziały, na żywo).
import { wczytajListe, wczytajNagranie, wczytajKonfig, zbuduj, ms, sqlKrotko, sqlCel } from "./dane.js";
import { Scena } from "./scena.js";
import { Inspektor } from "./inspektor.js";
import { MapaScena, sugestie, KOLORY_REQ, opisReq, metaReq } from "./mapa.js";
import { etapyKroku, ustawWazneLogi, kluczowyLog, opisSkladowych } from "./etapy.js";
import { TECHNICZNE, KATEGORIE, ZAWSZE, ARCHITEKTURA, warstwyAdnotacji, dopasujCel, potrzebnaArchitektura } from "./warstwy.js";

const $ = id => document.getElementById(id);
const pamiec = {
  get: k => { try { return localStorage.getItem(`flow.${k}`); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`flow.${k}`, v); } catch {} },
};

const stan = {
  model: null, zrodlo: null, biezaca: null, konfig: { mapa: null, adnotacje: null },
  p: null, lista: [], ki: 0, i: 0, W: new Set(), WARSTWY: [...TECHNICZNE],
  gra: false, przebieg: 0, tempo: Number(pamiec.get("tempo") || 1400), naZywo: false, rozwiniete: new Set(),
  czekajacy: [], odkrywanie: true, rozdzial: -1, konsolaWidac: null, szukaj: "",
};

const scena = new Scena($("scena"), $("scena-ramka"), (cel, arg) => klikSceny(cel, arg));
const mapaScena = new MapaScena($("mapa"), $("mapa-ramka"), (cel, arg) => klikMapy(cel, arg));
const inspektor = new Inspektor($("okruszki"), $("inspektor-tresc"), (cel, arg) => {
  if (cel === "skok") { const k = stan.p?.kroki.find(x => x.id === arg); if (k) skoczDoKroku(k); }
});
const warstwa = id => stan.WARSTWY.find(w => w.id === id);
// adnotacje i mapa z konfiguracji pasują tylko do przebiegów z tego samego projektu
const swoje = () => !stan.p?.projekt || !stan.konfig.mapa?.projekt || stan.p.projekt === stan.konfig.mapa.projekt;
const adnotacje = () => (swoje() ? stan.konfig.adnotacje : null);
const ctx = () => ({ p: stan.p, mapa: swoje() ? stan.konfig.mapa : null, adn: adnotacje(), warstwa, naMapie: wybraneNaMapie(), kolorReq: kolorReq });
const opcjeSceny = () => ({
  W: stan.W, odkrywanie: stan.odkrywanie, adn: adnotacje(),
  aktywneAdn: new Set([...stan.W].filter(x => x.startsWith("a:"))), kolorWarstwy: id => warstwa(id)?.kolor || "var(--accent)",
});

// ——— inspektor: tylko na żądanie ———
function klikSceny(cel, arg) {
  if (cel === "baza") { $("inspektor-panel").hidden = false; inspektor.otworz("baza", arg, ctx(), { nowa: true }); return; }
  if (cel === "etykieta" && arg?.link) { window.open(arg.link, "_blank", "noopener"); return; }
  if (cel === "krok") { const k = stan.p?.kroki.find(x => x.id === arg); if (k && k !== stan.lista[stan.ki]) skoczDoKroku(k); }
  otworzInspektor(cel, arg);
}
function otworzInspektor(cel, arg) {
  if (!stan.p) return;
  $("inspektor-panel").hidden = false;
  inspektor.otworz(cel, arg, ctx(), { nowa: true });
}
function zamknijInspektor() { if ($("inspektor-panel").hidden) return false; $("inspektor-panel").hidden = true; return true; }
$("zamknij").addEventListener("click", zamknijInspektor);

// ——— warstwy: techniczne + adnotacje (z adnotacje.json) ———
function ustawWarstwyZKonfigu() {
  stan.WARSTWY = [...TECHNICZNE, ...warstwyAdnotacji(stan.konfig.adnotacje)];
  const zapis = pamiec.get("warstwy");
  const wyl = new Set(zapis ? JSON.parse(zapis).wylaczone || [] : []);
  const wl = new Set(zapis ? JSON.parse(zapis).wlaczone || [] : []);
  stan.W = new Set([...ZAWSZE, ...stan.WARSTWY.filter(w => wl.has(w.id) || (w.domyslnie && !wyl.has(w.id))).map(w => w.id)]);
}
function zapamietajWarstwy() {
  pamiec.set("warstwy", JSON.stringify({
    wylaczone: stan.WARSTWY.filter(w => w.domyslnie && !stan.W.has(w.id)).map(w => w.id),
    wlaczone: stan.WARSTWY.filter(w => !w.domyslnie && stan.W.has(w.id)).map(w => w.id),
  }));
}
// pasek warstw: kategorie jako równe bloki (nazwa nad przyciskami); 1–9 = kolejne przyciski
function rysujWarstwy() {
  const nav = $("warstwy");
  const elementy = [];
  let nr = 0;
  for (const kat of KATEGORIE) {
    const wk = stan.WARSTWY.filter(w => w.kategoria === kat.id);
    if (!wk.length) continue;
    const zwinieta = zwinieteKategorie().has(kat.id);
    const grupa = document.createElement("div");
    grupa.className = `kategoria kat-${kat.id} ${zwinieta ? "zwinieta" : ""}`;
    grupa.title = kat.opis;
    // nagłówek kategorii zwija/rozwija jej przyciski; zwinięta: licznik włączonych i kropki w ich kolorach
    const nazwa = document.createElement("button");
    nazwa.className = "kat-nazwa";
    const wl = wk.filter(w => stan.W.has(w.id)).length;
    nazwa.innerHTML = `<span class="strzalka-kat">${zwinieta ? "▸" : "▾"}</span><span class="t"></span><span class="ile">${wl}/${wk.length}</span>`;
    nazwa.querySelector(".t").textContent = kat.nazwa;
    nazwa.title = `${zwinieta ? "Rozwiń" : "Zwiń"}: ${kat.opis}`;
    nazwa.addEventListener("click", () => przelaczKategorie(kat.id));
    const chipy = document.createElement("div");
    chipy.className = "kat-chipy";
    if (zwinieta) {
      const kropki = document.createElement("button");
      kropki.className = "kat-kropki";
      kropki.title = wk.map(w => `${w.nazwa}: ${stan.W.has(w.id) ? "włączona" : "wyłączona"}`).join("\n");
      kropki.addEventListener("click", () => przelaczKategorie(kat.id));
      for (const w of wk) {
        const d = document.createElement("span");
        d.className = `kropka ${stan.W.has(w.id) ? "wl" : ""}`;
        d.style.setProperty("--k", w.kolor);
        kropki.append(d);
      }
      chipy.append(kropki);
    }
    for (const w of wk) {
      const i = nr++;
      w.nr = i;
      if (zwinieta) continue;
      const b = document.createElement("button");
      b.className = `chip ${w.adnotacja ? "adn" : ""}`;
      b.style.setProperty("--k", w.kolor);
      b.setAttribute("aria-pressed", String(stan.W.has(w.id)));
      b.innerHTML = `<span class="kropka"></span><span class="n"></span>${i < 9 ? `<span class="nr">${i + 1}</span>` : ""}`;
      b.querySelector(".n").textContent = w.nazwa;
      b.title = w.opis || kat.opis;
      b.addEventListener("click", () => przelaczWarstwe(w.id));
      chipy.append(b);
    }
    grupa.append(nazwa, chipy);
    elementy.push(grupa);
  }
  const wyl = document.createElement("button");
  wyl.className = "wylacz-wszystko";
  wyl.textContent = "wyłącz wszystko";
  wyl.title = "Wyłącz wszystkie warstwy (0). Zostaje szkielet: wejścia, aplikacja, domena.";
  wyl.disabled = !stan.W.size;
  wyl.addEventListener("click", () => { stan.W = new Set(); zastosujWarstwy(); });
  nav.replaceChildren(...elementy, wyl);
}
// zwinięte kategorie paska warstw (zapamiętane w przeglądarce); domyślnie zwinięte: logi i ocena
const zwinieteKategorie = () => { try { return new Set(JSON.parse(pamiec.get("zwiniete") ?? '["logi","ocena"]')); } catch { return new Set(); } };
function przelaczKategorie(id) {
  const z = zwinieteKategorie();
  z.has(id) ? z.delete(id) : z.add(id);
  pamiec.set("zwiniete", JSON.stringify([...z]));
  rysujWarstwy();
}
// włącza części architektury potrzebne włączonym warstwom (np. SQL z repozytorium) — z informacją w stopce
function dociagnijArchitekture() {
  const potrzebne = potrzebnaArchitektura(stan.W, stan.p, adnotacje());
  if (!potrzebne.size) return false;
  for (const id of potrzebne.keys()) stan.W.add(id);
  $("nasluch-tekst").textContent = `włączono: ${[...potrzebne].map(([id, powod]) => `${stan.WARSTWY.find(w => w.id === id)?.nazwa} (${powod})`).join(", ")}`;
  return true;
}
const warstwaNr = n => stan.WARSTWY.find(w => w.nr === n);
function przelaczWarstwe(id) {
  const wlacza = !stan.W.has(id);
  wlacza ? stan.W.add(id) : stan.W.delete(id);
  // włączenie warstwy spoza architektury może wymagać jej części; wyłączenie części architektury — szanujemy
  if (wlacza && !ARCHITEKTURA.includes(id)) dociagnijArchitekture();
  zastosujWarstwy();
}
// zmiana warstw przebudowuje listę kroków; zostajemy przy tym samym kroku (albo najbliższym wcześniejszym widocznym)
function zastosujWarstwy() {
  zapamietajWarstwy();
  rysujWarstwy();
  if (stan.tryb === "mapa") return pokazMape();
  if (!stan.p) return;
  const k = stan.lista[stan.ki];
  przeliczListe();
  const j = k ? stan.lista.findIndex(x => x.nr >= k.nr) : 0;
  stan.ki = j < 0 ? stan.lista.length - 1 : stan.lista[j].nr === k?.nr ? j : Math.max(0, j - 1);
  stan.i = Math.min(stan.i, (stan.lista[stan.ki]?.E.length || 1) - 1);
  pokaz();
}
function przeliczListe(p = stan.p) {
  const lista = [];
  for (const k of p.kroki) { k.E = etapyKroku(k, stan.W); if (k.E.length) lista.push(k); }
  if (p === stan.p) stan.lista = lista;
  return lista;
}

// ——— pozycja: (request, krok, etap) ———
function idzDo(p, ki, i, { animuj = false } = {}) {
  if (!p) return;
  if (p !== stan.p) { stan.p = p; przeliczListe(p); }
  if (!stan.lista.length) { stan.ki = 0; stan.i = 0; return pokaz(); }
  stan.ki = Math.max(0, Math.min(stan.lista.length - 1, ki < 0 ? stan.lista.length + ki : ki));
  const E = stan.lista[stan.ki].E;
  stan.i = Math.max(0, Math.min(E.length - 1, i < 0 ? E.length + i : i));
  return pokaz(animuj);
}
async function pokaz(animuj = false) {
  const { p, lista, ki, i } = stan;
  rysujLog();
  rysujListe();
  rysujNarracje();
  rysujNaglowek();
  pokazKrance();
  if (!$("konsola").hidden) rysujKonsole();
  const k = lista[ki];
  $("pozycja").textContent = k ? `request #${p.nr}/${stan.model.przebiegi.length} · krok ${ki + 1}/${lista.length}${k.E.length > 1 ? ` · ${i + 1}/${k.E.length}` : ""} · +${ms(k.E[i]?.ts ?? k.ts)}` : `request #${p.nr} · brak kroków przy tych warstwach`;
  if (!$("inspektor-panel").hidden) inspektor.odswiez(ctx());
  if (!k) { scena.wyczysc(); return; }
  if (animuj) await scena.przejscie(lista, ki, i, opcjeSceny(), stan.gra ? stan.tempo * .85 : 900);
  else { scena.rysuj(lista, ki, i, opcjeSceny()); scena.pokazAktywne(); }
}
const przebiegi = () => stan.model.przebiegi;
// ←/→ chodzą tylko w obrębie jednego requestu: na jego końcu (i początku) nic się nie dzieje — bez przeskoku do
// sąsiedniego requestu i bez zapętlania. Między requestami: ↑/↓ i lista requestów.
function etapDalej(animuj = true) {
  const k = stan.lista[stan.ki];
  if (k && stan.i < k.E.length - 1) return idzDo(stan.p, stan.ki, stan.i + 1, { animuj });
  if (stan.ki < stan.lista.length - 1) return idzDo(stan.p, stan.ki + 1, 0, { animuj });
  return null;
}
function etapWstecz() {
  if (stan.i > 0) return idzDo(stan.p, stan.ki, stan.i - 1);
  if (stan.ki > 0) return idzDo(stan.p, stan.ki - 1, -1);
}
const naKoncuRequestu = () => stan.ki >= stan.lista.length - 1 && stan.i >= (stan.lista[stan.ki]?.E.length || 1) - 1;
// ↑/↓: poprzedni / następny request; na krańcach nic się nie dzieje
function krok(delta) {
  const P = widoczneRequesty();
  let j = P.indexOf(stan.p);
  if (j < 0) j = delta > 0 ? P.findIndex(p => p.ts > stan.p.ts) - 1 : P.findIndex(p => p.ts >= stan.p.ts);
  const n = P[j + delta];
  if (n) idzDo(n, 0, 0, { animuj: true });
  else if (delta < 0 && (stan.ki > 0 || stan.i > 0)) idzDo(stan.p, 0, 0);
}
function pokazKrance() {
  if (stan.gra || !stan.p) return;
  const P = widoczneRequesty(), j = P.indexOf(stan.p), ost = P.length - 1;
  $("etap-wstecz").disabled = stan.ki === 0 && stan.i === 0;
  $("etap-dalej").disabled = naKoncuRequestu();
  $("krok-wstecz").disabled = j === 0 && stan.ki === 0 && stan.i === 0;
  $("krok-dalej").disabled = j >= 0 && j === ost;
}
function skoczDoKroku(k) {
  if (k.p !== stan.p) { stan.p = k.p; przeliczListe(k.p); }
  let j = stan.lista.indexOf(k);
  if (j < 0) j = Math.max(0, stan.lista.findIndex(x => x.nr > k.nr) - 1);
  skocz(k.p, j, 0);
}

// ——— odtwarzanie ———
async function graj({ najpierwCzekaj = false } = {}) {
  if (stan.gra) return;
  stan.gra = true;
  const moj = ++stan.przebieg;
  pokazTryb();
  if (najpierwCzekaj) await new Promise(r => setTimeout(r, stan.tempo));
  while (stan.gra && moj === stan.przebieg) {
    const t0 = performance.now();
    const p = etapDalej(true);
    if (!p) {
      if (!stan.naZywo) break;
      $("nasluch-tekst").textContent = "czekam na kolejny request…";
      await new Promise(res => stan.czekajacy.push(res));
      continue;
    }
    await p;
    const reszta = stan.tempo - (performance.now() - t0);
    if (reszta > 0) await new Promise(r => setTimeout(r, reszta));
    if (stan.stopNa && stan.stopNa(stan.lista[stan.ki])) { stan.stopNa = null; break; }
  }
  if (moj === stan.przebieg) stopGraj();
}
function pokazTryb() {
  const b = $("graj");
  b.textContent = stan.gra ? "auto" : "manual";
  b.setAttribute("aria-pressed", String(stan.gra));
  for (const id of ["etap-wstecz", "etap-dalej", "krok-wstecz", "krok-dalej"]) $(id).disabled = stan.gra;
  $("tempo").disabled = !stan.gra;
  $("tempo").closest(".tempo").classList.toggle("wylaczone", !stan.gra);
  pokazKrance();
}
function skocz(p, ki, i) {
  const auto = stan.gra;
  stopGraj();
  idzDo(p, ki, i);
  if (auto) graj({ najpierwCzekaj: true });
}
function stopGraj() { stan.gra = false; stan.przebieg++; pokazTryb(); }
function przelaczGraj() { stan.gra ? stopGraj() : graj(); }

// ——— narracja: co będzie dalej ———
function rysujNarracje() {
  const k = stan.lista[stan.ki];
  if (!k) { $("narracja").replaceChildren(); return; }
  const n = przebiegi()[przebiegi().indexOf(stan.p) + 1];
  const dalej = k.E[stan.i + 1] ? k.E[stan.i + 1].tytul
    : stan.lista[stan.ki + 1] ? stan.lista[stan.ki + 1].E[0].tytul
    : n ? `koniec requestu · ↓ następny: #${n.nr} ${n.wejscie.nazwa}`
    : stan.naZywo ? "koniec requestu · czekam na kolejny…" : "koniec requestu i nagrania";
  $("narracja").innerHTML = `<b>następne ▸</b><span class="rozmyj"></span>`;
  $("narracja").querySelector("span").textContent = dalej;
}

// ——— nagłówek nad sceną: request albo rozdział ———
function rysujNaglowek() {
  if (stan.rozdzial >= 0) return rysujRozdzial();
  const p = stan.p, box = $("rozdzial");
  if (!p) return;
  const w = p.wejscie, s = p.statystyki;
  const powt = new Map();
  for (const k of p.kroki) if (k.rodzaj === "sql") powt.set(k.sql, (powt.get(k.sql) || 0) + 1);
  const n1 = [...powt.values()].filter(v => v > 1).length;
  const rozdz = rozdzialy().length ? `<button id="r-dalej" title="Rozdziały (PgDn)">rozdziały ▸</button>` : "";
  box.innerHTML = `<div class="rozdzial-pasek">${rozdz}<h1 class="rozmyj"></h1><button id="o-requescie" class="wiecej">szczegóły ▸</button></div>
    <p>${ms(p.czas)} · ${p.kroki.length} kroków · ${s.sql} SQL${n1 ? ` <span class="k-ask">(${n1} zapytań powtarza się)</span>` : ""} · ${s.logi} logów${w.status ? ` · odpowiedź ${w.status}` : ""}${w.blad ? ` · <span class="k-deny">${w.blad}</span>` : ""}</p>
    ${p.bezMapy ? `<p class="uwaga">Brak mapy: widać tylko wejście, repozytoria, SQL i inne systemy. Zbuduj mapę klas domenowych (skill flow-lens).</p>` : ""}`;
  box.querySelector("h1").textContent = w.rodzaj === "http" ? `${w.metoda} ${w.sciezka || w.nazwa}` : w.nazwa;
  $("o-requescie").onclick = () => otworzInspektor("przebieg");
  if (rozdz) $("r-dalej").onclick = () => ustawRozdzial(0);
}

// ——— rozdziały (z adnotacje.json): nasze opisy miejsc w przepływie, z linkami ———
const rozdzialy = () => adnotacje()?.rozdzialy || [];
function rysujRozdzial(brak = false) {
  const R = rozdzialy(), r = R[stan.rozdzial];
  if (!r) { stan.rozdzial = -1; return rysujNaglowek(); }
  const box = $("rozdzial");
  box.innerHTML = `<div class="rozdzial-pasek">
      <button id="r-wstecz" title="Poprzedni rozdział (PgUp)">◂</button>
      <span class="r-nr">${String(stan.rozdzial + 1).padStart(2, "0")}/${R.length}</span>
      <button id="r-dalej" title="Następny rozdział (PgDn)">▸</button>
      <h1></h1>
      <span class="kropki-rozdzialow">${R.map((x, i) => `<button class="kr ${i === stan.rozdzial ? "on" : ""}" data-i="${i}"></button>`).join("")}</span>
    </div><p class="tekst-r"></p>${r.link ? `<p><a class="wiecej" target="_blank" rel="noopener">więcej ↗</a></p>` : ""}
    ${brak ? `<p class="uwaga">W tym nagraniu nie ma takiego miejsca (${r.przebieg || ""} ${r.krok || ""}).</p>` : ""}`;
  box.querySelector("h1").textContent = r.tytul;
  box.querySelector(".tekst-r").textContent = r.tekst || "";
  if (r.link) Object.assign(box.querySelector("a.wiecej"), { href: r.link });
  $("r-wstecz").onclick = () => (stan.rozdzial === 0 ? wyjdzZRozdzialow() : ustawRozdzial(stan.rozdzial - 1));
  $("r-dalej").onclick = () => ustawRozdzial(stan.rozdzial + 1);
  box.querySelectorAll(".kr").forEach(b => (b.onclick = () => ustawRozdzial(Number(b.dataset.i))));
}
function ustawRozdzial(i) {
  const R = rozdzialy();
  if (!R.length) return;
  stopGraj();
  stan.rozdzial = Math.max(0, Math.min(R.length - 1, i));
  const r = R[stan.rozdzial];
  if (r.warstwy) stan.W = new Set(r.warstwy.map(x => (TECHNICZNE.some(t => t.id === x) ? x : `a:${x}`)));
  const p = przebiegi().find(x => !r.przebieg || dopasujCel(`przebieg:${r.przebieg}`, { przebieg: x }));
  let k = null;
  if (p && r.krok) { przeliczListe(p); const pas = p.kroki.filter(x => x.E?.length && dopasujCel(r.krok, { klasa: x.klasa, metoda: x.metoda, krok: x, przebieg: p }));
    k = pas.find(x => x.rodzaj !== "transakcja" && x.rodzaj !== "powrot") || pas[0]; }
  if (p) {
    stan.p = p;                                     // dociągnięcie architektury patrzy na ten przebieg
    if (r.warstwy) { dociagnijArchitekture(); rysujWarstwy(); }
    stan.p = null;
    idzDo(p, 0, 0);
    if (k) skoczDoKroku(k);
  }
  rysujRozdzial(!p || (r.krok && !k));
}
function wyjdzZRozdzialow() { stan.rozdzial = -1; ustawWarstwyZKonfigu(); rysujWarstwy(); zastosujWarstwy(); }

// ——— log kroków bieżącego requestu (lewy panel), klik = dlaczego ———
function rysujLog() {
  const p = stan.p, ol = $("log");
  $("log-naglowek").textContent = p ? `przebieg · request #${p.nr}` : "przebieg";
  ol.replaceChildren();
  if (!p) return;
  stan.lista.slice(0, stan.ki + 1).forEach((k, kj) => {
    const ile = kj === stan.ki ? stan.i + 1 : k.E.length;
    k.E.slice(0, ile).forEach((e, j) => {
      const li = document.createElement("li");
      const biez = kj === stan.ki && j === stan.i;
      li.className = `linia-logu ${biez ? "biezaca" : ""} ${stan.rozwiniete.has(e.id) ? "rozwinieta" : ""} t-${e.typ}`;
      li.style.paddingLeft = `${Math.min(k.glebokosc || 0, 10) * 6}px`;
      const b = document.createElement("button");
      b.innerHTML = `<span class="czas">+${ms(e.ts)}</span><span class="tytul rozmyj"></span>`;
      b.querySelector(".tytul").textContent = e.tytul;
      b.title = "Kliknij: dlaczego?";
      b.addEventListener("click", () => {
        stan.rozwiniete.has(e.id) ? stan.rozwiniete.delete(e.id) : stan.rozwiniete.add(e.id);
        if (kj !== stan.ki || j !== stan.i) skocz(p, kj, j); else rysujLog();
      });
      li.append(b);
      if (stan.rozwiniete.has(e.id)) {
        const d = document.createElement("p");
        d.className = "dlaczego rozmyj";
        d.textContent = e.dlaczego;
        li.append(d);
      }
      ol.append(li);
    });
  });
  ol.querySelector(".biezaca")?.scrollIntoView({ block: "nearest" });
}

// ——— konsola: logi i SQL do bieżącego miejsca (jak tabela w lensie: widać tylko to, co już się wydarzyło) ———
function rysujKonsole() {
  const box = $("konsola"), p = stan.p;
  if (!p) { box.innerHTML = ""; return; }
  // wszystko, co do tej chwili wypisała aplikacja i wysłała do bazy — niezależnie od warstw rysunku
  const biez = stan.lista[stan.ki], tsTeraz = biez?.E[stan.i]?.ts ?? biez?.ts ?? 0;
  const poprz = stan.konsolaWidac || new Set(), teraz = new Set(), wpisy = [];
  for (const k of p.kroki) {
    if (!biez || k.nr > biez.nr) break;
    const wTymKroku = k.nr === biez.nr;
    if (k.rodzaj === "sql") wpisy.push({ id: `${k.id}:sql`, rodz: "sql", t: k.ts, r: "SQL", x: sqlKrotko(k.sql, 400), kl: k.blad ? "blad" : "", k });
    for (const [j, l] of (k.logi || []).entries()) {
      if (wTymKroku && l.ts > tsTeraz + 0.001) continue;
      wpisy.push({ id: `${k.id}:log:${j}`, rodz: "log", t: l.ts, r: l.poziom || "log", x: l.tekst, kl: `${l.poziom || ""} ${kluczowyLog(l) ? "kluczowy" : ""}`, k, j });
    }
  }
  wpisy.sort((a, b) => a.t - b.t);
  box.innerHTML = `<h2>konsola · logi i SQL</h2>${wpisy.length ? "" : `<p class="pusto">Jeszcze nic — logi i zapytania pojawią się tu, gdy request do nich dojdzie.</p>`}`;
  const etap = biez?.E[stan.i];
  for (const w of wpisy) {
    teraz.add(w.id);
    const d = document.createElement("div");
    const biezacy = w.k === biez && (w.rodz === "sql" ? etap?.typ === "sql" : etap?.typ === "log" && etap.j === w.j);
    d.className = `wpis ${w.rodz} ${w.kl} ${poprz.has(w.id) ? "" : "pojawia"} ${biezacy ? "biezacy" : ""}`;
    d.innerHTML = `<span class="t">+${ms(w.t)}</span><span class="r"></span><span class="x rozmyj"></span>`;
    d.querySelector(".r").textContent = w.r;
    d.querySelector(".x").textContent = w.x;
    d.title = w.rodz === "log" && !w.kl.includes("kluczowy") ? "Log tylko w konsoli (nie jest krokiem). Kluczowe logi: SQL albo „wazne_logi” w adnotacjach." : "";
    d.addEventListener("click", () => {
      // skok do kroku, przy którym to padło (albo najbliższego wcześniejszego widocznego)
      let j = stan.lista.indexOf(w.k);
      if (j < 0) j = Math.max(0, stan.lista.findIndex(x => x.nr > w.k.nr) - 1);
      const e = stan.lista[j]?.E.findIndex(x => (w.rodz === "sql" ? x.typ === "sql" : x.typ === "log" && x.j === w.j));
      skocz(stan.p, j, e > 0 ? e : 0);
    });
    box.append(d);
  }
  stan.konsolaWidac = teraz;
  (box.querySelector(".biezacy") || box.lastElementChild)?.scrollIntoView({ block: "nearest" });
}

// ——— lista requestów z wyszukiwarką (zamiast osi): ↑/↓ chodzą po tym, co pasuje ———
// Słowa: ścieżka, metoda, status, klasy, tabele, tekst logów (wszystkie muszą pasować).
// Filtry: sql>20, kroki>100, ms>50 (także <, >=, <=, =), http, job, n+1 (powtarzane zapytanie), blad.
function pasujeRequest(p, zapytanie) {
  if (!zapytanie) return true;
  if (!p._tekst) p._tekst = [p.wejscie.nazwa, p.wejscie.sciezka, p.wejscie.metoda, String(p.wejscie.status ?? ""),
    ...p.uczestnicy.map(u => `${u.nazwa} ${u.klasa || ""}`), ...p.kroki.filter(k => k.rodzaj === "sql").map(k => sqlCel(k)),
    ...p.kroki.flatMap(k => (k.logi || []).map(l => l.tekst))].join(" ").toLowerCase();
  const powt = () => { const c = new Map(); for (const k of p.kroki) if (k.rodzaj === "sql") c.set(k.sql, (c.get(k.sql) || 0) + 1); return [...c.values()].some(v => v > 1); };
  return zapytanie.toLowerCase().split(/\s+/).filter(Boolean).every(sl => {
    const m = /^(sql|kroki|ms)(>=|<=|>|<|=)(\d+(?:[.,]\d+)?)$/.exec(sl);
    if (m) {
      const v = { sql: p.statystyki.sql, kroki: p.kroki.length, ms: p.czas }[m[1]], n = Number(m[3].replace(",", "."));
      return { ">": v > n, "<": v < n, ">=": v >= n, "<=": v <= n, "=": v === n }[m[2]];
    }
    if (sl === "http") return p.wejscie.rodzaj === "http";
    if (sl === "job") return p.wejscie.rodzaj !== "http";
    if (sl === "n+1") return powt();
    if (sl === "blad" || sl === "błąd") return !!p.wejscie.blad || (p.wejscie.status ?? 0) >= 400;
    return p._tekst.includes(sl);
  });
}
const widoczneRequesty = () => (stan.model?.przebiegi || []).filter(p => pasujeRequest(p, stan.szukaj));
function rysujListe() {
  const ol = $("lista-req"), P = widoczneRequesty();
  $("ile-req").textContent = stan.szukaj ? `${P.length}/${przebiegi().length}` : `${przebiegi().length}`;
  ol.replaceChildren(...P.map(p => {
    const li = document.createElement("li"), w = p.wejscie;
    const powt = new Map();
    for (const k of p.kroki) if (k.rodzaj === "sql") powt.set(k.sql, (powt.get(k.sql) || 0) + 1);
    const maxPowt = Math.max(0, ...powt.values());
    li.className = `req-w ${p === stan.p ? "wybrany" : ""} ${p.nowy ? "nowy" : ""} ${w.rodzaj !== "http" ? "job" : ""} ${w.blad || (w.status ?? 0) >= 400 ? "blad" : ""}`;
    li.innerHTML = `<span class="n rozmyj"></span><span class="t">${new Date(p.ts).toLocaleTimeString("pl-PL", { hour12: false })}</span><span class="m"></span>`;
    li.querySelector(".n").textContent = w.rodzaj === "http" ? `${w.metoda} ${w.sciezka || w.nazwa}` : w.nazwa;
    li.querySelector(".m").innerHTML = `#${p.nr} · ${p.kroki.length} kr. · <span class="${p.statystyki.sql >= 20 ? "duzo" : ""}">${p.statystyki.sql} SQL</span>`
      + (maxPowt > 2 ? ` · <span class="duzo">×${maxPowt} to samo</span>` : "") + ` · ${ms(p.czas)}${w.status ? ` · ${w.status}` : ""}`;
    li.title = w.nazwa;
    if (stan.tryb === "mapa") {
      const j = stan.mapa.indexOf(p.id);
      if (j >= 0) { li.classList.add("na-mapie"); li.style.setProperty("--kr", kolorReq(p.id)); }
      li.querySelector(".t").insertAdjacentHTML("beforebegin", `<span class="na-mape">${j >= 0 ? "− z mapy" : "+ na mapę"}</span>`);
      li.draggable = true;
      li.addEventListener("dragstart", e => e.dataTransfer.setData("text/flow-req", p.id));
      li.addEventListener("click", () => przelaczNaMapie(p.id));
    } else li.addEventListener("click", () => skocz(p, 0, 0));
    return li;
  }));
  ol.querySelector(".wybrany")?.scrollIntoView({ block: "nearest" });
}
$("szukaj").addEventListener("input", e => { stan.szukaj = e.target.value.trim(); rysujListe(); });
$("szukaj").addEventListener("keydown", e => {
  if (e.key === "Escape") { e.target.blur(); }
  if (e.key === "Enter" || e.key === "ArrowDown") { const p = widoczneRequesty()[0]; if (p) skocz(p, 0, 0); e.target.blur(); e.preventDefault(); }
});

// ——— nagrania, konfiguracja i tryb na żywo ———
async function zaladuj(zrodlo, plik, { przelicz = false } = {}) {
  stopGraj();
  const inneZrodlo = stan.zrodlo?.zrodlo !== zrodlo || (zrodlo === "przyklad" && stan.zrodlo?.plik !== plik);
  stan.zrodlo = { zrodlo, plik };
  if (inneZrodlo) await odswiezKonfig();   // przykład ma własną mapę i adnotacje
  stan.model = zbuduj(await wczytajNagranie(zrodlo, plik, { przelicz }));
  stan.konsolaWidac = null;
  if (!stan.naZywo) pamiec.set("nagranie", `${zrodlo}|${plik}`);
  stan.p = null;
  scena.wyczysc();
  stan.mapa = wczytajMape();
  if (stan.model.pusto) return pokazPuste();
  if (stan.tryb === "mapa") pokazMape();
  // na żywo: stoimy na najnowszym requeście i idziemy za kolejnymi; nagranie: od początku
  if (stan.naZywo) { const ost = przebiegi().at(-1); idzDo(ost, 0, 0); stan.poSkoku = `${ost.id}:0:0`; }
  else idzDo(przebiegi()[0], 0, 0);
}
function pokazPuste() {
  scena.wyczysc();
  $("log").replaceChildren(); $("lista-req").replaceChildren(); $("narracja").replaceChildren(); $("pozycja").textContent = "";
  $("rozdzial").innerHTML = stan.naZywo
    ? `<div class="rozdzial-pasek"><h1>Na żywo: czekam na pierwszy request…</h1></div>
       <p>Aplikacja wysyła spany i logi OpenTelemetry na <code>http://localhost:${stan.otlp || 4318}</code> (OTEL_EXPORTER_OTLP_ENDPOINT).
       Wywołaj dowolny ekran albo endpoint — przebieg pojawi się tu chwilę po zakończeniu requestu.</p>`
    : `<div class="rozdzial-pasek"><h1>Puste nagranie</h1></div><p>Wybierz inne nagranie z listy albo włącz „na żywo”.</p>`;
}
async function odswiezListe() {
  const { biezaca, nagrania, naZywo, otlp } = await wczytajListe();
  Object.assign(stan, { biezaca, zKomendy: !!naZywo, otlp });
  const sel = $("nagrania");
  sel.replaceChildren(...nagrania.filter(n => !n.biezaca).map(n => {
    const o = document.createElement("option");
    o.value = `${n.zrodlo}|${n.plik}`;
    o.textContent = `${n.zrodlo === "przyklad" ? "przykład" : "sesja"} · ${n.plik.replace(".jsonl", "")}`;
    return o;
  }));
  pokazZrodlo();
  return nagrania;
}
async function odswiezKonfig() {
  stan.konfig = await wczytajKonfig(stan.zrodlo);
  ustawWazneLogi(stan.konfig.adnotacje?.wazne_logi || []);
  ustawWarstwyZKonfigu();
  rysujWarstwy();
  scena.klucz = null;
}

function nasluch() {
  const es = new EventSource("/_flow/events");
  es.onopen = () => { $("nasluch").classList.remove("stoi"); $("nasluch-tekst").textContent = `odbiornik OTLP: localhost:${stan.otlp || 4318}`; };
  es.onerror = () => { $("nasluch").classList.add("stoi"); $("nasluch-tekst").textContent = "flow-lens nie odpowiada"; };
  es.onmessage = async e => {
    const r = JSON.parse(e.data);
    if (r.kind === "konfig") {
      await odswiezKonfig();
      if (stan.p) { przeliczListe(); stan.ki = Math.min(stan.ki, Math.max(0, stan.lista.length - 1)); pokaz(); }
      $("nasluch-tekst").textContent = "mapa / adnotacje zmienione — przelicz nagranie (R), żeby filtr objął stare requesty";
      return;
    }
    if (r.kind !== "przebieg") return;
    if (!stan.naZywo || stan.zrodlo?.plik !== stan.biezaca) {
      $("nasluch-tekst").textContent = `nowy request: ${r.wejscie?.nazwa} · włącz „na żywo” (L)`;
      return;
    }
    // idziemy za nowym requestem, gdy stoisz na końcu albo nie ruszałeś się od poprzedniego automatycznego przeskoku
    const naKoncu = !stan.p || (stan.p === przebiegi().at(-1) && naKoncuRequestu())
      || stan.poSkoku === `${stan.p.id}:${stan.ki}:${stan.i}`;
    const stare = przebiegi().map(p => p.id);
    const biez = stan.p?.id, ki = stan.ki, i = stan.i;
    stan.model = zbuduj([...przebiegi(), r]);
    przebiegi().filter(p => !stare.includes(p.id)).forEach(p => (p.nowy = true));
    $("nasluch-tekst").textContent = `na żywo: ${r.wejscie?.nazwa}`;
    const nowy = przebiegi().find(p => p.id === r.id);
    if (stan.tryb === "mapa") { rysujListe(); rysujPanelMapy(); }
    const przeskocz = () => { idzDo(nowy, 0, 0, { animuj: true }); stan.poSkoku = `${nowy.id}:0:0`; };
    if (!biez) przeskocz();
    else {
      stan.p = przebiegi().find(p => p.id === biez); przeliczListe(); stan.ki = ki; stan.i = i;
      // kto stoi na końcu (albo czeka w auto), idzie od razu do nowego requestu; kto przegląda starszy — zostaje
      if (!stan.gra && naKoncu && pasujeRequest(nowy, stan.szukaj)) przeskocz();
      else {
        rysujListe(); rysujNarracje(); pokazKrance();
        $("nasluch-tekst").textContent = `na żywo: nowy request ${r.wejscie?.nazwa} (#${przebiegi().length}) — oglądasz wcześniejszy, ⏭ / ↓ prowadzi dalej`;
      }
    }
    stan.czekajacy.splice(0).forEach(res => res());
  };
}

// ——— mapa: kilka requestów na jednym rysunku (bez kroków i odkrywania) ———
stan.tryb = "przebieg";
stan.mapa = [];
stan.tylkoWspolne = pamiec.get("tylkoWspolne") !== "0";        // domyślnie: tylko części wspólne wyraźnie
const kluczMapy = () => `mapa:${stan.zrodlo?.zrodlo}|${stan.zrodlo?.plik}`;
const wczytajMape = () => { try { return JSON.parse(pamiec.get(kluczMapy()) || "[]"); } catch { return []; } };
const zapiszMape = () => pamiec.set(kluczMapy(), JSON.stringify(stan.mapa));
const wybraneNaMapie = () => stan.mapa.map(id => stan.model?.przebiegi.find(p => p.id === id)).filter(Boolean);
const kolorReq = id => KOLORY_REQ[Math.max(0, stan.mapa.indexOf(id)) % KOLORY_REQ.length];
function przelaczNaMapie(id) {
  const j = stan.mapa.indexOf(id);
  j >= 0 ? stan.mapa.splice(j, 1) : stan.mapa.push(id);
  zapiszMape();
  pokazMape();
}
function przelaczTryb(t) {
  stan.tryb = t;
  document.body.classList.toggle("tryb-mapa", t === "mapa");
  $("tab-przebieg").setAttribute("aria-selected", String(t === "przebieg"));
  $("tab-mapa").setAttribute("aria-selected", String(t === "mapa"));
  $("scena-ramka").hidden = t === "mapa";
  $("mapa-ramka").hidden = t !== "mapa";
  $("mapa-panel").hidden = t !== "mapa";
  stopGraj();
  zamknijInspektor();
  if (t === "mapa") {
    // pierwsze wejście: na mapę trafia request, który właśnie oglądasz
    if (!stan.mapa.length && stan.p) { stan.mapa.push(stan.p.id); zapiszMape(); }
    pokazMape();
  } else { rysujListe(); if (stan.p) pokaz(); }
}
$("tab-przebieg").addEventListener("click", () => przelaczTryb("przebieg"));
$("tab-mapa").addEventListener("click", () => przelaczTryb("mapa"));
const ramkaMapy = $("mapa-ramka");
ramkaMapy.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/flow-req")) { e.preventDefault(); ramkaMapy.classList.add("upusc"); } });
ramkaMapy.addEventListener("dragleave", () => ramkaMapy.classList.remove("upusc"));
ramkaMapy.addEventListener("drop", e => {
  e.preventDefault();
  ramkaMapy.classList.remove("upusc");
  const id = e.dataTransfer.getData("text/flow-req");
  if (id && !stan.mapa.includes(id)) { stan.mapa.push(id); zapiszMape(); pokazMape(); }
});
function pokazMape() {
  if (!stan.model) return;
  const W = wybraneNaMapie();
  $("mapa-pusta").hidden = W.length > 0;
  mapaScena.rysujMape(W, { ...opcjeSceny(), wyrozniony: stan.wyrozniony, tylkoWspolne: stan.tylkoWspolne });
  rysujListe();
  rysujPanelMapy();
  const wsp = MapaScena.wspolne(W);
  $("rozdzial").innerHTML = `<div class="rozdzial-pasek"><h1>mapa · ${W.length} ${W.length === 1 ? "request" : W.length < 5 ? "requesty" : "requestów"}</h1>
      <button id="tylko-wspolne" class="przelacznik" aria-pressed="${!!stan.tylkoWspolne}" title="Przygaś klasy i strzałki, które należą tylko do jednego requestu (W)">tylko wspólne</button></div>
    <p>${W.length > 1 ? `wspólne klasy: ${wsp.klasy.length} · wspólne tabele: ${wsp.tabele.length}` : "Dodaj kolejne requesty — zobaczysz, gdzie się spotykają."} · najedź na request w panelu, żeby wyróżnić jego ścieżkę</p>`;
  $("tylko-wspolne").onclick = () => { stan.tylkoWspolne = !stan.tylkoWspolne; pamiec.set("tylkoWspolne", stan.tylkoWspolne ? "1" : "0"); pokazMape(); };
}
function klikMapy(cel, arg) {
  if (cel === "etykieta" && arg?.link) { window.open(arg.link, "_blank", "noopener"); return; }
  if (cel === "baza") { $("inspektor-panel").hidden = false; inspektor.otworz("baza", arg, { ...ctx(), naMapieTryb: true }, { nowa: true }); return; }
  if (cel !== "uczestnik") return;
  $("inspektor-panel").hidden = false;
  inspektor.otworz("mapaKlasa", arg, ctx(), { nowa: true });
}
function wierszMapy({ kolor, nazwa, pod, przycisk, akcja, najedz }) {
  const d = document.createElement("div");
  d.className = "wiersz-mapy";
  d.innerHTML = `<span class="kol"></span><span class="n rozmyj"></span><button></button><span class="pod"></span>`;
  d.querySelector(".kol").style.background = kolor || "transparent";
  d.querySelector(".n").textContent = nazwa;
  d.querySelector(".pod").textContent = pod || "";
  d.querySelector("button").textContent = przycisk;
  d.querySelector("button").addEventListener("click", akcja);
  if (najedz) {
    d.addEventListener("mouseenter", () => { stan.wyrozniony = najedz; mapaScena.rysujMape(wybraneNaMapie(), { ...opcjeSceny(), wyrozniony: najedz, tylkoWspolne: stan.tylkoWspolne }); });
    d.addEventListener("mouseleave", () => { stan.wyrozniony = null; mapaScena.rysujMape(wybraneNaMapie(), { ...opcjeSceny(), wyrozniony: null, tylkoWspolne: stan.tylkoWspolne }); });
  }
  return d;
}
function rysujPanelMapy() {
  const box = $("mapa-panel"), W = wybraneNaMapie();
  box.replaceChildren();
  const h = t => { const e = document.createElement("h3"); e.textContent = t; return e; };
  box.append(h(`na mapie (${W.length})`));
  if (!W.length) { const p = document.createElement("p"); p.className = "pusto"; p.textContent = "Kliknij request na liście albo przeciągnij go na mapę."; box.append(p); }
  for (const p of W) box.append(wierszMapy({ kolor: kolorReq(p.id), nazwa: opisReq(p), pod: metaReq(p), przycisk: "×", akcja: () => przelaczNaMapie(p.id), najedz: p.id }));
  const S = sugestie(przebiegi(), W);
  box.append(h(W.length ? "sugestie — mają części wspólne z mapą" : "sugestie — przechodzą przez węzły"));
  if (!S.length) { const p = document.createElement("p"); p.className = "pusto"; p.textContent = "Brak requestów z częściami wspólnymi."; box.append(p); }
  for (const s_ of S) box.append(wierszMapy({ nazwa: opisReq(s_.p), pod: s_.powod, przycisk: "+", akcja: () => przelaczNaMapie(s_.p.id) }));
}

// ——— przełączniki ———
function przelacznik(id, klucz, domyslnie, zastosuj) {
  const b = $(id);
  let v = pamiec.get(klucz);
  v = v == null ? domyslnie : v === "1";
  const ustaw = x => { v = x; b.setAttribute("aria-pressed", String(v)); pamiec.set(klucz, v ? "1" : "0"); zastosuj(v); };
  b.addEventListener("click", () => ustaw(b.getAttribute("aria-pressed") !== "true"));
  ustaw(v);
  return () => ustaw(b.getAttribute("aria-pressed") !== "true");
}
const przelaczPokazowy = przelacznik("pokazowy", "pokazowy", false, v => document.body.classList.toggle("pokazowy", v));
przelacznik("motyw", "jasny", false, v => document.documentElement.setAttribute("data-theme", v ? "light" : "dark"));
const przelaczOdkrywanie = przelacznik("odkrywanie", "odkrywanie", true, v => { stan.odkrywanie = v; if (stan.p) pokaz(); });
const przelaczKonsole = przelacznik("widok-konsola", "konsola", true, v => { $("konsola").hidden = !v; stan.konsolaWidac = null; if (v && stan.p) { rysujKonsole(); $("konsola").querySelectorAll(".pojawia").forEach(x => x.classList.remove("pojawia")); } });
let gotowe = false;
function pokazZrodlo() {
  const sel = $("nagrania");
  sel.querySelector("option[data-zywo]")?.remove();
  if (stan.naZywo) {
    const o = document.createElement("option");
    o.dataset.zywo = "1";
    o.value = `sesja|${stan.biezaca}`;
    o.textContent = "● bieżący odbiornik";
    sel.prepend(o);
    sel.value = o.value;
  } else sel.value = pamiec.get("nagranie") || sel.options[0]?.value || "";
  sel.disabled = stan.naZywo;
}
const przelaczZywo = przelacznik("na-zywo", "zywo", true, v => {
  stan.naZywo = v;
  if (!gotowe) return;
  pokazZrodlo();
  if (v) zaladuj("sesja", stan.biezaca);
  else { const [z, p] = ($("nagrania").value || "").split("|"); if (p) zaladuj(z, p); else pokazPuste(); }
});
function przeliczZMapa() {
  if (!stan.zrodlo || stan.zrodlo.zrodlo === "przyklad") return;
  const { zrodlo, plik } = stan.zrodlo;
  const projekt = stan.model?.przebiegi[0]?.projekt;
  if (projekt && stan.konfig.mapa?.projekt && projekt !== stan.konfig.mapa.projekt) {
    $("nasluch-tekst").textContent = `nagranie z projektu ${projekt}, a mapa jest z ${stan.konfig.mapa.projekt} — przeliczysz je, uruchamiając flow-lens w tamtym repo`;
    return;
  }
  zaladuj(zrodlo, plik, { przelicz: true });
  $("nasluch-tekst").textContent = "przeliczone z bieżącą mapą";
}
$("przelicz").addEventListener("click", przeliczZMapa);

const tempo = $("tempo");
pokazTryb();
tempo.value = stan.tempo;
const pokazTempo = () => ($("tempo-wart").textContent = `${(stan.tempo / 1000).toFixed(1).replace(".", ",")} s / krok`);
pokazTempo();
tempo.addEventListener("input", () => { stan.tempo = Number(tempo.value); pamiec.set("tempo", stan.tempo); pokazTempo(); });

$("nagrania").addEventListener("change", e => { const [z, p] = e.target.value.split("|"); zaladuj(z, p); });
$("graj").addEventListener("click", przelaczGraj);
$("etap-dalej").addEventListener("click", () => { stopGraj(); etapDalej(true); });
$("etap-wstecz").addEventListener("click", () => { stopGraj(); etapWstecz(); });
$("krok-dalej").addEventListener("click", () => { stopGraj(); krok(1); });
$("krok-wstecz").addEventListener("click", () => { stopGraj(); krok(-1); });

document.addEventListener("keydown", e => {
  if (e.target.matches?.("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === "l" || k === "L") { przelaczZywo(); e.preventDefault(); return; }
  if (k === "/") { $("szukaj").focus(); $("szukaj").select(); e.preventDefault(); return; }
  if (k === "m" || k === "M") { przelaczTryb(stan.tryb === "mapa" ? "przebieg" : "mapa"); e.preventDefault(); return; }
  if (stan.tryb === "mapa") {
    if (/^[0-9]$/.test(k)) { if (k === "0") { stan.W = new Set(); zastosujWarstwy(); } else if (warstwaNr(Number(k) - 1)) przelaczWarstwe(warstwaNr(Number(k) - 1).id); e.preventDefault(); }
    else if (k === "Escape") zamknijInspektor();
    else if (k === "p" || k === "P") przelaczPokazowy();
    else if (k === "w" || k === "W") { stan.tylkoWspolne = !stan.tylkoWspolne; pamiec.set("tylkoWspolne", stan.tylkoWspolne ? "1" : "0"); pokazMape(); }
    return;
  }
  if (!stan.model || stan.model.pusto) return;
  if (stan.gra && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(k)) { e.preventDefault(); return; }
  if (k === "ArrowRight") { stopGraj(); etapDalej(true); }
  else if (k === "ArrowLeft") { stopGraj(); etapWstecz(); }
  else if (k === "ArrowDown") { stopGraj(); krok(1); }
  else if (k === "ArrowUp") { stopGraj(); krok(-1); }
  else if (k === " ") przelaczGraj();
  else if (k === "PageDown") ustawRozdzial(stan.rozdzial + 1);
  else if (k === "PageUp") stan.rozdzial <= 0 ? wyjdzZRozdzialow() : ustawRozdzial(stan.rozdzial - 1);
  else if (/^[1-9]$/.test(k) && warstwaNr(Number(k) - 1)) przelaczWarstwe(warstwaNr(Number(k) - 1).id);
  else if (k === "0") { stan.W = new Set(); zastosujWarstwy(); }
  else if (k === "Escape") zamknijInspektor();
  else if (k === "p" || k === "P") przelaczPokazowy();
  else if (k === "t" || k === "T") przelaczKonsole();
  else if (k === "o" || k === "O") przelaczOdkrywanie();
  else if (k === "r" || k === "R") przeliczZMapa();
  else return;
  e.preventDefault();
});

// ——— start ———
(async () => {
  await odswiezKonfig();
  const nagrania = await odswiezListe();
  const zapamietane = pamiec.get("nagranie");
  const inne = nagrania.filter(n => !n.biezaca);
  const wybor = zapamietane && inne.some(n => `${n.zrodlo}|${n.plik}` === zapamietane) ? zapamietane
    : inne.find(n => n.zrodlo === "przyklad") ? `przyklad|${inne.find(n => n.zrodlo === "przyklad").plik}` : inne[0] ? `${inne[0].zrodlo}|${inne[0].plik}` : "";
  $("nagrania").value = wybor;
  // uruchomiony z komendą (`node flow.mjs -- …`) albo bez żadnego nagrania: od razu na żywo
  if (stan.zKomendy || !wybor) { stan.naZywo = true; $("na-zywo").setAttribute("aria-pressed", "true"); pokazZrodlo(); }
  gotowe = true;
  if (stan.naZywo) await zaladuj("sesja", stan.biezaca);
  else { const [z, p] = wybor.split("|"); await zaladuj(z, p); }
  nasluch();
})();

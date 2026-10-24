import { wczytajListe, wczytajNagranie, zbuduj } from "./dane.js";
import { Scena } from "./scena.js";
import { Inspektor } from "./inspektor.js";
import { ROZDZIALY, WARSTWY } from "./rozdzialy.js";
import { etapyKroku, serwerMcp, warstwyDoPozycji, podsumowanieWyniku } from "./etapy.js";
import { tys } from "./scena.js";
import { METAFORY, ROZDZIAL_KOMPAKCJA, etapyWMetaforze, widoczny } from "./metafory.js";

const $ = id => document.getElementById(id);
const pamiec = {
  get: k => { try { return localStorage.getItem(`lens.${k}`); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`lens.${k}`, v); } catch {} },
};

const WSZYSTKIE = new Set(WARSTWY.map(w => w.id));
const stan = {
  auto: false, // nowe nagranie: warstwy włączają się same, gdy pierwszy raz biorą udział, i zostają
  rekordy: [], model: null, zrodlo: null, biezaca: null,
  w: null, E: [], i: 0, rozdzial: 0, warstwy: new Set(),
  metafora: METAFORY.find(m => m.id === pamiec.get("metafora")) || null,
  gra: false, przebieg: 0, tempo: Number(pamiec.get("tempo") || 2000), naZywo: false, rozwiniete: new Set(), stopNa: null, czekajacy: [],
};

const scena = new Scena($("scena"), (cel, arg) => otworzInspektor(cel, arg));
const inspektor = new Inspektor($("okruszki"), $("inspektor-tresc"), (cel, arg) => {
  if (cel === "skok") idzDo(stan.model.glowne.find(w => w.nr === arg), 0);
});
const ctx = () => ({ model: stan.model, w: stan.w });
// metafora ma stały zestaw warstw (bez hooków): wszystko inne jest wycięte
const wMetaforze = W => stan.metafora ? new Set([...W].filter(x => stan.metafora.warstwy.includes(x))) : W;
const etapy = w => {
  const W = wMetaforze(stan.auto ? WSZYSTKIE : stan.warstwy);
  const E = etapyKroku(w, stan.model, W);
  return stan.metafora ? etapyWMetaforze(E, w, stan.model, stan.metafora, W) : E;
};
// rozdziały: w metaforze tylko te, które metafora umie opowiedzieć, jej słowami (+ kompakcja)
const rozdzialy = () => {
  const m = stan.metafora;
  if (!m) return ROZDZIALY;
  const wszystkie = [...ROZDZIALY.filter(r => r.id !== "swobodny"), { ...ROZDZIAL_KOMPAKCJA, warstwy: m.warstwy }, ROZDZIALY.find(r => r.id === "swobodny")];
  return wszystkie.filter(r => m.rozdzialy[r.id])
    .map(r => ({ ...r, tekst: m.rozdzialy[r.id], wiecej: null, warstwy: r.warstwy.filter(x => m.warstwy.includes(x)) }));
};

// ——— inspektor: tylko na żądanie ———
function otworzInspektor(cel, arg) {
  if (!stan.w) return;
  $("inspektor-panel").hidden = false;
  if (cel === "wiadomosc") { inspektor.otworz("stos", undefined, ctx(), { nowa: true }); inspektor.otworz("wiadomosc", arg, ctx()); return; }
  inspektor.otworz(cel, arg || undefined, ctx(), { nowa: true });
}
function zamknijInspektor() { if ($("inspektor-panel").hidden) return false; $("inspektor-panel").hidden = true; return true; }
$("zamknij").addEventListener("click", zamknijInspektor);

// ——— warstwy (z zależnościami) ———
function rysujWarstwy() {
  const nav = $("warstwy");
  nav.hidden = !!stan.metafora; // w metaforze warstwy są stałe
  nav.replaceChildren(...WARSTWY.map((w, i) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.style.setProperty("--k", w.kolor);
    b.setAttribute("aria-pressed", String(stan.warstwy.has(w.id)));
    b.innerHTML = `<span class="kropka"></span>${w.nazwa} <span class="nr">${i + 1}</span>`;
    b.addEventListener("click", () => przelaczWarstwe(w.id));
    return b;
  }));
  // wyłącz wszystko: zostaje sam model i przebieg bez warstw; dalej warstwy włącza się ręcznie
  const wyl = document.createElement("button");
  wyl.className = "wylacz-wszystko";
  wyl.textContent = "wyłącz wszystko";
  wyl.title = "Wyłącz wszystkie warstwy (0). Potem włączasz je ręcznie.";
  wyl.disabled = !stan.warstwy.size;
  wyl.addEventListener("click", wylaczWszystko);
  nav.append(wyl);
}
function wylaczWszystko() {
  stan.auto = false;
  stan.warstwy = new Set();
  zastosujWarstwy();
}
function przelaczWarstwe(id) {
  stan.auto = false;
  if (stan.warstwy.has(id)) {
    stan.warstwy.delete(id);
    for (const w of WARSTWY) if (w.wymaga?.includes(id)) stan.warstwy.delete(w.id);
  } else {
    stan.warstwy.add(id);
    for (const z of WARSTWY.find(w => w.id === id).wymaga || []) stan.warstwy.add(z);
  }
  zastosujWarstwy();
}
function zastosujWarstwy() {
  scena.ustawWarstwy(stan.warstwy);
  rysujWarstwy();
  if (!stan.w) return;
  const typ = stan.E[stan.i]?.typ;
  stan.E = etapy(stan.w);
  const j = stan.E.findIndex(e => e.typ === typ);
  stan.i = j >= 0 ? j : Math.min(stan.i, stan.E.length - 1);
  pokaz();
}

// ——— pozycja: (krok, etap) ———
function idzDo(w, i, { animuj = false } = {}) {
  if (!w) return;
  if (w !== stan.w) { stan.w = w; stan.E = etapy(w); }
  const j = Math.max(0, Math.min(stan.E.length - 1, i < 0 ? stan.E.length + i : i));
  // sklejony etap (metafora): stajemy na najbliższym widocznym, najpierw w przód
  const v = i < 0 ? widoczny(stan.E, j, -1) : widoczny(stan.E, j, 1);
  stan.i = v >= 0 ? v : Math.max(0, widoczny(stan.E, j, -1));
  return pokaz(animuj);
}
async function pokaz(animuj = false) {
  const { w, E, i } = stan;
  if (stan.auto && E[i]) {
    // dokładnie te warstwy, które brały udział od początku nagrania do tego miejsca:
    // przy cofaniu znikają te, które pojawią się dopiero później
    const teraz = wMetaforze(warstwyDoPozycji(stan.model, w, i, etapy));
    if ([...teraz].sort().join() !== [...stan.warstwy].sort().join()) {
      stan.warstwy = teraz;
      scena.ustawWarstwy(stan.warstwy);
      rysujWarstwy();
    }
  }
  rysujLog();
  rysujOs();
  rysujNarracje();
  pokazKrance();
  if (!$("tabela").hidden) rysujTabele();
  const Ew = E.filter(e => !e.ukryty);
  $("pozycja").textContent = `request #${w.nr} · tura ${w.tura}, krok ${w.krok}/${stan.model.tury.find(t => t.nr === w.tura)?.wymiany.length} · etap ${Ew.indexOf(E[i]) + 1}/${Ew.length}`;
  if (!$("inspektor-panel").hidden) inspektor.odswiez(ctx());
  // manual: stały, spokojny czas animacji (suwak tempa jest wtedy zablokowany); auto: zależnie od tempa
  // sklejone etapy tuż przed bieżącym: scena dogrywa ich skutek razem z nim
  const wchloniete = [];
  for (let j = i - 1; j >= 0 && E[j].ukryty; j--) wchloniete.push(E[j].typ);
  if (animuj) await scena.przejscie(w, stan.model, E, i, stan.gra ? stan.tempo * .85 : 1600, wchloniete);
  else scena.rysuj(w, stan.model, E, i);
}
function etapDalej(animuj = true) {
  const g = stan.model.glowne;
  const j = widoczny(stan.E, stan.i + 1, 1);
  if (j >= 0) return idzDo(stan.w, j, { animuj });
  const n = g[g.indexOf(stan.w) + 1];
  if (n) return idzDo(n, 0, { animuj });
  return null;
}
function etapWstecz() {
  const g = stan.model.glowne;
  const j = widoczny(stan.E, stan.i - 1, -1);
  if (j >= 0) return idzDo(stan.w, j);
  const p = g[g.indexOf(stan.w) - 1];
  if (p) idzDo(p, -1);
}
// na krańcach nagrania nic się nie dzieje (bez zawijania i bez skoku na początek ostatniego kroku)
function krok(delta) {
  const g = stan.model.glowne;
  const n = g[g.indexOf(stan.w) + delta];
  if (n) idzDo(n, 0, { animuj: true });
  else if (delta < 0 && widoczny(stan.E, stan.i - 1, -1) >= 0) idzDo(stan.w, 0); // pierwszy krok: wróć tylko na jego początek
}
// przyciski na krańcach są wyszarzone
function pokazKrance() {
  if (stan.gra || !stan.w) return;
  const g = stan.model.glowne, j = g.indexOf(stan.w);
  const poczatek = j === 0 && widoczny(stan.E, stan.i - 1, -1) < 0, koniec = j === g.length - 1 && widoczny(stan.E, stan.i + 1, 1) < 0;
  $("etap-wstecz").disabled = $("krok-wstecz").disabled = poczatek;
  $("etap-dalej").disabled = koniec;
  $("krok-dalej").disabled = j === g.length - 1;
}

// ——— odtwarzanie ———
async function graj({ najpierwCzekaj = false } = {}) {
  if (stan.gra) return;
  stan.gra = true;
  const moj = ++stan.przebieg;
  pokazTryb();
  if (najpierwCzekaj) await new Promise(r => setTimeout(r, stan.tempo)); // po skoku: chwila na obejrzenie miejsca
  while (stan.gra && moj === stan.przebieg) {
    const t0 = performance.now();
    const [wPrzed, iPrzed] = [stan.w, stan.i];
    const p = etapDalej(true);
    if (!p) {
      if (!stan.naZywo) break;
      $("nasluch-tekst").textContent = "czekam na kolejny request…";
      await new Promise(res => stan.czekajacy.push(res));
      continue;
    }
    await p;
    const e = stan.E[stan.i];
    const reszta = stan.tempo - (performance.now() - t0);
    if (reszta > 0) await new Promise(r => setTimeout(r, reszta));
    // etap zatrzymania mógł zostać sklejony (metafora): liczy się, że go minęliśmy
    const minione = stan.E.slice(stan.w === wPrzed ? iPrzed + 1 : 0, stan.i + 1);
    if (stan.stopNa && minione.some(x => x.typ === stan.stopNa)) { stan.stopNa = null; break; }
    if (e.typ === "koniec" && stan.wRozdziale && !stan.naZywo) break; // rozdział kończy się z turą; całe nagranie i na żywo grają dalej
  }
  if (moj === stan.przebieg) stopGraj();
}
// przycisk pokazuje bieżący tryb: manual (strzałki) albo auto (kolejny etap co „tempo”)
function pokazTryb() {
  const b = $("graj");
  b.textContent = stan.gra ? "auto" : "manual";
  b.setAttribute("aria-pressed", String(stan.gra));
  // w trybie auto strzałki są zamrożone: krok wybiera odtwarzanie
  for (const id of ["etap-wstecz", "etap-dalej", "krok-wstecz", "krok-dalej"]) $(id).disabled = stan.gra;
  // tempo ma sens tylko w auto
  $("tempo").disabled = !stan.gra;
  $("tempo").closest(".tempo").classList.toggle("wylaczone", !stan.gra);
  pokazKrance();
}
// skok z osi albo logu: w trybie auto odtwarzanie idzie dalej od nowego miejsca
function skocz(w, i) {
  const auto = stan.gra;
  stopGraj();
  idzDo(w, i);
  if (auto) graj({ najpierwCzekaj: true });
}
function stopGraj() { stan.gra = false; stan.przebieg++; pokazTryb(); }
function przelaczGraj() { stan.gra ? stopGraj() : graj(); }

// ——— narracja: co będzie dalej ———
function rysujNarracje() {
  const { w, E, i } = stan;
  if (!w || !E[i]) { $("narracja").replaceChildren(); return; }
  const n = stan.model.glowne[stan.model.glowne.indexOf(w) + 1];
  const j = widoczny(E, i + 1, 1);
  const dalej = j >= 0 ? E[j].tytul
    : n ? `request #${n.nr}${n.tura !== w.tura ? ` · tura ${n.tura}` : ""}: ${etapy(n).find(x => !x.ukryty)?.tytul || ""}`
    : stan.naZywo ? "czekam na kolejny request…" : "koniec nagrania";
  $("narracja").innerHTML = `<b>następne ▸</b><span></span>`;
  $("narracja").querySelector("span").textContent = dalej;
}

// ——— tabela requestów: prawdziwy czas i tokeny; klik przenosi scenę do kroku ———
const RESET = { clear: "/clear", nowa: "nowa historia", wznowienie: "wznowiona", kompakcja: "po kompakcji" };
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
// Tabela też zależy od pozycji (krok, etap): widać tylko to, co już się wydarzyło. Odpowiedź (czas, tokeny, stop)
// pojawia się po jej powrocie, wynik narzędzia po etapie „wynik”; późniejsze requesty są ukryte.
function rysujTabele() {
  const m = stan.model, box = $("tabela");
  if (!m || m.pusto || !stan.w) { box.innerHTML = "<p>Brak requestów.</p>"; return; }
  const ib = m.glowne.indexOf(stan.w);
  const dotad = stan.E.slice(0, stan.i + 1);
  const byl = typ => dotad.some(e => e.typ === typ);
  const glownyPrzed = b => [...m.glowne].reverse().find(x => x.ts <= b.ts);
  const widoczny = w => {
    if (w.glowna) return m.glowne.indexOf(w) <= ib;
    const g = m.glowne.indexOf(glownyPrzed(w));
    return g < ib || (g === ib && byl("wykonanie")); // boczny (np. wyszukiwarka) idzie w trakcie wykonania narzędzia
  };
  const wiersze = [...m.glowne, ...(m.boczne || [])].sort((a, b) => a.ts - b.ts).filter(widoczny);
  const t0 = Math.min(...[...m.glowne, ...(m.boczne || [])].map(w => w.ts));
  const max = Math.max(1, ...wiersze.map(w => w.odp?.usage?.razem || 0));
  const narz = n => serwerMcp(n) ? n.replace(/^mcp__(\w+?)__/, "$1 · ") : n;
  const h = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const poprz = stan.tabelaWidac || new Set(), teraz = new Set();
  // komórka z kluczem: przy pierwszym pojawieniu się dostaje klasę „pojawia”
  const kom = (klucz, tresc, kl = "") => { teraz.add(klucz); return `<td class="${kl} ${poprz.has(klucz) ? "" : "pojawia"}">${tresc}</td>`; };
  let tura = null;
  const tr = wiersze.map(w => {
    const boczny = !w.glowna, biez = w === stan.w;
    const wyslany = !biez || byl("wysylka"), wrocil = !biez || byl("powrot");
    const u = wrocil ? w.odp?.usage : null;
    const kl = [boczny ? "boczny" : "glowny", biez ? "biezacy" : "", !boczny && w.tura !== tura ? "tura-start" : ""].join(" ");
    if (!boczny) tura = w.tura;
    const kto = boczny ? `boczny · ${h((w.req.tools || []).map(t => t.nazwa).join(", ") || w.req.model || "")}` : `${w.tura} · ${w.krok}${w.reset ? ` <span class="reset">${RESET[w.reset] || w.reset}</span>` : ""}${w.kompakcja ? ' <span class="reset">kompakcja</span>' : ""}`;
    // wywołanie widać od analizy odpowiedzi, podsumowanie wyniku od etapu „wynik” tego wywołania
    const wyw = !wrocil ? "" : (w.wywolania || []).map(c => {
      const wynik = !biez || dotad.some(e => e.typ === "wynik" && e.c?.id === c.id);
      return `<div><span class="narz">${h(narz(c.nazwa))}</span>${wynik ? ` → ${h(podsumowanieWyniku(c))}` : ""}</div>`;
    }).join("");
    const id = w.id, pusto = "";
    return `<tr class="${kl}" data-id="${id}">
      ${kom(`${id}:t`, godzina(w.ts))}${kom(`${id}:t0`, mmss(w.ts - t0), "liczba")}${kom(`${id}:nr`, `#${boczny ? id : w.nr}`)}${kom(`${id}:kto`, kto)}
      ${wrocil && w.odp?.ms != null ? kom(`${id}:ms`, (w.odp.ms / 1000).toFixed(1).replace(".", ",") + " s", "liczba") : `<td class="liczba">${wyslany ? "…" : pusto}</td>`}
      ${u ? kom(`${id}:u`, `<span class="pasek" style="width:${Math.round(60 * u.razem / max)}px"></span>${tys(u.razem)}`, "liczba") + kom(`${id}:odczyt`, tys(u.odczyt), "liczba cache")
        + kom(`${id}:zapis`, tys(u.zapis), "liczba") + kom(`${id}:wej`, tys(u.wej), "liczba") + kom(`${id}:wyj`, tys(u.wyj), "liczba") + kom(`${id}:stop`, h(w.odp.stop || ""))
        : `<td></td><td></td><td></td><td></td><td></td><td>${wyslany && !wrocil ? "czekam" : ""}</td>`}
      ${kom(`${id}:wyw:${wyw.length}`, wyw)}</tr>`;
  }).join("");
  stan.tabelaWidac = teraz;
  box.innerHTML = `<table class="tabela-req"><thead><tr><th>godzina</th><th class="liczba">od startu</th><th>request</th><th>tura · krok</th><th class="liczba">model</th>
    <th class="liczba">wejście</th><th class="liczba">z cache</th><th class="liczba">do cache</th><th class="liczba">bez cache</th><th class="liczba">wyjście</th>
    <th>stop</th><th>narzędzia → wynik</th></tr></thead><tbody>${tr}</tbody></table>`;
  box.querySelectorAll("tr.glowny").forEach(r => r.addEventListener("click", () => {
    const w = m.glowne.find(x => String(x.id) === r.dataset.id);
    if (w) skocz(w, 0);
  }));
  box.querySelector("tr.biezacy")?.scrollIntoView({ block: "nearest" });
}
function przelaczTabele(v = $("tabela").hidden) {
  $("tabela").hidden = !v;
  document.querySelector(".scena-ramka").hidden = v;
  $("rozdzial").hidden = v; // w tabeli bez paska rozdziałów
  document.querySelector(".scena-kontener").classList.toggle("z-tabela", v);
  $("widok-tabela").setAttribute("aria-pressed", String(v));
  if (v) { stan.tabelaWidac = null; rysujTabele(); bezAnimacjiPojawiania(); }
}
// pierwsze otwarcie: wszystko, co już było, bez animacji pojawiania
function bezAnimacjiPojawiania() { $("tabela").querySelectorAll(".pojawia").forEach(x => x.classList.remove("pojawia")); }
$("widok-tabela").addEventListener("click", () => przelaczTabele());

// ——— log etapów (lewy panel) ———
const godzina = ts => new Date(ts).toLocaleTimeString("pl-PL", { hour12: false });
function rysujLog() {
  const t = stan.model.tury.find(t => t.nr === stan.w.tura);
  $("log-naglowek").textContent = `przebieg · tura ${t.nr}`;
  const ol = $("log");
  ol.replaceChildren();
  for (const w of t.wymiany) {
    if (w.krok > stan.w.krok) break;
    const E = w === stan.w ? stan.E : etapy(w);
    const ile = w === stan.w ? stan.i + 1 : E.length;
    if (t.wymiany.length > 1) {
      const sep = document.createElement("li");
      sep.className = "log-krok";
      sep.textContent = `krok ${w.krok} · request #${w.nr}`;
      ol.append(sep);
    }
    E.slice(0, ile).forEach((e, j) => {
      if (e.ukryty) return; // sklejony etap metafory
      const li = document.createElement("li");
      const biez = w === stan.w && j === stan.i;
      li.className = `linia-logu ${biez ? "biezaca" : ""} ${stan.rozwiniete.has(e.id) ? "rozwinieta" : ""}`;
      const b = document.createElement("button");
      b.innerHTML = `<span class="czas">${godzina(e.ts)}</span><span class="tytul"></span>`;
      b.querySelector(".tytul").textContent = e.tytul;
      b.title = "Kliknij: dlaczego?";
      b.addEventListener("click", () => {
        stan.rozwiniete.has(e.id) ? stan.rozwiniete.delete(e.id) : stan.rozwiniete.add(e.id);
        if (w !== stan.w || j !== stan.i) skocz(w, j); else rysujLog();
      });
      li.append(b);
      if (stan.rozwiniete.has(e.id)) {
        const p = document.createElement("p");
        p.className = "dlaczego";
        p.textContent = e.dlaczego;
        li.append(p);
        if (e.prawdziwy) {
          // most do wersji technicznej: co się dzieje naprawdę
          const n = document.createElement("p");
          n.className = "naprawde";
          n.textContent = `naprawdę: ${e.prawdziwy.toLowerCase()}`;
          li.append(n);
        }
      }
      ol.append(li);
    });
  }
  ol.querySelector(".biezaca")?.scrollIntoView({ block: "nearest" });
}

// ——— rozdziały (pasek nad sceną) ———
function rysujRozdzial(brak) {
  const R = rozdzialy(), r = R[stan.rozdzial];
  const box = $("rozdzial");
  box.innerHTML = `<div class="rozdzial-pasek">
      <button id="r-wstecz" title="Poprzedni rozdział (PgUp)">◂</button>
      <span class="r-nr">${String(stan.rozdzial + 1).padStart(2, "0")}/${R.length}</span>
      <button id="r-dalej" title="Następny rozdział (PgDn)">▸</button>
      <h1>${r.tytul}</h1>
      <span class="kropki-rozdzialow">${R.map((x, i) => `<button class="kr ${i === stan.rozdzial ? "on" : ""}" data-i="${i}" title="${x.tytul}"></button>`).join("")}</span>
    </div>
    <p>${r.tekst}${r.wiecej ? ` <button class="wiecej" id="wiecej">więcej ▾</button>` : ""}</p>
    <div class="wiecej-tresc" id="wiecej-tresc" hidden>${r.wiecej || ""}</div>
    ${brak && r.brak ? `<p class="uwaga">W tym nagraniu tego nie ma. ${r.brak}</p>` : ""}`;
  $("r-wstecz").onclick = () => (stan.rozdzial === 0 ? startAuto() : ustawRozdzial(stan.rozdzial - 1));
  $("r-dalej").onclick = () => ustawRozdzial(stan.rozdzial + 1);
  box.querySelectorAll(".kr").forEach(b => (b.onclick = () => ustawRozdzial(Number(b.dataset.i))));
  if (r.wiecej) $("wiecej").onclick = () => { $("wiecej-tresc").hidden = !$("wiecej-tresc").hidden; };
}
function ustawRozdzial(i, { graj: start = false } = {}) {
  stopGraj();
  stan.auto = false;
  stan.wRozdziale = true;
  const R = rozdzialy();
  stan.rozdzial = Math.max(0, Math.min(R.length - 1, i));
  pamiec.set("rozdzial", stan.rozdzial);
  const r = R[stan.rozdzial];
  stan.warstwy = new Set(r.warstwy);
  scena.ustawWarstwy(stan.warstwy);
  scena.zoomReset();
  rysujWarstwy();
  const w = r.wybierz(stan.model);
  rysujRozdzial(!w);
  stan.w = null;
  idzDo(w || stan.model.glowne[0], 0);
  stan.stopNa = w && !r.swobodny ? r.stop : null;
  if (r.inspektor && w) otworzInspektor(r.inspektor);
  else zamknijInspektor();
  if (start && w && !r.swobodny) graj();
}

// ——— oś kroków ———
function rysujOs() {
  const os = $("os");
  os.replaceChildren();
  const tury = stan.model.tury;
  // bez przewijania: okno tur wokół bieżącej, „…” po bokach, gdy coś jest poza nim
  const ile = Math.max(3, Math.floor((os.clientWidth - 80) / 210));
  const biez = Math.max(0, tury.findIndex(t => t.nr === stan.w?.tura));
  let od = Math.max(0, Math.min(biez - Math.floor((ile - 1) / 2), tury.length - ile));
  const doo = Math.min(tury.length, od + ile);
  const wiecej = (strona, tura) => {
    const b = document.createElement("button");
    b.className = "os-wiecej";
    b.textContent = "…";
    b.title = `${strona === "lewo" ? "wcześniejsze" : "późniejsze"} tury (T${tura.nr})`;
    b.addEventListener("click", () => skocz(tura.wymiany[0], 0));
    return b;
  };
  if (od > 0) os.append(wiecej("lewo", tury[od - 1]));
  for (const t of tury.slice(od, doo)) {
    const d = document.createElement("div");
    d.className = `tura ${t.nr === stan.w?.tura ? "biezaca-tura" : ""}`;
    const et = document.createElement("div");
    et.className = "etykieta rozmyj";
    et.textContent = `T${t.nr} ${t.prompt || ""}`;
    et.title = t.prompt;
    const kroki = document.createElement("div");
    kroki.className = "kroki";
    for (const w of t.wymiany) {
      const b = document.createElement("button");
      b.className = `krok-os ${w.wywolania?.length ? "narzedzie" : ""} ${w.odp?.stop === "end_turn" ? "koniec" : ""} ${w === stan.w ? "wybrany" : ""} ${w.nowy ? "nowy" : ""}`;
      b.title = `request #${w.nr} · ${w.odp?.stop || "czeka"}${w.wywolania?.length ? " · " + w.wywolania.map(c => c.nazwa).join(", ") : ""}`;
      b.addEventListener("click", () => skocz(w, 0));
      kroki.append(b);
    }
    d.append(et, kroki);
    os.append(d);
  }
  if (doo < tury.length) os.append(wiecej("prawo", tury[doo]));
}
window.addEventListener("resize", () => stan.model && !stan.model.pusto && stan.w && rysujOs());

// ——— nagrania i tryb na żywo ———
function serwery() {
  return [...new Set(stan.model.glowne.flatMap(w => w.req.tools.map(t => serwerMcp(t.nazwa)).concat((w.wywolania || []).map(c => serwerMcp(c.nazwa)))).filter(Boolean))];
}
async function zaladuj(zrodlo, plik) {
  stopGraj();
  stan.zrodlo = { zrodlo, plik };
  stan.rekordy = await wczytajNagranie(zrodlo, plik);
  stan.tabelaWidac = null;
  stan.model = zbuduj(stan.rekordy);
  if (!stan.naZywo) pamiec.set("nagranie", `${zrodlo}|${plik}`);
  stan.w = null;
  if (stan.model.pusto) {
    scena.ustawWarstwy(new Set());
    $("rozdzial").innerHTML = stan.naZywo
      ? `<div class="rozdzial-pasek"><h1>Na żywo: czekam na pierwszy request…</h1></div>
        <p>W terminalu: <code>ANTHROPIC_BASE_URL=http://${location.host} claude</code>. Wyłącz „na żywo”, żeby obejrzeć demo albo starą sesję.</p>`
      : `<div class="rozdzial-pasek"><h1>Puste nagranie</h1></div><p>Wybierz inne nagranie z listy.</p>`;
    $("log").replaceChildren(); $("os").replaceChildren();
    if (stan.model.wczytana) pokazWczytana();
    return;
  }
  scena.ustawSerwery(serwery());
  startAuto();
}

// Nowe nagranie: zaczynamy bez warstw, każda pojawia się, gdy pierwszy raz bierze udział.
function rysujPasekAuto() {
  const m = stan.metafora;
  $("rozdzial").innerHTML = `<div class="rozdzial-pasek"><button id="r-dalej" title="Przejdź do rozdziałów (PgDn)">rozdziały ▸</button>
      <h1>${m ? `${m.nazwa}: całe nagranie` : "Całe nagranie"}</h1></div>${m ? `<p>${m.opowiesc}</p>` : ""}`;
  $("r-dalej").onclick = () => ustawRozdzial(Number(pamiec.get("rozdzial") || 0));
}
function startAuto({ graj: start = false } = {}) {
  stopGraj();
  stan.auto = true;
  stan.wRozdziale = false;
  stan.warstwy = new Set();
  scena.ustawWarstwy(stan.warstwy);
  scena.zoomReset();
  rysujWarstwy();
  zamknijInspektor();
  rysujPasekAuto();
  stan.stopNa = null;
  stan.w = null;
  idzDo(stan.model.glowne[0], 0);
  if (start) graj();
}

async function odswiezListe(wybor) {
  const { biezaca, nagrania, naZywo, metafory } = await wczytajListe();
  stan.biezaca = biezaca;
  stan.metaforyDostepne = !!metafory;
  stan.zKomendy = !!naZywo;
  const sel = $("nagrania");
  sel.replaceChildren(...nagrania.filter(n => !n.biezaca).map(n => {
    const o = document.createElement("option");
    o.value = `${n.zrodlo}|${n.plik}`;
    o.textContent = `${n.zrodlo === "przyklad" ? "przykład" : "sesja"} · ${n.plik.replace(".jsonl", "")}`;
    return o;
  }));
  if (wybor) sel.value = wybor;
  pokazZrodlo();
  return nagrania;
}

function nasluch() {
  const es = new EventSource("/_lens/events");
  es.onopen = () => { $("nasluch").classList.remove("stoi"); $("nasluch-tekst").textContent = `nasłuchuję: ${location.host}`; };
  es.onerror = () => { $("nasluch").classList.add("stoi"); $("nasluch-tekst").textContent = "lens nie odpowiada"; };
  es.onmessage = e => {
    const r = JSON.parse(e.data);
    if (!stan.naZywo || stan.zrodlo?.plik !== stan.biezaca) {
      $("nasluch-tekst").textContent = "nowy ruch w bieżącej sesji · włącz „na żywo” (L)";
      return;
    }
    stan.rekordy.push(r);
    const przed = new Set(stan.model?.glowne.map(w => w.id));
    const wId = stan.w?.id;
    // śledzenie końca: kto stoi na ostatnim etapie nagrania, idzie za nowym ruchem; kto się cofnął, zostaje
    const naKoncu = !!stan.w && stan.model?.glowne.at(-1)?.id === wId && stan.i >= stan.E.length - 1;
    const ileEtapow = stan.E.length;
    stan.model = zbuduj(stan.rekordy);
    stan.model.glowne.filter(w => !przed.has(w.id)).forEach(w => (w.nowy = true));
    if (stan.model.pusto) { if (stan.model.wczytana) pokazWczytana(); return; }
    scena.ustawSerwery(serwery());
    $("nasluch-tekst").textContent = `na żywo: ${location.host}`;
    if (!wId) return startAuto(); // pierwszy request: start od początku (auto włącza użytkownik)
    // ta sama pozycja w przebudowanym modelu; etapy bieżącego kroku mogły się wydłużyć (przyszła odpowiedź)
    // /clear nie idzie do modelu: pokazujemy go od razu po hooku SessionEnd(clear), zanim przyjdzie nowy request
    if (r.kind === "hook" && r.event === "SessionEnd" && r.body?.reason === "clear") pokazClear();
    if (r.kind === "wczytana-historia" && stan.model.wczytana) { stan.poClear = true; stan.podgladWczytanej = true; pokazWczytana(); }
    const poResecie = stan.poClear && stan.model.glowne.some(w => !przed.has(w.id)); // pierwszy główny request nowej sesji
    if (poResecie) schowajClear();
    stan.w = stan.model.glowne.find(x => x.id === wId) || stan.w;
    stan.E = etapy(stan.w);
    stan.i = Math.min(stan.i, stan.E.length - 1);
    const ost = stan.model.glowne.at(-1);
    if (poResecie && ost.id !== wId) {
      const graj_ = stan.grajPoClear; stan.grajPoClear = false;
      stan.w = null; idzDo(ost, 0, { animuj: true });
      if (graj_) graj({ najpierwCzekaj: true });
    } else if (!stan.gra && naKoncu && !stan.poClear) {
      // najpierw nowe etapy bieżącego kroku (przyszła odpowiedź albo wynik narzędzia), potem nowy krok od początku
      if (stan.E.length > ileEtapow) idzDo(stan.w, ileEtapow, { animuj: true });
      else if (ost.id !== wId) { stan.w = null; idzDo(ost, 0, { animuj: true }); }
    }
    rysujLog();
    rysujOs();
    rysujNarracje();
    pokazKrance();
    if (!$("tabela").hidden) rysujTabele();
    stan.czekajacy.splice(0).forEach(res => res());
  };
}

// wznowiona sesja: zanim pójdzie pierwszy request, pokazujemy historię wczytaną przez harness z dysku
function pokazWczytana() {
  const n = stan.model.wczytana.messages.length;
  stan.auto = true;
  stan.wRozdziale = false;
  stan.warstwy = new Set(["stos"]);
  scena.ustawWarstwy(stan.warstwy);
  rysujWarstwy();
  scena.pokazWczytana(stan.model.wczytana);
  $("rozdzial").innerHTML = `<div class="rozdzial-pasek"><h1>Wznowiona sesja</h1></div>
    <p>Harness wczytał z dysku zapisaną rozmowę: ${n} wiadomości. Pójdą do modelu dopiero razem z Twoim pierwszym promptem.</p>`;
}

function pokazClear() {
  stan.poClear = true;
  const p = document.createElement("p");
  p.className = "uwaga po-clear";
  p.textContent = "/clear: harness wyczyścił historię (do modelu nic nie poszło). Nowa sesja zacznie się od Twojego następnego promptu.";
  rysujPasekAuto();
  $("rozdzial").append(p);
  // nowa sesja: warstwy liczą się od nowa (pojawią się, gdy wezmą udział w nowej sesji), także po ręcznym przełączaniu
  // warstw albo w rozdziale; odtwarzanie starej sesji staje, a nowy request pokażemy od razu
  stan.grajPoClear = stan.grajPoClear || stan.gra;
  stopGraj();
  stan.auto = true;
  stan.wRozdziale = false;
  stan.warstwy = new Set();
  scena.ustawWarstwy(stan.warstwy);
  rysujWarstwy();
  scena.wyczyscStos();
}
function schowajClear() {
  stan.poClear = false;
  $("rozdzial").querySelector(".po-clear")?.remove();
  if (stan.podgladWczytanej) { stan.podgladWczytanej = false; if (stan.auto) rysujPasekAuto(); }
}

// ——— przełączniki ———
function przelacznik(id, klucz, domyslnie, zastosuj) {
  const b = $(id);
  let v = pamiec.get(klucz);
  v = v == null ? domyslnie : v === "1";
  const ustaw = x => { v = x; b.setAttribute("aria-pressed", String(v)); pamiec.set(klucz, v ? "1" : "0"); zastosuj(v); };
  // przełącza względem tego, co widać (stan mógł być ustawiony z zewnątrz, np. tryb z komendą)
  b.addEventListener("click", () => ustaw(b.getAttribute("aria-pressed") !== "true"));
  ustaw(v);
  return () => ustaw(b.getAttribute("aria-pressed") !== "true");
}
const przelaczPokazowy = przelacznik("pokazowy", "pokazowy", false, v => document.body.classList.toggle("pokazowy", v));
przelacznik("motyw", "jasny", false, v => document.documentElement.setAttribute("data-theme", v ? "light" : "dark"));
let gotowe = false;
// Na żywo: lista pokazuje „● bieżąca sesja” i jest zablokowana; po wyłączeniu wraca ostatni wybór.
function pokazZrodlo() {
  const sel = $("nagrania");
  sel.querySelector("option[data-zywo]")?.remove();
  if (stan.naZywo) {
    const o = document.createElement("option");
    o.dataset.zywo = "1";
    o.value = `sesja|${stan.biezaca}`;
    o.textContent = "● bieżąca sesja";
    sel.prepend(o);
    sel.value = o.value;
  } else sel.value = pamiec.get("nagranie") || sel.options[0]?.value || "";
  sel.disabled = stan.naZywo;
}
const przelaczZywo = przelacznik("na-zywo", "zywo", false, v => {
  stan.naZywo = v;
  if (!gotowe) return;
  pokazZrodlo();
  if (v) zaladuj("sesja", stan.biezaca);
  else { const [z, p] = ($("nagrania").value || "przyklad|campsite.jsonl").split("|"); zaladuj(z, p); }
});

// ——— metafora: inne postaci, słowa, ikony i kolory; nagranie i scena te same ———
function pokazMetafore() {
  const m = stan.metafora;
  if (m) document.documentElement.dataset.metafora = m.id; else delete document.documentElement.dataset.metafora;
  $("metafora").value = m?.id || "";
  $("most").hidden = !m;
  $("most").textContent = m ? `Tu są prawdziwe dane. ${m.legenda.map(([a, b]) => `${a} = ${b}`).join(" · ")}` : "";
  scena.ustawMetafore(m);
}
function ustawMetafore(id) {
  stan.metafora = METAFORY.find(m => m.id === id) || null;
  pamiec.set("metafora", stan.metafora?.id || "");
  pokazMetafore();
  if (!stan.model || stan.model.pusto) return;
  scena.ustawSerwery(serwery());
  // metafora może mieć swoje nagranie (Memento: kompakcja); na żywo zostaje bieżąca sesja
  const nagr = stan.metafora?.nagranie;
  if (nagr && !stan.naZywo && [...$("nagrania").options].some(o => o.value === nagr) && $("nagrania").value !== nagr) {
    $("nagrania").value = nagr;
    const [z, p] = nagr.split("|");
    return zaladuj(z, p);
  }
  startAuto();
}
$("metafora").replaceChildren(new Option("bez metafory", ""), ...METAFORY.map(m => new Option(m.nazwa.toLowerCase(), m.id)));
$("metafora").addEventListener("change", e => ustawMetafore(e.target.value));

const tempo = $("tempo");
pokazTryb();
tempo.value = stan.tempo;
const pokazTempo = () => ($("tempo-wart").textContent = `${(stan.tempo / 1000).toFixed(1).replace(".", ",")} s / etap`);
pokazTempo();
tempo.addEventListener("input", () => { stan.tempo = Number(tempo.value); pamiec.set("tempo", stan.tempo); pokazTempo(); });

$("nagrania").addEventListener("change", e => { const [z, p] = e.target.value.split("|"); zaladuj(z, p); });
$("graj").addEventListener("click", przelaczGraj);
$("etap-dalej").addEventListener("click", () => { stopGraj(); etapDalej(true); });
$("etap-wstecz").addEventListener("click", () => { stopGraj(); etapWstecz(); });
$("krok-dalej").addEventListener("click", () => { stopGraj(); krok(1); });
$("krok-wstecz").addEventListener("click", () => { stopGraj(); krok(-1); });

document.addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!stan.model || stan.model.pusto) return;
  const k = e.key;
  if (stan.gra && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(k)) { e.preventDefault(); return; }
  if (k === "ArrowRight") { stopGraj(); etapDalej(true); }
  else if (k === "ArrowLeft") { stopGraj(); etapWstecz(); }
  else if (k === "ArrowDown") { stopGraj(); krok(1); }
  else if (k === "ArrowUp") { stopGraj(); krok(-1); }
  else if (k === " ") przelaczGraj();
  else if (k === "PageDown") ustawRozdzial(stan.auto ? stan.rozdzial : stan.rozdzial + 1);
  else if (k === "PageUp") stan.auto ? null : stan.rozdzial === 0 ? startAuto() : ustawRozdzial(stan.rozdzial - 1);
  else if (/^[1-9]$/.test(k) && WARSTWY[Number(k) - 1] && !stan.metafora) przelaczWarstwe(WARSTWY[Number(k) - 1].id);
  else if (k === "0" && !stan.metafora) wylaczWszystko();
  else if (k === "Escape") { if (!scena.zoomReset()) zamknijInspektor(); }
  else if (k === "p" || k === "P") przelaczPokazowy();
  else if (k === "l" || k === "L") przelaczZywo();
  else if (k === "t" || k === "T") przelaczTabele();
  else return;
  e.preventDefault();
});

// ——— start ———
(async () => {
  const nagrania = await odswiezListe();
  // metafory tylko z `lens.mjs --metafory`; bez tego przełącznika nie ma, a widok jest techniczny
  $("metafora").closest("label").hidden = !stan.metaforyDostepne;
  if (!stan.metaforyDostepne) stan.metafora = null;
  pokazMetafore();
  rysujWarstwy();
  const zapamietane = pamiec.get("nagranie");
  const przyklad = nagrania.find(n => n.zrodlo === "przyklad");
  const wybor = zapamietane && nagrania.some(n => !n.biezaca && `${n.zrodlo}|${n.plik}` === zapamietane) ? zapamietane
    : przyklad ? `przyklad|${przyklad.plik}` : nagrania.find(n => !n.biezaca) ? `${nagrania.find(n => !n.biezaca).zrodlo}|${nagrania.find(n => !n.biezaca).plik}` : "";
  $("nagrania").value = wybor;
  // lens uruchomiony z komendą (`node lens.mjs claude`): od razu bieżąca sesja, bez zapisywania preferencji
  if (stan.zKomendy) { stan.naZywo = true; $("na-zywo").setAttribute("aria-pressed", "true"); pokazZrodlo(); }
  gotowe = true;
  if (stan.naZywo || !wybor) { if (!stan.naZywo) przelaczZywo(); else await zaladuj("sesja", stan.biezaca); }
  else { const [z, p] = wybor.split("|"); await zaladuj(z, p); }
  nasluch();
})();

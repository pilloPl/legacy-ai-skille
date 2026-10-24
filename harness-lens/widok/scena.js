// Scena: rysunek człowieka, harnessu, modelu i serwerów MCP (SVG).
// Stan sceny zależy od (krok, etap): `rysuj` rysuje stan po etapie, `przejscie` animuje dojście do niego.
// Dzięki temu cofanie o etap pokazuje dokładnie to samo, co odtwarzanie w przód.
import { podsumowanieWyniku } from "./etapy.js";
import { IKONY } from "./ikony-metafor.js";
const NS = "http://www.w3.org/2000/svg";

export function el(tag, atr = {}, dzieci = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atr)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  for (const d of [].concat(dzieci)) if (d != null) e.append(d instanceof Node ? d : document.createTextNode(String(d)));
  return e;
}
const txt = (x, y, s, klasa = "maly", atr = {}) => el("text", { x, y, class: klasa, ...atr }, s);
export const tys = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")} tys.` : String(n);
export const skrocLinie = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const krotko = n => n.replace(/^mcp__(\w+?)__/, "$1·");

const KOLOR = { system: "var(--c-system)", tools: "var(--c-tools)", messages: "var(--c-msg)" };
const STATUS = { ok: ["var(--c-ok)", "dozwolone"], odmowa: ["var(--c-deny)", "odmowa"], hook: ["var(--c-hook)", "zablokował hook"],
  blad: ["var(--c-deny)", "błąd narzędzia"], brak: ["var(--muted)", "brak wyniku"] };
// kartki stosu: kolor paska = autor (cała kartka jest częścią historii, więc tło ma odcień historii)
const KOLOR_AUTORA = { "człowiek": "var(--fg)", model: "var(--fg2)", harness: "var(--c-msg)" };
const KOLOR_ARKUSZA = { prompt: "var(--fg)", tekst: "var(--fg2)", "wywołanie": "var(--c-tools)", wynik: "var(--c-msg)", kontekst: "var(--c-system)",
  doklejki: "var(--c-system)", skill: "var(--c-skill)" };

// Rozkład sceny (viewBox 1200×660).
const P = {
  czlowiek: { x: 14, y: 70, w: 100, h: 190 },
  harness: { x: 130, y: 36, w: 580, h: 604 },
  prompt: { x: 150, y: 96, w: 166, h: 78 },
  kontekst: { x: 150, y: 182, w: 166, h: 104 },
  katalog: { x: 330, y: 96, w: 166, h: 140 },
  odroczone: { x: 330, y: 242, w: 166, h: 50 },
  stos: { x: 150, y: 296, w: 160, h: 328 },
  koperta: { x: 506, y: 100, w: 184, h: 60 },
  zwrotna: { x: 506, y: 192, w: 184, h: 60 },
  bramka: { x: 506, y: 290, w: 184, h: 96 },
  wykonanie: { x: 506, y: 404, w: 184, h: 112 },
  model: { x: 800, y: 36, w: 380, h: 200 },
  odpowiedz: { x: 800, y: 254, w: 380, h: 130 },
  mcp: { x: 740, y: 430, w: 440, h: 142 },
  internet: { x: 742, y: 586, w: 150, h: 54 },
};
// przesunięcie koperty z harnessu do modelu (pod nazwę modelu, nad napis o bezstanowości)
const DO_MODELU = [P.model.x + 18 - P.koperta.x, P.model.y + 64 - P.koperta.y];
// skąd wylatują karty przy składaniu koperty i doklejaniu kontekstu
const ZRODLO = {
  prompt: [P.prompt.x + 4, P.prompt.y + 40], katalog: [P.katalog.x + 4, P.katalog.y + 60],
  stos: [P.stos.x + 4, P.stos.y + P.stos.h - 90], stosGora: [P.stos.x + 4, P.stos.y + 34], koperta: [P.koperta.x + 4, P.koperta.y + 16],
};
const SRODEK = {
  czlowiek: [100, 190], stosGora: [230, 296], kopertaL: [506, 130], kopertaP: [690, 130], model: [800, 120], modelD: [800, 200],
  zwrotnaP: [690, 222], zwrotnaL: [506, 222], bramka: [506, 338], wykonanieP: [690, 460], wykonanieL: [506, 460],
};

export class Scena {
  constructor(svg, naCel) {
    this.svg = svg;
    this.naCel = naCel;
    this.warstwy = new Set();
    this.serwery = [];
    this.M = null;
    this.zbuduj();
  }

  // metafora (null = widok techniczny): inne podpisy, ikony, sceneria; scena budowana od nowa
  ustawMetafore(m) {
    this.M = m;
    this.serwery = [];
    this.zbuduj();
    this.ustawWarstwy(this.warstwy);
  }
  T(klucz, domyslnie) { return this.M?.scena?.[klucz] ?? domyslnie; }

  klik(g, cel, arg) {
    g.classList.add("klik");
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.dataset.cel = cel;
    if (arg !== undefined) g.dataset.arg = arg;
    const wywolaj = e => { e.stopPropagation(); this.naCel(cel, g.dataset.arg); };
    g.addEventListener("click", wywolaj);
    g.addEventListener("keydown", e => { if (e.key === "Enter") wywolaj(e); });
    g.addEventListener("dblclick", e => { e.stopPropagation(); this.zoom(g.id.replace(/^s-/, "")); });
    return g;
  }
  grupa(id, warstwa) {
    const g = el("g", { id: `s-${id}`, class: "warstwa", "data-warstwa": warstwa || "" });
    this.svg.append(g);
    return g;
  }
  pudlo(g, p, tytul, kolor) {
    // kolor = kolor paska tej części w kopercie (system / narzędzia / historia)
    g.append(el("rect", { x: p.x, y: p.y, width: p.w, height: p.h, class: "ramka podswietl", fill: "var(--bg)",
        style: kolor ? `stroke:color-mix(in srgb, ${kolor} 55%, var(--line))` : null }),
      txt(p.x + 12, p.y + 20, tytul, "etyk", kolor ? { fill: kolor } : {}));
  }

  zbuduj() {
    const s = this.svg;
    s.innerHTML = "";
    const defs = el("defs");
    defs.innerHTML = `
      <marker id="grot" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)"/></marker>
      <pattern id="szron" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--c-cache)" opacity=".18"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--c-cache)" stroke-width="2" opacity=".6"/></pattern>
      <pattern id="kratka" width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M32 0 L0 0 0 32" fill="none" stroke="var(--line)" stroke-width="1"/></pattern>${this.M ? IKONY[this.M.id].wzor : ""}`;
    s.append(defs);

    // CZŁOWIEK
    const c = P.czlowiek;
    const gc = this.grupa("czlowiek", "");
    const cx = c.x + 50;
    gc.append(
      // postać: głowa i tułów z ramionami
      el("circle", { cx, cy: c.y + 24, r: 17, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2, class: "podswietl" }),
      el("path", { d: `M${cx - 34} ${c.y + 104} v-24 c0 -22 14 -32 34 -32 c20 0 34 10 34 32 v24 z`, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 2, class: "podswietl" }),
      // laptop pod spodem (w metaforze: rekwizyt człowieka)
      ...(this.M ? [IKONY[this.M.id].czlowiek(cx, c.y + 122), txt(cx, c.y + 186, this.M.scena.rola["człowiek"], "bardzo-maly", { "text-anchor": "middle" })] : [
      el("rect", { x: cx - 38, y: c.y + 120, width: 76, height: 46, rx: 3, fill: "var(--bg2)", stroke: "var(--fg2)", "stroke-width": 1.5 }),
      el("path", { d: `M${cx - 50} ${c.y + 178} h100 l-10 -10 h-80 z`, fill: "var(--fg2)" }),
      txt(cx - 28, c.y + 142, ">_", "maly", { fill: "var(--c-msg)" })]));
    this.klik(gc, "czlowiek");

    // HARNESS
    const h = P.harness;
    const gh = this.grupa("harness", "");
    gh.append(el("rect", { x: h.x, y: h.y, width: h.w, height: h.h, class: "ramka" }),
      el("rect", { x: h.x + 6, y: h.y + 6, width: h.w - 12, height: h.h - 12, class: "ramka-przer" }),
      el("rect", { x: h.x + 20, y: h.y - 11, width: this.M ? 400 : 330, height: 22, fill: "var(--bg)" }),
      txt(h.x + 28, h.y + 6, this.T("harness", "HARNESS"), "etyk etyk-duza"),
      txt(h.x + 34 + this.T("harness", "HARNESS").length * 13.4, h.y + 5, this.T("harnessPod", "program na Twoim komputerze"), "bardzo-maly"),
      this.M ? IKONY[this.M.id].harness(h.x + h.w - 34, h.y + 34) : null,
      el("g", { class: "warstwa", "data-warstwa": "pusty" }, [
        txt(h.x + 30, h.y + 330, "części harnessu pojawią się", "maly", { fill: "var(--muted)" }),
        txt(h.x + 30, h.y + 350, "w kolejnych rozdziałach", "maly", { fill: "var(--muted)" })]));

    // PROMPT STARTOWY: dwie różne rzeczy w dwóch miejscach koperty.
    // Instrukcja stała (te same zasady agenta w każdym requeście) idzie w pole system;
    // kontekst projektu (CLAUDE.md, środowisko, indeksy) harness dokleja do historii jako wiadomość.
    const pr = P.prompt;
    const gpr = this.grupa("prompt", "prompt");
    this.pudlo(gpr, pr, this.T("prompt", "INSTRUKCJA STAŁA"), "var(--c-system)");
    gpr.append(
      el("path", { d: `M${pr.x + 12} ${pr.y + 30} h30 l9 9 v28 h-39 z`, fill: "none", stroke: "var(--c-system)", "stroke-width": 1.3 }),
      el("path", { d: `M${pr.x + 42} ${pr.y + 30} v9 h9`, fill: "none", stroke: "var(--c-system)" }),
      ...[46, 53, 60].map((y, i) => el("line", { x1: pr.x + 17, x2: pr.x + (i % 2 ? 38 : 45), y1: pr.y + y, y2: pr.y + y, stroke: "var(--c-system)", "stroke-width": 1.6, opacity: .7 })),
      txt(pr.x + 58, pr.y + 44, this.T("promptPod", "→ pole system"), "bardzo-maly", { fill: "var(--c-system)" }),
      this.promptTekst = txt(pr.x + 58, pr.y + 60, "", "bardzo-maly"));
    this.klik(gpr, "prompt");

    const kt = P.kontekst;
    const gkt = this.grupa("kontekst", "prompt");
    this.pudlo(gkt, kt, this.T("kontekst", "KONTEKST"), "var(--c-msg)");
    gkt.append(
      ...this.T("kontekstPola", ["zasady", "środow.", "indeksy"]).map((t, i) => el("g", {}, [
        el("rect", { x: kt.x + 12, y: kt.y + 30 + i * 22, width: 52, height: 17, fill: "none", stroke: "var(--c-msg)", "stroke-dasharray": "3 2" }),
        txt(kt.x + 17, kt.y + 42 + i * 22, t, "bardzo-maly")])),
      txt(kt.x + 70, kt.y + 42, this.T("kontekstPod", "→ do historii"), "bardzo-maly", { fill: "var(--c-msg)" }),
      txt(kt.x + 70, kt.y + 56, this.T("kontekstPod2", "(doklejki)"), "bardzo-maly", { fill: "var(--muted)" }));
    this.klik(gkt, "prompt");

    // KATALOG NARZĘDZI (szuflady: wbudowane / skille / MCP)
    const k = P.katalog;
    const gk = this.grupa("katalog", "narzedzia");
    this.pudlo(gk, k, this.T("katalog", "KATALOG NARZĘDZI"), "var(--c-tools)");
    this.szuflady = {};
    this.szufladaG = {};
    [["wbudowane", "var(--c-tools)", "narzedzia", "narzedzia", "wbudowane"], ["skille", "var(--c-skill)", "skille", "skille", undefined],
      ["mcp", "var(--c-mcp)", "mcp", "narzedzia", "mcp"]].forEach(([n, kol, warstwa, cel, arg], i) => {
      const y = k.y + 32 + i * 35;
      const sz = el("g", { class: "warstwa", "data-warstwa": warstwa });
      this.szufladaG[n] = sz;
      sz.append(el("rect", { x: k.x + 10, y, width: k.w - 20, height: 29, fill: "var(--bg)", stroke: kol, "stroke-width": 1.3 }),
        el("line", { x1: k.x + k.w / 2 - 12, x2: k.x + k.w / 2 + 12, y1: y + 22, y2: y + 22, stroke: kol, "stroke-width": 2 }),
        txt(k.x + 18, y + 15, this.T("szuflady", { wbudowane: "wbudowane", skille: "skille (indeks)", mcp: "MCP" })[n], "bardzo-maly", { fill: kol }),
        this.szuflady[n] = txt(k.x + k.w - 18, y + 15, "", "maly", { "text-anchor": "end" }));
      this.klik(sz, cel, arg);
      gk.append(sz);
    });
    this.klik(gk, "narzedzia");

    // ODROCZONE
    const o = P.odroczone;
    const go = this.grupa("odroczone", "odkrywanie");
    go.append(el("rect", { x: o.x, y: o.y, width: o.w, height: o.h, fill: "var(--bg)", stroke: "var(--c-tools)", "stroke-dasharray": "4 3", class: "podswietl" }),
      this.odroczoneTekst = txt(o.x + 8, o.y + 15, "", "bardzo-maly", { fill: "var(--c-tools)" }),
      this.odroczoneTekst2 = txt(o.x + 8, o.y + 30, "", "bardzo-maly"),
      this.odkryteTekst = txt(o.x + 8, o.y + 45, "", "bardzo-maly", { fill: "var(--accent)" }));
    this.klik(go, "odkrywanie");

    // STOS
    const st = P.stos;
    const gs = this.grupa("stos", "stos");
    this.pudlo(gs, st, this.T("stos", "HISTORIA (STOS)"), "var(--c-msg)");
    gs.append(this.arkusze = el("g"), this.stosTekst = txt(st.x + 12, st.y + st.h - 12, "", "bardzo-maly"));
    this.klik(gs, "stos");

    // BRAMKA UPRAWNIEŃ
    const b = P.bramka;
    const gb = this.grupa("bramka", "uprawnienia");
    this.pudlo(gb, b, this.T("bramka", "UPRAWNIENIA"));
    gb.append(el("line", { x1: b.x + 28, y1: b.y + 34, x2: b.x + 28, y2: b.y + 84, stroke: "var(--fg2)", "stroke-width": 3 }),
      this.ramie = el("line", { x1: b.x + 28, y1: b.y + 54, x2: b.x + 64, y2: b.y + 54, stroke: "var(--muted)", "stroke-width": 4, "stroke-linecap": "round" }),
      el("circle", { cx: b.x + 28, cy: b.y + 54, r: 5, fill: "var(--fg2)" }),
      this.bramkaTekst = txt(b.x + 76, b.y + 52, "", "maly"),
      this.bramkaTekst2 = txt(b.x + 76, b.y + 70, "", "bardzo-maly"));
    this.klik(gb, "bramka");

    // WYKONANIE
    const w = P.wykonanie;
    const gw = this.grupa("wykonanie", "narzedzia");
    this.pudlo(gw, w, this.T("wykonanie", "WYKONANIE NARZĘDZIA"));
    gw.append(el("rect", { x: w.x + 14, y: w.y + 70, width: w.w - 28, height: 8, fill: "var(--fg2)" }),
      el("line", { x1: w.x + 26, y1: w.y + 78, x2: w.x + 26, y2: w.y + 102, stroke: "var(--fg2)", "stroke-width": 3 }),
      el("line", { x1: w.x + w.w - 26, y1: w.y + 78, x2: w.x + w.w - 26, y2: w.y + 102, stroke: "var(--fg2)", "stroke-width": 3 }),
      this.wykTekst = txt(w.x + 14, w.y + 44, "", "maly"),
      this.wykTekst2 = txt(w.x + 14, w.y + 60, "", "bardzo-maly rozmyj"),
      this.wykIkona = el("g"));

    // INTERNET: na chwilę obok harnessu, gdy narzędzie sięga do sieci (WebSearch, WebFetch)
    const it = P.internet;
    this.internetG = el("g", { id: "s-internet", class: "bez-udzialu" });
    this.internetG.append(el("rect", { x: it.x, y: it.y, width: it.w, height: it.h, fill: "var(--bg)", stroke: "var(--c-cache)", "stroke-width": 1.3 }),
      ikonaNarzedzia("WebSearch", it.x + 26, it.y + 27, "var(--c-cache)", 1.4),
      txt(it.x + 50, it.y + 24, "INTERNET", "etyk", { fill: "var(--c-cache)" }),
      this.internetTekst = txt(it.x + 50, it.y + 42, "", "bardzo-maly"));
    this.svg.append(this.internetG);

    // dymek przy człowieku: pytanie z AskUserQuestion
    this.dymekG = el("g", { id: "s-dymek", class: "bez-udzialu" });
    this.svg.append(this.dymekG);
    this.klik(gw, "wykonanie");

    // MODEL
    const m = P.model;
    const gm = this.grupa("model", "");
    gm.append(el("rect", { x: m.x, y: m.y, width: m.w, height: m.h, fill: "var(--bg3)", stroke: "var(--fg2)", "stroke-width": 1.4, class: "podswietl" }),
      el("rect", { x: m.x, y: m.y, width: m.w, height: m.h, fill: this.M ? "url(#wzor-metafory)" : "url(#kratka)", opacity: .7 }),
      txt(m.x + 18, m.y + 30, this.T("model", "MODEL"), "etyk etyk-duza"),
      this.modelNazwa = txt(m.x + 18, m.y + 52, "", "maly"),
      this.modelCzas = txt(m.x + m.w - 16, m.y + 30, "", "bardzo-maly", { "text-anchor": "end" }),
      ...this.T("modelPod", ["bezstanowy: zna tylko to,", "co przyszło w kopercie"]).map((t, j) => txt(m.x + 18, m.y + m.h - 30 + j * 15, t, "bardzo-maly")));
    // sieć neuronowa jako ilustracja
    const siec = el("g", { opacity: .55 });
    const kol = [[0, 3], [1, 4], [2, 2]];
    const pkt = kol.map(([ci, n]) => Array.from({ length: n }, (_, j) => [m.x + 220 + ci * 56, m.y + 100 + (j - (n - 1) / 2) * 30]));
    for (let a = 0; a < pkt.length - 1; a++) for (const p1 of pkt[a]) for (const p2 of pkt[a + 1])
      siec.append(el("line", { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: "var(--muted)", "stroke-width": .8 }));
    for (const warstwa of pkt) for (const [x, y] of warstwa) siec.append(el("circle", { cx: x, cy: y, r: 6, fill: "var(--bg3)", stroke: "var(--fg2)", "stroke-width": 1.3 }));
    this.siec = this.M ? IKONY[this.M.id].model(m.x + 290, m.y + 110) : siec;
    this.modelIkona = this.siec;
    gm.append(this.siec);
    // podpis metafory na górze sceny
    if (this.M) s.append(txt(P.harness.x, 18, this.M.podpis, "maly podpis-sceny"));
    this.klik(gm, "model");


    // OSTATNIA ODPOWIEDŹ MODELU (w harnessie, ale rysowana pod modelem)
    const od = P.odpowiedz;
    const godp = this.grupa("odpowiedz", "");
    this.pudlo(godp, od, this.T("odpowiedz", "OSTATNIA ODPOWIEDŹ"));
    godp.append(this.odpNr = txt(od.x + 12, od.y + 38, "", "bardzo-maly"),
      this.stopTekst = txt(od.x + od.w - 12, od.y + 20, "", "maly", { "text-anchor": "end" }), this.odpBloki = el("g"));
    this.klik(godp, "odpowiedz");

    // SERWERY MCP (rysowane w ustawSerwery)
    this.mcpG = this.grupa("mcp", "mcp");

    // HOOKI: stałe punkty pętli, w które harness pozwala wpiąć skrypt (ikona haczyka w plakietce)
    this.hookiG = {};
    const gho = this.grupa("hooki", "hooki");
    // [id, x, y, nazwa zdarzenia, położenie etykiety: lewo / prawo / dol]
    [["prompt", 130, 290, "UserPromptSubmit", "lewo"], ["pre", 498, 326, "PreToolUse", "lewo"], ["perm", 498, 368, "PermissionRequest", "lewo"],
      ["post", 598, 528, "PostToolUse", "dol"], ["stop", 700, 222, "Stop", "prawo"], ["compact", 312, 632, "PreCompact", "lewo"]].forEach(([n, x, y, et, gdzie]) => {
      const kl = el("g", { transform: `translate(${x},${y})`, class: "klamra" });
      const [tx, ty, anchor] = { lewo: [-17, 4, "end"], prawo: [17, 4, "start"], dol: [0, 30, "middle"] }[gdzie];
      kl.append(el("circle", { r: 12, class: "tlo-hooka", fill: "var(--bg)", stroke: "var(--c-hook)", "stroke-width": 1.3 }),
        // haczyk: oczko u góry, trzonek, zagięcie z zadziorem
        el("circle", { cx: 2, cy: -7, r: 2.2, fill: "none", stroke: "var(--c-hook)", "stroke-width": 1.6 }),
        el("path", { d: "M2 -4.8 V3 a4.5 4.5 0 0 1 -9 0 V0 l-2.2 2.4", fill: "none", stroke: "var(--c-hook)", "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" }),
        el("title", {}, `hook ${et}`), txt(tx, ty, et, "bardzo-maly etykieta-hooka", { fill: "var(--c-hook)", "text-anchor": anchor }));
      this.hookiG[n] = kl;
      gho.append(kl);
    });
    this.klik(gho, "hooki");

    // KOPERTY i warstwa ruchu (strzałki, karty)
    this.kopertaG = el("g", { id: "s-koperta" });
    s.append(this.kopertaG);
    this.klik(this.kopertaG, "koperta");
    this.zwrotnaG = el("g", { id: "s-zwrotna" });
    s.append(this.zwrotnaG);
    this.klik(this.zwrotnaG, "odpowiedz");
    this.ruch = el("g", { id: "s-ruch", "pointer-events": "none" });
    s.append(this.ruch);
    s.append(gho); // klamry hooków zawsze nad strzałkami i kartami
  }

  ustawWarstwy(warstwy) {
    this.warstwy = new Set(warstwy);
    if (!this.warstwy.size) this.warstwy.add("pusty");
    this.svg.querySelectorAll("[data-warstwa]").forEach(g => {
      const w = g.dataset.warstwa;
      g.classList.toggle("ukryta", !!w && !this.warstwy.has(w));
    });
  }

  ustawSerwery(nazwy) {
    if (JSON.stringify(nazwy) === JSON.stringify(this.serwery)) return;
    this.serwery = nazwy;
    const g = this.mcpG, p = P.mcp;
    g.innerHTML = "";
    this.serwerG = {};
    if (!nazwy.length) return;
    g.append(this.mcpNaglowek = txt(p.x, p.y + 6, this.T("mcp", "SERWERY MCP · osobne procesy, poza harnessem"), "bardzo-maly", { fill: "var(--c-mcp)" }));
    nazwy.slice(0, 3).forEach((n, i) => {
      const x = p.x + i * 150, y = p.y + 18;
      const sg = el("g", { id: `s-mcp-${n}`, class: "serwer" });
      sg.append(el("rect", { x, y, width: 136, height: 116, fill: "var(--bg)", stroke: "var(--c-mcp)", "stroke-width": 1.2, class: "podswietl" }),
        ikonaSerwera(n, x + 68, y + 46), txt(x + 68, y + 96, n, "maly", { "text-anchor": "middle", fill: "var(--c-mcp)" }),
        txt(x + 68, y + 110, rodzajSerwera(n), "bardzo-maly", { "text-anchor": "middle" }));
      this.klik(sg, "narzedzia", `mcp__${n}__`);
      this.serwerG[n] = sg;
      g.append(sg);
    });
  }

  // ——— stan po etapie i ———
  rysuj(w, model, E, i) {
    this.stan = { w, model, E, i };
    this.ruch.innerHTML = "";
    this.svg.getAnimations({ subtree: true }).forEach(a => a.cancel());
    const e = E[i] || { typ: "start" };
    const byly = new Set(E.slice(0, i + 1).map(x => x.typ));

    // człowiek
    this.svg.querySelector("#s-czlowiek").classList.toggle("aktywny", e.aktor === "czlowiek");

    // prompt i katalog
    this.promptTekst.textContent = `≈${tys(w.rozmiary.system)} tok.`;
    const t = w.req.tools;
    this.szuflady.wbudowane.textContent = String(t.filter(x => !x.odroczone && x.rodzaj !== "mcp" && x.rodzaj !== "zastepnik").length);
    this.szuflady.skille.textContent = String(model.skille.length);
    this.szuflady.mcp.textContent = String(t.filter(x => x.rodzaj === "mcp").length);
    // odroczone: model zna tylko nazwy; szacunek tokenów z samej listy nazw
    const nazwy = model.odroczone;
    this.odroczoneTekst.textContent = `${nazwy.length} nazw · ≈${tys(Math.round(nazwy.join("\n").length / 3.6))} tok.`;
    const naSerwer = {};
    for (const n of nazwy) { const k = (n.match(/^mcp__(\w+?)__/) || [])[1] || "wbud."; naSerwer[k] = (naSerwer[k] || 0) + 1; }
    const mcp = Object.entries(naSerwer).filter(([k]) => k !== "wbud.").sort((a, b) => b[1] - a[1]);
    this.odroczoneTekst2.textContent = mcp.length ? skrocLinie(mcp.map(([k, v]) => `${k} ${v}`).join(" · "), 21) : `wbudowane ${naSerwer["wbud."] || 0}`;
    const nowe = w.diff?.noweNarzedzia || [];
    const schemat = nowe.reduce((a, n) => { const t = w.req.tools.find(x => x.nazwa === n); return a + (t ? JSON.stringify([t.opis, t.schemat]).length : 0); }, 0);
    this.odkryteTekst.textContent = nowe.length ? `+${nowe.length} dociągn. ≈${tys(Math.round(schemat / 3.6))} tok.` : "";
    const rozklad = E.some(x => x.typ === "k-system" || x.typ === "k-narzedzia");
    this.svg.querySelector("#s-prompt").classList.toggle("aktywny", e.typ === "k-system" || (e.typ === "koperta" && !rozklad));
    this.svg.querySelector("#s-kontekst").classList.toggle("aktywny", ["doklejki", "polecenie"].includes(e.typ));
    this.svg.querySelector("#s-katalog").classList.toggle("aktywny", e.typ === "k-narzedzia" || (e.typ === "koperta" && !rozklad));
    this.svg.querySelector("#s-stos").classList.toggle("aktywny", e.typ === "koperta" && rozklad);

    // stos: wiadomości requestu, przed etapem „stos” bez nowych; odpowiedź i wynik dochodzą w trakcie kroku
    // wiadomość z doklejkami i promptem to dwie kartki: „doklejki” wchodzą na etapie doklejek, reszta na etapie stosu
    const pierwszaNowa = w.req.messages.length - (w.diff?.noweWiadomosci || 0);
    let ark = w.req.messages.flatMap((m, idx) => opisWiadomosci(m).map(o => ({ ...o, idx, nowa: idx >= pierwszaNowa })));
    // kartka doklejek wiadomości idx pojawia się przy pierwszym etapie doklejki do tej wiadomości
    const etapyDokl = E.filter(x => x.typ === "doklejki");
    const doklWidoczne = new Set(E.slice(0, i + 1).filter(x => x.typ === "doklejki").map(x => x.idx));
    const odHarnessu = a => ["doklejki", "streszczenie"].includes(a.typ); // wchodzą na swoich etapach doklejek
    if (etapyDokl.length) ark = ark.filter(a => !(a.nowa && odHarnessu(a) && etapyDokl.some(x => x.idx === a.idx) && !doklWidoczne.has(a.idx)));
    if (E.some(x => x.typ === "stos") && !byly.has("stos")) ark = ark.filter(a => !(a.nowa && !odHarnessu(a)));
    for (const a of ark) a.nowy = a.nowa && ((e.typ === "doklejki" && odHarnessu(a) && a.idx === e.idx) || (e.typ === "stos" && !odHarnessu(a)));
    // odpowiedź modelu trafia do historii na etapie „stos-odp” (bez warstwy stosu: przy analizie)
    const etapOdp = E.some(x => x.typ === "stos-odp") ? "stos-odp" : "analiza";
    if (byly.has(etapOdp)) ark.push({ rola: "model", typ: (w.wywolania || []).length ? "wywołanie" : "tekst", nowy: e.typ === etapOdp });
    if (byly.has("wynik")) ark.push({ rola: "harness", typ: "wynik", nowy: e.typ === "wynik" });
    if (byly.has("kompakcja")) {
      // historia zastąpiona: na stosie zostaje to, od czego zacznie się następny request (bez nowego promptu)
      const po = model.glowne[model.glowne.indexOf(w) + 1];
      const doPromptu = po ? po.req.messages.findIndex(m => m.bloki.some(b => b.rodzaj === "uzytkownik")) : -1;
      const nowa = po ? po.req.messages.slice(0, doPromptu > 0 ? doPromptu : 1) : [];
      ark = (nowa.length ? nowa.flatMap(m => opisWiadomosci(m)) : [{ rola: "harness", typ: "streszczenie" }]).map(x => ({ ...x, nowy: e.typ === "kompakcja" }));
      // rozmiar historii po kompakcji: szacunek z treści wiadomości, które zostają
      ark.tokeny = Math.round(JSON.stringify(nowa).length / 3.6);
    }
    this.rysujStos(ark, w);

    // koperta (request)
    this.kopertaG.innerHTML = "";
    this.kopertaG.removeAttribute("transform");
    this.kopertaG.style.opacity = 1;
    if (["k-system", "k-narzedzia", "koperta", "polecenie", "wysylka", "model"].includes(e.typ)) {
      // koperta rośnie warstwa po warstwie: system → + narzędzia → + historia
      const czesci = e.typ === "k-system" ? ["system"] : e.typ === "k-narzedzia" ? ["system", "tools"] : ["system", "tools", "messages"];
      this.rysujKoperte(w, czesci);
      if (!["k-system", "k-narzedzia", "koperta", "polecenie"].includes(e.typ)) this.kopertaG.setAttribute("transform", `translate(${DO_MODELU[0]}, ${DO_MODELU[1]})`);
      if (e.typ === "model") this.kopertaG.style.opacity = .35;
    }
    if (e.typ === "petla") {
      // następny request: koperta czeka w swoim miejscu, strzałka ze stosu do niej
      const kp = P.koperta;
      this.kopertaG.append(el("rect", { x: kp.x, y: kp.y, width: KOPERTA_MIN, height: kp.h, fill: "none", stroke: "var(--fg2)", "stroke-dasharray": "5 4" }),
        el("path", { d: `M${kp.x} ${kp.y} L${kp.x + KOPERTA_MIN / 2} ${kp.y + 16} L${kp.x + KOPERTA_MIN} ${kp.y}`, fill: "none", stroke: "var(--fg2)", "stroke-dasharray": "5 4" }),
        txt(kp.x + 2, kp.y + kp.h + 14, this.M ? this.M.scena.nastepny : `następny request #${w.nr + 1}`, "bardzo-maly"));
    }
    // koperta zwrotna (odpowiedź) — od powrotu do końca kroku
    this.zwrotnaG.innerHTML = "";
    if (byly.has("powrot")) this.rysujZwrotna(w);

    // model
    // metafora: po każdej odpowiedzi model zapomina (etap „zapomnienie”); do następnego „model” głowa jest pusta
    const pusta = this.M && (byly.has("zapomnienie") || !byly.has("model"));
    this.modelNazwa.textContent = this.M ? (pusta ? this.M.scena.pusto : this.M.scena.kto(w.nr)) : w.req.model || "";
    this.modelNazwa.setAttribute("fill", pusta ? "var(--accent)" : "var(--fg2)");
    this.modelIkona.style.opacity = pusta && IKONY[this.M.id].okruch ? .3 : 1;
    this.modelCzas.textContent = byly.has("powrot") && w.odp?.ms ? `${(w.odp.ms / 1000).toFixed(1).replace(".", ",")} s` : "";
    this.svg.querySelector("#s-model").classList.toggle("aktywny", e.typ === "model");
    if (e.typ === "model") [...this.siec.querySelectorAll("circle")].forEach((c, j) =>
      c.animate([{ fill: "var(--bg3)" }, { fill: "var(--accent)" }, { fill: "var(--bg3)" }], { duration: 1100, delay: (j % 4) * 140 + Math.floor(j / 4) * 220, iterations: Infinity }));

    // ostatnia odpowiedź: tego kroku po powrocie, wcześniej poprzedniego
    // po /clear albo wznowieniu poprzednia odpowiedź należy do innej rozmowy: nie pokazujemy jej
    const poprz = ["clear", "nowa", "wznowienie"].includes(w.reset) ? null : model.glowne[model.glowne.indexOf(w) - 1];
    const odpW = byly.has("powrot") ? w : poprz;
    this.rysujOdpowiedz(odpW, odpW !== w);

    // bramka i wykonanie: ostatnie wywołanie, które do nich doszło w tym kroku
    const doBramki = [...E.slice(0, i + 1)].reverse().find(x => ["uprawnienia", "pytanie"].includes(x.typ) || (x.typ === "hook-pre" && x.c?.status === "hook"));
    const doWyk = [...E.slice(0, i + 1)].reverse().find(x => x.typ === "wykonanie");
    this.ramie.setAttribute("transform", "");
    if (doBramki) {
      const c = doBramki.c;
      let [kol, opis] = doBramki.typ === "pytanie" ? ["var(--c-ask)", this.T("bramkaPyta", "pyta człowieka…")] : STATUS[c.status] || STATUS.brak;
      if (this.M && doBramki.typ !== "pytanie") opis = c.status === "ok" ? this.M.scena.bramkaOk : this.M.scena.bramkaNie;
      this.bramkaTekst.textContent = skrocLinie(krotko(c.nazwa), 12);
      this.bramkaTekst2.textContent = opis;
      this.bramkaTekst2.setAttribute("fill", kol);
      this.ramie.setAttribute("stroke", kol);
      if (c.status === "ok" && doBramki.typ === "uprawnienia") this.ramie.setAttribute("transform", `rotate(-70 ${P.bramka.x + 28} ${P.bramka.y + 54})`);
      this.svg.querySelector("#s-bramka").dataset.arg = c.id;
    } else {
      this.bramkaTekst.textContent = "—"; this.bramkaTekst2.textContent = ""; this.ramie.setAttribute("stroke", "var(--muted)");
      this.svg.querySelector("#s-bramka").dataset.arg = "";
    }
    this.svg.querySelector("#s-bramka").classList.toggle("aktywny", ["uprawnienia", "pytanie"].includes(e.typ) || (e.typ === "hook-pre" && e.c?.status === "hook"));
    this.wykIkona.innerHTML = "";
    if (doWyk) {
      const c = doWyk.c;
      this.wykIkona.append(ikonaNarzedzia(c.nazwa, P.wykonanie.x + P.wykonanie.w - 24, P.wykonanie.y + 42, kolorNarzedzia(c.nazwa)));
      this.wykTekst.textContent = skrocLinie(krotko(c.nazwa), 17);
      this.wykTekst2.textContent = skrocLinie(podsumowanieWyniku(c), 22);
      this.svg.querySelector("#s-wykonanie").dataset.arg = c.id;
    } else {
      const zablok = doBramki && doBramki.c.status !== "ok";
      this.wykTekst.textContent = zablok ? "— nie wykonano —" : "—";
      this.wykTekst2.textContent = "";
      this.svg.querySelector("#s-wykonanie").dataset.arg = doBramki?.c.id || "";
    }
    this.svg.querySelector("#s-wykonanie").classList.toggle("aktywny", e.typ === "wykonanie");

    // serwery MCP
    for (const [n, g] of Object.entries(this.serwerG || {})) g.classList.toggle("aktywny", e.aktor === `mcp:${n}`);
    // hooki
    for (const [n, g] of Object.entries(this.hookiG)) {
      const blok = n === "pre" && e.typ === "hook-pre" && e.c?.status === "hook";
      g.querySelector(".tlo-hooka").setAttribute("fill", blok ? "color-mix(in srgb, var(--c-hook) 55%, var(--bg))" : e.hook === n ? "color-mix(in srgb, var(--c-hook) 28%, var(--bg))" : "var(--bg)");
      g.classList.toggle("hook-aktywny", e.hook === n || blok);
    }

    // udział w kroku: elementy, które biorą udział tylko czasem, widać od etapu, w którym pierwszy raz biorą
    // udział, do końca kroku (w następnym kroku znikają, jeśli tam ich nie ma)
    const u_ = udzialWKroku(w, E, i);
    const pokazUdzial = (g, jest) => g && g.classList.toggle("bez-udzialu", !jest);
    for (const [n, g] of Object.entries(this.hookiG)) pokazUdzial(g, u_.hook(n));
    for (const [n, g] of Object.entries(this.serwerG || {})) pokazUdzial(g, u_.serwer(n));
    if (this.mcpNaglowek) pokazUdzial(this.mcpNaglowek, Object.keys(this.serwerG || {}).some(n => u_.serwer(n)));
    pokazUdzial(this.szufladaG.skille, u_.skille);
    pokazUdzial(this.szufladaG.mcp, u_.mcp);
    pokazUdzial(this.svg.querySelector("#s-odroczone"), u_.odroczone);
    pokazUdzial(this.svg.querySelector("#s-bramka"), u_.bramka);
    pokazUdzial(this.svg.querySelector("#s-wykonanie"), u_.wykonanie);
    // internet i dymek pytania tylko na czas etapu, w którym biorą udział
    pokazUdzial(this.internetG, e.typ === "wykonanie" && e.aktor === "internet");
    this.internetTekst.textContent = e.aktor === "internet" ? skrocLinie(e.c?.wejscie?.query || e.c?.wejscie?.url, 16) : "";
    const pytanie = e.typ === "wykonanie" && e.c?.nazwa === "AskUserQuestion";
    pokazUdzial(this.dymekG, pytanie);
    this.dymekG.innerHTML = "";
    if (pytanie) {
      const q = e.c.wejscie?.questions?.[0] || {};
      const opcje = (q.options || []).slice(0, 3).map(o => `○ ${o.label}`);
      const x = 4, y = 4, wd = 176, hd = 30 + opcje.length * 16;
      this.dymekG.append(el("path", { d: `M${x} ${y} h${wd} v${hd} h-${wd - 70} l-14 12 v-12 h-${56} z`, fill: "var(--bg)", stroke: "var(--accent)", "stroke-width": 1.5 }),
        txt(x + 10, y + 18, skrocLinie(q.question, 22), "maly", { fill: "var(--fg)" }),
        ...opcje.map((o, k) => txt(x + 14, y + 36 + k * 16, skrocLinie(o, 24), "bardzo-maly")));
    }

    // strzałka bieżącego etapu (tylko na czas etapu)
    this.strzalka = this.strzalkaEtapu(e);
    if (this.strzalka) this.ruch.append(this.strzalka);
  }

  // ——— przejście do etapu i (animacja „skąd”) ———
  async przejscie(w, model, E, i, T, wchloniete = []) {
    this.rysuj(w, model, E, i);
    const e = E[i];
    if (!e) return;
    const anims = [];
    const a = (elm, k, d = T, opt = {}) => { const x = elm.animate(k, { duration: d, easing: "cubic-bezier(.4,0,.2,1)", ...opt }); anims.push(x); return x; };
    if (this.strzalka) a(this.strzalka.querySelector("path"), [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], T * .6, { fill: "backwards" });
    const leci = (tekst, kolor, [x1, y1], [x2, y2], opoznienie = T * .25) => {
      const k = karta(tekst, kolor);
      this.ruch.append(k);
      a(k, [{ transform: `translate(${x1}px,${y1}px)`, opacity: 1 }, { transform: `translate(${x2}px,${y2}px)`, opacity: 1, offset: .85 }, { transform: `translate(${x2}px,${y2}px)`, opacity: 0 }],
        T * .8, { delay: opoznienie, fill: "both" });
    };
    // „przeciągnij i upuść”: kopia źródła unosi się, przelatuje i kurczy się do rozmiaru celu; zwraca chwilę upuszczenia
    const przeciagnij = (zrodlo, cel, opoznienie, czas) => {
      if (!zrodlo || !cel) return opoznienie;
      const kopia = zrodlo.cloneNode(true);
      kopia.removeAttribute("id");
      kopia.querySelectorAll("[id]").forEach(x => x.removeAttribute("id"));
      kopia.classList.remove("aktywny", "ukryta", "bez-udzialu", "klik");
      kopia.classList.add("kopia-przeciagana");
      this.ruch.append(kopia);
      const z = zrodlo.getBBox(), c = cel.getBBox();
      const sx = Math.max(.05, c.width / z.width), sy = Math.max(.05, c.height / z.height);
      kopia.style.transformOrigin = `${z.x}px ${z.y}px`;
      const do_ = `translate(${c.x - z.x}px, ${c.y - z.y}px) scale(${sx}, ${sy})`;
      a(kopia, [
        { transform: "translate(0px, 0px) scale(1, 1)", opacity: 0 },
        { transform: "translate(6px, -8px) scale(1, 1)", opacity: .9, offset: .18 },   // oderwanie od oryginału
        { transform: do_, opacity: .85, offset: .88 },
        { transform: do_, opacity: 0 },
      ], czas, { delay: opoznienie, fill: "both", easing: "ease-in-out" });
      return opoznienie + czas * .88;
    };
    // sklejony etap wysyłki (metafora): koperta dolatuje do modelu razem z etapem „model”
    if (e.typ === "model" && wchloniete.includes("wysylka"))
      a(this.kopertaG, [{ transform: "translate(0px,0px)", opacity: 1 }, { transform: `translate(${DO_MODELU[0]}px, ${DO_MODELU[1]}px)`, opacity: .35 }], T * .6, { fill: "backwards", easing: "ease-in-out" });
    switch (e.typ) {
      case "zapomnienie": {
        const ik = IKONY[this.M?.id];
        const m = P.model;
        if (!ik?.okruch) {
          // lekarz: ten wychodzi, przychodzi inny (ta sama wiedza, ta sama ikona)
          a(this.modelIkona, [{ transform: "translate(0px,0px)", opacity: 1 }, { transform: "translate(160px,0px)", opacity: 0, offset: .45 },
            { transform: "translate(-120px,0px)", opacity: 0, offset: .55 }, { transform: "translate(0px,0px)", opacity: 1 }], T * 1.2);
          break;
        }
        // z głowy wypada wszystko: okruchy lecą w dół i znikają
        a(this.modelIkona, [{ opacity: 1 }, { opacity: .3 }], T * .5, { fill: "backwards" });
        for (let k = 0; k < 7; k++) {
          const x0 = m.x + 250 + (k * 37) % 90, y0 = m.y + 70 + (k * 23) % 50;
          const o = ik.okruch(x0, y0);
          this.ruch.append(o);
          const dx = (k % 2 ? 1 : -1) * (20 + k * 9), rot = (k % 2 ? 1 : -1) * (40 + k * 25);
          a(o, [{ transform: "translate(0px,0px) rotate(0deg)", opacity: 1 }, { transform: `translate(${dx}px, ${190 + k * 18}px) rotate(${rot}deg)`, opacity: 0 }],
            T * (.9 + k * .06), { delay: k * T * .05, fill: "both", easing: "cubic-bezier(.5,0,.9,.6)" });
          o.style.transformBox = "fill-box"; o.style.transformOrigin = "center";
        }
        break;
      }
      case "prompt": leci(model.tury.find(t => t.nr === w.tura)?.prompt || "prompt", "var(--fg)", [20, 250], [P.stos.x + 4, P.stos.y + 30]); break;
      case "stos": [...this.arkusze.querySelectorAll(".arkusz.nowy-arkusz")].forEach((r, j) =>
        a(r, [{ transform: "translate(0,-50px)", opacity: 0 }, { transform: "translate(0,0)", opacity: 1 }], T * .5, { delay: j * T * .15, fill: "backwards" })); break;
      case "doklejki": {
        // kopia kontekstu projektu odrywa się i ląduje jako nowa kartka na stosie (nie z instrukcji stałej: ta idzie w pole system)
        const cel = this.arkusze.querySelector(".arkusz.nowy-arkusz");
        const czas = przeciagnij(this.svg.querySelector("#s-kontekst"), cel, 0, T * 1.1);
        if (cel) a(cel, [{ opacity: 0 }, { opacity: 1 }], T * .25, { delay: czas, fill: "backwards" });
        break;
      }
      case "k-system": case "k-narzedzia": case "koperta": {
        // każda część koperty to kopia swojego źródła przeciągnięta do koperty; pasek pojawia się, gdy kopia wpadnie
        const czesci = e.typ === "k-system" ? ["system"] : e.typ === "k-narzedzia" ? ["tools"]
          : E_ROZKLAD(this.stan) ? ["messages"] : ["system", "tools", "messages"];
        const zrodlo = { system: "#s-prompt", tools: "#s-katalog", messages: "#s-stos" };
        const widoczne = czesci.filter(c => c === "messages" || this.warstwy.has(c === "system" ? "prompt" : "narzedzia"));
        let start = 0;
        for (const c of widoczne) {
          const pasek = this.kopertaG.querySelector(`.pasek-koperty[data-czesc="${c}"]`);
          const koniec = przeciagnij(this.svg.querySelector(zrodlo[c]), pasek, start, T * 1.1);
          if (pasek) a(pasek, [{ opacity: 0, transform: "scaleX(.3)" }, { opacity: 1, transform: "scaleX(1)" }], T * .3, { delay: koniec, fill: "backwards" });
          start = koniec;
        }
        break;
      }
      // animacja CSS zastępuje atrybut transform: start w miejscu koperty w harnessie, koniec przy modelu
      case "wysylka": a(this.kopertaG, [{ transform: "translate(0px,0px)" }, { transform: `translate(${DO_MODELU[0]}px, ${DO_MODELU[1]}px)` }], T * .9, { fill: "backwards", easing: "ease-in-out" }); break;
      case "polecenie": {
        // jednorazowe polecenie harnessu: dopisane do wiadomości (nie do pola system), wpada prosto do historii w kopercie
        const pasek = this.kopertaG.querySelector('.pasek-koperty[data-czesc="messages"]');
        przeciagnij(this.svg.querySelector("#s-kontekst"), pasek, 0, T * 1.1);
        break;
      }
      case "kompakcja": {
        const cel = this.arkusze.querySelector(".arkusz.nowy-arkusz");
        const stary = this.svg.querySelector("#s-stos");
        const czas = przeciagnij(stary, cel, 0, T * 1.4);
        [...this.arkusze.querySelectorAll(".arkusz.nowy-arkusz")].forEach(k => a(k, [{ opacity: 0 }, { opacity: 1 }], T * .3, { delay: czas, fill: "backwards" }));
        break;
      }
      case "reset": a(this.arkusze, [{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], T * .9); break;
      case "stos-odp": {
        // kopia koperty zwrotnej przeciągana na stos jako nowa kartka „model · …”
        const cel = this.arkusze.querySelector(".arkusz.nowy-arkusz");
        const czas = przeciagnij(this.zwrotnaG, cel, 0, T * 1.1);
        if (cel) a(cel, [{ opacity: 0 }, { opacity: 1 }], T * .25, { delay: czas, fill: "backwards" });
        break;
      }
      case "powrot": a(this.zwrotnaG, [{ transform: `translate(${P.model.x - P.zwrotna.x}px, ${P.model.y + 150 - P.zwrotna.y}px)`, opacity: .3 }, { transform: "translate(0px,0px)", opacity: 1 }], T * .8, { fill: "backwards" }); break;
      case "analiza": a(this.zwrotnaG, [{ opacity: 1 }, { opacity: .4 }, { opacity: 1 }], T * .5); break;
      case "hook-pre": case "pytanie": case "uprawnienia": {
        if (e.typ === "hook-pre" && e.c?.status !== "hook") break; // hook przepuszcza: bez animacji bramki
        leci(krotko(e.c.nazwa), "var(--c-tools)", [P.zwrotna.x, P.zwrotna.y + 10], [P.bramka.x + 70, P.bramka.y + 60], 0);
        if (e.typ !== "pytanie") {
          // animacja CSS zastępuje atrybut transform na czas trwania; obrót wokół osi kołowrotu
          this.ramie.style.transformOrigin = `${P.bramka.x + 28}px ${P.bramka.y + 54}px`;
          if (e.c.status === "ok") a(this.ramie, [{ transform: "rotate(0deg)" }, { transform: "rotate(-70deg)" }], T * .4, { delay: T * .45, fill: "backwards" });
          else a(this.ramie, [{ transform: "rotate(0)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-8deg)" }, { transform: "rotate(0)" }], T * .4, { delay: T * .45 });
        }
        break;
      }
      case "wykonanie": {
        leci(krotko(e.c.nazwa), "var(--c-tools)", [P.bramka.x + 4, P.bramka.y + 40], [P.wykonanie.x + 4, P.wykonanie.y + 26], 0);
        const sg = e.aktor?.startsWith("mcp:") && this.serwerG?.[e.aktor.slice(4)];
        if (sg) a(sg, [{ opacity: .4 }, { opacity: 1 }], T * .4, { delay: T * .4 });
        break;
      }
      case "wynik": {
        const ok = e.c.status === "ok";
        const skad = ok ? [P.wykonanie.x + 4, P.wykonanie.y + 40] : [P.bramka.x + 4, P.bramka.y + 40];
        const cel = this.warstwy.has("stos") ? [P.stos.x + 4, P.stos.y + 34] : [skad[0], skad[1] + 40];
        const odpCzlowieka = e.c.nazwa === "AskUserQuestion" && (e.c.wynik?.tekst || "").match(/"="([^"]+)"/)?.[1];
        leci(ok ? (odpCzlowieka ? `odpowiedź: ${odpCzlowieka}` : `wynik: ${podsumowanieWyniku(e.c)}`) : `wynik: ${STATUS[e.c.status]?.[1]}`, ok ? "var(--c-msg)" : STATUS[e.c.status]?.[0], skad, cel, 0);
        break;
      }
      case "koniec": leci((w.odp?.bloki || []).find(b => b.rodzaj === "tekst-modelu")?.tekst || "odpowiedź", "var(--fg)", [P.zwrotna.x, P.zwrotna.y], [20, 250], T * .15); break;
    }
    await Promise.all(anims.map(x => x.finished.catch(() => {})));
  }

  strzalkaEtapu(e) {
    const [cx, cy] = SRODEK.czlowiek;
    const M = this.warstwy.has("stos") ? SRODEK.stosGora : [P.harness.x + 20, 200];
    let d = {
      prompt: `M${cx} ${cy + 40} C ${cx + 40} ${cy + 80}, ${M[0] - 60} ${M[1] - 40}, ${M[0]} ${M[1]}`,
      wysylka: `M${SRODEK.kopertaP[0]} ${SRODEK.kopertaP[1]} L ${SRODEK.model[0] - 4} ${SRODEK.model[1] + 10}`,
      powrot: `M${SRODEK.modelD[0]} ${SRODEK.modelD[1]} L ${SRODEK.zwrotnaP[0] + 4} ${SRODEK.zwrotnaP[1]}`,
      pytanie: `M${P.bramka.x} ${P.bramka.y + 30} C ${P.bramka.x - 160} ${P.bramka.y - 40}, ${cx + 120} ${cy - 10}, ${cx + 6} ${cy - 30}`,
      koniec: `M${SRODEK.zwrotnaL[0]} ${SRODEK.zwrotnaL[1]} C ${SRODEK.zwrotnaL[0] - 150} ${SRODEK.zwrotnaL[1] + 30}, ${cx + 160} ${cy - 50}, ${cx + 6} ${cy - 40}`,
      petla: this.warstwy.has("stos")
        ? `M${P.stos.x + P.stos.w} ${P.stos.y + 60} C ${P.stos.x + P.stos.w + 120} ${P.stos.y}, ${P.koperta.x - 80} ${P.koperta.y + 120}, ${P.koperta.x} ${P.koperta.y + 40}`
        : `M${P.wykonanie.x + 90} ${P.wykonanie.y} C ${P.wykonanie.x + 90} ${P.wykonanie.y - 120}, ${P.koperta.x + 60} ${P.koperta.y + 160}, ${P.koperta.x + 80} ${P.koperta.y + 64}`,
    }[e.typ];
    if (e.typ === "wykonanie" && e.aktor?.startsWith("mcp:") && this.serwerG?.[e.aktor.slice(4)]) {
      const b = this.serwerG[e.aktor.slice(4)].getBBox();
      d = `M${SRODEK.wykonanieP[0]} ${SRODEK.wykonanieP[1]} C ${SRODEK.wykonanieP[0] + 60} ${SRODEK.wykonanieP[1]}, ${b.x + b.width / 2} ${b.y - 50}, ${b.x + b.width / 2} ${b.y - 2}`;
    } else if (e.typ === "wykonanie" && e.aktor === "internet") {
      const it = P.internet;
      d = `M${SRODEK.wykonanieP[0]} ${SRODEK.wykonanieP[1] + 20} C ${SRODEK.wykonanieP[0] + 40} ${SRODEK.wykonanieP[1] + 90}, ${it.x - 40} ${it.y + 20}, ${it.x - 2} ${it.y + 26}`;
    } else if (e.typ === "wykonanie" && e.aktor === "czlowiek")
      d = `M${SRODEK.wykonanieL[0]} ${SRODEK.wykonanieL[1]} C ${SRODEK.wykonanieL[0] - 200} ${SRODEK.wykonanieL[1]}, ${cx + 120} ${cy + 20}, ${cx + 6} ${cy}`;
    else if (e.typ === "wynik" && this.warstwy.has("stos")) {
      const s = e.c.status === "ok" ? SRODEK.wykonanieL : SRODEK.bramka;
      d = `M${s[0]} ${s[1]} C ${s[0] - 100} ${s[1] + 40}, ${P.stos.x + P.stos.w + 60} ${P.stos.y + 80}, ${P.stos.x + P.stos.w} ${P.stos.y + 50}`;
    }
    if (!d) return null;
    return el("g", { class: "strzalka" }, [el("path", { d, fill: "none", stroke: "var(--accent)", "stroke-width": 2.2, "marker-end": "url(#grot)",
      pathLength: 1, "stroke-dasharray": 1, "stroke-dashoffset": 0 })]);
  }

  rysujKoperte(w, widoczne = ["system", "tools", "messages"]) {
    const r = w.rozmiary, g = this.kopertaG;
    const wszystkie = (this.stan?.model?.glowne || [w]).map(x => x.rozmiary.razem);
    const min = Math.min(...wszystkie), max = Math.max(...wszystkie);
    // nie proporcja, tylko kierunek: najmniejszy request w nagraniu = najwęższa koperta, największy = najszersza
    const kp = { ...P.koperta, w: Math.round(KOPERTA_MIN + (KOPERTA_MAX - KOPERTA_MIN) * (max > min ? (r.razem - min) / (max - min) : 1)) };
    const e = this.stan?.E?.[this.stan.i];
    const nowa = { "k-system": "system", "k-narzedzia": "tools", koperta: E_ROZKLAD(this.stan) ? "messages" : null }[e?.typ];
    const ek = this.T("koperta", { system: "system", tools: "narz.", messages: "historia" });
    const czesci = [["tools", r.tools, this.warstwy.has("narzedzia"), ek.tools], ["system", r.system, this.warstwy.has("prompt"), ek.system], ["messages", r.messages, true, ek.messages]]
      .map(c => [...c, widoczne.includes(c[0]), c[0] === nowa]);
    const suma = czesci.reduce((a, c) => a + c[1], 0) || 1;
    g.append(el("rect", { x: kp.x, y: kp.y, width: kp.w, height: kp.h, fill: "var(--bg)", stroke: "var(--fg)", "stroke-width": 1.4, class: "podswietl" }),
      el("path", { d: `M${kp.x} ${kp.y} L${kp.x + kp.w / 2} ${kp.y + 16} L${kp.x + kp.w} ${kp.y}`, fill: "none", stroke: "var(--fg)", "stroke-width": 1.2 }));
    let x = kp.x + 6;
    const szerMax = kp.w - 12;
    for (const [n, v, widoczna, etk, jest, nowy] of czesci) {
      const szer = Math.min(Math.max(16, (szerMax * v) / suma), kp.x + kp.w - 6 - x);
      if (!jest) {
        // jeszcze nie dołożone: puste miejsce w kopercie
        g.append(el("rect", { x: x + 1, y: kp.y + 23, width: szer - 2, height: 20, fill: "none", stroke: "var(--line)", "stroke-dasharray": "3 2" }));
      } else g.append(el("g", { class: `pasek-koperty ${nowy ? "nowy-pasek" : ""}`, "data-czesc": n, style: `transform-origin:${x}px ${kp.y + 34}px` }, [
        el("rect", { x, y: kp.y + 22, width: szer, height: 22, fill: widoczna ? KOLOR[n] : "var(--line)", opacity: widoczna ? .9 : .6 }),
        szer > 44 ? txt(x + 4, kp.y + 37, widoczna ? etk : "…", "bardzo-maly", { fill: widoczna ? "var(--bg)" : "var(--muted)" }) : null]));
      x += szer;
    }
    const u = w.odp?.usage;
    if (widoczne.length === 3 && this.warstwy.has("cache") && u?.razem && u.odczyt) g.append(el("rect", { x: kp.x + 6, y: kp.y + 22, width: szerMax * (u.odczyt / u.razem), height: 22, fill: "url(#szron)" }));
    g.append(txt(kp.x + 2, kp.y + kp.h + 14, `#${w.nr} · ${tys(r.razem)} tok.`, "bardzo-maly"));
  }

  rysujZwrotna(w) {
    const z = P.zwrotna, g = this.zwrotnaG;
    const wyw = w.wywolania || [];
    const narz = wyw.length && this.warstwy.has("narzedzia");
    const kol = wyw.length ? "var(--c-tools)" : "var(--fg)";
    g.append(el("rect", { x: z.x, y: z.y, width: z.w, height: z.h, fill: "var(--bg)", stroke: kol, "stroke-width": 1.6, class: "podswietl" }),
      // klapka u góry, jak w kopercie wysyłanej
      el("path", { d: `M${z.x} ${z.y} L${z.x + z.w / 2} ${z.y + 14} L${z.x + z.w} ${z.y}`, fill: "none", stroke: kol, "stroke-width": 1.2 }),
      el("rect", { x: z.x + 8, y: z.y + 20, width: wyw.length ? 82 : 52, height: 18, fill: kol }),
      txt(z.x + 13, z.y + 33, wyw.length ? this.T("zwrotnaProsba", "TOOL_USE") : this.T("zwrotnaTekst", "TEKST"), "bardzo-maly", { fill: "var(--bg)", "font-weight": 700 }),
      txt(z.x + (wyw.length ? 98 : 68), z.y + 33, narz ? skrocLinie(wyw.map(c => krotko(c.nazwa)).join(", "), 12) : wyw.length ? "prośba" : "", "bardzo-maly"),
      txt(z.x + 8, z.y + 54, this.M ? `#${w.nr}` : `#${w.nr} · stop: ${w.odp?.stop || "–"}`, "bardzo-maly"));
  }

  rysujOdpowiedz(w, poprzednia) {
    const od = P.odpowiedz, g = this.odpBloki;
    g.innerHTML = "";
    this.stopTekst.textContent = "";
    this.odpNr.textContent = "";
    g.setAttribute("opacity", poprzednia ? .45 : 1);
    if (!w?.odp) { g.append(txt(od.x + 12, od.y + 46, this.T("nicNieWrocilo", "jeszcze nic nie wróciło"), "bardzo-maly")); return; }
    this.odpNr.textContent = `z requestu #${w.nr}${poprzednia ? " · poprzednia" : ""}`;
    this.stopTekst.textContent = this.M ? "" : `stop: ${w.odp.stop}`;
    this.stopTekst.setAttribute("fill", w.odp.stop === "tool_use" ? "var(--c-tools)" : "var(--fg2)");
    const cache = this.warstwy.has("cache") && w.odp.usage?.razem;
    let y = od.y + 62;
    for (const b of w.odp.bloki.filter(b => b.rodzaj !== "myslenie")) {
      if (y > od.y + od.h - (cache ? 34 : 8)) break;
      const narz = this.warstwy.has("narzedzia");
      const t = b.rodzaj === "wywolanie" ? (narz ? `▸ ${krotko(b.nazwa)}(${JSON.stringify(b.wejscie)})` : "▸ prośba o działanie") : b.tekst;
      g.append(txt(od.x + 12, y, skrocLinie(t, 44), "maly rozmyj", { fill: b.rodzaj === "wywolanie" ? "var(--c-tools)" : "var(--fg)" }));
      y += 22;
    }
    // warstwa cache: pasek z liczbami z usage, klik otwiera szczegóły cache
    if (cache) {
      const u = w.odp.usage, x0 = od.x + 12, szer = 150, yb = od.y + od.h - 24;
      const pas = el("g", { class: "klik-cache" });
      let x = x0;
      for (const [v, kol] of [[u.odczyt, "var(--c-cache)"], [u.zapis, "var(--c-ask)"], [u.wej, "var(--fg2)"]]) {
        const sz = (szer * v) / u.razem;
        if (sz > 0) pas.append(el("rect", { x, y: yb, width: Math.max(sz, 2), height: 12, fill: kol }));
        x += sz;
      }
      pas.append(el("rect", { x: x0 - 4, y: yb - 6, width: od.w - 16, height: 24, fill: "transparent" }),
        txt(x0 + szer + 10, yb + 10, `cache ${Math.round((100 * u.odczyt) / u.razem)}% · ${tys(u.odczyt)} tok. ▸`, "bardzo-maly", { fill: "var(--c-cache)" }));
      pas.style.cursor = "pointer";
      pas.addEventListener("click", e => { e.stopPropagation(); this.naCel("cache"); });
      g.append(pas);
    }
  }

  rysujStos(ark, w) {
    const st = P.stos, g = this.arkusze;
    g.innerHTML = "";
    const maks = 18, pokaz = ark.slice(-maks), h = 12;
    const dol = st.y + st.h - 28;
    pokaz.forEach((a, j) => {
      const y = dol - (pokaz.length - j) * (h + 2);
      const r = el("g", { class: `arkusz ${a.nowy ? "nowy-arkusz" : ""}` });
      r.append(el("rect", { x: st.x + 12 + (j % 2), y, width: st.w - 24, height: h, fill: "color-mix(in srgb, var(--c-msg) 9%, var(--bg2))",
          stroke: a.nowy ? "var(--accent)" : "color-mix(in srgb, var(--c-msg) 30%, var(--line))" }),
        el("rect", { x: st.x + 12 + (j % 2), y, width: 5, height: h, fill: KOLOR_AUTORA[a.rola] || "var(--muted)" }),
        txt(st.x + 22, y + 9.5, this.M ? `${this.M.scena.rola[a.rola] || a.rola} · ${this.M.scena.typ[a.typ] || a.typ}` : `${a.rola} · ${a.typ}`, "arkusz-tekst"));
      if (a.idx !== undefined) { r.style.cursor = "pointer"; r.addEventListener("click", ev => { ev.stopPropagation(); this.naCel("wiadomosc", a.idx); }); }
      g.append(r);
    });
    if (ark.length > maks) g.append(txt(st.x + 12, st.y + 38, `+ ${ark.length - maks} starszych`, "bardzo-maly"));
    this.stosTekst.textContent = `${new Set(ark.map(a => a.idx ?? `v${Math.random()}`)).size} wiad. · ≈${tys(ark.tokeny ?? w.rozmiary.messages)}`;
  }

  // wznowiona sesja przed pierwszym requestem: sam stos z historią wczytaną z dysku
  pokazWczytana(wczytana) {
    const ark = wczytana.messages.flatMap(m => opisWiadomosci(m));
    this.rysujStos(ark, { rozmiary: { messages: wczytana.tokeny } });
    this.stosTekst.textContent = `${wczytana.messages.length} wiad. · ≈${tys(wczytana.tokeny)} · z dysku`;
    this.arkusze.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
  }

  // /clear: historia u harnessu jest już pusta, choć nowy request jeszcze nie poszedł
  wyczyscStos() {
    this.arkusze.innerHTML = "";
    this.stosTekst.textContent = "0 wiad. · historia wyczyszczona";
    this.rysujOdpowiedz(null);
    this.arkusze.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
  }

  // ——— zoom i podświetlenie ———
  zoom(id) {
    const g = this.svg.querySelector(`#s-${id}`);
    if (!g) return;
    const b = g.getBBox(), m = 24;
    this.animujViewBox([b.x - m, b.y - m, b.width + 2 * m, b.height + 2 * m]);
    document.getElementById("zoom-info").hidden = false;
    this.zoomCel = id;
  }
  zoomReset() {
    if (!this.zoomCel) return false;
    this.animujViewBox([0, 0, 1200, 660]);
    document.getElementById("zoom-info").hidden = true;
    this.zoomCel = null;
    return true;
  }
  animujViewBox(cel) {
    const start = this.svg.getAttribute("viewBox").split(" ").map(Number);
    const t0 = performance.now(), ms = 450;
    const krok = t => {
      const p = Math.min(1, (t - t0) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      this.svg.setAttribute("viewBox", start.map((v, i) => v + (cel[i] - v) * e).join(" "));
      if (p < 1) requestAnimationFrame(krok);
    };
    requestAnimationFrame(krok);
  }
  podswietl(cele = []) {
    this.svg.querySelectorAll(".cel-rozdzialu").forEach(e => e.classList.remove("cel-rozdzialu"));
    for (const c of cele) this.svg.querySelector(`#s-${c}`)?.classList.add("cel-rozdzialu");
  }
}

// Co bierze udział w kroku w do etapu i włącznie (elementy pojawiające się tylko czasem).
export function udzialWKroku(w, E, i) {
  const dotad = E.slice(0, i + 1);
  const ma = f => dotad.some(f);
  const koperta = x => ["k-narzedzia", "koperta"].includes(x.typ);
  return {
    hook: n => ma(x => x.hook === n),
    serwer: n => ma(x => x.aktor === `mcp:${n}`),
    skille: ma(x => x.c?.nazwa === "Skill" || (x.typ === "doklejki" && /SKILL/.test(x.tytul))),
    mcp: ma(x => !!x.c?.nazwa?.startsWith("mcp__") || (koperta(x) && w.req.tools.some(t => t.rodzaj === "mcp"))),
    odroczone: ma(x => x.c?.nazwa === "ToolSearch" || (x.typ === "doklejki" && /ODROCZONE|ZAŁADOWANIA/.test(x.tytul))
      || (koperta(x) && w.diff?.noweNarzedzia?.length)),
    bramka: ma(x => ["uprawnienia", "pytanie"].includes(x.typ) || (x.typ === "hook-pre" && x.c?.status === "hook")),
    wykonanie: ma(x => x.typ === "wykonanie"),
  };
}

// szerokość koperty: najmniejszy request w nagraniu → KOPERTA_MIN, największy → KOPERTA_MAX
const KOPERTA_MIN = 140, KOPERTA_MAX = 200;

const E_ROZKLAD = st => !!st?.E?.some(x => x.typ === "k-system" || x.typ === "k-narzedzia");

// Kartki stosu dla wiadomości. Wiadomość z doklejkami i promptem to dwie kartki (te same content[], różne bloki).
// Kartki stosu: kto napisał treść (nie rola w API: doklejki i wyniki narzędzi mają w API rolę „user”, ale pisze je harness).
// Wiadomość z doklejkami i promptem to dwie kartki (te same content[], różne bloki). Pole „rola” = autor.
function opisWiadomosci(m) {
  const b = m.bloki;
  if (!b.length) return [];
  if (m.rola === "user" && b.some(x => x.rodzaj === "doklejka") && b.some(x => x.rodzaj === "uzytkownik"))
    return [{ rola: "harness", typ: "doklejki" }, { rola: "człowiek", typ: "prompt" }];
  if (m.rola === "system") return [{ rola: "harness", typ: "doklejki" }];
  return [opisWiadomosciJedna(m)];
}
function opisWiadomosciJedna(m) {
  const b = m.bloki;
  if (m.rola === "assistant") return { rola: "model", typ: b.some(x => x.rodzaj === "wywolanie") ? "wywołanie" : "tekst" };
  if (b.some(x => x.rodzaj === "wynik")) return { rola: "harness", typ: "wynik" };
  if (b.some(x => x.rodzaj === "uzytkownik")) return { rola: "człowiek", typ: "prompt" };
  if (b.some(x => x.rodzaj === "skill-tresc")) return { rola: "harness", typ: "treść skilla" };
  if (b.some(x => x.rodzaj === "streszczenie")) return { rola: "harness", typ: "streszczenie" };
  return { rola: "harness", typ: "doklejki" };
}

function karta(tekst, kolor) {
  const g = el("g", { class: "karta" });
  g.append(el("rect", { x: 0, y: 0, width: 170, height: 28, fill: "var(--bg)", stroke: kolor, "stroke-width": 1.6 }),
    el("rect", { x: 0, y: 0, width: 5, height: 28, fill: kolor }),
    txt(11, 18, skrocLinie(tekst, 21), "maly rozmyj"));
  return g;
}

// Ikona rodzaju narzędzia (prosta, liniowa), środek w (cx, cy).
export function kolorNarzedzia(n) {
  return n.startsWith("mcp__") ? "var(--c-mcp)" : n === "Skill" ? "var(--c-skill)" : /^Web/.test(n) ? "var(--c-cache)" : n === "AskUserQuestion" ? "var(--accent)" : "var(--c-tools)";
}
export function ikonaNarzedzia(n, cx, cy, kolor = "var(--c-tools)", skala = 1) {
  const s = { fill: "none", stroke: kolor, "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" };
  const g = el("g", { transform: `translate(${cx},${cy}) scale(${skala})`, class: "ikona-narzedzia" });
  const p = d => el("path", { d, ...s });
  if (/^Web/.test(n)) g.append(el("circle", { cx: 0, cy: 0, r: 10, ...s }), el("ellipse", { cx: 0, cy: 0, rx: 4.5, ry: 10, ...s }), p("M-10 0 H10 M-8.5 -5 H8.5 M-8.5 5 H8.5"));
  else if (n === "Read" || n === "NotebookRead") g.append(p("M-7 -10 h9 l5 5 v15 h-14 z M2 -10 v5 h5 M-4 -1 h8 M-4 3 h8 M-4 7 h5"));
  else if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(n)) g.append(p("M-8 8 l2 -6 l10 -10 l4 4 l-10 10 z M2 -6 l4 4 M-8 8 h6"));
  else if (/^(Bash|PowerShell|BashOutput|KillShell)$/.test(n)) g.append(el("rect", { x: -10, y: -8, width: 20, height: 16, rx: 2, ...s }), p("M-6 -3 l3 3 l-3 3 M0 4 h5"));
  else if (/^(Grep|Glob|ToolSearch|LS)$/.test(n)) g.append(el("circle", { cx: -2, cy: -2, r: 6, ...s }), p("M2.5 2.5 L9 9"));
  else if (n === "AskUserQuestion") g.append(p("M-10 -8 h20 v12 h-12 l-5 5 v-5 h-3 z"), el("circle", { cx: -4, cy: -2, r: .8, fill: kolor }), el("circle", { cx: 0, cy: -2, r: .8, fill: kolor }), el("circle", { cx: 4, cy: -2, r: .8, fill: kolor }));
  else if (n === "Skill") g.append(p("M0 -7 C -4 -9, -8 -9, -10 -8 V7 C -8 6, -4 6, 0 8 C 4 6, 8 6, 10 7 V-8 C 8 -9, 4 -9, 0 -7 Z M0 -7 V8"));
  else if (/^(Agent|Task)$/.test(n)) g.append(el("circle", { cx: 0, cy: -5, r: 4, ...s }), p("M-8 9 C -8 2, 8 2, 8 9"));
  else if (/^(TodoWrite|TaskCreate|TaskUpdate|TaskList)$/.test(n)) g.append(p("M-9 -7 l2 2 l3 -3 M-1 -5 h9 M-9 1 l2 2 l3 -3 M-1 3 h9 M-1 9 h9"));
  else if (n.startsWith("mcp__")) g.append(p("M-5 -10 v5 M5 -10 v5 M-8 -5 h16 v5 a8 8 0 0 1 -16 0 z M0 8 v4"));
  else g.append(el("circle", { cx: 0, cy: 0, r: 4, ...s }), p("M0 -10 v3 M0 7 v3 M-10 0 h3 M7 0 h3 M-7 -7 l2 2 M5 5 l2 2 M-7 7 l2 -2 M5 -5 l2 -2"));
  return g;
}

export function rodzajSerwera(n) {
  if (/baz|db|sql|postgres|mysql|mongo|oracle/i.test(n)) return "baza danych";
  if (/jira|zglosz|ticket|issue|tracker|github|linear/i.test(n)) return "tracker zgłoszeń";
  if (/slack|mail|teams|chat/i.test(n)) return "komunikator";
  if (/drive|docs|file|s3|confluence|wiki/i.test(n)) return "dokumenty";
  return "usługa";
}
function ikonaSerwera(n, cx, cy) {
  const r = rodzajSerwera(n), s = { fill: "none", stroke: "var(--c-mcp)", "stroke-width": 1.8 };
  if (r === "baza danych") return el("g", {}, [
    el("ellipse", { cx, cy: cy - 18, rx: 26, ry: 8, ...s }), el("path", { d: `M${cx - 26} ${cy - 18} v36 a26 8 0 0 0 52 0 v-36`, ...s }),
    el("path", { d: `M${cx - 26} ${cy} a26 8 0 0 0 52 0`, ...s })]);
  if (r === "tracker zgłoszeń") return el("g", {}, [
    el("path", { d: `M${cx - 30} ${cy - 18} h60 v12 a6 6 0 0 0 0 12 v12 h-60 v-12 a6 6 0 0 0 0 -12 z`, ...s }),
    el("line", { x1: cx - 14, y1: cy - 8, x2: cx + 16, y2: cy - 8, ...s }), el("line", { x1: cx - 14, y1: cy + 4, x2: cx + 8, y2: cy + 4, ...s })]);
  return el("g", {}, [el("rect", { x: cx - 16, y: cy - 10, width: 32, height: 24, rx: 4, ...s }),
    el("line", { x1: cx - 7, y1: cy - 10, x2: cx - 7, y2: cy - 22, ...s }), el("line", { x1: cx + 7, y1: cy - 10, x2: cx + 7, y2: cy - 22, ...s }),
    el("line", { x1: cx, y1: cy + 14, x2: cx, y2: cy + 26, ...s })]);
}

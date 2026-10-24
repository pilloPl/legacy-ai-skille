// Inspektor: prawdziwe dane klikniętego elementu. Skróty zawsze widoczne i rozwijalne do całości.
import { tokenyTekstu, rodzajNarzedzia } from "./dane.js";
import { tys } from "./scena.js";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
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

// Tekst skrócony do n linii z widocznym „… N tokenów pominięto — pokaż całość”.
export function skrot(tekst, n = 8, znakow = 1600) {
  tekst = String(tekst ?? "");
  const linie = tekst.split("\n");
  let pokaz = linie.slice(0, n).join("\n");
  if (pokaz.length > znakow) pokaz = pokaz.slice(0, znakow);
  const pre = h("pre", { class: "tresc" }, pokaz);
  if (pokaz.length >= tekst.length) return pre;
  const reszta = tekst.length - pokaz.length;
  const btn = h("button", { class: "skrot" }, `${tys(tokenyTekstu(tekst.slice(pokaz.length)))} tokenów pominięto (${reszta} znaków) — pokaż całość`);
  btn.addEventListener("click", () => { pre.textContent = tekst; btn.remove(); });
  return h("div", {}, pre, btn);
}

const wiersz = (glowny, meta, klik, pod) => {
  const tag = klik ? "button" : "div";
  const e = h(tag, { class: "wiersz" }, h("span", { class: "glowny" }, glowny, pod ? h("span", { class: "pod" }, pod) : null), h("span", { class: "meta" }, meta ?? ""));
  if (klik) e.addEventListener("click", klik);
  return e;
};
const znacznik = (t, k) => h("span", { class: `znacznik ${k}` }, t);
const tabela = pary => h("table", { class: "tabela" }, pary.filter(Boolean).map(([a, b]) => h("tr", {}, h("td", {}, a), h("td", {}, b))));
const naglowek = t => h("h3", {}, t);
const surowy = obj => {
  const d = h("div", { class: "surowy" });
  const b = h("button", {}, "pokaż surowy JSON");
  b.addEventListener("click", () => { d.replaceChildren(skrot(JSON.stringify(obj, null, 2), 60, 20000)); });
  d.append(b);
  return d;
};
const STATUS_OPIS = {
  ok: ["dozwolone i wykonane", "k-ok"], odmowa: ["odmowa (reguły uprawnień)", "k-deny"], hook: ["zablokował hook", "k-hook"],
  blad: ["błąd wykonania", "k-deny"], brak: ["brak wyniku w nagraniu", "k-muted"],
};
const krotkaNazwa = n => n.replace(/^mcp__(\w+?)__/, "mcp:$1 · ");
function tytulDoklejki(t) {
  const linie = t.replace(/<\/?system-reminder>/g, "").split("\n").map(l => l.trim()).filter(Boolean);
  return linie[0] || "(pusta)";
}
const typBloku = { uzytkownik: ["prompt człowieka", "k-msg"], doklejka: ["doklejka harnessu", "k-system"], harness: ["kontekst od harnessu", "k-system"],
  "tekst-modelu": ["tekst modelu", ""], wywolanie: ["wywołanie narzędzia", "k-tools"], wynik: ["wynik narzędzia", "k-msg"],
  "skill-tresc": ["treść skilla", "k-skill"], myslenie: ["myślenie", "k-muted"], obraz: ["obraz", "k-msg"], inne: ["inny blok", "k-muted"] };

// Kto napisał treść wiadomości (rola w API mówi tylko „user” / „assistant” / „system”).
function autorWiadomosci(m) {
  const b = m.bloki;
  if (m.rola === "assistant") return "model";
  if (m.rola === "system") return "harness";
  const czlowiek = b.some(x => x.rodzaj === "uzytkownik"), harness = b.some(x => x.rodzaj !== "uzytkownik");
  return czlowiek && harness ? "człowiek + doklejki harnessu" : czlowiek ? "człowiek" : "harness";
}

export class Inspektor {
  constructor(okruszki, tresc, naCel) {
    this.okruszki = okruszki;
    this.tresc = tresc;
    this.naCel = naCel; // (cel, arg) → app otwiera i dopisuje okruszek
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
  wstecz() {
    if (this.sciezka.length <= 1) return false;
    this.sciezka.pop();
    this.rysuj();
    return true;
  }
  odswiez(ctx) { this.ctx = ctx; if (this.sciezka.length) this.rysuj(); }

  rysuj() {
    const { cel, arg } = this.sciezka[this.sciezka.length - 1];
    const widok = this[`v_${cel}`] ? this[`v_${cel}`](arg) : { tytul: cel, el: h("div", { class: "pusto" }, "Brak widoku.") };
    this.okruszki.replaceChildren(h("span", {}, `REQUEST #${this.ctx.w?.nr ?? "–"}`),
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

  // ——— widoki ———
  v_koperta() {
    const { w } = this.ctx, r = w.rozmiary;
    const markery = [];
    w.req.system.forEach((s, i) => s.cache && markery.push(`system[${i}]`));
    w.req.tools.forEach((t, i) => t.cache && markery.push(`tools[${i}]`));
    w.req.messages.forEach((m, i) => m.bloki.forEach((b, j) => b.cache && markery.push(`messages[${i}].content[${j}]`)));
    return { tytul: "koperta (request)", el: h("div", {},
      h("p", {}, "Jedno wywołanie modelu. Harness wysyła wszystko naraz: narzędzia, instrukcję stałą i całą historię."),
      naglowek("warstwy koperty"),
      wiersz(h("span", {}, znacznik("tools", "k-tools"), `${w.req.tools.length} narzędzi`), `${r.szacunek ? "≈" : "≈"}${tys(r.tools)} tok.`, this.idz("narzedzia")),
      wiersz(h("span", {}, znacznik("system", "k-system"), `${w.req.system.length} bloków instrukcji stałej`), `≈${tys(r.system)} tok.`, this.idz("prompt")),
      wiersz(h("span", {}, znacznik("messages", "k-msg"), `${w.req.messages.length} wiadomości`), `≈${tys(r.messages)} tok.`, this.idz("stos")),
      h("p", { class: "k-muted" }, `Razem ${tys(r.razem)} tokenów wejścia${w.odp?.usage ? " (z usage w odpowiedzi)" : " (szacunek)"}. Podział na warstwy to szacunek z długości tekstu.`),
      naglowek("znaczniki cache"),
      markery.length ? h("div", {}, markery.map(m => wiersz(m, "cache_control", this.idz("cache")))) : h("div", { class: "pusto" }, "brak"),
      naglowek("parametry"), tabela([["model", w.req.model], ...Object.entries(w.req.params).filter(([k]) => k !== "model").map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)])]),
      surowy(w.surowyRequest)) };
  }

  v_model() {
    const { w } = this.ctx, u = w.odp?.usage, p = w.req.params;
    return { tytul: "model", el: h("div", {},
      h("p", {}, "Model dostaje kopertę i zwraca odpowiedź. Nie ma dostępu do plików ani terminala i nie pamięta poprzednich wywołań: wszystko, co wie o rozmowie, jest w tej kopercie."),
      tabela([["model", w.req.model], ["max_tokens", p.max_tokens], p.thinking && ["myślenie", JSON.stringify(p.thinking)],
        p.output_config && ["output_config", JSON.stringify(p.output_config)], ["stream", String(!!p.stream)],
        ["czas odpowiedzi", w.odp?.ms ? `${(w.odp.ms / 1000).toFixed(2)} s` : "–"], ["powód stopu", w.odp?.stop || "–"]]),
      naglowek("usage (z odpowiedzi)"),
      u ? tabela([["wejście bez cache", u.wej], ["odczyt z cache", u.odczyt], ["zapis do cache", u.zapis], ["wyjście", u.wyj]]) : h("div", { class: "pusto" }, "brak"),
      wiersz("odpowiedź modelu", "→", this.idz("odpowiedz")), wiersz("cały request", "→", this.idz("koperta"))) };
  }

  v_odpowiedz() {
    const { w } = this.ctx;
    if (!w.odp) return { tytul: "odpowiedź", el: h("div", { class: "pusto" }, "Odpowiedź jeszcze nie wróciła.") };
    const bloki = w.odp.bloki.map(b => {
      if (b.rodzaj === "wywolanie") {
        const c = (w.wywolania || []).find(x => x.id === b.id);
        const [opis, k] = STATUS_OPIS[c?.status || "brak"];
        return wiersz(h("span", {}, znacznik("wywołanie", "k-tools"), krotkaNazwa(b.nazwa)), h("span", { class: k }, opis), this.idz("wywolanie", b.id), JSON.stringify(b.wejscie));
      }
      if (b.rodzaj === "myslenie") return h("div", {}, znacznik("myślenie", "k-muted"), h("span", { class: "k-muted" }, b.tekst ? "" : "treść ukryta przez dostawcę (jest tylko podpis)"), b.tekst ? skrot(b.tekst, 6) : null);
      return h("div", {}, znacznik("tekst", ""), skrot(b.tekst, 14));
    });
    return { tytul: "odpowiedź", el: h("div", {},
      tabela([["powód stopu", w.odp.stop], ["znaczenie", w.odp.stop === "tool_use" ? "model prosi o narzędzie, harness ma je wykonać i wrócić" : w.odp.stop === "end_turn" ? "koniec tury, harness oddaje głos człowiekowi" : "–"]]),
      naglowek("bloki"), ...bloki,
      naglowek("tokeny i cache tego requestu"), pasekCache(w.odp.usage),
      surowy(w.odp.surowe)) };
  }

  v_prompt() {
    const { w } = this.ctx;
    const dok = [];
    w.req.messages.forEach((m, i) => m.bloki.forEach(b => { if (["doklejka", "harness"].includes(b.rodzaj)) dok.push({ i, b }); }));
    return { tytul: "prompt startowy", el: h("div", {},
      h("p", {}, "To, co harness składa, zanim model zobaczy Twoje pierwsze słowo. To dwie różne rzeczy w dwóch miejscach koperty: instrukcja stała idzie w pole system (ta sama w każdym requeście), a kontekst projektu (zasady projektu, środowisko, indeks skilli, lista odroczonych narzędzi) harness dokleja do historii jako bloki wiadomości. Nic nie idzie dwa razy."),
      naglowek(`instrukcja stała: ${w.req.system.length} bloków`),
      ...w.req.system.map((s, i) => h("div", {}, znacznik(`system[${i}]`, "k-system"), s.cache ? znacznik("cache", "k-cache") : null,
        h("span", { class: "k-muted" }, `≈${tys(tokenyTekstu(s.tekst))} tok.`), skrot(s.tekst, 6))),
      naglowek(`doklejki harnessu w historii: ${dok.length}`),
      ...dok.map(({ i, b }) => wiersz(h("span", {}, znacznik(b.rodzaj === "harness" ? "system w środku" : "user", "k-system"), tytulDoklejki(b.tekst)),
        `msg ${i} · ≈${tys(tokenyTekstu(b.tekst))}`, this.idz("wiadomosc", i)))) };
  }

  v_narzedzia(filtr) {
    const { w, model } = this.ctx;
    const pierwsze = nazwa => model.glowne.find(x => x.req.tools.some(t => t.nazwa === nazwa))?.nr;
    const grupy = [["wbudowane", t => !t.odroczone && t.rodzaj !== "mcp" && t.rodzaj !== "zastepnik"], ["MCP", t => t.rodzaj === "mcp"],
      ["dociągnięte po wyszukaniu (pełny schemat)", t => t.odroczone && t.rodzaj !== "zastepnik" && t.rodzaj !== "mcp"], ["zastępnik odroczonych", t => t.rodzaj === "zastepnik"]];
    const lista = h("div");
    const rysujListe = q => {
      lista.replaceChildren(...grupy.flatMap(([nazwa, f]) => {
        const t = w.req.tools.filter(f).filter(t => !q || t.nazwa.toLowerCase().includes(q));
        if (!t.length) return [];
        return [naglowek(`${nazwa}: ${t.length}`), ...t.map(x => wiersz(
          h("span", {}, x.rodzaj === "mcp" ? znacznik("mcp", "k-mcp") : x.rodzaj === "skill" ? znacznik("skill", "k-skill") : null, x.odroczone ? znacznik("odroczone", "k-tools") : null, krotkaNazwa(x.nazwa)),
          `≈${tys(tokenyTekstu(x.opis) + tokenyTekstu(x.schemat))} tok.${pierwsze(x.nazwa) > 1 ? ` · od #${pierwsze(x.nazwa)}` : ""}`,
          this.idz("narzedzie", x.nazwa), x.opis.split("\n")[0]))];
      }));
    };
    const szukaj = h("input", { class: "szukaj", placeholder: "szukaj narzędzia…", value: filtr === "mcp" ? "mcp__" : String(filtr || "").startsWith("mcp__") ? filtr : "" });
    szukaj.addEventListener("input", () => rysujListe(szukaj.value.toLowerCase()));
    rysujListe(szukaj.value.toLowerCase());
    return { tytul: String(filtr || "").startsWith("mcp__") ? `MCP: ${filtr.slice(5, -2)}` : filtr === "mcp" ? "narzędzia MCP" : "katalog narzędzi", el: h("div", {},
      h("p", {}, "Każde narzędzie to nazwa, opis i schemat wejścia. Model widzi tylko to. Kto i jak je wykona (harness, serwer MCP), modelu nie obchodzi."),
      model.odroczone.length ? wiersz(h("span", {}, znacznik("odroczone", "k-tools"), `${model.odroczone.length} narzędzi tylko z nazwy`), "→", this.idz("odkrywanie")) : null,
      szukaj, lista) };
  }

  v_narzedzie(nazwa) {
    const { w, model } = this.ctx;
    const t = w.req.tools.find(x => x.nazwa === nazwa) || model.glowne.flatMap(x => x.req.tools).find(x => x.nazwa === nazwa);
    if (!t) return { tytul: nazwa, el: h("div", { class: "pusto" }, `Narzędzia ${nazwa} nie ma w tym requeście (jest tylko z nazwy albo pojawi się później).`) };
    const od = model.glowne.find(x => x.req.tools.some(y => y.nazwa === nazwa));
    const wyw = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === nazwa).map(c => ({ c, x })));
    return { tytul: krotkaNazwa(nazwa), el: h("div", {},
      tabela([["rodzaj", { mcp: "MCP (zewnętrzny proces)", skill: "skill (doczytuje instrukcje)", szukaj: "wyszukiwanie narzędzi", wbudowane: "wbudowane w harness", zastepnik: "zastępnik" }[t.rodzaj]],
        ["w katalogu od", od ? `request #${od.nr}` : "–"], ["odroczone", t.odroczone ? "tak (dociągnięte na żądanie)" : "nie"], ["wywołań w sesji", wyw.length]]),
      naglowek("opis (to czyta model)"), skrot(t.opis, 12),
      naglowek("schemat wejścia"), skrot(JSON.stringify(t.schemat, null, 2), 24),
      wyw.length ? naglowek("wywołania w sesji") : null,
      ...wyw.map(({ c, x }) => wiersz(`#${x.nr}: ${JSON.stringify(c.wejscie)}`, h("span", { class: STATUS_OPIS[c.status][1] }, STATUS_OPIS[c.status][0]), this.idz("wywolanie", c.id)))) };
  }

  v_skille() {
    const { model } = this.ctx;
    const uzyte = new Set(model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === "Skill").map(c => c.wejscie?.skill)));
    return { tytul: "skille", el: h("div", {},
      h("p", {}, "W kontekście leży tylko indeks: nazwa i opis każdego skilla. Pełną treść harness doczytuje dopiero, gdy model wywoła narzędzie Skill. Dla modelu to zwykłe wywołanie narzędzia, a jego wynikiem są instrukcje."),
      naglowek(`indeks w kontekście: ${model.skille.length}`),
      model.skille.length ? null : h("div", { class: "pusto" }, "Nie znaleziono indeksu skilli w tym nagraniu."),
      ...model.skille.map(s => wiersz(h("span", {}, uzyte.has(s.nazwa) ? znacznik("użyty", "k-skill") : null, s.nazwa), `≈${tys(tokenyTekstu(s.opis))} tok.`, this.idz("skill", s.nazwa), s.opis))) };
  }

  v_skill(nazwa) {
    const { model } = this.ctx;
    const s = model.skille.find(x => x.nazwa === nazwa);
    const wyw = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === "Skill" && c.wejscie?.skill === nazwa).map(c => ({ c, x })));
    // treść skilla: blok „skill-tresc” w wiadomości z wynikiem wywołania
    const tresc = wyw.map(({ c }) => {
      for (const x of model.glowne) for (const m of x.req.messages) if (m.bloki.some(b => b.rodzaj === "wynik" && b.id === c.id)) {
        const t = m.bloki.find(b => b.rodzaj === "skill-tresc");
        if (t) return t.tekst;
      }
      return null;
    }).find(Boolean);
    return { tytul: `skill: ${nazwa}`, el: h("div", {},
      naglowek("w indeksie (zawsze w kontekście)"), skrot(s?.opis || "–", 6),
      naglowek(`wywołania: ${wyw.length}`),
      ...wyw.map(({ c, x }) => wiersz(`#${x.nr}: Skill(${JSON.stringify(c.wejscie)})`, "→", this.idz("wywolanie", c.id))),
      naglowek("treść doczytana do kontekstu po wywołaniu"),
      tresc ? skrot(tresc, 30) : h("div", { class: "pusto" }, "Skill nie był wywołany w tym nagraniu, więc jego treść nie trafiła do kontekstu.")) };
  }

  v_stos() {
    const { w, model } = this.ctx;
    const wykres = h("div", { html: wykresStosu(model, w) });
    return { tytul: "historia (stos)", el: h("div", {},
      h("p", {}, "Model jest bezstanowy, więc harness przy każdym kroku wysyła całą historię od początku. Dlatego stos rośnie, a każdy krok kosztuje więcej niż poprzedni."),
      wykres,
      naglowek(`${w.req.messages.length} wiadomości w requeście #${w.nr}`),
      ...w.req.messages.map((m, i) => {
        const typy = [...new Set(m.bloki.map(b => typBloku[b.rodzaj]?.[0] || b.rodzaj))].join(", ");
        const nowa = i >= w.req.messages.length - (w.diff?.noweWiadomosci || 0);
        return wiersz(h("span", {}, nowa ? znacznik("nowe", "k-ok") : null, `${i}. ${autorWiadomosci(m)}`, h("span", { class: "k-muted" }, ` (API: ${m.rola})`)),
          `≈${tys(tokenyTekstu(JSON.stringify(m.bloki)))}`, this.idz("wiadomosc", i), typy);
      })) };
  }

  v_wiadomosc(i) {
    const { w } = this.ctx;
    const m = w.req.messages[Number(i)];
    if (!m) return { tytul: `wiadomość ${i}`, el: h("div", { class: "pusto" }, "Brak.") };
    return { tytul: `wiadomość ${i}`, el: h("div", {},
      tabela([["autor", autorWiadomosci(m)], ["rola w API", `${m.rola}${m.rola === "user" ? " (tak API oznacza wszystko, co nie jest modelem: prompt człowieka, ale też doklejki i wyniki narzędzi od harnessu)" : ""}`], ["bloków", m.bloki.length]]),
      ...m.bloki.map((b, j) => {
        const [opis, k] = typBloku[b.rodzaj] || [b.rodzaj, ""];
        const nag = h("div", {}, znacznik(opis, k), b.cache ? znacznik("cache", "k-cache") : null, h("span", { class: "k-muted" }, `content[${j}]`));
        if (b.rodzaj === "wywolanie") return h("div", {}, nag, wiersz(`${krotkaNazwa(b.nazwa)}(${JSON.stringify(b.wejscie)})`, "→", this.idz("wywolanie", b.id)));
        if (b.rodzaj === "wynik") return h("div", {}, nag, b.blad ? h("span", { class: "k-deny" }, "is_error: true ") : null,
          b.obraz ? h("span", { class: "k-msg" }, "zawiera obraz (blok image, base64) ") : null, skrot(b.tekst, 10));
        return h("div", {}, nag, skrot(b.tekst || "", 10));
      }),
      surowy(w.surowyRequest.messages[Number(i)])) };
  }

  v_wywolanie(id) {
    const { model } = this.ctx;
    let c, x;
    for (const g of model.glowne) { const f = (g.wywolania || []).find(y => y.id === id); if (f) { c = f; x = g; break; } }
    if (!c) return { tytul: "wywołanie", el: h("div", { class: "pusto" }, "Model w tym kroku nie prosił o narzędzie.") };
    const [opis, k] = STATUS_OPIS[c.status];
    return { tytul: `wywołanie ${krotkaNazwa(c.nazwa)}`, el: h("div", {},
      tabela([["narzędzie", krotkaNazwa(c.nazwa)], ["rodzaj", rodzajNarzedzia(c.nazwa)], ["prośba w odpowiedzi", `#${x.nr}`],
        ["decyzja harnessu", h("span", { class: k }, opis)], ["pytanie do człowieka", c.pytanie ? "tak (PermissionRequest)" : "nie / nieznane"], ["id", c.id]]),
      naglowek("wejście (od modelu)"), skrot(JSON.stringify(c.wejscie, null, 2), 16),
      naglowek("wynik (wraca do modelu w następnym requeście)"),
      c.wynik ? h("div", {}, c.wynik.blad ? h("div", { class: "k-deny" }, "is_error: true — model dostaje to jako zwykły wynik i sam decyduje, co dalej") : null,
        c.wynik.obraz ? h("div", { class: "k-msg" }, "Wynik zawiera obraz: model dostaje piksele, nie bajty pliku.") : null,
        skrot(c.wynik.tekst, 14)) : h("div", { class: "pusto" }, "Wyniku nie ma w nagraniu (sesja skończyła się wcześniej)."),
      naglowek(`hooki przy tym wywołaniu: ${c.hooki.length}`),
      c.hooki.length ? h("div", {}, c.hooki.map(e => wiersz(e.event, new Date(e.ts).toLocaleTimeString("pl-PL"), this.idz("hook", `${e.ts}|${e.event}`))))
        : h("div", { class: "pusto" }, "Brak zdarzeń hooków (uruchom z --settings hooks.json, żeby je widzieć)."),
      wiersz("definicja narzędzia", "→", this.idz("narzedzie", c.nazwa))) };
  }
  v_wykonanie(id) { return this.v_wywolanie(id); }

  v_czlowiek() {
    const { model } = this.ctx;
    const pytania = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === "AskUserQuestion" || c.pytanie).map(c => ({ c, x })));
    return { tytul: "człowiek", el: h("div", {},
      h("p", {}, "Człowiek zaczyna każdą turę promptem i dostaje odpowiedź na końcu. W środku pętli pojawia się tylko, gdy harness pyta o zgodę albo model wywoła narzędzie pytania (AskUserQuestion)."),
      naglowek(`prompty: ${model.tury.length}`),
      ...model.tury.map(t => wiersz(`T${t.nr}`, `${t.wymiany.length} kroków`, () => this.naCel("skok", t.wymiany[0].nr), t.prompt)),
      naglowek(`pytania do człowieka w pętli: ${pytania.length}`),
      pytania.length ? h("div", {}, pytania.map(({ c, x }) => wiersz(`#${x.nr} ${krotkaNazwa(c.nazwa)}`, c.nazwa === "AskUserQuestion" ? "pytanie modelu" : "zgoda", this.idz("wywolanie", c.id))))
        : h("div", { class: "pusto" }, "Brak w tym nagraniu. Nagraj sesję interaktywną, w której agent zada pytanie albo poprosi o zgodę.")) };
  }

  v_bramka(id) {
    const { model } = this.ctx;
    const wszystkie = model.glowne.flatMap(x => (x.wywolania || []).map(c => ({ c, x })));
    return { tytul: "uprawnienia", el: h("div", {},
      h("p", {}, "Model tylko prosi. O wykonaniu decyduje harness według reguł: dozwolone, zapytaj człowieka albo odmowa. Odmowa nie kończy pracy — wraca do modelu jako wynik z błędem, a model szuka innej drogi."),
      naglowek(`decyzje w sesji: ${wszystkie.length}`),
      ...wszystkie.map(({ c, x }) => wiersz(h("span", {}, c.id === id ? znacznik("ten krok", "k-ok") : null, `#${x.nr} ${krotkaNazwa(c.nazwa)}`),
        h("span", { class: STATUS_OPIS[c.status][1] }, STATUS_OPIS[c.status][0] + (c.pytanie ? " · pytano" : "")), this.idz("wywolanie", c.id), JSON.stringify(c.wejscie)))) };
  }

  v_cache() {
    const { model, w } = this.ctx;
    const markery = [];
    w.req.system.forEach((s, i) => s.cache && markery.push(`system[${i}] ${JSON.stringify(s.cache)}`));
    w.req.messages.forEach((m, i) => m.bloki.forEach((b, j) => b.cache && markery.push(`messages[${i}].content[${j}] ${JSON.stringify(b.cache)}`)));
    return { tytul: "cache", el: h("div", {},
      h("p", {}, "Początek koperty (narzędzia → instrukcja stała → starsza historia) jest identyczny w kolejnych krokach. Dostawca trzyma go w cache: odczyt jest dużo tańszy i szybszy. Zmiana wcześniejszej warstwy (np. nowe narzędzie, inny system) unieważnia wszystko za nią."),
      h("div", { html: wykresCache(model, w) }),
      h("div", { class: "legenda" }, h("span", {}, h("i", { style: "background:var(--c-cache)" }), "odczyt z cache"), h("span", {}, h("i", { style: "background:var(--c-ask)" }), "zapis do cache"), h("span", {}, h("i", { style: "background:var(--fg2)" }), "bez cache")),
      naglowek("znaczniki cache_control w tym requeście"),
      markery.length ? h("div", {}, markery.map(m => h("div", { class: "wiersz" }, m))) : h("div", { class: "pusto" }, "brak"),
      naglowek("kroki"),
      ...model.glowne.map(x => { const u = x.odp?.usage; return wiersz(`#${x.nr}`, u ? `${tys(u.odczyt)} odczyt · ${tys(u.zapis)} zapis · ${u.wej} nowe · ${Math.round(100 * u.odczyt / (u.razem || 1))}%` : "–"); })) };
  }

  v_hooki() {
    const { model, w } = this.ctx;
    const tu = w.hooki || [];
    const blokady = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.status === "hook").map(c => ({ c, x })));
    return { tytul: "hooki", el: h("div", {},
      h("p", {}, "Hook to skrypt harnessu uruchamiany w stałym punkcie pętli (przed narzędziem, po nim, przy prompcie, na końcu tury). Działa zawsze tak samo: to nie jest prośba do modelu, tylko kod. Może zablokować narzędzie albo dokleić kontekst."),
      naglowek(`blokady przez hook: ${blokady.length}`),
      ...blokady.map(({ c, x }) => wiersz(`#${x.nr} ${krotkaNazwa(c.nazwa)}`, h("span", { class: "k-hook" }, "zablokowane"), this.idz("wywolanie", c.id), c.wynik?.tekst)),
      naglowek(`zdarzenia w tym kroku: ${tu.length}`),
      ...tu.map(e => wiersz(e.event, new Date(e.ts).toLocaleTimeString("pl-PL"), this.idz("hook", `${e.ts}|${e.event}`), e.body?.tool_name)),
      naglowek(`wszystkie zdarzenia w nagraniu: ${model.hooki.length}`),
      model.hooki.length ? null : h("div", { class: "pusto" }, "Brak. Uruchom agenta z: --settings ~/.claude/skills/harness-lens/hooks.json"),
      ...model.hooki.slice(-60).map(e => wiersz(e.event, new Date(e.ts).toLocaleTimeString("pl-PL"), this.idz("hook", `${e.ts}|${e.event}`), e.body?.tool_name))) };
  }
  v_hook(klucz) {
    const [ts, ev] = String(klucz).split("|");
    const e = this.ctx.model.hooki.find(x => String(x.ts) === ts && x.event === ev);
    return { tytul: `hook ${ev}`, el: h("div", {}, h("p", {}, "To dostaje skrypt hooka na wejściu (stdin)."), e ? skrot(JSON.stringify(e.body, null, 2), 40) : h("div", { class: "pusto" }, "brak")) };
  }

  v_odkrywanie() {
    const { model } = this.ctx;
    const zmiany = model.glowne.filter(x => x.diff?.noweNarzedzia?.length || x.diff?.usunieteNarzedzia?.length);
    const szukania = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === "ToolSearch").map(c => ({ c, x })));
    return { tytul: "odkrywanie narzędzi", el: h("div", {},
      h("p", {}, "Nie wszystkie narzędzia są w katalogu od początku. Część model zna tylko z nazwy (lista niżej). Gdy któreś jest potrzebne, model je wyszukuje, a harness dokłada pełny opis i schemat do katalogu w następnym requeście."),
      h("p", { class: "k-muted" }, "Po co: mniej tokenów w każdym kroku, stabilny prefiks dla cache, mniej rozpraszania modelu podobnymi narzędziami."),
      naglowek(`znane tylko z nazwy: ${model.odroczone.length}`),
      h("div", {}, model.odroczone.map(n => wiersz(krotkaNazwa(n), model.glowne.some(x => x.req.tools.some(t => t.nazwa === n)) ? "dociągnięte" : "", this.idz("narzedzie", n)))),
      naglowek(`wyszukiwania: ${szukania.length}`),
      ...szukania.map(({ c, x }) => wiersz(`#${x.nr} ToolSearch(${JSON.stringify(c.wejscie?.query ?? c.wejscie)})`, "→", this.idz("wywolanie", c.id), c.wynik?.tekst)),
      naglowek("zmiany katalogu między requestami"),
      zmiany.length ? h("div", {}, zmiany.map(x => wiersz(`#${x.nr}`, [...x.diff.noweNarzedzia.map(n => `+ ${krotkaNazwa(n)}`), ...x.diff.usunieteNarzedzia.map(n => `− ${n}`)].join(", "))))
        : h("div", { class: "pusto" }, "Katalog nie zmienił się w tym nagraniu.")) };
  }

  v_petla() {
    const { model } = this.ctx;
    return { tytul: "pętla", el: h("div", {},
      h("p", {}, "Jedna tura = pętla: request → odpowiedź → (narzędzie → wynik → request)… aż model odpowie bez prośby o narzędzie. Harness kręci pętlą, model tylko odpowiada."),
      ...model.tury.flatMap(t => [naglowek(`tura ${t.nr}: ${t.prompt ? t.prompt.slice(0, 60) : "(bez promptu)"}`),
        ...t.wymiany.map(x => wiersz(`krok ${x.krok} · request #${x.nr}`, `${x.odp?.stop || "–"}${x.wywolania?.length ? " · " + x.wywolania.map(c => krotkaNazwa(c.nazwa)).join(", ") : ""}`,
          () => this.naCel("skok", x.nr)))])) };
  }

  v_readbash() {
    const { model } = this.ctx;
    const read = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === "Read" && c.status === "ok").map(c => ({ c, x })));
    const obraz = read.find(r => r.c.wynik?.obraz);
    const tekst = read.find(r => !r.c.wynik?.obraz);
    const bash = model.glowne.flatMap(x => (x.wywolania || []).filter(c => c.nazwa === "Bash").map(c => ({ c, x })));
    const kol = (tyt, r) => h("div", {}, h("h4", {}, tyt), r ? h("div", {}, h("div", { class: "k-muted" }, JSON.stringify(r.c.wejscie)),
      r.c.wynik?.obraz ? h("div", { class: "k-msg" }, "[blok image — model widzi obraz]") : skrot(r.c.wynik?.tekst || STATUS_OPIS[r.c.status][0], 8)) : h("div", { class: "pusto" }, "brak w nagraniu"));
    return { tytul: "Read a Bash", el: h("div", {},
      h("p", {}, "Prawdziwe wyniki z tego nagrania, obok siebie."),
      h("div", { class: "porownanie" }, kol("Read (tekst)", tekst), kol("Bash", bash.find(b => b.c.status === "ok") || bash[0])),
      naglowek("Read na obrazie"), kol("Read (obraz)", obraz),
      naglowek("Bash: decyzje uprawnień"),
      ...bash.map(({ c, x }) => wiersz(`#${x.nr} ${c.wejscie?.command}`, h("span", { class: STATUS_OPIS[c.status][1] }, STATUS_OPIS[c.status][0]), this.idz("wywolanie", c.id)))) };
  }
}

function pasekCache(u) {
  if (!u?.razem) return h("div", { class: "pusto" }, "brak danych o tokenach");
  const proc = v => `${(100 * v) / u.razem}%`;
  return h("div", {},
    h("div", { class: "pasek-cache" },
      h("span", { style: `width:${proc(u.odczyt)};background:var(--c-cache)` }),
      h("span", { style: `width:${proc(u.zapis)};background:var(--c-ask)` }),
      h("span", { style: `width:${proc(u.wej)};background:var(--fg2)` })),
    h("div", { class: "legenda" },
      h("span", {}, h("i", { style: "background:var(--c-cache)" }), `${tys(u.odczyt)} z cache (${Math.round((100 * u.odczyt) / u.razem)}%)`),
      h("span", {}, h("i", { style: "background:var(--c-ask)" }), `${tys(u.zapis)} zapis do cache`),
      h("span", {}, h("i", { style: "background:var(--fg2)" }), `${u.wej} bez cache`)),
    h("p", { class: "k-muted" }, `Wejście razem ${tys(u.razem)} tokenów, wyjście ${u.wyj}. Początek koperty, który się nie zmienił, dostawca czyta z cache: taniej i szybciej.`));
}

function wykresStosu(model, w) {
  const xs = model.glowne, W = 380, H = 110, p = 22;
  if (!xs.length) return "";
  const maks = Math.max(...xs.map(x => x.rozmiary.razem));
  const sz = (W - p) / xs.length;
  const slupki = xs.map((x, i) => {
    const r = x.rozmiary, k = (H - 20) / maks;
    const y0 = H - 4;
    const seg = [[r.tools, "var(--c-tools)"], [r.system, "var(--c-system)"], [r.messages, "var(--c-msg)"]];
    let y = y0;
    return seg.map(([v, c]) => { const hh = v * k; y -= hh; return `<rect x="${p + i * sz + 1}" y="${y}" width="${Math.max(2, sz - 2)}" height="${hh}" fill="${c}" opacity="${x === w ? 1 : .55}"/>`; }).join("");
  }).join("");
  return `<svg class="wykres" viewBox="0 0 ${W} ${H}"><text x="0" y="10" font-size="9" fill="var(--muted)">${tys(maks)}</text>${slupki}
    <text x="${p}" y="${H + 0}" font-size="9" fill="var(--muted)"></text></svg>
    <div class="legenda"><span><i style="background:var(--c-tools)"></i>narzędzia</span><span><i style="background:var(--c-system)"></i>system</span><span><i style="background:var(--c-msg)"></i>historia</span><span>słupek = jeden request (≈ tokeny wejścia)</span></div>`;
}

function wykresCache(model, w) {
  const xs = model.glowne.filter(x => x.odp?.usage), W = 380, H = 110;
  if (!xs.length) return "";
  const maks = Math.max(...xs.map(x => x.odp.usage.razem));
  const sz = W / xs.length;
  return `<svg class="wykres" viewBox="0 0 ${W} ${H}">${xs.map((x, i) => {
    const u = x.odp.usage, k = (H - 6) / maks;
    let y = H;
    return [[u.odczyt, "var(--c-cache)"], [u.zapis, "var(--c-ask)"], [u.wej, "var(--fg2)"]].map(([v, c]) => { const hh = v * k; y -= hh; return `<rect x="${i * sz + 1}" y="${y}" width="${Math.max(2, sz - 2)}" height="${hh}" fill="${c}" opacity="${x === w ? 1 : .55}"/>`; }).join("");
  }).join("")}</svg>`;
}

// Dane: nagranie (rekordy z proxy i hooków) → model widoku z neutralnymi nazwami.
// Nic tu nie jest zmyślane: każda liczba i treść pochodzi z rekordu. Szacunki są oznaczone `≈`.

export async function wczytajListe() {
  const r = await fetch("/_lens/api/nagrania");
  return r.json();
}

export async function wczytajNagranie(zrodlo, plik) {
  const r = await fetch(`/_lens/api/nagranie?zrodlo=${encodeURIComponent(zrodlo)}&plik=${encodeURIComponent(plik)}`);
  const tekst = await r.text();
  return tekst.split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

const tokeny = s => Math.round((typeof s === "string" ? s : JSON.stringify(s ?? "")).length / 3.6);
const jakoLista = c => (Array.isArray(c) ? c : [{ type: "text", text: String(c ?? "") }]);

export function tekstWyniku(c) {
  if (typeof c === "string") return c;
  return jakoLista(c).map(b => b.type === "text" ? b.text : b.type === "image" ? "[obraz]"
    : b.type === "tool_reference" ? `[załadowano narzędzie: ${b.tool_name}]` : `[${b.type}]`).join("\n");
}

// Blok wiadomości → rodzaj widoczny na scenie.
function blok(b, rola) {
  if (b.type === "text") {
    const t = b.text || "";
    if (rola === "system") return { rodzaj: "harness", tekst: t, cache: b.cache_control };
    if (rola === "assistant") return { rodzaj: "tekst-modelu", tekst: t, cache: b.cache_control };
    if (/^\s*<system-reminder>/.test(t)) return { rodzaj: "doklejka", tekst: t, cache: b.cache_control };
    if (/^Base directory for this skill:/.test(t)) return { rodzaj: "skill-tresc", tekst: t, cache: b.cache_control };
    if (/^Tool loaded\.?$/.test(t.trim())) return { rodzaj: "doklejka", tekst: t, cache: b.cache_control };
    // /compact: streszczenie zamiast historii, polecenie streszczenia, informacje o komendzie lokalnej — pisze je harness
    if (/^This session is being continued from a previous conversation/.test(t)) return { rodzaj: "streszczenie", tekst: t, cache: b.cache_control };
    if (/^\s*CRITICAL: Respond with TEXT ONLY/.test(t)) return { rodzaj: "polecenie-kompakcji", tekst: t, cache: b.cache_control };
    if (/^\s*<(local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/.test(t)) return { rodzaj: "doklejka", tekst: t, cache: b.cache_control };
    return { rodzaj: "uzytkownik", tekst: t, cache: b.cache_control };
  }
  if (b.type === "tool_use") return { rodzaj: "wywolanie", id: b.id, nazwa: b.name, wejscie: b.input, cache: b.cache_control };
  if (b.type === "tool_result") return { rodzaj: "wynik", id: b.tool_use_id, blad: !!b.is_error, tekst: tekstWyniku(b.content),
    obraz: jakoLista(b.content).some(x => x.type === "image"), surowe: b.content, cache: b.cache_control };
  if (b.type === "image") return { rodzaj: "obraz", cache: b.cache_control };
  if (b.type === "thinking" || b.type === "redacted_thinking") return { rodzaj: "myslenie", tekst: b.thinking || "", cache: b.cache_control };
  return { rodzaj: "inne", typ: b.type, cache: b.cache_control };
}

export function rodzajNarzedzia(n) {
  if (n.startsWith("mcp__")) return "mcp";
  if (n === "Skill") return "skill";
  if (n === "ToolSearch") return "szukaj";
  return "wbudowane";
}

export function statusWyniku(w) {
  if (!w) return "brak";
  if (!w.blad) return "ok";
  if (/hook/i.test(w.tekst)) return "hook";
  if (/auto-allowed|permission|denied|rejected|not allowed|doesn't want|needs approval|requires approval|odmow/i.test(w.tekst)) return "odmowa";
  return "blad";
}

// Wyciąga listę „- nazwa: opis” po nagłówku (indeks skilli) albo kolejne nazwy (odroczone narzędzia).
function indeksSkilli(teksty) {
  for (const t of teksty) {
    const i = t.search(/skills are available/i);
    if (i < 0) continue;
    const wynik = [];
    for (const l of t.slice(i).split("\n").slice(1)) {
      const m = l.match(/^- ([\w:.-]+):\s*(.*)$/);
      if (m) wynik.push({ nazwa: m[1], opis: m[2] });
      else if (wynik.length && !l.trim()) break;
    }
    if (wynik.length) return wynik;
  }
  return [];
}
function odroczone(teksty) {
  for (const t of teksty) {
    const i = t.search(/deferred tools are now available/i);
    if (i < 0) continue;
    const nazwy = [];
    for (const l of t.slice(i).split("\n").slice(1)) {
      if (/^[\w-]+$/.test(l.trim())) nazwy.push(l.trim());
      else if (nazwy.length) break;
    }
    return nazwy;
  }
  return [];
}

function normalizujRequest(body) {
  const system = jakoLista(body.system).map(s => ({ tekst: s.text || "", cache: s.cache_control }));
  const tools = (body.tools || []).map(t => ({
    nazwa: t.name, opis: t.description || "", schemat: t.input_schema || null, cache: t.cache_control,
    odroczone: !!t.defer_loading, rodzaj: t.name === "DeferredToolPlaceholder" ? "zastepnik" : rodzajNarzedzia(t.name),
    typ: t.type || null,
  }));
  const messages = (body.messages || []).map(m => ({ rola: m.role, bloki: jakoLista(m.content).map(b => blok(b, m.role)) }));
  const { system: _s, tools: _t, messages: _m, ...reszta } = body;
  return { model: body.model, params: reszta, system, tools, messages };
}

function usage(u) {
  if (!u) return null;
  const wej = u.input_tokens || 0, odczyt = u.cache_read_input_tokens || 0, zapis = u.cache_creation_input_tokens || 0;
  return { wej, odczyt, zapis, wyj: u.output_tokens || 0, razem: wej + odczyt + zapis };
}

export function zbuduj(rekordy) {
  const zapytania = new Map(), odpowiedzi = new Map(), hooki = [];
  for (const r of rekordy) {
    if (r.kind === "request" && r.body) zapytania.set(r.id, r);
    else if (r.kind === "response") odpowiedzi.set(r.id, r);
    else if (r.kind === "hook") hooki.push(r);
  }
  const wymiany = [];
  for (const [id, rq] of zapytania) {
    const rs = odpowiedzi.get(id);
    const req = normalizujRequest(rq.body);
    const odp = rs ? {
      status: rs.status, ms: rs.ms, stop: rs.body?.stop_reason || null, blad: rs.body?.error || null,
      bloki: jakoLista(rs.body?.content || []).map(b => blok(b, "assistant")), usage: usage(rs.body?.usage), surowe: rs.body,
    } : null;
    wymiany.push({ id, ts: rq.ts, koniec: rs?.ts || null, req, odp, surowyRequest: rq.body,
      glowna: req.tools.length > 0 && req.system.reduce((a, s) => a + s.tekst.length, 0) > 2000 });
  }
  wymiany.sort((a, b) => a.ts - b.ts);
  const glowne = wymiany.filter(w => w.glowna);
  glowne.forEach((w, i) => (w.nr = i + 1));

  // Rozmiary warstw: szacunek z długości tekstu, przeskalowany do prawdziwego `usage`, gdy jest.
  // Jeden współczynnik na całe nagranie, żeby niezmienna warstwa miała stały rozmiar między krokami.
  const est = w => ({ system: tokeny(w.req.system.map(s => s.tekst).join("")), tools: tokeny(w.surowyRequest.tools || []),
    messages: tokeny(w.surowyRequest.messages || []) });
  let sumaEst = 0, sumaReal = 0;
  for (const w of wymiany) if (w.odp?.usage?.razem) { const e = est(w); sumaEst += e.system + e.tools + e.messages; sumaReal += w.odp.usage.razem; }
  const k = sumaEst ? sumaReal / sumaEst : 1;
  for (const w of wymiany) {
    const e = est(w);
    w.rozmiary = { system: Math.round(e.system * k), tools: Math.round(e.tools * k), messages: Math.round(e.messages * k),
      razem: w.odp?.usage?.razem || Math.round((e.system + e.tools + e.messages) * k), szacunek: !w.odp?.usage };
  }

  // Wywołania narzędzi: odpowiedź modelu → wynik w kolejnym requeście → hooki po tool_use_id.
  const wyniki = new Map();
  for (const w of glowne) for (const m of w.req.messages) for (const b of m.bloki) if (b.rodzaj === "wynik") wyniki.set(b.id, b);
  const hookiPoId = new Map();
  // wywołania narzędzi w kolejności czasu (do hooków bez tool_use_id, np. PermissionRequest)
  const wszystkieWyw = glowne.flatMap(w => (w.odp?.bloki || []).filter(b => b.rodzaj === "wywolanie").map(b => ({ b, ts: w.koniec || w.ts })));
  for (const h of hooki) {
    let id = h.body?.tool_use_id;
    if (!id && h.body?.tool_name) id = [...wszystkieWyw].reverse().find(x => x.b.nazwa === h.body.tool_name && x.ts <= h.ts)?.b.id;
    if (id) (hookiPoId.get(id) || hookiPoId.set(id, []).get(id)).push(h);
  }
  // Zdarzenia hooków przypisane do kroku: UserPromptSubmit przychodzi przed requestem, którego dotyczy (należy do
  // pierwszego requestu po nim); reszta (Stop, SessionEnd, …) należy do ostatniego requestu przed nią.
  const hookiKroku = new Map(glowne.map(w => [w, []]));
  for (const h of hooki) {
    const w = h.event === "UserPromptSubmit" ? glowne.find(x => x.ts >= h.ts) : [...glowne].reverse().find(x => x.ts <= h.ts);
    if (w) hookiKroku.get(w).push(h);
  }
  for (const w of glowne) {
    w.wywolania = (w.odp?.bloki || []).filter(b => b.rodzaj === "wywolanie").map(b => {
      const wynik = wyniki.get(b.id) || null;
      const hk = hookiPoId.get(b.id) || [];
      return { ...b, wynik, status: statusWyniku(wynik), hooki: hk, pytanie: hk.some(h => h.event === "PermissionRequest") };
    });
    w.hooki = hookiKroku.get(w) || [];
  }

  // Ciągłość historii: ile początkowych wiadomości requestu jest takich samych jak w poprzednim (bez znaczników cache).
  // Krótszy wspólny początek niż poprzednia historia = historia zastąpiona (kompakcja) albo wyczyszczona (/clear).
  // ta sama wiadomość bywa zapisana jako napis albo jako lista bloków ze znacznikiem cache — porównujemy samą treść
  const bezCache = m => JSON.stringify({ role: m.role, content: typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content },
    (k, v) => (k === "cache_control" ? undefined : v));
  // wiadomości harnessu z rolą „system” (środowisko itp.) harness przesuwa na koniec przy każdym requeście — nie liczą się do ciągłości
  const rozmowa = ms => ms.filter(m => m.role !== "system");
  const wspolnyPoczatek = (a, b) => { let i = 0; while (i < a.length && i < b.length && bezCache(a[i]) === bezCache(b[i])) i++; return i; };
  const hookMiedzy = (od, do_, f) => hooki.find(h => h.ts >= od && h.ts <= do_ && f(h));
  glowne.forEach((w, i) => {
    const poprzW = glowne[i - 1];
    const ost = [...w.req.messages].reverse().find(m => m.rola === "user");
    const pre = poprzW && hookMiedzy(poprzW.koniec || poprzW.ts, w.ts, h => h.event === "PreCompact");
    w.kompakcja = !!(ost?.bloki.some(b => b.rodzaj === "polecenie-kompakcji")) && { wyzwalacz: pre?.body?.trigger || "manual", hook: pre || null };
    if (!poprzW) {
      // pierwszy request nagrania z wcześniejszą rozmową (--resume): harness wczytał zapisaną historię z dysku
      const idxPromptu = w.req.messages.reduce((acc, m, j) => (m.rola === "user" && m.bloki.some(b => b.rodzaj === "uzytkownik") ? j : acc), -1);
      const wczesniej = idxPromptu > 0 && w.req.messages.slice(0, idxPromptu).some(m => m.rola === "assistant");
      if (wczesniej && !w.kompakcja) { w.reset = "wznowienie"; w.wspolne = idxPromptu; w.wczytane = idxPromptu; }
      else w.wspolne = 0;
      return;
    }
    const a = rozmowa(poprzW.surowyRequest.messages || []), b = rozmowa(w.surowyRequest.messages || []);
    const wspolneRozmowy = wspolnyPoczatek(a, b);
    // nowe wiadomości: wszystko za wspólnym początkiem (w indeksach pełnej historii requestu)
    const pelne = w.surowyRequest.messages || [];
    let ile = 0, k = 0;
    for (; k < pelne.length && ile < wspolneRozmowy; k++) if (pelne[k].role !== "system") ile++;
    w.wspolne = Math.min(k, pelne.length);
    // kompakcja: polecenie streszczenia jest doklejone tylko do tego requestu — historia się nie powiększa
    if (w.kompakcja) w.wspolne = pelne.length;
    // poprzedni request kompakcji ma zmienioną ostatnią wiadomość (doklejone polecenie streszczenia)
    if (wspolneRozmowy < a.length - (poprzW.kompakcja ? 1 : 0) && !w.kompakcja) {
      const clear = hookMiedzy(poprzW.koniec || poprzW.ts, w.ts, h => h.event === "SessionEnd" && h.body?.reason === "clear");
      // /resume w trakcie: nowa historia niesie wcześniejszą rozmowę (odpowiedzi modelu przed promptem)
      const idxPromptu = w.req.messages.reduce((acc, m, j) => (m.rola === "user" && m.bloki.some(b => b.rodzaj === "uzytkownik") ? j : acc), -1);
      const wczesniej = idxPromptu > 0 && w.req.messages.slice(0, idxPromptu).some(m => m.rola === "assistant");
      w.reset = poprzW.kompakcja ? "kompakcja" : clear ? "clear" : wczesniej ? "wznowienie" : "nowa";
      w.wspolne = 0; // nowa historia: wszystko w niej jest nowe, nawet jeśli pierwsza wiadomość brzmi tak samo jak dawniej
      if (w.reset === "wznowienie") { w.wspolne = idxPromptu; w.wczytane = idxPromptu; } // wczytana rozmowa nie jest nowa
    }
  });

  // Tury: nowa tura zaczyna się, gdy ostatnia wiadomość użytkownika zawiera tekst od człowieka
  // (albo gdy request to kompakcja lub pierwszy po wyczyszczeniu / zastąpieniu historii).
  const tury = [];
  let poprz = null;
  for (const w of glowne) {
    const ost = [...w.req.messages].reverse().find(m => m.rola === "user");
    const prompt = w.kompakcja ? "/compact" : ost?.rola === "user" ? ost.bloki.filter(b => b.rodzaj === "uzytkownik").map(b => b.tekst).join("\n") : "";
    const nowa = !poprz || w.kompakcja || w.reset || (prompt && !ost.bloki.some(b => b.rodzaj === "wynik"));
    if (nowa) tury.push({ nr: tury.length + 1, prompt, wymiany: [], kompakcja: !!w.kompakcja, reset: w.reset || null });
    const t = tury[tury.length - 1];
    w.tura = t.nr;
    w.krok = t.wymiany.length + 1;
    t.wymiany.push(w);
    // Różnica względem poprzedniej głównej wymiany.
    if (poprz) {
      const przed = new Set(poprz.req.tools.map(t => t.nazwa)), po = new Set(w.req.tools.map(t => t.nazwa));
      w.diff = {
        noweWiadomosci: w.req.messages.length - w.wspolne,
        noweNarzedzia: [...po].filter(n => !przed.has(n)),
        usunieteNarzedzia: [...przed].filter(n => !po.has(n)),
        systemZmieniony: JSON.stringify(poprz.surowyRequest.system) !== JSON.stringify(w.surowyRequest.system),
      };
    } else w.diff = { noweWiadomosci: w.req.messages.length - (w.wspolne || 0), noweNarzedzia: [], usunieteNarzedzia: [], systemZmieniony: false };
    poprz = w;
  }

  const teksty = glowne.length ? glowne[glowne.length - 1].req.messages.flatMap(m => m.bloki.map(b => b.tekst || ""))
    .concat(glowne[glowne.length - 1].req.system.map(s => s.tekst)) : [];
  // historia wczytana z dysku przy wznowieniu (zanim poszedł pierwszy request)
  const wczyt = rekordy.filter(r => r.kind === "wczytana-historia").at(-1);
  const wczytana = wczyt ? { ts: wczyt.ts, plik: wczyt.plik,
    messages: wczyt.messages.map(m => ({ rola: m.role, bloki: jakoLista(m.content).map(b => blok(b, m.role)) })),
    tokeny: tokeny(wczyt.messages) } : null;
  return {
    wymiany, glowne, tury, hooki, wczytana,
    boczne: wymiany.filter(w => !w.glowna),
    skille: indeksSkilli(teksty),
    odroczone: odroczone(teksty),
    pusto: glowne.length === 0,
  };
}

export const tokenyTekstu = tokeny;

// Etapy jednego kroku pętli (jednego requestu). Scena rysuje stan po każdym etapie, a log po lewej
// pokazuje linię i rozwinięcie „dlaczego”. Czasy pochodzą z nagrania (request, odpowiedź, hooki).
import { tys } from "./scena.js";

const krotko = n => n.replace(/^mcp__(\w+?)__/, "$1 · ");
export const serwerMcp = n => (n.match(/^mcp__(\w+?)__/) || [])[1] || null;
export const arg = c => {
  const w = c.wejscie || {};
  const v = w.file_path || w.command || w.skill || w.query || w.sql || w.pattern || Object.values(w)[0];
  return typeof v === "string" ? v.replace(/^.*\/(?=[^/]+$)/, "") : JSON.stringify(v ?? "");
};
export const skrot = (s, n) => { s = String(s ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// doklejki, które należą do konkretnej warstwy (przy wyłączonej warstwie ich nie pokazujemy)
const WARSTWA_DOKLEJKI = { "indeks skilli": "skille", "treść skilla": "skille", "odroczone narzędzia": "odkrywanie",
  "potwierdzenie załadowania narzędzia": "odkrywanie" };

const DLACZEGO_DOKLEJKI = {
  "streszczenie historii": "Po kompakcji historia zaczyna się od streszczenia poprzedniej rozmowy, które napisał model. Szczegóły sprzed kompakcji są dostępne tylko w tej skróconej formie.",
  "polecenie streszczenia": "Przy /compact harness dokleja do historii polecenie: odpowiedz samym tekstem i streść całą rozmowę. Model wykonuje je jak każdy inny tekst.",
  "informacja o komendzie lokalnej": "Harness informuje model, że człowiek uruchomił komendę lokalną (np. /compact) i jaki był jej wynik. Model jej nie wykonywał.",
  "ponownie dołączone pliki": "Po kompakcji harness dokleja ponownie treść plików czytanych wcześniej, żeby model nie musiał ich czytać od nowa.",
  "zasady projektu": "Pliki zasad (CLAUDE.md i podobne) z projektu i katalogu domowego, wklejone w całości na początek rozmowy.",
  "kontekst użytkownika": "Dane o użytkowniku i sesji, np. e-mail do podpisywania commitów.",
  "stan gita": "Gałąź, status i ostatnie commity: model wie, w jakim repozytorium pracuje.",
  "zasady commitów": "Jak podpisywać commity i pull requesty.",
  "środowisko": "Katalog roboczy, system, powłoka, model i data.",
  "indeks skilli": "Nazwy i opisy skilli. Sama treść skilla trafi do kontekstu dopiero po wywołaniu.",
  "odroczone narzędzia": "Same nazwy narzędzi, których schematów nie ma w katalogu. Model może je dociągnąć wyszukiwaniem.",
  "treść skilla": "Pełne instrukcje skilla, doczytane po wywołaniu narzędzia Skill.",
  "potwierdzenie załadowania narzędzia": "Harness informuje model, że dociągnięte narzędzie jest już w katalogu.",
};

// Co jest w doklejce harnessu (po treści bloku).
// Krótkie podsumowanie wyniku narzędzia („218 linii”, „zapisano”, „odpowiedź: …”); pełny wynik jest w szczegółach.
const odm = (n, a, b, c) => `${n} ${n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c}`;
export function podsumowanieWyniku(c) {
  if (c.czeka || c.status === "brak") return "czekam na wynik…";
  if (c.status === "hook") return "zablokował hook";
  if (c.status === "odmowa") return "odmowa";
  const w = c.wynik || {};
  if (c.status === "blad") return `błąd: ${skrot(w.tekst, 30)}`;
  const t = w.tekst || "";
  const linie = t.replace(/\n+$/, "").split("\n").filter(x => x.trim()).length;
  switch (c.nazwa) {
    case "Read": return w.obraz ? "obraz" : odm(linie, "linia", "linie", "linii");
    case "Bash": return linie ? `OK · ${odm(linie, "linia", "linie", "linii")} wyjścia` : "OK · bez wyjścia";
    case "Grep": case "Glob": return /^No (files|matches)/i.test(t) ? "brak trafień" : odm(linie, "trafienie", "trafienia", "trafień");
    case "Edit": case "Write": case "MultiEdit": case "NotebookEdit": return "zapisano";
    case "WebSearch": return odm((t.match(/"url"/g) || []).length, "link", "linki", "linków");
    case "WebFetch": return `${tys(Math.round(t.length / 3.6))} tok. treści`;
    case "AskUserQuestion": { const o = t.match(/"="([^"]+)"/)?.[1]; return o ? `odpowiedź: ${o}` : "odpowiedź człowieka"; }
    case "ToolSearch": { const n = (t.match(/załadowano narzędzie|tool_reference/g) || []).length; return n ? odm(n, "narzędzie", "narzędzia", "narzędzi") : "brak narzędzi"; }
    case "Skill": return "skill wczytany";
  }
  return linie ? odm(linie, "linia", "linie", "linii") : "pusty wynik";
}

export function kategorie(b) {
  const t = b.tekst || "";
  if (b.rodzaj === "skill-tresc") return ["treść skilla"];
  if (b.rodzaj === "streszczenie") return ["streszczenie historii"];
  if (b.rodzaj === "polecenie-kompakcji") return ["polecenie streszczenia"];
  if (/^\s*<(local-command-caveat|command-name|command-message|command-args|local-command-stdout)>/.test(t)) return ["informacja o komendzie lokalnej"];
  if (b.rodzaj === "harness" && /^Called the \w+ tool with the following input/.test(t)) return ["ponownie dołączone pliki"];
  const k = [];
  if (/OVERRIDE any default behavior|CLAUDE\.md|instructions are shown below/i.test(t)) k.push("zasady projektu");
  if (/# Environment|working directory/i.test(t)) k.push("środowisko");
  if (/skills are available/i.test(t)) k.push("indeks skilli");
  if (/deferred tools/i.test(t)) k.push("odroczone narzędzia");
  if (/userEmail|following context/i.test(t)) k.push("kontekst użytkownika");
  if (/Attribution for git/i.test(t)) k.push("zasady commitów");
  if (/gitStatus|git status/i.test(t)) k.push("stan gita");
  if (/^Tool loaded/i.test(t.trim())) k.push("potwierdzenie załadowania narzędzia");
  return k.length ? k : [skrot(t.replace(/<\/?system-reminder>/g, ""), 30)];
}

export function etapyKroku(w, model, W) {
  // przy wyłączonej warstwie MCP narzędzie MCP to po prostu narzędzie (bez nazwy serwera)
  const krotkoW = n => (W.has("mcp") ? krotko(n) : n.replace(/^mcp__\w+?__/, ""));
  const E = [];
  const tura = model.tury.find(t => t.nr === w.tura);
  const hook = ev => (w.hooki || []).find(h => h.event === ev);
  const dodaj = (typ, tytul, dlaczego, extra = {}) => E.push({ typ, tytul, dlaczego, ...extra });

  if (w.krok === 1 && w.reset) dodaj("reset", {
      kompakcja: "HISTORIA PO KOMPAKCJI: ZACZYNA SIĘ OD STRESZCZENIA",
      clear: "/CLEAR: HARNESS CZYŚCI HISTORIĘ — NOWA SESJA",
      nowa: "NOWA HISTORIA: HARNESS ZACZYNA OD ZERA",
      wznowienie: `WZNOWIONA SESJA: HARNESS WCZYTAŁ ZAPISANĄ HISTORIĘ (${w.wczytane} WIADOMOŚCI)`,
    }[w.reset], {
      wznowienie: "Przy --resume (albo /resume) harness czyta zapisaną rozmowę z dysku i wkłada ją do historii. Model nadal niczego nie pamięta: po prostu dostaje całą starą rozmowę w kopercie.",
      kompakcja: "Stara historia nie wraca. Harness buduje nową: streszczenie, ostatnia odpowiedź modelu i ponownie dołączone pliki. Koperta jest dużo mniejsza.",
      clear: "Komenda /clear nie idzie do modelu. Harness kończy sesję i zaczyna nową z pustą historią, więc doklejki z kontekstem projektu wracają jak na samym początku.",
      nowa: "Ten request nie kontynuuje poprzedniej historii (np. po /clear albo w nowej sesji). Model nie wie nic o tym, co było wcześniej.",
    }[w.reset], { ts: w.ts });
  if (w.krok === 1 && w.kompakcja) {
    const pre = W.has("hooki") && w.kompakcja.hook;
    if (w.kompakcja.wyzwalacz === "auto") dodaj("kompakcja-start", "HARNESS: KONTEKST SIĘ KOŃCZY — KOMPAKCJA",
      "Historia zbliża się do limitu okna kontekstu, więc harness sam uruchamia kompakcję.", { ts: pre?.ts });
    else dodaj("prompt", "CZŁOWIEK WPISUJE /COMPACT (KOMENDA HARNESSU)",
      "/compact to komenda harnessu, a nie prompt dla modelu. Harness ma skrócić historię: poprosi model o streszczenie i zastąpi nim rozmowę.",
      { ts: pre?.ts, aktor: "czlowiek" });
    if (pre) dodaj("hook-compact", "HOOK PRECOMPACT: SKRYPT DOSTAJE SYGNAŁ KOMPAKCJI",
      "Przed kompakcją harness uruchamia hook PreCompact. Skrypt może np. zapisać pełną historię, zanim zostanie zastąpiona streszczeniem.", { ts: pre.ts, hook: "compact" });
  } else if (w.krok === 1) {
    const h = W.has("hooki") && hook("UserPromptSubmit");
    dodaj("prompt", `CZŁOWIEK WYSYŁA PROMPT: „${skrot(tura?.prompt, 40)}”`,
      "Każda tura zaczyna się od człowieka. Harness przyjmuje prompt i dopiero potem składa request do modelu.", { ts: h?.ts, aktor: "czlowiek" });
    if (h) dodaj("hook-prompt", "HOOK USERPROMPTSUBMIT: SKRYPT HARNESSU DOSTAJE PROMPT",
      "Zanim prompt pójdzie dalej, harness uruchamia hook: zwykły skrypt, który może prompt zablokować albo coś do niego dokleić. To kod, nie model.", { ts: h.ts, hook: "prompt" });
  }
  // co harness dołożył w tym kroku: doklejki (system-reminder, kontekst w środku rozmowy, treść skilla) i resztę
  const pierwszaNowa = w.req.messages.length - (w.diff?.noweWiadomosci || 0);
  // każda kategoria doklejki to osobny etap; idx = wiadomość, do której trafia
  const doklejki = [];
  w.req.messages.slice(pierwszaNowa).forEach((m, j) => m.bloki.filter(b => ["doklejka", "harness", "skill-tresc", "streszczenie", "polecenie-kompakcji"].includes(b.rodzaj))
    .forEach(b => kategorie(b).filter(k => !WARSTWA_DOKLEJKI[k] || W.has(WARSTWA_DOKLEJKI[k]))
      .forEach(k => { if (!doklejki.some(d => d.k === k)) doklejki.push({ k, idx: pierwszaNowa + j, b }); })));
  // w kolejnych krokach odpowiedź i wyniki trafiły do historii już w poprzednim kroku (analiza, wynik)
  const etapStos = () => w.krok === 1 && !w.kompakcja && W.has("stos") && w.diff?.noweWiadomosci > 0 && dodaj("stos", "DOKŁADAM PROMPT DO HISTORII",
    "Model nie pamięta poprzednich wywołań. Wszystko, co ma wiedzieć, harness musi mieć w historii i wysłać od nowa w każdym requeście.");
  // kolejność jak w historii: doklejki przed promptem, prompt, doklejki po nim (np. wiadomość harnessu ze środowiskiem)
  const idxPromptu = w.req.messages.findIndex((m, j) => j >= pierwszaNowa && m.bloki.some(b => b.rodzaj === "uzytkownik"));
  const etapDoklejki = (f = () => true) => (W.has("prompt") || W.has("stos")) && doklejki.filter(f).forEach(d => dodaj("doklejki",
    `HARNESS DOKLEJA: ${d.k.toUpperCase()}`,
    (DLACZEGO_DOKLEJKI[d.k] || "Harness dokleja do historii tekst od siebie.") + " Człowiek tego nie pisał, ale model widzi to tak samo jak prompt.",
    { idx: d.idx, blok: d.b, kat: d.k }));
  if (w.krok === 1 && idxPromptu >= 0) { etapDoklejki(d => d.idx <= idxPromptu); etapStos(); etapDoklejki(d => d.idx > idxPromptu); }
  else { etapStos(); etapDoklejki(); }

  // koperta: pełny rozkład, gdy składana pierwszy raz albo gdy zmienił się system lub katalog
  const u = w.odp?.usage;
  const odkr = W.has("odkrywanie") && w.diff?.noweNarzedzia?.length;
  const rozklad = w.nr === 1 || w.diff?.systemZmieniony || odkr;
  if (rozklad && W.has("prompt")) dodaj("k-system", `KOPERTA 1/3: INSTRUKCJA STAŁA (SYSTEM) · ≈${tys(w.rozmiary.system)} TOK.`,
    "Na początek koperty idzie instrukcja stała: kim jest agent, jak ma pracować, zasady bezpieczeństwa. Jest taka sama w każdym requeście.");
  if (rozklad && W.has("narzedzia")) dodaj("k-narzedzia", `KOPERTA 2/3: KATALOG ${w.req.tools.length} NARZĘDZI${odkr ? ` (+${w.diff.noweNarzedzia.length} DOCIĄGNIĘTE)` : ""} · ≈${tys(w.rozmiary.tools)} TOK.`,
    "Potem katalog narzędzi: nazwa, opis i schemat każdego. Model może prosić tylko o narzędzia z tego katalogu." + (odkr ? " W tym kroku katalog urósł o narzędzia dociągnięte wyszukiwaniem." : ""));
  dodaj("koperta", rozklad ? `KOPERTA 3/3: HISTORIA ${w.req.messages.length} WIADOMOŚCI · RAZEM ${tys(w.rozmiary.razem)} TOK.`
      : `SKŁADAM KOPERTĘ: TA SAMA + DŁUŻSZA HISTORIA · ${tys(w.rozmiary.razem)} TOK.`,
    (rozklad ? "Na końcu cała historia rozmowy, razem z doklejkami harnessu. Koperta jest gotowa." : "Instrukcja stała i katalog się nie zmieniły, dochodzi tylko nowa historia."
      + (W.has("cache") ? " Dzięki temu początek koperty może przyjść z cache." : ""))
    + (W.has("cache") && u?.razem ? ` Tu ${Math.round((100 * u.odczyt) / u.razem)}% wejścia przyszło z cache.` : ""));
  if (w.kompakcja) dodaj("polecenie", "DOKLEJAM DO TEGO REQUESTU (JEDNORAZOWO): POLECENIE STRESZCZENIA",
    "Polecenie „odpowiedz samym tekstem i streść całą rozmowę” harness dokłada tylko do tej jednej koperty. Nie zostaje w historii: w następnym requeście już go nie ma.");
  dodaj("wysylka", `WYSYŁAM REQUEST #${w.nr} DO MODELU`,
    "To jedyny moment, w którym model cokolwiek widzi. Harness wysyła kopertę przez sieć i czeka.", { ts: w.ts });
  dodaj("model", `MODEL GENERUJE ODPOWIEDŹ${w.odp?.ms ? ` (${(w.odp.ms / 1000).toFixed(1).replace(".", ",")} S)` : ""}`,
    "Model przewiduje kolejne tokeny odpowiedzi na podstawie samej koperty. Nie ma dostępu do plików, terminala ani sieci.");
  if (!w.odp) return czasy(E, w);
  const wyw = w.wywolania || [];
  if (w.kompakcja) dodaj("powrot", "WRACA STRESZCZENIE HISTORII",
    "Model odpowiada samym tekstem: streszczeniem całej dotychczasowej rozmowy.", { ts: w.koniec });
  else dodaj("powrot", `WRACA ODPOWIEDŹ: ${wyw.length ? (W.has("narzedzia") ? "TOOL_USE · " + wyw.map(c => krotkoW(c.nazwa)).join(", ") : "PROŚBA O DZIAŁANIE") : "TEKST"}`,
    "Odpowiedź to tekst albo prośba o wywołanie narzędzia. Pole stop_reason mówi, które: end_turn albo tool_use.", { ts: w.koniec });
  dodaj("analiza", wyw.length ? `SPRAWDZAM: MODEL PROSI O NARZĘDZIE? TAK (${wyw.length})` : "SPRAWDZAM: MODEL PROSI O NARZĘDZIE? NIE",
    "Harness czyta stop_reason i bloki tool_use. To zwykły kod, a nie model: od tej chwili decyduje harness.");
  if (W.has("stos") && !w.kompakcja) dodaj("stos-odp", `DOKŁADAM ODPOWIEDŹ MODELU DO HISTORII${wyw.length ? " (WYWOŁANIE NARZĘDZIA)" : ""}`,
    "Odpowiedź modelu staje się częścią historii. W następnym requeście model zobaczy własną poprzednią odpowiedź tylko dlatego, że harness ją tu zapisał.");

  // na żywo: wyniku jeszcze nie ma (następny request nie poszedł) — pokazujemy, na co harness czeka, bez wyniku i pętli
  const czeka = wyw.length > 0 && wyw.every(c => c.status === "brak");
  if (czeka && W.has("narzedzia")) for (const c of wyw) {
    const pre = (c.hooki || []).find(h => h.event === "PreToolUse");
    const perm = (c.hooki || []).find(h => h.event === "PermissionRequest");
    if (W.has("hooki") && pre) dodaj("hook-pre", `HOOK PRETOOLUSE: SKRYPT SPRAWDZA ${krotkoW(c.nazwa).toUpperCase()} — PRZEPUSZCZA`,
      "Przed każdym narzędziem harness uruchamia hook PreToolUse: skrypt dostaje nazwę narzędzia i argumenty i może je zablokować. Tu przepuścił.", { c, ts: pre.ts, hook: "pre" });
    if (perm && W.has("uprawnienia")) {
      if (W.has("hooki")) dodaj("hook-perm", `HOOK PERMISSIONREQUEST: SKRYPT DOSTAJE PROŚBĘ O ZGODĘ NA ${krotkoW(c.nazwa).toUpperCase()}`,
        "Reguły nie pozwalają wykonać tego od razu, więc harness musiałby zapytać człowieka. Najpierw uruchamia hook PermissionRequest: skrypt może sam zgodzić się albo odmówić.",
        { c, ts: perm.ts, hook: "perm" });
      dodaj("pytanie", `PYTAM CZŁOWIEKA O ZGODĘ: ${krotkoW(c.nazwa)}(${skrot(arg(c), 26)}) — CZEKAM`,
        "Reguły nie rozstrzygają, więc harness pyta człowieka i czeka na decyzję. Model czeka, nic nie wie o tym pytaniu.", { c, aktor: "czlowiek" });
      continue;
    }
    // bez prośby o zgodę: AskUserQuestion jest zawsze dozwolone; inne narzędzie przeszło hook PreToolUse bez pytania
    const pewne = c.nazwa === "AskUserQuestion" || !!pre;
    const cc = { ...c, status: "ok", czeka: true };
    if (pewne && W.has("uprawnienia")) dodaj("uprawnienia", `UPRAWNIENIA: ${krotkoW(c.nazwa).toUpperCase()} DOZWOLONE`,
      "Model tylko prosi. Zanim harness cokolwiek wykona, sprawdza reguły: dozwolone, zapytaj człowieka albo odmowa.", { c: cc, ts: pre?.ts });
    const srv = W.has("mcp") && serwerMcp(c.nazwa);
    const [t, d, aktor] = c.nazwa === "AskUserQuestion"
      ? [`PYTAM CZŁOWIEKA: „${skrot(c.wejscie?.questions?.[0]?.question, 40)}” — CZEKAM NA ODPOWIEDŹ`,
        "Dla modelu człowiek jest kolejnym narzędziem: harness pokazuje pytanie z opcjami i czeka na wybór. Model w tym czasie nic nie robi.", "czlowiek"]
      : pewne ? [`WYKONUJĘ ${krotkoW(c.nazwa).toUpperCase()}(${skrot(arg(c), 30)}) — CZEKAM NA WYNIK`,
        "Narzędzie wykonuje harness na Twoim komputerze, a nie model. Wynik pójdzie do modelu w następnym requeście.", srv ? `mcp:${srv}` : "harness"]
      : [`CZEKAM: ${krotkoW(c.nazwa).toUpperCase()}(${skrot(arg(c), 26)}) — ZGODA ALBO WYKONANIE`,
        "Harness albo pyta człowieka o zgodę, albo już wykonuje narzędzie. Bez hooków lens tego nie rozróżni. Wynik pójdzie do modelu w następnym requeście.", srv ? `mcp:${srv}` : "harness"];
    dodaj("wykonanie", t, d, { c: cc, aktor });
  }
  if (wyw.length && !czeka && W.has("narzedzia")) for (const c of wyw) {
    const pre = (c.hooki || []).find(h => h.event === "PreToolUse");
    const post = (c.hooki || []).find(h => h.event === "PostToolUse");
    if (c.status === "hook" && W.has("hooki"))
      dodaj("hook-pre", `HOOK PRETOOLUSE BLOKUJE ${krotkoW(c.nazwa).toUpperCase()}`,
        "Hook to skrypt harnessu uruchamiany przed narzędziem. Działa zawsze tak samo, niezależnie od tego, co chce model. Tu zablokował zmianę pliku pod audytem.",
        { c, ts: pre?.ts, hook: "pre" });
    else if (c.status === "hook" && W.has("uprawnienia"))
      dodaj("uprawnienia", `UPRAWNIENIA: ${krotkoW(c.nazwa).toUpperCase()} ZABLOKOWANE`,
        "Harness nie wykonał tego wywołania. Blokada wraca do modelu jako zwykły wynik.", { c, ts: pre?.ts });
    else {
      if (W.has("hooki") && pre) dodaj("hook-pre", `HOOK PRETOOLUSE: SKRYPT SPRAWDZA ${krotkoW(c.nazwa).toUpperCase()} — PRZEPUSZCZA`,
        "Przed każdym narzędziem harness uruchamia hook PreToolUse: skrypt dostaje nazwę narzędzia i argumenty i może je zablokować. Tu przepuścił.", { c, ts: pre.ts, hook: "pre" });
    }
    if (c.status !== "hook" && W.has("uprawnienia")) {
      const perm = (c.hooki || []).find(h => h.event === "PermissionRequest");
      if (W.has("hooki") && perm) dodaj("hook-perm", `HOOK PERMISSIONREQUEST: SKRYPT DOSTAJE PROŚBĘ O ZGODĘ NA ${krotkoW(c.nazwa).toUpperCase()}`,
        "Reguły nie pozwalają wykonać tego od razu, więc harness musiałby zapytać człowieka. Najpierw uruchamia hook PermissionRequest: skrypt może sam zgodzić się albo odmówić.",
        { c, ts: perm.ts, hook: "perm" });
      if (c.pytanie && c.status === "ok") dodaj("pytanie", `PYTAM CZŁOWIEKA O ZGODĘ: ${krotkoW(c.nazwa)}(${skrot(arg(c), 26)})`,
        "Reguły nie rozstrzygają, więc harness pyta człowieka. Model czeka, nic nie wie o tym pytaniu.", { c, aktor: "czlowiek" });
      const zgoda = c.pytanie && c.status !== "ok";
      dodaj("uprawnienia", c.status === "ok" ? `UPRAWNIENIA: ${krotkoW(c.nazwa).toUpperCase()} DOZWOLONE`
          : zgoda ? `UPRAWNIENIA: ${krotkoW(c.nazwa).toUpperCase()} WYMAGA ZGODY — BRAK ZGODY` : `UPRAWNIENIA: ${krotkoW(c.nazwa).toUpperCase()} — ODMOWA`,
        c.status === "ok" ? "Model tylko prosi. Zanim harness cokolwiek wykona, sprawdza reguły: dozwolone, zapytaj człowieka albo odmowa."
          : zgoda ? "Reguła mówi: to polecenie wymaga zgody człowieka. Zgody nie było, więc harness go nie wykonuje i odsyła modelowi odmowę jako zwykły wynik."
          : "Reguły nie pozwalają na to wywołanie. Harness go nie wykonuje, a odmowę odsyła modelowi jako zwykły wynik. Model sam szuka innej drogi.",
        { c, ts: pre?.ts });
    }
    if (c.status === "ok") {
      const srv = W.has("mcp") && serwerMcp(c.nazwa);
      const [t, d, aktor] = srv ? [`SERWER MCP „${srv}” WYKONUJE ${c.nazwa.split("__")[2]}(${skrot(arg(c), 24)})`,
          "Harness nie zna tej bazy ani trackera. Przekazuje wywołanie osobnemu procesowi (serwerowi MCP) i czeka na wynik.", `mcp:${srv}`]
        : c.nazwa === "AskUserQuestion" ? [`PYTAM CZŁOWIEKA: „${skrot(c.wejscie?.questions?.[0]?.question, 40)}”`,
            "Dla modelu człowiek jest kolejnym narzędziem: harness pokazuje pytanie z opcjami, czeka na wybór i oddaje go modelowi jako wynik.", "czlowiek"]
        : c.nazwa === "WebSearch" ? [`WYSZUKUJĘ W INTERNECIE: „${skrot(c.wejscie?.query, 34)}”`,
            "Harness nie przeszukuje internetu sam. Wysyła osobny request do API z wyszukiwarką po stronie dostawcy" + (bocznePo(w, model) ? ` (tu: ${bocznePo(w, model)} boczny request)` : "") + ", a wynik wraca jako tekst.", "internet"]
        : c.nazwa === "WebFetch" ? [`POBIERAM STRONĘ: ${skrot(c.wejscie?.url, 34)}`,
            "Harness pobiera stronę z internetu i zwykle streszcza ją osobnym, mniejszym modelem, zanim wynik trafi do historii.", "internet"]
        : c.nazwa === "Skill" && W.has("skille") ? [`DOCZYTUJĘ SKILL „${c.wejscie?.skill}” DO KONTEKSTU`, "Do tej pory w kontekście był tylko opis skilla z indeksu. Pełna treść trafia do historii dopiero teraz.", "skill"]
        : c.nazwa === "ToolSearch" && W.has("odkrywanie") ? [`SZUKAM NARZĘDZIA: ${skrot(c.wejscie?.query, 34)}`, "Pełnego opisu narzędzia nie było w katalogu. Harness doda go do katalogu w następnym requeście.", "harness"]
        : [`WYKONUJĘ ${krotkoW(c.nazwa).toUpperCase()}(${skrot(arg(c), 30)})`, "Narzędzie wykonuje harness na Twoim komputerze, a nie model.", "harness"];
      dodaj("wykonanie", t, d, { c, aktor, ts: post?.ts });
      if (W.has("hooki") && post) dodaj("hook-post", `HOOK POSTTOOLUSE: SKRYPT DOSTAJE WYNIK ${krotkoW(c.nazwa).toUpperCase()}`,
        "Po wykonaniu narzędzia harness uruchamia hook PostToolUse. Skrypt widzi wynik i może np. zapisać go w logu albo dokleić uwagę dla modelu.", { c, ts: post.ts, hook: "post" });
    }
    dodaj("wynik", c.status === "ok" ? `WYNIK ${krotkoW(c.nazwa).toUpperCase()}: ${podsumowanieWyniku(c).toUpperCase()} → DO HISTORII` : `${c.status === "hook" ? "BLOKADA" : "ODMOWA"} → DO HISTORII JAKO WYNIK`,
      "Wynik nie idzie do modelu od razu. Harness dokłada go do historii i wyśle w następnym requeście razem z całą resztą.", { c });
  }
  if (czeka) {
    // czekamy na wynik: pętla jeszcze się nie domknęła
  } else if (w.odp.stop === "tool_use") {
    dodaj("petla", "PĘTLA: WRACAM DO MODELU Z WYNIKAMI",
      "Model poprosił o narzędzie, więc tura trwa. Harness składa kolejny request: ta sama koperta, dłuższa historia.");
  } else if (w.kompakcja) {
    const po = model.glowne[model.glowne.indexOf(w) + 1];
    const zostaje = po ? po.req.messages.findIndex(m => m.bloki.some(b => b.rodzaj === "uzytkownik")) : -1;
    dodaj("kompakcja", `HARNESS ZASTĘPUJE HISTORIĘ STRESZCZENIEM: ${w.req.messages.length} WIADOMOŚCI → ${zostaje > 0 ? zostaje : "STRESZCZENIE"}`,
      "Cała dotychczasowa historia znika z koperty. Od następnego requestu model widzi streszczenie zamiast rozmowy: koperta jest dużo mniejsza, ale szczegóły przepadają.",
      { ts: w.koniec });
    dodaj("koniec", "KOMPAKCJA ZAKOŃCZONA: HISTORIA SKRÓCONA",
      "Harness pokazuje człowiekowi, że historia została skrócona. Kolejny prompt pójdzie już z nową, krótką historią.", { aktor: "czlowiek", ts: w.koniec });
  } else {
    const stop = (w.hooki || []).find(h => h.event === "Stop");
    if (W.has("hooki") && stop) dodaj("hook-stop", "HOOK STOP: SKRYPT DOSTAJE KONIEC TURY",
      "Gdy model kończy odpowiedź, harness uruchamia hook Stop. Skrypt może np. uruchomić testy i kazać agentowi pracować dalej, zanim tura wróci do człowieka.",
      { ts: stop.ts, hook: "stop" });
    dodaj("koniec", "KONIEC TURY: ODPOWIEDŹ DLA CZŁOWIEKA",
    "Model odpowiedział bez prośby o narzędzie. Harness przestaje kręcić pętlą i oddaje głos człowiekowi.", { aktor: "czlowiek", ts: (w.hooki || []).find(h => h.event === "Stop")?.ts });
  }
  return czasy(E, w);
}

// Boczne requesty (np. wyszukiwarka dla WebSearch) wysłane między odpowiedzią tego kroku a następnym requestem.
function bocznePo(w, model) {
  const nast = model.glowne[model.glowne.indexOf(w) + 1];
  return (model.boczne || []).filter(b => b.ts >= (w.koniec || w.ts) && b.ts < (nast ? nast.ts : Infinity)).length;
}

// Uzupełnia brakujące czasy: etapy przed wysyłką dostają czas requestu, po odpowiedzi czas odpowiedzi (rosnąco).
function czasy(E, w) {
  let ost = w.ts;
  const iW = E.findIndex(e => e.typ === "wysylka");
  E.forEach((e, i) => {
    if (!e.ts) e.ts = i < iW ? w.ts : i <= iW + 1 ? w.ts : (w.koniec || ost);
    // zdarzenia hooków docierają do lensa z opóźnieniem; etapy przed wysyłką nie mogą być późniejsze niż request
    if (i < iW && e.ts > w.ts) e.ts = w.ts;
    if (e.ts < ost && i > iW) e.ts = ost;
    ost = e.ts;
    e.id = `${w.id}:${i}`;
    e.i = i;
  });
  return E;
}

// Które warstwy biorą udział w danym etapie (tryb auto).
export function warstwyEtapu(e, w) {
  const W = [];
  if (e.hook) W.push("hooki");
  if (e.typ === "stos") W.push("stos");
  if (e.typ === "doklejki") W.push("prompt", "stos");
  if (e.typ === "k-system" || e.typ === "polecenie") W.push("prompt");
  if (e.typ === "k-narzedzia") W.push("narzedzia");
  if (e.typ === "koperta") {
    W.push("prompt");
    if (w.req.tools.length) W.push("narzedzia");
    if (w.diff?.noweNarzedzia?.length) W.push("narzedzia", "odkrywanie");
    if (w.diff?.noweNarzedzia?.some(n => n.startsWith("mcp__"))) W.push("mcp");
  }
  if (e.typ === "wysylka" && w.odp?.usage?.odczyt) W.push("cache");
  if (["powrot", "analiza"].includes(e.typ) && (w.wywolania || []).length) W.push("narzedzia");
  if (["uprawnienia", "pytanie"].includes(e.typ)) W.push("narzedzia", "uprawnienia");
  if (e.c) {
    W.push("narzedzia");
    if (e.c.nazwa.startsWith("mcp__")) W.push("mcp");
    if (e.c.nazwa === "Skill") W.push("skille");
    if (e.c.nazwa === "ToolSearch") W.push("odkrywanie");
  }
  if (e.typ === "wynik") W.push("stos");
  if (e.typ === "stos-odp") W.push("stos");
  if (["reset", "kompakcja"].includes(e.typ)) W.push("stos");
  return W;
}

// Tryb „całe nagranie”: warstwy, które brały udział od początku nagrania do etapu i kroku w (włącznie).
// Nowa sesja (/clear, /resume, nowa historia) zaczyna liczenie warstw od nowa; kompakcja to ta sama sesja.
export const NOWA_SESJA = new Set(["clear", "nowa", "wznowienie"]);
export function warstwyDoPozycji(model, w, i, etapyFn) {
  const teraz = new Set();
  const idx = model.glowne.indexOf(w);
  let start = 0;
  for (let j = idx; j >= 0; j--) if (NOWA_SESJA.has(model.glowne[j].reset)) { start = j; break; }
  for (const x of model.glowne.slice(start)) {
    const Ex = x === w ? etapyFn(x).slice(0, i + 1) : etapyFn(x);
    for (const e of Ex) for (const k of warstwyEtapu(e, x)) teraz.add(k);
    if (x === w) break;
  }
  return teraz;
}

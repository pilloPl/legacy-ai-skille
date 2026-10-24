// Rozdziały: jedno zdanie, zestaw warstw, krok z nagrania i etap, na którym odtwarzanie się zatrzymuje.

export const WARSTWY = [
  { id: "prompt", nazwa: "Prompt startowy", kolor: "var(--c-system)" },
  { id: "narzedzia", nazwa: "Narzędzia", kolor: "var(--c-tools)" },
  { id: "uprawnienia", nazwa: "Uprawnienia", kolor: "var(--c-deny)", wymaga: ["narzedzia"] },
  { id: "stos", nazwa: "Stos", kolor: "var(--c-msg)" },
  { id: "skille", nazwa: "Skille", kolor: "var(--c-skill)", wymaga: ["narzedzia"] },
  { id: "mcp", nazwa: "MCP", kolor: "var(--c-mcp)", wymaga: ["narzedzia"] },
  { id: "odkrywanie", nazwa: "Odkrywanie", kolor: "var(--c-tools)", wymaga: ["narzedzia"] },
  { id: "cache", nazwa: "Cache", kolor: "var(--c-cache)" },
  { id: "hooki", nazwa: "Hooki", kolor: "var(--c-hook)" },
];

const wyw = m => m.glowne.flatMap(w => (w.wywolania || []).map(c => ({ c, w })));
const pierwszy = (m, f) => wyw(m).find(({ c }) => f(c))?.w || null;
const N = ["narzedzia"], NU = ["narzedzia", "uprawnienia"];

export const ROZDZIALY = [
  { id: "model", tytul: "Model i odpowiedź", warstwy: [], stop: "powrot",
    wybierz: m => m.glowne.find(w => !(w.wywolania || []).length && w.odp?.stop === "end_turn") || m.glowne[0],
    tekst: "Harness wysyła kopertę, model odsyła tekst. Model niczego nie wykonuje i niczego nie pamięta." },
  { id: "wywolanie", tytul: "Wywołanie narzędzia", warstwy: N, stop: "analiza",
    wybierz: m => m.glowne.find(w => (w.wywolania || []).length),
    tekst: "Zamiast tekstu model może odesłać prośbę: „wywołaj Read”. Wykonać ją musi harness.",
    brak: "Poproś agenta o przeczytanie pliku." },
  { id: "uprawnienia", tytul: "Uprawnienia", warstwy: NU, stop: "uprawnienia",
    wybierz: m => pierwszy(m, c => c.status === "odmowa") || pierwszy(m, c => c.pytanie) || m.glowne.find(w => (w.wywolania || []).length),
    tekst: "Harness sprawdza reguły, zanim cokolwiek wykona. Odmowa wraca do modelu jako zwykły wynik.",
    brak: "Odrzuć w terminalu jedną prośbę agenta." },
  { id: "petla", tytul: "Pętla", warstwy: NU, stop: "koniec", tura: true,
    wybierz: m => (m.tury.find(t => t.wymiany.length >= 3) || m.tury.find(t => t.wymiany.length >= 2))?.wymiany[0],
    tekst: "Wynik wraca jako kolejny request. Pętla kręci się, aż model odpowie bez prośby o narzędzie.",
    brak: "Żadna tura nie miała jeszcze więcej niż jednego kroku." },
  { id: "stos", tytul: "Stos wiadomości", warstwy: [...NU, "stos"], stop: "koperta",
    wybierz: m => [...m.glowne].reverse().find(w => w.krok > 1) || m.glowne[m.glowne.length - 1],
    tekst: "Model jest bezstanowy, więc każdy request niesie całą historię od początku." },
  { id: "prompt", tytul: "Prompt startowy", warstwy: ["prompt", ...NU, "stos"], stop: "doklejki",
    wybierz: m => m.glowne[0],
    tekst: "Zanim padnie Twoje pierwsze słowo, harness składa instrukcję stałą i dokleja kontekst projektu." },
  { id: "skille", tytul: "Skille", warstwy: ["prompt", ...NU, "stos", "skille"], stop: "wykonanie",
    wybierz: m => pierwszy(m, c => c.nazwa === "Skill"),
    tekst: "W kontekście leży tylko indeks skilli. Treść trafia do historii dopiero po wywołaniu narzędzia Skill.",
    brak: "Poproś agenta o użycie skilla." },
  { id: "mcp", tytul: "MCP", warstwy: ["prompt", ...NU, "stos", "skille", "mcp"], stop: "wykonanie",
    wybierz: m => pierwszy(m, c => c.nazwa.startsWith("mcp__")),
    tekst: "Dla modelu MCP to zwykłe narzędzie. Harness przekazuje wywołanie osobnemu procesowi: bazie, trackerowi.",
    brak: "Podłącz serwer MCP i poproś o coś z niego." },
  { id: "readbash", tytul: "Read, a nie Bash", warstwy: ["prompt", ...NU, "stos", "skille", "mcp"], stop: "wykonanie", inspektor: "readbash",
    wybierz: m => pierwszy(m, c => c.nazwa === "Read" && c.wynik?.obraz) || pierwszy(m, c => c.nazwa === "Read"),
    tekst: "Własne narzędzia dają determinizm, obrazy, uprawnienia per narzędzie i czytelny audyt.",
    wiecej: `<ul><li><b>determinizm</b>: stały schemat wejścia i format wyniku z numerami linii</li>
      <li><b>multimodalność</b>: Read na obrazku zwraca obraz, a nie bajty</li>
      <li><b>bezpieczeństwo</b>: Read tylko czyta, a <code>rm</code> wymaga zgody</li>
      <li><b>audyt</b>: hook dopasowuje się po nazwie narzędzia</li><li><b>koszt i przenośność</b>: limity linii, ten sam wynik na macu i Windows</li></ul>`,
    brak: "Poproś agenta o przeczytanie pliku i obrazka." },
  { id: "odkrywanie", tytul: "Odkrywanie narzędzi", warstwy: ["prompt", ...NU, "stos", "skille", "mcp", "odkrywanie"], stop: "wykonanie",
    wybierz: m => pierwszy(m, c => c.nazwa === "ToolSearch") || m.glowne.find(w => w.diff?.noweNarzedzia?.length),
    tekst: "Część narzędzi model zna tylko z nazwy. Pełny opis dociąga wyszukiwaniem, gdy jest potrzebny.",
    brak: "Uruchom agenta z ENABLE_TOOL_SEARCH=true." },
  { id: "cache", tytul: "Cache", warstwy: ["prompt", ...NU, "stos", "skille", "mcp", "odkrywanie", "cache"], stop: "analiza", inspektor: "odpowiedz",
    wybierz: m => [...m.glowne].filter(w => w.odp?.usage).sort((a, b) => b.odp.usage.odczyt - a.odp.usage.odczyt)[0],
    tekst: "Niezmieniony początek koperty dostawca trzyma w cache: taniej i szybciej. Szron na kopercie to część z cache, liczby są w ostatniej odpowiedzi." },
  { id: "hooki", tytul: "Hooki", warstwy: WARSTWY.map(w => w.id), stop: "hook-pre",
    wybierz: m => pierwszy(m, c => c.status === "hook") || m.glowne.find(w => (w.hooki || []).length),
    tekst: "Hook to skrypt harnessu w stałym punkcie pętli. Działa zawsze, niezależnie od modelu.",
    brak: "Uruchom agenta z --settings ~/.claude/skills/harness-lens/hooks.json." },
  { id: "swobodny", tytul: "Tryb swobodny", warstwy: WARSTWY.map(w => w.id), swobodny: true,
    wybierz: m => m.glowne[0],
    tekst: "Wszystkie warstwy. Chodź po etapach i krokach, klikaj elementy sceny." },
];

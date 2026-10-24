# harness-lens

Zobacz w przeglądarce, co harness agenta naprawdę wysyła do modelu i co robi z odpowiedzią.

## Wymagania

- **Node 18+** (`node -v`). Claude Code z instalatora natywnego **nie** zawiera Node, trzeba go doinstalować:
  mac `brew install node`, Windows `winget install OpenJS.NodeJS.LTS`, Linux paczka systemowa albo `nvm`.
- `git` i zalogowany `claude`.

## Instalacja i start (jedna komenda po instalacji)

mac / Linux / Git Bash:
```bash
git clone --depth 1 https://github.com/pilloPl/legacy-ai-skille /tmp/lais && mkdir -p ~/.claude/skills && cp -R /tmp/lais/harness-lens ~/.claude/skills/
node ~/.claude/skills/harness-lens/lens.mjs claude
```
PowerShell:
```powershell
Remove-Item -Recurse -Force $env:TEMP\lais -ErrorAction Ignore; git clone --depth 1 https://github.com/pilloPl/legacy-ai-skille $env:TEMP\lais; New-Item -ItemType Directory -Force $HOME\.claude\skills | Out-Null; Copy-Item -Recurse -Force $env:TEMP\lais\harness-lens $HOME\.claude\skills\
node $HOME\.claude\skills\harness-lens\lens.mjs claude
```
`lens.mjs claude` uruchamia nową sesję `claude` przez proxy z hookami lensa (domyślnie, wyłączysz przez `LENS_BEZ_HOOKOW=1`),
sam otwiera przeglądarkę i widok startuje „na żywo”. Dalsze argumenty idą do `claude`, np. `lens.mjs claude --resume`.
Sesje otwarte wcześniej (bez proxy) nie są widoczne.

Metafory dla ludzi nietechnicznych (lekarz, prezes, szachy, Memento): dodaj `--metafory`, np.
`node ~/.claude/skills/harness-lens/lens.mjs --metafory claude`. Bez tego przełącznika „metafora” w widoku nie ma.

Osobno (np. gdy `claude` już działa w innym terminalu): `node ~/.claude/skills/harness-lens/lens.mjs`, a potem
`ENABLE_TOOL_SEARCH=true ANTHROPIC_BASE_URL=http://localhost:7777 claude` (PowerShell: `$env:ENABLE_TOOL_SEARCH="true"; $env:ANTHROPIC_BASE_URL="http://localhost:7777"; claude`)
i w widoku „● na żywo”.

Opcjonalnie:
- hooki: w trybie `lens.mjs claude` są włączone same; przy osobnym `claude` dodaj `--settings ~/.claude/skills/harness-lens/hooks.json`;
- `ENABLE_TOOL_SEARCH=true claude` pozwala zobaczyć, jak katalog narzędzi rośnie po wyszukaniu.

Bez uruchamiania agenta: wybierz u góry nagranie `przykład · demo`.

## Rozdziały

1. Model i odpowiedź · 2. Wywołanie narzędzia · 3. Uprawnienia · 4. Pętla · 5. Stos · 6. Prompt startowy · 7. Skille ·
8. MCP · 9. Read, a nie Bash · 10. Odkrywanie narzędzi · 11. Cache · 12. Hooki · 13. Tryb swobodny

Każdy krok pętli (request) dzieli się na etapy: prompt → doklejki harnessu → koperta (system, narzędzia, historia) →
wysyłka → model → powrót → analiza → hooki i uprawnienia → wykonanie → wynik → pętla albo koniec tury. Log po lewej pokazuje etapy z prawdziwymi godzinami; klik w linię rozwija „dlaczego”.

Klawisze: ←/→ etap, ↑/↓ krok, spacja manual/auto, PgUp/PgDn rozdział, 1–9 warstwy, Esc zamyka szczegóły,
P tryb pokazowy, L na żywo, T tabela. Tempo (sekundy na etap w trybie auto) ustawia suwak pod sceną.

Pod sceną linia „następne ▸” mówi, jaki etap przyjdzie dalej. Wynik narzędzia ma krótkie podsumowanie („6 linii”,
„OK · 3 linie wyjścia”, „zablokował hook”, „odpowiedź: …”); pełny wynik jest w szczegółach. Tabela (T) pokazuje każdy
request z prawdziwą godziną, czasem modelu i tokenami (wejście, z cache, do cache, wyjście), także boczne requesty;
tabela idzie razem ze sceną: widać tylko to, co już się wydarzyło (odpowiedź po jej powrocie, wynik po etapie „wynik”); klik w wiersz przenosi do tego kroku.

„Na żywo” = bieżąca sesja z proxy (lista nagrań zablokowana). Wyłączone: demo albo stare sesje z listy.
Nowe nagranie startuje bez warstw; każda włącza się, gdy pierwszy raz bierze udział. Wyłączona warstwa = jej etapy znikają.

## Zasada widoku

Skracamy, nie zmyślamy. Każde skrócenie jest oznaczone („… N tokenów pominięto”) i rozwija się do pełnej treści.
Liczby tokenów z `usage` są prawdziwe. Podział koperty na warstwy jest szacunkiem z długości tekstu (oznaczony ≈).

## Testy

- Logika etapów: `node --test ~/.claude/skills/harness-lens/testy/*.test.mjs`: kolejność etapów i cykli wywołań, czasy, `/compact`, `/clear`, `--resume`,
  wyłączona warstwa = brak jej etapów, tryb „całe nagranie” (warstwy rosną z pozycją, znikają przy cofaniu).
- Scena: `http://localhost:7777/_lens/testy.html`: każdy etap demo, widoczność warstw, koperty, strzałki, hooki, MCP, człowiek, stos.

## Pliki

| plik | co robi |
|---|---|
| `lens.mjs` | przezroczysty proxy do API + serwer widoku, zapis do `~/.harness-lens/sesje/*.jsonl` (bez nagłówków autoryzacji) |
| `hook.mjs`, `hooks.json` | przekazują zdarzenia hooków do lensa (nic nie blokują) |
| `oczysc.mjs` | czyści nagranie przed udostępnieniem (ścieżka domowa, nazwa użytkownika, e-maile, id konta) |
| `widok/` | widok: `dane.js` (normalizacja), `etapy.js` (etapy kroku i „dlaczego”), `scena.js` (SVG: stan po etapie + przejście), `inspektor.js`, `rozdzialy.js`, `app.js` |
| `przyklady/campsite.jsonl` | nagranie domyślne (bez ruchu): pytanie z zadania szkolenia na campsite-power, 2 kroki pętli; `nagraj-campsite.sh` nagrywa je od nowa (`LENS_PRZYKLAD=<plik>` zmienia domyślne) |
| `przyklady/demo.jsonl` | nagranie wzorcowe: projekt „magazyn”, 7 tur, serwery MCP `baza` (sqlite) i `tracker` (44 narzędzia, działają 3) |
| `nagraj-film.mjs` | nagrywa MP4 z jednego przebiegu demo (tura 2) ze szczegółami; wymaga `ffmpeg` i `playwright` (instrukcja w pliku) |
| `przyklady/kompakcja.jsonl` | nagranie z `/compact`: osobna tura, streszczenie zastępuje historię; widok obsługuje też `/clear` i `--resume` |
| `przyklady/pytanie-i-internet.jsonl` | WebSearch (nagrany naprawdę: harness pyta wyszukiwarkę osobnym requestem do API) i AskUserQuestion (tura dopisana ręcznie, bo w `-p` to narzędzie nie działa) |
| `przyklady/projekt-magazyn/` | projekt demo z serwerami MCP, skillem i hookiem; `nagraj-demo.sh` nagrywa `demo.jsonl` od nowa |

---
name: harness-lens
description: >
  Pokazuje w przeglądarce, krok po kroku, jak działa harness agenta (Claude Code i podobne): co dokładnie
  leci do modelu (instrukcja stała, katalog narzędzi, historia), odpowiedź z wywołaniem narzędzia, uprawnienia,
  pętlę, rosnący stos wiadomości, prompt startowy, odkrywanie narzędzi, cache i hooki — na PRAWDZIWYM ruchu z
  terminala (lokalny proxy) albo na nagraniu wzorcowym. Wywołuj, gdy użytkownik chce „zobaczyć, co agent wysyła
  do modelu”, „pokazać jak działa harness / pętla agenta”, uruchomić harness-lens albo odtworzyć nagranie sesji.
argument-hint: "[port]"
---

# harness-lens

Lokalny proxy + widok. Bez zależności, wystarczy Node 18+.

## Uruchomienie (zrób to za użytkownika)

0. Sprawdź `node -v` (potrzebny 18+). Claude Code z instalatora natywnego nie zawiera Node. Jeśli go brak,
   zaproponuj instalację: mac `brew install node`, Windows `winget install OpenJS.NodeJS.LTS`, Linux paczka albo `nvm`.
   Nie instaluj bez zgody.
1. Uruchom serwer **w tle** (Bash z `run_in_background`):
   `node ~/.claude/skills/harness-lens/lens.mjs` (inny port: `LENS_PORT=7778 node …`).
   Metafory dla nietechnicznych (przełącznik „metafora” w nagłówku) tylko na prośbę: dodaj `--metafory`.
   Jeśli port jest zajęty, lens najpewniej już działa. Nie uruchamiaj drugiego, tylko podaj adres.
2. Otwórz widok: `open http://localhost:7777/_lens/` (macOS), `start http://localhost:7777/_lens/` (Windows).
3. Podaj użytkownikowi **jedną linijkę** do drugiego terminala:
   - mac / Linux / Git Bash: `ENABLE_TOOL_SEARCH=true ANTHROPIC_BASE_URL=http://localhost:7777 claude`
   - PowerShell: `$env:ENABLE_TOOL_SEARCH="true"; $env:ANTHROPIC_BASE_URL="http://localhost:7777"; claude`

   Ta sesja (ta, w której działasz) **nie** przechodzi przez proxy. Pokazujemy nową sesję.
4. Opcjonalne dodatki do tej linijki (powiedz o nich jednym zdaniem):
   - `--settings ~/.claude/skills/harness-lens/hooks.json` dodaje zdarzenia hooków (w trybie `lens.mjs claude` są włączone same);
   - `ENABLE_TOOL_SEARCH=true` jest w linijce celowo: przez proxy Claude Code sam wyłącza tool search i wszystkie
     narzędzia idą z pełnym opisem; z flagą część idzie tylko z nazwy i model dociąga je przez `ToolSearch`
     (w trybie `lens.mjs claude` flaga jest ustawiana sama; `ENABLE_TOOL_SEARCH=false` ją wyłącza).

Alternatywa w jednym kroku (najprostsza dla użytkownika, w jego własnym terminalu):
`node ~/.claude/skills/harness-lens/lens.mjs claude` uruchamia nową sesję agenta przez proxy z hookami lensa,
otwiera przeglądarkę i widok startuje od razu „na żywo”. Dalsze argumenty idą do `claude` (np. `--resume`).

## Co widać

- Bez ruchu widok pokazuje nagranie `przyklady/campsite.jsonl` (pytanie z zadania szkolenia na campsite-power);
  na liście jest też nagranie wzorcowe `przyklady/demo.jsonl` (7 tur na projekcie „magazyn”: odpowiedź,
  Read z obrazem, skill, ToolSearch → MCP `baza` i `tracker`, blokada przez hook, odmowa `rm`).
  Nagranie od nowa: `przyklady/projekt-magazyn/nagraj-demo.sh`.
- Log etapów po lewej (klik = „dlaczego”), ←/→ etap, ↑/↓ krok, spacja manual/auto, rozdziały przyciskiem „rozdziały ▸”.
  Warstwy u góry (1–9); każdy element sceny jest klikalny i rozwija się w inspektorze do prawdziwych danych.
- „● na żywo” w widoku = bieżąca sesja z proxy.

## Prywatność

Nagrania leżą w `~/.harness-lens/sesje/` i zawierają pełne prompty oraz treść plików. Nagłówki autoryzacji nie są
zapisywane. Przed pokazaniem cudzej sesji włącz „tryb pokazowy” (P). Zanim nagranie komuś udostępnisz, uruchom
`node ~/.claude/skills/harness-lens/oczysc.mjs <we.jsonl> <wy.jsonl>` (ścieżka domowa, nazwa użytkownika, e-maile).

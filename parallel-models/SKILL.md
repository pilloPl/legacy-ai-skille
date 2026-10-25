---
disable-model-invocation: true
name: parallel-models
description: >
  Dyrygent workflow „nowe rozwiązanie obok starego modelu” (Parallel Models, Legacy Fighter). Bierze opis nowego
  rozwiązania i miejsca w kodzie, w które ma wejść (np. wynik mappera archetypu z bolączkami), zakłada
  specyfikację w gicie i prowadzi ją przez kroki swappable-dsl (specyfikacja, ≥3 miejsca, scenariusze i
  sterownik legacy, nowe rozwiązanie ze starym zachowaniem, wpięcie z przełącznikiem i seederem, porównanie na
  ekranie albo w API), potem parallel-model-router (flaga, router z rekonsyliacją, ekran wajchy, test zgodności,
  przełączenie wajchą tego, co przepięte). Każdy krok = commit kodu i specyfikacji, bramka z testami i zrzutami
  i decyzją człowieka (`bramki.jsonl`), stan w `stan.json`, HTML z rysunkiem workflow. Bada hipotezę, że
  rozwiązanie da się wpiąć z takim samym zachowaniem — nie wdraża. Wywołuj, gdy ktoś chce „wpiąć archetyp / nowy
  model obok legacy”, „parallel models”, „przełączać stary i nowy model”. Nie do jednego kroku bez dyrygenta —
  użyj swappable-dsl albo parallel-model-router.
argument-hint: "Źródło: <sekcja „## Pogłębienie: <archetyp>” z analiza/archetypy.md albo opis rozwiązania + lista miejsc>. Obszar: <w języku CO>. [Tryb: bez pytań]"
---

# parallel-models — nowe rozwiązanie obok starego, za jednym API, przełączane w działaniu

Hipoteza do zbadania: **nowe rozwiązanie da się wpiąć w kilka miejsc kodu tak, że system zachowuje się tak samo.**
Workflow **bada hipotezę wpięcia, nie wdraża**: nie kończy się działającą aplikacją w dwóch trybach. Dowód:
- scenariusze zielone na obu modelach i test zgodności;
- nagrane okienka (ekrany) prowadzące do przepiętych miejsc, te same przypadki z seedu na obu modelach;
- przełączenie wajchą w działaniu **tylko tego, co przepięte** — reszta systemu zostaje na starym modelu; katalog
  różnic bez różnic dla seedu.

Różnice dla danych spoza seedu (dane, których nowe rozwiązanie nie ma) nie obalają hipotezy: to jej wynik —
„Wymaga migracji danych” w specyfikacji (które pytania i dane odpowiadają inaczej, co zmieniło się w systemie po
przełączeniu). Migracja danych to osobny etap, poza workflow.

Aplikację uruchamiasz wyłącznie po to, żeby nagrać te okienka.

Workflow prowadzi hipotezę od źródła do przełączenia wajchą przepiętych miejsc. Kroki opisuje `workflow.json` (po co, wejście, wyjście, może,
nie może, bramka, stop); jak zrobić krok — sekcja kroku w `../swappable-dsl/SKILL.md` i
`../parallel-model-router/SKILL.md` (czytasz je jako pliki, sekcja po sekcji).

```
źródło rozwiązania ─▶ swappable-dsl: 1 specyfikacja ▶ 2 miejsca ▶ 3 scenariusze+legacy 👤 ▶ 4 nowy model 👤
                                     ▶ 5 wpięcie+seeder 👤 ▶ 6 okienka 👤
                   ─▶ parallel-model-router: 1 flaga 👤 ▶ 2 router 👤 ▶ 3 ekran wajchy 👤 ▶ 4 zgodność 👤 ▶ 5 przełączenie przepiętych 👤
```

## Wejście (kontrakt)
1. **Opis nowego rozwiązania**: czym jest, z czego się składa, na jakie pytania odpowiada; opcjonalnie implementacja
   referencyjna i decyzje, po których odpowiada inaczej niż dziś.
2. **Miejsca w kodzie**, w które ma wejść: wołający `plik:linia`, o co pyta (CO), jak kod odpowiada dziś (JAK).
3. Repo systemu (build, testy, uruchomienie aplikacji).

W szkoleniu to jest sekcja `## Pogłębienie: <archetyp>` w `analiza/archetypy.md` (tabela „Co i jak”: CO | JAK STARE
z `plik:linia` | JAK W ARCHETYPIE, podsekcje „Bolączki z adresami w kodzie” i „Implementacja referencyjna”) oraz
`analiza/<wyspa>/crossing.json` i `purpose-structure-map.html` z poprzedniego zadania. Sekcja pogłębienia kończy się
na następnym nagłówku `## ` albo na końcu pliku (podsekcje `###` należą do niej). Brakuje 1 albo 2 — zapytaj.

## Specyfikacja — wspólny artefakt w gicie
`specyfikacje/<obszar>/` w repo systemu (śledzony katalog, nie `analiza/`). `<obszar>` nazywasz w języku CO (np.
`akceptacja-kart`), nie nazwą wyspy z analizy ani mechanizmu legacy (np. nie `drzewo-grup`: trafiłoby w słownik
zakazany); katalog analizy wyspy zapisujesz w `stan.json` (`wyspa`, np. `analiza/drzewo-grup`). Gdy człowiek nie
podał obszaru — zaproponuj.
- `specyfikacja.md` — z `specyfikacja-szablon.md`; sama treść: sekcje kroków (oznaczone `<!-- krok: … -->`) i odstępstwa;
- `stan.json` — z `stan-szablon.json`; stan przebiegu: wyspa, gałęzie, ostatnia bramka (`krok`), baza, wersja skilli (`skille`, wpisuje bramka), moduł nowego rozwiązania, komendy testów, przełącznik, uruchomienie,
  front, słownik zakazany maszynowo (`zakazane`, `slownik_pliki`). Pole puste (`""`, `[]`) = jeszcze nieuzupełnione;
  co znaczy pole — `_opis`. Mały, czytany na starcie każdego kroku — nie wczytujesz po to całej specyfikacji;
- `bramki.jsonl` — dziennik bramek, linia na zdarzenie: testy (`typ: testy`, wynik), grep słownika (`typ: slownik`),
  porównanie odpowiedzi (`typ: porownanie`), katalog różnic routera (`typ: roznice`, seed / poza seedem) i decyzje człowieka (`typ: czlowiek`, decyzja, uwagi). Tylko dopisuje go `bramka.mjs`;
- `zrodlo.md` — źródło dosłownie (np. sekcja pogłębienia), nigdy nie zmieniane;
- `miejsca.md` — kontrakt miejsc z `miejsca-szablon.md`; **od kroku 3 workflow pracuje tylko na nim**;
- `specyfikacja.html` — widok z klikalnym rysunkiem (buduje go `scripts/specyfikacja.mjs`, robi to też bramka);
- `ekran/` — zrzuty, filmy, odpowiedzi API (zakładasz w pierwszym kroku, który coś do niego zapisuje). Filmy zostają
  lokalnie (`ekran/.gitignore`), w gicie PNG i odpowiedzi.

## Tryb bez pytań
Prompt zawiera „Tryb: bez pytań” → nie zadajesz żadnego pytania (AskUserQuestion) od początku do końca: gałąź
`parallel-models/<obszar>-<nick>` (nick: „Nick:” z promptu, inaczej login z `gh`, inaczej `git user.name` w kebab-case —
małe litery, bez polskich znaków, spacje na `-`), przy każdej bramce 👤 rekomendacja i zapis `--decyzja "wybór automatyczny: <opcja>"
--uwagi "<dlaczego>" --kto auto` (człowiek przegląda je potem w `bramki.jsonl` i w `specyfikacja.html`). Zmiany
zachowania w kroku 4: „nierozstrzygnięte — zostaje dzisiejsze”. `test-convention-reviewer` nie uruchamiasz. Reszta
protokołu bez zmian (testy, stop, commity).

## Gałąź — cały przebieg na jednej, własnej
Na starcie (przed krokiem 1), w repo systemu z czystym drzewem: zapytaj człowieka o nazwę gałęzi i zaproponuj
`parallel-models/<obszar>-<nick>` (nick jak w „Tryb bez pytań”). `git switch -c <gałąź>`; nazwę zapisz w `stan.json`
(`galaz`, także `galaz_startowa` = gałąź, z której wychodzisz — dowolna, nie musi być `master`, byle drzewo było
czyste — i `baza` = commit startowy). Wszystkie commity workflow idą na tę gałąź; na `master`/`main` nie
commitujesz nic. Wznowienie: `git switch <galaz>` ze `stan.json`. Brudne drzewo na starcie — pokaż `git status`
i zapytaj, nie stashuj sam.

**Push (opcjonalny, tylko na wyraźne „wypchnij”).** Tylko gałąź przebiegu, nigdy `master`/`main`, bez `--force`.
`gh` zalogowany → `git push -u origin <galaz>`. Bez `gh`, z tokenem od prowadzącego w zmiennej `GITHUB_TOKEN`
(nigdy w pliku, w URL-u remote'a ani w specyfikacji):
`git -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo "password=$GITHUB_TOKEN"; }; f' push -u origin <galaz>`.
Bez pusha wszystko jest lokalnie: `specyfikacja.html` otwierasz z dysku, commity w `git log`.

## Protokół kroku (każdy krok tak samo)
1. Przeczytaj `stan.json`, krok w `workflow.json` i jego sekcję w SKILL.md skilla; ze specyfikacji czytasz tylko sekcje
   z wejścia kroku. Trzymaj się „może / nie może”.
   Człowiek może zmienić specyfikację sam (okno „Specyfikacja” w `specyfikacja.html` albo edytor): sprawdź
   `git diff specyfikacje/<obszar>/` — jego zmiany są wiążące; zapisz je w bramkach (`--decyzja "edycja specyfikacji"`).
2. Zrób krok. Do specyfikacji dopisuj tylko sekcje swojego kroku: sekcję podmieniasz w miejscu jej placeholdera
   (nagłówek zostaje jeden, drugiego nie dopisujesz); każdy zmieniony plik legacy dostaje wiersz
   w „Odstępstwa” (krok, plik, co, powód: test / wpięcie / wajcha / ekran / build).
3. **Część deterministyczna bramki** (skrypt, pokazowo):
   `node "<ten skill>/scripts/bramka.mjs" "$(pwd)/specyfikacje/<obszar>" <id kroku> --testy krok|pelne|oba [--front tak] [--env KLUCZ=wartość] [--opis "…"]`
   — ustawia `krok` w `stan.json`, uruchamia testy z `stan.json` (przed każdą komendą wypisuje „<etykieta>: start…”),
   greppuje słownik zakazany (`zakazane` po `slownik_pliki`; trafienie = czerwone), dopisuje wyniki do `bramki.jsonl`, wypisuje **ZMIENIONE w legacy** (cała gałąź
   od `baza`, ★ = ten krok), **SPECYFIKACJA** (pliki dodane w kroku) i **DODANE**, przebudowuje HTML. Przy `--testy oba`
   etykieta z `--opis` dostaje dopisek „— krok” / „— pełne”, testy frontu (`--front tak`) — „— front”. Zdublowany
   nagłówek `## ` w `specyfikacja.md` bramka wypisuje jako ostrzeżenie. Router.5: `--roznice "<katalog różnic>"
   --seed "<seed-identyfikatory.txt>"` — czerwone tylko przy różnicach dla seedu. Zrzuty i filmy: `../swappable-dsl/examples/front-story.mjs` do `ekran/`.
   Krok z `testy: null` w `workflow.json`: `bramka.mjs specyfikacje/<obszar> <id kroku> [--opis "…"]` bez `--testy`
   (wpis „krok bez testów”; słownik i HTML jak zwykle).
   Czerwone testy albo trafienia słownika → naprawiasz (limit z kroku), bramki człowieka nie otwierasz.
4. **Bramka człowieka** (👤 w `workflow.json`): AskUserQuestion. W pytaniu: co krok zrobił (2–3 zdania), ZMIENIONE
   w legacy — każdy plik z powodem i jednym zdaniem dlaczego, DODANE — sama lista, wynik testów, ścieżka do
   `specyfikacja.html`, a dla kroku z decyzją (np. flaga) — opcje z rekomendacją. Opcje: Akceptuję / Poprawki /
   Stop (z wyborem w jednej linii: „Akceptuję: A, sama wajcha”). Zapis: `bramka.mjs specyfikacje/<obszar> <id kroku> --decyzja "<wybór>" --uwagi "<co powiedział>"`.
   Skrypt zapisuje, kto zdecydował: osoba pracująca w tej sesji Claude (login GitHub z `gh` na jej maszynie,
   inaczej `git user.name`); gdy przy terminalu decyduje ktoś inny, podaj `--kto <nick>`. Poprawki → poprawiasz i wracasz do punktu 3. Bez człowieka (agent, przebieg testowy): rekomendacja, decyzja „wybór automatyczny: <opcja>” i `--kto auto`.
5. **Commit**: `git add -A` (kod i specyfikacja razem),
   `git commit -m "parallel-models(<obszar>): <id kroku> <nazwa kroku>"` (bez stopek; autor = człowiek z sesji). Na gałęzi przebiegu; push tylko według „Gałąź”.
6. Następny krok. Wznowienie: `krok` w `stan.json` to ostatnia bramka (nie musi być zamknięta); krok zamknięty =
   commit `parallel-models(<obszar>): <id kroku>` w `git log --grep "parallel-models(<obszar>)"`. Wznawiasz od
   pierwszego kroku bez takiego commitu.

## Zasady wspólne
- **Dopisujemy.** Legacy zmieniamy tylko z powodów z listy odstępstw; nie poprawiamy przy okazji stylu, nazw,
  wyjątków ani testów legacy. Kontrola: lista ZMIENIONE z bramki.
- **Tylko pytania (odczyty).** Komend w nowym rozwiązaniu nie robimy — wprost w specyfikacji i w `router`.
- **Stare zachowanie.** Nowe rozwiązanie odpowiada tak samo jak stary model. Gdzie źródło mówi inaczej („umowy się
  sumują”), człowiek w kroku 4 potwierdza, czy dzisiejsze zachowanie to błąd; decyzja idzie do `bramki.jsonl`, a do
  wpięcia i tak budujemy stare zachowanie. Bez człowieka: „nierozstrzygnięte — zostaje dzisiejsze”.
- **Limit oporu** na miejsce: scenariusze i sterownik legacy (krok 3) — 2 podejścia, nowe rozwiązanie (krok 4) — 5 podejść, wpięcie (krok 5) — 3; potem `nieudane` w `miejsca.md` i w „Nieudane miejsca” (czego brakuje:
  w źródle czy w implementacji). Mniej niż 3 udane miejsca — stop całości.
- **Uniwersalność.** Skille nie mówią językiem problemu; konkret (stary model, nowe rozwiązanie, słowniki) jest
  w specyfikacji. Inny stos niż Java: `../_shared/stos-odpowiedniki.md`. Nowy kod i testy:
  `../_shared/konwencje-nowego-kodu.md` (tylko nowe pliki).
- **Lokalnie.** Bez pusha (poza „Gałąź”), bez `install`/publikacji artefaktów; aplikację uruchamiasz na osobnej bazie i wolnym
  porcie, PID zapisujesz przy starcie w `pid_dir` ze `stan.json` (np. `target/pids/app.pid`) i zatrzymujesz po kroku
  po PID z tego katalogu (nie `pkill -f` — trafiłby cudze procesy).
- **Komendy w powłoce**: ścieżki absolutne (`"$(pwd)/…"`), każdy argument w cudzysłowie; nie polegasz na dzieleniu
  słów (zsh nie dzieli `$ZMIENNEJ` ze spacjami — komendę z argumentami w zmiennej uruchamiasz przez `bash -c`).

- **Front jest opcjonalny.** Kroki „okienka” (swappable-dsl 6), „wajcha” i „przełączenie” (router 3, 5) robisz na
  froncie, gdy aplikacja go ma; bez frontu te same pytania i przełączenie wajchy idą przez API (curl,
  `front-compare.mjs`), a wyniki do `ekran/` jako odpowiedzi. Nie da się uruchomić aplikacji — zostają testy, zapisz to.

## Czego nie robisz
- Nie przeskakujesz bramki i nie commitujesz czerwonych testów.
- Nie zmieniasz `zrodlo.md`; po kroku 2 nie wracasz do kandydatów ani do crossingu.
- Nie mieszasz kroków: krok, który pisze testy DSL, nie pisze nowego rozwiązania; router nie zmienia żadnego modelu.
- Nie pushujesz bez wyraźnego „wypchnij”; nigdy nie commitujesz na `master`/`main`.

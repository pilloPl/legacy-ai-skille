---
disable-model-invocation: true
name: data-migration
description: Migracja danych ze starego modelu do nowego, który już stoi obok starego i odpowiada w kilku przepiętych miejscach (np. po parallel-models). Przenosi tylko to, czego potrzebują przepięte miejsca. Jedno uruchomienie, lejek kod → dane → translator → różnice w aplikacji → kontrola niezależna. Człowiek decyduje tylko na starcie (filtr: jaka porcja danych; skill proponuje filtry z liczbami na podstawie podanych źródeł). Mapowanie ustala skill: każda decyzja ma źródło plik:linia, dowód w danych (zapytanie z wynikiem), pewność i status, a człowiek czyta je w migracja.html. Może wczytać plik z decyzjami wcześniejszego mapowania i wziąć je za punkt wyjścia. Ma tryb szkoleniowy (kilkanaście minut do pierwszego wyniku). Wywołuj, gdy ktoś chce „przenieść dane do nowego modelu”, „zmigrować dane”, „migracja danych”, „zasilić nowy model starymi danymi”.
argument-hint: "Specyfikacja: <katalog specyfikacji wpięcia>. [Filtr: <np. jeden rynek>] [Decyzje: <plik z wcześniejszymi decyzjami>] [Tryb: szkolenie] [Baza: <komenda SQL>]"
---

# data-migration — dane starego modelu w nowym

Nowy model stoi już obok starego i odpowiada w kilku **przepiętych miejscach** (np. po `parallel-models`: port,
adapter starego i nowego modelu, router z porównaniem odpowiedzi). Nowy model zna jednak tylko dane z seedu. Ten
skill przenosi do niego dane starego modelu, **tylko te, o które pytają przepięte miejsca**, i dowodzi, że po
przeniesieniu oba modele odpowiadają tak samo albo różnią się świadomie.

Zasady:
- **Pierwsze pytanie brzmi „co jest jednostką?”, a nie „jakie są tabele?”.** Pojęcie, które widzi użytkownik,
  często nie ma własnej tabeli: bywa kombinacją kolumn, poziomem w drzewie albo częścią nazwy.
- **Model docelowy jest gotowy.** Tłumaczymy na niego dane, nie projektujemy go pod dane. Gdzie nowy model jest
  uboższy, kompromis zapisujemy jako decyzję z rozważonymi wariantami.
- **Danych wolno nie przenieść, reguł nowego modelu nie luzujemy.** Wiersz, który łamie regułę nowego modelu, zostaje
  w starym, policzony z powodem w raporcie.
- **Pewność rośnie tylko z dowodem.** Hipoteza z kodu ma najwyżej 89%; więcej tylko z zapytaniem do danych.
- **Najmocniejsza kontrola nie korzysta z kodu migracji.** Oczekiwany wynik liczymy prosto ze starych danych.
- **Kod translatora jest mało ciekawy.** Pisz go szybko; wartość jest w decyzjach, dowodach i liczbach.
- **Człowiek decyduje raz, na starcie: filtr.** Dalej skill sam ustala mapowanie i nie pyta. Człowiek czyta decyzje
  w `migracja.html`; jeśli się z czymś nie zgadza, uruchamia skill ponownie z `Decyzje: <plik>` i swoją uwagą.

```
źródło ─▶ filtr 👤 ─▶ kod ─▶ dane ─▶ mapowanie ─▶ translator ─▶ różnice ⟲ ─▶ kontrola ─▶ migracja.html
```

Skrypty (Node 22, bez paczek): `<ten skill>/scripts/`. Uruchamiasz je **z korzenia repo**.

## Wejście (z promptu)
- `Specyfikacja:` — specyfikacja wpięcia nowego modelu: przepięte miejsca (o co pytają, jak odpowiada stary model,
  `plik:linia`), opis nowego modelu, decyzje z wpięcia. Po `parallel-models`: `specyfikacje/<obszar>/`
  (`miejsca.md`, `specyfikacja.md`). **Wymagane** — bez niej zapytaj; nie zgaduj przepiętych miejsc z kodu.
- `Filtr:` — jaka porcja danych (np. „rynek HR”). Jest → nie pytasz o nic. Brak → zaproponujesz (etap 1).
- `Decyzje:` — plik z decyzjami wcześniejszego mapowania (`decyzje.json` poprzedniego przebiegu albo lista
  decyzji). Wczytujesz go na starcie; to punkt wyjścia, nie wynik.
- `Tryb: szkolenie` — limity niżej.
- `Baza:` — komenda, która czyta jedno zapytanie SQL ze stdin (np. `docker compose exec -T postgres psql -U … <baza>
  -A -F "|" -P footer=off`). Brak → ustal z konfiguracji repo (compose, `application*.yml`) i sprawdź `select 1`.
Dodatkowo potrzebne: moduł nowego modelu (z kodu specyfikacji) i aplikacja uruchamialna lokalnie z przełącznikiem
modeli i porównaniem odpowiedzi (router). Bez routera różnice robisz, pytając aplikację raz na starym, raz na nowym
modelu, i porównując pliki odpowiedzi.

## Folder migracji
`migracje/<obszar>/` w repo systemu (`<obszar>` = nazwa katalogu specyfikacji). Bez pliku stanu: to, co zrobione,
widać po plikach.
- `migracja.md` — `# tytuł`, linia `SQL: \`<komenda>\``, `Filtr: …`, sekcje `## Zakres`, `## Słownik dwóch języków`,
  `## Translator`, `## Kontrola`, `## Notatki`. Zakłada go `zrodlo.mjs`;
- `zrodlo/` — kopie wejścia ze spisem `README.md`; potem czytasz **tylko** to źródło, kod i bazę;
- `decyzje.json` — log decyzji (tylko przez `decyzja.mjs` i `sql.mjs`);
- `problemy.json` — problemy (tylko przez `problem.mjs`);
- `raport-przeniesienia.json` — `{ "przeniesione": {"<rodzaj>": n}, "pominiete": [{"powod", "ile", "decyzja", "przyklady": []}], "uwagi" }`;
- `roznice/` — `pytania.json` (config `pytaj.mjs`), `requests.json`, odpowiedzi `*.jsonl`, `aplikacja/` (plik różnic
  aplikacji), `grupy-<n>.json`;
- `kontrola/` — zapytanie kontrolne, `oczekiwane.jsonl`, `nowy.jsonl`;
- `liczby.jsonl` — rundy: przed przeniesieniem, po, kontrola (tylko przez `roznice.mjs` i `kontrola.mjs`);
- `migracja.html` — widok tylko do czytania: liczby, lejek, decyzje z dowodami, problemy, raport, rundy, pliki.
  Przebudowuje go każdy skrypt; ręcznie: `node widok.mjs migracje/<obszar>`.

Na starcie, w repo z czystym drzewem, na gałęzi z wynikiem wpięcia: `git switch -c migracja/<obszar>`. Na końcu
**jeden commit** `migracja(<obszar>): <filtr>` (kod translatora i folder migracji). Bez pusha.

## 0. Źródło
Złóż jeden folder z tego, co wiadomo o nowym modelu i o bolączkach starego — kopie bez zmian, w kolejności czytania:
```bash
node <skill>/scripts/zrodlo.mjs migracje/<obszar> --tytul "<tytuł>" --sql "<komenda czytająca SQL ze stdin>" \
  "<specyfikacja>/miejsca.md=przepięte miejsca: o co pytają, jak odpowiada stary model" \
  "<specyfikacja>/specyfikacja.md=nowe rozwiązanie, słowniki, decyzje i odstępstwa z wpięcia" \
  "<moduł nowego modelu>/CLAUDE.md=czym jest nowy model, czego nie mówi" \
  "<moduł nowego modelu>/src/main=kod nowego modelu" \
  "<pakiet portu: adaptery starego i nowego modelu, świat, seeder>=jak miejsca pytają oba modele, API zakładania faktów" \
  "<pliki reguły starego modelu z „jak odpowiada” w miejsca.md>=reguła starego modelu (kod i SQL)" \
  "<plik z bolączkami>#Co i jak=mapowanie pytań na nowy model"
```
Co się przydaje (przebiegi porównawcze): miejsca, specyfikacja wpięcia, nowy model z adapterami, światem
i seederem, kod reguły starego modelu, tabela „Co i jak”. Bez specyfikacji i „Co i jak” migrator zgaduje znaczenie
biznesowe (co jest regionem, a co kempingiem). Pełne bolączki, drzewo pytań i migracje schematu prawie się nie
przydają (schemat szybciej z `information_schema`). Ponowne uruchomienie podmienia tylko `zrodlo/`.
Prompt ma `Decyzje: <plik>` → `node <skill>/scripts/decyzja.mjs migracje/<obszar> wczytaj <plik>`: decyzje wchodzą
jako hipotezy (pewność ≤ 89, status `hipoteza`), bo były sprawdzone na innych danych. Sprawdzasz je jak własne.

## 1. Zakres i filtr 👤
Przeczytaj README źródła, `miejsca.md`, opis nowego modelu i bolączki. Do `migracja.md` → `## Zakres`:
- **fakty nowego modelu × przepięte miejsca** — tabela: miejsce | pytanie (CO) | jakie fakty nowy model musi znać |
  przez które API nowego modelu je zakłada;
- **jednostki** — co w starym modelu jest każdą z nich (kilka kandydatów o różnych skutkach — wypisz);
- **cel trwały** — translator przy starcie aplikacji (nowy model w pamięci, czyta stare tabele) albo tabele nowego
  modelu (migracja schematu, przeniesienie w transakcji). Wybierasz sam, z powodem (decyzja, `bez-zapytania`).
**Filtr.** Policz (`sql.mjs`, tylko `count(*)` i rozkłady) 2–3 kandydatów na porcję, np. jeden rynek, jeden region,
całość. Przy każdym: ile wierszy, ile przypadków z nietypowych układów, które powiązania przechodzą przez granicę
porcji (np. wydawcy z innego rynku z umowami z kempingami porcji — wtedy porcja to cała struktura + instancje porcji).
Prompt ma `Filtr:` → bierzesz go (sprawdź, że zapytanie go wybiera). Brak → **jedno** AskUserQuestion: kandydaci
z liczbami, rekomendacja pierwsza. To jedyne pytanie w całym przebiegu. Filtr wpisz w `migracja.md` (`Filtr: …`)
i jako decyzję z zapytaniem (`sql.mjs … --decyzja D0x --cel "ile w porcji"`).
Decyzje zakresu: po jednej na jednostkę, cel trwały i filtr (`decyzja.mjs nowa`, `"etap":"zakres"`).

## 2. Kod
Dla każdego faktu z zakresu: skąd stary model go bierze — tabele, kolumny, reguły, `plik:linia` (zacznij od
„jak odpowiada stary model” w `miejsca.md`). Do `## Słownik dwóch języków`: tabela stara tabela/kolumna | znaczenie |
fakt nowego modelu albo „poza (dlaczego)” | `plik:linia`. Każde założenie mapowania to decyzja `hipoteza`,
pewność ≤ 89, `podstawa: "kod"`. Szczególnie: reguły, które stary model liczy w locie (dziedziczenie, „najbliższy
wygrywa”, zastępowanie zamiast sumowania), bo nowy model może je liczyć inaczej. Reguła powielona (np. w kodzie
i w SQL) — zapisz obie: druga to gotowa kontrola niezależna. Decyzje wczytane z pliku: dopisz `plik:linia`, jeśli
kod się zmienił — nowa decyzja, a wczytana `zastąpiona`.

## 3. Dane
Każdą hipotezę sprawdź zapytaniem (tylko SELECT):
```bash
node <skill>/scripts/sql.mjs migracje/<obszar> "select …" --decyzja D03[,D07] --cel "czy każdy X ma Y"
node <skill>/scripts/decyzja.mjs migracje/<obszar> status D03 przyjęta --pewnosc 92 --uwagi "dane: …"
node <skill>/scripts/decyzja.mjs migracje/<obszar> dowod D08 --z D03        # ten sam dowód w innej decyzji
```
Nowa decyzja z danymi od razu (pewność > 89): pole `"zapytania":[{"sql","cel","wynik"}]` albo `"dowod_z":"D03"`.
Skrypt odmawia pewności > 89 bez zapytania — sprawdź kod wyjścia, zanim wołasz następny.
- Najpierw **kształt wartości** (rozkład długości, prefiksy, null, duplikaty), potem reguła.
- Szukaj układów, których nowy model nie wyrazi wprost: głębokość hierarchii większa niż w nowym modelu, element
  przypięty „w złym miejscu”, ten sam identyfikator dwa razy, rekord bez rodzica, nazwy różne tylko wielkością liter,
  rekordy skasowane, ale używane. Każdy taki układ → `problem.mjs nowy` (`rodzaj: "układ"`, liczność, kilka
  identyfikatorów).
- Obalona hipoteza → `status … odrzucona` z uwagą i nowa decyzja (nie kasujesz starej). Wczytana decyzja, którą
  dane potwierdzają → `przyjęta` z zapytaniem; którą obalają → `zastąpiona --zastepuje-ja <nowa>`.
- Wynik do decyzji tylko zagregowany (liczności, rozkłady, kilka identyfikatorów), bez danych osobowych.

## 4. Mapowanie
Dla każdego problemu „układ” i każdej reguły liczonej inaczej: **decyzja skilla** z rozważonymi wariantami
(`"warianty": [{"wariant","skutek"}]`) i powodem wyboru. Nie pytasz człowieka; wybierasz wariant, który zachowuje
odpowiedzi przepiętych miejsc i nie zmienia nowego modelu. Typowe:
- spłaszczenie (np. przynależność rozpisana na każdy poziom) vs pominięcie vs zmiana nowego modelu (poza migracją —
  wtedy problem zostaje `otwarty` z opisem, czego brakuje w modelu);
- kolejność rozstrzygania tożsamości (ten sam rekord wskazuje dwie kartoteki);
- **trwała mapa identyfikatorów** stary klucz → identyfikator w nowym modelu (odpowiedzi, które zwracają
  identyfikatory, muszą się zgadzać);
- co pomijamy i z jakim powodem (skasowane, sprzeczne z regułą nowego modelu).
Problem dostaje wyjaśnienie: `problem.mjs … wyjasnij P04 --decyzja D11`.
**Runda przed** (zanim wepniesz translator): aplikacja na samym seedzie, wajcha na nowy model + porównanie, pytania
z etapu 6 (zbuduj je teraz), potem `roznice.mjs … --runda przed --liczby "…"`. To punkt odniesienia — „nie znam”
przed, zero po.

## 5. Translator
Czysta funkcja: odczyt starych danych (filtr) → polecenia nowego modelu (te same, których używa seeder świata
nowego modelu). Wpięcie według celu trwałego:
- **przy starcie**: komponent, który zasila nowy model ze starych tabel w jednej transakcji tylko do odczytu. Jeśli
  seeder świata zakłada te same dane w obu modelach (seed już leży w starej bazie), translator go **zastępuje**
  (osobny profil uruchomienia), a nie idzie po nim — inaczej nowy model dostanie te same podmioty dwa razy;
- **tabele**: migracja schematu + przeniesienie w transakcji.
Translator zlicza przeniesione i pominięte (powód + decyzja + 3 przykłady) i zapisuje `raport-przeniesienia.json`.
Jeden test translatora na małej porcji (stary stan → odpowiedzi nowego modelu), zielony przed dalszym etapem. Nie
zmieniasz nowego modelu ani starego (poza wpięciem translatora). Aplikację uruchamiasz na osobnej bazie i wolnym
porcie, **z katalogiem pliku różnic w `migracje/<obszar>/roznice/aplikacja`**, PID zapisujesz i zatrzymujesz po PID.
Komendę uruchomienia i testu zapisz w `## Translator`.

## 6. Różnice ⟲
1. Pytania tylko przepiętych miejsc, w filtrze: zbuduj `roznice/requests.json` zapytaniem (`sql.mjs … --zapisz`):
   przypadki zwykłe (próbka) i **wszystkie** przypadki z problemów „układ” (przy dużych do 10 na problem). Użytkownik,
   który pyta, musi mieć zakres obejmujący dane (systemy z uprawnieniami per obszar: kilka loginów w `pytania.json`);
   sprawdź, który login widzi które dane, zanim zbudujesz próbkę. Pytanie, którego nie da się zadać żadnym loginem
   albo którego wejście zmienia dane → problem `niedostępne`, `problem.mjs … wyjasnij P10 --do-kontroli`.
2. Po przeniesieniu: `node <skill>/scripts/pytaj.mjs roznice/pytania.json roznice/odpowiedzi-<n>.jsonl --ustaw <wajcha>=<nowy> --ustaw <porównanie>=true`.
   Skrypt podaje czas na pytanie; powyżej ~0,5 s zmniejsz próbkę.
3. Liczby z aplikacji (zgodne / różne / nie znam — ekran albo endpoint wajchy) i grupy:
   `node <skill>/scripts/roznice.mjs migracje/<obszar> --runda po --od "<czas startu pytań w UTC, z Z>" --liczby "zgodne=…,rozne=…,nieznam=…"`.
4. Każda grupa → `problem.mjs nowy` (`rodzaj: "różnica" | "nie znam"`, `ile`) i wyjaśnienie: poprawka translatora
   (wracasz do 5, kolejna runda `--runda po-2`, potem `problem.mjs … ile P07 0`), decyzja (świadoma różnica) albo
   otwarty.
Wolne pytania po przeniesieniu (dużo wolniej niż w rundzie przed) to wynik: nowy model nie wytrzymuje skali danych —
problem `różnica` z czasem na pytanie przed i po. Pętla 5 ↔ 6: najwyżej 3 obroty (szkolenie: 2).

## 7. Kontrola
Oczekiwaną odpowiedź na pytania z etapu 6 policz **wprost ze starych tabel** jednym zapytaniem (bez translatora,
bez klas aplikacji; reguła powielona w SQL starego systemu to dobry punkt wyjścia), zapisz jako
`kontrola/oczekiwane.jsonl` (`{"name","answer"}`, ta sama nazwa i kształt co w `pytaj.mjs`), odpowiedzi nowego
modelu jako `kontrola/nowy.jsonl`. **Odpowiedzi nowego modelu** bierzesz z portu przepiętych miejsc (np. mały runner
testowy, który woła adapter nowego modelu), nie z HTTP: odpowiedź ekranu bywa przefiltrowana innymi regułami.
Pytania `niedostępne` z etapu 6 sprawdzasz tutaj.
`node <skill>/scripts/kontrola.mjs migracje/<obszar> kontrola/oczekiwane.jsonl kontrola/nowy.jsonl [--wyjasnione "<regex nazwy>=D14"]`
— różnice świadome (np. poza filtrem) oznaczasz decyzją; pozostałe → problem `kontrola`. Problemy „do kontroli”
dostają tu właściwe wyjaśnienie (`wyjasnij … --decyzja`).
W `## Kontrola`: kontrola znaczenia — co może być zgodne liczbowo, a źle sklasyfikowane (np. dwie rzeczy zlane
w jedną), i czym to sprawdzić. Taką decyzję zostawiasz `przyjęta`, ale z uwagą „znaczenie do sprawdzenia: …”.

## 8. Domknięcie
Każda decyzja ma status końcowy: `przyjęta` (z dowodem), `odrzucona` albo `zastąpiona`. Hipoteza, której nie
rozstrzygniesz, nie zostaje: odrzucasz ją z uwagą, czego zabrakło, i zakładasz problem `otwarty`.
`node <skill>/scripts/sprawdz.mjs migracje/<obszar>` — wszystko ✓, potem commit. Na koniec: ścieżka do
`migracja.html`, liczby (przed → po, kontrola), decyzje z pewnością < 90 i decyzje z uwagą o znaczeniu — to
człowiek ma przeczytać najpierw. Jeśli się nie zgadza: ponowne uruchomienie z `Decyzje: migracje/<obszar>/decyzje.json`
i jego uwagą w prompcie.

## Tryb szkoleniowy
Prompt zawiera „Tryb: szkolenie” → kilkanaście minut do pierwszego wyniku:
- filtr: jedna mała porcja, ale z problemami (np. jeden rynek); cel trwały „przy starcie” (szybciej);
- kod: tylko to, co wskazuje `miejsca.md` i jedno piętro w głąb; dane: najwyżej 12 zapytań; pytania w etapie 6:
  próbka do 50 (z czego najwyżej 10 pytań o listy, bo są wolne) + przypadki z problemów; kontrola na tych samych
  pytaniach; pętla 5 ↔ 6 najwyżej 2 obroty; bez pełnej regresji;
- **pierwszy wynik** = liczby rundy przed i po przeniesieniu — cel: do 15 minut od startu.

## Czego nie robisz
- Nie pytasz człowieka poza filtrem na starcie.
- Nie przenosisz danych, o które nie pyta żadne przepięte miejsce; nie pytasz aplikacji o miejsca nieprzepięte.
- Nie zmieniasz reguł nowego modelu, żeby dane przeszły, i nie łatasz danych w bazie.
- Nie podnosisz pewności bez zapytania; nie kasujesz decyzji (zmieniasz status).
- Nie commitujesz na `master`/`main`, nie pushujesz.

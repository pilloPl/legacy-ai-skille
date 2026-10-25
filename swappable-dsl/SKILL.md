---
disable-model-invocation: true
name: swappable-dsl
description: Kroki 1–6 workflow `parallel-models` — nowe rozwiązanie (np. archetyp Party) obok starego modelu za jednym podmienialnym API w języku CO. Specyfikacja ze źródła, wybór ≥3 miejsc łatwych do wpięcia do osobnego kontraktu, port i DSL testów czasownikami CO (bez słów mechanizmu legacy), scenariusze czterowarstwowe (Farley; lekcja 008 „Domain Drivers z AI”) zielone na starym modelu, nowe rozwiązanie jako osobny moduł ze starym zachowaniem (te same scenariusze), wpięcie z przełącznikiem startowym i modułem seedera, porównanie na ekranie albo w API. Dopisuje kod, legacy zmienia tylko w odstępstwach. Uruchamiany przez `/parallel-models`; ten plik to opis kroków.
argument-hint: "(przez /parallel-models)"
---

# swappable-dsl — nowe rozwiązanie obok starego, jedno API w języku CO

Stary kod już odpowiada na pytania z wybranych miejsc. Język **CO** (o co pyta wołający, w języku problemu) staje się
**jednym API** (portem). Stary model i nowe rozwiązanie to dwa języki **JAK** pod tym API. Te same scenariusze
idą przez oba i oba mają być zielone: to jest dowód hipotezy, że da się wpiąć z takim samym zachowaniem.

Kroki uruchamia `../parallel-models/SKILL.md` (protokół kroku: specyfikacja, bramka, commit). Tu jest, **jak** zrobić
krok. Przypadki szczególne: `szczegoly.md`, sekcja kroku. Model warstw: `../four-layer-test-architecture/SKILL.md`.
Konwencje nowych plików: `../_shared/konwencje-nowego-kodu.md`. Inny stos: `../_shared/stos-odpowiedniki.md`.

Nazwy: `<Port>` (pytanie CO, np. `CardAcceptance`), `<Obszar>` (np. `Acceptance`), `<Wołający>`, `<Rozwiązanie>`.

## 1. Przygotowanie specyfikacji
- Załóż `specyfikacje/<obszar>/` z `../parallel-models/specyfikacja-szablon.md` i `stan.json` z
  `../parallel-models/stan-szablon.json`; źródło skopiuj dosłownie do `zrodlo.md` (sekcja pogłębienia: od nagłówka do
  następnego `## ` albo do końca pliku). W `stan.json`: `galaz` (już
  założona, sekcja „Gałąź” w `../parallel-models/SKILL.md`), `galaz_startowa`, `wyspa` (katalog analizy wyspy),
  `baza` = HEAD przed pierwszym commitem workflow, `testy_pelne`
  z builda projektu (bez trybu cichego — bramka liczy testy z wyjścia; Maven z `-fae`, żeby jedna bramka pokazała
  czerwone ze wszystkich modułów); `testy_krok` uzupełnia krok 3. Pól późniejszych kroków nie ruszasz (zostają `""`).
- Wypełnij sekcje kroku 1 ze źródła: stary model (mechanizm JAK, pakiety), nowe rozwiązanie (elementy, pytania,
  implementacja referencyjna), słowniki, kandydaci, zmiany zachowania według źródła, poza nowym rozwiązaniem.
- **Słownik zakazany**: słowa z JAK starego modelu minus słowa z CO i z mapowania (np. grupa, drzewo, rodzic, prefiks
  nazwy, nazwy encji legacy) — `szczegoly.md`. Formy kodowe wpisz też do `stan.json` → `zakazane` (grep robi bramka).
- **Kandydaci**: tylko wiersze „Co i jak” mappera, każdy z bolączką; `crossing.json` kandydatów nie dokłada, tylko
  wzbogaca wiersz (`asks`, kształt odpowiedzi; klucz złączenia: wołający). Odpadają wiersze „nikt nie woła”, „archetyp
  na to nie odpowiada”, `asks: no`. Wiersz z martwą metodą (nikt jej nie woła), a w JAK STARE jest żywy wołający
  produkcyjny z `asks: yes` → kandydatem jest ten wołający. Wołający i linia — `szczegoly.md`, „Krok 1”.
- Bramka: pełna regresja na starcie (`--testy pelne`) — baza musi być zielona. Bez 👤.

## 2. Wybór miejsc → `miejsca.md`
Miejsce = jedno pytanie u jednego wołającego (szablon). Bramka bez testów: `bramka.mjs … swappable-dsl.2 --opis "wybór miejsc"`.
Wybierasz **3 wołających łatwych do wpięcia + 1 zapas** (status `zapas`; wchodzi, gdy któreś miejsce będzie nieudane),
tylko spośród żywych wołających. Łatwe: wołający w kodzie produkcyjnym, pytanie w jednym miejscu metody,
parametry dają się wyrazić typami wartości (parametr-encja → czy wartość, po której ją znajdziesz, jest jednoznaczna:
sprawdzasz indeksem unikalnym w migracjach, nie zgadujesz; bez indeksu — np. dwie żywe karty o tym samym UID — zapisz
w miejscu i w specyfikacji regułę wyboru przy duplikatach), prosta odpowiedź (tak/nie, jedna rzecz, krótka lista) **wyrażalna w obu modelach** — identyfikatory w odpowiedzi to takie, które nadaje świat (UID karty, nazwa, kod), nie id z bazy legacy (nowe rozwiązanie i seeder ich nie znają); podtypy, które legacy zwraca, a CO o nich nie mówi (np. inny rodzaj karty na liście; sprawdź enum typu encji
w odpowiedzi), wypisz w miejscu, wołający
budowany przez kontener (wystarczy drugi konstruktor), jest wejście do porównania (ekran, endpoint, podgląd). Ten sam
CO u kilku wołających = jeden port; różne pytania jednego obszaru = też jeden port, z metodą na pytanie (jeden świat,
jeden router). To samo wyrażenie w kodzie opisane w źródle dwoma sformułowaniami CO = jedno miejsce.
**Różnice modeli nie są kryterium.** Zapisz `miejsca.md` z `../parallel-models/miejsca-szablon.md` (z odrzuconymi
kandydatami i powodem). Bez 👤 (miejsca człowiek akceptuje razem ze scenariuszami w kroku 3).

## 3. Port, świat, scenariusze, sterownik legacy
- **Port** (nowy pakiet w module wołających; pakiet i przedrostek klas = `obszar_kod` w `stan.json`): jeden na obszar,
  metoda na pytanie CO; parametry w typach wartości projektu, nie encje.
  Wynik: `boolean` dla tak/nie, rekord faktu dla wariantów albo list; wariant, który wołający rozróżnia, jest
  rozróżnialny w wyniku. Wyjątek jako odpowiedź, brak typów wartości, pytanie w komendzie — `szczegoly.md`.
  Kontrakt portu nie ma wyjątku „nieznane”: wejście spoza świata = odpowiedź jak na brak (tak, jak dziś odpowiada
  wołający), w obu adapterach tak samo.
- **Świat** (`<Obszar>World`, pakiet `…world`, zwykła klasa, nie bean — transakcję daje wołający: test albo seeder;
  fabryka świata jako bean dozwolona, bo produkcja świata nie woła): komendy sytuacji tak, jak opowiada ją biznes (`region`,
  `campsiteIn`, `issuer`, `agreementWithCampsite`, `guestCard`). Dane świata przechodzą walidację encji legacy
  (długość, format). Wariant legacy, którego świat celowo nie wyraża — w „Ograniczenia świata”. Pojęcie spoza nowego rozwiązania, od którego zależy
  dzisiejsza odpowiedź (np. włączona lista), wolno w świecie; świat nowego rozwiązania je odwzorowuje u siebie. `Legacy<Obszar>World` zasila stary model
  **najpierw przez obserwowalne zachowanie produkcyjne** (istniejący serwis, który tworzy te dane jak na prodzie),
  a gdy go brak — przez repozytorium/bazę. Świat wołają tylko testy i seeder, nigdy kod produkcyjny.
- **`Legacy<Port>`**: adapter portu nad starym kodem (to samo, co dziś liczy wołający). W kroku 3 zwykła klasa, nie
  bean — bean robi konfiguracja kroku 5. **Nigdy nie zależy od wołającego** (cykl): logika w prywatnej metodzie
  wołającego → adapter powtarza te same publiczne wywołania albo wydzielasz ją do osobnej klasy (szew), którą wołają
  oba. Adapter leży w pakiecie portu; brak dostępu → szew widoczności, nie adapter w pakiecie legacy (`szczegoly.md`).
- **DSL** = komendy świata + pytania portu: `dsl.world()` zwraca świat (bez delegata), `dsl.<pytanie>(…)` pyta port.
  DSL przyjmuje typy proste (`String`) jak język scenariuszy; na typy wartości portu zamienia sterownik.
  **Scenariusze** (`<Obszar>Scenarios`): sytuacje wołających z
  `miejsca.md`, given (świat) / when (pytanie) / then (dzisiejsza odpowiedź); przy pytaniu when i then mogą być jedną
  linią. Tylko przypadki, które wołający dziś podaje (np. karta znana sieci). Każda zmiana zachowania według źródła,
  która dotyczy wybranych miejsc, dostaje scenariusz ze starym zachowaniem. **Sterownik legacy** + test.
- `testy_krok` w `stan.json`: scenariusze obszaru po nazwie (`'<Obszar>*ScenariosTest'`); sprawdź, że wzorzec nie łapie
  istniejących testów. Krok, który dodaje testy jednostkowe (np. konfiguracji), dopisuje je do `testy_krok`.
- Legacy zmieniasz tylko szwem (widoczność metody, wydzielony interfejs) — odstępstwo „test”.
- Słownik zakazany: wpisz do `stan.json` → `slownik_pliki` ścieżki/globy portu, typów portu, interfejsu świata, DSL
  i scenariuszy (bez `Legacy*` — adapter i świat legacy mówią mechanizmem; bramka i tak je pomija). Grep robi bramka;
  trafienie = czerwona bramka.
- `../test-convention-reviewer` na nowych plikach testów: w trybie bez pytań nie uruchamiasz; z człowiekiem — opcja
  w pytaniu bramki („Akceptuję + review konwencji”).
- Bramka: `--testy oba` (scenariusze na legacy + regresja + słownik); 👤 akceptuje miejsca i scenariusze. Scenariusze w języku
  CO (nazwy testów zdaniami) i miejsca z linkami do źródła wypisujesz sam w pytaniu do człowieka — skrypt bramki tego
  nie robi.
- Nie piszesz nowego rozwiązania, nie przepinasz wołających.

## 4. Nowy model
- **Osobny moduł**: nazwa = przedrostek istniejących modułów + rozwiązanie (np. `campsite-party`), w `stan.json` →
  `modul_rozwiazania`: nie importuje niczego z legacy (wolno wspólne typy wartości);
  zna go tylko adapter. **Minimalny podzbiór** — tylko to, czego potrzebują pytania z `miejsca.md`. Wzorzec domyślny
  i co brać z referencji (`../archetype-implementer/references/<archetyp>-impl.md`, repo
  https://github.com/Archetypy-Oprogramowania/archetypes) — `szczegoly.md`, „Krok 4”.
- **Build**: spodziewane odstępstwa „build” to oba pliki builda (lista modułów w korzeniu, zależność modułu wołających);
  sprawdź też Dockerfile/CI z listą modułów (np. `COPY <moduł>/pom.xml`) — nowy moduł trzeba tam dopisać.
- **`CLAUDE.md` modułu**: czym jest (hipoteza dla miejsc z `miejsca.md`, źródło), jakim językiem mówi (słownik
  mapowania), **jakim nie mówi** (słownik zakazany), zakaz sięgania do legacy.
- `<Rozwiązanie><Obszar>World`, `<Rozwiązanie><Port>` (adapter) i sterownik nowego modelu. **Te same scenariusze mają
  być zielone.** Gdzie źródło mówi inaczej niż dzisiejsze zachowanie, budujesz stare zachowanie (np. reguła
  „własne umowy podgrupy zastępują wyższe”) i wypisujesz to w „Zmiany zachowania według źródła” do potwierdzenia.
  Reguła starego zachowania bez scenariusza, elementy dodane tylko do niej i tłumaczenie komendy świata na dzisiejszą
  semantykę — `szczegoly.md`.
- **Tylko ze swojego świata**: nowe rozwiązanie odpowiada z tego, co ma; czego w nim nie ma, na to odpowiada jak na
  brak („nie”, pusta lista), bez osobnego sygnału. Nieznany podmiot pytania → „nie”; znany podmiot bez nadania albo
  ustawienia → dzisiejsza domyślna odpowiedź starego modelu. Pytamy tylko o przypadki z seedu i scenariuszy.
- Sterownik nowego modelu buduje model sam (`*Configuration.inMemory()`): test scenariuszy to zwykła klasa bez
  kontekstu Springa.
- Limit: 5 podejść na miejsce → `nieudane` z tym, czego brakuje (wchodzi `zapas`). Scenariuszy nie zmieniasz.
- Dopisz moduł nowego rozwiązania do `slownik_pliki` jako glob plików źródłowych (np. `campsite-party/src/**/*.java`;
  bez builda i `CLAUDE.md` modułu).
- Bramka: `--testy oba` (+ słownik); 👤 przegląda moduł i potwierdza zmiany zachowania (czy dzisiejsze to błąd);
  review konwencji jak w kroku 3.

## 5. Wpięcie, przełącznik, seeder
1. **Abstrakcja**: `<Wołający>` pyta `<Port>`, pod spodem `Legacy<Port>`. Drugi konstruktor z portem
   (kontener wybiera go), stary zostaje i pyta stary kod bezpośrednio (`szczegoly.md`). Adapter z kroku 3 nie jest
   beanem, więc abstrakcję i przełącznik (pkt 2) robisz razem, jedną bramką: beany adapterów robi konfiguracja (dwa
   beany portu bez przełącznika = niejednoznaczny wstrzyk).
2. **Przełącznik startowy**: konfiguracja wybiera adapter przy starcie (`<obszar portu>.model=legacy|<rozwiązanie>`, np.
   `acceptance.model`,
   domyślnie legacy). Zmienną środowiskową przełącznika zapisz w `stan.json` (`przelacznik`). Rejestr nowego modelu
   i rzut identyfikatorów to beany w obu trybach (jedna instancja dla seedera, adaptera, potem routera); przełącznik
   wybiera tylko adapter portu.
3. **Moduł seedera** (`<projekt>-seeder`, osobny moduł — przyda się przy migracji): profil uruchomienia lokalnego,
   sam seed (`<Obszar>Seed`) w pakiecie świata portu (widzą go testy zgodności w routerze), moduł seedera go tylko uruchamia;
   `seed(<Obszar>World)` dla obu światów tymi samymi komendami; do bazy legacy może pisać wprost. Legacy zasila raz
   (sprawdza znacznik), nowe rozwiązanie przy każdym starcie (pamięć). Jak uruchomić — w `stan.json` (`aplikacja`):
   już tu z wyłączonymi jobami i bez reseedu demo (właściwość, profil). Skrypt czyszczący demo — `szczegoly.md`.
4. **Wejście do porównania**: seeder (albo jego moduł) przygotowuje wszystko, czego wymaga wejście z `miejsca.md`
   (kolumna „Wejście do porównania”), a czego świat nie ma: dane w starym modelu (np. gniazdo słupka, włączona lista,
   zakres użytkownika konsoli) i atrapy usług zewnętrznych (np. partner HTTP) — tylko legacy, poza światem, opisane
   w specyfikacji i w `stan.json` (`przygotowanie`). Krok 6 kodu nie zmienia. Wejście jednorazowe (efekt uboczny) →
   zapas na oba modele albo odtwarzanie przy starcie, a do tego **„przygotuj wejście ponownie”** bez restartu (komenda
   albo endpoint w profilu seedera — router.5 woła je między fazami); atrapy usług mają **reset odczytu** (np. `DELETE`
   albo „od pozycji N”). Wejście i odczyt odpowiedzi zawężasz do przypadków seedu
   (identyfikatory seedu), nigdy zbiorcze liczby (np. „liczba kart sieci”) — dane demo je zmieniają. Gdzie się da,
   zawęża seeder (np. eksport partnera tylko kart seedu); dane spoza seedu, które mimo to idą przez przepięte miejsce,
   opisz jako różnicę spodziewaną dla routera (`szczegoly.md`, „Krok 5 — seeder”).
5. **Identyfikatory seedu**: seeder (albo krok) zapisuje do `specyfikacje/<obszar>/seed-identyfikatory.txt` wartości, które
   przypadki seedu podają portowi (UID karty, kod słupka; jeden na linię) — ścieżka w `stan.json`
   (`seed_identyfikatory`). Router.5 dzieli nimi katalog różnic na seed / poza seedem.
6. **Procesy**: `pid_dir` w `stan.json` (np. `target/pids`); start zapisuje tam PID (aplikacja, front, atrapy),
   zatrzymanie po PID z tego katalogu.
- Cykl w kontenerze, adapter szukający encji na nowo, wartości z bazy, których typ wartości nie przyjmie, reseed —
  `szczegoly.md`.
- Odpowiedź-zbiór u wołającego, który potrzebuje kolejności: kolejność ustala wołający (jak dziś, np. sortowanie);
  gdy dziś jej nie ma (zapytanie bez `ORDER BY`) — zapisz decyzję w specyfikacji.
- Bramka: `--testy oba` — scenariusze (`testy_krok`) na obu modelach i pełna regresja **tylko na starym modelu**
  (przełącznik domyślny), do tego test sanity w module aplikacji (`<Obszar>Configuration<Rozwiązanie>Test`): kontekst
  z profilem seedera i przełącznikiem na nowym rozwiązaniu startuje, odpowiada nowy model (sprawdzasz zachowaniem na
  przypadku z seedu, nie typem adaptera — router w swoim kroku 2 podmienia bean), seed jest w obu modelach, wejścia
  z `miejsca.md` istnieją (pliki, atrapy). Dopisz go do `testy_krok` (faza `verify` — pułapka Mavena w `szczegoly.md`). Pełnej regresji z przełącznikiem na nowym nie puszczasz: istniejące testy budują dane
  w legacy, nowy model ich nie zna. Wpięcie na nowym rozwiązaniu sprawdza krok 6 (okienka przepiętych miejsc, seed
  w obu modelach). Limit: 3 podejścia. 👤.
- Status miejsc w `miejsca.md` (`wpięte` / `nieudane`) ustawiasz w tym kroku; zmieniasz sposób wejścia (np. eksport
  zamiast ekranu) → poprawiasz też kolumny wejścia tego miejsca. Adapter legacy z kroku 3 wolno
  poprawić (np. konwersja, dostęp), gdy scenariusze zostają bez zmian i zielone.
- Nie zmieniasz nowego rozwiązania ani scenariuszy; nie włączasz go domyślnie.

## 6. Okienka przepiętych miejsc (ekran albo API)
Aplikację z seederem (osobna baza, wolny port) uruchamiasz **tylko po to, żeby nagrać okienka (ekrany) prowadzące do
przepiętych miejsc** — kolumna „Wejście do porównania” w `miejsca.md`. Te same przypadki z seedu najpierw na starym,
potem na nowym modelu (przełącznik startowy, restart, nagrania od nowa; porównujesz odpowiedzi wybrane `pick`, nie
całe zrzuty; odczyt zawężony do identyfikatorów seedu, nie zbiorcze liczby). Dane spoza seedu, joby i reszta
aplikacji nie są dowodem; joby wyłącza już komenda `aplikacja` z kroku 5. Zapytaj człowieka (AskUserQuestion):
**front** (nagranie: `examples/front-story.mjs` — podpisane zrzuty, film na model, `story.html` obok siebie), **API** (`examples/front-compare.mjs` / curl, odpowiedzi do pliku i `diff`) czy
**oba** (rekomendacja: oba, gdy aplikacja ma front; inaczej API).
- Najpierw lista kontrolna, dla każdego miejsca z `miejsca.md`: okienko działa na seedzie; każdy przypadek **naprawdę
  dochodzi do miejsca** (np. karta bez gościa odpada wcześniej i pytania nie zadaje); jest odpowiedź dla **każdej gałęzi
  pytania** (tak i nie, każdy wariant), nie tylko dla ścieżki z efektem. Brak → wraca do seedera z kroku 5.
  Miejsce bez ekranu → API (`front-compare.mjs`); bez API → „brak wejścia, zostają scenariusze” w specyfikacji.
- Przypadki: kombinacje z seedu, które coś rozróżniają (zapisz je w pliku przypadków razem z seedem).
- **Pytania mimochodem**: okienko pyta port także o dane spoza seedu (np. ekran ładuje listę dla domyślnego słupka
  demo) — wypisz je w `miejsca.md` (kolumna „Pytania mimochodem”); router zobaczy je jako różnice poza seedem.
- **Który model odpowiadał**: log przełącznika przy starcie (własny komunikat konfiguracji).
- **Układ `ekran/`**: nagrania frontu w `front/<model>/…` (`front-story.mjs record … ekran/front <model>`), odpowiedzi
  jako `<źródło>-<model>.jsonl` (`front-legacy.jsonl` — kopia `front/legacy/answers.jsonl`, `api-legacy.jsonl`,
  `plik-legacy.jsonl`; to samo dla nowego modelu). Własne skrypty odczytu (API, plik wyjścia) też w `ekran/` — wolno,
  kodu aplikacji nie zmieniają. Wzory i kolejność przy wejściu jednorazowym: `szczegoly.md`, „Krok 6”.
- Oczekiwane: to samo na każdym okienku przepiętego miejsca. Bramka: `bramka.mjs … --porownanie-katalog specyfikacje/<obszar>/ekran legacy <rozwiązanie>
  --opis "…"` (jeden wpis: suma n/n i rozbicie na źródła; pojedyncze pary: `--porownanie a b`, powtarzalne).
  Zrzuty tylko po `answer` (bez dodatkowych `shot` — rozmiar w gicie) i bez danych z maszyny (absolutne ścieżki na
  ekranie — krótkie ścieżki ustawia seeder). Filmy (`.webm`) do `ekran/`, ale poza gitem (`ekran/.gitignore`); w gicie
  zrzuty, `story.html` i odpowiedzi.
- Nie da się uruchomić — zostają testy, zapisz to. Pułapki uruchomienia: `szczegoly.md`.
- Nie zmieniasz kodu; brakujące wejście albo dane → wracasz do kroku 5 (seeder).

## Czego nie robisz
- Nie zmieniasz legacy poza odstępstwami (test, wpięcie, build) i nie poprawiasz istniejących testów.
- Nie zmieniasz scenariusza, żeby nowe rozwiązanie przeszło.
- Nie mówisz mechanizmem legacy w porcie, DSL, scenariuszach ani w nowym rozwiązaniu.
- Nie budujesz całego rozwiązania, migracji ani komend.

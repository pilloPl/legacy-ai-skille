---
disable-model-invocation: true
name: parallel-model-router
description: Kroki 1–5 drugiej części workflow `parallel-models` (Parallel Models, Legacy Fighter) na porcie w języku CO ze swappable-dsl. Zamienia przełącznik startowy na router przełączany w działaniu, bez redeployu: wybór najmniej inwazyjnej flagi (bramka człowieka), router z wajchą „który model” i checkboxem „porównuj”, rekonsyliacja różnic do pliku, ekran wajchy ze zwijanymi różnicami, testy przełącznika i test zgodności (oba modele mówią to samo), nagrane przełączenie wajchą tylko przepiętych miejsc (reszta systemu zostaje na starym modelu; różnice dla danych spoza seedu to wynik „wymaga migracji danych”, nie stop). Nie zmienia żadnego modelu. Uruchamiany przez `/parallel-models`; ten plik to opis kroków.
argument-hint: "(przez /parallel-models)"
---

# parallel-model-router — dwa modele, jedna wajcha

`swappable-dsl` zostawił port w języku CO, dwa adaptery (stary model, nowe rozwiązanie), scenariusze zielone na obu,
przełącznik startowy i moduł seedera. Teraz **router**: trzecia implementacja portu, która w działaniu wybiera
model i opcjonalnie pyta oba i porównuje. Protokół kroku (specyfikacja, bramka, commit): `../parallel-models/SKILL.md`.
Źródło techniki i pułapki: `parallel-models-lf.md`. Wejście: specyfikacja i `miejsca.md`; bez zielonego kroku 5
`swappable-dsl` — stop.

**Ten skill nie zmienia żadnego modelu** (ani starego, ani nowego rozwiązania), portu ani scenariuszy. Legacy rusza tylko
dla wajchy (klucze w mechanizmie flag) i ekranu (rejestracja w nawigacji frontu).

## 1. Wybór flagi
`flag-discovery.md`: obejrzyj system i specyfikację, znajdź mechanizm, który projekt już ma i który zmienia się
w działaniu (biblioteka flag, tabela ustawień z konsolą, przeładowywana konfiguracja); dopiero gdy nie ma żadnego —
sprawdzona biblioteka dla technologii. Zaproponuj 2–3 opcje z tym, co każda rusza w legacy, i rekomendacją
najmniej inwazyjnej. Reguła routingu: domyślnie **sama wajcha**; inna (klient, pojęcie z pytania, pora, eksperyment
na kluczach) tylko, gdy da się ją wyznaczyć z parametrów portu — jedno zdanie w języku CO.
Klucze: `<Obszar>Answer = legacy|<rozwiązanie>`, `<Obszar>Compare = true|false` (+ klucz reguły), gdzie `<Obszar>` to obszar w
kodzie (pakiet portu, np. `Acceptance`), nie nazwa katalogu specyfikacji. Domyślna pozycja wajchy (klucz pusty albo
brak) = przełącznik startowy z kroku 5 (sam domyślnie legacy); porównanie domyślnie wyłączone. Reakcja na różnicę
(`reconciliation.md`): domyślnie `log`. Zapisz, jak człowiek zmienia flagę i ile trwa, zanim zmiana dotrze (cache
per węzeł). Konwencji wokół mechanizmu (np. nazwany getter na każdy klucz) nie rozszerzaj — czytaj klucze przez istniejące ogólne metody.
Bramka (`bramka.mjs … parallel-model-router.1` bez `--testy`): 👤 wybiera mechanizm, regułę i reakcję na różnicę.
Bez kodu.

## 2. Router i rekonsyliacja
- `<Port>Router` spełnia kontrakt portu: oba adaptery, wajcha, reguła. W konfiguracji zastępuje adapter wybrany
  przełącznikiem startowym. **Wajcha** = interfejs `<Obszar>Lever` (pozycja: który model + czy porównywać),
  implementacja na mechanizmie z kroku 1 (`<Mechanizm><Obszar>Lever`), w testach wajcha w pamięci. Pozycja domyślna
  = przełącznik startowy. Gdy wajcha ma już wartość w mechanizmie flag, **wygrywa z przełącznikiem startowym** (stan
  przeżywa restart) — zapisz to w `stan.json` → `przelacznik`: przy ponownym nagraniu kroku 6 `swappable-dsl` ustaw
  wajchę albo ją wyczyść.
- Wajcha to bean (jedna instancja dla routera i ekranu z kroku 3). `position()` zwraca pozycję razem z jej
  **źródłem**: `start` (klucz pusty albo brak — przełącznik startowy), `właściwość` (wartość z mechanizmu flag),
  `nieznana wartość` (wartość spoza listy — odpowiada model startowy). Przełącznik startowy parsuje tylko wajcha;
  ekran czyta pozycję z niej.
- Testy i log przełącznika z kroku 5 dostosuj do routera: test sanity sprawdza zachowanie (który model odpowiada na
  przypadku z seedu), nie typ adaptera; log modelu w seederze pokazuje pozycję wajchy.
- Przy porównaniu wyjątek modelu, który nie odpowiada, nie dociera do wołającego (idzie do rekonsyliacji jako
  różnica). Wyjątek modelu, który odpowiada: wpis do pliku (gdy drugi model odpowiedział inaczej) i wyjątek idzie
  dalej bez zmian. Ten sam typ wyjątku po obu stronach = zgodne. Router nie udaje odpowiedzi.
- **Transakcja przy porównaniu** — osobna tylko dla modelu, który nie odpowiada, a czyta bazę (nowe rozwiązanie
  w pamięci pytasz wprost): poza transakcją wołającego, tylko do odczytu (Spring: `REQUIRES_NEW`, `readOnly`) — jego
  wyjątek w transakcji wołającego oznaczyłby ją do wycofania, choć router go łapie. Pułapka: osobna transakcja nie
  widzi niezatwierdzonych zapisów wołającego (fałszywe różnice, gdy wołający zapisuje przed pytaniem; w testach ze
  światem w wycofywanej transakcji) i zajmuje drugie połączenie z puli. Dlatego transakcja to zależność routera;
  w testach podajesz wykonanie bez osobnej transakcji.
- **Tylko pytania.** Komendy idą do starego modelu, więc świat nowego rozwiązania po seedzie się starzeje — różnice po
  edycji w aplikacji są spodziewane; napisz to w specyfikacji.
- `<Obszar>Reconciliation` + `<Obszar>ReconciliationLog` + `<Obszar>ReconciliationTest` (`reconciliation.md`):
  porównanie to czysta funkcja (listy jako zbiory), liczniki zgodne/różne trzyma stanowy obiekt rekonsyliacji (zakres:
  węzeł od startu) — on wystawia `summary()`, `recent(n)` i `directory()` dla ekranu w kroku 3. Różnice do katalogu
  różnic (plik JSON Lines na dzień, format z `reconciliation.md`): klucz `<obszar>.reconciliation.dir`, domyślnie
  katalog zapisywalny bez uprawnień (tymczasowy), tworzony leniwie przy pierwszej różnicy; dopisz go do `aplikacja`
  w `stan.json`. Testy ustawiają własny (tymczasowy w `target/`), nie domyślny.
  Krok, który dodaje testy, dopisuje je do `testy_krok` w `stan.json`.
- Router loguje przesunięcie wajchy przy pierwszym pytaniu po zmianie (stara → nowa pozycja; przy regule: per klucz)
  — dowód przełączenia.
- Bramka: `--testy oba`; 👤. W pytaniu nazwij wajchę: interfejs, implementację na mechanizmie, wajchę testową.

## 3. Ekran wajchy
Ekran dla człowieka (`<Obszar>LeverPage`, a jako podsekcja istniejącego ekranu — `<Obszar>LeverSection`): wajcha
„który model odpowiada”, checkbox „porównuj (rekonsyliacja)”, pod spodem **zwijane wyniki rekonsyliacji** (liczniki
zgodne / różne, rozwinięcie: ostatnie różnice z katalogu różnic).
- Zapis wajchy — istniejącym endpointem mechanizmu z kroku 1 (audyt za darmo).
- Odczyt stanu i liczników — nowa klasa odczytu w pakiecie portu (`<Obszar>LeverState`: pozycja i źródło
  z `position()` wajchy z kroku 2, `summary()`, `recent()`, `directory()` z rekonsyliacji) + nowy endpoint w module
  endpointów. Prawo jak do edycji flagi, sprawdzane tam, gdzie projekt sprawdza prawa w innych odczytach (endpoint
  albo serwis odczytu). Ścieżka endpointu stoi w nowej klasie; wspólnego rejestru ścieżek legacy nie ruszasz.
- Test endpointu (z prawem — stan wajchy i liczniki, bez prawa — odmowa) dopisz do `testy_krok`: moduł endpointów,
  faza `verify`.
- Klient API generowany ze schematu — nie regenerujesz pod jeden odczyt: ścieżka spoza schematu i typ odpowiedzi
  lokalnie (`../_shared/stos-odpowiedniki.md`, „Ścieżka spoza schematu klienta API”).
- Ekran widoczny z tym samym prawem co edycja flagi. Sprawdź, z jakim prawem widać miejsce rejestracji (zakładka,
  ekran ustawień); szersze — ekran ukrywa się sam bez prawa edycji flagi.
- Rejestracja w nawigacji frontu to odstępstwo „ekran”; najpierw sprawdź testy nawigacji — gdy nowa pozycja zmienia
  test legacy (np. utrwalona liczba zakładek), dodaj podsekcję istniejącego ekranu ustawień/administracji.
- `data-testid` na panelu różnic i na licznikach (zgodne / różne) — nagranie lokuje po nich (MUI dubluje `id`,
  `szczegoly.md` w `swappable-dsl`, „Krok 6”).
- Testy ekranu (front) w idiomie projektu; komenda w `stan.json` (`testy_front`).
- System bez frontu — sam endpoint i opis wywołania.
- Nagranie (`../swappable-dsl/examples/front-story.mjs`, same `steps` bez `cases`): ekran wajchy, przełączenie,
  wyniki rekonsyliacji. Liczniki mogą być zerowe (nikt jeszcze nie pytał przez router). Nagranie kończysz powrotem
  na model startowy (pusta wartość klucza) z wyłączonym porównaniem.
- Bramka: `--testy krok --front tak` (testy kroku z endpointem + front); 📷 zrzut ekranu, 👤.

## 4. Testy routera i zgodności
W konwencjach nowego kodu, bez mocków: nowe rozwiązanie w pamięci, stary model tak, jak testuje go sterownik legacy.
- `<Port>RouterTest`: wajcha w pamięci, wykonanie bez osobnej transakcji; dla każdej pozycji wajchy i gałęzi reguły: kto odpowiedział, czy zaszło
  porównanie, co trafiło do pliku; awaria modelu, który nie odpowiada, nie dociera do wołającego.
  Kto odpowiedział: światy obu modeli opowiedziane celowo różnie (np. umowę zna tylko jeden), wtedy odpowiedź mówi,
  który model pytano.
- Test na seedzie pyta jak wołający, w jego transakcji (inaczej stary model potrafi rzucić błąd leniwego ładowania).
  Klasy testowe wspólne dla modułów: sprawdź filtr test-jara w buildzie (co z niego wychodzi do innych modułów).
- `<Obszar>LeverTest`: `<Mechanizm><Obszar>Lever` w prawdziwym mechanizmie (wajcha budowana w teście z modelem startowym legacy) — bez
  ustawień legacy bez porównania; zmiana działa od razu (cache ustawień przeładuj przed i po każdym teście — wycofana
  transakcja zostawia stary cache).
- **Dziedzina** testu zgodności = to, o co pytają wołający z `miejsca.md` (ich parametry, ich przypadki), nie wszystkie
  kombinacje, jakie przyjmuje port. Co poza nią (np. parametr, którego żaden wołający nie podaje) — wykluczenia
  wypisane jawnie w specyfikacji („Testy routera i zgodności”).
- `<Obszar>ModelsAgreementTest`: sterownik routera (`<Obszar>RouterDriver`) pod te same scenariusze; po każdym scenariuszu
  (`@AfterEach`) wszystkie kombinacje z dziedziny na jego świecie (świat per scenariusz — nazwy w scenariuszach się
  powtarzają). **Wymagane: liczba porównań = liczba pytań** — pytania liczy sterownik routera (licznik w sterowniku,
  nie w teście), porównania — rekonsyliacja.
- `<Obszar>SeedAgreementTest`: test na seedzie w module, który widzi seed (świat + `<Obszar>Seed`; zwykle moduł seedera
  albo aplikacji) — wspólna baza testów seedu: seed zasiany raz, katalog różnic w `target/` (nie domyślny), po teście
  brak wpisów. Testy w modułach z zależnością test-jar uruchamiasz fazą `verify`, nie `test`.
- Odpowiedzi z wajchą na starym, przełączenie, odpowiedzi z wajchą na nowym — **mają być równe**. Test nie sprawdza,
  jakie są odpowiedzi, tylko że modele mówią to samo.
- Testy zgodności idą bez osobnej transakcji (świat w wycofywanej transakcji testu). Obok **jeden** test ścieżki
  z osobną transakcją: świat zatwierdzony (commit), router z prawdziwą transakcją przy porównaniu, potem sprzątanie
  świata — sprawdza, że model, który nie odpowiada, widzi dane i nie oznacza transakcji wołającego do wycofania.
- Bramka: `--testy oba`; 👤. Jakakolwiek różnica w teście zgodności (scenariusze albo seed) albo liczba porównań różna od
  liczby pytań — stop.

## 5. Przełączenie wajchą tego, co przepięte
Pokazujesz, że wajchą da się przełączyć w działaniu **tylko to, co przepięte, nie wszystko**; reszta systemu zostaje
na starym modelu. Aplikacja od zera (nowa paczka — stara potrafi zostać; baza ta sama, z seedem i przygotowaniem
z kroku 5) z seederem i wajchą na starym modelu (stan wajchy w mechanizmie flag przeżywa restart — ustaw jawnie na
starym). PID zapisujesz w `pid_dir` ze `stan.json` (np. `target/pids/app.pid`), zatrzymujesz po PID z tego katalogu.
Skrypt nagrania w `ekran/` wolno. Nagranie (`front-story.mjs`): ekran wajchy → przełączenie na nowe rozwiązanie
z porównaniem → te same okienka przepiętych miejsc co w kroku 6 `swappable-dsl` (te same przypadki z seedu) →
odpowiedzi takie same, rozwinięte wyniki rekonsyliacji → powrót na stary (fazy jako osobne nagrania, jeśli jedno nie
wystarczy). Bez frontu: to samo przez API (`front-compare.mjs` z parami `klucz=wartość`).
- **Wejście jednorazowe bez restartu**: między fazami wołasz „przygotuj wejście ponownie” seedera (komenda albo
  endpoint w profilu seedera, `przygotowanie` w `stan.json`) i reset odczytu atrap usług (np. `DELETE` albo „od pozycji
  N”) — inaczej druga faza czyta skutki pierwszej.
- Po przełączeniu sprawdź w logu routera, że wajcha się przesunęła (router loguje przesunięcie przy pierwszym pytaniu
  po zmianie — najpierw pytanie, potem log) — bez tego „bez zmian” niczego nie dowodzi.
- **Katalog różnic**: kopia do `ekran/`, potem
  `node <skill parallel-models>/scripts/bramka.mjs "$(pwd)/specyfikacje/<obszar>" parallel-model-router.5 --roznice "<katalog>" --seed "$(pwd)/specyfikacje/<obszar>/seed-identyfikatory.txt"`
  (ścieżki absolutne, każda w cudzysłowie). Wpis jest „seed”, gdy identyfikator seedu jest wśród wartości `input`.
  **Stop tylko na różnicach dla seedu** (inna odpowiedź na okienku przepiętego miejsca). Różnice spoza seedu (dane,
  których nowe rozwiązanie nie ma, np. dane demo, pytania okienka zadawane mimochodem — kolumna „Pytania mimochodem”
  w `miejsca.md`) to **wynik hipotezy**, nie stop.
- **Co realnie zmieniło się w systemie po przełączeniu** dla danych spoza seedu (np. „karty demo nie poszły do
  partnera”): sprawdź skutki akcji, przez które przeszły (eksport, plik wymiany, atrapa), i wypisz.
- Do specyfikacji: **jak przełączyć** (ekran/wywołanie, klucze, wartości), **jak wrócić**, **gdzie katalog różnic**
  (pliki na dzień, liczby seed / poza seedem), **czego przełączenie nie obejmuje** (reszta systemu, wołający spoza
  `miejsca.md`, dane spoza seedu, komendy) i **„Wymaga migracji danych”**: które pytania i dane dają inne odpowiedzi
  (z `pytania` wpisu bramki) i co zmieniło się w systemie. To most do migracji danych — osobny etap, poza workflow.
Bramka: 📷 przed i po przełączeniu, `--roznice`, 👤.

## Czego nie robisz
- Nie zmieniasz nowego rozwiązania ani starego modelu, portu ani scenariuszy.
- Nie włączasz nowego rozwiązania domyślnie.
- Nie przepinasz wołających spoza `miejsca.md`.
- Nie obsługujesz komend.

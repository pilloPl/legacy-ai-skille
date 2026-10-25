# swappable-dsl — szczegóły i przypadki szczególne

Czytasz tylko sekcję kroku, w którym jesteś, i tylko gdy trafisz na opisany przypadek.

## Słownik zakazany
Słowa z JAK **minus** słowa z CO i z mapowania mappera (np. grupa, drzewo, rodzic, poddrzewo, prefiks nazwy,
atrybut, nazwa typu drzewa w legacy, np. `SITE`). Słowo z CO albo mappera zostaje, nawet jeśli brzmi jak mechanizm
(„wydawca”/issuer, „podgrupa wydawcy”, `STAFF_ASSIGNMENT`, `ACCEPTING_SITE`) — o tym, czy słowo jest zakazane, decyduje
mapowanie, nie brzmienie. Grep całych słów (`-w` traktuje `_` jako część słowa, więc `SITE` nie trafi w `ACCEPTING_SITE`), z rozróżnieniem wielkości liter
(`grep -rnw`), po kodzie portu, DSL, scenariuszy i nowego modelu — bez plików builda i bez `CLAUDE.md` modułu (ten
celowo wypisuje zakazane słowa). Trafienia przeglądasz: grep łapie też słowa złożone („group” w „sub-group” — słowo
mappera, zostaje).
- W słowniku podawaj obok polskiego słowa jego formy kodowe — **z kontekstem identyfikatora** (`parentGroup`,
  `GroupType.SITE`, `groupDao`), nie gołe słowa: gołe `group` trafia też w złożenia z CO i mappera. Gołe słowo tylko,
  gdy żadnego złożenia z nim w CO ani w mapowaniu nie ma. Do zakazanego idą też nazwy encji i klas legacy
  (np. `HouseCard`, `GroupEntity`), chyba że mapowanie je przejmuje.
- Formy kodowe → `stan.json` → `zakazane`; pliki objęte grepem → `slownik_pliki` (port, typy portu, interfejs świata,
  DSL, scenariusze, moduł nowego rozwiązania) — tylko pliki źródłowe języka (np. `<moduł>/src/**/*.java`), bez builda.
- API języka (`.filter(`, `TreeMap`) i tagi builda nie są trafieniami mechanizmu: zakazujesz form mechanizmu
  (`WhitelistFilter`, `exportFilter`), nie gołych słów, które ma też język albo biblioteka. Zwolnione: `Legacy*` (adapter, świat i sterownik legacy mówią
  mechanizmem) i `CLAUDE.md` modułu. Grep (`grep -rnwF`) robi bramka przy każdym kroku, gdy lista jest niepusta.
- Słowo w nawiasie w mapowaniu mappera (np. „podgrupa wydawcy (filtr `parentGroup`)”) to identyfikator mechanizmu —
  idzie do zakazanego, nie do mapowania.
- Domena poza nowym rozwiązaniem (pojęcia z „Poza nowym rozwiązaniem”, np. kemping, słupek) nie jest zakazana: to
  słowa domeny, nie mechanizmu. Zakazujesz tylko JAK starego modelu.
- Dozwolone złożenia z języka CO (np. „parent organisation”) wypisz w specyfikacji obok słownika.
- Zakazujemy identyfikatora mechanizmu, nie słowa z CO. Regułę dzisiejszego zachowania nazywasz skutkiem w języku
  modelu („własne umowy zastępują odziedziczone”), nie mechanizmem („najbliższy przodek w drzewie”).

## Krok 1 — źródło (gdzie co leży)
W szkoleniu: sekcja pogłębienia w `analiza/archetypy.md` ma tabelę „Co i jak”, bolączki i implementację referencyjną;
bolączki są też przy pytaniach w `analiza/<wyspa>/crossing-input.json`. Kształt odpowiedzi (typ i co znaczy) stoi przy
wołającym w bolączkach („odpowiedź: `typ` — …”); w `crossing.json` go nie ma — bierzesz go z `how` i sygnatury
metody (`result` to skutek dla biznesu, nie kształt). `plik:linia` w źródle wskazuje zwykle deklarację metody albo
helper, który liczy odpowiedź; w `miejsca.md` podajesz **wołającego** (metodę produkcyjną, która zadaje pytanie) i
linię, w której pyta — nie deklarację ani helper. Odpowiedzi biznesu w wyniku mappera bywają
rozsiane po „Decyzje”, „Założenia”, „Otwarte” — zbierz je do „Zmiany zachowania według źródła”. Poza szkoleniem
źródłem jest opis rozwiązania i lista miejsc od człowieka; wtedy kandydaci = ta lista.

## Krok 1 — mapowanie, którego brakuje
- Dwa pojęcia legacy, które stary model traktuje inaczej, a mapowanie zlewa w jedno (np. „jednostka sieci” i „wydawca
  pod siecią” przy puli kart) — dwa wiersze mapowania albo pozycja w „Poza nowym rozwiązaniem”; nie zgadujesz w kroku 4.
- Relacja, której scenariusze potrzebują, a mapowanie jej nie nazywa (np. właściciel–kemping wprost) — dopisz do
  mapowania jako relację modelu z adnotacją „uzupełnione w kroku 1”.

## Krok 3 — port: parametry i wynik
- **Parametry**: typy wartości projektu (`CardRfid`, `PedestalCode`). Gdy projekt ma tylko identyfikatory mechanizmu
  (np. `GroupId`), dopisz w pakiecie portu własne typy w języku CO (`IssuerName`, `PlaceName`): adapter legacy
  tłumaczy je na identyfikatory legacy, adapter nowego modelu — na identyfikatory modelu (moduł nowego modelu typów
  portu nie importuje, zależność idzie w drugą stronę).
- **Wynik**:
  - tak/nie → `boolean`;
  - wołający potrzebuje więcej (np. „która karta personelu”) → identyfikator, a wołający dociąga resztę jak dotąd;
  - kilka wariantów albo lista → rekord faktu (lista elementów + co je rozróżnia, np. źródło: własna / przejęta);
  - legacy odpowiada **wyjątkiem** (np. „karta przyszła od innego wydawcy”) → wariant (`ANOTHER_ISSUER`): adapter legacy
    łapie wyjątek i zwraca wariant, tłumacz przy wołającym odtwarza ten sam wyjątek z tym samym komunikatem;
  - pytanie wplecione w komendę (import, zapis) → zachowaj kolejność sprawdzeń wołającego;
  - wejście spoza świata (nieznana karta, nieznany słupek) → odpowiedź jak na brak, tak jak dziś odpowiada wołający;
    kontrakt portu nie ma wyjątku ani wariantu „nieznane”.
- **Typy wartości w odpowiedzi** też muszą przyjąć każdą wartość z bazy (np. walidacja formatu UID) — inaczej adapter
  legacy padnie na danych demo; sprawdź walidację typu wobec danych.
- **Adapter legacy w pakiecie portu.** Potrzebuje metody niedostępnej z zewnątrz → szew widoczności w legacy
  (odstępstwo „test”), nie przenosisz adaptera do pakietu legacy.
- **Komendy świata w legacy**: najpierw istniejący serwis, który tworzy te dane jak na prodzie; gdy go brak albo serwis
  wymaga zalogowanego użytkownika konsoli (kontekst bezpieczeństwa) — DAO
  i repozytoria projektu, w transakcji (świat wołają tylko testy i seeder). Fixture'y testowe nie są dostępne poza
  testami — powtarzasz ich kilka linii. Dane, których świat nie opisuje, a legacy ich potrzebuje (np. dane gościa
  przy karcie), dokłada legacy-owa implementacja komendy.

## Krok 3 — odpowiedź-lista
W sekcji „Port i świat” zapisz **strukturę**: czy kolejność ma znaczenie (zwykle nie — porównujemy jako zbiory), elementy, których port
nie zna (np. sekcje kempingu w liście legacy), i przypadek, w którym stary format wołającego **nie pomieści** wariantu,
który port ma (np. jedna flaga „przejęta” na cały ekran przy mieszanych źródłach) — to wynik dla biznesu/ekranu.

## Krok 3 — scenariusze i transakcja
- Zestaw scenariuszy jako **interfejs z domyślnymi metodami testowymi**, gdy test legacy musi dziedziczyć po bazowej
  klasie integracyjnej projektu (jedno dziedziczenie). Inne stosy: `../_shared/stos-odpowiedniki.md`.
- Spring: `@Transactional` z klasy testu nie obejmuje metod odziedziczonych z interfejsu — transakcję scenariusza
  otwierasz i wycofujesz ręcznie przed i po każdym teście.
- JPA: `flush()` + `clear()` po każdej komendzie świata, nie tylko przed pytaniem — inaczej następna komenda albo
  pytanie czyta encje z pamięci sesji, a nie z bazy.
- Sterownik legacy: `world()` zwraca `Legacy<Obszar>World` wprost (bez delegata), sterownik dopisuje tylko pytania
  przez `Legacy<Port>`.
- **Izolacja danych świata**: baza testów bywa współdzielona z testami, które zatwierdzają dane (commit). Świat tworzy
  dane z unikalnymi nazwami (przedrostek na scenariusz), a pytanie o cały zbiór (np. wszystkie karty sieci) zawężasz
  do danych scenariusza albo sprawdzasz zawieranie, nie równość.
- **Ograniczenia świata na starym modelu** (komenda, której legacy nie da się wyrazić wprost, dane, które legacy
  dokłada samo) wypisz w „Port i świat”. Tam też warianty legacy, których świat celowo nie wyraża (np. typ, którego
  CO nie zna) — z powodem.
- Dane świata (nazwy, kody) przechodzą walidację encji legacy (długość, format, unikalność) — inaczej komenda świata
  padnie w legacy, a nie w scenariuszu.

## Krok 4 — nowe rozwiązanie
- **Wzorzec domyślny**: `examples/party-minimal/` (identyfikator, podmiot z rolami, relacja, rejestr w pamięci, wzór
  `CLAUDE.md`) — nazwy ról i relacji podmieniasz na te ze słownika mapowania. Z repo referencyjnego
  (`../archetype-implementer/references/<archetyp>-impl.md` mówi, gdzie co leży; referencja Party ma ~90 klas) bierzesz
  tylko **wzór klas**, bez budowania repo, bez `install`, bez planu i pytań archetype-implementera (decyzje są już
  w specyfikacji). Party — bierz zawsze: `PartyId`, `Party`, `Role`, `PartyRelationship`, `Validity`,
  `RegisteredIdentifier`; resztę tylko pod pytanie z `miejsca.md`. Uprawnienia wynikające z relacji (np. czyje karty
  działają gdzie) i inne reguły domenowe (np. suma umów) piszesz sam obok. Elementy techniczne wymuszone przez port
  (rola, identyfikator, rejestr) wolno dodać — wypisz je w „Nowe rozwiązanie w kodzie”. Własne testy modułu nie są
  wymagane: specyfikacją są scenariusze.
- **Izolacja**: pakiet nowego modułu `<przestrzeń projektu>.<rozwiązanie>` (np. `io.pillopl.party`);
  `grep -rnE "^(import|from|use|using) " <katalog nowego modelu> | grep <przestrzeń legacy> | grep -v <pakiet nowego modułu>` → pusto.
- **Źródło mówi inaczej niż dziś** (np. „umowy podgrupy i wydawcy się sumują”, a dziś własne zastępują wyższe):
  nowe rozwiązanie dostaje regułę dzisiejszego zachowania, nazwaną w jego języku (np. polityka „własne umowy
  zastępują odziedziczone”), żeby scenariusze przeszły. Różnicę wypisujesz w „Zmiany zachowania według źródła”;
  człowiek przy bramce mówi, czy dziś to błąd (zapis w „Potwierdzenia (krok 4)”; bez człowieka: „nierozstrzygnięte —
  zostaje dzisiejsze”). Scenariuszy nie wyłączasz.
- **Reguła starego zachowania bez scenariusza** (widać ją w kodzie, scenariusze jej nie sprawdzają): budujesz ją,
  w „Nowe rozwiązanie w kodzie” z adnotacją „niesprawdzona scenariuszem”; różnicę legacy wpisz w „Różnice poza
  scenariuszami”.
- Brakujący element źródła potrzebny tylko do starego zachowania wolno dodać — wypisz go w „Nowe rozwiązanie w kodzie”.
- **Tłumaczenie komendy świata na dzisiejszą semantykę** (np. umowa z regionem → umowy z kempingami regionu, ograniczenia
  komend legacy, pojęcie spoza rozwiązania rozpisane na relacje modelu) — dozwolone w `<Rozwiązanie><Obszar>World`,
  z adnotacją na liście „dodane tylko do starego zachowania” w „Nowe rozwiązanie w kodzie”.
- Komenda świata bez odpowiednika w modelu (dotyczy tylko legacy, np. dane gościa) — w świecie nowego modelu no-op
  z komentarzem, dlaczego.
- Stan trójwartościowy w legacy (tak / nie / nieustawione) nie mieści się w roli (ma / nie ma): „nieustawione” =
  brak nadania → dzisiejsza domyślna odpowiedź starego modelu; jawne „nie” wyrażasz osobno (relacja, atrybut).
- Relacja „dla wszystkich” bez konkretnego celu (np. umowa na całą sieć) → relacja do podmiotu-całości (sieć), nie
  do każdego z osobna; zapisz w „Nowe rozwiązanie w kodzie”.
- **Rzut identyfikatorów portu → model** (np. słupek → kemping, karta → wydawca: rzecz poza modelem z identyfikatorem
  podmiotu): jedna klasa w pakiecie portu, wspólna dla świata i adaptera nowego rozwiązania. W kroku 5 rzut i rejestr
  nowego modelu to beany w obu trybach przełącznika (jedna instancja dla seedera, adaptera i potem routera).

## Krok 5 — wpięcie
- Stary konstruktor zostaje i pyta stary kod **bezpośrednio** (nie przez adapter — inaczej istniejące testy z
  atrapami pękną); nowy przyjmuje port i to jego wybiera kontener (Spring: `@Autowired` na nowym). Stary może
  delegować do nowego `this(..., null)` — port `null` = stara droga.
- Przełącznik wybiera tylko adapter portu; rejestr nowego modelu i rzut identyfikatorów są beanami w obu trybach
  (seeder zasila tę samą instancję, z której czyta adapter).
- Adapter legacy z kroku 3 to zwykła klasa; beana robi konfiguracja kroku 5 → abstrakcja i przełącznik razem, jedną
  bramką.
- Adapter legacy nigdy nie zależy od wołającego (cykl w kontenerze: wołający pyta port, port woła wołającego).
  Logika w prywatnej metodzie wołającego → adapter powtarza te same publiczne wywołania (kopia) albo wydzielasz ją do
  osobnej klasy (szew, odstępstwo „test”), którą wołają i wołający, i adapter.
- Fabryka świata jako bean dozwolona (produkcja świata nie woła; korzysta z niej seeder).
- Adapter dostaje wartość (typ wartości), nie encję wołającego, i szuka encji na nowo. Czy wartość jest jednoznaczna,
  sprawdzasz indeksem unikalnym w migracjach (nie zgadujesz); bez niego (np. dwie żywe karty o tym samym UID) regułę
  wyboru przy duplikatach zapisujesz w specyfikacji.
- Wartość z bazy, której typ wartości nie przyjmie bez zmiany → wołający idzie dla niej starą drogą (pomocnik
  konwersji zwracający `Optional`: pusty = stara droga); zapisz w specyfikacji. Przez port idzie wartość tylko wtedy,
  gdy po konwersji równa się surowej (np. normalizacja wielkości liter zmieniłaby, którą encję legacy znajdzie).

## Krok 5 — seeder
Moduł `<projekt>-seeder` zależy od modułu wołających i od modułu nowego rozwiązania. Legacy zasilasz raz (czy już jest:
sprawdź pierwszą rzecz, którą seed tworzy, np. kod słupka), nowy model przy każdym starcie (jest w pamięci).
- Seed na danych demo: nazwy ze świata z przedrostkiem (np. `pm-`), żeby nie zderzyły się z danymi demo (sprawdź
  nazwy seedu w danych demo i ich skryptach, nie tylko przedrostek); komendy
  o zasięgu całego rynku (np. „żadna karta sieci nie jest znana”) tylko w testach, nie w seedzie.
- Seeder zatwierdza świat w legacy (commit), a świat nadaje unikalne nazwy → drugi start bez znacznika wywali się na
  duplikacie. Znacznik (pierwsza rzecz z seedu) albo seed idempotentny.
- Reseed demo: przeczytaj skrypt czyszczący demo i wypisz w specyfikacji tabele i progi id, które sprząta; każdą
  tabelę seedu sprawdź wobec nich. Znacznik bierz z danych, których reseed nie rusza, albo zrób seed idempotentny;
  seeder zatrzymuje start, gdy znacznik jest, a seedu nie ma. Komenda `aplikacja` uruchamia bez reseedu demo i z
  wyłączonymi jobami (właściwość, profil) już w kroku 5.
- Wejście do porównania przygotowuje seeder (albo jego moduł): dane w bazie i atrapy usług zewnętrznych (np. partner
  HTTP na wolnym porcie). Wejście jednorazowe (efekt uboczny, np. import zjada plik) → zapas na oba modele albo
  odtwarzanie przy starcie.
- **„Przygotuj wejście ponownie”** bez restartu: moduł seedera wystawia komendę albo endpoint (tylko w profilu
  seedera), które kładzie wejście jednorazowe od nowa (plik importu, katalog wymiany) — router.5 przełącza wajchę
  w działaniu i woła je między fazami. Wywołanie zapisz w `przygotowanie` w `stan.json`.
- **Atrapa usługi z resetem odczytu**: to, co atrapa odebrała (np. `GET /received`), da się wyczyścić (`DELETE
  /received`) albo czytać „od pozycji N” — inaczej druga faza nagrania widzi skutki pierwszej.
- **Wejście zawężone do seedu po stronie seedera**, gdzie się da: atrapa partnera wystawia eksport tylko kart seedu,
  plik importu ma tylko linie seedu, katalog wymiany zawiera tylko pliki seedu. Nie zakładaj, że dane demo nie dojdą do
  miejsca — sprawdź, która akcja ekranu je przepuszcza (często każda: eksport, synchronizacja, lista).
- Dane spoza seedu, które mimo to idą przez przepięte miejsce (akcja bierze wszystko, a seeder jej nie zawęzi), opisz
  w specyfikacji („Wpięcie, przełącznik, seeder”) jako **różnicę spodziewaną dla routera**: które dane, przez którą
  akcję, co odpowie nowe rozwiązanie (brak w jego świecie → odpowiedź jak na brak). Krok 6 ich nie porównuje, router
  zobaczy je w pliku różnic jako „poza seedem” — wynik „Wymaga migracji danych”, nie stop.
- **Identyfikatory seedu** do `seed-identyfikatory.txt` (jeden na linię): dokładnie te wartości, które trafią do `input`
  wpisu rekonsyliacji (parametry portu w pojęciach DSL: UID, kod), nie nazwy wyświetlane ani id bazy. Seeder może
  go pisać przy starcie albo krok zapisuje go raz ze świata; plik w gicie.
- Ścieżki widoczne na ekranie (katalog importu, plik wymiany) seeder ustawia krótkie i niezależne od maszyny (np.
  `/tmp/pm-import`), nie absolutne ścieżki z katalogu użytkownika — trafiają na zrzuty w gicie.
- Profil lokalny: łączysz z istniejącym profilem danych demo, jeśli projekt go ma (np. `demo,<obszar>-seed`); seeder
  rusza po seederze demo (Spring: `SmartLifecycle` z późniejszą fazą albo `@DependsOn`).
- Zależność aplikacji od modułu seedera to odstępstwo „build” (`<moduł aplikacji>/pom.xml`).
- Identyfikatory nadaje świat (krok 3); gdy mimo to odpowiedź ma id z bazy legacy — seeder czyta je z legacy i podaje
  nowemu światu, a przy niezgodności zatrzymuje start.
- Konwersja na typ wartości przy wpięciu (np. `CardRfid.of`) musi przyjąć każdą wartość z bazy; jeśli nie — stara
  droga dla takich wartości (sekcja „Krok 5 — wpięcie”).
- Log aplikacji demo bywa zaszumiony (joby integracji); w kroku 6 i w routerze szukasz po własnych komunikatach.

## Krok 5 — test sanity
`<Obszar>Configuration<Rozwiązanie>Test` w module aplikacji (jedyny test z kontekstem Springa poza sterownikiem legacy):
kontekst z profilem seedera i przełącznikiem na nowym rozwiązaniu startuje, seed jest w obu modelach (przypadki po
identyfikatorach seedu), wejścia z `miejsca.md` istnieją (pliki, atrapy). Który model odpowiada, sprawdzasz
zachowaniem (przypadek z seedu, na który modele odpowiadają rozróżnialnie, albo pozycja przełącznika), nie typem
beana adaptera — router (`parallel-model-router`, krok 2) zastąpi adapter i ten test ma przetrwać z drobną zmianą. Dopisany do `testy_krok`; pułapka Mavena
niżej.

## Krok 6 — okienka przepiętych miejsc
- Nagrywasz tylko okienka prowadzące do przepiętych miejsc, na przypadkach z seedu: wejście i odczyt zawężone do
  identyfikatorów seedu, nigdy zbiorcze liczby. Joby wyłącza komenda `aplikacja` z kroku 5 — potrafią zmienić dane
  w trakcie nagrania.
- Lista kontrolna przed nagraniem: każdy przypadek dochodzi do miejsca (sprawdź w kodzie warunki przed pytaniem, np.
  karta bez gościa odpada wcześniej), a każda gałąź pytania (tak / nie, każdy wariant odpowiedzi) ma przypadek — nie
  tylko ścieżka, na której widać efekt.
- **Układ `ekran/`** (front i API razem): `front/<model>/` (zrzuty, film, `answers.jsonl` z `front-story.mjs record …
  ekran/front <model>`), `front/story.html`, odpowiedzi `<źródło>-<model>.jsonl`: `front-legacy.jsonl` (kopia
  `front/legacy/answers.jsonl`), `api-legacy.jsonl` (`front-compare.mjs ask`), `plik-legacy.jsonl` (własny skrypt
  odczytu) i to samo z nazwą nowego rozwiązania. Bramka: `--porownanie-katalog specyfikacje/<obszar>/ekran legacy <rozwiązanie> --opis "…"`
  — paruje pliki po źródle, nazwy przypadków dostają przedrostek źródła, jeden wpis z sumą i rozbiciem na źródła.
  Skrypty odczytu (`ekran/odczyt-*.mjs`, `story.json`, `requests.json`) leżą w `ekran/` — wolno, to nie kod aplikacji.
- Ekran/endpoint konsoli (najlepiej) — `examples/front-compare.mjs` (logowanie, wajcha, listy jako zbiory przez
  `sortArrays`, zapytania z pliku zbudowanego po seedzie przez `requestsFile`). Odczyt zawężony do seedu w `pick`:
  wiersz po kilku kluczach `rows[card=X,socket=1]`, podzbiór listy `cards[uid^=pm-]` albo `cards[uid in A|B|C]`.
- Historia na ekranie — `examples/front-story.mjs`: Playwright projektu, jeśli front go ma (`"playwright": "<katalog
  frontu>"` względem katalogu `story.json`; `npm ci` w katalogu frontu raz, w `przygotowanie` w `stan.json`, nie
  w komendzie `front`), inaczej `npm i --no-save playwright` obok `story.json`. Front na serwerze deweloperskim
  z proxy na backend na wolnym porcie: `node node_modules/.bin/vite --port <wolny> --strictPort` + zmienna adresu
  backendu (jeden proces — PID z `$!` to Vite, nie `npx`/`npm`; `--strictPort` z linii komend: zajęty port kończy start
  błędem, zamiast cichej zmiany portu — nie polegasz na `server.port`/`strictPort` z configu projektu). Pola w oknie
  dialogowym: lokator z `"in": { "role": "dialog" }` (strona ma często pole o tej samej etykiecie). Odpowiedź
  czytana z ekranu (`answer` + `pick` — regex), `answers.jsonl` w formacie `front-compare.mjs` (działa `diff`).
  Kilka odczytów w jednym przypadku (licznik i toast) → `answer` z `"as"` (przypadek `M3 · licznik`). Porty i adresy
  z maszyny: `$ENV_NAZWA` w `story.json` (np. `"base": "http://localhost:$ENV_FRONT_PORT"`), wspólne wartości
  w `"vars"`. Przypadki z pliku po seedzie (`casesFile`). 9 przypadków ≈ 20 s filmu.
- MUI Select (i podobne listy rozwijane bez `<select>`): lokator `{ "role": "combobox", "name": "<etykieta>" }`, nie
  `label` — etykieta nie jest powiązana z polem.
- **MUI dubluje `id`** (np. ten sam `id` na panelu zwijanym i jego nagłówku, w kilku instancjach komponentu): nie lokuj
  po `id` ani `css: "#…"` — dodaj `data-testid` (nowy kod, np. panel różnic i liczniki ekranu wajchy) i lokuj
  `{ "testId": … }`.
- Przypadek z oczekiwanym błędem (np. odmowa): odpowiedzią jest tekst toastu albo komunikatu (`answer` na toast,
  `pick` bez zmiennych części), nie brak wyniku; toast znika — `answer` zaraz po akcji.
- Przypadek pokazywany bez werdyktu (np. pytanie mimochodem: lista dla domyślnego obiektu spoza seedu) —
  `"compare": false` w przypadku albo grupie: zrzut i odpowiedź są w `story.html`, ale poza `answers.jsonl`
  (`shown.jsonl`), więc `page`, `diff` i bramka go nie liczą.
- Zrzuty tylko po `answer` (bez dodatkowych `shot`): każdy zrzut idzie do gita. Odczyt bez zrzutu (np. drugi
  `answer` z `"as"` na tym samym widoku) — `"shot": false`. Nagranie samego ekranu bez przypadków (np. ekran wajchy)
  — same `steps` bez `cases`: jeden przebieg. Na ekranie bez danych z maszyny
  (absolutne ścieżki, nazwa użytkownika) — krótkie ścieżki ustawia seeder (krok 5).
- Po akcji czekaj na sygnał świeżości (toast, zmiana licznika: krok `see` przed `answer`) — inaczej `answer` przeczyta stan
  z poprzedniego przebiegu; uważaj na okna potwierdzenia („Confirm”). Lokator po etykiecie zawężaj `"in"` (okno,
  sekcja po testId).
- Adres backendu dla serwera deweloperskiego frontu: sprawdź jego konfigurację (np. `vite.config.ts`, zmienna z adresem).
- Odpowiedź do urządzenia → podgląd tej odpowiedzi w konsoli, jeśli jest.
- Komenda z efektem ubocznym (import, job) → uruchomienie jej z konsoli na powtarzalnym wejściu (np. plik z liniami,
  które nie zmieniają bazy przy powtórce; wejście kładziesz tuż przed akcją — krok `exec` — bo job po starcie potrafi
  je zjeść), odczyt statusu bez znaczników czasu; własny skrypt w tym samym formacie
  wyniku co `front-compare.mjs`.
- **Wejście jednorazowe** (akcja zmienia dane, których drugi raz nie da się odczytać tak samo): w jednym starcie
  aplikacji, w tej kolejności — odczyty API przed akcją → nagranie z akcją → odczyt skutków (API, plik). Restart
  między nimi przywraca albo gubi stan; to samo potem na drugim modelu.
- **Odpowiedź w pliku albo katalogu** (eksport, plik wymiany): skrypt w `ekran/` czyta plik po akcji i pisze
  odpowiedzi w formacie `front-compare.mjs`, zawężone do seedu, bez znaczników czasu, np.:
  ```js
  // ekran/odczyt-plik.mjs <katalog wyjścia> <out.jsonl> — one line per seed card: its status in the export
  import fs from 'node:fs'; import path from 'node:path';
  const [dir, out] = process.argv.slice(2);
  const rows = fs.readdirSync(dir).filter(f => f.endsWith('.csv')).sort()
    .flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n').slice(1).map(l => l.split(';')));
  const seed = rows.filter(([uid]) => uid.startsWith('pm-'));
  const lines = seed.length ? seed.map(([uid, status]) => ({ name: `M4 · ${uid}`, answer: status }))
    : [{ name: 'M4', answer: 'error: brak kart seedu w eksporcie' }]; // nothing read is an error, not "same"
  fs.writeFileSync(out, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  ```
- Miejsce bez ekranu → API; bez API → „brak wejścia, zostają scenariusze” w specyfikacji.

## Pułapki środowiska (Maven; inne stosy analogicznie)
- Build modułu z zależnościami z reaktora (`-pl … -am`) — inaczej weźmiesz cudzą wersję nowego modułu z lokalnego
  repozytorium (kilka kopii repo na tej samej wersji SNAPSHOT — nie rób `install`).
- Pełna regresja przez `mvn verify` z katalogu głównego (moduły korzystające z test-jarów innych modułów).
- Test w module zależnym od test-jara innego modułu (np. sanity w module aplikacji): `testy_krok` w fazie `verify`
  (`mvn -B -pl <app> -am verify -Dtest=… -Dsurefire.failIfNoSpecifiedTests=false`) — w fazie `test` test-jar nie
  powstaje. Dwie `@SpringBootConfiguration` na ścieżce testów (aplikacja + test-jar) → test sanity wskazuje klasę
  aplikacji wprost (`@SpringBootTest(classes = …)`).
- Wynik czytasz z bramki (`bramki.jsonl`, wyjście skryptu), nie ze starych raportów w `target/surefire-reports`.
- Przed uruchomieniem aplikacji paczka od zera (`clean package`) — stara potrafi zostać.
- Aplikację odpalasz na osobnej bazie (np. świeży kontener) i wolnym porcie; po wszystkim ją zatrzymaj. PID do
  `pid_dir` ze `stan.json`, np. w bash: `mkdir -p "$(pwd)/target/pids"; … & echo $! > "$(pwd)/target/pids/app.pid"`;
  zatrzymanie: `kill "$(cat "$(pwd)/target/pids/app.pid")"`.
- Komendy ze ścieżkami: absolutne (`"$(pwd)/…"`), każdy argument w cudzysłowie. zsh nie dzieli niecytowanej
  `$ZMIENNEJ` na słowa — komendy z argumentami w zmiennej (np. `$TESTY`) nie rozwijaj, uruchom `bash -c "$TESTY"`.
- Model nowego modelu jako bean we współdzielonym kontekście testów trzyma dane między klasami testów — w testach
  buduj go sam albo używaj prefiksów nazw.

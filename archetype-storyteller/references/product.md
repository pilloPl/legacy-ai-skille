# Archetyp: Product

Materiał referencyjny na podstawie modułu M02 szkolenia o archetypach (lekcje L01–L12 + scenki).
Przeznaczenie: rozpoznawanie archetypu Product w wymaganiach biznesowych, kodzie legacy i rozmowach
z biznesem oraz poprawne modelowanie jego elementów.

---

## 1. Esencja archetypu

Istotą każdego biznesu jest dawanie czegoś w zamian za coś — od barteru po pieniądz. To "coś" dziś
nazywamy produktem, usługą, ofertą, świadczeniem. **W każdym biznesie istnieje coś, co klient
otrzymuje — ale nie każda organizacja potrafi to nazwać.** Firmy mówiące "my nie mamy produktów"
mają je — tylko nikt ich nie zidentyfikował, a brak tej świadomości odbija się w systemach jako
ból, błędy, opóźnienia i chaos w dostarczaniu wartości.

Kluczowe definicje robocze (do których moduł wielokrotnie wraca):

- **Produkt to coś, co wpływa na stan zasobów organizacji** — pieniędzy, czasu, towaru, ludzi,
  przestrzeni. Sprzedaż wędki zmienia stan magazynu i kasy; sprzedaż masażu zużywa okienko
  w kalendarzu kosmetyczki. Kierunek przepływu pieniędzy NIE determinuje, czy coś jest produktem
  (koszty, zniżki, zwroty, korekty też są produktami).
- **Produkt to wszystko, co ma sens biznesowy oraz wywołuje skutki operacyjne lub finansowe** —
  ma reguły, parametry, skutki.
- Produkt to nie tylko to, co firma **sprzedaje** — to także to, czym **steruje**: w operacjach
  decyduje, jakie procesy uruchomić po sprzedaży; w księgowości — jak coś zaksięgować;
  w logistyce — skąd wziąć i dokąd dostarczyć; w rozliczeniach — reguły naliczania; w CRM — jakie
  dane o kliencie zbierać; w analityce — co mierzyć.
- Katalog produktów to nie baza danych, lecz **mapa biznesu** — wspólny język, dzięki któremu IT,
  sprzedaż i księgowość przestają żyć we własnych światach.
- Produkt jako **capability** (zdolność biznesowa): tak jak Accounting zarządza wartością, Product
  zarządza tym, co w ogóle można sprzedać, zaoferować, rozliczyć czy wykonać.

Jaki problem rozwiązuje: brak centralnego modelu produktu powoduje, że złożoność oferty nie znika —
ukrywa się w kodzie, konfiguracjach i ludzkich głowach. Każdy zespół rozumie ofertę po swojemu,
powstaje "mozaika niezależnych aplikacji", a każda zmiana oferty to projekt IT (migracje, błędy,
ryzyka) zamiast decyzji biznesowej. Metafora z modułu: jakby każda kuchnia w restauracji sama
decydowała, co oznacza "pizza" — działa, dopóki ktoś nie zamówi dwóch pizz z różnych kuchni naraz.
Oraz: "pracujesz na straganie sprzedającym gacie" — model sklepu (katalog, warianty, wersje,
dostępność) to model uporządkowanego świata, do którego każda organizacja powinna dążyć od środka,
niezależnie od branży.

Teza strategiczna: firma, która nie potrafi powiedzieć, czym są jej produkty, nie potrafi rozwijać
oferty, skalować operacji ani reagować na rynek. Konkurencja wprowadza usługę w tydzień; bez modelu
produktu dodanie jednego wariantu to 3 miesiące analizy i 2 miesiące wdrożenia.

---

## 2. Sygnały dopasowania (triggery)

### Triggery w języku biznesu / wymaganiach

- "Różne ceny dla klientów", "w zależności od tego, co klient wybierze, pojawiają się **oferty**"
  (scenka 1 — moment rozpoznania katalogu produktów w systemie logistycznym).
- Cecha czegoś **wpływa na procesy i zasoby**: "rozmiar i waga wpływają na cenę i całą logistykę —
  planowanie podjazdów, wybór auta, zarządzanie przestrzenią".
- **Dodatki warunkowe / sprzedaż wiązana**: "coś kosztownego najlepiej ubezpieczyć", "ubezpieczenia
  nie można wziąć bez wysyłki paczki" → relacja między produktami; "za pobraniem — wtedy więcej
  charge'ujemy" → produkt-opłata.
- Słowa: **oferta, katalog, pakiet, zestaw, bundle, abonament, plan, taryfa, wariant, konfiguracja,
  cennik pozycji, promocja, kampania**.
- "Tylko dla...", "dostępne wyłącznie w...", "od... do...", "tylko w aplikacji mobilnej", "tylko dla
  firm", "tylko w grudniu", "dla klientów premium", "powyżej 18 lat" → warunki stosowalności.
- "Można podnieść do wyższej wersji / upgrade", "zastępuje", "wycofujemy na rzecz nowego",
  "pasuje do / kompatybilne z", "wyklucza się z", "w komplecie z" → relacje między produktami.
- "Musi zawierać coś z tej listy", "wybierz do dwóch dodatków", "jeśli wybrano X, to Y obowiązkowe /
  niedozwolone" → pakiety i reguły selekcji.
- Rzeczy, których "się nie sprzedaje", ale które mają reguły, parametry i skutki finansowe:
  **rata, odsetki, monit, ugoda, koszt sądowy, zaliczka komornicza, opłata, limit, bonus, SLA,
  powiadomienie SMS charge'owane osobno, taryfa, przyłącze, plan spłaty, świadczenie, zlecenie**.
- Scenka 2 (test lakmusowy): "system sam wybiera SLA, klient tego nie wybiera" — to NADAL produkt,
  bo wpływa na zasoby, wartość i procesy operacyjne; jeśli jest w katalogu, nowy feature nie wymaga
  specyficznego kodu ("ten feature już jest zrobiony").
- Narzekania typu: "nasz biznes jest specyficzny", "my niczego nie sprzedajemy", "my nie mamy
  produktów, mamy usługi / konta / wizyty / wierzytelności" — niemal pewny sygnał ukrytego katalogu.
- "Biznes chce dodać produkt w tydzień, a IT potrzebuje miesiąca"; "każda zmiana oferty to
  development i deploy" — objaw braku modelu produktu.

### Triggery w kodzie legacy

- Osobna klasa/tabela per rodzaj oferty: `Goods`, `Mortgage`, `Parcel`, `Appointment` — każda ze
  swoim słownictwem (`id`/`SKU`/`kod`; `price`/`amount`/`value`; `name`/`label`).
- Rodziny `XxxDefinition` (GoodsDefinition, MortgageDefinition...) — ręcznie odkryty Flyweight,
  bez wspólnego modelu.
- Jedna klasa/tabela mieszająca definicję z realizacją: `Mortgage` z `customerId` i `balance`
  w tych samych rekordach co oprocentowanie oferty; tysiące kopii jednej oferty.
- Opisy produktów na frontendzie (plik `constants`), w YAML-ach, w CMS-ie, w statycznych klasach —
  "system wie, że coś istnieje, ale nie wie, czym to jest".
- Doklejanie pól do centralnej encji: `BankAccount` z `creditCardNumber`, `loanId`,
  `insurancePolicyId`, `blikAlias` + setki sprawdzeń `!= null` sterujących procesami.
- If-y rozsiane po kontrolerach/serwisach/SQL typu "tego nie sprzedajemy w tym kraju",
  "ta funkcja tylko w mobile" — reguły aplikowalności bez jednego miejsca zarządzania.
- Flagi i kolumny per wariant; każda nowa cecha = zmiana schematu bazy i deploy.
- Reguły zależności produktów żyjące w Excelach, umowach, PowerPointach i głowach — nie w modelu.
- Rozjazd kanałów: aplikacja mobilna blokuje coś, co backend uznaje za dozwolone; web pokazuje
  inną ofertę niż mobile; hurtownia raportuje sprzedaż czegoś, czego "nie można kupić".
- Chaos jednostek: raport "5 tysięcy" — kilogramów? sztuk? woreczków po sześć?

---

## 3. Anty-sygnały / granice archetypu

- **Cena i warunki cenowe to NIE Product.** Produkt mówi, CO jest oferowane; cennik — ZA ILE i na
  jakich zasadach. "Produkty to semantyka, cennik to ekonomia" — osobny archetyp Pricing, celowo
  rozdzielony, choć w wielu firmach utożsamiany.
- **Cykl życia realizacji to NIE cecha produktu.** "Zaplanowana / w trakcie / zakończona",
  "nadana / w drodze / dostarczona" to cecha realizacji (fulfillment), nie katalogu. Sposób
  realizacji zależy od katalogu, ale nie jest jego częścią.
- **Stany magazynowe, rezerwacje, dostępność fizyczna, audyt egzemplarzy** — świat Inventory
  i operacji; Product definiuje typy i reguły tworzenia instancji, ale śledzeniem stanu zajmuje
  się inny archetyp (Inventory jest downstream katalogu).
- **Kto kupuje / kto świadczy / kto jest autoryzowany** — to Party, nie Product (Party dostarcza
  kontekst do reguł aplikowalności, ale sam nie jest produktem).
- **Czyste unikaty** (gitara Hetfielda, Dama z gronostajem): katalog typów nie ma sensu — opis
  produktu jest równoznaczny z egzemplarzem; pełny aparat ProductType/katalog to przerost.
- **Mały, stabilny biznes jednoproduktowy**: salon masażu od 20 lat — dosłowny język domeny
  (MassageType/MassageInstance) jest poprawny; nawet flaga `IS_ACUPUNCTURE` "nie zabije systemu",
  o ile zachowane jest oddzielenie definicji od instancji. Archetyp to sposób modelowania, nie
  gotowa receptura — nie każdy potrzebuje pakietów i reguł selekcji.
- Relacje typu społecznego, otwarte i opisowe (osoba–organizacja) → Party; w Product zbiór typów
  relacji jest zamknięty (enum), bo świat oferty musi być spójny i kontrolowany.

---

## 4. Sześć poziomów chaosu produktowego (L02)

Sześć etapów bólu, przez które przechodzą firmy, zanim odkryją, że problem nie leży w kodzie,
tylko w braku modelu produktu. Każdy poziom to zarazem wymiar, który dojrzały model musi pokryć.

### Poziom 1 — Dosłowne modelowanie (klasa per oferta)

Początek: "sprzedajemy towary i usługi" → programista pisze klasy `Goods`, `Mortgage`, `Parcel`,
`Appointment`. Opisy (etykiety — "jak na worku z kostkami lodu: uwaga, zimne; skład: woda") lądują
gdzie popadnie: frontend/constants, YAML, tabele, statyczne klasy. Wprawny programista zauważa
powielanie i tworzy `GoodsDefinition`, `MortgageDefinition`... (wzorzec Flyweight — "było
w książce"). Konsekwencje:

- **Fragmentacja** — product/item/service w trzech systemach; integracje to tłumaczenie języków.
- **Dublowanie logiki** — zmiana w jednym miejscu, trzy inne po staremu.
- **Opis bez sensu dla systemu** — nie da się wyszukać, porównać, zrozumieć ("magazyn z pełnymi
  półkami bez etykiet").
- **Chaos identyfikacji** — UUID/kod/ID/string per produkt; przy integracji ręczne mapowania,
  duplikaty, raporty z rozjazdem.
- **Niska skalowalność** — nowa oferta = nowa klasa, nowy deploy, nowa mapa pól. System nie wspiera
  oferty — on ją **symuluje**.

### Poziom 2 — Nierozróżnianie natury produktów i mieszanie definicji z wystąpieniem

Pytanie "czym właściwie są rzeczy, które oferujemy?" ujawnia trzy kategorie dóbr:

1. **Unikaty** — jedyny egzemplarz, bez kopii i serii (gitara Snakebyte Hetfielda z koncertu S&M
   1999, denar Chrobrego, Dama z gronostajem, fortepian Chopina). Jeden byt = jeden rekord; opis
   jest równoznaczny z egzemplarzem; katalog nie ma sensu. Szczególny przypadek kategorii 2.
2. **Jednoznacznie identyfikowalne** — wspólny wzorzec + rozróżnialne egzemplarze (telewizor Sony
   BRAVIA, kredyt hipoteczny). System musi odróżniać TYP (definicję) od EGZEMPLARZA (instancji).
   Klasyczny błąd: `Mortgage` = i oferta banku, i umowa Kowalskiego → bank nie ma katalogu, ma
   tysiące kopii jednej oferty; zmiana oferty = edycja tysięcy rekordów; nikt nie wie, które
   oprocentowanie 3,5% jest aktualne. Analogicznie przesyłka: "paczka 24h" vs konkretny przewóz —
   po zmianie cennika stare paczki "nie wiedzą o tym nic". Gdy światy się pomieszają, nie wiadomo,
   co jest ofertą, a co realizacją; każda zmiana to ryzyko, każdy raport to zgadywanka.
3. **Identyczne (nierozróżnialne)** — baton, cola, ryż, arkusz papieru; nie śledzimy egzemplarzy,
   tylko ilości (sztuki, kg, litry). Niuanse: **partie (batch)** — egzemplarze identyczne, ale
   partie już nie; partia umożliwia kontrolę jakości, reklamacje, wycofania z rynku i traceability
   (np. partia wysyłkowa w logistyce — wiadomo, które przesyłki zagrożone awarią kursu danego dnia).
   **Jednostki miary** — awokado w hurcie na kilogramy, w detalu na sztuki; praca doradcy ERP na
   godziny. Bez rozróżnienia jednostek raport "5000" jest bez sensu. Typowe braki: brak pojęcia
   partii, chaos jednostek, brak konwersji.

### Poziom 3 — Cechy, warianty, konfiguracja

Klient chce wybierać: ten sam model w czerwonym, wizyta tylko u profesora, przesyłka
ponadgabarytowa, lokata dla kwot powyżej 100 tys. Typowe modelowanie: dziesiątki kolumn w tabelach
i pól w specyficznych klasach. Konsekwencje: niska elastyczność (nowa cecha = zmiana schematu/kodu),
brak spójności semantycznej (rozmiar jako enum/string/słownik), brak porównywania produktów
(wyszukiwarka nie wie, co wspólne), brak dynamicznej konfiguracji, wysoki koszt utrzymania (nowy
wariant = de facto nowy produkt w kodzie). Wniosek: cechy to nie opis, lecz **mechanizm
różnicowania i sterowania ofertą**; dojrzały model pozwala dodawać cechy i wartości **bez zmiany
kodu** — inaczej oferta rozwijana jest "w Excelu".

### Poziom 4 — Relacje między produktami

Produkty rzadko występują samotnie: karta kredytowa nie istnieje bez konta; kredyt hipoteczny tylko
w pakiecie z ubezpieczeniem na życie (decyzja biznesowa); premium wyłącza stary plan; adapter musi
pasować do wózka. Typowe modelowanie: **wcale** (Excel, umowy, głowy pracowników) albo jawne if-y,
albo wyciek na poziom danych — kolumna `creditCardNumber` w koncie, potem `loanId`,
`insurancePolicyId`, `blikAlias` → encja-"centrum wszechświata" i setki null-checków.
Konsekwencje: ograniczona elastyczność ("to potrwa dwa sprinty"), błędogenność (każdy system
interpretuje reguły inaczej; karta bez konta, paczka bez adresu), brak skalowalności funkcjonalnej
(system rośnie nieorganicznie przez doklejanie — albo zaczyna się kruszyć). Relacje to **szkielet
oferty**, nie dodatki.

### Poziom 5 — Reguły aplikowalności (dostępności)

Nie każdy produkt dla każdego, wszędzie, zawsze, każdym kanałem: jedne towary tylko w PL, lokata 5%
tylko w aplikacji mobilnej, kardiolog dziecięcy do 16 r.ż., podjazdy kurierskie tylko dla B2B przy
min. 5 przesyłkach. Jawne reguły dają: kontrolę dostępności bez IT (segmentacja, wymogi prawne),
unikanie błędów operacyjnych (odrzucanie nielogicznych kombinacji przed fakturowaniem/dostawą),
dynamiczne zarządzanie (włącz/wyłącz per kanał, rynek, sezon). Typowa rzeczywistość: niekończące
się if-y; mobile blokuje coś, co backend dopuszcza; web pokazuje inną ofertę; "spójność jest tylko
iluzją", bo nie ma jednego miejsca zarządzającego regułami.

### Poziom 6 — Pakiety i produkty złożone

Biznes sprzedaje zestawy, nie klocki: bank — konto+karta+aplikacja+ubezpieczenie; logistyka —
przesyłka+ubezpieczenie+SMS; medycyna — wizyta+badanie+opis; retail — laptop+torba+ubezpieczenie+
Office 365. Typowa implementacja "na szybko": modyfikowanie produktu kluczowego (pola doklejane do
konta/przesyłki) → spaghetti relacji; nikt nie wie, które pole to faktyczne powiązanie. Problemy:
elementy pakietu mają własne cykle życia, cenniki i zasady rozliczania (i innych właścicieli-
zespoły); brak spójności (każdy system rozumie pakiet inaczej — nie wiadomo, czy sprzedano produkt
czy zestaw), brak elastyczności (nowa kombinacja = kod), trudne utrzymanie (zmiana jednego elementu
= przebudowa zestawu), błędy operacyjne w rozliczaniu. Pakiet to **strategiczny byt biznesowy**,
nie marketingowy skrót.

Uwaga końcowa L02: w małych systemach dosłowne modelowanie bywa OK (szybki start, weryfikacja
pomysłu). Ból rośnie z liczbą produktów, kanałów, rynków. Decyzje mają być świadome — model ma
rosnąć razem z biznesem.

---

## 5. Elementy składowe modelu

### 5.1 ProductType — definicja produktu (L03)

Wszędzie ten sam wzorzec: definicje, instancje, dane operacyjne — różnią się tylko słowa.
Dwa światy do rozdzielenia: **świat definicji** (czym coś jest: oferta kredytu, rodzaj przesyłki,
typ wizyty) i **świat wystąpień** (co się wydarzyło: umowa z Kowalskim, paczka PKG-2024-123,
wizyta 15 marca).

`ProductType` — szablon/definicja, minimalny szkielet:
- `ProductIdentifier` — jak rozpoznajemy typ (GTIN, ISBN, UUID, kod lokalny — byle spójnie),
- `ProductName` — nazwa dla klienta, część komunikacji ("iPhone 15 Pro 256 GB", "Konsultacja
  kardiologiczna 30 minut", "Przesyłka krajowa 24h"),
- `ProductDescription` — opis oferty.

Ten sam model obsługuje towar (iPhone) i usługę (konsultacja) — zmienia się tylko kontekst
biznesowy. Rozszerzenia ProductType (dalsze lekcje): `trackingStrategy`, `preferredUnit`
(+ ew. zbiór akceptowalnych jednostek), `FeatureTypes`, `ProductMetadata`,
`ApplicabilityConstraint`. Tworzenie przez **metody kreacyjne wg strategii śledzenia**
(`unique`, `individuallyTracked`, `batchTracked`) — bo strategia śledzenia to stabilna część
modelu i determinuje reguły tworzenia instancji; dla cech i warunków — **builder**.

### 5.2 ProductInstance — wystąpienie (L03)

Konkretne zdarzenie/egzemplarz: iPhone o numerze C02X..., wizyta Kowalskiego 15 marca 10:00.
Pola: referencja do `ProductType`, `SerialNumber` (śledzenie indywidualne), `BatchId` (śledzenie
partiami), wartości cech (`ProductFeatureInstance`), ilość.

**Kiedy powstaje instancja?** Dla towarów — zwykle PRZED sprzedażą: przy produkcji lub przyjęciu na
magazyn (500 telefonów z serialami; 200 butelek whisky z partii 2024-001); sprzedaż tylko rezerwuje
/wydaje. Dla usług i produktów odroczonych — W MOMENCIE zamówienia/rezerwacji ("nie mamy 500
masaży na półce"); instancja = fakt, że zasób zostanie zużyty (klient Nowak, wizyta 14:00).

**Perspektywy na parę typ–instancja** (kto patrzy, to widzi):
- Producent: typ = specyfikacja/receptura/plan; instancja = fizyczny efekt planu (egzemplarz
  z taśmy, partia, butelka z danego rozlewu).
- Sprzedawca: typ = oferta w katalogu (co **obiecuje**); instancja = stan magazynu (co
  **realizuje**).
- Klient: typ = to, co przegląda i może zamówić; instancja = to, co otrzymuje.

Rozdzielenie definicji i wystąpienia: eliminuje dosłowność (jeden koncept zamiast stu klas),
porządkuje pojęcia (oferta vs realizacja), ułatwia integrację (wspólny język), czyni rozwój
spójnym ("nowy produkt to dane, nie kod").

### 5.3 Produkty vs usługi (L03, L04)

Rozróżnienie produkt/usługa z perspektywy oferty NIE ma znaczenia; przydaje się dopiero przy
dostarczaniu (wtedy sprzedawanym zasobem okazuje się np. czyjś czas → moduł Inventory).
W modelu **każda usługa to produkt**, bo każda jest mierzalna z natury: konsulting=godziny,
hotel=doby, solarium=minuty; usługi "za efekt" (hydraulik, wymiana opon) — albo zakładany czas,
albo na sztuki. Osobne `ServiceType`/`MeasuredProductType` (jak w literaturze MDA) prowadzą do
iloczynu kartezjańskiego przypadków. Granica i tak jest płynna: przesyłka (usługa) ma tracking,
wagę i statusy jak produkt; kredyt ma numer umowy i parametry; licencja ma numer, okres, status.
Zasada: **nie rozdzielaj produktów i usług, dopóki nie masz twardego powodu** (planowanie zasobów,
rezerwacje, SLA) — wtedy lekka specjalizacja, świadomie.

### 5.4 Identyfikowalność i śledzenie (L04)

**Strategie śledzenia** (`trackingStrategy` w ProductType): po numerze seryjnym (telefony,
samochody), po partii (mleko, leki), tylko ilościowo (ryż, woda, energia); strategie się łączą
(telewizor: serial + partia — kluczowe przy gwarancjach i kontroli jakości).

**Mierzalność**: każdy produkt jest mierzalny — iPhone na sztuki, mleko na litry, konsulting na
man-days'y, hotel na doby, gitara Hetfielda: dokładnie 1 sztuka. `preferredUnit` (a nie `unit`) —
sygnał, że możliwe są jednostki alternatywne (awokado: kg w hurcie, sztuki w detalu).

**Builder instancji egzekwuje reguły typu** — instancja "zna reguły swojego typu":
- śledzony indywidualnie (w tym unikat) → `SerialNumber` obowiązkowy;
- nieidentyfikowalny, ale z partii → `batchId` obowiązkowy;
- identyfikowalny i z partii → oba;
- typ nie przewiduje partii → nie da się jej dodać;
- weryfikacja zgodności jednostek typ–egzemplarz.
Efekt: reguły egzekwowane centralnie w modelu, nie w serwisach; błędne dane wyłapywane w momencie
konstrukcji, nie "po tygodniach w raportach jakości". Model "broni integralności wiedzy".

**Identyfikatory — podsumowanie**:
| Identyfikator | Rola |
|---|---|
| `ProductIdentifier` (interfejs) | CO to za produkt (typ). Implementacje branżowe: ISBN (książki), GTIN/kod kreskowy (retail — "skan i wiadomo o co chodzi"), UUID (usługi bez zewnętrznych standardów). |
| `SerialNumber` (interfejs) | KTÓRY egzemplarz. Identyfikator biznesowy; unikalność tylko LOKALNA w obrębie ProductType; formaty branżowe przez metody wytwórcze: `of` (tekst), `vin` (pojazd), `imei` (telefon) — walidacje w dedykowanych strukturach, nie wyciekają na frontend/serwisy. |
| `BatchId` (UUID) | Z KTÓREJ partii. |
| `ProductInstanceId` | Techniczny klucz spinający wszystko — konieczny, bo nie każdy produkt ma serial, a serial nie jest globalnie unikalny. |

**Batch** (partia) — osobny byt: `batchOf(product)`, ilość jako `Quantity` (100 sztuk albo 100
litrów), data produkcji, data przydatności (`useBy`), itd. — zestaw pól zależny od biznesu.

Interfejsy traktujemy jako narzędzie wyrażania abstrakcyjnych konceptów (zmienności), nie element
składni ("a jeśli język nie ma niczego do modelowania zmienności — zmień język").

### 5.5 Cechy i konfiguracja: FeatureType / FeatureInstance (L05)

- **`ProductFeatureType`** = definicja konfigurowalnej cechy: `name` (color, size, enginePower,
  expiryDate) + `constraint` (dozwolone wartości). "Nie tworzymy kolejnego pola w bazie — tworzymy
  język produktu", wspólny dla wszystkich branż.
- **`FeatureValueConstraint`** — "strażnik semantyki": mówi, jakiego rodzaju dane (enum
  `FeatureValueType` z konwersją tekst↔typ, potrzebny też do serializacji) i czy wartość poprawna.
  Implementacje bazowe:
  - `AllowedValuesConstraint` — zamknięta lista (rozmiary/kolory koszulek; biznes nie chce
    zielonych spoza katalogu),
  - `NumericRangeConstraint` — całkowite (okres lokaty 1–60 miesięcy; nie ma lokat na 0 msc),
  - `DecimalRangeConstraint` — dziesiętne (min. kwota lokaty; dopuszczalna waga przesyłki — jeden
    mechanizm, dwie branże; odrzuca "-5 kg" i "lokatę na 0 zł"),
  - `DateRangeConstraint` — daty (termin wizyty nie w przeszłości, data ważności leku; "interfejsom
    Startable/Endable mówimy dość"),
  - `RegexConstraint` — formaty tekstowe (kody partii ABC-2024-PL, wewnętrzne identyfikatory;
    walidacja w domenie, nie w kontrolerze),
  - `Unconstrained` — notatka lekarza, życzenia klienta; wciąż wiadomo, że to tekst.
  Katalog otwarty — rozszerzaj wedle potrzeb. Tworzenie przez metody kreacyjne.
- **`FeatureTypes`** — wrapper na cechy ProductType; każda cecha oznaczona jako **obowiązkowa lub
  opcjonalna** ("koszulka bez rozmiaru = błąd; bez nadruku = OK"). Definiowanie typu przez builder:
  stałe elementy wymuszone (id, nazwa, opis, jednostka, strategia), cechy dodawane płynnie.
- **`ProductFeatureInstance`** = typ + wartość ("ten egzemplarz ma kolor czerwony"); bez własnego
  ID — produkt ma maks. jedną cechę danej nazwy. Konstruktor zawiera **weryfikację reguł** —
  wartość walidowana względem constraintu definicji; walidacja na poziomie MODELU, nie aplikacji
  ("nie ma if-ów w kontrolerach"). Pilnuje kompletności: nie zbudujesz produktu bez cech
  obowiązkowych ani z cechą spoza definicji.
- Przykład lokaty: kwota 1000 zł–1 mln (obowiązkowa), okres 1–60 msc (obowiązkowy), kanał
  mobile/web/oddział (opcjonalny), segment nowy/istniejący/premium (opcjonalny). Instancja: umowa
  (serial), 12 msc, 50 tys. zł, kanał oddział; umowa na 61 msc → utworzenie się nie powiedzie.
- Bonus rozdzielenia definicji od instancji: wykrywanie niezgodności dostaw — zamówiono 150
  czarnych + 150 szarych koszulek, przyszło po 100 czarnych/szarych/granatowych; model odpowiada
  "ile produktów w magazynie nie spełnia definicji i jak".
- **Cechy zależne od siebie** (światła matrycowe tylko w wersji Sport; kolor karty tylko przy
  umowie >5 lat): opcja 1 — osobny produkt/pakiet z zawężonymi definicjami cech (ShortTermCredit:
  term 1–60 + cardColor grey; LongTermCredit: term 61–120 + pełna paleta); przy złożonych regułach
  grozi eksplozja kombinacji → problemy klasy **SAT/SMT** (patrz 5.7).

**Feature vs Metadata vs Default** (ważna tabela decyzyjna):
| Mechanizm | Semantyka | Przykłady | Reguła |
|---|---|---|---|
| `ProductFeatureType` | potencjalna zmienność, wybór klienta | kolor, okres lokaty, waga paczki | "na pewno będzie się zmieniać → feature" |
| `ProductMetadata` | tożsamość, definicja typu; pary klucz-wartość wspólne dla wszystkich instancji | waluta EUR lokaty walutowej, taryfa G11 = jednostrefowa dla gospodarstw domowych, OC Basic/usługowe/Kalifornia | "zmiana wartości = INNY produkt, nie inny wariant" |
| wartość domyślna (default) | cecha zmienna z sensownym punktem startowym (UX, bezpieczeństwo) | okres lokaty 12 msc, e-faktura, udział własny 1000 USD, SLA standard | nie definiuje produktu, przyspiesza konfigurację; rozszerzenie opcjonalne |

Feature z jedną dozwoloną wartością vs Metadata: efekt techniczny ten sam, semantyka inna —
w modelowaniu chodzi też o czytelność/elastyczność/rozszerzalność, nie tylko funkcję.

### 5.6 Trzy światy: definicja, katalog, inwentarz (L06)

Metafora Kremenaros (trójstyk granic): produkt żyje na styku trzech światów —
1. **ProductType** — czym coś JEST (świat analityków, architektów domenowych, product ownerów).
   Obejmuje też produkty niesprzedawane: techniczne (plany kont, typy rezerwacji), archiwalne
   (nieoferowane, ale wciąż rozliczane), eksperymentalne prototypy. Stabilny, zmienia się rzadko.
2. **CatalogEntry** — czy i JAK to sprzedajemy (świat sprzedaży/marketingu). Żyje kampaniami,
   sezonami, kanałami, językami. Pola: własne `id` katalogowe (NIE ProductIdentifier — to świat
   pokazywania, nie istnienia), `displayName` (nazwa marketingowa: "Lokata Premium 7,5% Online"
   zamiast "Deposit Account Type 2025"), `description` (tekst sprzedażowy, język kampanii),
   referencja do `ProductType` (bez duplikowania logiki — odwołanie do definicji i walidacji),
   `categories` (grupowanie/nawigacja/filtrowanie), `validity` (okres aktywności oferty; ta sama
   lokata w kampaniach Q1/Q2/Q3 z osobnymi okresami), `metadata` (kampanie, badge, kanały,
   priorytety, landing pages — nowa potrzeba marketingowa bez zmiany modelu). Analogia: producent
   mówi "model A5 2.0 TFSI 190 KM", salon mówi "A5 Sport Edition, rabat 10%, czarna".
3. **ProductInstance / InventoryItem** — co NAPRAWDĘ istnieje, jest na stanie, zostało sprzedane.
   Po "kup teraz" kończy się świat obietnic; dalsze problemy (stan, unikalność, audyt, rezerwacje,
   fulfillment) → moduł Inventory.

**Punkty wejścia**: `ProductFacade` ("biuro definicji" — tworzenie/modyfikacja ProductType przez
zespół produktowy) i `ProductCatalog` ("biuro sprzedaży" — publikacja/wycofywanie CatalogEntry
przez marketing). Katalog to **inteligentna warstwa wyszukiwania**: po typie, okresie oferty,
metadanych, cechach — "pokaż produkty premium w ofercie w tym tygodniu", "co jest w kampanii
Q4 2025", "oferty z currency=PLN i termInMonths=12" (patrzymy na definicje i możliwe wartości,
nie na instancje).

**Krotność CatalogEntry↔ProductType**: CatalogEntry wskazuje dokładnie jeden ProductType;
domyślnie **1:1** ("czysty model": prostota, jednoznaczność, łatwe raportowanie, proste API —
bankowość, telekom, e-commerce). **1:N** (zbiór typów pod jednym wpisem), gdy z punktu widzenia
klienta to jedno doświadczenie: "Masaż relaksacyjny 45 min" dla niezdecydowanych = operacyjnie
3 różne typy masaży. iPhone: 1:1 broni się i przy konfiguratorze, i przy wielu kafelkach
(osobne typy per konfiguracja albo jeden typ + frontend generuje kafelki z cech i inwentarza).
To decyzja **semantyczna**, nie techniczna: różnice biznesowe/kosztowe/operacyjne → rozdziel typy
i trzymaj 1:1. Wiele biznesów: definicja = oferta i to też jest OK ("jak gruba ma być kreska na
Twoim Kremenarosie").

### 5.7 Relacje między produktami (L07)

**Zamknięty język typów relacji** (enum — w przeciwieństwie do otwartego katalogu relacji
w Party; świat oferty jest stabilny i kontrolowany), każda z kierunkiem from→to:

| Typ | Znaczenie | Przykład | Charakter |
|---|---|---|---|
| `UPGRADABLE_TO` | podniesienie do wyższej wersji | standard → premium | rekomendacja up-sell |
| `SUBSTITUTED_BY` | zamiennik przy niedostępności | laptop 2023 → 2024 | informacja katalogowa |
| `REPLACED_BY` | wycofany, zastąpiony nowym | stara karta → nowa linia | komunikat marketingowy |
| `COMPLEMENTED_BY` | uzupełnienie w zestaw | konto → karta + ubezpieczenie | rekomendacja cross-sell |
| `COMPATIBLE_WITH` | współdziałanie techniczne/funkcjonalne | licznik A ↔ taryfa G11 (nie G12) | informacja katalogowa |
| `INCOMPATIBLE_WITH` | wykluczenie | Business Premium wyklucza Consumer Basic | miękkie wykluczenie |

**`ProductRelationship`** = osobny byt: `id`, `from`, `to`, `type`.

**Symetria**: większość relacji asymetryczna — kierunek jest częścią sensu (upgrade bez powrotu
w dół; REPLACED_BY to ruch jednostronny w czasie). `COMPLEMENTED_BY` zdradliwe: pozornie
symetryczne, ale intencja jednostronna — "to burger ciągnie cross-sell", kierunek mówi, kto jest
inicjatorem/produktem bazowym. `COMPATIBLE_WITH` bywa symetryczne z natury → decyzja: jedna
relacja logicznie dwukierunkowa albo dwie lustrzane (ew. polityka auto-tworząca parę). Systemy
sprzedażowe → jawnie asymetryczne; techniczne konfiguratory → symetryczne (szukanie "wszystko, co
działa z tym"). **Asymetria jest uniwersalniejsza**: z dwóch asymetrycznych złożysz symetryczną;
odwrotnie się nie da. Najważniejsza konsekwencja.

**Gdzie trzymać relacje**: NIE w ProductType (ani from, ani to, ani obie strony) — przy tysiącu
produktów i dziesiątkach tysięcy relacji każde zapytanie ładuje całą sieć, każda zmiana blokuje
encję, typ puchnie. Relacje = **niezależny byt z własnym repozytorium, ID i życiem**; ProductType
nic o nich nie wie. Dodawanie relacji bez zmiany produktu; usuwanie produktów bez "blokowania
świata".

**Spójność — eventual consistency wystarcza**, bo relacje to **metadane biznesowe** (wskazówki,
rekomendacje, kontekst sprzedaży), nie twarde reguły transakcyjne. Scenariusze: usunięto "kawę
dużą" o 10:00, relacja upgrade żyje do przebiegu procesu czyszczącego (11:00) → stracona
propozycja sprzedażowa przez godzinę, nic więcej (nie pasuje — synchronizuj co minutę albo
eventowo). INCOMPATIBLE ustawione 14:00, propagacja 5 minut → klient przez chwilę może
skonfigurować konflikt, system wykryje go przy aktywacji/walidacji asynchronicznej. Zysk: wysoka
dostępność, przepustowość, prosty model — katalog nie staje się "transakcyjnym potworkiem".

**Polityki tworzenia relacji** (`ProductRelationshipDefiningPolicy`, interfejs funkcyjny) — bo
`new ProductRelationship(...)` to złudzenie prostoty; tworzenie relacji podlega regułom
biznesowym, których nie wyrazi struktura danych: w bankowości konto premium nie jest upgrade'em
konta dziecka, ubezpieczenie komunikacyjne nie jest upgrade'em polisy na życie; w telekomie plan
rodzinny komplementarny z internetem domowym, nie firmowym, maks. 5 kombinacji; w energetyce
kompatybilność licznika z taryfą wymaga certyfikacji; w e-commerce zamiennik tylko w tej samej
kategorii ("nie zamienisz roweru na mikser"). Przykłady: `NoCyclicUpgradePolicy` (zakaz relacji
odwrotnej/cyklu w ścieżce upgrade'ów), polityki oparte o atrybuty/metadane produktów
(sezonowość — czy produkt może współdziałać z produktami innego sezonu), limity dodatków ("burger
maks. 5 dodatków"), zgodność serii (adapter tylko z wózkiem tej samej serii). Egzekwowanie ZAWSZE
przez **fabrykę** — nie if-y w fasadach ("kiedy jeden developer zapomni, model się rozjedzie";
"chcemy, żeby model pamiętał za człowieka"). Fasada woła fabrykę; fabryka pyta polityki.

### 5.8 Warunki stosowalności (L08)

"Nie dla psa kiełbasa" — ograniczenia prawne, biznesowe, kanałowe, operacyjne: kraj (licencja,
VAT, regulator), kanał (tylko mobile — integracja, identyfikacja), typ klienta (B2B/B2C), wiek
(produkty medyczne), sezon, status (premium).

Model:
- **`ApplicabilityContext`** — rekord z parametrami sytuacji: kraj, kanał, typ klienta, pora dnia,
  data, status umowy — cokolwiek ma sens; model nie zna ich z góry.
- **`ApplicabilityConstraint`** — interfejs warunku logicznego z `isSatisfiedBy(context)`;
  metody pomocnicze (equals, greaterThan, lessThan, in...); kompozycja operatorami **and / or /
  not** w złożone wyrażenia boolowskie. Przykład: (kraj ∈ {PL, DE}) AND (wiek > 18) AND
  (kanał ≠ desktop). Polski 25-latek → aplikowalne; 17-letni Niemiec → nie.
- Reguła przypięta do **ProductType** (przez builder), gdy warunek jest częścią definicji
  produktu (ubezpieczenie tylko dla pełnoletnich z PL/DE; abonament premium tylko mobile; polisa
  senior 60+). **ProductType sam odpowiada, czy ma sens w kontekście** — nie kontroler, nie
  serwis, nie SQL.
- Alternatywnie reguły w **CatalogEntry**, gdy wynikają z kontekstu sprzedaży (katalog, kampania,
  kanał dystrybucji): ten sam "Ubezpieczenie podróżne standard" w trzech katalogach — Online B2C
  (pełnoletni indywidualni), Agent B2B (firmy z licencją), Promo Winter (tylko grudzień–styczeń).
  ProductType zostaje stabilny semantycznie, CatalogEntry konfigurowalny i dynamiczny; ograniczenia
  ofertowe zarządzane bez dotykania modelu produktu.
- To w istocie **mały silnik logiki boolowskiej** — fundament pod SAT (czy istnieje przypisanie
  spełniające wszystkie reguły?) i SMT (plus prawa arytmetyki/czasu/dat) — rodzina problemów, na
  której działają konfiguratory Tesli, planery tras lotniczych, silniki pakietów ubezpieczeń.
  Nie po to, by pisać solver, lecz by widzieć potencjał: silnik reguł konfiguracyjnych,
  rekomendator, walidator zestawów, asystent sprzedaży.

### 5.9 Produkty złożone i pakiety (L09)

- **`PackageType`** — definicja pakietu: nie "lista produktów", tylko **lista grup wyboru**
  (`ProductSet`) + reguły selekcji (`SelectionRule`). Motywacja: często nie chcemy dosłowności
  ("przesyłka M musi mieć ubezpieczenie od kradzieży na 500 zł"), tylko możliwości ("każda
  przesyłka musi mieć COŚ z listy ubezpieczeń: standard, premium albo partnera").
- **`ProductSet`** — grupa równoważnych opcji; "zbiór możliwych decyzji, nie lista składników".
- **`SelectionRule`** — jak wolno wybierać; każda reguła umie sprawdzić poprawność aktualnego
  wyboru:
  - zakresowa min–max: (1,1) dokładnie jeden (plan taryfowy); (0,1) opcjonalny; (0,2) do dwóch
    akcesoriów; (1,∞) co najmniej jeden. Dla wielu biznesów wystarcza. Metody kreacyjne:
    `isSubsetOf`, `optional`, `required`;
  - **warunkowe**: "jeśli wybrano konto firmowe → dokładnie jedna karta firmowa"; "5G Unlimited
    wyklucza Extra Data 10 GB"; "International Express wymaga ubezpieczenia Extended lub Partner";
  - logiczne kombinatory: `AndRule`/`OrRule`/`NotRule` (+ dalsze operatory) → dowolne kombinacje.
- **Pakiet JEST produktem — wzorzec kompozyt.** Eksperyment myślowy: paczka ma identyfikator,
  nazwę/opis, metadane, kategorie, reguły aplikowalności, sens śledzenia (batch/serial) — jak
  produkt. Nie przenosi się: `unit` (pakiet zawsze "liczba zestawów" — awokado na sztuki +
  ziemniaki na kg nie mają wspólnej miary) i `FeatureTypes` całości (to suma cech składników).
  Trzy opcje implementacji:
  1. opcjonalne pole `PackageStructure` w ProductType — "sprytny hack, który brzydko się
     starzeje": w 95% puste, wszędzie `orElseThrow`, martwe pola;
  2. dziedziczenie PackageType extends ProductType — "pan od UML-a szczęśliwy", ale semantyczny
     zgrzyt: pakiet to INNY rodzaj produktu, nie bardziej szczegółowy; pola Unit/FeatureType bez
     sensu → półmartwa struktura;
  3. **wspólny interfejs `Product`** (wybrane): ProductType waliduje cechy i parametry,
     PackageType waliduje strukturę i wybory — dwa światy operacyjne, każdy ma tylko to, czego
     potrzebuje; type safety (`validateSelection` tylko w PackageType); rozszerzalność
     (SubscriptionProduct, BundleProduct... bez dotykania istniejących klas). PackageType zawiera
     Product-y → pakiety z produktów, pakiety z pakietów, dowolne miksy (retail: Office Setup =
     Hardware Package {laptop, monitor} + Software Package {Office 365, antywirus}; bank: pakiet
     premium = konto standard + pakiet ubezpieczeń premium + concierge).
- **Instancje**: wspólny interfejs `Instance` dla `ProductInstance` i `PackageInstance`
  ("bliźniaki — to samo DNA"). Obie identyfikowalne, mogą mieć serial/partię; instancja produktu
  ma cechy i ilość (pakiet niekoniecznie); pakiet ma listę **`SelectedInstance`** = (instancja,
  ilość) — "świadomy wybór: TEN egzemplarz z magazynu, z serialem i BatchId, jest częścią TEJ
  paczki w takiej ilości" → PackageInstance odzwierciedla rzeczywisty stan, nie strukturę
  z katalogu.
- **Walidacja pakietu**: `SelectedInstance.toSelectedProduct()` — pomost instancja→definicja;
  SelectionRule nie interesują seriale/cechy/partie, patrzy na typy; PackageInstance mapuje
  wybory na SelectedProduct i odpala walidację z PackageType. Spójność bez duplikacji logiki
  i mieszania poziomów abstrakcji: "paczka jest poprawna tylko wtedy, gdy jej faktyczna zawartość
  odpowiada definicji".
- Builder PackageInstance: przy `build()` waliduje typ względem instancji, konwertuje do
  SelectedProduct, sprawdza tracking/serial/batch — "żadnych if-ów, żadnej duplikacji".
- Skoro pakiet jest produktem, **wszystko działa dla niego tak samo**: CatalogEntry, wyszukiwarka,
  metadane, wersjonowanie, widoczność per kanał, relacje (pakiet premium UPGRADABLE_TO z pakietu
  standard; pakiet Business Plus wymaga ubezpieczenia korporacyjnego). "Model nie robi wyjątków
  i właśnie dlatego jest prawdziwie uniwersalny."
- Przykład czytelnej specyfikacji (logistyka, "Transport Premium"): dokładnie 1 transport
  (krajowy|międzynarodowy); dokładnie 1 ubezpieczenie (standard|rozszerzone|partnerskie); do 2
  dodatków (chłodnia, odbiór od klienta); obowiązkowy moduł śledzenia (systemowy|aktywny GPS+
  czujniki temperatury — podpakiet z jedną obowiązkową opcją); opcjonalne powiadomienia (SMS lub
  webhook do ERP partnera w B2B — podpakiet 0..1); reguła: transport międzynarodowy → ubezpieczenie
  standard niedozwolone. Wszystko w modelu domenowym — "nie w JSON-ie, nie w konfiguracji systemu
  sprzedażowego" — spójne, testowalne, rozszerzalne.

### 5.10 Produkty niematerialne i usługowe (L10)

"Produkty nieoczywiste": plik konfiguracyjny, harmonogram, plan, taryfa, odsetki, spłata
wierzytelności — wszystko, co ma reguły, parametry, skutki operacyjne/finansowe i sens biznesowy.
Produkt to także to, co firma **wykonuje, konsumuje, rozlicza i kontroluje**.

**Medycyna** — sprzedaje się czas, uwagę i wiedzę ludzi wsparte sprzętem i procedurami:
- cechy: czas trwania (5–90 min), specjalizacja lekarza (kardiolog|internista);
- metadane (nieparametryzowalne, definicyjne): aparatura, kategoria, wymóg bycia na czczo;
- warunki stosowalności: pacjent pełnoletni; świadczenie w określonym oddziale; dostępny sprzęt;
- każda procedura śledzona **indywidualnie** — brak wymienności i partii, "każde badanie jest
  osobnym faktem w historii pacjenta";
- produkty: EKG (kardiologia, sprzęt EKG-12CH, bez czczo), glukoza (laboratorium, analizator
  biochemiczny, na czczo, instancja per próbka), profil lipidowy (inny analizator, typ lipid),
  echo serca (ECHO-SONO-V5, imaging, wymaga kardiologa, zapis obrazu), konsultacja kardiologiczna
  (usługa — "nie różni się od badania z perspektywy systemu");
- pakiet badań krwi = "faktyczna struktura kliniczna, nie marketingowy bundle" — dwa badania
  z jednej próbki, spójność czasu/próbki/pacjenta;
- relacje = logika kliniczna zamiast kodu procesowego: konsultacja WYMAGA badań krwi i EKG,
  REKOMENDUJE echo przy nieprawidłowych wynikach; ścieżki diagnostyczne jako produkty złożone;
  pakiet podstawowy UPGRADABLE_TO rozszerzony (z echo, jeśli sprzęt dostępny).
- Podsumowanie ról: metadane mówią CZYM coś jest, cechy — JAK parametryzować, constrainty —
  KIEDY ma sens, relacje — JAK łączy się w proces.

**Model jako graf**: wierzchołki = produkty/pakiety, krawędzie = powiązania (co wymaga czego, co
zawiera co). Możliwości: wykrywanie **cykli** (pętle zależności pakietów = niemożliwość
realizacji), **kolorowanie** (przydział zasobów bez konfliktów — lekarz i sprzęt EKG nie mogą być
jednocześnie u dwóch pacjentów), **najkrótsza ścieżka** (optymalna kolejność badań z uwzględnieniem
dostępności sprzętu/personelu), **symulacje** (co jeśli zabraknie sprzętu / lekarz zachoruje; co
jeśli pacjent ma tylko pakiet podstawowy), **plan vs wykonanie** (diagnoza rozbieżności, dynamiczna
modyfikacja planu). Więcej w module o grafach.

**Windykacja** — "nikt nie patrzy na raty jak na produkty", a jednak:
- **rata** — produkt z kwotą, naliczonymi odsetkami, terminem płatności, statusem; każda rata
  śledzona indywidualnie;
- **odsetki** — produkt powstający przy opóźnieniu, wysokość zależna od terminu zapłaty;
- **monit** — produkt-przypomnienie generowany ze statusu płatności; śledzimy wysyłki i skutki;
- **koszty** — administracyjne, wysyłka pism, prace terenowe, koszty sądowe, zaliczki komornicze —
  też produkty ("kierunek przepływu pieniędzy nie determinuje, czy coś jest produktem"; tak jak
  zniżki, zwroty, korekty);
- **ugoda** — pakiet (raty + odsetki + monity) — "realny zestaw działań zgodny z literą prawa";
- cechy długu: kwota należna, stopa oprocentowania, termin płatności, status płatności;
- relacje: monit WYMAGA aktywnej ugody; ugoda REKOMENDUJE spłatę w ratach.
Morał: "jakbyś się nie starał traktować biznesu wyjątkowo, i tak skończysz ze straganem
sprzedającym gacie" — w każdym biznesie produkty w końcu się znajdą.

---

## 6. Typowe błędne implementacje i konsekwencje

| Antywzorzec | Objaw w kodzie | Konsekwencje |
|---|---|---|
| Klasa per oferta (dosłowność) | `Goods`, `Mortgage`, `Parcel`, `Appointment`; niespójne słownictwo id/SKU/kod, price/amount/value | fragmentacja, dublowanie logiki, integracje jako tłumaczenie, nowa oferta = deploy; system "symuluje" ofertę |
| Definicja zmieszana z instancją | jedna tabela `mortgage` z customerId i oprocentowaniem | tysiące kopii oferty; zmiana oferty = edycja tysięcy rekordów; nie wiadomo, co jest ofertą, a co realizacją; raporty-zgadywanki |
| Opisy poza modelem | constants na froncie, YAML, CMS | system nie wie, czym jest to, co obsługuje; brak wyszukiwania i porównywania |
| Cechy jako kolumny | dziesiątki pól, enum tu / string tam | nowa cecha = migracja + deploy; brak porównywarki; wariant = mini-projekt IT |
| Brak jednostek/partii | pole ilości bez jednostki; brak pojęcia batch | raport "5000 czego?"; brak traceability, wycofań z rynku, kontroli jakości |
| Relacje jako pola i if-y | `creditCardNumber` w koncie; null-checki sterujące procesem | encja-centrum wszechświata; "dwa sprinty" na pakiet; reguły w pamięci ludzi; system kruszy się zamiast rosnąć |
| Aplikowalność rozsiana | if-y w kontrolerach/serwisach/SQL per kanał | rozjazd mobile/web/backend/raporty; biznes traci kontrolę nad tym, co obowiązuje; spójność = iluzja |
| Pakiet przez doklejanie | pola karty/polisy/SMS w produkcie kluczowym | spaghetti relacji; zmiana składu = development; błędy rozliczeń elementów o różnych cyklach życia |
| ServiceType obok ProductType | osobne hierarchie usług/produktów/mierzalnych | iloczyn kartezjański przypadków, wyjątki, złożoność |
| PackageStructure jako Optional w ProductType | `orElseThrow` wszędzie, martwe pola | "sprytny hack, który brzydko się starzeje" |
| Pakiet przez dziedziczenie | PackageType extends ProductType | półmartwa struktura — Unit/FeatureTypes bez sensu dla pakietu |
| Relacje w ProductType | listy upgradable/complemented w encji typu | ładowanie całej sieci przy każdym zapytaniu, blokowanie encji, puchnący typ |
| Walidacje poza domeną | reguły w kontrolerach, skryptach, dokumentacji | "jeden developer zapomni i model się rozjedzie"; błędy wychodzą po tygodniach w raportach jakości |
| Produkt jako wspólna biblioteka | shared lib z klasami produktowymi | sprzężenie binarne (zmiana dotyka wszystkich konsumentów), rozmyta odpowiedzialność, brak persystencji/historii/audytu (model produktów jest STANOWY), rozjazd znaczeń per kontekst |

---

## 7. Miejsce w architekturze i integracje z innymi archetypami (L11)

Produkt to **fundamentalny byt architektoniczny** i generyczna capability — ta sama mechanika
(typy, cechy, constrainty, relacje, paczki) w każdej branży: sklep (towary, usługi), bank (konta,
lokaty, kredyty, odsetki), telekom (pakiety, taryfy, minuty, GB), energetyka (moc, taryfa,
przyłącze), logistyka (przesyłki, transporty, rezerwacje przestrzeni), windykacja (raty, koszty,
odsetki, ugody). "Coś można zaoferować, skonfigurować, ograniczyć i zrealizować."

**Nie biblioteka, lecz serwis/moduł**: własne API, własna baza, własny zespół — **jeden punkt
prawdy** o tym, co w firmie istnieje jako produkt. Serwis nie wie, PO CO ktoś użyje produktu; wie
tylko, CZYM produkt jest (cechy, relacje, ograniczenia, dostępność). Dzięki temu jest
**upstreamem** (w sensie strategicznego DDD) dla wszystkich procesów zarabiających pieniądze.
Powody przeciw bibliotece: sprzężenie binarne, rozmyta odpowiedzialność, brak persystencji
(model stanowy — historia, wersje, audyt, integralność; "biblioteka niczego nie pamięta"),
zależności kontekstowe (każdy zespół rozumie produkt inaczej).

Mapa integracji:

| Archetyp / moduł | Kierunek | Charakter integracji |
|---|---|---|
| **Party** | Product zależy od Party | Party dostarcza kontekst: kto kupuje, kto świadczy, kto autoryzowany ("tylko lekarz wykonuje echo"); dane Party zasilają reguły applicability ("pacjent 18+", "klient premium") |
| **Pricing** | osobny archetyp, ścisły związek | produkt = CO oferujemy (semantyka); cennik = ZA ILE i na jakich zasadach (ekonomia); w wielu firmach utożsamiane — tu celowo rozdzielone |
| **Billing** | downstream | rozlicza konkretne typy, instancje, pakiety — "nie liczy w próżni"; produkt mówi Billingowi CO rozliczać |
| **Accounting** | za Billingiem | Billing mówi Accountingowi, ILE i JAK zaksięgować; produkt określa sposób księgowania |
| **Ordering** | downstream | katalog produktów jest upstreamem zamówień — co można sprzedać i skonfigurować |
| **Inventory** | downstream | odbiorca definicji: zna typy i instancje, śledzi stronę fizyczną (dostępność, ilość, lokalizacja); NIE tworzy definicji |
| **Fulfillment / operacje** | downstream | cykl życia realizacji (nadana/w drodze/dostarczona) poza katalogiem, ale sterowany definicją produktu |
| **CRM / promocje / loyalty / analityka** | downstream | konsumenci katalogu; produkt definiuje, jakie dane zbierać i co mierzyć |

Zasada czystości: produkty mogą zależeć od generycznych bytów (Party, Pricing), ale **nie powinny
przeciekać ich logiką** — mają pozostać czyste, uniwersalne, autonomiczne.

Zarządzanie produktami jako proces (sygnalizowane, nie implementowane w kursie): akceptacja
i publikacja zmian, wersjonowanie typów, historia zmian i ich wpływ, daty ważności (produkty
aktywne okresowo), zależności między wersjami (co zastępuje co, co wycofano), rozszerzenia
branżowe, workflow z akceptacjami.

Wpływ na aspekty niefunkcjonalne: **wydajność wytwórcza** (nowa oferta = definicja, nie kod),
**skalowalność** (jeden katalog zasila procesy/rynki/kanały), **elastyczność** (zmieniasz
constrainty i relacje, nie logikę procesów), **audytowalność** (historia, wersja, obowiązywanie,
kontekst decyzji), **compliance** (constrainty prawne częścią modelu, "nie komentarzem w BPMN-ie"),
**spójność semantyczna** (sprzedaż, billing, fulfillment rozumieją to samo słowo "produkt").

---

## 8. Cztery perspektywy (L12) — co kto zyskuje z jawnego modelu produktu

1. **Analityk — zyskuje język.** Nie pyta developera "gdzie ta reguła" — ma ją w produkcie,
   z constraintami, parametrami i relacjami; rozumie system bez jego rozbierania.
2. **Biznes — zyskuje przewidywalność.** Zmiana oferty bez developmentu; reakcja na rynek, nie na
   backlog IT; nowy pakiet = edycja w katalogu, nie projekt wdrożeniowy.
3. **Programista — zyskuje spokój.** Jeden spójny, wielozadaniowy model zamiast kilkunastu
   definicji po aplikacjach; modeluje constrainty zamiast pisać wyjątki; powiązania w relacjach,
   nie w kodzie; generyczne typy, testowalność, bezpieczeństwo.
4. **Architekt — zyskuje ład.** Wiadomo, gdzie upstream, gdzie szukać prawdy, kto definiuje
   produkt, a kto go konsumuje; "nie pajęczyna usług, tylko warstwowy system, w którym wszystko
   ma sens".

Dodatkowe przesłania L12:
- "Nie szukaj tabeli Product — słuchaj, jak mówią ludzie": ugoda, pakiet, abonament, plan, limit,
  rata, opłata, bonus to produkty w przebraniu; w medycynie — świadczenie, w telekomie — taryfa,
  w bankowości — plan spłaty, w logistyce — zlecenie. Tabela "słów-masek" to mapa mentalna, nie
  glosariusz: każdy taki zwrot to moment, w którym system robi coś z sensem, regułami, parametrami
  i skutkami — czyli moment narodzin produktu.
- Przed modelem: chaos semantyczny, reguły zakodowane w procesach, zmiana oferty = deployment/
  regresja/patch/rollout. Po: język biznesu = język systemu; zmiana oferty = decyzja biznesowa.
- **Adopcja selektywna**: nie musisz używać wszystkiego ani nazewnictwa archetypu — salon masażu
  może mówić MassageType/MassageInstance; krytyczne minimum to **oddzielenie definicji od
  instancji**; przy dziesiątkach/setkach usług dosłowność kończy się chaosem. "Archetypy to sposób
  modelowania, nie gotowa receptura."
- "Model produktów nie powstał po to, żeby sprzedawać. Powstał po to, żeby rozumieć." Produkty to
  zdolność organizacji do rozumienia samej siebie; upstream dla wszystkiego, co zarabia pieniądze.

---

## 9. Tabela mapowania: pojęcie domenowe → element archetypu

| Pojęcie z modułu | Element modelu | Uwagi |
|---|---|---|
| "Paczka 24h" / rodzaj przesyłki | ProductType | definicja usługi transportowej |
| Konkretny przewóz PKG-2024-123 | ProductInstance | serial = numer trackingowy |
| Oferta kredytu hipotecznego banku | ProductType | np. z metadanymi segmentu |
| Umowa kredytowa Kowalskiego HYP-2024-... | ProductInstance | serial = numer umowy |
| iPhone 15 Pro 256 GB (model) | ProductType + GTIN | ProductIdentifier = GtinProductIdentifier |
| iPhone o numerze C02X... | ProductInstance + SerialNumber | śledzenie indywidualne |
| Książka | ProductType + ISBN | identyfikator branżowy |
| Numer VIN / IMEI | SerialNumber (implementacje `vin`/`imei`) | walidacja w strukturze, unikalność lokalna w typie |
| Partia mleka 1000 l, przydatność do... | Batch (batchOf, Quantity, useBy) + BatchId | typ batchTracked |
| Gitara Hetfielda / Dama z gronostajem | unikat: instancja ≡ definicja | strategia unique, ilość = 1 szt. |
| Ryż, energia, gwoździe | produkt identyczny, śledzony ilościowo | Quantity + Unit; partie dla traceability |
| Godzina konsultingu, doba hotelowa, minuta solarium | usługa jako produkt mierzalny | Unit = czas; usługa "za efekt" → sztuki |
| Subskrypcja internetu (miesiąc) | ProductInstance per okres | Unit.months, serial = numer umowy |
| Kolor, rozmiar, moc silnika, okres lokaty | ProductFeatureType + constraint | AllowedValues / NumericRange / DecimalRange / DateRange / Regex / Unconstrained |
| "Ten egzemplarz: czerwony, M" | ProductFeatureInstance | walidacja względem constraintu w konstruktorze |
| Waluta EUR lokaty walutowej, taryfa G11, OC Basic/Kalifornia | ProductMetadata | tożsamość typu; zmiana = inny produkt |
| "Zwykle 12 miesięcy", e-faktura, udział własny 1000 USD | wartość domyślna cechy | UX, nie definicja |
| "Lokata Premium 7,5% Online, tylko do końca marca" | CatalogEntry (displayName, validity, metadata kampanii) | ProductType bez zmian |
| "Masaż relaksacyjny 45 min" (3 masaże pod spodem) | CatalogEntry 1:N z ProductType | decyzja semantyczna |
| "Standard można podnieść do premium" | ProductRelationship UPGRADABLE_TO | up-sell, asymetryczne |
| "Laptop 2023 zastępowany przez 2024" | SUBSTITUTED_BY | informacja katalogowa |
| "Stara karta wycofana na rzecz nowej" | REPLACED_BY | jednostronne w czasie |
| "Do konta: karta i ubezpieczenie" | COMPLEMENTED_BY | cross-sell; kierunek = inicjator |
| "Licznik A działa z taryfą G11" | COMPATIBLE_WITH | ew. symetria przez parę lustrzaną / politykę |
| "Business Premium wyklucza Consumer Basic" | INCOMPATIBLE_WITH | miękkie wykluczenie, eventual consistency |
| "Nie można zrobić cyklu upgrade'ów" | ProductRelationshipDefiningPolicy (NoCyclicUpgradePolicy) + fabryka | egzekwowanie zawsze |
| "Tylko PL/DE, 18+, nie desktop" | ApplicabilityConstraint and/or/not + ApplicabilityContext | na ProductType (definicja) lub CatalogEntry (kontekst sprzedaży) |
| "Promo Winter tylko grudzień–styczeń" | ApplicabilityConstraint na CatalogEntry | ten sam ProductType, trzy katalogi |
| "Konto + karta + ubezpieczenie", "Transport Premium" | PackageType (ProductSet + SelectionRule) | kompozyt przez interfejs Product |
| "Ubezpieczenie: standard, premium lub partnera" | ProductSet + reguła (1,1) | grupa wyboru, nie konkretny produkt |
| "Jeśli transport międzynarodowy → standard niedozwolone" | warunkowa SelectionRule | + AndRule/OrRule/NotRule |
| Sprzedany zestaw z konkretnymi egzemplarzami | PackageInstance + SelectedInstance(instance, quantity) | walidacja przez toSelectedProduct → reguły PackageType |
| Badanie EKG, glukoza, echo serca, konsultacja | ProductType (indywidualnie śledzone) + metadane sprzętu + applicability | medycyna; pakiet badań krwi = PackageType |
| "Konsultacja wymaga badań, rekomenduje echo" | relacje produktów = logika kliniczna | ścieżka diagnostyczna jako produkt złożony |
| Rata, odsetki, monit, koszt sądowy, zaliczka komornicza | ProductType/ProductInstance | windykacja; koszty też są produktami |
| Ugoda windykacyjna | PackageType (raty+odsetki+monity) | "monit wymaga aktywnej ugody" |
| SLA dobierane przez system, SMS charge'owany osobno | produkty w katalogu, dopinane do pakietu wysyłki | scenka 2: klient nie musi wybierać, by coś było produktem |
| Sieć zależności produktów | graf: wierzchołki=produkty/pakiety, krawędzie=relacje | cykle, kolorowanie (zasoby), najkrótsza ścieżka, symulacje, plan vs wykonanie |

---

## 10. Pytania do biznesu przy odkrywaniu archetypu Product

Identyfikacja ukrytych produktów:
1. Co klient od was otrzymuje — i co dostaje "przy okazji" (powiadomienia, ubezpieczenia, SLA,
   opłaty), nawet jeśli tego nie wybiera?
2. Co w waszym biznesie ma reguły, parametry i skutki finansowe lub operacyjne, choć "nie jest
   sprzedawane"? (raty, odsetki, monity, koszty, taryfy, plany, limity, bonusy)
3. Jakich słów używacie? (ugoda, pakiet, abonament, plan, taryfa, świadczenie, zlecenie, opłata —
   słowa-maski produktów)
4. Sprzedaż czego zmienia stan waszych zasobów — magazynu, kalendarza, ludzi, pieniędzy,
   przestrzeni? Jak?

Natura i śledzenie (poziomy 1–2):
5. Czy to, co oferujecie, ma jeden rozmiar czy wiele? Czy rozmiar/waga/parametry na coś wpływają
   (cena, logistyka, zasoby)? (pytania Bartka ze scenki 1)
6. Czy egzemplarze są rozróżnialne (numer seryjny), rozróżnialne partiami, czy całkiem wymienne
   (tylko ilość)? Czy któreś łączą obie strategie (serial + partia — gwarancje, jakość)?
7. W jakich jednostkach to mierzycie? Czy w różnych kanałach inaczej (hurt kg / detal sztuki)?
   Potrzebna konwersja?
8. Kiedy powstaje konkretny egzemplarz: przy produkcji/przyjęciu na magazyn, czy dopiero przy
   zamówieniu/rezerwacji?
9. Czym różni się wasza oferta (definicja) od tego, co już sprzedano (realizacje)? Gdy zmieniacie
   warunki oferty, co dzieje się z istniejącymi umowami/przesyłkami?
10. Które oprocentowanie/cena/warunek jest "tym aktualnym"? Skąd to wiadomo?

Cechy i warianty (poziom 3):
11. Co klient może wybrać/skonfigurować, a co jest stałe dla produktu? (feature vs metadata:
    "czy zmiana tej właściwości to inny wariant, czy już inny produkt?")
12. Jakie wartości są dozwolone — lista, zakres liczbowy, zakres dat, format, dowolny tekst?
    Które cechy obowiązkowe, które opcjonalne? Czy są sensowne wartości domyślne?
13. Czy jakieś cechy zależą od innych ("X dostępne tylko przy Y")? Jak bardzo złożone są te
    reguły (ryzyko eksplozji kombinacji → SAT/SMT)?
14. Jak szybko chcecie móc dodać nową cechę/wariant — czy ma to wymagać programisty?

Relacje (poziom 4):
15. Które produkty nie mogą istnieć bez innych? Które się wykluczają? Które są zamiennikami,
    upgrade'ami, wycofaniami, dodatkami cross-sell?
16. Czy te zależności są kierunkowe (kto jest produktem bazowym/inicjatorem)? Jakie reguły
    biznesowe ograniczają łączenie (kategorie, segmenty, serie, sezony, limity liczby dodatków)?
17. Gdzie dziś żyją te reguły — w kodzie, Excelu, umowach, głowach?
18. Czy chwilowa nieaktualność rekomendacji/relacji jest akceptowalna (eventual consistency),
    czy któraś relacja jest twardym niezmiennikiem transakcyjnym?

Stosowalność (poziom 5):
19. Dla kogo, gdzie, kiedy i przez jaki kanał produkt jest dostępny? (kraj, wiek, segment,
    B2B/B2C, sezon, status klienta, wymogi prawne/licencyjne)
20. Czy te warunki są częścią samego produktu, czy kontekstu sprzedaży (kampania, katalog,
    kanał)? Kto ma móc je zmieniać bez IT?
21. Czy wszystkie kanały (mobile, web, oddział, raporty) egzekwują dziś te same reguły? Gdzie
    się rozjeżdżają?

Pakiety (poziom 6):
22. Co sprzedajecie w zestawach? Czy zestaw to konkretne produkty, czy grupy możliwości
    ("coś z tej listy")? Ile elementów wolno/trzeba wybrać z każdej grupy?
23. Czy wybór w jednej grupie wymusza/wyklucza wybór w innej?
24. Czy pakiety zawierają inne pakiety? Czy pakiet bywa upgrade'em innego pakietu?
25. Czy elementy pakietu mają własne cykle życia, cenniki i rozliczenia (różni właściciele)?
    Jak dziś rozliczacie sprzedany zestaw — jako całość czy elementy?

Katalog i architektura:
26. Czy odróżniacie definicję produktu od tego, jak jest oferowany (nazwa marketingowa, kampania,
    okres dostępności, kanał)? Czy ta sama definicja bywa w kilku ofertach naraz?
27. Czy z punktu widzenia klienta kilka waszych wewnętrznych produktów to jedno doświadczenie
    (przesłanka za CatalogEntry 1:N)?
28. Kto jest właścicielem prawdy o produktach? Które systemy ją konsumują (ordering, billing,
    inventory, CRM, analityka) i czy któryś z nich definiuje produkty "po swojemu"?
29. Czego potrzebujecie od zarządzania definicjami: wersjonowanie, akceptacje, publikacje, daty
    obowiązywania, historia zmian, audyt, wymogi compliance?
30. Ile czasu dziś zajmuje wprowadzenie nowego produktu/wariantu — i ile powinno? (miara chaosu:
    "biznes chce w tydzień, IT potrzebuje miesiąca")

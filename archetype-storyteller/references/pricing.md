# Archetyp Pricing (Valuation) — materiał referencyjny

Źródło: moduł M03 szkolenia o archetypach oprogramowania (lekcje L01–L11 + scenki).
Przeznaczenie: referencja dla agenta AI rozpoznającego i stosującego archetyp Pricing
w wymaganiach domenowych i kodzie.

---

## 1. Esencja archetypu — rola ceny jako wartości biznesowej

Teza fundacyjna modułu: **cena nie jest liczbą — jest funkcją i decyzją**. Pole `price`
w tabeli działa dokładnie tak długo, jak biznes jest prosty, przewidywalny i statyczny —
czyli w praktyce bardzo krótko. W rzeczywistości ceny:

- zmieniają się w czasie (pora dnia, dzień tygodnia, sezon, promocja, kampania),
- zależą od kanału, miejsca, segmentu klienta, parametrów użycia, a czasem od negocjacji,
- są sumą wielu komponentów (bonusy, rabaty, dopłaty, opłaty stałe i zmienne),
- mają wersje obowiązujące „od–do", w promocji, w cenniku standardowym,
- muszą być rozliczalne, transparentne, audytowalne i zgodne regulacyjnie,
- bywają liczone przez różne zespoły inaczej (front vs backend vs mobilka).

System musi umieć: **(a) policzyć funkcję, (b) przypisać wartości do konkretnych
udziałowców, (c) wyjaśnić decyzję i odtworzyć ją w czasie**. Cena musi mieć pamięć —
wersjonowanie, datę obowiązywania, powiązanie z kontekstem, w którym została policzona,
i możliwość odtworzenia dokładnie tej logiki po miesiącu lub roku. Bez tego nie da się
policzyć zaległego zdarzenia, udowodnić klientowi poprawności kwoty, spełnić wymagań
regulatora ani wyjaśnić księgowości, skąd wzięła się prowizja, podatek i dopłaty.

Kluczowe rozszerzenie: **Pricing to model wartości, nie tylko pieniężnej**. Cena niczym
nie różni się od punktów lojalnościowych, darmowych gigabajtów za instalację aplikacji
operatora, procentu rabatu za historyczne zamówienia, scoringu klienta, odsetek w kredycie
czy naliczonych kar. Dlatego trafniejszą nazwą archetypu byłby **valuation archetype** —
archetyp obliczania wartości. Zamiana typu `Money` na `Quantity` (wartość + dowolna
jednostka; Money jest szczególnym przypadkiem Quantity) czyni model uniwersalnym: punkty,
GB, minuty, limity, prowizje, odsetki, ratingi.

Pricing jest fundamentem (capability), z którego korzystają katalog produktów,
zamówienia, logistyka, billing i accounting. Słowo „cena" w organizacji oznacza
zwykle wiele różnych wartości naraz: kwotę brutto dla klienta, netto, VAT, prowizję
partnera, koszt operacyjny, koszt aktywacji, marżę firmy — a z perspektywy architektury
każda z nich jest **inną wartością**, która wymaga własnego miejsca w modelu. Firmy bez
modelu wartości mają zamiast tego dżunglę if-ów rozsmarowaną po systemach billingowych,
CRM-ach i integracjach.

Uwaga dydaktyczna powtarzana w całym module: archetyp to **sposób myślenia, nie gotowy
UML do implementacji**. Złożoność wprowadza się stopniowo i bierze się tylko te elementy,
których system faktycznie potrzebuje.

---

## 2. Sygnały dopasowania

### 2.1 Triggery językowe

Pricing niemal nigdy nie występuje w organizacji pod własną nazwą. Ludzie używają słów
opisujących **skutki liczenia wartości**, nie mechanizm. Nie szukaj tabeli `pricing` —
słuchaj języka organizacji. Sygnały:

| Kategoria | Słowa-klucze |
|---|---|
| Czasowniki kalkulacji | **naliczenia, wyliczenia, przeliczenia**, kalkulujemy, doliczamy, odejmujemy, rozliczamy |
| Modyfikatory wartości | rabat, zniżka, promocja, dopłata (paliwowa, emisyjna, wyspowa), opłata (startowa, czasowa, manipulacyjna, aktywacyjna), kara, bonus |
| Finanse | prowizja, odsetki, marża, stawka, składka, taryfa, cennik, abonament, VAT / podatek, scoring |
| Czas i obowiązywanie | „obowiązuje od…", „od poniedziałku nowa cena", happy hour, cennik nocny/weekendowy/sezonowy, okres rozliczeniowy, promocja do końca miesiąca |
| Progi i limity | limit, próg, nadwyżka, „po przekroczeniu…", „pierwsze 10 minut za darmo", „powyżej 5 kg", pakiet + overage |
| Pytania-symptomy | „jak to policzyć?", „dlaczego wyszło inaczej?", „skąd wzięło się dokładnie 3,27?", „od kiedy to obowiązuje?", „komu to się należy?", „dlaczego kolega zapłacił inną kwotę?" |
| Wartości niepieniężne | punkty lojalnościowe, darmowe GB, kredyty (SaaS), rating, scoring, limity |

Każde z tych słów to moment, w którym pojawiają się **reguły, obowiązujące w czasie,
zależne od kontekstu, dające wynik, który trzeba umieć wytłumaczyć** — czyli definicja
pricingu jako archetypu.

### 2.2 Źródła UKRYTEGO pricingu w systemach (L02 — pełna lista poziomów)

L02 przechodzi przez kolejne poziomy oczekiwań biznesowych i pokazuje, jak na każdym
z nich rodzi się ukryty pricing — cena „mieszka" w wielu miejscach naraz: trochę w
serwisach (if-y), trochę we froncie (pomocnicze obliczenia), w pliku YAML (promocja
weekendowa), w tabeli `PROMO_PRICE_TMP` z dopiskiem „NIE USUWAĆ, używane przez raporty"
i w pamięci developera, który już nie pracuje.

**Poziom 1 — pojedyncze pole `price`.** Dla stabilnego biznesu z jedną walutą i rzadkimi
zmianami (sklepik, salon fryzjerski, lokalny marketplace) to adekwatny, nie błędny model.
Ograniczenia zaczynają się krok dalej.

**Poziom 2 — waluta.** Wejście na drugi rynek sprawia, że `price = 120` nic nie mówi.
Typowe (złe) reakcje: (a) dodawanie pól o opisowych nazwach — „mała stacja walutowa"
w tabeli produktu; (b) architektura single-tenant per rynek/klient — chaos przenosi się
do obszaru wdrożeniowo-operacyjnego. Archetypowa odpowiedź: typ **Money**.

**Poziom 3a — czas.** Weekend drożej, noc taniej, święta inaczej, happy hour od 17:00,
Black Friday z własnym cennikiem; taryfy energetyczne G11/G12/G12W, dostawa weekendowa
+5 zł, strefa parkowania 8:00–18:00, telekomowe „nocki za pół ceny". Typowa reakcja:
if-y, a gdy ich liczba staje się nie do utrzymania — **przenoszenie logiki czasu do
kolumn bazy**: `price_from_hour`, `price_to_hour`, `weekend_price_flag`,
`holiday_special_price`, `night_rate_start`, `night_rate_end`. Modelowanie na poziomie
kolumn nie skaluje się, gdy promocje się nakładają, wykluczają, obowiązują w konkretnych
procesach, mają różne waluty, zależą od segmentu. Czas to jeden z najbardziej zdradliwych
wymiarów ceny — bez modelu natychmiast przenosi logikę tam, gdzie nie powinna istnieć.

**Poziom 3b — parametry inne niż czas.** Trzy grupy:
1. parametry zamówionych produktów/usług: kWh, minuty, kilometry, GB, wielkość paczki,
   kolor, wariant;
2. parametry klienta / rozliczanego podmiotu: segment (VIP, SME, student), poziom
   lojalności, scoring, region;
3. parametry kontekstu naliczania: kanał sprzedaży, urządzenie końcowe, partner
   pośredniczący, strefa roamingowa.

Typowa krucha reakcja: **modelowanie cen wprost w kodzie** — jedna funkcja, zwarta bryła
if-ów, która na pierwszy rzut oka wygląda sensownie, a zawiera klasyczne błędy: dopłata
czasowa liczona od całości minut zamiast nadwyżki po progu; próg zapisany jako `10:01`,
bo nikt nie wie, czy przedział jest lewostronnie domknięty; rabat nocny po godzinie
zakończenia zamiast faktycznego okresu trwania; stawki wklejone na sztywno; magiczne
liczby; „tymczasowe" poprawki na lata. Nawet gdy liczby są konfigurowalne, logika
pozostaje kaskadą warunków, w której decyzję podejmuje przypadkowo pierwszy prawdziwy if.

**Poziom 4 — podział tortu (interesariusze).** Cena z perspektywy klienta to wierzchołek
góry lodowej; pod spodem wielowarstwowa struktura składników, udziałów i rozliczeń.
Przykłady: e-mobility (cena energii dla dostawcy, marża właściciela stacji, marża
operatora aplikacji, marża partnera roamingowego, opłaty dystrybucyjne, VAT w różnych
stawkach per komponent); logistyka (koszt kuriera, dopłata paliwowa, prowizja
marketplace'u, marża brokera, VAT logistyczny, dopłata wyspowa); ubezpieczenia (składka
techniczna, prowizja agenta, udział reasekuratora, fundusz pomocowy, podatek, marża
towarzystwa); usługi medyczne (honorarium lekarza, udział placówki, materiały,
amortyzacja sprzętu, administracja, VAT). Jeśli system widzi tylko 220 zł, „widzi nie
cenę, tylko jej cień". Pomijane rozbicie nie znika — **złożoność migruje** do działów
księgowych (ręczne rozdzielanie pieniędzy), operacji, serwis desku i do wykładniczo
rosnącej komunikacji między działami.

**Poziom 5 — zmiana ceny jako fakt w czasie.** „Od poniedziałku obowiązuje nowa cena"
to fakt z cyklem życia (definicja → aktywacja → deaktywacja), nie `UPDATE` rekordu.
Update unieważnia przeszłość, łamie transparentność, bywa złamaniem prawa. Antywzorce
z projektów: wdrożenie 5 minut przed północą, żeby od północy obowiązywała nowa taryfa;
backfix „paluszkiem na bazie produkcyjnej" po błędnym zaokrągleniu.

**Poziom 6 — historia i transparentność.** „Dlaczego zapłaciłem 142,70? Jaka była cena
w momencie zakupu?" System z polem `price` odpowiada tylko: „teraz cena to 119, chyba".
Brak historii = problemy z reklamacjami, utrata zaufania, brak zgodności regulacyjnej,
niespójność między systemami, brak analizy trendów. Rozwiązanie event-driven (emisja
zdarzenia przy każdej zmianie + model odczytu) jest poprawne, ale **techniczne — to
narzędzie, nie model**. Łamie się, gdy zmienia się nie wartość, lecz **sam algorytm**:
algorytmu nie wrzucisz do zdarzenia; feature toggles z kolejnymi implementacjami cennika
rodzą pytanie, co ze starym algorytmem — usunąć? historia „ma być w gicie"?

**Poziom 7 — rozliczanie przeszłości (retro-billing).** Operator przysyła Excela
z setkami sesji ładowania z miesiąca, a cennik zmienił się od tego czasu pięć razy
(stawki, dopłaty, VAT, rabat, prowizja). Wszystko trzeba policzyć według zasad
obowiązujących **wtedy**. Telco: klient aktywuje promocyjny pakiet o 19:58, event wpada
o 20:05 — billing liczący „na bieżąco" zamiast po czasie zdarzenia gubi bonus;
reklamacja gwarantowana. Największa iluzja prostych systemów: **historia wartości
niczego nie załatwia** — potrzebna jest **historia instrukcji** (stawek, warunków,
rabatów, VAT-u, sposobu liczenia), nie tylko historia liczb. Typowe obejścia: ręczne
korekty i Excel, albo — właściwy kierunek — model ceny z okresem obowiązywania.

**Poziom 8 — wiele jednocześnie poprawnych cenników + stosowalność.** Produkt ma wiele
funkcji cenowych: standardowy, VIP, partnerski B2B, promocyjny, mobilny, zagraniczny —
i dla danego klienta kilka z nich jest naraz poprawnych (VIP + Black Friday + rabat
mobilny 5%). Pierwsza warstwa: **wybór funkcji** (co optymalizujemy — cenę klienta,
marżę, reguły?). Druga warstwa: **które komponenty funkcji się aktywują** (opłata
czasowa tylko po 10 min, rabat VIP tylko dla Gold, promocja nocna 22:00–6:00, oversize
powyżej 120 cm, prowizja partnera tylko w roamingu, IoT fee tylko dla IoT). Granica
między „częścią funkcji" a „warunkiem aktywacji komponentu" jest cienka i trzeba ją
**modelować, a nie zgadywać** — inaczej powstaje spaghetti, w którym trzy cenniki
walczą ze sobą tylko dlatego, że jeden if jest wyżej w kodzie, a pricing staje się
wynikiem kolejności if-ów.

**Poziom 9 — spójność między kanałami.** Frontend liczy (szybki podgląd koszyka),
backend liczy (faktura), mobilka ma własną kalkulację (rabaty kanału), panel pracownika
przelicza (wersja uproszczona bez części reguł), integracja dorabia logikę (pole w
payloadzie dla partnera). Każde miejsce powstało z realnej potrzeby i każde liczy
odrobinę inaczej (stan na dziś vs na moment transakcji, inne zaokrąglenia). Klient widzi
w katalogu jedną wartość, w kasie drugą, na fakturze trzecią, w raporcie czwartą.
Przyczyna: **ceny traktowane jako dane, a nie jako funkcje do wywołania** — logika
wycieka do innych modułów. Konsekwencje: reklamacje („u mnie na ekranie było inaczej"),
ręczne korekty, konflikty z partnerami o podstawę rozliczenia, problemy prawne, koszt
koordynacji, erozja zaufania do systemu. Oczekiwanie biznesu: jedna spójna, powtarzalna,
wiarygodna cena niezależnie od tego, gdzie ją pokazujemy i kto o nią pyta.

### 2.3 Sygnały kodowe

- `BigDecimal price` / kolumna `price` + obok `promo_price`, `price_eur`, `weekend_price_flag`…
- if-y na segment/kanał/godzinę rozsiane po serwisach; te same warunki powtórzone
  w kilku miejscach z różną interpretacją,
- kalkulacje zduplikowane front/backend/mobile/integracje,
- magiczne liczby stawek w kodzie; feature toggles przełączające „stary/nowy cennik",
- tabele tymczasowe typu `PROMO_PRICE_TMP`, promocje w YAML-ach,
- Excel jako silnik rozliczeń w księgowości/operacjach,
- Marianowy antywzorzec ze scenki 1: „nowa rata = nowa kolumna; dodam 60 kolumn na
  zapas, żeby system był otwarty na rozbudowę",
- antywzorzec ze scenki 2: iloczyn kartezjański wariantów jako tabela
  (parametry × liczba punktów) + stan punktów przypięty do klienta — zamiast funkcji
  wielowymiarowej w kalkulatorach.

---

## 3. Anty-sygnały / granice archetypu

- **Prosty, stabilny biznes**: jedna waluta, ceny zmieniają się rzadko, brak promocji
  i segmentacji, brak potrzeby breakdownu i audytu → pole `price` przy produkcie jest
  w porządku; to świadoma prostota, nie błąd architektoniczny. Pełny mechanizm
  komponentów cenowych bywa nadmiarowy („przesadą byłoby rozdzielanie tych modeli").
- **Pricing to nie katalog produktów**: mimo izomorfizmu strukturalnego (oba drzewiaste,
  wersjonowane, z applicability) Product odpowiada „co sprzedajemy", Pricing — „jak
  liczymy wartość". Jeśli domena mówi o definicji oferty, pakietach, zakresie usługi —
  to Product, nie Pricing (sekcja 9).
- **Pricing to nie proces**: nie jest procesem sprzedaży, ofertowania ani fakturowania.
  Nie zna zamówienia, jego statusów ani cyklu obsługi. Jeśli logika wymaga znajomości
  stanu procesu — to ordering/billing orkiestrujący pricing, nie sam pricing.
- **Pricing to nie księgowanie**: nie wie, gdzie wartość zaksięgować, nie zna planu
  kont — to Accounting. Pricing wie, **skąd wzięła się wartość**; Accounting — **gdzie
  ją zapisać**.
- **Pricing to nie worek na logikę warunkową procesów**: warunki typu „czy klient ma
  aktywną umowę" to applicability/reguły, a jeśli dotyczą przebiegu procesu — w ogóle
  nie należą do pricingu.
- Jednorazowe, niewyjaśnialne, nienegocjowane kwoty bez reguł (np. ręczna wycena
  ekspercka bez formuły) — dopóki nie ma reguł, kontekstu i czasu, nie ma archetypu.

---

## 4. Cena jako funkcja kontekstu (L03)

### 4.1 Wymiary kontekstu

Cena jest funkcją wielu wymiarów; czas to tylko jeden z nich:

| Wymiar | Przykłady |
|---|---|
| Czas | pora dnia (dzień/noc, happy hour), dzień tygodnia (masaż: tydzień 150 zł, sobota 180 zł, niedziela 220 zł), sezon (ferie/wakacje), kampania (Black Friday), okno sprzedażowe |
| Kanał | www jedno, oddział drugie, aplikacja mobilna trzecie; te same buty w 3 cenach |
| Segment / klient | premium −20%, firmowy inna stawka VAT, nowy klient „pierwszy za pół ceny"; scoring, lojalność, region |
| Parametry użycia | po 10 minutach opłata czasowa, po przekroczeniu limitu dopłata, powyżej 5 kg stawka X; kWh, minuty, GB, km, sztuki, waga, wariant |
| Kontekst transakcji | urządzenie końcowe, partner pośredniczący, strefa roamingowa |
| Negocjacje | „masz to za 300, ale nie mów nikomu" |

Przykład konta bankowego „za 0 zł": 0 zł pod warunkiem 5000 zł wpływów + płatności
kartą min. 500 zł (cena jako funkcja zachowań klienta).

### 4.2 Elementy modelu

**Money** — pierwszy krok każdej poważnej architektury pricingowej. BigDecimal „nie wie
nic": zero kontekstu, waluty, zabezpieczeń — pozwoli dodać 100 EUR do 450 PLN. Money
łączy kwotę, walutę, arytmetykę i reguły poprawności; dzięki niemu reguły operują na
wartościach, które wiedzą, czym są, ceny stają się porównywalne, a dalsza logika nie
musi bronić się przed niemożliwymi wejściami. W literaturze (Fowler „Analysis Patterns",
„Enterprise Patterns and MDA") Money jest archetypem samym w sobie; w module traktowany
jako oczywisty fundament.

**Przedziały** — rodzina typów o jednym sensie (wycinek osi + pytanie „czy wartość
mieści się w przedziale?"), wszystkie **lewostronnie domknięte** [from, to):

- **TimeRange** — przedział godzin w dobie; wspiera tryb normalny (8:00–22:00) i
  **cross-midnight** (22:00–8:00 = 22:00–północ + północ–8:00), powszechny w energetyce,
  telko, e-mobility. Przykład: taryfa dzienna 0,85 zł/kWh (8–22), nocna 0,42 zł (22–8).
- **DateRange** — przedział dat; np. transport sprzętu sportowego sterowany kalendarzem
  szkolnym: ferie 15.01–25.02 → 29 zł, wakacje 1.06–31.08 → 25 zł, poza sezonem 18 zł.
- **NumericRange** — przedział na dowolnej osi liczbowej (sztuki, waga, kwota, km,
  zużycie — wszystko jest liczbą).
- **CalculatorRange** — wspólny interfejs powyższych; pozwala budować segmenty cenowe
  na dowolnej osi, a każdy segment wiązać z inną funkcją cenową.

**Cena jako funkcja złożona z przedziałów.** Wykres taryfy to f(t) przedziałami
monotoniczna: w każdym przedziale inna funkcja — stała, liniowa, schodkowa. Przykład
kursu online: przedsprzedaż 5 dni po 1999 zł (stała) → okno 14 dni z ceną rosnącą
liniowo 1999→3399 zł (f(t) = 1999 + (t−5)·100) → oferta standardowa 3399 zł (stała).

**Calculator** — najważniejsza abstrakcja modelu; „język, w którym opisujemy strategię
pricingu". Kontrakt:
- `calculate(parameters) → Money` — serce; cała matematyka,
- **CalculatorId** (np. UUID) — jednoznaczna identyfikowalność jako podstawa
  serializacji, persystencji, wersjonowania, audytu,
- **name, description** — nazwy biznesowe dla konfiguracji, logowania, komunikacji,
- **CalculatorType** — określa rodzaj kalkulatora, pola wymagane przy tworzeniu
  i parametry wymagane przy liczeniu; dydaktycznie enum, w realnych systemach równie
  dobrze osobna klasa, rekord, definicja konfiguracyjna w bazie czy dynamiczny JSON —
  bo realne systemy mają setki typów, pozwalają biznesowi definiować nowe, a reguły
  zmieniają się częściej niż kod.

**Katalog typowych kalkulatorów:**

| Kalkulator | Funkcja | Przykłady |
|---|---|---|
| SimpleFixed (SIMPLE_FIXED) | stała | przelew ekspresowy 5 zł, karta 15 zł, SMS 0,20 zł, start ładowania 2 zł, rejestracja w kursie 99 zł |
| StepFunction (schodkowy) | base + stepIncrement · floor(x / stepWidth) | paczka ≤5 kg 15 zł, 5–10 kg 18 zł, 10–15 kg 21 zł; parking +2 zł/30 min; +5 zł za GB ponad pakiet |
| Dyskretny (mapa) | cena tylko dla konkretnych kluczy; brak klucza → wyjątek | pakiety lekcji 5/10/20 szt.; przewóz rowerów 1/2/3/5 szt.; pakiety minut 60/120/240/500 |
| DailyIncrement (LINEAR_DATE) | startPrice + dni_od_startu · delta | kurs online +100 zł/dzień; branża eventowa |
| ContinuousLinearTime | interpolacja liniowa startPrice→endPrice między startTime a endTime | cena zmienia się co sekundę; „ciągłość" to kwestia rozdzielczości (dzień/sekunda/nanosekunda) |
| ContinuousLinearWithTime | suma dwóch funkcji liniowych (wolumen + czas) | telco: 57 + (Q−20)·3 + hours·0,8 |
| Percentage | wartość · rate | VAT 23%, marża 10%, prowizja, składka |
| CompositeFunctionCalculator | wybiera przedział wg parametru, pobiera z niego CalculatorId, znajduje kalkulator w katalogu, deleguje | okna sprzedażowe, progi wagowe, sezonowość, segmentacja, dynamiczne ceny |

**Ranges** — „strażnik porządku w przedziałach" przy CompositeFunctionCalculator:
pilnuje, by wszystkie przedziały operowały na tej samej osi (czas/data/liczba) i by
żadne dwa nie nachodziły na siebie; jest też nośnikiem **selektora** — nazwy parametru
(np. `DATE`, `monthlyIncome`, `quantity`), po którym `calculate` wybiera przedział.
To czyni kalkulator uniwersalnym: przedziały po dacie, godzinie, wadze, km, scoringu.

**Fasada** — serwis aplikacyjny orkiestrujący konstruktory, metody kreacyjne,
repozytoria; punkt interakcji z modelem.

### 4.3 Przykłady referencyjne

- **Bankowość, opłata za konto zależna od wpływów**: 3 kalkulatory stałe (20 zł / 10 zł /
  0 zł) + przedziały [0,1000), [1000,4000), [4000,∞) + CompositeFunctionCalculator
  z selektorem `monthlyIncome`. Wywołanie z 2500 → 10 zł; z 4500 → 0 zł. Zero if-ów.
- **Telco, taryfa dwupoziomowa**: noc [0:00,6:00) — liniowa 0,30 zł/GB; dzień —
  kompozyt wolumenowy: [0,10) GB stała 7 zł; [10,20) liniowa 7 + 5 zł/GB; [20,30)
  mieszana 57 + (Q−20)·3 + h·0,8; 30+ liniowa 0,50 zł/GB. Całość spięta kompozytem
  czasowym (`telcoPricing`). Scenariusze: 8 GB o 2:30 → 2,40 zł; 15 GB o 12:00 → 32 zł
  (7 + 5·5); 25 GB przez 3 h w dzień → 74,40 zł. Przedziały decydują **kiedy obowiązuje
  która funkcja**, funkcje decydują **jak liczyć**, fasada dostarcza konfigurację.
- **E-mobility (łamigłówka L01)**: start 2 zł + kWh·1,20 + (minuty−10)·0,10 + rabat
  nocny −10%; 18,2 kWh / 34 min od 22:30 → 23,62 zł. To zadanie z modelowania, nie
  z pisania procedury z if-ami — w tym kwestia „kto dostaje ile z tej kwoty".
- **Telco, abonament + overage**: 39 zł abonament, pakiet 20 GB, 4 zł/GB nadwyżki;
  27 GB → 39 + 7·4 = 67 zł. Z punktu widzenia klienta jedna liczba, z punktu widzenia
  systemu dwa komponenty naliczane różnymi zasadami. Konfiguracji takich umów mogą być
  setki.

---

## 5. Trzy perspektywy interpretacji ceny (L04)

Kluczowe pytanie, które model musi rozstrzygnąć: **co właściwie wylicza kalkulator?**
„To ontologia cen, a nie wybór formatowania." Przykład referencyjny (koszulki):
sztuki 1–3 po 90 zł, sztuki 4–5 po 80 zł, sztuka 6+ po 50 zł. Zakup 6 szt. =
3·90 + 2·80 + 1·50 = 480 zł.

### 5.1 Cena marginalna (marginal)

Mówi, ile kosztuje **n-ta jednostka** (5. sztuka 80 zł, 21. — 50 zł). Najbardziej
informatywna, „najbliżej prawdy o cenach". Zastosowania: ocena opłacalności zwiększania
zamówienia, transparentność progów i rabatów, dynamiczne zachęty (upselling).
Z marginalnej da się policzyć total (suma marginalnych po kwantach) i unit (total /
ilość). Ale kalkulator marginalny **nie powinien sam liczyć totala** — total to inna
funkcja; gdyby SimpleFixedCalculator zwracał też total, wprowadziłby funkcję liniową
do klasy semantycznie reprezentującej funkcję stałą — naruszenie spójności modelu.

### 5.2 Cena jednostkowa (unit)

Odpowiada: **jaka jest średnia cena za jednostkę przy zakupie N jednostek**. Narzędzie
komunikacyjne: „średnio 80 zł/szt.", „dokup jeszcze jedną, zyskasz 5 zł na każdej";
porównywanie ofert między dostawcami, analiza cost-per-unit; chętnie używana w
marketingu. Total = unit(Q) · Q. Marginal z unit: matematycznie tak —
marginal(n) = n·unit(n) − (n−1)·unit(n−1) — praktycznie tylko w prostych przypadkach,
bo: unit jest zwykle zaokrąglony do 2 miejsc (total z iloczynu ≠ prawdziwy total,
marginal z różnicy totali „lekko przekłamany"), a biznes może liczyć total inaczej niż
N·średnia (zaokrąglenia per próg, opłaty stałe, podatki, opłaty manipulacyjne, kwoty
minimalne, limity) — wtedy wyliczona marginalna jest artefaktem matematycznym
nieodpowiadającym żadnej realnej stawce.

### 5.3 Cena całkowita (total)

Biznes najczęściej uważa ją za „tę właściwą": finalny rachunek — koszyk, faktura,
raport, billing. Zalety: **jedyne źródło prawdy o cenie końcowej** (zero przeliczania,
zero rozbieżności); pełna kontrola modułu nad arytmetyką, zaokrągleniami, skalą,
kolejnością operacji (klient/frontend/partner niczego nie mnoży sam); **uniwersalność**
dla funkcji wielowymiarowych. Z totala: unit = total/N (z dokładnością do zaokrągleń),
marginal(n) = total(n) − total(n−1).

Zasada ogólna: między perspektywami można przechodzić w obie strony z dokładnością do
zaokrągleń (przy funkcjach ciągłych wchodzi analiza matematyczna — całki/pochodne;
moduł sygnalizuje granicę, nie nurkuje głębiej). Reguła praktyczna: **klienty modułu
pricingowego nie liczą niczego na własną rękę** — inaczej kończy się ping-pongiem
komunikacyjnym „czyja wina". Archetyp odpowiada całościowo za arytmetykę, zaokrąglenia
i spójność.

### 5.4 Joker: funkcje wielowymiarowe

Gdy cena zależy od transferu i czasu, wagi i odległości, minut+GB+urządzenia+pory dnia —
**pojęcie jednostki przestaje istnieć** (cena za gigabajto-godzinę? minuto-gigabajto-
urządzenio-porę-dnia?). Twory typu roboczodni (mandays) są w cennikach egzotyczne.
Wniosek: kalkulatory unit i marginal schodzą na dalszy plan, **dowodzenie przejmuje
total** — w złożonych biznesach to po niego sięga się najczęściej. Transparentność
marginalną/jednostkową zapewniają wtedy zapisy umowne (formuły naliczania w umowach).

### 5.5 Implementacja: Interpretation zamiast mnożenia klas

Złe podejście nr 1: osobne klasy per perspektywa (StepFunctionTotalPriceCalculator,
…Unit…, …Marginal…) → przy 5 funkcjach 15 klas z tą samą matematyką; zmiana logiki
step-function = edycja trzech klas; „interpretacja nie jest funkcją, a została nią
zrobiona". Złe podejście nr 2: trzy metody w każdym kalkulatorze → każdy kalkulator
implementuje naraz trzy **różne** funkcje matematyczne; do której odnosi się nazwa?

Fundamentalna obserwacja: **jedna funkcja matematyczna może mieć wiele znaczeń,
a znaczenie to kwestia konfiguracji, nie implementacji**. Stąd typ **Interpretation**
(TOTAL / UNIT / MARGINAL) jako właściwość kalkulatora: nie zmienia matematyki, zmienia
odczyt wyniku. Jedna implementacja + trzy konfiguracje. „Zmienia się nie kod,
a konfiguracja — to jest esencja archetypu."

Doprecyzowanie wyniku: unit = kwota+waluta / jednostka; marginal = kwota dla konkretnej
definicji jednostek; total = kwota+waluta. Kierunki rozwoju: archetyp **Quantity** albo
typ **PricingResult** z trzema implementacjami (TotalPrice — pieniądze; UnitPrice —
pieniądze + jednostka; MarginalPrice — pieniądze + jednostka + indeks) i parą metod
`calculateRaw` / `calculate`. Moduł dla czytelności zostaje przy Money.

### 5.6 Adaptery i fasada

Między perspektywami istnieją relacje matematyczne (total = Σ marginal; unit = total/Q;
marginal(n) = total(n) − total(n−1)) — czyli **składanie funkcji**; w architekturze:
**adapter pattern**. Adapter opakowuje istniejący kalkulator, wywołuje go, przelicza
wynik na inną interpretację i **sam jest pełnoprawnym kalkulatorem** (ma CalculatorId,
name, interpretation, calculate, własny CalculatorType). Przykłady: Unit-to-total
(unit · quantity), Total-to-unit (total / quantity), Marginal-to-total (suma
marginalnych). **Fasada** wystawia CalculateTotal / CalculateUnitPrice /
CalculateMarginal i automatycznie dobiera adaptery: sprawdza interpretację kalkulatora,
w razie potrzeby tworzy adapter, liczy. Pricing staje się systemem funkcji, które można
składać, nakładać i przekształcać — „w matematyce kompozycja funkcji, w programowaniu
elastyczny model, w biznesie przewaga konkurencyjna".

---

## 6. Cena jako kompozycja składowych (L05)

### 6.1 Rozdział matematyki od semantyki

Kalkulator nie wie, że wyliczone 15,80 to „opłata za zużycie internetu" — nazwa
i jednostka to tylko etykiety. Biznes potrzebuje i „co oznacza kwota", i „z czego się
składa" (ile podatku, ile prowizji dostawcy, ile mojej marży). Gdy model tego nie daje,
luki łatają ludzie w działach operacyjnych i księgowych (szkiełko i oko, reguły w
Excelu); semantyka jest rozsmarowana po systemie. Konsekwencje braku: rozliczenia jako
ręczne rzemiosło (system zwraca 1 liczbę, firma potrzebuje 8); na pytanie „ile
zarobiliśmy" tyle odpowiedzi, ile działów — „to nie analiza, to archeologia"; koszt
obsługi rośnie wykładniczo; efekt motyla (zmiana prowizji → netto → VAT → prowizje
procentowe → końcówka ceny → rabat od ceny końcowej…), a system „liczy nieświadomie";
nikt nie wie, kto jest właścicielem której części tortu (krytyczne w branżach
multipodmiotowych: e-mobility, logistyka, turystyka, finanse, marketplace).

Kusząca zła droga: niech kalkulator zwraca mapę składowych (netto, VAT, marże…).
To „podłożenie bomby": kalkulator przestaje być funkcją wielokrotnego użytku, staje się
kapsułą logiki biznesowej zależną od kontekstu; każda zmiana składowej (stawka VAT,
opłata startowa, struktura marż) = podmiana kalkulatora; wszyscy konsumenci muszą umieć
zinterpretować strukturę. „Monolit przebrany za funkcję, a my chcemy klocki LEGO."

**Decyzja projektowa modułu:** kalkulator liczy **jedną wartość** i nie rozumie
semantyki (jak sinus(x)) → dzięki temu jest reużywalny, testowalny, odporny na zmiany;
to warstwa **capability** (zdolności matematycznych). Nad nią — warstwa **komponentów**.

### 6.2 Komponent

**Komponent = biznesowo nazwana część ceny**, powiązana z kalkulatorem, mogąca zależeć
od innych komponentów i łączyć się w większe komponenty — drzewo dające na końcu
zarówno cenę końcową, jak i pełną mapę wartości i znaczeń. Kalkulator to matematyka,
komponent to semantyka. Ten sam PercentageCalculator może być VAT-em 23%
(rate 0,23), marżą EMSP (rate 0,10), opłatą referral, składką ubezpieczeniową —
„funkcja identyczna, znaczenie zupełnie różne; znaczenie nadają komponenty".

Kontrakt komponentu: **jednoznaczna identyfikowalność** (ma cykl życia; istotne, którą
instancję wykorzystujemy w której taryfie), **nazwa biznesowa**, **interpretacja**
(czy przypięta funkcja liczy total/unit/marginal), oraz zachowania: `calculate` → Money
i obliczenie **w rozbiciu na składowe** (breakdown). Kontrakt jest behawioralny —
ukrywa strukturę; z zewnątrz nie widać powiązania z kalkulatorami.

Kwestia otwarta (świadomie): czy parametry funkcji (basePrice, step…) są częścią
definicji kalkulatora, czy komponentu? Oba modele poprawne — można mieć jeden generyczny
kalkulator schodkowy i wiele komponentów z różnymi schodkami, albo kalkulator per
taryfa. „Ważniejszy jest związek logiki matematycznej z semantyką biznesową, a nie to,
gdzie zapakujesz parametr." Moduł przyjmuje: instancja kalkulatora niesie parametry.

**SimpleComponent** (liść drzewa): id, nazwa, referencja do kalkulatora, delegacja w
`calculate`. Dodatkowo:
- **parameterMappings / transformParameters** — tłumaczenie języka biznesowego na język
  kalkulatora: kalkulator mówi `quantity`, `rate`, `stepSize`; biznes mówi `time`,
  `energy`, `weight`. Przykład: komponent `cpo-time-component` mapuje parametr `Time`
  (40 minut) na `Quantity` oczekiwane przez kalkulator per-minute → 4 zł → „to jest
  marża CPO za czas". Mapowanie rozwiązuje konflikty między kalkulatorami i oddziela
  świat matematyki od świata semantyki.
- **adaptacja interpretacji** — komponent może przeliczyć interpretację przypiętej
  funkcji na wymaganą (unit→marginal→total); w odróżnieniu od
  CompositeFunctionCalculator (gdzie składowe funkcje musiały mieć tę samą
  interpretację) na tej warstwie składowe mogą mieć różne interpretacje — komponent
  przeliczy.

**CompositeComponent** (wzorzec kompozyt): też identyfikowalny i nazwany, **bez**
kalkulatora; deleguje do dzieci (`children` — simple lub composite). Formalnie to graf,
nie tylko drzewo, bo między dziećmi są **zależności (parameter dependencies)**: aby
policzyć komponent, potrzeba wyniku innego/innych (wartość pojedynczego komponentu albo
suma grupy — „algebra cenników"; stąd ParameterValue zamiast mapy string→string).
Przykład: `BaseAmount` kalkulatora ubezpieczenia = suma komponentów Interest
i Processing. Kompozyt iteruje po dzieciach, wzbogaca na bieżąco zbiór parametrów
wynikami zależności, deleguje i agreguje wyniki w **ComponentBreakdown** — drzewiastą
strukturę wyników każdego poziomu.

**Zasada lokalizacji zależności**: komponent VAT **nie zna** swoich zależności (nie wie,
od czego liczyć); zależności deklaruje **komponent złożony nadrzędny** między swoimi
dziećmi. Dzięki temu te same dzieci można użyć w innej taryfie (dziennej, nocnej,
weekendowej) z innymi zależnościami.

### 6.3 Przykład referencyjny: taryfa e-mobility

Sesja: 12 kWh / 40 min; klient widzi 26,57 zł. Interesariusze: dostawca energii +
operator sieci, **CPO** (Charging Point Operator — operator stacji), **EMSP**
(E-Mobility Service Provider — operator aplikacji).

Kalkulatory (czysta matematyka): energia hurtowa — schodkowy cennik **marginalny**
(0–5 kWh po 0,60; 5–10 po 0,70; 10+ po 0,80 → 8,10 zł); opłata sieciowa — unit
0,15 zł/kWh (1,80 zł); cpo-session-fee stała 1,50 zł; cpo-per-kWh unit 0,25 (3 zł);
cpo-per-minute unit 0,10 (4 zł); emsp-per-kWh unit 0,10 (1,20 zł); emsp-per-minute
unit 0,05 (2 zł); VAT procentowy 23%.

Drzewo komponentów (semantyka):

```
total-session-cost
├── netto
│   ├── energy-net
│   │   ├── energy-wholesale-component  (marginalny schodkowy)
│   │   └── energy-grid-component       (unit, stały)
│   ├── cpo-markup
│   │   ├── cpo-session-component
│   │   ├── cpo-kWh-component
│   │   └── cpo-time-component          (mapowanie Time→Quantity)
│   └── emsp-markup
│       ├── emsp-kWh-component
│       └── emsp-time-component
└── vat-component  (zależy od netto: BaseAmount := value(netto))
```

Netto = 9,90 + 8,50 + 3,20 = 21,60; VAT = 21,60·0,23 ≈ 4,97; total 26,57 zł.
Przebieg: korzeń woła dzieci → simple komponenty konwertują interpretacje, aplikują
mapowanie parametrów, wywołują kalkulatory → VAT dostaje BaseAmount = netto → korzeń
sumuje → system buduje pełne drzewo breakdownu. VAT patrzy na **sumę innych
komponentów**, nie na kWh czy minuty.

Możliwe rozszerzenia (świadomie pozostawione): builder drzewa; statyczne kalkulatory
(parametry definicji z CalculatorType przeniesione do komponentu). „Ten model działał
w naszych projektach, ale to przykład implementacji sposobu myślenia, nie jedyny
słuszny model."

---

## 7. Wersjonowanie i historia (L06)

Potrzeby: (1) definiowanie cen z datą obowiązywania w przyszłości (telekomy ogłaszają
taryfy z miesięcznym wyprzedzeniem, marketplace'y planują eventy, logistyka dopłaty od
1. dnia miesiąca, banki opłaty od kwartału); (2) rozliczanie przeszłości po starych
zasadach — np. okres rozliczeniowy 15.–15. przecięty zmianą ceny od 1. dnia miesiąca:
pierwsza połowa po starej stawce, druga po nowej → „żaden update ceny na bazie nie
wchodzi w grę"; (3) historia zmian dla klienta (weryfikacja zakupów) i biznesu
(raporty, analizy).

**Problem naiwnej niemutowalności.** Co zmienia się w czasie najczęściej? Kalkulator
(sposób liczenia). Jeśli cały komponent jest niemutowalny, zmiana = nowy komponent
z nowym ID → **efekt domina**: energy-net (ID 001) użyty w cennikach AC-normal,
DC-fast, DC-ultrafast i pięciu innych taryfach oraz kilkudziesięciu produktach; zmiana
kalkulatora od 1 lutego wymusza energy-netV2 (ID 002) i kaskadową duplikację/przepięcie
wszystkich kompozytów nadrzędnych, produktów, ofert, promocji, taryf roamingowych,
integracji z partnerami. „Zmiana stawki o 2 grosze pociąga przepinanie wszystkiego —
to zabija operacyjność."

**Rozwiązanie: stała tożsamość + niemutowalne wersje.** Komponent pozostaje mutowalnym
bytem biznesowym o **stałym ComponentId** przez cały cykl życia; wewnątrz trzyma listę
**wersji** (szczegółów) z okresami ważności. Wersje są niemutowalne; zmiana ceny =
dodanie nowej wersji bez nadpisywania. Elementy:

- **Validity** — rekord: lewostronnie domknięty przedział czasu; konstrukcje od–do,
  pomiędzy, „całość czasu"; operacje: czy punkt w czasie mieści się w zakresie, czy dwa
  przedziały na siebie nachodzą.
- **ComponentVersion** — snapshot: co obowiązuje, kiedy obowiązuje (validity), kiedy
  zdefiniowano (definedAt). Dla SimpleComponent wersja niesie kalkulator + mapowanie
  parametrów; dla CompositeComponent — **CompositeComponentVersion**: lista dzieci,
  mapowanie zależności na parametry podkomponentów, okres obowiązywania (bo czasem
  zmienia się nie stawka, lecz **skład ceny**: dochodzi parking, opłata manipulacyjna,
  znika rabat).
- **VersionUpdateStrategy** — polityka dopisywania wersji: zakaz różnych wersji na te
  same okresy, zakaz nachodzenia, albo „wolna amerykanka"; domyślnie system ostrożny
  (nie pozwala definiować wersji dla już pokrytych przedziałów).
- **Timestamp w parametrach** — API `calculate` bez zmian, ale parametry zawierają
  znacznik czasu; komponent wyszukuje wersję ważną w tym punkcie, adaptuje interpretację
  kalkulatora wersji i liczy. Komponent = „jednoznacznie identyfikowalny agregat wersji,
  odpowiedzialny za wybór wersji i delegację obliczeń do właściwej".

**Przykład roczny (e-mobility, 20 kWh):** styczeń: TotalPrice = EnergyCharge
(2,50/kWh) + VAT 23% → 61,50. Luty: promocja walentynkowa −20% = **nowa wersja**
EnergyCharge (2,00) aktywna w lutym → 49,20; żadnego przepinania produktów. Marzec:
**„nie robimy nic"** — najważniejsze zdanie lekcji; promocyjna wersja przestaje być
ważna, system automatycznie wraca do wersji bazowej (nie „V1", po prostu ta, której
przedział pasuje) → 61,50. Maj: zmiana **struktury** — nowy komponent ParkingFee 5 zł,
nowa wersja CompositeComponent TotalPrice (VAT od energii+parkingu; większość dzieci to
dosłownie te same obiekty w obu wersjach) → 67,65. Lipiec–sierpień: nowa wersja
EnergyCharge 2,80 → 75,03. Wrzesień: wygasa → 67,65. Listopad: parking 8 zł → 71,34.

Trzy kluczowe wnioski przykładu: **komponenty mają stałą tożsamość** (zmieniają się
wersje, nie EnergyCharge); **czas wybiera wersję, nie logika aplikacyjna** (zero if-ów
„jeśli luty, jeśli promocja"); **historia wynika z modelu, a nie z logów** (breakdown
z lutego wygląda inaczej niż z marca nie dlatego, że ktoś coś zapisał na boku).
Uwaga API: `createSimpleComponent` to de facto create-or-update (nazewnictwo —
„w programowaniu trudne są dwie rzeczy: inwalidacja cache'a i nazywanie rzeczy").
Efekt całości: elastyczność konfiguracji + rozliczanie zdarzeń bieżących i przeszłych
+ pełna historia zmian jako naturalna cecha modelu.

---

## 8. Reguły cenowe zamiast instrukcji warunkowych (L08)

Problem: wiele cenników naraz poprawnych + komponenty aktywne warunkowo. Bez jawnego
modelu naturalnym odruchem jest dokładanie if-ów — wtedy „pricing przestaje być modelem
wartości, a staje się wynikiem kolejności warunków w kodzie".

Przykład-oś: parking „pierwsze 10 minut za darmo, potem 0,50/min". Dwa poprawne
podejścia startowe: (A) kalkulator złożony z przedziałów — parking zawsze istnieje jako
składnik, czasem równy zero; (B) prosty kalkulator + próg jako **warunek aktywacji**
komponentu. Oba liczą tak samo; różnica leży w **konsekwencjach ewolucji**. Gdy biznes
dodaje „darmowe 10 minut tylko dla B2C, B2B płaci od pierwszej minuty": w podejściu (A)
trzeba mapować segment na przedział liczbowy (B2C = [0,1), B2B = [1,2)) — „matematyka
zaczyna widzieć, kim jest klient" — przekroczona zostaje nie granica matematyki, lecz
**granica odpowiedzialności**. W (B) — mniej funkcji, warunki w komponentach.

Gdy dochodzą kolejne konteksty (promocja nocna 22–6, rabat w aplikacji mobilnej, inna
polityka roamingu, wyjątek dla partnerów, test A/B cennika) — wzór się nie zmienia
(nadal minuty·stawka), zmienia się **kiedy i dla kogo logika ma się uruchomić**.
Trzymanie wszystkiego w kalkulatorach: karkołomne mapowanie pojęć biznesowych na
dziedziny funkcji, powtarzająca się logika, utrata spójności, przypadkowa złożoność gdy
kolejność warunków zaczyna mieć znaczenie, i brak odpowiedzi na pytanie „dlaczego ten
klient dostał tę cenę" (w modelu nie ma elementu, który by na nie odpowiadał).

**Trzy ortogonalne osie dojrzałego modelu pricingowego:**

| Oś | Pytanie | Zawartość |
|---|---|---|
| **Calculator** | JAK liczymy? | matematyka: wzory, progi, tieringi, funkcje ciągłe i schodkowe |
| **Applicability** | CZY w ogóle liczymy? | segment klienta, kanał, kontekst, warunki biznesowe |
| **Validity** | KIEDY to obowiązuje? | czas, wersjonowanie, historia |

Semantyka łączenia:
- **komponent prosty** (a ściślej: jego wersja) aplikuje się ⇔ `validity AND
  applicability` — np. „od maja naliczamy opłatę parkingową, ale tylko dla klientów
  indywidualnych i tylko jeśli sesja trwa dłużej niż 10 minut"; kalkulator nie wie nic
  o segmencie ani czasie, robi wyłącznie matematykę; żadnej ukrytej semantyki w funkcji;
- **kompozyt** bywa jedynie agregatem kompozycji: stosowalny ⇔ obowiązuje w czasie
  **AND (OR po dzieciach)** — bo nie wszystkie składniki ceny liczą się zawsze,
  breakdown może zmieniać się z kontekstem, a brak jednego składnika nie unieważnia
  całej ceny.

Heurystyka wyboru funkcja-vs-reguła (odpowiedź na zarzut „przecież próg 10 minut to
nadal matematyka"): problemem nie jest matematyka, lecz **liczba reguł, częstotliwość
zmian i kombinatoryka kontekstów**. Próg zmienia się raz na rok → funkcja OK. Próg
zmienia się co kampanię / zależy od segmentu, kanału, kraju, pory dnia → reguły
(applicability). Próg znika i wraca sezonowo → reguły + validity. W pewnym momencie
funkcja przestaje być nośnikiem intencji biznesowej, staje się workiem warunków;
applicability wyciąga warunki do warstwy stworzonej do zmienności. Reguły nie zastępują
matematyki — „są po to, żeby nie zmuszać matematyki do udawania polityki biznesowej".
Analogia do produktów: produkty też są drzewiaste i też mają applicability; gdyby
wyrzucić produkty, komponenty musiałyby je udawać; gdyby wyrzucić komponenty, produkty
musiałyby zawierać pricing. (Głębszy model reguł — osobny moduł szkolenia.)

---

## 9. Architektura: moduł pricingowy, integracje, miejsce w organizacji (L07, L09, L10)

### 9.1 Pricing vs Product — izomorfizm bez tożsamości odpowiedzialności

Oba modele wyglądają jak lustrzane odbicie: drzewiaste/composite, liście i węzły,
kompozycja, identyfikatory i nazwy, applicability, wersje w czasie. To **izomorfizm
strukturalny**, nie ta sama odpowiedzialność. Product = definicja oferty, język
katalogu, marketingu, regulacji i fulfillmentu; relatywnie stabilny, znaczenie
regulacyjno-kontraktowe, nie wie, jak liczy się cenę; język **funkcjonalny** („co
dostarczamy"). Pricing = strategia wyceny; częste zmiany, wbudowany czas i historia,
breakdown i audyt, enkapsulacja matematyki; język **ekonomiczny** („ile to jest warte
dziś, dla tego klienta, w tym kontekście").

Dwa niezależne wymiary czasu: **Temporal Composition** (co jest w pakiecie — w styczniu
ChargingSession = Energy+VAT, w maju = Energy+Parking+VAT) i **Temporal Pricing** (ile
to kosztuje). Semantyka wersji różna: wersja katalogowa = „co dokładnie sprzedawaliśmy
w tym okresie" (zmiany rzadkie, kosztowne organizacyjnie, komunikowane: regulaminy,
aneksy, kampanie); wersja pricingowa = „jak w tym okresie liczyliśmy ceny" (promocja,
sezonowa podwyżka, zmiana algorytmu, test strategii, automatyczny powrót starej ceny —
częste, tanie, często niewidoczne na poziomie produktu).

Mapowanie zmian biznesowych: promocja → tylko pricing; sezonowa podwyżka → tylko
pricing; nowy feature → tylko katalog (cena często bez zmian w pierwszym etapie);
regulacja → zwykle oba naraz. Wniosek: zmiany katalogu i pricingu **nie są trwale
zsynchronizowane**, dlatego mimo podobnej struktury to najczęściej dwa byty (z
zastrzeżeniem: w prostych systemach rozdzielanie byłoby przesadą).

Scenariusze mapowania produkt→cena: (1) struktura ceny ≈ struktura katalogu 1:1
(utilities, telko, e-mobility — klient widzi, za co płaci; łatwy audyt); (2) jeden
produkt → wiele składników ceny (bankowość, logistyka, chmura); (3) wiele elementów
katalogu → jedna holistyczna cena (subskrypcje, SaaS, ubezpieczenia, membershipy —
pricing celowo ignoruje podział katalogowy); (4) elementy czysto cenowe bez
odpowiednika w katalogu: rabaty, promocje, podatki, opłaty regulacyjne, mechanizmy
lojalnościowe — pricing przestaje być lustrem katalogu, „zaczyna odzwierciedlać
strategię finansową firmy".

Decyzja łączyć/rozdzielać: **włącz pricing do produktów**, gdy zmienność cenowa mała,
cena jest atrybutem, jeden zespół odpowiada za produkt i wycenę, system młody i prosty.
**Oddziel**, gdy produkty stabilne a ceny dynamiczne; inne osoby biznesowe pracują nad
cenami niż nad produktami; pojawia się wersjonowanie, reguły warunkowe, segmentacja;
chcesz komponentów cenowych bez odpowiednika produktowego. Najważniejszy argument jest
**organizacyjny**, nie techniczny: analiza rynku vs analiza kosztów/rentowności,
projekt inżynierski vs strategia cenowa, kwestie prawne vs polityki rabatowe, wysoka vs
niska stabilność i częstotliwość zmian — sklejenie tych strumieni wartości obniża
wydajność wytwórczą zespołów.

### 9.2 Kierunek zależności Product ↔ Pricing

Opcja 1: pricing zależy od produktu (komponenty znają ID produktów; produkt nie wie nic
o cenach). Opcja 2: produkt zależy od pricingu (produkt zna identyfikatory
cenników/komponentów). Strukturalnie równoważne („komu dać czyj identyfikator");
rozstrzygają **implementacja i przypadki użycia**: (a) bez wersjonowania komponentów
każda zmiana ceny = nowy ID, co w opcji 2 wymuszałoby aktualizację modułu produktowego —
wersje bez zmiany tożsamości redukują problem; (b) gdy często zmienia się struktura
ofert (abonamenty, pakiety medyczne), a cenniki są reużywalne, opcja 1 wymuszałaby
częste przepinanie produktów w cennikach; (c) droga użytkownika przez system (od
cenników do produktów czy odwrotnie). Modele odczytu asynchroniczne mogą łagodzić, ale
jedna strona relacji jest wiodąca. Doświadczenie projektowe autora: **preferowana
opcja 2**. Ważne: niezależnie od kierunku, parametry kalkulatorów/komponentów to w
rzeczywistości właściwości produktów — ta zależność istnieje w danych, czy chcemy,
czy nie.

### 9.3 Ordering, Billing, Accounting

**Ordering.** Zła odpowiedź: „niech pricing nasłuchuje zdarzeń i liczy" — wtedy pricing
zna order, statusy, kontekst procesu — „przestaje być pricingiem". Pricing jest bytem
generycznym (działa tak samo w każdej branży), więc nie daje przewagi konkurencyjnej —
jest **capability**, „zieloną platformą z Lego": stabilna podstawa, na której buduje się
wieżowiec. Właściwy wzorzec: **świadoma orkiestracja wyliczeń przez procesy zewnętrzne**
— ordering woła pricing per linia zamówienia; pricing nie wie, że to zamówienie;
dostarcza capability, nie proces. W nomenklaturze DDD: **pricing jako Open Host
Service**, ordering jako klient.

**Billing.** OHS nie wystarcza, gdy rozliczenie następuje po czasie i z wielu zdarzeń:
logistyka rozliczana na koniec miesiąca wg wolumenu, historii płatności faktur,
scoringu i „15 innych parametrów" — skąd ordering miałby znać scoring? Pricing na
eventach to droga w jedną stronę. Brakujące ogniwo: **billing — moduł rozliczeń**.
Pojawia się, gdy: rozliczasz użycie w czasie, agregujesz wiele zdarzeń, generujesz
faktury cykliczne, masz rabaty wolumenowe, kredyty, limity. **Billing nie zastępuje
pricingu — orkiestruje go. Kluczowa zasada: billing nigdy nie liczy ceny sam, zawsze
deleguje do pricingu.** Logika wartości w jednym miejscu; billing odpowiada za
agregacje i cykle.

**Accounting.** Częste nieporozumienie: „pricing liczy pieniądze, więc powinien wiedzieć
o accountingu" — nic bardziej mylnego. **Pricing wie, skąd się wzięła wartość;
accounting wie, gdzie ją zaksięgować/przechować.** Pytania „ile podatku firma zapłaci
w maju 2025", „ile prowizji wypłacimy operatorowi X za kwartał" wymagają zebrania
wyników obliczeń zawierających komponenty VAT/prowizja — to robi accounting, mapując
komponenty na konta, zapisy księgowe i raporty. Pricing nie zna planu kont, accounting
nie zna algorytmów cenowych; integracja np. przez billing.

### 9.4 Pricing w architekturze organizacji (L10)

Pricing to **generyczna zdolność organizacji do obliczania wartości według reguł
i kalkulatorów** — niezależna od branży: e-commerce (ceny, rabaty, podatki), bankowość
(odsetki, prowizje, harmonogramy), telko (minuty, GB, pakiety, roaming), SaaS
(subskrypcje, kredyty), energetyka (taryfy, strefy czasowe, moce), ubezpieczenia
(składki, ryzyko, zniżki). Mechanika zawsze ta sama: są reguły, obowiązują w czasie,
zależą od kontekstu, dają wynik, który musi być wytłumaczalny.

**Antywzorzec: biblioteka pricingowa (Shared Kernel).** Broniłaby się tylko dla
stabilnych, czystych funkcji matematycznych — ale pricing nie jest czystą funkcją;
wartość nadają parametry, konfiguracja, struktura komponentów. Problemy shared kernel:
(1) **sprzężenie binarne** — zmiana reguły cenowej = nowa wersja biblioteki = roll-out
każdej aplikacji klienckiej; ceny dyktują tempo deployu całej organizacji;
(2) **bezstanowość** — biblioteka nie pamięta, kiedy reguła obowiązywała, nie wyjaśni
wyniku, nie odtworzy przeszłych wyliczeń; (3) **brak właściciela** — platforma? zespół
sprzedaży? ten, kto ostatnio dotknął kodu? „Każda implementacja shared kernel kończy
się hamowaniem wydajności wytwórczej zespołów."

**Wzorzec docelowy:** pricing jak product czy accounting — **osobny moduł, własny
model, własna persystencja, jasne API, wyraźna odpowiedzialność**; **upstream**
dostarczający możliwości kalkulacyjne dla orderingu, billingu, quotingu, systemów
lojalnościowych, analityki, ryzyka i compliance. Korzyści: oddzielenie zmienności reguł
od logiki procesów (zmiana cen/rabatów/zasad nie wymaga ingerencji w ordering/billing,
zespoły nieblokowane deployem i koordynacją); jedno spójne miejsce liczenia wartości
(koniec rozjazdów i dublowania); równoległa praca zespołów, krótszy time-to-market,
niższy koszt poznawczy; historia, audytowalność i odtwarzalność wyników jako naturalna
cecha (zaufanie, compliance, skalowanie). „Procesy przestają liczyć, a zaczynają
orkiestrować. IT zamiast reagować na zmiany biznesowe zaczyna je umożliwiać."

Podział ról w dojrzałej architekturze: **product definiuje, co ma znaczenie; pricing
definiuje, jaką ma wartość; accounting zapisuje fakty.**

---

## 10. „Cztery perspektywy" (L11)

Na każdy archetyp moduł patrzy z czterech perspektyw; dla pricingu:

| Perspektywa | Bez archetypu | Z archetypem |
|---|---|---|
| **Analityczna** (odkrywanie i modelowanie zasad domeny — spójnie, uogólnienie, programowalnie) | reguły wartości ukryte, niespójne, rozsiane po procesach, raportach i integracjach; analiza = zgadywanie; „przypadkowe liczby przylepione do specyficznych obiektów biznesowych to norma" | jednolity model wartości; reguły jako dane/konfiguracja, wersjonowane, analizowalne bez sięgania do kodu; „analiza przestaje być interpretacją wyjątków, a staje się modelowaniem zasad" |
| **Programistyczna** (czytelny, silnie typowany, testowalny kod; mniejszy ciężar poznawczy) | kod pełen flag, if-ów, big decimali, skopiowanej logiki, wyjątków i hotfixów; kruchy, trudny do testowania, coraz mniej zrozumiały | kalkulatory, komponenty i reguły jako osobne testowalne byty; logika procesów upraszcza się do orkiestracji kalkulacji; kod generyczny, przewidywalny, stabilny |
| **Architektoniczna** (autonomiczne, skalowalne elementy; jasne zależności, lokalność zmian, długofalowa stabilność) | logika wartości rozproszona po wielu domenach/systemach, zależności niejawne; każda zmiana = koordynacja wielu zespołów, ryzyko efektu domina | jedno wyraźne capability, upstream dla orderingu, billingu i analityki; zmiany lokalne i przewidywalne |
| **Biznesowa** (szybkość i bezpieczeństwo reagowania bez blokowania się o IT) | każda zmiana reguł wartości = kodowanie, testy, wdrożenia; organizacja reaguje wolno i kosztownie | nowe oferty, rabaty i zasady jako konfiguracja, nie projekt IT; decyzja biznesowa = szybki, kontrolowany, odwracalny ruch |

Czy trzeba stosować cały archetyp? **Nie.** Jeden prosty przypadek + niska zmienność +
brak wymagań audytowych → prosty kalkulator w kodzie jest OK. Ale im więcej reguł,
im mocniej wchodzą czas i kontekst, im częściej zmiany przychodzą z biznesu, a nie
z IT — tym szybciej brak archetypu zaczyna spowalniać. Cel dydaktyczny: zmiana sposobu
myślenia, nie narzucenie implementacji.

---

## 11. Typowe błędne implementacje i konsekwencje

| Błąd | Opis | Konsekwencje |
|---|---|---|
| Pole `price` w rosnącym biznesie | jedna kolumna / BigDecimal bez kontekstu | brak waluty, historii, kontekstu; „ile właściwie mam zapłacić po tygodniu?"; dodawanie 100 EUR do 450 PLN przechodzi |
| Stacja walutowa w tabeli | `price_pln`, `price_eur`… zamiast Money | eksplozja pól, rozjazd wymagań per rynek |
| Single-tenant per rynek | osobne wdrożenie na każdy kraj/klienta | chaos przeniesiony do wdrożeń i operacji |
| Czas w kolumnach | `price_from_hour`, `weekend_price_flag`, `night_rate_start`… | „tabela opisuje rosnącą panikę zespołu"; nie skaluje się przy nakładaniu/wykluczaniu promocji, walutach, segmentach |
| Pricing w if-ach w kodzie | zwarta bryła warunków, magiczne liczby | dopłata od całości zamiast nadwyżki, `10:01` zamiast domknięcia przedziału, rabat po złej godzinie; działa „dopóki przypadek sprzyja"; każda zmiana chwieje konstrukcją |
| Kolejność if-ów jako model | trzy cenniki „walczą", wygrywa wyższy if; ten sam warunek w 5 miejscach z różną interpretacją | pricing = wynik kolejności warunków; brak odpowiedzi „dlaczego ta cena" |
| UPDATE ceny na bazie | zmiana ceny jako aktualizacja rekordu; deploy 23:55; backfix „paluszkiem na produkcji" | unieważniona przeszłość, złamana transparentność, ryzyko prawne |
| Historia tylko z eventów | event sourcing wartości bez modelu obowiązywania | rozwiązanie techniczne, nie modelowe; wywala się na zmianie algorytmu (feature toggles, „historia w gicie?") |
| Historia liczb bez historii instrukcji | pamiętamy kwoty, nie reguły | retro-billing niepoliczalny; spóźnione eventy gubią bonusy → gwarantowane reklamacje |
| Rozproszona kalkulacja (dane zamiast funkcji) | front, backend, mobilka, panel, integracje liczą każdy po swojemu | 4 różne ceny tej samej rzeczy; reklamacje, ręczne korekty, konflikty z partnerami, problemy prawne, erozja zaufania |
| Kalkulator zwracający mapę składowych | semantyka wpakowana w funkcję | „monolit przebrany za funkcję"; każda zmiana składowej = podmiana kalkulatora; konsumenci muszą znać strukturę |
| 3 klasy per perspektywa / 3 metody w kalkulatorze | TotalCalculator/UnitCalculator/MarginalCalculator albo 3 metody | 5 funkcji → 15 klas tej samej matematyki; albo każda klasa implementuje 3 różne funkcje naraz |
| Klienty liczące samodzielnie | partner/front mnoży unit·N | rozjazdy zaokrągleń, ping-pong „czyja wina" |
| Niemutowalny komponent bez wersji | zmiana = nowy ID | efekt domina: kaskadowe przepinanie taryf, produktów, ofert, integracji |
| Brak rozbicia tortu | system zwraca 1 liczbę, firma potrzebuje 8 | złożoność migruje do księgowości/operacji/serwis desku; „każdy kroi tort po swojemu"; archeologia zamiast analizy; wykładniczy koszt obsługi |
| Pricing znający proces (ordering) | pricing nasłuchuje zdarzeń, zna statusy zamówień | pricing przestaje być pricingiem; capability sklejone z procesem |
| Billing liczący ceny sam | duplikacja logiki wartości w module rozliczeń | dwa źródła prawdy o wartości |
| Biblioteka / Shared Kernel | wspólny jar z logiką cen | sprzężenie binarne (ceny dyktują deploye), bezstanowość (brak historii i wyjaśnień), brak właściciela domeny |
| Iloczyn kartezjański w tabeli (scenka 2) | wszystkie kombinacje parametrów × wartość; stan punktów przy kliencie | eksplozja kombinatoryczna; zamiast tego: parametry jako wymiary funkcji wielowymiarowej w kalkulatorach + komponenty |
| „Kolumna na zapas" (scenka 1) | nowa rata = nowa kolumna; 60 kolumn „na rozbudowę" | cena traktowana jako kolejna kolumna encji zamiast funkcji |
| Nazwa „pricing" brana dosłownie | „to wzorce e-commerce, nie dla mnie" | niewykorzystanie archetypu dla odsetek, prowizji, punktów, GB, scoringu — valuation |

---

## 12. Tabela mapowania: pojęcie domenowe → element archetypu

| Pojęcie domenowe (z modułu) | Element archetypu |
|---|---|
| kwota + waluta; „nie dodawaj EUR do PLN" | **Money** (value object; fundament) |
| punkty lojalnościowe, GB, minuty — wartość + jednostka | **Quantity** (uogólnienie Money) / PricingResult z jednostką |
| taryfa dzienna/nocna G11/G12; happy hour; przedział przez północ | **TimeRange** (lewostronnie domknięty, tryb cross-midnight) |
| ferie 15.01–25.02 → 29 zł; sezon wakacyjny | **DateRange** |
| progi wagowe paczek; wpływy 0–1000–4000; segmenty GB | **NumericRange** |
| „dowolna oś: waga, scoring, km…" | **CalculatorRange** (wspólny interfejs przedziałów) |
| opłata za przelew 5 zł, karta 15 zł, start ładowania 2 zł | **SimpleFixedCalculator** (funkcja stała) |
| paczka wg wagi, +2 zł / 30 min parkingu, +5 zł/GB ponad pakiet | **StepFunctionCalculator** (schodkowy) |
| pakiety 5/10/20 lekcji; 1/2/3/5 rowerów; brak ceny dla 4 szt. → błąd | **kalkulator dyskretny** (mapa; wyjątek poza kluczami) |
| kurs +100 zł każdego dnia okna sprzedażowego | **DailyIncrementCalculator** |
| cena rosnąca co sekundę 1999→3399 | **ContinuousLinearTimeCalculator** (interpolacja) |
| 57 + (Q−20)·3 + h·0,8 (wolumen + czas sesji) | **ContinuousLinearWithTime** (suma funkcji liniowych) |
| VAT 23%, marża 10%, prowizja, składka | **PercentageCalculator** |
| „w nocy ta funkcja, w dzień tamta"; „do 10 GB stała, dalej liniowa" | **CompositeFunctionCalculator** + **Ranges** (strażnik osi i rozłączności) + **selektor** (DATE, quantity, monthlyIncome) |
| „ile kosztuje n-ta sztuka?" | **interpretacja MARGINAL** |
| „średnio 80 zł/szt." | **interpretacja UNIT** |
| „ile ląduje na fakturze?" | **interpretacja TOTAL** |
| „policz total z kalkulatora jednostkowego" | **adapter** (unit-to-total itd.) — sam jest kalkulatorem |
| „policz mi cenę" (bez wnikania w interpretacje) | **fasada** (CalculateTotal/Unit/Marginal + automatyczny dobór adapterów) |
| „opłata za energię", „marża CPO za czas", „VAT" — nazwana część ceny | **Component** (SimpleComponent — liść; semantyka nad matematyką) |
| „czas sesji" vs `quantity` kalkulatora | **parameterMappings / transformParameters** |
| tort: energia + CPO + EMSP + VAT; netto jako suma | **CompositeComponent** (drzewo/graf komponentów) |
| „VAT liczony od sumy netto" | **parameter dependencies** (BaseAmount := value(netto)); deklarowane w kompozycie nadrzędnym |
| „pokaż, z czego składa się 26,57" | **ComponentBreakdown** (drzewo wyników) |
| „promocja obowiązuje w lutym"; „nowa taryfa od 1 lutego" | **ComponentVersion + Validity** (niemutowalna wersja, stała tożsamość komponentu) |
| „nie pozwól na dwie wersje na ten sam okres" | **VersionUpdateStrategy** |
| „rozlicz sesję z 14 lutego po lutowych stawkach" | **timestamp w parametrach** → wybór wersji przez czas |
| „darmowe 10 minut tylko dla B2C"; „rabat tylko w aplikacji" | **Applicability** (reguły stosowalności; AND z validity w liściu, OR po dzieciach w kompozycie) |
| „który cennik: VIP, promo czy mobilny?" | warstwa wyboru funkcji cenowej (stosowalność cenników) |
| katalog: „co sprzedajemy" | archetyp **Product** (osobny, izomorficzny strukturalnie) |
| koszyk/zamówienie woła o wycenę linii | **Ordering** jako klient pricingu (pricing = Open Host Service) |
| rozliczenie miesięczne, agregacja sesji, faktury cykliczne, rabaty wolumenowe | **Billing** (orkiestruje pricing; nigdy nie liczy sam) |
| „ile VAT zapłacimy w maju?", mapowanie na konta | **Accounting** (zapisuje fakty; nie zna algorytmów cenowych) |
| scoring klienta z formuły w Excelu („drzewo funkcji") | drzewo komponentów + kalkulatory (valuation; scenka 2) |

---

## 13. Pytania do biznesu przy odkrywaniu archetypu

Pytania diagnostyczne (z L07/L11 i całości modułu), których rozjeżdżające się odpowiedzi
sygnalizują potrzebę pełnego archetypu i rozdzielenia pricingu:

**Czy to w ogóle pricing/valuation?**
1. Czy w rozmowach padają słowa: naliczamy, wyliczamy, przeliczamy, rabat, stawka,
   prowizja, odsetki, limit, kara, „obowiązuje od"?
2. Czy liczycie wartości niepieniężne według reguł (punkty, GB, scoring, limity)?
3. Czy wynik liczenia musi być wytłumaczalny klientowi, partnerowi, regulatorowi?

**Funkcja i kontekst**
4. Czy ta sama rzecz ma różną cenę w zależności od czasu, kanału, segmentu, parametrów
   użycia? Ile wymiarów ma ta funkcja?
5. Czy istnieje kilka cenników jednocześnie poprawnych dla jednego klienta? Co wtedy
   optymalizujemy — cenę klienta, marżę, reguły?
6. Które składniki ceny liczą się zawsze, a które warunkowo (próg, segment, kanał,
   pora)? Czy „pierwsze 10 minut za darmo" to część funkcji, czy warunek aktywacji?
7. Jak często zmieniają się progi i warunki — raz na rok, czy co kampanię?

**Perspektywy ceny**
8. Co ma zwracać system: cenę końcową, jednostkową czy marginalną? Kto potrzebuje
   której? Czy przy wielu wymiarach „jednostka" w ogóle istnieje?
9. Kto kontroluje zaokrąglenia i kolejność operacji? Czy ktokolwiek poza modułem liczy
   coś sam (frontend, partner, Excel)?

**Składowe i interesariusze**
10. Z czego składa się kwota, którą płaci klient? Ile w niej podatku, prowizji, marży?
11. Kto dostaje który kawałek tortu (dostawca, operator, partner, regulator, my)?
    Kto dziś ręcznie rozdziela te pieniądze?
12. Czy breakdown ceny jest potrzebny klientowi lub regulatorowi?

**Czas i historia**
13. Czy ceny ogłaszane są z wyprzedzeniem („od pierwszego")? Jak dziś wdrażacie zmianę
    cennika (deploy o północy? update na bazie?)
14. Czy musicie wiedzieć, dlaczego cena była taka w przeszłości? Odtworzyć wyliczenie
    sprzed miesiąca/roku, także gdy zmienił się sam algorytm?
15. Czy rozliczacie zdarzenia z przeszłości (retro-billing, spóźnione eventy, okresy
    rozliczeniowe przecinające zmianę ceny)?

**Architektura i organizacja**
16. Czy produkt i jego cena zmieniają się z tą samą częstotliwością? Czy pracują nad
    nimi te same osoby biznesowe?
17. Czy pricing będzie miejscem eksperymentów, promocji i testów A/B? Czy zmiana ceny
    powinna być tania operacyjnie (konfiguracja zamiast projektu IT)?
18. Kto jest właścicielem reguł wartości? Ile miejsc w systemach dziś liczy ceny i czy
    dają ten sam wynik?
19. Kiedy następuje wycena: przy zamówieniu (ordering woła pricing), czy po czasie
    z agregacji zdarzeń (potrzebny billing)?
20. Jakie pytania zadaje księgowość („ile VAT w maju", „ile prowizji dla operatora X")
    — czyli jak komponenty mapują się na accounting?

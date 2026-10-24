# Fundamenty myślenia archetypowego (Moduł 01)

Materiał referencyjny dla agenta analizującego biznesy i kod legacy. Źródło: moduł wstępny
szkolenia "Archetypy Oprogramowania" (L01–L07).

---

## 1. Czym jest archetyp oprogramowania

**Archetyp (wzorzec archetypowy)** to gotowy, sprawdzony model dziedzinowy oparty o
ponadczasowe, uniwersalne pojęcia biznesowe — np. Party (strona w relacji), Order (zlecenie
różnego typu), Product (dobro różnego rodzaju). Archetyp:

- ma **elementy opcjonalne** — implementujesz tylko tę część modelu, która w danym biznesie
  faktycznie występuje (budowa ewolucyjna, nie "cały model z literatury albo nic"),
- ma **pleomorfizmy** — warianty struktury dopasowane do konkretnego biznesu (np. dla
  produktu: produkt unikatowy z numerem seryjnym, produkt sprzedawany na sztuki jak batoniki,
  produkt-usługa, która zużywa zasoby i rezerwuje dostępność innych zasobów w czasie),
- jest **konfigurowalny danymi** i **walidowalny tą konfiguracją** — nowe przypadki biznesowe
  to konfiguracja uniwersalnego modelu, nie development i wdrożenie,
- jest przygotowany na **bezinwazyjne dokładanie informacji** — struktura rośnie organicznie,
  bez "narośli" pól i flag,
- jest zorientowany wokół **jednego koherentnego problemu**: odpowiedź na pytania modelu
  wymaga użycia prawie wszystkich jego struktur danych (jak cohesive class) — dlatego
  archetypy są idealnymi kandydatami na **autonomiczne moduły** (zmiana implementacji nie
  wymusza zmian w innych modułach).

Cel praktyczny: zerwać z kodowaniem każdego przypadku z osobna i przenieść zmienność na
poziom **konfiguracji uniwersalnego modelu**. Wiedząc, jak budować modele odpowiadające na
generyczne pytania biznesu, unikamy pisania "pozornie innego, a w gruncie rzeczy tego samego
kodu po raz setny" (archetyp jako zdjęcie obciążenia kognitywnego z programisty).

### Rozróżnienie pojęć (raz, dla porządku — dalej nieodróżniane)

Szkolenie świadomie NIE odróżnia w praktyce wzorców archetypowych, analitycznych, modeli
danych, pojęciowych i głębokich modeli (brak wartości praktycznej, zbędny narzut kognitywny).
Dla porządku:

| Pojęcie | Co to jest | Czy przedmiot szkolenia |
|---|---|---|
| **Model biznesowy** | Przepływy pieniężne: kto, komu, za co i jak płaci; wartość, łańcuch dostaw; decyduje o strategii i opłacalności (katalogi: Business Model Navigator; techniki: Business Model Canvas, Value Stream Mapping) | NIE — zakładamy, że decyzje na tym poziomie już zapadły; warto znać, ale "podstawą biznesu są kontakty i relacje" |
| **Model dziedzinowy** | Wewnętrzne modele systemu opisujące stan i zachowania; liczba mnoga — system to wiele współpracujących modeli, każdy wyspecjalizowany w poddziedzinie i zamknięty w module | TAK — główny przedmiot |
| **Wzorce archetypowe** | Jak wyżej (Party, Order, Product...); opcjonalne elementy, pleomorfizmy, konfiguracja | TAK |
| **Wzorce analityczne** | Przydatne uogólnienia pojęciowe; bardziej ogólne, bez mechanizmu konfiguracji pod konkretny biznes, wymagają doprecyzowania przed użyciem | TAK (łączone z archetypami) |
| **Wzorce projektowe** | Niskopoziomowe, techniczne rozwiązania konstrukcyjne (singleton, factory method, observer, strategy); cel: struktura kodu, elastyczność, reużycie | NIE — inny poziom |
| **Głębokie modele** | Wspólne dla wielu dziedzin struktury danych i algorytmy (grafy, dopasowania...) leżące u podstaw działania biznesu | TAK — rozszerzenie ponad literaturę |

### Czym archetyp NIE jest

- **Nie jest modelem biznesowym** (strategią monetyzacji) — modeluje dziedzinę, nie przepływy
  pieniężne firmy.
- **Nie jest wzorcem projektowym** — działa na poziomie pojęć biznesowych, nie konstrukcji kodu.
- **Nie jest słownictwem z ERP** — nazwy (order, product) to tylko "nazewniki modeli"
  obciążone metaforą z życia dla łatwiejszego kojarzenia; tak jak "fabryka dekorowanych
  strategii nie musi dotyczyć zakładu wytwarzającego ozdoby". Order może być zleceniem
  wykonania zadania lub alokacji zasobu (zarządzanie pracą ludzi, zadania obliczeniowe na
  serwerze) — nie przywiązuj się do branżowego znaczenia słów.
- **Nie jest Platform Independent Model do generowania kodu** — te czasy minęły; dziś robi
  się to inaczej (z AI), szkolenie tego aspektu nie podejmuje.
- **Nie jest jedyną słuszną drogą** — to inspiracja do zmiany sposobu myślenia i baza pod
  rozbudowę, nie dogmat.
- **Nie jest naiwnym szkicem z książki** — modele książkowe nie uwzględniają współczesnych
  architektur rozproszonych, autonomii zespołów ani rozkładu odpowiedzialności na klasy
  (bogaty model dziedzinowy); podejście szkolenia przenosi archetypy "w XXI wiek".
- **Nie jest encją nazwaną rzeczownikiem z wymagań** — patrz sekcja 3.

---

## 2. Dlaczego różne branże sprowadzają się do tych samych modeli

Teza modułu: logistyka, bankowość i telekomunikacja wyglądają jak "zupełnie inne światy"
(inne dane, operacje, słownictwo — pozornie inny Ubiquitous Language), ale patrząc na to,
**co się w nich właściwie dzieje**, wyłania się wspólny schemat. Trzy systemy-przykłady:

| System | Branża | Opis | Naiwny model encji |
|---|---|---|---|
| **Fast Fox** | logistyka/kurier | przesyłki dla e-commerce; typy: standard/ekspres/pobranie; wymiary, waga, statusy; operacje: przyjęcie, sortownia, przypisanie kuriera, doręczenie/zwrot | ZlecenieTransportu, Paczka, Kurier, Sortownia, Faktura + LogistykaService |
| **Nova Bank** | bankowość | kredyty konsumenckie i hipoteczne; wniosek → weryfikacja → umowa → raty; harmonogram, nadpłaty, wakacje kredytowe, karta debetowa | Klient, Kredyt (umowa i wniosek w jednym = "kredyt bez kredytu"), Harmonogram, Rata + KredytService |
| **Connecto** | telekomunikacja | usługi internet/TV/telefon; pakiety złoty/platynowy; sprzęt (router, dekoder); aktywacja, rozliczenie miesięczne, zmiany pakietów | Umowa, Usługa, Sprzęt, ZlecenieTechniczne, Klient + TelekomService |

W każdym z nich moduł odnajduje **pięć archetypów** (szczegóły w sekcji 4): Product, Party,
Pricing, Ordering, Accounting. Mechanizm rozpoznania: mózg znający archetypy "nastraja się"
na szukanie znanych elementów — rzeczy, które sprzedajemy, łączymy w pakiety i typujemy —
i mapuje bardzo specyficzne pojęcia na znane modele.

**Reguła 3–5 wspólnych elementów**: każdy biznes pokryje się z archetypami w 3, 4, może 5
elementach — **nie wszystkich**. Każdy biznes ma coś specyficznego, niearchetypowego. To
zaleta: po wydestylowaniu znanych, sprawdzonych modeli specyfikę dostarcza się dużo łatwiej.

Idzie to głębiej niż ERP: nawet system klasy Brain-Computer Interface dla NASA (odczyt
intencji z mózgu astronauty na ISS) w większości opierał się na generycznych strukturach
danych i znanych algorytmach.

---

## 3. Anty-wzorzec: modelowanie "encjami wprost z rzeczowników" (szkoła Mariana)

Moduł personifikuje naiwne podejście w postaci "Mariana" — weterana z dogmatem "dane do
encji, logika do serwisów". Jego recepty i dlaczego zawodzą:

| Recepta Mariana | Co się psuje |
|---|---|
| Nowa cecha? **Dodaj pola/flagi do encji** (czyUbezpieczona, kwotaUbezpieczenia, czySMS, czyNetflix, czySpotify) | Encja rośnie **nieorganicznie** — "narośla" flag; przy jednej–dwóch przeżyjesz, przy zmianie co sprint "zagłada jest blisko"; każdy nowy produkt/usługa = development i wdrożenie; przy 50 usługach zamiast 5 model się wali |
| Nowa logika? **Dopisz if-y w serwisie** | **Eksplozja kombinatoryczna** przypadków (a czy express? a czy ubezpieczona? a ubezpieczony express bez SMS-a?); kaskady if-ów zależne od kombinacji (srebrny→złoty, złoty→platynowy); "będzie jedzone spaghetti" |
| Pakiet/zestaw? **Nowy typ w enumie** ("ubezpieczona") albo kombinacja flag, albo osobna tabela | Brak reprezentacji kompozycji; kolejne typy idą copy-paste'em; system staje się "nieorganicznym, przypadkowym zlepkiem łat" |
| Wiele kredytów/kart? **Przypnij kolekcje do encji Klient**, powiąż polem CardID | Ad-hoc relacje bez semantyki ("karta to nie umowa"); pakiety i rabaty stają się projektem "na dwa lata budżetu" |
| Historia? **Mutuj saldo w encji, a historię wyciągaj z Transaction Loga Oracle'a** | Mutacja stanu w miejscu = **historia znika**; odzyskiwanie z logów transakcyjnych jest kruche i się nie skaluje; audyt niemożliwy; raporty ("ile klient spłacił w sumie? jaka średnia nadpłata? kiedy szczyt spłat?") — brak danych, nie da się odtworzyć |
| Nowe raty? **Kolumna per rata w tabeli kredyt** (tajny skrypt z dyskietki) | Struktura danych zamiast danych; każda zmiana oferty = zmiana schematu; wiedza plemienna jednej osoby (Marian "wyrabiał dodatkowy etat, bo nikt nie rozumiał, co się tam dzieje") |
| Sprzęt a usługi? **Ręczny kod per połączenie** | "Dekoder obsługuje TV, ale czy Netflixa? Kto to waliduje?" — każda kompatybilność to ręczna walidacja w kodzie |

Wspólna diagnoza: **model nie wspiera realizacji wymagań** — jest kruchy, a praca z nim to
"droga w jedną stronę". Sygnał diagnostyczny w kodzie legacy: anemiczne encje + naiwne
update'y na bazie + serwisy-procedury z kaskadami if-ów + flagi boolowskie i rozrośnięte enumy.

Pułapka źródłowa: encje tworzone **wprost z rzeczowników wymagań** (paczka, kredyt, umowa)
wyglądają różnie w każdej branży i gubią wspólną strukturę. "Same rzeczowniki tego nie dają"
— dopiero zrozumienie **wewnętrznej logiki** modelu pozwala głęboko zrozumieć naturę biznesu.

---

## 4. Pięć archetypów rozpoznanych w module

Moduł wyprowadza je indukcyjnie z trzech systemów. (Katalog jest większy: "inwentarz,
silniki reguł, grafy itd." — te w dalszych modułach.)

### 4.1 Product (archetyp produktu)

Wspólna struktura: **rzecz** dostępna w ofercie → **typ/wariant** z cechami (czas, parametry,
warunki) → **egzemplarz** zrealizowany dla konkretnego klienta → **kompozycja** (zestaw
rzeczy oferowanych razem).

| Pojęcie modelu | Fast Fox | Nova Bank | Connecto |
|---|---|---|---|
| ProductType (rzecz — bo jest w ofercie) | wysyłka paczki | kredyt | internet, telewizja, Netflix |
| typy/warianty | standard, ekspres, pobranie (różne: czas dostawy, koszt, sposób doręczenia) | hipoteczny, gotówkowy, samochodowy (różne: oprocentowanie, okres, zabezpieczenia) | internet 100 Mb/s, telewizja 4K (różne parametry i cena) |
| ProductFeatureType (cecha) | masa, wymiary, rodzaj | kwota, oprocentowanie, okres | prędkość, jakość obrazu, liczba urządzeń |
| ProductInstance (egzemplarz) | konkretna paczka z parametrów zlecenia | konkretny kredyt z podpisanej umowy, przypisany do klienta | konkretna usługa przypisana do umowy, aktywna od daty, powiązana ze sprzętem |
| PackageType (kompozycja) | ekspres + ubezpieczenie + SMS | kredyt + karta z rabatem | pakiet złoty = zestaw usług |

Zakres: "zarządzanie wszystkim, co w jakikolwiek sposób wpływa na stan Twoich zasobów, nie
tylko finansowych". Zamiast flag na encji: nowy produkt/pakiet = nowy rekord konfiguracji.

### 4.2 Party (archetyp podmiotu)

Wspólna struktura: **osoba lub firma**, która **odpowiada za coś** (pełni rolę), plus
**zależności** między podmiotami.

| Pojęcie | Fast Fox | Nova Bank | Connecto |
|---|---|---|---|
| Party (podmiot: osoba/firma) | nadawca, odbiorca, kurier, firma kurierska, kierownik, firma partnerska | klient, poręczyciel, doradca, bank, firma-klient, przedstawiciel | abonent, użytkownik sprzętu (członek rodziny/pracownik), technik, operator |
| PartyRole (rola = "odpowiada za...") | nadawca odpowiada za wysłanie, kurier za dostarczenie, kierownik za zespół, partner za region | klient podpisuje, poręczyciel zabezpiecza, doradca ocenia i obsługuje, bank odpowiada za ofertę i procedury | abonent korzysta, technik instaluje, operator odpowiada za pakiet |
| PartyRelationship (relacja) | kurier należy do zespołu; firma odpowiada za obszar; osoba działa w imieniu firmy | klient działa osobiście lub przez pełnomocnika; poręczyciel ↔ kredytobiorca; doradca w imieniu banku | technik na zlecenie firmy; osoba korzysta z usługi kupionej przez kogoś innego; abonent reprezentuje organizację |

Modeluje "osoby, organizacje, zespoły, działy, podmioty w ogólności, ich role i relacje".
Kluczowy sygnał: ta sama osoba/firma w wielu rolach; rola ≠ podmiot.

### 4.3 Pricing (archetyp wyceny)

Wspólna struktura: rzecz i jej cechy (jak w Product) + **wartość** + **obliczanie wartości**
jako funkcja egzemplarza i jego cech (**kalkulator** zamiast if-ów w serwisie).

| Pojęcie | Fast Fox | Nova Bank | Connecto |
|---|---|---|---|
| co ma wartość | wysyłka paczki; także kompozycja (paczka+ubezpieczenie) jako całość | kredyt; wartość rozłożona w czasie na raty, każda z częścią kapitałową i odsetkową; kompozycja kredyt+karta ma łączną wartość | usługa (abonament miesięczny); pakiet wyceniany jako kompozycja |
| cechy sterujące kalkulacją | ekspres?, masa, wymiary | kwota, oprocentowanie, okres ("to cechy decydują, jak działa kalkulator") | prędkość, jakość obrazu, liczba urządzeń |

Pojęcia: ProductType, ProductFeatureType, ProductFeatureInstance (konkretna wartość cechy),
Money (wartość, zwykle pieniężna), Calculator. Wycena dotyczy "nie tylko złotówek czy
dolarów, ale też punktów lojalnościowych czy wifecoinów". Wycena kompozycji ≠ suma cen
elementów — liczy się wartość całej kompozycji.

### 4.4 Ordering (archetyp zlecenia)

Wspólna struktura: **ktoś składa zlecenie**, wskazuje jedną lub więcej rzeczy z parametrami
i cechami (+ miejsce, czas), a zlecenie **uruchamia proces realizacji**.

| Pojęcie | Fast Fox | Nova Bank | Connecto |
|---|---|---|---|
| Order | zlecenie transportu (co, komu, gdzie, kiedy) | wniosek kredytowy ("to także forma zlecenia") | zamówienie pakietu usług |
| OrderItem + ProductFeatureInstance | przesyłka ekspresowa z ubezpieczeniem; ilości, cechy | kredyt hipoteczny z kartą; kwota, okres, oprocentowanie | internet+TV+Netflix; prędkość, liczba urządzeń, jakość; miejsce i czas aktywacji |
| proces realizacji | przyjęcie, sortowanie, doręczenie | ocena wniosku, podpisanie umowy, uruchomienie środków | przydział technika, przygotowanie sprzętu, aktywacja usług |

Realizacja zlecenia = **utworzenie ProductInstance** i dalsze operacje — a nie "ustawienie
flagi zamówiony na encji paczka". Składający to Party. Generalizacja poza sprzedaż: zlecenie
wykonania **dowolnej rzeczy lub czynności** (zadania ludzi, joby obliczeniowe, alokacja zasobu).

### 4.5 Accounting (archetyp księgowania / śledzenia przepływu wartości)

Wspólna struktura: **zasoby** w **kontenerach**; każde zdarzenie to **przeniesienie** zasobu
między kontenerami, **rejestrowane** z pełnym kontekstem (kto, kiedy, ile, skąd-dokąd) —
historia jest kompletna z zapisów, niczego się nie zgaduje i nie nadpisuje.

| Pojęcie | Fast Fox | Nova Bank | Connecto |
|---|---|---|---|
| zasób (Quantity/Money) | paczki | pieniądze | dane (GB), minuty, dostęp do usług |
| kontener (Account) | fizyczne: tir, sortownia, paczkomat | logiczne: konto klienta, konto zobowiązania (konto banku) | systemowe: limit danych, konto zużycia |
| przeniesienie (Transaction) + zapis (Entry) | paczka z tira do sortowni — zdarzenie z pełnym kontekstem; odtwarzalny cały szlak, rozliczalny każdy etap | spłata = przesunięcie środków konto klienta → konto zobowiązania; nadpłaty, koszty, odsetki = kolejne przeniesienia; historia precyzyjna, gotowa do audytu | zużycie 3 GB = przeniesienie z limitu do zużycia; stąd wiadomo, kiedy przekroczono limit, kiedy doliczyć opłatę, kiedy zakończyć usługę |

Antyteza mutacji salda: **nie nadpisujemy stanu — rejestrujemy przesunięcia**. Przyjęcie
paczki na magazyn "to transakcja, jak ta w banku, tylko z tira do sortowni".

---

## 5. Rozpoznawanie archetypów w wymaganiach

### 5.1 Sygnały językowe (z przykładów modułu)

| Sygnał w opisie biznesu | Podejrzany archetyp |
|---|---|
| "oferujemy X", "X występuje w typach/wariantach", "pakiet / zestaw / jako jeden produkt w cenniku", "klient wybiera / dokupuje / odłącza / zawiesza", cechy różniące warianty | Product |
| "za X odpowiada osoba/firma...", "w imieniu", "pełnomocnik / przedstawiciel / poręczyciel", "należy do zespołu", "odpowiada za region", role nazywane rzeczownikami odosobowymi (nadawca, kurier, doradca, abonent, technik) | Party |
| "cena / wartość / koszt zależy od...", "obliczamy / naliczamy / rozliczamy", "rabat", wartość pakietu jako całości, wartość rozłożona w czasie (raty), wartości niepieniężne (punkty) | Pricing |
| "klient składa zlecenie / wniosek / zamówienie", "wskazuje co, ile, z jakimi parametrami, gdzie i kiedy", "to uruchamia proces realizacji" | Ordering |
| "pełna historia — kto, kiedy, ile", "audyt", "rozliczyć każdy etap", "limit / zużycie / saldo", rzeczy przemieszczające się między miejscami/kontami, "nie da się odtworzyć" (jako ból) | Accounting |

### 5.2 Słowa mosty i przymiotniki (techniki kognitywne, L05)

Dwie techniki kognitywne wspólne dla wszystkich wzorców:

1. **Rysowanie** — "jeżeli dobrze uchwycisz wizualnie problem, rozwiązanie nasuwa się samo"
   (np. biznes narysowany jako graf → bingo, masz algorytmy grafowe).
2. **Słowa mosty** — wyrazy (lub bliskoznaczne) łączące słownictwo konkretnej dziedziny ze
   słownictwem dziedziny abstrakcyjnej. Przykład: planowanie projektów mówi "etapy,
   finansowanie, pętle, cykle"; grafy mówią "węzły, krawędzie, trawersowanie, cykle" —
   "cykle" i "pętle" to most do modelu grafowego.
   - **Pomiń rzeczowniki, patrz na przymiotniki** (i przysłówki): rzeczowniki prowadzą do
     naiwnych encji; przymiotniki zdradzają strukturę głęboką. "Następny" → graf;
     "optymalnie", "minimalnie" → algorytm dopasowania (np. problem plecakowy).

### 5.3 Pytania do biznesu (wyprowadzone ze struktur archetypów)

- Product: Czy to, co opisujesz, jest *w ofercie*? Czy występuje w typach/wariantach? Czym
  różnią się warianty (cechy)? Czy łączycie to w pakiety/zestawy? Jak często dochodzą nowe
  warianty — czy każda nowa pozycja oferty ma wymagać developmentu?
- Party: Kto (osoba czy firma?) odpowiada za ten krok? Czy ktoś działa *w imieniu* kogoś?
  Czy jeden podmiot bywa w wielu rolach? Jakie zależności łączą podmioty?
- Pricing: Od jakich cech zależy wartość? Czy pakiet ma własną cenę, inną niż suma składników?
  Czy wartość bywa niepieniężna? Czy jest rozkładana w czasie?
- Ordering: Co dokładnie wskazuje składający (rzeczy, ilości, parametry, miejsce, czas)?
  Co uruchamia proces realizacji? Co powstaje w wyniku realizacji?
- Accounting: Czy potrzebna jest pełna historia (kto, kiedy, ile, skąd-dokąd)? Czy audyt /
  raporty w czasie (sumy, średnie, szczyty)? Co jest zasobem, co kontenerem, co przeniesieniem?

### 5.4 Heurystyki analityczne i architektoniczne (sekrety konsultanta, L05)

Wysokopoziomowe, szybkie reguły — wstępnie wskazują granice modułów i sugerują wzorce; nakładanie
kilku daje dokładniejszy obraz; nie trzeba stosować wszystkich:

1. **Prawo Conwaya i jego rozszerzenie: podążanie za ekspertami domenowymi.**
2. **Unikanie splątania aspektów biznesowych** — aż do wycinania kluczy obcych.
3. **Analiza procesów pod kątem alternatywnych wejść i wyjść** (alternatywne ≠ błędy w
   procesie — to oczywiste).
4. **Analiza aspektów "becoming"** — pojawianie się nowych typów; samo podążanie za granicami
   podprocesów jest naiwne i niebezpieczne.
5. **Potencjalna produktyzacja** — bezpośrednio związana z archetypami i wartością biznesową.
6. **Prawdopodobieństwo i częstotliwość zmian** (perspektywa procesu wytwórczego).
7. **Szukanie generycznych pytań, na które odpowiada system** — "ulubiona i niezawodna;
   szybka, tania i diablo skuteczna".

Po heurystykach: **techniki precyzyjne ("symulacje")** — droższe, więc najpierw ogranicz
przestrzeń heurystykami. Symulujemy "co by było gdyby", biorąc pod uwagę:

- granice spójności transakcyjnej; SLA dostępności i czasu procesowania,
- łączenie modeli, by zmniejszyć liczbę kontekstów w procesach biznesowych,
- liczbę integracji; wykrywanie zależności dwukierunkowych i Single Point of Failure,
- **Single Source of Truth**: zakres danych zmieniających się razem i używanych razem — by
  uniknąć zbyt dużej granulacji poddziedzin,
- read modele zasilane z kilku źródeł — by odciążyć modele archetypowe,
- weryfikację pomysłów przez szukanie **"schizofrenicznych kontekstów"** — duplikacji
  logiki, która zmienia się razem,
- **antywymagania** — technika sprawdzająca "kuloodporność" modeli.

---

## 6. Cztery perspektywy (fasetki) na każdy archetyp (L04)

Każdy wzorzec jest w szkoleniu oglądany z czterech perspektyw; dla każdej pokazuje się
**konsekwencje braku archetypu i skutki jego wprowadzenia**. Perspektywy wzajemnie na siebie
wpływają — chodzi o uchwycenie powiązań przyczynowo-skutkowych między nimi. To odwrotność
myślenia top-down (gdzie programista dostaje artefakty analityczne bez wpływu na nie):
tu **odkrycia na poziomie kodu propagują się do analizy, a nawet biznesu**; architektura
wpływa na analizę, by uczynić ją implementowalną na realnym sprzęcie i racjonalnie
wykorzystać potencjał wytwórczy zespołów.

| Perspektywa | Esencja |
|---|---|
| **Biznesowa** | Szybkość reagowania na zmiany. Jeden model = centrum decyzyjne dziedziny → sprawna logistyka procesu wytwórczego. Konfiguracja danymi = zmiany bez developmentu i wdrożenia (szybkość, kontrola, audytowalność, pewność działania). Autonomia obszarów → niezależne eksperymenty i reakcje na rynek bez czekania na cudze priorytety. Zaawansowane struktury danych dają "praktycznie bezkosztowo" wyrafinowane funkcje: przestrzenie algebraiczne typów z operacjami same sugerują, co jest możliwe (graf → algorytmy grafowe → funkcje do sprzedania). Komunikat "użyjemy gotowego, sprawdzonego rozwiązania" buduje zaufanie biznesu. |
| **Analityczna** | Analiza = znalezienie **głębszych zasad** wyabstrahowanych ze specyficznych przypadków opowiadanych przez klienta (nie: nadanie struktury wywiadom w formie user story / bulletów). Archetypy dają gotowe modele jako bazę pod rozbudowę i szybsze wejście w nową dziedzinę. Modele są **implementowalne** we współczesnych architekturach — koniec z zarzutem "tak się robiło 30 lat temu w czasach Pentium 200" i z "zasłoną dymną" modelu czysto konceptualnego, przez którą artefakty analityczne są jednorazowe i szybko się dezaktualizują (brak spójności analiza↔architektura). Naiwny podział problemu rozproszonego na moduły = katastrofa architektoniczna. |
| **Architektoniczna** | Wzorce dają strukturę danych przygotowaną na bezinwazyjną rozbudowę + konfigurację danymi. Moduły z **realną autonomią** = lokalność zmian (antywzorzec: Shotgun Surgery), osiągana przez Single Source of Truth i **unikanie zdarzeń transferujących stan — komunikujemy wydarzenia biznesowe**. Synergia ze strategicznym DDD: Evansowska klasyfikacja poddziedzin nabiera sensu (generyczne zarządzanie użytkownikami, generyczny katalog produktów — urealnione). Decyzja architekta: archetyp jako głęboki model w osobnym module/bibliotece? jako usługa na poziomie capability? jako core domain z nazwami przemianowanymi na dziedzinowe? |
| **Programistyczna** | "Widać najwięcej wartości." Elementy wzorców staną się agregatami, projekcjami albo zwykłymi anemicznymi encjami — ale najważniejsza jest **logika w modelach**: dopiero zrozumienie wewnętrznej logiki daje głębokie zrozumienie natury biznesu; "same rzeczowniki tego nie dają". **Silnie typowane modele zmuszają do zadania kluczowych pytań o model biznesowy.** Archetyp zdejmuje obciążenie kognitywne — koniec pisania tego samego kodu po raz setny. Modele budowane ewolucyjnie: bierzesz tylko część, która występuje w Twoim biznesie. Struktury danych mają standardowe algorytmy "gratis w bibliotekach", mapowalne na operacje biznesowe, o których nikt nie pomyślał na poziomie wymagań. |

---

## 7. Architektura warstw nad archetypami (L02)

- **Warstwa głęboka**: archetypowe modele (fundament, capability).
- **Warstwa procesów/serwisów** nad nią: automatyzuje procesy, wywołuje warstwę głęboką
  w odpowiedniej kolejności z odpowiednimi parametrami; zawiera wiedzę pozyskaną od
  ekspertów domenowych.
- **Dwa typy GUI pod dwa typy użytkowników**:
  - **laik** → GUI **task-based** (prowadzenie krok po kroku; nie musi rozumieć meandrów
    dziedziny),
  - **ekspert** → GUI **induktywne** (działanie wprost na głębokich modelach; ekspert sam
    kreuje potrzebne procesy — jego mózg jest "kolejną warstwą systemu z wiedzą ekspercką").

Analogia samochodowa: różne marki na tej samej płycie podłogowej — gotowe komponenty
fundamentów biznesu uwalniają czas na **ergonomię** i **obsługę szczególnych przypadków**,
które stanowią o przewadze rozwiązania.

### Reguła nadrzędna: szczególne przypadki

**Zanim zabrudzisz model archetypowy if-em ze special case'em, zastanów się, czy wymagania
nie da się wyrazić aktualnie dostępnymi typami.** Jeśli nie — special case to rozbudowa
modelu w nieprzewidzianym kierunku albo przeniesienie do warstwy procesów, nie if w modelu.
Archetypy często wręcz **naprowadzają na szczególny przypadek przez to, że jest niemożliwy
w modelu** — to trigger do głębszej analizy i mapowania na przypadek biznesowy ("co z tego
wynika?"). Motto: **dobry model to taki, który pozwala zadawać trudne pytania.**

---

## 8. Kiedy opłaca się szukać archetypów (L02)

- **Koszt jest mały w skali przedsięwzięcia**: z heurystykami już **kilkugodzinna sesja
  analityczna** daje szansę zidentyfikować od kilku do kilkunastu modeli.
- **Dwa tryby użycia**: (a) odkrywanie archetypów w istniejących wymaganiach;
  (b) **archetyp jako drogowskaz** — gdy wizja biznesu nie jest wykrystalizowana, archetyp
  podpowiada, jak działają analogiczne biznesy i czego jeszcze można oczekiwać od modelu
  ("o czym jeszcze nie pomyśleliśmy").
- **Model pojęciowy = "granie na kodach"**: wchodzisz do projektu i rozumiesz więcej od osób
  bez tej wiedzy; pokazujesz odrobione lekcje.
- Gdy model archetypowy jest **zbyt odległy od pojęć biznesu**: użyj **kształtu** modelu
  (dosłownie struktury prostokątów), zmieniając nazwy prostokątów na pojęcia znane biznesowi.
- Dostajesz też **gotowe struktury danych (model bazy)** — ale literatura kończy się przed
  rozkładem odpowiedzialności na klasy (bogaty model, DDD/OO); szkolenie wzbogaca dane
  o zachowania tam, gdzie ma to sens.
- **Założenie bazowe: nieustanna zmiana wymagań.** "Chodzenie po wodzie jest łatwe, tak samo
  jak tworzenie softu na podstawie wymagań — o ile obie te rzeczy są zamrożone." Rozwiązania
  mają pozwalać szybko reagować na zmiany.
- Kontekst rynkowy (mapy Wardleya): co 30 lat temu było przewagą konkurencyjną, dziś jest
  **commodity** — dlatego liczy się nadbudowa nowych funkcji ponad archetypami i reagowanie
  bez czekania na cykl wydawniczy.

### Głębokie modele: struktury danych i algorytmy

Szkolenie schodzi poniżej modeli danych do **głębokich modeli** — wspólnych dla wielu
dziedzin algorytmów i struktur (np. grafy: wycinanie ścieżek, odkrywanie wysp → budowanie
produktów "niewyobrażalnych dla biznesu"). Z doświadczeń konsultanckich: każde zastosowanie
grafu rozwiązywało problem u podstaw biznesu, na który lokalni projektanci nie wpadli przez
kilkanaście lat; wdrożenie potrafiło w kilka tygodni wygenerować dodatkowe siedmiocyfrowe
kwoty obrotu. Reguła rozumienia: **"nie rozumiesz problemu, dopóki nie potrafisz wskazać
odpowiedniej struktury danych i algorytmu, który go rozwiązuje — wszystko inne to prywatne
urojenia, których procesor nie zamieni w złoto."** (Kontrpunkt do "nie rozumiesz, jeśli nie
umiesz narysować" — przy skomplikowanych mechanikach kilka prostokątów i strzałek nic nie
wnosi.)

---

## 9. Dwa podejścia do wdrażania archetypów (L04/L06)

| Podejście | Opis |
|---|---|
| **Abstrakcyjne (capability)** | Wyabstrahowane pojęcia archetypu (ProductType, Party...) pojawiają się wprost w kodzie jako capability; nad nimi nadbudowa operacji wyższego rzędu. Zamysł twórców katalogów modeli. |
| **Konkretne (rename)** | Zmiana nazw klas na pojęcia dziedziny, nad którą pracujesz — **z zachowaniem relacji między elementami** (kształt modelu zostaje, nazwy się zmieniają). |

Oba mają konsekwencje omawiane w szkoleniu — wybór ma być świadomy. Wybór wiąże się z decyzją
architektoniczną: moduł/biblioteka z głębokim modelem vs usługa-capability vs core domain
z przemianowanymi nazwami.

---

## 10. AI (LLM) vs ludzki hipokamp (L05)

- LLM poproszony o znalezienie archetypów w wymaganiach znajdzie **tylko te wyrażone
  explicite lub kojarzące się po nazwach rzeczownikowych**. Dopytany "a może widzisz ten
  archetyp?" — zwykle potwierdzi, **ale to Ty musisz wiedzieć, o co dopytać** (stan na 2025).
- LLM **nie wyabstrahuje domeny z wymagań** i nie stworzy np. generycznego API. Hipoteza:
  natura transformera — teoretycznie mógłby znaleźć wektory równoległe w przestrzeni
  embeddingów (jak król−królowa ≈ mężczyzna−kobieta), ale wg ekspertów problemem jest
  **liczba dobrych przykładów** w danych treningowych.
- **Hipokamp** odpowiada za uogólnienia i przenoszenie znaczeń; ma inną strukturę niż LLM
  (warstwy sześciokątnych kafelków przestrzeni 2D). Trwają prace nad sztucznymi hipokampami,
  ale póki co ludzki hipokamp daje przewagę w wyszukiwaniu wzorców archetypowych.
- **Trening hipokampa**: kilka przykładów per wzorzec z dziedzin **mocno od siebie
  oddalonych** → generalizacja (unoszenie pojęcia w górę, pomijanie nieistotnych detali)
  i przenoszenie znaczeń (między dziedzinami). Ludzie różnią się stylem uczenia
  (dywergentnie: przykłady→uogólnienie; konwergentnie: teoria→przykłady; różna liczba/czas
  ekspozycji). Ćwiczenie: po każdej ekspozycji zastanów się, w których Twoich historycznych
  projektach dałoby się zastosować dany archetyp (nie po to, by tam wracać — dla treningu).
- Metodyka szkolenia: intuicje z projektów doradczych są **dekonstruowane do procedur
  powtarzalnych przez każdego** ("junior i senior otrzymują taki sam rezultat") — bez
  "wyciągania królika z kapelusza"; proces budowy takiej metodyki trwa lata.

Wniosek operacyjny dla agenta AI: **nie czekaj, aż archetyp sam się pokaże w rzeczownikach —
aktywnie skanuj wymagania listą archetypów i pytaj "czy to jest ten wzorzec?"**, używając
sygnałów z sekcji 5.

---

## 11. Archetypy w procesie sprzedaży usług IT (L07)

- Gotowe rozwiązania kodowe + AI → po spotkaniu z klientem można w **kilka godzin**
  zaproponować MVP przekraczające oczekiwania; na jego podstawie zapada decyzja o wyborze
  dostawcy / starcie inicjatywy. Ostrożnie licząc: redukcja kosztu wytworzenia o połowę.
- Powiązana rola rynkowa: **Forward Deployed Engineer** — silne umiejętności inżynierskie
  (czysty, produkcyjny kod), elastyczność i samodzielność w niejasnych warunkach, tłumaczenie
  złożonych koncepcji na język klienta, orientacja na misję (bezpieczeństwo, administracja,
  infrastruktura). Obowiązki: analiza problemów klienta (dane, procesy, bolączki;
  komunikacja z nietechnicznymi interesariuszami), implementacja (integracje, pipeline'y
  danych, dashboardy, lekkie aplikacje, adaptacja systemów firmy do środowiska klienta),
  wdrożenie i utrzymanie (wsparcie użytkowników, doskonalenie wg feedbacku), most
  klient ↔ zespół produktowy (wymagania, błędy, pomysły, wpływ na produkt).

---

## 12. Ściąga reguł i maksym modułu

1. Pozornie różne branże → ten sam schemat, gdy patrzysz na to, **co się dzieje**, a nie jak
   się nazywa. Rzeczowniki dzielą, struktura łączy.
2. Każdy biznes pokryje 3–5 archetypów + swoją specyfikę; wydestyluj znane, specyfika
   zrobi się łatwiej.
3. Flagi, enumy i kaskady if-ów = nieorganiczne narośla i eksplozja kombinatoryczna; nowy
   przypadek ma być **konfiguracją**, nie developmentem.
4. Nie mutuj stanu — rejestruj przeniesienia (historia z Transaction Loga to kruche podejście,
   które się nie skaluje).
5. Zamówienie tworzy instancję produktu, nie ustawia flagi na encji.
6. Pomiń rzeczowniki, szukaj przymiotników i słów mostów do dziedzin abstrakcyjnych.
7. Najtańsza skuteczna heurystyka: **generyczne pytania, na które odpowiada system**.
8. Najpierw tanie heurystyki (zawęż przestrzeń), potem kosztowne symulacje.
9. Zanim dodasz if ze special casem — spróbuj wyrazić wymaganie istniejącymi typami;
   niemożliwość w modelu to trigger analizy biznesowej.
10. Dobry model pozwala zadawać trudne pytania; silne typy wymuszają kluczowe pytania o biznes.
11. Autonomia modułu = lokalność zmian; SSoT; wydarzenia biznesowe zamiast zdarzeń
    transferujących stan; unikaj Shotgun Surgery, SPOF i schizofrenicznych kontekstów.
12. Nie rozumiesz problemu, dopóki nie wskażesz struktury danych i algorytmu, które go
    rozwiązują.
13. Nazwy archetypów to metafory-nazewniki, nie ograniczenie dziedziny (order ≠ tylko sklep).
14. LLM zobaczy archetyp dopiero, gdy wiesz, o który zapytać — lista archetypów to Twój
    skaner, nie wynik.

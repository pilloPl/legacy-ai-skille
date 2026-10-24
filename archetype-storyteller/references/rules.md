# Archetyp: Reguły / Rules & Scoring

Materiał referencyjny na podstawie modułu M04 szkolenia (L01–L07): reguły dynamiczne, trójpodział
logiki według podatności na zmiany, wzorzec specyfikacji, silnik reguł z konfiguracją w bazie,
drzewa AST z wymiennymi algebrami, uniwersalny model scoringu oraz umiejscowienie reguł
w architekturze modularnego systemu.

---

## 1. Esencja archetypu — reguły jako uniwersalny mechanizm decyzyjny

Archetyp Reguł dotyczy systemów, w których logika decyzyjna nie jest statyczna:

- **reguły nie są stałe** — zmienia je dynamicznie użytkownik (nie programista),
- **reguły wpływają na inne reguły** — to, które reguły mają się wykonać, samo jest wynikiem reguł,
- **ta sama mechanika obsługuje wiele dziedzin** — rabaty, podatki zależne od kraju, scoring
  klienta, scoring faktury, zdolność kredytowa, priorytety obsługi. Dziedziny różnią się
  słownictwem, ale struktura problemu jest identyczna: *warunki → decyzja → modyfikacja wyniku*.

Sedno archetypu: **oddzielić mechanikę składania i ewaluacji reguł od treści konkretnych reguł**.
Mechanika (kompozycja, przechodzenie po drzewie, ewaluacja) jest trywialna i stabilna; cała
logika biznesowa zostaje wyniesiona do konfigurowalnych, parametryzowanych, reużywalnych klocków.
Dzięki temu nowa reguła biznesowa to zmiana konfiguracji (danych), a nie zmiana kodu, deploy
i release.

Motywacja biznesowa: w wielu systemach konfiguracja reguł **musi działać w runtime**. „Nowy rabat —
mamy kodzik otwarty na rozbudowę, wystarczy dodać implementację interfejsu" brzmi dobrze, ale
skutkiem jest konieczność deployu i release'u, podczas gdy biznes potrzebuje być na produkcji
w 5 minut (reakcja na ruchy konkurencji, nowe produkty ze złożonymi regułami jako przewaga
rynkowa). Moduł podkreśla też (L07), że na niektórych rynkach ta szybkość nie ma znaczenia —
patrz anty-sygnały.

Cztery perspektywy podsumowujące archetyp (L07):

| Perspektywa | Wniosek |
|---|---|
| Programistyczna | Bez silnika reguł „damy radę do pewnego momentu" — potem przygniata eksplozja kombinatoryczna (przypowieść o faktoringu). Osobne building bloki dla reguł i dla składania reguł dają trywialną mechanikę, bo logika jest wyniesiona poza nią. Koszt kognitywny: trzeba umieć odbudować w głowie drzewa reguł — bez wizualizacji (choćby konsolowej) będzie trudno. |
| Architektoniczna | Czasem umyka nam komponent będący źródłem prawdy. Kiedy nie ma „prostokąta" na logikę, logika nie znika — jest w strzałkach między modułami, a logika w strzałkach z czasem spowalnia zespoły. |
| Biznesowa | Szybka reakcja na rynek i wypuszczanie produktów ze złożonymi regułami może dać przewagę. A czasem nie ma znaczenia — zależy od rynku. Druga strona: kary umowne za błędy wynikłe z przeładowania kognitywnego (faktoring). |
| Analityczna | Temat jest prosty, „tylko logika czasem rozmyta" — analitycznie archetyp jest nieskomplikowany, trudność leży w implementacji, algebrze i umiejscowieniu w architekturze. |

Uwaga terminologiczna: moduł świadomie odchodzi od książkowego „archetypu reguł" — koncepcja
analityczna to jedno, a szczegóły implementacji, algebry i miejsca w architekturze to zupełnie
inne klasy problemów.

---

## 2. Ograniczenia kodowania logiki w if-ach — pełny wywód (L01)

Ścieżka degradacji naiwnych podejść, od najprostszego do najsprytniejszego — i dlaczego każde
z nich w końcu przestaje wystarczać:

### Etap 1: Wzorzec strategii z nazwami domenowymi

Interfejs `DiscountStrategy` (metoda: pozycja oferty → zrabatowana pozycja oferty; modyfikacja
= zmiana `finalPrice` + dodanie do kolekcji rabatów opisu przyczyny). Implementacje:
`VipStrategy`, `GoldClientStrategy`, `StandardStrategy`. „Piękne słownictwo domenowe" — ale
**każda z tych strategii obniża cenę o jakiś procent**. To jest **jedna** strategia
z parametrami (procent, nazwa) wstrzykniętymi przez konstruktor.

**Błąd**: pomylenie *nazwy implementacji* (klasy/funkcji) z *polem `name` wewnątrz implementacji*.
Niby detal łatwy do refaktoringu, ale symptom myślenia o modelu „zbyt dosłownego, bez wysilenia
się na wyabstrahowanie esencji problemu". W małej, rzadko zmienianej aplikacji nie jest to
problem; gdy biznes chce szybko reagować na rynek, słaby model staje się czynnikiem porażki
(choć przy tak prostych wymaganiach sytuację jeszcze ratuje zwinny zespół ze zwinnym cyklem
wdrażania).

### Etap 2: Hakowanie modelu zamiast modelowania

Test na abstrakcyjne myślenie: czy zawsze mówimy o *rabatowaniu*? Co jeśli cena **wzrasta**
z różnych powodów? Odpowiedź „rabat ujemny" to **hakowanie modelu zamiast stworzenia
odpowiedniego modelu**. Co jeśli formą rabatu jest **produkt gratis** („co dziesiąta licencja
gratis")? Odpowiedź w stylu „cena −1 to gratis, cena −2 to wymiana w reklamacji, a potem
operatorami bitowymi skoki do funkcji" to karykatura magicznych wartości.

Prawidłowe rozpoznanie: mamy do czynienia z **modyfikacją pozycji oferty** oraz **modyfikacją
całej oferty**. Modyfikacja pozycji może zmieniać cenę w górę lub w dół, na różne sposoby,
nie tylko procentowo. Modyfikacja całej oferty może np. dodać pozycje gratisowe. „Detal
nazewniczy" (modyfikator, nie rabat) pokazuje, czy od początku rozumiemy, co robimy. Stąd
neutralne nazwy: `OfferItemModifier`, `OfferModifier`, modyfikatory „o ileś / na ileś /
o procent" (biznes może dalej mówić „rabat" — słowo „modyfikator" bywa mu kulturowo obce;
nazwa biznesowa to pole/etykieta, nie typ).

### Etap 3: Fabryka z kaskadą if-ów / switch po enumie

Wybór, który modyfikator przysługuje klientowi i z jakimi parametrami, trafia do fabryki
z kaskadami if-ów lub switch po enumie. Problem switcha: po dodaniu nowej wartości enuma trzeba
szukać wszystkich miejsc użycia i pamiętać o obsłudze, inaczej cicho zwraca się wartość domyślna.

### Etap 4: Visitor po enumie (Double Dispatch) — szczyt sprytu i jego betonowanie

„Trik Mariana": enum `ClientStatus` odwiedzany przez visitora (interfejs generyczny); każda
wartość enuma robi callback do dedykowanej metody visitora. Dodanie wartości enuma = nowa metoda
w interfejsie = błędy kompilacji we wszystkich implementacjach, więc kompilator wskazuje, co
zmodyfikować. Strukturalnie to wzorzec mostu (dwie rodziny abstrakcji, jedna działa na drugiej
bez wiedzy pierwszej), namiastka Double Dispatch z zachowaniem kontroli typów; w językach bez
metod w enumach — statyczne pola z wartościami wyliczeniowymi. Polimorfizm po typie obiektu
**i** po typie parametru, w runtime.

**Dlaczego to za mało**: z czasem wymagania się rozwiną —

- statusy klienta **nie będą sztywnym wyliczeniem** — będą dynamicznie definiowane przez
  użytkowników z uprawnieniami i zapisywane w bazie danych,
- dobór rabatu nie zależy już tylko od statusu, ale od historii zakupów, zawartości zamówienia,
  stanów magazynowych, warunków zakupu („i fazy księżyca prawdopodobnie też") — i tak wszystko
  się jeszcze zmieni.

Enum zaspawany w czasie kompilacji nie pomieści wartości tworzonych w runtime. **Cwane triki
w implementacji z czasem betonują ją, blokując rozbudowę.** Działa tu psychologiczny syndrom
*Love to a Brain Child*: twórca zrobi wiele, by zachować swoje dzieło — „jeżeli model nie pasuje
do rzeczywistości, tym gorzej dla rzeczywistości".

### Dalsze anty-wzorce z kolejnych lekcji (do tej samej kategorii)

- „Dodaj if-a tam w tym…" jako reakcja na incydent produkcyjny — zamiast wyceny bólu
  i punktowej zmiany modelu (patrz guardian, §6).
- Skrypty z logiką trzymane w bazie danych — „sponiewiera Was wersjonowanie i testowanie tego
  smutnego kodziku".
- Ośmiotysięcznik: gigantyczna funkcja z zaszytymi prostymi operacjami → eksplozja
  kombinatoryczna przypadków testowych, kod praktycznie nietestowalny (brakłoby praktykantów
  do opisania kombinacji).
- 17 000 linii procedury SQL (faktoring, §10) — każda modyfikacja grozi regresją wykrywaną po
  pół roku.

---

## 3. Sygnały dopasowania (triggery)

Archetyp pasuje, gdy w wymaganiach lub kodzie występuje:

1. **Reguły zmieniane w runtime przez użytkownika** — „dynamiczne definiowanie aktywnych rabatów
   i ich parametrów bez ingerencji programistów"; kreator na GUI, gdzie uprawniony użytkownik
   z list rozwijanych składa warunek + modyfikację + parametry + nazwę („rabat dla VIP-a na
   święta na majty w Mikołaje powyżej 10 sztuk").
2. **Słowniki wartości definiowane przez użytkowników** zamiast sztywnych wyliczeń (statusy
   klienta w bazie, nie w enumie).
3. **Reguły wpływające na inne reguły** — to, które reguły się wykonują, samo jest decydowane
   regułami (fabryka wybiera zestaw modyfikatorów na podstawie predykatów kontekstu klienta).
4. **Wiele wymiarów warunków naraz** — status + historia zakupów + zawartość zamówienia + stany
   magazynowe + daty/okazje (urodziny, święta) + warunki zakupu.
5. **Kombinatoryka warunków**: warunki łączone AND/OR/NOT, zagnieżdżone, o różnej treści per
   klient/tenant/rola — jawna eksplozja kombinatoryczna przypadków.
6. **Scoring** — przypisywanie wartości punktowych (dodatnich/ujemnych) zdarzeniom lub metrykom
   i sumowanie; scoring klienta, faktury, produktu, dostawcy, firmy logistycznej, pracownika.
7. **Zdolność kredytowa / ocena ryzyka** — funkcja (dane, kwota) → tak/nie, przeszukiwana
   (bisekcją) po kwocie; setki małych warunków do skomponowania.
8. **Konfigurowalne rabaty, podatki, opłaty** — podatek zależny od kraju, narzuty
   (niezarejestrowani +30%), progi (−5% powyżej 10 szt., −10 zł przy cenie szt. >100 zł).
9. **Multitenancy / SaaS** — każdy dzierżawca ma własny podzbiór reguł z własnymi priorytetami;
   nie można zapewnić każdemu tenantowi „wiernego programisty, który dorzeźbi kodzik o północy".
   Także efekt wow na demo sprzedażowym: pełna konfigurowalność (choć w praktyce wdrożeniowcy
   wyklikają to za klienta, bo „ludzie nie odróżniają I od LUB").
10. **Reguły zależne od roli użytkownika** — menadżerowie wyższego szczebla mają „bardziej
    pobłażliwe drzewa", bo ufają intuicji.
11. **Wynik bogatszy niż bool** — punkty, stopień spełnienia (logika rozmyta), wektor punktów
    per kategoria, wynik + wyjaśnienia („za co te 20 punktów").
12. **Okna czasowe w warunkach** — „suma zakupów w kwartale/roku", „liczba reklamacji na
    kwartał", a biznes zmienia zdanie co do okna i chce przeliczać wstecz.
13. **Symulacje i personalizacja** — budowanie hipotetycznych drzew reguł, sprawdzanie ilu
    klientów spełni kryteria i jaki będzie wpływ na wynik finansowy; generowanie
    spersonalizowanych rabatów z generycznych klocków i wysyłanie klientom.
14. **Konfiguracja wyliczana dynamicznie przez system** — reguły budowane w runtime na podstawie
    zalegania magazynów, ruchu w interesie, liczby klientów spełniających kryteria (np. „mało
    VIP-ów → rekrutujemy; dużo → nagradzamy tylko lojalnych").
15. W kodzie: kaskady if-ów / switch w fabrykach decyzyjnych, strategie różniące się tylko
    parametrem, gigantyczne funkcje warunkowe, procedury SQL liczone w tysiącach linii.

---

## 4. Anty-sygnały — kiedy zwykły kod wystarczy

- **Mała aplikacja, rzadkie zmiany** — strategia z parametrami albo nawet if-y nie są problemem;
  słaby model nie boli, gdy nikt go nie zmienia.
- **Zwinny zespół + zwinny pipeline dostarczania** — jeśli zmiana reguły w kodzie i release to
  godziny, statyczna konfiguracja w kodzie (mapa modyfikator → predykat) wystarcza: „każda
  zmiana wymagań to zmiana i release — jeżeli mamy zwinny pipeline, to wystarczy".
  Sama hashmapa z regułami bez dynamiki to „ukrywanie if-ów w hashmapie" — przerost formy nad
  treścią; funktory mogłyby być małymi metodami upublicznionymi do testowania.
- **Rynek nie premiuje szybkości zmian reguł** — „czasem nie ma to znaczenia, to zależy od
  rynku"; wtedy inwestycja w silnik się nie zwraca.
- **Wybór domknięcia jest trywialny** — jeśli domknięcie wybiera użytkownik na GUI, pochodzi
  z konfiguracji albo wstrzykuje je kontener IoC/DI, trzecia strefa logiki (fabryka z algorytmem
  wyboru) w ogóle nie powstaje.
- **Pojedyncze, niekomponowane warunki o stałym kształcie** — bez kombinatoryki, bez słowników
  użytkownika, bez okien czasowych: zwykła funkcja/strategia z parametrami.
- Koszt, który trzeba świadomie zaakceptować przy wejściu w archetyp: **koszt kognitywny**
  odtwarzania drzew reguł w głowie i ryzyko **niezrozumienia modelu przez część zespołu**
  prowadzącego do jego dewiacji (konieczny transfer wiedzy + narzędzia wizualizacji).

---

## 5. Dwa przejścia dydaktyczne: bottom-up (L02) i top-down (L04)

### 5.1 Bottom-up — od wymagań do silniczka reguł (rabaty)

Wymagania iteracji (sformułowanie wzorcowe — tak brzmi trigger archetypu):

1. Rabaty warunkowe: −5% jeżeli pozycja > 10 sztuk; −10 zł za pozycję jeżeli cena sztuki
   > 100 zł; w przyszłości zmienią się **i parametry, i algorytmy** (np. cechy produktu:
   czerwone droższe, zielone tańsze).
2. Modyfikatory zależne od statusu klienta: niezarejestrowani +30%, zarejestrowani stawka
   normalna; w przyszłości wiele modyfikatorów (kwartalna kwota wydatków, roczna liczba
   kupionych produktów…).
3. Ceny po rabatach widoczne w propozycji oferty; w trakcie pracy nad zamówieniem rabaty mogą
   zmieniać stawkę i aktywację.
4. Dynamiczne definiowanie aktywnych rabatów i parametrów **bez ingerencji programistów**
   (kreator GUI ze słownikiem warunków/modyfikacji/parametrów).

Kroki przejścia:

1. **Trójpodział logiki według podatności na zmiany** (zmiany *kodu*, nie wartości w bazie):
   - **Logika stabilna (core)** — operacje/klasy wyższego rzędu, główne serwisy lub procedury
     (duża część kodu obiektowego ma naturę proceduralną). Tu: serwis generujący ofertę
     (pobiera produkty z koszyka, sprawdza dostępność, szuka zamienników wg nawyków zakupowych
     i zalegania magazynów, liczy rabaty). Zmienność przykrywamy **stabilnym interfejsem**
     i delegujemy poza stabilne struktury. Wyzwanie: strategiczne opracowanie **punktów
     rozszerzeń**, które pozwalają rozbudowywać, a nie zmieniać.
   - **Domknięcia stabilnej logiki** — implementacje modyfikatorów. Wyzwanie: interfejs na tyle
     ogólny, by przetrwał zmiany wymagań, ale nie łamiący Interface Segregation.
   - **Wybór domknięcia** — gdy system sam decyduje i wybór wymaga modelu oraz algorytmu,
     hermetyzujemy go w **fabrykach**. Ta logika zmienia się osobno od dwóch pozostałych; nawet
     jeśli nie powstanie generyczna parametryzowana fabryka, zmiany będą ograniczone do jednego
     miejsca.
   To **framework mentalny** („foremki na mokry piasek") — struktura nałożona na wstępie,
   zamiast wyłaniać się z chaosu. Pytania analityczne: co jest stabilne? co jest core? co się
   zmienia? jaki jest stabilny kontrakt zmian? jak wybieramy domknięcie, jakie reguły tym rządzą?
   Mapowanie na model wielkiej skali DDD: Capability + Operations (stabilne) ← Policy
   (domknięcia) ← Decision Support (inteligencja w fabrykach: sugerowanie polityki rabatowej,
   kraju rozliczenia podatku). Funkcyjnie: higher-order functions + closures („język, jakim
   mówisz, determinuje sposób, w jaki myślisz").
2. **Rozdzielenie modyfikacji pozycji od modyfikacji oferty** — nie uogólniać na siłę: reguły
   będą inne, uogólnienie wniosłoby zamieszanie i utrudniło przypadki testowe (oferta: dodawanie
   pozycji gratisowych, rabat od całości *po* zrabatowaniu pozycji).
3. **Przydział reguł do stref wg czasu decyzji i dostępności danych**:
   - Fabryka zna **tylko kontekst klienta** (status, historia zakupowa, daty obowiązywania,
     urodziny/święta) i **nic o ofercie**. Powody: fabryka może powstać raz na początku sesji
     (wydajność); chcemy pokazywać możliwe rabaty bez istnienia oferty; chcemy „kusić"
     klienta do powiększenia oferty pod próg rabatu. Zwraca **zbiór potencjalnych
     modyfikatorów** — czy oferta na nie zasłuży, okaże się później.
   - Modyfikator sprawdza **cechy pozycji** (liczba sztuk, cena bazowa, cena finalna po
     poprzednich modyfikatorach, liczba zaaplikowanych modyfikatorów, cechy typu produktu)
     i modyfikuje cenę finalną.
   - Dostęp modyfikatora do cech produktu: **nie** przez pobieranie z bazy w środku funkcji
     (testy wymagałyby mocków), **nie** przez lazy loading ORM-a („lazy loading to tylko ukrycie
     poprzedniego podejścia"; „każdy skomplikowany problem ma proste rozwiązanie i jest ono
     błędne"). Świadomie akceptujemy **przeciekanie modelu katalogu produktów do modelu oferty**:
     `OfferItem` musi zawierać informacje o typie produktu, bo przy prezentacji zmian cen trzeba
     wyjaśnić powód („bo majty miały rozmiar XS").
4. **Model domknięcia**: interfejs `OfferItemModifier` przyjmuje i zwraca pozycję; pozycja jest
   **niemutowalnym value objectem** — zwracamy kopię (lub oryginał przy braku zmiany), żeby
   kolejne modyfikatory działały na zmodyfikowanej wartości. Dwa kroki: *sprawdź* i *zmień*.
   Sposoby zmiany ceny — cztery proste funkcje: **o** kwotę, **na** kwotę, **o procent od ceny
   bazowej**, **o procent od ceny finalnej** (odpowiedź biznesu na pytanie „procent od bazowej
   czy po poprzednich rabatach?": „czasem tak, a czasem tak — do wyboru w kreatorze"). Przy
   ofercie dochodzi piąta: dodanie pozycji (gratis).
5. **`ConfigurableItemModifier`** — modyfikator konfigurowany przez wstrzyknięcie funkcji:
   `predicate` (czy pozycja zasługuje), `applier` (wylicz nową cenę), później `guardian`.
   `modify`: jeśli predykat spełniony → applier liczy cenę → jeśli różna od obecnej, value
   object `OfferItem` w metodzie aplikującej tworzy kopię z nową ceną i zapamiętuje informację
   o modyfikacji (nazwa rabatu jako **pole**, nie klasa — „technika mistrzów Shaolin"; sensowny
   refaktoring: `getName` w interfejsie). Każdy klocek jest trywialny do testowania → 100%
   pokrycia arytmetyki testami jednostkowymi; każdy jest reużywalny na dowolnym poziomie drzewa.
6. **Guardian (strażnik opłacalności)** — scenariusz: skonfigurowane przez użytkownika rabaty
   zbiły cenę poniżej kosztu zakupu, strata 100 tys./tydzień. Procedura: najpierw **wycena bólu**
   (ile tracisz?), potem wycena rozwiązania, potem negocjacja — nie „dodaj if-a". Rozwiązanie:
   trzeci funktor-predykat w modyfikatorze; kod robi **symulację** — tworzy nowy `OfferItem`,
   przed zwróceniem daje go strażnikowi; jeśli cena po rabacie wciąż ok (np. nie spadła o więcej
   niż x% od bazowej) → zwracamy zmodyfikowany, inaczej niezmieniony. „Elegancka zmiana w jednym
   miejscu zamiast orania hektarów kodu". Strażnicy to predykaty → komponują się operatorami
   logicznymi.
7. **Łączenie modyfikatorów** — modyfikatory się sumują; opcje: Chain of Responsibility,
   `foldLeft` strumienia, drzewo logiczne. CoR z referencją na następnik odpada (wymagałby
   modyfikacji reużywalnych klocków). Wybrano **kompozyt**: `ChainOfferItemModifier` — adaptacja
   kolekcji modyfikatorów do interfejsu `OfferItemModifier`; każdy element sam decyduje, czy
   i jak modyfikuje (myśleć diagramem obiektów, nie klas). Schemat dla pozycji powtarza się dla
   każdej pozycji oferty.
8. **Fabryka na konfiguracji** — konfiguracja to mapa: klucz = modyfikator, wartość = predykat
   testujący kontekst klienta (sam w sobie może być złożonym drzewem logicznym). Fabryka
   filtruje predykaty spełnione dla `ClientContext` i skojarzone modyfikatory wkłada do
   `ChainOfferItemModifier`. `ClientContext`: struktura danych o kliencie; gdy pobranie danych
   jest kosztowne — rozbić kontekst na mniejsze; w wyrafinowanych przypadkach kontekst jest
   **fasadą dostępu do danych**, a parametry kwerend zna dopiero reguła (pobieranie ad hoc).
9. **Źródła konfiguracji**: (a) statyczna w kodzie — wystarczająca przy zwinnym pipeline;
   (b) **dynamiczna, wyliczana przez system** (stany magazynowe, ruch, liczba VIP-ów; symulacje
   wpływu na finanse; personalizowane rabaty); (c) **kreator GUI + baza danych** — silnik reguł,
   patrz §6.
10. **Dwuetapowa logika wykonania**: najpierw fabryka na podstawie kontekstu klienta gromadzi
    potencjalne modyfikatory; potem pozycja oferty jest „przepuszczana" przez łańcuch i każdy
    modyfikator decyduje, co zrobić.
11. **Praca domowa L03**: wydzielić reużywalny core reguł i odseparować od rabatów — rabaty mają
    być pluginem takim samym jak scoring faktur czy zdolność kredytowa.

### 5.2 Top-down — reguły w architekturze modularnej (scoring, L04)

Punkt wyjścia: system z modułami **Sprzedaż, Reklamacje, Płatności, Katalog, CRM** i wymaganie:
„jeżeli klient zrobił zakupy za X w kwartale, użył typu płatności Y razy, złożył ≤ Z reklamacji,
to: w CRM zmień status, w katalogu pokaż pewne produkty w pewnej kolejności, w reklamacjach
zmień priorytet". Rysunek prostokątów i strzałek przepływu danych/rozkazów = **zaczątek
spaghetti**; „proces gnilny architektury już się zaczął".

Kroki przejścia:

1. **Meta-reguła**: *jeżeli wiele rzeczy wpływa na wiele innych rzeczy, prawdopodobnie brakuje
   czegoś pomiędzy nimi*. Przeformułowane wymaganie: zdarzenia w sprzedaży/płatnościach/
   reklamacjach wpływają na **scoring klienta**, a zmiana scoringu wpływa na katalog, CRM
   i priorytet reklamacji. (Gdyby biznes sam tak mówił, „nie potrzebowałby nas do niczego".)
   Brakującym prostokątem jest moduł **Scoring** — nowe źródło prawdy.
2. **Zależności po lewej (producenci)**: moduły Sales/Payment/Claims **nie** emitują komend
   „zmień scoring" (logika scoringu rozlazłaby się na 3 moduły; zmiana = synchronizacja
   3 zespołów, która „się nie wydarzy", więc obok złożoności esencjonalnej pojawi się
   przypadkowa, np. wersjonowanie API). Emitują **zdarzenia**: sprzedano, pobrano opłatę,
   zgłoszono reklamację. Scoring musi znać te pojęcia (nadaje im wagi punktowe), więc jest
   podatny na ich zmiany — to konieczny koszt.
3. **Zależności po prawej (konsumenci)**: scoring **nie** wysyła komend „zmień status / zmień
   reguły wyświetlania / zmień priorytet" (musiałby znać następstwa zmiany scoringu; nowy
   zainteresowany moduł = praca zespołu scoringu). Scoring **emituje zdarzenie** o zmianie
   scoringu. Dylemat: jedno zdarzenie `ScoringChanged` (z nową i poprzednią wartością, odbiorca
   sobie policzy) czy dwa: `ScoreIncreased` / `ScoreDecreased`? Tu obliczenie trywialne, ale
   zasada: jeśli interpretacja zmiany nie jest trywialna, **logika interpretacji ma być w jednym
   miejscu — w scoringu** → preferuj zdarzenia niosące znaczenie.
4. **Wariant dla biznesu o często zmiennych źródłach scoringu**: zamiast częstych zmian po
   stronie emitujących zespołów i synchronizacji release'ów — moduły po lewej wystawiają
   **generyczne API odczytowe (OData) nad read modelami CQRS** (wydajność), a **parametry
   kwerend — czyli de facto logikę biznesową — ustawia moduł scoringu**: jedno źródło prawdy.
   Problem „kiedy uruchamiać kwerendy": na żądanie scoringu było za wolno (łańcuch kwerend);
   rozwiązanie hybrydowe — nasłuch zdarzeń z lewej i wołanie kwerendy **co n-te zdarzenie lub
   co x sekund**; parametry dobrane tak, by biznes akceptował świeżość scoringu, a system był
   wydajny przy dużych danych i ruchu.
5. **Pipeline wewnątrz modułu scoringu** (od lewej):
   - **Anti-corruption Layer** — warstwa adapterów tłumacząca niestabilne zewnętrzne modele
     zdarzeń na wewnętrzne zdarzenia domenowe (np. `PurchaseRegistered`,
     `ComplaintRegistered`), chroni resztę modułu przed zmianami na zewnątrz.
   - **Process Manager (Saga)** w ACL w specyficznych przypadkach: gdy kilka zdarzeń
     zewnętrznych mapuje się na jedno wewnętrzne (wpłaty ratalne → jedna sumaryczna wpłata,
     jeśli raty nas nie interesują); PM ma logikę zakończenia procesu i kumulacji danych.
   - **Strumień zdarzeń domenowych** (Kafka Streams, Flink) + **projekcje z oknami czasowymi**:
     tumbling/sliding window, np. suma zakupów BY YEAR, liczba reklamacji BY QUARTER; stan
     (state store) per `customerId` + `windowKey`, materializowany do K/V store (Redis,
     Postgres — cokolwiek).
   - **Wersja domowej roboty** (odpowiedź na zarzut „CV-driven architecture"): tabela zdarzeń
     domenowych + tabele projekcji; na każde zdarzenie INSERT do zdarzeń i UPSERT do projekcji;
     scoring = SELECT z projekcji + odpalenie reguł. Przy małym obciążeniu wystarczy.
   - **Warianty wyzwalania obliczeń** (łączalne): na żądanie (zapytanie po projekcjach, nie
     surowych zdarzeniach); przy nadejściu zdarzeń wejściowych z emisją `ScoreUpdated` (lub
     `ScoreIncreased`/`ScoreDecreased`); hybryda — przeliczanie na zdarzenia + serwowanie
     wyniku na kwerendę.
6. **Dlaczego event store, nie tylko stan bieżący**: biznes zmienia zdanie co do okna czasowego
   (kwartał → miesiąc/rok). Wdrożenie nowego kodu liczyłoby po nowemu dopiero od wdrożenia;
   biznes chce **przeliczyć wstecz** → trzeba zapisywać wszystkie zdarzenia, by nałożyć dowolne
   okno i nadać zdarzeniom wartości punktowe (dodatnie/ujemne) retroaktywnie.
7. **Czarna skrzynka obliczeń** nie może już być wzorcem specyfikacji (zwraca bool, a trzeba
   zwrócić liczbę) → drzewa AST + algebry, §7.

---

## 6. Reguły jako mechanizm: specyfikacje, kompozycja, parametryzacja, przechowywanie, wersjonowanie

### 6.1 Building bloki

| Klocek | Rola | Uwagi |
|---|---|---|
| Predykat (`predicate`) | Czy obiekt (pozycja / kontekst klienta / zdarzenie) spełnia warunek | Funkcja → komponowalna operatorami logicznymi w drzewa |
| Aplikator (`applier`) | Wylicza modyfikację (nową cenę / wartość) | Cztery bazowe: o kwotę, na kwotę, % od bazowej, % od finalnej; dla oferty + dodanie pozycji |
| Guardian | Predykat opłacalności — kontrola skutku **po symulacji** zmiany, przed jej zatwierdzeniem | Chroni przed regułami użytkownika niszczącymi marżę; też komponowalny |
| `ConfigurableItemModifier` | Modyfikator = nazwa + predicate + applier + guardian wstrzyknięte przez konstruktor | Przypadki poza schematem: osobna implementacja interfejsu („VerySpeszylKejs17") |
| Kompozyt/łańcuch (`ChainOfferItemModifier`) | Adaptacja kolekcji modyfikatorów do interfejsu pojedynczego | Zamiast CoR z next-referencją; wynik jednego wchodzi do następnego (value objecty) |
| Fabryka | Wybór domknięć: filtruje mapę (modyfikator → predykat klienta) po kontekście | Hermetyzuje logikę wyboru; może zawierać „inteligencję" (Decision Support) |
| Kontekst (`ClientContext` / `WindowContext`) | Dane, na których działają predykaty/metryki | Struktura danych; rozbijana na mniejsze lub fasada z kwerendami ad hoc |

„Funktory" rozumiane są tu jako obiekty wołane jak funkcje (nie funktory z paradygmatu
funkcyjnego). Każdy klocek jest mały, trywialnie testowalny, reużywalny na każdym poziomie
drzewa.

### 6.2 Wzorzec specyfikacji (kompozycja AND/OR/NOT)

- Warunek biznesowy = drzewo: **węzły = operatory logiczne, liście = warunki biznesowe**.
- Implementacja refleksyjna wymaga odpowiedników obiektowych zamiast wbudowanych
  `Function`/`Predicate` (tych nie da się sensownie skanować refleksją):
  - **interfejs znakujący** (marker), żeby refleksja odnajdywała typ,
  - klasa bazowa operatorów binarnych z operandami LEFT i RIGHT,
  - `AND` prawdziwy, gdy oba operandy prawdziwe; `OR` analogicznie; `NOT` zawiera jeden węzeł
    (child),
  - **liście i węzły implementują ten sam interfejs `LogicalPredicate`** — są nieodróżnialne
    (klasyczny kompozyt, przy operacjach boolowskich zwany wzorcem specyfikacji),
  - interfejs z metodami fabrykującymi `and/or/not` dla wygody zapisu warunków w kodzie
    (w docelowym systemie i tak czytane z konfiguracji),
  - typy pośrednie tylko dla wygody zapisu.
- Efekt uboczny wymogu refleksyjności: model na poziomie implementacji „przypomina te z książek
  z lat 90." — i to jest świadomy kompromis.
- Ograniczenie specyfikacji: **zwraca bool**; struktura i reguły są połączone
  („jednowymiarowość") — wystarczające dla części przypadków; gdy wynik ma być bogatszy →
  AST + algebra (§7).

### 6.3 Parametryzacja

- Parametry wstrzykiwane przez konstruktory (procent, kwota, próg, minimalna marża, minimalna
  liczba sztuk, nazwa).
- Nazwa biznesowa reguły to **pole**, nie typ.
- Fabryka wstrzykuje funktory do modyfikatorów, a parametry do funktorów.
- Wartość stała w liściu drzewa nie musi być zahardkodowana — może pochodzić z konfiguracji lub
  być wyliczona w fabryce.

### 6.4 Przechowywanie konfiguracji (silnik reguł na bazie relacyjnej)

Zasady: **nie zapisujemy kodu w bazie** (skrypty w bazie = koszmar wersjonowania i testowania).
Mechanizm: **refleksja w wariancie „dobrym"** — tworzenie obiektów z nazw typów w stringach
i rzutowanie na interfejs (namiastka programowania dynamicznego z silną kontrolą typów);
wariant „zły" (zarezerwowany dla twórców frameworków) to wołanie metod po stringach bez
kontroli typów.

Schemat:

- Tabela `Modifier`: ID, nazwa (opcjonalnie nazwa kodowa).
- Tabela parametrów: FK do `Modifier`, nazwa parametru, wartość parametru.
- **Notacja prefiksowa nazw parametrów** z nazwami parametrów konstruktora (`predicate`,
  `applier`, `guardian`) — refleksja ma do nich dostęp, o ile są w bytecode (przełącznik
  kompilatora). Typy dziedzinowe (money, percentage) mają własne prefiksy.
- Wpis typu mówi, jaką klasę utworzyć (np. `ConfigurableOfferItemModifier`).
- **Drzewa logiczne w wierszach**: prefiks `n` = node; konfiguracja mówi, czy węzeł ma dzieci
  `left`/`right` (operatory binarne) lub `child` (negacja), czy jest liściem z parametrami
  reguły. Struktura danych jest **prostsza niż analogiczny kod imperatywny** — „odpada ifologia
  związana z umiejscowieniem reguły w hierarchii".
- **Odporność na zmianę nazw klas**: nazewnik w adnotacji/atrybucie klasy; wartości nigdy nie są
  wpisywane ręcznie (wybór na GUI — brak miejsca na literówkę); test pokrycia nazewników
  z danymi w bazie; przy dużej obawie — **tabela-rejestr nazewników**: tabele konfiguracji
  używają identyfikatorów nazewników, zmiana nazwy w jednym miejscu.
- Narzędzia towarzyszące: importer zapisujący strukturę obiektową do tabel, renderer konsolowy,
  **wizualizacja konfiguracji** (i tak potrzebna jako GUI dla użytkowników; „jednozdaniowy
  prompt wygeneruje narzędzie w minutę").
- Całość: „w kilkuset linijkach kodu zaczątek silnika reguł wystarczający dla większości
  przypadków"; brzegi zawsze można ograć dodatkową implementacją interfejsu — ważne wyważenie,
  kiedy modyfikować model, a kiedy dodać specjalną implementację.

Alternatywa dla scoringu: **konfiguracja w JSON** — łatwiejsze **wersjonowanie polityk
scoringowych** niż w paradygmacie relacyjnym (reguła rozbita na wiele wierszy).

### 6.5 Wersjonowanie i audyt

- Rejestr nazewników ułatwia wersjonowanie konfiguracji (identyfikatory zamiast nazw).
- JSON-owe polityki scoringowe wersjonują się łatwiej niż wiersze relacyjne.
- Retroaktywność: pełny log zdarzeń pozwala przeliczać scoring wstecz po zmianie reguł/okien.
- Algebra `Explained` (§7.4) daje audytowalność pojedynczego wyniku („paragon").

---

## 7. Drzewa AST i własne algebry (L05)

### 7.1 Motywacja

Specyfikacja zwraca bool. W scoringu potrzeba: analizować **okna czasowe** (rok, kwartał,
30 dni), liczyć **punkty** (+50 za duże obroty, −30 za dużo reklamacji), obsłużyć **logikę
rozmytą** (stopień spełnienia), może wynik **wektorowy** (punkty per kategoria). Nie wiadomo
z góry, która algebra będzie „lepsza" → **oddzielić strukturę od algebry, aby algebrę móc
wymienić**. To wzorzec mostu: drzewo nic nie wie o algebrze, którą na nie nakładasz. AST
zachowuje zalety specyfikacji (kompozycja, całe drzewo), ale typ wyniku jest dowolnie bogaty.

### 7.2 Składowe silnika

| Składnik | Rola |
|---|---|
| `WindowContext` (kontekst) | Okno czasowe + metryki (projekcje); rule engine dostaje je „na tacy" — nie mieli surowych eventów |
| `Expression` (interfejs) | Czysta **struktura danych drzewa AST bez żadnej logiki**; DSL opisujący **co**, nie **jak** |
| Typy węzłów | `AND`, `OR`, `NOT`, `ifThenElse`, **suma** zagnieżdżonych wyrażeń, **stała** wartość, **porównanie metryki** (metryka, operator, wartość), `label` (etykieta dla wyjaśnień) |
| `ExpressionVisitor<T>` | Przechodzenie po drzewie; generyk — nie wiemy, co liczy (scoring, fuzzy, bool…) |
| `AlgebraicVisitor` | Jedna implementacja visitora: rekursywnie odwiedza gałęzie i **deleguje obliczenia do algebry** |
| `Algebra<T>` (interfejs) | Mówi, jak łączyć wyniki węzłów w wartość typu T |
| Konkretne algebry | `ScoreAlgebra`, fuzzy (Zadeh), `Explained`, boolowska (praca domowa) |

Szczegóły konstrukcyjne:

- Pierwsze podejście (`ExpressionEvaluator`): zewnętrzna metoda rekursywna z rzutowaniami —
  działa, ale nowy typ wyrażenia wymaga zmian i rzutowań; zostawione jako wprawka.
- Docelowo: `Expression.accept(visitor)` — Double Dispatch. Visitor ma **przeładowane metody**
  (każdy węzeł to inny typ; przy enumach w L01 się nie dało, bo typ był jeden — stąd różne nazwy
  metod tam, przeładowania tu). Nowy typ węzła = nowa metoda visitora = kompilator wskazuje
  implementacje do uzupełnienia.
- **Dlaczego algebra nie implementuje visitora bezpośrednio**: każda algebra powielałaby logikę
  analizy drzewa; nowy typ węzła wymuszałby zmianę każdej algebry; a przede wszystkim —
  separacja umożliwia **dekorowanie algebr** (nakładanie logik na siebie wzorcem dekoratora,
  „jak matrioszki").
- Wizytacja: `AND` → rekursja na LEFT/RIGHT, wyniki do algebry; porównanie metryki → delegacja
  (metryka, operator porównania, wartość) do algebry; `ifThenElse` → trzy składowe (warunek,
  then, else) to też `Expression`, rekursywnie odwiedzane, wynik do algebry — **IF może się
  zagnieżdżać**; stała → „najłatwiejszy, ale najtrudniejszy" element: każda gałąź musi skończyć
  się konkretnym wynikiem (wartość z konfiguracji lub fabryki).

### 7.3 Algebra scoringowa (`ScoreAlgebra`)

Typ wynikowy: `Score`. Dwoista interpretacja: w miejscach warunkowych (porównania metryk, AND,
OR, NOT, ifThenElse) score działa jak **bool 0/1**; przy stałych, sumowaniu i wyniku całego
drzewa — jak **normalne punkty** (dowolne wartości dodatnie/ujemne: nagrody i kary).
Np. `and(a,b)` zwraca 1 gdy oba równe 1. `metricComp` to **most między światem danych
(WindowContext) a światem logiki (Expression)**: (1) wyciąga z kontekstu wartość metryki
(np. kwota rocznych zakupów), (2) porównuje operatorem z wartością, (3) zamienia bool na score
0/1 — odpowiednik specyfikacji „roczne zakupy > 10 000", tylko z wynikiem 0/1 zamiast bool.

Przykład kanoniczny: `sum( if(yearlyPurchases > 10000) then const(+50) else const(0),
if(quarterlyComplaints > 3) then const(−30) else const(0) )`. Test: symulacja pobrania okna
z projekcjami → `AlgebraicVisitor` (zawsze ten sam) + `ScoreAlgebra` → visitor odwiedza korzeń
i rekursywnie schodzi do liści.

### 7.4 Inne algebry na tym samym drzewie

- **Logika rozmyta (standard Zadeha)**: stopień prawdziwości w [0,1]; `AND = min(a,b)`
  („zdanie złożone jest tak prawdziwe jak najmniej prawdziwy składnik" — sensowne w regułach
  typu „VIP = duży obrót I mało reklamacji: jak któraś rzecz leży, całość siada"),
  `OR = max(a,b)`. Porównanie metryk: **threshold + margines** — poniżej progu 0, powyżej
  progu+marginesu 1, pomiędzy interpolacja liniowa (np. próg 10 000, margines 5 000: <10 000 → 0,
  ≥15 000 → 1). Zamiast betonowego progu („zmiana o 1 zł przeskakuje z fałszu na prawdę")
  miękkie przejście — „w rzeczywistym świecie nie ma ostrej granicy między dobrym a złym
  klientem; granice progów to zawsze sztuczne decyzje biznesowe". `ifThenElse`: **mieszanka
  liniowa** gałęzi — condition 0.7 ⇒ 70% then + 30% else (biznesowo: klient-VIP w stopniu 0.8 →
  scoring bardziej przypomina politykę VIP niż zwykłą).
- **`Explained`** (punkty + ścieżka wyjaśnień): działa jak scoring, ale zbiera „paragon" —
  linie (opis, wartość), wynik = suma + kolekcja linii. Algebra = zestaw funkcji mówiących, jak
  łączyć dwa takie wyniki. Serce: wizytacja węzła `label` — jeśli zawierany węzeł daje punkty,
  dodaje je do kolekcji z opisem; `ifThenElse` sam nie dodaje punktów, tylko **wybiera pakiet
  punktów z opisem**. Odpowiada na „nie tylko ile, ale za co".
- **Algebra boolowska** (praca domowa): odtwarza funkcjonalność zwykłej specyfikacji na tym
  samym AST; druga praca domowa: pozbyć się zahardkodowanych metryk (generalizacja specyfikacji
  metryk).

### 7.5 Reguły zdarzeniowe (per event, nie tylko projekcja)

Wymaganie typu „za każdy zakup > 1000 zł w oknie: +3 punkty" wymaga dostępu do pojedynczego
zdarzenia + kontekstu okna: rozszerzony kontekst okna; **reguła zdarzeniowa = wyrażenie
filtrujące + wyrażenie liczące scoring**; silnik iteruje po zdarzeniach okna i nakłada reguły
w dwóch krokach: (1) ewaluacja filtrów, (2) jeśli spełnione — ewaluacja scoringu. **Dwie osobne
algebry**: dla filtrów i dla liczenia. Używanie algebry scoringowej do filtrowania to „fikołek
intelektualny" — filtry powinny dostać algebrę boolowską; wynik powinien odejść od konkretnego
typu Score (generalizacja — praca domowa).

---

## 8. Uniwersalny model scoringu (L06–L07)

Pełny model scoringu jako komponentu:

```
zdarzenia zewnętrzne (Sales, Payments, Claims, …)
  → Anti-corruption Layer (adaptery; opcjonalnie Process Manager/Saga: N zdarzeń zewn. → 1 wewn.)
  → zdarzenia domenowe (PurchaseRegistered, ComplaintRegistered, …)
  → strumień (Kafka/Flink) LUB tabele: event log + projekcje (INSERT + UPSERT)
  → projekcje z oknami czasowymi (tumbling/sliding; state per customerId+windowKey; K/V store)
  → WindowContext (metryki w oknie) [+ dostęp do pojedynczych zdarzeń dla reguł zdarzeniowych]
  → silnik reguł: drzewo Expression (AST) + AlgebraicVisitor + wymienna Algebra
  → wynik (Score / fuzzy / Explained / bool)
  → emisja zdarzeń: ScoreUpdated lub ScoreIncreased/ScoreDecreased
  → konsumenci (Katalog, CRM, Reklamacje, …) reagują na zdarzenia, nie na komendy
```

Tryby wyzwalania: na żądanie (po projekcjach), na zdarzenia (z emisją), hybryda; przy kosztownych
źródłach — pull przez generyczne OData/CQRS read modele z parametrami kwerend po stronie
scoringu, odświeżane co n zdarzeń / co x sekund.

**Uogólnienie na inne podmioty**: scoring klienta → produktu, dostawcy, firmy logistycznej,
pracownika. Konfigurowalny komponent wdrażany wielokrotnie z inną konfiguracją wymagałby
skonfigurowania: (1) zdarzeń nasłuchiwanych i mapowania na wewnętrzną domenę, (2) zdarzeń
wewnętrznych, ich strumieni i projekcji, (3) reguł obliczania scoringu, (4) typu zdarzeń
emitowanych przy zmianie. **Stałe pozostają**: interfejsy struktur drzew oraz reguł.

**Rada praktyczna**: jeśli nie produkujesz takich rozwiązań seryjnie, łatwiej potraktować każdy
scoring jako osobny projekt i **reużyć jedynie abstrakcje i algebry**, bez budowy generycznego
konfigurowalnego komponentu.

Scoring a zdolność kredytowa (L03): zamiast funkcji progresywnie liczącej kwotę — funkcja
`(daneKlienta, kwota) → bool`; szukanie maksymalnej kwoty dającej TRUE (od maksimum banku w dół;
**bisekcja** zamiast dekrementacji o złotówkę). Wnętrze: refaktoring gigantycznej funkcji
sprawdzającej setki reguł do **drzewka specyfikacji**, gdzie każdy liść-warunek jest testowalny
osobno.

---

## 9. Integracja reguł z architekturą systemu

Zasady (wyprowadzone w §5.2, zebrane):

1. **Brakujący prostokąt**: wiele→wiele między modułami ⇒ wprowadź pośredni moduł-źródło prawdy
   (scoring). Logika „w strzałkach" spowalnia zespoły.
2. **Producenci emitują zdarzenia, nie komendy** do modułu reguł — logika wyceny/wag zostaje
   w jednym miejscu.
3. **Moduł reguł emituje zdarzenia, nie komendy** do konsumentów — nie zna następstw swoich
   decyzji; nowi konsumenci podłączają się bez pracy zespołu reguł.
4. **Semantyka zdarzeń wyjściowych**: jeśli interpretacja zmiany wymaga logiki, zamknij ją
   u nadawcy (dwa zdarzenia zamiast jednego z delta-payloadem).
5. **ACL na wejściu** chroni wewnętrzny model; Process Manager scala zdarzenia; event log +
   projekcje okienkowe oddzielają przetwarzanie danych od ewaluacji reguł (silnik dostaje
   kontekst „na tacy").
6. **Przy zmiennych wymaganiach odnośnie źródeł**: odwróć kierunek — generyczne API odczytowe
   u producentów, parametry kwerend (logika) po stronie modułu reguł.
7. **W trójpodziale logiki**: core (serwis ofertowy / pipeline scoringowy) jest stabilny;
   reguły to domknięcia za stabilnym interfejsem; fabryki/konfiguracja to wybór domknięć.
   Mapowanie DDD large-scale: Capability/Operations → stabilne, Policy → domknięcia,
   Decision Support → inteligencja fabryk.
8. **Reguły jako pluginy**: core silnika reguł reużywalny; rabaty, scoring faktur, zdolność
   kredytowa — wymienne wtyczki na tym samym mechanizmie.

---

## 10. Typowe błędne implementacje i konsekwencje

| Błąd | Konsekwencja |
|---|---|
| Osobna klasa strategii per nazwa biznesowa (VIP/Gold/Standard różniące się parametrem) | Mylenie nazwy typu z polem `name`; mnożenie klas; symptom braku abstrakcji esencji; przy szybkim rynku — czynnik porażki |
| „Rabat ujemny", magiczne ceny (−1 = gratis, −2 = reklamacja), operatory bitowe na cenach | Hakowanie modelu zamiast modelowania; nieczytelność, pułapki w każdej operacji na cenie |
| Switch po enumie w fabryce | Nowa wartość enuma → cicha wartość domyślna; szukanie miejsc użycia ręcznie |
| Visitor po enumie (sprytny Double Dispatch) przy wymaganiach dynamicznych | Beton: wartości definiowane w runtime nie mieszczą się w enumach; syndrom Love to a Brain Child blokuje wymianę |
| Hardkodowane if-y w jednym ośmiotysięczniku | Eksplozja kombinatoryczna przypadków testowych; kod nietestowalny |
| Procedura SQL 17 000 linii współdzielona przez kilkanaście banków z kastomizacjami | Każda zmiana grozi regresją; błędy wykrywane po pół roku (faktura okazuje się długiem); kary umowne — „banki mają prawników lepszych niż software house'y". Remedium: ~100 małych reguł (cechy faktury / cechy klienta / historia), per bank podzbiór z priorytetami, per rola inne drzewa |
| Skrypty z logiką w bazie danych | „Sponiewiera wersjonowanie i testowanie"; zamiast tego refleksyjne tworzenie obiektów z nazw typów |
| Refleksja „zła": wołanie metod po stringach | Brak kontroli typów; zarezerwowane dla twórców frameworków |
| Modyfikator sięgający do bazy po dane produktu / lazy loading ORM | Testy jednostkowe wymagają mocków; lazy loading tylko ukrywa problem; zamiast tego świadome dane w `OfferItem` |
| Komendy zamiast zdarzeń między modułami a modułem reguł | Logika rozlana na wiele zespołów, synchronizacja release'ów, wersjonowanie API (złożoność przypadkowa), spaghetti |
| Fabryka wymagająca oferty do stworzenia konfiguracji rabatowej | Brak możliwości: fabryki raz na sesję, podglądu rabatów bez oferty, „kuszenia" klienta do progu |
| Statyczna hashmapa reguł sprzedawana jako silnik | „Ukryte if-y w hashmapie", przerost formy nad treścią — zysk pojawia się dopiero przy dynamicznej konfiguracji |
| Każda algebra implementująca visitora drzewa | Powielona logika analizy drzewa; nowy węzeł zmienia każdą algebrę; brak możliwości dekorowania algebr |
| Ostre progi tam, gdzie biznes myśli płynnie | „Zmiana o 1 zł przeskakuje prawda/fałsz"; rozważ logikę rozmytą z marginesem |
| Brak guardiana przy regułach konfigurowanych przez użytkownika | Incydent produkcyjny: rabaty poniżej kosztu zakupu, −100 tys./tydzień |
| Reguła odpowiada „po nowemu" tylko od wdrożenia | Bez event logu nie da się przeliczyć wstecz przy zmianie okna/reguł |
| Brak wizualizacji drzew reguł i transferu wiedzy | Przeładowanie kognitywne; niezrozumienie modelu przez część zespołu → dewiacja modelu |
| Pochopna generalizacja (pozycja + oferta w jednym; uniwersalny komponent scoringu od razu) | Więcej zamieszania niż pożytku, trudniejsze testy; zacznij od osobnych przypadków, reużyj abstrakcje i algebry |

---

## 11. Tabela mapowania: pojęcie domenowe → element archetypu

| Pojęcie domenowe / wymaganie | Element archetypu |
|---|---|
| Rabat, narzut, gratis, podatek, opłata | Modyfikator (`OfferItemModifier` / `OfferModifier`) — neutralna „modyfikacja", nie „rabat" |
| „−5% jeżeli > 10 sztuk" | `ConfigurableItemModifier` = predykat (liczba sztuk) + aplikator (% od ceny) |
| „Procent od ceny bazowej czy po rabatach?" | Dwa osobne aplikatory; wybór w kreatorze |
| Nazwa promocji („na trzecie urodziny VIP-ów") | Pole `name` modyfikatora (nie typ) |
| Warunek przyznania zależny od klienta (status, staż, historia) | Predykat na `ClientContext` w mapie konfiguracyjnej fabryki |
| Warunek zależny od pozycji/oferty | Predykat wewnątrz modyfikatora |
| „Rabaty się sumują" | Kompozyt `ChainOfferItemModifier`; niemutowalne value objecty przekazywane dalej |
| Minimalna marża / „nie schodzimy poniżej kosztu" | Guardian — predykat opłacalności po symulacji zmiany |
| Złożony warunek „VIP i staż ≥ 3 lata" | Drzewo specyfikacji: węzły AND/OR/NOT, liście = warunki biznesowe |
| Kreator reguł na GUI | Słownik klocków (predykaty, aplikatory, parametry) + zapis do tabel `Modifier`/parametry; odczyt refleksją do drzew obiektowych |
| Katalog promocji per tenant / per bank / per rola | Podzbiór reguł z priorytetami; osobne drzewa per rola |
| Scoring, punkty, kary/nagrody | AST `Expression` + `ScoreAlgebra` (warunki 0/1, stałe punktowe, suma) |
| „Suma zakupów w roku", „reklamacje w kwartale" | Metryka w `WindowContext` (projekcja z okna czasowego: tumbling/sliding) |
| „Klient prawie VIP", płynne progi | Algebra rozmyta Zadeha: threshold + margines, AND=min, OR=max, if = mieszanka liniowa |
| „Za co te punkty?" (paragon, uzasadnienie) | Algebra `Explained`: linie (opis, wartość) + suma; węzeł `label` |
| „+3 pkt za każdy zakup > 1000 zł" | Reguła zdarzeniowa: wyrażenie filtrujące (algebra boolowska) + wyrażenie scoringowe |
| „Przeliczmy wstecz po zmianie okna" | Event log (wszystkie zdarzenia) + nakładanie dowolnych okien retroaktywnie |
| „Zakupy/płatności/reklamacje wpływają na status, katalog, priorytety" | Brakujący moduł pośredni (Scoring): zdarzenia wejściowe → scoring → zdarzenia wyjściowe |
| Zdolność kredytowa | Funkcja (dane, kwota) → bool + bisekcja po kwocie; wnętrze = drzewo specyfikacji |
| Faktoring (ocena ryzyka faktury) | ~100 małych reguł (cechy faktury / klienta / historia) komponowanych per bank |
| „System sam proponuje promocje" (zaleganie magazynu, liczba VIP-ów) | Dynamiczna konfiguracja fabryki; Decision Support; symulacje drzew reguł |
| Polityka rabatowa / scoringowa jako artefakt | Konfiguracja w bazie (relacyjnie) lub JSON; wersjonowana (rejestr nazewników / wersje JSON) |
| Stabilny proces (generowanie oferty, pipeline scoringu) | Logika stabilna (core) z punktami rozszerzeń; Capability/Operations |
| Konkretna reguła biznesowa | Domknięcie (Policy) za stabilnym interfejsem |
| „Komu jaka reguła przysługuje" | Wybór domknięć — fabryka na konfiguracji (+ ew. inteligencja) |

---

## 12. Pytania do biznesu przy odkrywaniu archetypu

Pytania frameworku mentalnego (strefy zmienności):

1. Co w tym procesie jest **stabilne** — co relatywnie rzadko podlega zmianom? Czym jest core?
2. Co **się zmienia** i jak często? Jaki jest **stabilny kontrakt** tych zmian?
3. **Kto i jak decyduje**, która reguła ma zastosowanie? Jakie reguły rządzą tym wyborem?
   (Użytkownik na GUI? Konfiguracja? System sam — czyli potrzebna fabryka z modelem wyboru?)

Pytania o dynamikę reguł:

4. Czy reguły mają być zmieniane **bez ingerencji programistów** (w runtime, przez uprawnionych
   użytkowników)? Jak szybko zmiana musi być na produkcji — 5 minut czy wystarczy release?
5. Czy wartości słownikowe (statusy, kategorie) są zamknięte, czy użytkownicy będą definiować
   nowe?
6. Czy reguły zależą od wielu wymiarów naraz (klient, zamówienie, magazyn, daty, rola, tenant)?
   Czy różni tenanci/role dostają różne podzbiory reguł z różnymi priorytetami?

Pytania o semantykę modyfikacji:

7. Czy zawsze mówimy o obniżce, czy cena może też **rosnąć**? Czy modyfikacją może być
   **dodanie pozycji** (gratis)? — modyfikacja pozycji vs modyfikacja całości.
8. Procent liczony **od ceny bazowej czy od ceny po poprzednich modyfikacjach**? (Odpowiedź
   „czasem tak, czasem tak" ⇒ parametr w kreatorze.)
9. Czy modyfikacje się **sumują**? W jakiej kolejności? Co widzi klient jako uzasadnienie zmiany
   ceny?
10. Jakie są **granice bezpieczeństwa** (minimalna marża, maksymalny rabat)? Ile kosztuje ich
    brak? (Zawsze najpierw wycena bólu, potem wycena rozwiązania.)

Pytania o czas decyzji i dane:

11. **Kiedy** podejmujemy decyzję o przysługujących regułach — przed istnieniem
    oferty/transakcji (kontekst klienta) czy w jej trakcie (kontekst pozycji)? Czy chcemy
    pokazywać/„kusić" możliwościami zanim warunki są spełnione?
12. Do jakich danych reguła potrzebuje dostępu i skąd? Czy pobranie kontekstu jest kosztowne
    (⇒ rozbicie kontekstu / fasada z kwerendami ad hoc)?

Pytania o scoring i wynik:

13. Czy wynik to tak/nie, czy **liczba** (punkty), **stopień** (rozmyty), wektor per kategoria?
    Czy progi są ostre, czy biznes myśli płynnie („prawie VIP")?
14. Czy trzeba **wyjaśnić** wynik — „za co te punkty"? (audyt, reklamacje, regulacje)
15. Jakie **okna czasowe** obowiązują (miesiąc/kwartał/rok)? Czy mogą się zmienić — i czy wtedy
    trzeba **przeliczyć historię wstecz**? (⇒ event log)
16. Czy liczymy po projekcjach (sumach), czy **per pojedyncze zdarzenie** („za każdy zakup
    powyżej…")? Jak świeży musi być wynik (na żądanie / na zdarzenie / co n zdarzeń / co x s)?

Pytania architektoniczne:

17. Co **wpływa** na decyzję (źródła zdarzeń) i kto **reaguje** na jej zmianę (konsumenci)?
    Czy rysuje się relacja wiele→wiele? (⇒ brakujący moduł pośredni)
18. Jak często zmienia się lista źródeł? (często ⇒ generyczne API odczytowe + parametry kwerend
    po stronie modułu reguł)
19. Czy ta sama mechanika reguł obsłuży inne dziedziny (rabaty, scoring faktur, zdolność
    kredytowa, scoring dostawców) — czy warto wydzielić core reguł i traktować dziedziny jako
    pluginy? Czy budować komponent konfigurowalny, czy osobne projekty z reużyciem abstrakcji
    i algebr?
20. Kto w zespole musi rozumieć model (transfer wiedzy), jakiej **wizualizacji** drzew reguł
    potrzebują użytkownicy i deweloperzy? Czy biznes chce **symulować** reguły przed aktywacją
    (ilu klientów złapie, wpływ na wynik finansowy)?

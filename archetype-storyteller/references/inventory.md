# Archetyp Inventory / Availability — zarządzanie ograniczonymi zasobami i ich dostępnością

## 1. Esencja

Inventory to NIE magazyn, NIE półki, NIE WMS/ERP/SKU — to archetyp zarządzania **dowolnym
zasobem, który jest w jakikolwiek sposób ograniczony** i który może być udostępniany,
rezerwowany, przydzielany, a jego dostępność zmienia się w czasie. Skojarzenie z magazynem
(utrwalone m.in. przez "Enterprise Patterns and MDA", gdzie Inventory pojawia się głównie
w kontekście produktów i katalogu) nie jest błędne, ale jest **niepełne** — i jeśli się na nim
zatrzymamy, będziemy w każdej branży od nowa wymyślać modele dla tego samego problemu.

Kanoniczna scenka: bank buduje proces kredytowy z obietnicą "Twoja decyzja będzie już dziś".
Pierwszy odruch programisty: flaga "dzień roboczy + przed 16:00 → szybka decyzja". Drugi
odruch: wyciągnąć z bazy liczbę wniosków i **regresją zgadywać**, czy się uda. Oba podejścia
rozsypują się na pytaniach: a jeśli w środku dnia sloty się skończą (analitycy zajęci, urlopy,
czekanie na ryzyko)? Co z wnioskiem nr 201, gdy limit to 200 dziennie? Co gdy ktoś z dwustu
się wycofa i **zwolni się miejsce** — kogo wpuścić z kolejki? Właściwa odpowiedź: sloty czasowe
pracy analityka to **zasoby** — skończone, o dostępności zależnej od wielu czynników. To jest
problem inwentarza, mimo że "magazyn" nie ma tu nic do rzeczy.

Przykłady tego samego archetypu w różnych branżach:
- czas lekarza w przychodni — ograniczony, planowany, rezerwowany, z priorytetami,
- skrytki w paczkomacie — ograniczone przestrzenie zależne od lokalizacji i czasu,
- promocyjny kredyt konsumencki — limit środków, okres obowiązywania, warunki przydziału,
- sprzęt medyczny — jeden aparat EKG, wiele oddziałów, konieczność planowania,
- biurka w firmie — zależne od piętra, trybu pracy, grafiku zespołów,
- w jednej firmie logistycznej: czas kurierów, skrytki, powierzchnia magazynowa, rampy, pojazdy.

Każdy z tych obszarów trafia zwykle do innego zespołu, innego analityka, innej aplikacji —
efektem są różne pojęcia, różne API, różne modele dostępności i rezerwacji dla **tego samego
problemu**. Archetyp pozwala szukać części wspólnych, budować jeden język i przestać wymyślać
to od nowa. Hasło modułu: *to nie jest moduł o magazynach — to moduł o zarządzaniu
ograniczeniami. Jak nauczysz się rozpoznawać ograniczenia, reszta układa się sama.*

## 2. Rozpoznawanie rzeczywistych zasobów systemu (L01)

Prawie każdy system biznesowy zarządza czymś ograniczonym: produktem, czasem, sprzętem,
ludźmi, środkami finansowymi. Wszędzie padają te same pytania: **Czym dysponuję? Co mogę komuś
udostępnić? Ile tego naprawdę potrzebuję?** (sklep: czy mogę sprzedać jeszcze jedną sztukę;
przychodnia: czy lekarz ma wolny termin; bank: czy możemy udzielić kolejnego kredytu
promocyjnego; logistyka: czy mamy wolną rampę załadunkową).

Heurystyki rozpoznawania zasobów:

1. **Zasób ≠ to, co widać w UI ani to, co sprzedaje katalog.** Szukaj tego, co *faktycznie
   istnieje jako zasób*: co jest ograniczone, w jakim czasie, w jakim miejscu i w jakim
   kontekście może być użyte. Zasoby wykrywa się nawet tam, gdzie nie widać produktów.
2. **Zasób bywa przecięciem bytów.** Placówka otwarta 7:00–19:00, pielęgniarka pracuje
   8:00–16:00, badanie EKG z biurokracją zajmuje 20 min → zasobem nie jest aparat EKG ani
   pielęgniarka, tylko **TimeSlot w kalendarzu pielęgniarki mającej dostęp do aparatu**
   (3 pacjentów na godzinę). Przy 2 aparatach EKG, 3 Holterach i 2 pielęgniarkach zasób to
   przecięcie kalendarzy i sprzętu — modelowanie dosłowne kończy się serwisem integrującym
   inne serwisy i kolejnymi if-ami na każdą konfigurację.
3. **Produkt nieograniczony → ogranicza coś innego.** Umowa telekomunikacyjna: chcemy ich
   miliony, ograniczone są czas konsultantów, pojemność sieci, infolinia. Masaż: chętnie
   sprzedam dziś tysiąc sesji — ogranicza mnie kalendarz pracowników. **W samym produkcie
   nie ma wyścigu; wyścig jest gdzie indziej** — i tam jest zasób.
4. **Koszt utrzymania inwentarza** (uproszczony wzór z MDA): koszt ≈ suma po typach zasobów
   iloczynów (koszt jednostkowy utrzymania × liczba instancji × średni czas pobytu
   w inwentarzu × średni koszt utrzymania). Każdy iPhone zajmuje miejsce i został kupiony;
   każda godzina pracy — i często godzina nierobienia niczego — kosztuje. Przykład wymiarowania:
   100 wniosków/mies., analiza = 2 roboczodni → 200 roboczodni/mies. → 10 analityków; zwolnienie
   lub choroba = problem; +2 osoby = luz, ale przy mniejszej liczbie wniosków "płacimy za
   powietrze". Dlatego zasoby trzeba **zidentyfikować, skatalogować i zarządzać ich stanem**,
   aby świadomie realizować plany biznesowe.
5. **Zasoby niematerialne liczą się tak samo**: moc obliczeniowa, konsultacje, przepustowość,
   sloty czasowe, limity, pule tokenów.
6. Archetypowe rozwiązanie **zdejmuje obciążenie poznawcze** z zespołów — nawet gdy ani biznes,
   ani osoby techniczne nie podejrzewają, że w ich domenie są ograniczone zasoby.

## 3. Dlaczego stan nie określa dostępności (L02)

### Pułapka modelowania dosłownego

Konotacja "inwentarz = magazyn przedmiotów" sprawia, że architekci odrzucają na starcie
porównania swojego biznesu do sklepu — i wpadają w modelowanie dosłowne: obiekt `Analityk`
ze slotami i metodą `wykorzystaj()` z if-em na moce przerobowe; szukanie analityka = iteracja
po wszystkich albo SQL; obiekt `Container` z `capacity` i `allocate()`. W jednym biznesie
logistycznym (czas kurierów + skrytki + powierzchnia + rampy) kończy się to **wieloma
specjalizowanymi modelami zarządzania zasobami obok siebie**.

### Od "ile mamy" do "czy mogę użyć"

Typowa ścieżka wymagań wobec modelu zasobów:

- **Ile mamy?** — zależy od sposobu śledzenia (ProductTrackingStrategy z archetypu Product):
  zasoby jednoznacznie identyfikowalne → jeden obiekt/rekord na egzemplarz; nierozróżnialne
  i niedyskretne (płyny, nasiona, czas) → reprezentacja zbiorcza.
- **Ile dostępnych/niedostępnych?** — typowe rozwiązania: proste zapytania SQL, pola
  `used`/`total`, zliczanie instancji produktów, licznik w modelu odczytu aktualizowany
  zdarzeniami. Działają, ale są **silnie sprzężone** z dosłownym modelem branżowym
  (paczkomat, lekarz, analityk, promocja) albo z modelem produktów → te same problemy
  rozwiązujemy w wielu miejscach, zero ponownego użycia.
- **Wymiar czasu** — jak w produktach i cennikach: sprzedaż w terminie, polityki w okresach;
  zasoby też mają kalendarze (przykład EKG wyżej).
- **Lokalizacja** — iPhone tylko w salonie w Promenadzie bez wysyłki; sieć salonów SPA,
  ale osteopaci w dwóch lokalizacjach po 4 h/tydz. Pytanie modelarskie: czy lokalizacja to
  właściwość typu produktu, instancji, czy czegoś innego?

### Dostępność to decyzja, nie pole

Pytanie oddzielające system raportowy od operacyjnego: **czy mogę TERAZ użyć tego zasobu?**
Odpowiedź jest złożona, a jej składowe dostarczają różne zespoły i aplikacje:

- **Elektromobilność**: "czy mogę ładować?" = czy stacja aktywna technicznie + czy pojazd
  podpięty + czy istnieje aktywny cennik. Może być energia i wolne gniazdo, a ładowanie się
  nie zacznie, bo brak polityki cenowej.
- **Hotel**: pokój "wolny" = brak rezerwacji + brak blokady operacyjnej (remont, awaria)
  + aktywna oferta/cennik na dzień i kanał + sprzątanie zdąży + brak overbooking policy dla
  segmentu. Pokój fizycznie istnieje, nie ma rezerwacji — a nocleg niemożliwy.
- **Wypożyczalnia aut**: klasa auta w lokalizacji + brak awarii + umyte + niezarezerwowane
  na przyszły termin + ważny przegląd i ubezpieczenie + aktywny cennik dla kanału i okresu.
  Auto stoi na parkingu bez rezerwacji — a wypożyczyć się nie da.

**Problem składania odpowiedzi z wielu miejsc**: zanim dostaniemy odpowiedź na drugie pytanie,
prawda o pierwszym mogła się zmienić → niespójność. Kluczowe pytanie: *jakie są konsekwencje
braku spójności?* Jeśli ktoś rezerwuje auto, a w międzyczasie ktoś inny zleca przewiezienie go
na inny parking — rezerwacja dotyczy auta nie tam, gdzie się go spodziewamy. Wyścig o zasoby
jest i techniczny, i biznesowy → **spójność natychmiastowa bywa kluczowa**. Rozproszenie
odpowiedzi po aplikacjach = zgoda na eventual consistency i życie z konsekwencjami (co bywa OK:
parkingi 1 km od siebie, auto dostawiane w 5 minut — żaden problem).

### Rezerwacje — co inwentarz MUSI, a czego NIE powinien

Od inwentarza NIE oczekujemy obsługi procesu biznesowego (płatności, autoryzacje, notyfikacje,
workflow). Oczekujemy tego, co w rezerwacjach powtarza się niezależnie od branży:

1. **Blokowanie zasobu** — rezerwacja musi realnie wpływać na dostępność; jeśli po utworzeniu
   zasób wciąż "dostępny", rezerwacja nie ma wartości operacyjnej.
2. **Czas życia** — rezerwacje wygasają, są anulowane, zastępowane; automatyczne zwalnianie,
   jasne reguły powrotu do puli.
3. **Powiązanie z podmiotem** — rezerwacja zawsze jest czyjaś (klient, zamówienie, proces,
   użytkownik); inwentarz nie wie, kim jest owner, ale wiąże rezerwację z identyfikatorem
   i egzekwuje konsekwencje.
4. **Ilość i typ** — konkretna instancja, ilość z puli lub kombinacja zasobów naraz — wprost
   w modelu, nie przez konwencje i komentarze.
5. (Zamienniki/substytuty przy braku towaru — to już archetyp **Ordering**, nie Inventory.)

### Waitlisty — zapowiedź

Popyt > podaż, decyzje nie zapadają natychmiast, nie wszyscy rezerwujący skorzystają.
Wariant informacyjny (zapis intencji, bez wpływu na dostępność) vs operacyjny ("pierwszy
z listy MA dostać zasób — natychmiast, deterministycznie, bez wyścigu"). Dwa warianty
integracji: sprzężenie z **dostępnością** (transakcyjne zdjęcie pierwszego wpisu przy zmianie
dostępności — sens, gdy dostępność zmienia się też przez dostawy, grafiki) albo z
**rezerwacjami** (dopiero utworzenie/wygaśnięcie rezerwacji uruchamia pierwszego z listy).
Wybór jest **biznesowy**, nie techniczny: kiedy uznajemy, że zasób "należy" do kolejnego
oczekującego. Drugie pytanie: wejście na listę świadome (użytkownik decyduje się czekać)
czy automatyczne (nieudana rezerwacja → system dopisuje) — inne UX, inne oczekiwania, inna
odpowiedzialność systemu; to element strategii obsługi popytu, nie detal implementacyjny.

### Podsumowanie oczekiwań wobec Inventory

- modeluje różne typy zasobów: instancje, pule, wolumeny, czas;
- **rozróżnia posiadanie zasobu od możliwości jego użycia**;
- uwzględnia czas i lokalizację jako elementy dostępności;
- daje jedną spójną odpowiedź "czy zasób jest dostępny teraz / w danym momencie";
- wspiera rezerwacje realnie blokujące zasób, z określonym czasem życia;
- obsługuje niedobór waitlistami — bez wyścigów i decyzji podejmowanych w kodzie procesu.

## 4. Sygnały dopasowania (triggery)

Warunek rdzeniowy: **zasób jest ograniczony + więcej niż jeden aktor + nie da się zaspokoić
wszystkich naraz**. Słowa i zwroty, które zdradzają Inventory, nawet gdy nikt go tak nie nazywa:

| Sygnał w języku biznesu / kodzie | Element archetypu |
|---|---|
| "ile mamy?", "ile zostało?" | InventoryEntry + agregacja quantity |
| "dostępny", "wolny", "zajęty" | ResourceAvailability + Blockade |
| "zarezerwować", "blokada na 15 minut" | Reservation / Blockade z czasem życia |
| "kto pierwszy, ten lepszy", wyścig | rywalizacja: Individual/Pool ResourceAvailability |
| "klient VIP ma pierwszeństwo" | WaitList z polityką priorytetową |
| "zwolniło się miejsce, wpuść kolejnego" | WaitList sprzężona z dostępnością/rezerwacją |
| "limit X dziennie", "pojemność", "kwota" | Pool resource / capacity |
| "slot", "termin", "grafik", "kalendarz" | TemporalResourceAvailability + segmentacja |
| "pakiet: TV + montaż + Netflix" | Composite / koordynator blokad |
| "overbooking", "safety stock", "kwarantanna" | polityki dostępności (dostępność ≠ stan) |
| "lista oczekujących", "waitlista", "pre-order" | WaitList (popytowa) / pre-order (podażowy) |
| kod: statusy, flagi `isAvailable`, ręczne sprawdzanie czasu, retry, race conditions | "Inventory bez Inventory" |

Druga scenka kursu: skrzynki na paczki — odbiorca może otworzyć skrzynkę, bo jest tam paczka
dla niego **do określonego terminu**; pracownicy otwierają wszystkie; udostępnienie odbioru
sąsiadowi; masowe wydłużenie terminu odbioru przed huraganem. Odruch "klasa Paczka z polami
Odbiorca, Paczkomat, maxDue" rozsypuje się przy każdym nowym wymaganiu — a w modelu zasobów:
skrzynka to zasób o ograniczonej dostępności (dziś wolna, jutro zajęta przez X do 16:00),
masowa aktualizacja = znajdź wszystkie zasoby w lokalizacji i zaktualizuj. Gotowe od ręki.

## 5. Anty-sygnały / granice archetypu

- **Produkt bez ograniczenia i wyścigu** — umowa abonamentowa, polisa, subskrypcja SaaS,
  zlecenie kredytowe: to instancje produktów w sensie domenowym, ale NIE zasoby Inventory
  (chcemy ich nieskończenie wiele; ograniczenia leżą w zasobach obsługi, nie w produkcie).
- **Zamienniki/substytuty** przy braku towaru → archetyp **Ordering**, nie Inventory.
- **Proces biznesowy** (płatności, autoryzacja, notyfikacje, workflow, cykl życia zamówienia)
  → poza Inventory; Inventory tylko blokuje/zwalnia i odpowiada na pytania o dostępność.
- **Historia, wartość, audyt, rekoncyliacja** ("skąd się wzięło 630?", "ile to warte?")
  → granica archetypu; to domena **Accounting** (patrz §10).
- **Tożsamość, dane klientów, role** → **Party**; Inventory trzyma tylko OwnerId/snapshot.
- Zasób tani, niskiego ryzyka, liczy się tylko "teraz", nikt nie audytuje, MVP → czysty
  Inventory bez Accounting (koszt złożoności > koszt błędów).

## 6. Idea archetypu Inventory (L03)

### Relacja do archetypu Product

Trzy perspektywy produktu: **ProductType** (czym produkt jest — natura, cechy, strategia
śledzenia, jednostka; stabilny), **CatalogEntry** (jak go sprzedajemy — nazwa handlowa, opis,
okres, kanał; byt marketingowy, zmienny), **ProductInstance** (co realnie istnieje — konkretny
egzemplarz, numer seryjny). Żadna z nich nie odpowiada na pytania: ile mamy, gdzie to jest,
które egzemplarze spełniają kryteria, czy produkt jest dostępny, czy mogę go zarezerwować.
To pytania **ilościowe, lokalizacyjne i selekcyjne** — i tu zaczyna się Inventory. Inventory
nie zmienia instancji produktów — **przyjmuje instancje i zarządza nimi w kontekście ilości
i dostępności**. Nie zastępuje archetypu Product; pracuje na jego danych z inną perspektywą.

Kluczowe: **nie zawsze produkt jest tym, co jest ograniczone** (patrz §2 pkt 3) — czasem
produkty mapują się wprost na to, czym zarządzamy, a czasem ograniczenie leży obok produktu.

### Strategie śledzenia i ich konsekwencje

- **Jednoznacznie identyfikowalne** (sejf depozytowy, karta kredytowa, licencja, wizyta):
  każda instancja = osobna pozycja inwentarza.
- **Batch/partie** (jogurty, mleko, konserwy, ziarno, leki z numerem serii i datą ważności):
  nie śledzimy jednostek, tylko partie; elementy nierozróżnialne. NIE tworzymy ProductInstance
  dla każdego litra/dawki (zalew obiektów, zła rozdzielczość, niezgodność z praktyką pracy) —
  ProductInstance ma relację do partii, może reprezentować np. dostawę, a inwentarz agreguje
  ("ile paliwa?" → 1600 litrów).
- **Nierozróżnialne bez partii** (piach, żwir, gwoździe na wagę, energia, woda): jak batch,
  ale bez relacji do partii.
- **Miks** (poduszki powietrzne, mikroprocesory: numer seryjny + partia): wygrywa jednoznaczna
  identyfikowalność — wpis na egzemplarz.

Miary bywają różne: sztuki, kilogramy, litry, godziny.

### InventoryEntry

Moment "trafienia instancji do Inventory" = przejście z myślenia o egzemplarzu do myślenia
o **zbiorze**. **InventoryEntry** to właściciel perspektywy zbiorczej: "to jest mój produkt
(ProductType/PackageType) i to jest zbiór instancji, które uznaję za mój inwentarz". Bez niego
pytanie "ile mamy iPhone'ów 15 Pro" staje się odpowiedzialnością przypadkowych miejsc (raz
zamówienia, raz magazyn, raz raportowanie — każdy liczy i filtruje inaczej).

Decyzja projektowa: InventoryEntry **nie komponuje obiektów instancji, trzyma tylko
identyfikatory** (InstanceId). Kompozycja nie jest zła per se, ale przy tysiącach instancji
ogranicza ją pamięć — agregat wczytujący pół magazynu do pamięci nie domyka transakcji.
Entry ma być lekkie, stabilne, łatwe do przebudowy; instancje leżą w repozytorium.

### Granica Product ↔ Inventory (osobne bounded konteksty)

Inventory i Product to **osobne moduły / bounded contexty** (wbrew MDA, które pokazuje silne
zależności między archetypami, ignorując architekturę). Trzy pokusy i rozwiązanie:

- **Wstawić cały Product do Entry** → ciężki byt, metadane i reguły nieistotne dla Inventory,
  runtime'owa zależność od modułu Product, efekt domina przy zmianach, testy budujące pół
  systemu, utrata niezależnych deploymentów.
- **Trzymać tylko productId** → Inventory nie zna strategii śledzenia (nie zweryfikuje
  serial/quantity), nie zna jednostki (nie wie, czy sumowanie ma sens); każda decyzja =
  zapytanie do Product Module; Inventory staje się cienkim klientem cudzej logiki.
- **Rozwiązanie: InventoryProduct** — własna, autonomiczna **projekcja produktu** z zakresem
  potrzebnym Inventory (tożsamość, nazwa, strategia śledzenia, jednostka miary — i nic więcej).
  Nie konkuruje z ProductType, nie zastępuje go. Zasilana **synchronizacją zdarzeniową**
  (ProductDefined/ProductUpdated); Inventory nie odpytuje produktu za każdym razem — pamięta,
  co mu potrzebne.

### Skąd się biorą instancje — architektura tworzenia

Źródła instancji: przyjęcie dostawy, produkcja, import, integracja z WMS, planowanie przyszłej
oferty ("0 na stanie" zanim cokolwiek przyjdzie). Dwa scenariusze: (a) puste Entry, potem
dopisywanie instancji — trywialne; (b) tworzenie instancji z auto-utworzeniem Entry, gdy go
nie było.

**Wariant odrzucony: instancje w Product Catalog (SSOT dla wszystkich instancji).**
Zaleta (dlatego bywa pierwszym pomysłem): pełny kontekst walidacyjny w jednym miejscu —
kompletność cech, zgodność z ProductFeatureType, reguły obowiązywania, gwarancja braku
niepoprawnych instancji. Wady: miesza porządek definicyjny z operacyjnym; katalog (mało
definicji, niska zmienność, czytelnicy biznesowi, umiarkowane SLA) vs instancje (setki tysięcy
/miliony, intensywne zapisy, wyścigi, limity, presja na wydajność i spójność, inni
interesariusze: logistyka, operacje, fulfillment, planowanie; inne indeksy, partycjonowanie,
cache, wolumeny zapisu). Rozszerzony katalog robi się za wolny dla Inventory, zbyt niestabilny
dla katalogu, za drogi dla organizacji — Single Point of Failure o najwyższym SLA.
Integracja komendowa (katalog wysyła "zarejestruj instancję" raz do Inventory, raz do
sprzedaży, raz do workflow) → katalog staje się **centralnym orkiestratorem**: musi znać
wszystkie procesy, każda nowa ścieżka biznesowa = zmiana w katalogu, wąskie gardło
organizacyjne, monolit integracyjny. Dlatego orkiestracja odpada — łamie granice
odpowiedzialności. Jeśli katalog ma informować o instancjach, **jedyną akceptowalną formą są
zdarzenia** (zdarzenie nie narzuca odbiorcy; każdy kontekst sam decyduje, co go interesuje).

**Wariant rekomendowany: instancje powstają w Inventory** (lub innych kontekstach operacyjnych,
które nimi żyją: magazyn, produkcja, fulfillment, planowanie). Katalog definiuje typy
i publikuje definicje; Inventory tworzy instancje, gdy realnie pojawia się zasób, i bierze
odpowiedzialność **tylko za produkty podlegające wyścigowi**. Cena: utrata łatwej centralnej
walidacji. Strategie walidacji:

1. **Synchroniczne odpytanie katalogu** przy tworzeniu instancji — czyste konceptualnie
   (reguły w jednym miejscu), ale zdalne wywołanie na ścieżce zapisu, twarde sprzężenie,
   wąskie gardło przy wolumenie; Inventory staje się klientem katalogu.
2. **Lokalna projekcja definicji** (synchronizacja zdarzeniami) — autonomia i wydajność,
   tworzenie instancji jest operacją lokalną; koszt: wiedza o produkcie wychodzi poza katalog,
   potrzebna dyscyplina, versioning zdarzeń, akceptacja chwilowej eventual consistency.
   **Najczęstszy wybór w dojrzałych systemach.**
3. **Katalog publikuje wykonywalne reguły walidacji** — Inventory egzekwuje reguły dostarczone
   przez katalog; semantyka zostaje w katalogu, brak runtime dependency i dublowania logiki,
   ale nowa klasa złożoności: format reguł, kompatybilność, wersjonowanie, bezpieczeństwo.
   Dla walidacji krytycznych/formalnych o wysokim koszcie błędu.
4. **Shared Kernel** (wspólny model, współdzielone biblioteki) — działa krótkoterminowo,
   długoterminowo blokada zmian, sprzężenie zespołów, kod, którego nikt nie chce ruszać.

Nie ma darmowych lunchów: albo płacimy synchronizacją i zależnościami, albo złożonością
i dyscypliną architektoniczną.

### Zliczanie i filtrowanie

Każda instancja ma **quantity** (liczba + jednostka, `preferredUnit`): INDIVIDUALLY_TRACKED →
domyślnie `Quantity.of(1, unit)`; BATCH_TRACKED / IDENTICAL → jawnie ustawiane. Zliczanie =
znaleźć Entry, pobrać instancje, **zsumować quantity** — bez specjalnych przypadków per
strategia. Przykłady: iPhone 15 Pro → 2 szt.; benzyna 95 w partiach → 8000 l; dostępność
konsultingowa → 75 h; palety iPhone'ów (100 szt./paleta, egzemplarze śledzony indywidualnie,
SN001 nie może być na dwóch paletach) → 3 palety; palety mleka (24×1 l, mleko BATCH_TRACKED)
→ 5 palet — **quantity PackageInstance to liczba paczek, nie zawartość**; ta sama logika
sumowania działa dla ProductInstance i PackageInstance. Nie trzeba rozumieć, czym jest produkt
— wystarczy zsumować ilość (dobra materialne i niematerialne jednakowo). Przy dużej skali
sumowanie w pamięci zastępuje zapytanie bazodanowe — API fasady się nie zmienia.

Zliczanie warunkowe ("ile iPhone'ów czarnych", "ile paliwa z batcha", "godziny konsultingu
powyżej progu"): druga metoda fasady z parametrem **InstanceCriteria** — prosty interfejs
odpowiadający wyłącznie "czy ta instancja spełnia warunek" (nie zlicza, nie zna Inventory ani
repozytoriów). Wymiary filtrowania: cechy (kolor, wariant, pojemność), partia/seria/dostawa,
ilość (progi), lokalizacja (magazyn, strefa, slot), stan (dostępne, zarezerwowane, wycofane).
Realizacja techniczna dowolna (predykaty in-memory, budowniczowie zapytań, specyfikacje ORM,
DSL, tłumaczenie wprost na WHERE). Trzy zasady projektowe: zliczanie zawsze sumuje quantity;
kryteria tylko zawężają zbiór; Inventory kryteriów **nie rozumie, tylko je stosuje** — API
stabilne, model nie pęcznieje.

### Od instancji produktów do zasobów

Pytania operacyjne nie zawsze dotyczą produktu: zarezerwuj egzemplarz dla koszyka (e-commerce);
pokój 301 na konkretne dni, sala konferencyjna jutro, miejsce A15 (hotel); 480 l mleka z batcha
dla sklepu, wolne litry w komorze chłodniczej nr 5, blokada 240 l na czas weryfikacji, "czy jest
≥1000 l, dowolny batch" (dystrybucja); slot 14:00–14:30 u konkretnego lekarza, sala operacyjna
nr 2 za tydzień (medycyna).

Dla telefonu wzbogacenie ProductInstance o lokalizację/status/flagę "zarezerwowane" na krótko
działa (operacje dotyczą całego egzemplarza). Rozpada się, gdy:
- operujemy **na części**: rezerwacja 100 l z instancji-dostawy 480 l to nie rezerwacja
  instancji, tylko fragmentu jej ilości;
- rezerwacja dotyczy **kombinacji instancji**: zamówienie 1000 l z trzech batchy — każda
  instancja oddaje część; ProductInstance przestaje opisywać, co faktycznie zarezerwowano;
- w grze jest **czas**: wizyta "dostępna" nie ma sensu bez "kiedy, u kogo, w jakim przedziale";
  15 lekarzy z grafikami — nie tworzymy instancji produktu per lekarz/dzień/slot. **Kalendarz
  lekarza istnieje niezależnie od wizyt** (umowa z placówką, święta, urlopy, szkolenia,
  niedyspozycje; slot może być zablokowany na konsultacje wewnętrzne, przesunięty, skrócony —
  wszystko bez udziału produktu "wizyta"; instancja wizyty powstaje dopiero przy rezerwacji).
  Analogicznie pokoje hotelowe istnieją zanim sprzedamy nocleg (remont pokoju, remont ulicy,
  pokoje tylko dla wybranej grupy gości).

Wniosek: **operacyjnie używamy zasobów, nie (zawsze) instancji produktów**. Zasób = coś
konkretnego w świecie fizycznym lub logicznym, z czym instancje produktów mogą być powiązane
i na czym będą wykonywane operacje: pokój 301, miejsce A15, komora nr 5, slot 14:00–14:30
u lekarza X. Zasoby fizyczne (sztuki, kg, l, palety), czasowe, oraz **przecięcia** (kalendarz
dostępności koparki). Zasoby często pochodzą z innych systemów niż Inventory (grafiki z systemów
medycznych, pokoje z hotelowych, maszyny z produkcyjnych, moce z chmury) — te systemy nie znają
pojęcia produktu. Stąd potrzebna **oddzielna warstwa zarządzania zasobami**: działa także bez
ProductInstance, integruje systemy zewnętrzne, wspólna dla wielu domen. Łącznikiem światów jest
InventoryEntry wzbogacone o **mapę InstanceId → ResourceId**.

## 7. Dostępność (L04)

### Dostępność jako decyzja systemu

**Dostępność to nie informacja o stanie — to decyzja systemu.** Zasób może być fizycznie wolny,
logicznie nieużywany, technicznie sprawny, a system i tak nie zezwala na użycie. Rywalizacja
bywa **techniczna** (ktoś przegrywa, bo był drugi) albo **biznesowa** (przegrywa, bo nie
powinien wygrać): brak aktywnego cennika, brak umowy klienta, kwarantanna, safety stock, brak
uprawnień. Dlatego dostępność **nie jest polem w encji, jest mechanizmem decyzyjnym**.
Warunki zaistnienia problemu: zasób ograniczony + >1 aktor + nie da się zaspokoić wszystkich.

W podejściu archetypowym oddzielamy rzeczy specyficzne od generycznych: rdzeń to **dostępność
zasobu** z operacjami **lock/unlock**. Rdzeń ≠ kompletność — różne strategie potrzebują różnych
danych pomocniczych.

### Rdzeń modelu

- **Dwa identyfikatory**: `Id` — identyfikator agregatu dostępności (slotu dostępności);
  `ResourceId` — identyfikator zasobu. **Jeden zasób może mieć wiele slotów dostępności.**
- **LockCommand / LockRequest / UnlockRequest**: każda blokada definiuje zasób, identyfikuje
  blokującego i czas trwania; odblokowanie wymaga identyfikatora blokującego (weryfikacja,
  czy nikt nie podkrada blokady).
- **Blockade**: jednoznacznie identyfikowalna, referencja do aktora-założyciela, moment
  utworzenia, czas obowiązywania. Na tym poziomie odpowiadamy też "czy dostępny i w jakiej
  ilości".
- Dzięki temu "czy sala konferencyjna jest dostępna" i "czy mamy jeszcze 100 l mleka" to
  **technicznie to samo pytanie**: czy zasób istnieje + czy ktoś go nie zablokował + czy
  wystarczy tego, co dostępne. Sala vs mleko to kontekst domenowy; mechanizm identyczny.
- Podział odpowiedzialności: **ResourceAvailability** — "czy system pozwala skorzystać";
  **InventoryEntry** — "co istnieje i ile", delegując do zasobów przez mapę
  InstanceId→ResourceId.

### Typ 1: zasób indywidualny (IndividualResourceAvailability)

Konkretny, niepodzielny (egzemplarz laptopa, skrytka paczkomatu): dostępny albo nie; kto
pierwszy, ten lepszy; jedna blokada, zero kompromisów. Agregat DDD wyznaczający granicę
spójności natychmiastowej. Współbieżność: **optimistic locking** — pierwszy wątek zakłada
blokadę i podnosi wersję; pozostałe dostają OptimisticLockException. To **dobrze**: rywalizacja
jest realna, ktoś musi przegrać (zasób niepodzielny), optimistic locking chroni przed
overbookingiem (podwójna rezerwacja = błąd domenowy, nie techniczny).

Problem operacyjny: **hot resource** — jedyny rower cargo w lokalizacji, godziny szczytu:
1 wygrany, 4 wyjątki, retry wpada znów na zajęty zasób, fala konfliktów, opóźnienia, obciążenie
bazy. Biznesowo poprawne; technicznie dokuczliwe. Rozwiązanie: **nie zmieniamy modelu, dokładamy
mechanizmy operacyjne**: kolejkowanie przed próbą blokady (FIFO), limit retry, dedykowany
mechanizm rezerwacji.

### Typ 2: zasób ilościowy / pula (PoolResourceAvailability)

Podzielny, blokowany częściowo, wielu aktorów równolegle (500 l mleka, 200 miejsc parkingowych,
1000 tokenów API). Dostępność = całkowita ilość − suma blokad − część wycofana. Komenda
i blokada wzbogacone o ilość.

**Pułapka: false contention.** Cała pula = jeden agregat (jeden Id, jedna wersja, jedna lista
blokad, jeden punkt zapisu) — biznesowo jeden zasób z wieloma jednostkami, technicznie jeden
gorący punkt synchronizacji. 10 klientów × 30 l przy 500 l dostępnych: biznesowo wszyscy powinni
dostać; technicznie 1 sukces, 9 × OptimisticLockException, 470 l wciąż wolne, retry storm.
Rywalizacja jest techniczna (o wersję rekordu), nie biznesowa (o mleko); capacity marnowana;
**im większy ruch, tym gorzej działa system** — odwrotność zdrowej charakterystyki (syndrom
systemów biletowych przy koncercie gwiazdy). Rozwiązania:

1. **Sharding ilościowy** — kilka mniejszych logicznych shardów, każdy osobnym agregatem
   (własny Id, wersja, blokady). Konflikty rozpraszają się losowo; throughput rośnie niemal
   liniowo z liczbą shardów (przykład: 4 shardy → 2–3 wątki na shard, większość żądań OK za
   1–2 próbą). Koszt: jak shardować (losowo, hash, geograficznie), sumowanie dostępności
   z wielu agregatów, dodatkowa logika w fasadzie, dobór liczby shardów.
2. **Sharding biznesowy** — pula dzielona domenowo: strefy parkingu A/B/C, pula tokenów per
   klient / per plan taryfowy, magazyn / partia / lokalizacja, sektory stadionu. Naturalny,
   łatwy do wytłumaczenia biznesowi, często lepszy UX ("klient ma swoją pulę"); wada: nie
   zawsze możliwy, ryzyko nierównomiernego wykorzystania pojemności.
3. **Kolejkowanie żądań** — zamiast "wszyscy naraz": żądania do kolejki, worker obsługuje
   sekwencyjnie. Eliminuje konflikty optimistic lock i retry storms, throughput stabilny.
   Cena: większe opóźnienie jednostkowe, mniejsza równoległość, trudniejsze skalowanie
   horyzontalne. Dla bardzo gorących pul i krytycznych zasobów, gdzie przewidywalność >
   opóźnienie.

### Typ 3: zasób czasowy (TemporalResourceAvailability)

Oś czasu o ustalonej rozdzielczości (minuty, godziny, dni). Cechy odróżniające: sloty nie mogą
się nakładać; **przeszłość nie wraca**; blokada dotyczy przedziału — nie odejmujemy ilości,
tylko **wycinamy fragment osi czasu**. Kluczowa decyzja architektoniczna: granulacja agregatu.

- **Strategia A (wybrana w archetypie): slot = osobny agregat.** Logiczny zasób (sala 404,
  ResourceId) ma wiele agregatów ResourceAvailability — po jednym na slot, każdy z własnym Id
  i wersją. Blokada 9:00–9:15 nie konkuruje z 10:00; konflikt tylko przy walce o dokładnie ten
  sam slot. Model zbliżony do Individual, gdzie "egzemplarzem" jest fragment czasu. Pasuje, gdy
  przypadek biznesowy = rezerwacja konkretnego slotu (salka, lekarz, doradca kredytowy).
  Zalety: granularny optimistic locking, równoległość bez konfliktów technicznych, łatwe
  zapytania o wolne sloty. Wady: więcej rekordów (32 sloty/dzień przy 15 min), rezerwacje
  wieloslotowe (8:50–10:20) wymagają koordynacji.
- **Strategia B: cały przedział (dzień/tydzień/miesiąc/rok) = jeden agregat**, blokady wycinają
  fragmenty (z polityką np. "wielokrotności 15 minut"). Mniej rekordów, elastyczne długości
  blokad; ale **wszystkie operacje konkurują o jeden obiekt** — dwie osoby rezerwujące różne
  godziny biznesowo nie konkurują, technicznie tak → false contention jak w pulach. Niewykluczona,
  jeśli prawdopodobieństwo konfliktu znikome.

**Segmentacja czasu**: czas dla zasobów jest dyskretny (15/30 min, godzina, dzień). Przy
segmentach 15-minutowych 9:00 i 9:15 istnieją, 9:07 nie. Każde żądanie z zewnątrz podlega
**normalizacji do granic segmentów**: żądanie 9:07–10:23 → blokady 9:00–10:30. To brama
wejściowa modelu czasu — przydatna i przy definiowaniu zasobów, i przy obsłudze żądań.
Uwaga: segmentacja czasu to szczególny przypadek segmentacji — litry mleka czy kilogramy
cementu też mogą jej podlegać.

**Blokada wieloslotowa**: wymagania — wszystkie sloty albo żaden, jeden owner, rollback przy
konflikcie. Rozwiązanie: **niepersystowany obiekt koordynatora** zawierający segmenty z żądanego
przedziału, orkiestrujący lock/unlock przez delegację do poszczególnych
TemporalResourceAvailability. Nie jest podtypem ResourceAvailability (nie da się przewidzieć
jego kształtu; persystowany obiekt grupy segmentów cofnąłby nas do problemów strategii B).
Jeśli choć jeden slot zajęty → całe żądanie odrzucone.

### Typ 4: zasoby złożone (Composite / pakiety)

Jedna decyzja biznesowa dotyczy wielu zasobów naraz: pakiet "telewizor + montaż + 6 miesięcy
Netflixa" = dla klienta jeden produkt, dla systemu trzy problemy dostępności rozwiązywane
jednocześnie: egzemplarz TV (Individual), pula kodów Netflix (Pool), kalendarz montera
(Temporal) — każdy z innym modelem rywalizacji, innym lock requestem. Warunek biznesowy:
**albo wszystko, albo nic** (nie sprzedajemy TV bez montażu, nie rezerwujemy montera bez
sprzętu, nie obiecujemy Netflixa z pustej puli). Dwie strategie:

1. **Pakiet jako pełnoprawny zasób (persystowany Composite)**: własny ResourceId
   (np. PKG-TV-NETFLIX-INSTALL), własny Id i blokady, implementuje ResourceAvailability;
   komenda typu Composite = kolekcja komend do zasobów składowych. Zalety: jedno API jak każdy
   zasób, Inventory mapuje PackageInstance→ResourceId, historia rezerwacji pakietu jako całości.
   Cena: kolejny agregat, dodatkowe wersjonowanie, problemy spójności przy zmianie komponentów.
2. **Niepersystowany koordynator** (jak przy multi-slot): pakiet nie jest zasobem, nie ma
   ResourceId, powstaje na czas jednej decyzji; klient świadomie blokuje pakiet i dostaje
   **listę blokad**.

Mechanika blokad identyczna; różnica dotyczy znaczenia pakietu w domenie. Reguła:
**pakiet istnieje niezależnie od decyzji (jest produktem) → modeluj jako zasób (Composite);
pakiet powstaje tylko po to, żeby coś zarezerwować (jest koszykiem, decyzją chwilową) →
koordynator.**

## 8. Rezerwacje (L05)

Motto (Seinfeld, "The Car Reservation"): *you know how to TAKE the reservation, you just don't
know how to HOLD the reservation — and that's really the most important part*. Rezerwacja,
która nie trzyma zasobu, nie jest rezerwacją.

Krytyka klasyki: MDA definiuje rezerwację jako przypinanie instancji produktów do podmiotów
(Party) i opisuje ją jako proces, w którym dostępność weryfikuje się **query** na
InventoryEntry — naiwne założenie, że odpytanie o dostępność "załatwia sprawę"; bez odpowiedzi,
czy query jest transakcyjne z blokadą. Dla dzisiejszych systemów wielkiej skali to żaden wzór.

### Cztery cechy rezerwacji (kryteria oceny podejść)

1. realnie wpływa na dostępność (po utworzeniu zasób nie jest "wolny");
2. ma czas życia (wygasa, bywa anulowana lub zastąpiona);
3. zawsze jest czyjaś (klient, zamówienie, proces, użytkownik);
4. często dotyczy wielu zasobów naraz (jedna decyzja biznesowa → kilka blokad technicznych).

### Dwa anty-wzorce

- **Rezerwacja ukryta w statusie agregatu**: wypożyczenia sprzętu (`Loan` ze statusem
  BORROWED + deadline). Informacja jest — problem w **miejscu**: Equipment nie zarządza swoją
  dostępnością, pytania o zasób przechodzą przez wypożyczenia; "czy laptop 42 dostępny" i "kto
  go ma" = przeszukanie wszystkich Loanów; nie istnieje `equipment.isAvailable` ani
  `equipment.lock`. Konsekwencje: brak centralnego miejsca dostępności (rozproszona po
  agregatach procesu), logika blokowania w procesie (Inventory nie istnieje jako warstwa),
  model nie skaluje się poznawczo (każdy nowy proces musi uczyć się interpretacji LoanStatus).
- **Każdy proces z własną wersją rezerwacji**: szpital — lekarze, sale, sprzęt, łóżka używane
  przez wiele procesów; każdy inaczej sprawdza dostępność, rezerwuje, definiuje timeout,
  obsługuje rollback. Skutki: (1) nie da się odpowiedzieć "które zasoby są teraz zarezerwowane
  dla dr. Smitha" — inne modele (Appointment/Procedure/Surgery/Emergency), inne statusy
  (scheduled/pending/booked/assigned), inne nazwy pól (doctor/physician/surgeon); (2) iluzja
  spójności współbieżnej — jeden proces robi SELECT, inny overwrite bez sprawdzania, inny
  LOCK FOR UPDATE, inny własne transakcje wieloetapowe; lekarz zapisany równolegle na wizytę
  i procedurę, sala zarezerwowana w dwóch procesach, konflikty wykrywa personel; (3) każdy nowy
  proces (np. TelemedicineConsultation) = powtórka tej samej odpowiedzialności (duplikacja
  odpowiedzialności, nie kodu); (4) zatarte granice: procesy robią wszystko naraz — lifecycle,
  dostępność, współbieżność, blokady, timeouty.

### Fundament: rezerwacja stoi na mechanizmie dostępności

Rezerwacja to jedna z głównych przyczyn niedostępności — więc nie może być statusem w agregacie
ani logiką rozlaną po procesach; musi opierać się na mechanizmie, który faktycznie blokuje
dostępność. Model z L04 (ResourceAvailability + Blockade + LockCommand/LockRequest/
UnlockRequest; Individual/Pool/Temporal/Composite) spełnia już wszystkie "checkboxy":
blokowanie — jest; czas życia — jest; wygaszanie — jest; wycofanie — jest; powiązanie
z podmiotem — jest (OwnerId mapowalny na PartyId lub id procesu zewnętrznego; a jeśli mało —
typ **Owner** jako snapshot/migawka podmiotu z metadanymi); blokada wielu zasobów — Composite.
Mechanika współbieżności rezerwacji jest rozwiązana. Pozostaje pytanie: **gdzie ma mieszkać
model rezerwacji?** Trzy opcje:

- **Opcja A — brak modelu rezerwacji w Inventory**: procesy (HotelBooking, MedicalAppointment,
  CarRental) trzymają listy BlockadeId i same nimi zarządzają. Plusy: prostota, mniej warstw,
  Inventory czysto mechaniczne, jasny podział (rezerwacje = domena procesów). Minusy: brak
  centralnego "co zarezerwował dany aktor" (łatwe do załatania metadanymi `actionType=
  reservation` na blokadzie); konieczność trzymania list blokad, gdy produkt→zasoby to 1:N;
  **koszt kognitywny** — język "zasoby/blokady/dostępność" daleki od języka domen biznesowych.
- **Opcja B — pełna warstwa rezerwacyjna**: ReservationService interpretuje żądanie, tworzy
  LockCommand → InventoryFacade blokuje i zwraca BlockadeId; ReservationService tworzy obiekt
  Reservation z własnym statusem, cyklem życia, regułami akceptacji/anulowania, metrykami,
  polityką terminów. Problem: Inventory ma swój czas życia blokad, Reservation swój, proces
  biznesowy swój status → **trzy osie stanu** bez jednego źródła prawdy; mapowanie między nimi
  staje się regułą biznesową samą w sobie; drugi konkurencyjny cykl życia odbiera procesom
  kontrolę i pcha w stronę centralnego procesu obsługującego wszystkie przypadki brzegowe
  wszystkich poddziedzin (wąskie gardło wytwórcze — wielu interesariuszy w jednym miejscu).
- **Opcja C — rezerwacja jako published language (REKOMENDOWANA)**: Reservation przestaje być
  bytem decyzyjnym; jest cienką warstwą tłumaczącą (język opublikowany DDD) nad Inventory —
  bez własnego lifecycle, bez reguł procesów klienckich. Tłumaczy złożony język blokad na
  przystępny model rezerwacji; grupuje blokady; deleguje, utrzymując **pojedyncze źródło prawdy
  o dostępności** (np. ważność blokady nie jest duplikowana). Rezerwacja w Inventory ≠
  rezerwacja w procesie biznesowym: tam mogą być kroki autoryzacyjne, notyfikacje, opłaty —
  to nie odpowiedzialność Inventory.

Wybór nie jest dogmatem: A wystarcza w prostych systemach, gdzie model blokad nikomu nie wadzi;
B akceptowalna przy ograniczonej liczbie zespołów/procesów. Klucz: **model rezerwacji buduj NAD
warstwą Inventory** — wtedy rozwój modelu rezerwacji nie narusza inwentarza.

### Flow i przykłady (opcja C)

Łańcuch: proces biznesowy (żądanie w swoim języku) → ReserveRequest → ReservationService
(tłumaczy na LockCommand) → InventoryFacade (znajduje InventoryEntry) → InventoryEntry (zna
mapę produkt→zasoby, buduje żądania blokad) → ResourceAvailabilityFacade (LockCommand tłumaczony
polimorficznie na Temporal/Individual/Pool/CompositeLockRequest; fizyczna blokada) → odpowiedź
wraca przez warstwy. Docelowo możliwa Saga i wywołania zdalne (bezpośrednie wywołania w kursie
to uproszczenie dydaktyczne).

- **Hotel**: pobyt na kilka nocy = biznesowo jeden produkt, w Inventory kilka niezależnych
  blokad czasowych; proces nie wie, że pod spodem są 4 osobne zasoby.
- **Mleko, 50 litrów**: rezerwacja ilości z puli rozproszonej po partiach i shardach; proces
  nie wybiera shardów, nie iteruje po partiach, nie zna strategii alokacji — mówi "potrzebuję
  50 l", reszta to Inventory. Kod bliźniaczo podobny do hotelu — zmienia się tylko mapowanie
  żądania biznesowego na żądanie rezerwacyjne (produkt, ilość, właściciel, cel, specyfikacja).

Powtarzalna reguła: proces mapuje swój język na żądania rezerwacyjne; ReservationService robi
zawsze to samo; InventoryEntry zmienia zachowanie przez polimorfizm; ResourceAvailability
wykonuje fizyczną blokadę. Rezerwacja = **świadoma decyzja o czasowym wyłączeniu zasobu
z użycia**, nie magiczny status.

## 9. Listy oczekujących i polityki kolejkowania (L06)

### Problem: popyt nie znika

Hotel, konferencja: 50 pokoi, 80 chętnych. Inventory poprawnie mówi "brak" — ale popyt nie
znika, tylko **odpływa do konkurencji**; gdy dzień przed wydarzeniem ktoś anuluje, pokoje się
zwalniają, a popyt jest już gdzie indziej. To nie problem dostępności, lecz **braku mechanizmu
przechwycenia popytu w czasie niedoboru**. Bez formalnej waitlisty: polling, retry, "kto
pierwszy ten lepszy", race conditions, przypadkowa kolejność, marnowanie zasobów na bezsensowne
zapytania, biznes nie widzi realnego popytu, "kto następny?" bez odpowiedzi. Ten sam schemat:
kurs online z limitem (rezygnacje przed startem), wypożyczalnie (zasób wraca, popyt czeka),
e-commerce z limitowaną dostawą (anulacje uwalniają zasób), wsparcie (agenci zwalniają się
w czasie).

**Waitlist ≠ pre-order**: waitlista — nie wiemy, czy zasób się zwolni (gra na decyzję innych
klientów; sterowana **popytem**); pre-order — wiemy, że zasób się pojawi (gra na przyszłą
podaż; sterowany **podażą**). Ten sam mechanizm obsłuży oba.

Lekcja świadomie NIE jest o strukturach danych, algorytmach enqueue/dequeue, lock-free,
Kafce/RabbitMQ/SQS — jest o **biznesowych regułach kolejkowania**, politykach przydziału,
integracji z Inventory, granicach transakcji i trade-offach.

### Wymagania wobec waitlisty

1. rejestracja intencji oczekiwania ("jeśli zasób się pojawi, chcę być brany pod uwagę" —
   to nie rezerwacja ani obietnica, tylko zapis faktu istnienia popytu);
2. pamiętanie kolejności lub innych reguł pierwszeństwa (zgłoszenia, priorytet, ilość, segment)
   — system musi jednoznacznie odpowiedzieć "**dlaczego ten, a nie inny**";
3. deterministyczny wybór następnego według znanych zasad;
4. wpis przestaje istnieć w określonym momencie (obsłużony / rezygnacja / upłynął sensowny czas);
5. jasne granice: **nie tworzy rezerwacji, nie blokuje zasobu, nie zmienia dostępności** —
   pamięta, porządkuje i decyduje "kto następny".

Waitlista nie jest częścią rezerwacji, dostępności ani kolumną statusu — to osobny element
modelu. Inventory: jakie instancje, czy dostępny, czy zarezerwowany i przez kogo. Waitlista:
**kto ma pierwszeństwo, gdy zasób się pojawi.** Nie przechowuje zasobu (pokoju, rzutnika, partii
mleka) — przechowuje **intencje**: kto czeka, na co, od kiedy, z jakim priorytetem.

### Model: WaitListEntry + WaitList + polityka

- **WaitListEntry** — fakt domenowy, nie proces/rezerwacja/zasób. Przechowuje **generyczny
  payload** (nie LockRequest/ReservationRequest/OrderRequest — to wiązałoby mechanizm z jedną
  domeną; reguły kolejkowania są zaskakująco podobne między domenami). Payload jest aktywnie
  używany — na jego podstawie zapadają decyzje biznesowe, a type safety chroni tam, gdzie błędy
  są najdroższe. Jawny `addedAt` (czas oczekiwania to część semantyki), `priority` (istnieje
  nawet nieużywany — to decyzja biznesowa, nie optymalizacja), implementuje Comparable
  (porównywanie na potrzeby polityk).
- **WaitList** — reprezentuje **reguły gry**, nie klientów: identyfikator (każdy przypadek
  użycia może wymagać indywidualnego podejścia), **pojemność** (pojemność to komunikat: pełna
  lista 100 wpisów = sygnał dla biznesu, że popyt >> podaż, i jasna informacja dla użytkownika
  o realnych szansach; dodawanie kontrolowane), zbiór wpisów (kolejka jako nośnik stanu),
  operacja usunięcia (rezygnacja), oraz **polityka wyboru** — lista sama nie wybiera, deleguje
  do polityki (wzorzec strategii), bo reguła "kto następny" zmienia się między domenami
  i w czasie. Wybór może wymagać **SelectionContext** (aktualna wiedza o kontekście: np. mamy
  300 l, pierwszy czeka na 500, drugi na 200 → przepuszczamy drugiego); bez kontekstu wystarczy
  `poll`.
- **Kontrakt polityki**: operuje bezpośrednio na kolejce (nie kopia/strumień — może iterować,
  filtrować, modyfikować; jest integralną częścią WaitList); decyzja zapada w kontekście "tu
  i teraz" (czas, dostępność, reguły); polityka **nie tworzy wpisów** — wskazuje istniejący.

### Polityki (każda narzuca wymagania na implementację kolejki)

| Polityka | Reguła | Implementacja kolejki | Przykład |
|---|---|---|---|
| **FIFO** | kto pierwszy przyszedł; zero logiki, payload ignorowany | LinkedList / kolejka zachowująca kolejność wstawiania; `poll` zwraca najstarszy | rzutnik 4K: 3 żądania w kolejce, anulacja rezerwacji → wyjmujemy po kolei aż pusto |
| **Priority** | VIP przed standardem, płatni przed darmowymi, urgent przed normal | PriorityQueue + Comparable na WaitListEntry | sala konferencyjna: VIP1, VIP2, potem standard |
| **Criteria-based** | nadaje się ten, kogo DA SIĘ obsłużyć teraz (ilość, zakres czasowy, kompatybilność) | nie `poll`, tylko iteracja po całej kolejce z predykatem z SelectionContext; kolejka musi zachować kolejność i pozwalać na bezpieczne usuwanie w trakcie iteracji | żądania 500/200/100 l, dostępne 300 l → wybieramy 200 l (pierwsze mieszczące się w limicie) |
| **Quota-based** | sprawiedliwość ≠ równość: gwarantowany dostęp dla grup/segmentów wg klucza | kwoty per segment | 30% miejsc parkingowych dla aut elektrycznych, 70% dla pozostałych |

Wspólne: każda polityka czyta payload; **żadna nie zna Inventory ani procesów**. Waitlista =
mechanizm decyzyjny, polityka = reguła, kolejka = nośnik stanu.

### Integracja z dostępnością: dwa warianty spójności

1. **Spójność transakcyjna** — waitlista jest częścią agregatu ResourceAvailability; "kto
   następny" zapada **w tej samej transakcji** co zwolnienie zasobu (załaduj RA → usuń blokadę
   → wybierz z waitlisty → utwórz nową blokadę → zapisz). Gdy koszt utraty spójności zbyt
   wysoki: systemy finansowe, krytyczne zasoby medyczne, premium parking z klientem przy
   bramce; koszty finansowe, operacyjne i wizerunkowe. Cena: każdy wpis na listę blokuje też
   obiekt, do którego lista jest przypięta → przy dużym ruchu spada dostępność systemu.
2. **Spójność końcowa** — ResourceAvailability tylko zarządza blokadami; waitlista żyje osobno,
   integracja przez zdarzenia (dostępność emituje event, waitlista reaguje). Zmienia się
   **czas**: między zwolnieniem a ponownym przypisaniem istnieje okno (ms–minuty), w którym
   wątek z zewnątrz może wejść i złamać regułę pierwszeństwa. Świadomy trade-off: łatwiejsza
   implementacja, niezależne moduły, większość biznesów i tak działa w trybie eventual
   consistency, a niespójności rozstrzyga się operacyjnie, np. rabatem.

Oba warianty dotyczą tak dostępności, jak i rezerwacji. Kryterium wyboru: klasyfikacja reguł
między zasobami/rezerwacjami a waitlistą — natychmiastowo spójne → poszerz granice transakcji;
inaczej → rozdziel.

### Skala: od in-memory do db-backed

Model in-memory (kolejka + polityki) jest **poprawny** — problem zaczyna się przy skali
(e-commerce, waitlista 10 000 wpisów × kilkaset bajtów payloadu):

- **pamięć i czas**: load = deserializacja tysięcy obiektów i odbudowa kolejki, z której
  użyjemy jednego wpisu; przy stu listach system "sapie";
- **współbieżność**: dwa wątki ładują listę, dodają, zapisują całość → jeden wpis znika bez
  śladu ("najstarszy błąd świata systemów transakcyjnych"); wersjonowanie = lawina retry;
- **polityki**: criteria-based po 10k wpisów to koszt widoczny w metrykach.

Decyzja architektoniczna: waitlista jako niepodzielna struktura czy **zbiór faktów domenowych**?
Jeśli każdy wpis to osobny byt: tabela WaitList lekka (id, pojemność, typ polityki — szybki
load, rzadkie zmiany) + tabela WaitListEntry (payload, kolejność, priorytet, czas) ładowana
selektywnie. Dodanie = INSERT; pobranie następnego = SELECT ... ORDER BY ... LIMIT; usunięcie
= DELETE. Kluczowy mechanizm: blokada wiersza z pominięciem zablokowanych (SELECT ... FOR UPDATE
SKIP LOCKED) — wątek A blokuje pierwszy wpis, wątek B go omija i bierze następny; brak wyścigów
i duplikacji; **kolejkowanie na poziomie bazy, nie w JVM**. Polityki FIFO/priority mapują się
na ORDER BY; criteria-based → zamiast dowolnego predykatu **jawne zapytania domenowe**
tłumaczone przez repozytorium na WHERE (kompromis: mniejsza elastyczność, większa
przewidywalność, użycie indeksu — świadoma decyzja, nie ograniczenie technologii).
Najważniejsze: **klient nie wie, jak waitlista jest zaimplementowana** — ten sam interfejs,
inna strategia pod spodem; start z modelem dokumentowym in-memory, przejście na osobne
kolekcje bez refaktoryzacji procesów.

Wniosek lekcji: **waitlista to nie struktura danych, tylko decyzja biznesowa zapisana
w modelu**; sposób przechowywania i integracji to świadomy trade-off spójność/skala/złożoność.

## 10. Archetyp przy wysokiej złożoności (L07) — Inventory + Accounting

### Granica archetypu

W systemie widnieje "produkt X: 630 dostępnych jednostek" — finanse pytają: **skąd dokładnie
wzięło się 630?** Między 1000 szt. miesiąc temu a 630 dziś: setki rezerwacji→wysyłek,
dziesiątki zwrotów, transfer do innego magazynu, kilkanaście sztuk uszkodzonych w transporcie,
korekty po inwentaryzacji, ręczne interwencje. Model oparty na mutowalnym stanie widzi tylko
wynik końcowy — `totalCapacity` nadpisywane wielokrotnie, poprzednie wartości **zastąpione**,
nie zarchiwizowane. System pamięta *ile jest*, nie pamięta *dlaczego tyle jest*.

- **Audit log nie wystarcza**: dodatkowy kod w każdym miejscu mutacji, brak gwarancji
  kompletności (ktoś zapomni), logi żyją obok modelu domenowego, odtworzenie obrazu = ręczne
  puzzle z wielu źródeł. Zapis techniczny ≠ odpowiedź na pytanie biznesowe.
- **Brak rekoncyliacji**: w księgowości uzgadnianie = policzyć z dwóch stron i porównać.
  W klasycznym Inventory jest tylko liczba 630 — bez listy operacji, z których wynika, bez
  możliwości przeliczenia od zera, bez punktu odniesienia. Ręczna edycja bazy, błąd algorytmu,
  podwójne dodanie — niewykrywalne. **System, który może się mylić i nie potrafi tego
  sprawdzić**, to stan bardzo niebezpieczny.
- **Brak wymiaru wartości**: 630 szt. × 25 EUR = 15 750 EUR w bilansie, raportowane do
  księgowości, weryfikowalne w audycie — Inventory operuje na ilościach, nie zna wartości,
  kosztu, przepływu ekonomicznego. Nie błąd projektu — nie po to powstało.

Inventory doskonale odpowiada "co jest dostępne teraz"; nie odpowiada: jak do tego doszliśmy,
czy liczba jest poprawna, ile to warte, kto i kiedy zmienił. To **granica archetypu**, nie luka
implementacyjna. Potrzebny model operujący na **historii**, który nie nadpisuje, tylko sumuje,
i potrafi sam siebie sprawdzić: **Accounting**.

### Dlaczego rozbudowa jest możliwa

Bo od początku Inventory nie było jednym bytem, tylko zbiorem rozdzielonych pytań:
InventoryEntry (co istnieje), ResourceAvailability (czy dostępne tu i teraz), Reservation
(dla kogo i po co chwilowo wyjęte z puli), WaitList (kto czeka). Inne reguły, niezmienniki,
obciążenia, tempo zmian — np. wymaganie "dostępność ×100 requestów" nie oznacza "skalujemy
wszystko" jak w monolicie: katalog instancji skaluje się wolno, dostępność agresywnie,
rezerwacje umiarkowanie. **Inventory to tak naprawdę zbiór mniejszych archetypów.**

### Integracja z Accounting

Przypomnienie pojęć: **Account** (gdzie jest wartość; np. Warehouse:Central,
Customer:123:Reserved), **Transaction** (grupa logicznie powiązanych operacji: przyjęcie,
rezerwacja, zwrot), **Entry** (atomowy wpis: credit/debit), **Balance** (suma wszystkiego, co
zaszło na koncie), **reguła podwójnego księgowania** (suma wpisów na kontach bilansowych
w transakcji = 0 → minimalizacja wycieków wartości).

Kierunek zależności: potrzeba śledzenia przepływu wartości to oczekiwanie względem Inventory,
więc **Accounting jest dostawcą (upstream)** — może istnieć bez Inventory, obsługuje wielu
klientów, definiuje standard zapisu historii; Inventory korzysta z API i deleguje historię.
Mechanika: zmiany zaobserwowane przez Accounting (dostawa, wysyłka) rozgłaszane eventami →
Inventory aktualizuje stan/dostępność; zmiany ze źródłem w Inventory → komendy do Accounting.

Przykład pełnego przepływu (kubki ceramiczne): przyjęcie 1000 szt. = transakcja
dostawca→magazyn; rezerwacja 300 szt. = konto główne→konto rezerwacji klienta; wydanie =
→konto dostaw klienta; zwrot 50 szt. = konto dostaw→konto zwrotów; może wrócą do puli
dostępnej; 20 zepsutych — też odnotowane. **Wartość się przemieszcza, nic nie ginie, pełna
historia**; dostępność interesuje tylko balans konta głównego.

### Zyski

1. **Rekoncyliacja**: druga, niezależna perspektywa — saldo konta nie jest "inną liczbą", lecz
   liczbą *wynikającą z sumy operacji*; rozjazd = natychmiastowy sygnał (ręczne grzebanie
   w bazie, bug ×2, zgubiony update w race condition, błąd integracji).
2. **Audytowalność w modelu, nie w dodatkach** — zapytanie zwraca pełną historię transakcji.
3. **Wartość finansowa** — wpisy wzbogacone metadanymi + posting rules z cenami → raport
   wartości magazynu przestaje być ręczną robotą.
4. **Analityka** — "ile średnio rezerwujemy dziennie" często bez ClickHouse i pipeline'ów,
   z historii księgowej.

### Koszt i kryteria

Wchodzimy w integrację, gdy: duża skala; zasoby o realnej wartości (drogi towar, medycyna,
przemysł); audyt/compliance to wymóg; rekoncyliacja ma być codziennością, nie akcją ratunkową;
historia ma wartość (spory, reklamacje, trendy); system ma służyć do obrony, także prawnej.
Zostajemy przy czystym Inventory, gdy: zasób tani/niskiego ryzyka, liczy się tylko "teraz",
MVP, nikt nie audytuje, koszt złożoności > koszt błędów. Accounting dodaje: osobny model
i repozytoria, transakcje/wpisy/konta, integrację, dodatkowy punkt prawdy do utrzymania.
Daje: uzgadnianie, wbudowany audyt, raportowanie finansowe, niezmienniki matematyczne,
odtwarzalną historię. **Uczciwa umowa: kupujesz zaufanie, płacisz złożonością.**

### Dwa źródła prawdy i awarie częściowe

Gdy oba światy mówią to samo (Inventory 630 / saldo 630), problem ujawnia się przy awarii:

- **Blokada zapisana w Inventory, komenda do Accounting nie dotarła**: klient ma rezerwację,
  Inventory widzi 100 szt. zablokowanych, księgowy widzi 630, fizycznie 530 — "gdzie jest 100?"
- **Dostawa zaksięgowana (730), Inventory crashuje przed zapisem (630)**: towar fizycznie jest,
  Accounting go widzi, Inventory nie → klient dostaje "brak dostępności" = realne straty.
- **Anulacja + timeout**: Inventory robi unlock 50, wysyła komendę, timeout; Accounting
  wykonał, Inventory nie wie. Dylemat rozproszony: retry → ryzyko podwójnego unlocka; brak
  retry → trwała rozbieżność.

**Rozwiązanie 1: Inventory źródłem prawdy** ("magazyn wie, co ma na półkach"), Accounting
synchronizowany dla audytu asynchronicznymi komendami przez **wzorzec Outbox**: zmiana stanu
Inventory i zapis intencji wysyłki w **tej samej bazie i transakcji** (nie istnieje scenariusz
"Inventory zapisane, Outbox nie"; rollback obejmuje wszystko); użytkownik dostaje odpowiedź
w ~10 ms; osobny proces (poller albo CDC) przegląda Outbox i wysyła — retry w nieskończoność,
user request nieblokowany, dostawa gwarantowana; skoro możliwe duplikaty, **odbiorca
(Accounting) musi być idempotentny**. Outbox + idempotentność rozwiązują gros problemów.

**Rozwiązanie 2: Accounting źródłem prawdy.** Niewygodne pytanie: jakie operacje przechodzą
przez Inventory? Z początku lock/unlock/add resource, ale dochodzą przyjęcia, zwroty,
uszkodzenia, transfery międzymagazynowe, produkcja — każda zmienia stan Inventory i generuje
komendę do Accounting. Inventory staje się centralnym punktem spinającym wszystkie procesy
i wspólnym punktem integracji wszystkich zespołów (zmiana w Returns/Production dotyka
Inventory; zmiana API Inventory dotyka wszystkich) — problem organizacyjny, nie tylko
techniczny. Moment zwrotny: procesy transferujące wartość łączą się **bezpośrednio
z Accounting**; wszystkie operacje są transakcjami księgowymi; **Inventory przestaje być
decydentem, staje się projekcją stanu** (odbudowywaną eventowo albo proxy). Blokady tłumaczone
od razu na komendy i wysyłane Outboxem do Accounting. Efekt: każdy moduł zna jedno API
(Accounting), Inventory nie musi wiedzieć "dlaczego", zespoły luźno zależne, audit trail
wbudowany.

**Wybór**: mała skala / mało operacji magazynowych → źródło prawdy w Inventory + synchronizacja.
Wartość przepływa dynamicznie i różnorodnie → Accounting jako źródło prawdy.

## 11. Miejsce w architekturze systemu i organizacji (L08)

### Inventory = zbiór capabilities, nie monolit

"Inventory" to skrót myślowy na co najmniej cztery odrębne zdolności: **InventoryEntry**
(katalog tego, co istnieje), **Availability** (czy dostępne tu i teraz), **Reservation**
(czasowe wyjęcie z puli; nakładka na dostępność), **WaitList** (obsługa popytu w niedoborze).
Nie trzeba mieć wszystkich naraz:

- Entry bez liczenia dostępności — gdy wystarcza informacja na poziomie instancji; dla
  produktów jednoznacznie identyfikowalnych model instancji+blokad może w pełni zastąpić
  klasyczną dostępność.
- Availability bez instancji produktów — jedna nierozróżnialna pula; modele slotowe (wynajem
  bagażników, miejsc parkingowych), gdzie pojęcie produktu nic nie wnosi.
- Sama WaitList — kolejkowanie ticketów, leadów, zgłoszeń: intencje, priorytety, "kto
  następny"; bez Inventory i Availability.
- Reservation bez formalnej dostępności — soft-lock w procesie: rezerwacja **prawa do
  działania** (wniosek, edycja, kontekst) bez policzalnej puli jednostek.

### Pozycja względem innych archetypów

Inventory jest wyjątkowe: w odróżnieniu od Party i Accounting **nie dąży do bycia jednym
upstreamowym punktem odniesienia** — dotyka fizycznego świata opisywanego przez różne procesy
(sprzedaż, logistyka, produkcja, serwis, wsparcie, planowanie). Nie rządzi nimi; wspiera je
w zarządzaniu niedoborem, rywalizacją i dostępem. Odpowiada na: jakie instancje danego typu
mamy; ile; jakie zasoby są powiązane z instancją; czy zasób dostępny; czy istnieje rezerwacja;
kto czeka i kto następny.

| Archetyp | Relacja | Treść relacji |
|---|---|---|
| **Ordering** (i każdy proces rezerwująco-zamówieniowy) | klient / downstream wobec Inventory | musi wiedzieć, czy dostępne / czy zarezerwować / czy wpisać na waitlistę; NIE powinien znać sposobu liczenia dostępności, implementować locków ani decydować "kto następny"; deleguje niedobór, skupia się na cyklu życia zamówień — zespół Orderingu nie musi być ekspertem od współbieżności. Analogicznie: sprzedaż biletów lotniczych, blokada skrytki paczkomatowej dla odbiorcy |
| **Product** | Inventory downstream | definicje produktów/paczek żyją w Product; instancje rejestrowane w inwentarzu weryfikowane względem definicji (projekcja InventoryProduct, synchronizacja eventowa) |
| **Party** | Inventory downstream (semantycznie) | Inventory nie zarządza tożsamością ani rolami, ale rezerwacja/wpis/blokada zawsze są czyjeś — PartyId lub snapshot klienta z momentu utworzenia; relacja używana też do autoryzacji operacji (lock, rezerwacja, waitlista, definiowanie instancji); dyskusje o OAuth/JWT/Kerberos nie kasują logicznej zależności od modelu Party |
| **Accounting** | Inventory downstream | prosty system: Inventory liczy dostępność, Accounting księguje skutki; duża skala i wiele źródeł przepływów: Accounting jest źródłem prawdy, Inventory projekcją transakcji księgowych |

### Serwis, biblioteka czy fork

Inventory to **obszar decyzji**, nie moduł:

- **Osobna usługa domenowa** (z własnym zespołem, backlogiem, odpowiedzialnością) — gdy
  Inventory jest realnym polem walki: wiele procesów konkuruje o te same zasoby, niedobór to
  codzienność, błędny przydział ma konsekwencje finansowe/operacyjne/wizerunkowe, zasoby mają
  różne formy. Wtedy Inventory pełni rolę strumienia dostarczania wartości. Nawet wtedy rzadko
  jest jednorodne — Availability/Reservation/WaitList mają inne wymagania niefunkcjonalne,
  dynamikę zmian i ryzyka; w większych organizacjach kilka zespołów opiekuje się fragmentami.
- **Biblioteka** — dla PEŁNEGO Inventory zwykle zły pomysł (model stanowy, trwałość, audyt,
  wersjonowanie; współdzielona biblioteka = niejasne właścicielstwo, trudne aktualizacje, brak
  niezależności wdrożeniowej). ALE nie wszystkie zdolności są równie problematyczne:
  **waitlista** (prosty model danych, niska zmienność, uniwersalna semantyka) świetnie nadaje
  się na bibliotekę narzędziową — używaną niezależnie od Inventory i zasobów fizycznych.
  Podobnie proste modele dostępności dla współbieżnych zasobów logicznych — zespoły często
  implementują własne locki procesowe, nie widząc, że to problem już rozwiązany w Availability.
  Inventory to jeden z nielicznych archetypów naturalnie **rozszczepiających się** na elementy
  biblioteczne i stricte domenowe.
- **Fork archetypu** — najczęstszy w praktyce. Fork ≠ kopiuj kod i trać kontrolę; fork =
  świadome uznanie, że różne domeny mają różne znaczenie zasobu, a ujednolicanie prowadzi do
  nadmiernej złożoności (zasób w magazynie ≠ zasób w hotelu; slot lekarza ≠ paleta towaru;
  mieszanie kończy się flagami domenowymi, warunkami "jeśli hotel, to..." i modelem, którego
  nikt nie rozumie). Fork zachowuje wspólny język pojęć (Availability, Reservation, WaitList),
  daje każdej domenie własną semantykę, reguły i kompromisy; zespoły rozwijają swoje Inventory
  bez czekania na centralny backlog. W Party/Accounting fork zwykle oznacza problemy —
  **w Inventory fork często oznacza dojrzałość architektoniczną.**

Najlepsze architektury łączą opcje: Accounting centralny serwis i źródło prawdy; Party
upstreamowy moduł/usługa; Inventory w kilku wariantach — waitlista jako biblioteka, lokalne
modele w kontekstach, osobna usługa tam, gdzie konkurencja o zasoby jest realnym problemem.
Pytanie "serwis czy biblioteka?" jest źle postawione — właściwe brzmi: **które zdolności
Inventory muszą być wspólne, a które mogą zostać lokalne?** Inventory nie odpowiada tylko
"czy zasób jest dostępny" — odpowiada, **jak organizacja radzi sobie z niedoborem, konkurencją
i odpowiedzialnością**.

## 12. Cztery perspektywy (L09)

Kiedy Inventory jest właściwym archetypem: **gdy w systemie pojawiają się ograniczone zasoby,
o które konkuruje więcej niż jeden aktor, a nie wszyscy mogą zostać obsłużeni jednocześnie** —
czyli częściej, niż się wydaje. Rzadko usłyszysz słowa "Inventory/magazyn/dostępność"; słowa
mosty: limit, pojemność, termin, pakiet, blokada, wyścig (pełna lista triggerów w §4).

- **Analityk**: Inventory to mapa niedoboru. Bez niego modele poszatkowane (tu dostępność
  pokoju, tam status parkingu, gdzie indziej limit zapytań — każde z własnymi polami
  i znaczeniami) = semantyczny chaos. Z Inventory jeden język: zasób, dostępność, blokada,
  czas życia, popyt; "wolny" przestaje wymagać zgadywania — to zasób bez aktywnej blokady;
  koniec doklejania pól do zgniłych modeli; rozwiązania stają się programowalne.
- **Programista**: bez Inventory ciągła walka z duplikacją — sprawdzanie dostępności
  implementowane w rezerwacjach, sprzedaży, obsłudze ręcznej, batchach, za każdym razem trochę
  inaczej; często problem niedostrzegany i przerzucany na coraz szersze transakcje bazodanowe
  albo asynchroniczne procesy rekoncyliacyjne. Z Inventory: współbieżność rozwiązana raz
  a dobrze, automatyczne wygaszanie blokad, jawna kolejność obsługi popytu; kod przestaje być
  zbiorem if-ów, a staje się modelem świata, który naprawdę istnieje.
- **Architekt**: bez Inventory każdy proces ma własną prawdę o dostępności, integracje kruche,
  spójność złudna, większość czasu idzie na modelowanie integracji wspierających rekoncyliację.
  Z Inventory dostępność ma jedno źródło; procesy jej nie implementują same; Inventory staje
  się **upstreamem semantycznym** — nie steruje procesami, ale narzuca język, w którym muszą
  się wypowiadać.
- **Biznes**: Inventory to nie moduł techniczny, lecz zdolność organizacji do unikania
  konfliktów, przechwytywania popytu, priorytetyzacji klientów i decydowania na podstawie
  realnych ograniczeń. Bez niego tracisz klientów w ciszy, o problemach dowiadujesz się po
  fakcie, reagujesz zamiast decydować. Z nim: wiesz, gdzie niedobór; widzisz, kto czeka;
  działasz zanim problem eskaluje; zespoły mają zaopiekowane powtarzalne problemy i mniejsze
  obciążenie kognitywne — skupiają się na tym, co zarabia. Biznes zaczyna widzieć siebie jako
  część **gospodarki niedoboru** — fundament każdej architektury zarządzającej zasobami.

## 13. Typowe błędne implementacje i ich konsekwencje

| Błędna implementacja | Opis | Konsekwencje |
|---|---|---|
| **Flaga czasowa zamiast zasobów** | "dzień roboczy i przed 16:00 → szybka decyzja" | ignoruje realne wyczerpanie slotów w ciągu dnia (urlopy, zajęci analitycy); brak odpowiedzi na "co z nr 201" i "zwolniło się miejsce" |
| **Zgadywanie regresją / trendami** | liczba wniosków z bazy + trend → "strzelamy, czy się uda" | prognoza zamiast zarządzania zasobem; brak determinizmu, brak kolejki, brak gwarancji |
| **Modelowanie dosłowne** | obiekt Analityk/Container z metodą `wykorzystaj`/`allocate` i if-ami; serwis wizyt integrujący serwisy kalendarzy i sprzętu | wiele specjalizowanych modeli tego samego problemu w jednym biznesie; każda konfiguracja = nowe if-y |
| **Dostępność jako pola/liczniki** | `used`/`total`, SQL-e, zliczanie instancji, licznik w read-modelu | odpowiada na pytania, ale silnie sprzężone z modelem branżowym/produktowym; ten sam problem rozwiązywany wielokrotnie; brak reużycia |
| **Dostępność składana z wielu miejsc** | odpytywanie modułów po kolei (cennik, awarie, rezerwacje...) | prawda o pierwszej odpowiedzi zmienia się zanim przyjdzie druga; niespójność; wyścig o zasoby techniczny i biznesowy; każdy przypadek integrowany inaczej |
| **Rezerwacja jako status agregatu** | Order PENDING/CONFIRMED/CANCELLED "oznacza" rezerwację; Loan BORROWED | brak centralnego miejsca wiedzy "co zarezerwowane i przez kogo"; logika blokowania rozproszona; pytania o zasób = przeszukanie cudzych agregatów; zmiana jednego procesu wymusza zmiany w innych; cykliczne zależności → rozproszony monolit |
| **Rezerwacje zaszyte w kodzie procesów** | każdy proces sam sprawdza, blokuje, zwalnia (szpital: SELECT vs overwrite vs LOCK FOR UPDATE vs własne transakcje) | różne definicje rezerwacji, brak źródła prawdy, iluzoryczna spójność współbieżna (podwójne zapisy lekarza/sali), konflikty wykrywane przez personel, każdy nowy proces powtarza odpowiedzialność |
| **Jedna pula / jeden dzień jako jeden agregat przy dużym ruchu** | cała pula lub cała oś czasu w jednym agregacie | **false contention**: rywalizacja o wersję rekordu zamiast o zasób; 1 sukces + retry storm przy wolnej pojemności; im większy ruch, tym gorzej |
| **Instancje wszystkiego w Product Catalog** | katalog SSOT dla instancji wszystkich procesów | SPOF o najwyższym SLA, mieszanie porządku definicyjnego z operacyjnym; orkiestracja komendowa robi z katalogu centralnego orkiestratora i wąskie gardło organizacyjne |
| **Cały Product w InventoryEntry / samo productId** | sprzężenie runtime z modułem Product albo cienki klient cudzej logiki | efekt domina, testy budujące pół systemu, brak autonomii / każda decyzja = zdalne wywołanie |
| **Waitlista jako tabela z timestampem** | osobna tabela, sort po czasie, obsługa w kodzie procesu, bez integracji z dostępnością/rezerwacjami | wyścigi, przypadkowa kolejność, brak gwarancji pierwszeństwa, decyzja "kto dostaje" w kodzie procesu, reklamacje, ręczne interwencje, brak formalnego opisu zasad |
| **Shared Kernel produktów** | wspólne klasy/biblioteki między kontekstami | krótkoterminowo działa; długoterminowo blokada zmian, sprzężenie zespołów, kod, którego nikt nie rusza |
| **Load-modify-store całej waitlisty** | deserializacja tysięcy wpisów, zapis całości | ginące wpisy przy współbieżności, lawiny retry przy wersjonowaniu, koszty pamięci/czasu |
| **Audit log jako historia** | logowanie zmian "obok" modelu | niekompletność, oderwanie od domeny, brak rekoncyliacji i wymiaru wartości (patrz §10) |
| **"Inventory bez Inventory"** | statusy, flagi isAvailable, ręczne sprawdzanie czasu, retry, race conditions w kodzie | rozpoznawczy symptom: system implementuje archetyp nieświadomie i źle |

## 14. Mapowanie: pojęcie domenowe → element archetypu

| Pojęcie domenowe / sformułowanie | Element archetypu |
|---|---|
| typ produktu, definicja ("czym to jest") | ProductType (archetyp Product) |
| oferta, "jak to sprzedajemy" | CatalogEntry (archetyp Product) |
| konkretny egzemplarz, numer seryjny | ProductInstance |
| paleta, opakowanie zbiorcze | PackageInstance (quantity = liczba paczek) |
| "ile mamy produktu X" | InventoryEntry + suma quantity instancji |
| projekcja produktu w inwentarzu (tożsamość, nazwa, strategia śledzenia, jednostka) | InventoryProduct |
| ilość + jednostka (szt., l, kg, h) | Quantity |
| "ile czarnych / z batcha / powyżej progu" | InstanceCriteria (filtr zliczania) |
| pokój 301, miejsce A15, komora nr 5, skrytka | zasób indywidualny → IndividualResourceAvailability |
| pula mleka, miejsca parkingowe, tokeny API, limit dzienny decyzji | pula → PoolResourceAvailability (+ sharding ilościowy/biznesowy lub kolejkowanie) |
| slot 14:00–14:30, termin, grafik, kalendarz | TemporalResourceAvailability + segmentacja i normalizacja czasu |
| pakiet TV+montaż+Netflix; "wszystko albo nic" | Composite ResourceAvailability (pakiet-produkt) lub koordynator (pakiet-koszyk) |
| rezerwacja wielu slotów pod rząd | niepersystowany koordynator segmentów |
| "zajęte", "zablokowane do..." | Blockade (id, aktor, moment utworzenia, czas obowiązywania) |
| "zablokuj / zwolnij" | LockCommand / LockRequest / UnlockRequest (per typ zasobu) |
| właściciel rezerwacji / blokady | OwnerId (mapowalny na PartyId / id procesu) lub snapshot Owner |
| "zarezerwuj pobyt / 50 litrów" | Reservation jako published language → ReservationService → InventoryFacade |
| lista oczekujących, "pan jest następny" | WaitList + WaitListEntry |
| intencja oczekiwania ("chcę, gdy się pojawi") | WaitListEntry (payload, addedAt, priority) |
| "VIP pierwszy", "najpierw kto się zmieści", "30% dla elektryków" | polityki: FIFO / Priority / Criteria-based / Quota-based |
| "pełna lista = popyt przewyższa podaż" | capacity waitlisty jako komunikat biznesowy |
| pre-order ("będzie dostawa") | ten sam mechanizm waitlisty, sterowany podażą |
| "skąd wzięło się 630", "ile to warte", audyt | integracja z Accounting (Account/Transaction/Entry/Balance, podwójne księgowanie) |
| konta Warehouse:Central, Customer:123:Reserved | Account (Accounting) |
| gwarancja dostarczenia komendy między modułami | wzorzec Outbox + idempotentny odbiorca |
| system zamówień, sprzedaż biletów, wysyłka do paczkomatu | archetyp Ordering i inne procesy — klienci Inventory |
| zamienniki przy braku towaru | Ordering (poza Inventory) |

## 15. Pytania do biznesu przy odkrywaniu archetypu

**Identyfikacja zasobów:**
- Co tak naprawdę Was ogranicza, gdy chcecie sprzedać/obsłużyć więcej? (produkt? ludzie? czas?
  sprzęt? pieniądze? przepustowość?)
- Czy w samym produkcie jest wyścig ("kto pierwszy, ten lepszy"), czy wyścig jest gdzie indziej
  (kalendarze, konsultanci, sieć)?
- Co jest zasobem naprawdę: urządzenie, osoba, czy przecięcie (slot w kalendarzu osoby z
  dostępem do urządzenia)?
- Ile kosztuje utrzymanie zasobu, także gdy stoi bezczynnie? Ile instancji potrzebujecie przy
  obecnym popycie, a co przy jego zmianie?

**Śledzenie i zliczanie:**
- Czy egzemplarze trzeba śledzić indywidualnie (numer seryjny), partiami (seria, data
  ważności), czy wcale (miary ciągłe)? Czy bywa miks (serial + partia)?
- W jakich jednostkach mierzycie? Po czym chcecie filtrować (cechy, partia, lokalizacja, stan)?
- Gdzie fizycznie/logicznie znajduje się zasób i czy lokalizacja ogranicza użycie (brak
  wysyłki, usługa tylko w wybranych punktach)?

**Dostępność:**
- Co wszystko musi być spełnione, żeby zasób dało się użyć TERAZ? (sprawność techniczna,
  cennik, umowa, sprzątanie, przegląd, uprawnienia, overbooking policy, safety stock,
  kwarantanna?)
- Czy zasób może być fizycznie wolny, a mimo to niedostępny? Z jakich powodów?
- Jakie są konsekwencje chwilowej niespójności odpowiedzi o dostępności? Czy wyścig o zasób
  boli biznesowo (podwójna rezerwacja), czy da się go tanio naprawić operacyjnie?
- Czy pytacie o dostępność "teraz", czy także "w określonym momencie / przedziale"?
- Jaka jest naturalna rozdzielczość czasu (15 min? godzina? dzień?) i czy żądania spoza siatki
  normalizujemy?
- Czy zdarzają się decyzje "wszystko albo nic" obejmujące wiele zasobów (pakiety, zestawy)?
  Czy pakiet istnieje jako produkt, czy powstaje tylko na czas decyzji?

**Rezerwacje:**
- Jak długo rezerwacja żyje? Co się dzieje, gdy wygaśnie / zostanie anulowana? Kiedy zasób
  wraca do puli?
- Czyja jest rezerwacja (klient, zamówienie, proces)? Czy potrzebny snapshot danych podmiotu?
- Czy rezerwacja dotyczy konkretnej instancji, ilości z puli, czy kombinacji zasobów?
- Kto dziś "wie", co jest zarezerwowane? Czy da się odpowiedzieć jednym zapytaniem "co jest
  zarezerwowane dla X"?

**Niedobór i kolejki:**
- Co robicie, gdy chętnych jest więcej niż zasobów? Gdzie dziś ucieka ten popyt?
- Gdy zasób się zwalnia — kto powinien go dostać i dlaczego ten, a nie inny? (kolejność
  zgłoszeń? VIP? kto się zmieści? kwoty dla segmentów?)
- Czy "pierwszy z listy dostaje natychmiast i deterministycznie", czy wystarczy powiadomienie
  i okno czasowe? (→ spójność transakcyjna vs końcowa)
- Czy wejście na listę jest świadome, czy automatyczne po nieudanej rezerwacji?
- Kiedy wpis z listy znika (obsłużony, rezygnacja, timeout)? Jak duża może być lista i co
  oznacza jej zapełnienie?
- Czy to waitlista (nie wiemy, czy zasób się zwolni), czy pre-order (wiemy, że się pojawi)?

**Skala, historia, organizacja:**
- Czy ktoś zapyta "skąd się wzięła ta liczba"? Czy potrzebna rekoncyliacja, audyt, compliance,
  wycena zasobów? (→ integracja z Accounting)
- Czy wartość przepływa z wielu źródeł (przyjęcia, zwroty, uszkodzenia, transfery, produkcja)?
  (→ kto jest źródłem prawdy: Inventory czy Accounting?)
- Ile zespołów/procesów konkuruje o te same zasoby? Czy niedobór to norma czy wyjątek?
  (→ serwis z własnym zespołem vs lokalne modele vs fork; waitlista jako biblioteka?)
- Które zdolności (Entry / Availability / Reservation / WaitList) są w ogóle potrzebne i które
  muszą być wspólne, a które mogą zostać lokalne?

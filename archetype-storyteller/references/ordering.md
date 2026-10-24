# Ordering — zamówienie jako zlecenie realizacji

Materiał referencyjny opracowany na podstawie modułu M09 szkolenia o archetypach
(lekcje L01–L09 + scenki otwierająca i zamykająca).

---

## 1. Esencja archetypu

Ordering to **mechanizm orkiestracji intencji**: warstwa, która bierze intencję podmiotu
("chcę, żeby coś zostało wykonane") i zamienia ją w **zlecenie realizacji** — identyfikowalny,
żyjący w czasie byt z cyklem życia, rolami, wyceną i relacją do faktycznego wykonania.

Zamówienie **nie jest**:

- dokumentem ze statusami ani "obiegiem dokumentów" — dokument to tylko opis; modelowanie
  zlecenia jako dokumentu z enumem statusów to bardzo drogi sposób na *nieusłyszenie* tego,
  co mówi biznes,
- koszykiem w sklepie internetowym — koszyk to ułamek problemu,
- encją domenową konkretnego procesu (kontem, paczką, wizytą) z doklejonymi flagami,
- workflow ani silnikiem BPMS,
- miejscem definiowania produktów, liczenia cen, zarządzania zasobami, księgowania czy
  przechowywania użytkowników.

Zamówienie **jest** zapisem intencji, która ma zostać zrealizowana: zleceniem wykonania
czegokolwiek, co angażuje zasoby, ma wartość, ma role i ma konsekwencje. Przykłady spoza
e-commerce: zlecenie uruchomienia infrastruktury w chmurze, zlecenie badania medycznego,
zlecenie produkcji partii towaru, zlecenie instalacji usługi u klienta, zlecenie transferu
pieniędzy lub towarów, wniosek o szybką decyzję kredytową. W każdym z tych przypadków ktoś
zleca, ktoś realizuje, ktoś korzysta z efektu, ktoś ponosi koszt. **Różnią się produkty,
zasoby i reguły — nie różni się struktura problemu.**

Kluczowa formuła odpowiedzialności: **Order nie wie *jak* — wie *czy*, *kiedy* i *dlaczego*.**
Ordering nie liczy ceny (deleguje do Pricing i zapisuje wynik jako niepodważalny fakt), nie
zarządza zasobami (co najwyżej blokuje je przez Inventory na własne potrzeby), nie liczy sald
(inicjuje transakcje w Accounting), nie zgaduje ról (wiąże je jawnie przez Party). Jest cienką
warstwą spinającą — a nad nią żyją rzeczy specyficzne dla danego biznesu, bo to tam buduje się
przewagę konkurencyjną.

Dlaczego Ordering pojawia się w szkoleniu **na końcu**: dotyka prawie wszystkiego (produkt,
katalog, pricing, rabaty, podatki, dostępność, rezerwacje, role, rozliczenia, fulfillment,
audyt, wyjątki). Gdy pojawia się za wcześnie, próbuje być wszystkim naraz i przytłacza.
Gdy staje na fundamencie pozostałych archetypów — staje się lekki i zaskakująco prosty,
a zespoły mogą skupić się na tym, co unikalne dla ich domeny (reguły, wyjątki, integracje,
UX). To jest sedno redukcji obciążenia kognitywnego, o którą chodzi w tym archetypie.

Esencja ze scenek: biznes mówi "klient klika *chcę szybką decyzję*, decyzja dziś albo jutro,
czasem płatna, czasem w promocji, czasem płaci ktoś inny, jak nie ma mocy przerobowych — kolejka,
jak się rozmyśli — anulujemy". Pierwszy odruch zespołu: "dokument z tytułem i statusami
utworzony/zweryfikowany/zaakceptowany/odrzucony/anulowany + checkbox kto płaci". Tymczasem
słuchając biznesu słychać: coś jest produktem (Product), coś ma cenę (Pricing), coś ma
ograniczoną dostępność i można to zarezerwować lub na to czekać (Inventory + waitlista),
ktoś to formalnie wykona (role, Party), a kto płaci ≠ kto zamawia (role + billing). Biznes mówi
językiem archetypów, choć nie komunikuje tego wprost. Gdy później przychodzi "drobne" wymaganie
(płatność punktami lojalnościowymi, budżetem marketingu albo zużyciem limitu operacyjnego;
decyzja dziś/jutro/częściowo ręczna/automatyczna; wydana dziś, obowiązuje od jutra) — w modelu
dokumentowym "zmienia się wszystko", a w modelu archetypowym **nie zmienia się nic w Orderze**:
intencja jest ta sama, zmieniają się Pricing, availability i reguły. Order nie zakłada niczego
o naturze wartości (pieniądz, punkty, limit, CO2) — mówi tylko "tu jest intencja, wyceń ją",
pamięta czego chcieliśmy, rozróżnia kto zleca/wykonuje/płaci i pozwala porównać intencję
z faktycznym wykonaniem.

---

## 2. Sygnały dopasowania (triggery)

Ordering "zdradza się przez język procesu" — rzadko usłyszysz dosłownie "order" czy "zamówienie".

### Triggery językowe (wymagania, rozmowy z biznesem)

| Sformułowanie biznesu | Odczyt archetypowy |
|---|---|
| "zamówienie", "zlecenie", "wniosek", "zgłoszenie", "rezerwacja", "zapis na..." | utworzenie Order (często w DRAFT) |
| "złożyć wniosek" | Order w stanie DRAFT |
| "potwierdzić", "podpisać", "zatwierdzić" | przejście do CONFIRMED |
| "w realizacji", "zostało zrealizowane", "wykonać", "dostarczyć" | fulfillment; Order IN_PROGRESS / FULFILLED / CLOSED |
| "klient klika i czeka na realizację" | intencja → zlecenie realizacji |
| "jak się nie da, to czeka w kolejce / aż się coś zwolni" | polityka alokacji WAITLIST, PENDING_ALLOCATION |
| "jak się rozmyśli, to anulujemy" | cykl życia, anulowanie, kompensacje |
| "czasem ktoś inny za to płaci", "marketing płaci, nie klient" | role ORDERER ≠ PAYER |
| "kupuje dla kogoś" (voucher dla siostry) | ORDERER ≠ RECEIVER/beneficjent |
| "obieg dokumentów", "dokument ze statusami" | pozorne rozwiązanie — to prawie zawsze ukryty Ordering |
| "na dziś albo na jutro, czasem płatna, czasem w promocji" | parametry wykonania + kontekst + wycena wariantowa |
| "ustaliliśmy telefonicznie / w mailu" (parametry poza systemem) | brakujący zakres semantyczny zamówienia |
| "30 procesów sprzedażowych, każdy inny, każdy pisany od zera" | brak wspólnego szkieletu — Ordering bez Orderingu |
| "kupmy system do automatyzacji procesów" (BPMS) | próba kupienia Orderingu zamiast zamodelowania |

### Triggery kodowe (istniejące systemy)

- Rozjeżdżające się statusy i flagi: `isConfirmed`, `isActive`, `isCancelled`.
- Logika jednego procesu rozrzucona po kilku serwisach; brak jednego miejsca, w którym widać,
  co się właściwie wydarzyło.
- Encja domenowa (konto, paczka, wizyta), która "wie", jak sprawdzić dostępność, pobrać
  płatność i uruchomić wysyłkę — klasa albo serwis-omnibus z enumem statusów.
- Boolean-y oferty w encji: `creditCard=true`, potem `creditCardType`, `creditCardLimit`,
  `creditCardPromoApplied` — każda zmiana oferty = migracja bazy + deployment.
- Wiele linii biznesowych = wiele niezależnych implementacji "Orderu"; błąd logiczny
  poprawiany w pięciu miejscach.
- Obsługa statusów, przejść, anulacji i błędów współbieżności pisana wielokrotnie pod
  różnymi nazwami.
- Pojedyncze `userId` w zamówieniu, w które "ktoś musiał coś wpisać" (najczęściej tego,
  kto kliknął "kup").
- `totalAmount = null` / `= 0` jako "jeszcze nie wyceniono".

### Heurystyka strukturalna

Jeśli w procesie zawsze: (1) coś się wybiera, (2) coś ma wartość, (3) coś zużywa zasoby,
(4) ktoś pełni określone role — to pod spodem jest Ordering, niezależnie od branży
(kosmetyki, badania krwi, przesyłki, rachunki bankowe, decyzje kredytowe).

---

## 3. Anty-sygnały i granice odpowiedzialności

### Czym Ordering NIE jest / czego NIE robi

| Nie-odpowiedzialność | Należy do |
|---|---|
| Definiowanie, czym jest produkt; warianty, cechy, dopuszczalne wartości | Product (ProductType/PackageType jako kontrakt semantyczny) |
| Liczenie ceny, reguły rabatowe, zaokrąglenia, waluty, podatki | Pricing (Ordering zapisuje wynik) |
| Dostępność, rezerwacje, alokacje, pule, limity, timeouty rezerwacji | Inventory |
| Rejestr podmiotów, ich dane "żywe", Capabilities | Party |
| Salda, transfery wartości, audyt wartości | Accounting (Ordering inicjuje transakcje) |
| Mechanika fulfillmentu (jak wysłać paczkę, jak założyć konto, jak wysłać SMS) | Fulfillment / wyspecjalizowane moduły |
| Interpretacja danych kontekstu (ApplicabilityContext) | moduł Product / reguły — Ordering tylko przenosi dane |
| Weryfikacja zgodności jednostki z typem produktu | katalog produktów i/lub Inventory (powielanie w Orderingu nie niesie wartości) |

### Granice stosowalności archetypu

- Ordering **nie jest archetypem uniwersalnym** jak Product/Pricing/Inventory/Accounting,
  które opisują fundamentalne fakty o świecie. Ordering opisuje **ruch pomiędzy nimi** —
  jest archetypem procesu, decyzji, sekwencji zdarzeń. Odpowiada na pytanie "jak organizacja
  korzysta z reguł świata w czasie".
- Ordering **nie powinien być projektowany jako pierwszy** w dużym systemie — ma sens, gdy
  podstawowe capabilities są już wydzielone. Bez nich cała wiedza (reguły cenowe, polityki
  dostępności, wyjątki inwentarzowe, obejścia operacyjne) wycieka do Orderu, który staje się
  "mózgiem wszystkiego" i wąskim gardłem ewolucji.
- W małym systemie (jeden-dwa typy produktów) naiwny model zamówienia "prawdopodobnie nie
  zrobi nic dramatycznego" — archetyp opłaca się przy skali i różnorodności.
- Ordering działa najlepiej, gdy jest **jeden dominujący proces biznesowy**, produkty
  przechodzą podobny cykl życia, a fulfillment jest względnie jednolity. Przy wielu
  fundamentalnie różnych procesach (kredyt hipoteczny vs transakcja FX vs lokata) nie istnieje
  jeden idealny Ordering — patrz sekcja 10 o wariantach architektonicznych.
- Nie każde zamówienie implikuje rezerwację zasobu i nie każde ma cenę w momencie złożenia —
  zakładanie tego z góry to anty-wzorzec.
- Ordering to **nie gotowa biblioteka do wklejenia** — to sposób myślenia i modelowania,
  obszar decyzji i kompromisów; szkielet, którego statusy, przepływy i reguły dopasowuje
  się do własnych potrzeb.

---

## 4. Oczekiwania wobec dobrego modelu zamówienia (L02)

L02 buduje listę oczekiwań obserwując, jak "prosta intencja" (zapis na zabieg, zamówienie
elektroniki, wysyłka paczki, deklaracja spłaty długu, wybór planu subskrypcji) obrasta
w osoby, opłaty, zasady, anulacje, konflikty i zależności — i jak typowe implementacje
(e-commerce: klasa `Order` ze statusem, która sama sprawdza dostępność, pobiera płatność
i uruchamia wysyłkę; healthcare: strukturalnie to samo pod nazwą "badanie"; logistyka:
encja "paczka", która nawet nie sugeruje, że jest tu zamówienie) zawodzą.

### Oczekiwanie 1 — model wielokrotnego użytku

Trzy różne klasy, trzy domeny, ten sam problem koordynacji zlecenia pisany od zera.
Konsekwencje: **duplikacja logiki** (statusy, przejścia, anulacje, błędy współbieżności —
wielokrotnie, pod innymi nazwami), **brak przenoszalności rozwiązań** (nauczona obsługa
anulacji częściowo zrealizowanego zamówienia nie przenosi się na inny proces), **eksplozja
implementacji** (pięć linii biznesowych = pięć Orderów = poprawka błędu w pięciu miejscach).

Oczekiwanie: model wielokrotnego użytku — nie "jedna klasa do wszystkiego", lecz **jeden
wspólny szkielet pojęciowy, jedna struktura intencji, jeden sposób myślenia o zleceniu**.
Różnice między domenami idą w konfigurację, integracje i reguły biznesowe, a nie w trzy
zupełnie różne modele. Dlatego to archetyp, a nie encja domenowa.

### Oczekiwanie 2 — komponowalny zakres (bez flag)

Rzadko zamawia się jedną rzecz: laptop + gwarancja + instalacja + grawer; badanie krwi
+ tryb na czczo + CITO + dodatkowe panele; konto + karta + ubezpieczenie. Nie powstaje nowe
zamówienie i nie zmienia się główna intencja — zmienia się **zakres, cena, realizacja
i zużycie zasobów**. Anty-wzorzec: wszystko przyspawane do jednej encji procesu, a warianty
jako flagi boolean. Gdy oferta zaczyna żyć (nowy wariant karty, pakiety ubezpieczenia, limit
zależny od zdolności, promocja "6 miesięcy bez opłat"), boolean przestaje wystarczać i model
puchnie polami; oferta banku ewoluuje szybciej niż model zamówienia.

Konsekwencje: model nie skaluje się pojęciowo (nowa opcja = nowe pole, nowa kombinacja =
if-y); oferta zakodowana w procesie (to, co powinno być konfigurowalne, jest implementacją);
brak kompozycyjności (kombinatoryczna eksplozja); powielanie logiki wyceny i realizacji
(każda flaga pociąga reguły wpływające na cenę, proces i zasoby). Wspólny błąd: zamówienie
traktowane jako "kolejna rzecz" (konto, paczka, wizyta), a nie jako **struktura zdolna
pomieścić różne elementy**; proces staje się nośnikiem oferty. (To bliźniak problemu
z modułu Product — "coś się przelało".)

Oczekiwanie: zamówienie musi pozwalać na **komponowanie zakresu**; elementy zamówienia nie
mogą być polami; nowe kombinacje nie mogą wymagać zmiany modelu danych; reguły oferty nie
mogą być zaszyte w procesie.

### Oczekiwanie 3 — semantyka zlecenia (parametry wykonania)

Zamówienie to nie lista rzeczy, lecz opis intencji, a intencja ma **zakres, parametry
i kontekst**. Klient nie chce "laptopa jako obiektu": chce dostawy do konkretnego biura,
instalacji oprogramowania przed odbiorem, szkolenia konkretnego pracownika, terminu do piątku.
Logistyka: nie "100 ton towaru", lecz 100 ton cementu do lokalizacji X, w trzech transzach,
pierwsza priorytetowa, rozładunek od północy, telefon do kierownika budowy 30 minut wcześniej.
To nie komentarze — to **treść zlecenia**. Jeśli nie ma jej w modelu, ląduje w mailach,
notatkach i telefonach, czyli poza systemem (przestroga: systemy finansowe "note-driven"
budowane na CRM — nieudane projekty).

Konsekwencje braku: utrata kontekstu biznesowego (realizujący widzi "co", nie wie "dlaczego
i jak"); brak automatyzacji (system nie zna priorytetów, obsługi specjalnej, terminów
krytycznych); problemy z planowaniem zasobów; konflikty i reklamacje ("przecież ustalaliśmy"
vs "w systemie tego nie ma"); brak danych do decyzji (ile zleceń pilnych, ile z instalacją,
ile niestandardowych).

Oczekiwanie: zamówienie musi **przechowywać parametry wykonania**, opisywać zakres i kontekst
(nie tylko przedmiot), być **samowystarczalne informacyjnie** — bez dopowiedzeń poza systemem.
Analogia do Product: produkt ma cechy, sprzedaż ma instancję cech — zamówienie ma
konfigurowalny zakres semantyczny, nie tylko listę pozycji.

### Oczekiwanie 4 — role uczestników

Przykład beauty: Joanna kupuje voucher na masaż dla siostry Anny, płaci kartą, voucher idzie
na adres Anny (niekoniecznie zamieszkania), wykonuje salon Relax. Jedno zamówienie — wiele ról.
Typowe podejście "jedno `userId` i jakoś to będzie" (zwykle ID tego, kto kliknął "kup")
działa tylko na happy path. Konsekwencje: potwierdzenie i przypomnienie o terminie idą do
Joanny zamiast do Anny; faktura na Joannę zamiast na firmę; salon widzi Joannę, przychodzi
Anna — zamieszanie; raport "zamówienia opłacone przez nas" niewykonalny; salon dostał dane
Joanny, choć świadczy dla Anny — problem RODO.

Role powtarzają się między domenami: zamawiający, płatnik, wykonawca, odbiorca, koordynator,
beneficjent. "Dodajmy więcej pól" wystarcza tylko, gdy ról jest kilka i są stabilne; każda
nowa rola = zmiana modelu, migracja, if-y. Role są stabilne **pojęciowo**, ale ich liczba
i kombinacje w zamówieniu są dynamiczne i nie wszystkie znane na etapie projektowania —
potrzebny jest **mechanizm przydzielania ról** (relacja podmiot–rola–zamówienie), nie kolumny.

Dodatkowo: nie każda strona jest zarejestrowanym użytkownikiem (nadanie paczki w paczkomacie
bez konta; odbiorca może nie wiedzieć, że kurier jedzie) — nie ma `userId`, a wiedzieć trzeba.
Nawet gdy ID istnieje, dane zmieniają się w czasie, a nas interesuje "kto, skąd i z jakimi
danymi zlecał **wtedy**" — stąd **snapshoty danych podmiotu**, nie referencje do żywego rekordu.

Oczekiwanie: model rozróżnia role uczestników; wiele ról w jednym zamówieniu; działa bez
`userId`; zachowuje kontekst historyczny. To fundament automatyzacji, rozliczeń, fulfillmentu
i komunikacji zewnętrznej.

### Oczekiwanie 5 — wycena (moment, źródło, struktura)

Ciche założenie "jest zamówienie, to musi być cena" bywa fałszywe. Trzy scenariusze:
(1) sklep — cena znana od razu, z katalogu, rabatów i podatków; Pricing Engine liczy,
Ordering zapisuje; (2) produkcja niestandardowa — handlowiec po negocjacji wpisuje 150 tys.;
**cena arbitralna**, w pełni poprawna biznesowo; system ma ją przyjąć, utrwalić i nie
dyskutować; (3) telekom/energia/logistyka — rozliczenie zużyciem; cena znana po miesiącu,
powstaje w billingu; w momencie złożenia nie znamy kwot ani liczby pozycji.

Konsekwencje naiwnego modelu (jedna kwota, znana od razu, automatyczna): brak informacji
o **źródle ceny** (Pricing czy ręczna? — istotne przy reklamacjach, audycie, zmianach polityki);
brak wsparcia **wyceny odroczonej** (`totalAmount = null/0` sieje błędami); brak **śladów
wyceny** ("dlaczego to kosztowało tyle?" — reguły się zmieniły, promocja wygasła, engine dziś
zwraca co innego; mamy wynik bez kontekstu); **cena jako jedna liczba to za mało** (wartość
bazowa, rabaty ilościowe i procentowe, koszty dodatkowe, podatki — wymogi regulatora
i księgowości).

Oczekiwanie: rozróżniaj moment wyceny; rozróżniaj źródło (wyliczona/ręczna/odroczona);
wycena na poziomie pozycji, nie tylko całości; snapshot wartości odporny na zmianę reguł;
obsługa rabatów ilościowych i procentowych; brak założenia, że cena istnieje w momencie
złożenia.

### Oczekiwanie 6 — zamówienie żyje (historia zmian)

Zamówienie rzadko jest niezmienne od powstania do realizacji: klient po godzinie zmienia
adres dostawy, termin, model produktu (czasem operacyjnie taniej anulować i założyć nowe —
tak czy owak manipulujemy stanem); oferta handlowa iteruje (korekta zakresu → nowa cena →
akceptacja → w realizacji zamiennik → znowu nowa cena → akceptacja) — **to nadal to samo
zamówienie**, choć treść inna niż na początku; zlecenie transportowe przed wyjazdem auta
zmienia godzinę załadunku, miejsce rozładunku, kolejność dostaw.

Oczekiwanie: zamówienie zachowuje **historię zmian po złożeniu**; zmiany nie nadpisują
pierwotnej intencji; model rozróżnia **zmiany treści zamówienia od stanu realizacji**;
jasne jest, co było zamówione, co zmienione, kiedy i dlaczego.

### Oczekiwanie 7 — rezerwacja to osobny problem

Nie każde zamówienie oznacza rezerwację zasobów. Voucher na masaż: opłacony, ma wartość,
beneficjenta i wykonawcę, ale nie blokuje terminu ani zasobu — dostępność sprawdzana później.
Wizyta o konkretnej godzinie u konkretnego specjalisty: zamówienie bez blokady nie ma sensu —
rezerwacja jest warunkiem istnienia zamówienia w tej postaci.

Kluczowe rozróżnienie: **Order opisuje intencję; rezerwacja opisuje dostępność zasobów
w czasie.** Zamówienie może, ale nie musi implikować rezerwacji. Model musi obsłużyć warianty:
bez rezerwacji / z rezerwacją natychmiastową / z rezerwacją odroczoną / warunkowe.
Zamówienie może **żądać** rezerwacji, ale jej **nie posiada**. Order mówi: "tego chcę, na
takich warunkach"; Inventory/Resource Management odpowiada: "mogę to zapewnić — teraz, później
albo wcale".

### Synteza L02

Ordering nie jest procesem ani encją domenową — jest archetypem dającym **stabilny szkielet**
dla bardzo różnych scenariuszy. Celem nie jest idealny model ani wsparcie konkretnej branży,
lecz baza łatwa do dopasowania i zrozumienie, **które decyzje projektowe naprawdę mają
znaczenie** (większość problemów z zamówieniami wynika z ich braku).

---

## 5. Zakres semantyczny zamówienia (L03)

### Dwa scenariusze istnienia produktu

- **Scenariusz A** — produkt istnieje i jest ograniczony (laptop w magazynie, telefon, paczka
  śrub, karta do wysyłki, paliwo): zamówienie **konkuruje o zasoby**.
- **Scenariusz B** — produkt nie istnieje przed zamówieniem (konto bankowe, polisa, kredyt,
  subskrypcja, dostęp do systemu): nie ma magazynu; zamówienie **uruchamia proces, który
  dopiero tworzy instancję produktu**.

### Pojęcia z archetypu Product potrzebne Orderingowi

- **Produkt** — szerzej niż "to, co sprzedajemy": wszystko, co wnosi wartość do organizacji
  i uruchamia procesy operacyjne (iPhone 15 Pro 256GB, konto osobiste standard, wizyta
  ortopedyczna, polisa OC, ugodowa spłata zadłużenia, list do komornika, audyt bezpieczeństwa,
  decyzja administracyjna, pakiet czynności procesowych). **Oferta handlowa to szczególny
  przypadek produktu, nie jego definicja** — zamówienie często oznacza zlecenie pracy,
  procedury, sekwencji działań, nie zakup z katalogu.
- Produkt w kontekście zamówienia to **kontrakt semantyczny**: opisuje, co ma być dostarczone
  lub wykonane, jaka wartość powstanie, jakie warianty/cechy są dopuszczalne. **Nie mówi**,
  czy coś jest dostępne, ile tego jest, który egzemplarz zostanie użyty, kiedy nastąpi
  realizacja — to pytania do realizacji, nie do intencji.
- **ProductType** — szablon, definicja klasy rzeczy/czynności, punkt odniesienia dla zamówień.
- **PackageType** — zestaw (laptop+mysz+torba; konto+karta+bankowość; pakiet badań; obsługa
  sprawy+korespondencja+reprezentacja). Nadal jest produktem: ma własną tożsamość biznesową,
  zamawiany jako całość; realizacja prowadzi do wielu działań i instancji. Z perspektywy
  zamówienia **linia jest nadal jedna** — zakres realizacji wynika z definicji paczki, nie
  z konstrukcji OrderLine. Dzięki temu struktura zamówienia się nie komplikuje, logika oferty
  nie przenosi się do procesu, a przypadki proste i złożone są spójne.
- **ProductInstance** — konkretny byt (fizyczny lub logiczny) z tożsamością: telefon z numerem
  seryjnym, konto z numerem rachunku, polisa z numerem umowy. Może istnieć przed zamówieniem
  albo powstać dopiero w wyniku realizacji.
- **Strategia śledzenia** — czy i jak egzemplarze są rozróżnialne: unikalne (dzieła sztuki),
  indywidualnie śledzone (elektronika, konta), partiami (żywność, leki), nierozróżnialne/
  wymienne (śruby, paliwo). Decyzja nie należy do zamówienia, ale wprost wpływa na sposób
  realizacji.

### Zamówienie operuje na typie, nie na egzemplarzu

Linia zamówienia mówi: "taki produkt, w takim wariancie, w takiej ilości". Na tym etapie nie
istnieją numery seryjne, numery rachunków, daty obowiązywania ani lokalizacja fizyczna.
Dopiero realizacja prowadzi do **przydzielenia** istniejącej instancji albo **utworzenia**
nowej. Powody, dla których wskazywanie instancji w linii jest złe: (1) dla produktów
tworzonych na żądanie instancji jeszcze nie ma; (2) dla produktów masowych egzemplarz nie ma
znaczenia biznesowego — liczy się ilość (instancja może odpowiadać transportowi/partii, co
zamówienia nie interesuje); (3) typ zostawia realizacji **elastyczność optymalizacji**
(wybór najlepszego magazynu, FEFO/FIFO, lokalne ograniczenia) — narzucenie instancji ją zabija.

Linia zamówienia to nie instrukcja "weź ten egzemplarz", tylko "**zrealizuj ten produkt
zgodnie z obowiązującymi regułami**". Rezerwacja konkretnego egzemplarza nie jest zakazana —
jest przeniesiona na inny poziom: zamówienie może zawierać ograniczenia, preferencje, a nawet
jawne wskazanie instancji ("ten samochód z VIN XYZ", "ten telefon, który widziałem",
"wizyta u tego lekarza o tej godzinie"), ale semantycznie przedmiotem pozostaje typ,
a wskazanie instancji jest **warunkiem realizacji**, nie zmianą natury zamówienia.

### Baza modelu: Order, OrderLine

- **Order** musi być jednoznacznie identyfikowalny, bo: ma cykl życia (powstaje, potwierdzane,
  realizowane, kończone, anulowane); jest **kotwicą**, do której dopinają się płatność,
  rezerwacje, fulfillment, reklamacje, korespondencja, audyt; musi dać się odnaleźć po czasie
  (miesiąc, pięć lat); różne systemy muszą móc powiedzieć "mówimy o tym samym zamówieniu".
- Order **żyje — jest maszyną stanów** (w jednych biznesach prostą, w innych złożoną).
  Statusy odpowiadają na pytania "czy potwierdzone / w realizacji / zrealizowane / anulowane".
  Uwaga: na wiele pytań dałoby się odpowiedzieć bez nowego pola (np. o rozpoczęciu realizacji
  wnioskować z obecności identyfikatora blokady zasobu). Skoro są stany — jest i zachowanie.
- **OrderLine** — minimalna jednostka intencji: co i w jakiej ilości. Jako kwant intencji
  podlegający modyfikacji (dodanie/usunięcie/zmiana) jest jednoznacznie identyfikowalna.
  Wskazuje produkt przez **identyfikator** (Ordering koordynuje dostarczenie, nie zarządza
  definicją; detale produktu tylko pomocniczo — żadnych natychmiastowo spójnych reguł
  biznesowych rozszerzających ten model). Ilość: sztuki, litry, kilogramy, minuty, godziny,
  palety. Zgodności jednostki z typem produktu Ordering **nie** weryfikuje — robi to katalog
  produktów i/lub Inventory; powielanie nie niesie wartości.

### OrderLineSpecification — doprecyzowanie intencji

Linia "produkt X, ilość 1" wystarcza tylko w trywialnym świecie. Realny biznes pyta: który
wariant? jakie cechy? konkretny egzemplarz czy dowolny? warunki realizacji? co wybrać, zanim
produkt da się utworzyć? (iPhone: kolor, pamięć; konto: waluta, pakiet, oddział; komputer:
który laptop, która mysz, parametry; wizyta: lekarz, termin; produkt fizyczny: konkretna
partia czy dowolna). Te informacje **nie zmieniają tego, co zamawiamy — doprecyzowują
intencję**; to ta sama linia, zmienia się zakres i sposób realizacji.

Pokusa: dodawać pola do OrderLine, tworzyć osobne klasy wariantów albo kodować reguły
w procesie — każda droga prowadzi do eksplozji modeli lub sztywnego systemu. Zamiast tego:
**OrderLineSpecification** — generyczna mapa klucz–wartość, która precyzuje wariant produktu,
wskazuje kryteria wyboru instancji, określa parametry utworzenia instancji i przekazuje
preferencje realizacyjne.

Zawartość specyfikacji wg przypadków:

| Przypadek | Co w specyfikacji |
|---|---|
| Konkretny egzemplarz | identyfikator instancji: numer seryjny, VIN, instanceId — cokolwiek jednoznacznego |
| Produkt śledzony indywidualnie, egzemplarz obojętny | wartości cech (np. kolor=niebieski, pamięć=256GB) jako kryteria wyszukiwania |
| Produkt masowy/nierozróżnialny (śruby M6, paliwo, mąka, cement) | specyfikacja **pusta** — nie ma czego doprecyzowywać; Inventory interesuje tylko, czy pula wystarczy |
| Produkt tworzony na żądanie (konto, polisa, subskrypcja) | **parametry utworzenia** instancji — wszystkie obowiązkowe cechy (np. waluta, pakiet; opcjonalnie depozyt wstępny) |
| Produkt czasowy (wizyta, usługa specjalisty) | **zasób + slot czasowy** — rezerwujemy okno czasowe, nie egzemplarz; ProductInstance często powstaje dopiero po realizacji/rezerwacji |
| Paczka (PackageType) | wybór komponentów + cechy wybranych komponentów (DSL budowniczego); składowe mogą być też wskazywane po numerach seryjnych |
| Preferencje realizacyjne | konwencja (np. prefiks `_`) — nie zmieniają *co*, wpływają na *jak* |

Przypadek czasowy rodzi pytania modelowe: nie tworzymy defensywnie instancji dla każdego
slotu; jeśli instancja nie może istnieć bez slotu — warto przemodelować ProductType, by
wymuszał slot (lub slot+zasób, np. lekarza) albo blokadę dostępności, wymuszając rezerwację
na początku zamówienia. W złożonych domenach (produkty magazynowe, czasowe, na żądanie,
paczki) warto jawnie zapisać **tryb realizacji** w archetypie Product.

### ProductType jako API kontraktowe

Skąd wiadomo, co wpisać do specyfikacji? **Ordering tego nie wymyśla — odczytuje z modelu
produktu.** Struktura jest generyczna, ale semantyka zawartości wynika wprost z definicji
ProductType: jakie cechy obowiązkowe/opcjonalne, jakie wartości dozwolone, czy produkt
istnieje wcześniej czy powstaje na żądanie, czy jest czasowy, czy jest paczką, czy śledzony
indywidualnie czy pulą. ProductType jest **API kontraktowym** dla Frontendu, Orderingu,
Inventory, Pricingu, Fulfillmentu: UI pyta katalog i dynamicznie buduje formularz (użytkownik
nie zgaduje — wypełnia to, czego wymaga produkt); Ordering przyjmuje specyfikację i weryfikuje
ją w momencie składania/zatwierdzania.

Drzewo decyzyjne wyboru strategii specyfikacji: Konkretny egzemplarz? → identyfikator.
Produkt istnieje przed zamówieniem? → kryteria wyszukiwania; nie istnieje? → parametry
utworzenia (komplet obowiązkowych cech). Paczka? → wybór komponentów. Czasowy? → zasób+slot.
Tylko preferencje? → konwencja w specyfikacji.

### Zachowanie, współbieżność, kontekst

- Order to **model bogaty w zachowania**, nie pasywny rekord: zna swój stan, pilnuje
  dozwolonych przejść, egzekwuje reguły. Elementy strukturalne zmieniają się, ale nie
  w dowolnym momencie i nie w sposób niekontrolowany. Implementacja (model obiektowy czy
  workflow) jest wtórna wobec świadomości granic i konsekwencji wyborów.
- **Współbieżność**: zamówienie rzadko modyfikuje jeden proces — użytkownik zmienia
  specyfikację, płatności rejestrują wpłatę, fulfillment aktualizuje status, Inventory
  zakłada/zwalnia blokady. Potrzebna kontrola konfliktów, np. pole wersji + optimistic
  locking. Zamówienie jako byt spinający musi być bezpieczne współbieżnie.
- **ApplicabilityContext**: wiele reguł nie zależy od produktu, lecz od okoliczności złożenia
  zamówienia — ten sam produkt bywa niedostępny kontekstowo (biznesowo/prawnie), nie z braku
  zasobów (konto VIP tylko dla segmentu VIP w oddziale lub bankowości elektronicznej; kredyt
  tylko 18–65 lat, z Polski). Warunki definiuje ProductType/PackageType w archetypie Product.
  Rolą Orderingu jest kontekst **zebrać** (mapa parametrów) i **przekazać** do modułu Product
  w celu weryfikacji istnienia produktu, kompletności cech i możliwości zamówienia.
  Zawartość kontekstu: czas (orderDate, orderMonth — sezonowość, promocje, regulacje),
  geografia (country/region/city — z profilu, adresu, IP, nagłówków), kanał
  (ONLINE/MOBILE/BRANCH/CALL_CENTER), charakterystyka klienta (segment, wiek, zatrudnienie),
  dodatkowe wymiary (campaign, partnerCode, referralSource). **Ordering nie interpretuje tych
  danych — przenosi je i udostępnia.** Zamówienie niesie wtedy nie tylko intencję, ale
  i warunki, w jakich została zgłoszona.

### Osie decyzyjne i postawa projektowa

Rozgałęzianie się pytań (typ czy instancja? specyfikacja jako kryterium wyszukiwania czy
parametr utworzenia? rezerwuję zasób, czas, czy tylko deklaruję zamiar? gdzie kończy się
Ordering, a zaczyna Inventory? wariant to cecha, paczka czy osobny ProductType? kiedy zmiana
linii to to samo zamówienie, a kiedy nowe?) to **nie oznaka złego modelu** — to sygnał
dotykania prawdziwych problemów domenowych. Moduł daje: język pojęć, świadomość miejsc,
w których zbyt prosty model pęka, osie decyzyjne (produkt vs instancja, specyfikacja vs
zasób, intencja vs realizacja) i heurystyki ewolucji. "To zależy / trzeba rozstrzygnąć
biznesowo" to oczekiwany stan — Ordering to nie gotowa biblioteka, lecz obszar świadomych
decyzji i kompromisów.

---

## 6. Role uczestniczące w procesie zamówienia (L04)

### Zamówienie jako kontrakt operacyjny

Każde zamówienie jest **relacją pomiędzy podmiotami**: ktoś składa, ktoś realizuje, ktoś
płaci, ktoś odbiera rezultat; role nakładają się albo rozchodzą między osoby, działy, firmy.
Zamówienie odpowiada na pytania: kto inicjuje proces, kto ponosi koszty, kto odbiera efekt,
kto odpowiada za realizację, kto formalnie przyjmuje płatność. Zgodnie z archetypem Party —
to **role, nie osoby**.

### Słownik ról bazowych

| Rola | Strona | Znaczenie |
|---|---|---|
| ORDERER | zamawiająca | inicjuje zamówienie |
| PAYER | zamawiająca | płaci |
| RECEIVER | zamawiająca | odbiera produkt/usługę |
| EXECUTOR | realizująca | odpowiada (kontraktowo) za realizację |
| PAYMENT_RECEIVER | realizująca | przyjmuje płatność — nie zawsze tożsamy z EXECUTOR |

Baza może być węższa lub szersza per biznes (np. CARRIER — podwykonawca transportu). Role
opisują **odpowiedzialność w kontekście konkretnego zamówienia**, nie strukturę organizacyjną.
W najprostszym przypadku jedna osoba pełni wszystkie role po stronie zamawiającej; już
w prostym B2B role się rozjeżdżają (centrala zamawia, finanse płacą, oddział odbiera,
vendor realizuje), a liczba ról i stron różni się między zamówieniami.

### PartyInRole, snapshoty, podmioty niezarejestrowane

Zamiast dedykowanych pól — **lista** powiązań. **PartyInRole** w najprostszym wydaniu to para
(PartyId, rola słownikowa) — wystarczająca tylko, gdy każdy uczestnik jest zawsze
zarejestrowany, a jego dane istotne dla realizacji nigdy się nie zmieniają (albo nie są
istotne). W przeciwnym razie zamówienie musi być **odporne na zmianę danych w czasie**:
adres, telefon, nazwa firmy mogą się zmienić po złożeniu, ale zamówienie nie może
"zaktualizować się wstecz" (jeśli tydzień temu zamawiała pani Świątek, a za tydzień będzie
Świątek-Piątek, zamówienie najczęściej dotyczy pierwszego nazwiska). Stąd **snapshot danych**
w zamówieniu: minimalny zestaw informacji do realizacji, kontaktu, audytu, reklamacji —
**niemutowalny**, nie zmienia się nawet gdy Party zmieni dane w systemie.

Podmiot niezarejestrowany (brak PartyId) — zamówienie nadal procesowalne, ale to **świadoma
decyzja biznesowa**: brak PartyId komplikuje (nie uniemożliwia) budowę historii zamówień
i identyfikację podmiotu między zamówieniami; agregacja po e-mailu/telefonie bywa
niewiarygodna, dlatego takie funkcje często są tylko dla zarejestrowanych.

Ten sam podmiot może pełnić **kilka ról w jednym zamówieniu** — nie duplikujemy danych:
PartyInRole trzyma **zbiór ról** zamiast pojedynczej.

### OrderParties — enkapsulacja i polityki

Pytania "kto jest dostawcą, kto płatnikiem, jakie role pełni podmiot X" nie powinny obciążać
rosnącej klasy Order — listę wraz z metodami-odpowiedziami opakowujemy w obiekt
**OrderParties**. Order nie wie, jak role są przechowywane: zadaje pytania, OrderParties
gwarantuje spójność odpowiedzi. Enkapsulacja pozwala definiować **reguły/ograniczenia**
(np. dostawca dokładnie jeden, płatników najwyżej dwóch).

### Źródła danych o uczestnikach

Nie ma jednej odpowiedzi — zależy od procesu, decyzji użytkownika i reguł automatycznych;
model **umożliwia zapis relacji, nie wymusza ich pochodzenia**. Typowo: ORDERER z komendy
użytkownika (lub z warstwy autoryzacji, tokenów JWT — technicznie wtórne); EXECUTOR wybrany
explicite (oddział, przewoźnik), z konfiguracji (domyślny dla produktu/regionu/kanału) albo
wyznaczony regułami (routing do właściwej jednostki); PAYMENT_RECEIVER często stały
(centralna jednostka rozliczeniowa). Co jawne, a co wyliczane — to **nie decyzja techniczna**,
lecz wynik analizy procesów, odpowiedzialności i ryzyk; model ma tę decyzję umożliwiać,
nie ukrywać.

Scenariusz logistyczny: nadawca zleca i płaci (ORDERER+PAYER), odbiorca otrzymuje (RECEIVER),
firma kurierska odpowiada kontraktowo (EXECUTOR), transport wykonuje podwykonawca wybrany
automatycznie wg trasy i parametrów (CARRIER, z zewnętrznego CarrierRoutingService),
rozliczenia do centralnej jednostki (PAYMENT_RECEIVER). Serwis typu LogisticsOrderService
celowo **nie jest archetypowy** (wybór przewoźnika to specyfika branży), ale samo zamówienie —
budowa, semantyka, reguły — działa identycznie jak w innych branżach. Archetyp to sposób
myślenia, niekoniecznie kod do kopiowania.

### Role o zasięgu Order vs OrderLine

Nie wszystkie role mają ten sam zasięg odpowiedzialności; bez rozróżnienia model dopuszcza
bezsensowne konfiguracje (ORDERER na linii) albo obrasta if-ami.

- **Zasięg zamówienia**: ORDERER (składa całość), PAYER (płaci za całość), EXECUTOR
  (odpowiada kontraktowo za realizację) — zwykle bez sensu per linia.
- **Zasięg linii**: RECEIVER (linia może trafić gdzie indziej), DELIVERY_CONTACT (inna osoba
  do kontaktu przy dostawie), INSTALLATION_RECIPIENT (odbiera efekt instalacji) — role
  lokalne, sens ujawnia się w kontekście produktu/sposobu realizacji.

Stąd **polityki walidacji ról** (zamiast reguł na twardo w konstruktorach): polityka dostaje
zestaw ról i decyduje, czy kombinacja ma sens w danym kontekście + weryfikacje ilościowe.
Na poziomie Order twarde reguły typów i liczności (np. dokładnie jeden ORDERER; PAYER
opcjonalny, ale najwyżej jeden). Na poziomie linii np. wszystkie role opcjonalne, brak =
fallback do poziomu Order, ale bez ról bez sensu biznesowego (linia nie może mieć ORDERER-a
ani PAYER-a, może mieć własnego odbiorcę, kontakt przy dostawie, odbiorcę instalacji).
OrderParties staje się nośnikiem danych **i polityki** — błąd konfiguracji ról wychodzi
natychmiast, precyzyjnie, bez odpalania realizacji.

Przykład wielu linii: (1) paczka dokumentów — bez Parties na linii = "użyj ról z Order";
(2) przesyłka do innego oddziału — RECEIVER linii **nadpisuje** domyślnego odbiorcę,
DELIVERY_CONTACT jest czysto lokalny, reszta z Order; (3) produkt z montażem — RECEIVER
przyjmuje dostawę, INSTALLATION_RECIPIENT potwierdza montaż: dwie różne odpowiedzialności.

**API efektywnych ról**: Order zawsze ma Parties na poziomie głównym (punkt odniesienia:
ORDERER, PAYER, EXECUTOR, PAYMENT_RECEIVER, domyślny RECEIVER); linia może mieć lokalne,
opcjonalne Parties. Pytanie "jakie role obowiązują dla tej linii" obsługuje **jedna centralna
metoda** z logiką merge zenkapsulowaną w OrderParties — zamiast rozproszonego
"sprawdź tu, potem tam, potem gdzieś indziej".

### RoleRequirements i Capabilities

Przypisanie roli ≠ prawo do jej pełnienia. Role mają **wymagania** (EXECUTOR dostaw sprzętu
medycznego musi spełniać warunki formalne, operacyjne, geograficzne) — modelowane jako
**RoleRequirements** (z archetypu Party). Po drugiej stronie **Capabilities** przypisane do
Party: faktyczne możliwości (kategorie produktów, regiony, certyfikaty, przepustowość/skala) —
dane domenowe, często w osobnym module lub systemie. Mechanizm: "czy Capabilities danego
Party spełniają wymagania roli w tym kontekście?" — weryfikacja przy składaniu albo
potwierdzaniu zamówienia; wtedy zamówienie przestaje być roboczą intencją, a staje się
**wiążącym kontraktem operacyjnym**.

Podział odpowiedzialności: Order **nie zna** szczegółów Capabilities (nie wie, czym jest
ISO 13485, nie sprawdza zasięgu geograficznego) i **nie decyduje** o wymaganiach (dostaje je
z RoleRequirementsProvider na podstawie kontekstu). Order **egzekwuje kontrakt**: sprawdza
warunki i blokuje przejście do CONFIRMED, gdy niespełnione. Filozofia: Capabilities opisują
możliwości, RoleRequirements — oczekiwania, Order pilnuje sensowności przypisań, nie
implementując logiki kwalifikacji — dzięki temu nie zmienia się w monolit "wiedzący wszystko
o wszystkim".

---

## 7. Wycena zamówienia — integracja z Pricing (L05)

### Cena jako snapshot decyzji

Cena w zamówieniu to **nie liczba w bazie, lecz historia decyzji cenowych** podjętych przy
składaniu/zatwierdzaniu. Scenariusz wzorcowy: zamówienie w poniedziałek za 5000 zł (płatność
przy odbiorze), we wtorek promocja 4500 zł, w środę płatność — klient płaci **5000 zł**, bo
to cena z momentu złożenia, cena z umowy. Cena w zamówieniu **nie może być odczytem aktualnej
ceny produktu** — musi być snapshotem: jak i dlaczego została ustalona.

### Kontrast z Enterprise Patterns and MDA

Klasyczny model (ChargeLine — cena związana z linią, osobne linie za opakowanie/wysyłkę;
TaxOnLine per ChargeLine; DiscountEvent z dedykowanym modelem zniżek) krytykowany jest za:
przerzucanie zarządzania wycenami i interpretacji wartości na Ordering; promowanie
**niejawnego modelowania produktów i cen w Orderingu** (dopisywanie linii za pakowanie
i wysyłkę); monolityczność (jedna zmiana dotyka wielu modułów); zabicie elastyczności
(czemu podatek i zniżka mają model, a prowizja nie?); niepoprawną semantykę wzorców
integracyjnych ("event" jako komenda). Nasze podejście: zamiast charge/tax/discount line —
**generyczne komponenty cenowe, kategorie semantyczne i jedno drzewo breakdownu**
(Component Breakdown z modułu Pricing); koszt, marża, podatek i zniżka sterowane tak samo.
Ordering nie potrzebuje ChargeLine ani DiscountEvent — potrzebuje **wyniku pracy Pricingu**.

### Co przechowywać na linii

Interpretacje ceny z Pricingu: jednostkowa, marginalna, całkowita. Dla całego zamówienia
sensowny jest tylko **TOTAL** (cena jednostkowa całości nie ma semantyki: telefon + etui = ?).
Dla **OrderLine** chcemy **obie**: jednostkową (prezentacja, negocjacje, porównania ofert)
i całkowitą (sumowana na poziomie zamówienia). Nie wyliczamy unitPrice = totalPrice/quantity
w Orderingu: Ordering **nie zna reguł zaokrągleń** (góra/dół, 2 czy 4 miejsca), specyfiki
walut, wymagań podatkowych i regulacyjnych — i nie chcemy, żeby znał; to odpowiedzialność
Pricingu. Jeśli Pricing wyliczył 14,27 zł/szt. i 142,70 zł za 10 szt., Ordering przyjmuje
oba wyniki **jako fakt** — nie odtwarza, nie weryfikuje.

Oprócz kwot linia przechowuje **Component Breakdown** — drzewo komponentów pokazujące, jak
powstała cena (komponenty, rabat, podatek, koszt, marża). To nie dodatek dla ciekawskich —
to **historia decyzji cenowych**. Breakdown zawsze operuje na interpretacji TOTAL, bo tylko
ceny całkowite sumują się bezpiecznie (komponenty liniowe, progowe, opłaty stałe, rabaty
procentowe). Daje Orderingowi nie tylko "ile", ale "dlaczego tyle". Kategoryzacja komponentów
pozwala agregować ceny wielu różnych linii w spójną strukturę kosztów całego zamówienia bez
naruszania logiki wyceny pojedynczych produktów.

### Cztery źródła ceny — kontrakt OrderLinePricing

Wspólny kontrakt (interfejs **OrderLinePricing**) z **zamkniętym zbiorem implementacji**;
`isDefinitive` rozróżnia ceny fakturowalne od czysto informacyjnych:

| Implementacja | Semantyka |
|---|---|
| **CalculatedPricing** | policzona przez Pricing wg reguł; pełny breakdown; wiążąca |
| **ArbitraryPricing** | "z palca" — negocjacja/korekta; legalny przypadek biznesowy; dodatkowo kto i kiedy ustalił (audyt) |
| **EstimatedPricing** | szacunkowa — do oferty, rozmowy, wstępnej decyzji; może się zmienić, niewiążąca; może wymagać zatwierdzenia |
| **NotPricedYet** | linia istnieje, nie wyceniona; **próba odczytu ceny = błąd** (nie null/0); np. wycena po wykonaniu — nie wiemy, ile drewna zużyje rzeźbiarz |

Problem ArbitraryPricing: cena arbitralna bywa jednostkowa albo całkowita, a potrzebne obie —
liczenie w Orderingu grozi błędami. Rozwiązanie: cennik **FIXED-PRICE** w Pricingu
parametryzowany ceną z Orderingu — ujednolica obsługę i breakdown; bez tego breakdown
konfiguruje użytkownik albo przyjmujemy domyślny. Każda sytuacja cenowa ma semantykę
**wyrażoną w typie, a nie w komentarzu czy fladze**.

### PricingContext i proces wyceny

CalculatedPricing = wynik wywołania modułu Pricing, który potrzebuje **kontekstu** — wszystkich
parametrów wpływających na cenę, zebranych wcześniej i przekazanych **jawnie**. Tym zajmuje się
Ordering przez **PricingContext** (prosta struktura danych). Przyjęte założenie: **produkty
znają swoje cenniki** i wybieramy je świadomie w Orderingu (stąd identyfikator komponentu
cennikowego w kontekście). Przykładowy proces: wybierz linię → wybierz komponent cennikowy →
zbuduj kontekst → wywołaj Pricing → zapisz wynik. Warianty: kontekst per linia albo
zagregowany dla wszystkich linii (optymalizacja komunikacji, zwłaszcza zdalnej); modele
odczytu produktów zamiast wywołań — typowe problemy integracyjne, poza zakresem archetypu.

### Granica odpowiedzialności i model docelowy

OrderLine = produkt + ilość + specyfikacja + własna cena. Order = linie + strony +
**procesy** wyceny (nie matematyka). Granica: **Order nie wybiera cennika (Product), nie
interpretuje reguł ceny (Pricing), nie przelicza wartości — zapisuje wynik.** Czysta
orkiestracja bez wchodzenia w cudze kompetencje. Ręczna korekta ceny też idzie przez Order
z pełną semantyką — **nie overwrite pola, lecz jawna decyzja biznesowa z audytem**. Suma
zamówienia staje się trywialna; wartość modelu ujawnia się przy agregacji struktury.
Efekt: cena przestaje być liczbą do przeliczenia, a staje się **udokumentowaną decyzją
biznesową** — zrozumiałą, sumowalną i obronialną, nawet gdy świat się zmienił.

### Zniżki — dwie opcje

1. **Zniżka jako komponent w drzewie Pricingu** — rabaty automatyczne (np. >20 palet → 15%);
   reguła żyje w Pricingu, jest automatyczna, spójna, niewidoczna jako osobny byt
   w zamówieniu. Dobre, gdy rabat wynika z algorytmu i nie jest elementem umowy.
2. **Zniżka jako osobna linia zamówienia** — vouchery, kupony, kody marketingowe, zniżka
   nadana przez pracownika: własny breakdown, **ujemna cena**, agreguje się jak każdy produkt.
   Daje jasność dla klienta, prosty audyt, zadowoloną księgowość, naturalne reguły ("nie można
   dodać dwóch voucherów") i zero zmian w Pricingu przy nowej kampanii. Szczególnie dobre dla
   rabatu na całe zamówienie. Vouchery stają się produktami z własnym cyklem życia —
   Ordering nie zna ich zasad, traktuje jak każdą linię.

---

## 8. Realizacja zamówienia i jej przebieg (L06)

Uwaga redakcyjna: w transkrypcji nagłówki L06/L07 wydają się zamienione względem treści —
lekcja zatytułowana "Realizacja zamówienia i jej przebieg" omawia głównie strategie
i polityki alokacji (integrację z Inventory), a lekcja "Relacja Ordering z Inventory" —
cykl życia, maszynę stanów i fulfillment. Poniżej treść wg faktycznych tematów: ta sekcja
obejmuje cykl życia i realizację, sekcja 9 — integrację z Inventory.

### Order jako oś koordynacji

Order to miejsce, w którym spotykają się i zazębiają procesy: wycena, rezerwacja zasobów,
płatności, rozliczenia, autoryzacje, fulfillment, notyfikacje, anulowania i kompensacje.
Order nie wie, jak działa API płatności, jak wygląda wysyłka, jak wysłać SMS, jak utworzyć
konto — wie tylko, **czy** dana rzecz ma się wydarzyć, **kiedy** i **dlaczego**. Dzięki temu
jest stabilnym rdzeniem biznesowym: zmiana kuriera, bramki płatniczej czy providera SMS
jest dla niego niewidoczna.

Order jako **agregat koordynujący**: przyjmuje decyzję klienta (co, ile, z jakimi cechami),
wyzwala procesy operacyjne (wycena, rezerwacje, płatności, fulfillment), śledzi status
(rezerwacje wykonane? płatność przeszła? realizacja w toku?), zarządza cyklem życia.
Zasada: **Order koordynuje, ale nie wykonuje** — przy CONFIRMED może zażądać od
InventoryService zatwierdzenia rezerwacji, od PaymentService płatności, od FulfillmentService
startu realizacji, od NotificationService powiadomień; *jak* — wiedzą wyspecjalizowane
serwisy, Order wie, *że* to musi się stać *w tym momencie*.

### Maszyna stanów (bazowa)

Metafora lotniska: odprawa (DRAFT) → kontrola bezpieczeństwa (CONFIRMED) → ładowanie bagażu
(PENDING_ALLOCATION) → lot (PROCESSING) → odbiór bagażu (FULFILLED) → wyjście (CLOSED).
Na każdym etapie inne zasady — nie zmienisz bagażu po kontroli, nie wrócisz do odprawy
z pokładu. To nie arbitralna decyzja projektowa, lecz odzwierciedlenie rzeczywistości.

| Stan | Znaczenie |
|---|---|
| DRAFT | klient/proces sprzedażowy swobodnie buduje zamówienie |
| CONFIRMED | potwierdzone; cena staje się umową, zasoby blokowane |
| PENDING_ALLOCATION | oczekiwanie na alokację (waitlista, retry) |
| PROCESSING | w realizacji |
| FULFILLED | zrealizowane, oczekuje zamknięcia |
| CLOSED | zamknięte — koniec cyklu życia |
| CANCELLED | anulowane |

Przejścia bywają obwarowane warunkami; każdy stan determinuje, co z zamówieniem można zrobić.
To **baza/przykład** — realne zamówienia bywają dużo bardziej złożone. Reguła ogólna:
**im dalej w cyklu życia, tym mniej swobody i tym większe konsekwencje pojedynczej decyzji** —
świadomy wybór architektoniczny odzwierciedlający świat poza systemem.

### Operacje a stan — koszt decyzji rośnie

- **addLine()**: w DRAFT proste i tanie (nowa linia, zmiana struktury, przeliczenie ceny) —
  ale nawet najprostsza operacja nie jest lokalna: zmiana struktury wpływa na kontrakt cenowy
  (uruchamia się Pricing). W CONFIRMED to już nowa rezerwacja (może się nie udać), nowa
  płatność/dopłata, zmiana fulfillmentu (paczka może być w drodze) — pełnoprawna operacja
  biznesowa; czasem taniej złożyć nowe zamówienie.
- **removeLine()**: w DRAFT lustrzane odbicie addLine — nic nie cofamy. W CONFIRMED: zwolnij
  rezerwację w Inventory → zwróć część płatności → dopiero potem zmień strukturę i cenę.
  W PROCESSING zwykle niedozwolone — paczka w drodze = zwrot/reklamacja, zupełnie inny proces.
- **changeQuantity()**: w DRAFT proste. W CONFIRMED pełna orkiestracja: zwiększenie =
  dostępność + dodatkowa rezerwacja + nowa wycena + dopłata; zmniejszenie = częściowe
  zwolnienie rezerwacji + częściowy zwrot + nowa wycena. Order **zna kolejność działań,
  nie ich implementację** (Inventory umie zwolnić część rezerwacji, Payment umie partial
  refund — Order wie, że w tej kolejności).
- **confirm()**: często najważniejsza operacja — cena staje się umową, zasoby blokowane,
  powstaje zobowiązanie finansowe i fulfillmentowe. Spotykają się niemal wszystkie procesy
  (Inventory, Payment/Billing, Fulfillment, Notification); porażka któregokolwiek = cofanie
  poprzednich kroków — klasyczny moment na **Sagi i transakcje kompensujące**; decyzja
  o kolejności i odpowiedzialności leży po stronie Order.
- **cancel()**: najlepiej pokazuje wpływ stanu na semantykę. DRAFT: ustaw status i tyle.
  CONFIRMED/PROCESSING: anulowanie = **proces kompensacyjny** (zwolnienie zasobów, zwrot
  pieniędzy, zatrzymanie realizacji, komunikacja z klientem). FULFILLED: anulowanie zwykle
  niemożliwe — zamiast tego Return / Complaint / Refund Flow, zupełnie inne procesy.
- **Sygnały z zewnątrz**: czasem procesem steruje nie użytkownik, lecz realizacja — Order
  przyjmuje informację, aktualizuje stan, np. reaguje notyfikacją. Nie wykonuje fulfillmentu —
  **rejestruje fakt**.

### Order na granicy dwóch światów

Order to nie rekord zmieniający pola, lecz **agregat procesowy**: spotykają się w nim reguły
spójności, decyzje biznesowe i długotrwałe procesy rozproszone. Z jednej strony chroni
niezmienniki **natychmiastowo spójne** (nie dodasz linii w złym stanie, nie zmienisz ilości
po zamknięciu, nie anulujesz w pełni zrealizowanego) — reguły twarde, lokalne, atomowe:
operacja albo spełnia warunki, albo błąd i brak zmian. Z drugiej strony **uruchamia procesy
poza własnym światem** (rezerwacje, obciążenia/zwroty, start/stop fulfillmentu, notyfikacje) —
nieatomowe, nienatychmiastowe, zawodne: Inventory może nie mieć zasobu, płatność się nie udać,
fulfillment utknąć, notyfikacja spóźnić się lub nie dotrzeć. To nie błędy modelu — to
rzeczywistość systemów rozproszonych.

Dlatego Order **podejmuje decyzję, ustala kolejność kroków, zapisuje fakt biznesowy
i deleguje wykonanie**. Jest granicą między światem strong consistency (ochrona reguł
i danych) a światem eventual consistency (procesy dogadujące się w czasie). Praktyczne
wymagania: **Saga** (koordynacja i cofanie kroków), **Outbox Pattern** (bezpieczna publikacja
zdarzeń), **idempotentność i retry** po stronie integracji, **monitoring i obserwowalność**
(błędy nieuniknione). Order nie jest ani czystym bytem danych, ani workflow — jest **punktem
prawdy biznesowej**: chroni sens zamówienia i inicjuje procesy, które ten sens materializują.

### Fulfillment — stan realizacji bez mechaniki

W pewnym momencie zamówienie opuszcza świat decyzji i wchodzi w świat realizacji (paczka
w magazynie, usługa w kalendarzu, konto w systemie zewnętrznym, SMS w kolejce) — wszystko
poza Orderem. Order nie realizuje fulfillmentu, ale **musi wiedzieć, co się z nim dzieje**:
by przejść do FULFILLED, wiedzieć kiedy zamknąć, reagować na błędy i wyjątki, informować
klienta o postępie. Trzyma więc **stan realizacji, nie mechanikę realizacji** — nie status
paczki, lecz stan realizacji zamówienia jako całości, niezależnie od formy (wysyłka,
aktywacja, rezerwacja terminu, wiadomość).

Ten enum nie musi być idealny ani kompletny; w realnych systemach linie mają różne statusy
(część fulfillmentu szybsza, część wolniejsza) — **status zamówienia jest agregatem statusów
linii**; na poziomie Order interesuje nas jedno: czy zamówienie zostało zrealizowane
**w sensie biznesowym**. Informacje przychodzą z zewnątrz (fulfillment, workflow, integracja);
Order nie inicjuje tej operacji i nie wie, co dokładnie się wydarzyło — rejestruje fakt
i decyduje na poziomie stanu.

Fulfillment ≫ e-commerce — dostarczenie paczki to szczególny przypadek. Mapa przykładowa:
produkt fizyczny → wysyłka (magazyn); produkt cyfrowy → wysłanie linku / aktywacja konta
(dedykowana usługa); produkt usługowy → rezerwacja terminu albo wykonanie usługi (masaż,
badanie); **notyfikacja jako produkt** (częsta prawda w instytucjach finansowych) → SMS/mail;
założenie konta → utworzenie + nadanie dostępów, poprzedzone weryfikacją AML. Order tej mapy
nie zna — widzi sygnał: realizacja się zaczęła / trwa / zakończyła / nie udała. **Order
opisuje sens biznesowy; Fulfillment — mechanikę wykonania.** Rozdzielenie zamówienia od
fulfillmentu ma dalsze korzyści (moduł "Plan vs Wykonanie").

### Płatności — różne modele finansowe, ten sam Order

Integracja "przez kontrakty i decyzje". Przykłady: (1) płatność natychmiastowa — decyzja
prosta: bez pieniędzy nie ma zamówienia (szczegóły bramek pominięte, chodzi o ideę);
(2) B2B — płatność nie przy składaniu, zależna od aktywności klienta, wolumenów itd.:
**orkiestracja** (Order rejestruje rekord billingowy w usłudze zewnętrznej) albo — zwłaszcza
gdy na billing wpływa wiele elementów — **podejście zdarzeniowe** (Order emituje zdarzenie,
billing nasłuchuje i reaguje; Order może nasłuchiwać zdarzeń płatności, by zmienić swój stan).
Wniosek: archetypu nie można traktować jako kodu pasującego do każdego biznesu. **Stabilna
i powtarzalna część**: podstawowa struktura zamówienia + integracja z produktami, cennikami
i Inventory. **Cała reszta to "sos"** — procesy, którymi biznes polewa stabilny model; model
ma umożliwiać dostosowanie do złożoności procesowej, niezależnie czy wybierzemy orkiestrację
czy choreografię.

---

## 9. Relacja Ordering z Inventory (L07)

### Podział odpowiedzialności

Klasyczne modele (Enterprise Patterns and MDA) opisują relację zamówienia ze światem
fizycznym kaskadą zdarzeń (wysyłka, odbiór, zwrot, odrzucenie, korekta) — Order zaczyna żyć
życiem operacyjnym i stopniowo zamienia się w system zarządzania magazynem, logistyką
i dostępnością. **To nie jest rola Orderingu.** Ordering to archetyp **kontraktu
i orkiestracji**: opisuje, co zamówiono, w jakiej ilości, na jakich warunkach i na jakiej
podstawie biznesowej; utrwala decyzje cenowe, kontraktowe, organizacyjne; integruje moduły,
nie przejmując ich odpowiedzialności.

- **Inventory**: zna zasoby, dostępność, rezerwacje, alokacje, blokady czasowe, pule, limity.
  **Nie zna zamówień w sensie biznesowym** — zna tylko pytanie "czy mogę przydzielić zasób
  o takich parametrach".
- **Product**: katalog definicji — opis produktów, cech i **metadanych mówiących, jak produkt
  zachowuje się w relacji z Inventory** (strategia alokacji, polityka braku dostępności).
- **Ordering**: cienka warstwa orkiestracji — pyta Product o metadane, Pricing o cenę,
  Inventory o alokację; sam nie liczy, nie rezerwuje, nie decyduje o dostępności. To
  rozdzielenie pozwala jednemu modelowi Order działać w bankowości, logistyce, healthcare,
  cloudzie i e-commerce.

### Nie ma jednego momentu alokacji

Zakupy z dostawą: klient najpierw wybiera slot, potem składa zamówienie. Wizyta u lekarza:
zasób przydzielany przy potwierdzaniu. E-book: alokacja zbędna. Lot balonem u partnera:
najpierw zamówienie i voucher, rezerwacja to inny proces. To, **czy i kiedy** alokować, może
zależeć od produktu albo różnić się między procesami/kanałami — strategię umieszczamy tam,
gdzie jest prawdziwa dla nas; **najczęściej w archetypie Product**. To ProductType mówi
Orderowi, czego się spodziewać — **Ordering nie zgaduje i nie wprowadza wyjątków**.

### Cztery strategie alokacji (AllocationStrategy)

| Strategia | Mechanika | Przykłady |
|---|---|---|
| **PRE_ALLOCATED** | rezerwacja musi istnieć **przed** zamówieniem; Ordering nie inicjuje alokacji — weryfikuje i finalizuje istniejącą. Flow: rezerwacja w Inventory → Order z referencją do rezerwacji w specyfikacji linii → przy confirm() sprawdzenie, czy rezerwacja obowiązuje → commit; po timeoucie Inventory odrzuca. Kontrakt "masz rezerwację albo nie masz zamówienia" | sloty kurierskie, bilety z ograniczoną pulą |
| **ORDER_DRIVEN** | zasób nie jest rezerwowany wcześniej; alokacja przy **potwierdzaniu**. Ordering przekazuje preferencje, Inventory decyduje; rezultat zależy od AllocationPolicy: sukces → CONFIRMED + specyfikacja wzbogacona o konkretny slot; WAITLIST → linia na listę oczekujących, Order w PENDING_ALLOCATION; REJECT → confirm kończy się wyjątkiem. Ordering inicjuje proces, ale nie zawiera logiki dostępności | wizyta u lekarza, konto bankowe |
| **EXTERNAL** | Inventory nie jest źródłem prawdy — rezerwacja w systemie partnera; Ordering co najwyżej obsługuje płatność/formalną stronę umowy. Zamówienie może istnieć lub nie — zależnie czy pełni rolę kontraktu finansowego czy informacyjnego | usługi partnerów zewnętrznych |
| **NONE** | brak alokacji; confirm() w ogóle nie komunikuje się z Inventory (walidacja i Pricing nadal działają) | e-booki, produkty cyfrowe, usługi generyczne |

Strategie można **mieszać w jednym zamówieniu** (przykład logistyczny z dostawą i montażem:
jedna linia prealokacja, druga alokacja przy confirm, trzecia na waitlistę). Ordering traktuje
je jednolicie — różnice wynikają wyłącznie z metadanych produktu i decyzji Inventory. Ten sam
protokół działa w bankowości (otwieranie kont), telekomunikacji (przenoszenie numeru),
ochronie zdrowia (wizyty). Zmienia się domena, nie protokół.

### Polityki braku dostępności (AllocationPolicy)

Brak zasobu nie zawsze oznacza porażkę — i to również **polityka produktu**, nie decyzja
Orderingu:

| Polityka / wzorzec | Zachowanie | Przykład |
|---|---|---|
| Twarde odrzucenie | brak zasobu = koniec procesu; rezerwacja przed utworzeniem zamówienia; Inventory zwraca rezerwację albo brak; UI od razu informuje o niedostępności; Ordering nie ma trybu oczekiwania — kontrakt nie może powstać | loty samolotem |
| Rezerwacja z wygaśnięciem | czasowa blokada na warunkach: Inventory zwraca rezerwację z expiry; Order z referencją musi być potwierdzony przed upływem; confirm po expiry → odrzucenie, miejsce wraca do puli; **logika timeoutu w Inventory**, Ordering tylko reaguje na wynik walidacji | bilety na koncert |
| WAITLIST | brak dostępności = sygnał oczekiwania: Order niesie preferencje bez pre-rezerwacji; Inventory raportuje "nie przydzielono, ale na liście oczekujących"; Order → PENDING_ALLOCATION; gdy zasób się zwolni, **Inventory inicjuje ponowną próbę**, Order może zostać potwierdzony automatycznie | wizyty u specjalistów w ochronie zdrowia |
| RETRY | środowiska dynamiczne — zasoby pojawiają się i znikają; Order przyjęty, alokacja stopniowa, stan PENDING_ALLOCATION; **retry harmonogramowany przez Ordering**, nie Inventory | cloud computing |
| Auto-rozszerzenie puli | najbardziej liberalna: zasób można automatycznie zwiększyć | cloud storage, pule numerów kont bankowych |

### Język zasobów i kontrakt InventoryService

Kluczem integracji jest **język zasobów**: Inventory nie zna domeny — nie wie, czym jest
lekarz, kurier czy konto bankowe. Zna zasoby opisane generycznie: ResourceType, ResourceId,
parametry dostępności (czas, miejsce, duration, ilość). OrderLineSpecification jest celowo
prostą mapą klucz–wartość — **nośnikiem intencji alokacyjnej**, nie modelem domenowym zasobu.
UI i proces biznesowy **tłumaczą język domeny na język zasobów**; Inventory odpowiada
wyłącznie w tym języku — dzięki temu jedno Inventory obsługuje różne branże bez zmiany
kontraktu.

Kontrakt — interfejs **InventoryService**: nie zna pojęć domenowych, operuje językiem zasobów
i decyzjami z zewnątrz. Ordering nie mówi *jak* alokować — mówi, **czego potrzebuje i jaką
politykę zastosować**. Centralny punkt: **AllocationRequest** — niesie pełny kontekst
alokacji; (1) **AllocationPolicy przekazywana jawnie** (Inventory nie zgaduje: reject,
waitlist czy retry); (2) kontekst to generyczna mapa z danymi zebranymi z UI, produktu
i specyfikacji — Inventory nie interpretuje ich semantyki, jedynie używa. Odpowiedź —
**AllocationStatus**: stan alokacji z perspektywy linii lub zamówienia. **Inventory nie
ustawia statusu zamówienia** — raportuje wynik próby; decyzja zawsze należy do Orderingu.

### Flow przy confirm()

Moment spotkania świata zamówienia ze światem zasobów to najczęściej zatwierdzanie: walidacja
ceny → walidacja wymagań alokacyjnych → próba alokacji wg AllocationStrategy
i AllocationPolicy → decyzja na podstawie AllocationStatus. Kod jest prosty, bo złożoność
wypchnięto do Inventory — i **nie zmienia się między branżami** (bankowość, logistyka,
healthcare, cloud); zmieniają się dane wejściowe: strategia produktu, polityka alokacji,
kontekst zasobów.

Ordering jest **driverem**: inicjuje wycenę, inicjuje alokację, decyduje o stanie zamówienia —
bez logiki pricingowej i magazynowej. Product reaguje metadanymi (kiedy alokować, jaka
polityka), Inventory implementuje polityki i mechanizmy dostępności, Pricing liczy ceny
i buduje breakdowny, Ordering spina wszystko w spójną historię biznesową. Efekt: jeden
stabilny archetyp działający w każdej domenie; zmienność biznesowa nie rozlewa się po
systemie, lecz jest zlokalizowana; Ordering pozostaje cienką warstwą, ciężka logika żyje
w wyspecjalizowanych modułach — system rośnie bez przepisywania fundamentów.

---

## 10. Ordering w architekturze systemu (L08)

### Ordering na końcu, nie na początku

W dojrzałych systemach Ordering **nie powinien być pierwszym projektowanym elementem** —
ma sens, gdy capabilities są wydzielone: Product, Pricing, Inventory, Party, Accounting.
Powód: ogrom odpowiedzialności zamówienia. W małym systemie (1–2 typy produktów) naiwny
model przejdzie; w dużym (setki/tysiące typów produktów, komponenty wspierające rozliczenia
i księgowość, złożone polityki cenowe, setki tysięcy zasobów współdzielonych przez tysiące
użytkowników, śledzenie przepływu wartości w czasie) naiwny model to "gwóźdź do trumny".
Gdyby fundamentów nie wydzielono, wiedza by nie zniknęła — **wyciekłaby do Orderingu**
(reguły cenowe, polityki dostępności, wyjątki inwentarzowe, obejścia operacyjne): Order
stałby się mózgiem wszystkiego i wąskim gardłem ewolucji. Z fundamentami Ordering jest
**koordynatorem gotowych klocków**.

### Ordering jako downstream; komendy, nie eventy

W strategicznym DDD: upstream = właściciel API, dostawca funkcji i danych; downstream =
konsument. **Ordering pełni rolę downstream** wobec Product, Pricing, Inventory, Party,
Accounting — i to układ **pożądany**: to Ordering zależy od ich modeli i koordynuje ich
wykorzystanie. Zależność polega przede wszystkim na **wysyłaniu komend, nie eventów** —
zdarzenia odwracają zależność, a żaden obszar upstreamowy nie musi wiedzieć (do spełnienia
swoich reguł), że jest używany w Orderingu, w AML czy w raportach. Ordering może odpytywać
i może **reagować na zdarzenia** upstreamów (np. upewniając się, że zasób udało się
zarezerwować). Korzyść strategiczna: zrównoleglenie prac, mniejsze obciążenie kognitywne
zespołów, wyższa wydajność wytwórcza i operacyjna.

### Granice dobrego działania

Ordering działa dobrze, gdy: jeden dominujący proces biznesowy (np. rezerwacja samochodów),
produkty o podobnym cyklu życia, względnie jednolity fulfillment. Problemy: wiele
fundamentalnie różnych procesów w jednym systemie, produkty wymagające radykalnie innego
wykonania, fulfillment wieloetapowy i rozproszony. Przykład telco: abonament + telefon +
przeniesienie numeru w jednym zamówieniu = fulfillment cyfrowy (aktywacja w billingu,
konfiguracja sieci, plan taryfowy) + fizyczny (dostępność, rezerwacja, wysyłka, tracking,
zwroty) + proceduralno-zewnętrzny (integracje międzyoperatorowe, okna czasowe, regulacje,
dni trwania). **To nie warianty jednego procesu — to trzy procesy, które przypadkiem spotkały
się w jednym zamówieniu.**

### Trzy warianty koordynacji fulfillmentu

1. **Order wie wszystko** — iteruje po liniach i wykonuje odpowiednie wywołania per linia.
   Zaskakująco skuteczne w małych, stabilnych systemach: wszystko w jednym miejscu, debug =
   jedna klasa, przepływ czytelny i deterministyczny. Wraz z rozwojem oferty (eSIM, roaming,
   usługi dodane) przybywają gałęzie logiki; Order kumuluje wiedzę o billingach, magazynach,
   regulacjach i wyjątkach. To jeszcze nie błąd — to **świadomy awareness trade-off** —
   ale Order przestaje być koordynatorem, a staje się mózgiem wszystkiego.
2. **Router + handlery** — Order nadal iteruje po liniach, ale nie wie, co znaczą operacyjnie;
   deleguje do routera, który wybiera handler po ProductType. Nowy produkt = **nowy handler
   + wpis w konfiguracji, bez zmiany Ordera**; jawna mapa zamiast warunków. Dobre dla systemów
   rosnących z ofertą (handler = osobna klasa, często osobny deployment i cykl życia; Order
   i routing stabilne). Nowy punkt rozszerzalności: interfejs **FulfillmentHandler** jako
   kontrakt architektoniczny — i nowa klasa problemów: kto zarządza rejestrem, kiedy
   rejestracja, co gdy handler nie odpowiada/awaria; debug wymaga śledzenia przez router
   i implementacje. Naturalnie prowadzi do **architektury pluginowej**: rejestr konfigurowalny
   (pliki, baza, Service Discovery) + stabilny kontrakt = dynamiczne odkrywanie i rejestracja
   handlerów; Ordering jako jądro platformy, Fulfillment jako ekosystem rozszerzeń; zespoły
   dostarczają handlery jako osobne serwisy (à la Service Registry). Uwaga: **komenda ≠
   synchronicznie** — to kwestia implementacji; handler może też konsumować zdarzenia.
   Granica stosowalności: fulfillment relatywnie szybki i przewidywalny.
3. **Zdarzeniowo (choreografia)** — zmiana paradygmatu: Order przestaje sterować
   fulfillmentem; jego odpowiedzialność **kończy się w momencie potwierdzenia**. Od tej pory
   jedynie komunikuje fakt ("zamówienie potwierdzone, oto dane"); billing aktywuje abonament,
   magazyn rezerwuje i planuje wysyłkę, orkiestrator MNP startuje długotrwały proces — każdy
   we własnym tempie, wg własnych reguł i cyklu życia. Konsekwencje:
   - **Zależności poznawcze odwrócone**: to nie Order zna fulfillment — fulfillment zna
     kontrakt zdarzenia OrderConfirmed; każdy handler interpretuje "co znaczy potwierdzenie
     w moim kontekście"; wiedza procesowa rozprasza się; znika centralny punkt widoczności
     procesu.
   - **Spójność**: Order jest CONFIRMED natychmiast po publikacji, fulfillment trwa; **nie ma
     jednej prawdy o stanie realizacji** — Order mówi "potwierdzone", nie wie, czy billing
     skończył, magazyn zarezerwował, MNP ruszyło. Trzeba zaakceptować spójność końcową +
     mechanizmy: śledzenie stanu realizacji, korelacja zdarzeń, Sagi.
   - **Skąd Order wie, co się stało**: wariant A — fulfillment publikuje własne zdarzenia,
     Order słucha i aktualizuje stan; koszt: Order musi znać wszystkie typy zdarzeń wszystkich
     obszarów — wiedza procesowa wraca tylnymi drzwiami, zależności dwustronne przez kontrakty
     zdarzeń. Wariant B — fulfillment wysyła **jawne komendy do Orderingu** o zakończeniu
     etapu; zależność jednokierunkowa, ale koordynacja rozprasza się po handlerach (każdy
     musi wiedzieć, kiedy i jak powiadomić). **W obu wariantach coupling nie znika — zostaje
     przesunięty i rozproszony**; to cena pełnego oddzielenia i asynchroniczności.
   - **Obserwowalność**: "gdzie utknęło moje zamówienie" przestaje mieć prostą odpowiedź —
     choreografia przez wiele komponentów; bez identyfikatorów korelacyjnych, centralnych
     logów i distributed tracing debug staje się zgadywaniem.
   - **Eventy vs komendy to wzorce logiczne, nie decyzje techniczne**: zdarzenia można
     obsługiwać synchronicznie, komendy przesyłać asynchronicznie bez kolejki; wybór modelu
     zdarzeniowego ≠ automatycznie asynchroniczna implementacja.
   - Sens przede wszystkim tam, gdzie fulfillment należy do różnych zespołów w odrębnych
     bounded contextach: rozproszenie wiedzy akceptowalne, nowy produkt = nowy handler i nowa
     subskrypcja bez ruszania Orderingu (nadal sprzężenie — przez stabilny kontrakt zdarzenia).
     Zysk: pełne oddzielenie zamówienia od wykonania, niezależna ewolucja fulfillmentu,
     naturalne wsparcie długotrwałych procesów. Koszt: złożoność infrastrukturalna,
     trudniejszy debug, świadome zarządzanie spójnością końcową; wymaga dyscypliny
     architektonicznej i operacyjnej.

Ewolucja odpowiedzialności: **na początku Order wykonuje, potem deleguje, na końcu jedynie
ogłasza fakt biznesowy, a reszta systemu reaguje.** Dlatego Ordering ma największy sens, gdy
pozostałe archetypy są wydzielone — inaczej cała ta złożoność wylądowałaby w Orderze.

### Wiele fundamentalnie różnych "Orderingów" — przykład bankowy

Bank: kredyt hipoteczny (20–30 lat życia, transze, amortyzacja, zabezpieczenie hipoteczne,
credit scoring), transakcja FX (niemal natychmiast, kursy real-time, ryzyko rynkowe, ścisłe
AML), lokata terminowa (okres zapadalności, odsetki w czasie, prolongata, kary za zerwanie).
Z perspektywy klienta wszystkie to zamówienia (wniosek → potwierdzenie warunków → oczekiwanie
na realizację); z perspektywy architektury — zupełnie różne byty (czas trwania, rozliczenia,
ryzyko, regulacje, domykanie wartości). Cztery opcje architektoniczne:

| Opcja | Mechanika | Zalety | Koszty / ryzyka | Dla kogo |
|---|---|---|---|---|
| **Biblioteka współdzielona** | generyczne Order/OrderLine/OrderStatus w bibliotece; każdy obszar rozszerza własną logiką | brak duplikacji pojęć | "co naprawdę jest generyczne?": pole collateralAddress kredytów ciąży FX; aktualizacja biblioteki wymusza migracje u innych; miejsce negocjacji i tarć, efekt domina, piekło wersjonowania (kto na kogo czeka); abstrakcja obrasta cudzymi przypadkami brzegowymi i przecieka; nawet jeden zespół-właściciel nie usuwa skutków **sprzężenia binarnego** | małe organizacje, zespoły blisko siebie, procesy naprawdę podobne |
| **Pełna separacja** | każdy obszar ma własny Ordering; start z tego samego szablonu, dalej niezależnie | ogromna autonomia (prolongata bez pytania o zgodę, zmiana settlementu bez oglądania się, deploy kiedy chcę); każda domena optymalizuje pod siebie | ten sam błąd w trzech miejscach; dobre rozwiązania nie migrują; różne kształty i API; operacyjnie trudno: monitoring, audyty regulacyjne, raporty ryzyka i aktywów wymagają integracji kilku systemów | duże systemy rozproszone — **autonomia zespołów ważniejsza niż duplikacja kilobajtów kodu** |
| **Platforma z pluginami** | centralny serwis Ordering: wspólny rdzeń (flow, integracja z Pricing/Inventory, model statusów) + punkty rozszerzeń; produkty dostarczają pluginy (scoring, settlement, odsetki) | standaryzacja + rozszerzalność | API rozszerzeń = kontrakt wymagający koordynacji każdej zmiany; zespół centralny jako strażnik platformy; ryzyko akumulacji wiedzy biznesowej w centrum ("dla kredytów tak, dla FX inaczej") — platforma przecieka | organizacje średniej wielkości gotowe płacić za centralne zarządzanie i dojrzałość architektoniczną |
| **Fasada nad niezależnymi Orderingami** | każdy produkt ma własny Ordering; na zewnątrz jedno ujednolicone API — cienka fasada robiąca tylko routing | spójny UX przy pełnej autonomii; **niezależność wdrożeń** — bez globalnych release trainów | fasada musi znać wszystkie implementacje albo mieć Service Registry; dylemat: API naprawdę ujednolicone (fasada transformuje i puchnie) czy maskujące różnice (abstrakcja przecieka do klientów) | organizacje chcące oddzielić architekturę wewnętrzną od doświadczenia klienta |

Wniosek: przy wielu fundamentalnie różnych procesach **nie istnieje jeden idealny Ordering**.
Każda architektura to świadomy kompromis: autonomia vs spójność, prostota vs elastyczność,
centralizacja vs skala organizacyjna. Kluczowe pytanie nie brzmi "które najlepsze", lecz
**"czy rozumiesz, gdzie płacisz koszt i czy organizacja jest na niego gotowa"**.

### Integracje z poszczególnymi archetypami — zestawienie

| Archetyp | Co daje Orderingowi | Jak Ordering z niego korzysta |
|---|---|---|
| **Product** | definicję "co może być przedmiotem zlecenia" (operacyjnie, nie marketingowo); ProductType/PackageType jako kontrakt semantyczny i API kontraktowe; strategię śledzenia; strategię alokacji i tryb realizacji; warunki stosowalności (applicability) | OrderLine wskazuje ProductType przez id; specyfikacja ma semantykę z definicji typu; Ordering zbiera ApplicabilityContext i przekazuje do Product do weryfikacji; Product wybiera cennik |
| **Pricing** | cena jako funkcja i kompozycja decyzji ("nie tylko ile, ale dlaczego tyle, dla kogo, w jakich warunkach, z jakimi komponentami"); Component Breakdown; reguły zaokrągleń, walut, podatków | Ordering buduje PricingContext, wywołuje Pricing, zapisuje wynik (unit+total+breakdown) jako niepodważalny fakt/snapshot; cennik FIXED-PRICE dla cen arbitralnych |
| **Inventory** | odpowiedź "czy możemy zrealizować": zasoby, terminy, przepustowość, ludzie, licencje, limity; semantyka mieć/zarezerwować/przydzielić; waitlisty (jako biblioteka/fork dla kolejkowania zleceń) | AllocationRequest w generycznym języku zasobów + jawna AllocationPolicy; Inventory raportuje AllocationStatus, Ordering decyduje o stanie zamówienia; blokuje zasoby na własne potrzeby, nie zarządza nimi |
| **Party** | porządek w podmiotach, rolach, relacjach ("klient to za mało"); podstawa decyzji, autoryzacji, odpowiedzialności; RoleRequirements i Capabilities | PartyInRole + snapshoty danych; polityki walidacji ról; weryfikacja Capabilities vs RoleRequirements przy confirm |
| **Accounting** | model wartości, który nie znika po zapisie: rozliczanie, śledzenie, odwracanie, audyt; spójne traktowanie pieniędzy, towarów, punktów, emisji, limitów, sald | wiele zamówień to transfer wartości — **Ordering nie liczy sald, inicjuje transakcje** |
| **Reguły (mechanizmy decyzyjne)** | drzewa reguł dla bardzo złożonych ograniczeń i rozgałęzionych procesów | redukcja obciążenia kognitywnego przy złożonych krokach procesu zlecenia |
| **Grafy** | mapowanie złożonych problemów biznesowych na rozwiązane problemy grafowe (kolorowanie, sortowanie, kliki) | narzędzie pomocnicze dla problemów procesowych |
| Payment / Billing / Fulfillment / Notification | wykonanie konsekwencji decyzji | Order żąda operacji we właściwym momencie i kolejności; orkiestracja lub choreografia; Saga + Outbox + idempotencja |

---

## 11. Cztery perspektywy (L09)

Ordering porządkuje wszelkie zamówienia i zlecenia — nie tylko procesy sprzedażowe. Wszystko,
co w archetypie Product klasyfikuje się jako produkt (wpływa na wartość i procesy operacyjne),
może być zlecane i zamawiane. Ordering to rdzeń pojęciowy, modelowy i architektoniczny do
budowania procesów biznesowych — czasem przejmuje odpowiedzialność w całości, czasem jest
częścią większego capability. Zdradza się przez język procesu (patrz sekcja 2); jeśli
w wymaganiach stale padają te sformułowania, a w kodzie widać rozjeżdżające się statusy,
flagi isConfirmed/isActive/isCancelled, logikę po wielu serwisach, brak miejsca "co się
właściwie wydarzyło" albo "bardzo wiele procesów, każdy rzecz jasna niezwykle specyficzny" —
**bardzo możliwe, że implementujesz Ordering bez Orderingu**.

| Perspektywa | Bez archetypu | Z archetypem |
|---|---|---|
| **Programistyczna** | kod odzwierciedla strukturę organizacyjną i historyczne decyzje, nie problem; każdy proces sprzedażowy żyje własnym życiem (osobna aplikacja/klasa/reguły); wniosek tu, umowa tam, aktywacja gdzie indziej — różne odsłony tego samego bez wspólnego mianownika; splątanie klas problemów; wysokie obciążenie kognitywne (programista naraz rozumie produkt, pricing, realizację, statusy, wyjątki) | jeden spójny byt opisujący proces zamówienia; odpowiedzialności się rozdzielają: Product przestaje udawać proces, Pricing przestaje przechowywać historię decyzji, Inventory nie musi wiedzieć dlaczego zarezerwowano; Ordering składa elementy w całość; czytelniejszy kod, niższe obciążenie — każdy archetyp robi jedną rzecz dobrze |
| **Architektoniczna** | sieć połączeń między niezależnymi procesami "dogadującymi się po fakcie"; trudna integracja; dublowana logika; energia architektów idzie na łączenie wniosków z rozproszonych źródeł prawdy; spójność przez ręczne uzgodnienia, retry'e, rekoncyliacje, procesy naprawcze | centralny punkt koordynacji zamówień i zleceń — nie techniczny monolit, lecz **semantyczne centrum ciężkości**; jasne granice odpowiedzialności archetypów; zespoły Product/Pricing/Inventory/Accounting pracują niezależnie, bo koordynacja procesowa jest w Orderingu; architektura porządkuje się wokół odpowiedzialności, nie przypadkowych integracji |
| **Biznesowa** | chaos: obsługa klienta bez pełnego obrazu sprawy; ofertowanie sztywne i kosztowne; IT gasi pożary zamiast rozwijać; każda zmiana oferty/procesu = głęboka ingerencja w wiele systemów naraz — spowolnienie i ryzyko błędów | pełna historia i kontrola procesu sprzedaży; oferty konfigurowalne, łączone i modyfikowane bez naruszania fundamentów; większa autonomia obszarów w ramach wspólnego stabilnego modelu; rośnie wydajność wytwórcza IT i operacyjna organizacji — mniej koordynacji, więcej realnej wartości |
| **Analityczna** | analiza kosztowna i nieskalowalna; reguły i wyjątki zaszyte w implementacjach; każdy nowy system/produkt = osobne tłumaczenie raportów i modeli; analityk dopasowuje się do rozwiązań technicznych zamiast operować na pojęciach domenowych; "analiza jako archeologia systemu" | jasny, formalny opis procesu i wariantów; praca na gotowym modelu: zamówienie, stan, przejście, decyzja; powtarzalne modele analityczne niezależne od produktu i kanału; analiza jako świadome narzędzie decyzji |

Domknięcie: Ordering **nie jest archetypem od wszystkiego** i nie jest tak uniwersalny jak
Product/Pricing/Inventory/Accounting (fundamentalne fakty o świecie: co sprzedajemy, za ile,
w jakiej ilości, jak rozliczamy). Działa na innym poziomie — **nie opisuje rzeczy ani
zasobów, tylko ruch pomiędzy nimi**; archetyp procesu, decyzji, sekwencji zdarzeń. Wartość:
pokazuje, jak spinać archetypy w spójną całość — produkty, wyceny, zasoby i rozliczenia
przestają być luźnym zbiorem integracji, a tworzą czytelny proces z historią, stanami
i odpowiedzialnościami. Ordering **nie zastępuje archetypów — koordynuje je**; daje wspólny
język, punkty odniesienia i miejsce, w którym widać, co się wydarzyło, dlaczego i co powinno
wydarzyć się dalej. Jeśli pozostałe archetypy odpowiadają "co mamy i jakie są reguły świata",
Ordering odpowiada "**jak organizacja z tych reguł korzysta w czasie**" — kluczowy tam, gdzie
procesy są złożone, a biznes oczekuje elastyczności zamiast wyjątków i ręcznie sklejanych
integracji.

---

## 12. Typowe błędne implementacje i ich konsekwencje

| Anty-wzorzec | Opis | Konsekwencje |
|---|---|---|
| **Dokument + enum statusów ("obieg dokumentów")** | zlecenie jako "dokument z tytułem" i statusami utworzony/zweryfikowany/zaakceptowany/odrzucony/anulowany + checkboxy (kto płaci) | bardzo drogi sposób na nieusłyszenie biznesu; gubi produkt, cenę, dostępność, waitlistę, role, billing; każde nowe wymaganie (płatność punktami, limit operacyjny, obowiązywanie od jutra) "wywala wszystko" i rodzi pomysły w stylu "napiszmy własny finance engine" |
| **Encja domenowa zamiast zlecenia** | konto/paczka/wizyta modelowane wprost, choć "senior developer wie, że to też zlecenie jego założenia"; brak wymiaru procesowego w modelu | logika koordynacji rozmywa się; model nie sugeruje, że zachodzi zamawianie; duplikacja wzorca pod innymi nazwami w każdej domenie |
| **Klasa/serwis-omnibus** | Order, który sam sprawdza dostępność, pobiera płatność, uruchamia wysyłkę | splątanie odpowiedzialności; Order staje się systemem magazynowym/płatniczym; zmiana kuriera czy bramki dotyka modelu domenowego |
| **Oferta jako flagi boolean** | creditCard=true → creditCardType → creditCardLimit → creditCardPromoApplied | każda zmiana oferty = zmiana modelu + migracja + deployment; oferta ewoluuje szybciej niż model; brak kompozycyjności; reguły flag rozlane po kodzie |
| **Parametry wykonania poza systemem** | treść zlecenia w mailach, notatkach, komentarzach, telefonach ("note-driven" systemy finansowe na CRM) | utrata kontekstu; brak automatyzacji i planowania; konflikty "ustalaliśmy" vs "w systemie nie ma"; brak danych do decyzji |
| **Jedno userId** | ID tego, kto kliknął "kup", jako jedyny uczestnik | powiadomienia/faktury/raporty do złych podmiotów; zamieszanie u wykonawcy; problemy RODO; niewykonalne raporty per płatnik |
| **Role jako kolejne pola** | buyerId, payerId, receiverId... dodawane w miarę potrzeb | działa tylko przy kilku stabilnych rolach; nowa rola = zmiana modelu + migracja + if-y |
| **Referencja do żywego rekordu podmiotu** | brak snapshotu danych uczestnika | zamówienie "aktualizuje się wstecz" po zmianie danych klienta; brak kontekstu historycznego dla audytu i reklamacji |
| **Cena = jedna liczba, znana od razu** | totalAmount w encji; null/0 dla braku | brak źródła ceny (reklamacje, audyt); brak wyceny odroczonej (null sieje błędami); brak śladu "dlaczego tyle"; niespełnione wymogi regulatora i księgowości |
| **Linia wskazuje egzemplarz** | OrderLine z numerem seryjnym/instancją zamiast typu | nie działa dla produktów tworzonych na żądanie; bez sensu dla masowych; zabija optymalizację realizacji (magazyn, FEFO/FIFO) |
| **Rezerwacja utożsamiona z zamówieniem** | założenie, że każde zamówienie blokuje zasób | model nie obsługuje voucherów, wyceny odroczonej, rezerwacji późniejszej/warunkowej |
| **Logika oferty/realizacji w procesie** | reguły produktów, wariantów, wyceny zakodowane w kodzie procesu | zmiana oferty = zmiana procesu; sztywność; eksplozja modeli |
| **Pięć linii biznesowych = pięć Orderów pisanych od zera** | brak wspólnego szkieletu pojęciowego | duplikacja logiki statusów/przejść/anulacji/współbieżności; brak przenoszalności rozwiązań; błąd poprawiany w pięciu miejscach |
| **Zakup BPMS "na wszystko"** | systemy obiecujące automatyzację procesów | "zabijają wydajność wytwórczą i operacyjną, wiążą ręce firmy na lata i drenują konta" |
| **ChargeLine/TaxOnLine/DiscountEvent (EP&MDA)** | linie cenowe i model zniżek wewnątrz Orderingu | odpowiedzialność za wyceny przerzucona na Ordering; niejawne modelowanie produktów/cen; monolit; brak elastyczności (podatek i zniżka mają model, prowizja nie) |
| **Ordering projektowany jako pierwszy** | "zróbmy najpierw zamówienia, to serce biznesu" | lawina pytań, próba rozwiązania wszystkiego naraz; wiedza o cenach/dostępności/wyjątkach wycieka do Orderu — mózg wszystkiego, wąskie gardło ewolucji |
| **Weryfikacje powielane w Orderingu** | np. zgodność jednostki z typem produktu sprawdzana i w Orderingu, i w katalogu, i w Inventory | brak wartości; duplikacja reguł, które mają właściciela gdzie indziej |

---

## 13. Mapowanie: pojęcie domenowe → element archetypu

| Pojęcie domenowe / sygnał | Element archetypu |
|---|---|
| zamówienie, zlecenie, wniosek, zgłoszenie, rezerwacja-intencja, zapis na... | **Order** (identyfikowalny agregat z cyklem życia) |
| pozycja, element zamówienia, "laptop x2", badanie w pakiecie | **OrderLine** (produkt-typ + ilość + specyfikacja + cena) |
| "jaki kolor/pamięć/waluta/pakiet/oddział", "ten konkretny VIN", "u tego lekarza o 15:00" | **OrderLineSpecification** (kryteria wyszukiwania / parametry utworzenia / wskazanie instancji / zasób+slot / wybór komponentów paczki) |
| preferencje "jak realizować" (nie "co") | wpisy specyfikacji z konwencją (np. prefiks `_`) |
| to, co zamawiamy (klasa rzeczy/czynności) | **ProductType** (kontrakt semantyczny; API kontraktowe) |
| zestaw: konto+karta+ubezpieczenie, laptop+mysz+torba | **PackageType** (jedna linia; zakres z definicji paczki) |
| konkretny telefon/rachunek/polisa | **ProductInstance** (istnieje wcześniej albo powstaje w realizacji) |
| rozróżnialność egzemplarzy (sztuka, partia, pula) | strategia śledzenia (w Product; wpływa na realizację) |
| kto zamawia / płaci / odbiera / wykonuje / przyjmuje płatność | role **ORDERER / PAYER / RECEIVER / EXECUTOR / PAYMENT_RECEIVER** |
| podwykonawca transportu, kontakt przy dostawie, odbiorca instalacji | role rozszerzone: CARRIER, DELIVERY_CONTACT, INSTALLATION_RECIPIENT (linia) |
| przypisanie podmiotu do roli | **PartyInRole** (PartyId + zbiór ról + snapshot) |
| dane uczestnika "z chwili zlecenia" | **snapshot danych podmiotu** (niemutowalny) |
| komplet uczestników + reguły składu | **OrderParties** (enkapsulacja + polityki walidacji ról + merge Order/linia) |
| "czy ta firma może to realizować" (certyfikaty, region) | **RoleRequirements** (oczekiwania) vs **Capabilities** (możliwości, z Party); Order egzekwuje przy confirm |
| warunki złożenia: kanał, segment, wiek, geografia, kampania | **ApplicabilityContext** (Ordering zbiera i przenosi, nie interpretuje) |
| cena linii, "ile i dlaczego tyle" | **OrderLinePricing**: CalculatedPricing / ArbitraryPricing / EstimatedPricing / NotPricedYet; `isDefinitive` |
| rozbicie ceny: baza, rabat, podatek, koszt, marża | **Component Breakdown** (TOTAL; historia decyzji cenowych) |
| dane wejściowe wyceny | **PricingContext** (zbudowany przez Ordering, z identyfikatorem cennika z Product) |
| cena negocjowana "z palca" | ArbitraryPricing (+ ewentualnie cennik FIXED-PRICE w Pricingu) |
| voucher, kupon, zniżka pracownika, rabat na całość | **osobna linia z ujemną ceną** (produkt z cyklem życia) |
| rabat algorytmiczny (progi ilościowe) | komponent w drzewie Pricingu |
| statusy: szkic, potwierdzone, w realizacji, zrealizowane, zamknięte, anulowane, czekające | maszyna stanów: DRAFT, CONFIRMED, PENDING_ALLOCATION, PROCESSING, FULFILLED, CLOSED, CANCELLED |
| "kiedy alokować zasób" | **AllocationStrategy**: PRE_ALLOCATED / ORDER_DRIVEN / EXTERNAL / NONE (metadane Product) |
| "co gdy brak zasobu": odmowa, kolejka, ponawianie, dokupienie puli | **AllocationPolicy**: REJECT / WAITLIST / RETRY / auto-rozszerzenie (+ rezerwacja z expiry) |
| żądanie alokacji | **AllocationRequest** (język zasobów + jawna polityka + generyczny kontekst) |
| wynik próby alokacji | **AllocationStatus** (Inventory raportuje; Ordering decyduje o stanie) |
| kontrakt z magazynem/zasobami | **InventoryService** (generyczny: ResourceType, ResourceId, czas, miejsce, duration, ilość) |
| "czy już wysłane/aktywowane/wykonane" | stan realizacji w Order (agregat statusów linii) — bez mechaniki fulfillmentu |
| wysyłka, aktywacja, rezerwacja terminu, SMS, AML+konto | warianty **fulfillmentu** (FulfillmentHandler per ProductType / zdarzenia) |
| anulowanie po potwierdzeniu | proces kompensacyjny (Saga: zwolnienie zasobów, zwrot, stop realizacji, komunikacja) |
| zwrot/reklamacja po realizacji | Return / Complaint / Refund Flow (odrębne procesy, nie cancel) |
| równoczesne zmiany z wielu stron | pole wersji + optimistic locking |
| pewna publikacja zdarzeń | Outbox Pattern (+ idempotencja, retry, observability, correlation id) |
| przepływ wartości: pieniądze, punkty, limity, emisje | transakcje w **Accounting** (Ordering inicjuje) |
| rozliczenie zużyciem po czasie | billing + wycena odroczona (NotPricedYet / EstimatedPricing) |
| kolejka oczekujących na zasób | waitlista (Inventory / biblioteka list oczekujących), stan PENDING_ALLOCATION |

---

## 14. Pytania do biznesu przy odkrywaniu archetypu

### Intencja i zakres
- Co dokładnie jest zlecane — rzecz, usługa, czynność, procedura? Czy "produkt" istnieje
  przed zamówieniem, czy powstaje w wyniku jego realizacji?
- Czy jedno zlecenie może obejmować wiele elementów/opcji/zestawów? Jak często oferta się
  zmienia i kto o tym decyduje (czy zmiana oferty może wymagać zmiany systemu)?
- Jakie parametry wykonania towarzyszą intencji (termin, miejsce, priorytet, tryb, instrukcje)?
  Gdzie dziś są zapisywane — w systemie czy w mailach/telefonach/notatkach?
- Czy klient wskazuje konkretny egzemplarz, cechy, czy "cokolwiek z puli"? Czy są produkty
  czasowe (zasób + slot)?
- Kiedy zmiana jest "tym samym zamówieniem", a kiedy nowym? Co musi pozostać z pierwotnej
  intencji po zmianach?

### Role i podmioty
- Kto inicjuje? Kto płaci (zawsze ten sam, kto zamawia)? Kto odbiera efekt? Kto formalnie
  realizuje, a kto faktycznie wykonuje? Kto przyjmuje płatność?
- Czy role bywają rozdzielone między osoby/działy/firmy? Czy liczba i zestaw ról różni się
  między zamówieniami? Czy jakieś role mają sens tylko dla pojedynczej pozycji?
- Czy uczestnik musi być zarejestrowany? Co, gdy nie jest? Jakie dane uczestnika są potrzebne
  do realizacji/kontaktu/audytu i co się dzieje, gdy zmienią się po złożeniu?
- Czy wykonawca musi spełniać warunki (certyfikaty, region, przepustowość)? Kto i kiedy to
  weryfikuje — przy składaniu czy potwierdzaniu?
- Ile osób w danej roli jest dopuszczalnych (dokładnie jeden ORDERER? najwyżej ilu płatników?)?

### Wycena
- Czy cena jest znana w momencie złożenia? Skąd pochodzi: cennik/reguły, negocjacja ręczna,
  szacunek, rozliczenie po zużyciu?
- Co się dzieje, gdy cena produktu zmieni się po złożeniu zamówienia — obowiązuje stara czy
  nowa? (test snapshotu)
- Czy trzeba umieć odpowiedzieć "dlaczego to kosztowało tyle" po miesiącach? Jakie składowe
  ceny wymaga regulator/księgowość (podatki, rabaty, koszty dodatkowe)?
- Jak działają zniżki: automatyczne reguły czy vouchery/kody/decyzje pracownika? Czy rabat
  dotyczy pozycji czy całości? Czy można łączyć vouchery?
- Kto może ustawić cenę ręcznie i czy trzeba wiedzieć kto/kiedy/dlaczego?

### Zasoby i realizacja
- Czy realizacja wymaga zasobów ograniczonych? Czy zamówienie konkuruje o zasoby, czy
  uruchamia ich wytworzenie?
- Kiedy następuje blokada zasobu: przed zamówieniem (klient wybiera slot), przy potwierdzeniu,
  później, nigdy? Czy to zależy od produktu, procesu czy kanału?
- Co, gdy zasobu brak: odmowa, rezerwacja czasowa z terminem na płatność, lista oczekujących,
  ponawianie, automatyczne rozszerzenie puli?
- Czy rezerwacje realizuje system partnera (zewnętrzne źródło prawdy)?
- Jak wygląda "wykonanie": wysyłka, aktywacja, wizyta, dokument, notyfikacja? Czy różne
  pozycje jednego zamówienia realizują się zupełnie inaczej i w różnym tempie?
- Co wolno zmienić po potwierdzeniu, a co wymaga cofnięcia działań (zwrot, zwolnienie
  rezerwacji)? Kiedy anulowanie przestaje być możliwe i zamienia się w zwrot/reklamację?
- Skąd zamówienie dowiaduje się o postępie realizacji? Czy potrzebna jest odpowiedź na
  pytanie "gdzie utknęło moje zamówienie"?

### Kontekst i reguły
- Czy dostępność produktu zależy od kontekstu (segment klienta, wiek, kanał, geografia, czas,
  kampania) niezależnie od zasobów?
- Czy procesy mają bardzo złożone rozgałęzienia i ograniczenia (kandydat na drzewa reguł)?

### Architektura i skala
- Ile różnych procesów zamawiania/zlecania istnieje w organizacji? Czy są pisane od zera jako
  "każdy inny", choć strukturalnie podobne?
- Czy Product, Pricing, Inventory, Party, Accounting istnieją jako wydzielone capabilities,
  czy ich odpowiedzialności są dziś rozmyte po procesach?
- Czy procesy są fundamentalnie różne (czas życia, ryzyko, regulacje — jak kredyt vs FX vs
  lokata)? Jaka jest tolerancja organizacji na koszty: biblioteka współdzielona vs separacja
  vs platforma pluginowa vs fasada?
- Kto jest właścicielem poszczególnych etapów fulfillmentu — jeden zespół czy wiele zespołów
  w odrębnych kontekstach (orkiestracja vs choreografia)?
- Jakie są wymagania audytu, raportowania i rekonstrukcji historii ("co było zamówione,
  co zmienione, kiedy i dlaczego")?

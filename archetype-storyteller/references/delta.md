# Archetyp: Plan vs Wykonanie (Algebra Delty)

> Źródło: moduł M10 szkolenia o archetypach (L01–L06). Archetyp autorski — nie znajdziesz go
> w książkach; został odkryty w trakcie projektów doradczych, a nazwa wykluła się podczas
> nagrywania Domain Drivers.

---

## 1. Esencja archetypu

Wszędzie, niezależnie od branży, słownika i typu danych, powtarza się jedno wymaganie:
**"pokaż nam różnicę między tym, co miało być, a tym, co się wydarzyło"**. Pod każdym
pojedynczym rzeczownikiem domenowym (rata, dostawa, zlecenie, kandydat, order) kryją się
tak naprawdę **dwa światy**:

- **świat oczekiwań** — plan, intencja, obietnica ("miało być"),
- **świat rzeczywistości** — wykonanie, fakty, historia ("wyszło").

Biznes często tego nie nazwie wprost — dla niego to oczywiste. To modelujący musi zobaczyć,
że mimo różnych domen, różnych słów i różnych danych wszędzie rozwiązywany jest podobny
problem. Archetyp składa się z **trzech pełnoprawnych bytów**: Plan, Wykonanie i Delta.

### Semantyka, której nie wyraża "kwota minus kwota"

Prosta różnica (plan minus wykonanie) to dopiero rozgrzewka. Prawdziwa trudność zaczyna się,
gdy padają pytania interpretacyjne:

- Czy ta pojedyncza rata jest spóźniona? Czy wpłata częściowa zdejmuje karencję?
- Czy 3 dni spóźnienia to spóźnienie, a może tolerujemy 2? A co jak wypada weekend? A może 5?
  A co, jeśli to klient premium?
- Co, jeśli rata jest 10 dni spóźniona, ale klient wcześniej nadpłacał?

To już jest **semantyka**, której nie umie wyrazić ani "rata", ani "harmonogram". Nie mieści
się w "kwota minus kwota" ani "data minus data". **Delta nie jest liczbą — jest interpretacją
zachowania** (klienta, procesu, systemu). To logika reguł, wyjątków, priorytetów, karencji,
przywilejów, dat i nadpłat. To różnice typu:

- "spóźniona, ale jeszcze OK",
- "spóźniona, no ale z karencją",
- "spóźniona dziś, ale nie spóźniona, jeśli klient był premium",
- "technicznie spóźniona, ale biznesowo już nie".

Różnica nie wynika z samych liczb, tylko z **interpretacji liczb, reguł, kontekstu i polityki
działania**. Taka delta jest **deltą kontekstową** — różnicą, która niesie **decyzję na temat
metryki biznesowej**, a nie samą arytmetykę.

### Co jest stałe, a co zmienne

Niezmienne jest wymaganie: różnica między oczekiwaniem a rzeczywistością. **Zmienne jest
tylko to, jak tę różnicę liczymy** — w jednym miejscu to arytmetyka, w innym czas i kolejność,
gdzie indziej topologia grafu albo algorytm optymalizacyjny. Dlatego ten archetyp — inaczej
niż Accounting (uogólnialny do zarządzania wartością i transakcjami) czy Party (relacje,
role, odpowiedzialności) — **nie ma jednego uniwersalnego modułu w kodzie**. Plan, wykonanie
i delta zawsze są "o czymś" konkretnym: harmonogramach, kwotach, grafach, listach elementów,
sekwencjach zdarzeń. Archetyp to **sposób myślenia i modelowania**, niekoniecznie gotowy
kawałek kodu czy UML-a (choć niejednokrotnie będzie to gotowy fragment implementacji).

---

## 2. Trzy branżowe przykłady wprowadzające (L01)

### 2.1 Finanse / kredyty: harmonogram spłat

Analityk kredytowy pokazuje tabelkę harmonogramu: "tu klient miał spłacić 1200 zł, tu zapłacił
800, tu zapłacił dzień później. **Policz mi, o ile to się mogło rozjechać**". Nie pada słowo
"plan spłat" ani "wykonanie spłat" — biznes patrzy na **ratę** i **harmonogram**; wokół tych
dwóch rzeczowników krąży 80% dokumentów analitycznych. A zadanie brzmi: policzyć, o ile
inaczej wyszło, niż miało wyjść.

Pytania, które natychmiast wychodzą poza arytmetykę: spóźnienie pojedynczej raty, wpłaty
częściowe a karencja, progi tolerancji (2 dni? 3? 5? weekendy?), przywileje klienta premium,
wcześniejsze nadpłaty kompensujące obecne spóźnienie. W finansach zawsze usłyszysz "wykonanie
spłat", ale nie zawsze "różnicę między planem a wykonaniem" — a przecież istnieje planowany
harmonogram i lista faktycznych płatności. Jedno to plan, drugie to wykonanie, a **delta jest
sednem ryzyka, windykacji, scoringu i predykcji**. Mimo to często modeluje się ratę, jakby
była jednowymiarowa.

### 2.2 Logistyka: dostawy i trasy

Spotkanie z operacjami, slajd z listą dostaw: "ta ciężarówka powinna być o 14:00, a przyjechała
o 16:30; ta miała mieć 18 palet, a ma 16; ta pojechała objazdem — zaznacz w systemie różnicę
w kilometrach". Znowu nikt nie mówi "plan dostawy" / "wykonana trasa" — jest tylko **dostawa**
albo **trasa** (jeden–dwa rzeczowniki-satelity). Zadanie: "co tu nie gra względem tego, co
miało być?".

Pytania wykraczające poza "czas planowany minus rzeczywisty":

- Czy spóźnienie 30 minut **po 18:00** liczymy inaczej niż 30 minut **po 12:00**?
  (definicja opóźnienia zależna od okna czasowego)
- Czy dwie brakujące palety to różnica? Czy ma to znaczenie przy załadunku 4 vs 400 palet?
  Czy zależy od towaru lub klienta? (interpretacja braków zależna od towaru i klienta)
- Różnicę w kilometrach liczymy od trasy optymalnej czy od ostatniej zarejestrowanej?
  (semantyka trasy zależna od kategorii wyjątku)

W środku "dostawy" siedzi tak naprawdę plan czasu, plan trasy, plan ilości, plan punktów —
oraz wykonanie, które zawsze wygląda inaczej. **Różnica decyduje o SLA, karach, kosztach
i reputacji**, a mimo to dostawę często błędnie modeluje się jako jeden byt.

### 2.3 Produkcja: zlecenie produkcyjne

Tablica wyników w fabryce, kierownik pokazuje zlecenie: "mieliśmy zrobić 300 sztuk, wyszło 270;
czas miał wynosić 4 godziny, trwało 5; odpadów miało nie być, wyszło 4%. **Policz mi
odchylenie**". Jest tylko rzeczownik **zlecenie** — żadnej "planowanej/wykonanej produkcji".

Pytania kontekstowe: czy 270/300 jest akceptowalne, gdy była 20-minutowa awaria taśmy? Czy 5
godzin liczyć jako opóźnienie, skoro poprzednia partia poszła później? To nie jest "300 minus
270" ani "0% minus 4%" — to **delta kontekstowa**.

Ostrzeżenie modelowe: jeśli całą tę logikę upchnąć w jedną encję "zlecenie", encja przestaje
być zleceniem, a staje się **katalogiem wyjątków i pól tymczasowych** — środowiskiem
naturalnym "Mariana" (antywzorcowego dewelopera), który grasuje w nim jak ryba w wodzie,
a z czasem w mule jak panga.

### 2.4 Branże, gdzie archetyp jest jawny (nie trzeba go odkrywać)

- **Sprzedaż** — plan vs wykonanie to naturalny język domeny: plany kwartalne, targety,
  bonusy, odchylenia, korekty, forecasty, "mamy cel vs ile dowieźliśmy". Pojęcia first-class.
  System rozdzielający plan i wykonanie nikogo nie zaskoczy.
- **Energetyka** — plan vs wykonanie to podstawa bezpieczeństwa (problem wręcz fizyczny):
  plan zapotrzebowania/obciążenia sieci vs faktyczna generacja (wiatr za mocny/za słaby,
  słońce jest albo go nie ma, bloki węglowe wstają wolniej, gazowe reagują szybciej).
  Nieodebraną energię trzeba "upchnąć": protokoły redukcji mocy, odstawianie bloków,
  bilansowanie systemu, usługi regulacyjne.

### 2.5 Branże, gdzie archetyp jest ukryty (tu jest największy zysk)

Tam, gdzie różnica chowa się pod jednym rzeczownikiem, można "wyciągnąć królika z kapelusza" —
pokazać coś, czego nikt w wymaganiach nie nazwał, a co uporządkuje cały system:

- **Logistyka** — "dostawa"/"trasa" (patrz 2.2).
- **Finanse** — "rata"/"harmonogram" (patrz 2.1).
- **HR / rekrutacja** — dominujący rzeczownik: **kandydat**. Plan = oczekiwana ścieżka
  rekrutacji (screening → rozmowa → zadanie → finał → oferta). Wykonanie = faktyczny przebieg:
  pominięte etapy, dodatkowe rozmowy, zmiany kolejności, opóźnienia, cofnięcia, przerwy,
  wznowienia. Delta = różnica między planowaną a rzeczywistą ścieżką i czasem jej trwania —
  kluczowa dla mierzenia efektywności rekrutacji, identyfikacji wąskich gardeł i analizy
  porzuceń. Wiele systemów spłaszcza proces do jednego bytu "kandydat z kilkoma datami",
  tracąc deltę jako osobny wartościowy byt.
- **Handel / e-commerce** — **Order vs Fulfillment**. Order to obietnica (co klient zamówił,
  w jakiej ilości, z jakim terminem, ceną i warunkami). Fulfillment to rzeczywistość (co
  faktycznie wysłano, kiedy, w ilu paczkach, z których magazynów, w jakim stanie). Delta
  decyduje o zwrotach, reklamacjach, chargebackach, korektach faktur i o tym, za co klient
  zapłaci, a za co nie. (Zamawiać nie trzeba tylko w kontekście zakupu.)

---

## 3. Sygnały dopasowania (triggery)

### Triggery językowe — "słowa-mosty" (L06)

Słowa-mosty tego archetypu brzmią jak **język obietnic i rozliczeń**. Gdy w jednym zdaniu
pojawiają się dwa porządki — oczekiwanie i fakt — system sam zdradza istnienie dwóch struktur:

| Porządek oczekiwań | Porządek faktów |
|---|---|
| "miało być", "oczekiwaliśmy" | "faktycznie", "ostatecznie" |
| "zakładaliśmy" | "w praktyce", "wyszło" |
| "powinno się wydarzyć" | "wydarzyło się" |

Druga rodzina sygnałów — zdania sugerujące, że wykonanie porusza się **inną ścieżką** niż plan:
"częściowo zrealizowane", "zrealizowane inaczej", "z opóźnieniem", "w innej kolejności".
Te słowa stroją ucho na pytanie: **nie "czy coś się wydarzyło", ale "jak bardzo rzeczywistość
odbiegła od oczekiwań"** — i dokładnie tam zaczyna się archetyp.

### Triggery szczegółowe

- "**Policz mi, o ile to się rozjechało**" / "policz mi odchylenie" / "co tu nie gra względem
  tego, co miało być".
- Harmonogram (plan) zestawiany z listą faktycznych wpłat/zdarzeń.
- Pytania o **spóźnienia z interpretacją**: progi tolerancji, dni robocze vs kalendarzowe,
  weekendy, okna czasowe ("30 min po 18:00 to co innego niż po 12:00").
- **Karencje**, przywileje, wyjątki: "wpłata częściowa a karencja", "klient premium a reguły
  odchyleń" ("dla premium opóźnienie do 5 dni nie liczy się jako opóźnienie").
- Kompensacje historią: "spóźniona, ale wcześniej nadpłacał".
- Braki/nadwyżki ilościowe z interpretacją zależną od kontekstu (towar, klient, skala).
- Różnice trasy/ścieżki/kolejności kroków względem zaplanowanej (zmiana topologii).
- Pytania "**co by było gdyby**": inna polityka, inne założenia, inne tempo spłat.
- Każdy dział liczy "to samo" opóźnienie inaczej (call center: >2 dni; windykacja: >7 dni
  bez weekendów) — sygnał, że delta potrzebuje polityk.
- Jeden dominujący rzeczownik (rata, dostawa, zlecenie, kandydat), w którym analiza
  wymaga rozdzielenia "co miało być" od "co było".

### Triggery kodowe (symptomy w istniejącym systemie)

- Flagi typu `isPremiumLateAllowed` doklejane do encji harmonogramu/zamówienia — próba
  wciśnięcia semantyki delty do encji, która nie jest do tego stworzona.
- Encja puchnąca od statusów, pól tymczasowych, wyjątków; moduł się degraduje, pojawiają
  się haki; velocity zespołu tajemniczo spada ("zespół brodzi w mule — po kostki, po kolana,
  po pas, po kokardkę").
- Statusy w stylu `NOT_REALLY_ORDER` jako proteza planu.
- Plan istniejący tylko jako wynik metody / JOIN-ów / raportu (patrz L04).
- Flagi `symulacja włączona`, warunki `if not prod` rozlane po serwisach.

---

## 4. Anty-sygnały / granice archetypu

- **Czysto obliczeniowe wartości bez punktu odniesienia.** Wiele rzeczy po prostu się liczy —
  ceny, podatki, rabaty, limity — i nie ma w tym nic złego. Problem zaczyna się **dopiero**,
  gdy wynik staje się punktem odniesienia: chcesz go porównywać w czasie, wiedzieć co było
  wcześniej i dlaczego się zmieniło, zestawiać z wykonaniem lub innym wariantem. Jeśli
  obliczeń **nie zapisujesz, nie porównujesz, nie audytujesz, nie symulujesz** — nie
  potrzebujesz archetypu plan–wykonanie. (Uwaga: nawet jeśli dziś masz taką pewność,
  prawdopodobnie jutro będzie inaczej.)
- **Pytania "czy coś się wydarzyło"** (prosty fakt/status), bez pytania "jak bardzo
  rzeczywistość odbiegła od oczekiwań" — brak drugiego świata do porównania.
- **Branże, gdzie archetyp jest jawnie wbudowany w język** (sprzedaż, energetyka) — archetyp
  oczywiście pasuje, ale nie ma tam nic do *odkrywania*; ROI z "wyciągania królika
  z kapelusza" jest tam najmniejszy. Skupiaj wysiłek odkrywczy na branżach z ukrytą deltą.
- **Symulacje same w sobie nie implikują tego archetypu** — można symulować ceny, polityki,
  reguły, progi, klasyfikacje, decyzje operacyjne bez planu i wykonania. Symulacje są
  nierozerwalnie *związane* z archetypem, ale nie są dla niego *zarezerwowane*.
- **Nie szukaj uniwersalnego modułu delty.** Jeśli ktoś proponuje generyczny framework
  "DeltaEngine" dla wszystkich domen — to wbrew naturze archetypu: struktura porównania
  nigdy nie jest taka sama (arytmetyka vs czas/kolejność vs topologia grafu vs algorytm
  optymalizacyjny).

---

## 5. Algebra delty — podejście modelarskie (L02)

### 5.1 Trzy pełnoprawne byty

- **Plan to osobny byt** — opisuje to, co **ma się wydarzyć**. Nie jest polem w encji
  (a przynajmniej nie zawsze powinien nim być). Plan ląduje jako pole w encji "zamówienie"
  wtedy, gdy myślimy światem rzeczowników, a nie zachowań — wtedy zamówienie staje się
  centrum wszystkiego, w tym planowania. Takie podejście uniemożliwia symulowanie sytuacji
  **bez istnienia zamówienia**.
- **Wykonanie to osobny byt** — opisuje to, co **wydarzyło się naprawdę**. Nie jest statusem
  planu.
- **Delta to pełnoprawny obywatel modelu** — obiekt porównania dwóch światów. Nie może być
  jednym polem, if-em w serwisie ani Excelem u analityka. **Ma swój model, swoją strukturę,
  swoje reguły liczenia i można ją interpretować różnymi politykami.**

### 5.2 Zalety rozdzielenia planu i wykonania

1. **Jasność modelu** — plan i wykonanie nie mieszają się w jednym bycie; każdy ma własną
   odpowiedzialność.
2. **Czytelność wymagań** — biznes zaczyna mówić tym samym językiem: "to jest plan, to jest
   wykonanie, tu jest różnica, liczymy ją w ten sposób".
3. **Brak ukrytej logiki w encjach** — znika konieczność dopisywania wyjątków, flag i stanów
   do jednego ogromnego rzeczownika.
4. **Audytowalność** — wiadomo, co było intencją (plan), a co historią (wykonanie).
5. **Łatwiejsze zmiany biznesowe** — zmiany w planie nie psują wykonania i odwrotnie.
6. **Fundament pod rekonsyliację i symulację** — dopiero z trzema osobnymi bytami możesz
   robić symulacje what-if, analizy trendów i zmieniać polityki interpretacji różnic.

Dodatkowa wartość: **samo porównywanie planu z wykonaniem ujawnia ukrytą semantykę systemu
biznesowego** (patrz 5.4).

### 5.3 Cztery relacje strukturalne plan ↔ wykonanie

Plan i wykonanie często wyglądają jak dwie wersje tej samej rzeczy. Możliwe przypadki:

| Przypadek | Charakterystyka | Postępowanie |
|---|---|---|
| **Identyczne struktury i semantyka** | np. prosta produkcja: partia, ilość, czas, odpady, data — pola 1:1 | Mimo to **dwie osobne struktury**: model nie jest więźniem tego, że dziś jest 1:1 a jutro nie; typy mówią na głos to, co było w głowie; pomyłki logiczne trudniejsze |
| **Różne pola (częściowe pokrycie)** | plan ma pola projektowe: tolerancje, okna czasowe, priorytety; wykonanie ma pola historyczne: wyjątki, źródła danych, przyczyny | Normalna sytuacja, absolutnie OK — dwie struktury, nigdy nie będą 1:1 |
| **Identyczne struktury, różna semantyka** | **najgroźniejszy przypadek**: `amount=1200` w planie = "klient miał zapłacić 1200"; `amount` w wykonaniu może być kwotą po prowizji operatora, po zaokrągleniu albo po przewalutowaniu — a pola "prowizja bramki" nie ma | Jedyny sposób odkrycia: **zapytać biznes**. Osobne `PlannedPayment` i `ActualPayment` + próba policzenia delty *zachęcają* do pytania "czy amount po obu stronach oznacza to samo?" |
| **Różne strukturalnie i semantycznie** | dwa jawnie inne światy | Archetyp wbudowany w dziedzinę (np. sieci energetyczne) — nie ma czego odkrywać, wymagania same krzyczą "dwa byty" |

### 5.4 Struktury, na których działa delta

Delta działa na powtarzalnych strukturach, niezależnie od branży; najczęściej jest
**kombinacją** poniższych zbiorów:

1. **Liczby** — sztuki, złotówki, kilowaty, godziny, daty. Delta = różnica liczb
   **z polityką interpretacji**.
2. **Listy liczb / harmonogramy** — delta = różnica zbiorów dat, opóźnień, karencji,
   kolejności i okien czasowych.
3. **Grafy** — plan ma jedną strukturę zależności, wykonanie inną. Delta opisuje **zmianę
   topologii**: inne ścieżki, inne przepływy, inne powiązania. Przykład: plan zakładał
   umowa z partnerem → uruchomienie sprzedaży → rozliczenie prowizji; w praktyce sprzedaż
   ruszyła wcześniej, a umowa została domknięta po fakcie — relacje między krokami się
   odwróciły, choć wszystkie działania się wydarzyły.

### 5.5 Operacje i co dostajesz "za darmo"

Przy wybranych strukturach i wspólnych działaniach:

- **Jasne polityki porównań i tolerancji** — powtarzający się schemat:
  (1) wybierz tolerancję porównania, (2) policz deltę. Ten sam mechanizm w finansach
  i w produkcji.
- **Symulacje what-if bez przepisywania systemu** — skoro delta jest strukturą, a nie
  wyjątkiem: "co jeśli zmienimy politykę interpretacji — czy nadal będę opóźniony?",
  "jak bardzo tolerancyjni musielibyśmy być, żeby raportować mniej spóźnień?".

---

## 6. Typowe problemy modelowe i semantyczne (L03)

Nawet gdy plan i wykonanie są już first-class citizens, pojawiają się problemy, o których
mało kto myśli na starcie. (To NIE są jeszcze błędy implementacyjne — te są w L04.)

### 6.1 Różna rozdzielczość planu i wykonania

Plan powstaje "z góry": uproszczony, syntetyczny, bez detali. Wykonanie "z dołu": z realnych
wydarzeń. Przykłady:

- Plan: "300 sztuk w miesiącu". Wykonanie: dzienne — "270 sztuk + 12 braków + 18 poprawek
  w dniach 2, 4, 7 i 12".
- Plan: "rata 1200 zł do 15-ego". Wykonanie: wpłata podzielona na 2 albo 5 przelewów.

Porównujesz światy operujące innymi jednostkami czasu, ilości i szczegółowości — liczona
różnica **musi zmapować te poziomy**, inaczej nie ma sensu. Klasyczne pytanie: "czy 300 sztuk
w miesiącu oznacza to samo co 10 sztuk dziennie przez 30 dni?". Bez jawnego ustalenia delta
zależy od interpretacji, nie od danych.

**Rozwiązania** (zasada nadrzędna: najlepszym sposobem radzenia sobie z problemami jest ich
nietworzenie — "nie otwierajmy sobie parasola w zakończeniu układu pokarmowego"):

1. **Operuj na tej samej rozdzielczości, jeśli możesz.** Plan i wykonanie mówią w tych samych
   jednostkach. Świetnie działa dla liczb (sztuki, litry, złote), dat (dni, tygodnie,
   godziny — to też liczby), metryk fizycznych (temperatura, moc, czas pracy). Idealne, gdy
   różnice są tylko na poziomie mikro/nano (sekundy vs milisekundy, litry vs mililitry) —
   wyrównanie jest wbudowane w domenę i dostępne aparatem matematycznym.
2. **Jeśli nie możesz wyrównać — jawnie zdefiniuj dwukierunkowe mapowanie.** Częste, gdy
   wykonanie przychodzi jako zdarzenia, których nie kontrolujesz (IoT loguje sekundy pracy
   maszyny, kurierzy wysyłają eventy GPS, API partnera przesyła paczki o różnej strukturze) —
   nie możesz kazać wykonaniu "mówić językiem planu". Mapowanie w obie strony:
   - rozbij plan na jednostki wykonania (miesięczny plan produkcji → harmonogramy dzienne),
   - agreguj zdarzenia wykonania w jednostki planu (eventy IoT → godziny pracy → realizacja
     zmiany → realizacja miesiąca).

   Bez tego mapowania: delta raz wynosi 30, raz 12, raz 0 — zależnie kto liczy; raporty się
   nie zgadzają; wykonanie "zjada plan detalem"; plan wydaje się błędny, choć być może nie był.

Efekt uboczny (pozytywny): myśląc archetypem wpadasz w problem rozdzielczości naturalnie
i widzisz, że "300 sztuk w miesiącu", "dostawa w piątek", "rata 1200 zł" to nie fakty
katalogowe, tylko **zachowania operacyjne**. Produkt przestaje być opisem, a zaczyna być
czymś, co mapuje się na wiele procesów, instancji dostępności, zapisów wartości — **inne
archetypy (np. Produkt) naturalnie się odsłaniają**.

### 6.2 Każdy liczy deltę inaczej — delta jako interpretacja

Najprostszy, a zarazem najbardziej destrukcyjny problem. Call center przypominające o spłacie
uważa za opóźnienie wszystko powyżej **2 dni**; windykacja — powyżej **7 dni, ale
z wyłączeniem weekendów**. Ta sama delta ma kilka różnych wartości, zależnie od tego, kogo
zapytasz. **Nie ma czegoś takiego jak "prawda"** — jest tylko lokalna opinia działu, oparta
na jego kontekście, priorytetach i słowniku.

Nie da się zrobić jednej globalnej reguły (nie zadowoli wszystkich). Zamiast tego:
**wstrzyknij reguły liczenia delty do samej delty — potraktuj je jako polityki**:

- **Delta** = struktura danych (różnica czasu, ilości, dat, sekwencji, jakości lub ich
  kombinacji).
- **Polityka** = sposób jej liczenia, **wybierany przez komunikujący się kontekst**.

Przykłady polityk: "opóźnienie liczymy tylko w dni kalendarzowe"; "opóźnienie liczymy jako
dni robocze"; "jeśli klient premium — ignoruj lub dodaj 5 dni".

**Kluczowa reguła:** kod delty **nie może znać reguł biznesowych**, które spowodowały
zastosowanie konkretnej polityki — reguły mają być wstrzykiwane.

---

## 7. Typowe błędne implementacje (L04)

Te same problemy semantyczne są wzmacniane przez pozornie rozsądne, "praktyczne i szybkie"
decyzje implementacyjne. Efekt: plan-wykonanie istnieje tylko w prezentacji, a w kodzie
wszystko znowu się miesza.

### 7.1 Plan jako wniosek wyciągnięty z danych (plan wyliczany, nie istniejący)

Nie tworzysz encji "plan", bo "plan już gdzieś jest": trochę w tabeli zamówień (daty,
ilości), potem algorytm sprawdza moce magazynu w regionie, reguły SLA klienta, kalendarz dni
roboczych, dostępność kierowców — i jeśli warunek niespełniony, przesuwa plan. Plan = kilka
encji + kilka JOIN-ów + wyjątki + logika żyjąca w jednym serwisie lub raporcie. Nie jest
pełnoprawnym, jawnym bytem.

**Konsekwencja:** działa, dopóki nikt nie pyta o historię. "Jaki był plan dostawy dla
zamówienia 12345 w dniu 15 stycznia?" — **nie wiadomo**. Nie dlatego, że nie ma algorytmu,
tylko dlatego, że algorytm opiera się na danych, które mogły się zmienić:
`Customer.slaDeliveryDays` z 3 na 5, `Warehouse` zmienił przepustowość, `WorkingCalendar`
dostał nowe święta (np. żałoba narodowa), `DriverAvailability` wygląda dziś inaczej —
albo zmienił się sam algorytm.

**Naprawa (minimalny krok):** przepiąć to, co dziś jest wynikiem metody, do **bytu z własną
tożsamością** — na start choćby widok w bazie lub tabela aktualizowana przy każdej zmianie
danych źródłowych (zmienia się kierowca → plan aktualizowany; konfiguracja → plan
aktualizowany; kalendarz → plan aktualizowany). Kluczowe: plan ma **własną tożsamość i własny
cykl życia**; wersjonujesz plan, a nie wszystko; plan można **odczytać i zmodyfikować**,
a nie tylko wyliczyć.

Granica stosowalności: samo liczenie jest OK (ceny, podatki, rabaty, limity). Problem zaczyna
się, gdy wynik staje się punktem odniesienia (porównania w czasie, zestawienie z wykonaniem
lub wariantem) — patrz anty-sygnały, sekcja 4.

### 7.2 "Mamy historię zmian" — historia stanu zamiast historii intencji

Przy pytaniu "jak wersjonować plan" pada uspokajające: "ORM/baza zapisuje historię, tabelki
z prefiksem `audit`". Ale w historii widzisz tylko **zmianę pól**: `slaDeliveryDays` z 3 na 5.
Nie wiesz:

- czy zmiana SLA była decyzją biznesową czy poprawką błędu,
- czy klient renegocjował umowę, czy rynek zmienił popyt, czy kod coś źle zapisał.

**Masz historię stanu, ale nie masz historii intencji.** Z punktu widzenia bazy obie sytuacje
wyglądają identycznie; z punktu widzenia delty i analizy to zupełnie różne światy:

- zmiana 3→5 jako **decyzja biznesowa** → plan świadomie zmieniony, delta mówi coś
  o **strategii**;
- zmiana 3→5 jako **korekta błędu** → wcześniejszy plan był zły, delta mówi coś o **jakości
  planowania**.

Pytania, na które system bez intencji **nie odpowie**: "policz, jak wyglądałaby realizacja,
gdyby popyt się zmienił"; "pokaż wykonanie względem oryginalnych planów, zanim zaczęliśmy
renegocjować umowy"; "które plany nigdy nie były poprawiane, tylko faktycznie dowiezione?";
"ile delty wynika z rynku, a ile z naprawiania błędów planowania?".

**Naprawa:** audyt intencji, choćby minimalny — nie full event sourcing, tylko zapis:
**co chcieliśmy zrobić, dlaczego, od kiedy i kto**. Problem głębszy: jeśli API przyjmuje DTO
nowego planu, intencja istnieje tylko w głowie operatora/klienta, ewentualnie w komentarzu na
Slacku lub mailu — na wejście trafia nowy stan i tyle; system wie, *co jest*, ale nie wie,
*co się wydarzyło*. Rozwiązaniem nie jest zmiana endpointu, lecz **task-based UI**: użytkownik
nie "edytuje planu", tylko wykonuje konkretną czynność — "zwiększ SLA do X", "przesuń
harmonogram o tydzień", "dostosuj plan do nowego popytu". Taski wymuszają intencje; dopiero
wtedy zapisujesz **komendę, intencję, metadane (kto, kiedy, dlaczego) oraz wynik (nowy stan
planu)**. To nie jest tylko zmiana interfejsu — to **zmiana organizacyjna**: ludzie muszą
nazywać swoje intencje, zanim klikną "zapisz" ("nie: jakie pole zmieniam, tylko: co właściwie
robię i dlaczego").

### 7.3 Jedna encja = plan + wykonanie + delta

Jedna encja trzyma "prawdziwy plan", przyjmuje wykonanie i "przy okazji" liczy różnice —
jedno miejsce, wiele odpowiedzialności. W praktyce **nie rozróżniasz planu i wykonania**
(albo za chwilę przestaniesz Ty lub ktoś z zespołu). Na prostym przypadku działa: jedno
zamówienie, jeden plan, jedno wykonanie, jedno porównanie.

**Konsekwencja — przeciekanie założenia:** jeśli architektura obliczeń zakłada, że plan
i wykonanie są w jednym miejscu, założenie przecieka wszędzie: wiedzą o nim **endpointy**
(jedna struktura, jeden request aktualizuje plan albo wykonanie), **serwisy i logika
procesowa** (po wyliczeniu delty od razu zapis do tej samej encji), **baza** (schemat
i relacje zaprojektowane, jakby istniał jeden prawdziwy rekord z dwoma wektorami informacji).

**Konsekwencja — zablokowana kombinatoryka porównań:** wykonanie jest jedno
(`actualDate=2024-01-22`, `actualQuantity=95`), ale chcesz je porównać z różnymi planami:
pierwotnym, po zmianie SLA, alternatywnym. Wtedy zmiana jednego psuje drugie; nie da się tego
zrobić bez mutowania stanu, sztucznych kopii i flag symulacji degradujących model. A to
właśnie kombinatoryka (plan A vs wykonanie X, plan B vs wykonanie X, plan A vs wykonanie Y)
daje realną wartość delty. Błąd niebezpieczny, bo **na początku wygląda praktycznie**
(prostszy kod, mniej bytów), a w dłuższej perspektywie uniemożliwia porównania, niszczy
symulacje i kończy się refaktorem, którego nikt nie chce dotykać.

**Naprawa:** jedyną naprawą jest **jawne rozdzielenie dwóch bytów**.

### 7.4 Mutowalność na poziomie modelu

Doprecyzowanie: w bazie dane oczywiście się zmieniają, rekordy są aktualizowane — chodzi
o mutowalność **na poziomie modelu**. Biznes: "zobaczmy trzy warianty — dostawa dwa dni
wcześniej, na czas, pięć dni później". Programista dopisuje metodę symulacji na mutowalnej
encji — trzeba pamiętać, żeby "odkręcić" stan; jeden błąd = nadpisane dane produkcyjne.

Klasyczne obejścia i ich granice:

- **Kopiowanie obiektów** — sprawdza się, dopóki symulacji jest mało, encja mała, nie siedzą
  w niej referencje i nie trzeba kopiować pół grafu obiektów.
- **Warunki `if not prod` / flagi "tryb symulacji włączony"** — tryb symulacji rozlewa się po
  serwisach, repozytoriach, integracjach, schedulerach, właściwie po wszystkim. Kod puchnie,
  testy przestają dawać pewność, rozwój staje się ryzykowny: "Marian, nie ruszaj, bo symulacja
  się zepsuje" albo odwrotnie — "nie da się symulować, bo zapisze się do bazy".

**Konsekwencja:** mutowalność modelu **zabija pytania what-if, porównania i rozwój logiki
delty** — w pewnym momencie nie wiesz już, czy liczysz rzeczywistość, czy ją symulujesz.
A to zabija ogromną wartość biznesową, bo na pytaniach "co by było gdyby", "jak by wyszło
przy innych założeniach", "czy poprawa wynika z lepszego wykonania czy z przesunięcia planu"
opiera się planowanie, optymalizacja, decyzje strategiczne i uczenie się organizacji na
własnych danych. **Jeśli nie potrafisz bezpiecznie symulować, nie potrafisz eksperymentować —
a wtedy spada Twoja wartość rynkowa jako architekta i wartość całego biznesu.**

**Naprawa (model docelowy):** w idealnym świecie plan i wykonanie **nie są obiektami, które
edytujesz** — są efektami nałożenia **dwóch różnych strumieni zdarzeń** na ten sam model
projekcyjny. Jeden strumień opisuje **intencje** (plan), drugi **fakty** (wykonanie). Plan
i wykonanie to **projekcje**, które możesz zasilać różnymi zdarzeniami, w różnej kolejności,
z różnymi założeniami — bez psucia danych produkcyjnych. Dzięki temu porównujesz to samo
wykonanie z różnymi planami, symulujesz alternatywne scenariusze i odpowiadasz na różne
pytania **bez dotykania "prawdy" w bazie**.

---

## 8. Symulacje "what-if" (L05)

### 8.1 Dwa oblicza pytania "co by było gdyby"

1. **Przyszłość:** "co, gdybyśmy dziś zmienili ceny i liczba rezerwacji spadła o 30%, ale
   zakup wersji premium wzrósł o 70% — jak wyglądałby stan zasobów, floty, gotówki,
   obciążenia zespołów?"
2. **Przeszłość:** "co by było dziś, gdybyśmy dwa lata temu podjęli inną decyzję?" — czyli
   "pokaż stan na dziś, ale w historii z innymi założeniami".

(Przypomnienie z sekcji 4: symulacje nie są zarezerwowane dla tego archetypu — można
symulować ceny, polityki, reguły, progi, klasyfikacje, decyzje operacyjne — ale są z nim
nierozerwalnie związane.)

### 8.2 Co daje symulacja w praktyce

1. **Przeliczenie historii inną polityką** — przykład leasingu: tysiące rat odbiegających od
   planu o kilka groszy; dla systemu niespłacone, dla biznesu faktycznie zamknięte. Pytanie:
   "co, gdyby raty z odchyleniem do 5 groszy traktować jako spłacone?". Uruchomione na
   zbiorach wielu harmonogramów pokazuje: tracisz X na drobnych niedopłatach, ale
   oszczędzasz Y na listach windykacyjnych, obsłudze call center i eskalacjach, a dodatkowo
   poprawiasz UX klientów. To **alternatywna interpretacja tej samej historii**.
2. **Symulowanie przyszłości na realnych strukturach, nie w Excelu** — na dokładnie tych
   samych modelach danych, na których liczysz rzeczywistość; może zasilać frontend, nie tylko
   dla analityka, ale dla klienta/użytkownika/eksperta, liczone na żywo. W wielu organizacjach
   absolutny game changer.
3. **Ofertowanie wcześniej niemożliwe** — "to jest Twój obecny harmonogram spłat; tak
   wygląda, jeśli zapłacisz trzy pierwsze raty na czas; inaczej, jeśli nadpłacisz; jeszcze
   inaczej, jeśli będziesz się spóźniać".

Symulacje pozwalają **symulować zmianę stanu systemu bez faktycznej zmiany stanu systemu** —
dlatego kluczowe jest oddzielenie efektów ubocznych. Dopiero wtedy: eksperymenty bez strachu,
porównywanie wariantów bez psucia danych, pytania wcześniej zbyt ryzykowne, system, który nie
tylko rejestruje rzeczywistość, ale pomaga ją rozumieć i zmieniać.

### 8.3 Mechanika: niemutowalność i strumienie zdarzeń

Klucz do symulacji to **niemutowalność na poziomie modelu i obliczeń** (nie bazy — zapisany
wynik symulacji oczywiście coś zmienia). Symulacja zaczyna się, gdy plan i wykonanie
traktujesz jako **wyniki złożenia strumieni zdarzeń**:

- zamiast modyfikować plan — **odtwarzasz go**, dodając zdarzenia, które się nie wydarzyły;
- zamiast poprawiać wykonanie — **dokładasz lub usuwasz symulowane zdarzenia**;
- symulacja = **inny strumień wejścia do tego samego mechanizmu liczenia**.

Przykład: bierzesz realne zdarzenia wykonania, dorzucasz hipotetyczne (wcześniejsza spłata),
przeliczasz plan i deltę, oglądasz wynik — niczego nie zapisując.

### 8.4 Plan reaktywny: gdy wykonanie zmienia plan

Działa to prosto, dopóki plan jest statyczny. Realny trudniejszy przypadek: **spełnienie lub
niespełnienie części planu zmienia plan**. Przykład: "jeśli spłacisz trzy pierwsze raty,
ostatnia jest anulowana". Wtedy **plan nie jest tylko listą rat — plan składa się z punktu
startowego i reguł, które mówią, jak plan ewoluuje w odpowiedzi na wykonanie**. W symulacji
nie wystarczy sprawdzić, czy rata spłacona: musisz przeliczyć deltę, sprawdzić warunki,
uruchomić przejścia i zbudować **nową wersję planu wynikającą z poprzedniej**. Nadal
symulowalne, ale pojawia się kolejny problem:

### 8.5 Efekty uboczne zmiany planu — dwa podejścia

Zmiana planu często ma "grube" efekty uboczne: maile, tworzone zadania, uruchamiane
integracje, zmiany statusów w innych systemach. Chcesz użyć **dokładnie tego samego kodu**
w symulacji, ale efekty nie mogą się wydarzyć (nie wyślesz maila o nowym harmonogramie
"w symulacji").

1. **System in-memory na czas requestu symulacji** (architektonicznie cięższe, bardzo
   praktyczne). Jeśli baza, wysyłka maila, publikowanie eventów są abstrahowane
   i wstrzykiwane (a powinny być), stawiasz na czas jednego requestu cały system w pamięci,
   jak w testach: baza in-memory, zaślepiony email sender, atrapy integracji. Odpalasz
   **dokładnie ten sam kod co na produkcji** — te same reguły, warunki, przejścia planu —
   a wszystkie efekty uboczne trafiają w próżnię. Na końcu zbierasz wynik: nowy plan, deltę,
   metryki, decyzję. Szczególnie przydatne przy złożonym, rozproszonym kodzie, który nie
   powstawał z myślą o symulacjach.
2. **Functional Core / Mutable Shell** (czystsze koncepcyjnie, trudniejsze w praktyce; wymaga
   założeń modelarskich od startu implementacji). W Functional Core liczysz wszystko czysto
   funkcyjnie — bez zapisu, bez maili, bez efektów ubocznych — i dostajesz wynik: listę zmian
   planu, decyzji oraz efektów, które *powinny* się wydarzyć, a jeszcze się nie wydarzyły.
   Dopiero Mutable Shell wykonuje efekty uboczne — a w kodzie symulacji ich **nie
   wykonujesz**, tylko wyświetlasz albo zapisujesz do tabeli wyników symulacji / ofert.

Obserwacja praktyczna autorów: **projektantom częściej udaje się zaślepić infrastrukturę
stubami, niż poprawnie zbudować Functional Core** — dlatego w realnych systemach częściej
widać podejście 1 i jest ono całkowicie OK, jeśli stosowane świadomie.

### 8.6 Warstwa decyzji: delta nie zawsze powstaje wprost ze zdarzeń

Liczenie delty często wygląda jak arytmetyka, ale symulacja planu i wykonania bywa
**pełnoprawnym problemem algorytmicznym**. W Domain Drivers istnieje cały moduł symulacyjny
oparty na **wielowymiarowym problemie plecakowym**, gdzie pytania dotyczą scenariuszy, nie
pojedynczych faktów: "co, gdybyśmy mieli więcej zasobów?", "czy kupić koparkę?", "czy zamknąć
projekt?", "czy brać nowy przetarg?", "jak rozłożyć zasoby między projekty?", "które projekty
dowieziemy, a które odpadną?".

Kluczowe: **delta nie powstaje bezpośrednio ze zdarzeń**. Zdarzenia (zakup koparki,
zwolnienie zasobu, wygranie przetargu) nie wpadają wprost do porównania plan vs wykonanie —
najpierw przechodzą przez **algorytm dopasowania**, który buduje konkretny wynik operacyjny
(przypisanie zasobów do projektów w danym wariancie świata). Dopiero ten wynik — nie surowe
zdarzenia — jest materiałem do liczenia delty. **Między zdarzeniami a deltą często istnieje
warstwa decyzji**, tworząca dane, które dopiero mają sens do porównania oczekiwań
z rzeczywistością — zarówno w analizie "co się stało", jak i w pytaniu "co by było gdyby".

Cały moduł symulacji działa **bezstanowo** — to esencja symulacji: ta sama logika, te same
reguły, zero efektów ubocznych, pełna swoboda zadawania pytań. System staje się wtedy
narzędziem do podejmowania złożonych decyzji biznesowych.

---

## 9. Architektura (L06)

### 9.1 Model przepływu

Najprostszy sposób myślenia o architekturze archetypu to **strumienie zdarzeń**: coś się
wydarzyło, ktoś podjął decyzję, coś zostało wykonane. Strumienie zasilają plan, wykonanie
albo oba jednocześnie — czasem nie bezpośrednio, lecz przez **mapper**, który:

- wyrównuje rozdzielczość,
- agreguje zdarzenia,
- buduje pochodne struktury (np. wynik dopasowania zasobów — warstwa decyzji z 8.6).

Dopiero **pomiędzy tak powstałymi strukturami działa delta, zasilana wstrzykiwalnymi
regułami** (politykami).

```
[zdarzenia intencji] ──┐
                       ├─► (mapper: rozdzielczość / agregacja /
[zdarzenia faktów]  ───┘    algorytm dopasowania)
                               │               │
                           ┌───▼───┐       ┌───▼────┐
                           │ PLAN  │       │WYKONANIE│   (projekcje, niemutowalne
                           └───┬───┘       └───┬────┘    na poziomie modelu)
                               └─────┬─────────┘
                                 ┌───▼───┐
                                 │ DELTA │ ◄── wstrzykiwane polityki
                                 └───────┘     liczenia / interpretacji
```

### 9.2 Wymiar organizacyjny: kto jest właścicielem czego

- Czasem plan i wykonanie należą do **jednego zespołu**; czasem są **rozdzielone
  organizacyjnie**: jeden zespół planuje, inny realizuje, jeszcze inny raportuje, robi
  rekonsyliację albo analitykę. Archetyp działa w obu przypadkach, ale konsekwencje są inne.
- Przy dwóch zespołach szybko potrzebny jest **publiczny język porównania** — nie "nasza
  tabela kontra wasza tabela", tylko wspólne rozumienie: co porównujemy, na jakich strukturach
  liczymy deltę i co ta delta znaczy.
- **Delta jest kontraktem**, nie prywatnym algorytmem jednego zespołu — zestawem struktur
  i operacji, które każdy rozumie tak samo, nawet jeśli interpretuje wynik inaczej.
- **Kto odpowiada za deltę?** Bardzo często nie powinien to być ani zespół planu, ani zespół
  wykonania — każdy policzyłby "nadwyżkę" po swojemu. Strategie liczenia i interpretacji delty
  powinny być **konfigurowalne, rozszerzalne i możliwie niezależne od core'owych modeli**.
- Najlepszy wzorzec: coś w rodzaju **Open Host Service** — wspólne struktury i punkty
  wejścia, a każdy zespół dopisuje swoją politykę, swoją interpretację i swoje "co by było
  gdyby", trzymając się tej samej algebry. To samo plan + to samo wykonanie, ale różne
  sposoby patrzenia na różnice.

### 9.3 Mapa kontekstów

Plan, wykonanie, delta i symulacje mają **swoje miejsca na mapie kontekstów, swoje
odpowiedzialności i swoje granice** — to wartość architektoniczna archetypu.

### 9.4 Integracje z innymi archetypami

| Archetyp | Relacja z Plan vs Wykonanie |
|---|---|
| **Accounting** | Accounting uogólnia się do zarządzania wartością i transakcjami — delta NIE uogólnia się analogicznie (zawsze jest "o czymś"). W domenie płatności wykonanie (faktyczne wpłaty, kwoty po prowizji/przewalutowaniu) styka się z zapisami wartości; "rata 1200 zł" to zachowanie operacyjne mapujące się m.in. na wiele zapisów wartości. |
| **Party (role/odpowiedzialności)** | Analogiczny kontrast jak z Accountingiem: Party uogólnia relacje między podmiotami do ról; delta pozostaje konkretna. Polityki delty bywają zależne od roli/segmentu podmiotu (klient premium). |
| **Produkt (katalog)** | Problem rozdzielczości planu i wykonania naturalnie odsłania archetyp produktu: "300 sztuk w miesiącu" czy "dostawa w piątek" to nie fakty katalogowe, tylko zachowania operacyjne — produkt mapuje się na wiele procesów i instancji dostępności. Pytania o rozdzielczość w delcie wypływają jako pytania operacyjne do katalogu produktów. |
| **Pricing** | Symulacje what-if obejmują także ceny ("co, gdybyśmy dziś zmienili ceny...") — symulować można ceny, polityki, progi, klasyfikacje niezależnie od delty, ale w jednym systemie te symulacje korzystają z tych samych zasad (niemutowalność, brak efektów ubocznych, te same struktury co produkcja). |
| **Ordering (Order/Fulfillment)** | E-commerce'owa inkarnacja archetypu: Order = obietnica (plan), Fulfillment = rzeczywistość (wykonanie); delta decyduje o zwrotach, reklamacjach, chargebackach, korektach faktur. |
| **Algorytmy / optymalizacja** | Między zdarzeniami a deltą często jest warstwa decyzji — algorytm dopasowania (np. wielowymiarowy problem plecakowy w Domain Drivers), którego wynik dopiero staje się materiałem porównania. |

### 9.5 Dlaczego ten archetyp jest ważny — cztery perspektywy

- **Biznesowa:** odpowiadasz na "dlaczego jest tak, jak jest" i "co by było, gdyby było
  inaczej" — bez zgadywania i ręcznego Excela.
- **Analityczna:** delta przestaje być jednorazowym raportem, a staje się strukturą
  porównywalną w czasie, między zespołami i scenariuszami. Dodatkowo archetyp daje
  **przenośne narzędzie analityczne**: pozwala świadomie zapytać, jakiej szczegółowości
  (rozdzielczości) potrzebujesz w cenie, produkcie, zasobie czy zamówieniu, żeby biznes
  realnie dało się prowadzić.
- **Programistyczna:** logika przestaje być upchana w jednym bycie, testy stają się prostsze,
  modele przestają udawać coś, czym nie są.
- **Architektoniczna:** plan, wykonanie, delta i symulacje mają swoje miejsca na mapie
  kontekstów, odpowiedzialności i granice.

---

## 10. Tabela mapowania: pojęcie domenowe → element archetypu

| Pojęcie domenowe | Element archetypu |
|---|---|
| Harmonogram spłat, rata planowa 1200 zł do 15-ego | **Plan** (PlannedPayment / harmonogram jako byt) |
| Faktyczne wpłaty, przelewy (także dzielone na 2–5), wpłata 800 dzień później | **Wykonanie** (ActualPayment / lista faktycznych płatności) |
| "O ile to się rozjechało", odchylenie, opóźnienie raty | **Delta** (struktura, nie liczba) |
| Tolerancja 2/3/5 dni, dni robocze vs kalendarzowe, weekendy, karencja, przywilej premium | **Polityka liczenia/interpretacji delty** (wstrzykiwana) |
| Trasa/czas/ilość/punkty planowane dostawy | **Plan** (plan czasu, trasy, ilości, punktów w "dostawie") |
| Faktyczny przyjazd 16:30, 16 palet, objazd | **Wykonanie** |
| Okno czasowe zmieniające wagę spóźnienia, interpretacja braków wg towaru/klienta | **Polityka delty** |
| Zlecenie: 300 szt. / 4 h / 0% odpadów | **Plan** |
| 270 szt. / 5 h / 4% odpadów, awaria taśmy 20 min | **Wykonanie** (+ kontekst interpretacji) |
| Ścieżka rekrutacji (screening→rozmowa→zadanie→finał→oferta) | **Plan** (graf/sekwencja) |
| Faktyczny przebieg: pominięte etapy, cofnięcia, wznowienia | **Wykonanie** (zmiana topologii → delta grafowa) |
| Order (obietnica: co, ile, kiedy, za ile) | **Plan** |
| Fulfillment (co wysłano, kiedy, w ilu paczkach, skąd, w jakim stanie) | **Wykonanie** |
| Target/forecast sprzedażowy; plan zapotrzebowania sieci | **Plan** (jawny w języku domeny) |
| "Ile dowieźliśmy"; faktyczna generacja energii | **Wykonanie** (jawne) |
| Miesięczny plan vs dzienne zdarzenia; eventy IoT/GPS, paczki API partnera | **Problem rozdzielczości** → mapper / dwukierunkowe mapowanie |
| Wynik dopasowania zasobów do projektów (knapsack) | **Warstwa decyzji** między zdarzeniami a deltą |
| "Zwiększ SLA do X", "przesuń harmonogram o tydzień" | **Komenda/intencja** (task-based UI, audyt intencji) |
| Tabele `audit_*`, historia zmian pól | **Historia stanu** (niewystarczająca — brak historii intencji) |
| "Jeśli spłacisz 3 pierwsze raty, ostatnia anulowana" | **Reguły ewolucji planu** (plan = punkt startowy + reguły reagujące na wykonanie) |
| Scenariusz "a gdyby raty ±5 gr uznać za spłacone" | **Symulacja what-if** (alternatywna interpretacja historii) |
| Wspólny język porównania między zespołami | **Delta jako kontrakt** (Open Host Service + polityki per zespół) |
| `isPremiumLateAllowed`, `NOT_REALLY_ORDER`, flaga "tryb symulacji" | **Antywzorce** — semantyka delty/planu wciśnięta w encję |

---

## 11. Pytania do biznesu przy odkrywaniu archetypu

### Odkrywanie dwóch światów

1. Gdy mówicie "[rata/dostawa/zlecenie/kandydat]" — co *miało* się wydarzyć, a co *faktycznie*
   się wydarzyło? Czy to są dla was dwie różne rzeczy?
2. Skąd bierze się to, co "miało być"? Kto to ustala, kiedy i na jakiej podstawie? Czy to
   gdzieś istnieje zapisane, czy jest "wyliczane" z innych danych?
3. Czy ktokolwiek pyta o historyczny kształt planu ("jaki był plan dla X w dniu Y")?
4. Czy wynik obliczeń jest punktem odniesienia — porównujecie go w czasie, z wykonaniem,
   z wariantami? (Jeśli nie zapisujecie, nie porównujecie, nie audytujecie, nie symulujecie —
   archetyp może nie być potrzebny.)

### Semantyka delty i polityki

5. Co dokładnie znaczy "spóźnione" / "brak" / "nadwyżka" / "zgodne"? Czy różne działy
   definiują to inaczej? (call center vs windykacja: 2 dni vs 7 dni bez weekendów)
6. Jakie tolerancje stosujecie? Dni robocze czy kalendarzowe? Co z weekendami i świętami?
7. Czy istnieją wyjątki per segment klienta (premium), per towar, per okno czasowe,
   per skala (4 vs 400 palet)?
8. Czy wcześniejsza historia (nadpłaty) kompensuje obecne odchylenia?
9. Czy pole o tej samej nazwie po stronie planu i wykonania na pewno znaczy to samo?
   (amount: przed czy po prowizji/zaokrągleniu/przewalutowaniu?)

### Rozdzielczość

10. W jakich jednostkach wyrażony jest plan, a w jakich przychodzi wykonanie? (miesiąc vs
    dzień, rata vs wiele przelewów, zlecenie vs eventy IoT)
11. Czy "300 sztuk w miesiącu" znaczy to samo co "10 sztuk dziennie przez 30 dni"? Kto
    definiuje to mapowanie?
12. Czy kontrolujecie format zdarzeń wykonania (własny system), czy przychodzą z zewnątrz
    (GPS kurierów, API partnera)?

### Intencje i wersjonowanie

13. Gdy plan się zmienia — jak odróżniacie decyzję biznesową od korekty błędu? Renegocjację
    umowy od pomyłki zapisu?
14. Jakie czynności (taski) wykonują ludzie, zmieniając plan? ("zwiększ SLA", "przesuń
    harmonogram") Czy system zapisuje kto, kiedy i dlaczego?
15. Które plany nigdy nie były poprawiane, tylko faktycznie dowiezione? Ile odchyleń wynika
    z rynku, a ile z naprawiania błędów planowania? (test: czy system w ogóle umie odpowiedzieć)

### Reaktywność planu i symulacje

16. Czy wykonanie może zmieniać plan? ("spłać 3 pierwsze raty → ostatnia anulowana") Jakie są
    reguły ewolucji planu?
17. Jakie pytania "co by było gdyby" chcielibyście zadawać — o przyszłość (zmiana cen, popytu)
    i o przeszłość (inna decyzja 2 lata temu, inna polityka tolerancji na historii)?
18. Czy chcecie porównywać jedno wykonanie z wieloma planami (pierwotny, po zmianie SLA,
    alternatywny)?
19. Jakie efekty uboczne niesie zmiana planu (maile, zadania, integracje, statusy w innych
    systemach) — czego nie wolno uruchomić podczas symulacji?

### Organizacja

20. Kto jest właścicielem planu, kto wykonania, a kto raportowania/rekonsyliacji? Czy
    potrzebny jest wspólny, publiczny język porównania między zespołami?
21. Kto powinien decydować, jak liczy się opóźnienie/brak/nadwyżkę — i czy na pewno ma to być
    zespół planu albo wykonania? (zwykle nie powinien)

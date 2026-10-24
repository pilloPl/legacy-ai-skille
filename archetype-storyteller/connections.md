# Reguły łączenia wystąpień archetypów

Jedyne źródło prawdy o tym, które wystąpienia archetypów wolno ze sobą połączyć w opowieści
i na rysunku. **Wszystko, czego nie dopuszcza ten plik, pozostaje niepołączone**, nawet jeśli
połączenie wydaje się oczywiste. Reguły dopisuje wyłącznie autor skilla (Kuba); skill sam ich
nie wymyśla i nie rozszerza.

Są **dwa osobne rodzaje połączeń**. Nie mieszaj ich: mają inne reguły, inaczej się je
opisuje i inaczej rysuje.

| | A. Integracja | B. Odniesienie semantyczne |
|---|---|---|
| Co to jest | jeden moduł **korzysta z drugiego**: woła go, zleca mu coś, pyta go, czeka na wynik | jeden moduł **pamięta, do czego się odnosi**: trzyma identyfikator albo własny rzut czegoś z drugiego |
| Czy coś płynie w trakcie działania | tak | nie; to tylko wskazanie albo kopia |
| Kto może | tylko Ordering i Oferta (plus samowolka Rules) | każdy archetyp |
| Na rysunku | strzałka ciągła z etykietą, co jest zlecane | linia przerywana z nazwą identyfikatora lub rzutu |
| Oznaczenie | I1, I2 | S |

## A. Integracje (strzałki)

Integrować się z innymi modułami wolno tylko dwóm:

| # | Kto integruje | Z kim | Warunek |
|---|---|---|---|
| I1 | Ordering | każdy inny archetyp z rejestru oraz Oferta | W wejściu jest cytat pokazujący, że to zlecenie korzysta z tego wystąpienia (zamawia je, każe coś policzyć, zarezerwować, zaksięgować, sprawdzić). |
| I2 | Oferta | każdy inny archetyp z rejestru | Oferta istnieje (patrz niżej) i w wejściu jest cytat pokazujący, że złożenie oferty wymaga tego wystąpienia. |

Wszystkie pozostałe pary archetypów **nie integrują się ze sobą bezpośrednio**. Product nie
woła Pricingu, Inventory nie woła Accountingu, Pricing nie woła Party. Jeżeli w biznesie
coś ich spina, robi to Ordering albo Oferta, a między nimi samymi może istnieć najwyżej
odniesienie semantyczne (część B).

### Oferta (moduł ofertujący)

Oferta nie jest archetypem z rejestru i nie ma własnego agenta ani karty fit-check. Jest
osobnym modułem, który powstaje, gdy trzeba **złożyć ze sobą kilka wystąpień**, żeby
odpowiedzieć „czy, kiedy, komu i na jakich warunkach mogę to zaoferować", a logika tego
składania nie należy do żadnego ze składanych wystąpień.

Oferta może powstać z różnych zestawień. Poniższe to przykłady, nie zamknięta lista:

| Zestawienie | Co Oferta składa |
|---|---|
| Product + Inventory | pozycję oferty z zasobami, które trzeba zająć (opisane szczegółowo niżej) |
| Product + Pricing | pozycję oferty z cennikiem obowiązującym teraz, od jutra, w danym okresie |
| Product + Party | pozycję oferty z tym, dla kogo jest dostępna |
| Product + Inventory + Pricing + Party | wszystko naraz: co, z jakich zasobów, za ile i dla kogo |

### Przykład: Product + Inventory

To jest jeden z przykładów powstania Oferty, rozpisany dokładnie, bo najłatwiej go przeoczyć.

Pozycja oferty **nie mapuje się jeden do jednego** na zasób. Product mówi, co klient kupuje;
Inventory wie, co jest ograniczone i zajęte. Logika przekładu między nimi (jakie zasoby,
ile, na jak długo, z jakimi zapasami) nie należy do żadnego z nich. Należy do Oferty.

Przykład wzorcowy: produktem jest masaż 2 h. Żeby go zaoferować, trzeba zarezerwować
masażystę, salę i dwa ręczniki, przy czym masażystę na 2 h 10 min, a nie na 2 h, i ten
naddatek zależy od miejsca.

Po czym poznać tę logikę w wejściu:

- **Rozwinięcie**: jedna pozycja oferty → wiele zasobów różnych rodzajów.
- **Ilości**: różna liczba sztuk każdego zasobu.
- **Czas inny niż czas produktu**: bufory, przygotowanie, sprzątanie, dojazd, przezbrojenie.
- **Zależność od kontekstu**: przekład zmienia się z miejscem, wariantem, porą, klientem.
- **Wszystko albo nic**: oferta możliwa tylko wtedy, gdy wszystkie zasoby są dostępne
  w pasujących do siebie oknach.

W tym przykładzie Oferta integruje się z oboma: `Oferta → Product`, `Oferta → Inventory`.
Strzałki Product ↔ Inventory nie ma nigdy. Wypisz te z pięciu punktów powyżej, które mają
cytat; pozostałe oznacz „wejście milczy" i nie dopowiadaj buforów ani ilości. Gdy przekład
jest jeden do jednego (sztuka towaru = sztuka na stanie), opisz Ofertę jako trywialną.

Ten sam problem w innych dziedzinach (do rozpoznawania wzorca):

| Dziedzina | Pozycja oferty (Product) | Co trzeba zająć (Inventory) | Gdzie przekład nie jest 1:1 |
|---|---|---|---|
| Hotel | pobyt 2 noce ze śniadaniem | pokój, miejsca na śniadaniu, parking | pokój zajęty dłużej o sprzątanie przed przyjazdem; śniadanie ×2 dni ×liczba gości |
| Przychodnia | kolonoskopia w znieczuleniu, 30 min | gabinet, lekarz, anestezjolog, endoskop, łóżko wybudzeniowe | każdy zasób na inny czas; endoskop dodatkowo na dezynfekcję |
| Linia lotnicza | bilet Warszawa–Nowy Jork z przesiadką | miejsce na każdym odcinku, limit bagażu | jeden bilet = miejsca w dwóch samolotach, wszystko albo nic |
| Wypożyczalnia aut | wynajem na 3 dni z fotelikiem | auto, fotelik | auto zablokowane dłużej o mycie i przegląd, zależnie od oddziału |
| Szkolenia | kurs dwudniowy stacjonarny | sala, trener, laptopy, catering | trener zajęty także w dniu dojazdu, gdy kurs jest w innym mieście |
| Serwis terenowy | montaż klimatyzacji | dwóch monterów, auto serwisowe, urządzenie z magazynu | czas ekipy = montaż + dojazd zależny od strefy |
| Restauracja | kolacja degustacyjna, 2 h | stolik, kelner, porcje składników | stolik na 2 h 30 min, bo trzeba go nakryć na nowo |
| Telekom | internet światłowodowy 1 Gb/s | port w szafie, router, termin technika | jedna usługa = zasób sieciowy + sprzęt + okno czasowe człowieka |
| Produkcja | wyrób z katalogu | materiały wg receptury, maszyna, operator | maszyna zajęta także na przezbrojenie zależne od poprzedniego wyrobu |
| E-commerce | zestaw prezentowy | trzy różne towary, pudełko | jedna pozycja oferty = kilka pozycji stanu, wszystko albo nic |
| Wydarzenia | bilet VIP na koncert | miejsce w sektorze, miejsce parkingowe, wejście do strefy | jeden bilet zajmuje trzy różne pule |
| Salon fryzjerski | koloryzacja z modelowaniem | fryzjer, fotel, myjnia, farba | fryzjer wolny w czasie działania farby, fotel zajęty cały czas |

### Zasady dla Oferty (każde zestawienie)

1. Oferta powstaje, gdy co najmniej dwa składane wystąpienia mają werdykt PASUJE i jest
   cytat z wejścia pokazujący logikę ich składania. Sama obecność dwóch archetypów w tym
   samym biznesie Oferty nie tworzy.
2. Nazwij Ofertę językiem biznesu (np. „Układanie wizyt", „Kompletowanie pobytu",
   „Oferta sezonowa") i napisz, co składa, z cytatami.
3. Oferta integruje się z każdym składanym wystąpieniem według I2, każda strzałka z własnym
   cytatem. Wystąpienia składane przez Ofertę nie dostają strzałek między sobą.
4. Ordering może integrować się z Ofertą (I1), jeśli wejście pokazuje, że zlecenie powstaje
   z oferty albo o nią pyta.
5. W jednym biznesie może być kilka Ofert, jeśli wejście pokazuje osobne logiki składania.

### Samowolka: Rules

**Rules & Scoring** nie podlega regułom integracji. Jego wystąpienie
wolno zintegrować z dowolnym innym (także z innym Rules), w dowolnym kierunku. Powód: to
mechanika nakładana na inne modele, więc przyczepia się do tego, co akurat jest. Wymóg
cytatu z wejścia zostaje. W opisie zamiast numeru reguły podaj „(samowolka)".

## B. Odniesienia semantyczne (linie przerywane)

Odniesienie semantyczne to nie integracja. Moduł **niczego od drugiego nie chce**; trzyma
tylko u siebie informację, która pozwala zrozumieć, skąd coś się wzięło albo czego dotyczy.
Są dwie postacie:

- **Identyfikator**: nieprzezroczysta wartość (string) wskazująca coś w innym module, np.
  `sourceId` we wpisie księgowym. Bez klucza obcego, bez wspólnego obiektu, bez znajomości
  budowy tamtej rzeczy.
- **Rzut**: własna, okrojona kopia tego, co moduł potrzebuje wiedzieć o czymś z innego
  modułu, utrzymywana po swojej stronie, np. Inventory trzyma swój rzut typów produktów.

Odniesienie semantyczne **może mieć każdy archetyp do każdego**. To jest forma promowana:
moduły wiedzą o sobie tyle, ile mieści identyfikator albo rzut, i nic więcej.

Przykłady (lista otwarta, do rozpoznawania wzorca):

| Kto trzyma | Do czego | Co to mówi |
|---|---|---|
| Accounting | Oferta / Product / Ordering / Pricing | `sourceId` w transakcji: z czego wynika ten wpis (z której oferty, produktu, zamówienia, wyceny); tak się śledzi pochodzenie wartości |
| Inventory | Product | rzut typów produktów: jakie rodzaje rzeczy w ogóle da się mieć na stanie |
| Product | Pricing | który cennik obowiązuje dla tej pozycji |
| Oferta | Pricing | identyfikator cennika obowiązującego w danym okresie |
| Ordering | Party | identyfikator zlecającego, płatnika, odbiorcy |
| Oferta | Party | identyfikator podmiotu, dla którego jest oferta |
| Delta | Ordering | którego zlecenia dotyczy plan i wykonanie |
| Pricing | Product | rzut parametrów produktu potrzebnych do wyliczenia |

Zasady:

1. Oba końce muszą istnieć jako wystąpienia z werdyktem PASUJE (albo jako Oferta).
2. Potrzebny jest cytat z wejścia pokazujący, że ta informacja jest tam trzymana albo że
   biznes tak coś śledzi („na wpisie widać numer zamówienia", pole `sourceId`, „cennik
   przypisany do produktu"). Samo to, że dwa archetypy mogłyby się do siebie odnosić,
   niczego nie dowodzi.
3. Odniesienie jest jednokierunkowe: od tego, kto trzyma, do tego, na co wskazuje. Strona
   wskazywana nic o nim nie wie.
4. Odniesienie nie zastępuje integracji i jej nie implikuje. Product może wskazywać cennik
   (S), a mimo to nie integruje się z Pricingiem; wycenę zleca Ordering albo Oferta (I1, I2).
5. Ta sama para może mieć oba połączenia naraz: Ordering integruje się z Party (I1) i trzyma
   identyfikator podmiotu (S). Opisz je osobno.
6. W kodzie legacy klucz obcy, wspólna tabela albo osadzony obiekt tam, gdzie wystarczyłby
   identyfikator lub rzut, odnotuj jako rozjazd (dla fazy szczegółów), a połączenie opisz
   jako odniesienie semantyczne.

## Jak stosować całość

1. Połączenia rozważasz dopiero po raporcie dopasowania, wyłącznie między wystąpieniami
   z werdyktem PASUJE.
2. Najpierw sprawdź, czy powstaje Oferta (z dowolnego zestawienia; Product + Inventory to
   tylko przykład).
3. Potem integracje: tylko I1, I2 i samowolka. Każda strzałka z własnym cytatem.
4. Potem odniesienia semantyczne: dowolne pary, każde z własnym cytatem.
5. Połączenie łączy dwa konkretne wystąpienia, nie dwa archetypy w ogóle. Przy dwóch
   wystąpieniach Ordering każde oceniasz osobno.
6. Brak cytatu = brak połączenia. Same wyspy to poprawny wynik.

## Czego nie wolno

- Rysować strzałek integracji między archetypami innymi niż Ordering, Oferta i Rules.
- Zamieniać odniesienia semantycznego na strzałkę integracji „bo skoro wskazuje, to pewnie
  woła".
- Łączyć wystąpień na podstawie „powiązań" opisanych w `references/*.md`. Tamte opisy mówią,
  jak archetypy mogą współpracować w ogóle; nie są regułami łączenia dla tego skilla.
- Wyznaczać „archetypu-osi", warstw, kierunków upstream/downstream ani granic modułów.
  Jedyny moduł spoza rejestru, jaki wolno dopisać, to Oferta.
- Dopisywać reguł bez wyraźnego polecenia autora.

## Miejsce na kolejne reguły

<!-- Kuba: nowe integracje dopisuj do tabeli w części A, nowe przykłady odniesień do tabeli
     w części B. -->

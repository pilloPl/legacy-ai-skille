# Archetyp: Matching / Optymalizacja dopasowania (General Assignment → wielowymiarowy plecak)

> **Pochodzenie materiału**: ten archetyp pochodzi ze szkolenia **Domain Drivers, moduł M03**
> (lekcje L04–L06: ryzyko i rentowność harmonogramu → liczenie zysków po transferze zasobu →
> General Assignment Problem i wielowymiarowy plecak). **NIE** pochodzi z kursu „Archetypy
> Oprogramowania" — nie szukaj go w tamtych transkrypcjach. Kod referencyjny:
> `archetypes-final/general-assignment` (Java 21), tagi z Domain Drivers: `simulation-task`,
> `simulation-done`, `agnostic-knapsack`.

---

## 1. Esencja archetypu

**Optymalizujemy dopasowanie jednego zbioru do drugiego.** Mamy pulę rzeczy do rozdysponowania
(zasoby, ludzie, maszyny, budżet, sloty) i pulę rzeczy, które tego potrzebują (projekty, zadania,
zamówienia, stanowiska), a biznes chce wybrać **taką kombinację, która maksymalizuje jakąś
wartość** — zysk, wizerunek, wykorzystanie, cokolwiek. W matematyce to **General Assignment
Problem** (dopasowanie agentów do zadań). Jeśli założymy, że agent (zasób) kosztuje tyle samo
niezależnie od zadania (projektu), w którym się znajdzie, problem **redukuje się do problemu
plecakowego** — a ponieważ jedno „zadanie" wymaga zwykle wielu różnych rzeczy naraz, do
**wielowymiarowego problemu plecakowego**.

Słowa „dopasowanie", „skojarzenie", „optymalizacja", „alokacja" są tu **słowami-mostami** —
mostami prowadzącymi od języka biznesu do gotowych algorytmów optymalizujących. Sedno archetypu
nie leży w algorytmice, tylko we wniosku z Domain Drivers:

> „Wiele problemów można sprowadzić do znanych problemów — ale żeby je sprowadzić, muszę wiedzieć,
> wśród jakich znanych problemów w ogóle mogę szukać."

Drugi filar esencji: wynik optymalizacji żyje w **osobnym modelu symulacji** („co by było,
gdyby…"), a nie w modelu faktycznych alokacji. Symulator **nie decyduje, co ma być teraz —
odpowiada na pytanie, co by było, gdyby**. To nowy język, nowy model, osobny kontekst.

---

## 2. Sygnały dopasowania (triggery językowe)

Biznes lub kod mówi którymś z tych języków — sprawdź ten archetyp:

- **„dopasowanie" / „skojarzenie" / „przypisanie" / „alokacja"** — zwłaszcza zbioru do zbioru:
  ludzie→projekty, kandydaci→stanowiska, maszyny→zlecenia, kierowcy→kursy, mentorzy→podopieczni,
  reklamy→sloty, kontenery→statki;
- **„optymalnie rozłożyć / rozdysponować zasoby"** — „jak optymalnie rozkładać zasoby między
  projektami?" (dosłowny cytat z L04);
- **„który zestaw wybrać, żeby zmaksymalizować…"** — zysk, przychód, wykorzystanie, wizerunek;
  wybór **portfela** projektów/zleceń przy ograniczonej puli;
- **„co by było, gdyby…"** — gdybym dokupił zasób, wytrenował pracownika, zamknął projekt,
  sprzedał maszynę, przeniósł kogoś z projektu A do B? (pytania symulacyjne what-if);
- **„czy opłaca się dokupić / wyszkolić / wynająć?"** — porównanie zysku z nowym zasobem w puli
  kontra bez niego, z uwzględnieniem ceny pozyskania;
- **„gdzie przypisać wolny zasób?"** — „mam ludzi na ławeczce / fury z leasingu, automatycznie
  dopasujcie ich do projektów";
- **„projekt się uda, jeśli mam wszystkie wymagane zasoby w czasie"** — wartość pojawia się tylko
  przy **kompletnym** zaspokojeniu wymagań (wszystkie sloty/Demands zapełnione, nie częściowo);
- **„rentowność / opłacalność harmonogramu"**, „symulacja stanów innych projektów, gdyby
  zamknięto jakiś konkretny";
- **ograniczona pula + konkurujący biorcy** — zasobów jest mniej niż potrzeb i trzeba **wybierać**,
  komu dać (gdyby starczało dla wszystkich, nie byłoby czego optymalizować);
- w kodzie legacy: pętle brute-force „przypisz po kolei do każdego i porównaj zysk", snapshoty
  prawdziwych encji do „eksperymentów", rzucanie wyjątkiem żeby ORM nie zapisał symulacji —
  to proceduralnie zakopany matching.

Słowa kierunkowe przy researchu (z L06): *problemy kombinatoryczne, skojarzenia grafów, problem
pakowania, bin packing, assignment problem, knapsack* — „jeśli natrafiłeś na nie, kierunek był
świetny".

---

## 3. Anty-sygnały (kiedy to NIE ten archetyp)

- **Proste przypisanie bez wyboru** — zasobów starcza dla wszystkich albo przypisanie jest
  jednoznaczne (regułowe: „faktura klienta X zawsze do księgowej Y"). Nie ma czego maksymalizować,
  nie ma konkurencji o pulę → zwykły CRUD/reguła, nie optymalizacja.
- **Brak funkcji wartości** — jeśli nikt nie umie powiedzieć, co znaczy „lepsze" dopasowanie
  (żadnej kasy, wizerunku, metryki), to nie jest problem optymalizacyjny, tylko problem
  nieodkrytych wymagań. Najpierw pytania do biznesu, nie algorytm.
- **Małe zbiory, stabilne na zawsze** — dla kilku–kilkudziesięciu elementów **brute-force
  zaprojektowany ręcznie też będzie w porządku** (wprost z L06). Nie wprowadzaj maszynerii
  plecakowej, gdy pętla „sprawdź każdą kombinację" liczy się w milisekundach i biznes nie
  zapowiada tysięcy elementów. (Uwaga: szef z L04 mówił o *tysiącach* projektów i *tysiącach*
  sekatorów — wtedy brute-force rośnie wykładniczo i to jest sygnał NA archetyp.)
- **Dopasowanie 1:1 z preferencjami dwustronnymi** (stabilne małżeństwa, skojarzenia w grafie
  dwudzielnym bez wag wielowymiarowych) — to pokrewny, ale inny znany problem; patrz powiązanie
  z archetypami grafowymi (sekcja 8).
- **Harmonogramowanie z zależnościami kolejności** (co po czym) — to sortowanie topologiczne /
  ścieżka krytyczna (archetyp grafowy), nie plecak. Plecak nie wie nic o kolejności zadań.

---

## 4. Model archetypu: mapowanie ODWROTNE do intuicji

To najważniejsza i najbardziej zdradliwa część. **Pierwsza intuicja jest zła** i Domain Drivers
przerabiają ją wprost w L06:

> „Pierwsza intuicja jest taka, że mam plecaki, czyli projekty, i do plecaków wkładam zasoby…
> Czy aby na pewno? Tu jest na odwrót. To **projekt jest pakowanym przedmiotem, który ma wartość**,
> a **zasoby, które wszystkie są u ciebie dostępne, to jeden plecak z wielowymiarową pojemnością**."

Czyli:

- **Projekt = przedmiot (Item)** wkładany do plecaka. To on niesie **wartość** (value), którą
  maksymalizujemy — finansową lub wizerunkową.
- **Wymagane zasoby projektu = wielowymiarowa WAGA przedmiotu.** Waga to to, co **tracimy z puli**,
  wkładając przedmiot — nie chcemy jej dużej. Wkładając projekt, zużywamy zasoby z ogólnodostępnej
  puli tak samo, jak przedmiot zużywa pojemność plecaka. (Pułapka metafory: „waga projektu to
  chyba kasa?" — NIE, kasa to wartość; waga to wymagania.)
- **Pula dostępnych zasobów = JEDEN plecak o wielowymiarowej pojemności.** Nie „plecak per
  projekt".
- **Wszystkie wymiary wagi muszą być spełnione naraz.** Jak bagaż podręczny w samolocie: latawiec
  jest lekki, ale ma gabaryt — linia sprawdza **i** wymiary w stelażu, **i** masę. Jeden pasujący
  wymiar nie wystarczy — przedmiot „wystaje". W domenie: projekt wchodzi do wyniku tylko wtedy,
  gdy **każdy** jego Demand znajdzie swoją pojemność.

### Generyczne `isSatisfiedBy`

Klasyczny plecak pyta „czy waga ≤ pozostała pojemność". W domenie pytanie „czy pojemność
zaspokaja wymiar wagi" jest **zmienne** — i tę zmienność się modeluje:

- najczęstszy przypadek: „umiejętność dostępna **w konkretnym czasie**" (skill + TimeSlot);
- ale bywa i tak, że czas w ogóle nie jest określony — ktoś testuje **wizję wykonalności**
  („czy w ogóle mam maszyny w parku maszynowym, zanim zacznę planować terminy?"); wtedy zasób
  jest dawcą wielu umiejętności i pytamy tylko, czy wymagana jest w zbiorze — **bez pytania
  o czas**.

Ukryte założenie „zawsze pytamy o czas" wyszło dopiero przy separacji warstw. Rozwiązanie:
**klient kodu wstrzykuje własną implementację `isSatisfiedBy`** (interfejs/funkcja zależnie od
paradygmatu), a „umiejętność w konkretnym czasie" jest tylko **specyficznym przypadkiem ogólnej
reguły**.

### Separacja słownictwa generycznego od domenowego (tag `agnostic-knapsack`)

Dwie warstwy, jak wcześniej z grafem:

1. **generyczny optymalizator** mówiący wyłącznie językiem plecaka: Item, wartość,
   TotalWeight/WeightDimension, TotalCapacity/CapacityDimension, Result — nie zna słowa „projekt";
2. **warstwa domenowa symulacji** mówiąca językiem biznesu: SimulatedProject, Demands,
   AvailableResourceCapability — i tłumacząca się na język plecaka na granicy.

Po co? **Żeby zamodelować niepewność wyboru algorytmu.** Domain Drivers nie są czarodziejami
algorytmiki — nie wiedzą, czy plecak to najlepszy wybór („wczoraj brute-force, dziś plecak, jutro
może coś lepszego"). Pod stabilnym domenowym API można podmienić optymalizator. Separację
zabezpiecza się **testem architektonicznym**. Bonus odkryty w praktyce: dopiero silna separacja
**uwypukla ukryte założenia** zaszyte w generycznej strukturze (właśnie tak wyszło „zawsze pytamy
o czas"). Czasem wystarczy do tego tabelka ze słowami — mapowanie pojęć na papierze — ale gdy na
niej polegniesz, ratuje techniczna robota z separacją.

### Modelowanie niepewności — „nigdy" i „zawsze"

Gdy biznes mówi „nigdy" albo „zawsze", doświadczony modelarz słyszy: „na razie nie znamy takiego
przypadku" albo „zawsze, z wyjątkiem sytuacji, kiedy nie". Stąd: generyczne `isSatisfiedBy`,
wstrzykiwany komparator/funkcja wartości, wymienny algorytm. **To nie łamie YAGNI** — nie
implementujemy przyszłych wymagań, tylko małym kosztem przygotowujemy na zmianę model, który i tak
musi powstać. Uogólnianie i szukanie części stabilnych bywa **szybsze** niż literalne
implementowanie bieżących wymagań modelem specjalistycznym.

### NP-zupełność → aproksymacje

Problem plecakowy jest **NP-zupełny**: policzenie optimum może być bardzo kosztowne, a brute-force
rośnie wykładniczo (tysiące projektów × setki tysięcy zasobów). Praktyczny wniosek: **istnieją
bardzo dobre, gotowe algorytmy aproksymacyjne** — używamy ich zamiast szukać ideału (w kodzie
referencyjnym: zachłanna aproksymacja z DP, sortowanie przedmiotów po wartości malejąco,
komparator wstrzykiwalny). Nie obiecuj biznesowi „matematycznego optimum" — obiecuj „bardzo dobre
dopasowanie szybko".

---

## 5. Stabilny rdzeń: pula + zdarzenia zasilające (z L04/L05)

Wszystkie szczególne przypadki, które biznes wymienia jednym tchem (szkolenie/upskilling, zakup
z marketplace, wynajem, leasing, zatrudnienie, zwolnienie z projektu, zamknięcie projektu,
zepsucie się maszyny, sprzedaż zasobu), sprowadzają się do **jednej ogólnej zasady**:

> **„Mam nowy zasób w puli za X"** albo **„ubywa zasób z puli"** — a potem znajdź optymalną
> alokację. X to koszt pozyskania: dodatni (zakup, szkolenie), **zero** (zwolnienie z projektu),
> a nawet **ujemny**.

Analogicznie „optymalnie" jest regułą ogólną o zmiennej treści: **czasem kasa (zysk, nie
przychód!), czasem wizerunek**, w przyszłości dowolna mieszanka. Funkcja wartości to parametr
modelu, nie stała. (Szef: „czasem nie optymalizuję pod koszty — z powodów czysto wizerunkowych
chcę skończyć projekt, mimo że na innym zarobiłbym więcej, nawet licząc kary".)

Powtarzalny ruch Domain Drivers: zebrać usłyszane przypadki, **dogenerować ich więcej** (pozorna
komplikacja), znaleźć część stabilną (pula + optymalne dopasowanie), a przypadki szczególne
zmapować do ogólnego modelu — dokładnie jak przy archetypie grafowym.

Jeszcze jedna odkryta zmienność: **zasób może być dawcą wielu umiejętności równocześnie**
(Michał z certyfikatem Javy wpisywany do 3 projektów naraz — programista „się rozdwoi", koparka
nie). W modelu: polityka selekcji umiejętności — „wszystkie naraz" vs „jedna z wielu"
(`ALL_SIMULTANEOUSLY` vs `ONE_OF_ALL`).

---

## 6. Symulacje what-if

Model symulacji odpowiada na pytania, których wcześniej nikt nie mógł zadać — **dobry model
pozwala automatycznie zadawać dobre pytania**:

- **Który zestaw (portfel) projektów wybrać przy obecnej puli?** → optymalne ustawienie:
  lista wybranych projektów + sumaryczna wartość + kto/co je zaspokaja.
- **Czy opłaca się dokupić/wyszkolić/wynająć zasób za cenę C?**
  → `zysk(pula + nowy zasób) − C − zysk(pula)`. Wynik dodatni = opłaca się; ujemny = nie
  (np. drogi Sławek za 9999 przy projekcie wartym 40 → −9959).
- **Zysk z transferu zasobu z projektu A do B (L05):** sprawdź brakujące zasoby i zysk **przed**
  ruchem, wykonaj ruch w symulacji, sprawdź **po**, policz różnicę. „Sprawdzasz, przenosisz,
  sprawdzasz, liczysz."
- **Co by było, gdyby zamknięto projekt?** → jego zasoby wracają do puli (koszt 0), przelicz
  optymalną alokację pozostałych; kara za zerwanie wchodzi do rachunku wartości.
- **Czy sprzedać zasób?** → zarobek ze sprzedaży vs spadek zysku portfela po ubytku z puli
  (uwaga na kary umowne w projektach, które przez to padną).

**Krytyczna reguła architektoniczna:** symulacja NIE może być zaszyta w modelu faktycznych
stanów zasobów i odpalonych projektów. Anty-wzorzec z L05: mutowanie prawdziwej encji `Project`
i rzucanie wyjątkiem na końcu, „żeby mapper bazodanowy nie zapisał zmian", plus ogłoszenie na
Slacku „zaczynam symulację", żeby ludzie nie wchodzili sobie w drogę. Symulacje to **osobny
kontekst** z własnym językiem: cashflow to cashflow, alokacje to alokacje, symulacje to symulacje.

---

## 7. Typowe błędne implementacje

| Błąd | Objaw / dlaczego to boli |
|---|---|
| **Naiwne mapowanie „projekt = plecak"** | Metafora przestrzenna „wkładam zasoby do projektów" prowadzi do modelu per-projekt, w którym nie da się maksymalizować wartości PORTFELA; „gdyby tak naiwnie przełożyć algorytm z książki, można przepaść" |
| **Mylenie wartości z wagą** | „Waga projektu to kasa" — nie: kasa to wartość (maksymalizujemy), waga to wymagane zasoby (zużywamy z puli) |
| **Jednowymiarowa waga** | Najprostsza forma plecaka (jedna liczba) nie wystarcza — projekt wymaga wielu rzeczy naraz i WSZYSTKIE muszą być spełnione; częściowe spełnienie ≠ częściowa wartość |
| **Brak separacji warstw** | Słownictwo domenowe wplecione w algorytm → nie da się podmienić algorytmu (niepewność niezamodelowana), ukryte założenia pozostają niewidoczne |
| **Ukryte założenie „zawsze pytamy o czas"** | `isSatisfiedBy` zabetonowane na skill+TimeSlot; wizja wykonalności bez terminów staje się niemożliwa; lek: wstrzykiwalne `isSatisfiedBy` |
| **Symulacja na produkcyjnych encjach** | Mutowanie prawdziwych alokacji + wyjątek/rollback jako „ochrona"; wyścigi z prawdziwymi zmianami; lek: osobny kontekst symulacji na kopiach/wartościach |
| **Rozsmarowanie funkcji po systemie** | „Entuzjastyczny Brajan": nowa funkcja biznesowa rozlana po modułach → wieczna walka z wersjonowaniem eventów i wystawianiem kolejnych API; lek: spójny moduł symulacji |
| **Obiecanie optimum przy dużym N** | NP-zupełność; brute-force eksploduje wykładniczo; lek: aproksymacje + szczerość co do „bardzo dobrego" zamiast „optymalnego" wyniku |
| **Zabetonowana funkcja wartości** | „Optymalnie = zawsze kasa" na sztywno, a biznes mówi: czasem wizerunek; lek: wartość jako wstrzykiwana funkcja/Supplier |

---

## 8. Miejsce w architekturze i powiązania z innymi archetypami

Matching jest archetypem-**konsumentem**: sam niczego nie posiada, liczy na danych dostarczanych
przez sąsiadów i oddaje wynik jako rekomendację/symulację.

- **Inventory / Availability** — stąd pochodzi **pula zasobów** (CapacityDimension): co jest
  dostępne, w jakich oknach czasowych, z jakimi umiejętnościami. Zdarzenia zasilające pulę
  (zakup, szkolenie, awaria, zwrot z projektu) to język Inventory; matching widzi tylko ich
  wynik — aktualny stan puli.
- **Delta / plan-vs-wykonanie** — symulacje what-if to w istocie liczenie delty między stanem
  bieżącym a hipotetycznym: `zysk(po ruchu) − zysk(przed ruchem)`. Wynik symulacji może stać się
  planem, którego wykonanie potem śledzi Delta.
- **Pricing** — stąd pochodzi **wartość** przedmiotu (wycena projektu: zarobek minus koszty,
  kary umowne, komponent wizerunkowy) oraz **cena pozyskania** dodatkowego zasobu
  (marketplace, preferencyjne stawki, rabaty za 10 szkoleń). Matching nie wycenia — maksymalizuje
  dostarczone wyceny; „wydatki trzymamy w innym systemie".
- **Graphs (archetypy grafowe)** — General Assignment to klasycznie **skojarzenia w grafach
  dwudzielnych** (zasoby po lewej, projekty po prawej, krawędzie „może zaspokoić"); research
  w stronę „skojarzenia grafów" był „świetnym kierunkiem". Ta sama dyscyplina dwóch warstw co
  przy grafie: generyczny mechanizm + domenowy klient; i ta sama sztuczka z polityką
  (eligibility) trzymaną poza mechanizmem.
- **Ordering / procesy** — decyzja „bierzemy ten portfel projektów" wraca do świata procesów
  jako zwykłe komendy alokacji; matching kończy się rekomendacją, nie zapisem.
- Komunikacyjnie (rysunek Mariana z L05): moduł symulacji nasłuchuje zdarzeń, **niczego nie
  zmienia**, emituje zdarzenie „co by było, gdyby" — na które odpowiada cashflow (lub moduł
  wizerunkowy, gdy zmieni się definicja opłacalności).

---

## 9. Tabela mapowania: pojęcie domenowe → element modelu

| Pojęcie domenowe | Element modelu plecakowego | W kodzie referencyjnym |
|---|---|---|
| projekt (zlecenie, wakat…) do ewentualnego podjęcia | przedmiot pakowany | `Item` / `SimulatedProject` |
| zysk / wizerunek / „co maksymalizujemy" | wartość przedmiotu | `Item.value` / `SimulatedProject.value` (Supplier) |
| wymagane zasoby projektu (wszystkie naraz) | wielowymiarowa waga | `TotalWeight` / `Demands` |
| pojedyncze wymaganie (umiejętność w czasie) | wymiar wagi | `WeightDimension` / `Demand` |
| pula wszystkich dostępnych zasobów | JEDEN plecak o wielowymiarowej pojemności | `TotalCapacity` / `SimulatedCapabilities` |
| konkretny dostępny zasób (osoba/maszyna w oknie czasu) | wymiar pojemności | `CapacityDimension` / `AvailableResourceCapability` |
| „czy zasób zaspokaja wymaganie?" (zmienna reguła) | test dopasowania wagi do pojemności | `WeightDimension.isSatisfiedBy(...)` — wstrzykiwane |
| zasób-dawca wielu umiejętności (naraz albo jednej z wielu) | polityka selekcji pojemności | `CapabilitySelector` (`ALL_SIMULTANEOUSLY` / `ONE_OF_ALL`) |
| dokupienie/wyszkolenie zasobu za X | nowy wymiar pojemności z ceną | `AdditionalPricedCapability` |
| wybrany portfel + sumaryczny zysk + kto co zaspokaja | wynik pakowania | `Result` (profit, chosenItems, itemToCapacities) |
| „co by było, gdyby" | symulacja na osobnym modelu | `SimulationFacade` |

---

## 10. Pytania do biznesu

Pytania, które odróżniają przypadki i odkrywają parametry modelu (większość padła w L04):

1. **Co znaczy „optymalnie"?** Zysk (nie przychód)? Wizerunek? Mieszanka? Kto i gdzie definiuje,
   które projekty są „wizerunkowo ważne"?
2. **Po czym poznajecie, że projekt jest opłacalny / że się „nie dowiózł"?** Czy jedynym
   czynnikiem ryzyka jest brak zasobu z umiejętnością w czasie?
3. **Czy wartość pojawia się tylko przy pełnym zaspokojeniu wymagań, czy częściowe zaspokojenie
   też coś daje?** (w modelu referencyjnym: tylko pełne)
4. **Skąd i jak zasila się pula zasobów?** Zakup, szkolenie, wynajem, zatrudnienie, zwrot
   z zamkniętego projektu, awarie? Jakie są koszty pozyskania (mogą być 0 albo ujemne)?
5. **Czy zasób może zasilać wiele projektów równocześnie?** (programista „się rozdwoi",
   koparka nie) — kiedy wolno, kiedy nie?
6. **Czy wymagania zawsze mają wymiar czasu?** A wizja wykonalności („czy w ogóle mam maszyny"),
   zanim znane są terminy?
7. **Jakie są kary za zerwanie/niedowiezienie projektu** i kto je negocjował? (wchodzą do funkcji
   wartości przy zamykaniu/sprzedaży)
8. **Jaka jest skala?** Dziesiątki czy tysiące projektów? Setki tysięcy zasobów? (decyduje:
   brute-force vs aproksymacja)
9. **Czy wynik ma być rekomendacją do ręcznej decyzji, czy automatycznym przypisaniem?**
   (symulator nie decyduje, co ma być teraz)
10. **Jak dokładny musi być wynik?** Czy „bardzo dobre dopasowanie szybko" wystarczy zamiast
    gwarantowanego optimum? (NP-zupełność)

Pamiętaj o regule z L06: gdy w odpowiedziach padnie „nigdy" lub „zawsze" — zanotuj to jako
„na razie nie znamy wyjątku" i zamodeluj w tym miejscu zmienność, nie stałą.

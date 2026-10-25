# Matching / Optymalizacja dopasowania — referencja implementacyjna

Archetyp ze szkolenia **Domain Drivers M03 (L04–L06)**: General Assignment Problem zredukowany
do **wielowymiarowego problemu plecakowego**, z osobną warstwą symulacji what-if.

## Repo i moduł

- Ścieżka: `<archetypes>/general-assignment`
  (moduł rootowego poma Maven, Java 21, JUnit 5 + AssertJ, bez frameworków — czysta Java).
- Testy:
  ```bash
  cd <archetypes>
  ./mvnw -pl general-assignment test
  ```
- Trzy pakiety = trzy warstwy (separacja wg tagu `agnostic-knapsack` z Domain Drivers):
  - `softwarearchetypes.multidimensionalknapsack` — **generyczny optymalizator**; zero słownictwa
    domenowego, mówi tylko: Item, waga, pojemność, wynik;
  - `softwarearchetypes.simulation` — **warstwa domenowa symulacji** (projekty, demands, zasoby);
    tłumaczy język domeny na język plecaka wyłącznie na granicy (w `SimulationFacade`);
  - `softwarearchetypes.shared` — współdzielone value objects (Capability, CapabilitySelector,
    TimeSlot).

## Mapa kodu

### `softwarearchetypes.multidimensionalknapsack` (generyczne)

| Klasa | Rola (1 zdanie) |
|---|---|
| `MultidimensionalKnapsack` | Zachłanna aproksymacja (DP po liczbie zajętych pojemności): sortuje przedmioty komparatorem (domyślnie po wartości malejąco), dla każdego dopasowuje pojemności przez `isSatisfiedBy` i wybiera kombinację maksymalizującą sumę wartości; przedmioty o zerowej wadze wchodzą zawsze. |
| `Item` | Rekord `(name, value, totalWeight)` — pakowany przedmiot z wartością do maksymalizacji; `isWeightZero()` gdy brak wymagań. |
| `TotalWeight` | Wielowymiarowa waga przedmiotu — lista `WeightDimension`; wszystkie wymiary muszą znaleźć pojemność, inaczej przedmiot nie wchodzi. |
| `WeightDimension<T extends CapacityDimension>` | Interfejs jednego wymiaru wagi z JEDNĄ metodą `boolean isSatisfiedBy(T capacityDimension)` — punkt wstrzyknięcia reguły dopasowania przez klienta. |
| `TotalCapacity` | Plecak: lista wszystkich `CapacityDimension` w puli; fabryki `of(...)`, `zero()`, niemutowalny `add(...)`. |
| `CapacityDimension` | Pusty interfejs-marker dla jednego wymiaru pojemności (konkretny dostępny zasób definiuje domena). |
| `Result` | Rekord wyniku: `profit` (suma wartości wybranych), `chosenItems`, `itemToCapacities` (kto/co zaspokaja który przedmiot). |

### `softwarearchetypes.simulation` (domenowe)

| Klasa | Rola (1 zdanie) |
|---|---|
| `SimulationFacade` | Domenowe API symulacji: `whatIsTheOptimalSetup(...)` (optymalny portfel projektów) i `profitAfterBuyingNewCapability(...)` (różnica zysku po dokupieniu zasobu minus jego cena); prywatnie tłumaczy `SimulatedProject→Item` i `SimulatedCapabilities→TotalCapacity`. |
| `SimulatedProject` | Rekord `(projectId, value: Supplier<BigDecimal>, missingDemands)` — projekt jako kandydat do portfela; wartość jako Supplier = wymienna funkcja wartości (kasa/wizerunek). |
| `Demand` | Rekord `(capability, slot)` implementujący `WeightDimension<AvailableResourceCapability>`; jego `isSatisfiedBy` = „zasób umie TĘ capability I slot wymagania mieści się (`within`) w oknie zasobu" — to jest DOMENOWA, najczęstsza odpowiedź na generyczne pytanie. |
| `Demands` | Lista wszystkich wymagań projektu (jego wielowymiarowa waga). |
| `AvailableResourceCapability` | Rekord `(resourceId, capabilitySelector, timeSlot)` implementujący `CapacityDimension` — jeden dostępny zasób z umiejętnościami w oknie czasu. |
| `AdditionalPricedCapability` | Para `(value: BigDecimal, availableResourceCapability)` — zasób do ewentualnego dokupienia wraz z ceną (do symulacji „czy się opłaca"). |
| `SimulatedCapabilities` | Pula zasobów symulacji; `none()` i niemutowalne `add(...)` — „mam nowy zasób w puli" jednym wywołaniem. |
| `ProjectId` | Identyfikator projektu (UUID wrapper). |

### `softwarearchetypes.shared`

| Klasa | Rola (1 zdanie) |
|---|---|
| `Capability` | Rekord `(name, type)` z fabrykami `skill/asset/permission` — jedna umiejętność/zdolność zasobu. |
| `CapabilitySelector` | Zbiór capabilities zasobu + polityka `ALL_SIMULTANEOUSLY` (dawca wielu naraz) albo `ONE_OF_ALL` (jedna z wielu); `canPerform(...)` rozstrzyga, czy zasób zaspokoi żądany zestaw. |
| `TimeSlot` | Okno czasowe `(from, to)` z algebrą: `within`, `overlapsWith`, `commonPartWith`, `leftoverAfterRemovingCommonWith`, fabryki dzienne/miesięczne UTC. |

### Testy

| Plik | Co pokazuje |
|---|---|
| `KnapsackTest` | Czysty optymalizator na słowniku generycznym. |
| `OptimizationForTimedCapabilitiesTest` + `TimedCapability.java` | Optymalizator z ALTERNATYWNYMI, lokalnie zdefiniowanymi wymiarami (z czasem i bez) — dowód, że rdzeń jest agnostyczny. |
| `SimulationScenariosTest` + buildery | Scenariusze biznesowe przez `SimulationFacade` (specyfikacja archetypu). |

## API wejściowe

### Wariant 1: klient używa `MultidimensionalKnapsack` bezpośrednio

Definiujesz własne wymiary i wołasz optymalizator — tak robią `KnapsackTest` i
`OptimizationForTimedCapabilitiesTest` (tam wymiary testowe `DemandedCapability`,
`TimedCapability`, `DemandedTimedCapability`, `AvailableTimedCapability` są zdefiniowane lokalnie
w pliku testowym — wzorzec do kopiowania):

```java
// 1. własny wymiar pojemności (co jest w puli)
record TimedCapability(UUID uuid, String id, String capability) implements CapacityDimension {}

// 2. własny wymiar wagi z WŁASNĄ regułą dopasowania
record DemandedCapability(String capability) implements WeightDimension<TimedCapability> {
    @Override public boolean isSatisfiedBy(TimedCapability cap) {
        return cap.capability().equals(capability);
    }
}

// 3. przedmioty (uwaga na odwrotne mapowanie: PROJEKT jest przedmiotem!)
List<Item> items = List.of(
    new Item("Project1", 100, TotalWeight.of(new DemandedCapability("JAVA"))),
    new Item("Project2", 500, TotalWeight.of(new DemandedCapability("JAVA"))));

// 4. jedna pula pojemności i wywołanie
Result result = new MultidimensionalKnapsack()
    .calculate(items, TotalCapacity.of(c1, c2));           // domyślnie: wartość malejąco
// wariant z własnym porządkiem pakowania:
//  .calculate(items, capacity, Comparator.comparing(Item::value).reversed());

result.profit();            // suma wartości wybranych przedmiotów
result.chosenItems();       // które przedmioty weszły
result.itemToCapacities();  // który przedmiot zużył które pojemności
```

### Wariant 2: klient używa `SimulationFacade` (język domeny)

```java
SimulationFacade facade = new SimulationFacade(new MultidimensionalKnapsack());

// pula projektów-kandydatów (builder z testów)
List<SimulatedProject> projects = new SimulatedProjectsBuilder()
    .withProject(PROJECT_1)
    .thatRequires(Demand.demandFor(Capability.skill("JAVA-MID"), JAN_1))
    .thatCanEarn(BigDecimal.valueOf(99))
    .build();

// pula zasobów
SimulatedCapabilities pool = new AvailableCapabilitiesBuilder()
    .withEmployee(STASZEK).thatBrings(skill("JAVA-MID")).thatIsAvailableAt(JAN_1)
    .build();

// pytanie 1: optymalny portfel
Result best = facade.whatIsTheOptimalSetup(projects, pool);

// pytanie 2: czy opłaca się dokupić zasób za cenę?
AdditionalPricedCapability candidate = new AdditionalPricedCapability(
    BigDecimal.valueOf(3),
    new AvailableResourceCapability(UUID.randomUUID(), skill("JAVA-MID"), JAN_1));
double delta = facade.profitAfterBuyingNewCapability(projects, pool, candidate);
// delta = (zysk z pulą + nowy) − cena − (zysk bez) ; >0 → opłaca się
```

## Testy jako specyfikacja — `SimulationScenariosTest`

Sześć scenariuszy = behawioralna definicja archetypu; nowa implementacja w innej domenie powinna
mieć ich odpowiedniki:

1. **`picksOptimalProjectBasedOnEarnings`** — 3 projekty (9 / 99 / 2) wymagają JAVA-MID w JAN_1,
   dostępni tylko Staszek i Leon → wybrane 2 najzyskowniejsze, profit 108. (Pula za mała →
   optymalizator WYBIERA, a nie przydziela wszystkim.)
2. **`picksAllWhenEnoughCapabilities`** — zasobów więcej niż potrzeb → wchodzi wszystko, co ma
   wartość; nadmiar puli nie przeszkadza.
3. **`canSimulateHavingExtraResources`** — ta sama pula + `add(extraCapability)` w osobnym
   wywołaniu → porównanie profitu 99 vs 108; symulacja „mam nowy zasób w puli" to czysta funkcja,
   bez mutowania czegokolwiek.
4. **`picksOptimalProjectBasedOnReputation`** — wartość to NIE zawsze kasa:
   `thatCanGenerateReputationLoss(100)` vs `(40)` → wybór pada na większą stratę wizerunkową do
   uniknięcia; funkcja wartości jest wymienna (Supplier), algorytm bez zmian.
5. **`checkIfItPaysOffToPayForCapability`** — drogi Sławek (9999) → delta −9959; tani Staszek (3)
   → delta +37; what-if „czy opłaca się dokupić" liczony z ceną pozyskania.
6. **`takesIntoAccountSimulationsCapabilities`** — Staszek z `thatBringsSimultaneously(JAVA-MID,
   PYTHON)` zaspokaja OBA wymagania projektu za 99 naraz (polityka `ALL_SIMULTANEOUSLY`) →
   wybrany projekt za 99, nie dwa mniejsze; jeden zasób-dawca wielu umiejętności to jeden wymiar
   pojemności.

Dla czystego rdzenia (`KnapsackTest`): nic nie wchodzi przy zerowej pojemności; przedmioty
o zerowej wadze wchodzą zawsze (profit gwarantowany); przy wystarczającej pojemności wchodzi
wszystko; przy niedoborze wchodzą najcenniejsze, a `itemToCapacities` wskazuje przydziały
(odrzucony item ma `null`). `OptimizationForTimedCapabilitiesTest`: dopasowanie wymaga zgodności
umiejętności I zawierania się okna czasowego (`within`) — czerwiec ≠ październik.

## Punkty adaptacji

**Generyczne — kopiuj bez zmian** (pakiet `multidimensionalknapsack`):
`MultidimensionalKnapsack`, `Item`, `TotalWeight`, `TotalCapacity`, `Result` oraz interfejsy
`WeightDimension`/`CapacityDimension`. Ta warstwa nie zna domeny i ma taka pozostać
(w razie potrzeby zabezpiecz testem architektonicznym: brak importów z pakietu domenowego).

**Konkretyzuj pod domenę** (odpowiednik pakietu `simulation`):

1. **Wymiar pojemności** — co jest w puli: own record implements `CapacityDimension`
   (wzorzec: `AvailableResourceCapability` = kto, co umie, kiedy; u ciebie: maszyna, sala,
   budżet, slot reklamowy…).
2. **Wymiar wagi + własne `isSatisfiedBy`** — jedno wymaganie konsumenta: own record implements
   `WeightDimension<TwójWymiarPojemności>` z regułą dopasowania (wzorzec: `Demand` = capability
   + `slot.within(...)`; wariant bez czasu — sama zgodność umiejętności — patrz
   `DemandedCapability` w testach). To TU żyje zmienna reguła „czy pasuje".
3. **Funkcja wartości** — `Supplier<BigDecimal>` na obiekcie domenowym (wzorzec:
   `SimulatedProject.value`): kasa, wizerunek, mieszanka — bez dotykania algorytmu; opcjonalnie
   własny `Comparator<Item>` jako strategia kolejności pakowania.
4. **Fasada domenowa** — odpowiednik `SimulationFacade`: metody nazwane pytaniami biznesu
   („whatIsTheOptimalSetup", „profitAfterBuyingX"), prywatne mapowania domena→plecak.
5. **Polityki selekcji** — jeśli zasób daje wiele zdolności: `CapabilitySelector`
   z `ALL_SIMULTANEOUSLY`/`ONE_OF_ALL` (albo własny odpowiednik).

## Przepis generacji krok-po-kroku (z „mocnego podsumowania")

Wejście: tabela mapowania pojęcie→element z analizy archetypowej. Sprawdź, czy wskazuje:

- **PRZEDMIOT** = to, co konkuruje o pulę i niesie wartość (projekt/zlecenie/wakat) —
  **UWAGA: mapowanie odwrotne do intuicji** — przedmiotem NIE jest zasób;
- **WARTOŚĆ** = co maksymalizujemy (zysk, wizerunek…) i czy jest wymienna;
- **WYMIARY WAGI** = wymagania przedmiotu (każde z osobna + reguła `isSatisfiedBy`);
- **PULA (plecak)** = jeden wspólny zbiór wymiarów pojemności (nie plecak-per-przedmiot!).

Kroki:

1. Skopiuj pakiet `multidimensionalknapsack` 1:1 (zmień tylko groupId/pakiet bazowy projektu).
2. Przenieś z `shared` to, czego wymiary potrzebują (`TimeSlot` niemal zawsze; `Capability`/
   `CapabilitySelector` gdy zasoby mają zdolności).
3. **Najpierw testy rdzenia** w słowniku klienta — odpowiedniki czterech z `KnapsackTest`:
   pusta pula → nic; zerowa waga → zawsze w wyniku; pula wystarcza → wszystko; niedobór →
   najcenniejsze + poprawne `itemToCapacities`.
4. Zaimplementuj domenowe wymiary (pojemność, waga z `isSatisfiedBy`) — testy z kroku 3 zielone.
5. **Potem testy fasady** — odpowiedniki scenariuszy 1–6 z `SimulationScenariosTest`
   w języku biznesu (buildery w stylu `withProject/thatRequires/thatCanEarn` +
   `withEmployee/thatBrings/thatIsAvailableAt` bardzo się tu opłacają).
6. Zaimplementuj obiekty symulacji + fasadę z mapowaniami domena→plecak.
7. Dodaj what-ify, o które pyta biznes (dokupienie za cenę, transfer A→B = profit przed vs po,
   zamknięcie projektu = zwrot zasobów do puli za koszt 0), każdy jako czysta funkcja porównująca
   dwa wywołania optymalizatora.
8. (Opcjonalnie) test architektoniczny: pakiet generyczny nie importuje domenowego.

## Gotowe rozszerzenia what-if (wzorce na bazie L05)

Każde nowe pytanie biznesu to metoda fasady złożona z DWÓCH wywołań optymalizatora i różnicy —
bez zmian w rdzeniu:

```java
// transfer zasobu z projektu A do B: profit przed vs po ruchu
double profitAfterTransfer(List<SimulatedProject> projects,
                           SimulatedCapabilities pool,
                           AvailableResourceCapability moved) {
    double before = whatIsTheOptimalSetup(projects, pool).profit();
    double after  = whatIsTheOptimalSetup(projects, pool.add(moved)).profit();
    return after - before; // „sprawdzasz, przenosisz, sprawdzasz, liczysz"
}
```

- **zamknięcie projektu** = usuń projekt z listy kandydatów + `pool.add(...)` jego zwolnionych
  zasobów (koszt 0); kara umowna wchodzi do rachunku jako składnik różnicy;
- **sprzedaż zasobu** = pula bez zasobu vs cena sprzedaży minus spadek profitu portfela;
- **szkolenie/zatrudnienie** = dokładnie `profitAfterBuyingNewCapability` z inną ceną
  (koszt może być 0, a nawet ujemny — model się nie zmienia, zmienia się kwota).

## Definition of done dla wygenerowanego modułu

- [ ] Pakiet generyczny skompilowany bez JEDNEGO importu z pakietu domenowego (najlepiej
      pilnowane testem architektonicznym).
- [ ] Odpowiedniki 4 testów `KnapsackTest` zielone na słowniku klienta.
- [ ] Odpowiedniki 6 scenariuszy `SimulationScenariosTest` zielone, nazwane językiem biznesu.
- [ ] Minimum jeden test pokazujący ALTERNATYWNĄ implementację `isSatisfiedBy`
      (np. bez wymiaru czasu), żeby zmienność reguły była udokumentowana w kodzie.
- [ ] Fasada nie mutuje żadnych obiektów wejściowych (wszystkie `add` zwracają nowe wartości).
- [ ] `./mvnw -pl <modul> test` przechodzi w czystym checkout.

## Pułapki

- **Odwrotna intuicja mapowania** — pierwsza myśl „projekt=plecak, wkładam zasoby" jest błędna
  i prowadzi do modelu, który nie umie maksymalizować wartości portfela; projekt jest
  PRZEDMIOTEM z wartością, pula zasobów JEDNYM plecakiem. Zweryfikuj tabelę mapowania zanim
  wygenerujesz kod.
- **Waga ≠ wartość** — wymagania to waga (zużywana pojemność), pieniądze/wizerunek to wartość
  (maksymalizowana). Pomylenie = bezsensowny wynik.
- **Wszystkie wymiary naraz** — przedmiot wchodzi tylko, gdy KAŻDY wymiar wagi znajdzie
  pojemność (`matchCapacities` zwraca pustkę przy pierwszym braku); nie implementuj
  „częściowej wartości za częściowe spełnienie", chyba że biznes wprost tego chce — wtedy to
  zmiana modelu, nie bug.
- **NP-zupełność** — nie obiecuj optimum: rdzeń to zachłanna aproksymacja (sortowanie po
  wartości + DP po liczbie pojemności), dobra i szybka, ale nieoptymalna globalnie; dla dużych
  N to świadomy trade-off, który można podmienić pod fasadą (po to jest separacja warstw).
- **Brute-force bywa OK** — dla małych, stabilnych zbiorów prosty „sprawdź każde przypisanie"
  też jest poprawną implementacją za fasadą; nie przeinwestuj.
- **Symulacja na osobnym modelu** — nigdy nie licz what-if mutując produkcyjne encje alokacji
  (anty-wzorzec „rzucę wyjątek, żeby się nie zapisało"); `SimulatedProject`/`SimulatedCapabilities`
  to wartości, `add(...)` zwraca nowe obiekty.
- **Nie betonuj reguły dopasowania** — „zawsze pytamy o czas" to ukryte założenie; trzymaj
  `isSatisfiedBy` wstrzykiwalne, a wariant z czasem traktuj jako najczęstszy przypadek ogólnej
  reguły (wariant bez czasu: wizja wykonalności).
- **Mutowalność `TotalCapacity.capacities()`** — akcesor zwraca kopię listy, a algorytm
  `removeAll` robi na niej; przy własnych zmianach w rdzeniu nie zamień tego na widok, bo
  zaczniesz mutować pulę wejściową.

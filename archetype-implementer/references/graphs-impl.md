# Archetypy grafowe — referencyjna implementacja (moduł `graphs`)

Referencyjny kod ze szkolenia "Archetypy Oprogramowania", moduł 5 (lekcje AO_M05L01–L10).
Pokazuje, jak ukryty w ifologii graf nazwać jawnie i odpowiadać na pytania biznesowe
gotowymi algorytmami: cykle/wymiany, osiągalność i ścieżki ważone, strefy wpływu
(connected components), punkty artykulacji (łącznik), toposort, kolorowanie,
przecięcie (AND) i suma (OR) grafów.

---

## 1. Wskazanie na repo

- **Repo**: `<archetypes>` (multi-moduł Maven, root `com.softwarearchetypes:archetypes:0.0.1`)
- **Moduł**: `<archetypes>/graphs`
- **Koordynaty Maven**: `com.softwarearchetypes:graphs:0.0.1-SNAPSHOT`, parent `spring-boot-starter-parent:3.5.5`, Java 21
- **Kluczowa zależność**: `org.jgrapht:jgrapht-core:1.5.2` (plus moduły `common` i `quantity` z tego repo — jeśli brak ich w lokalnym repo Mavena, dodaj `-am`)
- **Komenda testów**:
  ```bash
  cd <archetypes> && ./mvnw -pl graphs test
  # fallback gdy common/quantity nie są zainstalowane: ./mvnw -pl graphs -am test
  ```
- **Stan**: 54 testy, wszystkie zielone (stan na 2026-10).
- **Materiały towarzyszące w katalogu modułu**: transkrypcje lekcji `graphs/AO_M05L01_transkrypcja.pdf` … `L10`, oraz `graphs/SKILL.md` — to jest źródło skilla `graphs-archetype-mapper` (mapowanie domena→graf; ten plik jest jego implementacyjnym dopełnieniem).
- Spring Boot jest w pom, ale **kod w ogóle nie używa Springa** — czyste klasy + jgrapht; jest tylko puste `src/main/resources/application.yml` i brak klasy `@SpringBootApplication` (więc `package` może się wywalić na repackage; `test` działa).

---

## 2. Mapa kodu

Źródła: `graphs/src/main/java/com/softwarearchetypes/graphs/…`
Wszystkie klasy są **package-private** (poza `cycles.math.*` i `scheduling.ProcessStep`) — to celowo: każdy pakiet to zamknięta lekcja/pod-archetyp.

### 2.1 `cycles` — cykle/wymiany (batch swap rezerwacji) + dwa grafy (topologia ∩ polityka)

| Klasa | Rola |
|---|---|
| `cycles/BatchReservationUseCase.java` | Serce lekcji: buduje graf z żądań zmian i wykonuje pierwszy znaleziony cykl wymian; wariant z `Eligibility` robi `intersection` grafu żądań z grafem uprawnień. |
| `cycles/ReservationChangeRequest.java` | Rekord `(fromSlot, toSlot, userId)` — żądanie "chcę się przenieść"; staje się **property krawędzi**. |
| `cycles/Slot.java`, `SlotId`, `OwnerId` | Model domenowy: slot z mutowalnym właścicielem (`release()`, `assignTo()`); `OwnerId.empty()` = slot wolny. |
| `cycles/SlotRepository.java` | Interfejs + `InMemorySlotRepository` w tym samym pliku; `findAll` zwraca **kopie** (symulacja odczytu z bazy). |
| `cycles/Eligibility.java` | **Graf polityki**: `markTransferEligible/Ineligible(OwnerId, OwnerId)`, `asGraph()` zwraca `Graph<OwnerId, Void>`. Komentarz w kodzie: "limitReached / departments changed → call this class" — reguły żyją NAD grafem. |
| `cycles/BatchReservationResult.java` | Rekord wyniku: `SUCCESS` + wykonane żądania albo `FAILURE` + pusta lista. |

### 2.2 `cycles.math` — ręcznie pisany graf generyczny (zero zależności)

| Klasa | Rola |
|---|---|
| `cycles/math/Graph.java` | `Graph<T,P>`: lista sąsiedztwa `Map<Node<T>, List<Edge<T,P>>>`; `addEdge`, `hasEdge`, `removeEdge`, `findFirstCycle()` (DFS z inStack, zwraca `Optional<Path>`), `intersection(Graph<T,P2>)` (krawędź zostaje, gdy druga strona ma from→to; **properties z `this`**). Komentarz: "AI-generated → TODO replace with a library". |
| `cycles/math/Node.java` | `record Node<T>(T property)` — tożsamość węzła = equals property. |
| `cycles/math/Edge.java` | `record Edge<T,P>(from, to, property)` — krawędź skierowana z ładunkiem domenowym. |
| `cycles/math/Path.java` | `record Path<T,P>(List<Edge<T,P>> edges)` + czytelny `toString` ("A -> B -> C"). |

### 2.3 `userjourney` — graf stanów i przejść (osiągalność, ścieżki, wagi)

| Klasa | Rola |
|---|---|
| `userjourney/UserJourney.java` | Rekord `(id, Graph<State,Condition> (jgrapht DefaultDirectedGraph), currentState)`. Metody: `waysToAchieve(ProductType)` → wszystkie proste ścieżki (`AllDirectedPaths`) do stanów zawierających produkt; `onFulfilled(Condition)` → przejście po krawędzi (brak dopasowania = zwraca `this`); `optimizedWayToAchieve(type, Function<Condition,Double>)` → min. suma wag. W tym samym pliku fluent builder: `Builder`/`TransitionBuilder`/`TransitionWithCondition` (`from(...).on(...).goto_(...)`). |
| `userjourney/State.java` | Rekord: stan = **zbiór produktów klienta** (`Set<Product>`); `contains(ProductType)`. |
| `userjourney/Condition.java` | Krawędź-przejście: `ConditionType` (LATE_PAYMENT, PAYMENT_ON_TIME, RESTRUCTURING, PROMOTION_APPROVED) + `Map<String,Object> attributes`; fabryki `latePayments(n)`, `withCost/withTime/withRisk/withAttributes` i gettery `getCost()/getTime()/getRisk()` z defaultami. |
| `userjourney/Product.java` | Produkt w stanie: NEW_LOAN, PENALTY, DISCOUNT(+percentage). |
| `userjourney/CustomerPath.java` | Wynik: lista `Condition` + `weight(weightFunction)` = suma wag kroków. |
| `userjourney/UserJourneyId.java` | Identyfikator value-object. |

### 2.4 `influence` — strefy wpływu (connected components) i łącznik (cutpoints)

| Klasa | Rola |
|---|---|
| `influence/InfluenceMap.java` | **Suma (OR) dwóch grafów**: fizyka × laboratoria (iloczyn kartezjański `cartesianOf` albo wariant `adjacencyOf` ograniczony sąsiedztwem labów) + krawędzie infrastrukturalne (`addInfrastructure`). Builder: `withPhysics / withInfrastructure / withLaboratories / withLaboratoryAdjacency`. Zapytanie: `influences(Reservation, Reservation)`. |
| `influence/PhysicsInfluence.java` | Graf uniwersalnych praw: `addInfluence(PhysicsProcess, PhysicsProcess[, Map featureRequirements])`; wymagania cech krawędzi są składowane (`getFeatureRequirements`) — patrz sekcja 7: **nieużywane** przy budowie mapy. |
| `influence/InfrastructureInfluence.java` | Graf lokalnych defektów budynku: `addConstraint(proces, lab, proces, lab)` — krawędzie dokładane do mapy niezależnie od fizyki (OR). |
| `influence/LaboratoryAdjacency.java` | Graf sąsiedztwa labów (`adjacent(labA, labB)`) — alternatywa dla "każdy z każdym". |
| `influence/InfluanceAnalyzer.java` | (sic! literówka w nazwie) Algorytmy na mapie: `countConflicts` (stopień wierzchołka "na piechotę"), `analyzeInfluenceZones` / `findInfluenceZone` (jgrapht `ConnectivityInspector` → connected components), `identifyCriticalReservations` (jgrapht `BiconnectivityInspector#getCutpoints` → punkty artykulacji). Buduje **nieskierowany** `SimpleGraph` rezerwacji z skierowanej mapy — bo koordynacja jest dwustronna. |
| `influence/InfluenceUnit.java` | Węzeł mapy: `record (PhysicsProcess, Laboratory)` — proces osadzony w labie. |
| `influence/Reservation.java` | `record (PhysicsProcess, Laboratory)` — rezerwacja; strukturalnie = InfluenceUnit, ale inna rola (byt biznesowy vs węzeł mapy). |
| `influence/InfluenceZone.java` | Wynik: komponent spójności; `countReservationsToNegotiateWith`, `getReservationsToNegotiateWith`. |
| `influence/BridgingReservations.java` | Wynik: zbiór rezerwacji-łączników; `isBridging`, `count`, `isEmpty`. |
| `influence/PhysicsProcess.java`, `Laboratory.java` | Nagie value-objecty `record (String name)`. |

### 2.5 `scheduling` (+ `scheduling.concurrency`) — kolejność (toposort) i równoległość (kolorowanie)

| Klasa | Rola |
|---|---|
| `scheduling/Process.java` | Builder DAG-a kroków (`jgrapht DirectedAcyclicGraph`): `addStep`, `addDependency(from, to[, DependencyType])`; `build()` NIE zwraca Process, tylko od razu liczy `Schedule` przez `TopologicalOrderIterator`. Cykl zależności → `IllegalArgumentException` z jgrapht już przy `addEdge`. |
| `scheduling/ProcessStep.java` | `public record (String name)` z walidacją not-blank — jedyna publiczna klasa domenowa (bo używa jej pakiet `concurrency`). |
| `scheduling/DependencyType.java` | Semantyka krawędzi jako dane: `finishToStart(desc)`, `requiredResource(name)`, `dataFlow(dataType)`, `custom(name, features)` — składowana w `Process`, nie wpływa (jeszcze) na algorytm. |
| `scheduling/Schedule.java` | Wynik toposortu: niemutowalna lista kroków, `first()/last()/size()` (puste → `null`, nie Optional). |
| `scheduling/concurrency/Concurrency.java` | Builder **nieskierowanego** grafu konfliktów (`addConflict(step1, step2)` = "nie mogą współdzielić środowiska"); `build()` odpala jgrapht `GreedyColoring` i zwraca wynik. |
| `scheduling/concurrency/ExecutionEnvironments.java` | Wynik kolorowania: `environmentCount()` (= maxColor+1), `getEnvironment(step)`, `getStepsInEnvironment(i)`, `canRunConcurrently(a,b)` — **true gdy TEN SAM kolor/środowisko** (kolor = klasa wzajemnie niekonfliktowych kroków). |

---

## 3. API wejściowe — jak klient buduje graf i odpala algorytmy

### 3.1 Cykle/wymiany (ręczny graf)

```java
SlotRepository repo = new InMemorySlotRepository();
repo.save(Slot.create(SlotId.of("SlotA"), OwnerId.of("UserX")));
BatchReservationUseCase useCase = new BatchReservationUseCase(repo);

// wariant 1: graf na SlotId (węzeł = slot)
BatchReservationResult r = useCase.execute(List.of(
    new ReservationChangeRequest(slotA, slotB, userX),
    new ReservationChangeRequest(slotB, slotA, userY)));

// wariant 2: graf na OwnerId ∩ graf uprawnień (topologia ∩ polityka)
Eligibility eligibility = new Eligibility();
eligibility.markTransferEligible(userX, userY);
eligibility.markTransferEligible(userY, userX);
BatchReservationResult r2 = useCase.execute(requests, eligibility);
```
Wewnątrz: `buildGraph`/`buildOwnerGraph` → `Graph#findFirstCycle()` → krawędzie cyklu →
`Edge::property` → z powrotem `ReservationChangeRequest`y → `release()` wszystkich "from",
`assignTo()` wszystkich "to", `saveAll`. **Żądanie = property krawędzi**, dzięki czemu
wynik algorytmu od razu mówi, CO wykonać.

### 3.2 User journey (jgrapht, fluent builder)

```java
UserJourney journey = UserJourney.builder(UserJourneyId.of("user-1"))
    .from(newLoan).on(Condition.paymentOnTime()).goto_(discount10)
    .from(newLoan).on(Condition.latePayments(3)).goto_(afterPayments)
    .from(afterPayments).on(Condition.promotionApproved()).goto_(discount10)
    .withCurrentState(newLoan)
    .build();

Set<CustomerPath> ways = journey.waysToAchieve(ProductType.DISCOUNT);
Optional<CustomerPath> cheapest = journey.optimizedWayToAchieve(DISCOUNT, Condition::getCost);
Optional<CustomerPath> fastest  = journey.optimizedWayToAchieve(DISCOUNT, c -> (double) c.getTime());
UserJourney next = journey.onFulfilled(Condition.paymentOnTime()); // immutable — nowy obiekt
```
Waga NIE siedzi w algorytmie — klient przekazuje `Function<Condition, Double>`
(cost/time/risk/kombinacja), a ten sam graf odpowiada na różne pytania.

### 3.3 Strefy wpływu (dwa źródła + suma)

```java
PhysicsInfluence physics = PhysicsInfluence.builder()
    .addInfluence(THERMAL, CONDUCTIVITY)          // prawo fizyki: termika zaburza przewodnictwo
    .build();
InfluenceMap map = InfluenceMap.builder()
    .withPhysics(physics)
    .withLaboratories(Set.of(LAB_A, LAB_B, LAB_C))          // każdy-z-każdym (kartezjan), ALBO:
    //.withLaboratoryAdjacency(LaboratoryAdjacency.builder().adjacent(LAB_A, LAB_B).build())
    .withInfrastructure(InfrastructureInfluence.builder()   // lokalny defekt = dodatkowa krawędź (OR)
        .addConstraint(SPECTROSCOPY, LAB_A, THERMAL, LAB_B).build())
    .build();

InfluanceAnalyzer analyzer = new InfluanceAnalyzer(map);
int conflicts = analyzer.countConflicts(newReservation, existing);          // stopień
Set<InfluenceZone> zones = analyzer.analyzeInfluenceZones(reservations);    // components
InfluenceZone zone = analyzer.findInfluenceZone(reservation, all);          // "z kim negocjuję"
BridgingReservations critical = analyzer.identifyCriticalReservations(all); // cutpoints
```

### 3.4 Scheduling: kolejność i równoległość z tego samego słownika kroków

```java
Schedule schedule = Process.builder()
    .addDependency(DRYING, MEASUREMENT, DependencyType.finishToStart("Sample must be dry"))
    .addDependency(CALIBRATION, MEASUREMENT)
    .addDependency(MEASUREMENT, ANALYSIS, DependencyType.dataFlow("Spectrum"))
    .build();               // toposort; cykl → IllegalArgumentException już przy addDependency

ExecutionEnvironments envs = Concurrency.builder()
    .addConflict(MEASUREMENT, CALIBRATION)   // nieskierowane: "nie mogą naraz"
    .addConflict(FINAL_TEST, MEASUREMENT)
    .build();               // greedy coloring
envs.environmentCount();                     // ile środowisk/pasów minimum
envs.canRunConcurrently(CALIBRATION, VALIDATION);
```

### 3.5 Matematyka grafowa wprost (intersection)

```java
Graph<String,String> g1 = new Graph<>();
g1.addEdge(new Edge<>(new Node<>("A"), new Node<>("B"), "edge1"));
Graph<String,String> common = g1.intersection(g2);   // wspólne from→to, properties z g1
Optional<Path<String,String>> cycle = common.findFirstCycle();
```

---

## 4. Testy jako specyfikacja

Katalog: `graphs/src/test/java/com/softwarearchetypes/graphs/…` — 12 klas, 54 testy, zero Springa, zero mocków (jedyny "fake" to `InMemorySlotRepository` z produkcyjnego pliku).

| Plik testu | Co specyfikuje |
|---|---|
| `cycles/BatchReservationUseCaseTest.java` | Swap 2-osobowy wykonuje oba żądania i podmienia właścicieli; żądanie spoza cyklu (użytkownik bez slotu) jest pomijane, a wykonywany jest tylko cykl; cykl 5-osobowy (Alice→Bob→…→Eve→Alice) rotuje wszystkich; brak cyklu → `FAILURE`, stan nietknięty. Helpery-fixture: `thereIsSlotOwnedBy`, `thereIsFreeSlot`, `findSlotOwner`. |
| `cycles/BatchReservationEligibilityUseCaseTest.java` | Intersection w akcji: zamiana wykonuje się tylko, gdy KAŻDA krawędź cyklu jest eligible; brak jednej krawędzi uprawnień → `FAILURE` i stan nietknięty (dla pary i dla cyklu 3-osobowego); `markTransferIneligible` po `markTransferEligible` odbiera zgodę. `@DisplayName` po polsku. |
| `cycles/EligibilityTest.java` | Semantyka grafu polityki: default = niemożliwy; mark/unmark; **asymetria** (Alice→Bob ≠ Bob→Alice); wiele krawędzi naraz. |
| `cycles/math/GraphIntersectionTest.java` | Przecięcie zawiera tylko wspólne krawędzie; cykl znajduje się tylko, gdy wszystkie 3 krawędzie są w OBU grafach; przecięcie z pustym = puste. |
| `userjourney/WaysToAchieveTest.java` | Pojedyncza ścieżka; **dwie alternatywne drogi do rabatu** (wprost za terminowe płatności vs. kara→promocja); pusty wynik gdy produktu nie ma w żadnym stanie LUB stan nieosiągalny z `currentState`; ścieżka 3-krokowa. Własny soft-assert `assertContainsPath` z czytelnym fail-message (formatuje znalezione ścieżki). |
| `userjourney/OnFulfilledTest.java` | Przejście po spełnionym warunku; łańcuchowanie (immutable journey); niedopasowany warunek → stan bez zmian; wybór krawędzi przy wielu wyjściach. |
| `userjourney/WeightedPathsTest.java` | Ten sam graf, różne funkcje wagi: najtańsza droga = 2 tanie kroki zamiast 1 drogiego; najszybsza = bezpośrednia; **trade-off cost vs time** — cheapest wybiera economy route, fastest express route. |
| `influence/InfluenceMapTest.java` | Fizyka × 3 laby = 9 krawędzi (kartezjan, w tym lab sam ze sobą); + infrastruktura = 5 krawędzi (4 z fizyki × 2 laby + 1 constraint); wariant adjacency: krawędzie tylko między sąsiadującymi labami (2 zamiast 4). Custom assert `InfluenceMapAssert.hasEdge/hasEdgeCount`. |
| `influence/InfluenceAnalyzerTest.java` | countConflicts 0/1/2; **nowa rezerwacja skleja dwie strefy w jedną** (2 strefy → 1 strefa 5-elementowa, negocjuje z 4); nowa niezależna rezerwacja tworzy trzecią strefę (negocjuje z 0). |
| `influence/BridgingReservationsAnalyzerTest.java` | Niezależne rezerwacje → brak krytycznych; **dwa trójkąty spięte mostkiem X** → krytyczne są X i oba punkty styku; pełny trójkąt → nic krytycznego; łańcuch A–B–C–D → środkowe dwa krytyczne; pusty zbiór → pusto. |
| `scheduling/ScheduleTest.java` | Toposort liniowy; diament (PREPARATION pierwsze, FINALIZATION ostatnie, kolejność gałęzi dowolna — asercje przez `indexOf` <); pojedynczy krok; **cykl zależności → IllegalArgumentException**. |
| `scheduling/concurrency/ConcurrencyTest.java` | 4 kroki z konfliktami → min. 3 środowiska i CALIBRATION∥VALIDATION; brak konfliktów → 1 środowisko (wszystko naraz); klika 3 → 3 środowiska; łańcuch A–B–C → 2 środowiska i A∥C. |

**Konwencje testowe** (trzymaj się ich przy generacji):
- komentarze `// given / and / when / then`, JUnit 5, czyste asercje `org.junit.jupiter.api.Assertions`;
- `@DisplayName` — po polsku w pakiecie `cycles`, po angielsku gdzie indziej (niespójność repo, wybierz jedno);
- stałe domenowe w klasach `Fixtures` (per pakiet: `influence/Fixtures.java`, `scheduling/Fixtures.java`);
- custom asserty tam, gdzie asercja jest "grafowa" (`InfluenceMapAssert`, `assertContainsPath`);
- **asercje na topologii i na skutku domenowym, nie na stanie wewnętrznym**: testy cykli sprawdzają finalnych właścicieli slotów, testy toposortu — relacje `indexOf`, nie konkretną permutację;
- testy są w tym samym pakiecie co kod (klasy package-private — to jedyny sposób dostępu).

---

## 5. Punkty adaptacji: co generyczne, co konkretyzować

**Generyczne (bierz niemal bez zmian):**
- `cycles/math/Graph<T,P>` + `Node/Edge/Path` — cały mechanizm cykli i przecięcia jest parametryczny: `T` = tożsamość węzła, `P` = ładunek domenowy krawędzi. Testowany niezależnie (`GraphIntersectionTest`).
- Wywołania jgrapht: `AllDirectedPaths` (ścieżki), `ConnectivityInspector` (components), `BiconnectivityInspector#getCutpoints` (artykulacja), `TopologicalOrderIterator` + `DirectedAcyclicGraph` (toposort z darmową detekcją cykli), `GreedyColoring` (kolorowanie). To są 1–3 linie glue-code'u — algorytmika w ogóle nie jest Twoja.
- Wzorzec "builder grafu → algorytm → rekord-wynik z domenowym API" (`InfluenceZone`, `BridgingReservations`, `Schedule`, `ExecutionEnvironments`, `CustomerPath`, `BatchReservationResult`).

**Do konkretyzacji per domena:**
- **Tożsamość węzła** — najważniejsza decyzja. Ten sam zbiór żądań modelowany raz na `SlotId` (`buildGraph`), raz na `OwnerId` (`buildOwnerGraph`), bo polityka (Eligibility) mówi o ludziach, nie slotach. Wybierz tożsamość pod pytanie, na które odpowiadasz.
- **Semantyka i kierunek krawędzi** — `cycles`: skierowana "chcę twój slot"; `userjourney`: skierowana "warunek przenosi stan"; `scheduling`: skierowana "from przed to"; `concurrency`: NIEskierowana "konflikt"; `influence`: budowana skierowanie, ale analiza robi z niej nieskierowaną (koordynacja dwustronna). Każdy pod-archetyp wymaga świadomej decyzji.
- **Property krawędzi** — tam wkładasz byt domenowy (żądanie, warunek z atrybutami, typ zależności), żeby wynik algorytmu dał się przełożyć na akcję.
- **Predykaty/wagi/progi** — zawsze z zewnątrz: `Function<Condition,Double>` w `optimizedWayToAchieve`; eligibility jako osobny graf; `DependencyType`/`featureRequirements` jako dane. Nowa reguła = inna budowa grafu/inny parametr, nigdy zmiana traversalu.
- **Repozytoria / efekty uboczne** — tylko `cycles` dotyka persystencji (`SlotRepository`); pozostałe pod-archetypy to czyste obliczenia na grafie budowanym ad hoc z danych encji (graf = pomocnik runtime, nic nie jest persystowane).
- **Widoczność** — wszystko package-private; przy wyciąganiu do własnego modułu zdecyduj, co jest publicznym API (w oryginale publiczne są tylko `cycles.math.*` i `ProcessStep`).

---

## 6. Przepis generacji z "mocnego podsumowania" (pojęcie → element grafu)

Wejście: tabela mapowania z `graphs-archetype-mapper` (patrz `graphs/SKILL.md`), czyli:
nodes = X, edges = Y (kierunek, semantyka), archetyp(y), ewentualnie topologia vs polityka.

**Krok 0 — wybór silnika:** 1–2 proste algorytmy pod pełną kontrolą → skopiuj wzorzec
`cycles/math` (jeden pakiet, zero zależności). Więcej algorytmów / cutpoints / coloring
→ `org.jgrapht:jgrapht-core:1.5.2` i glue-code jak w `influence`/`scheduling`.
Grafowa baza danych — dopiero przy dużym, współdzielonym, dynamicznym grafie (L09). 

**Krok 1 — value-objecty tożsamości.** Rekordy w stylu `SlotId`/`OwnerId`/`PhysicsProcess`:
`record XxxId(String value)` + fabryka `of()`. Tożsamość węzła = equals rekordu
(w jgrapht wierzchołkiem jest sam rekord; w `cycles.math` — `Node<T>`).

**Krok 2 — byt krawędzi.** Rekord z semantyką przejścia/żądania/zależności
(`ReservationChangeRequest`, `Condition`, `DependencyType`). Jeśli domena wspomina
koszt/czas/siłę — od razu `Map<String,Object> attributes` + gettery z defaultami
(wzorzec `Condition`), nawet jeśli pierwsza iteracja jest binarna.

**Krok 3 — builder grafu w języku domeny.** Klient NIGDY nie mówi "addVertex/addEdge",
tylko `from(...).on(...).goto_(...)`, `addDependency`, `addConflict`, `adjacent`,
`markTransferEligible`, `addInfluence`. Builder tłumaczy to na graf. Jeżeli jest
polityka — osobna klasa-graf z `asGraph()` (wzorzec `Eligibility`).

**Krok 4 — algorytm per pytanie biznesowe** (ściąga z tego modułu):

| Pytanie | Wzorzec |
|---|---|
| "co może się wymienić razem, choć nic pojedynczo" | `Graph#findFirstCycle` → properties krawędzi → wykonaj (`BatchReservationUseCase`) |
| "jak dojść do X / najtaniej / najszybciej" | `AllDirectedPaths` + min po funkcji wagi (`UserJourney`) |
| "kto z kim musi się koordynować / ile niezależnych grup" | `ConnectivityInspector.connectedSets` (`InfluanceAnalyzer#analyzeInfluenceZones`) |
| "co trzyma całość / co blokuje podział" | `BiconnectivityInspector.getCutpoints` (`identifyCriticalReservations`) |
| "w jakiej kolejności" | `DirectedAcyclicGraph` + `TopologicalOrderIterator` (`Process`) |
| "ile pasów/środowisk, co może naraz" | `GreedyColoring` na nieskierowanym grafie konfliktów (`Concurrency`) |
| "co dozwolone I możliwe" | `intersection` topologii z polityką (`execute(requests, eligibility)`) |
| "pełny obraz ograniczeń z wielu źródeł" | suma: dokładanie krawędzi drugiego grafu do pierwszego (`InfluenceMap.addInfrastructure`) |

**Krok 5 — rekord wyniku z domenowym API.** Nie zwracaj `Set<Set<V>>` ani `Map<V,Integer>`
— opakuj: `InfluenceZone.countReservationsToNegotiateWith`, `ExecutionEnvironments.canRunConcurrently`,
`Schedule.first/last`, `BridgingReservations.isBridging`. To jest warstwa, w której wynik
algorytmu mówi językiem lekcji/biznesu.

**Krok 6 — testy NAJPIERW, i to na topologii, nie na stanie:**
1. zacznij od testu czystej topologii / budowy grafu (odpowiedniki `GraphIntersectionTest`,
   `InfluenceMapTest`, `EligibilityTest`) — małe grafy A/B/C, asercje `hasEdge`/`hasEdgeCount`;
2. potem testy kanonicznych kształtów per algorytm: **cykl 2- i n-elementowy + brak cyklu**
   (cycles), **diament + łańcuch + cykl-zabroniony** (toposort), **klika + łańcuch + brak
   konfliktów** (coloring), **dwa klastry + mostek** (components/cutpoints), **dwie
   alternatywne drogi + cel nieosiągalny** (paths);
3. asercje relacyjne, nie absolutne: `indexOf(a) < indexOf(b)` zamiast pełnej listy,
   "ścieżka zawiera krok" zamiast equals na całym obiekcie — algorytmy mają swobodę
   (kolejność gałęzi diamentu, numeracja kolorów, który cykl pierwszy);
4. na końcu test use-case'u end-to-end ze skutkiem domenowym (finalni właściciele slotów);
5. fixtures jako stałe w `Fixtures`-klasie, helpery `thereIs...()`, custom assert gdy
   asercja grafowa się powtarza.

**Krok 7 — dowód addytywności.** Dodaj test "nowa reguła": zmienia się tylko budowa grafu
polityki / nowa krawędź, a wywołanie algorytmu i stare testy zostają nietknięte
(wzorzec `canRevokeEligibility` + `doesNotExecuteCycleWhenOneEdgeIneligible`).

---

## 7. Pułapki i braki

**Pułapki implementacyjne (w tym kodzie):**
- `Graph#findFirstCycle` zwraca **pierwszy** cykl (zależny od iteracji po HashMap — niedeterministyczny wybór przy wielu cyklach); use-case wykonuje tylko jeden cykl na wywołanie, resztę żądań ignoruje. Przy wielu rozłącznych cyklach potrzebna pętla/`findAllCycles` — nie ma jej.
- `Graph#removeEdge` porównuje tylko `to` (ignoruje property) i usuwa w pętli bez cofnięcia indeksu — przy duplikatach krawędzi A→B usunie co drugą. W praktyce Eligibility nie duplikuje, ale nie przenoś tej metody bezmyślnie.
- `Graph#intersection` dopasowuje wyłącznie pary (from,to) — properties drugiego grafu są ignorowane, wynik nosi properties z `this`. To celowe (polityka = sama struktura), ale musi być świadome.
- `BatchReservationUseCase.execute` nie jest transakcyjny: `release()` wszystkich, potem `assignTo()` — na in-memory kopiach działa, na realnej bazie wymaga transakcji/blokady wersji. `InMemorySlotRepository.findAll` **celowo zwraca kopie**, żeby to symulować — nie zgub tego przy adaptacji; TODO w kodzie: "w 1 pętli".
- `buildOwnerGraph` po cichu pomija żądania z nieistniejącym slotem (null-check) — brak jakiejkolwiek sygnalizacji błędu.
- jgrapht `DefaultDirectedGraph` **nie dopuszcza krawędzi równoległych**: w `UserJourney` druga krawędź między tą samą parą stanów (inny `Condition`) zostanie po cichu odrzucona (`addEdge` → false). Dwa przejścia między tymi samymi stanami wymagają multigrafu (`DirectedMultigraph`) — tu go nie ma.
- `Condition` jest krawędzią, a `equals` rekordu obejmuje całą mapę atrybutów — `latePayments(3)` ≠ `latePayments(6)`; `onFulfilled` dopasowuje po pełnym equals. Wygodne w testach, kruche przy atrybutach "metadanych" (np. timestamp zepsułby dopasowanie).
- `optimizedWayToAchieve` = enumeracja WSZYSTKICH prostych ścieżek + min — wykładnicze; dla dużych grafów trzeba Dijkstry/A* (jgrapht je ma), tu świadomie najprostsze rozwiązanie.
- `ExecutionEnvironments.canRunConcurrently` zwraca true dla **tego samego** koloru: "środowisko" = klasa wzajemnie niekonfliktowych kroków. Intuicja "osobne środowisko = równolegle" jest tu ODWROTNA — nie przenoś nazwy bez zrozumienia; `environmentCount` zakłada kolory 0..max.
- `Schedule.first()/last()` zwracają `null` dla pustego planu (nie `Optional`); cykl w `Process.builder` wybucha już przy `addDependency` (jgrapht `GraphCycleProhibitedException extends IllegalArgumentException`), nie przy `build()`.
- `InfluanceAnalyzer#buildInfluenceGraph` jest O(n²) po rezerwacjach i odpytuje mapę per para; mapa kartezjańska to |krawędzie fizyki|×|laby|² — dla dużych instancji oba podejścia trzeba zamienić (adjacency zamiast kartezjanu już jest w kodzie).
- Literówka w nazwie klasy: `InfluanceAnalyzer` (nie `Influence…`) — grep po złej nazwie nic nie znajdzie.

**Braki względem narracji lekcji / SKILL.md (do dorobienia przy adaptacji):**
- **Predykat istotności / progi na krawędziach** (L05: "zależy, i to o ileś dB"): `PhysicsInfluence` przyjmuje i składuje `featureRequirements`, ma `getFeatureRequirements`, ale `InfluenceMap` przy budowie **w ogóle z tego nie korzysta** — model atrybutowy wpływu jest zaślepką; krawędź wpływu jest binarna.
- `DependencyType` jest składowany w `Process.edgeDependencyTypes`, ale nic go nie czyta — semantyka krawędzi harmonogramu to na razie tylko dokumentacja w danych.
- Brak **sumy (union) jako operacji na `cycles.math.Graph`** — union istnieje tylko implicite w `InfluenceMap.addInfrastructure`; brak też usuwania feedback-arc-set / symulacji "co-jeśli" (L08) — lekcja o usuwaniu krawędzi/węzłów nie ma kodu.
- Brak wersji "wszystkie cykle" i wyboru/priorytetyzacji cyklu (fairness, scoring).
- Brak jakiejkolwiek persystencji grafów i integracji ze Springiem mimo zależności w pom (graf = pomocnik runtime; to zgodne z L09, ale nie ma przykładu "graf z bazy").
- `Reservation` i `InfluenceUnit` to strukturalnie identyczne rekordy — rozdzielone celowo (rola biznesowa vs węzeł mapy), ale łatwo je pomylić.
- Niespójny język testów (polskie i angielskie `@DisplayName`/komentarze) — przy generacji wybierz jeden.

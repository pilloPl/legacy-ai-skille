# Plan vs Wykonanie / Algebra Delty — referencyjna implementacja (moduł `planvsexecution`)

## 1. Wskazanie na repo

- **Repo:** `<archetypes>` (ostatni commit dot. modułu: "szlify plan vs execution")
- **Moduł:** `planvsexecution/`
- **Koordynaty Maven:** `com.softwarearchetypes:planvsexecution:0.0.1-SNAPSHOT`
  (parent: `spring-boot-starter-parent:3.5.7`, Java 21)
- **Zależności:** `spring-boot-starter`, `spring-boot-starter-test` (test),
  **`com.softwarearchetypes:quantity:0.0.1-SNAPSHOT`** — stąd `Money` (`Money.pln(100.00)`,
  `Money.zeroPln()`, `add/subtract/abs/isGreaterThan/isNegative/multiply/divideAndRemainder`)
  i `Percentage` (`Percentage.of(BigDecimal)`).
- **Komenda testów:**
  ```bash
  cd <archetypes> && ./mvnw -pl planvsexecution test
  ```
  **UWAGA (pułapka):** powyższa komenda odpala tylko 11 testów (`*Test`). Klasy scenariuszowe
  nazywają się `*Scenarios` i NIE łapią się na domyślny filtr Surefire. Pełny zestaw (38 testów):
  ```bash
  ./mvnw -pl planvsexecution test -Dtest='*Test,*Scenarios'
  ```
- Brak Springa w logice domenowej — wszystko czyste obiekty, `ScheduleAnalysisConfiguration.facade()`
  to ręczna kompozycja (wzorzec z całego repo: konfiguracja in-memory zamiast DI).

## 2. Mapa kodu

Moduł zawiera DWIE pełne instancje archetypu (ta sama struktura, inna domena), jeden mini-przykład
niedopasowania rozdzielczości i jeden celowo zły przykład dydaktyczny.

### 2a. `repaymentanalysis` — harmonogram spłat kredytu (najbogatsza wersja, wzorzec do kopiowania)

Ścieżka: `planvsexecution/src/main/java/com/softwarearchetypes/planvsexecution/repaymentanalysis/`

Rdzeń:
- `Payment` — record `(Instant when, Money amount)`, `Comparable` po dacie; atom planu I wykonania (ten sam typ!).
- `PaymentSchedule` — record `(List<Payment> payments)`; PLAN jako byt pierwszoklasowy; kompaktowy
  konstruktor wymusza porządek chronologiczny; fabryki `of(..)` (sortuje), `empty()`,
  **`fromEvents(List<PaymentProcessed>)`** (wykonanie → ta sama reprezentacja co plan);
  operacje `totalAmount()`, `size()`, `skip(n)`, `take(n)`, `first()`, `last()`.
- `PaymentProcessed` — record zdarzenia WYKONANIA `(UUID eventId, Instant when, Money amount, Instant processedAt)`;
  rozdziela "kiedy zapłacono" od "kiedy przetworzono".
- `ScheduleAnalysisFacade` — wejście do czystego porównania: `analyze(planned, events|actual, tolerance) -> DeltaResult`.
- `ScheduleAnalysisConfiguration` — statyczna fabryka fasady (`facade()`).
- `ConfigurablePaymentSchedule` — plan + lista `ModificationRule` + zbiór reguł już zużytych
  (`appliedOnceRules`); mutowalny `activeSchedule`; builder z DSL-em `onLatePayment(count, modifier)`,
  `onOnTimePayment(count, modifier)`, `addRule(..)`; pakietowa metoda `fulfilled(rules, delta)` aplikuje modyfikatory.
- `ScheduleModificationOrchestrator` — pełny cykl: `analyze(...)` (tylko porównanie) i
  `analyzeAndApply(...)` (porównanie + wyszukanie spełnionych reguł + mutacja aktywnego planu);
  komentarz w kodzie wprost mówi, że mutacja stanu to workaround za persystencję (`//save(plan);`).

Pakiet `repaymentanalysis/delta/` — DELTA jako byt pierwszoklasowy:
- `DeltaCalculator` — serce algebry delty: dla każdej planowanej raty szuka najlepszego dopasowania
  w jeszcze-niedopasowanych wpłatach; **próbuje grup rosnącego rozmiaru (okna `subList`)**, więc
  kilka wpłat częściowych może pokryć jedną ratę; dopasowane usuwa z puli (greedy, bez backtrackingu).
- `PaymentMatch` — record `(Payment planned, List<Payment> actual, MatchResult matchResult)` + `totalActualAmount()`.
- `DeltaResult` — record `(matched, unmatchedPlanned, unmatchedActual, statistics)`;
  predykaty `isPerfectMatch()`, `hasUnderpayments()`, `hasOverpayments()`, `matchRate()`;
  **`fulfills(ScheduleModificationCondition)`** — interpretacja delty pod kątem warunków
  (instanceof-switch po `LatePaymentCondition` / `OnTimePaymentCondition`).
- `DeltaStatistics` — 12 pól liczbowych (totalPlanned/Actual/Matched/Underpaid/OverpaidAmount,
  liczniki planned/actual/matched/underpaid/overpaid/onTime/late) + `netDifference()`;
  onTime = wszystkie wpłaty matcha ≤ planowanej daty, late = którakolwiek po dacie.

Pakiet `repaymentanalysis/tolerance/` — POLITYKI PORÓWNANIA (sygnatura: 1 planowana rata vs GRUPA wpłat):
- `ToleranceStrategy` — `@FunctionalInterface MatchResult matches(Payment planned, List<Payment> actual)`
  z kombinatorami **`and`, `or`, `negate`** (prawdziwa "algebra" polityk, z propagacją powodów).
- `MatchResult` — record `(boolean matched, String reason)`; każda decyzja niesie uzasadnienie tekstowe.
- Implementacje (pakietowe, tworzone tylko przez builder): `ExactMatch` (1 wpłata, kwota i data równe),
  `MoneyTolerance` (|suma wpłat − plan| ≤ kwota), `PercentageTolerance` (odchyłka % z obsługą planu=0),
  `DateTolerance` (każda wpłata w ±N dni), `CombinedTolerance` (money AND date),
  `PartialPaymentsStrategy` (suma wpłat do deadline'u ≤ tolerancja; wpłaty po deadline ignorowane w sumie).
- `ToleranceBuilder` — jedyne publiczne wejście: fluent `tolerance().money(pln(0.05)).days(3).build()`
  oraz nazwane presety domenowe: `exact()`, `fiveGroszy()`, `halfPercent()`, `threeDays()`,
  `lenient()`, `moneyTolerance(Money)`, `partialPayments(Money, Instant deadline)`.

Pakiet `repaymentanalysis/modification/` — SYMULACJE / WHAT-IF:
- `ScheduleModificationCondition` — interfejs-marker; `LatePaymentCondition.atLeast(n)`,
  `OnTimePaymentCondition.atLeast(n)` (walidacja minCount > 0).
- `PaymentScheduleModifier` — `@FunctionalInterface PaymentSchedule modify(current, DeltaResult)`
  + kombinator `andThen`.
- `RemoveInstallmentModifier(index)` — nagroda: usuwa ratę o danym indeksie.
- `SpreadRemainingAmountModifier(n)` — kara/restrukturyzacja: raty niespłacone (wg `delta.matched().size()`)
  rozkłada na n nowych rat; kwota dzielona `divideAndRemainder`, reszta groszowa doliczana do ostatniej
  raty (suma harmonogramu ZACHOWANA); daty interpolowane między pierwszą a ostatnią pozostałą ratą.
- `ModificationRule` — record `(condition, modifier, boolean applyOnce)`; fabryki `of(..)` i `once(..)`.

### 2b. `productionanalysis` — plan produkcji (prostsza kopia tego samego wzorca, bogate javadoki)

Ścieżka: `.../productionanalysis/`
- `PlannedProduction (UUID id, String productId, int targetQuantity)` / `ActualProduction (UUID id, String productId, int producedQuantity)`
  — tu plan i wykonanie to RÓŻNE typy (w przeciwieństwie do payments), sparowane po `productId`.
- `ProductionPlan` — record `(List<PlannedProduction> targets)` + `totalTargetQuantity()`.
- `ProductionAnalysisFacade.analyze(plan, List<ActualProduction>, ToleranceStrategy) -> DeltaResult`.
- `delta/DeltaCalculator` — wariant z filtrem po `productId`: najpierw pojedyncze partie, potem grupy
  2..min(5, n) partii tego samego produktu (scenariusz produkcji dzielonej).
- `delta/DeltaResult` — tu `isPerfectMatch()` wymaga dodatkowo zerowej odchyłki w matchach;
  `hasUnderProduction()`/`hasOverProduction()` patrzą też na odchyłki wewnątrz matchy;
  `fulfills` zna `UnderProductionCondition`.
- `delta/ProductionMatch` — `quantityDeviation()`, `isUnderProduced()`, `isOverProduced()`.
- `delta/DeltaStatistics` — int-y: totalUnder/OverProducedQuantity, netQuantityDifference, liczniki.
- `tolerance/` — `ToleranceStrategy` (bez kombinatorów default), `ExactMatch` (suma partii == target),
  `QuantityTolerance(percent, absolute)` (OR: absolutna LUB procentowa), `CombinedTolerance(List)` (AND),
  `ToleranceBuilder` (`exact()`, `quantityTolerance(5.0, 10)`, `tolerance().quantity(..).build()`).
- `modification/` — `ScheduleModifier`, `UnderProductionCondition.atLeast(q)` (record!),
  `IncreaseBufferModifier.by(10.0)` (powiększa wszystkie targety o % bufora, zachowuje `id` targetów),
  `ModificationRule.once/always`.
- `ConfigurableProductionPlan` (builder: `initialPlan`, `onUnderProduction(minQty, modifier)`) +
  `PlanModificationOrchestrator.analyzeAndApply(configurable, actual, tolerance)`.

### 2c. `resolutionmismatch` — plan i wykonanie w różnych rozdzielczościach

Ścieżka: `.../resolutionmismatch/` — mini-lekcja: plan miesięczny (`MonthlyProductionPlan(YearMonth, int)`)
vs wykonanie dzienne (`DailyProductionExecution(date, produced, defects, rework)` +
`DailyProductionExecutionHistory`). `ProductionTolerance.isWithinTolerance(plan, execution, planToDaily)`
przyjmuje **funkcję mapującą plan na rozdzielczość wykonania** (`Function<MonthlyProductionPlan,
List<DailyProductionExecution>>`) — mapowanie rozdzielczości jest jawnym, wymienialnym parametrem polityki,
a efektywna produkcja dnia to `produced - defects + rework`.

### 2d. `badimplementation/deliveryscheduling` — ANTYPRZYKŁAD (nie kopiować, cytować jako uzasadnienie)

Ścieżka: `.../badimplementation/deliveryscheduling/`
- `DeliveryPlanService` — **Problem 1: plan bez źródła prawdy** — "plan" wyliczany ad hoc JOIN-em
  z `Customer` (SLA), `Warehouse` (capacity), `WorkingCalendar`, `DriverAvailability`; brak historii,
  wersji, tożsamości; `recalculateHistoricalPlan` rzuca `UnsupportedOperationException`.
- `DeliveryScheduleEntity` — **Problem 2: plan + wykonanie + delta w jednej mutowalnej encji**
  (pola plannedDate/actualDate obok siebie, `updateActualDelivery` mutuje, brak kombinatoryki porównań).
- `DeliveryDelta (dateDifferenceInDays, quantityDifference, DeltaType)` + enum `DeltaType`
  (NO_EXECUTION, PERFECT_MATCH, LATE, EARLY, UNDER_DELIVERED, OVER_DELIVERED, DEVIATION).

## 3. API wejściowe (jak używa klient)

### Definicja planu
```java
PaymentSchedule planned = PaymentSchedule.of(List.of(
        Payment.of(instantUTC(2024, 1, 15, 0, 0), pln(100.00)),
        Payment.of(instantUTC(2024, 2, 15, 0, 0), pln(100.00))));
// produkcja:
ProductionPlan plan = ProductionPlan.of(List.of(PlannedProduction.of("WIDGET-A", 100)));
```

### Rejestracja wykonania
Wykonanie wchodzi jako **lista zdarzeń** `PaymentProcessed.of(when, amount, processedAt)`
(konwertowana `PaymentSchedule.fromEvents(..)`) albo wprost jako drugi `PaymentSchedule` /
`List<ActualProduction>`. Wykonanie NIGDY nie mutuje planu — to osobna wartość.

### Delta z polityką
```java
ScheduleAnalysisFacade facade = ScheduleAnalysisConfiguration.facade();
ToleranceStrategy strategy = ToleranceBuilder.tolerance().money(pln(0.01)).days(10).build();
DeltaResult result = facade.analyze(planned, events, strategy);
result.statistics().lateCount(); result.isPerfectMatch(); result.matched().get(0).actual();
```
Presety: `ToleranceBuilder.exact()`, `.fiveGroszy()`, `.partialPayments(pln(0.05), deadline)`.
Kombinatory na strategii: `a.and(b)`, `a.or(b)`, `a.negate()`.

### What-if / symulacja (plan reagujący na deltę)
```java
ConfigurablePaymentSchedule configurable = ConfigurablePaymentSchedule.builder()
        .initialSchedule(planned)
        .onOnTimePayment(3, new RemoveInstallmentModifier(3))     // nagroda
        .onLatePayment(1, new SpreadRemainingAmountModifier(3))   // restrukturyzacja
        .build();
ScheduleModificationOrchestrator orchestrator =
        new ScheduleModificationOrchestrator(facade);
DeltaResult r = orchestrator.analyzeAndApply(configurable, events, strategy);
configurable.activeSchedule(); // plan PO modyfikacjach; oryginalny PaymentSchedule niezmieniony
```
Równoległe scenariusze what-if = kilka `Configurable*` zbudowanych z tego SAMEGO planu bazowego
z różnymi regułami/tolerancjami (test `multiple_simulations_answer_what_if_questions`).

## 4. Testy jako specyfikacja

Ścieżka: `planvsexecution/src/test/java/com/softwarearchetypes/planvsexecution/`

| Plik | Co specyfikuje |
|---|---|
| `repaymentanalysis/PaymentScheduleAnalysisScenarios.java` | Czyste porównanie: exact wyłapuje odchyłki groszowe (1/3 match); `fiveGroszy()` domyka je w perfect match; 3 wpłaty częściowe sumują się do raty (`partialPayments`); onTime/late liczone przy tolerancji money+days. |
| `repaymentanalysis/PaymentSimulationScenarios.java` | 8 symulacji na orkiestratorze: 3 terminowe raty → `RemoveInstallmentModifier` skraca plan (400 zł); 1 spóźniona → `SpreadRemainingAmountModifier(3)` zachowuje sumę 600 zł; wpłaty częściowe liczą się jako onTime; tolerancja 5 gr = rata zapłacona; dwie reguły naraz; brak wpłat = plan bez zmian; **progresja w czasie: reguła `once` nie aplikuje się drugi raz** (size 4 → 4); perfect match 4/4 usuwa ostatnią ratę. |
| `repaymentanalysis/ConfigurablePaymentScheduleScenarios.java` | Reguły na poziomie jednostkowym + przez orkiestrator; `spread_remaining_amount_preserves_total` (5 rat, 1 spłacona, spread na 2 → 3 pozycje, suma 500); `RemoveInstallmentModifier` usuwa środkową ratę z zachowaniem dat pozostałych. |
| `repaymentanalysis/TestInstants.java` | Helper `instantUTC(y,m,d,h,min)` — jedyny sposób tworzenia dat w testach. |
| `repaymentanalysis/delta/DeltaResultAssert.java` | Custom AssertJ assert (konwencja repo): `hasMatchedCount`, `hasUnderpaidCount`, `hasOverpaidCount`, `isPerfectMatch`, `hasMatchRate`, `hasTotalUnderpaid/OverpaidAmount`, `hasNetDifference`, `hasNoUnder/Overpayments` — gotowy, choć obecne scenariusze używają surowego `assertThat` (dostępny do nowych testów). |
| `productionanalysis/ProductionAnalysisScenarios.java` | exact wykrywa odchyłki ilościowe; `quantityTolerance(5.0, 10)` dopuszcza odchyłki (ale `isPerfectMatch()==false`!); **split production: 3 partie 180+170+155 matchują plan 500**; underProduction wskazuje brakujący produkt; `matchRate()==0.6`; overProduction + `netQuantityDifference`. |
| `productionanalysis/SimulationScenarios.java` | underProduction ≥ 50 → bufor +10% na WSZYSTKICH targetach; **`simulation_does_not_change_reality` — oryginalny `ProductionPlan` nietknięty po symulacji**; `modification_rule_applied_only_once`; dwa równoległe scenariusze what-if na jednym planie bazowym. |
| `resolutionmismatch/ProductionToleranceTest.java` | Plan miesięczny vs dni: mapowanie `SPLIT_EVENLY_30_DAYS` w teście jako `Function`; delta uwzględnia defects/rework; **`shouldShowThatDifferentMappingStrategiesGiveDifferentResults` — ta sama para (plan, wykonanie) w tolerancji przy mapowaniu /30 dni i poza nią przy mapowaniu /22 dni robocze**. Zawiera też (nieużywane) mapowania odwrotne wykonanie→miesiąc. |
| `badimplementation/ProblematicDeliverySchedulingTest.java` | 8 testów-dowodów na antywzorce: plan zmienia się gdy zmienia się SLA/capacity, historii nie da się odtworzyć (`UnsupportedOperationException`), mutowalna encja zabija porównania kombinatoryczne i what-if. |

Konwencje testowe: klasy scenariuszowe `*Scenarios` (bez Springa, `new`/statyczna konfiguracja),
komentarze `// given / when / then`, nazwy metod snake_case opisujące regułę biznesową, AssertJ,
pola klasy z fasadą i orkiestratorem, helper dat, custom assert object w pakiecie `delta`.

## 5. Punkty adaptacji (co generyczne, co konkretyzować)

**Szkielet archetypu (stały, kopiowany 1:1 między domenami — widać to po bliźniaczych pakietach
`repaymentanalysis` i `productionanalysis`):**
1. PLAN = niemutowalny byt pierwszoklasowy (record z listą pozycji + inwarianty + operacje total/skip/take).
2. WYKONANIE = strumień zdarzeń/wartości, konwertowalny do porównywalnej reprezentacji (`fromEvents`).
3. DELTA = osobny obiekt-wartość: `matched` / `unmatchedPlanned` (niedowykonanie) /
   `unmatchedActual` (nadwykonanie) + `Statistics` + `fulfills(condition)`.
4. `DeltaCalculator(ToleranceStrategy)` — greedy matching 1 pozycja planu ↔ GRUPA pozycji wykonania.
5. `ToleranceStrategy` + `MatchResult(matched, reason)` + `ToleranceBuilder` z presetami domenowymi.
6. `Configurable<Plan>` (activePlan + rules + appliedOnceRules) + `ModificationRule(condition, modifier, applyOnce)`
   + `*Orchestrator.analyzeAndApply`.

**Do konkretyzacji pod domenę klienta:**
- **Struktura pozycji planu/wykonania:** czy to ten sam typ (payments: `Payment` po obu stronach,
  klucz dopasowania = dopasowanie tolerancją) czy różne typy z jawnym kluczem (production:
  `PlannedProduction`/`ActualProduction` po `productId`). Wybierz wariant wg domeny; wariant z kluczem
  wymaga filtra w `findBestMatch`.
- **Wymiary tolerancji:** payments = kwota (absolutna/procentowa) × data (dni) × deadline częściowych;
  production = ilość (absolutna OR procentowa). Nowa domena = nowe implementacje `ToleranceStrategy`
  + presety w builderze nazwane JĘZYKIEM BIZNESU (`fiveGroszy`, `threeDays`, `lenient`).
- **Słownik delty:** nazwy predykatów na `DeltaResult` są domenowe (`hasUnderpayments` vs
  `hasUnderProduction`), pola `Statistics` domenowe (Money vs int) — nie uogólniać na siłę.
- **Warunki i modyfikatory:** pary (condition, modifier) to reguły kontraktu klienta
  (nagroda za terminowość, bufor przy niedoprodukcji, restrukturyzacja przy opóźnieniu).
- **Mapowanie plan↔wykonanie przy różnych rozdzielczościach:** jeśli plan jest zgrubny a wykonanie
  szczegółowe (miesiąc vs dni), mapowanie podawaj jako jawną `Function` do polityki
  (wzorzec `resolutionmismatch`) — i pokaż, że różne mapowania dają różne werdykty.
- **Persystencja:** celowo brak — orkiestrator mutuje przekazany obiekt z komentarzem `//save(plan)`.
  W realnym systemie Configurable* to agregat z repozytorium.

## 6. Przepis generacji z "mocnego podsumowania"

Wejście: tabela mapowania (pojęcie domenowe → element archetypu), niezmienniki, polityki odchyleń
per segment, reguły modyfikacji planu.

Kolejność (dla domeny `X`, np. `deliveryanalysis`):
1. **Atomy:** record pozycji planu (odpowiednik `Payment`/`PlannedProduction`) z walidacją null/ujemnych
   i record zdarzenia wykonania (odpowiednik `PaymentProcessed`, z `eventId` i czasem przetworzenia).
2. **Plan:** record `XPlan(List<pozycja>)` — inwarianty w kompaktowym konstruktorze (np. chronologia),
   fabryki `of/empty/fromEvents`, operacje total/size/skip/take/first/last wg potrzeb modyfikatorów.
3. **Tolerancje:** interfejs `ToleranceStrategy { MatchResult matches(pozycjaPlanu, List<pozycjaWykonania>) }`
   (dodaj kombinatory `and/or/negate` jak w repayments), `MatchResult(matched, reason)`,
   pakietowe implementacje per wymiar odchyłki z podsumowania, publiczny `ToleranceBuilder`
   z presetami nazwanymi słownikiem klienta. **Polityki per segment = osobne presety lub mapa
   segment→strategia u klienta fasady** (archetyp przyjmuje strategię per wywołanie `analyze`).
4. **Delta:** `XMatch`, `DeltaResult` (matched/unmatchedPlanned/unmatchedActual + predykaty domenowe
   + `fulfills`), `DeltaStatistics.calculate(..)` z miarami z podsumowania, `DeltaCalculator`
   (skopiuj pętlę greedy z grupowaniem; dodaj filtr po kluczu jeśli pozycje mają identyfikator).
5. **Fasada + konfiguracja:** `XAnalysisFacade.analyze(plan, events|actual, tolerance)`,
   `XAnalysisConfiguration.facade()`.
6. **Symulacje:** `ScheduleModificationCondition` (marker) + warunki z progami `atLeast(n)`,
   `Modifier` (@FunctionalInterface + `andThen`), konkretne modyfikatory (pilnuj niezmienników:
   suma zachowana → wzorzec `divideAndRemainder` + reszta do ostatniej pozycji),
   `ModificationRule(condition, modifier, applyOnce)`, `ConfigurableXPlan` z builderem i DSL-em
   `on<WarunekBiznesowy>(próg, modifier)`, `XModificationOrchestrator.analyzeAndApply`.
7. Jeśli rozdzielczości planu i wykonania się różnią — najpierw mały model à la `resolutionmismatch`
   z `Function` mapującą i testem pokazującym wpływ mapowania na werdykt.

**Jakie testy najpierw (TDD, konwencje z pkt 4):**
1. `XAnalysisScenarios`: (a) exact wykrywa odchyłkę → częściowy match + statystyki niedowykonania;
   (b) tolerancja domyka te same dane do pełnego matcha; (c) grupa pozycji wykonania sumuje się
   do jednej pozycji planu; (d) nadwykonanie/niedowykonanie + netDifference; (e) matchRate.
2. `XSimulationScenarios`: (a) warunek spełniony → modyfikator zmienia aktywny plan, inwariant
   (suma/total) zachowany; (b) **oryginalny plan bazowy niezmieniony** ("simulation does not change
   reality"); (c) reguła `once` nie aplikuje się powtórnie; (d) dwa scenariusze what-if z tego samego
   planu bazowego dają różne aktywne plany; (e) brak wykonania → plan bez zmian.
3. Helper dat (`TestInstants`) i `DeltaResultAssert` (custom AssertJ) od razu w pakiecie testowym.
4. Nazwy klas testowych: **`*Scenarios` dla specyfikacji + przynajmniej jedna klasa `*Test`**,
   albo od razu konfiguracja surefire na `*Scenarios` — inaczej CI nie odpali specyfikacji (patrz pkt 7).

## 7. Pułapki i braki

1. **Surefire nie odpala `*Scenarios`** — `./mvnw -pl planvsexecution test` wykonuje tylko 11 z 38
   testów (`ProductionToleranceTest`, `ProblematicDeliverySchedulingTest`). Pełna specyfikacja wymaga
   `-Dtest='*Test,*Scenarios'`. Przy generacji nowego kodu: nazwij testy `*Test` albo dodaj include.
2. **Greedy matching bez backtrackingu** — `DeltaCalculator` bierze PIERWSZĄ pasującą grupę
   (okna `subList` rosnącego rozmiaru), nie optymalną globalnie; przy hojnych tolerancjach wcześniejsza
   rata może "ukraść" wpłaty następnej. Grupy to tylko ciągłe okna listy (posortowanej datami) —
   niesąsiadujące wpłaty nie utworzą grupy. W `productionanalysis` grupy ograniczone do 5 partii.
3. **Koszt kombinatoryczny** — pętla po rozmiarach grup jest O(n²)–O(n³); dla długich historii wykonania
   trzeba ograniczyć okno (jak `min(5, ...)` w produkcji) albo pre-podzielić po kluczu/okresie.
4. **Mutowalność `Configurable*` i brak persystencji** — `activeSchedule`/`activePlan` mutują się
   w miejscu; komentarz w `ScheduleModificationOrchestrator` wprost nazywa to workaroundem
   (`//save(plan)`). Brak wersjonowania planu (historii modyfikacji) — paradoksalnie to samo,
   co wytyka `badimplementation`; w realnej implementacji dodaj agregat + repo + wersje planu.
5. **`appliedOnceRules` oparte o tożsamość obiektu** — `ModificationRule` w repayments to record
   (equals strukturalny), ale `LatePaymentCondition`/`OnTimePaymentCondition` to klasy BEZ equals —
   dwie "identyczne" reguły to różne wpisy w `HashSet`. Działa, bo reguły żyją w jednej instancji planu.
6. **`fulfills` to instanceof-switch** — `DeltaResult` musi znać wszystkie typy warunków; nowy warunek =
   edycja `DeltaResult` (nieobsłużony typ → `false` po cichu). Alternatywa przy generacji: metoda
   `boolean isFulfilledBy(DeltaStatistics)` na warunku.
7. **Hardcode PLN** — `Money.zeroPln()` w sumach (`PaymentSchedule.totalAmount`, `DeltaStatistics`);
   wielowalutowość wymaga neutralnego zera lub reduce bez identity.
8. **Duplikacja między `repaymentanalysis` a `productionanalysis`** — celowa (dydaktyka, dwa słowniki);
   przy generacji NIE buduj wspólnej abstrakcji generycznej, tylko konkretyzuj szkielet pod domenę.
9. **`DeltaResultAssert` nieużywany w scenariuszach** — jest wzorcem konwencji custom assertów,
   ale bieżące testy używają surowego AssertJ; w nowym kodzie używaj go od pierwszego testu.
10. **Brak wersji "czasowej" planu** (obowiązywanie od–do), brak obsługi wielu planów-kandydatów
    naraz w orkiestratorze (porównanie 1 plan × 1 wykonanie na wywołanie; kombinatorykę plan×wykonanie
    realizuje się wieloma wywołaniami fasady — co właśnie umożliwia rozdzielenie bytów).
11. **`PartialPaymentsStrategy` ignoruje wpłaty po deadline przy sumowaniu, ale matchuje całą grupę** —
    wpłata po deadline wewnątrz dopasowanej grupy znika z `unmatchedActual`, mimo że nie weszła do sumy.
12. **Drobiazg:** `SimulationScenarios.under_production_triggers_buffer_increase_simulation` — bufor
    liczony od targetu planu, `int`-owe obcięcie (`(int)(target*pct/100)`); przy małych ilościach
    bufor może wyjść 0.

## 8. Ściąga sygnatur (do szybkiego kopiowania szkieletu)

```java
// rdzeń porównania (repaymentanalysis)
record Payment(Instant when, Money amount) implements Comparable<Payment>
record PaymentSchedule(List<Payment> payments)            // + of/empty/fromEvents/totalAmount/skip/take
record PaymentProcessed(UUID eventId, Instant when, Money amount, Instant processedAt)
class ScheduleAnalysisFacade { DeltaResult analyze(PaymentSchedule planned,
        List<PaymentProcessed>|PaymentSchedule actual, ToleranceStrategy tolerance); }

// delta
class DeltaCalculator { DeltaCalculator(ToleranceStrategy); DeltaResult calculate(planned, actual); }
record PaymentMatch(Payment planned, List<Payment> actual, MatchResult matchResult)
record DeltaResult(List<PaymentMatch> matched, List<Payment> unmatchedPlanned,
        List<Payment> unmatchedActual, DeltaStatistics statistics)
        // + isPerfectMatch/hasUnder.../hasOver.../matchRate/fulfills(condition)
record DeltaStatistics(... 12 pól ...) { static calculate(matched, unmatchedPlanned, unmatchedActual); }

// polityki
@FunctionalInterface interface ToleranceStrategy {
    MatchResult matches(Payment planned, List<Payment> actual);
    default ToleranceStrategy and(other); default or(other); default negate(); }
record MatchResult(boolean matched, String reason)        // matched(reason) / notMatched(reason)
class ToleranceBuilder // tolerance().money(..).days(..).build(); exact(); fiveGroszy(); partialPayments(..)

// symulacje
interface ScheduleModificationCondition {}                 // marker; LatePayment/OnTimePayment.atLeast(n)
@FunctionalInterface interface PaymentScheduleModifier {
    PaymentSchedule modify(PaymentSchedule current, DeltaResult delta); default andThen(next); }
record ModificationRule(condition, modifier, boolean applyOnce)  // of(..) / once(..)
class ConfigurablePaymentSchedule // builder().initialSchedule(..).onLatePayment(n, mod).build()
class ScheduleModificationOrchestrator { DeltaResult analyze(..); DeltaResult analyzeAndApply(..); }

// rozdzielczości (resolutionmismatch)
boolean ProductionTolerance.isWithinTolerance(MonthlyProductionPlan plan,
        DailyProductionExecutionHistory execution,
        Function<MonthlyProductionPlan, List<DailyProductionExecution>> planToDaily)
```

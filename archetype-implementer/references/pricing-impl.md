# Pricing — referencyjna implementacja in-memory (archetyp wyceny / obliczania wartości)

Referencja dla generowania kodu z modelu wyprodukowanego przez `pricing-archetype-mapper`.
Źródło: szkolenie "Archetypy Oprogramowania", Java 21, Spring Boot (tylko jako runner — domena jest czystą Javą).

---

## 1. Wskazanie na repo

- **Repo**: `<archetypes>` (multi-moduł Maven, parent `com.softwarearchetypes:archetypes`)
- **Moduł**: `pricing/` → `com.softwarearchetypes:pricing:0.0.1-SNAPSHOT`, Java 21, parent Spring Boot 3.5.7
- **Zależność domenowa**: `com.softwarearchetypes:quantity` (klasy `Money`, `Unit`, `Percentage` — `quantity/src/main/java/com/softwarearchetypes/quantity/money/Money.java`)
- **Kod produkcyjny**: `pricing/src/main/java/com/softwarearchetypes/pricing/` — JEDEN płaski pakiet, ~3600 linii, 23 pliki (wiele rekordów package-private w jednym pliku)
- **Testy**: `pricing/src/test/java/com/softwarearchetypes/pricing/` — 25 plików, **218 testów** (wszystkie zielone)
- **Docs**: `pricing/docs/` (najważniejszy: `integration-pricing-product-ordering-accounting.md`), plus `pricing/COMPONENT-SCENARIOS.md`, `pricing/E-MOBILITY-COMPONENT-MODEL.md`
- **Diagramy/lekcje**: `diagrams/lekcja-3-cena-jako-funkcja-kontekstu.md` (Money → czas → wiele wymiarów kontekstu), `diagrams/pricing-examples-with-charts.md` (energetyka/logistyka/telco/ładowanie EV — cena jako funkcja pory dnia/sezonu/dnia tygodnia)

**Uruchomienie testów**:
```bash
cd <archetypes> && ./mvnw -pl pricing test
```
(moduł `quantity` musi być zainstalowany/reaktorowy — z katalogu głównego reaktor sam go zbuduje; przy problemach `./mvnw -pl pricing -am test`).

---

## 2. Mapa kodu

Wszystko w pakiecie `com.softwarearchetypes.pricing`. Konwencja: interfejs/encja publiczna w "swoim" pliku, warianty jako package-private rekordy w tym samym pliku.

### Warstwa kalkulatorów (CZYSTE FUNKCJE: Parameters → Money)
| Klasa | Plik | Rola |
|---|---|---|
| `Calculator` (interfejs) | `Calculator.java` | Kontrakt: `calculate(Parameters)`, `interpretation()` (default TOTAL), `simulate(List<Parameters>)`, `describe()`, `formula()`, `getType()`, `getId()`, `name()` |
| `SimpleFixedCalculator` | `Calculator.java` | Stała kwota niezależna od parametrów |
| `SimpleInterestCalculator` | `Calculator.java` | Odsetki roczne: `base × rate/100 / unitsPerYear(unit)` (param. `base`:Money, `unit`:ChronoUnit) |
| `StepFunctionCalculator` | `Calculator.java` | Funkcja schodkowa: `basePrice + ⌊q/stepSize⌋×stepIncrement`; `StepBoundary` EXCLUSIVE/INCLUSIVE |
| `DiscretePointsCalculator` | `Calculator.java` | Lookup cen z mapy `{quantity → Money}`; rzuca dla niezdefiniowanego punktu |
| `DailyIncrementCalculator` | `Calculator.java` | Cena rosnąca dziennie (dyskretnie): `startPrice + dni × dailyIncrement` (param. `date`) |
| `ContinuousLinearTimeCalculator` | `Calculator.java` | Interpolacja liniowa ceny w czasie [startTime, endTime] (param. `time`); rzuca poza domeną |
| `CompositeFunctionCalculator` | `Calculator.java` | Funkcja kawałkami: `Ranges` wybiera kalkulator po wartości parametru; w konstruktorze waliduje jednolitą `Interpretation` wszystkich składowych |
| `PercentageCalculator` | `Calculator.java` | `baseAmount × rate%` (VAT, prowizja, ubezpieczenie…); zaokrągla do 2 miejsc |
| 6 adapterów interpretacji | `Calculator.java` | `UnitToTotalAdapter`, `UnitToMarginalAdapter`, `TotalToUnitAdapter`, `TotalToMarginalAdapter`, `MarginalToTotalAdapter`, `MarginalToUnitAdapter` — dekoratory `Calculator`, fabryka `X.wrap(name, source)` waliduje interpretację źródła |
| `CalculatorType` (enum) | `CalculatorType.java` | Typ + `requiredCreationFields()` (do tworzenia przez fasadę) + `requiredCalculationFields()` (walidacja parametrów w `calculate`) |
| `CalculatorId`, `ComponentId` | osobne pliki | Rekordy-wrappery UUID z `generate()` |
| `Interpretation` (enum) | `Interpretation.java` | SEMANTYKA wyniku: `TOTAL` / `UNIT` (średnia na jednostkę) / `MARGINAL` (cena n-tej jednostki); relacje: Total=Σ Marginal, Unit=Total/q |
| `InterpretationAdapters` | `InterpretationAdapters.java` | `adapt(calc, target)` — automatyczny dobór adaptera (switch po parze źródło→cel) |
| `StepBoundary` (enum) | `StepBoundary.java` | EXCLUSIVE `[0,N)` vs INCLUSIVE `[0,N]` dla progów schodkowych |

### Przedziały (wybór funkcji po kontekście)
| Klasa | Plik | Rola |
|---|---|---|
| `CalculatorRange` (interfejs) | `CalculatorRange.java` | `supports/contains/overlaps/isCompatibleWith` + `calculatorId()`; fabryki `numeric()/time()/date()` |
| `NumericRange` | `CalculatorRange.java` | `[min, max)` na BigDecimal (kwota, waga, ilość) |
| `TimeRange` | `CalculatorRange.java` | `[from, to)` na LocalTime, **obsługuje przedział przez północ** (22:00–06:00) z pełną logiką overlaps |
| `DateRange` | `CalculatorRange.java` | `[from, to)` na LocalDate (sezony) |
| `Ranges` | `Ranges.java` | Agregat przedziałów + `rangeSelector` (nazwa parametru); inwarianty w konstruktorze: niepuste, jeden typ, brak nakładania; `findMatching(Parameters)` |

### Komponenty (SEMANTYKA ceny + wersjonowanie temporalne)
| Klasa | Plik | Rola |
|---|---|---|
| `Component` (sealed) | `Component.java` | `calculate(Parameters[, Interpretation])`, `calculateBreakdown(...)`; permits Simple/Composite |
| `SimpleComponent` | `Component.java` | Nazwa biznesowa + historia `SimpleComponentVersion`; wybiera wersję po `parameters.timestamp()`, mapuje nazwy parametrów (`parameterMappings` np. `"kwh"→"quantity"`), owija kalkulator adapterem interpretacji; `updateWith(version[, strategy])` — niemutowalne dodanie wersji |
| `CompositeComponent` | `Component.java` | Historia `CompositeComponentVersion` (dzieci + zależności); sumuje dzieci (każde skonwertowane do targetInterpretation; sam zawsze TOTAL); `enrichParameters` wstrzykuje wyniki wcześniejszych dzieci do parametrów kolejnych |
| `ComponentVersion` (sealed) | `ComponentVersion.java` | `validity()` + `definedAt()` (tiebreaker) |
| `SimpleComponentVersion` | `SimpleComponentVersion.java` | kalkulator + parameterMappings + Validity + definedAt |
| `CompositeComponentVersion` | `CompositeComponentVersion.java` | children + dependencies (`Map<ComponentId, Map<String, ParameterValue>>`) + Validity + definedAt |
| `Validity` | `Validity.java` | `[validFrom, validTo)`; fabryki `always()/from()/until()/between()`; `isValidAt/overlaps/hasExpired/hasNotStartedYet` |
| `VersionUpdateStrategy` (enum) | `VersionUpdateStrategy.java` | `REJECT_IDENTICAL` (default — overlapy OK, "najmłodszy validFrom wygrywa"), `REJECT_OVERLAPPING` (ścisłe partycje), `ALLOW_ALL` (A/B testy, migracje) |
| `ParameterValue` (sealed) | `ParameterValue.java` | Wyrażenia zależności między dziećmi: `ValueOf(name)`, `SumOf(names...)`, `DifferenceOf(a,b)`, `ProductOf(name, factor)`; `evaluate(Map<Component,Money>)` rzuca, gdy zależność jeszcze niepoliczona (kolejność dzieci!) |
| `ComponentBreakdown` | `ComponentBreakdown.java` | Drzewo (name, contribution, children) — rozbicie ceny; `format()` do wydruku |

### API / infrastruktura
| Klasa | Plik | Rola |
|---|---|---|
| `PricingFacade` | `PricingFacade.java` | JEDYNE publiczne wejście: rejestracja kalkulatorów, tworzenie/wersjonowanie komponentów, obliczenia (szczegóły w §3) |
| `PricingConfiguration` | `PricingConfiguration.java` | Composition root: `inMemory(Clock)` → fasada + in-memory repo (z 2 przykładowymi kalkulatorami: `simple-fixed-20`, `simple-interest-6`) |
| `CalculatorRepository` + `InMemoryCalculatorsRepository` | `PricingConfiguration.java` | save/findByName/findById/findAll/findByIds |
| `ComponentRepository` + `InMemoryComponentRepository` | `PricingConfiguration.java` | j.w.; **`refreshComponent`**: przy odczycie composite'a podmienia dzieci na świeże wersje z repo po ID ("JOIN" — dziecko zaktualizowane po utworzeniu rodzica jest widoczne) |
| `Parameters` | `Parameters.java` | Kontekst wyceny: mapa String→Object; typowane gettery (`getBigDecimal/getMoney/getLocalDate/getTime`) z parsowaniem stringów ("PLN 1999.00", ISO daty); `timestamp()`/`requireTimestamp()` dla wersjonowania; niemutowalne `with(k,v)` |
| `ParameterValue`-e | j.w. | — |
| `PricingResult` (sealed) + `TotalPrice/UnitPrice/MarginalPrice` | `PricingResult.java` | Wynik z semantyką (Money + interpretacja + Unit); **UWAGA: nieużywane przez fasadę** (fasada zwraca gołe `Money`) — wzorzec pokazowy |
| `CalculatorView` | `CalculatorView.java` | DTO odczytowe (id, name, type, description) |
| `PricingApplication` | `PricingApplication.java` | Pusty runner Spring Boot (domena go nie potrzebuje) |

### Money (moduł `quantity`)
`Money.of(amount, "PLN")`, skróty `pln()/eur()/usd()/gbp()` (int/BigDecimal/Number/String), `zeroPln()`, `add/subtract/multiply/divide`, `min/max/abs`, `compareTo`; pilnuje zgodności walut. `Unit` — rekord (symbol, name) z fabrykami `pieces()/kilograms()/hours()...`.

### Ściąga parametrów per CalculatorType (z enuma `CalculatorType`)
| Typ | requiredCreationFields (do `addCalculator`) | requiredCalculationFields (do `calculate`) |
|---|---|---|
| `SIMPLE_FIXED` | `amount` (Money) | — |
| `SIMPLE_INTEREST` | `annualRate` (BigDecimal, %) | `base` (Money), `unit` (ChronoUnit DAYS/WEEKS/MONTHS/YEARS) |
| `STEP_FUNCTION` | `basePrice`, `stepSize`, `stepIncrement` | `quantity` (BigDecimal) |
| `DISCRETE_POINTS` | `points` (Map<BigDecimal,Money>) | `quantity` |
| `DAILY_INCREMENT` | `startDate`, `startPrice`, `dailyIncrement` | `date` (LocalDate) |
| `CONTINUOUS_LINEAR_TIME` | `startTime`, `startPrice`, `endTime`, `endPrice` | `time` (LocalDateTime) |
| `COMPOSITE` | `ranges` (List<CalculatorRange>), `rangeSelector` (String) | zależne od wybranego kalkulatora + parametr selektora |
| `PERCENTAGE` | `percentageRate` (BigDecimal, %) | `baseAmount` (Money) |
| 6 typów `*_ADAPTER` | — (nie do tworzenia przez fasadę!) | `quantity` |

Opcjonalny parametr tworzenia dla większości typów: `"interpretation"` (enum `Interpretation`, default TOTAL); dla STEP_FUNCTION dodatkowo `"stepBoundary"` (enum `StepBoundary`, default EXCLUSIVE).

---

## 3. API wejściowe — od czego zaczyna klient

```java
// 1. Composition root (test lub produkcja) — zawsze z Clock!
Clock clock = Clock.fixed(Instant.parse("2024-01-01T00:00:00Z"), ZoneId.systemDefault());
PricingFacade facade = PricingConfiguration.inMemory(clock).pricingFacade();

// 2. Rejestracja kalkulatorów (CENNIKI — "jak liczymy")
facade.addCalculator("energy-2.50", CalculatorType.SIMPLE_FIXED,
        Parameters.of("amount", Money.pln(2.50), "interpretation", Interpretation.UNIT));
facade.addCalculator("vat-23", CalculatorType.PERCENTAGE,
        Parameters.of("percentageRate", BigDecimal.valueOf(23)));

// 3. Komponenty (SEMANTYKA — "co liczymy") + mapowanie parametrów + Validity
facade.createSimpleComponent("EnergyCharge", "energy-2.50",
        Map.of("kwh", "quantity"),                      // parametr domenowy → parametr kalkulatora
        Validity.from(LocalDateTime.of(2024, 1, 1, 0, 0)));
facade.createSimpleComponent("VAT", "vat-23", Map.of("baseAmount", "baseAmount"), Validity.from(...));

// 4. Kompozycja z zależnościami (VAT liczony od wyniku EnergyCharge)
facade.createCompositeComponent("TotalPrice",
        Map.of("VAT", Map.of("baseAmount", new ValueOf("EnergyCharge"))),
        Validity.from(...),
        "EnergyCharge", "VAT");                          // kolejność dzieci = kolejność liczenia!

// 5. Obliczenie — kontekst to Parameters; "timestamp" wybiera wersje
Money total = facade.calculateComponent("TotalPrice",
        Parameters.of("kwh", BigDecimal.valueOf(20),
                      "timestamp", LocalDateTime.of(2024, 1, 15, 10, 0)));
ComponentBreakdown breakdown = facade.calculateComponentBreakdown("TotalPrice", params);
System.out.println(breakdown.format());   // drzewo: TotalPrice: PLN 61.5 / EnergyCharge: 50 / VAT: 11.5
```

Pozostałe metody fasady:
- `calculate(calculatorName, params)` — goły kalkulator bez komponentu
- `calculateTotal/calculateUnitPrice/calculateMarginal(calculatorName, params)` — auto-wrap adapterem interpretacji (switch po `calc.interpretation()`)
- `availableCalculators()`, `listCalculatorsWithDescriptions()`, `availableCalculatorTypes()` — odczyt
- **Wersjonowanie przez fasadę**: ponowne `createSimpleComponent`/`createCompositeComponent` na TEJ SAMEJ nazwie DODAJE nową wersję (`updateWith`, default REJECT_IDENTICAL) zamiast tworzyć nowy komponent.

Pełna lista sygnatur fasady (`PricingFacade.java`):
```java
List<CalculatorView> availableCalculators();
Calculator addCalculator(String name, CalculatorType type, Parameters creationParams);
Money calculate(String calculatorName, Parameters parameters);
Money calculateTotal(String calculatorName, Parameters parameters);      // auto-adapter → TOTAL
Money calculateUnitPrice(String calculatorName, Parameters parameters);  // auto-adapter → UNIT
Money calculateMarginal(String calculatorName, Parameters parameters);   // auto-adapter → MARGINAL
Map<CalculatorType, List<CalculatorView>> listCalculatorsWithDescriptions();
List<CalculatorType> availableCalculatorTypes();
SimpleComponent createSimpleComponent(String componentName, String calculatorName
        [, Map<String,String> parameterMappings] [, Validity validity]); // istniejąca nazwa ⇒ nowa WERSJA
CompositeComponent createCompositeComponent(String compositeName
        [, Map<String, Map<String, ParameterValue>> dependencies] [, Validity validity],
        String... childComponentNames);                                   // istniejąca nazwa ⇒ nowa WERSJA
Money calculateComponent(String componentName, Parameters parameters);
ComponentBreakdown calculateComponentBreakdown(String componentName, Parameters parameters);
```

Kluczowa zasada: **klient nigdy nie dotyka klas kalkulatorów ani wersji — operuje nazwami (String) + `Parameters` + `Validity`**. Typy kalkulatorów tworzone są deklaratywnie przez `CalculatorType` + wymagane pola (`requiredCreationFields`), walidacja w `PricingFacade.createCalculator`. Adapterów nie można tworzyć przez `addCalculator` (rzuca — test `facade_shouldNotAllowCreatingAdaptersDirectly`). Default `Validity` przy tworzeniu komponentu przez fasadę: `Validity.from(now(clock))` — od teraz na zawsze.

---

## 4. Testy jako specyfikacja

Konwencje: JUnit 5, nazwa `shouldXxx` lub `should_xxx`/`use_case_xxx`, komentarze `// given/when/then`, **zawsze `Clock.fixed`** (`ClockFixture.someFixedClock()`), custom assert `ComponentBreakdownAssert.assertThat(breakdown).hasName(..).hasTotal(..).child("VAT").hasTotal(..)`. Testy scenariuszowe operują WYŁĄCZNIE przez `PricingFacade`; testy jednostkowe kalkulatorów tworzą rekordy bezpośrednio.

### Jednostkowe — kalkulatory i przedziały
- `StepFunctionCalculatorTest` — schody: cena w pierwszym schodku, kolejne, dokładna granica, brak parametru
- `DiscretePointsCalculatorTest` — lookup, wyjątek dla niezdefiniowanego quantity, pojedynczy punkt
- `DailyIncrementCalculatorTest` — dzień 0/1/7/14, data przed startem (ujemne dni!), ujemny increment (cena malejąca), różne waluty
- `ContinuousLinearTimeCalculatorTest` — interpolacja w 1/4, 1/2, 3/4, precyzja minutowa, wyjątki poza [start, end], cena malejąca
- `CompositeCalculatorTest` — delegacja do kalkulatora właściwego przedziału, granice przedziałów, wyjątek poza przedziałami / brak kalkulatora w repo, **fail-fast w konstruktorze gdy składowe mają różne `Interpretation`**
- `NumericRangeTest` / `TimeRangeTest` / `DateRangeTest` — `[a,b)`, overlapy, przedział przez północ (22:00–06:00), niekompatybilność typów
- `RangesTest` — inwarianty agregatu: niepuste, selector niepusty, brak overlapów, jeden typ; `findMatching`
- `ValidityTest` — `[from, to)`, overlapy, open-ended, expired/notStartedYet, `always()`
- `SimulationTest` — `simulate(points)` dla każdego typu kalkulatora (symulacja cennika w przestrzeni parametrów, zachowanie kolejności)

### Interpretacje i adaptery
- `InterpretationTest` — default TOTAL dla każdego typu, jawne ustawianie interpretacji
- `AdaptersTest` — 6 konwersji matematycznie: unit→total (×q), total→marginal (różnica), marginal→total (suma), marginal→unit (średnia), **unit→marginal dla ZMIENNEJ ceny jednostkowej** (poprawny wzór Total(n)−Total(n−1)); walidacja interpretacji źródła w `wrap`
- `PricingFacadeAdaptersTest` — auto-wrapping w `calculateTotal/UnitPrice/Marginal`, zakaz tworzenia adapterów przez fasadę, złożony scenariusz

### Komponenty i zależności
- `ComponentTest` (540 linii, rdzeń specyfikacji) — SimpleComponent deleguje do kalkulatora; Composite sumuje dzieci; hierarchiczny breakdown; **zależności**: `ValueOf`/`SumOf`/`DifferenceOf`/`ProductOf`; wyjątek gdy zależność liczona przed dostawcą (zła kolejność dzieci) lub komponent nie istnieje; mapowanie parametrów + pass-through niemapowanych; konwersje interpretacji dzieci do TOTAL; composite zawsze TOTAL; wyjątek dla pustego composite
- `SimpleComponentVersioningTest` — wersja ważna w timestamp; dodanie wersji nie usuwa starej; **overlap → wygrywa najmłodszy validFrom**; brak wersji → wyjątek; brak timestamp → fallback na `now()`; strategie REJECT_IDENTICAL / ALLOW_ALL / REJECT_OVERLAPPING
- `CompositeComponentVersioningTest` — zmiana KOMPOZYCJI w czasie: dodanie/usunięcie/wymiana dziecka od daty; dzieci same wersjonowane niezależnie; youngest-wins

### Scenariusze biznesowe (end-to-end przez fasadę)
- `*TemporalPricingTest` — rok życia cennika ładowania (sesja 20 kWh): styczeń cennik bazowy 2.50/kWh + VAT 23% = **61.50 PLN**; **luty promocja walentynkowa 2.00 (wersja [1.02, 1.03)) = 49.20 PLN**; marzec automatyczny powrót do 61.50; **maj dodanie ParkingFee 5 PLN (nowa wersja composite'a) = 67.65**; lipiec letnia podwyżka 2.80 = 75.03; wrzesień auto-powrót do 67.65 ("NIC nie musieliśmy robić"); zima parking 8 PLN = 71.34; `shouldVisualizeFullYearTimeline` drukuje oś czasu. To jest wzorcowy test wersjonowania do kopiowania.
- `TelcoComponentScenarioTest` — abonament: base-fee = maintenance 25 + prowizja 20; nadwyżki data/roaming (STEP_FUNCTION od zera); VAT od kwoty netto przez `SumOf`; zagnieżdżony breakdown
- `BankingComponentScenarioTest` — kredyt: odsetki SIMPLE_INTEREST (base=100k, unit=YEARS), ubezpieczenie 2% zależne od `ValueOf("loan-base")`; opłaty za konto + transakcje; opłaty portfelowe z performance fee
- `BankAccountFeeScenarioTest` — opłata za konto wg wpływów (COMPOSITE: [0,3k)→20 PLN, [3k,8k)→10 PLN, [8k,∞)→0), testy wszystkich granic przedziałów
- `*ComponentScenarioTest` — pełna sesja ładowania z wielopoziomowym breakdownem
- `CompositeFunctionCalculatorScenariosTest` — use-case'y: parking wg pory dnia (TimeRange + nocny przez północ), rabat ilościowy, wysyłka wg wagi, happy hours, opłata za przelew wg kwoty

### Dokumentacja — gdzie szukać uzasadnień decyzji projektowych
- `diagrams/lekcja-3-cena-jako-funkcja-kontekstu.md` — narracja "cena to funkcja kontekstu" w 3 poziomach: (1) **Money zamiast BigDecimal** (pułapka: goły BigDecimal nie zna waluty, dodaje PLN do EUR); (2) **czas jako pierwszy wymiar** — parking miejski: naiwne podejście = eksplozja klas `DayParkingPrice`/`NightParkingPrice`/if-ologia; rozwiązanie = `Ranges` + `TimeRange` z magią przedziału przez północ; (3) **wiele wymiarów** — 5 przykładów na `NumericRange`/`TimeRange`/`DateRange`: przelew międzynarodowy wg kwoty, roaming wg minut, wysyłka wg wagi, windykacja wg dni przeterminowania, wizyta lekarska wg typu dnia. Wzorce: walidacja w agregacie `Ranges`, SRP (Range zna "czy zawiera", Calculator "ile", Composite "który wybrać"), konwencja `[from, to)`.
- `diagrams/pricing-examples-with-charts.md` — 4 wykresy funkcji ceny od kontekstu (energetyka: pora dnia; logistyka: sezon; telco: dzień tygodnia; ładowanie EV: taryfy dynamiczne). Kluczowa obserwacja: to wszystko JEDEN wzorzec — funkcja kawałkami po wymiarze kontekstu.
- `pricing/docs/temporal-versioning.md` — pełny opis wersjonowania (Validity, strategie, youngest-wins, definedAt-tiebreaker).
- `pricing/docs/price-interpretations-and-adapters.md` (2158 linii) — matematyka TOTAL/UNIT/MARGINAL + wykresy w `docs/diagrams/*.png` (unit_function, marginal_function, total_function, conversion_diagram).
- `pricing/docs/products-vs-components.md` — rozróżnienie Product (WHAT) vs Component (HOW MUCH), izomorfizm struktur.
- `pricing/docs/lesson-rules-vs-conditionals.md` — dlaczego reguły-obiekty zamiast if-ów.
- `pricing/docs/applicability-in-components.md` — projekt (niezaimplementowany!) ApplicabilityConstraint; patrz §7 p.1.
- `pricing/docs/responsibilities-qa.md` — Q&A o podziale odpowiedzialności; `pricing/COMPONENT-SCENARIOS.md` i `pricing/E-MOBILITY-COMPONENT-MODEL.md` — rozpisane scenariusze komponentowe (lustro testów scenariuszowych).

---

## 5. Punkty adaptacji — co generyczne, co konkretyzować

### Generyczne (przenosisz bez zmian)
- `Calculator` + `Interpretation` + 6 adapterów + `InterpretationAdapters`
- `Validity`, `ComponentVersion`/`Simple-`/`CompositeComponentVersion`, `VersionUpdateStrategy`, logika `versionAt` (youngest validFrom + tiebreaker definedAt)
- `Ranges` + `CalculatorRange` (+3 typy przedziałów), `Parameters`, `ParameterValue` (4 wyrażenia), `ComponentBreakdown`
- `Money`/`Unit` z modułu `quantity`
- Szkielet `PricingFacade` + in-memory repo (z mechanizmem `refreshComponent`)

### Konkretyzujesz pod biznes
1. **Typy kalkulatorów** — nowy wariant = nowy rekord w `Calculator.java` + wpis w `CalculatorType` (typeName, opis, requiredCreationFields, requiredCalculationFields) + case w `PricingFacade.createCalculator`. To jedyne 3 miejsca.
2. **Komponenty i ich drzewo** — czysta konfiguracja (nazwy + kompozycja + zależności), zero nowych klas. Struktura komponentów zwykle izomorficzna ze strukturą produktu (docs: products-vs-components).
3. **Wymiary kontekstu** — klucze w `Parameters` (np. `kwh`, `minutes`, `customerType`, `weight`) + `parameterMappings` tłumaczące język domeny na język kalkulatora; nowe typy przedziałów (np. enum klienta) = nowy `CalculatorRange`.
4. **Cenniki/wersje** — dane: `addCalculator` + `createSimpleComponent(..., Validity)` dla kolejnych okresów. Promocja = wersja z ograniczonym `Validity` nałożona na bazową (REJECT_IDENTICAL + youngest-wins ⇒ automatyczny powrót po promocji — NIC nie trzeba robić).
5. **Jednostka wartości** — zamiast Money można liczyć `Quantity` (punkty, GB, godziny) — docs §"Pricing poza sprzedażą": Pricing = archetyp obliczania WARTOŚCI (odsetki, kary, prowizje, zwroty), nie tylko ceny sprzedaży. `PercentageCalculator` ten sam dla VAT, odsetek i prowizji — sens nadaje nazwa komponentu.

### Integracja (z `docs/integration-pricing-product-ordering-accounting.md`)
- **Product ↔ Pricing**: struktury izomorficzne, różne cele (WHAT vs HOW MUCH). Rozdziel moduły, gdy różna zmienność/zespoły/compliance. **Product upstream**: Pricing importuje tylko `ProductId`; NIGDY odwrotnie (Product z `PriceId` = anty-wzorzec, logika cenowa przecieka).
- **Pricing ↔ Ordering**: Pricing upstream jako **Open Host Service** — `OrderService` woła `pricingFacade.calculate(productId, Parameters.of("quantity", ...))` per linia i sumuje. Pricing NIE zna `Order`/`OrderLine`.
- **Billing**: most przy usage-based pricing / cyklach rozliczeniowych — agreguje sesje, woła Pricing per sesja (z `timestamp` sesji!), buduje Invoice zachowując `ComponentBreakdown` w liniach faktury.
- **Accounting**: **separate ways** — ZERO zależności technicznej. Mapowanie komponent→konto księgowe (EnergyCharge→Revenue:Energy GL-4000, VAT→VAT Payable GL-2300) żyje w warstwie integracyjnej/konfiguracji (`AccountingMapper` czyta Invoice z breakdownem i tworzy `JournalEntry`: debet Receivables = total, kredyty = pozycje breakdownu). Anty-wzorzec: `GLAccount` w `SimpleComponent`.
- **Published language**: `ComponentBreakdown` to czysty rekord danych — bezpieczny kontrakt dla Billing/Accounting ("skąd się wzięła ta kwota" dla audytu).
- Przepływ E2E: `ChargingSessionCompleted` → Billing zapisuje sesję → job miesięczny woła `calculateBreakdown` per sesja → Invoice → event `InvoiceCreated` → Accounting mapuje breakdown na JournalEntry.

---

## 6. Przepis generacji: z "mocnego podsumowania" do działającego kodu

Wejście: podsumowanie z `pricing-archetype-mapper` (mapowanie pojęć, niezmienniki, polityki, poziom złożoności 1–9).

**Krok 0 — skopiuj szkielet.** Przenieś cały pakiet `pricing` + `quantity` (Money/Unit) do nowego modułu; zmień nazwy pakietów. Usuń to, czego mapowanie nie wymaga (np. adaptery interpretacji przy poziomie 1–3, wersjonowanie przy braku wymiaru czasu — ale Validity zostaw, `always()` nic nie kosztuje).

**Krok 1 — zmapuj pojęcia na warstwy.**
- "Formuła/taryfa/stawka/wzór" → `Calculator` (wybierz z 9 istniejących typów; nowy tylko gdy żaden nie pasuje matematycznie)
- "Składnik ceny/opłata/pozycja na fakturze" → `SimpleComponent` (nazwa = język biznesu)
- "Cena całkowita/rachunek/rata" → `CompositeComponent`
- "X liczone od Y" (VAT od netto, ubezpieczenie od kapitału) → dependency z `ValueOf/SumOf/DifferenceOf/ProductOf`; dostawca MUSI być wcześniej na liście dzieci
- "Cennik obowiązuje od/do, promocja, podwyżka" → `Validity` + wersje; polityka konfliktów → `VersionUpdateStrategy`
- "Cena zależy od pory/sezonu/progu" → `CompositeFunctionCalculator` + `Ranges` (wybór funkcji) — NIE if-y w kodzie
- "Cena za sztukę vs łącznie vs za n-tą" → `Interpretation` + adaptery

**Krok 2 — niezmienniki wpisz w konstruktory** (wzorzec z modułu): przedziały `[a,b)`, brak overlapów w `Ranges`, jednolita interpretacja składowych composite'a, niepuste wersje/dzieci, walidacja wymaganych parametrów na początku `calculate`.

**Krok 3 — testy najpierw, w tej kolejności**:
1. Testy jednostkowe każdego NOWEGO kalkulatora (wzór: `StepFunctionCalculatorTest` — wartości w schodku, na granicy, brak parametru, typ, formula)
2. Testy przedziałów/inwariantów, jeśli dodajesz nowy `CalculatorRange` (wzór: `TimeRangeTest` z przypadkiem przez północ)
3. `ComponentTest`-owe: kompozycja + zależności + breakdown dla Twojego drzewa
4. Wersjonowanie: scenariusz "promocja i automatyczny powrót" (wzór: `SimpleComponentVersioningTest.shouldUseYoungestValidFromWhenVersionsOverlap`)
5. **Scenariusz biznesowy end-to-end przez fasadę** (wzór: `*TemporalPricingTest`) — to jest żywa specyfikacja dla biznesu; jeden test = jeden moment w życiu cennika; `Clock.fixed` + `timestamp` w Parameters.

**Krok 4 — fasada i konfiguracja.** Dodaj metody fasady tylko dla operacji z podsumowania; composition root w stylu `PricingConfiguration.inMemory(Clock)`; cenniki startowe rejestruj w konfiguracji lub setUp testów.

Wzorzec zmiany cennika w czasie (kopiuj 1:1 z `*TemporalPricingTest.shouldApplyValentinePromotion_February`):
```java
// Promocja: NOWA WERSJA komponentu "EnergyCharge" ograniczona w czasie — bazowa wersja zostaje
facade.createSimpleComponent("EnergyCharge", "energy-2.00", Map.of("kwh", "quantity"),
        Validity.between(LocalDateTime.of(2024, 2, 1, 0, 0), LocalDateTime.of(2024, 3, 1, 0, 0)));
// luty: wygrywa promocja (youngest validFrom); od 1 marca: AUTOMATYCZNY powrót do 2.50
// Zmiana KOMPOZYCJI (dodanie ParkingFee od maja): nowa wersja composite'a tą samą metodą
facade.createCompositeComponent("TotalPrice",
        Map.of("VAT", Map.of("baseAmount", new SumOf("EnergyCharge", "ParkingFee"))),
        Validity.from(LocalDateTime.of(2024, 5, 1, 0, 0)),
        "EnergyCharge", "ParkingFee", "VAT");
```

**Krok 5 — asserty czytelne biznesowo.** Skopiuj `ComponentBreakdownAssert` i `ClockFixture`; breakdown w testach weryfikuj po nazwach dzieci, nie indeksach (odporne na zmianę kolejności).

**Heurystyka zakresu**: poziomy 1–3 (fixed/percentage/step) = kalkulatory + fasada; 4–6 dodają Ranges i Interpretation; 7–9 dodają wersjonowanie temporalne + zależności między komponentami + (ew.) Applicability — patrz pułapki.

---

## 7. Pułapki i braki

1. **Applicability NIE jest zaimplementowane.** `docs/applicability-in-components.md` opisuje `ApplicabilityConstraint` ("DLA KOGO", AND z Validity w Simple, filtrowanie dzieci w Composite), ale w kodzie go NIE MA — jest tylko Validity (KIEDY). Segmentację klienta trzeba dziś robić przedziałami/parametrami albo dopisać warstwę wg doc-a.
2. **Fasada nie zna `ProductId`.** Docs integracyjne pokazują `calculate(ProductId, Parameters)` — realny kod kluczuje po `String name`. Przy integracji z Product dodaj mapowanie ProductId→componentName (lub zmień sygnatury fasady).
3. **`PricingResult`/`TotalPrice`/`UnitPrice`/`MarginalPrice` są martwe** w fasadzie — zwracane jest gołe `Money`, semantykę niesie nazwa metody. Jeśli chcesz typowanej semantyki wyniku, trzeba ją samemu podpiąć.
4. **Kolejność dzieci composite'a jest znacząca** przy zależnościach — `ValueOf("X")` rzuci `IllegalStateException`, gdy X jest dalej na liście. Brak topologicznego sortowania; zależność tylko "wstecz". Testuj to jawnie (`compositeComponentShouldThrowWhenDependentComponentNotCalculatedYet`).
5. **Brak timestamp ⇒ `LocalDateTime.now()`** (zegar systemowy, nie wstrzyknięty Clock!) w `SimpleComponent/CompositeComponent.calculate`. W testach zawsze podawaj `"timestamp"`; w produkcji to źródło niedeterminizmu.
6. **Parametry przekazywane są do WSZYSTKICH dzieci** composite'a — kolizje nazw między kalkulatorami rozwiązuj przez `parameterMappings` per komponent (np. dwa STEP_FUNCTION oba czytają `quantity` → mapuj `dataGb→quantity` i `roamingMin→quantity` w osobnych komponentach).
7. **Interpretacja SimpleComponent brana z PIERWSZEJ wersji** (`versions.get(0)`), niewymuszana spójność między wersjami — nie mieszaj interpretacji w wersjach jednego komponentu.
8. **`MarginalToTotal`/`MarginalToUnit` to O(q) wywołań** źródłowego kalkulatora — uwaga przy dużych ilościach; `TotalToMarginal` liczy źródło 2×.
9. **Repo in-memory, brak persystencji i współbieżności** — `InMemoryCalculatorsRepository` to `HashSet` (brak unikalności nazw! drugi kalkulator o tej samej nazwie nie nadpisze pierwszego, `findByName` zwróci dowolny); komponenty mają replace-by-id + refresh dzieci. Przy prawdziwej bazie odtwórz semantykę `refreshComponent` (świeże dzieci przy odczycie composite).
10. **Jeden płaski pakiet, package-private rekordy** — świadoma decyzja dydaktyczna (enkapsulacja na poziomie pakietu, publiczna tylko fasada, Validity, Parameters, widoki). Nie rozbijaj na podpakiety bez potrzeby, bo stracisz package-private.
11. **`Parameters` jest słabo typowane** (String→Object, rzutowania w kalkulatorach) — kompilator nie wykryje literówki w kluczu; kontrakt pilnowany przez `requiredCalculationFields` + testy "shouldThrowWhenParameterMissing" — pisz je dla każdego kalkulatora.
12. **Waluty**: operacje Money rzucają przy mieszaniu walut; composite sumujący dzieci w różnych walutach wybuchnie w runtime — brak konwersji FX w module.
13. `PricingConfiguration.inMemory` rejestruje 2 przykładowe kalkulatory (`simple-fixed-20`, `simple-interest-6`) — pamiętaj o nich przy asercjach na `availableCalculators()`.

---

## 8. Szybki słownik: pojęcie biznesowe → element modułu

| Mówi biznes | Bierzesz z modułu |
|---|---|
| "cennik / stawka / taryfa / wzór na cenę" | `Calculator` + rejestracja `facade.addCalculator(name, type, params)` |
| "składnik ceny / opłata / pozycja" | `SimpleComponent` (`facade.createSimpleComponent`) |
| "cena końcowa / rachunek / faktura za sesję / rata" | `CompositeComponent` + `calculateComponentBreakdown` |
| "VAT od netto", "ubezpieczenie od kapitału", "prowizja od obrotu" | dependency: `Map.of("VAT", Map.of("baseAmount", new ValueOf(...)/SumOf(...)))` |
| "promocja od–do", "podwyżka od lipca", "wraca stary cennik" | nowa wersja z `Validity.between/from` + youngest-wins |
| "inaczej w dzień i w nocy / sezonowo / progowo od kwoty" | `COMPOSITE` + `Ranges` z `TimeRange`/`DateRange`/`NumericRange` |
| "cena za sztukę" / "łącznie" / "ile kosztuje n-ta sztuka" | `Interpretation.UNIT/TOTAL/MARGINAL` + adaptery |
| "co ile jednostek drożeje" / "do N sztuk w cenie" | `STEP_FUNCTION` + `StepBoundary.EXCLUSIVE/INCLUSIVE` |
| "cena rośnie każdego dnia przedsprzedaży" | `DAILY_INCREMENT` (dyskretnie) lub `CONTINUOUS_LINEAR_TIME` (płynnie) |
| "tylko te pakiety: 5, 10, 20 sztuk" | `DISCRETE_POINTS` |
| "odsetki X% rocznie" | `SIMPLE_INTEREST` (base + ChronoUnit) |
| "skąd się wzięła ta kwota?" (audyt, księgowość) | `ComponentBreakdown` (+ mapowanie komponent→konto POZA Pricing) |
| "kontekst wyceny" (ilość, czas, klient, waga...) | klucze w `Parameters` + `parameterMappings` |

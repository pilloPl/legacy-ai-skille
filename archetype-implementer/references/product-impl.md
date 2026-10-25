# Archetyp Product — referencyjna implementacja (moduły `product` i `configurator`)

Referencja dla generowania kodu z archetypu **Product** na bazie repo szkoleniowego
`<archetypes>` (szkolenie "Archetypy Oprogramowania", Java 21, in-memory, bez bazy).

---

## 1. Wskazanie na repo

| | `product` | `configurator` |
|---|---|---|
| Ścieżka | `<archetypes>/product/` | `<archetypes>/configurator/` |
| Koordynaty | `com.softwarearchetypes:product:0.0.1-SNAPSHOT` | `softwarearchetypes:configurator:1.0-SNAPSHOT` |
| Parent POM | `spring-boot-starter-parent:3.5.6` (Spring tylko w `ProductApplication`; domena czysta) | brak parenta, czysty Maven + JUnit 5 + AssertJ |
| Pakiet główny | `com.softwarearchetypes.product` (JEDEN płaski pakiet) | `softwarearchetypes.carconfig` + `softwarearchetypes.sat` |
| Zależności | `com.softwarearchetypes:common` (Result, Preconditions), `com.softwarearchetypes:quantity` (Unit, Quantity) | żadnych wewnętrznych |

Budowa i testy (z roota repo):

```bash
cd <archetypes>
./mvnw -pl product,configurator test          # oba moduły
./mvnw -pl product -am test                   # -am dobuduje common i quantity, jeśli brak w ~/.m2
```

**UWAGA (pułapka Surefire):** klasy testowe nazwane `*Scenario` / `*Scenarios`
(`TelecomPackageScenario`, `LogisticsTransportScenario`, `TrackingStrategyScenario`,
`ApplicabilityConstraintScenario`, `ProductRelationshipsScenario`, `CarConfiguringScenarios`,
`NotSatisfiableConfigurationScenarios`, `MissingOptionsToSatisfyConfigurationScenarios`)
**NIE są uruchamiane przez Mavena** — nie pasują do domyślnych include'ów Surefire (`*Test`, `Test*`, `*Tests`, `*TestCase`),
a żaden pom nie konfiguruje surefire. Działają tylko z IDE. Maven wykonuje 152 testy w `product`
i 1 w `configurator` (DPLLSolverTest) — wszystkie zielone. Generując własny kod: nazywaj testy `*Test`
albo dodaj include `*Scenario*` do surefire.

Dokumenty-lekcje w rootcie repo (i w `product/`):
`product/PRODUCT_ARCHETYPE_SUMMARY.md` (najgęstsze streszczenie całości — czytaj NAJPIERW),
`product_type_and_catalog_lesson.md`, `product_features_lesson.md`, `product_relationships_lesson.md`,
`product_relationships_architecture_discussion.md`, `catalog_entry_patterns.md`, `package_lesson.md`,
`package_instance_lesson_scenario.md`, `package_business_scenarios.md`, `applicability_rules_lesson.md`.

---

## 2. Mapa kodu — moduł `product`

Wszystko w `product/src/main/java/com/softwarearchetypes/product/`. Prawie wszystkie klasy są
**package-private** — publiczne są tylko fasady, commands/queries/views, `ApplicabilityConstraint/Context`,
`ProductMetadata`, `ProductRelationship*`. Klient trzyma się fasad.

### Kontrakty kompozytu (definicja i instancja)
- `Product.java` — interfejs-komponent kompozytu: `id()`, `name()`, `description()`, `metadata()`, `applicabilityConstraint()`, default `isApplicableFor(ctx)`; statyczny `Product.builder(id, name, desc)`.
- `ProductType.java` — liść: definicja produktu (unit, trackingStrategy, featureTypes); fabryki nazwane strategią: `define/unique/individuallyTracked/batchTracked/individuallyAndBatchTracked/identical`; niezmienniki w konstruktorze (`checkArgument` na każdym polu).
- `PackageType.java` — kompozyt: pakiet z `PackageStructure`; `validateSelection(List<SelectedProduct>) → PackageValidationResult`. Celowo NIE ma unit ani featureTypes.
- `Instance.java` — interfejs instancji: `id()`, `product()`, `serialNumber(): Optional`, `batchId(): Optional`.
- `ProductInstance.java` — egzemplarz ProductType; konstruktor wymusza: strategia indywidualna→serial, batchowa→batchId, obie→oba, `IDENTICAL`→serial i batch ZABRONIONE; jednostka `Quantity` musi równać się `preferredUnit`; `features.validateAgainst(featureTypes)`; `effectiveQuantity()` = quantity albo domyślnie 1×preferredUnit.
- `PackageInstance.java` — egzemplarz pakietu: lista `SelectedInstance`; w konstruktorze walidacja trackingu ORAZ reguł pakietu (konwersja `SelectedInstance::toSelectedProduct` → `packageType.validateSelection`). Niepoprawna instancja nie może powstać.

### Buildery
- `ProductBuilder.java` — wspólny builder z wewnętrznymi `ProductTypeBuilder` (`.asProductType(unit, strategy)` → `withMandatoryFeature/withOptionalFeature`) i `PackageTypeBuilder` (`.asPackageType()` → `withSingleChoice/withOptionalChoice/withRequiredChoice/withChoice(min,max)/withProductSet/withRule`).
- `InstanceBuilder.java` — lustrzany: `withSerial/withBatch`, potem `.asProductInstance(type)` (`withQuantity`, `withFeature`) lub `.asPackageInstance(pkg)` (`withSelection`).

### Identyfikacja (interfejsy + implementacje standardów z walidacją checksum)
- `ProductIdentifier.java` (interfejs: `type()`, `toString()`), impl.: `UuidProductIdentifier` (`random()`, `of(str)`), `IsbnProductIdentifier` (ISBN-10 + check digit), `GtinProductIdentifier` (GTIN-8/12/13/14 + check digit).
- `SerialNumber.java` (interfejs; fabryki `of/vin/imei`), impl.: `TextualSerialNumber`, `VinSerialNumber` (17 znaków bez I/O/Q), `ImeiSerialNumber` (15 cyfr, Luhn).
- `InstanceId`, `BatchId`, `BatchName` — rekordy UUID/String; `CatalogEntryId` — klasa z `generate()` ("CATALOG-"+UUID); `ProductRelationshipId` — rekord UUID.
- `Batch.java` — opis partii: `batchOf` (ProductIdentifier), `quantityInBatch` (Quantity, unit musi = preferredUnit typu), `dateProduced/sellBy/useBy/bestBefore`, zakres seriali, builder. **Nie ma repozytorium — klasa pasywna.**

### VO definicji
- `ProductName`, `ProductDescription` — rekordy String z walidacją not-blank.
- `ProductMetadata` — niemutowalna mapa klucz-wartość = tożsamość typu (zmiana metadanej ⇒ inny produkt); `with(k,v)` zwraca kopię.
- `ProductTrackingStrategy` — enum 5 strategii + predykaty `isTrackedIndividually/isTrackedByBatch/requiresBothTrackingMethods/isInterchangeable`.
- `Validity` — okres `from/until/between/always`, `isValidAt(date)`; używany przez CatalogEntry.
- `ServiceDeliveryStatus` — enum SCHEDULED→EXECUTING→COMPLETED/CANCELLED; **nieużywany nigdzie — szkic** cyklu życia usług.

### Cechy (features)
- `ProductFeatureType` — nazwa + `FeatureValueConstraint`; fabryki `withAllowedValues/withNumericRange/withDecimalRange/withRegex/withDateRange/unconstrained/of`; equals po nazwie.
- `ProductFeatureTypeDefinition` — cecha + flaga mandatory/optional.
- `ProductFeatureTypes` — kolekcja definicji na ProductType (mapa po nazwie; `mandatoryFeatures()`, `optionalFeatures()`).
- `FeatureValueConstraint` — interfejs: `valueType()`, `type()` (string ID do persystencji), `isValid(Object)`, `desc()`, default `toString/fromString` (konwersja przez `FeatureValueType`).
- `FeatureValueType` — enum TEXT/INTEGER/DECIMAL/DATE/BOOLEAN z `castFrom/castTo` String.
- Impl. constraintów: `AllowedValuesConstraint`, `NumericRangeConstraint`, `DecimalRangeConstraint`, `RegexConstraint`, `DateRangeConstraint`, `Unconstrained`.
- `ProductFeatureInstance` — typ + wartość, **walidacja w konstruktorze** (`featureType.validateValue(value)`); akcesory `asString/asInt/asDecimal/asDate/asBoolean`.
- `ProductFeatureInstances` — kolekcja na ProductInstance; `validateAgainst(featureTypes)`: wszystkie mandatory obecne + żadna cecha spoza definicji.

### Applicability ("nie dla psa kiełbasa")
- `ApplicabilityContext` — generyczna mapa String→String opisująca sytuację (kraj, kanał, wiek…); model nie zna kluczy z góry.
- `ApplicabilityConstraint` — **sealed interface** + rekordy w tym samym pliku: `EqualsConstraint, InConstraint, GreaterThanConstraint, LessThanConstraint, BetweenConstraint, AndConstraint, OrConstraint, NotConstraint, AlwaysTrueConstraint`; fabryki statyczne `equalsTo/in/greaterThan/lessThan/between/and/or/not/alwaysTrue`. Pełna kompozycja boolowska. Wartości porównywane jako String (liczbowe parsowane z try/catch → false przy nie-liczbie).

### Pakiety — struktura i reguły
- `ProductSet` — nazwany zbiór `ProductIdentifier` (pula opcji wyboru).
- `SelectionRule` — interfejs z fabrykami `isSubsetOf(set,min,max)`, `single`, `optional`, `required`, `and`, `or`, `not`, `ifThen(condition, thenRules…)`; rekordy-implementacje w tym samym pliku (`IsSubsetOf` sumuje QUANTITY wybranych pozycji z setu, nie liczy pozycji!). 
- `PackageStructure` — mapa ProductSetów + lista reguł; `validate(selection)` zbiera komunikaty o niespełnionych regułach.
- `PackageValidationResult` — rekord `valid + errors` (sukces/porażka z listą).
- `SelectedProduct` — rekord `(ProductIdentifier, quantity)` — poziom DEFINICJI (do walidacji struktury).
- `SelectedInstance` — rekord `(Instance, quantity)` — poziom INSTANCJI; `toSelectedProduct()` to most między światami.

### Katalog (oferta handlowa)
- `CatalogEntry` — pozycja oferty: `displayName` (marketing), `description` (copy), `product` (ProductType LUB PackageType), `categories`, `Validity`, `metadata`; niemutowalny — `withValidity/withMetadata` zwracają kopie; equals po id. Wewnętrzny builder.
- `CatalogEntryRepository` (interfejs + `InMemoryCatalogEntryRepository` na HashMap w tym samym pliku; fabryka `inMemory()`): `save/findById/findAll/findByProductType/findByCategory/remove`.
- `ProductTypeRepository` (interfejs + `InMemoryProductTypeRepository` w tym samym pliku): `save/findById/findByIdValue(String)/findAll/findByTrackingStrategy/remove`.

### Relacje między produktami
- `ProductRelationship` — rekord `(id, from, to, type)`; relacja = niezależny byt, ProductType o niej nie wie.
- `ProductRelationshipType` — zamknięty enum: `UPGRADABLE_TO, SUBSTITUTED_BY, REPLACED_BY, COMPLEMENTED_BY, COMPATIBLE_WITH, INCOMPATIBLE_WITH`; wszystkie relacje skierowane (asymetryczne).
- `ProductRelationshipDefiningPolicy` — interfejs `canDefineFor(from, to, type)`; w pliku też `AlwaysAllowProductRelationshipDefiningPolicy` (default). **Punkt wstrzykiwania reguł biznesowych.**
- `ProductRelationshipFactory` — jedyne miejsce tworzenia relacji: pyta policy, zwraca `Result.failure("POLICIES_NOT_MET")` albo `Result.success(relationship)`; przyjmuje `Supplier<ProductRelationshipId>`.
- `ProductRelationshipRepository` (interfejs + `InMemoryProductRelationshipRepository` na ConcurrentHashMap): `findAllRelationsFrom(id[, type])`, `findBy(relId)`, `save`, `delete`, `findMatching(Predicate)`.
- `ProductRelationshipsQueries` — czyste query po repo (bez fasady; w tym `findAllRelationsFrom(List<ids>, type)`).

### Fasady i API publiczne
- `ProductFacade` — definicje typów; `ProductCatalog` — oferta; `ProductRelationshipsFacade` — relacje (szczegóły w §3).
- `ProductCommands` / `ProductQueries` / `ProductViews` — publiczne rekordy komend/kryteriów/widoków, wyłącznie proste typy (String/int/LocalDate/mapy); walidacja w kompaktowych konstruktorach. Sealed `FeatureConstraintConfig` i `SelectionRuleConfig` = konfiguracyjne odbicie constraintów/reguł.
- `ProductConfiguration` — **ręczny composition root**: `ProductConfiguration.inMemory()` skleja wszystkie in-memory repo + fasady; to standardowy start modułu w testach.
- `ProductApplication` — pusty `@SpringBootApplication` (nic nie konfiguruje; domena działa bez Springa).

**Eventów domenowych w module NIE MA** (w `common/events` istnieje infrastruktura, ale product jej nie używa).

## 2b. Mapa kodu — moduł `configurator` (SAT-owe rozszerzenie Product)

Odpowiedź na pytanie z lekcji applicability ("związek z SAT/SMT") — konfigurator à la Tesla,
gdzie zależności między opcjami to formuły logiczne rozwiązywane solverem:

- `sat/Clause.java` — rekord: klauzula CNF jako lista intów (dodatni literał = opcja wybrana, ujemny = nie).
- `sat/DPLLSolver.java` — ~50-liniowy rekurencyjny solver DPLL: `solve(List<Clause>, Map<Integer,Boolean>) → boolean`.
- `carconfig/Option` — rekord `(Integer id)`; int bo mapuje się wprost na zmienną SAT. `PickedOption` — wybór w procesie.
- `carconfig/Rule.java` — interfejs `toClause(): List<Clause>`; impl. (w pliku CarConfigurationDefinitionFacade): `ExcludeRule` (¬a∨¬b), `IncludeRule` (¬a∨b), `OneOfPresenceRule` (a1∨…∨an), `IncludeOneOfRule` (¬a∨b1∨…∨bn).
- `carconfig/CarConfigurationDefinitionFacade` — definiowanie reguł konfiguracji modelu (`CarConfigId`): `cantBeTakenTogether`, `mustBeTaken`, `oneOfMustBeTaken`, `mustBeTakenTogether`, `includedConditionally`, `excludedConditionally`; każda operacja NAJPIERW sprawdza satysfakowalność całości (stare+nowe reguły) solverem i rzuca `IllegalArgumentException("Configuration is not satisfiable")` — nie da się zdefiniować sprzecznej oferty.
- `carconfig/CarConfigurationProcess` — stanowy proces konfigurowania klienta: picked/possible/blocked options + rules; `pick()`, `getNonPickedOptions()`, `pickedOptionsClauses()`.
- `carconfig/CarConfigurationFacade` — runtime: `start(processId, configId)` (snapshot reguł do procesu), `pickOption` (SAT-check: wybór + dotychczasowe wybory + reguły muszą być satysfakowalne, inaczej wyjątek), `getMissingOptions` (dla każdej niewybranej opcji: jeśli formuła wymusza jej prawdziwość (canBeTrue && !canBeFalse) → opcja "brakująca").
- `carconfig/OptionsRepository`, `CarConfigurationProcessRepository` — in-memory HashMap-y.

Relacja do `product`: koncepcyjnie `Option` ≈ `ProductIdentifier`, reguły ≈ `SelectionRule`/`INCOMPATIBLE_WITH`,
ale configurator dodaje to, czego `SelectionRule.isSatisfiedBy` nie umie: dowód spójności zbioru reguł
i wnioskowanie "czego brakuje". Moduły NIE są zintegrowane kodem — to dwa poziomy tej samej historii.

---

## 3. API wejściowe — od czego zaczyna klient

Standardowy start (tak robią testy):

```java
ProductConfiguration configuration = ProductConfiguration.inMemory();
ProductFacade productFacade = configuration.productFacade();
ProductCatalog catalog = configuration.productCatalog();
ProductRelationshipsFacade relationships = configuration.productRelationshipsFacade();
ProductTypeRepository typeRepo = configuration.productTypeRepository(); // do seedowania w testach
```

Trzy fasady, wzorzec jednolity: `handle(command) → Result<String, Id>` (failure = komunikat/kod, np. `"PRODUCT_NOT_FOUND: …"`, `"POLICIES_NOT_MET"`), `findBy(criteria) → Optional<View> / Set<View>`. Przez API przechodzą TYLKO proste typy.

- **`ProductFacade`** ("biuro definicji"): `handle(DefineProductType)` — parsuje identyfikator wg `productIdType` (UUID/ISBN/GTIN), unit (symbol → `Unit`), strategię, buduje cechy z `FeatureConstraintConfig` (sealed: `AllowedValuesConfig/NumericRangeConfig/DecimalRangeConfig/RegexConfig/DateRangeConfig/UnconstrainedConfig`); `findBy(FindProductTypeCriteria)`, `findBy(FindByTrackingStrategyCriteria)` → `ProductTypeView` (z `FeatureTypeView` zawierającym `constraintConfig` jako mapę).
- **`ProductCatalog`** ("biuro sprzedaży"): `handle(AddToOffer)` (weryfikuje istnienie typu, buduje `Validity` z dat, generuje `CatalogEntryId`), `handle(DiscontinueProduct)` (skraca validity), `handle(UpdateMetadata)`; query: `findBy(SearchCatalogCriteria)` (tekst+kategorie+dostępność+typ+cechy, z fabrykami `all()/byText()/byCategories()/availableAt()/byProductType()/byFeatures()`), `findBy(FindCatalogEntryCriteria|FindByCategoryCriteria|FindAvailableAtCriteria|FindByMetadataCriteria)` → `CatalogEntryView`.
- **`ProductRelationshipsFacade`**: `handle(DefineRelationship(fromId, toId, "UPGRADABLE_TO"))` — sprawdza istnienie obu produktów (fail-fast), deleguje do factory (policy!), `peekSuccess(repository::save)`; `handle(RemoveRelationship(uuid))`. Odczyt przez osobne `ProductRelationshipsQueries`.
- Niska warstwa (buildery `ProductBuilder`/`InstanceBuilder`, `PackageType.validateSelection`) jest package-private — używana wprost tylko w testach wewnątrz pakietu. W `ProductCommands` są już `DefinePackageType`, `CreateProductInstance`, `CreatePackageInstance` + `SelectionRuleConfig`, ale **fasady ich jeszcze nie obsługują** (patrz §7).

Configurator: klient tworzy repo + `DPLLSolver` ręcznie (brak composition roota):

```java
OptionsRepository optionsRepo = new OptionsRepository();
var definition = new CarConfigurationDefinitionFacade(optionsRepo, new DPLLSolver());
var runtime = new CarConfigurationFacade(optionsRepo, new CarConfigurationProcessRepository(), new DPLLSolver());
```

---

## 4. Testy jako specyfikacja

Katalog: `product/src/test/java/com/softwarearchetypes/product/`, `configurator/src/test/java/...`.
JUnit 5; product używa asercji JUnit (`assertTrue/assertEquals/assertThrows` z message), configurator częściowo AssertJ.

### Testy scenariuszowe (biznesowa specyfikacja; NIE odpala ich Maven — patrz §1)
- `TelecomPackageScenario` — pakiet telco (plany/telefony/akcesoria): zagnieżdżony StarterPack w PhoneBundle, reguła `ifThen(flagship → premium plan)`, min/max akcesoriów, budowa `PackageInstance` z instancjami (seriale) i odrzucenie instancji łamiącej regułę. Odpowiednik `package_instance_lesson_scenario.md`.
- `LogisticsTransportScenario` — Transport Premium: `ifThen(international → not(standardInsurance))`, 0–2 add-ony, obowiązkowy TrackingPackage, opcjonalny NotificationPackage, pakiety zagnieżdżone. Odpowiednik scenariusza 2 z `package_business_scenarios.md`.
- `TrackingStrategyScenario` — po jednym teście na każdą z 5 strategii + testy egzekwowania (brak seriala/batcha → wyjątek; `IDENTICAL` z serialem → wyjątek).
- `ApplicabilityConstraintScenario` — mobile-only, pediatria (and/or/lessThan multi-wymiarowo), zakres wieku, `in`, `not`, złożone `or` — produkt sam odpowiada `isApplicableFor(ctx)`.
- `ProductRelationshipsScenario` — wszystkie 6 typów relacji na realnych przykładach (upgrade path planów, substytuty telefonów, komplementarne cloud storage, kompatybilność ładowarek), usuwanie, graf relacji, relacja dwustronna = dwie lustrzane; startuje z `ProductConfiguration.inMemory()`.

### Testy jednostkowe/fasadowe (odpalane Mavenem, 152 zielone)
- `ProductFacadeTest` (13) — define+find przez komendy/kryteria, wszystkie typy constraintów, ISBN/GTIN, walidacja komend (blank → wyjątek z kompaktowego konstruktora), helper `thereIsProductType(...)` ("there is" = konwencja given).
- `ProductCatalogTest` (16) — add to offer, discontinue (znika z "available at"), metadata update, wyszukiwanie po kategorii/dacie/tekście (case-insensitive)/metadanych, kształt widoku.
- `CatalogEntryTest` (31, @Nested: BuilderTests/AvailabilityTests/CategoryTests/MetadataTests/ImmutableCopyTests/EqualityTests).
- `PackageTypeTest` (12) — walidacja selekcji dla każdego rodzaju reguły (required/optional/and/or/not/conditional), min/max z ilościami, pakiet zagnieżdżony, błędna konstrukcja.
- `PackageInstanceTest` (11) — poprawna/niepoprawna selekcja, egzekwowanie strategii śledzenia pakietu, ilości, zagnieżdżona instancja pakietu.
- `InstanceBuilderTest` (15) — serial/batch/oba, cechy, płynne API, zachowanie wspólnych pól, paralelizm z ProductBuilder.
- `SelectionRuleTest` (21) — reguły elementarne + kompozycje; finałowy `shouldHandleRealWorldBankingScenario` (konto+karta+ubezpieczenie z regułami AND/OR/NOT — scenariusz 1 z `package_business_scenarios.md`).
- `SelectedInstanceTest` (18) — pomost `toSelectedProduct()`, walidacje quantity.
- `FeatureValueConstraintTest` (45, @Nested per constraint) — isValid, złe typy, `fromString` z walidacją, `valueType()`.
- `ApplicabilityConstraintTest` (30) — każdy operator + brzegowe + kompozycje + wpięcie w ProductType.
- `ProductRelationshipsFacadeTest` (5) — ręczne wiring (repo+factory+facade+queries w polach), Result success/failure, `PRODUCT_NOT_FOUND`.
- `ProductRelationshipPolicyTest` (6) — **wzorzec rozszerzania**: testy definiują własne polityki `NoSelfRelationshipPolicy` i `NoSeasonalCompatibilityPolicy` (czyta metadane `seasonal` z repo typów) — gotowy szablon na polityki domenowe.
- `ProductMetadataTest` (5), `ValidityTest` (23, @Nested).

### Configurator
- `CarConfiguringScenarios` — pick bez startu procesu → wyjątek; wykluczenia blokują późniejszy pick.
- `NotSatisfiableConfigurationScenarios` — 10 testów: każda para sprzecznych reguł (w tym łańcuchy includedConditionally) → wyjątek już przy DEFINIOWANIU.
- `MissingOptionsToSatisfyConfigurationScenarios` — 9 testów `getMissingOptions`: mustBeTaken niepicked → brakuje; mustBeTakenTogether po jednym picku → brakuje drugiej; interakcje include/exclude/oneOf.
- `DPLLSolverTest` — pliki CNF w `src/test/resources` (`138Variables_519Clauses_SAT.txt` itd.), assert SAT/UNSAT.

### Konwencje testowe (do naśladowania)
1. Stan budowany **in-memory przez `ProductConfiguration.inMemory()`** albo ręczne `new InMemory...Repository()` — zero mocków, zero Springa, zero bazy.
2. Komentarze `//given //when //then` (lub `//expect`); nazwy `should...` opisujące regułę biznesową; message w asercjach tłumaczy regułę ("Flagship phone should require Premium plan").
3. Fixtures w `@BeforeEach` jako nazwane pola domenowe (`flagshipPhone`, `premiumPlan`), helpery `thereIsProduct()/startedCarConfiguration()`.
4. Testy niezmienników = `assertThrows(IllegalArgumentException.class, () -> builder.build())` — bo walidacja siedzi w konstrukcji.
5. `@Nested` do grupowania aspektów VO; testy scenariuszowe = osobne klasy czytane jak dokumentacja branżowa.
6. Testy fasad operują wyłącznie na commands/criteria/views (proste typy) i `Result.success()/failure()/getSuccess()/getFailure()`.

---

## 5. Punkty adaptacji: co generyczne, co konkretyzować

**Zostaje bez zmian (silnik archetypu):**
- interfejsy kompozytu `Product`/`Instance` + mechanika walidacji w konstrukcji,
- `ProductTrackingStrategy` + egzekwowanie w `ProductInstance`/`PackageInstance`,
- cały system cech (`FeatureValueConstraint` + `FeatureValueType` + instancje z walidacją),
- `ApplicabilityConstraint`/`ApplicabilityContext` (sealed, kompozycyjny),
- `SelectionRule`/`ProductSet`/`PackageStructure`/`PackageValidationResult`,
- `Validity`, `Result`, `Preconditions` (common), `Unit`/`Quantity` (quantity),
- wzorzec repo: interfejs + InMemory w tym samym pliku + fabryka `inMemory()`,
- `DPLLSolver`/`Clause`/`Rule.toClause()` z configuratora (jeśli potrzebny konfigurator).

**Do konkretyzacji pod biznes (tu wstawiasz słownik domeny):**
- **Identyfikatory**: nowe impl. `ProductIdentifier`/`SerialNumber` dla standardów branżowych (wzór: `IsbnProductIdentifier` z walidacją checksum w kompaktowym konstruktorze) + rozszerzenie `parseProductIdentifier` w fasadzie.
- **Polityki relacji**: własne `ProductRelationshipDefiningPolicy` (wzór z testu: `NoSelfRelationshipPolicy`, `NoSeasonalCompatibilityPolicy`; lekcja sugeruje `NoCyclicUpgradePolicy`, `MaxComplementsPolicy`) — wpinane przez konstruktor `ProductRelationshipFactory`, bez zmiany fasady.
- **Typy relacji**: enum `ProductRelationshipType` wg potrzeb domeny (lekcja: celowo ZAMKNIĘTY enum — świat oferty jest stabilny; w przeciwieństwie do Party).
- **Klucze ApplicabilityContext** i konkretne constrainty produktów (kraj/kanał/wiek/segment — kontrakt nazw ustala domena). Decyzja: constraint na `ProductType` (część definicji) czy `CatalogEntry` (kontekst sprzedaży/kampanii) — lekcja applicability, sekcja "Gdzie to może być zapisane".
- **Cechy vs metadane vs osobny typ**: metadana = niezmienna tożsamość typu; feature = wybór klienta/procesu; osobny ProductType/CatalogEntry — gdy warianty różnią się biznesowo (SKU, lifecycle, kampanie) — tabela decyzyjna w `catalog_entry_patterns.md`.
- **Relacja CatalogEntry↔ProductType**: default 1:1; 1:N tylko gdy jedno doświadczenie klienta ukrywa różne produkty operacyjne (decyzja semantyczna).
- **Nazewnictwo domenowe**: lekcje wprost pozwalają w małym stabilnym biznesie mówić własnym językiem (`MassageType`/`MassageInstance`) — niezbywalne minimum to rozdzielenie DEFINICJA vs INSTANCJA. Słowa-maski produktów: ugoda, pakiet, abonament, plan, taryfa, rata, opłata, bonus, świadczenie.
- **Kolejność ewolucyjna wdrażania** (z PRODUCT_ARCHETYPE_SUMMARY §12): (1) Type/Instance + tracking → (2) Unit/Quantity → (3) cechy+metadane → (4) katalog → (5) relacje → (6) applicability → (7) pakiety. Nie generuj wszystkiego, jeśli mapowanie tego nie wymaga.
- **Spójność relacji**: świadomy trade-off na eventual consistency (relacje = metadane sprzedażowe). Jeśli mapowanie zawiera relację będącą TWARDYM niezmiennikiem ("karta wymaga konta"), NIE modeluj jej jako ProductRelationship — to kandydat na regułę pakietu/agregat (dyskusja w `product_relationships_architecture_discussion.md`).

---

## 6. Przepis generacji z "mocnego podsumowania"

Wejście: tabela mapowania pojęcie-domenowe→element-archetypu + niezmienniki + polityki.

1. **Moduł i szkielet.** Nowy moduł Maven (Java 21) z zależnościami `com.softwarearchetypes:common` i `:quantity` (skopiuj te dwa moduły albo dodaj repo jako zależność lokalną; najprościej: skopiuj do swojego repo katalogi `common/` i `quantity/` + sekcję dependencies z `product/pom.xml`). Jeden płaski pakiet domenowy, klasy package-private, publiczne tylko fasady+commands/queries/views.
2. **Mapowanie typów.** Dla każdego wiersza tabeli: pojęcie "definicja czegoś" → klasa à la `ProductType` (lub wprost `ProductType` z domenową fabryką nazwaną intencją); "egzemplarz/umowa/wystąpienie" → à la `ProductInstance`; "zestaw/oferta łączona" → `PackageType`+`PackageStructure`; "pozycja oferty/kampania" → `CatalogEntry`; "powiązanie między produktami" → `ProductRelationship` + enum typów domenowych; "warunek dostępności" → `ApplicabilityConstraint`; "cecha wybierana" → `ProductFeatureType` z odpowiednim constraintem; "stała własność typu" → `ProductMetadata`.
3. **Niezmienniki → konstrukcja.** Każdy niezmiennik z podsumowania wstaw do kompaktowego konstruktora/konstruktora klasy (`checkArgument` z `common.Preconditions`) — wzór: `ProductInstance.validateTrackingRequirements`. Niezmienniki wyboru w pakiecie → `SelectionRule` (`withChoice(min,max)` + `ifThen/not`). Niezmienniki dostępności → `ApplicabilityConstraint`. Reguły tworzenia powiązań → implementacja `...DefiningPolicy` + factory.
4. **Fasady.** Po jednej fasadzie na kontekst (definicje / oferta / relacje), metody `handle(Command) → Result<String, Id>` i `findBy(Criteria) → View`; komendy jako rekordy z prostymi typami i walidacją w kompaktowym konstruktorze; konwersje String→domena w prywatnych `parse...` fasady (wzór `ProductFacade.parseProductIdentifier/parseUnit`).
5. **Composition root.** Klasa `<Domena>Configuration.inMemory()` sklejająca repo in-memory + fabryki + fasady (wzór `ProductConfiguration`). To jest publiczny punkt startu i fixture testów.
6. **Testy NAJPIERW** (red/green), w tej kolejności:
   a) test niezmienników konstrukcji (wzór `TrackingStrategyScenario` — assertThrows na brakujący serial itd.),
   b) test fasady define+find (wzór `ProductFacadeTest.shouldDefineSimpleProductTypeAndFindIt` + helper `thereIs...`),
   c) test scenariusza biznesowego end-to-end z regułami z podsumowania (wzór `TelecomPackageScenario`/`LogisticsTransportScenario`: zbuduj typy w `@BeforeEach`, waliduj dobre i złe selekcje, zbuduj instancję i odrzuć łamiącą reguły),
   d) test polityk (wzór `ProductRelationshipPolicyTest` — polityka zdefiniowana obok testu, potem przeniesiona do produkcji).
   Nazwy klas `*Test` (nie `*Scenario` — §1!), `//given//when//then`, asercje z komunikatem biznesowym.
7. **Konfigurator (opcjonalnie).** Jeśli podsumowanie zawiera reguły zależności między opcjami z potrzebą dowodu spójności lub podpowiedzi "czego brakuje": skopiuj `sat/` (Clause+DPLLSolver) i wzoruj fasady na `CarConfigurationDefinitionFacade` (walidacja satysfakowalności przy definiowaniu) i `CarConfigurationFacade` (pick + missing options). Zmapuj opcje domenowe na kolejne inty. Przy >200 zmiennych rozważ prawdziwy solver (SAT4J) — DPLL tu jest dydaktyczny.
8. **Czego nie kopiować:** `ProductApplication` (pusty Spring), `ServiceDeliveryStatus` (martwy szkic), `System.out.println` w `checkSatisfiability` configuratora.

---

## 7. Pułapki i braki

1. **Testy `*Scenario` nie wchodzą do builda Maven** (brak konfiguracji surefire) — najbogatsza specyfikacja biznesowa działa tylko z IDE. Największa pułapka przy "testy przechodzą".
2. **Brak obsługi pakietów i instancji w fasadach**: komendy `DefinePackageType`, `CreateProductInstance`, `CreatePackageInstance` i `SelectionRuleConfig` istnieją w `ProductCommands`, ale ŻADNA fasada ich nie przyjmuje; nie ma `InstanceRepository` ani `PackageTypeRepository` (`ProductTypeRepository` trzyma tylko ProductType; `CatalogEntry.product()` może trzymać PackageType, ale nie da się go dziś dodać przez `AddToOffer`, bo ten szuka w ProductTypeRepository). Pakiety/instancje działają tylko na poziomie obiektów domenowych w testach.
3. **Brak eventów domenowych i brak persystencji** — in-memory HashMap (bez wersjonowania, bez optymistycznej blokady; tylko repo relacji używa ConcurrentHashMap). `toString/fromString` constraintów to przygotowanie pod persystencję, której nie ma.
4. **Sprzątanie relacji po usunięciu produktu nie istnieje** — lekcja zapowiada asynchroniczną rekonsyliację (eventual consistency), kodu brak. `RemoveRelationship` na nieistniejącym id zwraca `Result.success` (delete jest idempotentny, Optional ignorowany).
5. **`ProductRelationshipsFacade` parsuje tylko UUID** (`parseProductIdentifier` → `UuidProductIdentifier.of`) — relacje dla produktów z ISBN/GTIN nie zadziałają bez rozszerzenia.
6. **`ApplicabilityContext` jest stringowy** — porównania liczbowe przez `Integer.parseInt` z połknięciem błędu (nie-liczba → warunek niespełniony, bez sygnału); brak dat w operatorach (tylko int).
7. **`SelectionRule.IsSubsetOf` sumuje ilości** (`mapToInt(quantity).sum()`), nie liczbę różnych produktów — "wybierz 1 z" przy quantity=2 jednej pozycji NIE przejdzie; bywa to zaskoczeniem przy mapowaniu "min/max różnych opcji".
8. **Walidacja pakietu nie jest rekurencyjna w głąb** — `PackageInstance` waliduje swoją selekcję na poziomie typów; zawartość zagnieżdżonej instancji pakietu waliduje się przy JEJ tworzeniu (to spójne, ale selekcja "StarterPack" w nadrzędnym pakiecie to tylko jego productId).
9. **`CatalogEntry` nie ma własnego `ApplicabilityConstraint`** mimo że lekcje dopuszczają przypinanie reguł do wpisu katalogowego — dziś reguła żyje tylko na Product. Rozszerzenie trywialne (pole + filtr w ProductCatalog), ale trzeba je dopisać.
10. **Wyszukiwanie katalogu po cechach** (`matchesFeatures`) sprawdza, czy ProductType AKCEPTUJE wartość cechy (constraint), a nie czy jakaś instancja ją MA; dla PackageType zwraca false.
11. **Brak builderów publicznych na zewnątrz** — generując własny moduł pamiętaj, że klient spoza pakietu widzi tylko fasady; jeśli potrzebujesz budowy pakietów u klienta, musisz dodać obsługę `DefinePackageType` w fasadzie (p. 2).
12. **Configurator**: brak walidacji, że pickowana opcja należy do konfiguracji; `OptionsRepository.load` zwraca null dla nieznanego id (NPE-prone); opcje dodawane wielokrotnie (lista, nie set); `CarConfigurationProcess.blockedOptions` nigdy nie jest zasilane (martwe pole); `System.out.println` w ścieżce produkcyjnej; DPLL wykładniczy — dydaktyczny, nie produkcyjny.
13. **Dwa style w repo**: product (bogaty, fasadowo-komendowy, com.softwarearchetypes) vs configurator (surowy, bez Result, softwarearchetypes bez prefixu com) — generując kod trzymaj się stylu PRODUCT; configurator traktuj jako wzorzec algorytmiczny.

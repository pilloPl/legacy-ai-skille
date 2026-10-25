# Rules & Scoring — referencyjna implementacja (moduł `rules`)

Referencja dla archetypu **Rules & Scoring** ze szkolenia "Archetypy Oprogramowania".
Dwa niezależne światy w jednym module:

- **`scoring`** — drzewa wyrażeń (AST) + **wymienne algebry** (crisp score / explainable / fuzzy) + silnik ewaluacji reguł po oknie zdarzeń,
- **`rules.discounting` + `rules.predicates`** — reguły rabatowe jako **kompozycja predykatów i modyfikatorów**, z konfiguracją ładowaną w runtime (statyczna, dynamiczna, refleksyjna z "bazy danych").

Do tego lekcja `applicability_rules_lesson.md` (root repo) — trzecia odsłona tego samego
archetypu: warunki stosowalności produktów (`ApplicabilityConstraint`), zaimplementowana
w module `product`, nie w `rules`.

---

## 1. Wskazanie na repo

- Repo: `<archetypes>` (multi-moduł Maven, parent `com.softwarearchetypes:software-archetypes`).
- Moduł: `<archetypes>/rules/`
- Koordynaty: `com.softwarearchetypes:rules:0.0.1-SNAPSHOT`, `jar`, Java 21.
- Zależności: `com.softwarearchetypes:quantity` (Money, Percentage, Quantity, Unit — javax.money/Moneta pod spodem), JUnit 5, AssertJ (zadeklarowany, w testach używany jest JUnit `assertEquals`).
- **Kluczowy detal builda**: `maven-compiler-plugin` z flagą **`-parameters`** — bez niej
  refleksyjna (de)serializacja konfiguracji (`ReflectionBeanReader/Writer`) nie działa,
  bo czyta nazwy parametrów konstruktorów z bytecode'u.
- Komenda testów:
  ```bash
  cd <archetypes> && ./mvnw -pl rules test
  # jeśli quantity nie jest zainstalowane w lokalnym repo: ./mvnw -pl rules -am test
  ```
- Lekcja powiązana: `<archetypes>/applicability_rules_lesson.md`
  ("Nie dla psa kiełbasa") — opisuje `ApplicabilityContext` + sealed `ApplicabilityConstraint`
  (EQUALS/IN/GT/LT/BETWEEN/AND/OR/NOT/ALWAYS_TRUE) wpięte w `ProductType.isApplicableFor(ctx)`.
  Kod tej wersji: `product/src/main/java/com/softwarearchetypes/product/ApplicabilityConstraint.java`
  i testy `product/src/test/java/com/softwarearchetypes/product/ApplicabilityConstraintTest.java`.

---

## 2. Mapa kodu

Wszystkie ścieżki względem `rules/src/main/java/com/softwarearchetypes/`.

### 2a. Świat scoringu: AST + algebry (`scoring/`)

**AST — `scoring/ast/`**
- `Expression.java` — interfejs (NIE sealed) z zagnieżdżonymi rekordami-węzłami:
  `And(left,right)`, `Or(left,right)`, `Not(inner)`, `MetricCmp(metric, op, value)`,
  `ConstScore(int)`, `Sum(List<Expression>)`, `IfThenElse(cond, thenBranch, elseBranch)`,
  `Labeled(label, inner)`. Każdy ma `accept(ExpressionVisitor<R>)` — klasyczny Visitor.
- `ExpressionVisitor.java` — generyczny visitor `R visit(...)` po jednym na typ węzła.
- `Metric.java` — enum metryk domenowych: `YEARLY_PURCHASE_AMOUNT`, `QUARTERLY_COMPLAINT_COUNT`, `LAST_PURCHASE_DAYS_AGO`.
- `CmpOp.java` — enum `GT/GTE/LT/LTE/EQ` z metodą `compare(double,double)` (switch-expression).
- `EventRule.java` — `record EventRule(Expression filterExpr, Expression scoreExpr)` — reguła = filtr (czy się stosuje) + wyrażenie punktujące.

**Algebry — `scoring/algebra/`**
- `Algebra<R>.java` — serce wzorca: interfejs operacji `or/and/not/metricCmp/constScore/sum/ifThenElse`
  + `default label(...)` (ignorowany poza explainable). **Jedno AST, wiele interpretacji** —
  to jest tagless-final / object algebra w wersji szkoleniowej.
- `AlgebraicVisitor<R>.java` — generyczny visitor, który rekurencyjnie składa wynik,
  delegując każdy węzeł do `Algebra<R>`. Jedna implementacja visitora obsługuje wszystkie algebry.
- `score/Score.java` — `record Score(int value)` z `ZERO`, `plus`, `minus`.
- `score/ScoreAlgebra.java` — crisp: and=min, or=max, not=0/1, metricCmp→0/1, constScore→punkty, sum=suma, ifThenElse po `cond>0`.
- `explained/ExplainableAlgebra.java` — `Algebra<ExplainedScore>`; `label()` dokleja `Contribution(label, value)` gdy wynik ≠ 0 → **wyjaśnialny scoring** (skąd wzięły się punkty).
- `explained/ExplainedScore.java`, `explained/Contribution.java` — rekordy: total + niemodyfikowalna lista kontrybucji.
- `fuzzy/FuzzyAlgebra.java` — `Algebra<FuzzyValue>`; logika rozmyta: and=min, or=max, not=1−x,
  `metricCmp` z **marginesem per metryka** (`Map<Metric, Double> margins` w konstruktorze) —
  rampy liniowe `fuzzyGreater/fuzzyLess/fuzzyEqual`; margines 0 ⇒ zachowanie crisp;
  `ifThenElse` = interpolacja `c*then + (1−c)*else`; `sum` ucina do 1.0.
- `fuzzy/FuzzyValue.java` — `record FuzzyValue(double degree)` z klampowaniem do [0,1] w kompaktowym konstruktorze.
- `score/simplified/` — **alternatywa dydaktyczna bez visitora**: `ScoringAlgebra` (interfejs zdublowany,
  nie-generyczny), `SimpleScoringAlgebra`, `ExpressionEvaluator.eval(expr, ctx, alg)` —
  statyczna rekurencja po `instanceof` (oznaczone w kodzie "not important code, just sample").

**Kontekst i silnik — `scoring/context/`, `scoring/events/`, `scoring/`**
- `context/WindowContext.java` — okno obserwacji klienta: `customerId`, `from/to` (Instant),
  `List<CustomerEvent> events`, `Map<Metric, Double> metrics`; `getMetric()` z defaultem 0.0.
- `context/EventWindowContext.java` — rozszerza WindowContext o `currentEvent` (scoring per zdarzenie).
- `events/CustomerEvent.java` — `record(type, occurredAt, amount)`.
- `EventRuleEngine.java` — silnik: dla każdego zdarzenia w oknie, dla każdej `EventRule`:
  ewaluuje `filterExpr` algebrą filtrującą (warunek spełniony gdy `Score.value() > 0`),
  jeśli tak — ewaluuje `scoreExpr` algebrą punktującą (w `EventWindowContext`) i sumuje.
  Przyjmuje dwie algebry w konstruktorze: `filterAlgebra` i `scoreAlgebra` (obie `Algebra<Score>`).

### 2b. Świat reguł rabatowych (`rules/`)

**Generyczne predykaty kompozycyjne — `rules/predicates/`**
- `LogicalPredicate<T>` — marker `extends Predicate<T>` (marker jest istotny: po nim
  refleksyjny reader rozpoznaje, że ma deserializować DRZEWO, nie pojedynczy bean).
- `BinaryLogicalPredicate<T>` — abstrakcyjna baza z `left()`/`right()` (akcesory potrzebne serializacji).
- `AndPredicate<T>`, `OrPredicate<T>`, `NotPredicate<T>` (z `child()`).
- `RichLogicalPredicate<T>` — interfejs z defaultowymi kombinatorami `and()/or()/not()` —
  fluent API dla reguł liściowych (`StatusRule.of(VIP).and(TimeBeingCustomer.ofYears(3))`).

**Model oferty — `rules/discounting/offer/`**
- `OfferItem.java` — pozycja oferty: `productId`, `Quantity`, `basePrice`, `finalPrice`,
  lista `Modification`; `apply(Modification)` zwraca NOWY item (styl immutable) z nową ceną
  i dopisaną modyfikacją — pełny audyt "co i dlaczego zmieniło cenę".
- `Modification.java` — `record(Money amount, String description)`; **uwaga: `amount` to NOWA cena, nie delta**.

**Modyfikatory — `rules/discounting/` + `offer/modifiers/`**
- `OfferItemModifier.java` — SAM interfejs: `OfferItem modify(OfferItem item)`.
- `modifiers/NamedOfferItemModifier` — abstrakcyjna baza z nazwą (trafia do opisu modyfikacji).
- `modifiers/simple/PercentageOfferItemModifier` — rabat % od ceny bazowej.
- `modifiers/EmptyModifier` — null object.
- `modifiers/ChainOfferItemModifier` — kompozyt: lista modyfikatorów aplikowana sekwencyjnie (fold po `modify`).
- `modifiers/ConfigurableItemModifier` — **najważniejsza klasa świata rabatów**; triada funktorów:
  `Predicate<OfferItem> predicate` (czy pozycja łapie się na promocję) →
  `Function<OfferItem, Money> applier` (nowa cena) →
  `Predicate<OfferItem> guardian` (strażnik: czy wynik jest dopuszczalny — jeśli nie, item wraca NIEZMIENIONY).

**Funktory — `offer/modifiers/functors/`**
- `predicates/`: `ItemIdPredicate` (konkretny produkt), `MoreExpensiveThanPredicate` (basePrice ≥ próg),
  `QuantityPredicate` (**STUB — `test()` zwraca false, TODO komparator z jednostkami**).
  Wszystkie implementują `RichLogicalPredicate<OfferItem>` → komponowalne and/or/not.
- `applier/`: `Amount` (finalPrice − kwota), `FixedPrice` (sztywna cena),
  `PercentageFromBase` (finalPrice − %·basePrice; rabaty niezależne od kolejności),
  `PercentageAccumulated` (finalPrice − %·finalPrice; rabaty składane — kolejność MA znaczenie).
- `guardians/`: `MarginGuardian` (finalPrice ≥ %·basePrice — ochrona marży), `EmptyGuardian.INSTANCE`.

**Kontekst klienta — `rules/discounting/client/`**
- `ClientContext` — `record(id, ClientStatus, Money totalExpenses, LocalDate firstOrder)` — fakty o kliencie, na których działają reguły.
- `ClientStatus` — enum `STANDARD/VIP/GOLD` z `accept(ClientStatusVisitor)` (visitor na enumie — alternatywa dla switcha).
- `ClientStatusVisitor<R>`, `ClientContextRepository` (port), `ClientFinder` (port: `countVipClients/countAllClients`).
- `client/rules/` — predykaty liściowe na `ClientContext`: `StatusRule`, `ExpensesRule` (totalExpenses ≥ min),
  `TimeBeingCustomer` (staż klienta w DAYS/WEEKS/MONTHS/YEARS — z bugami, patrz §7).
  Wszystkie mają fabryki `of(...)` i **gettery** (wymagane przez refleksyjny writer).

**Konfiguracja reguł w runtime — `rules/discounting/config/`**
- `ConfigProvider` — port: `Map<OfferItemModifier, Predicate<ClientContext>> loadConfig()`.
  Konfiguracja = pary (co robi promocja, dla kogo).
- `SampleStaticConfig` — konfiguracja zaszyta w kodzie (2 promocje VIP).
- `SampleDynamicConfig` — konfiguracja WYLICZANA w runtime z danych biznesowych:
  promocje overstockowe z `InventoryFinder.findOverstockedProducts()` (im więcej i dłużej w magazynie, tym większy rabat, max 30%),
  oraz strategia zależna od `vipRatio` z `ClientFinder` (<5% VIP → promo budujące bazę VIP; inaczej → retencja VIP).
- `DiscountRepository` — port persystencji: `Discount(id, name)` + `DiscountParam(discountId, paramName, paramValue)` (EAV: klucz→wartość).
- `config/reflection/` — **(de)serializacja reguł do płaskiej mapy String→String** (zamiast JSON z lekcji):
  - `ReflectionBeanWriter` — bean → wpisy `prefix.class`, `prefix.<param>`; specjalne typy: `Money` (`.money.amount/.currency`), `Percentage`, oraz **drzewo `LogicalPredicate`** jako graf węzłów: `prefix.root=n1`, `prefix.n1.type=AND|OR|NOT|LEAF`, `n1.left/right/child`, liść = klasa + parametry konstruktora.
  - `ReflectionBeanReader` — odwrotność: `readBean(prefix, expectedType)`; rekordy przez `getRecordComponents`, POJO przez jedyny konstruktor + nazwy parametrów (stąd `-parameters`), rekurencyjnie zagnieżdżone beany i drzewa predykatów.
  - `ReflectionDynamicConfig implements ConfigProvider` — czyta z `DiscountRepository` wszystkie dyskonta, z paramów odtwarza `OfferItemModifier` (prefix `modifier`) i `Predicate<ClientContext>` (prefix `clientPred`); `Config.java` trzyma prefixy.
- `rules/discounting/stock/` — `ProductStock(productId, Quantity, daysInStock)`, port `InventoryFinder`.

**Fabryka — trzy ewolucje (`OfferItemModifierFactory`)**
1. `createDiscountModifier(ClientStatus)` — switch po statusie (wersja naiwna),
2. `createDiscountModifier2(ClientStatus)` — visitor na enumie (`OfferItemModifierVisitor`),
3. `createDiscountModifier3(UUID clientId)` — **docelowa**: ładuje config z `ConfigProvider`,
   filtruje wpisy predykatem po `ClientContext` klienta, pasujące modyfikatory składa w `ChainOfferItemModifier`.

---

## 3. API wejściowe (jak klient używa)

### Scoring (budowa AST + wybór algebry)

```java
// 1. Kontekst: metryki wyliczone dla okna czasowego klienta
WindowContext ctx = new WindowContext(customerId, from, to, events,
        Map.of(Metric.YEARLY_PURCHASE_AMOUNT, 20_000.0,
               Metric.QUARTERLY_COMPLAINT_COUNT, 5.0));

// 2. Reguła jako drzewo wyrażeń (rekordy)
Expression rule = new Expression.Sum(List.of(
    new Expression.IfThenElse(
        new Expression.MetricCmp(Metric.YEARLY_PURCHASE_AMOUNT, CmpOp.GT, 10_000.0),
        new Expression.ConstScore(50), new Expression.ConstScore(0)),
    new Expression.IfThenElse(
        new Expression.MetricCmp(Metric.QUARTERLY_COMPLAINT_COUNT, CmpOp.GT, 3.0),
        new Expression.ConstScore(-30), new Expression.ConstScore(0))));

// 3. Ewaluacja: to samo drzewo, różne algebry
Score s        = rule.accept(new AlgebraicVisitor<>(ctx, new ScoreAlgebra()));          // 20
ExplainedScore e = rule.accept(new AlgebraicVisitor<>(ctx, new ExplainableAlgebra())); // 20 + kontrybucje (gdy węzły owinięte Labeled)
FuzzyValue f   = rule.accept(new AlgebraicVisitor<>(ctx, new FuzzyAlgebra(margins)));  // stopień [0,1]

// 4. Silnik reguł per-zdarzenie
var engine = new EventRuleEngine(new ScoreAlgebra(), new ScoreAlgebra());
Score total = engine.evaluateRules(List.of(new EventRule(filterExpr, scoreExpr)), ctx);
```

### Rabaty (konfiguracja → fabryka → modyfikacja oferty)

```java
// Konfiguracja: KTO (predykat na ClientContext) dostaje CO (OfferItemModifier)
Predicate<ClientContext> who = StatusRule.of(ClientStatus.VIP)
        .and(TimeBeingCustomer.ofYears(3));
OfferItemModifier what = new ConfigurableItemModifier(
        "3 years of VIPs",
        new MoreExpensiveThanPredicate(Money.pln(50)),   // które pozycje
        new PercentageFromBase(Percentage.of(10)),       // jak zmienić cenę
        new MarginGuardian(Percentage.of(30)));          // strażnik marży

// Fabryka składa łańcuch pasujących promocji dla klienta
var factory = new OfferItemModifierFactory(clientContextRepository, configProvider);
OfferItemModifier modifier = factory.createDiscountModifier3(clientId);
OfferItem result = modifier.modify(new OfferItem(productId, Quantity.of(1, Unit.kilograms()), Money.pln(100)));
result.getFinalPrice();       // cena po wszystkich promocjach
// result ma pełną listę Modification (audyt: nazwa promocji + nowa cena)

// Persystencja reguł (round-trip bez JSON, przez mapę paramName→paramValue):
new ConfigImporter(discountRepository).importConfig(configProvider.loadConfig()); // zapis (klasa w src/test!)
ConfigProvider restored = new ReflectionDynamicConfig(discountRepository);        // odczyt w runtime
```

---

## 4. Testy jako specyfikacja

7 testów, wszystkie zielone (`Tests run: 7, Failures: 0`). Pliki w `rules/src/test/java/com/softwarearchetypes/`:

**`scoring/ExpressionEvaluatorTest.java`** (2 testy)
- `simplified_ScoringAlgebraTimeWindowTest` — reguła "obrót roczny > 10k → +50; reklamacje kwartalne > 3 → −30"
  na metrykach {20000, 5} daje `Score(20)`; ewaluacja statycznym `ExpressionEvaluator.eval` + `SimpleScoringAlgebra`.
- `scoringAlgebraTimeWindowTest` — TA SAMA reguła i wynik przez `rule.accept(new AlgebraicVisitor<>(ctx, new ScoreAlgebra()))` —
  test dokumentuje równoważność obu stylów ewaluacji (instanceof vs visitor+algebra).
- Konwencja: prywatny helper `yearlyAndQuarterlyRule()` buduje AST; `WindowContext` z nullami poza metrykami
  (metryki są jedynym wejściem — zdarzenia nieużywane).

**`rules/discounting/ChainOfferModifierTest.java`** (2 testy)
- `testOneMod` — `ConfigurableItemModifier`(próg 1000 PLN, `Amount` −100, `MarginGuardian` 30%): item za 2000 → 1900.
- `testGuardian` — upust −900 przy strażniku 60% marży: 2000−900=1100 < 60%·2000=1200 ⇒ **guardian odrzuca, cena wraca do 2000**.
  To jest spec strażnika: modyfikacja odrzucona = item niezmieniony (bez wyjątku).
- Konwencja: helper `anyItemPriced(double)` tworzy item z losowym productId, 1 kg, cena w PLN;
  asercje porównują `getFinalPrice()` z itemem wzorcowym.

**`rules/discounting/OfferItemModifierFactoryTest.java`** (3 testy)
- `testVipDiscount` — wariant visitorowy fabryki: VIP → 15% → 100 zł staje się 85.
- `testConfig` — `SampleStaticConfig` + klient-fixture (VIP, 1 mln PLN wydatków, pierwszy order 2020):
  obie promocje pasują, każda `PercentageFromBase(10%)` → 100 → 80 (rabaty od bazy się SUMUJĄ, nie składają).
- `testReflectionDynamicConfig` — **kluczowy test round-trip**: `SampleStaticConfig.loadConfig()` →
  `ConfigImporter.importConfig()` (serializacja writer-em do `FakeDiscountRepository`) →
  `ReflectionDynamicConfig` (deserializacja reader-em) → fabryka → ten sam wynik 80.
  Dowodzi, że reguły (łącznie z drzewem predykatów AND i value objectami Money/Percentage)
  przeżywają zapis do "bazy" jako płaskie paramy.
- Infrastruktura testowa: `FakeDiscountRepository` (in-memory listy, insert nadaje UUID),
  anonimowy `ClientContextRepository` zwracający fixture, `ConfigImporter` — UWAGA, to klasa
  produkcyjno-podobna żyjąca w `src/test` (zapis konfiguracji do repo).

**Czego testy NIE pokrywają** (patrz §7): `EventRuleEngine`, `FuzzyAlgebra`, `ExplainableAlgebra`/`Labeled`,
`SampleDynamicConfig`, `TimeBeingCustomer` (jednostki czasu), `QuantityPredicate`.

---

## 5. Punkty adaptacji

**Generyczna mechanika (przenosisz bez zmian):**
- `Expression` + `ExpressionVisitor` + `Algebra<R>` + `AlgebraicVisitor<R>` — szkielet
  "jedno drzewo reguł, wiele interpretacji". Nowa interpretacja = nowa implementacja `Algebra<R>`, zero zmian w AST.
- `LogicalPredicate`/`And`/`Or`/`Not`/`RichLogicalPredicate` — kompozycja boolowska dowolnych predykatów `T`.
- `ChainOfferItemModifier` (kompozyt), `ConfigurableItemModifier` (triada predicate→applier→guardian),
  `EmptyModifier` (null object) — wzorzec "pipeline modyfikacji z audytem" działa dla każdej domeny,
  w której reguły MODYFIKUJĄ obiekt (cena, limit, priorytet...).
- `ReflectionBeanWriter/Reader` — generyczna persystencja drzew reguł (wymaga tylko `-parameters`,
  getterów i jednego konstruktora w liściach).
- Schemat `ConfigProvider` → `Factory` → `Chain` — reguły jako DANE wybierane per kontekst.

**Do konkretyzacji (treść domenowa):**
- `Metric` — enum metryk TWOJEJ domeny + sposób ich wyliczania (tu: dostarczane z góry w mapie;
  w realu: projekcja ze zdarzeń / zapytania).
- Węzły AST — `MetricCmp` porównuje tylko double; domena może potrzebować węzłów na stringi, daty, zbiory
  (wzorzec z lekcji: `EqualsConstraint`, `InConstraint`, `BetweenConstraint`).
- Algebry domenowe — progi/wagi/marginesy fuzzy (`Map<Metric, Double> margins`), semantyka `sum` (ucinać? ważyć?).
- Reguły liściowe — odpowiedniki `StatusRule`/`ExpensesRule`/`TimeBeingCustomer` na TWOIM kontekście
  (`ClientContext` → twój rekord faktów).
- Funktory — predykaty pozycji, appliery, strażnicy (odpowiednik `MarginGuardian` = twoje twarde invarianty).
- Porty danych — `ClientContextRepository`, `ClientFinder`, `InventoryFinder`, `DiscountRepository`:
  wymień na własne źródła (w testach wystarczą fake'i in-memory jak `FakeDiscountRepository`).
- Format persystencji — tu mapa paramów (EAV); lekcja pokazuje równoważny JSON (JSONB w Postgresie) —
  wybór formatu to detal, kontrakt to "drzewo reguł ⇄ dane".

---

## 6. Przepis generacji (z "mocnego podsumowania" do działającego kodu)

Wejście: reguły biznesowe w języku naturalnym + słownik pojęć (fakty o podmiocie, metryki, akcje).

1. **Rozdziel dwa pytania**: (a) *"czy reguła się stosuje?"* → predykaty/filtr, (b) *"co reguła robi?"*
   → scoring (liczy liczbę) albo modyfikacja (zmienia obiekt). To decyduje, który z dwóch światów modułu kopiujesz
   (często oba: filtr z predykatów + skutek z modyfikatorów, jak w `EventRule(filterExpr, scoreExpr)`).
2. **Słownik → typy**: fakty o podmiocie → rekord kontekstu (wzór: `ClientContext`/`WindowContext`);
   wielkości mierzalne → enum `Metric`; obiekt modyfikowany → odpowiednik `OfferItem` z `apply(Modification)` i audytem.
3. **Każde zdanie reguły → liść**: "klient jest VIP" → `StatusRule`, "wydał ponad X" → `ExpensesRule`,
   "obrót > 10k" → `MetricCmp(GT)`. Spójniki (i/lub/chyba że) → `And/Or/Not` albo węzły AST. NIE pisz ifów w serwisie.
4. **Twarde ograniczenia → strażnicy**: "ale nigdy poniżej marży/limitu" to NIE kolejny warunek wejściowy,
   tylko guardian walidujący WYNIK (wzór: `MarginGuardian` + semantyka "odrzuć modyfikację, zwróć oryginał").
5. **Testy najpierw, w tej kolejności**:
   a) test pojedynczej reguły na ręcznie zbudowanym kontekście (wzór: `ExpressionEvaluatorTest` —
      jedna reguła, znane metryki, oczekiwany wynik liczbowy),
   b) test kompozycji + strażnika (wzór: `ChainOfferModifierTest.testGuardian` — przypadek odrzucenia!),
   c) test fabryki/konfiguracji end-to-end z fake'ami portów (wzór: `OfferItemModifierFactoryTest.testConfig`),
   d) jeżeli reguły mają być konfigurowalne w runtime — **test round-trip serializacji**
      (wzór: `testReflectionDynamicConfig`: zapis → odczyt → identyczny wynik ewaluacji).
6. **Algebra zaczyna się od jednej**: crisp (`ScoreAlgebra`). Explainable i fuzzy dodawaj dopiero,
   gdy wymaganie brzmi "pokaż skąd wynik" / "warunki mają być miękkie" — AST się nie zmienia.
7. **Konfiguracja na końcu**: najpierw `SampleStaticConfig`-odpowiednik (reguły w kodzie za portem
   `ConfigProvider`), potem ewentualnie persystencja (JSON per lekcja albo refleksyjny EAV per moduł).
   Fabryka (`createDiscountModifier3`) jest od początku pisana przeciw portowi, więc wymiana jest darmowa.
8. **Checklist przy refleksyjnej persystencji**: `-parameters` w kompilatorze, gettery o nazwach
   parametrów konstruktora, JEDEN konstruktor publiczny w liściach, liście implementują `LogicalPredicate`.

---

## 7. Pułapki i braki

**Bugi w kodzie referencyjnym (nie kopiuj na ślepo):**
- `TimeBeingCustomer`: wariant `WEEKS` liczy `period.getDays() % 7 >= threshold` — bezsens
  (modulo zamiast dzielenia, i to na znormalizowanym `Period`); wariant `DAYS` używa `period.getDays()`,
  które po normalizacji Period NIE jest liczbą dni ogółem (dla stażu > 1 miesiąca wynik błędny);
  `MONTHS`/`YEARS` ignorują resztę pól. Testy tego nie łapią (fixture z 2020 → YEARS działa przypadkiem).
- `QuantityPredicate.test()` zwraca na sztywno `false` (TODO komparator z jednostkami).
- `ReflectionBeanWriter.writeLogicalNode`: gałąź `case null, default` — dla `null` rzuci NPE przy `predicate.getClass()`.
- `CmpOp.EQ` to dokładne porównanie double'i — w praktyce martwe dla wartości wyliczanych.

**Pułapki semantyczne:**
- `Modification.amount` to NOWA CENA, nie kwota rabatu — mylna nazwa; `OfferItem.apply` ustawia `finalPrice = modification.amount()`.
- `PercentageOfferItemModifier` (prosty) liczy zawsze od `basePrice` i NADPISUJE finalPrice — w łańcuchu
  skasuje wcześniejsze rabaty; do łańcuchów używaj `ConfigurableItemModifier` + świadomy wybór
  `PercentageFromBase` (suma rabatów, kolejność obojętna) vs `PercentageAccumulated` (składanie, kolejność istotna).
- `ConfigProvider.loadConfig()` zwraca `HashMap` ⇒ **kolejność aplikowania promocji w łańcuchu jest
  niedeterministyczna**. Z `PercentageFromBase` to nie boli; z `PercentageAccumulated`/`FixedPrice` dałoby
  różne ceny między uruchomieniami. W adaptacji: `LinkedHashMap`/lista + jawny priorytet.
- `ScoreAlgebra` miesza dwie semantyki w jednym typie: `and/or` zakładają 0/1, ale `constScore` daje dowolne inty —
  `and(Score(50), Score(1))` = min = 1. Działa, bo filtr i punktacja są ROZDZIELONE na poziomie `EventRule`;
  nie mieszaj węzłów logicznych z punktowymi w jednym wyrażeniu bez `IfThenElse`.
- `EventRuleEngine` jest zafiksowany na `Algebra<Score>` (nie jest generyczny w R) — `FuzzyAlgebra`
  (`Algebra<FuzzyValue>`) i `ExplainableAlgebra` NIE wepną się bez uogólnienia silnika
  (naturalna adaptacja: `EventRuleEngine<R>` + funkcja `isSatisfied(R)` i `combine(R,R)`).
- `EventWindowContext.currentEvent` nie jest konsumowany przez żadną algebrę/metrykę — scoring per zdarzenie
  to szkic: metryki i tak są per okno, więc pętla po zdarzeniach mnoży wynik przez liczbę zdarzeń. Dograj
  metryki zdarzeniowe (np. `Metric.EVENT_AMOUNT` czytane z `currentEvent`) zanim użyjesz silnika na serio.
- `ExplainableAlgebra.not()` zeruje wynik, ale przepuszcza kontrybucje dziecka — wyjaśnienia po `NOT` bywają mylące.
- `Expression` NIE jest sealed (w przeciwieństwie do `ApplicabilityConstraint` z lekcji) — brak kontroli
  wyczerpywalności; `ExpressionEvaluator` (simplified) rzuci `IllegalArgumentException` na `Labeled`,
  bo nie obsługuje tego węzła (visitor + `Algebra.label` obsługuje).
- `ChainOfferItemModifier` jest mutowalny (`add`), `OfferItem.finalPrice` ma pole nie-finalne mimo stylu immutable.

**Braki (do dorobienia w adaptacji):**
- Zero testów: `EventRuleEngine`, `FuzzyAlgebra`, `ExplainableAlgebra`/`Labeled`, `SampleDynamicConfig`,
  reguł czasowych; brak testu kolejności łańcucha i serializacji `SampleDynamicConfig` (modyfikatory z
  lambdą `appliesToEveryone` NIE przejdą przez refleksyjny writer — lambda nie ma getterów/konstruktora!).
- Brak parsera/serializera JSON z lekcji (w module jest tylko wariant property-map); brak walidacji drzewa
  (cykle, głębokość), brak wersjonowania reguł i okresów obowiązywania (patrz archetyp Pricing: Validity).
- `ConfigImporter` (zapis konfiguracji) żyje w `src/test` — w realnym systemie to komponent produkcyjny.
- Moduł `rules` nie zawiera `ApplicabilityConstraint` — jeśli potrzebujesz warunków stosowalności
  w stylu lekcji (sealed interface + rekordy + fluent factories + JSON), wzorzec bierzesz z modułu `product`.

# Accounting — referencyjna implementacja in-memory (repo archetypów)

Referencja dla generowania kodu archetypu **Accounting** (księga: konta, wpisy, transakcje,
storno, ważność wpisów, alokacje FIFO/LIFO, posting rules) + typy ilościowe **Money/Quantity**.
Java 21 (records, sealed interfaces, pattern matching w `switch`), czysty model domenowy,
in-memory repozytoria, zero Springa w testach (Spring Boot jest tylko parentem POM-a accounting).

---

## 1. Wskazanie na repo

Repo: `<archetypes>` (multi-moduł Maven, root
`com.softwarearchetypes:archetypes:0.0.1`, `java.version=21`).

Moduły istotne dla Accounting:

| Moduł | Ścieżka | Koordynaty | Zależy od |
|---|---|---|---|
| accounting | `accounting/` | `com.softwarearchetypes:accounting:0.0.1-SNAPSHOT` | common, quantity (parent: `spring-boot-starter-parent:3.5.5`) |
| quantity | `quantity/` | `com.softwarearchetypes:quantity:0.0.1-SNAPSHOT` | common, `org.javamoney:moneta:1.4.5` (JavaMoney) |
| common | `common/` | `com.softwarearchetypes:common:0.0.1-SNAPSHOT` | — (JUnit 5.10.2, AssertJ 3.25.3, Mockito w testach) |

Pakiety główne:
- `com.softwarearchetypes.accounting` + podpakiety `accounting.events`, `accounting.postingrules`
- `com.softwarearchetypes.quantity` + `quantity.money`
- `com.softwarearchetypes.common` + `common.events`

Komendy testów (z katalogu root repo):
```bash
cd <archetypes>
./mvnw -pl accounting,quantity,common test       # trzy moduły
./mvnw -pl accounting test                       # samo accounting
./mvnw -pl accounting test -Dtest='*Scenarios'   # WYMUSZENIE klas *Scenarios (patrz pkt 7!)
```

Dodatkowo w `accounting/`:
- `SKILL.md` — pełny skill "accounting-archetype-mapper" (fit-test, workflow mapowania wymagań
  na model księgowy; ten sam skill jest zarejestrowany globalnie),
- `diagrams/*.puml` — diagramy PlantUML (accounting-model, accounting-core-concepts,
  account-coupling-problem/solution/comparison).

---

## 2. Mapa kodu

### 2.1 Rdzeń — `accounting/src/main/java/com/softwarearchetypes/accounting/`

**Agregaty / encje:**
- `Account.java` — konto (package-private!); trzyma `AccountId`, `AccountType`, `AccountName`,
  materializowany `Money balance`, `Version` (pod optimistic locking), `Entries newEntries`
  (tylko NOWE wpisy — celowo nie ładuje całej historii) i `pendingEvents`
  (`CreditEntryRegistered`/`DebitEntryRegistered` tworzone w `addEntry/addEntries` przez
  pattern-matching po typie wpisu).
- `Entry.java` — `sealed interface Entry permits AccountDebited, AccountCredited`; wpis ma
  `EntryId`, `TransactionId`, `AccountId`, `Money amount`, bitemporalność (`occurredAt` =
  kiedy zarejestrowano, `appliesAt` = kiedy obowiązuje), `MetaData`, `Validity`,
  `Optional<EntryId> appliedTo` (link alokacji/storna do innego wpisu). `AccountDebited.amount()`
  jest **nadpisane i zwraca negate()** — debet przechowuje kwotę dodatnią, a "waży" ujemnie.
- `Transaction.java` — transakcja: `TransactionId id`, `refId` (dla storna), `TransactionType`,
  `occurredAt/appliesAt`, mapa `Account -> List<Entry>`; konstruktor package-private waliduje
  `TransactionEntriesConstraint`; `execute()` (nie-publiczne) robi `entries.forEach(Account::addEntries)`.
- `TransactionEntriesConstraint` (w pliku Transaction.java) — interfejs-predykat z trzema
  stałymi: `BALANCING_CONSTRAINT` (suma wpisów kont z `isDoubleEntryBookingEnabled()` musi = 0;
  konta OFF_BALANCE są wyłączone z bilansowania), `MIN_2_ENTRIES_CONSTRAINT`,
  `MIN_2_ACCOUNTS_INVOLVED_CONSTRAINT`.

**Typy wartości / identyfikatory:**
- `AccountId`, `EntryId`, `TransactionId`, `PostingRuleId` — rekordy wrapujące `UUID`
  z `generate()`/`of(...)`.
- `AccountType.java` — enum `ASSET, OFF_BALANCE, EXPENSE, LIABILITY, REVENUE` z flagą
  `doubleEntryBookingEnabled` (false tylko dla OFF_BALANCE); TODO w kodzie: EQUITY.
- `AccountName.java` — rekord z walidacją niepustości + `compositeFrom("a","b")` → "a:b".
- `TransactionType.java` — rekord na String ze stałymi `INITIALIZATION`, `REVERSAL`, `TRANSFER`,
  `REALLOCATION`, `EXPIRATION_COMPENSATION`; dowolne typy domenowe przez `withTypeOf("sale")`.
- `Validity.java` — rekord `[validFrom, validTo)` (from inkluzywny, to ekskluzywny);
  fabryki `always()/until()/from()/between()` (between toleruje nulle); `isValidAt(Instant)`,
  `hasExpired(Instant)`.
- `MetaData.java` — rekord `Map<String,String>`; `of("k","v","k2","v2")`.
- `Entries.java` — mutowalna lista wpisów konta (tylko nowe), `balanceAsOf(Instant)` po `appliesAt`.
- `AccountAmounts.java` — `Map<AccountId, Money>` z add/subtract/sum (do sald początkowych).
- `Balances.java` — rekord-wynik zapytania o salda wielu kont.

**Budowanie transakcji (serce API):**
- `TransactionBuilderFactory.java` — fabryka builderów z wstrzykniętymi repo + `Clock`.
- `TransactionBuilder.java` — fluent builder; etap 1: `id/occurredAt/appliesAt/withTypeOf/
  withMetadata/withTransactionEntriesConstraint`; etap 2 — trzy tryby:
  - `.executing()` → wewn. klasa `TransactionEntriesBuilder` z `creditTo(...)`/`debitFrom(...)`
    (przeciążenia: sama kwota; +`Validity`; +`EntryId appliedTo`; +`EntryAllocationFilter`;
    mapa `Map<AccountId,Money>`), `transfer(from,to,amount)`, `entriesFor(AccountAmounts)`;
    `build()` dociąga konta z repo (błąd gdy któreś nie istnieje), waliduje constraint.
  - `.reverting(Transaction|TransactionId)` → `ReverseTransactionEntriesBuilder` — **storno**:
    dla każdego wpisu ref-transakcji tworzy wpis przeciwny (credit→debit, debit→credit)
    z `appliedTo = id oryginalnego wpisu`; transakcja dostaje typ `REVERSAL` i `refId`.
  - `.compensatingExpired(EntryId|Entry)` → `ExpirationCompensationTransactionEntriesBuilder` —
    kompensata wygasłego wpisu: wymaga `validity().hasExpired(clock.instant())`, liczy
    `remainingAmount = refEntry.amount() + suma wpisów referencjujących (appliedTo)`;
    `build()` zwraca `Optional<Transaction>` (empty gdy w pełni zużyty); opcjonalny
    `withCompensationAccount(AccountId)` dla podwójnego zapisu; typ `EXPIRATION_COMPENSATION`.

**Alokacje:**
- `EntryAllocations.java` — `findAllocationFor(EntryAllocationFilter)` deleguje do
  `EntryRepository.findMatching(predicate, comparator)`.
- Tamże: enum `EntryAllocationStrategy {FIFO, LIFO, MANUAL}`, rekord `EntryAllocationFilter
  (Predicate<Entry>, Comparator<Entry>)` i `EntryAllocationFilterBuilder` — fabryki
  `fifo(accountId)` (sort po `appliesAt` rosnąco), `lifo(accountId)` (malejąco),
  `manual(entryId)`; filtry `withTypeOf(AccountCredited.class)`, `withValidityContaining(Instant)`.
  Builder przy alokacji waliduje, że znaleziony wpis `isValidAt(appliesAt)` transakcji.

**Fasada, konfiguracja, komendy, widoki:**
- `AccountingFacade.java` (public, 447 linii) — jedyny punkt wejścia: `createAccount(s)`,
  `createAccountsWithInitialBalances`, `balance/balanceAsOf/balances/balancesAsOf`,
  `transaction()` (builder), `execute(Transaction...)`, `transfer(from,to,amount,occurredAt,
  appliesAt[,MetaData])`, `handle(ExecuteTransactionCommand)`, `handle(ReverseTransactionCommand)`,
  `createProjectingAccount`, `findAccount(s)/findAll/findTransactionBy/findTransactionIdsFor`.
  Wzorzec wykonania: `transaction.execute()` → `transactionRepository.save` →
  `saveAccountsAndPublishEvents(accountsInvolved)` (zbiera pendingEvents z kont, zapisuje konta,
  publikuje eventy). Błędy zwracane jako `Result.failure(msg)`, nie wyjątki.
- `AccountingConfiguration.java` — kompozycja: `inMemory(Clock)` skleja
  `InMemoryEntryRepository` → `EntryAllocations` → `InMemoryAccountRepo` →
  `InMemoryTransactionRepo` → `TransactionBuilderFactory` → `InMemoryEventsPublisher` →
  `AccountViewQueries` → `AccountingFacade`. To wzorzec "ręczny DI bez frameworka".
- `CreateAccount.java` — rekord-komenda z fabrykami `generateAssetAccount`,
  `generateOffBalanceAccount`, `generate(name, type)`.
- `ExecuteTransactionCommand.java` — rekord-komenda DTO (UUID-y, nie typy domenowe):
  lista `Entry(entryType CREDIT|DEBIT, accountId, amount, validFrom, validTo, appliedToEntryId)`.
- `ReverseTransactionCommand.java` — `(refTransactionId, occurredAt, appliesAt)`.
- Widoki (read model): `AccountView` (id, name, type, balance, entries + `balanceAsOf`),
  `EntryView` (z enumem `EntryType CREDIT/DEBIT`), `TransactionView`,
  `TransactionAccountEntriesView`, `AccountMetadataView`.
- `AccountViewQueries` (w pliku AccountingFacade.java) — odczyty: zwykłe konto → wpisy
  z `EntryRepository`; konto projekcyjne → wpisy po filtrze + saldo liczone na locie.

**Konta projekcyjne (wirtualne):**
- `ProjectionAccount.java` — konto bez własnych wpisów; `Filter(Predicate<Entry>,
  Predicate<Account>)` (komentarz: w DB to byłby SQL). Tworzone przez
  `facade.createProjectingAccount(id, AccountEntryFilter|Filter, nazwa)`.
- `AccountEntryFilter.java` — publiczny builder filtrów: `filtering().onDateOlderThan/
  onDateYoungerThan/onAccountsIn/onAccountEquals/havingMetadata(k,v)/onAmount/
  onAccountDescriptionContaining`; pakietowa klasa `EntryFilter` ze statycznymi predykatami
  (`ENTRY_OF_ACCOUNT`, `ENTRY_HAVING_METADATA`, `HAVING_VALUES`, ...).

**Repozytoria in-memory (interfejs + impl w tym samym pliku):**
- `EntryRepository.java` — `find`, `save`, `findAllFor(AccountId)`, `findMatching(pred, comp)`,
  `findAllMatching(pred)`, `findEntriesReferencing(entry)` (po `appliedTo`); impl
  `InMemoryEntryRepository` na `HashMap`.
- `AccountRepository` + `InMemoryAccountRepo` (w AccountingFacade.java) — zapis konta
  przepisuje jego `entries()` do `EntryRepository`; osobna mapa kont projekcyjnych.
- `TransactionRepository.java` + `InMemoryTransactionRepo` — `find`, `save`.

**Eventy — `accounting/events/`:**
- `AccountingEvent` — `sealed interface ... permits CreditEntryRegistered, DebitEntryRegistered`,
  rozszerza `common.events.PublishedEvent`.
- `CreditEntryRegistered` / `DebitEntryRegistered` — rekordy (id, occurredAt, appliesAt,
  entryId, accountId, transactionId, amount).

### 2.2 Posting rules — `accounting/postingrules/`

Automatyczne księgowania pochodne (Fowlerowskie Posting Rules), reagujące na eventy wpisów:
- `PostingRule.java` — interfejs: `id()`, `name()`, `isEligible(PostingContext)`,
  `execute(PostingContext) -> List<Transaction>`, `priority()` (default 100, mniejsze = pierwsze).
- `ConfigurablePostingRule.java` — implementacja składana z trzech strategii:
  `EligibilityCondition` + `AccountFinder` + `PostingCalculator`.
- `EligibilityCondition.java` — `@FunctionalInterface` z fabrykami `accountEquals(AccountId)`,
  `entryTypeEquals(EntryView.EntryType)`, `accountType(String)`, `custom(Predicate)` i
  kombinatorami `and/or/negate`.
- `AccountFinder.java` — znajduje konta docelowe; `fixed(tag, accountId)` /
  `fixed(Map<String,AccountId>)` → `TargetAccounts` (mapa tag→`AccountView`, `getRequired(tag)`).
- `PostingCalculator.java` — `calculate(TargetAccounts, PostingContext) -> List<Transaction>`
  (komentarz w kodzie: gdyby rules żyły poza modułem accounting, powinny zwracać
  `ExecuteTransactionCommand` zamiast `Transaction`).
- `PostingContext.java` — `triggeringEntries (List<EntryView>)`, `accountingFacade`,
  `executionTime`, `BusinessContext` (słaba mapa `Map<String,Object>` na dane domenowe).
- `PostingRuleBuilder.java` — DSL: `createRule("nazwa").when(cond).transferTo("tag", accId)
  .calculateUsing(calc).priority(10).build()`.
- `PostingRuleExecutor.java` — sortuje eligible rules po priority i wykonuje każdą
  wyprodukowaną transakcję przez przekazany `transactionExecutor` (fail-fast na pierwszym błędzie,
  akumulacja w `Result.CompositeSetResult`).
- `PostingRulesFacade.java` — CRUD reguł + `executeRulesFor(List<EntryView>)`.
- `PostingRulesEventHandler.java` — `EventHandler` nasłuchujący `Credit/DebitEntryRegistered`,
  mapuje event → `EntryView` → `postingRulesFacade.executeRulesFor(...)`. **To domyka pętlę:**
  `facade.transfer(...)` → event → handler → reguła → kolejna transakcja (kaskadowo).
- `PostingRulesConfiguration.java` — `inMemory(accountingFacade, eventPublisher, clock)`;
  rejestruje handler w publisherze.
- `InMemoryPostingRuleRepository.java`, `PostingRuleRepository.java`, `PostingRuleId.java`.

### 2.3 quantity — `quantity/src/main/java/com/softwarearchetypes/quantity/`

- `money/Money.java` — klasa (nie rekord) wrapująca `org.javamoney.moneta.Money`; fabryki
  `of(amount, "XXX")`, `pln/eur/usd/gbp(int|BigDecimal|Number|String)`, `zeroPln()`,
  `zero(currencyCode)`; arytmetyka `add/subtract/negate/abs/multiply/divide/divideAndRemainder/
  multiply(Percentage)`; porównania `isZero/isNegative/isGreaterThan(OrEqualTo)/compareTo/min/max`;
  `value()` (BigDecimal znormalizowany), `currency()`. **Add różnych walut rzuca wyjątek z monety.**
- `money/Percentage.java` — rekord BigDecimal (skala 5), `of(2)`, `ofFraction(0.02)`,
  `add/subtract/multiply`; **nie może być ujemny**.
- `Quantity.java` — rekord `(BigDecimal amount, Unit unit)` dla ilości niefinansowych
  (kg, litry, sztuki, godziny); `add/subtract` tylko w tej samej jednostce (inaczej
  IllegalArgumentException); **amount nie może być ujemny**. UWAGA: `compareTo` zwraca 0 (bug).
- `Unit.java` — rekord `(symbol, name)` z fabrykami `pieces/kilograms/liters/meters/
  squareMeters/cubicMeters/hours/minutes` + `of(symbol, name)`.

### 2.4 common — `common/src/main/java/com/softwarearchetypes/common/`

- `Result.java` — `sealed interface Result<F,S> permits Success, Failure`; `success(v)/failure(f)`,
  `map/mapFailure/biMap/flatMap/fold/peek/ifSuccessOrElse/combine`; akumulatory
  `Result.composite()` / `Result.compositeSet()` (fail-fast). Konwencja całego repo:
  operacje fasad zwracają `Result<String, ID>`.
- `Version.java` — rekord long pod optimistic locking (`initial()` = 0).
- `Preconditions.java` — `checkArgument/checkNotNull` → IllegalArgumentException.
- `Pair.java`, `StringUtils.java` (`isNotBlank`), `CollectionTransformations.java`
  (`keyValueMapFrom(String[])`, `subtract(Set,Set)`).
- `events/` — `PublishedEvent` (id, type, occurredAt), `EventHandler` (supports/handle),
  `EventPublisher` (publish, register), `InMemoryEventsPublisher` (synchroniczny observer,
  Set handlerów).

---

## 3. API wejściowe (jak klient używa modułu)

Bootstrap (zawsze fixed Clock w testach):
```java
Instant NOW = LocalDateTime.of(2022, 2, 2, 12, 50).atZone(ZoneId.systemDefault()).toInstant();
AccountingConfiguration config = AccountingConfiguration.inMemory(Clock.fixed(NOW, ZoneId.systemDefault()));
AccountingFacade facade = config.facade();
// opcjonalnie posting rules:
PostingRulesConfiguration pr = PostingRulesConfiguration.inMemory(config.facade(), config.eventPublisher(), clock);
```

Konta:
```java
AccountId id = AccountId.generate();
facade.createAccount(CreateAccount.generateAssetAccount(id, "Cash"));        // Result<String, AccountId>
facade.createAccount(new CreateAccount(id, "VAT Payable", "LIABILITY"));
facade.createAccountsWithInitialBalances(Set.of(...), AccountAmounts.of(Map.of(id, pln(100))));
```

Transfer prosty (skrót) i transakcja wielonożna:
```java
facade.transfer(from, to, pln(500), occurredAt, appliesAt);                  // Result<String, TransactionId>

Transaction repayment = facade.transaction()
        .occurredAt(TUESDAY_10_00).appliesAt(TUESDAY_10_00)
        .withTypeOf("loan_repayment")
        .executing()
        .creditTo(cash, pln(1060))
        .debitFrom(principalReceivable, pln(1000))
        .debitFrom(interestReceivable, pln(50))
        .debitFrom(feeReceivable, pln(10))
        .build();                     // walidacja: suma = 0 dla kont double-entry
facade.execute(repayment);            // Result<String, TransactionId>; wariant vararg zwraca Set
```

Odczyt sald (zawsze przez read model, nie przez Account):
```java
facade.balance(accountId);                    // Optional<Money> — saldo bieżące
facade.balanceAsOf(accountId, MONDAY_10_00);  // saldo historyczne po appliesAt (bitemporalność)
facade.balances(Set.of(a, b));                // Balances
facade.findAccount(accountId);                // Optional<AccountView> (name, type, balance, entries)
facade.findTransactionBy(txId);               // Optional<TransactionView>
facade.findTransactionIdsFor(accountId);
```

Storno (reversal):
```java
Transaction reversal = facade.transaction()
        .occurredAt(now).appliesAt(now)
        .reverting(originalTx.id())   // albo reverting(originalTx)
        .build();                     // typ REVERSAL, refId=oryginał, wpisy odwrócone z appliedTo
facade.execute(reversal);
// lub przez komendę:
facade.handle(new ReverseTransactionCommand(originalTx.id().value(), now, now));
```

Validity + alokacje + kompensata wygaśnięcia (wzorzec "bonus telco"):
```java
// grant z ważnością:
.executing().creditTo(bonusAccount, pln(50), Validity.until(WEDNESDAY_10_00)).build();
// zużycie wskazanego wpisu (MANUAL):
.executing().debitFrom(bonusAccount, pln(40), bonusEntryId).build();
// zużycie FIFO (najstarszy wpis po appliesAt):
.executing().debitFrom(bonusAccount, pln(20), EntryAllocationFilterBuilder.fifo(bonusAccount).build()).build();
// kompensata niewykorzystanej resztki po wygaśnięciu:
Optional<Transaction> comp = facade.transaction()
        .occurredAt(THURSDAY_10_00).appliesAt(THURSDAY_10_00)
        .compensatingExpired(bonusEntryId)
        .withCompensationAccount(expiredBonuses)
        .build();                     // empty, gdy wpis w pełni zużyty
```

Komenda DTO (dla warstwy aplikacyjnej/REST):
```java
facade.handle(new ExecuteTransactionCommand(occurredAt, appliesAt, "sale", Map.of("order","123"),
        List.of(ExecuteTransactionCommand.Entry.credit(cashUuid, pln(123)),
                ExecuteTransactionCommand.Entry.debit(revenueUuid, pln(123)))));
```

Posting rule (automatyczna prowizja 2%):
```java
PostingRule rule = PostingRuleBuilder.createRule("Commission tracking")
        .when(accountEquals(receivables).and(entryTypeEquals(CREDIT)))
        .calculateUsing(new CommissionCalculator(Percentage.of(2)))   // własny PostingCalculator
        .transferTo("commission", commissionAccount)
        .build();
postingRulesFacade.saveRule(rule);
facade.transfer(payments, receivables, pln(1000), t, t);  // → event → rule → +20 PLN na commission
```

Konto projekcyjne (wirtualny widok po filtrze wpisów):
```java
facade.createProjectingAccount(projectingId,
        Filter.just(ENTRY_OF_ACCOUNT(projected).and(ENTRY_HAVING_METADATA(HAVING_VALUES("initiator","ewa")))),
        "ewa-opis");
// publiczna wersja: AccountEntryFilter.filtering().onAccountEquals(...).havingMetadata("k","v")
```

---

## 4. Testy jako specyfikacja

Wszystkie testy: czysty JUnit 5 + AssertJ, bez Springa, fasada + `AccountingConfiguration.inMemory(fixed(NOW, ...))`,
komentarze `//given //and //when //then`, nazwy metod snake_case (`can_...`, `cannot_...`,
`should_...`). Stałe czasowe nazywane dniami: `MONDAY_10_00`, `TUESDAY_10_00`, `NOW`.

`accounting/src/test/java/com/softwarearchetypes/accounting/`:

| Plik | Co specyfikuje |
|---|---|
| `TransactionScenarios.java` (1130 linii, 34 testy) | GŁÓWNA spec: tworzenie/wykonanie transakcji, storno po obiekcie i po id, walidacje constraintów (balansowanie, ≥2 wpisy, ≥2 konta, brak occurredAt/appliesAt/typu), transakcje wielonożne, off-balance bez balansowania, Validity na wpisach, `appliedTo` (manual/FIFO/LIFO), odrzucenie alokacji do nieistniejącego/nieważnego wpisu, linkage przy stornie, dziedziczenie metadanych z transakcji, kompensata wygasłych wpisów (pełna/częściowa/zerowa/niewygasły/bez konta kompensacyjnego na koncie double-entry → błąd balansowania) |
| `AccountingCreditDebitScenarios.java` (7) | zerowe saldo świeżego konta, saldo po wpisach, `findTransactionBy`/`findTransactionIdsFor`, podróż w czasie `balanceAsOf`, `balancesAsOf` dla wielu kont |
| `AccountsCreatingScenarios.java` (13) | tworzenie kont każdego typu (ASSET/LIABILITY/REVENUE/EXPENSE/OFF_BALANCE), duplikat id → failure, batch create, salda początkowe (`createAccountsWithInitialBalances` — transakcja INITIALIZATION), findAll, zachowanie nazwy |
| `AccountsFindScenarios.java` (7) | find/findAll/find(Set), empty dla nieistniejących |
| `AccountsProjectionScenarios.java` (2) | konto projekcyjne: saldo i wpisy po filtrze metadanych; projekcje nie mają typu |
| `BankingScenarios.java` (2) | rata kredytu rozbita na kapitał/odsetki/opłaty; tracking per-klient na kontach OFF_BALANCE |
| `EcommerceScenarios.java` (2) | refund z VAT (pełny i częściowy) — konta REVENUE/LIABILITY |
| `TelcoBonusScenarios.java` (3) | bonus z ważnością: wygaśnięcie + kompensata, częściowe zużycie (kompensuje tylko resztę), wiele bonusów FIFO |
| `FleetCardScenarios.java` (3) | limity karty paliwowej z Validity + kompensata wygasłych limitów |
| `BiTemporalScenarios.java` (2) | occurredAt vs appliesAt: wpis antydatowany zmienia saldo historyczne; przyszły nie wpływa do czasu appliesAt |
| `EntryAllocationsTest.java` (6) | strategie FIFO/LIFO/MANUAL, filtr po typie wpisu i po validity, empty gdy brak dopasowania |
| `ValidityTest.java` (20) | pełna semantyka `[from, to)`: krawędzie, EPOCH/Instant.MAX, hasExpired dokładnie w validTo |
| `postingrules/PostingRulesScenarios.java` (6) | reguła odpala się po utworzeniu wpisu (event-driven), kolejność po priority (podatek przed bonusem warunkowym saldem), CRUD reguł, nieeligible nie odpala; wzorcowe implementacje `PostingCalculator` (Commission/Percentage/FixedAmount) i `EligibilityCondition` (MinimumBalance) jako klasy statyczne w teście |

Infrastruktura testowa (konwencje do powielania):
- `AccountFixture.java` — `accountingFixtureFor(facade).createAssetAccount("nazwa")` (helper tworzący konto i zwracający id); w wielu klasach zamiast fixture są prywatne metody `createAssetAccount/createOffBalanceAccount/createAccount(name,type)`.
- `RandomFixture.java` — `randomStringWithPrefixOf("acc")`, `randomElementOf` (commons-lang3).
- `TransactionAssert.java`, `TransactionViewAssert.java` — custom AssertJ asserts:
  `assertThat(tx).occurredAt(t).hasTypeEqualTo(REVERSAL).hasReferenceTo(id)
  .hasExactlyOneCreditEntryFor(account, pln(100), validity)`.

`quantity/src/test/...`: `MoneyTest` (49), `QuantityTest` (28), `UnitTest` (22),
`PercentageTest` (16) — klasyczne unit testy wartości (arytmetyka, walidacje, równość).
`common/src/test/...`: `ResultTest` (57), `PairTest` (9), `VersionTest` (11), `PreconditionsTest` (6).

---

## 5. Punkty adaptacji (co generyczne, co konkretyzować)

**Generyczne — kopiuj bez zmian:**
- Cała mechanika: `Transaction`/`TransactionBuilder` (executing/reverting/compensatingExpired),
  `Entry` sealed + `appliedTo`, `Validity`, `EntryAllocations` + FIFO/LIFO/MANUAL,
  `TransactionEntriesConstraint`, repozytoria in-memory, `AccountViewQueries`, eventy wpisów,
  cały `postingrules`, cały `common` (Result, Version, events) i `quantity`.

**Do konkretyzacji pod domenę:**
1. **Typy kont** — `AccountType` to punkt rozszerzenia: dodaj domenowe typy (np. EQUITY,
   albo w domenie niebankowej: `EARNED`, `GRANTED`, `RESERVED`) z poprawną flagą
   `doubleEntryBookingEnabled`; konta "statystyczne"/informacyjne → wzorzec OFF_BALANCE (false).
   Mapowanie zasobów domeny na plan kont rób nazwami: `AccountName.compositeFrom("customer", id, "bonus")`.
2. **Waluta/jednostka** — model jest **twardo oparty o Money z defaultem PLN**
   (`Money.zeroPln()` w `Account`, `Entries`, `BALANCING_CONSTRAINT`, `AccountView.balanceAsOf`).
   Dla innej waluty: dodać fabryki w `Money` lub podmienić `zeroPln()` na `zero(currency)`
   w wymienionych 4-5 miejscach. Dla zasobów niefinansowych (GB, minuty, sztuki): albo
   potraktuj jednostkę jako pseudo-walutę w Money, albo uogólnij typ kwoty wpisu do
   `Quantity` (większa przeróbka: Entry/Account/constraints sumują przez `Money::add`) —
   `Quantity` w repo NIE jest używane przez accounting, jest gotowym typem na tę adaptację
   (uwaga: nie wspiera wartości ujemnych → debet trzymać jako typ wpisu, nie znak).
3. **Typy transakcji** — dopisuj stałe domenowe do `TransactionType` albo używaj
   `withTypeOf("sale")` ze stringiem (otwarty słownik).
4. **Reguły walidacji** — własne `TransactionEntriesConstraint` (np. "saldo konta nie może
   zejść poniżej zera", "limit dzienny") i podpięcie przez
   `withTransactionEntriesConstraint(...)`; domyślny to tylko BALANCING_CONSTRAINT.
   Uwaga: w obecnym kodzie builder przyjmuje JEDEN constraint (brak kompozycji `and`).
5. **Posting rules domenowe** — implementuj `PostingCalculator` (np. prowizja %, podatek,
   cashback) i `EligibilityCondition` (np. próg salda, typ konta) na wzór klas statycznych
   z `PostingRulesScenarios`; składaj przez `PostingRuleBuilder`; priorytety gdy kolejność
   reguł ma znaczenie.
6. **Konta projekcyjne** — raporty per-klient/per-kampania bez podwójnych zapisów:
   `AccountEntryFilter.filtering().havingMetadata("campaign","X")` zamiast mnożenia kont.
7. **MetaData** — kanał na wymiary domenowe (initiator, orderId, campaign); filtry projekcji
   i `AccountEntryFilter` działają po nich.
8. **Komendy** — `ExecuteTransactionCommand`/`ReverseTransactionCommand` to wzorzec granicy
   modułu (surowe UUID/stringi); dla własnej domeny generuj analogiczne komendy fasadowe.

---

## 6. Przepis generacji z "mocnego podsumowania"

Wejście: tabela mapowania z analizy archetypowej (zasoby→konta, operacje→transakcje,
polityki ważności/alokacji, reguły pochodne).

1. **Moduł**: nowy moduł Maven na wzór `accounting/pom.xml` (zależności: common, quantity)
   albo pakiet w istniejącym projekcie; skopiuj trzy pakiety źródłowe
   (`accounting`, `accounting.events`, `accounting.postingrules`) i przemianuj pakiet bazowy.
2. **Zasoby → plan kont**: każdy zasób z podsumowania = typ konta lub konwencja `AccountName`;
   zdecyduj per konto: bilansowe (ASSET/LIABILITY/REVENUE/EXPENSE, uczestniczy w sumie=0)
   czy OFF_BALANCE (tracking, jednostronne wpisy dozwolone). Jedno "konto przeciwstawne"
   (cash/offset/system) prawie zawsze jest potrzebne, żeby domenowe operacje się bilansowały.
3. **Operacje → transakcje**: każda operacja biznesowa = metoda fasady domenowej, która
   w środku buduje transakcję builderem (`withTypeOf("<operacja>")` + zestaw
   creditTo/debitFrom). Operacje odwracalne → nic nie rób, storno masz za darmo
   (`reverting(txId)`). Wygasanie → `Validity` na wpisach + proces kompensaty
   (`compensatingExpired`); zużywanie z puli → alokacje FIFO/LIFO/MANUAL przez `appliedTo`.
4. **Polityki pochodne → posting rules**: "gdy X, dolicz Y" = `ConfigurablePostingRule`
   (condition + finder + calculator) zarejestrowana w `PostingRulesFacade`.
5. **Niezmienniki → constraints**: niezmienniki transakcyjne jako
   `TransactionEntriesConstraint`; niezmienniki tworzenia obiektów jako `checkArgument`
   w konstruktorach (wzorzec z `Account`/`Transaction`).
6. **Testy najpierw** (kolejność odwzorowuje zależności modelu):
   a) test typu wartości, jeśli zmieniasz jednostkę (wzór: `MoneyTest`/`QuantityTest`);
   b) sceny tworzenia kont (wzór: `AccountsCreatingScenarios`) — od razu wymusza
      `CreateAccount` i fasadę;
   c) scena "pierwsza transakcja + saldo" (wzór: `AccountingCreditDebitScenarios
      .should_return_single_entry_balance` i `BankingScenarios`) — wymusza builder i execute;
   d) walidacje/constrainty (wzór: `cannot_*` z `TransactionScenarios`);
   e) storno (`can_execute_reverse_transaction*`);
   f) dopiero potem validity/alokacje/kompensaty (wzór: `TelcoBonusScenarios` — najlepszy
      szablon pod domeny z wygasającymi pulami) i bitemporalność (`BiTemporalScenarios`);
   g) na końcu posting rules (`PostingRulesScenarios`).
   Każdy test: fixed `Clock`, stałe `MONDAY_10_00...`, `//given //when //then`, snake_case,
   asercje `assertThat(facade.balance(acc)).hasValue(pln(X))` + custom asserty na transakcje.
7. **Smoke-check kompletności**: domenowy odpowiednik każdej grupy scenariuszy z pkt 4
   (creating, credit/debit, reversal, validity/expiry jeśli dotyczy, posting rules jeśli dotyczy).

---

## 7. Pułapki i braki

1. **Surefire NIE uruchamia klas `*Scenarios`!** Domyślne include'y surefire to `*Test`,
   `Test*`, `*Tests`, `*TestCase`. `./mvnw -pl accounting test` wykonuje tylko `ValidityTest`
   i `EntryAllocationsTest` (26 testów); 81 testów scenariuszowych odpala się tylko z IDE lub
   przez `-Dtest`. Wymuszone `./mvnw -pl accounting surefire:test -Dtest='*Scenarios,*Test'`
   przechodzi w całości: 107/107 (zweryfikowane 2026-10). Generując własny moduł: nazywaj
   klasy `...Test`/`...Tests` albo skonfiguruj `<includes>` w surefire.
2. **PLN zaszyte w rdzeniu** — `Money.zeroPln()` jako element neutralny w `Account.balance`,
   `Entries.balanceAsOf`, `BALANCING_CONSTRAINT`, `AccountView.balanceAsOf`, `AccountAmounts`.
   Transakcja w EUR przejdzie add z zerem PLN? Nie — moneta rzuci MonetaryException przy
   mieszaniu walut; dla nie-PLN trzeba podmienić element neutralny.
3. **Bug: `createAccounts` zwraca pusty set** — `AccountingFacade.createAccounts` buduje
   `createdAccounts = new HashSet<>()` i nigdy nic nie dodaje; sukces niesie pusty zbiór id
   (testy sprawdzają tylko `success()` i salda, więc to nie wychodzi).
4. **Bug: `Quantity.compareTo` zwraca zawsze 0** — nie sortuj/porównuj Quantity bez poprawki.
5. **`InMemoryAccountRepo.getProjection` niekompletne** — buduje `filteredEntries` i je
   wyrzuca, zwraca `Account` z `type=null, name=null` (TODO w kodzie: "przerobić na
   accountView"). Odczyt projekcji działa poprawnie TYLKO przez `AccountViewQueries`/fasadę —
   nie przez `AccountRepository.find`.
6. **Brak kontroli salda ujemnego** — żaden constraint nie blokuje zejścia poniżej zera
   (patrz salda `pln(-9540)` w BankingScenarios). Jeśli domena tego wymaga — własny
   `TransactionEntriesConstraint` lub walidacja w fasadzie; pamiętaj, że builder trzyma
   tylko jeden constraint (ostatni `withTransactionEntriesConstraint` wygrywa).
7. **Alokacja nie pilnuje kwoty** — FIFO/MANUAL linkuje `appliedTo` do wpisu, ale nic nie
   sprawdza, czy łączne zużycie nie przekroczyło kwoty wpisu źródłowego; `remainingAmount`
   liczy dopiero kompensata. Nadmierne zużycie jednego wpisu przejdzie bez błędu.
8. **FIFO/LIFO wybiera JEDEN wpis** (`findFirst`) — debet 20 przy dwóch wpisach po 15 nie
   rozbije się na dwa `appliedTo`; częściowa alokacja wielowpisowa wymaga dopisania pętli.
9. **Eventy synchroniczne i kaskadowe** — `InMemoryEventsPublisher` woła handlery w tym samym
   wątku; posting rule generująca wpisy wywoła kolejne eventy (ryzyko pętli przy źle
   zaprojektowanej regule — nic nie wykrywa cykli). Reguła odpala się PER WPIS (handler
   dostaje pojedynczy `EntryView`), nie per transakcja.
10. **Optimistic locking tylko sygnalizowany** — `Version` istnieje, ale in-memory repo nigdy
    go nie inkrementuje ani nie sprawdza; komentarze `//db transactions`, `//transactional`
    znaczą "tu w prawdziwej implementacji granica transakcji DB".
11. **Komendy bez testów** — `handle(ExecuteTransactionCommand)` i
    `handle(ReverseTransactionCommand)` nie mają ani jednego testu w repo; używaj builderów
    jako wzorca pierwotnego, komendy traktuj jako cienki adapter (łapie wyjątki → Result).
12. **`Transaction.execute()` modyfikuje konta w pamięci PRZED zapisem** — jeśli
    `accountRepository.save` rzuci, salda w obiektach już zmutowane (in-memory to nie boli,
    przy prawdziwej bazie wymaga transakcji DB).
13. **`balance()` vs `balanceAsOf()`** — `balance()` czyta zmaterializowane `Account.balance`
    (uwzględnia wpisy przyszłe natychmiast po execute), `balanceAsOf(now)` filtruje po
    `appliesAt` — dla transakcji future-dated wyniki się różnią; w testach bitemporalnych
    używaj wyłącznie `balanceAsOf`.
14. **Kompensata wygaśnięcia nie jest automatyczna** — brak schedulera; javadoc w
    `TransactionBuilder` podpowiada: serwis szukający `findAllMatching(validity.hasExpired)`
    i budujący kompensaty. W domenie z expiry trzeba ten proces dopisać.
15. **Wydajność odczytów** — `AccountViewQueries`/projekcje skanują wszystkie wpisy
    predykatami w pamięci (komentarze: "w DB to SQL"); to świadoma konwencja referencji,
    nie wzorzec produkcyjny.
16. **`AccountEntryFilter.onAmount` ma bug** — `amountPredicate.and(amountPredicate)` składa
    parametr sam ze sobą zamiast z polem (filtr kwoty działa, ale nie akumuluje poprzednich).
17. **Brak EQUITY** w `AccountType` (TODO w kodzie) — pełna księgowość bilansowa wymaga dodania.

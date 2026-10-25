# Inventory / Availability — referencja implementacyjna (repo archetypów)

Archetyp: zarządzanie **ograniczonymi zasobami w warunkach konkurencji** (wyścig wielu
podmiotów o zasób). Dekompozycja wg materiałów szkolenia (`inventory/docs/`):
**Availability** (blokady), **Reservations** (obietnice z cyklem życia), **WaitLists**
(kolejki przy niedoborze), plus **Inventory sensu stricto** (co istnieje: instancje,
partie, serial numbery). Anty-przykład: prywatny zasób jednego klienta (saldo, limit,
pakiet danych) to NIE Inventory, tylko Accounting — nie ma wyścigu.

---

## 1. Wskazanie na repo

Repo: `<archetypes>` (Maven multi-module, Java 21).

| Moduł | Ścieżka | Status w buildzie | Stack |
|---|---|---|---|
| simple-availability | `availability/simple-availability/` | moduł rootowego poma | Spring Boot 3.2.3, JPA+Postgres, REST, Spock (Groovy), Testcontainers |
| timed-availability | `availability/timed-availability/` | moduł rootowego poma | Spring Boot 3.2.3, JdbcTemplate+Postgres, JUnit 5, Testcontainers |
| waitlist | `waitlist/` | moduł rootowego poma | Spring Boot 3.2.5, in-memory, Spock |
| inventory | `inventory/` | **SAMODZIELNY projekt Maven** (własny `pom.xml` + `mvnw`, NIE jest w `<modules>` roota) | Spring Boot 3.5.7 (tylko starter, bez web/db), czysta Java in-memory, JUnit 5 + AssertJ |

Zależności SNAPSHOT projektu inventory: `com.softwarearchetypes:common:0.0.1-SNAPSHOT`
(`Result`, `Version`) i `com.softwarearchetypes:quantity:0.0.1-SNAPSHOT`
(`Quantity`, `Unit`). Przed buildem inventory na świeżej maszynie / po zmianach w common:

```bash
cd <archetypes>
./mvnw -pl common,quantity install -DskipTests
```

Komendy testów (wszystkie zweryfikowane 2026-10, wszystkie zielone):

```bash
# moduły rootowego poma (simple/timed wymagają Dockera — Testcontainers/Postgres):
cd <archetypes>
./mvnw -pl availability/simple-availability,availability/timed-availability,waitlist test
# wynik: simple 56 testów, timed 37, waitlist 24

# inventory — samodzielny projekt; UWAGA na pułapkę surefire (patrz sekcja 7):
cd <archetypes>/inventory
./mvnw test                               # 75 testów (TYLKO *Test — Scenarios POMINIĘTE!)
./mvnw test -Dtest='*Test,*Scenarios'     # 117 testów (komplet, +42 scenariuszowe)
```

Dokumentacja koncepcyjna (po polsku, bardzo dobra do uzasadniania decyzji):
`inventory/docs/inventory-archetyp-proposal.md` (czym jest/nie jest Inventory),
`inventory-domain-model.md` (docelowy model), `inventory-lesson-4-availability.md`
(granice agregatu, pool bottleneck), `inventory-lesson-5-reservations.md` (rezerwacja =
semantyka blokady czy osobna warstwa), `inventory-lesson-6-waitlists.md` (polityki kolejek).

---

## 2. Mapa kodu per moduł

### 2a. availability/simple-availability — dostępność POJEDYNCZEGO assetu, pełny slice Spring

Pakiet bazowy `com.softwarearchetypes.availability`:

- `domain/AssetAvailability` — agregat; jeden asset, jedna `Lock` (sealed:
  `MaintenanceLock` — stan początkowy po rejestracji, `WithdrawalLock` — wycofany,
  `OwnerLock(ownerId, until)` — blokada klienta). Metody zwracają
  `Result<RejectedEvent, SuccessEvent>`: `activate()`, `withdraw()`,
  `lockFor(OwnerId, Duration)`, `lockIndefinitelyFor(OwnerId)` (tylko gdy owner już trzyma
  locka — "przedłużenie"), `unlockFor(OwnerId, at)`, `unlockIfOverdue()`.
- `domain/AssetId`, `domain/OwnerId` — rekordy-wrappery na String.
- `domain/AssetAvailabilityRepository` — port: `save`, `findBy`, `findOverdue()`.
- `application/AvailabilityService` — @Transactional serwis: find → wykonaj metodę
  agregatu → gdy sukces: `save` + `DomainEventsPublisher.publish(event)`; wzorzec
  prywatnej metody `handle(asset, result)`.
- `application/OverdueLockHandling` — `@Scheduled(fixedDelay=10)` zwalnia przeterminowane.
- `commands/` — sealed `Command` + rekordy `Register/Activate/Withdraw/Lock(durationInMinutes)/LockIndefinitely/Unlock`,
  deserializacja polimorficzna Jackson po polu `type`.
- `events/` — `DomainEvent` (id, occurredAt, type) + pary sukces/odrzucenie:
  `AssetRegistered/RegistrationRejected`, `AssetActivated/ActivationRejected`,
  `AssetLocked/LockRejected`, `AssetUnlocked/UnlockingRejected`,
  `AssetWithdrawn/WithdrawalRejected`, `AssetLockExpired`; publikacja przez
  `infrastructure/events/SpringEventPublisher`.
- `common/Result<F,S>` — sealed Success/Failure z map/flatMap/fold/peek (lokalna kopia).
- `infrastructure/rest/AssetAvailabilityController` — jeden endpoint
  `POST /api/assets/commands` (JSON z `type`), switch po typie komendy; owner =
  `Principal.getName()` (HTTP Basic); 202 Accepted / 422 Unprocessable.
- `infrastructure/jpa/AssetAvailabilityEntity` + `JpaBasedAssetAvailabilityRepository` —
  lock serializowany do JSON-stringa w kolumnie (polimorficzne `LockRepresentation`).
  UWAGA: `findOverdue()` w JPA-repo zwraca `null` (niezaimplementowane!).

### 2b. availability/timed-availability — dostępność W CZASIE, optimistic locking na Postgresie

Pakiet `com.softwarearchetypes.availability` (klasy w większości pakietowe, publiczny facade):

- `AvailabilityFacade` — publiczne API: `createResourceSlots(resourceId, [parentId,] timeSlot)`,
  `block/release/disable(resourceId, timeSlot, owner)`, `blockRandomAvailable(Set<ResourceId>, within, owner)`
  (pula — losowy wolny zasób przez SQL `ORDER BY RANDOM()`), `loadCalendar/loadCalendars`,
  `findGrouped/find/findByParentId`. Każda mutacja: load → mutuj w pamięci →
  `saveCheckingVersion` (false = przegrany wyścig).
- `ResourceAvailability` — jednostka: jeden zasób × jeden segment czasu; pola
  `id, resourceId, resourceParentId, segment(TimeSlot), blockade, version`; metody
  `block/release/disable/enable(owner)` zwracają boolean.
- `Blockade(takenBy, disabled)` — rekord; `canBeTakenBy` = wolny lub ten sam owner;
  `disable` to twarde wyłączenie (np. serwis) z eventem przejęcia.
- `ResourceGroupedAvailability` — lista segmentów jednego żądania; `block` = wszystkie
  albo nic (w pamięci), `blockedEntirelyBy/isEntirelyAvailable/owners`.
- `segment/Segments` — `split(timeSlot, SegmentInMinutes)` i
  `normalizeToSegmentBoundaries`; DEFAULT_SEGMENT_DURATION_IN_MINUTES = 60. Każde żądanie
  normalizuje się do granic segmentów!
- `TimeSlot(from,to)` — overlapsWith, within, commonPartWith, leftoverAfterRemovingCommonWith, stretch.
- `ResourceAvailabilityRepository` — czysty `JdbcTemplate`; INSERT batchowy;
  `saveCheckingVersion`: `UPDATE ... SET version=? WHERE id=? AND version=?` — wszystkie
  wiersze muszą się zaktualizować (allMatch == 1), inaczej false. **Wzorcowy optimistic
  locking bez JPA.**
- `ResourceAvailabilityReadModel` — read model SQL: CTE z `LAG()` okienkowym sklejające
  sąsiednie segmenty tego samego ownera w ciągłe sloty → `Calendar(resourceId, Map<Owner, List<TimeSlot>>)`,
  `Calendars`.
- `ResourceTakenOver` — event publikowany po `disable` (przejęcie zasobu komuś spod nóg);
  `EventsPublisher` to interfejs (w testach mock).
- Schemat: `src/main/resources/schema-availability.sql` — tabela `availabilities`
  z `unique(resource_id, from_date, to_date)` i kolumną `version`.
- `ClockConfiguration`/`AvailabilityConfiguration` — bean facade z JdbcTemplate+Clock.

### 2c. waitlist — minimalna kolejka oczekujących (moduł roota)

Pakiet `com.softwarearchetypes.waitlist` (wszystko pakietowe):

- `WaitList` — agregat: `id`, `capacity`, `type` (enum `WaitListType.FIFO|PRIORITIZED`),
  `Queue<Element>` (FIFO → `LinkedBlockingQueue(capacity)`, PRIORITIZED → `PriorityQueue`);
  fabryki `waitListWithCapacityOf(int)`, `prioritizedWaitListWithCapacityOf(int)`;
  `add/poll/remove/removeByValue(UUID)/content/size`.
- `Element(UUID value, int priority)` — Comparable po priority rosnąco (1 = pierwszy).
- `WaitLists` — serwis aplikacyjny: `registerFIFOWaitListFor(capacity)`,
  `registerPrioritizedWaitListFor`, `addToWaitList(id, value[, priority])`,
  `removeFromWaitList`, `loadWaitListBy`.
- `WaitListRepository` + `InMemoryWaitListRepository` (ConcurrentHashMap);
  `findIfExistsBy` rzuca IllegalStateException.
- Braki znane: brak persystencji DB (komentarz `// private int version = 0; TODO`),
  capacity NIE jest egzekwowane dla PRIORITIZED (PriorityQueue jest nieograniczona —
  initialCapacity to nie limit!), brak powiązania z availability (standalone).

### 2d. inventory/ — najpełniejsza, czysta in-memory implementacja całego archetypu

Pakiet bazowy `com.softwarearchetypes.inventory` — trzy podpakiety + root:

**`availability/`** — strategie dostępności per typ zasobu:
- `ResourceAvailability` (interfejs, pakietowy): `lock(LockRequest)` /
  `unlock(UnlockRequest)` → `Result<String, BlockadeId>`, `isAvailable()`,
  `availableQuantity()`, `hasBlockade`, `hasExpiredBlockades`, `releaseExpired()`.
- `IndividualResourceAvailability` — jeden niepodzielny zasób (laptop, MRI); max jedna
  `IndividualBlockade`; winner-takes-all; ten sam owner może "re-lock" (przedłużyć).
- `PoolResourceAvailability` — pula ilościowa (litry paliwa, tokeny); `totalCapacity`,
  `withdrawn` (trwałe zużycie przez `withdraw`/`replenish`), lista `PoolBlockade(quantity)`;
  `availableQuantity() = total - withdrawn - suma aktywnych blokad`; wielu ownerów naraz.
- `TemporalResourceAvailability` — zasób × konkretny `TimeSlot` (noc hotelowa, wizyta);
  jedna `TemporalBlockade` na slot; wzór „one slot = one blockade" jak w timed-availability.
- `TemporalResourceGroupedAvailability` — multi-slot (pobyt wielodniowy): `block(owner,
  duration)` wszystkie-albo-nic z ręcznym rollbackiem już zablokowanych; `release(owner,
  blockadeIds)`; `blockedEntirelyBy/owners/findBlockedBy`.
- `CompositeResourceAvailability` — bundle zasobów (auto+GPS+fotelik): mapa komponentów,
  lock = dwufazowo (check all → lock all → rollback przy częściowej porażce), composite
  `BlockadeId` mapowany na blokady komponentów.
- `Blockade` (sealed: Individual/Pool/Temporal) — `id, owner, blockedAt, LockDuration`;
  `isActive/isExpired(now)` liczone z duration.
- `LockDuration` (sealed: `Indefinite` | `Timed(Duration)`) — fabryki `indefinite()`,
  `of(Duration)`, `ofMinutes/ofHours/ofDays` → **czas życia blokady/rezerwacji**.
- `LockRequest` (sealed: `IndividualLockRequest`, `PoolLockRequest(quantity)`,
  `TemporalLockRequest(slot)`, `CompositeLockRequest(Map<ResourceId,LockRequest>)`) —
  każda implementacja availability waliduje typ requestu (`instanceof` → failure).
- `UnlockRequest(requester, blockadeId)`; `LockCommand(availabilityId, request)`.
- `TimeSlot(Instant from, to)` — walidacja from<to; `ofDay(LocalDate)`, `overlaps`,
  `contains`, `isAdjacentTo`.
- Idki: `ResourceId`, `OwnerId` (UUID, z `none()`), `ResourceAvailabilityId`,
  `BlockadeId` (+ `composite(List<BlockadeId>)`).
- `AvailabilityFacade` — `register(availability)`, `lock/unlock(availabilityId, request)`,
  `handle(LockCommand)`, `handle(UnlockRequest)` (znajduje zasób po blockadeId!),
  `lockIndividual/lockTemporal/lockPool(resourceId, request)`, `isAvailable`,
  `findAvailable*`, `releaseExpired()` (sweep przeterminowanych — do wołania ze schedulera).
- `InMemoryResourceAvailabilityRepository` + `AvailabilityConfiguration.inMemory([clock])`.

**root `inventory/`** — co istnieje (stan magazynu):
- `InventoryProduct(productId, name, ProductTrackingStrategy, preferredUnit)` — fabryki
  `unique/individuallyTracked/batchTracked/identical`.
- `ProductTrackingStrategy` — enum `UNIQUE / INDIVIDUALLY_TRACKED / BATCH_TRACKED /
  INDIVIDUALLY_AND_BATCH_TRACKED / IDENTICAL` + predykaty `isTrackedIndividually()` itd.
- `InventoryEntry` — agregat per produkt: zbiór `InstanceId`, mapa
  `instanceToResource: InstanceId→ResourceId` (MOST między inventory a availability);
  `handle(LockCommand)` → switch po `ResourceSpecification` → deleguje do
  `AvailabilityFacade.lockTemporal/lockIndividual/lockPool`, z rollbackiem multi-slotów.
- `ResourceSpecification` (sealed) — `TemporalSpecification(List<TimeSlot>)`,
  `IndividualSpecification(instanceId)`, `QuantitySpecification` — "czego klient chce".
- `Instance` (interfejs) / `ProductInstance` — id, productId, opcjonalne `SerialNumber`,
  `BatchId`, `Quantity`, `features: Map<String,String>`; `effectiveQuantity()` = quantity
  lub 1 szt.
- `InstanceCriteria` — functional interface `isSatisfiedBy(Instance)` z kombinatorami
  `and/or/not`, fabryki `any/none/byBatch/bySerial/custom(Predicate)` — specyfikacja zapytań.
- `ProductDefinitionValidator` — port do archetypu Product (walidacja features vs
  definicja produktu); `alwaysValid()` do testów.
- `InventoryFacade` — pełne API (sekcja 3).
- Komendy: `CreateInventoryEntry(product)`, `CreateInstance` (builder),
  `LockCommand(productId, quantity, owner, resourceSpecification)`.
- Widoki: `InventoryEntryView`, `InstanceView`; repo: `InventoryEntryRepository`,
  `InstanceRepository` + in-memory; `InventoryConfiguration.inMemory([availabilityConfig][,validator])`.

**`reservation/`** — rezerwacja jako obiekt domenowy nad blokadami:
- `Reservation` — `id, owner, ReservationPurpose, List<BlockadeId>, createdAt,
  ReservationStatus, version`; `create(...)` od razu CONFIRMED; `cancel()` tylko aktywnej.
- `ReservationStatus` — `PENDING/CONFIRMED/CANCELLED/EXPIRED/FULFILLED` (realnie używane:
  CONFIRMED, CANCELLED; reszta zadeklarowana na wyrost).
- `ReservationPurpose` — `BOOKING/ALLOCATION/HOLD/TEMPORARY_LOCK`.
- `ReserveRequest` — builder: `forProduct(productId).quantity(...).owner(...)
  .purpose(...).resourceSpecification(...).validFor(Duration).build()`.
- `ReservationFacade.handle(ReserveRequest)` — tłumaczy na `InventoryFacade.handle(LockCommand)`;
  sukces → tworzy `Reservation` z otrzymanymi blockadeIds; `cancel(id, requester)` —
  autoryzacja ownera → `availabilityFacade.handle(UnlockRequest)` per blokada → status
  CANCELLED; `findById/findByOwner/findActive` → `ReservationView`.
- `ReservationConfiguration.inMemory([inventoryConfig, availabilityConfig,] clock)` —
  składa cały graf (availability → inventory → reservation).

**`waitlist/`** — generyczna kolejka z pluggable polityką (bogatsza niż moduł roota):
- `WaitList<T>` — `id, capacity, Queue<WaitListEntry<T>>, WaitListSelectionPolicy<T>`;
  fabryki `fifo(capacity)`, `priority(capacity)`, `criteria(capacity)`; `add` rzuca
  IllegalStateException przy pełnej (capacity egzekwowane RĘCZNIE — działa dla każdej
  polityki); `poll()`, `selectNext(SelectionContext)` / `selectNext(Predicate<T> canFulfill)`,
  `peek/removeById/isFull/availableCapacity/entries`.
- `WaitListEntry<T>(id, payload, priority, addedAt)` — Comparable: priority ASC, potem
  addedAt (stabilny tie-break czasem zgłoszenia).
- `WaitListSelectionPolicy<T>.selectNext(queue, context)` — strategia wyboru następnego:
  - `FifoSelectionPolicy` — poll z LinkedList;
  - `PrioritySelectionPolicy` — poll z PriorityQueue (porządek daje kolejka);
  - `CriteriaSelectionPolicy` — pierwszy wpis spełniający `context.canFulfill()`
    (np. "czy zwolniona ilość wystarczy temu klientowi?") — wymaga predykatu;
  - `QuotaSelectionPolicy(quotaConfig, segmentExtractor)` — limity per segment klientów
    (np. max 3 z segmentu VIP), stanowa (`allocated`, `resetQuotas`).
- `SelectionContext<T>(canFulfill, metadata, now)` — fabryki `empty/withPredicate/withMetadata/of`.

---

## 3. API wejściowe (jak klient używa)

### Sprawdzenie dostępności
- inventory: `availabilityFacade.isAvailable(availabilityId)`;
  `inventoryFacade.countProduct(productId[, InstanceCriteria])` → `Quantity`;
  `inventoryFacade.findInstances(productId, criteria)`; na agregacie
  `PoolResourceAvailability.availableQuantity()`.
- timed: `availabilityFacade.loadCalendar(resourceId, within)` →
  `Calendar.availableSlots()/takenBy(owner)`; `findGrouped(...).isEntirelyAvailable()`.
- simple: brak query-API — tylko komendy; stan przez repo.

### Rezerwacja / blokada
- **inventory (pełny flow)**:
  ```java
  var cfg = ReservationConfiguration.inMemory(clock);                 // cały graf
  inventoryFacade.handle(CreateInventoryEntry.forProduct(InventoryProduct.identical(pid, "Diesel")));
  InstanceId inst = inventoryFacade.createInstance(CreateInstance.forProduct(pid)
          .withQuantity(Quantity.of(10000, Unit.liters())).build()).getSuccess();
  // zarejestruj zasób w availability (w testach przez AvailabilityFixture.registerPool/Individual/TemporalSlot)
  inventoryFacade.mapInstanceToResource(entryId, inst, resourceId);   // most instancja→zasób
  Result<String, ReservationId> r = reservationFacade.handle(
      ReserveRequest.forProduct(pid).quantity(Quantity.of(500, LITERS))
          .owner(ownerId).purpose(ReservationPurpose.BOOKING)
          .resourceSpecification(ResourceSpecification.QuantitySpecification.instance())
          .build());
  ```
  Niżej-poziomowo: `inventoryFacade.handle(LockCommand)` → `List<BlockadeId>`, albo wprost
  `availabilityFacade.lock(availabilityId, IndividualLockRequest.of(resourceId, owner, LockDuration.ofHours(2)))`.
- **timed**: `availabilityFacade.block(resourceId, timeSlot, owner)` → boolean;
  pula zamiennych zasobów: `blockRandomAvailable(Set<ResourceId>, within, owner)` → `Optional<ResourceId>`.
- **simple (REST)**: `POST /api/assets/commands` z
  `{"type":"LOCK","assetId":"...","durationInMinutes":"30"}` (Basic auth; owner z Principala);
  typy: REGISTER, ACTIVATE, WITHDRAW, LOCK, LOCK_INDEFINITELY, UNLOCK; 202/422.

### Zwolnienie
- inventory: `reservationFacade.cancel(reservationId, requester)` (autoryzacja ownera,
  zwalnia wszystkie blokady, status CANCELLED); niżej
  `availabilityFacade.unlock(availabilityId, UnlockRequest.of(owner, blockadeId))` lub
  `handle(UnlockRequest)` (lookup po blockadeId); przeterminowane:
  `availabilityFacade.releaseExpired()`.
- timed: `release(resourceId, timeSlot, owner)`; twarde przejęcie: `disable(...)` +
  event `ResourceTakenOver`.
- simple: komenda UNLOCK; przeterminowane — scheduler `OverdueLockHandling`.

### Ustawienie się w kolejce
- inventory: `WaitList.fifo/priority/criteria(capacity)` + `add(WaitListEntry.of(payload[,
  priority]))`; po zwolnieniu zasobu: `selectNext(payload -> czyDaSięSpełnić(payload))` —
  wybrany wpis jest USUWANY z kolejki (obsłuż go albo stracisz). Kwoty:
  `new WaitList<>(id, cap, new LinkedList<>(), QuotaSelectionPolicy.of(quotas, extractor))`.
- moduł waitlist: `waitLists.registerFIFOWaitListFor(cap)`,
  `addToWaitList(id, uuid[, priority])`, `removeFromWaitList`, potem `waitList.poll()`.
- UWAGA: w żadnym module nie ma automatycznego spięcia "unlock → obsłuż kolejkę" — to
  świadomie pozostawiony punkt integracji (event po zwolnieniu → selectNext → lock dla
  wybranego).

---

## 4. Testy jako specyfikacja

### inventory (JUnit 5 + AssertJ, in-memory, zero Springa w testach)
`src/test/java/com/softwarearchetypes/inventory/`:
- `InventoryFacadeTest` (34) — entry/instancje/mapowanie/criteria/counting + `handle(LockCommand)`
  dla wszystkich trzech specyfikacji, w tym multi-slot temporal z rollbackiem i
  `failsLockWhenResourceUnavailable`, `failsLockWhenNoResourceMapped`.
- `availability/IndividualResourceAvailabilityTest` (8) — winner-takes-all,
  `sameOwnerCanRelockResource`, `nonOwnerCannotUnlockResource`,
  `timedLockExpiresAfterDuration` / `timedLockIsActiveWithinDuration` — **sterowanie czasem
  przez `Clock.fixed` + drugi clock przesunięty w przyszłość**; wzorzec testowania
  wygasania (zero sleepów).
- `availability/PoolResourceAvailabilityTest` (8) — częściowe blokady wielu ownerów,
  `cannotLockMoreThanAvailable`, `unlockingRestoresCapacity`,
  `withdrawReducesCapacityPermanently` / `replenishRestoresWithdrawnCapacity`,
  `withdrawnAndBlockedBothReduceAvailability`.
- `availability/TemporalResourceAvailabilityTest` (6) i
  `TemporalResourceGroupedAvailabilityTest` (4) — `failsIfAnySlotsAreUnavailable`
  (all-or-nothing + rollback), `tracksMultipleOwners`.
- `waitlist/WaitListTest` (8) — kolejność FIFO/priority, `criteriaSelectsFirstMatchingEntry`,
  `criteriaLeavesNonMatchingEntriesInQueue`, `cannotExceedCapacity`, `peekDoesNotRemoveEntry`.
- `reservation/ReservationFacadeTest` (7) — pełny cykl: create→CONFIRMED,
  fail przy braku dostępności, `cancellationReleasesResource` (po cancel drugi owner może
  zablokować), `nonOwnerCannotCancelReservation`, findByOwner/findActive.

### inventory — testy scenariuszowe `*Scenarios` (42; NIE odpalane domyślnie!)
Konwencja: `@DisplayName` po biznesowemu + `@Nested` klasy per podproces + `@BeforeEach`
składający graf z `*Configuration.inMemory(Clock.fixed(...))` + `AvailabilityFixture`
(publiczna klasa w pakiecie availability dająca testom z innych pakietów dostęp do
pakietowych klas: `registerIndividual/registerPool/registerTemporalSlot`). Styl
given/when/then w komentarzach.
- `availability/MedicalEquipmentScenarios` — Individual (MRI): wyścig oddziałów,
  `firstToLockWins`, release cudzej blokady zabroniony, re-lock = przedłużenie.
- `availability/MedicalAppointmentScenarios` — Temporal (sloty wizyt): drugi pacjent nie
  zabookuje zajętego slotu, rebooking tego samego pacjenta.
- `availability/FuelStationScenarios` — Pool (zbiornik ON): wiele flot z jednego zbiornika,
  wyczerpanie puli, anulowana rezerwacja wraca do puli, edge-case "dokładnie reszta".
- `reservation/FuelReservationScenarios` (Pool przez ReservationFacade) i
  `reservation/HotelReservationScenarios` (Temporal multi-night: `reservationFailsIfAnyNightTaken`,
  cancel → pokój znowu dostępny).

### timed-availability (JUnit 5 + Testcontainers Postgres)
`@SpringBootTest(classes={TestDbConfiguration, MockedEventPublisherConfiguration})` +
`@Sql("classpath:schema-availability.sql")`; `TestDbConfiguration` = `@ServiceConnection
PostgreSQLContainer` + JdbcTemplate.
- `ResourceAvailabilityOptimisticLockingTest` — **test WYŚCIGU**: `cantUpdateConcurrently`
  odpala 9 równoległych blokad przez ExecutorService i asertuje, że część `saveCheckingVersion`
  zwróciła false i `version < 10`; `updateBumpsVersion`.
- `AvailabilityFacadeTest` (12) — `cantBlockEvenWhenJustSmallSegmentOfRequestedSlotIsBlocked`,
  `cantReleaseEvenWhenJustPartOfSlotIsOwnedByTheRequester`,
  `oneSegmentCanBeTakenBySomeoneElseAfterRealising`,
  `resourceTakenOverEventIsEmittedAfterTakingOverTheResource` (Mockito.verify na publisherze).
- `TakingRandomResourceTest` — pula zamiennych zasobów: 3 ownerów bierze 3 zasoby, czwarty
  dostaje empty.
- `ResourceAvailabilityTest` (11, czysty unit) — block/release/disable/enable per owner.
- `AvailabilityCalendarTest`, `ResourceAvailabilityUniquenessTest`
  (`cantSaveTwoAvailabilitiesWithSameResourceIdAndSegment` — unikat w DB),
  `ResourceAvailabilityLoadingTest`, `TimeSlotTest` (15), `segment/SegmentsTest` +
  `SlotToNormalizedSlotTest`.

### simple-availability (Spock/Groovy)
- `domain/AssetAvailabilityTest` (15) — maszyna stanów locka; fluent builder-fixture
  `AssetAvailabilityFixture.someAsset().thatIsActive().thatWasLockedByOwnerWith(o)
  .forSomeValidDuration().thenUnlocked().get()`.
- `application/AvailabilityServiceTest` (10) — traity `AssetAvailabilityStoreSupport`
  (asercje stanu w repo: `thereIsALockedAssetWith`) i `AssetAvailabilityEventsSupport`
  (asercje publikacji: `assetLockedEventWasPublishedFor`), `InMemoryAssetAvailabilityRepository`
  w groovy — wzorzec in-memory double + support-traity.
- `infrastructure/rest/AssetAvailabilityControllerIT` (12) — `IntegrationSpec`
  (@SpringBootTest + @Testcontainers + statyczny PostgreSQLContainer z initScript
  `testContainers/postgresContainer.sql` + @DynamicPropertySource); MockMvc + httpBasic;
  każda komenda ma parę accepted/rejected.

### waitlist (Spock)
- `WaitListTest` (18) — data-driven `where:`, kolejność, remove/removeByValue, capacity
  (tylko FIFO faktycznie testuje przekroczenie), `WaitListFixture.polledElementsFrom`.
- `WaitListsIT` (6) — @SpringBootTest na serwisie `WaitLists`.

---

## 5. Punkty adaptacji (co generyczne, co konkretyzować)

**Generyczne — przenosić bez zmian:**
- Cała mechanika blokad: `Blockade` + `LockDuration` (Indefinite/Timed) + wygasanie
  liczone z `Clock` (nigdy `new Date`/sleep).
- `Result<F,S>` z common; `Version` (placeholder pod optimistic locking).
- Polityki kolejkowe `WaitListSelectionPolicy` + `SelectionContext` — `T` payloadu wolny.
- Optimistic-lockingowy wzorzec `saveCheckingVersion` (timed) — do każdej persystencji SQL.
- Normalizacja do segmentów (`Segments`) przy zasobach czasowych.

**Do konkretyzacji pod słownik biznesu:**
1. **Typ zasobu → wybór strategii availability** (sekcja 6): nazwy klas tłumaczyć
   (np. `IndividualResourceAvailability` → `GabinetAvailability`), ale sygnatury
   lock/unlock/isAvailable zostawić.
2. **Identyfikatory**: `ResourceId/OwnerId/AssetId` — podmienić na domenowe wrappery
   (`PatientId`, `FleetId`...); w simple to Stringi, w inventory/timed UUID.
3. **Czas życia blokady/rezerwacji**: `LockDuration` per use-case (koszyk e-commerce →
   `ofMinutes(15)`; wypożyczenie → `indefinite()` + jawny unlock; `ReserveRequest.validFor`
   jest przyjmowane, ale NIE egzekwowane — patrz sekcja 7). Sweep: `releaseExpired()` ze
   schedulera (wzór: `OverdueLockHandling` z simple).
4. **Polityki kolejkowe**: FIFO vs priorytet vs kryteria (czy pierwszy z kolejki w ogóle
   może być obsłużony zwolnioną ilością?) vs kwoty segmentowe — decyzja biznesowa;
   własna polityka = jedna implementacja `selectNext`.
5. **`ResourceSpecification`** — język żądań klienta; nowy typ zasobu = nowy wariant
   sealed + case w `InventoryEntry.handle`.
6. **`ProductTrackingStrategy` + `InstanceCriteria`** — jak biznes rozróżnia egzemplarze
   (serial? partia? identyczne?); criteria rozszerzać przez `custom(Predicate)`.
7. **`ProductDefinitionValidator`** — wpiąć realny archetyp Product zamiast `alwaysValid()`.
8. **`ReservationPurpose`/`ReservationStatus`** — rozszerzyć o statusy faktycznie
   potrzebne (EXPIRED/FULFILLED są zadeklarowane, ale nieobsłużone).
9. **Eventy**: simple ma pełny katalog eventów sukces/odrzucenie + publisher; inventory
   NIE publikuje eventów — jeśli biznes potrzebuje "AssetLocked"/"ResourceTakenOver",
   przenieść wzorzec z simple/timed.
10. **Persystencja**: inventory jest w całości in-memory za interfejsami repo — produkcyjnie
    podmienić na SQL w stylu timed (z version!) albo JPA+JSON w stylu simple.

---

## 6. Przepis generacji z mocnego podsumowania

Wejście: tabela pojęcie→element archetypu, niezmienniki, polityki, scenariusze kontencji.

**Krok 1 — wybór modułu-wzorca** (drzewo decyzyjne):
- Czy jest WYŚCIG wielu podmiotów o zasób? NIE → to nie Inventory (pewnie Accounting) —
  nie generuj z tej referencji.
- Zasób bez wymiaru czasu i ilości, cykl życia assetu (rejestracja→aktywacja→wycofanie)
  + eventy + REST → **simple-availability** (`AssetAvailability`).
- Zasób rezerwowany NA PRZEDZIAŁ CZASU (kalendarz, sloty, noclegi) + read-model
  kalendarza + realna współbieżność na DB → **timed-availability** (segmenty +
  `saveCheckingVersion`).
- Mieszanka typów zasobów (sztuki + pule ilościowe + sloty + bundle), rezerwacje jako
  obiekt z cyklem życia, stany magazynowe (partie/serial/features), kolejki →
  **inventory/** (najszersza baza; domyślny wybór dla nowej domeny).
- Tylko "lista oczekujących" bez reszty → moduł **waitlist** (prosty) albo
  `inventory/waitlist` (gdy potrzebne polityki criteria/quota lub generyczny payload).

**Krok 2 — mapowanie zasobów na strategie** (konwencja inventory):
„jeden konkretny X" → Individual; „N litrów/sztuk zamiennych" → Pool (+ `withdraw` na
faktyczne zużycie); „X w terminie T" → Temporal (+ Grouped dla zakresów); „zestaw X+Y+Z
razem" → Composite. Pula IDENTYCZNYCH policzalnych egzemplarzy, z których klient bierze
„którykolwiek" → alternatywnie wzorzec `blockRandomAvailable` z timed.

**Krok 3 — szkielet kodu** (konwencje inventory):
- pakiet per podarchetyp: `<domena>.availability`, `<domena>.reservation`,
  `<domena>.waitlist`, root = stany magazynowe;
- klasy domenowe pakietowe, publiczne tylko: fasady, komendy/requesty, idki, widoki,
  `*Configuration.inMemory(...)` (ręczny composition root — zero adnotacji DI w domenie);
- operacje zwracają `Result<String, Id>` (failure = komunikat), nie wyjątki; wyjątki
  tylko dla błędów programisty (null, capacity<=0);
- `Clock` wstrzykiwany wszędzie, gdzie liczy się czas;
- in-memory repo za interfejsem od pierwszego dnia.

**Krok 4 — niezmienniki z podsumowania → miejsca w kodzie:**
„nie można zablokować więcej niż dostępne" → `PoolResourceAvailability.isAvailable(q)`;
„wszystkie noce albo żadna" → Grouped.block + rollback; „tylko właściciel zwalnia" →
`Blockade.isOwnedBy` w unlock; „rezerwacja wygasa po T" → `LockDuration.Timed` +
`releaseExpired()`; „bundle razem" → Composite; „sprawiedliwość kolejki" → wybór
SelectionPolicy.

**Krok 5 — testy NAJPIERW, w tej kolejności:**
1. unit strategii availability (wzorzec `IndividualResourceAvailabilityTest`): happy path
   lock, wyścig dwóch ownerów (drugi failure), re-lock tego samego ownera, unlock
   nie-ownera, wygasanie przez dwa `Clock.fixed` (before/after);
2. unit puli/grouped: częściowe blokady, wyczerpanie, rollback all-or-nothing;
3. test fasady rezerwacji (wzorzec `ReservationFacadeTest`): create→CONFIRMED,
   fail bez dostępności, cancel zwalnia zasób (drugi owner może wejść), autoryzacja;
4. scenariusze biznesowe `*Scenarios` z `@DisplayName` w języku domeny (wzorzec
   `HotelReservationScenarios`) — żywa dokumentacja dla biznesu; **pamiętaj dodać
   `*Scenarios` do includes surefire albo nazwij je `*ScenariosTest`**;
5. jeśli docelowo SQL: test optimistic lockingu z ExecutorService (wzorzec
   `cantUpdateConcurrently`) — jedyny wiarygodny dowód odporności na wyścigi.

**Krok 6 — integracja kolejki (gdy w podsumowaniu jest „lista oczekujących"):**
przy odmowie locka → `waitList.add(WaitListEntry.of(żądanie[, priorytet]))`; przy
unlock/cancel/releaseExpired → `selectNext(payload -> availability.isAvailable(dla payload))`
→ lock dla wybranego → powiadomienie. Tego spięcia NIE ma w repo — trzeba je napisać
(dobry kandydat: handler eventu `AssetUnlocked`/`ResourceTakenOver` w stylu simple).

---

## 7. Pułapki i braki

1. **Surefire nie widzi `*Scenarios`** (inventory): spring-boot-parent → domyślne includes
   surefire (`*Test`, `Test*`, `*Tests`, `*TestCase`). `./mvnw test` = 75 testów,
   `-Dtest='*Test,*Scenarios'` = 117. 42 najcenniejsze (biznesowe) testy są domyślnie
   NIEURUCHAMIANE, a BUILD SUCCESS nic o tym nie mówi. Przy generowaniu własnych
   scenariuszy: dopisz includes do poma.
2. **inventory wymaga zainstalowanych SNAPSHOTów** common+quantity w lokalnym `~/.m2`
   (`./mvnw -pl common,quantity install -DskipTests` w roocie). Objaw braku: „Could not
   resolve dependencies ... com.softwarearchetypes:common:jar:0.0.1-SNAPSHOT".
3. **simple/timed-availability wymagają Dockera** (Testcontainers + Postgres). Bez Dockera
   padają IT (w simple 12/56 testów, w timed prawie wszystkie).
4. `ReserveRequest.validFor` jest przyjmowane, ale **ReservationFacade go ignoruje** —
   wszystkie blokady z `InventoryEntry.handle` są `LockDuration.indefinite()`. Rezerwacje
   czasowe trzeba doimplementować (przekazać validFor do LockRequestów); statusy
   EXPIRED/FULFILLED też są martwe.
5. **Brak optimistic lockingu w inventory**: `Version` jest polem, ale
   `InMemoryResourceAvailabilityRepository.save` nie sprawdza wersji; wzorzec wyścigowy
   jest tylko w timed (`saveCheckingVersion`). In-memory HashMapy (poza waitlistowym
   ConcurrentHashMap w module roota) nie są thread-safe — produkcyjnie DB + version.
6. **simple-availability: `findOverdue()` zwraca `null`** w
   `JpaBasedAssetAvailabilityRepository` (i w in-memory teście też) — scheduler
   `OverdueLockHandling` na prodzie wywali się NPE; wygasanie locków w simple jest de
   facto niezaimplementowane (OwnerLock ma `until`, ale `lockFor` sprawdza tylko
   `currentLock == null`, nie upływ terminu).
7. **Moduł waitlist: capacity nie działa dla PRIORITIZED** — `new PriorityQueue<>(capacity)`
   to initialCapacity, nie limit; test „should not allow to exceed" istnieje tylko dla
   FIFO. Wersja `inventory/waitlist` ma to naprawione (ręczny check w `add`). Brak też
   wersjonowania i realnej persystencji (TODO w kodzie).
8. **`CriteriaSelectionPolicy` USUWA wybrany wpis** z kolejki — jeśli obsługa się nie
   powiedzie, wpis przepada; wołający musi zapewnić kompensację (re-add).
   `QuotaSelectionPolicy` jest stanowa w pamięci (`allocated`) — nie przetrwa restartu.
9. **`BlockadeId.composite`** buduje UUID z hashCode listy — ryzyko kolizji; przy adaptacji
   Composite lepiej wygenerować losowy UUID (mapa `compositeBlockades` i tak istnieje).
10. **`AvailabilityFacade.lockIndividual/lockPool` biorą `availabilities.get(0)`**, a
    `InventoryEntry.handleTemporalLock/handleQuantityLock` biorą
    `instanceToResource.values().iterator().next()` — przy wielu zasobach/instancjach pod
    jednym produktem wybór jest arbitralny (brak strategii wyboru najlepszego zasobu).
    Dla puli zamiennych zasobów wzorcem jest `blockRandomAvailable` z timed.
11. **Dwa różne `TimeSlot`y i dwa `LockCommand`y** w inventory (root vs availability) —
    importować świadomie; `TimeSlot` z inventory waliduje from<to, ten z timed nie
    (a jego `overlapsWith` ma domknięte końce — inna semantyka niż `overlaps` w inventory!).
12. **Brak spięcia waitlist↔availability** we wszystkich modułach (sekcja 6, krok 6) oraz
    brak podarchetypów Location i Capacity Management opisanych w docs — docs obiecują
    więcej, niż kod zawiera; traktuj docs jako kierunek, kod jako stan faktyczny.
13. W simple REST ownerem jest `Principal.getName()` — tożsamość z security, nie z body;
    LOCK_INDEFINITELY wymaga ISTNIEJĄCEGO locka tego ownera (to „przedłużenie", nie
    świeża blokada) — mylące nazewnictwo.

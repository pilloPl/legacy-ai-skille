# Party — referencyjna implementacja in-memory (repo archetypów)

## 1. Wskazanie na repo

- Ścieżka projektu: `<archetypes>/party`
- **UWAGA: to SAMODZIELNY projekt Maven** — ma własny `party/pom.xml` i `party/mvnw`.
  NIE jest modułem rootowego `pom.xml` repo (root agreguje inne moduły: accounting, pricing, product, itd.).
- Budowanie i testy:
  ```bash
  cd <archetypes>/party && ./mvnw test
  ```
- Zależność: `com.softwarearchetypes:common:0.0.1-SNAPSHOT` (pakiet `com.softwarearchetypes.common`:
  `Result`, `Pair`, `Version`, `Preconditions`, `StringUtils`). Źródła common leżą w
  `<archetypes>/common` (moduł ROOTOWEGO poma). Jeśli kompilacja party
  pada z `cannot find symbol: method of() in class Pair` — w `~/.m2` jest **przestarzały jar common**;
  napraw przez:
  ```bash
  cd <archetypes> && ./mvnw -pl common install -DskipTests
  ```
- Java 21 (sealed classes, records, pattern matching). Testy: JUnit 5 + commons-lang3 (fixtures).
- Dokumentacja:
  - `party/README.md` — pełny opis problemu (User→Customer→Lead jako antywzorce), uzasadnienie modelu
    Party-centrycznego, model relacji, dyskusja o spójności (immediate vs eventual), storage (RDB/dokumentowa/grafowa).
  - `party/diagrams/` — diagramy PlantUML + PNG: `party-basic-model.puml`, `party-with-data-and-auth.puml`,
    `party-relationship-model.puml`, `party-addresses-aggregate-model.puml`, `party-role-type-model.puml`,
    `party-role-requirements.puml`, `party-capability-model.puml`, `party-capability-examples.puml`,
    przykładowe grafy biznesowe (`party-graph-novabank-ecosystem.puml`, `party-graph-transpol-logistics.puml`).
  - Dokumenty w roocie repo (`<archetypes>/`):
    - `party_capability_model_implementation.md` (PL, 1146 linii) — koncepcja Capability + OperatingScopes
      (WHERE/WHAT/HOW MUCH/HOW WELL/WHEN/PROTOCOL), przykłady (USG technician, Java Developer, elektryk,
      kierowca, software house), integracja z RoleRequirements, scenariusz "Senior Electrician".
    - `party_role_comparison_scenario.md` (PL, 796 linii) — TRZY podejścia do modelowania ról:
      (1) Role jako String — MVP/start-up; (2) hierarchia dziedziczenia PartyRole — bank, role z danymi
      i zachowaniem; (3) PartyRoleType (wzorzec Type-Instance) — SaaS multi-tenant, katalog ról definiowany
      w runtime. Z macierzą decyzyjną kiedy które.
  - **Pułapka:** oba dokumenty opisują model DOCELOWY, bogatszy niż kod (np. w dokumencie `CapabilityType`
    jest rekordem z `requiredScopeTypes` i walidacją, w kodzie to prosty rekord `(String name)`;
    `CapabilityId` w dokumencie jest UUID-owy, w kodzie String-owy). Kod = podejście 1 (Role-String)
    + zalążek podejścia 3 (PartyRoleType). Zawsze weryfikuj z kodem.

## 2. Mapa kodu

Wszystko w JEDNYM pakiecie `com.softwarearchetypes.party` (+ podpakiety `commands` i `events`).
Hermetyzacja przez package-private — publiczne jest tylko API wejściowe (fasady, widoki, identyfikatory).
Baza: `party/src/main/java/com/softwarearchetypes/party/`.

### Hierarchia Party (agregat #1)
| Klasa | Opis |
|---|---|
| `Party` | `public sealed abstract class Party permits Organization, Person` — trzyma `PartyId`, `Set<Role>`, `Set<RegisteredIdentifier>`, `Version`, listę `PartyRelatedEvent`, oraz DWIE polityki: `RegisteredIdentifierDefiningPolicy` i `PartyRoleDefiningPolicy`. Metody `add/remove(Role)`, `add/remove(RegisteredIdentifier)` zwracają `Result<String, Party>` i są **idempotentne** (duplikat/brak → event `...Skipped`, nie błąd). |
| `Person` | `final class Person extends Party` + mutowalna `PersonalData(firstName,lastName)`; `update(PersonalData)` emituje `PersonalDataUpdated` lub `PersonalDataUpdateSkipped`. |
| `Organization` | `sealed abstract ... permits Company, OrganizationUnit` + `OrganizationName`; `update(OrganizationName)` analogicznie. |
| `Company`, `OrganizationUnit` | liście hierarchii; różnią się tylko eventem rejestracji (`CompanyRegistered` vs `OrganizationUnitRegistered`). |
| `PartyId` | `public record PartyId(UUID value)` — JEDEN typ identyfikatora dla wszystkich typów party (brak PersonId/OrganizationId — celowo, patrz README: sole trader). `PartyId.random()`. |
| `PartyBuilder` | fluent builder: `PartyBuilder.newParty().withPartyId(..).with(role).with(identifier).asPerson().with(personalData).build()` (też `.asCompany()`, `.asOrganizationUnit()`). |

### Role
| Klasa | Opis |
|---|---|
| `Role` | `record Role(String name)` — rola "globalna" party jako value object (podejście String). |
| `PartyRole` | `record PartyRole(PartyId partyId, Role role)` — rola w KONTEKŚCIE relacji (strona relacji). |
| `PartyRoleFactory` | tworzy `PartyRole` dla pary (Party, Role) przepuszczając przez `PartyRoleDefiningPolicy`; failure: `"Policies for assigning party role not met"`. |
| `PartyRoleDefiningPolicy` | `@FunctionalInterface boolean canDefineFor(Party, Role)`; default `alwaysAllow()`. Punkt zaczepienia reguł typu "rola X tylko dla organizacji". |
| `PartyRoleType` | wzorzec Type-Instance (katalog ról): `id + name + description + RoleRequirements`; `canBeAssumedWith(List<Capability>)`, `findMissingRequirements(..)`. **TODO w kodzie:** nie jest jeszcze spięty z `PartyRole` (docelowo PartyRole → partyRoleTypeId + Validity, patrz javadoc klasy i `diagrams/party-role-requirements.puml`). |
| `RoleRequirements` | `record (Role, List<CapabilityRequirement>)` + builder `RoleRequirements.forRole("Senior Radiologist").requireCapability(..).build()`; `isSatisfiedBy(List<Capability>)`, `findMissing(..)`. |

### Relacje (osobny "agregat" — rekordy zarządzane fasadą)
| Klasa | Opis |
|---|---|
| `PartyRelationship` | `record (PartyRelationshipId id, PartyRole from, PartyRole to, RelationshipName name, Validity validity)` — skierowana, nazwana krawędź grafu; asymetria przez różne role stron. |
| `RelationshipName` | value object nazwy relacji ("EMPLOYMENT", "MANAGER_OF"...). |
| `PartyRelationshipFactory` | tworzy relację przez `PartyRelationshipDefiningPolicy.canDefineFor(from, to, name)`. |
| `PartyRelationshipDefiningPolicy` | punkt na reguły jakościowe/ilościowe ("supplier tylko firma", "max 10 podwładnych"); default `alwaysAllow()`. |
| `PartyRelationshipBuilder` + `PartyRelationshipBuilderFactory` | alternatywne, fluent API: `.from(partyId, "Employer").to(partyId2, "Employee").named("EMPLOYMENT").withValidity(..).build()` — sam dociąga Party z repo i waliduje obie polityki (rolową i relacyjną). |

### Identyfikatory rejestrowe
| Klasa | Opis |
|---|---|
| `RegisteredIdentifier` | `public interface { String type(); String asString(); Validity validity(); default isCurrentlyValid()/isValidAt(Instant) }` — identyfikator semantyczny (krajowy/branżowy). |
| `PersonalIdentificationNumber` | PESEL: 11 cyfr + walidacja sumy kontrolnej (wagi 1,3,7,9...); `validity()=ALWAYS`; type `"PERSONAL_IDENTIFICATION_NUMBER"`. |
| `TaxNumber` | NIP: 10 cyfr + suma kontrolna (wagi 6,5,7,2,3,4,5,6,7; mod 11, 10=invalid); ALWAYS; type `"TAX_NUMBER"`. |
| `Passport` | `record (String number, Validity validity)` — wzorzec `[A-Z]{2}\d{7}`, **ma datę ważności**; type `"PASSPORT"`. |
| `RegisteredIdentifierDefiningPolicy` | polityka "jaki identyfikator dla jakiego typu party": `personalIdentifiersOnlyForPersons()` (PESEL/PASSPORT→Person), `organizationalIdentifiersOnlyForOrganizations()` (REGON/KRS→Organization), `composite(...)`, `all()` (= default w Party), `allowAll()`. Walidacja i w konstruktorze Party (wyjątek), i w `add()` (failure `"IDENTIFIER_NOT_ALLOWED_FOR_PARTY_TYPE"`). |

### Capabilities (co party POTRAFI, w jakich granicach)
| Klasa | Opis |
|---|---|
| `Capability` | final class: `id + partyId + CapabilityType + List<OperatingScope> + Validity`; builder `Capability.forParty(partyId).type("MedicalImaging").withScope(..).validUntil(..).build()`; `satisfies(CapabilityRequirement)` — zgodność typu + wszystkie ScopeRequirements + aktualna ważność. |
| `CapabilityType` | `record (String name)` — prosty typ/kategoria ("GoodsDelivery"). |
| `OperatingScope` | `public sealed interface` z 7 implementacjami-rekordami w środku: `LocationScope` (zbiór lokalizacji, `includes`, `expandWith`), `TemporalScope` (dni+godziny, `workingHours()`, `always()`), `QuantityScope` (`maxPerDay/Week/Month`, `unlimited()`), `SkillLevelScope` (JUNIOR<MID<SENIOR<EXPERT po `rank`), `ProtocolScope` (certyfikaty, np. "ADR"), `ProductScope`, `ResourceScope`. Każdy ma `satisfies(OperatingScope requirement)` — semantyka "pokrywam wymaganie" (nadzbiór/≥). |
| `CapabilityRequirement` | `record (CapabilityType, List<ScopeRequirement>)` + builder `CapabilityRequirement.requiring("MedicalImaging").withScope(SkillLevelScope.SENIOR).build()`. |
| `ScopeRequirement` | `record (String scopeType, OperatingScope requiredScope)` — dopasowanie po `scopeType()`. |
| `Validity` | `public record (Instant validFrom, Instant validTo)` — [from, to), `ALWAYS`, `until/from/between`, `isValidAt`, `overlaps`. Wspólny dla identyfikatorów, relacji, adresów i capabilities. |

### Adresy (agregat #2 — osobny od Party!)
| Klasa | Opis |
|---|---|
| `Addresses` | agregat KOLEKCJI adresów jednego party (klucz `PartyId`): `addOrUpdate(Address)` / `removeAddressWith(AddressId)`, idempotentne, sekcja krytyczna wokół całej kolekcji; `Addresses.emptyAddressesFor(partyId[, policy])`. |
| `Address` | `sealed abstract class ... permits GeoAddress, EmailAddress, PhoneAddress, WebAddress`; każdy adres ma `AddressId`, `PartyId`, `Set<AddressUseType>`, `Validity`, `AddressDetails`. |
| `AddressUseType` | enum: BILLING, MAILING, SHIPPING, RESIDENTIAL, ... |
| `AddressDefiningPolicy` | `noDuplicateAddresses()`, `noOverlappingValidityForSameType()`, `composite`, `all()` (=DEFAULT), `alwaysAllow()`. |
| `GeoAddress.GeoAddressDetails` | rekord (name, street, building, flat, city, `ZipCode`, Locale); analogicznie `EmailAddressDetails`, `PhoneAddressDetails`, `WebAddressDetails`. |

### Fasady, zapytania, repozytoria, konfiguracja
| Klasa | Opis |
|---|---|
| `PartiesFacade` | CRUD na party: `handle(RegisterPersonCommand/RegisterCompanyCommand/RegisterOrganizationUnitCommand/AddRoleCommand/RemoveRoleCommand/AddRegisteredIdentifierCommand/RemoveRegisteredIdentifierCommand/UpdatePersonalDataCommand/UpdateOrganizationNameCommand)`; wzorzec: find → metoda domenowa → `peekSuccess(save)` → `peekSuccess(publish(publishedEvents()))` → map do widoku. Komentarz `//tx required`. |
| `PartyRelationshipsFacade` | `handle(AssignPartyRelationshipCommand)` — tworzy OBA `PartyRole` przez `PartyRoleFactory`, łączy `Result.combine(.., Pair::of)`, potem `PartyRelationshipFactory.defineFor`; `handle(RemovePartyRelationshipCommand)`. |
| `AddressesFacade` | `handle(AddOrUpdateGeoAddressCommand)` (z `GeoAddressDTO`), `handle(RemoveAddressCommand)`; lazy-tworzy pusty agregat `Addresses`. |
| `CapabilitiesFacade` | `handle(AddCapabilityCommand)` (weryfikuje istnienie party przez `PartiesQueries`), `handle(RemoveCapabilityCommand)`. |
| `PartiesQueries` | `findBy(PartyId)`, `findOneBy(RegisteredIdentifier)` (rzuca gdy >1!), `findMatching(Predicate<Party>)` → `PartyView`. |
| `PartyRelationshipsQueries` | `findBy(id)`, `findAllRelationsFrom(partyId[, name])`, `findMatching(Predicate)` → `PartyRelationshipView`. |
| `CapabilitiesQueries` | sedno modelu capability: `findPartiesSatisfying(CapabilityRequirement)`, `findPartiesWithCapability(type)`, `findPartiesAtLocation(type, loc)`, `findPartiesWithSkillLevel(type, minLevel)`, `findCapabilitiesAtLocationWithSkill(..)` — zawsze filtruje `isCurrentlyValid()`. |
| `AddressesQueries` | zapytania o adresy per party. |
| `PartySearch` | zapytanie grafowe (README: "znajdź pracownika naszego dostawcy działającego w Warszawie") — łańcuch predykatów party→relacja→adres; placeholder pod grafową bazę. |
| Repozytoria | interfejsy `PartyRepository`, `PartyRelationshipRepository`, `AddressesRepository`, `CapabilitiesRepository` + implementacje `InMemory*Repository` na `ConcurrentHashMap`. `PartyRepository.findBy(partyId, Class<? extends Party>)` do operacji typowanych (update Person vs Organization). |
| `PartyConfiguration` | **ręczny composition root**: `PartyConfiguration.inMemory()` skleja wszystkie repo, fasady, queries i `InMemoryEventsPublisher`. Bez Springa. To jest wzorzec do kopiowania. |
| `PartyAuthenticationService` | PUSTY szkielet (`//authenticate //-> show auth policies here`); sekcja Authentication w README = "TBD". |

### Commands (`party/commands/`) i Events (`party/events/`)
- Commands = publiczne rekordy wejściowe: `RegisterPersonCommand(firstName, lastName, Set<String> roles, Set<RegisteredIdentifier> identifiers)`, `RegisterCompanyCommand(organizationName, roles, identifiers)`, `RegisterOrganizationUnitCommand`, `AddRoleCommand(partyId, String role)`, `RemoveRoleCommand`, `Add/RemoveRegisteredIdentifierCommand`, `UpdatePersonalDataCommand`, `UpdateOrganizationNameCommand`, `AssignPartyRelationshipCommand(fromPartyId, fromRole, toPartyId, toRole, relationshipName)`, `RemovePartyRelationshipCommand`, `AddOrUpdateGeoAddressCommand(partyId, GeoAddressDTO)`, `RemoveAddressCommand`, `AddCapabilityCommand(partyId, String capabilityType, List<OperatingScope>, Validity)`, `RemoveCapabilityCommand`.
- Events: para wzorców — `XxxSucceeded`/`XxxSkipped` (wewnętrzne, idempotencja) oraz marker `PublishedEvent` (tylko realne zmiany stanu idą do `EventPublisher`): `PersonRegistered`, `CompanyRegistered`, `OrganizationUnitRegistered`, `RoleAdded/RoleRemoved` (+`RoleAdditionSkipped`/`RoleRemovalSkipped`), `RegisteredIdentifierAdded/Removed` (+Skipped), `PersonalDataUpdated`, `OrganizationNameUpdated`, `PartyRelationshipAdded/Removed`, `GeoAddressDefined/Updated/Removed` (i email/phone/web). `InMemoryEventsPublisher` z rejestrowanymi obserwatorami.

## 3. API wejściowe (jak klient używa modelu)

```java
// 0. Bootstrap — zawsze tak:
PartyConfiguration configuration = PartyConfiguration.inMemory();
PartiesFacade parties = configuration.partiesFacade();
PartiesQueries partiesQueries = configuration.partiesQueries();

// 1. Rejestracja party (role jako Set<String>, identyfikatory jako obiekty):
Result<String, PartyView> r = parties.handle(
    new RegisterPersonCommand("Jan", "Kowalski", Set.of("Customer"), Set.of(PersonalIdentificationNumber.of("..."))));
PartyId personId = r.getSuccess().partyId();          // PartyView: partyId, partyType ("PERSON"/"COMPANY"/"ORGANIZATION_UNIT"), roles, identifiers, version
parties.handle(new RegisterCompanyCommand("Acme Sp. z o.o.", Set.of("Supplier"), Set.of(TaxNumber.of("1234563218"))));

// 2. Role po fakcie (idempotentnie):
parties.handle(new AddRoleCommand(personId, "VIP"));
parties.handle(new RemoveRoleCommand(personId, "VIP"));

// 3. Identyfikatory po fakcie (pod polityką defaultową all()):
parties.handle(new AddRegisteredIdentifierCommand(personId, Passport.of("AB1234567", Validity.until(expiry))));

// 4. Relacja (asymetryczna, nazwana, z rolami stron):
PartyRelationshipsFacade rels = configuration.partyRelationshipsFacade();
rels.handle(new AssignPartyRelationshipCommand(companyId, "Employer", personId, "Employee", "EMPLOYMENT"));
configuration.partyRelationshipsQueries().findAllRelationsFrom(companyId, "EMPLOYMENT");

// 5. Capability + pytanie "kto potrafi":
CapabilitiesFacade caps = configuration.capabilitiesFacade();
caps.handle(new AddCapabilityCommand(doctorId, "MedicalImaging",
    List.of(OperatingScope.LocationScope.of("Hospital A"),
            OperatingScope.SkillLevelScope.SENIOR,
            OperatingScope.QuantityScope.maxPerDay(20)),
    Validity.until(licenseExpiry)));
List<PartyId> seniors = configuration.capabilitiesQueries().findPartiesSatisfying(
    CapabilityRequirement.requiring("MedicalImaging")
        .withScope(OperatingScope.LocationScope.of("Hospital A"))
        .withScope(OperatingScope.SkillLevelScope.SENIOR).build());

// 6. Rola z wymaganiami (RoleRequirements + PartyRoleType):
RoleRequirements req = RoleRequirements.forRole("Senior Radiologist")
    .requireCapability(CapabilityRequirement.requiring("MedicalImaging")
        .withScope(OperatingScope.SkillLevelScope.SENIOR).build()).build();
boolean can = req.isSatisfiedBy(configuration.capabilitiesQueries().findByPartyId(doctorId));
PartyRoleType type = PartyRoleType.create("Senior Radiologist", req); // type.canBeAssumedWith(caps)

// 7. Adres:
configuration.addressesFacade().handle(new AddOrUpdateGeoAddressCommand(partyId,
    new GeoAddressDTO(AddressId.random(), partyId, "HQ", "Marszałkowska", "1", "2", "Warszawa", "00-001", Locale, Set.of("BILLING"))));
```

Zasady API: wszystko przez `handle(Command)` → `Result<String, View>` (failure = String kod:
`"PARTY_NOT_FOUND"`, `"POLICY_NOT_MET"`, `"IDENTIFIER_NOT_ALLOWED_FOR_PARTY_TYPE"`, `"CAPABILITY_NOT_FOUND"`).
Klient NIE dotyka encji domenowych (są package-private) — dostaje `PartyView`/`PartyRelationshipView`/`CapabilityView`/`AddressView`.

## 4. Testy jako specyfikacja (`party/src/test/java/com/softwarearchetypes/party/`, 306 testów)

### Testy scenariuszowe (najlepsza specyfikacja biznesowa — czytaj NAJPIERW)
- `PartyRegistrationScenariosTest` — rejestracja Person/Company/OrganizationUnit, unikalność PartyId, rejestracja z rolami i NIP, nieistniejące ID → empty.
- `PartyRolesScenariosTest` — @Nested: BasicRole (Person-Customer, Company-Supplier), MultipleRoles, BusinessRole (banking/telecom/e-commerce/logistics), RoleManagement (**idempotencja add/remove**, add do nieistniejącego party → failure), RoleEvolution (Customer→VIP→Premium VIP).
- `PartyRelationshipsScenariosTest` (481 l., największy) — @Nested: Employment (osoba↔firma, wielu pracowników, multi-employment), Banking (ACCOUNT_HOLDER, LOAN), Telecom (subskrypcje), OrganizationStructure (**hierarchia Team→Department→Company przez relacje BELONGS_TO**), Partnerships (supplier-customer, franczyza, dystrybucja), RelationshipManagement (terminate, query by id / all-from).
- `CapabilitiesScenariosTest` — Hospital (znajdź radiologów Senior w Hospital A; **wygasła licencja znika z wyników**), Logistics (ADR/hazmat, pokrycie regionu), IT Teams (zespół per produkt, poziom Senior), RoleRequirements verification, Capability lifecycle (add/remove).
- `RoleRequirementsScenariosTest` — Senior Radiologist (Senior OK, Expert OK bo rank≥, Junior NIE, brak capability NIE), Hazmat Driver (ADR), Tech Lead (DWA wymagania naraz), wygasła capability blokuje rolę, `PartyRoleType.canBeAssumedWith`.
- `RegisteredIdentifiersScenariosTest` — PESEL (checksum, długość, never expires), NIP (checksum, permanent), Passport (expiry, `isValidAt`), Validity (ALWAYS/from/until/between/overlaps).
- `AddressesScenariosTest` — geo adresy, use types, e-commerce (billing vs shipping), banking, międzynarodowe.
- `PartySearchTest.shouldFindAnEmployeeOfAProviderThatWorksInWarsaw()` — zapytanie grafowe z README end-to-end.

### Testy fasad/jednostkowe
- `PartiesFacadeTest` (344 l.) — konwencja //given //when //then, asercje na `Result.success()` + `PartyView.partyType()` + **weryfikacja eventów przez `PartiesTestEventListener.thereIsAnEventEqualTo(expectedEvent)`**.
- `PartyRelationshipsFacadeTest`, `AddressesFacadeTest`, `PartyRoleFactoryTest`, `PartyRelationshipFactoryTest`, `RegisteredIdentifierDefiningPolicyTest` (polityki PESEL/REGON/composite).
- Testy value objects: `PartyIdTest`, `RoleTest`, `RelationshipNameTest`, `ValidityTest`, `PersonalIdentificationNumberTest`, `TaxNumberTest`, `PassportTest`, `PersonalDataTest`, `GeoAddressTest`, `Email/Phone/WebAddressDetailsTest`, `PersonTest`, `PartyRolesTest`/`PersonRolesTest`/`CompanyRolesTest`/`OrganizationUnitRolesTest`, `*RegisteredIdentifiersTest`.

### Konwencje testowe (powielaj je przy generacji!)
1. Setup zawsze: `private final PartyConfiguration configuration = PartyConfiguration.inMemory();` + wyciągnięte fasady/queries jako pola. ZERO mocków, ZERO Springa.
2. Scenariusze: `@DisplayName` po biznesowemu + `@Nested` klasy per obszar.
3. Eventy: `PartiesTestEventListener` rejestruje się w `InMemoryEventsPublisher` i łapie do `BlockingQueue`.
4. Fixtures/buildery testowe: `PartyFixture.somePerson()/someCompany()` (→ `PersonTestDataBuilder`/`CompanyTestDataBuilder`/`OrganizationUnitTestDataBuilder` extends sealed `PartyAbstractTestDataBuilder`), `RoleFixture.someRole()/someRoleSetOfSize(n)`, `RegisteredIdentifierFixture.someRegisteredIdentifier()` (anonimowa impl!), `PersonalDataFixture`, `OrganizationNameFixture`, `GeoAddressFixture`, `PartyRelationshipFixture`, `CommandFixture`, `RandomFixture`/`CollectionFixture` (w `common`). Random stringi z commons-lang3 `randomAlphabetic`.
5. Given-helpers w stylu DSL: `PartyTestSupport.thereIsSomePerson()`, `PartyRelationshipTestSupport.thereIsARelationBetween(...)`, `AddressesTestSupport.thereIsAddressOf(...)`.
6. `PartyFixture.FixablePartyIdSupplier` — deterministyczne ID przez wstrzykiwany `Supplier<PartyId>` (fasada przyjmuje supplier w konstruktorze).

## 5. Punkty adaptacji (co generyczne, co konkretyzować)

**Generyczne — kopiuj bez zmian:**
- Szkielet `Party`/`Person`/`Organization`/`Company`/`OrganizationUnit` + `PartyId` (UUID), `Version`.
- Mechanika idempotencji (Succeeded/Skipped + filtr `PublishedEvent`), `Result` pipeline w fasadach.
- `Validity` (uniwersalny), `PartyRelationship` jako rekord-krawędź, repo in-memory, `PartyConfiguration.inMemory()`.
- Mechanizm `Capability` + `satisfies` + `CapabilityRequirement`/`RoleRequirements`.

**Do konkretyzacji pod domenę klienta:**
1. **Typy ról** — wybierz podejście wg `party_role_comparison_scenario.md`: String (MVP — tak jest w kodzie), dziedziczenie (role z danymi/zachowaniem), `PartyRoleType` (katalog w runtime, wymagania capability). W kodzie Role to dowolny String — dla konkretnej domeny wprowadź stałe/enum nazw ról albo katalog `PartyRoleType`.
2. **Polityki definiowania ról** — implementacje `PartyRoleDefiningPolicy` ("rola Supplier tylko dla Organization", limity) i wstrzyknięcie do `PartyRoleFactory`/konstruktora Party (konstruktor 6-argumentowy) zamiast `alwaysAllow()`.
3. **Polityki relacji** — implementacje `PartyRelationshipDefiningPolicy` (jakościowe: typy stron/role; ilościowe: "max N podwładnych" — potrzebują dostępu do repo relacji!) i wstrzyknięcie do `PartyRelationshipFactory` (uwaga: `PartyConfiguration.inMemory()` tworzy fabrykę BEZ polityki — trzeba zmienić wiring).
4. **Typy relacji** — ustal słownik `RelationshipName` + ról stron dla domeny (EMPLOYMENT: Employer/Employee itd.); rozważ stałe.
5. **Identyfikatory krajowe/branżowe** — nowe implementacje `RegisteredIdentifier` wg wzorca PESEL/NIP/Passport (regex + checksum + `validity()`); rozszerz zbiory typów w `PersonalIdentifiersOnlyForPersonsPolicy`/`OrganizationalIdentifiersOnlyForOrganizationsPolicy` lub napisz własne polityki composite. UWAGA: typy REGON/KRS są wymienione w politykach, ale ich klasy NIE istnieją — to świadomy punkt rozszerzenia.
6. **Typy capability i scope'y** — słownik `CapabilityType` dla domeny; w razie potrzeby nowy scope = nowy rekord w `OperatingScope` (sealed — trzeba dopisać do `permits`) z własnym `scopeType()` i `satisfies`.
7. **Polityki adresowe** — `AddressDefiningPolicy` (w kodzie gotowe: no-duplicates, no-overlapping-validity); typy adresów już są 4 (Geo/Email/Phone/Web), ale fasada ma command TYLKO dla Geo — dodaj commandy dla pozostałych jeśli domena wymaga.
8. **Persystencja** — podmień `InMemory*Repository`; README omawia opcje (RDB + tabela krawędzi / JSON, dokumentowa, grafowa np. Neo4j dla `PartySearch`-owych zapytań, hybryda z outboxem).

## 6. Przepis generacji z "mocnego podsumowania"

Wejście: tabela mapowania z analizy archetypowej (podmioty→Party, role, relacje, identyfikatory, zdolności).

1. **Podmioty → hierarchia Party.** Każdy typ podmiotu (osoba, firma, oddział, system zewnętrzny...) = `Person` / `Company` / `OrganizationUnit`; NIE twórz klas per rola biznesowa (Customer/Lead/Supplier — to ROLE, nie typy). Nowy typ strukturalny (np. `SystemAccount`)? — dodaj do `permits` w `Party`/`Organization` wg wzorca `Company`, z własnym eventem `XxxRegistered` i metodą `toPartyRegisteredEvent()` + gałąź w `PartyViewMapper` i `PartiesFacade.handle(RegisterXxxCommand)`.
2. **Role z podsumowania → Set<Role> (String).** Start zawsze od podejścia 1; przejdź na `PartyRoleType`+`RoleRequirements` tylko gdy podsumowanie mówi o warunkach objęcia roli (certyfikaty, poziomy) lub katalogu ról edytowalnym w runtime.
3. **Relacje → PartyRelationship.** Dla każdej relacji z podsumowania ustal: nazwę, rolę strony "from", rolę strony "to", kierunek, Validity. Hierarchie organizacyjne modeluj relacjami (BELONGS_TO), nie kompozycją obiektów — wzór w `PartyRelationshipsScenariosTest.OrganizationStructureScenarios`.
4. **Niezmienniki → polityki.** Reguły "kto może co" rozdziel: o rolach → `PartyRoleDefiningPolicy`; o relacjach → `PartyRelationshipDefiningPolicy`; o identyfikatorach → `RegisteredIdentifierDefiningPolicy`; o adresach → `AddressDefiningPolicy`. Reguły wymagające spójności natychmiastowej vs ostatecznej — decyzja świadoma (README, sekcja Analysis: relacje trzymane OSOBNO od Party, reguły ilościowe egzekwowane miękko/rekoncyliacją).
5. **"Co podmiot potrafi" → Capability**, "czego wymaga rola/zadanie" → `CapabilityRequirement`/`RoleRequirements`. Wymiary ograniczeń mapuj na scope'y: gdzie→Location, kiedy→Temporal, ile→Quantity, jak dobrze→SkillLevel, certyfikat→Protocol, czym→Resource, nad czym→Product.
6. **Skopiuj infrastrukturę:** `common` (Result/Pair/Version/Preconditions/StringUtils) albo zależność na moduł; pakiet `events` z `PublishedEvent` + `InMemoryEventsPublisher`; `InMemory*Repository`; `PartyConfiguration.inMemory()` dostosowany (wstrzyknij skonkretyzowane polityki!).
7. **Testy najpierw, w tej kolejności:**
   a) test rejestracji podmiotów (wzór: `PartyRegistrationScenariosTest`) — od razu wymusza commandy i widoki;
   b) test ról + idempotencji (wzór: `PartyRolesScenariosTest.RoleManagementScenarios`);
   c) test polityk (negatywne przypadki! wzór: `RegisteredIdentifierDefiningPolicyTest`);
   d) testy relacji per proces biznesowy klienta (wzór: `PartyRelationshipsScenariosTest`, @Nested per obszar);
   e) jeśli są capabilities: testy "znajdź kto spełnia wymaganie" + "wygasłe nie wraca" (wzór: `CapabilitiesScenariosTest`);
   f) testy eventów przez `PartiesTestEventListener`;
   g) na końcu value objects identyfikatorów (checksum!).
   Każdy test buduje świat przez `PartyConfiguration.inMemory()` + fasady — nigdy przez bezpośrednie repo (wyjątek: `PartyTestSupport.thereIs(party)` jako given).
8. **Nazewnictwo domenowe:** zostaw nazwy archetypowe klas mechanizmu (Party, PartyRelationship, Capability), konkretyzuj WARTOŚCI (nazwy ról, relacji, typów capability) i ewentualnie fasady (np. `ContractorsFacade` delegująca) — tak testy czytają się biznesowo, a mechanika zostaje referencyjna.

## 7. Pułapki i braki

1. **Stale zbudowany `common` w ~/.m2** — objaw: `cannot find symbol: method of() ... class Pair` przy kompilacji `PartyRelationshipsFacade`/`PartyRelationshipBuilder`. Fix: `cd <archetypes> && ./mvnw -pl common install -DskipTests`. Party NIE zbuduje się świeżo sklonowane bez zainstalowania common.
2. **README ≠ kod w szczegółach:** README pokazuje `Result<RoleAdditionFailed, Party>` i `Address` jako interfejs `permits GeoAddress` — w kodzie failure to zwykły `String`, a `Address` to sealed ABSTRACT CLASS z 4 typami. Dokumenty rootowe (capability/role-comparison) opisują model docelowy bogatszy niż kod (CapabilityType z requiredScopeTypes — NIE zaimplementowane). Źródłem prawdy jest kod + testy.
3. **PartyRoleType niepodpięty do PartyRole** — jawne TODO w javadoc `PartyRoleType`: docelowo `PartyRole{partyRoleId, partyId, partyRoleTypeId, validity}`; dziś `PartyRole(partyId, role-String)` bez Validity. Brak repozytorium/katalogu dla `PartyRoleType` — obiekty tworzone ad hoc w testach.
4. **Authentication = TBD** — `PartyAuthenticationService` jest pustą klasą; README obiecuje polityki auth, nie ma nic. Diagram `party-with-data-and-auth.puml` pokazuje zamysł.
5. **Brak enforcementu RoleRequirements w fasadzie** — `AddRoleCommand` NIE sprawdza capabilities; weryfikacja `RoleRequirements.isSatisfiedBy` to osobny, ręczny krok (testy `RoleRequirementsScenariosTest` wołają ją wprost). Generując kod dla domeny z warunkowym nadawaniem ról, spleć to w handlerze.
6. **`Version` jest martwy** — pola są, `version()` zwraca, ale nic nie inkrementuje i repo nie robi optymistycznego blokowania; `//tx required` to tylko komentarz. In-memory repo nadpisuje bez kontroli współbieżności (ConcurrentHashMap chroni mapę, nie niezmienniki).
7. **Idempotencja vs. failure — niejednolite:** add/remove roli i identyfikatora są idempotentne (Skipped-event, success), ale polityki zwracają failure; `Addresses.addOrUpdate` miesza oba. Przy generacji trzymaj zasadę: duplikat/brak = skip-event, złamana reguła = failure.
8. **`PartiesQueries.findOneBy(RegisteredIdentifier)` rzuca `IllegalStateException`** gdy >1 party ma ten sam identyfikator — unikalność identyfikatorów NIE jest wymuszana przy zapisie, tylko wykrywana przy odczycie.
9. **Relacje nie są sprzątane** — usunięcie Party (`PartyRepository.delete`) nie usuwa jego relacji, adresów ani capabilities; brak procesu rekoncyliacji (README świadomie to odkłada na eventual consistency).
10. **`AssignPartyRelationshipCommand` nie wspiera Validity** — rekord relacji ma Validity, ale fasada zawsze tworzy `Validity.ALWAYS` (przez `PartyRelationshipFactory.defineFor`); Validity ustawisz tylko przez `PartyRelationshipBuilder.withValidity(..)`. Brak też kontroli duplikatów relacji (komentarz w fasadzie: "we should handle unique key ... constraint violations here").
11. **`AddressesFacade` obsługuje tylko GeoAddress** — Email/Phone/Web mają klasy i eventy, ale nie mają commandów w fasadzie; nie ma też walidacji, że partyId adresu istnieje (komentarz w kodzie).
12. **Polityki REGON/KRS bez klas identyfikatorów** — polityka zna typy "REGON"/"KRS", klasy nie istnieją; trzeba je dopisać wg wzorca TaxNumber.
13. **`PartySearch` jest naiwny** — predykaty w pamięci, jednoprzebiegowy łańcuch party→relacja→adres; jawny komentarz: w produkcji Criteria/graf DB. Nie generuj na nim skomplikowanych zapytań.
14. **`Capability`/`CapabilityType` są package-private** — publiczne są `CapabilityView`, `CapabilityId`, `OperatingScope`, `Validity`, fasada i queries; `CapabilitiesQueries.findByPartyId` zwraca jednak `List<Capability>` (niespójność wystawienia). `RoleRequirements`/`CapabilityRequirement`/`PartyRoleType` też package-private — użycie z innego pakietu wymaga zmiany widoczności.
15. **Testy fixtures używają reflection i commons-lang3** — `PartyFixture.somePartyOfType` czyta `getPermittedSubclasses()`; przy dodaniu nowego typu Party dodaj builder extends `PartyAbstractTestDataBuilder` (sealed!), inaczej fixture się wywali.
16. **Uprawnienia z relacji — brak implementacji referencyjnej.** Mapper Party (Step 9.5) opisuje uprawnienie podmiotu w kontekście innego podmiotu: wynikające z relacji według konfiguracji (także po ścieżce, np. dostawcy mojego dostawcy), z ważnością z relacji, opcjonalne nadanie wprost (CRUD) i kartę uprawnień podmiotu. W `<archetypes>/party` nic takiego nie ma. Trzeba to zaprojektować luźno, w stylu modułu: osobna fasada i queries obok `PartyRelationshipsFacade`, reguła derywacji jako wstrzykiwana polityka/konfiguracja czytana przy zapytaniu (nie kopia uprawnień przepisywana przy zmianie relacji), `Validity` z rekordu relacji, nadanie wprost jako osobny rekord z własną `Validity`, karta jako zapytanie zbierające oba źródła. Decyzja autoryzacyjna zostaje po stronie procesu, który pyta. W raporcie oznacz jako rozszerzenie bez wzorca.

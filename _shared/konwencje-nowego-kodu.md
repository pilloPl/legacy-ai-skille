# Konwencje nowego kodu i nowych testów (legacy)

Źródło: standardy wygenerowane w projekcie cabs-java-ai (`pilloPl/cabs-java-ai`, gałąź `workflow-exercise`,
tag `start-workflow`: skille `test-conventions`, `test-convention-reviewer`; zasady kodu z `CLAUDE.md` @`6d321950`).
Dostosowane do pracy w systemie legacy i do czterowarstwowych testów (workflow `parallel-models`: `swappable-dsl`, `parallel-model-router`).

## Zakres — przeczytaj najpierw

- **Dotyczą WYŁĄCZNIE nowych plików**: nowych klas produkcyjnych (DSL, sterowniki, nowy model, router,
  rekonsyliator, flaga) i nowych testów.
- **Istniejących plików nie poprawiamy pod te konwencje.** Żadnego „boy-scouta”: nie zmieniamy wstrzykiwania
  zależności, typów wyjątków, nazw, stylu testów ani układu pakietów w legacy. Zmiana wyjątku albo konstruktora
  w starym kodzie zmienia zachowanie, które stary sterownik ma utrwalić.
- **Dopisujemy, legacy zmieniamy jak najmniej.** Odstępstwo tylko z tych powodów: **test** (szew, żeby legacy dało
  się zapytać przez DSL: dodatkowy konstruktor obok istniejących, wydzielony interfejs), **wpięcie** (przepięcie
  wołającego na port), **wajcha** (klucz flagi w istniejącym mechanizmie), **ekran** (rejestracja ekranu wajchy
  w nawigacji), **build** (zależność od nowego modułu). Każde
  odstępstwo wypisujemy w specyfikacji, sekcja „Odstępstwa” (krok, plik, co, powód). Kontrola: `git diff --diff-filter=M --stat` od początku gałęzi.
- Istniejące testy legacy zostają, jak są, i dalej mają przechodzić. Nie przepisujemy ich na ten styl.
- Konwencje projektu legacy (build, wersje, biblioteki testowe) wygrywają z tymi, gdy chodzi o narzędzia:
  używamy tych bibliotek, które projekt już ma (np. JUnit 5 + AssertJ, Mockito tylko tam, gdzie niżej wolno).

Przykłady są z Javy (źródło: cabs-java-ai). W innym języku: nazewnictwo, widoczność, asercje i składnia
testów według idiomu języka projektu (`stos-odpowiedniki.md`); zasady (scenariusz bez wiringu, DSL bez logiki, bez
mocków frameworka, dopisujemy) zostają.

## Testy

### Kształt klasy
- Klasa testowa package-private (bez `public`), metody `@Test` package-private, nazwy `snake_case`
  czytane jak zdanie: `card_issued_by_partner_works_at_campsite_covered_by_agreement`. Wyjątek: metody `@Test`
  w interfejsie scenariuszy są publiczne (wymóg języka) — to nie odstępstwo.
- Pola z domyślnym dostępem, nie `final` (JUnit tworzy instancję na test). Dane losowe w `@BeforeEach`.
- Stałe czasu `static final`, `SCREAMING_SNAKE`: `NOW`, `TODAY`, `TUESDAY_9_00`.
- Komentarze BDD małymi literami: `// given`, `//and`, `//when`, `//then`; bez pustej linii między komentarzem
  a kodem; kilka `//when` / `//then` w scenariuszu wieloetapowym. Przy samym pytaniu `//when //then` w jednej linii
  (pytanie i asercja razem).
- Asercje tylko AssertJ (`assertThat`), nigdy `assertEquals` / `assertTrue`. Powtarzająca się asercja domenowa →
  własny obiekt asercji (`extends AbstractAssert`, package-private, statyczne `assertThat`, metody w języku
  domeny zwracające `this`, najpierw `isNotNull()`).
- Buildery danych: statyczne wejście, metody-czasowniki domeny (`ownedBy`, `coveringRegion`), nie settery;
  `build()` zwraca niemutowalny obiekt. Klasa `Fixtures` tylko dla nazwanych pojęć biznesowych, nie dla id.
- Czas: `Clock.fixed(NOW, …)`; gdy test przesuwa czas — zegar sterowany z helpera `itIs(...)`.

### Czterowarstwowo (DSL) — to zastępuje część zasad z cabs-java-ai
- **Scenariusz** (Test Case) mówi tylko czasownikami DSL. Nie tworzy typów implementacji (`new GroupService(...)`),
  nie woła ich metod, nie widzi encji, DAO, id technicznych, wyjątków frameworka.
- **DSL** to interfejs: czasowniki w języku problemu (CO) + typy wyniku jako rekordy faktów obserwowalnych.
  Parametry typów prostych (`String`) jak w języku scenariuszy; na typy wartości portu zamienia sterownik.
  Zero logiki, zero asercji. DSL **zastępuje** helpery „Pattern 6” — nie budujemy obu.
- **Sterownik** (Protocol Driver) implementuje DSL nad jedną implementacją (stary model, nowy model, router).
  Tłumaczy i obserwuje; bez asercji, bez logiki biznesowej.
- **Wiring jest w sterowniku i w jednym miejscu wyboru sterownika** — `<Obszar>Scenarios` z `<Obszar>Dsl dsl()`
  (klasa bazowa albo interfejs z domyślnymi metodami `@Test`, gdy test legacy dziedziczy po bazowej klasie
  integracyjnej projektu) i klasa testowa na sterownik: `<Obszar>LegacyScenariosTest`,
  `<Obszar><Rozwiązanie>ScenariosTest`, `<Obszar>RouterScenariosTest`. Nigdy wybór sterownika w ciele testu.
  Interfejs + Spring: `@Transactional` z klasy nie obejmuje metod z interfejsu — transakcja ręcznie w
  `@BeforeEach`/`@AfterEach`.
- **Komendy świata** (budowanie sytuacji, `<Obszar>World` z implementacją na model, pakiet `…world`) wołają tylko
  testy i moduł seedera, nigdy kod produkcyjny; sterownik testowy deleguje do nich i dodaje tylko pytania. Nowe
  rozwiązanie przechodzi te same scenariusze (ma stare zachowanie); scenariuszy nie wyłączamy i nie zmieniamy.
  (Zasada cabs-java-ai „wiring tylko w `*Configuration.inMemory()`” dotyczy nowego modelu: jego moduł ma
  `*Configuration.inMemory()`, a sterownik ją woła.)
- Nazwy: `<Obszar>Dsl`, `<Obszar>LegacyDriver`, `<Obszar><Rozwiązanie>Driver`, `<Obszar>RouterDriver`,
  `<Obszar>Scenarios`, test sanity `<Obszar>Configuration<Rozwiązanie>Test`, test zgodności na seedzie
  `<Obszar>SeedAgreementTest` (w module, który widzi seed); wajcha: interfejs `<Obszar>Lever`,
  implementacja na mechanizmie flag `<Mechanizm><Obszar>Lever` (bean: `position()` z pozycją i źródłem), w testach
  wajcha w pamięci; odczyt dla ekranu `<Obszar>LeverState` w pakiecie portu; ekran `<Obszar>LeverPage` albo
  `<Obszar>LeverSection` (podsekcja istniejącego ekranu). Nazwa `{ClassName}Test` tylko dla testu
  jednej nowej klasy (np. `ReconciliationTest`).

### Mocki i infrastruktura
- Bez `@SpringBootTest`, `@Mock`, `@InjectMocks`, `@ExtendWith(MockitoExtension.class)` i refleksji w nowych
  testach jednostkowych i scenariuszowych. Mock tylko `Mockito.mock(...)` inline i tylko na granicy efektu
  ubocznego (powiadomienie, zewnętrzne API), zadeklarowanej w specyfikacji.
- **Nowy model (hipoteza)**: dane w pamięci (`HashMap`) w **kodzie produkcyjnym** modułu — hipoteza działa też w
  uruchomionej aplikacji (seeder, porównanie na froncie); trwałe repozytoria przyjdą z migracją, nie teraz.
  `<Obszar><Rozwiązanie>ScenariosTest` to zwykła klasa bez kontekstu Springa: sterownik buduje model sam
  (`*Configuration.inMemory()`).
- **Stary model (sterownik legacy)**: legacy nie ma konfiguracji in-memory i jej nie dorabiamy w produkcji.
  Kolejność wyboru: (1) jeśli projekt ma już wzorzec testów jednostkowych legacy w pamięci (np. fixture
  `InMemoryGroups` + atrapy DAO) i pokrywa on wszystkie pytania z `miejsca.md`, sterownik go używa; (2) w przeciwnym
  razie sterownik legacy jest testem integracyjnym na infrastrukturze projektu (np. jego bazowa klasa
  `IntegrationTest` + Testcontainers) — to jedyne miejsce, gdzie wolno kontekst Springa.
- **Świat nowego modelu w testach integracyjnych**: jeśli model jest beanem we współdzielonym kontekście (np. Spring
  cache'uje kontekst między klasami testów), dane z jednej klasy zostają w następnej — w testach buduj nowy model
  sam (`new`), a nie bierz go z kontekstu; albo używaj prefiksów nazw per klasa testów.
- **Router** testujemy na dwóch prawdziwych modelach, bez mocków: nowy w pamięci, legacy tak, jak go testuje
  sterownik legacy (często integracyjnie). Wajcha sterowana z testu przez jej implementację w pamięci, nie przez
  mock. Transakcja przy porównaniu to zależność routera — w testach wykonanie bez osobnej transakcji (osobna nie
  widzi świata z wycofywanej transakcji testu). Wyjątek: jeden test ścieżki z osobną transakcją na zatwierdzonym
  świecie (commit), ze sprzątaniem po sobie. Wolno mały fake portu, który rzuca wyjątek (awaria modelu, który nie
  odpowiada). Liczbę pytań (do „liczba porównań = liczba pytań”) liczy sterownik routera, nie test. Test zgodności
  na seedzie podaje rekonsyliacji katalog różnic w `target/`; jego dziedzina = pytania wołających z `miejsca.md`.
- Kontekst Springa dopuszczalny poza tym tylko w teście „sanity” konfiguracji `<Obszar>Configuration<Rozwiązanie>Test`
  w module aplikacji (krok 5: kontekst z profilem seedera i przełącznikiem na nowym rozwiązaniu startuje, odpowiada
  nowy model — sprawdzane zachowaniem, nie typem adaptera — seed jest w obu modelach, wejścia z `miejsca.md` istnieją;
  router: pozycja domyślna wajchy = przełącznik startowy) — jeśli projekt i tak ma testy
  integracyjne.

## Kod produkcyjny (nowy)
- Wstrzykiwanie przez konstruktor; pola `final`.
- Wyjątki: nie rzucamy gołych `IllegalStateException` / `IllegalArgumentException` — własny wyjątek domenowy
  w tym samym pakiecie (`CardNotAccepted extends RuntimeException`). Router i stary sterownik **przepuszczają**
  wyjątki legacy bez zmiany typu.
- Nowy model w osobnym pakiecie, bez zależności od encji, DAO i serwisów legacy; legacy nie zależy od nowego
  modelu. Jedyne miejsca, które znają obie strony: sterowniki, router, tłumaczenie identyfikatorów.
- Nazwy w języku domeny; camelCase; jawne importy (bez `*`); linia do 120 znaków.
- Nowy model trzyma konwencje modułu referencyjnego archetypu (`archetype-implementer`), jeśli z niego powstał.

## Review nowych plików
- `test-convention-reviewer` wołamy **tylko z listą nowych plików** i z tym plikiem jako źródłem reguł; w trybie bez
  pytań nie wołamy go wcale, z człowiekiem — gdy wybierze to w bramce kroku 3 albo 4. Wyjątki
  usankcjonowane, które trzeba mu podać: sterowniki i klasa/interfejs scenariuszy trzymają wiring; publiczne metody
  `@Test` w interfejsie scenariuszy; sterownik legacy
  i testy routera mogą być integracyjne; odpowiedź tak/nie sprawdzamy `assertThat(…).isTrue()/isFalse()` — własny
  obiekt asercji dopiero, gdy wynik ma strukturę i asercja się powtarza; mocki tylko na zadeklarowanych granicach.
- Nie zgłaszamy odstępstw w plikach legacy, nawet jeśli dotknął ich szew.

## Front (nowe pliki frontu)
Testy w idiomie projektu (jego runner, jego atrapa backendu — np. `fakeBackend`), nazwy jak sąsiednie testy; nowe
zapytania z lokalnym typem odpowiedzi zamiast regeneracji klienta API („Ścieżka spoza schematu klienta API”
w `stos-odpowiedniki.md`). Nowy endpoint: ścieżka w jego klasie (wspólnego rejestru ścieżek legacy nie ruszasz), prawo
sprawdzane tam, gdzie projekt sprawdza je w innych odczytach. Inne stosy: `stos-odpowiedniki.md`.

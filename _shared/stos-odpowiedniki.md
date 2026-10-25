# Odpowiedniki pojęć w różnych stosach (swappable-dsl, parallel-model-router)

Skille mówią pojęciami; przykłady w treści są z Javy/Springa. Tu odpowiedniki. Brak stosu → szukasz tego samego
pojęcia w tym, co projekt już ma. Nazewnictwo, widoczność i asercje — według idiomu języka projektu.

| Pojęcie | Java / Spring | TypeScript / Node | Python / Django | PHP / Symfony, Laravel | .NET |
|---|---|---|---|---|---|
| szew (podanie zależności z zewnątrz) | dodatkowy konstruktor, wydzielony interfejs | parametr fabryki/funkcji; Nest provider | parametr z wartością domyślną; gdy widok woła ORM wprost — `django.test.Client` na widoku | konstruktor, `services.yaml`/bind | konstruktor, `AddScoped` |
| rejestracja routera | bean (`@Bean`, `@Primary`) | provider / fabryka modułu | fabryka w `settings` / module | definicja serwisu, bind w ServiceProvider | rejestracja w DI |
| typ wartości | `record` | branded type / klasa readonly | `@dataclass(frozen=True)` | `final readonly class` | `record` |
| jeden zestaw scenariuszy, wiele sterowników | interfejs z domyślnymi `@Test` albo klasa bazowa | funkcja `defineScenarios(() => dsl)` wołana w plikach testów | mixin z metodami `test_` | trait z metodami `test*` | klasa generyczna `Scenarios<TDriver>` z `[Fact]` |
| transakcja scenariusza | ręcznie przed/po (z interfejsem `@Transactional` nie działa) | transakcja ORM w `beforeEach`/`afterEach` albo czyszczenie bazy | `TestCase` (sam opakowuje) | DAMA DoctrineTestBundle; Laravel `DatabaseTransactions` | `TransactionScope` / Respawn |
| test integracyjny na prawdziwej bazie | klasa bazowa + Testcontainers | Testcontainers (node) / baza w compose | `TestCase` na bazie testowej | `KernelTestCase` / `RefreshDatabase` | `WebApplicationFactory` + `IClassFixture` |
| znana różnica (oczekiwany czerwony) | `@Disabled("A1: …")` + jednorazowe sprawdzenie | `it.failing` (sam sprawdza czerwony) | `pytest.mark.xfail(strict=True)` | `markTestSkipped` / `@group` | `[Fact(Skip = "A1: …")]` |
| zegar w teście | `Clock.fixed` | wstrzykiwany zegar / `jest.useFakeTimers` | wstrzykiwany zegar / freezegun | Symfony `MockClock` | `FakeTimeProvider` |
| asercje | AssertJ | `expect` | `assert` (pytest) / `assertEqual` (Django) | `assertSame` | FluentAssertions / Shouldly |
| mocki frameworka (unikamy) | Mockito | `jest.mock` | `unittest.mock.patch` | Mockery / Prophecy | Moq |
| przełącznik startowy | właściwość konfiguracji | zmienna środowiskowa / config | `settings.py` / `.env` | `parameters.yaml` / `.env` | `appsettings.json` |
| seeder | profil Springa + `ApplicationRunner` | skrypt / `onModuleInit` | komenda `manage.py` | komenda `bin/console` / Laravel seeder | `IHostedService` |
| flaga bez redeployu | tabela ustawień projektu, Togglz | tabela, Unleash/OpenFeature | django-waffle, django-constance | tabela, Laravel Pennant | `Microsoft.FeatureManagement` |
| cache flag | per węzeł JVM | per proces / cluster | per proces (gunicorn) | per proces (FPM) / APCu | per proces |
| izolacja nowego modelu | osobny moduł builda (ArchUnit opcjonalnie) | osobny katalog + dependency-cruiser | osobny pakiet + import-linter | osobny namespace + deptrac | osobny `.csproj` (kompilator pilnuje) |
| pliki builda (poza odstępstwami) | `pom.xml`, `build.gradle` | `package.json`, lock | `pyproject.toml`, `requirements.txt` | `composer.json`, lock | `*.csproj`, `*.sln` |

**Kontrola kierunku zależności (każdy stos, wystarczy na szkolenie):**
`grep -rnE "^(import|from|use|using) " <katalog nowego modelu> | grep "<przestrzeń nazw legacy>"` → pusto.

**System na procedurach składowanych:** szew = wywołanie procedury; sterownik legacy = test na bazie (wywołanie
procedury na danych zbudowanych komendami świata); nowy model w języku aplikacji; port w aplikacji, która dziś
woła procedurę.

**Porównanie w trybie cienia w stosach asynchronicznych:** drugi model wołany tak, żeby nie opóźniał odpowiedzi
(Node: `Promise.allSettled` po wysłaniu odpowiedzi albo kolejka); zapis różnic z blokadą przy wielu procesach
(PHP: `LOCK_EX`).

**Ścieżka spoza schematu klienta API (front).** Klient generowany ze schematu (OpenAPI) nie zna nowego endpointu,
a pod jeden odczyt go nie regenerujesz. Typ odpowiedzi lokalnie, obok ekranu (`type <Obszar>LeverState = …`), i jedno
z dwóch: rzutowanie ścieżki w kliencie projektu (TS: `client.GET('/api/…' as never)` i wynik `as <Typ>` — zostaje
jego adres, ciasteczka, CSRF i obsługa błędów) albo cienki `fetch` z tym samym adresem bazowym i nagłówkami co
klient (CSRF z ciasteczka, `credentials: 'include'`). Najpierw rzutowanie; `fetch`, gdy klient odrzuca nieznaną
ścieżkę w działaniu. Inne fronty: to samo — wywołanie przez klienta projektu z ręcznym typem, bez generatora.

---
disable-model-invocation: true
name: flow-lens
description: >
  Pokazuje w przeglądarce, krok po kroku, którędy jeden request (albo job, albo wiadomość z kolejki) naprawdę idzie
  przez aplikację — tylko przez wybrane warstwy i klasy domenowe, od wejścia do bazy: wywołania klas (także przez this),
  SQL, transakcje, wywołania innych systemów i logi w chwili, w której padły. Źródłem są spany i logi OpenTelemetry
  z działającej aplikacji (dowolna technologia; Java jednym poleceniem) — „prawie na żywo”, przebieg pojawia się
  chwilę po requeście. Na przebieg nakłada się własne warstwy-adnotacje (kolory: „sprawdzanie uprawnień”, „wyświetlanie
  danych”…) i etykiety z linkami. Najpierw rozpoznaje stos (OTel, frameworki, logi, baza) i proponuje tryb; bez OTel
  działa z wstrzykniętego logu, logów frameworka, logu bazy i szkieletu z kodu. Wywołuj, gdy użytkownik chce „zobaczyć, którędy idzie request”, „prześledzić
  przepływ przez kod”, „pokazać N+1 / SQL ekranu”, uruchomić flow-lens, zbudować mapę klas domenowych albo dopisać
  adnotacje do przepływu.
argument-hint: "[repo] [-- komenda uruchomienia aplikacji]"
---

> **EKSPERYMENTALNY.** Skill w budowie, pokazywany na szkoleniu poglądowo. Wyniki sprawdzaj z kodem i z człowiekiem; tryby bez OpenTelemetry bywają niepełne.

# flow-lens

Odbiornik OpenTelemetry + widok przebiegu. Bez zależności: Node 18+ (serwer i widok), Python 3 (mapa).
Kopia silnika widoku z harness-lens (nawigacja, auto, warstwy, inspektor), z własnym modelem i sceną.

```
źródła (OTLP protobuf/JSON, plik logu, …) → zdarzenia → filtr wg mapy → przebieg → widok (SSE, nagrania)
```

## 0. Rozpoznanie: co się da zrobić (zawsze najpierw, zanim cokolwiek uruchomisz)

`node .claude/skills/flow-lens/rozpoznaj.mjs <repo>` → raport + `<repo>/.flow-lens/rozpoznanie.json`. Czyta tylko
pliki (manifesty zależności, Dockerfile/compose, konfigurację logów, próbkę kodu), niczego nie uruchamia. Daje:
- stos: języki, frameworki, ORM/sterowniki, kolejki, logowanie, czy aplikacja ma już OTel, rodzaj bazy;
- tryby flow-lens z oceną ✓ / … (wymaga — co dokładnie) / ½ / ✗ i powodem (np. baza w pamięci → bez logu bazy,
  Nest bez granic requestów, .NET bez metod klas w OTel, PHP wymaga rozszerzenia);
- „na co uważać” — lekcje z korpusu dla rozpoznanych składników (`wiedza/skladniki.json`);
- podobne stosy z wynikami trybów — tylko sprawdzone (patrz „Uczenie się”);
- proponowaną kolejność trybów.

Pokaż raport użytkownikowi i **razem wybierzcie tryb** — szczególnie, gdy wymaga zmian w środowisku (pakiety OTel,
rozszerzenie PHP, poziomy logów, log bazy). Dopiero potem mapa i uruchomienie. Gdy rozpoznanie czegoś nie zna (✗ „nie
znamy formatu logów”, składnik spoza katalogu), powiedz to wprost zamiast zgadywać.

## 1. Mapa: co nas interesuje (zrób to za użytkownika, potem pokaż do zatwierdzenia)

Mapa (`<repo>/.flow-lens/mapa.json`) mówi, które klasy rysujemy i w jakiej roli: wejście, aplikacja, domena,
repozytorium, pomiń. Z niej powstaje też lista metod dla agenta OTel — klasy spoza mapy w ogóle nie dają spanów.

1. Indeks CodeGraph: jeśli w repo nie ma `.codegraph/`, zapytaj, czy go zbudować (`codegraph init <repo>`).
2. `python3 .claude/skills/flow-lens/mapa/zbuduj_mape.py <repo>` → `mapa.json` + `propozycja.md`.
   Role nadają reguły per technologia z `mapa/reguly/<tech>.py` (umowa jak w `entry-flows/rules`:
   `ORDER`, `DETECT(p)`, `klasyfikuj(k)`); nowa technologia = kopia `mapa/reguly/_szablon.py`.
3. Pokaż użytkownikowi `propozycja.md`: liczby per rola i **pytania** (przypadki „do potwierdzenia”: `@Component`
   z logiką, klasy w pakietach funkcyjnych obok maperów). Granicznych nie rozstrzygaj sam — zapytaj.
   Decyzje wpisz w `mapa.json` (`"rola": …, "zatwierdzone": true`); kolejne `zbuduj_mape.py --zachowaj` ich nie nadpisze.
   Gdy użytkownik interesuje się jednym przepływem, pomóż mu zawęzić domenę do klas tego przepływu (np. z
   `entry-flows`/`code-evidence-graph` albo z przebiegu bez mapy) — mniej klas = czytelniejszy rysunek.
4. Graf wywołań służy tylko do poziomów. Wywołań przez lambdę, refleksję i proxy CodeGraph nie widzi — przebieg tak.

## 2. Uruchomienie

- **Java, jednym poleceniem** (w katalogu repo, w terminalu użytkownika albo w tle):
  `node .claude/skills/flow-lens/flow.mjs -- java -jar app.jar` (także `mvn spring-boot:run`, `./gradlew bootRun`).
  Pobiera agenta OTel (raz, do `~/.flow-lens/`), generuje `.flow-lens/otel.properties` z mapy, ustawia
  `JAVA_TOOL_OPTIONS` i otwiera przeglądarkę. Widok startuje „na żywo”.
- **Python / Node (TS)** tak samo: `flow.mjs -- pytest …`, `flow.mjs -- node --import tsx …`, `flow.mjs -- npm test`.
  Spany metod klas z mapy daje wtedy flow-lens (`zrodla/python`, `zrodla/node`), SQL i HTTP — auto-instrumentacja
  OTel, którą trzeba mieć w środowisku aplikacji (pakiety w README; brak = czytelny komunikat).
- **Inna technologia / własne uruchomienie:** `node .claude/skills/flow-lens/flow.mjs` (w tle), a aplikacja z
  auto-instrumentacją OTel swojej technologii i `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`
  (+ `OTEL_BSP_SCHEDULE_DELAY=200`, żeby przebieg był od razu). .NET/Go: widać wejście, SQL i inne systemy,
  bez kroków przez klasy (README: tabela technologii); kroki przez klasy dają: .NET — kopia z wstrzyknięciem, PHP — hak
  `zrodla/php/flowlens.php` (niżej).
- Widok: `http://localhost:7788/_flow/`. Porty: `FLOW_PORT`, `FLOW_OTLP_PORT` (4318 to standardowy port OTLP —
  jeśli zajęty przez kolektor/Jaeger, ustaw inny i ten sam w aplikacji).
- Dodatkowe źródło: `--log app.log` (JSON albo tekst; własny `--wzorzec`; bez trace_id — niżej).
- „Na żywo” = chwilę po zakończeniu requestu (span wychodzi po swoim końcu). Podglądu w trakcie wykonania nie ma.

### Bez OpenTelemetry

Ten sam przebieg i widok, inne źródła. Można je łączyć z OTel (np. log bazy dokłada wartości parametrów do SQL).

- `--log app.log`: logi aplikacji, także bez trace_id. Korelacja: id w linii → wątek + okno requestu →
  samo okno czasu (przypisanie przybliżone).
- `--diag [katalog]`: nasz log diagnostyczny (JSONL `{ev: in|out|sql|tx|log|blad, kor, w, sek, …}`, domyślnie
  `.flow-lens/diag/`). Format: `zrodla/diag.mjs`. flow.mjs czyta log diagnostyczny tylko z `--diag` albo `--bez-otel`
  (bez nich katalog jest pomijany, żeby nie mieszać go ze spanami OTel), więc przy PHP z `FLOWLENS_DIAG` i przy kopii
  C# uruchamiaj flow.mjs z `--diag`. Wstrzykuje go `node flow.mjs wstrzyknij` (w katalogu repo, z mapą):
  git worktree `.flow-lens/diag-worktree` na gałęzi `flowlens-diag` (od HEAD — niezacommitowane zmiany nie wchodzą),
  in/out wokół metod klas z mapy, proxy JDBC na DataSource (SQL z wartościami, BEGIN/COMMIT), repozytoria-interfejsy
  owijane w runtime (Spring). Potem build i testy w kopii (bramka: muszą przejść), aplikacja/testy z kopii, flow-lens
  z `--diag` w repo. Sprzątanie: `node flow.mjs usun-wstrzykniecie`. Java: wstrzyknięcie w źródło (kopia), do tego
  filtr HTTP (granice requestu, status, szablon ścieżki) i praca w tle (SQL bez requestu: @Async, wątki). Jakarta EE
  bez Springa: aplikacja webowa także po `jakarta.jakartaee-api`, DataSource z `<data-source>` w web.xml
  i `@DataSourceDefinition` owijany przez `flowlens.DiagDataSource` (XA i pula z domeny serwera — pominięte z ostrzeżeniem).
  Python i Node: bez zmian w kodzie, `node flow.mjs --bez-otel -- <polecenie>` (Python: sys.monitoring, contextvars,
  łatki SQLAlchemy/Django/psycopg, Starlette/Django/Flask, requests/httpx, smtplib (też podklasy, np. `emails`);
  Node: AsyncLocalStorage, http, pg/mysql2/Prisma, fetch, cron, szablon trasy Fastify, `decorate()` dla klas mapy
  z polem `dekorator`). Pliki: `zrodla/python/flowlens_diag.py`, `zrodla/node/flowlens-diag.cjs` (flow-lens podpina
  Node przez `--require zrodla/node/flowlens(-diag).cjs`, więc działa też `node -r ts-node/register …`; pliki `.mjs`
  to wejście dla `--import`). Funkcje modułów TS/JS (wpis mapy `"modul": true`) owijane tylko w CommonJS.
  C#: wstrzyknięcie w kopię (`using var … = flowlens.Diag.Metoda(…)` na początku metod klas z mapy + `FlowlensDiag.cs`
  z [ModuleInitializer] w najniższym wspólnym projekcie, `FlowlensStart.cs` w wykonywalnym; projekty testowe i rozruch
  — Program/Startup — pomijane): DiagnosticListener ASP.NET Core / EF Core / Npgsql / SqlClient / HttpClient, TransactionScope),
  obraz budowany z kopii; ta sama kopia daje też OTel spany metod (`OTEL_DOTNET_AUTO_TRACES_ADDITIONAL_SOURCES=flowlens.metody`).
  PHP: bez zmian w kodzie, wymaga rozszerzenia `opentelemetry` (PECL). php.ini (np. `conf.d/zz-flowlens.ini`):
  `auto_prepend_file = <skill>/zrodla/php/flowlens.php`, `FLOWLENS_MAPA = <repo>/.flow-lens/mapa.json`,
  `FLOWLENS_DIAG = <repo>/.flow-lens/diag` (wpisy ini, bo `artisan serve` czyści środowisko workerów; zmienne
  środowiskowe też działają). Haki: metody klas z mapy, PDO i mysqli (SQL z wartościami, transakcje), Guzzle, curl_exec, SoapClient, trasa
  routera Laravela i Symfony, procedura JSON-RPC (`rpc.method`), RabbitMQ (ext-amqp). CLI: jedna korelacja na skrypt;
  worker kolejki tylko w granicach jobów; nagłówek `X-Flowlens-Kor` przez Guzzle łączy żądanie do tej samej aplikacji
  z jobem, który je wysłał. Bez `FLOWLENS_DIAG`, z OTel (`OTEL_PHP_AUTOLOAD_ENABLED=true`) ten sam plik daje spany metod klas.
  Serwer wbudowany (`php -S`, `artisan serve`) nie wykonuje `auto_prepend_file` dla routera → `zrodla/php/router.php`
  (`php -S … -t public <skill>/zrodla/php/router.php`; Laravel: zamontuj albo skopiuj jako `<app>/server.php`).
- Java na Payarze/GlassFishu (`asadmin`, `appserver-cli.jar`): serwer ma własne OpenTelemetry, więc flow.mjs sam
  wyłącza most opentelemetry-api agenta (inaczej spany EJB są korzeniami nowych śladów). Mapa zna transakcje kontenera
  EJB (CMT: @Stateless/@MessageDriven REQUIRED domyślnie, @TransactionAttribute), szkielet — widoki JSF `*.xhtml` → beany
  `@Named` i trasy JAX-RS. MDB (onMessage w nowym śladzie) dołączany do konsumenta przy przeliczaniu nagrania.
- Mapa podpowiada to, czego dane nie mówią: rola `zewnetrzne` (klasa-klient innego systemu: RestTemplate/RestClient,
  Kafka, SOAP, requests, axios… — rysowana jako „inny system”), `transakcje` (propagacja REQUIRES_NEW/NESTED, readOnly
  z @Transactional) i `wyjatki` (unchecked/checked). Z tego koniec transakcji, gdy źródło nie widzi rollbacku (OTel):
  reguła Springa — unchecked → ROLLBACK, checked → COMMIT (oznaczone jako wywnioskowane).
- Sprawdzenie na aplikacjach treningowych: `trening/aplikacje/<grupa>/uruchom-tryby.sh` (wszystkie tryby, ten sam
  ruch) i `node trening/sprawdz.mjs przypadki.json …` (tabela przypadek × tryb). Cała runda grupy albo publicznego
  repo z korpusu: `node trening/runda.mjs <grupa>|pub-<nazwa>` (`trening/korpus/publiczne/README.md`).
- Porównanie z wyrocznią OTel: `node trening/porownaj.mjs <nagranie-otel.jsonl> <kandydat.jsonl|katalog diag>`.
- `--log-app app.log`: logi, które aplikacja już pisze, po podniesieniu poziomu kilku loggerów frameworka (lista
  i reguły: `zrodla/log-app.mjs`; Spring Boot: DispatcherServlet, RequestMappingHandlerMapping, JpaTransactionManager
  DEBUG, transaction.interceptor TRACE, Hibernate SQL + bind). Daje wejście, metody @Transactional, SQL z wartościami,
  transakcje (też REQUIRES_NEW). Bez zmian w kodzie. Laravel nie loguje SQL ani transakcji sam — ma zdarzenia; parser
  czyta linie providera, który je loguje (wzór: `trening/aplikacje/php-laravel/app/LogiFrameworka/LogiFrameworkaProvider.php`:
  `sql {sql,bindings,ms}`, `tx begin|commit|rollback {poziom}`, `request start {method,path,akcja}`, `request {…,route,status}`,
  `http client -> {method,url}`, `job start|koniec {job}`, `komenda start|koniec {komenda}`).
  .NET (konsola, `"FormatterName": "simple"` z `SingleLine`, `IncludeScopes`, `TimestampFormat`): poziomy
  `Microsoft.AspNetCore.Hosting.Diagnostics` i `…Mvc.Infrastructure.ControllerActionInvoker` Information,
  `Npgsql.Command` Information i `Npgsql.Transaction` Debug (SQL z parametrami, transakcje — też Dapper, TransactionScope,
  rollback przez Dispose), `Microsoft.EntityFrameworkCore.Database.Command` Information (wartości paczek; jedyne źródło
  SQL przy SqlClient), `System.Net.Http.HttpClient` Information. Korelacja: zakres RequestId. Razor Pages: zakres strony
  („=> /Basket/Index”) i `PageActionInvoker` [105]; „Failed executing DbCommand” [20102] daje krok SQL z błędem.
  Python (`logging`, także loguru i format OTEL_PYTHON_LOG_CORRELATION; runda bierze log bez korelacji, bo bez OTel jej nie ma;
  zalecane `%(thread)d` zamiast `%(threadName)s` — pula AnyIO ma jedną nazwę): `sqlalchemy.engine` (SQL, parametry,
  BEGIN (implicit)/COMMIT/ROLLBACK), `django.db.backends` (SQL z czasem, savepointy, leniwy BEGIN), access log uvicorn /
  werkzeug / django.server (koniec requestu), wątek z nagłówka linii rozdziela requesty. Node: MikroORM w loggerze Nesta
  (`[query] …`, `MIKRO_ORM_DEBUG`), TypeORM (`query: …`), Prisma (`prisma:query`, tylko z `log: ['query']`), knex,
  koa-logger / koa-router (`DEBUG=koa-router`), express (`DEBUG=express:router`), winston z linią requestu, pino
  (Fastify: „incoming request” / „request completed”, z `DEBUG=knex:query,knex:bindings,knex:tx`). Java bez
  Boota: MyBatis (`<pakiet mapperów>=DEBUG`), Stripes (`DispatcherHelper=DEBUG`), Payara `server.log` (ODL) z SQL
  EclipseLink (`eclipselink.logging.level.sql=FINE`, wartości z `eclipselink.logging.parameters=true`) — bez granic
  requestu i transakcji JTA. Czego logi nie dadzą: SQL asyncpg i
  Prismy bez `log`, granic requestu w Nest (brak linii start/koniec → 0 przebiegów) — wtedy log bazy.
- `--szkielet` (+ opcjonalnie `--mozliwe` albo `--miedzy`): przebiegi z niepełnych źródeł uzupełniane klasami ze ścieżek
  CodeGraph między krokami widzianymi w runtime (i repozytorium pod SQL z jego tabelą). Wstawione kroki są „statyczne”.
  `--miedzy`: także wywołania bez dostępu do danych, które w kodzie leżą przed potwierdzonym krokiem albo za ostatnim
  potwierdzonym dzieckiem zakończonego rodzica (`potwierdzony: false`). Daje metody domeny w pamięci (np.
  `Pet.addVisit`) przy mniejszej precyzji: po wyjątku reguła potrafi dołożyć krok, którego nie było. `--mozliwe` dokłada
  wszystkie gałęzie (przerywane), więc precyzja spada mocno.
- `--baza-log docker:<kontener>|<plik>` (+ `--baza-uzytkownik`): SQL, który baza naprawdę wykonała, z parametrami.
  Dla kontenera Postgresa flow.mjs sam włącza `log_min_duration_statement=0`. Parse/bind/execute liczy jako jedno
  zapytanie. MySQL 8 i MariaDB: general log (`SET GLOBAL general_log=1`; MariaDB pisze czas `YYMMDD`, a linie zapytania
  w kilku liniach bez czasu). SQL Server przez Babelfish (log Postgresa: `Query: … duration: X ms`, transakcje z
  komunikatów TDS). Reset połączenia przez pulę (asyncpg: `RESET ALL`, `CLOSE ALL`) nie jest SQL aplikacji.
- `--hybryda` (+ zalecane `--dostep-log <plik|katalog>`): bez żadnego śladu wykonania w kodzie. Szkielet z CodeGraph
  (`python3 mapa/statyczne.py <repo>` → `.flow-lens/statyczne.json`) + SQL z logu bazy. Access log daje granice
  requestu i wejście po ścieżce. Bez niego wejście jest zgadywane po tabelach („≈”). Kroki statyczne z potwierdzonym
  SQL są ciągłą linią, możliwe przerywaną, wywołania zgadnięte (lambda, getBean) mają dopisek. Ścieżka
  z `;jsessionid=…` (postback JSF) jest obcinana jak zapytanie. Linie `php -S` są access logiem tylko w pliku podanym jako
  `--dostep-log` (opcja `phpSerwer`); w logu frameworka nie, bo stoją też w logu Kanboarda i Symfony. Tomcat:
  `server.tomcat.accesslog.pattern=%{begin:yyyy-MM-dd'T'HH:mm:ss.SSSZ}t %m %U %s %{ms}T` (bez `begin:` Tomcat 10.1+
  zapisuje koniec requestu; parser wtedy sam to wykrywa po SQL w oknach, ale `begin:` jest pewne).
  Bez access logu granice requestów daje log frameworka (wejścia HTTP z `--log-app`; na razie w
  `trening/sprawdz.mjs --hybryda <log bazy> <app.log>`, flow.mjs na żywo bierze tylko `--dostep-log`). Z logu frameworka
  przechodzą też status, błąd aplikacji i wysłania do kolejki. Gdy czas linii jest zgadnięty albo z dokładnością do
  sekundy, zapytania dzielone są na odcinki po przerwach i przypisywane do requestów tej sekundy po tabelach (okna
  przybliżone). Log bez wejść HTTP (Nest bez middleware logującego) nie daje granic: jedna zbiorcza przyczyna zamiast
  „brak przebiegu” w każdym przypadku. Kilka wejść na jednej trasie (JSON-RPC, GraphQL): wejście po tabelach okna.

## 3. Adnotacje i rozdziały (pomagasz je pisać)

`<repo>/.flow-lens/adnotacje.json` — przeładowuje się samo:
```json
{ "warstwy": [{ "id": "wyswietlanie", "nazwa": "wyświetlanie danych", "kolor": "#3a86ff" }],
  "na": [{ "cel": "TariffPriceText#describe", "warstwy": ["wyswietlanie"] },
         { "cel": "sql:/price_component/i", "warstwy": ["wyswietlanie"] }],
  "etykiety": [{ "cel": "TariffPriceText", "tekst": "tekst ceny", "link": "../cena/", "warstwa": "wyswietlanie" }],
  "rozdzialy": [{ "tytul": "Kto pyta?", "tekst": "…", "przebieg": "/findTariffs/", "krok": "PrincipalResolver#resolve",
                  "warstwy": ["sql", "uprawnienia"] }] }
```
`"wazne_logi": ["/regex/i", …]` — logi, które uznaliśmy w analizie za ważne, stają się krokami na rysunku.
Pozostałe logi nie są krokami — tylko w konsoli (T), w kolejności czasu. Log z SQL / parametrami (echo ORM) jest
kluczowy zawsze. Cele: `Klasa`, `pkg.Klasa`, `Klasa#metoda`, `sql:/regex/`, `rodzaj:sql|transakcja|zewnetrzne|repozytorium`,
`przebieg:/regex/`. Jedna klasa może mieć kilka warstw (paski w kilku kolorach). Warstwy techniczne w `rozdzialy[].warstwy`:
`wejscia`, `aplikacja`, `domena`, `repozytoria`, `zewnetrzne`, `sql`, `transakcje`, `logi`.

## Co widać

Wiersze: z zewnątrz → wejście → aplikacja → domena (głębiej w wywołaniach = niżej) → repozytoria → baza; inne systemy
z prawej. Bez requestu (test, job) wejściem jest fasada; pętle bez SQL są zwinięte do pierwszego obrotu z „×N”
(powtarzany SQL — nie, N+1 ma być widać).

- **Dwie zakładki** (M przełącza): **przebieg** (jeden request krok po kroku) i **mapa** — kilka requestów na jednym
  rysunku, pełne wykonanie bez kroków i odkrywania. Na mapę: klik na liście albo przeciągnięcie; **sugestie** to
  requesty z największą częścią wspólną (klasy, tabele) z tym, co już jest na mapie (pusta mapa: przez „węzły”).
  Wspólne klasy mają znaczek z kolorami requestów, każdy request ma swój kolor strzałek i obrys transakcji,
  warstwy działają jak w przebiegu. „Tylko wspólne” (W) przygasza to, co należy do jednego requestu; najechanie na
  request w panelu wyróżnia jego ścieżkę; klik w klasę = które requesty tu przechodzą i jakimi metodami/SQL.
- **Lista requestów** (lewy panel, `/` = szukaj): słowa (ścieżka, klasa, tabela, status, tekst logu) i filtry
  `sql>20`, `kroki>100`, `ms>50`, `http`, `job`, `n+1`, `blad`. ↑/↓ chodzą po przefiltrowanej liście.
- **←/→ tylko w obrębie requestu** — na jego końcu nic się nie dzieje (bez przeskoku i zapętlania).
- **Transakcje** to obszar przez kilka klas, warstw i bazę: od wejścia do metody @Transactional przez proxy
  (wołający jest poza), od BEGIN do COMMIT, albo od pierwszego dostępu do bazy do commitu ORM (start przybliżony).
  Dołączenie do trwającej (REQUIRED) i krok na innym wątku („poza transakcją”) są oznaczone.
- **Warstwy w kategoriach** (nagłówek kategorii zwija/rozwija; zwinięta = licznik i kropki): architektura
  (wejścia, aplikacja, domena, repozytoria, inne systemy — każda wyłączalna, domyślnie włączone; ukryta część znika,
  strzałki idą od najbliższej widocznej klasy), baza danych (SQL, transakcje), logi (kluczowe), ocena (adnotacje).
  Włączenie warstwy, która potrzebuje wyłączonej części architektury (SQL z repozytorium, transakcja przez domenę,
  ocena zaznaczająca klasę), włącza ją samo — z powodem w stopce.
- **Składowe kroku:** to, co dzieje się nad krokiem w tej samej chwili (proxy, aspekt), nie jest osobnym krokiem —
  np. wejście do metody @Transactional ma znaczek „TX start” albo „TX dołącza”. Widać je tylko przy włączonej warstwie
  (transakcje); opis w „dlaczego” i w szczegółach kroku. Druga składowa: **wywołania wewnętrzne** — metody klasy
  wołane przez this, które nie wychodzą poza klasę (bez SQL, innych klas, ostrzeżeń), są zebrane w kroku, który do
  niej wszedł („+3 wewn.”, „wewnątrz: describeComponents(), price()”). Przez this z SQL albo z ostrzeżeniem — krok.
  Mapa: `"zwijaj_wewnetrzne": false` wyłącza.
- Spacja auto, 1–9 warstwy, O odkrywanie, T konsola (logi i SQL do bieżącego miejsca), PgUp/PgDn rozdziały,
  R przelicz nagranie z bieżącą mapą, klik = szczegóły. Licznik ×N przy śladzie = kandydat na N+1.

## Uczenie się: tylko z wyroczni OTel albo z potwierdzenia człowieka

Po pokazaniu przebiegów w nowym repo zapytaj użytkownika, czy mają sens (klasy, SQL, transakcje zgodne z tym, co wie
o systemie), i zapisz odpowiedź:
`node .claude/skills/flow-lens/potwierdz.mjs <repo> --tryb <otel|diag|log_app|hybryda> --ocena ok|czesciowo|zle --uwaga "…"`.
Zapis jest lokalny (`~/.flow-lens/doswiadczenia.json`), bo nazwy repo bywają poufne; rozpoznanie pokazuje go przy
podobnych stosach.

Zmieniaj reguły, parsery, mapę i katalog wiedzy tylko na podstawie:
1. **pomiaru względem niezależnej wyroczni OTel** (`trening/porownaj.mjs`: ścieżka, klasy, SQL, transakcje) — gdy
   OTel w tym stosie jest pełny. Nie jest niezależna w .NET („OTel + metody z kopii” używa tego samego wstrzyknięcia)
   i tam, gdzie OTel ma znane dziury (MyBatis, zapytania strumieniowe mysql2, smtplib) — tam potrzebny człowiek;
2. **potwierdzenia człowieka** (wyżej).

Oczekiwania spisane przez agenta (np. `przypadki.json` w korpusie) to hipotezy: dobre do wskazania rozbieżności,
ale nie są podstawą zmiany, dopóki człowiek ich nie potwierdzi. Nie poprawiaj wyroczni, żeby zgadzała się
z oczekiwaniami — zgłoś to człowiekowi. Doświadczenia z korpusu: `node trening/doswiadczenia.mjs`
(→ `wiedza/doswiadczenia.json`, same miary względem OTel).

## Prywatność

Nagrania (`~/.flow-lens/przebiegi/`) mają pełny SQL z literałami i treść logów — to dane z bazy. Na sali „tryb
pokazowy” (P). Przed udostępnieniem: `node .claude/skills/flow-lens/oczysc.mjs <we> <wy> --sql`.

## Testy

`node --test .claude/skills/flow-lens/testy/*.test.mjs`, `python3 -m unittest discover -s .claude/skills/flow-lens/mapa/testy`,
`http://localhost:7788/_flow/testy.html` (niezmienniki sceny w przeglądarce, `window.WYNIK_TESTOW`).

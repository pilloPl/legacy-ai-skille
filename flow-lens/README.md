# flow-lens

Którędy jeden request (job, wiadomość, wywołanie fasady z testu) naprawdę idzie przez aplikację — krok po kroku,
tylko przez klasy, które nas interesują, od wejścia do bazy. Dane z działającej aplikacji (OpenTelemetry i inne
źródła), widok w przeglądarce, przebieg pojawia się chwilę po requeście.

```
źródła ──► zdarzenia ──► filtr + atrybucja (mapa) ──► przebieg ──► widok
OTLP protobuf/JSON         klasy spoza mapy zwinięte,     kroki: wejście, klasa,
plik logu (trace_id)       ich SQL i logi idą do          repozytorium, SQL,
spany metod (Python/Node)  najbliższej klasy z mapy;      transakcja, inny system,
                           pętle bez SQL zwinięte ×N      składowe (np. TX start); logi przy kroku
```

## Szybki start (Java)

```bash
cd <repo>
codegraph init .                                                   # raz: indeks kodu
python3 .claude/skills/flow-lens/mapa/zbuduj_mape.py .           # mapa + propozycja.md do przejrzenia
node .claude/skills/flow-lens/flow.mjs -- java -jar target/app.jar   # albo ./mvnw spring-boot:run, ./gradlew bootRun
```

Pierwsze uruchomienie pobiera agenta OpenTelemetry (`~/.flow-lens/`). flow-lens generuje `.flow-lens/otel.properties`
z mapy (lista metod klas wejścia, aplikacji i domeny), ustawia `JAVA_TOOL_OPTIONS` i otwiera widok.

## Technologie

| | jak uruchomić | wejście, SQL, inne systemy | kroki przez klasy domenowe | sprawdzone na |
|---|---|---|---|---|
| **Java** | `flow.mjs -- java …` / `mvn` / `gradle` | agent OTel | agent OTel (`methods.include` z mapy), także przez `this` | campsite-power (HTTP), dd-java (testy) |
| **Python** | `flow.mjs -- python …` / `pytest` / `uvicorn` | auto-instrumentacja OTel | `zrodla/python` (sys.setprofile) | dd-python (testy) |
| **Node / TS** | `flow.mjs -- node …` / `npm test` / `npx tsx …` | auto-instrumentacja OTel | `zrodla/node` (hook ładowania modułów) | dd-typescript (testy) |
| **.NET** | aplikacja z auto-instrumentacją OTel → `:4318` | auto-instrumentacja OTel | brak (mapa działa; potrzebny startup hook albo ActivitySource) | mapa: dd-csharp |
| **PHP, Ruby, Go, …** | aplikacja z OTel → `:4318` | jeśli jest auto-instrumentacja | brak | — |

Python — w środowisku aplikacji:
`pip install opentelemetry-distro opentelemetry-exporter-otlp-proto-http && opentelemetry-bootstrap -a install`.
Node — w projekcie: `npm i -D @opentelemetry/api @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-proto`.

Testcontainers na Docker Desktop (Python): `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.

## Mapa

`<repo>/.flow-lens/mapa.json` — role klas (wejście, aplikacja, domena, repozytorium, pomiń), poziomy, metody,
metody `@Transactional`. Reguły: `mapa/reguly/<technologia>.py` (java, spring, python, typescript, csharp;
nowa = kopia `_szablon.py`). Decyzje zatwierdzone ręcznie (`"zatwierdzone": true`) zostają przy `--zachowaj`.
Opcje: `pomin_sciezki` (regexy wejść do pominięcia), `zwijaj_powtorzenia` (domyślnie tak),
`korzenie_domenowe` (przebieg także z samego obiektu domenowego — domyślnie nie).

## Adnotacje

`<repo>/.flow-lens/adnotacje.json` — nasze warstwy-kolory, etykiety z linkami i rozdziały (opis w SKILL.md).
Przykład: `przyklady/campsite-taryfy.adnotacje.json`.

## Pliki

| | |
|---|---|
| `flow.mjs` | serwer: OTLP (`:4318`), widok (`:7788/_flow/`), SSE, nagrania, tryb z komendą |
| `zrodla/otlp.mjs` | dekoder OTLP protobuf i JSON (bez zależności) |
| `zrodla/log-tekst.mjs` | plik logu z trace_id (tekst / JSON) |
| `zrodla/python/`, `zrodla/node/` | spany metod klas z mapy |
| `przebieg.mjs` | filtr i atrybucja, zwijanie pętli, zbieracz na żywo |
| `mapa/` | mapa z CodeGraph + reguły per technologia, konfiguracja agenta Javy |
| `widok/` | silnik nawigacji skopiowany z harness-lens, scena pionowa z przewijaniem |
| `przyklady/` | nagrania: campsite-power (HTTP + adnotacje), DomainDrivers w Javie, Pythonie, TS |
| `oczysc.mjs` | anonimizacja nagrań (`--sql`: literały w SQL i liczby w logach) |

// Z mapy robi konfigurację agenta OpenTelemetry dla Javy (otel.properties) i zmienne środowiskowe dla
// pozostałych technologii. Agent instrumentuje wtedy tylko metody klas z mapy — szum nie powstaje.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const WERSJA_AGENTA = "2.21.0";
export const AGENT_JAR = path.join(os.homedir(), ".flow-lens", "opentelemetry-javaagent.jar");
export const URL_AGENTA = `https://repo1.maven.org/maven2/io/opentelemetry/javaagent/opentelemetry-javaagent/${WERSJA_AGENTA}/opentelemetry-javaagent-${WERSJA_AGENTA}.jar`;
const INSTRUMENTOWANE = new Set(["wejscie", "aplikacja", "domena", "zewnetrzne"]);
const WPIS = /^[\w.$]+\[\w+(,\w+)*\]$/;

// Jeden błędny wpis unieważnia u agenta całą listę — każdy sprawdzamy jego regułą.
export function include(mapa) {
  const czesci = [], odrzucone = [];
  for (const [fq, k] of Object.entries(mapa?.klasy || {}).sort()) {
    // repozytoria-interfejsy (Spring Data) mają własną instrumentację agenta; klasy DAO (JdbcTemplate, JDBC) — nie
    const daoKlasa = k.rola === "repozytorium" && !k.interfejs;
    if ((!INSTRUMENTOWANE.has(k.rola) && !daoKlasa) || !k.metody?.length) continue;
    const w = `${fq}[${k.metody.join(",")}]`;
    (WPIS.test(w) ? czesci : odrzucone).push(w);
  }
  return { include: czesci.join(";"), odrzucone };
}

// Zmienne OTEL_* — standard dla każdej technologii z OpenTelemetry (Java, .NET, Python, Node, PHP, Ruby, Go).
export function srodowisko({ port, nazwa }) {
  return {
    OTEL_SERVICE_NAME: nazwa || "aplikacja",
    OTEL_EXPORTER_OTLP_ENDPOINT: `http://localhost:${port}`,
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
    OTEL_TRACES_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_METRICS_EXPORTER: "none",
    // krótka wysyłka partiami: przebieg pojawia się ułamek sekundy po requeście
    OTEL_BSP_SCHEDULE_DELAY: "200",
    OTEL_BLRP_SCHEDULE_DELAY: "200",
  };
}

export function wlasciwosci(mapa, { port, nazwa }) {
  const env = srodowisko({ port, nazwa: nazwa || mapa?.projekt });
  const linie = ["# wygenerowane przez flow-lens z mapy — nie edytuj, zmieniaj mapę"];
  for (const [k, v] of Object.entries(env)) linie.push(`${k.toLowerCase().replace(/_/g, ".")}=${v}`);
  // pełny SQL z literałami (dane lokalne, szkoleniowe; do pokazywania cudzych danych — tryb pokazowy)
  linie.push("otel.instrumentation.common.db-statement-sanitizer.enabled=false");
  // commit/rollback na połączeniu JDBC jako spany (ręczne transakcje w DAO; domyślnie agent ich nie pokazuje)
  linie.push("otel.instrumentation.jdbc.experimental.transaction.enabled=true");
  const { include: inc } = include(mapa);
  if (inc) linie.push(`otel.instrumentation.methods.include=${inc}`);
  return linie.join("\n") + "\n";
}

export function zapiszWlasciwosci(mapa, plik, opcje) {
  fs.mkdirSync(path.dirname(plik), { recursive: true });
  fs.writeFileSync(plik, wlasciwosci(mapa, opcje));
  return plik;
}

// czy komenda uruchamia JVM (java, mvn, gradle, ./mvnw, *.jar) — wtedy dokładamy -javaagent przez JAVA_TOOL_OPTIONS
export const toJava = (polecenie, argumenty = []) =>
  /^(java|mvn|mvnw|gradle|gradlew|sbt|kotlin)(\.exe|\.cmd|\.bat)?$/i.test(path.basename(polecenie)) || argumenty.some(a => a.endsWith(".jar"));

// Python: auto-instrumentacja OTel (biblioteki) + nasze spany metod klas z mapy (zrodla/python/sitecustomize.py)
export const toPython = (polecenie, argumenty = []) =>
  /^(python[\d.]*|pytest|py\.test|poetry|uv|uvicorn|gunicorn|hypercorn|flask|django-admin|celery)(\.exe)?$/i.test(path.basename(polecenie))
  || argumenty.some(a => a.endsWith(".py"));

export function srodowiskoPythona(katalogZrodel, plikMapy, env = process.env) {
  return {
    // katalog roboczy też (jak opentelemetry-instrument): sitecustomize startuje instrumentację, zanim Python doda
    // katalog skryptu do sys.path — inaczej np. Django nie znajdzie modułu ustawień i przejdzie na domyślne
    PYTHONPATH: [path.join(katalogZrodel, "python"), process.cwd(), env.PYTHONPATH].filter(Boolean).join(path.delimiter),
    ...(plikMapy && fs.existsSync(plikMapy) ? { FLOWLENS_MAPA: plikMapy } : {}),
    OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED: "true",
    OTEL_PYTHON_LOG_CORRELATION: "true",
  };
}

// Node / TypeScript: auto-instrumentacja OTel + owijanie metod klas z mapy (zrodla/node/flowlens.mjs przez --import)
export const toNode = (polecenie, argumenty = []) =>
  /^(node|npm|npx|pnpm|yarn|tsx|ts-node|bun|nodemon)(\.exe|\.cmd)?$/i.test(path.basename(polecenie))
  || argumenty.some(a => /\.(m|c)?[jt]s$/.test(a));

// bezOtel: zamiast OTel log diagnostyczny (flowlens-diag.cjs) do katalogu FLOWLENS_DIAG.
// --require, nie --import: samo --import przełącza wejście aplikacji na loader ESM, a ten nie zna .ts ładowanego
// przez require-hook (node -r ts-node/register, ts-node, @babel/register). Hooki ESM (module.register) i tak
// rejestruje nasz plik, więc aplikacje ESM / tsx działają tak samo.
export function srodowiskoNode(katalogZrodel, plikMapy, env = process.env, { bezOtel = null } = {}) {
  const plik = path.join(katalogZrodel, "node", bezOtel ? "flowlens-diag.cjs" : "flowlens.cjs");
  const imp = `--require ${/[\s"]/.test(plik) ? JSON.stringify(plik) : plik}`;
  if (bezOtel) return { NODE_OPTIONS: [env.NODE_OPTIONS, imp].filter(Boolean).join(" "), FLOWLENS_DIAG: bezOtel, ...(plikMapy && fs.existsSync(plikMapy) ? { FLOWLENS_MAPA: plikMapy } : {}) };
  return {
    NODE_OPTIONS: [env.NODE_OPTIONS, imp].filter(Boolean).join(" "),
    ...(plikMapy && fs.existsSync(plikMapy) ? { FLOWLENS_MAPA: plikMapy } : {}),
    OTEL_NODE_RESOURCE_DETECTORS: "env,host",
  };
}

// flow-lens (Node / TypeScript): auto-instrumentacja OpenTelemetry (pg, mysql, http, …) + spany metod klas z mapy.
//
// Auto-instrumentacja w Node daje biblioteki, ale nie metody naszych klas. Hook ładowania modułów (hook.mjs)
// i Module.prototype._compile dopisują na końcu pliku z klasami z mapy jedno wywołanie, które owija ich metody
// w spany (code.namespace = klasa z mapy). Funkcje modułu („klasa-moduł”) — przez module.exports (tylko CommonJS)
// i przez podmianę wiązań funkcji najwyższego poziomu (także nieeksportowanych, dopisek.cjs).
// Joby cron / node-cron: każde odpalenie to span-korzeń „cron <wyrażenie>” (flowlens.wejscie = job).
// Plik CommonJS (ładowanie synchroniczne): działa z --require (aplikacja CJS z require-hookiem: ts-node,
// @babel/register — --import przełączyłby wejście na loader ESM, który nie zna .ts) i z --import (flowlens.mjs).
// Włączane przez NODE_OPTIONS="--require <ten plik>" i FLOWLENS_MAPA — flow.mjs robi to sam przy
// `node flow.mjs -- node …` / `npm test` / `npx tsx …`. W aplikacji muszą być pakiety OTel (wersje sprawdzone
// z Prismą 4/5, której instrumentacja nie działa z SDK 2.x):
//   npm i -D @opentelemetry/api@1.9.0 @opentelemetry/auto-instrumentations-node@0.56.1 @opentelemetry/exporter-trace-otlp-proto@0.57.2
"use strict";
const Module = require("node:module");
const { register, createRequire } = Module;
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");
const { zDopiskiem } = require("./dopisek.cjs");

if (!globalThis.__flowlensOtel) {                                   // raz na proces (--require i --import naraz)
globalThis.__flowlensOtel = true;
const mapaPlik = process.env.FLOWLENS_MAPA;
const zAplikacji = createRequire(path.join(process.cwd(), "flowlens-szukaj.js"));
const INSTALACJA = "npm i -D @opentelemetry/api@1.9.0 @opentelemetry/auto-instrumentations-node@0.56.1 @opentelemetry/exporter-trace-otlp-proto@0.57.2";

// Prisma < 6 tworzy spany silnika (prisma:engine:db_query — jedyne z SQL) przez sdk-trace-base 1.x
// (tracer.getActiveSpanProcessor), którego SDK 2.x nie ma: bez ostrzeżenia wyrocznia po cichu nie ma SQL
function ostrzezeniePrismy(wPrismy, wSdk) {
  const glowna = s => (s ? Number(String(s).match(/\d+/)?.[0] ?? NaN) : NaN);
  const prisma = glowna(wPrismy), sdk = glowna(wSdk);
  return prisma < 6 && sdk >= 2
    ? `flow-lens: @prisma/client ${prisma}.x z @opentelemetry/sdk-trace-base ${sdk}.x — spany silnika Prismy (SQL) nie powstaną. ` +
      `Przypnij SDK 1.x: ${INSTALACJA} @prisma/instrumentation@${prisma}`
    : null;
}
// wersja pakietu widziana z aplikacji albo z łańcucha zależności (sdk-trace-base bywa zagnieżdżony pod sdk-node)
function wersja(nazwa, ...lancuch) {
  let r = zAplikacji;
  for (const krok of [null, ...lancuch]) {
    try {
      if (krok) r = createRequire(r.resolve(krok));
      let d = path.dirname(r.resolve(nazwa));
      while (!fs.existsSync(path.join(d, "package.json")) && path.dirname(d) !== d) d = path.dirname(d);
      return JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8")).version;
    } catch {}
  }
  return null;
}

let api = null;
try {
  // import-in-the-middle: biblioteki ładowane przez ESM też dostaną instrumentację
  try { register(pathToFileURL(zAplikacji.resolve("@opentelemetry/instrumentation/hook.mjs")).href, pathToFileURL(process.cwd() + "/")); } catch {}
  zAplikacji("@opentelemetry/auto-instrumentations-node/register");
  api = zAplikacji("@opentelemetry/api");
  // Prisma 5/6: SQL idzie przez silnik Prismy, nie przez pg — potrzebna jej własna instrumentacja (jeśli jest w aplikacji)
  try {
    const { PrismaInstrumentation } = zAplikacji("@prisma/instrumentation");
    const { registerInstrumentations } = zAplikacji("@opentelemetry/instrumentation");
    registerInstrumentations({ instrumentations: [new PrismaInstrumentation()] });
  } catch {}
  const o = ostrzezeniePrismy(wersja("@prisma/client"), wersja("@opentelemetry/sdk-trace-base", "@opentelemetry/auto-instrumentations-node", "@opentelemetry/sdk-node"));
  if (o) console.error(o);
} catch (e) {
  console.error(`flow-lens: brak OpenTelemetry w aplikacji (${String(e.message).split("\n")[0]}). Zainstaluj: ${INSTALACJA}`);
}

// obietnica leniwa (PrismaPromise, query builder knex/TypeORM): wykonuje się dopiero przy .then — nie wolno jej
// dotykać (zapytanie poszłoby poza batch $transaction) ani podmieniać (batch wymaga oryginału)
const leniwa = r => r?.[Symbol.toStringTag] === "PrismaPromise" || typeof r?.requestTransaction === "function" || typeof r?.toSQL === "function" || typeof r?.getQuery === "function";
// wrapper metody przejmuje metadane oryginału: Nest/TypeORM/class-validator trzymają je na samej funkcji
// (Reflect.defineMetadata(PATH_METADATA, …, metoda)) — bez tego trasy znikają (404)
function przenies(z, na) {
  try { const R = globalThis.Reflect; if (R?.getMetadataKeys) for (const k of R.getMetadataKeys(z)) R.defineMetadata(k, R.getMetadata(k, z), na); } catch {}
  for (const k of [...Object.getOwnPropertyNames(z), ...Object.getOwnPropertySymbols(z)])
    if (!["prototype", "arguments", "caller"].includes(k)) try { Object.defineProperty(na, k, Object.getOwnPropertyDescriptor(z, k)); } catch {}
  return na;
}
// owinięte klasy i moduły w WeakSet, nie we własności: biblioteki wyliczające własności klasy
// (koa-swagger-decorator: getOwnPropertyNames → „metody statyczne”) nie mogą zobaczyć znacznika
const owiniete = new WeakSet();
const raz = o => (!o || owiniete.has(o) ? false : (owiniete.add(o), true));

// mysql2: query / execute bez pustych argumentów na końcu (opis przy latki.mysql2); własność prototypu Connection
// przesłania metodę bazowego prototypu owiniętą przez instrumentację, więc instrumentacja widzi już krótsze wywołanie
function bezPustychArgumentow(proto) {
  for (const n of ["query", "execute"]) {
    const f = proto[n];
    if (typeof f !== "function") continue;
    Object.defineProperty(proto, n, { configurable: true, writable: true, value: function (...a) {
      while (a.length > 1 && a.at(-1) === undefined) a.pop();
      return f.apply(this, a);
    } });
  }
}
let owin = null;                                                   // span metody na obiekcie (z bloku OTel niżej)
if (api) {
  const tracer = api.trace.getTracer("flowlens.metody");
  const wSpanie = (nazwa, atrybuty, fn, opcje = {}) => tracer.startActiveSpan(nazwa, { attributes: atrybuty, ...opcje }, span => {
    const blad = e => { span.setStatus({ code: api.SpanStatusCode.ERROR, message: String(e?.name || e) }); span.end(); throw e; };
    let r;
    try { r = fn(); } catch (e) { blad(e); }
    if (r && typeof r.then === "function" && !leniwa(r)) return r.then(v => { span.end(); return v; }, blad);
    span.end();
    return r;
  });
  owin = (cel, m, fqn, krotka) => {
    const d = cel && Object.getOwnPropertyDescriptor(cel, m);
    if (!d || typeof d.value !== "function" || (!d.writable && !d.configurable)) return;
    const fn = d.value;
    Object.defineProperty(cel, m, { ...d, value: przenies(fn, function (...a) {
      return wSpanie(`${krotka}.${m}`, { "code.namespace": fqn, "code.function": m }, () => fn.apply(this, a));
    }) });
  };
  globalThis.__flowlensOwin = (klasa, fqn, metody) => {
    if (typeof klasa !== "function" || !raz(klasa)) return;
    for (const m of metody) for (const cel of [klasa.prototype, klasa]) owin(cel, m, fqn, klasa.name);
  };
  globalThis.__flowlensOwinModul = (eksporty, fqn, metody) => {
    if (!eksporty || (typeof eksporty !== "object" && typeof eksporty !== "function") || !raz(eksporty)) return;
    for (const m of metody) owin(eksporty, m, fqn, fqn.split(".").pop());
  };
  // funkcja modułu przez wiązanie lokalne (dopisek.cjs: także nieeksportowane) — zwraca owiniętą
  globalThis.__flowlensOwinFunkcje = (fn, fqn, nazwa) => {
    if (typeof fn !== "function" || owiniete.has(fn)) return fn;
    const krotka = fqn.split(".").pop();
    const w = przenies(fn, function (...a) { return wSpanie(`${krotka}.${nazwa}`, { "code.namespace": fqn, "code.function": nazwa }, () => fn.apply(this, a)); });
    owiniete.add(w);
    return w;
  };

  // joby: nowy trace na każde odpalenie (timer dziedziczy kontekst miejsca, gdzie go założono)
  const job = (nazwa, fn) => wSpanie(nazwa, { "flowlens.wejscie": "job", "messaging.destination.name": nazwa }, fn, { root: true, kind: api.SpanKind.INTERNAL });
  const latki = {
    // instrumentacja mysql2 kończy span zapytania bez callbacku (strumień) tylko przy wywołaniu z jednym argumentem;
    // knex woła connection.query(opcje, undefined).stream() — span nie kończył się i SELECT eksportu znikał z wyroczni.
    // Puste argumenty na końcu nic nie zmieniają w mysql2 (values undefined), więc je obcinamy przed instrumentacją
    mysql2(m) { const proto = m?.Connection?.prototype; if (raz(proto)) bezPustychArgumentow(proto); },
    cron(m) {
      const proto = m?.CronJob?.prototype;
      if (typeof proto?.fireOnTick !== "function" || !raz(proto)) return;
      const f = proto.fireOnTick;
      proto.fireOnTick = function () { return job(`cron ${this.cronTime?.source ?? ""}`.trim(), () => f.apply(this, arguments)); };
    },
    "node-cron"(m) {
      const cel = m?.schedule ? m : m?.default;
      if (typeof cel?.schedule !== "function" || !raz(cel)) return;
      const f = cel.schedule;
      cel.schedule = function (wyrazenie, fn, ...reszta) {
        const owinieta = typeof fn === "function" ? function () { return job(`cron ${wyrazenie}`, () => fn.apply(this, arguments)); } : fn;
        return f.call(this, wyrazenie, owinieta, ...reszta);
      };
    },
  };
  const ladowanie = Module._load;
  Module._load = function (zadanie) {
    const m = ladowanie.apply(this, arguments);
    if (Object.hasOwn(latki, zadanie)) try { latki[zadanie](m); } catch {}
    return m;
  };
  for (const n of Object.keys(latki)) try { latki[n](zAplikacji(n)); } catch {}
}

if (api && mapaPlik && fs.existsSync(mapaPlik)) {
  const mapa = JSON.parse(fs.readFileSync(mapaPlik, "utf8"));
  const repo = path.dirname(path.dirname(path.resolve(mapaPlik)));        // <repo>/.flow-lens/mapa.json
  const pliki = {};
  const prawdziwa = p => { try { return fs.realpathSync(p); } catch { return p; } };
  for (const [fqn, k] of Object.entries(mapa.klasy || {})) {
    if (!["wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"].includes(k.rola) || !k.metody?.length || !k.plik) continue;
    const plik = path.join(repo, k.plik.replace(/:\d+$/, ""));
    // TS skompilowany do dist/ (Nest, tsc): ten sam plik z .js w katalogu wyjściowym
    for (const p of [plik, plik.replace(/\/src\//, "/dist/").replace(/\.ts$/, ".js"), plik.replace(/\/src\//, "/dist/src/").replace(/\.ts$/, ".js")].map(prawdziwa))
      (pliki[p] ||= []).push({ nazwa: k.nazwa, fqn, metody: k.metody.filter(m => m !== "constructor"), ...(k.modul || k.rodzaj === "modul" ? { modul: true } : {}) });
  }
  // Fastify: obiekty i funkcje z decorate / decorateRequest / decorateReply, gdy mapa ma ich klasę z polem „dekorator”
  // (nazwa z decorate) — jak w flowlens-diag.cjs; instancja ogłasza się w kanale „fastify.initialization”
  const dekoratory = new Map(Object.entries(mapa.klasy || {}).filter(([, k]) => typeof k.dekorator === "string" && k.metody?.length
    && ["wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"].includes(k.rola)).map(([fqn, k]) => [k.dekorator, { fqn, metody: k.metody }]));
  const owinDekorator = (nazwa, wartosc) => {
    const k = dekoratory.get(nazwa);
    if (!k || wartosc == null) return wartosc;
    if (typeof wartosc === "function") return globalThis.__flowlensOwinFunkcje(wartosc, k.fqn, nazwa);
    if (typeof wartosc === "object" && typeof wartosc.getter !== "function" && raz(wartosc))
      for (const m of k.metody) owin(wartosc, m, k.fqn, k.fqn.split(".").pop());
    return wartosc;
  };
  if (dekoratory.size) try {
    require("node:diagnostics_channel").subscribe("fastify.initialization", ({ fastify: f }) => {
      if (!f || !raz(f)) return;
      for (const n of ["decorate", "decorateRequest", "decorateReply"]) {
        const d = f[n];
        if (typeof d === "function") f[n] = function (nazwa, wartosc, ...reszta) { return d.call(this, nazwa, owinDekorator(nazwa, wartosc), ...reszta); };
      }
    });
  } catch {}
  register("./hook.mjs", pathToFileURL(__filename), { data: { pliki } });       // ESM (także tsx)
  const kompiluj = Module.prototype._compile;                                     // CommonJS (Nest/tsc → dist/)
  Module.prototype._compile = function (tresc, nazwa) {
    const k = pliki[nazwa] || pliki[prawdziwa(nazwa)];
    return kompiluj.call(this, k ? zDopiskiem(tresc, k) : tresc, ...[...arguments].slice(1));
  };
  if (process.env.FLOWLENS_GADATLIWY) console.error(`flow-lens: spany metod dla ${Object.values(pliki).flat().length} klas z mapy`);
}
module.exports = { ostrzezeniePrismy, bezPustychArgumentow };
}

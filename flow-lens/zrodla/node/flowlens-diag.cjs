// flow-lens (Node / TypeScript) bez OpenTelemetry: log diagnostyczny (format zrodla/diag.mjs).
//
// Wstrzyknięcie w runtime, bez zmian w kodzie i bez pakietów OTel:
// - metody klas z mapy: dopisek na końcu pliku (hook ładowania ESM + Module.prototype._compile dla CommonJS,
//   np. Nest skompilowany do dist/); funkcje modułu („klasa-moduł” w mapie) — CommonJS przez module.exports
//   (TS → CJS przepisuje wywołania eksportowanych funkcji na (0, exports.f)(…), więc łapiemy też wywołania w module),
//   a funkcje najwyższego poziomu (także nieeksportowane, także ESM) przez podmianę ich wiązania (dopisek.cjs);
// - kor i bieżące wywołanie: AsyncLocalStorage; każde wywołanie ma id i rodzica, bo jeden request robi kilka rzeczy
//   naraz (Promise.all) i zwykły stos by się przeplatał;
// - granice requestu: serwer http (szablon ścieżki: Express/Nest — req.baseUrl + req.route.path w chwili dopasowania
//   trasy, Koa — ctx._matchedRoute z @koa/router / koa-router, Fastify — req.routeOptions.url); obiekty z
//   fastify.decorate, gdy mapa ma ich klasę z polem „dekorator”;
// - joby: cron (CronJob.fireOnTick), node-cron (schedule) — każde odpalenie to osobne wejście „job”;
// - SQL i transakcje: sterowniki pg i mysql2 (TypeORM, knex, Sequelize, Kysely idą przez nie), Prisma przez zdarzenia „query”;
//   z id połączenia (db.pid), żeby SQL z innego połączenia puli nie wchodził do otwartej transakcji;
// - inne systemy: fetch, http.request / https.request (axios).
// Plik CommonJS, żeby działał z --require (aplikacja CJS z require-hookiem: ts-node, @babel/register — --import
// przełączyłby wejście na loader ESM, który nie zna .ts) i z --import (przez flowlens-diag.mjs).
// Włączane: NODE_OPTIONS="--require <ten plik>", FLOWLENS_MAPA, FLOWLENS_DIAG=<katalog>.
"use strict";
const Module = require("node:module");
const { register, createRequire } = Module;
const { pathToFileURL } = require("node:url");
const { AsyncLocalStorage } = require("node:async_hooks");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { zDopiskiem } = require("./dopisek.cjs");

if (!globalThis.__flowlensDiag) {                                   // raz na proces (--require i --import naraz)
globalThis.__flowlensDiag = true;
const KATALOG = process.env.FLOWLENS_DIAG;
const MAPA = process.env.FLOWLENS_MAPA;
const als = new AsyncLocalStorage();
let sek = 0, kory = 0, idy = 0;
const T0 = Date.now(), N0 = process.hrtime.bigint();
const teraz = () => +(T0 + Number(process.hrtime.bigint() - N0) / 1e6).toFixed(3);
let plik = null;

function pisz(z) {
  try {
    if (!plik) { fs.mkdirSync(KATALOG, { recursive: true }); plik = path.join(KATALOG, `${process.pid}.jsonl`); }
    fs.appendFileSync(plik, JSON.stringify(z) + "\n");
  } catch {}
}
const zd = (ev, pola, st = als.getStore()) => ({ v: 1, ts: teraz(), pid: process.pid, w: "main", kor: st?.kor ?? null, sek: ++sek, ev, ...(st?.id != null ? { rodzic: st.id } : {}), ...pola });

// wywołanie w nowym kontekście (kor dziedziczony albo nowy na wejściu do aplikacji)
function wywolanie(klasa, metoda, fn, wejscie = null) {
  const st = als.getStore();
  const nowy = !st?.kor;
  const kor = nowy ? `k-${process.pid}-${++kory}` : st.kor;
  const id = ++idy;
  pisz({ ...zd("in", { klasa, metoda, id, ...(nowy ? { wejscie: wejscie || { rodzaj: "wywolanie", nazwa: `${klasa.split(".").pop()}.${metoda}` } } : {}) }), kor });
  return als.run({ kor, id }, () => {
    const koniec = (blad, reszta = {}) => pisz({ ...zd("out", { klasa, metoda, id, ...(blad ? { blad } : {}), ...reszta }, { kor, id: st?.id }), kor });
    let r;
    try { r = fn(); } catch (e) { koniec(opis(e)); throw e; }
    if (r && typeof r.then === "function" && !leniwa(r)) return r.then(v => { koniec(); return v; }, e => { koniec(opis(e)); throw e; });
    koniec();
    return r;
  });
}
// job: zawsze nowy kor — timer dziedziczy kontekst miejsca, gdzie go założono (np. request, który wystartował job)
const job = (nazwa, fn) => als.run({}, () => wywolanie("job", nazwa, fn, { rodzaj: "job", nazwa }));
// obietnica leniwa (PrismaPromise, query builder knex/TypeORM): wykonuje się dopiero przy .then — nie wolno jej
// dotykać (zapytanie poszłoby poza batch $transaction) ani podmieniać (batch wymaga oryginału)
const leniwa = r => r?.[Symbol.toStringTag] === "PrismaPromise" || typeof r?.requestTransaction === "function" || typeof r?.toSQL === "function" || typeof r?.getQuery === "function";
const opis = e => `${e?.name || "Error"}: ${e?.message || e}`.slice(0, 300);

// wrapper metody przejmuje metadane oryginału: Nest/TypeORM/class-validator trzymają je na samej funkcji
// (Reflect.defineMetadata(PATH_METADATA, …, metoda)) — bez tego trasy znikają (404)
function przenies(z, na) {
  try { const R = globalThis.Reflect; if (R?.getMetadataKeys) for (const k of R.getMetadataKeys(z)) R.defineMetadata(k, R.getMetadata(k, z), na); } catch {}
  for (const k of [...Object.getOwnPropertyNames(z), ...Object.getOwnPropertySymbols(z)])
    if (!["prototype", "arguments", "caller"].includes(k)) try { Object.defineProperty(na, k, Object.getOwnPropertyDescriptor(z, k)); } catch {}
  return na;
}

// ---------------------------------------------------------------- metody klas z mapy
// owinięte klasy, moduły i łatane prototypy w WeakSet, nie we własności: biblioteki wyliczające własności klasy
// (koa-swagger-decorator: getOwnPropertyNames → „metody statyczne”) nie mogą zobaczyć znacznika
const owiniete = new WeakSet();
const raz = o => (!o || owiniete.has(o) ? false : (owiniete.add(o), true));
globalThis.__flowlensOwin = (klasa, fqn, metody) => {
  if (typeof klasa !== "function" || !raz(klasa)) return;
  for (const m of metody) for (const cel of [klasa.prototype, klasa]) {
    const d = cel && Object.getOwnPropertyDescriptor(cel, m);
    if (!d || typeof d.value !== "function") continue;
    const fn = d.value;
    Object.defineProperty(cel, m, { ...d, value: przenies(fn, function (...a) { return wywolanie(fqn, m, () => fn.apply(this, a)); }) });
  }
};
// funkcje modułu (CommonJS): eksporty o nazwach z mapy; getter bez settera (esbuild __export) zostaje bez zmian
globalThis.__flowlensOwinModul = (eksporty, fqn, metody) => {
  if (!eksporty || (typeof eksporty !== "object" && typeof eksporty !== "function") || !raz(eksporty)) return;
  for (const m of metody) {
    const d = Object.getOwnPropertyDescriptor(eksporty, m);
    if (!d || typeof d.value !== "function" || (!d.writable && !d.configurable)) continue;
    const fn = d.value;
    Object.defineProperty(eksporty, m, { ...d, value: przenies(fn, function (...a) { return wywolanie(fqn, m, () => fn.apply(this, a)); }) });
  }
};
// funkcja modułu przez wiązanie lokalne (dopisek.cjs: także nieeksportowane) — zwraca owiniętą
globalThis.__flowlensOwinFunkcje = (fn, fqn, nazwa) => {
  if (typeof fn !== "function" || owiniete.has(fn)) return fn;
  const w = przenies(fn, function (...a) { return wywolanie(fqn, nazwa, () => fn.apply(this, a)); });
  owiniete.add(w);
  return w;
};

const RYSOWANE_ROLE = ["wejscie", "aplikacja", "domena", "repozytorium", "zewnetrzne"];
const pliki = {};
const dekoratory = new Map();                                                     // nazwa w fastify.decorate → klasa z mapy
const prawdziwa = p => { try { return fs.realpathSync(p); } catch { return p; } };   // macOS: /tmp → /private/tmp
if (MAPA && fs.existsSync(MAPA)) {
  const mapa = JSON.parse(fs.readFileSync(MAPA, "utf8"));
  const repo = path.dirname(path.dirname(path.resolve(MAPA)));
  for (const [fqn, k] of Object.entries(mapa.klasy || {})) {
    if (typeof k.dekorator === "string" && RYSOWANE_ROLE.includes(k.rola) && k.metody?.length) dekoratory.set(k.dekorator, { fqn, metody: k.metody });
    if (!RYSOWANE_ROLE.includes(k.rola) || !k.metody?.length || !k.plik) continue;
    const zr = path.join(repo, k.plik.replace(/:\d+$/, ""));
    // TS skompilowany do dist/ (Nest, tsc): ten sam plik z .js w katalogu wyjściowym
    for (const p of [zr, zr.replace(/\/src\//, "/dist/").replace(/\.ts$/, ".js"), zr.replace(/\/src\//, "/dist/src/").replace(/\.ts$/, ".js")].map(prawdziwa))
      (pliki[p] ||= []).push({ nazwa: k.nazwa, fqn, metody: k.metody.filter(m => m !== "constructor"), ...(k.modul || k.rodzaj === "modul" ? { modul: true } : {}) });
  }
}
register("./hook.mjs", pathToFileURL(__filename), { data: { pliki } });              // ESM (także tsx)
const kompiluj = Module.prototype._compile;                                       // CommonJS
Module.prototype._compile = function (tresc, nazwa) {
  const k = pliki[nazwa] || pliki[prawdziwa(nazwa)];
  return kompiluj.call(this, k ? zDopiskiem(tresc, k) : tresc, ...[...arguments].slice(1));
};

// ---------------------------------------------------------------- granice requestu HTTP
// Express (4 i 5) przypisuje req.route przy dopasowaniu trasy, gdy req.baseUrl ma jeszcze prefiks montowania
// podroutera; po next(err) wychodzi z podrouterów i przywraca baseUrl rodzica — szablon liczymy więc w setterze.
function sledzTrase(req) {
  let trasa = req.route;
  try {
    Object.defineProperty(req, "route", { configurable: true, enumerable: true,
      get: () => trasa,
      set: v => { trasa = v; if (v?.path != null && typeof v.path === "string") req.__flowlensTrasa = `${req.baseUrl || ""}${v.path}`; } });
  } catch {}
}
const kontekstyKoa = new WeakMap();                                               // req → ctx (Koa)
function szablon(req) {
  const ctx = kontekstyKoa.get(req);
  if (typeof ctx?._matchedRoute === "string") return ctx._matchedRoute;          // @koa/router, koa-router (z prefiksem)
  if (req.__flowlensTrasa) return req.__flowlensTrasa;
  return req.route?.path != null ? `${req.baseUrl || ""}${req.route.path}` : null; // Express / Nest (platform-express)
}
const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (typ, req, res) {
  if (typ !== "request" || !req || !res) return emit.apply(this, arguments);
  const sciezka = (req.url || "/").split("?")[0];
  const kor = `k-${process.pid}-${++kory}`, id = ++idy;
  pisz({ ...zd("in", { klasa: "http", metoda: sciezka, id, wejscie: { rodzaj: "http", metoda: req.method, sciezka, nazwa: `${req.method} ${sciezka}` } }, null), kor });
  sledzTrase(req);
  let zamkniety = false;
  const koniec = blad => {
    if (zamkniety) return;
    zamkniety = true;
    const wzorzec = szablon(req);
    pisz({ ...zd("out", { klasa: "http", metoda: sciezka, id, status: res.statusCode, ...(wzorzec ? { sciezka: wzorzec } : {}), ...(blad ? { blad } : {}) }, null), kor });
  };
  res.once("finish", () => koniec());
  res.once("close", () => koniec(res.writableFinished ? null : "połączenie zamknięte przed odpowiedzią"));
  return als.run({ kor, id }, () => emit.apply(this, arguments));
};

// ---------------------------------------------------------------- SQL i inne systemy
// polaczenie: id połączenia z bazą (mysql2 threadId, pg processID) — SQL z innego połączenia puli w czasie otwartej
// transakcji (findById bez trx) nie należy do niej; diag.mjs przenosi atrybuty do spanu („db.pid” jak w logu bazy)
function sql(tekst, ms, parametry, blad, st = als.getStore(), polaczenie = null) {
  const pola = { sql: zWartosciami(tekst, parametry), ms: +ms.toFixed(3), ...(blad ? { blad } : {}), ...(polaczenie != null ? { atrybuty: { "db.pid": polaczenie } } : {}) };
  if (!st?.kor) return tlo("sql", pola);
  pisz({ ...zd("sql", pola, st), kor: st.kor });
}
// SQL poza requestem (setInterval, cron, praca po odpowiedzi bez kontekstu): kor null — diag.mjs złoży „pracę w tle”
const tlo = (ev, pola) => pisz({ ...zd(ev, pola, null), kor: null });
function zWartosciami(tekst, p) {
  const t = String(tekst?.text ?? tekst ?? "");
  const par = Array.isArray(p) ? p : Array.isArray(tekst?.values) ? tekst.values : null;
  if (!par?.length) return t;
  const lit = v => (v == null ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : v).slice(0, 200).replace(/'/g, "''")}'`);
  return t.replace(/\$(\d+)/g, (a, n) => (par[n - 1] !== undefined ? lit(par[n - 1]) : a)).replace(/\?/g, (() => { let i = 0; return a => (par[i] !== undefined ? lit(par[i++]) : a); })());
}
function zew(metoda, url, t0, blad) {
  const st = als.getStore();
  const z = { metoda, url: String(url), ms: +(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(3), ...(blad ? { blad } : {}) };
  if (!st?.kor) return tlo("zew", z);
  pisz(zd("zew", z));
}

const zAplikacji = createRequire(path.join(process.cwd(), "flowlens-szukaj.js"));
const latki = {
  pg(m) {
    const proto = m?.Client?.prototype;
    if (!raz(proto)) return;
    const q = proto.query;
    proto.query = function (tekst, wartosci, cb) {
      const t0 = process.hrtime.bigint(), ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
      const par = Array.isArray(wartosci) ? wartosci : null;
      const r = q.apply(this, arguments);
      const st = als.getStore(), pol = this.processID ?? null;
      if (r && typeof r.then === "function") r.then(() => sql(tekst, ms(), par, null, st, pol), e => sql(tekst, ms(), par, opis(e), st, pol));
      else sql(tekst, ms(), par, null, st, pol);
      return r;
    };
  },
  // mysql2: rdzeń (Connection, PoolConnection) ma API z callbackiem i zwraca obiekt Query, którego then() celowo
  // rzuca (3.x) — czas i błąd bierzemy z callbacku albo ze zdarzeń Query; wrapper obietnic (mysql2/promise) woła
  // rdzeń, więc łatka rdzenia wystarcza (bez podwójnego SQL)
  mysql2(m) {
    const proto = m?.Connection?.prototype;
    if (!raz(proto)) return;
    for (const n of ["query", "execute"]) {
      const f = proto[n];
      if (typeof f !== "function") continue;
      proto[n] = function (tekst, wartosci) {
        const t0 = process.hrtime.bigint();
        const ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
        const par = Array.isArray(wartosci) ? wartosci : Array.isArray(tekst?.values) ? tekst.values : null;
        const st = als.getStore();
        let zapisany = false;
        const pol = this.threadId ?? null;
        const zapisz = e => { if (zapisany) return; zapisany = true; sql(tekst?.sql ?? tekst, ms(), par, e ? opis(e) : null, st, pol); };
        const a = [...arguments];
        const i = a.length - 1;
        if (typeof a[i] === "function") { const cb = a[i]; a[i] = function (e) { zapisz(e); return cb.apply(this, arguments); }; }
        else if (typeof tekst?.onResult === "function") { const cb = tekst.onResult; tekst.onResult = function (e) { zapisz(e); return cb.apply(this, arguments); }; }
        const r = f.apply(this, a);
        if (r instanceof Promise) r.then(() => zapisz(), e => zapisz(e));
        else if (typeof r?.once === "function") { r.once("end", () => zapisz()); r.once("error", e => zapisz(e)); }
        else if (!zapisany && typeof a[i] !== "function") zapisz();
        return r;
      };
    }
  },
  "@prisma/client"(m) {
    const P = m?.PrismaClient;
    if (!P || owiniete.has(P)) return;
    // zdarzenia „query” przychodzą z silnika Prismy (callback spoza kontekstu requestu): SQL przypisujemy operacji
    // Prismy, która właśnie czeka (rozszerzenie $allOperations biegnie w kontekście wołającego)
    const czekajace = [];
    class FlowlensPrisma extends P {
      constructor(opcje = {}) {
        const log = [...(opcje.log || []), { emit: "event", level: "query" }];
        super({ ...opcje, log });
        try { this.$on("query", e => sql(e.query, Number(e.duration) || 0, (() => { try { return JSON.parse(e.params); } catch { return null; } })(), null, als.getStore() || czekajace.at(-1))); } catch {}
        const sledz = (st, obietnica) => {                                    // ta sama obietnica Prismy (batch $transaction jej wymaga)
          if (!st || !obietnica?.then) return obietnica;
          czekajace.push(st);
          const zdejmij = () => { const i = czekajace.lastIndexOf(st); if (i >= 0) czekajace.splice(i, 1); };
          obietnica.then(zdejmij, zdejmij);
          return obietnica;
        };
        try {
          const ext = this.$extends({ query: { $allOperations({ args, query }) { return sledz(als.getStore(), query(args)); } } });
          // interaktywna $transaction: BEGIN przychodzi, zanim jakakolwiek operacja czeka — kontekst od wywołania
          return new Proxy(ext, { get(cel, klucz, odbiorca) {
            const v = Reflect.get(cel, klucz, odbiorca);
            if (klucz !== "$transaction" || typeof v !== "function") return v;
            return (...a) => sledz(als.getStore(), v.apply(cel, a));
          } });
        } catch { return this; }
      }
    }
    owiniete.add(P); owiniete.add(FlowlensPrisma);
    try { Object.defineProperty(m, "PrismaClient", { value: FlowlensPrisma, configurable: true, enumerable: true, writable: true }); } catch {}
  },
  // Koa: ctx powstaje w createContext — zapamiętany przy req daje szablon trasy z routera na końcu requestu
  koa(m) {
    const proto = (typeof m === "function" ? m : m?.default)?.prototype;
    if (typeof proto?.createContext !== "function" || !raz(proto)) return;
    const f = proto.createContext;
    proto.createContext = function (req) { const ctx = f.apply(this, arguments); try { kontekstyKoa.set(req, ctx); } catch {} return ctx; };
  },
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
      const owin = typeof fn === "function" ? function () { return job(`cron ${wyrazenie}`, () => fn.apply(this, arguments)); } : fn;
      return f.call(this, wyrazenie, owin, ...reszta);
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

// Fastify (4.x / 5.x, także ładowany przez ESM): instancja ogłasza się w kanale „fastify.initialization”.
// Szablon trasy z prefiksem pluginu — req.routeOptions.url w onRequest (szablon() czyta req.__flowlensTrasa);
// obiekty i funkcje z decorate / decorateRequest / decorateReply — owinięte, gdy mapa ma ich klasę z polem
// „dekorator” (nazwa z decorate: repozytorium-obiekt z fabryki createRepository(fastify) nie jest klasą)
try { require("node:diagnostics_channel").subscribe("fastify.initialization", ({ fastify }) => { try { fastifyLatka(fastify); } catch {} }); } catch {}
function fastifyLatka(f) {
  if (!f || typeof f.addHook !== "function" || !raz(f)) return;
  f.addHook("onRequest", (req, rep, done) => {
    const t = req.routeOptions?.url ?? req.routerPath;
    if (typeof t === "string" && req.raw) req.raw.__flowlensTrasa = t;
    done();
  });
  if (!dekoratory.size) return;
  for (const n of ["decorate", "decorateRequest", "decorateReply"]) {
    const d = f[n];
    if (typeof d === "function") f[n] = function (nazwa, wartosc, ...reszta) { return d.call(this, nazwa, owinDekorator(nazwa, wartosc), ...reszta); };
  }
}
function owinDekorator(nazwa, wartosc) {
  const k = dekoratory.get(nazwa);
  if (!k || wartosc == null) return wartosc;
  if (typeof wartosc === "function") return globalThis.__flowlensOwinFunkcje(wartosc, k.fqn, nazwa);
  if (typeof wartosc !== "object" || typeof wartosc.getter === "function" || !raz(wartosc)) return wartosc;
  for (const m of k.metody) {
    const fn = wartosc[m];
    if (typeof fn === "function") try { wartosc[m] = przenies(fn, function (...a) { return wywolanie(k.fqn, m, () => fn.apply(this, a)); }); } catch {}
  }
  return wartosc;
}

if (typeof globalThis.fetch === "function") {
  const f = globalThis.fetch;
  globalThis.fetch = function (cel, opcje) {
    const t0 = process.hrtime.bigint(), metoda = opcje?.method || cel?.method || "GET", url = cel?.url || cel;
    return f.apply(this, arguments).then(r => { zew(metoda, url, t0); return r; }, e => { zew(metoda, url, t0, opis(e)); throw e; });
  };
}
for (const modul of [http, https]) {
  const req = modul.request;
  modul.request = function (...a) {
    const t0 = process.hrtime.bigint();
    const r = req.apply(this, a);
    const o = r;
    const url = `${o.protocol || (modul === https ? "https:" : "http:")}//${o.host || o.getHeader?.("host") || "?"}${o.path || ""}`;
    r.once("response", () => zew(o.method || "GET", url, t0));
    r.once("error", e => zew(o.method || "GET", url, t0, opis(e)));
    return r;
  };
}
if (process.env.FLOWLENS_GADATLIWY) console.error(`flow-lens: log diagnostyczny → ${KATALOG} (${Object.keys(pliki).length} plików z klasami z mapy)`);
}

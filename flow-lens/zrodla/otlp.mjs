// Źródło OTLP: spany i logi z OpenTelemetry (http/protobuf albo http/json), bez zależności.
// Wynik to rekordy surowe { typ: "span" | "log", … } — wspólne dla każdej technologii z OTel.
// Dalej idą przez przebieg.mjs (filtr według mapy), widok nigdy nie widzi OTel.
import zlib from "node:zlib";

// ---------------------------------------------------------------- protobuf: minimalny czytnik
// Czyta wiadomość do mapy pole → lista wartości. Typy przewodowe: 0 varint, 1 fixed64, 2 bajty, 5 fixed32.
function czytaj(buf) {
  const pola = new Map();
  let i = 0;
  const varint = () => {
    let w = 0n, s = 0n;
    for (;;) {
      const b = buf[i++];
      w |= BigInt(b & 0x7f) << s;
      if (!(b & 0x80)) return w;
      s += 7n;
    }
  };
  while (i < buf.length) {
    const tag = Number(varint()), pole = tag >>> 3, typ = tag & 7;
    let w;
    if (typ === 0) w = varint();
    else if (typ === 1) { w = buf.subarray(i, i + 8); i += 8; }
    else if (typ === 2) { const n = Number(varint()); w = buf.subarray(i, i + n); i += n; }
    else if (typ === 5) { w = buf.subarray(i, i + 4); i += 4; }
    else throw new Error(`protobuf: nieobsługiwany typ ${typ}`);
    if (!pola.has(pole)) pola.set(pole, []);
    pola.get(pole).push(w);
  }
  return pola;
}
const jeden = (p, n) => p.get(n)?.[0];
const wszystkie = (p, n) => p.get(n) || [];
const tekst = b => (b ? Buffer.from(b).toString("utf8") : "");
const hex = b => (b && b.length ? Buffer.from(b).toString("hex") : "");
// nanosekundy (fixed64) → milisekundy z ułamkiem
const ms = b => (b ? Number(Buffer.from(b).readBigUInt64LE(0) / 1000n) / 1000 : 0);
const lnano = s => (s ? Number(BigInt(s) / 1000n) / 1000 : 0);

function wartoscPb(b) {
  if (!b) return null;
  const p = czytaj(b);
  if (p.has(1)) return tekst(jeden(p, 1));
  if (p.has(2)) return jeden(p, 2) !== 0n;
  if (p.has(3)) return Number(BigInt.asIntN(64, jeden(p, 3)));
  if (p.has(4)) return Buffer.from(jeden(p, 4)).readDoubleLE(0);
  if (p.has(5)) return wszystkie(czytaj(jeden(p, 5)), 1).map(wartoscPb);
  if (p.has(6)) return atrybutyPb(wszystkie(czytaj(jeden(p, 6)), 1));
  if (p.has(7)) return hex(jeden(p, 7));
  return null;
}
function atrybutyPb(lista) {
  const o = {};
  for (const kv of lista) { const p = czytaj(kv); o[tekst(jeden(p, 1))] = wartoscPb(jeden(p, 2)); }
  return o;
}
const zasobPb = b => (b ? atrybutyPb(wszystkie(czytaj(b), 1)) : {});
const zakresPb = b => { if (!b) return ""; return tekst(jeden(czytaj(b), 1)); };

function spanyPb(buf) {
  const wynik = [];
  for (const rs of wszystkie(czytaj(buf), 1)) {
    const prs = czytaj(rs), zasob = zasobPb(jeden(prs, 1));
    for (const ss of wszystkie(prs, 2)) {
      const pss = czytaj(ss), zakres = zakresPb(jeden(pss, 1));
      for (const s of wszystkie(pss, 2)) {
        const p = czytaj(s), st = jeden(p, 15) && czytaj(jeden(p, 15));
        wynik.push({
          typ: "span", trace: hex(jeden(p, 1)), span: hex(jeden(p, 2)), rodzic: hex(jeden(p, 4)),
          nazwa: tekst(jeden(p, 5)), rodzaj: Number(jeden(p, 6) || 0n),
          start: ms(jeden(p, 7)), koniec: ms(jeden(p, 8)),
          atrybuty: atrybutyPb(wszystkie(p, 9)),
          zdarzenia: wszystkie(p, 11).map(e => { const pe = czytaj(e); return { ts: ms(jeden(pe, 1)), nazwa: tekst(jeden(pe, 2)), atrybuty: atrybutyPb(wszystkie(pe, 3)) }; }),
          status: st ? { kod: Number(jeden(st, 3) || 0n), opis: tekst(jeden(st, 2)) } : { kod: 0, opis: "" },
          zasob, zakres,
          // linki (np. PDOStatement::execute → PDO::prepare z tekstem SQL) — tylko gdy są
          ...(wszystkie(p, 13).length ? { linki: wszystkie(p, 13).map(l => { const pl = czytaj(l); return { trace: hex(jeden(pl, 1)), span: hex(jeden(pl, 2)) }; }) } : {}),
        });
      }
    }
  }
  return wynik;
}

function logiPb(buf) {
  const wynik = [];
  for (const rl of wszystkie(czytaj(buf), 1)) {
    const prl = czytaj(rl), zasob = zasobPb(jeden(prl, 1));
    for (const sl of wszystkie(prl, 2)) {
      const psl = czytaj(sl), zakres = zakresPb(jeden(psl, 1));
      for (const l of wszystkie(psl, 2)) {
        const p = czytaj(l), tresc = wartoscPb(jeden(p, 5));
        wynik.push({
          typ: "log", ts: ms(jeden(p, 1)) || ms(jeden(p, 11)),
          poziom: tekst(jeden(p, 3)) || String(Number(jeden(p, 2) || 0n)),
          tekst: typeof tresc === "string" ? tresc : JSON.stringify(tresc),
          atrybuty: atrybutyPb(wszystkie(p, 6)),
          trace: hex(jeden(p, 9)), span: hex(jeden(p, 10)), zasob, zakres,
        });
      }
    }
  }
  return wynik;
}

// ---------------------------------------------------------------- OTLP JSON (np. SDK Pythona/Node z http/json)
function wartoscJson(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("boolValue" in v) return v.boolValue;
  if ("intValue" in v) return Number(v.intValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(wartoscJson);
  if ("kvlistValue" in v) return atrybutyJson(v.kvlistValue.values);
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}
const atrybutyJson = l => Object.fromEntries((l || []).map(kv => [kv.key, wartoscJson(kv.value)]));
// w JSON identyfikatory są hex (specyfikacja); stare eksportery dawały base64 — rozpoznajemy po długości
const idJson = s => (!s ? "" : /^[0-9a-f]+$/i.test(s) ? s.toLowerCase() : Buffer.from(s, "base64").toString("hex"));

function spanyJson(o) {
  const wynik = [];
  for (const rs of o.resourceSpans || []) {
    const zasob = atrybutyJson(rs.resource?.attributes);
    for (const ss of rs.scopeSpans || []) for (const s of ss.spans || []) wynik.push({
      typ: "span", trace: idJson(s.traceId), span: idJson(s.spanId), rodzic: idJson(s.parentSpanId),
      nazwa: s.name || "", rodzaj: typeof s.kind === "number" ? s.kind : 0,
      start: lnano(s.startTimeUnixNano), koniec: lnano(s.endTimeUnixNano),
      atrybuty: atrybutyJson(s.attributes),
      zdarzenia: (s.events || []).map(e => ({ ts: lnano(e.timeUnixNano), nazwa: e.name, atrybuty: atrybutyJson(e.attributes) })),
      status: { kod: s.status?.code || 0, opis: s.status?.message || "" },
      zasob, zakres: ss.scope?.name || "",
      ...(s.links?.length ? { linki: s.links.map(l => ({ trace: idJson(l.traceId), span: idJson(l.spanId) })) } : {}),
    });
  }
  return wynik;
}
function logiJson(o) {
  const wynik = [];
  for (const rl of o.resourceLogs || []) {
    const zasob = atrybutyJson(rl.resource?.attributes);
    for (const sl of rl.scopeLogs || []) for (const l of sl.logRecords || []) {
      const tresc = wartoscJson(l.body);
      wynik.push({
        typ: "log", ts: lnano(l.timeUnixNano) || lnano(l.observedTimeUnixNano),
        poziom: l.severityText || String(l.severityNumber || ""),
        tekst: typeof tresc === "string" ? tresc : JSON.stringify(tresc),
        atrybuty: atrybutyJson(l.attributes), trace: idJson(l.traceId), span: idJson(l.spanId),
        zasob, zakres: sl.scope?.name || "",
      });
    }
  }
  return wynik;
}

// ---------------------------------------------------------------- wejście
export const nazwa = "otlp";
export const SCIEZKI = ["/v1/traces", "/v1/logs"];

// sciezka: /v1/traces | /v1/logs; naglowki: content-type, content-encoding
export function czytajOtlp(sciezka, naglowki, cialo) {
  let b = cialo;
  const kod = (naglowki["content-encoding"] || "").toLowerCase();
  if (kod === "gzip") b = zlib.gunzipSync(b);
  else if (kod === "deflate") b = zlib.inflateSync(b);
  const json = (naglowki["content-type"] || "").includes("json");
  if (sciezka.endsWith("/v1/traces")) return json ? spanyJson(JSON.parse(b.toString("utf8"))) : spanyPb(b);
  if (sciezka.endsWith("/v1/logs")) return json ? logiJson(JSON.parse(b.toString("utf8"))) : logiPb(b);
  return [];
}

// odpowiedź, której oczekuje eksporter (pusty Export*ServiceResponse)
export const odpowiedz = json => (json ? { typ: "application/json", cialo: "{}" } : { typ: "application/x-protobuf", cialo: Buffer.alloc(0) });

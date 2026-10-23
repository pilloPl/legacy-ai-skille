// Źródło: zwykły plik logu aplikacji (dowolna technologia), śledzony od końca jak `tail -f`.
// Linia trafia do przebiegu, jeśli ma identyfikator trace (MDC/kontekst logowania: trace_id, traceId, trace.id…).
// Wzorzec można podać własny: grupy nazwane ts, poziom, trace, span, tekst.
import fs from "node:fs";

export const nazwa = "log-tekst";

const TRACE = /trace[_.-]?id["']?\s*[=:]\s*["']?([0-9a-f]{32})/i;
const SPAN = /span[_.-]?id["']?\s*[=:]\s*["']?([0-9a-f]{16})/i;
const TS = /^\s*(\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:[.,]\d+)?(?:Z|[+-]\d\d:?\d\d)?)/;
const POZIOM = /\b(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL)\b/;

// wątek: Spring Boot „[app] [nio-8080-exec-1] logger : msg” (ostatni nawias przed „logger :”), logback
// „[wątek] LEVEL logger - msg”, log4j „[wątek]” na początku, .NET/Serilog „{ThreadId}”.
const WATEK = [/\[\s*([^\]]+?)\s*\]\s+[\w.$]+\s+:\s/, /\[([^\]]+)\]\s+(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b/, /(?:TRACE|DEBUG|INFO|WARN|ERROR)\s+\[([^\]]+)\]/];
const watekZ = linia => { for (const w of WATEK) { const m = w.exec(linia); if (m) return m[1]; } return null; };

// Domyślnie: kilka prostych dopasowań zamiast jednego wzorca (formaty logów są różne w każdej technologii).
function domyslnie(linia, bezId) {
  if (linia.trimStart().startsWith("{")) {                       // log JSON (logstash, structlog, pino, Serilog…)
    try {
      const o = JSON.parse(linia), pole = (...n) => n.map(k => o[k]).find(v => v != null);
      const trace = pole("trace_id", "traceId", "trace.id", "TraceId", "dd.trace_id");
      if (trace && /^[0-9a-f]{32}$/i.test(trace)) return {
        trace, span: pole("span_id", "spanId", "span.id", "SpanId"), ts: pole("@timestamp", "timestamp", "time", "ts", "Timestamp"),
        poziom: String(pole("level", "severity", "log.level", "Level") || ""), tekst: String(pole("message", "msg", "Message", "@m") || linia),
      };
    } catch {}
  }
  const trace = TRACE.exec(linia)?.[1];
  if (!trace && !bezId) return null;
  if (!trace && !TS.test(linia)) return null;            // bez id bierzemy tylko linie ze znacznikiem czasu (nie stack trace)
  let tekst = linia.includes(" : ") ? linia.slice(linia.lastIndexOf(" : ") + 3)
    : linia.replace(TS, "").replace(POZIOM, "").replace(/\[[^\]]*trace[^\]]*\]/i, "");
  tekst = tekst.replace(TRACE, "").replace(SPAN, "").replace(/[\s,;]+$/, "").trim();
  return { ts: TS.exec(linia)?.[1], poziom: POZIOM.exec(linia)?.[1], trace: trace || "", span: SPAN.exec(linia)?.[1], tekst, watek: watekZ(linia) };
}

// wzorzec (opcjonalny): RegExp z grupami nazwanymi ts, poziom, trace, span, tekst, watek
// bezId: także linie bez identyfikatora requestu (trace = "") — dopasuje je korelacja (wątek + czas)
export function parsujLinie(linia, wzorzec = null, { bezId = false } = {}) {
  const g = wzorzec ? wzorzec.exec(linia)?.groups : domyslnie(linia, bezId);
  if (!g || (!g.trace && !bezId)) return null;
  const ts = g.ts ? Date.parse(g.ts.replace(" ", "T").replace(",", ".")) : Date.now();
  return {
    typ: "log", zrodlo: nazwa, ts: Number.isFinite(ts) ? ts : Date.now(),
    poziom: (g.poziom || "").toUpperCase(), tekst: (g.tekst || linia).trim() || linia.trim(),
    trace: (g.trace || "").toLowerCase(), span: (g.span || "").toLowerCase(), watek: g.watek || null,
    atrybuty: g.watek ? { "thread.name": g.watek } : {}, zakres: "log",
  };
}

// Śledzi plik od bieżącego końca; nowe linie → naRekordy([...]). Zwraca funkcję zatrzymującą.
export function sledzPlik(plik, naRekordy, { wzorzec, co = 300, bezId = false } = {}) {
  let pozycja = fs.existsSync(plik) ? fs.statSync(plik).size : 0, reszta = "";
  const krok = () => {
    let st;
    try { st = fs.statSync(plik); } catch { return; }
    if (st.size < pozycja) pozycja = 0;                 // rotacja / obcięcie
    if (st.size === pozycja) return;
    const fd = fs.openSync(plik, "r"), buf = Buffer.alloc(st.size - pozycja);
    fs.readSync(fd, buf, 0, buf.length, pozycja); fs.closeSync(fd);
    pozycja = st.size;
    const linie = (reszta + buf.toString("utf8")).split("\n");
    reszta = linie.pop();
    const rek = linie.map(l => parsujLinie(l, wzorzec, { bezId })).filter(Boolean);
    if (rek.length) naRekordy(rek);
  };
  const zegar = setInterval(krok, co);
  return () => clearInterval(zegar);
}

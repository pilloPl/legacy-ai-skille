// Dane widoku: lista nagrań, nagranie (przebiegi JSONL), konfiguracja (mapa + adnotacje) i model nawigacji.
// Widok dostaje gotowe przebiegi — nie wie nic o OpenTelemetry ani o źródłach logów.

export async function wczytajListe() {
  return (await fetch("/_flow/api/nagrania")).json();
}
export async function wczytajKonfig(zrodlo = null) {
  const q = zrodlo?.zrodlo === "przyklad" ? `?zrodlo=przyklad&plik=${encodeURIComponent(zrodlo.plik)}` : "";
  try { return await (await fetch(`/_flow/api/konfig${q}`)).json(); } catch { return { mapa: null, adnotacje: null }; }
}
export async function wczytajNagranie(zrodlo, plik, { przelicz = false } = {}) {
  const r = await fetch(`/_flow/api/nagranie?zrodlo=${encodeURIComponent(zrodlo)}&plik=${encodeURIComponent(plik)}${przelicz ? "&przelicz=1" : ""}`);
  if (!r.ok) return [];
  return (await r.text()).split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// Model: przebiegi (requesty) i płaska lista kroków; każdy krok wie, do którego przebiegu należy.
export function zbuduj(rekordy) {
  const przebiegi = rekordy.filter(r => r.kind === "przebieg").sort((a, b) => a.ts - b.ts);
  przebiegi.forEach((p, i) => {
    p.nr = i + 1;
    p.uczestnik = new Map(p.uczestnicy.map(u => [u.id, u]));
    p.kroki.forEach(k => { k.p = p; k.id = `${p.id}:${k.nr}`; });
  });
  return { przebiegi, pusto: !przebiegi.length };
}

export const krotkaKlasa = k => String(k || "").split(/[.]/).pop();
export const ms = x => (x == null ? "" : x >= 1000 ? `${(x / 1000).toFixed(2).replace(".", ",")} s` : `${x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : Math.round(x)} ms`.replace(".", ","));
// pierwsza linia SQL bez nadmiaru spacji, np. "select t1_0.id,… from tariff t1_0 where …"
export const sqlKrotko = (s, n = 70) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
export function sqlCel(k) {
  const m = /\b(from|into|update|join)\s+([\w."]+)/i.exec(k.sql || "");
  return (k.tabela || (m ? m[2].replace(/"/g, "") : "")).replace(/^.*\./, "");
}

// Wszystkie tabele w zapytaniu (FROM, JOIN, INTO, UPDATE, DELETE FROM, MERGE INTO), bez nazw z WITH (CTE) i podzapytań.
export function tabeleSql(sql) {
  const tekst = String(sql || "").replace(/'(?:[^']|'')*'/g, "''");
  const cte = new Set([...tekst.matchAll(/(?:\bwith\s+(?:recursive\s+)?|,)\s*([\w"]+)\s*(?:\([^)]*\))?\s+as\s*\(/gi)].map(m => m[1].replace(/"/g, "").toLowerCase()));
  const wynik = [];
  for (const m of tekst.matchAll(/\b(?:from|join|into|update|delete\s+from|merge\s+into)\s+((?:[\w"]+\.)*[\w"]+)/gi)) {
    const t = m[1].replace(/"/g, "").split(".").pop().toLowerCase();
    if (!t || cte.has(t) || /^(select|lateral|unnest|values|dual|set|only)$/.test(t)) continue;
    if (!wynik.includes(t)) wynik.push(t);
  }
  return wynik;
}
export const operacjaSql = k => (k.operacja || String(k.sql || "").trim().split(/\s+/)[0] || "SQL").toUpperCase();

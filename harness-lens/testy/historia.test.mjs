// Testy ciągłości historii: /compact (historia zastąpiona streszczeniem) i /clear (nowa, pusta historia).
//   node --test ~/.claude/skills/harness-lens/testy/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zbuduj } from "../widok/dane.js";
import { etapyKroku, warstwyDoPozycji, podsumowanieWyniku } from "../widok/etapy.js";
import { WARSTWY } from "../widok/rozdzialy.js";

const TU = path.dirname(fileURLToPath(import.meta.url));
const wczytaj = f => fs.readFileSync(path.join(TU, "..", "przyklady", f), "utf8").split("\n").filter(Boolean).map(JSON.parse);
const W = new Set(WARSTWY.map(w => w.id));
const typy = (m, w) => etapyKroku(w, m, W).map(e => e.typ);

test("demo: historia ciągła, bez kompakcji i resetów", () => {
  const m = zbuduj(wczytaj("demo.jsonl"));
  assert.deepEqual(m.glowne.filter(w => w.reset || w.kompakcja).map(w => w.nr), []);
  assert.equal(m.tury.length, 7);
  assert.ok(m.glowne.every(w => w.diff.noweWiadomosci > 0), "krok bez nowych wiadomości");
});

test("/compact: osobna tura, streszczenie zastępuje historię", () => {
  const m = zbuduj(wczytaj("kompakcja.jsonl"));
  const tk = m.tury.filter(t => t.kompakcja);
  assert.equal(tk.length, 1, "powinna być jedna tura kompakcji");
  assert.equal(tk[0].prompt, "/compact");
  const w = tk[0].wymiany[0];
  const E = typy(m, w);
  assert.deepEqual(E.filter(t => ["prompt", "hook-compact", "powrot", "analiza", "kompakcja", "koniec"].includes(t)),
    ["prompt", "hook-compact", "powrot", "analiza", "kompakcja", "koniec"], `zła kolejność: ${E.join(" → ")}`);
  assert.ok(!E.includes("stos-odp"), "streszczenie nie trafia do historii jak zwykła odpowiedź");
  assert.ok(!E.includes("stos"), "/compact nie trafia do historii jako prompt");
  const tytuly = etapyKroku(w, m, W).map(e => e.tytul).join(" | ");
  assert.match(tytuly, /POLECENIE STRESZCZENIA/);
  // polecenie jest jednorazowe: idzie do koperty tuż przed wysyłką, nie jako doklejka do historii
  assert.equal(E.indexOf("polecenie"), E.indexOf("wysylka") - 1, "polecenie nie tuż przed wysyłką");
  assert.ok(E.indexOf("koperta") < E.indexOf("polecenie"), "polecenie przed złożeniem koperty");
  assert.ok(!etapyKroku(w, m, W).some(e => e.typ === "doklejki" && /POLECENIE/.test(e.tytul)), "polecenie jako doklejka do historii");
  assert.equal(w.diff.noweWiadomosci, 0, "kompakcja nie powinna dokładać wiadomości do historii");
  assert.match(tytuly, /WRACA STRESZCZENIE/);

  const po = m.glowne[m.glowne.indexOf(w) + 1];
  assert.equal(po.reset, "kompakcja");
  assert.ok(po.req.messages.length < w.req.messages.length, "historia po kompakcji nie jest krótsza");
  const Epo = etapyKroku(po, m, W);
  assert.equal(Epo[0].typ, "reset");
  assert.equal(Epo[1].typ, "prompt");
  assert.match(Epo.map(e => e.tytul).join(" | "), /STRESZCZENIE HISTORII/);
});

test("/clear: nowa historia od zera, doklejki wracają", () => {
  // sztuczny przypadek: pierwsza tura demo, hook SessionEnd(clear), ta sama tura jeszcze raz w nowej sesji
  const demo = wczytaj("demo.jsonl");
  const m0 = zbuduj(demo);
  const t1 = m0.tury[0].wymiany.map(w => w.id), t2 = m0.tury[1].wymiany.map(w => w.id);
  const rekordy = demo.filter(r => r.kind !== "hook" && (t1.includes(r.id) || t2.includes(r.id)));
  const koniec = Math.max(...rekordy.map(r => r.ts));
  const kopia = demo.filter(r => r.kind !== "hook" && t1.includes(r.id)).map(r => ({ ...r, id: r.id + 1000, ts: r.ts - rekordy[0].ts + koniec + 5000 }));
  const m = zbuduj([...rekordy, { kind: "hook", ts: koniec + 1000, event: "SessionEnd", body: { hook_event_name: "SessionEnd", reason: "clear" } }, ...kopia]);
  const w = m.glowne.at(-1);
  assert.equal(w.reset, "clear");
  const E = etapyKroku(w, m, W);
  assert.equal(E[0].typ, "reset");
  assert.match(E[0].tytul, /CLEAR/);
  assert.match(E.map(e => e.tytul).join(" | "), /ZASADY PROJEKTU/, "po /clear doklejki nie wróciły");
  assert.equal(w.diff.noweWiadomosci, w.req.messages.length, "po /clear cała historia jest nowa");
});

test("--resume: pierwszy request z zapisaną historią = wznowiona sesja, stara rozmowa nie jest nowa", () => {
  // nagranie zaczęte w środku sesji: od tury 3 demo (każda tura demo to `claude -p --resume`)
  const demo = wczytaj("demo.jsonl");
  const m0 = zbuduj(demo);
  const od = m0.tury[2].wymiany[0].ts;
  const m = zbuduj(demo.filter(r => r.ts >= od - 1));
  const w = m.glowne[0];
  assert.equal(w.reset, "wznowienie");
  assert.ok(w.wczytane >= 4, `za mało wczytanych wiadomości: ${w.wczytane}`);
  assert.ok(w.diff.noweWiadomosci < w.req.messages.length, "wczytana historia potraktowana jak nowa");
  const E = etapyKroku(w, m, W);
  assert.equal(E[0].typ, "reset");
  assert.match(E[0].tytul, /WZNOWIONA SESJA/);
  assert.equal(E[1].typ, "prompt");
  assert.ok(m.glowne.slice(1).every(x => !x.reset), "reset w dalszej części wznowionej sesji");
});

test("wznowienie przed pierwszym requestem: model zna wczytaną historię", () => {
  const m = zbuduj([{ kind: "hook", ts: 1, event: "SessionStart", body: { source: "resume" } },
    { kind: "wczytana-historia", ts: 2, plik: "x.jsonl", messages: [{ role: "user", content: "pytanie" }, { role: "assistant", content: [{ type: "text", text: "odpowiedź" }] }] }]);
  assert.ok(m.pusto, "bez requestów nagranie powinno być puste");
  assert.equal(m.wczytana.messages.length, 2);
  assert.equal(m.wczytana.messages[1].rola, "assistant");
});

test("/clear: warstwy liczą się od nowa w nowej sesji", () => {
  const demo = wczytaj("demo.jsonl");
  const m0 = zbuduj(demo);
  const t1 = m0.tury[0].wymiany.map(w => w.id), t2 = m0.tury[1].wymiany.map(w => w.id);
  const rekordy = demo.filter(r => r.kind !== "hook" && (t1.includes(r.id) || t2.includes(r.id)));
  const koniec = Math.max(...rekordy.map(r => r.ts));
  const kopia = demo.filter(r => r.kind !== "hook" && t1.includes(r.id)).map(r => ({ ...r, id: r.id + 1000, ts: r.ts - rekordy[0].ts + koniec + 5000 }));
  const m = zbuduj([...rekordy, { kind: "hook", ts: koniec + 1000, event: "SessionEnd", body: { hook_event_name: "SessionEnd", reason: "clear" } }, ...kopia]);
  const ef = w => etapyKroku(w, m, W);
  const przed = warstwyDoPozycji(m, m.glowne.at(-2), ef(m.glowne.at(-2)).length - 1, ef);
  assert.ok(przed.has("narzedzia"), "przed /clear brali udział narzędzia (Read w turze 2)");
  const poClear = warstwyDoPozycji(m, m.glowne.at(-1), 0, ef);
  assert.deepEqual([...poClear], ["stos"], `na starcie nowej sesji tylko stos, jest: ${[...poClear]}`);
});

test("/resume w trakcie sesji: inna rozmowa z odpowiedziami modelu = wznowienie, warstwy od nowa", () => {
  const demo = wczytaj("demo.jsonl"), komp = wczytaj("kompakcja.jsonl");
  const m0 = zbuduj(demo), mk = zbuduj(komp);
  const t1 = m0.tury[0].wymiany.map(w => w.id);
  const a = demo.filter(r => r.kind !== "hook" && t1.includes(r.id));
  const koniec = Math.max(...a.map(r => r.ts));
  const cudza = mk.tury[1].wymiany[0]; // druga tura innej rozmowy: historia z odpowiedziami modelu
  const b = komp.filter(r => r.kind !== "hook" && r.id === cudza.id).map(r => ({ ...r, id: r.id + 2000, ts: r.ts - cudza.ts + koniec + 5000 }));
  const m = zbuduj([...a, { kind: "hook", ts: koniec + 1000, event: "SessionStart", body: { hook_event_name: "SessionStart", source: "resume" } }, ...b]);
  const w = m.glowne.at(-1);
  assert.equal(w.reset, "wznowienie");
  assert.ok(w.wczytane > 0 && w.diff.noweWiadomosci < w.req.messages.length);
  const E = etapyKroku(w, m, W);
  assert.match(E[0].tytul, /WZNOWIONA SESJA/);
  assert.deepEqual([...warstwyDoPozycji(m, w, 0, x => etapyKroku(x, m, W))], ["stos"]);
});

test("na żywo przed wynikiem: AskUserQuestion czeka na człowieka, bez odmowy, wyniku i pętli", () => {
  const L = wczytaj("pytanie-i-internet.jsonl");
  const w0 = zbuduj(L).glowne.find(w => w.wywolania.some(c => c.nazwa === "AskUserQuestion"));
  const koniec = Math.max(...L.filter(r => r.id === w0.id).map(r => r.ts));
  const m = zbuduj(L.filter(r => r.ts <= koniec));
  const E = etapyKroku(m.glowne.at(-1), m, W);
  const ost = E.at(-1);
  assert.equal(ost.typ, "wykonanie");
  assert.equal(ost.aktor, "czlowiek");
  assert.match(ost.tytul, /CZEKAM NA ODPOWIEDŹ/);
  assert.ok(!E.some(e => ["wynik", "petla"].includes(e.typ) || /ODMOWA/.test(e.tytul)), E.map(e => e.tytul).join(" | "));
});

test("podsumowanie wyniku narzędzia: krótko i według rodzaju narzędzia", () => {
  const m = zbuduj([...wczytaj("demo.jsonl"), ...wczytaj("pytanie-i-internet.jsonl").map(r => ({ ...r, id: r.id + 5000, ts: r.ts + 1e9 }))]);
  const p = Object.fromEntries(m.glowne.flatMap(w => w.wywolania).map(c => [`${c.nazwa}:${c.status}`, podsumowanieWyniku(c)]));
  assert.match(p["Read:ok"], /^\d+ lini/);
  assert.match(p["Bash:ok"], /^OK · 3 linie wyjścia$/);
  assert.equal(p["Bash:odmowa"], "odmowa");
  assert.equal(p["Edit:hook"], "zablokował hook");
  assert.equal(p["ToolSearch:ok"], "4 narzędzia");
  assert.equal(p["AskUserQuestion:ok"], "odpowiedź: W ten weekend");
  assert.match(p["WebSearch:ok"], /^\d+ link/);
  assert.equal(podsumowanieWyniku({ nazwa: "Read", status: "brak" }), "czekam na wynik…");
});

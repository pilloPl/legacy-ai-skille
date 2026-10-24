// Testy etapów na nagraniu demo: kolejność, czasy, warstwy (włączone / wyłączone / tryb „całe nagranie”).
//   node --test ~/.claude/skills/harness-lens/testy/
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zbuduj } from "../widok/dane.js";
import { etapyKroku, warstwyEtapu, warstwyDoPozycji } from "../widok/etapy.js";
import { WARSTWY } from "../widok/rozdzialy.js";

const TU = path.dirname(fileURLToPath(import.meta.url));
const rekordy = fs.readFileSync(path.join(TU, "..", "przyklady", "demo.jsonl"), "utf8").split("\n").filter(Boolean).map(JSON.parse);
const model = zbuduj(rekordy);
const WSZYSTKIE = new Set(WARSTWY.map(w => w.id));
const bez = (...ids) => {
  const W = new Set(WSZYSTKIE);
  for (const id of ids) { W.delete(id); for (const w of WARSTWY) if (w.wymaga?.includes(id)) W.delete(w.id); }
  return W;
};
const etapy = (w, W = WSZYSTKIE) => etapyKroku(w, model, W);
const wszystkieEtapy = W => model.glowne.flatMap(w => etapy(w, W).map(e => ({ ...e, w })));
const gdzie = e => `#${e.w?.nr ?? "?"} ${e.typ}: ${e.tytul}`;

// Kolejność typów etapów w obrębie kroku (wywołania narzędzi mają własny cykl, patrz niżej).
const PRZED_WYWOLANIAMI = ["prompt", "hook-prompt", "doklejki", "stos", "k-system", "k-narzedzia", "koperta", "wysylka", "model", "powrot", "analiza"];
const CYKL_WYWOLANIA = ["hook-pre", "hook-perm", "pytanie", "uprawnienia", "wykonanie", "hook-post", "wynik"];
const NA_KONIEC = ["petla", "hook-stop", "koniec"];

test("demo ma czego testować", () => {
  assert.ok(model.glowne.length >= 15, "za mało requestów");
  const typy = new Set(wszystkieEtapy(WSZYSTKIE).map(e => e.typ));
  for (const t of ["prompt", "hook-prompt", "doklejki", "stos", "k-system", "k-narzedzia", "koperta", "wysylka", "model", "powrot",
    "analiza", "stos-odp", "hook-pre", "hook-perm", "uprawnienia", "wykonanie", "hook-post", "wynik", "petla", "hook-stop", "koniec"])
    assert.ok(typy.has(t), `brak etapu ${t} w demo`);
});

test("każdy krok ma etapy w dobrej kolejności", () => {
  for (const w of model.glowne) {
    const E = etapy(w);
    const typy = E.map(e => e.typ);
    // część przed wywołaniami: rosnąco według PRZED_WYWOLANIAMI (doklejki mogą być przed i po promptcie w historii)
    const przed = typy.slice(0, typy.indexOf("analiza") + 1).filter(t => t !== "doklejki");
    const poz = przed.map(t => PRZED_WYWOLANIAMI.indexOf(t));
    assert.deepEqual(poz, [...poz].sort((a, b) => a - b), `#${w.nr}: zła kolejność przed analizą: ${przed.join(" → ")}`);
    if (w.krok === 1) assert.equal(typy[0], "prompt", `#${w.nr}: tura nie zaczyna się od promptu`);
    else assert.ok(!typy.includes("prompt") && !typy.includes("stos"), `#${w.nr}: prompt albo stos w kolejnym kroku tury`);
    // koniec kroku: pętla albo (hook Stop →) koniec tury
    const ost = typy[typy.length - 1];
    assert.ok(ost === "petla" || ost === "koniec", `#${w.nr}: krok kończy się na ${ost}`);
    assert.equal(ost === "petla", w.odp?.stop === "tool_use", `#${w.nr}: pętla niezgodna ze stop_reason`);
    if (typy.includes("hook-stop")) assert.equal(typy.indexOf("hook-stop"), typy.length - 2, `#${w.nr}: hook Stop nie tuż przed końcem`);
    // każde wywołanie: własny cykl w kolejności, wywołania jedno po drugim
    // zaraz po analizie: odpowiedź modelu trafia do historii (warstwa stosu)
    if (typy.includes("stos-odp")) assert.equal(typy.indexOf("stos-odp"), typy.indexOf("analiza") + 1, `#${w.nr}: odpowiedź do historii nie tuż po analizie`);
    const poAnalizie = E.slice(typy.indexOf("analiza") + 1).filter(e => !NA_KONIEC.includes(e.typ) && e.typ !== "stos-odp");
    const id = poAnalizie.map(e => e.c?.id);
    assert.ok(id.every(Boolean), `#${w.nr}: etap po analizie bez wywołania`);
    const kolejnoscWyw = [...new Set(id)];
    assert.deepEqual(kolejnoscWyw, (w.wywolania || []).map(c => c.id), `#${w.nr}: wywołania nie po kolei`);
    for (const c of w.wywolania || []) {
      const cykl = poAnalizie.filter(e => e.c.id === c.id).map(e => CYKL_WYWOLANIA.indexOf(e.typ));
      assert.ok(cykl.every(x => x >= 0), `#${w.nr} ${c.nazwa}: nieznany etap w cyklu`);
      assert.deepEqual(cykl, [...cykl].sort((a, b) => a - b), `#${w.nr} ${c.nazwa}: zła kolejność cyklu`);
      assert.equal(cykl[cykl.length - 1], CYKL_WYWOLANIA.indexOf("wynik"), `#${w.nr} ${c.nazwa}: cykl bez wyniku`);
      assert.equal(cykl.includes(CYKL_WYWOLANIA.indexOf("wykonanie")), c.status === "ok", `#${w.nr} ${c.nazwa}: wykonanie niezgodne ze statusem ${c.status}`);
    }
  }
});

test("czasy etapów nie maleją i są w granicach requestu", () => {
  for (const w of model.glowne) {
    const E = etapy(w);
    for (let i = 1; i < E.length; i++) assert.ok(E[i].ts >= E[i - 1].ts, `#${w.nr}: czas maleje przy ${E[i].typ}`);
    const iW = E.findIndex(e => e.typ === "wysylka");
    for (const e of E.slice(0, iW)) assert.ok(e.ts <= w.ts, `#${w.nr}: ${e.typ} później niż wysłanie requestu`);
  }
});

test("doklejki idą w kolejności historii, prompt między nimi", () => {
  const w = model.glowne[0];
  const E = etapy(w);
  const idxPromptu = w.req.messages.findIndex(m => m.bloki.some(b => b.rodzaj === "uzytkownik"));
  const iStos = E.findIndex(e => e.typ === "stos");
  E.forEach((e, i) => {
    if (e.typ !== "doklejki") return;
    if (e.idx <= idxPromptu) assert.ok(i < iStos, `doklejka do wiadomości ${e.idx} po promptcie`);
    else assert.ok(i > iStos, `doklejka do wiadomości ${e.idx} przed promptem`);
  });
});

// Które etapy należą do warstwy (po typie albo treści).
const NALEZY = {
  hooki: e => e.typ.startsWith("hook-") || !!e.hook || /HOOK/.test(e.tytul),
  uprawnienia: e => ["uprawnienia", "pytanie"].includes(e.typ),
  stos: e => ["stos", "stos-odp"].includes(e.typ),
  prompt: e => e.typ === "k-system",
  skille: e => /SKILL „|INDEKS SKILLI|TREŚĆ SKILLA/.test(e.tytul),
  mcp: e => /SERWER MCP|baza ·|tracker ·|BAZA ·|TRACKER ·/.test(e.tytul),
  odkrywanie: e => /SZUKAM NARZĘDZIA|DOCIĄGNIĘTE|ODROCZONE NARZĘDZIA|POTWIERDZENIE ZAŁADOWANIA/.test(e.tytul),
  cache: e => /z cache/.test(e.dlaczego) && e.typ === "koperta",
  narzedzia: e => !!e.c || ["k-narzedzia"].includes(e.typ) || /TOOL_USE/.test(e.tytul),
};

for (const { id } of WARSTWY) {
  test(`warstwa „${id}” wyłączona: żaden etap jej nie pokazuje`, () => {
    const zle = wszystkieEtapy(bez(id)).filter(NALEZY[id]);
    assert.deepEqual(zle.map(gdzie), [], `etapy warstwy ${id} mimo wyłączenia`);
  });
  test(`warstwa „${id}” włączona: jej etapy są w nagraniu`, () => {
    assert.ok(wszystkieEtapy(WSZYSTKIE).some(NALEZY[id]), `brak etapów warstwy ${id}`);
  });
}

test("wyłączenie warstwy nie zmienia kolejności pozostałych etapów", () => {
  for (const { id } of WARSTWY) for (const w of model.glowne) {
    const pelne = etapy(w).map(e => e.tytul);
    // blokada przez hook to to samo zdarzenie: z hookami etap hooka, bez nich etap uprawnień
    const klucz = e => (e.c?.status === "hook" && ["hook-pre", "uprawnienia"].includes(e.typ) ? "blokada" : e.typ) + "|" + (e.c?.id || "");
    const okrojone = etapy(w, bez(id)).map(klucz);
    const wPelnych = etapy(w).map(klucz);
    let j = 0;
    for (const x of okrojone) { while (j < wPelnych.length && wPelnych[j] !== x) j++; assert.ok(j < wPelnych.length, `#${w.nr} bez ${id}: etap ${x} poza kolejnością (pełne: ${pelne.length})`); j++; }
  }
});

test("tryb „całe nagranie”: warstwy rosną z pozycją i znikają przy cofaniu", () => {
  const ef = w => etapy(w);
  let poprz = new Set();
  const kolejne = [];
  for (const w of model.glowne) etapy(w).forEach((e, i) => kolejne.push({ w, i, e }));
  for (const { w, i, e } of kolejne) {
    const teraz = warstwyDoPozycji(model, w, i, ef);
    for (const k of poprz) assert.ok(teraz.has(k), `#${w.nr} etap ${i}: warstwa ${k} zniknęła w przód`);
    for (const k of warstwyEtapu(e, w)) assert.ok(teraz.has(k), `#${w.nr} ${e.typ}: brak warstwy ${k}, która bierze udział`);
    for (const k of teraz) assert.ok(poprz.has(k) || warstwyEtapu(e, w).includes(k), `#${w.nr} ${e.typ}: warstwa ${k} pojawiła się bez udziału`);
    poprz = teraz;
  }
  // cofanie: na początku nagrania nie ma warstw, które pojawiają się później
  const start = warstwyDoPozycji(model, model.glowne[0], 0, ef);
  const koniec = warstwyDoPozycji(model, model.glowne.at(-1), etapy(model.glowne.at(-1)).length - 1, ef);
  assert.ok(start.size < koniec.size, "na początku tyle samo warstw co na końcu");
  for (const k of ["uprawnienia", "skille", "mcp", "odkrywanie"]) assert.ok(!start.has(k), `warstwa ${k} na samym początku`);
  assert.deepEqual([...koniec].sort(), [...WSZYSTKIE].sort(), "na końcu demo nie wszystkie warstwy");
});

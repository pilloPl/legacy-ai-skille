// Testy metafor na nagraniach demo i kompakcja: bez hooków, każdy etap ma tytuł albo jest sklejony,
// po każdej odpowiedzi modelu jest „zapomnienie”, każdy krok ma co pokazać.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zbuduj } from "../widok/dane.js";
import { etapyKroku } from "../widok/etapy.js";
import { METAFORY, etapyWMetaforze, widoczny } from "../widok/metafory.js";
import { ROZDZIALY } from "../widok/rozdzialy.js";

const TU = path.dirname(fileURLToPath(import.meta.url));
const wczytaj = plik => zbuduj(fs.readFileSync(path.join(TU, "..", "przyklady", plik), "utf8").split("\n").filter(Boolean).map(JSON.parse));
const NAGRANIA = { demo: wczytaj("demo.jsonl"), kompakcja: wczytaj("kompakcja.jsonl") };
const etapy = (model, w, m) => { const W = new Set(m.warstwy); return etapyWMetaforze(etapyKroku(w, model, W), w, model, m, W); };
const kazdy = f => { for (const m of METAFORY) for (const [n, model] of Object.entries(NAGRANIA)) for (const w of model.glowne) f(m, model, w, etapy(model, w, m), `${m.id}/${n} #${w.nr}`); };

test("metafory nie używają hooków", () => {
  for (const m of METAFORY) assert.ok(!m.warstwy.includes("hooki"), m.id);
  kazdy((m, model, w, E, gdzie) => assert.ok(!E.some(e => e.typ.startsWith("hook") || e.hook), gdzie));
});

test("każdy etap ma tytuł metafory albo jest sklejony", () => {
  kazdy((m, model, w, E, gdzie) => {
    for (const e of E) {
      if (e.ukryty) continue;
      assert.ok(e.tytul && !/undefined|null|\[object/.test(e.tytul), `${gdzie} ${e.typ}: ${e.tytul}`);
      assert.ok(e.dlaczego && !/undefined/.test(e.dlaczego), `${gdzie} ${e.typ}: brak dlaczego`);
      assert.ok(e.prawdziwy, `${gdzie} ${e.typ}: brak mostu do prawdziwego tytułu`);
    }
  });
});

test("wysyłka i analiza są zawsze sklejone, każdy krok ma widoczne etapy", () => {
  kazdy((m, model, w, E, gdzie) => {
    for (const e of E) if (["wysylka", "analiza"].includes(e.typ)) assert.ok(e.ukryty, `${gdzie} ${e.typ}`);
    assert.ok(widoczny(E, 0, 1) >= 0, `${gdzie}: krok bez widocznych etapów`);
  });
});

test("po każdej odpowiedzi modelu model zapomina", () => {
  kazdy((m, model, w, E, gdzie) => {
    const i = E.findIndex(e => e.typ === "powrot");
    if (i < 0) return;
    assert.equal(E[i + 1]?.typ, "zapomnienie", gdzie);
    assert.equal(E.filter(e => e.typ === "zapomnienie").length, 1, gdzie);
  });
});

test("indeksy etapów po wstawieniu zapomnienia są ciągłe, identyfikatory unikalne", () => {
  kazdy((m, model, w, E, gdzie) => {
    E.forEach((e, i) => assert.equal(e.i, i, gdzie));
    assert.equal(new Set(E.map(e => e.id)).size, E.length, gdzie);
  });
});

test("widoczny: najbliższy niesklejony etap w obu kierunkach", () => {
  const E = [{}, { ukryty: true }, { ukryty: true }, {}];
  assert.equal(widoczny(E, 1, 1), 3);
  assert.equal(widoczny(E, 2, -1), 0);
  assert.equal(widoczny(E, 4, 1), -1);
  assert.equal(widoczny([{ ukryty: true }], 0, -1), -1);
});

test("rozdziały metafory istnieją i mają warstwy metafory", () => {
  const id = new Set([...ROZDZIALY.map(r => r.id), "kompakcja"]);
  for (const m of METAFORY) {
    for (const r of Object.keys(m.rozdzialy)) assert.ok(id.has(r), `${m.id}: nieznany rozdział ${r}`);
    for (const r of ROZDZIALY.filter(r => m.rozdzialy[r.id]))
      if (r.id !== "swobodny") assert.ok(r.warstwy.filter(x => !m.warstwy.includes(x)).every(x => x === "hooki" || !m.rozdzialy[x]),
        `${m.id}/${r.id}: rozdział o warstwie, której metafora nie ma`);
  }
});

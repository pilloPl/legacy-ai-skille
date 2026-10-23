#!/usr/bin/env node
// purpose-structure-map: lays the problem (questions of a concept-explorer result) on the solution (call-graph.json of the
// same island). Deterministic matching: a question sits on every method whose line range contains a file:line the
// result cites for it (evidence, callers, decision `where`, criteria `anchors`/`places`). Questions without a hit go to
// the "dropped" list with the reason. Writes purpose-structure-map.json and purpose-structure-map.html (offline,
// data embedded in the view template). Node 18+, no npm install.
// Crossing: for the chosen questions (behind a pain; --all: every placed question) writes crossing-input.json — one row
// per caller method, reached by walking up through the island to the first caller outside it. Claude fills crossing.json
// (crossing.md: CO in the problem's language, JAK in the code's, with the answer's structure and variants); when it sits
// in the out dir, it is checked and embedded.
//
// Usage: node build.mjs <area>-current-model.json <call-graph.json> [--out <dir>] [--all]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const oi = args.indexOf("--out"); const outArg = oi >= 0 ? args.splice(oi, 2)[1] : null;
const ai = args.indexOf("--all"); const ALL = ai >= 0; if (ALL) args.splice(ai, 1);
const [modelPath, graphPath] = args;
if (!modelPath || !graphPath) { console.error("usage: build.mjs <area>-current-model.json <call-graph.json> [--out <dir>]"); process.exit(2); }
const out = resolve(outArg ?? dirname(resolve(modelPath)));   // default: next to the model (analiza/<area>/)
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const graph = JSON.parse(readFileSync(graphPath, "utf8"));

const norm = f => (f || "").replaceAll("\\", "/");
const byFile = new Map();
for (const m of graph.methods) { const f = norm(m.file); if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(m); }
// "path/File.java:12-30 (note)" | "path/File.java:12" | "File.java:12"  →  {file, from, to}
function place(at) {
  const m = /^\s*([^\s:()]+\.[A-Za-z0-9]+)(?::(\d+)(?:\s*[-–]\s*(\d+))?)?/.exec(String(at || ""));
  if (!m) return null;
  let file = norm(m[1]);
  if (!byFile.has(file)) {                              // short path → unique suffix match
    const hits = [...byFile.keys()].filter(f => f.endsWith("/" + file) || f === file);
    if (hits.length === 1) file = hits[0];
  }
  return { file, from: m[2] ? +m[2] : null, to: m[3] ? +m[3] : (m[2] ? +m[2] : null) };
}
function methodsAt(p) {
  if (!p || !byFile.has(p.file) || p.from == null) return [];
  return byFile.get(p.file).filter(m => m.start_line <= p.to && (m.end_line ?? m.start_line) >= p.from).map(m => m.id);
}

const islands = model.islands || [];
const island = islands[0] || {};
const questions = islands.flatMap(i => i.questions || []);
const tree = model.question_tree || {};
// every decision-tree node that names a question, with the places of its subtree
const decOf = new Map();                                 // question id → [decision id]
const treePlaces = new Map();                            // question id → [{at, source}]
function walk(n, top) {
  const own = [...(n.where || []), ...(n.anchors || []), ...(n.places || [])].map(p => typeof p === "string" ? p : p?.at).filter(Boolean);
  const sub = []; for (const c of n.children || []) sub.push(...walk(c, top));
  const all = [...own.map(at => ({ at, source: n.id })), ...sub];
  for (const q of n.question_ids || []) {
    if (!decOf.has(q)) decOf.set(q, []); decOf.get(q).push(top.id);
    if (!treePlaces.has(q)) treePlaces.set(q, []); treePlaces.get(q).push(...all);
  }
  return all;
}
for (const d of tree.decisions || []) walk(d, d);

const short = (s, n = 46) => { s = String(s || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const c = s.slice(0, n); return c.slice(0, Math.max(c.lastIndexOf(" "), n - 12)) + "…"; };
// pains sit on top questions: a generalization group (group_id) or an ungrouped decision (decision_id).
// Every question under a pained top question is "behind the pain" (crossing selection); the mark itself stays on the top.
// Older results put pains on single questions (question_id) — still read.
const genGroups = (tree.generalization?.groups || []).map((g, i) => ({ ...g, id: g.id || "G" + (i + 1) }));
const sameDec = (a, b) => a === b || a.startsWith(b + ".") || b.startsWith(a + ".");
const painG = new Map(), painD = new Map(), painQ = new Map();
const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
for (const p of islands.flatMap(i => i.pains || [])) for (const pu of p.purpose || []) {
  const v = { id: p.id, rank: p.rank, thing: p.thing, reports: pu.reports ?? null, why: pu.why || "", domain_question: pu.domain_question };
  const g = pu.group_id ? genGroups.find(x => x.id === pu.group_id) : pu.top_question ? genGroups.find(x => x.name === pu.top_question) : null;
  if (g) push(painG, g.id, { ...v, on: "group" }); else if (pu.decision_id && !pu.question_id) push(painD, pu.decision_id, { ...v, on: "decision" });
  else if (pu.question_id) push(painQ, pu.question_id, { ...v, on: "question" });
}
const painsOf = (qid, decs) => [
  ...(painQ.get(qid) || []),
  ...[...painD].filter(([d]) => decs.some(x => sameDec(x, d))).flatMap(([, v]) => v),
  ...genGroups.filter(g => painG.has(g.id) && decs.some(x => (g.decisions || []).some(y => sameDec(x, y)))).flatMap(g => painG.get(g.id)),
].filter((v, i, a) => a.findIndex(w => w.id === v.id) === i);

const outQ = [], dropped = [];
for (const q of questions) {
  const verdict = q.verdict?.label || q.verdict?.verdict || q.verdict || null;
  if (String(verdict).toUpperCase().includes("REJECTED")) { dropped.push({ id: q.id, text: q.phrasing?.domain || q.question, reason: "odrzucone przez krytyka (REJECTED)" }); continue; }
  const cites = [
    ...(q.evidence || []).map(e => ({ at: typeof e === "string" ? e : e.at, source: "evidence" })),
    ...(q.callers || []).map(c => ({ at: c.at, source: "callers" })),
    ...(treePlaces.get(q.id) || []),
  ].filter(c => c.at);
  const hits = new Map();                                // method id → [source]
  let outside = 0, noLine = 0;
  for (const c of cites) {
    const p = place(c.at);
    if (!p || !byFile.has(p.file)) { outside++; continue; }
    if (p.from == null) { noLine++; continue; }
    for (const id of methodsAt(p)) { if (!hits.has(id)) hits.set(id, []); hits.get(id).push(`${c.source}: ${c.at}`); }
  }
  const text = q.phrasing?.domain || q.question, system = q.phrasing?.system || q.question;
  if (!hits.size) {
    const reason = !cites.length ? "wynik nie podaje miejsca w kodzie (brak file:line)"
      : noLine && !outside ? "miejsca bez numeru linii (sam plik)"
      : `miejsca poza grafem wywołań (${outside} z ${cites.length}: tabele, SQL, XML, pliki spoza wyspy i jej klientów)`;
    dropped.push({ id: q.id, text, reason, cites: cites.map(c => c.at).slice(0, 4) });
    continue;
  }
  outQ.push({ id: q.id, text, system, short: short(text), decisions: [...new Set(decOf.get(q.id) || [])],
    pains: painsOf(q.id, [...new Set(decOf.get(q.id) || [])]), methods: [...hits].map(([id, via]) => ({ id, via })) });
}

// ---------- crossing: question × caller ----------
const methodById = new Map(graph.methods.map(m => [m.id, m]));
const inIsland = new Set((graph.units || []).filter(u => u.in_island).map(u => u.id));
const callsTo = new Map(); for (const c of graph.calls) { if (!callsTo.has(c.to_method)) callsTo.set(c.to_method, []); callsTo.get(c.to_method).push(c); }
const entryAt = new Map((graph.entries || []).map(e => [e.method, e]));
const mref = m => ({ class: (graph.units || []).find(u => u.id === m.unit)?.name || basename(m.file).replace(/\.[^.]+$/, ""), method: m.name,
  file: norm(m.file), start_line: m.start_line, end_line: m.end_line });
const rowKey = (q, m) => `${q}|${norm(m.file)}|${m.name}|${m.start_line}`;
const qModel = new Map(questions.map(q => [q.id, q]));
const chosen = outQ.filter(q => ALL || q.pains.length);
const crossingInput = { $schema_version: "crossing-input/1.0", selection: ALL ? "all" : "pains", repo: graph.repo, source: graph.source, questions: [] };
for (const q of chosen) {
  const qm = qModel.get(q.id) || {};
  // walk up from the methods the question sits on; island methods are passed through, the first method outside is the caller
  const start = q.methods.map(m => m.id).filter(id => methodById.has(id));
  const via = new Map(start.map(id => [id, null])), queue = [...start], rows = new Map();
  const addRow = (mid, kind) => { const m = methodById.get(mid), k = rowKey(q.id, m); if (rows.has(k)) return;
    const path = []; for (let x = mid; x; x = via.get(x)?.to) { const v = via.get(x); path.push({ ...mref(methodById.get(x)), line: v?.line ?? null }); }
    rows.set(k, { row: k, kind, caller: mref(m), entry: entryAt.get(mid) ? { channel: entryAt.get(mid).channel, name: entryAt.get(mid).name, routes: entryAt.get(mid).routes } : null,
      path, sites: [] }); };
  for (const id of start) if (!inIsland.has(methodById.get(id).unit)) addRow(id, "cited");   // the explorer cited a caller outside the island
  while (queue.length) {
    const t = queue.shift(), cs = (callsTo.get(t) || []).filter(c => methodById.has(c.from_method));
    if (!cs.length && inIsland.has(methodById.get(t).unit)) addRow(t, "top-in-island");     // nobody calls it in the graph: look higher in the code
    for (const c of cs) {
      const f = c.from_method;
      if (!via.has(f)) { via.set(f, { to: t, line: c.line }); if (inIsland.has(methodById.get(f).unit)) queue.push(f); else addRow(f, "caller"); }
      const r = rows.get(rowKey(q.id, methodById.get(f)));
      if (r && !r.sites.some(x => x.line === c.line)) r.sites.push({ line: c.line, calls: methodById.get(t).name, rule: c.rule || undefined });
    }
  }
  crossingInput.questions.push({ id: q.id, problem: q.text, system: q.system, decisions: q.decisions.map(d => ({ id: d, text: decText0(d) })),
    pains: q.pains, typical_answers: qm.typical_answers || [], consumers: qm.consumers || [],
    rows: [...rows.values()].sort((a, b) => (a.kind === "top-in-island") - (b.kind === "top-in-island") || a.caller.class.localeCompare(b.caller.class) || a.caller.start_line - b.caller.start_line) });
}
function decText0(d) { return (tree.decisions || []).find(x => x.id === d)?.text || d; }

// crossing.json (written by Claude, crossing.md) — checked against the input; CO must stay in the problem's language
const IDENT = /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*\b|\w+\(|\w+_\w+|\.java\b|\.sql\b|::|\bnull\b|\btrue\b|\bfalse\b/g;
// JAK.answer: what comes back to the caller — shape, exact structure (code), then the meaning: element („of”) and every
// variant the caller tells apart
const SHAPES = ["yes-no", "one", "list", "number", "amount", "date", "text", "none"];
function checkAnswer(a, asks) {
  if (!a) return asks === "no" ? [] : ["JAK bez struktury odpowiedzi (answer)"];
  const m = [];
  if (!SHAPES.includes(a.shape)) m.push(`answer.shape „${a.shape}” spoza ${SHAPES.join(" | ")}`);
  if (!(a.structure || a.type)) m.push("answer.structure pusty (dokładna struktura w kodzie, np. boolean, List<AgreementDTO { issuer, campsites, inherited }>, void + wyjątek)");
  if (["one", "list"].includes(a.shape) && !a.of) m.push(`answer.of pusty: czego jest ${a.shape === "list" ? "lista" : "ten obiekt"}`);
  const v = a.variants || [];
  if (v.length < 2) m.push("answer.variants: mniej niż dwa warianty (także pusta lista, brak, wyjątek)");
  if (v.some(x => !x.value || !x.means)) m.push("answer.variants: wariant bez value albo means");
  const leak = [...new Set([a.of, ...v.map(x => x.means)].join(" ").match(IDENT) || [])];
  if (leak.length) m.push(`answer (of/means) zawiera mechanizm: ${leak.join(", ")}`);
  return m;
}
let crossing = null; const crossingPath = join(out, "crossing.json"); const crossingLog = [];
if (existsSync(crossingPath)) {
  const C = JSON.parse(readFileSync(crossingPath, "utf8"));
  const want = new Map(crossingInput.questions.flatMap(q => q.rows.map(r => [r.row, r])));
  const got = new Map((C.rows || []).map(r => [r.row, r]));
  const missing = [...want.keys()].filter(k => !got.has(k));
  crossing = { questions: crossingInput.questions.map(q => ({ id: q.id, problem: q.problem, summary: (C.questions || []).find(x => x.id === q.id)?.summary || null,
    rows: q.rows.map(r => { const c = got.get(r.row); if (!c) return { ...r, missing: true };
      const leak = [...new Set(String(c.case || "").match(IDENT) || [])];
      if (leak.length) crossingLog.push(`  ${r.row}: CO zawiera mechanizm: ${leak.join(", ")}`);
      const answer = c.answer || null;
      for (const msg of checkAnswer(answer, c.asks || "yes")) crossingLog.push(`  ${r.row}: ${msg}`);
      return { ...r, asks: c.asks || "yes", case: c.case, how: c.how, answer, result: c.result, evidence: c.evidence || [], up: c.up || [], leak }; }) })) };
  if (missing.length) crossingLog.unshift(`  ${missing.length} wierszy bez opisu w crossing.json (np. ${missing[0]})`);
}

const gen = tree.generalization || {};
const decText = Object.fromEntries((tree.decisions || []).map(d => [d.id, d.text]));
const groups = genGroups.map(g => ({ id: g.id, name: g.name, decisions: g.decisions || [], roles: g.roles || {}, pains: painG.get(g.id) || [],
  what_changes: g.what_changes, who_notices: g.who_notices }));
const data = {
  $schema_version: "purpose-structure-map/1.0",
  island: { name: island.name || model.seed, seed: model.seed, verdict: island.concept_verdict?.verdict || island.phase0?.verdict },
  model: resolve(modelPath), call_graph: resolve(graphPath), source: graph.source, repo: graph.repo,
  graph: { island_files: graph.island_files, units: graph.units, methods: graph.methods, calls: graph.calls, entries: graph.entries || [] },
  questions: outQ, dropped, groups, decisions: decText, decision_pains: Object.fromEntries(painD),
  pains: islands.flatMap(i => i.pains || []).map(p => ({ id: p.id, rank: p.rank, thing: p.thing, standalone_value: p.standalone_value })),
  crossing,
  stats: { questions: questions.length, matched: outQ.length, dropped: dropped.length },
};

const here = dirname(fileURLToPath(import.meta.url));
const tpl = readFileSync(join(here, "..", "view.html"), "utf8");
const html = tpl.replace(/<script type="application\/json" id="embedded-data">[\s\S]*?<\/script>/,
  () => `<script type="application/json" id="embedded-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "purpose-structure-map.json"), JSON.stringify(data, null, 2) + "\n");
writeFileSync(join(out, "purpose-structure-map.html"), html);
writeFileSync(join(out, "crossing-input.json"), JSON.stringify(crossingInput, null, 2) + "\n");
console.log(`purpose-structure-map.json, purpose-structure-map.html → ${out}`);
console.log(`${data.stats.questions} questions: ${data.stats.matched} placed on methods, ${data.stats.dropped} dropped` +
  (dropped.length ? "\n" + dropped.map(d => `  ${d.id}: ${d.reason}`).join("\n") : ""));
const nRows = crossingInput.questions.reduce((n, q) => n + q.rows.length, 0);
console.log(`crossing-input.json: ${crossingInput.questions.length} questions (${ALL ? "all" : "behind a pain"}), ${nRows} caller rows` +
  (crossing ? ` · crossing.json embedded` + (crossingLog.length ? "\n" + crossingLog.join("\n") : ", clean") : " · no crossing.json yet (crossing.md)"));

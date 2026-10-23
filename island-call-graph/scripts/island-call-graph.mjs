#!/usr/bin/env node
// island-call-graph: who calls the methods of an island — the full result, deterministic.
// Island = code files in islands[].artifacts[].file of a concept-explorer result (<area>-current-model.json).
// Writes call-graph.json (format: ~/.claude/skills/_shared/call-graph-json.md) and call-graph.md
// (unit → method → callers; "[island]" marks callers inside the island).
// Node 22.13+ (built-in node:sqlite), no npm install. Works the same on Windows, macOS and Linux.
//
// Usage:
//   node island-call-graph.mjs <area>-current-model.json [--repo <dir>] [--out <dir>]   (out: next to the model)
//   node island-call-graph.mjs <area>-current-model.json --from-entry-flows <overlay.json> [--out <dir>]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, extname, join, resolve, dirname } from "node:path";

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`island-call-graph needs Node 22.13+ (built-in node:sqlite); this is Node ${process.versions.node}.`);
  process.exit(2);
}
process.removeAllListeners("warning");           // node:sqlite prints an ExperimentalWarning on some versions
const { DatabaseSync } = await import("node:sqlite");

const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const overlayPath = opt("--from-entry-flows");
let out = opt("--out");
let repo = opt("--repo");
const [modelPath] = args;
if (!modelPath) { console.error("usage: island-call-graph.mjs <area>-current-model.json [--repo <dir>] [--out <dir>] [--from-entry-flows <overlay.json>]"); process.exit(2); }
out = resolve(out ?? dirname(resolve(modelPath)));     // default: next to the model (analiza/<area>/)

const CODE = /\.(java|kt|scala|groovy|cs|vb|ts|tsx|js|jsx|mjs|py|php|rb|go|rs|cpp|cc|c|h|hpp|swift|pks|pkb|pls)$/i;   // .sql (migrations, DDL) are tables, not units
const model = JSON.parse(readFileSync(modelPath, "utf8"));
const islandFiles = [...new Set((model.islands || []).flatMap(i => (i.artifacts || []).map(a => (a.file || "").replaceAll("\\", "/")))
  .filter(f => CODE.test(f)))].sort();
const isTest = f => /(^|\/)(src\/test|test|tests|__tests__)\//.test(f.replaceAll("\\", "/"));
const unitName = f => basename(f, extname(f));

let src;                                           // { methods: Map id→{name,file,start_line,end_line}, calls: [{from,to,line,kind,rule?,note?}], entries }
if (overlayPath) src = fromEntryFlows(JSON.parse(readFileSync(overlayPath, "utf8")));
else {
  repo = resolve(repo ?? ".");
  const dbFile = join(repo, ".codegraph", "codegraph.db");
  if (!existsSync(dbFile)) { console.error(`No CodeGraph index at ${dbFile}. Run "codegraph init" (or "codegraph install --target=claude --yes --init") in the repo first.`); process.exit(3); }
  src = fromCodegraph(new DatabaseSync(dbFile, { readOnly: true }));
}

// --- CodeGraph index: methods of island files, every calls/instantiates edge into them from another file
function fromCodegraph(db) {
  const q = islandFiles.map(() => "?").join(",");
  const methods = new Map();
  for (const m of db.prepare(`select id, name, file_path, start_line, end_line from nodes
      where kind in ('method','function') and file_path in (${q}) order by file_path, start_line`).all(...islandFiles))
    methods.set(m.id, { name: m.name, file: m.file_path, start_line: m.start_line, end_line: m.end_line });
  const calls = [];
  for (const r of db.prepare(`select e.source, e.target, e.line, e.kind, s.name, s.file_path, s.start_line, s.end_line,
        t.kind as t_kind, t.name as t_name, t.file_path as t_file, t.start_line as t_start
      from edges e join nodes s on s.id = e.source join nodes t on t.id = e.target
      where e.kind in ('calls','instantiates') and t.file_path in (${q}) and s.file_path != t.file_path
      order by e.id`).all(...islandFiles)) {
    if (isTest(r.file_path)) continue;
    // "instantiates" points at the class node: show it as a pseudo-method "new" of that class
    if (!methods.has(r.target)) methods.set(r.target, { name: r.t_kind === "class" ? "new" : r.t_name, file: r.t_file, start_line: r.t_start, end_line: r.t_start });
    if (!methods.has(r.source)) methods.set(r.source, { name: r.name, file: r.file_path, start_line: r.start_line, end_line: r.end_line });
    calls.push({ from: r.source, to: r.target, line: r.line, kind: r.kind });
  }
  return { methods, calls, entries: [] };
}

// --- entry-flows overlay: its effective method graph (method_graph replaces the index edges) + entries
function fromEntryFlows(ov) {
  const mg = ov.method_graph;
  if (!mg || mg.operation !== "replace-nodes-and-edges") { console.error("Overlay has no method_graph (entry-flows overlay 1.1+ needed); rebuild it."); process.exit(3); }
  repo = ov.repo;
  const rel = f => (f || "").replaceAll("\\", "/").replace(repo.replaceAll("\\", "/").replace(/\/?$/, "/"), "");
  const node = new Map(mg.nodes.map(n => [n.id, { name: n.name ?? String(n.qn || n.id).split(/[.:#]/).pop(), file: rel(n.file),
    start_line: n.sl ?? n.start_line, end_line: n.el ?? n.end_line ?? n.sl, qn: n.qn, owner: n.owner }]));
  const island = new Set(islandFiles);
  const methods = new Map([...node].filter(([, m]) => island.has(m.file)));
  const calls = [];
  // A hop through an interface/abstract method (Client → Api.m → ApiService.m) is collapsed into one call
  // Client → ApiService.m, so the view shows who really reaches the island; the rule chain stays in `rule`.
  const iface = new Set(new DatabaseSync(ov.graph_db, { readOnly: true })
    .prepare("select id from nodes where kind in ('interface','trait','protocol')").all().map(r => r.id));
  const viaInterface = (e, s) => ["cg-interface-impl", "dispatch"].includes(e.src) || iface.has(s.owner);
  const into = new Map();                            // method id → incoming edges
  for (const e of mg.edges) { if (!into.has(e.target)) into.set(e.target, []); into.get(e.target).push(e); }
  const ruleOf = e => (e.src && !["calls", "instantiates", "codegraph"].includes(e.src) ? e.src : null);
  const seen = new Set();
  const push = (from, to, line, rules, note) => {
    const k = `${from}|${to}|${line}`; if (seen.has(k)) return; seen.add(k);
    if (!methods.has(from)) methods.set(from, node.get(from));
    const c = { from, to, line: line ?? null, kind: "calls" };
    if (rules.length) { c.rule = rules.join("+"); if (note) c.note = note; }
    calls.push(c);
  };
  for (const e of mg.edges) {
    const s = node.get(e.source), t = node.get(e.target);
    if (!s || !t || !island.has(t.file) || s.file === t.file || isTest(s.file)) continue;
    if (viaInterface(e, s) && !island.has(s.file)) {
      for (const p of into.get(e.source) || []) {
        const ps = node.get(p.source);
        if (!ps || ps.file === t.file || isTest(ps.file)) continue;
        push(p.source, e.target, p.line, [ruleOf(p), ruleOf(e) || "interface"].filter(Boolean), `via ${s.qn || s.name}${p.note ? "; " + p.note : ""}`);
      }
      continue;
    }
    push(e.source, e.target, e.line, [ruleOf(e)].filter(Boolean), e.note);
  }
  const reaching = new Set((ov.flows || []).filter(f => (f.witness_path || []).some(id => methods.has(id) && island.has(methods.get(id).file))).map(f => f.entry));
  const entries = (ov.entries || []).filter(e => reaching.has(e.id))
    .map(e => ({ method: e.id, channel: e.channel, name: String(e.qn).split("::").slice(-2).join("."), at: e.at, routes: e.routes || [] }));
  return { methods, calls, entries };
}

// --- call-graph.json
const unitOf = f => f;                              // unit "class": one file = one unit
const units = new Map();
for (const m of src.methods.values()) if (!units.has(unitOf(m.file)))
  units.set(unitOf(m.file), { id: unitOf(m.file), name: unitName(m.file), file: m.file, in_island: islandFiles.includes(m.file) });
for (const f of islandFiles) if (!units.has(f)) units.set(f, { id: f, name: unitName(f), file: f, in_island: true });
const methods = [...src.methods].map(([id, m]) => ({ id, unit: unitOf(m.file), name: m.name, file: m.file, start_line: m.start_line, end_line: m.end_line }))
  .sort((a, b) => a.file.localeCompare(b.file) || a.start_line - b.start_line || a.name.localeCompare(b.name));
const calls = src.calls.map(c => ({ from_method: c.from, to_method: c.to, line: c.line, kind: c.kind, ...(c.rule ? { rule: c.rule } : {}), ...(c.note ? { note: c.note } : {}) }));
const clientUnits = new Set(calls.map(c => src.methods.get(c.from_method).file).filter(f => !islandFiles.includes(f)));
const graph = {
  $schema_version: "call-graph/1.0", source: overlayPath ? "entry-flows" : "codegraph",
  generated_by: "island-call-graph/scripts/island-call-graph.mjs", repo, model: resolve(modelPath), unit: "class",
  island_files: islandFiles, units: [...units.values()].sort((a, b) => b.in_island - a.in_island || a.name.localeCompare(b.name)),
  methods, calls, entries: src.entries,
  stats: { island_units: islandFiles.length, island_methods: methods.filter(m => islandFiles.includes(m.file)).length,
    calls: calls.length, client_units: clientUnits.size, ...(overlayPath ? { rule_calls: calls.filter(c => c.rule).length, entries: src.entries.length } : {}) },
};

// --- call-graph.md: per island unit, per method, all callers as Unit.method:line
const callers = new Map();                          // island method id → Set("Unit.method:line[ [island]]")
for (const c of calls) {
  const s = src.methods.get(c.from_method);
  if (!callers.has(c.to_method)) callers.set(c.to_method, new Set());
  callers.get(c.to_method).add(`${unitName(s.file)}.${s.name}:${c.line}${islandFiles.includes(s.file) ? " [island]" : ""}${c.rule ? ` (${c.rule})` : ""}`);
}
const md = [`# Island clients — ${islandFiles.length} units, ${graph.source}: ${repo}`, ""];
for (const f of islandFiles) {
  const mm = methods.filter(m => m.file === f);
  const ext = new Set(mm.flatMap(m => [...(callers.get(m.id) || [])].filter(k => !k.includes("[island]")).map(k => k.split(".")[0])));
  md.push(`## ${unitName(f)} — ${ext.size} client units outside the island  (${f})`);
  for (const m of mm) {
    const list = [...(callers.get(m.id) || [])].sort((a, b) => a.includes("[island]") - b.includes("[island]") || a.localeCompare(b));
    if (list.length) md.push(`- \`${m.name}\` (line ${m.start_line}) ← ${list.join(", ")}`);
  }
  md.push("");
}
if (graph.entries.length) {
  md.push(`## Entries reaching the island — ${graph.entries.length}`, "");
  for (const e of graph.entries) md.push(`- ${e.channel}: \`${e.name}\` (${e.at})${e.routes.length ? " " + e.routes.join(", ") : ""}`);
  md.push("");
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "call-graph.json"), JSON.stringify(graph, null, 2) + "\n");
writeFileSync(join(out, "call-graph.md"), md.join("\n") + "\n");
console.log(`call-graph.json, call-graph.md → ${out}`);
console.log(`${graph.stats.island_units} island units, ${graph.stats.island_methods} methods, ${graph.stats.calls} calls from ${graph.stats.client_units} client units outside the island` +
  (overlayPath ? `, ${graph.stats.rule_calls} added by entry-flows rules, ${graph.stats.entries} entries` : ""));

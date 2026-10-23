---
disable-model-invocation: true
name: island-call-graph
description: >
  Lists every client of an island of concepts: for each class (unit) of the island found by concept-explorer and each
  of its methods, all production callers as Class.method:line, with calls from inside the island marked. Deterministic —
  a Node script reads the CodeGraph index (or an entry-flows overlay) with SQL, so the same index always gives the same
  result, unlike asking Claude to walk the graph through MCP. Writes call-graph.json (the current structure, format in
  _shared/call-graph-json.md) and call-graph.md. Use when someone asks "who calls the island / this concept", "what is
  the blast radius of changing these classes", "which clients will I have to re-wire", or before purpose-structure-map.
argument-hint: "<area>-current-model.json [--repo <dir>] [--out <dir>] [--from-entry-flows <overlay.json>]"
---

# island-call-graph — who calls the island

## Why a script and not a question to Claude
Claude with CodeGraph over MCP sees the graph through `codegraph_explore`: it picks symbols, gets truncated lists
("+N more"), and decides when it has enough. The index is deterministic; that walk is not — two runs give different
client lists. Completeness belongs in a script: one SQL query over `.codegraph/codegraph.db` returns every edge.
Claude stays useful for what the script cannot do: reading the callers and saying with what intention they call.

## Inputs
- `<area>-current-model.json` — concept-explorer result. The island = code files in `islands[].artifacts[].file`
  (one artifact = one file = one unit). Tables, SQL and XML artifacts are skipped as units.
- The repository with a CodeGraph index (`.codegraph/codegraph.db`). If there is none, tell the user how to create it
  and stop — indexing is their decision:
  - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh`
  - Windows (PowerShell): `irm https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.ps1 | iex`
  - then in the repo: `codegraph install --target=claude --yes --init`
- Node 22.13+ (built-in `node:sqlite`, no npm install). The script stops with a clear message on older Node.

## Run
`<skill-dir>` is this skill's base directory (shown when the skill loads): `.claude/skills/island-call-graph` in a project,
`~/.claude/skills/island-call-graph` when installed globally.
```bash
node <skill-dir>/scripts/island-call-graph.mjs <area>-current-model.json --repo <repo> --out <dir>
```
```powershell
node <skill-dir>\scripts\island-call-graph.mjs <area>-current-model.json --repo <repo> --out <dir>
```
Run it in the repository the session was started in. Default `--repo` is the current directory; default `--out`
is the model's folder (`analiza/<area>/`), so all results of one area stay together.
The model is usually `analiza/<area>/<area>-current-model.json` (workspace: `_shared/evidence-plan.md`, "Location").
If the user gives a path with a placeholder (`<obszar>`, `<area>`), list `analiza/*/*-current-model.json` and use the
only one, or ask which one.

With an entry-flows run on the same island (`entry-flows … --target island`), build the same format from its overlay:
`--from-entry-flows <workdir>/overlay.json`. The overlay's `method_graph` replaces the index edges (it already holds the
edges rules added — dispatch to implementations, `getBean()`, DI), and `entries` lists the entries whose witness paths
reach the island. Calls added by a rule carry `rule` (and `note`).

## Outputs
- `call-graph.json` — `_shared/call-graph-json.md` (units, methods with line ranges, calls, entries, stats).
- `call-graph.md` — per island unit: number of client units outside the island, then per method
  `` `method` (line N) ← Client.method:line, … `` with island callers last, marked `[island]`
  (and `(rule)` for entry-flows edges). Methods without callers are not listed.

## After the run — report
1. The stats line (units, methods, calls, client units).
2. Top island units by number of outside clients, and the methods most called from outside.
3. **Blind spots, always**: calls the index cannot see — `getBean()`/service locators, reflection, interfaces with
   several implementations, SQL on the island's tables, XML wiring, other repositories. Name the ones that apply to
   this repo (grep for `getBean(`, `@Autowired` on interfaces, table names from the model). Do not guess counts.
4. For non-object code (procedures, scripts, COBOL): the unit is not a class; see "Units" in
   `_shared/call-graph-json.md` and say which unit you would use.

## Do not
- Do not answer "who calls X" from memory or from `codegraph_explore` when this script can run — it gives the full list.
- Do not edit `call-graph.json` by hand; fix the input (model, index, overlay) and run again.
- Do not drop the `[island]` callers: they show how the island talks to itself, which matters when cutting it.

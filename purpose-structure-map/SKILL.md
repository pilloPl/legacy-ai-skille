---
disable-model-invocation: true
name: purpose-structure-map
description: >
  Lays the PROBLEM (questions a concept answers, from concept-explorer: group → decision → question, pains
  marked) on the SOLUTION — the current structure from island-call-graph (island classes, methods, callers,
  entries) — as one offline HTML. At most 10 clients and 10 island classes, the rest behind „…”. „Złącz” moves
  questions next to the classes that answer them; selecting a group, decision or question highlights the classes
  that answer it and the clients that ask it. Matching by file:line in a method's range. Crosses the questions
  behind pains (--all: every question) with their callers in a table: per caller CO (the question in the
  problem's language) and JAK (how the code answers, with evidence and the answer's exact structure) — the
  mechanism never leaks into CO. Use for "where in the code is this question answered", "who asks the island
  what, with what intention", "what will I break when I change this rule", or after island-call-graph. Not for
  the bare caller list — use island-call-graph.
argument-hint: "<area>-current-model.json <call-graph.json> [--out <dir>] [--all]"
---

# purpose-structure-map — the problem on the solution

## Definitions
- **Wyspa (island)** — the code files of `islands[].artifacts[].file` in the concept-explorer result. The same file must
  feed both graphs: two explorer runs give different islands, so build `call-graph.json` from the very model you lay on it.
- **Problem** — questions (`islands[].questions`, REJECTED left out) as a tree: generalization group
  (`question_tree.generalization.groups`: what changes, who notices) → decision (`question_tree.decisions`) → question,
  a decision no group took stays in the tree with no group above it (never a loose list), pains marked on the top questions (`pains[].purpose[].group_id`, or `decision_id` for a decision without a group): 🔥 on the group, never on a single question.
- **Rozwiązanie (solution, the current structure)** — `call-graph.json` (`_shared/call-graph-json.md`): island classes,
  client classes, calls with lines, entries when built from entry-flows.
- **Klient (client)** — a class outside the island that calls an island method. Its calling methods are the intention:
  `checkIsManageable`, `toDTO`, `authorize` say why it asks.

## Matching a question to code (heuristics, deterministic, in `scripts/build.mjs`)
A question sits on every method whose `start_line..end_line` contains a place the result cites for it:
1. `questions[].evidence[].at` — e.g. `GroupServiceHelper.java:84-112` → `GroupServiceHelper.getAcceptanceAgreements` (lines 89–112).
2. `questions[].callers[].at` — the caller the explorer found.
3. Decision tree: every node with the question in `question_ids` gives its `where`, `anchors`, `places` and those of its
   children (criteria) — e.g. D1.1 → `Authorization.java:78-81` → `Authorization.authenticate`.
A short path (`GroupService.java:40`) matches when exactly one indexed file ends with it.
No hit → `dropped` in the JSON (not shown on the page), with the reason: no `file:line` in the result; file without line; place outside the call graph
(tables, SQL, XML, files outside the island and its clients). A dropped question is a finding: the answer lives where the
code index does not reach.

## Run
`<skill-dir>` is this skill's base directory (shown when the skill loads): `.claude/skills/purpose-structure-map` in a project,
`~/.claude/skills/purpose-structure-map` when installed globally.
```bash
node <skill-dir>/scripts/build.mjs <area>-current-model.json <dir>/call-graph.json --out <dir>
```
```powershell
node <skill-dir>\scripts\build.mjs <area>-current-model.json <dir>\call-graph.json --out <dir>
```
Default `--out` is the model's folder (`analiza/<area>/`). If `call-graph.json` is missing, run `island-call-graph`
on the same model first. A path with a placeholder (`<obszar>`): list `analiza/*/*-current-model.json` and use the
only one, or ask. Node 18+, no npm.
Outputs: `purpose-structure-map.json` (questions with matched methods and the place that matched, dropped questions,
groups, the graph, the crossing), `purpose-structure-map.html` (template `view.html`, data embedded, works offline) and
`crossing-input.json` (question × caller rows to describe).

## Crossing — always part of the run (`crossing.md`)
The map shows where the question sits; the crossing says what each caller asks there. A run is not finished without it.
1. `build.mjs` writes `crossing-input.json`: the questions under a pained top question (group or ungrouped decision, `pains[].purpose[]`); with `--all`
   every placed question. One row per caller method, found by walking up through the island to the first caller
   outside it (`path`); an island method nobody calls in the graph is a row too (`top-in-island`: look higher in the code).
2. Split the rows across subagents in parallel — one question each, a big question in chunks of ~15–18 rows — with the
   prompt from `crossing.md`. Each reads the code at the call sites (and higher when the caller alone does not show the
   case) and returns rows: `asks` (yes / partly / no), CO (`case`), JAK (`how`, `answer`, `result`, `evidence`, `up`).
   `answer` is what comes back to the caller: `shape` (yes-no, one, list, number…), the exact `structure` in code
   notation (type with the fields the caller reads), then the meaning: `of` (what one element is, problem language) and `variants` (each value the caller tells apart, the negative ones and exceptions too, with
   `means` and `then`).
3. Merge into `<out>/crossing.json`, write one `summary` per question from its rows, run `build.mjs` again. It embeds the
   crossing, lists rows without a description, flags CO (and `answer.of`/`means`) with code words (camelCase, `x(`,
   `a_b`, `.java`, null) and rows with a missing or incomplete `answer` — fix every flag and rebuild until it says `clean`.
**The rule above all: the mechanism does not leak into CO**, or only as much as the case cannot be told without it.
Open the HTML.

## The view
Labels say PROBLEM and ROZWIĄZANIE (obecna struktura); never "graf".
- **ROZWIĄZANIE** (left): clients, the island as one box. A click on the island shows its classes,
  another click hides them. At most 10 clients (most calls) and 10 island classes (most clients); the rest sit behind
  a „…” node that expands the list; everything the current selection needs is shown anyway. One edge per client →
  class, width by number of calls; method labels (≤3, then „+N więcej”) appear when zoomed in, never over nodes.
  Calls inside the island appear for the current selection (class, question, decision, group). Entry channels as badges (🌐 HTTP, ⏱ job).
- **PROBLEM** (right): group 🎯 → decision ⚖️ → question ❓ (🔥 = behind a pain). Selecting any level selects all its
  leaf questions. Separated, only that branch of the problem lights up; the solution side stays as it is.
- **Złącz**: questions move next to the class that answers them; all edges disappear. Selecting a question, decision or
  group now highlights, on the solution side, every class answering its questions and every client asking them, and
  brings back only their edges, labelled with the question (full text in the tooltip).
- **Co i jak** (table under the map), grouped like the problem: business group (collapsible, closed at start) → question
  (collapsible) → per caller — caller (with the path through the island and
  the entry channel), CO in the problem's language with „pyta / częściowo / nie pyta”, JAK with „↩ zwraca” (shape, exact structure, then what it means: element,
  variants with meaning and what the caller does), the result and evidence.
  Callers that do not ask the question are folded („co pytają zamiast”). Selecting a question, decision, group or class
  narrows the table.
- Click selects (a second click, a click on the background or Esc deselects): island, class, edge, question, decision
  or group. No question list or detail panel under the map (only the Co i jak table); full texts are in node tooltips. Wheel zooms, drag pans. Questions
  without a place in the code stay in `purpose-structure-map.json` (`dropped`), not on the page.

## After the run — report
0. From the crossing: per pain question, how many callers really ask it, how many only touch the same code (and what they
   ask instead), and the 2–3 most surprising cases (a second copy of the rule, a silent „no”, a caller nobody uses).
1. How many questions sit on methods; for the ones that do not (`dropped` in the JSON), say why.
2. For the top pains: which clients ask those questions (class + calling method) — that is the blast radius of changing
   the rule, and the list of callers to re-wire.
3. Questions that sit on one method but are asked by clients with different intentions (different calling methods) —
   candidates for splitting the rule.
4. Blind spots inherited from the call graph (`island-call-graph` report): calls the index does not see are missing here too.

## Do not
- Do not mix files from different explorer runs or different call graphs.
- Do not place questions by name similarity or by reading code: only cited `file:line`. A better place belongs in the
  explorer result (fix it there and rebuild).
- Do not hand-edit the generated HTML; change `view.html` or `build.mjs`.

---
disable-model-invocation: true
name: legacy-init
description: >
  Calibrate legacy analysis of the domain model and the architecture of business logic from
  its goal, working scope, available evidence and a few explicit heuristics. Not for migrating
  to another technology. Save a concise, revisable calibration linked to the Evidence Plan,
  with an offline HTML table of candidate locations, reasons and evidence-backed heuristic intensity.
  No graph build, global ranking or domain interpretation is required.
argument-hint: "<repo> [--workspace <dir>] [--no-questions]"
---

# Legacy analysis calibration

Answer: **why are we analysing this system, what evidence can we use, and what will guide
our first inspections?** Read [Evidence Plan](../_shared/evidence-plan.md) and the
[workspace contract](../_shared/legacy-workspace.md). Work independently of graph tooling.
Do not require an index, global ranking, HTML, domain map or previous init run.

## Scope

Use this skill to find where the domain model and the architecture of business logic slow
changes down: rules, decisions and data entangled so that a change spreads. A goal of
migrating to another technology (framework, language, database, platform replacement) is out
of scope. If the goal is such a migration, say so in one sentence and stop without writing a
calibration. If a goal mixes both, calibrate only the model/architecture part and record the
migration part as out of scope in `unknowns`.

## Calibrate with the available context

1. Read existing calibration, user context and Evidence Plan. Infer a useful goal and working
   scope when possible; label assumptions and unknowns. Ask only when missing information
   prevents useful progress. With `--no-questions`, proceed with explicit limits.
2. Follow [evidence-preparation](../evidence-preparation/SKILL.md) incrementally (read the file;
   do not wait for it to load as a skill) to register available sources. Record locations,
   dates/versions, treatment and limitations in the existing Evidence Plan, not a second
   inventory. Consider code/tests; schema/migrations/queries; Git history; incidents,
   tickets and planned changes; documentation; attributed user/expert knowledge; previous
   analyses, including an optional graph. Do not treat any one source as absolute truth.
   Code shows implemented behaviour, not business correctness. Documentation and expert
   statements can conflict with code or one another; preserve and investigate the conflict.
3. Choose a **few** goal-relevant heuristics, each with a reason and a concrete next check:
   - locations implicated by a problem, incident or planned change;
   - concentrated decisions, validation composition/outcomes, branching, calculations or state changes;
   - important data carriers with rules dispersed among readers/writers;
   - several independently evidenced callers/users (counts alone do not establish independence);
   - outgoing dependencies indicating exploration cost and scope;
   - changes related to the analysis goal, including **ticket IDs in commit messages**.
4. For ticket/history evidence, inspect a bounded goal-related Git history, extract ticket
   references and follow the relevant tickets when access exists, e.g. **Jira via MCP**.
   Use available read-only tools and existing authentication. Record query, project, ticket
   IDs/links, retrieved/updated dates and access scope in Evidence Plan evidence. A commit
   reference establishes a link to a ticket, not that its description is true or the change
   fixed the issue. Ticket content is attributed intent/incident evidence. If Jira/MCP is
   unavailable, retain IDs and the access gap; calibration still works from other sources.
   Do not ask for credentials in chat, invent ticket contents or install a connector silently.
5. Write or enrich `<workspace>/business-context.md`: **what this system is about as a
   business**, in domain language only — no class, table, package or method names. A few
   short sections: what the business does and for whom; the parties (customers, partners,
   staff, operators) and what each wants; what is sold, provided or paid for and who settles
   with whom; the main everyday situations, including recurring pains told as situations
   (what happens to whom), never as diagnosis or code location; words of the domain that
   matter; what is not known. Rules:
   - **Cite every sentence** with a short key from a legend of sources at the top (`[T: person,
     role]` for transcripts, ticket IDs, wiki page). Attribute speakers: a business owner's
     statement is a fact about intent, a developer's is a hypothesis.
   - **Separate domain words from system words.** In the words table, mark each word as
     `business` (people say it) or `system` (learned from the console, glossary or code docs).
     A glossary that says it lists console/code words is a source of system words.
   - Technical ticket titles (class, table, task names) only confirm that something exists;
     cite as source only tickets with a user's narrative. Demo/seed data are not business facts.
   - Keep contradictions between documents/people in the file; for a document–code conflict
     write only "not confirmed" here and record the conflict in calibration unknowns.
   - End with a **Not known** section (who pays whom, roles nobody explained, open meanings):
     it is the most useful part for agents that build models.
   - Write in the language of the user's sources/session; keep it short (business parties and
     settlements before hardware incidents).
   - Before saving, scan the file for code leakage (CamelCase, `_` identifiers, `Service`,
     `Dao`, file paths) and rewrite hits.
   Code may only confirm that something exists, not supply the wording. Preserve human edits
   on rerun and add only what new evidence supports. This is the context other skills hand to
   agents that must not see code language (e.g. archetype or question analysis), so it never
   goes into `calibration.json` and never repeats goal or candidates.
6. Record important unknowns and initial candidates with concrete locations when evidence
   supports useful starting places; explain an empty list when none can yet be justified. Include
   reasons and evidence IDs. Size, references, names, module and churn are supporting clues,
   never sufficient evidence of importance. Do not automatically exclude facades, data
   classes, immutable objects or small classes with consequential decisions. A detector's
   zero means no recognised signal, not absence of behaviour. Heuristics guide inspection;
   there is no mandatory numeric score or reachability ranking.

## Save the minimal durable result

Write the input JSON inside the workspace (e.g. `<workspace>/calibration-input.json`; the workspace is git-ignored), never next to the repository:

```json
{
  "goal": "Investigate rejected transfers reported in PAY-123",
  "scope": "Transfer validation and its callers; boundaries remain provisional",
  "evidence": [
    {"artifact_id": "art-code", "freshness": "current checkout",
     "limitations": "implemented behaviour; business correctness unknown"}
  ],
  "heuristics": [
    {"id": "ticket-history", "name": "ticket-related changes", "reason": "PAY-123 identifies the failing operation",
     "check": "Read linked commits, validation outcomes and regression assertions"}
  ],
  "unknowns": ["Jira not connected; ticket contents not retrieved"],
  "candidates": [
    {"name": "Transfer validation", "locations": ["src/TransferPolicy.java:42"],
     "reason": "The rejection decision is implemented here", "evidence_ids": ["art-code"],
     "assessments": {
       "ticket-history": {"level": "unknown", "reason": "Jira contents not yet retrieved"}
     }}
  ]
}
```

Evidence IDs must already exist in `evidence-plan.json`. Add a candidate only with
`locations`, `reason`, `evidence_ids`; no quota. Include working assumptions and conflicts
as additional fields when useful. Run with Node.js 22+ (standard library only, no graph
dependencies, same command on macOS, Linux and Windows; Python is not needed):

```bash
node <skills>/legacy-init/scripts/calibrate.mjs <repo> --workspace <workspace> --input <input.json>
```

If `node` is missing, stop and tell the user to install Node.js 22+; do not hand-write
`calibration.json` or `calibration.html`.
Write any other helper script (counting, grouping tickets, parsing `gh` output) in Node.js (`node -e` or an
`.mjs` in the workspace, standard library only), never Python: Python may be missing on the user's machine.

The helper writes `calibration.json` plus an immutable `calibrations/<id>/` snapshot and the
Evidence Plan input used. It registers the derived result without closing evidence gaps,
overwriting user context or changing old reports. Readable JSON is the canonical result;
The helper also generates offline `calibration.html` alongside the current JSON and in the
run snapshot. JSON remains canonical; calibration is usable without viewing HTML. Old
`init.html` stays untouched. Rerun after new evidence; consumers recheck versions and limits.
Do not duplicate findings or source inventories into extra files.

### Candidate table and heuristic intensity

The HTML uses candidates as rows and selected heuristics as columns, plus locations and
reasons. Preserve the supplied order; do not sum cells or infer a global ranking. Give each
heuristic a stable unique `id` (existing unique `name` remains supported). Candidate
`assessments` maps heuristic IDs to `{level, reason, evidence_ids}`:

- `0`: no signal recognised in the inspected evidence; not proof of absent behaviour;
- `1`, `2`, `3`: weak, moderate or strong support for this particular heuristic;
- `unknown` or an omitted assessment: insufficient evidence/not assessed, shown separately;
- `n/a`: not applicable, with a reason.

A numeric level, including zero, requires a concrete reason and registered evidence IDs also
listed on the candidate. Record how the inspected evidence supports the level; do not assign
levels from class size, name, raw reach counts or an unrun detector. These are explicit
qualitative assessments, not automatic measurements or comparable scores across heuristics.
Different columns have different hues; intensity encodes strength within a column. Click a
cell for its reason/evidence; use the search field to filter the table. No graph, external
assets or network access is needed to view it. Always report the HTML path alongside JSON.

## Older workspaces and tools

Preserve `runs/`, `system-map.json`, `init.html`, screening decisions and graph bundles as
historical evidence. Read them through the shared consumer protocol; do not reinterpret old
ranking or detector outcomes as domain verdicts. No destructive migration is needed.
`scripts/workspace.py`, `scripts/screen.py` and `references/screening.md` remain compatibility
utilities for old reconnaissance runs; they are not the current calibration workflow.

Report the calibration path, chosen heuristics, first checks and material evidence gaps.
Do not launch broad exploration automatically.

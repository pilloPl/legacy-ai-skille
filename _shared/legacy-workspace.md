# Persistent legacy analysis workspace

Responsibilities are separate: `legacy-init` calibrates **goal/evidence/heuristics**;
`code-evidence-graph` maintains graph bundles and scoped queries using the `entry-flows`
engine; explorers establish meaning and working island boundaries. All work independently.
Reuse [Evidence Plan](evidence-plan.md) as the canonical evidence inventory, never a second
source registry. Graph observations are derived artifacts, not independent business evidence.

Use `--workspace` or `<repo>/analiza/` in the repository the session was started in, ignored
by git through its own `.gitignore` (`*`) — see [Evidence Plan](evidence-plan.md), "Location". Verify repository identity. Keep human context and existing area outputs.

```text
<workspace>/
  evidence-plan.json                 # canonical evidence inventory, gaps and log
  evidence/                          # source notes/exports, including ticket/MCP evidence
  project-context.md                 # existing human context, preserved when present
  business-context.md                # what the system is about as a business, domain language
                                     # only, sourced; written by legacy-init, edits preserved
  analysis-repository.json            # repository identity for new runs
  calibration.json                   # latest lightweight calibration; no graph required
  calibration.html                   # offline candidate/heuristic table, derived from JSON
  calibrations/<id>/
    calibration.html                 # preserved offline view; old init.html is untouched
    calibration.json                 # goal, scope, Evidence Plan IDs/limits, heuristics,
                                     # unknowns and optional reasoned candidate locations
    evidence-plan-input.json          # inventory version used; no duplicated source content
  rules/, strategies/                # optional project-local extensions and registry
  graphs/<id>/
    manifest.json                    # source file hashes/revision, config/artifact hashes,
                                     # engine/rule versions, coverage and run binding
    requested-config.json, config.json
    sources/                         # source bodies referenced by graph and rule evidence
    engine/                          # frozen entry-flows engine/strategies/built-in rules
    rules/                           # frozen project rules and evidence/check registry
    graph.db, overlay.json           # base evidence + authoritative method projection
    detect.json                      # when detection/fallback was run
    extraction-*.jsonl               # fallback inputs when applicable
    graph-stats.json, commands.log
    verify.json, unreach.json, verify-overlay.json
    semantic-review.json             # run-bound per-relation semantic verdicts
    queries/<id>.json                # scope, binding, freshness, paths/status/limitations
  <area>/                            # explorers' existing canonical outputs
  runs/, system-map.json, init.html   # historical reconnaissance, when present
```

`graph.pkl`/`flows.pkl` are trusted local execution caches, not interchange contracts. Never
load a pickle supplied as evidence. `graph.db` alone omits corrections. New overlay
`method_graph` uses explicit replacement semantics to reconstruct the actual multigraph;
its edge set must not be unioned with raw base edges. Preserve base DB, overlay, configuration,
source state, rule snapshots/justifications and check results as one bundle.

## Consumer protocol — read at the start of an analysis

1. Read relevant `calibration.json`, human context and Evidence Plan when present. No init,
   graph, candidate index or HTML is a prerequisite. Standalone analysis stays supported.
2. Calibration supplies purpose, working scope, heuristics and evidence limits. Recheck source
   freshness; update calibration after new evidence. Do not turn a heuristic or detector zero
   into a verdict. Code, documentation, tickets and experts each have scope and limitations.
3. For graph questions use an explicit scope with `code-evidence-graph`; it builds without
   calibration. Check manifest, query freshness, coverage and semantic statuses, not merely
   successful symbol checks. Reach is a static observation, never runtime use or domain value.
   A no-path result is inconclusive; witnesses are representative, not all paths. No-target
   checks establish no target-specific completeness. Refuted/unclear items remain visible.
4. Establish island boundaries and meaning through exploration, not graph topology. A scope
   can expand or split after evidence; facades/data classes/small classes are not exclusions.
5. Write the owning skill's canonical outputs under `<area>/`. Register new evidence and
   derived outputs incrementally in Evidence Plan, with input revisions and limits. Do not
   duplicate findings in calibration/context or rewrite another skill's verdict.

## Existing workspaces and freshness

Preserve old `INDEX.md`, `system-map.json`, `init.html`, `runs/`, `screening.json`, evidence,
user corrections and per-area outputs. Read old candidates as source-location leads, not
confirmed islands or a required ranking. Follow their run/source/check pointers. Missing
provenance means freshness **unknown**. The old publication/screening scripts remain
compatibility tools; no destructive migration is required. New calibrations and graphs use
separate directories and leave history untouched. Old graph overlays without a lossless
projection must be rebuilt before new queries; keep the originals for audit.

Full graph rebuilds are allowed. Refresh the base index/extraction when code changes, freeze
new rules and rerun checks and scope queries. Old semantic verdicts are never silently
transferred. A current graph can be incomplete; a reviewed result can be stale. No watcher,
automatic domain-output invalidation or automatic semantic version comparison is installed.

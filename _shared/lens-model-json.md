# Shared reference — the lens-model JSON (`*-lenses.json`)

> Single source of truth for the **structured JSON** emitted by `representation-lens-explorer`.
> Separate artifact and separate dashboard from the current-model JSON (`current-model-json.md`):
> that one is the archaeology of what exists (post-critic); this one is the forward-looking
> proposal of better representations + new questions. Style is **convention + example**, not a
> formal JSON Schema. Reference this file; do not duplicate it into the skill body.

## Who writes it and when

The lens-explorer runs **after** the post-critic current-model file exists. It **consumes**
`<seed>-current-model.json` (questions as targets, latent_representations as the Current model,
structure_induced to avoid proposing lenses for pseudo-questions) and **writes** its own
`<seed>-lenses.json` + `<seed>-lenses.html` dashboard. It never rewrites the current-model file.

## Cross-linking

Lenses reference the current-model by id, so the two dashboards line up:
- `lens.existing_questions_improved[].question_id` → a `Q*` in the current-model JSON.
- `lens.coverage.existing` → the list of `Q*` this lens improves.
- `lens.current_model` restates that question's `latent_representation` as `Host / Embedded`
  (host named concretely — see `reference-representations.md`).

## Viewer

`~/.claude/skills/_shared/lens-dashboard.html` is the generic, self-contained dashboard for this
schema. The lens-explorer emits `<seed>-lenses.html` by embedding the JSON into that template
(same mechanism as the current-model dashboard: replace the `embedded-data` line). The blank
template loads any `*-lenses.json` via drag-drop / file picker. Keep this schema and that viewer
in sync.

## Top-level shape

```jsonc
{
  "$schema_version": "lens-model/1.0",
  "seed": "<seed noun>",
  "source_current_model": "<seed>-current-model.json",   // provenance of the questions/ids
  "lenses": [ <lens>, ... ]                              // one object per proposed model/representation
}
```

## `lens` (one per proposed representation)

```jsonc
{
  "id": "L1",                            // stable id, referenced by the dashboard
  "model": "state-machine",              // the proposed representation (catalog kind)
  "current_model": {                     // how the system answers these questions TODAY
    "host": "Parcel (entity)",           // concrete host, never bare "entity"
    "host_kind": "entity",
    "embedded": "state-machine",
    "host_style": "anemic | rich",   // OPTIONAL — only when the host has domain logic; omit for a pure data structure (record/event-log/graph). anemic = its data is pulled out and if/switch'd elsewhere.
    "artefacts": "<the scattered encodings that emulate it today>",
    "embedding_evidence": ["path:line", ...]
  },
  "proposed_model": ["State", "Transition", "Guard", ...],   // elements of the proposed model
  "native_operations": ["canTransition()", "allowedTransitions()", ...],
  "visuals": <visuals>,                  // REQUIRED: drawable illustration(s) of this representation
  "why_best": "<question shape → required operation → native operation of this representation>",
  "why_not_alternative": "<why not a neighbouring representation, or null>",
  "existing_questions_improved": [
    { "question_id": "Q1", "question": "<phrasing>", "dominant_operation": "...",
      "confidence": "Low | Medium | High", "becomes_simpler": "<how the answer gets simpler>" }
  ],
  "new_questions_unlocked": [
    { "question": "<newly answerable question>", "native_operation": "...",
      "business_metric": "<what it measures>", "decision_it_changes": "<the action it informs>",
      "usefulness_confidence": "Low | Medium | High",
      "usefulness_grounding": "user-confirmed | inferred | speculative" }
  ],
  "coverage": { "existing": ["Q1","Q2", ...], "new_count": 2 },
  "feasibility_confidence": "Low | Medium | High",
  "smallest_experiment": "<the cheapest thing that would validate the lens>",
  "existing_foothold": "yes | partial | no"     // is there already a partial version in the code?
}
```

## `visuals` — drawable illustration of the representation (REQUIRED per lens)

Every proposed lens must ship a concrete, drawable example so the reader *sees* what the
representation is: **what is a node, what is an edge (or point / state / …), and what a specific
query looks like on it.** Author several `variants` when the same representation admits different
node/edge choices, and per variant give `queries` that highlight the answer to a concrete question
(a cycle, a bridge, nearest neighbours, a dead-end state…). The dashboard draws these inline as SVG
and lets each open full-screen ("subpage"); no external libraries are used.

```jsonc
{
  "kind": "graph | tree | state-machine | bipartite | vector | timeline | set",
  "variants": [
    {
      "title": "Stations as nodes, shared-cable as edges",
      "node": "<what a node/point/state means in this domain>",
      "edge": "<what an edge/link/transition means; for vector: what a dimension/distance means>",
      "purpose": "<why model it this way — the question it makes native>",
      "sample": {
        // GRAPH-family (graph/tree/state-machine/bipartite):
        "directed": false,                       // true for state-machine / dependency graphs
        "nodes": [ { "id": "n1", "label": "St-A", "group": "optional-cluster-or-side", "x": 0.2, "y": 0.3 } ],
        "edges": [ { "from": "n1", "to": "n2", "label": "optional", "directed": false } ]
        // VECTOR: use "points":[{ "id","label","x","y","group" }] instead of nodes/edges
      },
      "queries": [
        { "name": "cycle", "finds": "<what a cycle means here>", "why": "<decision it informs>",
          "highlight": { "nodes": ["n1","n2","n3"], "edges": [["n1","n2"],["n2","n3"],["n3","n1"]] } },
        { "name": "bridge", "finds": "single link whose removal splits the graph", "why": "resilience",
          "highlight": { "edges": [["n3","n4"]] } }
        // VECTOR query highlight uses { "points": ["p1","p2"] } (e.g. nearest neighbours / a cluster)
      ]
    }
  ]
}
```

Conventions:
- `x`/`y` are optional, in `[0,1]` (fractions of the drawing box). Omit them and the dashboard
  lays graph nodes on a circle deterministically; for `vector` they are required (they *are* the
  point positions).
- Keep samples **small** (≈4–9 nodes/points) — they illustrate, they are not the real data.
- Highlight ids/edge-pairs must reference ids present in `sample`.
- `kind: tree` and `state-machine` are drawn by the same graph engine (`state-machine` implies
  `directed:true`); `bipartite` uses `group` to place the two sides.

## Minimal valid example

```json
{
  "$schema_version": "lens-model/1.0",
  "seed": "Parcel",
  "source_current_model": "Parcel-current-model.json",
  "lenses": [
    {
      "id": "L1",
      "model": "state-machine",
      "current_model": {"host": "Parcel (entity)", "host_kind": "entity", "embedded": "state-machine",
        "host_style": "anemic", "artefacts": "3 transition encodings over a status enum",
        "embedding_evidence": ["ParcelStatusMixerImpl.java:201", "DefaultStatusTransitions.java:43"]},
      "proposed_model": ["State", "Transition", "Guard", "CarrierPolicy"],
      "native_operations": ["canTransition()", "allowedTransitions()", "reachableStates()", "whyNot()"],
      "visuals": {
        "kind": "state-machine",
        "variants": [
          {
            "title": "Status as states, allowed transitions as directed edges",
            "node": "a parcel status (CREATED, IN_TRANSIT, DELIVERED, LOST)",
            "edge": "a legal status change",
            "purpose": "make 'what is legal from here / why not' a native lookup",
            "sample": {
              "directed": true,
              "nodes": [
                {"id":"c","label":"CREATED","x":0.1,"y":0.5},
                {"id":"t","label":"IN_TRANSIT","x":0.45,"y":0.5},
                {"id":"d","label":"DELIVERED","x":0.85,"y":0.25},
                {"id":"l","label":"LOST","x":0.85,"y":0.75}
              ],
              "edges": [
                {"from":"c","to":"t"},{"from":"t","to":"d"},{"from":"t","to":"l"},{"from":"l","to":"t"}
              ]
            },
            "queries": [
              {"name":"reachability","finds":"states that cannot reach DELIVERED","why":"stuck parcels",
               "highlight":{"nodes":["l"]}},
              {"name":"dead-end","finds":"a terminal with no egress","why":"missing rescue path",
               "highlight":{"nodes":["d"]}}
            ]
          }
        ]
      },
      "why_best": "Questions ask 'what is legal from here / why not' — native to a state machine.",
      "why_not_alternative": null,
      "existing_questions_improved": [
        {"question_id": "Q1", "question": "Is this transition legal, and if not why?",
         "dominant_operation": "legality + guard-explanation", "confidence": "High",
         "becomes_simpler": "one authoritative relation instead of three that disagree"}
      ],
      "new_questions_unlocked": [
        {"question": "Which states cannot reach a delivered terminal?", "native_operation": "reachability",
         "business_metric": "count of stuck parcels", "decision_it_changes": "fix missing egress",
         "usefulness_confidence": "Medium", "usefulness_grounding": "inferred"}
      ],
      "coverage": {"existing": ["Q1","Q2"], "new_count": 1},
      "feasibility_confidence": "High",
      "smallest_experiment": "offline source×target×carrier matrix flagging disagreeing cells",
      "existing_foothold": "partial"
    }
  ]
}
```

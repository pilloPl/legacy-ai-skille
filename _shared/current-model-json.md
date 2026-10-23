# Shared reference — the machine-readable current-model JSON (`*-current-model.json`)

> Single source of truth for the **structured JSON** of a current-model archaeology audit.
> Style is **convention + example**, not a formal JSON Schema — follow the field conventions
> below and keep it valid JSON. Do not duplicate this into skill bodies — reference this file.

## Layers, files and who writes them

One schema, two layers, written by different skills into the workspace
(`<workspace>/<area>/`, see `evidence-plan.md`):

| Layer | Written by | File |
|---|---|---|
| **Questions** — `phase0`, `vocabulary`, `questions`, `structure_induced`, the `artifacts`/`relations` that answer them | generator → `questions-handoff.json` (interim); **critic** publishes with verdicts | `<area>-current-model.json` + `.html` |
| **Representations** — `latent_representations`, their `artifacts`/`relations`, `evidence_substrate`, `mismatch_pointers`, `unmatched_questions` | `latent-representation-explorer` | `<area>-representations.json` |
| **Merged view** — both layers in one island | `latent-representation-explorer` (merge recipe below) | `<area>-model.html` (+ optionally `<area>-model.json`) |

**The questions layer is published only after the critic runs.** The generator writes
`questions-handoff.json` (same shape, no critic layers) and spawns the critic, which bakes in
its verdicts (`question.verdict`, `island.concept_verdict`, `vocabulary[].critic`) and publishes
`<area>-current-model.json` + `.html`. The lens-explorer (`lens-model-json.md`) consumes the
published questions layer and the representations layer.

### Merge recipe (questions layer + representations layer → merged view)
For each island id present in both: take the questions-layer island; set
`latent_representations` from the representations layer; union `artifacts` by `id` (questions
layer wins on conflict) and `relations` by `(from,to,label)`; set each question's `serves_via`
to the ids of representations whose `serves` contains it; copy `evidence_substrate`,
`mismatch_pointers`, `unmatched_questions`. Run the critic's deterministic prune on the result;
embed into `current-model-dashboard.html`.

## Viewer

`~/.claude/skills/_shared/current-model-dashboard.html` is the generic, self-contained dashboard
for this schema. The critic emits `<seed>-current-model.html` by embedding the JSON into that
template (see the critic's "Required outputs" section); the same template with no embedded data
loads any conforming JSON via drag-drop / file picker. Keep this schema and that viewer in sync —
if you add a field here, render it there.

## Why a mirror

The markdown is for humans; the JSON is for machines. Everything is linked **by id** so
downstream skills can traverse without NLP:

- `latent_representation.serves: [questionId]` — which questions a representation answers today
  (representations layer); `question.serves_via` is its reverse, filled only in the merged view.
- `question.terms[].term_id` → `island.vocabulary[].id` — the contextual meanings a question
  uses; `term` remains the display spelling. Legacy files may resolve by `term` only when
  exactly one glossary entry has that spelling. Never choose the first ambiguous match.
- `structure_induced.guards: [questionId]` — **which real question(s) an invariant protects.**
- `question.flag_for_critic: bool` — the generator's hand-raise for the adversarial pass.

Keep the JSON and the markdown in lockstep: same ids (`Q1`, `SI2`, `R6`, island `I`/`II`),
same evidence `file:line`. If they disagree, the JSON is the contract.

## Top-level shape

```jsonc
{
  "$schema_version": "current-model/1.0",
  "seed": "<seed noun>",
  "scope": "<what phases were run — e.g. Phase0 + section2 + 2b + 3 only>",
  "sources": { "used": [ ... ], "unavailable": [ ... ] },
  "islands": [ <island>, ... ]          // one per semantic island / seed meaning
}
```

## `question_tree` (optional, top level — the grouping layer)

Decision → question → criterion, see `question-definition.md` → "Grouping". Top level because a
decision often spans islands (one decision asks questions of two islands). Written by the
generator in Phase 4c, checked by the critic, drawn by the dashboard's „Drzewo pytań” tab.

```jsonc
"question_tree": {
  "rule": "<the cutting rule in one sentence>",
  "operators": { "AND": "...", "OR": "...", "pierwszy-błąd": "...", "nadpisanie": "...", "routing": "..." },
  "decisions": [
    { "id": "D1", "level": "decyzja", "text": "What to do with the order now?",
      "decider": "system | człowiek (operator, ekran) | system zewnętrzny",
      "where": ["path:line"], "variants": ["execute", "reject", "defer", "queue", "to a human"],
      "operator": "routing", "question_ids": [], "note": null,
      "children": [
        { "id": "D1.1", "level": "pytanie", "text": "Is the instruction inadmissible?",
          "domain": "<domain phrasing>", "negative_effect": "reject", "operator": "pierwszy-błąd",
          "question_ids": ["Q2"], "places": [], "note": null,
          "children": [
            { "id": "D1.1.1", "level": "kryterium", "text": "duplicate on the bus",
              "anchors": ["path:line-line"], "negative_answer": "DUPLIKAT",
              "places": ["other/path:line"],          // duplicate: same semantics elsewhere
              "note": null, "children": [] } ] } ] } ]
}
```

Rules: `question_ids` refer to `islands[].questions[].id`; each question id appears once in the
whole tree. A `pytanie` node's question-children share its `negative_effect` (except
`nadpisanie`/`routing` children). Criteria of human decisions anchor to the DTO/controller/screen
code that shows the field.

## `island`

```jsonc
{
  "id": "I",                            // stable, referenced by nothing yet but keep unique
  "name": "Group / TBL_GROUP",
  "role": "dominant | separate-secondary | ...",
  "phase0": <phase0>,                         // generator's concept interrogation
  "vocabulary": [ <term>, ... ],              // glossary of model words used in the questions (Phenomenon 3)
  "concept_verdict": {                        // ADDED BY THE CRITIC; absent before the critic runs
    "verdict": "entity | mechanism",
    "agrees_with_generator": true,
    "reseed_targets": [ "<concept>", ... ],   // when mechanism
    "note": "<one line — the critic's independent call>"
  },
  "artifacts": [ <artifact>, ... ],           // code/DB inventory that makes up the concept (for the Overview map)
  "relations": [ <relation>, ... ],           // approximate edges between artifacts (for the map; not exhaustive)
  "questions": [ <question>, ... ],           // report section 2 (each may carry a critic `verdict`)
  "structure_induced": [ <structure_induced>, ... ],  // report section 2b
  "entries": [ {"id": "E1", "kind": "endpoint | job | event | protocol | screen | import | cli | other",
                 "name": "<e.g. OCPP Authorize, GroupWebService.move, LocalListJob>",
                 "at": "<file:line of the declaration>", "method": "<Class.method()>",
                 "decisions": ["D1", "D4"]} ],      // Phase 1 IN list as found while navigating; not complete
  "pains": [ <pain>, ... ],                   // generator, Step 9 — biggest pains, judged on top questions (groups)
  "pains_method": "<one sentence: how the pains were ranked — which sources, how many reports, what was weighed>",
  "latent_representations": [ <latent_representation>, ... ],  // representations layer (latent-representation-explorer)
  "evidence_substrate": [ ... ],              // representations layer — {what, evidence[], confidence, stored_or_derivable}
  "mismatch_pointers": [ ... ],               // representations layer — one-line strings, cite Q/R ids
  "unmatched_questions": [ ... ]              // representations layer — {question, reason}
}
```

## `term` (island glossary — Phenomenon 3, heuristics V1/V2)

```jsonc
{
  "id": "V1",                           // stable within the island; required for new outputs
  "term": "dokument",                    // as it appears in the system phrasings (noun or verb)
  "context": "<actor/process/module where this meaning is used>",
  "system_definition": "<membership, identity, lifecycle or behaviour evidenced in this use>",
  "origin": "domain-external | industry-practice | system-taught | internal-only",   // V1
  "origin_evidence": ["prg/jpk.prg:3186", "dokumentacja/oper_dz/oper_dz_05.adoc"],
  "domain_definition": "<what the domain means by it, with its source, or null>",
  "shape": "match | homonym | unknown",  // V2: DOMAIN comparison, not storage layout
  "shape_note": "<evidenced semantic agreement/difference within this context, or what is unknown>",
  "homonym": {                          // optional; retain investigated candidates, even rejected ones
    "status": "candidate | confirmed | rejected",
    "compared_with": ["V2"],            // other glossary ids in this island; [] for domain_definition comparison
    "signals": ["<signal from the shared detection protocol>"],
    "distinguishing_case": {             // null while unavailable; required when confirmed
      "scenario": "<one fixed scenario; state whether derived, tested or observed>",
      "result_here": "<classification/action/answer under this entry's meaning>",
      "result_other": "<result under the identified other meaning>",
      "evidence": ["path:line", "<domain source or other code path>"]
    },
    "alternatives": [ { "explanation": "<projection, downstream filter, separate contexts, bug…>",
                        "finding": "<holds/fails/unresolved and why>", "evidence": ["path:line"] } ],
    "affected_questions": ["Q1"],        // potential impact; V3 decides actual impact per question
    "missing_evidence": ["<specific missing evidence, or empty array>"]
  },
  "evidence": ["path:line", ...],        // includes structure-induced findings (back-propagation)
  "critic": { "origin_revised": "...", "shape_revised": "...", "homonym_status_revised": "candidate | confirmed | rejected", "agrees_with_generator": true, "note": "..." }  // ADDED BY THE CRITIC; omit homonym_status_revised when no candidate investigated
}
```

One entry represents **term + context + meaning**; the same spelling may appear more than
once. Both meanings need sources (use each entry's `evidence`, and the cited domain definition
where relevant). A confirmed homonym needs a distinguishing case and checked alternatives;
confirmation establishes different meanings, not automatically a defect or a vocabulary leak.
A code-to-code contrast can have `homonym.status: confirmed` and `shape: unknown` when domain
evidence is missing. Rejected suspicion does not imply domain `match`. V3 determines impact
for each question. Keep the additive fields optional when reading older 1.0 files.

## Two views over the same JSON

The dashboard renders the same island two ways (tabs):
- **Overview** (default): concept blurb + an **artifact map** (from `artifacts`/`relations`), a terse
  question list (click → evidence + mechanism), and representations (click → code excerpts). No
  `sources`, **no `structure_induced`** shown here. References like `Q1`/`R1` expand inline.
- **Detailed**: the full record (phase0 heuristics, structure_induced, all fields) — the pre-existing view.

## `artifact` (Overview map — what we are analysing)

```jsonc
{
  "id": "a-transit",                    // stable id, referenced by question.answered_by / representation.involves / relations
  "name": "Transit",
  "kind": "entity | db-table | service | helper | controller | repository | other",
  "stateful": true,                     // entities have state (true); services/helpers are stateless (false)
  "maps_to_tables": ["TRANSIT", "transit_proposed_drivers"],  // ONLY for kind:entity — REAL physical tables only (see rigor below); [] otherwise
  "file": "src/main/java/.../Transit.java",
  "note": "<1 line>"
}
```

`file` is exactly one source file path (never a directory, never two files); the dashboard's „Pliki wyspy”
list is the unique `file` values.

**Table rigor — count only REAL physical tables, verified against the ORM model.** `maps_to_tables`
and the `db-table` nodes must be *actual distinct tables*, confirmed from the ORM's table declarations
(EF `ToTable` / migration ModelSnapshot; JPA `@Table`/`@JoinTable`), NOT inferred from class or
navigation names. In particular, do NOT emit a separate table for:
- **several navigations/references to the same entity** — e.g. `MainAccount`/`OwnerAccount`/
  `OperationalAccount` are pointers to one `Account` table, so that is **one** `ACCOUNTS` table, not three;
- **owned types / table-splitting / TPH sub-types** — these live in the owner's (or a single) table;
- **collections mapped as array/JSON columns** (e.g. a `uuid[]` or `jsonb` column) — a column, not a table;
- **graph edges / relationships** — not a table unless there is a genuine edge/join table with its own rows.
Only add a real join table when the ORM actually declares one. When unsure whether two names are one
table, open the ORM config and check `ToTable`/`@Table`; collapse them if they resolve to the same table.
An entity that truly maps to >1 real table shows a `→N` badge and links to those `db-table` nodes.

**Draw LOGICAL tables, not every physical helper table.** Even when several rows *are* separate
physical tables, the map draws one node per **logical** table. Fold into the entity/structure they
serve (and record the physical names in that node's `note`):
- **role / pointer / link tables** whose job is only to designate which row of entity `E` plays a
  role for the aggregate — key = `aggregateId[, role]` plus an FK to `E`, little or no data of their
  own (e.g. `MainAccounts` / `OwnerAccounts` / `OperationalAccounts`, each `DebtPartId[,…] → AccountId`)
  → one **`Accounts`** node, not four;
- the **header / membership / edge tables of a single structure** (e.g. `HistoryGraphs` +
  `HistoryGraphDebtParts` + `HistoryGraphEdges`) → one **`HistoryGraph`** node.
Tables that carry their own substantive domain data (amounts, percentages, share details) stay as
their own nodes. The `→N` badge counts the **logical** tables drawn. Rule of thumb the user gave: *if
it's really the same table (or the same structure) with role distinctions inside, it's one table.*

**Inclusion rule (keep the map honest):** an artifact belongs on the map only if it is referenced
by ≥1 `question.answered_by` or `representation.involves` — or is a `db-table` of such an entity.
Pure side-effect collaborators that answer no question and carry no representation (e.g. an
invoice generator, a loyalty/miles service invoked on completion) are **omitted** — otherwise
clicking them highlights nothing. A helper that genuinely underlies a question (e.g. a distance
calculator behind pricing/matching) belongs — so list it in those questions' `answered_by`.

Viewer styling (fixed convention — code entity vs DB table must read differently at a glance):
`entity` = large rounded box, icon 📦; `db-table` = **smaller** node, icon 🗄️; `service` = ⚙️;
`helper` = 🔧; `controller` = 🌐; `repository` = 🗃️; `other` = ▫️. `stateful:true` gets a state dot.
An entity that maps to >1 table shows a `→N` table badge and links to those `db-table` nodes.

## `relation` (Overview map edges — approximate, not exhaustive)

```jsonc
{ "from": "a-transitservice", "to": "a-transit", "label": "uses" }   // e.g. service→entity "uses", entity→table "maps"
```

## `phase0`

```jsonc
{
  "verdict": "entity | mechanism",      // Phenomenon-2 outcome
  "confidence": "Low | Medium | High",
  "summary": "<one line>",
  "heuristics": {                       // P1–P4; each: {result, note, evidence:[file:line]}
    "P1_external_actor": { "result": "...", "note": "...", "evidence": [ ... ] },
    "P2_vocabulary":     { ... },
    "P3_substitution":   { ... },
    "P4_overload":       { ... }
  },
  "reseed": [                           // [] when verdict == entity
    { "concept": "visibility-scope", "carrier": "subtree containment", "load_bearing": true }
  ],
  "carrier_label": "<noun> = mechanism/carrier (not entity)"  // or "... = entity (no reseed)"
}
```

## `question` (section 2)

Field meanings: `question-definition.md` (what a question is — NOT a CQRS query; guards inside
commands and decisions inside event handling are questions).

```jsonc
{
  "id": "Q1",
  "question": "<system phrasing — what the team says>",
  "phrasing": { "system": "<same as question>", "domain": "<V3 rewrite without load-bearing model terms>" },
  "asked_by": "system | e2e | both",
  "answer_shape": "yes-no+reason | which | how-much | when | why | what-next | what-if",
  "typical_answers": ["No: document 12 not accepted", "No: not sent to clearing", "Yes, after confirmation"],
  "consumers": [ { "at": "path:line or name", "effect": "block | warn-override | override-with-right | branch | display | record | leaves-system", "note": "..." } ],
  "source": { "kind": "stored | derived | rule-data | external-service | composed", "inputs": ["ZB.STAN", "DK.KODOSAKC", "ELB.WSK"] },
  "needed_by": ["command: close batch (menu)", "job: automatic close", "screen: batch list"],
  "terms": [ { "term_id": "V1", "term": "dokument", "load_bearing": true, "why": "<explicit V3 substitution and its effect on cases, answer or asker>" } ],   // term_id must resolve within island.vocabulary; spelling must match
  "confidence": "Low | Medium | High",  // EXISTENCE confidence; "Medium-High" etc. allowed
  "phrasing_confidence": "Low | Medium | High",
  "genesis": "domain-genuine | structure-induced | management-of-mechanism",
  "reseed_concept": "<which reseed concept this really asks about, or null>",
  "evidence": [                         // KEEP FULL — critic re-checks; dashboard "where to look". Each item: a plain "path:line" OR {at, method}
    { "at": "TransitService.java:467-474", "method": "completeTransit()" },  // NAME the business method; for a get/set/field, name the SERVICE entry method instead (e.g. "entry: DriverFeeService.calculateDriverFee()"); keep the line either way
    "TransitService.java:199-207"         // plain string still allowed when no meaningful method
  ],
  "current_path": "<how the system composes the answer today>",
  "serves_via": ["R1", "R2"],           // MERGED VIEW ONLY — filled by the merge recipe from latent_representations[].serves; the question layer leaves it out
  "answered_by": ["a-transit", "a-transitservice"],  // artifacts that answer it (Overview map click ↔ question). Include the CLIENT/CALLER that reads a flag/getter and branches on it — an implicit "is X true?" question lives in the consumer, not just the class. [] or omit ⇒ "all artifacts"
  "callers": [                          // client classes that call the key method / read the flag, or run raw SQL over the table. grep+verify → may be partial.
    { "class": "TransitController", "at": "src/main/java/.../TransitController.java:53", "via": null }  // via: e.g. "interface AwardsService" or "raw SQL over TRANSIT"; [] = none found (dormant signal)
  ],
  "callers_note": "<optional — 'partial: …' when more callers likely (DI/reflection), or 'dormant — no readers'>",
  "consumption": "external | internal | both",  // DEPRECATED summary of `consumers` (leaves-system ⇒ external; others ⇒ internal); kept for old files and old dashboards
  "awkwardness": "<why the current path is awkward, or null>",
  "flag_for_critic": false,             // true for load-bearing terms, candidate/confirmed homonyms, high existence + low phrasing confidence, or suspect genesis
  "verdict": <verdict>,                  // ADDED BY THE CRITIC (see below); absent before the critic runs
  "reconciliation": { "decision": "...", "reason": "..." }   // ADDED BY THE GENERATOR after the critic, only for disputed items
}
```

> A **command or event is not a question**; the questions it needs are. Do not emit "close the
> batch" as a question — emit "may the batch be closed?" (and the questions for its inputs) with
> `needed_by: ["command: close batch"]`.

> **Do NOT mirror the API 1:1.** Questions are business questions, not endpoints. Several endpoints
> may collapse into ONE question; one endpoint may span several. A bare `list/fetch/get X` that only
> exists to *display* data is **not** its own business question unless a client acts on the result —
> look at the **caller**: if some code consumes it, the real question is what that code decides; if it
> only ships data out with nothing acting on it, keep it (at most) as a single question tagged
> `consumption:"external"`, don't inflate one read endpoint into several. Use `consumption` to record
> the external (leaves the system) vs internal (other code consumes) vs both distinction.

> Overview question list stays **terse** — show only `question`; reveal `evidence` (where to look) and
> the `serves_via` representation summary (the mechanism) on click.

### `verdict` — the critic's layer (written post-critic)

The critic annotates each question with the outcome of its adversarial pass. Present only in the
published (post-critic) file:

```jsonc
{
  "verdict": "CONFIRMED-DOMAIN | MODEL-PHRASED | STRUCTURE-INDUCED | REJECTED",
  "confidence_revised": "Low | Medium | High",  // existence; usually revised down from question.confidence
  "phrasing_confidence_revised": "Low | Medium | High",
  "reason": "<what decided it>",
  "killed_by": "P1..P4 | V1..V4 | S1..S5 | null",  // which heuristic settled it
  "load_bearing_terms": ["dokument", "usunąć"],      // the critic's own judgement
  "domain_rephrasing": "<REQUIRED for MODEL-PHRASED: the question in domain words; else null>"
}
```

`MODEL-PHRASED` = a genuine question whose system phrasing carries a term with demonstrated
V3 impact, including a homonym that changes this question's cases, answer or asker. A homonym
label alone does not warrant this verdict. The evidenced domain rephrasing is the real
question. `CONFIRMED-DOMAIN` = genuine, model words cosmetic within this question; respect
phrasing-confidence ceilings when domain evidence remains incomplete.

Same `id` as the question it annotates. A `REJECTED` / `STRUCTURE-INDUCED` verdict does not delete
the question — the dashboard shows it struck-through / re-bucketed so the disagreement stays visible.

## `structure_induced` (section 2b — Phenomenon 1)

```jsonc
{
  "id": "SI2",
  "question": "<the self-maintenance question>",
  "guards": ["Q1", "Q7"],               // which real questions this invariant protects
  "invariant_kind": "structural | domain | hybrid",
  "domain_half": "<domain invariant, or null>",       // required when hybrid
  "structural_half": "<structural invariant / mechanism hygiene>",
  "heuristics": ["S1", "S2", "S5"],     // which S-heuristics fired
  "dissolves_when": "<schema constraint / different representation that removes it>",
  "evidence": ["path:line", ...],
  "confidence": "Low | Medium | High"
}
```

> A `hybrid` MUST split `domain_half` (keep — it is a real question in disguise) from
> `structural_half` (induced). Only the structural part justifies listing it here.

## `latent_representation` (representations layer)

```jsonc
{
  "id": "R6",
  "composite": "Group (Entity, parent pointer) / State-toggle",  // host named CONCRETELY
  "host": {
    "name": "Group",                    // the concrete class/table/field — never bare "entity"
    "kind": "entity | entity-field | graph | tree | set | record | event-log | ...",  // catalog kind
    "carrier": "<the physical thing: self-FK, join table, status column, name-prefix, ...>",
    "style": "anemic | rich",           // OPTIONAL — only when there is domain logic tied to the host. anemic = external code reads the host's own fields, does the decision logic on them, and writes back (bypassing its methods); rich = the host encapsulates it. A facade that ORCHESTRATES (calls the host's own methods, sequences create/split/merge, emits events) is NOT anemia. OMIT for a pure data structure (record/event-log/graph/id-list) — mislabeling it "anemic" is an error.
    "behavior_lives_in": "<class/layer that holds the logic — only when style is set>"
  },
  "embedded": "state-machine | policy-set | bipartite-graph | ...",  // the emulated representation
  "what_it_does": "<plain 1-liner: what this representation IS / does in this system>",   // Overview: shown collapsed
  "embedded_does": "<plain 1-liner: what the embedded representation gives you>",
  "involves": ["a-transit", "a-transitservice"],  // artifacts that carry it (Overview map click ↔ representation). Defaults to host if omitted
  "serves": ["Q5"],                     // questions this representation answers TODAY ([] when no questions were given)
  "question_hint": "<without questions as input: the question it seems to serve, labelled hypothesis; else null>",
  "also_answers": [                     // another existing representation answering / able to answer a question — never a new one
    { "question": "Q7", "status": "answers | could-answer", "how": "<one line>", "evidence": ["path:line"] }
  ],
  "leaks": "<where it crosses module / program / database boundaries, or null>",
  "confidence": "Low | Medium | High",
  "embedding_evidence": ["path:line", ...],  // ≥2 independent places for a latent claim (pointers)
  "code_excerpts": [                    // Overview: revealed ON CLICK — real verbatim code from several places (offline HTML can't read files)
    { "file": "src/main/java/.../TransitService.java", "lines": "419-423", "snippet": "if (!transit.getStatus().equals(...)) { ... }" }
  ],
  "explicit_or_latent": "explicit | latent",
  "note": "<optional>"
}
```

See `reference-representations.md` → "Latent representations are composites" for the naming
rules (`host` must be the concrete type, not the catalog word) and the anemic/rich test.
`what_it_does` / `embedded_does` are the collapsed Overview text; `code_excerpts` (verbatim, from
several places) are the on-click deeper proof — heavier than `embedding_evidence` pointers by design.

## Representations layer — `<area>-representations.json`

```jsonc
{
  "$schema_version": "representations/1.0",
  "seed": "<area / seed>",
  "source_current_model": "<path to <area>-current-model.json, or null>",
  "evidence_plan": "<path to evidence-plan.json>",
  "sources": { "used": [ ... ], "unavailable": [ ... ] },   // from the Evidence Plan
  "islands": [
    { "id": "I",                                  // same island id as the questions layer
      "artifacts": [ <artifact>, ... ],           // those the representations involve
      "relations": [ <relation>, ... ],
      "latent_representations": [ <latent_representation>, ... ],
      "evidence_substrate": [ { "what": "...", "evidence": ["path:line"], "confidence": "...", "stored_or_derivable": "stored | derivable" } ],
      "mismatch_pointers": [ "Q7 (lifecycle question) answered by R2 (three status columns per row) …" ],
      "unmatched_questions": [ { "question": "Q10", "reason": "answer computed ad hoc in one function" } ] }
  ]
}
```

## Consumption contract (downstream skills)

- **Critic** operates on `questions[]`, `structure_induced[]` and `vocabulary[]`: refute
  existence, genesis and phrasing, honour `flag_for_critic`, re-check `evidence` independently,
  and treat `guards` as the map from an invariant back to the real question it defends.
- **latent-representation-explorer** reads the published questions (`phrasing.domain` for
  MODEL-PHRASED ones, `source`, `answered_by`) as pointers to where the current
  representations live, and writes the representations layer.
- **Lens-explorer** reads both layers: `questions[]` (targets, in their domain phrasing and
  answer shape), `latent_representations[]` (the **Current model** it restates as
  `Host / Embedded`), `evidence_substrate`, `mismatch_pointers`, and `structure_induced[]` to
  avoid proposing lenses for pseudo-questions.

## Minimal valid example

```json
{
  "$schema_version": "current-model/1.0",
  "seed": "Parcel",
  "scope": "Phase0 + section2 + 2b + 3",
  "sources": { "used": ["java code", "DDL"], "unavailable": ["git history"] },
  "islands": [
    {
      "id": "I", "name": "Parcel", "role": "dominant",
      "phase0": {
        "verdict": "entity", "confidence": "High", "summary": "Real shipment aggregate.",
        "heuristics": {
          "P1_external_actor": {"result": "yes", "note": "driven by tracking API", "evidence": ["ParcelController.java:40"]},
          "P2_vocabulary": {"result": "edge-ok", "note": "carrier/label vocabulary"},
          "P3_substitution": {"result": "survives"},
          "P4_overload": {"result": "none"}
        },
        "reseed": [], "carrier_label": "Parcel = entity (no reseed)"
      },
      "questions": [
        {"id": "Q1", "question": "What can this parcel legally do next?", "confidence": "High",
         "genesis": "domain-genuine", "reseed_concept": null,
         "evidence": ["ParcelStatusMixerImpl.java:201"], "current_path": "status enum + scattered guards",
         "serves_via": ["R1"], "awkwardness": "transitions smeared across 3 sites", "flag_for_critic": false}
      ],
      "structure_induced": [
        {"id": "SI1", "question": "Is the status value one of the known enum constants?",
         "guards": ["Q1"], "invariant_kind": "structural", "domain_half": null,
         "structural_half": "status string is a legal enum member", "heuristics": ["S1", "S2"],
         "dissolves_when": "typed status column / enum", "evidence": ["ParcelStatusMixerImpl.java:180"],
         "confidence": "Medium"}
      ],
      "latent_representations": [
        {"id": "R1", "composite": "Parcel (Entity) / State-machine",
         "host": {"name": "Parcel", "kind": "entity", "carrier": "status column", "style": "anemic", "behavior_lives_in": "ParcelStatusMixerImpl + service guards"},
         "embedded": "state-machine", "serves": ["Q1"],
         "embedding_evidence": ["ParcelStatusMixerImpl.java:201", "DefaultStatusTransitions.java:43"],
         "explicit_or_latent": "latent"}
      ]
    }
  ]
}
```


## `question_tree.generalization` (generator, Step 8 — decisions grouped by effect)

```jsonc
{
  "passes": 3,                                   // generator + two fresh agents that saw only the decisions file
  "groups": [ {"id": "G1",                    // stable id, G1.. in the order written; pains point at it
               "name": "<what the group decides for the outsider, e.g. Does this card get power on this campsite>",
               "decisions": ["D1", "D4", "D11.2"],  // decision ids, or a question id when only that question belongs
               "roles": {"D4": "= D1 computed in advance on the pedestal", "D11.2": "= D1.2 shown to a person"},
               "who_notices": "<who sees the change>", "what_changes": "<what changes in the world>",
               "count": 3} ]
}
```

The overview shows majority groups (`count * 2 > passes`) as the graph group → decision → question,
each decision with its role, plus one concrete example; counts sit under „Szczegóły”.

## `pain` (generator, Step 9 — pains judged on the top questions)

`islands[].pains` — the 1–3 biggest pains around the island. **A pain is judged and marked only on a top question**:
a generalization group (`question_tree.generalization.groups[].id`, its `name` is the question an outsider asks), or a
decision no majority group took (then the decision is its own top question). Never on a single `Q` or criterion: a
report says which answer went wrong for someone, and that answer is the top question; the questions under it are how
the system computes it.

```jsonc
{
  "id": "B1",
  "rank": 1,
  "thing": "<short name of the thing that hurts, 2–6 words, e.g. „Rynek z prefiksu nazwy”>",
  "pain": "<what goes wrong for people; mechanism words allowed here>",
  "trigger": "<the everyday action that causes it, e.g. renaming a region, moving a campsite>",
  "signals": [ {"kind": "ticket | transcript | wiki | code", "ref": "<id, ¶ or path:line>", "note": "<effect>"} ],
  "weight_basis": "human-reports | code-only",   // code-only = ranked by code signals, confidence at most Low
  "standalone_value": "domain-action | means",  // value heuristic: does it bring value by itself, or serve a bigger goal?
  "observable_goal": "<for a means: the goal other parts of the system or people observe, e.g. the draw priced and billed for the right country>",
  "means_not_goal": "<the part of today's mechanism that is only a means, e.g. market parsed from a name prefix>",
  "structure_induced": ["SI4"],                  // SI ids behind the pain; [] = the pain sits on a genuine domain question
  "purpose": [                                   // the top questions whose answer goes wrong — one entry each
    {"group_id": "G1",                           // or "decision_id": "D9" when no group took that decision
     "top_question": "<the group name / decision text, as it stands>",
     "reports": 3,                               // signals about this top question (0 with code-only)
     "domain_question": "<ONLY when structure_induced is non-empty: an attempt in domain words, without the seed
                         concept or mechanism words; omit otherwise>",
     "why": "<what goes wrong for whom on this top question>"}
  ],
  "one_action_many_answers": {                   // null when the trigger changes one top question only
    "intended": "<the top question the action was meant to change (may be outside the island)>",
    "also_changed": ["<top question>", ...]
  },
  "dissolves_when": "<only from an existing structure_induced item, cite its SI id; else null>",
  "confidence": "Low | Medium | High"
}
```

The dashboard's default view: 1. the question tree left to right (decision → questions, criteria on demand, REJECTED left out, no pain marks; a click jumps to the list), 1b. decisions grouped by effect (`question_tree.generalization`, majority groups, roles in the graph, no counts), 2. a short list of all questions (REJECTED left out, structure-induced tagged, plus the SI bucket), 3. `pains_method` in one sentence and one short line per pain — `thing`, goal or means (`standalone_value`), „po co” (`observable_goal`) and the top questions it hurts (🔥 also on those groups in graph 1b); descriptions, signals and `dissolves_when` sit under „Szczegóły”.

## Critic layers (written by `representation-question-critic`)

- `islands[].critic_summary`: `{counts: {CONFIRMED-DOMAIN|MODEL-PHRASED|STRUCTURE-INDUCED|REJECTED: n}, disagreements: [text], missed: [text]}`.
- `question_tree.critic`: `{agrees: bool, notes: [text]}`.
- `questions[].reconciliation`: `{decision, reason}` written by the generator in Step 6.
The dashboard shows them in the section „Krytyk: co ocenił” and under each question.

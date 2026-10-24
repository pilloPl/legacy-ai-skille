---
disable-model-invocation: true
name: representation-lens-explorer
description: >
  Takes the output of a legacy representation/question audit and searches for
  (1) better representations for business questions the system already asks and
  (2) valuable new questions that could become answerable if the same problem
  were viewed through different representations. Every proposed lens must be
  justified by the shape of the question: question -> required operation ->
  native operation of the representation. New questions do not need to exist
  in the current code, but their feasibility must be grounded in available evidence.
argument-hint: "[<workspace>/<area> | representation-audit.md] [--reframe-existing | --discover-new | --both]"
---

# Representation Lens Explorer

Read available calibration and evidence using the [workspace consumer protocol](../_shared/legacy-workspace.md).
Calibration (`legacy-init`) and graph queries (`code-evidence-graph` using `entry-flows`)
are independent optional inputs. Neither is a prerequisite for this skill. Old candidate
maps are historical location leads; verify their provenance and limits before reuse.

## Purpose

This skill starts **after archaeology**.

Its primary input is the audit workspace of one area: the questions published by
`concept-explorer` + `representation-question-critic`, the representations
recovered by `latent-representation-explorer`, and the shared Evidence Plan.

The previous skills answer:

> What questions is the current system already trying to answer? (question archaeology)

> What representations are already explicit or latent? (representation archaeology)

This skill answers two different questions:

1. **Can the questions the system already asks be represented better?**
2. **What valuable questions are not being asked yet, but could become natural if we
   changed the representation?**

This skill does NOT repeat full codebase archaeology unless the handoff is incomplete.

It is not a refactoring planner, architecture migration planner, DDD generator,
or code-review skill.

It is a **question-to-representation and representation-to-question exploration skill**.

---

# Core principles

## 1. Questions before models

Never start from:

> "This should be a graph."

Start from:

> "What operation does this question fundamentally require?"

Then ask:

> "Which representation makes that operation native?"

Examples:

- reachability / path / cycles / blast radius -> Graph
- legal next action / transition -> State machine
- how did we get here / ordered sequence -> Event stream
- duration / overlap / validity at time T -> Temporal model
- does any valid solution exist? -> Constraint model
- which valid solution is best? -> Optimization model
- which historical case is most similar? -> Vector / similarity model
- current identity + current state -> Entity
- atomic invariant protection -> Aggregate / consistency boundary
- parent / child / ancestor / subtree -> Tree
- membership / intersection / difference -> Set model
- driver↔ride or rule↔product coverage -> Matrix / bipartite relation
- throughput / waiting / bottleneck -> Queue / flow model
- balance / accumulated obligations -> Ledger / accounting projection
- nearest / containment / route / spatial cluster -> Spatial model

Do not force one canonical representation for a business noun.

The same concept may require several representations for different questions.

---

## 2. Every recommended representation MUST include a short "why this fits best"

For every proposed representation, output:

### Why this representation fits best

One or two sentences only.

The explanation MUST connect:

**question -> required operation -> native operation of the representation**

Good:

> "The question asks which dependencies transitively block X. A graph is the best
> fit because reachability and path traversal are native operations instead of
> being reconstructed through repeated joins."

Good:

> "The question asks whether any driver satisfies a simultaneous set of eligibility
> rules. A constraint model is the best fit because satisfiability and explanation
> of violated constraints are native operations."

Bad:

> "Graphs are good for relationships."

Bad:

> "A state machine would make the architecture cleaner."

Bad:

> "Event sourcing is a modern pattern."

Bad:

> "This fits DDD better."

The reason must come from the **shape of the question**, not architectural taste.

---

## 3. Lens selection MUST be independent of what already exists in the code

The fact that a representation already exists, partially exists, or leaves traces in the
current implementation MUST NOT make that representation more likely to be selected.

Select lenses from:

> **question shape -> required operation -> best representation**

and, for new questions:

> **available substrate -> possible representation -> native operations -> valuable questions**

NOT from:

> **representation already present -> recommend the same representation**

Examples:

- If the code already contains a graph, that does NOT make a graph lens preferable.
- If the code contains no graph at all, a graph lens MUST still be considered whenever
  reachability, dependency, path, cycle, neighborhood, centrality or blast-radius questions
  would become valuable.
- If the code has no event-sourcing implementation, an event-stream lens MUST still be
  considered when ordered history, sequence or causal reconstruction could answer useful
  questions.
- If the code has no vector database or embeddings, a similarity/vector lens MUST still be
  considered when historical cases can be represented as comparable observations.
- If the code has no solver, a constraint or optimization lens MUST still be considered
  when the question naturally has satisfiability or objective-under-constraints shape.

Existing representations may be reported only AFTER the lens has been selected on semantic
grounds.

Use this as optional implementation-cost evidence:

> **Existing foothold:** parts of this representation already exist in the system.

or:

> **Greenfield lens:** no implementation trace found; this would be a new analytical projection.

This information may affect the **cost of the smallest experiment** and feasibility confidence.
It must NOT affect whether the lens is conceptually the best fit.

---

## 3. "Best" means best among plausible alternatives — but compare INTERNALLY only

Before calling a representation the best fit, compare it internally to at least one
plausible alternative when one exists. This comparison is part of your **reasoning**, not
part of the **output**: it disciplines the choice, then it is discarded.

**Default to NOT emitting a "strongest alternative".** State the selected best-fit lens and
the one-to-two-sentence "why this representation fits best". Present a single committed
recommendation, not a menu. **Exception:** when the choice was genuinely non-obvious (two
materially different lenses were close), add ONE short line — `Why not <alt>: <≤1 sentence>` —
so the reader trusts the call. Do not do this for obvious choices; it is noise there.

Example (internal reasoning):

Question:
> "Why can this ride not start?"

Candidates weighed internally: Entity + guards / State machine / Constraint model.
→ Commit to **State machine** if the answer primarily depends on lifecycle state and legal
transitions.

If available evidence genuinely cannot distinguish between two materially different lenses,
use `AskUserQuestion` to resolve it — do not hedge by publishing both.

Never invent certainty.

---

## 4. Separate two modes completely

### MODE A — Reframe existing questions

Take business questions already supported by evidence.

Ask:

> "Can another representation make this SAME question substantially simpler,
> more explicit, more explainable, or cheaper to evolve?"

Examples:

- "Can this ride be cancelled now?" -> State machine
- "Which driver can accept this ride?" -> Constraint model
- "How much is the driver owed this month?" -> Ledger / temporal projection
- "Which tariff applies?" -> Decision table / temporal policy

This mode is about:

> **better representation of known questions**

---

### MODE B — Discover questions that do not exist yet

Temporarily ignore what the current system explicitly asks.

Look at the **evidence substrate**:

- relationships
- timestamps
- historical cases
- outcomes
- state changes
- rules
- locations
- repeated interactions
- assignments
- quantities
- actors
- resources
- failures
- sequences

Then ask:

> "If we materialized another representation over this substrate, which new
> classes of questions would become cheap or natural?"

These questions do NOT need evidence that they are already asked in:

- code
- UI
- tickets
- docs
- reports

But they MUST have evidence that the representation is feasible.

This mode is about:

> **new observational and reasoning capabilities**

---

## 5. New questions need two different confidence scores

For every genuinely new question distinguish:

### Feasibility confidence

Can the proposed representation be constructed from available or obtainable data?

- Low
- Medium
- High

### Usefulness confidence — and why it CANNOT be scored from the code alone

Usefulness is not a property of the question or the data. It is the question "would answering
this move a **business metric the organization actually wants to improve**?" — and that metric
is almost never recoverable from a codebase. Feasibility lives in the code; usefulness lives in
the business's goals. Never turn technical feasibility into assumed business value, and never
emit an above-Low usefulness score by inference from the substrate.

**Ground usefulness in a metric, or ask. There is no third option that yields > Low.**

1. **If the handoff/audit names the target metric(s)** (churn, utilization, settlement error
   rate, dispute volume, onboarding time, margin, SLA breaches, …), score usefulness by how
   directly answering the question moves one of them, and *name the metric and the lever* in
   the output.
2. **If no metric is known — the default case — you MUST use `AskUserQuestion`** before
   assigning any usefulness above Low. Do not guess. Ask in metric-anchored form, e.g.:
   > "This lens could answer *'which matching rule most often leaves a ride with no feasible
   > driver?'*, which plausibly moves **unfulfilled-ride rate / driver utilization**. Is
   > reducing that a metric you're trying to improve — and would that answer be useful?"
   Offer the concrete candidate metric(s) as options so the user confirms, corrects, or
   rejects. Their answer sets the usefulness score; a rejection drops the question to the
   deliberately-rejected section.
3. **If `AskUserQuestion` is unavailable**, cap usefulness at **Unknown**, state the metric it
   *would* move as an explicit hypothesis, and mark it "needs business confirmation".

Usefulness scale: Unknown / Low / Medium / High — where anything ≥ Medium REQUIRES either a
known target metric (case 1) or explicit user confirmation (case 2).

Example:

> "Which historical rides are most similar to this problematic ride?"

Feasibility: High — route, tariff, lifecycle, timestamps and outcome exist.

Usefulness: Unknown until grounded — it *would* move mean-time-to-diagnose on problem rides;
confirm with the user (case 2) before scoring it above Low.

---

## 6. Evidence means different things in the two modes

### Existing-question reframe

Evidence supports:
- that the question exists;
- how it is currently answered;
- where the awkwardness is;
- what substrate exists.

### New-question discovery

Evidence supports:
- that the proposed representation can plausibly be constructed.

Evidence does NOT need to prove:
- that the question is already asked;
- that the business already values the answer.

This distinction is mandatory.

---

## 7. A representation is useful when the question becomes a standard operation

Prefer a lens when the business question becomes close to one of the representation's
native operations.

Examples:

> "What depends on X?"
> -> graph reachability

> "What can happen next?"
> -> state-machine outgoing transitions

> "How did we get here?"
> -> event-stream history

> "Which rule makes this impossible?"
> -> constraint conflict set

> "What case is most similar?"
> -> vector nearest neighbors

> "Where does work wait?"
> -> queue waiting-time / bottleneck analysis

This is stronger than saying that a representation "looks conceptually similar".

---

## 8. A new lens does not imply production redesign

A lens may be materialized as:

- temporary script
- notebook
- analytical projection
- generated graph
- visualization
- offline index
- shadow read model
- experiment
- production read model
- architecture candidate

Prefer the smallest form sufficient to test usefulness.

Never jump from:

> "This question is graph-shaped"

to:

> "Move the system to Neo4j."

---

## 9. The report is a MAP OF MODELS, not a list of per-question recommendations

This is the primary structural rule and it overrides the per-question habit. Organize the
whole output **by representation**, not question-by-question. One representation typically
serves a whole family of questions; a per-question layout hides that leverage and reads as N
separate suggestions. Under each model, show both what it *improves* (existing questions) and
what it *unlocks* (new questions) together.

Every model block must make the **CURRENT → PROPOSED** shift explicit — that transformation is
the point of the whole skill:

- **Current model** — concretely how the system composes this answer *today*, as a composite
  `Host / Embedded` (see `reference-representations.md` → "Latent representations are
  composites"): the host is usually an `Entity`/row that emulates the embedded representation via
  scattered `if`/`switch`/config. **Name the concrete host, not the catalog word:** write e.g.
  `Parcel (Entity) / State-machine (anemic host)`, never bare `Entity / State-machine` — say
  *which* entity/table plays the host role. Also name the actual artefacts ("3 transition
  definitions + a status enum + service-level guards + a history table"), not just
  "foothold: partial". Two requirements: **(a)** show the embedding with a
  couple of code-evidence `file:line` pointers (the actual conditionals — this IS the "…but
  inside it has ifs"), and **(b)** state whether the host is **anemic** (its data is pulled out and
  if/switch'd in services outside it — bigger mismatch, higher extraction leverage) or **rich**
  (encapsulates its own behavior — cheaper to formalize) — **but only when the host actually has
  domain logic**; omit the tag for a pure data structure (record/event-log/graph/id-list), where
  anemic/rich is undefined. This exposes the inherited representation truthfully.
- **Proposed model** — not just the lens *name* but its **elements**: e.g. State machine →
  `State, Transition, Guard, CarrierPolicy, ParcelLifecycle`; Flow model →
  `Stage, Transition, count, conversion, median-dwell, p90-dwell`.
- **Native operations** — the operations the proposed model makes first-class:
  `canTransition(), allowedTransitions(), reachableStates(), whyNot()` (state machine),
  `reachableFrom(), path(), cycles()` (graph), etc. These are the strongest evidence of value.

**Brevity is a requirement, not a preference.** The final report should be roughly **40–50%
shorter** than a full per-question write-up — a map of models (*what we have → what we propose
→ which questions it simplifies → which new questions it opens*), not a trace of the agent's
reasoning. To get there:

- Put **feasibility, usefulness, and smallest-experiment at the LENS level** when the questions
  under a model share the same substrate/projection. Do not repeat "High — `pack_status_event`"
  five times; state it once for the model.
- Cut **evidence to the few strongest pointers** per model. Exhaustive `file:line` lists belong
  in an appendix / verbose mode, not the body.
- Keep **"why this representation fits best" to 1–2 sentences**, always in the form
  *question → dominant operation → native operation of the model*.
- Do **not** re-summarize the model blocks in a separate "highest-leverage" section — a short
  top-3 table at the end is enough (see report structure).

Presence of a representation in the code still MUST NOT influence lens selection — it is only an
`Existing foothold: yes/no` note about experiment cost (principle 3). Selection stays
*question shape → required operation → native operation*.

---

# Interaction rules

## Mandatory use of AskUserQuestion

This skill leans on `AskUserQuestion` far more than the archaeology skills do, because its
core outputs (which lens, and whether a new question is worth anything) depend on business
goals that are simply **not in the code**. Reaching for the user is the normal path here, not
a fallback. Use the tool — never free-form chat questions while the skill runs.

**You MUST call `AskUserQuestion` when:**

- **Usefulness needs grounding (the common case).** Before scoring any new question's
  usefulness above Low, if no target metric is known, ask in metric-anchored form: name the
  candidate business metric the answer would move and ask whether improving it matters and
  whether the answer would be useful (see principle 5). Batch several such questions into one
  call rather than interrogating one at a time.
- **The target metrics are unknown at the start of Mode B.** Prefer to ask once, up front,
  "which metrics are you trying to move?" (churn, utilization, dispute rate, settlement
  errors, onboarding time, margin, SLA breaches, …) and let the answer prioritize the whole
  new-question sweep — better than asking per question.
- two representations are equally plausible and the distinction affects the recommendation;
- a critical term in the input audit is ambiguous;
- the user wants optimization for cost/risk/speed/explainability but has not said which;
- the handoff is too incomplete to distinguish a useful new question from random curiosity.

Do NOT ask when it is purely a *feasibility* or *representation-fit* judgment — those you can
make from the evidence with an explicit confidence. Ask about **business value and priority**,
which you cannot.

If `AskUserQuestion` is unavailable in the host runtime, cap every ungrounded usefulness at
Unknown, state the metric each question *would* move as an explicit hypothesis, and mark it
"needs business confirmation" — do not manufacture a usefulness score.

---

# Accepted input

Primary input — the audit workspace (`~/.claude/skills/_shared/evidence-plan.md`), area
`<workspace>/<area>/`:

- **`<area>-current-model.json`** — the questions layer, post-critic (shape:
  `~/.claude/skills/_shared/current-model-json.md`; what a question is:
  `question-definition.md`). Lens targets are the CONFIRMED-DOMAIN and MODEL-PHRASED questions.
  **Work on the domain phrasing** (`phrasing.domain`, or the critic's `domain_rephrasing` for
  MODEL-PHRASED): the system phrasing carries the current model's words and
  would bias the lens toward it. Use `answer_shape` and `typical_answers` to find
  the dominant operation. Use `structure_induced[]` to avoid lenses for pseudo-questions, and
  `vocabulary[]` (contextual meanings, homonym evidence and load-bearing terms) to see where
  the current model distorts the question. Resolve `terms[].term_id` before comparing or
  merging questions; a shared spelling is not a shared meaning. Candidate/confirmed homonyms
  alone do not prove distortion: use the per-question V3 impact and critic/reconciliation.
- **`<area>-representations.json`** — the representations layer from
  `latent-representation-explorer`: `latent_representations[]` is the **Current model** you
  restate as `Host / Embedded`; `serves` / `also_answers` show which existing representation
  answers each question; `evidence_substrate` feeds Mode B; `mismatch_pointers` and
  `unmatched_questions` are starting points.
- **`<workspace>/evidence-plan.json`** — sources, open gaps and ceilings; feasibility
  confidence respects them, and the plan's domain-vocabulary and what-it-holds artifacts are
  feasibility evidence. Append any new evidence you obtain (enrichment rules).
- Fallbacks: the human `<area>-audit-report.md`, an older single `<seed>-current-model.json`
  that still contains `latent_representations`, or an equivalent structured audit.

Useful fields (present as named keys in the JSON mirror):

- analyzed area / island
- confirmed business questions
- rejected questions
- structure-induced questions
- question evidence
- question confidence
- current implementation path
- current / latent representations
- mismatches
- available data / signals
- IN / OUT boundary
- source pointers
- evidence gaps

The skill MAY inspect linked source code or source evidence when needed.

It should NOT restart full-system discovery unless the handoff is insufficient.

---

# Lens repertoire

The full domain-agnostic catalog — every representation, the operations it makes cheap, the
question shapes it natively answers, and its over-selection guardrail — lives in the shared
reference file (single source of truth, also used by `latent-representation-explorer` to name
latent representations):

`~/.claude/skills/_shared/reference-representations.md`

(Resolve `~` to the current user's home; if the skills root differs on this machine it is the
`_shared/` directory alongside the skills. If a caller passed an absolute path, use it.)

**Read that file before Phase 2.** It also contains an inverse quick-index (question shape /
required operation → representation) for fast candidate lookup. Do not restate the catalog
here — apply it. Selection is still driven by the shape of the question, never by what the
code already contains.

# Phase 0 — Validate the handoff

Confirm that the input contains at least:

1. one confirmed/hypothesized business question OR a useful evidence substrate;
2. source pointers or evidence summaries;
3. enough context to identify the analyzed area.

If the input contains:

- rejected questions;
- structure-induced questions;

do NOT silently promote them to genuine business questions.

A structure-induced question may still be relevant if an alternative representation makes
that bookkeeping disappear.

---

# Phase 1 — Normalize existing questions

For every genuine business question:

1. Start from its domain phrasing (see Accepted input) and make it representation-neutral;
   do not reintroduce load-bearing model words the critic removed.
2. Identify the **dominant operation** needed to answer it.
3. Record secondary operations if relevant.
4. Record the current implementation path.
5. Record implementation pain only if supported by the audit.
6. Record the current/latent representation if one exists.

Do not choose a new representation yet.

---

# Phase 2 — Generate candidate lenses for existing questions

For each question:

1. Generate 2–4 plausible representations.
2. For each candidate map:
   - dominant question operation;
   - representation native operation;
   - what becomes simpler;
   - what remains awkward.
3. Remove lenses whose native operations do not match the question.
4. Select the best fit only after comparison.

Use a compact comparison table.

Do not pad tables with irrelevant lenses.

---

# Phase 3 — Assign each existing question to its best-fit model (do NOT emit per-question sections)

For each existing question, decide its best-fit representation and its dominant operation —
but this is **intermediate reasoning**, not the report layout. The report groups questions
**under their model** (principle 9, and the model-block spec in "Suggested final report
structure"). So the output of this phase is an assignment: *question → best-fit model*, which
then feeds the model block's "Existing questions improved" list.

Per question, resolve internally:
- dominant operation;
- best-fit representation (committed — alternatives weighed internally per principle 3);
- how it is answered today (rolls up into the model's **Current model**);
- what becomes simpler (one short line under the question in the model block);
- confidence (representation-FIT confidence).

Do NOT write a standalone `## [Q-ID]` section per question. Do NOT emit a "strongest
alternative" except for a genuinely non-obvious call (principle 3). Do not produce a migration
plan.

---

# Phase 4 — Build the evidence substrate for new-question discovery

Now temporarily ignore the existing question inventory.

Inventory what the system contains or can plausibly derive:

- identities
- relationships
- timestamps
- state transitions
- historical cases
- outcomes
- quantities
- balances
- locations
- eligibility rules
- alternatives / choices
- scarce resources
- sequences
- hierarchies
- text descriptions
- errors / failures
- actors
- repeated interactions
- assignment relations

For every item include:

- evidence pointer
- confidence
- whether it is directly stored or derivable

---

# Phase 5 — Discover genuinely new questions

Apply plausible lenses to the evidence substrate **even when the current implementation
contains zero traces of those representations**.

This phase is deliberately counterfactual:

> "What could we see if we chose to represent this evidence differently?"

Do not begin by asking which representations already exist. Begin with the substrate and
the repertoire of lens-native operations.

For each lens:

1. Check whether required substrate exists.
2. Enumerate the lens's native operations.
3. Convert only relevant operations into candidate questions.
4. Remove questions already present in the audit.
5. Remove trivial reformulations of existing questions.
6. Remove questions with no plausible insight or decision attached.
7. Keep uncertainty explicit.

Use this chain:

> **evidence substrate -> representation -> native operation -> new question**

This phase is not free-form brainstorming.

---

# Phase 6 — Evaluate every genuinely new question, then file it under its model

Each new question is assessed on the fields below, but it is then **placed under its model's
block** in the report (as a line in that model's "New questions unlocked" list), NOT written as
a standalone `## New question` section. Fields that are identical across the questions under one
model — feasibility, usefulness, smallest experiment, existing foothold, materialization when
they share the same substrate/projection — are stated **once at the model level** and not
repeated per question (principle 9). Only per-question-specific fields stay on the line.

Assess per new question:
- **Status:** NEW.
- **Native operation** it rides on (must be one the model makes first-class).
- **Why it fits** — 1–2 sentences, *question → operation → native operation* (skip if it is the
  same argument already stated for the model and adds nothing).
- **What it could reveal** — one short, non-hyped line.
- **Business metric it would move** — name it even if unconfirmed; mark "hypothesis — needs
  business confirmation" when not grounded (principle 5).
- **Decision it changes** — the concrete action the answer informs. If you cannot name one, the
  question is idea inflation → move it to the rejected section.
- **Feasibility confidence** — Low / Medium / High (lens-level if shared).
- **Usefulness confidence** — Unknown / Low / Medium / High, grounded in a known target metric or
  user confirmation (principle 5); else Low/Unknown. State the grounding.
- **Minimum data / smallest experiment / materialization** — lens-level if shared, else per line.

Never say the business needs the question unless evidence supports that claim.

---

# Phase 7 — Prefer high-leverage changes of perspective

Rank recommendations by **leverage**, not novelty.

A high-leverage lens does one or more of:

- turns many custom operations into standard operations;
- answers several existing questions coherently;
- makes explanations possible that are currently expensive;
- enables a genuinely new class of decisions;
- removes repeated reconstruction of the same information;
- enables historical, dependency, similarity, temporal, counterfactual or optimization
  questions that were previously hard;
- can be tested cheaply before architectural commitment.

Do not favor exotic lenses because they sound interesting.

---

# Phase 8 — Assemble the model blocks (this IS the report's main structure)

Group everything **by representation**. Each model block is the unit of the report (principle
9). One representation improves existing questions AND unlocks new ones — show both under it,
and state the block's **coverage** so the leverage is visible at a glance ("State machine:
existing Q1–Q6 + 3 new questions").

Model block shape (keep it tight):

## <Model> perspective
- **Current model:** `Host / Embedded` composite with the host named concretely + host anemic/rich
  + 1–2 code-evidence `file:line` of the emulating conditionals (e.g. `Parcel (Entity) / State-machine
  (anemic)` — 3 scattered transition defs at …); never bare `Entity / …`)
- **Proposed model:** <model elements, e.g. State, Transition, Guard, CarrierPolicy>
- **Native operations:** `op1(), op2(), op3()`
- **Why it fits:** <1–2 sentences: question → dominant operation → native operation>
- **Existing questions improved:** Q…, Q… — one short "what becomes simpler" line each
- **New questions unlocked:** <question — metric it moves — decision it changes> per line
- **Coverage:** existing Q… + N new · **Feasibility / Usefulness / Smallest experiment:** stated
  once here when the questions share substrate (principle 9)
- **Existing foothold:** yes/no (cost note only; never a selection reason)

Ordering example (why this beats isolated suggestions): a single **State machine** block can
carry existing Q1–Q6 *and* new reachability/dead-end questions — one model, not six separate
recommendations.

---

# Confidence rules

## Confidence in representation fit

### High

The dominant operation maps directly to a native operation of the representation and the
required substrate exists.

### Medium

The representation is plausible but:
- a competing lens is similarly strong; or
- interpretation depends on missing business context.

### Low

The recommendation depends mostly on analogy or missing substrate.

---

# Anti-patterns

Do NOT:

- recommend one representation for an entire domain noun;
- assume a concept has one "correct" model;
- recommend or rank a lens higher because the code already contains traces of it;
- reject or rank a lens lower because the code contains no trace of it;
- confuse "representation exists" with "representation is best";
- confuse feasibility with usefulness;
- invent business priorities;
- call a graph best merely because relationships exist;
- call a state machine best merely because a status exists;
- call an event stream best merely because timestamps exist;
- call optimization best without an objective;
- call vectors best without meaningful comparable features;
- produce architecture migration plans;
- treat every generated question as valuable;
- silently ignore a strong competing representation while choosing (weigh it internally per
  principle 3; commit to one best-fit — publish a one-line "why not <alt>" ONLY for a genuinely
  non-obvious call, never as a default menu);
- lay the report out question-by-question instead of grouping by model (principle 9);
- repeat feasibility/usefulness/substrate per question when it is shared across a model's
  questions (state it once at the model level);
- pad the report with exhaustive file:line evidence in the body (few strongest pointers only;
  the rest belongs in an appendix / verbose mode);
- justify lenses using "cleaner", "modern", "DDD-aligned", "AI-native" or similar language;
- promote rejected or structure-induced questions into genuine business questions.

---

# Suggested final report structure

The report is a **map of models** (principle 9): grouped by representation, ~40–50% shorter than
a per-question write-up. Structure:

# Lens exploration — [area]

## 1. Input summary (short)
Analyzed audit; confirmed questions (id + one-liner); current/latent representations; useful
substrate; rejected/structure-induced questions; key uncertainties. Keep to a compact list.

## 2. Coverage map (one table, up front)
The single view that shows leverage at a glance. No artificial scoring — the point is scope.

| Model | Existing questions it improves | New questions it unlocks | Leverage (why) |
|-------|--------------------------------|--------------------------|----------------|
| State machine | Q1–Q6 | 2 | collapses 3 legality encodings into one |
| Event stream | Q10 | 1 | … |
| … | … | … | … |

## 3. Models (the body — one block per representation)
Use the **model block shape from Phase 8**, ordered by leverage. Each block carries: Current
model → Proposed model (with elements) → Native operations → Why it fits (1–2 sentences) →
Existing questions improved → New questions unlocked → Coverage + lens-level
Feasibility/Usefulness/Smallest-experiment → Existing foothold. This section replaces the old
separate "better representations" (Mode A) and "new questions" (Mode B) sections — both live
under their model here. Do NOT split by mode; split by model.

## 4. Top perspectives (short table only — no re-summary)
The 3–5 highest-leverage models as a table: Model | why it has leverage | cheapest
materialization. Do NOT restate the model blocks in prose — the coverage map (§2) and the blocks
(§3) already carry the detail; this is just the ranked shortlist.

## 5. Questions deliberately rejected (keep very short)
One line each — superficially interesting questions dropped because: substrate missing;
duplicates an existing question; trivial reformulation; the lens does not natively support the
operation; no plausible decision follows; usefulness would be pure speculation. This section
controls idea inflation; it should be terse, not a catalogue.

## 6. Same reality, different models (closing picture)
A compact diagram: the one concept/area in the centre, the candidate lenses around it (State
machine, Event stream, Flow, Temporal, Graph, Optimization, …), and **one sentence under each**
naming the class of questions it opens. This is the visual restatement of the whole skill —
one substrate, many representations, each answering a different question shape.

---

# Output contract — `*-lenses.json` + its own dashboard

This skill has its **own** structured artifact and **own** dashboard, separate from the
current-model ones. Emit **two files**:

1. **`<seed>-lenses.json`** — top-level `{ $schema_version, seed, source_current_model, lenses:[…] }`,
   **one object per proposed representation**, existing + new questions nested inside each. Full
   shape, all field conventions, and a filled example live in
   `~/.claude/skills/_shared/lens-model-json.md` — follow it and keep the JSON valid. Cross-link to
   the consumed current-model file by id (`existing_questions_improved[].question_id`,
   `coverage.existing`).
2. **`<seed>-lenses.html`** — a self-contained dashboard. Build from the shared template, do NOT
   hand-write it:
   - read `~/.claude/skills/_shared/lens-dashboard.html`;
   - replace its single line `<script type="application/json" id="embedded-data">null</script>`
     with `<script type="application/json" id="embedded-data">` + the exact JSON + `</script>`
     (escape any literal `</script>` as `<\/script>`);
   - write the result next to the JSON.

## Every lens MUST ship drawable examples (`visuals`)

A proposed lens is not complete until the reader can *see* it. Each lens carries a `visuals` block
(schema in `lens-model-json.md`) that the dashboard renders as inline SVG and expands to a
full-screen "subpage". Requirements:

- **Say what plays each role, concretely.** For a graph: what is a **node**, what is an **edge**,
  and **why** model it that way — in this domain's nouns, not abstractly. For a vector: what a
  **point** and a **dimension/distance** mean. For a state machine: what a **state** and a
  **transition** mean.
- **Give several `variants` when the mapping is not unique** — e.g. one variant with stations as
  nodes and cables as edges, another with operators as nodes and shared-stations as edges. Different
  node choice ⇒ different variant.
- **Draw the concrete query, per variant.** Each `queries[]` entry names a specific question on the
  structure and highlights its answer on the sample: for a graph, e.g. `cycle` (redundant loop),
  `bridge` (single link whose loss splits the graph), `reachability`/`dead-end`; for a vector,
  nearest-neighbours or a cluster. Author a **small** sample (≈4–9 nodes/points) purely to
  illustrate — it is not the real data. The dashboard redraws the same sample with each query's
  highlight, so `cycle` and `bridge` visibly differ.

Do this for **every** representation you propose (graph, tree, state-machine, bipartite, vector,
timeline, set), so each lens answers "what is it, and what does asking X of it look like?".

A lens that needed a non-obvious call carries a short `why_not_alternative`; otherwise `null`.
Rejected candidate lenses go in a separate flat list, one line each.

---

# Example — Transit

Assume the input audit confirms questions about:

- fare calculation
- tariff selection
- driver matching
- lifecycle state
- cancellation
- route changes
- driver payout

and contains:

- historical rides
- route information
- lifecycle timestamps
- assignment rules
- driver proposals
- ride outcomes

## Existing question

### Q4 — Which driver will take this ride?

**Dominant operation:**  
Find a feasible assignment under distance, status, response and timing restrictions.

**Best-fit representation:**  
Constraint model.

**Why this representation fits best:**  
The question asks whether a candidate satisfies several simultaneous eligibility conditions.
Satisfiability and explanation of which condition prevents a match are native operations
of a constraint model.

*(A bipartite driver↔ride relation was weighed internally and set aside — it exposes
candidate matches but leaves the eligibility logic outside the representation. Per principle
3 that comparison is not emitted; only the committed best-fit is shown.)*

---

## Existing question

### Q5 — What state is this ride in and what can happen next?

**Dominant operation:**  
Determine legal actions from the current lifecycle state.

**Best-fit representation:**  
State machine.

**Why this representation fits best:**  
The question is about legal transitions from a known state. Outgoing transitions,
reachability and guards are native operations of a state machine.

*(Entity + status field was weighed internally and set aside — it stores the status but does
not make legal transitions explicit. Comparison not emitted, per principle 3.)*

---

## New question

### At which lifecycle stage do rides spend the most time?

**Status:** NEW

**Proposed representation:**  
Temporal model.

**Native operation:**  
Duration between lifecycle intervals.

**Why this representation fits best:**  
The question is fundamentally about elapsed time between state changes. Duration and
interval comparison are native operations of a temporal representation.

**Feasibility confidence:** High

**Usefulness confidence:** Unknown

*(Event stream was weighed internally and set aside — it preserves sequence, but the primary
operation here is duration, not causal reconstruction. Comparison not emitted, per principle 3.)*

---

## New question

### Which matching rule most often leaves a ride with no feasible driver?

**Status:** NEW

**Proposed representation:**  
Constraint model.

**Native operation:**  
Conflict / infeasibility explanation.

**Why this representation fits best:**  
The question asks which condition or combination of conditions removes all feasible
solutions. Conflict-set analysis is a native operation of a constraint representation.

**Feasibility confidence:** High

**Usefulness confidence:** Unknown

---

## New question

### Which historical rides are most similar to this problematic ride?

**Status:** NEW

**Proposed representation:**  
Vector / similarity model.

**Native operation:**  
Nearest-neighbor search.

**Why this representation fits best:**  
The question asks for proximity across multiple heterogeneous ride characteristics.
Nearest-neighbor retrieval is the native operation of a vector representation.

**Feasibility confidence:** Medium/High

**Usefulness confidence:** Unknown

---

# Main principle

This skill must never stop at:

> "Try a graph."

It must produce:

> **Existing question -> dominant operation -> candidate representations -> best lens ->
> native operation -> short reason why it fits best -> smallest experiment.**

For genuinely new questions:

> **Available evidence -> alternative lens (regardless of whether it exists today) ->
> native operation -> new question -> short reason why it fits best -> feasibility ->
> business metric it would move -> decision it changes -> usefulness (grounded in a known
> metric or user-confirmed via AskUserQuestion, else Low/Unknown) -> optional existing
> foothold -> smallest experiment.**

Presence in the current code is never a reason to choose a lens. At most it is good news
afterwards: **"you already have part of the projection, so this experiment may be cheap."**

And the deliverable is never a list of per-question suggestions. It is a **map of models**
(principle 9): grouped by representation, each block showing **Current model → Proposed model
(with elements) → native operations → the existing questions it simplifies → the new questions
it opens → coverage**, closed by a "same reality, different models" picture. One substrate, many
representations, each answering a different shape of question — shown so the reader sees at a
glance that one model can carry a whole family of questions.

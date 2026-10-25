---
disable-model-invocation: true
name: representation-question-critic
description: >
  Adversarial critic for the output of concept-explorer. Given the questions the
  generator says the system answers, it tries to REFUTE each one: structure-induced (exists
  only because a data structure was chosen), model-phrased (a real question whose phrasing
  carries a load-bearing solution word, including a homonym with demonstrated impact), or not
  a genuine question at all. Default stance is skeptical. Normally spawned automatically by
  the generator in a fresh agent; consumes the
  handoff file and the Evidence Plan, re-checks code selectively, and publishes
  `<area>-current-model.json` + dashboard with verdicts baked in.
argument-hint: "[path to questions-handoff.json] [path to evidence-plan.json] [--concept <name>]"
---

# Representation Question Critic

Read available calibration and evidence using the [workspace consumer protocol](../_shared/legacy-workspace.md).
Calibration (`legacy-init`) and graph queries (`code-evidence-graph` using `entry-flows`)
are independent optional inputs. Neither is a prerequisite for this skill. Old candidate
maps are historical location leads; verify their provenance and limits before reuse.

## Purpose

`concept-explorer` is a **generator**: primed to produce questions, it tends to
over-accept them and to over-trust the words it found them in. This skill is the independent
**adversary**. Its only job is to try to kill each finding — its existence, its genesis and
its phrasing.

Read these shared files first (if the caller passed absolute paths, use them verbatim;
otherwise they are in `~/.claude/skills/_shared/`, `~` = the user's home):
- `question-definition.md` — what counts as a question (NOT a CQRS query; guards inside
  commands and decisions inside event handling are questions);
- `reference-phenomena.md` — Phenomena 1–3, P1–P4 (P2 = P2a system edge + P2b domain edge),
  V1–V4, S1–S6, the back-propagation rule;
- `current-model-json.md` — the JSON you read and publish;
- `evidence-plan.md` — the Evidence Plan you may use as refutation material.

Do not restate their definitions; apply them. Worked examples there are domain-neutral
illustrations — never let them pre-decide a verdict.

---

# Stance

- **Default to refutation.** Assume each question is fake, derived or mis-phrased until
  evidence forces you to concede.
- **Independence is the point.** Do not trust the generator's `genesis`, confidences,
  glossary or `load_bearing` labels. Re-derive them.
- **Refute, then let survivors stand** — with their correction (domain rephrasing when the
  phrasing carried the model).

---

# Input

- **`questions-handoff.json`** (shape: `current-model-json.md`): operate on
  `islands[].questions[]`, `islands[].structure_induced[]`, `islands[].vocabulary[]` and
  `islands[].phase0`. Keep the full `evidence[]` for re-checking. Older handoffs (with a
  `concept_circular` field or a CONCEPT-CIRCULAR genesis, no `vocabulary`) are accepted — treat
  those items as MODEL-PHRASED candidates; reconstruct the missing fields
  yourself.
- **`evidence-plan.json`**: use the non-code artifacts it lists (aggregates, schema
  statistics, tickets, UI, domain-vocabulary sources) as refutation material. Its active
  ceilings are upper bounds: no confidence may be revised above them. Do not ask the user for
  artifacts — that round happened. If you obtain new evidence, append it to the plan
  (`added_by: representation-question-critic`).
- **Priorities:** `flag_for_critic: true`; high existence confidence with low phrasing
  confidence; any term marked `cosmetic` in a question that is otherwise high-stakes; any
  `homonym`; suspect genesis.
- **Concept subject:** the concepts under audit are the seed and the re-seed targets in
  `phase0`, plus every term in `vocabulary`. A `--concept` argument only sets the subject when
  there is no handoff.

---

# Method

## 1. Concept-reality pass (Phenomenon 2)
Apply **P1–P4** hard to the seed and to each re-seed target:
- P1 — is any question about it truly reachable from an IN (endpoint, UI, event, business job,
  or a guard inside a business command) vs only from self-maintenance?
- P2 — separately: P2a (its own screens and manual) and P2b (law, standards, interchange
  formats, customer documents). A concept supported only by P2a is system-taught — do not
  accept it as real on that alone.
- P3 — attempt the substitution explicitly.
- P4 — count the distinct, unrelated question-classes it serves.
Verdict: **domain entity** or **mechanism** (+ re-seed targets).

## 2. Vocabulary pass (Phenomenon 3)
For every contextual glossary entry (resolve `term_id`; never select an ambiguous spelling):
- **V1** — re-derive the origin. Look for P2b evidence yourself (the code that builds external
  formats is the cheapest; regulatory or standard text the plan lists; customer-facing
  templates). Where you rely on general knowledge of the domain's law or standards rather than
  a source in the evidence, say so explicitly.
- **V2** — re-run the shared semantic comparison and homonym detection protocol. Check
  early candidates, confirmed findings AND rejected candidates. Require two evidenced meanings,
  a distinguishing case and checked alternatives for confirmation. Re-check the producer and
  consumer, including downstream filters or explicit translations. Structural findings only
  nominate candidates; no header record or a grouping key does not prove a semantic difference.
  Distinguish domain mismatch (`shape`) from a code-to-code contrast (`homonym.status`);
  the latter does not establish which meaning the business needs.
For every question:
- **V3** — attack every `cosmetic` label: try to find a substitution that changes the cases,
  the answer or the asker (typical verb leaks: delete vs reverse, reopen vs correct). Check the
  generator's domain phrasing: does it still cover exactly the same cases?
- A candidate/confirmed homonym triggers review, not an automatic `MODEL-PHRASED` verdict.
  Demonstrate its effect on this question's cases, answer or asker. A legitimate contextual
  distinction or an unaffected question may remain cosmetic; unresolved meaning caps phrasing
  confidence and stays explicit instead of acquiring an invented domain rewrite.
- Check the question is a question (not a command restated), and that its typical answers and
  consumers are evidenced.

## 3. Per-question refutation (Phenomenon 1)
Run **S1–S6** and the domain-vs-structural invariant split. Remember: a guard the system asks
while executing a business command is reachable from a business IN — S1 does not fire on it.
Split hybrids and keep only the domain half as a question.

Prefer several independent refutation attempts per high-stakes question; concede only when
refutation genuinely fails.

## 4. Code re-check — targeted, with bounded independent reach
Follow the generator's `path:line` pointers to falsify specific claims; do not re-explore the
repository. But independence is worthless if you only look where the generator looked: for any
flagged, high-confidence or vocabulary-critical item, gather a **bounded** amount of
independent evidence — one or two targeted greps, the one file the pointers imply but omit
(the real callers of a "self-maintenance" routine, the export builder for a disputed term). A
couple of look-ups per item, never a survey. You may spawn read-only Explore subagents under
the same rule.

## 5. Question-tree pass (if `question_tree` is present)
Check the grouping, not only the questions:
- **cutting rule** — within each decision, do criteria with different negative effects
  have the appropriate grouping? Effects organise criteria, **not** canonical question
  identity. Different effects alone do not justify splitting a question; identical effects
  and subject alone do not justify merging.
- **granularity** — is a node an independently meaningful domain question or merely a field
  / single criterion promoted (or distinct domain facts flattened into one)? Check that
  structural questions with evidenced consumers survive as their own questions, that answer
  dimensions are consolidated, and that one question reused by decisions is not cloned.
- **duplicates** — are `places[]` really the same semantics (same fields, shape, effect)? Look
  for contextual meanings wrongly merged under one spelling, and unmerged copies: the same
  guard in a validator and in the entity, the same ordering in code and in SQL.
- **human decisions** — do screen criteria anchor to code that actually shows the field? No
  invented screens.
- **coverage** — every question id once; decisions without questions; criteria without anchors.
Record findings in `question_tree.critic` (`{agrees, notes[]}`) and in "what the generator missed".

---

# Output

Per question:

```
{
  id,
  verdict,            # CONFIRMED-DOMAIN | MODEL-PHRASED | STRUCTURE-INDUCED | REJECTED
  confidence_revised, # existence confidence after your pass
  phrasing_confidence_revised,
  reason,             # what decided it
  killed_by,          # P1..P4 / V1..V4 / S1..S5, if any
  load_bearing_terms, # terms you judge load-bearing (may differ from the generator's)
  domain_rephrasing   # REQUIRED for MODEL-PHRASED; the question in domain words
}
```

- **CONFIRMED-DOMAIN** — a genuine question; its model words are cosmetic.
- **MODEL-PHRASED** — a genuine question with at least one term whose V3 substitution
  demonstrably changes its cases, answer or asker, including a homonym with that impact.
  Supply the evidenced domain rephrasing; a homonym label alone is insufficient.
- **STRUCTURE-INDUCED** — bookkeeping about the representation, no domain question underneath;
  moves to the structure bucket. (MODEL-PHRASED has a domain question underneath — tell them
  apart with V3, see `reference-phenomena.md` → "Phenomenon 1 vs Phenomenon 3".)
- **REJECTED** — not supported as a question at all (no computation, no consumer, a command
  restated, dormant with no caller).

Per contextual glossary entry: retain `id`/`context` and attach
`critic: {origin_revised, shape_revised, homonym_status_revised, agrees_with_generator, note}`.
Include the rechecked case and alternatives in the note/evidence when revising a finding;
omit `homonym_status_revised` when no candidate was investigated.

Plus summaries: **concept verdict** (entity vs mechanism, re-seed targets); **what the
generator missed** (unflagged structure-induced questions, unflagged load-bearing terms,
missed back-propagation, guards not linked to the questions they protect, questions inside
commands/events it did not find, consequential conditionals deep in the code it did not lift
— run a bounded bottom-up check from the island's main effects).

---

# Required outputs — publish the JSON + dashboard

Publishing happens **here** (nothing is published pre-critic). Write into the output directory
the caller gave you (`<workspace>/<area>/`):

1. **`<area>-current-model.json`** — the handoff with your layers baked in:
   - `verdict` object on each question (same `id`);
   - `island.concept_verdict` (`{verdict, agrees_with_generator, reseed_targets, note}`);
   - `critic` object on each glossary term in `island.vocabulary`;
   - `island.critic_summary`: `{counts: {verdict: n}, disagreements: [text], missed: [text]}` — what you
     disagreed on with the generator and what it missed (shown on the dashboard as „Krytyk: co ocenił”);
   - `question_tree.critic`: `{agrees: bool, notes: [text]}` when a question tree is present;
   - keep everything else intact — a REJECTED/STRUCTURE-INDUCED question stays in the file
     (the dashboard strikes it through) so the disagreement remains visible; keep `artifacts`,
     `relations`, `answered_by`, full `evidence[]`.
   **Deterministic prune before writing** (Node.js, standard library only; never Python, it may be missing):
   ```js
   const ref = new Set();
   for (const q of isl.questions ?? []) for (const id of q.answered_by ?? []) ref.add(id);
   for (const r of isl.latent_representations ?? []) for (const id of r.involves ?? []) ref.add(id);
   const byId = Object.fromEntries(isl.artifacts.map(a => [a.id, a]));
   const tables = new Set([...ref].filter(id => byId[id]?.kind === "entity").flatMap(id => byId[id].maps_to_tables ?? []));
   const keep = a => a.kind === "db-table" ? tables.has(a.name) : ref.has(a.id);
   isl.artifacts = isl.artifacts.filter(keep);
   const kept = new Set(isl.artifacts.map(a => a.id));
   isl.relations = (isl.relations ?? []).filter(e => kept.has(e.from) && kept.has(e.to));
   ```
   If a relevant helper gets pruned, add it to the right question's `answered_by`; never
   re-add it as an orphan.
2. **`<area>-current-model.html`** — from the shared template, never hand-written: read
   `current-model-dashboard.html`, replace its single line
   `<script type="application/json" id="embedded-data">null</script>` with the same tag holding
   the exact JSON (escape `</` inside the data as `<\/`), write it next to the JSON.

Return to the caller a short summary: counts per verdict, the concept verdict, the terms you
judged load-bearing or homonyms, and the items you disagree on with the generator.

---

# Anti-patterns

Do NOT:
- accept a question because the generator rated it High;
- accept a term as domain vocabulary because it appears on the system's screens or in its
  manual (P2a only);
- reject a question because it is asked inside a command or by the system itself — that is
  where most questions live;
- reject a question merely because it is checked internally — apply the domain-vs-structural
  split first;
- re-explore the whole repository — bounded independent look-ups only;
- confirm a concept as real because it is pervasive — pervasiveness is what a successful
  mechanism looks like;
- soften verdicts to be agreeable; the value of this skill is disagreement backed by evidence.

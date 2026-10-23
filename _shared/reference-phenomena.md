# Shared reference — representation phenomena & heuristics

> Single source of truth for three phenomena in representation archaeology and the
> heuristics that detect them. `concept-explorer` (generator),
> `representation-question-critic` (critic) and `latent-representation-explorer` rely on these
> definitions. Do not duplicate them into the skill bodies — reference this file. What a
> "question" is: `question-definition.md`.

---

## Three phenomena

### Phenomenon 1 — Structure-induced question
A question that exists **only because a particular data structure or execution mechanism
was chosen**. It is bookkeeping about the implementation, not a domain fact an external
actor cares about. It typically **guards the correctness or execution of a real question**
rather than being asked for its own sake, and it **dissolves when the mechanism changes**
(e.g. becomes a schema constraint or a different execution strategy). Examples: "is the tree valid?", "are there cycles?",
"is this subtree single-typed?", "does every node have a parent?".

These MUST NOT be listed as "questions the system answers." They belong in a separate
bucket: *questions the chosen structure forces the system to ask itself.*

### Phenomenon 2 — The seed concept is a mechanism
The concept the analysis starts from (the seed) may be a **model mechanism**, not a real domain
entity — someone built the solution on it, so now everything in the area is phrased through it
("group", "node", "bucket" encoding visibility scope, tenancy, config inheritance). This is a
judgement about the **concept**, made once in Phase 0 with P1–P4; when it fires, the analysis is
re-seeded on the domain concepts the mechanism encodes. How a single *question* is phrased is
Phenomenon 3, not this one — a question may use the same word twice and be perfectly fine.

### Phenomenon 3 — Model-phrased question (vocabulary leak)
A real question phrased with a noun or verb that comes from the **solution**, not from the
domain — even when it appears only on one side of the question ("may this DOCUMENT still be
DELETED?") or on both. The word is not automatically wrong: the team
really talks that way, and often the word is harmless. It matters only when it is
**load-bearing** — when replacing it with its domain meaning changes which cases the question
covers, what the answer is, or who would ask it.

**Two different things — name them separately.**
- **Homonym** — one word, several meanings (domain vs code, or context A vs context B in the
  system). Question it answers: *how many meanings does this word have?* Recorded in `shape`
  and `homonym.status`.
- **Model-induced term** (*słowo z modelu*) — a word that came from the solution/model, not
  from the domain problem. Question it answers: *where did this word come from?* Recorded in
  `origin` (`system-taught` / `internal-only`).
These are independent: a domain word can be a homonym, and a model-induced term can have one
clear meaning. They often occur together — a model-induced term is frequently a homonym,
because it is unclear what it means — and then the entry is marked as both. Never report
"homonym" when only the origin was shown, nor "model-induced" when only a second meaning was
shown.

The most dangerous sub-case is a **model homonym**: the same noun or verb carries different
criteria for membership, identity, lifecycle or permitted behaviour in two evidenced uses
(domain vs system, or context A vs context B). Confirm the difference with a **distinguishing
case**: the same scenario is classified differently, permits a different act or yields a
different answer under the two meanings. Record each meaning with its context and sources.
Code can establish two different operational meanings without establishing which one the
business needs. A homonym becomes a vocabulary leak in a question only when V3 demonstrates
that the distinction affects that question; separate, explicit contexts can be legitimate.

**Representation alone is not meaning.** No header record, a grouping key, duplicated status
or a repair routine is a reason to investigate, never proof of a homonym. A document represented
by several rows may preserve its domain identity and behaviour perfectly. Likewise, different
states of one lifecycle, deliberate projections and different implementation algorithms do not
by themselves establish different meanings. An isolated wrong filter may be an implementation
bug rather than evidence of two meanings in use; investigate the surrounding uses.

Two more cases to recognise:
- **system-taught word** — the word lives only at the system's own edge (its screens, its user
  manual, its training); users say it because the tool taught them. It may have become real
  ubiquitous language, or it may be the tool's vocabulary echoed back. Treat as weak evidence.
- **verb leak** — the verb names a model operation ("delete", "reopen", "re-index") where the
  domain would use a different act ("reverse", "correct", "re-issue"). Verbs leak as often as
  nouns.

### Phenomenon 1 vs Phenomenon 3 — how to tell them apart
- **Structure-induced (1):** there is **no domain question underneath**. Remove the chosen
  structure or execution mechanism and the question disappears — nobody outside cares whether
  an index is current, a counter matches or an internal task has executed. It protects or
  schedules real questions. Bucket it apart.
- **Model-phrased (3):** there **is** a real question underneath; only its words come from the
  solution. Remove the structure and the question survives in other words. Keep it in the list
  with a domain phrasing.
Test: rewrite without the model words (V3). If nothing meaningful is left, it is 1; if a domain
question is left, it is 3 (or a plain domain question, when the words were cosmetic).

### Coupling principle
**Phenomenon 1 inherits its artificiality from Phenomenon 2.** If the concept is an
artefact, the invariants protecting it are doubly artificial. If the concept were real,
some of its invariants would be genuine domain rules. Therefore assess concept reality
FIRST, then classify each self-maintenance question.

**Back-propagation rule (Phenomena 1 → 3).** A structural finding is evidence about
vocabulary. When a structure-induced question or a Phase 0 finding shows that a concept has no
record of its own, is repeated per row, is a grouping key, or is repaired by code, every real
question that uses that concept's word MUST get the semantic comparison (V2) for it. These are
candidate signals, not verdicts. The finding is not allowed to stay only in the
structure-induced bucket.

---

## Heuristics P1–P4 — is the concept real, or a mechanism? (Phenomenon 2)

- **P1 — External actor.** Is a question about this concept reachable from an IN
  (endpoint / UI action / incoming event / business job) with a business payload, or only
  from code that maintains itself (health-check, assertion, startup scan)?
- **P2 — Vocabulary provenance — two edges, never one.**
  - **P2a — system edge:** the system's own screens, menus, user manual, training material,
    error messages. Presence here shows the users *know* the word; it does not show the word
    belongs to the domain — the tool may have taught it.
  - **P2b — domain edge:** sources the system does not control — law and regulation,
    industry standards, interchange formats the system exchanges with others (payment/clearing
    messages, regulatory reports, tax files), contracts, documents given to customers,
    competitors' products.
  A concept present only at P2a is **system-taught**: weak evidence, never enough on its own
  to call it real. A concept present at P2b is domain vocabulary — but still run V2, because
  domain words can be homonyms. A concept that "graduated" into ubiquitous language counts
  only if it shows up at P2b or in how the business talks outside the tool. Code that
  translates the system's data into an external format (a regulatory export, a message
  builder) is the cheapest P2b evidence: it is a ready translation table between the two
  vocabularies.
- **P3 — Substitution.** Restate the question WITHOUT the concept noun, substituting its
  domain definition. Does it still make sense and yield the same answer? If it collapses
  into "consistency of the mechanism", flag it. (Per question, this is V3.)
- **P4 — Overload.** Does one concept answer many *unrelated* classes of question
  (access + config inheritance + country + filtering)? Overload signals a catch-all hook,
  not a crisp entity. A discriminator column that partitions the table into never-mixing
  subsets is a strong overload tell.

**Action when the concept is a mechanism:** re-seed the analysis on the domain concepts it
encodes; keep the original noun explicitly labelled as "mechanism / carrier", not entity.

---

## Heuristics V1–V4 — vocabulary of each question (Phenomenon 3)

Run for **every** model noun and verb that appears in a question — not only the seed. Record
each **term + context + meaning** in the island glossary (V1, V2), with its own stable id, and
judge it per question (V3, V4). The same spelling may have several glossary entries. Do not
merge questions until their subject meanings and criteria have been compared.

- **V1 — Origin.** Where does the term live? `domain-external` (P2b: law, standards,
  interchange formats, contracts), `industry-practice` (how practitioners in this industry
  talk, outside this tool), `system-taught` (P2a only), `internal-only` (code and tables only).
  Cite the evidence for the origin; "it is in the menu" proves only `system-taught`.
- **V2 — Semantic comparison (legacy field: `shape`).** Compare membership, identity,
  lifecycle and permitted behaviour in a specified domain context with the meaning implemented
  by writers AND consumers. Preserve `match | homonym | unknown`: evidenced agreement within
  the checked scope → `match`; evidenced semantic difference with a distinguishing case and
  alternatives checked → `homonym`; missing definition or unresolved evidence → `unknown`.
  A structural difference alone cannot produce `homonym`. Also compare uses across system
  contexts: record their difference in `homonym` even if the domain comparison remains
  `shape: unknown`. Neither context is automatically wrong. Follow the protocol below.
- **V3 — Substitution per question.** Rewrite the question with every model term replaced by
  its domain meaning. The term is **load-bearing** if the rewrite changes (a) the set of cases
  the question covers, (b) the answer, or (c) who would ask it. Otherwise it is **cosmetic**.
  Write down the rewrite — it is the draft `domain` phrasing.
- **V4 — Speaker.** Whose vocabulary is the term (customer, operator, accountant, regulator,
  developer)? When the question is asked by one party in another party's words, record it —
  it shows whose model dominates. It is not an error by itself.

### Homonym detection — early candidates, then evidence-based confirmation

Run a bounded reconnaissance after mapping the island and before phrasing or merging its
questions. Use boundary terms, creation/state-change paths, main readers and available domain
artifacts; do not scan the whole system. Mark candidates in the contextual glossary, keep
their meanings distinct through question discovery, and revisit them in the full V1–V4 pass.
This is a navigation aid, not a filter excluding code, questions or candidate islands.

Look for these signals (none is sufficient alone):

| Signal | Targeted investigation |
|---|---|
| Different membership criteria | Compare filters/guards defining the same word for different consumers, e.g. an active contract vs a recent login. |
| Different identity or counting units | Compare keys, equality, deduplication and counts: person, legal party, account or delivery location? |
| Different lifecycle milestones | Trace when each use begins/ends and what confirms, closes, cancels or reverses it. |
| Boundary translations | Inspect why an export/event adapter filters, splits or merges the internally named objects; verify the external contract when available. |
| Qualifiers and workarounds | Follow `reallyPaid`, "excluding technical customers", corrective jobs and repeated exclusions to the distinction they compensate for. |
| Disagreeing reports or fixes | Compare what each report counts and inspect relevant tests/incidents/history; differing results may reflect different meanings or a bug. |
| Producer–consumer assumption gap | Compare what a writer/event guarantees with what its reader assumes before acting. |

For each candidate:

1. **Locate both meanings.** Record the term, context/actor/process, operational definition
   and source for each. Trace the creation/transition path and at least one relevant consumer;
   do not infer meaning from a class name or endpoint title alone.
2. **Construct the smallest distinguishing case.** Hold the scenario fixed and state the
   result under each meaning, with source pointers. Label a static derivation as such; tests
   or runtime observations count as executed evidence only when actually executed/observed.
3. **Try to refute it.** Check downstream filters, explicit translations, projections,
   intentional scope, lifecycle stages, separate contexts and an isolated implementation bug.
   Record which explanation holds or fails and why. A difference in representation with
   preserved semantics rejects the candidate; a legitimate contextual difference can remain
   confirmed with no demonstrated leak.
4. **Follow its effect.** Name the questions and consumers that could confuse the meanings.
   Apply V3 separately to each question; a confirmed difference can be cosmetic there.
5. **Record the outcome.** `candidate` while evidence is incomplete, `confirmed` only with
   two evidenced meanings plus a distinguishing case and alternatives checked, `rejected`
   when the suspected semantic difference is explained away. Preserve missing evidence and
   rejected candidates so the critic can inspect both. Do not invent a domain definition to
   upgrade a code-to-code contrast into a domain verdict.

Illustration only: `Reservation` is created at DRAFT, while an operational instruction uses
"reservation" for a confirmed commitment. One abandoned draft is counted by an unfiltered
query but is no commitment under that instruction. This is a distinguishing case only after
the actual query, its consumer and the instruction are verified. If the consumer filters to
CONFIRMED, the broad storage type does not establish a leak into that consumer's question.

### Operating in the grey zone
- Keep **two confidences**: that the question *exists* (evidence of computation + consumer)
  and that it is *phrased right* (V1–V3). A question can be High on the first and Medium on
  the second.
- Keep **both phrasings**. The system phrasing is what the team says and what makes the
  report usable with them; the domain phrasing is what the lens-explorer works on.
- **Decide only when a term is load-bearing.** A cosmetic system word stays as a label. A
  load-bearing one gets a domain rephrasing, a `MODEL-PHRASED` verdict risk, and — when the
  code cannot settle what the domain means — one targeted question to a domain expert
  ("after the batch is closed, is an operation still deleted, or is it reversed?").
- Without P2b evidence, phrasing confidence is capped at Medium (the term can be proven
  system-taught but not proven domain).

---

## Heuristics S1–S5 — is the question structure-induced? (Phenomenon 1)

- **S1 — Who asks.** Reachable only from self-maintenance (validators, assertions,
  consistency scans, startup checks, migration verifiers), never from a business IN.
  Cheapest signal. (A guard the system asks while executing a business command IS reachable
  from a business IN — see `question-definition.md`.)
- **S2 — Question vocabulary.** Nouns/verbs are *structural* (parent, root, cycle, subtree,
  depth, ordering, null-in-chain, index, counter) rather than *domain* (operator, station,
  amount, date).
- **S3 — Container vs contents.** The question is about the container (the structure)
  rather than the contents (domain rows). Does the logic decide on structural metadata
  (ids, parent pointers, type strings) or on domain rows?
- **S4 — Repair code exists.** The system contains code that *fixes* the structure
  (re-parenting, orphan cleanup, cycle-breaking, type-fixing, re-indexing, recounting). If it
  must be repaired, "is it broken?" is a structure-induced question. Grep-able.
- **S5 — Guard, not result.** The answer is consumed only as a guard/assertion before a
  real question, or run offline "to keep things consistent," never surfaced as a result.
- **S6 — Execution bookkeeping vs domain meaning.** Trace what makes an answer true and how
  its consumers use it. If it depends only on a chosen mechanism's task lifecycle, scheduling,
  retry or execution-completion state, treat it as mechanism-induced even if its objects and
  verbs sound domain-specific. If a business rule independently establishes the answer,
  preserve that domain question and separate it from its execution bookkeeping. Ask whether
  the question would still have meaningful domain content under a different execution
  mechanism; a renamed technical task is not a domain fact.

**Discriminator (prevents S1/S6 over-firing): domain invariant vs structural invariant.**
- *Domain invariant* = business semantics (e.g. "a session's start precedes its end",
  "debits equal credits") — real even if checked internally. Rephrase in domain terms; keep it.
- *Structural invariant* = hygiene of the chosen mechanism (e.g. "parent.type == child.type
  in this table") — structure-induced.
- A single check can be a hybrid ("customer belongs to exactly one sales org" = domain;
  "…and it must be a TYPENAME='SALES' node in TBL_GROUP" = structural). Split it and keep
  only the domain half as a question.

---

## Worked example (illustrative & domain-neutral — do NOT carry as a prior)

> This example exists ONLY to show how the heuristics fire *mechanically*. It is a
> hypothetical, not a finding about any real system, and must never pre-decide a verdict for
> a concrete seed. A concept that superficially resembles the one below may still be a
> genuine domain entity. **Re-derive every verdict from the actual code in front of you**;
> if you catch yourself concluding "mechanism", "structure-induced" or "homonym" before you
> have read that system's code, you are anchoring on this example — stop and check the
> evidence.

Hypothetical seed `Bucket`: a dominant table `TBL_BUCKET` with a self-referencing parent
pointer and a `TYPE` discriminator column.

- `Bucket` *would* read as a **mechanism** — but only if the P-heuristics actually fire
  against the real code: P4 (one concept answering several unrelated question-classes, e.g.
  access + config-inheritance + geography + filtering) AND P2 leaning internal (the noun
  lives in table/class names or only on the system's own screens, while the domain edge
  speaks other words). If they do, the real concepts it encodes (e.g. *visibility scope,
  tenant, actor identity, config inheritance*) become the re-seed targets. If they don't
  fire, `Bucket` may be a real entity — do not assume.
- "Is the bucket tree valid?" *would* read as **structure-induced** — but only if S1 fires
  (asked solely by a `checkAllBucketsForValidity`-style self-maintenance routine, never from
  a business IN) and S5 (it merely guards a real access/filtering question). A
  `parent.type == child.type` clause is a structural invariant; a co-located "each customer
  belongs to exactly one org" clause is a domain invariant wearing structural clothes —
  split them and keep only the domain half.
- A question "may this ENTRY be REMOVED?" *would* show **Phenomenon 3** only if V3 changes
  it: if in the domain a recorded entry is never removed but reversed, then "remove" is a
  load-bearing verb leak and the domain question is "is this entry still provisional or
  already final?". If the domain really removes entries, the word is cosmetic.

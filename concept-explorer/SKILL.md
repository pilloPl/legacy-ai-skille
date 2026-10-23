---
disable-model-invocation: true
name: concept-explorer
description: >
  Question archaeology of a legacy/brownfield system: discovers the questions the system
  already answers — including the ones it asks itself while executing commands and handling
  events, which have no endpoint of their own — with who asks (system / e2e / both), typical
  answers, consumers, source and the commands/events that need them. Every question is a
  hypothesis backed by evidence, carries a system phrasing and a domain phrasing, and every
  model word in it is checked (system-taught vs domain, homonym, load-bearing vs cosmetic).
  Starts from a thing, from a problem, or from the concept that dominates the candidates of
  the latest `legacy-init` calibration (`--from-calibration`). Checks load-bearing model words
  against the public APIs and documentation of other companies in the same industry.
  Screens the selected island for contextual meanings before discovering questions, then
  confirms homonym candidates with distinguishing cases and per-question impact.
  Interrogates whether the seed concept is a domain entity or a mechanism and separates genuine
  questions from structure-induced ones. Groups the flat list into a question tree (decision →
  question → criterion, cut by the effect of a negative answer, with duplicates merged) — decisions
  may be the system's or a person's at a screen, so a question needs no `if`. Consumes the Evidence Plan from `evidence-preparation`
  and, when done, automatically runs `representation-question-critic` in a fresh agent, then
  reconciles, writes the report, groups the decisions by effect in three independent passes
  (keeping the groups a majority found; each group is a top question an outsider asks) and, as
  the last step, judges the biggest pains only on those top questions, never on a single
  question ("which answer went wrong, what is it for?", in domain words without the mechanism). Representations latent in the code are NOT its job — that
  is `latent-representation-explorer`; new lenses are `representation-lens-explorer`.
argument-hint: "[--from-calibration | path/url/graph/schema/area/problem] [--workspace <dir>] [--no-critic]"
---

> Shared files — read before Phase 0 (resolve `~` to the user's home; if the skills root
> differs, they are in the `_shared/` directory alongside the skills):
> - `~/.claude/skills/_shared/question-definition.md` — what a question is (NOT a CQRS query),
>   its fields, granularity rules, grouping into the decision → question → criterion tree;
> - `~/.claude/skills/_shared/reference-phenomena.md` — Phenomena 1–3, heuristics P1–P4,
>   V1–V4, S1–S6, back-propagation rule;
> - `~/.claude/skills/_shared/evidence-plan.md` — the Evidence Plan file and the workspace;
> - `~/.claude/skills/_shared/current-model-json.md` — the handoff / published JSON shape.

# Concept Explorer — the questions a concept answers

Read available calibration and evidence using the [workspace consumer protocol](../_shared/legacy-workspace.md).
Calibration (`legacy-init`) and graph queries (`code-evidence-graph` using `entry-flows`)
are independent optional inputs. Neither is a prerequisite for this skill. Old candidate
maps are historical location leads; verify their provenance and limits before reuse.

## Purpose

Help an engineer stop treating the current code/data structure as the only possible model of
the problem, by recovering **what the system is actually trying to answer** — independently
of how it answers it.

This skill produces:

1. **Questions** the system already answers, in the sense of `question-definition.md`: asked
   by people and other systems (`e2e`) and — just as important — asked by the system itself
   while it executes commands, handles events and runs jobs (`system`). Each with typical
   answers, consumers, source and `needed_by` — found top-down from entry points, bottom-up
   from consequential conditions, and through structural lenses on key domain concepts.
2. **A vocabulary verdict** for every model word used in those questions (Phenomenon 3), and a
   domain phrasing next to the system phrasing.
3. **Structure-induced questions** (Phenomenon 1) in their own bucket, back-propagated to the
   vocabulary of the real questions.
4. **Decisions one level up**: three independent passes group the decisions by what changes
   and who notices; a decision repeated elsewhere joins its group with a role. Each group is a
   top question an outsider asks.
5. **Pains judged on the top questions** (last step): the 1–3 biggest pains, each marked only on
   the top questions (groups) whose answer goes wrong for someone — never on a single question.
6. **A critic pass** by an independent agent, a reconciliation of disputed items, and the
   published `<area>-current-model.json/.html` + `<area>-audit-report.md`.

> **Boundaries.**
> - Representations latent in the code (status+guards state machines, history tables, rule
>   tables…) belong to `latent-representation-explorer`. This skill may record *how* a
>   question is answered today (`source`, `answered_by`), but it does not name
>   or classify representations.
> - Better representations and new questions under another lens belong to
>   `representation-lens-explorer`.

This is not a code-review, refactoring, DDD-generation or migration-planning skill.

---

# Core principles

## 1. Questions before models
Never start from "this is an Entity / Graph / State machine". Start from "what does somebody —
or the system itself — need to know here?". A command, an event handler, a screen or a job is
a place where questions are asked; find them there. Do not equate "question" with read
endpoint.

## 2. Evidence, not confident storytelling
Every question is a **hypothesis** unless stated in requirements or confirmed by the user.
Write "Hypothesis: the operator opens this screen partly to decide…", then list the evidence.
Do not infer rich intent from weak structural evidence: a table row returned by an endpoint
supports only "someone inspects current state".

## 3. Code is evidence, not the whole system
Never load the whole codebase. Prefer
`topology → candidate island → boundary → hypothesis → selective evidence retrieval`
over `whole repository → LLM → summary`. Use the Evidence Plan's aggregates instead of raw
artifacts wherever they exist.

## 4. The seed concept may be a mechanism (Phenomenon 2)
A dominant noun may be the mechanism someone chose, not a concept the business reasons in. Run
P1–P4 before archaeology; re-seed if it is a mechanism.

## 5. Any model word may be one (Phenomenon 3)
Not only the seed: every noun and verb from the solution that appears in a question gets
V1–V4. Screen meanings early (Phase 1b), before they bias phrasing or grouping; confirm them
after question discovery (Phase 3). A word on the system's own screens is evidence that users
know it, not that the domain owns it. Keep both phrasings; decide per-question impact with V3.

## 6. Some questions exist only because a structure was chosen (Phenomenon 1)
Bookkeeping about the representation goes to its own bucket, and what it reveals is pushed back
to the vocabulary of the real questions (back-propagation rule).

---

# Interaction rules

## Mandatory use of AskUserQuestion
If information from the user is required to continue, use `AskUserQuestion` — never free-form
chat questions while this skill runs. Use it when:
- the user supplied several candidate areas and prioritisation is ambiguous;
- a business term has several plausible meanings and the code cannot settle which;
- two competing interpretations have comparable evidence;
- the scope is too broad and there is no defensible automatic seed;
- a load-bearing term needs the domain's meaning and nothing at the domain edge settles it
  (batch such terms into one call);
- a source exists but was not provided — only through the Evidence Plan round
  (`evidence-preparation`), each request stating what it adds and what stays invisible;
- observable business intent cannot be distinguished from technical plumbing.

Do NOT ask when a best-effort analysis can continue safely with an explicit low-confidence
assumption. If `AskUserQuestion` is unavailable, say so and continue with explicit assumptions.

---

# Step 0 — Workspace and Evidence Plan

1. **Workspace.** Use `--workspace <dir>` if given; otherwise
   `<repo>/analiza/` (see `_shared/evidence-plan.md`, "Location"); area outputs in
   `analiza/<area>/`. Never write elsewhere in the audited repository.
2. **Evidence Plan.** If `<workspace>/evidence-plan.json` exists, load it and invoke
   `evidence-preparation` in incremental mode with the profile below (it registers this
   consumer, re-checks open gaps and asks only what is new). If it does not exist, invoke
   `evidence-preparation` with the profile below. Either way, continue from the plan file.
   Run this in the main conversation so its questions reach the user — never in a subagent.

## Preparation profile

```
goal:      find the questions the system already answers — asked by people and other
           systems, and asked by the system itself inside commands, event handlers and jobs —
           with their typical answers, consumers and sources, and check whether the words
           they are phrased in belong to the domain or to the solution
decisions: - which candidate island to analyse
           - Phase 0 verdict: is the seed a domain entity or a mechanism
           - existence confidence and genesis of each question
           - phrasing confidence: origin, shape and load-bearing status of each model term
           - whether a question is alive or dormant
gaps:      who-asks, domain-vocabulary, is-it-alive, belongs-together, what-it-holds,
           what-hurts, why-built-this-way
ceilings:  - no who-asks evidence (UI, API contract, reports, requirements) → existence
             confidence of e2e questions capped at Medium
           - no domain-vocabulary evidence (law, standards, interchange formats, customer
             documents) → phrasing confidence capped at Medium; a term can be shown
             system-taught but not shown domain-external
           - no is-it-alive evidence → a caller-less function is "no caller found", never
             "dead"; liveness of every question is unverified
           - dynamic SQL / dynamic calls and no query log → `question.callers` is partial;
             set `callers_note`
           - no what-it-holds evidence → typical answers are read from conditionals only;
             answers that never occur cannot be told from real ones
```

## How the plan is used
- Island discovery uses the plan's aggregates (co-change, FK clusters, statement counts).
- For class *huge*, `evidence-preparation` sets an area-scoped reading budget once the island
  is chosen (`reading_budget` with `scope: area:<area>`).
- Every confidence respects the plan's active ceilings.
- The report's "sources used / unavailable" and the handoff's `sources` come from the plan.
- New evidence obtained during the run is appended to the plan (enrichment rules).

---

# Input strategy and island discovery

When a full codebase is supplied: build or consume a cheap structural map first (nodes:
modules, classes, tables, endpoints, events, screens, jobs; edges: calls, reads, writes,
publishes, consumes, FK, renders; pointers back to source), identify candidate islands, map
their boundaries, then read source selectively.

Generate candidate islands from several independent signals — never one: structural coupling,
database topology (FK clusters, shared transactions, common readers/writers), Git or changelog
co-change, runtime co-occurrence, semantic similarity, business-change vectors (the same
business change repeatedly touching the same artifacts), pain signals (incidents, fixes,
reverts), boundary crossing (fan-in/out, many writers). Size and LOC are secondary hints.

## Ways to start
- **Mode A — seed from a thing** (a table, class, screen): expand through neighbouring tables,
  readers/writers, callers/callees, UI/API exposure, events/jobs, co-change; stop when evidence
  weakens or the boundary becomes too broad.
- **Mode B — seed from a problem** ("pricing changes touch 30 places"): build the island around
  the change vector from commits/changelog, tickets, traces, semantic matches.
- **Mode C — seed from calibration** (`--from-calibration`, alias `--z-kalibracji`): start
  from what the latest `legacy-init` calibration found, not from its top candidate.
  1. Read `<workspace>/calibration.json`: goal, scope, heuristics and every candidate with its
     locations, evidence ids and reason.
  2. Group the candidates by a shared concept: shared tables and classes in their locations,
     shared evidence ids, the same noun in their reasons. One candidate may belong to several
     groups.
  3. Show the groups with `AskUserQuestion`: concept, how many candidates it covers (e.g. „8 of
     9 candidates touch the group tree”), their ids, the strongest evidence. Put the dominant
     group first as the recommendation. Also offer a single candidate as a seed.
  4. The chosen concept is the seed; the union of its candidates' locations is the initial
     island boundary (Phase 1 may widen or cut it). The calibration goal and heuristics frame
     the run; its candidate levels are leads, not verdicts.
  5. Record in the handoff and the report which calibration id and which candidate ids the seed
     came from.

**No argument.** If `<workspace>/calibration.json` exists, ask with `AskUserQuestion` whether to
start from it (Mode C, recommended) or from a thing or a problem the user names. Without a
calibration, ask for a thing or a problem (Mode A or B) and mention that `legacy-init` produces
the candidates Mode C starts from. This skill does not rank islands across the whole system;
that is `legacy-init`'s job.

---

# Phase 0 — Interrogate the seed concept

Before boundary mapping, apply **P1–P4** to the seed (`reference-phenomena.md`), with **P2
split into P2a (system edge) and P2b (domain edge)**. A seed present only at P2a is
system-taught: not enough to call it real. Use the plan's domain-vocabulary artifacts for P2b;
code that translates the system's data into external formats is the cheapest P2b evidence.

Decide **domain entity** (proceed) or **mechanism** (name the domain concepts it encodes,
re-seed on them, keep the noun labelled "carrier / mechanism"). State verdict, evidence and
confidence. If genuinely ambiguous and it changes the analysis, use `AskUserQuestion`.

Do NOT pre-decide the reality of the re-seed targets. They are model words like any other and
go through V1–V4 in Phase 3.

---

# Phase 1 — Map the island boundary

- **IN** — endpoints, commands, UI actions, menu items, **event and message handlers**
  (consumers, listeners, triggers, callbacks, file/batch importers), jobs and schedules, calls
  from other modules, manual/admin actions.
- **INSIDE** — validations, decisions, policies, consistency checks, locks, state mutations,
  queries, calculations, branch points, orchestration, retries.
- **OUT** — DB writes, emitted events, external calls, files, notifications, read-model
  updates, queues, downstream jobs, audit effects.

Every IN — command, event handler, job, screen — is a **place where questions are asked**; list
them for Phase 2 and **record them** in `islands[].entries` (kind, name, `file:line` and method of
the declaration you read, the decisions it reaches). It is the list you found while navigating, not
a completeness claim — say so; exact entries with paths are `entry-flows`' job. The boundary is a **map for navigation, not a filter**: questions decided deep
below any entry point count just as much (Phase 2, bottom-up).

---

# Phase 1b — Screen the island's meanings before discovering questions

Apply `reference-phenomena.md` → "Homonym detection — early candidates, then evidence-based
confirmation" to the selected island. Use a bounded sample of boundary terms, their writers,
state transitions, main consumers and available domain sources. This is an initial map, not
a complete vocabulary verdict or a reason to exclude parts of the island.

- Start `vocabulary` with stable ids for **term + context + meaning**. Distinct meanings of
  the same spelling get distinct entries; record operational definitions and evidence.
- Follow the shared signals: qualification, identity/counting, lifecycle, translations,
  qualifiers/workarounds, disagreeing reports and producer–consumer assumptions.
- Mark unresolved suspicions `homonym.status: candidate`, with the compared contexts,
  signals and missing evidence. Keep `shape: unknown` until the domain comparison is earned.
- Carry these entries into Phase 2. Do not merge questions or criteria on shared names;
  bind each question term to the relevant glossary id. Add meanings discovered later.

## Industry check — how other companies in the same industry name it

The system's own vocabulary proves only P2a. Other companies in the same industry answer many
of the same questions, and their public interfaces are cheap P2b evidence.

1. **Domain and stack.** Take the short domain and stack description from the calibration
   (`calibration.json` → `system`) or the Evidence Plan (`system`). If neither has the domain,
   ask the user for one sentence: what the business does, for whom, in which market.
2. **Permission.** One `AskUserQuestion` before any web access: list the companies, standards
   and search terms you would use. Search terms come from the domain description and generic
   industry words only, never from code, internal identifiers or customer data.
3. **Fresh agent.** Spawn one `general-purpose` agent (not `fork`). Give it the domain
   description, the list of seed and boundary terms from the glossary (term + operational
   meaning, no code) and the questions the island seems to answer, in domain words. It reads
   public API references, developer docs, interchange standards and customer-facing
   documentation of 3–5 companies or standards in the industry, and returns per term: found
   with the same meaning / found with another meaning / the same thing under another name /
   not found, each with a source URL; and which of the island's questions those interfaces
   answer, in their words.
4. **Use.** Record each hit as V1 origin evidence (`industry-practice` or `domain-external`) and
   in V2. A term found nowhere in the industry is a strong system-taught signal for Phase 0
   and V1, not proof. A question other companies answer with different nouns is a candidate
   domain phrasing. Append the sources to the Evidence Plan.

---

# Phase 2 — Discover the questions (see `question-definition.md`)

Search in **three complementary directions** (`question-definition.md` → "Discovery directions"):

- **Top-down.** Walk every command, event handler, job and screen on the boundary and ask:
  *which questions does this need answered, and how does the system answer them today?*
- **Bottom-up.** Start from the **consequential effects** in the island — writes to money,
  balances and limits, status changes, blocks and unblocks, outgoing messages and files,
  deletions, cost or risk taken — and find the conditions that decide whether and how each
  happens. Every such condition is a candidate question, however deep it sits in the call
  tree. Trace it upward to the entry points that reach it (`needed_by`). A deep `if` that
  decides whether a balance changes may be the most important question of the area while no
  entry point mentions it.

### Third direction — structural questions about key domain concepts

Top-down and bottom-up can miss questions whose answer describes a key concept itself,
without a code decision consuming it. A participant, component or relationship can be an
input to a quantity or permission calculation **and** an independently requested answer.

For each **key domain concept of the island** (the few concepts the island exists to serve,
not every class or field), inspect four lenses:

| Lens | Discovery prompt |
|---|---|
| Participants | Who takes part, and in what roles or relationships? |
| Composition | What domain parts does it consist of, including their quantities where meaningful? |
| State | What is its current domain state? |
| History | How did it reach that state? |

These lenses produce **candidates, not automatic questions or quotas**. Keep a question
when evidence shows the system answers it for a meaningful consumer: a read endpoint,
screen, report, export or message presents that answer for a purpose; another module or
external system uses it; or a person receives it as meaningful information. Verify the
semantic use, not merely the presence of a field in a payload. Tests may corroborate that
the answer exists but do not, by themselves, establish that somebody asks it. A field,
getter, association or table alone is weak evidence: mark an unconfirmed candidate as a
low-confidence hypothesis or drop it.

- **Independent answers:** do not absorb a structural question into a quantity, permission
  or other question only because its answer is also used as an input. Keep both when each
  has its own evidenced consumer and meaning.
- **Semantic identity:** values of the same shape can describe different domain facts
  (current, agreed, settled, projected); compare meaning, not implementation provenance
  or accidental equality of values.
- **Concept level, not field level:** lenses are prompts, not a requirement to create one
  question per lens. Do not generate a question per field, nor force all findings under a
  lens into one question; apply `question-definition.md` → "Granularity".
- **Domain structure, not code structure:** distinguish domain composition and roles from
  decomposition into classes, tables or implementation records.
- **Same standards:** apply Phase 3 wording and Phase 4 genesis tests to these candidates.

Then sweep for anything all three directions missed.

Where questions hide:
- **Guards before a command** — every condition that can stop or redirect it; the alert texts
  are the typical negative answers.
- **Inputs a command needs** — which account / rate / counter-party / amount it must determine
  before acting.
- **Decisions inside event / message / file handling** — does this concern me, which path,
  duplicate or not, what next.
- **Jobs** — what is due, what is stuck, what must be closed.
- **Screens** — what is shown, which actions are enabled and when.
- **Flags and getters read by a caller** — the question lives in the consumer that branches on
  it; read the callers, not only the artifact. A flag nobody reads is a dormant signal.
- **Raw SQL over a table** — grep every table of the island by name (native queries,
  hand-built SQL strings, passthrough calls); each hit asks something of that table.
- **Validation errors, status transitions, policy chains, reports, ticket and changelog
  wording, traces, read models.**

For each question fill every field of `question-definition.md`: system phrasing, `asked_by`,
`answer_shape`, `typical_answers` (with the negative ones and their reasons), `consumers` with
their effect, `source`, `needed_by`; plus evidence, callers, `answered_by`
(artifacts that answer it) and existence confidence.

## Evidence strength
- **Weak:** a table exists; a DTO exposes fields; a class name contains a noun.
- **Medium:** endpoint/command + business-named method; repeated query pattern; status +
  branching; UI displays state.
- **Strong:** UI state + action buttons + backend guards controlling them; runtime trace;
  tickets/requirements describing the decision; repeated history around the same rule.
Triangulation across independent sources raises confidence.

## Do NOT transcribe the API — neither HTTP nor class
Questions are not endpoints and not methods. Consolidate per the granularity rules. A
well-named method (`Split()`, `CreateX()`, `close()`) is not automatically a question; earn it:
(a) read the body and add what the signature cannot tell (the cap inside a "partition", the
conservation guard inside a "split"); (b) consolidate several methods that serve one question;
(c) check it is alive (a named method with no caller is dormant, not answered). If a question
merely restates a method name and adds none of that, collapse or drop it. On a tidy codebase
the leverage is in the guard questions, the typical negative answers and the vocabulary
verdicts — none of which a method name reveals.

## Required content per question (report form)

**Hypothesis (system phrasing):** "May the operator's batch for this shift be closed?"
**Domain phrasing (draft):** "Is everything the operator accepted in this shift settled —
balanced, approved where required, sent to clearing?"
**Asked by:** system (inside the command "close batch"); needed by: close-batch (menu),
automatic close (jobs), day close.
**Answer shape / typical answers:** yes-no+reason — "No: document 12 not accepted", "No: not
sent to clearing", "No: debits ≠ credits", "Yes, after confirmation".
**Consumers:** block (interactive close), branch (automatic close skips most checks).
**Source:** row status fields, acceptance markers, clearing export status, sums per currency.
**Existence confidence / phrasing confidence / genesis**, **evidence**, **callers**,
**missing evidence**.

---

# Phase 3 — Vocabulary pass (Phenomenon 3, V1–V4)

1. **Complete the contextual glossary.** Extend the Phase 1b entries with every model noun
   and verb used in system phrasings (including re-seed targets). Run V1 and V2 per meaning.
   Resolve candidates using the shared protocol: two evidenced meanings, a distinguishing
   case, alternative explanations, affected questions and missing evidence. Preserve rejected
   candidates. A code-to-code contrast can be confirmed while domain `shape` stays `unknown`.
2. **Per question.** For each term in the question run V3: write the substituted question; mark
   the term `load_bearing` (cases, answer or asker change) or cosmetic, with one line why. Run
   V4 where the speaker differs from the asker.
3. **Domain phrasing.** The V3 rewrite becomes `phrasing.domain`. When all terms are cosmetic,
   the domain phrasing may equal the system phrasing. Domain words alone cannot rehabilitate
   a mechanism-induced question: after rewriting, confirm that the answer still has an
   independent domain meaning (Phase 4).
4. **Phrasing confidence** — separate from existence confidence; capped by the plan's
   domain-vocabulary ceiling.
5. **Escalation.** Load-bearing terms the code cannot settle become entries in the report's
   "questions for a domain expert" list (and one batched `AskUserQuestion` if the user is the
   expert). Cosmetic terms are never escalated.

Set `flag_for_critic` on every question with a load-bearing term, a candidate/confirmed
homonym, high existence confidence with low phrasing confidence, or a suspect genesis.
A homonym triggers review; only demonstrated V3 impact warrants `MODEL-PHRASED` for that
question. Do not infer a domain rephrasing from the homonym label alone.

---

# Phase 4 — Structure-induced questions (Phenomenon 1, S1–S6) and back-propagation

Detect bookkeeping questions with S1–S6, including questions induced by execution
mechanisms even when they use domain vocabulary. Separate business conditions from
execution scheduling/completion conditions; split hybrids (keep the domain half as a
question). Record which real questions each one guards and what would dissolve it.

Then apply the **back-propagation rule**: for every structural finding that says something
about a concept (no record of its own, status repeated per row, grouping key, repaired by
code), find every real question whose phrasing uses that concept's word and make sure V2 was
run for it with this finding as evidence. Update the glossary and the questions.

---

# Phase 4c — Group the questions into a tree (decision → question → criterion)

The list from Phases 2–4 is flat and usually too long: many items are criteria of a larger
question. Build `question_tree` (`current-model-json.md`) with the rules in
`question-definition.md` → "Grouping":

1. **Canonical questions first.** Consolidate the flat list by subject, domain meaning of
   the answer, answer shape and perspective — before assigning questions to decisions. Use
   the contextual meanings and distinguishing cases from Phases 1b/3; shared labels do not
   establish identity. Split
   distinct domain facts even if their values coincide; merge alternative breakdowns of one
   answer. Keep a single `questions[].id` for each independently meaningful question.
2. **Decisions and uses.** List the system's decisions (commands, jobs, handlers) and evidenced
   human/external uses (screens, reports, statuses sent out). A human decision needs no `if`,
   but do not invent one merely because a field exists. One canonical question may serve
   several decisions with different effects; capture all uses in `consumers` / `needed_by`.
3. **Cut criteria by effect within a decision.** Group criteria by the consequence of a
   negative answer for that decider (reject / defer / queue / escalate / block…). Different
   effects may require separate criterion groups, **not separate canonical questions**.
   Same effects do not merge semantically distinct questions. Put routing tables
   (`what-next`) and exceptions (`nadpisanie`) where they act.
4. **Leaves = criteria** with `file:line` and the negative answer (error code, message). Read
   the validator chain / guard list / screen DTO — not only the question text.
5. **Duplicates and placement.** Merge genuinely duplicate criteria into `places[]`; flag
   copies that disagree. Place each canonical `questions[].id` in the tree **exactly once**,
   under its primary evidenced use. For other decisions using it, record the link in the
   decision's `note` and the question's `consumers` / `needed_by`; do not clone the question
   or invent a new ID. This preserves the existing `current-model-json.md` contract.
   Questions the tree reveals as missing go to the report as missed questions.

Before publishing, audit granularity: the same meaning across decisions must be one
question; different domain meanings must stay separate; implementation dimensions of one
answer are criteria or answer details; a changed population/perspective matters only if it
changes what is asked. Record unresolved semantic identity disputes in the report.

Validate before the handoff: coverage (every canonical question once), no `pytanie` node
whose question-children have different `negative_effect`, every code criterion anchored.

# Progressive evidence acquisition

When evidence is insufficient, ask: *what is the smallest next piece of evidence that could
confirm or falsify this?* — one screen, the writers of one table, the consumers of one event,
one trace, five changelog entries, one stored procedure, one interchange-format builder for a
vocabulary question. Prefer selective deepening over broad reading. Evidence obtained this way
is appended to the Evidence Plan.

# Confidence rules
- **Existence — High:** independent sources align (UI action + backend guard + trace/ticket).
  **Medium:** two meaningful signals align, important uncertainty remains. **Low:** names,
  schema or structural patterns only.
- **Phrasing — High:** every load-bearing term confirmed at the domain edge (P2b) or by a
  domain expert, shape checked. **Medium:** terms checked against the code and the system edge
  only. **Low:** terms not checked.
- Both respect the Evidence Plan's active ceilings.

---

# Step 5 — Handoff and critic (automatic)

1. Write `<workspace>/<area>/questions-handoff.json` in the shape of
   `_shared/current-model-json.md` (island with `phase0`, `vocabulary`, `artifacts`,
   `relations`, `questions`, `structure_induced`; no `latent_representations`; no critic
   layers). Keep `evidence[]` full and qualify pointers with the business method name.
   Validate the JSON and its cross-references (every `answered_by` id exists; every `guards`
   id exists; every question `term_id` and homonym `compared_with` id resolves in the island;
   `affected_questions` ids exist; confirmed candidates have both meanings, a distinguishing
   case and checked alternatives; `question_tree` covers every question id exactly once and
   has no mixed-effect question nodes).
2. Unless `--no-critic` was given, spawn **one fresh agent** — `subagent_type:
   "general-purpose"`, **never `fork`** (a fork inherits this reasoning and destroys the
   independence the critic exists for). Give it only:
   - an instruction to run the `representation-question-critic` skill;
   - absolute paths: the handoff file, `evidence-plan.json`, the audited repository root, and
     the shared files (`question-definition.md`, `reference-phenomena.md`,
     `current-model-json.md`, `current-model-dashboard.html`);
   - the output directory `<workspace>/<area>/` and the area name;
   - the hard rules this run worked under (static snapshot only, no history, etc.);
   - explicit permission for a bounded amount of independent evidence gathering (a couple of
     targeted greps or one extra file per flagged or high-stakes question, including
     domain-edge sources for vocabulary) — not a re-survey.
   Do NOT pass this skill's narrative or reasoning; only the files.
3. Wait for it. It writes `<area>-current-model.json` and `<area>-current-model.html` and
   returns a short summary.
4. **With `--no-critic`** publish yourself: read the section "Required outputs" of
   `representation-question-critic/SKILL.md` and write `<area>-current-model.json` (handoff
   pruned the same way, no critic layers) and `<area>-current-model.html` from
   `_shared/current-model-dashboard.html` with the same embedding rule. Skip Step 6. In the
   report, items 4 and 8 say that no critic ran, and the confidence note says the questions
   were not challenged by an independent agent. State the dashboard path to the user.

# Step 6 — Reconcile disputed questions (short, decisive)

The generator over-accepts, the critic over-rejects. For every question where they materially
disagree (e.g. CONFIRMED-DOMAIN vs STRUCTURE-INDUCED/REJECTED, or cosmetic vs load-bearing):
re-read only the `file:line` the disagreement turns on, apply the relevant discriminator
(domain vs structural invariant; V3 substitution) and pick the side the evidence supports, or
split the question. If the evidence cannot settle it, use `AskUserQuestion` with the two
readings. Write the result into the published JSON as `question.reconciliation`
(`{decision, reason}`) and re-embed the dashboard (same template, same embedding rule).

# Step 7 — Report (`<workspace>/<area>/<area>-audit-report.md`)

Lead with the answer. Cite the few strongest `file:line` per item; evidence dumps go to an
appendix.

1. **⭐ Most certain questions** — 3–6 items that stand as CONFIRMED-DOMAIN or MODEL-PHRASED
   with at least Medium existence confidence after reconciliation, in their **domain
   phrasing**, each tagged with its confidence and the cheapest external signal that would
   confirm it. No jargon, no `file:line`.
1b. **Pains on the top questions** — Step 9: each pain, its trigger, the top questions (groups) it
   hurts with the number of reports each, the means vs the goal, one action → many answers, what
   dissolves it, and whether the ranking comes from human reports or code only.
2. **Confidence note** — once: scores are one LLM stage judging another over the same code; a
   priority-to-verify signal, not proof.
3. **Area analysed** — seed (and, in Mode C, the calibration id, the chosen group and its
   candidate ids), boundary, Evidence Plan summary (class, artifacts used, open gaps
   and what each leaves invisible), workspace path.
4. **Concept verdict** — generator vs critic, with re-seed targets.
5. **Questions** — table: id, system phrasing, domain phrasing, asked_by, answer shape,
   consumers, existence/phrasing confidence, critic verdict, reconciliation. Survivors first.
5b. **Question tree** — decisions with their questions and criteria (operator, negative effect,
   duplicates with all places); point to the dashboard's „Drzewo pytań” tab.
6. **Vocabulary** — contextual glossary: term/id, context, operational/domain meanings and
   sources, origin and domain shape. Show candidate/confirmed/rejected homonyms with their
   distinguishing cases, checked alternatives, missing evidence and actual V3 impact per
   question. Separate a confirmed difference in meanings from a demonstrated leak. Show the
   industry check per term: which companies or standards use it, with what meaning, or what
   they call the same thing.
7. **Questions the structure forces the system to ask itself** — with the real questions each
   guards and what dissolves it.
8. **What the critic killed or downgraded; what the generator missed.**
9. **Questions for a domain expert** — load-bearing terms the code could not settle.
10. **Next smallest investigation.**
11. **Next step:** run `latent-representation-explorer` on the same workspace and area (it
    takes this file's questions as input), then `representation-lens-explorer`.

State the workspace, the dashboard path (`<area>-current-model.html`) and the report path back to
the user.

# Step 8 — Generalize the decisions one level up (before the pains)

The question tree groups questions under decisions (by code: who consumes the answer). Go one level
higher and group the **decisions by effect**. One window over-fits its own reading, so this runs as
**three independent passes** and keeps the groups a majority found.

1. Write `<workspace>/<area>/decisions-for-generalization.md`: every decision of the published
   tree except REJECTED-only ones — text, decider, answer variants, its questions with the
   negative effect, criteria, `needed_by` and consumer effects. Nothing else.
2. Do your own pass, then spawn **two fresh `general-purpose` agents** (never `fork`), each given
   only that file. Heuristics per decision:
   - *What changes in the world if this decision acts, and who notices?* Decisions whose change
     the same outsider sees go into one group, even if they sit in different places in code.
   - *Is it the same decision at another moment or place* (computed in advance, shown to a
     person, sent to a partner, changing a later answer)? It joins that decision's group and
     gets a short **role** ("= D1 computed in advance on the pedestal").
   - *Is the group held together only by a shared mechanism* (computed from the same structure,
     "nearest on the parent line")? Then it is not a group — split it by effect.
3. **Merge:** keep groups found by a majority of passes; record `count` out of `passes`.

Write `question_tree.generalization` (shape in `current-model-json.md`; give each group a stable `id`, G1.. in the
order written — the pains point at it), re-embed the dashboard
(the overview shows the majority groups as a graph group → decision → question with each
decision's role, plus one concrete example; counts go under „Szczegóły”) and add item **12.
Decisions one level up** to the report.

# Step 9 — Pains judged on the top questions (always, also with `--no-critic`; after Step 8)

A pain is judged **only on a top question**: a generalization group from Step 8 (its `name` is the
question an outsider asks, e.g. „Czy ta karta dostanie prąd na tym kempingu”), or a decision no
majority group took (then that decision is its own top question). Never on a single `Q` or a
criterion. Someone reports that an answer went wrong for them — that answer is the top question;
the questions under it are only how the system computes it today. Ranking per `Q` rewards whatever
the mechanism happens to split finely.

A pain names today's mechanism ("market is parsed from a name prefix", "moving a node breaks
access"). The next question is **what is it for?** — nobody needs a prefix, they need an answer.
Answer it from the published JSON, without new code survey:

1. **Find the pains.** Use the sources the Evidence Plan allows: tickets, wiki, transcripts,
   incidents (note status, who reports, effect: money, blocked service, manual work, workaround,
   "don't touch" lists). With code only, use code signals — `awkwardness`, structure-induced items,
   confirmed homonyms with a leak, duplicate implementations, logic keyed on names — and set
   `weight_basis: "code-only"` (confidence at most Low).
2. **Put every signal on a top question.** Ask of each report: *which answer went wrong for the
   reporter?* Map it to the group whose question that is (or to an ungrouped decision). A report
   naming a mechanism ("prefix", "tree") goes to the top question whose answer it broke for
   someone. Count `reports` per top question.
3. **Pick the 1–3 biggest pains** by what they do to the top questions (reports, status, effect,
   how many top questions one trigger breaks); give each a short name (`thing`, 2–6 words) and the
   everyday action that triggers it (`trigger`). `purpose[]` = one entry per top question it
   hurts: `group_id` (or `decision_id`), `top_question` as written, `reports`, `why` (what goes
   wrong for whom).
4. **Separate means from goal — the value heuristic.** For the thing that hurts ask: *does it
   bring value by itself — is it a domain action someone would ask for — or is it a means to a
   bigger goal that other parts of the system (or people) can observe?* Example: "parse the
   market from the name prefix" brings nothing by itself; the observable goal is "price the
   draw and bill it in ERP for the right country". "Grant a staff card on this campsite" is a
   domain action — someone asks for it. Record `standalone_value` (`domain-action | means`), for a
   means `observable_goal`, the part of the mechanism that is only a means (`means_not_goal`) and
   the structure-induced items behind it (`structure_induced`, `[]` on a genuine domain question).
   **Only when the pain is structure-induced**, attempt the top question in domain words without
   the seed concept and mechanism words — `domain_question`.
5. **One action, many answers.** When the trigger changes several top questions the business
   treats as separate, write which one the action was meant to change and which change with it
   (`one_action_many_answers`, in top questions).
6. **What dissolves it** — only by citing an existing structure-induced item (`SI#`); never
   propose a new representation here (that is `representation-lens-explorer`).

Write `islands[].pains` and one sentence on how they were ranked — sources, number of reports per
top question, what was weighed — in `islands[].pains_method` (shape in `current-model-json.md`) into
`<area>-current-model.json`, re-embed the dashboard (same template, same embedding rule) and add
item 1b to the report. If no source shows a pain and the code shows none either, write `pains: []`
and say so in the report.

---

# Result page (dashboard)

Always publish from `_shared/current-model-dashboard.html` (embed the JSON, never hand-edit the HTML).
Write any helper script (embedding, pruning, counting) in Node.js (`node -e` or an `.mjs` in the
workspace, standard library only), never Python: Python may be missing on the user's machine, Node is required.
The overview reads, in order: the questions of the concept (not of the whole system), the question
tree, decisions grouped by effect (Step 8), the pains on the top questions (Step 9) and the island files (`#pliki-wyspy`: every
`artifacts[].file`, copyable — list each file the island really consists of); everything else sits under
„Szczegóły”. For it to read well, fill: a short `question_tree` decision/question `text` in domain
words, `generalization.groups[].roles`, and for every pain `thing`, `standalone_value`,
`observable_goal`, `purpose[]` and `pains_method`. Do not put pass counts or method talk in names or
roles — the page explains the method itself.

# Anti-patterns

Do NOT:
- summarise the whole repository before forming hypotheses;
- equate database schema with domain model, or treat nouns as entities automatically;
- treat "question" as "read endpoint" or skip the questions asked inside commands and events;
- record only positive answers;
- accept a word as domain vocabulary because it is on the system's screens (P2a only);
- confirm a homonym from storage structure alone, merge meanings by spelling, or turn a
  homonym label into `MODEL-PHRASED` without per-question V3 evidence;
- leave a structural finding in the structure-induced bucket without back-propagating it;
- treat the entry points as a filter — a consequential conditional deep in the code is a
  question even if no command, event or screen names it;
- list structure-induced questions as questions the system answers;
- name or classify latent representations — that is `latent-representation-explorer`;
- propose new representations or new questions — that is `representation-lens-explorer`;
- hide uncertainty or produce unsupported "business insights";
- run the critic as a fork, or pass it your reasoning instead of the files;
- treat every `if` as a question, or leave the list flat — group criteria under the question
  and decision they serve (Phase 4c);
- assume a question needs code: a person deciding from a screen asks questions with no `if`.

# Main principle

> **What does this system need to know — when people ask it, and when it asks itself in the
> middle of its own work — how does it find out today, and are the words we describe it with
> the domain's or the solution's?**

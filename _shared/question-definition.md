# Shared reference — what a "question" is

> Single source of truth for the unit of analysis in the representation-archaeology skills
> (`concept-explorer`, `representation-question-critic`,
> `latent-representation-explorer`, `representation-lens-explorer`). Do not restate it in the
> skill bodies — reference this file.

## Definition

A **question** is a piece of information that somebody — a person, an external system, a
regulator, or **the system itself while doing its work** — needs to understand domain state,
make a decision or act, and that the system today **establishes** from stored data,
calculations or external inputs. A meaningful read-only answer does not require a subsequent
`if` or an observable action in the code.

**"Question" is NOT a query in the CQRS sense.** Do not reduce it to the query side of a
query / command / event split, and do not look only at read endpoints and reports. Most of the
important questions in a legacy system have no endpoint of their own: they are asked by the
system while it executes a command or handles an event.

- A **command** is not a question, but it **needs questions** to execute: *may I do this now?*
  (guards), *with what?* (which account, which rate, which counter-party), *how much?*
  (amounts, limits). "Close the batch" has no endpoint called "can the batch be closed?", yet
  the system answers that question every time — with a precise list of conditions. That
  question is exactly what this skill family must find.
- An **event / message** is not a question, but handling it **needs questions**: *does this
  concern me?*, *which path do I take?*, *is this a duplicate?*, *what must happen next?*
- A **screen** asks questions to decide what to show and which actions to enable.
- A **scheduled job** asks *what is due now?*, *what is stuck?*
- A **flag/getter read by a caller**, a **validation**, a **raw SQL statement** over a table —
  each is an answer to a question somebody acts on.
- A **conditional deep in the code** — many calls below any command or event — that decides
  something consequential: whether money moves, a balance changes, a block is set, something is
  sent out, a status changes, a cost or a risk is taken. It may be the most important question
  in the area even though no entry point names it.

## Discovery directions

The archaeology works in **three complementary directions**:
- **top-down** — for every command, event handler, screen and job: *which questions does this
  need answered, and how does the system answer them today?*
- **bottom-up** — for every consequential effect (writes to money/balances/limits, status
  changes, blocks, outgoing messages, deletions): *which conditions decide whether and how it
  happens?* Trace these candidates upward to their consumers (`needed_by`).
- **structural concept lenses** — for a few key domain concepts, inspect independently asked
  questions about participants/relationships, composition, current state and history. These
  must have evidence of meaningful consumption; a stored field or test alone is not enough.

The entry points are a map for navigation, never a filter on which questions count.

## The fields of a question

| Field | Meaning |
|---|---|
| **phrasing** | Two versions: `system` — in the system's own words (what the team says); `domain` — the same question in the language of the domain, without model nouns that turned out to be load-bearing (see `reference-phenomena.md` → Phenomenon 3). |
| **asked_by** | `system` — the system asks it of itself while executing a command / handling an event / running a job, and acts on the answer internally; `e2e` — an actor outside the system (a person at a screen, an external system, a regulator) needs the answer; `both`. Who exactly and when is recorded only when the evidence shows it; it is not required. |
| **answer_shape** | The kind of answer: `yes-no+reason`, `which` (one / list), `how-much`, `when`, `why` (explanation), `what-next`, `what-if`. |
| **typical_answers** | The concrete answers the system actually gives, read from code, alerts, UI and messages — including the negative answers and their reasons ("No: document not accepted", "No: not yet sent to clearing", "Yes, after the operator confirms"). The list of typical negative answers is often the most precise description of the question. |
| **consumers** | What happens to the answer, per consumer: `block` (hard stop), `warn-override` (operator may proceed), `override-with-right` (proceed only with an extra permission), `branch` (selects a path), `display`, `record` (written somewhere), `leaves-system` (sent out). |
| **source** | Where the system takes the answer from today: stored fields, derived/denormalised data, rule or configuration data, an external service, or other questions (composition). |
| **needed_by** | The commands, events, screens and jobs that need this question answered. One question is often needed by several of them. |

The evidence, confidence, genesis, vocabulary and callers fields are defined in
`current-model-json.md`.

## Granularity — when is it one question, when two

- **Resolve meanings before merging.** Compare contextual glossary entries and distinguishing
  cases first; shared spelling, a shared table or equal answer shapes do not establish
  semantic identity.
- **Identity = subject + domain meaning of the answer + answer shape + relevant perspective.**
  Caller, decision, source location, code path and effect do not define the identity.
- **Same answer shape need not mean same question.** A current quantity, a negotiated quantity
  and a settled quantity can be different domain facts even when values coincide. Separate
  them by business meaning, not by technical provenance alone.
- **Different answer shapes usually indicate different questions**, but verify semantic
  identity rather than splitting mechanically. For instance, "does this require acceptance?"
  (`yes-no+reason`) and "who may accept it?" (`which`) are distinct answers.
- **Merge answer dimensions, not independent facts.** Fields, component values and breakdowns
  that constitute one answer for the same subject/perspective belong under one canonical
  question as criteria or answer details. A different population or perspective warrants a
  separate question only if it changes what is actually being asked.
- **Do not split by caller, asker or decision alone.** One answer may serve several commands,
  screens or actors with different consequences; record uses under `consumers` / `needed_by`.
- **Do not merge different subjects** merely because they share a code path or effect.
- **A question about the container rather than the contents** (index valid, counter correct,
  number unique) is a structure-induced question — it goes to its own bucket
  (`reference-phenomena.md` → Phenomenon 1), never into the question list.

## Grouping — decision → question → criterion (the question tree)

A flat list of questions mixes levels: a dozen validators each "answer a question", yet together
they answer one ("may this order be executed now?"), which itself has sub-questions ("is there
money?"). Not every `if` is a question, and a question need not have an `if` at all.

- **Decision** (root): what somebody decides with the answers. It may be the system's (a
  command, job, event handler) **or a person's / external system's outside the code** — an
  operator looks at a screen and decides in their head, a participant decides from a status.
  Record `decider` and the decision's variants (execute / reject / defer / queue / escalate…).
- **Question** (middle): a canonical domain question, identified **before** decision grouping
  by the granularity rules above. The **cutting rule** groups *criteria under one decision* by
  the effect of a negative answer for that decider; it must **never** define, duplicate or
  merge question identities. Different effects do not split one canonical question; a shared
  effect does not merge semantically distinct questions. For an evidenced human use without a
  code branch, fields shown together for one purpose may substantiate the answer; do not
  invent a person's decision or intent that the evidence does not support.
- **Criterion** (leaf): an `if` / validator / query / repair check (system decision) or a shown
  field / column / filter / colour (human decision), with its `file:line` and typical negative
  answer. The criteria list is what a question's `typical_answers` summarise.
- **Operators** on inner nodes: `AND` (all must hold), `OR` (one suffices), `pierwszy-błąd`
  (ordered short-circuit — order matters and yields the reason), `nadpisanie` (an exception
  that changes the group's effect, e.g. "this issuer is never rejected"), `routing`
  (condition → decision variant).
- **Duplicates**: the same semantic question used in ≥2 places is ONE canonical question;
  identical criteria can be consolidated with `places[]`. The scattering is a finding —
  especially when implementations disagree. Similar technical sources or identical negative
  effects do not by themselves prove semantic identity.

The tree lives in `question_tree` (`current-model-json.md`); the flat `questions[]` stay and
the tree points at them by id. Every canonical question appears in the tree exactly once (as a
question or as a criterion); place it under its primary evidenced use and describe its other
uses in `consumers` / `needed_by` and the other decisions' `note`. Do not manufacture
additional question IDs for another decision. A split must be explicit.

## A question is independent of the representation

The same question can be answered by many representations; the current one is only how the
system happens to do it today. Therefore:

- phrase the question so that it would survive a change of representation — that is what the
  `domain` phrasing is for;
- if the question can only be stated with the model's own nouns, either its domain form has
  not been found yet (Phenomenon 3) or it is structure-induced (Phenomenon 1).

## Anti-patterns

- One question per endpoint, per method or per command.
- Looking only at read endpoints/reports ("CQRS queries") and missing the questions asked
  inside commands and event handlers.
- Dropping a question because nothing exposes it as an endpoint.
- Phrasing a command as if it were the question ("close the batch") instead of the question
  the command needs ("is everything the operator accepted in this shift settled?").
- Recording only the positive answer; the negative answers with their reasons define the
  question.

## Domain-neutral example (illustration only — do not carry as a prior)

Command **"ship the order"** needs:

| Question (domain phrasing) | asked_by | answer_shape | typical answers | consumers |
|---|---|---|---|---|
| Has the customer paid for this order? | system | yes-no+reason | yes / no: payment pending / no: payment refunded | block |
| Which warehouse can fulfil all lines now? | system | which | warehouse W1 / split W1+W3 / none | branch |
| Can the carrier deliver to this address? | both | yes-no+reason | yes / no: PO box / yes with surcharge | warn-override, display |

None of these has an endpoint; all three are answered every time the command runs.

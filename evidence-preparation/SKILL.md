---
disable-model-invocation: true
name: evidence-preparation
description: >
  Preparation phase for an analysis skill that works from evidence of an existing system (code, schema, data,
  traces, Git history, tickets, UI, docs). Before the analysis it (1) sizes the system cheaply, (2) inventories
  the evidence already available, (3) asks the user in one justified round for missing artifacts that would
  change the result, saying what each adds, and (4) sets a reading budget: read fully / aggregate / skip. Writes
  an Evidence Plan with a confidence ceiling to `<workspace>/evidence-plan.json` (contract:
  `_shared/evidence-plan.md`), shared by all consumers of the same system and enriched on later runs. Invoke at
  the start of an archaeology / audit / discovery skill, or when asked "what should I give you before you
  analyze this", "jakie artefakty przygotować", "co warto doczytać", "czy to nie za dużo do przeczytania". Not
  for checking whether requirement/domain materials are complete enough to model — use strategic-questions; not
  for deciding whether to modularize at all — use pre-flight-gate.
argument-hint: "[path/area] [consumer skill or goal] [--workspace <dir>]"
---

# Evidence Preparation

## Purpose

Decide **what to read before reading it**. An analysis skill that starts straight from the
code silently caps its own confidence (code alone rarely says who asks, how often, or what
hurts) and, on a large system, burns its budget on the wrong files.

This skill produces one thing: an **Evidence Plan** — which artifacts exist, which the user
will supply, how each will be consumed, and what the analysis will not be able to see.

Write any helper script (counting tickets, parsing `gh` or `git log` output) in Node.js (`node -e` or an `.mjs`
in the workspace, standard library only), never Python: Python may be missing on the user's machine.

The plan is a **file**, `<workspace>/evidence-plan.json`, in the shape defined in
`~/.claude/skills/_shared/evidence-plan.md` (workspace layout, schema, enrichment rules). One
plan serves every consumer that analyses the same system, and it grows over time: later runs,
the user and the consumers themselves add artifacts to it. Read that file before Step 1.

It does not analyze anything. It writes or updates the plan, shows its summary, hands the
path back to the consumer and stops.

---

## Existing plan — incremental run

Before Step 1, look for `<workspace>/evidence-plan.json`.

- **Found:** load it. Register the calling consumer's profile in `consumers` (or update its
  `last_used`). Re-run Step 1 only for numbers that may have changed; re-check every `open`
  or `partial` gap and every `open_requests` entry (was it delivered? is the database up
  now?); run Step 2 only for artifacts relevant to gaps this consumer needs that the plan does
  not cover yet; ask (Step 3) only about those. Keep everything else. Log what changed.
- **Not found:** run Steps 1–4 and create it.

---

## Consumer profile

A consumer skill calls this one with a **preparation profile**. If the profile is missing
(standalone run), derive it from the user's stated goal and say that you did.

```
goal:        one line — what the consumer is trying to find out
decisions:   the 2–4 decisions evidence may change (e.g. "which area to analyze",
             "is the concept real", "confidence of each finding")
gaps:        which gaps from the catalog below matter, in priority order
ceilings:    rules of the form "without <gap> closed, <result> is capped at <level>"
```

`decisions` is the value test for everything below: **an artifact is worth asking for or
reading only if it can change one of them.**

---

# Step 1 — Reconnaissance (no user involvement)

A handful of cheap commands. Do not open source files yet.

- **Size:** file count, LOC per language, number of tables / migrations, number of
  endpoints or entry points if countable by grep.
- **Paradigm:** OO with ORM / transaction script over a database / event-driven / mixed.
  Judge from cheap signals (ORM annotations, raw SQL density, message handlers).
- **What is already here:** Git history depth and commit count, tests, frontend code,
  DDL / migrations, API contracts, ADRs / docs, job or scheduler config, sample data,
  exported logs.
- **Red flags that raise the value of a specific artifact:** dynamic SQL built from strings
  or macros, no declared foreign keys, logic in triggers / stored procedures, rules stored
  in tables, no UI in the repo, shallow or squashed Git history.

Classify the system:

| Class | Rough signal | Reading stance |
|---|---|---|
| small | area of interest fits in one context | read the area whole |
| medium | area fits, system does not | selective reading guided by a structural map |
| huge | even one area does not fit | structural map mandatory, one area at a time, aggregates only |

State the class and the two or three numbers it rests on. It is an estimate; say so.

## Remote sources (probes)

Some evidence lives outside the repo: wikis, Confluence spaces, trackers. Probe for them here, cheaply, so Step 2
can mark them `found` instead of guessing. Every probe is one section with the same four parts, so a new source
(Jira, SharePoint, Notion…) is added as one more section without changing the others:

- **Detect** — the cheap signal that the source may exist.
- **Check** — one cheap command or tool call; no bulk download.
- **Record** — what goes into the inventory: found / not found / no access, address, size.
- **Read later** — how the consumer reads it once it is `found`.

All probes are read-only and use only existing access: never ask for credentials in chat, never install a
connector, never scrape pages behind a login. A failed probe is a recorded gap, not a blocker.

### Probe: Git wiki (GitHub, GitLab)

- **Detect:** `git remote get-url origin` points to GitHub or GitLab, or the user gave a wiki address.
- **Check:** `git ls-remote https://<host>/<owner>/<repo>.wiki.git` (rewrite an SSH remote to HTTPS). Refs
  returned = a wiki with pages; an error = no wiki, no pages or no access.
- **Record:** wiki address, `found` / `not found`; page count once cloned.
- **Read later:** `git clone --depth 1 <wiki> "$(mktemp -d)"` (outside the repo and the workspace), read pages
  as attributed sources and cite page names. Pages that look like transcripts or meeting notes are
  attributed knowledge of the people speaking in them.

### Probe: Confluence

- **Detect:** links in README, docs, commit messages or tickets (`atlassian.net/wiki`, `/confluence/`,
  `/display/<SPACE>`, `/spaces/<SPACE>`); an address the user gave; Confluence / Atlassian MCP tools available
  in the session.
- **Check:** with MCP, one title-only search in the space. Without MCP, request one linked page and keep only
  the HTTP status (public or login). Otherwise just collect the links.
- **Record:** space key or base URL, access (`mcp` / `public` / `login required`), the links found and where.
- **Read later:** through MCP, a public page fetch, or an export the user provides (Step 3 may ask for it).

---

# Step 2 — Evidence inventory

Walk the artifact catalog (bottom of this file). Give each artifact one status:

- **found** — present locally; note where and how big
- **ask** — not found, could exist, and would change a `decision`
- **n/a** — cannot change any `decision` for this system, or the gap is already closed
  by something found

Results of the remote probes (Step 1) enter this inventory like local artifacts: a `found` wiki or
Confluence space is `found`, a link without access may be **ask**.

Only **ask** items go to Step 3. An artifact whose gap is already well covered by a found
one is **n/a**, not **ask**.

---

# Step 3 — Ask the user (one round, every question justified)

Use `AskUserQuestion`, in the user's language. At most four questions; if more than four
artifacts are **ask**, take the four that close the highest-priority gaps and list the rest
in the plan as "not asked".

**Every question must justify itself.** The user should be able to decide whether fetching
the artifact is worth their effort without knowing how the consumer skill works. Each
question therefore carries:

1. **Why now — the reconnaissance finding that makes it matter here.** Tie it to something
   observed in Step 1, not to a generic benefit.
2. **What it would add** — the concrete things the analysis will be able to see or decide.
3. **What stays invisible without it** — including the confidence ceiling that applies.
4. **What exactly is needed and in what form** — period, format, anonymization, so the user
   knows the cost of saying yes.

Put 1 and 4 in the question text, 2 in the description of the "yes" options, 3 in the
description of the "no" option. Offer a cheaper substitute as its own option when one exists.

Example:

```
question: "I found ~200 SQL statements assembled from strings, so grep cannot tell me which
           code really touches which table. Do you have a database query log covering at
           least one full business cycle (including a month end)?"
header:   "Query log"
options:
  - label: "Yes, I'll give a path"
    description: "Adds: the real callers of each table, the joins the schema does not
                  declare, call frequency to rank areas, and never-executed paths as a
                  dead-code signal. I aggregate it with a script; I do not read it raw."
  - label: "Only table statistics"
    description: "Cheaper substitute: row counts and last-write dates. Shows which tables
                  are alive, but not who calls them."
  - label: "No"
    description: "Without it: clients of dynamically built SQL stay invisible and
                  liveness is unknown — findings are capped at Medium confidence."
```

Rules:

- Do not ask for something Step 1 already found.
- Do not ask a question whose answer cannot change the plan.
- Never ask for raw production data without stating the anonymized or aggregated
  alternative.
- If the user declines everything, continue — record the ceilings and move on.
- If `AskUserQuestion` is unavailable, say so and continue with what was found.

---

# Step 4 — Reading budget

For every available artifact (found or supplied) choose one treatment:

- **read fully** — small, and central to a `decision`
- **aggregate** — large; consume a summary produced by a script or query, never the raw
  artifact. Typical aggregates: top statements per table with counts, co-change pairs from
  Git, value distribution of status columns, row counts and last-write dates, tickets
  grouped by component
- **sample** — large and not aggregable; read a bounded slice chosen by the hypothesis
- **skip** — would not change a `decision`, or its gap is already closed

Tests to apply:

- **Value:** which `decision` could this change? None → skip.
- **Cost:** estimate size before opening. A week of traces or a database dump is never
  read raw, whatever the system class.
- **Redundancy:** two artifacts closing the same gap — take the cheaper one, keep the
  other as a fallback.
- **Coverage of the period:** a runtime artifact shorter than the business cycle proves
  "seen", never "dead". Record the period it covers.

For class **huge**, the budget covers one area at a time. Revisit Step 4 (not Steps 1–3)
once the consumer has chosen its area.

---

# Output — the Evidence Plan

Write or update `<workspace>/evidence-plan.json` (shape: `_shared/evidence-plan.md`). Put every
aggregate you produce under `<workspace>/evidence/<artifact-id>/` and list it in that
artifact's `aggregates`. Then show the summary below in chat and give the consumer the plan's
absolute path.

The chat summary is short. This is what the consumer and the user see.

```
System: <size numbers>, <paradigm> → class: <small|medium|huge>   (estimate)
Red flags: <only those found>

Artifact            Status       Treatment        Closes gap
Git history (8y)    found        aggregate        belongs-together, what-hurts
DDL                 supplied     read fully       belongs-together
Query log (30d)     supplied     aggregate        is-it-alive
Data                declined     —                (rules stored in data: invisible)
Tickets             not asked    —                (business wording: weak)

Confidence ceiling: <from the consumer's ceilings, given what is missing>
Will not be visible: <one line per unclosed gap>
```

**Gate:** show the plan and continue. Wait for explicit approval only when the class is
**huge**, because a wrong reading plan is most expensive there.

The consumer carries the plan forward: it fills its "sources used / unavailable" section
from it and passes it to any downstream or reviewing skill, so they can use the same
artifacts instead of code alone.

---

# After preparation

- **Later questions to the user** are allowed only when the smallest next piece of evidence
  is something only the user has. Justify them the same way as in Step 3.
- **Evidence obtained later** (a file the user hands over mid-analysis, a database that came
  up, an aggregate a consumer computed) is appended to `evidence-plan.json` by whoever
  obtained it, following the enrichment rules in `_shared/evidence-plan.md`.
- **Stop rule:** when two consecutive additional sources changed nothing in the consumer's
  findings, stop widening.
- The plan is a starting budget, not a contract. Deviating from it is fine; say what
  changed and why.

---

# Artifact catalog

Grouped by the gap each one closes. "Adds" and "Without it" are the raw material for the
Step 3 justifications — specialize them with the Step 1 findings; do not paste them as is.

## who-asks — who outside the system needs the answer

| Artifact | Adds | Without it |
|---|---|---|
| Frontend code / screens | actions offered to a user and the conditions enabling them; the vocabulary people see | intent is inferred from backend names only |
| API contracts | what leaves the system boundary and to whom | external and internal consumers cannot be told apart |
| Report definitions | questions the business asks explicitly and repeatedly | recurring questions hide inside generic queries |
| Requirements / user docs | questions stated in business words | every business question stays a hypothesis |

## is-it-alive — is it used, and how often

| Artifact | Adds | Without it |
|---|---|---|
| Runtime traces | the real path of an operation across components | paths are reconstructed statically and may be wrong |
| Database query log | real statements, real joins, callers of dynamically built SQL, frequency | dynamic SQL clients invisible; liveness unknown |
| API access logs / analytics events | which entry points are used and by how many | dead endpoints look as important as hot ones |

## belongs-together — what forms one area

| Artifact | Adds | Without it |
|---|---|---|
| Dependency graph with source pointers | navigation without reading files | boundaries are guessed from folders and names |
| Database schema (with triggers, procedures, views) | FK clusters, status and history columns, logic that lives in the database | tables are known only where code mentions them; database-side logic missed |
| Git history | what changes together across module boundaries | co-change coupling invisible |
| Event topology | who publishes and who consumes | asynchronous coupling invisible |

## what-hurts — where change is expensive

| Artifact | Adds | Without it |
|---|---|---|
| Incident reports | where the system actually fails | pain is inferred from code smell only |
| Tickets | recurring change requests and their wording | business change vectors unknown |
| Git history | rework, reverts, long-lived changes | fragile areas look the same as stable ones |

## what-it-holds — what the system really stores

| Artifact | Adds | Without it |
|---|---|---|
| Table statistics | which tables and columns are alive | dormant structures treated as current |
| Value distributions of status / type columns | states that really occur vs states that exist only in code | every enum value treated as reachable |
| Dictionary and configuration tables | rules stored as data | data-driven logic invisible |
| Anonymized row samples, history tables | real transitions and real cases | lifecycles are reconstructed from conditionals only |

## domain-vocabulary — what the domain calls things, outside this system

The system's own screens and manual are written in the solution's words; users learn them from
the tool. This gap is about the domain's edge: sources the system does not control.

| Artifact | Adds | Without it |
|---|---|---|
| Law, regulation, industry standards for the domain | the domain's definitions of the key concepts; which words are domain words at all | a word on the system's screens cannot be told from a domain word — phrasing confidence capped at Medium |
| Interchange formats the system exchanges (clearing/payment messages, regulatory reports, tax files) and the code that builds them | a ready translation table between the system's vocabulary and the outside world's | homonyms (domain word, solution shape) go unnoticed |
| Documents given to customers (statements, contracts, confirmations) | the customer's vocabulary | the e2e phrasing of questions is guessed |
| A domain expert reachable for short questions | settles load-bearing terms the code cannot settle | load-bearing terms stay open questions in the report |

## why-built-this-way — the reasons behind the structure

| Artifact | Adds | Without it |
|---|---|---|
| ADRs / architecture docs | which structure was chosen and why | accidental and deliberate structure cannot be told apart |
| Tests | expected behavior stated explicitly | intended and incidental behavior cannot be told apart |

---

# Anti-patterns

Do NOT:

- ask for an artifact without saying what it would add and what is lost without it;
- justify a question with a generic benefit instead of a reconnaissance finding;
- ask for everything in the catalog — ask only for what can change a `decision`;
- read a large artifact raw when an aggregate answers the same question;
- treat a short runtime window as proof that something is dead;
- block the analysis because the user has nothing extra to give;
- hide a gap — every unclosed gap appears in the plan with its consequence.

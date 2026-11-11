# Shared reference — the Evidence Plan file (`evidence-plan.json`) and the audit workspace

> Contract between `evidence-preparation` (writer) and every skill that consumes evidence
> (`concept-explorer`, `representation-question-critic`,
> `latent-representation-explorer`, `representation-lens-explorer`, and any later consumer).
> The plan is a **file**, not a chat message: produced once, read by every consumer, and
> **enriched over time** — by later runs of `evidence-preparation`, by the user adding
> artifacts, and by consumers that obtain new evidence. Keep this file and the consumers in
> sync; do not restate it in skill bodies.

## The audit workspace

Optional `legacy-init` calibration links goals and heuristics to this inventory without
requiring a graph. Independent `code-evidence-graph` runs retain entry-flows bundles and
scoped queries. Layout, compatibility and consumer rules are in
[legacy-workspace.md](legacy-workspace.md). Neither automatically closes domain gaps.

All artifacts of one audited system live in one directory, the **workspace**:

```
<workspace>/                              # one per audited system
  evidence-plan.json                      # this contract — shared by all areas and all consumers
  evidence/                               # aggregates, exports and user-supplied evidence files
    <artifact-id>/...                     #   one sub-folder per artifact that has files
  <area>/                                 # one per analysed island / seed (kebab-case)
    questions-handoff.json                #   generator → critic (interim, not published)
    <area>-current-model.json/.html       #   questions + critic verdicts (critic writes)
    <area>-representations.json           #   latent representations (latent-representation-explorer)
    <area>-model.html                     #   combined dashboard: questions + representations
    <area>-audit-report.md                #   human report (question explorer, after the critic)
    <area>-lenses.json/.html              #   lens-explorer output
```

**Location.** The caller may pass `--workspace <dir>`. Otherwise use `<repo>/analiza/`, where
`<repo>` is the root of the git repository the session was started in (the analysed system).
Everything happens in that repository: the person who started Claude there looks for results
there. On first write create `<workspace>/.gitignore` containing `*`, so results never get
committed or pushed with the client's code. Always state the workspace path to the user at the
end of a run, relative to the repository (`analiza/<area>/…`).

## `evidence-plan.json` — shape

Convention + example, not a formal JSON Schema. Keep it valid JSON.

```jsonc
{
  "$schema_version": "evidence-plan/1.0",
  "system": {
    "name": "billing-legacy",
    "root": "/abs/path/to/repo",                 // absolute
    "class": "small | medium | huge",
    "numbers": { "loc": 1200000, "files": 900, "modules": 100 },   // free-form, what the class rests on
    "paradigm": "transaction script over a relational database",
    "red_flags": ["dynamic SQL in many call sites", "no DDL in repo", "no .git"]
  },
  "consumers": [                                 // every skill that has used this plan, with its profile
    { "skill": "concept-explorer",
      "profile": { "goal": "...", "decisions": ["..."], "gaps": ["who-asks", "..."], "ceilings": ["..."] },
      "last_used": "2026-10-14" }
  ],
  "gaps": [                                      // open catalog — see evidence-preparation for the base set
    { "id": "who-asks", "status": "closed | partial | open",
      "closed_by": ["art-userdoc", "art-ui"],
      "invisible_while_open": "every question stays a hypothesis about intent" }
  ],
  "artifacts": [
    { "id": "art-git",                           // stable; never reused for another artifact
      "kind": "git-history",                     // OPEN set — consumers must accept unknown kinds
      "status": "found | supplied | ask | declined | not-asked | n/a",
      "location": "/abs/path | url | null",
      "size": "781 MRs", "period": "2025-08..2026-09",
      "treatment": "read-fully | aggregate | sample | skip",
      "closes_gaps": ["belongs-together", "what-hurts"],
      "aggregates": [                            // derived files; consumers read these, not the raw artifact
        { "path": "evidence/art-git/module-change-frequency.tsv",
          "what": "MR count per module", "how": "script or command that produced it" }
      ],
      "notes": "changelog used as git substitute",
      "added_by": "evidence-preparation | user | <skill name>",
      "added_on": "2026-10-13" }
  ],
  "ceilings": [                                  // per consumer; active=false once the gap closes
    { "consumer": "concept-explorer", "gap": "is-it-alive",
      "rule": "a caller-less function is 'no caller found', never 'dead'", "active": true }
  ],
  "reading_budget": [
    { "scope": "system | area:<area>", "read_fully": ["..."], "aggregate": ["..."],
      "sample": ["..."], "skip": ["..."], "note": "..." }
  ],
  "open_requests": [                             // artifacts asked for and not yet delivered
    { "artifact": "art-db-schema", "asked_on": "2026-10-13", "how_to_deliver": "start container `ebd`" }
  ],
  "log": [ { "date": "2026-10-13", "by": "evidence-preparation", "change": "initial plan" } ]
}
```

## Enrichment rules (so the plan can grow without breaking consumers)

1. **Append, do not rewrite.** New artifacts get new ids. An existing artifact may move
   forward in status (`ask` → `supplied`, `found` gets a new aggregate) but its id never
   changes meaning. Every change adds a `log` entry.
2. **Open sets.** `artifacts[].kind` and `gaps[].id` are open. A consumer that meets an
   unknown kind uses `closes_gaps` to decide whether it matters to it, and otherwise ignores
   it. A consumer never fails on an unknown kind or unknown field.
3. **Gaps drive ceilings.** When an artifact closes a gap, set the gap's status and flip the
   matching `ceilings[].active` to `false`. Consumers re-read the ceilings on every run;
   nothing is cached in a consumer's own output.
4. **Consumers may add evidence.** When a consumer obtains a new artifact (the user supplies a
   file mid-run, a database becomes reachable, an aggregate is computed), it appends the
   artifact with `added_by: <skill>` and writes its files under `evidence/<artifact-id>/`.
   It does not re-plan; re-planning is `evidence-preparation`'s job.
5. **Re-running preparation is incremental.** If `evidence-plan.json` exists,
   `evidence-preparation` loads it, registers the new consumer's profile, re-checks only open
   gaps and `open_requests`, and asks the user only about artifacts that would change the new
   consumer's decisions. It never discards what is there.
6. **Paths are absolute or workspace-relative.** `location` of a source artifact is
   absolute; aggregates live under `evidence/` and are workspace-relative.
7. **What consumers report.** Every consumer fills its "sources used / unavailable" section
   and its output's `sources` field from the plan: artifacts it actually used, and every
   open gap with its `invisible_while_open` consequence.

> Historical reconnaissance format retained for old runs. Current legacy-init uses goal/evidence calibration; see ../SKILL.md.

# Screening contract

`screening.json` is an agent-written, source-backed record of bounded nomination decisions.
The reporter validates links and structure; it cannot validate the truth of an observation.
All content should use the user's language. No domain classification belongs here.

```json
{
  "scope": "Illustration only: selected production units around allocation",
  "inspected": ["Replace with actual files/symbols examined"],
  "sampled": [],
  "deferred": [],
  "limits": ["Static graph; no runtime traces"],
  "candidates": [
    {
      "key": "EXACT unit string from overlay.discovery.units",
      "kind": "unit",
      "label": "Allocation — candidate, meaning not yet explored",
      "decision": "candidate",
      "reasons": [
        {
          "kind": "state",
          "observation": "Illustration: a transition checks current state before writing a new value.",
          "evidence": [
            {"root": "repo", "path": "src/example.java", "locator": "Allocation.change, lines 20–34"}
          ]
        }
      ],
      "limits": ["Only the transition and one consumer were sampled."]
    }
  ]
}
```

The example paths/observations are invented. Replace them before publication.

- `kind`: `unit | table | fragment | group`. A unit key must exactly match discovery output;
  other keys are explicit stable locators chosen by the analyst (e.g. `table:ORDERS`).
- `priority` (optional integer, 1 = read first): the analyst's reading order. Record the ordering rule in
  `limits` (e.g. behaviour reach → fix churn → deciding methods). The map orders by it, then by
  `behaviour_entries`, never by plain reach.
- `decision`: `candidate | navigation | deferred`. A facade may be navigation; an unexplored
  unknown stays deferred. These are nomination statuses, not judgments about design quality.
- Each reason needs an observation plus evidence: root `repo | workspace`, relative path and
  locator (line/symbol/document section/attributed answer). External sources are registered in
  the Evidence Plan and represented by a local source note; never fabricate local files.
- At least one nomination reason must be `state`, `decision`, `data-carrier`, `incident`,
  `change-goal` or `user`. Supporting reasons may be `reach`, `history`, `size`, `delegation`,
  `configuration`, etc. A category is not proof: the observation must explain the signal.
- Do not write `problem-grounded`, `model-induced`, homonym verdicts or discovered questions.
- Do not sum per-unit entry counts for a table/group. The first reporter leaves these metrics
  unknown; link a separate target entry-flows bundle as evidence for any measured group reach.
- Put a project-wide reading limit in `limits` and unvisited areas in `deferred`. Report
  missing languages, dynamic dispatch, unverified rules and incomplete tests/incident history.
- The map computes a stable candidate ID from kind + key. Preserve keys on reruns; an actual
  changed source identity needs an explicit previous-ID note, not guessed equivalence.

`system-map.json` is generated, with schema `legacy-init/1.0`. It contains the run/source
identity, graph bundle path, content hashes, coverage, candidates, metrics and previous-run
links. `metrics.entry_ids` and `method_ids` reference the paired graph + overlay, not another
run's graph. `analysis_links` on existing candidates are preserved; downstream writers append
`{path, label, source_revision, review_status}` after producing their own canonical results.
Those links are navigation, never automatic freshness or critic approval.

## Reach that means "read", not "behaviour"

Discovery rows carry `entries` (any method reached) and `state_change_entries`, `decision_entries`,
`behaviour_entries` (entries reaching a method whose body changes state or decides with an error
outcome). A unit with many entries but `behaviour_entries` ≤ 10% of them is the reference pattern:
periods, dictionaries, participants, loggers read by everything. Keep it visible (navigation or a
candidate with a low priority and the read/change split in its reasons); do not lead the map with it.
Ties at one value usually mean a shared core reached by every flow; break them with fix churn,
churn and the number of deciding methods, and say so.

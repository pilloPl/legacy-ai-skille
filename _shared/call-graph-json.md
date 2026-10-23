# Shared reference — the island call graph (`call-graph.json`: the solution side, the current structure)

> One format for **who calls the methods of an island** and how, whatever built it. Written by
> `island-call-graph` (from the CodeGraph index, or from an `entry-flows` overlay); read by
> `purpose-structure-map`, which lays the questions layer (`current-model-json.md`, the problem side) on top.
> Convention + example, not a JSON Schema. Keep this file and both writers in sync.

## Why one format
CodeGraph sees what the indexer resolved. `entry-flows` adds what rules found on top (dispatch to
implementations, `getBean()`/DI, SQL on tables) and knows the entries. Both describe the same thing —
methods and calls — so the viewer does not care which one built the file; `source` says which.

## Shape

```jsonc
{
  "$schema_version": "call-graph/1.0",
  "source": "codegraph",               // codegraph | entry-flows
  "generated_by": "island-call-graph/scripts/island-call-graph.mjs",
  "repo": "/abs/path/to/repo",
  "model": "/abs/path/to/<area>-current-model.json",   // where island_files came from
  "unit": "class",                     // class | file | package | module | routine (see "Units")
  "island_files": ["src/main/java/.../Group.java", "..."],   // islands[].artifacts[].file, code files only
  "units": [
    { "id": "src/main/java/.../Group.java", "name": "Group", "file": "src/main/java/.../Group.java", "in_island": true }
  ],
  "methods": [
    { "id": "method:19c7…", "unit": "src/main/java/.../Group.java", "name": "isManageable",
      "file": "src/main/java/.../Group.java", "start_line": 41, "end_line": 58 }
  ],
  "calls": [
    { "from_method": "method:aa…", "to_method": "method:19c7…", "line": 120, "kind": "calls" }
    // entry-flows only: "rule": "getbean-locator", "note": "…"  (edge added by a rule, not by the indexer)
  ],
  "entries": [                         // entry-flows only; empty for codegraph
    { "method": "method:ee…", "channel": "http", "name": "GroupWebService.addGroup", "at": "path/File.java:57", "routes": ["POST /groups"] }
  ],
  "stats": { "island_units": 29, "island_methods": 412, "calls": 327, "client_units": 61 }
}
```

### Field rules
- **`island_files`** — every `islands[].artifacts[].file` of the model that is a code file. One artifact = one file.
  Tables, XML, SQL resources are not units here; they show up only through `entry-flows` targets.
- **`methods`** — all methods of island units, plus every method that appears as `from_method` of a call.
  `start_line..end_line` is what `purpose-structure-map` uses to put a question's `file:line` on a method.
- **`calls`** — every production call whose target is an island method and whose source is in **another file**
  (calls inside one file are left out). Test code (`/src/test/`, `test/`, `tests/`) is left out.
  A call between two island units stays, marked by both units having `in_island: true`.
  The same caller method may appear several times with different `line`s — one record per call site.
- **`entries`** — only from `entry-flows`: entry methods whose flows reach the island.
- Aggregation unit → unit (one edge with method labels) is computed by the viewer, never stored.

## Units
`class` is the default and means **one file = one unit** (top-level class; nested classes fold into it).
For code without classes, pick the unit the language actually has and set `unit`:
`file` (scripts, C, COBOL copybooks), `package`/`module` (Go, Python packages), `routine` (PL/SQL procedures —
then a "method" is the routine itself). Mapping questions by `file:line` inside a method's line range works the same.

## Known blind spots (say them in the report, do not hide them)
- Calls resolved at runtime: `getBean()`, service locators, reflection, DI of an interface with many
  implementations — the indexer records the call on the interface or not at all. `entry-flows` patches some by rules.
- SQL, stored procedures, XML wiring, other repositories — not in a code index.
- Generated code and code outside the indexed repo.

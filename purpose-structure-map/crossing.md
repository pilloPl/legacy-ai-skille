# Crossing — what each caller asks (problem) and how the code answers it (mechanism)

`build.mjs` writes `crossing-input.json`: for the chosen questions (behind a pain by default, every placed question with
`--all`) one **row per caller method**. A row is reached by walking up from the methods the question sits on: island
methods are passed through (`path`), the first method outside the island is the caller (`kind: caller`); a caller the
explorer cited itself is `cited`; an island method nobody calls in the graph is `top-in-island` (look higher in the code:
`getBean()`, HTTP, jobs, or really unused). `sites` are the call lines.

You fill `crossing.json` next to it and rebuild; the view shows the table under the map.

## The rule above all
**The mechanism does not leak into CO.** CO is the question of the problem, narrowed to this caller's concrete case:
who asks, in what situation, what they want to know, what happens to them on „no”. Words of the domain only (gość, karta,
słupek, kemping, operator, personel, wydawca, rozliczenie, region…). No class, method, table, field, flag, list, cache,
bean, DTO, request, null, id. If the case can only be told through the mechanism (a nightly job, a generic filter),
say as little as needed, in domain words: „co noc, przed rozliczeniem”, not „GroupValidityControlJob”.
Everything about code goes to JAK. `build.mjs` flags CO with code-like words (camelCase, `x(`, `a_b`, `.java`, null).

## crossing.json
```jsonc
{
  "$schema_version": "crossing/1.0",
  "questions": [ { "id": "Q5", "summary": "1–2 sentences, problem language: which different cases this one question covers across callers" } ],
  "rows": [
    {
      "row": "<row key from crossing-input.json, unchanged>",
      "asks": "yes | partly | no",          // does this caller really ask the question? no = it only touches the same code
      "case": "CO — the question in this caller's case, problem language",
      "how": "JAK — what the code does on this path: which answer, which branch, what the caller does with it (names allowed)",
      "answer": {                            // JAK, structured: what comes back to THIS caller at the call site
        "shape": "yes-no | one | list | number | amount | date | text | none",   // none = void, the answer is an exception or a side effect
        "structure": "boolean",              // EXACT structure the caller gets, code notation, element fields included:
                                             // „List<AgreementDTO { issuer: GroupDTO{id, name}, campsites: List<GroupDTO>, inherited: boolean }>”,
                                             // „Optional<Tariff { code, priceNet: BigDecimal }>”, „void, throws AccessNotAllowedException”
        // — below: what it MEANS —
        "of": "for one/list: what one element is, problem language — „kempingi, za które odpowiada osoba”",
        "variants": [                        // every answer the caller tells apart, the negative ones too
          { "value": "true", "means": "problem language: what this answer says", "then": "what the caller does with it (names allowed)" },
          { "value": "false", "means": "…", "then": "…" }
        ]
      },
      "result": "what comes out on this path: refusal/403, empty screen, record without campsite, mail to X…",
      "evidence": ["path/File.java:12-30"],  // read by you; every claim in how/result has a line
      "up": ["Class.method (path/File.java:40) — why you went higher"]   // only when the caller alone did not show the case
    }
  ]
}
```

## How to fill a row
1. Read the caller method around `sites` and the island method it calls (Read with line ranges, or `codegraph explore`).
2. If the caller is a pass-through (helper, mapper, generic filter, `isInScope`) and the case is not visible, go **up**:
   its callers (`codegraph explore "<Class.method> callers"`, grep), until a screen, endpoint, job, listener or command
   shows the situation. Record the hops in `up`. Stop at the first level that tells the case; at most 3 hops.
3. Decide `asks`. A caller that only reads the same data for another purpose (shows the user's group on a profile,
   copies it to an audit row) is `no` or `partly`: say what it asks instead in CO. That is a finding, not noise.
4. Write CO first, then JAK. Same case at several callers → the same CO text, word for word (the view merges them).
5. **The answer's structure** (`answer`): read the signature of the island method the caller calls and what the caller does
   with the result. `shape` and `structure` say what comes back — `structure` exactly, as the caller receives it: the
   type with every field the caller can read (nested objects too, only fields that matter for the question when the
   object is big, then „…”), in code notation, before anything about meaning; for a list or an object `of` says what one element is in the
   problem's language (not „grupy”, but „kempingi i regiony, za które odpowiada osoba”). `variants` lists every answer
   the caller tells apart — `true`/`false`, empty / non-empty list, absent (`null`, `Optional.empty`), each exception
   it catches or lets through — with `means` (problem language, what that answer says about the case) and `then` (what
   the caller does). A variant the code allows but the caller never checks (e.g. `null` it would crash on) is a variant
   too: say so in `then`. The question's `typical_answers` in `crossing-input.json` are a starting point, not the answer.
6. Problem language check before you save: read CO aloud to someone from the business; any word they would not use
   goes out or to JAK.

Example (Q5 „za które kempingi odpowiada ta osoba i czy ten obiekt do nich należy”):
- CO: „Operator regionu kasuje słupek: czy ten słupek stoi na kempingu, za który odpowiada? Jeśli nie, nie może go skasować.”
- JAK: „`PedestalService.deletePedestal` przed usunięciem woła `GroupService.isManageable(grupa użytkownika, grupa słupka)`;
  false → `AccessNotAllowedException`.” Result: „odmowa, słupek zostaje”.
- answer: `{"shape": "yes-no", "structure": "boolean", "variants": [{"value": "true", "means": "słupek stoi na kempingu tej
  osoby albo w jej regionie", "then": "usuwa słupek"}, {"value": "false", "means": "słupek jest poza jej odpowiedzialnością",
  "then": "rzuca `AccessNotAllowedException`, 403"}]}`

## Running it
Split rows across subagents (one question each, a large question in chunks of ~15 rows); each returns its rows as
JSON, you merge into one `crossing.json`, write each question's `summary` from its rows, rebuild and fix every flagged
row (CO with mechanism, missing or incomplete `answer`).

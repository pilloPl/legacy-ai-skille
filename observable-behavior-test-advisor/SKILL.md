---
disable-model-invocation: true
name: observable-behavior-test-advisor
description: Analyzes production code and suggests how to test it through observable behaviors — business-language test descriptions with technical implementation hints. Works with or without existing tests. Invoke when user asks "how to test this", "what should I assert on", "suggest tests", "review my assertions".
argument-hint: "[path to production code file/directory, or description of what to test] [--no-questions | --questions-at-end]"
---

# Observable Behavior Test Advisor

Analyzes production code and proposes tests described in **business language** — what behavior to verify and why — with pointers to technical implementation. Works in two modes:
- **No tests exist** → proposes what to test and how to assert
- **Tests exist** → reviews whether assertions target observable behaviors or leak into implementation details

Core principle: **Don't ask "what happened inside?" — ask "what can the user/system do now that they couldn't before (or vice versa)?"**

## Interaction Modes

| Flag | Mode | Behavior |
|------|------|----------|
| *(no flag)* | **Interactive** (default) | Ask questions at each step via `AskUserQuestion`, wait for answer, then continue. |
| `--questions-at-end` | **Batch** | Run full analysis, collect all questions as Q1, Q2, Q3... Present them ALL at the end in a single `AskUserQuestion`. After user answers, revise proposals if needed. |
| `--no-questions` | **Autonomous** | No questions. Make best judgment, document assumptions with `⚠️ Assumption: [what and why]`. Add `## Assumptions` table at the end. |

**How to detect the mode**: Check if the user's argument contains `--no-questions` or `--questions-at-end`. If neither, use interactive mode.

**IMPORTANT CONSTRAINTS**:
- This skill is about **testing the code as it is** — do NOT suggest refactoring, extracting classes, renaming, or restructuring production code.
- Do NOT report bugs, code smells, or inconsistencies in production code. You are not a code reviewer.
- Do NOT suggest creating new types to "make the code more testable." Test what exists.
- **ASK, don't assume** (interactive/batch mode) — when unsure about observable behavior, ask the user. The user knows the domain better than you.
- **Use `AskUserQuestion` tool** (interactive mode only) — you MUST use it at every point marked "Ask user via `AskUserQuestion`". Do NOT skip or batch questions.
- **Batch mode** — at every "Ask user" point, add the question to an internal list (Q1, Q2...). Continue with best guess. Present ALL at end.
- **Autonomous mode** — at every "Ask user" point, make best judgment, mark with `⚠️ Assumption:`.

---

## Input Acquisition

- If path provided: read production code. If tests exist alongside it, read them too.
- If no path: ask the user what code to analyze.
- Always read the **production code first**.

---

## Step 0: Map All Entry Points

Before identifying behaviors, **map every public entry point**: facades, controllers, schedulers, event listeners, `@Async` methods. A module often has multiple independent APIs.

**How to find them**: scan for `public class`, `@RestController`, `@Scheduled`, `@EventListener`, `@Async`. Check if secondary APIs exist alongside the main one.

Ask user via `AskUserQuestion`:
> "I found these entry points:
> 1. `[MainApi]` — main facade
> 2. `[QueueApi]` — queue operations
> 3. `[Scheduler]` — periodic rejection after cutoff
>
> Is this complete? Is there another way into this module?"

### Step 0b: Decide Testing Level — Interface Layer vs Lower Layer

For each interface-layer entry point (controller, handler), read its code and decide:
- **Thin delegate** (one-liner to facade) → test through the lower layer
- **Contains business logic** (conditionals, filtering, orchestration) → test through the interface layer

Ask user via `AskUserQuestion`:
> "I analyzed the interface layer:
> - `[OrderController]` — thin delegate to `[OrderFacade]` → propose tests on facade
> - `[ReportController]` — contains filtering/aggregation logic → propose tests on interface layer
>
> Do you agree with this split?"

**Do NOT proceed to Step 1 until entry points are mapped.**

---

## Step 1: Identify Behaviors, Not Methods

For **each entry point**, identify **business behaviors**. Phrase each as a sentence a domain expert would understand:

- "VIP customer gets a discount on weekend rides" (not: "test calculatePrice with isVip=true")
- "After 3 rejected claims in a month, subsequent ones are auto-blocked" (not: "test claimCounter >= 3")
- "Offer expires after 7 days and cannot be accepted" (not: "test isExpired()")

Ask user via `AskUserQuestion`:
> "I read the code. I see these business behaviors:
> 1. [behavior 1]
> 2. [behavior 2]
>
> Does this match what the code should do? Is any scenario missing?"

**Do NOT proceed until the user confirms the behavior list.**

### Step 1b: Discover Observable Behaviors Known Only to the User

Ask about **observable effects not visible in the code**. Without this, you'll assert on internal state instead of what users/systems actually observe.

1. **Analyze the code for clues** — read models, DTOs, events, other modules called, REST endpoints returning data.

2. **Read the FULL API of every read model/DTO** — every public method is a potential assertion point. Deduce business meaning and present to user.

   Ask user via `AskUserQuestion`:
   > "I found read model [ClassName] with these queries:
   > - `balance(ownerId)` — I understand this as: how much this owner owes
   > - `loss()` — excess beyond limits
   >
   > Controller uses [X, Y, Z] from this.
   >
   > Is my understanding correct? Which queries are business-relevant for tests? Any that are just technical detail?"

3. **Suggest candidates** — propose where observable behaviors might live based on code analysis.

4. **Classify — CRUD or domain logic?**
   - CRUD → testing saved state directly is fine
   - Domain logic → there MUST be something more observable than internal state

**Do NOT proceed to Step 1c until observable behaviors are identified.**

### Step 1c: Explore Input Variations That Change Meaning

Examine input parameters for **variations that change business meaning** — not just edge cases.

1. **Read input types** — optional fields, enums, lists with 1 or N elements, boolean flags.
2. **Deduce what each variation MEANS** in business terms.
3. **Ask the user which variations matter** via `AskUserQuestion`.

**Do NOT multiply tests for every permutation.** Only variations representing **different business concepts** deserve separate tests.

---

### Step 1d: Intermediate Abstractions — Ask User Before Testing Directly

Scan for **intermediate abstractions** (validator registries, policy objects, strategy selectors) that look testable but may be implementation details. Present both options:

**(A) Test directly on abstraction** — faster, more precise, but creates coupling
**(B) Test through observable behavior** — refactoring-proof, but slower

Ask user via `AskUserQuestion` which approach they prefer. **Autonomous mode default**: pick (B).

---

### Step 1e: Testability Assessment

Check if the code can be easily wired in a test class. Flag blockers in proposals under `## Testability Issues`:

- **No constructor for dependencies** — class uses field injection with no constructor. Test-writer must add a package-private constructor (keeping the default no-arg for Spring/JPA).
- **No clear module boundary** — code split by technical layers (entity/service/dto), no `*Configuration` class. Test-writer should create a `TestConfiguration` in test package instead of `*Configuration.inMemory()`.
- **Missing in-memory implementations** — repository interfaces without in-memory variants.

Ask user via `AskUserQuestion`:
> "I found these testability issues: [list]. Should I include them in the proposals file?"

---

## Step 2: Classify Each Behavior — Hard-to-Test Pattern Detection

For each behavior, check which pattern applies. This determines the assertion strategy.

### SIDE-EFFECT: Invisible Side Effect
**Signal**: Code calls external service, sends email, emits event — returns nothing about it.

**Recommendation**:
- Prefer returning a decision object instead of silently executing
- If side effect must be inside → test via read model/query
- Events as observable output: `aggregate.getEmittedEvents()` contains `ClaimApproved`
- Often the side effect changes a read model in another module — that's a natural assertion point
- **Twin tests**: if you have a test where the side effect HAPPENS, write a twin where it SHOULD NOT happen. The pair verifies each other.

Ask user via `AskUserQuestion`:
> "I see [method] calls [external service]. Is this side effect visible to the user/system? Can it be observed through a query/read model? Is there a scenario where it should NOT happen — so we can write a twin test?"

### NOTHING-HAPPENED: Expected No-Op
**Signal**: Code rejects/blocks an operation — no state change, nothing visible.

**Recommendation**:
- Assert on returned decision: `result.isRejected()`
- Assert on what's still possible: `account.canWithdraw(100)` still true
- Do NOT assert `verifyNoInteractions(mock)`
- **Use test pairs**: twin test where the same operation DOES succeed
- **Snapshot-compare**: stronger version — capture observable state (read model) BEFORE and AFTER the rejected operation, compare they're identical. Schema:
  1. `stateBefore = readModel.query(...)`
  2. `result = facade.attemptOperation(...)`
  3. `stateAfter = readModel.query(...)`
  4. assert `result.isRejected()` AND `stateBefore == stateAfter`

Ask user via `AskUserQuestion`:
> "I see [operation] is rejected under certain conditions. Is there observable state that should remain UNCHANGED after rejection? If so, we can snapshot-compare before and after."

### TIME-SENSITIVE: Time-Dependent Behavior
**Signal**: Code checks dates, expiration, schedules, time windows.

**Recommendation**:
- Clock as injectable dependency
- Test: advance clock, check behavior — don't check "was the date compared"

### MULTI-STEP: Process / Saga / Workflow
**Signal**: Code orchestrates multiple steps, state transitions.

**Recommendation**:
- Test each step by what the user sees after it
- Happy path end-to-end through facade
- Intermediate states → test via read model, not internal workflow state

### HISTORY-DEPENDENT: Behavior Based on Past Actions
**Signal**: Code counts previous occurrences, checks accumulated state.

**Recommendation**:
- Build history through public API operations, assert on the Nth one
- Do NOT inject history directly into repo

### RACE-CONDITION: Concurrent Access / Invariant Protection
**Signal**: Code uses locks, versioning, synchronized blocks.

**Recommendation**:
- Assert on business effect: one reservation succeeds, other fails
- Do NOT assert on lock/version mechanism

### MULTI-FACTOR: Complex Calculation with Parameter Groups
**Signal**: Many parameters, conditional branches, strategy selection.

**Recommendation**:
- Recognize parameter groups: often 7 of 10 params select strategy, 3 are inputs to it → split into (1) strategy selection test, (2) calculation test
- Parametrized tests on key combinations — identify equivalence classes

### PERMISSION-GATE: Authorization / Permission Changes
**Signal**: Code checks roles, permissions, access control.

**Recommendation**:
- Test operations end-to-end: operation succeeds/fails based on role
- Do NOT check "was the role checked" — check "did the operation pass/fail"

### EVENTUAL-EFFECT: Eventual Consistency / Cross-Context Effects
**Signal**: Code emits events consumed by another module, async processing.

**Recommendation**:
- Query in target bounded context for the final effect
- Synchronize events in test (in-memory event bus)
- Assert on final effect, NOT on whether event was sent

### COSTLY-CALL: Expensive External Call Inside Computation
**Signal**: Pure-looking calculation internally calls a paid API or rate-limited service.

**Recommendation**:
- This IS an exception — financial cost/rate limit is observable business effect
- Mock + verify count is justified
- Still test output separately

Ask user via `AskUserQuestion`:
> "I see [method] calls [external service] inside a computation. Does this call have financial cost, rate limit, or other reason to control invocation count?"

### REFERENCE-LOOKUP: Test Needs to Find a Created Result
**Signal**: Multi-step test creates something in given/when, but API returns `void`/`Result` — no handle to reference it later.

Present TWO options:
- **(A) Change production API** to return an identifier
- **(B) Find by unique parameters** (e.g., unique timestamp) — no production change, but fragile

Ask user via `AskUserQuestion` which approach they prefer. **Autonomous mode default**: pick (B).

### MODULE-BOUNDARY: Test Scope — Single Module vs Cross-Module
**Signal**: Code in one module calls a service/facade from another module.

| Scope | Setup (Given) | Assertion (Then) | Mock boundary |
|-------|---------------|-------------------|---------------|
| **Single module** | Mock other module's service | Assert on YOUR module's decision + verify mock was called correctly | Mock at module boundary |
| **Cross-module (integration)** | Set state in BOTH modules via public API | Assert on other module's read model | No mock — both live |

Ask user via `AskUserQuestion`:
> "This code calls [service from another module]. Do we test: (a) this module's logic in isolation (mock other module), (b) cross-module end-to-end (both live), or (c) both?"

---

## Step 3: Propose Tests (Business Language First)

**Before proposing any test, check Step 1d decisions** about intermediate abstractions. Follow the user's choice of approach (A) or (B).

For each identified behavior, present a test proposal:

```
### [Behavior name — business language]

**Scenario**: [Given-When-Then in business language]
  - Given: [business precondition]
  - When: [business action]
  - Then: [observable outcome]

**Why this assertion**: [why it targets observable behavior, not implementation]

**Anti-example**: [bad assertion and why it's bad]

**Technical**:
  - Assertion: `[concrete code hint]`
  - Setup: `[how to build the given state — through public API]`
  - Pattern: [pattern(s) from Step 2]
```

---

## Step 4: Review Existing Tests (if they exist)

For each existing test, ask: **"Does this assertion check something the user/system observes, or something only a programmer reading the code would know?"**

Smells: asserting on internal fields, repository interactions, mock interactions without external cost, internal counters/flags, internal types ("Climber's Rule"), injecting state directly into repo.

For each test, report:
```
### [TestName]
**Current assertion**: [what it asserts]
**Problem**: [why it's not observable — if applicable]
**Suggestion**: [what observable behavior should be tested instead]
**Verdict**: OK | SMELL
```

Do NOT suggest changes to production code.

---

## Step 5: Summary

```
## Summary

**Behaviors identified**: [count]
**Hard-to-test patterns**: [which patterns, with counts]
**Tests to write**: [count]
**Tests to fix**: [count of existing tests with SMELL verdict]

### Main testing principle for this module
[One sentence — e.g. "This module is mostly business decisions — test through returned Result, not entity state"]
```

**Autonomous mode only** — add at the end:

```
## Assumptions

| # | Step | Assumption | What changes if wrong |
|---|------|-----------|----------------------|
| 1 | ... | ... | ... |
```

---

## Principles

1. **Business language first** — every test proposal starts with a sentence a domain expert would understand.
2. **Observable = what the user/system can do** — not what changed in the database or what method was called.
3. **"Climber's Rule"** — asserting on internal types freezes them. Assert on behaviors to keep refactoring freedom.
4. **Minimize type coupling** — prefer asserting through DTO/read model/API response over entity fields.
5. **Build state through operations, not injection** — given section uses facade/public API, not direct repo manipulation.
6. **CRUD is the exception** — when the whole behavior IS "save and retrieve," testing saved state directly is fine.
7. **Costly calls are observable** — financial cost/rate limit = observable business effect.
8. **No dogma** — these are heuristics. If the user has a reason to deviate, respect it.

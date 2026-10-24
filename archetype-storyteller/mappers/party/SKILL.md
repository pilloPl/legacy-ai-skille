---
disable-model-invocation: true
name: party-archetype-mapper
description: Transform domain requirements into a Party Archetype model. Identifies parties (persons, organizations, organization units) with a single PartyId, registered identifiers with validity, roles as data (global and in-relationship), party relationships with rules, capabilities with operating scopes, the policies guarding each of them, and the boundary between the atomic Party core and the data orbiting around it.
argument-hint: "[domain requirements or feature description]"
---

# Party Archetype Mapper

Transform any domain description that involves people and organizations into a Party model: one stable **identity** per person or organization, with roles, identifiers, relationships and capabilities attached to it as **data**, not as classes, flags or separate records.

**Output goal**: A complete, implementable model that tells the system *who is who, in what context, and what they can do* — without duplicated person/company data, without role flags, and with explicit rules for who may hold which identifier, role, relationship or capability.

## When to Use

**Use this skill when:**
- The same person or organization appears in more than one role, at once or over time (lead → customer, customer and supplier, employee and patient)
- A role can be played by a person or by an organization ("the customer is sometimes a company")
- Business logic depends on who is related to whom (employs, represents, acts on behalf of, is a branch of, is the account manager of)
- Data about the same person/company is copied between `User`, `Customer`, `Lead`, `Partner` models and drifts apart
- The system must answer "who can do X, where and when" about people, teams or companies (capabilities)

**Output is useful for:**
- Domain modeling sessions before implementation
- Replacing a `User`-with-flags or class-per-role model

## When NOT to Use — Fit Test

Before mapping, run the fit check. It lives in one place, shared with `archetype-storyteller` — read
`.claude/skills/archetype-storyteller/fit-checks/party.md` in full and apply it strictly: core question,
mandatory elements, signal table, false friends, excluding anti-signals and borderline cases.

- The default verdict is **does not fit**. A keyword is not evidence; every element needs a quote from the input.
- If the card leaves the case undecided, ask its deciding question (with an "It depends" option) before mapping.
- If the archetype does not fit, stop and tell the user why, using the template below.
- Do not keep a second copy of the fit test here: changes go to the card.

### If the domain does not fit

Output:

```
## Archetype Fit Assessment: ❌ Does Not Fit

The Party archetype requires parties whose identity outlives their roles: the same person or
organization in more than one role, persons and organizations interchangeable in a role, or
relationships between parties that business logic depends on. This domain has [plain user
accounts / a fixed permission list / a flat contact list / ...] because:

- [specific reason from the requirements]
- Every party has exactly one fixed role and no logic depends on relationships between parties.
```

Do NOT suggest alternative patterns or architectures. Stop here.

---

## Mapping Workflow

### Step 0: Get Requirements

- If provided as argument, use it directly
- If not provided, scan the recent conversation for domain context. If found, use that.
- Only if no argument AND no context in session, ask:
  > "Describe the domain — which people and organizations take part in it, in what roles, and how are they related to each other?"

---

### Step 1: Identify the Parties

Detect who behaves like an **identity** in the domain — and separate it from the roles it plays.

**Detection signals:**
- Actor nouns: user, customer, lead, partner, supplier, employee, patient, branch, department, team
- The same real-world person or company hiding behind two or more of those nouns
- Existing code where one class mixes person fields, company fields, role flags and status flags

**How to do it:** list every actor noun, then for each ask *"is this a thing that exists by itself, or something a person/organization is for a while?"* Collapse role nouns onto the identity behind them.

```
Actor noun      → Identity behind it            → What the noun really is
Customer        → Person or Company             → role
Lead            → Person or Company             → role (earlier stage of the same party)
Branch          → OrganizationUnit              → party type + relationship to HQ
```

**Key question to answer:** *What stays the same when the label changes?*

**Output:** The list of identities (candidate parties) and the list of role nouns removed from the "entity" column.

---

### Step 2: Ask Clarifying Questions

Before continuing, identify gaps between the requirements and Party archetype capabilities.
Ask about **two categories** of questions in a single `AskUserQuestion` call (up to 4 questions per call; split into multiple calls if more needed):

#### Category A — Standard Party decisions

Ask only about those **not clearly addressed** in the requirements. Frame questions as **design choices**, not assumed defaults — the answer may be "yes for some cases, no for others":

- **Party types**: Are parties only persons, or also organizations and internal units (departments, branches, teams)? Do legal forms of companies behave differently?
- **Party without an account**: Can a party exist that never logs in (imported customer, API-only counterparty, lead)?
- **Role dynamics**: How often do new roles appear or disappear — a fixed handful, or defined at runtime per tenant/client? (Drives the role representation strategy.)
- **Role eligibility**: Which roles are restricted to persons, to organizations, or by other conditions?
- **Relationships between parties**: Do relationships between parties other than "with our own company" matter to any logic?
- **Identifiers**: Which real-world identifiers must be stored, which party may hold which, and which of them expire?
- **Relationship violations**: If a relationship rule is briefly violated (an 11th subordinate where 10 are allowed), is it acceptable to detect and repair it afterwards, or must it be impossible?

#### Category B — Gap-triggered questions

Scan the requirements for **anything the Party archetype supports but the requirements do not mention**. For each gap found, ask whether that dimension is wanted. Do not limit yourself to this list — reason freely. Examples:

- **Validity of relationships**: Should relationships have a start and end (a 24-month contract that expires by itself) and keep history?
- **Cross-identifier rules**: Rules such as "a party holding identifier A cannot hold identifier B"?
- **Relationship limits**: Quantitative (max N subordinates), qualitative (only a company may employ), temporal (cannot end before 3 months)?
- **Role requirements**: Must a party prove something before it may hold a role (minimum age, a certificate, a skill level)?
- **Capabilities**: Does the business need to find parties by what they can do, where, when and how much — not only by role?
- **Network questions**: Are indirect questions needed ("employees of our supplier", "partner of our partner")?
- **Address rules**: Are there rules over the whole set of a party's addresses (exactly one active billing address, change at most once per quarter)?
- **Role/relationship changes as events**: Should other parts of the system react when a role is added or a relationship ends?
- **Permissions from relationships**: When someone becomes X for me (supplier, representative, partner), should they automatically gain or lose something towards me or my parties? Is a permission ever granted without any relationship, and why?

Collect answers before proceeding. If the user cannot answer, document the assumption made in **Implementation Notes**.

#### Handling "it depends / both / varies by situation" answers

Always include **"To zależy / It depends"** as an explicit option in every `AskUserQuestion` call — do not rely on the automatic "Other" fallback. Place it as the last option in each question. If the user selects it, treat it as a **variable policy**:

- Document the *policy parameter* the model accepts (e.g. the identifier assignment policy passed to `add`, the `PartyRoleDefiningPolicy` used by the role factory, the relationship defining policy)
- Note in **Implementation Notes** that the concrete policy is chosen outside the model — by a policy factory or the application service, per tenant, region or other parameter — and passed in at the time of the operation
- Do **not** attempt to model the selection logic inside Party

This is the correct outcome: *asking* the policy is a fixed part of the model; *which* policy answers is chosen outside it.

---

### Step 3: Map Domain Concepts to Party Archetype Elements

For each significant noun and verb in the requirements, produce an explicit mapping table:

```
| Domain Concept       | Party Archetype Element | Notes                          |
|----------------------|-------------------------|--------------------------------|
| [domain noun/verb]   | Party type (Person / Organization / OrganizationUnit / Company) / PartyId / RegisteredIdentifier / Role (global) / PartyRoleType / PartyRelationship / PartyRole (relationship side) / Validity / Capability / CapabilityType / OperatingScope / RoleRequirements / Policy / Orbiting data (Addresses, ...) | [why] |
```

After the table, list any domain concepts that **could not be mapped**:

```
## Unmapped Concepts

The following domain concepts have no clear Party archetype equivalent:
- [concept] — [reason it doesn't fit / decision needed]
```

This section must be present even if empty (`None identified`).

Typical unmapped concepts: the processes that *use* parties (sales pipeline stages, order handling, approvals as a workflow), contracts with their obligations and conditions of satisfaction, account credentials, balances, and whether a party is actually free at a given hour (a capability states what is possible, not what is booked).

---

### Step 4: Place the Domain on the Complexity Scale

Decide how much of the archetype the domain needs. Using the archetype does not require the full hierarchy — pick the elements that match the business; the rest waits until needed.

| Level | What the business looks like | What the model needs |
|-------|------------------------------|----------------------|
| **1 — User equals identity** | One hero: a person with an account who logs in and acts. No companies, leads or partners. | Nothing from this archetype. If the input stays here, the Fit Test should have failed. |
| **2 — The customer appears** | "Who has an account" and "who buys" are not always the same. Customer may be a person, a company, or a sole trader who is both. Customers without accounts exist. | Party types (Person / Organization), one `PartyId`, registered identifiers, global roles. |
| **3 — Large-business reality** | Leads, partners, distributors, suppliers, API counterparties, branches, subsidiaries, departments, capital groups. A party is customer, supplier and partner at once; one company buys, another pays, a third manages. | All of level 2 plus `OrganizationUnit`, relationships with rules, and usually a role catalogue; capabilities when "who can do what" matters. |

**Output:** the level with the evidence for it, and the list of archetype elements that are **in scope** and **out of scope** for this model.

---

### Step 5: Define Party Types and PartyId

Decide which concrete types of party exist.

**The hierarchy to choose from:**

```
Party (abstract: PartyId, registered identifiers, roles, version)
├── Person                 — a natural person; adds personal data
└── Organization           — a legal entity, institution or group
    ├── OrganizationUnit   — internal unit: department, branch, team
    └── Company            — formal, independently acting business entity
        ├── JointStock / LimitedLiability / LimitedPartnership   (only if legal form changes behaviour)
```

**Detection signals:**
- Fields that make no sense for some records (`companyName` on a person, `firstName` on a company) → two party types
- `null` used to tell kinds of records apart → a missing type decision
- Departments/branches that act (order, hold roles, have capabilities) → `OrganizationUnit`

**Decide for each type:**
- Its own data (each type holds only what is characteristic for it)
- What "registered" means for it — each subtype produces its own registration event (`toPartyRegisteredEvent`), because each carries different data
- Whether subtypes of `Company` are needed at all (only when legal form drives rules)

**PartyId:** one identifier space for all types — no `PersonId`, `CompanyId`, `OrganizationUnitId`. Roles, identifiers and relationships are type-agnostic and refer to `PartyId` only. It carries no business meaning: never use PESEL, tax number, e-mail or phone as the key (they cover only part of the parties, get reassigned, are shared, or stop being unique on a new market). Generate it in the application; a random UUID is usually enough.

```
Party type: [Person / Company / OrganizationUnit / ...]
  Represents: [domain concepts]
  Own data:   [fields specific to this type]
  Registered event carries: [data]
```

---

### Step 6: Define Registered Identifiers and Assignment Policies

`PartyId` identifies technically; the world asks for the tax number, the passport, the PESEL. Each such identifier is a `RegisteredIdentifier` with **type**, **value** and **validity**.

**Detection signals:**
- Official or business numbers: PESEL, NIP, REGON, KRS, passport, licence number, customer number
- "expires", "must be renewed", "blocked" → the identifier has a `Validity` period (a PESEL never expires; a passport does)

**For each identifier decide:**
- Type name, value format and its self-validation
- Whether it has a validity period, and what an expired one blocks
- **Who may hold it** — by party type (most common), by role ("customer number only for a party with role Customer"), or by other identifiers ("has A → cannot have B")

**Where the assignment rule lives** (choose and state it):

| Option | Use when | Cost |
|--------|----------|------|
| `canAssignTo` on the identifier itself | Small system, rules only about party type, rarely changing | Rule change = code change; cross-identifier rules create dependency cycles |
| One policy class | Rules need more context, still few | A growing switch/if cascade; every change touches it |
| Composite of small policies | Many rules, combined differently (per tenant, region) | More classes; needs a place that chooses the composition |

Whatever the option, the check is **enforced by Party**: `add(identifier, policy)` (and the constructor) always asks the policy. The policy implementation is supplied from outside — fixed configuration when rules are stable, a policy factory when the choice is dynamic.

```
Identifier: [TYPE]
  Value:      [format / validation]
  Validity:   [none — never expires | from–to]
  Assignable to: [party types / roles / exclusions]
  Policy placement: [canAssignTo | single policy | composite] — supplied by [fixed config | factory]
```

---

### Step 7: Define Roles

Roles are data owned by the party: a party has zero or more roles; roles do not define parties. A role is not a flag — it is a feature assigned at a given moment that can be added, removed and changed, and each change is reflected in an event.

**First split every role into one of two forms:**

| Form | Meaning | Example | Modelled in |
|------|---------|---------|-------------|
| **Global role** | Who the party is by itself, regardless of others | Customer, Strategic Partner, Supplier | Party's role set (this step) |
| **Role in a relationship** | How the party behaves towards another party | Employee ↔ Employer, Manager ↔ Subordinate | A side of a `PartyRelationship` (Step 9) |

**Test:** does the role need a second party to make sense, *and* does any logic care which second party? If the second party is always "our own company", a global role is enough.

**Choose the role representation strategy:**

| Strategy | Description | Choose when | Hurts when |
|----------|-------------|-------------|------------|
| 1. Role as text (value object) | Immutable record wrapping a role name | MVP, simple application, quick start | Organization grows: no name validation ("Customer" / "customer" / "klient"), hard reporting, no metadata |
| 2. Type hierarchy (role = class) | Abstract `PartyRole` with a subclass per role; each subclass knows which party it accepts | Errors have financial/legal consequences, roles are stable, 2–3 roles, formal control needed | Roles appear and disappear: every new role is a class, tests and a deploy |
| 3. `PartyRoleType` (type / instance) | A catalogue of role types (name, description, constraints, extensions) plus `PartyRole` instances saying who holds them | Large, dynamic environments, multi-tenant, roles defined without deploy; **required for role requirements (Step 10)** | Centralization: changing a type affects every instance |

**For each role decide** its eligibility rule (role "B2B Customer" not for a person; a department cannot be an Employee). The rule is a role policy, checked in the method that adds the role; role rules usually change more often than identifier rules, so a policy factory (or a role factory that already applies the policy) is a good default.

```
Role: [NAME]
  Form:        [global | in relationship: <relationship name>, side from/to]
  Eligible:    [party types / constraints]
  Held by:     [domain concepts]
Strategy: [1 text | 2 type hierarchy | 3 PartyRoleType] — because [reason]
```

---

### Step 8: Draw the Boundary — Party Core vs Orbiting Data

The Party core is an **atomic transactional context**: `PartyId` + registered identifiers + roles, guarded by a `version` field (optimistic locking). These must change together or not at all, because they decide how the system interprets identity and what a party may do.

Everything else connected to a party is a candidate to live **beside** it, as its own consistency unit keyed by `PartyId` and eventually consistent with the core.

**Detection signals for orbiting data:** addresses and contact points, preferences (favourite pickup point, preferred channel, contact hours), consents (marketing, privacy, cookies), security and authentication settings.

**For every piece of data someone wants to attach to Party, answer the five gate questions:**

1. Does this information actually co-create the party's identity?
2. Must its change be immediately consistent with the rest of the party's data?
3. How often does it change — more often, less often, independently?
4. What rules govern that change?
5. Can operations on it run in parallel with other operations on the party?

```
| Data            | Co-creates identity? | Immediate consistency with core? | Change rhythm | Own rules? | Decision            |
|-----------------|----------------------|----------------------------------|---------------|------------|---------------------|
| [e.g. consents] | No                   | No                               | independent   | yes        | outside Party core  |
```

**If addresses are in scope**, model them like this:
- `Address` (abstract): `AddressId`, owning `PartyId`, `useTypes`, `validity`, `AddressDetails`
- `AddressDetails` — per kind of address: geographic, e-mail, phone, web (an address is any point of contact, not only a street)
- `AddressUseType` — what it is used for (billing, shipping, mailing, contact, residential); one address may have several. Keeps *what it is* apart from *what it is for*, so no `BillingAddress`/`ShippingAddress` classes
- `AddressLifecycle` — defined / updated / removed events, specific per address kind
- `Addresses` — the consistency unit: **the whole set of a party's addresses**, identified by `PartyId`. Rules concern the set, so `AddressDefiningPolicy` lives here (no duplicates, no overlapping validity for the same use, use type restricted by party type, max N active)

**Sizing rule:** in a small system with trivial addresses, a collection inside Party is sufficient; a separate `Addresses` unit adds a second repository, a second transactional context and event synchronization.

---

### Step 9: Model Relationships

A relationship is a domain object with its own identity, not a link between two records.

**Detection signals:**
- Relational verbs: zatrudnia, zleca, współpracuje, reprezentuje, obsługuje, rozlicza, nadzoruje, działa w imieniu
- Structure words: oddział, filia, spółka córka, zespół, podwykonawca
- Questions like "who is whose account manager?", "who may sign for this company?", "employees of our supplier"
- A `parentId` forced to express non-hierarchical links (siblings cannot be linked without inventing a parent)

**Walk the four levels for each relationship:**

1. **Semantics** — give it a business name (employment, care, contract, membership, delegation), never "A–B".
2. **Direction** — model it as asymmetric, `from → to`; direction indicates initiator, superiority or dependency. A symmetric relationship is expressed as two asymmetric ones (the reverse is not possible).
3. **Roles of the sides** — each side is a `PartyRole` (party id + role). Eligibility of a side role is checked by `PartyRoleDefiningPolicy`, enforced in the `PartyRole` factory (only organizations employ; only persons are employees; units cannot be customers).
4. **Rules** — three classes:
   - *quantitative*: a manager has at most 10 subordinates; a customer has one key account manager
   - *qualitative*: only a company may employ; doctor–patient only if both sides hold proper roles
   - *temporal*: contract cannot end before 3 months; mentorship lasts at most a year

Temporal limits are carried by the relationship record itself (`validFrom`, `validTo`); quantitative and qualitative ones by the relationship defining policy.

**Decide the consistency boundary:**

| Option | Choose when | Cost |
|--------|-------------|------|
| Relationships held inside Party | Simple system, few relationships, rules concern one party's own relationships, fast delivery | Party becomes a god object; rules needing both sides lock two parties in one transaction; heavy parties with many links |
| `PartyRelationship` as an autonomous unit (default at scale) | Many relationships, rules needing both sides, availability matters more than strict consistency | Rules may be violated briefly; needs reconciliation / periodic validation to repair |

Also state the cross-effects explicitly: may a relationship be added to a blocked party? May a manager with active subordinates be blocked?

```
Relationship: [NAME]
  From: [role] ([party types])   →   To: [role] ([party types])
  Validity: [from / to rule; open-ended?]
  Rules: quantitative [..] | qualitative [..] | temporal [..]
  Violation handling: [prevented | detected and reconciled]
```

---

### Step 9.5: Permissions Derived from Relationships (if in scope)

A frequent extension of Party: a simple permission model that is **configured, not computed**.
A permission is always *a party's permission in the context of another party*, never global.

**Derivation rule (configuration, editable without deploy):**
"If A is in relationship R (side from/to) with B, then A gains or loses permission P towards B"
(or B towards A). The path may be longer: "every supplier of MY supplier gains P towards me".
Someone became someone for me, so they gained something, as configured. When the relationship
starts, the permission appears; when it ends, it disappears. Nothing is copied or recalculated by hand.

- **Validity** of a derived permission = validity of the relationship that gives it.
- **Direct grant (CRUD), optional and rare:** granting P to A towards B without any relationship,
  with its own validity. Use it only where the business cannot explain the permission in the
  language of relationships; every such grant is a signal of a possibly missing relationship type.
- **Permission card:** for one party, one view of everything it may do in the context of other
  parties, each line with its source (which relationship, which path or which direct grant) and validity.

**Not an authorization engine.** P is a fact about two parties, not a decision like Spring
Security's `hasPermission`. The decision ("may A do this to B now?") lives in the process that uses
Party and may also need other data (balance, contract, time of day). Define P so that it answers
"what is A allowed towards B", and keep the rest of the decision outside.

```
Permission: [NAME]   held by A towards B
  Derived from: relationship [R], side [from/to], path [direct | via R1 → R2]
  Validity: from relationship | own (direct grant)
  Direct grant allowed: yes (why relationships do not explain it) | no
Used by decision: [process] — also needs: [other data]
```

---

### Step 10: Model Capabilities and Role Requirements (if in scope)

A capability states what a party **is able to do** — a declaration of competence, resources, reach and availability. It is not an obligation and not a booking.

**Detection signals:**
- "find a doctor who can do ultrasound in Warsaw", "which team can take a project requiring an AWS certificate?"
- Skills, certificates, coverage area, working hours, daily throughput, equipment attached to a person, team or company
- A free-text `skillName` that means different things to different people

**Elements:**
- `CapabilityType` — the definition of meaning: which `OperatingScope`s are mandatory for this kind of capability. A capability missing a required scope cannot be created.
- `Capability` — a party's capability of a given type, with its scopes and a `Validity` period.
- `OperatingScope` (immutable value objects): `LocationScope` (where), `TemporalScope` (when), `QuantityScope` (how much), `SkillLevelScope` (how well), `ProtocolScope` (by which rules/procedures), `ProductScope` (what), `ResourceScope` (with what).

Any party type can hold capabilities — persons, teams, companies. Decide whether the set of capabilities is managed with the Party core or as its own consistency unit (same reasoning as Step 8; needed when rules span all capabilities of one party).

```
CapabilityType: [NAME]   required scopes: [Location, Temporal, ...]
Capability of [party]:
  [Scope]: [value]
  Validity: [from–to]
Questions it answers: [can X do Y at Z? — yes/no, by which scope]
```

**Role requirements** — when holding a role must be backed by capabilities:
- `RoleRequirements` attached to a `PartyRoleType` (shared by all roles of that type, not per instance)
- `CapabilityRequirement` — which capability type is required, with its criteria
- `ScopeRequirement` — one condition on a scope (minimum skill level, required certificate, required protocol)

```
PartyRoleType: [NAME]
  requires Capability [TYPE] with: [ScopeRequirement, ...]
```

This step forces role strategy 3 (`PartyRoleType`) in Step 7.

---

### Step 11: List the Questions the Model Must Answer

Verify the model against the business questions it exists for. Collect them from the requirements and sort them by the element that answers them:

| Kind of question | Example | Answered by |
|------------------|---------|-------------|
| By role | "find all doctors", "all contractors of type supplier", "does party X have role Y?" | Global roles |
| By place | "who is a doctor in Warsaw?", "which branch operates in this region?" | Roles + addresses |
| By network | "employees of our supplier", "partner of our partner", "who must approve above this limit?" | Relationships |
| By ability | "a plumber for deep wells within 30 km" | Capabilities + scopes |
| By permission | "what may this party do, towards whom, and why?" | Derived permissions + direct grants (permission card) |

Parties are vertices, relationships are edges, capabilities are vertex features — so network questions are path questions (indirect dependencies, cycles such as A subcontracts B who works for A, parties whose removal cuts off key relationships, disconnected groups). Note which required questions are of this kind; they influence how relationships are stored and queried.

Any required question that no element answers is either a missing element or an Unmapped Concept.

---

### Step 11.5: Decision Sanity Check

**Before producing the final output**, enumerate every concrete decision embedded in the draft model and verify each one has a source. This prevents silent assumptions from leaking into the output.

For each decision, classify its source:
- **(R)** — explicitly stated in the requirements
- **(A)** — asked and answered in Step 2
- **(X)** — neither: assumed silently

**Decision checklist** (go through every one that appears in your draft):

| Decision area | Example decisions to check |
|---------------|---------------------------|
| Party types | Which types exist? Are units parties? Do company legal forms differ? Can a party exist without an account? |
| Identity | Is every pair of role nouns really one identity? Who decides two records are the same party? |
| Identifiers | Which identifiers? Who may hold each? Which expire, and what does expiry block? Cross-identifier exclusions? |
| Identifier policy placement | On the identifier, single policy, or composite? Fixed or chosen per tenant/region? |
| Role form | Global or in-relationship for each role? Explicitly chosen or assumed? |
| Role strategy | Text, type hierarchy or `PartyRoleType`? Based on stated role dynamics? |
| Role eligibility | Which party types may hold each role? Any other constraints? |
| Core boundary | For each attached data set: inside the core or beside it? Were the five gate questions answered? |
| Relationship semantics | Name, direction and side roles of each relationship — stated or invented? |
| Relationship rules | Limits (how many), eligibility (who), time (how long) — values stated or guessed? |
| Relationship consistency | Inside Party or autonomous? Is a brief violation acceptable? How is it repaired? |
| Validity | Which identifiers, relationships, capabilities, addresses have a period? What happens when it ends? |
| Permissions | Derived from which relationships or paths? Validity from the relationship? Direct grants needed, and why? Which decision uses them and what else does it need? |
| Capabilities | Needed at all? Which scopes are mandatory per type? Scope values stated or guessed? |
| Role requirements | Does any role require capabilities? Thresholds stated? |
| Cross-effects | Blocked party and its relationships; removing a role that a relationship side depends on |

**For every (X) decision found:**

1. If the decision has low impact (purely technical, easily changed — e.g. UUID as `PartyId`): mark as explicit assumption in Implementation Notes.
2. If the decision affects business behavior (e.g. who may hold a role, a relationship limit, whether a violation may exist temporarily, merging two actor nouns into one identity): **stop and ask** using `AskUserQuestion` before delivering the model.

Do not deliver the model until all material (X) decisions are either confirmed or documented as explicit assumptions.

---

## Output Format

```markdown
# Party Archetype Model: [Domain Name]

## Complexity Level
[Level 2 / 3 with evidence]
**In scope:** [elements used]   **Out of scope:** [elements not needed yet]

## Concept Mapping

| Domain Concept | Party Archetype Element | Notes |
|----------------|-------------------------|-------|
| ...            | ...                     | ...   |

## Unmapped Concepts
[List or "None identified"]

## Party Types

| Party Type | Represents | Own Data | Notes |
|------------|------------|----------|-------|
| Person / Company / OrganizationUnit / ... | [domain concepts] | [fields] | [...] |

**PartyId:** [generation rule; single identifier space for all types]

## Registered Identifiers

| Identifier | Value / Validation | Validity | Assignable To |
|------------|--------------------|----------|---------------|
| [TYPE]     | [format]           | none / from–to | [party types / roles / exclusions] |

**Assignment policy:** [placement option] — supplied by [fixed configuration / policy factory]

## Roles

**Strategy:** [1 text / 2 type hierarchy / 3 PartyRoleType] — [reason]

| Role | Form | Eligible Party Types / Constraints | Held By (domain) |
|------|------|------------------------------------|------------------|
| [NAME] | global / in relationship [name] | [...] | [...] |

## Party Core vs Orbiting Data

**Atomic core:** PartyId, registered identifiers, roles, version (optimistic locking)

| Data | Decision | Reason (gate questions) |
|------|----------|-------------------------|
| [addresses / consents / ...] | inside core / separate unit keyed by PartyId | [...] |

[If addresses in scope: address kinds, use types, rules of AddressDefiningPolicy]

## Relationships

**Consistency boundary:** [inside Party / autonomous PartyRelationship] — [reason]

| Relationship | From (role, party types) | To (role, party types) | Validity | Rules (quantitative / qualitative / temporal) | Violation Handling |
|--------------|--------------------------|------------------------|----------|-----------------------------------------------|--------------------|
| [NAME] | [...] | [...] | [...] | [...] | prevented / reconciled |

## Permissions in the Context of Other Parties
[Or "Not in scope"]

| Permission | Holder → Context Party | Source (relationship / path / direct grant) | Validity | Used by Decision (+ other data) |
|---|---|---|---|---|
| [NAME] | [A → B] | [...] | from relationship / own | [...] |

## Capabilities
[Or "Not in scope"]

| CapabilityType | Required Scopes | Held By |
|----------------|-----------------|---------|
| [NAME] | [Location, Temporal, ...] | [party types] |

**Role requirements:**
| PartyRoleType | Required Capability | Scope Requirements |
|---------------|---------------------|--------------------|
| [NAME] | [TYPE] | [...] |

## Questions the Model Answers

| Question | Answered By |
|----------|-------------|
| [business question] | [roles / relationships / capabilities / ...] |

## Implementation Notes
[Key decisions, policies supplied from outside, assumptions made for unanswered clarifying questions, edge cases]
```

---

## Common Patterns & Pitfalls

### Pitfall: Roles in the Centre of the Model

Two models look different and fail the same way:

- **`User` with flags** — `isCustomer`, `isPartner`, `isVendor`, `isLead`, person and company fields side by side, `null` used to tell records apart. `null` here is not missing data; it is a missing decision.
- **A class or module per role** — `User`, `Customer`, `Partner`, `Lead`. Flags disappear, but every class still distinguishes person from company by nulls, and when a lead becomes a customer the data is *copied*. Three records for one company, then synchronization, then drift. Combining role types to remove the duplication multiplies classes combinatorially.

Both put the most unstable thing — the role — where the stable abstraction should be. Roles change over time, between contexts, even within one process. **In the model:** every role noun from the requirements goes to the Roles or Relationships section, never to Party Types.

### Pattern: The Heart Is Not a Pack Mule

Not every piece of information about a party belongs in Party, and not every operation related to a party must be atomic with it. If address, consent and passport number sit in one consistency unit, updating one blocks the others although the business sees them as unrelated. An association line on a diagram hides this; the transaction boundary reveals it.

Keep in the core only what co-creates identity and must change together (`PartyId`, registered identifiers, roles). Put the rest beside it, keyed by `PartyId`. The same applies to relationships and capabilities once they grow. The opposite mistake also exists: in a small system with trivial addresses or few relationships, separate units are overkill.

### Pattern: The Check Is Fixed, the Policy Is Supplied

"May this identifier / role / relationship / address be added?" is a permanent part of the operation, so the model itself must ask it — not an application service, where it would look use-case specific and be forgotten in the next service. *Which* rules answer the question varies (per tenant, region, time), so the policy is passed in from outside. Do not write `if`s in a service facade, and do not hardcode tenant logic inside Party.

### Pattern: Permission Follows the Relationship

Configure a permission as a consequence of a relationship instead of rewriting grants every time a relationship changes: the relationship starts, the permission is there; it ends, the permission is gone. A direct grant without a relationship is the exception for what relationships cannot explain. The authorization decision itself stays in the process that asks Party, because it usually needs more than the permission.

### Pattern: What Stays Outside the Party Model

- **Processes that use parties.** The party model answers "who?"; sales, ordering, approval flows remain their own processes and only ask it (is X in role Y? who is X's branch manager?).
- **Point-in-time copies.** A process that needs party data as of a moment keeps its own snapshot; later changes to the party do not alter it, and a guest who never registers creates no party at all.
- **Responsibilities and their conditions of satisfaction.** Obligations attached to roles belong to contracts and agreements; model what a party *can* do (capabilities), not what it *must* do.
- **Actual availability.** A capability says a technician can work Wednesdays 8–16; whether Wednesday 10:00 is free is not answered here.

One more boundary on the model itself: Party is stateful (history, versions, audit, retention, erasure). Shared as a code library it becomes many slightly different copies; it needs one owner, one store and a contract others call.

---

## Quality Checks

Before returning the model, verify:

- [ ] Fit Test passed with named evidence (multi-role, person/organization interchangeability, or logic-bearing relationships)
- [ ] No role noun appears as a party type; no role is a flag or a subclass of Party
- [ ] Exactly one `PartyId` space; no semantic identifier used as the key
- [ ] Each party type holds only its own data; no field is "null for the other kind"
- [ ] Every registered identifier has type, value rule, validity decision and an assignment rule
- [ ] Every role is classified as global or in-relationship, with an eligibility rule
- [ ] Role representation strategy is chosen and justified by role dynamics (and is `PartyRoleType` if role requirements exist)
- [ ] Every attached data set went through the five gate questions; the atomic core contains only identity, identifiers, roles and version
- [ ] Every relationship has a name, direction, side roles, validity and its quantitative / qualitative / temporal rules (or "none")
- [ ] Relationship consistency boundary and violation handling are stated
- [ ] Every capability type lists its mandatory scopes; every capability has validity
- [ ] Every policy says where it is enforced and where its implementation comes from
- [ ] Complexity level and in/out-of-scope elements are stated
- [ ] Concept mapping table is present and complete
- [ ] Unmapped concepts section is present (even if empty)
- [ ] All clarifying question answers (or assumptions) are reflected in the model

---

## Example

**Input:** "A bank serves individual and corporate customers. A bank employee can also be a customer. Each customer has exactly one account manager, who must be a bank employee. Branches belong to the head office. Persons are identified by PESEL or a passport (which expires), companies by NIP."

**Output:**

```markdown
# Party Archetype Model: Retail & Corporate Banking Parties

## Complexity Level
Level 3 — the same person is employee and customer at once; customers are persons or companies;
the bank has an internal structure (head office, branches); relationships between parties
(account manager ↔ customer) drive logic.
**In scope:** party types, PartyId, registered identifiers, global roles, relationships.
**Out of scope:** capabilities and role requirements (nothing asks "who can do what"); addresses (not mentioned).

## Concept Mapping

| Domain Concept | Party Archetype Element | Notes |
|----------------|-------------------------|-------|
| Individual customer | Person + global role CUSTOMER | Role, not a type |
| Corporate customer | Company + global role CUSTOMER | Same role, different party type |
| Bank (head office) | Company | A party like any other |
| Branch | OrganizationUnit + relationship BRANCH_OF | Structure expressed as a relationship |
| Bank employee | Person + relationship EMPLOYMENT | Role in a relationship (Employee ↔ Employer) |
| Account manager | Relationship ACCOUNT_MANAGER_OF | Role in a relationship, between two non-bank-HQ parties |
| Holding an account at the bank | Relationship ACCOUNT_HOLDER | Customer → Bank, open-ended validity |
| PESEL, passport, NIP | RegisteredIdentifier | Passport has Validity |
| "Exactly one account manager" | Quantitative rule of the relationship defining policy | |
| "Must be a bank employee" | Qualitative rule of the relationship defining policy | Needs the other side's relationships |

## Unmapped Concepts
- The bank account itself (number, balance, products) — not a party, a role or a relationship; only the fact of being an account holder is modelled here.
- Employee login and credentials — authentication settings orbit the party; outside the Party core.

## Party Types

| Party Type | Represents | Own Data | Notes |
|------------|------------|----------|-------|
| Person | Individual customers, employees | First name, last name | One person record even when employee and customer |
| Company | Corporate customers, the bank | Company name | Legal-form subtypes not needed |
| OrganizationUnit | Branches | Unit name | |

**PartyId:** random UUID generated in the application; one identifier space for all three types.

## Registered Identifiers

| Identifier | Value / Validation | Validity | Assignable To |
|------------|--------------------|----------|---------------|
| PESEL | 11 digits with checksum | none (never expires) | Person only |
| PASSPORT | Document number | from–to; expired passport is not a valid identification | Person only |
| NIP | 10 digits with checksum | none | Company; Person (sole trader) |

**Assignment policy:** composite of small policies (personal identifiers only for persons;
organizational identifiers only for organizations), enforced in `Party.add(identifier, policy)`;
supplied by fixed configuration.

## Roles

**Strategy:** 2 — type hierarchy. Roles are few and stable and errors have regulatory consequences.

| Role | Form | Eligible Party Types / Constraints | Held By (domain) |
|------|------|------------------------------------|------------------|
| CUSTOMER | global, also `from` side of ACCOUNT_HOLDER and `to` side of ACCOUNT_MANAGER_OF | Person, Company; not OrganizationUnit | Individual and corporate customers |
| BANK | in relationship ACCOUNT_HOLDER (to) | Company | The bank |
| EMPLOYEE / EMPLOYER | in relationship EMPLOYMENT | Person / Company | Bank staff / the bank |
| ACCOUNT_MANAGER | in relationship ACCOUNT_MANAGER_OF (from) | Person | Employee assigned to a customer |
| BRANCH / HEAD_OFFICE | in relationship BRANCH_OF | OrganizationUnit / Company | Branches / the bank |

## Party Core vs Orbiting Data

**Atomic core:** PartyId, registered identifiers, roles, version (optimistic locking)

| Data | Decision | Reason (gate questions) |
|------|----------|-------------------------|
| Employee credentials | separate unit keyed by PartyId | Does not co-create identity; changes independently; own rules |

## Relationships

**Consistency boundary:** autonomous PartyRelationship — rules need both sides (the manager must be an employee),
and locking two parties per operation would reduce availability.

| Relationship | From (role, party types) | To (role, party types) | Validity | Rules (quantitative / qualitative / temporal) | Violation Handling |
|--------------|--------------------------|------------------------|----------|-----------------------------------------------|--------------------|
| ACCOUNT_HOLDER | CUSTOMER (Person, Company) | BANK (Company) | from opening date, open-ended | none / to side must be the bank / none | prevented |
| EMPLOYMENT | EMPLOYER (Company) | EMPLOYEE (Person) | from hire date to termination | none / only a company employs, only a person is employed / none | prevented |
| ACCOUNT_MANAGER_OF | ACCOUNT_MANAGER (Person) | CUSTOMER (Person, Company) | from assignment, open-ended | exactly one active per customer / from side must have an active EMPLOYMENT with the bank / none | reconciled (periodic validation) |
| BRANCH_OF | BRANCH (OrganizationUnit) | HEAD_OFFICE (Company) | open-ended | one head office per branch / none / none | prevented |

## Capabilities
Not in scope.

## Questions the Model Answers

| Question | Answered By |
|----------|-------------|
| Is this person our customer? | Global role CUSTOMER |
| Who is the account manager of customer X? | ACCOUNT_MANAGER_OF |
| Which customers lose their manager if employee Y leaves? | ACCOUNT_MANAGER_OF + EMPLOYMENT (network question) |
| Which branches belong to the bank? | BRANCH_OF |
| Is this customer's identification still valid? | RegisteredIdentifier validity |

## Implementation Notes
- An employee who is also a customer is one Person with one PartyId: EMPLOYMENT and ACCOUNT_HOLDER are two relationships of the same party, no data is copied.
- Each party type emits its own registration event; adding/removing a role and starting/ending a relationship emit events.
- Assumption: a customer may briefly have zero or two account managers during reassignment; periodic validation repairs it (not stated in requirements — confirm).
- Assumption: sole traders are modelled as Person with NIP (not stated in requirements — confirm).
- Assumption: whether an employee may be the account manager of their own customer record is not addressed; no rule added.
```

## Reference implementation (always the last field of your output)

Close your output with a field `Implementacja referencyjna`, so that whoever implements this model knows where the
code comes from. Look for `archetype-implementer/references/party-impl.md` among the installed skills (in the skills folder that holds this skill, e.g. `.claude/skills/` of the project). If it is there, give its path and the module of the public reference repository: https://github.com/Archetypy-Oprogramowania/archetypes/tree/main/party.
If you do not find it, write exactly: „Brak referencyjnej implementacji w paczce skilli — implementacja powstanie od
zera według tej specyfikacji.” Do not read the implementation: the mapping stays independent of code.

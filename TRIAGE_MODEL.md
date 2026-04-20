# Cerebro triage data model

What Cerebro needs to extract from an inbound referral — and the rules that
turn that extraction into a placement decision. This is the domain model the
current prototype is a reduction of; the live extractor and rules engine
should grow toward this shape.

Scope: commercial / specialty broking at a Howden-like broker. Placement
platforms assumed: **Trade+** (unified open market + facility + SME),
**Whitespace** (Lloyd's e-placing), **PPL** (Lloyd's Placing Platform),
**GXB** (binder facilities), **Acturis** (non-Lloyd's / company market),
**IBA** (accounting), plus a **manual review** fallback. HAT (Howden's own
follow capacity) is a per-risk **tag** rather than a separate destination —
it can apply to any routed risk.

---

## 1 · What we capture

Five clusters of fields. "Core" is the minimum to route confidently; "extended"
unlocks sharper rules; "metadata" supports audit, SLA, and learning.

### 1.1 Assured (the insured party)

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| `assured.legal_name` | string | email/slip/SOV | ✅ | Exact legal entity. Disambiguates renewals. |
| `assured.trading_names` | string[] | slip | | DBAs, brand names. |
| `assured.domicile_country` | ISO-3166 | slip | ✅ | Drives licensing rules (US → surplus lines, etc.). |
| `assured.industry` | SIC/NAICS + free-text | slip | ✅ | Powers class inference and SME/non-SME split. |
| `assured.revenue_usd` | number | slip/SOV | ✅ | Primary size proxy when premium not stated. |
| `assured.employee_count` | number | slip | | Secondary size signal (esp. cyber, EL/WC). |
| `assured.group_structure` | string / tree | slip | | Parent co? Subs? Affects sanctions & capacity. |
| `assured.sanctions_status` | `clear` / `flag` / `block` | screening API | ✅ | Hard gate — blocks routing if flagged. |

### 1.2 Risk / exposure

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| `risk.class` | enum | email + slip | ✅ | Property, Marine, Cyber, D&O, Casualty, Aviation, PI, Terrorism, Political Risk, K&R, Energy, Trade Credit |
| `risk.sub_class` | enum | slip | | e.g. Property → {All Risks, ISR, Terrorism}; Casualty → {GL, EL, Auto, Products}. Drives sub-routing. |
| `risk.coverage_sought` | string[] | slip | | Perils / extensions requested. |
| `risk.limit_requested_usd` | number | slip | ✅ | Single & aggregate if applicable. |
| `risk.deductible_usd` | number | slip | | SIRs often signal sophisticated buyer → non-algorithmic. |
| `risk.tiv_usd` | number | SOV | ⚠ Property | Total Insurable Value. Primary Property sizing metric. |
| `risk.locations` | object[] | SOV | ⚠ Property | `{country, city, occupancy, construction, tiv}` per location. |
| `risk.location_count` | number | SOV | | Multi-site complexity signal. |
| `risk.geography` | ISO-3166[] | slip | ✅ | Any US exposure triggers E&S / surplus lines path. |
| `risk.hazard_grade` | 1–5 / A–E | rating table | | Manufacturing > office > tech. Used for HAT eligibility. |

### 1.3 Placement

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| `placement.type` | enum | email | ✅ | `new_business` / `renewal` / `mid_term` / `endorsement` / `cancellation` |
| `placement.inception_date` | date | slip | ✅ | Drives urgency rules. |
| `placement.expiry_date` | date | slip | | |
| `placement.expiring_carrier` | string | slip | ⚠ renewal | Named leader? → Smart Follow eligible. |
| `placement.expiring_premium_usd` | number | slip | ⚠ renewal | Baseline for pricing. |
| `placement.target_premium_usd` | number | email/slip | ✅ | Primary routing signal after class. |
| `placement.layer_structure` | `primary` / `excess` / `quota_share` | slip | | Excess layers → open market. |
| `placement.preferred_market` | `lloyds` / `company` / `mga` / `none` | email/broker | | Broker hint; not binding. |
| `placement.binder_match` | binder-id or null | facility DB | ✅ | Hard signal: existing facility fit → GXB. |
| `placement.co_broker` | string | email | | Shared placement flag. |

### 1.4 Loss history

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| `losses.years_provided` | number | loss run | | <3 years → low confidence. |
| `losses.total_incurred_usd` | number | loss run | | |
| `losses.total_paid_usd` | number | loss run | | |
| `losses.outstanding_usd` | number | loss run | | Open reserves — signal of instability. |
| `losses.loss_ratio_5yr` | % | derived | ⚠ renewal | >80% blocks HAT algorithmic; >150% → review. |
| `losses.major_losses` | object[] | loss run | | `{year, amount, cause, status}` — narrative for large losses. |
| `losses.claims_free_years` | number | derived | | Pristine record → HAT eligible even at mid size. |

### 1.5 Metadata & provenance

| Field | Type | Source | Required | Notes |
|---|---|---|---|---|
| `meta.submission_id` | uuid | Cerebro | ✅ | |
| `meta.received_at` | ISO-8601 | email headers | ✅ | |
| `meta.producing_broker` | `{name, office, email}` | email | ✅ | Routing courtesy copy + commission split. |
| `meta.ingest_channel` | `email` / `api` / `paste` / `drop` | Cerebro | ✅ | |
| `meta.documents` | object[] | email | | `{filename, mime, bytes, sha256, role}` — role = slip/sov/loss_run/quote_request/other. |
| `meta.extraction_confidence` | 0–100 | Claude | ✅ | Single score. Below threshold → review. |
| `meta.extraction_trace` | object[] | Claude | | Per-field confidence + source span — enables "why did it think this?" audit. |
| `meta.sla_deadline` | ISO-8601 | rules | | Computed from inception date + class. |

### 1.6 What we do *not* extract (yet)

Deferred deliberately — not needed for first-pass routing:

- Contract wording / clauses (lives in placement platform, not triage)
- Reinsurance structure (downstream concern)
- Detailed premium allocations across layers
- Broker commission / brokerage split (handled by IBA accounting)
- Claims-handling preferences (handled post-bind)

---

## 2 · Forwarding rules

A rule is a pure function: `(extraction) → { destination, rule_id, rationale }`.
Rules fire in priority order; the first match wins. Every decision records
which rules were evaluated and why they did or didn't fire — that trace is
what makes Cerebro explainable and what the broker sees in the drawer.

### 2.1 Gate rules (priority 0 — block before anything else)

| Rule | Condition | Action |
|---|---|---|
| **G-01 Sanctions block** | `assured.sanctions_status == 'block'` | Reject. Notify compliance. No routing. |
| **G-02 Sanctions flag** | `assured.sanctions_status == 'flag'` | Route to manual review + compliance tag. |
| **G-03 Missing critical field** | any of `{class, target_premium, inception_date}` absent | Manual review with "incomplete submission" reason. |
| **G-04 Low extraction confidence** | `meta.extraction_confidence < 70` | Manual review. Do not auto-forward. |

### 2.2 Facility / binder rules (priority 1 — honour existing arrangements)

| Rule | Condition | Destination | Rationale |
|---|---|---|---|
| **F-01 Exact binder match** | `placement.binder_match != null` | **GXB** (that binder) | Existing delegated-authority facility exists — place here unless broker overrides. |
| **F-02 Scheme match** | industry + geography matches a known scheme facility | **GXB** (scheme) | e.g. solicitors PI scheme, taxi fleet scheme. |
| **F-03 Treaty/facility expiring** | binder expires within 30d of inception | Manual review | Don't route to a facility that won't be live. |

### 2.3 Compliance & licensing rules (priority 2)

| Rule | Condition | Destination | Rationale |
|---|---|---|---|
| **C-01 US surplus lines** | `'US' ∈ geography` AND class ∉ admitted-classes | **xTrade Open Market** (E&S) | US non-admitted requires surplus-lines-licensed carrier. |
| **C-02 Non-Lloyd's regional** | broker flagged non-Lloyd's preferred AND class ∈ {Property, Casualty} | **Acturis** | Company market placement. |
| **C-03 Sanctioned geography** | any location ∈ {RU, IR, KP, ...} | Manual review + compliance | Geography-level gate. |

### 2.4 Class-based routing (priority 3)

Hard class-to-platform mappings — Lloyd's specialty lines where there's a
canonical market.

| Rule | Class | Destination | Rationale |
|---|---|---|---|
| **R-04 Marine** | Marine (Hull, Cargo, P&I) | **Whitespace** | Lloyd's is the deepest market for Marine. |
| **R-10 Aviation** | Aviation (Hull, War, Liability) | **PPL** | Lloyd's dominance in Aviation. |
| **R-11 Political Risk** | Political Risk / Trade Credit | **Whitespace** | Specialty Lloyd's market. |
| **R-12 K&R / Terrorism** | K&R, Terrorism | **PPL** | Specialty Lloyd's syndicates. |
| **R-13 Energy upstream** | Energy (upstream) with TIV > $50m | **Trade+ Open Market** | Complex multi-market placement. |

### 2.5 Size-based routing (priority 4 — for remaining classes)

Applied to `{Property, Casualty, Cyber, D&O, PI}` after class rules haven't
fired. `size_usd = target_premium_usd` or falls back to revenue/TIV bucket.

| Rule | Class group | Size band | Destination | Rationale |
|---|---|---|---|---|
| **R-01** | Property, Casualty, Cyber | < $250k premium | **Trade+ Facility** | SME auto-placement via Howden's facility. Also picks up the HAT tag when eligible. |
| **R-02** | Property, Casualty, Terrorism | $250k–$1.5M | **Trade+ Facility** | Mid-market, established leader likely exists. |
| **R-03** | Property, Casualty, Terrorism | ≥ $1.5M | **Trade+ Open Market** | Underwriter-led placement. |
| **R-05** | Cyber, D&O, PI | $250k–$1.5M | **Trade+ Facility** | Specialty casualty follow market. |
| **R-06** | Cyber, D&O, PI | ≥ $1.5M | **Trade+ Open Market** | Complex specialty. |

### 2.6 Loss-history overlays (priority 5 — can *downgrade* routing)

| Rule | Condition | Action |
|---|---|---|
| **L-01 Ugly losses** | `losses.loss_ratio_5yr > 150%` | Override to manual review regardless of class/size. |
| **L-02 Bad losses** | `losses.loss_ratio_5yr > 80%` | Downgrade to Acturis non-Lloyd's (removes facility eligibility). |
| **L-03 Thin history** | `losses.years_provided < 3` AND placement.type == new_business | Flag but don't block — extractor note for underwriter. |
| **L-04 Major loss open** | any `losses.major_losses[].status == 'open'` AND amount > $1m | Manual review. |

### 2.7 Urgency & SLA rules (priority 6 — affects prioritisation, not destination)

| Rule | Condition | Action |
|---|---|---|
| **U-01 Imminent inception** | `inception_date < now + 48h` | Tag as **URGENT**. Push to top of queue. |
| **U-02 Renewal slip incoming** | renewal AND expiring_carrier named | Pre-populate slip from renewal template. |
| **U-03 Weekend / out-of-hours** | received outside broker office hours | SLA clock starts at next business open. |

### 2.8 Fallback

| Rule | Condition | Destination |
|---|---|---|
| **R-09 Catch-all review** | no rule above fired | **Manual review** with "unrouted" reason. |

---

## 3 · Destinations quick reference

| Destination | When | Accepts |
|---|---|---|
| **Trade+** | Unified open market + facility + SME | Most Property/Casualty/Cyber/D&O/PI placements |
| **Whitespace** | Lloyd's e-placing for Marine / Political Risk | Lloyd's-native specialty classes |
| **PPL** | Lloyd's Placing Platform — Aviation, K&R, Terrorism | Lloyd's-native specialty classes |
| **GXB** | Existing binder / scheme | Class+geography matches live facility |
| **Acturis** | Non-Lloyd's / company market | Regional Property/Casualty, loss-challenged SME |
| **Manual review** | Ambiguous, gated, or low-confidence | Anything the rules can't decide |
| **IBA** | Accounting only (post-bind) | Not a triage destination — downstream |

**HAT** is a per-risk *tag* (Howden's own follow capacity), not a separate
destination. Any routed risk may carry the HAT tag when it qualifies for
Howden's own binder follow.

---

## 4 · Edge cases & deferred problems

Things that will come up in real use but aren't in the current rule set:

- **Multi-class submissions** (e.g. "Property + Casualty + Cyber combined programme"). Split into child submissions or route the whole package to Open Market? For now: route by dominant premium share; flag as multi-class.
- **Layered placements**: primary on one platform, excess on another. Needs a `placement.layer_id` grouping across submissions.
- **Renewals with leadership change**: expiring leader declines to renew. Cerebro can't know this until quotes come back. Treat as new business for routing.
- **Co-insurance with another broker**: ownership / commission split not a routing concern, but audit trail must record.
- **MGA submissions**: some classes have delegated MGAs that sit between broker and carrier. Currently subsumed into GXB; may deserve its own destination.
- **Lloyd's coverholder vs open-market**: same class can go either way. Coverholder match is F-02 (scheme), else falls through to class/size rules.
- **Confidence per-field vs overall**: today we have a single score. A real system wants `{class_conf, premium_conf, assured_conf, ...}` — any sub-70 triggers review for *that dimension* only.
- **Learning from overrides**: broker reroutes should feed back into rule weights or surface as "this rule fired wrongly N times last month".

---

## 5 · How this maps to the current prototype

The prototype extracts **7 fields** (`assured, cls, premium_k, confidence,
non_lloyds, binder, reasoning`) and evaluates **9 rules** (`R-01 … R-09`).

Gap vs this model:

- **Missing entire clusters**: loss history, geography, layer structure, document provenance.
- **No gate rules**: sanctions/compliance not modelled.
- **`binder` is boolean**: real world needs a binder-id so GXB knows *which* facility.
- **Single confidence score**: no per-field granularity.
- **No urgency/SLA logic**: inception dates not parsed.

Suggested next increments (in order of payoff):

1. **Geography + US surplus-lines gate** (C-01). One new field, one rule,
   unlocks correct US handling.
2. **Loss-ratio overlay** (L-01, L-02). Adds the single biggest real-world
   downgrade trigger.
3. **Placement type** (new vs renewal vs endorsement). Changes the UI story
   and enables urgency rules.
4. **Per-field confidence + source span**. Lets the drawer highlight which
   bit of the email drove each field — huge trust win.
5. **Binder-id instead of boolean**. Needed the moment GXB has >1 live
   facility.

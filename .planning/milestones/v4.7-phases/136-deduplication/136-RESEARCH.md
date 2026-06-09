# Phase 136: Deduplication — Research

**Researched:** 2026-06-08
**Domain:** DuckDB / dbt internal-collapse + cross-source candidate generation + human-in-the-loop sign-off gate
**Confidence:** HIGH — all findings grounded in direct codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Two-file split mirroring Phase 135's audit-vs-seed pattern. Build always rewrites `dedup_candidate_pairs.csv` (regenerated audit). A separate committed curated seed `data/dbt/seeds/dedup_decisions.csv` holds `(pair_key → dedup_status)`. Build LEFT JOINs decisions onto regenerated candidates by `pair_key`. Nightly rebuild never clobbers a human decision.
- **D-02:** `pair_key` = composite `(checklist ObjectID, Ecdysis ecdysis_id)` — both upstream-stable source PKs. Stability depends on D-03: candidate generation runs on the post-collapse checklist records (lowest ObjectID wins). `dedup_status` vocabulary: at minimum `confirmed` / `rejected`; unreviewed = implicit candidate. Only `confirmed` suppresses a point.
- **D-03:** Lowest `ObjectID` wins within each exact-duplicate group (identical species, lat, lon, date, collector). Keeps lowest-ObjectID row; non-key fields carry forward as-is.
- **D-04:** Survivor carries a `collapsed_count` column = number of rows in its group (1 if unique).
- **D-05:** Collector = token-set normalization. Normalize (lowercase, trim, collapse whitespace, strip punctuation), then compare as sorted token set with initials awareness (`J Smith` ≈ `John Smith` via initial match). No fuzzy scoring. Net-new code — no existing collector normalizer in the codebase.
- **D-06:** Date = match at the coarser shared precision. Exclude if either side is year-only or NULL. Both have day → require same Y-M-D; either lacks day → require same Y-M.
- **D-07:** Distance threshold = 1.0 km as one named tunable constant.
- **D-08:** One candidate row per `(checklist record, Ecdysis specimen)` pair — full cartesian within match window. Checklist point suppressed if ANY of its pairs has `dedup_status = confirmed`. Curator confirms/rejects each pair independently.

### Claude's Discretion

- Suppression output contract (derived default): expose `dedup_status` on the (collapsed) checklist record set via the candidate→decisions LEFT JOIN, so Phase 137 can exclude `confirmed`-suppressed rows when promoting into `int_combined`. Exact column placement (new `int_*`/`stg_*` model vs column on existing staging model) is planner's call.
- Distance metric implementation: `ST_Distance_Sphere` or haversine in SQL, as long as the 1.0 km constant (D-07) is honored.
- Where internal collapse runs: Python (`checklist_pipeline.py`) vs a dbt model (`stg_`/`int_` over `stg_checklist__records_full`). Lean dbt to match `int_*` transform convention, but the planner decides.
- Token-set collector algorithm details: exact tokenization, initials-matching rule, library vs hand-rolled.
- Build gate for the human-review invariant (DUP-03): mirror 135's gate pattern (`check_resolution_gate`).
- pytest assertion shape for DUP-01 (no exact-duplicate tuples) and NULL-date/NULL-coord exclusion (DUP-02).

### Deferred Ideas (OUT OF SCOPE)

- Per-source counts display + point-layer suppression rendering — Phase 138.
- Promotion of (deduplicated) checklist rows into `occurrences.parquet` — Phase 137.
- Suppression output contract deep-dive — captured as derived default + planner discretion. Revisit if Phase 137 planning surfaces ambiguity.
- Fuzzy collector matching (rapidfuzz) — rejected for this phase (D-05 chose token-set).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DUP-01 | Exact internal duplicates (identical species, lat, lon, date, collector) collapse to a single record; pytest verifies no exact-duplicate tuples remain post-collapse | SQL GROUP BY collapse with `MIN(ObjectID)` + `COUNT(*) AS collapsed_count`; verified pattern in §Internal Collapse |
| DUP-02 | Cross-source candidate pairs detected conservatively (exact accepted-name + non-year-only date + coords within ~1 km + normalized collector; NULL date/coord ineligible); `dedup_candidate_pairs.csv` produced; flagged rows carry `dedup_status` | `ST_Distance_Sphere` at lat-first order; D-05–D-08 implementation patterns in §Cross-Source Candidate Generation |
| DUP-03 | Only human-confirmed pairs suppress checklist point; unreviewed candidate does not auto-suppress; per-source counts reflect suppression | `dedup_decisions.csv` seed + LEFT JOIN pattern; `check_resolution_gate` template in §Sign-off Gate |

</phase_requirements>

---

## Summary

Phase 136 implements two separate deduplication jobs over the Phase 134/135 full-fidelity checklist record set surfaced by `stg_checklist__records_full`. The internal collapse (DUP-01) is deterministic and automated — a SQL GROUP BY on the five exact-match keys, keeping `MIN(ObjectID)` per group and counting group size as `collapsed_count`. The cross-source candidate generation (DUP-02/DUP-03) is the architecturally interesting piece: it pairs every collapsed checklist record against every Ecdysis specimen (from `int_ecdysis_base`) that satisfies four independent match predicates, then writes the pairs to a regenerated audit CSV while LEFT JOINing a committed curated decisions seed to surface `dedup_status`.

The Phase 135 audit-vs-seed pattern (`occurrence_synonyms.csv` committed seed + `checklist_name_resolution_audit.csv` regenerated audit + `check_resolution_gate()` build gate) is the exact template. The planner should study `data/resolve_checklist_names.py` and `data/resolve_taxon_ids.py` for the gate function shape, `data/dbt/seeds/occurrence_synonyms.csv` for the seed column schema, and `data/dbt/models/intermediate/int_synonyms.sql` for the LEFT JOIN precedence pattern.

The highest-risk technical detail is the `ST_Distance_Sphere` axis-order quirk: in DuckDB spatial 0.3.x (bundled with duckdb 1.5.2), `ST_Distance_Sphere` expects `ST_Point(lat, lon)` — latitude first — which is the **opposite** of `ST_Point(lon, lat)` used everywhere else in the codebase (`occurrences.sql`, `checklist.sql`). Passing the wrong order silently swaps the axes and corrupts the distance computation. This is a load-bearing pitfall the planner must encode as an explicit comment in any SQL that uses `ST_Distance_Sphere`.

**Primary recommendation:** Run the internal collapse as a new dbt `int_*` model (`int_checklist_collapsed`) over `stg_checklist__records_full`, and run candidate generation as a second `int_*` model (`int_dedup_candidates`) that joins `int_checklist_collapsed` × `int_ecdysis_base`. Write `dedup_candidate_pairs.csv` from Python (matching how `checklist_name_resolution_audit.csv` is written in Phase 135). Expose `dedup_status` on a new `int_checklist_dedup_status` view that LEFT JOINs the `dedup_decisions` seed onto `int_checklist_collapsed` so Phase 137 can filter `WHERE dedup_status IS DISTINCT FROM 'confirmed'`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Internal collapse (DUP-01) | Database / dbt intermediate | — | Pure SQL GROUP BY over a dbt-managed view; fits `int_*` convention |
| Candidate pair generation (DUP-02) | Database / dbt intermediate | Python (CSV writer) | SQL for the spatial/date/name join; Python for writing `dedup_candidate_pairs.csv` to disk |
| `dedup_decisions.csv` seed registration | Database / dbt seeds | — | Same seed mechanism as `occurrence_synonyms.csv` |
| LEFT JOIN decisions onto candidates (DUP-03) | Database / dbt intermediate/view | — | Mirrors `int_synonyms` LEFT JOIN pattern |
| Token-set collector normalization (D-05) | Python | — | Token-set with initials awareness is cleaner as a Python helper than in SQL |
| Build gate assertion (DUP-03) | Python (run.py gate step) | — | Mirrors `check_resolution_gate()` in `resolve_taxon_ids.py` |
| Human review surface | CSV file (`dedup_candidate_pairs.csv`) | — | Regenerated by every build; committed seed holds confirmations |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| dbt-duckdb | 1.10.1 [VERIFIED: data/dbt/run.sh] | dbt intermediate models | Project-standard; invoked via `uvx --python 3.13` |
| duckdb | >=1.4,<2 (running 1.5.2) [VERIFIED: data/pyproject.toml] | In-process SQL engine for all transforms | Pipeline-wide dependency |
| duckdb spatial ext | bundled with duckdb 1.5.2 [VERIFIED: profiles.yml] | `ST_Distance_Sphere` for 1 km proximity | Declaratively loaded via `profiles.yml extensions: [spatial]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| rapidfuzz | installed [VERIFIED: data/pyproject.toml] | Token-set utilities (optional for D-05) | Only if hand-rolled sorted-token-set feels risky; `fuzz.token_set_ratio` already imported in `resolve_checklist_names.py` but D-05 does NOT use fuzzy scoring — use only for token splitting, not for scoring |
| Python csv module | stdlib | Writing `dedup_candidate_pairs.csv` | Mirrors pattern in `resolve_checklist_names.py` and `resolve_taxon_ids.py` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ST_Distance_Sphere` (haversine in meters) | Bounding-box `ROUND(lat,2)` prefilter only | Bounding box gives ~1.1 km tolerance not 1.0 km; `ST_Distance_Sphere` is the precise gate |
| dbt intermediate for collapse | Python in `checklist_pipeline.py` | Python works too; dbt keeps all transforms in one layer and `stg_checklist__records_full` is already in dbt |
| Hand-rolled token-set normalizer | `rapidfuzz.fuzz.token_set_ratio` | rapidfuzz is already a dep but D-05 explicitly rejects fuzzy scoring; use it only for tokenization |

---

## Package Legitimacy Audit

No new packages are introduced. All dependencies (`dbt-duckdb`, `duckdb`, `rapidfuzz`, Python stdlib) are already installed and verified in `data/pyproject.toml`.

**Packages removed due to slopcheck:** none  
**Packages flagged as suspicious:** none  
*All packages are pre-existing project dependencies — no new installs in this phase.*

---

## Architecture Patterns

### System Architecture Diagram

```
stg_checklist__records_full          int_ecdysis_base
  (45,927 coord-valid rows)            (Ecdysis specimens)
  ObjectID, canonical_name,             ecdysis_id, canonical_name,
  lat, lon, year, month, day,           ecdysis_lat, ecdysis_lon,
  date_quality, recordedBy              event_date, year, month,
          |                             recordedBy
          |                                   |
          v                                   |
  int_checklist_collapsed             <-------+
  (GROUP BY 5-key, MIN(ObjectID),
   collapsed_count)
          |
          +-------------------> int_dedup_candidates
          |                     (cartesian within match window:
          |                      canonical_name EXACT match
          |                      + date at coarser precision
          |                      + ST_Distance_Sphere <= 1000 m
          |                      + token-set collector match)
          |                             |
          |                            (Python writer)
          |                             v
          |                     dedup_candidate_pairs.csv  <--- curator review
          |                             |
          |                      dedup_decisions.csv  <--- committed seed (D-01)
          |                        (pair_key, dedup_status)
          |                             |
          v                            v
  int_checklist_dedup_status  <---LEFT JOIN by pair_key
  (int_checklist_collapsed +
   dedup_status column from seed
   or NULL if unreviewed)
          |
          v
  Phase 137 consumes this view:
  WHERE dedup_status IS DISTINCT FROM 'confirmed'
```

### Recommended Project Structure

```
data/
├── dbt/
│   ├── seeds/
│   │   └── dedup_decisions.csv          # committed curated seed (D-01/D-02)
│   ├── models/
│   │   ├── intermediate/
│   │   │   ├── int_checklist_collapsed.sql      # DUP-01 collapse
│   │   │   ├── int_dedup_candidates.sql         # DUP-02 candidate pairs
│   │   │   └── int_checklist_dedup_status.sql   # DUP-03 LEFT JOIN
│   │   └── staging/
│   │       └── stg_checklist__records_full.sql  # unchanged (Phase 135)
├── checklist_dedup.py                    # Python: writes dedup_candidate_pairs.csv + gate
└── dedup_candidate_pairs.csv            # regenerated audit CSV (committed, not in seeds/)
```

### Pattern 1: Internal Collapse with GROUP BY + collapsed_count (DUP-01)

**What:** Replace exact-duplicate groups with a single survivor carrying `collapsed_count`.  
**When to use:** Any time you need deterministic survivor selection (lowest-key wins).  
**Grouping keys** (from `stg_checklist__records_full.sql` columns, verified at line 20-43):
- `canonical_name` — post-synonym resolved species name
- `lat` — DOUBLE
- `lon` — DOUBLE
- `year` — BIGINT
- `month` — BIGINT
- `day` — BIGINT (date_quality='full' rows only; `year_only` rows already excluded by `date_quality != 'year_only'` filter — see D-06)
- `recordedBy` — VARCHAR (NULL-safe: `COALESCE(recordedBy, '')` so NULL collectors form their own group rather than matching each other)

**Example:**
```sql
-- Source: data/dbt/models/intermediate/int_checklist_collapsed.sql (to be created)
-- Uses verified DuckDB GROUP BY + MIN pattern (verified 2026-06-08)
{{ config(materialized='table') }}

SELECT
    MIN(ObjectID)       AS ObjectID,
    canonical_name,
    lat,
    lon,
    year,
    month,
    day,
    date_quality,
    recordedBy,
    -- carry forward non-key fields from the survivor row using FIRST() or a JOIN
    -- OPTION A (simpler): GROUP BY all relevant non-key fields (works when dupes are truly identical)
    MIN(locality)       AS locality,
    MIN(family)         AS family,
    MIN(verbatim_name)  AS verbatim_name,
    MIN(coord_flag)     AS coord_flag,
    MIN(taxon_id)       AS taxon_id,
    COUNT(*)            AS collapsed_count
FROM {{ ref('stg_checklist__records_full') }}
GROUP BY canonical_name, lat, lon, year, month, day, date_quality, recordedBy
```

**Alternative QUALIFY pattern** (equivalent, more explicit about survivor row):
```sql
-- Uses window function to select the full survivor row, then add collapsed_count
WITH ranked AS (
    SELECT *,
        ROW_NUMBER() OVER (
            PARTITION BY canonical_name, lat, lon, year, month, day, recordedBy
            ORDER BY ObjectID
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY canonical_name, lat, lon, year, month, day, recordedBy
        ) AS collapsed_count
    FROM {{ ref('stg_checklist__records_full') }}
)
SELECT * EXCLUDE rn FROM ranked
WHERE rn = 1
-- Note: verified working GROUP BY is simpler; QUALIFY syntax also works in DuckDB
```

**NOTE on NULL recordedBy:** The `stg_checklist__records_full` view passes `recordedBy` through as-is (nullable VARCHAR). Two NULL `recordedBy` rows with identical species/lat/lon/date are distinct specimens (cannot confirm same collector), so they should NOT be collapsed together. Use `COALESCE(recordedBy, CAST(ObjectID AS VARCHAR))` in the GROUP BY to keep NULL-collector rows individually. [ASSUMED] — this is the conservative interpretation of D-05's "token-set normalization" for NULL; verify with user at planning.

### Pattern 2: Cross-Source Candidate Pair Generation (DUP-02)

**What:** Cartesian join between collapsed checklist records and Ecdysis specimens, filtered to the four match predicates.  
**When to use:** Cross-source dedup where no shared primary key exists.

**Ecdysis columns available** (verified from `int_ecdysis_base.sql` lines 7-26 [CITED: data/dbt/models/intermediate/int_ecdysis_base.sql]):
- `ecdysis_id` — INTEGER
- `ecdysis_lat` / `ecdysis_lon` — DOUBLE
- `event_date` — VARCHAR (ISO date string, e.g. `'2024-06-15'`)
- `year` — INTEGER
- `month` — INTEGER  
- `recordedBy` — VARCHAR
- `canonical_name` — VARCHAR (post-synonymy)

**Important:** `int_ecdysis_base` does NOT have a `day` column. It has `year` and `month`. The `event_date` VARCHAR carries the full ISO date when available. To extract day from Ecdysis: `TRY_CAST(EXTRACT('day' FROM CAST(event_date AS DATE)) AS INTEGER)` — but this will be NULL for records where `event_date` is not a valid ISO date. This directly maps to D-06: Ecdysis precision is determined by what `event_date` carries; the coarser-shared-precision rule means if `event_date` has a full date but the checklist row has only year+month (day IS NULL), match on year+month only.

**1 km proximity predicate** (CRITICAL — see Pitfall 1 below):
```sql
-- ST_Distance_Sphere in DuckDB spatial 0.3.x REQUIRES lat-first axis order:
-- ST_Point(lat, lon) NOT ST_Point(lon, lat)
-- This is the OPPOSITE of ST_Point(lon, lat) used in occurrences.sql ST_Within calls
-- Source: verified experimentally 2026-06-08; confirmed in duckdb_functions() description:
-- "The input is expected to be in WGS84 (EPSG:4326) coordinates, using a [latitude, longitude] axis order"

ST_Distance_Sphere(
    ST_Point(cl.lat, cl.lon),       -- lat first for ST_Distance_Sphere
    ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
) <= 1000.0  -- DEDUP_DISTANCE_THRESHOLD_M constant
```

**Recommended approach:** Define the constant at the top of the SQL file:
```sql
-- {{ DEDUP_DISTANCE_THRESHOLD_M = 1000.0 }}
-- D-07: 1.0 km proximity threshold (tunable constant)
```

**Bounding-box prefilter** (performance): For 45k × 70k candidate pairs, a bounding-box prefilter before the `ST_Distance_Sphere` call avoids computing expensive haversine for obviously-distant pairs:
```sql
-- Rough bounding box: ±0.01 deg lat ≈ ±1.1 km, ±0.013 deg lon ≈ ±1.0 km at lat 47
AND ABS(cl.lat - ec.ecdysis_lat) <= 0.01
AND ABS(cl.lon - ec.ecdysis_lon) <= 0.013
-- Then precise distance:
AND ST_Distance_Sphere(ST_Point(cl.lat, cl.lon), ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)) <= 1000.0
```
[ASSUMED] The bounding-box optimization is advisory; DuckDB may optimize the join without it. Measure before committing.

**Date match at coarser shared precision (D-06):**
```sql
-- Ecdysis day: extract from event_date VARCHAR
-- Checklist day: cl.day (BIGINT, NULL if date_quality != 'full')
-- Checklist date_quality: 'full' | 'year_only' | 'none'
-- D-06: exclude if either side is year-only or NULL

-- Exclusion guard (inline in WHERE):
AND cl.date_quality = 'full'           -- excludes year_only and none
AND cl.year IS NOT NULL                -- belt-and-suspenders (date_quality='full' implies year IS NOT NULL)
AND ec.event_date IS NOT NULL          -- excludes NULL Ecdysis date
AND ec.year IS NOT NULL                -- belt-and-suspenders

-- Year always matches:
AND cl.year = ec.year

-- Month: always available on both sides when date is non-null
AND cl.month = ec.month

-- Day: compare only when BOTH sides have a day
AND (
    cl.day IS NULL
    OR TRY_CAST(EXTRACT('day' FROM TRY_CAST(ec.event_date AS DATE)) AS INTEGER) IS NULL
    OR cl.day = TRY_CAST(EXTRACT('day' FROM TRY_CAST(ec.event_date AS DATE)) AS INTEGER)
)
```

**Collector token-set normalization (D-05) — recommended as Python, not SQL:**

The token-set with initials-awareness logic is cleaner as a Python helper applied before writing the candidate CSV, not in SQL. Recommended approach:
1. In `int_dedup_candidates.sql`, carry `cl.recordedBy` and `ec.recordedBy` as raw strings.
2. In the Python CSV writer (`checklist_dedup.py`), apply the normalizer to both columns and emit only pairs where `normalized_collector_match = True`.

Alternatively, do the normalization entirely in Python when querying the DB: fetch candidate rows (after spatial/date/name filters), apply Python normalizer, write matching pairs to CSV.

**Collector normalization function (D-05):**
```python
import re, unicodedata

def _normalize_collector(name: str | None) -> frozenset[str]:
    """Return a sorted token-set for collector matching (D-05).
    
    Handles:
    - 'J Smith' ≈ 'John Smith' via initial match
    - 'Smith, J.' ≈ 'J. Smith' via token-set equality
    
    Returns frozenset of lowercase tokens for set comparison.
    """
    if name is None:
        return frozenset()
    # Lowercase, strip punctuation, collapse whitespace
    normalized = re.sub(r'[^\w\s]', ' ', name.lower())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    tokens = set(normalized.split())
    return frozenset(tokens)

def _collectors_match(a: str | None, b: str | None) -> bool:
    """True if collector names match under token-set + initials rules (D-05)."""
    if a is None or b is None:
        return False
    ts_a = _normalize_collector(a)
    ts_b = _normalize_collector(b)
    if ts_a == ts_b:
        return True
    # Initials awareness: 'J Smith' ≈ 'John Smith'
    # Token in set A is an initial (single letter) that matches the first letter
    # of the corresponding-length-expansion token in set B
    # Simple rule: if every token in the smaller set either matches a token in the
    # larger set exactly, OR is a single-char that is the initial of a token in the
    # larger set, then it's a match.
    smaller, larger = (ts_a, ts_b) if len(ts_a) <= len(ts_b) else (ts_b, ts_a)
    for tok in smaller:
        # Direct match
        if tok in larger:
            continue
        # Initial match: single char matches first char of some token in larger
        if len(tok) == 1 and any(t.startswith(tok) for t in larger):
            continue
        return False
    return True
```

[ASSUMED] The exact initials-matching rule above needs user confirmation. The core logic (single-letter token matches any token with that initial) is a reasonable default for D-05, but edge cases (multiple people with same last name + initial) should be reviewed at planning.

### Pattern 3: Sign-off Seed + LEFT JOIN + Gate (D-01/D-02/D-03)

**What:** Committed seed holds curator decisions; LEFT JOIN exposes `dedup_status` on collapsed records; Python gate asserts no suppression without confirmation.

**Seed schema** (mirrors `occurrence_synonyms.csv` [CITED: data/dbt/seeds/occurrence_synonyms.csv]):
```csv
pair_key,dedup_status,note
"1234|5678","confirmed","Verified same specimen: same locality, date, collector"
"9999|1111","rejected","Different collection events — keep both"
```
- `pair_key` format: `"<ObjectID>|<ecdysis_id>"` (string, human-readable, debuggable per D-02)
- `dedup_status`: `confirmed` | `rejected` (unreviewed = no row in seed)
- `note`: free-text curator rationale (optional but encouraged)

**dbt seed registration** (mirrors `schema.yml` for `occurrence_synonyms` [CITED: data/dbt/seeds/schema.yml]):
```yaml
# data/dbt/seeds/schema.yml addition:
- name: dedup_decisions
  columns:
    - name: pair_key
      data_tests:
        - not_null
        - unique
    - name: dedup_status
      data_tests:
        - not_null
        - accepted_values:
            values: ['confirmed', 'rejected']
```

**`int_checklist_dedup_status.sql` LEFT JOIN pattern:**
```sql
-- Source: data/dbt/models/intermediate/int_checklist_dedup_status.sql (to be created)
-- Mirrors int_synonyms.sql LEFT JOIN pattern [CITED: data/dbt/models/intermediate/int_synonyms.sql]
{{ config(materialized='view') }}

SELECT
    cl.*,
    -- ANY confirmed pair suppresses the point (D-08)
    CASE WHEN bool_or(dd.dedup_status = 'confirmed') OVER (PARTITION BY cl.ObjectID)
         THEN 'confirmed'
         ELSE MAX(dd.dedup_status) OVER (PARTITION BY cl.ObjectID)
    END AS dedup_status
FROM {{ ref('int_checklist_collapsed') }} cl
LEFT JOIN {{ ref('int_dedup_candidates') }} cand ON cand.checklist_ObjectID = cl.ObjectID
LEFT JOIN {{ ref('dedup_decisions') }} dd ON dd.pair_key = cand.pair_key
```

**Alternative (simpler):** Phase 137 may prefer to consume `int_checklist_collapsed` directly and filter in its own WHERE, joining `dedup_decisions` itself. The planner should decide at Phase 137 time. This phase should at minimum produce the intermediate view that exposes `dedup_status` in a queryable form.

**Build gate function** (mirrors `check_resolution_gate()` [CITED: data/resolve_taxon_ids.py lines 83-110]):
```python
# data/checklist_dedup.py

DEDUP_CANDIDATE_CSV = Path(__file__).parent / "dedup_candidate_pairs.csv"
DEDUP_DECISIONS_CSV = Path(__file__).parent / "dbt" / "seeds" / "dedup_decisions.csv"

def check_dedup_gate() -> None:
    """Fail fast if any confirmed suppression lacks a decision row.

    DUP-03: no checklist point is suppressed without an explicit 'confirmed'
    row in dedup_decisions.csv. Since suppression is defined as having a
    confirmed seed row, this gate can never fire in theory — but it asserts
    that every pair_key in the seed exists in the regenerated candidates CSV
    (guards against stale seed rows that reference pairs no longer generated).
    """
    import sys, csv as _csv
    if not DEDUP_DECISIONS_CSV.exists():
        print("dedup-gate: OK (no decisions seed — no suppressions active)")
        return
    if not DEDUP_CANDIDATE_CSV.exists():
        sys.exit("dedup-gate: ERROR — dedup_decisions.csv exists but dedup_candidate_pairs.csv missing. Run pipeline first.")
    candidate_keys = {row['pair_key'] for row in _csv.DictReader(open(DEDUP_CANDIDATE_CSV))}
    decisions = list(_csv.DictReader(open(DEDUP_DECISIONS_CSV)))
    orphans = [r for r in decisions if r['pair_key'] not in candidate_keys and r['dedup_status'] == 'confirmed']
    if orphans:
        keys = ", ".join(r['pair_key'] for r in orphans)
        sys.exit(f"dedup-gate: {len(orphans)} confirmed suppression(s) reference pair_keys not in current candidates (stale seed?): {keys}")
    confirmed = [r for r in decisions if r['dedup_status'] == 'confirmed']
    print(f"dedup-gate: OK ({len(confirmed)} confirmed suppressions, {len(decisions) - len(confirmed)} rejected)")
```

### Pattern 4: Candidate CSV Writer (DUP-02, D-01)

The CSV writer lives in Python (mirrors `checklist_name_resolution_audit.csv` in Phase 135 [CITED: data/resolve_checklist_names.py]). The writer queries `int_dedup_candidates` from the dbt-built DB and writes `dedup_candidate_pairs.csv`.

```python
# data/checklist_dedup.py (excerpt)

def write_dedup_candidates(con: duckdb.DuckDBPyConnection) -> int:
    """Query dbt_sandbox.int_dedup_candidates and write dedup_candidate_pairs.csv.
    
    Returns count of candidate pairs written.
    Columns: pair_key, checklist_ObjectID, ecdysis_id, canonical_name,
             checklist_lat, checklist_lon, ecdysis_lat, ecdysis_lon,
             distance_m, checklist_date, ecdysis_date, checklist_collector,
             ecdysis_collector
    """
    rows = con.execute("""
        SELECT
            (CAST(checklist_ObjectID AS VARCHAR) || '|' || CAST(ecdysis_id AS VARCHAR)) AS pair_key,
            checklist_ObjectID, ecdysis_id, canonical_name,
            checklist_lat, checklist_lon, ecdysis_lat, ecdysis_lon,
            distance_m,
            checklist_date, ecdysis_date,
            checklist_collector, ecdysis_collector
        FROM dbt_sandbox.int_dedup_candidates
        ORDER BY canonical_name, checklist_ObjectID, ecdysis_id
    """).fetchall()
    # write CSV...
    return len(rows)
```

### Anti-Patterns to Avoid

- **Anti-Pattern 1: Using `ST_Point(lon, lat)` with `ST_Distance_Sphere`** — `ST_Distance_Sphere` requires lat-first in DuckDB spatial (verified 2026-06-08). Silently gives wrong distances if lon/lat are swapped. Add a comment in the SQL referencing this pitfall.
- **Anti-Pattern 2: Running candidate generation before collapse** — pair_key stability (D-02 note) requires ObjectID from the post-collapse survivor. If candidates are generated from `stg_checklist__records_full` directly, the `ObjectID` in `pair_key` may not be the lowest one, breaking the stability guarantee.
- **Anti-Pattern 3: Collapsing NULL `recordedBy` rows together** — two NULL-collector rows with the same species/lat/lon/date are not confirmed duplicates (different unknown collectors could have sampled the same spot). Keep NULL-collector rows individually in the collapse.
- **Anti-Pattern 4: Excluding `date_quality = 'year_only'` via NULL check** — `year_only` rows have non-NULL `year` but NULL `month` and `day`. The exclusion must check `date_quality != 'year_only'` (or equivalently `date_quality = 'full'`), not just `year IS NOT NULL`.
- **Anti-Pattern 5: Writing `dedup_candidate_pairs.csv` before the dbt build** — the candidate query reads `dbt_sandbox.int_dedup_candidates` which is produced by dbt. The write step must run after `dbt-build` in `run.py` STEPS.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Haversine distance in SQL | Custom SQL haversine formula | `ST_Distance_Sphere` (DuckDB spatial) | Already loaded via `profiles.yml`; handles edge cases; [VERIFIED: data/dbt/profiles.yml] |
| CSV formula injection safety | Custom quoting | `_csv_safe()` helper already in codebase | Pattern verified in `resolve_taxon_ids.py:69-80` and `resolve_checklist_names.py` |
| Build gate pattern | Custom gate logic | Mirror `check_resolution_gate()` | Established pattern; fail-fast semantics already correct [CITED: data/resolve_taxon_ids.py:83-110] |
| Seed registration | Custom DB load | dbt seed mechanism via `schema.yml` | `occurrence_synonyms.csv` precedent [CITED: data/dbt/seeds/schema.yml] |

**Key insight:** The Phase 135 audit-vs-seed pattern is the entire template for Phase 136. Study `resolve_checklist_names.py`, `dedup_decisions.csv` seed = `occurrence_synonyms.csv` seed, `dedup_candidate_pairs.csv` = `checklist_name_resolution_audit.csv`, `check_dedup_gate()` = `check_resolution_gate()`.

---

## Common Pitfalls

### Pitfall 1: `ST_Distance_Sphere` Axis Order — lat/lon REVERSED vs Rest of Codebase

**What goes wrong:** DuckDB spatial `ST_Distance_Sphere` expects `ST_Point(lat, lon)` (latitude first). The rest of the project uses `ST_Point(lon, lat)` convention (occurrences.sql line 25, checklist.sql). Passing `ST_Point(lon, lat)` to `ST_Distance_Sphere` silently computes the wrong distance — the function doc string says "using a [latitude, longitude] axis order."

**Why it happens:** The WKT / GeoJSON convention (and DuckDB's `ST_Within`) uses X=longitude, Y=latitude. But `ST_Distance_Sphere` follows the GPS convention (lat comes first). Both are "correct" in their own domain but inconsistent with each other.

**How to avoid:** In any SQL using `ST_Distance_Sphere`, write:
```sql
-- CRITICAL: ST_Distance_Sphere uses lat-first axis order (verified 2026-06-08)
-- This is the OPPOSITE of ST_Point(lon, lat) used elsewhere for ST_Within
ST_Distance_Sphere(ST_Point(cl.lat, cl.lon), ST_Point(ec.ecdysis_lat, ec.ecdysis_lon))
```
Add a comment referencing this pitfall in every SQL file that calls it.

**Warning signs:** Candidate pairs include records from opposite sides of Washington State (>100 km apart).

**Verification:** `SELECT ST_Distance_Sphere(ST_Point(47.0, -122.0), ST_Point(48.0, -122.0))` should return ~111,000 m (1 degree of latitude). If it returns ~59,000 m, the axes are swapped.

---

### Pitfall 2: pair_key Stability Requires Collapse-First Ordering

**What goes wrong:** If candidate generation queries `stg_checklist__records_full` (pre-collapse), the `ObjectID` in `pair_key` is the raw source row ID, not necessarily the survivor. After the first build, a curator confirms `pair_key = "1234|5678"`. On the next rebuild, if collapse now selects ObjectID `1235` as the survivor (e.g., due to a data update), the confirmed pair_key `"1234|5678"` no longer matches any generated candidate — the confirmation is orphaned.

**How to avoid:** Enforce the build order: collapse always runs before candidate generation. `int_dedup_candidates` must take `int_checklist_collapsed` as input (which already carries `MIN(ObjectID)` as the survivor), not `stg_checklist__records_full`. The dbt DAG enforces this if the model ref chain is correct.

**Warning signs:** `check_dedup_gate()` reports orphaned confirmed pair_keys.

---

### Pitfall 3: NULL `date_quality` / year-only Rows Leaking into Candidates

**What goes wrong:** D-06 says exclude year-only or NULL either side. The `date_quality` column in `stg_checklist__records_full` takes values `'full'`, `'year_only'`, `'none'`. A year-only row has non-NULL `year` but NULL `month` and `day`. Filtering on `year IS NOT NULL AND month IS NOT NULL` alone would allow `date_quality='year_only'` rows through if `year_only` rows somehow had a month (they don't in the current data, but the guard should be explicit).

**How to avoid:** Filter on `cl.date_quality = 'full'` explicitly (verified in `checklist_pipeline.py:_parse_checklist_date()` which defines the enum values [CITED: data/checklist_pipeline.py line 186-244]).

---

### Pitfall 4: Spatial Extension Load in pytest

**What goes wrong:** Tests that query `int_dedup_candidates` via `dbt_sandbox` require the spatial extension. The existing `conftest.py` session fixture loads spatial (`INSTALL spatial; LOAD spatial`) at line 553, but any new pytest test that creates its own DuckDB connection in-memory will not have spatial loaded.

**How to avoid:** New test files that need spatial should call `con.execute("INSTALL spatial; LOAD spatial")` in their fixture. The `fixture_db` / `fixture_con` session fixtures already handle this for existing tests [CITED: data/tests/conftest.py lines 545-565].

---

### Pitfall 5: The 5,184-Group Count Is a Pre-Collapse Figure

**What goes wrong:** DUP-01 acceptance criterion says "the 5,184 duplicate groups collapse." This is the count of groups that contain >1 row, not the row count change. The pytest assertion should be:
- Post-collapse: zero rows where `(canonical_name, lat, lon, year, month, day, recordedBy)` tuple appears more than once.
- Optionally: `SUM(collapsed_count) - COUNT(*) = 5,184` (total rows collapsed away).

The exact 5,184 figure comes from the source CSV (134-CONTEXT.md). Since Phase 135 adds `canonical_name` (synonym-resolved) which may differ from the raw verbatim name, the post-135 exact-duplicate count may differ from the pre-135 figure. The test should assert **zero remaining duplicates** (the count is a hint, not the assertion target). [ASSUMED] — the 5,184 figure is from pre-Phase-135 data; the actual post-Phase-135 count may differ if synonym resolution changes some `canonical_name` values and accidentally merges or splits groups.

---

### Pitfall 6: Ecdysis `event_date` Precision Varies

**What goes wrong:** `int_ecdysis_base.ecdysis_date` is `o.event_date` (VARCHAR from the source table). Some Ecdysis records may have NULL `event_date` or only year-level precision. `CAST(event_date AS DATE)` or `TRY_CAST` will return NULL for malformed strings, which is correct (they become ineligible per D-06).

**How to avoid:** Use `TRY_CAST(ec.event_date AS DATE)` and treat NULL result as "ineligible." Do not use `ec.year` alone as the date match — year-only Ecdysis records must be excluded per D-06 ("exclude if either side is year-only or NULL").

---

## Code Examples

### Internal Collapse — Verified DuckDB GROUP BY Pattern

```sql
-- Verified 2026-06-08: GROUP BY + MIN(ObjectID) + COUNT(*) pattern works in DuckDB 1.5.2
-- Source: experimental verification; mirrors pattern from int_ecdysis_base.sql
WITH base AS (
    SELECT * FROM {{ ref('stg_checklist__records_full') }}
    WHERE date_quality = 'full'   -- D-06: year_only excluded from collapse key comparison
       OR date_quality = 'none'   -- include undated rows (they form their own groups)
       OR date_quality = 'year_only'  -- include; year_only rows can still be internal dupes
)
SELECT
    MIN(ObjectID)     AS ObjectID,
    canonical_name,
    lat, lon,
    year, month, day,
    date_quality,
    recordedBy,
    MIN(verbatim_name)  AS verbatim_name,
    MIN(locality)       AS locality,
    MIN(family)         AS family,
    MIN(coord_flag)     AS coord_flag,
    MIN(taxon_id)       AS taxon_id,
    COUNT(*)            AS collapsed_count
FROM base
GROUP BY canonical_name, lat, lon, year, month, day, date_quality, recordedBy
```

### Cross-Source Candidate Generation — Spatial + Date + Name

```sql
-- Source: pattern derived from int_ecdysis_base.sql + occurrences.sql spatial join
-- CRITICAL: ST_Distance_Sphere uses ST_Point(lat, lon), not ST_Point(lon, lat)

WITH ecdysis_dated AS (
    SELECT
        ecdysis_id,
        ecdysis_lat,
        ecdysis_lon,
        canonical_name,
        year,
        month,
        TRY_CAST(EXTRACT('day' FROM TRY_CAST(event_date AS DATE)) AS INTEGER) AS day,
        event_date,
        recordedBy
    FROM {{ ref('int_ecdysis_base') }}
    WHERE ecdysis_lat IS NOT NULL
      AND ecdysis_lon IS NOT NULL
      AND year IS NOT NULL
      AND month IS NOT NULL           -- D-06: exclude year-only or NULL Ecdysis dates
      AND event_date IS NOT NULL
)
SELECT
    -- D-02: pair_key = composite (ObjectID, ecdysis_id)
    (CAST(cl.ObjectID AS VARCHAR) || '|' || CAST(ec.ecdysis_id AS VARCHAR)) AS pair_key,
    cl.ObjectID    AS checklist_ObjectID,
    ec.ecdysis_id,
    cl.canonical_name,
    cl.lat         AS checklist_lat,
    cl.lon         AS checklist_lon,
    ec.ecdysis_lat,
    ec.ecdysis_lon,
    -- D-07: 1.0 km named constant (lat-first for ST_Distance_Sphere)
    ST_Distance_Sphere(
        ST_Point(cl.lat, cl.lon),
        ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
    )              AS distance_m,
    cl.year        AS checklist_year,
    cl.month       AS checklist_month,
    cl.day         AS checklist_day,
    cl.date_quality,
    CAST(ec.event_date AS VARCHAR) AS ecdysis_date,
    ec.year        AS ecdysis_year,
    ec.month       AS ecdysis_month,
    ec.day         AS ecdysis_day,
    cl.recordedBy  AS checklist_collector,
    ec.recordedBy  AS ecdysis_collector
FROM {{ ref('int_checklist_collapsed') }} cl
JOIN ecdysis_dated ec
    ON  cl.canonical_name = ec.canonical_name         -- exact accepted-name match
    AND cl.date_quality = 'full'                       -- D-06: exclude year_only/none checklist
    AND cl.year = ec.year
    AND cl.month = ec.month                            -- month always required (not year-only)
    AND (
        cl.day IS NULL
        OR ec.day IS NULL
        OR cl.day = ec.day                             -- D-06: day required only when both present
    )
    AND cl.lat IS NOT NULL                             -- D-06: NULL coord ineligible (already filtered by stg_ but belt-and-suspenders)
    AND cl.lon IS NOT NULL
    -- D-07: bounding box prefilter (performance), then precise distance
    AND ABS(cl.lat - ec.ecdysis_lat) <= 0.012
    AND ABS(cl.lon - ec.ecdysis_lon) <= 0.016
    AND ST_Distance_Sphere(
            ST_Point(cl.lat, cl.lon),
            ST_Point(ec.ecdysis_lat, ec.ecdysis_lon)
        ) <= 1000.0                                    -- DEDUP_DISTANCE_THRESHOLD_M
-- D-05: collector match is applied in Python (see checklist_dedup.py _collectors_match)
-- because token-set + initials logic is cleaner there than in SQL
```

**NOTE:** D-05 collector matching is applied in Python after fetching candidates from SQL. The SQL candidate query above does NOT apply collector filtering — it returns all (name+date+distance) matching pairs. The Python writer applies `_collectors_match(cl_col, ec_col)` before writing to `dedup_candidate_pairs.csv`. This means `int_dedup_candidates` as a dbt model carries all pairs without collector filter; the collector filter lives in Python.

**Alternative:** If collector normalization is pushed into SQL, DuckDB's `regexp_replace`, `lower`, `trim` functions can handle the normalization part, but initials-awareness logic requires a UDF or a series of SQL predicates. The Python approach is cleaner.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `int_checklist_dedup.sql` silently drops duplicates (Phase C sketch in ARCHITECTURE.md) | Two-file split: candidates CSV + decisions seed with human gate (D-01) | Phase 136 CONTEXT decision | No silent suppression; all drops require human confirmation |
| `ROUND(lat, 2)` bounding box for ~1.1 km proximity | `ST_Distance_Sphere` for precise 1.0 km (D-07) | Phase 136 CONTEXT decision | Exact 1 km radius instead of approximate box |
| Collapse in Python (`checklist_pipeline.py`) | dbt `int_*` model (discretion) | Phase 136 CONTEXT discretion | Keep all transforms in dbt layer |

**Deprecated/outdated:**
- The original ARCHITECTURE.md sketch (`int_checklist_dedup.sql` with automatic silent drops) is **superseded** by the two-file D-01/D-02/D-03 approach. Do not use that sketch as a template.
- The `ROUND(lat, 2)` approach from ARCHITECTURE.md is **superseded** by `ST_Distance_Sphere <= 1000.0`.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | NULL `recordedBy` rows should NOT be collapsed together (each forms its own group) | Pattern 1 | Two distinct unknown-collector records at same site/date/species would be incorrectly treated as separate; low risk (conservative) |
| A2 | D-05 collector normalization is best implemented in Python, not SQL | Pattern 2 | SQL implementation is possible but messier; low risk |
| A3 | The 5,184 internal-duplicate-group figure may change post-Phase-135 synonym resolution | Pitfall 5 | Acceptance test should assert zero remaining duplicates, not the exact 5,184 delta |
| A4 | `int_dedup_candidates` dbt model applies spatial+date+name filters only; collector filter applied in Python CSV writer | Pattern 2 / Code Examples | If collector filter is missed in Python, candidates CSV will be noisier than intended; gate still prevents suppression |
| A5 | `pair_key` format is `"<ObjectID>|<ecdysis_id>"` as a VARCHAR string (not a compound struct) | Pattern 3 | Compound struct would require different SQL for the LEFT JOIN; VARCHAR is simpler and more debuggable |

---

## Open Questions

1. **NULL `recordedBy` collapse behavior**
   - What we know: D-03 says "identical species, lat, lon, date, collector" — NULL collector means collector is unknown.
   - What's unclear: Should two NULL-collector rows with the same species/lat/lon/date collapse (treating NULL = NULL = same unknown person) or stay separate (conservative)?
   - Recommendation: Keep separate (conservative, false-split is safer per D-03 guidance). Use `COALESCE(recordedBy, CAST(ObjectID AS VARCHAR))` in GROUP BY so each NULL-collector row gets its own group.

2. **`int_dedup_candidates` materialization**
   - What we know: `int_combined` is materialized as TABLE (not view) to avoid re-evaluating the UNION ALL on every spatial join pass.
   - What's unclear: Should `int_dedup_candidates` be a TABLE (expensive join materialized once) or a VIEW (re-evaluated on every query)?
   - Recommendation: TABLE — the spatial join × 45k × 70k rows is expensive. Materialize once during dbt build; `checklist_dedup.py` reads from the built table.

3. **Where to call `write_dedup_candidates()` in `run.py`**
   - What we know: `run.py` STEPS runs `dbt-build` at step 16 of 23. The CSV writer must run after dbt (to read `dbt_sandbox.int_dedup_candidates`) but before `generate-sqlite`.
   - Recommendation: Add a new `("dedup-candidates", write_dedup_candidates_step)` step immediately after `dbt-build` in STEPS.

4. **Whether `int_checklist_dedup_status` is needed as a dbt model in Phase 136**
   - What we know: Phase 137 needs `dedup_status` to filter confirmed-suppressed rows. Phase 136 is supposed to "stop at producing that joinable status."
   - What's unclear: Should Phase 136 create the `int_checklist_dedup_status` view, or leave the LEFT JOIN to Phase 137?
   - Recommendation: Phase 136 creates `int_checklist_dedup_status` as a VIEW so Phase 137 can `ref()` it cleanly. This phase "stops at producing the joinable status" — meaning it doesn't filter rows yet, just exposes `dedup_status`.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| duckdb (Python) | All transforms | ✓ | 1.5.2 | — |
| duckdb spatial extension | ST_Distance_Sphere | ✓ | bundled with 1.5.2 | — |
| dbt-duckdb | dbt models | ✓ | 1.10.1 (via uvx --python 3.13) | — |
| rapidfuzz | Optional collector tokenizer | ✓ | installed | Python stdlib re module |
| Python csv module | CSV writer | ✓ | stdlib | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest ≥9.0.2 (verified: data/pyproject.toml) |
| Config file | data/pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `cd data && uv run pytest tests/test_checklist_dedup.py -x` |
| Full suite command | `cd data && uv run pytest -m 'not integration'` |

**Test tier discipline** (from project memory and conftest.py):
- Fast tier (`-m 'not integration'`): pure-Python unit tests + isolated DuckDB; runs in seconds; no real CSV / no dbt build needed
- Integration tier (`-m integration`): reads real built artifacts; host SIGKILLs long suites; run scoped per-file

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DUP-01 | No exact-duplicate tuples remain after collapse | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_no_exact_duplicates_after_collapse -x` | ❌ Wave 0 |
| DUP-01 | `collapsed_count` = group size | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_collapsed_count_correct -x` | ❌ Wave 0 |
| DUP-01 | Lowest `ObjectID` wins within each group | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_lowest_objectid_survives -x` | ❌ Wave 0 |
| DUP-02 | NULL-date rows never appear in candidates | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_null_date_excluded_from_candidates -x` | ❌ Wave 0 |
| DUP-02 | NULL-coord rows never appear in candidates | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_null_coord_excluded_from_candidates -x` | ❌ Wave 0 |
| DUP-02 | `dedup_candidate_pairs.csv` produced with correct columns | unit | `pytest tests/test_checklist_dedup.py::test_candidate_csv_written -x` | ❌ Wave 0 |
| DUP-02 | Token-set + initials collector match | unit (Python) | `pytest tests/test_checklist_dedup.py::test_collector_normalization -x` | ❌ Wave 0 |
| DUP-03 | Unreviewed pair does not suppress point | unit (isolated DuckDB) | `pytest tests/test_checklist_dedup.py::test_unreviewed_pair_not_suppressed -x` | ❌ Wave 0 |
| DUP-03 | `confirmed` pair sets `dedup_status='confirmed'` | unit | `pytest tests/test_checklist_dedup.py::test_confirmed_pair_suppressed -x` | ❌ Wave 0 |
| DUP-03 | Gate asserts no orphaned confirmed pair_keys | unit | `pytest tests/test_checklist_dedup.py::test_dedup_gate -x` | ❌ Wave 0 |

### Sampling Rate
- Per task commit: `cd data && uv run pytest tests/test_checklist_dedup.py -x`
- Per wave merge: `cd data && uv run pytest -m 'not integration'`
- Phase gate: full fast suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `data/tests/test_checklist_dedup.py` — all 10 tests above
- [ ] `data/checklist_dedup.py` — module under test (write candidates CSV, gate function)
- [ ] `data/dbt/models/intermediate/int_checklist_collapsed.sql`
- [ ] `data/dbt/models/intermediate/int_dedup_candidates.sql`
- [ ] `data/dbt/models/intermediate/int_checklist_dedup_status.sql`
- [ ] `data/dbt/seeds/dedup_decisions.csv` (header-only initial commit)
- [ ] `data/dbt/seeds/schema.yml` entry for `dedup_decisions`

---

## Security Domain

This phase writes no user-facing output and has no authentication surface. It reads and writes curator-facing CSV files. The `_csv_safe()` formula-injection guard (verified in `resolve_taxon_ids.py:69-80` and `resolve_checklist_names.py`) should be applied when writing `dedup_candidate_pairs.csv` since curator names from the source CSV may contain characters like `=`, `+`, `-` that trigger spreadsheet formula evaluation. No other ASVS categories apply.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (curator-facing CSV cells) | `_csv_safe()` — existing project helper |
| V2–V4, V6 | no | Static pipeline, no auth surface |

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)

- `data/dbt/models/staging/stg_checklist__records_full.sql` — dedup input columns (ObjectID, canonical_name, lat, lon, year, month, day, date_quality, recordedBy)
- `data/dbt/models/intermediate/int_ecdysis_base.sql` — cross-source match target columns (ecdysis_id, ecdysis_lat, ecdysis_lon, event_date, year, month, recordedBy, canonical_name)
- `data/dbt/profiles.yml` — spatial extension loaded declaratively; `ST_Distance` used in checklist.sql and occurrences.sql
- `data/resolve_taxon_ids.py:83-110` — `check_resolution_gate()` gate function template
- `data/dbt/seeds/occurrence_synonyms.csv` + `data/dbt/seeds/schema.yml` — seed column pattern and registration template
- `data/dbt/models/intermediate/int_synonyms.sql` — LEFT JOIN precedence pattern
- `data/resolve_checklist_names.py:13,230-247` — `rapidfuzz` usage pattern (reference only; D-05 does not use scoring)
- `data/checklist_pipeline.py:183-244` — `_parse_checklist_date()` confirms `date_quality` enum values
- `data/tests/conftest.py:545-565` — session fixture spatial load pattern

### Secondary (verified experimentally)

- DuckDB 1.5.2 `ST_Distance_Sphere` axis-order: verified 2026-06-08 via `duckdb_functions()` documentation string ("using a [latitude, longitude] axis order") + experimental measurement (1 degree lat = ~111,000 m with ST_Point(lat, lon), ~59,000 m with ST_Point(lon, lat))
- DuckDB `GROUP BY + MIN() + COUNT(*) AS collapsed_count` pattern: verified 2026-06-08 in-process test producing correct results

---

## Metadata

**Confidence breakdown:**
- Internal collapse SQL: HIGH — GROUP BY pattern verified experimentally; DuckDB 1.5.2 confirmed
- ST_Distance_Sphere axis order: HIGH — verified experimentally 2026-06-08 with axis-swap test
- Cross-source candidate generation logic: HIGH — grounded in CONTEXT decisions + verified source columns
- Collector normalization: MEDIUM — algorithm is a reasonable interpretation of D-05 but the exact initials rule has [ASSUMED] edge cases
- Test shapes: HIGH — mirrors established conftest.py patterns

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (stable domain; duckdb pinned at <2)

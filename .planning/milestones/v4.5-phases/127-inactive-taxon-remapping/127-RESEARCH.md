# Phase 127: Inactive Taxon Remapping - Research

**Researched:** 2026-05-31
**Domain:** iNat API, dbt seed management, Python pipeline ordering
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Generated remappings go to `data/dbt/seeds/auto_synonyms.csv` — gitignored, regenerated nightly.
- **D-02:** New `int_synonyms` model UNIONs the two seeds: `manual ∪ (auto ANTI JOIN manual ON synonym)`.
- **D-03:** Repoint the 3 existing synonym-JOIN sites from `{{ ref('occurrence_synonyms') }}` to `{{ ref('int_synonyms') }}`: `int_combined.sql` (×2) and `stg_checklist__species.sql` (×1).
- **D-04 (planner must handle):** `auto_synonyms.csv` must always be written with at least a header row so `dbt seed` never fails on a 0-inactive run.
- **D-05:** Inactive inactives hard-fail the build via a new `inactive-gate` step.
- **D-06:** `data/inactive_unresolved.csv` columns: `canonical_name, inactive_taxon_id, inat_name, reason, attempted_at`; `reason ∈ {no_successor, split, successor_not_in_taxa_csv}`.
- **D-07:** Only sanctioned exit is a human adding to `occurrence_synonyms.csv`; no acknowledged-exclusion escape hatch.
- **D-08:** Count policy: exactly 1 successor → auto-remap; 0 or ≥2 → triage.
- **D-09:** Successor name resolved via local `taxa.csv.gz` lookup; absent successor → `successor_not_in_taxa_csv` triage.
- **D-10:** Auto-remap step upserts `lower(successor_name) → successor_taxon_id` into `inaturalist_data.canonical_to_taxon_id` bridge directly.
- **D-11:** New `inactive-remap` + `inactive-gate` steps to be placed in `run.py` STEPS — ordering confirmed by RD-01 (this research).
- **D-12:** Both `auto_synonyms.csv` and `inactive_unresolved.csv` gitignored and overwritten each run; add to `data/.gitignore`.
- **D-13:** Generation logic extends `resolve_taxon_ids.py` (planner's call).

### Claude's Discretion

Step placement and file lifecycle were addressed as D-11–D-13 rather than deferred.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ITR-01 | Pipeline detects canonical names whose resolved iNat taxon ID is inactive; automatically generates remapping entries for those with a known current synonym via `current_synonymous_taxon_ids` | RD-01 ordering confirmed; RD-02 API shape verified; detection query already exists in `resolve_taxon_ids.py` lines 258-273 |
| ITR-02 | Canonical names with inactive taxon IDs and no resolvable current synonym written to `data/inactive_unresolved.csv` | D-06 columns confirmed; `check_resolution_gate()` template for gate step identified |
| ITR-03 | Automated remappings applied via existing synonym JOIN mechanism | 4 JOIN sites identified (3 in CONTEXT.md + 1 additional in `int_species_universe.sql`); `int_synonyms` UNION model pattern established |
| ITR-04 | Manual entries in `occurrence_synonyms.csv` take precedence when same source name appears in both | ANTI JOIN on `synonym` column is the correct SQL idiom; confirmed by D-02 |
</phase_requirements>

---

## Summary

Phase 127 builds a dormant safety net on top of Phase 126's resolution gate. There are currently 0 inactive bee taxa in the bridge (confirmed against `taxa.csv.gz` dated 2026-05-27) and 0 inactive entries in the current `taxa.csv.gz` for the Anthophila subtree. The mechanism activates when iNat deactivates a taxon in the bridge.

The three research dependencies are resolved: (RD-01) the correct STEPS ordering is to place `inactive-remap` and `inactive-gate` after `taxa-download` but before `dbt-build` — the bridge is fully populated at that point and `taxa.csv.gz` is fresh; (RD-02) the iNat API `GET /v1/taxa/{id}` returns `current_synonymous_taxon_ids` as a list of integers for inactive taxa (empty list `[]` for no-successor, single-element list for remappable, multi-element list for splits) and `None` for active taxa; (RD-03) inactive taxa and their successors co-exist in the same monthly `taxa.csv.gz` dump — confirmed with real data.

One previously-unrecorded complication: `int_species_universe.sql` contains a **fourth** `{{ ref('occurrence_synonyms') }}` reference (in the `inat_obs_count_agg` CTE, line 61) that is not mentioned in CONTEXT.md's D-03 list of "3 sites". The planner must repoint this fourth site to `{{ ref('int_synonyms') }}` as well.

**Primary recommendation:** Extend `resolve_taxon_ids.py` (D-13) with a new `generate_inactive_remaps()` function that reuses the existing detection query and `_inat_get_with_retry` pacing, then add `inactive-remap` and `inactive-gate` STEPS in `run.py` immediately after `taxa-download`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Inactivity detection | Python pipeline | — | Bridge + taxa.csv.gz join already lives in `resolve_taxon_ids.py`; extending it is lower-friction than a new module |
| iNat API fetch (successor lookup) | Python pipeline | — | `_inat_get_with_retry` + `_INAT_PACE_SECONDS` already imported here |
| Successor name resolution | Python pipeline (local file) | — | D-09: taxa.csv.gz local lookup, no extra API call |
| Bridge upsert (D-10) | Python pipeline | — | Direct DuckDB UPSERT into `inaturalist_data.canonical_to_taxon_id` |
| Synonym application | dbt (seeds + model) | — | `int_synonyms` UNION model; existing JOIN pattern unchanged |
| Manual precedence (ITR-04) | dbt (`int_synonyms` ANTI JOIN) | — | Declarative SQL; no Python logic needed |
| Triage reporting | Python pipeline | — | `inactive_unresolved.csv` written by `generate_inactive_remaps()` |
| Hard-fail gate | Python pipeline (`inactive-gate` step) | — | Mirrors `check_resolution_gate()` pattern |

---

## RD-01: Pipeline Ordering (RESOLVED)

### Current STEPS ordering (run.py lines 84-107)

```
resolve-taxon-ids  → resolution-gate → taxa-download → taxon-lineage-extended → places-validation → places-load → dbt-build → ...
```

### Key facts

1. **`nightly.sh` pre-pulls `taxa.csv.gz` from S3** (step 1b, before `uv run python run.py`). So `taxa.csv.gz` is available when `run.py` starts, even before `taxa-download` fires. However, this is yesterday's cached copy — `taxa-download` fetches a fresh copy (using ETag conditional GET).

2. **The existing inactive-enumeration block** (lines 258-273 of `resolve_taxon_ids.py`) already reads `raw/taxa.csv.gz` using `WHERE t.active = false`. It runs at the end of `resolve-taxon-ids`, which is before `taxa-download`. This means the existing enumeration runs against the prior day's `taxa.csv.gz` (the one pulled from S3 by `nightly.sh`). This is the "one-night-stale" status quo.

3. **The bridge is fully populated** by the end of `resolve-taxon-ids`: all canonical names have been resolved (or attempted) and the bridge table is complete before `taxa-download` runs.

4. **`taxa-download` is idempotent** — it uses ETag caching and will return 304 if the file hasn't changed. Running `inactive-remap` after it does not cause double-fetch.

### Recommended STEPS ordering

Place `inactive-remap` and `inactive-gate` **after `taxa-download` and before `taxon-lineage-extended`**:

```python
("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
("resolution-gate", check_resolution_gate),
("taxa-download", download_taxa_csv),
("inactive-remap", generate_inactive_remaps),   # NEW — reads fresh taxa.csv.gz
("inactive-gate", check_inactive_gate),          # NEW — hard-fail on blocking rows
("taxon-lineage-extended", load_taxon_lineage_extended),
("places-validation", validate_places_step),
("places-load", load_places_step),
("dbt-build", _run_dbt_build),
...
```

**Why this ordering:**
- Runs against fresh `taxa.csv.gz` (option b from CONTEXT.md), not stale.
- Bridge is fully populated (resolve-taxon-ids has completed).
- The D-10 bridge upsert (successor name → taxon_id) happens before `dbt-build` reads the bridge.
- `taxon-lineage-extended` benefits from the same fresh `taxa.csv.gz`.
- No re-fetch risk (ETag caching in `download_taxa_csv`).

**Consequence for the existing inactive-enumeration block (lines 258-273):** Those lines currently run inside `resolve-taxon-ids` against yesterday's dump. After Phase 127, the authoritative inactive detection moves to `inactive-remap` (which runs against today's dump). The existing reporting lines in `resolve_taxon_ids.py` can either be removed or left as a pre-download diagnostic — the planner should decide whether to remove them to avoid confusion.

[VERIFIED: codebase grep of data/run.py, data/resolve_taxon_ids.py, data/nightly.sh]

---

## RD-02: iNat Taxon-Detail Response Shape (RESOLVED)

**Endpoint:** `GET https://api.inaturalist.org/v1/taxa/{id}`

**Key field:** `current_synonymous_taxon_ids`

### Verified behavior (live API calls, 2026-05-31)

| Scenario | `is_active` | `current_synonymous_taxon_ids` | Type |
|----------|-------------|-------------------------------|------|
| Active taxon (Bombus occidentalis, 82371) | `true` | `null` | `NoneType` |
| Inactive, 0 successors (Bombus terricola, 1622255) | `false` | `[]` | `list` (empty) |
| Inactive, 1 successor (Bombus occidentalis occidentalis, 454867) | `false` | `[82371]` | `list` of int |
| Inactive, 2 successors — split (old Agapostemon texanus, 133797) | `false` | `[1581467, 1581468]` | `list` of 2 ints |

**D-08 implementation pattern:**

```python
resp = _inat_get_with_retry(f"https://api.inaturalist.org/v1/taxa/{taxon_id}", params={}, timeout=30)
taxon = resp.json()["results"][0]
successor_ids = taxon.get("current_synonymous_taxon_ids") or []  # normalize None → []
if len(successor_ids) == 1:
    # auto-remap path
elif len(successor_ids) == 0:
    reason = "no_successor"
    # triage
else:
    reason = "split"
    # triage
```

**Note:** `or []` handles both `None` (active taxa) and `[]` (inactive with no successor) identically — both map to triage via `len == 0`. This is correct because the auto-remap step only reaches inactive taxa (confirmed by the detection query), so `None` will never appear in practice.

**Verified with live API.** [VERIFIED: direct API calls to api.inaturalist.org/v1/taxa/{id}]

---

## RD-03: taxa.csv.gz Successor Coverage (RESOLVED)

### Verified finding

Both the **inactive taxon AND its active successor** appear in the same monthly `taxa.csv.gz` dump. Tested with two real cases:

| Case | Inactive taxon | Active successor | Both in taxa.csv.gz? |
|------|---------------|-----------------|----------------------|
| 1-successor | 454867 (Bombus occ. occ.) | 82371 (Bombus occidentalis) | **Yes** |
| 2-successor split | 133797 (old Agapostemon texanus) | 1581467, 1581468 | **Yes** |

### Staleness window

`taxa.csv.gz` is a **monthly snapshot** from iNaturalist's AWS S3 open data bucket (updated monthly per [iNaturalist open data README](https://github.com/inaturalist/inaturalist-open-data/blob/main/README.md)). The nightly pipeline downloads it with ETag caching — it updates only when iNat publishes a new monthly release.

**Consequence:** If iNat deactivates a taxon and creates a successor between two monthly releases, the successor taxon_id will not appear in `taxa.csv.gz` until the next monthly snapshot. The `inactive-remap` step will hit the `successor_not_in_taxa_csv` triage path for this window (0–30 days). This is the correct behavior per D-09.

**The `successor_not_in_taxa_csv` triage path is NOT a malfunction** — it is a correct detection of genuine data latency. The human operator resolves it by adding a manual `occurrence_synonyms.csv` entry, or by waiting for the next monthly `taxa.csv.gz` release.

[VERIFIED: direct DuckDB queries against local taxa.csv.gz dated 2026-05-27]

---

## Standard Stack

No new packages are required. Phase 127 reuses existing infrastructure:

| Asset | Location | Reuse Purpose |
|-------|----------|---------------|
| `_inat_get_with_retry` | `inaturalist_pipeline.py` | Paced/retried API calls (imported into `resolve_taxon_ids.py`) |
| `_INAT_PACE_SECONDS` | `inaturalist_pipeline.py` | 1.0s floor between API calls |
| `duckdb` | already in pyproject.toml | Bridge UPSERT, inactive detection query |
| `csv` (stdlib) | already imported | Writing `auto_synonyms.csv` and `inactive_unresolved.csv` |
| `dbt-duckdb==1.10.1` | already in pyproject.toml dev | `dbt seed` for `auto_synonyms.csv` |

### Package Legitimacy Audit

No new packages recommended. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
resolve-taxon-ids (bridge fully populated)
        |
        v
resolution-gate (hard-fail on unresolved bees)
        |
        v
taxa-download (fresh taxa.csv.gz via ETag)
        |
        v
inactive-remap [NEW]
  bridge LEFT JOIN taxa.csv.gz WHERE active = false
      for each inactive row:
          GET /v1/taxa/{inactive_id}
          if len(successor_ids) == 1:
              lookup successor_name in taxa.csv.gz
              if found: write row to auto_synonyms.csv
                        UPSERT lower(name)→taxon_id into bridge (D-10)
              if absent: write row to inactive_unresolved.csv (successor_not_in_taxa_csv)
          else:
              write row to inactive_unresolved.csv (no_successor or split)
        |
        v
inactive-gate [NEW]
  read inactive_unresolved.csv
  if any rows: sys.exit(actionable message)
        |
        v
taxon-lineage-extended
        |
        v
dbt-build
  seeds: occurrence_synonyms.csv + auto_synonyms.csv
  int_synonyms: manual UNION (auto ANTI JOIN manual ON synonym)
  int_combined (×2), stg_checklist__species (×1), int_species_universe (×1)
      repointed to ref('int_synonyms')
        |
        v
[downstream steps unchanged]
```

### Recommended Project Structure (additions only)

```
data/
├── resolve_taxon_ids.py          # extend with generate_inactive_remaps(), check_inactive_gate()
├── run.py                        # add inactive-remap + inactive-gate STEPS
├── inactive_unresolved.csv       # gitignored, overwritten nightly (new)
├── .gitignore                    # add: inactive_unresolved.csv, dbt/seeds/auto_synonyms.csv
└── dbt/
    ├── seeds/
    │   ├── occurrence_synonyms.csv   # existing (manual, committed)
    │   ├── auto_synonyms.csv         # gitignored, overwritten nightly (new)
    │   └── schema.yml                # add auto_synonyms registration
    └── models/
        └── intermediate/
            └── int_synonyms.sql      # new UNION model
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paced iNat API calls | Custom retry loop | `_inat_get_with_retry` + `_INAT_PACE_SECONDS` | Already handles 429/5xx + Retry-After header |
| Bridge write | Ad-hoc INSERT | Existing `ON CONFLICT DO UPDATE` UPSERT pattern from `_resolve_one` | Idempotent; handles repeated runs |
| Gate function | Custom CSV reader + sys.exit | Mirror `check_resolution_gate()` exactly | Proven pattern; consistent error messages |
| Synonym precedence | Python dict merge | dbt ANTI JOIN in SQL | Declarative, testable, DAG-correct |

---

## Reusable Surface in `resolve_taxon_ids.py`

The planner and implementer need these exact assets:

### `_inat_get_with_retry` + `_INAT_PACE_SECONDS`

```python
# Imported at top of resolve_taxon_ids.py:
from inaturalist_pipeline import _inat_get_with_retry, _INAT_PACE_SECONDS

# Usage pattern for taxon-detail (GET /v1/taxa/{id}):
time.sleep(_INAT_PACE_SECONDS)
resp = _inat_get_with_retry(
    f"https://api.inaturalist.org/v1/taxa/{inactive_taxon_id}",
    params={},
    timeout=30,
)
taxon = resp.json()["results"][0]
```

The `params={}` is required (function signature: `url, params, *, timeout`). [VERIFIED: codebase]

### Inactive-enumeration query (lines 258-266)

```python
taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")
inactive = con.execute(f"""
    SELECT b.canonical_name, b.taxon_id, t.name AS inat_name, t.active
    FROM inaturalist_data.canonical_to_taxon_id b
    LEFT JOIN read_csv('{taxa_path}', header=True) t
        ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
    WHERE t.active = false
    ORDER BY b.canonical_name
""").fetchall()
```

Note: `read_csv` with `header=True` only (no explicit `columns=`) causes DuckDB to auto-infer types; `active` becomes `BOOLEAN` and `WHERE t.active = false` works. [VERIFIED: DuckDB query in session]

### Successor name lookup in taxa.csv.gz

```python
# After establishing successor_taxon_id from current_synonymous_taxon_ids[0]:
taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")
row = con.execute(f"""
    SELECT name FROM read_csv('{taxa_path}', header=True)
    WHERE CAST(taxon_id AS INTEGER) = ?
      AND active = true
""", [successor_taxon_id]).fetchone()
if row is None:
    reason = "successor_not_in_taxa_csv"
    # → triage
else:
    successor_name = row[0].lower().strip()
```

### Bridge UPSERT (D-10) — mirrors `_resolve_one` lines 217-227

```python
con.execute("""
    INSERT INTO inaturalist_data.canonical_to_taxon_id
        (canonical_name, taxon_id, resolved_at, source)
    VALUES (?, ?, current_timestamp, ?)
    ON CONFLICT (canonical_name) DO UPDATE SET
        taxon_id = EXCLUDED.taxon_id,
        resolved_at = EXCLUDED.resolved_at,
        source = EXCLUDED.source
""", [lower_successor_name, successor_taxon_id, f"inat-inactive-remap:{inactive_taxon_id}"])
```

### `check_resolution_gate()` template (exact mirror for `check_inactive_gate`)

```python
# data/resolve_taxon_ids.py lines 30-53 — the pattern to copy:
def check_inactive_gate() -> None:
    import sys
    rows = list(csv.DictReader(INACTIVE_UNRESOLVED_CSV.open(newline="")))
    if rows:
        names = ", ".join(r["canonical_name"] for r in rows)
        sys.exit(
            f"inactive-gate: {len(rows)} inactive taxon ID(s) with no auto-resolution. "
            f"Fix by adding entries to occurrence_synonyms.csv\n"
            f"Offenders: {names}"
        )
    print(f"inactive-gate: OK (0 unresolved inactive taxa)")
```

[VERIFIED: codebase]

---

## dbt Seed Registration and JOIN Shape

### Registering `auto_synonyms.csv` in `schema.yml`

`data/dbt/seeds/schema.yml` currently has one seed (`occurrence_synonyms`). Add a new entry with identical column types:

```yaml
  - name: auto_synonyms
    columns:
      - name: synonym
        data_tests:
          - not_null
          - unique
      - name: accepted_name
        data_tests:
          - not_null
      - name: source
        description: "Auto-generated: 'inat-inactive-remap:{inactive_taxon_id}'"
```

Also add to `dbt_project.yml` seeds section:

```yaml
seeds:
  beeatlas:
    occurrence_synonyms:
      +column_types:
        synonym: varchar
        accepted_name: varchar
        source: varchar
    auto_synonyms:
      +column_types:
        synonym: varchar
        accepted_name: varchar
        source: varchar
```

[VERIFIED: codebase — `data/dbt/seeds/schema.yml` and `data/dbt/dbt_project.yml`]

### Empty seed behavior (D-04)

When `auto_synonyms.csv` contains only a header row (the 0-inactive case), `dbt seed` creates an empty table with 0 rows. The `int_synonyms` UNION then produces exactly the rows from `occurrence_synonyms` (manual only). This is correct and verified as standard dbt behavior for header-only CSVs. [ASSUMED — based on dbt documentation; not tested live in this session]

### The `int_synonyms` UNION model (D-02)

```sql
-- data/dbt/models/intermediate/int_synonyms.sql
-- Manual entries take precedence over auto entries when synonym matches (ITR-04).
-- Anti-join on synonym column: manual wins by exclusion of matching auto rows.
{{ config(materialized='view') }}

SELECT synonym, accepted_name, source FROM {{ ref('occurrence_synonyms') }}
UNION ALL
SELECT a.synonym, a.accepted_name, a.source
FROM {{ ref('auto_synonyms') }} a
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = a.synonym
WHERE m.synonym IS NULL
```

### The 4 repoint sites (not 3 as stated in CONTEXT.md D-03)

CONTEXT.md lists 3 synonym-JOIN sites, but there are **4**:

| File | Line | Alias | Pattern |
|------|------|-------|---------|
| `int_combined.sql` | 53 | `syn_e` | `LEFT JOIN {{ ref('occurrence_synonyms') }} syn_e ON syn_e.synonym = e.canonical_name` |
| `int_combined.sql` | 169 | `syn_io` | `LEFT JOIN {{ ref('occurrence_synonyms') }} syn_io ON syn_io.synonym = io.canonical_name` |
| `stg_checklist__species.sql` | 31 | `syn` | `LEFT JOIN {{ ref('occurrence_synonyms') }} syn ON syn.synonym = s.canonical_name` |
| `int_species_universe.sql` | 61 | `syn` | `LEFT JOIN {{ ref('occurrence_synonyms') }} syn ON syn.synonym = io.canonical_name` (inside `inat_obs_count_agg` CTE) |

**All 4 must be repointed** to `{{ ref('int_synonyms') }}`. The JOIN shape (`syn.synonym = <arm>.canonical_name`, `COALESCE(syn.accepted_name, ...)`) is identical at all sites — only the ref source changes. [VERIFIED: `grep -rn occurrence_synonyms data/dbt/models/`]

---

## Common Pitfalls

### Pitfall 1: Missing fourth synonym-JOIN site

**What goes wrong:** CONTEXT.md lists 3 repoint sites; the planner or implementer repoints only 3 and misses `int_species_universe.sql` line 61. Result: `inat_obs_count` in `species.parquet` doesn't apply auto-remappings, causing species-level count discrepancies when an inactive taxon eventually fires.

**Root cause:** The CONTEXT.md was written during discussion-phase scouting that found the 3 most obvious sites; the fourth is in a CTE inside a different intermediate model.

**How to avoid:** Repoint ALL occurrences — confirmed by `grep -rn "occurrence_synonyms" data/dbt/models/` returning 4 lines. [VERIFIED: grep in session]

### Pitfall 2: `active` column type mismatch

**What goes wrong:** `load_taxon_lineage_extended` uses `columns={'active':'VARCHAR'}` and compares `WHERE active = 'true'`. The new `inactive-remap` code must NOT use `columns=` for `active` — it must let DuckDB auto-infer so `active` becomes `BOOLEAN` and `WHERE t.active = false` works. Mixing approaches (VARCHAR vs BOOLEAN) causes silent 0-result queries.

**Root cause:** Two different call sites use taxa.csv.gz with different schema specifications.

**How to avoid:** The existing inactive-enumeration block (lines 258-266) uses `header=True` only (no `columns=`) and works correctly. Copy that pattern exactly for the new code. [VERIFIED: DuckDB query in session confirmed BOOLEAN auto-inference]

### Pitfall 3: `current_synonymous_taxon_ids` is `None` for active taxa

**What goes wrong:** If the detection query somehow passes an active taxon_id to the API fetch, `taxon.get("current_synonymous_taxon_ids")` returns `None`, not `[]`. The `len()` call on `None` raises `TypeError`.

**Root cause:** `None` vs empty list distinction in the API response.

**How to avoid:** Always normalize with `or []`: `successor_ids = taxon.get("current_synonymous_taxon_ids") or []`. [VERIFIED: live API call to active taxon 82371]

### Pitfall 4: Test fixture missing `dbt_sandbox.occurrence_synonyms`

**What goes wrong:** The existing `resolver_db` fixture in `test_resolve_taxon_ids.py` does not create `dbt_sandbox` schema or `occurrence_synonyms` table. Any test that calls `resolve_taxon_ids()` (which calls `_names_to_resolve`) will fail with `CatalogException: schema "dbt_sandbox" does not exist`. This is a pre-existing failure in the test suite — 16 tests in `test_resolve_taxon_ids.py` currently fail for this reason.

**Root cause:** The `_names_to_resolve` SQL includes `SELECT DISTINCT accepted_name FROM dbt_sandbox.occurrence_synonyms`.

**How to avoid:** The new `generate_inactive_remaps()` test fixture must either (a) create `dbt_sandbox` schema + `occurrence_synonyms` table, or (b) not call the full `resolve_taxon_ids()` function — instead test `generate_inactive_remaps()` in isolation with a bridge that already has inactive rows pre-seeded. Option (b) is simpler and more unit-testable. [VERIFIED: running tests in session]

### Pitfall 5: `auto_synonyms.csv` gitignore path

**What goes wrong:** `data/.gitignore` entry `auto_synonyms.csv` would not match the file at `data/dbt/seeds/auto_synonyms.csv`. The file must be committed (breaking nightly idempotence) or fails to load in dbt.

**How to avoid:** The gitignore entry must be `dbt/seeds/auto_synonyms.csv` (relative to `data/.gitignore`'s location in `data/`). [VERIFIED: codebase — `data/.gitignore` already uses path-relative entries like `raw/taxa.csv.gz`]

### Pitfall 6: `_inat_get_with_retry` requires `params=` keyword argument

**What goes wrong:** Calling `_inat_get_with_retry(url, timeout=30)` fails — the function signature is `(url, params, *, timeout)` where `params` is positional.

**How to avoid:** Always call with `params={}` for the taxon-detail endpoint: `_inat_get_with_retry(url, params={}, timeout=30)`. [VERIFIED: `data/inaturalist_pipeline.py` lines 22-49]

### Pitfall 7: Monthly taxa.csv.gz lag is not a bug

**What goes wrong:** A planner designs the `successor_not_in_taxa_csv` path as an error rather than a triage trigger. When a successor is genuinely absent from the current monthly snapshot, the build fails permanently until the file is updated — but the code has no way to force a new snapshot.

**How to avoid:** `successor_not_in_taxa_csv` is a valid triage reason, not an error. The human operator should either wait for the next monthly release OR add a manual `occurrence_synonyms.csv` entry. The gate holds the build until one of these happens. Document the reason string clearly in `inactive_unresolved.csv`. [VERIFIED: iNat open data README monthly cadence]

---

## Code Examples

### Full `generate_inactive_remaps()` skeleton

```python
# Source: synthesized from existing patterns in resolve_taxon_ids.py + verified API shape

AUTO_SYNONYMS_CSV = Path(__file__).parent / "dbt/seeds/auto_synonyms.csv"
INACTIVE_UNRESOLVED_CSV = Path(__file__).parent / "inactive_unresolved.csv"
INAT_TAXA_ID_URL = "https://api.inaturalist.org/v1/taxa/{}"


def generate_inactive_remaps() -> None:
    """Detect inactive bridge taxon IDs, auto-remap 1-successor cases.

    - Reads bridge LEFT JOIN taxa.csv.gz WHERE active = false
    - For each inactive taxon: GET /v1/taxa/{id} for current_synonymous_taxon_ids
    - Exactly 1 successor: lookup name in taxa.csv.gz; write to auto_synonyms.csv
      + UPSERT bridge (D-10)
    - 0 or >=2 successors: write to inactive_unresolved.csv (triage)
    Always writes auto_synonyms.csv with at least a header row (D-04).
    """
    con = duckdb.connect(DB_PATH)
    taxa_path = str(Path(__file__).parent / "raw/taxa.csv.gz")
    try:
        inactive = con.execute(f"""
            SELECT b.canonical_name, b.taxon_id, t.name AS inat_name
            FROM inaturalist_data.canonical_to_taxon_id b
            LEFT JOIN read_csv('{taxa_path}', header=True) t
                ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
            WHERE t.active = false
            ORDER BY b.canonical_name
        """).fetchall()

        auto_rows: list[tuple[str, str, str]] = []  # (synonym, accepted_name, source)
        triage_rows: list[dict] = []

        for canonical_name, inactive_taxon_id, inat_name in inactive:
            time.sleep(_INAT_PACE_SECONDS)
            try:
                resp = _inat_get_with_retry(
                    INAT_TAXA_ID_URL.format(inactive_taxon_id),
                    params={},
                    timeout=30,
                )
            except requests.HTTPError:
                triage_rows.append({...})
                continue

            results = resp.json().get("results", [])
            if not results:
                triage_rows.append({...})
                continue

            successor_ids = results[0].get("current_synonymous_taxon_ids") or []

            if len(successor_ids) == 1:
                # Local name lookup
                row = con.execute(f"""
                    SELECT name FROM read_csv('{taxa_path}', header=True)
                    WHERE CAST(taxon_id AS INTEGER) = ?
                      AND active = true
                """, [successor_ids[0]]).fetchone()

                if row is None:
                    triage_rows.append({"reason": "successor_not_in_taxa_csv", ...})
                    continue

                successor_name = row[0].lower().strip()
                source = f"inat-inactive-remap:{inactive_taxon_id}"
                auto_rows.append((canonical_name, successor_name, source))
                # D-10: upsert successor name → taxon_id into bridge
                con.execute("""
                    INSERT INTO inaturalist_data.canonical_to_taxon_id
                        (canonical_name, taxon_id, resolved_at, source)
                    VALUES (?, ?, current_timestamp, ?)
                    ON CONFLICT (canonical_name) DO UPDATE SET
                        taxon_id = EXCLUDED.taxon_id,
                        resolved_at = EXCLUDED.resolved_at,
                        source = EXCLUDED.source
                """, [successor_name, successor_ids[0], source])

            else:
                reason = "no_successor" if len(successor_ids) == 0 else "split"
                triage_rows.append({"reason": reason, ...})

        # D-04: always write header, even when auto_rows is empty
        with AUTO_SYNONYMS_CSV.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["synonym", "accepted_name", "source"])
            writer.writerows(auto_rows)

        with INACTIVE_UNRESOLVED_CSV.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "canonical_name", "inactive_taxon_id", "inat_name",
                "reason", "attempted_at"
            ])
            writer.writeheader()
            writer.writerows(triage_rows)

        print(f"inactive-remap: {len(auto_rows)} auto-remapped, "
              f"{len(triage_rows)} unresolved")
    finally:
        con.close()
```

---

## 0-Inactive-Today Reality and dbt Seed Behavior (D-04)

There are currently 0 inactive bee taxa in the bridge (confirmed 2026-05-31 against both the live bridge and `taxa.csv.gz`). The mechanism is dormant.

### Header-only CSV in dbt seed

A header-only `auto_synonyms.csv`:
```
synonym,accepted_name,source
```
creates a 0-row table `dbt_sandbox.auto_synonyms` in DuckDB. The `int_synonyms` UNION query then returns only manual rows. All downstream JOINs (`LEFT JOIN {{ ref('int_synonyms') }}`) match nothing and fall through to `COALESCE(..., canonical_name)`, preserving existing behavior exactly. [ASSUMED — standard dbt behavior; not tested live]

### File must exist at `dbt build` time

`dbt seed` requires the file to exist. The generation step (`inactive-remap`) always writes `auto_synonyms.csv` before `dbt-build` runs (by ordering in STEPS). On fresh checkout / local dev: `uv run python run.py` runs all steps in order; `inactive-remap` writes the file before `dbt-build`. No special handling needed beyond the always-write-header guarantee. [VERIFIED: STEPS ordering, file path analysis]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 (from `data/pyproject.toml`) |
| Config | `[tool.pytest.ini_options] testpaths = ["tests"]` in `data/pyproject.toml` |
| Quick run command | `cd data && uv run pytest tests/test_inactive_remap.py -x` |
| Full suite command | `cd data && uv run pytest tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ITR-01 (auto-remap) | 1-successor inactive → auto_synonyms.csv row + bridge upsert | unit | `uv run pytest tests/test_inactive_remap.py::test_single_successor_writes_auto_synonyms -x` | Wave 0 |
| ITR-01 (detection) | 0 inactive taxa → auto_synonyms.csv with header only | unit | `uv run pytest tests/test_inactive_remap.py::test_zero_inactive_writes_header_only -x` | Wave 0 |
| ITR-02 (no-successor) | 0 successors → inactive_unresolved.csv with reason=no_successor | unit | `uv run pytest tests/test_inactive_remap.py::test_zero_successors_writes_triage -x` | Wave 0 |
| ITR-02 (split) | 2 successors → inactive_unresolved.csv with reason=split | unit | `uv run pytest tests/test_inactive_remap.py::test_split_writes_triage -x` | Wave 0 |
| ITR-02 (gate blocks) | inactive_unresolved.csv rows → gate sys.exit with names | unit | `uv run pytest tests/test_inactive_remap.py::test_inactive_gate_blocks -x` | Wave 0 |
| ITR-02 (gate passes) | empty inactive_unresolved.csv → gate OK | unit | `uv run pytest tests/test_inactive_remap.py::test_inactive_gate_passes_empty -x` | Wave 0 |
| ITR-02 (successor absent) | successor not in taxa.csv.gz → reason=successor_not_in_taxa_csv | unit | `uv run pytest tests/test_inactive_remap.py::test_successor_not_in_taxa_csv -x` | Wave 0 |
| ITR-03 | int_synonyms UNION produces correct rows | dbt/SQL | manual-only (requires dbt build) | N/A |
| ITR-04 | manual entry takes precedence over auto when synonym matches | unit (SQL test) | manual-only (requires dbt build) | N/A |

### Test Fixture Strategy (no live inactive taxa available)

The tests cannot use real inactive taxa because the bridge currently has 0 inactive entries. The test pattern is:

1. **Synthetic bridge + synthetic taxa.csv.gz**: Pre-seed the bridge with a fake taxon_id that is marked `active=false` in a synthetic gzip TSV (following `MINI_TAXA_TSV` pattern from `test_taxa_pipeline.py`).
2. **Mock `requests.get`** at the `inaturalist_pipeline.requests.get` boundary (Pattern D from existing tests) — NOT patching `_inat_get_with_retry` directly.
3. **Mock response shapes**: Use the verified real shapes: `{"results": [{"current_synonymous_taxon_ids": [12345]}]}` for 1-successor, `[]` for no-successor, `[id1, id2]` for split.
4. **Monkeypatch `_INAT_PACE_SECONDS` to 0.0** (standard pattern from existing fixtures).
5. **Monkeypatch file paths** to `tmp_path` (following `resolver_db` fixture pattern).

Example fixture:

```python
MINI_TAXA_TSV_WITH_INACTIVE = (
    "taxon_id\tancestry\trank_level\trank\tname\tactive\n"
    # Active successor
    "99001\t48460/1/.../630955\t10\tspecies\tBombus newspecies\ttrue\n"
    # Inactive predecessor (in bridge)
    "99000\t48460/1/.../630955\t10\tspecies\tBombus oldspecies\tfalse\n"
)
```

The bridge fixture pre-seeds `lower('bombus oldspecies') → taxon_id=99000` so the inactive detection query finds it.

### Sampling Rate

- **Per task commit:** `cd data && uv run pytest tests/test_inactive_remap.py -x`
- **Per wave merge:** `cd data && uv run pytest tests/ -x --ignore=tests/test_dbt_synonymy.py --ignore=tests/test_dbt_diff.py`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- `data/tests/test_inactive_remap.py` — all ITR-01/ITR-02 unit tests
- No new conftest fixtures required (existing patterns + `tmp_path` + monkeypatch suffice)

---

## Open Questions (RESOLVED)

1. **Should the existing inactive-enumeration/reporting block (lines 258-273 in `resolve_taxon_ids.py`) be removed or retained?**
   - What we know: After Phase 127, `inactive-remap` is authoritative for inactive detection. The existing block runs against yesterday's `taxa.csv.gz` (before `taxa-download`), so it's slightly stale compared to the new step.
   - What's unclear: Whether keeping it provides useful pre-download diagnostic output or causes confusion by reporting 0 inactives before `inactive-remap` can run.
   - Recommendation: Remove lines 258-273 from `resolve_taxon_ids.py` as part of Phase 127 to avoid confusion. The `inactive-remap` step will print its own summary line.

2. **Should `_names_to_resolve` in `resolve_taxon_ids.py` be updated to also include accepted_names from `auto_synonyms`?**
   - What we know: `_names_to_resolve` currently includes `dbt_sandbox.occurrence_synonyms` accepted_names so they get bridge entries. D-10 upserts successor names into the bridge directly, so they're covered. But `dbt_sandbox.auto_synonyms` won't exist when `resolve-taxon-ids` runs (it runs before `inactive-remap`).
   - Recommendation: No change needed. D-10's direct UPSERT into the bridge covers successor names. No circular dependency.

3. **The pre-existing 16 test failures in `test_resolve_taxon_ids.py` (dbt_sandbox not set up in resolver_db fixture).**
   - What we know: These failures existed before Phase 127. They block full test runs.
   - Recommendation: Fix the `resolver_db` fixture to create `dbt_sandbox.occurrence_synonyms` with correct schema. Include this as a task in Phase 127's plan (low effort, high value for test hygiene). Or explicitly document as out-of-scope and use `--ignore` in test commands.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.14+ | data/ pipeline | `uv` manages it | 3.14 (per pyproject.toml constraint) | — |
| duckdb | bridge queries | ✓ | >=1.4,<2 (pyproject.toml) | — |
| requests | iNat API calls | ✓ | (pyproject.toml) | — |
| dbt-duckdb | dbt build | ✓ | 1.10.1 (pinned) | — |
| taxa.csv.gz | inactive detection | ✓ | dated 2026-05-27 | Skipped if absent (nightly.sh always pre-pulls) |
| iNat API | successor lookup | ✓ (live) | v1 | None — `api_error` triage path handles HTTP failures |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual synonym tracking only | Auto-remap + manual precedence via dbt UNION | Phase 127 | Dormant mechanism; activates when iNat deactivates a taxon |
| Inactive enumeration as debug-print only | Inactive enumeration as actionable remap trigger | Phase 127 | Hard-fails build instead of logging |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Header-only `auto_synonyms.csv` creates a 0-row dbt seed table (not an error) | D-04, dbt seed behavior | If dbt errors on empty seeds, Wave 0 must add a dummy row or different handling |
| A2 | `dbt build` includes seed loading automatically (no separate `dbt seed` step needed) | Architecture | If not, `_run_dbt_build` in `run.py` needs to invoke `dbt seed` separately before `dbt build` |
| A3 | Standard dbt behavior for empty seed: downstream `LEFT JOIN` returns no matches (not an error) | `int_synonyms` model | If dbt materializes an error for a 0-row seed with `unique` test, the test config needs adjustment |

---

## Sources

### Primary (HIGH confidence)

- `data/run.py` (STEPS list, lines 84-107) — pipeline ordering [VERIFIED: codebase]
- `data/resolve_taxon_ids.py` (lines 258-273, 171-227, 30-53) — detection query, bridge UPSERT, gate template [VERIFIED: codebase]
- `data/nightly.sh` (taxa.csv.gz S3 pull order, step 1b) — confirms pre-pipeline pull [VERIFIED: codebase]
- `data/taxa_pipeline.py` (`download_taxa_csv`, ETag caching) — confirms idempotent download [VERIFIED: codebase]
- `data/inaturalist_pipeline.py` (lines 17-49) — `_inat_get_with_retry`, `_INAT_PACE_SECONDS` signatures [VERIFIED: codebase]
- Live iNat API calls to `/v1/taxa/{id}` for taxon IDs 1622255, 454867, 133797, 82371 — confirmed `current_synonymous_taxon_ids` type and values [VERIFIED: live API, 2026-05-31]
- DuckDB query against `data/raw/taxa.csv.gz` (dated 2026-05-27) — confirmed 0 inactive bee taxa, confirmed successor co-presence [VERIFIED: DuckDB query in session]
- `grep -rn "occurrence_synonyms" data/dbt/models/` — confirmed 4 JOIN sites [VERIFIED: codebase]
- `data/dbt/seeds/schema.yml`, `data/dbt/dbt_project.yml` — seed registration format [VERIFIED: codebase]
- `data/tests/test_resolve_taxon_ids.py`, `data/tests/test_resolution_gate.py` — test patterns [VERIFIED: codebase]

### Secondary (MEDIUM confidence)

- [iNaturalist open data README](https://github.com/inaturalist/inaturalist-open-data/blob/main/README.md) — monthly snapshot cadence [CITED]
- [pyinaturalist Taxon model docs](https://pyinaturalist.readthedocs.io/en/stable/modules/pyinaturalist.models.Taxon.html) — `current_synonymous_taxon_ids` type as `Array[int]` [CITED]

### Tertiary (LOW confidence)

- dbt seed behavior with header-only CSV: creates 0-row table, no error — [ASSUMED, not tested live]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reuse verified in codebase
- Architecture: HIGH — ordering verified against nightly.sh + run.py; API shape verified live
- Pitfalls: HIGH — most confirmed via live code and API testing; pitfall 4 confirmed by running tests
- RD-01 (ordering): HIGH — full read of nightly.sh + run.py + taxa_pipeline.py
- RD-02 (API shape): HIGH — live API calls with real taxa IDs
- RD-03 (successor coverage): HIGH — DuckDB queries against local taxa.csv.gz

**Research date:** 2026-05-31
**Valid until:** 2026-08-31 (API shape stable; monthly cadence unlikely to change)

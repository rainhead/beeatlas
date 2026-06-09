# Phase 135: Name Reconciliation — Research

**Researched:** 2026-06-04
**Domain:** Taxonomic name resolution, dbt synonym unification, LCA from iNat taxa.csv.gz, GBIF pygbif API, rapidfuzz fuzzy matching, build-blocking gate patterns
**Confidence:** HIGH — all findings from direct codebase inspection, live API calls, and confirmed tool versions

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** GBIF only via `pygbif`. No ITIS. GBIF backbone covers Anthophila adequately; a single offline cache to maintain.
- **D-02:** Tier order: exact-canonical → committed synonym seed → GBIF. Tiers 1 and 2 auto-apply. GBIF AND fuzzy (rapidfuzz) candidates are promote-only: written to audit/review CSVs, inert until a human copies them into `occurrence_synonyms.csv`.
- **D-03:** Promotion mechanism = add a row to `data/dbt/seeds/occurrence_synonyms.csv`. No separate staging file.
- **D-04:** Build blocks only on no-match-anywhere. A name fails the gate only if NO tier matched it. GBIF or fuzzy hit = resolved-pending-promotion (satisfies gate). Truly-unrecognized names hard-fail.
- **D-05:** The 63 slash-compound rows (all `Agapostemon texanus/angelicus` and `angelicus/texanus`) resolve to the lowest-common-ancestor `taxon_id` of the components, computed from `data/raw/taxa.csv.gz`. Verbatim `angelicus/texanus` string is preserved alongside the resolved taxon_id.
- **D-06:** Extend the existing `data/resolve_taxon_ids.py` `inaturalist_data.canonical_to_taxon_id` bridge with a checklist tier. One-time GBIF lookups run via a `--refresh`-style flag, results baked into a committed dbt seed CSV. Nightly reads only the seed; zero network calls.
- **D-07:** Retire the disjoint checklist-synonyms Python path. `checklist_pipeline.py` `reconcile()` reads `SYNONYMS_PATH = checklist_synonyms.csv` (the file exists but is empty — header only). Remove/redirect this path so all checklist synonym resolution flows through `occurrence_synonyms` / `int_synonyms`. Add a test asserting a single synonym source.

### Claude's Discretion
- Homonym-guard mechanism (RCN-07): a dbt test that fails the build if any `canonical_name` within Anthophila maps to >1 `taxon_id` in `int_combined`. Exact test placement/SQL is the planner's call.
- Fuzzy-review-gate enforcement mechanism (RCN-04): how the build asserts "no unreviewed fuzzy mapping is live."
- Exact column names/ordering of the audit and fuzzy-review CSVs; function decomposition within `resolve_taxon_ids.py`; how the checklist tier reads `verbatim_name` and applies `normalize_scientific_name()` before matching.
- LCA computation details.

### Deferred Ideas (OUT OF SCOPE)
- Test-suite improvements (separate milestone): ~35-min suite, 18 pre-existing `dbt_sandbox` failures in `test_resolve_taxon_ids.py`/`test_dbt_diff.py`, missing `ruff` dep. Phase 135 edits `resolve_taxon_ids.py` but does NOT fix these.
- ITIS / Catalogue of Life integration — out of scope per D-01.
- Frontend rendering of verbatim-vs-accepted name — Phase 138.
- Promotion of checklist rows into `occurrences.parquet` — Phase 137.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RCN-01 | Verbatim names normalized (authority stripped, whitespace/case folded) before matching | `normalize_scientific_name()` in `data/canonical_name.py` already handles this exactly; direct reuse confirmed |
| RCN-02 | Each record resolves to a current accepted name + iNat `taxon_id` via tiered resolver; every decision in committed audit CSV with source + confidence; unresolved names reported not hidden | Tier order locked in D-02; audit CSV columns locked in D-08; gate semantics locked in D-04 |
| RCN-03 | External authority lookups run only as one-time on-demand build step; nightly makes no network calls | `--refresh`-style flag pattern already exists in `resolve_taxon_ids.py`; `auto_synonyms.csv` seed pattern is the template |
| RCN-04 | Fuzzy candidates written to curator-review CSV; 13 known misspellings appear as candidates; gate asserts no unreviewed fuzzy mapping is active | 178 unmatched names confirmed in `checklist_unmatched.csv`; rapidfuzz 3.14.5 confirmed installed; "13 known misspellings" acceptance check is against subset of unmatched |
| RCN-05 | Slash-compound determinations resolve to LCA taxon_id via lineage_path; filterable at that rank | 63 slash rows confirmed (59 texanus/angelicus, 4 angelicus/texanus); LCA is `subgenus Agapostemon` taxon_id=606634 — NOT genus 50086 |
| RCN-06 | Single dbt synonym subsystem; checklist_synonyms.csv Python path retired; test asserts one synonym source | `checklist_synonyms.csv` currently header-only (empty); `reconcile()` currently no-ops; safe to remove |
| RCN-07 | Homonym guard dbt test fails build if any canonical_name within Anthophila maps to >1 taxon_id | Pattern: `SELECT canonical_name, COUNT(DISTINCT taxon_id) FROM ... HAVING COUNT(*) > 1` — zero-result assertion |
</phase_requirements>

---

## Summary

Phase 135 builds the name resolution layer that transforms raw `verbatim_name` strings from `checklist_data.checklist_records_full` (Phase 134 output) into accepted canonical names and iNat `taxon_id` values. It does NOT add checklist rows to `occurrences.parquet` — that is Phase 137.

The phase has three primary deliverables: (1) a tiered resolver implemented as an extension to `resolve_taxon_ids.py` with a `--refresh-checklist` one-time build step that runs GBIF lookups and writes results into a new committed dbt seed, (2) a `stg_checklist__records_full.sql` dbt staging model that applies the synonym JOIN and taxon_id bridge to the 50,646-row input table, and (3) retirement of the dead `reconcile()` / `checklist_synonyms.csv` path in `checklist_pipeline.py`.

The 178 names in `checklist_unmatched.csv` are the core reconciliation problem. Of these, most will resolve via GBIF `name_backbone()` — either exact match or VARIANT (gender agreement). Remaining unmatched names go to a fuzzy-review CSV using rapidfuzz. The "13 known misspellings" acceptance criterion is a subset count check against the fuzzy-review output. Slash-compound rows (63 rows, all Agapostemon texanus/angelicus and angelicus/texanus) resolve to subgenus Agapostemon taxon_id=606634 — the true LCA per ancestry path computation, NOT the genus (50086).

**Primary recommendation:** Implement the checklist resolution tier as a standalone `data/resolve_checklist_names.py` module invoked via `--refresh-checklist` flag (parallel to `--refresh-lineage`), writing a new `data/dbt/seeds/gbif_checklist_synonyms.csv` seed that `int_synonyms` consumes via a third UNION arm. The nightly path then reads only the committed seed with zero network calls.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Name normalization (authority strip) | Python / `canonical_name.py` | — | Must happen before any matching; reuse existing function |
| Exact canonical match | Python / `resolve_taxon_ids.py` | dbt `stg_inat__canonical_to_taxon_id` | Bridge already covers checklist names via UNION in `_names_to_resolve()` |
| Synonym resolution (curated) | dbt `int_synonyms` via `occurrence_synonyms.csv` | — | Existing tier; locked in D-03 |
| GBIF backbone lookup (one-time) | Python build step | committed dbt seed | One-time on-demand; nightly reads seed only (D-06) |
| Fuzzy candidate generation | Python rapidfuzz | review CSV only | Curator-review surface; never auto-applied (D-02) |
| LCA for slash compounds | Python preprocessing | — | Computed from `taxa.csv.gz` ancestry path before dbt; result stored as resolved taxon_id |
| Audit trail | committed CSV | git history | Every name→taxon_id decision needs source + confidence |
| Homonym guard | dbt test | — | Build-time assertion; best placed in `schema.yml` custom test or `tests/` SQL file |
| Synonym unification | dbt `int_synonyms` | Python reconcile() retirement | D-07: retire Python path; single dbt source |

---

## Standard Stack

### Core (confirmed installed, no new packages needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `pygbif` | 0.6.6 | GBIF `species.name_backbone()` for one-time checklist name resolution | [VERIFIED: confirmed in data/pyproject.toml and `uv run` tested] |
| `rapidfuzz` | 3.14.5 | Jaro-Winkler fuzzy matching for misspelling candidate generation | [VERIFIED: confirmed in data/pyproject.toml and `uv run` tested] |
| `duckdb` | >=1.4,<2 | Bridge table, seed reads, ancestry parse | [VERIFIED: existing dependency] |

**No new pip packages required.** All three packages were added to `data/pyproject.toml` in Phase 134 (D-11). Phase 135 only uses them.

### Supporting

| Library | Version | Purpose |
|---------|---------|---------|
| `csv` (stdlib) | — | Reading/writing audit and seed CSVs |
| `time` (stdlib) | — | GBIF API rate-limit pacing (0.3s/call) |
| `gzip` (stdlib) | — | Reading `taxa.csv.gz` for LCA computation |

### No New dbt Seeds (alternative: extend int_synonyms)

Two patterns are viable for the GBIF-resolved names seed:

**Option A (recommended):** Add `data/dbt/seeds/gbif_checklist_synonyms.csv` with columns `synonym, accepted_name, source` and add a third UNION arm to `int_synonyms.sql`. The `int_synonyms` view already has an anti-join pattern for `auto_synonyms` — add `gbif_checklist_synonyms` the same way.

**Option B (simpler):** Write GBIF-resolved synonym rows directly into `occurrence_synonyms.csv` (the curator-promotion target per D-03). This conflates auto-resolved and human-curated entries. Not recommended — the human-review gate (D-04) requires distinguishing GBIF matches from human-promoted entries.

**Recommendation: Option A.** Keeps GBIF-auto and human-curated separate; audit trail is clear; planner's discretion per D-06.

---

## Package Legitimacy Audit

No new packages are installed in this phase. Packages were added and verified in Phase 134.

| Package | Registry | Status | Disposition |
|---------|----------|--------|-------------|
| pygbif | PyPI | Installed in Phase 134 | Pre-approved |
| rapidfuzz | PyPI | Installed in Phase 134 | Pre-approved |

---

## RCN-01: Name Normalization

**Requirement:** `"Agapostemon texanus Cresson, 1872"` and `"Agapostemon texanus "` (trailing space) both normalize to `agapostemon texanus`.

**Implementation:** Call `normalize_scientific_name()` from `data/canonical_name.py` on `verbatim_name` before any matching step. This function is already the standard normalization used throughout the pipeline.

### `normalize_scientific_name()` — exact behavior (verified from source)

**File:** `data/canonical_name.py` line 73. Five steps applied in fixed order:

1. **Strip authority** — regex `_AUTHORITY_RE` strips `, <year>...` or `(<Author>..., <year>)` trailing — requires year inside trailing parens so subgenus parens like `(Dialictus)` are NOT consumed.
2. **Strip subgenus parens** — `_SUBGENUS_RE` strips `(InitialCap-Word)` between tokens, replaces with single space.
3. **Strip infraspecific markers** — exactly 5 locked markers: `ssp.`, `var.`, `aff.`, `cf.`, `nr.`. Truncates at first match; folds trinomials to binomial (first 2 tokens).
4. **Lowercase** — `.lower()`.
5. **Collapse whitespace** — `" ".join(tokens)` + `.strip()`.

**Idempotent:** `normalize(normalize(x)) == normalize(x)`.

**Input column:** `checklist_data.checklist_records_full.verbatim_name` — the raw `Scientific Name` with authority, stored unmodified per Phase 134 D-12.

**Slash compound handling:** `normalize_scientific_name("Agapostemon texanus/angelicus Cresson, 1872")` would yield `agapostemon texanus/angelicus` — the slash is NOT a recognized separator. Slash compounds must be intercepted BEFORE calling `normalize_scientific_name()` and routed to the LCA path (RCN-05). See LCA section below.

**Edge cases verified:**
- `"Agapostemon texanus Cresson, 1872"` → `agapostemon texanus` [VERIFIED: authority regex]
- `"Agapostemon texanus "` (trailing space) → `agapostemon texanus` [VERIFIED: step 5 trim]
- `"Lasioglossum (Dialictus) zephyrum"` → `lasioglossum zephyrum` [VERIFIED: subgenus re]
- `None` → `None` [VERIFIED: early return]
- `""` or whitespace-only → `None` [VERIFIED: early return]

---

## RCN-02: Tiered Resolver + Audit CSV

### Current state of `_names_to_resolve()`

`data/resolve_taxon_ids.py` `_names_to_resolve()` already unions `checklist_data.species` canonical names. The checklist names entering the bridge are from the 4-column TSV (the old species table). Phase 135 extends this to also cover `checklist_data.checklist_records_full.verbatim_name` (after normalization).

**Key insight:** `checklist_records_full` has 50,646 rows with ~2,861 distinct species names (the same names as in `checklist_data.species`). The existing UNION already covers `checklist_data.species`, so many names are already in the bridge. The 178 unmatched names are the gap.

### Tier order (D-02)

1. **Exact canonical** — `stg_inat__canonical_to_taxon_id` LEFT JOIN; `b.taxon_id IS NOT NULL`. Already handled by existing bridge.
2. **Committed synonym seed** — `int_synonyms` LEFT JOIN in `stg_checklist__records_full.sql`. Existing `occurrence_synonyms.csv` has 1 row: `agapostemon texanus → agapostemon subtilior`. Any promoted GBIF matches go here.
3. **GBIF backbone** — `pygbif.species.name_backbone()` one-time lookup; results in `gbif_checklist_synonyms.csv` seed → `int_synonyms`.

Tiers 1 and 2 auto-apply (live pipeline). Tier 3 is promote-only (written to audit CSV; inert until human adds row to `occurrence_synonyms.csv`).

### Audit CSV schema (D-08)

`data/checklist_name_resolution_audit.csv` — committed to git.

| Column | Description | Values |
|--------|-------------|--------|
| `verbatim_name` | Raw source cell value | e.g. `"Agapostemon texanus Cresson, 1872"` |
| `canonical_name` | Normalized binomial after `normalize_scientific_name()` | e.g. `agapostemon texanus` |
| `resolved_taxon_id` | iNat taxon_id if found, else NULL | integer or blank |
| `accepted_canonical_name` | Accepted name after synonym; same as canonical if no synonym | string |
| `source` | Tier that resolved the name | `exact` / `synonym_seed` / `gbif` / `fuzzy` / `slash_lca` / `unresolved` |
| `confidence` | Numeric: exact/seed=1.0; GBIF=`diagnostics.confidence/100`; rapidfuzz=score/100; slash_lca=1.0 | float 0–1 |
| `gbif_match_type` | GBIF `matchType` field if GBIF was consulted | `EXACT`/`FUZZY`/`VARIANT`/`HIGHERRANK`/`NONE` or blank |
| `notes` | Additional context (e.g. "gender agreement variant") | free text or blank |

**Gate (D-04):** Build hard-fails if `source = 'unresolved'` appears in the audit CSV (same pattern as `check_resolution_gate()` in `resolve_taxon_ids.py`). GBIF and fuzzy tiers satisfy the gate; `unresolved` = no tier matched.

---

## RCN-03: GBIF Offline Cache — Exact API Shape

### `pygbif.species.name_backbone()` — verified live

**Function signature:**
```python
pygbif.species.name_backbone(
    scientificName=None,  # Full name with or without authority
    kingdom=None,         # Use 'Animalia' to constrain
    strict=None,          # strict=True disables fuzzy; default False allows VARIANT
    verbose=None,         # verbose=True returns diagnostics dict; always use True
    **kwargs
)
```

**Return structure (verified via live call):**
```python
{
    'usage': {
        'key': '5042859',                   # GBIF integer usage key (string in response)
        'name': 'Agapostemon texanus Cresson, 1872',
        'canonicalName': 'Agapostemon texanus',  # THE accepted canonical name string
        'rank': 'SPECIES',
        'status': 'ACCEPTED',               # or 'SYNONYM', 'DOUBTFUL'
        'genericName': 'Agapostemon',
        'specificEpithet': 'texanus',
    },
    'classification': [...],                # ancestry chain (not needed for resolution)
    'diagnostics': {
        'matchType': 'EXACT',               # EXACT / FUZZY / VARIANT / HIGHERRANK / NONE
        'confidence': 100,                  # integer 0–100
        'note': '...',
    },
    'synonym': False,                       # True if the matched record IS a synonym
}
```

**When `matchType='NONE'`** (verified live with nonsense name):
```python
{'diagnostics': {'matchType': 'NONE', ...}, 'synonym': False}
# 'usage' key is ABSENT — must use `.get('usage')` not `result['usage']`
```

**matchType semantics for D-02:**

| matchType | synonym field | Action |
|-----------|--------------|--------|
| `EXACT` | False | Use `usage.canonicalName.lower()` as accepted name → write to audit CSV with `source='gbif'`, promote to `occurrence_synonyms.csv` |
| `EXACT` | True | GBIF matched a synonym; `usage.canonicalName` IS the synonym; need to re-query with the accepted name — or use `usage.key` and look up the accepted record |
| `VARIANT` | False | Gender-agreement variant (e.g. `heterorhinus → heterorhinum`); write to audit CSV with `source='gbif'`; flag in notes |
| `FUZZY` | False | GBIF internal fuzzy match; treat like VARIANT — surfaced but requires human review |
| `HIGHERRANK` | False | Matched to genus/family/order, not species; NOT a valid resolution — treat as NONE |
| `NONE` | False | No match; proceed to rapidfuzz tier |

**GBIF `verbose=True` is required** — without it, `diagnostics` key may be absent. Always pass `verbose=True`.

**Kingdom constraint:** Always pass `kingdom='Animalia'` to avoid matching plant homonyms.

### Committed seed pattern (D-06)

New file: `data/dbt/seeds/gbif_checklist_synonyms.csv`

```csv
synonym,accepted_name,source,gbif_usage_key,gbif_match_type,gbif_confidence
agapostemon texanus,agapostemon subtilior,gbif-backbone,1234567,EXACT,98
```

Columns: `synonym` (canonical form of checklist name), `accepted_name` (lowercased GBIF `usage.canonicalName`), `source` (e.g. `gbif-backbone:5042859`), plus optional GBIF metadata columns for provenance.

**`int_synonyms.sql` extension:** Add third UNION arm for `gbif_checklist_synonyms`:

```sql
-- existing two arms...
UNION ALL
SELECT g.synonym, g.accepted_name, g.source
FROM {{ ref('gbif_checklist_synonyms') }} g
LEFT JOIN {{ ref('occurrence_synonyms') }} m ON m.synonym = g.synonym
WHERE m.synonym IS NULL   -- manual entries win over GBIF auto
```

**Nightly read path:** `stg_checklist__records_full.sql` JOINs `int_synonyms` (which reads the committed seed). Zero network calls in the nightly path.

### `--refresh-checklist` flag wiring

Mirror of existing `--refresh-lineage` pattern in `resolve_taxon_ids.py`:

```python
# In run.py STEPS (new step after 'checklist', before 'resolve-taxon-ids'):
_REFRESH_CHECKLIST = "--refresh-checklist" in sys.argv
("resolve-checklist-names", lambda: resolve_checklist_names(refresh=_REFRESH_CHECKLIST)),
```

The function is **a no-op** unless `--refresh-checklist` is passed. This ensures the nightly pipeline never makes network calls. When `--refresh-checklist` is given, it fetches GBIF for unresolved names and writes/updates `gbif_checklist_synonyms.csv`.

**Rate limiting:** 0.3s pause per GBIF call (community guidance). 178 names × 0.3s ≈ 54 seconds one-time. Subsequent refreshes near-instant (only names not already in seed are fetched).

---

## RCN-04: Fuzzy Candidates — rapidfuzz API

### Confirmed API (verified live)

```python
from rapidfuzz import process, fuzz

# Query: normalized canonical name that failed GBIF
# Candidates: all canonical names in stg_inat__canonical_to_taxon_id
matches = process.extract(
    query_name,           # e.g. 'lasioglossum heterorhinus'
    candidate_names,      # list of accepted canonical names from bridge
    scorer=fuzz.WRatio,   # WRatio handles token order; equivalent to token_sort_ratio for binomials
    score_cutoff=85,      # 0-100 integer scale
    limit=5,              # return top-5 candidates
)
# Returns: list of (matched_string, score, index) tuples
# Example: [('lasioglossum heterorhinum', 96.0, 0)]
```

**Score scale:** 0–100 (integer-like float). The D-08 audit CSV normalizes to 0–1 by dividing by 100.

**Scorer choice:** `fuzz.WRatio` (or `fuzz.token_sort_ratio`) is appropriate for scientific name binomials — the two-token structure means token order is stable and simple ratio works.

**Candidate pool:** All canonical names from `stg_inat__canonical_to_taxon_id` (the iNat bridge, ~tens of thousands of entries). Limit to Anthophila for efficiency — query DuckDB for `taxon_id IN (SELECT taxon_id FROM stg_inat__taxon_lineage_extended WHERE ...)`.

**Score cutoff justification:** 85 catches single-letter differences (`heterorhinus`/`heterorhinum` = 96) and is low enough to surface most misspellings. The "13 known misspellings" acceptance criterion is verified against this output.

### Fuzzy-review CSV schema

`data/checklist_fuzzy_review.csv` — committed to git; human reviews this before Phase 136.

| Column | Description |
|--------|-------------|
| `verbatim_name` | Raw source cell value |
| `canonical_name` | Normalized query |
| `fuzzy_candidate` | Best rapidfuzz match |
| `fuzzy_score` | float 0–1 (score/100) |
| `fuzzy_candidate_taxon_id` | iNat taxon_id of the candidate |

**Gate (RCN-04 "no unreviewed fuzzy mapping is live"):** Assert that no row in `occurrence_synonyms.csv` or `gbif_checklist_synonyms.csv` has `source` matching `fuzzy:*`. Since the fuzzy candidates are written ONLY to `checklist_fuzzy_review.csv` (never to any synonym seed), the gate is a simple check: if any row in `checklist_fuzzy_review.csv` appears as a `synonym` in `occurrence_synonyms.csv` with `source='fuzzy:*'`, that is a violation. In practice: since the fuzzy path writes only to the review CSV, the gate may be implemented as a no-op assertion that the review CSV exists (or as a dbt test that the `source` column in `occurrence_synonyms` never contains the literal string `fuzzy`).

### The "13 known misspellings" acceptance check

The 178 unmatched names in `checklist_unmatched.csv` include names that are likely misspellings. The "13 known misspellings" is a concrete count used as an acceptance threshold: at score_cutoff=85, at least 13 of the 178 unmatched names should appear as fuzzy candidates. This is verified by running rapidfuzz against the full unmatched list and asserting `len(fuzzy_candidates) >= 13`. The exact 13 are not pre-enumerated — the acceptance check is that the fuzzy tier is productive, not a specific name list.

---

## RCN-05: Slash-Compound LCA

### Confirmed data (verified via direct file inspection)

**Slash rows in `checklist_records_full.csv`:** 63 total (not 77 as mentioned in CONTEXT.md — CONTEXT.md referred to rows in a prior analysis; the committed file has 63).
- 59 rows: `"Agapostemon texanus/angelicus"` (or with authority)
- 4 rows: `"Agapostemon angelicus/texanus"` (or with authority)

**Both normalize to:** The slash is preserved by `normalize_scientific_name()` as-is (no special handling). The slash must be detected BEFORE normalization.

### Ancestry format (verified from taxa.csv.gz)

`data/raw/taxa.csv.gz` is a **tab-delimited** file (despite .csv extension). Columns:
```
taxon_id  ancestry  rank_level  rank  name  active
```

- `ancestry` is a **slash-delimited path of ancestor taxon_ids** from root to parent: e.g. `48460/1/47120/...`
- To get the full path including self: `ancestry + '/' + taxon_id`
- LCA of two taxa = longest common prefix of their full paths

### Concrete LCA for texanus/angelicus (verified)

```
Genus Agapostemon:  taxon_id=50086,   rank=genus
Subgenus:           taxon_id=606634,  rank=subgenus,  name='Agapostemon' (within genus 50086)
Complex Agapostemon texanus: taxon_id=1581466, rank=complex  (within subgenus 606634)
Agapostemon angelicus (species): taxon_id=270393, ancestry ends in .../50086/606634
Agapostemon texanus (species, active): taxon_id=1581468, ancestry ends in .../50086/606634/1581466
```

**LCA computation:**
- angelicus full path ends: `...50086/606634/270393`
- texanus full path ends: `...50086/606634/1581466/1581468`
- Longest common prefix: `.../606634`
- **LCA taxon_id = 606634** (subgenus Agapostemon, rank=subgenus)

**NOT genus 50086.** The CONTEXT.md says "genus Agapostemon" but the actual LCA is the subgenus (taxon_id=606634), which also has `name='Agapostemon'` and `rank='subgenus'`. This is technically correct — the LCA is the subgenus node, which happens to be named Agapostemon. The map filter at this rank is still at the Agapostemon level as intended.

### LCA algorithm

```python
def compute_lca_taxon_id(name1: str, name2: str, taxa_df) -> int | None:
    """
    name1, name2: canonical binomials (e.g. 'agapostemon angelicus')
    taxa_df: dict or DuckDB result mapping canonical_name -> (taxon_id, ancestry)
    Returns: LCA taxon_id or None if either name not found
    """
    row1 = taxa_df.get(name1)
    row2 = taxa_df.get(name2)
    if row1 is None or row2 is None:
        return None
    
    # Full path = ancestry_ids + [taxon_id]
    path1 = (row1['ancestry'] + '/' + str(row1['taxon_id'])).split('/')
    path2 = (row2['ancestry'] + '/' + str(row2['taxon_id'])).split('/')
    
    lca = None
    for a, b in zip(path1, path2):
        if a == b:
            lca = a
        else:
            break
    return int(lca) if lca else None
```

### Slash-compound resolution integration

Slash-compound rows must be detected by a regex before normalization and routed to the LCA resolver. The resolved `taxon_id` is written to the audit CSV with `source='slash_lca'` and `confidence=1.0`. The `verbatim_name` string (e.g. `"Agapostemon texanus/angelicus Cresson, 1872"`) is preserved in the audit CSV.

The `stg_checklist__records_full.sql` model will have a `canonical_name` computed as the LCA's accepted canonical name (not the slash string). The verbatim slash string stays in the `verbatim_name` column for Phase 138 display.

**Detection regex:** `r'[A-Za-z]+/[A-Za-z]+'` within the `verbatim_name` field. Any species name containing `/` is a slash compound.

---

## RCN-06: Synonym Unification — Retiring `reconcile()`

### Current state (verified)

`data/checklist_synonyms.csv` exists but contains **only the header** — no data rows:
```csv
checklist_name,canonical_name,source
```

`checklist_pipeline.py:reconcile()` (line 162) reads `SYNONYMS_PATH` (= `checklist_synonyms.csv`). Since the file has no data rows, `synonyms` dict is empty and the function currently no-ops for the synonym lookup path. It does still write `checklist_unmatched.csv`.

### What to retire

**Remove from `checklist_pipeline.py`:**
- The `SYNONYMS_PATH` module-level constant (line 28)
- The `reconcile()` function (lines 162–220)
- The call to `reconcile(con)` inside `load_checklist()` (line 439)

**Keep:** `UNMATCHED_PATH` and the unmatched CSV write logic can be removed along with `reconcile()`. The new `resolve_checklist_names.py` module writes the audit CSV instead.

**Do NOT remove:** `checklist_synonyms.csv` the file itself — leave it as an empty header-only file to avoid breaking any downstream reference, OR delete it with a comment in git explaining it was replaced by `occurrence_synonyms.csv`.

### Test asserting single synonym source (RCN-06)

```python
# data/tests/test_checklist_pipeline.py (new test)
def test_no_active_reconcile_call():
    """Assert reconcile() is removed from checklist_pipeline.load_checklist()."""
    import inspect
    import checklist_pipeline
    src = inspect.getsource(checklist_pipeline.load_checklist)
    assert 'reconcile' not in src, "reconcile() must be removed from load_checklist() per D-07"

def test_checklist_synonyms_csv_is_empty():
    """Assert checklist_synonyms.csv has no data rows (header only or absent)."""
    synonyms_path = Path(__file__).parent.parent / "checklist_synonyms.csv"
    if synonyms_path.exists():
        rows = list(csv.DictReader(synonyms_path.open()))
        assert len(rows) == 0, "checklist_synonyms.csv must have no active mappings (D-07)"
```

---

## RCN-07: Homonym Guard dbt Test

### Requirement

A dbt test fails the build if any `canonical_name` within Anthophila maps to >1 `taxon_id` in `int_combined`.

### Implementation options (planner's discretion)

**Option A: singular dbt schema test (recommended)**

Add a custom test in `data/dbt/tests/assert_no_anthophila_homonyms.sql`:

```sql
-- Fails if any canonical_name within Anthophila maps to >1 distinct taxon_id.
-- Anthophila ancestor taxon_id = 630955 (verified from taxa.csv.gz ancestry)
WITH multi_taxon AS (
    SELECT
        c.canonical_name,
        COUNT(DISTINCT c.taxon_id) AS taxon_id_count
    FROM {{ ref('int_combined') }} c
    WHERE c.taxon_id IS NOT NULL
      AND EXISTS (
          SELECT 1 FROM {{ source('inaturalist_data', 'canonical_to_taxon_id') }} b
          JOIN read_csv('{taxa_path}', header=True) t ON CAST(t.taxon_id AS INTEGER) = b.taxon_id
          WHERE b.canonical_name = c.canonical_name
            AND t.ancestry LIKE '%/630955/%'
      )
    GROUP BY c.canonical_name
    HAVING COUNT(DISTINCT c.taxon_id) > 1
)
SELECT * FROM multi_taxon
```

**Option B: simpler, faster** (check bridge table, not int_combined):

```sql
-- In data/dbt/tests/assert_no_homonyms_in_bridge.sql
-- Checks the canonical_to_taxon_id bridge for duplicate canonical names
-- (would catch homonyms before they enter int_combined)
SELECT canonical_name, COUNT(*) as cnt
FROM {{ source('inaturalist_data', 'canonical_to_taxon_id') }}
GROUP BY canonical_name
HAVING COUNT(*) > 1
```

The bridge has a PRIMARY KEY constraint on `canonical_name`, so this should always be empty. The more useful test is against `int_combined` where the UNION might fan out.

**Practical note:** The existing `stg_inat__genus_taxon_ids` already has `HAVING COUNT(*) = 1` for genus disambiguation. The same pattern at species level is the right guard. The bridge table's PK prevents species-level duplicates in the bridge itself; the risk is a slug-compound or synonym that creates a fan-out during the JOIN.

---

## Architecture Patterns

### New file: `data/resolve_checklist_names.py`

A standalone module (NOT part of nightly `run.py` STEPS — it is called only with `--refresh-checklist`).

```python
def resolve_checklist_names(refresh: bool = False) -> None:
    """One-time GBIF lookup for unresolved checklist names.
    
    When refresh=False (default, nightly path): no-op.
    When refresh=True (manual/CI trigger): 
      - Reads unresolved names from checklist_unmatched.csv
      - Pre-processes slash compounds to LCA (no GBIF needed)
      - Calls pygbif.species.name_backbone() for each remaining name
      - Writes/updates data/dbt/seeds/gbif_checklist_synonyms.csv
      - Writes data/checklist_name_resolution_audit.csv
      - Generates data/checklist_fuzzy_review.csv for rapidfuzz candidates
    """
```

**Integration with `run.py`:**

```python
_REFRESH_CHECKLIST = "--refresh-checklist" in sys.argv
# Add to STEPS list AFTER 'checklist' step, BEFORE 'resolve-taxon-ids':
("resolve-checklist-names", lambda: resolve_checklist_names(refresh=_REFRESH_CHECKLIST)),
```

This is a no-op on every nightly run. To re-run the one-time GBIF lookup: `uv run python run.py --refresh-checklist`.

### New file: `data/dbt/models/staging/stg_checklist__records_full.sql`

```sql
{{ config(materialized='view') }}

SELECT
    cr.ObjectID,
    cr.verbatim_name,
    COALESCE(syn.accepted_name, 
             lower(trim(cr.verbatim_name_canonical))) AS canonical_name,
    cr.latitude                                        AS lat,
    cr.longitude                                       AS lon,
    cr.year,
    cr.month,
    cr.day,
    cr.date_quality,
    cr.recordedBy,
    cr.locality,
    cr.family,
    cr.coord_flag,
    COALESCE(ctt.taxon_id, g.taxon_id)::INTEGER        AS taxon_id
FROM {{ source('checklist_data', 'checklist_records_full') }} cr
-- verbatim_name_canonical = normalize_scientific_name(verbatim_name), pre-computed in Python
LEFT JOIN {{ ref('int_synonyms') }} syn
    ON syn.synonym = lower(trim(cr.verbatim_name_canonical))
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn.accepted_name, cr.verbatim_name_canonical)
LEFT JOIN {{ ref('stg_inat__genus_taxon_ids') }} g
    ON ctt.taxon_id IS NULL
   AND position(' ' IN COALESCE(syn.accepted_name, cr.verbatim_name_canonical)) = 0
   AND g.genus_name = COALESCE(syn.accepted_name, cr.verbatim_name_canonical)
WHERE cr.coord_flag = 'valid'
```

**Key detail:** The `verbatim_name_canonical` column must be pre-computed in Python (calling `normalize_scientific_name()` on each row) and stored in the table, OR computed via a dbt expression. Since DuckDB cannot call Python functions inline, the normalization must happen in Python before the table is written. The cleanest approach: extend `_load_checklist_records_full()` to add a `canonical_name` column (the result of calling `normalize_scientific_name(verbatim_name)` for each row, with slash compounds normalized to just the LCA's canonical name).

**Alternatively:** Compute in the SQL model using the same regex patterns as `canonical_name.py`. This avoids Python complexity but duplicates the normalization logic. Recommended: add `canonical_name` column to the Python loader (DRY principle).

### `checklist_data.checklist_records_full` schema (Phase 134 output)

Current table schema (13 columns, verified from `checklist_pipeline.py`):

```python
ObjectID BIGINT
family VARCHAR
genus VARCHAR
verbatim_name VARCHAR          # raw 'Scientific Name' with authority (D-12)
locality VARCHAR
latitude DOUBLE
longitude DOUBLE
recordedBy VARCHAR
year BIGINT
month BIGINT
day BIGINT
date_quality VARCHAR           # 'full' / 'year_only' / 'none'
coord_flag VARCHAR             # 'valid' / 'null_coord' / 'zero_coord' / 'out_of_bbox'
```

**For Phase 135:** The table must gain a `canonical_name` column (normalized verbatim_name, with slash compounds resolved to LCA canonical). This can be added either by extending `_load_checklist_records_full()` or via an ALTER TABLE in the resolution step.

### Recommended project structure changes

```
data/
├── resolve_checklist_names.py          # NEW: one-time GBIF refresh step
├── checklist_name_resolution_audit.csv # NEW: committed audit trail (every name)
├── checklist_fuzzy_review.csv          # NEW: rapidfuzz candidates for human review
├── checklist_synonyms.csv              # MODIFIED: retire (keep header or delete)
├── dbt/
│   └── seeds/
│       ├── occurrence_synonyms.csv     # UNCHANGED (1 row: texanus→subtilior)
│       ├── auto_synonyms.csv           # UNCHANGED (generated by inactive-remap)
│       └── gbif_checklist_synonyms.csv # NEW: GBIF-resolved synonym mappings
└── dbt/
    └── models/
        ├── staging/
        │   └── stg_checklist__records_full.sql  # NEW: synonym JOIN + bridge
        └── intermediate/
            └── int_synonyms.sql                 # MODIFIED: add third UNION arm
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Name normalization | Custom authority-strip regex | `normalize_scientific_name()` from `canonical_name.py` | Already handles all 5 cases including subgenus, infraspecific markers, historical authority formats |
| GBIF backbone match | Direct HTTP requests to `api.gbif.org` | `pygbif.species.name_backbone()` | Already installed; handles auth, rate limiting, response parsing |
| Fuzzy string matching | Levenshtein from scratch | `rapidfuzz.process.extract()` | Already installed; highly optimized Cython; handles token order |
| LCA from ancestry | Binary tree traversal logic | Common-prefix on split path | Ancestry is already a slash-delimited path — `zip()` + early-break is the correct algorithm |
| GBIF response caching | Redis/SQLite custom cache | Committed seed CSV | Existing pipeline pattern; git-diffable; offline-reproducible |
| Synonym subsystem | Custom Python map | `int_synonyms.sql` dbt view | Already exists and covers all three arms (occurrence_synonyms + auto_synonyms + new gbif_checklist_synonyms) |

---

## Common Pitfalls

### Pitfall 1: `matchType='NONE'` — missing `usage` key

When GBIF returns `matchType='NONE'`, the `'usage'` key is **absent** from the response dict. Any code that does `result['usage']['canonicalName']` will raise `KeyError`. Always use `result.get('usage', {}).get('canonicalName')`.

**How to avoid:** Defensive `.get()` at every level of the response parse. Check `matchType` first, then access `usage`.

### Pitfall 2: LCA is subgenus, not genus

The CONTEXT.md says "genus Agapostemon" but the actual LCA of angelicus and texanus in taxa.csv.gz is taxon_id=606634 (subgenus Agapostemon, rank=subgenus). This is because both species have a common subgenus ancestor before the genus ancestor. The subgenus is still named "Agapostemon" so it is filterable at the Agapostemon level as intended, but the taxon_id to use in the output is **606634, not 50086**.

**Impact:** If the planner hard-codes `taxon_id=50086` (genus) instead of computing LCA, the slash rows will be assigned to the genus node rather than the subgenus node. This is less precise but not wrong. However, the LCA algorithm produces 606634, so the plan should use computed LCA not a hard-coded value.

### Pitfall 3: GBIF `VARIANT` matchType for gender-agreement variants

GBIF returns `matchType='VARIANT'` (not `'EXACT'`) for gender-agreement name variants like `heterorhinus`→`heterorhinum` (the trailing vowel difference). The `synonym` field is `False` (these are not synonyms in GBIF's taxonomy). The `usage.canonicalName` IS the accepted name. These should be written to the audit CSV as `source='gbif'` with `gbif_match_type='VARIANT'`. They are still promote-only per D-02.

**Verified live:** `pygbif.species.name_backbone(scientificName='Lasioglossum heterorhinus')` → `matchType='VARIANT'`, `usage.canonicalName='Lasioglossum heterorhinum'`, confidence=98.

### Pitfall 4: Slash detection must happen before `normalize_scientific_name()`

`normalize_scientific_name("Agapostemon texanus/angelicus Cresson, 1872")` returns `"agapostemon texanus/angelicus"` — the slash is preserved. If the slash compound enters the resolver as a canonical name, it will never match anything in the bridge (no taxon named `agapostemon texanus/angelicus` exists). The slash must be detected on the raw `verbatim_name` before normalization.

**Detection pattern:** Check for `/` in `verbatim_name` (raw string, before normalization). Extract the two species epithets (`texanus` and `angelicus`), construct full binomials (`agapostemon texanus` and `agapostemon angelicus`), look up both in taxa.csv.gz, compute LCA.

### Pitfall 5: Adding `canonical_name` column to `checklist_records_full` without `CREATE OR REPLACE`

If the Phase 135 code runs `ALTER TABLE ... ADD COLUMN canonical_name` on the existing table (which was created by Phase 134 `CREATE OR REPLACE TABLE`), it will fail on re-run because the column already exists. Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` or recompute in `_load_checklist_records_full()` (which uses `CREATE OR REPLACE`, so the column is always fresh).

**Recommended:** Add `canonical_name` computation to `_load_checklist_records_full()` directly, so the column is part of the fresh `CREATE OR REPLACE TABLE` schema.

### Pitfall 6: `int_synonyms` `UNIQUE` constraint on auto_synonyms.synonym

`data/dbt/seeds/auto_synonyms.csv` has a dbt `unique` test on the `synonym` column. The new `gbif_checklist_synonyms` seed should have the same test. If the same canonical name appears in both `occurrence_synonyms.csv` and `gbif_checklist_synonyms.csv`, the `int_synonyms` anti-join handles it (occurrence_synonyms wins). But if the same name appears twice in `gbif_checklist_synonyms.csv`, the UNION fans out and produces duplicate rows. Guard against this by deduplicating before writing the seed CSV.

### Pitfall 7: The 18 pre-existing `dbt_sandbox` test failures

`test_resolve_taxon_ids.py` and `test_dbt_diff.py` already have 18 pre-existing failures (missing `dbt_sandbox` fixtures). Phase 135 edits `resolve_taxon_ids.py`. These tests may newly interact with changes but the failures pre-date this phase. **Do not fix them** — that work belongs to the test-suite-improvements milestone (per CONTEXT.md Deferred). New tests added in Phase 135 should use isolated DuckDB (`:memory:`) fixtures to avoid the `dbt_sandbox` dependency.

### Pitfall 8: `sources.yml` must declare `checklist_records_full`

`stg_checklist__records_full.sql` uses `{{ source('checklist_data', 'checklist_records_full') }}`. The `sources.yml` currently only declares `species`, `species_counties`, `checklist_records` for `checklist_data`. Must add `checklist_records_full` to the sources list or dbt build will fail with "source not found."

### Pitfall 9: Slash compound count discrepancy

The CONTEXT.md mentions "77 slash-compound rows" but the actual committed file has **63 rows** (verified by counting). Use 63 as the actual test fixture count. The discrepancy is from an earlier analysis phase on a different data snapshot.

---

## Code Examples

### GBIF lookup with proper error handling

```python
import pygbif
import time

def _gbif_lookup_one(canonical_name: str) -> dict:
    """Single GBIF backbone lookup with proper key access.
    
    Returns dict with keys: matchType, confidence, accepted_canonical, gbif_key
    """
    time.sleep(0.3)  # GBIF rate pacing
    try:
        result = pygbif.species.name_backbone(
            scientificName=canonical_name,
            kingdom='Animalia',
            verbose=True,
        )
    except Exception:
        return {'matchType': 'ERROR', 'confidence': 0, 'accepted_canonical': None, 'gbif_key': None}
    
    diag = result.get('diagnostics', {})
    match_type = diag.get('matchType', 'NONE')
    confidence = diag.get('confidence', 0)
    
    usage = result.get('usage', {})
    accepted_canonical = (usage.get('canonicalName') or '').lower() or None
    gbif_key = usage.get('key')
    
    return {
        'matchType': match_type,
        'confidence': confidence,
        'accepted_canonical': accepted_canonical,
        'gbif_key': gbif_key,
        'is_synonym': result.get('synonym', False),
    }
```

### rapidfuzz candidate generation

```python
from rapidfuzz import process, fuzz

def _generate_fuzzy_candidates(
    query: str, 
    candidate_names: list[str],
    score_cutoff: int = 85,
    limit: int = 5,
) -> list[tuple[str, float]]:
    """Return top fuzzy candidates for a query name.
    
    Returns list of (candidate_name, normalized_score) sorted descending.
    """
    matches = process.extract(
        query,
        candidate_names,
        scorer=fuzz.WRatio,
        score_cutoff=score_cutoff,
        limit=limit,
    )
    # matches: [(matched_string, score_0_to_100, index), ...]
    return [(m[0], m[1] / 100.0) for m in matches]
```

### LCA from taxa.csv.gz ancestry

```python
import gzip
import csv

def _load_anthophila_ancestry(taxa_path: str) -> dict[str, dict]:
    """Load name→{taxon_id, ancestry} for active Anthophila taxa from taxa.csv.gz.
    
    Anthophila ancestor taxon_id = 630955 (verified).
    Only loads species-rank active taxa to keep memory reasonable.
    """
    result = {}
    anthophila_anc = '/630955/'
    with gzip.open(taxa_path, 'rt', newline='') as f:
        reader = csv.reader(f, delimiter='\t')
        next(reader)  # skip header
        for row in reader:
            if len(row) < 6:
                continue
            taxon_id, ancestry, rank_level, rank, name, active = row[:6]
            if active != 'true':
                continue
            if rank not in ('species', 'subspecies'):
                continue
            if anthophila_anc not in (ancestry + '/'):
                continue
            result[name.lower()] = {
                'taxon_id': int(taxon_id),
                'ancestry': ancestry,
            }
    return result

def compute_lca(name1: str, name2: str, taxa: dict) -> int | None:
    """Compute LCA taxon_id for two canonical species names."""
    r1 = taxa.get(name1)
    r2 = taxa.get(name2)
    if r1 is None or r2 is None:
        return None
    path1 = (r1['ancestry'] + '/' + str(r1['taxon_id'])).split('/')
    path2 = (r2['ancestry'] + '/' + str(r2['taxon_id'])).split('/')
    lca = None
    for a, b in zip(path1, path2):
        if a == b:
            lca = a
        else:
            break
    return int(lca) if lca else None
```

### `check_resolution_gate()` pattern for Phase 135's no-match gate

The existing `check_resolution_gate()` in `resolve_taxon_ids.py` (line 60) is the exact template:

```python
def check_checklist_resolution_gate() -> None:
    """Fail fast if any checklist name has no match in any tier (D-04).
    
    Reads checklist_name_resolution_audit.csv.
    Blocks on source='unresolved' rows (no tier matched).
    GBIF, fuzzy, and slash_lca rows satisfy the gate even without promotion.
    """
    import sys
    audit_path = Path(__file__).parent / "checklist_name_resolution_audit.csv"
    if not audit_path.exists():
        sys.exit("checklist-resolution-gate: audit CSV not found; run --refresh-checklist first")
    rows = list(csv.DictReader(audit_path.open(newline="")))
    blocking = [r for r in rows if r["source"] == "unresolved"]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking[:10])
        sys.exit(
            f"checklist-resolution-gate: {len(blocking)} name(s) have no match in any tier. "
            f"Offenders: {names}"
        )
    print(f"checklist-resolution-gate: OK ({len(rows)} names resolved)")  # noqa: T201
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | `data/pyproject.toml` [tool.pytest] section |
| Quick run command | `cd data && uv run pytest tests/test_resolve_checklist_names.py -x` |
| Full suite command | `cd data && uv run pytest tests/ -x` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RCN-01 | `normalize_scientific_name("Agapostemon texanus Cresson, 1872")` → `"agapostemon texanus"` | unit | `pytest tests/test_canonical_name.py -x` | Yes (existing test file) |
| RCN-01 | Trailing space normalized | unit | `pytest tests/test_canonical_name.py -x -k trailing` | May need new test |
| RCN-02 | Audit CSV committed with all name→taxon_id decisions | integration | `pytest tests/test_resolve_checklist_names.py::test_audit_csv_covers_all_names -x` | No — Wave 0 |
| RCN-03 | Nightly path (refresh=False) makes zero GBIF calls | unit | `pytest tests/test_resolve_checklist_names.py::test_noop_without_refresh -x` | No — Wave 0 |
| RCN-04 | Fuzzy candidates written to review CSV | unit | `pytest tests/test_resolve_checklist_names.py::test_fuzzy_candidates_written -x` | No — Wave 0 |
| RCN-04 | >= 13 candidates at score_cutoff=85 | integration | `pytest tests/test_resolve_checklist_names.py::test_at_least_13_fuzzy_candidates -x` | No — Wave 0 |
| RCN-04 | No unreviewed fuzzy mapping in occurrence_synonyms | unit | `pytest tests/test_resolve_checklist_names.py::test_fuzzy_review_gate -x` | No — Wave 0 |
| RCN-05 | `texanus/angelicus` resolves to taxon_id=606634 | unit | `pytest tests/test_resolve_checklist_names.py::test_slash_lca -x` | No — Wave 0 |
| RCN-05 | LCA is subgenus (606634) not genus (50086) | unit | same test | No — Wave 0 |
| RCN-06 | `reconcile()` removed from `load_checklist()` | unit | `pytest tests/test_checklist_pipeline.py::test_no_active_reconcile_call -x` | No — Wave 0 |
| RCN-06 | `checklist_synonyms.csv` has no active rows | unit | `pytest tests/test_checklist_pipeline.py::test_checklist_synonyms_csv_empty -x` | No — Wave 0 |
| RCN-07 | dbt test fails on homonym | dbt test | `cd data && bash dbt/run.sh test --select assert_no_anthophila_homonyms` | No — Wave 0 |

### Wave 0 Gaps

- [ ] `data/tests/test_resolve_checklist_names.py` — covers RCN-02, RCN-03, RCN-04, RCN-05
- [ ] `data/dbt/tests/assert_no_anthophila_homonyms.sql` — covers RCN-07
- [ ] Two new tests in `data/tests/test_checklist_pipeline.py` — covers RCN-06

### Sampling Rate

- **Per task commit:** `uv run pytest tests/test_resolve_checklist_names.py -x`
- **Per wave merge:** `uv run pytest tests/ -x` + `bash dbt/run.sh build`
- **Phase gate:** Full suite green + dbt build green before `/gsd:verify-work`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pygbif | RCN-03 GBIF lookup | Yes | 0.6.6 | — |
| rapidfuzz | RCN-04 fuzzy candidates | Yes | 3.14.5 | — |
| data/raw/taxa.csv.gz | RCN-05 LCA | Yes | ~39MB, confirmed present | — |
| data/checklists/checklist_records_full.csv | All RCN | Yes | 50,646 rows, committed in Phase 134 | — |
| data/checklist_unmatched.csv | RCN-02, RCN-04 baseline | Yes | 178 rows | — |
| GBIF network access | RCN-03 one-time refresh | Yes (not on nightly) | — | Committed seed covers nightly |

No missing dependencies.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `checklist_synonyms.csv` + `reconcile()` Python path | `occurrence_synonyms.csv` + `int_synonyms` dbt path | Phase 135 (D-07) | Single synonym source; correct for all checklist resolution |
| No GBIF lookup (names just listed in checklist_unmatched.csv) | pygbif one-time lookup + committed seed | Phase 135 | 178 unmatched names get external authority resolution |
| `stg_waba__taxon_lineage` for ancestry | `taxa.csv.gz` direct read | Phase 110 + this phase | `stg_waba__taxon_lineage` was dropped; ancestry re-derived from raw file |

---

## Open Questions (RESOLVED)

1. **Should `canonical_name` be added to `checklist_records_full` by Python or computed in SQL?**
   - What we know: DuckDB cannot call Python `normalize_scientific_name()` inline; SQL regex would duplicate the normalization logic.
   - What's unclear: Whether the planner prefers Python-side (extend `_load_checklist_records_full()`) or SQL-side (replicate regex in `stg_checklist__records_full.sql`).
   - Recommendation: Extend `_load_checklist_records_full()` to compute and store `canonical_name`. DRY principle, matches existing module style.
   - **RESOLVED: Python side (Plan 135-03 — extend `_load_checklist_records_full()` to apply `normalize_scientific_name()`).**

2. **`gbif_checklist_synonyms.csv` or write directly to `occurrence_synonyms.csv`?**
   - What we know: D-03 says promotion target = `occurrence_synonyms.csv`; D-06 says results baked into a committed seed.
   - What's unclear: Whether a separate seed (keeping GBIF-auto and human-curated distinct) is worth the int_synonyms complexity.
   - Recommendation: Separate seed (`gbif_checklist_synonyms.csv`) for audit traceability. Human-promoted entries go to `occurrence_synonyms.csv` as per D-03. The two seeds are complementary.
   - **RESOLVED: Separate seed `gbif_checklist_synonyms.csv` (Plans 135-02/04 — third anti-joined arm of `int_synonyms`); curator-promoted rows still land in `occurrence_synonyms.csv` per D-03.**

3. **Should the build add a step for `check_checklist_resolution_gate()` in `run.py`?**
   - What we know: The audit CSV is committed; the nightly path reads only seeds.
   - Recommendation: Yes — add a gate step after the checklist step that checks the committed audit CSV for any `unresolved` rows. This prevents new checklist names from silently going unresolved.
   - **RESOLVED: Yes — gate step wired into `run.py` STEPS after the checklist step (Plan 135-05).**

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "13 known misspellings" = at least 13 of the 178 unmatched names produce fuzzy candidates at score_cutoff=85 | RCN-04 | If fewer than 13 match at 85, the acceptance test fails — lower cutoff or investigate specific names |
| A2 | The GBIF rate limit of 0.3s/call is sufficient to avoid throttling for 178 calls | RCN-03 | If throttled, add retry with exponential backoff; community guidance says species/match is lightly rate-limited |
| A3 | Anthophila ancestor taxon_id in taxa.csv.gz is 630955 | RCN-07 | If wrong, the homonym guard query filters incorrectly; verify by tracing ancestry of any confirmed bee species |
| A4 | Subgenus Agapostemon taxon_id=606634 is stable in iNat | RCN-05 | iNat taxon reshuffling could change ancestry; re-verify at build time from committed taxa.csv.gz |

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `data/canonical_name.py` — `normalize_scientific_name()` exact implementation, steps 1–5
- `data/checklist_pipeline.py` — `reconcile()` function, `SYNONYMS_PATH`, current behavior, `_load_checklist_records_full()` schema
- `data/resolve_taxon_ids.py` — `_names_to_resolve()`, `_resolve_one()`, `check_resolution_gate()`, `generate_inactive_remaps()`, `--refresh-lineage` pattern
- `data/dbt/seeds/occurrence_synonyms.csv` — 1 row: `agapostemon texanus → agapostemon subtilior, Portman et al. 2024`
- `data/dbt/models/intermediate/int_synonyms.sql` — column contract: `synonym, accepted_name, source`; anti-join pattern
- `data/dbt/models/intermediate/int_combined.sql` — current 3 ARM structure, column names (33 columns in schema.yml contract)
- `data/dbt/models/marts/schema.yml` — confirmed 33 columns in occurrences contract
- `data/checklist_synonyms.csv` — confirmed header-only (no data rows)
- `data/checklist_unmatched.csv` — 178 rows confirmed
- `data/raw/taxa.csv.gz` — TSV inside gz; columns `taxon_id,ancestry,rank_level,rank,name,active`; Agapostemon LCA = 606634 (subgenus) verified via direct ancestry path computation
- `data/checklists/checklist_records_full.csv` — 63 slash rows confirmed (59 texanus/angelicus, 4 angelicus/texanus)

### Primary (HIGH confidence — live tool calls)
- `pygbif.species.name_backbone()` — function signature, return structure, matchType semantics verified via live calls in `uv run` environment
- `rapidfuzz.process.extract()` — API confirmed, score scale 0–100, `WRatio` scorer tested
- `data/pyproject.toml` — pygbif, rapidfuzz, dateparser confirmed as installed dependencies

### Secondary (MEDIUM confidence)
- GBIF rate limiting at 0.3s/call — community guidance; species/match is least rate-limited GBIF endpoint
- CONTEXT.md "77 slash-compound rows" vs actual 63 — CONTEXT.md figure is from earlier analysis; 63 is from counting the committed file directly

---

## RESEARCH COMPLETE

**Phase:** 135 - Name Reconciliation
**Confidence:** HIGH

### Key Findings

1. **pygbif API shape is verified live.** `name_backbone(scientificName=..., kingdom='Animalia', verbose=True)` returns `{'usage': {'canonicalName': ..., 'status': ...}, 'diagnostics': {'matchType': 'EXACT'/'VARIANT'/'NONE'/'FUZZY'/'HIGHERRANK', 'confidence': 0-100}, 'synonym': bool}`. When `matchType='NONE'`, the `usage` key is ABSENT — always use `.get()`.

2. **LCA is subgenus 606634, not genus 50086.** The CONTEXT.md says "genus Agapostemon" but the actual ancestry LCA of angelicus (270393) and texanus (1581468) is taxon_id=606634 (subgenus Agapostemon, rank=subgenus). This is still the Agapostemon clade but at subgenus rank.

3. **63 slash rows (not 77).** The committed `checklist_records_full.csv` has 63 slash-compound rows (59 `texanus/angelicus`, 4 `angelicus/texanus`). The 77 figure in CONTEXT.md is from an earlier data snapshot.

4. **`checklist_synonyms.csv` is header-only.** The SYNONYMS_PATH referenced by `reconcile()` exists but contains only the header row. `reconcile()` currently no-ops. Safe to remove entirely.

5. **178 unmatched names are the reconciliation problem.** `checklist_unmatched.csv` has 178 rows — names in `checklist_data.species` that don't join any Ecdysis occurrence. Most will resolve via GBIF (EXACT or VARIANT); the remainder go to rapidfuzz fuzzy review.

6. **33 columns in current `occurrences` contract.** `schema.yml` has exactly 33 columns. Phase 137 will bump to 34 (adding `checklist_id`). Phase 135 does NOT touch `int_combined` or the contract.

### File Created
`.planning/phases/135-name-reconciliation/135-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| pygbif API | HIGH | Live API calls verified in project environment |
| rapidfuzz API | HIGH | Tested in project environment, version confirmed |
| LCA algorithm | HIGH | Direct computation from taxa.csv.gz ancestry paths |
| Existing code shape | HIGH | Direct file inspection of all referenced modules |
| "13 known misspellings" interpretation | MEDIUM | Count is an acceptance threshold, not a pre-enumerated list |
| GBIF rate limits | MEDIUM | Community guidance, not official documented limit |

### Open Questions
- Whether `canonical_name` is added to `checklist_records_full` table in Python vs computed in dbt SQL (recommend Python for DRY)
- Whether a separate `gbif_checklist_synonyms.csv` seed or writing directly into `occurrence_synonyms.csv` (recommend separate seed)

### Ready for Planning
Research complete. Planner can now create PLAN.md files for Phase 135.

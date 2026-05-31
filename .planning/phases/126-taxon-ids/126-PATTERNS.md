# Phase 126: Taxon IDs - Pattern Map

**Mapped:** 2026-05-31
**Files analyzed:** 15 new/modified files
**Analogs found:** 15 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_species_universe.sql` | transform | CRUD | self (existing bridge LEFT JOIN on line 130) | exact — one-line SELECT addition |
| `data/dbt/models/intermediate/int_combined.sql` | transform | CRUD | `int_combined.sql` ARM 1 synonymy JOIN (line 52) | exact — replicate LEFT JOIN pattern per ARM |
| `data/dbt/models/marts/species.sql` | mart | CRUD | `occurrences.sql` final SELECT (line 83) | exact |
| `data/dbt/models/marts/occurrences.sql` | mart | CRUD | `species.sql` final SELECT (line 15) | exact |
| `data/dbt/models/marts/schema.yml` | config | — | existing `checklist` model `not_null` data_tests (line 135) | exact |
| `data/run.py` | orchestrator | batch | existing STEPS entries `("resolve-taxon-ids", ...)` (line 93) | exact |
| `data/resolve_taxon_ids.py` | service | batch | `_names_to_resolve` SQL union (lines 58–74) | exact — extend union |
| `data/species_export.py` | service | batch | `SPECIES_COLUMNS` list (line 50) + pyarrow schema (lines 151–173) | exact |
| `data/tests/test_dbt_scaffold.py` | test | — | `_SPECIES_GUARD` / `_OCCURRENCES_GUARD` decorated tests (lines 255–289) | exact |
| `data/tests/test_dbt_diff.py` | test | — | `test_occurrences_schema_matches` docstring (line 53) | exact — docstring-only update |
| `_data/species.js` | data-cascade | transform | `genusList` / `subgenusList` / `tribeList` map builders (lines 103–260) | exact |
| `_pages/species-detail.njk` | template | request-response | existing atlas action link (line 46) | exact |
| `_pages/genus.njk` | template | request-response | `species-detail.njk` atlas action link (line 46) | exact |
| `_pages/subgenus.njk` | template | request-response | `species-detail.njk` atlas action link (line 46) | exact |
| `_pages/tribe.njk` | template | request-response | `species-detail.njk` atlas action link (line 46) | exact |

---

## Pattern Assignments

### `data/dbt/models/intermediate/int_species_universe.sql` (transform, CRUD)

**Analog:** self — the bridge JOIN is already wired. The only change is adding `ctt.taxon_id` to the `species_universe` CTE SELECT.

**Existing bridge JOIN pattern** (lines 130–133 — do not change):
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
LEFT JOIN {{ ref('stg_inat__taxon_lineage_extended') }} tle
    ON tle.taxon_id = ctt.taxon_id
```

**Column to add** (after `inat_obs_count` on line 127, before the closing paren of `species_universe` CTE):
```sql
ctt.taxon_id::INTEGER AS taxon_id
```

**Final SELECT pattern** (line 151 — `SELECT DISTINCT ON (canonical_name) *` picks it up automatically; no change needed):
```sql
SELECT DISTINCT ON (canonical_name) *
FROM species_universe
WHERE family IN ('Andrenidae', 'Apidae', 'Colletidae', 'Halictidae',
                 'Megachilidae', 'Melittidae', 'Stenotritidae')
ORDER BY canonical_name, on_checklist DESC
```

**Cast convention:** Always cast `ctt.taxon_id::INTEGER` at the point of selection. `taxon_lineage_extended` stores BIGINT; dbt contract requires `integer`. Same cast needed in every mart boundary.

---

### `data/dbt/models/intermediate/int_combined.sql` (transform, CRUD)

**Analog:** existing `LEFT JOIN {{ ref('occurrence_synonyms') }}` pattern applied to ARM 1 (line 52) and ARM 3 (line 143). Replicate the same LEFT JOIN pattern for the bridge, and add the WABA derivation to ARM 2.

**ARM 1 synonymy JOIN pattern to replicate for bridge** (lines 43, 52):
```sql
-- In ARM 1 SELECT (line 43): the post-synonymy key
COALESCE(syn_e.accepted_name, e.canonical_name) AS canonical_name,
-- ...
-- In ARM 1 FROM clause (line 52):
LEFT JOIN {{ ref('occurrence_synonyms') }} syn_e ON syn_e.synonym = e.canonical_name
```

**ARM 1 — add after line 52:**
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(syn_e.accepted_name, e.canonical_name)
```
Add to ARM 1 SELECT (after `canonical_name`, before `NULL AS image_url`):
```sql
ctt.taxon_id::INTEGER AS taxon_id,
```

**ARM 2 (WABA) — current pattern** (line 88):
```sql
NULL                                                                        AS canonical_name,
```
Replace with derived canonical_name and add bridge JOIN:
```sql
-- In ARM 2 SELECT: replace NULL AS canonical_name with:
lower(trim(
    CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
         THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
              || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
         ELSE trim(sob.specimen_inat_taxon_name)
    END
))::VARCHAR                                                                 AS canonical_name,
ctt_w.taxon_id::INTEGER                                                     AS taxon_id,

-- In ARM 2 FROM clause, BEFORE the WHERE clause (line 100):
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt_w
    ON ctt_w.canonical_name = lower(trim(
        CASE WHEN position(' ' IN trim(sob.specimen_inat_taxon_name)) > 0
             THEN split_part(trim(sob.specimen_inat_taxon_name), ' ', 1)
                  || ' ' || split_part(trim(sob.specimen_inat_taxon_name), ' ', 2)
             ELSE trim(sob.specimen_inat_taxon_name)
        END
    ))
```

**ARM 3 — add after line 143:**
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt_io
    ON ctt_io.canonical_name = COALESCE(syn_io.accepted_name, io.canonical_name)
```
Add to ARM 3 SELECT (after `canonical_name` line 136, before `io.image_url`):
```sql
ctt_io.taxon_id::INTEGER AS taxon_id,
```

**UNION ALL type consistency:** All three ARMs must emit `taxon_id` at the same position with the same type (`INTEGER`). ARM 2 uses alias `ctt_w`, ARM 3 uses `ctt_io` to avoid alias collision across the UNION ALL.

---

### `data/dbt/models/marts/species.sql` (mart, CRUD)

**Analog:** `occurrences.sql` final SELECT block (lines 83–100), which adds columns one per line.

**Current header comment** (line 1): `-- Species mart: 19-column external parquet`. Update to `21-column` when adding `taxon_id` (it was already 20; the comment is internally inconsistent per RESEARCH.md).

**Current SELECT pattern** (lines 15–36):
```sql
SELECT
    scientificName,
    canonical_name,
    ...
    checklist_count,
    inat_obs_count
FROM {{ ref('int_species_universe') }}
```

**Add** `taxon_id` after `inat_obs_count` (before `FROM`):
```sql
    inat_obs_count,
    taxon_id
FROM {{ ref('int_species_universe') }}
```

No cast needed here — `int_species_universe` already casts to `::INTEGER`.

---

### `data/dbt/models/marts/occurrences.sql` (mart, CRUD)

**Analog:** self — the final `SELECT j.* + fc.county, fe.ecoregion_l3, fp.place_slug` pattern (lines 83–100).

**Add `j.taxon_id`** to the final SELECT after `j.canonical_name` (line 93):
```sql
    j.canonical_name,
    j.taxon_id,
    j.source, j.image_url, j.obs_url, j.user_login, j.license,
```

No cast needed — `int_combined` already casts to `::INTEGER`.

---

### `data/dbt/models/marts/schema.yml` (config)

**Analog:** The `checklist` model's `not_null` constraint pattern (lines 133–136):
```yaml
      - name: canonical_name
        data_type: varchar
        data_tests:
          - not_null
```

**But:** the occurrences and species marts use `constraints:` not `data_tests:`. The pattern for constraints (new style, matching the contract enforcement mechanism) is:
```yaml
      - name: taxon_id
        data_type: integer
        constraints:
          - type: not_null
```

**Add to species mart** (after `inat_obs_count` entry, currently the last entry on line 125–126):
```yaml
      - name: taxon_id
        data_type: integer
        constraints:
          - type: not_null
```

**Add to occurrences mart** (after `license` entry, currently the last entry on lines 78–80):
```yaml
      - name: taxon_id
        data_type: integer
        constraints:
          - type: not_null
```

**Column count update:** species goes from 20 entries to 21; occurrences goes from 36 entries to 37.

---

### `data/run.py` (orchestrator, batch)

**Analog:** existing STEPS tuple pattern (lines 84–106). Every step is a `(name: str, callable)` 2-tuple.

**Import pattern** (lines 30–46): add import for the new gate function alongside the `resolve_taxon_ids` import (line 37):
```python
from resolve_taxon_ids import resolve_taxon_ids
```
The gate function can live in `resolve_taxon_ids.py` (extending the existing module) or in a new `resolution_gate.py`. Import mirrors the existing pattern.

**STEPS insertion** (between line 93 and line 94 — between `resolve-taxon-ids` and `taxa-download`):
```python
    ("resolve-taxon-ids", lambda: resolve_taxon_ids(refresh=_REFRESH_LINEAGE)),
    ("resolution-gate", check_resolution_gate),       # NEW — D-02
    ("taxa-download", download_taxa_csv),
```

**Step function signature pattern** (lines 59–81, `_run_dbt_build`):
```python
def _run_dbt_build() -> None:
    """Invoke ``bash data/dbt/run.sh build`` and copy artifacts to EXPORT_DIR.
    ...
    """
    subprocess.run(["bash", str(_DBT_SCRIPT), "build"], check=True)
    ...
```
Gate function follows same pattern: zero-argument callable returning `None`, raises/exits on failure. `sys.exit(message)` is the correct failure mode (propagates to `main()`'s `except Exception` traceback handler as a `SystemExit`).

---

### `data/resolve_taxon_ids.py` (service, batch)

**Analog:** `_names_to_resolve` SQL union (lines 58–74) — the existing three-source union.

**Current union pattern** (lines 59–73):
```python
sql = """
    WITH u AS (
        SELECT DISTINCT canonical_name FROM checklist_data.species
        WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM ecdysis_data.occurrences
        WHERE canonical_name IS NOT NULL
        UNION
        SELECT DISTINCT canonical_name FROM inat_obs_data.observations
        WHERE canonical_name IS NOT NULL
    )
    SELECT u.canonical_name
    FROM u
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b USING (canonical_name)
    WHERE b.canonical_name IS NULL
    ORDER BY u.canonical_name
"""
```

**Add a fourth union arm** for `occurrence_synonyms.accepted_name` (RESEARCH.md RD-01 fix):
```python
        UNION
        SELECT DISTINCT accepted_name AS canonical_name FROM main.occurrence_synonyms
        WHERE accepted_name IS NOT NULL
```
This ensures synonymized accepted names (e.g. `agapostemon subtilior`) are verified in the bridge even when not present in any raw source table.

**Also extend for WABA-derived names** (RESEARCH.md Pitfall 3):
```python
        UNION
        SELECT DISTINCT lower(trim(
            CASE WHEN position(' ' IN trim(taxon__name)) > 0
                 THEN split_part(trim(taxon__name), ' ', 1)
                      || ' ' || split_part(trim(taxon__name), ' ', 2)
                 ELSE trim(taxon__name)
            END
        )) AS canonical_name
        FROM inat_waba_data.observations
        WHERE taxon__name IS NOT NULL
```

**`check_resolution_gate` function** — lives in this module or `resolution_gate.py`. Pattern for reading `lineage_unresolved.csv` matches `_read_unresolved_csv` (lines 36–46):
```python
def _read_unresolved_csv() -> set[str]:
    if not UNRESOLVED_CSV.exists():
        return set()
    with UNRESOLVED_CSV.open("r", newline="") as f:
        reader = csv.reader(f)
        try:
            next(reader)  # skip header
        except StopIteration:
            return set()
        return {row[0] for row in reader if row}
```

**Gate function pattern** (new, modeled on RESEARCH.md concrete implementation):
```python
KNOWN_NON_BEES = {"cicindela pugetana", "cleridae", "encopognathus"}

def check_resolution_gate() -> None:
    """Fail fast if any bee canonical_name is unresolved before dbt build (D-02)."""
    import sys
    rows_as_dicts = list(csv.DictReader(UNRESOLVED_CSV.open(newline="")))
    blocking = [r for r in rows_as_dicts if r["canonical_name"] not in KNOWN_NON_BEES]
    if blocking:
        names = ", ".join(r["canonical_name"] for r in blocking)
        sys.exit(
            f"resolution-gate: {len(blocking)} bee name(s) unresolved before dbt build. "
            f"Fix with: uv run python resolve_taxon_ids.py --refresh-lineage\n"
            f"Offenders: {names}"
        )
    print(  # noqa: T201
        f"resolution-gate: OK ({len(rows_as_dicts) - len(blocking)} known non-bee rows excluded)"
    )
```

---

### `data/species_export.py` (service, batch)

**Analog:** self — the `SPECIES_COLUMNS` list (lines 50–56) and pyarrow schema (lines 151–173).

**SPECIES_COLUMNS pattern** (lines 50–56):
```python
SPECIES_COLUMNS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'checklist_count', 'inat_obs_count', 'slug',
]
```
Insert `'taxon_id'` between `'inat_obs_count'` and `'slug'` (RESEARCH.md confirms 22 entries post-phase).

**Pyarrow schema pattern** (lines 151–173): each column maps to a `pa.` type. Add:
```python
('taxon_id', pa.int32()),
```
between `('inat_obs_count', pa.int64())` and `('slug', pa.string())`.

**`mart_cols` read pattern** (line 119): `SPECIES_COLUMNS[:-1]` excludes slug (Python-added). After inserting `taxon_id` before `slug`, this slice naturally includes `taxon_id` in the mart read — no change to the slice logic.

**Higher-rank taxon_id lookup (D-06):** new helper function in this file, called before/during the `genusList`/`subgenusList`/`tribeList` export. Pattern follows the existing DuckDB `con.execute(...)` + `fetchall()` pattern used throughout the file. The lookup queries `data/raw/taxa.csv.gz` directly (confirmed present on disk):
```python
def _build_higher_rank_taxon_ids(con: duckdb.DuckDBPyConnection) -> dict:
    """Query taxa.csv.gz for genus/subgenus/tribe taxon_ids by name."""
    taxa_csv = str(Path(__file__).parent / "raw" / "taxa.csv.gz")
    rows = con.execute(
        "SELECT name, rank, taxon_id "
        "FROM read_csv(?, delim=chr(9), header=true, compression='gzip') "
        "WHERE rank IN ('genus', 'subgenus', 'tribe') AND active = 'true'",
        [taxa_csv]
    ).fetchall()
    result: dict[str, dict[str, int]] = {"genus": {}, "subgenus": {}, "tribe": {}}
    for name, rank, tid in rows:
        if rank in result:
            result[rank][name] = int(tid)
    return result
```

This dict is serialized to a new `higher_rank_taxon_ids.json` in `ASSETS_DIR` (or passed in-memory to `_data/species.js` via the JSON sidecar approach that already exists for `species.json` and `seasonality.json`).

**Print + assert post-write pattern** (lines 186–188):
```python
print(f"  species.parquet: {total:,} rows, {species_parquet.stat().st_size:,} bytes")
assert total > 0, "species.parquet must be non-empty"
```
Follow this for the higher-rank export step.

---

### `data/tests/test_dbt_scaffold.py` (test)

**Analog:** `_SPECIES_GUARD` and `_OCCURRENCES_GUARD` decorated tests (lines 255–289). The guard marker pattern is used for all post-build parquet assertions.

**`_SPECIES_GUARD` pattern** (lines 255–258):
```python
_SPECIES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "species.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first",
)
```

**`_OCCURRENCES_GUARD` pattern** (lines 214–217):
```python
_OCCURRENCES_GUARD = pytest.mark.skipif(
    not (SANDBOX / "occurrences.parquet").exists(),
    reason="run `bash data/dbt/run.sh build` first to produce sandbox outputs",
)
```

**Existing test body pattern** (lines 261–289 — copy structure verbatim):
```python
@_SPECIES_GUARD
def test_off_checklist_species_with_occurrences_have_specific_epithet():
    """All two-token off-checklist species with occurrence_count > 0 have specific_epithet (SPV-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') "
        "WHERE occurrence_count > 0 AND on_checklist = false "
        "AND ARRAY_LENGTH(STRING_SPLIT(canonical_name, ' ')) = 2 "
        "AND specific_epithet IS NULL"
    ).fetchone()[0]
    assert n == 0, (
        f"Expected 0 two-token off-checklist species with occurrences to lack specific_epithet, "
        f"got {n}. Fix COALESCE derivation in int_species_universe.sql."
    )
```

**New tests to add** (append after existing `_SPECIES_GUARD` block):
```python
@_SPECIES_GUARD
def test_species_taxon_id_non_null():
    """species.parquet: zero rows with null taxon_id (TID-01)."""
    parquet_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE taxon_id IS NULL"
    ).fetchone()[0]
    assert n == 0, f"Expected 0 null taxon_id rows in species.parquet, got {n}"


@_OCCURRENCES_GUARD
def test_occurrences_taxon_id_non_null():
    """occurrences.parquet: zero rows with null taxon_id (TID-02)."""
    parquet_path = str(SANDBOX / "occurrences.parquet")
    n = duckdb.execute(
        f"SELECT COUNT(*) FROM read_parquet('{parquet_path}') WHERE taxon_id IS NULL"
    ).fetchone()[0]
    assert n == 0, f"Expected 0 null taxon_id rows in occurrences.parquet, got {n}"


@_OCCURRENCES_GUARD
@_SPECIES_GUARD
def test_taxon_id_consistency():
    """occurrences.taxon_id == species.taxon_id for matching canonical_names (D-03)."""
    occ_path = str(SANDBOX / "occurrences.parquet")
    sp_path = str(SANDBOX / "species.parquet")
    n = duckdb.execute(f"""
        SELECT COUNT(*) FROM read_parquet('{occ_path}') o
        JOIN read_parquet('{sp_path}') s USING (canonical_name)
        WHERE o.taxon_id != s.taxon_id
    """).fetchone()[0]
    assert n == 0, f"Expected 0 taxon_id mismatches between occurrences and species, got {n}"
```

---

### `data/tests/test_dbt_diff.py` (test, docstring updates only)

**Analog:** self — two docstring-only updates. No logic changes.

**`test_occurrences_schema_matches` docstring** (line 53–54): change `"36 cols"` to `"37 cols"`.

**`test_species_parquet_schema_matches` docstring** (line 326–327): change `"18-column"` / `"19-column"` to `"21-column"` / `"22-column"` (the actual pre-phase counts are 20/21 per RESEARCH.md; post-phase they are 21/22). Note: the test LOGIC (`p_cols[:-1] == s_cols`) does not hardcode a count and requires no change.

---

### `_data/species.js` (data-cascade, transform)

**Analog:** self — `genusList` map builder pattern (lines 103–153) and `subgenusList` builder (lines 159–222). Both demonstrate the pattern for attaching per-rank properties to the list entries.

**`genusList` entry shape pattern** (lines 145–152):
```javascript
return {
  genus: g.genus,
  family: g.family,
  subfamily: g.subfamily,
  species,
  speciesCount: speciesOnly.length,
  totalOccurrences: ...,
};
```
Add `taxon_id: higherRankTaxonIds.genus[g.genus] ?? null` to this return object.

**`subgenusList` compound key pattern** (lines 160–163):
```javascript
const key = `${sp.genus}::${sp.subgenus}`;
if (!subgenusMap[key]) {
  subgenusMap[key] = { genus: sp.genus, subgenus: sp.subgenus, ... };
}
```
For the `taxon_id` lookup, use `higherRankTaxonIds.subgenus[g.subgenus]` — the `taxa.csv.gz` row for a subgenus is keyed by the subgenus name, not the compound key. Disambiguation of same-named genus/subgenus (e.g., Bombus) is handled by querying only rows with `rank = 'subgenus'`.

**`tribeList` entry shape pattern** (lines 246–258):
```javascript
return {
  tribe: t.tribe,
  family: t.family,
  genera,
  generaCount: genera.length,
  totalOccurrences,
};
```
Add `taxon_id: higherRankTaxonIds.tribe[t.tribe] ?? null`.

**Data loading pattern** (lines 13–22 — existing JSON reads):
```javascript
const speciesJsonPath = join(repoRoot, 'public/data/species.json');
const seasonalityJsonPath = join(repoRoot, 'public/data/seasonality.json');
const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));
const seasonality = JSON.parse(readFileSync(seasonalityJsonPath, 'utf8'));
```
Add a parallel read for the higher-rank lookup:
```javascript
const higherRankTaxonIdsPath = join(repoRoot, 'public/data/higher_rank_taxon_ids.json');
const higherRankTaxonIds = JSON.parse(readFileSync(higherRankTaxonIdsPath, 'utf8'));
```

**Species `taxon_id` passthrough:** `speciesList` (line 97) is `flat.filter(s => s.specific_epithet !== null)`. Each entry in `flat` comes from `raw` which comes from `species.json` — once `taxon_id` is in `species.json`, it flows through automatically. No explicit change to `speciesList` needed.

---

### `_pages/species-detail.njk` (template, request-response)

**Analog:** self — the existing atlas action link (line 46):
```nunjucks
{%- if sp.occurrence_count > 0 -%}
<a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count + (sp.inat_obs_count or 0) }} records on the atlas →</a>
{%- endif -%}
```

**New link to add** as a sibling, immediately after (or before) the atlas link. Same conditional guard `{%- if sp.taxon_id -%}`:
```nunjucks
{%- if sp.taxon_id -%}
<a href="https://www.inaturalist.org/taxa/{{ sp.taxon_id }}">View on iNaturalist →</a>
{%- endif -%}
```

**Placement:** After the atlas link (line 46), before `</article>` (line 48). Both links sit inside the `{%- if sp.occurrence_count > 0 -%}` block or as a sibling block — use a separate guard so the iNat link appears even for checklist-only species with 0 occurrences.

---

### `_pages/genus.njk` (template, request-response)

**Analog:** `species-detail.njk` atlas action link (line 46). Same `{%- if ... -%}` guard + `<a href>` pattern.

**Current template ends** (lines 36–39):
```nunjucks
  </div>
</article>
<script type="module" src="/src/entries/taxon-page.ts"></script>
```

**Add before `</article>`** (after the `</div>` closing `media-grid`):
```nunjucks
{%- if genus.taxon_id -%}
<a href="https://www.inaturalist.org/taxa/{{ genus.taxon_id }}">View on iNaturalist →</a>
{%- endif -%}
```

The `genus.taxon_id` value comes from `genusList[x].taxon_id` added to `_data/species.js`.

---

### `_pages/subgenus.njk` (template, request-response)

**Analog:** `genus.njk` iNat link (same pattern just added above).

**Add before `</article>`**:
```nunjucks
{%- if subgenus.taxon_id -%}
<a href="https://www.inaturalist.org/taxa/{{ subgenus.taxon_id }}">View on iNaturalist →</a>
{%- endif -%}
```

The `subgenus.taxon_id` value comes from `subgenusList[x].taxon_id` added to `_data/species.js`.

---

### `_pages/tribe.njk` (template, request-response)

**Analog:** `genus.njk` iNat link.

**Add before `</article>`**:
```nunjucks
{%- if tribe.taxon_id -%}
<a href="https://www.inaturalist.org/taxa/{{ tribe.taxon_id }}">View on iNaturalist →</a>
{%- endif -%}
```

The `tribe.taxon_id` value comes from `tribeList[x].taxon_id` added to `_data/species.js`.

---

## Shared Patterns

### dbt `::INTEGER` cast at mart boundary
**Source:** `int_species_universe.sql` line 130 (bridge alias `ctt.taxon_id`)
**Apply to:** Every mart SQL file that reads `taxon_id` from the bridge (`ctt.taxon_id::INTEGER`).
**Reason:** `taxon_lineage_extended` stores BIGINT; dbt contract requires `integer`. Omitting the cast causes a build-time type mismatch error.

### dbt `contract.enforced: true` + `constraints: not_null`
**Source:** `schema.yml` lines 4–8 (occurrences contract block):
```yaml
    config:
      contract:
        enforced: true
    columns:
      - name: ecdysis_id
        data_type: integer
```
**Apply to:** New `taxon_id` entries in both `species` and `occurrences` mart blocks. Use `constraints: - type: not_null` (not `data_tests:`) to match the contract enforcement mechanism already in use for both mart models.

### dbt `{{ ref('stg_inat__canonical_to_taxon_id') }}` LEFT JOIN
**Source:** `int_species_universe.sql` lines 130–131:
```sql
LEFT JOIN {{ ref('stg_inat__canonical_to_taxon_id') }} ctt
    ON ctt.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
```
**Apply to:** `int_combined.sql` ARM 1 (join key: `COALESCE(syn_e.accepted_name, e.canonical_name)`), ARM 2 (join key: derived expression), ARM 3 (join key: `COALESCE(syn_io.accepted_name, io.canonical_name)`). Use distinct aliases (`ctt`, `ctt_w`, `ctt_io`) across the UNION ALL arms.

### Python `sys.exit(message)` for pipeline gate failures
**Source:** `run.py` `_run_dbt_build()` uses `subprocess.run(..., check=True)` which raises `CalledProcessError`; `main()` lines 112–118 catch all exceptions and re-raise. `sys.exit(message)` causes `SystemExit` which propagates identically through the `except Exception` handler.
**Apply to:** `check_resolution_gate()` — use `sys.exit(f"resolution-gate: ...")` to surface the actionable message in the pipeline log.

### `UNRESOLVED_CSV` / `lineage_unresolved.csv` read pattern
**Source:** `resolve_taxon_ids.py` `_read_unresolved_csv()` (lines 36–46) and `UNRESOLVED_CSV = Path(__file__).parent / "lineage_unresolved.csv"` (line 21).
**Apply to:** `check_resolution_gate()` — use `UNRESOLVED_CSV.open(newline="")` and `csv.DictReader` (for named field access) rather than `csv.reader`.

### Nunjucks conditional action link
**Source:** `_pages/species-detail.njk` line 45–47:
```nunjucks
{%- if sp.occurrence_count > 0 -%}
<a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count + (sp.inat_obs_count or 0) }} records on the atlas →</a>
{%- endif -%}
```
**Apply to:** All four taxon page templates (`species-detail.njk`, `genus.njk`, `subgenus.njk`, `tribe.njk`). Guard with `{%- if *.taxon_id -%}` to suppress link when `taxon_id` is null (graceful degradation). Use the exact label `"View on iNaturalist →"` per D-05.

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `data/dbt/models/`, `data/*.py`, `data/tests/`, `_data/`, `_pages/`
**Files scanned:** 15 source files read
**Pattern extraction date:** 2026-05-31

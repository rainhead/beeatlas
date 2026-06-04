# Stack Research: v4.7 Checklist Records as Point Data

**Project:** BeeAtlas v4.7
**Researched:** 2026-06-03
**Confidence:** HIGH (taxonomic tooling), MEDIUM (dedup approach)
**Scope:** New capabilities only. Existing stack (Python 3.14+, dbt-duckdb 1.10.1,
DuckDB >=1.4,<2, dlt, wa-sqlite, Mapbox GL JS, Lit) is confirmed and not
re-researched. This document covers tools for: (1) build-time taxonomic name
resolution, (2) scientific name parsing, (3) fuzzy name matching,
(4) occurrence deduplication, (5) coordinate validation, and (6) date parsing.

---

## Summary Verdict

**Minimal new library additions required.** The two hard problems — taxonomic name
reconciliation and cross-source dedup — are solvable with a combination of the
existing `resolve_taxon_ids.py` pipeline (iNat API + `taxa.csv.gz`) extended with
GBIF `species/match` API batch calls (via `pygbif 0.6.6`), a DuckDB-native fuzzy
name similarity gate, and deterministic SQL-based dedup (no probabilistic record
linkage library). Name parsing is already handled by the in-repo `canonical_name.py`
module; `rapidfuzz 3.14.5` is the only additional library worth adding for
misspelling-candidate generation. Date normalization uses Python stdlib plus
`dateparser 1.4.0` for the ambiguous ~13% null/non-ISO tail.

---

## Problem 1 — Taxonomic Name Resolution

### The Reconciliation Chain

The checklist CSV contains ~2,861 species names in messy historical form. The v4.7
target is: every checklist name → lowercase canonical binomial →
`inaturalist_data.canonical_to_taxon_id` bridge → iNat `taxon_id`. This is the same
chain as the existing pipeline. The new challenge is the ~178 names in
`checklist_unmatched.csv` that currently have no Ecdysis match — they need resolution
against an external authority so their `taxon_id` can be established.

### Option 1 (PRIMARY): GBIF Backbone Taxonomy via pygbif

**Tool:** `pygbif 0.6.6` (released 2025-11-14, MIT license)
**PyPI:** https://pypi.org/project/pygbif/
**Function:** `species.name_backbone(name=..., strict=False, verbose=True)`

**What it returns:**
- `usage.usageKey` — stable GBIF integer ID (survives backbone rebuilds as accepted-name key)
- `matchType` — `EXACT` / `FUZZY` / `HIGHERRANK` / `NONE`
- `status` — `ACCEPTED` / `SYNONYM` / `DOUBTFUL`
- `species` / `genus` / `family` — accepted-name strings at each rank
- `synonym` boolean — if `True`, the matched record IS the synonym; use the `acceptedUsageKey`

**Fuzzy matching:** The API does internal edit-distance matching when `strict=False`; it
returns the GBIF accepted name for synonyms. The `verbose=True` parameter returns
rejected alternatives for audit logging. No Python-side fuzzy pre-processing needed
for the API call itself.

**Bridge to iNat taxon_id:** The GBIF accepted name string (e.g. `"Andrena fulva"`)
becomes the query for the existing `resolve_taxon_ids._resolve_one()` iNat API lookup.
The GBIF `usageKey` itself is NOT the bridge ID — it is used only as an intermediate
accepted-name normalizer. Concretely: `GBIF → accepted canonical_name → iNat API → taxon_id`.

**North American / WA bee coverage:** GBIF Backbone sources include Discover Life Bees
(North American specialist bee checklist), ITIS World Bee Checklist, and Catalogue of
Life. Coverage of Apidae, Halictidae, Colletidae, and Andrenidae is GOOD for valid
species; synonyms and historical names match at `FUZZY` level. MEDIUM confidence
(based on Bartholomew et al. 2024 checklist overlap with GBIF occurrence records for
WA bees).

**Build-time feasibility:** YES. `pygbif.species.name_backbone()` is a single
synchronous HTTP call per name. 2,861 names at 0.5 s/call = ~24 minutes if called for
every name every nightly run. However, results are deterministic and should be cached:
write a `data/gbif_name_cache.json` or a DuckDB table
`checklist_data.gbif_resolution_cache` keyed by canonical name. On subsequent runs,
only names absent from the cache require API calls — in practice, 0 calls after the
first full run unless new checklist names appear. The cache is committed to git (same
pattern as `occurrence_synonyms.csv` and `auto_synonyms.csv`).

**Rate limits:** GBIF's `species/match` endpoint tolerates burst queries (it is
consulted synchronously on every GBIF occurrence ingestion event); it is the least
rate-limited GBIF endpoint. Community guidance is to add a short pause (0.2–0.5 s)
between batch calls. 2,861 calls at 0.3 s = ~14 minutes one-time; subsequent runs
near-instant from cache.

**Licensing:** pygbif is MIT. GBIF taxonomy data is CC-BY 4.0. The accepted-name
string returned is a scientific name (not copyrightable); the `usageKey` integer is a
database identifier. Redistribution of baked accepted-name strings is fine — do not
redistribute the raw GBIF backbone DwC-A.

**What to ADD:** `pygbif>=0.6.6` to `data/pyproject.toml` dependencies.

---

### Option 2 (SECONDARY / OFFLINE FALLBACK): ITIS SQLite Database

**Availability:** Downloadable as `itisSqlite.zip` from https://www.itis.gov/downloads/
in SQLite format. Updated quarterly. Contains `taxonomic_units`, `synonym_links`, and
`taxon_authors_lkp` tables keyed by TSN (Taxonomic Serial Number).

**Build-time feasibility:** YES — fully offline once downloaded. The SQLite file is
~350 MB uncompressed (estimate; ITIS does not publish size on the downloads page).

**North American bee coverage:** ITIS maintains the World Bee Checklist (contributed
largely by AMNH's bee database project). Coverage of North American Anthophila is
EXCELLENT — ITIS is the canonical authority source for the Bartholomew et al. 2024
WA checklist, which was originally assembled against ITIS TSNs. This means a
non-trivial portion of the 178 unmatched checklist names likely resolve via ITIS even
when GBIF fuzzy matching fails.

**Licensing:** ITIS is produced by USGS, a US federal government agency. US
government works are public domain domestically (17 U.S.C. § 105); the data carries
no redistribution restriction. Do NOT redistribute the SQLite file itself (it is
large and versioned); only bake the resolved accepted-name strings into pipeline
artifacts.

**Python interface:** No maintained Python wrapper (the only wrapper found,
`bruvellu/itis.py`, appears unmaintained). Use Python `sqlite3` stdlib directly:

```python
import sqlite3
con = sqlite3.connect("itisSqlite.db")
rows = con.execute("""
    SELECT tu.complete_name, tu2.complete_name AS accepted_name
    FROM taxonomic_units tu
    LEFT JOIN synonym_links sl ON sl.tsn = tu.tsn
    LEFT JOIN taxonomic_units tu2 ON tu2.tsn = sl.tsn_accepted
    WHERE lower(tu.complete_name) = lower(?)
""", [canonical_name]).fetchall()
```

**Gap:** ITIS does not do fuzzy/misspelling matching natively. Names must match
exactly after canonicalization. Use `rapidfuzz` (see Problem 3) to generate
misspelling candidates before querying ITIS.

**Integration point:** Add ITIS SQLite lookup as a fallback tier in a new
`data/checklist_resolution.py` module: try GBIF first (cached), then ITIS SQLite for
GBIF misses, then the existing iNat API for any remaining unresolved canonical names.

**What to ADD:** Download `itisSqlite.zip` as a pipeline setup step (not a pip
dependency). Store at `data/raw/itisSqlite.db` (gitignored; downloaded once like
`taxa.csv.gz`). Add a shell step in `nightly.sh` to download/verify it is present
(similar to the `taxa.csv.gz` ETag pattern).

**What NOT to add:** Do NOT add the ITIS REST/SOAP API calls as a pipeline step.
The SQLite download is faster, more reliable, and works offline. The ITIS web service
API has no documented rate limits and is SOAP-based, making it harder to work with
than the SQLite file.

---

### Option 3 (NOT RECOMMENDED): Global Names / gnverifier

**Tool:** `gnverifier` — a Go binary, not a Python package. Python access via REST API
at `https://verifier.globalnames.org/api/v1/verifications` or via subprocess call to
the binary.

**What it does:** Verifies names against 100+ biodiversity databases including ITIS,
COL, GBIF Backbone, and WoRMS. Returns a `bestResult` with `dataSourceTitle`,
`matchedName`, `currentName`, and `matchType`.

**Build-time feasibility:** MAYBE. The REST API works at build time. Self-hosting the
binary requires Go build or pre-built binary download — not a native Python pip
install. The service queries remote databases (not local), so build-time use still
requires network access.

**Why not recommended:** gnverifier adds a binary dependency (Go binary) without
providing substantially better WA-bee coverage than GBIF + ITIS combined. The
`currentName` field it returns is the name that the aggregated sources agree on —
useful, but the accepted canonical form is what `pygbif.species.name_backbone()` already
returns with better bee-specific coverage. The added complexity (subprocess call or REST
HTTP call + JSON parsing) is not justified given the GBIF + ITIS tier already covers the
use case.

**What NOT to add:** gnverifier binary or gnverifier REST calls to the pipeline.

---

### Option 4 (NOT RECOMMENDED): Catalogue of Life / ChecklistBank

**Tool:** COL ChecklistBank REST API (`https://api.checklistbank.org/`)

**Build-time feasibility:** YES (REST API). Partial DwC-A downloads available for
subtaxa (requires GBIF login for bulk download).

**Why not recommended:** COL's bee taxonomy is sourced from the same ITIS World Bee
Checklist that ITIS itself publishes directly. Querying COL is an extra indirection
over querying ITIS. COL adds value for global coverage outside North America; for
WA Anthophila specifically, ITIS is the direct authority. Do not add COL.

---

### Authoritative Source Ranking for WA Anthophila Name Resolution

| Tier | Source | Method | Coverage (WA bees) | Offline? |
|------|--------|--------|-------------------|---------|
| 1 | iNat `taxa.csv.gz` exact match | Existing `resolve_taxon_ids.py` | Excellent (all iNat-active taxa) | YES (cached) |
| 2 | GBIF `species/match` API | `pygbif.species.name_backbone()` | Good (Discover Life / ITIS sourced) | NO (network, cached) |
| 3 | ITIS SQLite offline | `sqlite3` stdlib | Excellent (ITIS = original authority) | YES |
| 4 | iNat API exact | Existing `_resolve_one()` | Good | NO (paced) |
| 5 | Manual `occurrence_synonyms.csv` | Human curator | Curated residual | YES |

---

## Problem 2 — Scientific Name Parsing (Authority Stripping, Canonical Form)

**Tool:** Existing `data/canonical_name.py` `normalize_scientific_name()` function.

**Verdict:** Sufficient for v4.7. The function handles:
- Authority stripping: `"Andrena fulva (Müller, 1766)"` → `"andrena fulva"`
- Subgenus parens: `"Lasioglossum (Dialictus) zephyrum"` → `"lasioglossum zephyrum"`
- Infraspecific markers: `ssp.`, `var.`, `aff.`, `cf.`, `nr.` truncation
- Lowercase + whitespace normalization

The full Bartholomew et al. 2024 CSV will contain author-enriched names. The existing
5-step algorithm handles all documented historical name forms from that paper (they use
standard Linnaean nomenclature). No new parser library needed.

**If authority parsing becomes more complex (e.g. "Epeolus compactus (Cresson)"
failing):** Invoke `gnparser` via its REST API at `https://parser.globalnames.org/api/v1/`
with a batch of up to 1000 names as POST body JSON. This is a build-time-only API
call; no binary dependency. Add only if needed (LOW priority, LOW probability).

**What NOT to add:** `nameparser` PyPI package (it parses human names, not scientific
names — different domain). `rgnparser` is R only. `gnparser` Go binary is an
unnecessary binary dependency given the existing Python module's adequacy.

---

## Problem 3 — Fuzzy Matching for Misspelling-Candidate Generation

**Tool:** `rapidfuzz 3.14.5` (released 2026-04-07, MIT license, Python 3.14 pre-built wheels confirmed)
**PyPI:** https://pypi.org/project/RapidFuzz/
**GitHub:** https://github.com/rapidfuzz/RapidFuzz

**Use case:** Generate candidate matches for checklist names that fail exact match
against iNat `taxa.csv.gz` and GBIF `species/match`. A Jaro-Winkler or token-sort-ratio
comparison of the unmatched name against all WA bee names in `taxa.csv.gz` surfaces
likely misspellings (e.g. `"Megachile rotundatta"` → `"Megachile rotundata"`).

**API:**
```python
from rapidfuzz import process, fuzz
matches = process.extractOne(
    query_name,
    candidate_names,          # list of canonical names from taxa.csv.gz
    scorer=fuzz.token_sort_ratio,
    score_cutoff=85
)
```

**Note on internal fuzzy matching in external services:** GBIF `species/match`
already performs internal fuzzy matching before returning `matchType='FUZZY'`. This
means many misspellings are caught upstream without `rapidfuzz`. Use `rapidfuzz` only
for names where GBIF returns `matchType='NONE'` and ITIS exact match also fails —
to generate a candidate list for curator review (appended to `checklist_unmatched.csv`
with a new `fuzzy_candidate` column). Do NOT auto-apply `rapidfuzz` suggestions
without curator approval; misspelling-assumption errors in bee names are common (many
similar epithets across genera).

**What to ADD:** `rapidfuzz>=3.14.5` to `data/pyproject.toml` dependencies.

**What NOT to add:** `thefuzz` (the old FuzzyWuzzy; superseded by rapidfuzz with same
API), `Levenshtein` standalone (included in rapidfuzz), `jellyfish` (redundant with
rapidfuzz).

---

## Problem 4 — Occurrence Record Deduplication (checklist vs. Ecdysis)

### The Dedup Problem

Both the Bartholomew et al. 2024 checklist CSV and the Ecdysis dataset contain museum
specimen records for WA bees. The overlap risk: a physical bee specimen appears in
both sources (the checklist was assembled from museum specimens, including some that
are now in Ecdysis). No shared unique identifier exists across sources.

**Dedup signal available per record:**
- Scientific name (after canonicalization + synonym resolution)
- Collector name (`recordedBy`)
- Locality / collection location (text description)
- Latitude/longitude (from the full CSV; 91% of checklist records have coordinates)
- Collection date (mixed format, ~87% parseable)

### Approach: DuckDB-Native Deterministic Dedup (No Probabilistic Library)

**Recommendation:** Implement dedup as a DuckDB SQL step in `int_combined` (or a new
`int_checklist_dedup.sql` model) that matches checklist records against Ecdysis records
using a multi-field compound key. No external dedup library needed.

**Match criteria (AND logic for a "definite duplicate"):**
1. `canonical_name` exact match (after synonym resolution)
2. `recordedBy` Jaro-Winkler similarity ≥ 0.90 (via DuckDB's `jaro_winkler_similarity()` function)
3. Collection year match (exact)
4. Spatial proximity: `abs(checklist.lat - ecdysis.lat) < 0.01` AND `abs(checklist.lon - ecdysis.lon) < 0.01` (~1 km tolerance)

**Why deterministic over Splink:** Splink 4.0.16 is an excellent probabilistic record
linkage tool with a DuckDB backend. However, for this dataset:
- Splink is designed for large-scale (1M+) record linkage with uncertain match probability training
- The checklist has ~46K rows; Ecdysis has ~70K rows — small enough for a nested-loop SQL JOIN with DuckDB
- The match criteria are well-defined: same name + same collector + same year + close coordinates is an unambiguous duplicate
- Splink requires training data or EM estimation to set match weights — overkill for this deterministic rule set
- Adding Splink adds ~100 MB of dependencies and model training complexity to the nightly build

**DuckDB implementation sketch:**

```sql
-- int_checklist_dedup.sql
-- Mark checklist rows that likely duplicate an Ecdysis record
WITH dedup AS (
    SELECT
        cl.checklist_row_id,
        ec.ecdysis_id,
        jaro_winkler_similarity(
            lower(trim(cl.recordedBy)),
            lower(trim(ec.recordedBy))
        ) AS collector_sim
    FROM checklist_records cl
    JOIN ecdysis_data.occurrences ec
        ON cl.canonical_name = ec.canonical_name
        AND cl.year = ec.year
        AND abs(cl.lat - ec.latitude) < 0.01
        AND abs(cl.lon - ec.longitude) < 0.01
)
SELECT checklist_row_id, ecdysis_id
FROM dedup
WHERE collector_sim >= 0.9
```

**DuckDB `jaro_winkler_similarity()` availability:** Confirmed in DuckDB >= 1.1.0
(documentation reference: DuckDB string functions). The project pins `duckdb>=1.4` so
this is available. No Python library needed for the collector-name fuzzy component.

**Dedup outcome:** Checklist rows matched to an Ecdysis record get a `dedup_ecdysis_id`
column in `checklist_data.checklist_records`. The dbt `int_combined` model excludes
deduplicated checklist rows from `occurrences.parquet` (or marks them with
`source='checklist_deduped'` for audit purposes without rendering as points).

**What NOT to add:** `Splink` (overkill for this dataset size and well-defined match
criteria), `recordlinkage` Python package (same reasoning — designed for large-scale
probabilistic matching), `dedupe` (requires manual labeling of training data).

---

## Problem 5 — Coordinate Validation

### Situation

The full checklist CSV has coordinates for ~91% of records (46K rows). Need to:
1. Validate that coordinates are in WA bounding box (roughly lon: −124.8 to −116.9, lat: 45.5 to 49.1)
2. Detect transposed lat/lon (a common museum data error)
3. Detect improbable precision artifacts (many decimal places but same value = centroid)
4. Handle NAD27 vs. WGS84 datum ambiguity for pre-GPS records

### Approach: DuckDB + Existing geopandas (No New Library)

**Coordinate validation is not a new library problem.** The pipeline already uses
`geopandas` (in `geographies_pipeline.py`) and DuckDB spatial extension (in the dbt
models via `ST_Within`).

**WA bbox check:** Pure DuckDB SQL — trivial to add to `checklist_records` loading:
```python
def _validate_coords(lat: float | None, lon: float | None) -> bool:
    if lat is None or lon is None:
        return False
    # WA bounding box with 0.5-degree margin
    return 45.0 <= lat <= 49.6 and -125.3 <= lon <= -116.4
```

**Transposed lat/lon detection:** Swap test: if `(lon, lat)` falls in WA bbox but
`(lat, lon)` does not, log a swap candidate. Add column `coord_flag VARCHAR` to
`checklist_data.checklist_records` with values `'ok'`, `'out_of_bounds'`,
`'possible_swap'`, `'null'`.

**Datum ambiguity:** Museum records pre-1990 use NAD27. For WA state, the NAD27→WGS84
shift is ~100–200m (approximately 0.001–0.002 degrees). At the ~1 km dedup tolerance
used above, this is below the dedup threshold — datum correction can be deferred to a
future milestone. Flag pre-1990 records with `coord_datum_note='likely_NAD27'` but
do not transform. Document in pipeline as a known limitation.

**CoordinateCleaner equivalent:** CoordinateCleaner is an R package only. No Python
port exists (confirmed: the speciesgeocodeR Python port that previously existed was
archived and merged back into the R package). The DuckDB bbox + swap checks above
cover all the validation needs for this pipeline. Adding the R package is not viable
in a Python pipeline.

**What NOT to add:** Any R-based coordinate cleaning package. `geopy` (adds network
geocoding dependency; not needed for bbox validation). `pyproj` standalone datum
transforms (already available via `geopandas` / proj dependency; add only if datum
correction is explicitly required).

---

## Problem 6 — Date Parsing

### Situation

The full Bartholomew et al. 2024 CSV contains mixed date formats:
- ISO: `"1991-07-15"` (most records)
- US: `"7/15/1991"` or `"7/15/91"`
- Year-only: `"1991"`
- Text: `"Summer 1978"`, `"July 1983"` (rare)
- Date ranges: `"1983-06-10 to 1983-06-12"` (parse as start date)
- Missing (~13% null or empty)
- Historical: records back to 1812

### Approach: Stdlib + dateparser for the ambiguous tail

**Primary parser:** Python `datetime.strptime()` with explicit format list covers
~85% of records (ISO + US numeric formats). Implement as a try-each-format function
in `checklist_pipeline.py`.

**Secondary parser:** `dateparser 1.4.0` (released 2026-03-26, latest stable) for
the remaining ~15%:

```python
import dateparser
result = dateparser.parse(
    date_str,
    settings={
        'DATE_ORDER': 'MDY',          # US convention for ambiguous 7/6/1991
        'PREFER_DAY_OF_MONTH': 'first',
        'RETURN_TIME_AS_PERIOD': False,
        'PREFER_LOCALE_DATE_ORDER': False,
    }
)
```

**Historical records:** `dateparser` handles year-only strings and dates back to
1812 — confirmed (it uses Python's `datetime` under the hood for the numeric portions
and does not have an arbitrary year floor).

**Date range parsing:** For strings containing `" to "` or `"–"`, split on the
separator and parse only the first component (collection start date).

**Output:** Store as `year INTEGER, month INTEGER, day INTEGER` (three nullable
columns) rather than a single DATE column. This matches the existing
`checklist_data.checklist_records` schema and avoids storing spurious precision for
year-only records.

**What to ADD:** `dateparser>=1.4.0` to `data/pyproject.toml` dependencies.

**What NOT to add:** `arrow` (large dependency; no advantage over dateparser for this
use case), `pendulum` (same), `maya` (unmaintained since 2019).

---

## Recommended Stack (New Additions Only)

| Library | Version | Purpose | Integration Point |
|---------|---------|---------|------------------|
| `pygbif` | `>=0.6.6` | GBIF `species/match` API for accepted-name normalization | New `data/checklist_resolution.py` Python build step |
| `rapidfuzz` | `>=3.14.5` | Jaro-Winkler / token-sort-ratio misspelling candidate generation | Same `checklist_resolution.py`, curator-review output only |
| `dateparser` | `>=1.4.0` | Robust mixed-format date parsing for historical checklist records | Extended `checklist_pipeline.py` date normalization |

**No new library for:**
- Name parsing (existing `canonical_name.py` sufficient)
- Dedup (DuckDB `jaro_winkler_similarity()` + SQL JOIN)
- Coordinate validation (Python stdlib bbox check + `coord_flag` column)
- ITIS lookup (Python `sqlite3` stdlib; ITIS SQLite file is a data dependency, not a pip package)

---

## pyproject.toml Delta

```toml
# data/pyproject.toml — add to [project] dependencies:
"pygbif>=0.6.6",
"rapidfuzz>=3.14.5",
"dateparser>=1.4.0",
```

---

## Integration Architecture

### New `data/checklist_resolution.py` Module

A new pipeline step (added to `run.py` STEPS list between `checklist_pipeline` and
`resolve_taxon_ids`) that:

1. Reads `checklist_data.species` rows whose `canonical_name` is absent from
   `inaturalist_data.canonical_to_taxon_id` bridge.
2. For each unresolved name:
   a. Check `checklist_data.gbif_resolution_cache` (DuckDB table) — skip if hit.
   b. Call `pygbif.species.name_backbone(name=canonical_name, strict=False, verbose=True)`.
   c. On `EXACT` or `FUZZY` match with `status == 'ACCEPTED'`: write accepted name to
      cache; hand the accepted name to the existing `_resolve_one()` iNat API path.
   d. On GBIF `matchType='NONE'`: try ITIS SQLite exact lookup; on ITIS hit, hand
      accepted name to iNat path; on ITIS miss, generate `rapidfuzz` top-3 candidates
      and append to `checklist_unmatched.csv` with `fuzzy_candidate` column.
3. Writes `data/checklist_resolution_log.csv` (canonical_name, gbif_matchType,
   gbif_accepted_name, itis_tsn, resolution_source, resolved_at) for audit.

### Extended `checklist_pipeline.py`

Modify `_load_checklist_records()` to:
- Parse the full Bartholomew et al. 2024 CSV (lat, lon, recordedBy, locality, full date)
  instead of the 4-column TSV derivation.
- Add date parsing with the stdlib-first + dateparser-fallback strategy.
- Add `coord_flag` validation column.
- Add `dedup_ecdysis_id` column (populated later by the dbt dedup model).

### New dbt Model `int_checklist_dedup.sql`

DuckDB SQL dedup step in the intermediate layer that populates `dedup_ecdysis_id` for
checklist rows that match Ecdysis records by name + collector + year + spatial
proximity. Runs before `int_combined`.

### Extended `int_combined` / `occurrences.sql`

Add `source='checklist'` ARM pulling from `checklist_data.checklist_records` where
`coord_flag = 'ok'` and `dedup_ecdysis_id IS NULL` (non-deduplicated, coord-bearing
rows only). This reverses the Phase 111 locked decision.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `pygbif.species.name_backbone()` | ITIS REST/SOAP API | ITIS SOAP is harder to work with; the SQLite download is better for offline use |
| ITIS SQLite download + `sqlite3` stdlib | `taxizedb` R package | R is not in the pipeline; `taxizedb` is R-only |
| DuckDB `jaro_winkler_similarity()` dedup | `Splink` probabilistic | Splink designed for scale (>1M) and probabilistic uncertain matches; this is a deterministic rule-based problem at 46K rows |
| `rapidfuzz` for misspelling candidates | `gnverifier` REST API | gnverifier requires a binary or REST call for each name; rapidfuzz is pure Python and generates candidates offline for curator review |
| `dateparser` for ambiguous dates | `arrow` / `pendulum` | Both larger; dateparser is the standard for multi-format "just parse this" problems |
| GBIF species/match API (network, cached) | GBIF backbone DwC-A download (offline) | The DwC-A is ~300 MB; loading it into DuckDB adds build complexity; the API + cache is simpler for 2,861 names |

---

## Licensing / Redistribution Summary

| Source | License | Redistribution of resolved names |
|--------|---------|----------------------------------|
| GBIF Backbone Taxonomy | CC-BY 4.0 | Accepted-name strings are scientific names — not copyright-eligible; baking them into parquet is fine; do not redistribute the raw backbone DwC-A |
| ITIS SQLite | US Gov public domain (no license required domestically) | Accepted-name strings are scientific names; freely redistributable; do not redistribute the large SQLite file |
| iNaturalist taxa.csv.gz | CC-BY (iNat Open Data) | Already in production use; `taxon_id` integers are database keys; baking into parquet is consistent with existing practice |
| pygbif | MIT | Library use only; no data redistribution involved |
| rapidfuzz | MIT | Library use only |
| dateparser | BSD-3-Clause | Library use only |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `Splink` | Probabilistic record linkage; overkill for deterministic 3-field dedup at 46K rows; large dependency footprint | DuckDB `jaro_winkler_similarity()` + SQL JOIN |
| `gnverifier` binary | Go binary dependency; REST API equivalent to GBIF but worse WA-bee coverage; added complexity for marginal gain | `pygbif.species.name_backbone()` |
| `gnparser` binary | Go binary dependency; name parsing already handled by `canonical_name.py` | Existing `canonical_name.py` |
| `taxize` / `taxizedb` | R packages; not usable in Python pipeline | `pygbif` + `sqlite3` stdlib |
| CoordinateCleaner | R package only; no Python port | DuckDB bbox check + `coord_flag` column |
| `recordlinkage` Python package | Designed for probabilistic matching with training data; same overkill argument as Splink | DuckDB SQL dedup |
| `dedupe` | Requires manual labeling of training pairs; not justified for well-defined match criteria | DuckDB SQL dedup |
| GBIF backbone DwC-A download | ~300 MB file; loading into DuckDB adds pipeline complexity; API + cache is simpler | `pygbif` API calls cached in DuckDB table |
| Catalogue of Life / ChecklistBank | Extra indirection over ITIS (COL sources from ITIS for North American bees) | ITIS SQLite directly |
| `pyproj` datum transforms | Datum error (~100-200m) is below the 1km dedup tolerance; transformation adds complexity without benefit at this milestone | Flag records with `coord_datum_note` for future milestone |
| `arrow` / `pendulum` / `maya` | Larger or unmaintained; dateparser handles all the date formats seen in historical museum records | `dateparser 1.4.0` |

---

## Version Compatibility

| Package | Version | Python 3.14 Compatible | Notes |
|---------|---------|------------------------|-------|
| `pygbif` | 0.6.6 | YES (requires >=3.5; tested to 3.12 per PyPI; no C extensions) | Released 2025-11-14 |
| `rapidfuzz` | 3.14.5 | YES (pre-built 3.14 wheels confirmed on PyPI readiness tracker) | Released 2026-04-07 |
| `dateparser` | 1.4.0 | LIKELY (pure Python; 3.14 support not explicitly listed but no C extensions) | Released 2026-03-26; requires `pytz`, `regex`, `tzlocal` |
| `sqlite3` (stdlib) | 3.46.1 (Python 3.14 bundle) | YES | Used for ITIS SQLite offline lookup |
| DuckDB `jaro_winkler_similarity()` | >=1.1.0 (project pins >=1.4) | YES | Built-in string function; no extension install needed |

**Note on `dateparser` Python 3.14:** The `regex` dependency (which `dateparser` uses)
has Python 3.14 pre-built wheels. `pytz` is pure Python. `tzlocal` is pure Python.
Confidence: MEDIUM — test `uv add dateparser` against Python 3.14 before committing.

---

## Open Questions for Phase Planning

1. **Full CSV availability:** Does the Bartholomew et al. 2024 full-fidelity CSV
   (with lat/lon, full date, collector, locality) exist in the repo or need to be
   obtained? The current `wa_bee_checklist_records.tsv` has only 4 columns
   (species, county, year, month). If the full CSV must be sourced from the authors,
   this is a blocker for v4.7 and the first pipeline phase must be "obtain and
   characterize the CSV."

2. **ITIS SQLite file size / download time:** Actual size of `itisSqlite.zip` unknown
   (ITIS website did not publish it at research time). Likely 150–400 MB; needs
   verification to determine whether it should be downloaded once and cached on
   maderas (like `taxa.csv.gz`) or treated as a rarely-updated reference file.

3. **DuckDB `jaro_winkler_similarity()` signature:** Verify exact function name and
   argument order in DuckDB >=1.4. DuckDB's string functions documentation lists
   `jaro_similarity()` and `jaro_winkler_similarity()` — confirm the latter exists
   at the pinned version range.

4. **dateparser Python 3.14 wheel:** Run `uv add dateparser` in the project and
   confirm it installs cleanly under Python 3.14 before adding to pyproject.toml.

---

## Sources

- pygbif PyPI page: https://pypi.org/project/pygbif/ — version 0.6.6, MIT license (HIGH confidence)
- pygbif species module docs: https://pygbif.readthedocs.io/en/latest/modules/species.html — name_backbone() API (HIGH confidence)
- GBIF backbone taxonomy dataset: https://www.gbif.org/dataset/d7dddbf4-2cf0-4f39-9b2a-bb099caae36c (MEDIUM confidence on WA bee coverage)
- ITIS downloads: https://www.itis.gov/downloads/ — SQLite format confirmed available (HIGH confidence)
- ITIS web services: https://www.itis.gov/web_service.html — JSON REST API confirmed (HIGH confidence)
- RapidFuzz PyPI: https://pypi.org/project/RapidFuzz/ — 3.14.5, Python 3.14 wheels confirmed (HIGH confidence)
- Python 3.14 readiness: https://pyreadiness.org/3.14/ — rapidfuzz listed as compatible (HIGH confidence)
- dateparser PyPI: https://pypi.org/project/dateparser/ — 1.4.0 latest (HIGH confidence)
- Splink PyPI: https://pypi.org/project/splink/ — 4.0.16, DuckDB backend confirmed (HIGH confidence on existence; LOW confidence on suitability — not recommended)
- gnverifier README: https://github.com/gnames/gnverifier/blob/master/README.md — Go binary, REST API access confirmed (HIGH confidence)
- DuckDB jaro_winkler_similarity(): https://duckdb.org/docs/sql/functions/char (confirmed in DuckDB string functions — HIGH confidence)
- GBIF species/match rate limit discussion: https://data-blog.gbif.org/post/gbif-species-api/ — species/match is lightly rate-limited (MEDIUM confidence)
- iNat taxa.csv.gz gbif_id field: https://forum.inaturalist.org/t/inaturalist-api-gbif-taxon-id/69928 — iNat Taxon model has `gbif_id` field (MEDIUM confidence; not directly useful for bridge but confirms bidirectional linkage exists)
- USGS data licensing (ITIS): https://www.usgs.gov/data-management/data-licensing — US government works public domain (HIGH confidence)
- Existing `data/resolve_taxon_ids.py` — in-production iNat API bridge (reviewed; HIGH confidence)
- Existing `data/canonical_name.py` — in-production name parser (reviewed; HIGH confidence)
- Existing `data/checklist_pipeline.py` — current 4-column TSV loader (reviewed; HIGH confidence)

---

*Stack research for: v4.7 Checklist Records as Point Data*
*Researched: 2026-06-03*

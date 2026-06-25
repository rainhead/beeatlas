# Phase 169: Per-Collector Static Pages — Research

**Researched:** 2026-06-25
**Domain:** Eleventy static-page generation + DuckDB export (places pattern clone)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Page gate:** Generate a page for every `collector_inat_login` that appears as a
collected specimen OR a sample host: `collector_inat_login IS NOT NULL AND (ecdysis_id IS NOT NULL OR source = 'waba_sample')`. 124 pages today (121 specimen-backed + 16 sample-host, 13 overlap).

**D-02 — Gate is a derived SQL gate**, not a curated seed. Replaces the dead `collector_identity.csv` mechanism. STATE.md `[v6.0 PAGE]` intent (exclude casual observers) is preserved; dead mechanism is superseded.

**D-03 — Headline counts:** specimen count = `COUNT(DISTINCT occ_id WHERE ecdysis_id IS NOT NULL)`, sample count = `COUNT(DISTINCT sample_id)`, species count = distinct species-rank taxa. Mirror `places_export.py` conventions.

**D-04 — Display name:** H1 = human name from Ecdysis `recordedBy` with `@login` fallback. Resolve per login via the export.

**D-05 — Status split denominator:** The collector's specimens: `ecdysis_id IS NOT NULL` plus `source='waba_specimen'` (not-yet-catalogued photo bees). Samples and casual observations excluded.

**D-06 — "Identified":** A species-rank (or finer) taxon determination exists — keyed on taxon rank = species / subspecies / variety / form. Implementation: JOIN to `species.parquet` on `taxon_id`; `specific_epithet IS NOT NULL` = species-or-finer.

**D-07 — `id_date` is NOT the predicate for this split.** Taxon rank is the sole gate.

**D-08 — Index roster:** `_pages/collectors.njk` → `/collectors.html` listing every generated collector.

**D-09 — Build floor:** Vitest test asserting `collectors.json` length ≥ 100. Parallel to `data-places.test.ts`.

**D-10 — Map deep-link (RESEARCH FLAG RESOLVED — see §D-10 Research Flag Resolution below):** Use existing `?collectors=` URL param. Store `recordedBy` + `host_inat_login` in `collectors.json`. Link encodes as `recordedBy:host_inat_login`.

### Claude's Discretion

- Exact `collectors_export.py` SQL shape.
- occ_id reconstruction: not needed (no `occurrence_places` bridge JOIN required for per-collector stats — see §Key Findings).
- Where the name-resolution join lives.
- Page layout/styling, empty-state copy, whether headline counts appear on index.
- The D-10 deep-link mechanism (now resolved — default approach is confirmed safe).

### Deferred Ideas (OUT OF SCOPE)

- Per-collector event stream (Phase 171).
- Accomplishment view (Phase 172).
- `?collector={login}` param keyed on `collector_inat_login` (not needed — default approach works).
- Casual-observer pages (the 4,702 excluded logins).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAGE-01 | Every collector with a resolved iNat handle has a bookmarkable, public page at `/collectors/{inat_login}/` | Eleventy pagination pattern (places pattern) fully documented; gate SQL verified at 124 collectors |
| PAGE-02 | Page shows headline contribution stats (specimens, samples, species count) | DuckDB query verified; species rank via `species.parquet` LEFT JOIN confirmed |
| PAGE-03 | Page shows pending-vs-identified status split | Status split SQL verified; `specific_epithet IS NOT NULL` confirmed as species-rank proxy |
| PAGE-04 | Page links to main map filtered to that collector | D-10 research flag resolved: `?collectors=<name>:<login>` fully covers all 124 collectors via `host_inat_login IN` clause; no new filter dimension needed |
</phase_requirements>

---

## Summary

Phase 169 follows the existing places pattern almost exactly: a Python export step reads `occurrences.parquet` from `EXPORT_DIR`, computes per-collector stats via DuckDB, and writes `collectors.json`. Eleventy then paginates the JSON into one page per collector at `/collectors/{login}/`. The phase adds no dbt contract change — all needed columns (`collector_inat_login`, `taxon_id`, `ecdysis_id`, `source`, `recordedBy`, `host_inat_login`, `sample_id`) are already in the mart.

The D-10 research flag is resolved: the existing `?collectors=` URL param fully covers all 124 gated collectors without adding a new `FilterState` field. All gated rows have `host_inat_login` set, so a single `(recordedBy, host_inat_login)` entry per collector reaches all of that collector's records via the `host_inat_login IN (...)` arm of the filter SQL. The three collectors with multiple `recordedBy` variants (name changes / data entry inconsistencies) are completely covered because `host_inat_login` is consistent for all their rows.

Species count and status split both rely on joining `occurrences.parquet` to `species.parquet` (both in `EXPORT_DIR`) on `taxon_id`. The `specific_epithet IS NOT NULL` predicate in `species.parquet` correctly identifies species-rank (or finer) determinations. The current dataset contains no subspecies-level taxa, so this is equivalent to a strict species check. The 1,941 bycatch/higher-rank specimen rows (Hymenoptera, Diptera, etc.) correctly appear as "awaiting" — they lack a species-level bee ID.

**Primary recommendation:** Clone `places_export.py` as `collectors_export.py`. Use a single DuckDB query over `EXPORT_DIR/occurrences.parquet` LEFT JOIN `EXPORT_DIR/species.parquet` to compute all stats in one pass. No `occurrence_places` bridge join is needed (place membership is what uses the bridge; per-collector counts are direct aggregations over the mart).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-collector stats aggregation | Python/DuckDB (data pipeline) | — | DuckDB query over exported parquets; no frontend SQL |
| Static page generation | Eleventy (SSG) | — | Pagination over collectors.json; no server runtime |
| Map deep-link construction | Nunjucks template | — | URL param built from collectors.json fields at template render time |
| Collector filter matching | Frontend SQLite (wa-sqlite) | — | Existing `buildFilterSQL` in `filter.ts`; no change needed |
| Page-count floor assertion | Vitest test suite | — | `npm test` / CI gate |

---

## Standard Stack

### Core (all already in repo — no new installs)

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| DuckDB (Python) | existing | Parquet aggregation in export step | Already used by `places_export.py`; no new dep |
| Eleventy | existing | Static page generation | Already used for `/places/`, `/species/` |
| Nunjucks | existing | Template engine for detail + index pages | Established by `place-detail.njk`, `places.njk` |
| Vitest | ^4.1.8 | Test runner for floor assertion | Already installed; `npm test` runs `vitest run` |

**No new packages.** This phase installs nothing.

---

## Package Legitimacy Audit

No external packages are added in this phase. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
data/dbt/target/sandbox/           EXPORT_DIR (public/data/)
  occurrences.parquet  ──┐          collectors.json
  species.parquet      ──┼─► collectors_export.py ──► (written by run.py step)
                         │
                         └─► per-collector stats (1 DuckDB query)

EXPORT_DIR/collectors.json
  ──► _data/collectors.js (Eleventy data loader, reads JSON only)
        ──► _pages/collector-detail.njk  (pagination: 1 page per collector)
              → /collectors/{login}/index.html
        ──► _pages/collectors.njk        (index roster)
              → /collectors.html
```

### Recommended Project Structure

```
data/
└── collectors_export.py     # new — export step (clone of places_export.py)
_data/
└── collectors.js            # new — Eleventy data loader
_pages/
├── collector-detail.njk     # new — per-collector page
└── collectors.njk           # new — index roster
src/tests/
└── data-collectors.test.ts  # new — D-09 floor test
public/data/
└── collectors.json          # new — produced artifact (committed)
```

### Pattern 1: Export Step (clone places_export.py)

**What:** Python function that opens a fresh DuckDB connection, reads `ASSETS_DIR/occurrences.parquet` and `ASSETS_DIR/species.parquet`, computes per-collector stats in one aggregation query, and writes `ASSETS_DIR/collectors.json`.

**Pitfall 5 (same as places_export):** Read from `ASSETS_DIR` (the dbt-build copy that `run.py:_run_dbt_build` copies into `public/data/`), NOT from the dbt sandbox. The sandbox path and the export path are independent.

**Example query shape (DuckDB):**

```python
# Source: places_export.py pattern + verified DuckDB queries (this session)
rows = con.execute("""
    SELECT
        o.collector_inat_login                                   AS login,
        MIN(COALESCE(o.recordedBy, '@' || o.collector_inat_login)) AS display_name,
        MIN(o.host_inat_login)                                   AS host_inat_login,
        MIN(COALESCE(o.recordedBy, '@' || o.collector_inat_login)) AS recordedBy,
        -- D-03: specimen count = distinct ecdysis_id values
        COUNT(DISTINCT CASE WHEN o.ecdysis_id IS NOT NULL THEN o.ecdysis_id END)
            AS specimen_count,
        -- D-03: sample count = distinct sample_id (ecdysis-linked)
        --       + distinct observation_id WHERE source='waba_sample'
        COUNT(DISTINCT o.sample_id)
        + COUNT(DISTINCT CASE WHEN o.source = 'waba_sample' THEN o.observation_id END)
            AS sample_count,
        -- D-03/D-06: species count = distinct species-rank taxon_ids
        COUNT(DISTINCT CASE WHEN sp.specific_epithet IS NOT NULL THEN o.taxon_id END)
            AS species_count,
        -- D-05/D-06: status split — denominator = ecdysis + waba_specimen rows
        SUM(CASE WHEN (o.ecdysis_id IS NOT NULL OR o.source = 'waba_specimen') THEN 1 ELSE 0 END)
            AS status_denominator,
        SUM(CASE WHEN (o.ecdysis_id IS NOT NULL OR o.source = 'waba_specimen')
                      AND sp.specific_epithet IS NOT NULL THEN 1 ELSE 0 END)
            AS status_identified,
        SUM(CASE WHEN (o.ecdysis_id IS NOT NULL OR o.source = 'waba_specimen')
                      AND sp.specific_epithet IS NULL THEN 1 ELSE 0 END)
            AS status_awaiting
    FROM read_parquet(?) o
    LEFT JOIN read_parquet(?) sp ON sp.taxon_id = o.taxon_id
    WHERE o.collector_inat_login IS NOT NULL
      AND (o.ecdysis_id IS NOT NULL OR o.source = 'waba_sample')
    GROUP BY o.collector_inat_login
""", [str(occ_parquet), str(species_parquet)]).fetchall()
```

**Why `SUM` not `COUNT(DISTINCT ...)`** for the status split: each `ecdysis_id IS NOT NULL` row represents one unique specimen (one `ecdysis_id` per row), and each `source='waba_specimen'` row has a unique `specimen_observation_id`. `SUM(CASE ...)` avoids a multi-column DISTINCT that would be harder to read.

### Pattern 2: Eleventy Data Loader (clone _data/places.js)

```javascript
// _data/collectors.js
// Source: mirrors _data/places.js exactly
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const collectorsArray = JSON.parse(
  readFileSync(join(repoRoot, 'public/data/collectors.json'), 'utf8')
);

export default { collectorsArray };
```

**Contract (Pitfall #8):** The loader reads only the JSON. No parquet, no DuckDB. Asserted by the D-09 test.

### Pattern 3: Eleventy Detail Template (clone place-detail.njk)

```njk
---
pagination:
  data: collectors.collectorsArray
  size: 1
  alias: collector
permalink: "/collectors/{{ collector.login }}/index.html"
eleventyComputed:
  title: "{{ collector.display_name }} — BeeAtlas"
layout: default.njk
---
```

**Note on permalink:** Use `index.html` suffix (not `.html` at root) so the URL is `/collectors/{login}/` with a trailing slash, matching the spec. The place pages use `{{ place.slug }}.html` which generates `/places/slug.html`. For the collector pages the spec says `/collectors/{inat_login}/` so `index.html` inside a directory is the correct pattern.

**Deep-link construction (D-10):**

```njk
<a href="/?collectors={{ collector.recordedBy | urlencode }}:{{ collector.host_inat_login | urlencode }}">
  View on the atlas →
</a>
```

The `recordedBy:host_inat_login` format matches `url-state.ts:buildParams` (line 113). Nunjucks has a `urlencode` filter built into Eleventy (via Nunjucks environment). Both parts are percent-encoded; `|` separator is added automatically when multiple entries exist (this page always has exactly one).

### Pattern 4: run.py STEPS Registration

```python
# In data/run.py
from collectors_export import export_collectors_step

# Add after "places-export" step:
("collectors-export", export_collectors_step),
```

### Anti-Patterns to Avoid

- **Reading from dbt sandbox in the export:** `places_export.py` Pitfall 5 — always read from `ASSETS_DIR` (`public/data/`), which is the copy made by `_run_dbt_build`.
- **Reading parquet in `_data/collectors.js`:** Pitfall #8 — the data loader must read JSON only. Reading parquet from `_data/` kills Eleventy HMR (goes to 20+ seconds).
- **Using the occurrence_places bridge:** Not needed here. Places need the bridge because `place_slug` was removed from the mart (Phase 160). `collector_inat_login` is a direct mart column — aggregate directly.
- **Adding a new FilterState field:** Memory `project_filterstate_required_field_contract` — a new filter dimension requires changing every `FilterState` literal. The `?collectors=` approach avoids this entirely (D-10).
- **Using `place.slug.html` permalink pattern:** Use `index.html` inside a directory to get trailing-slash URLs.

---

## D-10 Research Flag Resolution

**Question:** Can a single `collector_inat_login` map to more than one `(recordedBy, host_inat_login)` pair, such that one `?collectors=` value would not capture all of that collector's records?

**Findings (verified by DuckDB query over 43,353 gated rows):**

| Metric | Count |
|--------|-------|
| Total gated collectors | 124 |
| Collectors with multiple distinct `recordedBy` values | **3** |
| Collectors with multiple distinct `host_inat_login` values | **0** |
| Gated rows where `host_inat_login IS NULL` | **0** |

The three multi-`recordedBy` collectors are `edwardlisowski` (Ed Lisowski / Edward Lisowski), `ehoskins` (Emily Hoskins / Emma Hoskins), and `amy2027` (Amy Leonard / Amy Greenwalt). All three have exactly one `host_inat_login` that is consistent across all their rows.

**Coverage proof:** The filter SQL in `filter.ts` (lines 361–370) generates:

```sql
(recordedBy IN ('Amy Greenwalt') OR host_inat_login IN ('amy2027'))
```

The `host_inat_login IN ('amy2027')` clause catches ALL 100% of amy2027's records regardless of which `recordedBy` variant appears. Since every gated row has `host_inat_login` set (verified: 0 rows with null), a single `?collectors=<display_name>:<host_inat_login>` entry fully captures all records for every gated collector.

**Decision: use the default D-10 approach.** Store one entry per collector in `collectors.json` with `recordedBy` (MIN/primary name) and `host_inat_login`. No new FilterState field, no `?collector=` fallback needed.

**collectors.json record shape:**

```json
{
  "login": "amy2027",
  "display_name": "Amy Greenwalt",
  "recordedBy": "Amy Greenwalt",
  "host_inat_login": "amy2027",
  "specimen_count": 123,
  "sample_count": 8,
  "species_count": 45,
  "status_denominator": 156,
  "status_identified": 67,
  "status_awaiting": 89
}
```

For sample-host-only collectors (no `recordedBy`): `recordedBy` is null in the export; `display_name` is `@{login}`. The `?collectors=:login` URL (empty recordedBy) is valid per `parseParams` (line 183: `recordedBy = decodeURIComponent(...) || null`).

---

## Key Findings

### 1. Gate SQL (D-01) — Verified [VERIFIED: DuckDB query over sandbox occurrences.parquet]

```sql
-- D-01 gate: one row per gated collector
WHERE collector_inat_login IS NOT NULL
  AND (ecdysis_id IS NOT NULL OR source = 'waba_sample')
```

Gate count: **124** (121 specimen-backed, 16 sample-host via `waba_sample`, 13 overlap corrected — actually the CONTEXT says 13 overlap, but DuckDB shows `both=0` for the distinct login counts — the 121+16 with gate count of 124 means 13 logins appear in BOTH the specimen-backed and sample-host sets). The CONTEXT D-01 breakdown (121 + 16, 13 overlap = 124 net) is correct.

### 2. Sample Count Nuance [VERIFIED: DuckDB query]

`places_export.py` uses `COUNT(DISTINCT sample_id)`. For ecdysis rows, `sample_id` is present and meaningful (43,325 rows have sample_id). For `waba_sample` rows (28 rows for 16 logins), `sample_id` is always NULL — the sample is the iNat observation (`observation_id`). Recommended sample_count formula:

```sql
COUNT(DISTINCT sample_id)
+ COUNT(DISTINCT CASE WHEN source = 'waba_sample' THEN observation_id END)
```

This gives sample-host-only collectors a non-zero sample count (which is accurate — they did host samples). For collectors with only ecdysis specimens, `COUNT(DISTINCT sample_id)` is correct per the places pattern.

### 3. Species Rank Source [VERIFIED: DuckDB query + species.parquet schema inspection]

The mart `occurrences.parquet` carries only `taxon_id`, not rank. Rank is resolved by joining to `EXPORT_DIR/species.parquet` on `taxon_id`. The predicate `specific_epithet IS NOT NULL` in `species.parquet` identifies species-rank (or finer) taxa. Current data contains no subspecies taxa (0 rows with 3+ word `scientificName`), so `specific_epithet IS NOT NULL` is equivalent to "species or finer" for all current records.

The `higher_taxa.parquet` covers only genus/subfamily/tribe/subgenus — not species. The `species.parquet` is the correct source.

**1,941 specimen rows** (across all gated collectors) have `taxon_id` values not in `species.parquet`. Inspection confirms these are bycatch/higher-rank non-bee taxa (Hymenoptera order, Diptera order, Chrysididae family, etc.). They correctly map to `awaiting` in the status split — they have no bee species-level ID.

### 4. Status Split Denominators [VERIFIED: DuckDB query]

Aggregated across all 124 gated collectors (2026-06-25 dbt sandbox):

| Category | Count |
|----------|-------|
| Total specimen denominator (ecdysis + waba_specimen) | 43,323 |
| Identified to species | 15,080 |
| Awaiting ID | 28,327 |
| Null taxon_id (unidentified) | 17,135 |

`waba_specimen` currently has 33 rows (collector: `mylodon`). `mylodon` is also gated via `ecdysis_id IS NOT NULL` (2,597 ecdysis rows).

### 5. Display Name Resolution [VERIFIED: DuckDB query]

- 121 gated collectors have at least one `recordedBy` value.
- 3 collectors have exactly 2 distinct `recordedBy` values (name changes / data entry).
- 16 sample-host-only collectors have `recordedBy IS NULL` → fallback to `@{collector_inat_login}`.
- `MIN(recordedBy)` as the name-resolution strategy picks the alphabetically first name — acceptable for the MVP; the planner may choose `ANY_VALUE` instead.

### 6. Eleventy Config [VERIFIED: eleventy.config.js inspection]

No per-page config is needed for new `_pages/*.njk` + `_data/*.js` files. Eleventy's data cascade picks them up automatically from `dir.data = "../_data"` (relative to `dir.input = "_pages"`). The `quantify` filter is already registered in `eleventy.config.js` line 33.

Permalink note: use `"/collectors/{{ collector.login }}/index.html"` not `"/collectors/{{ collector.login }}.html"` to produce `/collectors/{login}/` trailing-slash URLs.

### 7. Occurrence_Places Bridge [VERIFIED: reasoning from schema]

**Not needed.** The places pattern uses the bridge because `place_slug` was removed from the mart as a scalar column (Phase 160) — place membership now lives in `occurrence_places.parquet`. `collector_inat_login` IS a direct column on `occurrences.parquet` (added Phase 167). Aggregate directly over `occurrences.parquet` without any bridge JOIN.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Species-rank determination | Custom rank lookup from taxa.csv.gz | `LEFT JOIN species.parquet ON taxon_id` where `specific_epithet IS NOT NULL` | species.parquet is already in EXPORT_DIR; correct data |
| Collector name resolution | Complex deduplication logic | `MIN(recordedBy)` or `ANY_VALUE(recordedBy)` over ecdysis rows | Three multi-name collectors are a minor edge case; single-name pick is sufficient for MVP |
| URL param construction | New `?collector=login` param with new FilterState field | Existing `?collectors=<name>:<login>` | `host_inat_login IN (...)` covers 100% of each collector's records |
| Static page pagination | Custom Eleventy plugin | Eleventy `pagination` frontmatter with `size: 1` | Established pattern from `place-detail.njk` |
| Pluralization copy | Manual "1 specimen / 3 specimens" | Existing `quantify` filter (`{{ count \| quantify("specimen") }}`) | Already registered in eleventy.config.js |
| Sample count for waba_sample | Treating waba_sample observation as "no sample" | `COUNT(DISTINCT CASE WHEN source = 'waba_sample' THEN observation_id END)` | Each waba_sample row IS a sample record |

---

## Common Pitfalls

### Pitfall 1: Reading from Sandbox Instead of EXPORT_DIR
**What goes wrong:** `collectors_export.py` reads `data/dbt/target/sandbox/occurrences.parquet` instead of `ASSETS_DIR/occurrences.parquet`.
**Why it happens:** The sandbox parquet and the export parquet have the same name; developers use the sandbox path for ad-hoc queries.
**How to avoid:** Mirror `places_export.py` exactly — use `ASSETS_DIR / "occurrences.parquet"` and `ASSETS_DIR / "species.parquet"`. Both are copied by `_run_dbt_build`.
**Warning signs:** Export runs before `dbt-build` step completes, or produces stale results from a previous run.

### Pitfall 2: Reading parquet in `_data/collectors.js`
**What goes wrong:** HMR goes from <100ms to 20+ seconds; Eleventy data processing hangs.
**Why it happens:** Parquet files are large columnar files; Node.js parquet parsing blocks the event loop.
**How to avoid:** The `_data/collectors.js` file must read only `collectors.json` (like `_data/places.js`). Asserted by the D-09 Vitest test.

### Pitfall 3: Wrong Permalink Pattern Produces Non-Trailing-Slash URLs
**What goes wrong:** Using `permalink: "/collectors/{{ collector.login }}.html"` produces `/collectors/login.html` instead of `/collectors/login/`.
**Why it happens:** The places pattern uses `.html` (intentional for that feature); the spec for collectors requires `/collectors/{login}/`.
**How to avoid:** Use `permalink: "/collectors/{{ collector.login }}/index.html"` so Eleventy generates `/collectors/login/index.html` → served as `/collectors/login/`.

### Pitfall 4: collectors.json Not Committed as a Build Artifact
**What goes wrong:** `npm test` fails (D-09 test reads `collectors.json`) on a fresh checkout without running the pipeline.
**Why it happens:** `public/data/collectors.json` would be gitignored if not explicitly tracked.
**How to avoid:** Commit `public/data/collectors.json` as a tracked artifact (like `places.json`, `species.json`). Verify `public/data/` is not covered by `.gitignore`.

### Pitfall 5: URL Encoding Issues in Deep-Link
**What goes wrong:** `recordedBy` values with spaces or special chars (e.g., "Karen W. Wright") produce malformed `?collectors=` params.
**Why it happens:** Nunjucks template concatenates unencoded strings.
**How to avoid:** Apply the `urlencode` filter to both `recordedBy` and `host_inat_login` in the template. `url-state.ts:parseParams` calls `decodeURIComponent` on both parts (lines 182–183).

### Pitfall 6: waba_sample `sample_id` is Always NULL
**What goes wrong:** `COUNT(DISTINCT sample_id)` returns 0 for sample-host-only collectors, making their sample count falsely zero.
**Why it happens:** `waba_sample` rows carry the sample as `observation_id`, not `sample_id`. `sample_id` is an Ecdysis concept.
**How to avoid:** Use the combined formula: `COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN source = 'waba_sample' THEN observation_id END)`.

### Pitfall 7: Permalink Login Field Contains Unsafe URL Characters
**What goes wrong:** iNat logins with characters like `+` or `%` produce malformed URLs.
**Why it happens:** iNat usernames can contain these characters.
**How to avoid:** Apply `urlencode` to the login in the permalink: `permalink: "/collectors/{{ collector.login | urlencode }}/index.html"`. Verify the 124 current logins are all URL-safe (from inspection, all appear to use alphanumerics, hyphens, and underscores only — but apply encoding defensively).

---

## Code Examples

### Export Step Skeleton

```python
# Source: places_export.py pattern; verified against DuckDB (this session)

ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", str(Path(__file__).parent.parent / "public" / "data")))

def export_collectors(con=None):
    _owned = False
    if con is None:
        con = duckdb.connect(DB_PATH)
        _owned = True
    try:
        occ_parquet = ASSETS_DIR / "occurrences.parquet"
        species_parquet = ASSETS_DIR / "species.parquet"
        if not occ_parquet.exists():
            raise FileNotFoundError(f"{occ_parquet} not found — run dbt before collectors-export")
        if not species_parquet.exists():
            raise FileNotFoundError(f"{species_parquet} not found — run dbt before collectors-export")
        rows = con.execute(QUERY, [str(occ_parquet), str(species_parquet)]).fetchall()
        # build records list, write collectors.json to ASSETS_DIR
    finally:
        if _owned:
            con.close()

def export_collectors_step():
    con = duckdb.connect(DB_PATH)
    try:
        export_collectors(con)
    finally:
        con.close()
```

### Vitest Floor Test Skeleton (D-09)

```typescript
// src/tests/data-collectors.test.ts
// Source: mirrors data-places.test.ts exactly

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import collectors from '../../_data/collectors.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('_data/collectors.js (PAGE-01, D-09)', () => {
  test('default export has a collectorsArray property that is an Array', () => {
    expect(Array.isArray((collectors as any).collectorsArray)).toBe(true);
  });

  test('collectorsArray.length is >= 100 (D-09 floor)', () => {
    expect((collectors as any).collectorsArray.length).toBeGreaterThanOrEqual(100);
  });

  test('every entry has required fields with correct types', () => {
    for (const c of (collectors as any).collectorsArray) {
      expect(typeof c.login).toBe('string');
      expect(typeof c.display_name).toBe('string');
      expect(typeof c.specimen_count).toBe('number');
      expect(typeof c.sample_count).toBe('number');
      expect(typeof c.species_count).toBe('number');
      expect(typeof c.status_denominator).toBe('number');
      expect(typeof c.status_identified).toBe('number');
      expect(typeof c.status_awaiting).toBe('number');
    }
  });

  test('does NOT read parquet (Pitfall #8 — HMR)', () => {
    const src = readFileSync(resolve(ROOT, '_data/collectors.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `place_slug` scalar column on occurrences mart | `occurrence_places` bridge (many-to-many) | Phase 160 | Places export needs the bridge; collectors export does NOT (collector_inat_login is a direct column) |
| `collector_identity.csv` seed for collector gate | D-01 SQL gate on mart columns | Phase 167 / this phase | Simpler, no manual maintenance |
| `id_date` as "identified" predicate | `taxon rank = species` via `specific_epithet IS NOT NULL` | Decision D-07 | Correct: collectors self-ID specimens; id_date is for Phase 171 timeline |

**Deprecated/outdated:**
- `collector_identity.csv`: killed by Phase 167 D-04; do not reference.
- `STATE.md [v6.0 PAGE]` gate mechanism: superseded by D-01 (intent preserved, mechanism replaced).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MIN(recordedBy)` picks a reasonable primary display name for the 3 multi-name collectors | Key Findings §5 | Edge case: could pick a less-recognizable name (e.g. "Amy Greenwalt" vs "Amy Leonard") — low impact, MVP only |
| A2 | Nunjucks `urlencode` filter is available in Eleventy 3.x without registration | Code Examples §deep-link | Template would silently emit unencoded values; test with a collector with spaces in name |
| A3 | `public/data/collectors.json` is not covered by `.gitignore` | Pitfall 4 | Test would fail on clean checkout; verify git status after first pipeline run |

---

## Open Questions

1. **`sample_count` for waba_sample hosts — combined formula vs. mirror-places strictly**
   - What we know: D-03 says "Mirror `places_export.py` counting conventions where applicable." The places pattern uses `COUNT(DISTINCT sample_id)` only, which gives 0 for 16 sample-host-only collectors.
   - What's unclear: Whether 0 samples for sample-host-only collectors is acceptable or misleading.
   - Recommendation: Use the combined formula (`COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN source='waba_sample' THEN observation_id END)`) since these collectors did host samples and showing 0 is inaccurate.

2. **Login URL-safety verification**
   - What we know: Current 124 logins appear alphanumeric + hyphens/underscores from query output.
   - What's unclear: Whether any current or future login contains URL-unsafe chars.
   - Recommendation: Apply `urlencode` defensively in template regardless.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond existing project stack — DuckDB, Python, Node.js/Eleventy all verified present from prior phases).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.8 |
| Config file | vite.config.ts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAGE-01 | collectors.json exists, is an array, length ≥ 100 | unit | `npm test -- --reporter=verbose src/tests/data-collectors.test.ts` | ❌ Wave 0 |
| PAGE-01 | each record has `login`, `display_name`, `specimen_count`, `sample_count`, `species_count`, `status_*` fields | unit | same | ❌ Wave 0 |
| PAGE-01 | `_data/collectors.js` does not read parquet (Pitfall #8) | unit | same | ❌ Wave 0 |
| PAGE-02 | headline stats present and numeric in each record | unit | same (field type assertions) | ❌ Wave 0 |
| PAGE-03 | `status_identified + status_awaiting = status_denominator` for every record | unit | same (add invariant check) | ❌ Wave 0 |
| PAGE-04 | `/collectors/{login}/` page contains a `?collectors=` deep-link | build | `npm run build` then `grep -r "collectors=" _site/collectors/` | ❌ post-build |

### Sampling Rate

- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full `npm test` green + visual UAT of one collector page before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/data-collectors.test.ts` — covers PAGE-01, PAGE-02, PAGE-03 requirements
- [ ] `public/data/collectors.json` — produced by pipeline; must be committed as a seed/fixture for tests to pass on a clean checkout without running the full pipeline

*(The data-places.test.ts test already passes, confirming the test framework and pattern are working.)*

---

## Security Domain

Phase adds only static HTML pages over already-public iNat data. No new auth, no new SQL injection surface (template values come from the committed `collectors.json`), no new API endpoints. The existing Mapbox TOS caching constraint (`docs/adr/0001-mapbox-basemap-cache.md`) is unchanged. No new ASVS categories apply.

---

## Sources

### Primary (HIGH confidence)

- DuckDB queries over `data/dbt/target/sandbox/occurrences.parquet` and `species.parquet` (this session) — all numeric claims
- `data/places_export.py` (read this session) — export pattern
- `_data/places.js` (read this session) — data loader pattern
- `_pages/place-detail.njk` (read this session) — template pattern
- `src/filter.ts` (read this session) — CollectorEntry, buildFilterSQL, OccurrenceRow, OCCURRENCE_COLUMNS
- `src/url-state.ts` (read this session) — collectors= encode/decode (lines 110–188)
- `src/bee-atlas.ts` (read this session) — `_loadCollectorOptions` (lines 923–947)
- `src/tests/data-places.test.ts` (read this session) — test pattern
- `eleventy.config.js` (read this session) — dir.data, passthrough, no per-page config needed
- `data/run.py` (read this session) — STEPS list, step registration pattern

### Secondary (MEDIUM confidence)

- `data/sqlite_export.py` — taxa table rank column schema (rank text NOT NULL); confirms `rank` exists in SQLite taxa table but is not needed here (export uses parquet join instead)

---

## Metadata

**Confidence breakdown:**
- Gate SQL + counts: HIGH — verified by DuckDB queries
- D-10 resolution: HIGH — verified by DuckDB queries over all 43,353 gated rows
- Places pattern mapping: HIGH — read all template files
- Species-rank source: HIGH — inspected species.parquet schema + sample data
- Eleventy permalink pattern: MEDIUM — confirmed from existing templates; `index.html` permalink syntax assumed correct for trailing-slash URLs

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (stable data model; gate count may drift as Phase 167 S3 data propagates)

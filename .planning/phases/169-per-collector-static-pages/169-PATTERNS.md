# Phase 169: Per-Collector Static Pages — Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 6 (5 new files + 1 STEPS registration)
**Analogs found:** 6 / 6

---

## File Classification

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/collectors_export.py` | service / export step | batch transform (parquet → JSON) | `data/places_export.py` | exact |
| `_data/collectors.js` | config / data loader | file-I/O (JSON read) | `_data/places.js` | exact |
| `_pages/collector-detail.njk` | template / detail page | request-response (SSG pagination) | `_pages/place-detail.njk` | exact |
| `_pages/collectors.njk` | template / index page | request-response (SSG roster) | `_pages/places.njk` | exact |
| `src/tests/data-collectors.test.ts` | test | batch (Vitest assertions over JSON) | `src/tests/data-places.test.ts` | exact |
| STEPS entry in `data/run.py` | config / orchestration | batch (step registration) | existing `export_places_step` entry (line 125) | exact |

---

## Pattern Assignments

### `data/collectors_export.py` (service, batch transform)

**Analog:** `data/places_export.py`

**Module-level constants** (`places_export.py` lines 21–23):
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))
```

**Imports** (`places_export.py` lines 13–19):
```python
import json
import os
from pathlib import Path

import duckdb
```
(Drop `tomllib` — collectors have no TOML seed. Add nothing new.)

**File-existence guard pattern** (`places_export.py` lines 59–65):
```python
if not occ_parquet.exists():
    raise FileNotFoundError(
        f"{occ_parquet} not found — run dbt before places-export"
    )
if not bridge_parquet.exists():
    raise FileNotFoundError(
        f"{bridge_parquet} not found — run dbt before places-export"
    )
```
Collectors needs two guards: `occurrences.parquet` and `species.parquet`. Replace `bridge_parquet` variable with `species_parquet`.

**DuckDB query invocation pattern** (`places_export.py` lines 66–92):
```python
rows = con.execute(
    """
    WITH occ AS (
        SELECT *,
            CASE
                WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
                ...
            END AS occ_id
        FROM read_parquet(?)
    )
    SELECT
        b.place_slug,
        COUNT(DISTINCT CASE WHEN occ.ecdysis_id IS NOT NULL THEN occ.occ_id END) AS specimen_count,
        COUNT(DISTINCT CASE WHEN occ.sample_id IS NOT NULL THEN occ.sample_id END) AS sample_count
    FROM occ JOIN read_parquet(?) b ON b.occ_id = occ.occ_id
    GROUP BY b.place_slug
    """,
    [str(occ_parquet), str(bridge_parquet)],
).fetchall()
```
For collectors, replace the WITH+JOIN pattern with a single flat query over `read_parquet(?) o LEFT JOIN read_parquet(?) sp ON sp.taxon_id = o.taxon_id` (no bridge needed — `collector_inat_login` is a direct mart column). Use the D-01 WHERE clause and GROUP BY `o.collector_inat_login`. See RESEARCH.md §Pattern 1 for the full column list.

**JSON write pattern** (`places_export.py` lines 139–140):
```python
out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
print(f"  places.json: {len(records):,} places, {out_path.stat().st_size:,} bytes")  # noqa: T201
```

**Public function signature** (`places_export.py` lines 147–172):
```python
def export_places(con: duckdb.DuckDBPyConnection | None = None) -> None:
    _owned = False
    if con is None:
        con = duckdb.connect(DB_PATH)
        con.execute("LOAD spatial")   # ← collectors does NOT need spatial
        _owned = True
    try:
        ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        # ... compute and write ...
    finally:
        if _owned:
            con.close()
```
Drop `con.execute("LOAD spatial")` — collectors export does no geometry work.

**Zero-argument step wrapper** (`places_export.py` lines 175–182):
```python
def export_places_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    con = duckdb.connect(DB_PATH)
    con.execute("LOAD spatial")
    try:
        export_places(con)
    finally:
        con.close()
```
Name it `export_collectors_step`. Drop `con.execute("LOAD spatial")`.

**`__main__` block** (`places_export.py` lines 185–186):
```python
if __name__ == "__main__":
    export_places_step()
```
Copy verbatim, substituting `export_collectors_step`.

---

### `_data/collectors.js` (config / data loader, file-I/O)

**Analog:** `_data/places.js`

**Entire file** (`_data/places.js` lines 1–20) — clone exactly, substituting `collectors` for `places`:
```javascript
// (header comment: describe collectors contract and Pitfall #8)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const placesArray = JSON.parse(readFileSync(join(repoRoot, 'public/data/places.json'), 'utf8'));

export default { placesArray };
```
Rename: `placesArray` → `collectorsArray`, `places.json` → `collectors.json`, export key `placesArray` → `collectorsArray`.

**Critical constraint** (`_data/places.js` lines 8–9 comment): Never read parquet — HMR stays sub-100ms. Asserted by the Vitest test.

---

### `_pages/collector-detail.njk` (template / detail page, SSG)

**Analog:** `_pages/place-detail.njk`

**Front-matter pagination + permalink block** (`place-detail.njk` lines 1–10):
```njk
---
pagination:
  data: places.placesArray
  size: 1
  alias: place
permalink: "/places/{{ place.slug }}.html"
eleventyComputed:
  title: "{{ place.name }} — BeeAtlas"
layout: default.njk
---
```
Substitute:
- `places.placesArray` → `collectors.collectorsArray`
- `alias: place` → `alias: collector`
- `permalink: "/places/{{ place.slug }}.html"` → `permalink: "/collectors/{{ collector.login | urlencode }}/index.html"` (trailing-slash URL — **different from places pattern** which uses `.html` at root)
- `title: "{{ place.name }}"` → `title: "{{ collector.display_name }}"` (with `@login` fallback already resolved in JSON)

**Body / stats pattern** (`place-detail.njk` lines 11–23):
```njk
<link rel="stylesheet" href="/src/styles/places.css">
<article class="places-page place-detail">
  <h1>{{ place.name }}</h1>
  <p class="metadata">{{ place.specimen_count | quantify("specimen") }} · {{ place.land_owner }}</p>
  <a href="/?place={{ place.slug }}">View occurrences on the atlas →</a>
</article>
```
Adapt: use `collector.display_name` for H1; add specimen/sample/species counts via `quantify` filter; add status split (identified vs awaiting); deep-link via `/?collectors={{ collector.recordedBy | urlencode }}:{{ collector.host_inat_login | urlencode }}` (D-10 format from RESEARCH.md §Pattern 3).

**`quantify` filter** is already registered in `eleventy.config.js` line 33 — use as `{{ collector.specimen_count | quantify("specimen") }}`.

---

### `_pages/collectors.njk` (template / index roster, SSG)

**Analog:** `_pages/places.njk`

**Entire file** (`places.njk` lines 1–19) — clone verbatim, substituting:
```njk
---
layout: default.njk
permalink: /places.html
title: Places — BeeAtlas
---
<link rel="stylesheet" href="/src/styles/places.css">
<article class="places-page places-index">
  <h1>Places</h1>
  <ul class="places-list">
    {%- for place in places.placesArray -%}
    <li>
      <a href="/places/{{ place.slug }}.html">{{ place.name }}</a>
      <span class="owner">{{ place.land_owner }}</span>
      <span class="count">{{ place.specimen_count | quantify("specimen") }}</span>
    </li>
    {%- endfor -%}
  </ul>
</article>
```
Substitute:
- `permalink: /places.html` → `permalink: /collectors.html`
- `title: Places — BeeAtlas` → `title: Collectors — BeeAtlas`
- `places.placesArray` → `collectors.collectorsArray`
- loop var `place` → `collector`
- link href: `/places/{{ place.slug }}.html` → `/collectors/{{ collector.login | urlencode }}/`
- link text: `{{ place.name }}` → `{{ collector.display_name }}`
- remove `span.owner` (no `land_owner` analog) — replace with specimen count or species count per planner's call
- `place.specimen_count` → `collector.specimen_count`

---

### `src/tests/data-collectors.test.ts` (test, Vitest)

**Analog:** `src/tests/data-places.test.ts`

**Imports block** (`data-places.test.ts` lines 1–10):
```typescript
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import places from '../../_data/places.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
```
Substitute `places` → `collectors`, `places.js` → `collectors.js`.

**Array shape test** (`data-places.test.ts` lines 12–14):
```typescript
test('default export has a placesArray property that is an Array (PPAGE-01)', () => {
  expect(Array.isArray((places as any).placesArray)).toBe(true);
});
```
Substitute `placesArray` → `collectorsArray`, update requirement ref to `PAGE-01`.

**Field type assertions** (`data-places.test.ts` lines 16–24):
```typescript
test('every entry in placesArray has the correct field types (PPAGE-01)', () => {
  for (const p of (places as any).placesArray) {
    expect(typeof p.slug, `slug of ${p.name}`).toBe('string');
    expect(typeof p.name, `name of ${p.slug}`).toBe('string');
    expect(typeof p.land_owner, `land_owner of ${p.slug}`).toBe('string');
    expect(typeof p.specimen_count, `specimen_count of ${p.slug}`).toBe('number');
    expect(typeof p.sample_count, `sample_count of ${p.slug}`).toBe('number');
  }
});
```
Replace with fields from `collectors.json` shape: `login` (string), `display_name` (string), `specimen_count` (number), `sample_count` (number), `species_count` (number), `status_denominator` (number), `status_identified` (number), `status_awaiting` (number). Drop `land_owner`. Add invariant check: `status_identified + status_awaiting === status_denominator`.

**Length floor** (`data-places.test.ts` line 27 — uses `> 0`):
```typescript
test('placesArray.length is greater than 0 (PPAGE-01)', () => {
  expect((places as any).placesArray.length).toBeGreaterThan(0);
});
```
Strengthen to D-09 floor: `expect(...collectorsArray.length).toBeGreaterThanOrEqual(100)`.

**No-parquet assertion** (`data-places.test.ts` lines 31–34):
```typescript
test('does NOT read parquet (Pitfall #8 — HMR)', () => {
  const src = readFileSync(resolve(ROOT, '_data/places.js'), 'utf-8');
  expect(src).not.toMatch(/parquet/i);
});
```
Substitute `places.js` → `collectors.js`. Copy verbatim otherwise.

---

### STEPS entry in `data/run.py` (config / orchestration)

**Analog:** existing `export_places_step` registration (`run.py` lines 47, 125)

**Import line** (`run.py` line 47):
```python
from places_export import export_places_step
```
Add after this line:
```python
from collectors_export import export_collectors_step
```

**STEPS list entry** (`run.py` line 125):
```python
    ("places-export", export_places_step),
```
Add immediately after:
```python
    ("collectors-export", export_collectors_step),
```
Position: after `places-export`, before `places-maps`. The step must run after `dbt-build` (line 118) because it reads `EXPORT_DIR/occurrences.parquet` and `EXPORT_DIR/species.parquet` which are written by `_run_dbt_build`.

**Updated pipeline comment** (`run.py` lines 12–13): add `collectors-export` to the order comment after `places-export`.

---

## Shared Patterns

### DuckDB parquet-path convention
**Source:** `data/places_export.py` lines 163–166
**Apply to:** `data/collectors_export.py`
```python
ASSETS_DIR / "occurrences.parquet"   # ← EXPORT_DIR copy, NOT dbt sandbox
ASSETS_DIR / "species.parquet"       # ← same; written by species_export.py
```
Never use `_DBT_SANDBOX` paths inside the export function.

### JSON output convention
**Source:** `data/places_export.py` line 139
**Apply to:** `data/collectors_export.py`
```python
out_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
```
`indent=2` matches `species.json` convention consumed by Eleventy.

### Eleventy `quantify` filter
**Source:** `eleventy.config.js` line 33 (already registered)
**Apply to:** `_pages/collector-detail.njk`, `_pages/collectors.njk`
```njk
{{ collector.specimen_count | quantify("specimen") }}
{{ collector.species_count | quantify("species") }}
{{ collector.sample_count | quantify("sample") }}
```

### Stylesheet reuse
**Source:** `_pages/place-detail.njk` line 11, `_pages/places.njk` line 6
**Apply to:** both collector templates
```njk
<link rel="stylesheet" href="/src/styles/places.css">
```
Reuse `places.css` unless visual divergence is needed (planner's discretion per CONTEXT.md).

### Vitest `@ts-expect-error` for `_data/*.js` imports
**Source:** `src/tests/data-places.test.ts` line 7
**Apply to:** `src/tests/data-collectors.test.ts`
```typescript
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import collectors from '../../_data/collectors.js';
```

---

## No Analog Found

None. All six items have exact analogs in the codebase.

---

## Key Deviations from Analog (Delta from Places Pattern)

| Item | Places Pattern | Collectors Deviation | Reason |
|---|---|---|---|
| Permalink suffix | `"/places/{{ place.slug }}.html"` | `"/collectors/{{ collector.login \| urlencode }}/index.html"` | Spec requires trailing-slash `/collectors/{login}/` URL |
| Bridge JOIN | `occurrence_places.parquet` JOIN on synthetic `occ_id` | No bridge; direct GROUP BY `collector_inat_login` | `collector_inat_login` is a direct mart column (Phase 167); bridge is only for place membership (Phase 160) |
| Species count | not present in places | `COUNT(DISTINCT CASE WHEN sp.specific_epithet IS NOT NULL THEN o.taxon_id END)` | D-03 requirement |
| Status split | not present in places | `status_denominator`, `status_identified`, `status_awaiting` via `specific_epithet IS NOT NULL` predicate on `species.parquet` LEFT JOIN | D-05/D-06 requirement |
| Display name | `meta["name"]` from TOML | `MIN(COALESCE(o.recordedBy, '@' \|\| o.collector_inat_login))` from mart | D-04; no TOML seed (killed Phase 167 D-04) |
| `LOAD spatial` | required (geometry queries) | not needed (no geometry) | collectors export is pure tabular |
| Length floor test | `> 0` | `>= 100` (D-09) | explicit floor to catch broken gate or bad JOIN |
| `land_owner` field | present | absent | no equivalent concept for collectors |
| Sample count formula | `COUNT(DISTINCT sample_id)` only | `COUNT(DISTINCT sample_id) + COUNT(DISTINCT CASE WHEN source='waba_sample' THEN observation_id END)` | `waba_sample` rows have `sample_id IS NULL`; their sample is the `observation_id` |
| Deep-link URL param | `/?place={{ place.slug }}` | `/?collectors={{ collector.recordedBy \| urlencode }}:{{ collector.host_inat_login \| urlencode }}` | D-10; reuses existing collectors= param (no new FilterState field) |

---

## Metadata

**Analog search scope:** `data/`, `_data/`, `_pages/`, `src/tests/`
**Files read:** 6 analog files (all read in full — all under 200 lines)
**Pattern extraction date:** 2026-06-25

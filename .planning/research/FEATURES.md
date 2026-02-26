# Feature Landscape

**Domain:** iNaturalist collection event integration for citizen science bee atlas
**Project:** Washington Bee Atlas — v1.1 iNat Sample Markers
**Researched:** 2026-02-25
**Overall confidence:** HIGH (iNat API behavior verified from actual observation JSON in repo; pyinaturalist confirmed installed in pyproject.toml; existing codebase read directly)

---

## Context: What We're Adding

The existing map already renders Ecdysis specimen clusters from `ecdysis.parquet`. This milestone (v1.1) adds a parallel data stream: iNaturalist observation records from the Washington Bee Atlas project (project ID 166376). Each iNat observation represents a collection event — a volunteer went out, caught bees, photographed the host plant, and logged an iNat observation. Specimens eventually arrive in Ecdysis, but the iNat observation is the earlier signal.

The five v1.1 requirements from PROJECT.md are:
- **INAT-01**: Query iNat API for Washington Bee Atlas project observations
- **INAT-02**: Extract observer, date, coordinates, specimen count observation field
- **INAT-03**: Produce `samples.parquet` (observation_id, observer, date, lat, lon, specimen_count)
- **MAP-03**: Sample markers layer coexisting with existing specimen clusters
- **MAP-04**: Click sample marker → sidebar: observer name, collection date, specimen count

---

## How iNaturalist Projects Work (Domain Background)

iNaturalist has two project types with critically different API behaviors:

**Collection projects** — automatically include all observations matching a filter (taxa, place, quality grade). No user action needed. The API query is `GET /v1/observations?project_id=<id>` and returns all matching observations. The Washington Bee Atlas (project 166376) appears to be a collection project based on its structure.

**Traditional projects** — observations must be manually added by the observer. They support required observation fields. The API also uses `project_id` parameter for queries.

**Key distinction:** Only traditional projects can *require* observation fields. Collection projects can have observation fields but cannot enforce them. This means:
- If the WA Bee Atlas is a collection project, specimen count may be an optional observation field — many observations will have it null.
- If it is a traditional project, the specimen count field may be reliably present.

From the actual observation JSON in the repository (`data/inat/observation/300847934.json`), the observation for Bonnie Zand does NOT contain an `ofvs` (observation field values) array, which suggests either: (a) that particular observation has no fields filled in, or (b) observation fields were not included in that API request. The JSON structure confirms the observation contains: `id`, `uuid`, `geojson` (coordinates), `time_observed_at`, `uri`, `user` (with `login` and `name`), `taxon`, `observation_photos`, `license_code`.

---

## iNaturalist Observation Data: What Is Reliably Available

Based on direct examination of the JSON in the repo and iNat API documentation:

### Always Present (HIGH confidence)

| Field | JSON path | Notes |
|-------|-----------|-------|
| Observation ID | `id` (integer) | Stable, permanent identifier |
| UUID | `uuid` | Alternative stable identifier |
| Date/time | `time_observed_at` | ISO 8601 with timezone offset |
| Coordinates | `geojson.coordinates` | [longitude, latitude] array |
| Observer login | `user.login` | Username, always present |
| Observer display name | `user.name` | Full name — may be empty string if not set |
| iNat URL | `uri` | e.g. `https://www.inaturalist.org/observations/300847934` |
| Positional accuracy | `public_positional_accuracy` | Meters; may be null |

### Usually Present (MEDIUM confidence)

| Field | JSON path | Notes |
|-------|-----------|-------|
| Taxon | `taxon.id`, `taxon.ancestor_ids` | Present if observation is identified |
| Photos | `observation_photos` array | Present if observer added photos |
| License | `license_code` | e.g. `cc-by-nc` |

### Conditionally Present (LOW confidence)

| Field | JSON path | Notes |
|-------|-----------|-------|
| Specimen count | `ofvs` array, field name varies | Only present if observer filled in the field; field name is project-specific |
| Description/notes | `description` | Free text; often empty string |
| Observed date | `observed_on` | Date-only string; separate from `time_observed_at` |

---

## Observation Fields (ofvs): Specimen Count

**The core uncertainty:** The specific observation field name used by the Washington Bee Atlas project for specimen count is not determinable from public search results. iNaturalist has a public observation field called "Count" (field ID 1), but individual projects may define custom fields with names like "Number of specimens", "Specimen count", "Bees collected", etc.

**What the data structure looks like** (from iNat API documentation and community forum posts):

```json
"ofvs": [
  {
    "id": 12345678,
    "field_id": 1,
    "datatype": "numeric",
    "name": "Count",
    "value": "12",
    "observation_field": {
      "id": 1,
      "name": "Count",
      "datatype": "numeric"
    }
  }
]
```

**Important:** The `value` is always a string, even for numeric fields. The pipeline must parse it.

**Discovery approach:** The pipeline must introspect the project's observation fields at runtime. Best approach:
1. Query `GET /v1/projects/166376` to get project metadata including any configured observation fields
2. Inspect the `project_observation_fields` array to find a field with `name` matching something like "specimen", "count", "collected"
3. Hardcode the resolved field ID for extraction (or make it a pipeline config parameter)

**The "pending sample" condition:** An observation with no `ofvs` entry for the specimen count field means one of:
- Specimens not yet counted/entered (true pending)
- Observer never fills in the field at all (always pending)
- The observation is a plant photo only (no specimens)

The pipeline should treat absent `ofvs` for the specimen count field as `specimen_count = null` (not 0, not empty), so the frontend can display "Not yet entered" rather than "0 specimens".

---

## Table Stakes

Features required for v1.1 to be useful. Missing = milestone incomplete.

| Feature | Why Required | Complexity | Category | Notes |
|---------|--------------|------------|----------|-------|
| iNat API pagination | Project may have >200 observations; API max per_page is 200 | Low | Pipeline | Use `id_above` cursor pattern; pyinaturalist supports `page='all'` shorthand |
| Observation field discovery | Must find specimen count field ID before extracting values | Low | Pipeline | Query `/v1/projects/166376` once; hardcode field ID in config |
| Null specimen_count handling | Many obs will have no count entered; must not silently coerce to 0 | Low | Pipeline + Data model | Use nullable Int64 in pandas; null becomes null in Parquet; frontend shows "Not yet entered" |
| Coordinate extraction | `geojson.coordinates` → [lon, lat]; must handle obscured observations | Low | Pipeline | Some obs have accuracy >10km and coordinates jittered; use as-is for markers |
| samples.parquet schema | Pipeline output must match what the frontend ParquetSource reads | Low | Data model | Columns: observation_id (int64), observer (string), date (string ISO), lat (float64), lon (float64), specimen_count (Int64 nullable) |
| Sample marker layer | Second VectorLayer on existing OL map; must coexist with cluster layer | Medium | Frontend | Distinct visual style (different shape/color from specimen circles); no clustering needed |
| Click-to-detail for sample markers | Same click pattern as existing specimen clusters | Medium | Frontend | Must distinguish between hit on specimen cluster vs sample marker |
| Sidebar sample panel | Show observer, date, specimen_count for a clicked sample marker | Low | Frontend | Reuse existing sidebar architecture; new view state for iNat samples |
| build-data.sh extension | CI runs build-data.sh; must also produce samples.parquet alongside ecdysis.parquet | Low | Pipeline | Extend shell script; copy samples.parquet to frontend/src/assets/ |

---

## Differentiators

Features that add value beyond the minimum viable milestone.

| Feature | Value Proposition | Complexity | Category | Notes |
|---------|-------------------|------------|----------|-------|
| Link to iNat observation | Observer can open original observation on iNaturalist.org | Very Low | Frontend | `uri` field is always present; render as `<a>` in sidebar |
| Observer display name fallback | `user.name` may be empty; fall back to `user.login` | Very Low | Pipeline | Prevents empty "Collector:" labels in sidebar |
| Distinct marker style per sample state | "Pending" (null count) vs "counted" markers get different visual treatment | Low | Frontend | Color or shape difference; helps volunteers identify which events need follow-up |
| Date parsed for display | `time_observed_at` is ISO 8601 with timezone; format as "July 10, 2025" in sidebar | Very Low | Frontend | Use Intl.DateTimeFormat, same pattern as existing month formatting |
| iNat observation URL in samples.parquet | Store `uri` in Parquet so frontend can link without reconstruction | Very Low | Pipeline | Cheap to include; enables future deep-linking |

---

## Anti-Features

Features to explicitly NOT build in v1.1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Specimen-to-sample linkage (Ecdysis HTML scraping) | Deferred to v1.2 per PROJECT.md; complex scraping adds brittleness | Ship sample markers without linkage first |
| iNat host plant display layer | Out of scope per PROJECT.md for v1.1; different data shape from collection events | Revisit in v1.2 if needed |
| Taxon filtering of sample markers | iNat observations are about collection events, not identified specimens; taxon is unreliable until Ecdysis | Filter only applies to specimen layer |
| Real-time iNat fetch from browser | Static Parquet constraint is non-negotiable; no server runtime | Pipeline fetches; static Parquet serves |
| Authentication / OAuth for iNat API | Read-only public project data requires no auth | Use unauthenticated API calls |
| URL sharing (INAT-specific) | Deferred to v1.2 (NAV-01) per PROJECT.md | Ship basic sample markers first |
| Clustering sample markers | Sample count is low (hundreds, not thousands); clustering adds complexity without benefit | Render individual markers |

---

## Feature Dependencies

```
INAT-01: Query iNat API
  └── requires: project ID 166376 confirmed, pyinaturalist installed (confirmed in pyproject.toml)
  └── requires: API pagination (id_above cursor or page='all')
  └── produces: raw observation JSON list

INAT-02: Extract fields
  └── requires: INAT-01 complete (raw observations in hand)
  └── requires: specimen count field ID discovered (query /v1/projects/166376 first)
  └── produces: structured records (observation_id, observer, date, lat, lon, specimen_count)

INAT-03: Write samples.parquet
  └── requires: INAT-02 complete
  └── requires: build-data.sh extended to copy samples.parquet to frontend/src/assets/
  └── produces: samples.parquet alongside ecdysis.parquet

MAP-03: Sample markers layer
  └── requires: INAT-03 complete (samples.parquet exists)
  └── requires: frontend parquet.ts extended (or new SamplesParquetSource) to read samples.parquet
  └── requires: distinct OL style for sample markers (separate from clusterStyle)

MAP-04: Click-to-detail sidebar
  └── requires: MAP-03 complete (layer exists and is clickable)
  └── requires: bee-map.ts click handler extended to route hits to correct source
  └── requires: bee-sidebar.ts extended with iNat sample view (observer, date, specimen_count, link)
```

---

## Data Model: samples.parquet Schema

Recommended columns — designed to match the pattern of ecdysis.parquet but for iNat data:

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| `observation_id` | int64 | `id` | iNat observation integer ID; use as feature ID with prefix `inat:` |
| `observer` | string | `user.name` or `user.login` | Prefer `name`; fallback to `login` if name is empty |
| `date` | string (ISO date) | `time_observed_at` or `observed_on` | Store as `YYYY-MM-DD`; parse in frontend for display |
| `latitude` | float64 | `geojson.coordinates[1]` | WGS84 |
| `longitude` | float64 | `geojson.coordinates[0]` | WGS84 |
| `specimen_count` | Int64 (nullable) | `ofvs` array, target field | Null = not entered; 0 = explicitly zero; parse string value to int |
| `uri` | string | `uri` | iNat observation URL for deep-linking from sidebar |

**Parquet reading in frontend:** The existing `ParquetSource` in `parquet.ts` is easily adapted — just change the `columns` list and the column-to-property mapping. A new `SamplesParquetSource` class extending `VectorSource` follows the same pattern.

---

## Pipeline Architecture: iNat Fetch Pattern

Based on the existing Ecdysis pipeline in `data/ecdysis/` and the installed pyinaturalist library:

**Recommended:** New `data/inat/fetch.py` script following the same pattern as `data/ecdysis/occurrences.py`:
1. Call pyinaturalist `get_observations(project_id=166376, page='all')` — pyinaturalist handles pagination automatically when `page='all'`
2. Extract fields per observation, handling missing `ofvs`
3. Write `samples.parquet` to `data/` (same level as `ecdysis.parquet`)

**Rate limiting:** iNat API allows ~1 req/sec / 10k req/day. pyinaturalist adds `User-Agent` header automatically. With pagination at 200/page and expected observation count in the low thousands, this is a handful of requests — no rate limiting concern.

**CI concern:** Same pattern as Ecdysis — a live HTTP call to iNat API on every push. If iNat API is down, CI fails. Mitigate: commit a `frontend/src/assets/samples.parquet` fallback, same as `ecdysis.parquet`.

---

## Complexity Assessment

| Feature ID | Feature | Complexity | Reason |
|------------|---------|------------|--------|
| INAT-01 | iNat API query | Low | pyinaturalist already installed; `get_observations(project_id=166376, page='all')` is straightforward |
| INAT-02 | Field extraction | Low-Medium | Specimen count field ID must be discovered first; ofvs parsing is string→int with null handling |
| INAT-03 | samples.parquet | Low | Same pattern as existing ecdysis.parquet pipeline; pandas + pyarrow already in stack |
| MAP-03 | Sample markers layer | Medium | Need to design distinct marker style; layer coexistence with cluster layer requires careful z-ordering and click routing |
| MAP-04 | Sidebar sample panel | Low-Medium | Sidebar already exists; new view state for iNat samples is straightforward; must not conflict with existing specimen detail view |

---

## MVP Recommendation

Ship in this order — each step produces testable output:

1. **Field discovery** (pipeline, 1 day) — Query `/v1/projects/166376`, identify specimen count observation field ID, hardcode in pipeline config. Produces: known field ID.

2. **INAT-01 + INAT-02 + INAT-03** (pipeline, 1 day) — `data/inat/fetch.py` produces `samples.parquet`. Validate by inspecting row count, null rate in `specimen_count`, coordinate range. Produces: `samples.parquet`.

3. **build-data.sh extension** (infrastructure, 0.5 day) — Copy `samples.parquet` to `frontend/src/assets/`, update CI build. Produces: Parquet served to browser.

4. **MAP-03: Sample markers layer** (frontend, 1 day) — `SamplesParquetSource` reads `samples.parquet`; new `VectorLayer` with distinct style (e.g. diamond shape or orange fill); added to `BeeMap` after specimen layer. Produces: visible markers.

5. **MAP-04: Click-to-detail** (frontend, 1 day) — Extend click handler to route `inat:*` feature IDs to new iNat sidebar view; show observer, date, specimen_count, link to iNat URL. Produces: complete milestone.

**Defer:**
- Distinct "pending" vs "counted" marker styles (nice-to-have; add if time permits)
- Specimen-to-sample linkage (explicitly deferred to v1.2)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| iNat API structure | HIGH | Actual observation JSON in repo (`data/inat/observation/300847934.json`) confirms field paths |
| pyinaturalist usage | HIGH | Library version 0.20.2 in pyproject.toml; `get_observations(project_id=..., page='all')` confirmed from docs |
| Specimen count field ID | LOW | Field name/ID for WA Bee Atlas project not confirmed; must be discovered at pipeline build time |
| Project type (collection vs traditional) | LOW | Not confirmed; affects whether specimen count is consistently entered |
| Frontend architecture | HIGH | All existing source files read; ParquetSource, VectorSource, Cluster, click handling patterns confirmed |
| CI/CD impact | HIGH | build-data.sh and deploy.yml read; extension pattern is clear |

---

## Sources

- Actual iNat observation JSON: `/Users/rainhead/dev/beeatlas/data/inat/observation/300847934.json` (HIGH confidence — real API response)
- iNat project IDs: `/Users/rainhead/dev/beeatlas/data/inat/projects.py` — confirms WA project ID 166376 (HIGH confidence)
- pyinaturalist installed: `/Users/rainhead/dev/beeatlas/data/pyproject.toml` — `pyinaturalist>=0.20.2` (HIGH confidence)
- Existing pipeline pattern: `data/ecdysis/occurrences.py`, `scripts/build-data.sh` (HIGH confidence — direct read)
- Frontend architecture: `frontend/src/parquet.ts`, `bee-map.ts`, `bee-sidebar.ts`, `filter.ts`, `style.ts` (HIGH confidence — direct read)
- iNaturalist project types: [Understanding Projects on iNaturalist](https://help.inaturalist.org/en/support/solutions/articles/151000176472-understanding-projects-on-inaturalist) (MEDIUM confidence — official help docs)
- iNat API pagination: [API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — `id_above`/`id_below` for large sets; 200 per_page max (MEDIUM confidence — web search summary)
- pyinaturalist `page='all'` shorthand: pyinaturalist docs summary from web search (MEDIUM confidence — verify against installed 0.20.2 docs before use)
- iNat API rate limits: 1 req/sec, 10k/day from official practices page (MEDIUM confidence)
- Observation field JSON structure (`ofvs` array, string `value`): iNaturalist community forum and API docs (MEDIUM confidence — not directly verified against live response)

# Phase 160: Overlap-capable place model (many-to-many membership) - Research

**Researched:** 2026-06-23
**Domain:** dbt/DuckDB spatial mart restructuring + frontend wa-sqlite query path + Python export recompute
**Confidence:** HIGH (all findings verified against actual code with file:line anchors; no external library lookups required)

## Summary

This phase converts the one-place-per-occurrence partition into a many-to-many membership model. The entire change is internal to this codebase — no new external packages, no library version questions, no network dependencies. Research therefore concentrated on reading the actual code to produce a reproducible recipe with exact anchors.

The five central questions resolved cleanly:

1. **Join key:** There is NO single stable unique ID column on `marts/occurrences`. Different source arms populate different ID columns (`ecdysis_id`, `observation_id`, `specimen_observation_id`, `checklist_id`), exactly as enumerated in `int_combined.sql`. The frontend already collapses these four into a stable prefixed `occId` string via `occIdFromRow` (`src/occurrence.ts:23-30`). The bridge must key on the **same composite**. `_row_id` (`occurrences.sql:20`) is `ROW_NUMBER() OVER ()` over `int_combined` — it is regenerated every build and is NOT stable across runs, but it IS stable *within a single build*, which is all the bridge needs because the bridge is rebuilt from the same `joined` CTE in the same dbt run. **Recommendation: carry the four real ID columns into the bridge mart** (not `_row_id`) so the frontend can join on the same identity it already uses, and `_row_id` stays an internal dbt detail.

2. **Bridge artifact + frontend load path:** The frontend does NOT load `occurrence_places` via a separate parquet + hyparquet. The SQL engine reads a single pre-built SQLite file `occurrences.db` (`src/sqlite-worker.ts:62-95`), built by `data/sqlite_export.py` via DuckDB's SQLite extension. The bridge ships as a **second table inside `occurrences.db`**, created the same way the `occurrences` table is (`CREATE TABLE out.occurrence_places AS SELECT * FROM read_parquet(...)`). No new manifest key, no hyparquet involvement. The place filter rewrites from `place_slug = ?` to a membership `EXISTS` subquery — plain SQLite, fully supported.

3. **dbt mechanics:** Add `occurrence_places` as a new `materialized='external'` parquet mart sourced from the existing `ST_Within` join minus `DISTINCT ON`. Drop `place_slug` (and the `place_dedup` / `with_place` CTEs' dedup) from `occurrences.sql`, and remove the `place_slug` row from the `occurrences` contract in `schema.yml` (33→32). Add a new contract block for `occurrence_places`. The closest structural analog is `occurrences.sql` itself (the only other `materialized='external'` parquet mart).

4. **Counts/maps:** `_query_counts` (`places_export.py:40-66`) and `generate_place_maps` (`places_maps.py:59-65`) currently read `place_slug` directly off `occurrences.parquet`. They must instead JOIN occurrences to the bridge. Both files read from `ASSETS_DIR/occurrences.parquet`; the bridge parquet must be copied to `EXPORT_DIR` by `_run_dbt_build` (`run.py:80-84`) alongside the others.

5. **Frontend ripple:** Five edits in `src/filter.ts` (row type, column list, WHERE clause) plus the bridge table load. The occurrence-detail member-place list (D-04) reuses `bee-pane.ts`'s existing `_placeNameBySlug`/`_ensurePlaceNamesLoaded`, but the per-occurrence place slugs must be fetched (a new small query against the bridge keyed on the occurrence's IDs).

**Primary recommendation:** Key the bridge on the four real ID columns (carried verbatim from `int_combined`), ship it as a second table inside `occurrences.db`, source it from the un-deduplicated `with_place` CTE, and recompute Python counts/maps with a bridge JOIN. Update the two hardcoded table whitelists (`make-local-manifest.js`, `validate-db.mjs`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Compute occurrence↔place memberships | Database/pipeline (dbt + DuckDB spatial) | — | `ST_Within` join is server-side; SQLite has no spatial engine |
| Reject/permit overlapping polygons | Pipeline validation (`places_validation.py`) | — | Pre-pipeline gate on `places.toml` |
| Per-place counts (`places.json`) | Pipeline export (`places_export.py`) | — | Static artifact, computed once nightly |
| Per-place SVG maps | Pipeline export (`places_maps.py`) | — | Static artifact |
| Ship bridge to browser | Pipeline (`sqlite_export.py` → `occurrences.db`) | — | Single pre-built SQLite file, no client-side join build |
| Place filter resolution (membership test) | Browser / Client (wa-sqlite) | — | Filter runs in-browser against `occurrences.db` |
| List an occurrence's member places (D-04) | Browser / Client (`bee-occurrence-detail` + `bee-pane`) | wa-sqlite (fetch slugs) | UI render + a membership lookup query |

## Standard Stack

No new external packages. This phase uses only already-installed tooling:

| Tool | Version | Purpose | Source |
|------|---------|---------|--------|
| dbt-core + dbt-duckdb | 1.10.1 (pinned, `--python 3.13`) | mart build + contract enforcement | `data/dbt/run.sh:40,43` [VERIFIED: run.sh] |
| DuckDB spatial extension | bundled with dbt-duckdb | `ST_Within` join, SQLite export | `profiles.yml` extensions [VERIFIED: profiles.yml] |
| DuckDB SQLite extension | bundled | builds `occurrences.db` | `sqlite_export.py:427` [VERIFIED] |
| wa-sqlite | (already in package.json) | in-browser SQL engine | `src/sqlite-worker.ts:1-3` [VERIFIED] |
| Python stdlib `sqlite3` | 3.14 | taxa table + indexes in `occurrences.db` | `sqlite_export.py:13` [VERIFIED] |

**Installation:** None. No `npm install` / `pip install` / `cargo add` is required for this phase.

## Package Legitimacy Audit

Not applicable — this phase installs **zero** new packages. All tooling is pre-existing and pinned. slopcheck gate skipped (no candidate packages).

## Architecture Patterns

### System Architecture Diagram (data flow)

```
content/places.toml
   │  (places-validation: WKT/WGS84/slug/permit — NO overlap check after D-03)
   ▼
places-load ──► geographies.places (DuckDB table: slug, name, land_owner, geom)
   │
   ▼
dbt-build (bash data/dbt/run.sh build)
   │
   ├─► int_combined (TABLE) ── ROW_NUMBER() ──► joined (_row_id + 4 ID cols + lon/lat)
   │        │
   │        ├─► occurrences.sql  ──► occurrences.parquet  (32 cols, NO place_slug)
   │        │        (ST_Within county/eco joins; place join REMOVED from this mart)
   │        │
   │        └─► occurrence_places.sql ──► occurrence_places.parquet  (NEW)
   │                 occ_pt ⋈ ST_Within wa_places  (NO DISTINCT ON)
   │                 → one row per (occurrence-identity, place_slug)
   ▼
_run_dbt_build copies BOTH parquets to public/data/  (run.py:80-84 — add bridge)
   │
   ├─► generate-sqlite ──► occurrences.db
   │        CREATE TABLE out.occurrences  AS SELECT * FROM occurrences.parquet
   │        CREATE TABLE out.occurrence_places AS SELECT * FROM occurrence_places.parquet  (NEW)
   │        + taxa hierarchy + geo_blob
   │
   ├─► places-export ──► places.json  (counts via occurrences ⋈ bridge)
   │                 ──► places.geojson  (UNCHANGED — geometry only)
   │
   └─► places-maps ──► place-maps/{slug}.svg  (points via occurrences ⋈ bridge)

Frontend (browser):
   manifest.json → occurrences_db URL → fetch occurrences.db into MemoryVFS (wa-sqlite)
        tables available: occurrences, occurrence_places, taxa, geo_blob
   Place filter: EXISTS (SELECT 1 FROM occurrence_places op WHERE op.<id> = o.<id> AND op.place_slug = ?)
   Occurrence detail (D-04): SELECT place_slug FROM occurrence_places WHERE <id> = ? → map slug→name via _placeNameBySlug
```

### Pattern 1: Composite-identity join key (the load-bearing decision)

**What:** The bridge cannot use a single PK because none exists on the mart. Mirror the frontend's `occIdFromRow` priority.

**Evidence (`int_combined.sql`):** ARM 1 (ecdysis) sets `ecdysis_id` + sometimes `observation_id`; ARM 2 (provisional WABA) sets only `specimen_observation_id`; ARM 3 (iNat) sets `observation_id`; checklist arm sets `checklist_id`. [VERIFIED: int_combined.sql lines 14-60+]

**Evidence (`src/occurrence.ts:23-30`):**
```typescript
export function occIdFromRow(row: OccurrenceRow): string | null {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  if (row.specimen_observation_id != null) return `inat_obs:${row.specimen_observation_id}`;
  if (row.checklist_id != null) return `checklist:${row.checklist_id}`;
  return null;
}
```

**Recommendation:** The bridge mart should carry **all four ID columns** (`ecdysis_id`, `observation_id`, `specimen_observation_id`, `checklist_id`) plus `place_slug`, one row per (occurrence, place). The frontend membership test then joins on these four columns with the SAME priority semantics, OR — simpler and matching how `filter.ts` already restricts by source — joins on whichever ID columns are non-null.

**Two viable bridge-key shapes (planner picks one; both are SQLite-friendly):**

- **Option A — four ID columns verbatim.** Bridge columns: `(ecdysis_id, observation_id, specimen_observation_id, checklist_id, place_slug)`. Frontend filter:
  ```sql
  EXISTS (SELECT 1 FROM occurrence_places op
          WHERE op.place_slug = ?
            AND ( (o.ecdysis_id IS NOT NULL AND op.ecdysis_id = o.ecdysis_id)
               OR (o.observation_id IS NOT NULL AND op.observation_id = o.observation_id)
               OR (o.specimen_observation_id IS NOT NULL AND op.specimen_observation_id = o.specimen_observation_id)
               OR (o.checklist_id IS NOT NULL AND op.checklist_id = o.checklist_id) ))
  ```
  Pro: no synthetic key, identical to existing selection logic. Con: verbose multi-column join. **[ASSUMED — A2]** that no single (ecdysis_id) value appears across multiple distinct occurrence rows; needs confirmation that the four-column tuple is unique per occurrence (it must be, since these IDs are the de-facto identity used everywhere else).

- **Option B — synthetic `occ_id` text column.** Bridge columns: `(occ_id VARCHAR, place_slug VARCHAR)` where `occ_id` is built in dbt with the SAME priority as `occIdFromRow` (`'ecdysis:' || ecdysis_id`, else `'inat:' || observation_id`, …). Add the identical computed `occ_id` to the occurrences mart? **NO** — that would re-add a column (contract would be 33 again, defeating D-02). Instead compute `occ_id` on the frontend side per row (it already does, via `occIdFromRow`) OR compute it inline in the WHERE clause. The cleanest membership test:
  ```sql
  EXISTS (SELECT 1 FROM occurrence_places op
          WHERE op.place_slug = ?
            AND op.occ_id = CASE
              WHEN o.ecdysis_id IS NOT NULL THEN 'ecdysis:' || o.ecdysis_id
              WHEN o.observation_id IS NOT NULL THEN 'inat:' || o.observation_id
              WHEN o.specimen_observation_id IS NOT NULL THEN 'inat_obs:' || o.specimen_observation_id
              WHEN o.checklist_id IS NOT NULL THEN 'checklist:' || o.checklist_id
            END)
  ```
  Pro: bridge is a clean 2-column relation; the CASE mirrors `occIdFromRow` so it is the canonical identity, and the D-04 detail query is trivial (`WHERE occ_id = ?` with a single computed key). Con: the priority CASE must stay in lockstep with `src/occurrence.ts` (document the coupling, as the codebase already documents the `_GEO_COLS` positional coupling in `sqlite_export.py:457-462`).

**Researcher's lean:** **Option B (synthetic `occ_id`)**, because (a) it produces a clean normalized 2-column bridge per D-01's stated intent, (b) `occIdFromRow` is already the single canonical identity owner (`src/occurrence.ts` header comment: "Single owner of the `ecdysis:` / `inat:` ID prefix vocabulary"), and (c) the D-04 "list all places for this occurrence" query becomes `SELECT place_slug FROM occurrence_places WHERE occ_id = ?` — one bound param, no four-way OR. The coupling risk is real but matches an established pattern in this codebase (documented positional/string couplings).

### Pattern 2: New external parquet mart (structural analog = occurrences.sql)

**What:** `occurrences.sql` is the only existing `materialized='external'` parquet mart and is the exact analog. [VERIFIED: occurrences.sql:12-17]

```sql
{{ config(
    materialized='external',
    location='target/sandbox/occurrence_places.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

The bridge model body reuses `int_combined` → `joined` → `occ_pt` → `with_place` (the existing `ST_Within` join) **without** the `place_dedup` CTE, then projects the bridge key + `place_slug`, filtering out NULL place_slug (no membership = no row, per D-discretion "empty membership"). Sort by (occ identity, place_slug) for deterministic output (D-discretion "list determinism").

### Pattern 3: Membership test in SQLite

SQLite fully supports correlated `EXISTS` subqueries and string concatenation via `||`. [VERIFIED via existing `instr(...)` and `||` usage in `filter.ts:265` and `sqlite_export.py`]. No dialect concern.

### Anti-Patterns to Avoid

- **Re-adding any place column to the occurrences mart.** D-02 is explicit: contract goes 33→32. Do not add `occ_id` to the occurrences mart to "make the join easier" — compute it in the WHERE clause.
- **Keying the bridge on `_row_id`.** `_row_id` is `ROW_NUMBER() OVER ()` (`occurrences.sql:20`) — regenerated each build, internal to one model. It is fine to use as the *internal* join key *within* the bridge model's CTEs (since the bridge is built in the same dbt invocation from the same `joined` CTE), but it must NOT appear in the shipped bridge parquet. [VERIFIED: occurrences.sql header lines 6 "not an existing PK"]
- **DuckDB-WASM / hyparquet for the bridge.** The bridge ships inside `occurrences.db`; do not introduce a parquet-in-browser load path. [project_duckdb_wasm_direction / feedback_no_duckdb_wasm]
- **`DISTINCT ON` in the bridge.** That collapse is exactly what we are removing; keep all membership rows.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Occurrence identity string | A new ID scheme for the bridge | `occIdFromRow` priority (`src/occurrence.ts:23`) replicated in dbt CASE | Single canonical owner already exists; divergence breaks selection |
| Place-name display | New name fetch | `bee-pane.ts` `_placeNameBySlug` / `_ensurePlaceNamesLoaded` (`:893-911`) | D-04 explicitly reuses it; loads from `places.json` already |
| Spatial point-in-polygon | Manual coordinate math | DuckDB `ST_Within` (already in `with_place`, `occurrences.sql:74-78`) | SQLite has no spatial engine; pipeline owns this |
| occurrences.db schema | Hardcoded CREATE TABLE | `CREATE TABLE ... AS SELECT * FROM read_parquet(...)` | `sqlite_export.py:430` derives schema from parquet — bridge follows same pattern |

## Common Pitfalls

### Pitfall 1: Bridge parquet not copied to EXPORT_DIR
**What goes wrong:** `places-export` and `places-maps` and `generate-sqlite` read from `ASSETS_DIR/…parquet` (public/data), NOT from the dbt sandbox (`places_export.py:42-49` "Pitfall 5"). If the bridge parquet stays in `target/sandbox/`, downstream steps `FileNotFoundError`.
**How to avoid:** Add `"occurrence_places.parquet"` to the copy loop in `_run_dbt_build` (`run.py:80-84`).
**Warning sign:** `places-export` step fails with `… not found — run dbt before places-export`.

### Pitfall 2: occurrences_db_tables whitelist out of date
**What goes wrong:** `scripts/validate-db.mjs:16` has `REQUIRED_TABLES = ['geo_blob', 'occurrences']` and `scripts/make-local-manifest.js:14` hardcodes `occurrences_db_tables: ['geo_blob', 'occurrences']`. The frontend now requires `occurrence_places`; local dev manifest must list it, and CI's `validate-db` must require it.
**How to avoid:** Add `'occurrence_places'` to BOTH arrays. (Nightly `nightly.sh:305-308` derives the list dynamically from `sqlite_master`, so production auto-includes it — only the two hardcoded JS lists need editing.)
**Warning sign:** Local dev `npm run dev` map/filter works but CI's clean-checkout validation passes while a stale frontend silently has no `occurrence_places` table. [feedback_ci_is_verification_surface — this phase touches the data→occurrences.db schema, so "does CI build on a clean checkout?" applies]

### Pitfall 3: Test fixture parquet still has place_slug
**What goes wrong:** `test_places_export.py:64-93` writes a fixture `occurrences.parquet` with a `place_slug` column and `_query_counts` reads it. After the rewrite, `_query_counts` joins the bridge instead; the fixture must produce an `occurrence_places.parquet` (or in-memory table) and the occurrences fixture drops `place_slug`.
**How to avoid:** Update `_write_test_occurrences_parquet` to emit identity columns, add a bridge fixture, and rewrite the count expectations to exercise double-counting (an occurrence in two places contributes to both — D-05).
**Warning sign:** `test_places_json_counts` references `place_slug` that no longer drives counts.

### Pitfall 4: Non-deterministic membership order
**What goes wrong:** Without `ORDER BY` the bridge rows (and any frontend-materialized slug list for D-04) come back in arbitrary order, making tests flaky.
**How to avoid:** Bridge mart: `ORDER BY occ_id, place_slug` (or the four IDs + slug). D-04 detail query: `ORDER BY place_slug` and dedupe. [D-discretion "list determinism"]

### Pitfall 5: Overlap test asserts the wrong thing
**What goes wrong:** `test_places_validation.py:135-156` (`test_overlapping_polygons`) currently asserts overlapping polygons RAISE `ValueError(match="overlap")`. After D-03 they must LOAD.
**How to avoid:** Invert the test — assert `validate_places(...)` returns `None` (no raise) for overlapping polygons. Keep the WKT/WGS84/slug/permit tests untouched. Remove lines `109-133` of `places_validation.py` (the `ST_Overlaps` block) and update the module docstring (`:6-14` removes check #6).
**Warning sign:** Test still imports/asserts the overlap rejection after the check is gone.

## Code Examples

### Bridge mart (proposed `data/dbt/models/marts/occurrence_places.sql`)
```sql
-- Source: structural analog occurrences.sql:12-105 (the existing external parquet mart)
{{ config(
    materialized='external',
    location='target/sandbox/occurrence_places.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
WITH joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM {{ ref('int_combined') }}
),
occ_pt AS (SELECT *, ST_Point(lon, lat) AS pt FROM joined),
wa_places AS (SELECT * FROM {{ source('geographies', 'places') }}),
with_place AS (                          -- reuse occurrences.sql:74-78 join, NO dedup
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)   -- INNER JOIN: no row when no place
)
SELECT
    -- Option B canonical identity (mirrors src/occurrence.ts:23 occIdFromRow priority):
    CASE
        WHEN j.ecdysis_id IS NOT NULL THEN 'ecdysis:' || j.ecdysis_id
        WHEN j.observation_id IS NOT NULL THEN 'inat:' || j.observation_id
        WHEN j.specimen_observation_id IS NOT NULL THEN 'inat_obs:' || j.specimen_observation_id
        WHEN j.checklist_id IS NOT NULL THEN 'checklist:' || j.checklist_id
    END AS occ_id,
    wp.place_slug
FROM joined j
JOIN with_place wp ON wp._row_id = j._row_id
ORDER BY occ_id, place_slug   -- determinism (Pitfall 4)
```
*(If the planner chooses Option A, project the four ID columns instead of the CASE.)*

### occurrences.sql edits
- Remove CTEs `with_place` (`:74-78`) and `place_dedup` (`:79-82`) — they migrate to the bridge.
- Remove `fp.place_slug,` from the final SELECT (`:97`) and the `LEFT JOIN place_dedup fp …` (`:105`). Result: 32 projected columns. [VERIFIED: occurrences.sql current SELECT is 33 cols]

### Contract edit (`data/dbt/models/marts/schema.yml`)
- Delete the `- name: place_slug` / `data_type: varchar` block (`:61-62`) from the `occurrences` model → 32 columns. [VERIFIED]
- Add a new contract block:
```yaml
  - name: occurrence_places
    config:
      contract:
        enforced: true
    columns:
      - name: occ_id
        data_type: varchar
        data_tests: [not_null]
      - name: place_slug
        data_type: varchar
        data_tests: [not_null]
```
*(Option A: replace `occ_id` with the four ID columns, each `data_type` matching the occurrences contract — `ecdysis_id` integer, `observation_id`/`specimen_observation_id` bigint, `checklist_id` integer.)*

### `_query_counts` rewrite (`places_export.py:40-66`)
```python
# JOIN occurrences to the bridge; count an occurrence toward EVERY place it's in (D-05).
rows = con.execute(
    """
    WITH occ AS (
        SELECT *,
            CASE
              WHEN ecdysis_id IS NOT NULL THEN 'ecdysis:' || ecdysis_id
              WHEN observation_id IS NOT NULL THEN 'inat:' || observation_id
              WHEN specimen_observation_id IS NOT NULL THEN 'inat_obs:' || specimen_observation_id
              WHEN checklist_id IS NOT NULL THEN 'checklist:' || checklist_id
            END AS occ_id
        FROM read_parquet(?)
    )
    SELECT
        b.place_slug,
        COUNT(CASE WHEN occ.ecdysis_id IS NOT NULL THEN 1 END) AS specimen_count,
        COUNT(DISTINCT CASE WHEN occ.sample_id IS NOT NULL THEN occ.sample_id END) AS sample_count
    FROM occ JOIN read_parquet(?) b ON b.occ_id = occ.occ_id
    GROUP BY b.place_slug
    """,
    [str(occ_parquet), str(bridge_parquet)],
).fetchall()
```
*(`_query_counts` and `export_places` must take the bridge parquet path as a new argument; `export_places` already passes `ASSETS_DIR / "occurrences.parquet"` — add `ASSETS_DIR / "occurrence_places.parquet"`.)*

### `places_maps.py` rewrite (`:59-65`)
Same JOIN: select `b.place_slug, occ.lon, occ.lat FROM occ JOIN bridge b … WHERE lon IS NOT NULL AND lat IS NOT NULL`, grouping points per slug. A point in two places now appears in both SVGs (D-05).

### sqlite_export.py (`:425-434`)
After the `out.occurrences` create, add:
```python
con.execute(
    f"CREATE TABLE out.occurrence_places AS SELECT * FROM read_parquet('{bridge_parquet}')"
)
```
`generate_sqlite` / `main` must locate `occurrence_places.parquet` (sandbox or EXPORT_DIR — mirror the occurrences source path handling at `:430,479`). Consider an index on `occ_id` for the membership EXISTS (analog: taxa indexes at `_create_taxa_indexes` `:296-308`, created post-DETACH).

### filter.ts edits
- `:48` remove `place_slug: string | null;` from `OccurrenceRow` (no longer a mart column).
- `:87` remove `'place_slug'` from `OCCURRENCE_COLUMNS`.
- `:296-298` replace the equality clause with the Option-B EXISTS membership test (see Pattern 1). `selectedPlace` stays single-valued (PRICH-02 deferral preserved).

### bee-occurrence-detail.ts / bee-pane.ts (D-04)
`bee-occurrence-detail.ts:226` currently reads `filterState.selectedPlace`. For the member-place list, the component needs the occurrence's `occ_id` → query `SELECT place_slug FROM occurrence_places WHERE occ_id = ? ORDER BY place_slug`, then map each via `_placeNameBySlug` (already populated by `_ensurePlaceNamesLoaded`, `bee-pane.ts:893-911`, which loads `places.json`). The slug→name map lives in `bee-pane`; plan must decide whether to pass the resolved names down as a property (cleanest, matches the "presenters receive state as properties" invariant in CLAUDE.md) or expose the lookup. **Architecture invariant reminder (CLAUDE.md):** `<bee-atlas>` owns reactive state; `bee-pane`/detail are presenters — the membership fetch should originate in the state owner or a query module, not in the presenter.

## Runtime State Inventory

> Rename/refactor/migration-adjacent (schema change), so inventory included.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `geographies.places` DuckDB table (unchanged — places still load as polygons, `places_load.py`). No occurrence-level place state is persisted outside the rebuilt parquet/db. | None — rebuilt every nightly from `int_combined` + `places.toml`. |
| Live service config | None — static hosting only (CLAUDE.md). No external service stores `place_slug`. | None. |
| OS-registered state | Nightly cron runs `data/nightly.sh` on maderas; it derives `occurrences_db_tables` dynamically from `sqlite_master` (`nightly.sh:305-308`). | None — auto-detects the new table. |
| Secrets/env vars | None reference `place_slug`. `DB_PATH`/`EXPORT_DIR` unchanged. | None. |
| Build artifacts | `public/data/occurrences.parquet`, `occurrences.db`, `places.json`, `place-maps/*.svg`, `manifest.json` all regenerated by the pipeline. New `occurrence_places.parquet` artifact. `make-local-manifest.js` and `validate-db.mjs` carry HARDCODED `occurrences_db_tables` lists. | Add `occurrence_places.parquet` to `_run_dbt_build` copy loop; add `'occurrence_places'` to both hardcoded JS arrays. Regenerate local artifacts via `cd data && uv run python run.py` (or a partial run through `places-maps`). |

**Canonical question — after every file is updated, what runtime systems still cache the old shape?** Only the two hardcoded JS table whitelists (`make-local-manifest.js:14`, `validate-db.mjs:16`) and any developer's stale local `public/data/occurrences.db` (regenerate locally). Production manifest is dynamic. No stored runtime state survives a rebuild.

## Validation Architecture

**Nyquist validation:** enabled (no `workflow.nyquist_validation: false` found in scope).

### Test Framework
| Property | Value |
|----------|-------|
| Python framework | pytest via `uv run pytest` (`cd data`) — CLAUDE.md "Data pipeline tests" |
| JS/TS framework | Vitest — `npm test` (CLAUDE.md) |
| dbt contract gate | `bash data/dbt/run.sh build` (contract enforced; CLAUDE.md, project_schema_validation) |
| Quick run (Python) | `cd data && uv run pytest tests/test_places_export.py tests/test_places_validation.py -x` |
| Full suite | `cd data && uv run pytest` and `npm test` |

### Phase Requirements → Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Point in overlap of A & B yields BOTH slugs, deterministically | unit (pipeline) | `cd data && uv run pytest tests/test_occurrence_places.py -x` | ❌ Wave 0 |
| Dropped overlap guard: overlapping polygons LOAD (no raise) | unit | `cd data && uv run pytest tests/test_places_validation.py -x` | ✅ (invert `test_overlapping_polygons`) |
| Per-place counts double-count an occurrence in 2 places (D-05) | unit | `cd data && uv run pytest tests/test_places_export.py::test_places_json_counts -x` | ✅ (update fixture + expectations) |
| occurrences mart contract is 32 cols, no place_slug | contract | `bash data/dbt/run.sh build` | ✅ (build is the gate) |
| occurrence_places contract enforced | contract | `bash data/dbt/run.sh build` | ✅ (build) |
| Frontend filter finds occurrence via EITHER of its places | unit (TS) | `npm test -- filter` | ❌ Wave 0 (assert `buildFilterSQL` emits EXISTS membership SQL) |
| occurrences.db ships `occurrence_places` table | integration | `node scripts/validate-db.mjs` (after local pipeline run) | ✅ (whitelist updated) |
| D-04 detail lists all member place names | component (TS) | `npm test -- bee-occurrence-detail` (or bee-pane) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the targeted `pytest -x` file(s) or `npm test -- <pattern>` for the touched layer.
- **Per wave merge:** `cd data && uv run pytest` + `npm test` + `bash data/dbt/run.sh build` (contract gate).
- **Phase gate:** full Python + JS suites green AND a local `uv run python run.py` (through `places-maps`) producing an `occurrences.db` that `node scripts/validate-db.mjs` accepts, before `/gsd-verify-work`. [feedback_run_tests_before_push, feedback_ci_is_verification_surface]

### Wave 0 Gaps
- [ ] `data/tests/test_occurrence_places.py` — new: build a tiny `int_combined`-shaped input + two overlapping places, assert a point in the overlap produces exactly the two expected bridge rows (sorted), and a point in one place produces one row. (Decide: test the dbt model output parquet, or factor the join into a testable helper. The dbt model is hard to unit-test in isolation; consider a DuckDB-level test that runs the bridge SQL against seeded tables — analog: `test_places_export._seed_places_db`.)
- [ ] `data/tests/test_places_export.py` — update `_write_test_occurrences_parquet` (drop `place_slug`, add identity cols) + add bridge fixture + rewrite counts to assert double-counting across two overlapping places.
- [ ] `data/tests/test_places_validation.py` — invert `test_overlapping_polygons` (assert no raise).
- [ ] TS: a `filter.ts` test asserting the place clause is now an `EXISTS` membership subquery (string-shape assertion, matching existing `buildFilterSQL` test style if present — check `src/tests/`).
- [ ] TS: component test for D-04 member-place list render.

## Security Domain

`security_enforcement` not found set to `false`; include minimally.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (low) | `place_slug` is interpolated into the membership WHERE. `filter.ts:297` already escapes via `.replace(/'/g, "''")`; the new EXISTS clause must apply the SAME escaping to the bound slug. Slugs are also `[a-z0-9-]`-constrained at validation (`places_validation.py:22`), so injection surface is minimal. |
| V6 Cryptography | no | — |
| V2/V3/V4 (authn/session/access) | no | Static site, no auth. |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| SQL injection via place slug in client query | Tampering | Keep `.replace(/'/g, "''")` escaping (filter.ts:297) on the new clause; slugs already regex-constrained server-side. |

## Open Questions

1. **Option A vs Option B bridge key.**
   - What we know: both are SQLite-valid; B yields a clean 2-col bridge and a trivial D-04 query; A avoids the priority-CASE coupling.
   - Recommendation: Option B (synthetic `occ_id`), documenting the coupling to `src/occurrence.ts:23` (this codebase already documents analogous string/positional couplings). Planner confirms.
2. **D-04 fetch placement.** Where does the per-occurrence membership query live to respect the state-ownership invariant (CLAUDE.md: bee-atlas owns state; pane/detail are presenters)?
   - Recommendation: add a `getOccurrencePlaces(occId)` (or batch) in a query module (`filter.ts` or a sibling), called by the state owner, names passed down as a property. Planner decides batch vs per-occurrence.
3. **Bridge index in occurrences.db.** Is an index on `occ_id` worth it for filter latency at the current row count?
   - What we know: taxa table is indexed post-DETACH (`sqlite_export.py:296-308`). Membership EXISTS benefits from an index on `occurrence_places(place_slug, occ_id)`.
   - Recommendation: add the index (cheap, follows precedent).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| uv / uvx | dbt build, pytest | ✓ (used throughout pipeline) | — | — |
| dbt-core + dbt-duckdb | mart build | ✓ (pinned via run.sh) | 1.10.1 / py3.13 | — |
| DuckDB spatial + sqlite extensions | bridge build, export | ✓ (auto-installed by profiles/sqlite_export) | bundled | — |
| Node + npm (Vitest, mapshaper) | frontend tests, manifest | ✓ | per `.nvmrc` | — |

No missing dependencies. This is a code/config/test change against established tooling.

## State of the Art

| Old Approach | Current Approach | When | Impact |
|--------------|------------------|------|--------|
| Single `place_slug` via `DISTINCT ON` (non-deterministic) | `occurrence_places` bridge, all memberships | This phase (160) | Overlapping/nested places supported; unblocks Phase 161 (16 WDFW overlaps) |
| `ST_Overlaps` rejects overlapping polygons | Overlaps legal | This phase (D-03) | `places.toml` may contain real nested land boundaries |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `occurrence_places` ships inside `occurrences.db` (a second table) and needs NO new manifest key | Summary Q2 / Architecture | Low — verified `occurrences_db_tables` is dynamic in nightly; if a separate artifact were wanted, a manifest key + frontend fetch would be needed |
| A2 | The four ID columns (or the `occ_id` CASE) uniquely identify an occurrence row — no two distinct occurrence rows collapse to the same key | Pattern 1 | Medium — if a single ID value spans multiple mart rows, the bridge could over/under-attribute. Mitigate with a uniqueness assertion test on `occ_id` in the occurrences mart during Wave 0. The frontend already relies on this uniqueness (selection by `ecdysis_id IN (…)` etc.), so it is very likely safe. |
| A3 | An INNER JOIN in the bridge (no row when no place) correctly represents "empty membership" | Pattern 2 / Code Examples | Low — matches D-discretion "an occurrence in no named place simply has zero bridge rows" |

## Sources

### Primary (HIGH confidence — direct code reads, this repo)
- `data/dbt/models/marts/occurrences.sql` — ST_Within join, DISTINCT ON, place_slug projection, _row_id semantics
- `data/dbt/models/marts/schema.yml` — occurrences 33-col contract (place_slug at :61-62)
- `data/dbt/models/intermediate/int_combined.sql` — per-arm ID column population (no single PK)
- `src/occurrence.ts:23-30` — `occIdFromRow` canonical identity priority
- `src/filter.ts:48,87,296-298` — OccurrenceRow type, column list, place_slug WHERE
- `src/sqlite-worker.ts:62-95`, `src/sqlite.ts` — single occurrences.db load into wa-sqlite MemoryVFS
- `data/sqlite_export.py:425-473` — CREATE TABLE out.occurrences AS SELECT * FROM parquet; index pattern; _GEO_COLS coupling
- `data/places_export.py:40-66` — `_query_counts` reads place_slug off occurrences.parquet
- `data/places_maps.py:59-65` — per-place points off place_slug
- `data/places_validation.py:6-14,109-133` — ST_Overlaps block to remove
- `data/run.py:80-84,106-116` — STEPS order, _run_dbt_build copy loop
- `data/nightly.sh:305-308` — dynamic occurrences_db_tables derivation
- `scripts/make-local-manifest.js:13-14`, `scripts/validate-db.mjs:16` — hardcoded table whitelists
- `src/bee-pane.ts:577-581,893-911,1022-1048` — _placeNameBySlug / _ensurePlaceNamesLoaded / chip render
- `src/bee-occurrence-detail.ts:226` — filterState.selectedPlace read site
- `src/bee-atlas.ts:1241,1392-1398,1477,1670-1680` — selectedPlace URL state + toggle + clear-on-mode-switch
- `data/tests/test_places_export.py`, `data/tests/test_places_validation.py` — fixtures + overlap test to update
- `./CLAUDE.md` — Python 3.14+, static hosting, ID-format invariant, contract gate, state ownership invariant

## Project Constraints (from CLAUDE.md)
- Static hosting only — bridge must ship as a static artifact (inside `occurrences.db`); no server runtime.
- Python 3.14+ for data; dbt runs under pinned py3.13 via `run.sh` (do not change).
- dbt contract enforced at EVERY `bash data/dbt/run.sh build` — update contract in lockstep with the column drop.
- ID format `ecdysis:<int>` / `inat:<int>` prefixes are load-bearing — the bridge `occ_id` (Option B) must use the SAME prefixes as `occIdFromRow`.
- State ownership: `<bee-atlas>` owns reactive state; `bee-map`/`bee-sidebar`/detail are pure presenters — the D-04 membership fetch must originate in the state owner / query module, with names passed down as properties.
- Run `npm test` before push; only push on a clean result.

## Metadata

**Confidence breakdown:**
- Join key: HIGH — verified there is no single PK (int_combined per-arm) and that `occIdFromRow` is the existing canonical identity.
- Bridge artifact/load path: HIGH — verified `occurrences.db` is the single SQLite file, built via `read_parquet` CREATE TABLE, with a dynamic table whitelist.
- dbt mechanics: HIGH — `occurrences.sql` is a direct structural analog; contract edit is mechanical.
- Counts/maps: HIGH — exact functions and read paths identified.
- Frontend ripple: HIGH — all `place_slug` sites enumerated and anchored.

**Research date:** 2026-06-23
**Valid until:** stable (internal refactor; ~30 days) — re-verify only if `occurrences.sql`, `sqlite_export.py`, or `filter.ts` change materially before planning.

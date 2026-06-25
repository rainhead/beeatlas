# Stack Research: v6.0 My Work — Progress & Provenance

**Domain:** Per-collector "work" surface added to an existing static-hosted naturalist atlas
**Researched:** 2026-06-24
**Confidence:** HIGH (all findings verified against live codebase + live iNat API + live DuckDB)

---

## Existing Stack (Fixed — Do Not Re-Research)

TypeScript · Mapbox GL JS · Lit web components · wa-sqlite + hyparquet · Eleventy + Vite ·
dbt → DuckDB (`data/beeatlas.duckdb`) → parquet + SQLite export → S3/CloudFront nightly cron.
Static hosting only. No server runtime. DuckDB-WASM explicitly rejected (page weight).

---

## New Stack Pieces Required for v6.0

The table below covers only what is **not already present**.

### Pipeline (dbt / Python)

| Addition | Version | Purpose | Why |
|---|---|---|---|
| `occurrence_status_history` table in `beeatlas.duckdb` | — | Append-only record of per-occurrence status transitions (`occ_id`, `status`, `status_date`, `canonical_name`, `county`) | Snapshot pipeline cannot reconstruct "what changed since date X" without retained history; see §Temporal History Recommendation below |
| `collectors.json` export | — | Per-collector metadata: iNat login, display name, occurrence/specimen counts by year/county/taxon | Feeds Eleventy static page generation and client-side accomplishment view |
| `collector-events-{login}.json` exports (one per collector) | — | Chronological event list for a single collector's event stream | Fetched client-side at runtime; content-hashed for cache busting |

No new Python packages. `duckdb`, `dbt-duckdb`, and `requests` are already in `data/pyproject.toml`. The history table and new exports are pure DuckDB DDL + INSERT / SELECT logic inside `run.py`.

### Frontend (Eleventy + TypeScript + Lit)

**No new npm dependencies.** All four v6.0 features compose from the existing toolkit:

| Feature | Technique | Why no new dep |
|---|---|---|
| Per-collector static pages | Eleventy pagination over `collectors.json` (same pattern as `places.json` → `place-detail.njk`) | Eleventy pagination is already the site's static page primitive |
| Accomplishment view | Lit template over pre-aggregated fields in `collectors.json` | Aggregation cheaper at build time (DuckDB) than at runtime (client SQL) |
| Event-stream UI | Lit template over `collector-events-{login}.json` fetched client-side | No UI library needed for a chronological list; existing `<bee-occurrence-detail>` component family already covers card rendering |
| Source → facets rebuild | Refactor of `filter.ts`, `style.ts`, `bee-occurrence-detail.ts` | Pure TypeScript refactor; no new dep |

---

## Temporal History Fork — Concrete Recommendation

**Recommendation: pipeline-side append-only history table in DuckDB.**

### Why Not Client-Side localStorage Watermark

Option B (client stores a `lastSeen` timestamp, diffs the current snapshot) has two fatal incompatibilities with the feature brief:

1. **Volatile and non-bookmarkable.** A new browser/device/incognito window has no history. The per-collector page is explicitly bookmarkable and meant to be shared across devices; localStorage is per-origin per-browser.
2. **Shallow.** It can only detect "this changed since I last visited." It cannot reconstruct a timeline of "this changed on 2026-04-12, then again on 2026-05-03." A chronological feed requires historical records, not a diff against a current snapshot.

### Pipeline History Table (Recommended)

The nightly `run.py` maintains a `dbt_sandbox.occurrence_status_history` table inside the persisted `beeatlas.duckdb` (already backed up to S3 after every run and restored at the start of the next run — see `nightly.sh` steps 1 and 9). Each run:

1. Compute the current status of every occurrence: whether it has a current Ecdysis identification, the `inat_quality_grade`, the `modified` max-timestamp, the `canonical_name`.
2. `INSERT INTO occurrence_status_history` rows where status has changed since the last recorded snapshot — append only; never delete.
3. Export `collector-events-{login}.json` per collector: array of `{occ_id, event_type, status_date, canonical_name, county}` sorted newest-first.

The DuckDB is already a persisted artifact across nightly runs (backed up to S3 even on failure per the trap). Adding an append-only history table costs zero additional S3 bandwidth beyond the existing DuckDB backup.

### Available Status Signals — Verified Against Live Data

| Source | Signal | Confidence | Notes |
|---|---|---|---|
| `ecdysis_data.identifications.modified` | `MAX(modified) > last known value` per `coreid` — "identification was updated in Ecdysis" | HIGH | Verified via live DuckDB: `modified` timestamps span every month from 2025-02 through 2026-06. This is the Ecdysis DB's own modification time, **not** a bulk-import date. The existing `int_id_modified.sql` model already uses this field. |
| `inaturalist_waba_data.observations.quality_grade` + `updated_at` | `quality_grade` transition (e.g. `needs_id` → `research`) with timestamp | HIGH | Verified: `created_at` and `updated_at` are `TIMESTAMP WITH TIME ZONE` in DuckDB. `updated_at` advances when quality grade changes. 303 WABA observations currently have `quality_grade = 'research'`; 1,113 remain `needs_id`. |
| `inaturalist_waba_data.observations.created_at` | Sample was first posted to iNat | HIGH | Verified: timestamp present and reliable; spans 2024-06 through 2026-06. |
| `waba_specimen` → `ecdysis` source transition | Pipeline run N-1 had `source=waba_specimen`; run N has `source=ecdysis` | HIGH | Pipeline-retained history table detects this. This represents "your specimen was catalogued in Ecdysis." |

**iNat Identifications API (deferred from Phase 1):** The `/v1/identifications` endpoint returns per-identification records with a `created_at` ISO 8601 timestamp (confirmed by live API call). This enables "your sample received an ID by [identifier] on [date]." Requires an extra nightly API call per observation_id. Defer to a follow-on phase; the transition-based detection above is sufficient for MVP.

The `date_identified` field on Ecdysis identifications is year-only for ~43% of records (e.g. `"2025"`, `"2026"`) and `"s.d."` (sine dato) for ~43%. It is not usable as a precise event timestamp. Use `modified` instead.

---

## Per-Collector Static Pages

**Pattern: identical to existing per-place pages (zero new concepts).**

The `place-detail.njk` → `_data/places.js` → `public/data/places.json` chain is the exact template:

1. Pipeline exports `public/data/collectors.json` — array of collector objects with fields: `login`, `display_name`, `occurrence_count`, `specimen_count`, `active_years[]`, `top_counties[]`, `top_taxa[]`.
2. New `_data/collectors.js` Eleventy data module: `readFileSync('public/data/collectors.json')`, same 4-line pattern as `places.js`.
3. New `_pages/collector-detail.njk` paginates over `collectors.collectorsArray`, permalink `/collectors/{login}.html`.
4. New Vite entry `src/entries/collector-page.ts` fetches `collector-events-{login}-{hash}.json` at runtime and renders the live event stream.

**Collector identity key:** `host_inat_login` is the authoritative WABA-collector identifier — the iNat login of the sample observer. This field is already present in `int_combined` and carried through `occurrences.parquet`. Distinct WABA collector count from the live DuckDB: ~156 collectors with `host_inat_login` on Ecdysis rows, ~16 with only provisional WABA samples. These are small numbers — 172 static pages is negligible build time.

---

## Accomplishment View

No new technology. The accomplishment data (counties visited, taxa count, years active, specimen count) is fully derivable at pipeline build time from `occurrences.parquet` grouped by `host_inat_login`. These aggregates belong in `collectors.json`, computed by the pipeline at export time, not at runtime by the client.

The per-collector coverage map (which counties has this collector contributed from) can be a pre-generated SVG using the existing `data/svg_map.py` / `data/species_maps.py` pattern. Zero new dependencies. Upload as stable URLs `/data/collector-maps/{login}.svg` (same S3 pattern as `/data/species-maps/` and `/data/place-maps/`).

---

## Source → Facets Rebuild

A **pure TypeScript refactor** of three existing files — no new dependencies:

- `src/filter.ts` — replace `source`-based SQL WHERE logic with orthogonal facet predicates
- `src/style.ts` — replace `source`-based Mapbox GL style switch with facet-based style function
- `src/bee-occurrence-detail.ts` — replace `source`-based card renderer switch with facet predicates

The `source` string column in `occurrences.parquet` stays in the data. The refactor replaces the ad-hoc switch-on-source logic with predicates derived from the existing occurrence fields (`ecdysis_id IS NOT NULL`, `is_provisional`, `host_inat_login IS NOT NULL`, etc.). The dbt contract is unaffected in Phase 1 of the refactor.

---

## New Artifacts for `nightly.sh` Manifest

| Artifact | Manifest key | Pattern |
|---|---|---|
| `collectors.json` | `collectors_meta` | Content-hashed, `immutable` |
| `collector-events-{login}-{hash}.json` | Not in manifest; fetched by client at `/data/collector-events/{login}-{hash}.json` | Content-hashed URL baked into `collectors.json` |
| Per-collector SVG maps | Stable URL: `/data/collector-maps/{login}.svg` | Same pattern as `/data/species-maps/` and `/data/place-maps/` |

The `nightly.sh` manifest extension and CloudFront invalidation for these are direct copies of the existing `places_meta` and `species-maps` patterns. No new S3 buckets, no new CloudFront behaviors, no CDK changes.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|---|---|---|
| DuckDB-WASM in the frontend | Already rejected (project memory explicit); page weight of tens of MB | wa-sqlite remains the frontend SQL engine |
| Auth / user accounts / login | Static hosting constraint. Personal page is public data + self-identification: pick iNat handle via URL param or navigate to `/collectors/{login}.html` | No auth. Public data. Bookmarkable URL. |
| Event sourcing framework (Kafka, Temporal.io, EventStoreDB) | Catastrophic overkill — the event history is a ~100k-row append-only DuckDB table; nightly batch is the correct cadence for a citizen-science atlas | Append-only DuckDB table, INSERT on detected status transitions |
| Per-identification API calls during nightly run (Phase 1) | Adds network dependency, rate-limit risk, and latency for marginal MVP gain; transition-based detection (quality_grade, ecdysis modified) is sufficient | Defer per-identification `created_at` to a follow-on phase |
| React / Vue / Svelte for event stream UI | The event stream is a sorted list of cards; Lit + existing `<bee-occurrence-detail>` component family already renders occurrence cards | Lit web components |
| Separate "history" S3 bucket or second database | DuckDB is already persisted to S3 between runs; the history table lives in the existing `beeatlas.duckdb` | Append-only table in the existing persisted DuckDB |
| Client-side localStorage watermark approach for event history | Non-bookmarkable, non-shareable, single-device, shallow | Pipeline-retained history table |

---

## Integration with Existing occurrences-Schema Change Process

The `occurrence_status_history` table is NOT a dbt-managed model. It lives in the `dbt_sandbox` schema as pipeline bookkeeping — written by Python in `run.py`, not by dbt. This means:

- It is exempt from the dbt contract enforcement (`data/dbt/models/marts/schema.yml`)
- It does NOT trigger the `test_dbt_diff` gate
- It IS preserved across nightly runs via the DuckDB S3 backup/restore

If v6.0 adds new columns to `occurrences.parquet` (e.g. a `collector_login` unified field), that requires the standard schema-change process documented in `project_occurrences_contract_release_sequence.md`: data-before-code ordering + one-time `SKIP_INTEGRATION_GATE=1` nightly.

---

## Sources

- Live `data/beeatlas.duckdb` query — Ecdysis `identifications.modified` spans 2025-02 through 2026-06 (not a bulk-import date); HIGH confidence (primary source)
- Live `data/beeatlas.duckdb` query — `inaturalist_waba_data.observations` has `created_at` and `updated_at` as `TIMESTAMP WITH TIME ZONE`; HIGH confidence (primary source)
- Live `data/beeatlas.duckdb` query — WABA quality_grade distribution: 303 research, 1113 needs_id, 1 casual; HIGH confidence (primary source)
- Live `data/raw/inat_expert_obs.csv` — column headers include `created_at` and `updated_at` at observation level; HIGH confidence (primary source)
- iNat API live call to `https://api.inaturalist.org/v1/identifications?user_login=rainhead&per_page=1` — per-identification `created_at` field confirmed present and ISO 8601 with timezone; HIGH confidence
- `_data/places.js`, `_pages/place-detail.njk`, `data/nightly.sh` — per-place static page and manifest upload patterns; HIGH confidence (primary sources)
- `data/dbt/models/intermediate/int_id_modified.sql`, `int_ecdysis_base.sql` — `modified` field already used in the dbt model; HIGH confidence (primary source)
- iNaturalist open-data GitHub README (fetched) — six CSV files, no identifications table in the open-data export; HIGH confidence (means per-identification `created_at` requires the live API, not the open-data dump)

---

*Stack research for: BeeAtlas v6.0 My Work — Progress & Provenance*
*Researched: 2026-06-24*

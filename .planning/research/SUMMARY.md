# Project Research Summary

**Project:** Washington Bee Atlas — v1.1 iNaturalist API Integration
**Domain:** Static biodiversity map with CI/CD deploy; Python data pipeline; client-side Parquet
**Researched:** 2026-02-25
**Confidence:** HIGH (grounded in direct codebase inspection and official library docs)

## Executive Summary

The v1.1 milestone adds a second data stream to an already-working static map. The existing architecture — Python pipeline produces a Parquet file, Vite bundles it as a content-hash asset, hyparquet reads it client-side, OpenLayers renders it as a vector layer — is proven and simply needs to be repeated for iNaturalist observations. No new dependencies, no new AWS infrastructure, and no authentication are required. Both `pyinaturalist` (0.21.1) and `pyinaturalist-convert` (0.7.4) are already locked in `data/uv.lock`; the Washington Bee Atlas project ID (166376) is already recorded in `data/inat/projects.py`. The core implementation is a new `data/inat/download.py` script following the same pattern as the existing `data/ecdysis/occurrences.py`.

The single non-trivial technical decision is how to handle specimen count extraction. iNaturalist observation field values (`ofvs`) are not included in API responses by default — the `fields=all` parameter must be explicitly specified. More critically, the exact field ID used by the WA Bee Atlas for specimen count cannot be determined without inspecting live observations; it must be discovered at pipeline build time by querying `/v1/projects/166376`. The pipeline should treat absent specimen count as null (not 0), because the WA Bee Atlas is likely a collection project where observation field entry is voluntary, and the frontend sidebar must distinguish "0 specimens" from "not recorded."

The two significant risks for v1.1 are both in CI/CD rather than application logic. First, the iNat API is an external dependency that can fail independently of ecdysis.org, meaning the CI now has two external failure points; committing a fallback `samples.parquet` (matching the existing pattern for `ecdysis.parquet`) is the mitigation. Second, the existing `build-data.sh` runs on every push to any branch — adding a second API call compounds this waste; the iNat download should either be gated to the `deploy` job only or separated into a scheduled pipeline job.

## Key Findings

### Recommended Stack

No new dependencies are required. `pyinaturalist` with `page='all'` handles cursor-based pagination automatically via its `IDRangePaginator` (uses `id_above` under the hood, handles arbitrarily large result sets without hitting the 10,000-record offset cap). `pyinaturalist-convert`'s `to_dataframe()` covers core fields but does not expand `ofvs` — a small custom `extract_ofv()` helper handles specimen count extraction.

**Core technologies (existing, no changes needed):**
- `pyinaturalist` 0.21.1: iNat API client — `get_observations(project_id=166376, page='all', per_page=200)`; built-in rate limiting via pyrate-limiter
- `pyinaturalist-convert` 0.7.4: converts observation response objects to pandas DataFrames via `to_dataframe()`; does not expand `ofvs` (custom helper required)
- `pandas` + `pyarrow`: Parquet production (same as ecdysis pipeline, unchanged)
- `hyparquet` (frontend): HTTP range requests to read samples.parquet client-side (same pattern as ecdysis.parquet)
- OpenLayers `VectorLayer` + `forEachFeatureAtPixel`: layer-discriminated click handling with `layerFilter`

**Critical version notes:**
- Use iNat API v1, not v2: v2 has documented project observation count discrepancies vs v1; pyinaturalist's wrappers target v1
- `page='all'` pagination must be verified against installed 0.21.1 docs before use (MEDIUM confidence on exact parameter name)

### Expected Features

**Must have (table stakes) — all 5 PROJECT.md requirements:**
- INAT-01: Query iNat API with cursor pagination for all WA Bee Atlas project observations
- INAT-02: Extract observer, date, coordinates, specimen count (with `fields=all` to get `ofvs`); null-safe extraction
- INAT-03: Write `samples.parquet` with schema: `observation_id` (int64), `observer` (string), `date` (string ISO), `lat` (float64), `lon` (float64), `specimen_count` (Int64 nullable), `uri` (string)
- MAP-03: Sample markers layer — diamond-shaped, iNaturalist green (#74ac00), no clustering, renders above specimen layer
- MAP-04: Click-to-detail sidebar — three-state render (summary / specimen cluster / iNat sample); shows observer, date, specimen_count ("Not yet entered" for null), link to iNat URL

**Should have (differentiators, low complexity):**
- `uri` stored in Parquet for sidebar deep-linking (`uri` is always present in API response; trivial to include)
- Observer display name fallback: prefer `user.name`, fall back to `user.login` if name is empty string
- Data freshness date displayed on map (e.g., "Sample data as of 2026-02-25") to manage volunteer expectations

**Defer to v2+:**
- Specimen-to-sample linkage (Ecdysis HTML scraping) — explicitly v1.2 per PROJECT.md
- Distinct "pending" vs "counted" marker styles — nice-to-have, not blocking milestone
- URL sharing for iNat-specific state — NAV-01, explicitly v1.2 per PROJECT.md
- Host plant display layer — different data shape, out of scope for v1.1
- Taxon filtering for sample markers — iNat observations represent collection events, not identified specimens

### Architecture Approach

The integration follows the same pattern as the existing ecdysis pipeline end-to-end: Python produces a Parquet file, `build-data.sh` copies it to `frontend/src/assets/`, Vite bundles it with a content-hash URL, and hyparquet reads it client-side. No new AWS infrastructure, no CORS issues (same CloudFront origin), no CDK changes. The frontend extension requires modifying six existing files and adding one new file (`data/inat/download.py`).

**Major components:**
1. `data/inat/download.py` (NEW) — iNat API fetch with `fields=all` and cursor pagination; null-safe `ofvs` extraction; writes `samples.parquet`
2. `scripts/build-data.sh` (MODIFIED) — adds iNat download step and copy to `frontend/src/assets/`
3. `frontend/src/parquet.ts` `ParquetSource` (MODIFIED) — extract `columns` + `featureFromRow` as constructor options so both ecdysis and iNat variants share the class without duplication
4. `frontend/src/bee-map.ts` (MODIFIED) — add `sampleSource`, `sampleLayer`, `selectedInatSample` state; update singleclick handler to check sampleLayer first via `forEachFeatureAtPixel` with `layerFilter`
5. `frontend/src/bee-sidebar.ts` (MODIFIED) — add `InatSample` interface, `inatSample` property, `_renderInatDetail()`, three-branch `render()`
6. `frontend/src/style.ts` (MODIFIED) — add `sampleStyle` export (diamond, iNat green, no cluster label)

**Key patterns:**
- Layer-discriminated click: `forEachFeatureAtPixel` with `{ layerFilter: (l) => l === sampleLayer }` before falling through to existing specimen cluster path; prevents spurious double-fires from overlapping layers
- No clustering for sample markers: each iNat observation is a distinct collection event; hundreds of points pose no render performance concern at this scale
- Committed fallback Parquet: `frontend/src/assets/samples.parquet` committed as a valid stub, overwritten by pipeline build

### Critical Pitfalls

1. **`ofvs` not returned by default** — Include `fields=all` in the API request. Without it, `specimen_count` will be null for every observation. The sample observation JSON in the repo (`data/inat/observation/300847934.json`) confirms `ofvs` is absent from a default API response. (PITFALL-7, blocking INAT-02)

2. **Observation field ID must be discovered, not assumed** — The specimen count field numeric ID for the WA Bee Atlas project is not findable via web search. Discover it by querying `/v1/projects/166376` or inspecting a live observation with a known specimen count; hardcode as a named constant. Matching by name string works as a fallback but is fragile (case-sensitive; curator can rename the field). (PITFALL-8, blocking INAT-02)

3. **CI external dependency failure** — The iNat API is a second external failure point alongside ecdysis.org. Commit `samples.parquet` as a fallback; gate the iNat download to the deploy job only (not every branch push) to avoid unnecessary rate limiting across concurrent CI runs. (PITFALL-11, PITFALL-12)

4. **iNat API pagination hard limit** — The 10,000-record offset-based cap is hard server-side; `page='all'` in pyinaturalist uses `id_above` cursor pagination to bypass it. Use `page='all'` from day one. Assert `total_results < 10_000` as a monitoring guard; fail the pipeline loudly if exceeded rather than silently truncating. (PITFALL-5)

5. **`specimen_count` must be nullable, not default-to-zero** — WA Bee Atlas is likely a collection project; observation field entry is voluntary. Many observations will have no specimen count field. Use nullable `Int64` in pandas; display "Not yet entered" in the frontend sidebar for null, not "0". (PITFALL-9)

## Implications for Roadmap

Dependencies flow strictly from pipeline to frontend, with two internal parallel sub-paths in the frontend phase. The natural structure is three sequential phases, with explicit parallelism noted within each.

### Phase 1: Data Pipeline (INAT-01, INAT-02, INAT-03)

**Rationale:** The pipeline must produce a valid `samples.parquet` before any frontend work can be meaningfully validated. Two blocking unknowns — the `fields=all` parameter syntax and the specimen count field ID — must be resolved before writing the extraction logic. The phase begins with a live API inspection step (one curl command) that unblocks all subsequent pipeline work.

**Delivers:** `data/inat/download.py` producing `samples.parquet` with the correct schema; `build-data.sh` extended with the iNat download step; committed fallback Parquet file; schema validation assertion in pipeline.

**Addresses:** INAT-01, INAT-02, INAT-03 (all PROJECT.md pipeline requirements)

**Avoids:** PITFALL-7 (ofvs not returned by default), PITFALL-8 (field ID unknown), PITFALL-5 (pagination cap — use `page='all'`), PITFALL-11/12 (CI external dependency — commit fallback, gate download to deploy job), PITFALL-20 (pdb.set_trace() must be removed from `data/ecdysis/occurrences.py` first — this is blocking and must be the first commit)

**Key tasks in order:**
1. Remove `pdb.set_trace()` from `data/ecdysis/occurrences.py` line 95 (blocking)
2. Inspect live WA Bee Atlas observations to discover specimen count field ID
3. Verify `fields=all` parameter syntax in pyinaturalist 0.21.1
4. Write `download.py` with `fields=all`, cursor pagination, null-safe `ofvs` extraction
5. Add post-write schema validation (assert column types via `pyarrow.parquet.read_schema()`)
6. Extend `build-data.sh`; commit fallback `samples.parquet`

### Phase 2: Frontend Sample Layer (MAP-03)

**Rationale:** The `ParquetSource` refactor (extract configurable `columns`/`featureFromRow`) is prerequisite to the sample source but the style export is independent and can proceed in parallel. This phase ends with visible diamond markers on the map. Frontend development can proceed against a hand-crafted stub `samples.parquet` before Phase 1 is complete.

**Delivers:** Refactored `ParquetSource` accepting configurable columns and feature mapping; `sampleStyle` export (diamond, iNat green); `sampleSource` and `sampleLayer` added to `BeeMap`; correct z-ordering above specimen clusters.

**Addresses:** MAP-03

**Avoids:** PITFALL-4 (Vite Parquet handling — bundle as `?url` asset, same as ecdysis; no runtime S3 fetch), anti-pattern of merging specimens and iNat observations into one Parquet (incompatible schemas, different update cadences), anti-pattern of clustering sample markers (collection events must remain individually identifiable)

**Parallelism:** `parquet.ts` refactor and `style.ts` `sampleStyle` addition can proceed in parallel; `bee-map.ts` layer construction waits for both.

### Phase 3: Click Interaction and Sidebar (MAP-04)

**Rationale:** Depends on MAP-03 completing (layer must exist and be clickable). The three-state sidebar render and layer-discriminated click handler are logically independent of each other and can be developed in parallel, but both must complete before the milestone is done.

**Delivers:** Complete MAP-04 — click on a sample marker shows observer, date, specimen_count (null-aware: "Not yet entered"), link to iNat observation URL. Sidebar correctly handles all three states: summary, specimen cluster detail, iNat sample detail.

**Addresses:** MAP-04

**Avoids:** PITFALL-9 (collection project: null specimen_count shown as "Not yet entered," not "0"), anti-pattern of using `map.getFeaturesAtPixel` without `layerFilter` (mixing cluster features and iNat features in same callback requires fragile type-checking)

**Key tasks:**
- Update singleclick handler: `forEachFeatureAtPixel` with `{ layerFilter: (l) => l === sampleLayer }` first; fall through to existing specimen cluster path on miss
- Add `InatSample` interface and `_renderInatDetail()` to `bee-sidebar.ts`
- Three-branch render: summary / specimen cluster / iNat sample
- Test all three click paths and the empty-map click (clear-selection) path

### Phase Ordering Rationale

- Pipeline before frontend because the specimen count field ID and `fields=all` syntax are unknowns; building the extraction layer before these are resolved would require rework. However, Phase 2 frontend work can begin against a hand-crafted stub Parquet without waiting for Phase 1 to complete.
- `ParquetSource` refactor must precede the sample layer (Phase 2 internal dependency); style export can proceed in parallel.
- Sidebar (Phase 3) depends on the layer existing and being clickable (Phase 2 complete).
- `pdb.set_trace()` removal is blocking and must be the very first commit — it causes CI to hang indefinitely on any run that hits the Ecdysis pipeline.

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 2 (frontend layer):** OpenLayers multi-layer rendering and `forEachFeatureAtPixel` with `layerFilter` are well-documented. Vite `?url` import pattern is identical to existing working ecdysis code. `RegularShape` diamond style is a standard OL pattern.
- **Phase 3 (sidebar):** Lit component three-branch render is an established pattern already in use in `bee-sidebar.ts`. The `CustomEvent` dispatch for "Back" navigation follows the existing component communication pattern.

Phases requiring live investigation before coding (not research-phase, but pre-implementation verification — 10–30 minutes each):
- **Phase 1 (pipeline) — specimen count field ID:** One curl command against the live WA Bee Atlas project to inspect `ofvs` on a known observation. Cannot be determined without live API access.
- **Phase 1 (pipeline) — `fields=all` parameter name:** Verify the exact pyinaturalist 0.21.1 keyword argument for requesting observation field values in `get_observations()`. STACK.md and PITFALLS.md both reference this parameter but with slightly different syntax (`fields='all'` vs `extra=fields`).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Both libraries verified in `data/uv.lock` directly; API auth requirements confirmed from official docs; rate limits from official iNat Recommended Practices |
| Features | HIGH | Actual observation JSON in repo (`data/inat/observation/300847934.json`) confirms field paths; all existing frontend source files read directly; PROJECT.md requirements are precise |
| Architecture | HIGH | All integration point files read directly; OL multi-layer patterns confirmed against official API docs; Vite `?url` and hyparquet patterns identical to existing working code |
| Pitfalls | HIGH (project-specific) / MEDIUM (AWS/GHA patterns) | Direct code audit for project-specific bugs (pdb.set_trace, dtype duplication) is HIGH confidence; CDK/GHA pitfalls from training data cutoff August 2025 are MEDIUM |

**Overall confidence:** HIGH

### Gaps to Address

- **Specimen count field ID and name (LOW confidence):** Not determinable from web search or the sample observation JSON in the repo (which has no `ofvs`). Resolve with one `curl` command against the live API before writing extraction logic. Blocking for Phase 1.
- **`fields=all` exact parameter syntax (MEDIUM confidence):** PITFALLS research flags this as "use `fields=all` or `extra=fields`." Confirm the exact pyinaturalist 0.21.1 keyword argument name before writing the extraction call. Low-effort to resolve (check installed docs).
- **WA Bee Atlas project type — collection vs traditional (LOW confidence):** Affects what fraction of observations will have null `specimen_count`, which affects how prominently the "Not yet entered" state should be displayed in the UI. Resolve via `GET /v1/projects/166376` (one API call). Informs UI copy emphasis, not architecture.
- **`page='all'` vs manual `id_above` loop:** STACK.md recommends `page='all'`; ARCHITECTURE.md shows a manual loop. Both are correct; `page='all'` is simpler if pyinaturalist 0.21.1 supports it — verify before choosing.

## Sources

### Primary (HIGH confidence)
- `data/uv.lock` — library versions (pyinaturalist 0.21.1, pyinaturalist-convert 0.7.4) verified directly
- `data/inat/projects.py` — WA Bee Atlas project ID 166376 confirmed
- `data/inat/observation/300847934.json` — actual iNat API response confirming field paths and absence of `ofvs` in default response
- `data/pyproject.toml` — pyinaturalist dependency declaration confirmed
- `scripts/build-data.sh` — existing pipeline pattern confirmed by direct read
- `data/ecdysis/occurrences.py` — Parquet output pattern confirmed; `pdb.set_trace()` at line 95 confirmed
- `frontend/src/parquet.ts`, `bee-map.ts`, `bee-sidebar.ts`, `style.ts`, `filter.ts` — frontend architecture confirmed by direct read
- `.github/workflows/build-and-deploy.yml` — CI runs on all branches confirmed
- [iNaturalist API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — rate limits, id_above pagination strategy
- [iNaturalist API v1 docs](https://api.inaturalist.org/v1/docs/) — endpoint structure, per_page=200 maximum
- [pyinaturalist 0.21.1 docs](https://pyinaturalist.readthedocs.io/en/stable/) — get_observations(), page='all' IDRangePaginator behavior
- [OpenLayers forEachFeatureAtPixel API](https://openlayers.org/en/latest/apidoc/module-ol_layer_Vector-VectorLayer.html) — layerFilter option confirmed
- [hyparquet asyncBufferFromUrl](https://github.com/hyparam/hyparquet) — HTTP range request pattern
- [Vite static asset handling](https://vite.dev/guide/assets) — ?url import pattern

### Secondary (MEDIUM confidence)
- [pyinaturalist-convert docs](https://pyinaturalist-convert.readthedocs.io/en/stable/) — to_dataframe() column coverage (does not expand ofvs)
- [iNat forum: API v1 vs v2 project count discrepancy](https://forum.inaturalist.org/t/api-v1-vs-api-v2-observation-count-by-project-not-the-same/24394) — recommendation to use v1 for project queries
- [iNat forum: 429 at 60 req/min](https://forum.inaturalist.org/t/429-error-from-observations-histogram-api-when-calling-at-60-calls-minute/64709) — real-world rate limit behavior
- [Understanding Projects on iNaturalist](https://help.inaturalist.org/en/support/solutions/articles/151000176472) — collection vs traditional project distinction
- [CloudFront + S3 CORS caching edge cases](https://advancedweb.hu/how-cloudfront-solves-cors-problems/) — rationale for bundling as asset vs runtime S3 fetch

### Tertiary (LOW confidence — needs live verification)
- Specimen count observation field name/ID for WA Bee Atlas — not findable via web search; must inspect live observations
- Exact pyinaturalist 0.21.1 parameter name for requesting ofvs in `get_observations()` — PITFALLS research notes ambiguity between `fields='all'` and `extra=fields`

---
*Research completed: 2026-02-25*
*Ready for roadmap: yes*

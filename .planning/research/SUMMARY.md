# Project Research Summary

**Project:** Washington Bee Atlas — v1.2 iNat Pipeline (pipeline-only)
**Domain:** Python data pipeline — iNaturalist API to Parquet
**Researched:** 2026-03-10
**Confidence:** HIGH (codebase read directly; pyinaturalist source inspected in `.venv`; live iNat API response in repo)

## Executive Summary

This milestone (v1.2) is a focused pipeline extension: query the iNaturalist API for all Washington Bee Atlas project observations and produce `samples.parquet` alongside the existing `ecdysis.parquet`. No frontend changes are in scope — MAP-03, MAP-04, and specimen-to-sample linkage are explicitly deferred to v1.3+. The existing codebase already has the necessary libraries (`pyinaturalist` 0.21.1 and `pyinaturalist-convert` 0.7.4, both locked in `data/uv.lock`), the project ID (166376 in `data/inat/projects.py`), and placeholder module files. The implementation pattern is directly established by the existing Ecdysis pipeline: a Python script fetches data, writes a Parquet file, and `build-data.sh` copies it to `frontend/src/assets/`. Estimate: 1–2 days of focused work.

The single highest-risk unknown is the specimen count observation field name or ID used by the Washington Bee Atlas project. This cannot be resolved statically — it requires a live API call to inspect real observations from project 166376 before extraction logic can be written correctly. Everything else (pagination, rate limiting, schema, build integration) is either handled automatically by pyinaturalist or mirrors the existing Ecdysis pipeline exactly. There is also a minor ambiguity between `page='all'` (pyinaturalist cursor pagination) and a manual `id_above` loop — both are correct; pyinaturalist source confirms `page='all'` internally uses `IDRangePaginator` with `id_above` and is the simpler choice.

The key operational risk is CI fragility: adding an iNat API call to `build-data.sh` introduces a second external dependency alongside ecdysis.org, and CI runs on every branch push. The mitigation is to commit a stub `samples.parquet` (correct schema, zero rows) before the feature branch is created — the same pattern already used for `ecdysis.parquet`. Additionally, `pyinaturalist-convert`'s `to_dataframe()` should not be used: it produces unusable column names (`ofvs.{field_id}` instead of field names) and does not correctly split coordinates. Parse raw observation dicts directly.

## Key Findings

### Recommended Stack

No new dependencies are needed. Both `pyinaturalist` (0.21.1) and `pyinaturalist-convert` (0.7.4) are already locked in `data/uv.lock` and declared in `data/pyproject.toml`. Use `pyinaturalist.get_observations()` with `page='all'` for automatic cursor pagination. Do not use `pyinaturalist-convert.to_dataframe()` — verified against installed source: it converts `ofvs` to `ofvs.{field_id}` column names and returns `location` as a list instead of split lat/lon, making it unsuitable for the samples schema.

**Core technologies (existing, no changes needed):**
- `pyinaturalist` 0.21.1: iNat API client — `get_observations(project_id=166376, page='all', per_page=200)`; built-in rate limiting via `pyrate-limiter`; `IDRangePaginator` for unlimited cursor-based result sets
- `pandas` >=3.0.0: DataFrame construction and Parquet writing — already in use by `ecdysis/occurrences.py`
- `pyarrow` >=22.0.0: Parquet engine (`engine='pyarrow'`, `compression='snappy'`) — already in use

**Do not add:** OAuth libraries (public API requires no auth), `aiohttp` (synchronous CI pipeline), raw `requests` (pyinaturalist manages sessions and rate limiting), `pyinaturalist-convert.to_dataframe()` (wrong column shapes), duckdb CLI (incomplete Makefile target, inconsistent with established Python pipeline pattern).

**Critical version note:** Use iNat API v1 (pyinaturalist default), not v2. The v2 API has documented project observation count discrepancies versus v1. GeoJSON coordinate order also differs: v2 returns `[lon, lat]`; v1 (pyinaturalist) returns `(lat, lon)` tuple.

### Expected Features

**Must have (table stakes — v1.2 INAT-01/02/03):**
- Fetch all WA Bee Atlas project observations: `get_observations(project_id=166376, page='all', per_page=200)` — handles cursor pagination automatically via `IDRangePaginator` (INAT-01)
- Confirm whether pyinaturalist v1 endpoint includes `ofvs` by default, or requires explicit `fields='all'` parameter — this has conflicting signals across research files and must be verified with one live API call
- Discover specimen count field name/ID by inspecting a live project observation's `ofvs` array; hardcode as a named constant; match by field name string (case-insensitive) as primary strategy (INAT-02)
- Extract per observation: `observation_id`, `observer` (prefer `user.name`, fall back to `user.login`), `date` (YYYY-MM-DD), `latitude`, `longitude`, `specimen_count` (INAT-02)
- Treat `specimen_count` as nullable `Int64` from day one — WA Bee Atlas is likely a collection project where observation field entry is voluntary; expect significant null fraction (INAT-02)
- Write `samples.parquet` with schema: `observation_id` (int64), `observer` (pd.StringDtype), `date` (pd.StringDtype), `lat` (float64), `lon` (float64), `specimen_count` (Int64 nullable) (INAT-03)
- Extend `scripts/build-data.sh` with iNat download step and `cp data/samples.parquet frontend/src/assets/samples.parquet` (INAT-03)
- Commit stub `samples.parquet` (correct schema, zero rows) before CI runs on the feature branch

**Should have (differentiators, low complexity):**
- Include `uri` column in samples.parquet — enables future MAP-04 deep-linking without URL reconstruction; `uri` is always present in API response; cheap to carry through
- Progress logging — log observation count, page count, null rate in `specimen_count` for CI debugging
- Log all distinct observation field names found in first fetched page — aids specimen count field debugging

**Defer to v1.3+:**
- MAP-03: Sample markers map layer — requires specimen-to-sample linkage design first
- MAP-04: Click-to-detail sidebar — depends on MAP-03
- Specimen-to-sample linkage (Ecdysis HTML scraping) — separate script `fetch_inat_links.py` already stubbed; deferred per PROJECT.md
- OR project support (project_id=18521) — stub already in `inat/projects.py`; trivially parameterized but explicitly out of scope

### Architecture Approach

The new pipeline integrates as a third step in the existing `build-data.sh` orchestrator, strictly mirroring the Ecdysis pattern. A new script `data/inat/download.py` (or `fetch_observations.py`) calls the iNat API, writes `data/samples.parquet`, and `build-data.sh` copies it to `frontend/src/assets/`. The Vite build picks up the file automatically as a content-hashed `?url` asset — no frontend code change is needed in v1.2. No CDK, GitHub Actions, or infra changes are needed.

**Major components:**
1. `data/inat/download.py` (NEW — core deliverable): Query iNat API v1, cursor-paginate via `get_observations(page='all')`, extract required fields, write `data/samples.parquet` matching the Ecdysis dtype conventions (`pd.StringDtype()`, nullable `Int64`)
2. `data/inat/observations.py` (FILL IN — currently empty): Extraction helpers — `extract_specimen_count(ofvs)`, row dict builder — may remain inline in `download.py` if the script stays simple
3. `scripts/build-data.sh` (MODIFY): Add two lines after existing Ecdysis steps: `uv run python inat/download.py` and `cp data/samples.parquet frontend/src/assets/samples.parquet`
4. `frontend/src/assets/samples.parquet` (NEW STUB): Committed minimal valid Parquet file, correct schema, zero rows — prevents CI breakage before the download script ships or when iNat API is unavailable

**Build order (respecting dependencies):**
- Step 1: Discover specimen count field ID (live API call — 30 minutes)
- Step 2 and Step 3 in parallel: write `download.py` + create committed stub `samples.parquet`
- Step 4: Extend `build-data.sh` (requires Step 2 working locally)
- Step 5: End-to-end verification — `npm run build` succeeds, both Parquet files land in `frontend/src/assets/`

### Critical Pitfalls

1. **`ofvs` may be absent unless explicitly requested** — The sample observation JSON in the repo (`data/inat/observation/300847934.json`) contains no `ofvs` key in a v2 API response. For v1 via pyinaturalist, confirm `ofvs` is included by default or add `fields='all'`. Log a warning if `ofvs` is missing from fetched observations. (Pitfall 7)

2. **Specimen count field ID is unknown — must be discovered live** — The WA Bee Atlas project uses a custom observation field; its numeric ID cannot be found by web search. Inspect real observations to find the field name; hardcode as a named constant. Filtering by name string works as a primary strategy but is fragile (case-sensitive, curator can rename). (Pitfall 8)

3. **Collection project means sparse `specimen_count`** — WA Bee Atlas is likely a collection project; volunteers cannot be required to fill in observation fields. Expect >50% null `specimen_count`. Schema must use nullable `Int64`, not `int` with 0 default. Null in Parquet correctly expresses "not yet entered." (Pitfall 9)

4. **API pagination hard cap at 10,000 records** — `page='all'` in pyinaturalist uses `IDRangePaginator` (`id_above` cursor) to bypass the offset-based 10,000-record server limit. Use `page='all'` from day one even though current WA Bee Atlas volume is well below 10,000. Assert `total_results` from the first page response and fail loudly if `len(results) != total_results`. (Pitfall 5)

5. **CI failure without committed stub** — `build-data.sh` runs on every branch push; iNat API downtime or rate limiting breaks every CI build. Commit a valid zero-row `samples.parquet` before the download step is merged. Optionally gate the live download behind an environment variable to allow CI dry runs. (ARCHITECTURE.md Anti-Pattern 2)

## Implications for Roadmap

Research reveals a single linear dependency chain with one hard prerequisite (field ID discovery) gating the main implementation. The natural structure is two or three focused phases:

### Phase 1: Pre-Implementation Discovery and Stub

**Rationale:** The specimen count field ID is the only blocking unknown for this entire milestone. Resolving it takes 30 minutes and unblocks all subsequent pipeline work. The committed stub Parquet must land in main before any feature branch is created to prevent CI failures throughout development.

**Delivers:** Confirmed `SPECIMEN_COUNT_FIELD_NAME` constant; verified `ofvs` inclusion behavior for pyinaturalist v1 `get_observations()`; committed zero-row `samples.parquet` stub with correct schema in `frontend/src/assets/`

**Addresses:** INAT-02 prerequisite; Pitfalls 7, 8, 9 (pre-empts design mistakes)

**Avoids:** Writing extraction logic against an unverified field name — the risk of silent null data

### Phase 2: Pipeline Implementation

**Rationale:** With field ID confirmed and the stub committed, the full pipeline can be written in one pass. The pattern is exactly established by `ecdysis/download.py` and `ecdysis/occurrences.py`. No new patterns need to be invented.

**Delivers:** `data/inat/download.py` producing valid `samples.parquet` with correct schema; `data/inat/observations.py` extraction helpers if warranted; progress and diagnostic logging

**Addresses:** INAT-01, INAT-02, INAT-03

**Uses:** `pyinaturalist.get_observations(page='all')`, pandas `pd.StringDtype()` and `Int64` nullable dtype conventions, `pyarrow` Parquet engine, `snappy` compression — all matching existing pipeline conventions in `ecdysis/occurrences.py`

**Avoids:** `to_dataframe()` from pyinaturalist-convert (wrong column shapes); manual `id_above` loop (use `page='all'` instead); authentication libraries (not needed)

### Phase 3: Build Integration and End-to-End Verification

**Rationale:** Separating the build script modification from pipeline implementation allows local testing of `download.py` before wiring it into CI. End-to-end verification confirms both Parquet files produce valid output and `npm run build` succeeds.

**Delivers:** `build-data.sh` extended with iNat download and copy step; confirmed end-to-end local build with both `ecdysis.parquet` and `samples.parquet` present; CI green on merge

**Addresses:** INAT-03 (CI integration); Vite content-hashing of `samples.parquet` is automatic and requires no configuration change

**Avoids:** CI breakage — ensured by committed stub from Phase 1

### Phase Ordering Rationale

- Phase 1 before Phase 2: field ID is a hard dependency; extraction logic written before it is confirmed may require rework
- Phase 2 before Phase 3: `build-data.sh` extension only makes sense after `download.py` produces valid output locally
- Committed stub (Phase 1 deliverable) must land in main before Phase 2 PR is created — otherwise the feature branch CI fails on every push

### Research Flags

Phases with standard patterns (no additional research needed):
- **Phase 2 (pipeline implementation):** Extraction and Parquet-writing pattern is fully established by `ecdysis/occurrences.py`; pyinaturalist pagination confirmed in installed source; rate limiting automatic
- **Phase 3 (build integration):** Two lines added to `build-data.sh` following an existing pattern; no new infrastructure

Phases requiring live API verification before coding (not a research phase — 30 minutes of live API inspection):
- **Phase 1 (field ID discovery):** One `curl` command against the live WA Bee Atlas project API. The exact command is documented in STACK.md. Result must be recorded as a constant before Phase 2 begins. Also verify: does `get_observations()` include `ofvs` by default, or is `fields='all'` required?

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Library versions read from `data/uv.lock`; pyinaturalist source inspected in `.venv`; no new dependencies needed |
| Features | HIGH | Three INAT requirements are precise; existing Ecdysis pipeline is the exact template; only field ID is unknown |
| Architecture | HIGH | All integration files read directly from codebase; integration pattern mirrors existing Ecdysis steps exactly |
| Pitfalls | HIGH (project-specific) / MEDIUM (general infra) | Project-specific pitfalls verified against codebase and installed source; general CDK/GHA pitfalls from training data (August 2025 cutoff) |

**Overall confidence:** HIGH

### Gaps to Address

- **Specimen count field name/ID (LOW confidence):** Not determinable from web search or the sample observation JSON in the repo (which uses v2 API and has no `ofvs`). Resolve with one `curl` command against the live API before writing extraction logic. This is the only blocking unknown for the entire milestone.

- **`ofvs` presence in `get_observations()` v1 response (MEDIUM confidence):** ARCHITECTURE.md says v1 includes `ofvs` by default; PITFALLS.md (Pitfall 7) warns it may require explicit `fields` parameter. Conflicting signals — must be verified against one live API call. Low effort; can be resolved alongside field ID discovery.

- **Collection project vs traditional project (LOW confidence):** WA Bee Atlas project type not confirmed via API. Affects null fraction of `specimen_count` and how prominently the "not entered" state should surface in future MAP-04 display. Schema must be nullable regardless; this gap is informational for v1.3+ design.

- **`obs.ofvs[i].name` attribute path (MEDIUM confidence):** pyinaturalist `Observation` model exposes `ofvs` as `ObservationFieldValue` model objects. Calling `obs.to_dict()` and accessing raw dict keys is documented as a reliable fallback in STACK.md. Verify the exact attribute path against pyinaturalist's `Observation` class before finalizing extraction code.

## Sources

### Primary (HIGH confidence)

- `data/uv.lock` — all locked library versions verified directly
- `data/inat/projects.py` — WA Bee Atlas project ID 166376 confirmed
- `data/pyproject.toml` — declared dependencies confirmed
- `data/.venv/lib/python3.14/site-packages/pyinaturalist/paginator.py` — `IDRangePaginator`, `page='all'` behavior confirmed in source
- `data/.venv/lib/python3.14/site-packages/pyinaturalist/constants.py` — `PER_PAGE_RESULTS=200`, rate limit constants confirmed
- `data/.venv/lib/python3.14/site-packages/pyinaturalist_convert/converters.py` — `to_dataframe()` column structure verified (confirms unsuitability)
- `data/.venv/lib/python3.14/site-packages/pyinaturalist_convert/_models.py` — `ofvs` attribute structure in converted models
- `data/inat/observation/300847934.json` — live iNat API v2 response; confirms field paths and absence of `ofvs` in default v2 response
- `data/ecdysis/occurrences.py` — pandas dtype conventions (`pd.StringDtype()`, nullable `Int64`) confirmed as project standard
- `scripts/build-data.sh` — existing pipeline orchestration pattern confirmed
- `.github/workflows/build-and-deploy.yml` — CI runs on all branches confirmed
- [iNaturalist API v1 docs](https://api.inaturalist.org/v1/docs/) — endpoint structure, per_page=200 maximum
- [iNat API Recommended Practices](https://www.inaturalist.org/pages/api+recommended+practices) — `id_above` pagination strategy, rate limits

### Secondary (MEDIUM confidence)

- [pyinaturalist 0.21.1 documentation](https://pyinaturalist.readthedocs.io/en/stable/) — `get_observations()`, pagination behavior
- [iNat forum: API v1 vs v2 project count discrepancy](https://forum.inaturalist.org/t/api-v1-vs-api-v2-observation-count-by-project-not-the-same/24394) — recommendation to use v1 for project queries
- [iNat forum: 429 errors at 60 req/min](https://forum.inaturalist.org/t/429-error-from-observations-histogram-api-when-calling-at-60-calls-minute/64709) — real-world rate limit behavior
- [Understanding Projects on iNaturalist](https://help.inaturalist.org/en/support/solutions/articles/151000176472) — collection vs traditional project distinction

### Tertiary (LOW confidence — needs live verification)

- Specimen count observation field name/ID for WA Bee Atlas — not findable via web search; must inspect live observations from project 166376
- Whether pyinaturalist v1 `get_observations()` includes `ofvs` by default — conflicting signals; must verify with one live API call

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*

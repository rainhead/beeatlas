# Codebase Concerns

> **Carried from `.planning/codebase/CONCERNS.md` in the 2026-07 GSD migration and only lightly reviewed.**
> Some entries are stale (e.g. `bee-sidebar.ts` was deleted in v3.9; the Lambda surface was retired — see [ADR 0007](adr/0007-pipeline-runs-as-maderas-cron.md)). The durable, still-live items worth tracking are the `dbt-core==1.10.1` exact pin (a 1.10.20 macro-parser `KeyError:'javascript'` regression), the FORMAT-CSV GeoJSON emission workaround, the 84-row county-boundary `ST_Within` nondeterminism, and the static-hosting scaling ceiling. A full reconciliation against current code is tracked as a beads issue.

**Analysis Date:** 2026-05-13

## Tech Debt

**CR-01: Collector filtering by iNat username — RESOLVED (silently)**

- Original issue (Phase 67): `bee-filter-controls.ts` used `observer` field while `filter.ts` `CollectorEntry` defined `host_inat_login`. Filtering by iNat username silently failed.
- Current state (verified 2026-05-13): both interfaces use `host_inat_login` (`src/bee-filter-controls.ts:20`, `src/filter.ts:8`), and the WHERE clause is wired up at `src/filter.ts:245–255` (`host_inat_login IN (...)` joined OR with `recordedBy IN (...)` in a single collector clause). The bug was fixed without a tracking commit, likely as a side effect of the v2.7 Unified Occurrence Model schema unification.
- Status: Resolved — clearing from STATE.md "Blockers/Concerns" during this codebase remap.
- Outstanding: no dedicated unit test for the iNat-login filter path. See Test Coverage Gaps below.

**dbt-core 1.10.20 regression — macro parser keyerror**

- Issue: `dbt-core==1.10.*` was pinned to exact version `1.10.1` in `data/dbt/run.sh` (line 30, 33). Version 1.10.20 introduced a macro-parser regression (`KeyError: 'javascript'`) that breaks all dbt commands. The exact-version pin (`==1.10.1`) is a workaround, not a solution.
- Files: `data/dbt/run.sh`
- Impact: dbt commands fail immediately if the 1.10.20 regression is present. Upgrading dbt-core to any newer 1.10.x version is blocked until the upstream dbt-core issue is fixed or a 1.11.x release is available.
- Fix approach: Monitor dbt-core releases for a fix in 1.10.21+. If fixed, remove the exact-version pin and test a `1.10.*` specifier again. If not fixed, evaluate upgrading to dbt-core 1.11.x when available (requires testing the dbt-duckdb adapter against the newer dbt-core).
- Status: Active, pins build dependencies
- Recorded: Commit fffc496 ("fix(083): pin dbt-core to ==1.10.1 exactly"); documented in dbt-spike-findings.md §What Was Awkward

**FORMAT CSV GeoJSON emission fragile**

- Issue: Writing a bare GeoJSON FeatureCollection from DuckDB requires a workaround: `COPY ... TO '...' (FORMAT CSV, DELIMITER '', QUOTE '', HEADER false)` with an explicit `::VARCHAR` cast. This bypasses DuckDB's JSON machinery and is underdocumented, making it fragile across DuckDB version changes.
- Files: `data/dbt/models/marts/` (emit_feature_collection macro, exact path in Phase 83/84)
- Impact: GeoJSON output files (`counties.geojson`, `ecoregions.geojson`) are generated correctly today but depend on a DuckDB-specific workaround. Any DuckDB version bump may change CSV or JSON handling, silently breaking the macro.
- Fix approach: Before any dbt full-rewrite cutover, re-evaluate the GDAL-driver alternative (`FORMAT GDAL, DRIVER 'GeoJSON'`) to see if it can match `export.py` output byte-for-byte. If not, stabilize the FORMAT CSV path with an integration test against multiple DuckDB versions and explicit documentation.
- Status: Deferred to v3.4 rewrite
- Recorded: dbt-spike-findings.md §Open Trade-Offs and §Verdict condition #3; documented as prerequisite for cutover

---

## Known Bugs

**84-row county boundary nondeterminism**

- Symptoms: County assignment varies non-deterministically for specimens on county boundaries (Grant/Benton, Grant/Kittitas, Chelan/King, Garfield/Whitman). Same specimen may be assigned to different counties across pipeline runs.
- Files: `data/dbt/models/intermediate/int_county_base.sql` (dbt port); `data/export.py` (original Python implementation)
- Trigger: `ST_Within(geometry, polygon)` returns `True` for two adjacent polygons simultaneously when the specimen is exactly on a shared polygon edge. The `with_county` LEFT JOIN matches multiple counties; no deduplication occurs before the fallback path selects one. JOIN ordering (which varies between Python DuckDB and dbt DuckDB, or between runs within the same implementation) determines the winner.
- Workaround: Use `SELECT MIN(county)` or `SELECT FIRST(county)` in the fallback path to enforce deterministic selection. Current code does not guarantee determinism.
- Root cause: This is a **semantic divergence in BOTH implementations** (export.py and dbt port), not a regression introduced by the dbt rewrite. The nondeterminism exists in the original Python pipeline as well. Fixing it requires changing the spatial-join logic, not the dbt port.
- Impact: 84 rows (out of 47,883) exhibit boundary assignment variance. This is approximately 0.175% of the dataset. For users, it means a rare specimen on a county boundary may appear in different counties on different export runs.
- Status: Active, semantic divergence requiring investigation
- Recorded: dbt-spike-findings.md §DIFF-02; classified as "semantic divergence to investigate"; documented as prerequisite for cutover (Verdict condition #2)

**Stale schema.yml comment — RESOLVED**

- Original issue: `data/dbt/models/staging/schema.yml` lines 23–26 carried a pre-research prediction comment that did not match the actual TEST-01 outcome.
- Current state (verified 2026-05-13): comment correctly reads "TEST-01 outcome (awkward-fit): not_null FAILS with 1 null id; unique PASSES (10,846 rows, all distinct)." Fixed in commit `f50b9b2`.
- Status: Resolved.

---

## Security Considerations

**None detected.** The codebase is a static-hosted web application with no server-side auth, secrets, or user-submitted data processing. AWS credentials are handled via GitHub OIDC (no stored secrets). Environment configuration uses `.env` files (gitignored).

---

## Performance Bottlenecks

**SQLite query latency on large result sets**

- Problem: Frontend queries via `wa-sqlite` + `hyparquet` (`src/filter.ts` queryTablePage, queryAllFiltered) may slow down as the specimen table grows. Current dataset: 47,883 rows. Frontend uses pagination (100 rows per page) to avoid loading entire result set into memory.
- Files: `src/filter.ts` (lines 126–189)
- Cause: wa-sqlite is single-threaded and runs in the browser. Large WHERE clause evaluation (multi-county, multi-month filters) must be computed in JavaScript's SQLite runtime. As the dataset scales, row-by-row filtering becomes proportionally slower.
- Improvement path: Monitor query execution time in production. If latency becomes noticeable (>500ms for typical page load), consider: (1) pre-filtering the SQLite data during the Eleventy build to only include WA-relevant rows, (2) pre-aggregating filter options by geographic region to reduce the default WHERE clause, (3) moving to DuckDB-WASM for in-browser SQL (deferred due to page-weight concerns; documented in dbt-spike-findings.md §Frontend Impact).
- Status: Potential bottleneck; not currently a blocker
- Recorded: Not formally documented in planning; noted as a forward-path consideration

---

## Fragile Areas

**Collector autocomplete and filtering**

- Files: `src/bee-filter-controls.ts` (autocomplete + token construction), `src/filter.ts` (lines 245–255, collector OR clause)
- Why fragile: The collector path depends on consistent field naming (`recordedBy` vs `host_inat_login`) across three places — `CollectorEntry` (`filter.ts:5`), `CollectorToken` (`bee-filter-controls.ts:20`), and the WHERE clause builder. Adding or renaming fields requires coordinated changes; unit-test coverage for the iNat-login filter branch is thin.
- Safe modification: When changing collector-related fields, update all three sites together and add a unit test in `src/tests/filter.test.ts` (or sibling) covering: (1) iNat login autocomplete suggestions, (2) WHERE clause generation when both `recordedBy` and `host_inat_login` are selected, (3) URL-state roundtrip.
- Test coverage: Phase 82 UAT confirmed `recordedBy`-based collector filtering works. The `host_inat_login` branch (`filter.ts:251–255`) is reachable but lacks a dedicated unit test.

**dbt model contract enforcement**

- Files: `data/dbt/models/marts/schema.yml` (33-column contract with `enforced: true`)
- Why fragile: The contract is the only mechanism pre-empting schema drift before parquet is written. If the contract is accidentally removed or set to `enforced: false`, then schema drift detection moves to `scripts/validate-schema.mjs` (post-export CI gate). This two-layer defense is intentional, but the dbt-side contract is the primary developer-facing gate and must remain enforced during development iterations.
- Safe modification: Any change to the `occurrences` mart SQL (`data/dbt/models/marts/occurrences.sql`) must be accompanied by re-running `bash data/dbt/run.sh build` and confirming the contract passes. If adding/renaming columns, update the contract in `schema.yml` first, then update the mart SQL.
- Test coverage: Phase 084 §TEST-02 documented contract drift detection with a live example (renaming `county` to `county_renamed` pre-empts the build). The contract mechanism is proven.

**Spatial joins and boundary geometry (84-row nondeterminism)**

- Files: `data/dbt/models/intermediate/int_county_base.sql` and `data/export.py`
- Why fragile: The `ST_Within` spatial join on county boundaries is non-deterministic by design (DuckDB + PostGIS semantics). Both implementations exhibit the same 84-row variance. Any modification to the spatial-join query (e.g., adding a fallback for ecoregion assignment) must be tested against known boundary-case specimens to ensure determinism is maintained or intentionally enforced.
- Safe modification: Before any changes to spatial joins, (1) identify the 84 boundary-case specimens in the live data, (2) run the query multiple times and confirm assignment is consistent, (3) if still non-deterministic, add an explicit `MIN(county)` deduplication step, (4) verify the change does not affect ecoregion assignment (currently 0 divergences).
- Test coverage: Phase 084 §DIFF-02 confirms the 84-row variance with a repeatable pytest harness (`data/tests/test_dbt_diff.py`).

---

## Scaling Limits

**Static site hosting ceiling**

- Current capacity: 47,883 specimen records in SQLite; ~300 KB parquet + ~50 KB species.json + ~10 KB boundaries GeoJSON = ~1.5 MB total data payload per user session.
- Limit: Browser memory (wa-sqlite in-memory database) is typically 4-8 GB per tab. At current data sizes, no limit is hit. However, if WA expands to multi-state (v3.4+ roadmap goal), the dataset could grow to 500K+ specimens. wa-sqlite would still fit in memory, but SQL query latency would become a concern (see Performance Bottlenecks).
- Scaling path: (1) Continue static hosting by pre-filtering data per state during the Eleventy build, (2) Move to a server-backed API when per-state datasets exceed ~100 KB parquet, (3) Adopt DuckDB-WASM for in-browser analytics on multi-state datasets (v3.4+ stretch goal, currently deferred).
- Status: Not a current blocker; flagged for v3.4 planning
- Recorded: CLAUDE.md "Constraints"; multi-state expansion noted in project memory; documented as "Future scaling path" in dbt-spike-findings.md §Frontend Impact

---

## Dependencies at Risk

**dbt-duckdb adapter version sensitivity**

- Risk: `dbt-duckdb==1.10.1` is pinned exactly due to dbt-core 1.10.20 regression (see Tech Debt section). The adapter depends on dbt-core, and newer versions of dbt-core may break the adapter. There is no explicit test of the adapter across multiple dbt-core versions.
- Impact: Upgrading dbt-core is risky and requires full regression testing of the data pipeline. Staying on 1.10.1 means missing security patches and features in newer dbt releases.
- Migration plan: When dbt-core 1.11.x is released, test the full pipeline against `dbt-core==1.11.x` and `dbt-duckdb==1.11.x` before merging. Add a CI step to verify dbt --version matches the run.sh pin, preventing accidental version drift.
- Status: Active, pins development velocity
- Recorded: dbt-spike-findings.md §What Was Awkward; documented as an operational risk for v3.4 rewrite

---

## Missing Critical Features

**None identified.** The v3.3 dbt Spike spike confirmed that the `export.py` → `occurrences.parquet` pipeline can be faithfully ported to dbt-duckdb with correct outputs and test coverage. The v3.4 full-rewrite milestone has five explicit prerequisites (documented in dbt-spike-findings.md §Prerequisites), but no missing critical functionality.

---

## Test Coverage Gaps

**Collector filtering (iNat username) untested**

- What's not tested: The `host_inat_login` branch of the collector OR clause at `src/filter.ts:251–255`. The filter is wired (CR-01 silently resolved) but has no dedicated unit test.
- Files: `src/filter.ts` `buildFilterSQL()` function; `src/tests/filter.test.ts` (add coverage here)
- Risk: Future refactors of the collector clause could silently break the iNat-login branch without surfacing in CI. Cases worth covering: a specimen with both `recordedBy` and `host_inat_login` populated; multiple iNat logins selected; single-quote escaping in usernames (already handled at `filter.ts:252`).
- Priority: Low — the branch is small and the risk of silent breakage is bounded, but worth picking up alongside the next collector-feature change.

**dbt iNat key-set validation gap**

- What's not tested: Direct assertion that the set of `host_observation_id` (iNat sample IDs) is identical between sandbox and public outputs. Phase 084 §DIFF-01 explicitly requires this; current test coverage is indirect (row count + ecdysis_id anti-join arithmetically constrains iNat rows).
- Files: `data/tests/test_dbt_diff.py` (missing `test_occurrences_inat_key_set_matches`)
- Risk: If a dbt model change silently drops iNat sample rows, the row count would still match (due to a compensating drop in ecdysis rows, unlikely but possible), and the ecdysis_id key-set would match. The iNat key-set test would catch this.
- Priority: Low for v3.3 (spike); Medium for v3.4 (full rewrite cutover)
- Recorded: Phase 084 VERIFICATION.md human-verification item #2; resolved in commit f50b9b2 (test added)

**GeoJSON whitespace formatting regression test**

- What's not tested: Ensuring `counties.geojson` and `ecoregions.geojson` formatting does not regress when GeoJSON generation changes (e.g., switching from FORMAT CSV workaround to FORMAT GDAL). Phase 084 §DIFF-03 noted GeoJSON whitespace as "neutral/cosmetic," but a test confirming byte-stable output would catch accidental regressions.
- Files: `data/tests/test_dbt_diff.py` (could add a `test_geojson_whitespace_stable()` check)
- Risk: If the FORMAT CSV macro is swapped for GDAL output, the GeoJSON structure might change (adding `crs`, `id`, `bbox` fields), breaking the frontend's assumptions.
- Priority: Low for v3.3; Medium for v3.4 (GeoJSON format evaluation)

---

## Intentional Deferred Items

**speicmenLayer typo in bee-map.ts**

- What it is: `src/bee-map.ts:70` declares a private placeholder `private speicmenLayer: unknown;` (the property name has a typo: "speicmen" instead of "specimen"). `@ts-ignore` on the line above marks it as intentionally unused until a separate specimen layer is wired up.
- Status: Intentionally deferred — documented in CLAUDE.md "Constraints": "`speicmenLayer` typo in `bee-map.ts` is intentionally deferred — do not fix incidentally."
- Why deferred: The property is a placeholder for a future map layer. The typo is preserved across commits as a marker — fixing it incidentally would obscure the trail of when the placeholder was introduced and why. (Originally placed during the OL era; the map is now Mapbox GL JS, but the placeholder semantics carry over.)
- Fix approach: Rename when the specimen layer is actually implemented, not as a cleanup task.
- Impact: None at runtime — the property is unused.

**Boundary edge gaps and overlaps**

- What it is: Adjacent region polygons (counties/ecoregions) have small gaps and overlaps where the right edge of one polygon is approximated differently from the left edge of the next. This is a GeoJSON simplification artifact.
- Files: `public/data/counties.geojson`, `public/data/ecoregions.geojson`
- Status: Deferred (TODO item `.planning/todos/pending/boundary-edge-gaps.md`, priority: low)
- Impact: Visual artifacts on the map where boundaries do not perfectly align. Does not affect data correctness.
- Fix approach: Use TopoJSON-aware simplification or pre-process boundaries with `topojson-server` to enforce topological consistency. This is a GIS/cartography task, not a data pipeline issue.
- Recorded: Commit 193a57b (Phase 73 verification)

**Cluster blob selection visual feedback**

- What it is: When a user clicks a cluster blob on the map, selection state is captured (sidebar opens, `_selectedOccIds` populated), but the cluster itself shows no visual indication (yellow selection ring does not render on clustered features).
- Files: `src/bee-map.ts` (cluster layer filtering and styling)
- Status: Deferred (TODO item `.planning/todos/pending/cluster-selection-visual-feedback.md`, priority: medium)
- Impact: UX dead-zone; clicking a cluster registers selection but provides no map-side feedback.
- Fix approach: Explore auto-zoom on cluster click (common pattern) or add a halo overlay layer. See TODO file for detailed options and tradeoffs.
- Recorded: Phase 071 design decision (promoteId conflict with cluster auto-IDs); TODO updated in commit 02dff62 (Phase 73)

---

## Deferred to v3.4+ Rewrite Milestone

The dbt-spike-findings.md §Prerequisites section documents five explicit prerequisites that must be satisfied before a full-rewrite milestone proceeds. These are not bugs or tech debt, but structural decisions and validation steps required for safe cutover:

1. **Test coverage:** Every invariant enforced by `validate-schema.mjs` and `_apply_migrations()` must be re-expressed as dbt tests or contracts. Gaps: `relationships` test (cross-type key casting), `_apply_migrations` DDL equivalent.

2. **Schema decisions:** The `samples.parquet` vs `occurrences.parquet` shape must be finalized (one-file fold vs two-mart split). This unblocks contract enforcement and frontend schema updates.

3. **Ingestion-vs-transform boundaries:** dlt-style raw-schema ingestion must be decoupled from dbt transform-only operations. The seam design (dlt writes raw, dbt reads as `source()`) must be tested for freshness and incremental load behavior.

4. **Parallel-run / orchestration:** The `data/nightly.sh` cron must be redesigned to handle dbt exit codes and awkward-fit test failures. Incremental materialization behavior on dbt-duckdb + external materializations must be tested.

5. **Frontend impact:** The output schema of `occurrences.parquet` must remain stable, or frontend consumers (wa-sqlite + hyparquet) must be updated in coordination. The dbt contract and `validate-schema.mjs` post-export gate must both remain active as complementary defenses.

---

## Known State (from CLAUDE.md)

**Lambda CDK artifacts exist but are inactive:** Infrastructure-as-code definitions for AWS Lambda exist in `infra/`, but the active execution path is `data/nightly.sh` running on a maderas machine (nightly cron). The Lambda artifacts are stale and should not be used for deployments.

**Schema validation gate:** `scripts/validate-schema.mjs` runs before every CI build as a parquet schema gate. This is the last line of defense before production deployment to CloudFront.

---

*Concerns audit: 2026-05-13*

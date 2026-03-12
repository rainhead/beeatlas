# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.3 — Specimen-Sample Linkage

**Shipped:** 2026-03-12
**Phases:** 2 (Phases 11–12) | **Plans:** 4 | **Timeline:** Single day

### What Was Built
- `data/ecdysis/occurrences.py`: `occurrenceID` added to `ecdysis.parquet` column selection (pd.StringDtype)
- `data/links/fetch.py`: full links pipeline — `fetch_page`, `extract_observation_id`, `run_pipeline`; two-level skip (links.parquet then disk HTML); ≤20 req/sec rate limit; BeautifulSoup CSS selector `#association-div a[target="_blank"]`; 11 unit tests
- `scripts/cache_restore_links.sh` + `scripts/cache_upload_links.sh`: S3 persistence mirroring the v1.2 iNat cache script pattern
- `package.json` scripts: `cache-restore-links`, `cache-upload-links` (fetch-links was added by Phase 11); `build-data.sh` extended with cache restore → fetch → cache upload block

### What Worked
- TDD stub approach (Phase 11 creates failing tests, Phase 12 makes them pass) gave a clear implementation target and caught the `last_fetch_time` initialization bug before any real HTTP requests
- Reusing the existing `cache_restore.sh` / `cache_upload.sh` pattern made Phase 12 trivial — same structure, same S3 path conventions, same `|| echo` / `set -euo pipefail` asymmetry
- The research phase correctly identified the prototype bug (UUID `occurrenceID` used as `occid` URL param instead of integer `ecdysis_id`) before any code was written — saved a silent wrong-data bug
- Two waves across two plans kept concerns cleanly separated: foundation + tests (11-01) vs. implementation (11-02)
- `cd "$REPO_ROOT"` before npm commands in build-data.sh was anticipated in the plan (integration checker flagged it as a noteworthy pre-emptive fix)

### What Was Inefficient
- No VERIFICATION.md produced (verifier disabled in config) — integration checker filled the gap but this required manual audit work at milestone completion
- Phase 11 VALIDATION.md scaffolded but `nyquist_compliant` never updated to true — Nyquist validation was left in draft state throughout
- Phase 12 had no research phase (planned without it) and no VALIDATION.md — acceptable for a purely mechanical wiring phase, but consistency would be cleaner

### Patterns Established
- Use integer DB id (`ecdysis_id`) not UUID string (`occurrenceID`) for Ecdysis individual record page URLs — UUID is the DarwinCore identifier, integer is the database key used in URLs
- TDD: create failing test stubs in one plan, implement in the next — even for short milestones this gives a clean pass/fail test gate
- `last_fetch_time = time.monotonic()` (not `0.0`) to enforce rate limit on the first HTTP request, not just subsequent ones

### Key Lessons
1. **Prototype bugs are silent until tested** — the existing `fetch_inat_links.py` prototype was structurally correct but used the wrong ID type as the URL parameter. Research that reads and validates existing code prevents inheriting bugs.
2. **Reusing established patterns is fast** — the S3 cache scripts for v1.3 took ~3 minutes because the v1.2 pattern was well-established. Pattern documentation in PROJECT.md pays forward.
3. **TDD stubs in Phase N, implementation in Phase N+1** — clear contract definition before implementation reduces ambiguity and makes the executor's job mechanical.

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 1 day (2026-03-12 — plan + execute + complete)
- Notable: Fastest milestone yet — TDD stubs + established patterns kept implementation predictable

---

## Milestone: v1.2 — iNat Pipeline

**Shipped:** 2026-03-11
**Phases:** 3 (Phases 8–10) | **Plans:** 5 | **Timeline:** 2 days

### What Was Built
- `data/inat/observations.py`: field ID constants (SPECIMEN_COUNT_FIELD_ID=8338) confirmed from live API; `extract_specimen_count()` with nullable return
- `data/inat/download.py`: full pyinaturalist pipeline — incremental fetch with `merge_delta`, fallback to full on error, progress logging, 15 unit tests
- `scripts/cache_restore.sh` and `scripts/cache_upload.sh`: S3 cache round-trip with graceful miss handling and hard-fail on upload error
- CI `deploy.yml` updated: `S3_BUCKET_NAME` env at job level, cache-restore/build/cache-upload steps in both build and deploy jobs; credential ordering bug fixed

### What Worked
- Discovery phase (Phase 8) paid off: confirming field_id vs name matching before writing download.py prevented a ~40% data loss bug that would have been subtle to diagnose
- Phase 8's "live API inspection" approach gave concrete constants rather than guesses; OFVS_IN_DEFAULT_RESPONSE confirmed to be True without trial-and-error in Phase 9
- Existing IAM role already covered the S3 cache prefix — no new CDK changes needed (Phase 8 investigation saved wasted Phase 9 work)
- Unit tests for `obs_to_row`, `build_dataframe`, `merge_delta`, and export completeness caught the raw-dict-vs-model-object issue early

### What Was Inefficient
- The pyinaturalist model attribute access approach in the initial download.py plan failed at runtime (raw API dicts needed instead) — a PITFALLS.md entry existed for this but wasn't acted on in initial plan
- Three iNat-related `fix()` commits after Phase 9 completion: `location` is a list not string, raw dicts not model objects, `order_by` conflicts with paginator — these should have been discovered in Phase 8 API inspection
- `observations.ndjson` full-JSON cache was added as a post-milestone quick task — if it had been scoped into v1.2 it could have been done in one plan instead of a retroactive patch

### Patterns Established
- Match iNat observation fields by `field_id` (integer), not `name` string — names can be renamed by project admins; field IDs are stable
- Parse raw API response dicts when pyinaturalist model access is unreliable — `obs['ofvs']` not `obs.ofvs` for observation field values
- S3 cache scripts: use `|| echo "cache miss"` pattern with `set -euo pipefail` to allow graceful miss without aborting the build
- `samples.parquet` stub (zero rows, correct schema) must be committed and force-tracked before any feature branch that references it — prevents CI failure on cold start

### Key Lessons
1. **Discovery phase for external APIs is essential** — field IDs, response shapes, and API version behaviors cannot be reliably inferred from docs alone. A dedicated "confirm from live API" phase step pays for itself immediately.
2. **PITFALLS.md entries need to be in the plan, not just the research doc** — the raw-dict vs model-object pitfall was documented but not surfaced in the Phase 9 plan; it caused post-execution fix commits.
3. **Incremental fetch fallback should catch all exceptions, not just specific ones** — any corrupt cache state or network hiccup should trigger full re-fetch; defensive fallback makes the pipeline robust to unknown failure modes.

### Cost Observations
- Model mix: 100% sonnet
- Sessions: 2 days (2026-03-10 planning + execution, 2026-03-11 CI verification + quick task)
- Notable: Phase 8 discovery paid for itself — zero blocked phases, no IAM changes needed, field ID confirmed upfront

---

## Milestone: v1.1 — URL Sharing

**Shipped:** 2026-03-10
**Phases:** 1 (Phase 7) | **Plans:** 5 | **Sessions:** 2

### What Was Built
- URL state synchronization for map view (center/zoom) and all active filters (taxon, year range, months) encoded as query string params
- Shareable URLs: copying the browser URL and opening in a new tab restores the exact same map position and filter state
- Browser back/forward navigation between settled map views (500ms debounce before pushState)
- Multi-occurrence cluster URL encoding: `o=ecdysis:id1,ecdysis:id2` preserves full cluster selection across tabs

### What Worked
- Gap closure workflow caught all real issues: the initial implementation had 2 gaps (back button, o= param) that human verification found; 3 targeted fix plans resolved them cleanly
- Two-phase approach (implement → human verify → gap close → re-verify) gives high confidence without over-engineering upfront
- Plan checker identified the `_isRestoringFromHistory` async timing subtlety before execution, which helped the executor pick the right `map.once('moveend')` approach first try

### What Was Inefficient
- The `_isRestoringFromHistory` bug required gap closure despite the root cause being identified in research — the initial plan didn't fully internalize the async OL moveend timing and produced synchronous reset code
- Three separate o= bugs (strip on load, single-ID encoding, no re-push after restore) could have been caught by a more thorough initial review of `firstUpdated` and the singleclick handler
- PROJECT.md had stale content (NAV-01 listed as Out of Scope for v1.2, Current Milestone still pointing to iNat) — required manual cleanup at milestone completion

### Patterns Established
- `map.once('moveend', ...)` for deferred flag reset after programmatic OL view changes — synchronous reset is wrong, OL fires moveend asynchronously after DOM repaint
- Lit `updated()` pattern for URL-pushed restore props: BeeMap pushes 6 `@property` restore fields; BeeSidebar mirrors to `@state` via `updated()` — clean separation, no prop drilling through OL event callbacks
- Comma-separated IDs in a single URL param (`o=`) for multi-item selection — simpler than multiple params, easy to split/join

### Key Lessons
1. **OL async event timing is subtle** — `moveend`, `singleclick`, and `change` all fire asynchronously. Any guard flag reset or state push that depends on "after OL does X" must use `map.once(event, cb)`, not synchronous code after the OL method call.
2. **Human verification is a first-class plan** — having a dedicated checkpoint plan (07-02, 07-05) with explicit scenarios made gap tracking clean and gave a clear pass/fail record.
3. **URL param stripping on initial load is an easy-to-miss bug** — when implementing URL restore, verify that the first `replaceState` call preserves all incoming params, not just the ones your code "knows about" at that point in initialization.

### Cost Observations
- Model mix: 100% sonnet (executor, planner, checker, verifier all sonnet)
- Sessions: 2 working days (2026-02-25 planning start, 2026-03-09 execution)
- Notable: Single-phase milestone kept orchestrator context very lean; parallel wave 1 (07-03 + 07-04) saved ~3 min vs sequential

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~4 | 6 | Established baseline GSD workflow for this project |
| v1.1 | 2 | 1 | First use of gap closure cycle (human verify → plan gaps → re-verify) |
| v1.2 | 2 | 3 | First external API pipeline; discovery phase proved essential for external data sources |
| v1.3 | 1 | 2 | First scraping pipeline; TDD stub pattern + reuse of established S3 cache scripts made it the fastest milestone |

### Top Lessons (Verified Across Milestones)

1. Human verification at a checkpoint plan is more reliable than automated checks for browser-interactive features
2. Gap closure plans are cheaper to write and execute than getting everything right the first time — ship, verify, fix
3. Discovery/research phases for external APIs and infrastructure are worth the upfront cost — they prevent blocked implementation phases and post-execution fix commits
4. Prototype validation in research prevents inheriting bugs — reading existing code critically is part of research, not just gathering facts

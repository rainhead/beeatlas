# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

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

### Top Lessons (Verified Across Milestones)

1. Human verification at a checkpoint plan is more reliable than automated checks for browser-interactive features
2. Gap closure plans are cheaper to write and execute than getting everything right the first time — ship, verify, fix
3. Discovery/research phases for external APIs and infrastructure are worth the upfront cost — they prevent blocked implementation phases and post-execution fix commits

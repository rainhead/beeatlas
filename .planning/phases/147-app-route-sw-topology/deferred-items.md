# Phase 147 Deferred Items

## Pre-existing Test Failures (Out of Scope)

### build-output.test.ts: "emits a species-index chunk distinct from index-*.js (Phase 96, IDX-02)"

- **File:** `src/tests/build-output.test.ts` line 74
- **Failure:** Test asserts `index-*.js` chunk exists in `_site/assets/` root. Build emits `bee-atlas-*.js` (not `index-*.js`) for root SPA. Chunk name changed in a prior phase (Vite/Rolldown update or Rollup config change).
- **When found:** Phase 147 Task 4 full build run
- **Caused by:** Rolldown/Vite MPA chunk naming change in a prior phase; not related to Phase 147 changes
- **Action needed:** Update the Phase 96 IDX-02 test assertion to look for `bee-atlas-*.js` OR `index-*.js` OR remove the secondary "SPA index chunk" assertion (the first part of the test — species chunk defined — still passes)
- **Blocking:** No — Phase 147 new tests all pass

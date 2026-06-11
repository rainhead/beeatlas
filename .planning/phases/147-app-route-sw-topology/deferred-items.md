# Phase 147 Deferred Items

## Resolved (were NOT pre-existing — caused by Phase 147)

### build-output.test.ts: "emits a species-index chunk distinct from index-*.js (Phase 96, IDX-02)"

- **Status:** RESOLVED (commit fixing the deploy gate). Originally mis-diagnosed below as pre-existing.
- **Real cause:** Phase 147's new `_pages/app/index.html` MPA entry changed Vite's chunk
  naming — the root `/` SPA entry was renamed `index-*.js` → `bee-atlas-*.js`, and the
  bare `_site/assets/index-*.js` the IDX-02 test looked for no longer exists (per-page
  entries are now `species/index-*.js`, `app/index-*.js`, root → `bee-atlas-*.js`).
  `main`'s deploys were green; only this branch was red — confirming Phase 147 caused it,
  not a prior phase. The original "pre-existing / prior phase" note was wrong.
- **Why it escaped earlier gates:** the plan-checker and verifier never ran a clean full
  build + the gating `npm test`; the executor saw the failure but waved it off as unrelated.
- **Fix:** IDX-02 now anchors on the entry chunks `_site/index.html` actually references
  (robust to the rename) and confirms they exist + the species chunk is split out.
- **Operational note:** the `/` entry-chunk rename is safe — `deploy.yml` syncs
  `_site/assets/` with `immutable` cache-control and no `--delete`, so old hashed assets
  are retained for already-cached `/index.html`.

### infra/test/beeatlas-stack.test.ts collected by root Vitest (CI deploy failure)

- **Status:** RESOLVED.
- **Cause:** the new CDK assertion test (a ts-node script importing `aws-cdk-lib` from
  `infra/node_modules`) was caught by the root Vitest default include glob; in CI
  `aws-cdk-lib` is not a root dependency, so it errored and failed `npm test` — which
  gates `deploy.yml`. Production site-content deploys had been failing on every branch push.
- **Fix:** added `**/infra/**` to `vite.config.ts` `test.exclude`. The CDK test still runs
  via `cd infra && npx ts-node test/beeatlas-stack.test.ts`.

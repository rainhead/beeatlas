---
status: complete
phase: quick-260608-tnc
plan: "01"
subsystem: frontend
key_files:
  created:
    - src/ready.ts
    - src/tests/ready.test.ts
  modified:
    - src/bee-atlas.ts
    - src/bee-map.ts
---

# Summary: ready.ts readiness primitives for map init (260608-tnc)

Step 1 of 3 toward systematically retiring map-init races (latest: the legacy-taxon
URL strand fixed in 5833b41). **Additive scaffolding only — no behavior change.**

## What shipped

- **`src/ready.ts`** — a `deferred<T>()` helper (`{ promise, resolve, reject }`) and
  named one-shot readiness promises: `tablesReady` (re-exported from `sqlite.ts`, import
  sites untouched), `taxaReady`, `mapReady`. Idempotent `markTaxaReady()` / `markMapReady()`
  resolvers (Promise resolve is a no-op after the first call).
- **`bee-atlas.ts`** resolves `taxaReady` immediately after `_taxonCache` is built in
  `_loadSummaryFromSQLite`.
- **`bee-map.ts`** resolves `mapReady` in the mapbox `'load'` handler.
- **`src/tests/ready.test.ts`** — 4 behavioral cases (deferred resolve/reject, exports,
  idempotent marks).

## Why it can't regress the legacy-taxon fix

Nothing `await`s `taxaReady`/`mapReady` yet — the barriers are defined and resolved but
unconsumed. Behavior is identical to before. Converting consumers to `await` them (and
deriving `intendedFilterActive` once instead of the per-site `_pendingLegacyTaxon` gating)
is the follow-up **small phase** (steps 2–3), after settling the sync-flag-vs-promise
design point (a promise gives ordering, but the synchronous render/URL gate still needs a
sync "filter intended but unresolved" boolean).

## Verification

- `tsc --noEmit` clean.
- `VITEST_SKIP_BUILD=1 npx vitest run` → 603 passed / 30 skipped (was 599; +4 new). No
  regressions. Frontend-only; does not touch the Python tier.

## Commit

- `90dfe12` feat(260608-tnc-01): add ready.ts readiness barriers for map init

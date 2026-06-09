---
phase: quick-260608-tnc
plan: "01"
type: execute
subsystem: frontend
status: complete
---

# Quick Task 260608-tnc: ready.ts readiness primitives for map init

Step 1 of 3 toward systematically addressing recurring map-init races (the
legacy-taxon URL strand fixed in 5833b41 was the latest). Purely **additive**
scaffolding — introduce named one-shot readiness barriers and resolve them where
each resource completes. **No consumer is converted to await them yet** (that's a
later phase), so this cannot change current behavior or regress the legacy-taxon fix.

## Tasks

1. **Create `src/ready.ts`** — a `deferred<T>()` helper plus named one-shot readiness
   promises. Re-export the existing `tablesReady` from `src/sqlite.ts` (do NOT move it
   — leave its import sites untouched). Add `taxaReady` (taxon cache populated) and
   `mapReady` (mapbox style loaded), each a `Promise<void>` with an idempotent
   `markTaxaReady()` / `markMapReady()` resolver.
2. **Resolve `taxaReady`** in `src/bee-atlas.ts` `_loadSummaryFromSQLite`, immediately
   after `this._taxonCache = new Map(...)` is assigned.
3. **Resolve `mapReady`** in `src/bee-map.ts`, in the mapbox `'load'` handler.
4. **`src/tests/ready.test.ts`** — behavioral: `deferred()` resolves; the module exports
   `tablesReady`/`taxaReady`/`mapReady` (promises) + `markTaxaReady`/`markMapReady`;
   the mark functions resolve their promises.

## must_haves

- truths:
  - "src/ready.ts exports tablesReady, taxaReady, mapReady (Promise<void>) and deferred()"
  - "bee-atlas resolves taxaReady after the taxon cache is built; bee-map resolves mapReady on map load"
  - "no consumer awaits taxaReady/mapReady yet — behavior unchanged"
- verify: "tsc --noEmit clean; VITEST_SKIP_BUILD=1 npx vitest run green"

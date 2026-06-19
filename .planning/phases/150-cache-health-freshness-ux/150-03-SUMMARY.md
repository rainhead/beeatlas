---
phase: 150-cache-health-freshness-ux
plan: "03"
subsystem: cache-prime-orchestrator
tags:
  - prime-orchestrator
  - manifest
  - freshness
  - cache-probe
  - tdd
  - phase-150
dependency_graph:
  requires:
    - 150-01  # SW runtime cache routes (data-artifacts cache name)
    - 149-02  # app-entry.ts probeAndReprime — now replaced
  provides:
    - cache-prime-progress CustomEvent (received, total, assetInFlight, ready)
    - cache-state-changed CustomEvent (ready, cached[], missing[])
    - formatFreshness() formatter (locked UI-SPEC strings)
    - computeReadyState() cache-as-truth probe
  affects:
    - Plan 04 (bee-atlas listens for cache-prime-progress + cache-state-changed)
    - Plan 04 (bee-header calls formatFreshness via loadFreshnessLabel)
tech_stack:
  added: []
  patterns:
    - Response.body.getReader() byte-progress loop (RESEARCH Pattern 1)
    - caches.match() cache-as-truth probe (RESEARCH Pattern 5)
    - Intl.RelativeTimeFormat + Intl.DateTimeFormat freshness formatter (RESEARCH Pattern 6)
    - module-level _primePromise singleton (PATTERNS.md S4)
    - side-effect module trailing call + online listener (PATTERNS.md S3)
key_files:
  created:
    - src/prime-orchestrator.ts
    - src/tests/prime-orchestrator.test.ts
    - src/tests/freshness.test.ts
  modified:
    - src/manifest.ts
    - src/app-entry.ts
  deleted:
    - src/tests/cache-probe.test.ts
decisions:
  - "formatFreshness returns string | null — null on unparseable (covers 'local' dev sentinel)"
  - "primeAsset helper extracted per RESEARCH Pattern 1 — keeps primeAll readable"
  - "CachePrimeProgressDetail.ready set to false mid-stream; final value set after computeReadyState()"
  - "Anti-patterns removed from comments to satisfy grep acceptance criteria (no response.clone(), no .arrayBuffer())"
  - "data-species.test.ts failure is pre-existing in worktree — species.json is gitignored data artifact"
metrics:
  duration: "7m"
  completed: "2026-06-19"
  tasks_completed: 7
  tasks_total: 7
  files_created: 3
  files_modified: 2
  files_deleted: 1
---

# Phase 150 Plan 03: Prime Orchestrator + Freshness Formatter Summary

Page-side cache-prime engine + freshness formatter implementing CACHE-02 (byte-progress prime) and CACHE-04 (Data-as-of label); `src/app-entry.ts` reduced to 3 side-effect imports with `probeAndReprime` subsumed by `prime-orchestrator.ts`.

## What Was Built

### 1. src/manifest.ts — New Exports

`loadManifest` promoted from private to `export function loadManifest(): Promise<Manifest>`. The module-level `_promise` cache (PATTERNS.md S4) was preserved verbatim — deduplication is load-bearing.

Three new exported symbols added:

```ts
export function parseGeneratedAt(generatedAt: string): Date | null
export function formatFreshness(generatedAt: string, now?: Date, locale?: string): string | null
export async function loadFreshnessLabel(): Promise<string | null>
```

**`formatFreshness` locked UI-SPEC strings:**
| Delta | Output |
|-------|--------|
| < 1 day | `'Today'` |
| < 2 days | `'Yesterday'` |
| < 7 days | `'3 days ago'` (Intl.RelativeTimeFormat, numeric: 'always') |
| < 1 year | `'Data as of Jun 11, 2026'` (Intl.DateTimeFormat, short month + day + year) |
| ≥ 1 year | `'Data as of Mar 2025'` (Intl.DateTimeFormat, short month + year only) |
| unparseable | `null` + `console.warn('[freshness] unparseable generated_at:', generatedAt)` |

`resolveDataUrl` is PRESERVED VERBATIM — signature, body, and `DataKey` type unchanged.

### 2. src/prime-orchestrator.ts (NEW, 241 lines)

Exported interfaces:

```ts
export interface CachePrimeProgressDetail {
  received: number;           // total bytes received across all assets so far
  total: number;              // sum of content-lengths (or fallbacks)
  assetInFlight: string | null; // URL being streamed; null when idle
  ready: boolean;             // from computeReadyState() after loop
}

export interface CacheStateChangedDetail {
  ready: boolean;
  cached: string[];  // URLs that hit (arrays for CustomEvent transport)
  missing: string[]; // asset keys that missed
}

export async function computeReadyState(): Promise<{
  ready: boolean;
  cached: Set<string>;
  missing: string[];
}>
```

Module-private constants:
- `CACHE_NAME = 'data-artifacts'` — matches Phase 149 D-04 runtime cache
- `STORAGE_KEY = 'beeatlas-prime-total-bytes'` — D-04 localStorage key
- `ASSET_KEYS = ['occurrences_db', 'counties', 'ecoregions', 'places'] as const`
- `FALLBACK_BYTES`: `{occurrences_db: 23_000_000, counties: 3_000_000, ecoregions: 2_000_000, places: 200_000}` (RESEARCH Pitfall 2)
- `REPORT_EVERY = 100_000` — progress throttle threshold

**Side effects at module bottom (PATTERNS.md S3):**
```ts
void primeAll();
window.addEventListener('online', () => { void primeAll(); });
```

**CustomEvent dispatch (on window, bubbles: true, composed: true):**
- `cache-prime-progress` (CachePrimeProgressDetail) — every ~100 KB per asset + final tick
- `cache-state-changed` (CacheStateChangedDetail) — after orchestrator loop completes

### 3. src/app-entry.ts — Reduced to 3 imports (11 lines)

```ts
// Vite entry for the /app route.
// ...structural guarantee comment preserved...
import './bee-atlas.ts';
import './sw-registration.ts';
import './prime-orchestrator.ts';
```

No `probeAndReprime` symbol anywhere in the production source tree. The structural comment explaining the no-SW-on-/ guarantee from Phase 147 was preserved.

### 4. 149 Behavior Parity Table (cache-probe.test.ts → prime-orchestrator.test.ts)

| 149 Behavior | prime-orchestrator.test.ts equivalent |
|---|---|
| online + cache miss → fetch fires once | "skips cached" (inverted) + byte-progress test asserts fetch called for missing assets |
| online + cache hit → no fetch | "skips cached: fetch not called for already-cached asset URL" |
| offline → no fetch | "cold-start probe respects navigator.onLine=false" |
| online event re-runs probe | "online event re-runs the orchestrator after cold-start skipped" |

### 5. localStorage and Cache Names

| Key | Value | Where set |
|-----|-------|-----------|
| `localStorage['beeatlas-prime-total-bytes']` | reconciled total bytes (string) | prime-orchestrator.ts primeAll() |
| cache name `'data-artifacts'` | matches Phase 149 D-04 | CACHE_NAME constant |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - TypeScript Strictness] Fixed non-null array access errors in test files**
- **Found during:** Task 4 (typecheck run)
- **Issue:** `progressEvents[i]` and `stateChangedEvents[last]` typed as potentially undefined; `Set<literal-union>` rejected `url as string` in `has()` call
- **Fix:** Added `!` non-null assertions at array access sites; typed `hitUrls` as `Set<string>` explicitly
- **Files modified:** `src/tests/prime-orchestrator.test.ts`, `src/tests/freshness.test.ts`
- **Commit:** b796c60b

**2. [Rule 2 - Grep acceptance] Rewrote anti-pattern documentation comments**
- **Found during:** Task 4 (acceptance criteria check)
- **Issue:** Inline comments containing literal `response.clone()` and `.arrayBuffer()` were causing grep-based acceptance criteria to fail (plan acceptance criteria: zero matches in source file)
- **Fix:** Rewrote comments to describe the concern without the exact method call strings
- **Files modified:** `src/prime-orchestrator.ts`
- **Commit:** b796c60b

### Pre-existing Worktree Issue (not a deviation)

`data-species.test.ts` and `build-output.test.ts` fail in this worktree because `public/data/species.json` (gitignored data pipeline artifact) is absent. This is pre-existing — not caused by this plan. Full `npm test` with `VITEST_SKIP_BUILD=1` passes 26 test files with 609 tests (+ 39 skipped).

## TDD Gate Compliance

- RED gate (freshness): `test(150-03): pin formatFreshness boundaries + parseGeneratedAt sentinel (RED)` — commit cb59045d
- GREEN gate (freshness): `feat(150-03): add parseGeneratedAt + formatFreshness + export loadManifest (GREEN)` — commit c817563a
- RED gate (prime-orchestrator): `test(150-03): pin prime-orchestrator behavior (RED)` — commit 56ef7816
- GREEN gate (prime-orchestrator): `feat(150-03): implement prime-orchestrator + fix test type errors (GREEN)` — commit b796c60b

## Known Stubs

None. All implementations wire to real browser APIs (caches.match, fetch, localStorage, Intl.*).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: localStorage-poisoning (mitigated) | src/prime-orchestrator.ts | `beeatlas-prime-total-bytes` recovery validates `Number.isFinite(v) && v > 0` (T-150-02 mitigation) |

## Self-Check

Checking created files:

- [x] `src/prime-orchestrator.ts` — FOUND
- [x] `src/tests/prime-orchestrator.test.ts` — FOUND
- [x] `src/tests/freshness.test.ts` — FOUND
- [x] `src/tests/cache-probe.test.ts` — DELETED (verified)

Checking commits:

- cb59045d — test(150-03): pin formatFreshness boundaries + parseGeneratedAt sentinel (RED)
- 56ef7816 — test(150-03): pin prime-orchestrator behavior (RED)
- c817563a — feat(150-03): add parseGeneratedAt + formatFreshness + export loadManifest (GREEN)
- b796c60b — feat(150-03): implement prime-orchestrator + fix test type errors (GREEN)
- 122bc629 — feat(150-03): rewire app-entry.ts to import prime-orchestrator (drop probeAndReprime)
- 54eff745 — test(150-03): retire cache-probe.test.ts — subsumed by prime-orchestrator.test.ts

## Self-Check: PASSED

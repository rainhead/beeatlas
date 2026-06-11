---
phase: 147-app-route-sw-topology
plan: "02"
subsystem: infra
tags: [cloudfront, cdk, service-worker, cache-control, aws-cdk-lib/assertions]

# Dependency graph
requires:
  - phase: 147-app-route-sw-topology/147-01
    provides: /app SPA route, service worker at /app/sw.js (topology established)
provides:
  - Two per-path CloudFront behaviors (/app/sw.js, /app/manifest.webmanifest) with zero-TTL CachePolicy + no-cache ResponseHeadersPolicy
  - CDK template-assertion test (infra/test/beeatlas-stack.test.ts) gating behavior regression
  - infra/package.json test script wired to ts-node assertion
affects: [147-03, 148-app-shell, 151-installability]

# Tech tracking
tech-stack:
  added: [aws-cdk-lib/assertions (Template, Match) — already installed, no new dep]
  patterns:
    - Per-path CloudFront addBehavior with shared zero-TTL CachePolicy + ResponseHeadersPolicy (mirrors /data/* pattern)
    - ts-node + node:assert/strict CDK template-assertion test pattern for infra regression gating

key-files:
  created:
    - infra/test/beeatlas-stack.test.ts
  modified:
    - infra/lib/beeatlas-stack.ts
    - infra/package.json

key-decisions:
  - "Per-path behaviors (/app/sw.js + /app/manifest.webmanifest) — NOT /app/* wildcard — to avoid no-caching app-shell and hashed assets Phase 148 will precache"
  - "Manifest behavior added in Phase 147 even though file lands in Phase 151 (D-08: harmless before file exists, avoids revisiting beeatlas-stack.ts)"
  - "Live deploy + curl -I deferred to next normal deploy (DEFER path); synth-time guarantee provided by CDK assertion test"

patterns-established:
  - "CDK assertion test pattern: ts-node script with node:assert/strict + Template.fromStack for CloudFront behavior regression gating (infra/test/)"
  - "Shared CachePolicy/ResponseHeadersPolicy for no-cache CDN behaviors: zero TTL + customHeadersBehavior override=true"

requirements-completed: [ROUTE-03]

# Metrics
duration: deferred (Tasks 1-3 approx 30min; Task 4 DEFER path)
completed: "2026-06-10"
---

# Phase 147 Plan 02: CloudFront No-Cache Behaviors Summary

**Two per-path CloudFront behaviors (`/app/sw.js`, `/app/manifest.webmanifest`) with shared zero-TTL `CachePolicy` + `no-cache, no-store, must-revalidate` `ResponseHeadersPolicy`, gated by a new `aws-cdk-lib/assertions` template-assertion test**

## Performance

- **Duration:** ~30 min (Tasks 1-3); Task 4 DEFER path (post-deploy UAT pending)
- **Started:** 2026-06-10
- **Completed:** 2026-06-10
- **Tasks:** 3 of 4 executed (Task 4: `checkpoint:human-action` DEFERRED)
- **Files modified:** 3

## Accomplishments

- Added two per-path CloudFront `addBehavior` calls in `infra/lib/beeatlas-stack.ts`: `/app/sw.js` and `/app/manifest.webmanifest`, each backed by a shared zero-TTL `CachePolicy` and a shared `ResponseHeadersPolicy` emitting `Cache-Control: no-cache, no-store, must-revalidate` (mirrors the existing `/data/*` construct pattern)
- Created `infra/test/beeatlas-stack.test.ts`: a `ts-node` + `node:assert/strict` + `aws-cdk-lib/assertions` (`Template`, `Match`) test that asserts both path-pattern behaviors, the zero-TTL cache policy, and the `Cache-Control` custom header all exist in the synthesized CloudFormation template — exits 0 with "All CDK assertions passed."
- Wired `"test": "ts-node test/beeatlas-stack.test.ts"` into `infra/package.json`; `npm run build` + `cdk synth` both pass clean

## Task Commits

1. **Task 1: CDK template-assertion test + test script (RED)** - `d49959e` (test)
2. **Task 2: Add no-cache CloudFront behaviors** - `a79261a` (feat)
3. **Task 3: Confirm stack build + synth pass** - `e563ae8` (chore)
4. **Task 4: Post-deploy curl -I** - DEFERRED (checkpoint:human-action, recorded in 147-HUMAN-UAT.md)

## Files Created/Modified

- `infra/test/beeatlas-stack.test.ts` — CDK template-assertion test (ROUTE-03 regression gate); asserts `/app/sw.js`, `/app/manifest.webmanifest`, `Cache-Control: no-cache`, and zero-TTL policy
- `infra/lib/beeatlas-stack.ts` — Added `SwNoCachePolicy` (zero-TTL CachePolicy), `SwNoCacheHeadersPolicy` (ResponseHeadersPolicy with `no-cache, no-store, must-revalidate`), and two `distribution.addBehavior()` calls
- `infra/package.json` — Added `"test"` script: `ts-node test/beeatlas-stack.test.ts`

## Decisions Made

- **Per-path behaviors only** (`/app/sw.js`, `/app/manifest.webmanifest`) — never `/app/*` wildcard — to preserve cacheability of app-shell and hashed assets that Phase 148 will precache (RESEARCH Pitfall 3 / D-08 per-path requirement)
- **Manifest behavior added now** even though the manifest file lands in Phase 151 — the CloudFront path-pattern behavior is harmless before the file exists (D-08 avoids a second `beeatlas-stack.ts` edit in 151)
- **DEFER path for Task 4** — live deploy + `curl -I` deferred to next normal deploy at developer's discretion; the CDK assertion test provides the synth-time structural guarantee without requiring a deploy

## Deviations from Plan

None - plan executed exactly as written. Task 4 was a `checkpoint:human-action` with a documented "defer" resume signal; the DEFER path is the intended execution path when a deploy is not warranted at this moment.

## Checkpoint Status: DEFERRED (human-action)

**Task 4** (`checkpoint:human-action`) was taken via the **DEFER** resume signal. The post-deploy `curl -I` verification (D-10 live confirmation) has been recorded as a PENDING item in `.planning/phases/147-app-route-sw-topology/147-HUMAN-UAT.md`:

> **ROUTE-03 — CloudFront no-cache (post-deploy, D-10)** — Status: PENDING, run at next deploy.

The synth-time guarantee (D-10 structural assertion) is fully enforced by the CDK assertion test (`infra/test/beeatlas-stack.test.ts`). The only outstanding item is the live `curl -I https://<distribution-domain>/app/sw.js` confirmation after the next normal deploy.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required beyond the deferred deploy UAT.

## Next Phase Readiness

- ROUTE-03 complete at the infra/synth level; live distribution confirms at next deploy (HUMAN-UAT pending)
- `infra/test/beeatlas-stack.test.ts` establishes the CDK assertion test pattern for Phase 148+ infra changes
- Phase 148 (app-shell caching) can proceed — the per-path no-cache behaviors do not affect `/app/*` wildcard cacheability

---
*Phase: 147-app-route-sw-topology*
*Completed: 2026-06-10*

## Self-Check: PASSED

- `infra/test/beeatlas-stack.test.ts` — exists (created in task 1 commit `d49959e`)
- `infra/lib/beeatlas-stack.ts` — modified (task 2 commit `a79261a`)
- `infra/package.json` — modified (task 1 commit `d49959e`)
- Commits `d49959e`, `a79261a`, `e563ae8` all present in git log
- One deferred manual UAT item recorded in 147-HUMAN-UAT.md (PENDING — post-deploy curl -I); this does not block plan completion per the DEFER path

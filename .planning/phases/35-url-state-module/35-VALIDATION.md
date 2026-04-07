---
phase: 35
slug: url-state-module
status: complete
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-07
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `frontend/vite.config.ts` (test block) |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~540ms |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | URL-01 | — | N/A — pure refactor, no trust boundary | unit | `cd frontend && npm test -- --run url-state` | ✅ | ✅ green |
| 35-01-02 | 01 | 1 | URL-01 (arch) | — | N/A — import graph isolation | source-analysis | `cd frontend && npm test -- --run bee-atlas` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 needed — vitest + happy-dom installed in Phase 33; url-state.test.ts created in Phase 38 (but tests Phase 35 output); bee-atlas.test.ts import-graph tests added in Phase 36.

---

## Test Coverage Details

### URL-01 — Behavioral (url-state.test.ts, 20 tests)

**Round-trip coverage (12 tests):**
- `view: lon/lat/zoom round-trips within toFixed precision`
- `taxon+rank: genus round-trips`
- `yearFrom: round-trips as yr0`
- `yearTo: round-trips as yr1`
- `months: round-trips sorted`
- `occurrenceIds: round-trips comma-separated`
- `layerMode=samples: serialized as lm=samples`
- `layerMode=specimens (default): lm param is absent`
- `boundaryMode=counties: serialized as bm=counties`
- `boundaryMode=off (default): bm param is absent`
- `selectedCounties: round-trips as counties param`
- `selectedEcoregions: round-trips as ecor param`
- `all fields set simultaneously preserve all values`

**Validation coverage (7 tests):**
- `invalid lon (x=999): result.view is undefined`
- `invalid lat (y=999): result.view is undefined`
- `invalid zoom (z=50): result.view is undefined`
- `taxon without taxonRank: result.filter is undefined`
- `out-of-range months (0 and 13): only valid month 7 survives`
- `empty view params: result.view is undefined`
- `taxonRank without taxon: taxonName absent from filter`

### URL-01 — Architectural invariant (bee-atlas.test.ts)

- `bee-map.ts does not import from url-state` — confirms the Phase 36 ownership transfer: url-state.ts is consumed only by bee-atlas.ts, not bee-map.ts

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] Sampling continuity: 2 tasks, both covered
- [x] No Wave 0 needed (infrastructure pre-exists)
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-07

---
phase: 95
slug: subgenus-tribe-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 95 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via vite.config.ts `test` block) |
| **Config file** | `vite.config.ts` |
| **Quick run command** | `VITEST_SKIP_BUILD=1 npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30s (quick) / ~120s (full with build) |

---

## Sampling Rate

- **After every task commit:** Run `VITEST_SKIP_BUILD=1 npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds (unit) / ~120 seconds (full)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| SUBG-01 | 01 | 1 | SUBG-01 | — | N/A | unit | `npm test -- data-species` | ✅ extend | ⬜ pending |
| SUBG-02 | 01 | 1 | SUBG-02 | — | N/A | build | `npm test -- build-output` | ✅ extend | ⬜ pending |
| SUBG-03 | 01 | 1 | SUBG-03 | — | N/A | build | `npm test -- build-output` | ✅ extend | ⬜ pending |
| TRIBE-01 | 02 | 1 | TRIBE-01 | — | N/A | unit | `npm test -- data-species` | ✅ extend | ⬜ pending |
| TRIBE-02 | 02 | 1 | TRIBE-02 | — | N/A | build | `npm test -- build-output` | ✅ extend | ⬜ pending |
| TRIBE-03 | 02 | 1 | TRIBE-03 | — | N/A | build | `npm test -- build-output` | ✅ extend | ⬜ pending |
| URL-03 | 01 | 1 | URL-03 | — | N/A | build | `npm test -- build-output` | ✅ extend | ⬜ pending |
| URL-04 | 02 | 1 | URL-04 | — | N/A | build | `npm test -- build-output` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Both test files already exist and only need extension:
- `src/tests/data-species.test.ts` — add `subgenusList` and `tribeList` unit tests
- `src/tests/build-output.test.ts` — add URL-03, URL-04, subgenus/tribe page output tests

*No new test infrastructure required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Subgenus SVG map visible in browser at `/species/Andrena/Melandrena/` | SUBG-02 | Visual check | Run `npm run dev`, navigate to `/species/Andrena/Melandrena/`, verify multi-color SVG map renders |
| Tribe SVG map visible in browser at `/species/tribe/Andrenini/` | TRIBE-02 | Visual check | Navigate to `/species/tribe/Andrenini/`, verify multi-color SVG map renders |
| Species swatch colors match SVG county fill colors | SUBG-01 | Color parity | Compare species list swatch hex values against SVG fill colors for the same species |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

---
phase: 15
slug: click-interaction-and-inat-links
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (no vitest/jest in package.json — TypeScript compilation is the gate) |
| **Config file** | `frontend/tsconfig.json` |
| **Quick run command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| **Full suite command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **After every plan wave:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Before `/gsd:verify-work`:** Build must be green + manual browser verification
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | LINK-05 | build | `npm run build` | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | LINK-05 | build | `npm run build` | ✅ | ⬜ pending |
| 15-01-03 | 01 | 1 | LINK-05 | build + manual | `npm run build` | ✅ | ⬜ pending |
| 15-02-01 | 02 | 1 | MAP-05 | build | `npm run build` | ✅ | ⬜ pending |
| 15-02-02 | 02 | 1 | MAP-05 | build + manual | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No test framework installation needed — TypeScript + Vite build is the automated gate.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clicking a sample dot opens sidebar with observer, date, specimen count, iNat link | MAP-05 | No browser test framework | Load app, switch to samples mode, click a dot, verify sidebar shows observer/date/count/link |
| iNat link in sample sidebar opens correct URL in new tab | MAP-05 | Requires browser click action | Click iNat link, verify new tab opens to `https://www.inaturalist.org/observations/{id}` |
| Specimen sidebar shows iNat link when match exists in links.parquet | LINK-05 | No browser test framework | Click specimen cluster, verify iNat link appears next to ecdysis.org link for matched specimens |
| Specimen sidebar shows `iNat: —` (no broken link) when no match | LINK-05 | Requires negative case with real data | Find specimen with no links.parquet match, verify greyed `iNat: —` placeholder, no broken link |
| Back/close button in sample dot detail returns to recent events list | MAP-05 | Requires interaction testing | Click sample dot, then click back, verify returns to recent events list |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

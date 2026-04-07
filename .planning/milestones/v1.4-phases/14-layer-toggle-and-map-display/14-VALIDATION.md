---
phase: 14
slug: layer-toggle-and-map-display
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no jest/vitest configured for frontend TypeScript |
| **Config file** | none |
| **Quick run command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| **Full suite command** | `cd /Users/rainhead/dev/beeatlas/frontend && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **After every plan wave:** Run `cd /Users/rainhead/dev/beeatlas/frontend && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | MAP-03 | compile | `cd frontend && npm run build` | ❌ manual verify | ⬜ pending |
| 14-01-02 | 01 | 1 | MAP-04 | compile | `cd frontend && npm run build` | ❌ manual verify | ⬜ pending |
| 14-02-01 | 02 | 1 | MAP-04 | compile | `cd frontend && npm run build` | ❌ manual verify | ⬜ pending |
| 14-02-02 | 02 | 1 | MAP-04 | compile | `cd frontend && npm run build` | ❌ manual verify | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No test stubs needed — TypeScript compilation is the automated gate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sample dots appear on map in sample mode | MAP-03 | No browser test runner | Switch to Samples, verify teal/blue/slate dots appear at correct coordinates |
| Toggle hides specimen clusters, shows sample dots | MAP-04 | No browser test runner | Toggle back and forth; verify only one layer visible at a time |
| Sidebar clears on layer switch | MAP-04 | No browser test runner | Select a specimen, switch to Samples; verify sidebar clears |
| `lm=` URL param restores layer mode | MAP-04 | No browser test runner | Copy URL in sample mode, paste in new tab; verify sample layer active |
| Filter controls hidden in sample mode | MAP-04 | No browser test runner | Switch to Samples; verify taxon/year/month controls not visible |
| Recent events list shows last 2 weeks | MAP-04 | No browser test runner | Switch to Samples; verify sidebar shows recent events with correct dates |
| Clicking recent event pans/zooms to dot | MAP-04 | No browser test runner | Click a recent event in the list; verify map centers on that dot |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

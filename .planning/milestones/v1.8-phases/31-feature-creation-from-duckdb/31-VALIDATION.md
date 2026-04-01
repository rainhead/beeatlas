---
phase: 31
slug: feature-creation-from-duckdb
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test config files or test directories found |
| **Config file** | None |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run build && ! grep hyparquet frontend/package.json` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build`
- **After every plan wave:** Run `npm run build && ! grep hyparquet frontend/package.json`
- **Before `/gsd:verify-work`:** Full suite must be green + browser smoke test
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | FEAT-01, FEAT-02 | compile | `npm run build` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | FEAT-03 | automated | `npm run build && ! grep hyparquet frontend/package.json` | N/A | ⬜ pending |
| 31-01-03 | 01 | 2 | FEAT-01 | smoke (browser) | `npm run build` (compile gate) | N/A — manual | ⬜ pending |
| 31-01-04 | 01 | 2 | FEAT-02 | smoke (browser) | `npm run build` (compile gate) | N/A — manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No automated test framework exists. Validation relies on:
1. TypeScript compile gate (`npm run build`)
2. Human browser smoke test after implementation

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Ecdysis specimen features appear on map with correct clustering | FEAT-01 | No browser automation — OL rendering requires visual inspection | Load app, verify specimen clusters appear, zoom in/out |
| iNat sample features appear with correct dot rendering and click | FEAT-02 | No browser automation — dot rendering requires visual inspection | Load app, verify sample dots appear, click to confirm sidebar |
| Sidebar click on specimen/sample shows correct details | FEAT-01, FEAT-02 | UI interaction — species, collector, date, iNat link must be verified | Click feature, inspect sidebar panel for correct data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

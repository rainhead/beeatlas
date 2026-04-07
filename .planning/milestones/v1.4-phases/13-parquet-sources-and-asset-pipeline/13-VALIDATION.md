---
phase: 13
slug: parquet-sources-and-asset-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no jest/vitest configured for frontend TypeScript |
| **Config file** | none |
| **Quick run command** | `cd frontend && npm run build` |
| **Full suite command** | `cd frontend && npm run build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run build`
- **After every plan wave:** Run `cd frontend && npm run build`
- **Before `/gsd:verify-work`:** Build green + browser console verification per success criteria
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | LINK-05 (prereq) | compile | `cd frontend && npm run build` | ❌ manual after | ⬜ pending |
| 13-01-02 | 01 | 1 | MAP-03 (partial) | compile | `cd frontend && npm run build` | ❌ manual after | ⬜ pending |
| 13-01-03 | 01 | 1 | MAP-03 (partial) | compile | `cd frontend && npm run build` | ❌ manual after | ⬜ pending |
| 13-02-01 | 02 | 2 | N/A | shell | `test -f frontend/src/assets/links.parquet` | ❌ requires pipeline | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test files needed — TypeScript compilation is the automated gate. No jest/vitest setup exists for the frontend.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `SampleParquetSource` loads rows from `samples.parquet` without error | MAP-03 (partial) | No frontend test runner | Open browser console on live app; verify no errors and feature count logged |
| Specimen OL features carry `occurrenceID` property (UUID string) | LINK-05 (prereq) | No frontend test runner | Open browser console; inspect a feature via `specimenSource.getFeatures()[0].get('occurrenceID')` — should return a UUID string |
| `links.parquet` present in `frontend/src/assets/` after `build-data.sh` | N/A | Requires pipeline run with S3 cache | Run `test -f frontend/src/assets/links.parquet` after a full `npm run build:data` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

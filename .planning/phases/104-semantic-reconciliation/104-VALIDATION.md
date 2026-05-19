---
phase: 104
slug: semantic-reconciliation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-18
---

# Phase 104 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (Python), vitest (TypeScript) |
| **Config file** | `data/pyproject.toml` (pytest), `vitest.config.ts` |
| **Quick run command** | `cd data && uv run pytest data/tests/test_places_export.py -x` |
| **Full suite command** | `cd data && uv run pytest && npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** `cd data && uv run pytest data/tests/test_places_export.py -x`
- **After every plan wave:** `cd data && uv run pytest && npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 104-01-01 | 01 | 1 | SEM-01 | — | N/A | unit (pytest, RED) | `cd data && uv run pytest data/tests/test_places_export.py -x` | ✅ exists | ⬜ pending |
| 104-01-02 | 01 | 1 | SEM-01 | — | N/A | unit (pytest+vitest, GREEN) | `cd data && uv run pytest data/tests/test_places_export.py -x && npm test` | ✅ exists | ⬜ pending |
| 104-01-03 | 01 | 1 | SEM-01 | — | N/A | dbt build + grep | `bash data/dbt/run.sh build` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 installs needed.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

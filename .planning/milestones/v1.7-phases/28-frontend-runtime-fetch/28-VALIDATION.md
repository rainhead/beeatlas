---
phase: 28
slug: frontend-runtime-fetch
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser + build verification |
| **Config file** | `frontend/package.json` (scripts: build, dev) |
| **Quick run command** | `cd frontend && npm run build 2>&1 \| grep -E "error\|warning\|dist/"` |
| **Full suite command** | `cd frontend && npm run build && ls -la dist/ \| grep -E "\.parquet\|\.geojson"` |
| **Estimated runtime** | ~15 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm run build 2>&1 | grep -c error` — should be 0
- **After every plan wave:** Run full build + dist content check
- **Before `/gsd:verify-work`:** Full build must be green; dist must have no .parquet/.geojson files
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | FETCH-02 | build | `cd infra && npm run build 2>&1 \| grep -c error` | ✅ | ⬜ pending |
| 28-01-02 | 01 | 1 | FETCH-01 | build | `cd frontend && npm run build && ! ls dist/*.parquet dist/*.geojson 2>/dev/null` | ✅ | ⬜ pending |
| 28-01-03 | 01 | 1 | FETCH-03 | build | `cd frontend && npm run build 2>&1 \| grep -c error` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no new test files needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Loading indicator visible during fetch | FETCH-03 | Requires browser | Open DevTools Network tab, throttle to Slow 3G, reload live site |
| CORS headers on /data/* requests | FETCH-02 | Requires deployed CDK + live browser | `fetch('https://beeatlas.net/data/ecdysis.parquet')` from localhost:5173 DevTools console |
| Map renders correctly after fetch | FETCH-01 | Requires browser + live data | Load beeatlas.net, verify map populates |
| Error message on fetch failure | FETCH-01 | Requires browser + simulated failure | DevTools → block `beeatlas.net/data/*` requests, reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

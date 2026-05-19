---
phase: 105
slug: url-state-migration
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-19
---

# Phase 105 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 |
| **Config file** | vite.config.ts (`test:` block) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 105-01-01 | 01 | 1 | URL-01 | — | pane= values enum-validated; no arbitrary string injection | unit | `npm test` | ✅ (url-state.test.ts + bee-atlas.test.ts) | ⬜ pending |
| 105-01-02 | 01 | 1 | URL-02 | — | legacy view=table alias parsed; new view= not written | unit | `npm test` | ✅ (url-state.test.ts) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

`src/tests/url-state.test.ts` already exists and follows the exact pattern for new pane-state tests. No new test infrastructure required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `?pane=table` restores table pane on page load | URL-01 | Browser E2E needed to verify Lit firstUpdated restore path | Open app with `?pane=table`, confirm table pane is active |
| `?pane=list` restores list pane on page load | URL-01 | Browser E2E needed to verify pane=list maps to map mode correctly | Open app with `?pane=list`, confirm filter panel visible (map mode) |
| `?view=table` backward compat on real page load | URL-02 | Browser E2E needed to confirm legacy URL still works | Open app with `?view=table`, confirm table pane is active |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

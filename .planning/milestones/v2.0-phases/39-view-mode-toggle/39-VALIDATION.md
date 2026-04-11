---
phase: 39
slug: view-mode-toggle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-07
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 (happy-dom environment) |
| **Config file** | `frontend/vite.config.ts` (test section) |
| **Quick run command** | `cd frontend && npm test -- --run` |
| **Full suite command** | `cd frontend && npm test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && npm test -- --run`
- **After every plan wave:** Run `cd frontend && npm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | VIEW-03 | — | `view` param only accepts `'table'`; all other values default to `'map'` | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | VIEW-03 | — | `viewMode='map'` omits `view` param from URL | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | VIEW-01 | — | `view-changed` event emitted when inactive button clicked | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 39-02-02 | 02 | 2 | VIEW-01 | — | No-op when active button clicked again | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |
| 39-03-01 | 03 | 3 | VIEW-02 | — | `bee-atlas` render: `<bee-map>` absent when `_viewMode='table'` | unit | `cd frontend && npm test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

The existing test files use source-inspection patterns (`readFileSync` + string matching) — the established pattern in this project.

- [ ] `frontend/src/tests/url-state.test.ts` — extend with `viewMode` round-trip cases (VIEW-03). Add to existing `buildParams -> parseParams round-trip` and `validation and rejection` describe blocks.
- [ ] `frontend/src/tests/bee-sidebar.test.ts` — source inspection: `bee-sidebar.ts` contains `view-changed` string; contains `viewMode` property declaration (VIEW-01).
- [ ] `frontend/src/tests/bee-atlas.test.ts` — source inspection: `bee-atlas.ts` contains `table-slot` string; contains `_viewMode` field (VIEW-02).

No new test files needed — extend existing files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Toggle visually highlights active button | VIEW-01 | CSS visual state — happy-dom cannot render CSS | Open `http://localhost:5173`, click Map/Table toggle, verify active button has accent underline |
| Table area occupies full content space in table view | VIEW-02 | Layout/sizing — happy-dom cannot verify | In table view, verify `.table-slot` fills the map area with no sidebar overlap |
| URL updates to `?view=table` after toggling | VIEW-03 | Browser history API interaction | Click Table toggle; check browser address bar contains `view=table` |
| Copy URL, paste in new tab, restores table view | VIEW-03 | Browser navigation | Copy URL with `view=table`, open new tab, verify table view opens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

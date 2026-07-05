---
phase: 180
slug: moderation-loop
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 180 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from `180-RESEARCH.md` §Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (shared `data/` venv; `testpaths` includes `../api/tests`) + vitest (`src/`) |
| **Config file** | `data/pyproject.toml` (Python); `package.json` (vitest) |
| **Quick run command** | backend: `cd data && uv run pytest ../api/tests/test_notes_routes.py -x` · frontend: `npm test -- bee-notes auth-client` |
| **Full suite command** | `npm test` **and** `cd data && uv run pytest -m "not integration"` |
| **Estimated runtime** | ~60–90 seconds (both suites) |

**CRITICAL:** No `api/pyproject.toml` exists. Never invoke `cd api && uv run pytest`.
All Python API tests run through the `data/` venv, e.g.
`cd data && uv run pytest ../api/tests/test_notes_routes.py -x` (carried from 179-VALIDATION.md).

---

## Sampling Rate

- **After every task commit:** the quick command for the language(s) that task touched.
- **After every plan wave:** `npm test` (src/) **and** `cd data && uv run pytest -m "not integration"` (data/ + api/) — run BOTH suites, never just one (memory `feedback_run_tests_before_push`).
- **Before `/gsd-verify-work`:** full suite green, PLUS the MOD-04 human UAT walkthrough (submit → publish → takedown end-to-end). Roadmap: do NOT auto-advance past UAT.
- **Max feedback latency:** ~90 seconds.

---

## Per-Task Verification Map

Filled from `180-RESEARCH.md` §"Phase Requirements → Test Map". The planner refines Task IDs.

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| MOD-01 | Roles sourced from declared allowlist (verification only) | unit | `cd data && uv run pytest tests/test_notes_seed_roles.py -x` | ✅ existing | ⬜ pending |
| MOD-02 | Curator takedown: non-curator author → 403; curator → 200, status='hidden' | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k takedown -x` | ❌ W0 | ⬜ pending |
| MOD-02 | Curator restore: sets status back to 'approved' | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k restore -x` | ❌ W0 | ⬜ pending |
| MOD-02 | Load-before-ownership: missing note id → 404 before any 403 (IDOR) | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown_missing_is_404 or restore_missing_is_404" -x` | ❌ W0 | ⬜ pending |
| MOD-02 | Demoted curator (allowlist edited between mint and request) loses power immediately | unit | `cd data && uv run pytest ../api/tests/test_authz.py -k curator -x` | ❌ W0 | ⬜ pending |
| MOD-02 | Cross-origin POST to takedown/restore rejected | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown_foreign_origin or restore_foreign_origin" -x` | ❌ W0 | ⬜ pending |
| MOD-02/04 | Hidden note excluded from `GET /api/notes` read | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k hidden -x` | ❌ W0 | ⬜ pending |
| MOD-04 | Hidden note excluded from `notes_harvest.export_notes()` | unit | `cd data && uv run pytest tests/test_notes_harvest.py -k hidden -x` | ❌ W0 (extend) | ⬜ pending |
| MOD-03 | `<script>`/`onerror=` payload renders inert (verification) | unit | `cd data && uv run pytest tests/test_notes_render.py -x` | ✅ existing | ⬜ pending |
| MOD-03 | Every note carries the 4 audit fields (verification) | unit | `cd data && uv run pytest tests/test_notes_store_schema.py -x` | ✅ existing (extend for `reason`) | ⬜ pending |
| MOD-02/03 (ledger) | Takedown/restore append `note_revisions` rows with correct `action`/`editor_id`/`reason` | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown_appends_ledger or restore_appends_ledger" -x` | ❌ W0 | ⬜ pending |
| — (migration) | Migration 0004 adds nullable `reason`; forward-only; `downgrade()` raises | unit | `cd data && uv run pytest tests/test_notes_migrations.py -k 0004 -x` | ❌ W0 | ⬜ pending |
| — (client) | `isCurator` derived from `role === 'curator'` in `fetchWhoami()` | unit | `npm test -- auth-client` | ❌ W0 (extend) | ⬜ pending |
| — (UI) | `<bee-notes>` shows "Take down" only for curators; note gone after click | unit | `npm test -- bee-notes` | ❌ W0 (extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `api/tests/test_notes_routes.py` — new takedown tests (curator success 200/status='hidden', non-curator author 403, missing-note 404, cross-origin 403, launch-gate 503, ledger-append) mirroring the existing `edit_note`/`delete_note` blocks but keyed on curator role.
- [ ] `api/tests/test_notes_routes.py` — new restore tests (curator success sets status='approved', ledger `action='restore'`) + hidden-note-excluded-from-read.
- [ ] `api/tests/test_authz.py` — `_is_curator_fresh` revocation test mirroring `test_allowlist_recheck_reflects_disk_change_not_cookie_role`, plus "author-only login is NOT a curator".
- [ ] `data/tests/test_notes_harvest.py` — add a `hidden`-status fixture row; assert excluded (mirrors existing `pending`/`removed` exclusion).
- [ ] `data/tests/test_notes_migrations.py` — assert migration 0004 adds nullable `note_revisions.reason` and `downgrade()` raises `NotImplementedError`.
- [ ] `src/tests/auth-client.test.ts` — `isCurator` derivation.
- [ ] `src/tests/bee-notes.test.ts` — curator sees "Take down" on ANY note; non-curator author does not; click → POST + refetch removes note.
- [ ] No new framework/config installs — pytest and vitest are both already wired.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end submit → publish → takedown clears public site | MOD-04 | Spans live island + nightly harvest/bake + static deploy; a human confirms the note is gone from the live island immediately and absent from the next baked `notes.json`. | Author submits a note on a species page → confirm it renders on the live island → curator clicks "Take down" → confirm it vanishes from the live island immediately → run/observe the next harvest and confirm the note is absent from `notes.json`. Roadmap: blocking human UAT gate; do NOT auto-advance past it. |
| Operator restore via curl (no UI) | MOD-02 (D-07) | Restore is deliberately UI-less; only reachable via authenticated curl. | Curator hits `POST /api/notes/{id}/restore` with a valid session → note returns to `status='approved'` and reappears after next harvest. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter
- [ ] `wave_0_complete: true` — set during execution once Wave 0 RED tests exist

**Approval:** approved 2026-07-04 (plan-checker, 0 blockers)

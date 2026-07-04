---
phase: 179
slug: notes-feature-harvest-build-time-bake
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 179 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Two test surfaces: Python (api/ + data/ harvest, pytest) and TypeScript (src/ island, vitest).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (api/tests, data/tests) + vitest (src/tests) |
| **Config file** | api/ + data/ pyproject.toml; vitest via package.json |
| **Quick run command** | `npm test` (vitest) AND `cd api && uv run pytest -m "not integration"` |
| **Full suite command** | `npm test` + `cd api && uv run pytest` + `cd data && uv run pytest -m "not integration"` |
| **Estimated runtime** | ~60–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for the language(s) that task touched (`npm test` for src/, `cd api && uv run pytest -m "not integration"` for api/, `cd data && uv run pytest -m "not integration"` for the harvest).
- **After every plan wave:** Run the full suite for all changed languages (per memory `feedback_run_tests_before_push` — run EVERY changed language's suite, not just one).
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 179-01-* | shared render | 1 | NOTES-01 | T-179-XSS | markdown→HTML restricted allowlist; `<script>`/`onerror=` payload renders inert; links get rel=noopener | unit | `cd api && uv run pytest tests/test_render.py` | ❌ W0 | ⬜ pending |
| 179-02-* | migration | 1 | NOTES-01 | — | body_html column + author_id FK added via forward-only batch migration; downgrade raises | unit | `cd data && uv run pytest -m "not integration"` | ❌ W0 | ⬜ pending |
| 179-03-* | note CRUD API | 2 | NOTES-01, NOTES-02 | T-179-AUTHZ | POST/PATCH/DELETE /api/notes require @require_author; PATCH/DELETE reject uid != note.author_id (403); soft-delete sets status='removed' + note_revisions row | unit | `cd api && uv run pytest tests/test_notes.py` | ❌ W0 | ⬜ pending |
| 179-04-* | read endpoint | 2 | NOTES-04 | T-179-LEAK | GET species notes returns approved-only, server-scoped; non-approved never leak | unit | `cd api && uv run pytest tests/test_notes.py` | ❌ W0 | ⬜ pending |
| 179-05-* | harvest → notes.json | 3 | NOTES-03 | — | approved-only, newest-first; byline reuses collectors display_name; shape mirrors species_hosts; runs after collectors-export | unit | `cd data && uv run pytest -m "not integration"` | ❌ W0 | ⬜ pending |
| 179-06-* | artifacts.toml entry | 3 | NOTES-03 | — | notes declared authoritative + build_time_fetch; authoritative ⇒ baseline_diff=false, never a dbt model | unit | `cd data && uv run pytest tests/test_artifacts.py` | ✅ | ⬜ pending |
| 179-07-* | _data/notes.js loader | 3 | NOTES-03 | — | absence-tolerant: returns {} when notes.json absent/unparseable; default-export only | unit | `npm test -- data-notes` | ❌ W0 | ⬜ pending |
| 179-08-* | authoring island | 4 | NOTES-01, NOTES-02, NOTES-04 | — | island hydrates for allowlisted author; guest/no-JS shows baked list; calls fetchWhoami() independently; re-fetches after write | unit | `npm test -- notes-island` | ❌ W0 | ⬜ pending |
| 179-09-* | species-detail render | 4 | NOTES-03 | T-179-XSS | baked stacked list, newest-first, byline links to /collectors/<login>/ when present; empty state graceful; trusted HTML injected | unit | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Task IDs are indicative — planner assigns final IDs.*

---

## Wave 0 Requirements

- [ ] `api/tests/test_render.py` — restricted-markdown render + sanitize (allowlist, inert-payload, rel=noopener) stubs
- [ ] `api/tests/test_notes.py` — note CRUD + ownership (403 on foreign edit/delete) + soft-delete + approved-only read stubs
- [ ] `data/tests/test_notes_harvest.py` — harvest shape/order/byline/approved-only stubs
- [ ] `src/tests/data-notes.test.ts` — absence-tolerant loader stub (mirror `data-species_hosts.test.ts`)
- [ ] `src/tests/notes-island.test.ts` — island hydration/degradation stub
- [ ] `nh3` + `markdown-it-py` added to api/ (and data/ if the shared renderer lives there) deps

*Existing infrastructure (pytest in api/ + data/, vitest in src/) covers the frameworks — only new test files + the two Python deps are needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end author create→edit→delete on a real species page against api.beeatlas.net | NOTES-01, NOTES-02, NOTES-04 | Requires live iNat OAuth session + allowlist + cross-origin cookie flow (Phase-178 UAT precedent — security-critical, no auto-advance) | Sign in as an allowlisted author on /species/<slug>/, add a note, confirm live-island shows it immediately, edit it, delete it; confirm a signed-out/offline reader sees only the baked list |
| Forged-author + cross-origin POST rejection on note endpoints | NOTES-02 | Adversarial security check (mirrors 178 write-check UAT) | Attempt a note PATCH/DELETE with a mismatched author + a cross-origin POST; both must be rejected |
| notes.json appears on the public site after a nightly build cycle | NOTES-03 | Full nightly harvest→publish→deploy fetch cycle runs only on maderas | After a nightly run, confirm a published note renders on the static species page with no runtime API call |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

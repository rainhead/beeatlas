---
phase: 179
slug: notes-feature-harvest-build-time-bake
status: reconciled
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
reconciled: 2026-07-04
---

# Phase 179 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Reconciled against the final 6-plan structure (179-01..06) after planning + plan-check.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (single shared venv) + vitest (src/) |
| **Config file** | `data/pyproject.toml` (its `testpaths` include `../api/tests`, so api route tests run from `data/`); vitest via `package.json` |
| **Quick run command** | language-scoped: `npm test` (src/) · `cd data && uv run pytest tests/... ../api/tests/... -x` (Python) |
| **Full suite command** | `npm test` + `cd data && uv run pytest -m "not integration"` (covers both `data/tests` and `../api/tests`) |
| **Estimated runtime** | ~60–120 seconds |

> **CRITICAL — no `api/pyproject.toml` exists.** Never invoke `cd api && uv run pytest`. All Python tests (including `api/tests/test_notes_routes.py`) run through the `data/` venv, e.g. `cd data && uv run pytest ../api/tests/test_notes_routes.py -x`. The PLAN.md task-level `<automated>` commands already follow this form.

---

## Sampling Rate

- **After every task commit:** Run the quick command for the language(s) that task touched.
- **After every plan wave:** Run every changed language's suite (memory `feedback_run_tests_before_push` — `npm test` for src/, `cd data && uv run pytest -m "not integration"` for api/ + data/).
- **Before `/gsd-verify-work`:** Full suite green.
- **Max feedback latency:** 120 seconds.

---

## Per-Plan Verification Map

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Automated Command |
|------|------|-------------|------------|-----------------|-------------------|
| 179-01 (render helper + migration 0003) | 1 | NOTES-01, 02 | T-179-XSS | `render_note_markdown` → sanitized HTML; `<script>`/`onerror=`/`javascript:` renders inert; links get rel=noopener; migration forward-only, backfills body_html, author_id FK | `cd data && uv run pytest tests/test_notes_render.py tests/test_notes_migrations.py tests/test_notes_store_schema.py -x` |
| 179-02 (note CRUD + read API) | 2 | NOTES-01, 02, 04 | T-179-AUTHZ, T-179-LEAK | POST/PATCH/DELETE `/api/notes` `@require_author`; PATCH/DELETE by non-owner → 403; soft-delete (status='removed' + note_revisions row); `GET /api/notes?species=` approved-only newest-first; author_id always `g.identity['uid']` | `cd data && uv run pytest ../api/tests/test_notes_routes.py -x` |
| 179-03 (harvest → notes.json + contract + loader) | 2 | NOTES-03 | — | read-only WAL store read; approved-only newest-first; byline reuses collectors.json display_name (D-11/D-12); authoritative + build_time_fetch(+_optional); never committed; run.py never migrates | `cd data && uv run pytest tests/test_notes_harvest.py tests/test_artifacts.py tests/test_notes_migrations.py -x && npm test -- data-notes` |
| 179-04 (baked `<section>` + formatDate + CSS) | 3 | NOTES-03 | T-179-XSS | static stacked list newest-first, byline → /collectors/<login>/ when present; zero-notes omits section; `note.html` via `\| safe` only (no client re-sanitize); bee-notes mount always emitted; no runtime API call on load | `npm test -- formatDate && npm test` |
| 179-05 (`<bee-notes>` island + notes client) | 4 | NOTES-01, 02, 04 | — | calls `fetchWhoami()` itself (never reads bee-header DOM); inert for guest/no-JS; author-only Add/Edit/Delete on own notes; live re-fetch after write; no markdown lib in browser; inline two-step delete confirm; no optimistic updates | `npm test -- notes-client bee-notes` |
| 179-06 (security + human UAT) | 5 | NOTES-01, 02, 03, 04 | T-179-XSS, T-179-AUTHZ, T-179-LEAK | live create→edit→delete against api.beeatlas.net; signed-out/offline/no-JS sees only baked list; forged-author + cross-origin both 403; notes.json on static site after a build cycle | **manual — `autonomous: false`, blocking human UAT** |

*Task IDs within each plan carry the finer-grained `<automated>` commands; this table is the plan-level rollup. Plan verify commands verified present in the PLAN.md files.*

---

## Wave 0 Requirements (new test files the plans create)

- [ ] `data/tests/test_notes_render.py` — restricted-markdown render + sanitize (allowlist, inert `<script>`/`onerror=`/`javascript:`, rel=noopener)
- [ ] `data/tests/test_notes_migrations.py` — 0003 forward-only, body_html backfill, author_id FK; the `test_run_py_never_migrates` assertion narrowed to permit the sanctioned read-only `notes-harvest` STEP while keeping the migrate/write ban
- [ ] `data/tests/test_notes_store_schema.py` — notes table has NOT NULL body_html + author_id FK → users.id
- [ ] `data/tests/test_notes_harvest.py` — harvest shape (Record<canonical_name, Note[]>), approved-only, newest-first, byline reuse, after-collectors ordering
- [ ] `api/tests/test_notes_routes.py` — CRUD + ownership 403 + soft-delete + approved-only read + forged/cross-origin rejection
- [ ] `src/tests/data-notes.test.ts` — absence-tolerant `_data/notes.js` loader (mirror `data-species_hosts.test.ts`)
- [ ] `src/tests/formatDate.test.ts` — `formatDate(iso)` → `'Jul 4, 2026'`
- [ ] `src/tests/notes-client.test.ts` — auth-client note CRUD methods
- [ ] `src/tests/bee-notes.test.ts` — `<bee-notes>` hydration (author) / inert degradation (guest/no-JS)
- [ ] Python deps: `nh3` + `markdown-it-py` added to `data/pyproject.toml` (shared venv; the renderer lives in `data/notes_store/render.py`, imported by both api/ and the harvest)

*Frameworks already exist (pytest in the data/ venv, vitest in src/) — only new test files + the two Python deps are needed.*

---

## Manual-Only Verifications (Plan 179-06, `autonomous: false`)

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live author create→edit→delete on a real species page against api.beeatlas.net, live island reflects each change immediately | NOTES-01, 02, 04 | Requires a live iNat OAuth session + allowlist + cross-origin credentialed cookie flow (Phase-178 UAT precedent — security-critical, no auto-advance) | Sign in as an allowlisted author on `/species/<slug>/`, add a note, confirm the live island shows it immediately, edit it, delete it |
| Signed-out / offline / no-JS reader sees only the baked list; no runtime API call on page load | NOTES-03 | Real offline/no-JS behavior on the static page | Load the species page signed-out and with JS disabled / offline; confirm only the baked list renders and no network call fires on load |
| Forged-author + cross-origin note write rejection | NOTES-02 | Adversarial security check (mirrors the 178 write-check UAT) | Attempt a note PATCH/DELETE with a mismatched author + a cross-origin POST; both must be rejected (403) |
| notes.json appears on the public site after a nightly build cycle | NOTES-03 | Full nightly harvest→publish→deploy fetch runs only on maderas | After a nightly run, confirm a published note renders on the static species page with no runtime API call |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (9 new test files enumerated above)
- [x] No watch-mode flags (all `pytest ... -x`, `npm test`)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter (reconciled to the final 6-plan structure)

**Approval:** approved 2026-07-04 (reconciled post-plan-check; `wave_0_complete` flips true once the Wave 1 test scaffolding lands during execution)

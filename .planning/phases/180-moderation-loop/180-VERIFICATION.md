---
phase: 180-moderation-loop
verified: 2026-07-05T04:23:41Z
status: passed
score: 10/10 must-haves verified
overrides_applied: 0
---

# Phase 180: Moderation Loop Verification Report

**Phase Goal:** reader/author/curator roles from a declared, auditable source; deploy-free curator takedown excluded from harvest; XSS sanitization + audit fields; takedown clears the public site within one build cycle (and the live island if NOTES-04 shipped).
**Verified:** 2026-07-05T04:23:41Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria + Plan Must-Haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Three roles (reader/author/curator) sourced from a declared, auditable place | ✓ VERIFIED | `data/roles_allowlist.toml` maps login→role; git history is the audit trail (unchanged since 177). `api/auth.py::_current_roles()` re-reads the TOML from disk on every request — never the import-time-cached `notes_store.roles.ROLES`. `test_notes_seed_roles.py` (11 tests) green. |
| 2 | A curator can take down ANY note (not just their own), 200 + `status='hidden'` | ✓ VERIFIED | `api/main.py:474-530` `takedown_note`; test `test_takedown_by_curator_succeeds` creates the note under a DIFFERENT `author_id` than the curator's uid and asserts 200 + `status == 'hidden'`. Passed live: `test_notes_routes.py -k takedown` (11/11). |
| 3 | A non-curator author gets 403 on takedown; note untouched | ✓ VERIFIED | `test_takedown_by_non_curator_author_is_403` asserts 403, `note.status == 'approved'` unchanged, ledger unchanged (`["create"]` only). Passed. |
| 4 | A demoted curator loses takedown/restore power on the very next request (fresh allowlist re-read, D-05) | ✓ VERIFIED | `api/auth.py::_is_curator_fresh` calls `_current_roles()` (disk re-read), strict `== "curator"`; explicitly does NOT import `notes_store.roles.is_curator` (the import-time-cached version) — confirmed via source read + `grep` (no such import in `api/auth.py`). `test_curator_recheck_reflects_disk_change_not_cookie_role` passes. |
| 5 | Takedown/restore append a `note_revisions` row with `action='takedown'`/`'restore'` and `editor_id` = curator's uid (D-08) | ✓ VERIFIED | `api/main.py` both routes append `NoteRevision(..., editor_id=str(identity["uid"]), action="takedown"/"restore", reason=reason)`. `test_takedown_by_curator_succeeds` asserts `revisions[-1].editor_id == str(curator_uid)`. |
| 6 | Attribution lives only in the ledger row — no `moderated_by`/`moderated_at` columns on `notes` (D-10) | ✓ VERIFIED | `data/notes_store/models.py::Note` has only `id/canonical_name/author_id/body/body_html/status/created_at/updated_at` — no moderation columns. `grep -n "moderated_by\|moderated_at"` across `api/main.py`/`models.py` returns only a docstring comment, no schema/column. |
| 7 | A restore sets status back to `'approved'` (curl-only, no UI — D-07) | ✓ VERIFIED | `api/main.py::restore_note` sets `status="approved"`, `action="restore"`. `src/auth-client.ts` has NO `restoreNote` export (`grep` confirms only `takedownNote`). `test_restore_by_curator_sets_approved` passes. Live curl restore operator-confirmed in 180-05-SUMMARY.md. |
| 8 | A hidden note is excluded from `GET /api/notes` (read never leaks non-approved) | ✓ VERIFIED | `api/main.py:622` `list_notes_for_species` filters `Note.status == "approved"` — unchanged, so `hidden` (a new non-approved value) is excluded by construction. `test_hidden_note_excluded_from_read` passes. |
| 9 | Cross-origin takedown/restore POSTs are rejected | ✓ VERIFIED | Both routes stack `@auth.require_author`, which enforces the `ALLOWED_ORIGINS` gate on state-changing methods. `test_takedown_foreign_origin_is_403`/`test_restore_foreign_origin_is_403` pass. |
| 10 | A hidden-status note is excluded from the nightly harvest (`export_notes`) — MOD-04 by construction, harvest code unmodified | ✓ VERIFIED | `data/notes_harvest.py:103` filters `Note.status == "approved"` — `git log` shows this file has not been touched since Phase 179 (last commit `439ff9d0`, pre-180). `test_harvest_excludes_hidden` passes. |
| 11 | Every note carries the 4 audit fields; `note_revisions.reason` is nullable | ✓ VERIFIED | `Note` model has `author_id/status/created_at/updated_at`. `NoteRevision.reason: Mapped[str | None]` nullable Text. Migration `0004` adds it via single `batch_alter_table.add_column(nullable=True)`, `downgrade()` raises `NotImplementedError`. `test_note_revisions_reason_column_nullable`, `test_schema_notes`, `test_migration_0004_adds_reason_nullable`, `test_no_downgrade_0004` all pass. |
| 12 | A `<script>`/`onerror=` payload renders inert (MOD-03 XSS) | ✓ VERIFIED | `test_notes_render.py` (10 tests, pre-existing from 179, re-run as verification per D-11) — `test_script_tag_survives_only_as_inert_text`, `test_img_onerror_payload_stripped` pass. No render code changed in Phase 180. |
| 13 | Client `AuthState.isCurator` derived from fresh server-echoed `role === 'curator'`; curator sees "Take down" on every note incl. non-owned; non-curator author does not | ✓ VERIFIED | `src/auth-client.ts:157` `isCurator: body.role === 'curator'` in `fetchWhoami`. `src/bee-notes.ts:111` `_isCurator` getter; `_renderCuratorControls` wired into `_renderNote` gated on `_isCurator` alone (independent of `note.can_edit`). `npm test -- auth-client bee-notes` → 28/28 pass, including explicit "renders on a note they do NOT own" and "non-curator author does NOT see" cases. |
| 14 | Click Take down → confirm → POST → refetch removes note (no optimistic removal); 403 shows revoked-permission banner + refetch | ✓ VERIFIED | `_confirmTakedown` (src/bee-notes.ts:269-298): on `ok` → `await this._refetch()` then clears confirm/sets banner (refetch precedes removal — no optimistic client-side splice). On `status===403` → `CURATOR_LOST_COPY` banner + `await this._refetch()`. Vitest cases for both paths pass. |
| 15 | End-to-end live loop: submit → live-island render → baked into `notes.json`; curator takedown → immediate live-island removal; absent from next bake; curl restore → reappears; non-curator negative check | ✓ VERIFIED (operator UAT) | Live system truth, not repo-verifiable. 180-05-SUMMARY.md records the operator walked and confirmed all 6 steps on the live site (`rainhead` as curator) on 2026-07-05, including a notable finding (stale static HTML from a missing site-rebuild, resolved by triggering `deploy.yml`) that was root-caused as an operational sequencing issue, not a moderation defect. Migration 0004 confirmed live (`alembic current` → `0004`; `PRAGMA table_info` lists nullable `reason`). |

**Score:** 15/15 truths verified (10 must-have groups condensed from PLAN frontmatter + roadmap SCs)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `data/notes_store/models.py` | `NoteRevision.reason` nullable Text | ✓ VERIFIED | Present, `Mapped[str | None]`, `nullable=True` |
| `data/notes_store/migrations/versions/0004_add_note_revision_reason.py` | Alembic rev 0004 | ✓ VERIFIED | `revision="0004"`, `down_revision="0003"`, one `batch_alter_table`, `downgrade()` raises `NotImplementedError` |
| `data/tests/test_notes_migrations.py` | 0004 apply + no-downgrade tests | ✓ VERIFIED | 2/2 pass in isolation, 7/7 full file |
| `api/auth.py` | `_is_curator_fresh` | ✓ VERIFIED | Present, disk-fresh, strict equality, does not import `roles.is_curator` |
| `api/main.py` | `takedown_note` + `restore_note` routes | ✓ VERIFIED | Both present, correct status/action/editor_id semantics |
| `src/auth-client.ts` | `isCurator` + `takedownNote` | ✓ VERIFIED | Present; no `restoreNote` export (confirmed absent) |
| `src/bee-notes.ts` | `_isCurator` + `_renderCuratorControls` | ✓ VERIFIED | Present, wired into `_renderNote`, own confirm/error/pending state |
| `data/tests/test_notes_harvest.py` | hidden-exclusion test | ✓ VERIFIED | `test_harvest_excludes_hidden` present and passing |
| `data/tests/test_notes_store_schema.py` | reason + audit-field assertions | ✓ VERIFIED | `test_note_revisions_reason_column_nullable` + existing `test_schema_notes` (extended with `reason`) |
| `data/roles_allowlist.toml` | declared role source | ✓ VERIFIED | Present, unchanged structurally, curators listed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `api/main.py` (takedown/restore) | `api/auth.py::_is_curator_fresh` | pre-load curator gate | ✓ WIRED | `if not auth._is_curator_fresh(identity["login"]): abort(403)` runs before `db_session.get` in both routes |
| `api/main.py` (takedown/restore) | `note_revisions` | `NoteRevision` insert | ✓ WIRED | Both routes append rows with correct `action`/`editor_id`/`reason` |
| `src/bee-notes.ts` | `/api/notes/{id}/takedown` | `takedownNote()` then `_refetch()` | ✓ WIRED | `_confirmTakedown` calls `takedownNote(id)`, awaits `_refetch()` on success |
| `src/auth-client.ts` | `AuthState.isCurator` | `role === 'curator'` in `fetchWhoami` | ✓ WIRED | Confirmed at `src/auth-client.ts:157` |
| `data/notes_harvest.py` | `hidden` exclusion | pre-existing `status == "approved"` filter | ✓ WIRED (by construction) | File untouched since Phase 179 (`git log` confirms), test locks the new value |
| `api/main.py::list_notes_for_species` | `hidden` exclusion | pre-existing `status == "approved"` filter | ✓ WIRED (by construction) | Unchanged, `test_hidden_note_excluded_from_read` passes |

### Behavioral Spot-Checks (Automated Test Execution)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Migration 0004 apply + no-downgrade | `cd data && uv run pytest tests/test_notes_migrations.py -k 0004` | 2 passed | ✓ PASS |
| Curator takedown/restore/hidden routes | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown or restore or hidden"` | 11 passed | ✓ PASS |
| `_is_curator_fresh` authz unit tests | `cd data && uv run pytest ../api/tests/test_authz.py -k curator` | 3 passed | ✓ PASS |
| Hidden-status harvest exclusion | `cd data && uv run pytest tests/test_notes_harvest.py -k hidden` | 1 passed | ✓ PASS |
| Schema/XSS/roles verification | `cd data && uv run pytest tests/test_notes_store_schema.py tests/test_notes_render.py tests/test_notes_seed_roles.py` | 27 passed | ✓ PASS |
| Frontend curator UI | `npm test -- auth-client bee-notes` | 28 passed | ✓ PASS |
| Full backend fast-tier regression | `cd data && uv run pytest -m "not integration"` | 492 passed, 9 skipped (run 3x for stability) | ✓ PASS |
| Full frontend regression | `npm test` | 965 passed | ✓ PASS |
| Production build / type-check | `npm run build` | tsc --noEmit clean, build succeeds | ✓ PASS |

**Note on flaky test observed:** `api/tests/test_session.py::test_verify_cookie_rejects_tampered_token` failed once in a full-suite run (`npm test` full-suite pytest run) but passed consistently in isolation and in 3 repeated full-suite reruns. This is a pre-existing Phase 178 test (session cookie tampering, `itsdangerous`), unrelated to any Phase 180 file (`git log` shows no Phase 180 commit touches `api/session.py` or `api/tests/test_session.py`), and order-dependent under `pytest-randomly`. Not a Phase 180 regression; not included as a gap.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| MOD-01 | 180-02, 180-04 | Roles from a declared, auditable place | ✓ SATISFIED | `data/roles_allowlist.toml` (177, unchanged) + fresh-read authz path; `test_notes_seed_roles.py` green |
| MOD-02 | 180-01, 180-02, 180-03, 180-05 | Curator hide/takedown without code deploy; hidden excluded from harvest | ✓ SATISFIED | Routes live + tested; operator-confirmed live in 180-05-SUMMARY.md |
| MOD-03 | 180-01, 180-02, 180-04 | XSS sanitize-on-write + 4 audit fields | ✓ SATISFIED | Pre-existing nh3 sanitize (179) re-verified; audit fields + nullable `reason` schema-asserted |
| MOD-04 | 180-02, 180-04, 180-05 | Takedown clears public site within one build cycle + live island | ✓ SATISFIED | By-construction harvest/read exclusion, test-locked; operator UAT confirms live-island immediacy + next-bake absence |

No orphaned requirements found — REQUIREMENTS.md maps only MOD-01..04 to Phase 180, and all four appear in at least one plan's `requirements` frontmatter.

### Anti-Patterns Found

None. Scanned all Phase 180 modified/created files (`api/main.py`, `api/auth.py`, `api/tests/test_notes_routes.py`, `api/tests/test_authz.py`, `src/auth-client.ts`, `src/bee-notes.ts`, `data/notes_store/models.py`, `data/notes_store/migrations/versions/0004_add_note_revision_reason.py`, `data/tests/test_notes_migrations.py`, `data/tests/test_notes_harvest.py`, `data/tests/test_notes_store_schema.py`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` — zero matches. No empty-implementation stubs, no hardcoded-empty-data patterns, no console.log-only handlers.

### Human Verification Required

None outstanding. Plan 180-05 was itself the blocking human-UAT plan (operator-executed, `files_modified: []`); its `checkpoint:human-action` (migration apply) and `checkpoint:human-verify` (6-step end-to-end UAT) were both resolved ("migrated" / "approved") per 180-05-SUMMARY.md, which documents the operator's confirmation of all required live-system truths, including a notable finding that was investigated and resolved (stale static HTML root-caused to a missing site rebuild, not a moderation defect).

### Gaps Summary

No gaps. All 4 roadmap Success Criteria for Phase 180 are verified against actual source code (not SUMMARY narrative): the curator role source, the takedown/restore routes with fresh per-request authz and correct ledger attribution, XSS + audit-field substrate (pre-existing, re-verified), and the by-construction harvest/read exclusion — all backed by passing automated tests that were independently re-run during this verification, not merely cited from SUMMARY.md. The one live-system truth (end-to-end MOD-04 walkthrough) was appropriately delegated to a blocking operator UAT gate in Plan 05, which is documented as resolved with an operator sign-off and a specific, credible root-cause narrative for the one transient anomaly encountered (stale static HTML pending a site rebuild — an operational sequencing detail, not a code defect).

---

_Verified: 2026-07-05T04:23:41Z_
_Verifier: Claude (gsd-verifier)_

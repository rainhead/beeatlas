---
phase: 180-moderation-loop
plan: 03
subsystem: ui
tags: [lit, typescript, vitest, auth-client, bee-notes, moderation]

requires:
  - phase: 180-01
    provides: "note_revisions.reason column (migration 0004) — no direct code dependency for this frontend-only plan"
provides:
  - "AuthState.isCurator client-derived signal (role === 'curator')"
  - "takedownNote(id) client function (POST /api/notes/{id}/takedown, empty body)"
  - "curator-gated inline Take-down control in <bee-notes> (_isCurator getter + _renderCuratorControls)"
affects: [180-02, 180-04, 180-05]

tech-stack:
  added: []
  patterns:
    - "Client-derived role affordance mirrors _isAuthor exactly (_isCurator getter); never trusted for security — server re-checks fresh role on every write"
    - "Independent confirm/error state slices per action family (_takedownConfirmId/_takedownErrorNoteId/_takedownError separate from _deleteConfirmId/_deleteErrorNoteId/_deleteError) so two control families (owner vs curator) never collide on the same note"

key-files:
  created: []
  modified:
    - src/auth-client.ts
    - src/bee-notes.ts
    - src/tests/auth-client.test.ts
    - src/tests/bee-notes.test.ts

key-decisions:
  - "isCurator derived purely client-side from role === 'curator' — no server change needed, /auth/whoami already echoes the fresh role (D-03)"
  - "Curator control renders on EVERY note regardless of note.can_edit, as its own adjacent .note-owner-controls row (not merged with owner controls) — matches UI-SPEC's locked recommendation"
  - "No restoreNote client export — restore stays curl-only/operator-triggered (D-07), confirmed absent by source assertion"
  - "Take-down control reuses .note-owner-controls/.note-delete-confirm/.note-btn--danger verbatim — zero new CSS classes, per UI-SPEC Scope Note"

patterns-established:
  - "Curator-affordance-only pattern: any future curator-gated UI signal should mirror _isCurator's shape (authenticated && isCurator===true) and never substitute for server-side authz"

requirements-completed: [MOD-02]

duration: 4min
completed: 2026-07-04
---

# Phase 180 Plan 03: Curator Take-Down UI Control Summary

**Curator-gated inline "Take down" button on `<bee-notes>` driven by a new client-derived `AuthState.isCurator` signal, reusing the existing delete-confirm interaction shape with zero new CSS.**

## Performance

- **Duration:** ~4 min (RED → GREEN → GREEN)
- **Started:** 2026-07-04T18:28:00-07:00 (approx, first task commit 18:28:24)
- **Completed:** 2026-07-04T18:30:04-07:00
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `AuthState.isCurator` added to `src/auth-client.ts`, derived as `role === 'curator'` in `fetchWhoami` — no server change required.
- `takedownNote(id)` client function added, POSTing to `/api/notes/{id}/takedown` via the existing `_postJson` helper with an empty body (no reason field, per UI-SPEC v1 scope).
- `<bee-notes>` gained a curator-only "Take down" control (`_isCurator` getter + `_renderCuratorControls`) shown on every note (regardless of ownership), with its own confirm/pending/error state slices, wired into the existing live-refetch-after-write pattern (D-02, no optimistic removal) and the existing 403 revoked-permission banner mechanism.

## Task Commits

Each task was committed atomically:

1. **Task 1: Failing isCurator + Take-down vitest (RED)** - `759435c0` (test)
2. **Task 2: isCurator field + takedownNote client function (GREEN for auth-client)** - `78e2338b` (feat)
3. **Task 3: Take-down control in bee-notes island (GREEN for bee-notes)** - `64d3d9f1` (feat)

_TDD tasks: RED commit added 7 failing test cases (confirmed via `npm test -- auth-client bee-notes` before implementation); both GREEN commits turned the suite fully green with no refactor step needed._

## Files Created/Modified
- `src/auth-client.ts` - `AuthState.isCurator?: boolean`; `fetchWhoami` derives `isCurator: body.role === 'curator'`; new exported `takedownNote(id)` function
- `src/bee-notes.ts` - `_isCurator` getter; `_takedownConfirmId`/`_takedownErrorNoteId`/`_takedownError` state; `_openTakedownConfirm`/`_cancelTakedownConfirm`/`_confirmTakedown` handlers; `_renderCuratorControls`; wired into `_renderNote` as an adjacent row to `_renderOwnerControls`, gated on `_isCurator` alone
- `src/tests/auth-client.test.ts` - 3 new `isCurator` derivation cases (curator/author/unauthenticated); updated the existing exact-match `fetchWhoami` test to include the new `isCurator: false` field
- `src/tests/bee-notes.test.ts` - new `takedownNote` mock; 6 new curator-control tests (top-level gate pass-through, visibility on non-owned note, absence for non-curator author, confirm→POST→refetch, confirm-cancel, 403 revoked-permission)

## Decisions Made
- Reused `.note-owner-controls`/`.note-delete-confirm`/`.note-btn--danger` verbatim (no new CSS) per the locked UI-SPEC recommendation — distinction between owner Delete and curator Take-down is carried by `aria-label` text (`"Take down this note (curator)"` vs `"Delete your note"`), not color or a new class.
- Curator control appears unconditionally on every note (not gated on `!note.can_edit`) per UI-SPEC's locked answer to the "does it appear on the curator's own note too?" discretion item.
- Client sends `reason: null` implicitly (empty POST body `{}`) — no textarea/prompt added, matching D-09/UI-SPEC's "reason field explicitly excluded from this UI (v1)".

## Deviations from Plan

None — plan executed exactly as written. One necessary adjustment: the pre-existing exact-match `fetchWhoami` test (`toEqual({...})` without `isCurator`) needed its expected object updated to include `isCurator: false` once the field was added in Task 2, to avoid a spurious regression from the new field. This was folded into the Task 1 RED commit (the test naturally failed pre-implementation as required) rather than treated as a separate deviation, since it's a direct consequence of the plan's own D-03 change to `AuthState`'s shape.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. This plan has no backend dependency; the frontend unit tests mock `fetch` and the `auth-client` module entirely. The real `/api/notes/{id}/takedown` endpoint is delivered by the parallel Plan 180-02 (backend, independent wave).

## Next Phase Readiness
- `isCurator` and `takedownNote` are available for any other frontend surface that needs curator-affordance UI.
- The `<bee-notes>` island's Take-down control is fully wired to `takedownNote()` and will function end-to-end once Plan 180-02's `POST /api/notes/{id}/takedown` endpoint is live — no further frontend work needed for MOD-02's UI surface.
- No blockers. Full frontend suite (965 tests) and `npm run build` (`tsc --noEmit`) both green.

## Self-Check: PASSED

All created/modified files verified present; all 4 commits (759435c0, 78e2338b, 64d3d9f1, ebef3b59) verified present in git log.

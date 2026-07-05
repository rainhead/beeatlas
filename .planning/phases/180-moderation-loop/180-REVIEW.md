---
phase: 180-moderation-loop
reviewed: 2026-07-05T04:27:20Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - api/auth.py
  - api/main.py
  - src/auth-client.ts
  - src/bee-notes.ts
  - data/notes_store/models.py
  - data/notes_store/migrations/versions/0004_add_note_revision_reason.py
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
resolved:
  - "CR-01 (Critical): fixed in f44f4650 — takedown/restore now guard current status (409); +6 tests"
  - "WR-01 (Warning): fixed in f44f4650 — non-string reason -> 400, not 500"
  - "WR-03 (Warning): fixed in f44f4650 — models.py status docstring lists 'hidden'"
remaining:
  - "WR-02 (Warning): CSS class collision — curator control + owner controls both use .note-owner-controls when a curator views their own note (cosmetic; advisory)"
  - "3 Info items: private cross-module fn access, shared length-cap constant name, missing restore launch-gate test"
status: issues_resolved
---

# Phase 180: Code Review Report

**Reviewed:** 2026-07-05T04:27:20Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the moderation-loop commits (`a4330b57`, `52c0766e`, `78e2338b`, `64d3d9f1`, `79f49be7`) against their parents. The core authz shape is sound: `_is_curator_fresh` correctly re-reads the allowlist from disk per request with strict `== "curator"` equality (never the import-cached `notes_store.roles.is_curator`), the curator gate in `takedown_note`/`restore_note` runs before the DB load exactly as designed, `require_author` already enforces session + fresh allowlist + Origin/CSRF + WRITE-04 launch gate ahead of the curator-specific check, ownership on the pre-existing owner-only routes is untouched, and `restore` is correctly left unexported from the client (curl-only, D-07). The Alembic migration (0004) is a clean, non-backfilled nullable `Text` column addition with a forward-only `NotImplementedError` guard, matching the established 0001-0003 convention. `list_notes_for_species` and `data/notes_harvest.py` still filter allowlist-style on `status == "approved"`, so `hidden` is excluded by construction as claimed (MOD-04 verified).

The one real defect (CR-01) is a missing state-machine precondition: neither `takedown_note` nor `restore_note` checks the note's *current* `status` before flipping it, so a curator's `restore` call can silently resurrect a note the *author* soft-deleted (`status='removed'`) back to `'approved'` — collapsing the very `hidden`/`removed` distinction D-06 was designed to preserve, and doing so with no UI, confirmation, or safeguard (restore is curl-only, so a curator/operator has only the numeric note id to go on). The test suite never exercises this path — every `restore` test seeds the fixture note directly with `status="hidden"`, never `"removed"`.

Remaining findings are lower-severity quality/robustness gaps: an unguarded `.strip()` on a non-validated `reason` field, a CSS class collision between the new curator control block and the existing owner control block, and a stale docstring that still doesn't mention the new `hidden` status.

## Critical Issues

### CR-01: `restore_note`/`takedown_note` don't verify the note's current status before transitioning it — a curator can un-delete author-removed content

**File:** `api/main.py:474-530` (`takedown_note`), `api/main.py:533-574` (`restore_note`)

**Issue:** Both new routes unconditionally overwrite `note.status` after only checking (a) the caller is a fresh curator and (b) the note exists — they never check what the note's status currently *is*:

```python
# restore_note, api/main.py:556-562
with Session(_ENGINE) as db_session:
    note = db_session.get(Note, note_id)
    if note is None:
        abort(404)

    note.status = "approved"   # <-- no check that note.status == "hidden"
    note.updated_at = now
```

D-06 (`180-CONTEXT.md`) deliberately introduces `hidden` as *distinct* from the author's own soft-delete `removed`, specifically so a curator's takedown/restore and an author's own delete stay independently reversible/auditable. But because `restore_note` doesn't gate on the prior status, calling it against a note that is `removed` (the author deleted their own note) flips it straight to `approved` — republishing content the author intentionally took down, with no author consent, no UI trail, and no confirmation step (restore is curl-only per D-07, so there is no second surface to catch the mistake). Symmetrically, `takedown_note` called against a `removed` note silently reclassifies it as `hidden`, erasing the distinction the ledger's `action` column exists to preserve (the note's own `status` no longer reflects that it was originally author-removed).

This is untested: every existing restore test (`api/tests/test_notes_routes.py:474-536`) seeds the note directly with `status="hidden"` before calling restore — none exercises `status="removed"` or `status="pending"`, so this gap shipped without a failing test to catch it.

**Fix:** Require the expected prior status before applying the transition, and 409/422 (or a distinct error) otherwise:

```python
# restore_note
note = db_session.get(Note, note_id)
if note is None:
    abort(404)
if note.status != "hidden":
    abort(409)  # only a curator-hidden note is restorable; author-removed notes are not
note.status = "approved"
...

# takedown_note
note = db_session.get(Note, note_id)
if note is None:
    abort(404)
if note.status == "removed":
    abort(409)  # a curator takedown must not silently reclassify an author's own delete
note.status = "hidden"
...
```
Add a regression test seeding `status="removed"` and asserting `restore` is rejected (and one asserting `takedown` on a `removed` note is rejected too).

## Warnings

### WR-01: Unvalidated `reason` type causes an unhandled 500 instead of a 400

**File:** `api/main.py:507`, `api/main.py:551`

**Issue:** `reason = (payload.get("reason") or "").strip() or None` assumes `payload.get("reason")` is either absent, `None`, or a `str`. A curator client (or a malformed/buggy request) sending `{"reason": 123}` or `{"reason": ["x"]}` produces a truthy non-string value, which then hits `.strip()` and raises `AttributeError`. This isn't reachable by an unauthenticated attacker (the route already requires a valid curator session + correct Origin), but it turns a client-side bug or malformed request into an opaque 500 instead of a clean 400, and mirrors an existing gap in `create_note`/`edit_note`'s `body_md` handling that this phase's new routes copy forward rather than fix.

**Fix:**
```python
reason_raw = payload.get("reason")
if reason_raw is not None and not isinstance(reason_raw, str):
    abort(400)
reason = (reason_raw or "").strip() or None
```

### WR-02: Curator "Take down" control and owner Edit/Delete controls share the identical `note-owner-controls` class, producing duplicate sibling class names

**File:** `src/bee-notes.ts:342-347` (`_renderOwnerControls`), `src/bee-notes.ts:365-369` (`_renderCuratorControls`)

**Issue:** Both render methods wrap their buttons in `<div class="note-owner-controls">`. Since `_renderNote` (line 388-389) renders both blocks side-by-side when a curator views their own note (`note.can_edit && !isEditingThis` and `this._isCurator && !isEditingThis` can both be true simultaneously), the resulting `<article>` contains two sibling `<div class="note-owner-controls">` elements. Beyond being semantically wrong (a curator's takedown button is not an "owner" control — the class name actively mis-describes it), this is a latent trap for any future CSS/JS that assumes the class is unique within a note (`querySelector('.note-owner-controls')`, `:first-child`/`:last-child` selectors, or a future feature that toggles `.note-owner-controls` visibility for a different purpose).

**Fix:** Give the curator block its own class, e.g. `note-curator-controls`, and add a shared layout rule if visual parity with `.note-owner-controls` is desired:
```typescript
private _renderCuratorControls(note: NoteView) {
  return html`
    <div class="note-curator-controls">
      <button class="note-btn note-btn--danger" aria-label="Take down this note (curator)" @click=${() => this._openTakedownConfirm(note.id)}>Take down</button>
    </div>
  `;
}
```

### WR-03: `Note.status` docstring not updated to mention the new `hidden` value

**File:** `data/notes_store/models.py:38`

**Issue:** `NoteRevision.action`'s inline comment was correctly updated to list `'takedown'`/`'restore'` (line 69), but `Note`'s class docstring — the authoritative enumeration of `status` values used by anyone reasoning about what a note's status can be — still reads:
```python
"""... ``status`` values (D-08): 'approved' (default), 'pending', 'removed'."""
```
`hidden` (D-06, introduced by this phase) is the fourth possible value and is omitted. Given this comment is the closest thing to a canonical reference for the enum, a future engineer implementing status-based logic elsewhere could reasonably (and incorrectly) assume there are only three values.

**Fix:**
```python
``status`` values (D-06/D-08): 'approved' (default), 'pending', 'removed', 'hidden'.
```

## Info

### IN-01: Cross-module access to a leading-underscore "private" function

**File:** `api/main.py:503`, `api/main.py:547` (`auth._is_curator_fresh(...)`)

**Issue:** `_is_curator_fresh` is named with a leading underscore in `api/auth.py`, signaling module-private intent, yet `api/main.py` calls it directly via `auth._is_curator_fresh(...)`. This mirrors an existing precedent in the same file (`roles_module._ALLOWLIST` in `_fresh_role`), so it's consistent with house style rather than a new pattern — but it's worth flagging because private names carry no compatibility contract: a future refactor of `api/auth.py` that renames or inlines `_is_curator_fresh` has no static-analysis signal warning it about this external caller.

**Fix:** Consider exposing a small public wrapper (e.g. `auth.is_curator(login)`) from `api/auth.py` for cross-module use, keeping `_current_roles`/`_is_curator_fresh` as the private implementation.

### IN-02: `_NOTE_BODY_MAX_LENGTH` reused for the `reason` field's cap under a misleading name

**File:** `api/main.py:508`, `api/main.py:552`

**Issue:** Both new routes cap `reason` length with `_NOTE_BODY_MAX_LENGTH` (5000), a constant whose name and docstring (`api/main.py:342`) describe it as the note-*body* cap. Reusing it for an unrelated field (the curator's moderation reason) works but reads as a copy-paste artifact at the call site.

**Fix:** Either introduce a distinct `_REASON_MAX_LENGTH` constant (can share the same value) or rename the existing constant to something field-agnostic like `_TEXT_FIELD_MAX_LENGTH`.

### IN-03: No test exercises `restore_note`'s WRITE-04 launch-gate (503) path

**File:** `api/tests/test_notes_routes.py`

**Issue:** `test_takedown_launch_gate_off_is_503` (line 422) exists for `takedown_note`, but there is no analogous test for `restore_note`. Since `restore` is curl-only with no UI fallback, it's the least-observable of the two new endpoints in production, making test coverage of its full guard stack more valuable, not less.

**Fix:** Add `test_restore_launch_gate_off_is_503` mirroring the existing takedown test.

---

_Reviewed: 2026-07-05T04:27:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

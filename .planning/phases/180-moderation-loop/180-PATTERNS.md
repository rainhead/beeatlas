# Phase 180: Moderation Loop - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 9 (2 new, 5 modified, 2+ test files extended)
**Analogs found:** 9 / 9

All cited analogs were re-verified directly against the live source in this
session (not just trusted from RESEARCH.md) — line numbers below match the
current file contents.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `data/notes_store/migrations/versions/0004_add_note_revision_reason.py` | migration | CRUD (schema) | `data/notes_store/migrations/versions/0003_add_body_html_author_fk.py` | exact (same table family, simpler variant) |
| `api/main.py` — `takedown_note()` / `restore_note()` | controller/route | request-response (state transition + ledger append) | `edit_note` / `delete_note` in same file (`api/main.py:391-462`) | exact |
| `api/auth.py` — `_is_curator_fresh()` | middleware/utility (authz helper) | request-response | `_is_author_fresh` (`api/auth.py:89-90`) | exact |
| `src/auth-client.ts` — `isCurator` field + derivation | service/utility (client auth state) | request-response | `isAuthor` field + derivation in same file (`src/auth-client.ts:15,137`) | exact |
| `src/bee-notes.ts` — curator "Take down" control | component | request-response (event-driven UI + refetch) | `_isAuthor` getter + `_renderOwnerControls` in same file (`src/bee-notes.ts:93-95,268-289`) | exact |
| `src/styles/taxon-pages.css` — reuse `.note-btn`/`.note-btn--danger` | config (styles) | n/a | existing `.note-owner-controls`/`.note-btn`/`.note-btn--danger` rules (~lines 497-587) | exact (no new classes needed) |
| `api/tests/test_notes_routes.py` (extend) | test | request-response | existing `test_edit_note_by_non_owner_is_403` + fixtures `_mint`/`_allowlist_toml`/`_make_user`/`_make_note`/`_sign_in` (lines 50-196) | exact |
| `api/tests/test_authz.py` (extend) | test | request-response | `test_allowlist_recheck_reflects_disk_change_not_cookie_role` (line 119) | exact |
| `data/tests/test_notes_harvest.py` (extend) | test | batch/transform | existing `pending`/`removed` exclusion test in same file | exact |
| `src/tests/auth-client.test.ts` / `src/tests/bee-notes.test.ts` (extend) | test | request-response | existing `isAuthor`/owner-control test blocks in same files | exact |

## Pattern Assignments

### `data/notes_store/migrations/versions/0004_add_note_revision_reason.py` (migration)

**Analog:** `data/notes_store/migrations/versions/0003_add_body_html_author_fk.py`

**Header/metadata pattern** (lines 1-30, verified):
```python
"""Add body_html column + author_id integer FK to users.id (D-05/D-08).
...
This migration has no downgrade path — the authoritative store has no
upstream from which it can be rebuilt (Pitfall 4). downgrade() raises
NotImplementedError.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None
```

**Key deviation for 0004 (do NOT copy the 3-step batch dance):** 0003 needed
a 3-step add→backfill→tighten-NOT-NULL sequence because `body_html` became
NOT NULL on a pre-populated table. `reason` on `note_revisions` is nullable
**forever** (D-09) — 0004 needs only a single `batch_alter_table` block:
```python
def upgrade() -> None:
    with op.batch_alter_table("note_revisions") as batch_op:
        batch_op.add_column(sa.Column("reason", sa.Text, nullable=True))


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops a column is unrecoverable (Pitfall 4)."
    )
```
Still wrap in `batch_alter_table` for consistency with `env.py`'s global
`render_as_batch=True`, even though a bare nullable ADD COLUMN doesn't
strictly require SQLite batch mode.

**Companion model change** — `data/notes_store/models.py`'s `NoteRevision`
class needs `reason: Mapped[str | None] = mapped_column(Text, nullable=True)`
added alongside the existing `action` column. Pitfall: this model edit alone
does NOT alter the real maderas SQLite file — the migration file is what
actually does that; test fixtures using `Base.metadata.create_all` will pass
even if the migration is missing, so add an explicit migration-apply test
(see test file section below).

---

### `api/main.py` — `takedown_note()` / `restore_note()` (controller, request-response)

**Analog:** `edit_note` (lines 391-421) and `delete_note` (lines 423-451) in the same file.

**Imports/module context** (already present, no new imports needed beyond
what `edit_note`/`delete_note` already use — `Session`, `Note`, `NoteRevision`,
`datetime`, `g`, `jsonify`, `abort`, `request`).

**Ownership/authz pattern to mirror, load-before-check** (`api/main.py:414-420`,
`edit_note`, verified verbatim):
```python
with Session(_ENGINE) as db_session:
    note = db_session.get(Note, note_id)
    if note is None:
        abort(404)
    if note.author_id != identity["uid"]:
        abort(403)
```
For takedown/restore, replace the per-note ownership check with a pre-load
identity-level curator gate (RESEARCH's Pattern 2/Open-Question-1 recommends
checking `_is_curator_fresh` BEFORE the `db_session.get` call, since "are you
a curator at all" doesn't leak any note-specific existence info the way an
ownership check would):
```python
@app.post("/api/notes/<int:note_id>/takedown")
@auth.require_author
def takedown_note(note_id):
    identity = g.identity
    if not auth._is_curator_fresh(identity["login"]):
        abort(403)

    payload = request.get_json(silent=True) or {}
    reason = (payload.get("reason") or "").strip() or None

    now = datetime.datetime.now(datetime.UTC)
    with Session(_ENGINE) as db_session:
        note = db_session.get(Note, note_id)
        if note is None:
            abort(404)

        note.status = "hidden"
        note.updated_at = now
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="takedown",
                reason=reason,
            )
        )
        db_session.commit()
        return jsonify({"id": note.id}), 200
```
`restore_note` is structurally identical: `status = "approved"`,
`action="restore"`, no UI wiring (curl-only per D-07).

**Soft-delete/status-flip + ledger-append pattern** (`api/main.py:445-461`,
`delete_note`, verified verbatim — the exact shape both new routes follow):
```python
note.status = "removed"
note.updated_at = now
db_session.add(
    NoteRevision(
        note_id=note.id,
        body=note.body,
        editor_id=str(identity["uid"]),
        revised_at=now,
        action="remove",
    )
)
db_session.commit()
return jsonify({"id": note.id}), 200
```

**Read-scoping invariant to leave untouched** (`api/main.py`, `list_notes_for_species`,
verified — `.filter(Note.canonical_name == species, Note.status == "approved")`):
No code change needed here; `hidden` is automatically excluded as a new
non-`approved` value (D-06/MOD-04 "by construction").

---

### `api/auth.py` — `_is_curator_fresh()` (middleware/utility, request-response)

**Analog:** `_is_author_fresh` (verified verbatim, `api/auth.py`):
```python
def _current_roles() -> dict[str, str]:
    """Re-parse the committed allowlist TOML from disk (D-05 revocation).
    ...
    """
    with roles_module._ALLOWLIST.open("rb") as fh:
        cfg = tomllib.load(fh)
    return cfg.get("roles", {})


def _is_author_fresh(login: str) -> bool:
    return _current_roles().get(login) in ("author", "curator")
```

**New helper (mirrors exactly, curator-only, no union):**
```python
def _is_curator_fresh(login: str) -> bool:
    return _current_roles().get(login) == "curator"
```

**Do NOT reuse** `data/notes_store/roles.py`'s `is_curator()` — it reads the
import-time-cached `ROLES` dict (loaded once at process start), so a demoted
curator would keep curator power until the Waitress worker restarts,
violating D-05's fresh-recheck invariant. Only `_is_curator_fresh` (reading
`roles_module._ALLOWLIST` per-request, exactly like `_current_roles`) is
suitable for the new authz gate.

**`require_author` decorator to layer on top, unchanged** (verified verbatim):
```python
def require_author(view):
    @wraps(view)
    def author_view(*args, **kwargs):
        login = g.identity["login"]
        if not _is_author_fresh(login):
            abort(403)
        if request.method in _STATE_CHANGING_METHODS:
            if not origin_allowed(request.headers.get("Origin")):
                abort(403)
        if not config.WRITES_ENABLED:
            abort(503)
        return view(*args, **kwargs)
    return require_session(author_view)
```
Both new routes stack `@auth.require_author` (unchanged — a curator already
satisfies `_is_author_fresh`'s `role in ("author","curator")` check) plus
the new `_is_curator_fresh` check inside the view body.

---

### `src/auth-client.ts` — `isCurator` field (service/utility, request-response)

**Analog:** the existing `AuthState` interface + `fetchWhoami()` (verified verbatim):
```typescript
export interface AuthState {
  authenticated: boolean;
  login?: string;
  role?: string | null;
  isAuthor?: boolean;
}

export async function fetchWhoami(): Promise<AuthState> {
  try {
    const res = await fetch(`${API_BASE}/auth/whoami`, { credentials: 'include' });
    if (!res.ok) return { authenticated: false };
    const body = await res.json() as {
      authenticated: boolean;
      login?: string;
      role?: string | null;
      is_author?: boolean;
    };
    if (!body.authenticated) return { authenticated: false };
    return {
      authenticated: true,
      login: body.login,
      role: body.role ?? null,
      isAuthor: body.is_author ?? false,
    };
  } catch {
    return { authenticated: false };
  }
}
```

**New field, same shape** — add `isCurator?: boolean;` to `AuthState` and
`isCurator: body.role === 'curator',` alongside the existing `isAuthor` line
in the returned object. No server-side change needed — `role` is already
echoed fresh by `/auth/whoami`; derivation is purely client-side string
comparison.

---

### `src/bee-notes.ts` — curator "Take down" control (component, event-driven)

**Analog:** `_isAuthor` getter + `_renderOwnerControls` (verified verbatim, `src/bee-notes.ts:93-95, 268-289`):
```typescript
private get _isAuthor(): boolean {
  return this._authState?.authenticated === true && this._authState?.isAuthor === true;
}

private _renderOwnerControls(note: NoteView) {
  // ... existing edit/delete buttons, e.g.:
  //   <button class="note-btn note-btn--edit" aria-label="Edit your note" @click=${() => this._openEdit(note)}>Edit</button>
  //   <button class="note-btn note-btn--danger" aria-label="Delete your note" @click=${() => this._openDeleteConfirm(note.id)}>Delete</button>
}
```

**New sibling getter + render method:**
```typescript
private get _isCurator(): boolean {
  return this._authState?.authenticated === true && this._authState?.isCurator === true;
}

private _renderCuratorControls(note: NoteView) {
  return html`
    <button class="note-btn note-btn--danger" aria-label="Take down this note"
      @click=${() => this._takedownNote(note.id)}>Take down</button>
  `;
}
```
Wire `_renderCuratorControls` into the same conditional spot where
`_renderOwnerControls` is invoked (`src/bee-notes.ts:307`,
`${note.can_edit && !isEditingThis ? this._renderOwnerControls(note) : ''}`) —
show curator control regardless of `can_edit` (curator acts on ANY note, not
just their own).

**Live re-fetch-after-write pattern** (D-02, verified — `_refetch()` called
after every create/edit/delete at lines 171, 195, 221, 232): `_takedownNote`
must follow the identical shape — POST, then `await this._refetch();` — no
optimistic local removal.

**Top-level render gate, unchanged** (`src/bee-notes.ts:318`,
`if (!this._isAuthor) return html\`\`;`) — no change needed; a curator's
`AuthState.isAuthor` is always `true` per `_is_author_fresh`'s
`role in ("author","curator")` semantics, so a curator-only (non-author-listed)
login still passes this gate. Add a test asserting this explicitly since it
depends on server/client semantics staying aligned.

---

### `src/styles/taxon-pages.css` (config, styles)

No new classes required — the curator "Take down" button reuses the
existing `.note-btn`/`.note-btn--danger` rules (~lines 497-587,
`.note-owner-controls`/`.note-btn`/`.note-btn--danger`/`.note-delete-confirm`)
verbatim. No pattern excerpt needed beyond confirming the class names match.

---

### Test files (extend existing fixtures, don't invent new ones)

**`api/tests/test_notes_routes.py`** — analog fixtures (verified present at
these approximate lines):
```python
def _mint(login="allowed_author", role="author", uid=1): ...
def _allowlist_toml(tmp_path, roles: dict): ...
def _make_user(engine, login="allowed_author", inat_user_id=42) -> int: ...
def _make_note(engine, canonical_name="apis mellifera", author_id=1, body_md="hello", status="approved"): ...
def _sign_in(client, monkeypatch, tmp_path, login="allowed_author", role="author", uid=1): ...
```
New takedown/restore tests should mint a `role="curator"` session via `_mint`/
`_sign_in`, create a note with `_make_note` under a *different* author_id
(to prove curator-not-owner still succeeds), and mirror
`test_edit_note_by_non_owner_is_403`'s shape but assert 200 for a curator and
403 for a non-curator author. Also extend `_make_note` call sites to accept
`status="hidden"` for the "hidden note excluded from read" test.

**`api/tests/test_authz.py`** — analog: `test_allowlist_recheck_reflects_disk_change_not_cookie_role`
(line 119) — mint a session, then rewrite the allowlist file to demote the
role, and assert the next request loses privilege immediately. New test
mirrors this exact shape but for `_is_curator_fresh` (demote curator→author
mid-session, assert takedown now 403s).

**`data/tests/test_notes_harvest.py`** — mirror the existing `pending`/`removed`
exclusion assertions; add a `hidden`-status fixture row and assert
`export_notes()` excludes it identically.

**`src/tests/auth-client.test.ts`** / **`src/tests/bee-notes.test.ts`** —
extend the existing `isAuthor`-derivation and owner-control test blocks with
parallel `isCurator`/`Take down` cases.

## Shared Patterns

### Fresh-role authz (never client-trusted)
**Source:** `api/auth.py` `_current_roles()` + `_is_author_fresh()`
**Apply to:** the new `_is_curator_fresh()` helper and both new routes.
```python
def _current_roles() -> dict[str, str]:
    with roles_module._ALLOWLIST.open("rb") as fh:
        cfg = tomllib.load(fh)
    return cfg.get("roles", {})
```

### Load-before-authz (404-before-403, IDOR guard)
**Source:** `edit_note`/`delete_note` in `api/main.py`
**Apply to:** takedown/restore routes — load the `Note` row before any
per-note authorization branch (though the curator identity gate itself is
correctly pre-load, per Open Question #1 in RESEARCH.md).

### Status-flip + append-only ledger row
**Source:** `delete_note`'s `status="removed"` + `NoteRevision(action="remove", ...)`
**Apply to:** takedown (`status="hidden"`, `action="takedown"`) and restore
(`status="approved"`, `action="restore"`), both carrying the new `reason`
field and `editor_id=str(identity["uid"])` (the curator's uid, not the
author's — D-08).

### `.note-btn` / `.note-btn--danger` button convention
**Source:** `src/bee-notes.ts` `_renderOwnerControls` + `src/styles/taxon-pages.css`
**Apply to:** the new `_renderCuratorControls` "Take down" button — no new
CSS classes.

## No Analog Found

None — every file in scope has a direct, same-file or same-module analog
already established by Phases 177-179. This phase is additive to an existing
pattern family, not a new architectural surface.

## Metadata

**Analog search scope:** `api/main.py`, `api/auth.py`, `api/tests/`,
`data/notes_store/migrations/versions/`, `data/tests/`, `src/auth-client.ts`,
`src/bee-notes.ts`, `src/styles/taxon-pages.css`, `src/tests/`
**Files scanned:** 9 (all read directly, verbatim excerpts confirmed against
live source in this session, not merely trusted from RESEARCH.md)
**Pattern extraction date:** 2026-07-04

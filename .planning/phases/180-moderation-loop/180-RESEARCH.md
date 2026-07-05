# Phase 180: Moderation Loop - Research

**Researched:** 2026-07-05
**Domain:** Server-enforced authz override (curator takedown) on an existing Flask/SQLite write layer + a Lit island UI affordance
**Confidence:** HIGH

## Summary

Phase 180 is a **verification-and-small-addition** phase, not a build. Every
substrate claim in `180-CONTEXT.md` (D-01..D-11) was directly confirmed
against the live source in this session — file:line references below are
exact as of this research pass, not approximate. The one place CONTEXT's
approximate line numbers drifted slightly from the real file (e.g.
`edit_note` is at line 395, not ~397; `delete_note` at 440, not ~443) is
noted inline; the drift is cosmetic and does not change any decision.

The actual new work is small and well-bounded: (1) one Alembic migration
(0004) adding a nullable `reason` column to `note_revisions`; (2) two new
Flask routes (`POST /api/notes/{id}/takedown`, `POST /api/notes/{id}/restore`)
in `api/main.py`, each stacking a **new fresh curator-role helper**
(`_is_curator_fresh`, mirroring the existing `_is_author_fresh` pattern
exactly) on top of the existing `@auth.require_author` decorator; (3) an
`isCurator` field on `AuthState` in `src/auth-client.ts`; (4) a "Take down"
button in `src/bee-notes.ts` gated on that field. MOD-04 (exclusion from
harvest + read) requires **zero new code** — `status='approved'` scoping
already excludes any non-approved status, and `hidden` will be non-approved
by construction the moment it's used.

A subtlety CONTEXT did not fully spell out: `data/notes_store/roles.py`
already has an `is_curator(login)` helper — but it reads the **import-time
cached** `ROLES` dict, not a fresh per-request disk read. It is unsuitable
for authz-critical use as-is (a demoted curator would keep curator power
until the Waitress worker restarts) and must NOT be reused directly by the
new routes; the new `_is_curator_fresh` in `api/auth.py` must re-read the
allowlist file per request exactly as `_is_author_fresh` does. This is a
verification finding, not a contradiction of D-04/D-05 — CONTEXT already
says "mirror `_is_author_fresh`," this research just confirms *why* the
existing `notes_store.roles.is_curator` cannot be substituted.

**Primary recommendation:** Add `_is_curator_fresh(login)` to `api/auth.py`
next to `_is_author_fresh`; add the two new routes in `api/main.py`
immediately after `delete_note`, reusing the exact load-before-ownership
(404-before-403) shape and `NoteRevision` insert pattern already used by
`create_note`/`edit_note`/`delete_note`; add `reason` via a single-step
nullable `op.add_column` migration (no batch-mode backfill needed, since
nullable-with-no-default is directly addable in SQLite even without batch
mode — batch mode is still used for consistency with 0001-0003, per env.py's
global `render_as_batch=True`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Curator role determination (fresh, per-request) | API / Backend (`api/auth.py`) | — | Authz must never be client-trusted; the allowlist file is server-side only |
| Takedown/restore state transition | API / Backend (`api/main.py`) + Database (SQLite `notes`/`note_revisions`) | — | Status flip + ledger append is a single DB transaction |
| Curator UI affordance ("Take down" button) | Browser / Client (`src/bee-notes.ts`) | — | Pure UX signal; never the authz decision itself |
| `isCurator` derivation | Browser / Client (`src/auth-client.ts`) | API (`/auth/whoami` echoes fresh `role`) | Client derives a boolean from a server-supplied fresh role string |
| Exclusion from public surfaces (MOD-04) | Database (status scoping) | API read route + nightly harvest (`data/notes_harvest.py`) | Both already filter `status='approved'`; `hidden` simply joins `pending`/`removed` as a non-approved value — no new code path |
| Migration (schema change) | Database / Store (Alembic, `data/notes_store/migrations/`) | — | Forward-only, owned by the write layer per STORE-02, never by `run.py` |

## Package Legitimacy Audit

No new external packages are introduced by this phase. All required
dependencies (Flask, SQLAlchemy, Alembic, itsdangerous) are already
installed and pinned in `data/pyproject.toml` from Phases 177-179. This
section is not applicable — skip the legitimacy gate.

## User Constraints

<user_constraints>
### Locked Decisions (from 180-CONTEXT.md, D-01..D-11 — verbatim)

- **D-01:** The curator takedown control is inline on the species-page
  `<bee-notes>` island — a "Take down" button on each note, shown only when
  the signed-in user is a curator, alongside the owner's existing edit/delete
  controls. Reuse the existing island; no separate page/view.
- **D-02:** Reactive moderation only. A curator acts on notes they view on a
  species page. NO global "needs moderation" discovery list / workbench.
- **D-03:** The client needs an `isCurator` signal on `AuthState` (today
  `src/auth-client.ts` carries `role` + `isAuthor` but no curator boolean).
  The server already exposes the fresh `role` via `/auth/whoami` +
  `/api/write-check` (`_fresh_role`, re-read from the allowlist per request,
  D-05 revocation) — the client derives `isCurator` from `role === 'curator'`.
  Curator-only controls are a UX affordance; authz is always re-checked
  server-side (never client-trusted).
- **D-04:** Curator override is a dedicated curator-only endpoint
  `POST /api/notes/{id}/takedown`. The existing owner-only `DELETE`/`PATCH`
  routes stay untouched. Guard it with `@auth.require_author` plus a fresh
  curator-role check (mirror `_fresh_role` / `_is_author_fresh`) — re-read
  the allowlist per request, never trust the cookie's baked role.
- **D-05:** Takedown-only. A curator can hide/restore any note but cannot
  edit another author's content.
- **D-06:** Takedown is reversible via a distinct `hidden` status (separate
  from author self-delete `removed`). Both are non-`approved`, so both are
  already excluded by the existing harvest/read scoping.
- **D-07:** Restore is operator-only — a curator-only
  `POST /api/notes/{id}/restore` route (sets `status` back to `approved`,
  appends `action='restore'`) that is NOT wired to any UI; the operator hits
  it via curl. The read endpoint must never return hidden content.
- **D-08:** A takedown records a distinct ledger action in `note_revisions`:
  `action='takedown'` (and `action='restore'` for a restore), with
  `editor_id` = the curator's uid.
- **D-09:** A takedown accepts an optional free-text `reason` (empty
  allowed), stored on the `note_revisions` row. Nullable `reason` column on
  `note_revisions` — a forward-only Alembic migration (next revision after
  0003; SQLite-on-maderas, `render_as_batch=True`, `downgrade()` raises
  `NotImplementedError`).
- **D-10:** Attribution lives in the ledger row only. No new
  `moderated_by`/`moderated_at` columns on the `notes` table —
  `note_revisions` (editor_id + revised_at + action) is the append-only
  source of truth.
- **D-11:** XSS sanitization and audit fields are already implemented
  (179-01 / 177). This phase verifies them rather than rebuilding.

### Claude's Discretion

- Exact HTTP status codes / response shapes for takedown & restore (mirror
  the existing note routes: 200 on success, 404-before-403 load ordering,
  Origin + launch-gate via `require_author`).
- Button copy / placement details in the island (follow the existing
  `.note-btn` / `.note-btn--primary` conventions; note 179-05: island hides
  "Add note" while any editor is open).
- Whether the curator "Take down" appears on the curator's OWN notes too
  (they already have owner delete; low stakes either way).

### Deferred Ideas (OUT OF SCOPE)

- Discovery / moderation workbench — a cross-species list of notes needing
  attention. Deferred (roadmap scope guardrail); reactive-per-species-page
  is v1.
- Inline restore UI — surfacing hidden notes to curators for one-click
  restore. Deferred to keep the read endpoint leak-free (D-07); operator
  curl is v1.
- Pre-moderation queue, reader flagging/voting, edit-history/revision UI —
  all in REQUIREMENTS.md "Future Requirements → Moderation depth"; add only
  if abuse/quality issues emerge.
- `notes-guest-freshness-gap` (todo) — guest-visible up-to-24h lag between a
  live-posted note and its baked appearance. Reviewed, NOT folded — orthogonal
  to moderation, MOD-04's "within one build cycle" is the same cadence and is
  acceptable here.
</user_constraints>

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|------------------|
| MOD-01 | Three roles — reader/author/curator — sourced from a declared, auditable place | **Already satisfied.** `data/roles_allowlist.toml` exists with `rainhead = "curator"` (line 24); `data/notes_store/roles.py` defines `role_of`/`is_author`/`is_curator` against the committed TOML; git history is the audit trail. Nothing to build — verify only. |
| MOD-02 | A curator can hide/take down any note without a code deploy; hidden notes excluded from harvest | New `POST /api/notes/{id}/takedown` route in `api/main.py` (curator-only, `status='hidden'`, ledger `action='takedown'`) + `POST /api/notes/{id}/restore`. Exclusion is free — see MOD-04 support below. |
| MOD-03 | Note content XSS-sanitized on write; every note carries audit fields (`author_id`, `status`, `created_at`, `updated_at`) | **Already implemented** (179-01, `data/notes_store/render.py`'s `render_note_markdown`: `MarkdownIt("zero")` + `nh3.clean` allowlist). Verify with a `<script>`/`onerror=` payload test; verify the 4 audit fields exist on `Note` (`data/notes_store/models.py:43-50` — confirmed: `author_id`, `status`, `created_at`, `updated_at` all present). New work: the takedown/restore paths must also append `note_revisions` rows carrying `editor_id`/`revised_at`/`action`. |
| MOD-04 | A takedown removes a note from the public site within one harvest/build cycle (and immediately from the live island) | **Exclusion by construction, verify only.** `api/main.py:519` (`list_notes_for_species`) filters `Note.status == "approved"`; `data/notes_harvest.py:103` filters `Note.status == "approved"`. `hidden` is a new non-`approved` value, so both already exclude it with zero new plumbing. Live-island immediacy comes from `bee-notes.ts`'s existing `_refetch()` re-fetch-after-write pattern (D-02 in 179), reused after a takedown click. |
</phase_requirements>

## Standard Stack

No new libraries. This phase extends the existing 177-179 stack in place:

| Component | Version (confirmed) | Role in this phase |
|-----------|---------------------|---------------------|
| Flask | 3.1.2+ (`data/pyproject.toml`) | Hosts the 2 new routes |
| SQLAlchemy | 2.0.51+, <3 | ORM for `Note`/`NoteRevision` mutation |
| Alembic | 1.18.5 (installed; `data/.venv`) | Migration 0004 |
| nh3 / markdown-it-py | 0.3.6+ / 4.2.0+ | Unchanged — no new sanitization surface added by this phase |
| Lit | (existing, `src/bee-notes.ts`) | New "Take down" button render branch |

**Installation:** none required.

## Architecture Patterns

### System Architecture Diagram

```
Curator's browser (species page, <bee-notes> island)
        │
        │ 1. GET /auth/whoami  (existing)
        ▼
  auth-client.ts:fetchWhoami()  ──►  AuthState { role: 'curator', isAuthor: true, isCurator: true }  [NEW field]
        │
        │ 2. bee-notes.ts renders "Take down" button per note (NEW)
        │    only when _authState.isCurator === true
        ▼
  Curator clicks "Take down [+ optional reason]"
        │
        │ 3. POST /api/notes/{id}/takedown  { reason?: string }  [NEW route]
        ▼
api/main.py (Flask)
        │
        │ @auth.require_author            — session + fresh author/curator recheck + Origin + WRITE-04 gate (EXISTING)
        │ @auth._is_curator_fresh gate     — fresh curator-only recheck               (NEW helper)
        │ db_session.get(Note, note_id)    — load FIRST (404 if missing)              (EXISTING pattern)
        │ curator check (403 if not curator, AFTER load)                              (NEW, mirrors owner check)
        ▼
  note.status = 'hidden'; note.updated_at = now
  INSERT note_revisions (action='takedown', editor_id=<curator uid>, reason=<text>)   [NEW column]
        │
        ▼
  commit ── 200 {id}
        │
        ▼
  bee-notes.ts: await this._refetch()  — same GET /api/notes?species= (EXISTING, unmodified)
        │
        ▼
  list_notes_for_species filters status='approved' (EXISTING, unmodified)
        │        └── 'hidden' note is absent from the response ⇒ vanishes from the live island immediately
        │
        ▼ (next nightly cycle)
data/notes_harvest.py: export_notes() filters status='approved' (EXISTING, unmodified)
        │        └── 'hidden' note is absent from notes.json ⇒ vanishes from the next static build
        ▼
  public/data/notes.json (published via S3 + manifest.json + deploy.yml, per artifacts.toml)
```

Restore path (curl-only, no UI):
```
Operator's terminal
   │
   │ curl -X POST https://api.beeatlas.net/api/notes/{id}/restore \
   │      -H "Origin: https://beeatlas.net" --cookie "<curator's session cookie>"
   ▼
api/main.py: POST /api/notes/{id}/restore  [NEW route]
   │  same @require_author + _is_curator_fresh gate as takedown
   │  note.status = 'approved'; INSERT note_revisions(action='restore', editor_id=<curator>, reason=<optional>)
   ▼
  commit ── 200 {id}
   │
   ▼  the now-'approved' note reappears in list_notes_for_species and the next harvest — no new read-path code needed
```

### Recommended Project Structure

No new files/directories — all changes land in existing modules:

```
api/
├── auth.py           # add _is_curator_fresh() next to _is_author_fresh()
├── main.py           # add takedown_note() / restore_note() views after delete_note()
data/notes_store/
├── models.py         # add `reason: Mapped[str | None]` to NoteRevision
├── migrations/versions/
│   └── 0004_add_note_revision_reason.py   # NEW migration file
src/
├── auth-client.ts    # add `isCurator?: boolean` to AuthState; populate in fetchWhoami()
├── bee-notes.ts       # add _isCurator getter + _renderCuratorControls() + takedownNote() call
```

### Pattern 1: Fresh-role authz helper (mirror `_is_author_fresh`)

**What:** A per-request, disk-reread boolean check that never trusts the
session cookie's baked role.
**When to use:** Any authz decision that must reflect the very latest state
of `roles_allowlist.toml` (D-05 revocation semantics) — exactly the shape
`_is_author_fresh` already uses.
**Example (confirmed existing code, `api/auth.py:77-91`):**
```python
# Source: api/auth.py (existing, verified)
def _current_roles() -> dict[str, str]:
    """Re-parse the committed allowlist TOML from disk (D-05 revocation)."""
    with roles_module._ALLOWLIST.open("rb") as fh:
        cfg = tomllib.load(fh)
    return cfg.get("roles", {})


def _is_author_fresh(login: str) -> bool:
    return _current_roles().get(login) in ("author", "curator")
```
**New code to add (mirrors the above exactly, curator-only, no "author OR
curator" union):**
```python
# NEW — api/auth.py, immediately after _is_author_fresh
def _is_curator_fresh(login: str) -> bool:
    return _current_roles().get(login) == "curator"
```
Do NOT reuse `data/notes_store/roles.py`'s `is_curator()` — it reads the
import-time-cached `ROLES` module dict (loaded once at process start), so a
curator demoted mid-runtime would keep curator power until the Waitress
worker restarts. This violates D-05's fresh-recheck invariant. That helper
is fine for read-only/display contexts but wrong for an authz gate.

### Pattern 2: Load-before-ownership (404-before-403), extended to a role check

**What:** Load the row unconditionally first; only then branch on
authorization. Applies identically whether the check is "is this MY note"
(existing `edit_note`/`delete_note`) or "am I a curator" (new
takedown/restore) — the ordering rule is about IDOR prevention (never let a
403 branch reveal existence before load), not about which specific
authorization predicate is used.
**Example (confirmed existing code, `api/main.py:414-420`, `edit_note`):**
```python
# Source: api/main.py (existing, verified) — the pattern to mirror
with Session(_ENGINE) as db_session:
    note = db_session.get(Note, note_id)
    if note is None:
        abort(404)
    if note.author_id != identity["uid"]:
        abort(403)
```
**New route shape (takedown), following the identical structure:**
```python
# NEW — api/main.py, after delete_note()
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

**Open ordering question flagged for the planner (see Open Questions #1):**
Should the `_is_curator_fresh` check run *before* or *after* the `db_session.get`
load? The existing owner check runs *after* load (load-before-ownership, so a
guessed id belonging to another author still 404s cleanly if it doesn't
exist, rather than leaking existence via a 403-before-404 ordering bug). The
curator check above is written pre-load (like `require_author`'s allowlist
check, which also runs before any DB access) because "are you a curator at
all" is an identity-level gate independent of which note is targeted — it
does not leak per-note existence information the way an ownership check
would. This mirrors how `require_author`'s allowlist recheck already runs
before the view function (and thus before any note-specific load) for the
*existing* CRUD routes. The planner should confirm this reasoning holds and
write it into the task's verification criteria (a curator's own 403 test and
a non-curator author's 403-before-404 test should both be written).

### Pattern 3: Restore route (curl-only, mirrors takedown)

```python
# NEW — api/main.py, after takedown_note()
@app.post("/api/notes/<int:note_id>/restore")
@auth.require_author
def restore_note(note_id):
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

        note.status = "approved"
        note.updated_at = now
        db_session.add(
            NoteRevision(
                note_id=note.id,
                body=note.body,
                editor_id=str(identity["uid"]),
                revised_at=now,
                action="restore",
                reason=reason,
            )
        )
        db_session.commit()
        return jsonify({"id": note.id}), 200
```

### Pattern 4: `isCurator` derivation on the client (mirrors `isAuthor`)

**Example (confirmed existing code, `src/auth-client.ts:122-142`):**
```typescript
// Source: src/auth-client.ts (existing, verified)
export interface AuthState {
  authenticated: boolean;
  login?: string;
  role?: string | null;
  isAuthor?: boolean;
}

export async function fetchWhoami(): Promise<AuthState> {
  // ...
  return {
    authenticated: true,
    login: body.login,
    role: body.role ?? null,
    isAuthor: body.is_author ?? false,
  };
}
```
**New field to add (no server change needed — `role` is already echoed
fresh by `/auth/whoami`; the derivation is purely client-side):**
```typescript
export interface AuthState {
  authenticated: boolean;
  login?: string;
  role?: string | null;
  isAuthor?: boolean;
  isCurator?: boolean;   // NEW
}

// in fetchWhoami(), alongside the existing isAuthor line:
isCurator: body.role === 'curator',   // NEW
```

### Pattern 5: `bee-notes.ts` curator control (mirrors `_renderOwnerControls`)

**Example (confirmed existing code, `src/bee-notes.ts:93-95, 268-289`):**
```typescript
// Source: src/bee-notes.ts (existing, verified)
private get _isAuthor(): boolean {
  return this._authState?.authenticated === true && this._authState?.isAuthor === true;
}

private _renderOwnerControls(note: NoteView) {
  // ... existing edit/delete buttons using .note-btn / .note-btn--danger
}
```
**New addition, following the same shape (getter + a sibling render method,
called alongside `_renderOwnerControls` inside `_renderNote`):**
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
Note: `render()` currently gates the ENTIRE island on `if (!this._isAuthor)
return html\`\`;` (line 318). A curator who is not also an author (unlikely
given `rainhead` is listed only as `curator` in the allowlist, and
`is_author` on the server returns true for `role in ('author','curator')` —
see `api/main.py:292`) would still pass this gate because `is_author` is
already `true` for curators server-side. **No change needed to the
top-level render gate** — a curator's `AuthState.isAuthor` is always `true`
per the existing `_fresh_role`/`is_author` semantics. The planner should
still add an explicit test asserting this (a curator-only, non-author-listed
login still sees the island) since it depends on server-side semantics
staying aligned with `role in ("author", "curator")` in exactly one place
(`api/main.py:292`, the `whoami` route).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Curator role check | A new role-storage mechanism, DB table, or a second allowlist file | The existing `data/roles_allowlist.toml` + a fresh-read helper mirroring `_is_author_fresh` | MOD-01 is already satisfied; a second role source would violate "declared, auditable place" and fork the D-05 revocation semantics |
| Audit trail for takedown/restore | A new `moderation_log` table or `moderated_by`/`moderated_at` columns on `notes` | The existing append-only `note_revisions` table + a new `action` value + the new `reason` column | D-10 explicitly locks this; `note_revisions` already carries `editor_id`/`revised_at`/`action` — exactly what's needed |
| Excluding hidden notes from public surfaces | A new `WHERE status != 'hidden'` clause, a new harvest filter, or a second query path | The existing `Note.status == "approved"` filters in `list_notes_for_species` (api/main.py:519) and `export_notes` (data/notes_harvest.py:103) | Both are allowlist-style (`== 'approved'`), not denylist-style (`!= 'hidden'`) — a new status value is automatically excluded with zero code change; this is the entire point of D-06 |

**Key insight:** This phase's discipline is almost entirely about *not*
building things — every "Don't Hand-Roll" row above corresponds to a
CONTEXT.md decision (D-01, D-10, D-06) whose entire rationale is "the
substrate already handles this." The only genuinely new code is the two
routes, one migration, and two small client-side additions.

## Common Pitfalls

### Pitfall 1: Reusing `notes_store.roles.is_curator()` for the new authz gate

**What goes wrong:** A demoted curator (allowlist edited, entry removed)
would still be able to take down/restore notes indefinitely, because
`notes_store.roles.ROLES` is parsed once at Python import time and never
re-read.
**Why it happens:** `data/notes_store/roles.py` already defines a
plausible-looking `is_curator(login)` function, making it tempting to import
and call directly from `api/main.py`.
**How to avoid:** Always route the curator check through a NEW
`api/auth.py::_is_curator_fresh` that re-reads the allowlist from disk per
request — exactly mirroring `_is_author_fresh`'s pattern (both live in
`api/auth.py`, both call `_current_roles()`).
**Warning signs:** A test that revokes a curator mid-session (edits the
allowlist file after minting a session cookie) and expects an immediate 403
would fail if the stale `notes_store.roles.is_curator` path is used instead.

### Pitfall 2: Confusing `is_author` (server) with "has the `author` role" (allowlist)

**What goes wrong:** A curator-only login (like `rainhead` in the real
allowlist — `curator` only, no separate `author` line) might be assumed NOT
to satisfy `@auth.require_author`, blocking the very takedown flow this
phase adds.
**Why it happens:** The word "author" appears in both the decorator name
(`require_author`) and the role enum value (`"author"`), but they mean
different things: `_is_author_fresh` (the decorator's underlying check)
returns true for role `in ("author", "curator")` — i.e. "may write at all,"
not "has literally the `author` role."
**How to avoid:** Confirm (already done in this research, `api/auth.py:90-91`)
that `_is_author_fresh` treats curator as a superset of author privileges;
the new takedown/restore routes correctly layer `@auth.require_author` (the
"can write at all" gate) with the NEW `_is_curator_fresh` (the "specifically
curator" gate) rather than trying to bypass `require_author`.
**Warning signs:** A curator-only test account getting 403 on
`/api/notes/{id}/takedown` from the `require_author` decorator itself (before
even reaching the curator-specific check) would indicate this confusion.

### Pitfall 3: Forgetting the nullable-column three-step pattern is NOT needed here

**What goes wrong:** Copy-pasting migration 0003's three-step
add-nullable→backfill→tighten-NOT-NULL pattern for the new `reason` column,
adding unnecessary complexity.
**Why it happens:** 0003 is the most recent migration and its docstring is
detailed about the three-step SQLite batch-mode dance — easy to
over-generalize as "this is how BeeAtlas migrations always work."
**How to avoid:** The three-step pattern in 0003 was needed ONLY because
`body_html` was being added as eventually-NOT-NULL on a table with
pre-existing rows. `reason` is nullable **forever** (D-09: "optional
free-text reason (empty allowed)") — a single `op.add_column(sa.Column(...,
nullable=True))` inside one `batch_alter_table` block is sufficient; no
backfill step, no later `alter_column` to tighten. `render_as_batch=True` is
still the correct wrapping (consistency with env.py's global setting), even
though a bare nullable ADD COLUMN doesn't strictly require SQLite batch mode
— using `batch_alter_table` uniformly avoids a special-cased non-batch
migration file.
**Warning signs:** A migration file with 3 `batch_alter_table` blocks for a
single nullable column addition is a sign this pitfall occurred.

### Pitfall 4: Adding `reason` to the ORM model but forgetting the migration is what actually alters the SQLite file

**What goes wrong:** Editing `NoteRevision` in `data/notes_store/models.py`
to add the `reason` column without writing the corresponding Alembic
migration would work fine against a **freshly created** test DB (SQLAlchemy
`Base.metadata.create_all` on a `tmp_path` engine, the pattern every existing
test in `api/tests/test_notes_routes.py` uses) but would silently be missing
on the real maderas SQLite file, which only evolves via `alembic upgrade
head` (per STORE-02 — migrations owned by the write layer, `run.py` never
migrates).
**Why it happens:** Test fixtures create tables directly from ORM metadata
(`Base.metadata.create_all(engine)`), which doesn't go through Alembic at
all — tests will pass even if the migration file is missing.
**How to avoid:** Always pair a `models.py` column addition with an Alembic
migration file in the same plan/task; add an explicit test asserting the
migration itself adds the column (mirroring `test_notes_migrations.py`'s
existing style for 0003 — verify that file's exact assertions before writing
the 0004 test).
**Warning signs:** `test_notes_routes.py`-style tests pass, but a fresh
`alembic upgrade head` against an empty SQLite file (or the existing
`test_notes_migrations.py::test_migration_applies` pattern, which DOES test
the real Alembic path) would fail to find the column.

### Pitfall 5: `reason` as `NOT NULL` breaks D-09's "empty allowed"

**What goes wrong:** Making the new column `NOT NULL` (even with a default
of `""`) forces every take-down/restore call to supply *some* value, and
complicates the empty-string-vs-null semantics the client needs to handle.
**Why it happens:** Every existing `note_revisions` column (`body`,
`editor_id`, `revised_at`, `action`) is `NOT NULL`, making `NOT NULL`
feel like "the house style."
**How to avoid:** D-09 explicitly says "empty allowed" — model `reason` as
`Mapped[str | None]` / `nullable=True`, and have the route normalize an
empty/whitespace-only client-supplied reason to `None` (shown in Pattern 2's
code above: `reason = (payload.get("reason") or "").strip() or None`) so the
stored value is either a real reason string or NULL, never an empty string.
**Warning signs:** A test asserting `note_revisions.reason == ""` (rather
than `is None`) after a takedown with no reason supplied.

## Code Examples

### Alembic migration 0004 (the new file to create)

```python
# Source: data/notes_store/migrations/versions/0003_add_body_html_author_fk.py
# (pattern to follow for header/footer; body simplified since no backfill
# or NOT NULL tightening is needed — see Pitfall 3)
"""Add nullable reason column to note_revisions (D-09).

A curator's takedown/restore accepts an optional free-text reason
(empty allowed) — stored directly on the note_revisions row alongside the
existing action/editor_id/revised_at columns (D-08/D-10). No backfill is
needed: existing rows simply get reason=NULL, which is a valid, permanent
state (not a transitional one, unlike 0003's body_html).

This migration has no downgrade path — the authoritative notes store has no
upstream from which it can be rebuilt (Pitfall 4/T-177-01 guard).
downgrade() raises NotImplementedError.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


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

### Where migrations are applied (verified, not new information)

Migrations are **operator-run on maderas**, never by `run.py`/nightly (per
STORE-02 and the existing `test_run_py_never_migrates` test referenced in
179-VALIDATION.md). The 178-08/179 precedent (STATE.md) shows the pattern:
the operator runs `alembic upgrade head` against the live SQLite file on
maderas as part of a deploy step, analogous to how migration 0002 (users
table) and 0003 (body_html/author_id FK) were applied — this is a deploy
task, not a nightly-pipeline task. Expect the plan to include an
operator/`autonomous: false` checkpoint task for running `alembic upgrade
head` on maderas, mirroring 178-08's migration-0002 step and 179's (implicit)
migration-0003 apply.

### NoteRevision model change (data/notes_store/models.py)

```python
# Source: data/notes_store/models.py (existing model, verified) + new field
class NoteRevision(Base):
    __tablename__ = "note_revisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    editor_id: Mapped[str] = mapped_column(String, nullable=False)
    revised_at: Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)  # 'create'/'edit'/'remove'/'takedown'/'restore'  [comment update]
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)  # NEW — D-09, optional curator reason

    note: Mapped["Note"] = relationship(back_populates="revisions")
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `edit_note`/`delete_note` hard-403 any non-owner | Curator override via dedicated `takedown`/`restore` routes, owner routes untouched | This phase (180) | Preserves the simple IDOR-safe shape of the owner routes; the curator path is fully separate, easier to reason about and test in isolation |
| `note_revisions.action` values: `create`/`edit`/`remove` | Adds `takedown`/`restore` as distinct actions (not reusing `remove`) | This phase (180), per D-08 | The ledger now distinguishes "author deleted their own note" from "curator took it down," which is the entire point of an auditable moderation trail |

**Deprecated/outdated:** None — this phase adds to the existing schema/API
surface without deprecating anything from 177-179.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The curator-role check should run before the DB load (pre-load identity gate), analogous to `require_author`'s allowlist check, rather than after-load like the owner-ownership check | Pattern 2 / Open Questions #1 | Low — either ordering yields correct 403s for the concrete threat model here (curator-only allowlist, no per-note secrecy tied to whether a note ID exists); the planner should pick one and write a test locking it in, since CONTEXT does not fully specify the exact micro-ordering, only that `require_author` + a curator check must stack |
| A2 | `hidden` and `restore`'s reversibility do not need a NOT NULL default or index — `status='hidden'` needs no new index because canonical_name+status queries are unindexed today (`notes.status` has no dedicated index) | Standard Stack / Don't Hand-Roll | Low — table is species-notes-scale (tens to low hundreds of rows per species, ~560 species total per CLAUDE.md); no realistic performance concern, consistent with existing `status='removed'`/`'pending'` which also have no dedicated index |
| A3 | The operator will run `alembic upgrade head` on maderas as a manual/blocking checkpoint task, following the 178-08/179 precedent, rather than an automated nightly step | Code Examples / "Where migrations are applied" | Low — directly supported by STORE-02 ("migrations owned/run by the write layer, never by run.py/the nightly pipeline") and the existing `test_run_py_never_migrates` test; if the planner instead tries to automate this via nightly.sh it would violate a locked v8.0 architecture invariant |

**If this table is empty:** N/A — see rows above; all are LOW risk and
narrowly scoped to execution-ordering details, not to any of the D-01..D-11
locked decisions themselves.

## Open Questions (RESOLVED)

**RESOLVED (planning, 2026-07-04):** Both questions were answered during
planning and are reflected in the plans. (1) Curator-check ordering → **check
before load**, implemented in 180-02 (the non-curator 403 reveals nothing about
whether the note id exists). (2) Reason-input UI scope → **bare "Take down"
button, no reason field in v1**; `reason` stays API/curl-only, per 180-03 and
180-UI-SPEC.md.

1. **Exact ordering of the curator-role check relative to the note load in
   takedown/restore.**
   - What we know: `require_author` already gates identity+allowlist+Origin+
     launch-gate BEFORE the view function runs at all (no note-specific data
     touched yet). The existing owner-ownership check in `edit_note`/
     `delete_note` runs AFTER the note load (load-before-ownership,
     IDOR-safe: 404 before 403 for a specific note id).
   - What's unclear: whether the new `_is_curator_fresh` check belongs
     "before load" (as a blanket identity gate, like `require_author` itself)
     or "after load" (as a per-note authorization check, mirroring the owner
     check's exact structure).
   - Recommendation: Put it before load — a "you are not a curator at all"
     403 reveals nothing about whether note `note_id` exists (unlike an
     ownership check, which inherently depends on the specific note's
     `author_id`). This also keeps the route body simpler (identity check,
     then business logic) and matches how `require_author`'s own allowlist
     check already works. The planner should write both a "non-curator author
     gets 403 on takedown, note untouched" test and a "missing note id + valid
     curator gets 404" test to lock in the chosen ordering explicitly.

2. **Does the "Take down" button need a reason-input UI, or is D-09's
   "optional free-text reason" v1-scoped to API-only (curl/future UI)?**
   - What we know: D-09 requires the API to accept an optional reason.
     D-01 requires an inline "Take down" button in `<bee-notes>`.
   - What's unclear: CONTEXT's "Claude's Discretion" section defers "button
     copy/placement details" to the planner but does not explicitly say
     whether the inline UI needs a reason textbox/prompt, or whether a bare
     "Take down" button (POST with no reason, i.e. `reason: null`) satisfies
     both D-01 and D-09 for v1.
   - Recommendation: A bare button (no reason prompt) is sufficient for v1 —
     D-09 says reason is optional ("empty allowed"), and the roadmap's
     scope guardrail explicitly excludes "moderation workbench" complexity.
     A `window.confirm()`-style browser prompt (or no prompt at all) keeps
     the UI addition minimal; a full reason-textarea editor would exceed the
     "Take down" button's stated scope. Flag this for the planner/discuss
     step if a richer UX is desired.

## Environment Availability

Skip — this phase touches only already-deployed infrastructure (existing
Flask app, existing SQLite store, existing Alembic setup, existing npm/vite
frontend build). No new external tool, service, or runtime dependency is
introduced. `alembic`, `flask`, `sqlalchemy`, `nh3`, `markdown-it-py` are
already installed in `data/pyproject.toml`'s shared venv (confirmed above);
`npm`/`vitest`/`lit` are already the project's frontend stack.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (shared `data/` venv, `testpaths` includes `../api/tests`) + vitest (`src/`) |
| Config file | `data/pyproject.toml` (Python); `package.json` (vitest) |
| Quick run command | `cd data && uv run pytest ../api/tests/test_notes_routes.py -x` (backend) · `npm test -- bee-notes auth-client` (frontend) |
| Full suite command | `npm test` + `cd data && uv run pytest -m "not integration"` |

**CRITICAL (carried from 179-VALIDATION.md) — no `api/pyproject.toml`
exists.** Never invoke `cd api && uv run pytest`. All Python API tests run
through the `data/` venv, e.g.
`cd data && uv run pytest ../api/tests/test_notes_routes.py -x`.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MOD-01 | Roles sourced from declared allowlist (verification only) | unit | `cd data && uv run pytest tests/test_notes_seed_roles.py -x` | ✅ existing |
| MOD-02 | Curator takedown: non-curator author → 403; curator → 200, status='hidden' | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k takedown -x` | ❌ Wave 0 — new tests in `test_notes_routes.py` |
| MOD-02 | Curator restore: sets status back to 'approved' | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k restore -x` | ❌ Wave 0 |
| MOD-02 | Load-before-ownership: missing note id → 404 before any 403 (IDOR) | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown_missing_is_404 or restore_missing_is_404" -x` | ❌ Wave 0 |
| MOD-02 | Demoted curator (allowlist edited between mint and request) loses takedown power immediately | unit | `cd data && uv run pytest ../api/tests/test_authz.py -k curator -x` | ❌ Wave 0 — new tests in `test_authz.py` mirroring `test_allowlist_recheck_reflects_disk_change_not_cookie_role` |
| MOD-02 | Cross-origin POST to takedown/restore rejected | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown_foreign_origin or restore_foreign_origin" -x` | ❌ Wave 0 |
| MOD-02/04 | Hidden note excluded from `GET /api/notes` read | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k hidden -x` | ❌ Wave 0 |
| MOD-04 | Hidden note excluded from `notes_harvest.export_notes()` | unit | `cd data && uv run pytest tests/test_notes_harvest.py -k hidden -x` | ❌ Wave 0 — extend existing approved-only test to include a `hidden` fixture row |
| MOD-03 | `<script>`/`onerror=` payload renders inert (verification, not new) | unit | `cd data && uv run pytest tests/test_notes_render.py -x` | ✅ existing |
| MOD-03 | Every note carries the 4 audit fields (verification) | unit | `cd data && uv run pytest tests/test_notes_store_schema.py -x` | ✅ existing (extend if needed to assert `reason` column presence on `note_revisions`) |
| MOD-08 (ledger)| Takedown/restore append `note_revisions` rows with correct `action`/`editor_id`/`reason` | integration | `cd data && uv run pytest ../api/tests/test_notes_routes.py -k "takedown_appends_ledger or restore_appends_ledger" -x` | ❌ Wave 0 |
| — | Migration 0004 adds nullable `reason`, forward-only, no downgrade | unit | `cd data && uv run pytest tests/test_notes_migrations.py -k 0004 -x` | ❌ Wave 0 — new test mirroring the existing 0003 test |
| — | `isCurator` correctly derived in `fetchWhoami()` | unit | `npm test -- auth-client` | ❌ Wave 0 — extend `src/tests/auth-client.test.ts` |
| — | `<bee-notes>` renders "Take down" only for curators; hidden after click | unit | `npm test -- bee-notes` | ❌ Wave 0 — extend `src/tests/bee-notes.test.ts` |

### Sampling Rate

- **Per task commit:** the quick command for the language(s) that task touched.
- **Per wave merge:** `npm test` (src/) + `cd data && uv run pytest -m "not integration"` (memory `feedback_run_tests_before_push` — run BOTH suites, not just one).
- **Phase gate:** Full suite green before `/gsd-verify-work`, PLUS the human UAT walkthrough (MOD-04's submit→publish→takedown end-to-end check, per roadmap "do NOT auto-advance past UAT").

### Wave 0 Gaps

- [ ] New tests in `api/tests/test_notes_routes.py`: takedown (curator success, non-curator 403, missing-note 404, cross-origin 403, launch-gate 503, ledger-append assertions) — mirror the existing `edit_note`/`delete_note` test blocks (`test_edit_note_by_owner_succeeds`, `test_edit_note_by_non_owner_is_403`, etc.) but keyed on curator role instead of ownership.
- [ ] New tests in `api/tests/test_notes_routes.py`: restore (curator success sets status back to approved, ledger action='restore') + hidden-note-excluded-from-read.
- [ ] New tests in `api/tests/test_authz.py`: a curator-specific `_is_curator_fresh` revocation test mirroring `test_allowlist_recheck_reflects_disk_change_not_cookie_role`, plus an "author-only login is NOT a curator" test.
- [ ] Extend `data/tests/test_notes_harvest.py`: add a `hidden`-status fixture row and assert it's excluded (mirrors the existing `pending`/`removed` exclusion pattern already present per the harvest module's D-10 filter).
- [ ] New test file or extension: `data/tests/test_notes_migrations.py` — assert migration 0004 adds `note_revisions.reason` as nullable, and that `downgrade()` raises `NotImplementedError`.
- [ ] Extend `src/tests/auth-client.test.ts`: `isCurator` derivation from `role === 'curator'` in `fetchWhoami()`.
- [ ] Extend `src/tests/bee-notes.test.ts`: curator sees "Take down" on ANY note (not just their own); non-curator author does not; clicking it triggers a POST + refetch that removes the note from the rendered list.
- [ ] No new framework/config installs needed — pytest and vitest are both already fully wired.

## Security Domain

`security_enforcement` is not set to `false` in `.planning/config.json` —
treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no (unchanged) | iNat OAuth2 PKCE + signed session cookie, both pre-existing (Phase 178), untouched by this phase |
| V3 Session Management | no (unchanged) | `itsdangerous` signed cookie, pre-existing, untouched |
| V4 Access Control | **yes** | Fresh-read allowlist-based RBAC (`_is_author_fresh`, new `_is_curator_fresh`) — never client-trusted; load-before-authz ordering (IDOR prevention) |
| V5 Input Validation | yes (unchanged for new `reason` field) | Server-side strip/None-normalization of the optional `reason` string (same pattern as `body_md`'s existing strip+length-cap in `create_note`/`edit_note`, though `reason` gets no length cap requirement per D-09 — planner should decide whether to reuse the 5000-char `_NOTE_BODY_MAX_LENGTH` cap defensively) |
| V6 Cryptography | no (unchanged) | Session signing key / PKCE verifier, pre-existing, untouched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Privilege escalation via stale session role | Elevation of Privilege | Fresh per-request allowlist re-read (`_is_curator_fresh`), never the cookie's baked `role` — directly extends the existing D-05 `_is_author_fresh` mitigation |
| IDOR via 403-before-404 existence leak | Information Disclosure | Load-before-authz ordering for the note-specific check; the curator identity check itself runs pre-load since it leaks nothing note-specific (see Open Question #1) |
| Cross-site forged takedown/restore POST | Spoofing / Tampering | Reuses `require_author`'s existing Origin allow-list gate (`ALLOWED_ORIGINS`, state-changing-method check) — no new CSRF surface introduced |
| Stored XSS via note body | Tampering | Already mitigated by `render_note_markdown` (nh3 + markdown-it "zero" preset); takedown/restore never touch `body`/`body_html`, so no new sanitization surface is introduced by this phase |
| Reason-field injection/log-forging | Tampering | `reason` is stored as an opaque `Text` column via SQLAlchemy parameterized ORM inserts — no string interpolation into SQL or shell; no length cap is locked by CONTEXT, but a defensive cap (matching `_NOTE_BODY_MAX_LENGTH` or a smaller value) is reasonable planner discretion |

## Sources

### Primary (HIGH confidence — direct code read in this session)
- `.planning/phases/180-moderation-loop/180-CONTEXT.md` — locked decisions D-01..D-11
- `.planning/REQUIREMENTS.md` — MOD-01..04 definitions + traceability table
- `.planning/ROADMAP.md` §"Phase 180: Moderation Loop" — goal, success criteria, scope guardrail, UI hint
- `.planning/STATE.md` — v8.0 progress, decisions, load-bearing conventions
- `api/main.py` (lines 142-148 `_fresh_role`; 307-325 `write_check`; 345-471 `create_note`/`edit_note`/`delete_note`; 474-542 `list_notes_for_species`)
- `api/auth.py` (lines 77-141: `_current_roles`, `_is_author_fresh`, `require_session`, `require_author`, `origin_allowed`)
- `data/roles_allowlist.toml` — confirmed `rainhead = "curator"` entry
- `data/notes_store/roles.py` — confirmed existing but import-time-cached `is_curator()` helper (unsuitable for direct authz reuse)
- `data/notes_store/models.py` — `Note`/`NoteRevision`/`User` schema, confirmed 4 audit fields on `Note`
- `data/notes_store/db.py` — WAL engine factory
- `data/notes_store/render.py` — `render_note_markdown` (nh3 + markdown-it "zero" preset)
- `data/notes_store/migrations/env.py` — confirmed `render_as_batch=True` global setting
- `data/notes_store/migrations/versions/0003_add_body_html_author_fk.py` — confirmed forward-only pattern, `downgrade()` raises `NotImplementedError`, three-step batch pattern (for contrast with the simpler 0004 needed here)
- `data/notes_harvest.py` — confirmed `status='approved'` filter (line 103)
- `src/bee-notes.ts` — confirmed `_isAuthor` getter (93-95), `_renderOwnerControls` (268-289), `render()` top-level gate (318), `note-btn` conventions
- `src/auth-client.ts` — confirmed `AuthState` shape (12-17), `fetchWhoami()` (122-142)
- `src/styles/taxon-pages.css` (lines 497-587) — `.note-owner-controls`/`.note-btn`/`.note-btn--danger`/`.note-delete-confirm` CSS conventions to reuse for the curator control
- `api/tests/test_notes_routes.py` and `api/tests/test_authz.py` — existing test fixture conventions (`_mint`, `_allowlist_toml`, `_sign_in`, `_make_user`, `_make_note`) to be reused/extended by Wave 0 tests
- `.planning/phases/179-notes-feature-harvest-build-time-bake/179-VALIDATION.md` — test framework/command conventions (pytest via `data/` venv, no `api/pyproject.toml`)
- `.planning/config.json` — confirmed `workflow.nyquist_validation: true`, no `security_enforcement: false` override

### Secondary (MEDIUM confidence)
- None — this phase required no external web research; all findings derive from direct repository inspection.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing, verified in `data/pyproject.toml`
- Architecture: HIGH — every pattern is a direct extension of code read in this session, not inferred
- Pitfalls: HIGH — each pitfall traces to a specific line of existing code or an explicit CONTEXT.md decision (D-05, D-09, D-10)

**Research date:** 2026-07-05
**Valid until:** Stable — this research is grounded in the phase's own frozen substrate (Phases 177-179, already shipped and unlikely to change mid-180). No external ecosystem drift risk. Re-verify only if a 179 hotfix touches `api/main.py`/`api/auth.py`/`src/bee-notes.ts` before 180 executes.

## RESEARCH COMPLETE

# Phase 180: Moderation Loop - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Give a **curator** the power to keep the public notes surface safe: take down
any note **without a code deploy**, leave an **auditable trail**, keep rendering
XSS-safe, and have a takedown clear the public site **within one build cycle**
(and immediately from the live island). Three roles — reader / author / curator —
sourced from a declared, auditable place.

**Critical framing — most of the substrate already shipped in 177–179.** This
phase is NOT a greenfield moderation build. Already in place and LOCKED (do not
rebuild or re-decide):

- **Role source** = committed `data/roles_allowlist.toml` (login → `author`/`curator`);
  git history IS the audit trail (177 D-07). Curator entries already exist
  (`rainhead = "curator"`). **MOD-01's "declared, auditable place" is satisfied.**
- **Status enum** `approved`/`pending`/`removed`; **harvest AND `/api/notes` read
  both scope to `status='approved'`** — anything non-approved already vanishes
  from both the baked `notes.json` and the live island (the MOD-02/MOD-04
  substrate). See `api/main.py:519` and the harvest (`data/notes_harvest*`).
- **XSS sanitize-on-write** (`nh3` via `render_note_markdown`) + escape-on-render
  (179-01); **audit fields** `author_id`/`status`/`created_at`/`updated_at` +
  append-only `note_revisions` ledger (177). **MOD-03 is largely verification,
  not new build.**

**The actual gap this phase closes:** `api/main.py` `edit_note`/`delete_note`
hard-`403` any non-owner (`note.author_id != identity["uid"]`), so a curator
cannot act on another author's note. There is no `isCurator` on the client and
no curator control in the island. Phase 180 = the curator-override authz path +
its UI + end-to-end verification.

**Scope guardrail (roadmap):** allowlist + author-vs-curator check + curator
takedown. **NOT** a pre-moderation queue, reader flagging/voting, or a
moderation workbench — all explicitly deferred (see REQUIREMENTS.md
"Future Requirements → Moderation depth").

</domain>

<decisions>
## Implementation Decisions

### Takedown UI surface (MOD-02)
- **D-01:** The curator takedown control is **inline on the species-page
  `<bee-notes>` island** — a "Take down" button on each note, shown only when the
  signed-in user is a curator, alongside the owner's existing edit/delete
  controls. Reuse the existing island; no separate page/view.
- **D-02:** **Reactive moderation only.** A curator acts on notes they view on a
  species page. NO global "needs moderation" discovery list / workbench (that is
  the deferred workbench; matches the allowlist-trust model where abuse is rare
  and tips come out-of-band).
- **D-03:** The client needs an **`isCurator`** signal on `AuthState` (today
  `src/auth-client.ts` carries `role` + `isAuthor` but no curator boolean). The
  server already exposes the fresh `role` via `/auth/whoami` + `/api/write-check`
  (`_fresh_role`, re-read from the allowlist per request, D-05 revocation) — the
  client derives `isCurator` from `role === 'curator'`. Curator-only controls are
  a UX affordance; **authz is always re-checked server-side** (never client-trusted).

### Backend override shape (MOD-02)
- **D-04:** Curator override is a **dedicated curator-only endpoint**
  `POST /api/notes/{id}/takedown`. The existing owner-only `DELETE`/`PATCH`
  routes stay untouched (their load-before-ownership IDOR guards remain simple).
  Guard it with `@auth.require_author` **plus** a fresh curator-role check
  (mirror `_fresh_role` / `_is_author_fresh`) — re-read the allowlist per request,
  never trust the cookie's baked role.
- **D-05:** **Takedown-only.** A curator can hide/restore any note but **cannot
  edit another author's content**. Authors retain sole ownership of their words;
  the curator is a safety valve, not an editor. (Matches roadmap "hide/take down
  any note"; edit-any is NOT required by MOD-01..04.)

### State & reversibility (MOD-02, MOD-04)
- **D-06:** Takedown is **reversible** via a distinct **`hidden`** status
  (separate from author self-delete `removed`). Both are non-`approved`, so both
  are already excluded by the existing harvest/read scoping — a takedown clears
  the live island (next poll) and baked `notes.json` (next build) **by
  construction** (satisfies MOD-04). Keeping `hidden` distinct from `removed`
  preserves the author-delete vs curator-takedown distinction at the status level.
- **D-07:** **Restore is operator-only** — a curator-only `POST /api/notes/{id}/restore`
  route (sets `status` back to `approved`, appends `action='restore'`) that is
  **NOT wired to any UI**; the operator hits it via curl. Rationale: the read
  endpoint must **never** return hidden content (no leak, island stays simple),
  so there is no inline surface from which to restore. This is a deliberate
  asymmetry: takedown has inline UI, restore does not. (Prefer an authz-guarded
  route over raw DB surgery.)

### Audit / reason capture (MOD-03)
- **D-08:** A takedown records a **distinct ledger action** in `note_revisions`:
  `action='takedown'` (and `action='restore'` for a restore), with
  `editor_id` = the **curator's** uid — so the ledger shows a curator acted, not
  the author. This is the auditable trail MOD wants, over reusing `action='remove'`.
- **D-09:** A takedown accepts an **optional free-text `reason`** (empty allowed),
  stored on the `note_revisions` row. Likely needs a **nullable `reason` column
  on `note_revisions`** — a forward-only Alembic migration (next revision after
  0003; the store is SQLite-on-maderas, `render_as_batch=True`, `downgrade()`
  raises `NotImplementedError` per the 177 guard). **Flag for research/planning.**
- **D-10:** **Attribution lives in the ledger row only.** No new `moderated_by`/
  `moderated_at` columns on the `notes` table — `note_revisions` (editor_id +
  revised_at + action) is the append-only source of truth; the note keeps its
  existing `status`/`updated_at`.

### MOD-03 verification (mostly pre-shipped)
- **D-11:** XSS sanitization and audit fields are already implemented (179-01 /
  177). This phase **verifies** them (a `<script>`/`onerror=` payload renders
  inert; every note carries the four audit fields) rather than rebuilding. New
  work here is limited to ensuring the takedown/restore paths also append their
  ledger rows.

### Claude's Discretion
- Exact HTTP status codes / response shapes for takedown & restore (mirror the
  existing note routes: 200 on success, 404-before-403 load ordering, Origin +
  launch-gate via `require_author`).
- Button copy / placement details in the island (follow the existing
  `.note-btn` / `.note-btn--primary` conventions; note 179-05: island hides
  "Add note" while any editor is open).
- Whether the curator "Take down" appears on the curator's OWN notes too (they
  already have owner delete; low stakes either way).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — MOD-01..04 (and "Future Requirements →
  Moderation depth" for the explicit deferrals: pre-moderation queue, reader
  flagging, edit-history UI).
- `.planning/ROADMAP.md` §"Phase 180: Moderation Loop" — goal, success criteria,
  scope guardrail ("NOT a workbench"), UI hint: yes, end-to-end human UAT gate
  (do NOT auto-advance past UAT).

### Write layer / API (where the new endpoints land)
- `api/main.py` — note CRUD + read routes: `create_note` (~349), `edit_note`
  (~397), `delete_note` (`status='removed'` soft-delete, ~443),
  `list_notes_for_species` (`status='approved'` scoping, ~490+), `_fresh_role`
  (~142), `write_check` echoing fresh role (~307). The takedown/restore routes
  slot in here.
- `api/auth.py` — `require_author`, `_current_roles`/`_is_author_fresh` (fresh
  allowlist re-read per request, D-05 revocation), Origin check, WRITE-04 launch
  gate. Model the curator check on `_is_author_fresh`.
- `data/roles_allowlist.toml` — the declared role source (login → author/curator);
  git history = audit trail. MOD-01 anchor.
- `api/README.md` — dev loop; systemd-user + Waitress + mod_proxy deployment
  context.

### Store / migrations (for the reason column)
- 177 migration conventions: `render_as_batch=True` globally in `env.py`;
  `downgrade()` raises `NotImplementedError` (Pitfall-4 guard); migration 0003
  added `body_html` + `author_id` FK. Next revision (0004) adds nullable
  `note_revisions.reason`.
- Memory `project_store_tech_sqlite_on_maderas` — SQLite on maderas, forward-only
  Alembic, snapshot backups.

### Frontend island
- `src/bee-notes.ts` — the `<bee-notes>` island: `_isAuthor` gate (line ~93),
  edit/delete controls, live re-fetch after write (D-02 pattern), `note-btn`
  conventions. Curator "Take down" wires in here.
- `src/auth-client.ts` — `AuthState` (`role`, `isAuthor`); add `isCurator`
  derivation (`role === 'curator'`).
- `src/bee-header.ts` — whoami badge (author/guest); reference for how role is
  surfaced in chrome.

### Feature / harvest context
- 179-CONTEXT.md + `.planning/phases/179-notes-feature-harvest-build-time-bake/`
  — the notes feature + harvest→bake this phase moderates.
- Memory `feedback_reuse_display_name_resolution` — bylines reuse the existing
  `inat_login → display_name` resolution; do not build a second name system
  (relevant if the takedown UI shows author names).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`note_revisions` append-only ledger** (177) — already the audit substrate;
  takedown/restore append rows here (`action` + `editor_id` + `revised_at`),
  plus the new optional `reason`.
- **`status`-based soft-delete pattern** (`delete_note`, `status='removed'`) —
  the takedown reuses this shape with a new `hidden` value; harvest + read
  scoping (`status='approved'`) already excludes it, so MOD-04 needs no new
  read/harvest plumbing.
- **`_fresh_role` / `_is_author_fresh`** (fresh allowlist re-read per request) —
  the curator authz check is a direct sibling; no new role infrastructure.
- **`require_author` decorator** — session verify + allowlist recheck + Origin +
  launch gate; the takedown/restore routes stack a curator check on top.
- **`<bee-notes>` island + live re-fetch (D-02)** — after a takedown, the same
  re-fetch drops the note from the curator's own view immediately.

### Established Patterns
- **Load-before-ownership (T-179-IDOR)** — routes `db_session.get(Note, id)`
  first, then check authz (404 before 403). The takedown route follows the same
  ordering with a curator check instead of an owner check.
- **Server-derived identity only (D-08, T-179-AUTHZ)** — never trust a
  client-supplied author/role; `editor_id` on the takedown ledger row is
  `g.identity["uid"]`, the curator's server-derived uid.
- **Fresh-role re-read (D-05 revocation)** — a demoted curator loses power on the
  very next request; the takedown route must re-read the allowlist, not trust the
  cookie.
- **Read endpoint never leaks non-approved** (D-10/T-179-LEAK) — preserved:
  `hidden` notes are excluded exactly like `pending`/`removed`; restore-visibility
  is intentionally NOT added to the read endpoint (D-07).

### Integration Points
- New `POST /api/notes/{id}/takedown` and `POST /api/notes/{id}/restore` in
  `api/main.py`.
- New nullable `reason` column on `note_revisions` (Alembic 0004).
- `isCurator` on `src/auth-client.ts` `AuthState`; "Take down" control in
  `src/bee-notes.ts`.
- **No harvest/bake change** — status scoping already handles exclusion. Verify,
  don't modify.

</code_context>

<specifics>
## Specific Ideas

- Takedown ledger action is literally `'takedown'`; restore is `'restore'`
  (distinct from the author-delete `'remove'`) — this verb distinction is the
  point of the auditable trail.
- Restore is deliberately UI-less / curl-only; the read endpoint's "never return
  non-approved" invariant is more important than restore-UX symmetry.
- MOD-04 UAT is an explicit end-to-end walkthrough: author submits → note
  publishes (live island now; baked next build) → curator takes it down → note
  gone from live island immediately and absent from the next baked `notes.json`.
  Roadmap: **human UAT gate, do NOT auto-advance past UAT.**

</specifics>

<deferred>
## Deferred Ideas

- **Discovery / moderation workbench** — a cross-species list of notes needing
  attention. Deferred (roadmap scope guardrail); reactive-per-species-page is v1.
- **Inline restore UI** — surfacing hidden notes to curators for one-click
  restore. Deferred to keep the read endpoint leak-free (D-07); operator curl is v1.
- **Pre-moderation queue, reader flagging/voting, edit-history/revision UI** —
  all in REQUIREMENTS.md "Future Requirements → Moderation depth"; add only if
  abuse/quality issues emerge.
- **`notes-guest-freshness-gap`** (todo) — guest-visible up-to-24h lag between a
  live-posted note and its baked appearance. Reviewed, NOT folded: it is a
  read-path freshness concern (write-triggered rebuild / public runtime read),
  explicitly deferred to a later milestone; orthogonal to moderation. MOD-04's
  "within one build cycle" is the *same cadence* and is acceptable here.

### Reviewed Todos (not folded)
- `notes-guest-freshness-gap.md` — deferred (read-path freshness, later milestone;
  not a moderation concern).
- `144-code-review-deferred.md`, `165-code-review-deferred.md` — unrelated
  (CSV-export / Phase 165 findings); non-blocking, carried in STATE.md.

</deferred>

---

*Phase: 180-moderation-loop*
*Context gathered: 2026-07-04*

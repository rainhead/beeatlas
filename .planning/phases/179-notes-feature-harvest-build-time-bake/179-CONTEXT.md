# Phase 179: Notes Feature + Harvest → Build-Time Bake - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

The first user-visible authoritative slice. Two coupled threads:

1. **Notes CRUD feature** — an allowlisted author creates, edits, and deletes
   attributed WA-specific natural-history notes on a species page, consuming the
   Phase-178 write layer (`api/`, `@require_author`, session cookie, allowlist
   recheck). New note endpoints extend the existing write API.
2. **Harvest → build-time bake** — published notes are harvested nightly into a
   build-time `notes.json` (an exact structural mirror of the Phase-175
   `species_hosts.js` bake) and rendered on species pages as an attributed,
   stacked list with a graceful empty state. The read path stays 100% static and
   offline-safe.

Covers NOTES-01, NOTES-02, NOTES-03, and **NOTES-04 (in scope — see D-02)**.

**Out of scope:** the moderation loop (curator role source, deploy-free takedown,
XSS-payload-renders-inert acceptance, audit-field completeness) — Phase 180.
Phase 179 *does* sanitize-on-write (D-06) and *does* soft-delete via the audit
ledger (D-07), so Phase 180 hardens rather than retrofits.

</domain>

<decisions>
## Implementation Decisions

### Authoring surface (NOTES-01, NOTES-02)
- **D-01:** **Inline hydrating island.** The notes `<section>` on
  `_pages/species-detail.njk` IS the JS island. For a guest / anon / no-JS
  reader it renders the baked static list from `notes.json` (offline-safe, the
  always-present source of truth). For a signed-in allowlisted author it
  hydrates: an "Add note" affordance expands an inline editor *in place*, and
  each of the author's own notes grows edit/delete controls. One surface, reuses
  the render location. NOT a modal, NOT a separate compose route.
- **D-02:** **NOTES-04 live-island ships in 179.** After a successful
  create/edit/delete the island re-fetches this species' notes from the write
  API and re-renders immediately, so the author sees their change before the
  next nightly build refreshes `notes.json`. The baked static list remains the
  offline/no-JS source of truth — the island is pure enhancement, never the sole
  display path. Marginal cost is low because the authoring island already exists.
  **Consequence:** the write API needs a **read endpoint** returning a species'
  notes for the island to render (see D-08).

### Note format & sanitization (NOTES-01)
- **D-03:** **Restricted markdown**, not plain text. A small safe subset —
  emphasis (bold/italic), links, and basic block structure (paragraphs/lists).
  Natural-history notes benefit from a linked reference or emphasis.
- **D-04:** **Store markdown source + render sanitized HTML once, server-side.**
  The write endpoint keeps the raw markdown (`body_md`, for future editing) AND
  produces sanitized HTML (`body_html`) a single time in Python. Both `notes.json`
  (harvest) and the island's read endpoint serve the pre-rendered **safe HTML**,
  so there is exactly ONE markdown renderer (Python, in the API/harvest) and the
  browser injects trusted HTML — **no markdown library shipped to the client.**
- **D-05:** Adding `body_html` (keeping the existing `body` as the markdown
  source, or renaming to `body_md`) is a **forward-only Alembic migration owned
  by the write-layer deploy** (177 D-03; `run.py`/nightly never migrates).
- **D-06:** **Sanitize on write in 179** (store clean content) PLUS
  escape/allowlist on render — defense in depth from day one. The stored HTML is
  already safe, so the Phase-180 XSS backstop (MOD-03) hardens rather than
  rescues. The markdown→HTML step needs a tag/attribute allowlist regardless of
  Phase 180.

### CRUD & delete semantics (NOTES-02)
- **D-07:** **Soft-delete.** DELETE sets `notes.status='removed'` and appends a
  `note_revisions` row (`action='remove'`); the note row and its history survive.
  Harvest excludes non-`approved`, so a deleted note drops from the public site
  the next build and from the live island immediately. This is the same mechanism
  Phase-180 curator takedown will use — no retrofit. Edit appends a
  `note_revisions` row (`action='edit'`); create appends `action='create'`.
- **D-08:** **Ownership + author_id wiring.** `notes.author_id` references the
  BeeAtlas-internal user id (D-07 of Phase 178; FK → `users.id`). Edit and delete
  require the **server-derived session uid to equal `note.author_id`** — an author
  acts only on their own notes. Curator override (acting on others' notes) is
  Phase 180. Any client-supplied author field is never consulted (D-07 of 178).

### Harvest & byline (NOTES-03)
- **D-09:** **Harvest = a new build-time script under `data/`**, reading the
  store **read-only in WAL** (177 D-16), emitting `notes.json`. Runs in the
  nightly pipeline; declared **`authoritative` + `build_time_fetch=true`** in
  `data/artifacts.toml` (Phase-176 contract; `authoritative` ⇒ never a dbt model,
  `baseline_diff=false`, forward-only). **Never commit `notes.json`** — it ships
  via S3 + `manifest.json` + `deploy.yml` fetch (memory
  `feedback_no_committed_data_artifacts`).
- **D-10:** **Scope = `status='approved'` only** (`pending`/`removed` excluded,
  matching the MOD-02 harvest exclusion). **Order = newest first** (`created_at`
  desc) — latest note on top.
- **D-11:** **Byline reuses the existing `display_name` resolution — no second
  name system** (feedback `feedback_reuse_display_name_resolution`). The harvest
  joins the author's `inat_login` (via `users`) to the collector `display_name`
  that `data/collectors_export.py` already derives (`arg_max(recordedBy, year)`,
  `@login` fallback), re-derived each build so it stays current.
- **D-12:** **Byline links to `/collectors/<login>/` when that login has a
  collector page** (most allowlisted authors are WABA collectors and will), else
  the name renders as **plain text**. The harvest runs after `collectors_export`,
  so the "has a collector page" login set is available at build time.
- **D-13:** **`notes.json` shape mirrors `species_hosts.json`:** a
  `Record<canonical_name, Note[]>` where `Note` ≈
  `{ id, html, byline: { display_name, login, collector_url|null }, created, updated }`.
  Consumed by an absence-tolerant `_data/notes.js` loader (exact mirror of
  `_data/species_hosts.js`) returning `{}` when the file is absent or unparseable,
  so `npm run dev` / `npm test` / CI build all succeed pre-first-nightly.

### Claude's Discretion (planner/researcher, within guardrails)
- **Exact markdown renderer + HTML sanitizer** (Python) — planner's call within
  D-03/D-04/D-06. Restricted subset must at minimum allow emphasis + links +
  basic blocks; links restricted to `http(s)` with `rel="noopener"`; output must
  survive a `<script>`/`onerror=` payload as inert. (e.g. markdown-it-py or
  mistune + nh3/bleach — planner verifies against current maintenance.)
- **REST endpoint shapes** — planner's call. Lean: `POST /api/notes`,
  `PATCH /api/notes/<id>`, `DELETE /api/notes/<id>` (all `@require_author`), and a
  read endpoint for the island returning a species' approved notes (D-02/D-08).
  Confirm the read endpoint's auth model — public read is acceptable since the
  same notes are baked publicly, but scope to `approved` server-side regardless.
- **Empty-state behavior** — planner's call within "graceful empty state"
  (NOTES-03). Sensible default: most of ~560 species have no notes, so a guest
  sees no empty box (render the section only when notes exist); a signed-in author
  still gets the "Add note" affordance on an otherwise-empty species. Confirm in
  UAT.
- **Note length / rate limits** — planner's call; not a locked requirement.
- **`body` column handling** — keep `body` as the markdown source or rename to
  `body_md`; planner's call within the forward-only migration (D-05).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The two patterns this phase mirrors (READ FIRST)
- `data/species_export.py` — the `species_hosts.json` producer; the harvest
  script is a structural mirror (build-time JSON emit, sort/order on the producer
  side, `authoritative`-vs-`derived` aside).
- `_data/species_hosts.js` — the absence-tolerant `_data/*.js` loader to mirror
  as `_data/notes.js` (default-export only; returns `{}` when file absent).
- `_pages/species-detail.njk` §`collected-from` (lines ~60–72) — the exact
  `table[sp.canonical_name]` render pattern the notes section follows; this file
  is also where the authoring island mounts (D-01).
- `data/artifacts.toml` — the Phase-176 artifact contract; add the `notes`
  artifact here (`authoritative`, `build_time_fetch=true`). `species_hosts` is the
  nearest (derived) precedent to copy structurally.

### Phase-178 write layer (the API this feature consumes)
- `api/main.py` — Flask app + existing routes (`/auth/*`, `/api/write-check`); the
  `/api/write-check` `@require_author` no-op is the template for note endpoints.
- `api/auth.py` — `require_author` decorator (session verify + fresh allowlist
  recheck + Origin check + WRITE-04 launch gate); every note write passes through
  it. `_fresh_role` re-reads role from the allowlist (D-05 of 178).
- `api/users.py`, `api/session.py`, `api/oauth.py`, `api/config.py` — identity /
  session / OAuth / config wiring.
- `src/auth-client.ts` — frontend client (`fetchWhoami`/`startSignIn`/`signOut`,
  `API_BASE`, `credentials: 'include'`); the species-page island reuses this for
  auth state and extends it with note CRUD calls.
- `src/bee-header.ts` — the shipped sign-in/whoami/sign-out UI (currently on the
  SPA); the species page must obtain auth state (reuse `auth-client.ts`; the
  header itself is already imported by `src/entries/taxon-page.ts`).
- `src/entries/taxon-page.ts` — the Vite entry for species-detail; the authoring
  island registers here.
- `.planning/phases/178-thin-write-layer-inat-oauth/178-CONTEXT.md` — D-01
  (server-side PKCE), D-04/D-05 (long session + per-write allowlist recheck),
  D-07/D-08/D-09 (internal-id authorship key, `users` table, allowlist keys on
  login), D-17 (Waitress + `mod_proxy`).

### Phase-177 store (what the harvest reads and the API writes)
- `data/notes_store/models.py` — `Note` (`canonical_name`, `author_id`, `body`,
  `status`['approved'/'pending'/'removed'], `created_at`, `updated_at`),
  append-only `NoteRevision` (`action` 'create'/'edit'/'remove'), `User`. The
  `body_html` column + `author_id`→`users.id` FK are added here (D-05/D-08).
- `data/notes_store/db.py` — WAL engine factory (read-only WAL read for harvest).
- `data/notes_store/roles.py` — committed allowlist loader (authz reads this).
- `data/notes_store/migrations/` — forward-only Alembic env; the `body_html`
  migration lands here.
- `.planning/phases/177-authoritative-store-migrations-backup-dr/177-CONTEXT.md`
  — D-05/D-06/D-08 (notes/revisions/status schema shaped for moderation), D-16
  (harvest reads store read-only in WAL).

### Attribution (reuse, do not rebuild)
- `data/collectors_export.py` (lines ~47–57) — the `display_name` resolution
  (`arg_max(recordedBy, year)` + `@login` fallback) the byline reuses (D-11).
- `_pages/collector-detail.njk` — the `/collectors/<login>/index.html` permalink
  the byline links to when present (D-12).
- Memory `project_collector_identity_prefers_host` — display_name = most-recent
  `recordedBy`; the collector-identity nuance behind the reused resolution.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — NOTES-01..04 (NOTES-04 in scope per D-02).
- `.planning/ROADMAP.md` Phase 179 — goal, success criteria, and the "harvest =
  exact mirror of species_hosts, no `--research-phase` for harvest/render" note.
- `docs/adr/0002-derived-vs-authoritative-artifacts.md` — the `authoritative`
  regime `notes.json` falls under (via `data/artifacts.py`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_data/species_hosts.js` + `_pages/species-detail.njk` render block — copy
  structurally for `_data/notes.js` and the notes section.
- `data/species_export.py` — build-time JSON emit precedent for the harvest.
- `api/main.py` `/api/write-check` (`@require_author`) — the note-endpoint template.
- `src/auth-client.ts` — auth state + fetch-with-credentials for the island.
- `data/collectors_export.py` `display_name` + `/collectors/<login>/` pages —
  byline reuse (no new name system).

### Established Patterns
- Notes key on `canonical_name` (matches `species_hosts`, `species_traits`).
- Absence-tolerant `_data/*.js` loaders (default-export only) keep dev/test/CI
  green before the first nightly produces the artifact.
- Authoritative artifacts (`data/artifacts.toml`) are forward-only, never dbt
  models, `baseline_diff=false`, never committed to git.
- The write layer owns Alembic migrations (177 D-03) — the `body_html` migration
  runs there, never from `run.py`/nightly.
- Read path stays static/offline-safe; the island is enhancement over a baked
  source of truth (aligns with the PWA offline cold-start work,
  `project_pwa_offline_cold_start`).

### Integration Points
- Note write endpoints sit behind `api/auth.py:require_author` (session + fresh
  allowlist recheck + Origin + launch gate).
- Harvest joins `notes` → `users` (byline) and consults the collectors set
  (collector-page link); it runs **after** `collectors_export` in the pipeline.
- `notes.json` publishes through the Phase-176 `data/artifacts.py` contract
  (nightly publish/manifest + `deploy.yml` build-time fetch).
- The authoring island mounts on `species-detail.njk` via `src/entries/taxon-page.ts`.

</code_context>

<specifics>
## Specific Ideas

- "We currently display full names for collectors when we have them. Why would we
  build a second system?" — the byline must reuse the existing `inat_login` →
  `display_name` resolution, not a new users-table display name (D-11; saved as
  feedback `feedback_reuse_display_name_resolution`).
- The notes section IS the island: static for readers, hydrates for authors —
  one surface, mounted where the notes render (D-01).
- Render trusted server-sanitized HTML on both paths; never ship a markdown
  renderer to the browser (D-04).

</specifics>

<deferred>
## Deferred Ideas

- **Full XSS acceptance + curator takedown + role source + audit-field
  completeness** — Phase 180 (MOD-01..04). 179 lays the mechanism (sanitize on
  write, soft-delete via the ledger, `status` scoping) that 180 hardens.
- **Real/display name captured from iNat onto the users table** — explicitly
  rejected as a redundant second attribution system (D-11); reuse `display_name`.
- **Note revision/edit-history UI** (diff/revert) — deferred (REQUIREMENTS
  "Future Requirements"); the append-only `note_revisions` ledger + timestamps
  cover the data need for now.
- **Reviewed todos (not folded):** `144-code-review-deferred`,
  `165-code-review-deferred`, `rebuild-source-into-facets` — surfaced by the
  todo-matcher on the generic keyword "phase" only; none touch notes/harvest
  scope, so not folded.

</deferred>

---

*Phase: 179-notes-feature-harvest-build-time-bake*
*Context gathered: 2026-07-04*

# Phase 178: Thin Write Layer + iNat OAuth - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up the authenticated, authorized **write layer** on top of the Phase-177 store, while the read path stays 100% static. Deliverables:

- iNaturalist OAuth2 login that derives identity **server-side** and mints BeeAtlas's **own** long-lived app session.
- Author **allowlist** authorization (only allowlisted experts may write) + CSRF/origin protection on the write endpoint.
- A minimal **"Sign in with iNaturalist" + whoami** UI proving auth end-to-end (WRITE-01..03). No note CRUD UI.
- The WRITE-04 launch gate satisfied against the already-demonstrated Phase-177 restore.

Covers WRITE-01..04. **Out of scope:** note create/edit/delete UI + the harvest→bake (Phase 179), the moderation loop (Phase 180).

### ⚠ Architecture carried forward from Phase 177 (NOT re-litigated)
The write layer is a **maderas-hosted Flask (WSGI) app served via Apache `mod_fcgid`** — the shape locked by 177's **D-01** and already reflected in `data/notes_app/main.py` (health skeleton, docstring names the remaining 178 work: `.fcgi` wrapper + `api.beeatlas.net` vhost). The ROADMAP's Phase-178 text and WRITE-01/WRITE-02 requirement wording still describe the **rejected** "API Gateway HTTP API + Lambda / event-driven / within the CDK stack / short-lived session" shape. That is stale AWS framing from before the D-01 pivot. **A ROADMAP/REQUIREMENTS re-scope edit is a pre-planning action** (see Deferred Ideas) — the maderas-Flask shape is authoritative.

</domain>

<decisions>
## Implementation Decisions

### OAuth client model (WRITE-02)
- **D-01:** **Server-side authorization-code exchange, WITH PKCE.** Flask holds the iNat `client_secret`; the browser only carries the one-time `code` back to a Flask callback, which exchanges it server-side (PKCE `code_verifier`/`challenge` as defense-in-depth), calls `/v1/users/me` for identity, then **discards the iNat token** and mints BeeAtlas's own session. No secret in the client bundle; no iNat token in `localStorage`/URL; identity-only OAuth scope.
- **D-02:** **PKCE support is confirmed** against the live iNat OAuth provider (Doorkeeper supports Authorization Code + PKCE). The researcher must still validate the exact end-to-end request/response shape against the **live iNat OAuth docs / actual endpoints** — **NOT** by reading the local `~/dev/inaturalist/` source clone (explicit user constraint). Carry a plain (no-PKCE) server-side exchange as the fallback if live behavior differs.
- **D-03:** iNat's own token lifetimes do **not** gate re-login: the `/users/api_token` JWT expires in 24h and the OAuth access token is only used to fetch it, but we use iNat **once at login** and thereafter rely solely on our own session. Session TTL is entirely ours.

### App session mechanism (WRITE-02)
- **D-04:** **One long-lived, stateless signed cookie.** `HttpOnly` + `Secure` + `SameSite` cookie carrying a signed (itsdangerous or JWT) payload `{internal user id, iNat identity, role, long expiry — e.g. weeks}`. No server-side session store (fits `mod_fcgid`'s ephemeral, no-shared-memory workers). Rationale: "no great threat; don't make people log in often."
- **D-05:** **Revocation = per-write allowlist recheck.** Because the cookie is long-lived, every write request re-reads the committed allowlist TOML; removing someone from the allowlist revokes their write ability at the next request regardless of cookie age. This is the security property that replaces WRITE-02's "short-lived session" wording.
- **D-06:** [informational] **No half-logged-in / step-up tier in 178.** The two-tier "identity cookie + elevated write token" idea was considered and deferred — notes are the only sensitive op and no preferences feature exists yet. Not a build decision (a deliberate non-goal); see Deferred Ideas.

### Identity & allowlist keying (WRITE-03)
- **D-07:** **BeeAtlas mints its own internal integer user id**, which is the authorship key: `notes.author_id` → internal user id. iNat login and iNat numeric id are stored as **properties** of the user, not the authorship key. This decouples long-lived attribution from mutable iNat logins.
- **D-08:** This requires a **`users` table in the store**, added via a **forward-only Alembic migration owned by the write-layer deploy** (consistent with 177 D-03; `run.py`/nightly never migrates). Columns at least: internal id (PK), iNat numeric id, iNat login, created/updated. First successful login creates the row (mint internal id, record iNat login + numeric id).
- **D-09:** The **committed allowlist (177 D-07) keys on iNat login.** It authorizes someone at first login, before their internal id exists, so it must gate on an iNat identity; login is chosen for human-readability and to match the existing `collector_inat_login`/`host_inat_login` convention. The iNat **numeric id is also captured** on the users row for robustness. Accepted small risk: an iNat login rename drops a user from the allowlist until a curator updates the TOML (list is tiny, hand-curated).

### 178 frontend scope (UI hint: yes)
- **D-10:** **Sign-in + whoami only.** A "Sign in with iNaturalist" entry point that runs the OAuth round-trip and establishes the session cookie, plus a minimal signed-in indicator (whoami: iNat login + allowlisted-or-not) and sign-out. **No note CRUD UI** — that is Phase 179. This is the 178/179 seam the security UAT drives against.

### Deployment topology & OAuth app (added 2026-07-03, post-research)
- **D-11:** **Serving topology = the `api.beeatlas.net` subdomain** (as `178-RESEARCH.md` designed): a direct Route53 A-record to maderas (`45.79.96.48`) + certbot TLS, with the Flask app behind Apache `mod_fcgid`. The static `beeatlas.net` site calls it **cross-origin but same-site** (shared registrable domain), so CORS is real (`flask-cors` scoped to the exact `https://beeatlas.net` origin, credentials enabled, never wildcard+credentials) but `SameSite=Strict` cookies still work. CloudFront path-routing to maderas was considered and rejected.
- **D-12:** **OAuth app is registered and credentials are provisioned** (client_id + client_secret ready). **Redirect URI (exact-match pin) = `https://api.beeatlas.net/auth/callback`.**
- **D-13 — OPERATOR ACTION: ✅ DONE 2026-07-03.** The iNat app's registered redirect URI was reconfigured to `https://api.beeatlas.net/auth/callback` (confirmed by operator), matching D-11/D-12. The redirect URI is an exact-match value — keep the plan's pinned constant `https://api.beeatlas.net/auth/callback` and re-verify it in the security UAT.
- **D-14:** Secrets live in a **new gitignored `api/secrets.toml`** (root `.gitignore` covers `api/secrets.toml` + `secrets.toml`), mirroring the `data/.dlt/secrets.toml` Ecdysis pattern — never committed, never in the client bundle. **Already seeded** with the provisioned public `client_id` + the `redirect_uri`; `client_secret` and the session `signing_key` are `REPLACE_ME` placeholders for the operator to fill. Public OAuth `client_id` = `aNEKxpEJ5mFJvSZOS0qFZK6-hq_700d7hIs8zDaxKEg` (not a secret — appears in the authorize redirect).

### Code layout & framing — this is BeeAtlas's auth + write API, NOT a "notes app"
- **D-15:** **The write/auth service lives in a top-level `api/` directory**, NOT under `data/` (the derived-pipeline dir) and NOT framed as a "notes app." Phase 178 is **app-level infrastructure** — iNat sign-in, a `users` table, app sessions, an allowlist, CSRF, and the authenticated write endpoint. **Notes are merely the first feature to consume it** (Phase 179). The 177 Flask skeleton `data/notes_app/main.py` (health route) **moves to `api/`**; new 178 code lives in `api/`. Placing the authoritative write side outside `data/` also reinforces the STORE-04 isolation story. See memory `project_write_layer_is_app_api`.
- **D-16:** The store **stays at `data/notes_store/`** for now (177-committed; migrations env, tests, and `backup_notes.py` reference it) — relocating it under `api/` is optional future cleanup, not required by 178. The API owns its Alembic migrations (177 D-03); the new `users` table migration is added under the existing `data/notes_store/migrations/`.

### Claude's Discretion (planner/researcher, within guardrails)
- **CSRF/origin protection (WRITE-03):** planner's call among `SameSite` + Origin/Referer check vs. double-submit token vs. both — the guardrail is that a **cross-origin POST and a forged-author request must both be rejected** (security UAT). User declined to lock the mechanism.
- **WRITE-04 launch-gate encoding:** planner's call. The Phase-177 restore is already demonstrated (177-07, PASS). Note that writes are **never truly "public"** — the allowlist gates every write — so WRITE-04 is plausibly satisfied by the allowlist gate + the documented restore rather than a separate feature flag. Confirm the encoding during planning.
- Exact signing library (itsdangerous vs JWT), cookie name, and session TTL value — planner's call within D-04.
- The `.fcgi` wrapper + `api.beeatlas.net` vhost details (named in `notes_app/main.py`) — planner/operator's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iNat OAuth (verify against LIVE endpoints/docs — NOT the local clone)
- `https://www.inaturalist.org/pages/api+reference` — OAuth2 (Doorkeeper) auth section: Authorization Code + **PKCE** support, `/oauth/authorize`, `/oauth/token`, `/users/api_token` (JWT, 24h), `/v1/users/me`. **Confirm PKCE end-to-end here (or against the live endpoints), NOT by reading `~/dev/inaturalist/`.**
- `https://www.inaturalist.org/pages/api+recommended+practices` — auth recommended practices.
- **Constraint:** Do NOT read or depend on the `~/dev/inaturalist/` source checkout for OAuth behavior (explicit user directive) — the deployed provider is the source of truth.

### Phase-177 store (the dependency this layer writes to)
- `.planning/phases/177-authoritative-store-migrations-backup-dr/177-CONTEXT.md` — D-01 (SQLite-on-maderas/Flask/Apache — the write-layer shape), D-03 (write-layer owns Alembic migrations), D-05..D-08 (notes/note_revisions schema, `status` enum, roles allowlist), D-12 (demonstrated restore = WRITE-04's gate).
- `data/notes_app/main.py` — the Flask WSGI skeleton to extend (health route today; 178 adds OAuth/session/write routes + `.fcgi` wrapper + vhost).
- `data/notes_store/models.py`, `data/notes_store/db.py`, `data/notes_store/roles.py`, `data/notes_store/seed.py` — existing store schema, WAL engine factory, committed roles-allowlist loader, seed script.
- `data/notes_store/migrations/` — Alembic env (forward-only; `render_as_batch=True`, `downgrade()` raises). The `users` table migration lands here.

### Requirements & roadmap (note the stale AWS wording)
- `.planning/REQUIREMENTS.md` — WRITE-01..04. **WRITE-01 ("event-driven, within the existing CDK stack") and WRITE-02 ("short-lived app session") carry pre-pivot AWS framing** — re-scope per D-01/D-04/D-05 (pre-planning edit).
- `.planning/ROADMAP.md` Phase 178 — success criteria SC-1 still says "API Gateway HTTP API + Lambda"; stale, superseded by the maderas-Flask shape.

### Infra / precedent
- `infra/lib/beeatlas-stack.ts` — the CDK stack. The write **app** runs on maderas, not in CDK compute; only touch CDK if a resource is genuinely needed (surgical edit only, never `cdk destroy` — memory `project_cdk_stack_composition`).
- Memory `project_store_tech_sqlite_on_maderas` — the D-01 pivot and the standing "178/179 need re-scope" note.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `data/notes_app/main.py` — Flask WSGI app skeleton, already `mod_fcgid`-shaped; extend with OAuth callback, session, and write routes.
- `data/notes_store/*` — schema (`notes` + append-only `note_revisions`), WAL engine factory, committed roles-allowlist loader (D-07/D-09 authz reads this), seed script, forward-only Alembic setup.
- The 177 backup/restore machinery (`data/backup_notes.py`) — already demonstrated; WRITE-04's gate references it, no rebuild needed.

### Established Patterns
- maderas is the sole runtime host, already behind Apache with TLS + a real domain — the write app sits alongside the nightly pipeline, no AWS compute added.
- Existing occurrence data keys people on iNat **login** (`collector_inat_login`/`host_inat_login`) — the allowlist login-key choice (D-09) matches this convention.
- `species_traits`/`notes` key on `canonical_name` for the species dimension (memory `project_taxon_id_milestone`) — unaffected here; 178 adds the *user* dimension.

### Integration Points
- Write layer owns Alembic migration runs (177 D-03) — the new `users` table migration runs here, never from `run.py`/nightly.
- Session cookie + allowlist recheck is the authz seam every write endpoint passes through.
- Phase 179 harvest reads the store read-only in WAL (177 D-16) — the `users`/`notes` join for bylines must be readable that way.

</code_context>

<specifics>
## Specific Ideas

- "Server side and PKCE. Very against code in `~/dev/inaturalist/`." — user's own framing: build the confidential+PKCE flow, and verify iNat OAuth behavior against the live provider, never the local iNaturalist source clone.
- "Our own integer id as key, iNat login as property of user." — user's framing of the identity model (D-07): internal id is authoritative for authorship, iNat identity is an attribute.
- "No great threat here... don't want people to log in often." — the rationale for the single long-lived session (D-04) over WRITE-02's short-session default.

</specifics>

<deferred>
## Deferred Ideas

- **ROADMAP.md + REQUIREMENTS.md re-scope for the D-01 pivot** — ✅ DONE 2026-07-03. WRITE-01/WRITE-02 and ROADMAP Phase-178 goal/SC-1/Notes were rewritten from the rejected AWS shape ("API Gateway + Lambda / event-driven / short-lived session") to the maderas-Flask/mod_fcgid + long-session model. (Was flagged in 177's CONTEXT deferred list; resolved as a pre-planning bookkeeping edit before planning executes.)
- **Half-logged-in / step-up auth** (identity cookie + elevated write token requiring fresh re-auth) — considered (D-06), deferred until a second sensitive surface or a preferences feature exists.
- **Server-side session store / explicit logout revocation** — deferred; per-write allowlist recheck (D-05) covers the revocation need without a store.

</deferred>

---

*Phase: 178-thin-write-layer-inat-oauth*
*Context gathered: 2026-07-03*

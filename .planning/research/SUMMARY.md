# Project Research Summary

**Project:** Washington Bee Atlas — v8.0 Authoritative Data Foundation
**Domain:** First authoritative, non-reproducible user-generated content (moderated expert species notes) + a thin write layer + iNat OAuth, layered onto a 100%-derived static AWS-CDK site with a nightly Python/dbt/DuckDB batch pipeline
**Researched:** 2026-07-02
**Confidence:** HIGH

## Executive Summary

v8.0 introduces the first data BeeAtlas cannot rebuild: WA-specific, expert-authored natural-history notes on species pages, with no iNat/Ecdysis upstream. Everything the site serves today is *derived* and reproducible — the DuckDB is a cache, `--delete` syncs are safe, and the bypass-and-rebuild schema-change dance costs at most one pipeline run. Authoritative notes break that invariant: losing them is unrecoverable and they cannot be diffed against a rebuildable baseline. The milestone's real weight therefore lands on **architecture**, not feature surface — the user-visible slice (a prose block per species) is deliberately thin so the derived-vs-authoritative refoundation gets the attention.

The research converges hard on a single recommended stack that fits the existing static + AWS-CDK + OIDC + Python-pipeline shop: **API Gateway HTTP API + Lambda (Python 3.14) + a managed relational store, forward-only Alembic migrations, iNaturalist OAuth2 PKCE for identity, and belt-and-suspenders backup (native PITR + nightly `pg_dump`/export into the existing S3 bucket).** Neon Serverless Postgres is the primary store recommendation (scale-to-zero, built-in PITR, branching, readable by *both* the Lambda writer and the nightly pipeline over TLS); **pure-AWS DynamoDB single-table is the one genuinely viable alternative** (zero non-AWS vendors, IAM-only access, native PITR — trading away SQL/Alembic). Lambda reintroduces a *runtime* but as event-driven functions, not the always-on heavy pipeline that got the earlier Function-URL Lambda retired.

The spine of the milestone is the **derived-vs-authoritative split**, made an explicit *declared property* so the two data classes never touch each other's machinery. A single declarative artifact contract — `data/artifacts.toml` + a tested `data/artifacts.py` loader — replaces today's triple hand-synced manifest lists (the `nightly.sh` publish block, the inline heredoc classifier, and `deploy.yml`'s jq fetch). Notes are classified `authoritative` → forced off the `test_dbt_diff` baseline gate, never a dbt model, never inside `beeatlas.duckdb`, physically fenced from `s3 sync --delete`. The read path stays 100% static: a nightly harvest bakes only `status='approved'` notes into a build-time `notes.json` (mirroring `species_hosts.js`), with an optional progressive live island for author immediacy. The dominant risks are all data-loss/liability shaped — the nightly rebuild wiping non-reproducible content, the schema-diff gate misfiring, hosting unmoderated UGC, and OAuth-in-a-SPA token leakage — each mapped to an owning phase below.

## Key Findings

### Recommended Stack

The read stack (TypeScript / Mapbox GL JS / Lit / wa-sqlite / hyparquet / dbt-duckdb / CDK / CloudFront / OIDC) is **fixed**; this milestone only adds a write/store/auth surface. Two constraints pick the stack: the store is **non-reproducible + backup-critical** (rules out "copy the file yourself" backups), and it must be readable by **two consumers** — the Lambda writer *and* the nightly Python pipeline that bakes approved notes into `species.json`/`notes.json` — which favors a SQL store the pipeline can query natively. See [STACK.md](./STACK.md).

**Core technologies:**
- **API Gateway HTTP API + Lambda (Python 3.14)** — the thin write layer (OAuth exchange, note CRUD, moderation transitions) — cheap, scale-to-zero, deploys through the existing CDK + GitHub-OIDC path; Lambda now matches the pipeline's Python 3.14 exactly.
- **Neon Serverless Postgres** — the authoritative relational store — real Postgres (satisfies "relational + forward-only migrations"), scale-to-zero (~$0 idle), built-in PITR + branching, reachable over TLS from both Lambda and maderas (no VPC). Databricks-backed → safe multi-year bet.
- **iNaturalist OAuth2 (Authorization Code + PKCE)** — identity — collectors already have iNat logins; no second identity system. PKCE is the public-client variant for secret-less SPAs; a `/users/api_token` JWT → `/v1/users/me` resolves identity server-side (note: node API wants raw `Authorization: <JWT>`, not `Bearer`).
- **Alembic (+ SQLAlchemy 2.0, psycopg 3.2)** — forward-only migrations — idiomatic Python for the dbt-shaped team; enforce forward-only by convention (`upgrade()` only), rehearse on a Neon branch, apply from the OIDC deploy job.
- **Backup/DR** — Neon PITR **plus** a nightly `pg_dump` into the existing versioned S3 bucket (store-independent logical insurance the team owns).

**The one viable alternative:** pure-AWS **DynamoDB single-table** — zero non-AWS vendors, no DB password anywhere (Lambda + maderas reach it via IAM), native PITR (1–35 days) + Export-to-S3. Trades away SQL/Alembic for versioned item-shape evolution. A defensible call if "no external vendor + IAM-only + native PITR" outranks "relational + SQL migrations." **Rejected:** Cloudflare D1 (second cloud, fights the AWS/CDK/OIDC shop), PocketBase/Aurora/RDS (always-on or VPC-heavy), Cognito/Auth0 (second identity system), any CMS/GraphQL/queue layer (massive overkill for one prose field), and **DuckDB-WASM** (already rejected project-wide for page weight — do not re-propose).

### Expected Features

The anchoring feature is a **deliberately thin vertical slice**: expert-authored WA-specific prose on species pages. The single most important design decision is the **moderation model** — research recommends **trusted-author (allowlist-gated) as the primary gate, with pre-moderation-before-publish for safety and curator takedown as the always-on control** — collapsing "moderation loop" from a subsystem into an allowlist + an author-vs-reader check + a curator delete/hide. Closest analogue: BugGuide's ~170 vetted contributing editors maintaining a single canonical Info page per taxon. Three roles: **reader (everyone), author (allowlisted), curator (can delete any note)**. See [FEATURES.md](./FEATURES.md).

**Must have (table stakes):**
- iNat OAuth login — real identity for attribution and the author gate
- Trusted-author allowlist (author vs. reader; curator as a second short list) — credibility without a full queue
- Create / edit own note (sanitized Markdown — paragraphs + italics for scientific names)
- Public species-page display with byline + updated-date + "WA Bee Atlas note" framing
- Graceful empty state (most of ~560 species will have none)
- Curator delete/unpublish — the entire moderation loop for v1
- Authoritative store + forward-only migrations + backup (the milestone core)

**Should have (competitive):**
- WA-specific locally-authored prose — *this is the differentiator* (no upstream has it)
- Provenance-first presentation reusing the Traits `*_source` visual language
- Multiple attributed author-owned notes per species (avoids any merge/version machinery)

**Defer (v2+):** edit/version history + diffs (only if authoring opens beyond the allowlist), a pre-moderation queue at scale, in-app public flagging, notes on higher taxa, runtime-fresh read path, notifications. **Anti-features (do NOT build):** comment threads/discussion on species pages, open anyone-can-author, full wiki with revisions, real-time collab, reactions/upvotes, rich-text/image uploads.

### Architecture Approach

Two subsystems, one publish seam. The derived pipeline (iNat/Ecdysis → DuckDB cache → dbt → exports → S3, gated by `test_dbt_diff`) may **read** the authoritative store but never writes or migrates it; the write layer owns the store exclusively. The classification rule: **provenance follows the data's ultimate source, not the file's production mechanism** — `notes.json` is mechanically a projection but its content originates from user writes, so it is `authoritative`, excluded from the diff, and the *store* (not the disposable JSON) is what gets backed up. Notes are **double-isolated**: never a dbt model (so the sandbox parquet diff physically can't include them) *and* contract-flagged `baseline_diff = false`. See [ARCHITECTURE.md](./ARCHITECTURE.md).

**Major components:**
1. `data/artifacts.toml` + tested `data/artifacts.py` — the single declarative artifact contract driving publish, baseline-pull, and build-time-fetch; replaces the triple hand-sync; adds `provenance` (derived|authoritative) + `baseline_diff`; classifier fails loud on unknown artifacts.
2. Authoritative store + `schema_migrations` + forward-only runner (run by the **write layer**, never `run.py`) + append-only `note_revisions` + `roles`, soft-delete, versioned backup + tested restore drill.
3. Thin write layer (API Gateway + Lambda) — sole identity/authz authority: iNat OAuth PKCE → mint short-lived app session → server-side role checks; create/edit note; moderation transitions.
4. Harvest → `notes.json` → build-time bake — a `run.py` step after `dbt-build` reads `status='approved'` rows, joins the species universe; `_data/notes.js` bakes into `species-detail.njk` (mirrors `species_hosts.js`); optional `src/notes-live.ts` progressive island for freshness.

### Critical Pitfalls

Every pitfall is a place where a habit correct for *derived* data becomes destructive for *authoritative* data. See [PITFALLS.md](./PITFALLS.md).

1. **Nightly rebuild wipes authoritative data** (cache-is-system-of-record trap) — if notes live in `beeatlas.duckdb`, a rebuild/`cp`/full-refresh empties them and the push overwrites the only copy. *Avoid:* physically separate the store; never a dbt model; mark `authoritative` in the contract so tooling refuses to overwrite. **(Phase 2 + Phase 1)**
2. **No backup/PITR before the first real note is written** — backup is a **launch gate, not a follow-up**; an untested backup is not a backup. *Avoid:* PITR + S3 Versioning on and *test-restored* before the write endpoint accepts its first non-test write. **(Phase 2 provisions; Phase 3 gates writes on a demonstrated restore)**
3. **Schema-diff gate misfires on authoritative tables** — `test_dbt_diff` iterates every manifest key; the muscle-memory `SKIP_INTEGRATION_GATE=1` bypass-and-rebuild reflex regenerates the notes table *from nothing*, wiping it while the gate goes green. *Avoid:* route `authoritative` artifacts to a different verification (shape/row-floor/migration-ran, never content-equality-vs-rebuild); classifier fails loud on unknown keys. **(Phase 1 — Thread 1's reason for being)**
4. **`s3 sync --delete` / `--recursive` reaches an authoritative prefix** — a stable-key authoritative object looks like an orphan to hashed-artifact cleanup. *Avoid:* separate bucket/fenced prefix + S3 Versioning + deny-delete on the pipeline OIDC role (make the mistake impossible via least privilege). **(Phase 2 + Phase 1)**
5. **No takedown / moderation loop for hosted UGC** (legal + reputational) — defamation, PII, sensitive-taxon localities, copyright. *Avoid:* moderation-before-publish for v1, one-action takedown (flip `status`, no deploy), full attribution/audit trail, restrict writes to an allowlist, PII/locality UI guidance. **(Phase 5/moderation owns the loop; Phase 2 must include `status`/`author_id`/audit columns)**
6. **OAuth token leakage / no PKCE in a static SPA** — a leaked iNat token lets an attacker act as the user *on iNaturalist itself*. *Avoid:* Auth Code + PKCE public client (or server-side exchange in the write layer), no implicit flow, no long-lived tokens in `localStorage`, short-lived HttpOnly app session, minimal scope, pinned redirect URI. **(Phase 3)**
7. **Trusting client-supplied identity / CSRF on the write endpoint** — forged authorship on a scientific resource. *Avoid:* derive identity server-side from the verified session (never the request body); CSRF/origin checks; server-side author-vs-curator authz. **(Phase 3 identity/CSRF; Phase 5 authz matrix)**
8. **Stored XSS via free-text notes** — `<script>`/`onerror=` rendered onto public pages. *Avoid:* escape on render + restricted server-sanitized Markdown subset; the pre-publish gate is an XSS backstop. **(Phase 4/render)**

## Implications for Roadmap

Based on research, suggested **5-phase** structure with Thread 1 (build-seam cleanup) first. Phase numbering matches the pitfalls/architecture mapping.

### Phase 1: Build-seam refoundation (Thread 1)
**Rationale:** De-risks everything; establishes the machine-checkable derived-vs-authoritative property *before* any authoritative data exists. Pure refactor, independently shippable, no user value alone.
**Delivers:** `data/artifacts.toml` + tested `data/artifacts.py`; refactor `nightly.sh` block 1c heredoc, the publish/manifest block, and `deploy.yml`'s fetch step to consume it; add `provenance` + `baseline_diff`; classify all ~14 existing artifacts as `derived`. **Byte-identical `manifest.json` and identical baseline set.**
**Addresses:** the triple-hand-sync drift bug (single edit site for adding artifacts).
**Avoids:** Pitfalls 3 & 4 (the declared property routes verification regimes and derives sync scoping); loud-fail on unclassified artifacts.

### Phase 2: Authoritative store + migration harness + backup/DR
**Rationale:** Never accept data you can't back up; the store, forward-only migrations, and a *tested* restore must exist before any write is accepted.
**Delivers:** the store (Neon Postgres recommended; DynamoDB the viable alt), `schema_migrations` + forward-only runner, `notes` + `note_revisions` + `roles` tables (append-only, soft-delete, with `status`/`author_id`/audit columns from day one), backup automation + a documented, exercised restore drill; fenced bucket/prefix + Versioning + deny-delete IAM boundary for the pipeline role. Seedable via script — no write UI yet.
**Uses:** Neon/DynamoDB + Alembic (or item-shape versioning) from STACK.md.
**Implements:** Architecture component 2.
**Avoids:** Pitfalls 1, 2, 4.

### Phase 3: Thin managed write layer + iNat OAuth
**Rationale:** The consciously-bent "static-only" constraint, isolated in one deployable; needs data-accepting infra before harvest can read anything.
**Delivers:** API Gateway HTTP API + writer Lambda(s) + Lambda authorizer + SSM secrets via surgical `BeeAtlasStack` edit; iNat OAuth2 PKCE, app-session minting, server-derived identity, CSRF/origin checks, rate limiting, create/edit-note API, role checks. **Gate public writes on a demonstrated Phase-2 restore.** No public display yet.
**Uses:** API Gateway + Lambda + iNat OAuth PKCE from STACK.md.
**Implements:** Architecture component 3.
**Avoids:** Pitfalls 2 (write-gate), 6, 7.

### Phase 4: Harvest → notes.json → build-time bake (public read, approved-only)
**Rationale:** Get the vertical slice visible; harvest needs written data from Phase 3.
**Delivers:** a `notes-harvest` `run.py` step after `dbt-build` (reads `status='approved'`, joins species universe → `notes.json`); publish via the Phase-1 contract (`authoritative`, `build_time_fetch=true`); `_data/notes.js` loader + `species-detail.njk` render (mirrors `species_hosts`); byline + updated-date + "WA Bee Atlas note" framing; graceful empty state; server-sanitized Markdown + escape-on-render.
**Addresses:** public species-page display (table stakes).
**Avoids:** Pitfall 8 (XSS); keeps the read path static (no runtime call on page load).

### Phase 5: Moderation loop + progressive live island
**Rationale:** Depends on all prior phases; moderation polish and author immediacy come last.
**Delivers:** curator pending-review + approve/reject/takedown in the write layer (audit-retained); `src/notes-live.ts` progressive per-species island (author immediacy + moderator pending preview) as pure enhancement over the baked note.
**Addresses:** curator takedown (table stakes), multiple attributed notes (should-have).
**Avoids:** Pitfall 5; keeps moderation server-enforced, never client-trusted.

*(Optional split: the author-facing create/edit form on the species page can be its own phase between 3 and 5 if Phase 3's scope grows.)*

### Phase Ordering Rationale

- **Contract cleanup first** so adding the `notes` artifact is safe and the two verification regimes exist before authoritative data does (Pitfalls 3, 4).
- **Store + backup before any write** — never accept non-reproducible data you cannot back up (Pitfalls 1, 2).
- **Auth/write before harvest** — need data to harvest.
- **Harvest + display before moderation polish** — get the slice visible.
- **Moderation + live-refresh last** — depend on everything; keep the read path static throughout.

### Research Flags

Phases likely needing deeper research during planning (`/gsd-plan-phase --research-phase <N>`):
- **Phase 2:** the final store-tech decision (Neon vs DynamoDB) is deliberately deferred to phase level; confirm PITR retention, the pipeline read path, and the IAM/bucket boundary shape.
- **Phase 3:** confirm iNat OAuth **PKCE** support end-to-end against the live API (the exact flow is documented but the API-reference page 403s automated fetch); pin the `/users/api_token` → `/v1/users/me` raw-JWT-header gotcha and scope minimality.
- **Phase 5:** the moderator/curator-role *source* (committed allowlist vs a `role` column vs an external roster) is an open decision; harvest cadence (nightly floor vs write-triggered `repository_dispatch`) is a deferred optimization.

Phases with standard patterns (skip research-phase):
- **Phase 1:** grounded directly in the actual `nightly.sh`/`deploy.yml`/`run.py` code; a well-scoped refactor.
- **Phase 4:** an exact structural mirror of the shipped `species_hosts.js` build-time bake (Phase 175); established pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Write-layer/store options, AWS/Neon/DynamoDB PITR facts, Lambda Python 3.14, and iNat OAuth shape all verified; MEDIUM only on exact sub-library patch versions (projected past the Jan-2026 cutoff). |
| Features | HIGH | Analogous-platform patterns (BugGuide/iNat/BotW/Wikipedia/GBIF) well-established; MEDIUM on exact current iNat/BugGuide non-editor permission wording. |
| Architecture | HIGH | Grounded in the actual `nightly.sh`, `run.py`, `deploy.yml`, `dbt/run.sh`, `beeatlas-stack.ts`, `manifest.ts`, and the Eleventy build seam. |
| Pitfalls | HIGH | Grounded in the real S3-sync/manifest/gate code + PROJECT.md framing; external OAuth/moderation/liability practice MEDIUM (general, not project-specific). |

**Overall confidence:** HIGH

### Gaps to Address

- **Final store tech (Neon vs DynamoDB):** decide at Phase 2. Neon if "relational + Alembic" wins; DynamoDB if "no external vendor + IAM-only + native PITR" wins. Both fully satisfy backup-critical + dual-consumer-read.
- **iNat PKCE confirmation:** verify PKCE support live at Phase 3; fallback is server-side code exchange in the write layer (browser never sees the secret) — the plan should carry both paths until confirmed.
- **Moderator-role source:** committed allowlist is the cheapest v1 form; a `roles` column or external roster is the alternative — resolve at Phase 5 (schema affordances land in Phase 2 regardless).
- **Harvest cadence:** nightly `run.py` step is the v8.0 floor; a write-triggered targeted harvest+deploy is a later optimization, not this milestone.
- **Scope discipline:** treat comment threads / open authoring / wiki-history / higher-taxon notes appearing in any plan as a signal to stop and re-scope — the milestone's weight is the architecture, not the feature.

## Sources

### Primary (HIGH confidence)
- `data/nightly.sh`, `data/run.py`, `.github/workflows/deploy.yml`, `data/dbt/run.sh`, `infra/lib/beeatlas-stack.ts`, `src/manifest.ts`, `_data/species_hosts.js`, `_pages/species-detail.njk` — current implementation + the bake pattern to mirror
- `.planning/PROJECT.md` v8.0 framing; project MEMORY (`project_duckdb_wasm_direction`, `project_cdk_stack_composition`, `feedback_no_committed_data_artifacts`, `project_occurrences_contract_release_sequence`, `project_deploy_paths`)
- https://aws.amazon.com/blogs/compute/python-3-14-runtime-now-available-in-aws-lambda/ — Lambda Python 3.14 managed runtime
- https://neon.com/pricing + Databricks-acquisition coverage — Neon scale-to-zero, PITR, branching
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html — DynamoDB PITR 1–35 days
- https://pyinaturalist.readthedocs.io/en/stable/user_guide/authentication.html — `/users/api_token` JWT, ~24h validity

### Secondary (MEDIUM confidence)
- https://www.inaturalist.org/pages/api+reference — iNat OAuth2 + PKCE (page 403s automated fetch; corroborated across results)
- iNat Curator Guide + community forum; BugGuide Help/Guide + Wikipedia — role-gated taxon-text authoring models
- eBird/Birds of the World, GBIF — expert-authored vs aggregated species-text precedents
- OAuth 2.0 for Browser-Based Apps / PKCE public-client guidance; US §230 + DMCA takedown posture for hosted UGC

### Tertiary (LOW confidence)
- Exact sub-library patch versions (psycopg/SQLAlchemy/Alembic/oauth4webapi) — projected past the Jan-2026 cutoff; pin at implementation.
- https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap — libSQL/Turso vendor-turbulence flag (considered, not chosen)

---
*Research completed: 2026-07-02*
*Ready for roadmap: yes*

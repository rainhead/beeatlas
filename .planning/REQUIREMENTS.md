# Requirements: v8.0 Authoritative Data Foundation

**Defined:** 2026-07-02
**Core Value:** Tighten learning cycles for volunteer collectors and become the gathering place for the Washington Bee Atlas — surfacing knowledge in ways Canvas/iNat/Ecdysis/Facebook each fail to provide.

Scope: introduce BeeAtlas's first *authoritative, non-reproducible* data — WA-specific expert species natural-history notes with no iNaturalist/Ecdysis upstream — and refound the build seam around an explicit **derived-vs-authoritative** split so both data classes are managed correctly. The user-visible feature is deliberately a single thin vertical slice; the milestone's weight is the architecture.

**Anchoring decisions (from milestone discussion + research):**
- **Store technology deferred to Phase 177** — requirements are written store-agnostic; the Neon-Postgres-vs-DynamoDB call is made during Phase 177 planning (research recommends Neon; pure-AWS DynamoDB is the viable alternative). Research: `.planning/research/SUMMARY.md`.
- **Moderation = trusted-author allowlist + curator takedown** — only allowlisted experts may author; their notes publish immediately (no pre-publish queue); a curator can hide/delete without a code deploy. A pre-moderation queue is deferred (add only if abuse emerges).
- **Read path = hybrid harvest-dominant** — approved notes are harvested into a build-time `notes.json` (mirroring the shipped `species_hosts.js` bake); the read path stays fully static and offline-safe. An optional live island (NOTES-04) is a differentiator, not table stakes.
- **Auth = iNaturalist OAuth2 (PKCE)** — collectors already have iNat logins; identity is derived server-side, never trusted from the client.
- **The "no server runtime at any layer" constraint is consciously bent** for the write path only, isolated in one deployable; the read path remains static.

## v1 Requirements

### Build-Seam Refoundation (Thread 1 — no user value alone; de-risks everything downstream)

- [x] **SEAM-01**: A single declarative artifact contract (e.g. `data/artifacts.toml`) is the sole source of truth for every published artifact's metadata: logical name, local filename, provenance (`derived`|`authoritative`), kind (hashed | stable-dir | metadata), `baseline_diff`, `build_time_fetch`, `gzip`, `content_type`.
- [x] **SEAM-02**: A tested `data/` module (e.g. `data/artifacts.py`) reads the contract; the ~40-line inline Python baseline-classifier heredoc in `nightly.sh` is replaced by calls to it, covered by `pytest`.
- [x] **SEAM-03**: `nightly.sh` (upload + baseline pull) and `deploy.yml` (build-time fetch) both consume the declarative contract — no hand-synced key lists remain in any of the three former sites. The refactor is regression-safe: the manifest and pulled/fetched file set are unchanged for the existing derived artifacts.
- [x] **SEAM-04**: Every artifact/table carries an explicit `derived` vs `authoritative` classification. Authoritative artifacts are structurally excluded from the schema-change gate — never produced as a dbt model, and `baseline_diff=false` so `test_dbt_diff` / block-1c never pull or diff them.
- [x] **SEAM-05**: The two schema-evolution regimes are documented and enforced as distinct: `derived` = diff-against-live baseline + bypass-and-rebuild valid; `authoritative` = forward-only migrations only, rebuild/bypass verbs forbidden.

### Authoritative Store, Migrations & Backup

- [x] **STORE-01**: A store-agnostic authoritative store holds notes with author identity, created/updated timestamps, a `status`, and role/allowlist affordances — schema shaped for moderation and attribution from day one.
- [x] **STORE-02**: Authoritative tables evolve via forward-only versioned migrations with no rebuild-from-source path; migrations are owned/run by the write layer, never by `run.py`/the nightly pipeline.
- [x] **STORE-03**: Safety-critical backup: frequent **consistent snapshots** (SQLite online-backup API, never a raw `cp`) pushed to a dedicated IAM-isolated versioned S3 bucket, with RPO = snapshot interval (matching the stated risk tolerance); a **test-restore demonstrated before any public write** exists. Continuous near-second PITR via Litestream is explicitly deferred to a later phase.
- [x] **STORE-04**: The authoritative store is physically and IAM-separated from the derived `beeatlas.duckdb` and the `/data/` S3 prefix, so a normal green nightly (`--delete` syncs, DuckDB rebuild/push) can never reach or overwrite authoritative data.

### Write Layer & Authentication

- [ ] **WRITE-01**: A thin managed write app (a maderas-hosted Flask/WSGI service behind Apache `mod_fcgid`, isolated alongside the existing pipeline — per 177 D-01, NOT API Gateway + Lambda) accepts authenticated writes; the read path remains fully static.
- [ ] **WRITE-02**: iNaturalist OAuth2 (server-side code exchange with PKCE) authenticates authors; the write app derives identity server-side (never trusts client-supplied identity) and issues its own app session rather than calling iNat per request. Given the low threat model the session is long-lived with per-write allowlist recheck for revocation (relaxing the original "short-lived" wording). No secret ships in the client bundle; no token in `localStorage`/URL.
- [ ] **WRITE-03**: Write authorization checks an author allowlist — only allowlisted experts can create/edit notes — with CSRF/origin protection on the write endpoint and minimal (identity-only) OAuth scope.
- [ ] **WRITE-04**: Enabling public writes is gated on a demonstrated backup restore (STORE-03) — a launch checklist item, not an afterthought.

### Species Natural-History Notes

- [ ] **NOTES-01**: An allowlisted author can create a natural-history note on a species page — plain text / restricted markdown, server-sanitized — attributed with a byline and timestamps.
- [ ] **NOTES-02**: An author can edit and delete their own notes.
- [ ] **NOTES-03**: Published (non-hidden) notes are harvested into a build-time `notes.json` (hybrid harvest-dominant, mirroring `species_hosts.js`); species pages render them as an attributed, stacked list with a sensible empty state; the read path stays static and offline-safe.
- [ ] **NOTES-04** *(differentiator)*: An optional per-species live island shows an author their just-written note immediately, before the next build refreshes `notes.json`.

### Moderation

- [ ] **MOD-01**: Three roles exist — reader / author / curator — with the author allowlist and curator set sourced from a declared, auditable place.
- [ ] **MOD-02**: A curator can hide/take down any note **without a code deploy**; hidden notes are excluded from the harvest.
- [ ] **MOD-03**: Note content is XSS-sanitized on write, and every note carries audit fields (`author_id`, `status`, `created`, `updated`).
- [ ] **MOD-04**: A takedown removes a note from the public site within one harvest/build cycle (and immediately from the live island, if NOTES-04 shipped).

## Future Requirements (deferred)

### Moderation depth
- **Pre-moderation queue** — hold notes for curator approval before public. Add only if abuse/quality issues emerge under the allowlist model.
- **In-app public flagging/reporting** of notes by readers.
- **Edit history / revision UI** — versioned note history with diff/revert (author-owned notes make this deferrable; timestamps + backup cover catastrophic recovery for v1).

### Content breadth
- Natural-history / annotation notes on **other entities** (samples, places, collection outings).
- Richer note formatting (images, references, structured natural-history fields).

### Architecture generalization
- A **generalized multi-backend migration framework** / second authoritative table — deliberately NOT built until a second authoritative use case exists (avoid speculative generality).
- **Write-triggered** harvest/`repository_dispatch` refresh so notes go live faster than the nightly cadence.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Comment threads / discussion on species pages | iNat deliberately keeps discussion on observations, not taxa; threads are a wiki-scale surface, not a thin slice. |
| Real-time collaborative editing | Author-owned notes need no merge/collab machinery. |
| Full wiki with revision patrol | Only Wikipedia sustains open authoring, and only via heavyweight tooling; the allowlist model exists to avoid it. |
| Notifications / activity feed for notes | Out of the vertical slice; revisit once notes exist. |
| Open (non-allowlisted) public authoring | Safety/liability posture for a first UGC feature; allowlist is the gate. |
| Treating notes as derived data (dbt model, diffable baseline, rebuildable) | Category error — the entire point of SEAM-04/05 is that authoritative data is never rebuilt. |

## Traceability

Which phases cover which requirements. Filled during roadmap creation (2026-07-02). Coverage: **21/21 mapped, no orphans, no duplicates.**

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEAM-01 | Phase 176 | Complete |
| SEAM-02 | Phase 176 | Complete |
| SEAM-03 | Phase 176 | Complete |
| SEAM-04 | Phase 176 | Complete |
| SEAM-05 | Phase 176 | Complete |
| STORE-01 | Phase 177 | Complete |
| STORE-02 | Phase 177 | Complete |
| STORE-03 | Phase 177 | Complete |
| STORE-04 | Phase 177 | Complete |
| WRITE-01 | Phase 178 | Pending |
| WRITE-02 | Phase 178 | Pending |
| WRITE-03 | Phase 178 | Pending |
| WRITE-04 | Phase 178 | Pending |
| NOTES-01 | Phase 179 | Pending |
| NOTES-02 | Phase 179 | Pending |
| NOTES-03 | Phase 179 | Pending |
| NOTES-04 *(optional)* | Phase 179 | Pending |
| MOD-01 | Phase 180 | Pending |
| MOD-02 | Phase 180 | Pending |
| MOD-03 | Phase 180 | Pending |
| MOD-04 | Phase 180 | Pending |

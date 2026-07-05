---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Authoritative Data Foundation
status: ready_to_plan
stopped_at: Phase 180 complete (5/5) — ready to discuss Phase 999.11
last_updated: 2026-07-05T04:39:47.525Z
last_activity: 2026-07-05
progress:
  total_phases: 47
  completed_phases: 27
  total_plans: 88
  completed_plans: 101
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (Current Milestone: v8.0 Authoritative Data Foundation)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants. Long-term: become the gathering place for the Washington Bee Atlas.
**Current focus:** Phase 999.11 — add federal wilderness areas as regions

## Current Position

Phase: 999.11
Plan: Not started
Status: Ready to plan
Last activity: 2026-07-05

Progress: [██████░░░░] 57%

## Milestone Overview

**v8.0 Authoritative Data Foundation (Phases 176–180) — IN PROGRESS**

Introduce BeeAtlas's first *authoritative, non-reproducible* data — WA-specific expert species natural-history notes with no iNat/Ecdysis upstream — and refound the build seam around a **derived-vs-authoritative** split. The user-visible feature is a deliberately thin vertical slice; the milestone's weight is the architecture. Build-seam cleanup lands first; the runtime-bending write layer is isolated; public writes gate on a proven backup restore. Roadmap: [.planning/ROADMAP.md](ROADMAP.md) · Requirements: [.planning/REQUIREMENTS.md](REQUIREMENTS.md) · Research: [.planning/research/SUMMARY.md](research/SUMMARY.md).

| Phase | Name | Requirements | UI | Status |
|-------|------|--------------|----|--------|
| 176 | Build-Seam Refoundation (Thread 1) | SEAM-01..05 | — | Complete (2026-07-02) |
| 177 | Authoritative Store, Migrations & Backup/DR | STORE-01..04 | — | Complete (2026-07-03) |
| 178 | Thin Write Layer + iNat OAuth | WRITE-01..04 | yes | Complete (2026-07-04) |
| 179 | Notes Feature + Harvest → Build-Time Bake | NOTES-01..04 | yes | Complete (2026-07-04) |
| 180 | Moderation Loop | MOD-01..04 | yes | In Progress (4/5) |

**Progress:** [██████████] 100%

**Phase dependency chain:** 176 (independent) → 177 → 178 → 179 (also needs 176's contract) → 180.

**Research flags for planning:** Phase 177 (`--research-phase` — final store-tech decision Neon vs DynamoDB, PITR retention, dual-consumer read path, IAM/bucket boundary); Phase 178 (`--research-phase` — confirm iNat OAuth PKCE live, carry server-side code-exchange fallback, `/users/api_token` raw-header gotcha). Phases 176 & 179 use established patterns (real code / the `species_hosts.js` bake) — no research-phase needed.

Prior milestone: **v7.0 Species Trait Annotations** (Phases 173–174) — SHIPPED 2026-06-30 (PR #39 merged). Archive: [.planning/milestones/v7.0-ROADMAP.md](milestones/v7.0-ROADMAP.md).

## Accumulated Context

### Decisions

v8.0 anchoring decisions (from milestone discussion + research; full detail in REQUIREMENTS.md + research/):

- **[v8.0] Derived-vs-authoritative is an explicit declared property.** Provenance follows the data's *ultimate source*, not the file's production mechanism: any byte tracing to a user write is `authoritative` (excluded from the reproducibility diff; the store is backup-critical), everything else is `derived`. `notes.json` is mechanically a projection but `authoritative` — the store is backed up, the JSON is disposable/re-harvestable.
- **[v8.0] Double isolation of authoritative artifacts:** never a dbt model (so the sandbox parquet diff can't include them) AND `baseline_diff=false` in the contract (so `test_dbt_diff`/block-1c never pull/diff them). The `SKIP_INTEGRATION_GATE` bypass-and-rebuild reflex is FORBIDDEN for authoritative tables — there is no source to rebuild from, so "rebuild" = "delete."
- **[v8.0] Backup is a launch gate, not a follow-up.** PITR + S3 Versioning ON and *test-restored* before the write endpoint accepts its first non-test write (WRITE-04 gates on STORE-03). An untested backup is not a backup.
- **[v8.0] Store technology deferred to Phase 177 planning** — requirements written store-agnostic. Research recommends Neon Serverless Postgres (SQL + Alembic, scale-to-zero, PITR, readable by both the Lambda writer and the nightly pipeline); pure-AWS DynamoDB single-table is the one viable alternative (no external vendor, IAM-only, native PITR). DuckDB-WASM is NOT a candidate (page-weight, rejected project-wide — memory `project_duckdb_wasm_direction`).
- **[v8.0] Auth = iNat OAuth2 PKCE, server-derived identity.** The thin write layer is the sole identity/authz authority; the static read path holds no secrets and never authenticates. Short-lived app session; iNat token stays server-side; minimal (identity-only) scope; exact-pinned redirect URI. No token in `localStorage`/URL.
- **[v8.0] Moderation = allowlist + curator takedown** (not a pre-publish queue). reader/author/curator roles; allowlisted authors publish immediately; curator hides/deletes without a deploy (flip `status`); XSS-sanitize on write + escape on render.
- **[v8.0] Read path stays 100% static/offline-safe.** Nightly harvest bakes only approved notes into `notes.json` via the Phase-176 contract (`build_time_fetch=true`), mirroring the Phase-175 `species_hosts.js` bake. Optional live island (NOTES-04) is pure enhancement, never the sole display path.
- **[v8.0] Write layer bends "no server runtime" — isolated in one deployable** (API Gateway HTTP API + thin Lambda) via surgical `BeeAtlasStack` edit. The retired 260514-fcq Function-URL Lambda is CDK precedent for a *thin* handler, NOT the retired 15-min pipeline Lambda.

Load-bearing conventions carried forward (relevant to v8.0):

- **`BeeAtlasStack` houses the whole site** — never `cdk destroy`; add write-layer/store/backup resources by surgical edit only (memory `project_cdk_stack_composition`).
- **Build-time data ships via S3 + `manifest.json` + `deploy.yml` fetch, NEVER committed to git** (the `species.json` pattern). A clean git status is not a verification PASS for a regenerated artifact (memory `feedback_no_committed_data_artifacts`). `notes.json` follows this.
- **dbt contract changes ship data-before-code** via a one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` (memory `project_occurrences_contract_release_sequence`). Applies to any *derived* contract touch in Phase 176; does NOT apply to the authoritative store (forward-only migrations).
- **dbt build / full pipeline can't run locally** (mashumaro+Python3.14 + absent raw files + Ecdysis auth) — verify via pytest + direct DuckDB queries + the byte-identical-manifest floor; nightly `run.sh build` is the real contract gate (memory `project_local_dbt_build_not_runnable`).
- **Static hosting only** for the read path (the write layer is the single, isolated exception).
- [Phase ?]: render_as_batch=True set globally in env.py; downgrade() raises NotImplementedError in both mako template and initial migration (Pitfall 4 guard, T-177-01)
- [Phase ?]: backup_notes split into make_snapshot/upload_snapshot for local testability without S3
- [Phase ?]: 178-02: test_notes_migrations.py::test_migration_applies now targets revision 0001 explicitly instead of head (head advanced to 0002 with users-table migration)
- [Phase 178]: OAuth fetch_identity sends Bearer to /users/api_token but RAW JWT (no Bearer) to /v1/users/me, matching the official inaturalistjs client — RESEARCH.md Pitfall 2 flagged this as ambiguous; implemented per the HIGH-confidence official-client citation
- [Phase 178]: 178-05: allowlist revocation re-reads roles TOML from disk per request; WRITES_ENABLED is an env-driven launch gate (not a secret)
- [Phase 178]: config.WRITES_ENABLED now also reads [launch] writes_enabled from secrets.toml (per plan 178-06), with the 178-05 WRITES_ENABLED env var still overriding when set
- [Phase 178]: require_real_secrets() called just-in-time in /auth/callback, after the no-secret state check, so a state mismatch still returns 400 with placeholder secrets.toml
- [Phase ?]: [Phase 178] 178-07: fetchWhoami normalizes the API's snake_case is_author to AuthState.isAuthor at the client boundary
- [Phase ?]: [Phase 178] 178-07: sign-in/sign-out rendered as text .auth-btn pills, not .icon-btn glyph chrome
- [Phase ?]: [Phase 178] 178-07: auth controller wired only into entries/bee-header.ts (standalone pages); bee-atlas.ts's own <bee-header> is not yet wired -- sign-in button is a no-op on the map page until a follow-up plan wires it
- [Phase ?]: 179-01: nh3 default link_rel="noopener noreferrer" satisfies D-06 (never pass rel in the attributes allowlist alongside it); three-step SQLite batch pattern (add nullable body_html -> backfill via render_note_markdown -> tighten NOT NULL) + author_id String->Integer FK to users.id, all in migration 0003
- [Phase 179]: Body length cap set to 5000 chars for note markdown (D-05 defense-in-depth against markdown-DoS)
- [Phase 179]: Note mutation routes load the row before checking ownership (404 before 403) so IDOR probing never mutates
- [Phase 179]: 179-03: notes-harvest reuses collectors.json for byline resolution (D-11); notes declared authoritative + build_time_fetch_optional=true in artifacts.toml
- [Phase 179]: 179-04: formatDate pinned to timeZone:'UTC' since bare date-only ISO strings parse as UTC midnight and would roll back a day in local timezones behind UTC
- [Phase 179]: 179-04: new src/lib/*.js utils consumed by both Eleventy and TS ship with a matching *.d.ts (formatDate.d.ts mirrors quantify.d.ts) since tsconfig has no allowJs
- [Phase 179]: 179-05: mutating note-client calls resolve {ok:false,status:0} on network error rather than throwing
- [Phase 179]: 179-05: bee-notes hides Add note whenever any editor (add or edit) is open, since both use .note-btn--primary
- [Phase 179]: 179-06: nightly.sh must export NOTES_DB_PATH ($HOME/beeatlas-store/notes.db) so the harvest reads the SAME live store the write API writes to — the code default (/opt/beeatlas-store/notes.db) is absent on maderas (commit 3154a07a). Producer store path is an env-var contract matching the systemd unit + runbook §A4, not the make_engine default. Surfaced by 179-06 Checkpoint 3 UAT.
- [Phase 179]: 179-06: notes-harvest kept FAIL-LOUD (a store-open error aborts the whole nightly before publish) — user decision 2026-07-04, over graceful-degrade; a broken notes pipeline must be impossible to miss.
- [Phase 179]: 179-06: operator-triggered nightly gotcha — bash parses nightly.sh at invocation, so `git pull` on the host BEFORE running it (its own internal pull updates the file too late for the loaded process).
- [Phase 180-03]: isCurator derived client-side as role === 'curator' (D-03); server always re-checks authz on write
- [Phase 180-03]: Curator Take-down control reuses .note-owner-controls/.note-delete-confirm/.note-btn--danger verbatim, zero new CSS classes
- [Phase 180]: [Phase 180-02] Curator gate (_is_curator_fresh) runs BEFORE the note load in takedown/restore, unlike the post-load ownership check in edit_note/delete_note -- a blanket non-curator 403 leaks no note-specific info
- [Phase 180]: [Phase 180-02] restore route is fully implemented and tested but has zero UI wiring in this plan -- curl-only per D-07, consumed directly by the operator
- [Phase ?]: [Phase 180-04]: verification-only plan — 2 new tests (hidden-status harvest exclusion, note_revisions.reason nullable) lock MOD-01/03/04 by construction; zero production code touched

### Roadmap Evolution

- 2026-07-02: v8.0 roadmap created — Phases 176–180 derived from SEAM/STORE/WRITE/NOTES/MOD requirements. Numbering continues from v7.0's last phase (175); the 999.x entries are a permanent backlog, not milestone phases.

### Pending Todos

Carried forward (non-blocking, pre-existing):

- `144-code-review-deferred.md` — WR-04 (CSV-export `rows[0]` headers) + 3 info findings.
- `165-code-review-deferred.md` — deferred Phase 165 code-review findings.
- `rebuild-source-into-facets.md` — **OBSOLETE** (shipped as Phase 170); close it.

### Blockers/Concerns

- **No active blockers for v8.0.** The nightly pipeline is unblocked (Phase 163 Ecdysis-auth resolved 2026-06-24).
- **Operational confirmation (NOT a code gap, carried from v7.0 close):** one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` on maderas to refresh the S3 `species.json` baseline post-PR-#39 — confirm the latest nightly published cleanly. Phase 176's byte-identical-manifest goal assumes the current publish behavior is the baseline to preserve.
- ~~178-07: bee-atlas.ts (map page /) <bee-header> sign-in was a no-op~~ — RESOLVED 2026-07-03 (commit e137418c): map-page header now wired to auth-client (fetchWhoami/startSignIn/signOut) as bee-atlas-owned state, mirroring entries/bee-header.ts; +5 tests, full JS suite 923 green.
- ~~178-08 awaiting operator~~ — RESOLVED 2026-07-04: maderas deploy complete (systemd-user Waitress, TLS vhost, migration 0002), WRITE-04 gate closed (restore re-confirmed, 503→200, first author committed), 178-09 security UAT PASS (all 7 items, operator-approved). Write layer LIVE at api.beeatlas.net.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260702-lvc | Speed up checklist_pipeline.py: replace 5 executemany sites with pyarrow bulk-load (257x on 50k rows; nightly checklist step ~5min→seconds) | 2026-07-02 | 2763a3bb | [260702-lvc-speed-up-data-checklist-pipeline-py-by-r](./quick/260702-lvc-speed-up-data-checklist-pipeline-py-by-r/) |

## Deferred Items

Items acknowledged and carried forward from prior milestone closes:

| Category | Item | Status |
|----------|------|--------|
| operator | one-time `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` (refresh S3 species.json baseline post-PR-#39) | pending |
| phase | Phase 166 (seasonality charts) | open — needs a per-taxon page route (none exists yet) |
| trait follow-on | trait-based map filtering; GloBI-derived Sphecodes/Stelis cuckoo hosts; sparse native-status backfill; `checklist_count=0` vs `on_checklist=true` display fix | deferred (v7.0 carry-forward) |
| todo | `144-code-review-deferred.md` | open — non-blocking |
| todo | `165-code-review-deferred.md` | open — non-blocking |
| todo | `rebuild-source-into-facets.md` | obsolete (shipped as Phase 170) — close |
| backlog | 999.11 (federal wilderness areas as regions), 999.7 (Safari private-browsing offline UI) | open — promote via `/gsd-review-backlog` |
| nyquist | Phases 129/131/132/134/135/136/138 + 167–172 partial Nyquist | accepted (partial-Nyquist convention) |
| verification | Phase 110/111/113 VERIFICATION.md | human_needed (carried from v4.0) |
| uat | Phase 110 HUMAN-UAT.md | partial — 2 open scenarios (carried from v4.0) |
| place | snoqualmie-pass-to-olallie-meadow-trail | deferred — needs hand-traced GPX |

## Session Continuity

Last session: 2026-07-05T01:47:56.261Z
Stopped at: Completed 180-04-PLAN.md
Resume file: None

## Operator Next Steps

- Phase 179 is complete and LIVE (notes render on public species pages; harvest→bake proven end-to-end on maderas). Only Phase 180 (Moderation Loop) remains in v8.0.
- Next: `/gsd-plan-phase 180`, then `/gsd-execute-phase 180`. After 180, `/gsd-complete-milestone` for v8.0.
- Non-blocking follow-ups still open: the pre-existing operator `SKIP_INTEGRATION_GATE=1` species.json baseline refresh; `144-/165-code-review-deferred`; `notes-guest-freshness-gap` todo (guest-visible note lag until nightly bake — future improvement, user-flagged).

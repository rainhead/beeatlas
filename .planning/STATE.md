---
gsd_state_version: 1.0
milestone: v8.0
milestone_name: Authoritative Data Foundation
status: executing
stopped_at: v8.0 roadmap created (ROADMAP.md phases 176–180, STATE.md, REQUIREMENTS.md traceability)
last_updated: "2026-07-02T20:28:05.351Z"
last_activity: 2026-07-02
progress:
  total_phases: 47
  completed_phases: 23
  total_plans: 61
  completed_plans: 60
  percent: 49
---

# Project State

## Project Reference

See: .planning/PROJECT.md (Current Milestone: v8.0 Authoritative Data Foundation)

**Core value:** Tighten learning cycles for volunteer collectors — surface existing data in ways difficult to achieve without the site; convey liveness and togetherness among participants. Long-term: become the gathering place for the Washington Bee Atlas.
**Current focus:** Phase 176 — build-seam-refoundation-thread-1

## Current Position

Phase: 176 (build-seam-refoundation-thread-1) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-07-02

Progress: [░░░░░░░░░░] 0%

## Milestone Overview

**v8.0 Authoritative Data Foundation (Phases 176–180) — IN PROGRESS**

Introduce BeeAtlas's first *authoritative, non-reproducible* data — WA-specific expert species natural-history notes with no iNat/Ecdysis upstream — and refound the build seam around a **derived-vs-authoritative** split. The user-visible feature is a deliberately thin vertical slice; the milestone's weight is the architecture. Build-seam cleanup lands first; the runtime-bending write layer is isolated; public writes gate on a proven backup restore. Roadmap: [.planning/ROADMAP.md](ROADMAP.md) · Requirements: [.planning/REQUIREMENTS.md](REQUIREMENTS.md) · Research: [.planning/research/SUMMARY.md](research/SUMMARY.md).

| Phase | Name | Requirements | UI | Status |
|-------|------|--------------|----|--------|
| 176 | Build-Seam Refoundation (Thread 1) | SEAM-01..05 | — | Not started (ready to plan) |
| 177 | Authoritative Store, Migrations & Backup/DR | STORE-01..04 | — | Not started |
| 178 | Thin Write Layer + iNat OAuth | WRITE-01..04 | yes | Not started |
| 179 | Notes Feature + Harvest → Build-Time Bake | NOTES-01..04 | yes | Not started |
| 180 | Moderation Loop | MOD-01..04 | yes | Not started |

**Progress:** [██████████] 98%

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

Last session: 2026-07-02T20:28:05.343Z
Stopped at: v8.0 roadmap created (ROADMAP.md phases 176–180, STATE.md, REQUIREMENTS.md traceability)
Resume file: None

## Operator Next Steps

- Review the v8.0 roadmap draft in `.planning/ROADMAP.md` (phases 176–180) + `.planning/REQUIREMENTS.md` traceability.
- Then plan the first phase: `/gsd-plan-phase 176`.

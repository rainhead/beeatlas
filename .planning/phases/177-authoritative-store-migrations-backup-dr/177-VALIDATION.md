---
phase: 177
slug: authoritative-store-migrations-backup-dr
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-03
---

# Phase 177 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (existing — `data/` suite) |
| **Config file** | `data/pyproject.toml` |
| **Quick run command** | `cd data && uv run pytest -m "not integration" -q` |
| **Full suite command** | `cd data && uv run pytest -m "not integration"` |
| **Estimated runtime** | ~30–60 seconds |

Note (repo constraint, memory `project_local_dbt_build_not_runnable`): the dbt build / full nightly pipeline cannot run locally. Store/migration/backup logic is validated via pytest + direct SQLite queries; the nightly `run.sh build` on maderas is the real integration gate. The STORE-04 "green nightly can't touch the store" proof and the STORE-03 test-restore drill are operator-run (`autonomous: false`) verifications, not local pytest.

---

## Sampling Rate

- **After every task commit:** Run the quick command.
- **After every plan wave:** Run the full suite.
- **Before `/gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** ~60 seconds.

---

## Per-Task Verification Map

Populated by the planner as tasks are defined. Every STORE requirement maps to at least one automated (pytest / SQLite-query) check plus, where the behavior is operator-only (restore drill, nightly-isolation proof), a manual verification below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| pkg-gate | 177-01 | 1 | STORE-01/02/03 | T-177-SC | 4 [ASSUMED] pkgs verified on PyPI before install | manual | blocking human checkpoint | n/a | ⬜ pending |
| deps | 177-01 | 1 | STORE-01/02/03 | — | deps import; STORE-03 wording relaxed | unit | `cd data && uv run python -c "import alembic,sqlalchemy,fastapi,uvicorn"` | ❌ W0 | ⬜ pending |
| cdk-bucket | 177-02 | 1 | STORE-04 | T-177-03, T-177-04 | versioned+RETAIN+180d; zero deployer access; no pipeline DeleteObject | unit (synth) | `cd infra && npm test` | ❌ W0 | ⬜ pending |
| schema | 177-03 | 2 | STORE-01 | T-177-02, T-177-05 | notes+note_revisions; WAL; multi-note-per-species | unit | `cd data && uv run pytest tests/test_notes_store_schema.py -x` | ❌ W0 | ⬜ pending |
| migrations | 177-04 | 3 | STORE-02 | T-177-01, T-177-02 | forward-only; downgrade raises; alembic_version ledger; run.py never migrates | unit | `cd data && uv run pytest tests/test_notes_migrations.py -x` | ❌ W0 | ⬜ pending |
| seed/roles/app | 177-05 | 3 | STORE-01 | T-177-05a/b | committed allowlist; seedable; health-only app | unit | `cd data && uv run pytest tests/test_notes_seed_roles.py tests/test_notes_app.py -x` | ❌ W0 | ⬜ pending |
| backup | 177-06 | 3 | STORE-03 | T-177-05, T-177-06 | consistent snapshot (no raw cp); restore roundtrip (count+version) | unit | `cd data && uv run pytest tests/test_backup_notes.py -x` | ❌ W0 | ⬜ pending |
| restore-drill | 177-07 | 4 | STORE-03 | T-177-06 | demonstrated restore before any public write (D-12) | manual | operator drill on maderas → Drill Log | n/a | ⬜ pending |
| isolation-proof | 177-07 | 4 | STORE-04 | T-177-02 | full nightly leaves store + backups untouched (D-17) | manual | operator full `bash data/nightly.sh` → Drill Log | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Test files planned per plan: `tests/test_notes_store_schema.py` (03), `tests/test_notes_migrations.py` (04), `tests/test_notes_seed_roles.py`+`tests/test_notes_app.py` (05), `tests/test_backup_notes.py` (06), `infra/test/beeatlas-stack.test.ts` assertions (02)
- [x] Alembic scaffolding (`env.py` `render_as_batch=True`, forward-only `downgrade()` raising) — plan 177-04
- [x] Fixtures: temp SQLite DB via `Base.metadata.create_all` + seed script (plans 03-06 use `tmp_path`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Backup test-restore demonstrated | STORE-03 | Requires real S3 push from maderas + restore into a scratch DB; not reproducible locally | Run the snapshot → S3 → restore-into-scratch drill on maderas; confirm row counts + schema match; document the run |
| Green nightly cannot reach the store | STORE-04 | Requires a full `run.py`/dbt rebuild + S3 push on maderas | Run a full nightly; confirm the SQLite file mtime/hash and its S3 backups are unchanged |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

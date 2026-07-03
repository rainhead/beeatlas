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
| TBD | TBD | TBD | STORE-01..04 | T-177-* | see plans | unit / manual | see plans | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `data/store/tests/` (or equivalent) — pytest package for the new store/migration/backup code
- [ ] Alembic scaffolding (`env.py` with `render_as_batch=True`, forward-only `downgrade()` raising `NotImplementedError`)
- [ ] Fixtures: a temp SQLite DB seeded via the seed script for migration + backup tests

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

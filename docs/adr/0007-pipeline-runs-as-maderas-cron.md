# ADR 0007: The Pipeline Runs as a maderas Cron, Not AWS Lambda

**Status:** Accepted (v1.7; Lambda retired 2026-05-14; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

The nightly data pipeline was originally intended to run on AWS Lambda. In practice Lambda blocked it: OOM on geography processing, the 15-minute timeout, a read-only filesystem, no home directory, and iNat auth requirements. The maderas server runs the same pipeline ~6× faster with none of those constraints.

## Decision

The pipeline runs as a **nightly cron on the `maderas` server** via `data/nightly.sh` — the sole execution path. `nightly.sh` owns NVM activation, `git pull`, `npm ci`, `uv sync`, S3 pull/push, and CloudFront invalidation; `run.py` is the pure orchestrator (env-driven via `DB_PATH`/`EXPORT_DIR`) and knows nothing about S3 or git. The crontab holds only host-specific bits.

The dormant CDK Lambda surface (DockerImageFunction + EventBridge schedulers + Function URL) was **retired 2026-05-14** (quick task `260514-fcq`).

## Consequences

- Deployment behavior changes belong in `nightly.sh`, not the crontab.
- Local dev runs `uv run python run.py` directly against `data/beeatlas.duckdb`, bypassing the wrapper.
- The write layer's server exception (Flask/WSGI on maderas) is unrelated to this and separately justified (see [CLAUDE.md](../../CLAUDE.md) Constraints).

---

*Source: `.planning/RETROSPECTIVE.md` §v1.7 (preserved at `docs/history/RETROSPECTIVE.md`).*

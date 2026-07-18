# ADR 0007: The Pipeline Runs as a maderas Cron, Not AWS Lambda

**Status:** Accepted (v1.7; Lambda retired 2026-05-14; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

The nightly data pipeline was originally intended to run on AWS Lambda. In practice Lambda blocked it: OOM on geography processing, the 15-minute timeout, a read-only filesystem, no home directory, and iNat auth requirements. The maderas server runs the same pipeline ~6× faster with none of those constraints.

## Decision

The pipeline runs as a **nightly cron on the `maderas` server** via `data/nightly.sh` — the sole execution path. `nightly.sh` owns NVM activation, `git pull`, `npm ci`, `uv sync`, the integration gate, the site build, and the publish; the orchestrator is the pure build step (env-driven via `DB_PATH`/`EXPORT_DIR`/`NOTES_DB_PATH`) and knows nothing about S3 or git. The crontab holds only host-specific bits.

> **Update (2026-07-17):** the orchestrator is now [Stelis](https://github.com/rainhead/stelis), a content-addressed dependency graph over the `data/` scripts (see [runbook](../runbooks/stelis-cutover.md)). It replaced `run.py`, the original imperative STEPS loop. This ADR's decision — *pipeline as a maderas cron wrapped by `nightly.sh`* — is unchanged; only the orchestrator behind `nightly.sh` changed.

> **Update (2026-07-17, Model Y — stelis ADR 0007 Amendment):** the wrapper's AWS legs are gone. `nightly.sh` no longer does S3 pull/push or CloudFront invalidation — it publishes by merge-swapping the rendered `_site` into the Apache-served root on this host, and its working state (DuckDB, export, integration-gate baseline) lives at the persistent `/var/www/beeatlas.net/var/` path. The only AWS call left is the offsite DuckDB/taxa backup trap. The decision itself — *pipeline as a maderas cron wrapped by `nightly.sh`* — still stands.

The dormant CDK Lambda surface (DockerImageFunction + EventBridge schedulers + Function URL) was **retired 2026-05-14** (quick task `260514-fcq`).

## Consequences

- Deployment behavior changes belong in `nightly.sh`, not the crontab.
- Local dev runs the build from the Stelis checkout (`racket src/main.rkt --build --all`) against a local DuckDB via `DB_PATH`, bypassing the wrapper.
- The write layer's server exception (Flask/WSGI on maderas) is unrelated to this and separately justified (see [CLAUDE.md](../../CLAUDE.md) Constraints).

---

*Source: `.planning/RETROSPECTIVE.md` §v1.7 (preserved at `docs/history/RETROSPECTIVE.md`).*

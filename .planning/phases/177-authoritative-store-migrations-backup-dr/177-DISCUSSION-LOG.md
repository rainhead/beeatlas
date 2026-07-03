# Phase 177: Authoritative Store, Migrations & Backup/DR - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 177-authoritative-store-migrations-backup-dr
**Areas discussed:** Store technology, Schema affordances, Backup & restore proof, Isolation boundary

---

## Store Technology

| Option | Description | Selected |
|--------|-------------|----------|
| Neon Postgres | SQL + Alembic, external vendor, built-in PITR/branching (research's primary rec) | |
| DynamoDB single-table | Pure-AWS, IAM-only, native PITR, no SQL | |
| Defer to --research-phase | Lock criteria, let planning confirm & recommend | |
| **SQLite on maderas behind Apache** (free-text) | Self-hosted SQLite file fronted by a small app, reverse-proxied through Apache on the existing nightly host | ✓ |

**User's choice:** "I think I just want sqlite fronted by something, running behind apache on maderas."
**Notes:** A deliberate pivot away from both research recommendations. maderas already runs the nightly pipeline and is already internet-facing behind Apache with TLS/domain. Accepted trade-off (surfaced by Claude): maderas is a single point of failure for availability — user confirmed acceptable ("community tool… more than one nine would be great… a little data loss is a bummer, not a major deal"). App layer confirmed as small Python app; Alembic confirmed ("I like Alembic OK").

---

## Backup & restore proof

User asked "What's wrong with 'just copy the file'?" → Claude explained the WAL torn-read hazard (raw `cp` can capture an inconsistent/partial snapshot) and the granularity trade-off; consistent snapshots via `VACUUM INTO`/`.dump` are the fix.

| Option | Description | Selected |
|--------|-------------|----------|
| Litestream + snapshot dump | Continuous WAL streaming (near-second PITR) + periodic snapshot; fully satisfies STORE-03 as written; one new daemon | |
| Snapshots only (relax PITR) | Frequent consistent snapshots → versioned S3, no Litestream; relax STORE-03 wording | |
| **Start snapshots, add Litestream later** | Ship snapshot-to-S3 now (test-restore against a snapshot = the gate); document Litestream as a later add | ✓ |

**User's choice:** Start snapshots, add Litestream later.
**Notes:** Matches the stated risk tolerance. STORE-03's "native PITR" wording to be relaxed accordingly.

---

## Schema Affordances

### Notes cardinality

| Option | Description | Selected |
|--------|-------------|----------|
| **Multiple author-owned notes** | Each expert owns an attributed note per species; stacked list, no merge machinery | ✓ |
| One canonical note per species | Single collectively-edited note; needs edit-conflict + ownership policy | |

**User's choice:** Multiple author-owned notes.

### Roles source

| Option | Description | Selected |
|--------|-------------|----------|
| **Committed allowlist file** | Git-tracked identity→role map; git history = audit trail; schema only needs author_id | ✓ |
| Roles table in SQLite now | In-DB roles from day one; needs seeding + admin affordance; more authoritative data to back up | |
| author_id now, decide source in 180 | Minimal store shape; defer role-source | |

**User's choice:** Committed allowlist file.

---

## Isolation Boundary

User asked "What buckets do we currently use?" → Claude enumerated: single SiteBucket (`beeatlasstack-sitebucket…`) holding `data/`/`db/`/`raw/`; supporting `beeatlas-cf-logs` + CDK bootstrap buckets; retired empty `beeatlas-data`; deployer OIDC role has broad read-write on SiteBucket.

| Option | Description | Selected |
|--------|-------------|----------|
| **New dedicated bucket** | Deployer role gets zero access (structural boundary); Versioning + optional Object Lock | ✓ |
| Fenced prefix in SiteBucket | Deny over an existing broad grant; easier to regress | |
| Revive empty beeatlas-data bucket | Un-retire the 2025-12-18 bucket | |

**User's choice:** New dedicated bucket.
**Notes:** User added: "Expire things older than, say six months?" → captured as a lifecycle rule (objects + noncurrent versions ~6 months). Dual-consumer read path (read-only SQLite WAL open by the nightly) captured without a separate question.

---

## Claude's Discretion

- Exact Python web framework (FastAPI vs Flask).
- Exact snapshot cadence (within "frequent enough").
- Precise `status` enum values and column names.

## Deferred Ideas

- Litestream continuous WAL replication — future add if RPO needs tightening.
- Roles table in SQLite — only if the committed allowlist file outgrows itself.
- ROADMAP.md revision for Phases 178/179 — the maderas pivot rewrites Phase 178 (no API Gateway/Lambda) and reshapes the "no server runtime" constraint story.
- REQUIREMENTS.md STORE-03 wording — relax "native PITR" to snapshot-based now / Litestream later.

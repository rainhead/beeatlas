# Phase 177: Authoritative Store, Migrations & Backup/DR - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up BeeAtlas's first *non-reproducible* authoritative store end-to-end, **before any write endpoint opens** (that is Phase 178):

- A store (technology decided here — see D-01) holding notes + author identity + timestamps + `status` + moderation/attribution affordances, seedable via a script (no write UI in this phase).
- A forward-only versioned migration runner with a `schema_migrations`-style ledger; no rebuild-from-source path.
- Physical + IAM separation from the derived `beeatlas.duckdb` and the S3 `/data/` prefix.
- A **demonstrated** backup restore.

Covers STORE-01..04. Out of scope: the write layer / OAuth (Phase 178), the notes harvest + public display (Phase 179), the moderation loop (Phase 180).

</domain>

<decisions>
## Implementation Decisions

### Store Technology — MAJOR PIVOT from research
- **D-01:** The authoritative store is a **SQLite database file on maderas**, fronted by a small application layer, reverse-proxied through **Apache**. This *rejects* the research SUMMARY's primary recommendation (Neon Serverless Postgres) and its viable alternative (DynamoDB single-table), and rejects the API Gateway + Lambda write-layer shape. Rationale: maderas already runs the nightly pipeline and is already internet-facing behind Apache with TLS + a real domain; the maintainer prefers self-hosted infrastructure they own over an external managed vendor.
- **D-02:** The app layer is a **small Python web app** (FastAPI or Flask — exact framework left to the planner). Python matches the dbt/pipeline-shaped team and the eventual Phase 178 needs (iNat OAuth + note CRUD).
- **D-03:** Migrations use **Alembic** (forward-only; `upgrade()` only) against SQLite, with the `schema_migrations` ledger Alembic provides. Migrations are owned/run by the **write-layer deploy**, **never** by `run.py` or the nightly cron (STORE-02).
- **D-04:** The store is **seedable via a script** (insert sample notes) — no write UI in this phase.
- **Accepted trade-off:** maderas becomes a single point of failure for authoritative-data *availability*. This is fine — a community tool, "more than one nine of uptime would be great," and "a little data loss is a bummer, not a major deal." Litestream/snapshots cover the data-loss half; availability is explicitly not a priority.

### Schema Affordances
- **D-05:** Tables: `notes` (species key = `canonical_name`, `author_id` = iNat identity, body [sanitized Markdown, rendered later], `status`, created/updated + audit columns), **append-only** `note_revisions` (soft-delete), plus the migration ledger. Shaped for moderation + attribution from day one so Phase 180 isn't a retrofit.
- **D-06:** **Multiple author-owned notes per species** — each allowlisted expert has their own attributed note; the page will render a stacked list (mirrors the Traits `*_source` stacking). No canonical-note merge/version/edit-conflict machinery.
- **D-07:** Roles live in a **committed allowlist file** (git-tracked, e.g. TOML), mapping iNat identity → role (reader = everyone, author = allowlisted, curator = can take down any note). Git history *is* the audit trail. The schema therefore only needs `author_id` on notes — **no `roles` table** in this phase. A roles table can be added later if the file outgrows itself.
- **D-08:** `status` is an enum flexible enough for the publish/takedown workflow that lands in Phase 178/180 (e.g. reserve `approved` / `removed`, with `pending` available). The write-time default workflow (immediate-publish vs pending) is a 178/180 decision, not this phase.

### Backup & Restore (STORE-03)
- **D-09:** Backup = **consistent snapshots**, not raw `cp`. Take snapshots via SQLite's online-backup API (`VACUUM INTO` / `.dump`), gzip, push to a **new dedicated S3 bucket**.
- **D-10:** **Litestream is deferred** — documented as a later add if write volume ever justifies tighter RPO (near-second PITR). This phase ships snapshots-only; RPO = snapshot interval, which matches the stated risk tolerance.
- **D-11:** **STORE-03 wording is relaxed:** the requirement's "native point-in-time recovery" leg is deferred with Litestream. The phase gate is satisfied by frequent consistent snapshots + a **demonstrated test-restore** from a snapshot. → **Update REQUIREMENTS.md STORE-03** to reflect snapshot-based recovery now, Litestream/PITR later, so the gate isn't read as unmet.
- **D-12:** Phase exit gate = a **documented, demonstrated test-restore** from a snapshot, before any public write is accepted (also feeds WRITE-04's launch gate).

### Isolation Boundary (STORE-04)
- **D-13:** Backups land in a **new dedicated S3 bucket** (added to the CDK `BeeAtlasStack` — surgical edit, never `cdk destroy`). The **GitHub OIDC deployer role gets ZERO access** to it — a structural boundary (pipeline principals cannot name it), not a `Deny` layered over the broad SiteBucket grant. Versioning ON; Object Lock optional.
- **D-14:** **Lifecycle rule:** expire backup objects after **~6 months**, and expire **noncurrent versions at ~6 months** too (so versions don't accumulate invisibly).
- **D-15:** The SQLite file lives **outside** `EXPORT_DIR` / `public/data/` and outside the `beeatlas.duckdb` path on maderas — so the nightly `s3 cp --recursive` (to `data/`/`db/`/`raw/`) and the DuckDB rebuild physically cannot reach it.
- **D-16:** **Dual-consumer read path:** the nightly harvest (Phase 179) opens the SQLite file **read-only in WAL mode** (SQLite's one-writer/many-readers model). No HTTP round-trip; the app need not be up during the nightly. (Alternative — read through the app's API — was considered and set aside as unnecessary.)
- **D-17:** STORE-04 demonstration = run a full `run.py`/dbt rebuild + push and confirm the SQLite file **and** its S3 backups are untouched.

### Claude's Discretion
- Exact Python web framework (FastAPI vs Flask) — planner's call.
- Exact snapshot cadence (e.g. hourly + post-nightly) — planner's call, within "frequent enough for the stated tolerance."
- Precise `status` enum values and column names — planner's call, subject to D-08.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone research (store-tech decision context — note the PIVOT)
- `.planning/research/SUMMARY.md` — v8.0 executive summary. **NB: this phase overrides its Neon/DynamoDB + Lambda recommendation** (D-01). Still authoritative for the derived-vs-authoritative split, pitfalls, and phase ordering.
- `.planning/research/STACK.md` — store/backup/migration options and PITR facts (Litestream context lives in the SQLite discussion here, not there).
- `.planning/research/ARCHITECTURE.md` — derived-vs-authoritative isolation model; the "provenance follows ultimate source" classification rule.
- `.planning/research/PITFALLS.md` — the 8 data-loss/liability pitfalls; #1–#4 (rebuild wipes store, no-backup-before-first-write, schema-diff misfire, `s3 sync --delete` reaches authoritative prefix) are this phase's to avoid.

### Derived-vs-authoritative contract (Phase 176 — the dependency)
- `data/artifacts.toml` — the declarative artifact contract; the eventual `notes.json` will be classified `authoritative` here (Phase 179), but the classification machinery already exists.
- `data/artifacts.py` — the tested loader driving publish/manifest/baseline-pull/build-time-fetch.
- `docs/adr/0002-derived-vs-authoritative-artifacts.md` — the two schema-evolution regimes; `authoritative` ⇒ forward-only, never a dbt model, `baseline_diff=false`.

### Infra & pipeline (what the store must be fenced from / read by)
- `infra/lib/beeatlas-stack.ts` — CDK stack; add the new backups bucket here (surgical edit). SiteBucket = `beeatlasstack-sitebucket397a1860-h5dtjzkld3yv`; deployer role `beeatlas-github-deployer` has `grantReadWrite` on it + `data/*`,`db/*`,`raw/*`.
- `data/nightly.sh` — the nightly cron entry point (S3 `cp --recursive` to `data/`/`db/`/`raw/`, manifest, CloudFront invalidation). The store must be unreachable from here.
- `data/run.py` — pure pipeline orchestrator; must NOT migrate or write the store (STORE-02).

### Requirements
- `.planning/REQUIREMENTS.md` — STORE-01..04 (and WRITE-04's dependency on the demonstrated restore). **STORE-03 needs a wording update per D-11.**

### Project memory (constraints)
- Memory `project_cdk_stack_composition` — `BeeAtlasStack` houses the whole site; surgical edit + `cdk deploy` only, never `cdk destroy`.
- Memory `project_taxon_id_milestone` — string taxon keys (`canonical_name`) are current; synthetic iNat-taxon-ID migration is a separate future milestone. Notes key on `canonical_name` for now (matches `species_traits`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CDK `BeeAtlasStack` (`infra/lib/beeatlas-stack.ts`) — extend with the new backups bucket + lifecycle rule; do not grant the deployer role.
- The Phase-176 artifact contract (`data/artifacts.toml` + `artifacts.py`) — already supports the `authoritative` classification the eventual `notes.json` needs (Phase 179).
- `species_traits` mart keyed on `canonical_name` — the join-key precedent notes should follow.

### Established Patterns
- maderas is the sole nightly execution host and already runs behind Apache with TLS — the store and app sit alongside the existing pipeline, not in AWS compute.
- Nightly S3 writes are `s3 cp --recursive` (additive) to `data/`/`db/`/`raw/` under one SiteBucket; the deployer OIDC role has broad read-write-delete on that bucket — hence the structural separate-bucket boundary (D-13).

### Integration Points
- Nightly harvest (Phase 179) → read-only SQLite open (D-16).
- Write-layer deploy (Phase 178) → owns Alembic migration runs (D-03) and hosts the app on maderas.

</code_context>

<specifics>
## Specific Ideas

- "SQLite fronted by something, running behind Apache on maderas" — the maintainer's own framing of D-01.
- Backup destination: a *new* dedicated bucket (not the retired empty `beeatlas-data`, not a fenced SiteBucket prefix), with ~6-month object + noncurrent-version expiration.
- Snapshots must be *consistent* (online-backup API), never a raw `cp` of the `.db` (WAL torn-read hazard).

</specifics>

<deferred>
## Deferred Ideas

- **Litestream continuous WAL replication** → future add if RPO needs tightening (D-10).
- **Roles table in SQLite** → only if the committed allowlist file outgrows itself (D-07).
- **ROADMAP.md revision for Phases 178/179** — the SQLite-on-maderas pivot means Phase 178 is no longer "API Gateway + Lambda" but a maderas-hosted service, and it reshapes the "static hosting only, no server runtime" constraint story into a deliberate, owned maderas runtime. Update the ROADMAP/PROJECT framing before planning Phase 178. (Flagged, not acted on — belongs to a roadmap edit, not this phase.)
- **REQUIREMENTS.md STORE-03 wording** — relax "native PITR" to snapshot-based now / Litestream later (D-11). Do this before the phase VERIFICATION reads the gate.

</deferred>

---

*Phase: 177-authoritative-store-migrations-backup-dr*
*Context gathered: 2026-07-03*

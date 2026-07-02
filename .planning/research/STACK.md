# Stack Research — v8.0 Authoritative Data Foundation

**Domain:** First authoritative, non-reproducible user-generated content (species natural-history notes) with a write path, layered onto an otherwise fully-static AWS-CDK site + Python/dbt/DuckDB batch pipeline.
**Researched:** 2026-07-02
**Confidence:** HIGH on write-layer/store options, AWS PITR, Neon/D1/DynamoDB facts, iNat OAuth shape; MEDIUM on exact sub-library patch versions (projected past Jan-2026 cutoff).

> Scope discipline: the existing read stack (TypeScript / Mapbox GL JS / Lit / wa-sqlite / hyparquet / dbt-duckdb / CDK / CloudFront / OIDC) is **fixed**. This file only covers what is *new* for accepting, storing, moderating, and serving authoritative notes. The read path stays 100% static — nothing here changes how the browser fetches Parquet/GeoJSON/JSON from CloudFront.

---

## The two load-bearing constraints that pick the stack

1. **Non-reproducible + backup-critical.** Every other byte the site serves is derived from iNat/Ecdysis and rebuildable; this data is not. Backup/PITR is a *safety* requirement, not a nicety. That rules out any store whose only backup is "copy the file yourself."
2. **The authoritative store must be readable by TWO consumers, not one.** The Lambda write layer *writes* it, but the **nightly Python pipeline on maderas must also read it** to bake approved notes into the static `species.json` that renders on species pages. So the store must be reachable both from an AWS Lambda *and* from the Python/dbt box. This subtly favors a SQL store the Python pipeline can query natively over a NoSQL store.

Plus the stated milestone requirements: a **relational** store, **forward-only versioned migrations** (no rebuild escape), a **thin managed write layer** (bounded exception to "no server runtime"), and **iNat OAuth** identity. The migration-tool list in the brief (Alembic / sqlite / D1 / Supabase migrations) is *all SQL* — the milestone clearly envisions a relational store, so the recommendation below is SQL, not DynamoDB.

---

## Recommended Stack

**API Gateway HTTP API + Lambda (Python 3.14) + Neon Serverless Postgres, migrations via Alembic, identity via iNaturalist OAuth2 PKCE, DR via Neon PITR + a nightly `pg_dump` into the existing S3 bucket.**

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **AWS API Gateway HTTP API** (`aws-apigatewayv2`) | CDK v2 (aws-cdk-lib ~2.2xx) | Public HTTPS write endpoint (`POST /notes`, `POST /notes/{id}/moderate`, `POST /session`) | HTTP API (v2) is ~70% cheaper and simpler than REST API; defined in the *existing* CDK stack; a Lambda authorizer verifies the app session JWT locally. Native fit — no new control plane. |
| **AWS Lambda** | Python **3.14** managed runtime | The "thin managed write layer": OAuth callback exchange, identity verification, note create/edit, moderation transitions | Lambda **now supports Python 3.14 as a managed runtime** (matches the pipeline's 3.14 exactly). Scale-to-zero → effectively free at expert-note volume. It reintroduces a *runtime* but as event-driven functions, not an always-on server — the retired Function-URL Lambda was killed for OOM/timeout on the *heavy nightly pipeline*, a completely different workload. Deploys through the same CDK + GitHub-OIDC path already in place. |
| **Neon Serverless Postgres** | Postgres 17, Neon platform (Databricks-owned since May 2025) | The authoritative relational store for moderated notes | Real relational Postgres (satisfies "relational + forward-only migrations"); **scale-to-zero** (5-min idle) so idle cost ≈ $0; free tier = 0.5 GB + 100 CU-hrs + scale-to-zero; **PITR built in** (7 days on the usage-based Launch plan, 30 on Scale); **branching** gives a throwaway copy for testing a migration before it touches prod. Reachable over TLS from *both* the Lambda write layer *and* the Python nightly pipeline (psycopg) — no VPC needed (public pooled endpoint + PgBouncer). Databricks backing makes it a safe multi-year bet for non-reproducible data. |
| **iNaturalist OAuth2** (Authorization Code + **PKCE**) | live API, base `https://www.inaturalist.org` | Identity — collectors already have iNat logins; iNat *is* the identity provider | No second identity system to reconcile. iNat officially supports the **PKCE** variant designed for public/no-secret SPAs. (Flow details below.) |
| **Alembic** | ~1.16.x (with SQLAlchemy 2.0.x) | Forward-only versioned migrations for the notes schema | Idiomatic Python — the same language/mental-model as the dbt/pipeline team. Enforce "forward-only" by convention: author `upgrade()` only, leave `downgrade()` as `raise NotImplementedError`. Each migration is a numbered, reviewed, committed file — exactly the "no rebuild escape" the milestone wants. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `psycopg[binary]` | ~3.2.x | Postgres driver for Lambda + nightly pipeline | The Lambda handler and `species.json` builder both talk to Neon. |
| `SQLAlchemy` | 2.0.x | Thin data-access + Alembic backbone | Keep it minimal (Core, not a heavy ORM) for a 2–3 table schema. |
| `PyJWT` | ~2.x | Mint + verify the short-lived **app session JWT** (HS256) | Lambda authorizer verifies sessions locally so writes don't hit iNat on every request. |
| `oauth4webapi` (frontend) *or* ~30 lines of Web Crypto | ~3.x | PKCE code-challenge (S256) generation in the SPA | The existing Lit SPA drives the `/oauth/authorize` redirect + `/oauth/token` exchange. Hand-rolling S256 with `crypto.subtle` is viable and dependency-free. |
| AWS SSM Parameter Store *(SecureString)* or Secrets Manager | — (CDK-native) | Hold the Neon connection string + the app-JWT signing secret | Parameter Store SecureString is free and sufficient; Lambda reads it via IAM (no secret in code). maderas gets the same connection string in its nightly env. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| AWS CDK v2 (existing `infra/`) | Define HTTP API + Lambda + IAM + SSM params | New constructs land in `BeeAtlasStack` — never `cdk destroy` (see project memory); surgical add + `cdk deploy`. |
| `alembic upgrade head` (CI step) | Apply migrations forward on deploy | Run against a **Neon branch** first, then prod, from the OIDC deploy job. |
| Neon branching | Zero-cost throwaway DB to rehearse a migration | `neon branches create` → run `alembic upgrade head` → verify → discard. |

## Installation

```bash
# Write-layer Lambda (data/ or a new writer/ package, pinned to Lambda's Python 3.14)
uv add psycopg[binary] sqlalchemy alembic pyjwt httpx

# Infra (infra/ — CDK v2 already present)
npm install   # aws-cdk-lib already includes apigatewayv2 + lambda + dynamodb constructs

# Frontend (optional PKCE helper; or hand-roll with Web Crypto)
npm install oauth4webapi
```

---

## Auth: the concrete iNaturalist OAuth2 flow (verified)

iNat is an OAuth2 provider and **supports PKCE** specifically for "clients that cannot store a secret securely, e.g. client-side JavaScript." Use `https://www.inaturalist.org` as the base for all auth so credentials stay TLS-encrypted.

**1. SPA → authorize (browser redirect, PKCE):**
```
GET https://www.inaturalist.org/oauth/authorize
    ?client_id=<APP_ID>
    &redirect_uri=<static-site callback>
    &response_type=code
    &code_challenge=<BASE64URL(SHA256(verifier))>
    &code_challenge_method=S256
```
Store the `code_verifier` in session/localStorage before redirecting.

**2. SPA → token exchange (public client, no secret):**
```
POST https://www.inaturalist.org/oauth/token
    grant_type=authorization_code
    client_id=<APP_ID>
    redirect_uri=<callback>
    code=<from step 1>
    code_verifier=<stored verifier>
→ { access_token, token_type: "Bearer", ... }
```

**3. Exchange OAuth token → JWT (required for the node API):**
```
GET https://www.inaturalist.org/users/api_token
    Authorization: Bearer <access_token>
→ { api_token: "<JWT>" }   # JWT valid ~24 hours
```

**4. Resolve identity server-side (this is how the write layer verifies WHO is calling):**
```
GET https://api.inaturalist.org/v1/users/me
    Authorization: <JWT>          # ⚠ node API wants the raw JWT, NOT "Bearer <JWT>"
→ results[0]: { id, login, name, ... }
```

**Recommended session handling (keeps the read path static, avoids hammering iNat):**
- SPA completes steps 1–3, then POSTs the iNat JWT once to Lambda `POST /session`.
- Lambda validates it by calling `/v1/users/me`, reads `login`/`id`, checks a **moderator allowlist** (small committed list or a `role` column), then **mints its own short-lived app session JWT** (HS256, secret from SSM) carrying `{inat_id, login, is_moderator, exp}` and returns it.
- Subsequent writes carry the *app* JWT; the API Gateway **Lambda authorizer verifies it locally** — no per-request iNat round-trip, and iNat downtime never blocks an already-authenticated session.
- iNat's api_token is signed with iNat's secret (not third-party-verifiable), which is *why* you call `/v1/users/me` to validate rather than verifying the JWT signature yourself.

---

## Backup / DR (the safety-critical part)

Belt **and** suspenders, both independent of any single vendor:
1. **Neon PITR** — restore to any point in the retention window (7 days Launch / 30 days Scale) with no manual backup management. Use for oops-recovery (bad migration, accidental delete). Rehearse migrations on a Neon **branch** first.
2. **Nightly `pg_dump` → the existing versioned S3 bucket.** The nightly pipeline already reads Neon to build `species.json`; add a `pg_dump` of the notes schema into S3 (which the team owns, understands, and already lifecycle-manages). This is a store-independent logical backup in infrastructure you control — the true "unrecoverable-loss" insurance. Do this regardless of which store you pick.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Neon Postgres | **DynamoDB single-table (pure-AWS)** | If eliminating the *one* non-AWS vendor and staying 100% inside CDK/OIDC outweighs the relational requirement. See detailed writeup below — this is the **one viable alternative**. |
| Neon Postgres | **Turso / libSQL (hosted SQLite over HTTP)** | Works from both Lambda and the Python pipeline (libsql client), 90-day PITR, cheap, and SQLite matches the frontend's wa-sqlite mental model. **But** the platform is mid-pivot: libSQL is being succeeded by a from-scratch Rust rewrite ("Turso Database", still beta). Vendor turbulence is a poor bet for a store you must trust for years. Choose only if you specifically want hosted SQLite and accept the roadmap risk. |
| Neon Postgres | **Supabase (Postgres + Auth + PostgREST + Studio)** | If you expect a *lot* more UGC surface soon — Supabase gives an auto REST API, row-level security, and a ready-made moderation admin UI (Studio) out of the box, fastest path to a moderation MVP. For a single prose field it's more platform than needed, and it's a heavier new vendor (you adopt PostgREST + RLS + their auth). |
| Alembic (forward-only) | **sqitch / dbmate / plain numbered `.sql` + tiny runner** | If you'd rather keep migrations language-agnostic and out of Python. Alembic wins here only because the team already lives in Python. |

### The one viable alternative in full: pure-AWS DynamoDB

**API Gateway HTTP API + Lambda + DynamoDB single-table.**

- **Fits the shop hardest:** zero non-AWS vendors, everything in `BeeAtlasStack`, **no DB password anywhere** — Lambda and maderas both reach DynamoDB via IAM. One control plane, one auth model.
- **Backup:** **PITR 1–35 days** ($0.20/GB-month; at notes volume, pennies) + native **Export-to-S3** for the logical dump. Excellent DR story with no extra tooling.
- **Cost:** on-demand billing → effectively free at expert-note write volume.
- **The tradeoff you accept:** DynamoDB is **NoSQL, not relational** — you give up SQL and Alembic. "Forward-only migrations" become versioned single-table item-shape evolution (a `schema_version` attribute + a one-off migration Lambda), which is *coherent* but not what the milestone's migration-tool list describes. The nightly pipeline reads it via `boto3` scan rather than SQL — workable but less natural for a dbt-shaped team.
- **Choose it if** the requirements author decides "no external vendor + IAM-only access + native PITR" beats "relational + Alembic." This is a genuinely defensible call; the recommendation above only edges it out because the brief explicitly asks for a relational store with SQL migrations.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Cloudflare Workers + D1** | D1 is GA and technically excellent (Time Travel = 30-day PITR, 7 on free), but it introduces an **entire second cloud** next to AWS — a second control plane, second IAM, a Wrangler/OIDC deploy path CDK can't manage, and a Cloudflare-HTTP hop for the Python pipeline to read notes. Fights the single-vendor AWS-CDK/OIDC shop for no domain benefit. | Keep compute in AWS (Lambda) where CDK/OIDC already live. |
| **PocketBase** | Delightful single-Go-binary (SQLite + admin UI + auth + REST), but it is an **always-on server** you must host and keep alive — reintroducing exactly the persistent runtime the team deliberately avoids, with single-node backup (copy the file / Litestream). | Lambda scale-to-zero + a managed store. |
| **Aurora Serverless v2 / RDS** | Relational, yes — but heavy for one notes table: VPC wiring (Lambda-in-VPC cold starts), a non-zero minimum bill, connection-pool management. Over-engineered for a single vertical slice. | Neon (scale-to-zero, public pooled endpoint, no VPC). |
| **DuckDB / SQLite-on-Lambda as the *system of record*** | DuckDB is analytical/embedded and the pipeline's DuckDB is explicitly a *cache*; embedded SQLite-on-Lambda has no concurrent-write or managed-backup story. Never make the authoritative, non-reproducible store an embedded analytical engine. | A managed OLTP store (Neon / DynamoDB). |
| **Turso *Database* (the new Rust rewrite)** | Still **beta**. Never build authoritative, non-reproducible data on a beta engine. | If you want hosted SQLite, use production libSQL — but prefer Neon (see alternatives). |
| **Cognito / Auth0 / Clerk / Supabase Auth** | A second identity system to reconcile against iNat logins the collectors *already have*. Pure added surface. | iNat OAuth2 PKCE *is* the identity. |
| **A CMS (Strapi / Directus / Sanity / Contentful) or GraphQL layer** | Running/paying for a whole content platform (or a GraphQL server) for one prose field per species. | 3 REST endpoints on API Gateway + a gated moderation view in the existing Lit SPA. |
| **Queues / Kafka / event-sourcing** | Massive overkill for a moderation loop that processes a handful of expert edits. | Synchronous Lambda writes; status column drives the moderation state machine. |

---

## Migration tooling, idiomatic per store (reference)

| Store | Forward-only migration tool | Notes |
|-------|-----------------------------|-------|
| **Neon / Postgres (recommended)** | **Alembic** | Numbered revision files; author `upgrade()` only. Rehearse on a Neon branch, then `alembic upgrade head` from the OIDC deploy job. |
| DynamoDB | *(no schema)* | Versioned item-shape evolution + `schema_version` attribute + a one-off migration Lambda. |
| Cloudflare D1 | `wrangler d1 migrations` | Numbered `.sql` applied forward. |
| Turso / libSQL | dbmate / golang-migrate / Atlas (or Alembic via a libsql SQLAlchemy dialect) | No first-party migration tool. |
| Supabase | `supabase migration` / `supabase db push` | Numbered SQL over Postgres; forward-only. |

---

## Integration points with existing infra

- **CDK (`infra/`):** add HTTP API + writer Lambda(s) + Lambda authorizer + SSM SecureString params to `BeeAtlasStack`. Surgical add, `cdk deploy`. Never `cdk destroy`.
- **GitHub OIDC deploy role:** extend the existing role's policy to deploy the new Lambda/APIGW and read the SSM params; add an `alembic upgrade head` step (against a Neon branch, then prod). No long-lived AWS keys — same as today.
- **Nightly pipeline (maderas):** add a step that (a) reads `status='approved'` notes from Neon via psycopg and merges them into `species.json` (Path-B merge, same pattern as v7.0 traits — no `species.parquet`/contract change), and (b) `pg_dump`s the notes schema into the existing S3 bucket. The read path stays static: the browser still fetches `species.json` from CloudFront; it never talks to the write layer to *display* notes.
- **Manifest/artifact contract (v8.0 Phase 1):** the derived-vs-authoritative split is the seam — `species.json` remains a *derived* artifact (on the diff-against-live gate); the Neon notes table is the *authoritative* source that feeds it.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Lambda Python 3.14 runtime | pipeline Python 3.14 | Confirmed available as a managed runtime — write layer can match the pipeline exactly. |
| psycopg 3.2.x | SQLAlchemy 2.0.x + Alembic 1.16.x | Standard, well-supported combination. |
| Neon (public pooled endpoint) | Lambda **without VPC** | Neon is public + TLS + PgBouncer pooling → no VPC/NAT needed; avoids the classic Lambda-in-VPC cold-start tax. |
| iNat node API (`api.inaturalist.org/v1`) | JWT from `/users/api_token` | ⚠ Header is raw `Authorization: <JWT>`, *not* `Bearer <JWT>` — a known gotcha. JWT expires in ~24h. |

---

## Sources

- https://www.inaturalist.org/pages/api+reference — iNat OAuth2 (Authorization Code + **PKCE**), base URL `www.inaturalist.org` (HIGH; page 403s to automated fetch, corroborated across results)
- https://pyinaturalist.readthedocs.io/en/stable/user_guide/authentication.html — `/users/api_token` JWT endpoint, ~24h validity (HIGH)
- iNat API Recommended Practices + community forum — OAuth→JWT exchange (`curl -H "Authorization: Bearer OAUTH" .../users/api_token`), raw-JWT header for node API (HIGH)
- https://developers.cloudflare.com/d1/reference/time-travel/ — D1 GA (Apr 2024), Time Travel 30-day PITR (HIGH; considered, not chosen)
- https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html — DynamoDB PITR 1–35 days, $0.20/GB-mo (HIGH)
- https://aws.amazon.com/blogs/compute/python-3-14-runtime-now-available-in-aws-lambda/ — Lambda Python 3.14 managed runtime (HIGH)
- https://neon.com/pricing + Databricks-acquisition coverage — Neon scale-to-zero, PITR 7d Launch / 30d Scale, branching, Postgres, Databricks-owned (HIGH)
- https://turso.tech/blog/upcoming-changes-to-the-turso-platform-and-roadmap + github.com/tursodatabase/turso — libSQL production-ready but succeeded by the beta Rust "Turso Database" rewrite → vendor-turbulence flag (MEDIUM-HIGH)

---
*Stack research for: authoritative UGC write layer on a static AWS-CDK + Python/dbt/DuckDB site*
*Researched: 2026-07-02*

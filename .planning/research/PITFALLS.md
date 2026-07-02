# Pitfalls Research

**Domain:** Adding authoritative, non-reproducible user-generated content (moderated species notes) + a thin write layer + OAuth to a previously read-only, 100%-derived static site (S3/CloudFront, nightly Python/dbt/DuckDB pipeline)
**Researched:** 2026-07-02
**Confidence:** HIGH (grounded in the actual `data/nightly.sh` sync/manifest/gate code + PROJECT.md framing; external OAuth/moderation practices MEDIUM)

> **Framing (from PROJECT.md):** every byte the site serves today is *derived* from iNat/Ecdysis and fully reproducible. The DuckDB (`data/beeatlas.duckdb`) is a **cache, not a system of record** — `nightly.sh` literally does `s3 cp` the DB down, rebuilds it with `run.py`, and `s3 cp`s it back up. That pull→rebuild→push round-trip, `--recursive` overwrites, content-hashing, and the bypass-and-rebuild schema-change dance are all *safe today precisely because losing any byte costs one pipeline run*. Authoritative user notes break that invariant: **losing them is unrecoverable, and they cannot be diffed against a rebuildable baseline.** Every pitfall below is a place where a habit that is correct for derived data becomes destructive for authoritative data.

---

## Critical Pitfalls

### Pitfall 1: The nightly rebuild wipes authoritative data (the cache-is-system-of-record trap)

**What goes wrong:**
Authoritative notes are stored in the same `beeatlas.duckdb` that `nightly.sh` treats as a cache. The nightly does `aws s3 cp "$DB_PATH" s3://.../$DB_S3_KEY` (upload) and pulls it back next run (lines 88/101). If the notes table lives in that DB, a `dbt build --full-refresh`, a `DROP … CREATE`, a schema-change rebuild, or simply a run that *doesn't* re-populate the table (because there is no upstream source to populate it from) leaves the table empty — and the push overwrites the only surviving copy in S3. One green nightly and the notes are gone with no source to regenerate them.

**Why it happens:**
Every prior milestone's mental model is "the DB is disposable; rebuild fixes everything." dbt's whole ergonomic is idempotent rebuild-from-source. Authoritative data has no source, so "rebuild" = "delete."

**How to avoid:**
- **Physically separate the authoritative store from the pipeline DuckDB.** The notes must not be a dbt model and must not live in a table the nightly `cp`s or `dbt build` touches. Options: a distinct store (separate SQLite/DuckDB file, DynamoDB table, or Postgres) that the pipeline *reads from as a source* but never *writes to* and never *overwrites*.
- If it must sit near the pipeline, the pipeline's job is **ingest (read-only) into a derived projection**, never mutate the authoritative rows.
- Mark it `authoritative` in the new declarative artifact contract (Phase 1) so tooling refuses to `--full-refresh` / overwrite it.
- **Never `s3 cp`/`s3 sync --delete` over the authoritative store.** Writes to it are append/update through the write layer only.

**Warning signs:**
A dbt model named `notes`; the notes table appearing in `manifest.json`; the notes living inside `beeatlas.duckdb`; any code path that recreates the notes table from a SELECT; a nightly log line that uploads a DB containing notes.

**Phase to address:** **Phase 2 (authoritative store)** designs the physical separation; **Phase 1 (build-seam)** establishes the `derived` vs `authoritative` declared property that makes "the pipeline may never overwrite this" machine-checkable.

---

### Pitfall 2: No backup / PITR exists *before the first real note is written*

**What goes wrong:**
Backup is treated as a "harden later" task. The write layer ships, a handful of real experts write genuinely valuable WA-specific prose, and *then* a bad migration, a fat-fingered `DELETE`, or a store misconfiguration destroys it — with no snapshot to restore. Unlike every prior incident in this project, there is no `run.py` to re-derive it.

**Why it happens:**
In a derived-data world backups were pointless (S3 versioning on regenerable artifacts is theater), so the team has no backup muscle memory. Backup feels like polish, so it slides right in the schedule.

**How to avoid:**
- **Backup is a launch gate, not a follow-up.** The store must have automated point-in-time recovery / snapshots *turned on and test-restored* before the write endpoint accepts its first non-test write. PROJECT.md already lists "safety-critical backup" as an explicit target — treat it as a hard predecessor of "open writes."
- Prefer a store with built-in PITR (DynamoDB continuous backups, RDS/Aurora automated backups, or Litestream/S3-versioned snapshots for SQLite).
- **Enable S3 Versioning + a deny-delete/MFA-delete-style guard on the authoritative bucket/prefix** so an overwrite is recoverable even if app-level backup fails.
- **Rehearse a restore** as an acceptance test — an untested backup is not a backup.

**Warning signs:**
"We'll add backups after launch"; the write endpoint is reachable but no snapshot has ever been restored; the store has no versioning; backup config exists but has never been exercised.

**Phase to address:** **Phase 2** (store creation) provisions backup/PITR + versioning; **Phase 3 (write layer)** must not enable public writes until a restore has been demonstrated. Make "test-restore performed" a Phase 3 acceptance criterion.

---

### Pitfall 3: The schema-diff integration gate misfires on authoritative tables (the bypass-and-rebuild dance turns destructive)

**What goes wrong:**
The nightly integration gate (`test_dbt_diff`) iterates **every** `manifest.json` key, pulls the published artifact as a baseline, rebuilds from source, and asserts equality (lines 143–190 of `nightly.sh`). Its escape hatch for legitimate schema changes is **bypass the gate (`SKIP_INTEGRATION_GATE=1`) then rebuild to regenerate the baseline** — documented in memory `project_occurrences_contract_release_sequence`. Point that machinery at an authoritative table and two failure modes appear: (a) it can never pass, because there is no reproducible baseline to diff against — the live table legitimately differs from any rebuild; (b) far worse, an operator following the muscle-memory "bypass + rebuild to make the diff green" dance **regenerates the authoritative table from nothing, wiping it**, and the now-empty table happily matches the freshly-rebuilt-empty baseline. Green gate, destroyed data.

**Why it happens:**
The gate was designed on the axiom "everything published is reproducible." The bypass-and-rebuild remediation is a *reflex* the operator has used across many contract bumps (36→37→38→39). Nobody re-examined whether the reflex is safe when the artifact is a system of record.

**How to avoid:**
- **Authoritative tables must be structurally excluded from the diff-against-live-baseline gate.** In Phase 1's declarative contract, `derived` artifacts stay on the `test_dbt_diff` gate; `authoritative` artifacts are routed to a *different* verification (schema-shape/contract check + row-count-floor + "did the migration run cleanly," never content-equality-vs-rebuild).
- Replace the free-text `LOCAL_NAMES` / `INTENTIONALLY_SKIPPED` sets with the single declarative contract, and make the classifier **fail loud** if an artifact is neither `derived` nor `authoritative` (no silent default that could sweep a note table onto the wrong gate).
- **Make the rebuild path physically unable to touch authoritative rows** (Pitfall 1) so that even a mis-invoked bypass-rebuild cannot empty them.
- Forbid `--full-refresh` / rebuild verbs against anything tagged `authoritative` at the tool level.

**Warning signs:**
The notes table has a `manifest.json` key; `test_dbt_diff` output mentions the notes artifact; an operator reaches for `SKIP_INTEGRATION_GATE=1` in the context of the notes table; the classifier's "unknown key → skip" branch swallows a new authoritative artifact.

**Phase to address:** **Phase 1 (build-seam refoundation)** — this *is* the milestone's Thread-1 reason for being. The declarative contract must split the two verification regimes; verify by attempting a rebuild and confirming the authoritative table is untouched.

---

### Pitfall 4: `s3 sync --delete` / `--recursive` overwrite reaches an authoritative prefix

**What goes wrong:**
The nightly already does `aws s3 cp --recursive` over `feeds/`, `species-maps/`, `place-maps/` and a plain `cp` overwrite of the DuckDB and manifest. A future convenience edit — "just sync the whole `/data/` prefix," or adding `--delete` to prune stale hashed artifacts — silently deletes or clobbers any authoritative artifact that shares the prefix. Content-immutable hashed naming (used for derived artifacts) tempts a `--delete` sweep of "orphaned" objects; an authoritative object with a stable (non-hashed) key looks like an orphan.

**Why it happens:**
`--delete` is the natural way to keep a hashed-artifact bucket tidy. The authoritative object doesn't participate in the hash-and-manifest scheme, so cleanup logic treats it as garbage.

**How to avoid:**
- **Put authoritative data under its own bucket or a clearly-fenced prefix** that no pipeline sync command names — ideally a *different bucket* with S3 Versioning + a bucket policy denying `DeleteObject`/overwrite to the pipeline's OIDC role.
- Grant the nightly's IAM identity **no write/delete permission** on the authoritative prefix (least privilege makes the mistake impossible, not just discouraged).
- Never introduce `--delete` to a sync that could name the authoritative prefix; if pruning derived orphans is needed, scope it to the hashed `data/<hash>` objects explicitly.

**Warning signs:**
Any `s3 sync … --delete`; a `cp --recursive` whose destination prefix contains authoritative objects; the pipeline OIDC role holding `s3:DeleteObject` on the notes prefix.

**Phase to address:** **Phase 2** (bucket/prefix + IAM boundary) and **Phase 1** (the contract declares which prefixes are authoritative so sync scoping is derivable).

---

### Pitfall 5: No takedown path / moderation loop for hosted user content (legal + reputational)

**What goes wrong:**
The site becomes a publisher of arbitrary free-text prose. Someone posts defamation, harassment, copyrighted text, PII (a collector's home address, a rare-species locality that invites poaching), or offensive content — and there is no way to remove it quickly, no audit trail of who wrote what, and no pre-publication gate. For a US volunteer-science project this is both a liability exposure and a trust-destroying incident.

**Why it happens:**
The "thin vertical slice" framing makes moderation feel like scope creep. The team's instinct is "our experts are trustworthy," ignoring account compromise, disgruntlement, and honest mistakes (PII pasted inadvertently).

**How to avoid (minimum viable safety):**
- **Moderation-before-publish for the first release.** New/edited notes enter a pending state; a maintainer approves before public display. This is far cheaper than reactive moderation and matches the project's existing curator-gate culture (dedup CSV sign-off, name-resolution human-review gate).
- **A one-action takedown / unpublish** that a maintainer can invoke without a deploy (flip a `status` column), plus **hard-delete with audit retention**.
- **Full attribution + audit trail**: every note version records author iNat identity, timestamp, and prior content (this also gives you edit history for free and supports vandalism rollback).
- **Restrict who can write.** Gate writing to authenticated iNat users, and consider an allowlist (WABA participants) for v1 rather than "anyone with an iNat login." This shrinks the abuse surface dramatically for a single-slice launch.
- **PII/locality guidance in the UI** ("do not post precise localities of sensitive taxa; do not post personal contact info") and a reporting affordance.
- Note US §230 generally protects platforms for third-party content, **but** approval-before-publish and takedown are still the right operational posture; copyright (DMCA) needs a takedown path regardless.

**Warning signs:**
Notes render publicly the instant they're submitted; no `status`/`is_published` column; no author identity stored; no way to remove a note without a code deploy; "our users are trusted" as the entire abuse model.

**Phase to address:** **Phase 4 (notes feature + moderation)** owns the loop, but **Phase 2** must include the schema affordances (`status`, `author_id`, version/audit columns) so moderation isn't bolted on. Verify with an end-to-end "submit → pending → approve → publish → takedown" walkthrough.

---

### Pitfall 6: OAuth token leakage / no PKCE in a static SPA

**What goes wrong:**
A static SPA cannot hold a client secret. Teams reflexively copy a server-side "authorization code + client secret" or "implicit flow" example. The result is either a leaked client secret shipped in JS, or an access token in the URL fragment / `localStorage` that any XSS or third-party script can exfiltrate. iNat OAuth tokens then let an attacker act as the user *on iNaturalist itself*, not just on BeeAtlas.

**Why it happens:**
The site has never had auth. Most OAuth tutorials assume a confidential server client. The static-hosting constraint conflicts with the classic code-exchange flow.

**How to avoid:**
- **Authorization Code flow with PKCE**, treating the app as a **public client** (no secret in the browser). Verify iNat's OAuth supports PKCE; if it only supports confidential code exchange, the **thin write layer (Phase 3) performs the code→token exchange server-side** and the browser never sees the iNat client secret or long-lived tokens.
- **Do not use the implicit flow** (deprecated; leaks tokens in the URL).
- **Never store long-lived tokens in `localStorage`.** Prefer the write layer minting its own **short-lived, HttpOnly, SameSite session cookie / signed session token** after verifying the iNat identity, and keeping the iNat access token server-side (or discarding it after identity verification if you only need "who is this").
- **Request the narrowest scope.** For "who is this user," you likely need only identity/`login`, not write scope on iNat. Do not request write/delete scopes you never use.
- **Pin the redirect URI** to an exact registered value; reject others.

**Warning signs:**
A client secret anywhere in the frontend bundle; access token in a URL fragment or `localStorage`; `response_type=token`; broad scopes; wildcard redirect URIs.

**Phase to address:** **Phase 3 (write layer + auth)**. Verify by inspecting the network flow (no secret in bundle, no token in URL, PKCE `code_challenge` present) and confirming scope minimality.

---

### Pitfall 7: Trusting client-supplied identity on the write endpoint (authz bypass + CSRF)

**What goes wrong:**
The write endpoint accepts the author's iNat login (or user id) as a **request field** the client sets, or authorizes writes based on anything the browser asserts. An attacker posts as any user, edits anyone's note, or (via CSRF) rides a logged-in maintainer's session to approve/delete content. Because notes are authoritative and public, forged authorship is a credibility attack on a scientific resource.

**Why it happens:**
Client-driven habits from a read-only SPA (everything is a client-side param). The write layer is "thin," so identity plumbing gets shortcut.

**How to avoid:**
- **Identity is derived server-side from the verified session token, never from the request body.** The write layer resolves "who is calling" from the validated session and ignores any client-supplied author field.
- **CSRF protection on state-changing endpoints**: use a non-cookie bearer token (Authorization header) so cross-site form posts can't carry credentials, *or* SameSite=strict cookies + a CSRF token. Reject writes lacking the expected header/origin.
- **Server-side authorization checks**: only the author may edit their note; only maintainers may approve/take down. Enforce in the endpoint, not the UI.
- **Validate/normalize/escape all free-text server-side** (length caps, strip control chars, treat as untrusted on render — see Pitfall 8).

**Warning signs:**
An `author` / `user_id` field in the write request body that the server trusts; authorization decisions only in frontend code; no CSRF/origin check on POST/PUT/DELETE; the approve/takedown endpoints reachable with only a cookie.

**Phase to address:** **Phase 3 (write layer + auth)** for identity/CSRF; **Phase 4** for the author-vs-maintainer authorization matrix. Verify with a forged-author request and a cross-origin POST that must both be rejected.

---

### Pitfall 8: Stored XSS via free-text notes rendered into public pages

**What goes wrong:**
Notes are expert *prose* that gets rendered onto public species pages. If markdown/HTML is allowed and not sanitized, a note can inject `<script>` or event-handler attributes that execute for every visitor — including maintainers whose session could then be used to approve/delete content (chaining into Pitfall 7).

**Why it happens:**
"It's just text from trusted experts." Rich formatting (links, emphasis) invites permitting HTML/markdown, and sanitization is easy to under-do.

**How to avoid:**
- **Escape on render by default.** If formatting is desired, allow a **restricted, server-sanitized markdown subset** (no raw HTML, links `rel="noopener nofollow"`, no `javascript:` URIs) with a vetted sanitizer.
- Sanitize/validate **server-side at write time and escape at render time** (defense in depth).
- The moderation-before-publish gate (Pitfall 5) is also an XSS backstop — a human sees the content before it's live.

**Warning signs:**
Notes rendered with `innerHTML`/`{{! raw }}` without sanitization; raw HTML permitted; no link/protocol allowlist.

**Phase to address:** **Phase 4 (notes feature)**. Verify by submitting a note containing `<script>` and an `onerror=` image and confirming it renders inert.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store notes as a dbt model inside `beeatlas.duckdb` | Reuses existing export/manifest plumbing | Nightly rebuild/`cp` wipes them; gate misfires (Pitfalls 1, 3) | **Never** |
| Public writes before backup/PITR is test-restored | Ship the demo sooner | First data-loss incident is unrecoverable | **Never** |
| Publish-on-submit, "we'll moderate reactively" | No approval UI to build | First abusive/PII/defamatory post is live with no takedown | **Never** for public content |
| `localStorage` bearer token | Simplest SPA auth | XSS exfiltrates an iNat token (Pitfall 6) | Never for iNat tokens; short-lived app session only, HttpOnly preferred |
| One shared "notes" S3 prefix under `/data/` | One bucket to manage | A future `--delete` sync clobbers it (Pitfall 4) | Only with Versioning + deny-delete IAM boundary |
| Build the full declarative-contract + migration framework now | Feels rigorous | Over-engineered for one authoritative table (see below) | Build the contract (the gate needs it); keep migrations minimal-but-forward-only |
| Anyone-with-iNat-login can write | Max reach | Large abuse surface for a single-slice launch | Later, once moderation scales; start allowlisted/WABA-gated |
| Reuse the retired pipeline-Lambda pattern verbatim | Familiar | Reintroduces the OOM/timeout/cold-start problems that got it retired | Only a *thin* write handler (no pipeline), distinct from the retired 15-min pipeline Lambda |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| iNat OAuth | Implicit flow / client secret in bundle | Auth-code + PKCE public client, or server-side code exchange in the write layer (Pitfall 6) |
| iNat OAuth | Over-broad scope (write/delete on iNat) | Request only identity; you need "who is this," not iNat write access |
| iNat OAuth | Wildcard/loose redirect URI | Exact registered redirect URI; reject mismatches |
| Write endpoint (new runtime) | Missing/permissive CORS → either broken or wide-open | Allowlist the CloudFront origin(s) only; credentials mode consistent with the session mechanism |
| Write endpoint | No rate limiting → spam/abuse floods the store | Per-identity + per-IP rate limits; the moderation queue is not a rate limiter |
| S3 authoritative store | Pipeline OIDC role can delete/overwrite it | Separate bucket/prefix, Versioning, deny-delete for the pipeline role (Pitfall 4) |
| Secrets for the write layer | New secret surface (iNat client secret, session signing key) in repo/env | AWS Secrets Manager / SSM; never in the frontend or committed; rotate-able |
| CloudFront + dynamic writes | Caching the write endpoint or serving stale approved notes | Writes bypass the CDN (separate origin/path, no-cache); published notes invalidate the relevant page |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Cold starts on the new runtime | First write after idle is slow/times out; UX feels broken | Lightweight handler (fast cold start); provisioned concurrency only if warranted; the write path is low-QPS so keep it cheap | Low-traffic project → almost always cold; noticeable from day one but tolerable if the handler is thin |
| Serving notes as another runtime read on every page | Species pages now depend on a live service; latency + cost + availability regression vs static | Keep the **read path static**: publish approved notes into a derived, cached artifact (build-time or on-approval regeneration), served from CloudFront like everything else | Whenever the write layer lands on the read hot path |
| Unbounded note length / count per species | Store bloat; slow render; expensive backups | Length caps + one-current-version-per-(species,author) with a history table | Rare at project scale, but caps are cheap insurance |
| Cost creep from the reintroduced runtime | Monthly AWS bill rises; idle cost for a rarely-used endpoint | Prefer pay-per-invoke (Lambda/Function URL) over always-on; alarm on invocation count + cost | Any always-on choice for a low-QPS write path |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting client-supplied author identity | Forged authorship on a scientific resource | Derive identity from the verified session only (Pitfall 7) |
| No CSRF/origin check on write/approve/delete | Cross-site forced writes / maintainer-session abuse | Header-based bearer or SameSite+CSRF token; origin allowlist (Pitfall 7) |
| Stored XSS from note prose | Script runs for all visitors incl. maintainers | Sanitize server-side + escape on render; restricted markdown (Pitfall 8) |
| iNat token in `localStorage`/URL | Account takeover *on iNaturalist* | PKCE public client; short-lived HttpOnly app session; keep iNat token server-side (Pitfall 6) |
| PII / sensitive-taxon localities in free text | Real-world harm (harassment, poaching), liability | Moderation-before-publish + UI guidance + takedown (Pitfall 5) |
| New secret surface leaked | Compromise of write layer / iNat app | Secrets Manager/SSM, least-privilege roles, no secrets in frontend |
| Pipeline role can write/delete authoritative store | Accidental or compromised nightly destroys data | IAM boundary: pipeline role read-only (or no access) to the authoritative prefix (Pitfall 4) |
| No audit log of moderation actions | Can't investigate abuse or restore | Record author, editor, timestamps, prior versions |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visible "pending review" state after submit | Author thinks their note vanished; double-submits | Clear "submitted, awaiting review" confirmation + a way to see their pending note |
| Public notes with no authorship/date | Readers can't judge authority; erodes scientific trust | Show author (iNat login/link) + last-updated date on published notes |
| Silent edit overwrites | Author clobbers a colleague's note with no history | One-per-author current version, or explicit versioning; never a shared mutable blob |
| Login required to *read* | Kills the "gathering place" openness; read is public today | Read stays anonymous/static; auth gates only writes |
| Losing a draft on the auth redirect | Note text lost when bounced through iNat OAuth | Preserve the draft across the OAuth round-trip |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Authoritative store:** works in the demo — verify it is **not** inside `beeatlas.duckdb`, has **no** `manifest.json` key on the diff gate, and **survives a full `run.py` rebuild** untouched (Pitfalls 1, 3).
- [ ] **Backup:** config exists — verify a **restore has actually been performed** and S3 Versioning is on **before** the first public write (Pitfall 2).
- [ ] **Build-seam contract:** the three key-lists are collapsed — verify an **unknown/unclassified artifact fails loud**, and `derived` vs `authoritative` route to **different** verification regimes (Pitfall 3).
- [ ] **OAuth:** login works — verify **no client secret in the bundle**, **no token in URL/`localStorage`**, PKCE or server-side exchange, **minimal scope**, exact redirect URI (Pitfall 6).
- [ ] **Write endpoint:** accepts writes — verify identity is **server-derived**, CSRF/origin checked, author-vs-maintainer authz enforced, rate-limited (Pitfall 7).
- [ ] **Rendering:** notes display — verify a `<script>`/`onerror=` payload renders **inert** (Pitfall 8).
- [ ] **Moderation:** approve flow works — verify a **takedown/unpublish without a deploy** and an **audit trail** exist (Pitfall 5).
- [ ] **IAM:** deploy succeeds — verify the **pipeline OIDC role cannot delete/overwrite** the authoritative prefix (Pitfall 4).
- [ ] **Read path:** notes visible — verify published notes are served **statically via CloudFront**, not by a live call to the write runtime on every page load.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Nightly wiped notes, no backup (P1+P2) | **HIGH / possibly total loss** | If S3 Versioning was on: restore prior object version. Else attempt PITR snapshot. If neither: **unrecoverable** — this is why P2 is a launch gate. |
| Nightly wiped notes, backup existed (P1) | MEDIUM | Restore from latest snapshot; quantify writes since snapshot; re-solicit lost notes from authors; then fix the physical separation |
| Gate misfire regenerated empty table (P3) | MEDIUM–HIGH | Restore from backup/version; exclude the table from the diff gate; forbid rebuild verbs on `authoritative` |
| `--delete` sync clobbered store (P4) | LOW if Versioning on / HIGH if off | Restore object versions; add deny-delete IAM + scope the sync; enable Versioning if it wasn't |
| Abusive/PII note published (P5) | LOW (if takedown exists) / HIGH (if not) | Unpublish via `status` flip; hard-delete with audit retained; if no takedown path, the emergency is a code deploy — which is why the flip must exist |
| Leaked iNat token (P6) | MEDIUM | Revoke the iNat app token / rotate client credentials; invalidate app sessions; fix storage; notify affected users |
| Stored XSS shipped (P8) | MEDIUM | Take down the note; rotate any maintainer sessions that viewed it; add sanitization; audit other notes |

## Pitfall-to-Phase Mapping

Phase numbering per the milestone framing: **P1 = Thread-1 build-seam refoundation**, **P2 = authoritative store + forward-only migrations**, **P3 = thin write layer + iNat OAuth**, **P4 = notes feature + moderation**.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Rebuild wipes authoritative data | **P2** (physical separation) + **P1** (declared property) | Run a full `run.py`/dbt rebuild; assert the notes table is untouched |
| 2. No backup before first write | **P2** provisions; **P3** gates public writes on it | A restore is demonstrated before the write endpoint opens |
| 3. Diff gate misfires / bypass-rebuild destroys data | **P1** (split verification regimes) | Notes artifact absent from `test_dbt_diff`; unknown key fails loud; rebuild leaves data intact |
| 4. `--delete`/`--recursive` clobber | **P2** (bucket/prefix + IAM); **P1** (contract declares prefixes) | Pipeline role has no delete on the authoritative prefix; Versioning on |
| 5. No moderation/takedown/liability | **P4** (loop) + **P2** (schema affordances) | End-to-end submit→pending→approve→publish→takedown works; audit trail present |
| 6. OAuth token leakage / no PKCE | **P3** | No secret in bundle; no token in URL/`localStorage`; PKCE/server-exchange; minimal scope |
| 7. Trusting client identity / CSRF | **P3** (identity/CSRF) + **P4** (authz matrix) | Forged-author and cross-origin POST both rejected |
| 8. Stored XSS | **P4** | `<script>`/`onerror=` payload renders inert |
| Over-engineering the contract/migrations | **P1/P2** (scope discipline) | Contract covers exactly two classes; migrations forward-only but not a generalized framework |
| Scope creep to a wiki/comment system | **P4** (guardrails) | Feature is one-note-per-(species,author) prose, not threads/replies/reactions |

---

## Over-building vs Under-building the Contract & Migrations

The milestone's stated point is architecture over feature surface, so there's real temptation to *over*-generalize — but also a real risk of *under*-building the safety-critical minimum. Balance:

- **Build now (under-building is dangerous here):**
  - The **declarative artifact contract with a `derived` vs `authoritative` property** — the whole gate/sync safety story depends on it (Pitfalls 1, 3, 4). This is not speculative; it's the load-bearing distinction and the Thread-1 reason for being.
  - **Forward-only versioned migrations** with **no rebuild escape hatch** — even for one table, because "rebuild to fix schema" is the exact reflex that destroys authoritative data. A migration runner can be ~50 lines (ordered SQL files + an applied-versions table); that's enough.
  - **Backup/PITR + Versioning + IAM boundary** — safety-critical, not speculative.
  - **Moderation status + audit columns** in the schema from day one (cheap now, painful to retrofit).

- **Do NOT build yet (over-building / speculative):**
  - A generalized migration framework with rollbacks, branching, or a plugin system — forward-only ordered files suffice for one table; YAGNI until a second authoritative table with real divergence exists.
  - An abstract "authoritative store adapter" over multiple backends — pick one store, wire it concretely.
  - A full moderation workbench (bulk actions, reviewer roles, SLA dashboards) — one maintainer + a pending queue + takedown is the MVP.
  - Rule of thumb: the *distinction* (derived/authoritative) is worth generalizing now because two data classes already exist; the *migration machinery* is not, because only one authoritative table exists.

## Scope-Creep Guardrails (thin vertical slice → wiki)

Explicit non-goals to write into requirements so the slice stays thin:

- **One structured note per (species, author)** with edit history — **not** threaded comments, replies, reactions, or @mentions.
- **Species pages only** — not arbitrary attachable notes on genera/places/occurrences (that's the next milestone's temptation).
- **Text prose** — not image uploads, attachments, or rich embeds (each adds storage, moderation, and licensing surface).
- **Maintainer moderation** — not a community flag/vote/reputation system.
- **Auth for writing only** — not user profiles, notifications, or activity feeds (those are the deferred "community/liveness" milestone).
- Treat any of the above appearing in a plan as a signal to stop and re-scope; the milestone's weight is the derived-vs-authoritative architecture, not the feature.

## Sources

- `data/nightly.sh` (lines 88–190, 265–366) — actual S3 `cp`/`--recursive` sync, DuckDB pull→rebuild→push round-trip, manifest hashing, and the `test_dbt_diff` gate iterating all manifest keys via `LOCAL_NAMES`/`INTENTIONALLY_SKIPPED`/`NON_FILE_KEYS` (HIGH)
- `.planning/PROJECT.md` — v8.0 milestone framing (derived-is-a-cache invariant, "losing authoritative data is unrecoverable," bends the no-server-runtime constraint), Constraints, Key Decisions (HIGH)
- Project memory: `project_occurrences_contract_release_sequence` (the bypass-and-rebuild release dance), `feedback_no_committed_data_artifacts` (species.json S3+manifest+deploy fetch pattern), `project_cdk_stack_composition` (never destroy BeeAtlasStack), `feedback_no_force_add_gitignored` (HIGH)
- `CLAUDE.md` — Constraints (static hosting, OIDC, no stored AWS credentials), Known State (Lambda surface retired 2026-05-14; dbt contract is the gate; no JS schema validator) (HIGH)
- OAuth 2.0 for Browser-Based Apps / PKCE public-client guidance; US §230 + DMCA takedown posture for hosted UGC (MEDIUM — general practice, not project-specific)

---
*Pitfalls research for: authoritative UGC + write layer on a static/derived-data scientific atlas*
*Researched: 2026-07-02*

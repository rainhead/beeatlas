# ADR 0002: Derived vs Authoritative Artifacts — Schema-Evolution Regimes

**Status:** Accepted (2026-07-02); amended 2026-07-17 (Model Y — see below)

> **Amendment (2026-07-17, Model Y — stelis ADR 0007 Amendment):** the
> *published* manifest this ADR describes no longer exists in its fat form.
> The site build owns publication: `lib/runtime-artifacts.js` +
> `scripts/postbuild-data.mjs` hash the 6 runtime-fetched binaries and write
> the SLIM `manifest.json`; build-time-baked artifacts are inlined by 11ty and
> never published. `data/artifacts.toml` remains authoritative for what this
> ADR is actually about — the **derived vs. authoritative provenance regimes**
> (still machine-enforced) — and operationally drives the integration-gate
> baseline set (`baseline-files`) and the `pull-published` dev pull. Counts
> and mechanics below describe the pre-Model-Y publish flow; the regimes
> stand.

---

## Context

BeeAtlas publishes 16 manifest artifacts (14 content-hashed files + 2 metadata fields). Until
Phase 176, all 16 were implicitly treated the same way — diff-against-live, rebuild-from-source,
bypass-and-rebuild when the schema changes — because all were derived from a reproducible upstream
(iNat, Ecdysis, DuckDB/dbt).

Phase 179 introduces `notes.json`, the first artifact whose content traces to a **user write**
(expert natural-history notes with no upstream to rebuild from). The existing artifact machinery
makes no distinction: it would allow a schema change to wipe authoritative data under the guise
of a "baseline diff". That is a category error requiring an explicit split.

### Former hand-synced sites (now eliminated by Phase 176 Plans 01-03)

Three places in the codebase previously maintained a parallel list of artifact keys, each one
a divergence risk:

1. `nightly.sh` publish/manifest heredoc — the 14-key hash-map and 2 metadata keys
2. `nightly.sh` baseline-classifier heredoc — the 9-artifact baseline-diff set
3. `deploy.yml` "Fetch build-time data from S3" step — the 6 build-time artifact keys

All three are now driven by the declarative contract in `data/artifacts.toml`, consumed via
`data/artifacts.py` verbs. Editing an artifact means editing only the TOML.

### Stable-directory publishes (intentionally out of contract)

Three S3 publishes in `nightly.sh` are NOT manifest artifacts and are intentionally excluded
from the per-file artifact contract:

- `feeds/` — Atom feed tree (recursive sync, no single local file/hash)
- `species-maps/` — per-species SVG maps (recursive sync)
- `place-maps/` — per-place SVG maps (recursive sync)

These have no stable single filename to hash, no manifest key, and no build-time fetch
consumer. They remain hardcoded `aws s3 sync --recursive` calls in `nightly.sh`. This is a
scoped, recorded exclusion — not a silent gap — and is appropriate because stable-directory
recursive publishes will never be consumed by `deploy.yml` (Eleventy reads only single files).

---

## Decision

### Provenance tracks ultimate data source, not production mechanism

An artifact's `provenance` follows where the data ultimately came from:

- **`derived`** — every byte traces to an upstream reproducible source (iNat API, Ecdysis
  database, DuckDB/dbt transformations). If lost, the artifact can be regenerated from raw
  inputs. The nightly pipeline is the authoritative *producer*, but it holds no *primacy* over
  the data — the upstream does.

- **`authoritative`** — at least one byte traces to a direct user write with no upstream to
  reconstruct from. If lost, it is lost permanently. `notes.json` (Phase 179) is the first
  example: it is *mechanically* produced by the nightly harvest (a projection), but its
  *content source* is the expert's keystrokes. "The JSON is derived from the database" is not
  the right frame — the database row is authoritative, and the JSON is a projection of it.

### The two schema-evolution regimes are DISTINCT and enforced as such

#### `derived` regime

- Schema changes are verified by diffing the rebuilt artifact against the live S3 baseline
  (`baseline_diff = true` in `artifacts.toml`; pulled and diffed by `test_dbt_diff` / block-1c).
- When a schema change is *intended* (e.g., adding a column), the bypass-and-rebuild verb
  `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh` is a **legitimate one-time tool** — it
  acknowledges the diff is expected and publishes the new baseline.
- Rebuild-from-source is always valid. The upstream is the source of truth.

#### `authoritative` regime

- Schema changes are **forward-only migrations** — versioned, additive, never
  rebuild-from-scratch. The write layer owns and runs migrations; `run.py` / the nightly
  pipeline NEVER touches the authoritative store's schema.
- `baseline_diff` is **machine-forced `false`** in `artifacts.toml` for all authoritative
  artifacts. The `validate()` function raises `ValueError` if any authoritative artifact
  sets `baseline_diff = true`, so `test_dbt_diff` / block-1c structurally cannot pull or
  diff authoritative data.
- The bypass-and-rebuild reflex (`SKIP_INTEGRATION_GATE=1`) is **FORBIDDEN** for authoritative
  artifacts. There is no upstream to rebuild from — "rebuild" means "delete". If block-1c trips
  on an authoritative artifact, the fix is a migration, not a bypass.
- Rebuild/bypass verbs are absent from the authoritative code path by design, not convention.

### Machine enforcement (in `data/artifacts.py`, as of Plan 01)

| Rule | Enforcement point |
|------|-------------------|
| `authoritative + baseline_diff=true` raises `ValueError` | `validate()` — all CLI verbs call it first |
| Authoritative artifacts absent from `baseline-pull-plan` output | `_cmd_baseline_pull_plan` iterates only `baseline_diff_artifacts()`, which filters on `baseline_diff=true` |
| Unknown manifest key triggers WARN (drift alarm) | `_cmd_baseline_pull_plan` WARNs on unrecognized keys |
| `build_time_fetch_optional=true` requires `build_time_fetch=true` | `validate()` |

---

## Consequences

### Benefits

- A schema change to a derived artifact has a clear, tested path: baseline diff trips the gate,
  bypass-and-rebuild with `SKIP_INTEGRATION_GATE=1` acknowledges it, the new baseline ships.
- A schema change to an authoritative artifact can never accidentally use the derived path —
  the machine rejects it at `validate()` time, before any CI step runs.
- The single artifact contract (`data/artifacts.toml`) is the only place to edit when adding,
  changing, or removing a manifest artifact. The three former hand-synced sites are gone.

### Limitations

- The stable-directory publishes (`feeds/`, `species-maps/`, `place-maps/`) remain outside the
  contract. They are tracked here as a documented exclusion rather than a silent gap.
- All 16 current artifacts are `derived`. The `authoritative` path is built but not yet exercised
  end-to-end (first exercise: Phase 179 `notes.json`).

### Deferred

- A second `authoritative` artifact or a generalized migration framework. Defer until a second
  use case exists — avoid speculative generality (see REQUIREMENTS.md § Out of Scope).
- Stable-directory artifact manifesting (hash-per-directory or manifest-per-tree). Add only if
  a build-time consumer of `feeds/` or `*-maps/` content emerges.

---

*Phase 176 — build-seam-refoundation-thread-1 (Plans 01-03)*
*Companion: `data/artifacts.toml` (contract), `data/artifacts.py` (loader + CLI + validation)*

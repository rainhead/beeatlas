# ADR 0009: Build-Time-Only External Authority (Static Invariant, Positive Form)

**Status:** Accepted (v3.2 / v4.7; migrated from `.planning/RETROSPECTIVE.md`)

---

## Context

The atlas reconciles names and status against external authorities (GBIF, iNat). Doing that at runtime would reintroduce a server dependency and rate-limit risk on a static site.

## Decision

Any reconciliation against an external authority runs **once, at build time**, and **bakes into committed seeds or authored TOML** — **zero nightly-runtime external lookups**. This is the positive statement of the static invariant.

The reusable shape: a **TOML manifest + a validator + a license whitelist + a one-shot seed script**. New external-authority integrations follow this shape rather than adding a runtime call.

## Consequences

- The read path stays 100% static and offline-capable; no external API is on the critical path.
- Authority data is versioned in git (committed seeds), so a build is reproducible and auditable.
- Related: the iNat-taxonomy-via-DwC-A direction (a beads issue) is an instance of this — replace live `/v2/taxa` enrichers with a monthly bulk download baked at build time.

---

*Source: `.planning/RETROSPECTIVE.md` §v4.7, §v3.2 (preserved at `docs/history/RETROSPECTIVE.md`).*

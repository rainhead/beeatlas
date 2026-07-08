# ADR 0013: Event-Driven Incremental Notes Publish (Contributions Live in Seconds)

**Status:** Accepted (owner decisions 2026-07-07)

---

## Context

A community note reaches viewers only through the two heaviest pipelines we own.
`notes.json` is a **build-time** artifact — `_data/notes.js` reads it during the
Eleventy build and bakes the `#notes` section into every species page; it is
never fetched at runtime. The `bee-notes` island renders nothing for
guests/non-authors and calls the live `/api/notes` endpoint only after an
author's *own* write. So the author who writes a note sees it instantly, but
every other viewer waits for the nightly `run.py` (`notes-harvest` is step 30 of
30, gated behind the ecdysis/iNat/dbt work a note does not depend on) → S3 →
`repository_dispatch` → a **full site rebuild** → a `/*` CloudFront invalidation.
Worst case ~24 h.

The goal: a note by anyone is visible to everyone — JS and no-JS — within seconds.

Full analysis, including the rejected litestream approach and the general
incremental-build direction, in [`docs/incremental-build-plan.md`](../incremental-build-plan.md).

## Decision

Notes are published on an **event-driven, incremental** path, in three layers:

- **Layer 0 — live-on-load read for everyone.** `bee-notes` fetches `/api/notes`
  on load for all viewers (baked section as instant first paint, reconciled to
  live data). The live endpoint resolves the byline `display_name`/`collector_url`
  from the existing `collectors.json` login→name resolution — **not a second name
  system** ([`feedback_reuse_display_name_resolution`]).
- **Layer 1 — event-driven `notes.json` publish.** On each write the store's
  change is picked up by a **separate debounced worker** (systemd-user unit on
  maderas) that runs `notes_harvest.py`, content-hashes `notes.json`, PUTs it to
  S3, and updates `manifest.json`. `notes-harvest` comes off `run.py`'s critical
  path (nightly remains a backstop/repair).
- **Layer 2 — targeted single-page rebake.** The same worker re-renders only the
  affected species page(s) and PUTs them with a scoped `/species/<slug>/`
  invalidation, giving no-JS/first-paint viewers seconds-level freshness without
  a full build.

Owner decisions (2026-07-07): build Layer 2 (no shortcut on no-JS parity); use a
decoupled debounced worker (never couple write latency to S3/CloudFront); no
caching in front of `/api/notes` for now.

## Rationale / Rejected

- **Litestream — rejected for notes.** Its S3 output is WAL segments for
  `litestream restore`, not a browser-queryable `.db`; and the notes store is
  normalized and private (`users` holds iNat numeric ids), so serving it to the
  browser would leak the users table and duplicate the API's join/filter/byline
  logic in client SQL. Litestream remains a candidate for the *future* occurrence
  read path (large, derived, already queried in wa-sqlite), which is a separate,
  deferred milestone gated behind a real second use case (PRODUCT.md
  "speculative generality" exclusion).
- **In-process publish — rejected.** Coupling the S3 PUT + CloudFront
  invalidation to the request path would make note writes as slow and as
  failure-prone as the network to AWS. A debounced worker also coalesces bursts.
- **Full-site rebuild per write — rejected.** A `/*` invalidation and full
  Eleventy build is minutes, not seconds, and re-ships unrelated artifacts. The
  targeted single-page rebake is the incremental unit.

## Consequences

- The notes read path gains a **live channel with a static fallback**: the API is
  the freshness source, the baked section keeps the page non-blank if maderas is
  briefly down. This does not conflict with [ADR 0009](0009-build-time-only-external-authority.md)
  (which governs external-*authority* reconciliation, not BeeAtlas's own write
  layer — already the accepted v8.0 exception).
- `notes.json` and per-species pages become **event-driven artifacts**. This is
  the first node of a general incremental build graph; the idempotent-job +
  content-hash/manifest-update + scoped-invalidation shape is the template every
  later node (iNat observations, Ecdysis determinations) reuses.
- New moving part: a maderas systemd-user worker plus a write→worker change
  signal. It must be idempotent and burst-coalescing, and its S3/manifest write
  must be atomic against the SW's `data-manifest` NetworkFirst route.
- `/api/notes` now takes every species-page load's notes read. Accepted for now;
  revisit with CloudFront only if load warrants (owner decision 3).

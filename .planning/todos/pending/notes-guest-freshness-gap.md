# Notes: guest-visible freshness gap (baked-only read path)

**Raised:** 2026-07-04, during Phase 179-06 UAT (Checkpoint 1 sign-off).
**Raised by:** user — "this behavior is pretty weird. I hope we'll be improving it in later phases."

## The rough edge

A note created live by an allowlisted author is stored immediately in the
authoritative store (maderas) and shows in the author's hydrated `<bee-notes>`
island — but it is **invisible to every signed-out / guest / no-JS reader until
the next nightly harvest → publish → deploy cycle** bakes it into the static
HTML. So a just-posted note can be absent from the public page for up to ~24h,
and the author sees a different page than everyone else in the meantime.

This is a direct consequence of the deliberate split-path design (Phase 179):
- Read path is 100% static (baked `notes.json`, no runtime `/api/notes` call on
  guest page load) — `src/bee-notes.ts:318` renders inert for non-authors.
- The live read endpoint exists but is only consulted by the author's island
  after a write (D-02 re-fetch), never on a guest load.

The tradeoff was intentional (static-hosting-only invariant; no server on the
read path), but the up-to-24h guest-visibility lag is the UX cost.

## Possible future directions (not yet scoped)

- **Public runtime read for guests** — let the island fetch approved notes for
  everyone, baked list as the instant/offline fallback. Breaks the "no runtime
  API call on guest load" invariant; needs a caching/CDN story for the read
  endpoint and a perf budget.
- **On-write publish trigger** — a write kicks a targeted rebuild/bake of just
  that species page instead of waiting for the nightly. Keeps the static read
  path; adds write→publish plumbing.
- **Shorter harvest cadence** — cheapest, only narrows the window; doesn't close it.

Decide the direction in a later milestone; capture here so the 179 UAT
observation isn't lost.

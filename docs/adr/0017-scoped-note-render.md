# ADR 0017: A note publish renders the species it touched, over a receipted full build

**Status:** Accepted (implemented 2026-07-31; issue beeatlas-4oa, epic beeatlas-0gx)

---

## Context

[ADR 0016](0016-vite-backend-integration.md) took the bundle out of the note write
path. What was left was the render: measured on maderas, `eleventy` alone is **10.45s
of a ~16s publish** — 65%, and now the dominant cost. Every one of those publishes
renders 1668 pages because one note changed.

Three facts about this site make a partial render unusually safe, and they were
checked rather than assumed:

1. **Notes reach exactly one template.** `notes` appears in `_data/notes.js` and
   `_pages/species-detail.njk`, nowhere else in `_pages/`, `_layouts/` or
   `_includes/`.
2. **The site defines no Eleventy `collections`.** Dropping templates from a build
   therefore cannot change what the remaining ones emit — the usual incremental-render
   hazard (a page that lists its siblings) does not exist here.
3. **`notes/` is not a runtime artifact** (`lib/runtime-artifacts.js`), so `_site/data`
   and the slim manifest do not depend on a note.

`eleventy --incremental` is not the mechanism: it keys on input FILES, and all 591
species pages come from one paginated template, so it would rebuild all of them.

## Decision

**A note publish renders only the species whose notes moved, additively over the last
full build's `_site` — and refuses unless it can prove that tree is fit to add to.**

1. `BEEATLAS_RENDER_KEYS` (newline-separated, PRESENCE is the signal) selects a scoped
   render. It mirrors Stelis's `STELIS_REBUILD_KEYS` (st-pd1) exactly, including
   set-but-empty meaning "zero keys", because that is where the value comes from.
   `lib/render-scope.js` is the single reader; `eleventy.config.js` uses it to ignore
   every template but `species-detail.njk`, and `_data/species.js` to narrow the
   pagination list. Filtering only the pagination would save little — the other 1077
   pages are most of the render.
2. **The key set comes from Stelis, not from the API.** `stelis --moved-keys notes`
   reports which keys of the `notes/` dir moved in the build just run, off the same
   per-key observation that decided which keys to re-harvest (st-2k9 / st-066). The
   API knows the `canonical_name` it just wrote, but that is the wrong source: a
   publish deferred under lock leaves two species pending, and the store digest knows
   that where one request does not. Its exit code is the contract — non-zero means "no
   basis", and the caller must fall back to a full build, never to the empty set.
3. **`scripts/build-receipt.mjs` is the precondition.** A full build records a
   fingerprint of everything a scoped render will not re-derive — render code
   (templates, `_data`, `lib/`, `src/`, configs), the Vite manifest, the data dir
   excluding `notes/`, and the sorted path list of `_site`. A scoped render runs only
   if that fingerprint still holds. This is deliberately the same shape as Stelis's
   `prior-complete-build?` (st-243): a targeted run may merge into a tree that MATCHES
   the last clean receipt, never merely one that exists.
4. `build:content` = `validate → eleventy → postbuild-data`. It must not run
   `build:app`, whose `emptyOutDir: true` deletes `_site` (ADR 0016) — a scoped render
   after that would publish a handful of pages and nothing else. The validations stay:
   only the *render* is being narrowed here, not the safety gates.

Measured locally, same data, back to back:

| | eleventy | whole step |
|---|---:|---:|
| full build | 3.43s | 7.38s (`npm run build`) |
| scoped, one species | 0.24s | 2.22s (`build:content`) |

Equivalence was tested by building three times and diffing `_site` trees: a scoped
render with no data change left all 1668 files byte-identical, and a scoped render of
one species with a new note produced a page **byte-identical** to the full build that
baked the same note. Exactly one file in the tree ever differs between two builds —
`_scaffold-check/index.html`, which embeds wall-clock `builtAt` and so differs between
any two builds, scoped or not.

## Consequences

**`_site` became load-bearing state.** It was disposable output; it is now the basis a
scoped render adds to, and the receipt is the only thing that says so. Deleting `_site`
is still safe — the receipt's `site` component stops matching and the next publish
builds in full — but *silently* deleting some of it is exactly what the receipt exists
to catch. The nastiest case it covers: `npm run build` empties `_site` via `build:app`
and then fails, leaving a partial tree under a receipt whose other components all still
match.

**The data component is stat-based, not content-based.** `occurrences.db` is large and
this runs on every note write. A false mismatch costs one full build; a false match
would publish stale pages. Cheap in the safe direction.

**Two engines now have to agree on one key set.** The render's scope and the harvest's
scope both come from the same Stelis observation, which is what keeps them from
drifting — but it does mean a note publish shells into Stelis twice (~0.6s locally for
the query). The alternative, passing the `canonical_name` from the API, is cheaper and
wrong.

**Filenames, not keys, cross the boundary.** Stelis reports `notes/` filenames
(`<canonical_name>.json`); `data/publish-notes.sh` strips the extension, which is the
same mapping `_data/notes.js` applies when it reads the dir (beeatlas-6x9). The
alternative — teaching Stelis that these keys are species — would put a beeatlas naming
convention inside the build engine.

**What this does NOT do.** The bundle steps are still gated only by *which script the
caller runs*, not by a general `src/`-changed test (beeatlas-bon) — the receipt now
computes the fact that gate needs, so bon is mostly wiring. The floor is now Eleventy
startup plus `_data` loading (~0.25s local, measured — not the ~1.0s the pre-0016
profile suggested), which only a warm process can remove. And a 16s critical section
becoming a ~6s one does not make concurrent note writes concurrent: the coalescing
queue (beeatlas-3nz) is still required before inviting authors.

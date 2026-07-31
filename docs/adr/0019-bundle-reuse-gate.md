# ADR 0019: A build reuses the app bundle when its inputs are unchanged — and must then fake being a build

**Status:** Accepted (implemented 2026-07-31; issue beeatlas-bon, epic beeatlas-0gx)

---

## Context

`build:app` ran `vite build` on every full build: ~1.5s of work behind ~0.7s of startup,
on every nightly and on every note publish that falls back to a full build. With
`src/` unchanged the output is byte-identical — but only since
[beeatlas-96m](0017-scoped-note-render.md) took the wall clock out of
`__APP_VERSION__`. Before that every build minted new chunk hashes, so there was
nothing to reuse and no way to check that reuse was safe.

## Decision

**`build:app` became a gate** (`scripts/build-app.mjs`). It fingerprints the bundle's
inputs — `src/`, both Vite configs, `package.json`, `package-lock.json`, the `.env*`
files, and the build id — and runs `npm run build:bundle` only when they moved, when the
stashed manifest is gone, or when any asset the manifest names is missing from `_site`.

The interesting part is not the skip. It is everything a skip has to *impersonate*,
because `vite build` had three side effects beyond emitting files.

**1. It was the cleaning boundary.** `emptyOutDir: true` is why a full build wipes
`_site` while a bare `eleventy` rerun is additive ([ADR
0016](0016-vite-backend-integration.md)). Remove it and nothing ever deletes from
`_site` — and `merge-swap.sh` rsyncs pages with `--delete`, so `_site` is the authority
for the live site: a page dropped from the data would persist on the site forever. So a
skip still cleans, removing everything except `assets/`, which is exactly the set Vite
would have re-emitted identically. Verified by byte-comparing a skipped build against a
Vite-ran build: 1668 files identical, same 15 asset filenames, the 2 MB main chunk
identical, the sole difference being `_scaffold-check`'s wall-clock `builtAt`, which
differs between any two builds.

**2. It made the assets look fresh, and `merge-swap.sh` depends on that.** The publish
does not `--delete` assets — a cached page may still reference last publish's hashed
names — it *age-prunes* them (`-mtime +30`), and its header states the assumption:
"new URLs each publish, so nothing stale is ever re-served under a current name". Every
real `vite build` rewrote those files, so anything still referenced was younger than a
day and only dead names aged out. Reuse breaks precisely that: `rsync -a` preserves
mtimes, so after 30 days of skipped builds the prune would **delete the live bundle out
from under the pages referencing it** — nightly, with a green build and a healthy
healthcheck ping, and invisible to every local check because `_site` is intact. So the
gate touches the files it reuses. They *are* part of this publish; they should look it.
Found by review, not by the outage.

**3. It emptied `assets/` itself.** The presence check is one-directional (manifest ⊆
disk), so a stray file in `assets/` would survive every skipped build, be precached by
the service worker's `assets/**` glob, and be published — the unbounded dead-chunk
accumulation ADR 0016 fixed once already. So a skip also deletes anything in `assets/`
the manifest does not name, which makes "indistinguishable from having run Vite"
enforced rather than circumstantial.

## Consequences

**`.env` is a bundle input.** Vite bakes `VITE_*` into the chunks —
`VITE_MAPBOX_TOKEN`, `VITE_DATA_BASE_URL`, `VITE_NOTES_API_BASE_URL`. Those files are
gitignored, which is exactly why they are easy to forget: rotate the Mapbox token and a
gate that ignored them would skip every night while the live site served the revoked
one. Green build, broken maps, cause and effect weeks apart.

**The build id costs most of the saving, for now.** `__APP_VERSION__` is derived from
`git rev-parse HEAD` and is `define`d, so it lands inside a hashed chunk: any commit at
all changes the emitted `bee-header` chunk. The gate therefore fingerprints HEAD, or it
would skip while Vite would have produced something different — and the "Build `<id>`"
popover, whose entire job is telling you which code an installed PWA is running, would
name a commit that is not deployed. So the bundle rebuilds on every commit and skips
only when nothing landed at all. `beeatlas-4uj` is the fix and it is the same principle
96m established one step short of: a build identifier does not belong inside a
content-hashed artifact. Move it to the slim manifest, which is served no-cache, and the
id gets *more* honest while the gate gets its skips back.

**`build:sw` is deliberately not gated.** ~73ms of work behind ~1.2s of startup, and its
input is the *built site* — so deciding whether it can be skipped requires knowing the
rendered page set, which is only knowable after Eleventy runs. Against 1.2s, a stale
service worker means clients precaching URLs that no longer exist, breaking offline
cold-start.

**Delivered:** 7.03s → 6.03s locally, ~2.2s on maderas, against `build:app`'s 2.16s
there. Modest by design — bon's stated acceptance criterion (a note-only publish skips
both bundle steps) was already met by [ADR 0017](0017-scoped-note-render.md), since
`build:content` contains neither; this is the remainder.

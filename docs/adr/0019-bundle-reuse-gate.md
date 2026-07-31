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
inputs — `src/`, both Vite configs, `package.json`, `package-lock.json` and the `.env*`
files — and runs `npm run build:bundle` only when they moved, when the
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

Both legs of that are tested, because the fix would be theatre if either failed: ageing
the assets 40 days and then skipping leaves none over 30 days locally, and `rsync -a` —
whose quick-check is size+mtime — *does* propagate a mtime-only change, itemising
`>f..t....` and stamping the destination fresh. Had rsync skipped the transfer instead,
the local touch would have achieved nothing and the live bundle would still have aged
out.

**3. It emptied `assets/` itself.** The presence check is one-directional (manifest ⊆
disk), so a stray file in `assets/` would survive every skipped build, be precached by
the service worker's `assets/**` glob, and be published — the unbounded dead-chunk
accumulation ADR 0016 fixed once already. So a skip also deletes anything in `assets/`
the manifest does not name, which makes "indistinguishable from having run Vite"
enforced rather than circumstantial.

Two details there are easy to get wrong, and I got both wrong first. The comparison must
be over **full relative paths**: match manifest basenames against top-level directory
entries and a manifest naming `assets/species/index-abc.js` yields the keep-entry
`species/index-abc.js` against the directory `species`, so the whole directory is deleted
immediately after the presence check vouched for its contents — and
`scripts/validate-bundle-size.mjs` carries an explicit branch for that shape because Vite
has emitted it here. And emptied directories must go too: that same validator tests
`existsSync(_site/assets/species/)` *before* falling back to the flat `species-*.js`
form, so an empty `species/` routes it down a branch containing no chunks and fails the
build. Vite would have left neither.

## Consequences

**`.env` is a bundle input.** Vite bakes `VITE_*` into the chunks —
`VITE_MAPBOX_TOKEN`, `VITE_DATA_BASE_URL`, `VITE_NOTES_API_BASE_URL`. Those files are
gitignored, which is exactly why they are easy to forget: rotate the Mapbox token and a
gate that ignored them would skip every night while the live site served the revoked
one. Green build, broken maps, cause and effect weeks apart.

**The build id used to cost most of the saving. Fixed in `beeatlas-4uj`, same day.**
`__APP_VERSION__` was derived from `git rev-parse HEAD` and `define`d, so it landed
inside a hashed chunk: *any* commit changed the emitted `bee-header` chunk. The gate
therefore had to fingerprint HEAD — otherwise it would skip while Vite would have
produced something different, and the "Build `<id>`" popover, whose entire job is
telling you which code an installed PWA is running, would name a commit that is not
deployed. The bundle rebuilt on every commit and skipped only when nothing had landed.

The id now travels in the slim manifest instead (`scripts/postbuild-data.mjs` →
`build_id`, read by `loadBuildId()` and passed to `bee-header` as a property). The
manifest is not content-hashed and is served no-cache, so this costs nothing and is
regenerated on every publish. That completes the rule 96m established and stopped one
step short of: **nothing clock- or HEAD-derived belongs inside a content-hashed
artifact** — and there is now no `define` in `vite.config.ts` at all, which
`arch.test.ts` guards directly (it asserts both the absence of a `define` block and the
absence of any clock reference, since the previous guard would have passed a
sha-derived define).

Demonstrated by building twice with different `GITHUB_SHA` values: `build_id` moved from
`72ae32e` to `deadbee` while all 15 asset filenames stayed identical — the bundle reused,
the id current. Before this change the second build would have rebuilt everything.

**This is a trade, not a strict improvement, and the earlier draft of this ADR
overclaimed it.** The two placements answer different questions. Baked into the bundle,
the id travelled *with the code*, so it named what you were running — a reused bundle
kept naming whichever commit last rebuilt it, but a stale installed PWA showed its own
stale id, which was the row's original stated purpose ("so a stale installed PWA is
diagnosable at a glance"; iOS keeps an old SW and caches across reinstalls). Read from
the manifest over a NetworkFirst route, the id names *the latest publish the client can
reach* — correct for "what is deployed", and wrong in exactly the stale-install case the
row was created for: an old PWA, online, will now display today's sha while running last
week's chunks.

Accepted because the gate's skips and 96m's rule are concrete and daily, while the
stale-install diagnostic was never load-bearing. But it is a capability lost, not
converted, and the honest replacement is the running chunk's own content hash — which
ships with the code by construction and needs no `define`. Tracked as `beeatlas-4zu`.

One consequence to know: the static pages show no Build row. Their `bee-header` entry
imports no manifest, deliberately — those pages fetch nothing on paint — so nobody hands
them an id, and the row is omitted rather than inventing one. This matches the freshness
row, which has always been app-only for exactly the same reason.

**`build:sw` is deliberately not gated.** ~73ms of work behind ~1.2s of startup, and its
input is the *built site* — so deciding whether it can be skipped requires knowing the
rendered page set, which is only knowable after Eleventy runs. Against 1.2s, a stale
service worker means clients precaching URLs that no longer exist, breaking offline
cold-start.

**Delivered:** 7.03s → 6.03s locally, ~2.2s on maderas, against `build:app`'s 2.16s
there. Modest by design — bon's stated acceptance criterion (a note-only publish skips
both bundle steps) was already met by [ADR 0017](0017-scoped-note-render.md), since
`build:content` contains neither; this is the remainder.

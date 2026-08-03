# ADR 0026: The basemap is ours — MapLibre over a self-hosted Protomaps extract

**Status:** Accepted (implemented 2026-08-01 as beeatlas-q73/beeatlas-4mk, hillshade
2026-08-02 as beeatlas-8py; recorded 2026-08-03 as beeatlas-mas).
**Supersedes [ADR 0001](0001-mapbox-basemap-cache.md).**

---

## Context

BeeAtlas is used in the field, by volunteers, in places chosen for their bees
rather than their cell coverage. Two things followed from that and neither was
satisfiable on a hosted basemap.

**Offline was never licensable.** [ADR 0001](0001-mapbox-basemap-cache.md) worked
the Mapbox Product Terms in detail and landed on the only thing they permit: a
performance cache of at most 30 days, token retained, telemetry untouched. Storing
tiles for a weekend in the Cascades was out. That analysis was correct and is the
main reason this decision exists — it is preserved rather than deleted.

**The style was not ours to fix.** The volunteers' must-haves are trails, streams
and named peaks, legible at arm's length on a phone in sunlight. A hosted style is
tuned for driving. We could restyle within Mapbox's vocabulary, but the underlying
tiles decide what is *in* them, and that was not a dial we held.

Self-hosting answers both. It also introduces a class of failure this area is now
defined by, which the rest of this record keeps returning to: **nothing here fails
loudly.** A missing worker, an unshipped fontstack, a glyph range nobody
exercised, a bundled file the asset prune deleted — every one produces a blank or
half-drawn map with an empty console. Decisions below are made on the assumption
that a mistake will not announce itself.

## Decision

**Render with MapLibre GL from a Protomaps extract of Washington that we build,
host and attribute ourselves.** `data/build-basemap.sh` pulls the WA region out of
the Protomaps daily planet over HTTP range requests; the archive is served from an
Apache `Alias` at `/basemap/tiles`, and `src/basemap-style.ts` builds the field
style over it. There is no map API key anywhere in the tree.

### 1. Attribution is a product obligation, not a footer

The data is OpenStreetMap under ODbL and the tiles are Protomaps' build of it. The
attribution control carries both, plus the Washington Bee Atlas notice from the
occurrence source, and — only while a hillshade is actually rendering — the
Terrain Tiles / NASA SRTM / USGS 3DEP / NOAA notice. It is MapLibre's own control
(`attributionControl: {}`), fed by the sources, so a new source cannot be added
without its notice coming with it. That coupling is the point; a hand-written
footer string drifts from what is on screen.

ODbL additionally makes redistribution a live question in a way §2.8.1 never did:
we may cache the archive on a device indefinitely, which is what
[ADR 0025](0025-offline-basemap-is-a-byte-store.md) then does.

### 2. Glyphs and sprites ship with the CODE; tiles ship as DATA

They have different lifecycles and different failure modes. The ~227 MB vector
archive is quarterly-ish, lives outside any publish path so no prune can reach it
(`$BASE_DIR/basemap`, a third sibling of the htdocs+var convention), and is
date-stamped so a grace period exists between publish and cutover — which is why
the client must fetch `manifest.json` to learn the current filename rather than
hardcoding it.

Glyphs and sprites are in `public/basemap` and ship with the bundle, because a
missing glyph range is invisible: the label does not render and nothing is logged.
**Every fontstack a layer names must be vendored, and the completeness rule is
tested, not remembered** (`src/tests/basemap-precache.test.ts` runs the precache
globs through workbox's own globber). Occurrence labels use Noto Sans Medium for
exactly this reason: under Mapbox they asked for `Open Sans Bold`, which the
hosted style happened to serve and we do not vendor.

### 3. The map does not wait for the basemap

The map is constructed synchronously with a blank local style — which still
carries glyphs, or the occurrence labels vanish — and `setStyle` swaps in the real
basemap once the manifest resolves. An earlier cut awaited the manifest first,
which put the map chrome and the offline GPS behind a network request. That
violates the field requirement that the blue dot works with no network
(LOC-01 SC-2), so the ordering is load-bearing: local and synchronous first,
network-dependent second.

### 4. MapLibre's worker is served from the page tree, not bundled

It locates itself by deriving a sibling URL from its own `import.meta.url`, which
no bundler preserves. Bundled, it 404s and reports **nothing**: tiles sit in
`loading`, `load` never fires, the map is blank and the console is clean. Eleventy
copies it out of `node_modules` to `/basemap/maplibre/` and `<bee-map>` passes that
path to `setWorkerUrl`.

Rejected: `?worker&url` (Vite emits a chunk it leaves out of the manifest, so the
asset prune deletes it) and a side-effect-only import (tree-shaken to zero bytes —
maplibre-gl marks its dist side-effect-free while the worker self-installs with a
bare assignment). Pinned by `src/tests/maplibre-worker.test.ts`. Do not
"simplify" it into an import.

### 5. The click chain is one ordered hit-test

MapLibre has no `addInteraction`, so the five independent Mapbox handlers became a
single ordered list (`_clickTargets` in `src/bee-map.ts`). Writing it down forced
an implicit property into the open: what made the old chain correct was never an
explicit visibility check, it was that `queryRenderedFeatures` only returns
features from RENDERED layers, so a `visibility: none` boundary layer is skipped
for free. Swept end to end under beeatlas-ecn; see
[the runbook](../runbooks/map-interaction-uat.md).

### 6. Terrain is a second archive, merged into one manifest

`wa-terrain-*.pmtiles` (~61 MB) publishes independently of the vector archive
through the same script, which therefore *merges* `manifest.json` rather than
rewriting it. Its entry is optional: no entry means no hillshade and an otherwise
untouched basemap, which is what let the data ship before the code.

Rejected: one combined archive (couples two very different refresh cadences) and a
second manifest file (two things to keep in sync).

**Elevation is quantized to 1 m and encoded as lossless WebP** — 200 MB to 61 MB,
worst-case error 0.496 m — and that is the only reason a z11 pyramid is
affordable. Rejected: raw PNG (200 MB), a 4 m quantum (same size as WebP and
actually lossy), and any lossy codec, which would invent terrain.

**Maxzoom 11 is paired with a fade to zero by z15**, and the pairing is the
decision: the fade is what makes a cheap DEM sufficient, because nothing renders
above it. `DEFAULT_MAXZOOM` in `data/terrain_tiles.py` and `TERRAIN_FADE_END` in
`src/basemap-style.ts` must move together. Rejected: z10 (21.9 MB, but ridges
smear at z12 — a screenshot comparison decided this) and z13 (~1 GB).

**The layer sits under the `water` fill, not under the first symbol layer.** The
Protomaps theme interleaves fills and lines and its first symbol layer is index
57, so "under the labels" would wash every road, trail and stream with terrain
shading.

## Consequences

- No API key, no token rotation, no per-view billing, no telemetry to suppress.
- The archive is a real operational artifact: quarterly rebuilds, ~227 MB + ~61 MB
  of disk on maderas, and a publish path that must never be confused with the
  site's (`data/publish-basemap.sh` stages under `var/basemap-staging`, which is
  not web-reachable).
- Offline basemap becomes possible, and is taken up by
  [ADR 0025](0025-offline-basemap-is-a-byte-store.md).
- Local dev proxies `/basemap/tiles` to beeatlas.net (`vite.config.ts`); the
  archive is never checked in.
- The map is Washington-shaped in a visible way. `pmtiles extract` keeps whole
  intersecting tiles without clipping their contents, so at very low zoom the tile
  containing WA also contains its whole quadrant of North America, and that bonus
  geography retreats as you zoom in. Cosmetic, tracked as `beeatlas-pwm`; the
  multi-region seam, when it comes, is a second entry in `manifest.json`'s
  `regions` map rather than a change to any of the above.

## What ADR 0001 leaves behind

Its licensing analysis governs nothing we serve. Two artifacts of it outlived the
swap and are removed with this record: the `api.mapbox.com` StaleWhileRevalidate
route in `src/sw.ts`, which had matched nothing since 2026-08-01, and the
`mapbox-basemap` Cache Storage bucket it filled — now deleted on service-worker
activate, because a device that used the app before the swap is still holding up
to 150 dead tile responses it cannot see or reclaim.

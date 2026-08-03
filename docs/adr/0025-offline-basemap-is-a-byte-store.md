# ADR 0025: The offline basemap is a byte store the page reads, not something the service worker serves

**Status:** Accepted (implemented 2026-08-02; issue beeatlas-6rs, spike beeatlas-93t)

---

## Context

Since [beeatlas-4mk](../../CLAUDE.md) the basemap is self-hosted: a ~227 MB vector
PMTiles archive plus, since beeatlas-8py, a ~61 MB terrain archive, both served
from an Apache `Alias` at `/basemap/tiles` and read by HTTP range request. Nothing
about that works in a forest.

The app is already an offline PWA — the ~33 MB occurrence database and its
companions are primed into Cache Storage at every cold start
(`src/prime-orchestrator.ts`). Extending the same treatment to the basemap runs
into one hard structural fact and several soft ones:

**Cache Storage has no range semantics.** A service worker can serve a cached
response whole; it cannot answer "bytes 4194304-4210687 of this file". PMTiles is
read by range and nothing else. So the SW cannot be the thing that serves tiles,
however natural that looks from the outside.

Everything else about this area fails silently, which is the second fact worth
stating up front. The failure log from the migration is uniform: a missing worker,
an unshipped fontstack, a glyph range nobody exercised, a bundled worker file the
asset prune deleted — every one of them produces a blank or half-drawn map with
an empty console. Design choices here are made on the assumption that a mistake
will not announce itself.

Three questions could not be answered from a desk, so [beeatlas-93t](../../docs/lessons-learned.md)
measured them on an iPhone (iOS 18.7, Safari 26.6, installed to the Home Screen):

| question | answer |
|---|---|
| Does a single ~230 MB `cache.put` survive? | Yes — 238,283,859 bytes in 905 ms, byte-exact readback, no chunking |
| What quota does an installed PWA get? | 41,231,686,042 bytes (38.4 GB). The "iOS caps near 1 GB" assumption was wrong |
| Is `Blob.slice` fast enough to be the tile read path? | Median below Safari's clamped timer resolution; p95 1 ms; max 34 ms on first touch |
| Does the installed PWA share a bucket with the Safari tab? | **No.** Separate buckets, proven in both directions |
| `navigator.storage.persist()` | **Granted** to the installed app, **denied** to the tab |

## Decision

**Prime the archives into Cache Storage as opaque blobs, and read them back with
`Blob.slice` behind a PMTiles `Source` on the main thread. The service worker
never touches them.**

### 1. Cache Storage as a byte store, not as a response cache

The archive is written with one `cache.put` and read with `Blob.slice`. The Blob a
`Cache` hands back is a view over bytes on disk, not a buffer, so a 227 MB archive
costs disk and essentially no memory.

**OPFS was the alternative, and it is not needed.** It was in the plan as a
swappable backend precisely because nobody knew whether Cache Storage could hold
or serve a file this size on iOS. Both halves of that worry measured clean, so the
backend seam was dropped rather than built — an abstraction whose only justification
was an unmeasured fear.

### 2. No custom MapLibre protocol

`Protocol.add(pmtiles)` keys its registry by `source.getKey()`, and `tilev4`
dispatches on exactly the string following `pmtiles://`. So a `Source` that returns
the URL the style already names takes over that archive, and nothing else in the
style, the map, or the online path changes.

That exact-string match is also the sharpest edge here. If the key the reader
registers and the URL the style builds ever differ by a character, **nothing
throws** — `Protocol` simply never consults the reader and falls back to range
requests over a network that, offline, is not there. So there is one definition,
`basemapArchiveUrl()`, used by both, and `basemap-cache.test.ts` asserts the
registered keys against the built style rather than against a literal.

### 3. Precaching the renderer is a separate, prior problem

The archives are useless while the code that draws them is missing. The MapLibre
worker (`/basemap/maplibre/*.mjs`), the nine glyph ranges and the four sprite files
were all outside the SW's precache globs, so an offline cold start got no map at
all. `globIgnores: '**/*.png'` — aimed at the app icons — was additionally
swallowing the sprite sheets, and `globIgnores` beats `globPatterns`, so listing
the sprites without narrowing the ignore would have changed nothing.

This *does* go through the service worker, and rests on a fact worth writing down
because it is not obvious and could quietly stop being true:

> The SW is registered at `/app/` scope, so it controls the app's pages and
> intercepts whatever they request, at any path. A **dedicated worker** is a
> different client, and MapLibre's worker is served from `/basemap/maplibre/` —
> outside that scope, therefore uncontrolled, therefore its own fetches would
> bypass the cache entirely. (This is why the SQLite engine runs from an inline
> `blob:` worker.) In MapLibre v6 the glyph URL template is expanded on the
> **main thread**, so precaching glyphs is sufficient.

`basemap-precache.test.ts` pins that structurally — it asserts which bundle
substitutes `{fontstack}` — so an upgrade that moves glyph loading into the worker
fails the build instead of turning labels into blank boxes in a forest.

### 4. The download is opt-in and installed-only

**Opt-in** because ~288 MB is not something to start on someone's cellular
connection unasked. It is a row in the account menu beside the existing cache
status, and deliberately not folded into the "Offline-ready" label: that label
describes something automatic that has already happened, and making it require a
deliberate 288 MB download would leave every user permanently not-ready.

**Installed-only** because of the bucket split, which makes this correctness rather
than preference. A download started in a Safari tab is wrong twice over: the bytes
land in a bucket the installed app will never read, and `persist()` is denied
there, so they are unprotected against eviction under storage pressure. When not
installed, the row explains and points at the install button the header already
carries. `navigator.storage.persist()` is called as part of the prime.

### 5. Terrain is primed last, and may simply be absent

The hillshade already degrades gracefully by construction (beeatlas-8py): a style
built from a manifest with no terrain entry is an ordinary, complete basemap. That
makes terrain the natural thing to shed under storage pressure and the natural
thing to try last — it must never be the reason the vector basemap is missing. A
terrain download that fails still leaves a usable offline map.

### 6. A superseded generation is evicted only once the new set is whole

The manifest is network-first, so a republish is picked up promptly; the archives
it no longer names are then deleted, which is what makes a version bump replace
rather than accumulate.

But **not before the replacements are all stored, and not after a partial
success.** An earlier cut pruned "everything the manifest no longer names"
unconditionally, which meant a republish whose download failed halfway deleted the
complete previous generation — leaving someone in the field with no basemap, which
is strictly worse than a stale one. Holding two generations meanwhile costs ~576 MB
against a 38.4 GB quota, so there is nothing to buy by being eager.

The cost is that a persistently failing terrain download keeps the old generation
alive alongside the new vector archive. That is a broken publish rather than a
normal state, it self-heals on the next complete prime, and it is logged.

### 7. A kill switch that also disables reading

`localStorage['beeatlas-basemap-offline'] = 'off'` reverts to an online-only
basemap. It gates **reading** as well as downloading: a local archive is a large
blob this code trusts to be well-formed, and if a device ever ends up with a
corrupt one, "stop offering the download" would leave the broken copy in use.

## Amendment (2026-08-03): the worker, and cache-first manifests

Two things this record got wrong, found on a real device after it was written.

### The MapLibre worker must be ONE file

§3 above says the SW is scoped to `/app/`, that a dedicated worker is a separate
client, and that precaching glyphs is therefore sufficient because MapLibre
expands `{fontstack}` on the main thread. All true. What it missed is that the
same reasoning applies to the worker's OWN module import: `maplibre-gl-worker.mjs`
opens with `from "./maplibre-gl-shared.mjs"`, and that fetch is made by the worker,
which is uncontrolled. Offline it goes to the network, fails, and the worker dies
before running a line.

Everything the worker does then stops silently — vector tile parsing, GeoJSON
clustering, symbol layout — so both PMTiles sources stalled at `loaded=false` AND
the purely-local occurrence layer drew none of its 101,516 features. Three
symptoms, one cause. A worker POOL where only some members die produces
tile-shaped holes that move with zoom, which is how it was first reported.

Moving both files inside `/app/` did not help and could not: only the worker needs
them, and only the worker cannot read them. `scripts/build-maplibre-worker.mjs`
now bundles it into one self-contained file and fails the build if a relative
import survives.

Measured, offline, server killed rather than emulated, in WebKit and Chromium:

| offline | features | styleLoaded | clusters | dots |
|---|---|---|---|---|
| two files | 98,762 | `false` | 0 | 0 |
| bundled | 98,762 | `true` | 690 | 87 |

### Manifests are cache-first, not network-first

Both manifests were network-first with a cached fallback, which meant every
offline launch began with failed requests — and on iOS a failed request inside an
installed app raises a system "Turn On Wi-Fi" modal over a working map.

`navigator.onLine` cannot prevent this. On the device it still read **true at
110 ms** and flipped to false only later, so a guard evaluated during page init is
too early to matter. The fix is not needing the network: serve the cached copy and
revalidate on a timer.

The original network-first argument — that the publish prunes superseded archives —
was simply wrong, and checkable: `data/publish-basemap.sh` keeps a superseded
archive for `GRACE_DAYS` (30) expressly "so a client holding a cached manifest
can" still load it, and `merge-swap.sh` age-prunes `/data` only at +30 days.

`src/manifest.ts` matters most here because it also runs in the SQLite worker,
which is created from an inline `blob:` URL — outside the SW scope AND in a
separate realm, so its requests are both unhelped by the cache and invisible to
page instrumentation.

### Accepted residual

A system network nag can still appear on an offline launch. The app itself makes
zero failed requests (verified on device via the diagnostics panel's request log);
the remaining candidate is the browser's own soft service-worker update check,
which re-fetches `/app/sw.js` on navigation. The SW is deliberately never
precached — a worker that caches itself is how a device gets stranded on a broken
version — and nothing the page owns initiates that request. Mitigating it means
`updateViaCache: 'all'` plus a `max-age` on `sw.js`, which would delay update
discovery and weaken the update-prompt flow. Decided 2026-08-03 not to pay that:
the map works, the dialog is dismissible.

## Consequences

- Storage stopped being the binding constraint on basemap scope. A future BC
  region, or a higher-resolution terrain pyramid, fits inside the measured quota;
  download time and politeness are the limits now. This must **not** reopen
  z13-vs-z14 as a size argument — that choice is about the trail-network zoom
  floor, not bytes.
- The bucket split is not basemap-specific. A user who primes the 33 MB database
  in Safari and then installs silently re-downloads all of it. Pre-existing, not
  introduced here, and tracked separately.
- `<bee-map>`'s offline label changed meaning: a primed device is told nothing,
  and an unprimed one is pointed at the download. Its old copy ("pan here while
  online to cache tiles for an area") described a Mapbox-era tile-by-tile cache
  that no longer exists and that Mapbox's terms never licensed (ADR 0001).
- Streaming the download and then writing it in a single `cache.put` is the shape
  the spike verified on device. Piping the body through a counting
  `TransformStream` would hold less memory and is the obvious refinement — but it
  was not what was measured, and this is not an area that reports its mistakes.

## Rejected alternatives

| alternative | why not |
|---|---|
| Serve tiles through the service worker | Cache Storage has no range semantics; the SW cannot answer a byte-range request. The SW is also not on the critical path — no `clientsClaim`, so a first load is uncontrolled |
| OPFS for the archive | The reason to want it was an unmeasured fear about Cache Storage at this size. Both halves measured clean, so the swappable-backend seam was dropped rather than built |
| A custom `maplibregl.addProtocol` handler | Unnecessary. `Protocol.add()` already dispatches by source key, so a Blob-backed `Source` is the whole integration |
| Prime automatically, as a fifth asset | ~288 MB unprompted, possibly on cellular. It would also make "Offline-ready" mean 321 MB, so nobody is ever ready |
| Offer the download in the map overlay | `<bee-map>` is a presenter and has no download action; the account menu already carries every other cache and storage affordance |
| One combined vector+terrain archive | Rejected in beeatlas-8py for publishing reasons, and it would also remove the ability to shed terrain alone under storage pressure |

## References

- [beeatlas-6rs] the implementation; [beeatlas-93t] the device spike
- `src/basemap-cache.ts` (manifest + reader), `src/basemap-prime.ts` (download)
- `scripts/sw-precache-globs.ts`, `src/tests/basemap-precache.test.ts`
- [ADR 0001](0001-mapbox-basemap-cache.md) — obsolete; the ≤30-day Mapbox
  perf cache this supersedes in spirit. Formal supersession is beeatlas-mas.

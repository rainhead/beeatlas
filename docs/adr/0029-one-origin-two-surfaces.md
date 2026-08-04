# ADR 0029: The app moves to the root, and the service worker serves each surface by what it is

**Status:** Proposed (issue beeatlas-3xx)

Unblocked by [ADR 0026](0026-self-hosted-basemap.md) and [ADR 0025](0025-offline-basemap-is-a-byte-store.md),
which cleared the licensing and storage gates that kept the PWA on a separate path.
Builds on [ADR 0024](0024-compression-is-a-build-artifact.md) for the wire-versus-storage
numbers below.

---

## Context

`/app/` exists because it was a prototype. The offline PWA needed a service worker,
a web manifest and a precache, and none of that was safe to point at the live site
while the basemap question was unresolved — Mapbox's terms forbade offline tiles
([ADR 0001](0001-mapbox-basemap-cache.md)), so there was no offline map to promote.
That gate is gone: the basemap is ours, self-hosted, and verified offline on real
hardware.

So the two surfaces are now the same application at two URLs. `_pages/index.html`
and `_pages/app/index.html` differ only in PWA metadata against an Atom feed link;
both mount the same components. Keeping them apart costs a permanently second-class
main site, and it means the thing most people reach — `beeatlas.net` — is the one
that cannot work in the field.

Migration is, unusually, not a constraint: there is exactly one installed PWA in
existence, on the maintainer's phone.

### What measurement changed about the plan

The naive move is to point the service worker's scope at `/` and ship. Measuring what
that would do to a reader is what makes it wrong.

| surface | JS it actually loads | what a root precache would hand it |
|---|---|---|
| a species page | **18 KB** (`bee-header` + `taxon-page`) | **3.3 MB**, 34 entries |
| the map app | `bee-atlas.ts` (1.27 MB) | the same 3.3 MB — proportionate |

The precache glob is `assets/**/*.{js,css,wasm}` — everything. Its largest members are
exactly what a reader has no use for: the map app (1272 KB), the MapLibre worker
(585 KB), the wa-sqlite engine (545 KB) and nine glyph ranges. Someone arriving from a
search engine to read about *Bombus mixtus* would be handed **180× what the page uses**.

The data prime is the larger version of the same mistake. `/` does not import
`prime-orchestrator` today; only `app-entry.ts` does. Adopting that entry wholesale
would give every visitor the automatic prime — **~4.7 MB on the wire, ~34.8 MB
stored** — including visitors who never open a map.

## Decision

**The app moves to `/`, and one service worker spans the origin — but it serves the
two surfaces according to what each one is, rather than treating the origin as one
undifferentiated blob.**

Three rules follow, and they are the whole decision:

### 1. The precache is route-aware

A static page precaches what a static page uses: the shared header bundle, its own
page bundle, the shared CSS. The app shell precaches the rest — the map bundle, the
SQL engine, the MapLibre worker, glyphs and sprites.

`scripts/sw-precache-globs.ts` is already a single exported data list, run through
workbox's own globber by `src/tests/basemap-precache.test.ts` rather than
re-declared — the comment there says why: *"every omission here is invisible until
someone is standing in a forest with a blank map and a clean console."* Splitting one
list into two keeps that property; hand-maintaining two lists would lose it.

### 2. The data prime stays tied to the APP, not to the origin

This is the rule that makes the merge safe, and it is subtler than it looks: *merging
the app into the root does not mean every page is the app*. `/` becomes the map;
`/species/…`, `/places/…`, `/collectors/…` remain a distinct surface that happens to
share an origin and a service worker.

So the prime fires where it fires today — when the map is opened — and a reader who
lands on a species page from a search engine downloads a species page. Nothing about
promoting the app should change what a reader pays to read.

### 3. The read path is cached, but not precached wholesale

Making species, places and people available offline is the point of merging, not a
side effect: a field naturalist wants to look a species up without signal. But the
whole read path is 101 MB (74 MB excluding the collectors' paginated collection
history, which is 576 files for 26 MB of the deepest-tail content on the site), and
that is not something to spend on someone's first visit.

Read-path HTML is therefore **runtime-cached with StaleWhileRevalidate**, and the
bulk offline read path is an **opt-in download** alongside the basemap — the pattern
[ADR 0025](0025-offline-basemap-is-a-byte-store.md) already established for a large,
deliberate artifact.

StaleWhileRevalidate rather than CacheFirst is not a detail. Notes are baked into
species pages at publish time ([ADR 0017](0017-scoped-note-render.md) renders the
species a note touched), and [ADR 0013](0013-event-driven-incremental-notes-publish.md)'s
entire purpose is that a contribution is live in seconds. A cache-first read path
would freeze that, quietly, for as long as the entry survived.

### The navigation fallback narrows rather than widens

`sw.ts` today carries `allowlist: [/^\/app\//]` on its navigation route, with the
comment *"prevents this from intercepting navigations to / or other routes"*. That
allowlist was the boundary protecting the static site from the app's offline shell.

At root scope the boundary must be re-drawn, not removed: the app shell answers `/`
and nothing else. A navigation to `/species/Bombus/mixtus/` must reach its own cached
HTML or the network — never the map's shell, which would replace a page the reader
asked for with an application they did not.

## Consequences

**Every visitor becomes a service-worker client.** That is the real cost of this
decision, and it is not the bytes — a route-aware precache for a static page is small.
It is that stale-cache confusion now reaches the whole site rather than a prototype
path. This session produced a live example: a hand-run of `postbuild-data.mjs` against
a dev server left a cached manifest naming a file that no longer existed, and the
symptom surfaced as `file is not a database` from wa-sqlite. That class of problem
becomes everyone's.

**`/app/` must keep answering for a deprecation window.** `start_url` and `scope` in
the web manifest both point there, and one installed PWA is one too many to strand.
A redirect is sufficient; the window can be short precisely because the population is
one.

**The Atom feed link moves to the merged page**, and the PWA metadata comes with it —
manifest link, iOS meta tags, apple-touch-icon, theme colour.

**`isInstalledPWA()` becomes load-bearing in more places.** It already gates the
basemap offer and, since beeatlas-66o, the offline-readiness claim; the opt-in read
path in rule 3 will want it too.

### Rejected alternatives

**Point the scope at `/` and ship.** The measured table above is the refutation: a
species-page reader pays 3.3 MB for an application they did not open.

**Serve everything from one entry (`app-entry.ts` at the root).** Simplest diff,
worst outcome. It hands the automatic data prime to every visitor and collapses the
distinction rule 2 depends on.

**Precache the whole read path at install.** 74–101 MB before anyone has asked for
anything. The basemap already established the right shape for an artifact of that
size: opt-in, explained, and installed-only where the storage rules demand it.

**Keep `/app/` and leave `/` as it is.** The status quo, and it has one real argument
— the boundary is doing safety work today. But it permanently splits the audience
between a site that cannot work offline and an app nobody finds, and the reason for
the split expired with ADR 0001.

## Open questions

**What signal opts a reader into the offline read path**, and where it lives — a row
in the account menu beside the basemap offer is the obvious answer, but whether
species/places/people are one download or three is not decided here.

**Whether the collectors' paginated collection history is included at all.** It is
26 MB for 576 pages of the site's deepest tail, and excluding it takes the read path
from 101 MB to 74 MB. Related: beeatlas-3bs, on legacy collector JSON still in the
docroot.

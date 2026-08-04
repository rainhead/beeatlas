# ADR 0029: The app moves to the root, and offline stops at the map

**Status:** Accepted — shipped 2026-08-04 (issue beeatlas-3xx)

Unblocked by [ADR 0026](0026-self-hosted-basemap.md) and [ADR 0025](0025-offline-basemap-is-a-byte-store.md),
which cleared the licensing and storage gates that kept the PWA on a separate path.

---

## Context

`/app/` exists because it was a prototype. The offline PWA needed a service worker,
a web manifest and a precache, and none of that was safe to point at the live site
while the basemap question was open — Mapbox's terms forbade offline tiles
([ADR 0001](0001-mapbox-basemap-cache.md)), so there was no offline map to promote.
That gate is gone: the basemap is ours, self-hosted, and verified offline on real
hardware.

The two paths are now the same application at two URLs. `_pages/index.html` and
`_pages/app/index.html` differ only in PWA metadata against an Atom feed link, and
both mount the same components. Keeping them apart leaves the address people actually
reach — `beeatlas.net` — as the one that cannot work in the field.

Migration is, unusually, not a constraint: exactly one installed PWA exists, on the
maintainer's phone.

## Decision

**The app moves to `/`. The service worker's scope follows it to the origin, but
nothing outside the map is cached, and only the app registers it.**

### Offline is for the field; online is for the desk

That is the line, and it is a product judgement before it is a technical one. The
map, the occurrence data and the basemap are what a person needs standing in a meadow
with no signal. Species, place and collector pages are reading done at a desk — and
they are precisely the parts that cache badly, for reasons set out below.

Drawing the boundary here means there is no ragged edge to explain: it is not that
one corner of the site is mysteriously unavailable offline, it is that offline covers
the field tool and stops.

### Only the app registers the service worker

`sw-registration.ts` is imported by `app-entry.ts` alone. The static pages mount
through `src/entries/{bee-header,species-index,taxon-page}.ts`, none of which import
it. **That property is now load-bearing and must not be casually changed.**

It is what makes the precache proportionate. The precache is 3.3 MB across 34 entries
— the map bundle (1272 KB), the MapLibre worker (585 KB), the wa-sqlite engine
(545 KB), nine glyph ranges, sprites and icons. A species page loads 18 KB of
JavaScript. Had every page registered the worker, a reader arriving from a search
engine would have been handed **180× what their page uses** for an application they
never opened. Because only the app registers, that 3.3 MB is paid by someone who
opened the map, where it is exactly the right thing to cache.

So there is no need for a route-aware precache, a per-surface glob split, or any
other machinery: the existing single list in `scripts/sw-precache-globs.ts` stays as
it is, still driven through workbox's own globber by
`src/tests/basemap-precache.test.ts`.

### The data prime stays tied to the app, not the origin

`/` does not import `prime-orchestrator.ts` today; only `app-entry.ts` does. Moving
the app to the root must not turn that into "every visitor primes" — the prime is
~4.7 MB on the wire and ~34.8 MB stored, and someone reading a species page has not
asked for it.

Merging the app into the root does not make every page the app. `/` becomes the map;
`/species/…`, `/places/…` and `/collectors/…` remain a separate surface that happens
to share an origin.

### The navigation fallback narrows rather than widens

`sw.ts` carries `allowlist: [/^\/app\//]` on its navigation route today, with the
comment *"prevents this from intercepting navigations to / or other routes"*. At root
scope that boundary must be re-drawn, not deleted: **the app shell answers `/` and
nothing else.** A navigation to `/species/Bombus/mixtus/` must reach the network —
never the map's shell, which would replace the page a reader asked for with an
application they did not.

## Why the read path is not cached — the reasoning, so it need not be rediscovered

The tempting version of this decision caches species, place and collector pages too.
It was measured and rejected, and each of these is a reason on its own.

**The photos are not ours.** A species page carries 18 cross-origin image references
to `inaturalist-open-data.s3.amazonaws.com`; only the distribution map
(`/data/species-maps/…svg`) is self-hosted. Cross-origin without CORS yields **opaque
responses**: their status cannot be read, so a 404 caches as a success, and browsers
**pad** them for quota accounting by megabytes per entry regardless of real size. At
~18 photos across 801 species the padding, not the bytes, becomes the binding
constraint. An offline species page would render text, a working map, and broken
image slots. Self-hosting thumbnails is a pipeline and licensing question — `license`
is a per-record column, so the photos are not uniformly redistributable — and it is
not a caching decision.

**Caching breaks note writing, and no strategy fixes it.** After a successful write
`bee-notes.ts:144` calls `window.location.reload()` when the publish is `live`. That
reload IS the mechanism by which an author sees their own note: the server has
re-rendered the page ([ADR 0017](0017-scoped-note-render.md)'s scoped render,
[ADR 0018](0018-coalescing-publish-queue.md)'s coalescing queue) and the reload picks
up the new HTML. Put a cache in front of that navigation and CacheFirst returns the
old page — the author's note simply absent, indistinguishable from a failed save. And
StaleWhileRevalidate produces the *identical symptom*, since it serves the cached copy
and revalidates behind it. SWR fixes a reader's eventual consistency and breaks the
author's write-then-reload contract. Only NetworkFirst preserves it, and NetworkFirst
on the read path is barely a cache at all.

**The volume is not incidental.** The static read path is 101 MB — 801 species pages
(5 MB), 180 place pages (1 MB), 124 collector pages (10 MB), 576 paginated
collection-history pages (26 MB), and 58 MB of species and place maps. Making it
offline means either spending that at install or inventing an opt-in flow, a size
decision, and a freshness policy — all to make available offline the part of the site
nobody needs offline.

## Consequences

**Once someone opens the map, the worker is active origin-wide.** Scope `/` is
required for the app to work at the root, so a controlled client's later navigations
to species pages do pass through the worker's fetch handler. With no matching route
Workbox hands them to the network, so behaviour is unchanged and an offline
navigation gets the browser's ordinary offline page exactly as today. But
*pass-through* is not *uninvolved*: a broken worker can still take the site down for
that user, where before it could only break `/app/`. That is the real residual cost of
this decision, and it is smaller than caching the read path would have been, not zero.

**There is no `clientsClaim`** (`sw.ts:4`, deliberate), so the worker never seizes
tabs already open. The takeover is gradual by construction.

**Reading requires a network, permanently and by design.** If that becomes wrong —
if people start wanting species accounts in the field — this record is what to
reopen, and the section above is the list of what it will cost.

**`/app/` must keep answering for a deprecation window.** `start_url` and `scope` in
the web manifest both point there. A redirect suffices, and the window can be short
because the population is one.

**The Atom feed link and the PWA metadata merge onto one page** — manifest link, iOS
meta tags, apple-touch-icon, theme colour.

## As shipped — three things this record did not anticipate

**The MapLibre worker had to move too.** It was served from `/app/basemap/maplibre/`
for one reason: a dedicated worker is its own service-worker client, matched on its
OWN url, so at the old scope anywhere else was unreachable offline
([ADR 0025](0025-offline-basemap-is-a-byte-store.md)). Widening the scope to the
origin dissolves that constraint and would have left a load-bearing runtime asset
under a path this record deprecates. It now sits at `/basemap/maplibre/` with the
glyphs and sprites. The constraint is not gone, only satisfied differently, so it is
asserted rather than remembered: `src/tests/basemap-precache.test.ts` reads `SW_SCOPE`
out of `src/sw-registration.ts` and requires both the precache glob and
`MAPLIBRE_WORKER_URL` to fall inside it. Narrowing the scope again fails the suite.

**The old registration had to be actively retired.** Two registrations coexist and the
narrower scope wins, so the `/app/` worker would have gone on answering `/app/`
navigations from its own precache — the old shell, the old bundle — indefinitely, and
the redirect stub is on the network side of it where it is never reached. Two things
retire it, either sufficient: the build no longer emits `/app/sw.js`, so the browser's
next update check for that script 404s and drops the registration; and
`sw-registration.ts` unregisters any `/app/`-scoped registration it finds when the root
page loads.

**`src/bee-atlas.ts` stopped being a Vite entry.** The two-entry split WAS the
no-service-worker-on-`/` guarantee while the two pages existed. With one page there is
one way in, and leaving `bee-atlas.ts` in `rollupOptions.input` would have left a
template able to mount the map without registering the worker or priming — the one
thing that list should make impossible.

**The PWA shell went to `/pwa/`, not to the root.** The obvious layout —
`/manifest.webmanifest` and `/icons/…` — was written, tested, and deployed, and
`/icons/` is unreachable on this server: Ubuntu's Apache ships
`Alias /icons/ "/usr/share/apache2/icons/"` for mod_autoindex, and an Alias beats the
document root. The files published into htdocs correctly and 404'd anyway.

Because they are precached, that was not four missing icons. Each 404 fails the
service worker's install, and with no older worker the registration is **discarded** —
so the deploy produced a site with no service worker at all, no console error, and
nothing in the build log. The general rule is worth more than the fix: *a path that
resolves in `_site` is not a path the server will return*, and a precache list
generated by globbing the built tree cannot see the difference.
`src/tests/basemap-precache.test.ts` now pins `icons/` as a reserved prefix, and
`scripts/offline-uat.mjs` enumerates unresolvable precache URLs whenever no worker
takes control, because the symptom points nowhere near the cause.

The precache is unchanged in shape and came out at 33 entries / 3.35 MB.

### Rejected alternatives

**Point the scope at `/` and let every page register.** The 3.3 MB precache against
an 18 KB page is the refutation.

**Serve everything from `app-entry.ts` at the root.** The smallest diff and the worst
outcome: it hands the automatic data prime to every visitor and collapses the
distinction between the two surfaces.

**Cache the read path with StaleWhileRevalidate.** This was the first draft of this
record. It is wrong: SWR does not solve the notes problem, it reproduces it, and it
leaves the photos broken regardless.

**Keep `/app/` as it is.** The status quo, whose one real argument is that the path
boundary is doing safety work today. But it permanently splits the audience between a
site that cannot work offline and an app nobody finds, and the reason for the split
expired with ADR 0001.

# Map interaction UAT

A scripted pass over everything you can *do* to the map. Written after the
MapLibre swap (beeatlas-q73) rewrote ~870 lines of `src/bee-map.ts` — including
the entire click path — and a variety of interactions were reported broken.

Re-run it after any renderer change, any edit to the click chain, or any change to
how `<bee-atlas>` and `<bee-map>` talk to each other.

**Why a script rather than "click around":** the interaction layer is a priority
chain, and the failures are order-dependent — a point on top of a county fill, a
drag that ends over a dot, a tap after a tap. Those are exactly the cases free-form
clicking misses, and they are why this file lists the *expected* behaviour beside
each step rather than assuming the tester remembers it.

## Before you start

```bash
npm run dev            # http://localhost:8080/  — the primary QA surface
                       # http://localhost:8080/app/ — the PWA (service worker, offline)
```

If the sidebar list is empty with `no such column: o.tier`, the local
`public/data/occurrences.db` is stale — see [.claude/skills/run-app](../../.claude/skills/run-app/SKILL.md).

Useful for driving the app without hunting for a dot on the canvas:

| what | how |
|---|---|
| Preselect occurrences | `?o=<id>,<id>&pane=list` |
| Set the view | `?x=-121.76&y=46.85&z=13` |
| Trail country (dense features) | `?x=-121.76&y=46.85&z=13` (Rainier) |
| Offline cold start, automated | `node scripts/offline-uat.mjs --browser=chromium --prime` |

Record results as a comment on the tracking issue. For each failure capture: the
URL, the step number, what you expected, what happened, and whether the console
said anything (usually it does not — that is the theme of this whole area).

## Already ruled out — do not re-chase

Both were plausible causes of "interactions broke" and both were tested and are
**not** the problem:

- **Cursor feedback / hover.** There were no `mouseenter`/`mouseleave` handlers
  before the swap either. Nothing regressed; there was never anything there.
- **Second-tap-does-nothing on touch.** The single click listener returns early
  when `_clickConsumed` is set, and only `mousedown` clears it — which looked like
  it would break every tap after the first on a phone. Measured with touch
  emulation: MapLibre fires `touchstart` → `mousedown` → `click` on every tap, so
  the flag is cleared each time. Three consecutive taps all dispatch.

## A. Click priority chain

The chain is one ordered hit-test (`_clickTargets` in `src/bee-map.ts`); the first
layer with a feature under the cursor takes the click and nothing below it is
consulted. `queryRenderedFeatures` only returns features from *rendered* layers, so
a boundary layer at `visibility: none` is skipped — that, and not any explicit
check, is what preserves "fires only when the layer is visible".

| # | Do | Expect |
|---|---|---|
| A1 | Click a cluster (a numbered circle) | Sidebar lists **every** occurrence in that cluster |
| A2 | Apply a filter, then click a cluster spanning filtered-out records | Only the *visible* records are listed; filtered-out leaves are excluded |
| A3 | Click a single dot | Detail card for that one occurrence |
| A4 | With a filter active, click a greyed "ghost" dot | **Nothing happens** — ghosts are not selectable |
| A5 | Regions → Counties, click inside a county away from any dot | County selected |
| A6 | Regions → Counties, click a dot **on top of** a county | The **dot** wins, not the county |
| A7 | Shift-click a second county | Both counties selected (multi-region toggle) |
| A8 | Shift-click a selected county again | It is removed from the selection |
| A9 | Regions → Ecoregions, click one | Ecoregion selected (same behaviour as counties) |
| A10 | Regions → Places, click a place polygon | Navigates to / filters by that place |
| A11 | Regions → Wilderness, click inside a wilderness area | *No* selection — wilderness is an overlay, not clickable |
| A12 | Click empty map | Selection clears |
| A13 | Regions → Off, click where a county fill used to be | Nothing selected — the hidden layer is not hit-tested |

## B. Rectangle selection — **desktop only**

Bounds are a **filter**, not a selection (`bbox=` URL param); selection stays
individual records. The two coexist.

| # | Do | Expect |
|---|---|---|
| B1 | Shift-drag a box over some dots | A box draws while dragging; on release the view is filtered to it |
| B2 | Shift-drag | The map must **not** box-zoom (MapLibre's own box zoom is disabled) |
| B3 | Shift-drag ending exactly on top of a dot | The filter applies and that dot is **not** also selected |
| B4 | After B1, check the URL | `bbox=` present; reload restores the filter |
| B5 | Select a record, then shift-drag a box | Both survive — bounds filter *and* record selection |
| B6 | Shift-drag, then release outside the map | Gesture ends cleanly; no stuck crosshair cursor, drag-pan re-enabled |

## C. View state and navigation

| # | Do | Expect |
|---|---|---|
| C1 | Pan and zoom | `x`/`y`/`z` update in the URL after the move settles |
| C2 | Reload | The same view is restored |
| C3 | Filter to a species (sidebar **Species or group**) | The dot set and the sidebar re-filter. The camera does **not** move — a taxon is a filter, not a destination, and nothing in `bee-map.updated()` moves the camera for one. There is no species *search* yet; the header search takes label numbers only (beeatlas-7nx) |
| C4 | Look up a catalogue number | Selects the specimen **and yields an active filter** ([ADR 0020](../adr/0020-catalog-lookup-selects-and-filters-yield.md)). To test the yield you must have a filter that *excludes* the match — e.g. `?taxon=130222` (Bombus melanopygus) then look up `2303966` (a Lasioglossum). With no filter active there is nothing to yield |
| C5 | Browser back / forward | View and selection follow the history entry |
| C6 | Toggle table mode | The map does **not** resize, and should not: `bee-pane` is `position: absolute; z-index: 1` over a full-size map, in table mode as in list mode. What this step actually guards is the canvas — no blank, no stretch, no letterbox |

## D. Controls and chrome

| # | Do | Expect |
|---|---|---|
| D1 | Locate button | Top-**left**. Blue dot + accuracy circle appear |
| D2 | Reload with location permission already granted | Locates automatically, no tap needed |
| D3 | Deny location permission | A clear error; the app does not hang |
| D4 | Regions button | Top-**right**, above the map, opens the boundary menu |
| D5 | Read the attribution | OpenStreetMap/Protomaps **and** Washington Bee Atlas **and** the DEM/terrain notice. The terrain line correctly disappears above z15, where the hillshade has faded out |
| D5a | Narrow the window under 640px, or use a phone | The attribution collapses to the ⓘ button **at load**, not after the first drag — MapLibre opens it and we close it (`_collapseCompactAttribution`). Open it by tapping ⓘ, then pan: it must **stay** open |
| D6 | Check control stacking | Nothing is trapped under `<bee-pane>` — `bee-map`'s `z-index: 0` is load-bearing |

## E. Style and legibility — the reason the field style exists

At Rainier, `?x=-121.76&y=46.85&z=13`:

| # | Expect |
|---|---|
| E1 | Trails read as **brown dashed** lines, thick enough to follow at arm's length |
| E2 | Streams and rivers are blue, with rivers visibly heavier than streams |
| E3 | Peak names are labelled from z13 |
| E4 | Every label is **readable text, never blank boxes** (a blank box is a missing glyph range) |
| E5 | Cluster counts and place/wilderness names render (they use Noto Sans Medium; no Bold is shipped) |
| E6 | Hillshade is at full strength at z13 and has faded to nothing by z15 — judge by EYE. `queryRenderedFeatures` on a hillshade layer always returns 0: raster layers have no queryable features, so it is not a usable check |
| E7 | Lakes and rivers are **not** shaded by the hillshade |
| E8 | Zoom below z13: trails/streams/peaks disappear rather than showing an empty map |
| E9 | Recency is **not** colour-encoded (2026-08-03). Every dot and cluster is the one light grey; the only colour split left is `tier`, where `other` takes a muted `#7a8a99`. Cluster counts are dark on that light circle — white was 1.62:1 and unreadable, which is what made the old scheme read backwards. See `RECENCY_COLORS` in `src/style.ts` |
| E10 | Tier filter hides and restores dots. Note a tier-excluded record does **not** become a ghost — the ghost set is itself tier-filtered, so tier reads as a layer toggle while taxon reads as a filter |

## F. Mobile / installed PWA

Install from Safari → Share → Add to Home Screen at `/app/`. **Do it in the
installed app** — a browser tab is a separate storage bucket
([ADR 0025](../adr/0025-offline-basemap-is-a-byte-store.md)).

| # | Do | Expect |
|---|---|---|
| F1 | Every check in **A** except A7/A8, by tapping | Same results. Taps 2, 3, 4… must all work, not just the first. A7/A8 are shift-clicks and have no touch equivalent — multi-region selection is desktop-only, and that is a gap, not a test failure |
| F2 | Pinch-zoom and two-finger pan | Smooth; no stuck gesture afterwards |
| F3 | Tap a cluster with many leaves | Sidebar fills; the pane is usable one-handed |
| F4 | Rotate the device | Map resizes correctly, no letterboxing |
| F5 | Locate | Blue dot; works with the app installed |
| F6 | Account menu → offline maps row | Offers the download (~285 MB) |
| F7 | Download it | Progress counts up; ends at "✓ Offline maps ready" |
| F8 | Force-quit → airplane mode → cold start | Basemap, dots **and labels with icons** at z13–14 |
| F9 | While offline, run through **A** again | Interactions work with no network |
| F10 | A "Turn On Wi-Fi to Use the Internet" alert appears once at launch | KNOWN, CAUSE CONFIRMED, ACCEPTED (`beeatlas-c8v`). It is the browser's own service-worker update check re-fetching `/app/sw.js`, which no page code initiates and which cannot be precached. The app itself makes zero failed requests. **Do not re-investigate** — the suppression trade-off was considered and declined |
| F11 | Account menu → **Diagnostics** | A full state dump: caches, archives, map state, and every request the app made. This is the tool for reporting anything on this list — a screenshot answers most questions outright |

## Faster loop: the iOS Simulator

For anything FUNCTIONAL, the Simulator beats a physical device — chiefly because
**Safari Web Inspector attaches to it with no cable, no device trust, and no
fighting the Develop menu**. A real console is the thing whose absence turned the
beeatlas-6rs offline bug into four rounds of guess-and-fix.

It is also closer to the truth than Playwright's WebKit, which is the same engine
in a different embedder: the Simulator runs actual Safari, so `navigator.standalone`,
Home-Screen launch semantics, and the installed-app storage bucket behave as they
do on a phone.

```bash
xcrun simctl list devices available          # pick one; iOS runtimes ship with Xcode
xcrun simctl boot <UDID> && xcrun simctl bootstatus <UDID>
xcrun simctl openurl <UDID> https://beeatlas.net/app/
xcrun simctl io <UDID> screenshot shot.png   # also: `recordVideo`
```

Then Safari → Develop → Simulator → the page. Install to the Home Screen by hand
(Share → Add to Home Screen); that step is not scriptable through `simctl` — it
needs XCUITest, which is rarely worth it.

**Two traps, both of which would produce a confident false negative:**

- **There is no airplane mode.** The Simulator uses the *host's* network stack, so
  the only real ways offline are turning the Mac's Wi-Fi off, or installing
  Network Link Conditioner (Additional Tools for Xcode) and selecting the 100%
  Loss profile.
- **`simctl status_bar override --dataNetwork` is COSMETIC.** It draws an airplane
  icon and changes nothing about connectivity. A test "passing" under it has
  tested nothing.

**Still needs a real device:** storage limits and `persist()` behaviour, anything
performance-shaped (the Simulator has desktop CPU and disk, so the `Blob.slice`
and 285 MB download timings from spike beeatlas-93t are not reproducible), and
system UI such as the "Turn On Wi-Fi to Use the Internet" alert — that is
device-level network-reachability UI and is not known to appear here.

## G. Regression guards worth re-running

```bash
npm test                                                  # 54 files
node scripts/offline-uat.mjs --browser=chromium --prime    # offline cold start
node scripts/offline-uat.mjs --browser=webkit              # Safari-engine online half
```

`offline-uat.mjs` defaults to WebKit because it is the only automatable engine
sharing Safari's storage semantics; a Chromium/WebKit difference *is* a finding.
Its offline half needs `--browser=chromium` (Playwright's `setOffline` is not
reliable in WebKit).

It also defaults to **the live site**, so a change that is committed but not yet
deployed fails it for the wrong reason. To run it against a local build instead:

```bash
npm run build && npx vite preview --outDir _site --port 4173
node scripts/offline-uat.mjs --browser=chromium --url=http://localhost:4173/ --fresh
```

`vite preview` inherits `server.proxy` from `vite.config.ts`, so `/basemap/tiles`
proxies to beeatlas.net and the manifest self-prime works — which is what makes a
local run meaningful at all. `--fresh` discards the profile; without it a stale
service worker from the previous build keeps controlling the page. `npm run dev`
is NOT a substitute: it serves no `/sw.js`, so there is nothing to test.

Both should be **green** — chromium 11/11, webkit 4/4 with the offline half
skipped and said so. They were both permanently red until `beeatlas-69s`; if you
find yourself explaining away a failure, that is the bug, not the run.

Four of those are the ADR 0029 surface boundary, added when the app moved to `/`
(beeatlas-3xx). Two run online — a species page must be served as ITSELF, and it
must come from the network rather than the worker (`fromServiceWorker() === false`,
i.e. no route matched). The second is what protects note writing: `bee-notes.ts`
reloads after a live publish and that reload IS how an author sees their own note,
so any route in front of it returns the pre-write copy. Two run offline — the app
shell must boot at `/`, and an offline species navigation must NOT be answered with
the map. Override the read-path target with `--read-url=` if that species page ever
goes away.

One line of the chromium run is informational, not a check:

```
  note  2 .pmtiles request(s) during startup — expected, beeatlas-c8v
```

Those come from pmtiles' own `FetchSource` before `registerPrimedArchives`
replaces the entry, and were accepted and closed. What is *asserted* is the
property that matters: after the style is up, jumping across Seattle, Spokane,
Rainier and the Olympic coast must produce **zero** `.pmtiles` requests — the
tile read path is entirely local.

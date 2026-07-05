# WTA (Washington Trails Association) data — feasibility for place-page enrichment

**Date:** 2026-07-05 · **Status:** research only, no commitment to build

## Summary / recommendation

WTA has **no API, no data export, and no bulk data offering**. Its hike data (length,
elevation, difficulty, coordinates, features, passes, trip reports) exists only as
rendered HTML, and its Terms of Service restrict content use to "internal informational
purposes" — reproduction "in any form, by any means … for any other purpose" is
prohibited. Its robots.txt additionally sets a 60-second crawl delay, blocks AI crawlers
(including ClaudeBot), and declares `ai-train=no` / `use=reference` content signals.

**Ingesting WTA content into BeeAtlas is off the table.** This matches the conclusion
BeeAtlas already reached: the existing "WTA hike corridor" places take only the *idea*
(a curated hike list) from WTA — all geometry comes from OpenStreetMap (ODbL) via the
Overpass API, per the explicit warning in `data/add_hikes_as_places.py`.

**What IS viable — the recommended minimum:**

1. **Link out.** Add an optional `wta_url` (or generic `links = [{label, url}]`) field to
   `content/places.toml` entries that correspond to WTA hikes. Hike URLs are stable,
   human-guessable slugs (`https://www.wta.org/go-hiking/hikes/<slug>`). Plain hyperlinks
   to a source do not implicate the ToS content-reuse clause. A "Trail info, directions
   & recent trip reports on WTA →" link delivers ~90% of the newcomer value (access,
   parking, difficulty, liveness) at zero legal risk and zero pipeline complexity —
   hand-curated once per place, no scraping.
2. **Source access/logistics *facts* elsewhere.** Facts a newcomer needs that BeeAtlas
   might want to *display* (trailhead point, parking, pass required) are available from
   license-clean sources: OSM (trailheads, parking areas, `fee`/`charge` tags, ODbL),
   USFS/NPS/WA State Parks open data (pass requirements are government facts), and
   Recreation.gov's RIDB API (public domain, CC0-style, for federal sites). WTA's *prose*
   (descriptions, trip reports) is the only thing uniquely theirs, and it is exactly the
   part that cannot be reused.
3. **If deeper integration is ever wanted,** the path is a partnership/permission email
   to WTA, not scraping. WTA is a nonprofit with a mission adjacent to community science;
   an explicit grant would moot the ToS question. Until then, treat WTA as link-only.

---

## 1. Does WTA offer an API, export, or bulk data?

**No.** Findings:

- No developer/API page exists on wta.org; searches for an official WTA API surface only
  third-party scrapers. Community projects state plainly that "the WTA has no API
  available for obtaining trail data" and resort to scraping HTML.
  Sources: https://github.com/marcusprice/mywta ·
  https://github.com/jimmygle/wta-scraper ·
  https://apify.com/crawlerbros/wta-trails-scraper (a paid scraper — its existence is
  evidence of demand, not of permission)
- The hiking guide is a rendered-HTML catalog of 3,500+ hikes at
  https://www.wta.org/go-outside/hikes (hike pages under `/go-hiking/hikes/<slug>`);
  no GPX download, no JSON endpoints exposed for reuse, no data-download page.
- WTA's own apps (WTA Trailblazer) consume internal endpoints; nothing is documented or
  offered for third parties. Source: https://apps.apple.com/us/app/wta-trailblazer-go-hiking/id649149233
- The only machine-readable artifact WTA publishes is a search-engine sitemap:
  `https://www.wta.org/sitemap.xml.gz` (from robots.txt) — useful at most for
  *discovering hike-page URLs to link to*, not for content.

## 2. What structured fields does a Hike page expose? Trip reports?

Inspected https://www.wta.org/go-hiking/hikes/rattlesnake-ledge (2026-07-05):

- **Hike page fields (HTML only):** length ("4.0 miles, roundtrip"), elevation gain
  (1,160 ft), highest point (2,078 ft), difficulty ("Moderate"), region hierarchy
  ("Snoqualmie Region > North Bend Area"), trailhead coordinates (47.4347, -121.7687),
  feature tags (dogs on leash, kid-friendly, lakes, summits, wildflowers/meadows, …),
  passes/permits required, prose driving directions and parking notes, star rating
  (4.07/5, 432 votes), trip-report count (2,825).
- **No machine-readable markup observed:** no JSON-LD/schema.org/microdata, no GPX
  download, no public map-data endpoint on the page.
- **Trip reports** (e.g. https://www.wta.org/go-hiking/hikes/rattlesnake-ledge/@@related_tripreport_listing):
  date, author username, free-text body, condition observations (trail/snow/bugs/
  wildflowers — notably *bloom observations*, which is the tantalizing bit for a bee
  atlas), helpful-vote counts. Paginated HTML, 5 per page; no RSS/JSON output visible
  (robots.txt in fact disallows `/*search_rss$` paths). Trip reports are user-submitted
  content that users license to WTA — a third party gets no license from that at all.

The fields are exactly what a newcomer-activation page wants — which is why the link-out
pattern works: WTA already renders this better than BeeAtlas would.

## 3. Terms of use / robots.txt / licensing — decisive constraints

- **Terms of Service** (https://www.wta.org/our-work/about/terms-of-service):
  - "all Content contained on this website is the property of WTA and/or its affiliates
    or licensors."
  - Visitors get a "personal, non-transferable, non-exclusive right to access and use
    the Content," and may "view, copy, download, and print" it **"for internal
    informational purposes"** only.
  - "No part of this website or its Content may be reproduced or transmitted in any
    form, by any means, electronic or mechanical … for any other purpose."
  - Republishing hike stats, descriptions, or trip-report excerpts on beeatlas.net is
    reproduction for a non-internal purpose → **not permitted without permission.**
    Scraping is not named explicitly, but the reuse it would feed is prohibited, and
    `data/add_hikes_as_places.py` already records the project's standing read of this:
    "WTA ToS prohibits programmatic reproduction of site content … do NOT fetch trail
    geometry from the WTA website."
- **robots.txt** (https://www.wta.org/robots.txt, fetched 2026-07-05):
  - `Crawl-delay: 60` for all agents — hostile to bulk crawling by design.
  - AI crawlers fully disallowed: ClaudeBot, GPTBot, ChatGPT-User, CCBot, Amazonbot,
    Applebot-Extended, Bytespider, Google-Extended, meta-externalagent.
  - Content signals: `search=yes`, `ai-train=no`, `use=reference`.
  - Sitemap: https://www.wta.org/sitemap.xml.gz
- **Net:** programmatic *reuse* is not permitted; linking is. Small, factual,
  independently-verifiable data (a trailhead lat/lon) is thin copyright territory, but
  there is no reason to test it when OSM/agency sources carry the same facts cleanly.

## 4. Existing BeeAtlas overlap — where did the hike corridors come from?

- `data/add_hikes_as_places.py` (repo) adds 14 hand-curated WTA-catalog hikes as
  `[[places]]` entries in `content/places.toml`. The docstring is explicit:
  - "Source: OpenStreetMap via the Overpass API (license-clean)."
  - "WTA ToS prohibits programmatic reproduction of site content and WTA offers NO
    geometry data — do NOT fetch trail geometry from the WTA website."
  - "Trail geometry © OpenStreetMap contributors (ODbL), via Overpass API."
- Mechanics: per hike, an OSM relation ID (or name query within a bbox, or a hand-traced
  GPX fallback in `data/fixtures/hike-gpx/`) → centerline → ~250 m buffer in EPSG:32610 →
  simplified MULTIPOLYGON WKT appended to places.toml. CONTEXT.md records these as
  "WTA hike corridors (linear features → ~250m buffer)".
- **Does that origin offer more?** Yes — but the richer origin is *OSM*, not WTA. OSM
  carries trailhead nodes (`highway=trailhead`), parking (`amenity=parking`, `fee=*`),
  surface/SAC difficulty tags, and route relations statewide, all ODbL. What OSM lacks
  is WTA's *editorial* layer (curated difficulty, prose, trip reports) — the part that
  is ToS-locked. WTA itself offers nothing beyond the HTML pages already examined.

## 5. Bottom line

| Option | Verdict |
|---|---|
| **Link to WTA hike pages** from matching place pages | **Do it.** Zero licensing risk, near-zero cost (a URL field per place, hand-curated), high newcomer value: directions, parking, passes, difficulty, and live trip reports one click away. |
| **Ingest WTA structured fields** (length, difficulty, coords, features) | **No.** ToS limits use to internal informational purposes; no API/export exists; HTML scraping would violate both the reuse clause and the crawl posture. Equivalent facts available from OSM / agency open data if BeeAtlas ever wants to display them natively. |
| **Ingest/excerpt trip reports** (site "liveness", bloom conditions) | **No** without written permission — user content licensed to WTA, not to third parties. If bloom/condition signals matter later, ask WTA directly, or derive liveness from BeeAtlas's own data (recent iNat samples per place) instead. |
| **Automated place↔hike matching** | Fine in principle if done against the sitemap URL list or hand-curated (matching a place *name* to a *URL* reproduces nothing substantive), but with ~14 WTA-derived places + ~180 total, hand-curation is simpler and safer. |

WTA is **viable as a link-out destination only**. The realistic minimum is: add an
optional external-link field to the places schema, populate it for the 14 existing WTA
hike-corridor places (their slugs largely mirror WTA slugs), and render a prominent
"Plan your visit on WTA" link on place pages. Anything beyond that is licensing-gated
on a conversation with WTA.

## Open questions / next steps

- **Schema choice:** single-purpose `wta_url` vs. generic `links = [{label, url}]` on
  `[[places]]` — generic also covers agency pages (USFS trailhead pages, State Parks),
  which serve the same access/logistics need for non-WTA places. Needs a small decision
  (ADR-worthy only if the links model becomes structural).
- **Partnership email:** is it worth asking WTA for permission to surface trip-report
  snippets or condition flags? Low effort to ask; they are a mission-aligned nonprofit.
  Decide whether the product wants this before asking.
- **License-clean substitutes:** if place pages should natively show trailhead/parking/
  pass facts, scope a small OSM Overpass enrichment (trailhead node + parking within the
  corridor) and a passes lookup from agency sources / Recreation.gov RIDB (public-domain
  API) — separate research task.
- **Liveness without WTA:** "recent activity at this place" can come from BeeAtlas's own
  occurrence data (latest Sample dates per place) — likely a better newcomer signal than
  hiker trip reports anyway, and already in the pipeline's hands.
- Verified 2026-07-05 via WebFetch of wta.org pages; the JSON-LD/microdata absence was
  checked on one hike page (Rattlesnake Ledge) — spot-check a second page if this ever
  becomes load-bearing.

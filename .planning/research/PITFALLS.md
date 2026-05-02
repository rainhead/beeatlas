# Pitfalls Research: Species Tab (v3.2)

**Domain:** Adding a Species Tab page to the BeeAtlas static site — hierarchical taxonomic nav, image-forward species cards, static SVG occurrence maps, seasonality viz, photo TOML manifest, WA state checklist ingestion. Eleventy MPA + Vite + Python pipeline integration.
**Researched:** 2026-05-02
**Confidence:** HIGH — pitfalls grounded in BeeAtlas's specific codebase (Eleventy 3.1 wrapper, wa-sqlite + occurrences.parquet, maderas nightly cron, mapbox-gl 1,700 KB chunk constraint), in retrospective lessons from v1.2/v1.5/v1.7/v3.1, and in iNaturalist API license/taxonomy semantics.

---

## Pitfall Summary Table

| #  | Pitfall                                                                              | Risk      | Prevention Phase                  |
| -- | ------------------------------------------------------------------------------------ | --------- | --------------------------------- |
| 1  | Photo manifest references iNat photo IDs that 404, are hidden, or relicensed silently | CRITICAL  | Manifest schema + nightly anti-entropy |
| 2  | All-rights-reserved or NC-incompatible photos slip into manifest; CC attribution missing | CRITICAL | Manifest schema validation       |
| 3  | WA state checklist source is stale or non-canonical; cards drift from reality       | CRITICAL  | Checklist ingestion               |
| 4  | Checklist ↔ Ecdysis name disagreement silently drops cards or duplicates them       | CRITICAL  | Checklist ingestion + reconciliation |
| 5  | Vagrant / out-of-state observation produces a card for a species not actually in WA | HIGH      | Inclusion rule                    |
| 6  | Tribe gap-fill from iNat goes stale; cached tribe assignments lag taxonomy moves    | HIGH      | Tribe ingestion + refresh strategy |
| 7  | Species page bundle accidentally pulls in mapbox-gl (~1,700 KB)                     | CRITICAL  | Vite multi-entry boundary         |
| 8  | `_data/species.js` reads parquet at every HMR reload, killing dev loop              | HIGH      | Build-time data feed              |
| 9  | `_data/species.js` requires occurrences.parquet to exist at build time; CI breaks   | HIGH      | Build-time data feed              |
| 10 | Largest-subgenus card list (Osmia ~80 species) ships 50+ MB of photo bytes per page | CRITICAL  | Card rendering + asset strategy   |
| 11 | SVG map for 1-record species visually identical to 1000-record species              | MEDIUM    | SVG generator                     |
| 12 | SVG maps regenerated nightly even when species occurrences unchanged                | MEDIUM    | SVG generator + caching           |
| 13 | SVG map ships points outside the WA viewBox (no clip)                               | MEDIUM    | SVG generator                     |
| 14 | One SVG per species × 800+ species bloats `public/data/` and CloudFront invalidation | MEDIUM   | SVG generator + caching           |
| 15 | Filter on species page hides cards with no "0 species" empty state                  | MEDIUM    | Species filter UX                 |
| 16 | Species-page filter URL schema collides or diverges from SPA `/collection?...`      | MEDIUM    | URL contract                      |
| 17 | Pre-filtered SPA link uses wrong query param; silently loads unfiltered map         | HIGH      | URL contract                      |
| 18 | Slug for species name diverges between species page and SPA pre-filtered link       | HIGH      | URL contract + slugify utility    |
| 19 | scientificName authority suffix ("Bombus mixtus Cresson, 1878") leaks into slugs and links | HIGH | Name normalization               |
| 20 | TOML round-trip with `tomlkit` reformats the file on every save; spurious diffs     | MEDIUM    | Authoring workflow                |
| 21 | Manifest authoring tool lets bad data in (no schema validation in `data/run.py`)    | HIGH      | Manifest schema validation        |
| 22 | Eleventy + Vite multi-entry: layout chain renders but Lit component never registers | HIGH      | Page scaffolding                  |
| 23 | `_data/species.js` swallows parquet read error; Eleventy ships empty species page   | HIGH      | Build-time data feed              |
| 24 | Vite shared-chunk dedup misses because of import shape (default vs named) drift     | MEDIUM    | Multi-entry build                 |
| 25 | Production build differs from dev (HMR works; `npm run build` breaks)              | MEDIUM    | Multi-entry build                 |
| 26 | iNat photo URL pattern changes between size variants; hard-coded URLs break        | MEDIUM    | Photo URL strategy                |
| 27 | Hot-linking iNat photos at scale violates iNat TOS / CDN gets rate-limited         | HIGH      | Photo URL strategy                |
| 28 | Coordinate jitter for stacked specimens at same lat/lon distorts perceived density | LOW       | SVG generator                     |
| 29 | Color choice for SVG occurrence dots fails colorblind / print rendering            | LOW       | SVG generator                     |
| 30 | Page weight regression: per-card photos + DOM + JS exceeds budget without measurement | HIGH    | Performance budget                |

---

## Critical Pitfalls

### Pitfall 1: Photo manifest TOML drifts as iNat photos disappear, get hidden, or get relicensed

**What goes wrong:**
The TOML manifest references iNat photo IDs by integer. Over time:
- A photographer deletes the observation (404 on the photo URL)
- An iNat moderator hides the observation for misidentification or copyright complaint
- A photographer changes the license from CC-BY to all-rights-reserved (no longer hot-linkable)
- iNat re-encodes photo URL paths (a CDN migration would break hard-coded URLs)
- The photographer renames their account (URL with username embedded breaks)

The site keeps shipping cards with broken images, missing alt text, or worse — an attribution that says "CC-BY" for a photo that has been relicensed to all-rights-reserved (a TOS violation).

**Why it happens in BeeAtlas's context:**
- The manifest is checked-into-git static data. Without a nightly check, drift accumulates silently between manual edits.
- Photo manifest entries were "filled at species-add time, then manually editable" (seed). There is no enforced lifecycle for invalidation.
- The site has no server runtime, so 404 detection cannot happen at request time — it has to happen at pipeline time.

**How to avoid:**
- **Anti-entropy step in `data/run.py` after `feeds`:** for each photo ID in the manifest, fetch `GET https://api.inaturalist.org/v1/photos/{id}` (cheap HEAD-style; the API returns metadata including license and observation visibility). Compare:
  - HTTP 404 → flag in `data/manifest_drift_report.json` and emit nonzero exit on `--strict` (CI gate later) or warning on default (nightly informational).
  - License changed → flag with old/new pair.
  - Observation hidden / quality_grade changed to `casual` → flag.
- **Cache the photo metadata response** in the same `inaturalist_waba_data`-style isolated dlt schema (e.g., `species_photos_cache`) so a single nightly run scans only deltas via `updated_at`.
- **CI smoke test (`npm run validate-schema`-adjacent):** for a small representative subset of manifest photos (say 20 random IDs), HEAD the photo URL and assert 200. Catches CDN-wide breakage early.
- **Sentinel rendering:** if a photo entry has `status = "drift"` in the manifest, the species card omits that photo and falls back to the next (or shows a placeholder) rather than rendering a broken `<img>`.

**Warning signs:**
- Broken-image icons in production cards
- 404s in CloudFront access logs for `/static.inaturalist.org/...` (if hot-linked) or for the manifest's own image URLs
- Lighthouse "broken-link" warnings on the species page
- A photographer or moderator opens an issue saying "you're using my photo without permission"

**Phase to address:**
**Manifest schema phase** (define drift status fields) + **Nightly anti-entropy phase** (verifier script wired into `data/run.py` after `feeds`).

---

### Pitfall 2: All-rights-reserved or NC-incompatible photos in manifest; CC attribution rendered incorrectly or absent

**What goes wrong:**
iNat photos carry one of: CC0, CC-BY, CC-BY-NC, CC-BY-SA, CC-BY-NC-SA, or "all rights reserved." The manifest authoring workflow accepts any photo URL the curator pastes in, including:
- All-rights-reserved photos that legally cannot be hot-linked or cached and re-served
- CC-BY-NC photos on a site that has any commercial flavor (BeeAtlas is non-commercial, so NC is fine — but the constraint is rarely visible to authors)
- CC-BY photos rendered without the required attribution string ("Photo by X, CC-BY 4.0, via iNaturalist") next to the image

The site goes live with attribution missing, photographers complain, the project loses goodwill, and (worst case) a copyright claim forces takedown of the page.

**Why it happens in BeeAtlas's context:**
- The seed says "WABA + non-WABA CC-licensed photos acceptable" but does NOT list specific licenses to allow/exclude.
- The manifest schema is being designed in this milestone — easy to omit license as a required field.
- TOML is permissive — no validation runs without explicit code.
- iNat API exposes license codes as strings (`cc-by`, `cc-by-nc`, `cc0`, `null`) but `null` means all-rights-reserved, which is easy to forget and let through.

**How to avoid:**
- **Required `license` field in the TOML schema:** every photo entry must have `license = "cc0" | "cc-by" | "cc-by-nc" | "cc-by-sa" | "cc-by-nc-sa"`. Reject all other values (including `"all-rights-reserved"`, `null`, missing) with a clear error.
- **Required `attribution` field for non-CC0:** the renderer reads the attribution string verbatim and places it adjacent to the photo. CC0 photos may have it omitted.
- **Validation in `data/run.py` (export step or anti-entropy step):**
  ```python
  ALLOWED_LICENSES = {"cc0", "cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa"}
  for species, photos in manifest.items():
      for p in photos:
          if p.get("license") not in ALLOWED_LICENSES:
              raise ValueError(f"{species} photo {p['id']}: invalid or missing license {p.get('license')!r}")
          if p["license"] != "cc0" and not p.get("attribution"):
              raise ValueError(f"{species} photo {p['id']}: attribution required for {p['license']}")
  ```
- **Schema test in pytest:** load a fixture manifest with bad licenses and assert validation rejects them.
- **Render-side license badge:** the species card renders a small "CC-BY" / "CC0" pill near the photo. Forces the renderer to read the field, which forces the field to exist.

**Warning signs:**
- A photo entry with `license = "all-rights-reserved"` slipped through git review
- Attribution line missing under a photo on production
- An iNat user emails to ask why their photo is being used

**Phase to address:**
**Manifest schema phase** — schema definition + validation in `data/run.py`. Schema test in pytest.

---

### Pitfall 3: WA state checklist source is stale or non-canonical; cards drift from current consensus

**What goes wrong:**
The seed says "WA state checklist source — TBD." Picking the wrong source means:
- Using a personal blog post or PDF list that hasn't been updated in 5 years (missing recent introductions, missing recent splits)
- Using an older checklist (e.g., Roberts 1996 for *Andrena*) when GBIF / Discover Life / OSU has a more current one
- Using a list that includes species that have been synonymized since publication
- Using a list that lacks authority strings, making it impossible to disambiguate names from Ecdysis (which has authority)
- The chosen source has no "last modified" metadata, so detecting future drift is impossible

The site advertises that species exist in WA when they don't, or omits species that do — both undermine its educational mission.

**Why it happens in BeeAtlas's context:**
- The seed defers source selection to v3.2 spec — easy to short-circuit with the first list found
- Volunteer collectors will be the audience; getting the species set wrong directly damages credibility
- BeeAtlas already has Ecdysis as the taxonomy-of-record, but Ecdysis is *what's been collected*, not *what occurs in WA* — different sets

**How to avoid:**
- **Sourcing decision is explicit in research, not in implementation:** the research milestone (this one) and a follow-up checklist-source decision must produce a written rationale before code is written. Candidate sources to evaluate (NOT to be assumed):
  - Best (Ascher) Discover Life regional checklist
  - GBIF "Washington, US" species list filtered to Apoidea
  - OSU PNW Bee Atlas project list
  - Williams/Thorp/Richardson *Bumble Bees of North America* (2014) for Bombus only
  - Jha et al. WA state list (if one exists in primary literature)
- **Track checklist provenance in `data/`:** commit the checklist source as a versioned file (CSV with columns: `scientificName`, `authority`, `source`, `source_url`, `last_modified`, `notes`). When the checklist updates, commit a diff. Maintains audit trail.
- **Refresh policy:** quarterly review at minimum; track in PROJECT.md as a recurring task.
- **`last_modified` metadata required:** the source must publish a date. If it doesn't, that's a red flag — pick a different source.
- **Document explicitly in PROJECT.md:** "WA bee checklist as of {date}, sourced from {citation}, with WABA project corrections applied."

**Warning signs:**
- Volunteer reports "you list X but I've never seen one in WA"
- An expert reviewer points out a species missing from the list that is well-documented in WA
- Checklist source URL 404s or returns "last updated 2018"
- New WABA-collected species that the checklist doesn't include

**Phase to address:**
**Checklist ingestion phase** — formal source selection (with rationale documented in the phase summary), CSV in `data/`, and a `data/checklist_pipeline.py` that loads it into DuckDB.

---

### Pitfall 4: Checklist ↔ Ecdysis name disagreement silently drops cards or duplicates them

**What goes wrong:**
The checklist says `Bombus mixtus`. Ecdysis says `Bombus melanopygus mixtus` (subspecies form). Or vice versa. Or:
- Checklist: `Lasioglossum (Dialictus) zonulum`. Ecdysis: `Lasioglossum zonulum` (no subgenus).
- Checklist: `Hylaeus mesillae cressoni`. Ecdysis: `Hylaeus cressoni` (subspecies elevated to species).
- Checklist has authority "Cresson, 1878"; Ecdysis omits authority.
- A species was synonymized: checklist has the new name; Ecdysis has the old; specimens never link to the checklist card.

**Naive `scientificName == scientificName`** join produces:
- Cards for species in the checklist with **zero linked occurrences** (because the join failed, not because no specimens exist)
- Cards never created for Ecdysis species not in the checklist (the inclusion rule may or may not want this)
- Two cards for the same biological entity if both names slip through

Volunteer collectors see "Bombus mixtus has 0 records in WA" while staring at their Bombus mixtus specimen — they conclude the site is broken.

**Why it happens in BeeAtlas's context:**
- BeeAtlas already canonically uses Ecdysis as the taxonomy of record (key decision), so the fix is "reconcile checklist names *to* Ecdysis", not the other way
- Authority strings (`Cresson, 1878`) are present sometimes and not others — the existing `scientificName` field in `occurrences.parquet` does NOT include authority (validated by reading existing pipeline output)
- Subgenus parens — Ecdysis's `scientificName` may or may not have them depending on the determination chain
- v1.5 / v1.6 / v2.7 retrospectives all show that schema drift between sources causes silent wrong-result bugs (not loud failures)

**How to avoid:**
- **Synonym table in `data/checklist_synonyms.csv`:** explicit two-column map `checklist_name → ecdysis_canonical_name`, manually curated by an expert. Empty when ingestion starts; entries added as discrepancies are discovered. Treat as living data.
- **Reconciliation step in `data/checklist_pipeline.py`:**
  1. Strip authority from checklist names: `re.sub(r'\s+[A-Z][a-z]+,?\s*\d{4}.*$', '', name)` — careful, fails for some authorities.
  2. Strip subgenus parens: `re.sub(r'\s+\([^)]+\)\s+', ' ', name)`.
  3. Match the result against the synonym table → canonical Ecdysis form.
  4. Match the result against `SELECT DISTINCT scientificName FROM occurrences`.
  5. **Anything that doesn't match goes into `data/checklist_unmatched.csv`** — exit nonzero on first run, or accept-and-warn on subsequent runs (developer choice). The unmatched file is reviewed by an expert and either added to the synonym table or accepted as "checklist-only species, no specimens yet" (still gets a card, with empty occurrence map).
- **Frontend behavior on zero-occurrence species:** show the card with an empty SVG map and a clear note ("No specimen records yet — be the first collector!"). Distinguishes "no occurrences" from "join broken."
- **Unit test:** seed a fixture with `Lasioglossum zonulum` in checklist and `Lasioglossum (Dialictus) zonulum` in occurrences; assert the join produces one card with N records.

**Warning signs:**
- `data/checklist_unmatched.csv` has rows that an expert recognizes as already-collected species
- Two cards for the same biological entity on the species page
- A card with 0 records when the SPA filter for that name returns 50

**Phase to address:**
**Checklist ingestion + reconciliation phase** — synonym CSV + reconciliation script. Pytest fixture for at least 3 known-divergent name pairs (Bombus mixtus, Lasioglossum subgenus form, Osmia synonym).

---

### Pitfall 5: Vagrant or out-of-state observations produce a card for a species that's not actually in WA

**What goes wrong:**
A specimen lat/lon barely inside WA (or actually in OR/ID/BC, depending on the dataset boundary) creates a single occurrence record. Inclusion rule "any species with at least one WA occurrence" includes vagrants alongside resident species. A volunteer who sees a card for *Centris pallida* (a desert species; should never occur in WA) loses trust in the inclusion list.

Worse: an Ecdysis record might be a museum specimen *labeled* WA but actually mis-georeferenced. Naive lat/lon-in-WA filtering leaks them.

**Why it happens in BeeAtlas's context:**
- BeeAtlas already has `county` and `ecoregion_l3` columns from the v1.5 spatial join — county null implies "off the WA map" (handled by nearest-polygon fallback in v1.5, but the fallback can put truly-out-of-state records on a WA county)
- The checklist source is the authoritative "in WA" answer; specimen-only inclusion would produce vagrant cards
- iNat photo IDs from outside WA may also be in the manifest (a Bombus rufocinctus photo from Idaho is fine for the photo, but doesn't make the species a WA resident)

**How to avoid:**
- **Inclusion rule = (in checklist) OR (≥ N specimens in Ecdysis WA)** — set N = 3 (or whatever an expert recommends; document rationale). Single specimens are insufficient evidence on their own.
- **Decouple "photo source" from "occurrence source":** the photo manifest may pull from anywhere with appropriate license; the inclusion rule is purely about WA presence.
- **Surface vagrant indication in the card:** if a species is checklist-absent but specimen-present, render with a "rare in WA — N records" badge instead of hiding it. (Better UX than silent omission.)
- **Spot-check pipeline output:** at first ingestion, list the species set; an expert reviewer flags anything that doesn't belong.

**Warning signs:**
- The species page lists more species than the WA checklist contains
- An expert reviewer sees a desert / coastal / boreal species in the WA list with no plausible explanation
- A "0 occurrences" card for a checklist species feels suspicious (could be a join bug, or could be a checklist-only species — easy to confuse)

**Phase to address:**
**Inclusion rule phase** — explicitly choose the rule, document threshold, code it in `data/checklist_pipeline.py`, surface vagrancy in the card UI.

---

### Pitfall 6: Tribe gap-fill from iNat goes stale; cached tribe assignments lag taxonomy moves

**What goes wrong:**
Ecdysis DarwinCore lacks tribe (constraint locked in seed). Filling tribe from iNat at species-add time produces a snapshot. Six months later, iNat curators (driven by GBIF/POW/community consensus) move *Eucera* from tribe Eucerini sensu lato to a finer subdivision. The species page nav shows the old tribe; an expert volunteer notices the discrepancy and loses confidence.

Worse: the tribe is included in the URL (e.g., `/species/eucerini/`) and has been bookmarked. A taxonomy change breaks bookmarks.

**Why it happens in BeeAtlas's context:**
- iNat taxonomy is **community-curated** — it evolves continuously, sometimes in batches when curators import GBIF or POW updates
- BeeAtlas's existing iNat fetch caches observation-level data, but not taxon-level metadata
- "Tribe" sits at a level not present in any other BeeAtlas data source; iNat is the only feasible source

**How to avoid:**
- **Cache tribe in DuckDB, refresh nightly:** add a `data/inat_taxa_pipeline.py` (similar shape to `waba_pipeline.py`) that fetches `GET /v1/taxa/{id}` for each genus in the species list and walks the `ancestors` array to extract tribe. Cache in `inaturalist_taxa_data.taxa` schema. Refresh nightly via `data/run.py`; ride the existing maderas cron.
- **Tribe is not in URLs:** species-page nav uses tribe as a *display* category; URLs / slugs are species-level only. A tribe rename moves the species visually but doesn't break links.
- **Sentinel "unknown tribe":** when the iNat fetch returns no tribe ancestor (rare, but possible for genera that lack curation), render the species under "Unassigned" rather than crash. Test fixture for this case.
- **Diff alerting:** if the tribe of a previously-known genus changes in a nightly refresh, log a one-line warning. Doesn't fail the build but visible in the cron output.

**Warning signs:**
- An expert says "*Eucera* is no longer in Eucerini"
- iNat genus page shows a different tribe than the BeeAtlas nav
- Empty "Unassigned" tribe section grows over time (suggests new genera added to checklist with no iNat curation)

**Phase to address:**
**Tribe ingestion phase** — `data/inat_taxa_pipeline.py` + integration into `data/run.py` + sentinel + nav rendering rule.

---

### Pitfall 7: Species page bundle accidentally pulls in mapbox-gl (~1,700 KB)

**What goes wrong:**
A developer adds an `import` to a shared utility (e.g., `formatLatLon` in a shared `geo.ts` that also imports `mapbox-gl`). Or imports `bee-atlas` for "just the slug helper." Vite's MPA build pulls the full transitive closure into the species page bundle, inflating it to 2 MB and torpedoing time-to-interactive.

The species page is image-heavy and DOM-heavy already; an extra 1,700 KB of unused JS is unacceptable.

**Why it happens in BeeAtlas's context:**
- mapbox-gl is the largest dep (1,700 KB of the SPA's 2,018 KB main chunk) — confirmed in v3.0 retrospective
- The Eleventy + Vite multi-entry pattern is *new* (v3.1, only orphan `/_scaffold-check/` exercises it). Patterns aren't yet enforced.
- `src/entries/bee-header.ts` exists and is used by the `default.njk` layout — already a side-effect entry pattern. Easy to add the species entry alongside it but easy to accidentally co-import map code.
- The seed says "Static SVG occurrence maps generated in Python" — explicitly NOT mapbox-gl on the species page. But nothing enforces that.

**How to avoid:**
- **Architectural invariant test (`tests/architecture.test.ts` extension):** use the v1.9 `readFileSync` source-analysis pattern. Add a test that asserts `src/entries/species.ts` (and its transitive imports, walked via simple regex on `import ... from`) does NOT include `mapbox-gl`, `bee-map`, or any module that does. The pattern is established and runs in <1ms.
- **Bundle size budget in CI:** after `npm run build`, the species page chunk in `_site/assets/` must be `<` budget (suggest 100 KB gzipped initial; tighten as we measure). Fail CI on regression. Use a small Node script — Vite plugin `rollup-plugin-visualizer` can emit JSON.
- **Separate the slug utility into a leaf module:** anything shared between `bee-atlas` (SPA) and `species` page lives in a leaf file (e.g., `src/lib/taxon-slug.ts`) with no transitive imports of OL/Mapbox/SQLite. Document in the species page entry comment.
- **Code review checkbox:** "does the species entry's import graph include any of: mapbox-gl, wa-sqlite, hyparquet, ol, ol-mapbox-style?"

**Warning signs:**
- `_site/assets/species-*.js` size > 200 KB
- `npm run build` output shows "warning: chunk size > 500 KB" for the species page
- Lighthouse warns about main-thread JS on the species page
- HMR slows down on `_pages/species.njk` edits (suggests Vite is processing more code than expected)

**Phase to address:**
**Page scaffolding phase + architectural-invariant test phase** — invariant test must ship in the same commit that introduces the species entry.

---

### Pitfall 10: Largest-subgenus card list (Osmia ~80 species) ships 50+ MB of photo bytes per page

**What goes wrong:**
Selecting the Osmia subgenus reveals 80 species cards. Each card has 1–3 photos. Naive rendering:
```
80 species × 3 photos × 200 KB JPEG = 48 MB
```
On a fast desktop connection this is annoying; on volunteer field tablets / phones over LTE this is unacceptable. Page weight regressions like this are how mobile-friendly intentions die quietly.

The issue compounds: 80 × DOM `<article>` elements with all their metadata, plus 80 × static SVG maps inlined or fetched, plus seasonality viz... cumulative layout shift becomes catastrophic.

**Why it happens in BeeAtlas's context:**
- Osmia, Andrena, Lasioglossum (the project's biggest genera) all have 50+ WA species
- iNat photos are typically 1024px JPEGs (≈ 200 KB) when fetched at "medium" size
- The seed explicitly calls this out: "Osmia has 80–90 species; need to verify largest subgenus and decide pagination/lazy-load"
- BeeAtlas's existing pages (the SPA at `/`) are interactive but static-content-light; the species page inverts that ratio and the project hasn't yet had to engineer for image-heavy pages

**How to avoid:**
- **`loading="lazy"` on every `<img>`:** native browser lazy-load; supported everywhere we care about. Single-line addition; massive impact.
- **`<img srcset>` with multiple sizes:** iNat's CDN exposes `square` (75px), `small` (240px), `medium` (500px), `large` (1024px). Use `square` as the smallest source and `medium` for full card display:
  ```html
  <img
    src="https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/medium.jpg"
    srcset="…/square.jpg 75w, …/small.jpg 240w, …/medium.jpg 500w"
    sizes="(max-width: 600px) 240px, 500px"
    loading="lazy"
    width="500" height="500"
    alt="{species_name}, photo by {photographer}, {license}">
  ```
  `width`/`height` reserve layout space → zero CLS.
- **Photo budget per card:** 1 hero photo by default, 2 additional revealed on click ("Show more photos"). Reduces initial weight by 3×.
- **Cap initial render to N cards (~20):** if the subgenus has more, render an "Load more" button or implement IntersectionObserver-based pagination. The pattern is small (no need for a virtualization library; this is a static page).
- **Performance budget in CI:** Lighthouse CI on `/species/osmia/` (or whichever subgenus is biggest) — fail if LCP > 3s on simulated 4G.

**Warning signs:**
- Lighthouse mobile score drops below 70 on the species page
- Real-user reports of slow loading or browser hangs on Osmia
- Network panel shows 30+ MB transferred on initial load

**Phase to address:**
**Card rendering phase** — lazy-load + srcset + photo budget. **Performance budget phase** — Lighthouse CI gate (or a simpler size budget script).

---

### Pitfall 17: Pre-filtered SPA link uses wrong query param; silently loads unfiltered map

**What goes wrong:**
The species card links to the SPA with `/collection?taxon=Bombus+mixtus`. But the SPA URL contract (per `src/url-state.ts` line 34–38) is:
```ts
if (filter.taxonName !== null) {
  params.set('taxon', filter.taxonName);
  params.set('taxonRank', filter.taxonRank!);   // <-- both required
}
```
And `parseParams` (line 88) explicitly checks: `const resolvedTaxonName = (taxonName && taxonRank) ? taxonName : null;` — **missing `taxonRank` silently drops the taxon filter**. The user clicks "View on map" expecting Bombus mixtus highlighted; gets the full 250K-record map instead. No error, no warning.

Same trap for other params: SPA uses `/` (root path), not `/collection` — wrong path also produces "no error, just bad UX."

**Why it happens in BeeAtlas's context:**
- The species card link is defined in a *different file* from the SPA URL contract; drift is easy
- The SPA URL contract has 9 params (x, y, z, taxon, taxonRank, yr0, yr1, months, o, bm, view, counties, ecor, collectors, elev_min, elev_max) — easy to miss `taxonRank`
- v1.1 retrospective: "URL param stripping on initial load is an easy-to-miss bug" — same family of issue
- The SPA itself is at `/` (per `_pages/index.html`), not `/collection` — the seed says `/collection?taxon=...` which is incorrect for the current codebase

**How to avoid:**
- **Single source of truth for the link builder:** export a function `buildSpaTaxonLink(name, rank)` from a shared leaf module that calls into `buildParams` (or a thin wrapper). The species card imports this; if the SPA URL contract changes, the species card updates automatically.
- **Verify the SPA path in the species card pipeline (not in seed):** the SPA mounts at `/` per `_pages/index.html` ; the link is `/?taxon=...&taxonRank=species`, NOT `/collection?...`. Cross-check before writing the card template.
- **Round-trip test:** Vitest test that builds a species link, parses with `parseParams`, asserts the filter survives.
- **Error rendering on the SPA:** if the SPA receives `taxon` without `taxonRank`, log a console warning. Surfaces silent breakage during developer testing. (Optional; the round-trip test should catch it.)

**Warning signs:**
- Click a "view on map" link, get the full unfiltered map
- The SPA URL has `taxon=...` but the filter chip is empty
- A new SPA URL param is added without updating the species link builder

**Phase to address:**
**URL contract phase** — shared `buildSpaTaxonLink` utility, round-trip test, SPA path verification (`/` not `/collection`).

---

### Pitfall 18: Slug for species name diverges between species page and SPA pre-filtered link

**What goes wrong:**
The species page URL is `/species/bombus-mixtus/`. The SPA link is built from `Bombus mixtus`. Two slugifiers exist:
- `data/feeds.py::_slugify` (lowercases, strips non-alphanumeric, collapses hyphens; designed for path-traversal safety)
- A new slugifier in `_data/species.js` for URL paths

These drift: feeds.py uses `unicodedata.normalize('NFKD').encode('ascii', 'ignore').decode('ascii')` (transliterates ö → o), while the new one might not. So `Andrena haemorrhoa` → `andrena-haemorrhoa` in feeds.py and `andrena-h%C3%A6morrhoa` in the new one. Card link: `/species/andrena-haemorrhoa/`. SPA filter: searches for `Andrena hæmorrhoa` (which doesn't match `Andrena haemorrhoa` in occurrences). Card shows "0 records"; map shows nothing.

**Why it happens in BeeAtlas's context:**
- `data/feeds.py::_slugify` already exists with battle-tested behavior (collision tracking, path-traversal safety) per v2.1 retrospective
- A naive `name.toLowerCase().replace(' ', '-')` in JS produces different results from the Python version
- Multiple slugifiers in a codebase always drift

**How to avoid:**
- **Slugify in Python at build time:** generate the slug in `_data/species.js` by reading a precomputed `species_index.json` produced by `data/run.py`. The Python slugifier is the only one. JS just reads the value.
- **Or: port `_slugify` exactly to TypeScript** in a leaf utility (`src/lib/slugify.ts`) and unit-test against the Python output for a battery of edge cases (accented characters, parentheses, apostrophes, hyphens-already-present).
- **Round-trip test:** for every species in the checklist, assert `slugify(name)` is unique (no collisions) — feeds.py already does this with `seen_slugs` collision tracking.
- **Encoded/raw consistency:** the SPA filter string passes through `URLSearchParams`, which URL-encodes for transport but matches against raw `scientificName` in DuckDB. Don't slugify *inputs to the SPA filter*; slugify only file paths.

**Warning signs:**
- A species card link 404s
- A species card opens the SPA but the filter chip shows a weird-looking name
- Two species with similar names produce the same slug (collision)

**Phase to address:**
**URL contract / slugify utility phase** — ship the Python-or-TS slugifier with explicit edge-case tests.

---

### Pitfall 19: scientificName authority suffix leaks into slugs and SPA filter

**What goes wrong:**
Some Ecdysis records have authority in `scientificName`: `Bombus mixtus Cresson, 1878`. Most don't. Naive use of `scientificName` as the species identity:
- Produces slug `bombus-mixtus-cresson-1878` (different from `bombus-mixtus`) — two cards for the same species
- SPA filter built from authority-bearing string fails to match authority-less occurrences (Ecdysis pipeline has been observed to produce both forms across milestones)
- The SPA's autocomplete datalist (specimen-derived) has both forms; user types "Bombus mixtus" and gets two completions

**Why it happens in BeeAtlas's context:**
- Ecdysis's underlying DwC-A is curator-driven; some catalogers include authority and some don't
- `scientificName` is the canonical taxon-name column in BeeAtlas (per `validate-schema.mjs`); BeeAtlas does not currently maintain a separate authority-stripped column
- A v3.2 species page reading `scientificName` directly inherits this drift

**How to avoid:**
- **Strip authority in `data/export.py` once, into a new column `canonical_name`:**
  ```sql
  -- In the export CTE
  regexp_replace(scientificName, '\s+[A-Z][a-zæ\-]+(\s+et\s+[A-Z][a-zæ\-]+)?,?\s*\d{4}.*$', '') AS canonical_name
  ```
  (Inspect actual data first — write a script to print all scientificName values matching `\d{4}` and confirm the regex covers them.)
- **Add `canonical_name` to `validate-schema.mjs` EXPECTED columns** for `occurrences.parquet`. Force the discipline.
- **Species page joins on `canonical_name`, NOT `scientificName`:** the cards are keyed by canonical form; specimen counts aggregate over the authority variants.
- **Display original `scientificName` in the card header** (volunteers learn the formal form), but use `canonical_name` for slugs, SPA links, and joins.
- **Unit test:** seed `Bombus mixtus` and `Bombus mixtus Cresson, 1878` in test data; assert the species page produces one card.

**Warning signs:**
- Two cards for the same species
- Species page card shows "47 records" but SPA filter shows 50 (3 records had authority and didn't join)
- The autocomplete datalist on the SPA shows two entries for the same name

**Phase to address:**
**Name normalization phase** — `canonical_name` column in `data/export.py`; schema gate updated; pytest fixture covering at least one authority-bearing and one authority-less record for the same species.

---

## High-Priority Pitfalls

### Pitfall 8: `_data/species.js` reads parquet at every HMR reload, killing dev loop

**What goes wrong:**
`_data/species.js` reads `public/data/occurrences.parquet` (250K+ rows) and aggregates per species at import time. Eleventy's data pipeline re-runs `_data/*.js` on every Eleventy build (which is every page change in dev mode + every server reload). HMR latency goes from <100 ms to several seconds. Developer loop becomes painful; people start working around the system (committing static JSON, etc.).

**Why it happens in BeeAtlas's context:**
- `_data/build.js` is a fast-running module (just version reads + `git rev-parse`) — sets a precedent that misleads
- 250K-row parquet aggregation in JS via hyparquet takes seconds of cold work
- Eleventy 3.x does cache `_data/*.js` results, but only across requests within a single server lifetime; a config change or `eleventy.config.js` edit invalidates everything

**How to avoid:**
- **Pre-aggregate in Python:** `data/run.py` produces `public/data/species.json` (or `.parquet`) — already-aggregated rows ready to feed the page. `_data/species.js` becomes a single `readFileSync` of a small JSON. <10 ms.
- **Schema for the precomputed file:** array of `{slug, scientificName, canonical_name, family, genus, subgenus, tribe, occurrence_count, first_year, last_year, county_count, ecoregion_count, photos: [...], description: "..."}`. Designed once, updated via pipeline.
- **Schema gate extension:** `validate-schema.mjs` checks `species.json` exists and has expected fields.
- **Pattern reuse:** the v2.1 feeds.py + index.json pattern is precisely this shape — `data/run.py` produces a JSON manifest at build time; the frontend reads it. Direct precedent.

**Warning signs:**
- `npm run dev` startup time > 5 seconds after change
- HMR feels sluggish on `_pages/species.njk` edits
- Eleventy build log shows multi-second `_data/species.js` step

**Phase to address:**
**Build-time data feed phase** — `data/run.py` produces `species.json`; `_data/species.js` reads it; schema gate covers it.

---

### Pitfall 9: `_data/species.js` requires occurrences.parquet to exist at build time; CI breaks

**What goes wrong:**
A clean CI runner has no `public/data/occurrences.parquet` (it's deployed from the maderas pipeline to S3, not committed). If `_data/species.js` reads from local disk, the build fails. If it reads from CloudFront via Range — works for `validate-schema.mjs` but slower at every dev/CI build.

**Why it happens in BeeAtlas's context:**
- `validate-schema.mjs` already established a precedent: read from CloudFront via Range request when local file absent. It works but is network-dependent.
- The species precomputed JSON (Pitfall 8) doesn't help here unless it's *also* in CloudFront.
- CI runs `npm run build` → triggers Eleventy → triggers `_data/species.js`. If that file fetches from network, CI now depends on CloudFront.

**How to avoid:**
- **Commit `public/data/species.json` to git.** It's small (a few KB to maybe 1 MB at full WA list with photo refs), changes only when checklist or photo manifest changes (≪ daily), and the v1.5 pattern of "commit static reference data" is established (counties.geojson, ecoregions.geojson are already committed).
- **OR: produce the JSON in `data/run.py` and fetch from CloudFront in CI** if commit-to-git is rejected. Mirror `validate-schema.mjs`'s logic precisely (local fallback, CloudFront primary).
- **Decision rule:** if the precomputed JSON is < 200 KB and changes < 1×/week, commit. Otherwise, fetch.
- **Document the choice in the phase summary.** Future developers will revisit this decision.

**Warning signs:**
- CI fails on a fresh clone with "ENOENT: occurrences.parquet"
- Local `npm run build` requires having run the data pipeline first
- `npm run dev` works on the maintainer's machine but not on a contributor's

**Phase to address:**
**Build-time data feed phase** — decide commit-vs-fetch with documented rationale.

---

### Pitfall 21: Manifest authoring tool lets bad data in; no schema validation in `data/run.py`

**What goes wrong:**
The species photo manifest is hand-edited TOML. A curator typos `licence` for `license`, or pastes a photo ID that's not an integer, or omits `attribution` for a CC-BY photo. The site builds and ships with broken / non-compliant content because nothing validated the file.

**Why it happens in BeeAtlas's context:**
- TOML is permissive; without explicit validation, anything parseable is "valid"
- Eleventy and Vite don't know about manifest semantics; they just pass data through
- Existing pipelines validate parquet schemas (`validate-schema.mjs`) but not TOML

**How to avoid:**
- **Pydantic / dataclass model in `data/manifest_schema.py`:**
  ```python
  from typing import Literal
  from pydantic import BaseModel, Field, field_validator

  class PhotoEntry(BaseModel):
      id: int
      license: Literal["cc0", "cc-by", "cc-by-nc", "cc-by-sa", "cc-by-nc-sa"]
      attribution: str = ""
      caption: str = ""
      observation_id: int | None = None  # for traceback to iNat

      @field_validator("attribution")
      def attribution_required_for_non_cc0(cls, v, info):
          if info.data.get("license") != "cc0" and not v:
              raise ValueError("attribution required for non-CC0 license")
          return v

  class SpeciesManifest(BaseModel):
      species: dict[str, list[PhotoEntry]]  # key = canonical_name
  ```
- **Validation step in `data/run.py`:** load the TOML, parse through Pydantic, raise on first error. Hard fail; the nightly pipeline aborts before producing an invalid `species.json`.
- **Pre-commit hook (optional):** the same validator runs as a git pre-commit on the TOML file. Catches errors before they reach maderas.
- **Pytest fixtures** with valid + invalid TOML samples; assert validation accepts/rejects appropriately.

**Warning signs:**
- Manifest entries with typos (`licence`, `attrib`, `obs_id`)
- Photo IDs as strings instead of integers
- Missing required fields that no one notices until the species card renders blank

**Phase to address:**
**Manifest schema phase** — Pydantic model + `data/run.py` integration + pytest fixtures.

---

### Pitfall 22: Eleventy + Vite multi-entry: layout chain renders but the Lit component never registers

**What goes wrong:**
The species page declares `layout: default.njk`; the layout includes `<bee-header>`. The species page also uses `<bee-species-card>` (a new Lit component). Developer creates `_pages/species.njk` with `<bee-species-card>` markup and adds the import to ... where? If they forget to add a `src/entries/species.ts` (or to import the species-card module from there), the markup renders as-is — `<bee-species-card>` is just an unknown HTML element. No error, no warning, just a blank card area.

**Why it happens in BeeAtlas's context:**
- v3.1's `<bee-header>` works because `src/entries/bee-header.ts` exists AND is referenced from `_layouts/default.njk` (via `<script type="module" src="/src/entries/bee-header.ts">` or similar — let's verify the exact mechanism in execution).
- Vite's MPA mode auto-discovers entries from `<script type="module" src=...>` in HTML. If the species page doesn't have that script tag, the bundle never includes the component.
- v3.1 retrospective: `_scaffold-check/` was added precisely as a permanent diagnostic for this kind of breakage. The species page introduces a *new* multi-entry; same trap recurs.

**How to avoid:**
- **Mirror the bee-header pattern verbatim:** `src/entries/species.ts` is a side-effect module that imports `<bee-species-card>` (and any other species-page-specific components). `_pages/species.njk` includes `<script type="module" src="/src/entries/species.ts"></script>` (exact path TBD per v3.1 mechanics — verify against `bee-header` reference in `default.njk`).
- **Verification step in the phase:** `npm run build` then `grep "bee-species-card" _site/_pages/species/index.html` and assert a hashed `assets/species-*.js` script tag exists.
- **Smoke test page during execution:** before populating real species data, scaffold one minimal species card and load `npm run dev` — confirm the custom element renders. Catches registration breakage early.

**Warning signs:**
- The species page renders the layout (header visible) but the species cards are visually empty
- DevTools shows `<bee-species-card>` rendered as `HTMLElement` not `BeeSpeciesCard`
- `_site/_pages/species/index.html` doesn't reference `assets/species-*.js`

**Phase to address:**
**Page scaffolding phase** — entry file + script tag + build-time grep verification.

---

### Pitfall 23: `_data/species.js` swallows parquet read error; Eleventy ships empty species page

**What goes wrong:**
`_data/species.js` wraps its parquet read in `try/catch` (defensive) but on error returns `[]`. Eleventy successfully builds the species page with zero species. CI passes (no exception). Site ships blank.

This is the JS-ecosystem version of v1.2's "raw dict vs model object" silent-fail family.

**Why it happens in BeeAtlas's context:**
- Eleventy's data cascade is silent on errors in `_data/*.js` modules — a thrown error fails the build, but a returned `[]` doesn't
- `try/catch` is reflexive defensive coding for many JS developers
- CI's only check is "does the build succeed," not "does the species page have content"

**How to avoid:**
- **Don't swallow errors in `_data/*.js`:** let exceptions propagate. A failed data load should fail the build — that's the right semantics.
- **Build-time assertion:** `_data/species.js` ends with `if (data.length === 0) throw new Error("species data empty");`. Defends against soft-empty failure modes (e.g., file present but malformed JSON).
- **Smoke test in CI:** after build, grep `_site/_pages/species/index.html` for at least N species names. Trivial; high signal.

**Warning signs:**
- Species page deploys but is empty
- Build logs show no error but the rendered page has no cards
- A species name that should always be present (e.g., *Apis mellifera*, ubiquitous) is missing

**Phase to address:**
**Build-time data feed phase** — explicit error propagation + post-build smoke check.

---

### Pitfall 27: Hot-linking iNat photos at scale violates iNat TOS / triggers rate-limiting

**What goes wrong:**
The naive approach is `<img src="https://static.inaturalist.org/photos/{id}/medium.jpg">`. This works for a few cards but at scale (a 90-card Osmia page × volunteer traffic × repeat visits) hits iNat's CDN. Two problems:
1. iNat's [Terms of Service](https://www.inaturalist.org/pages/terms) and developer guidelines discourage heavy hot-linking; large-scale embedded use should cache locally.
2. CDN rate limits or 403s on excess traffic produce broken images at the worst possible time.

**Why it happens in BeeAtlas's context:**
- The seed says photo manifest holds iNat photo IDs — implies hot-link
- BeeAtlas already pulls from iNat via the API (rate-limited at < 60 req/min for the WABA pipeline); image traffic is separate but same vendor
- Static site has no server-side image proxy

**How to avoid:**
- **Cache photos to BeeAtlas S3 at species-add time** (or in nightly anti-entropy). The pipeline downloads each photo, stores at `s3://bucket/species-photos/{license}/{id}/{size}.jpg`, and the site references those URLs. iNat's TOS allows local caching for reuse with attribution.
- **Pipeline step:** `data/photos_pipeline.py` reads the manifest, fetches new photo IDs (skip cached), uploads to S3 with the correct prefix + content-type. Mirrors the v1.2 cache pattern.
- **CloudFront serves `/photos/...`** with long cache TTL (photos are immutable per ID).
- **Attribution unaffected** — the manifest still carries license + photographer; the URL just points to BeeAtlas's CDN.
- **License compliance:** CC-BY-NC explicitly allows non-commercial caching with attribution; CC0 is unrestricted; CC-BY needs attribution (which we have). Document allowed licenses (Pitfall 2).

**Warning signs:**
- iNat support emails complaining about traffic patterns
- 403/429 errors in CloudFront access logs from `static.inaturalist.org`
- Photos sporadically fail to load on the live site

**Phase to address:**
**Photo URL strategy phase** — `data/photos_pipeline.py` + S3 cache + CDN URL contract + Pitfall-2 license validation.

---

### Pitfall 30: Page weight regression: per-card photos + DOM + JS exceeds budget without measurement

**What goes wrong:**
The species page lands under budget. Three weeks later, a developer adds a 200 KB chart library to the seasonality viz. Two weeks after that, photos get bumped from medium to large size. Six weeks after that, no one remembers what the budget was, and the page is 8 MB. Volunteer in the field opens it, gives up, never returns.

**Why it happens in BeeAtlas's context:**
- BeeAtlas already has the mapbox-gl 1,700 KB precedent (key decision marked "⚠️ Revisit if main-thread budget becomes a concern") — past the team's sensitivity threshold once before
- v3.1 introduced the multi-entry pattern with bee-header at 8 KB gzipped — currently well under budget, but the budget is implicit
- Without an explicit number in CI, regression is silent

**How to avoid:**
- **Set an explicit budget at milestone planning:** "species page initial transfer ≤ 500 KB gzipped (excluding lazy-loaded images)." Document in `PROJECT.md` Decisions table.
- **CI gate:** a small Node script reads `_site/_pages/species/index.html`, sums sizes of each `<script>` and inline CSS, fails if budget exceeded. Or use Lighthouse CI thresholds.
- **Track per-milestone:** add a row to a `BUDGETS.md` file (or `BENCHMARK.md`, established in v2.6) showing the species page initial transfer over time. Visible regressions get caught.
- **Lazy-load anything not visible on initial paint** — images, off-screen cards, secondary photos.

**Warning signs:**
- Lighthouse mobile score regression (especially LCP / TBT)
- Bundle visualizer shows new dep on the species chunk
- A user says "the species page got slow"

**Phase to address:**
**Performance budget phase** — explicit budget number + CI script + initial measurement recorded.

---

## Medium-Priority Pitfalls

### Pitfall 11: SVG occurrence map for 1-record species visually identical to 1000-record species

**What goes wrong:**
A single 4-pixel dot for *Centris pallida* (1 vagrant record) looks the same as a single 4-pixel dot for *Bombus vosnesenskii* (1000 records, all overlapping). The volunteer can't tell rare from common at a glance — defeats the visualization's purpose.

**Why it happens in BeeAtlas's context:**
- "Static SVG occurrence maps generated in Python from existing GeoJSON + occurrences" (seed) — implies dot-per-record but doesn't enforce density encoding
- BeeAtlas's main map (mapbox-gl) uses cluster-by-count; a static SVG can't easily reuse that
- The educational mission depends on conveying "common vs rare"

**How to avoid:**
- **Aggregate by hex bin or county before rendering:** count records per H3 hex (or per county); style dot/fill by count (1 / 2–9 / 10–99 / 100+ tiers). 4 tiers is enough for perceptual clarity.
- **Or: alpha-stack dots:** render each record as a `fill-opacity="0.2"` dot. Stacked dots at the same location compound to opaque; isolated dots are translucent. Cheaper, no aggregation.
- **Decide once, document:** the SVG generator's design spec belongs in the phase plan.

**Phase to address:**
**SVG generator phase**.

---

### Pitfall 12: SVG maps regenerated nightly even when species occurrences unchanged

**What goes wrong:**
800+ species × 1 SVG each × regenerated every nightly run = wasted compute on maderas, wasted CloudFront invalidation budget (CloudFront charges per invalidation path; a wildcard invalidates everything but obscures change tracking). For a species whose record set hasn't changed in 3 weeks, the SVG byte content is identical — but the nightly run rewrites it anyway.

**Why it happens in BeeAtlas's context:**
- `nightly.sh` is dumb: it re-runs the full pipeline → re-exports → re-syncs to S3
- `aws s3 sync` already detects no-op file changes (etag comparison) — actually mitigates the upload cost
- But the *generation* time is still spent
- Nightly runs in 2.5 min today; bloating to 10+ min would push into Lambda-timeout territory if the team ever revisits Lambda

**How to avoid:**
- **Per-species occurrence-set hash stored alongside the SVG:** `data/run.py` computes `hash = sha1(sorted(records.json))` per species; if the existing `species-{slug}.svg` has the same hash in a sidecar (`.hash` file or in the SVG metadata), skip regeneration.
- **Or: compute all hashes; only regenerate the diff set.** Cleaner separation; still requires a tracking file.
- **`aws s3 sync` will skip identical files anyway** — the cost saved is generation time, not upload bandwidth.
- **Acceptable shortcut for v3.2 if scale is small:** if 800 species × 50 ms each = 40 s, just regenerate everything. Document the scale assumption and revisit if it gets painful.

**Phase to address:**
**SVG generator phase** — generation incremental or full, with documented scale assumption.

---

### Pitfall 13: SVG map ships points outside the WA viewBox (no clip)

**What goes wrong:**
A specimen lat/lon barely outside WA (mis-georeferenced, or actually in OR/ID/BC) is plotted; if the SVG `viewBox` is set to WA's bounding box, the point renders outside the visible area but still inflates the SVG file. Worse, if the viewBox is set to "data extent," WA's outline shrinks and the page layout shifts.

**Why it happens in BeeAtlas's context:**
- v1.5 already taught this lesson with the spatial join: nearest-polygon fallback assigns out-of-WA records to a WA county anyway, but their lat/lon is still off-map
- A naive SVG generator that loops over `(lon, lat)` → `(svg_x, svg_y)` ignores the viewBox boundary

**How to avoid:**
- **Filter records to within WA polygon before plotting:** use the existing `counties.geojson` to test; or check `county IS NOT NULL` (post-spatial-join) — the latter is cheaper but includes the nearest-polygon fallbacks.
- **Set `viewBox` to WA's bounding box explicitly** — don't compute from data extent; compute once from `counties.geojson` and hard-code (commented).
- **Add `overflow="hidden"` on the SVG root** as a belt-and-suspenders.

**Phase to address:**
**SVG generator phase**.

---

### Pitfall 14: One SVG per species × 800+ species bloats `public/data/` and CloudFront invalidation

**What goes wrong:**
800 SVGs at ~5 KB each = 4 MB on disk and 800 cache invalidation paths on CloudFront. If the nightly run rewrites all 800, an `aws s3 sync` followed by a wildcard CloudFront invalidation churns paths unnecessarily. `git status` (if SVGs ever committed) becomes noisy.

**Why it happens in BeeAtlas's context:**
- BeeAtlas's `public/data/` currently holds counties.geojson, ecoregions.geojson, occurrences.parquet, samples.parquet, and feeds — single-digit count of files. 800+ would change the directory's character.
- CloudFront wildcard invalidation costs per-path; 800 paths is non-trivial.
- v2.1 retrospective: feeds.py also produces many files (one per collector / genus / county) — same shape; precedent exists.

**How to avoid:**
- **Embed SVGs inline in `species.json`** (or in the page HTML at build time): the SVG byte size is small (≤5 KB); inlining avoids the per-file overhead.
  - Tradeoff: bloats `species.json` to a few MB. Acceptable if the page does code-splitting and only loads the active subgenus's data.
- **Or: emit SVGs to `public/data/species-maps/` and accept the file count.** Mirror the feeds.py pattern.
- **CloudFront invalidation:** keep using wildcard `/data/*` (already in use) — no per-file cost.
- **Don't commit SVGs to git** — they're build artifacts, regenerated nightly, in `.gitignore`d `public/data/`.

**Phase to address:**
**SVG generator phase + asset strategy decision**.

---

### Pitfall 15: Filter on species page hides cards with no "0 species" empty state

**What goes wrong:**
Volunteer applies filter "Counties: King" + "Months: 7" on the Osmia page. No Osmia species match. Cards all disappear; page shows blank space. Volunteer thinks the site is broken.

**Why it happens in BeeAtlas's context:**
- The SPA already has filter chips and clear UI; species page filter UX is being designed fresh
- Empty states are the most-skipped UX consideration in MVP

**How to avoid:**
- **Always render an empty state** when the filtered set is empty: "No Osmia species match these filters. [Clear filters]".
- **Show filter active state visibly** (chips) so the user knows filters are on.

**Phase to address:**
**Species filter UX phase**.

---

### Pitfall 16: Species-page filter URL schema collides or diverges from SPA `/?...`

**What goes wrong:**
The species page uses `?counties=King&months=7` to encode its filter. The SPA also uses `counties=` and `months=`. A volunteer copies a URL from the species page and pastes into the SPA — the SPA parses correctly, *but the species page URL also has `subgenus=Osmia` which the SPA ignores*. Or the species page evolves to use `region=King` (different param) and now the schemas diverge for no reason.

**Why it happens in BeeAtlas's context:**
- `src/url-state.ts` is the SPA URL contract; it's well-tested but specific to the SPA
- The species page is a different page with different state — keeping schemas identical is over-engineering, but keeping them *consistent* is good UX

**How to avoid:**
- **Use the same param names where the semantic is the same:** `months`, `counties`, `ecor` — copy verbatim. Different semantic? Different param name.
- **Don't try to round-trip species page state through the SPA URL:** a "share this view" button on the species page builds a species-page URL, not an SPA URL.
- **Document the species page URL schema in a comment in `_pages/species.njk` (or in a leaf TS module):** future maintainers see the contract.

**Phase to address:**
**URL contract phase**.

---

### Pitfall 20: TOML round-trip with `tomlkit` reformats the file on every save; spurious diffs

**What goes wrong:**
The manifest authoring tool reads the TOML with `tomlkit` (preserves comments + formatting) or with `toml`/`tomllib` (round-trips lose formatting). On save, the file's quote style, indentation, or key order changes — every edit produces a 200-line diff for a 1-line change. PR review becomes painful; bad changes hide in the noise.

**Why it happens in BeeAtlas's context:**
- The seed implies a future "authoring tool" for the manifest (whether CLI or web). Default Python `tomllib` (read-only) avoids this entirely; `toml` and `tomlkit` have different round-trip behaviors.
- BeeAtlas has no precedent for editable TOML in the codebase — the team doesn't yet have a tooling answer.

**How to avoid:**
- **Manual edits + Pydantic validation as the primary workflow.** No round-trip tool.
- **If tooling needed:** use `tomlkit` (preserves formatting) and benchmark the diff size on a real edit before committing to it. If diffs are noisy, fall back to writing TOML serialization explicitly with consistent formatting.
- **`.editorconfig` for the TOML file** to lock indent/quote style across editors.
- **Pre-commit hook to run the validator** but NOT to reformat.

**Phase to address:**
**Authoring workflow phase** (likely a small task within manifest schema phase).

---

### Pitfall 24: Vite shared-chunk dedup misses because of import shape (default vs named) drift

**What goes wrong:**
`bee-header` is imported as `import './bee-header.ts'` (side-effect) in one entry. The species page imports `import { BeeHeader } from './bee-header.ts'` somewhere by accident. Vite/Rollup may treat these as different modules for shared-chunk extraction, duplicating bee-header into both `bee-header-*.js` and `species-*.js` chunks. Unnecessary bytes.

**Why it happens in BeeAtlas's context:**
- v3.1 retrospective explicitly noted that bee-header bundle came in at 8 KB gzipped *thanks to Rollup shared-chunk dedup*. The dedup is the reason the budget was met.
- Rollup's shared-chunk extraction is sensitive to module identity but the rules are not always intuitive.

**How to avoid:**
- **Side-effect entry pattern only:** `src/entries/*.ts` are import-for-side-effect modules. Real components live in `src/components/` and are imported by exactly one entry (or by the layout).
- **Bundle visualizer in CI:** `rollup-plugin-visualizer` produces a stats.json; spot-check that bee-header appears in exactly one chunk.
- **Production build verification step:** after `npm run build`, grep for `bee-header` references across chunks. If duplicated, fail.

**Phase to address:**
**Multi-entry build phase**.

---

### Pitfall 25: Production build differs from dev (HMR works; `npm run build` breaks)

**What goes wrong:**
`npm run dev` works perfectly — species page renders, components register, photos load. `npm run build` produces a `_site/` where `<bee-species-card>` is unregistered, or a script tag points to a 404, or the photo URLs are wrong (relative path resolves differently in build vs dev).

**Why it happens in BeeAtlas's context:**
- v3.1 deferred "feedback_hoist_plan_coverage": "Hoist plans must grep entire repo for moved path segment + route Vite wrapper dev config through wrapper options (not vite.config.ts)" — the dev pass and build pass read different config sources. Same trap recurs for any new feature.
- Eleventy + Vite plugin runs Vite rooted at `.11ty-vite/` for dev but at the repo root for build (per `eleventy.config.js` comments). Subtle path differences.
- HMR's relaxed module resolution masks errors that only surface when Rollup tree-shakes.

**How to avoid:**
- **Run `npm run build` early and often** during species-page development. Don't rely on `npm run dev` exclusively.
- **CI runs the full build** (already does) — ensures the production path is exercised on every PR.
- **Diagnostic page (`_scaffold-check/` precedent):** the species page is tested on every deploy via the existing `_scaffold-check` mechanism (a permanent fixture that catches multi-entry breakage). Extend `_scaffold-check` to also verify the species page entry.
- **Write a smoke test:** Vitest test that starts a small Node server against `_site/`, fetches `/species/<slug>/`, asserts the response contains `<bee-species-card>` with hashed JS reference.

**Phase to address:**
**Multi-entry build phase + page scaffolding phase** — build verification in CI; smoke test in Vitest.

---

### Pitfall 26: iNat photo URL pattern changes between size variants; hard-coded URLs break

**What goes wrong:**
The site hard-codes `https://inaturalist-open-data.s3.amazonaws.com/photos/{id}/medium.jpg`. iNat changes their CDN host or URL structure; all images break overnight. Or the photographer's photo is on `static.inaturalist.org` (older photos) instead of the open-data S3 bucket — same id, different URL, hard-coded version 404s.

**Why it happens in BeeAtlas's context:**
- iNat has at least two photo CDNs (the older `static.inaturalist.org` and the newer `inaturalist-open-data.s3.amazonaws.com`). Photos move between them based on license and age.
- A naive "all photos are on the open-data bucket" assumption is wrong for older CC-BY-NC photos.

**How to avoid:**
- **Resolve photo URL at manifest-fill time, not at render time:** the photo metadata fetched from `GET /v1/photos/{id}` includes the actual URL. Store it in the manifest.
- **Schema: `url_template` field per photo** with `{size}` placeholder. Render code replaces with actual size.
- **OR: cache to BeeAtlas S3 (Pitfall 27)** and bypass the issue entirely — BeeAtlas owns the URL.

**Phase to address:**
**Photo URL strategy phase**.

---

## Low-Priority Pitfalls

### Pitfall 28: Coordinate jitter for stacked specimens at same lat/lon distorts perceived density

**What goes wrong:**
A locality (e.g., "Olympia, WA — central park") has 20 specimens collected on different dates by different collectors, all at lat/lon 47.0379, -122.9007. Naive plotting paints all 20 dots on top of each other; the SVG appears to have 1 dot when it has 20.

Adding small random jitter (±0.001°) reveals the count but creates a misleading "spread" in the visualization. Both extremes are wrong.

**How to avoid:**
- **Aggregation tier (Pitfall 11)** addresses this naturally: count records per hex/county, style by tier.
- **If using alpha-stacking:** stacked dots compound to opaque — same outcome as Pitfall 11 mitigation.
- **Don't add random jitter to coordinates** — it's misleading and fundamentally wrong.

**Phase to address:** **SVG generator phase** (combine with Pitfall 11).

---

### Pitfall 29: Color choice for SVG dots fails colorblind / print rendering

**What goes wrong:**
The site uses red dots on green WA polygons. Deuteranopic users (8% of men) see them as low-contrast brown-on-brown. Or red prints as gray on a B&W printer used by an extension agent making a field handout.

**How to avoid:**
- **Use a colorblind-safe palette:** ColorBrewer's "YlOrRd" or "Blues" sequential schemes for density tiers (Pitfall 11). Avoid red/green pairs.
- **Test with a colorblind simulator** during development.
- **Print-test:** render to grayscale (CSS `filter: grayscale(100%)`) and verify dots remain visible.

**Phase to address:** **SVG generator phase**.

---

## Technical Debt Patterns

| Shortcut                                                               | Immediate Benefit                  | Long-term Cost                                                                | When Acceptable           |
| ---------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| Hot-link iNat photos rather than caching to BeeAtlas S3                | No new pipeline step               | TOS risk, rate limits, CDN-migration breakage                                 | Never (>10 photos)        |
| Skip license validation in TOML; trust manual review                   | No schema code to write            | Non-compliant CC-BY pages; TOS violations                                     | Never                     |
| Naive `scientificName` join for checklist matching                     | No reconciliation table            | Silent zero-card species; duplicate cards                                     | Never                     |
| One SVG per species committed to git                                   | Simple deploy                      | Repo bloat, noisy diffs, drift from data                                      | Never                     |
| Render all 80+ Osmia cards on initial paint, no lazy-load              | Simpler initial code               | 50+ MB page, mobile abandonment                                               | Never (>20 cards)         |
| `_data/species.js` reads occurrences.parquet directly                  | No new pipeline output             | Slow HMR; build depends on parquet existing                                   | Never (>100 species)      |
| Skip authority normalization (use `scientificName` raw)                | No `canonical_name` column         | Drift between cards; broken SPA links for some species                        | Never                     |
| Slugify in JS without testing against feeds.py output                  | Faster initial implementation      | Drift between species page URLs and other slugified URLs                      | Never                     |
| Per-species SVG generation runs full nightly without incremental skip  | Simpler generator                  | Wasted compute; breaks if nightly runtime budget tightens                     | If species count < 200    |
| Hard-code SPA path as `/collection?...` from seed without verifying    | Faster initial draft               | Broken links shipping to prod                                                 | Never                     |
| Skip license badge in card UI                                          | Less visual clutter                | Attribution unreadable; reviewer can't spot non-compliant photos              | Never                     |

---

## Integration Gotchas

| Integration                  | Common Mistake                                                                              | Correct Approach                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| iNat API (photos)            | Match license by name; assume URL structure is stable                                       | Match by `license` code from API; resolve URL from API response, store in manifest                        |
| iNat API (taxa for tribe)    | Fetch on every build                                                                        | Cache in DuckDB `inaturalist_taxa_data` schema; refresh nightly; ride existing maderas cron               |
| Eleventy `_data/*.js`        | Swallow errors, return `[]`                                                                 | Let exceptions propagate; assert non-empty result                                                         |
| Eleventy + Vite multi-entry  | Add `<bee-foo>` markup without a corresponding `src/entries/foo.ts`                         | Mirror the bee-header pattern: side-effect entry + `<script type="module" src="...">` in the page         |
| Vite production build        | Trust `npm run dev` HMR as confirmation                                                     | Run `npm run build` early; use `_scaffold-check`-style fixture pages for deploy-time verification         |
| TOML manifest                | Edit raw TOML without validation                                                            | Pydantic schema in `data/manifest_schema.py`; validation in `data/run.py`; pytest fixtures                |
| Photo CDN at scale           | Hot-link to iNat                                                                            | Cache to BeeAtlas S3 with proper attribution                                                              |
| WA state checklist           | Assume names match Ecdysis exactly                                                          | Synonym CSV; reconciliation script; flag unmatched names; expert review                                   |
| SPA pre-filtered link        | Hand-construct URL; assume seed is correct                                                  | Shared `buildSpaTaxonLink()` function; round-trip Vitest test                                             |
| Slug generation              | Reimplement in JS                                                                           | Generate in Python (build time); JS reads precomputed slug                                                |
| `aws s3 sync`                | Assume changed-file detection saves all costs                                               | Saves upload, NOT generation; track regenerate cost separately                                            |

---

## Performance Traps

| Trap                                                          | Symptoms                                          | Prevention                                                       | When It Breaks                          |
| ------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| All photos load eagerly                                       | LCP > 4s on mobile; 50+ MB transfer               | `loading="lazy"` on every `<img>`; srcset with sizes hint        | Subgenus with > 20 species              |
| `_data/species.js` reads parquet on every build               | HMR slow; `npm run dev` startup > 5s              | Pre-aggregate in `data/run.py`; emit `species.json`              | > 50K rows                              |
| mapbox-gl pulled into species chunk                           | Species chunk > 1 MB                              | Architectural-invariant test; bundle size CI gate                | Any cross-import                        |
| Nightly regenerates all 800 SVGs even when unchanged          | Nightly runtime > 5 min                           | Per-species occurrence-set hash; skip on match                   | Pipeline grows; > 200 species           |
| Photo manifest references 1024px photos for thumbnail display | Per-card transfer 200 KB even for thumbnails      | srcset with multiple sizes; iNat CDN supports `square`/`small`   | Always (no benefit to oversize)         |
| Inline SVG maps for all species in `species.json`             | `species.json` > 5 MB                             | Per-subgenus code-split; separate SVG fetch                      | > 100 species in active subgenus        |
| All 80 Osmia cards in DOM at once                             | INP > 500ms on click; scrolling janky             | IntersectionObserver-based progressive render                    | > 50 cards                              |
| Seasonality viz in heavy charting library                     | Chart lib > 100 KB; slows page                    | Hand-rolled SVG (Wiley paper format is simple); no chart lib     | Anytime                                 |
| Tribe iNat fetch synchronous on every page render             | Build hangs                                       | Cache in DuckDB; refresh nightly                                 | > 50 genera                             |
| Photo cache without S3 (hot-link to iNat at scale)            | iNat 429s; broken images                          | `data/photos_pipeline.py` to S3                                  | Public traffic > nominal volunteer use  |

---

## Security Mistakes

| Mistake                                                                              | Risk                                                                              | Prevention                                                                          |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Hot-link all-rights-reserved iNat photos                                             | Copyright violation; takedown demand; project credibility                         | License whitelist (CC0, CC-BY, CC-BY-NC, CC-BY-SA, CC-BY-NC-SA only); validation    |
| Render attribution as user-controlled HTML (`innerHTML = attribution`)               | XSS via malicious photographer name in iNat data                                  | Render attribution as text content (`textContent`); never `innerHTML`               |
| Slug generation accepts arbitrary path segments                                      | Path traversal in `species-{slug}.svg` write or in URL routing                    | Reuse `data/feeds.py::_slugify` exactly (already path-traversal-safe per v2.1)      |
| TOML edited via web tool that doesn't sanitize                                       | Malicious authoring input → broken site                                           | Pydantic validation in `data/run.py` is the authoritative check                     |
| Exposed iNat API token (if used) in client-side bundle                               | Token theft; rate-limit abuse                                                     | iNat API calls happen at build time only (Python pipeline); no client-side calls    |
| `species.json` contains private data (collector names, exact lat/lon of rare species) | Threatened-species poaching; collector privacy                                    | Aggregate to county or hex; never expose individual rare-species lat/lons publicly  |

---

## UX Pitfalls

| Pitfall                                                                  | User Impact                                              | Better Approach                                                                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Empty filtered card list with no message                                 | Volunteer thinks site is broken                          | "No species match these filters. [Clear filters]" empty state                                  |
| 0-record species card looks identical to 1000-record card                | Common vs rare indistinguishable                         | Density tier in SVG map; record-count badge on card                                            |
| Card link to SPA filters silently misfires                               | "View on map" loads unfiltered map                       | Round-trip Vitest test; shared link builder                                                    |
| Filter state not preserved across nav                                    | Click subgenus, filter, navigate away, come back: lost   | Filter state in URL; restored on load                                                          |
| Photo without attribution                                                | License violation (and photographer goodwill loss)       | License badge near photo; required attribution field for non-CC0                               |
| 80 cards loaded at once                                                  | Mobile pages crash or hang                               | IntersectionObserver-based progressive render; lazy-load photos                                |
| Tribe nav uses live iNat tribe; updates silently break bookmarks         | Bookmarked URL no longer works after a taxonomic move    | Tribe is display-only; URL is species-level                                                    |
| "0 records" card with no explanation                                     | Could be join bug, vagrant, checklist-only — ambiguous   | Distinct messages: "checklist only — no records yet" vs "filter excludes — clear filters"      |

---

## "Looks Done But Isn't" Checklist

- [ ] **Photo attribution:** verify each non-CC0 photo on the live page renders the photographer + license string
- [ ] **License compliance:** grep manifest for `license = ` and confirm only allowed values present
- [ ] **SPA pre-filtered link:** click "View on map" for 5 random species; confirm filter chip appears with correct taxon name
- [ ] **Empty filter state:** apply a filter that matches zero species; confirm empty state message renders
- [ ] **Largest subgenus:** open Osmia (or actual largest); measure transfer size and LCP on simulated 4G; confirm under budget
- [ ] **Mobile rendering:** open species page on a real phone over LTE; confirm no 30+ MB transfer; cards readable
- [ ] **Out-of-WA records:** confirm `*Centris pallida*` (or known vagrant) doesn't get a card unless explicitly intended
- [ ] **Authority handling:** species with authority-bearing scientificName produce one card, not two
- [ ] **Slug round-trip:** species page link `/species/{slug}/` resolves; SPA link from card resolves with filter applied
- [ ] **Tribe sentinel:** confirm "Unassigned" tribe section renders if any species is missing tribe data
- [ ] **Schema gate:** `species.json` (or whatever feed) is in `validate-schema.mjs` EXPECTED list
- [ ] **Manifest validation:** delete a `license` field; confirm `data/run.py` exits nonzero before producing artifacts
- [ ] **Architectural test:** confirm species entry's import graph doesn't include mapbox-gl
- [ ] **CI bundle budget:** confirm species chunk size is under documented budget
- [ ] **`_scaffold-check` extended:** the diagnostic page also covers the species multi-entry
- [ ] **`npm run build` (not just dev):** species page renders correctly in `_site/`
- [ ] **iNat 404 anti-entropy:** delete a manifest photo from iNat; confirm nightly run flags it within 24h
- [ ] **Photo cache:** if S3-hosted, confirm hot-link fallback path doesn't accidentally serve from iNat in production
- [ ] **CC-licensed photos:** confirm photo URL doesn't include personally identifying info that would change if user renames

---

## Recovery Strategies

| Pitfall                                              | Recovery Cost | Recovery Steps                                                                                                                                  |
| ---------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Manifest photo 404s in production                    | LOW           | Anti-entropy script flags entry; manual edit removes broken photo or replaces; nightly run regenerates                                         |
| All-rights-reserved photo shipped                    | MEDIUM        | Hard-revert manifest commit; redeploy; investigate authoring workflow gap                                                                       |
| Checklist source is stale and missing recent species | MEDIUM        | Update `data/checklist_*.csv`; nightly run includes new species; cards appear next deploy                                                       |
| Synonym mismatch produces duplicate cards            | LOW           | Add to `data/checklist_synonyms.csv`; rerun reconciliation                                                                                      |
| mapbox-gl leaked into species chunk                  | MEDIUM        | Locate the offending import (bundle visualizer); refactor to leaf-only; architectural test catches regression                                   |
| `_data/species.js` swallowed an error and shipped empty | MEDIUM     | Remove `try/catch`; build now fails fast; investigate underlying issue (parquet schema drift, missing file)                                     |
| Species page bundle exploded (Osmia 50+ MB)          | LOW           | Add lazy-load + srcset; pagination at 20-card threshold; deploy                                                                                 |
| SPA pre-filtered link broken                         | LOW           | Update shared `buildSpaTaxonLink`; round-trip test catches recurrence                                                                           |
| Slug collision on two species                        | LOW           | feeds.py `seen_slugs` pattern handles automatically (`-2`, `-3` suffix); confirm logging surfaces the collision                                 |
| Authority drift (two cards for one species)          | MEDIUM        | Add `canonical_name` column; update species page join; rerun                                                                                    |
| Eleventy + Vite multi-entry breaks production        | HIGH          | `_scaffold-check`-style diagnostic catches it on deploy; rollback via `git revert` of the offending commit                                      |
| Tribe assignment goes stale                          | LOW           | Nightly fetch updates DuckDB cache; species page rerenders next build                                                                           |
| Performance budget regression                        | LOW           | CI gate catches it; require a milestone-level decision to raise the budget                                                                       |
| Photo CDN URL pattern changes                        | MEDIUM        | If hot-linked: bulk-update manifest URLs. If S3-cached: no impact (we own URLs)                                                                 |

---

## Pitfall-to-Phase Mapping

| Pitfall                                       | Prevention Phase                              | Verification                                                       |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| 1. Photo manifest drift                       | Manifest schema + nightly anti-entropy        | Anti-entropy report file populated; nightly run output             |
| 2. License violations                         | Manifest schema validation                    | Pytest fixture; `data/run.py` exits nonzero on bad license         |
| 3. Stale checklist source                     | Checklist ingestion                           | `last_modified` field present; expert review of species set        |
| 4. Synonym disagreement                       | Checklist ingestion + reconciliation          | `checklist_unmatched.csv` reviewed; pytest covers known divergences|
| 5. Vagrant inclusion                          | Inclusion rule                                | Pipeline output reviewed; vagrant indication in card               |
| 6. Tribe staleness                            | Tribe ingestion + refresh                     | Nightly cache refresh; sentinel rendering verified                 |
| 7. mapbox-gl in species bundle                | Architectural-invariant test + bundle gate    | `readFileSync` import-graph test; CI size budget                   |
| 8. `_data/species.js` HMR slowness            | Build-time data feed (precompute)             | HMR < 100 ms after change                                          |
| 9. CI requires occurrences.parquet            | Build-time data feed (commit-or-fetch)        | Fresh-clone CI build succeeds                                      |
| 10. Largest-subgenus weight                   | Card rendering + asset strategy               | Lighthouse mobile LCP < 3 s on Osmia                               |
| 11. SVG density blindness                     | SVG generator                                 | Visual review; density tiers documented                            |
| 12. Wasted SVG regen                          | SVG generator + caching                       | Hash-based skip in `data/run.py`                                   |
| 13. Off-WA points in SVG                      | SVG generator                                 | viewBox + clip; visual review                                      |
| 14. SVG file count                            | Asset strategy                                | Inline-vs-file decision documented; CloudFront budget             |
| 15. Empty filter state                        | Species filter UX                             | UAT; visual review                                                 |
| 16. URL schema drift                          | URL contract                                  | Documented schema; param-name consistency review                   |
| 17. SPA link silently misfires                | URL contract                                  | Round-trip Vitest test; sample 5 species manually                  |
| 18. Slug divergence                           | URL contract + slugify utility                | Python-only slugifier; round-trip test for all checklist species   |
| 19. Authority leak                            | Name normalization                            | `canonical_name` column; pytest fixture                            |
| 20. TOML round-trip noise                     | Authoring workflow                            | Diff size measured on real edit                                    |
| 21. Manifest validation absent                | Manifest schema validation                    | Pytest fixtures; `data/run.py` integration                         |
| 22. Multi-entry component non-registration    | Page scaffolding                              | Build-time grep for hashed JS reference                            |
| 23. Build-time data error swallowed           | Build-time data feed                          | No `try/catch` around critical reads; post-build grep              |
| 24. Vite shared-chunk dedup miss              | Multi-entry build                             | Bundle visualizer review                                           |
| 25. Prod build differs from dev               | Multi-entry build                             | CI builds production; `_scaffold-check`-style smoke                |
| 26. iNat photo URL pattern changes            | Photo URL strategy                            | Resolve URL at manifest fill; cache to S3                          |
| 27. Hot-link rate limits / TOS                | Photo URL strategy                            | `data/photos_pipeline.py` + S3 cache                               |
| 28. Coordinate jitter                         | SVG generator                                 | Aggregation tier or alpha-stack; no random jitter                  |
| 29. Color choice                              | SVG generator                                 | Colorblind simulator; print test                                   |
| 30. Performance budget regression             | Performance budget                            | CI gate with budget number; tracked in BUDGETS.md                  |

---

## Sources

- BeeAtlas codebase: `src/url-state.ts`, `data/run.py`, `data/feeds.py`, `scripts/validate-schema.mjs`, `eleventy.config.js`, `vite.config.ts`, `_data/build.js` — read directly to ground frontend/pipeline contracts.
- BeeAtlas project memory: `.planning/PROJECT.md` (Key Decisions, Validated Requirements, Tech Stack, Known Tech Debt) — verified mapbox-gl 1,700 KB constraint, v3.1 multi-entry pattern, v3.0 SPA mounted at `/`.
- BeeAtlas retrospective: `.planning/RETROSPECTIVE.md` — drew on v1.2 (raw-dict vs model-object family of silent failures), v1.5 (CRS / spatial join silent wrong results, commit-static-reference-data pattern), v1.7 (Lambda viability constraints; CDN config two-part pitfall), v2.1 (slugify path-traversal safety; always-write empty Atom feeds), v3.0 (mapbox-gl chunk size revisit), v3.1 (HMR vs build divergence flagged).
- BeeAtlas seed: `.planning/seeds/species-tab.md` — locked decisions on static SVG, photo TOML manifest, Ecdysis primary taxonomy, iNat tribe gap-fill, geography+seasonality filter scope.
- iNaturalist API & licensing: [iNat API docs (`/v1/photos/{id}`, `/v1/taxa/{id}`)](https://api.inaturalist.org/v1/docs/) and [iNat license model](https://www.inaturalist.org/pages/help#cclicense) — verified license codes (`cc0`, `cc-by`, `cc-by-nc`, `cc-by-sa`, `cc-by-nc-sa`, `null`); confirmed photo URL split between `static.inaturalist.org` and `inaturalist-open-data.s3.amazonaws.com`.
- Web standards: [`<img loading="lazy">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#loading) and [`<img srcset>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img#srcset) — native browser support, no JS.
- Vite MPA: [Vite multi-page app docs](https://vitejs.dev/guide/build.html#multi-page-app) — entries discovered via `<script type="module" src=...>` in HTML; behavior matches v3.1 implementation.
- Eleventy: [`@11ty/eleventy-plugin-vite` source](https://github.com/11ty/eleventy-plugin-vite) — confirmed dev/build config-source split (per `eleventy.config.js` inline comments).

---

*Pitfalls research for: BeeAtlas v3.2 Species Tab*
*Researched: 2026-05-02*

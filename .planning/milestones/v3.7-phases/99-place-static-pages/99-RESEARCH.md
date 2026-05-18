# Phase 99: Place Static Pages — Research

**Researched:** 2026-05-17
**Domain:** Eleventy static page generation (Nunjucks templates, data modules, pagination)
**Confidence:** HIGH

## Summary

Phase 99 is a pure Eleventy templating task. All decisions are locked in CONTEXT.md and the
UI-SPEC is approved. No external packages are needed. The work is entirely analogous to the
existing species page pattern — a `_data/places.js` module feeding two Nunjucks templates
(`_pages/places.njk` index and `_pages/place-detail.njk` detail via Eleventy pagination).

The main implementation risk is CSS delivery. Unlike taxon pages — where `taxon-pages.css`
arrives via a `<script type="module">` entry that Vite processes — place pages have no JS
entry (D-09). CSS must be delivered via a `<link rel="stylesheet">` tag inside the template
body. Vite MPA mode detects and processes such tags from anywhere in the document, not only
from `<head>`, so this works. The `<link>` goes in the Nunjucks template content, which
renders inside `<main>` from `default.njk`.

The second notable finding is that `places.json` uses `specimen_count` (confirmed in the
live file), and the SVG map directory on disk is `public/data/place-maps/` (not
`places-maps/`). The CONTEXT.md D-07 and the UI-SPEC both reference `/data/places-maps/`
— the planner must verify which path Phase 98 will actually write and ensure consistency
between the pipeline output path and the template `<img src>`.

**Primary recommendation:** Follow the species-detail/species-index pattern exactly.
Deliver CSS via `<link rel="stylesheet" href="/src/styles/places.css">` in the template
body (no JS entry). Permalink must use `.html` suffix, not trailing slash.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Permit table is out of scope for Phase 99 (and for the v3.7 milestone). Do not
  implement any permit display. Requirements PPAGE-02's "permit table" clause is superseded.
  Update REQUIREMENTS.md and ROADMAP.md to remove the permit table.

- **D-02:** Direct-path URLs throughout — `/places.html` for the index, `/places/{slug}.html`
  for per-place pages. Do NOT use trailing-slash directories. CloudFront does not redirect
  `/foo/` to `/foo/index.html`.

- **D-03:** `_data/places.js` reads `public/data/places.json` at build time, following the
  `_data/species.js` pattern exactly. Exposes a `places` global (array of place objects with
  slug, name, land_owner, specimen_count, sample_count fields).

- **D-04:** Index page (`_pages/places.njk`) follows the species index pattern — compact list,
  no JS entry. Per-place pages (`_pages/place-detail.njk`) use Eleventy pagination over
  `places.placesArray` (size: 1), `permalink: "/places/{{ place.slug }}.html"`.

- **D-05:** Follow species-detail.njk structure: SVG map in `media-grid` div at top, then
  metadata line (specimen count, land owner), then the deep-link. No photo section.

- **D-06:** Deep-link anchor: `<a href="/?place={{ place.slug }}">View occurrences on the
  atlas →</a>`. Phase 100 implements the JS side. This is a valid URL that Phase 100 activates.

- **D-07:** SVG maps served from `/data/places-maps/{{ place.slug }}.svg`. Only render the
  `<img>` if `place.specimen_count > 0`.

- **D-08:** New `src/styles/places.css` following `src/styles/species.css` pattern. Import in
  the place page templates, not globally.

- **D-09:** Both places pages are fully static Nunjucks — no TypeScript entry point, no Vite
  bundle. No `<script type="module">` tag on either page.

### Claude's Discretion

- Index page: exact HTML structure within compact-list approach (ul vs table, column order)
- Whether to add `<title>` computed per-place via `eleventyComputed` (should, following genus.njk)

### Deferred Ideas (OUT OF SCOPE)

- Permit table display — removed from v3.7 milestone entirely; revisit v3.8+
- Per-place species breakdown (PRICH-01)
- iNaturalist place URL link-out (PRICH-03)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PPAGE-01 | `/places.html` index lists all places with name, land owner, and specimen count (permit status summary dropped per D-01) | `_data/places.js` exposes array; `_pages/places.njk` iterates it |
| PPAGE-02 | Per-place page at `/places/{slug}.html` shows name, owner, specimen count, SVG occurrence map, deep-link to filtered atlas (permit table dropped per D-01) | `_pages/place-detail.njk` with Eleventy pagination size:1; SVG guarded by `specimen_count > 0` |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Place data at build time | Static / CDN | — | `_data/places.js` reads JSON at Eleventy build; no runtime |
| Index page HTML | Frontend Server (SSR/Eleventy) | — | Nunjucks template rendered at build time |
| Detail page HTML | Frontend Server (SSR/Eleventy) | — | Eleventy pagination over places array |
| SVG occurrence maps | CDN / Static | — | Pre-generated by Phase 98; served as static files |
| Deep-link param activation | Browser / Client | — | Phase 100 will implement; this phase only writes the href |
| CSS styles | CDN / Static | — | Processed by Vite from `<link>` tag in template body |

## Standard Stack

No new packages required. This phase uses only the existing Eleventy + Vite stack.

### Core (already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@11ty/eleventy` | ^3.1.5 | Static site generation; Nunjucks templating; data cascade | Already in use; all existing pages use it [VERIFIED: package.json] |
| `@11ty/eleventy-plugin-vite` | ^7.1.1 | MPA Vite integration; processes `<link>` and `<script>` in templates | Already in use; processes CSS links in body [VERIFIED: package.json] |

### No New Packages

This phase installs nothing. All capabilities are met by the existing stack.

## Package Legitimacy Audit

No packages to audit — this phase introduces zero npm dependencies.

## Architecture Patterns

### System Architecture Diagram

```
places.json (public/data/)
        |
        v
_data/places.js  [build-time ESM module, reads JSON with readFileSync]
        |
        +---> _pages/places.njk           → _site/places.html
        |     (flat list, no pagination)
        |
        +---> _pages/place-detail.njk     → _site/places/{slug}.html (N pages)
              (pagination size:1, alias:place)

public/data/place-maps/{slug}.svg         → _site/data/place-maps/{slug}.svg
        |                                    (passthrough via Vite publicDir)
        |
        referenced from place-detail.njk as <img src="/data/place-maps/{{ place.slug }}.svg">

src/styles/places.css
        |
        referenced via <link rel="stylesheet" href="/src/styles/places.css"> in templates
        |
        processed by Vite MPA → _site/assets/places-{hash}.css
```

### Recommended Project Structure

```
_data/
  places.js            # NEW — mirrors species.js pattern; reads places.json
_pages/
  places.njk           # NEW — index listing
  place-detail.njk     # NEW — per-place detail with pagination
src/styles/
  places.css           # NEW — mirrors taxon-pages.css scope, place-specific selectors
  taxon-pages.css      # existing — do not modify
public/data/
  places.json          # existing (Phase 98) — slug, name, land_owner, specimen_count
  place-maps/          # existing (Phase 98) — {slug}.svg files
```

### Pattern 1: _data Module (mirrors `_data/species.js`)

**What:** ESM module using `readFileSync` to load JSON at build time. Exported default
becomes an Eleventy global available to all Nunjucks templates as `places`.

**When to use:** Any build-time JSON data feed into Eleventy templates.

```javascript
// Source: _data/species.js (confirmed in codebase)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const raw = JSON.parse(readFileSync(join(repoRoot, 'public/data/places.json'), 'utf8'));

// Expose placesArray sorted by name (or original order from pipeline)
const placesArray = raw;  // already an array

export default { placesArray };
```

The `places.js` export key is `placesArray`. Templates reference `places.placesArray` for
pagination (D-04 specifies `data: places.placesArray`). The module-level global is `places`
(Eleventy uses the filename as the global name). [VERIFIED: codebase, `_data/species.js`]

### Pattern 2: Eleventy Pagination for Detail Pages (mirrors `_pages/species-detail.njk`)

**What:** Eleventy `pagination` front-matter with `size: 1` and `alias` generates one output
file per item. `permalink` uses the alias variable.

**When to use:** Per-item static pages from an array.

```yaml
# Source: _pages/species-detail.njk front-matter pattern
---
pagination:
  data: places.placesArray
  size: 1
  alias: place
permalink: "/places/{{ place.slug }}.html"
eleventyComputed:
  title: "{{ place.name }} — BeeAtlas"
layout: default.njk
---
```

Key: permalink uses `.html` suffix (not trailing slash). CloudFront requires direct-path
files — `permalink: "/places/{{ place.slug }}/"` would write `/places/slug/index.html`
which CloudFront cannot serve at `/places/slug/`. [VERIFIED: codebase + CLAUDE.md]

### Pattern 3: CSS Delivery Without a JS Entry

**What:** For static pages with no `<script type="module">` (D-09), CSS arrives via
`<link rel="stylesheet" href="/src/styles/places.css">` placed anywhere in the template
(including the body). Vite MPA mode scans each HTML file for `<link>` and `<script>` tags
and processes them.

**Evidence:** `_pages/index.html` uses `<link rel="stylesheet" href="./src/index.css" />`
in `<head>` — Vite resolves and hashes it. The same mechanism works for links in template
body since Vite inspects the entire HTML document in MPA mode. [VERIFIED: codebase,
`_pages/index.html`, Eleventy-plugin-vite EleventyVite.js]

**Implication:** The `<link rel="stylesheet" href="/src/styles/places.css">` should be
placed at the top of the Nunjucks template content block (before the `<article>`), since
`default.njk` renders content inside `<main>` without head injection support.

### Pattern 4: SVG Map Guard (mirrors `_pages/species-detail.njk`)

```nunjucks
{# Source: _pages/species-detail.njk — line 24 #}
{%- if place.specimen_count > 0 -%}
  <img loading="lazy"
       src="/data/places-maps/{{ place.slug }}.svg"
       alt="Occurrence map for {{ place.name }}">
{%- endif -%}
```

When `specimen_count` is 0 (as with current seed data), no `<img>` is rendered and no
broken image request occurs. [VERIFIED: codebase]

### Anti-Patterns to Avoid

- **Trailing-slash permalink:** `permalink: "/places/{{ place.slug }}/"` writes
  `/places/slug/index.html`. CloudFront does not redirect `/places/slug/` to
  `/places/slug/index.html`. Use `.html` suffix explicitly.
- **Parquet reads in `_data/places.js`:** Eleventy data modules run on every HMR
  cycle. Parquet parsing kills HMR latency. Read only `places.json`. [VERIFIED: codebase,
  `_data/species.js` Pitfall #8 comment]
- **Adding `src/entries/places.ts`:** D-09 prohibits a JS entry. Don't create one. The
  `<link rel="stylesheet">` approach delivers CSS without JS.
- **Global CSS import:** D-08 says import places.css in the place templates only, not
  globally in base.njk or default.njk.
- **Using `places.placesArray` vs `places` in the index template:** The Eleventy global
  is `places` (from `_data/places.js` export default). The index template uses
  `places.placesArray` to loop. Pagination uses `data: places.placesArray`. Do not
  reference `places` directly as an array.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-item static page generation | Custom build script | Eleventy pagination `size: 1` | Already handles slug interpolation, output path, incremental builds |
| CSS hash versioning | Manual fingerprinting | Vite MPA `<link>` processing | Vite hashes and injects the correct URL in the built HTML |
| URL-safe slug generation | Regex/sanitize logic | Pipeline-provided `slug` field | Slugs are validated `[a-z0-9-]` at Phase 97; trust the data |

## Common Pitfalls

### Pitfall 1: SVG Map Path Discrepancy

**What goes wrong:** The CONTEXT.md D-07 and UI-SPEC reference `/data/places-maps/` but the
directory currently on disk is `public/data/place-maps/` (no trailing 's' on 'maps').

**Why it happens:** Phase 98 is still executing; the canonical output path is determined by
Phase 98's pipeline code, not the CONTEXT.md shorthand.

**How to avoid:** Before writing the `<img src>` path, confirm what path Phase 98 exports
SVG files to. If the pipeline writes to `place-maps/`, the template must use
`/data/place-maps/{{ place.slug }}.svg`. Do not guess — check `data/run.py` or the Phase 98
plan for the exact export directory name.

**Warning signs:** 404s on SVG map images after build. The path in the template must match
the passthrough copy path from Vite publicDir.

### Pitfall 2: Permalink Trailing Slash Generates Wrong Output

**What goes wrong:** Using `permalink: "/places/{{ place.slug }}/"` in place-detail.njk
writes the file to `_site/places/slug/index.html`. CloudFront serves `/places/slug/`
correctly on most CDNs, but this project's CloudFront distribution is not configured to
append `/index.html` for subdirectory URLs.

**Why it happens:** The species pages use trailing-slash permalinks (`/species/{{ sp.slug }}/`)
— that's the existing precedent. Place pages must deviate from it intentionally (D-02).

**How to avoid:** Use `permalink: "/places/{{ place.slug }}.html"` explicitly. The plan
should grep for this in a verification step.

### Pitfall 3: CSS Not Applied at Runtime

**What goes wrong:** Place pages render with no custom CSS — browser shows unstyled layout.

**Why it happens:** If `places.css` is only referenced via `import '../styles/places.css'`
in a TS entry that doesn't exist (D-09), or if the `<link>` tag's path is wrong, Vite
won't process the CSS and it won't appear in the built output.

**How to avoid:** Verify in `_site/assets/` that a `places-{hash}.css` file appears after
build. Verify the built place page HTML contains a `<link rel="stylesheet">` pointing to the
hashed asset.

### Pitfall 4: `places` Global Name Collision

**What goes wrong:** The Eleventy data cascade names the global after the filename. If
`_data/places.js` exports `{ placesArray }` as default, the global is `places` and
`places.placesArray` is the array. If the template tries to loop over `places` directly
(treating it as an array), the loop iterates over the object's keys, not the place items.

**Why it happens:** `_data/species.js` exports several arrays; templates always use
`species.speciesList`, `species.genusList`, etc. The same convention applies.

**How to avoid:** In pagination front-matter use `data: places.placesArray`. In the index
template loop use `for place in places.placesArray`.

## Code Examples

### `_data/places.js` — Minimal Data Module

```javascript
// Source: mirrors _data/species.js pattern (verified in codebase)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const raw = JSON.parse(readFileSync(join(repoRoot, 'public/data/places.json'), 'utf8'));

// Return in original pipeline order (pipeline sorts by name already if needed)
const placesArray = raw;

export default { placesArray };
```

### `_pages/places.njk` — Index Template

```nunjucks
---
layout: default.njk
permalink: /places.html
title: Places — BeeAtlas
---
<link rel="stylesheet" href="/src/styles/places.css">
<article class="places-page places-index">
  <h1>Places</h1>
  <ul class="places-list">
    {%- for place in places.placesArray -%}
    <li>
      <a href="/places/{{ place.slug }}.html">{{ place.name }}</a>
      <span class="owner">{{ place.land_owner }}</span>
      <span class="count">{{ place.specimen_count }} specimens</span>
    </li>
    {%- endfor -%}
  </ul>
</article>
```

### `_pages/place-detail.njk` — Detail Template

```nunjucks
---
pagination:
  data: places.placesArray
  size: 1
  alias: place
permalink: "/places/{{ place.slug }}.html"
eleventyComputed:
  title: "{{ place.name }} — BeeAtlas"
layout: default.njk
---
<link rel="stylesheet" href="/src/styles/places.css">
<article class="places-page place-detail">
  <h1>{{ place.name }}</h1>
  <div class="media-grid">
    {%- if place.specimen_count > 0 -%}
      <img loading="lazy"
           src="/data/place-maps/{{ place.slug }}.svg"
           alt="Occurrence map for {{ place.name }}">
    {%- endif -%}
  </div>
  <p class="metadata">{{ place.specimen_count }} specimens · {{ place.land_owner }}</p>
  <a href="/?place={{ place.slug }}">View occurrences on the atlas →</a>
</article>
```

### `src/styles/places.css` — CSS File

```css
/* Phase 99: layout for /places.html and /places/{slug}.html pages.
 * Mirrors taxon-pages.css conventions. Design tokens from src/index.css. */

.places-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
  box-sizing: border-box;
}

/* SVG occurrence map: viewBox 600x320 = 15:8 aspect (matching species-maps). */
.places-page img[src*="/place-maps/"] {
  aspect-ratio: 15 / 8;
  width: 100%;
  max-width: 600px;
}

.places-page .metadata {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}

@media (min-width: 768px) {
  .places-page .media-grid {
    display: grid;
    gap: 1.5rem;
    align-items: start;
  }
}

/* Index page */
.places-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.places-list li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--border, #ddd);
}

.places-list .owner {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}

.places-list .count {
  margin-left: auto;
  font-size: 0.85rem;
  color: var(--text-muted, #666);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Trailing-slash species permalinks | Direct-path `.html` permalinks for place pages | Phase 99 (D-02) | Place pages serve correctly from CloudFront without directory redirect config |
| CSS via JS entry | CSS via `<link rel="stylesheet">` for no-JS pages | Phase 99 (D-09) | No TS entry needed; Vite processes the link in MPA mode |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SVG maps are at `/data/place-maps/{slug}.svg` — canonical Phase 98 pipeline output (CONTEXT.md D-07 `places-maps/` plural is a typo) | Code Examples, Pitfall 1 | Broken `<img>` links if path mismatches; resolved by verifying `data/places_maps.py` output |
| A2 | `places.placesArray` as the export key (following species pattern) | Pattern 1, Code Examples | Templates reference wrong key; Eleventy silently outputs nothing in for-loop |

## Open Questions (RESOLVED)

1. **SVG map directory name** — RESOLVED: Phase 98 pipeline (`data/places_maps.py`) writes to
   `public/data/place-maps/` (singular "map"). All templates and CSS selectors use
   `/data/place-maps/{{ place.slug }}.svg`. CONTEXT.md D-07's `places-maps/` (plural) is a
   typo — the canonical path is singular `place-maps/`.

2. **REQUIREMENTS.md / ROADMAP.md permit table removal (D-01)** — RESOLVED: Plan 99-01 Task 1
   handles this as a Wave 1 doc-cleanup task before implementation begins.

## Environment Availability

Step 2.6: No external dependencies identified beyond the existing Node.js/Eleventy/Vite stack
which is already confirmed operational (`npm run dev` and `npm run build` work per CLAUDE.md).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Eleventy build | ✓ | see .nvmrc | — |
| `@11ty/eleventy` | Template rendering | ✓ | ^3.1.5 | — |
| `public/data/places.json` | `_data/places.js` | ✓ | (2 places committed) | Build fails gracefully with empty array |
| `public/data/places-maps/*.svg` | Detail page `<img>` | ✗ | (none yet — Phase 98 not done) | Guard `specimen_count > 0` means no broken imgs; maps appear when Phase 98 completes |

**Missing dependencies with no fallback:** None — the `specimen_count > 0` guard means place
pages render correctly even without SVG maps in the repo.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | `vite.config.ts` (`test` key) |
| Quick run command | `VITEST_SKIP_BUILD=1 npm test` |
| Full suite command | `npm test` (includes `build-output.test.ts` which runs `npm run build`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PPAGE-01 | `_site/places.html` emits with places-list items | build-output | `npm test` | ❌ Wave 0 — add to `build-output.test.ts` |
| PPAGE-01 | `_data/places.js` exports `placesArray` as array | unit | `VITEST_SKIP_BUILD=1 npm test` | ❌ Wave 0 — add to `data-species.test.ts` sibling |
| PPAGE-02 | `_site/places/{slug}.html` emits with correct content | build-output | `npm test` | ❌ Wave 0 — add to `build-output.test.ts` |
| PPAGE-02 | SVG `<img>` absent when `specimen_count == 0` | build-output | `npm test` | ❌ Wave 0 (current seed data has 0 specimens) |
| PPAGE-02 | Deep-link `href` has correct format | build-output | `npm test` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (fast, unit tests only)
- **Per wave merge:** `npm test` (full suite with build)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/data-places.test.ts` — unit tests for `_data/places.js` export shape (mirrors `data-species.test.ts`)
- [ ] New assertions in `src/tests/build-output.test.ts` — places index and detail page build output assertions (PPAGE-01, PPAGE-02)

## Security Domain

This phase introduces no authentication, no user input, no dynamic server-side rendering,
no cookies, and no API calls. It is fully static Nunjucks with no JS. No ASVS categories
apply. The only output is pre-rendered HTML served from a CDN.

## Sources

### Primary (HIGH confidence)
- Codebase: `_pages/species-detail.njk`, `_pages/species.njk` — direct structural models [VERIFIED: codebase]
- Codebase: `_data/species.js` — data module pattern [VERIFIED: codebase]
- Codebase: `eleventy.config.js` — Eleventy dir config, plugin-vite setup [VERIFIED: codebase]
- Codebase: `public/data/places.json` — confirmed field names (slug, name, land_owner, specimen_count, sample_count) [VERIFIED: codebase]
- Codebase: `src/styles/taxon-pages.css` — CSS class patterns, design tokens [VERIFIED: codebase]
- Codebase: `_pages/genus.njk` — `eleventyComputed: title:` pattern [VERIFIED: codebase]
- Codebase: `_pages/index.html` — CSS via `<link rel="stylesheet">` in Vite MPA context [VERIFIED: codebase]
- `.planning/phases/99-place-static-pages/99-UI-SPEC.md` — approved visual contract [VERIFIED: codebase]
- `.planning/phases/99-place-static-pages/99-CONTEXT.md` — locked decisions [VERIFIED: codebase]
- `CLAUDE.md` — CloudFront direct-path URL constraint, static hosting only [VERIFIED: codebase]

### Secondary (MEDIUM confidence)
- Codebase: `src/tests/build-output.test.ts` — existing test patterns to follow for Wave 0 tests [VERIFIED: codebase]
- `_site/species/Agapostemon/femoratus/index.html` (built output) — confirms CSS arrives via JS entry, not `<link>` tag in taxon pages [VERIFIED: codebase]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages already installed; no new dependencies
- Architecture: HIGH — direct analogy to species pages; patterns verified in codebase
- Pitfalls: HIGH (permalink/CSS/path) — confirmed from reading built output and codebase

**Research date:** 2026-05-17
**Valid until:** Until Phase 98 finalizes SVG map export path (resolves Open Question 1)

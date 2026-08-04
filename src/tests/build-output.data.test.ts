// Phase 80 Wave 0 — RED contract for PAGE-07 / PAGE-09 + D-04 skip-slot.
// Phase 96 — IDX-01..04 + URL-05 assertions (index page replacement).
// Post-build assertions on _site/. Wraps the whole describe block in a guard
// so it can be skipped via VITEST_SKIP_BUILD=1 when local feedback latency
// matters; CI runs without the flag.

import { describe, test, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import synonyms from '../../_data/synonyms.js';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_BUILD = process.env.VITEST_SKIP_BUILD === '1';
// beeatlas-b4p: the caller has already built _site and wants these assertions made
// against THAT tree. The nightly sets this, so it builds once and gates the very
// artifact it is about to publish, rather than building here, asserting on that, and
// then publishing a second build nothing looked at.
const PREBUILT = process.env.BEEATLAS_SITE_PREBUILT === '1';

describe.skipIf(SKIP_BUILD)('build output', () => {
  beforeAll(() => {
    if (PREBUILT) {
      // Verify the caller's claim before trusting it. Without this, an absent or
      // half-built _site fails as dozens of unrelated-looking assertion errors
      // instead of one sentence naming the actual problem.
      if (!existsSync(resolve(ROOT, '_site/index.html'))) {
        throw new Error(
          'BEEATLAS_SITE_PREBUILT=1 but _site/index.html is absent — ' +
          'the caller claimed a built site and there is nothing to assert against',
        );
      }
      return;
    }
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 180_000);

  test('emits _site/species/index.html as a tree with family nodes', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/class="tree-node tree-node--family"/);
    expect(html).toMatch(/data-rank="family"/);
    expect(html).not.toContain('<bee-species-page');
  });

  test('index page has #species-filter input', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/id="species-filter"/);
  });

  test('index page has genus links to /species/{Genus}/index.html', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/href="\/species\/Agapostemon\/index\.html"/);
  });

  test('index page has species links to /species/{Genus}/{epithet}/index.html', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/href="\/species\/Agapostemon\/femoratus\/index\.html"/);
  });

  // plugin-vite (MPA mode) emits the species page entry under either:
  //   _site/assets/species-<hash>.js     (flat layout)
  //   _site/assets/species/index-<hash>.js  (nested layout, current Rollup default for /species/ MPA entry)
  // Either is acceptable as long as a species-scoped chunk exists distinct from index-*.js.
  function findSpeciesChunk(): string | undefined {
    const assetsDir = resolve(ROOT, '_site/assets');
    const flat = readdirSync(assetsDir).filter(f => /^species-.*\.js$/.test(f));
    if (flat.length > 0) return resolve(assetsDir, flat[0]!);
    const nestedDir = resolve(assetsDir, 'species');
    try {
      const nested = readdirSync(nestedDir).filter(f => /\.js$/.test(f));
      if (nested.length > 0) return resolve(nestedDir, nested[0]!);
    } catch { /* directory absent */ }
    return undefined;
  }

  function findTaxonChunk(): string | undefined {
    const assetsDir = resolve(ROOT, '_site/assets');
    const flat = readdirSync(assetsDir).filter(f => /^taxon-page-.*\.js$/.test(f));
    if (flat.length > 0) return resolve(assetsDir, flat[0]!);
    const nestedDir = resolve(assetsDir, 'taxon-page');
    try {
      const nested = readdirSync(nestedDir).filter(f => /\.js$/.test(f));
      if (nested.length > 0) return resolve(nestedDir, nested[0]!);
    } catch { /* directory absent */ }
    return undefined;
  }

  test('emits a species-index chunk distinct from the main / SPA entry', () => {
    const speciesChunk = findSpeciesChunk();
    expect(speciesChunk, 'no species-index chunk emitted under _site/assets/').toBeDefined();
    // The main `/` SPA entry chunk must be built and referenced by _site/index.html.
    // added the /app MPA entry, which renamed the root entry chunk from
    // `index-*.js` to `bee-atlas-*.js` (per-page entries are now `species/index-*.js`,
    // `app/index-*.js`, and root → `bee-atlas-*.js`). Anchor on what index.html actually
    // references rather than a hard-coded chunk name, and confirm each chunk exists.
    const indexHtml = readFileSync(resolve(ROOT, '_site/index.html'), 'utf-8');
    const entryRefs = [...indexHtml.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]!);
    expect(entryRefs.length, 'no hashed entry chunk referenced by _site/index.html').toBeGreaterThan(0);
    for (const ref of entryRefs) {
      expect(existsSync(resolve(ROOT, '_site' + ref)), `chunk referenced by index.html missing on disk: ${ref}`).toBe(true);
    }
    // The species/taxon chunk must be split out — i.e. not itself one of the / entry chunks.
    const speciesFile = speciesChunk?.split('_site')[1];
    expect(entryRefs.includes(speciesFile ?? '__none__'), 'species chunk should be code-split, not a / entry chunk').toBe(false);
  });

  test('species-index chunk does NOT contain mapboxgl symbol', () => {
    const speciesChunk = findSpeciesChunk();
    expect(speciesChunk).toBeDefined();
    const src = readFileSync(speciesChunk!, 'utf-8');
    expect(src).not.toMatch(/mapboxgl/);
  });

  test('emits _site/species/Agapostemon/femoratus/index.html (SPE-01, URL-01, PIPE-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
    );
    expect(html).toContain('<em>Agapostemon femoratus</em>');
    expect(html).toContain('<seasonality-viz');
    expect(html).toContain('/data/species-maps/Agapostemon/femoratus.svg');
    expect(html).toMatch(/View \d+ records on the atlas/);
  });

  // The blanket "every img is lazy" rule held until the photo gallery landed.
  // The first hero photo is now the LCP candidate and is deliberately eager;
  // lazy-loading it would defer the largest above-the-fold paint. Everything
  // after it — later gallery slides, the occurrence map — still defers.
  test('species page with photos: exactly one eager <img>, the first hero photo (PAGE-07, SPE-02/SPE-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
    );
    // Guard against a vacuous pass: this assertion is what makes "exactly one
    // eager image" meaningful. If this species ever loses its photos, this
    // fails loudly rather than the contract silently going untested.
    expect(html, 'page under test must actually have a gallery').toContain('<bee-photo-gallery');

    const imgs: string[] = html.match(/<img\b[^>]*>/g) ?? [];
    const eager = imgs.filter(img => !/loading="lazy"/.test(img));
    expect(eager.length, `expected exactly 1 eager img, got:\n${eager.join('\n')}`).toBe(1);

    const hero = eager[0]!;
    expect(imgs.indexOf(hero), 'the eager image must be first in document order').toBe(0);
    expect(hero, hero).toMatch(/class="photo-hero"/);
    expect(hero, hero).toMatch(/fetchpriority="high"/);
  });

  // A species with no photos has no eager image at all — the map must not
  // become the LCP fetch just because the gallery is absent.
  test('species page without photos lazy-loads every <img> (SPE-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Hoplitis/orthognatha/index.html'), 'utf-8'
    );
    expect(html).toContain('No photo available');
    const imgs: string[] = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('emits _site/species/Agapostemon/index.html (GEN-01, URL-02, PIPE-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
    );
    expect(html).toContain('<em>Agapostemon</em>');
    expect(html).toContain('/data/species-maps/genus/Agapostemon.svg');
    expect(html).toContain('class="species-list"');
    expect(html).toMatch(/background:\s*#[0-9a-f]{6}/);
  });

  test('genus page links each species to its species page (GEN-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/index.html'), 'utf-8'
    );
    expect(html).toMatch(/href="\/species\/Agapostemon\/femoratus\/index\.html"/);
  });

  test('emits a taxon-page chunk distinct from species chunk (Pattern 4)', () => {
    const taxonChunk = findTaxonChunk();
    const assetsDir = resolve(ROOT, '_site/assets');
    const hasFlatTaxon = readdirSync(assetsDir).some(f => /^taxon-page-.*\.js$/.test(f));
    let hasNestedTaxon = false;
    try {
      const nestedDir = resolve(assetsDir, 'taxon-page');
      hasNestedTaxon = readdirSync(nestedDir).some(f => /\.js$/.test(f));
    } catch { /* directory absent */ }
    // taxonChunk defined => at least one layout found; check both layouts explicitly
    expect(taxonChunk, 'no taxon-page chunk emitted').toBeDefined();
    expect(hasFlatTaxon || hasNestedTaxon, 'no taxon-page chunk emitted').toBe(true);
  });

  // Phase 95 — subgenus page tests (SUBG-01, SUBG-02, SUBG-03, URL-03)

  test('emits _site/species/Andrena/Melandrena/index.html (SUBG-01, URL-03, PIPE-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
    );
    expect(html).toContain('<em>Melandrena</em>');
    expect(html).toContain('/data/species-maps/subgenus/Andrena/Melandrena.svg');
    expect(html).toContain('class="species-list"');
  });

  test('subgenus page links each species to its species page (SUBG-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
    );
    // Andrena commoda is a Melandrena species verified in species.json
    expect(html).toMatch(/href="\/species\/Andrena\/commoda\/index\.html"/);
  });

  test('subgenus page breadcrumb links to genus (SUBG-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
    );
    expect(html).toMatch(/<a href="\/species\/Andrena\/index\.html">Andrena<\/a>/);
  });

  test('every <img> on a subgenus page has loading="lazy" (SUBG-02 carry-forward)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
    );
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('subgenus page does not embed seasonality-viz', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Andrena/Melandrena/index.html'), 'utf-8'
    );
    expect(html).not.toContain('<seasonality-viz');
  });

  // Phase 95 Plan 02 — tribe page tests (TRIBE-01, TRIBE-02, TRIBE-03, URL-04)

  test('emits _site/species/tribe/Andrenini/index.html (TRIBE-01, URL-04, PIPE-01)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
    );
    expect(html).toContain('<h1>Andrenini</h1>');
    expect(html).not.toMatch(/<h1><em>Andrenini<\/em><\/h1>/);
    expect(html).toContain('/data/species-maps/tribe/Andrenini.svg');
    expect(html).toContain('class="species-list"');
  });

  test('tribe page links each genus to its genus page (TRIBE-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
    );
    expect(html).toMatch(/href="\/species\/Andrena\/index\.html"/);
  });

  test('tribe page has no swatches (genera-only listing)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
    );
    expect(html).not.toMatch(/<span class="swatch"/);
  });

  test('tribe page does not embed seasonality-viz', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
    );
    expect(html).not.toContain('<seasonality-viz');
  });

  test('every <img> on a tribe page has loading="lazy" (TRIBE-02 carry-forward)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/tribe/Andrenini/index.html'), 'utf-8'
    );
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('no tribe page emitted for Ammobatini (zero occurrences)', () => {
    expect(existsSync(resolve(ROOT, '_site/species/tribe/Ammobatini/index.html'))).toBe(false);
  });

  // Every taxon page walks the same ladder: the higher-rank pages used to stop at
  // "family / self" while species pages showed subfamily and tribe.
  test.each([
    ['_site/species/Bombus/index.html', 'Apidae / Apinae / Bombini / Bombus'],
    ['_site/species/Bombus/Pyrobombus/index.html', 'Apidae / Apinae / Bombini / Bombus / Pyrobombus'],
    ['_site/species/tribe/Bombini/index.html', 'Apidae / Apinae / Bombini'],
    ['_site/species/subfamily/Apinae/index.html', 'Apidae / Apinae'],
    ['_site/species/Bombus/caliginosus/index.html', 'Apidae / Apinae / Bombini / Bombus / Pyrobombus / caliginosus'],
  ])('%s breadcrumb walks the full ladder', (page, ladder) => {
    const html = readFileSync(resolve(ROOT, page), 'utf-8');
    const nav = /<nav class="breadcrumb">([\s\S]*?)<\/nav>/.exec(html);
    expect(nav, 'no breadcrumb nav').not.toBeNull();
    const labels = (nav?.[1] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .split(' ')
      .map(s => s.trim())
      .filter(s => s && s !== '/');
    expect(labels.join(' / ')).toBe(ladder);
  });

  // A folded name keeps its URL and forwards to the accepted one (beeatlas-ds4).

  test('a synonym keeps a page at its old URL that forwards to the accepted name', () => {
    // Agapostemon texanus was folded into A. subtilior (Portman et al. 2024), so
    // its page is no longer generated as a species — but the URL must not 404.
    const path = resolve(ROOT, '_site/species/Agapostemon/texanus/index.html');
    expect(existsSync(path), 'no page at the folded name’s URL').toBe(true);
    const html = readFileSync(path, 'utf-8');
    expect(html).toMatch(
      /<meta http-equiv="refresh" content="0; url=\/species\/Agapostemon\/subtilior\/index\.html">/,
    );
    expect(html).toContain('<link rel="canonical" href="https://beeatlas.net/species/Agapostemon/subtilior/index.html">');
    // A reader who stops the load still gets a link and the reason.
    expect(html).toMatch(/href="\/species\/Agapostemon\/subtilior\/index\.html"/);
    expect(html).toContain('Portman et al. 2024');
    // noindex here can propagate to the canonical target — see the template.
    expect(html).not.toMatch(/name="robots"[^>]*noindex/);
  });

  test('every synonym redirect points at a page that exists', () => {
    // A redirect to a 404 is worse than the 404 it replaced.
    for (const r of (synonyms as any).redirects) {
      expect(
        existsSync(resolve(ROOT, `_site/species/${r.toSlug}/index.html`)),
        `${r.fromSlug} redirects to ${r.toSlug}, which was not built`,
      ).toBe(true);
      expect(
        existsSync(resolve(ROOT, `_site/species/${r.fromSlug}/index.html`)),
        `no redirect page emitted for ${r.fromSlug}`,
      ).toBe(true);
    }
  });

  test('the Apache redirect map lists every synonym redirect', () => {
    // infra/maderas/beeatlas-species-redirects.conf points RewriteMap at this
    // file in the docroot. If the build stops emitting it, Apache keeps serving
    // whatever it last read and new folds silently fall back to meta refresh.
    const map = readFileSync(resolve(ROOT, '_site/species-redirects.map'), 'utf-8');
    const entries = new Map(
      map
        .split('\n')
        .filter(l => l.startsWith('/'))
        .map(l => l.split(/\s+/) as [string, string]),
    );
    expect(entries.size).toBe((synonyms as any).redirects.length);
    for (const r of (synonyms as any).redirects) {
      expect(entries.get(`/species/${r.fromSlug}/`)).toBe(`/species/${r.toSlug}/index.html`);
    }
    // A map key that is also a real page would 301 a live species away.
    const speciesSlugs = new Set(
      (species as any).speciesList.filter((sp: any) => sp.slug).map((sp: any) => sp.slug),
    );
    for (const key of entries.keys()) {
      const slug = key.replace(/^\/species\//, '').replace(/\/$/, '');
      expect(speciesSlugs.has(slug), `${key} would redirect a live species page`).toBe(false);
    }
  });

  test('a synonym redirect never shadows a real species page', () => {
    // Both templates write /species/<slug>/index.html; if a synonym still had a
    // species page, one would silently overwrite the other.
    const speciesSlugs = new Set(
      (species as any).speciesList.filter((sp: any) => sp.slug).map((sp: any) => sp.slug),
    );
    for (const r of (synonyms as any).redirects) {
      expect(speciesSlugs.has(r.fromSlug), `${r.fromSlug} is both a species and a redirect`).toBe(false);
    }
  });

  // Phase 99 — place page tests (PPAGE-01, PPAGE-02)

  test('_site/places.html has places-list class and per-place links (PPAGE-01)', () => {
    const html = readFileSync(resolve(ROOT, '_site/places.html'), 'utf-8');
    expect(html).toMatch(/class="places-list"/);
    expect(html).toMatch(/href="\/places\/[a-z0-9-]+\.html"/);
  });

  test('_site/places.html contains seed place name and owner (PPAGE-01)', () => {
    const html = readFileSync(resolve(ROOT, '_site/places.html'), 'utf-8');
    expect(html).toContain('Rattlesnake Ledge Recreation Area');
    expect(html).toContain('Washington Department of Natural Resources');
  });

  test('_site/places/rattlesnake-ledge.html exists with name, owner, specimen count, deep-link (PPAGE-02)', () => {
    const html = readFileSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'), 'utf-8');
    expect(html).toContain('Rattlesnake Ledge Recreation Area');
    expect(html).toContain('Washington Department of Natural Resources');
    expect(html).toMatch(/\d+ specimens/);
    expect(html).toMatch(/href="\/\?place=rattlesnake-ledge"/);
  });

  test('_site/places/rattlesnake-ledge.html has no SVG map reference when specimen_count is 0 (PPAGE-02)', () => {
    const html = readFileSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'), 'utf-8');
    expect(html).not.toMatch(/place-maps/);
    expect(html).not.toMatch(/places-maps/);
  });

  test('every <img> on _site/places/rattlesnake-ledge.html has loading="lazy" (PPAGE-02)', () => {
    const html = readFileSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'), 'utf-8');
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) {
      expect(img, img).toMatch(/loading="lazy"/);
    }
  });

  test('place pages load bee-header module entry (PPAGE-01) (PPAGE-02)', () => {
    const indexHtml = readFileSync(resolve(ROOT, '_site/places.html'), 'utf-8');
    const detailHtml = readFileSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'), 'utf-8');
    expect(indexHtml).toMatch(/src="\/assets\/bee-header-[^"]+\.js"/);
    expect(detailHtml).toMatch(/src="\/assets\/bee-header-[^"]+\.js"/);
  });

  test('_site/places/rattlesnake-ledge.html is a flat file, not a directory index (D-02 — direct-path URL) (PPAGE-02)', () => {
    expect(existsSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'))).toBe(true);
    expect(existsSync(resolve(ROOT, '_site/places/rattlesnake-ledge/index.html'))).toBe(false);
  });

  // Phase 113 — checklist-only species page tests (SPEC-01, SPEC-03, SPEC-04, SPEC-05, D-06, D-08, D-14)

  // Andrena/aculeata is the alphabetically-first confirmed checklist-only species
  // (occurrence_count === 0 && on_checklist === true in species.json from the pipeline).
  // Previously Agapostemon/texanus; replaced by Phase 123 synonymy (texanus → subtilior).
  const KNOWN_CHECKLIST_ONLY_SLUG = 'Andrena/aculeata';

  test('emits page for a known checklist-only species with no atlas link (SPEC-01)', () => {
    const html = readFileSync(resolve(ROOT, `_site/species/${KNOWN_CHECKLIST_ONLY_SLUG}/index.html`), 'utf-8');
    expect(html).not.toMatch(/View \d+ occurrences on the atlas/);  // hidden for zero-occ species
    expect(html).toContain('Bartholomew et al. 2024');              // attribution line shown
    expect(html).toMatch(/src="\/data\/species-maps\//);            // SVG map shown
  });

  // D-14's "checklist only" index badge was dropped in the Phase 133 tree
  // rewrite — the index now shows per-node specimen/observation counts and a
  // Map link, with no checklist badge. The checklist-only signal survives on
  // the species detail page (covered by the D-15 test above).

  // Phase 147 — app build output. The app moved from /app/ to / in
  // ADR 0029; `/app/` is now a redirect stub in its deprecation window.

  test('emits _site/index.html', () => {
    expect(existsSync(resolve(ROOT, '_site/index.html'))).toBe(true);
  });

  test('/app/ is gone — the deprecation window closed (ADR 0029)', () => {
    // The redirect stub existed only until the one installed PWA migrated. Two
    // on-device reports confirmed a single registration at the root scope and no
    // /app/, so it was deleted 2026-08-04.
    //
    // Asserted rather than merely deleted, because the failure mode of a partial
    // revert is a SECOND working copy of the app at a second URL — which is the
    // split this ADR closed, quietly reopening. `_site/app` must not come back by
    // any route: a template, a passthrough, or a stray asset.
    expect(existsSync(resolve(ROOT, '_site/app')),
      '_site/app is back — the two-surface split must not reopen').toBe(false);
  });

  test('_site/index.html references a hashed app entry chunk', () => {
    const html = readFileSync(resolve(ROOT, '_site/index.html'), 'utf-8');
    // beeatlas-d3y: Eleventy now emits this tag itself from the Vite manifest (the
    // viteAssets shortcode), so the chunk is named after the ENTRY MODULE
    // (src/app-entry.ts -> assets/app-entry-<hash>.js). Under the old plugin's MPA
    // mode it was named after the HTML page path (assets/app/index-<hash>.js).
    // Pin the app-entry- prefix, as the index- pin did, so an async or vendor chunk
    // cannot satisfy this — it must be the entry (WR-02).
    const m = html.match(/<script type="module"[^>]*src="(\/assets\/app-entry-[^"]+\.js)"/);
    expect(m, `no hashed app-entry module script in _site/index.html:\n${html}`).toBeTruthy();
    // And the chunk must actually exist. This is the half the old regex could not
    // check: the tag is now rendered from a STASHED manifest that outlives a build,
    // so a stale manifest would emit a perfectly well-formed reference to a chunk
    // this build never wrote.
    expect(
      existsSync(resolve(ROOT, '_site' + m![1]!)),
      `index.html references ${m![1]!}, which is not in _site/ — stale Vite manifest?`,
    ).toBe(true);
  });

  test('_site/sw.js exists at unhashed stable URL', () => {
    expect(existsSync(resolve(ROOT, '_site/sw.js'))).toBe(true);
  });

  // Phase 148 — precache manifest verification

  test('_site/sw.js contains an injected precache manifest (OFF-01, criterion 1)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    // If self.__WB_MANIFEST appears verbatim, injection failed
    expect(sw).not.toContain('self.__WB_MANIFEST');
    // The Workbox injectManifest step emits a JSON-format precache manifest
    // with quoted keys: "url":"<path>". Match this to confirm injection occurred.
    expect(sw).toMatch(/"url":"[^"]+"/);
  });

  test('every precached URL in _site/sw.js exists as a file in _site/ (OFF-01, criterion 4)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    // The Workbox injectManifest step emits JSON-format entries: "url":"/path"
    const urlMatches = [...sw.matchAll(/"url":"([^"]+)"/g)].map(m => m[1]!);
    expect(urlMatches.length, 'no precache URLs found — manifest may not have been injected').toBeGreaterThan(0);
    for (const url of urlMatches) {
      const filePath = resolve(ROOT, '_site' + url);
      expect(existsSync(filePath), `precached URL missing from _site/: ${url}`).toBe(true);
    }
  });

  test('precache manifest includes the wa-sqlite .wasm engine binary (PWA-03 offline cold-start regression)', () => {
    // real-device UAT: the SQL worker cannot initialize offline unless
    // the wa-sqlite WebAssembly binary is precached. Without it, tablesReady never
    // resolves and the "Loading…" curtain hangs forever on offline cold-start.
    // The precache glob in vite.sw.config.ts must keep `wasm` in its extension list.
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    const urlMatches = [...sw.matchAll(/"url":"([^"]+)"/g)].map(m => m[1]!);
    const wasmEntries = urlMatches.filter(u => u.endsWith('.wasm'));
    expect(wasmEntries.length, 'no .wasm precached — offline SQL engine init will hang (see vite.sw.config.ts globPatterns)').toBeGreaterThan(0);
    expect(wasmEntries.some(u => /wa-sqlite/.test(u)), `wa-sqlite wasm not precached; entries: ${wasmEntries.join(', ')}`).toBe(true);
  });

  test('vite.sw.config.ts sets maximumFileSizeToCacheInBytes >= 30000000 (OFF-01, criterion 3)', () => {
    // beeatlas-d3y: the whole vite-plugin-pwa block moved out of eleventy.config.js
    // into the second Vite pass. This is a BUILD-TIME option, so it leaves no trace
    // in the emitted sw.js — the config file is the only witness there is.
    const config = readFileSync(resolve(ROOT, 'vite.sw.config.ts'), 'utf-8');
    const match = config.match(/maximumFileSizeToCacheInBytes\s*:\s*([\d_]+)/);
    expect(match, 'maximumFileSizeToCacheInBytes not found in vite.sw.config.ts').toBeTruthy();
    const value = parseInt(match![1]!.replace(/_/g, ''), 10);
    expect(value).toBeGreaterThanOrEqual(30_000_000);
  });

  // Phase 149 — runtime cache assertions

  test('_site/sw.js registers a runtime CacheFirst route for /data/', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    // Rollup preserves string literals like cache names through minification
    expect(sw).toContain('data-artifacts');
    // The .db route matcher substring is preserved in the Rollup output
    expect(sw).toMatch(/\.db/);
    // The .geojson route matcher substring is preserved
    expect(sw).toMatch(/\.geojson/);
  });

  test('_site/sw.js calls skipWaiting only inside a message handler', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    const skipMatches = [...sw.matchAll(/skipWaiting/g)];
    expect(skipMatches.length).toBeGreaterThan(0);
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).not.toContain('clients.claim');
  });

  test('workbox-strategies, workbox-expiration, workbox-cacheable-response in package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(allDeps['workbox-strategies']).toBeDefined();
    expect(allDeps['workbox-expiration']).toBeDefined();
    expect(allDeps['workbox-cacheable-response']).toBeDefined();
  });

  test('_site/sw.js registers NetworkFirst route for /data/manifest.json', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    expect(sw).toContain('data-manifest');
    expect(sw).toMatch(/manifest\.json/);
    expect(sw).toMatch(/NetworkFirst|networkTimeout/);
  });

  test('workbox-window is a runtime dependency', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['workbox-window']).toBeDefined();
    expect(pkg.devDependencies?.['workbox-window']).toBeUndefined();
  });

  // Phase 151 — PWA manifest assertions (PWA-01, D-01..D-06)

  test('emits _site/manifest.webmanifest with required keys', () => {
    const manifestPath = resolve(ROOT, '_site/pwa/manifest.webmanifest');
    expect(existsSync(manifestPath), '_site/pwa/manifest.webmanifest missing').toBe(true);
    const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(m.name).toBe('Washington Bee Atlas');
    expect(m.short_name).toBe('BeeAtlas');
    // ADR 0029. `start_url` was '/app/index.html' — explicit, because CloudFront's
    // OAC 403'd the trailing-slash directory URL. Apache serves `/` fine, and the
    // precache answers it through workbox's directoryIndex.
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toBe('#080d26');          // D-03
    expect(m.background_color).toBe('#080d26');     // D-03
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(
      m.icons.some((i: { purpose?: string }) => (i.purpose ?? '').includes('maskable')),
      'no maskable icon declared'
    ).toBe(true);
    // Verify every icon file actually exists on disk
    for (const icon of m.icons) {
      expect(
        existsSync(resolve(ROOT, '_site' + icon.src)),
        `icon declared in manifest but missing on disk: ${icon.src}`
      ).toBe(true);
    }
  });

  test('_site/index.html links the manifest and apple-touch-icon', () => {
    const html = readFileSync(resolve(ROOT, '_site/index.html'), 'utf-8');
    expect(html).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/pwa\/manifest\.webmanifest"/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
    expect(html).toMatch(/rel="apple-touch-icon"/);
  });

  // This assertion used to read the other way round — '_site/index.html does NOT
  // link a manifest' was the no-PWA-on-/ guarantee, back when / and /app/ were two
  // pages. ADR 0029 merged them, so the guarantee it protected is gone and its
  // REPLACEMENT is what needs pinning: the reading surface must not become the app.
  //
  // A species page that grew a manifest link, or an app entry, would be a PWA a
  // reader never asked for — 3.3 MB of precache and a ~34.8 MB prime against a page
  // that loads 18 KB of JS. That is the trade the whole ADR turns on, and it is one
  // careless <link> or one line in rollupOptions.input away.
  test('a species page is not the app (ADR 0029, replacing the no-PWA-on-/ guarantee)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/Bombus/mixtus/index.html'), 'utf-8');
    expect(html, 'a read-path page must not declare itself installable').not.toMatch(/rel="manifest"/);
    expect(html, 'a read-path page must not load the app entry').not.toMatch(/assets\/app-entry-/);
    expect(html, 'a read-path page must not mount the map').not.toContain('<bee-atlas>');
  });

  test('nothing but the app entry can register a service worker (ADR 0029)', () => {
    // The structural half of the same guarantee, checked in the BUILT bundles rather
    // than in the import graph — minification is exactly where a source-level claim
    // stops being evidence. Workbox's registration surface must appear in the app
    // entry's chunk and nowhere a static page can reach.
    const assets = resolve(ROOT, '_site/assets');
    const registrars = readdirSync(assets)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /serviceWorker|workbox/i.test(readFileSync(resolve(assets, f), 'utf-8')));
    expect(registrars.length, `expected exactly one SW-registering chunk, got: ${registrars.join(', ')}`).toBe(1);
    expect(registrars[0]).toMatch(/^app-entry-/);
  });

  // pinned a Mapbox performance cache in the BUILT service worker: the
  // api.mapbox.com route, its mapbox-basemap cacheName, the /map-sessions/ billing
  // exclusion, and a maxAgeSeconds inside the 30-day ToS ceiling. Every one of those
  // was a licensing obligation under Mapbox's Product Terms §2.8.1 (docs/adr/0001).
  //
  // We do not serve Mapbox tiles any more (beeatlas-q73 / ADR 0026), so none of it
  // governs anything — and asserting it kept the DEAD ROUTE ALIVE: these tests were
  // the reason to think twice about deleting it. Replaced with the current contract,
  // still asserted against the BUILT worker, because the built worker is what ships
  // and minification is exactly where a source-level assertion stops being evidence.

  test('_site/sw.js has no Mapbox route left (beeatlas-mas)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    expect(sw).not.toContain('api.mapbox.com');
    expect(sw).not.toContain('events.mapbox.com');
    expect(sw).not.toContain('/map-sessions/');
  });

  test('_site/sw.js deletes the orphaned mapbox-basemap cache on activate (beeatlas-mas)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/sw.js'), 'utf-8');
    // A device that used the app before 2026-08-01 still holds up to 150 tile
    // responses in a cache no route will ever read again. The ONLY surviving mention
    // of that name must be the delete — anything else is a route come back to life.
    expect(sw).toContain('mapbox-basemap');
    expect(sw.match(/mapbox-basemap/g)).toHaveLength(1);
    expect(sw).toMatch(/addEventListener\(`activate`/);
    expect(sw).toMatch(/caches\.delete\(`mapbox-basemap`\)/);
  });

  test('154-01-04: the map keeps its attribution control, and both sources supply a notice', () => {
    // Read the source (not the build output) — attributionControl is a constructor
    // option, not a runtime string literal that survives bundling.
    //
    // This assertion used to read `attributionControl: true`, which is a Mapbox
    // spelling; MapLibre types the option as `false | AttributionControlOptions`,
    // so the literal had to go (beeatlas-q73). The REQUIREMENT did not — it got
    // stronger. Mapbox's §1.4 was a licence term; the basemap is now OSM data under
    // ODbL, where attribution is the licence's core condition, and the Bee Atlas
    // notice on the occurrence data is a separate obligation of our own.
    //
    // So this pins the two things that can silently drop the notices: turning the
    // control off, and a source that carries no `attribution` for it to display.
    const src = readFileSync(resolve(ROOT, 'src/bee-map.ts'), 'utf-8');
    expect(src).toMatch(/attributionControl:\s*\{/);
    expect(src).not.toMatch(/attributionControl:\s*false/);
    // The occurrence source names the Washington Bee Atlas...
    expect(src).toContain('Washington Bee Atlas');
    // ...and the basemap source passes the manifest's attribution through rather
    // than dropping it (the OSM/Protomaps notice; see src/basemap-style.ts).
    const style = readFileSync(resolve(ROOT, 'src/basemap-style.ts'), 'utf-8');
    expect(style).toMatch(/attribution:\s*entry\.attribution/);
  });

  test('154-02-01: docs/adr/0001-mapbox-basemap-cache.md exists and contains ToS analysis', () => {
    const adrPath = resolve(ROOT, 'docs/adr/0001-mapbox-basemap-cache.md');
    expect(existsSync(adrPath)).toBe(true);
    const adr = readFileSync(adrPath, 'utf-8');
    // §2.8.1 is the on-device performance cache exception; must appear in the compliance checklist
    expect(adr).toContain('2.8.1');
    // StaleWhileRevalidate is the chosen strategy; must be named in the Decision section
    expect(adr).toContain('StaleWhileRevalidate');
  });

  // A test requiring CLAUDE.md to name `mapbox-basemap` and link ADR 0001 lived here.
  // It dated from the era when we SERVED Mapbox tiles and the ADR carried the ToS
  // compliance analysis that made the cache lawful; CLAUDE.md pointing at it was part
  // of the obligation. We serve no Mapbox tiles (ADR 0026 supersedes 0001), so the
  // obligation is gone and the assertion only forced a line into the one file that is
  // loaded into context on every session.
  //
  // Nothing it protected is unguarded: the orphaned-cache delete is asserted against
  // the BUILT worker just above, ADR 0001's retention is asserted in the test before
  // that, and "mark superseded records, don't delete them" is a standing convention in
  // CLAUDE.md's Product Memory rather than something to re-pin per record.
});

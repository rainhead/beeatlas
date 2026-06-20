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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_BUILD = process.env.VITEST_SKIP_BUILD === '1';

describe.skipIf(SKIP_BUILD)('build output (PAGE-07, PAGE-09)', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 180_000);

  test('emits _site/species/index.html as a tree with family nodes (IDX-01, URL-05)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/class="tree-node tree-node--family"/);
    expect(html).toMatch(/data-rank="family"/);
    expect(html).not.toContain('<bee-species-page');
  });

  test('index page has #species-filter input (IDX-02)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/id="species-filter"/);
  });

  test('index page has genus links to /species/{Genus}/index.html (IDX-03)', () => {
    const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
    expect(html).toMatch(/href="\/species\/Agapostemon\/index\.html"/);
  });

  test('index page has species links to /species/{Genus}/{epithet}/index.html (IDX-04)', () => {
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

  test('emits a species-index chunk distinct from the main / SPA entry (Phase 96, IDX-02)', () => {
    const speciesChunk = findSpeciesChunk();
    expect(speciesChunk, 'no species-index chunk emitted under _site/assets/').toBeDefined();
    // The main `/` SPA entry chunk must be built and referenced by _site/index.html.
    // Phase 147 added the /app MPA entry, which renamed the root entry chunk from
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

  test('species-index chunk does NOT contain mapboxgl symbol (Phase 96)', () => {
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

  test('every <img> on a species page has loading="lazy" (PAGE-07 carry-forward, SPE-02/SPE-03)', () => {
    const html = readFileSync(
      resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
    );
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
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

  // Phase 113 — checklist-only species page tests (SPEC-01, SPEC-03, SPEC-04, SPEC-05, D-06, D-08, D-14, D-15)

  // Andrena/aculeata is the alphabetically-first confirmed checklist-only species
  // (occurrence_count === 0 && on_checklist === true in species.json from the pipeline).
  // Previously Agapostemon/texanus; replaced by Phase 123 synonymy (texanus → subtilior).
  const KNOWN_CHECKLIST_ONLY_SLUG = 'Andrena/aculeata';

  test('emits page for a known checklist-only species with no atlas link (D-15, SPEC-01)', () => {
    const html = readFileSync(resolve(ROOT, `_site/species/${KNOWN_CHECKLIST_ONLY_SLUG}/index.html`), 'utf-8');
    expect(html).not.toMatch(/View \d+ occurrences on the atlas/);  // D-15: hidden for zero-occ species
    expect(html).toContain('Bartholomew et al. 2024');              // D-08: attribution line shown
    expect(html).toMatch(/src="\/data\/species-maps\//);            // D-06: SVG map shown
  });

  // D-14's "checklist only" index badge was dropped in the Phase 133 tree
  // rewrite — the index now shows per-node specimen/observation counts and a
  // Map link, with no checklist badge. The checklist-only signal survives on
  // the species detail page (covered by the D-15 test above).

  // Phase 147 — /app route build output (ROUTE-01)

  test('emits _site/app/index.html (ROUTE-01)', () => {
    expect(existsSync(resolve(ROOT, '_site/app/index.html'))).toBe(true);
  });

  test('_site/app/index.html references a hashed app entry chunk (ROUTE-01)', () => {
    const html = readFileSync(resolve(ROOT, '_site/app/index.html'), 'utf-8');
    // Vite rewrites /src/app-entry.ts -> /assets/app/index-<hash>.js
    // (MPA mode: chunk named from HTML page path, not entry module name).
    // Pin the index- prefix so async/vendor chunks under /assets/app/ can't
    // satisfy this — it must be the rewritten module entry (WR-02).
    expect(html).toMatch(/src="\/assets\/app\/index-[^"]+\.js"/);
  });

  test('_site/app/sw.js exists at unhashed stable URL (D-04)', () => {
    expect(existsSync(resolve(ROOT, '_site/app/sw.js'))).toBe(true);
  });

  // Phase 148 — precache manifest verification (OFF-01)

  test('_site/app/sw.js contains an injected precache manifest (OFF-01, criterion 1)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
    // If self.__WB_MANIFEST appears verbatim, injection failed
    expect(sw).not.toContain('self.__WB_MANIFEST');
    // The Workbox injectManifest step emits a JSON-format precache manifest
    // with quoted keys: "url":"<path>". Match this to confirm injection occurred.
    expect(sw).toMatch(/"url":"[^"]+"/);
  });

  test('every precached URL in _site/app/sw.js exists as a file in _site/ (OFF-01, criterion 4)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
    // The Workbox injectManifest step emits JSON-format entries: "url":"/path"
    const urlMatches = [...sw.matchAll(/"url":"([^"]+)"/g)].map(m => m[1]!);
    expect(urlMatches.length, 'no precache URLs found — manifest may not have been injected').toBeGreaterThan(0);
    for (const url of urlMatches) {
      const filePath = resolve(ROOT, '_site' + url);
      expect(existsSync(filePath), `precached URL missing from _site/: ${url}`).toBe(true);
    }
  });

  test('precache manifest includes the wa-sqlite .wasm engine binary (PWA-03 offline cold-start regression)', () => {
    // Phase 151 real-device UAT: the SQL worker cannot initialize offline unless
    // the wa-sqlite WebAssembly binary is precached. Without it, tablesReady never
    // resolves and the "Loading…" curtain hangs forever on offline cold-start.
    // The precache glob in eleventy.config.js must keep `wasm` in its extension list.
    const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
    const urlMatches = [...sw.matchAll(/"url":"([^"]+)"/g)].map(m => m[1]!);
    const wasmEntries = urlMatches.filter(u => u.endsWith('.wasm'));
    expect(wasmEntries.length, 'no .wasm precached — offline SQL engine init will hang (see eleventy.config.js globPatterns)').toBeGreaterThan(0);
    expect(wasmEntries.some(u => /wa-sqlite/.test(u)), `wa-sqlite wasm not precached; entries: ${wasmEntries.join(', ')}`).toBe(true);
  });

  test('eleventy.config.js sets maximumFileSizeToCacheInBytes >= 30000000 (OFF-01, criterion 3)', () => {
    const config = readFileSync(resolve(ROOT, 'eleventy.config.js'), 'utf-8');
    const match = config.match(/maximumFileSizeToCacheInBytes\s*:\s*([\d_]+)/);
    expect(match, 'maximumFileSizeToCacheInBytes not found in eleventy.config.js').toBeTruthy();
    const value = parseInt(match![1]!.replace(/_/g, ''), 10);
    expect(value).toBeGreaterThanOrEqual(30_000_000);
  });

  // Phase 149 — runtime cache assertions (OFF-02, OFF-03, CACHE-05)

  test('_site/app/sw.js registers a runtime CacheFirst route for /data/ (OFF-02)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
    // Rollup preserves string literals like cache names through minification
    expect(sw).toContain('data-artifacts');
    // The .db route matcher substring is preserved in the Rollup output
    expect(sw).toMatch(/\.db/);
    // The .geojson route matcher substring is preserved
    expect(sw).toMatch(/\.geojson/);
  });

  test('_site/app/sw.js calls skipWaiting only inside a message handler (D-16)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
    const skipMatches = [...sw.matchAll(/skipWaiting/g)];
    expect(skipMatches.length).toBeGreaterThan(0);
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).not.toContain('clients.claim');
  });

  test('workbox-strategies, workbox-expiration, workbox-cacheable-response in package.json (OFF-02)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(allDeps['workbox-strategies']).toBeDefined();
    expect(allDeps['workbox-expiration']).toBeDefined();
    expect(allDeps['workbox-cacheable-response']).toBeDefined();
  });

  test('_site/app/sw.js registers NetworkFirst route for /data/manifest.json (D-08)', () => {
    const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
    expect(sw).toContain('data-manifest');
    expect(sw).toMatch(/manifest\.json/);
    expect(sw).toMatch(/NetworkFirst|networkTimeout/);
  });

  test('workbox-window is a runtime dependency (D-13)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['workbox-window']).toBeDefined();
    expect(pkg.devDependencies?.['workbox-window']).toBeUndefined();
  });

  // Phase 151 — PWA manifest assertions (PWA-01, D-01..D-06, D-13)

  test('emits _site/app/manifest.webmanifest with required keys (PWA-01, D-13)', () => {
    const manifestPath = resolve(ROOT, '_site/app/manifest.webmanifest');
    expect(existsSync(manifestPath), '_site/app/manifest.webmanifest missing').toBe(true);
    const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(m.name).toBe('Washington Bee Atlas');
    expect(m.short_name).toBe('BeeAtlas');
    expect(m.start_url).toBe('/app/index.html');   // D-01 — explicit, do NOT "fix" to /app
    expect(m.scope).toBe('/app/');
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
    // Verify every icon file actually exists on disk (D-06/D-07)
    for (const icon of m.icons) {
      expect(
        existsSync(resolve(ROOT, '_site' + icon.src)),
        `icon declared in manifest but missing on disk: ${icon.src}`
      ).toBe(true);
    }
  });

  // Wave 0 RED: link assertions pass only after Plan 02 adds <link rel="manifest">
  // and iOS meta to _pages/app/index.html. Expected to fail until Plan 02 merges.

  test('_site/app/index.html links the manifest and apple-touch-icon (PWA-01, D-04)', () => {
    const html = readFileSync(resolve(ROOT, '_site/app/index.html'), 'utf-8');
    expect(html).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/app\/manifest\.webmanifest"/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
    expect(html).toMatch(/rel="apple-touch-icon"/);
  });

  test('_site/index.html does NOT link a manifest (no-PWA-on-/ guarantee, D-04)', () => {
    const html = readFileSync(resolve(ROOT, '_site/index.html'), 'utf-8');
    expect(html).not.toMatch(/rel="manifest"/);
  });
});

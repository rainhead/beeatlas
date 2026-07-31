import { describe, test, expect } from 'vitest';
// @ts-expect-error -- .js source has no .d.ts; named exports are the contract
import { tagsFromManifest, devAssetTags, MANIFEST_PATH } from '../../lib/vite-manifest.js';

// beeatlas-d3y / ADR 0016: Eleventy emits the hashed asset tags itself, from the Vite
// manifest. These assert the EMITTED HTML — the thing that actually ships — against a
// fixture manifest, rather than asserting that a template contains a shortcode call.
//
// Shaped like a real manifest: taxon-page imports a shared `decorate` chunk, both it
// and bee-header pull in the same stylesheet, and one entry is CSS-only.
const MANIFEST = {
  'src/entries/taxon-page.ts': {
    file: 'assets/taxon-page-AAAA1111.js',
    isEntry: true,
    imports: ['_decorate-BBBB2222.js'],
    css: ['assets/taxon-pages-DDDD4444.css'],
  },
  'src/entries/bee-header.ts': {
    file: 'assets/bee-header-EEEE5555.js',
    isEntry: true,
    imports: ['_decorate-BBBB2222.js'],
  },
  '_decorate-BBBB2222.js': {
    file: 'assets/decorate-BBBB2222.js',
    imports: ['_runtime-CCCC3333.js'],
    css: ['assets/index-FFFF6666.css'],
  },
  '_runtime-CCCC3333.js': { file: 'assets/runtime-CCCC3333.js' },
  'src/index.css': { file: 'assets/index-FFFF6666.css', isEntry: true },
};

describe('tagsFromManifest — production tags', () => {
  test('a JS entry loads as a module script at its hashed path', () => {
    expect(tagsFromManifest(MANIFEST, 'src/entries/taxon-page.ts')).toContain(
      '<script type="module" crossorigin src="/assets/taxon-page-AAAA1111.js"></script>',
    );
  });

  test('transitive imports are modulepreloaded, deepest first', () => {
    const tags = tagsFromManifest(MANIFEST, 'src/entries/taxon-page.ts');
    const runtime = tags.indexOf('/assets/runtime-CCCC3333.js');
    const decorate = tags.indexOf('/assets/decorate-BBBB2222.js');
    expect(runtime).toBeGreaterThan(-1);
    expect(decorate).toBeGreaterThan(-1);
    // runtime is imported BY decorate, so it must be listed first
    expect(runtime).toBeLessThan(decorate);
    expect(tags).toContain('<link rel="modulepreload" crossorigin href="/assets/decorate-BBBB2222.js">');
  });

  test("stylesheets include those of the entry's imports, not just its own", () => {
    const tags = tagsFromManifest(MANIFEST, 'src/entries/taxon-page.ts');
    // its own…
    expect(tags).toContain('<link rel="stylesheet" crossorigin href="/assets/taxon-pages-DDDD4444.css">');
    // …and the one that only the shared decorate chunk declares. Missing this is how a
    // page renders unstyled while every script loads fine.
    expect(tags).toContain('<link rel="stylesheet" crossorigin href="/assets/index-FFFF6666.css">');
  });

  test('a stylesheet reached by two paths is emitted once', () => {
    const tags = tagsFromManifest(MANIFEST, 'src/entries/taxon-page.ts');
    const hits = tags.split('/assets/index-FFFF6666.css').length - 1;
    expect(hits).toBe(1);
  });

  test('a CSS entry emits a stylesheet and no script', () => {
    const tags = tagsFromManifest(MANIFEST, 'src/index.css');
    expect(tags).toBe('<link rel="stylesheet" crossorigin href="/assets/index-FFFF6666.css">');
    expect(tags).not.toContain('<script');
  });

  test('an unlisted entry throws, naming the known entries and the fix', () => {
    expect(() => tagsFromManifest(MANIFEST, 'src/entries/nope.ts')).toThrow(
      /no entry "src\/entries\/nope\.ts"/,
    );
    // The render IS the drift check between templates and rollupOptions.input, so the
    // error has to say where to add the module.
    expect(() => tagsFromManifest(MANIFEST, 'src/entries/nope.ts')).toThrow(
      /rollupOptions\.input/,
    );
  });
});

describe('devAssetTags — dev server tags', () => {
  test('serves the module from source, with the HMR client ahead of it', () => {
    const tags = devAssetTags('src/entries/taxon-page.ts');
    expect(tags.indexOf('/@vite/client')).toBeLessThan(tags.indexOf('/src/entries/taxon-page.ts'));
    expect(tags).toContain('<script type="module" src="/src/entries/taxon-page.ts"></script>');
  });

  test('a CSS entry is a stylesheet link in dev too', () => {
    expect(devAssetTags('src/index.css')).toContain('<link rel="stylesheet" href="/src/index.css">');
  });
});

describe('manifest location (ADR 0016)', () => {
  test('lives outside _site and outside node_modules', () => {
    // Outside _site so build metadata is never published; outside node_modules so
    // `npm ci` cannot destroy it — a bare `eleventy` rerun depends on it surviving.
    expect(MANIFEST_PATH).not.toMatch(/^_site\//);
    expect(MANIFEST_PATH).not.toMatch(/node_modules/);
  });
});

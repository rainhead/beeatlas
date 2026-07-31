import { test, expect, describe } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- .mjs source has no .d.ts; named exports are the contract (mirrors seed-species-photos.test.ts)
import { validateSpeciesPhotos, LICENSE_WHITELIST } from '../../scripts/validate-species.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

const SPECIES_JSON = [
  { scientificName: 'Osmia lignaria', canonical_name: 'osmia lignaria', on_checklist: true, occurrence_count: 5, slug: 'Osmia/lignaria' },
];

const validPhoto = (overrides: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = {
    observation_id: 33289514,
    photo_id: 52274835,
    url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/52274835/large.jpg',
    caption: '',
    attribution: '(c) Test User, some rights reserved (CC BY)',
    license: 'cc-by',
    ordering: 1,
    ...overrides,
  };
  return Object.entries(base)
    .map(([k, v]) => typeof v === 'string' ? `${k} = ${JSON.stringify(v)}` : `${k} = ${v}`)
    .join('\n');
};

const tomlFor = (photoLines: string) => `
[species."Osmia lignaria"]
description = ""
[[species."Osmia lignaria".photos]]
${photoLines}
`;

describe('validateSpeciesPhotos', () => {
  test('rejects all-rights-reserved license (PHOTO-02)', () => {
    const { errors } = validateSpeciesPhotos(tomlFor(validPhoto({ license: 'all-rights-reserved' })), SPECIES_JSON);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('invalid license');
    expect(errors[0]).toContain('52274835');
  });

  test('rejects missing license field (PHOTO-02)', () => {
    const photoLines = validPhoto().split('\n').filter(l => !l.startsWith('license =')).join('\n');
    const { errors } = validateSpeciesPhotos(tomlFor(photoLines), SPECIES_JSON);
    expect(errors[0]).toContain('invalid license');
  });

  test('rejects cc-by-nc-nd (not in whitelist) (PHOTO-02)', () => {
    const { errors } = validateSpeciesPhotos(tomlFor(validPhoto({ license: 'cc-by-nc-nd' })), SPECIES_JSON);
    expect(errors[0]).toContain('invalid license');
  });

  test('accepts all 5 whitelisted licenses (PHOTO-02)', () => {
    for (const license of ['cc0', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc-by-nc-sa']) {
      const { errors } = validateSpeciesPhotos(tomlFor(validPhoto({ license })), SPECIES_JSON);
      expect(errors, `license ${license}`).toEqual([]);
    }
  });

  test('rejects missing attribution for cc-by photo (PHOTO-03)', () => {
    const photoLines = validPhoto().split('\n').filter(l => !l.startsWith('attribution =')).join('\n');
    const { errors } = validateSpeciesPhotos(tomlFor(photoLines), SPECIES_JSON);
    expect(errors[0]).toContain('missing attribution');
  });

  test('rejects empty-string attribution for cc-by photo (PHOTO-03)', () => {
    const { errors } = validateSpeciesPhotos(tomlFor(validPhoto({ attribution: '' })), SPECIES_JSON);
    expect(errors[0]).toContain('missing attribution');
  });

  test('accepts cc0 photo with no attribution (PHOTO-03)', () => {
    const photoLines = validPhoto({ license: 'cc0' }).split('\n').filter(l => !l.startsWith('attribution =')).join('\n');
    const { errors } = validateSpeciesPhotos(tomlFor(photoLines), SPECIES_JSON);
    expect(errors).toEqual([]);
  });

  test('warns on unknown scientificName, exit 0 (PHOTO-05)', () => {
    const unknownToml = tomlFor(validPhoto()).replace('Osmia lignaria', 'Notreal genus');
    const { errors, warnings } = validateSpeciesPhotos(unknownToml, SPECIES_JSON);
    expect(errors).toEqual([]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('Notreal genus');
  });

  test('skips unknown-name check when species.json is null (Pitfall 7)', () => {
    const unknownToml = tomlFor(validPhoto()).replace('Osmia lignaria', 'Notreal genus');
    const { warnings } = validateSpeciesPhotos(unknownToml, null);
    expect(warnings).toEqual([]);
  });

  test('still errors on bad license when species.json is null', () => {
    const { errors } = validateSpeciesPhotos(tomlFor(validPhoto({ license: 'all-rights-reserved' })), null);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('accepts a valid manifest (smoke)', () => {
    const { errors, warnings } = validateSpeciesPhotos(tomlFor(validPhoto()), SPECIES_JSON);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  test('LICENSE_WHITELIST exports exactly the 5 allowed values', () => {
    expect([...LICENSE_WHITELIST].sort()).toEqual(['cc-by', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-sa', 'cc0']);
  });

  test('validateSpeciesPhotos is exported and callable', () => {
    expect(typeof validateSpeciesPhotos).toBe('function');
  });
});

describe('validate-species npm script (PHOTO-06)', () => {
  test('npm run validate-species exits 0 on the committed manifest', () => {
    const result = execSync('npm run validate-species --silent', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(result).toMatch(/ok content\/species-photos\.toml/);
  });

  test('npm run validate-species exits 1 when manifest contains a bad license', () => {
    const rigged = `
[species."Osmia testfaker"]
description = ""
[[species."Osmia testfaker".photos]]
observation_id = 1
photo_id = 1
url = "https://example.com/large.jpg"
caption = ""
attribution = "(c) Test"
license = "all-rights-reserved"
ordering = 1
`;
    const tmpDir = mkdtempSync(join(tmpdir(), 'validate-species-'));
    const tmpManifest = join(tmpDir, 'species-photos.toml');
    writeFileSync(tmpManifest, rigged, 'utf-8');
    try {
      let exitCode = 0;
      try {
        execSync(`node scripts/validate-species.mjs ${tmpManifest}`, {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
          stdio: 'pipe',
        });
      } catch (e: any) {
        exitCode = e.status ?? 1;
      }
      expect(exitCode).toBe(1);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  test('package.json build script invokes validate-species in the correct order', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts['validate-species']).toBe('node scripts/validate-species.mjs');
    // Order: validate-species -> validate-db -> typecheck -> build:app -> eleventy
    //        -> build:sw -> validate-bundle-size
    // v3.4 CUTOVER-03: validate-schema retired (dbt contract enforces the schema)
    // beeatlas-d3y: the ordering around eleventy is load-bearing, not cosmetic.
    // build:app must precede it (Eleventy reads the stashed Vite manifest at
    // data-load time to emit hashed asset URLs) and build:sw must follow it
    // (vite-plugin-pwa's injectManifest globs the built site, and app/index.html
    // is Eleventy's output).
    expect(pkg.scripts.validate).toBe('npm run validate-species && npm run validate-db && npm run typecheck');
    expect(pkg.scripts.build).toBe('npm run validate && npm run build:app && eleventy && npm run build:sw && npm run validate-bundle-size');
    // beeatlas-bon: build:app is now a gate that runs build:bundle only when the
    // bundle's inputs moved. The gate MUST stay in the `build` chain rather than being
    // hoisted out, because on a skip it also performs the cleaning that Vite's
    // emptyOutDir would have done — without it a full build stops deleting from _site.
    expect(pkg.scripts['build:app']).toBe('node scripts/build-app.mjs');
    expect(pkg.scripts['build:bundle']).toBe('vite build');
    expect(pkg.scripts['build:sw']).toBe('vite build -c vite.sw.config.ts');
    // Model Y: the postbuild lifecycle hashes the runtime data artifacts into
    // _site/data and writes the slim manifest (scripts/postbuild-data.mjs), then
    // records the build receipt a scoped render checks (beeatlas-4oa).
    expect(pkg.scripts.postbuild).toBe('node scripts/postbuild-data.mjs && node scripts/build-receipt.mjs --write');
  });

  // beeatlas-4oa: the note-publish render path. Its SHAPE is the safety property,
  // so it is pinned here beside the full build's.
  test('build:content renders without touching the app bundle', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts['build:content']).toBe('npm run validate && eleventy && node scripts/postbuild-data.mjs');
    // build:app must NEVER appear here. It runs Vite with emptyOutDir:true (ADR
    // 0016), which deletes _site — and a scoped render only rewrites a handful of
    // pages, so it would publish a site consisting of those pages and nothing else.
    expect(pkg.scripts['build:content']).not.toMatch(/build:app/);
    // Nor build:sw: the service worker precaches the bundle, which a note cannot change.
    expect(pkg.scripts['build:content']).not.toMatch(/build:sw/);
    // The receipt attests to a FULL build; a scoped render must not refresh it, or
    // it would vouch for a tree it only partly produced.
    expect(pkg.scripts['build:content']).not.toMatch(/build-receipt/);
  });

  // beeatlas-bon: the gate's WIRING only. Its delete decision — which files a skip
  // removes — is asserted behaviourally in src/tests/bundle-assets.test.ts, and the
  // whole-tree equivalence is verified out-of-band by byte-comparing a gated-skip build
  // against a vite-ran build. What is pinned here is what those properties depend on
  // structurally, and nothing more: matching an identifier proves it is present, not
  // that it is reached.
  test('the bundle gate wraps vite rather than replacing it', () => {
    const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8'));
    // The gate shells build:bundle on a rebuild, so removing that script breaks it.
    expect(pkg.scripts['build:bundle']).toBe('vite build');
    const gate = readFileSync(resolve(REPO_ROOT, 'scripts/build-app.mjs'), 'utf-8');
    expect(gate).toContain('build:bundle');
    // The two side effects of `vite build` that a skip has to impersonate: cleaning
    // _site (without it a full build stops deleting anything, and a page dropped from
    // the data lives forever, since merge-swap rsyncs pages with --delete), and
    // refreshing the reused assets' mtimes (without that merge-swap's `-mtime +30`
    // prune eventually deletes the live bundle). Both per ADR 0019.
    expect(gate).toMatch(/cleanExceptAssets\(\)/);
    expect(gate).toMatch(/refreshAssetMtimes\(\)/);
    // And it must not leave an emptied directory behind: validate-bundle-size checks
    // existsSync(_site/assets/species/) BEFORE falling back to the flat species-*.js
    // shape, so an empty species/ sends it down a branch with no chunks in it and fails
    // the build. Vite would have left no such directory.
    expect(gate).toMatch(/pruneEmptyDirs\(ASSETS\)/);
  });
});

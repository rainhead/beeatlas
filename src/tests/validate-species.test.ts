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
    // Order: validate-species -> validate-db -> typecheck -> eleventy -> validate-bundle-size
    // v3.4 CUTOVER-03: validate-schema retired (dbt contract enforces the schema)
    expect(pkg.scripts.build).toBe('npm run validate-species && npm run validate-db && npm run typecheck && eleventy && npm run validate-bundle-size');
    // Model Y: the postbuild lifecycle hashes the runtime data artifacts into
    // _site/data and writes the slim manifest (scripts/postbuild-data.mjs).
    expect(pkg.scripts.postbuild).toBe('node scripts/postbuild-data.mjs');
  });
});

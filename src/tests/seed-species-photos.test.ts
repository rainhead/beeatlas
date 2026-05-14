import { describe, test, expect } from 'vitest';
import {
  photoUrlToLarge,
  extractPhotos,
  mergeFillOnly,
  sortManifestSpecies,
  RateLimiter,
  // @ts-expect-error -- .mjs source has no .d.ts; named exports are the contract
} from '../../scripts/seed-species-photos.mjs';

describe('photoUrlToLarge (PHOTO-04)', () => {
  test('transforms /square.jpg to /large.jpg', () => {
    expect(
      photoUrlToLarge('https://inaturalist-open-data.s3.amazonaws.com/photos/52274835/square.jpg'),
    ).toBe('https://inaturalist-open-data.s3.amazonaws.com/photos/52274835/large.jpg');
  });

  test('transforms /square.jpeg to /large.jpeg', () => {
    expect(photoUrlToLarge('https://x/photos/9/square.jpeg')).toBe(
      'https://x/photos/9/large.jpeg',
    );
  });

  test('transforms /square.png to /large.png', () => {
    expect(photoUrlToLarge('https://x/photos/1/square.png')).toBe(
      'https://x/photos/1/large.png',
    );
  });

  test('returns URL unchanged when no /square. segment present (defensive)', () => {
    expect(photoUrlToLarge('https://x/photos/1/large.jpg')).toBe(
      'https://x/photos/1/large.jpg',
    );
  });

  test('only replaces trailing /square.', () => {
    // unlikely real iNat URL, but regex must be anchored with $
    expect(photoUrlToLarge('https://x/square_thumbs/photos/1/square.jpg')).toBe(
      'https://x/square_thumbs/photos/1/large.jpg',
    );
  });
});

describe('extractPhotos (PHOTO-02 + Pitfall 1 + PHOTO-04)', () => {
  const goodObs = (
    license_code: string | null,
    photoId = 1,
    obsId = 1,
  ) => ({
    id: obsId,
    license_code: 'cc-by', // OBSERVATION license — should NOT drive filtering (Pitfall 1)
    photos: [
      {
        id: photoId,
        license_code,
        url: `https://x/photos/${photoId}/square.jpg`,
        attribution: '(c) Test',
      },
    ],
  });

  test('filters out null license_code', () => {
    expect(extractPhotos([goodObs(null)])).toEqual([]);
  });

  test('filters out all-rights-reserved license_code', () => {
    expect(extractPhotos([goodObs('all-rights-reserved')])).toEqual([]);
  });

  test('filters out cc-by-nc-nd (not in whitelist)', () => {
    expect(extractPhotos([goodObs('cc-by-nc-nd')])).toEqual([]);
  });

  test('uses photo.license_code, not obs.license_code (Pitfall 1)', () => {
    // Observation has license cc-by but the photo itself is all-rights-reserved.
    // The seed must filter by the photo's license, not the observation's.
    const obs = {
      id: 1,
      license_code: 'cc-by',
      photos: [
        {
          id: 1,
          license_code: 'all-rights-reserved',
          url: 'https://x/photos/1/square.jpg',
          attribution: '(c) Test',
        },
      ],
    };
    expect(extractPhotos([obs])).toEqual([]);
  });

  test('accepts cc0', () => {
    const photos = extractPhotos([goodObs('cc0')]);
    expect(photos).toHaveLength(1);
    expect(photos[0].license).toBe('cc0');
  });

  test('stops at maxCount=3', () => {
    const obs = (id: number) => goodObs('cc-by', id, id);
    const photos = extractPhotos([obs(1), obs(2), obs(3), obs(4), obs(5)]);
    expect(photos).toHaveLength(3);
    expect(photos.map((p: { photo_id: number }) => p.photo_id)).toEqual([1, 2, 3]);
  });

  test('assigns sequential ordering starting at startOrdering', () => {
    const obs = (id: number) => goodObs('cc-by', id, id);
    const photos = extractPhotos([obs(10), obs(20)], 3, 5);
    expect(photos.map((p: { ordering: number }) => p.ordering)).toEqual([5, 6]);
  });

  test('transforms URL via photoUrlToLarge (PHOTO-04)', () => {
    const photos = extractPhotos([goodObs('cc0')]);
    expect(photos[0].url).toContain('/large.jpg');
    expect(photos[0].url).not.toContain('/square.');
  });

  test('guards against missing photos array (Pitfall 3 defensive)', () => {
    const obsNoPhotos = { id: 1, license_code: 'cc0', photos: null };
    expect(extractPhotos([obsNoPhotos])).toEqual([]);
  });

  test('guards against null/undefined observations array (Pitfall 3)', () => {
    expect(extractPhotos(null)).toEqual([]);
    expect(extractPhotos(undefined)).toEqual([]);
    expect(extractPhotos([])).toEqual([]);
  });

  test('preserves attribution verbatim per PHOTO-03', () => {
    const obs = {
      id: 7,
      photos: [
        {
          id: 42,
          license_code: 'cc-by-nc',
          url: 'https://x/photos/42/square.jpg',
          attribution: '(c) Jane Doe, some rights reserved (CC BY-NC)',
        },
      ],
    };
    const photos = extractPhotos([obs]);
    expect(photos).toHaveLength(1);
    expect(photos[0].attribution).toBe('(c) Jane Doe, some rights reserved (CC BY-NC)');
    expect(photos[0].observation_id).toBe(7);
    expect(photos[0].photo_id).toBe(42);
  });
});

describe('mergeFillOnly (D-01 fill-only)', () => {
  test('inserts entry when scientificName is absent', () => {
    const before = { species: {} };
    const after = mergeFillOnly(before, 'Osmia lignaria', {
      description: 'test',
      photos: [],
    });
    expect(after.species['Osmia lignaria']).toEqual({
      description: 'test',
      photos: [],
    });
  });

  test('NEVER overwrites existing entry (D-01)', () => {
    const before = {
      species: {
        'Osmia lignaria': {
          description: 'human-edited',
          photos: [{ photo_id: 999 }],
        },
      },
    };
    const after = mergeFillOnly(before, 'Osmia lignaria', {
      description: '',
      photos: [],
    });
    expect(after.species['Osmia lignaria']).toEqual({
      description: 'human-edited',
      photos: [{ photo_id: 999 }],
    });
  });

  test('does not mutate input manifest', () => {
    const before = { species: {} };
    mergeFillOnly(before, 'Osmia lignaria', { description: '' });
    expect(before.species).toEqual({});
  });

  test('preserves other species entries when inserting a new one', () => {
    const before = {
      species: {
        'Andrena prunorum': { description: 'a', photos: [] },
      },
    };
    const after = mergeFillOnly(before, 'Bombus vosnesenskii', {
      description: 'b',
      photos: [],
    });
    expect(Object.keys(after.species).sort()).toEqual([
      'Andrena prunorum',
      'Bombus vosnesenskii',
    ]);
    expect(after.species['Andrena prunorum']).toEqual({ description: 'a', photos: [] });
  });
});

describe('sortManifestSpecies (Pitfall 9 stable diffs)', () => {
  test('sorts species keys alphabetically', () => {
    const manifest = {
      species: { Osmia: {}, Andrena: {}, Bombus: {} },
    };
    const sorted = sortManifestSpecies(manifest);
    expect(Object.keys(sorted.species)).toEqual(['Andrena', 'Bombus', 'Osmia']);
  });

  test('preserves entry contents byte-identically', () => {
    const manifest = {
      species: {
        Osmia: { description: 'test', photos: [{ photo_id: 1 }] },
      },
    };
    const sorted = sortManifestSpecies(manifest);
    expect(sorted.species['Osmia']).toEqual({
      description: 'test',
      photos: [{ photo_id: 1 }],
    });
  });

  test('handles empty species table', () => {
    const sorted = sortManifestSpecies({ species: {} });
    expect(sorted.species).toEqual({});
  });
});

describe('RateLimiter (PHOTO-07 <=1 req/sec)', () => {
  test('first wait() resolves immediately', async () => {
    const rl = new RateLimiter(50);
    const t0 = Date.now();
    await rl.wait();
    expect(Date.now() - t0).toBeLessThan(30);
  });

  test('subsequent wait() resolves after >= minIntervalMs', async () => {
    const rl = new RateLimiter(50);
    await rl.wait(); // first call (free)
    const t0 = Date.now();
    await rl.wait();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(45); // tolerance for timer jitter
  });

  test('three sequential waits accumulate >= 2 * minIntervalMs', async () => {
    const rl = new RateLimiter(30);
    const t0 = Date.now();
    await rl.wait();
    await rl.wait();
    await rl.wait();
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(55); // 2 intervals at 30ms (first call free)
  });
});

// ---------- Build-chain isolation guards (PHOTO-07: seed NOT in CI) ----------

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

describe('build-chain isolation (PHOTO-07: seed NOT in CI)', () => {
  test('package.json does NOT reference seed-species-photos in any script', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    for (const [name, cmd] of Object.entries(pkg.scripts ?? {}) as [string, string][]) {
      expect(
        cmd,
        `script '${name}' contains seed-species-photos — must NEVER be in CI per PHOTO-07`,
      ).not.toMatch(/seed-species-photos/);
    }
  });

  test('package.json build script is the expected shape (validate-species && typecheck && eleventy && validate-bundle-size)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    // v3.4 CUTOVER-03: validate-schema retired (dbt contract is the schema gate)
    expect(pkg.scripts.build).toBe(
      'npm run validate-species && npm run typecheck && eleventy && npm run validate-bundle-size',
    );
  });

  test('no prebuild/postbuild hook references seed-species-photos', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts?.prebuild ?? '').not.toMatch(/seed-species-photos/);
    expect(pkg.scripts?.postbuild ?? '').not.toMatch(/seed-species-photos/);
  });

  test('seed script declares CLI guard (does not call main() at module load)', () => {
    const src = readFileSync(resolve(ROOT, 'scripts/seed-species-photos.mjs'), 'utf-8');
    expect(src).toMatch(
      /fileURLToPath\(import\.meta\.url\)\s*===\s*resolve\(process\.argv\[1\]\)/,
    );
    // Ensure every main() call sits inside the isCli guard.
    const lines = src.split('\n');
    const mainCallLines = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /^\s*main\(\)/.test(l));
    expect(mainCallLines.length).toBeGreaterThan(0);
    for (const { i } of mainCallLines) {
      const above = lines.slice(Math.max(0, i - 5), i).join('\n');
      expect(above, `main() at line ${i + 1} not within isCli guard`).toMatch(
        /if\s*\(\s*isCli\s*\)/,
      );
    }
  });

  test('seed script imports LICENSE_WHITELIST from validate-species.mjs (single source of truth)', () => {
    const src = readFileSync(
      resolve(ROOT, 'scripts/seed-species-photos.mjs'),
      'utf-8',
    );
    expect(src).toMatch(/from ['"]\.\/validate-species\.mjs['"]/);
    expect(src).toMatch(/LICENSE_WHITELIST/);
  });
});

import { describe, test, expect } from 'vitest';
import {
  photoUrlToLarge,
  extractPhotos,
  mergeFillOnly,
  sortManifestSpecies,
  RateLimiter,
  buildTaxonIdSql,
  buildVettedObservationsSql,
  normalizeName,
  isCuratorTouched,
  extractSpeciesComments,
  reattachSpeciesComments,
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

describe('extractPhotos: one photo per observation (beeatlas-zd7)', () => {
  // The regression this file previously had no coverage for. 276 of 374 multi-photo
  // species drew all three photos from a single observation, because the old loop
  // walked every photo WITHIN an observation before advancing to the next one.
  const multiPhotoObs = (obsId: number, photoIds: number[]) => ({
    id: obsId,
    photos: photoIds.map((id) => ({
      id,
      license_code: 'cc-by',
      url: `https://x/photos/${id}/square.jpg`,
      attribution: '(c) Test',
    })),
  });

  test('takes ONE photo from an observation carrying three licensed photos', () => {
    const photos = extractPhotos([multiPhotoObs(100, [1, 2, 3])]);
    expect(photos).toHaveLength(1);
    expect(photos[0].photo_id).toBe(1);
  });

  test('three photos come from three DISTINCT observations', () => {
    const photos = extractPhotos([
      multiPhotoObs(100, [1, 2, 3]),
      multiPhotoObs(200, [4, 5, 6]),
      multiPhotoObs(300, [7, 8, 9]),
    ]);
    expect(photos).toHaveLength(3);
    expect(photos.map((p: { observation_id: number }) => p.observation_id)).toEqual([100, 200, 300]);
    expect(new Set(photos.map((p: { observation_id: number }) => p.observation_id)).size).toBe(3);
  });

  test('skips to the next licensed photo when an observation leads with an unlicensed one', () => {
    const obs = {
      id: 1,
      photos: [
        { id: 1, license_code: 'all-rights-reserved', url: 'https://x/photos/1/square.jpg' },
        { id: 2, license_code: 'cc0', url: 'https://x/photos/2/square.jpg', attribution: '' },
      ],
    };
    const photos = extractPhotos([obs]);
    expect(photos).toHaveLength(1);
    expect(photos[0].photo_id).toBe(2);
  });

  test('a repeated observation id is only used once', () => {
    const photos = extractPhotos([multiPhotoObs(100, [1]), multiPhotoObs(100, [2])]);
    expect(photos).toHaveLength(1);
  });

  test('excludeObservations keeps a later region tier off an earlier tier’s observations', () => {
    // Tiers are nested: every WA observation reappears in the PNW and global queries.
    // Without this, topping up would re-select the same bee it already had.
    const photos = extractPhotos(
      [multiPhotoObs(100, [1]), multiPhotoObs(200, [2])],
      3,
      1,
      new Set([100]),
    );
    expect(photos).toHaveLength(1);
    expect(photos[0].observation_id).toBe(200);
  });

  test('observations with no id are skipped rather than colliding on undefined', () => {
    const photos = extractPhotos([
      { photos: [{ id: 1, license_code: 'cc0', url: 'https://x/photos/1/square.jpg' }] },
      multiPhotoObs(200, [2]),
    ]);
    expect(photos).toHaveLength(1);
    expect(photos[0].observation_id).toBe(200);
  });
});

describe('normalizeName (beeatlas-zd7 casing bug)', () => {
  // species_universe keys occurrence-only species on the LOWERCASE canonical_name while
  // species.json is properly cased, so an exact-string lookup missed 104 of 630 species
  // — Bombus fervidus among them, which would have left the ADR 0030 override inert.
  test('matches across the casing split', () => {
    expect(normalizeName('Bombus fervidus')).toBe(normalizeName('bombus fervidus'));
  });

  test('trims incidental whitespace', () => {
    expect(normalizeName('  Apis mellifera ')).toBe('apis mellifera');
  });

  test('is total over null/undefined', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('isCuratorTouched (D-01 survives --reselect)', () => {
  test('a machine-seeded entry is replaceable', () => {
    expect(isCuratorTouched({ description: '', photos: [{ caption: '' }] })).toBe(false);
  });

  test('a written description protects the entry', () => {
    expect(isCuratorTouched({ description: 'Our commonest bumblebee.', photos: [] })).toBe(true);
  });

  test('a caption on any photo protects the entry', () => {
    expect(
      isCuratorTouched({ description: '', photos: [{ caption: '' }, { caption: 'male, on Cirsium' }] }),
    ).toBe(true);
  });

  test('whitespace-only prose does not count as curation', () => {
    expect(isCuratorTouched({ description: '   ', photos: [{ caption: '\n' }] })).toBe(false);
  });

  test('is total over missing fields', () => {
    expect(isCuratorTouched({})).toBe(false);
    expect(isCuratorTouched(undefined)).toBe(false);
  });
});

describe('curator comments survive a rewrite (beeatlas-zd7)', () => {
  // The zd7 re-selection deleted the file's only curator note — five lines explaining
  // why the orphan Agapostemon texanus entry was deliberately left in place. @iarna/toml
  // drops comments on parse, so they are invisible to the manifest object and therefore
  // to isCuratorTouched. Losing them loses the reasoning, not just a string.
  const raw = [
    '[species."Andrena nigrihirta"]',
    'description = ""',
    '',
    '# NOTE: synonymized within Washington; the validate-species warning is EXPECTED.',
    '# Left as-is pending a curation call.',
    '[species."Agapostemon texanus"]',
    'description = ""',
  ].join('\n');

  test('harvests a comment block anchored to its species header', () => {
    const comments = extractSpeciesComments(raw);
    expect([...comments.keys()]).toEqual(['Agapostemon texanus']);
    expect(comments.get('Agapostemon texanus')).toContain('pending a curation call');
  });

  test('does not attribute a comment to a species it does not precede', () => {
    expect(extractSpeciesComments(raw).has('Andrena nigrihirta')).toBe(false);
  });

  test('reattaches the block above the right header after stringify', () => {
    const comments = extractSpeciesComments(raw);
    const out = reattachSpeciesComments(
      '[species."Agapostemon subtilior"]\n[species."Agapostemon texanus"]\n',
      comments,
    );
    expect(out).toMatch(/# NOTE[\s\S]*\n\[species\."Agapostemon texanus"\]/);
    // and must not smear onto the neighbouring species
    expect(out.indexOf('# NOTE')).toBeGreaterThan(out.indexOf('subtilior'));
  });

  test('a round trip through harvest + reattach is lossless', () => {
    // Models real usage: harvest from the raw file, reattach to the COMMENT-FREE
    // output of TOML.stringify — which is what render() does on every write.
    const comments = extractSpeciesComments(raw);
    const stringified = raw.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(stringified).not.toContain('#');

    const out = reattachSpeciesComments(stringified, comments);
    expect((out.match(/^#/gm) ?? []).length).toBe((raw.match(/^#/gm) ?? []).length);
    expect(extractSpeciesComments(out)).toEqual(comments);
  });

  test('no comments is a no-op, not a crash', () => {
    expect(extractSpeciesComments('').size).toBe(0);
    expect(reattachSpeciesComments('[species."X"]', new Map())).toBe('[species."X"]');
    expect(reattachSpeciesComments('[species."X"]', undefined)).toBe('[species."X"]');
  });

  test('every comment in the committed manifest still names a species that exists', () => {
    // Was pinned to the Agapostemon texanus note specifically, until that note was
    // removed WITH its orphan entry (beeatlas-mm0) — the note existed only to explain
    // why the orphan was being kept. Pinning a particular comment made the test a
    // hostage to a curation decision; the durable invariant is that a comment never
    // outlives the entry it annotates, which is the state a rewrite can silently create.
    const manifest = readFileSync(resolve(ROOT, 'content/species-photos.toml'), 'utf-8');
    const species = (TOML.parse(manifest).species ?? {}) as Record<string, unknown>;
    for (const name of extractSpeciesComments(manifest).keys() as Iterable<string>) {
      expect(species[name], `comment for "${name}" but no such species entry`).toBeDefined();
    }
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

  test('NEVER overwrites existing entry', () => {
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
import TOML from '@iarna/toml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// ---------- Outbound query-taxon override (ADR 0030) ----------

describe('buildVettedObservationsSql (beeatlas-an8: tier 1 sees every vetted arm)', () => {
  const PARQUET = 'public/data/occurrences.parquet';

  test('does not restrict record_type — the specimen arm is the STRONGEST evidence', () => {
    // The bug this pins: `record_type IN ('inat_expert','waba_specimen')` excluded arm 1
    // `specimen` (a catalogued Ecdysis bee), which carries specimen_observation_id on 1,839
    // rows across 220 species. Arms 1 and 2 are one specimen at two stages — arm 2 BECOMES
    // arm 1 once Ecdysis catalogues it — so filtering arm 1 out meant a specimen's photos
    // went invisible the moment a taxonomist catalogued it. Re-adding any record_type
    // predicate here re-breaks that, silently: the seeder still runs and still writes photos.
    expect(buildVettedObservationsSql(PARQUET)).not.toContain('record_type');
  });

  test('selects on specimen_observation_id, which is what excludes the bee-less arms', () => {
    // IS NOT NULL is load-bearing, and is the ONLY thing keeping plant images out: arm 3
    // provisional_sample (D-11) and arm 5 checklist carry no specimen_observation_id at all,
    // so this predicate alone selects exactly arms 1, 2 and 4. Dropping it would seed
    // species pages from `observation_id` — the flower the bee was collected from.
    const sql = buildVettedObservationsSql(PARQUET);
    expect(sql).toContain('specimen_observation_id IS NOT NULL');
    expect(sql).not.toMatch(/\bobservation_id IS NOT NULL/);
  });

  test('groups one id list per species, deduplicated', () => {
    const sql = buildVettedObservationsSql(PARQUET);
    expect(sql).toContain('list(DISTINCT specimen_observation_id)');
    expect(sql).toContain('GROUP BY canonical_name');
  });
});

describe('buildTaxonIdSql (ADR 0030 outbound query taxon)', () => {
  const SEED = resolve(ROOT, 'data/dbt/seeds/inat_query_taxa.csv');

  test('the override wins over the bridge, not the other way round', () => {
    // COALESCE argument order IS the precedence rule. Reversed, the seed becomes
    // dead weight and fervidus silently reverts to the narrow species.
    expect(buildTaxonIdSql(SEED)).toContain('COALESCE(q.taxon_id, b.taxon_id)');
  });

  test('reads the seed when present', () => {
    const sql = buildTaxonIdSql(SEED);
    expect(sql).toContain('read_csv');
    expect(sql).toContain('inat_query_taxa.csv');
  });

  test('degrades to a bridge-only resolve when the seed is absent', () => {
    // A checkout without the seed must still produce valid SQL, not a duckdb
    // "file not found" that kills the whole run.
    const sql = buildTaxonIdSql('/nonexistent/inat_query_taxa.csv');
    expect(sql).not.toContain('read_csv');
    expect(sql).toContain('WHERE FALSE');
    expect(sql).toContain('COALESCE(q.taxon_id, b.taxon_id)');
  });

  test('the committed seed maps fervidus to the complex that matches our synonymy', () => {
    // Guards the pairing this ADR rests on: occurrence_synonyms folds californicus
    // into fervidus, so the outbound query must reach the complex holding BOTH.
    // 52774 alone reaches 198 of Washington's 1,254 research-grade records.
    const seed = readFileSync(SEED, 'utf-8');
    expect(seed).toMatch(/^bombus fervidus,1266534,/m);

    const synonyms = readFileSync(resolve(ROOT, 'data/dbt/seeds/occurrence_synonyms.csv'), 'utf-8');
    expect(synonyms).toMatch(/^bombus californicus,bombus fervidus,/m);
  });

  test('every override names a post-synonymy accepted name, never a folded synonym', () => {
    // Keying a row on a synonym would make it unreachable: species.json only ever
    // carries accepted names, so the LEFT JOIN would never match and the override
    // would look applied while doing nothing.
    const rows = readFileSync(SEED, 'utf-8').trim().split('\n').slice(1)
      .map((l) => l.split(',')[0]);
    const foldedAway = new Set(
      readFileSync(resolve(ROOT, 'data/dbt/seeds/occurrence_synonyms.csv'), 'utf-8')
        .trim().split('\n').slice(1).map((l) => l.split(',')[0]),
    );
    for (const name of rows) {
      expect(foldedAway.has(name), `${name} is a folded synonym; use its accepted name`).toBe(false);
    }
  });
});

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

  test('package.json build script is the expected shape (validate → build:app → eleventy → build:sw → validate-bundle-size)', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    // v3.4 CUTOVER-03: validate-schema retired (dbt contract is the schema gate)
    // beeatlas-d3y: Vite backend integration split the single `eleventy` step into
    // three ordered ones — build:app writes the manifest Eleventy reads, and build:sw
    // must follow Eleventy because its precache glob includes app/index.html.
    // beeatlas-4oa: the three validations factored out as `validate`, shared with
    // build:content so the note path cannot quietly drift out of them.
    expect(pkg.scripts.validate).toBe(
      'npm run validate-species && npm run validate-db && npm run typecheck',
    );
    expect(pkg.scripts.build).toBe(
      'npm run validate && npm run build:app && node scripts/build-maplibre-worker.mjs && eleventy && npm run build:sw && npm run validate-bundle-size',
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

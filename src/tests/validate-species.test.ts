import { test, expect, describe } from 'vitest';
import { validateSpeciesPhotos, LICENSE_WHITELIST } from '../../scripts/validate-species.mjs';

const SPECIES_JSON = [
  { scientificName: 'Osmia lignaria', canonical_name: 'osmia lignaria', on_checklist: true, occurrence_count: 5, slug: 'osmia-lignaria' },
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

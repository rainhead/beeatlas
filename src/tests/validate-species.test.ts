import { test, expect, describe } from 'vitest';
import { validateSpeciesPhotos } from '../../scripts/validate-species.mjs';

// Sanity import (Wave 0 stub — Task 2 adds real assertions)
describe('validateSpeciesPhotos', () => {
  test.todo('rejects all-rights-reserved license (PHOTO-02)');
  test.todo('rejects null license (PHOTO-02)');
  test.todo('rejects missing license field (PHOTO-02)');
  test.todo('rejects cc-by-nc-nd (not in whitelist) (PHOTO-02)');
  test.todo('accepts all 5 whitelisted licenses (PHOTO-02)');
  test.todo('rejects missing attribution for cc-by photo (PHOTO-03)');
  test.todo('accepts cc0 photo with no attribution (PHOTO-03)');
  test.todo('warns on unknown scientificName, exit 0 (PHOTO-05)');
  test.todo('skips unknown-name check when species.json is null (Pitfall 7)');
  test.todo('accepts a valid manifest (smoke)');

  test('validateSpeciesPhotos is exported and callable', () => {
    expect(typeof validateSpeciesPhotos).toBe('function');
  });
});

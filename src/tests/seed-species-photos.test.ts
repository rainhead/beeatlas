import { describe, test } from 'vitest';

describe('seed-species-photos', () => {
  test.todo('photoUrlToLarge transforms /square.jpg to /large.jpg (PHOTO-04)');
  test.todo('photoUrlToLarge transforms /square.jpeg to /large.jpeg (PHOTO-04)');
  test.todo('extractPhotos filters out null license_code (PHOTO-02 at seed time)');
  test.todo('extractPhotos filters out non-whitelisted license_code');
  test.todo('extractPhotos uses photo.license_code, not obs.license_code (Pitfall 1)');
  test.todo('extractPhotos stops at 3 photos');
  test.todo('extractPhotos guards against missing results array (Pitfall 3)');
  test.todo('mergeFillOnly never overwrites existing species table (D-01)');
  test.todo('mergeFillOnly adds entries only for new scientificNames (D-01)');
  test.todo('rate limiter awaits >= 1000ms between calls (PHOTO-07)');
});

import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const beeMapSrc = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
const beeAtlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

describe('NEAR-01/D-06: <bee-map> exposes a public GeolocateControl trigger seam', () => {
  test('bee-map.ts declares a public requestUserLocation() method (D-06 trigger seam)', () => {
    expect(beeMapSrc).toMatch(/public requestUserLocation\(\)/);
  });

  test('bee-map.ts stores the GeolocateControl on a _geolocate instance field', () => {
    expect(beeMapSrc).toMatch(/this\._geolocate/);
  });

  test('bee-map.ts does NOT declare _userLocation as @state (pure-presenter invariant)', () => {
    expect(beeMapSrc).not.toMatch(/@state[\s\S]{0,20}_userLocation/);
  });
});

describe('LOC-02: pure-presenter invariant — <bee-map> emits, <bee-atlas> stores', () => {
  test('bee-map.ts does NOT declare _userLocation as @state (LOC-02 pure-presenter)', () => {
    expect(beeMapSrc).not.toMatch(/@state[\s\S]{0,20}_userLocation/);
  });

  test('bee-map.ts does NOT declare private _userLocation field (LOC-02 pure-presenter)', () => {
    expect(beeMapSrc).not.toMatch(/private\s+_userLocation/);
  });

  test('bee-map.ts emits user-location-changed event (LOC-02 event relay)', () => {
    expect(beeMapSrc).toMatch(/user-location-changed/);
  });

  test('bee-atlas.ts declares _userLocation as @state (LOC-02 coordinator owns state)', () => {
    expect(beeAtlasSrc).toMatch(/@state[\s\S]{0,20}_userLocation/);
  });

  test('bee-atlas.ts binds @user-location-changed on <bee-map> in render() (LOC-02 coordinator listens)', () => {
    expect(beeAtlasSrc).toMatch(/@user-location-changed/);
  });
});

// beeatlas-8qb: the denial message named an iOS path on every platform, so a
// desktop Chrome user was pointed at a Settings screen that does not exist.
describe('the location-denied message is platform-appropriate', () => {
  test('the Safari path is behind isIosSafari(), not unconditional', () => {
    const fn = beeAtlasSrc.slice(
      beeAtlasSrc.indexOf('function locationDeniedMessage'),
      beeAtlasSrc.indexOf('function locationDeniedMessage') + 500,
    );
    expect(fn).toMatch(/isIosSafari\(\)/);
    expect(fn).toMatch(/Settings → Safari → Location/);
  });

  test('the render path calls the helper rather than inlining either string', () => {
    expect(beeAtlasSrc).toMatch(/\? locationDeniedMessage\(\)/);
    // exactly one occurrence of the iOS string, inside the helper
    expect(beeAtlasSrc.match(/Settings → Safari → Location/g)?.length).toBe(1);
  });

  test('the non-iOS fallback names no platform-specific path', () => {
    const fn = beeAtlasSrc.slice(
      beeAtlasSrc.indexOf('function locationDeniedMessage'),
      beeAtlasSrc.indexOf('function locationDeniedMessage') + 500,
    );
    const fallback = fn.split('isIosSafari()')[1] ?? '';
    for (const platform of ['Safari', 'Chrome', 'Firefox', 'Edge', 'Android', 'iOS']) {
      expect(fallback.split(':')[1] ?? '').not.toContain(platform);
    }
  });
});

import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const beeMapSrc = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
const beeAtlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');

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

// Swatch <-> dot parity, checked against the artifacts themselves.
//
// The genus/subgenus swatch colors are computed twice: in _data/species.js for the
// page, and in data/species_maps.py for the SVG. Both walk the same sorted member
// list and assign hue = position, so any disagreement about WHICH members are in
// that list silently repaints every species after the first divergence — which is
// how Chelostoma phaceliae came to draw blue dots under a grey swatch while
// C. minutum's green dots sat under a cyan one.
//
// Nothing in either language can catch that alone; only the two outputs together
// can. This asserts the weakest useful invariant that needs no guess about which
// points fell inside the WA bbox: every fill the SVG uses must be a color the page
// shows for that group.
//
// Requires FRESH pipeline artifacts, so it skips when the SVGs predate species.json
// (the normal local state — the nightly regenerates both in one run).

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error -- _data/*.js is plain ESM consumed by Eleventy; no .d.ts
import species from '../../_data/species.js';
// @ts-expect-error -- lib/*.js is plain ESM shared with the Eleventy build; no .d.ts
import { buildDataDir } from '../../lib/build-data-dir.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// The same artifact directory _data/species.js read — EXPORT_DIR under the nightly,
// public/data locally. Comparing a page built from one against SVGs from another
// would fail on staleness, not on code.
const DATA_DIR = buildDataDir(ROOT);
const MAPS_DIR = join(DATA_DIR, 'species-maps');
const SPECIES_JSON = join(DATA_DIR, 'species.json');

// Grey is assigned by both sides to members outside the palette (unresolved
// genus-level records, and species with nothing on the map), so it is always legal.
const NEUTRAL = new Set(['#aaaaaa', '#cccccc']);

function svgFills(path: string): string[] {
  const svg = readFileSync(path, 'utf-8');
  return [...svg.matchAll(/<(?:\w+:)?g\b[^>]*\bfill="([^"]+)"/g)].map(m => m[1] as string);
}

const channels = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

// One channel step of slack. Python's colorsys and the JS hslToHex agree on the
// hue but not always on the last bit of the conversion — hue 270 lands on
// 127.49999999999991 in colorsys and exactly 127.5 in JS, so #7f26d9 vs #8026d9.
// That difference is invisible and pre-dates this check; a WRONG hue is off by far
// more than one step, which is what this test is for.
function sameColor(a: string, b: string): boolean {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.abs(ar - br) <= 1 && Math.abs(ag - bg) <= 1 && Math.abs(ab - bb) <= 1;
}

const stale = (() => {
  if (!existsSync(MAPS_DIR) || !existsSync(SPECIES_JSON)) return 'no pipeline artifacts in public/data';
  const genusDir = join(MAPS_DIR, 'genus');
  if (!existsSync(genusDir)) return 'no species-maps/genus directory';
  const newest = readdirSync(genusDir)
    .filter(f => f.endsWith('.svg'))
    .reduce((acc, f) => Math.max(acc, statSync(join(genusDir, f)).mtimeMs), 0);
  if (newest === 0) return 'no genus SVGs';
  if (newest < statSync(SPECIES_JSON).mtimeMs) return 'species-maps are older than species.json';
  return null;
})();

describe.skipIf(stale !== null)(`species-map swatch<->dot parity`, () => {
  test('every genus SVG fill is a color that genus page shows', () => {
    const genusDir = join(MAPS_DIR, 'genus');
    let checked = 0;
    for (const file of readdirSync(genusDir).filter(f => f.endsWith('.svg'))) {
      const genusName = file.replace(/\.svg$/, '');
      const g = (species as any).genusList.find((x: any) => x.genus === genusName);
      if (!g) continue; // SVG for a genus with no page — nothing to be a legend for
      const shown: string[] = g.species.map((sp: any) => sp.hexColor);
      for (const fill of svgFills(join(genusDir, file))) {
        if (NEUTRAL.has(fill)) continue;
        expect(
          shown.some(c => sameColor(c, fill)),
          `${genusName}.svg draws ${fill}, which no swatch on its page shows (${shown.join(' ')})`,
        ).toBe(true);
      }
      checked++;
    }
    expect(checked, 'no genus SVGs matched a genus page').toBeGreaterThan(0);
  });

  test('every subgenus SVG fill is a color that subgenus page shows', () => {
    const subgenusDir = join(MAPS_DIR, 'subgenus');
    if (!existsSync(subgenusDir)) return;
    let checked = 0;
    for (const genusName of readdirSync(subgenusDir)) {
      const dir = join(subgenusDir, genusName);
      if (!statSync(dir).isDirectory()) continue;
      for (const file of readdirSync(dir).filter(f => f.endsWith('.svg'))) {
        const subgenusName = file.replace(/\.svg$/, '');
        const sg = (species as any).subgenusList.find(
          (x: any) => x.genus === genusName && x.subgenus === subgenusName,
        );
        if (!sg) continue; // ungenerated subgenus page
        const shown: string[] = sg.species.map((sp: any) => sp.hexColor);
        for (const fill of svgFills(join(dir, file))) {
          if (NEUTRAL.has(fill)) continue;
          expect(
            shown.some(c => sameColor(c, fill)),
            `${genusName}/${subgenusName}.svg draws ${fill}, which no swatch on its page shows (${shown.join(' ')})`,
          ).toBe(true);
        }
        checked++;
      }
    }
    expect(checked, 'no subgenus SVGs matched a subgenus page').toBeGreaterThan(0);
  });
});

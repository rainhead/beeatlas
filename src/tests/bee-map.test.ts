import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

describe('MAP-02: checklist county fill layer removed (Plan 138-03)', () => {
  // County-fill layer and its plumbing removed; checklist now flows through hiddenSources.
  test('bee-map.ts does NOT declare showChecklist @property (retired)', () => {
    expect(src).not.toMatch(/showChecklist/);
  });

  test('bee-map.ts does NOT have checklist-county-fill layer (retired)', () => {
    expect(src).not.toMatch(/checklist-county-fill/);
  });

  test('bee-map.ts does NOT import checklistCountyFillLayerSpec (retired)', () => {
    expect(src).not.toMatch(/checklistCountyFillLayerSpec/);
  });

  test('bee-map.ts declares hiddenSources @property (checklist standard path)', () => {
    expect(src).toMatch(/@property[\s\S]{0,50}hiddenSources/);
  });
});

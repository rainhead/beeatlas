import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

describe('MAP-02: checklist county fill layer', () => {
  test('bee-map.ts adds checklist-county-fill layer', () => {
    expect(src).toMatch(/['"]checklist-county-fill['"]/);
  });

  test('bee-map.ts declares showChecklist @property', () => {
    expect(src).toMatch(/showChecklist/);
  });

  test('bee-map.ts declares checklistTaxon @property', () => {
    expect(src).toMatch(/checklistTaxon/);
  });

  test('bee-map.ts adds checklist layer before ghost-points (beforeId)', () => {
    expect(src).toMatch(/['"]ghost-points['"]/);
    // Both IDs appear; ghost-points must appear after checklist-county-fill in the addLayer call
    const checklistIdx = src.indexOf("'checklist-county-fill'");
    // checklist-county-fill must be present; if absent, this assertion fails RED
    expect(checklistIdx).toBeGreaterThan(-1);
    const ghostBeforeIdIdx = src.indexOf("'ghost-points'", checklistIdx);
    expect(ghostBeforeIdIdx).toBeGreaterThan(checklistIdx);
  });

  test('bee-map.ts uses parquetReadObjects for checklist fetch', () => {
    expect(src).toMatch(/parquetReadObjects/);
  });

  test('bee-map.ts has _checklistGeneration counter', () => {
    expect(src).toMatch(/_checklistGeneration/);
  });

  test('bee-map.ts calls resolveDataUrl with checklist key', () => {
    expect(src).toMatch(/resolveDataUrl\s*\(\s*['"]checklist['"]/);
  });

  test('bee-map.ts uses setLayoutProperty to toggle checklist layer visibility', () => {
    expect(src).toMatch(/setLayoutProperty[\s\S]{0,100}checklist-county-fill/);
  });
});

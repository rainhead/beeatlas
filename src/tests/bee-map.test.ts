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

// SC-3/SC-4: occurrence source render decision as pure function of inputs (Plan 144-02)
describe('144-02: intendedFilterActive @property + render decision (SC-3, SC-4)', () => {
  // Structural: intendedFilterActive is an input @property, never assigned internally
  test('bee-map.ts declares intendedFilterActive as @property input', () => {
    expect(src).toMatch(/@property[\s\S]{0,80}intendedFilterActive/);
  });

  test('bee-map.ts intendedFilterActive is input-only: no internal assignment', () => {
    // Disallow `this.intendedFilterActive =` (assignment to the instance property in method bodies).
    // The property declaration `intendedFilterActive = false` on the class body line is allowed.
    expect(src).not.toMatch(/this\.intendedFilterActive\s*=/);
  });

  // updated() must react to intendedFilterActive changes
  test('bee-map.ts updated() triggers _applyVisibleIds when intendedFilterActive changes', () => {
    // Extract the updated() method body and check it contains intendedFilterActive
    const updatedIdx = src.indexOf('updated(changedProperties');
    expect(updatedIdx).toBeGreaterThanOrEqual(0);
    // Find the end of updated() — next top-level `private` or `protected` method at 2-space indent
    const afterUpdated = src.slice(updatedIdx, updatedIdx + 1200);
    expect(afterUpdated).toMatch(/intendedFilterActive/);
  });

  // Render decision: intendedFilterActive=true + filteredGeoJSON=null → empty (hide-all)
  // The method must use the nullish-coalescing pattern: `filteredGeoJSON ?? { type: 'FeatureCollection', features: [] }`
  test('_applyVisibleIds uses filteredGeoJSON ?? empty when intendedFilterActive is true (hide-all)', () => {
    expect(src).toMatch(/filteredGeoJSON\s*\?\?\s*\{/);
  });

  // Render decision branches on intendedFilterActive for the main fork
  test('_applyVisibleIds branches on intendedFilterActive for the hide-all decision', () => {
    // Find the definition of _applyVisibleIds (not a call to it)
    const defIdx = src.indexOf('private _applyVisibleIds()');
    expect(defIdx).toBeGreaterThanOrEqual(0);
    // Extract from the definition up to the next private method
    const afterDef = src.slice(defIdx, defIdx + 1000);
    expect(afterDef).toMatch(/intendedFilterActive/);
  });

  test('_applyVisibleIds does NOT branch on filteredGeoJSON !== null for hide-all decision', () => {
    const defIdx = src.indexOf('private _applyVisibleIds()');
    expect(defIdx).toBeGreaterThanOrEqual(0);
    const afterDef = src.slice(defIdx, defIdx + 1000);
    // The old hide-all branch was `if (this.filteredGeoJSON !== null)`.
    // After the refactor the decision is on intendedFilterActive.
    expect(afterDef).not.toMatch(/if\s*\(\s*this\.filteredGeoJSON\s*!==\s*null\s*\)/);
  });

  // mapReady gating: initial apply-after-load must fire for intendedFilterActive=true even when
  // visibleIds is null (so hide-all is applied as soon as map loads)
  test('load handler applies _applyVisibleIds unconditionally OR gates on intendedFilterActive', () => {
    // Find the map 'load' callback body
    const loadIdx = src.indexOf("this._map.on('load'");
    expect(loadIdx).toBeGreaterThanOrEqual(0);
    // Find the next top-level comment after the load callback closing
    const moveendIdx = src.indexOf('// moveend:', loadIdx);
    expect(moveendIdx).toBeGreaterThan(loadIdx);
    const loadBody = src.slice(loadIdx, moveendIdx);

    // The old pattern was `if (this.visibleIds !== null) { this._applyVisibleIds(); }` alone.
    // That misses the hide-all case. The new code must either:
    //   (a) call _applyVisibleIds() unconditionally (after sources are created), OR
    //   (b) gate on `visibleIds !== null || intendedFilterActive`
    const hasOldGateOnly =
      /if\s*\(\s*this\.visibleIds\s*!==\s*null\s*\)\s*\{[\s\n]*this\._applyVisibleIds/.test(loadBody) &&
      !/intendedFilterActive/.test(
        loadBody.slice(
          loadBody.search(/if\s*\(\s*this\.visibleIds\s*!==\s*null/),
          loadBody.search(/if\s*\(\s*this\.visibleIds\s*!==\s*null/) + 200
        )
      );
    expect(hasOldGateOnly).toBe(false);
  });
});

describe('OFF-04: bee-map blank-basemap overlay (Plan 149-03)', () => {
  test('bee-map.ts declares offline as @property input (OFF-04)', () => {
    expect(src).toMatch(/@property\(\{\s*attribute:\s*false\s*\}\)\s*offline\s*=\s*false/);
  });

  test('bee-map.ts contains .offline-basemap-label CSS rule (OFF-04)', () => {
    expect(src).toMatch(/\.offline-basemap-label\s*\{/);
  });

  test('bee-map.ts renders offline-basemap-label div when offline is true (OFF-04)', () => {
    // The conditional template must reference 'offline-basemap-label'
    expect(src).toMatch(/offline-basemap-label/);
    // Condition must gate on this.offline
    expect(src).toMatch(/this\.offline\s*\?/);
  });

  test('bee-map.ts overlay text contains informational message about basemap unavailability (OFF-04)', () => {
    expect(src).toMatch(/Basemap tiles unavailable offline/);
  });

  test('bee-map.ts offline @property is input-only: no internal assignment to this.offline (OFF-04)', () => {
    // Disallow assignment to the instance property in method bodies
    expect(src).not.toMatch(/this\.offline\s*=/);
  });

  test('bee-map.ts DOES NOT register online/offline event listeners (pure presenter invariant, OFF-04)', () => {
    expect(src).not.toMatch(/addEventListener\s*\(\s*['"]online['"]/);
    expect(src).not.toMatch(/addEventListener\s*\(\s*['"]offline['"]/);
  });

  test('bee-map.ts DOES NOT declare _offline @state (state owned by bee-atlas, OFF-04)', () => {
    expect(src).not.toMatch(/@state[\s\S]{0,20}_offline/);
    expect(src).not.toMatch(/private\s+_offline/);
  });
});

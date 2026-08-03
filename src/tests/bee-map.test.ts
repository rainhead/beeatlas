import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');

describe('MAP-02: checklist county fill layer removed (Plan 138-03)', () => {
  // County-fill layer and its plumbing removed; checklist now flows through hiddenTiers (Phase 170).
  test('bee-map.ts does NOT declare showChecklist @property (retired)', () => {
    expect(src).not.toMatch(/showChecklist/);
  });

  test('bee-map.ts does NOT have checklist-county-fill layer (retired)', () => {
    expect(src).not.toMatch(/checklist-county-fill/);
  });

  test('bee-map.ts does NOT import checklistCountyFillLayerSpec (retired)', () => {
    expect(src).not.toMatch(/checklistCountyFillLayerSpec/);
  });

  test('bee-map.ts declares hiddenTiers @property (Phase 170 tier-driven filter)', () => {
    expect(src).toMatch(/@property[\s\S]{0,50}hiddenTiers/);
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
  test('the initial install applies _applyVisibleIds unconditionally OR gates on intendedFilterActive', () => {
    // This used to slice the `this._map.on('load', …)` callback. The install moved
    // out of that callback into _installMapContent, which runs once the style is
    // final (beeatlas-q73) — the timing this test cares about is unchanged, so it
    // follows the code rather than the old shape.
    const installIdx = src.indexOf('private async _installMapContent()');
    expect(installIdx).toBeGreaterThanOrEqual(0);
    const loadBody = src.slice(installIdx);

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

  test('bee-map.ts renders offline-basemap-label div when offline and unprimed (OFF-04, beeatlas-6rs)', () => {
    // The conditional template must reference 'offline-basemap-label'
    expect(src).toMatch(/offline-basemap-label/);
    // Still gated on this.offline — but no longer on that ALONE. Since
    // beeatlas-6rs a device with the archives primed has a full basemap offline,
    // so telling it there is none would be a lie.
    expect(src).toMatch(/this\.offline\s*&&\s*!this\.basemapPrimed/);
  });

  test('bee-map.ts overlay text points at the download, not at panning (OFF-04, beeatlas-6rs)', () => {
    // The old copy — "pan here while online to cache tiles for an area" —
    // described a Mapbox-era tile-by-tile cache that no longer exists and that
    // Mapbox's terms never licensed anyway (docs/adr/0001). The basemap is now
    // one archive, downloaded deliberately from the account menu.
    expect(src).toMatch(/No basemap offline/);
    expect(src).not.toMatch(/Pan here while online/);
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

// The attribution collapses itself on narrow screens. MapLibre will not:
// _updateCompact adds `maplibregl-compact-show` alongside `maplibregl-compact`,
// so below 640px the control renders OPEN — two lines over the bottom of a phone
// map at every launch — and is minimized only by the first `drag`. Mapbox started
// collapsed, and the swap silently changed that (beeatlas-ecn follow-up).
describe('attribution starts collapsed when compact', () => {
  test('bee-map.ts hooks all three events after which compact mode can appear', () => {
    // The classes are NOT applied at construction: with no sources the control is
    // `maplibregl-attrib-empty`, which _updateCompact skips. They arrive with the
    // first attribution text, on sourcedata.
    for (const ev of ['sourcedata', 'styledata', 'resize']) {
      expect(src).toMatch(new RegExp(`on\\(\\s*['"]${ev}['"]\\s*,\\s*this\\._collapseCompactAttribution\\s*\\)`));
    }
  });

  test('_collapseCompactAttribution latches, so panning does not re-close a user-opened panel', () => {
    // sourcedata fires continuously while panning.
    expect(src).toMatch(/if\s*\(this\._attributionCollapsed\)\s*return;/);
    expect(src).toMatch(/this\._attributionCollapsed\s*=\s*true/);
    // and re-arms when MapLibre drops compact mode (canvas went wide again)
    expect(src).toMatch(/this\._attributionCollapsed\s*=\s*false/);
  });

  test('_collapseCompactAttribution removes only compact-show, keeping the toggle', () => {
    // Removing `maplibregl-compact` too would delete the ⓘ button and with it the
    // only way back to the attribution text — which IS an attribution requirement.
    expect(src).toMatch(/classList\.remove\(\s*['"]maplibregl-compact-show['"]\s*\)/);
    expect(src).not.toMatch(/classList\.remove\([^)]*['"]maplibregl-compact['"]/);
  });
});

// beeatlas-pwm: `pmtiles extract` keeps whole intersecting tiles without clipping
// their contents, so at low zoom the tile holding Washington holds its whole
// quadrant — z1 drew Greenland. A floor makes the pathological range unreachable.
describe('the map has a zoom floor', () => {
  test('bee-map.ts passes minZoom to the Map constructor', () => {
    const ctor = src.slice(src.indexOf('new maplibregl.Map({'));
    expect(ctor.slice(0, 400)).toMatch(/minZoom:\s*MIN_ZOOM/);
  });

  test('MIN_ZOOM is 5 — a floor for every viewport, so the smallest decides it', () => {
    // At z6 a 393px phone sees 8.6deg of longitude against Washington's 7.9deg:
    // the state fits edge to edge with no margin. Raising this needs that check
    // re-run on the smallest supported screen, not on a desktop.
    expect(src).toMatch(/const MIN_ZOOM = 5;/);
  });
});

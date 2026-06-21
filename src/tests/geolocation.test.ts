import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const beeMapSrc = readFileSync(resolve(__dirname, '../bee-map.ts'), 'utf-8');
const beeAtlasSrc = readFileSync(resolve(__dirname, '../bee-atlas.ts'), 'utf-8');
const beePaneSrc = readFileSync(resolve(__dirname, '../bee-pane.ts'), 'utf-8');
const filterSrc = readFileSync(resolve(__dirname, '../filter.ts'), 'utf-8');

describe('T-153-01: location privacy invariant (Phase 153)', () => {
  test('bee-atlas.ts declares _nearMeCenter as private field (not @state, not on FilterState)', () => {
    expect(beeAtlasSrc).toMatch(/private\s+_nearMeCenter\b/);
  });

  test('bee-atlas.ts _nearMeCenter is NOT declared as @state (D-07 privacy)', () => {
    expect(beeAtlasSrc).not.toMatch(/@state[\s\S]{0,30}_nearMeCenter/);
  });

  test('filter.ts FilterState has nearMe but not lat: or lon: (coordinates excluded by D-07)', () => {
    // nearMe must be in the FilterState type/interface block
    expect(filterSrc).toMatch(/nearMe/);
    // The FilterState interface/type block must not contain lat: or lon: as direct fields
    // (those are ephemeral, never serialized)
    const filterStateBlock = filterSrc.match(/(?:interface|type)\s+FilterState[\s\S]{0,800}/)?.[0] ?? '';
    expect(filterStateBlock).not.toMatch(/\blat\s*:/);
    expect(filterStateBlock).not.toMatch(/\blon\s*:/);
  });
});

describe('T-153-04: pure-presenter invariant — bee-map triggerGeolocate stores no state (Phase 153)', () => {
  test('bee-map.ts exposes triggerGeolocate() method (command-in, state-owner pattern)', () => {
    expect(beeMapSrc).toMatch(/triggerGeolocate\s*\(\s*\)/);
  });

  test('bee-map.ts does NOT store _nearMe state (pure-presenter)', () => {
    expect(beeMapSrc).not.toMatch(/private\s+_nearMe\b/);
  });

  test('bee-map.ts does NOT store _userLocation state (pure-presenter, extends LOC-02)', () => {
    expect(beeMapSrc).not.toMatch(/private\s+_userLocation\b/);
  });
});

describe('D-04 / Pitfall-3: freeze invariant — bee-atlas re-queries only under _nearMePending guard (Phase 153)', () => {
  test('bee-atlas.ts declares _nearMePending private field', () => {
    expect(beeAtlasSrc).toMatch(/private\s+_nearMePending\b/);
  });

  test('bee-atlas.ts _onUserLocationChanged only calls _runFilterQuery inside a _nearMePending guard', () => {
    // Find the _onUserLocationChanged METHOD definition (not field references)
    const handlerIdx = beeAtlasSrc.indexOf('private _onUserLocationChanged(');
    expect(handlerIdx).toBeGreaterThanOrEqual(0);
    const handlerBody = beeAtlasSrc.slice(handlerIdx, handlerIdx + 1500);
    // Must contain _nearMePending check before calling _runFilterQuery
    expect(handlerBody).toMatch(/_nearMePending/);
    // _runFilterQuery must appear inside the handler body
    const runFilterIdx = handlerBody.indexOf('_runFilterQuery');
    expect(runFilterIdx).toBeGreaterThanOrEqual(0);
    const beforeRunFilter = handlerBody.slice(0, runFilterIdx);
    // The _nearMePending guard must appear before _runFilterQuery in the handler
    expect(beforeRunFilter).toMatch(/_nearMePending/);
  });

  test('bee-atlas.ts near-me-changed event is wired in render template (@near-me-changed)', () => {
    expect(beeAtlasSrc).toMatch(/@near-me-changed/);
  });
});

describe('Q3: dedicated-event invariant — near-me-changed separate from filter-changed (Phase 153)', () => {
  test('bee-pane.ts emits near-me-changed (not threaded through filter-changed)', () => {
    expect(beePaneSrc).toMatch(/near-me-changed/);
  });

  test('bee-atlas.ts listens for @near-me-changed in the template', () => {
    expect(beeAtlasSrc).toMatch(/@near-me-changed/);
  });

  test('bee-atlas.ts has _onNearMeToggle handler method', () => {
    expect(beeAtlasSrc).toMatch(/_onNearMeToggle\s*\(/);
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

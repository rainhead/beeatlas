// Phase 80 Wave 0 — RED contract for PAGE-05 / D-07.
// Locks the coordinator's reactive state shape so Plan 03 implements
// against the contract rather than against interpretation.

import { describe, test, expect } from 'vitest';
import { BeeSpeciesPage } from '../species/bee-species-page.ts';

describe('bee-species-page state shape (PAGE-05, D-07)', () => {
  test('declares _activeTaxonPath / _geoFilter / _seasonFilter with empty defaults', () => {
    const el = new BeeSpeciesPage();
    // @state private fields — accessed via `as any` since they are private.
    expect((el as any)._activeTaxonPath).toEqual([]);
    expect((el as any)._geoFilter).toBeNull();
    expect((el as any)._seasonFilter).toBeNull();
  });
});

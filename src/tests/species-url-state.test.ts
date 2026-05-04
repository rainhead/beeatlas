import { test, expect, describe } from 'vitest';
import { buildParams, parseParams, type SpeciesPageState } from '../species/url-state.ts';

function emptyState(): SpeciesPageState {
  return {
    taxonPath: { family: null, subfamily: null, tribe: null, genus: null, subgenus: null },
    counties: new Set(),
    ecoregions: new Set(),
    monthFrom: 1,
    monthTo: 12,
  };
}

describe('species url-state round-trip (D-06, FILT-02, FILT-03)', () => {
  test('empty state produces empty URL', () => {
    const params = buildParams(emptyState());
    expect(params.toString()).toBe('');
  });

  test('taxonPath family round-trips', () => {
    const s = { ...emptyState(), taxonPath: { ...emptyState().taxonPath, family: 'Apidae' } };
    const params = buildParams(s);
    expect(params.get('fam')).toBe('Apidae');
    const r = parseParams(params.toString());
    expect(r.taxonPath.family).toBe('Apidae');
  });

  test('full taxonPath round-trips', () => {
    const s: SpeciesPageState = {
      taxonPath: { family: 'Apidae', subfamily: 'Apinae', tribe: 'Bombini', genus: 'Bombus', subgenus: 'Pyrobombus' },
      counties: new Set(),
      ecoregions: new Set(),
      monthFrom: 1, monthTo: 12,
    };
    const params = buildParams(s);
    expect(params.get('fam')).toBe('Apidae');
    expect(params.get('subf')).toBe('Apinae');
    expect(params.get('tribe')).toBe('Bombini');
    expect(params.get('gen')).toBe('Bombus');
    expect(params.get('subg')).toBe('Pyrobombus');
    const r = parseParams(params.toString());
    expect(r.taxonPath).toEqual(s.taxonPath);
  });

  test('counties CSV round-trips and sorts deterministically', () => {
    const s = { ...emptyState(), counties: new Set(['King', 'Pierce', 'Snohomish']) };
    const params = buildParams(s);
    expect(params.get('county')).toBe('King,Pierce,Snohomish');
    const r = parseParams(params.toString());
    expect([...r.counties].sort()).toEqual(['King', 'Pierce', 'Snohomish']);
  });

  test('ecoregions CSV round-trips', () => {
    const s = { ...emptyState(), ecoregions: new Set(['Cascades', 'Puget Lowland']) };
    const params = buildParams(s);
    expect(params.get('ecor')).toBe('Cascades,Puget Lowland');
    const r = parseParams(params.toString());
    expect([...r.ecoregions].sort()).toEqual(['Cascades', 'Puget Lowland']);
  });

  test('m0/m1 round-trip when non-default', () => {
    const s = { ...emptyState(), monthFrom: 4, monthTo: 8 };
    const params = buildParams(s);
    expect(params.get('m0')).toBe('4');
    expect(params.get('m1')).toBe('8');
    const r = parseParams(params.toString());
    expect(r.monthFrom).toBe(4);
    expect(r.monthTo).toBe(8);
  });

  test('m0/m1 default (1, 12) is omitted from URL', () => {
    const s = emptyState();
    const params = buildParams(s);
    expect(params.has('m0')).toBe(false);
    expect(params.has('m1')).toBe(false);
  });

  test('invalid m0/m1 values fall back to defaults', () => {
    const r = parseParams('m0=99&m1=abc');
    expect(r.monthFrom).toBe(1);
    expect(r.monthTo).toBe(12);
  });

  test('multi-dimensional state round-trips', () => {
    const s: SpeciesPageState = {
      taxonPath: { family: null, subfamily: null, tribe: null, genus: 'Andrena', subgenus: null },
      counties: new Set(['King']),
      ecoregions: new Set(['Cascades']),
      monthFrom: 4, monthTo: 8,
    };
    const params = buildParams(s);
    const r = parseParams(params.toString());
    expect(r.taxonPath.genus).toBe('Andrena');
    expect([...r.counties]).toEqual(['King']);
    expect([...r.ecoregions]).toEqual(['Cascades']);
    expect(r.monthFrom).toBe(4);
    expect(r.monthTo).toBe(8);
  });
});

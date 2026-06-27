import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRomanDate } from '../bee-occurrence-detail.ts';
import type { OccurrenceRow } from '../filter.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A specimen-backed (ecdysis) row → occId 'ecdysis:42'. Only the fields the
// detail render reads are populated; the rest default to null/false.
function ecdysisRow(ecdysisId: number): OccurrenceRow {
  return {
    taxon_id: null, lat: 47.6, lon: -122.3, date: '2024-06-01',
    county: null, ecoregion_l3: null, ecdysis_id: ecdysisId,
    catalog_number: null, recordedBy: 'A. Collector', fieldNumber: null,
    floralHost: null, host_observation_id: null, inat_host: null,
    inat_quality_grade: null, modified: null, specimen_observation_id: null,
    elevation_m: null, year: 2024, month: 6, observation_id: null,
    host_inat_login: null, is_provisional: false,
    specimen_inat_quality_grade: null, specimen_count: null, sample_id: null,
    sample_host: null, checklist_id: null, verbatim_name: null, locality: null,
    collapsed_count: null, tier: 'atlas', record_type: 'specimen', image_url: null, obs_url: null,
    user_login: null, license: null, display_name: null, display_rank: null,
  };
}

// Wave 0 Nyquist scaffold — tests target post-Plan-04 behavior.
// The null / year-only / month-precision cases are intentionally RED until
// Plan 04 extends formatRomanDate to the full signature:
//   (dateStr: string | null) => string
// The full-date case ('2019-06-15') passes against the current implementation.

describe('formatRomanDate', () => {
  test('full date string returns day-in-roman-month format', () => {
    // '2019-06-15' → 15 June 2019 → '15 VI 2019'
    expect(formatRomanDate('2019-06-15')).toBe('15 VI 2019');
  });

  test('null input returns empty string (D-08: null-safe signature)', () => {
    // Current implementation signature is (dateStr: string) and throws or
    // misbehaves on null. After Plan 04: (dateStr: string | null) => '' for null.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(formatRomanDate(null as any)).toBe('');
  });

  test('empty string returns empty string', () => {
    // No date data — return '' rather than an invalid-date string.
    expect(formatRomanDate('')).toBe('');
  });

  test('year-only string (length 4) returns the year as-is (D-08: precision fallback)', () => {
    // '2019' — only year precision available; no month/day to format
    // After Plan 04: length-4 strings return the year unchanged.
    expect(formatRomanDate('2019')).toBe('2019');
  });

  test('month-precision string (length 7) returns roman-month year format (D-08)', () => {
    // '2019-06' — year + month precision; no day available
    // After Plan 04: returns 'VI 2019'
    expect(formatRomanDate('2019-06')).toBe('VI 2019');
  });
});

describe('bee-occurrence-detail.ts source structure', () => {
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');

  test('declares filterState property', () => {
    expect(src).toMatch(/@property[^)]*\)\s+filterState/);
  });

  test('dispatches filter-changed event', () => {
    expect(src).toMatch(/new CustomEvent[^)]*['"]filter-changed['"]/);
  });

  test('filter-changed event uses bubbles:true and composed:true', () => {
    expect(src).toMatch(/bubbles:\s*true/);
    expect(src).toMatch(/composed:\s*true/);
  });

  test('FilterChangedEvent detail carries taxonId from row.taxon_id (D-05)', () => {
    // _onTaxonClick is called with row.taxon_id! as first arg — verifies exact taxon, no roll-up
    expect(src).toMatch(/\._onTaxonClick\(row\.taxon_id/);
  });

  test('FilterChangedEvent detail preserves filterState dimensions (D-07)', () => {
    expect(src).toMatch(/yearFrom:\s*this\.filterState/);
    expect(src).toMatch(/selectedCounties:\s*this\.filterState/);
    expect(src).toMatch(/selectedCollectors:\s*this\.filterState/);
  });

  test('_renderSampleOnly has no filter-changed dispatch (D-04 — no taxon)', () => {
    const sampleBody = src.match(/_renderSampleOnly[\s\S]*?\n  private /)?.[0] ?? '';
    expect(sampleBody).not.toMatch(/filter-changed/);
  });

  test('Ecdysis link in _renderCollectorGroup is demoted (no longer wraps ${displayName} as text)', () => {
    const collectorGroupBody = src.match(/_renderCollectorGroup[\s\S]*?\n  private /)?.[0] ?? '';
    expect(collectorGroupBody).not.toMatch(/href="https:\/\/ecdysis[^"]*"[^>]*>\$\{displayName\}/);
  });

  test('taxon-filter spans are keyboard-activatable (WR-159-01)', () => {
    // every role="button" filter span wires @keydown so Enter/Space activate it
    const spanCount = (src.match(/class="taxon-filter-link" role="button"/g) ?? []).length;
    const keydownCount = (src.match(/role="button" tabindex="0" @keydown=\$\{this\._onTaxonKeydown\}/g) ?? []).length;
    expect(spanCount).toBeGreaterThan(0);
    expect(keydownCount).toBe(spanCount);
  });

  test('_onTaxonKeydown activates on Enter and Space (WR-159-01)', () => {
    expect(src).toMatch(/_onTaxonKeydown[\s\S]*?e\.key === 'Enter' \|\| e\.key === ' '/);
  });

  test('focus styling uses :focus-visible with a visible outline (WR-159-02)', () => {
    expect(src).toMatch(/\.taxon-filter-link:focus-visible/);
    expect(src).not.toMatch(/\.taxon-filter-link:focus\s*\{[^}]*outline:\s*none/);
  });
});

describe('bee-occurrence-detail D-04 member-place rendering', () => {
  // State-ownership invariant (CLAUDE.md): the presenter must NOT query the
  // SQL engine itself — it only reads the passed-down placeNames property.
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');

  test('presenter declares placeNames property and never queries wa-sqlite', () => {
    expect(src).toMatch(/@property[^)]*\)\s+placeNames/);
    // No SQL-engine access inside the presenter (state-ownership invariant).
    expect(src).not.toMatch(/getOccurrencePlaceSlugs|getDB|sqlite3\.exec|tablesReady/);
  });

  test('multi-place occurrence lists ALL member place names (D-04)', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(42)];
    el.placeNames = new Map([['ecdysis:42', ["Ebey's Landing", 'Whidbey WLA']]]);
    await el.updateComplete;
    const names = [...el.shadowRoot.querySelectorAll('.member-place')].map((n: any) => n.textContent.trim());
    expect(names).toContain("Ebey's Landing");
    expect(names).toContain('Whidbey WLA');
    expect(names.length).toBe(2);
  });

  test('occurrence in no place renders no member-place list (D-04)', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(7)];
    el.placeNames = new Map(); // no membership for ecdysis:7
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.member-places')).toBeNull();
    expect(el.shadowRoot.querySelectorAll('.member-place').length).toBe(0);
  });

  test('single-place occurrence lists exactly that one name (D-04)', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(99)];
    el.placeNames = new Map([['ecdysis:99', ['Klickitat Trail']]]);
    await el.updateComplete;
    const names = [...el.shadowRoot.querySelectorAll('.member-place')].map((n: any) => n.textContent.trim());
    expect(names).toEqual(['Klickitat Trail']);
  });
});

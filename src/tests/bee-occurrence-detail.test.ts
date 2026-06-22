import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRomanDate } from '../bee-occurrence-detail.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
});

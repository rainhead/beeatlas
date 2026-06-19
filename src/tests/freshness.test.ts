// freshness.test.ts — Unit coverage for formatFreshness + parseGeneratedAt in src/manifest.ts
//
// These tests pin the LOCKED UI-SPEC §Copywriting Contract strings:
//   Today / Yesterday / "3 days ago" / "Data as of Jun 15, 2026" / "Data as of Mar 2026" / null
//
// RED gate: tests fail until Task 3 adds the helpers to manifest.ts.

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatFreshness, parseGeneratedAt } from '../manifest.ts';

describe('formatFreshness', () => {
  // Pin the system clock so delta calculations are deterministic
  beforeEach(() => {
    vi.useFakeTimers();
    // "now" = 2026-06-18T12:00:00Z
    vi.setSystemTime(new Date('2026-06-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Boundary: < 1 day → 'Today'
  // -------------------------------------------------------------------------
  test("< 1 day → 'Today'", () => {
    // Generated 6 hours before "now"
    const result = formatFreshness('2026-06-18T06:00:00Z');
    expect(result).toBe('Today');
  });

  // -------------------------------------------------------------------------
  // Boundary: 1 day → 'Yesterday'
  // -------------------------------------------------------------------------
  test("1 day → 'Yesterday'", () => {
    // Generated exactly 1 day + 6 hours before "now" → deltaDays = 1
    const result = formatFreshness('2026-06-17T06:00:00Z');
    expect(result).toBe('Yesterday');
  });

  // -------------------------------------------------------------------------
  // Boundary: 3 days → '3 days ago' via Intl.RelativeTimeFormat
  // -------------------------------------------------------------------------
  test("3 days → '3 days ago'", () => {
    // Generated 3 days before "now"
    const result = formatFreshness('2026-06-15T12:00:00Z');
    expect(result).toMatch(/^3 days ago$/);
  });

  // -------------------------------------------------------------------------
  // Boundary: 6 days → '6 days ago' (still in relative range)
  // -------------------------------------------------------------------------
  test("6 days → '6 days ago'", () => {
    const result = formatFreshness('2026-06-12T12:00:00Z');
    expect(result).toBe('6 days ago');
  });

  // -------------------------------------------------------------------------
  // Boundary: ≥ 7 days, < 1 year → 'Data as of Jun 11, 2026'
  // -------------------------------------------------------------------------
  test("≥ 7 days, < 1 year → 'Data as of <month> <day>, <year>'", () => {
    // Exactly 7 days before "now"
    const result = formatFreshness('2026-06-11T12:00:00Z');
    // Assert prefix + shape; Intl.DateTimeFormat output is locale+tz dependent
    expect(result).toMatch(/^Data as of \w+ \d+, 2026$/);
  });

  // -------------------------------------------------------------------------
  // Boundary: ≥ 1 year → 'Data as of Mar 2025' (no day component)
  // -------------------------------------------------------------------------
  test("≥ 1 year → 'Data as of <month> <year>'", () => {
    // More than 365 days before "now" (2026-06-18)
    const result = formatFreshness('2025-03-18T12:00:00Z');
    expect(result).toMatch(/^Data as of \w+ 2025$/);
  });

  // -------------------------------------------------------------------------
  // Dev sentinel: 'local' → null + console.warn
  // -------------------------------------------------------------------------
  test("'local' sentinel → null + console.warn", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = formatFreshness('local');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    // warn message should reference the unparseable value
    const warnArg = String(warnSpy.mock.calls[0]?.join(' ') ?? '');
    expect(warnArg).toMatch(/unparseable|local/i);
  });

  // -------------------------------------------------------------------------
  // Unparseable garbage → null + console.warn
  // -------------------------------------------------------------------------
  test("unparseable garbage → null + console.warn", () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = formatFreshness('not-a-date');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe('parseGeneratedAt', () => {
  // -------------------------------------------------------------------------
  // parseGeneratedAt('local') → null
  // -------------------------------------------------------------------------
  test("'local' sentinel → null", () => {
    const result = parseGeneratedAt('local');
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // parseGeneratedAt(valid ISO) → Date matching the input
  // -------------------------------------------------------------------------
  test('valid ISO string → Date matching the input', () => {
    const result = parseGeneratedAt('2026-06-18T12:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result!.toISOString()).toBe('2026-06-18T12:00:00.000Z');
  });
});

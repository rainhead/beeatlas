// Phase 179 Plan 04 — Task 1: formatDate filter contract tests.
// Shared by the Eleventy `formatDate` filter (eleventy.config.js) and the
// bee-notes island (Phase 179-05), so this test file is the single source
// of truth for the "Jul 4, 2026" format contract.

import { describe, test, expect } from 'vitest';
import { formatDate } from '../lib/formatDate.js';

describe('formatDate', () => {
  test('formats a full ISO datetime as "Jul 4, 2026"', () => {
    expect(formatDate('2026-07-04T17:31:14.339Z')).toBe('Jul 4, 2026');
  });

  test('formats a bare date string as "Jan 9, 2026"', () => {
    expect(formatDate('2026-01-09')).toBe('Jan 9, 2026');
  });

  test('returns "" for an empty string (never throws)', () => {
    expect(formatDate('')).toBe('');
  });

  test('returns "" for undefined (never throws)', () => {
    expect(formatDate(undefined)).toBe('');
  });

  test('returns "" for an unparseable date string (never throws)', () => {
    expect(formatDate('not-a-date')).toBe('');
  });
});

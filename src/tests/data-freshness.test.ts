/**
 * beeatlas-923 — the "Data as of" label must describe the DATA, not the build.
 *
 * The regression this guards against is quiet by construction: generated_at used to be
 * SOURCE_DATE_EPOCH, which every publish path sets to its own wall clock, so a code-only
 * deploy reset the freshness clock without touching a byte of data. Nothing looked
 * broken — the header just said "Today" when the data was a week old. So what is pinned
 * here is where the value COMES FROM, plus the rule that anything untrustworthy degrades
 * to the hidden sentinel rather than to a confident wrong date.
 */
import { test, expect, describe, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error -- .js source has no .d.ts; named exports are the contract
import { readGeneratedAt, NO_STAMP } from '../../lib/data-freshness.js';
import { formatFreshness } from '../manifest.ts';

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'beeatlas-freshness-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const stamp = (contents: string) => writeFileSync(join(dir, 'generated_at'), contents);

describe('readGeneratedAt', () => {
  test('reads the pipeline stamp as ISO-8601', () => {
    stamp('1785578401'); // 2026-08-01T10:00:01Z
    expect(readGeneratedAt(dir)).toBe('2026-08-01T10:00:01.000Z');
  });

  test('tolerates the trailing newline `date +%s >` writes', () => {
    stamp('1785578401\n');
    expect(readGeneratedAt(dir)).toBe('2026-08-01T10:00:01.000Z');
  });

  test('no stamp means unknown, not now', () => {
    // The case that matters most: a data dir nobody refreshed — `npm run dev`, or one
    // filled by `npm run pull-published`. Falling back to the current time here is
    // exactly the bug, one layer down.
    expect(readGeneratedAt(dir)).toBe(NO_STAMP);
  });

  test.each([
    ['empty', ''],
    ['whitespace', '   \n'],
    ['not a number', 'yesterday'],
    ['zero', '0'],
    ['negative', '-1'],
  ])('a %s stamp degrades to the sentinel', (_label, contents) => {
    stamp(contents);
    expect(readGeneratedAt(dir)).toBe(NO_STAMP);
  });
});

describe('the sentinel reaches the UI as "no label"', () => {
  test('formatFreshness hides an unknown stamp rather than inventing a date', () => {
    // Pins the handoff between the two halves: lib/ emits NO_STAMP, and the client
    // (D-12) must render nothing for it. A sentinel the UI happened to parse would put
    // a wrong date on screen, which is worse than an absent label.
    expect(formatFreshness(readGeneratedAt(dir))).toBeNull();
  });

  test('a real stamp does produce a label', () => {
    stamp('1785578401');
    const now = new Date('2026-08-03T10:00:01Z'); // two days later
    expect(formatFreshness(readGeneratedAt(dir), now)).toBe('2 days ago');
  });
});

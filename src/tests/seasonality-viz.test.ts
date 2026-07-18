import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('seasonality-viz (VIZ-01..05)', () => {
  test('declares data @property (number[12])', async () => {
    await import('../species/seasonality-viz.ts');
    const Cls = customElements.get('seasonality-viz') as any;
    expect(Cls).toBeDefined();
    expect(Cls.elementProperties.has('data')).toBe(true);
  });

  test('VIZ-02 bar branch: data with total >= 5 renders 12 <rect class="bar">', async () => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = [5,5,5,5,5,5,5,5,5,5,5,5];
    await el.updateComplete;
    const bars = el.querySelectorAll('rect.bar');
    expect(bars.length).toBe(12);
  });

  test('VIZ-02 fallback: data with total < 5 renders <p class="viz-fallback">', async () => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = [1,1,1,0,0,0,0,0,0,0,0,0];
    await el.updateComplete;
    const fallback = el.querySelector('p.viz-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent ?? '').toMatch(/3 records/);
  });

  test('VIZ-03 axis labels J F M A M J J A S O N D', async () => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = [10,10,10,10,10,10,10,10,10,10,10,10];
    await el.updateComplete;
    const labels = [...el.querySelectorAll('text.axis')].map((t: any) => t.textContent);
    expect(labels).toEqual(['J','F','M','A','M','J','J','A','S','O','N','D']);
  });

  test('VIZ-03 season-band tints: 4 background rects (winter, spring, summer, fall)', async () => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = [10,10,10,10,10,10,10,10,10,10,10,10];
    await el.updateComplete;
    expect(el.querySelector('rect.band-winter')).not.toBeNull();
    expect(el.querySelector('rect.band-spring')).not.toBeNull();
    expect(el.querySelector('rect.band-summer')).not.toBeNull();
    expect(el.querySelector('rect.band-fall')).not.toBeNull();
  });

  // The star glyphs (*/**/***) were replaced by a literal count: the stars
  // rendered with no key anywhere on the page, so they read as noise.
  test.each([
    [24, 'Based on 24 dated records.'],
    [72, 'Based on 72 dated records.'],
    [504, 'Based on 504 dated records.'],
  ])('VIZ-05 sample-size annotation: total=%i shows "%s"', async (total, expected) => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = new Array(12).fill(total / 12);
    await el.updateComplete;
    expect(el.querySelector('.sample-size')?.textContent).toBe(expected);
  });

  test('VIZ-04 contract: source contains no kde/kernel terminology (pre-binned only)', () => {
    const src = readFileSync(resolve(ROOT, 'src/species/seasonality-viz.ts'), 'utf8');
    expect(src.toLowerCase()).not.toMatch(/\b(kde|kernel)\b/);
  });

  test('VIZ-02 checklist fallback: total=0 + onChecklist=true renders "Monthly phenology not recorded"', async () => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = new Array(12).fill(0);
    el.onChecklist = true;
    await el.updateComplete;
    const fallback = el.querySelector('p.viz-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent ?? '').toBe('Monthly phenology not recorded');
  });

  test('VIZ-02 checklist fallback: total=0 + onChecklist=false renders "0 records" (not checklist note)', async () => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = new Array(12).fill(0);
    el.onChecklist = false;
    await el.updateComplete;
    const fallback = el.querySelector('p.viz-fallback');
    expect(fallback?.textContent ?? '').toBe('0 records');
  });

  describe('VIZ-02 fallback D-08: single-month omits ambiguous letter suffix', () => {
    test('single month (3 records in April): renders "3 records" with no comma', async () => {
      await import('../species/seasonality-viz.ts');
      document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
      const el = document.querySelector('seasonality-viz') as any;
      el.data = [0,0,0,3,0,0,0,0,0,0,0,0];
      await el.updateComplete;
      const text = el.querySelector('p.viz-fallback')?.textContent ?? '';
      expect(text).toBe('3 records');
      expect(text).not.toContain(',');
    });

    test('single month (1 record in April): renders "1 record" with no comma', async () => {
      await import('../species/seasonality-viz.ts');
      document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
      const el = document.querySelector('seasonality-viz') as any;
      el.data = [0,0,0,1,0,0,0,0,0,0,0,0];
      await el.updateComplete;
      const text = el.querySelector('p.viz-fallback')?.textContent ?? '';
      expect(text).toBe('1 record');
      expect(text).not.toContain(',');
    });

    test('multi-month (April + May, 3 records): renders "3 records, A–M"', async () => {
      await import('../species/seasonality-viz.ts');
      document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
      const el = document.querySelector('seasonality-viz') as any;
      el.data = [0,0,0,2,1,0,0,0,0,0,0,0];
      await el.updateComplete;
      const text = el.querySelector('p.viz-fallback')?.textContent ?? '';
      expect(text).toBe('3 records, A–M');
    });

    test('zero records: renders "0 records" with no comma', async () => {
      await import('../species/seasonality-viz.ts');
      document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
      const el = document.querySelector('seasonality-viz') as any;
      el.data = new Array(12).fill(0);
      await el.updateComplete;
      const text = el.querySelector('p.viz-fallback')?.textContent ?? '';
      expect(text).toBe('0 records');
      expect(text).not.toContain(',');
    });
  });
});

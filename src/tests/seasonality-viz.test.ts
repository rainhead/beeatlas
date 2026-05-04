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

  test.each([
    [25, '*'],
    [75, '**'],
    [500, '***'],
    [2000, '****'],
  ])('VIZ-05 sample-size annotation: total=%i shows %s', async (per, expected) => {
    await import('../species/seasonality-viz.ts');
    document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
    const el = document.querySelector('seasonality-viz') as any;
    el.data = new Array(12).fill(Math.floor(per / 12));
    await el.updateComplete;
    const stars = el.querySelector('.sample-stars');
    expect(stars?.textContent ?? '').toBe(expected);
  });

  test('VIZ-04 contract: source contains no kde/kernel terminology (pre-binned only)', () => {
    const src = readFileSync(resolve(ROOT, 'src/species/seasonality-viz.ts'), 'utf8');
    expect(src.toLowerCase()).not.toMatch(/\b(kde|kernel)\b/);
  });
});

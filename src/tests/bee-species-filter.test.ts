import { test, expect, describe } from 'vitest';

describe('bee-species-filter (FILT-01, FILT-04..07)', () => {
  test('declares countyOptions, ecoregionOptions, selectedCounties, selectedEcoregions, monthFrom, monthTo @properties', async () => {
    await import('../species/bee-species-filter.ts');
    const Cls = customElements.get('bee-species-filter') as any;
    expect(Cls).toBeDefined();
    const props = Cls.elementProperties;
    expect(props.has('countyOptions')).toBe(true);
    expect(props.has('ecoregionOptions')).toBe(true);
    expect(props.has('selectedCounties')).toBe(true);
    expect(props.has('selectedEcoregions')).toBe(true);
    expect(props.has('monthFrom')).toBe(true);
    expect(props.has('monthTo')).toBe(true);
  });

  test('renders <details><summary> popovers for county and ecoregion (D-03)', async () => {
    await import('../species/bee-species-filter.ts');
    document.body.innerHTML = `<bee-species-filter></bee-species-filter>`;
    const el = document.querySelector('bee-species-filter') as any;
    el.countyOptions = ['King', 'Pierce'];
    el.ecoregionOptions = ['Cascades'];
    await el.updateComplete;
    const detailsList = el.querySelectorAll('details');
    expect(detailsList.length).toBeGreaterThanOrEqual(2);
    const summaries = el.querySelectorAll('summary');
    const summaryText = [...summaries].map((s: any) => s.textContent ?? '').join(' ');
    expect(summaryText.toLowerCase()).toMatch(/county/);
    expect(summaryText.toLowerCase()).toMatch(/ecoregion/);
  });

  test('toggling a county checkbox dispatches filter-changed CustomEvent', async () => {
    await import('../species/bee-species-filter.ts');
    document.body.innerHTML = `<bee-species-filter></bee-species-filter>`;
    const el = document.querySelector('bee-species-filter') as any;
    el.countyOptions = ['King'];
    el.ecoregionOptions = [];
    await el.updateComplete;
    let detail: any = null;
    el.addEventListener('filter-changed', (e: Event) => { detail = (e as CustomEvent).detail; });
    const cb = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    expect(detail).not.toBeNull();
    expect(detail.counties).toBeDefined();
  });

  test('renders month-range inputs (FILT-01) bound to monthFrom/monthTo', async () => {
    await import('../species/bee-species-filter.ts');
    document.body.innerHTML = `<bee-species-filter></bee-species-filter>`;
    const el = document.querySelector('bee-species-filter') as any;
    el.monthFrom = 4;
    el.monthTo = 8;
    await el.updateComplete;
    const inputs = el.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBeGreaterThanOrEqual(2);
  });
});

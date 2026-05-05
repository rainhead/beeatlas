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

  test('FILT-01 month-range UI: two <select> elements with month-name labels (Plan 06 gap T5)', async () => {
    await import('../species/bee-species-filter.ts');
    document.body.innerHTML = `<bee-species-filter></bee-species-filter>`;
    const el = document.querySelector('bee-species-filter') as any;
    el.monthFrom = 4;
    el.monthTo = 8;
    await el.updateComplete;
    const selects = el.querySelectorAll('.month-range select') as NodeListOf<HTMLSelectElement>;
    expect(selects.length).toBe(2);
    for (const sel of selects) {
      const options = sel.querySelectorAll('option');
      expect(options.length).toBe(12);
      options.forEach((opt, i) => {
        expect(opt.value).toBe(String(i + 1));
        // labels MUST NOT be pure digits — they should be alphabetic month names
        expect((opt.textContent ?? '').trim()).not.toMatch(/^\d+$/);
      });
    }
    expect(selects[0]!.value).toBe('4');
    expect(selects[1]!.value).toBe('8');
  });

  test('FILT-04 inversion guard via select: from=10 with to=7 snaps to=10', async () => {
    await import('../species/bee-species-filter.ts');
    document.body.innerHTML = `<bee-species-filter></bee-species-filter>`;
    const el = document.querySelector('bee-species-filter') as any;
    el.monthFrom = 5;
    el.monthTo = 7;
    await el.updateComplete;
    let detail: any = null;
    el.addEventListener('filter-changed', (e: Event) => { detail = (e as CustomEvent).detail; });
    const selects = el.querySelectorAll('.month-range select') as NodeListOf<HTMLSelectElement>;
    const fromSel = selects[0]!;
    fromSel.value = '10';
    fromSel.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    expect(detail).not.toBeNull();
    expect(detail.monthFrom).toBe(10);
    expect(detail.monthTo).toBe(10);
  });

  test('FILT-05 numeric emit: select change emits numeric monthFrom/monthTo (not strings)', async () => {
    await import('../species/bee-species-filter.ts');
    document.body.innerHTML = `<bee-species-filter></bee-species-filter>`;
    const el = document.querySelector('bee-species-filter') as any;
    el.monthFrom = 1;
    el.monthTo = 12;
    await el.updateComplete;
    let detail: any = null;
    el.addEventListener('filter-changed', (e: Event) => { detail = (e as CustomEvent).detail; });
    const selects = el.querySelectorAll('.month-range select') as NodeListOf<HTMLSelectElement>;
    const toSel = selects[1]!;
    toSel.value = '6';
    toSel.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;
    expect(detail).not.toBeNull();
    expect(typeof detail.monthFrom).toBe('number');
    expect(typeof detail.monthTo).toBe('number');
    expect(detail.monthTo).toBe(6);
  });
});

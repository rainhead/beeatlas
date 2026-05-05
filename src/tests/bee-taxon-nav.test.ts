import { test, expect, describe } from 'vitest';
import { LitElement } from 'lit';

describe('bee-taxon-nav (NAV-01..05)', () => {
  test('does NOT override render() — preserves Eleventy SSR tree', async () => {
    const mod = await import('../species/bee-taxon-nav.ts');
    const cls = (mod as any).BeeTaxonNav;
    expect(cls.prototype.render).toBe((LitElement.prototype as any).render);
  });

  test('declares activeTaxonPath @property', async () => {
    await import('../species/bee-taxon-nav.ts');
    const Cls = customElements.get('bee-taxon-nav') as any;
    expect(Cls).toBeDefined();
    const props = Cls.elementProperties;
    expect(props.has('activeTaxonPath')).toBe(true);
  });

  test('mute-not-hide: filtered branches gain .muted class, not display:none (NAV-04)', async () => {
    await import('../species/bee-taxon-nav.ts');
    document.body.innerHTML = `
      <bee-taxon-nav>
        <ul>
          <li data-taxon="Apidae"><details><summary>Apidae</summary>
            <ul><li data-taxon="Bombus">Bombus</li></ul>
          </details></li>
          <li data-taxon="Andrenidae"><details><summary>Andrenidae</summary></details></li>
        </ul>
      </bee-taxon-nav>`;
    const nav = document.querySelector('bee-taxon-nav') as any;
    nav.activeTaxonPath = ['Apidae'];
    await nav.updateComplete;
    const apidae = nav.querySelector('li[data-taxon="Apidae"]') as HTMLElement;
    const andrenidae = nav.querySelector('li[data-taxon="Andrenidae"]') as HTMLElement;
    expect(andrenidae.classList.contains('muted')).toBe(true);
    expect(apidae.classList.contains('muted')).toBe(false);
    // mute-not-hide: NEVER display:none
    expect(getComputedStyle(andrenidae).display).not.toBe('none');
  });

  test('NAV-03 genus click: dispatches taxon-selected and prevents default (in-place filter)', async () => {
    await import('../species/bee-taxon-nav.ts');
    document.body.innerHTML = `
      <bee-taxon-nav>
        <ul><li data-taxon="Bombus" data-rank="genus"><span class="taxon-label">Bombus</span></li></ul>
      </bee-taxon-nav>`;
    const nav = document.querySelector('bee-taxon-nav') as HTMLElement;
    let detail: any = null;
    nav.addEventListener('taxon-selected', (e: Event) => { detail = (e as CustomEvent).detail; });
    const li = nav.querySelector('li[data-taxon="Bombus"]') as HTMLElement;
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    li.dispatchEvent(evt);
    expect(detail).not.toBeNull();
    expect(Array.isArray(detail.path)).toBe(true);
    expect(detail.path).toContain('Bombus');
    expect(detail.rank).toBe('genus');
    expect(evt.defaultPrevented).toBe(true);
  });

  test('NAV-03 family click: dispatches taxon-selected with rank=family and prevents default', async () => {
    await import('../species/bee-taxon-nav.ts');
    document.body.innerHTML = `
      <bee-taxon-nav>
        <ul><li data-taxon="Apidae" data-rank="family"><span class="taxon-label">Apidae</span></li></ul>
      </bee-taxon-nav>`;
    const nav = document.querySelector('bee-taxon-nav') as HTMLElement;
    let detail: any = null;
    nav.addEventListener('taxon-selected', (e: Event) => { detail = (e as CustomEvent).detail; });
    const li = nav.querySelector('li[data-taxon="Apidae"]') as HTMLElement;
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    li.dispatchEvent(evt);
    expect(detail).not.toBeNull();
    expect(detail.path).toContain('Apidae');
    expect(detail.rank).toBe('family');
    expect(evt.defaultPrevented).toBe(true);
  });

  test('NAV-03 species click: dispatches taxon-selected with rank=species and prevents default', async () => {
    await import('../species/bee-taxon-nav.ts');
    document.body.innerHTML = `
      <bee-taxon-nav>
        <ul><li data-taxon="Bombus vosnesenskii" data-rank="species"><span class="taxon-label">Bombus vosnesenskii</span></li></ul>
      </bee-taxon-nav>`;
    const nav = document.querySelector('bee-taxon-nav') as HTMLElement;
    let detail: any = null;
    nav.addEventListener('taxon-selected', (e: Event) => { detail = (e as CustomEvent).detail; });
    const li = nav.querySelector('li[data-taxon="Bombus vosnesenskii"]') as HTMLElement;
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    li.dispatchEvent(evt);
    expect(detail).not.toBeNull();
    expect(detail.path).toContain('Bombus vosnesenskii');
    expect(detail.rank).toBe('species');
    expect(evt.defaultPrevented).toBe(true);
  });

  test('NAV-05: light-DOM (createRenderRoot returns this) preserves SSR markup', async () => {
    const mod = await import('../species/bee-taxon-nav.ts');
    const cls = (mod as any).BeeTaxonNav;
    const inst = new cls();
    expect((inst as any).createRenderRoot()).toBe(inst);
  });
});

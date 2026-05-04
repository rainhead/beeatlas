// Phase 81 Wave 3 — coordinator integration tests for FILT-04..07 + LINK-01.
// Replaces the Phase 80 RED null-default state-shape contract; Plan 05
// changed defaults from `null` to empty Set/12-month range so the
// coordinator can compute filteredCount unconditionally.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { LitElement } from 'lit';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Stub fetch with a small seasonality fixture before any module that calls
// loadSeasonality() is imported.
const SEASONALITY_FIXTURE = {
  'andrena anograe': {
    '_total':                    [0, 0, 0, 5, 10, 15, 10, 5, 0, 0, 0, 0],
    'county:King':               [0, 0, 0, 2, 5, 7, 5, 2, 0, 0, 0, 0],
    'ecoregion_l3:Cascades':     [0, 0, 0, 1, 3, 4, 3, 1, 0, 0, 0, 0],
  },
  'bombus mixtus': {
    '_total': [0, 0, 0, 0, 8, 12, 10, 6, 2, 0, 0, 0],
  },
  'rare specieus': {
    '_total': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};

function setupDocument(): void {
  document.body.innerHTML = `
    <bee-species-page>
      <bee-species-filter
        data-county-options='["King","Pierce"]'
        data-ecoregion-options='["Cascades","Puget Lowland"]'
      ></bee-species-filter>
      <div class="breadcrumb-pills"></div>
      <div class="empty-state" hidden>
        No species match these filters.
        <button type="button" class="clear-filters">Clear filters</button>
      </div>
      <bee-species-card>
        <h2>Andrena anograe</h2>
        <span class="count-badge">100 records</span>
        <seasonality-viz></seasonality-viz>
        <a class="spa-link" href="/?taxon=Andrena%20anograe&taxonRank=species">View 100 occurrences →</a>
      </bee-species-card>
      <bee-species-card>
        <h2>Bombus mixtus</h2>
        <span class="count-badge">50 records</span>
        <seasonality-viz></seasonality-viz>
        <a class="spa-link" href="/?taxon=Bombus%20mixtus&taxonRank=species">View 50 occurrences →</a>
      </bee-species-card>
      <bee-species-card>
        <h2>Rare specieus</h2>
        <span class="count-badge">0 records</span>
        <seasonality-viz></seasonality-viz>
        <a class="spa-link" href="/?taxon=Rare%20specieus&taxonRank=species">View 0 occurrences →</a>
      </bee-species-card>
    </bee-species-page>
  `;
}

async function flush(page: HTMLElement & { updateComplete?: Promise<unknown> }): Promise<void> {
  await page.updateComplete;
  await new Promise(r => setTimeout(r, 10));
  await page.updateComplete;
  await new Promise(r => setTimeout(r, 10));
  await page.updateComplete;
}

describe('<bee-species-page> integration (Phase 81)', () => {
  beforeEach(() => {
    // Mock fetch globally for loadSeasonality().
    (globalThis as unknown as { fetch: unknown }).fetch = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => SEASONALITY_FIXTURE,
    }));
    window.history.replaceState({}, '', '/species/');
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('coordinator does NOT override render()', async () => {
    const mod = await import('../species/bee-species-page.ts');
    const cls = mod.BeeSpeciesPage as unknown as { prototype: { render: unknown } };
    expect(cls.prototype.render).toBe((LitElement.prototype as unknown as { render: unknown }).render);
  });

  test('FILT-04: when no filter is active, empty state stays hidden and non-zero cards not muted', async () => {
    await import('../species/bee-species-card.ts');
    await import('../species/bee-species-page.ts');
    setupDocument();
    const page = document.querySelector('bee-species-page') as HTMLElement & { updateComplete: Promise<unknown> };
    await flush(page);
    const empty = document.querySelector('.empty-state') as HTMLElement;
    expect(empty.hasAttribute('hidden')).toBe(true);
    // Cards with non-zero seasonality _total should NOT be muted.
    const andrena = document.querySelector('bee-species-card:nth-of-type(1)') as HTMLElement;
    const bombus = document.querySelector('bee-species-card:nth-of-type(2)') as HTMLElement;
    expect(andrena.classList.contains('muted')).toBe(false);
    expect(bombus.classList.contains('muted')).toBe(false);
  });

  test('FILT-04 + FILT-05: month filter excluding all species shows empty state and mutes cards', async () => {
    await import('../species/bee-species-card.ts');
    await import('../species/bee-species-page.ts');
    setupDocument();
    const page = document.querySelector('bee-species-page') as HTMLElement & { updateComplete: Promise<unknown>; _seasonFilter: { monthFrom: number; monthTo: number } };
    await flush(page);
    // Apply Jan-Feb month filter; none of the 3 species has data in those months.
    page._seasonFilter = { monthFrom: 1, monthTo: 2 };
    await flush(page);
    const empty = document.querySelector('.empty-state') as HTMLElement;
    expect(empty.hasAttribute('hidden')).toBe(false);
    const cards = document.querySelectorAll('bee-species-card');
    for (const card of cards) {
      expect(card.classList.contains('muted')).toBe(true);
    }
  });

  test('FILT-06: breadcrumb pill row reflects active county filter', async () => {
    await import('../species/bee-species-card.ts');
    await import('../species/bee-species-page.ts');
    setupDocument();
    const page = document.querySelector('bee-species-page') as HTMLElement & { updateComplete: Promise<unknown>; _geoFilter: { counties: Set<string>; ecoregions: Set<string> } };
    await flush(page);
    page._geoFilter = { counties: new Set(['King']), ecoregions: new Set() };
    await flush(page);
    const pills = document.querySelector('.breadcrumb-pills') as HTMLElement;
    expect(pills.innerHTML).toMatch(/King/);
    expect(pills.querySelectorAll('.pill').length).toBeGreaterThanOrEqual(1);
  });

  test('FILT-07: clear-filters button resets all state', async () => {
    await import('../species/bee-species-card.ts');
    await import('../species/bee-species-page.ts');
    setupDocument();
    const page = document.querySelector('bee-species-page') as HTMLElement & {
      updateComplete: Promise<unknown>;
      _geoFilter: { counties: Set<string>; ecoregions: Set<string> };
      _seasonFilter: { monthFrom: number; monthTo: number };
      _activeTaxonPath: string[];
    };
    await flush(page);
    page._geoFilter = { counties: new Set(['King']), ecoregions: new Set() };
    page._seasonFilter = { monthFrom: 4, monthTo: 8 };
    await flush(page);
    // Click the breadcrumb-row clear-filters button (rendered into .breadcrumb-pills).
    const btn = document.querySelector('.breadcrumb-pills .clear-filters') as HTMLButtonElement | null
      ?? document.querySelector('.clear-filters') as HTMLButtonElement;
    btn.click();
    await flush(page);
    expect(page._geoFilter.counties.size).toBe(0);
    expect(page._geoFilter.ecoregions.size).toBe(0);
    expect(page._seasonFilter.monthFrom).toBe(1);
    expect(page._seasonFilter.monthTo).toBe(12);
    expect(page._activeTaxonPath).toEqual([]);
  });

  test('URL round-trip: ?county=King&m0=4&m1=8 hydrates state on connect', async () => {
    await import('../species/bee-species-card.ts');
    await import('../species/bee-species-page.ts');
    window.history.replaceState({}, '', '/species/?county=King&m0=4&m1=8');
    setupDocument();
    const page = document.querySelector('bee-species-page') as HTMLElement & {
      updateComplete: Promise<unknown>;
      _geoFilter: { counties: Set<string>; ecoregions: Set<string> };
      _seasonFilter: { monthFrom: number; monthTo: number };
    };
    await flush(page);
    expect(page._geoFilter.counties.has('King')).toBe(true);
    expect(page._seasonFilter.monthFrom).toBe(4);
    expect(page._seasonFilter.monthTo).toBe(8);
  });
});

describe('LINK-01: SSR HTML emits taxonRank=species on every spa-link (build artifact check)', () => {
  test('every spa-link in built _site/species/index.html includes taxonRank=species', () => {
    const path = resolve(ROOT, '_site/species/index.html');
    if (!existsSync(path)) {
      // Build hasn't run yet; skip with a clear message rather than failing.
      console.warn('skip: _site/species/index.html absent — run `npm run build` first');
      return;
    }
    const html = readFileSync(path, 'utf8');
    const spaLinks = html.match(/class="spa-link"[^>]*href="[^"]*"/g) ?? [];
    expect(spaLinks.length).toBeGreaterThan(700);  // ~735 cards
    // Every spa-link must carry taxonRank=species.
    const missing = spaLinks.filter(l => !l.includes('taxonRank=species'));
    expect(missing, `${missing.length} spa-links missing taxonRank=species`).toEqual([]);
  });
});

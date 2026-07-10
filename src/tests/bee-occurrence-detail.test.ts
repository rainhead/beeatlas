import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRomanDate } from '../bee-occurrence-detail.ts';
import type { OccurrenceRow } from '../filter.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A specimen-backed (ecdysis) row → occId 'ecdysis:42'. Only the fields the
// detail render reads are populated; the rest default to null/false.
function ecdysisRow(ecdysisId: number): OccurrenceRow {
  return {
    taxon_id: null, lat: 47.6, lon: -122.3, date: '2024-06-01',
    county: null, ecoregion_l3: null, ecdysis_id: ecdysisId,
    catalog_number: null, recordedBy: 'A. Collector', fieldNumber: null,
    floralHost: null, host_observation_id: null, inat_host: null,
    inat_quality_grade: null, modified: null, specimen_observation_id: null,
    elevation_m: null, year: 2024, month: 6, observation_id: null,
    host_inat_login: null, is_provisional: false,
    specimen_inat_quality_grade: null, specimen_count: null, sample_id: null,
    sample_host: null, checklist_id: null, verbatim_name: null, locality: null,
    collapsed_count: null, tier: 'atlas', record_type: 'specimen', image_url: null, obs_url: null,
    user_login: null, license: null, display_name: null, display_rank: null,
  };
}

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

  test('FilterChangedEvent detail carries the exact record taxon (D-05)', () => {
    // The filter action (now a menu button) calls _onTaxonClick with the record's
    // resolved taxon id — verifies exact taxon, no roll-up.
    expect(src).toMatch(/\._onTaxonClick\(filterTaxon\.taxonId/);
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

  test('filter action is a native menu button, no inline filter-link spans (beeatlas-k7g)', () => {
    // The species-name filter moved into the menu as a <button> (natively
    // keyboard-activatable), replacing the old clickable taxon-filter-link span +
    // its bespoke _onTaxonKeydown handler.
    expect(src).toMatch(/<button type="button" class="menu-action"/);
    expect(src).not.toMatch(/taxon-filter-link/);
    expect(src).not.toMatch(/_onTaxonKeydown/);
  });

  test('menu uses native link/button semantics, not ARIA menu roles', () => {
    // A <details> disclosure of tab-navigable links is not an ARIA menu widget.
    expect(src).not.toMatch(/role="menu"/);
    expect(src).not.toMatch(/role="menuitem"/);
  });

  test('menu items carry a visible :focus-visible outline (WR-159-02)', () => {
    expect(src).toMatch(/\.menu-items button:focus-visible/);
    expect(src).not.toMatch(/\.menu-items (?:a|button):focus\s*\{[^}]*outline:\s*none/);
  });
});

describe('bee-occurrence-detail D-04 member-place rendering', () => {
  // State-ownership invariant (CLAUDE.md): the presenter must NOT query the
  // SQL engine itself — it only reads the passed-down placeNames property.
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');

  test('presenter declares placeNames property and never queries wa-sqlite', () => {
    expect(src).toMatch(/@property[^)]*\)\s+placeNames/);
    // No SQL-engine access inside the presenter (state-ownership invariant).
    expect(src).not.toMatch(/getOccurrencePlaceSlugs|getDB|sqlite3\.exec|tablesReady/);
  });

  test('multi-place occurrence lists ALL member place names (D-04)', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(42)];
    el.placeNames = new Map([['ecdysis:42', ["Ebey's Landing", 'Whidbey WLA']]]);
    await el.updateComplete;
    const names = [...el.shadowRoot.querySelectorAll('.member-place')].map((n: any) => n.textContent.trim());
    expect(names).toContain("Ebey's Landing");
    expect(names).toContain('Whidbey WLA');
    expect(names.length).toBe(2);
  });

  test('occurrence in no place renders no member-place list (D-04)', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(7)];
    el.placeNames = new Map(); // no membership for ecdysis:7
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.member-places')).toBeNull();
    expect(el.shadowRoot.querySelectorAll('.member-place').length).toBe(0);
  });

  test('single-place occurrence lists exactly that one name (D-04)', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(99)];
    el.placeNames = new Map([['ecdysis:99', ['Klickitat Trail']]]);
    await el.updateComplete;
    const names = [...el.shadowRoot.querySelectorAll('.member-place')].map((n: any) => n.textContent.trim());
    expect(names).toEqual(['Klickitat Trail']);
  });
});

describe('bee-occurrence-detail per-record disclosure menu (beeatlas-k7g)', () => {
  test('specimen row exposes a details/summary menu, no inline emoji-links', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(42)];
    await el.updateComplete;
    const li = el.shadowRoot.querySelector('.species-list li');
    // Disclosure affordance present…
    expect(li.querySelector('details.record-menu > summary')).not.toBeNull();
    // …and the old emoji-glyph anchors are gone.
    expect(li.textContent).not.toContain('🔗');
    expect(li.textContent).not.toContain('📷');
  });

  test('menu shows only applicable, spelled-out items per record', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;

    // Ecdysis-only row: single labeled item.
    el.occurrences = [ecdysisRow(42)];
    await el.updateComplete;
    let labels = [...el.shadowRoot.querySelectorAll('.menu-items a')].map((a: any) => a.textContent.trim());
    expect(labels).toEqual(['Specimen on Ecdysis']);

    // Row with host + photo observations: all three items, no dead entries.
    // observation_id is ALSO set (real specimen rows mirror host_observation_id
    // there) — it must NOT add a duplicate 'Observation on iNaturalist' item.
    const full = ecdysisRow(43);
    full.host_observation_id = 111;
    full.specimen_observation_id = 222;
    full.observation_id = 111;
    el.occurrences = [full];
    await el.updateComplete;
    labels = [...el.shadowRoot.querySelectorAll('.menu-items a')].map((a: any) => a.textContent.trim());
    expect(labels).toEqual([
      'Specimen on Ecdysis',
      'Host plant on iNaturalist',
      'Specimen photo on iNaturalist',
    ]);
  });

  const mountRow = async (row: OccurrenceRow) => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [row];
    await el.updateComplete;
    return el;
  };
  const menuLabels = (el: any) =>
    [...el.shadowRoot.querySelectorAll('.menu-items a')].map((a: any) => a.textContent.trim());

  test('sample-only record surfaces its iNat observation via the menu', async () => {
    const row = ecdysisRow(0);
    row.ecdysis_id = null; // not specimen-backed → sample-only branch
    row.record_type = null;
    row.observation_id = 555;
    const el = await mountRow(row);
    expect(menuLabels(el)).toEqual(['Observation on iNaturalist']);
    expect(el.shadowRoot.querySelector('.event-inat')).toBeNull();
  });

  test('provisional record labels its observation as a WABA observation', async () => {
    const row = ecdysisRow(0);
    row.ecdysis_id = null;
    row.is_provisional = true;
    row.record_type = 'provisional_sample';
    row.observation_id = 777;
    const el = await mountRow(row);
    expect(menuLabels(el)).toEqual(['WABA observation on iNaturalist']);
  });

  test('inat-expert record shows a single observation link, not a duplicate "Specimen photo"', async () => {
    // Real inat_expert rows carry specimen_observation_id == the obs_url observation.
    // Only specimen-backed rows should surface "Specimen photo"; here it must not
    // duplicate the "Observation on iNaturalist" link.
    const row = ecdysisRow(0);
    row.ecdysis_id = null;
    row.record_type = 'inat_expert';
    row.specimen_observation_id = 999;
    row.obs_url = 'https://www.inaturalist.org/observations/999';
    const el = await mountRow(row);
    const anchors = [...el.shadowRoot.querySelectorAll('.menu-items a')];
    expect(anchors.map((a: any) => a.textContent.trim())).toEqual(['Observation on iNaturalist']);
    expect(anchors[0].getAttribute('href')).toBe('https://www.inaturalist.org/observations/999');
  });

  test('waba-specimen card renders its observation link (non-provisional label)', async () => {
    const row = ecdysisRow(0);
    row.ecdysis_id = null;
    row.record_type = 'waba_specimen';
    row.specimen_observation_id = 321; // mirrors obs_url; must not add "Specimen photo"
    row.obs_url = 'https://www.inaturalist.org/observations/321';
    const el = await mountRow(row);
    const anchors = [...el.shadowRoot.querySelectorAll('.menu-items a')];
    expect(anchors.map((a: any) => a.textContent.trim())).toEqual(['Observation on iNaturalist']);
    expect(anchors[0].getAttribute('href')).toBe('https://www.inaturalist.org/observations/321');
  });

  test('checklist record (no outbound links) renders no menu', async () => {
    const row = ecdysisRow(0);
    row.ecdysis_id = null;
    row.record_type = 'checklist';
    row.checklist_id = 12;
    row.observation_id = null;
    row.obs_url = null;
    const el = await mountRow(row);
    expect(el.shadowRoot.querySelector('details.record-menu')).toBeNull();
  });

  test('species name is plain text; the "Filter for this species" menu button dispatches filter-changed with the record taxon', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    const row = ecdysisRow(42);
    row.taxon_id = 100;
    el.occurrences = [row];
    el.taxonCache = new Map([[100, { name: 'Bombus vosnesenskii' }]]);
    // _onTaxonClick no-ops without a filterState — provide a minimal one.
    el.filterState = {
      yearFrom: null, yearTo: null, months: [], selectedCounties: [],
      selectedEcoregions: [], selectedCollectors: [], elevMin: null, elevMax: null,
      selectedPlace: null,
    };
    await el.updateComplete;

    // The name renders as plain text, not an interactive filter span.
    expect(el.shadowRoot.querySelector('.taxon-filter-link')).toBeNull();
    const li = el.shadowRoot.querySelector('.species-list li');
    expect(li.textContent).toContain('Bombus vosnesenskii');

    // The filter action lives in the menu as a button.
    const btn = el.shadowRoot.querySelector('.menu-items button.menu-action');
    expect(btn).not.toBeNull();
    expect(btn.textContent.trim()).toBe('Filter for this species');

    let detail: any = null;
    el.addEventListener('filter-changed', (e: any) => { detail = e.detail; });
    btn.click();
    expect(detail).not.toBeNull();
    expect(detail.taxonId).toBe(100);
    expect(detail.taxonDisplayName).toBe('Bombus vosnesenskii');
  });
});

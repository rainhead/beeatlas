import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatRomanDate } from '../bee-occurrence-detail.ts';
import type { OccurrenceRow } from '../filter.ts';
import { occurrenceRow } from '../design/fixtures.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// A specimen-backed (ecdysis) row → occId 'ecdysis:N'. Built from the shared
// /design fixture builder (ADR 0039) rather than a second hand-rolled literal,
// so the states these tests assert on are the same ones the proofing page shows.
function ecdysisRow(ecdysisId: number, over: Partial<OccurrenceRow> = {}): OccurrenceRow {
  return occurrenceRow({ ecdysis_id: ecdysisId, ...over });
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

  test('month-precision string (length 7) returns roman-month year format', () => {
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

  test('FilterChangedEvent detail carries the exact record taxon', () => {
    // The filter action (now a menu button) calls _onTaxonClick with the record's
    // resolved taxon id — verifies exact taxon, no roll-up.
    expect(src).toMatch(/\._onTaxonClick\(filterTaxon\.taxonId/);
  });

  test('FilterChangedEvent detail preserves filterState dimensions', () => {
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
  // SQL engine itself — it only reads the passed-down memberPlaces property.
  const src = readFileSync(resolve(__dirname, '../bee-occurrence-detail.ts'), 'utf-8');

  test('presenter declares memberPlaces property and never queries wa-sqlite', () => {
    expect(src).toMatch(/@property[^)]*\)\s+memberPlaces/);
    // No SQL-engine access inside the presenter (state-ownership invariant).
    expect(src).not.toMatch(/getOccurrencePlaceSlugs|getDB|sqlite3\.exec|tablesReady/);
  });

  test('multi-place occurrence lists ALL member place names', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(42)];
    el.memberPlaces = new Map([['ecdysis:42', [
      { slug: 'ebeys-landing', name: "Ebey's Landing" },
      { slug: 'whidbey-wla', name: 'Whidbey WLA' },
    ]]]);
    await el.updateComplete;
    // A lone displayed record shares every place it has with itself, so all of
    // them ride the date line rather than repeating as chips under it.
    const shared = el.shadowRoot.querySelector('.date-place').textContent;
    expect(shared).toContain("Ebey's Landing");
    expect(shared).toContain('Whidbey WLA');
    expect(el.shadowRoot.querySelectorAll('.member-place').length).toBe(0);
  });

  test('occurrence in no place renders no member-place list', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(7)];
    el.memberPlaces = new Map(); // no membership for ecdysis:7
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.member-places')).toBeNull();
    expect(el.shadowRoot.querySelectorAll('.member-place').length).toBe(0);
    expect(el.shadowRoot.querySelector('.date-place')).toBeNull();
  });

  test('single-place occurrence lists exactly that one name', async () => {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [ecdysisRow(99)];
    el.memberPlaces = new Map([['ecdysis:99', [{ slug: 'klickitat-trail', name: 'Klickitat Trail' }]]]);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.date-place').textContent.trim()).toBe('— Klickitat Trail');
  });
});

describe('bee-occurrence-detail shared-place roll-up', () => {
  // Level IV ecoregions are places (ADR 0035) and tile the whole state, so every
  // occurrence carries one. Repeating it on every species line of one selected
  // point is noise: names shared by ALL displayed rows ride the date line instead,
  // and only what a record adds beyond them stays a per-row chip.
  const YAKIMA_FOLDS = { slug: '10j-yakima-folds', name: 'Yakima Folds' };
  const KLICKITAT_TRAIL = { slug: 'klickitat-trail', name: 'Klickitat Trail' };
  const OKANOGAN_DRIFT_HILLS = { slug: '10a-okanogan-drift-hills', name: 'Okanogan Drift Hills' };

  const text = (el: any, sel: string) =>
    [...el.shadowRoot.querySelectorAll(sel)].map((n: any) => n.textContent.trim());

  async function mount(occurrences: any[], memberPlaces: Map<string, any[]>) {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = occurrences;
    el.memberPlaces = memberPlaces;
    await el.updateComplete;
    return el;
  }

  test('a place every row shares rides the date line, not each row', async () => {
    const el = await mount([ecdysisRow(1), ecdysisRow(2), ecdysisRow(3)], new Map([
      ['ecdysis:1', [YAKIMA_FOLDS]],
      ['ecdysis:2', [YAKIMA_FOLDS]],
      ['ecdysis:3', [YAKIMA_FOLDS]],
    ]));
    // One date group (all three rows share a date) → one mention.
    expect(text(el, '.date-place')).toEqual(['— Yakima Folds']);
    expect(el.shadowRoot.querySelector('.date-header').textContent.trim())
      .toMatch(/^1 VI 2024\s+— Yakima Folds$/);
    // …and no per-row chips at all.
    expect(text(el, '.member-place')).toEqual([]);
  });

  test('a place only some rows have stays a chip on its own row', async () => {
    const el = await mount([ecdysisRow(1), ecdysisRow(2)], new Map([
      ['ecdysis:1', [KLICKITAT_TRAIL, YAKIMA_FOLDS]],
      ['ecdysis:2', [YAKIMA_FOLDS]],
    ]));
    expect(text(el, '.date-place')).toEqual(['— Yakima Folds']);
    expect(text(el, '.member-place')).toEqual(['Klickitat Trail']);
  });

  test('several shared places join on the one date line', async () => {
    const el = await mount([ecdysisRow(1), ecdysisRow(2)], new Map([
      ['ecdysis:1', [KLICKITAT_TRAIL, YAKIMA_FOLDS]],
      ['ecdysis:2', [KLICKITAT_TRAIL, YAKIMA_FOLDS]],
    ]));
    expect(text(el, '.date-place')).toEqual(['— Klickitat Trail · Yakima Folds']);
    expect(text(el, '.member-place')).toEqual([]);
  });

  test('rows sharing nothing leave the date line alone and keep their chips', async () => {
    const el = await mount([ecdysisRow(1), ecdysisRow(2)], new Map([
      ['ecdysis:1', [YAKIMA_FOLDS]],
      ['ecdysis:2', [OKANOGAN_DRIFT_HILLS]],
    ]));
    expect(el.shadowRoot.querySelector('.date-place')).toBeNull();
    expect(text(el, '.member-place').sort()).toEqual(['Okanogan Drift Hills', 'Yakima Folds']);
  });

  test('each date group names its own place, even when the list shares none', async () => {
    // Two records in different ecoregions on different dates. The list shares
    // nothing, but each date line still speaks for the group beneath it.
    const el = await mount([
      ecdysisRow(1, { date: '2024-06-01' }),
      ecdysisRow(2, { date: '2024-06-04' }),
    ], new Map([
      ['ecdysis:1', [YAKIMA_FOLDS]],
      ['ecdysis:2', [OKANOGAN_DRIFT_HILLS]],
    ]));
    expect(text(el, '.date-place')).toEqual(['— Okanogan Drift Hills', '— Yakima Folds']);
    // …so nothing repeats as a chip underneath.
    expect(text(el, '.member-place')).toEqual([]);
  });

  test('a group whose rows disagree keeps its date line clean', async () => {
    // Same two ecoregions, now on the SAME date: one group, no shared place, so
    // the date line claims nothing and both records carry their own chip.
    const el = await mount([ecdysisRow(1), ecdysisRow(2)], new Map([
      ['ecdysis:1', [YAKIMA_FOLDS]],
      ['ecdysis:2', [OKANOGAN_DRIFT_HILLS]],
    ]));
    expect(el.shadowRoot.querySelector('.date-place')).toBeNull();
    expect(text(el, '.member-place').sort()).toEqual(['Okanogan Drift Hills', 'Yakima Folds']);
  });

  test('every place name links to its page, on the date line and in a chip', async () => {
    // Sites and Level IV ecoregions both paginate to /places/<slug>.html (ADR 0035).
    const el = await mount([ecdysisRow(1), ecdysisRow(2)], new Map([
      ['ecdysis:1', [KLICKITAT_TRAIL, YAKIMA_FOLDS]],
      ['ecdysis:2', [YAKIMA_FOLDS]],
    ]));
    expect(el.shadowRoot.querySelector('.date-place a').getAttribute('href'))
      .toBe('/places/10j-yakima-folds.html');
    expect(el.shadowRoot.querySelector('.member-place a').getAttribute('href'))
      .toBe('/places/klickitat-trail.html');
  });

  test('a row with no resolved membership collapses the shared set (no false claim)', async () => {
    // ecdysis:2 has no bridge rows; putting 'Yakima Folds' on the date line would
    // assert a membership we do not have for it.
    const el = await mount([ecdysisRow(1), ecdysisRow(2)], new Map([
      ['ecdysis:1', [YAKIMA_FOLDS]],
    ]));
    expect(el.shadowRoot.querySelector('.date-place')).toBeNull();
    expect(text(el, '.member-place')).toEqual(['Yakima Folds']);
  });
});

describe('bee-occurrence-detail card line order', () => {
  // Every non-specimen record renders through ONE card, so the order of its
  // lines is a property of the card rather than of the record type. Before this,
  // five renderers each chose: three led with the determination, two with the
  // date. The order is context first — WHEN and WHERE, then WHO, then WHAT —
  // because a record's identity is the collecting event and the determination is
  // a claim about it that can change without the event changing.
  const CARD_ORDER = ['event-date', 'event-observer', 'record-determination'];

  async function mountRow(row: any) {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [row];
    el.taxonCache = new Map([[1, { rank: 'species', name: 'Osmia lignaria', lineagePath: null }]]);
    await el.updateComplete;
    return el;
  }

  const classesOf = (el: any) =>
    [...el.shadowRoot.querySelectorAll('.panel-content > *')]
      .map((n: any) => n.className)
      .filter((c: string) => CARD_ORDER.includes(c));

  const VARIANTS: Array<[string, () => any]> = [
    ['sample-only', () => occurrenceRow({
      ecdysis_id: null, observation_id: 9, record_type: null,
      host_inat_login: 'observer', specimen_count: 3,
    })],
    ['provisional', () => occurrenceRow({
      ecdysis_id: null, observation_id: 9, is_provisional: true,
      record_type: 'provisional_sample', host_inat_login: 'observer',
      taxon_id: 1, display_name: 'Osmia lignaria',
    })],
    ['waba_specimen', () => occurrenceRow({
      ecdysis_id: null, specimen_observation_id: 9, record_type: 'waba_specimen',
      user_login: 'observer', taxon_id: 1,
    })],
    ['inat_expert', () => occurrenceRow({
      ecdysis_id: null, specimen_observation_id: 9, record_type: 'inat_expert',
      user_login: 'observer', taxon_id: 1,
    })],
    ['checklist', () => occurrenceRow({
      ecdysis_id: null, checklist_id: 9, record_type: 'checklist',
      recordedBy: 'W. Bartholomew', verbatim_name: 'Osmia lignaria',
    })],
  ];

  for (const [name, build] of VARIANTS) {
    test(`${name} reads date, then who, then what`, async () => {
      const el = await mountRow(build());
      expect(classesOf(el)).toEqual(CARD_ORDER);
    });
  }

  test('a standalone card puts its places on the date line, never in a chip', async () => {
    const el = await mountRow(occurrenceRow({
      ecdysis_id: null, checklist_id: 9, record_type: 'checklist', verbatim_name: 'Osmia lignaria',
    }));
    el.memberPlaces = new Map([['checklist:9', [{ slug: 'klickitat-trail', name: 'Klickitat Trail' }]]]);
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.date-place').textContent.trim()).toBe('— Klickitat Trail');
    expect(el.shadowRoot.querySelectorAll('.member-place').length).toBe(0);
  });
});

describe('bee-occurrence-detail host line', () => {
  // "Osmia lignaria · no host" spent its longest phrase saying nothing, on the
  // majority of specimen lines. Absence reads as absence.
  async function mountSpecimen(over: any) {
    await import('../bee-occurrence-detail.ts');
    document.body.innerHTML = `<bee-occurrence-detail></bee-occurrence-detail>`;
    const el = document.querySelector('bee-occurrence-detail') as any;
    el.occurrences = [occurrenceRow({ ecdysis_id: 1, taxon_id: 1, ...over })];
    el.taxonCache = new Map([[1, { rank: 'species', name: 'Osmia lignaria', lineagePath: null }]]);
    await el.updateComplete;
    return el;
  }

  test('a specimen with no host says nothing about hosts', async () => {
    const el = await mountSpecimen({});
    const line = el.shadowRoot.querySelector('.species-list li').textContent;
    expect(line).not.toContain('no host');
    // No dangling separator either — the "·" belongs to the host, not the line.
    expect(line).not.toContain('·');
  });

  test('a host is still shown, with its separator', async () => {
    const el = await mountSpecimen({ floralHost: 'Ribes sanguineum' });
    expect(el.shadowRoot.querySelector('.species-list li').textContent)
      .toMatch(/Osmia lignaria\s+· Ribes sanguineum/);
  });

  test('a grade with no host still shows its badge', async () => {
    // The badge qualifies the observation, not the plant, so dropping the "no
    // host" text must not take it down with it.
    const el = await mountSpecimen({ inat_quality_grade: 'research' });
    expect(el.shadowRoot.querySelector('.species-list li .quality-badge').textContent.trim()).toBe('RG');
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

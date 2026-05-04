// Phase 80/81 coordinator for /species/. ARCH-03: SOLE owner of reactive
// state. Light-DOM (createRenderRoot returns this), no render() — extends
// SSR DOM via willUpdate + this.querySelector. Phase 81 wires:
//   - URL parse on connect (?fam, ?subf, ?tribe, ?gen, ?subg, ?county,
//     ?ecor, ?m0, ?m1) via src/species/url-state.ts (D-06)
//   - seasonality.json fetch singleton (Pitfall #81-B mitigation)
//   - filteredCount Map<lower-name, number> compute per CONTEXT D-02
//     (max() OR-approximation across county/ecoregion vectors)
//   - filtered count + 12-vector slice propagation to <bee-species-card>
//     and <seasonality-viz> respectively
//   - bee-taxon-nav taxon-selected event handler (NAV-03)
//   - bee-species-filter filter-changed event handler (FILT-01)
//   - _pushUrlState (replaceState immediate + 500ms debounced pushState)
//   - popstate listener (back/forward restores state)
//   - breadcrumb pill row rendering into .breadcrumb-pills (FILT-06)
//   - "Clear filters" handler (FILT-07)
//   - empty-state div toggle when Math.max(counts) === 0 (FILT-05)
//
// D-05 locked: light DOM (createRenderRoot returns this) + NO render()
// method. Lit's default render() returns noChange, which lit-html commits
// as a no-op — preserving Eleventy's server-rendered children across
// upgrade and reactive property changes. Verified at
// node_modules/lit-element/development/lit-element.js:95-130.
//
// INTENTIONAL: do NOT define render(). Adding render() would clobber
// SSR children. Locked by src/tests/bee-species-card.test.ts's
// prototype-identity assertion (Pitfall 1 mitigation).

import { LitElement, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { buildParams, parseParams, type SpeciesPageState } from './url-state.ts';
import { loadSeasonality } from './seasonality-cache.ts';

// Filter shape — Phase 81 wires events/URL onto these.
// Aligned with src/filter.ts (Set<string> for counties/ecoregions).
export interface GeoFilter {
  counties: Set<string>;
  ecoregions: Set<string>;
}

export interface SeasonFilter {
  monthFrom: number;  // 1..12
  monthTo: number;    // 1..12
}

@customElement('bee-species-page')
export class BeeSpeciesPage extends LitElement {
  @state() _activeTaxonPath: string[] = [];
  @state() _geoFilter: GeoFilter = { counties: new Set(), ecoregions: new Set() };
  @state() _seasonFilter: SeasonFilter = { monthFrom: 1, monthTo: 12 };
  @state() _isFilterActive = false;

  private _seasonality: Record<string, Record<string, number[]>> | null = null;
  private _filteredCounts: Map<string, number> = new Map();
  private _previousCounts: Map<string, number> = new Map();
  private _urlPushDebounce: ReturnType<typeof setTimeout> | null = null;
  private _isRestoringFromHistory = false;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — preserves SSR'd cards/breadcrumb/empty-state
  // markup emitted by _pages/species.njk. Decorate via willUpdate + querySelector.

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    this._parseUrlAndHydrate();
    window.addEventListener('popstate', this._onPopState);
    this.addEventListener('taxon-selected', this._onTaxonSelected as EventListener);
    this.addEventListener('filter-changed', this._onFilterChanged as EventListener);
    this._wireClearFiltersButton();
    this._wireFilterWidgetOptions();
    // Pitfall #81-B: await seasonality singleton before first compute.
    this._seasonality = await loadSeasonality();
    this._computeAndPropagate();
    this._renderBreadcrumb();
    this._toggleEmptyState();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._onPopState);
    this.removeEventListener('taxon-selected', this._onTaxonSelected as EventListener);
    this.removeEventListener('filter-changed', this._onFilterChanged as EventListener);
    if (this._urlPushDebounce) {
      clearTimeout(this._urlPushDebounce);
      this._urlPushDebounce = null;
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    // Recompute filtered counts when any filter dimension changes.
    if (changed.has('_activeTaxonPath') || changed.has('_geoFilter') || changed.has('_seasonFilter')) {
      this._computeAndPropagate();
      if (!this._isRestoringFromHistory) this._pushUrlState();
      this._renderBreadcrumb();
      this._toggleEmptyState();
    }
  }

  // ----- URL state -----

  private _snapshotState(): SpeciesPageState {
    // Project _activeTaxonPath (string[]) into the SpeciesPageState taxonPath shape.
    // Path order: [family, subfamily, tribe, genus, subgenus] — only as deep as set.
    const [family = null, subfamily = null, tribe = null, genus = null, subgenus = null] = this._activeTaxonPath;
    return {
      taxonPath: { family, subfamily, tribe, genus, subgenus },
      counties: new Set(this._geoFilter.counties),
      ecoregions: new Set(this._geoFilter.ecoregions),
      monthFrom: this._seasonFilter.monthFrom,
      monthTo: this._seasonFilter.monthTo,
    };
  }

  private _parseUrlAndHydrate(): void {
    const parsed = parseParams(window.location.search.replace(/^\?/, ''));
    const path: string[] = [];
    if (parsed.taxonPath.family) path.push(parsed.taxonPath.family);
    if (parsed.taxonPath.subfamily) path.push(parsed.taxonPath.subfamily);
    if (parsed.taxonPath.tribe) path.push(parsed.taxonPath.tribe);
    if (parsed.taxonPath.genus) path.push(parsed.taxonPath.genus);
    if (parsed.taxonPath.subgenus) path.push(parsed.taxonPath.subgenus);
    this._activeTaxonPath = path;
    this._geoFilter = { counties: parsed.counties, ecoregions: parsed.ecoregions };
    this._seasonFilter = { monthFrom: parsed.monthFrom, monthTo: parsed.monthTo };
    this._isFilterActive = path.length > 0
      || parsed.counties.size > 0
      || parsed.ecoregions.size > 0
      || parsed.monthFrom !== 1
      || parsed.monthTo !== 12;
  }

  private _pushUrlState(): void {
    const params = buildParams(this._snapshotState());
    const qs = params.toString();
    const url = qs ? '?' + qs : window.location.pathname;
    window.history.replaceState({}, '', url);
    if (this._urlPushDebounce) clearTimeout(this._urlPushDebounce);
    this._urlPushDebounce = setTimeout(() => {
      window.history.pushState({}, '', url);
      this._urlPushDebounce = null;
    }, 500);
  }

  private _onPopState = (): void => {
    this._isRestoringFromHistory = true;
    if (this._urlPushDebounce) {
      clearTimeout(this._urlPushDebounce);
      this._urlPushDebounce = null;
    }
    this._parseUrlAndHydrate();
    queueMicrotask(() => { this._isRestoringFromHistory = false; });
  };

  // ----- Compute (D-01, D-02) -----

  private _computeAndPropagate(): void {
    if (!this._seasonality) return;
    const counties = this._geoFilter.counties;
    const ecoregions = this._geoFilter.ecoregions;
    const m0 = this._seasonFilter.monthFrom;
    const m1 = this._seasonFilter.monthTo;
    const isFilterActive = this._activeTaxonPath.length > 0
      || counties.size > 0
      || ecoregions.size > 0
      || m0 !== 1 || m1 !== 12;
    this._isFilterActive = isFilterActive;

    const newCounts = new Map<string, number>();
    const newSlices = new Map<string, number[]>();

    // Iterate every <bee-species-card> rendered by Eleventy. Reading
    // scientificName from the card lets checklist-only species (in
    // species.json but not seasonality.json) get counted as 0 when filter
    // is active (per critical pitfall #6). When NO filter is active,
    // checklist-only species fall back to their SSR'd occurrence_count
    // because we leave their filteredCount at the sentinel -1.
    const cards = this.querySelectorAll<HTMLElement>('bee-species-card');
    for (const card of cards) {
      const h2 = card.querySelector('h2');
      const name = h2?.textContent?.trim() ?? '';
      if (!name) continue;
      const lower = name.toLowerCase();
      const slices = this._seasonality[lower];

      let combined: number[];
      if (!slices) {
        // Checklist-only species (no seasonality.json data). When filter is
        // active, count = 0 (muted). When filter inactive, fall through
        // to SSR'd occurrence_count by NOT overwriting filteredCount.
        if (isFilterActive) {
          combined = new Array(12).fill(0);
        } else {
          continue;  // leave card.filteredCount untouched (-1 sentinel; SSR shows occurrence_count)
        }
      } else if (counties.size === 0 && ecoregions.size === 0) {
        combined = slices['_total'] ?? new Array(12).fill(0);
      } else {
        // D-02 max() OR-approximation. seasonality.json carries no crossed
        // county×ecoregion slices, so the per-month max() is a deduplicating
        // proxy for OR. A record in King county that ALSO falls in Puget
        // Lowland appears once in `county:King` and once in
        // `ecoregion_l3:...`; max() avoids double-counting in the common
        // case but can mis-count when both sets contribute non-trivially.
        // Exact OR would require crossed slices from a Phase 78 pipeline
        // change — explicitly deferred. Do NOT refactor into a sum.
        const cv = new Array(12).fill(0);
        const ev = new Array(12).fill(0);
        for (const c of counties) {
          const v = slices['county:' + c];
          if (v) for (let i = 0; i < 12; i++) cv[i] += v[i];
        }
        for (const e of ecoregions) {
          const v = slices['ecoregion_l3:' + e];
          if (v) for (let i = 0; i < 12; i++) ev[i] += v[i];
        }
        combined = cv.map((c, i) => Math.max(c, ev[i]));
      }
      let total = 0;
      for (let m = m0 - 1; m <= m1 - 1 && m < 12; m++) total += combined[m] ?? 0;
      newCounts.set(name, total);
      newSlices.set(name, combined);
    }

    // Propagate to cards. Lit prop-diff: only set when value changed (per
    // critical pitfall #8). Also propagate the 12-vector to the card's
    // child <seasonality-viz>.
    for (const card of cards) {
      const h2 = card.querySelector('h2');
      const name = h2?.textContent?.trim() ?? '';
      if (!name) continue;
      const newCount = newCounts.get(name);
      if (newCount === undefined) continue;
      const prev = this._previousCounts.get(name);
      if (prev !== newCount) {
        (card as { filteredCount?: number }).filteredCount = newCount;
        this._previousCounts.set(name, newCount);
      }
      const viz = card.querySelector('seasonality-viz') as { data?: number[] } | null;
      if (viz) {
        viz.data = newSlices.get(name) ?? new Array(12).fill(0);
      }
    }

    this._filteredCounts = newCounts;

    // Propagate _activeTaxonPath to <bee-taxon-nav> so NAV-04 mute-not-hide
    // fires on click-driven taxon selection (the nav element has no
    // back-channel to read coordinator state; we push it down explicitly).
    const nav = this.querySelector('bee-taxon-nav') as { activeTaxonPath?: string[] } | null;
    if (nav) nav.activeTaxonPath = [...this._activeTaxonPath];
    // Also check siblings/document — Plan 02's renderTree macro emits
    // <bee-taxon-nav> ABOVE <bee-species-page>, so the nav is not a child.
    const navSibling = document.querySelector('bee-taxon-nav') as { activeTaxonPath?: string[] } | null;
    if (navSibling && navSibling !== nav) navSibling.activeTaxonPath = [...this._activeTaxonPath];
  }

  // ----- Event handlers -----

  private _onTaxonSelected = (e: Event): void => {
    const detail = (e as CustomEvent).detail as { path: string[]; rank: string } | undefined;
    if (!detail || !Array.isArray(detail.path)) return;
    this._activeTaxonPath = [...detail.path];
  };

  private _onFilterChanged = (e: Event): void => {
    const d = (e as CustomEvent).detail as {
      counties: Set<string>;
      ecoregions: Set<string>;
      monthFrom: number;
      monthTo: number;
    };
    this._geoFilter = { counties: new Set(d.counties), ecoregions: new Set(d.ecoregions) };
    this._seasonFilter = { monthFrom: d.monthFrom, monthTo: d.monthTo };
  };

  // ----- Filter widget options & clear-filters wiring -----

  private _wireFilterWidgetOptions(): void {
    // Read JSON-encoded options from the SSR'd <bee-species-filter
    // data-county-options=... data-ecoregion-options=...> attributes.
    const filter = this.querySelector('bee-species-filter') as (HTMLElement & {
      countyOptions?: string[];
      ecoregionOptions?: string[];
      selectedCounties?: Set<string>;
      selectedEcoregions?: Set<string>;
      monthFrom?: number;
      monthTo?: number;
    }) | null;
    if (!filter) return;
    const co = filter.getAttribute('data-county-options');
    const eo = filter.getAttribute('data-ecoregion-options');
    try {
      if (co) filter.countyOptions = JSON.parse(co);
      if (eo) filter.ecoregionOptions = JSON.parse(eo);
    } catch (err) {
      console.warn('failed to parse filter options', err);
    }
    // Reflect URL-derived selections.
    filter.selectedCounties = new Set(this._geoFilter.counties);
    filter.selectedEcoregions = new Set(this._geoFilter.ecoregions);
    filter.monthFrom = this._seasonFilter.monthFrom;
    filter.monthTo = this._seasonFilter.monthTo;
  }

  private _wireClearFiltersButton(): void {
    const buttons = this.querySelectorAll('.clear-filters');
    buttons.forEach(btn => {
      // Avoid double-binding by tagging the element.
      if ((btn as HTMLElement).dataset.clearFiltersBound === '1') return;
      (btn as HTMLElement).dataset.clearFiltersBound = '1';
      btn.addEventListener('click', () => this._clearFilters());
    });
  }

  private _clearFilters(): void {
    // FILT-07
    this._activeTaxonPath = [];
    this._geoFilter = { counties: new Set(), ecoregions: new Set() };
    this._seasonFilter = { monthFrom: 1, monthTo: 12 };
    // Sync widget UI immediately.
    this._wireFilterWidgetOptions();
  }

  // ----- Breadcrumb pill row (FILT-06) -----

  private _renderBreadcrumb(): void {
    const host = this.querySelector('.breadcrumb-pills');
    if (!host) return;
    const pills: string[] = [];
    this._activeTaxonPath.forEach((name, idx) => {
      pills.push(`<span class="pill" data-kind="taxon" data-idx="${idx}">${escapeHtml(name)} <button type="button" aria-label="Remove ${escapeHtml(name)}" data-pill-dismiss>×</button></span>`);
    });
    for (const c of this._geoFilter.counties) {
      pills.push(`<span class="pill" data-kind="county" data-value="${escapeHtml(c)}">${escapeHtml(c)} <button type="button" aria-label="Remove ${escapeHtml(c)}" data-pill-dismiss>×</button></span>`);
    }
    for (const e of this._geoFilter.ecoregions) {
      pills.push(`<span class="pill" data-kind="ecoregion" data-value="${escapeHtml(e)}">${escapeHtml(e)} <button type="button" aria-label="Remove ${escapeHtml(e)}" data-pill-dismiss>×</button></span>`);
    }
    if (this._seasonFilter.monthFrom !== 1 || this._seasonFilter.monthTo !== 12) {
      pills.push(`<span class="pill" data-kind="months">Months ${this._seasonFilter.monthFrom}–${this._seasonFilter.monthTo} <button type="button" aria-label="Reset month range" data-pill-dismiss>×</button></span>`);
    }
    if (pills.length > 0) {
      pills.push(`<button type="button" class="clear-filters">Clear filters</button>`);
    }
    host.innerHTML = pills.join('');
    // Re-bind dismiss handlers and clear button.
    host.querySelectorAll('[data-pill-dismiss]').forEach((btn: Element) => {
      btn.addEventListener('click', (ev: Event) => this._onPillDismiss(ev));
    });
    this._wireClearFiltersButton();
  }

  private _onPillDismiss(e: Event): void {
    const btn = e.currentTarget as HTMLElement;
    const pill = btn.closest('.pill') as HTMLElement | null;
    if (!pill) return;
    const kind = pill.getAttribute('data-kind');
    const value = pill.getAttribute('data-value');
    if (kind === 'taxon') {
      const idx = Number(pill.getAttribute('data-idx') ?? '-1');
      if (idx >= 0) this._activeTaxonPath = this._activeTaxonPath.slice(0, idx);
    } else if (kind === 'county' && value) {
      const next = new Set(this._geoFilter.counties);
      next.delete(value);
      this._geoFilter = { counties: next, ecoregions: new Set(this._geoFilter.ecoregions) };
    } else if (kind === 'ecoregion' && value) {
      const next = new Set(this._geoFilter.ecoregions);
      next.delete(value);
      this._geoFilter = { counties: new Set(this._geoFilter.counties), ecoregions: next };
    } else if (kind === 'months') {
      this._seasonFilter = { monthFrom: 1, monthTo: 12 };
    }
  }

  // ----- Empty state (FILT-05) -----

  private _toggleEmptyState(): void {
    const host = this.querySelector('.empty-state') as HTMLElement | null;
    if (!host) return;
    const counts = [...this._filteredCounts.values()];
    const isEmpty = this._isFilterActive && counts.length > 0 && Math.max(...counts) === 0;
    if (isEmpty) host.removeAttribute('hidden');
    else host.setAttribute('hidden', '');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

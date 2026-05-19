import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { isFilterActive } from './filter.ts';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts';
import { resolveDataUrl } from './manifest.ts';
import './bee-occurrence-detail.ts';
import './bee-table.ts';
import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';

// ---------- year-bucket helpers ----------

const CY = new Date().getFullYear();
const PY = CY - 1;

function yearBucketsToFilter(
  thisYear: boolean, lastYear: boolean, earlier: boolean
): { yearFrom: number | null; yearTo: number | null } {
  if (thisYear && lastYear && earlier) return { yearFrom: null, yearTo: null };
  if (!thisYear && !lastYear && !earlier) return { yearFrom: null, yearTo: null };
  if (thisYear && !lastYear && earlier) return { yearFrom: null, yearTo: null }; // disjoint

  let yearFrom: number | null = null;
  let yearTo: number | null = null;
  if (!earlier && !lastYear) yearFrom = CY;
  else if (!earlier) yearFrom = PY;
  if (!thisYear && !lastYear) yearTo = PY - 1;
  else if (!thisYear) yearTo = PY;
  return { yearFrom, yearTo };
}

function filterToYearBuckets(
  yearFrom: number | null, yearTo: number | null
): { thisYear: boolean; lastYear: boolean; earlier: boolean } {
  const inclThis   = (yearFrom === null || yearFrom <= CY)   && (yearTo === null || yearTo >= CY);
  const inclLast   = (yearFrom === null || yearFrom <= PY)   && (yearTo === null || yearTo >= PY);
  const inclEarlier = (yearFrom === null || yearFrom <= PY - 1) && (yearTo === null || yearTo >= 1);
  return { thisYear: inclThis, lastYear: inclLast, earlier: inclEarlier };
}

// ---------- suggestion types ----------

interface TaxonSug    { kind: 'taxon';     label: string; name: string; rank: 'family' | 'genus' | 'species' }
interface CollectorSug { kind: 'collector'; label: string; entry: CollectorEntry }
interface WhereSug    { kind: 'where';     label: string; type: 'county' | 'ecoregion' | 'place'; value: string }
type AnyS = TaxonSug | CollectorSug | WhereSug;

// ---------- component ----------

@customElement('bee-pane')
export class BeePane extends LitElement {
  // Pane control
  @property({ attribute: false }) paneState: 'collapsed' | 'list' | 'table' = 'collapsed';

  // Filter data (same as bee-filter-panel)
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;
  @property({ attribute: false }) specimenCount: number | null = null;

  // Occurrence detail (from bee-sidebar)
  @property({ attribute: false }) occurrences: OccurrenceRow[] | null = null;

  // Table-specific (from bee-atlas render)
  @property({ attribute: false }) rows: OccurrenceRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) sortBy: SpecimenSortBy = 'date';
  @property({ attribute: false }) filterActive = false;
  @property({ attribute: false }) selectedIds: Set<string> | null = null;

  @state() private _open = false;

  // Taxon (single-select)
  @state() private _taxonInput = '';
  @state() private _selectedTaxon: { name: string; rank: 'family' | 'genus' | 'species' } | null = null;

  // Collector (multi-select)
  @state() private _collectorInput = '';
  @state() private _selectedCollectors: CollectorEntry[] = [];

  // Where (multi-select)
  @state() private _whereInput = '';
  @state() private _selectedCounties: Set<string> = new Set();
  @state() private _selectedEcoregions: Set<string> = new Set();
  @state() private _selectedPlace: string | null = null;
  @state() private _placeNameBySlug: Map<string, string> = new Map();
  private _placeOptions: { slug: string; name: string }[] = [];

  // Elevation
  @state() private _elevMin: number | null = null;
  @state() private _elevMax: number | null = null;

  // Year buckets (all true = no year filter)
  @state() private _yearThisYear = true;
  @state() private _yearLastYear = true;
  @state() private _yearEarlier = true;

  // Suggestion dropdown
  @state() private _openSection: 'taxon' | 'collector' | 'where' | null = null;
  @state() private _suggestions: AnyS[] = [];
  @state() private _highlightIndex = -1;

  static styles = css`
    :host {
      position: absolute;
      z-index: 1;
      display: flex;
      flex-direction: column;
      background: var(--surface);
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
    }
    .pane-chrome {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .toggle-btn {
      min-width: 2.5rem;
      min-height: 2.5rem;
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
    }
    .toggle-btn:hover {
      background: var(--surface-subtle);
      color: var(--text-body);
    }
    .expand-btn {
      min-width: 2.5rem;
      min-height: 2.5rem;
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
    }
    .expand-btn:hover {
      background: var(--surface-subtle);
      color: var(--text-body);
    }
    .shrink-btn {
      min-width: 2.5rem;
      min-height: 2.5rem;
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
    }
    .shrink-btn:hover {
      background: var(--surface-subtle);
      color: var(--text-body);
    }
    .table-header {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .list-placeholder {
      padding: 1rem;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    @media (max-aspect-ratio: 1) {
      .expand-btn {
        display: none;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._onDocumentClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocumentClick);
  }

  private _onDocumentClick = (e: MouseEvent) => {
    if (!this._open) return;
    if (!e.composedPath().includes(this)) {
      this._open = false;
      this._openSection = null;
    }
  };

  updated(changed: PropertyValues) {
    if (!changed.has('filterState') || !this.filterState) return;
    const f = this.filterState;

    // Taxon
    const localTaxon = this._selectedTaxon?.name ?? null;
    if (f.taxonName !== localTaxon) {
      this._selectedTaxon = f.taxonName && f.taxonRank
        ? { name: f.taxonName, rank: f.taxonRank as 'family' | 'genus' | 'species' }
        : null;
      this._taxonInput = f.taxonName ?? '';
    }

    // Collectors
    const localNames = this._selectedCollectors.map(c => c.displayName).join('\0');
    const fsNames = f.selectedCollectors.map(c => c.displayName).join('\0');
    if (localNames !== fsNames) this._selectedCollectors = [...f.selectedCollectors];

    // Where
    const localCounties = [...this._selectedCounties].sort().join('\0');
    const fsCounties = [...f.selectedCounties].sort().join('\0');
    if (localCounties !== fsCounties) this._selectedCounties = new Set(f.selectedCounties);

    const localEcor = [...this._selectedEcoregions].sort().join('\0');
    const fsEcor = [...f.selectedEcoregions].sort().join('\0');
    if (localEcor !== fsEcor) this._selectedEcoregions = new Set(f.selectedEcoregions);

    // Place (singular)
    const localPlace = this._selectedPlace;
    const fsPlace = f.selectedPlace;
    if (localPlace !== fsPlace) {
      this._selectedPlace = fsPlace;
      if (this._selectedPlace !== null) void this._ensurePlaceNamesLoaded();
    }

    // Elevation
    if (this._elevMin !== f.elevMin) this._elevMin = f.elevMin;
    if (this._elevMax !== f.elevMax) this._elevMax = f.elevMax;

    // Year buckets
    const { yearFrom: localFrom, yearTo: localTo } = yearBucketsToFilter(
      this._yearThisYear, this._yearLastYear, this._yearEarlier
    );
    if (f.yearFrom !== localFrom || f.yearTo !== localTo) {
      const b = filterToYearBuckets(f.yearFrom, f.yearTo);
      this._yearThisYear = b.thisYear;
      this._yearLastYear = b.lastYear;
      this._yearEarlier  = b.earlier;
    }
  }

  private _emitFilter() {
    const { yearFrom, yearTo } = yearBucketsToFilter(
      this._yearThisYear, this._yearLastYear, this._yearEarlier
    );
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true, composed: true,
      detail: {
        taxonName: this._selectedTaxon?.name ?? null,
        taxonRank: this._selectedTaxon?.rank ?? null,
        yearFrom,
        yearTo,
        months: new Set<number>(),
        selectedCounties: this._selectedCounties,
        selectedEcoregions: this._selectedEcoregions,
        selectedCollectors: this._selectedCollectors,
        elevMin: this._elevMin,
        elevMax: this._elevMax,
        selectedPlace: this._selectedPlace,
      } as FilterChangedEvent,
    }));
  }

  private _onToggle() {
    if (this.paneState === 'collapsed') {
      this.dispatchEvent(new CustomEvent('pane-expand-list', { bubbles: true, composed: true }));
    } else {
      this.dispatchEvent(new CustomEvent('pane-collapse', { bubbles: true, composed: true }));
    }
  }

  private _onExpand() {
    this.dispatchEvent(new CustomEvent('pane-expand-table', { bubbles: true, composed: true }));
  }

  private _onShrink() {
    this.dispatchEvent(new CustomEvent('pane-shrink-list', { bubbles: true, composed: true }));
  }

  private async _ensurePlaceNamesLoaded() {
    if (this._placeNameBySlug.size > 0) return;
    try {
      const url = await resolveDataUrl('places_meta');
      if (!url) return;
      const resp = await fetch(url);
      const records = await resp.json() as { slug: string; name: string; specimen_count?: number; sample_count?: number }[];
      const nameMap = new Map<string, string>();
      const options: { slug: string; name: string }[] = [];
      for (const r of records) {
        if (r.slug && r.name) {
          nameMap.set(r.slug, r.name);
          if ((r.specimen_count ?? 0) > 0 || (r.sample_count ?? 0) > 0) {
            options.push({ slug: r.slug, name: r.name });
          }
        }
      }
      this._placeNameBySlug = nameMap;
      this._placeOptions = options;
      this.requestUpdate();
    } catch {
      // silently swallow — chip falls back to the slug
    }
  }

  private _renderListContent() {
    // Plan 02 replaces this stub with merged filter UI + bee-occurrence-detail.
    // State fields declared above (_taxonInput, _collectorInput, _whereInput, _openSection,
    // _suggestions, _highlightIndex, _placeOptions) are used by Plan 02 render methods.
    // Reference them here to satisfy noUnusedLocals until Plan 02 wires them in.
    void this._taxonInput;
    void this._collectorInput;
    void this._whereInput;
    void this._placeOptions;
    void this._openSection;
    void this._suggestions;
    void this._highlightIndex;
    void this._emitFilter;
    return html`<div class="list-placeholder">List content (Plan 02 fills in filter UI + occurrence detail)</div>`;
  }

  private _renderTableContent() {
    return html`
      <div class="table-header">
        <button class="shrink-btn" @click=${this._onShrink} aria-label="Return to list view">⊟</button>
      </div>
      <bee-table
        .rows=${this.rows}
        .rowCount=${this.rowCount}
        .page=${this.page}
        .loading=${this.loading}
        .sortBy=${this.sortBy}
        .filterActive=${this.filterActive}
        .selectedIds=${this.selectedIds}
      ></bee-table>
    `;
  }

  render() {
    return html`
      <div class="pane-chrome">
        <button class="toggle-btn" @click=${this._onToggle}
          aria-label=${this.paneState === 'collapsed' ? 'Open filter pane' : 'Close filter pane'}
        >${this.paneState === 'collapsed' ? '⟩' : '⟨'}</button>
        ${this.paneState === 'list' ? html`
          <button class="expand-btn" @click=${this._onExpand} aria-label="Expand to table view">⊞</button>
        ` : nothing}
      </div>
      ${this.paneState === 'list' ? this._renderListContent() : nothing}
      ${this.paneState === 'table' ? this._renderTableContent() : nothing}
    `;
  }
}

// Suppress unused variable warnings for filter-related code used in Plan 02
void isFilterActive;

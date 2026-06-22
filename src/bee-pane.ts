import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { isFilterActive } from './filter.ts';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './filter.ts';
import type { TaxonCacheEntry } from './taxa.ts';
import { resolveDataUrl } from './manifest.ts';
import { quantify } from './lib/quantify.js';
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

interface TaxonSug    { kind: 'taxon';     label: string; taxonId: number; rank: 'family' | 'subfamily' | 'tribe' | 'subtribe' | 'genus' | 'subgenus' | 'complex' | 'species' }
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

  // List-state pagination props (replace .occurrences)
  @property({ attribute: false }) listRows: OccurrenceRow[] = [];
  @property({ attribute: false }) listRowCount = 0;
  @property({ attribute: false }) listPage = 1;
  @property({ attribute: false }) listLoading = false;
  @property({ attribute: false }) selectionCount: number | null = null;

  // Taxon cache (threaded from bee-atlas for name resolution in bee-occurrence-detail)
  @property({ attribute: false }) taxonCache: Map<number, TaxonCacheEntry> | null = null;

  // Table-specific (from bee-atlas render)
  @property({ attribute: false }) rows: OccurrenceRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) sortBy: SpecimenSortBy = 'date';
  @property({ attribute: false }) filterActive = false;
  @property({ attribute: false }) selectedIds: Set<string> | null = null;
  @property({ attribute: false }) hiddenSources: Set<string> = new Set();

  // Near-me: true when a bounds filter (near-me / shift-drag) is active.
  // bee-pane is a pure presenter — bounds state lives in bee-atlas._filterState.bounds.
  @property({ attribute: false }) boundsFilterActive: boolean = false;
  // Human-readable bounds shown IN the where input when boundsFilterActive (owned by bee-atlas).
  @property({ attribute: false }) boundsFilterLabel: string = '';

  @state() private _open = false;

  // Taxon (single-select)
  @state() private _taxonInput = '';
  @state() private _selectedTaxon: { taxonId: number; displayName: string } | null = null;

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

  // Source filter (mirrors hiddenSources @property)
  @state() private _hiddenSources: Set<string> = new Set();

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
      overflow: hidden;
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
    .table-header-spacer {
      flex: 1;
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
    .sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sidebar-title {
      flex: 1;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary);
      padding-left: 0.25rem;
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      padding: 0.25rem 0.5rem;
      color: var(--text-secondary);
      border-radius: 4px;
    }
    .close-btn:hover {
      background: var(--surface-hover);
      color: var(--text-body);
    }
    .filter-panel {
      padding: 0.75rem;
      box-sizing: border-box;
    }
    .filter-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.6rem;
    }
    .filter-row:last-child { margin-bottom: 0; }
    .row-icon {
      flex-shrink: 0;
      margin-top: 0.45rem;
      opacity: 0.6;
    }
    .input-group {
      flex: 1;
      min-width: 0;
    }
    .input-wrap {
      position: relative;
    }
    .filter-input {
      width: 100%;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      font-size: 0.875rem;
      color: var(--text-body);
      background: var(--surface, #fff);
      box-sizing: border-box;
    }
    .filter-input:focus {
      outline: none;
      border-color: var(--accent, #2c7a2c);
    }
    .filter-input::placeholder { color: var(--text-hint); }
    .filter-input.has-clear { padding-right: 1.8rem; }
    .input-clear {
      position: absolute;
      right: 0.4rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.75rem;
      padding: 0.1rem;
      line-height: 1;
    }
    .input-clear:hover { color: var(--text-body); }
    .near-me-btn {
      position: absolute;
      right: 0.4rem;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      padding: 0.1rem;
      line-height: 1;
      display: inline-flex;
      align-items: center;
    }
    .near-me-btn:hover { color: var(--text-body); }
    .filter-input.has-near-me { padding-right: 1.8rem; }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-bottom: 0.3rem;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.1rem 0.35rem;
      background: var(--surface-muted);
      border: 1px solid var(--border-input);
      border-radius: 3px;
      font-size: 0.8rem;
      color: var(--text-body);
    }
    .chip-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.7rem;
      padding: 0;
      line-height: 1;
      display: inline-flex;
      align-items: center;
    }
    .chip-remove:hover { color: var(--text-body); }
    .suggestions {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% + 1px);
      background: var(--surface, #fff);
      border: 1px solid var(--border-input);
      border-top: none;
      border-radius: 0 0 4px 4px;
      list-style: none;
      margin: 0;
      padding: 0;
      z-index: 20;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      max-height: 200px;
      overflow-y: auto;
    }
    .suggestion {
      padding: 0.4rem 0.6rem;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--text-body);
    }
    .suggestion:hover, .suggestion.hl { background: var(--surface-subtle); }
    .elev-row {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.4rem;
    }
    .elev-input {
      flex: 1;
      min-width: 0;
      padding: 0.35rem 0.4rem;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      font-size: 0.78rem;
      color: var(--text-body);
      background: var(--surface);
      box-sizing: border-box;
      -moz-appearance: textfield;
    }
    .elev-input::-webkit-outer-spin-button,
    .elev-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .elev-input::placeholder { color: var(--text-hint); font-size: 0.75rem; }
    .elev-input:focus { outline: 1px solid var(--accent); border-color: var(--accent); }
    .year-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding-top: 0.3rem;
    }
    .year-label {
      display: flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.875rem;
      color: var(--text-body);
      cursor: pointer;
      user-select: none;
    }
    .year-label input[type="checkbox"] {
      cursor: pointer;
      accent-color: var(--accent, #2c7a2c);
    }
    .divider {
      height: 1px;
      background: var(--border-subtle);
      margin: 0;
    }
    .panel-content {
      padding: 1rem;
    }
    .hint {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin: 0;
    }
    /* Collapsed floating button — matches old bee-filter-panel design */
    .filter-btn {
      background: white;
      border: 1px solid rgba(0,0,0,0.3);
      border-radius: 4px;
      padding: 0.4rem 0.6rem;
      cursor: pointer;
      font-size: 0.85rem;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 0.3rem;
      white-space: nowrap;
    }
    .filter-btn.active {
      background: var(--accent, #2c7a2c);
      color: white;
      border-color: var(--accent, #2c7a2c);
    }
    /* Scrollable middle section between sidebar-header and list-pager */
    .list-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
    /* X close button — flex item inside sidebar-header */
    .pane-close {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.1rem;
      line-height: 1;
      padding: 0.3rem 0.4rem;
      color: var(--text-secondary);
      border-radius: 4px;
    }
    .pane-close:hover {
      background: var(--surface-hover);
      color: var(--text-body);
    }
    /* Selection banner */
    .selection-banner {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      background: var(--surface-muted);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 0.85rem;
      color: var(--text-secondary);
    }
    .selection-banner .clear-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--accent, #2c7a2c);
      font-size: 0.8rem;
      padding: 0;
      text-decoration: underline;
    }
    .selection-banner .clear-btn:hover {
      color: var(--text-body);
    }
    /* Paged list footer */
    .list-pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.5rem;
      border-top: 1px solid var(--border-subtle);
      font-size: 0.8rem;
    }
    .list-pager button {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      cursor: pointer;
      padding: 0.2rem 0.5rem;
      font-size: 0.8rem;
    }
    .list-pager button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    /* Desktop-only visibility gate for shift-drag bounds hint */
    .hint--desktop-only {
      display: none;
    }
    @media (hover: hover) and (pointer: fine) {
      .hint--desktop-only {
        display: block;
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
    if (changed.has('hiddenSources')) {
      this._hiddenSources = new Set(this.hiddenSources);
    }
    if (!changed.has('filterState') || !this.filterState) return;
    const f = this.filterState;

    // Taxon
    const localTaxonId = this._selectedTaxon?.taxonId ?? null;
    const localTaxonDisplay = this._selectedTaxon?.displayName ?? '';
    const incomingTaxonDisplay = f.taxonDisplayName ?? '';
    // Resync on taxonId change OR on a display-name-only change for the same id.
    // The latter is the URL-restore case: firstUpdated sets taxonId with no label,
    // then the label is backfilled from the cache once it loads — the input must
    // pick up the label even though taxonId is unchanged (MFILT-03). This block only
    // runs when the parent filterState changes, so it never clobbers in-progress typing.
    if (f.taxonId !== localTaxonId || incomingTaxonDisplay !== localTaxonDisplay) {
      this._selectedTaxon = f.taxonId !== null
        ? { taxonId: f.taxonId, displayName: f.taxonDisplayName ?? '' }
        : null;
      this._taxonInput = f.taxonDisplayName ?? '';
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

  /** Crosshair SVG shared between the near-me button and the active-bounds chip. */
  private get _crosshairSvg() {
    return html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="4"/>
      <line x1="8" y1="1" x2="8" y2="4"/>
      <line x1="8" y1="12" x2="8" y2="15"/>
      <line x1="1" y1="8" x2="4" y2="8"/>
      <line x1="12" y1="8" x2="15" y2="8"/>
    </svg>`;
  }

  private _emitFilter() {
    const { yearFrom, yearTo } = yearBucketsToFilter(
      this._yearThisYear, this._yearLastYear, this._yearEarlier
    );
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true, composed: true,
      detail: {
        taxonId: this._selectedTaxon?.taxonId ?? null,
        taxonDisplayName: this._selectedTaxon?.displayName ?? null,
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

  private _onClearSelection() {
    this.dispatchEvent(new CustomEvent('pane-clear-selection', { bubbles: true, composed: true }));
  }

  private _onSourceToggle(sourceValue: string, checked: boolean) {
    const next = new Set(this._hiddenSources);
    if (checked) next.delete(sourceValue);
    else next.add(sourceValue);
    this._hiddenSources = next;
    this.dispatchEvent(new CustomEvent('source-filter-changed', {
      bubbles: true, composed: true,
      detail: { hiddenSources: next },
    }));
  }

  private _onListPagePrev() {
    const newPage = Math.max(1, this.listPage - 1);
    this.dispatchEvent(new CustomEvent('list-page-changed', {
      bubbles: true, composed: true, detail: { page: newPage }
    }));
  }

  private _onListPageNext() {
    const PAGE_SIZE = 100;
    const totalPages = Math.ceil(this.listRowCount / PAGE_SIZE);
    const newPage = Math.min(totalPages, this.listPage + 1);
    this.dispatchEvent(new CustomEvent('list-page-changed', {
      bubbles: true, composed: true, detail: { page: newPage }
    }));
  }

  private _handleKeydown(e: KeyboardEvent, section: 'taxon' | 'collector' | 'where', onBackspace: () => void) {
    const isOpen = this._openSection === section;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (isOpen) this._highlightIndex = Math.min(this._highlightIndex + 1, this._suggestions.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (isOpen) this._highlightIndex = Math.max(this._highlightIndex - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (isOpen) {
          const idx = this._highlightIndex >= 0 ? this._highlightIndex : 0;
          this._pickSuggestion(this._suggestions[idx]);
        }
        break;
      case 'Escape':
        this._openSection = null;
        this._highlightIndex = -1;
        break;
      case 'Backspace':
        if ((e.target as HTMLInputElement).value === '') onBackspace();
        break;
    }
  }

  private _pickSuggestion(s: AnyS | undefined) {
    if (!s) return;
    if (s.kind === 'taxon') this._selectTaxon(s);
    else if (s.kind === 'collector') this._selectCollector(s);
    else this._selectWhere(s);
  }

  private _onBlur() {
    setTimeout(() => { this._openSection = null; this._highlightIndex = -1; }, 150);
  }

  // --- Taxon section ---

  private _onTaxonInput(e: Event) {
    const q = (e.target as HTMLInputElement).value;
    this._taxonInput = q;
    if (!q.trim()) {
      this._suggestions = [];
      this._openSection = null;
    } else {
      const lower = q.trim().toLowerCase();
      const sugs: TaxonSug[] = [];
      for (const opt of this.taxaOptions) {
        if (opt.label.toLowerCase().includes(lower)) {
          sugs.push({ kind: 'taxon', label: opt.label, taxonId: opt.taxonId, rank: opt.rank });
          if (sugs.length >= 5) break;
        }
      }
      this._suggestions = sugs;
      this._openSection = sugs.length > 0 ? 'taxon' : null;
    }
    this._highlightIndex = -1;
  }

  private _selectTaxon(s: TaxonSug) {
    this._selectedTaxon = { taxonId: s.taxonId, displayName: s.label };
    this._taxonInput = s.label;
    this._suggestions = [];
    this._openSection = null;
    this._highlightIndex = -1;
    this._emitFilter();
  }

  private _clearTaxon() {
    this._selectedTaxon = null;
    this._taxonInput = '';
    this._suggestions = [];
    this._openSection = null;
    this._emitFilter();
  }

  // --- Collector section ---

  private _onCollectorInput(e: Event) {
    const q = (e.target as HTMLInputElement).value;
    this._collectorInput = q;
    if (!q.trim()) {
      this._suggestions = [];
      this._openSection = null;
    } else {
      const lower = q.trim().toLowerCase();
      const active = new Set(this._selectedCollectors.map(c => c.displayName));
      const sugs: CollectorSug[] = [];
      for (const c of this.collectorOptions) {
        if (active.has(c.displayName)) continue;
        if (c.displayName.toLowerCase().includes(lower) ||
            (c.host_inat_login !== null && c.host_inat_login.toLowerCase().includes(lower))) {
          const label = c.host_inat_login && c.host_inat_login !== c.displayName
            ? `${c.displayName} (${c.host_inat_login})`
            : c.displayName;
          sugs.push({ kind: 'collector', label, entry: c });
          if (sugs.length >= 5) break;
        }
      }
      this._suggestions = sugs;
      this._openSection = sugs.length > 0 ? 'collector' : null;
    }
    this._highlightIndex = -1;
  }

  private _selectCollector(s: CollectorSug) {
    if (!this._selectedCollectors.some(c => c.displayName === s.entry.displayName)) {
      this._selectedCollectors = [...this._selectedCollectors, s.entry];
    }
    this._collectorInput = '';
    this._suggestions = [];
    this._openSection = null;
    this._highlightIndex = -1;
    this._emitFilter();
  }

  private _removeCollector(i: number) {
    this._selectedCollectors = [
      ...this._selectedCollectors.slice(0, i),
      ...this._selectedCollectors.slice(i + 1),
    ];
    this._emitFilter();
  }

  // --- Where section ---

  private _onWhereInput(e: Event) {
    const q = (e.target as HTMLInputElement).value;
    this._whereInput = q;
    if (!q.trim()) {
      this._suggestions = [];
      this._openSection = null;
    } else {
      const lower = q.trim().toLowerCase();
      const sugs: WhereSug[] = [];
      for (const c of this.countyOptions) {
        if (!this._selectedCounties.has(c) && c.toLowerCase().includes(lower)) {
          sugs.push({ kind: 'where', label: `${c} County`, type: 'county', value: c });
          if (sugs.length >= 3) break;
        }
      }
      for (const ecor of this.ecoregionOptions) {
        if (!this._selectedEcoregions.has(ecor) && ecor.toLowerCase().includes(lower)) {
          sugs.push({ kind: 'where', label: ecor, type: 'ecoregion', value: ecor });
          if (sugs.length >= 5) break;
        }
      }
      if (this._selectedPlace === null) {
        for (const opt of this._placeOptions) {
          if (opt.name.toLowerCase().includes(lower)) {
            sugs.push({ kind: 'where', label: opt.name, type: 'place', value: opt.slug });
            if (sugs.length >= 8) break;
          }
        }
      }
      const trimmed = sugs.slice(0, 8);
      this._suggestions = trimmed;
      this._openSection = trimmed.length > 0 ? 'where' : null;
    }
    this._highlightIndex = -1;
  }

  private _selectWhere(s: WhereSug) {
    if (s.type === 'county') {
      this._selectedCounties = new Set([...this._selectedCounties, s.value]);
    } else if (s.type === 'ecoregion') {
      this._selectedEcoregions = new Set([...this._selectedEcoregions, s.value]);
    } else {
      this._selectedPlace = s.value;
    }
    this._whereInput = '';
    this._suggestions = [];
    this._openSection = null;
    this._highlightIndex = -1;
    this._emitFilter();
  }

  private _removeCounty(county: string) {
    const next = new Set(this._selectedCounties);
    next.delete(county);
    this._selectedCounties = next;
    this._emitFilter();
  }

  private _removeEcoregion(ecor: string) {
    const next = new Set(this._selectedEcoregions);
    next.delete(ecor);
    this._selectedEcoregions = next;
    this._emitFilter();
  }

  private _removePlace() {
    this._selectedPlace = null;
    this._emitFilter();
  }

  // --- Elevation ---

  private _onElevMinInput(e: Event) {
    const raw = parseInt((e.target as HTMLInputElement).value, 10);
    this._elevMin = isNaN(raw) ? null : raw;
    this._emitFilter();
  }

  private _onElevMaxInput(e: Event) {
    const raw = parseInt((e.target as HTMLInputElement).value, 10);
    this._elevMax = isNaN(raw) ? null : raw;
    this._emitFilter();
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

  // --- Section renderers ---

  private _renderWhat() {
    const hasTaxon = this._selectedTaxon !== null;
    return html`
      <div class="filter-row">
        <!-- bee icon -->
        <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
          <ellipse cx="8" cy="10.5" rx="3" ry="4"/>
          <ellipse cx="4.5" cy="7" rx="2.5" ry="1.2" transform="rotate(-25 4.5 7)"/>
          <ellipse cx="11.5" cy="7" rx="2.5" ry="1.2" transform="rotate(25 11.5 7)"/>
          <circle cx="8" cy="5.5" r="1.3"/>
          <line x1="6.8" y1="4.4" x2="5.5" y2="2.5"/>
          <line x1="9.2" y1="4.4" x2="10.5" y2="2.5"/>
        </svg>
        <div class="input-group">
          <div class="input-wrap">
            <input
              type="text"
              class=${'filter-input' + (hasTaxon ? ' has-clear' : '')}
              placeholder="Species or group"
              .value=${this._taxonInput}
              @input=${this._onTaxonInput}
              @keydown=${(e: KeyboardEvent) => this._handleKeydown(e, 'taxon', () => {
                if (hasTaxon) this._clearTaxon();
              })}
              @blur=${this._onBlur}
              autocomplete="off"
              spellcheck="false"
            />
            ${hasTaxon ? html`
              <button class="input-clear" @click=${this._clearTaxon} aria-label="Clear species filter">&#x2715;</button>
            ` : nothing}
            ${this._openSection === 'taxon' && this._suggestions.length > 0 ? html`
              <ul class="suggestions" role="listbox">
                ${this._suggestions.map((s, i) => html`
                  <li class=${'suggestion' + (i === this._highlightIndex ? ' hl' : '')}
                      role="option"
                      @mousedown=${(e: Event) => { e.preventDefault(); this._pickSuggestion(s); }}>
                    ${s.label}
                  </li>
                `)}
              </ul>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }

  private _renderWho() {
    return html`
      <div class="filter-row">
        <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M8 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
          <path d="M3 14a5 5 0 0 1 10 0"/>
        </svg>
        <div class="input-group">
          ${this._selectedCollectors.length > 0 ? html`
            <div class="chips">
              ${this._selectedCollectors.map((c, i) => html`
                <span class="chip">
                  ${c.displayName}
                  <button class="chip-remove" @click=${() => this._removeCollector(i)}
                    aria-label="Remove ${c.displayName}">&#x2715;</button>
                </span>
              `)}
            </div>
          ` : nothing}
          <div class="input-wrap">
            <input
              type="text"
              class="filter-input"
              placeholder="Collector"
              .value=${this._collectorInput}
              @input=${this._onCollectorInput}
              @keydown=${(e: KeyboardEvent) => this._handleKeydown(e, 'collector', () => {
                if (this._selectedCollectors.length > 0)
                  this._removeCollector(this._selectedCollectors.length - 1);
              })}
              @blur=${this._onBlur}
              autocomplete="off"
              spellcheck="false"
            />
            ${this._openSection === 'collector' && this._suggestions.length > 0 ? html`
              <ul class="suggestions" role="listbox">
                ${this._suggestions.map((s, i) => html`
                  <li class=${'suggestion' + (i === this._highlightIndex ? ' hl' : '')}
                      role="option"
                      @mousedown=${(e: Event) => { e.preventDefault(); this._pickSuggestion(s); }}>
                    ${s.label}
                  </li>
                `)}
              </ul>
            ` : nothing}
          </div>
        </div>
      </div>
    `;
  }

  private _renderWhere() {
    const counties = [...this._selectedCounties];
    const ecoregions = [...this._selectedEcoregions];
    const hasChips = counties.length > 0 || ecoregions.length > 0 || this._selectedPlace !== null;
    return html`
      <div class="filter-row">
        <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M8 1a5 5 0 0 1 5 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 0 1 5-5z"/>
          <circle cx="8" cy="6" r="1.5"/>
        </svg>
        <div class="input-group">
          ${hasChips ? html`
            <div class="chips">
              ${counties.map(c => html`
                <span class="chip">
                  ${c} County
                  <button class="chip-remove" @click=${() => this._removeCounty(c)}
                    aria-label="Remove ${c} County">&#x2715;</button>
                </span>
              `)}
              ${ecoregions.map(e => html`
                <span class="chip">
                  ${e}
                  <button class="chip-remove" @click=${() => this._removeEcoregion(e)}
                    aria-label="Remove ${e}">&#x2715;</button>
                </span>
              `)}
              ${this._selectedPlace !== null ? html`
                <span class="chip">
                  ${this._placeNameBySlug.get(this._selectedPlace) ?? this._selectedPlace}
                  <button class="chip-remove" @click=${() => this._removePlace()}
                    aria-label="Remove ${this._placeNameBySlug.get(this._selectedPlace) ?? this._selectedPlace}">&#x2715;</button>
                </span>
              ` : nothing}
            </div>
          ` : nothing}
          <div class="input-wrap">
            <input
              type="text"
              class=${'filter-input has-near-me'}
              placeholder="County, ecoregion, or place"
              .value=${this.boundsFilterActive ? this.boundsFilterLabel : this._whereInput}
              ?readonly=${this.boundsFilterActive}
              @input=${this._onWhereInput}
              @keydown=${(e: KeyboardEvent) => this._handleKeydown(e, 'where', () => {
                if (ecoregions.length > 0) this._removeEcoregion(ecoregions[ecoregions.length - 1]!);
                else if (counties.length > 0) this._removeCounty(counties[counties.length - 1]!);
                else if (this._selectedPlace !== null) this._removePlace();
              })}
              @blur=${this._onBlur}
              autocomplete="off"
              spellcheck="false"
            />
            ${this.boundsFilterActive ? html`
              <button type="button" class="near-me-btn"
                aria-label="Clear near-me filter"
                @click=${() => this.dispatchEvent(new CustomEvent('near-me-cleared', { bubbles: true, composed: true }))}>&#x2715;</button>
            ` : html`
              <button type="button" class="near-me-btn"
                aria-label="Find occurrences near me"
                @click=${() => this.dispatchEvent(new CustomEvent('near-me-requested', { bubbles: true, composed: true }))}>
                ${this._crosshairSvg}
              </button>
            `}
            ${this._openSection === 'where' && this._suggestions.length > 0 ? html`
              <ul class="suggestions" role="listbox">
                ${this._suggestions.map((s, i) => html`
                  <li class=${'suggestion' + (i === this._highlightIndex ? ' hl' : '')}
                      role="option"
                      @mousedown=${(e: Event) => { e.preventDefault(); this._pickSuggestion(s); }}>
                    ${s.label}
                  </li>
                `)}
              </ul>
            ` : nothing}
          </div>
          <p class="hint hint--desktop-only">Shift-drag on map to set bounds</p>
          <div class="elev-row">
            <input
              type="number" class="elev-input"
              placeholder="Minimum elevation (m)"
              min="0" step="1"
              .value=${this._elevMin !== null ? String(this._elevMin) : ''}
              @input=${this._onElevMinInput}
              aria-label="Minimum elevation in meters"
            />
            <input
              type="number" class="elev-input"
              placeholder="Maximum elevation (m)"
              min="0" step="1"
              .value=${this._elevMax !== null ? String(this._elevMax) : ''}
              @input=${this._onElevMaxInput}
              aria-label="Maximum elevation in meters"
            />
          </div>
        </div>
      </div>
    `;
  }

  private _renderWhen() {
    return html`
      <div class="filter-row">
        <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="2" y="3" width="12" height="11" rx="1"/>
          <path d="M2 7h12M5 1v4M11 1v4"/>
        </svg>
        <div class="year-row">
          <label class="year-label">
            <input type="checkbox" .checked=${this._yearThisYear}
              @change=${(e: Event) => { this._yearThisYear = (e.target as HTMLInputElement).checked; this._emitFilter(); }}
            />
            This year
          </label>
          <label class="year-label">
            <input type="checkbox" .checked=${this._yearLastYear}
              @change=${(e: Event) => { this._yearLastYear = (e.target as HTMLInputElement).checked; this._emitFilter(); }}
            />
            Last year
          </label>
          <label class="year-label">
            <input type="checkbox" .checked=${this._yearEarlier}
              @change=${(e: Event) => { this._yearEarlier = (e.target as HTMLInputElement).checked; this._emitFilter(); }}
            />
            Earlier
          </label>
        </div>
      </div>
    `;
  }

  private _renderSources() {
    const layers: Array<{ label: string; tooltip: string; checked: boolean; onChange: (e: Event) => void }> = [
      {
        label: 'Ecdysis specimens',
        tooltip: 'Physical bee specimens in the Ecdysis catalog',
        checked: !this._hiddenSources.has('ecdysis'),
        onChange: (e: Event) => this._onSourceToggle('ecdysis', (e.target as HTMLInputElement).checked),
      },
      {
        label: 'Provisional WABA',
        tooltip: 'WABA field collections not yet entered in Ecdysis',
        checked: !this._hiddenSources.has('waba_sample'),
        onChange: (e: Event) => this._onSourceToggle('waba_sample', (e.target as HTMLInputElement).checked),
      },
      {
        label: 'iNat expert obs',
        tooltip: 'iNaturalist observations identified by experts',
        checked: !this._hiddenSources.has('inat_obs'),
        onChange: (e: Event) => this._onSourceToggle('inat_obs', (e.target as HTMLInputElement).checked),
      },
      {
        label: 'Checklist records',
        tooltip: 'Published specimen records from Bartholomew et al. 2024',
        checked: !this._hiddenSources.has('checklist'),
        onChange: (e: Event) => this._onSourceToggle('checklist', (e.target as HTMLInputElement).checked),
      },
    ];
    return html`
      <div class="filter-row">
        <svg class="row-icon" width="16" height="16" viewBox="0 0 16 16" fill="none"
             stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <polygon points="8,2 14,5.5 8,9 2,5.5"/>
          <polyline points="2,8.5 8,12 14,8.5"/>
        </svg>
        <div class="year-row">
          ${layers.map(l => html`
            <label class="year-label" title="${l.tooltip}">
              <input type="checkbox"
                .checked=${l.checked}
                aria-label="${l.label}"
                @change=${l.onChange}
              />
              ${l.label}
            </label>
          `)}
        </div>
      </div>
    `;
  }

  private _renderListContent() {
    const PAGE_SIZE = 100;
    const totalPages = Math.ceil(this.listRowCount / PAGE_SIZE);

    return html`
      <div class="sidebar-header">
        <span class="sidebar-title">Filters</span>
        <button class="expand-btn" @click=${this._onExpand} aria-label="Expand to table view">⊞</button>
        <button class="pane-close" @click=${this._onToggle} aria-label="Close pane">&#x2715;</button>
      </div>
      <div class="list-scroll">
        <div class="filter-panel">
          ${this._renderWhat()}
          ${this._renderWho()}
          ${this._renderWhere()}
          ${this._renderWhen()}
          ${this._renderSources()}
        </div>
        <div class="divider"></div>
        ${this.selectionCount !== null ? html`
          <div class="selection-banner">
            <span>${this.selectionCount} selected</span>
            <span>·</span>
            <button class="clear-btn" @click=${this._onClearSelection}>Clear</button>
          </div>
        ` : nothing}
        ${this.listLoading
          ? html`<div class="list-placeholder">Loading…</div>`
          : this._hiddenSources.size === 4
            ? html`<div class="panel-content"><p class="hint">No sources selected. Enable at least one source above.</p></div>`
            : this.listRows.length === 0
              ? html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
              : html`<bee-occurrence-detail .occurrences=${this.listRows} .taxonCache=${this.taxonCache} .filterState=${this.filterState}></bee-occurrence-detail>`
        }
      </div>
      ${this.listRowCount > PAGE_SIZE ? html`
        <div class="list-pager">
          <button ?disabled=${this.listPage <= 1} @click=${this._onListPagePrev}>‹ Prev</button>
          <span>${this.listPage} / ${totalPages}</span>
          <button ?disabled=${this.listPage >= totalPages} @click=${this._onListPageNext}>Next ›</button>
        </div>
      ` : nothing}
    `;
  }

  private _renderTableContent() {
    return html`
      <div class="table-header">
        <button class="shrink-btn" @click=${this._onShrink} aria-label="Return to list view">⊟</button>
        <span class="table-header-spacer"></span>
        <button class="pane-close" @click=${this._onToggle} aria-label="Close pane">&#x2715;</button>
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
    if (this.paneState === 'collapsed') {
      const active = this.filterActive || (this.selectionCount ?? 0) > 0;
      const specimens = this.specimenCount ?? this.summary?.totalSpecimens;
      const countLabel = specimens == null ? '… specimens' : quantify(specimens, 'specimen');
      return html`
        <button
          class=${'filter-btn' + (active ? ' active' : '')}
          @click=${this._onToggle}
          aria-label="Toggle occurrence pane"
          aria-expanded="false"
          aria-haspopup="true"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
               stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4"/>
            <line x1="9.9" y1="9.9" x2="13.5" y2="13.5"/>
          </svg>
          ${countLabel}
        </button>
      `;
    }
    if (this.paneState === 'table') {
      return this._renderTableContent();
    }
    // list state
    return this._renderListContent();
  }
}

// Suppress unused variable warnings for filter-related code used in Plan 02
void isFilterActive;

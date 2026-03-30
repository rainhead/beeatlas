import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface Specimen {
  name: string;
  occid: string;
  inatObservationId?: number | null;
  floralHost?: string | null;
}

export interface Sample {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  species: Specimen[];
}

export interface DataSummary {
  totalSpecimens: number;
  speciesCount: number;
  genusCount: number;
  familyCount: number;
  earliestYear: number;
  latestYear: number;
}

export interface TaxonOption {
  label: string;      // display string, e.g. "Bombus (genus)" or "Apis mellifera"
  name: string;       // the actual field value to filter on
  rank: 'family' | 'genus' | 'species';
}

export interface FilteredSummary {
  filteredSpecimens: number;
  filteredSpeciesCount: number;
  filteredGenusCount: number;
  filteredFamilyCount: number;
  total: DataSummary;   // the full unfiltered totals
  isActive: boolean;    // true if any filter is on (controls whether to show "X of Y" or just "Y")
}

export interface SampleEvent {
  observation_id: number;
  observer: string;
  date: string;
  specimen_count: number;
  sample_id: number | null;
  coordinate: number[];  // EPSG:3857
}

// Custom event payload
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  boundaryMode: 'off' | 'counties' | 'ecoregions';
}

@customElement('bee-sidebar')
export class BeeSidebar extends LitElement {
  @property({ attribute: false })
  samples: Sample[] | null = null;

  @property({ attribute: false })
  summary: DataSummary | null = null;

  @property({ attribute: false })
  taxaOptions: TaxonOption[] = [];

  @property({ attribute: false })
  filteredSummary: FilteredSummary | null = null;

  @property({ attribute: false })
  layerMode: 'specimens' | 'samples' = 'specimens';

  @property({ attribute: false })
  recentSampleEvents: SampleEvent[] = [];

  @property({ attribute: false })
  selectedSampleEvent: SampleEvent | null = null;

  // URL-restore properties — driven by BeeMap when restoring from URL or popstate
  @property({ attribute: false }) restoredTaxonInput: string = '';
  @property({ attribute: false }) restoredTaxonRank: 'family' | 'genus' | 'species' | null = null;
  @property({ attribute: false }) restoredTaxonName: string | null = null;
  @property({ attribute: false }) restoredYearFrom: number | null = null;
  @property({ attribute: false }) restoredYearTo: number | null = null;
  @property({ attribute: false }) restoredMonths: Set<number> = new Set();

  // Region props — driven by BeeMap
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) restoredCounties: Set<string> = new Set();
  @property({ attribute: false }) restoredEcoregions: Set<string> = new Set();

  @state() private _taxonInput = '';
  @state() private _taxonRank: 'family' | 'genus' | 'species' | null = null;
  @state() private _taxonName: string | null = null;
  @state() private _yearFrom: number | null = null;
  @state() private _yearTo: number | null = null;
  @state() private _months: Set<number> = new Set();
  @state() private _selectedCounties: Set<string> = new Set();
  @state() private _selectedEcoregions: Set<string> = new Set();
  @state() private _countyInput = '';
  @state() private _ecoregionInput = '';

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      font-family: system-ui, sans-serif;
    }
    .filter-controls {
      padding: 1rem;
      border-bottom: 1px solid #ddd;
    }
    .filter-controls h3 {
      margin: 0 0 0.75rem 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: #444;
    }
    .filter-row {
      margin-bottom: 0.6rem;
    }
    .filter-row input[type="text"],
    .filter-row input[type="number"] {
      width: 100%;
      box-sizing: border-box;
      padding: 0.35rem 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .year-row {
      display: flex;
      gap: 0.5rem;
    }
    .year-row input {
      flex: 1;
    }
    .month-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.25rem;
      margin-top: 0.25rem;
    }
    .month-grid label {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8rem;
      cursor: pointer;
    }
    .taxon-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .taxon-row input[type="text"] {
      flex: 1;
      min-width: 0;
    }
    .taxon-clear-btn {
      flex-shrink: 0;
      padding: 0.3rem 0.5rem;
      cursor: pointer;
      border: 1px solid #ccc;
      background: transparent;
      border-radius: 4px;
      font-size: 0.8rem;
      line-height: 1;
      color: #666;
    }
    .taxon-clear-btn:hover {
      background: #f0f0f0;
      color: #333;
    }
    .clear-btn {
      margin-top: 0.6rem;
      padding: 0.3rem 0.75rem;
      cursor: pointer;
      border: 1px solid #ccc;
      background: transparent;
      border-radius: 4px;
      font-size: 0.85rem;
    }
    .panel-content {
      padding: 1rem;
    }
    .back-btn {
      margin: 0.75rem;
      padding: 0.4rem 0.75rem;
      cursor: pointer;
      border: 1px solid #ccc;
      background: transparent;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    .sample {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #eee;
    }
    .sample-header {
      font-weight: 600;
      margin-bottom: 0.25rem;
      font-size: 0.9rem;
    }
    .sample-meta {
      font-size: 0.8rem;
      color: #666;
      margin-bottom: 0.5rem;
    }
    .species-list {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.85rem;
      font-style: italic;
    }
    dt {
      font-weight: 600;
      font-size: 0.85rem;
    }
    dd {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
    }
    .hint {
      color: #888;
      font-size: 0.85rem;
      font-style: italic;
    }
    .layer-toggle {
      display: flex;
      border-bottom: 1px solid #ddd;
    }
    .toggle-btn {
      flex: 1;
      padding: 0.6rem 1rem;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      color: #888;
      transition: none;
    }
    .toggle-btn:hover {
      background: #f5f5f5;
      color: #444;
    }
    .toggle-btn.active {
      color: #2c7a2c;
      border-bottom-color: #2c7a2c;
      font-weight: 600;
    }
    .recent-events {
      display: flex;
      flex-direction: column;
    }
    .recent-events-header {
      padding: 0.75rem 1rem 0.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #444;
      border-bottom: 1px solid #eee;
    }
    .event-row {
      padding: 0.6rem 1rem;
      border-bottom: 1px solid #eee;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .event-row:hover {
      background: #f8f8f8;
    }
    .event-date {
      font-size: 0.85rem;
      font-weight: 600;
      color: #333;
    }
    .event-date-heading {
      padding: 0.5rem 1rem 0.25rem;
      font-size: 0.8rem;
      font-weight: 700;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: #f5f5f5;
      border-bottom: 1px solid #eee;
    }
    .event-observer {
      font-size: 0.8rem;
      color: #666;
    }
    .event-count {
      font-size: 0.8rem;
      color: #888;
    }
    .inat-missing {
      color: #aaa;
      font-style: normal;
    }
    .sample-dot-detail {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .sample-dot-detail-header {
      margin-bottom: 0.25rem;
    }
    .event-inat {
      font-size: 0.85rem;
    }
    .region-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      margin-top: 0.5rem;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      background: #f0f0f0;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 0.85rem;
      color: #333;
    }
    .chip-type {
      font-size: 0.75rem;
      font-weight: 400;
      background: #e0e0e0;
      color: #555;
      border-radius: 3px;
      padding: 0 0.25rem;
    }
    .chip-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: #666;
      font-size: 0.85rem;
      padding: 0.25rem;
      line-height: 1;
      border-radius: 2px;
      min-width: 24px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .chip-remove:hover {
      color: #333;
      background: #d0d0d0;
    }
  `;

  updated(changedProperties: PropertyValues) {
    // When BeeMap pushes a restored filter state (from URL load or popstate),
    // apply it to the internal @state fields that drive the filter control UI.
    const restoredKeys = [
      'restoredTaxonInput', 'restoredTaxonRank', 'restoredTaxonName',
      'restoredYearFrom', 'restoredYearTo', 'restoredMonths',
    ];
    if (restoredKeys.some(k => changedProperties.has(k))) {
      this._taxonInput = this.restoredTaxonInput;
      this._taxonRank  = this.restoredTaxonRank;
      this._taxonName  = this.restoredTaxonName;
      this._yearFrom   = this.restoredYearFrom;
      this._yearTo     = this.restoredYearTo;
      this._months     = new Set(this.restoredMonths);
    }
    if (changedProperties.has('restoredCounties')) {
      this._selectedCounties = new Set(this.restoredCounties);
    }
    if (changedProperties.has('restoredEcoregions')) {
      this._selectedEcoregions = new Set(this.restoredEcoregions);
    }
  }

  private _dispatchFilterChanged() {
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true,
      composed: true,
      detail: {
        taxonName: this._taxonName,
        taxonRank: this._taxonRank,
        yearFrom: this._yearFrom,
        yearTo: this._yearTo,
        months: new Set(this._months),  // copy so caller can safely hold reference
        selectedCounties: new Set(this._selectedCounties),
        selectedEcoregions: new Set(this._selectedEcoregions),
        boundaryMode: this.boundaryMode,
      },
    }));
  }

  private _onTaxonInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    this._taxonInput = value;
    if (value === '') {
      this._taxonName = null;
      this._taxonRank = null;
      this._dispatchFilterChanged();
      return;
    }
    // Also resolve on exact label match — catches native datalist dropdown selection
    // (browser fires 'input' reliably; 'change' is unreliable for datalist picks)
    const option = this.taxaOptions.find(o => o.label === value);
    if (option) {
      this._taxonName = option.name;
      this._taxonRank = option.rank;
      this._dispatchFilterChanged();
    }
    // If no exact match, user is mid-keystroke — do not apply a partial filter
  }

  private _onTaxonChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    if (value === '') {
      this._taxonName = null;
      this._taxonRank = null;
      this._dispatchFilterChanged();
      return;
    }
    const option = this.taxaOptions.find(o => o.label === value);
    if (option) {
      this._taxonName = option.name;
      this._taxonRank = option.rank;
      this._dispatchFilterChanged();
    }
    // If not found in list, do nothing (no filter applied)
  }

  private _onYearFromChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const val = input.value ? parseInt(input.value, 10) : null;
    this._yearFrom = (val !== null && this._yearTo !== null && val > this._yearTo) ? this._yearTo : val;
    this._dispatchFilterChanged();
  }

  private _onYearToChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const val = input.value ? parseInt(input.value, 10) : null;
    this._yearTo = (val !== null && this._yearFrom !== null && val < this._yearFrom) ? this._yearFrom : val;
    this._dispatchFilterChanged();
  }

  private _onMonthChange(month: number, checked: boolean) {
    const next = new Set(this._months);
    if (checked) {
      next.add(month);
    } else {
      next.delete(month);
    }
    this._months = next;
    this._dispatchFilterChanged();
  }

  private _clearFilters() {
    this._taxonInput = '';
    this._taxonName = null;
    this._taxonRank = null;
    this._yearFrom = null;
    this._yearTo = null;
    this._months = new Set();
    this._selectedCounties = new Set();
    this._selectedEcoregions = new Set();
    this._countyInput = '';
    this._ecoregionInput = '';
    this.boundaryMode = 'off';
    this._dispatchFilterChanged();
  }

  private _clearTaxon() {
    this._taxonInput = '';
    this._taxonName = null;
    this._taxonRank = null;
    this._dispatchFilterChanged();
  }

  private _clearSelection() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  private _getMonthName(month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
      new Date(2000, month - 1)
    );
  }

  private _onBoundaryToggle(mode: 'off' | 'counties' | 'ecoregions') {
    if (mode === this.boundaryMode) return;
    this.boundaryMode = mode;
    this._dispatchFilterChanged();
  }

  private _onCountyInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this._countyInput = input.value;
    const match = this.countyOptions.find(o => o === input.value);
    if (match && !this._selectedCounties.has(match)) {
      const next = new Set(this._selectedCounties);
      next.add(match);
      this._selectedCounties = next;
      this._countyInput = '';
      input.value = '';
      this._dispatchFilterChanged();
    }
  }

  private _onCountyChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    const match = this.countyOptions.find(o => o === value);
    if (match && !this._selectedCounties.has(match)) {
      const next = new Set(this._selectedCounties);
      next.add(match);
      this._selectedCounties = next;
      this._countyInput = '';
      input.value = '';
      this._dispatchFilterChanged();
    }
  }

  private _onEcoregionInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this._ecoregionInput = input.value;
    const match = this.ecoregionOptions.find(o => o === input.value);
    if (match && !this._selectedEcoregions.has(match)) {
      const next = new Set(this._selectedEcoregions);
      next.add(match);
      this._selectedEcoregions = next;
      this._ecoregionInput = '';
      input.value = '';
      this._dispatchFilterChanged();
    }
  }

  private _onEcoregionChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    const match = this.ecoregionOptions.find(o => o === value);
    if (match && !this._selectedEcoregions.has(match)) {
      const next = new Set(this._selectedEcoregions);
      next.add(match);
      this._selectedEcoregions = next;
      this._ecoregionInput = '';
      input.value = '';
      this._dispatchFilterChanged();
    }
  }

  private _removeCounty(name: string) {
    const next = new Set(this._selectedCounties);
    next.delete(name);
    this._selectedCounties = next;
    this._dispatchFilterChanged();
  }

  private _removeEcoregion(name: string) {
    const next = new Set(this._selectedEcoregions);
    next.delete(name);
    this._selectedEcoregions = next;
    this._dispatchFilterChanged();
  }

  private _renderBoundaryToggle() {
    return html`
      <div class="layer-toggle">
        <button
          class=${this.boundaryMode === 'off' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onBoundaryToggle('off')}
        >Off</button>
        <button
          class=${this.boundaryMode === 'counties' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onBoundaryToggle('counties')}
        >Counties</button>
        <button
          class=${this.boundaryMode === 'ecoregions' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onBoundaryToggle('ecoregions')}
        >Ecoregions</button>
      </div>
    `;
  }

  private _renderRegionChips() {
    const bothActive = this._selectedCounties.size > 0 && this._selectedEcoregions.size > 0;
    if (this._selectedCounties.size === 0 && this._selectedEcoregions.size === 0) return '';
    return html`
      <div class="region-chips">
        ${[...this._selectedCounties].map(name => html`
          <span class="chip">
            ${bothActive ? html`<span class="chip-type">county</span>` : ''}
            ${name}
            <button class="chip-remove" aria-label="Remove ${name}" @click=${() => this._removeCounty(name)}>&#x2715;</button>
          </span>
        `)}
        ${[...this._selectedEcoregions].map(name => html`
          <span class="chip">
            ${bothActive ? html`<span class="chip-type">ecoregion</span>` : ''}
            ${name}
            <button class="chip-remove" aria-label="Remove ${name}" @click=${() => this._removeEcoregion(name)}>&#x2715;</button>
          </span>
        `)}
      </div>
    `;
  }

  private _renderRegionControls() {
    return html`
      <div class="filter-controls">
        <div class="filter-row">
          <input
            type="text"
            list="county-list"
            placeholder="Filter by county\u2026"
            .value=${this._countyInput}
            @input=${this._onCountyInput}
            @change=${this._onCountyChange}
          />
          <datalist id="county-list">
            ${this.countyOptions.map(name => html`<option value=${name}></option>`)}
          </datalist>
        </div>
        <div class="filter-row">
          <input
            type="text"
            list="ecoregion-list"
            placeholder="Filter by ecoregion\u2026"
            .value=${this._ecoregionInput}
            @input=${this._onEcoregionInput}
            @change=${this._onEcoregionChange}
          />
          <datalist id="ecoregion-list">
            ${this.ecoregionOptions.map(name => html`<option value=${name}></option>`)}
          </datalist>
        </div>
        ${this._renderRegionChips()}
        <button class="clear-btn" @click=${this._clearFilters}>Clear filters</button>
      </div>
    `;
  }

  private _renderToggle() {
    return html`
      <div class="layer-toggle">
        <button
          class=${this.layerMode === 'specimens' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onToggleLayer('specimens')}
        >Specimens</button>
        <button
          class=${this.layerMode === 'samples' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onToggleLayer('samples')}
        >Samples</button>
      </div>
    `;
  }

  private _onToggleLayer(mode: 'specimens' | 'samples') {
    if (mode === this.layerMode) return;  // no-op if already active
    this.dispatchEvent(new CustomEvent<'specimens' | 'samples'>('layer-changed', {
      bubbles: true,
      composed: true,
      detail: mode,
    }));
  }

  private _onSampleEventRowClick(event: SampleEvent) {
    this.dispatchEvent(new CustomEvent<{coordinate: number[]}>('sample-event-click', {
      bubbles: true,
      composed: true,
      detail: { coordinate: event.coordinate },
    }));
  }

  private _formatSampleDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(d);
  }

  private _renderRecentSampleEvents() {
    if (this.recentSampleEvents.length === 0) {
      return html`
        <div class="panel-content">
          <p class="hint">Loading sample data...</p>
        </div>
      `;
    }
    const byDate = new Map<string, SampleEvent[]>();
    for (const event of this.recentSampleEvents) {
      const group = byDate.get(event.date) ?? [];
      group.push(event);
      byDate.set(event.date, group);
    }
    return html`
      <div class="recent-events">
        <div class="recent-events-header">Recent collections (last 14 days)</div>
        ${[...byDate.entries()].map(([date, events]) => html`
          <div class="event-date-heading">${this._formatSampleDate(date)}</div>
          ${events.map(event => html`
            <div class="event-row" @click=${() => this._onSampleEventRowClick(event)}>
              <div class="event-observer">
                ${event.observer}${event.sample_id != null ? html` · <a href="https://www.inaturalist.org/observations/${event.observation_id}" target="_blank" rel="noopener" @click=${(e: Event) => e.stopPropagation()}>sample ${event.sample_id}</a>` : ''}
              </div>
              <div class="event-count">${event.specimen_count != null && !isNaN(event.specimen_count)
                ? `${event.specimen_count} specimen${event.specimen_count === 1 ? '' : 's'}`
                : 'specimen count not recorded'
              }</div>
            </div>
          `)}
        `)}
      </div>
    `;
  }

  private _renderFilterControls() {
    return html`
      <div class="filter-controls">
        <h3>Filter</h3>
        <div class="filter-row taxon-row">
          <input
            type="text"
            list="taxon-list"
            placeholder="Filter by taxon…"
            .value=${this._taxonInput}
            @input=${this._onTaxonInput}
            @change=${this._onTaxonChange}
          />
          ${this._taxonName !== null ? html`
            <button class="taxon-clear-btn" @click=${this._clearTaxon} title="Clear taxon filter">&#x2715;</button>
          ` : ''}
          <datalist id="taxon-list">
            ${this.taxaOptions.map(o => html`<option value=${o.label}></option>`)}
          </datalist>
        </div>
        <div class="filter-row year-row">
          <input
            type="number"
            placeholder="From year"
            min="2023"
            max=${this._yearTo !== null ? String(this._yearTo) : "2025"}
            .value=${this._yearFrom !== null ? String(this._yearFrom) : ''}
            @change=${this._onYearFromChange}
          />
          <input
            type="number"
            placeholder="To year"
            min=${this._yearFrom !== null ? String(this._yearFrom) : "2023"}
            max="2025"
            .value=${this._yearTo !== null ? String(this._yearTo) : ''}
            @change=${this._onYearToChange}
          />
        </div>
        <div class="filter-row">
          <div class="month-grid">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => html`
              <label>
                <input
                  type="checkbox"
                  .checked=${this._months.has(m)}
                  @change=${(e: Event) => this._onMonthChange(m, (e.target as HTMLInputElement).checked)}
                />
                ${this._getMonthName(m)}
              </label>
            `)}
          </div>
        </div>
        ${this.samples !== null ? html`
          <button class="clear-btn clear-selection-btn" @click=${this._clearSelection}>Clear selection</button>
        ` : ''}
      </div>
    `;
  }

  private _formatMonth(year: number, month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(year, month - 1)
    );
  }

  private _renderSummary() {
    const { summary, filteredSummary } = this;
    if (!summary) {
      return html`
        <div class="panel-content">
          <h2>Washington Bee Atlas</h2>
          <p class="hint">Loading data...</p>
        </div>
      `;
    }
    if (filteredSummary && filteredSummary.isActive) {
      const t = filteredSummary.total;
      return html`
        <div class="panel-content">
          <h2>Washington Bee Atlas</h2>
          <dl>
            <dt>Specimens</dt><dd>${filteredSummary.filteredSpecimens.toLocaleString()} of ${t.totalSpecimens.toLocaleString()}</dd>
            <dt>Species</dt><dd>${filteredSummary.filteredSpeciesCount} of ${t.speciesCount}</dd>
            <dt>Genera</dt><dd>${filteredSummary.filteredGenusCount} of ${t.genusCount}</dd>
            <dt>Families</dt><dd>${filteredSummary.filteredFamilyCount} of ${t.familyCount}</dd>
            <dt>Years</dt><dd>${t.earliestYear}–${t.latestYear}</dd>
          </dl>
          <p class="hint">Click a specimen point or cluster to see sample details.</p>
        </div>
      `;
    }
    return html`
      <div class="panel-content">
        <h2>Washington Bee Atlas</h2>
        <dl>
          <dt>Specimens</dt><dd>${summary.totalSpecimens.toLocaleString()}</dd>
          <dt>Species</dt><dd>${summary.speciesCount}</dd>
          <dt>Genera</dt><dd>${summary.genusCount}</dd>
          <dt>Families</dt><dd>${summary.familyCount}</dd>
          <dt>Years</dt><dd>${summary.earliestYear}–${summary.latestYear}</dd>
        </dl>
        <p class="hint">Click a specimen point or cluster to see sample details.</p>
      </div>
    `;
  }

  private _renderSampleDotDetail(event: SampleEvent) {
    const count = event.specimen_count != null && !isNaN(event.specimen_count)
      ? `${event.specimen_count} specimen${event.specimen_count === 1 ? '' : 's'}`
      : 'not recorded';
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="sample-dot-detail-header">
          <button class="back-btn" @click=${() => { this.selectedSampleEvent = null; }}>&#8592; Back</button>
        </div>
        <div class="event-date">${this._formatSampleDate(event.date)}</div>
        <div class="event-observer">${event.observer}</div>
        <div class="event-count">${count}</div>
        <div class="event-inat">
          <a href="https://www.inaturalist.org/observations/${event.observation_id}" target="_blank" rel="noopener">View on iNaturalist</a>
        </div>
      </div>
    `;
  }

  private _renderDetail(samples: Sample[]) {
    return html`
      ${samples.map(sample => html`
        <div class="sample">
          <div class="sample-header">${this._formatMonth(sample.year, sample.month)} ${sample.year}</div>
          <div class="sample-meta">${sample.recordedBy} · ${sample.fieldNumber}</div>
          <ul class="species-list">
            ${sample.species.map(s => html`
              <li>
                <a href="https://ecdysis.org/collections/individual/index.php?occid=${s.occid}" target="_blank" rel="noopener">${s.name}</a>
                ${s.inatObservationId != null
                  ? html` · <a href="https://www.inaturalist.org/observations/${s.inatObservationId}" target="_blank" rel="noopener">${s.floralHost ?? 'no host'}</a>`
                  : html` · <span class="inat-missing">iNat: —</span>`
                }
              </li>
            `)}
          </ul>
        </div>
      `)}
    `;
  }

  render() {
    return html`
      ${this._renderBoundaryToggle()}
      ${this._renderToggle()}
      ${this.layerMode === 'specimens' ? this._renderFilterControls() : ''}
      ${this._renderRegionControls()}
      ${this.samples !== null
        ? this._renderDetail(this.samples)
        : this.layerMode === 'samples' && this.selectedSampleEvent !== null
          ? this._renderSampleDotDetail(this.selectedSampleEvent)
          : this.layerMode === 'samples'
            ? this._renderRecentSampleEvents()
            : this._renderSummary()}
    `;
  }
}

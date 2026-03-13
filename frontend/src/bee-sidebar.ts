import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface Specimen {
  name: string;
  occid: string;
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
  coordinate: number[];  // EPSG:3857
}

// Custom event payload
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
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

  // URL-restore properties — driven by BeeMap when restoring from URL or popstate
  @property({ attribute: false }) restoredTaxonInput: string = '';
  @property({ attribute: false }) restoredTaxonRank: 'family' | 'genus' | 'species' | null = null;
  @property({ attribute: false }) restoredTaxonName: string | null = null;
  @property({ attribute: false }) restoredYearFrom: number | null = null;
  @property({ attribute: false }) restoredYearTo: number | null = null;
  @property({ attribute: false }) restoredMonths: Set<number> = new Set();

  @state() private _taxonInput = '';
  @state() private _taxonRank: 'family' | 'genus' | 'species' | null = null;
  @state() private _taxonName: string | null = null;
  @state() private _yearFrom: number | null = null;
  @state() private _yearTo: number | null = null;
  @state() private _months: Set<number> = new Set();

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
    .event-observer {
      font-size: 0.8rem;
      color: #666;
    }
    .event-count {
      font-size: 0.8rem;
      color: #888;
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
    return html`
      <div class="recent-events">
        <div class="recent-events-header">Recent collections (last 14 days)</div>
        ${this.recentSampleEvents.map(event => html`
          <div class="event-row" @click=${() => this._onSampleEventRowClick(event)}>
            <div class="event-date">${this._formatSampleDate(event.date)}</div>
            <div class="event-observer">${event.observer}</div>
            <div class="event-count">${event.specimen_count != null && !isNaN(event.specimen_count)
              ? `${event.specimen_count} specimen${event.specimen_count === 1 ? '' : 's'}`
              : 'specimen count not recorded'
            }</div>
          </div>
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
        <button class="clear-btn" @click=${this._clearFilters}>Clear filters</button>
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

  private _renderDetail(samples: Sample[]) {
    return html`
      ${samples.map(sample => html`
        <div class="sample">
          <div class="sample-header">${this._formatMonth(sample.year, sample.month)} ${sample.year}</div>
          <div class="sample-meta">${sample.recordedBy} · ${sample.fieldNumber}</div>
          <ul class="species-list">
            ${sample.species.map(s => html`<li><a href="https://ecdysis.org/collections/individual/index.php?occid=${s.occid}" target="_blank" rel="noopener">${s.name}</a></li>`)}
          </ul>
        </div>
      `)}
    `;
  }

  render() {
    return html`
      ${this._renderToggle()}
      ${this.layerMode === 'specimens' ? this._renderFilterControls() : ''}
      ${this.samples !== null
        ? this._renderDetail(this.samples)
        : this.layerMode === 'samples'
          ? this._renderRecentSampleEvents()
          : this._renderSummary()}
    `;
  }
}

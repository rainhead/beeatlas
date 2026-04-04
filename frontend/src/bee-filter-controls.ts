import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FilterState } from './filter.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts';

@customElement('bee-filter-controls')
export class BeeFilterControls extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @property({ attribute: false }) summary: DataSummary | null = null;

  @state() private _taxonInputText = '';
  @state() private _countyInputText = '';
  @state() private _ecoregionInputText = '';

  static styles = css`
    :host {
      display: block;
    }
    .filter-controls {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
    }
    .filter-controls h3 {
      margin: 0 0 0.75rem 0;
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .filter-row {
      margin-bottom: 0.6rem;
    }
    .filter-row input[type="text"],
    .filter-row input[type="number"] {
      width: 100%;
      box-sizing: border-box;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--border-input);
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
      border: 1px solid var(--border-input);
      background: transparent;
      border-radius: 4px;
      font-size: 0.8rem;
      line-height: 1;
      color: var(--text-muted);
    }
    .taxon-clear-btn:hover {
      background: var(--surface-muted);
      color: var(--text-body);
    }
    .clear-btn {
      margin-top: 0.6rem;
      padding: 0.3rem 0.75rem;
      cursor: pointer;
      border: 1px solid var(--border-input);
      background: transparent;
      border-radius: 4px;
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
      background: var(--surface-muted);
      border: 1px solid var(--border-input);
      border-radius: 4px;
      font-size: 0.85rem;
      color: var(--text-body);
    }
    .chip-type {
      font-size: 0.75rem;
      font-weight: 400;
      background: var(--surface-chip);
      color: var(--text-tertiary);
      border-radius: 3px;
      padding: 0 0.25rem;
    }
    .chip-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
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
      color: var(--text-body);
      background: var(--surface-pressed);
    }
    .layer-toggle {
      display: flex;
      border-bottom: 1px solid var(--border);
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
      color: var(--text-hint);
      transition: none;
    }
    .toggle-btn:hover {
      background: var(--surface-subtle);
      color: var(--text-secondary);
    }
    .toggle-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }
  `;

  updated(changedProperties: PropertyValues) {
    if (changedProperties.has('filterState')) {
      const prev = changedProperties.get('filterState') as FilterState | undefined;
      if (!prev || prev.taxonName !== this.filterState.taxonName) {
        const opt = this.taxaOptions.find(
          o => o.name === this.filterState.taxonName && o.rank === this.filterState.taxonRank
        );
        this._taxonInputText = opt?.label ?? this.filterState.taxonName ?? '';
      }
      if (!prev || prev.selectedCounties !== this.filterState.selectedCounties) {
        this._countyInputText = '';
      }
      if (!prev || prev.selectedEcoregions !== this.filterState.selectedEcoregions) {
        this._ecoregionInputText = '';
      }
    }
  }

  private _emit(partial: Partial<FilterChangedEvent> = {}) {
    const detail: FilterChangedEvent = {
      taxonName: this.filterState.taxonName,
      taxonRank: this.filterState.taxonRank,
      yearFrom: this.filterState.yearFrom,
      yearTo: this.filterState.yearTo,
      months: new Set(this.filterState.months),
      selectedCounties: new Set(this.filterState.selectedCounties),
      selectedEcoregions: new Set(this.filterState.selectedEcoregions),
      boundaryMode: this.boundaryMode,
      ...partial,
    };
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true, composed: true,
      detail,
    }));
  }

  private _onTaxonInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    this._taxonInputText = value;
    if (value === '') {
      this._emit({ taxonName: null, taxonRank: null });
      return;
    }
    // Also resolve on exact label match — catches native datalist dropdown selection
    // (browser fires 'input' reliably; 'change' is unreliable for datalist picks)
    const option = this.taxaOptions.find(o => o.label === value);
    if (option) {
      this._emit({ taxonName: option.name, taxonRank: option.rank });
    }
    // If no exact match, user is mid-keystroke — do not apply a partial filter
  }

  private _onTaxonChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    if (value === '') {
      this._emit({ taxonName: null, taxonRank: null });
      return;
    }
    const option = this.taxaOptions.find(o => o.label === value);
    if (option) {
      this._emit({ taxonName: option.name, taxonRank: option.rank });
    }
    // If not found in list, do nothing (no filter applied)
  }

  private _onYearFromChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const val = input.value ? parseInt(input.value, 10) : null;
    const yearFrom = (val !== null && this.filterState.yearTo !== null && val > this.filterState.yearTo)
      ? this.filterState.yearTo
      : val;
    this._emit({ yearFrom });
  }

  private _onYearToChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const val = input.value ? parseInt(input.value, 10) : null;
    const yearTo = (val !== null && this.filterState.yearFrom !== null && val < this.filterState.yearFrom)
      ? this.filterState.yearFrom
      : val;
    this._emit({ yearTo });
  }

  private _onMonthChange(month: number, checked: boolean) {
    const next = new Set(this.filterState.months);
    if (checked) {
      next.add(month);
    } else {
      next.delete(month);
    }
    this._emit({ months: next });
  }

  private _clearFilters() {
    this._taxonInputText = '';
    this._countyInputText = '';
    this._ecoregionInputText = '';
    this._emit({
      taxonName: null,
      taxonRank: null,
      yearFrom: null,
      yearTo: null,
      months: new Set(),
      selectedCounties: new Set(),
      selectedEcoregions: new Set(),
      boundaryMode: 'off',
    });
  }

  private _clearTaxon() {
    this._taxonInputText = '';
    this._emit({ taxonName: null, taxonRank: null });
  }

  private _getMonthName(month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(
      new Date(2000, month - 1)
    );
  }

  private _onBoundaryToggle(mode: 'off' | 'counties' | 'ecoregions') {
    if (mode === this.boundaryMode) return;
    this._emit({ boundaryMode: mode });
  }

  private _onCountyInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this._countyInputText = input.value;
    const match = this.countyOptions.find(o => o === input.value);
    if (match && !this.filterState.selectedCounties.has(match)) {
      const next = new Set(this.filterState.selectedCounties);
      next.add(match);
      this._countyInputText = '';
      input.value = '';
      this._emit({ selectedCounties: next });
    }
  }

  private _onCountyChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    const match = this.countyOptions.find(o => o === value);
    if (match && !this.filterState.selectedCounties.has(match)) {
      const next = new Set(this.filterState.selectedCounties);
      next.add(match);
      this._countyInputText = '';
      input.value = '';
      this._emit({ selectedCounties: next });
    }
  }

  private _onEcoregionInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this._ecoregionInputText = input.value;
    const match = this.ecoregionOptions.find(o => o === input.value);
    if (match && !this.filterState.selectedEcoregions.has(match)) {
      const next = new Set(this.filterState.selectedEcoregions);
      next.add(match);
      this._ecoregionInputText = '';
      input.value = '';
      this._emit({ selectedEcoregions: next });
    }
  }

  private _onEcoregionChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value.trim();
    const match = this.ecoregionOptions.find(o => o === value);
    if (match && !this.filterState.selectedEcoregions.has(match)) {
      const next = new Set(this.filterState.selectedEcoregions);
      next.add(match);
      this._ecoregionInputText = '';
      input.value = '';
      this._emit({ selectedEcoregions: next });
    }
  }

  private _removeCounty(name: string) {
    const next = new Set(this.filterState.selectedCounties);
    next.delete(name);
    this._emit({ selectedCounties: next });
  }

  private _removeEcoregion(name: string) {
    const next = new Set(this.filterState.selectedEcoregions);
    next.delete(name);
    this._emit({ selectedEcoregions: next });
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
    const selectedCounties = this.filterState?.selectedCounties ?? new Set<string>();
    const selectedEcoregions = this.filterState?.selectedEcoregions ?? new Set<string>();
    const bothActive = selectedCounties.size > 0 && selectedEcoregions.size > 0;
    if (selectedCounties.size === 0 && selectedEcoregions.size === 0) return '';
    return html`
      <div class="region-chips">
        ${[...selectedCounties].map(name => html`
          <span class="chip">
            ${bothActive ? html`<span class="chip-type">county</span>` : ''}
            ${name}
            <button class="chip-remove" aria-label="Remove ${name}" @click=${() => this._removeCounty(name)}>&#x2715;</button>
          </span>
        `)}
        ${[...selectedEcoregions].map(name => html`
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
            .value=${this._countyInputText}
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
            .value=${this._ecoregionInputText}
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

  private _renderFilterControls() {
    const yearFrom = this.filterState?.yearFrom ?? null;
    const yearTo = this.filterState?.yearTo ?? null;
    const months = this.filterState?.months ?? new Set<number>();
    const taxonName = this.filterState?.taxonName ?? null;

    return html`
      <div class="filter-controls">
        <h3>Filter</h3>
        <div class="filter-row taxon-row">
          <input
            type="text"
            list="taxon-list"
            placeholder="Filter by taxon\u2026"
            .value=${this._taxonInputText}
            @input=${this._onTaxonInput}
            @change=${this._onTaxonChange}
          />
          ${taxonName !== null ? html`
            <button class="taxon-clear-btn" aria-label="Clear taxon filter" @click=${this._clearTaxon} title="Clear taxon filter">&#x2715;</button>
          ` : ''}
          <datalist id="taxon-list">
            ${this.taxaOptions.map(o => html`<option value=${o.label}></option>`)}
          </datalist>
        </div>
        <div class="filter-row year-row">
          <input
            type="number"
            placeholder="From year"
            min=${this.summary ? String(this.summary.earliestYear) : "2023"}
            max=${yearTo !== null ? String(yearTo) : (this.summary ? String(this.summary.latestYear) : "2025")}
            .value=${yearFrom !== null ? String(yearFrom) : ''}
            @change=${this._onYearFromChange}
          />
          <input
            type="number"
            placeholder="To year"
            min=${yearFrom !== null ? String(yearFrom) : (this.summary ? String(this.summary.earliestYear) : "2023")}
            max=${this.summary ? String(this.summary.latestYear) : "2025"}
            .value=${yearTo !== null ? String(yearTo) : ''}
            @change=${this._onYearToChange}
          />
        </div>
        <div class="filter-row">
          <div class="month-grid">
            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => html`
              <label>
                <input
                  type="checkbox"
                  .checked=${months.has(m)}
                  @change=${(e: Event) => this._onMonthChange(m, (e.target as HTMLInputElement).checked)}
                />
                ${this._getMonthName(m)}
              </label>
            `)}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      ${this._renderBoundaryToggle()}
      ${this._renderFilterControls()}
      ${this._renderRegionControls()}
    `;
  }
}

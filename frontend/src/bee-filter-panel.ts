import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { isFilterActive } from './filter.ts';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts';

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
interface WhereSug    { kind: 'where';     label: string; type: 'county' | 'ecoregion'; value: string }
type AnyS = TaxonSug | CollectorSug | WhereSug;

// ---------- component ----------

@customElement('bee-filter-panel')
export class BeeFilterPanel extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;
  @property({ attribute: false }) specimenCount: number | null = null;

  @property({ attribute: false }) hideButton = false;
  @property({ attribute: false }) externalOpen = false;
  @property({ type: Boolean, reflect: true, attribute: 'open-upward' }) openUpward = false;

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
    }
    .panel-container {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
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
    .filter-btn:hover { background: #f0f0f0; }
    .filter-btn.active {
      background: var(--accent, #2c7a2c);
      color: white;
      border-color: var(--accent, #2c7a2c);
    }
    .filter-panel {
      position: absolute;
      top: calc(100% + 0.3rem);
      right: 0;
      background: var(--surface, #fff);
      border: 1px solid rgba(0,0,0,0.2);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      width: 22rem;
      z-index: 10;
      padding: 0.75rem;
      box-sizing: border-box;
    }
    :host([open-upward]) .filter-panel {
      top: auto;
      bottom: calc(100% + 0.3rem);
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
    if (changed.has('externalOpen') && this.hideButton) {
      this._open = this.externalOpen;
    }
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
      } as FilterChangedEvent,
    }));
  }

  private _togglePanel() {
    this._open = !this._open;
    if (!this._open) this._openSection = null;
  }

  // --- shared suggestion keyboard handler ---

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
          sugs.push({ kind: 'taxon', label: opt.label, name: opt.name, rank: opt.rank });
          if (sugs.length >= 5) break;
        }
      }
      this._suggestions = sugs;
      this._openSection = sugs.length > 0 ? 'taxon' : null;
    }
    this._highlightIndex = -1;
  }

  private _selectTaxon(s: TaxonSug) {
    this._selectedTaxon = { name: s.name, rank: s.rank };
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
          if (sugs.length >= 4) break;
        }
      }
      for (const ecor of this.ecoregionOptions) {
        if (!this._selectedEcoregions.has(ecor) && ecor.toLowerCase().includes(lower)) {
          sugs.push({ kind: 'where', label: ecor, type: 'ecoregion', value: ecor });
          if (sugs.length >= 8) break;
        }
      }
      const trimmed = sugs.slice(0, 6);
      this._suggestions = trimmed;
      this._openSection = trimmed.length > 0 ? 'where' : null;
    }
    this._highlightIndex = -1;
  }

  private _selectWhere(s: WhereSug) {
    if (s.type === 'county') {
      this._selectedCounties = new Set([...this._selectedCounties, s.value]);
    } else {
      this._selectedEcoregions = new Set([...this._selectedEcoregions, s.value]);
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
    const hasChips = counties.length > 0 || ecoregions.length > 0;
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
            </div>
          ` : nothing}
          <div class="input-wrap">
            <input
              type="text"
              class="filter-input"
              placeholder="County or ecoregion"
              .value=${this._whereInput}
              @input=${this._onWhereInput}
              @keydown=${(e: KeyboardEvent) => this._handleKeydown(e, 'where', () => {
                if (ecoregions.length > 0) this._removeEcoregion(ecoregions[ecoregions.length - 1]!);
                else if (counties.length > 0) this._removeCounty(counties[counties.length - 1]!);
              })}
              @blur=${this._onBlur}
              autocomplete="off"
              spellcheck="false"
            />
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

  render() {
    const active = isFilterActive(this.filterState);
    const count = this.specimenCount ?? this.summary?.totalSpecimens ?? '…';
    return html`
      <div class="panel-container">
        ${!this.hideButton ? html`<button
          class=${'filter-btn' + (active ? ' active' : '')}
          @click=${this._togglePanel}
          aria-label="Filter occurrences"
          aria-expanded=${this._open}
          aria-haspopup="true"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4"/>
            <line x1="9.9" y1="9.9" x2="13.5" y2="13.5"/>
          </svg>
          ${count} specimens
        </button>` : nothing}
        ${this._open ? html`
          <div class="filter-panel" role="dialog" aria-label="Filter panel">
            ${this._renderWhat()}
            ${this._renderWho()}
            ${this._renderWhere()}
            ${this._renderWhen()}
          </div>
        ` : nothing}
      </div>
    `;
  }
}

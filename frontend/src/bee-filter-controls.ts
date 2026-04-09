import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './bee-sidebar.ts';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// --- Token types ---

interface MonthToken     { type: 'month';     month: number }
interface TaxonToken     { type: 'taxon';     taxonName: string; taxonRank: 'family' | 'genus' | 'species' }
interface CountyToken    { type: 'county';    county: string }
interface EcorToken      { type: 'ecoregion'; ecoregion: string }
interface YearFromToken  { type: 'yearFrom';  year: number }
interface YearToToken    { type: 'yearTo';    year: number }
interface YearExactToken { type: 'yearExact'; year: number }
interface CollectorToken { type: 'collector'; displayName: string; recordedBy: string | null; observer: string | null }

type Token = MonthToken | TaxonToken | CountyToken | EcorToken | YearFromToken | YearToToken | YearExactToken | CollectorToken;
type Suggestion = { label: string; token: Token };

function tokenLabel(t: Token): string {
  switch (t.type) {
    case 'month':     return `in ${MONTH_NAMES[t.month - 1]}`;
    case 'taxon':     return t.taxonRank === 'species' ? t.taxonName : `${t.taxonName} (${t.taxonRank})`;
    case 'county':    return `${t.county} County`;
    case 'ecoregion': return t.ecoregion;
    case 'yearFrom':  return `since ${t.year}`;
    case 'yearTo':    return `until ${t.year}`;
    case 'yearExact': return `in ${t.year}`;
    case 'collector': return `by ${t.displayName}`;
  }
}

function tokensToFilterState(tokens: Token[]): FilterState {
  const f: FilterState = {
    taxonName: null, taxonRank: null,
    yearFrom: null, yearTo: null,
    months: new Set(),
    selectedCounties: new Set(),
    selectedEcoregions: new Set(),
    selectedCollectors: [],
  };
  for (const t of tokens) {
    switch (t.type) {
      case 'month':     f.months.add(t.month); break;
      case 'taxon':     f.taxonName = t.taxonName; f.taxonRank = t.taxonRank; break;
      case 'county':    f.selectedCounties.add(t.county); break;
      case 'ecoregion': f.selectedEcoregions.add(t.ecoregion); break;
      case 'yearFrom':  f.yearFrom = t.year; break;
      case 'yearTo':    f.yearTo = t.year; break;
      case 'yearExact': f.yearFrom = t.year; f.yearTo = t.year; break;
      case 'collector': f.selectedCollectors.push({ displayName: t.displayName, recordedBy: t.recordedBy, observer: t.observer }); break;
    }
  }
  return f;
}

function filterStateToTokens(f: FilterState): Token[] {
  const tokens: Token[] = [];
  if (f.taxonName && f.taxonRank) {
    tokens.push({ type: 'taxon', taxonName: f.taxonName, taxonRank: f.taxonRank });
  }
  if (f.yearFrom !== null && f.yearFrom === f.yearTo) {
    tokens.push({ type: 'yearExact', year: f.yearFrom });
  } else {
    if (f.yearFrom !== null) tokens.push({ type: 'yearFrom', year: f.yearFrom });
    if (f.yearTo   !== null) tokens.push({ type: 'yearTo',   year: f.yearTo });
  }
  for (const m of [...f.months].sort((a, b) => a - b)) tokens.push({ type: 'month', month: m });
  for (const c of [...f.selectedCounties].sort())       tokens.push({ type: 'county', county: c });
  for (const e of [...f.selectedEcoregions].sort())     tokens.push({ type: 'ecoregion', ecoregion: e });
  for (const c of f.selectedCollectors) tokens.push({ type: 'collector', displayName: c.displayName, recordedBy: c.recordedBy, observer: c.observer });
  return tokens;
}

function filterStatesEqual(a: FilterState, b: FilterState): boolean {
  return a.taxonName === b.taxonName
    && a.taxonRank === b.taxonRank
    && a.yearFrom === b.yearFrom
    && a.yearTo === b.yearTo
    && setsEqual(a.months, b.months)
    && setsEqual(a.selectedCounties, b.selectedCounties)
    && setsEqual(a.selectedEcoregions, b.selectedEcoregions)
    && a.selectedCollectors.length === b.selectedCollectors.length
    && a.selectedCollectors.every((c, i) => c.displayName === b.selectedCollectors[i]!.displayName);
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function getSuggestions(
  q: string,
  taxaOptions: TaxonOption[],
  countyOptions: string[],
  ecoregionOptions: string[],
  collectorOptions: CollectorEntry[],
  tokens: Token[],
): Suggestion[] {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const results: Suggestion[] = [];

  // Month suggestions — prefix match
  const activeMonths = new Set(
    tokens.filter((t): t is MonthToken => t.type === 'month').map(t => t.month)
  );
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (MONTH_NAMES[i]!.toLowerCase().startsWith(lower) && !activeMonths.has(i + 1)) {
      results.push({ label: `in ${MONTH_NAMES[i]}`, token: { type: 'month', month: i + 1 } });
    }
  }

  // Year suggestions — only for complete 4-digit input
  if (/^\d{4}$/.test(trimmed)) {
    const year = parseInt(trimmed, 10);
    const hasFrom = tokens.some(t => t.type === 'yearFrom' || t.type === 'yearExact');
    const hasTo   = tokens.some(t => t.type === 'yearTo'   || t.type === 'yearExact');
    if (!hasFrom) results.push({ label: `since ${year}`, token: { type: 'yearFrom', year } });
    if (!hasTo)   results.push({ label: `until ${year}`, token: { type: 'yearTo',   year } });
    results.push({ label: `in ${year}`, token: { type: 'yearExact', year } });
  }

  // Taxon suggestions — substring match, up to 5, only if no taxon token active
  if (!tokens.some(t => t.type === 'taxon')) {
    let n = 0;
    for (const opt of taxaOptions) {
      if (opt.label.toLowerCase().includes(lower)) {
        results.push({ label: opt.label, token: { type: 'taxon', taxonName: opt.name, taxonRank: opt.rank } });
        if (++n >= 5) break;
      }
    }
  }

  // County suggestions — substring match, up to 5
  const activeCounties = new Set(
    tokens.filter((t): t is CountyToken => t.type === 'county').map(t => t.county)
  );
  let cn = 0;
  for (const c of countyOptions) {
    if (c.toLowerCase().includes(lower) && !activeCounties.has(c)) {
      results.push({ label: `${c} County`, token: { type: 'county', county: c } });
      if (++cn >= 5) break;
    }
  }

  // Ecoregion suggestions — substring match, up to 5
  const activeEcor = new Set(
    tokens.filter((t): t is EcorToken => t.type === 'ecoregion').map(t => t.ecoregion)
  );
  let en = 0;
  for (const e of ecoregionOptions) {
    if (e.toLowerCase().includes(lower) && !activeEcor.has(e)) {
      results.push({ label: e, token: { type: 'ecoregion', ecoregion: e } });
      if (++en >= 5) break;
    }
  }

  // Collector suggestions — match on displayName or observer username, up to 5
  const activeCollectors = new Set(
    tokens.filter((t): t is CollectorToken => t.type === 'collector').map(t => t.displayName)
  );
  let col = 0;
  for (const c of collectorOptions) {
    const matchesName = c.displayName.toLowerCase().includes(lower);
    const matchesUsername = c.observer !== null && c.observer.toLowerCase().includes(lower);
    if ((matchesName || matchesUsername) && !activeCollectors.has(c.displayName)) {
      const label = c.observer && c.observer !== c.displayName
        ? `by ${c.displayName} (${c.observer})`
        : `by ${c.displayName}`;
      results.push({ label, token: { type: 'collector', displayName: c.displayName, recordedBy: c.recordedBy, observer: c.observer } });
      if (++col >= 5) break;
    }
  }

  return results.slice(0, 8);
}

// --- Recent filter helpers ---

const RECENTS_KEY = 'beeatlas.recentFilters';
const RECENTS_MAX = 10;

function loadRecentTokens(): Token[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as Token[]) : [];
  } catch {
    return [];
  }
}

function saveRecentToken(token: Token): void {
  const existing = loadRecentTokens();
  // Deduplicate: remove any existing entry for same token identity
  const filtered = existing.filter(t => JSON.stringify(t) !== JSON.stringify(token));
  const next = [token, ...filtered].slice(0, RECENTS_MAX);
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded — ignore
  }
}

function getRecentSuggestions(tokens: Token[]): Suggestion[] {
  const recents = loadRecentTokens();
  const results: Suggestion[] = [];
  const activeTypes = new Set(tokens.map(t => t.type));

  for (const t of recents) {
    // Skip if this exact token is already active
    if (tokens.some(a => JSON.stringify(a) === JSON.stringify(t))) continue;
    // Skip single-slot dimensions that are already filled
    if (t.type === 'taxon' && activeTypes.has('taxon')) continue;
    if ((t.type === 'yearFrom' || t.type === 'yearExact') &&
        (activeTypes.has('yearFrom') || activeTypes.has('yearExact'))) continue;
    if ((t.type === 'yearTo' || t.type === 'yearExact') &&
        (activeTypes.has('yearTo') || activeTypes.has('yearExact'))) continue;
    results.push({ label: tokenLabel(t), token: t });
    if (results.length >= 5) break;
  }
  return results;
}

// --- Component ---

@customElement('bee-filter-controls')
export class BeeFilterControls extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;

  @state() private _tokens: Token[] = [];
  @state() private _inputText = '';
  @state() private _suggestions: Suggestion[] = [];
  @state() private _highlightIndex = -1;
  @state() private _open = false;

  static styles = css`
    :host { display: block; }

    /* Token search */
    .search-section {
      padding: 0.75rem;
      border-bottom: 1px solid var(--border);
      position: relative;
    }
    .token-field {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.3rem;
      padding: 0.35rem 0.5rem;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      cursor: text;
      min-height: 36px;
      background: var(--surface, #fff);
    }
    .token-field:focus-within {
      border-color: var(--accent, #2c7a2c);
    }
    .token {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      padding: 0.15rem 0.35rem;
      background: var(--surface-muted);
      border: 1px solid var(--border-input);
      border-radius: 3px;
      font-size: 0.82rem;
      color: var(--text-body);
      white-space: nowrap;
    }
    .token-remove {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 0.75rem;
      padding: 0 0.1rem;
      line-height: 1;
      border-radius: 2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 16px;
      min-height: 16px;
    }
    .token-remove:hover {
      color: var(--text-body);
      background: var(--surface-pressed);
    }
    .token-input {
      flex: 1;
      min-width: 4rem;
      border: none;
      outline: none;
      font-size: 0.875rem;
      background: transparent;
      color: var(--text-body);
      padding: 0;
    }
    .token-input::placeholder { color: var(--text-hint); }

    /* Dropdown */
    .suggestions {
      position: absolute;
      left: 0.75rem;
      right: 0.75rem;
      top: calc(100% - 0.75rem);
      background: var(--surface, #fff);
      border: 1px solid var(--border-input);
      border-top: none;
      border-radius: 0 0 4px 4px;
      list-style: none;
      margin: 0;
      padding: 0;
      z-index: 100;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      max-height: 240px;
      overflow-y: auto;
    }
    .suggestion {
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--text-body);
    }
    .suggestion:hover,
    .suggestion.highlighted { background: var(--surface-subtle); }

    .clear-btn {
      margin-top: 0.5rem;
      padding: 0.2rem 0;
      cursor: pointer;
      border: none;
      background: none;
      font-size: 0.8rem;
      color: var(--text-hint);
      text-decoration: underline;
    }
    .clear-btn:hover { color: var(--text-body); }
  `;

  updated(changedProperties: PropertyValues) {
    if (changedProperties.has('filterState') && this.filterState) {
      // Only re-sync tokens from external filterState when it genuinely differs
      // from what our current tokens produce — prevents echoing our own emissions.
      if (!filterStatesEqual(tokensToFilterState(this._tokens), this.filterState)) {
        this._tokens = filterStateToTokens(this.filterState);
      }
    }
  }

  private _emitTokens(tokens: Token[]) {
    const f = tokensToFilterState(tokens);
    this.dispatchEvent(new CustomEvent<FilterChangedEvent>('filter-changed', {
      bubbles: true, composed: true,
      detail: { ...f },
    }));
  }

  private _onInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    this._inputText = value;
    if (value === '') {
      this._suggestions = getRecentSuggestions(this._tokens);
    } else {
      this._suggestions = getSuggestions(value, this.taxaOptions, this.countyOptions, this.ecoregionOptions, this.collectorOptions, this._tokens);
    }
    this._open = this._suggestions.length > 0;
    this._highlightIndex = -1;
  }

  private _onFocus() {
    if (this._inputText === '') {
      this._suggestions = getRecentSuggestions(this._tokens);
      this._open = this._suggestions.length > 0;
    }
  }

  private _onKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._highlightIndex = Math.min(this._highlightIndex + 1, this._suggestions.length - 1);
        if (!this._open && this._suggestions.length > 0) this._open = true;
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._highlightIndex = Math.max(this._highlightIndex - 1, -1);
        break;
      case 'Enter': {
        e.preventDefault();
        const idx = this._highlightIndex >= 0 ? this._highlightIndex : 0;
        if (this._suggestions[idx]) this._selectSuggestion(this._suggestions[idx]);
        break;
      }
      case 'Escape':
        this._open = false;
        this._highlightIndex = -1;
        break;
      case 'Backspace':
        if (this._inputText === '' && this._tokens.length > 0) {
          const next = this._tokens.slice(0, -1);
          this._tokens = next;
          this._emitTokens(next);
        }
        break;
    }
  }

  private _selectSuggestion(s: Suggestion) {
    let next = [...this._tokens];
    // Remove any conflicting tokens for single-slot dimensions
    switch (s.token.type) {
      case 'taxon':
        next = next.filter(t => t.type !== 'taxon'); break;
      case 'yearFrom':
        next = next.filter(t => t.type !== 'yearFrom' && t.type !== 'yearExact'); break;
      case 'yearTo':
        next = next.filter(t => t.type !== 'yearTo' && t.type !== 'yearExact'); break;
      case 'yearExact':
        next = next.filter(t => t.type !== 'yearFrom' && t.type !== 'yearTo' && t.type !== 'yearExact'); break;
    }
    next.push(s.token);
    saveRecentToken(s.token);
    this._tokens = next;
    this._inputText = '';
    this._open = false;
    this._highlightIndex = -1;
    this._suggestions = [];
    this._emitTokens(next);
    requestAnimationFrame(() => {
      (this.shadowRoot?.querySelector('.token-input') as HTMLInputElement)?.focus();
    });
  }

  private _removeToken(i: number) {
    const next = [...this._tokens.slice(0, i), ...this._tokens.slice(i + 1)];
    this._tokens = next;
    this._emitTokens(next);
  }

  private _clearAll() {
    this._tokens = [];
    this._inputText = '';
    this._open = false;
    this._suggestions = [];
    this._emitTokens([]);
  }

  private _onBlur() {
    // Delay allows mousedown on a suggestion to fire before blur closes dropdown
    setTimeout(() => { this._open = false; this._highlightIndex = -1; }, 150);
  }

  private _focusInput() {
    (this.shadowRoot?.querySelector('.token-input') as HTMLInputElement)?.focus();
  }

  render() {
    return html`
      <div class="search-section">
        <div class="token-field" @click=${this._focusInput}>
          ${this._tokens.map((t, i) => html`
            <span class="token">
              ${tokenLabel(t)}
              <button
                class="token-remove"
                aria-label="Remove ${tokenLabel(t)}"
                @click=${(e: Event) => { e.stopPropagation(); this._removeToken(i); }}
              >&#x2715;</button>
            </span>
          `)}
          <input
            type="text"
            class="token-input"
            placeholder=${this._tokens.length === 0 ? 'Filter\u2026' : ''}
            .value=${this._inputText}
            @input=${this._onInput}
            @focus=${this._onFocus}
            @keydown=${this._onKeydown}
            @blur=${this._onBlur}
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        ${this._open ? html`
          <ul class="suggestions" role="listbox">
            ${this._suggestions.map((s, i) => html`
              <li
                class=${'suggestion' + (i === this._highlightIndex ? ' highlighted' : '')}
                role="option"
                aria-selected=${i === this._highlightIndex}
                @mousedown=${(e: Event) => { e.preventDefault(); this._selectSuggestion(s); }}
              >${s.label}</li>
            `)}
          </ul>
        ` : nothing}
        ${this._tokens.length > 0 ? html`
          <button class="clear-btn" @click=${this._clearAll}>Clear filters</button>
        ` : nothing}
      </div>
    `;
  }
}

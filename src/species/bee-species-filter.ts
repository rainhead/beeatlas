// Phase 81 FILT-01 — county + ecoregion-l3 multi-select + month-range filter.
// D-03: <details><summary> popovers wrapping <ul> of <input type="checkbox">.
// Native <details> handles keyboard/screen-reader. CONTEXT.md D-03 explicitly
// accepts no-JS = non-functional filter; server emits empty host element.
//
// State flow (ARCH-03):
//   - downward: countyOptions, ecoregionOptions, selectedCounties,
//     selectedEcoregions, monthFrom, monthTo (set by <bee-species-page>)
//   - upward: filter-changed CustomEvent with full snapshot
// PAGE-06: this file MUST NOT import bee-species-page.ts.
// ARCH-04: this file MUST NOT import mapbox-gl, wa-sqlite, ../sqlite.ts,
//   ../filter.ts, ../bee-map.ts, ../bee-atlas.ts, ../url-state.ts.

import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-species-filter')
export class BeeSpeciesFilter extends LitElement {
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) selectedCounties: Set<string> = new Set();
  @property({ attribute: false }) selectedEcoregions: Set<string> = new Set();
  @property({ type: Number }) monthFrom = 1;
  @property({ type: Number }) monthTo = 12;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  static styles = css`
    :host { display: block; }
    details { margin-bottom: 0.5rem; }
    summary { cursor: pointer; padding: 0.25rem 0.5rem; }
    details > ul {
      list-style: none;
      padding: 0.25rem 0.5rem;
      margin: 0;
      max-height: 60vh;
      overflow-y: auto;
    }
    details > ul > li { padding: 0.15rem 0; }
    .month-range { display: flex; gap: 0.5rem; align-items: center; }
    .month-range input[type="number"] { width: 4em; }
  `;

  render() {
    return html`
      <details class="filter-county">
        <summary>
          County (${this.selectedCounties.size} selected) ▾
        </summary>
        <ul>
          ${this.countyOptions.map(opt => html`
            <li>
              <label>
                <input
                  type="checkbox"
                  .checked=${this.selectedCounties.has(opt)}
                  @change=${(e: Event) => this._toggleCounty(opt, (e.target as HTMLInputElement).checked)}
                />
                ${opt}
              </label>
            </li>
          `)}
        </ul>
      </details>

      <details class="filter-ecoregion">
        <summary>
          Ecoregion (${this.selectedEcoregions.size} selected) ▾
        </summary>
        <ul>
          ${this.ecoregionOptions.map(opt => html`
            <li>
              <label>
                <input
                  type="checkbox"
                  .checked=${this.selectedEcoregions.has(opt)}
                  @change=${(e: Event) => this._toggleEcoregion(opt, (e.target as HTMLInputElement).checked)}
                />
                ${opt}
              </label>
            </li>
          `)}
        </ul>
      </details>

      <div class="month-range" aria-label="Month range filter">
        <label>
          From
          <input
            type="number"
            min="1"
            max="12"
            .value=${String(this.monthFrom)}
            @change=${(e: Event) => this._setMonth('monthFrom', Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label>
          To
          <input
            type="number"
            min="1"
            max="12"
            .value=${String(this.monthTo)}
            @change=${(e: Event) => this._setMonth('monthTo', Number((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
    `;
  }

  private _toggleCounty(name: string, checked: boolean): void {
    const next = new Set(this.selectedCounties);
    if (checked) next.add(name); else next.delete(name);
    this.selectedCounties = next;
    this._emit();
  }

  private _toggleEcoregion(name: string, checked: boolean): void {
    const next = new Set(this.selectedEcoregions);
    if (checked) next.add(name); else next.delete(name);
    this.selectedEcoregions = next;
    this._emit();
  }

  private _setMonth(field: 'monthFrom' | 'monthTo', value: number): void {
    if (!Number.isFinite(value) || value < 1 || value > 12) return;
    this[field] = value;
    this._emit();
  }

  private _emit(): void {
    this.dispatchEvent(new CustomEvent('filter-changed', {
      bubbles: true,
      composed: true,
      detail: {
        counties: new Set(this.selectedCounties),
        ecoregions: new Set(this.selectedEcoregions),
        monthFrom: this.monthFrom,
        monthTo: this.monthTo,
      },
    }));
  }
}

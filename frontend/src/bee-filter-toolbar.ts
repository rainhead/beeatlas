import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption } from './bee-sidebar.ts';
import './bee-filter-controls.ts';

@customElement('bee-filter-toolbar')
export class BeeFilterToolbar extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;
  @property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';

  static styles = css`
    :host {
      display: flex;
      align-items: flex-start;
      flex-shrink: 0;
      width: 100%;
      padding: 0 8px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      min-height: 48px;
      box-sizing: border-box;
    }
    bee-filter-controls { flex-grow: 1; min-width: 0; }
    .csv-btn {
      flex-shrink: 0;
      align-self: center;
      margin-left: 8px;
      background: transparent;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-body);
      cursor: pointer;
      min-height: 44px;
      white-space: nowrap;
    }
    .csv-btn:hover { background: var(--surface-muted); }
    .csv-btn:active { background: var(--surface-pressed); }
  `;

  private _onCsvClick() {
    this.dispatchEvent(new CustomEvent('csv-download', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div role="toolbar" aria-label="Filter controls" style="display:contents">
        <bee-filter-controls
          .filterState=${this.filterState}
          .taxaOptions=${this.taxaOptions}
          .countyOptions=${this.countyOptions}
          .ecoregionOptions=${this.ecoregionOptions}
          .collectorOptions=${this.collectorOptions}
          .summary=${this.summary}
        ></bee-filter-controls>
        <button class="csv-btn" @click=${this._onCsvClick}>Download CSV</button>
      </div>
    `;
  }
}

import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { isFilterActive } from './filter.ts';
import type { FilterState, CollectorEntry } from './filter.ts';
import type { DataSummary, TaxonOption } from './bee-sidebar.ts';
import './bee-filter-controls.ts';

@customElement('bee-filter-panel')
export class BeeFilterPanel extends LitElement {
  @property({ attribute: false }) filterState!: FilterState;
  @property({ attribute: false }) taxaOptions: TaxonOption[] = [];
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) collectorOptions: CollectorEntry[] = [];
  @property({ attribute: false }) summary: DataSummary | null = null;

  @state() private _open = false;

  static styles = css`
    :host {
      position: absolute;
      top: 0.5em;
      /* bee-atlas sets right offset to clear the Regions button */
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
      min-width: 22rem;
      z-index: 10;
      padding: 0.75rem;
      box-sizing: border-box;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-body, #213547);
      margin: 0.6rem 0 0.3rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .section-header:first-child { margin-top: 0; }
    .section-icon {
      flex-shrink: 0;
      opacity: 0.7;
    }
  `;

  private _togglePanel() {
    this._open = !this._open;
  }

  render() {
    const active = isFilterActive(this.filterState);
    const count = this.summary?.totalSpecimens ?? '…';
    return html`
      <div class="panel-container">
        <button
          class=${'filter-btn' + (active ? ' active' : '')}
          @click=${this._togglePanel}
          aria-label="Filter occurrences"
          aria-expanded=${this._open}
          aria-haspopup="true"
        >
          <!-- magnifying-glass icon -->
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4"/>
            <line x1="9.9" y1="9.9" x2="13.5" y2="13.5"/>
          </svg>
          ${count}
        </button>
        ${this._open ? html`
          <div class="filter-panel" role="dialog" aria-label="Filter panel">
            <div class="section-header">
              <svg class="section-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M1 3a1 1 0 0 1 1-1h8.5l4 5-4 5H2a1 1 0 0 1-1-1V3z"/>
              </svg>
              What
            </div>
            <div class="section-header">
              <svg class="section-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M8 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                <path d="M3 14a5 5 0 0 1 10 0"/>
              </svg>
              Who
            </div>
            <div class="section-header">
              <svg class="section-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path d="M8 1a5 5 0 0 1 5 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 0 1 5-5z"/>
                <circle cx="8" cy="6" r="1.5"/>
              </svg>
              Where
            </div>
            <div class="section-header">
              <svg class="section-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <rect x="2" y="3" width="12" height="11" rx="1"/>
                <path d="M2 7h12M5 1v4M11 1v4"/>
              </svg>
              When
            </div>
            <bee-filter-controls
              .filterState=${this.filterState}
              .taxaOptions=${this.taxaOptions}
              .countyOptions=${this.countyOptions}
              .ecoregionOptions=${this.ecoregionOptions}
              .collectorOptions=${this.collectorOptions}
              .summary=${this.summary}
            ></bee-filter-controls>
          </div>
        ` : nothing}
      </div>
    `;
  }
}

import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
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

  @state() private _menuOpen = false;

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
    .download-wrap {
      position: relative;
      flex-shrink: 0;
      margin-top: 0.75rem;
      margin-left: 8px;
    }
    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: transparent;
      border: 1px solid var(--border-input);
      border-radius: 4px;
      color: var(--text-body);
      cursor: pointer;
      padding: 0;
    }
    .download-btn:hover { background: var(--surface-muted); }
    .download-btn:active { background: var(--surface-pressed); }
    .download-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 4px);
      background: var(--surface, #fff);
      border: 1px solid var(--border-input);
      border-radius: 4px;
      list-style: none;
      margin: 0;
      padding: 0;
      min-width: 10rem;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      z-index: 100;
    }
    .download-menu-item {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      color: var(--text-body);
      cursor: pointer;
    }
    .download-menu-item:hover { background: var(--surface-subtle); }
  `;

  private _toggleMenu() {
    this._menuOpen = !this._menuOpen;
  }

  private _onBtnBlur() {
    setTimeout(() => { this._menuOpen = false; }, 150);
  }

  private _onCsvClick() {
    this._menuOpen = false;
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
        <div class="download-wrap">
          <button
            class="download-btn"
            @click=${this._toggleMenu}
            @blur=${this._onBtnBlur}
            aria-label="Download options"
            aria-haspopup="true"
            aria-expanded=${this._menuOpen}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1a.75.75 0 0 1 .75.75v6.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06L7.25 7.94V1.75A.75.75 0 0 1 8 1zM2.5 13.25a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75z"/>
            </svg>
          </button>
          ${this._menuOpen ? html`
            <ul class="download-menu" role="menu">
              <li
                class="download-menu-item"
                role="menuitem"
                @mousedown=${(e: Event) => e.preventDefault()}
                @click=${this._onCsvClick}
              >Download CSV</li>
            </ul>
          ` : nothing}
        </div>
      </div>
    `;
  }
}

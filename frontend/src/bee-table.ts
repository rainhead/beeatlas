import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SpecimenRow, SampleRow, SpecimenSortBy } from './filter.ts';

interface ColumnDef {
  key: string;
  label: string;
  dataField: string;
  minWidth: string;
  linkFn?: (row: any) => string | null;  // returns URL or null
}

const SPECIMEN_COLUMN_DEFS: ColumnDef[] = [
  { key: 'source', label: 'Source', dataField: 'ecdysis_id', minWidth: '6%',
    linkFn: (row) => row.ecdysis_id != null
      ? `https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}`
      : null },
  { key: 'species', label: 'Species', dataField: 'scientificName', minWidth: '18%' },
  { key: 'collector', label: 'Collector', dataField: 'recordedBy', minWidth: '16%' },
  { key: 'date', label: 'Date', dataField: 'date', minWidth: '12%' },
  { key: 'county', label: 'County', dataField: 'county', minWidth: '14%' },
  { key: 'ecoregion', label: 'Ecoregion', dataField: 'ecoregion_l3', minWidth: '14%' },
  { key: 'fieldNumber', label: 'Field #', dataField: 'fieldNumber', minWidth: '8%' },
  { key: 'modified', label: 'Modified', dataField: 'modified', minWidth: '12%' },
];

const SAMPLE_COLUMN_DEFS: ColumnDef[] = [
  { key: 'source', label: 'Source', dataField: 'observation_id', minWidth: '6%',
    linkFn: (row) => row.observation_id != null
      ? `https://www.inaturalist.org/observations/${row.observation_id}`
      : null },
  { key: 'observer', label: 'Observer', dataField: 'observer', minWidth: '20%' },
  { key: 'date', label: 'Date', dataField: 'date', minWidth: '12%' },
  { key: 'specimenCount', label: 'Specimens', dataField: 'specimen_count', minWidth: '10%' },
  { key: 'sampleId', label: 'Sample ID', dataField: 'sample_id', minWidth: '10%' },
  { key: 'county', label: 'County', dataField: 'county', minWidth: '18%' },
  { key: 'ecoregion', label: 'Ecoregion', dataField: 'ecoregion_l3', minWidth: '24%' },
];

@customElement('bee-table')
export class BeeTable extends LitElement {
  @property({ attribute: false }) rows: SpecimenRow[] | SampleRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) layerMode: 'specimens' | 'samples' = 'specimens';
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) sortBy: SpecimenSortBy = 'date';

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      font-family: system-ui, Avenir, Helvetica, Arial, sans-serif;
    }
    .table-container {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 0.875rem;
    }
    thead {
      position: sticky;
      top: 0;
      z-index: 1;
    }
    th {
      background: var(--surface-subtle, #f5f5f5);
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.2;
      text-align: left;
      padding: 8px 16px;
      border-bottom: 1px solid var(--border, #ddd);
      white-space: nowrap;
    }
    td {
      padding: 8px 16px;
      border-bottom: 1px solid var(--border-subtle, #eee);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
      color: var(--text-body, #213547);
      line-height: 1.4;
    }
    tr:hover td {
      background: var(--surface-hover, #f8f8f8);
    }
    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      border-top: 1px solid var(--border, #ddd);
      background: var(--surface-subtle, #f5f5f5);
      font-size: 0.8125rem;
      flex-shrink: 0;
    }
    .pagination-center {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pagination button {
      background: none;
      border: 1px solid var(--border, #ddd);
      padding: 4px 12px;
      cursor: pointer;
      border-radius: 4px;
      font-size: 0.8125rem;
      min-height: 44px;
    }
    .pagination button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .row-count {
      color: var(--text-hint, #767676);
    }
    .page-info {
      color: var(--text-secondary, #444);
    }
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-hint, #767676);
      gap: 8px;
    }
    .empty-state h3 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
    }
    .empty-state p {
      margin: 0;
      font-size: 0.875rem;
    }
    .loading-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      background: var(--surface-overlay, rgba(255,255,255,0.85));
      z-index: 10;
    }
    td a {
      color: var(--link, #1a73e8);
      text-decoration: none;
    }
    td a:hover {
      text-decoration: underline;
    }
    .sortable {
      cursor: pointer;
      user-select: none;
    }
    .sort-indicator {
      margin-left: 4px;
      font-size: 0.75rem;
    }
  `;

  private _onSortClick(sortBy: SpecimenSortBy) {
    this.dispatchEvent(new CustomEvent('sort-changed', {
      detail: { sortBy },
      bubbles: true,
      composed: true,
    }));
  }

  private _onDownloadCsv() {
    this.dispatchEvent(new CustomEvent('download-csv', {
      bubbles: true,
      composed: true,
    }));
  }

  private _onPrev() {
    this.dispatchEvent(new CustomEvent('page-changed', {
      detail: { page: this.page - 1 },
      bubbles: true,
      composed: true,
    }));
  }

  private _onNext() {
    this.dispatchEvent(new CustomEvent('page-changed', {
      detail: { page: this.page + 1 },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const cols = this.layerMode === 'specimens' ? SPECIMEN_COLUMN_DEFS : SAMPLE_COLUMN_DEFS;
    const noun = this.layerMode === 'specimens' ? 'specimens' : 'samples';
    const start = (this.page - 1) * 100 + 1;
    const end = Math.min(this.page * 100, this.rowCount);
    const totalPages = Math.ceil(this.rowCount / 100);

    const isEmptyState = this.rowCount === 0 && !this.loading;

    return html`
      ${this.loading ? html`<div class="loading-overlay">Loading\u2026</div>` : nothing}
      ${isEmptyState
        ? html`
          <div class="empty-state">
            <h3>No ${noun} match the current filters.</h3>
            <p>Try adjusting the filters in the sidebar.</p>
          </div>
        `
        : html`
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  ${cols.map(col => {
                    const isSortable = this.layerMode === 'specimens' && (col.key === 'date' || col.key === 'modified');
                    const isActive = isSortable && this.sortBy === col.key;
                    if (isSortable) {
                      return html`
                        <th style="width: ${col.minWidth}" class="sortable" @click=${() => this._onSortClick(col.key as SpecimenSortBy)}>
                          ${col.label}${isActive ? html`<span class="sort-indicator">\u25BC</span>` : nothing}
                        </th>`;
                    }
                    return html`<th style="width: ${col.minWidth}">${col.label}</th>`;
                  })}
                </tr>
              </thead>
              <tbody>
                ${(this.rows as any[]).map(row => html`
                  <tr>
                    ${cols.map(col => {
                      const cellText = String((row as any)[col.dataField] ?? '');
                      if (col.linkFn) {
                        const url = col.linkFn(row);
                        if (url) {
                          return html`<td><a href=${url} target="_blank" rel="noopener noreferrer">View</a></td>`;
                        }
                      }
                      return html`<td title=${cellText}>${cellText}</td>`;
                    })}
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        `}
      <div class="pagination">
        <span aria-live="polite" class="row-count">
          ${this.rowCount === 0 ? `No ${noun} match the current filters` : `Showing ${start}\u2013${end} of ${this.rowCount.toLocaleString()} ${noun}`}
        </span>
        <div class="pagination-center">
          <button
            aria-label="Previous page"
            ?disabled=${this.page === 1}
            @click=${this._onPrev}
          >\u2190 Prev</button>
          <span class="page-info">Page ${this.page} of ${totalPages}</span>
          <button
            aria-label="Next page"
            ?disabled=${this.page * 100 >= this.rowCount}
            @click=${this._onNext}
          >Next \u2192</button>
        </div>
        <button
          class="download-csv-btn"
          aria-label="Download CSV"
          @click=${this._onDownloadCsv}
        >Download CSV</button>
      </div>
    `;
  }
}

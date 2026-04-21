import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';

interface ColumnDef {
  key: string;
  label: string;
  dataField: string;
  minWidth: string;
  linkFn?: (row: any) => string | null;  // returns URL or null
  linkLabel?: (row: any) => string;       // link text; defaults to 'View'
  nullLabel?: string;                     // display text when cell value is empty
}

const CAMERA_ICON = html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

const OCCURRENCE_COLUMN_DEFS: ColumnDef[] = [
  { key: 'date',        label: 'Date',       dataField: 'date',                    minWidth: '100px' },
  { key: 'species',     label: 'Species',    dataField: 'scientificName',          minWidth: '180px', nullLabel: 'No Determination' },
  { key: 'collector',   label: 'Collector',  dataField: 'recordedBy',              minWidth: '150px' },
  { key: 'observer',    label: 'Observer',   dataField: 'host_inat_login',         minWidth: '150px' },
  { key: 'county',      label: 'County',     dataField: 'county',                  minWidth: '110px' },
  { key: 'ecoregion',   label: 'Ecoregion',  dataField: 'ecoregion_l3',            minWidth: '130px' },
  { key: 'elevation',   label: 'Elev (m)',   dataField: 'elevation_m',             minWidth: '80px'  },
  { key: 'fieldNumber', label: 'Field #',    dataField: 'fieldNumber',             minWidth: '80px'  },
  { key: 'modified',    label: 'Modified',   dataField: 'modified',                minWidth: '100px' },
  { key: 'photo',       label: 'Photo',      dataField: 'specimen_observation_id', minWidth: '60px',
    linkFn: (row: OccurrenceRow) => row.specimen_observation_id != null
      ? `https://www.inaturalist.org/observations/${row.specimen_observation_id}`
      : null },
];

@customElement('bee-table')
export class BeeTable extends LitElement {
  @property({ attribute: false }) rows: OccurrenceRow[] = [];
  @property({ attribute: false }) rowCount = 0;
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
      width: max-content;
      min-width: 100%;
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
    .sort-indicator--inactive {
      color: #bbb;
    }
    .cell-null {
      color: var(--text-hint, #767676);
      font-style: italic;
    }
    td a.photo-link {
      display: inline-flex;
      align-items: center;
      color: var(--link, #1a73e8);
    }
  `;

  private _onSortClick(sortBy: SpecimenSortBy) {
    this.dispatchEvent(new CustomEvent('sort-changed', {
      detail: { sortBy },
      bubbles: true,
      composed: true,
    }));
  }

  private _onRowClick(row: OccurrenceRow) {
    const lat = row.lat != null ? Number(row.lat) : null;
    const lon = row.lon != null ? Number(row.lon) : null;
    if (lat === null || lon === null) return;
    this.dispatchEvent(new CustomEvent('row-pan', {
      detail: { lat, lon },
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
    const cols = OCCURRENCE_COLUMN_DEFS;
    const noun = 'occurrences';
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
                    const isSortable = col.key === 'date' || col.key === 'modified';
                    const isActive = isSortable && this.sortBy === col.key;
                    if (isSortable) {
                      return html`
                        <th style="min-width: ${col.minWidth}" class="sortable" @click=${() => this._onSortClick(col.key as SpecimenSortBy)}>
                          ${col.label}${isActive
                            ? html`<span class="sort-indicator">\u25BC</span>`
                            : nothing}
                        </th>`;
                    }
                    return html`<th style="min-width: ${col.minWidth}">${col.label}</th>`;
                  })}
                </tr>
              </thead>
              <tbody>
                ${(this.rows as any[]).map(row => html`
                  <tr @click=${() => this._onRowClick(row as OccurrenceRow)} style="cursor: pointer">
                    ${cols.map(col => {
                      const raw = (row as any)[col.dataField];
                      const cellText = String(raw ?? '');
                      if (col.linkFn) {
                        const url = col.linkFn(row);
                        if (url) {
                          if (col.key === 'photo') {
                            return html`<td><a href=${url} class="photo-link" target="_blank" rel="noopener noreferrer" title="View iNat observation" aria-label="View iNat observation">${CAMERA_ICON}</a></td>`;
                          }
                          const label = col.linkLabel ? col.linkLabel(row) : 'View';
                          return html`<td><a href=${url} target="_blank" rel="noopener noreferrer">${label}</a></td>`;
                        }
                        if (col.key === 'photo') {
                          return html`<td></td>`;
                        }
                      }
                      const displayText = (!cellText && col.nullLabel) ? col.nullLabel : cellText;
                      const isNull = !cellText && !!col.nullLabel;
                      return html`<td title=${displayText} class=${isNull ? 'cell-null' : ''}>${displayText}</td>`;
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

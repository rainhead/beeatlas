import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow, SpecimenSortBy } from './filter.ts';

interface ColumnDef {
  key: string;
  label: string;
  dataField: string;
  minWidth: string;
  linkFn?: (row: OccurrenceRow) => string | null;
  linkLabel?: (row: OccurrenceRow) => string;
  nullLabel?: string;
  valueFn?: (row: OccurrenceRow) => string | null;
}

const CAMERA_ICON = html`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

const FILTER_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="6.5" cy="6.5" r="4"/><line x1="9.9" y1="9.9" x2="13.5" y2="13.5"/></svg>`;

const ECDYSIS_LOGO = 'https://ecdysis.org/images/favicon-32x32.png';
const INAT_LOGO = 'https://static.inaturalist.org/sites/1-favicon.png?1573071870';

function collectorDisplay(row: OccurrenceRow): string | null {
  const collector = row.recordedBy;
  const observer = row.host_inat_login;
  if (collector && observer && collector !== observer) return `${collector} (${observer})`;
  return collector ?? observer ?? null;
}

function fieldNumberDisplay(row: OccurrenceRow): string | null {
  if (row.fieldNumber != null) return row.fieldNumber;
  if (row.sample_id != null && row.specimen_count != null && row.specimen_count > 0) {
    if (row.specimen_count === 1) return `${row.sample_id}.1`;
    return `${row.sample_id}.1\u2014${row.sample_id}.${row.specimen_count}`;
  }
  return null;
}

function rowOccId(row: OccurrenceRow): string | null {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  return null;
}

const OCCURRENCE_COLUMN_DEFS: ColumnDef[] = [
  { key: 'date',        label: 'Date',       dataField: 'date',                    minWidth: '100px' },
  { key: 'species',     label: 'Species',    dataField: 'scientificName',          minWidth: '180px', nullLabel: 'No Determination' },
  { key: 'collector',   label: 'Collector',  dataField: 'recordedBy',              minWidth: '160px',
    valueFn: collectorDisplay },
  { key: 'county',      label: 'County',     dataField: 'county',                  minWidth: '110px' },
  { key: 'ecoregion',   label: 'Ecoregion',  dataField: 'ecoregion_l3',            minWidth: '130px' },
  { key: 'elevation',   label: 'Elev (m)',   dataField: 'elevation_m',             minWidth: '80px'  },
  { key: 'fieldNumber', label: 'Field #',    dataField: 'fieldNumber',             minWidth: '90px',
    valueFn: fieldNumberDisplay },
  { key: 'modified',    label: 'Modified',   dataField: 'modified',                minWidth: '100px' },
  { key: 'photo',       label: 'Photo',      dataField: 'specimen_observation_id', minWidth: '60px',
    linkFn: (row: OccurrenceRow) => row.specimen_observation_id != null
      ? `https://www.inaturalist.org/observations/${row.specimen_observation_id}`
      : null },
  { key: 'links',       label: 'Links',      dataField: 'ecdysis_id',              minWidth: '70px' },
];

@customElement('bee-table')
export class BeeTable extends LitElement {
  @property({ attribute: false }) rows: OccurrenceRow[] = [];
  @property({ attribute: false }) rowCount = 0;
  @property({ attribute: false }) page = 1;
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) sortBy: SpecimenSortBy = 'date';
  @property({ attribute: false }) selectedIds: Set<string> | null = null;
  @property({ attribute: false }) filterActive = false;

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
    tr.selected td {
      background: var(--accent-subtle, #e8f5e9);
    }
    tr.selected:hover td {
      background: var(--accent-subtle-hover, #c8e6c9);
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
    .filter-table-btn {
      background: white;
      border: 1px solid rgba(0,0,0,0.25);
      border-radius: 4px;
      padding: 4px 10px;
      cursor: pointer;
      font-size: 0.8125rem;
      min-height: 44px;
      display: flex;
      align-items: center;
      gap: 0.3rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .filter-table-btn:hover {
      background: #f0f0f0;
    }
    .filter-table-btn.active {
      background: var(--accent, #2c7a2c);
      color: white;
      border-color: var(--accent, #2c7a2c);
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
    .links-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .site-logo {
      width: 16px;
      height: 16px;
      display: block;
    }
    .site-logo--dim {
      opacity: 0.2;
    }
    a.site-logo-link {
      display: inline-flex;
      align-items: center;
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

  private _onFilterBtnClick() {
    this.dispatchEvent(new CustomEvent('toggle-filter', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    const cols = OCCURRENCE_COLUMN_DEFS;
    const noun = 'occurrences';
    const totalPages = Math.ceil(this.rowCount / 100);

    const isEmptyState = this.rowCount === 0 && !this.loading;

    // Sort selected rows to top, preserving order within each group
    const sortedRows = this.selectedIds
      ? [...this.rows].sort((a, b) => {
          const aId = rowOccId(a);
          const bId = rowOccId(b);
          const aSelected = (aId && this.selectedIds!.has(aId)) ? 0 : 1;
          const bSelected = (bId && this.selectedIds!.has(bId)) ? 0 : 1;
          return aSelected - bSelected;
        })
      : this.rows;

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
                ${(sortedRows as OccurrenceRow[]).map(row => {
                  const occId = rowOccId(row);
                  const isSelected = !!(occId && this.selectedIds?.has(occId));
                  return html`
                  <tr @click=${() => this._onRowClick(row)} style="cursor: pointer" class=${isSelected ? 'selected' : ''}>
                    ${cols.map(col => {
                      if (col.key === 'links') {
                        const ecdysisUrl = row.ecdysis_id != null
                          ? `https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}`
                          : null;
                        const inatId = row.specimen_observation_id ?? row.host_observation_id;
                        const inatUrl = inatId != null
                          ? `https://www.inaturalist.org/observations/${inatId}`
                          : null;
                        return html`<td><div class="links-cell">
                          ${ecdysisUrl
                            ? html`<a href=${ecdysisUrl} class="site-logo-link" target="_blank" rel="noopener noreferrer" title="View on Ecdysis"><img src=${ECDYSIS_LOGO} class="site-logo" alt="Ecdysis"></a>`
                            : html`<img src=${ECDYSIS_LOGO} class="site-logo site-logo--dim" alt="" aria-hidden="true">`}
                          ${inatUrl
                            ? html`<a href=${inatUrl} class="site-logo-link" target="_blank" rel="noopener noreferrer" title="View on iNaturalist"><img src=${INAT_LOGO} class="site-logo" alt="iNaturalist"></a>`
                            : html`<img src=${INAT_LOGO} class="site-logo site-logo--dim" alt="" aria-hidden="true">`}
                        </div></td>`;
                      }
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
                      const raw = col.valueFn ? col.valueFn(row) : (row as any)[col.dataField];
                      const cellText = raw != null ? String(raw) : '';
                      const displayText = (!cellText && col.nullLabel) ? col.nullLabel : cellText;
                      const isNull = !cellText && !!col.nullLabel;
                      return html`<td title=${displayText} class=${isNull ? 'cell-null' : ''}>${displayText}</td>`;
                    })}
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
        `}
      <div class="pagination">
        <button
          class=${'filter-table-btn' + (this.filterActive ? ' active' : '')}
          aria-label="Filter occurrences"
          @click=${this._onFilterBtnClick}
        >${FILTER_ICON} Filter</button>
        <div class="pagination-center">
          <button
            aria-label="Previous page"
            ?disabled=${this.page === 1}
            @click=${this._onPrev}
          >\u2190 Prev</button>
          <span class="page-info">Page ${this.page} of ${totalPages || 1} &nbsp;(${this.rowCount.toLocaleString()} ${noun})</span>
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

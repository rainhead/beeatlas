import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow } from './filter.ts';

const ROMAN_MONTHS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

function formatRomanDate(dateStr: string): string {
  const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${ROMAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface CollectorGroup {
  date: string;
  recordedBy: string;
  rows: OccurrenceRow[];
}

interface DateGroup {
  date: string;
  collectors: CollectorGroup[];
}

function groupOccurrences(rows: OccurrenceRow[]): DateGroup[] {
  const dateMap = new Map<string, Map<string, CollectorGroup>>();
  for (const row of rows) {
    const date = row.date;
    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const collKey = row.recordedBy ?? '';
    const collMap = dateMap.get(date)!;
    if (!collMap.has(collKey)) {
      collMap.set(collKey, { date, recordedBy: row.recordedBy ?? '', rows: [] });
    }
    collMap.get(collKey)!.rows.push(row);
  }
  return [...dateMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, collMap]) => ({
      date,
      collectors: [...collMap.values()].sort((a, b) => a.recordedBy.localeCompare(b.recordedBy)),
    }));
}

@customElement('bee-occurrence-detail')
export class BeeOccurrenceDetail extends LitElement {
  @property({ attribute: false }) occurrences: OccurrenceRow[] = [];

  static styles = css`
    :host {
      display: block;
    }
    .date-header {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-secondary);
      padding: 0.5rem 1rem 0.25rem;
    }
    .sample {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sample-header {
      margin-bottom: 0.25rem;
      font-size: 0.9rem;
    }
    .species-list {
      margin: 0;
      padding-left: 1.25rem;
      font-size: 0.85rem;
      font-style: italic;
    }
    .species-list li {
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .inat-missing {
      color: var(--text-hint);
      font-style: normal;
    }
    .no-determination {
      font-style: normal;
      color: var(--text-hint);
    }
    .host-conflict {
      font-style: normal;
    }
    .host-label {
      color: var(--text-hint);
      font-size: 0.75rem;
    }
    .quality-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-style: normal;
      padding: 0 0.3em;
      border-radius: 3px;
      vertical-align: middle;
      margin-left: 0.4em;
    }
    .quality-badge.research {
      background: #d4edda;
      color: #155724;
    }
    .quality-badge.needs_id {
      background: #fff3cd;
      color: #856404;
    }
    .quality-badge.casual {
      background: #e2e3e5;
      color: #383d41;
    }
    .panel-content {
      padding: 1rem;
    }
    .sample-dot-detail {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .event-date {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-body);
    }
    .event-observer {
      font-size: 0.8rem;
      color: var(--text-muted);
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .event-count {
      font-size: 0.8rem;
      color: var(--text-hint);
    }
    .event-inat {
      font-size: 0.85rem;
    }
    .hint {
      color: var(--text-hint);
      font-size: 0.85rem;
      font-style: italic;
    }
    .inat-id-label {
      font-size: 0.8rem;
      color: var(--text-body);
      font-weight: 400;
    }
    hr.separator {
      border: none;
      border-top: 1px solid var(--border-subtle);
      margin: 0.5rem 0;
    }
  `;

  private _renderHostInfo(row: OccurrenceRow) {
    const grade = row.inat_quality_grade;
    const badge = grade
      ? html`<span class="quality-badge ${grade}">${grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual'}</span>`
      : '';
    if (row.floralHost && row.inat_host && row.floralHost !== row.inat_host) {
      return html`<span class="host-conflict"><span class="host-label">ecdysis:</span> ${row.floralHost} · <span class="host-label">iNat:</span> ${row.inat_host}${badge}</span>`;
    }
    const host = row.floralHost ?? row.inat_host ?? null;
    return host ? html`${host}${badge}` : html`<span class="inat-missing">no host</span>${badge}`;
  }

  private _renderQualityBadge(grade: string | null) {
    if (!grade) return '';
    const abbr = grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual';
    const fullLabel = grade === 'research' ? 'research grade' : grade === 'needs_id' ? 'needs ID' : 'casual';
    return html`<span class="quality-badge ${grade}" aria-label="${fullLabel}">${abbr}</span>`;
  }

  private _renderCollectorGroup(group: CollectorGroup) {
    return html`
      <div class="sample">
        <div class="sample-header">${group.recordedBy || html`<span class="hint">unknown</span>`}</div>
        <ul class="species-list">
          ${group.rows.map(row => html`
            <li>
              <a href="https://ecdysis.org/collections/individual/index.php?occid=${row.ecdysis_id}" target="_blank" rel="noopener">${row.scientificName ? row.scientificName : html`<span class="no-determination">No determination</span>`}</a>
              ${row.host_observation_id != null ? html`
                · <a href="https://www.inaturalist.org/observations/${row.host_observation_id}" target="_blank" rel="noopener">${this._renderHostInfo(row)}</a>
              ` : html` · <span class="inat-missing">iNat: —</span>`}
              ${row.specimen_observation_id != null ? html`
                · <a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}" target="_blank" rel="noopener" aria-label="View photo on iNaturalist">📷</a>
              ` : ''}
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  private _renderDateGroup(group: DateGroup) {
    return html`
      <div class="date-group">
        <div class="date-header">${formatRomanDate(group.date)}</div>
        ${group.collectors.map(c => this._renderCollectorGroup(c))}
      </div>
    `;
  }

  private _renderSampleOnly(row: OccurrenceRow) {
    const count = row.specimen_count != null && !isNaN(row.specimen_count)
      ? `${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'} collected, identification pending`
      : 'identification pending';
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="event-date">${formatRomanDate(row.date)}</div>
        ${row.host_inat_login != null ? html`<div class="event-observer">${row.host_inat_login}</div>` : ''}
        <div class="event-count">${count}</div>
        ${row.observation_id != null
          ? html`<div class="event-inat">
              <a href="https://www.inaturalist.org/observations/${row.observation_id}" target="_blank" rel="noopener">View on iNaturalist</a>
            </div>`
          : ''}
      </div>
    `;
  }

  private _renderProvisional(row: OccurrenceRow) {
    const taxonEl = row.specimen_inat_taxon_name
      ? html`<em>${row.specimen_inat_taxon_name}</em>`
      : html`<span class="hint">identification pending</span>`;
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="inat-id-label">iNat ID: ${taxonEl} ${this._renderQualityBadge(row.specimen_inat_quality_grade)}</div>
        <div class="event-date">${formatRomanDate(row.date)}</div>
        ${row.host_inat_login != null ? html`<div class="event-observer">${row.host_inat_login}</div>` : ''}
        ${row.specimen_count != null && !isNaN(row.specimen_count)
          ? html`<div class="event-count">${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'} collected</div>`
          : ''}
        <div class="event-inat">
          <a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}"
             target="_blank" rel="noopener"
             aria-label="View WABA observation on iNaturalist">View WABA observation</a>
        </div>
      </div>
    `;
  }

  render() {
    const specimenBacked = this.occurrences.filter(r => r.ecdysis_id != null);
    const sampleOnly = this.occurrences.filter(r => r.ecdysis_id == null);
    const dateGroups = groupOccurrences(specimenBacked);
    return html`
      ${dateGroups.map(group => this._renderDateGroup(group))}
      ${dateGroups.length > 0 && sampleOnly.length > 0
        ? html`<hr class="separator">` : ''}
      ${sampleOnly.map(row =>
        row.is_provisional === true
          ? this._renderProvisional(row)
          : this._renderSampleOnly(row)
      )}
    `;
  }
}

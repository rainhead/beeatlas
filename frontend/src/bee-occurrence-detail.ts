import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { OccurrenceRow } from './filter.ts';

interface SampleGroup {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  elevation_m: number | null;
  rows: OccurrenceRow[];
}

function groupBySpecimenSample(rows: OccurrenceRow[]): SampleGroup[] {
  const map = new Map<string, SampleGroup>();
  for (const row of rows) {
    const key = `${row.year}-${row.month}-${row.recordedBy}-${row.fieldNumber}`;
    if (!map.has(key)) {
      map.set(key, {
        year: row.year!,
        month: row.month!,
        recordedBy: row.recordedBy!,
        fieldNumber: row.fieldNumber!,
        elevation_m: row.elevation_m,
        rows: [],
      });
    }
    map.get(key)!.rows.push(row);
  }
  return [...map.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

@customElement('bee-occurrence-detail')
export class BeeOccurrenceDetail extends LitElement {
  @property({ attribute: false }) occurrences: OccurrenceRow[] = [];

  static styles = css`
    :host {
      display: block;
    }
    .sample {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .sample-header {
      font-weight: 600;
      margin-bottom: 0.25rem;
      font-size: 0.9rem;
    }
    .sample-meta {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
      overflow-wrap: break-word;
      word-break: break-word;
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
    .event-elevation {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    .event-inat {
      font-size: 0.85rem;
    }
    .hint {
      color: var(--text-hint);
      font-size: 0.85rem;
      font-style: italic;
    }
    hr.separator {
      border: none;
      border-top: 1px solid var(--border-subtle);
      margin: 0.5rem 0;
    }
  `;

  private _formatMonth(year: number, month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(year, month - 1)
    );
  }

  private _formatSampleDate(dateStr: string): string {
    // Append T00:00:00 to force local-timezone parsing; bare ISO dates parse as UTC
    // which causes off-by-one display in timezones west of UTC.
    const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(d);
  }

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

  private _renderSpecimenGroup(group: SampleGroup) {
    return html`
      <div class="sample">
        <div class="sample-header">${this._formatMonth(group.year, group.month)} ${group.year}</div>
        <div class="sample-meta">${group.recordedBy} · ${group.fieldNumber}</div>
        ${group.elevation_m != null ? html`<div class="sample-meta">${Math.round(group.elevation_m)} m</div>` : ''}
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

  private _renderSampleOnly(row: OccurrenceRow) {
    const count = row.specimen_count != null && !isNaN(row.specimen_count)
      ? `${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'}`
      : 'not recorded';
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="event-date">${this._formatSampleDate(row.date)}</div>
        ${row.observer != null ? html`<div class="event-observer">${row.observer}</div>` : ''}
        <div class="event-count">${count}</div>
        ${row.elevation_m != null
          ? html`<div class="event-elevation">${Math.round(row.elevation_m)} m</div>`
          : ''}
        ${row.observation_id != null
          ? html`<div class="event-inat">
              <a href="https://www.inaturalist.org/observations/${row.observation_id}" target="_blank" rel="noopener">View on iNaturalist</a>
            </div>`
          : ''}
      </div>
    `;
  }

  render() {
    const specimenBacked = this.occurrences.filter(r => r.ecdysis_id != null);
    const sampleOnly = this.occurrences.filter(r => r.ecdysis_id == null);
    const specimenGroups = groupBySpecimenSample(specimenBacked);
    return html`
      ${specimenGroups.map(group => this._renderSpecimenGroup(group))}
      ${specimenGroups.length > 0 && sampleOnly.length > 0
        ? html`<hr class="separator">` : ''}
      ${sampleOnly.map(row => this._renderSampleOnly(row))}
    `;
  }
}

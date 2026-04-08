import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import './bee-filter-controls.ts';
import './bee-specimen-detail.ts';
import './bee-sample-detail.ts';
import type { FilterState } from './filter.ts';

export interface Specimen {
  name: string;
  occid: string;
  inatObservationId?: number | null;
  floralHost?: string | null;
  inatHost?: string | null;
  inatQualityGrade?: string | null;
}

export interface Sample {
  year: number;
  month: number;
  recordedBy: string;
  fieldNumber: string;
  species: Specimen[];
}

export interface DataSummary {
  totalSpecimens: number;
  speciesCount: number;
  genusCount: number;
  familyCount: number;
  earliestYear: number;
  latestYear: number;
}

export interface TaxonOption {
  label: string;      // display string, e.g. "Bombus (genus)" or "Apis mellifera"
  name: string;       // the actual field value to filter on
  rank: 'family' | 'genus' | 'species';
}

export interface FilteredSummary {
  filteredSpecimens: number;
  filteredSpeciesCount: number;
  filteredGenusCount: number;
  filteredFamilyCount: number;
  total: DataSummary;   // the full unfiltered totals
  isActive: boolean;    // true if any filter is on (controls whether to show "X of Y" or just "Y")
}

export interface SampleEvent {
  observation_id: number;
  observer: string;
  date: string;
  specimen_count: number;
  sample_id: number | null;
  coordinate: number[];  // EPSG:3857
}

// Custom event payload
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  boundaryMode: 'off' | 'counties' | 'ecoregions';
}

@customElement('bee-sidebar')
export class BeeSidebar extends LitElement {
  @property({ attribute: false })
  samples: Sample[] | null = null;

  @property({ attribute: false })
  summary: DataSummary | null = null;

  @property({ attribute: false })
  taxaOptions: TaxonOption[] = [];

  @property({ attribute: false })
  filteredSummary: FilteredSummary | null = null;

  @property({ attribute: false })
  layerMode: 'specimens' | 'samples' = 'specimens';

  @property({ attribute: false })
  viewMode: 'map' | 'table' = 'map';

  @property({ attribute: false })
  recentSampleEvents: SampleEvent[] = [];

  @property({ attribute: false })
  selectedSampleEvent: SampleEvent | null = null;

  @property({ attribute: false })
  filterState: FilterState = {
    taxonName: null, taxonRank: null, yearFrom: null, yearTo: null,
    months: new Set(), selectedCounties: new Set(), selectedEcoregions: new Set(),
  };

  // Region props — driven by BeeAtlas
  @property({ attribute: false }) boundaryMode: 'off' | 'counties' | 'ecoregions' = 'off';
  @property({ attribute: false }) countyOptions: string[] = [];
  @property({ attribute: false }) ecoregionOptions: string[] = [];
  @property({ attribute: false }) sampleDataLoaded = false;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      font-family: system-ui, sans-serif;
    }
    .panel-content {
      padding: 1rem;
    }
    .hint {
      color: var(--text-hint);
      font-size: 0.85rem;
      font-style: italic;
    }
    dt {
      font-weight: 600;
      font-size: 0.85rem;
    }
    dd {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
    }
    .layer-toggle {
      display: flex;
      border-bottom: 1px solid var(--border);
    }
    .toggle-btn {
      flex: 1;
      padding: 0.6rem 1rem;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--text-hint);
      transition: none;
    }
    .toggle-btn:hover {
      background: var(--surface-subtle);
      color: var(--text-secondary);
    }
    .toggle-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
      font-weight: 600;
    }
    .recent-events {
      display: flex;
      flex-direction: column;
    }
    .recent-events-header {
      padding: 0.75rem 1rem 0.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-subtle);
    }
    .event-row {
      padding: 0.6rem 1rem;
      border-bottom: 1px solid var(--border-subtle);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .event-row:hover {
      background: var(--surface-hover);
    }
    .event-date {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--text-body);
    }
    .event-date-heading {
      padding: 0.5rem 1rem 0.25rem;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      background: var(--surface-subtle);
      border-bottom: 1px solid var(--border-subtle);
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
  `;

  private _renderToggle() {
    return html`
      <div class="layer-toggle">
        <button
          class=${this.layerMode === 'specimens' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onToggleLayer('specimens')}
        >Specimens</button>
        <button
          class=${this.layerMode === 'samples' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onToggleLayer('samples')}
        >Samples</button>
      </div>
    `;
  }

  private _onToggleLayer(mode: 'specimens' | 'samples') {
    if (mode === this.layerMode) return;  // no-op if already active
    this.dispatchEvent(new CustomEvent<'specimens' | 'samples'>('layer-changed', {
      bubbles: true,
      composed: true,
      detail: mode,
    }));
  }

  private _renderViewToggle() {
    return html`
      <div class="layer-toggle">
        <button
          class=${this.viewMode === 'map' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onToggleView('map')}
        >Map</button>
        <button
          class=${this.viewMode === 'table' ? 'toggle-btn active' : 'toggle-btn'}
          @click=${() => this._onToggleView('table')}
        >Table</button>
      </div>
    `;
  }

  private _onToggleView(mode: 'map' | 'table') {
    if (mode === this.viewMode) return;
    this.dispatchEvent(new CustomEvent<'map' | 'table'>('view-changed', {
      bubbles: true,
      composed: true,
      detail: mode,
    }));
  }

  private _onSampleEventRowClick(event: SampleEvent) {
    this.dispatchEvent(new CustomEvent<{coordinate: number[]}>('sample-event-click', {
      bubbles: true,
      composed: true,
      detail: { coordinate: event.coordinate },
    }));
  }

  private _formatSampleDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(d);
  }

  private _renderRecentSampleEvents() {
    if (this.recentSampleEvents.length === 0) {
      return html`
        <div class="panel-content">
          <p class="hint">${this.sampleDataLoaded ? 'No collections in the last 14 days.' : 'Loading sample data\u2026'}</p>
        </div>
      `;
    }
    const byDate = new Map<string, SampleEvent[]>();
    for (const event of this.recentSampleEvents) {
      const group = byDate.get(event.date) ?? [];
      group.push(event);
      byDate.set(event.date, group);
    }
    return html`
      <div class="recent-events">
        <div class="recent-events-header">Recent collections (last 14 days)</div>
        ${[...byDate.entries()].map(([date, events]) => html`
          <div class="event-date-heading">${this._formatSampleDate(date)}</div>
          ${events.map(event => html`
            <div class="event-row" @click=${() => this._onSampleEventRowClick(event)}>
              <div class="event-observer">
                ${event.observer}${event.sample_id != null ? html` · <a href="https://www.inaturalist.org/observations/${event.observation_id}" target="_blank" rel="noopener" @click=${(e: Event) => e.stopPropagation()}>sample ${event.sample_id}</a>` : ''}
              </div>
              <div class="event-count">${event.specimen_count != null && !isNaN(event.specimen_count)
                ? `${event.specimen_count} specimen${event.specimen_count === 1 ? '' : 's'}`
                : 'specimen count not recorded'
              }</div>
            </div>
          `)}
        `)}
      </div>
    `;
  }

  private _renderSummary() {
    const { summary, filteredSummary } = this;
    if (!summary) {
      return html`
        <div class="panel-content">
          <h2>Washington Bee Atlas</h2>
          <p class="hint">Loading data...</p>
        </div>
      `;
    }
    if (filteredSummary && filteredSummary.isActive) {
      const t = filteredSummary.total;
      return html`
        <div class="panel-content">
          <h2>Washington Bee Atlas</h2>
          <dl>
            <dt>Specimens</dt><dd>${filteredSummary.filteredSpecimens.toLocaleString()} of ${t.totalSpecimens.toLocaleString()}</dd>
            <dt>Species</dt><dd>${filteredSummary.filteredSpeciesCount} of ${t.speciesCount}</dd>
            <dt>Genera</dt><dd>${filteredSummary.filteredGenusCount} of ${t.genusCount}</dd>
            <dt>Families</dt><dd>${filteredSummary.filteredFamilyCount} of ${t.familyCount}</dd>
            <dt>Years</dt><dd>${t.earliestYear}–${t.latestYear}</dd>
          </dl>
          ${filteredSummary.filteredSpecimens === 0
            ? html`<p class="hint">No specimens match the current filters.</p>`
            : html`<p class="hint">Click a specimen point or cluster to see sample details.</p>`
          }
        </div>
      `;
    }
    return html`
      <div class="panel-content">
        <h2>Washington Bee Atlas</h2>
        <dl>
          <dt>Specimens</dt><dd>${summary.totalSpecimens.toLocaleString()}</dd>
          <dt>Species</dt><dd>${summary.speciesCount}</dd>
          <dt>Genera</dt><dd>${summary.genusCount}</dd>
          <dt>Families</dt><dd>${summary.familyCount}</dd>
          <dt>Years</dt><dd>${summary.earliestYear}–${summary.latestYear}</dd>
        </dl>
        <p class="hint">Click a specimen point or cluster to see sample details.</p>
      </div>
    `;
  }

  render() {
    return html`
      ${this._renderToggle()}
      ${this._renderViewToggle()}
      <bee-filter-controls
        .filterState=${this.filterState}
        .taxaOptions=${this.taxaOptions}
        .countyOptions=${this.countyOptions}
        .ecoregionOptions=${this.ecoregionOptions}
        .boundaryMode=${this.boundaryMode}
        .summary=${this.summary}
      ></bee-filter-controls>
      ${this.samples !== null
        ? html`<bee-specimen-detail .samples=${this.samples}></bee-specimen-detail>`
        : this.layerMode === 'samples' && this.selectedSampleEvent !== null
          ? html`<bee-sample-detail .sampleEvent=${this.selectedSampleEvent}></bee-sample-detail>`
          : this.layerMode === 'samples'
            ? this._renderRecentSampleEvents()
            : this._renderSummary()}
    `;
  }
}

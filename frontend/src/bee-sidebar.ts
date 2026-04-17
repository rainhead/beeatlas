import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { CollectorEntry, OccurrenceRow } from './filter.ts';
import './bee-occurrence-detail.ts';

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

// Custom event payload
export interface FilterChangedEvent {
  taxonName: string | null;
  taxonRank: 'family' | 'genus' | 'species' | null;
  yearFrom: number | null;
  yearTo: number | null;
  months: Set<number>;
  selectedCounties: Set<string>;
  selectedEcoregions: Set<string>;
  selectedCollectors: CollectorEntry[];
  elevMin: number | null;
  elevMax: number | null;
}

@customElement('bee-sidebar')
export class BeeSidebar extends LitElement {
  @property({ attribute: false })
  occurrences: OccurrenceRow[] | null = null;

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
    .sidebar-header {
      display: flex;
      justify-content: flex-end;
      padding: 0.5rem;
      border-bottom: 1px solid var(--border-subtle);
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      padding: 0.25rem 0.5rem;
      color: var(--text-secondary);
      border-radius: 4px;
    }
    .close-btn:hover {
      background: var(--surface-hover);
      color: var(--text-body);
    }
  `;

  private _onCloseClick() {
    this.dispatchEvent(new CustomEvent('close', {
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    return html`
      <div class="sidebar-header">
        <button class="close-btn" @click=${this._onCloseClick} aria-label="Close detail panel">&times;</button>
      </div>
      ${this.occurrences !== null
        ? html`<bee-occurrence-detail .occurrences=${this.occurrences}></bee-occurrence-detail>`
        : html`<div class="panel-content"><p class="hint">Click a point on the map to see details.</p></div>`
      }
    `;
  }
}

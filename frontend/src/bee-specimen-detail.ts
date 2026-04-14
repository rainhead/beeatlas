import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { Sample } from './bee-sidebar.ts';

@customElement('bee-specimen-detail')
export class BeeSpecimenDetail extends LitElement {
  @property({ attribute: false }) samples: Sample[] = [];

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
  `;

  private _formatMonth(year: number, month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(year, month - 1)
    );
  }

  private _renderHostInfo(s: import('./bee-sidebar.ts').Specimen) {
    const grade = s.inatQualityGrade;
    const badge = grade
      ? html`<span class="quality-badge ${grade}">${grade === 'research' ? 'RG' : grade === 'needs_id' ? 'NID' : 'casual'}</span>`
      : '';
    if (s.floralHost && s.inatHost && s.floralHost !== s.inatHost) {
      return html`<span class="host-conflict"><span class="host-label">ecdysis:</span> ${s.floralHost} · <span class="host-label">iNat:</span> ${s.inatHost}${badge}</span>`;
    }
    const host = s.floralHost ?? s.inatHost ?? null;
    return host ? html`${host}${badge}` : html`<span class="inat-missing">no host</span>${badge}`;
  }

  private _onClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      ${this.samples.map(sample => html`
        <div class="sample">
          <div class="sample-header">${this._formatMonth(sample.year, sample.month)} ${sample.year}</div>
          <div class="sample-meta">${sample.recordedBy} · ${sample.fieldNumber}</div>
          <ul class="species-list">
            ${sample.species.map(s => html`
              <li>
                <a href="https://ecdysis.org/collections/individual/index.php?occid=${s.occid}" target="_blank" rel="noopener">${s.name ? s.name : html`<span class="no-determination">No determination</span>`}</a>
                ${s.hostObservationId != null ? html`
                  · <a href="https://www.inaturalist.org/observations/${s.hostObservationId}" target="_blank" rel="noopener">${this._renderHostInfo(s)}</a>
                ` : html` · <span class="inat-missing">iNat: —</span>`}
                ${s.specimenObservationId != null ? html`
                  · <a href="https://www.inaturalist.org/observations/${s.specimenObservationId}" target="_blank" rel="noopener">📷</a>
                ` : ''}
              </li>
            `)}
          </ul>
        </div>
      `)}
    `;
  }
}

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
    .back-btn {
      margin: 0.75rem;
      padding: 0.4rem 0.75rem;
      cursor: pointer;
      border: 1px solid var(--border-input);
      background: transparent;
      border-radius: 4px;
      font-size: 0.9rem;
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
  `;

  private _formatMonth(year: number, month: number): string {
    return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(
      new Date(year, month - 1)
    );
  }

  private _onClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    return html`
      <button class="back-btn" @click=${this._onClose}>&#8592; Back</button>
      ${this.samples.map(sample => html`
        <div class="sample">
          <div class="sample-header">${this._formatMonth(sample.year, sample.month)} ${sample.year}</div>
          <div class="sample-meta">${sample.recordedBy} · ${sample.fieldNumber}</div>
          <ul class="species-list">
            ${sample.species.map(s => html`
              <li>
                <a href="https://ecdysis.org/collections/individual/index.php?occid=${s.occid}" target="_blank" rel="noopener">${s.name}</a>
                ${s.inatObservationId != null
                  ? html` · <a href="https://www.inaturalist.org/observations/${s.inatObservationId}" target="_blank" rel="noopener">${s.floralHost ?? 'no host'}</a>`
                  : html` · <span class="inat-missing">iNat: —</span>`
                }
              </li>
            `)}
          </ul>
        </div>
      `)}
    `;
  }
}

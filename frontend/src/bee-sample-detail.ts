import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SampleEvent } from './bee-sidebar.ts';

@customElement('bee-sample-detail')
export class BeeSampleDetail extends LitElement {
  @property({ attribute: false }) sampleEvent!: SampleEvent;

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
    .panel-content {
      padding: 1rem;
    }
    .sample-dot-detail {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .sample-dot-detail-header {
      margin-bottom: 0.25rem;
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
    dt {
      font-weight: 600;
      font-size: 0.85rem;
    }
    dd {
      margin: 0 0 0.5rem 0;
      font-size: 1rem;
    }
  `;

  private _formatSampleDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(d);
  }

  private _onClose() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  render() {
    const event = this.sampleEvent;
    const count = event.specimen_count != null && !isNaN(event.specimen_count)
      ? `${event.specimen_count} specimen${event.specimen_count === 1 ? '' : 's'}`
      : 'not recorded';
    return html`
      <div class="panel-content sample-dot-detail">
        <div class="sample-dot-detail-header">
          <button class="back-btn" @click=${this._onClose}>&#8592; Back</button>
        </div>
        <div class="event-date">${this._formatSampleDate(event.date)}</div>
        <div class="event-observer">${event.observer}</div>
        <div class="event-count">${count}</div>
        <div class="event-inat">
          <a href="https://www.inaturalist.org/observations/${event.observation_id}" target="_blank" rel="noopener">View on iNaturalist</a>
        </div>
      </div>
    `;
  }
}

import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('bee-header')
export class BeeHeader extends LitElement {
  @property({ attribute: false }) offline = false;
  @property({ attribute: false }) cacheState: { ready: boolean; cached: string[]; missing: string[] } | null = null;
  @property({ attribute: false }) primeProgress: { received: number; total: number; assetInFlight: string | null } | null = null;
  @property({ attribute: false }) freshnessLabel: string | null = null;
  @property({ attribute: false }) storageEstimate: { usageMB: string; quotaMB: string | null } | null = null;
  @property({ attribute: false }) updateAvailable: boolean = false;

  @state() private _popoverOpen = false;

  static styles = css`
    :host {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      background-color: var(--header-bg);
      color: white;
    }

    .left-group {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .title-group {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    h1 {
      font-size: 1.2rem;
      margin: 1rem 0 0 1rem;
      font-weight: 400;
    }

    .freshness-caption {
      font-size: 0.75rem;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.65);
      margin-left: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .right-group {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-right: 0.5rem;
      position: relative;
    }

    .icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: white;
      text-decoration: none;
      opacity: 0.6;
      padding: 10px;
      box-sizing: border-box;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 2px solid transparent;
    }

    .icon-btn:hover {
      opacity: 0.9;
    }

    .icon-btn.active {
      opacity: 1.0;
      border-bottom-color: var(--accent);
    }

    .github-link {
      color: white;
      display: flex;
      align-items: center;
      padding: 0 0.5rem;
      opacity: 0.8;
      text-decoration: none;
    }

    .github-link:hover {
      opacity: 1;
    }

    .offline-pill, .ready-pill {
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 999px;
      padding: 0.2rem 0.6rem;
      color: white;
    }

    .ready-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 44px;
      min-width: 9em;
      position: relative;
      cursor: pointer;
      border-style: solid;
      transition: opacity 200ms ease-out;
      background: transparent;
      font-family: inherit;
    }

    .ready-pill:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .ready-pill__progress-fill {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      background: rgba(255, 255, 255, 0.45);
      transition: width 200ms ease-out;
      border-radius: 0 0 999px 999px;
    }

    .cache-popover {
      position: absolute;
      top: calc(100% + 4px);
      right: 0.5rem;
      min-width: 240px;
      max-width: 320px;
      padding: 16px;
      background: #ffffff;
      border: 1px solid var(--border, #ddd);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--text-body, #213547);
    }

    .cache-popover__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.4;
    }

    .cache-popover__dismiss {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--text-body, #213547);
      opacity: 0.6;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      padding: 0;
    }

    .cache-popover__dismiss:hover { opacity: 0.9; }

    .cache-popover__dismiss:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    .cache-popover__row {
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .cache-popover__row--meta {
      font-size: 0.75rem;
      color: var(--text-hint, #767676);
      line-height: 1.4;
    }

    .cache-popover__update-btn {
      background: transparent;
      border: 1px solid var(--accent);
      border-radius: 4px;
      color: var(--accent);
      cursor: pointer;
      font-size: 0.875rem;
      padding: 6px 12px;
      text-align: left;
      width: 100%;
    }

    .cache-popover__update-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .cache-popover,
      .ready-pill__progress-fill,
      .ready-pill {
        transition: none;
        animation: none;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('click', this._onDocumentClick);
    document.addEventListener('keydown', this._onDocumentKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('click', this._onDocumentClick);
    document.removeEventListener('keydown', this._onDocumentKeydown);
  }

  private _togglePopover = (e: Event) => {
    e.stopPropagation();
    this._popoverOpen = !this._popoverOpen;
    this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
      detail: { open: this._popoverOpen },
      composed: true,
      bubbles: true,
    }));
  };

  private _onPopoverDismiss = (e: Event) => {
    e.stopPropagation();
    this._popoverOpen = false;
    this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
      detail: { open: false },
      composed: true,
      bubbles: true,
    }));
  };

  private _onDocumentClick = (e: Event) => {
    if (!this._popoverOpen) return;
    const path = e.composedPath();
    const popover = this.shadowRoot?.querySelector('.cache-popover');
    const pill = this.shadowRoot?.querySelector('.ready-pill');
    if (popover && !path.includes(popover) && !path.includes(pill as Element)) {
      this._popoverOpen = false;
      this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
        detail: { open: false },
        composed: true,
        bubbles: true,
      }));
    }
  };

  private _onDocumentKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this._popoverOpen) {
      this._popoverOpen = false;
      this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
        detail: { open: false },
        composed: true,
        bubbles: true,
      }));
    }
  };

  private _onUpdateActed = () => {
    this.dispatchEvent(new CustomEvent('cache-update-acted', {
      composed: true,
      bubbles: true,
    }));
  };

  private _renderReadyPillContent(): TemplateResult {
    const cs = this.cacheState;
    if (!cs) return html``;

    if (cs.ready) {
      return html`<span>✓ Offline-ready</span>`;
    }

    if (this.offline) {
      return html`<span>Finish on WiFi</span>`;
    }

    const pp = this.primeProgress;
    if (pp && pp.total > 0) {
      const pct = Math.max(0, Math.min(99, Math.floor(pp.received / pp.total * 100)));
      return html`
        <span>Caching… ${pct}%</span>
        <span class="ready-pill__progress-fill" style="width: ${pct}%"></span>
      `;
    }

    return html`<span>Caching…</span>`;
  }

  private _renderPopover(): TemplateResult {
    const cs = this.cacheState;

    // Row 1: status mirroring pill state in larger form
    let statusContent: TemplateResult;
    if (!cs) {
      statusContent = html``;
    } else if (cs.ready) {
      statusContent = html`<span style="color: var(--accent)">✓</span> Offline-ready`;
    } else if (this.offline) {
      statusContent = html`Finish on WiFi to complete cache`;
    } else {
      const pp = this.primeProgress;
      if (pp && pp.total > 0) {
        const receivedMB = (pp.received / 1_048_576).toFixed(1);
        const totalMB = (pp.total / 1_048_576).toFixed(1);
        statusContent = html`Caching ${receivedMB} MB of ${totalMB} MB`;
      } else {
        statusContent = html`Caching…`;
      }
    }

    return html`
      <div class="cache-popover" role="dialog" aria-modal="false" aria-label="Offline cache details">
        <div class="cache-popover__header">
          <span>Offline cache</span>
          <button
            class="cache-popover__dismiss"
            @click=${this._onPopoverDismiss}
            aria-label="Close"
          >✕</button>
        </div>
        <div class="cache-popover__row">${statusContent}</div>
        ${this.freshnessLabel ? html`
          <div class="cache-popover__row">${this.freshnessLabel}</div>
        ` : ''}
        ${this.storageEstimate ? html`
          <div class="cache-popover__row">
            ${this.storageEstimate.usageMB} MB stored on this device
            ${this.storageEstimate.quotaMB ? html`
              <div class="cache-popover__row--meta">of ${this.storageEstimate.quotaMB} MB available</div>
            ` : ''}
          </div>
        ` : ''}
        ${this.updateAvailable ? html`
          <button class="cache-popover__update-btn" @click=${this._onUpdateActed}>
            App update available — tap to reload
          </button>
        ` : ''}
      </div>
    `;
  }

  render() {
    return html`
      <div class="left-group">
        <div class="title-group">
          <h1>BeeAtlas</h1>
          ${this.freshnessLabel ? html`<span class="freshness-caption">${this.freshnessLabel}</span>` : ''}
        </div>
        <a href="/" class="icon-btn ${(window.location?.pathname ?? '') === '/' || (window.location?.pathname ?? '') === '/index.html' ? 'active' : ''}" aria-label="Map">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"/>
          </svg>
        </a>
        <a href="/species/index.html" class="icon-btn ${(window.location?.pathname ?? '').startsWith('/species') ? 'active' : ''}" aria-label="Species index">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <g transform="translate(0, 2.25)">
              <rect x="8.5" y="2" width="7" height="4.5" rx="0.75"/>
              <path stroke-linecap="round" d="M12 6.5v3M6.5 9.5H17.5M6.5 9.5v3.5M17.5 9.5v3.5"/>
              <rect x="3" y="13" width="7" height="4.5" rx="0.75"/>
              <rect x="14" y="13" width="7" height="4.5" rx="0.75"/>
            </g>
          </svg>
        </a>
        <a href="/places.html" class="icon-btn ${(window.location?.pathname ?? '').startsWith('/places') ? 'active' : ''}" aria-label="Places">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>
          </svg>
        </a>
      </div>
      <div class="right-group">
        ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
        ${this.cacheState ? html`
          <button
            class="ready-pill"
            @click=${this._togglePopover}
            aria-haspopup="dialog"
            aria-expanded=${String(this._popoverOpen)}
          >${this._renderReadyPillContent()}</button>
        ` : ''}
        ${this._popoverOpen ? this._renderPopover() : ''}
        <a href="https://github.com/rainhead/beeatlas" target="_blank" rel="noopener" aria-label="GitHub repository" class="github-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    `;
  }
}

import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-header')
export class BeeHeader extends LitElement {
  @property({ attribute: false })
  viewMode: 'map' | 'table' = 'map';

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
      gap: 0;
    }

    h1 {
      font-size: 1.2rem;
      margin: 1rem 0.5rem;
      font-weight: 400;
    }

    .inline-tabs {
      display: flex;
      align-items: stretch;
    }

    .tab-btn {
      padding: 0.6rem 1rem;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
    }

    .tab-btn:hover {
      color: white;
      background: rgba(255, 255, 255, 0.08);
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-btn[disabled] {
      opacity: 0.4;
      pointer-events: none;
      cursor: default;
    }

    .right-group {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-right: 0.5rem;
    }

    .icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: white;
      opacity: 0.6;
      padding: 10px;
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

    .hamburger-menu {
      display: none;
      position: relative;
    }

    .hamburger-menu summary {
      list-style: none;
      cursor: pointer;
      color: white;
      font-size: 1.5rem;
      padding: 0.5rem;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hamburger-menu summary::-webkit-details-marker {
      display: none;
    }

    .hamburger-items {
      position: absolute;
      top: 100%;
      left: 0;
      min-width: 10rem;
      background: var(--header-bg);
      z-index: 100;
      display: flex;
      flex-direction: column;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 2px 4px 8px rgba(0, 0, 0, 0.4);
    }

    .hamburger-items .tab-btn {
      text-align: left;
      padding: 0.8rem 1rem;
    }

    @media (max-width: 640px) {
      .inline-tabs {
        display: none;
      }
      .hamburger-menu {
        display: block;
        order: -1;
      }
    }
  `;

  private _onViewClick(mode: 'map' | 'table') {
    if (mode === this.viewMode) return;
    this.dispatchEvent(new CustomEvent('view-changed', {
      bubbles: true,
      composed: true,
      detail: mode,
    }));
  }

  render() {
    return html`
      <div class="left-group">
        <h1>BeeAtlas</h1>
      </div>
      <div class="right-group">
        <button
          class="icon-btn ${this.viewMode === 'map' ? 'active' : ''}"
          aria-label="Map view"
          @click=${() => this._onViewClick('map')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"/>
          </svg>
        </button>
        <button
          class="icon-btn ${this.viewMode === 'table' ? 'active' : ''}"
          aria-label="Table view"
          @click=${() => this._onViewClick('table')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-12.75M3.375 5.625c0-.621.504-1.125 1.125-1.125h16.5c.621 0 1.125.504 1.125 1.125v12.75c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m9.75 0h-9.75m9.75 0V5.625m0 12.75V5.625m0 0H10.875M3.375 5.625h7.5m0 0v12.75m0-12.75h9.75"/>
          </svg>
        </button>
        <a href="https://github.com/rainhead/beeatlas" target="_blank" rel="noopener" aria-label="GitHub repository" class="github-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    `;
  }
}

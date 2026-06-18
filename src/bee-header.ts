import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-header')
export class BeeHeader extends LitElement {
  @property({ attribute: false }) offline = false;

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

    h1 {
      font-size: 1.2rem;
      margin: 1rem 0 1rem 1rem;
      font-weight: 400;
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

    .offline-pill {
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 999px;
      padding: 0.2rem 0.6rem;
      color: white;
    }
  `;

  render() {
    return html`
      <div class="left-group">
        <h1>BeeAtlas</h1>
        <a href="/" class="icon-btn ${window.location.pathname === '/' || window.location.pathname === '/index.html' ? 'active' : ''}" aria-label="Map">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"/>
          </svg>
        </a>
        <a href="/species/index.html" class="icon-btn ${window.location.pathname.startsWith('/species') ? 'active' : ''}" aria-label="Species index">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <g transform="translate(0, 2.25)">
              <rect x="8.5" y="2" width="7" height="4.5" rx="0.75"/>
              <path stroke-linecap="round" d="M12 6.5v3M6.5 9.5H17.5M6.5 9.5v3.5M17.5 9.5v3.5"/>
              <rect x="3" y="13" width="7" height="4.5" rx="0.75"/>
              <rect x="14" y="13" width="7" height="4.5" rx="0.75"/>
            </g>
          </svg>
        </a>
        <a href="/places.html" class="icon-btn ${window.location.pathname.startsWith('/places') ? 'active' : ''}" aria-label="Places">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>
          </svg>
        </a>
      </div>
      <div class="right-group">
        ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
        <a href="https://github.com/rainhead/beeatlas" target="_blank" rel="noopener" aria-label="GitHub repository" class="github-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    `;
  }
}

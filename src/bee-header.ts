import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AuthState } from './auth-client.ts';

// Build identifier injected by Vite `define` (eleventy.config.js). The `typeof`
// guard keeps this safe under Vitest, where the define is absent.
const BUILD_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

@customElement('bee-header')
export class BeeHeader extends LitElement {
  @property({ attribute: false }) offline = false;
  @property({ attribute: false }) cacheState: { ready: boolean; cached: string[]; missing: string[] } | null = null;
  @property({ attribute: false }) primeProgress: { received: number; total: number; assetInFlight: string | null } | null = null;
  @property({ attribute: false }) freshnessLabel: string | null = null;
  @property({ attribute: false }) storageEstimate: { usageMB: string; quotaMB: string | null } | null = null;
  @property({ attribute: false }) updateAvailable: boolean = false;
  // D-09/D-10: true when Android beforeinstallprompt available and not yet installed.
  @property({ attribute: false }) installable = false;
  // D-11/D-12: true on iOS Safari (not standalone). Triggers A2HS popover instead of prompt().
  @property({ attribute: false }) iosInstructable = false;
  // D-10 (178-07): server-derived identity, fetched by the mounting controller
  // (entry or app root) — bee-header stays a pure presenter, no fetch here.
  @property({ attribute: false }) authState: AuthState | null = null;

  // Single account/status menu (beeatlas-j96): one popover behind the account
  // button carrying auth, offline-cache status, freshness, source link and build.
  // Replaces the separate cache and account popovers.
  @state() private _menuOpen = false;
  // Transient iOS A2HS popover open/close — local to presenter, not app state.
  @state() private _iosPopoverOpen = false;
  // Set if the iNat avatar image fails to load — falls back to the person glyph.
  @state() private _avatarError = false;

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
      margin: 0 0 0 1rem;
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

    .offline-pill {
      font-size: 0.75rem;
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 999px;
      padding: 0.2rem 0.6rem;
      color: white;
    }

    /* Editor-role chip. Lives inside the white menu surface (its only render
       site since beeatlas-j96) — NOT on the dark header, so it takes body/accent
       colours rather than the white-alpha ones it carried when it sat inline in
       the header, which rendered as invisible bare text on white. */
    .whoami-badge {
      flex: none;
      font-size: 0.7rem;
      font-weight: 400;
      line-height: 1.4;
      border-radius: 999px;
      padding: 0.1rem 0.5rem;
      border: 1px solid var(--border, #ddd);
      color: var(--text-hint, #767676);
    }

    .whoami-badge--author {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      border-color: color-mix(in srgb, var(--accent) 35%, transparent);
      color: var(--accent);
    }

    /* Install button (D-09/D-11): reuses .icon-btn chrome. Focus ring only — no fill accent. */
    .install-btn:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
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

    /* ── Account/status menu rows ───────────────────────────────────────────
       Row treatments follow docs/product/research/menu-patterns-mixed-content.md
       §8-10. The load-bearing rules, since they are easy to erode by accident:

         · ONE visual treatment per row type. A link row is styled IDENTICALLY
           to an action row (Primer: LinkItem == Item) — link-vs-action is not a
           distinction worth drawing visually.
         · Interactive rows get a 44px min-height and a hover/press background.
           Status rows get NEITHER: the absent touch box and the absent hover are
           the signal that a status line is not something you can press. Do not
           "tidy" them into matching heights.
         · Actions are plain rows, never outlined buttons (no surveyed system
           renders an in-menu action as a bordered button; M3 menu items are
           container-color:transparent with no border token).
         · Exactly ONE divider, and it separates INTERACTIVE from PASSIVE — not
           topic from topic (Primer states this explicitly).
         · Caps: 3 type sizes, 2 text colours, 1 divider, 1 border (the surface's).

       Values here are the §9 proposed tokens inlined; extracting them into real
       custom properties is beeatlas-06g. */

    /* The menu overrides the shared shell's padding: rows run full-bleed and
       carry their own inline padding, so the surface contributes block padding
       only. The A2HS popover keeps the original .cache-popover padding. */
    .account-popover {
      padding: 8px 0;
      gap: 0;
    }

    /* Non-interactive header block — the account identity. Not a row: no hover,
       no min-height, no tab stop. */
    .menu-identity {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px 10px;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-body, #213547);
    }

    /* Interactive row — actions and links alike. */
    .menu-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      box-sizing: border-box;
      min-height: 44px;
      padding: 10px 16px;
      background: transparent;
      border: none;
      border-radius: 4px;
      color: var(--text-body, #213547);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.875rem;
      line-height: 1.5;
      text-align: left;
      text-decoration: none;
    }

    .menu-row:hover { background: rgba(0, 0, 0, 0.05); }
    .menu-row:active { background: rgba(0, 0, 0, 0.09); }

    .menu-row:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }

    /* The one emphasized row (update available). Emphasis is a tinted
       background, never an outline. */
    .menu-row--emphasis {
      background: color-mix(in srgb, var(--accent) 10%, transparent);
      color: var(--accent);
    }

    .menu-row--emphasis:hover {
      background: color-mix(in srgb, var(--accent) 16%, transparent);
    }

    .menu-row__icon {
      flex: none;
      width: 16px;
      height: 16px;
    }

    /* The single divider: interactive zone above, passive zone below. */
    .menu-divider {
      height: 1px;
      margin: 8px 0;
      border: none;
      background: var(--border, #ddd);
    }

    /* Passive status — deliberately no min-height, no hover, no focus ring. */
    .menu-status {
      padding: 2px 16px;
      font-size: 0.875rem;
      line-height: 1.4;
      color: var(--text-hint, #767676);
    }

    .menu-meta {
      padding: 2px 16px;
      font-size: 0.75rem;
      line-height: 1.4;
      color: var(--text-hint, #767676);
    }

    /* A description belonging to the status line above it, not a peer row. */
    .menu-status .menu-meta { padding: 0; }

    @media (prefers-reduced-motion: reduce) {
      .cache-popover {
        transition: none;
        animation: none;
      }
    }

    /* Account/menu button: full opacity (identity should read clearly, unlike the
       dimmed nav icons). Shown at all sizes and in both auth states — it is the
       only entry point to the account/status menu (beeatlas-j96). */
    .account-btn { opacity: 1; }
    /* iNaturalist profile image as the account icon (falls back to the person glyph).
       Small ring in the same white as the "BeeAtlas" title. */
    .account-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      object-fit: cover;
      display: block;
      border: 1.5px solid white;
    }

    /* Mobile: keep primary nav + the single account/menu button. Since
       beeatlas-j96 the account/status chrome is one button at every width, so
       the only mobile-specific work left is reclaiming horizontal space and
       dropping the freshness caption (it is a row in the menu). */
    @media (max-width: 640px) {
      /* Safety net: on the very narrowest screens (install + account together)
         let the trailing group wrap to a second line instead of overflowing.
         margin-left:auto keeps it right-aligned inline or wrapped. */
      :host { flex-wrap: wrap; row-gap: 2px; }
      /* Reclaim horizontal space so title + 4 nav icons + the trailing chrome
         fit one row down to ~360px (the icon padding keeps tap targets). */
      .left-group { gap: 0; }
      .right-group { margin-left: auto; padding-right: 0; }
      h1 { font-size: 1rem; margin-left: 0.5rem; }
      .freshness-caption { display: none; }
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

  // The menu still emits `cache-popover-toggle` on every open/close: bee-atlas
  // (bee-atlas.ts) uses detail.open to lazily call navigator.storage.estimate()
  // only when the storage row is about to be shown. Renaming the event would
  // silently break that lazy fetch.
  private _setMenuOpen(open: boolean) {
    this._menuOpen = open;
    this.dispatchEvent(new CustomEvent('cache-popover-toggle', {
      detail: { open },
      composed: true,
      bubbles: true,
    }));
  }

  private _toggleMenu = (e: Event) => {
    e.stopPropagation();
    this._setMenuOpen(!this._menuOpen);
  };

  private _onDocumentClick = (e: Event) => {
    const path = e.composedPath();
    if (this._menuOpen) {
      const menu = this.shadowRoot?.querySelector('.account-popover');
      const menuBtn = this.shadowRoot?.querySelector('.account-btn');
      if (menu && !path.includes(menu) && !path.includes(menuBtn as Element)) {
        this._setMenuOpen(false);
      }
    }
    if (this._iosPopoverOpen) {
      const iosPopover = this.shadowRoot?.querySelector('.ios-a2hs-popover');
      const installBtn = this.shadowRoot?.querySelector('.install-btn');
      if (iosPopover && !path.includes(iosPopover) && !path.includes(installBtn as Element)) {
        this._iosPopoverOpen = false;
      }
    }
  };

  private _onDocumentKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this._menuOpen) {
      this._setMenuOpen(false);
    }
    if (e.key === 'Escape' && this._iosPopoverOpen) {
      this._iosPopoverOpen = false;
    }
  };

  private _onUpdateActed = () => {
    this.dispatchEvent(new CustomEvent('cache-update-acted', {
      composed: true,
      bubbles: true,
    }));
  };

  // D-09: Android Install button click — dispatch install-prompt upward to <bee-atlas>.
  private _onInstallClick = (e: Event) => {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('install-prompt', {
      composed: true,
      bubbles: true,
    }));
  };

  // D-10 (178-07): sign-in click — dispatch upward; the mounting controller
  // (entry/app root) calls auth-client's startSignIn(). No window.location
  // write here (presenter invariant).
  private _onSignInClick = (e: Event) => {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('sign-in', {
      composed: true,
      bubbles: true,
    }));
  };

  // D-10 (178-07): sign-out click — dispatch upward; the mounting controller
  // calls auth-client's signOut() and re-fetches whoami.
  private _onSignOutClick = (e: Event) => {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('sign-out', {
      composed: true,
      bubbles: true,
    }));
  };

  // D-11: iOS A2HS popover toggle.
  private _toggleIosPopover = (e: Event) => {
    e.stopPropagation();
    this._iosPopoverOpen = !this._iosPopoverOpen;
  };

  private _dismissIosPopover = (e: Event) => {
    e.stopPropagation();
    this._iosPopoverOpen = false;
  };

  private _onAvatarError = () => {
    this._avatarError = true;
  };

  // beeatlas-j96: the one account/status menu. Carries auth (sign in, or account
  // + sign out), offline-cache status, freshness, storage, the update button, the
  // source link and the build id. Keeps the .cache-popover shell class so the
  // existing popover styling + outside-click/Escape patterns apply unchanged
  // (PATTERNS.md §bee-header.ts).
  private _renderMenu(): TemplateResult {
    const cs = this.cacheState;
    const auth = this.authState;

    // Cache status line — mirrors what the old cache pill showed, in larger form.
    let statusContent: TemplateResult | null;
    if (!cs) {
      statusContent = null;
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

    const signedIn = Boolean(auth?.authenticated);

    // No ✕ and no header row: the account button stays visible and toggles, so
    // it IS the close control (Radix ships no Close part on DropdownMenu, only
    // on Popover). Escape + outside-click + focus return are what the specs
    // require, and they are implemented. Dropping the ✕ is what lets the
    // identity below be a plain non-interactive header block. See §11.
    return html`
      <div class="cache-popover account-popover" role="dialog" aria-modal="false" aria-label="Account and app status">
        ${this.updateAvailable ? html`
          <button class="menu-row menu-row--emphasis" @click=${this._onUpdateActed}>
            <svg class="menu-row__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 0 1 13.7-5.6L20 8m0 0V4m0 4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16m0 0v4m0-4h4"/>
            </svg>
            App update available — tap to reload
          </button>
        ` : ''}

        ${signedIn ? html`
          <div class="menu-identity">
            ${auth?.login}
            <span class="whoami-badge ${auth?.isAuthor ? 'whoami-badge--author' : 'whoami-badge--guest'}">
              ${auth?.isAuthor ? 'Author' : 'Not an editor'}
            </span>
          </div>
          <button class="menu-row" @click=${this._onSignOutClick}>
            <svg class="menu-row__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/>
            </svg>
            Sign out
          </button>
        ` : html`
          <button class="menu-row" @click=${this._onSignInClick}>
            <svg class="menu-row__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"/>
            </svg>
            Sign in with iNaturalist
          </button>
        `}

        <a
          class="menu-row"
          href="https://github.com/rainhead/beeatlas"
          target="_blank"
          rel="noopener"
        >
          <svg class="menu-row__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
          </svg>
          Source code
        </a>

        <hr class="menu-divider">

        ${statusContent ? html`<div class="menu-status">${statusContent}</div>` : ''}
        ${this.freshnessLabel ? html`<div class="menu-status">${this.freshnessLabel}</div>` : ''}
        ${this.storageEstimate ? html`
          <div class="menu-status">
            ${this.storageEstimate.usageMB} MB stored on this device
            ${this.storageEstimate.quotaMB ? html`
              <div class="menu-meta">of ${this.storageEstimate.quotaMB} MB available</div>
            ` : ''}
          </div>
        ` : ''}
        <div class="menu-meta">Build ${BUILD_VERSION}</div>
      </div>
    `;
  }

  // D-11: iOS A2HS popover — cloned from .cache-popover shell (PATTERNS.md §bee-header.ts).
  // Uses role="dialog" aria-modal="false", 44px ✕ dismiss, Share glyph, 3-step copy.
  private _renderIosPopover(): TemplateResult {
    return html`
      <div class="cache-popover ios-a2hs-popover" role="dialog" aria-modal="false" aria-label="Add to Home Screen instructions">
        <div class="cache-popover__header">
          <span>Add to Home Screen</span>
          <button
            class="cache-popover__dismiss"
            @click=${this._dismissIosPopover}
            aria-label="Close"
          >✕</button>
        </div>
        <div class="cache-popover__row">
          <!-- iOS Share glyph: rounded-rect with upward arrow rising from top edge -->
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" aria-hidden="true" width="16" height="16" style="vertical-align: middle; margin-right: 4px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v10m0-10-3 3m3-3 3 3"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 8H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-3"/>
          </svg>
          1. Tap the Share button
        </div>
        <div class="cache-popover__row">2. Scroll down and tap 'Add to Home Screen'</div>
        <div class="cache-popover__row">3. Tap 'Add' in the top corner</div>
        <div class="cache-popover__row cache-popover__row--meta">Works in Safari on iPhone and iPad.</div>
      </div>
    `;
  }

  // D-10 (178-07) + beeatlas-j96: the single trailing menu button. Renders in
  // BOTH auth states — avatar when signed in, person glyph when signed out —
  // because the menu now also carries cache status, freshness, the update
  // button and the source link, which signed-out visitors still need. Pure
  // render off `authState`; no fetch, no window.location here.
  private _renderAuth(): TemplateResult {
    const auth = this.authState;
    const signedIn = Boolean(auth?.authenticated);
    return html`
      <button
        class="icon-btn account-btn"
        @click=${this._toggleMenu}
        aria-haspopup="dialog"
        aria-expanded=${String(this._menuOpen)}
        aria-label=${signedIn ? `Account: ${auth?.login ?? ''}` : 'Account and app status'}
        title=${signedIn ? 'Account' : 'Account and app status'}
      >
        ${signedIn && auth?.iconUrl && !this._avatarError
          ? html`<img class="account-avatar" src=${auth.iconUrl} alt="" @error=${this._onAvatarError}>`
          : html`
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            </svg>
          `}
      </button>
      ${this._menuOpen ? this._renderMenu() : ''}
    `;
  }

  render() {
    return html`
      <div class="left-group">
        <div class="title-group">
          <h1>BeeAtlas</h1>
          ${this.freshnessLabel ? html`<span class="freshness-caption">${this.freshnessLabel}</span>` : ''}
        </div>
        <a href="/" class="icon-btn ${(window.location?.pathname ?? '') === '/' || (window.location?.pathname ?? '') === '/index.html' ? 'active' : ''}" aria-label="Map" title="Map">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"/>
          </svg>
        </a>
        <a href="/species/index.html" class="icon-btn ${(window.location?.pathname ?? '').startsWith('/species') ? 'active' : ''}" aria-label="Species index" title="Species index">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <g transform="translate(0, 2.25)">
              <rect x="8.5" y="2" width="7" height="4.5" rx="0.75"/>
              <path stroke-linecap="round" d="M12 6.5v3M6.5 9.5H17.5M6.5 9.5v3.5M17.5 9.5v3.5"/>
              <rect x="3" y="13" width="7" height="4.5" rx="0.75"/>
              <rect x="14" y="13" width="7" height="4.5" rx="0.75"/>
            </g>
          </svg>
        </a>
        <a href="/places.html" class="icon-btn ${(window.location?.pathname ?? '').startsWith('/places') ? 'active' : ''}" aria-label="Places" title="Places">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"/>
          </svg>
        </a>
        <a href="/collectors.html" class="icon-btn ${(window.location?.pathname ?? '').startsWith('/collectors') ? 'active' : ''}" aria-label="Collectors" title="Collectors">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="24" height="24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"/>
          </svg>
        </a>
      </div>
      <div class="right-group">
        ${this.offline ? html`<span class="offline-pill">Offline</span>` : ''}
        ${this.installable ? html`
          <button
            class="icon-btn install-btn"
            @click=${this._onInstallClick}
            aria-label="Install app"
            title="Install app"
          >
            <!-- Install glyph: downward arrow into a tray — distinct from cloud-download (D-09) -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" aria-hidden="true" width="24" height="24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v11m0 0-3-3m3 3 3-3"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>
            </svg>
          </button>
        ` : this.iosInstructable ? html`
          <button
            class="icon-btn install-btn"
            @click=${this._toggleIosPopover}
            aria-label="Add to Home Screen"
            title="Add to Home Screen"
            aria-haspopup="dialog"
            aria-expanded=${String(this._iosPopoverOpen)}
          >
            <!-- Install glyph (same as Android — cross-platform parity, D-11) -->
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" aria-hidden="true" width="24" height="24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v11m0 0-3-3m3 3 3-3"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/>
            </svg>
          </button>
          ${this._iosPopoverOpen ? this._renderIosPopover() : ''}
        ` : ''}
        ${this._renderAuth()}
      </div>
    `;
  }
}

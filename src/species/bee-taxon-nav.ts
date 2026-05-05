// Phase 81 NAV-01..05 — light-DOM Lit presenter that decorates the
// server-rendered taxon tree (emitted by _includes/taxon-tree.njk).
//
// D-05 invariant carried from Phase 80: light DOM (createRenderRoot
// returns this) + NO render() method. Adding render() would clobber
// the SSR tree. The class hooks willUpdate(changedProps) +
// querySelectorAll to project state changes into the existing DOM
// (mute-not-hide for filtered branches, NAV-04).
//
// State flow (ARCH-03):
//   - downward: activeTaxonPath @property set by <bee-species-page>
//   - upward: taxon-selected CustomEvent on click (NAV-03)
//
// NAV-03 contract (Phase 81 Plan 06): clicks inside the nav rail are
// IN-PLACE filter triggers. _onClick dispatches taxon-selected and
// then preventDefault()s the event so any embedded element (e.g. a
// <span> label) cannot trigger native navigation. Cross-route deep
// links to the SPA atlas are provided exclusively by the species-card
// "View N occurrences →" button — never by the nav tree.
//
// D-11 (Phase 82 Plan 06): aria-expanded is synced from <details> open
// state onto each enclosing li[data-taxon] via capture-mode toggle listener.
// Summary clicks skip preventDefault so native Enter/Space keyboard
// disclosure (free from the browser) continues to work.
//
// PAGE-06: this file MUST NOT import bee-species-page.ts.
// ARCH-04: this file MUST NOT import mapbox-gl, wa-sqlite, ../sqlite.ts,
//   ../filter.ts, ../bee-map.ts, ../bee-atlas.ts, ../url-state.ts.

import { LitElement, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-taxon-nav')
export class BeeTaxonNav extends LitElement {
  @property({ attribute: false }) activeTaxonPath: string[] = [];

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — preserves SSR tree (NAV-05).

  connectedCallback(): void {
    super.connectedCallback();
    // NAV-03: delegate-click on the rendered tree. Each <li data-taxon=...>
    // (or its descendant <a>) dispatches taxon-selected upward.
    this.addEventListener('click', this._onClick);
    // D-11: <details> 'toggle' does not bubble per spec; capture=true reaches
    // it on any descendant <details>. Mirrors open state onto aria-expanded.
    this.addEventListener('toggle', this._onToggle, true);
    // Initial sync from SSR open state (e.g. any <details open> shipped from server).
    this._syncAllAria();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('click', this._onClick);
    this.removeEventListener('toggle', this._onToggle, true);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (changed.has('activeTaxonPath')) {
      this._applyMuteClasses();
    }
  }

  private _onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const li = target.closest('li[data-taxon]') as HTMLElement | null;
    if (!li) return;
    // D-11: detect clicks originating inside a <summary>. Summary clicks must
    // NOT have preventDefault called on them — the browser uses the same
    // synthetic click to toggle the <details> open state, giving us free
    // Enter/Space keyboard support. Calling preventDefault here would break
    // that native keyboard disclosure.
    const inSummary = !!target.closest('summary');
    // NAV-03: build the path from data-taxon walking up the ancestor <li>s.
    const path: string[] = [];
    const ranks: string[] = [];
    let cur: HTMLElement | null = li;
    while (cur) {
      const tx = cur.getAttribute('data-taxon');
      const rk = cur.getAttribute('data-rank');
      if (tx) {
        path.unshift(tx);
        if (rk) ranks.unshift(rk);
      }
      cur = cur.parentElement?.closest('li[data-taxon]') ?? null;
    }
    const rank = ranks[ranks.length - 1] ?? 'species';
    this.dispatchEvent(new CustomEvent('taxon-selected', {
      bubbles: true,
      composed: true,
      detail: { path, rank },
    }));
    // NAV-03 (Plan 06 gap T3 fix): clicks in the nav rail are in-place
    // filter triggers. preventDefault keeps any embedded element from
    // triggering navigation; the species-card "View N occurrences →"
    // button is the sanctioned cross-route deep-link path.
    // D-11: skip preventDefault for summary clicks so the native disclosure toggle fires.
    if (!inSummary) {
      e.preventDefault();
    }
  };

  private _onToggle = (e: Event): void => {
    // D-11: sync aria-expanded on the enclosing li[data-taxon] whenever a
    // <details> changes its open state. Called via capture listener so the
    // non-bubbling 'toggle' event is still intercepted.
    const det = e.target as HTMLDetailsElement | null;
    if (!det || det.tagName !== 'DETAILS') return;
    const li = det.closest('li[data-taxon]') as HTMLElement | null;
    if (!li) return;
    li.setAttribute('aria-expanded', det.open ? 'true' : 'false');
  };

  private _syncAllAria(): void {
    // D-11: initial sync from SSR open state. Any <details open> shipped
    // from the server will have aria-expanded correctly reflected here.
    this.querySelectorAll<HTMLDetailsElement>('details').forEach(det => {
      const li = det.closest('li[data-taxon]');
      if (li) li.setAttribute('aria-expanded', det.open ? 'true' : 'false');
    });
  }

  private _applyMuteClasses(): void {
    // NAV-04 mute-not-hide. activeTaxonPath = [] means everything visible.
    // A node is "active-relevant" if its data-taxon name is in the path,
    // OR any of its descendants' data-taxon names is in the path.
    // Otherwise it gets .muted. We never set display:none.
    const active = this.activeTaxonPath;
    const items = this.querySelectorAll<HTMLElement>('li[data-taxon]');
    if (active.length === 0) {
      items.forEach(li => li.classList.remove('muted'));
      return;
    }
    const activeSet = new Set(active);
    items.forEach(li => {
      const name = li.getAttribute('data-taxon') ?? '';
      let relevant = activeSet.has(name);
      if (!relevant) {
        const descendants = li.querySelectorAll<HTMLElement>('li[data-taxon]');
        for (const d of descendants) {
          if (activeSet.has(d.getAttribute('data-taxon') ?? '')) {
            relevant = true;
            break;
          }
        }
      }
      li.classList.toggle('muted', !relevant);
    });
  }
}

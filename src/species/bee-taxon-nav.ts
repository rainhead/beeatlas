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
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('click', this._onClick);
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
    // Allow native <a> click for LINK-03 deep-link to SPA. Do NOT preventDefault.
  };

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

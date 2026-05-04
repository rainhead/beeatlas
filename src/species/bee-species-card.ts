// Phase 80 light-DOM card. Eleventy server-renders the card's children
// (heading, photo, map, attribution, description, deep-link) via
// _pages/species.njk. This class only attaches reactive behavior on
// upgrade — Phase 81 wires filteredCount + willUpdate decoration.
//
// D-05 locked: light DOM + NO render() — see bee-species-page.ts header
// for the full rationale. Locked by src/tests/bee-species-card.test.ts
// prototype-identity assertion.
//
// PAGE-06 locked: presenters never import the coordinator
// (bee-species-page.ts). State flows downward via @property; events flow
// upward via CustomEvent. Locked by src/tests/arch.test.ts's
// `PAGE-06: presenter→coordinator non-import` describe block.
//
// PAGE-07: content-visibility: auto applied to :host so the browser
// skips rendering off-screen cards (Pitfall #10 — Osmia/Andrena pages
// can hold ~80 cards). loading="lazy" on <img> tags handled at the
// template level in _pages/species.njk.

import { LitElement, css, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-species-card')
export class BeeSpeciesCard extends LitElement {
  @property({ attribute: false }) scientificName = '';
  @property({ attribute: false }) slug = '';
  @property({ type: Number }) occurrenceCount = 0;

  // Phase 81 FILT-04: filtered count from coordinator. Sentinel -1 means
  // "not yet computed" (Pitfall #81-D — avoids initial-paint "0 records"
  // flash across 735 cards). Coordinator's first compute pass sets a real
  // value and triggers a clean willUpdate.
  @property({ type: Number }) filteredCount = -1;

  // Light-DOM elements have no shadow tree, but Lit's `static styles`
  // are still emitted as a <style> tag inside the element on connect
  // when createRenderRoot returns `this`. The selector `:host` works
  // against the host element directly. Verified pattern on existing
  // shadow-DOM components, applied here to the light-DOM root.
  //
  // Phase 80 ships ONLY content-visibility (PAGE-07). Phase 81 adds the
  // .muted state for FILT-04 (filteredCount === 0).
  static styles = css`
    :host {
      content-visibility: auto;
      contain-intrinsic-size: 1px 400px; /* hint to layout for off-screen cards */
      display: block;
    }
    :host(.muted) {
      opacity: 0.35;
    }
  `;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md
  // Pattern 1. Adding render() would clobber Eleventy's server-rendered
  // children. Locked by src/tests/bee-species-card.test.ts.
  //
  // Phase 81 FILT-04: decorate the server-rendered children when
  // filteredCount changes via willUpdate (Pitfall #81-A). NEVER override
  // render() — that would clobber the SSR <h2>, <img>, attribution,
  // description, and link, breaking Phase 80's locked invariant
  // (src/tests/bee-species-card.test.ts:11-13).
  //
  // Instead, query the SSR'd children and mutate their text / class. The
  // _pages/species.njk template emits .count-badge and .spa-link with
  // initial values; this hook keeps them in sync with the coordinator.
  protected willUpdate(changed: PropertyValues<this>): void {
    super.willUpdate(changed);
    if (changed.has('filteredCount')) {
      if (this.filteredCount === -1) return;  // sentinel: skip initial paint
      const n = this.filteredCount;
      const recordWord = n === 1 ? 'record' : 'records';
      const occurrenceWord = n === 1 ? 'occurrence' : 'occurrences';

      const badge = this.querySelector('.count-badge');
      if (badge) badge.textContent = `${n} ${recordWord}`;

      this.classList.toggle('muted', n === 0);

      const link = this.querySelector('.spa-link') as HTMLAnchorElement | null;
      if (link) link.textContent = `View ${n} ${occurrenceWord} →`;
    }
  }
}

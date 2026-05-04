// Phase 80 light-DOM card. Eleventy server-renders the card's children
// (heading, photo, map, attribution, description, deep-link) via
// _pages/species.njk. This class only attaches reactive behavior on
// upgrade — Phase 80 has no behavior yet, but @property declarations
// are forward-looking for Phase 81's filter wiring.
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

import { LitElement, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('bee-species-card')
export class BeeSpeciesCard extends LitElement {
  @property({ attribute: false }) scientificName = '';
  @property({ attribute: false }) slug = '';
  @property({ type: Number }) occurrenceCount = 0;

  // Light-DOM elements have no shadow tree, but Lit's `static styles`
  // are still emitted as a <style> tag inside the element on connect
  // when createRenderRoot returns `this`. The selector `:host` works
  // against the host element directly. Verified pattern on existing
  // shadow-DOM components, applied here to the light-DOM root.
  //
  // Phase 80 ships ONLY content-visibility (PAGE-07). Visual design
  // (typography, layout, photo carousel) is deferred per D-02.
  static styles = css`
    :host {
      content-visibility: auto;
      contain-intrinsic-size: 1px 400px; /* hint to layout for off-screen cards */
      display: block;
    }
  `;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — see Phase 80 RESEARCH.md
  // Pattern 1. Adding render() would clobber Eleventy's server-rendered
  // children. Locked by src/tests/bee-species-card.test.ts.
}

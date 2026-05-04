// Phase 80 coordinator for the /species/ page.
// ARCH-03 / PAGE-05: this class is the SOLE owner of the page's reactive
// state. The remaining presenters (bee-taxon-nav, bee-species-grid,
// bee-species-filter, seasonality-viz) ship in Phase 81 and never own
// state — they receive @property bindings and emit CustomEvents upward.
//
// D-05 locked: light DOM (createRenderRoot returns this) + NO render()
// method. Lit's default render() returns noChange, which lit-html commits
// as a no-op — preserving Eleventy's server-rendered children across
// upgrade and reactive property changes. Verified at
// node_modules/lit-element/development/lit-element.js:95-130.
//
// INTENTIONAL: do NOT define render(). Adding render() would clobber
// SSR children. Locked by src/tests/bee-species-card.test.ts's
// prototype-identity assertion (Pitfall 1 mitigation).

import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';

// Filter shape placeholders — Phase 81 wires events/URL onto these.
// Aligned with src/filter.ts:11-22 (Set<string> for counties/ecoregions,
// Set<number> for months) so Phase 81's filter-merge logic is trivial.
export interface GeoFilter {
  counties: Set<string>;       // empty Set is unused; use null to mean "no filter active"
  ecoregions: Set<string>;
}

export interface SeasonFilter {
  months: Set<number>;         // 1..12; FILT-02 month range params (?m0=, ?m1=)
}

@customElement('bee-species-page')
export class BeeSpeciesPage extends LitElement {
  // D-07 locked defaults — Phase 81 wires events/URL parsing onto these
  // existing fields rather than introducing them mid-flight.
  // Declared without `private` so noUnusedLocals doesn't flag the
  // forward-looking fields before Phase 81 wires them into a render()
  // override or event handlers. The tests access them via `(el as any)`
  // regardless, and the underscore-prefix convention still signals
  // "internal — do not depend on from outside the class."
  @state() _activeTaxonPath: string[] = [];
  @state() _geoFilter: GeoFilter | null = null;
  @state() _seasonFilter: SeasonFilter | null = null;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  // INTENTIONAL: do NOT define render() — see header comment.
}

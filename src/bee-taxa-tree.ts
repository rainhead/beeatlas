import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { applyRankToggle, loadToggleState, saveToggleState } from './species-tree.ts';
import { quantify } from './lib/quantify.js';
import type { TaxonNode, Evidence } from './taxa-tree.ts';

// Taxonomic tree of the current filter's result set (beeatlas-0of.1).
//
// A PURE PRESENTER: it receives the built tree as a property, renders it, and
// emits events upward. It runs no query and owns no filter state — bee-atlas does
// (the state-ownership invariant in CLAUDE.md).
//
// MARKUP CONTRACT, deliberately identical to _pages/species.njk: every node is a
// `<details class="tree-node tree-node--RANK" data-rank data-name>` (species are
// `<li data-rank="species">` inside `<ul class="species-list">`). That is not
// cosmetic — species-tree.ts's applyRankToggle() finds intermediate ranks by
// `[data-rank="subfamily"],[data-rank="tribe"],[data-rank="subgenus"]` and toggles
// the `rank-skipped` class on them, so reusing the attribute names is what lets
// this pane reuse that function instead of reimplementing the rank model.
//
// CR-01 (inherited): rank-skipping uses `display: contents` + a hidden summary,
// NEVER the `hidden` attribute. `hidden` is `display:none`, which would bury the
// genera and species nested inside the skipped wrapper — the whole subtree would
// vanish rather than being promoted under the family.

export interface TaxonSelectedEvent { taxonId: number; name: string; rank: string }

const EVIDENCE_LABEL: Record<Evidence, string> = {
  'specimen': 'Specimen',
  'community': 'Observed',
  'checklist-only': 'Checklist',
};

const EVIDENCE_TITLE: Record<Evidence, string> = {
  'specimen': 'Backed by a catalogued or photographed specimen in this filter',
  'community': 'Backed by community observation in this filter — no specimen',
  'checklist-only': 'Asserted only by a published county checklist — no specimen or observation in this filter',
};

@customElement('bee-taxa-tree')
export class BeeTaxaTree extends LitElement {
  @property({ attribute: false }) tree: TaxonNode[] = [];
  @property({ attribute: false }) loading = false;
  @property({ attribute: false }) speciesCount = 0;
  /** Taxa an active elevation bound removed for having no elevation data at all. */
  @property({ attribute: false }) excludedForNoElevation = 0;
  @property({ attribute: false }) filterActive = false;

  private _showAllRanks = loadToggleState();

  static styles = css`
    :host { display: block; overflow-y: auto; height: 100%; }
    .wrap { padding: 0.5rem 0.75rem 1rem; }

    .controls {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.25rem 0 0.5rem; font-size: 0.85rem;
    }
    .controls label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; }
    .summary-line { color: var(--text-muted, #666); font-size: 0.85rem; padding-bottom: 0.5rem; }

    /* The elevation disclosure (D-02's surviving requirement). Not a generic
       "some data is missing" note: it names WHICH records and WHY, because the
       excluded set is exactly the taxa whose only evidence is a county-level
       checklist assertion. */
    .disclosure {
      border-left: 3px solid var(--accent, #2c7a2c);
      background: var(--surface-muted, rgba(44,122,44,0.06));
      padding: 0.4rem 0.6rem; margin: 0 0 0.6rem;
      font-size: 0.8rem; line-height: 1.35; color: var(--text-body, #213547);
    }

    .tree-node > summary {
      display: flex; align-items: baseline; gap: 0.5rem;
      cursor: pointer; padding: 0.2rem 0; list-style: none;
    }
    .tree-node > summary::-webkit-details-marker { display: none; }
    .tree-node > summary::before {
      content: '▸'; flex: 0 0 auto; width: 1rem;
      color: var(--text-body, #213547); font-size: 1.1rem; line-height: 1;
    }
    details.tree-node[open] > summary::before { content: '▾'; }

    details.tree-node { padding-left: 1.25rem; }
    .species-list { padding-left: 1.25rem; margin: 0; list-style: none; }
    .species-list li {
      display: flex; align-items: baseline; gap: 0.5rem; padding: 0.15rem 0;
    }
    :host > .wrap > details.tree-node--family { padding-left: 0; }

    /* CR-01: display:contents, never [hidden]. See module header. */
    .tree-node.rank-skipped { display: contents; }
    .tree-node.rank-skipped > summary { display: none; }
    /* [hidden] must outrank the flex/contents declarations above. */
    [data-rank][hidden] { display: none; }

    .node-name {
      flex: 1 1 auto; background: none; border: none; padding: 0;
      font: inherit; color: var(--link, #1a5c1a); text-align: left;
      cursor: pointer; text-decoration: underline; text-underline-offset: 2px;
    }
    .node-name:hover { color: var(--accent, #2c7a2c); }
    .node-counts { flex: 0 0 auto; font-size: 0.8rem; color: var(--text-muted, #666); }

    .node-badge {
      flex: 0 0 auto; font-size: 0.7rem; padding: 0.05rem 0.35rem;
      border-radius: 0.7rem; border: 1px solid currentColor; opacity: 0.85;
    }
    .ev-specimen { color: var(--accent, #2c7a2c); }
    .ev-community { color: #6b4fa8; }
    .ev-checklist-only { color: #8a6d1f; }

    .hint { color: var(--text-muted, #666); font-size: 0.85rem; padding: 0.5rem 0; }
    a.species-link { flex: 0 0 auto; font-size: 0.75rem; }
  `;

  // The rank toggle mutates classes on already-rendered DOM (species-tree.ts owns
  // that logic), so it must run AFTER Lit has committed the tree — hence updated(),
  // not render(). Re-applied on every update because a filter change rebuilds the
  // nodes and the fresh ones carry no rank-skipped class.
  protected updated(_changed: PropertyValues): void {
    applyRankToggle(this.renderRoot as unknown as ParentNode, this._showAllRanks);
  }

  private _onToggleRanks(e: Event): void {
    this._showAllRanks = (e.target as HTMLInputElement).checked;
    saveToggleState(this._showAllRanks);
    this.requestUpdate();
  }

  private _select(node: TaxonNode): void {
    this.dispatchEvent(new CustomEvent<TaxonSelectedEvent>('taxon-selected', {
      detail: { taxonId: node.taxonId, name: node.name, rank: node.rank },
      bubbles: true, composed: true,
    }));
  }

  private _counts(node: TaxonNode) {
    const parts: string[] = [];
    if (node.specimenCount > 0) parts.push(quantify(node.specimenCount, 'specimen'));
    if (node.communityCount > 0) parts.push(quantify(node.communityCount, 'observation'));
    if (node.checklistCount > 0) parts.push(quantify(node.checklistCount, 'checklist record'));
    return parts.join(' · ');
  }

  private _badge(node: TaxonNode) {
    return html`<span
      class=${'node-badge ev-' + node.evidence}
      title=${EVIDENCE_TITLE[node.evidence]}
    >${EVIDENCE_LABEL[node.evidence]}</span>`;
  }

  private _renderNode(node: TaxonNode): unknown {
    const dataName = node.name.toLowerCase();

    if (node.rank === 'species') {
      return html`
        <li data-rank="species" data-name=${dataName}>
          <button class="node-name" @click=${() => this._select(node)}
                  title="Filter the map to ${node.name}"><em>${node.name}</em></button>
          ${this._badge(node)}
          <span class="node-counts">${this._counts(node)}</span>
        </li>
      `;
    }

    // Species children go in a <ul>; anything else nests directly, matching
    // _pages/species.njk so both trees indent identically.
    const kids = node.children;
    const speciesKids = kids.length > 0 && kids[0]!.rank === 'species';

    return html`
      <details class=${`tree-node tree-node--${node.rank}`} data-rank=${node.rank} data-name=${dataName} open>
        <summary>
          <button class="node-name" @click=${(e: Event) => { e.preventDefault(); this._select(node); }}
                  title="Filter the map to ${node.name}">
            ${node.rank === 'family' ? node.name : html`<em>${node.name}</em>`}
          </button>
          ${this._badge(node)}
          <span class="node-counts">${this._counts(node)}</span>
        </summary>
        ${speciesKids
          ? html`<ul class="species-list">${kids.map((c) => this._renderNode(c))}</ul>`
          : kids.map((c) => this._renderNode(c))}
      </details>
    `;
  }

  render() {
    if (this.loading) return html`<div class="wrap"><p class="hint">Loading…</p></div>`;

    if (this.tree.length === 0) {
      return html`<div class="wrap">
        <p class="hint">${this.filterActive
          ? 'No taxa match the current filter.'
          : 'No taxa to show.'}</p>
      </div>`;
    }

    return html`
      <div class="wrap">
        <div class="controls">
          <label>
            <input type="checkbox" .checked=${this._showAllRanks} @change=${this._onToggleRanks}>
            Show all ranks
          </label>
        </div>
        <div class="summary-line">${quantify(this.speciesCount, 'species', 'species')} in the current filter</div>
        ${this.excludedForNoElevation > 0 ? html`
          <p class="disclosure">
            An elevation filter is active, so ${quantify(this.excludedForNoElevation, 'taxon', 'taxa')}
            ${this.excludedForNoElevation === 1 ? 'is' : 'are'} not shown: their only records are
            county-level checklist assertions, which carry no coordinate precise enough for an
            elevation. Clear the elevation filter to see them.
          </p>
        ` : nothing}
        ${this.tree.map((n) => this._renderNode(n))}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap { 'bee-taxa-tree': BeeTaxaTree }
}

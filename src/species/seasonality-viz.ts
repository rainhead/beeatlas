// Phase 81 VIZ-01..05 — inline SVG seasonality chart.
// Pre-binned input only (VIZ-04): the coordinator (<bee-species-page>)
// computes the 12-element combined_vec per CONTEXT D-02 and sets it via
// the `data` @property. This component does NO computation beyond
// scaling and layout. NO in-browser density estimation; NO chart library.
//
// Light-DOM (createRenderRoot returns this) and DOES define render() —
// the host element is server-rendered empty (CONTEXT D-04 acceptable).
//
// Threshold conventions (BeeSearch, locked):
//   total >= 5  -> bars; total < 5  -> text fallback (VIZ-02)
//   sample size is stated as a literal count (VIZ-05); the original star
//   glyphs had no on-page key, so they read as an unexplained artifact.
//
// Season bands (meteorological NH, VIZ-03):
//   Winter Dec-Feb, Spring Mar-May, Summer Jun-Aug, Fall Sep-Nov.
//
// PAGE-06: this file MUST NOT import bee-species-page.ts.
// ARCH-04: this file MUST NOT import mapbox-gl, wa-sqlite, ../sqlite.ts,
//   ../filter.ts, ../bee-map.ts, ../bee-atlas.ts, ../url-state.ts.

import { LitElement, html, svg, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

// Meteorological seasons (Northern Hemisphere). Each band is contiguous in
// month-index space EXCEPT winter, which wraps Dec→Jan/Feb. Render winter
// in two pieces: Jan-Feb at the start, Dec at the end.
const SEASON_BANDS = [
  { from: 0,  to: 1,  cls: 'band-winter' },  // Jan, Feb
  { from: 2,  to: 4,  cls: 'band-spring' },  // Mar, Apr, May
  { from: 5,  to: 7,  cls: 'band-summer' },  // Jun, Jul, Aug
  { from: 8,  to: 10, cls: 'band-fall'   },  // Sep, Oct, Nov
  { from: 11, to: 11, cls: 'band-winter' },  // Dec
] as const;

@customElement('seasonality-viz')
export class SeasonalityViz extends LitElement {
  @property({ attribute: false }) data: number[] = new Array(12).fill(0);
  @property({ attribute: false }) onChecklist = false;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  static styles = css`
    :host { display: inline-block; }
    .band-winter { fill: #f0f4ff; }
    .band-spring { fill: #e8f5e8; }
    .band-summer { fill: #fff4dc; }
    .band-fall   { fill: #fde8d8; }
    .bar { fill: #2a5a8a; }
    .axis { font: 10px system-ui; fill: #555; }
    .viz-fallback { color: #555; font-style: italic; font-size: 0.85rem; }
    .sample-size { color: #767676; font-size: 0.75rem; margin: 0.15rem 0 0; }
  `;

  render() {
    const total = this.data.reduce((a, b) => a + b, 0);

    // VIZ-02 fallback branch
    if (total < 5) {
      // D-13: checklist-only species with all-NULL months have total=0 but records do exist.
      // Distinguish "truly zero records" from "records exist but months unknown".
      if (total === 0 && this.onChecklist) {
        return html`<p class="viz-fallback">Monthly phenology not recorded</p>`;
      }
      const monthsWithData: string[] = [];
      this.data.forEach((n, i) => { if (n > 0) monthsWithData.push(MONTH_LABELS[i]!); });
      // D-08 (Phase 82): drop the ambiguous single-letter month suffix when
      // only one month has data ('A' is April or August). Multi-month ranges
      // stay because the dash gives context.
      const range = monthsWithData.length > 1
        ? `${monthsWithData[0]}–${monthsWithData[monthsWithData.length - 1]}`
        : '';
      const recordLabel = `${total} record${total === 1 ? '' : 's'}`;
      return html`<p class="viz-fallback">${recordLabel}${range ? `, ${range}` : ''}</p>`;
    }

    const max = Math.max(...this.data) || 1;
    const W = 240, H = 80, BAR_W = 18, GAP = 2;

    return html`
      <svg viewBox="0 0 ${W} ${H + 14}" role="img" aria-label="Monthly seasonality, ${total} records">
        ${SEASON_BANDS.map(b => svg`
          <rect class="${b.cls}"
                x="${b.from * (BAR_W + GAP)}"
                y="0"
                width="${(b.to - b.from + 1) * (BAR_W + GAP)}"
                height="${H}"></rect>`)}
        ${this.data.map((n, i) => svg`
          <rect class="bar"
                x="${i * (BAR_W + GAP) + 1}"
                y="${H - (n / max) * H}"
                width="${BAR_W}"
                height="${(n / max) * H}"></rect>`)}
        ${MONTH_LABELS.map((label, i) => svg`
          <text class="axis"
                x="${i * (BAR_W + GAP) + BAR_W / 2 + 1}"
                y="${H + 12}"
                text-anchor="middle">${label}</text>`)}
      </svg>
      <p class="sample-size">Based on ${total} dated record${total === 1 ? '' : 's'}.</p>
    `;
  }
}

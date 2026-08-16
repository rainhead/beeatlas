import { html, type TemplateResult } from 'lit';

/**
 * The one symbol for TAXONOMY — a rank hierarchy branching into its children.
 *
 * It has three homes: the header's Species-index nav link, the sidebar's
 * "Species or group" filter row, and the sidebar's "show the taxonomy of these
 * results" button. Those used to be three different pictures for one idea — a
 * hierarchy, a hand-drawn bee, and the alchemical character 🜎 — so the reader had
 * no way to learn that they meant the same thing.
 *
 * Shared as a function rather than copied, because the failure mode of copying is
 * silent: someone adjusts one glyph, the others drift, and nothing tests a picture.
 *
 * `size` is the rendered box; the viewBox stays 24 so the geometry is IDENTICAL
 * everywhere. `strokeWidth` is in viewBox units, so a small render needs a bigger
 * number to keep the same visual weight as the icons beside it — the sidebar's
 * 16px row icons are drawn in a 16 viewBox at 1.5, which is 2.25 here.
 */
export function taxonomyIcon(
  { size = 24, strokeWidth = 1.5, className = '' }:
  { size?: number; strokeWidth?: number; className?: string } = {},
): TemplateResult {
  return html`
    <svg xmlns="http://www.w3.org/2000/svg" class=${className} fill="none" viewBox="0 0 24 24"
         stroke-width=${strokeWidth} stroke="currentColor"
         width=${size} height=${size} aria-hidden="true">
      <g transform="translate(0, 2.25)">
        <rect x="8.5" y="2" width="7" height="4.5" rx="0.75"/>
        <path stroke-linecap="round" d="M12 6.5v3M6.5 9.5H17.5M6.5 9.5v3.5M17.5 9.5v3.5"/>
        <rect x="3" y="13" width="7" height="4.5" rx="0.75"/>
        <rect x="14" y="13" width="7" height="4.5" rx="0.75"/>
      </g>
    </svg>
  `;
}

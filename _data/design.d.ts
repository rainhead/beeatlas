/**
 * Types for the Eleventy data file that registers the /design sections.
 *
 * The list itself stays plain JS because Eleventy loads it directly (ADR 0039);
 * this declaration is what lets src/design and the tests read it typed. Follows
 * the src/lib/*.d.ts pattern.
 */
export interface DesignSection {
  /** URL segment and PROOFS key: /design/<slug>.html. */
  slug: string;
  label: string;
  lede: string;
}

declare const design: { sections: DesignSection[] };
export default design;

// The sections of /design (ADR 0039), in reading order.
//
// This list is the single register of what the proofing surface covers: the
// index page, the per-section pages (Eleventy paginates over it), the nav on
// every one of them, and a test all read it. The test also checks it against
// the PROOFS registry in src/design/proofs.ts, so a section cannot be listed
// with nothing to show, or shown without being listed — the orphan a design
// system accumulates first.
//
// Plain JS rather than TypeScript because Eleventy data files are loaded by
// Eleventy, not by Vite; the states themselves are typed, in src/design/.

export default {
  sections: [
    {
      slug: 'occurrence-detail',
      label: 'Occurrence detail',
      lede: 'The sidebar card, in every record_type variant and every membership state. '
        + 'This is the component with the most states in the product: five card variants, '
        + 'two grouping levels, and place membership that may be shared, partial, or unresolved.',
    },
  ],
};

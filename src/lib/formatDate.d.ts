// Type declarations for formatDate.js so client-side TS (the bee-notes
// island, Phase 179-05, and this file's own test) can import the same
// timestamp formatter the Eleventy `formatDate` filter uses (single source
// of truth — see formatDate.js).
export function formatDate(iso: string | undefined | null): string;

// Type declarations for quantify.js so client-side TS can import the same
// count-noun pluralization utility the Eleventy templates use (single source
// of truth — see quantify.js).
export function pluralize(count: number, singular: string, plural?: string): string;
export function quantify(count: number, singular: string, plural?: string): string;

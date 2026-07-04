// Single source of truth for the human-readable note timestamp format
// ("Jul 4, 2026"). Used by Eleventy templates (registered as the
// `formatDate` filter in eleventy.config.js) and imported verbatim by the
// bee-notes island (src/bee-notes.ts, Phase 179-05) so baked and live
// timestamps never visually diverge (179-UI-SPEC.md "Timestamp format").
//
//   formatDate('2026-07-04T17:31:14.339Z') -> 'Jul 4, 2026'
//   formatDate('2026-01-09')               -> 'Jan 9, 2026'
//   formatDate('') / formatDate(undefined) -> '' (never throws)

// timeZone: 'UTC' is load-bearing: a bare date-only ISO string (e.g.
// '2026-01-09') parses as UTC midnight. Without pinning the formatter to
// UTC, any local timezone behind UTC would render the previous day
// ('Jan 8, 2026') instead of the intended 'Jan 9, 2026'. Full ISO
// datetimes (which always carry a 'Z'/offset in this codebase) are
// unaffected since they're already UTC-anchored.
const FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return FORMATTER.format(date);
}

// Single source of truth for count-noun pluralization in web copy.
// Used by Eleventy templates (registered as the `quantify` filter in
// eleventy.config.js) and importable by client-side TS for consistent copy.
//
//   pluralize(1, "genus", "genera") -> "genus"
//   pluralize(3, "genus", "genera") -> "genera"
//   quantify(1, "record")           -> "1 record"
//   quantify(0, "record")           -> "0 records"
//
// Pass an explicit `plural` for irregular nouns (genus/genera, etc.);
// regular nouns default to appending "s".

export function pluralize(count, singular, plural) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function quantify(count, singular, plural) {
  return `${count} ${pluralize(count, singular, plural)}`;
}

# ADR 0022: A swatch is a legend for dots, so a species earns a hue by plotting

**Status:** Accepted (2026-07-31)

## Context

The genus, subgenus and tribe maps colour their dots per species, and the species
list beside the map carries a matching swatch. The two are one legend, but they
are produced by two programs: `data/species_maps.py` writes the SVG in the
pipeline, `_data/species.js` writes the swatch at render time.

Both assign `hue = i * 360 / n` over the group's members sorted by
`canonical_name`. A hue is therefore a POSITION, and the two sides only agree if
they agree about which members are in the list. They did not:

| | member set |
|---|---|
| `_data/species.js` | `occurrence_count > 0`; anything else grey `#cccccc` |
| `data/species_maps.py` | `occurrence_count > 0 OR on_checklist` |

`occurrence_count` is the Ecdysis specimen arm alone (`int_species_occurrences_agg`
reads `ecdysis_data.occurrences`), while the dots come from the occurrences export,
which unions the specimen, community-observation and checklist-point arms. So a
species known only from an iNat sample or a georeferenced checklist record plots
with `occurrence_count == 0`.

`Chelostoma phaceliae` is exactly that: no specimens, one community observation,
two checklist points — three blue dots under a grey "checklist-only" swatch. And
because the two member lists differed in length, its genus-mate `C. minutum` was
also pushed one position along: green dots, cyan swatch. Across the live site,
187 of 553 dot-drawing species carried a swatch that disagreed with their dots, in
31 genera.

## Decision

**A species earns a hue when it puts dots on the map, and grey means "this swatch
is a legend for nothing".** The predicate is
`occurrence_count > 0 OR inat_obs_count > 0 OR checklist_count > 0` — `isMapped()`
in `_data/species.js`, `mapped` in `data/species_maps.py` — applied to the same
sorted member set on both sides.

It is deliberately a *superset* of "actually plots": a species whose only records
lack coordinates is counted and draws nothing, costing an unused hue. Both sides
being wrong in the same direction keeps the positions aligned, which is what the
legend depends on; being individually right does not.

Grey stays split the way it already was: `#aaaaaa` for records not identified to
species (which do draw dots), `#cccccc` for species with nothing on the map.

The display list and the counts are unchanged — a specimen-less species is still
listed as a checklist species. Only the colour moved.

## Consequences

- Colouring no longer keys on `occurrence_count`, whose name suggests "all
  occurrences" and whose value is "Ecdysis specimens". Anything else reaching for
  a count of what plots should use the three-arm predicate, not that column.
- The two implementations still exist, so the predicate can drift again. What
  cannot be duplicated away is caught by comparing the OUTPUTS:
  `src/tests/species-map-parity.data.test.ts` asserts every fill in an emitted SVG
  is a colour its page shows. It needs fresh artifacts, so it runs in the nightly
  and skips when the local SVGs predate `species.json`.
- That test allows one channel step of slack: Python's `colorsys` and the JS
  `hslToHex` disagree on the last bit at some hues (hue 270 →
  `127.49999999999991` vs exactly `127.5`, so `#7f26d9` vs `#8026d9`). The
  difference is invisible and predates this record; a wrong hue is off by far more.

## Rejected alternatives

- **Colour from a single source — have the pipeline emit the palette and let the
  page read it.** Removes the duplication outright, and is where this should
  eventually land. It adds a published artifact and a manifest entry for a bug
  that is fixable in two predicates, so it stays a follow-up rather than the fix.
- **Give the page the true "has dots" answer by counting the occurrences export.**
  The site's build-time data feed reads `species.json` on purpose (Pitfall #8 —
  HMR); making it read the occurrence rows to colour a swatch trades a sub-100ms
  reload for exactness the legend does not need.
- **Leave the page alone and drop checklist-only species from the SVG palette.**
  Restores parity by hiding real records: those dots exist and would then be drawn
  grey, which reads as "not identified to species".

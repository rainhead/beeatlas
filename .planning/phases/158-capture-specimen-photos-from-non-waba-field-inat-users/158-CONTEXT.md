# Phase 158 — Capture specimen photos from non-WABA-field iNat users

**Status:** Resolved by manual data curation (not a pipeline change). 2026-06-22.

## Domain

Some collectors post specimen photos to iNaturalist but never fill the **WABA** observation
field (iNat field `18116`, "Ecdysis catalog number suffix"), so those observations fall out
of the BeeAtlas provisional/matched occurrence path. The roadmap framed this as "devise an
observation-field-independent match strategy." In practice the resolution is **per-collector
curation**, not a code/pipeline change.

## What was decided & done

The real situation: affected collectors *do* record their WSDA catalog number — they just
write it in the observation **description** (typically prefixed `OBA`/`WABA`) instead of the
WABA field. The fix is to copy that number into the WABA field, after which the existing
`int_waba_link` machinery matches it to its `WSDA_<n>` Ecdysis specimen record (or, for
not-yet-catalogued recent collections, it enters as provisional via `int_combined` ARM 2).

Locked curation rules (applied per collector):

- **Taxon-agnostic** — bees + non-bee bycatch; any labeled observation is a collected specimen.
- **Label formats** — 8-digit `YY+6` (year prefix `24/25/26`) or standalone 7-digit
  (`2xxxxxx`, the 2024 generation). Both verified as legitimate WSDA catalog numbers in
  Ecdysis (18,374 seven-digit + 27,716 eight-digit catalog numbers exist).
- **Write all matches, flag unconfirmed** — labels not yet in the local Ecdysis snapshot are
  still written, just flagged (they match on a later sync).
- **Plausibility guard** — exclude implausible numbers (bad year prefix); this caught a WSU
  museum number (`WSUC00012840`) that the digit regex would otherwise have grabbed.
- **Never overwrite** an existing WABA field.
- **Writes** via authenticated iNat v1 API as the curator's account (adding OFVs to another
  user's observations is permitted), rate-limited 1 req/sec.

## Executed

- **@swisschick** (= Karla Salp in Ecdysis): 6,128 observations surveyed → **470 WABA fields
  written** (421 bees + 49 bycatch; 461 eight-digit + 9 seven-digit; 465 Ecdysis-confirmed,
  5 recent-unconfirmed). Zero errors. 2026-06-22.
- **@rainhead**: run same day.

## Tooling (durable)

`data/curation/waba_backfill/` — `build_manifest.py --user <login>` (survey + Ecdysis
cross-check → reviewable manifest CSV) and `write_waba.py --manifest <csv>` (idempotent,
crash-safe, rate-limited writer). Reusable for any future collector with the same pattern.
See that directory's `README.md`.

## Not done / deferred

No automated/general "match strategy" was built into the nightly pipeline — capture remains a
curator-run operation per collector. If volume grows, revisit whether to automate (e.g. a
project-membership pull, or auto-promoting description-embedded labels).

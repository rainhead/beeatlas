# WABA backfill

One-off curation tooling to add the **WABA** observation field (iNat field `18116`,
"Ecdysis catalog number suffix") to a collector's observations that carry a WSDA
catalog/label number in their *description* but never had the field set — so they re-enter
the BeeAtlas provisional/matched path instead of falling out.

The phase-158 decision record (`158-CONTEXT.md`) lives in pre-migration git history under `.planning/phases/158-capture-specimen-photos-from-non-waba-field-inat-users/` (the `.planning/` GSD directory was retired in the 2026-07 docs migration).

## Run

```bash
cd data

# 1. Survey + manifest (no writes). Cross-checks labels against the local Ecdysis snapshot.
uv run python curation/waba_backfill/build_manifest.py --user <inat_login>
#   -> curation/waba_backfill/<login>-manifest.csv   (review this)

# 2. Apply. JWT from https://www.inaturalist.org/users/api_token (valid 24h).
INAT_JWT=<token> python3 curation/waba_backfill/write_waba.py \
    --manifest curation/waba_backfill/<login>-manifest.csv
#   -> <login>-manifest.results.csv   (per-row log; re-run resumes, skipping done rows)
#   add --dry-run to preview
```

## Rules (locked phase 158)

- **Taxon-agnostic** — bees + non-bee bycatch; any labeled observation is a collected specimen.
- **Label formats** — 8-digit `YY+6` (year prefix `24/25/26`) or standalone 7-digit (`2xxxxxx`, 2024 generation).
- **Write all matches, flag unconfirmed** — labels not (yet) in the local Ecdysis snapshot are written and flagged (recent collections match on a later sync).
- **Plausibility guard** — implausible numbers (bad year prefix) are excluded; this catches museum numbers (e.g. `WSUC00012840`).
- **Never overwrite** an existing WABA field.

## Rate limiting

1 request/sec (≤60/min, under iNat's 100/min hard cap), exponential backoff on 429/5xx
honoring `Retry-After`. ~N seconds for N writes. Manifest CSVs and `.results.csv` logs are
git-ignored (one-off artifacts); the scripts are the durable part.

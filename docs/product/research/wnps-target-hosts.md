# WNPS / WA-native plants as a machine-readable "target host" list

**Research question:** can Washington Native Plant Society (WNPS) and/or WA-endemic/native
plant data become a machine-readable *target-host* taxon list, joinable to iNaturalist
angiosperm observations for the bloom-phenology ingest (ADR
[0011](../../adr/0011-bloom-phenology-ingest.md))? The load-bearing requirement is
**joinability to iNat taxa** by scientific name / iNat `taxon_id`.

---

## Summary / recommendation

**Use the Burke Herbarium Washington Flora Checklist, not WNPS, as the substrate.**

- **WNPS is a dead end for machine ingest.** Its native-plant content
  (Native Plant Directory, Starflower tools, chapter plant lists) is prose/HTML/PDF with
  no CSV, no API, and no bulk export. It also carries no native-vs-introduced or
  endemic flag we could filter on. It is a human-facing resource, not a dataset.
- **The Burke "Washington Flora Checklist" is exactly what we need and is already
  machine-readable.** It publishes a nightly-regenerated ZIP of tab-delimited tables with
  **scientific name, family, a Burke `TaxonID`, a `TerminalTaxon` flag, an `Origin`
  (Native/Introduced) column, and — critically — an `Endemic` (Y/N) column**, plus a full
  **synonymy table** (~21k synonym→accepted mappings) that makes iNat name-matching robust.
- **Joinability to iNat is by scientific-name string against the iNat taxonomy backbone we
  already ingest** (`data/raw/taxa.csv.gz`, walked by
  [`data/host_plant_lineage.py`](../../../data/host_plant_lineage.py)). No live iNat API
  call is needed to *build the taxon list* — only to fetch observations downstream. The
  synonymy table absorbs most of the lossiness (authority strings, renames).
- **Concrete numbers from the current download:** 84 taxa flagged endemic to WA; 3,991
  native taxa; **2,550 native terminal angiosperm (dicot + monocot) taxa** — a tractable,
  well-scoped candidate set for the WA-endemic/native arm of the target-host set.
- **Main blocker is licensing, not data.** Neither Burke nor WNPS publishes an explicit
  open-data license (CC-BY etc.). Burke's terms are "cite the Washington Flora Checklist as
  the source"; web content is © Burke Museum / UW. This is a permissions/attribution
  question to resolve before publishing, not a technical one.

**Recommended path:** ingest the Burke ZIP as a new pipeline source; filter to
`TerminalTaxon = 'Y'` and `Origin` native (and/or `Endemic = 'Y'` for the strict endemic
arm); reconcile names to iNat `taxon_id` via a string join on the iNat backbone with the
Burke `synonymy.txt` as fallback; emit a seed table analogous to
[`bee_specialist_hosts.csv`](../../../data/dbt/seeds/bee_specialist_hosts.csv). Optionally
use the iNat Washington place-checklist only as a *complementary sanity check*, never as the
primary source.

---

## 1. What WNPS actually publishes

**Verdict: no machine-readable list. HTML/PDF/prose only; no native/endemic flag; no export.**

- **Native Plant Directory** — per-species HTML pages keyed by a numeric ID in the URL
  (e.g. `/native-plant-directory/322:abies-grandis`), searchable by name/family/traits,
  paginated (~44 pages). Lists scientific names and common names but exposes **no CSV, JSON,
  API, or bulk-download mechanism** — access is one HTML page at a time.
  https://www.wnps.org/native-plant-directory
- **Starflower tools / image herbarium** — educational Western-WA native-plant materials
  and images from the (defunct, ceased 2007) Starflower Foundation. Educational/media
  resource, not a structured taxon list. https://www.wnps.org/starflower
- **Plant Lists** — member-compiled site checklists ("for many of our favorite sites"),
  loaded dynamically; the page itself points contributors to the **UW Herbarium at the
  Burke Museum** for list management, i.e. WNPS defers the authoritative taxonomy to Burke.
  No documented structured/downloadable form. https://www.wnps.org/plant-lists
- **Endemic-plants project** — WNPS runs an Olympic-Peninsula endemic-plants conservation
  project, but it is narrative/project content, not a dataset.
  https://www.wnps.org/op-projects/endemic-plants

Even if scraped, the WNPS directory lacks the native/introduced and endemic facets the
target-host use needs, so scraping would buy us nothing the Burke checklist doesn't give
cleanly.

## 2. Authoritative WA plant taxonomy for joining — the Burke checklist

**Verdict: the Burke "Washington Flora Checklist" is the authoritative, downloadable,
machine-readable source, and it carries an explicit endemic flag.**

- Download hub, **regenerated nightly**, offers `WAFloraChecklist.zip` (tab-delimited
  tables for "database ingestion, GIS, or other programs") plus a print PDF.
  https://burkeherbarium.org/waflora-new/download.php
- The ZIP (inspected directly, 2026-07-05) contains five TSVs: `waflora.txt` (main table),
  `synonymy.txt`, `scientificnames.txt`, `commonnames.txt`, `literature.txt`.
- **`waflora.txt` columns (verified from the header row):**
  `ID, ModifiedOn, Contributors, InformalClassification, Family, TaxonID, TaxonName,
  SeeAlso, NameRank, Hybrid, TerminalTaxon, Excluded, Peripheral, Waif, Endemic,
  Extirpated, OriginCode, Origin, Distribution, Voucher, Comments`.
  - `TaxonName` = accepted scientific name (join key to iNat).
  - `TaxonID` = Burke's stable internal ID (also embedded in checklist URLs).
  - `Endemic` = Y/N (**endemic to Washington**).
  - `Origin` = "Native" / "Introduced from …" free-text (native filter).
  - `TerminalTaxon` = Y/N (species/infraspecies leaves vs. higher ranks).
  - `InformalClassification` = Ferns/Lycophytes | Gymnosperms | **Dicots | Monocots**
    (angiosperm = Dicots + Monocots).
- **Counts in the current file (5,865 rows total):**
  - 84 endemic terminal taxa (all endemics are terminal).
  - 3,991 `Origin = "Native"`; NameRank breakdown 3,759 species / 928 infraspecies /
    1,022 genus / 156 family.
  - **2,550 native terminal angiosperm (Dicot+Monocot) taxa** — the practical candidate set.
  - Sample endemics: *Lomatium cuspidatum* (TaxonID 39170), *Erythronium quinaultense*,
    *Delphinium viridescens*, *Corispermum pallidum* (37689).
  - Endemic category as a browsable page: https://burkeherbarium.org/waflora/checklist.php?Category=Endemic
- **Synonymy is a first-class table.** `synonymy.txt` (27,204 rows;
  `ScientificName, Accepted, TaxonName …`) maps **~21,276 non-accepted names** to their
  accepted `TaxonName` (e.g. `Sambucus caerulea` → `Sambucus cerulea`). This directly
  powers robust iNat name reconciliation.

**Is there a WA-endemic list specifically, and who owns it?** Yes — the Burke checklist's
`Endemic` flag *is* the authoritative WA-endemic list (84 taxa), published by the UW
Herbarium (WTU) at the Burke Museum. WNPS's Olympic-Peninsula endemic work is a subset of
this, curated for outreach rather than as data.
https://burkeherbarium.org/waflora/checklist.php?Category=Endemic

Complementary (not needed if using Burke): the Washington Natural Heritage Program (WA DNR)
publishes rare/conservation-concern vascular-plant lists. https://www.dnr.wa.gov/NHPlists

## 3. Joinability to iNaturalist

**Verdict: join by scientific name against the iNat backbone we already ingest; synonymy
table absorbs most of the loss. iNat's WA place-checklist exists but is a poor primary
source.**

- BeeAtlas already downloads the full iNat taxonomy as `data/raw/taxa.csv.gz` (Darwin-Core
  export with `taxon_id, name, rank, ancestry, active`), walked by
  [`data/host_plant_lineage.py`](../../../data/host_plant_lineage.py). Mapping Burke
  `TaxonName` → iNat `taxon_id` is therefore a **local string join on `name`**, no live API
  call, following the same pattern as the existing host-plant lineage build.
- **Lossiness** comes from (a) authority strings — Burke `TaxonName` is bare binomials
  ("Sambucus cerulea"), which matches iNat's `name` field cleanly since iNat `name` is also
  authorless; and (b) synonymy/renames — mitigated by joining unmatched Burke names through
  `synonymy.txt` to the accepted name, then retrying, and by checking iNat's own synonym
  handling. Residual unmatched taxa (typically a small percent: infraspecies iNat lacks, or
  very recent splits) should be logged, not silently dropped — matching ADR 0011's
  rare-taxon caution.
- **iNat Washington place-checklist:** iNat has a Washington place with a default
  "Washington Check List" (`check_lists/344`), and per-place taxa are retrievable via the
  API (`GET /v1/observations/species_counts?place_id=<WA>&taxon_id=47125` for angiosperms,
  or the `listed_taxa` endpoint). **But** default checklists are auto-generated from
  observations, carry no native/introduced or endemic distinction, include cultivated/waif
  noise, and are exactly the "generalist noise" ADR 0011 wants to avoid. Use it only to
  *validate* that Burke target-hosts actually have WA observations, never as the taxon
  source. (iNat blocks unauthenticated page fetches — 403 — so verify via the API using the
  project's existing pyinaturalist access.) https://www.inaturalist.org/check_lists/344-Washington-Check-List

## 4. Licensing / terms of use

**Verdict: the real blocker. No explicit open-data license from either party; resolve
attribution/permission before publishing.**

- **Burke:** the download page requires "cite the Washington Flora Checklist as the source
  of these data files"; site content is © Burke Museum, subject to UW Terms. There is **no
  stated CC license** on the checklist data. A citation-plus-attribution use is very likely
  acceptable (this is a public research dataset explicitly offered for "database ingestion"),
  but it is worth a one-line email to WTU (David Giblin, checklist maintainer) to confirm
  redistribution of derived taxon IDs in a published product.
  https://burkeherbarium.org/waflora-new/download.php
- **WNPS:** site content is © WNPS with no open license; moot given we are not using it.

## 5. Bottom line — recommended path, effort, blockers

**Source:** Burke Washington Flora Checklist ZIP (`waflora.txt` + `synonymy.txt`). WNPS is
not the best source and in fact is unusable as data; Burke is strictly better on every axis
(machine-readable, native/endemic flags, stable IDs, synonymy). The iNat WA place-checklist
is a validation aid, not a substrate.

**Build steps (low effort, ~a day):**
1. Add a pipeline step to fetch/cache `WAFloraChecklist.zip` (nightly-regenerated upstream;
   pin/version like other raw inputs).
2. Load `waflora.txt`; filter `TerminalTaxon = 'Y'` and native `Origin`
   (LIKE 'Native%'); keep `Endemic = 'Y'` as the strict-endemic sub-arm. Restrict to
   `InformalClassification IN (Dicots, Monocots)` for angiosperms per ADR 0011.
3. Reconcile `TaxonName` → iNat `taxon_id` via string join on `taxa.csv.gz`; route misses
   through `synonymy.txt` → accepted name → retry; log residual unmatched.
4. Emit a seed/mart (e.g. `wa_native_hosts` / extend the target-host set) parallel to
   [`bee_specialist_hosts.csv`](../../../data/dbt/seeds/bee_specialist_hosts.csv), carrying
   `(inat_taxon_id, scientific_name, burke_taxon_id, is_endemic)`; feed it to the bloom
   ingest's host-centric scope.

**Blockers:**
- **Licensing/attribution** — confirm redistribution terms with WTU (Section 4). This is the
  only non-trivial blocker.
- **Name-match residue** — a minority of Burke taxa won't map to an active iNat taxon (recent
  splits, infraspecies). Must be surfaced, not dropped (ADR 0011 rare-taxon rule).

## Open questions / next steps

- Confirm with David Giblin / WTU (dgiblin@uw.edu) that redistributing derived taxon IDs
  from the checklist in a published product is acceptable with citation.
- Decide scope of the WA-native arm: strict `Endemic = 'Y'` (84 taxa) vs. all native
  terminal angiosperms (~2,550). Endemics alone are too few to drive activation; native
  angiosperms may be too broad — likely want a curated middle (e.g. native + showy +
  observed in WA on iNat). This is a product decision, not a data one.
- Measure the actual iNat name-match rate against `taxa.csv.gz` before committing the seed
  schema (target: what % of the ~2,550 native angiosperms resolve to an active iNat
  `taxon_id` directly vs. via synonymy vs. not at all).
- Confirm the exact iNat `place_id` for Washington (via the project's pyinaturalist access)
  if the place-checklist validation cross-check is wanted.
- Pin the upstream ZIP: it regenerates nightly, so record `ModifiedOn`/a fetch date for
  reproducibility, consistent with `data/artifacts.toml` provenance discipline.

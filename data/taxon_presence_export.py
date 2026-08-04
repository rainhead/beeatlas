"""Export per-geography taxon presence for the static /species/ tree (beeatlas-0of.2).

Writes EXPORT_DIR/taxon_presence.json — which taxa occur in each county and each
level-3 ecoregion, with the evidence that backs each one.

WHY AN ARTIFACT AND NOT THE DATABASE. /species/ is a build-time-rendered page whose
only client JS is species-tree.ts; it loads no data artifact at all today.
occurrences.db is 34 MB, and pulling it in to answer "which bees are in King
County" would change that page's weight budget, the service-worker precache set,
and the offline story. This map is ~1% of that cost.

WHY NOT REUSE seasonality.json, which already has county:/ecoregion_l3: keys:
it stores a 12-month histogram per pair (490 KB raw / 45 KB gzipped — over budget),
it carries no evidence breakdown at all, and it covers 5,328 of the 5,594
(taxon, county) pairs because a pair needs a parseable month to appear. Presence is
a different question from phenology and deserves its own, smaller answer.

EVIDENCE. Each pair carries a bitmask, so the badges the taxa pane shows
survive onto the static page:
    1 = specimen        (catalogued or photographed: specimen, waba_specimen)
    2 = community       (observed: inat_expert, provisional_sample)
    4 = checklist       (a published county-range assertion)
A taxon that is checklist-only in King County reads 4; specimen-backed reads 1 or
1|2|4. The consumer renders the strongest bit, exactly as evidenceOf() does in
src/taxa-tree.ts — keep the two orderings in step.

CHECKLIST ROWS ARE INCLUDED HERE, deliberately, and this is the one surface where
that is unambiguously correct. A checklist record's coordinate is a
county-level placeholder — 620 of them sit on a single point in downtown Seattle —
so it is meaningless for a drawn box or a named place, but the COUNTY it asserts is
exactly what the published checklist is for. Ecoregions are coarse enough to inherit
the same argument.

NO ELEVATION. Elevation is not expressible at county granularity and must not
be faked here; /species/ offers no elevation control. Anything richer than
county/ecoregion deep-links into the atlas with the filter in the URL.

Usage:
    cd data && uv run python taxon_presence_export.py
"""

import json
import os
from pathlib import Path

import duckdb

_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))

# Evidence bits. Values are a wire format read by src/species-presence.ts — changing
# one means changing both, and the frontend test asserts these exact numbers.
EV_SPECIMEN = 1
EV_COMMUNITY = 2
EV_CHECKLIST = 4

# record_type -> bit. The five spellings are fixed by the mart contract (170-01) and
# guarded by an accepted_values dbt test, so this mapping is total.
_EVIDENCE_CASE = f"""
    CASE
        WHEN o.record_type IN ('specimen', 'waba_specimen')        THEN {EV_SPECIMEN}
        WHEN o.record_type IN ('inat_expert', 'provisional_sample') THEN {EV_COMMUNITY}
        WHEN o.record_type = 'checklist'                            THEN {EV_CHECKLIST}
        ELSE 0
    END
"""

# BIT_OR over the per-row evidence bit gives the union of evidence for the pair.
# Grouped on taxon_id (not canonical_name): the frontend joins to the tree by id,
# and taxon_id is already synonym-resolved upstream, so two spellings of one taxon
# cannot split into two entries here.
_QUERY = f"""
    SELECT
        {{dimension}} AS place,
        o.taxon_id,
        CAST(BIT_OR({_EVIDENCE_CASE}) AS INTEGER) AS evidence
    FROM read_parquet(?) o
    WHERE o.taxon_id IS NOT NULL
      AND {{dimension}} IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 1, 2
"""


def _collect(con: duckdb.DuckDBPyConnection, parquet: str, dimension: str) -> dict:
    """{place: {taxon_id: evidence_mask}} for one geography dimension.

    EVIDENCE ONLY, NO PER-PLACE COUNTS — a deliberate size decision. Carrying a
    count per pair costs 10 KB gzipped (26.5 vs 15.7 KB measured over 8,060 pairs),
    which breaks the artifact's budget on day one and leaves no headroom as the
    atlas grows; packing the two into one integer saves almost nothing because the
    count digits are the entropy. The badge is what D-01 requires here, the tree
    already shows each taxon's GLOBAL counts, and a reader who wants exact numbers
    for a geography follows the deep link into the atlas, which has them.
    """
    out: dict[str, dict[str, int]] = {}
    for place, taxon_id, evidence in con.execute(
        _QUERY.format(dimension=dimension), [parquet]
    ).fetchall():
        # String keys: JSON object keys are strings anyway, and the frontend looks
        # them up with String(taxonId) from the tree.
        out.setdefault(place, {})[str(taxon_id)] = int(evidence)
    return out


def main(export_dir: Path | None = None) -> Path:
    assets = Path(export_dir) if export_dir is not None else ASSETS_DIR
    occ_parquet = assets / "occurrences.parquet"
    if not occ_parquet.exists():
        raise FileNotFoundError(
            f"{occ_parquet} not found — run the dbt build and place-marts first"
        )

    con = duckdb.connect()
    try:
        payload = {
            "counties": _collect(con, str(occ_parquet), "o.county"),
            "ecoregions": _collect(con, str(occ_parquet), "o.ecoregion_l3"),
        }
    finally:
        con.close()

    out_path = assets / "taxon_presence.json"
    # Compact separators: this is a wire artifact, not something anyone reads by
    # hand, and the whitespace is a third of the payload.
    out_path.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=True) + "\n")

    pairs = sum(len(v) for v in payload["counties"].values()) + sum(
        len(v) for v in payload["ecoregions"].values()
    )
    print(
        f"taxon-presence-export: {len(payload['counties'])} counties, "
        f"{len(payload['ecoregions'])} ecoregions, {pairs} pairs -> "
        f"{out_path.name} ({out_path.stat().st_size:,} bytes)"
    )
    return out_path


if __name__ == "__main__":
    main()

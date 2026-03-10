"""
iNaturalist observation field constants and extraction helpers.

All field IDs confirmed via live curl against project 166376 (WA Bee Atlas) on 2026-03-10.
Total observations at time of discovery: 9,590.
"""

# ── Field IDs ─────────────────────────────────────────────────────────────────
# field_id=8338 — specimen count. STABLE across name changes.
# Historical names:
#   "Number of bees collected"  — observations submitted pre-2024
#   "numberOfSpecimens"         — observations submitted 2024+
# Match by field_id ONLY. Name matching silently drops ~40% of historical data.
SPECIMEN_COUNT_FIELD_ID = 8338

# field_id=9963 — sampleId. Present on essentially all observations.
SAMPLE_ID_FIELD_ID = 9963

# ── ofvs behavior ─────────────────────────────────────────────────────────────
# Confirmed: ofvs IS returned in the default iNat API v1 response for project
# observation queries — no fields='all' parameter is needed.
# 30 observations sampled across full obs_id range; all included ofvs.
OFVS_IN_DEFAULT_RESPONSE = True


# ── Extraction helpers ────────────────────────────────────────────────────────

def extract_specimen_count(ofvs: list[dict]) -> int | None:
    """Extract specimen count from an observation's ofvs list.

    Matches by field_id=8338 (stable). Name matching is unreliable — the field
    was renamed from "Number of bees collected" to "numberOfSpecimens" in 2024.

    Returns None when the field is absent or value cannot be parsed as int.
    Use nullable Int64 dtype when storing in a DataFrame.
    """
    for ofv in (ofvs or []):
        if ofv.get('field_id') == SPECIMEN_COUNT_FIELD_ID:
            try:
                return int(ofv['value'])
            except (ValueError, KeyError, TypeError):
                return None
    return None

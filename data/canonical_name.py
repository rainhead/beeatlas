"""Canonical-name helper for Phase 76 / D-04.

Single source of truth for the 5-step name canonicalization rule used to
produce JOIN keys between checklist_data.species and ecdysis_data.occurrences.

D-04 algorithm (fixed order):
  1. Strip authority — drop ", <year>..." or " (<Author>..., <year>)" tail.
  2. Strip subgenus parens — "Genus (Subgenus) species" -> "Genus species".
  3. Strip infraspecific markers — ssp./var./aff./cf./nr. + everything after;
     then fold trinomials to binomial (keep first 2 tokens).
  4. Lowercase.
  5. Collapse whitespace to single space + trim.

D-04 step 3 LOCKS _INFRA_MARKERS to EXACTLY 5 markers. Do NOT add any other
marker without a CONTEXT.md amendment.

Imported by Phase 76 plans 03/05/06 and Phase 77 species aggregation.
"""

import re

# Step 1 — strip authority. Two narrow patterns:
#   (a) ",<year>..." (e.g., "Andrena fulva, 1766" or "Andrena fulva Müller, 1766")
#   (b) "(<Author>..., <year>)" trailing (e.g., "Andrena fulva (Müller, 1766)")
# The paren branch REQUIRES a "<comma><4-digit-year>" inside the parens so that
# subgenus parens like "(Dialictus)" — which lack a year — are NOT consumed
# (PITFALLS.md #3). Anchored to "\s*$" so only TRAILING parens match.
_AUTHORITY_RE = re.compile(
    r"\s*(?:,\s*\d{4}.*|\(\s*[A-ZÄÖÜÉÈ][^)]*,\s*\d{4}[^)]*\).*)\s*$"
)

# Step 2 — strip subgenus parens: "(Initial-Cap-Word)" between binomial tokens.
# Authority parens are already gone after step 1, so anything paren-wrapped here
# is a subgenus. Replaced with a single space so adjacent tokens stay split.
_SUBGENUS_RE = re.compile(r"\s*\(\s*[A-Z][A-Za-zæ\-]+\s*\)\s*")

# Step 3 — infraspecific markers. D-04 LOCKS this list to EXACTLY 5 markers.
# DO NOT add any other marker without a CONTEXT.md amendment.
_INFRA_MARKERS = ("ssp.", "var.", "aff.", "cf.", "nr.")


def canonicalize(name: str | None) -> str | None:
    """Apply the D-04 5-step canonicalization.

    Returns a lowercase single-spaced binomial (or genus-only for higher-rank
    inputs / aff./cf./nr. tokens), or None for None / empty / whitespace input.
    Idempotent: canonicalize(canonicalize(x)) == canonicalize(x).
    """
    if name is None:
        return None
    s = name.strip()
    if not s:
        return None

    # Step 1: strip authority (trailing ", <year>" or " (<Author>..., <year>)").
    s = _AUTHORITY_RE.sub("", s)

    # Step 2: strip subgenus parens (replace with single space to preserve token split).
    s = _SUBGENUS_RE.sub(" ", s)

    # Step 3: strip infraspecific markers, then fold trinomials to binomial.
    tokens = s.split()
    cleaned: list[str] = []
    for tok in tokens:
        if tok.lower() in _INFRA_MARKERS:
            break
        cleaned.append(tok)
    if len(cleaned) > 2:
        cleaned = cleaned[:2]

    # Steps 4 + 5: lowercase + collapse whitespace via " ".join.
    out = " ".join(t.lower() for t in cleaned)
    return out or None

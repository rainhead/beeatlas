"""Canonical domain functions for the BeeAtlas Python pipeline.

This module provides shared utilities used across the data pipeline steps.
"""

import re
import unicodedata


def slugify(value: str) -> str:
    """Convert a human name or place name to a URL-safe ASCII slug.

    This is the canonical slug function for the Python pipeline. Callers:
    feeds.py (collector/genus feed filenames) and species_export.py (species
    page slug column). The output is the Phase 78 D-01 byte-for-byte invariant:
    URL-safe ASCII, path-traversal-safe (no '/', no '.', no non-[a-z0-9-] chars).

    Examples:
        slugify("Jane Smith")  -> "jane-smith"
        slugify("Müller")      -> "muller"
        slugify("")            -> "unknown"
    """
    # Transliterate accented characters to ASCII equivalents
    value = unicodedata.normalize('NFKD', value)
    value = value.encode('ascii', 'ignore').decode('ascii')
    value = value.lower()
    # Spaces, underscores, dots, commas -> hyphen
    value = re.sub(r'[\s_.,]+', '-', value)
    # Strip remaining non-alphanumeric-hyphen characters (including / and .)
    value = re.sub(r'[^a-z0-9-]', '', value)
    # Collapse runs of hyphens
    value = re.sub(r'-+', '-', value)
    return value.strip('-') or 'unknown'

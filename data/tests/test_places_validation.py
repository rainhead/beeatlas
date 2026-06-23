"""Tests for places_validation.py — pass/fail boundary for each validation rule.

Covers:
    PLC-03: slug format, duplicate slugs, WKT validity, WGS84 coordinate bounds
    Phase 160 (D-03): overlapping polygons now LOAD (the ST_Overlaps rejection
    was removed in favor of the many-to-many occurrence_places membership model).
"""

import pytest
from pathlib import Path
from places_validation import validate_places


_VALID_PLACE = {
    "slug": "test-place",
    "name": "Test Place",
    "land_owner": "DNR",
    "geometry_wkt": "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))",
    "permits": [{"issuing_authority": "WDFW", "type": "project-level"}],
}


def write_toml(tmp_path: Path, places: list[dict]) -> Path:
    """Write a minimal TOML file with the given places list.

    Serializes each place dict as a [[places]] TOML array-of-tables entry.
    Returns the Path of the written file.
    """
    lines = []
    for p in places:
        lines.append("[[places]]")
        lines.append(f'slug = {p["slug"]!r}')
        lines.append(f'name = {p["name"]!r}')
        lines.append(f'land_owner = {p["land_owner"]!r}')
        lines.append(f'geometry_wkt = {p["geometry_wkt"]!r}')
        permit_strs = []
        for permit in p["permits"]:
            kv = ", ".join(f'{k} = {v!r}' for k, v in permit.items())
            permit_strs.append(f"{{{kv}}}")
        lines.append(f'permits = [{", ".join(permit_strs)}]')
        lines.append("")
    path = tmp_path / "places.toml"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def test_valid_places_pass(tmp_path):
    """A well-formed single place entry must not raise."""
    path = write_toml(tmp_path, [_VALID_PLACE])
    validate_places(path)  # must NOT raise


def test_invalid_slug_chars(tmp_path):
    """Slug with uppercase letters and special chars raises ValueError."""
    place = {**_VALID_PLACE, "slug": "Test Place!"}
    path = write_toml(tmp_path, [place])
    with pytest.raises(ValueError, match="invalid characters"):
        validate_places(path)


def test_duplicate_slug(tmp_path):
    """Two places sharing the same slug raises ValueError."""
    place_a = {**_VALID_PLACE, "slug": "rattlesnake-ledge"}
    place_b = {
        **_VALID_PLACE,
        "slug": "rattlesnake-ledge",
        "geometry_wkt": (
            "POLYGON((-122.0 48.0, -121.9 48.0, -121.9 48.1, -122.0 48.1, -122.0 48.0))"
        ),
    }
    path = write_toml(tmp_path, [place_a, place_b])
    with pytest.raises(ValueError, match="duplicate slug"):
        validate_places(path)


def test_invalid_wkt(tmp_path):
    """A geometry_wkt that is not valid WKT raises ValueError."""
    place = {**_VALID_PLACE, "geometry_wkt": "NOT VALID WKT AT ALL"}
    path = write_toml(tmp_path, [place])
    with pytest.raises(ValueError, match="invalid geometry"):
        validate_places(path)


def test_non_wgs84_coords(tmp_path):
    """State-plane coordinates (far outside WGS84 bounds) raise ValueError."""
    place = {
        **_VALID_PLACE,
        "geometry_wkt": (
            "POLYGON((1234567 890123, 1234667 890123, "
            "1234667 890223, 1234567 890223, 1234567 890123))"
        ),
    }
    path = write_toml(tmp_path, [place])
    with pytest.raises(ValueError, match="WGS84"):
        validate_places(path)


def test_permit_missing_issuing_authority(tmp_path):
    """A permit entry without issuing_authority raises ValueError."""
    place = {**_VALID_PLACE, "permits": [{"type": "project-level"}]}
    path = write_toml(tmp_path, [place])
    with pytest.raises(ValueError, match="permit missing required field 'issuing_authority'"):
        validate_places(path)


def test_permit_missing_type(tmp_path):
    """A permit entry without type raises ValueError."""
    place = {**_VALID_PLACE, "permits": [{"issuing_authority": "WDFW"}]}
    path = write_toml(tmp_path, [place])
    with pytest.raises(ValueError, match="permit missing required field 'type'"):
        validate_places(path)


def test_empty_permits_list_passes(tmp_path):
    """A place with permits = [] does not raise."""
    place = {**_VALID_PLACE, "permits": []}
    path = write_toml(tmp_path, [place])
    validate_places(path)  # must NOT raise


def test_place_without_permits_key_passes(tmp_path):
    """A place that omits the permits key entirely does not raise."""
    # Write TOML manually to omit the permits key
    toml_content = (
        "[[places]]\n"
        f'slug = "test-place"\n'
        f'name = "Test Place"\n'
        f'land_owner = "DNR"\n'
        f'geometry_wkt = "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))"\n'
    )
    path = tmp_path / "places.toml"
    path.write_text(toml_content, encoding="utf-8")
    validate_places(path)  # must NOT raise


def test_overlapping_polygons(tmp_path):
    """Overlapping polygons LOAD (no raise) — the many-to-many model (D-03/SC-2).

    Phase 160 removed the ST_Overlaps rejection from places_validation.py: an
    occurrence may belong to every place its coordinate falls within, so
    partially-overlapping place polygons are now legal. This test asserts
    validate_places returns None (no raise) for two overlapping polygons.

    RED-by-design until 160-02 removes the ST_Overlaps guard
    (places_validation.py ~lines 109-133). The live guard still raises today.
    """
    # Place A: lon -121.0..-120.9, lat 47.0..47.1
    place_a = {
        **_VALID_PLACE,
        "slug": "place-a",
        "name": "Place A",
        "geometry_wkt": (
            "POLYGON((-121.0 47.0, -120.9 47.0, -120.9 47.1, -121.0 47.1, -121.0 47.0))"
        ),
    }
    # Place B: lon -120.95..-120.85, lat 47.0..47.1 — overlaps Place A at -120.95..-120.9
    place_b = {
        **_VALID_PLACE,
        "slug": "place-b",
        "name": "Place B",
        "geometry_wkt": (
            "POLYGON((-120.95 47.0, -120.85 47.0, -120.85 47.1, -120.95 47.1, -120.95 47.0))"
        ),
    }
    path = write_toml(tmp_path, [place_a, place_b])
    assert validate_places(path) is None  # overlaps now LOAD (no raise)

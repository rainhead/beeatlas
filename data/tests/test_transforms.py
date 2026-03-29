"""Unit tests for pipeline transformation functions.

Tests _transform() from inaturalist_pipeline and _extract_inat_id() from ecdysis_pipeline.
These are pure functions with no side effects or DB access.
"""

from inaturalist_pipeline import _transform
from ecdysis_pipeline import _extract_inat_id


# ---------------------------------------------------------------------------
# _transform() tests
# ---------------------------------------------------------------------------

def test_transform_with_geojson():
    """Happy path: geojson coordinates are extracted into longitude/latitude."""
    item = {"geojson": {"coordinates": [-120.5, 47.5]}, "project_ids": [101], "uuid": "abc"}
    result = _transform(item.copy())
    assert result["longitude"] == -120.5
    assert result["latitude"] == 47.5
    assert result["is_deleted"] is False
    assert result["observation_projects"] == [{"observation_uuid": "abc", "project_id": 101}]
    assert "geojson" not in result
    assert "project_ids" not in result


def test_transform_null_geojson():
    """Obscured/private observations have geojson: null — no lon/lat in result."""
    item = {"geojson": None, "project_ids": [], "uuid": "xyz"}
    result = _transform(item.copy())
    assert "longitude" not in result
    assert "latitude" not in result
    assert result["is_deleted"] is False
    assert result["observation_projects"] == []


def test_transform_missing_geojson():
    """geojson key absent entirely — no lon/lat in result, empty projects."""
    item = {"project_ids": None, "uuid": "def"}
    result = _transform(item.copy())
    assert "longitude" not in result
    assert "latitude" not in result
    assert result["observation_projects"] == []


# ---------------------------------------------------------------------------
# _extract_inat_id() tests
# ---------------------------------------------------------------------------

def test_extract_valid_inat_link():
    """HTML with valid iNaturalist anchor returns integer observation ID."""
    html = (
        '<div id="association-div">'
        '<a target="_blank" href="https://www.inaturalist.org/observations/163069968">'
        'View on iNaturalist'
        '</a>'
        '</div>'
    )
    assert _extract_inat_id(html) == 163069968


def test_extract_no_association_div():
    """HTML with no #association-div anchor returns None."""
    html = '<div id="other-div"><a href="/foo">link</a></div>'
    assert _extract_inat_id(html) is None


def test_extract_none_html():
    """None input (e.g. network error) returns None."""
    assert _extract_inat_id(None) is None


def test_extract_malformed_href():
    """Anchor with non-integer at end of href returns None."""
    html = (
        '<div id="association-div">'
        '<a target="_blank" href="https://inaturalist.org/observations/abc">'
        'link'
        '</a>'
        '</div>'
    )
    assert _extract_inat_id(html) is None

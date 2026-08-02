"""Unit tests for terrain_tiles.py (beeatlas-8py).

Tests cover:
    tile_range — XYZ tile coverage of a bbox, including the north/south y flip
        (north latitude maps to the SMALLER y) and antimeridian/pole clamping.
    tiles_for_bbox — whole-pyramid enumeration, shallowest zoom first.
    bbox_from_geojson — reads the same region file build-basemap.sh clips with,
        for any geometry nesting depth.
    quantize_terrarium — the elevation round-trip. This is the test that matters:
        the archive is only shippable because sub-metre precision is discarded,
        so the error bound is a CONTRACT, not an implementation detail.

Run:
    cd data && uv run pytest tests/test_terrain_tiles.py -x
"""

import io
import json
import math
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from terrain_tiles import (
    ATTRIBUTION,
    DEFAULT_MAXZOOM,
    TILE_SIZE,
    BBox,
    bbox_from_geojson,
    quantize_terrarium,
    tile_range,
    tiles_for_bbox,
)

WA = BBox(-124.7346, 45.5663, -116.8788, 48.9925)

# Terrarium's own encoding granularity: the blue channel is 1/256 m, so a value
# has already been rounded to this before quantization runs.
TERRARIUM_STEP = 1.0 / 256


# ---------------------------------------------------------------------------
# tile math
# ---------------------------------------------------------------------------

def test_zoom_zero_is_one_tile():
    assert tile_range(WA, 0) == (0, 0, 0, 0)


def test_north_maps_to_smaller_y():
    """The XYZ y axis runs south as it increases. Getting this backwards yields a
    pyramid covering the wrong latitudes, which looks like 'the DEM is offset'."""
    x0, y0, x1, y1 = tile_range(WA, 10)
    assert y0 < y1, "north edge must produce the smaller y"
    assert x0 < x1


def test_tile_range_matches_slippy_formula():
    z = 11
    n = 2 ** z
    expected_x0 = int((WA.west + 180.0) / 360.0 * n)
    expected_y0 = int((1.0 - math.asinh(math.tan(math.radians(WA.north))) / math.pi) / 2.0 * n)
    x0, y0, _, _ = tile_range(WA, z)
    assert (x0, y0) == (expected_x0, expected_y0)


def test_tile_indices_stay_in_range_at_extremes():
    whole = BBox(-180.0, -89.9, 180.0, 89.9)
    for z in (0, 1, 5, 11):
        x0, y0, x1, y1 = tile_range(whole, z)
        assert 0 <= x0 <= x1 <= 2 ** z - 1
        assert 0 <= y0 <= y1 <= 2 ** z - 1


def test_tiles_for_bbox_is_shallowest_first_and_complete():
    tiles = tiles_for_bbox(WA, 0, 3)
    assert [t[0] for t in tiles] == sorted(t[0] for t in tiles)
    per_zoom = {}
    for z, _, _ in tiles:
        per_zoom[z] = per_zoom.get(z, 0) + 1
    for z in range(4):
        x0, y0, x1, y1 = tile_range(WA, z)
        assert per_zoom[z] == (x1 - x0 + 1) * (y1 - y0 + 1)


def test_default_maxzoom_is_paired_with_the_style_fade():
    """A tripwire, not a tautology: DEFAULT_MAXZOOM is meaningful only alongside
    TERRAIN_FADE_END in src/basemap-style.ts. If someone raises it here, this test
    is where they are reminded the other half exists."""
    assert DEFAULT_MAXZOOM == 11
    assert TILE_SIZE == 256


# ---------------------------------------------------------------------------
# region file
# ---------------------------------------------------------------------------

def test_bbox_from_geojson_handles_nested_geometry(tmp_path: Path):
    fc = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {},
            "geometry": {
                "type": "MultiPolygon",
                "coordinates": [[[[-122.0, 47.0], [-121.0, 47.0], [-121.0, 48.0], [-122.0, 47.0]]]],
            },
        }],
    }
    p = tmp_path / "region.geojson"
    p.write_text(json.dumps(fc))
    assert bbox_from_geojson(p) == BBox(-122.0, 47.0, -121.0, 48.0)


def test_bbox_from_geojson_rejects_empty(tmp_path: Path):
    p = tmp_path / "empty.geojson"
    p.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
    with pytest.raises(ValueError, match="no coordinates"):
        bbox_from_geojson(p)


def test_the_real_region_file_covers_washington():
    bbox = bbox_from_geojson(Path(__file__).parent.parent / "basemap" / "wa.geojson")
    assert bbox.west < -124.0 and bbox.east > -117.5
    assert bbox.south < 46.0 and bbox.north > 48.9


# ---------------------------------------------------------------------------
# quantization — the elevation contract
# ---------------------------------------------------------------------------

def _terrarium_png(elevations: np.ndarray) -> bytes:
    """Encode metres-above-sea-level as a terrarium PNG, the AWS bucket's format."""
    raw = np.clip(np.rint((elevations + 32768) * 256), 0, 256 * 65536 - 1).astype(np.uint32)
    px = np.zeros(elevations.shape + (3,), dtype=np.uint8)
    px[:, :, 0] = (raw >> 16) & 0xFF
    px[:, :, 1] = (raw >> 8) & 0xFF
    px[:, :, 2] = raw & 0xFF
    buf = io.BytesIO()
    Image.fromarray(px, mode="RGB").save(buf, "PNG")
    return buf.getvalue()


def _decode(tile: bytes) -> np.ndarray:
    px = np.asarray(Image.open(io.BytesIO(tile)).convert("RGB"), dtype=np.float64)
    return px[:, :, 0] * 256.0 + px[:, :, 1] + px[:, :, 2] / 256.0 - 32768.0


@pytest.fixture
def terrain() -> np.ndarray:
    """A patch spanning sea level to above Rainier, with sub-metre detail."""
    rng = np.random.default_rng(11)
    base = np.linspace(0, 4392, 64 * 64).reshape(64, 64)
    return base + rng.uniform(0, 1, size=(64, 64))


@pytest.mark.parametrize("fmt", ["webp", "png"])
def test_quantized_elevation_stays_within_half_a_metre(terrain, fmt):
    out = quantize_terrarium(_terrarium_png(terrain), 1, fmt)
    err = np.abs(_decode(out) - terrain)
    # Half a quantum is the bound for correct ROUNDING; truncation would show up
    # here as a bound of ~1.0 and a strictly positive mean error. TERRARIUM_STEP
    # is added because the fixture's own terrarium encoding already rounded the
    # input to 1/256 m before quantize_terrarium ever saw it, and the two errors
    # stack. Measured on real z11 tiles the observed worst case was 0.496 m.
    assert err.max() <= 0.5 + TERRARIUM_STEP
    assert abs(np.mean(_decode(out) - terrain)) < 0.05, "rounding must not bias elevations"


@pytest.mark.parametrize("fmt", ["webp", "png"])
def test_quantization_is_lossless_for_the_chosen_format(terrain, fmt):
    """WebP here must be LOSSLESS — a quality-based encode would invent terrain.
    Encoding the already-quantized pixels twice must be a fixed point."""
    once = quantize_terrarium(_terrarium_png(terrain), 1, fmt)
    twice = quantize_terrarium(once, 1, fmt)
    np.testing.assert_array_equal(_decode(once), _decode(twice))


def test_blue_channel_is_spent(terrain):
    px = np.asarray(Image.open(io.BytesIO(quantize_terrarium(_terrarium_png(terrain)))).convert("RGB"))
    assert (px[:, :, 2] == 0).all(), "the sub-metre channel is what buys the compression"


def test_coarser_quantum_widens_the_bound_proportionally(terrain):
    for quantum in (1, 2, 4):
        err = np.abs(_decode(quantize_terrarium(_terrarium_png(terrain), quantum)) - terrain)
        assert err.max() <= quantum / 2 + TERRARIUM_STEP


def test_sea_level_and_below_survive():
    """Terrarium's -32768 offset exists so bathymetry encodes; clipping at zero
    metres instead of zero RAW would turn every ocean pixel into a cliff."""
    depths = np.full((8, 8), -120.0)
    out = quantize_terrarium(_terrarium_png(depths))
    assert np.abs(_decode(out) - depths).max() <= 0.5 + TERRARIUM_STEP


def test_rejects_unknown_format(terrain):
    with pytest.raises(ValueError, match="unsupported tile format"):
        quantize_terrarium(_terrarium_png(terrain), 1, "jpeg")


def test_attribution_names_the_data_sources():
    """The DEM is not covered by the vector archive's OSM/Protomaps notice."""
    for source in ("SRTM", "3DEP", "Terrain Tiles"):
        assert source in ATTRIBUTION

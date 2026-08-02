"""Terrain (DEM) raster tile pyramid for the self-hosted basemap (beeatlas-8py).

Builds an MBTiles of `terrarium`-encoded elevation tiles for the basemap region,
which data/build-terrain-basemap.sh then converts to PMTiles. The tiles come from
the AWS Open Data "Terrain Tiles" bucket (the former Mapzen/Nextzen pyramid),
which serves a global z0-15 terrarium pyramid built from SRTM, USGS 3DEP/NED and
NOAA bathymetry.

MEASURED COST, because beeatlas-8py's "~20 MB" estimate was wrong by 3x and the
correction is the interesting part. WA z0-11 is 1,913 tiles. Straight from the
bucket that is 200 MB, of which z11 alone is 164 MB. Two LOSSLESS transforms take
it to 61 MB: rounding elevation to whole metres (200 -> 92 MB) and encoding
lossless WebP instead of PNG (92 -> 61 MB). The original estimate turns out to
describe a z0-10 pyramid, which is 21.9 MB — and z10 was rejected on looks: at
z12 its ridges smear and Rainier's drainages run together.

WHY THIS IS A SEPARATE ARCHIVE FROM THE VECTOR ONE. Different source (an S3 tile
pyramid, not a planet PMTiles we can range-request), different tile type (PNG,
not MVT), and a different lifecycle: OSM changes weekly, the ground does not. It
publishes independently and rolls back by removing one source and one layer.

MAXZOOM IS THE WHOLE COST STORY. The display fades the hillshade out by z13.5
(see src/basemap-style.ts), so the DEM only ever renders at zooms where a z11
pyramid is native or nearly so. Each extra zoom level roughly quadruples the tile
count, so this is what keeps the artifact at 61 MB rather than the ~1 GB a z13
pyramid over the same region would cost. Raising DEFAULT_MAXZOOM
without moving the fade buys nothing visible; moving the fade up without raising
this makes the map WORSE, not just softer — a z11 DEM overzoomed to z14 darkens
the map and makes trails harder to read. The two numbers move together or not at
all.

BBOX, NOT POLYGON. build-basemap.sh clips the vector planet with wa.geojson
because --region measured 18% smaller than --bbox. Here the polygon is only read
for its bounding box: Washington is close to rectangular, so what the bbox adds
is the Oregon and Idaho strips and one ocean corner — an estimated ~15%, or ~9 MB.
Buying that back needs a point-in-polygon pass that correctly KEEPS tiles the
border merely clips, which is real code and a real chance of punching a hole in
the DEM. Considered and declined when the maxzoom was chosen (beeatlas-8py); the
bbox is the whole region model here.

TILES ARE REQUANTIZED TO WHOLE METRES ON THE WAY IN, and this is not an
optimization detail — it is most of why the archive is shippable. Terrarium packs
elevation as R*256 + G + B/256 - 32768, so the blue channel carries 1/256 m. At a
z11 ground resolution of ~76 m/px that is pure noise, and being noise it is
exactly what PNG cannot compress: measured over a random 60-tile z11 sample, the
raw tiles average 119.8 KB and rounding to the nearest metre takes them to 44.8 KB
(37%), for a worst-case elevation error of 0.496 m. Rounding, not truncation —
truncation would bias every sample downward by up to a metre for nothing.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import requests
from PIL import Image

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

DEFAULT_MINZOOM = 0
# See the module docstring: this is paired with the fade in src/basemap-style.ts.
DEFAULT_MAXZOOM = 11
DEFAULT_WORKERS = 16

# Terrarium tiles are 256px. MapLibre's raster-dem default tileSize is 512, so
# the style MUST say 256 or every hillshade slope is computed at half the real
# ground resolution. Named here because this is where the fact lives.
TILE_SIZE = 256

# Attribution for the elevation data, carried into the basemap manifest and shown
# by MapLibre's attribution control. The vector archive's OSM/Protomaps notice
# does not cover this: it is a different dataset from a different source.
ATTRIBUTION = (
    "Elevation: <a href=\"https://registry.opendata.aws/terrain-tiles/\">Terrain Tiles</a> "
    "(NASA SRTM, USGS 3DEP, NOAA)"
)

# Elevation quantum, in metres. See the module docstring — 1 m is what makes the
# archive shippable, and is ~2 orders of magnitude finer than the ground sample
# distance at the zooms this pyramid is displayed at.
DEFAULT_QUANTUM_M = 1

# Lossless WebP, not PNG. Same pixels, ~64% of the bytes (measured on a random
# 50-tile z11 sample: 40.2 KB/tile PNG vs 25.8 KB/tile WebP at a 1 m quantum).
# Every browser the app supports decodes it, and PMTiles has a WebP tile type, so
# the only cost is that Apache must serve image/webp — which it does by default.
DEFAULT_FORMAT = "webp"

_RETRIES = 4
_TIMEOUT = 60


def quantize_terrarium(
    png: bytes,
    quantum_m: int = DEFAULT_QUANTUM_M,
    fmt: str = DEFAULT_FORMAT,
) -> bytes:
    """Re-encode a terrarium PNG with elevation rounded to `quantum_m` metres.

    Terrarium is `elevation = R*256 + G + B/256 - 32768`. Rounding to a whole
    metre zeroes B for every pixel, which is where the compression comes from: an
    incompressible noise channel becomes a constant one. The -32768 offset is
    never applied — rounding is affine, so it commutes with the offset, and
    staying in the raw 16-bit space avoids signed arithmetic entirely.

    `fmt` is 'webp' or 'png'. WebP is LOSSLESS here — never `quality`-based — for
    the obvious reason: these pixels are elevations, and a lossy codec would
    invent terrain. Lossless WebP is measurably ~64% the size of the equivalent
    PNG at the same quantum, which is the cheapest halving available.
    """
    image = Image.open(io.BytesIO(png)).convert("RGB")
    px = np.asarray(image, dtype=np.float64)
    raw = px[:, :, 0] * 256.0 + px[:, :, 1] + px[:, :, 2] / 256.0
    rounded = np.clip(np.rint(raw / quantum_m) * quantum_m, 0, 65535).astype(np.uint16)

    out = np.zeros(px.shape, dtype=np.uint8)
    out[:, :, 0] = (rounded >> 8) & 0xFF
    out[:, :, 1] = rounded & 0xFF
    # out[:, :, 2] stays 0 — the sub-metre channel is what we just spent.

    buf = io.BytesIO()
    if fmt == "webp":
        Image.fromarray(out, mode="RGB").save(buf, "WEBP", lossless=True, quality=100, method=6)
    elif fmt == "png":
        Image.fromarray(out, mode="RGB").save(buf, "PNG", optimize=True)
    else:
        raise ValueError(f"unsupported tile format: {fmt}")
    return buf.getvalue()


@dataclass(frozen=True)
class BBox:
    west: float
    south: float
    east: float
    north: float


def bbox_from_geojson(path: Path) -> BBox:
    """The bounding box of every coordinate in a GeoJSON file.

    Deliberately structure-agnostic (walks the parsed JSON for [lon, lat] pairs)
    so it reads the same region file build-basemap.sh clips with, whatever
    geometry type that file happens to hold.
    """
    def coords(node: object):
        if isinstance(node, dict):
            for value in node.values():
                yield from coords(value)
        elif isinstance(node, list):
            if len(node) >= 2 and all(isinstance(v, (int, float)) for v in node[:2]) \
                    and not any(isinstance(v, (list, dict)) for v in node):
                yield (float(node[0]), float(node[1]))
            else:
                for value in node:
                    yield from coords(value)

    points = list(coords(json.loads(path.read_text())))
    if not points:
        raise ValueError(f"no coordinates found in {path}")
    lons = [p[0] for p in points]
    lats = [p[1] for p in points]
    return BBox(min(lons), min(lats), max(lons), max(lats))


def tile_range(bbox: BBox, zoom: int) -> tuple[int, int, int, int]:
    """(x_min, y_min, x_max, y_max) of the XYZ tiles covering bbox at `zoom`.

    Inclusive on all four sides. y is XYZ order (0 at the north pole), which is
    what the tile URL wants; the MBTiles writer flips it to TMS.
    """
    n = 2 ** zoom

    def x_of(lon: float) -> int:
        return min(n - 1, max(0, int((lon + 180.0) / 360.0 * n)))

    def y_of(lat: float) -> int:
        lat = max(-85.0511, min(85.0511, lat))
        rad = math.radians(lat)
        frac = (1.0 - math.asinh(math.tan(rad)) / math.pi) / 2.0
        return min(n - 1, max(0, int(frac * n)))

    # North latitude gives the SMALLER y in XYZ order — the flip is here, once.
    return x_of(bbox.west), y_of(bbox.north), x_of(bbox.east), y_of(bbox.south)


def tiles_for_bbox(bbox: BBox, minzoom: int, maxzoom: int) -> list[tuple[int, int, int]]:
    """Every (z, x, y) in the pyramid, shallowest zoom first."""
    out: list[tuple[int, int, int]] = []
    for z in range(minzoom, maxzoom + 1):
        x0, y0, x1, y1 = tile_range(bbox, z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                out.append((z, x, y))
    return out


def _fetch(
    session: requests.Session,
    tile: tuple[int, int, int],
    quantum_m: int,
    fmt: str,
) -> tuple[tuple[int, int, int], bytes]:
    """Download one tile and requantize it. Runs on a pool thread — the PNG
    decode/encode is the expensive half and both PIL and numpy drop the GIL."""
    z, x, y = tile
    url = TILE_URL.format(z=z, x=x, y=y)
    last: Exception | None = None
    for attempt in range(_RETRIES):
        try:
            resp = session.get(url, timeout=_TIMEOUT)
            if resp.status_code == 200:
                return tile, quantize_terrarium(resp.content, quantum_m, fmt)
            # A 404 is not "empty ocean" — the pyramid is global and every tile in
            # range exists. Treat it as an error so a hole in the DEM fails the
            # build rather than shipping a hillshade with a rectangular gap.
            last = RuntimeError(f"{url} -> HTTP {resp.status_code}")
        except requests.RequestException as err:  # transient: DNS, reset, timeout
            last = err
    raise RuntimeError(f"failed after {_RETRIES} attempts: {last}")


def _init_mbtiles(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        CREATE TABLE metadata (name TEXT, value TEXT);
        CREATE TABLE tiles (
            zoom_level INTEGER,
            tile_column INTEGER,
            tile_row INTEGER,
            tile_data BLOB
        );
        CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);
        """
    )


def _write_metadata(conn: sqlite3.Connection, bbox: BBox, minzoom: int, maxzoom: int,
                    fmt: str = DEFAULT_FORMAT) -> None:
    center_lon = (bbox.west + bbox.east) / 2
    center_lat = (bbox.south + bbox.north) / 2
    rows = {
        "name": "beeatlas-terrain",
        "format": fmt,  # read by `pmtiles convert` to pick the tile type
        "type": "baselayer",
        "version": "1",
        "description": "Terrarium-encoded elevation tiles for the Bee Atlas basemap",
        "attribution": ATTRIBUTION,
        "bounds": f"{bbox.west},{bbox.south},{bbox.east},{bbox.north}",
        "center": f"{center_lon},{center_lat},{minzoom}",
        "minzoom": str(minzoom),
        "maxzoom": str(maxzoom),
    }
    conn.executemany("INSERT INTO metadata (name, value) VALUES (?, ?)", rows.items())


def build_mbtiles(
    out_path: Path,
    bbox: BBox,
    minzoom: int = DEFAULT_MINZOOM,
    maxzoom: int = DEFAULT_MAXZOOM,
    workers: int = DEFAULT_WORKERS,
    quantum_m: int = DEFAULT_QUANTUM_M,
    fmt: str = DEFAULT_FORMAT,
    progress: bool = True,
) -> int:
    """Download the pyramid into a fresh MBTiles at `out_path`. Returns tile count.

    Downloads run on a thread pool; every sqlite write happens on this thread,
    because a connection is not safe to share across threads and the writes are
    not the bottleneck.
    """
    tiles = tiles_for_bbox(bbox, minzoom, maxzoom)
    out_path.unlink(missing_ok=True)
    conn = sqlite3.connect(out_path)
    try:
        _init_mbtiles(conn)
        _write_metadata(conn, bbox, minzoom, maxzoom, fmt)
        done = 0
        with requests.Session() as session, ThreadPoolExecutor(max_workers=workers) as pool:
            fetch = lambda t: _fetch(session, t, quantum_m, fmt)  # noqa: E731
            for (z, x, y), body in pool.map(fetch, tiles):
                conn.execute(
                    "INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)",
                    (z, x, (2 ** z - 1) - y, body),  # XYZ y -> TMS row
                )
                done += 1
                if progress and (done % 200 == 0 or done == len(tiles)):
                    print(f"  {done}/{len(tiles)} tiles", file=sys.stderr, flush=True)
        conn.commit()
    finally:
        conn.close()
    return len(tiles)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--region", type=Path, required=True,
                        help="GeoJSON whose bounding box bounds the pyramid")
    parser.add_argument("--out", type=Path, required=True, help="MBTiles to write")
    parser.add_argument("--minzoom", type=int, default=DEFAULT_MINZOOM)
    parser.add_argument("--maxzoom", type=int, default=DEFAULT_MAXZOOM)
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--quantum-m", type=int, default=DEFAULT_QUANTUM_M,
                        help="elevation quantum in metres (see module docstring)")
    parser.add_argument("--format", default=DEFAULT_FORMAT, choices=("webp", "png"),
                        dest="fmt", help="tile encoding (lossless either way)")
    parser.add_argument("--count-only", action="store_true",
                        help="Print the tile count and exit without downloading")
    args = parser.parse_args(argv)

    bbox = bbox_from_geojson(args.region)
    if args.count_only:
        for z in range(args.minzoom, args.maxzoom + 1):
            x0, y0, x1, y1 = tile_range(bbox, z)
            print(f"z{z}: {(x1 - x0 + 1) * (y1 - y0 + 1)} tiles")
        print(f"total: {len(tiles_for_bbox(bbox, args.minzoom, args.maxzoom))}")
        return 0

    print(f"Region bbox: {bbox.west:.4f},{bbox.south:.4f},{bbox.east:.4f},{bbox.north:.4f}",
          file=sys.stderr)
    n = build_mbtiles(args.out, bbox, args.minzoom, args.maxzoom, args.workers, args.quantum_m, args.fmt)
    size = args.out.stat().st_size
    print(f"Wrote {args.out} ({n} tiles, {size / 1e6:.1f} MB)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

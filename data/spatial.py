"""
Shared spatial join utility for both ecdysis and iNat pipelines.

Provides:
    add_region_columns(df, counties_gdf, ecoregions_gdf) -> pd.DataFrame

Both callers are responsible for loading boundary GeoDataFrames
(already reprojected to EPSG:4326) and passing them as arguments.
"""

from __future__ import annotations

import geopandas as gpd
import pandas as pd


# Projected CRS for sjoin_nearest — avoids geographic CRS inaccuracy warning.
# UTM zone 10N is appropriate for Washington state.
_PROJ_CRS = "EPSG:32610"


def _detect_coord_columns(df: pd.DataFrame) -> tuple[str, str]:
    """Return (lon_col, lat_col) by inspecting df.columns.

    Detection order (matches PLAN.md spec):
      1. 'longitude' / 'latitude'    — ecdysis post-rename convention
      2. 'lon' / 'lat'               — iNat convention
      3. 'decimalLongitude' / 'decimalLatitude'  — ecdysis pre-rename (raw CSV)

    Raises ValueError if none found.
    """
    if "longitude" in df.columns:
        return "longitude", "latitude"
    if "lon" in df.columns:
        return "lon", "lat"
    if "decimalLongitude" in df.columns:
        return "decimalLongitude", "decimalLatitude"
    raise ValueError(
        "DataFrame must have 'longitude'/'latitude', 'lon'/'lat', or "
        "'decimalLongitude'/'decimalLatitude' columns. "
        f"Found: {list(df.columns)}"
    )


def _two_step_join(
    pts: gpd.GeoDataFrame,
    boundary_gdf: gpd.GeoDataFrame,
    name_col: str,
) -> pd.Series:
    """Run a two-step spatial join (within + sjoin_nearest fallback).

    Args:
        pts: GeoDataFrame of points in EPSG:4326 (index matches original df).
        boundary_gdf: Polygon GDF in EPSG:4326 with `name_col` column.
        name_col: Column name in boundary_gdf to extract (e.g. 'NAME', 'NA_L3NAME').

    Returns:
        pd.Series aligned to pts.index with string values from name_col.
    """
    cols = [name_col, "geometry"]

    # Step 1: within join (accurate for EPSG:4326 data)
    joined = gpd.sjoin(pts, boundary_gdf[cols], how="left", predicate="within")
    # Deduplicate: a point on a shared boundary may match multiple polygons
    joined = joined[~joined.index.duplicated(keep="first")]

    # Step 2: nearest fallback for rows where within join found no match
    null_mask = joined[name_col].isna()
    if null_mask.any():
        # Project to metric CRS to avoid geographic CRS warning from sjoin_nearest
        null_pts_proj = pts[null_mask].to_crs(_PROJ_CRS)
        boundary_proj = boundary_gdf[cols].to_crs(_PROJ_CRS)
        nearest = gpd.sjoin_nearest(null_pts_proj, boundary_proj, how="left")
        nearest = nearest[~nearest.index.duplicated(keep="first")]
        joined.loc[null_mask, name_col] = nearest[name_col].values

    return joined[name_col]


def add_region_columns(
    df: pd.DataFrame,
    counties_gdf: gpd.GeoDataFrame,
    ecoregions_gdf: gpd.GeoDataFrame,
) -> pd.DataFrame:
    """Add county and ecoregion_l3 columns to df using spatial join.

    Both counties_gdf and ecoregions_gdf MUST already be in EPSG:4326.
    df must have 'longitude'/'latitude' OR 'lon'/'lat' OR
    'decimalLongitude'/'decimalLatitude' coordinate columns.

    Returns df.copy() with new 'county' (pd.StringDtype) and
    'ecoregion_l3' (pd.StringDtype) columns. Points that fall outside
    polygon boundaries get the nearest polygon value via sjoin_nearest
    (no nulls in output).

    Args:
        df: Input DataFrame with coordinate columns.
        counties_gdf: WA county polygons with 'NAME' column, EPSG:4326.
        ecoregions_gdf: EPA Level III ecoregion polygons with 'NA_L3NAME'
            column, EPSG:4326.

    Returns:
        Copy of df with 'county' and 'ecoregion_l3' columns added.
    """
    lon_col, lat_col = _detect_coord_columns(df)

    # Build a GeoDataFrame of points in EPSG:4326
    pts = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df[lon_col], df[lat_col]),
        crs="EPSG:4326",
    )

    # Join counties (NAME) and ecoregions (NA_L3NAME)
    county_values = _two_step_join(pts, counties_gdf, "NAME")
    ecoregion_values = _two_step_join(pts, ecoregions_gdf, "NA_L3NAME")

    result = df.copy()
    result["county"] = pd.array(county_values.values, dtype=pd.StringDtype())
    result["ecoregion_l3"] = pd.array(ecoregion_values.values, dtype=pd.StringDtype())

    return result

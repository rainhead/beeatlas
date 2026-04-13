"""Generate Atom feed of recent determinations from beeatlas.duckdb.

Produces:
  frontend/public/data/feeds/determinations.xml
  frontend/public/data/feeds/collector-{slug}.xml  (one per unique collector)
  frontend/public/data/feeds/genus-{slug}.xml       (one per unique genus)
  frontend/public/data/feeds/county-{slug}.xml      (one per WA county)
  frontend/public/data/feeds/ecoregion-{slug}.xml   (one per WA ecoregion)
  frontend/public/data/feeds/index.json             (machine-readable feed index)

Covers all determinations whose modified timestamp falls within the last 90 days,
with blank scientific_name / identified_by rows excluded.

Usage:
    uv run --project data python data/feeds.py
"""

import datetime
import json
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

import duckdb

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'frontend' / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))

ATOM_NS = 'http://www.w3.org/2005/Atom'
ET.register_namespace('', ATOM_NS)

_FEED_TITLE = 'Washington Bee Atlas \u2014 All Recent Determinations'
_FEED_ID = 'https://beeatlas.org/data/feeds/determinations.xml'

_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
    ORDER BY i.modified DESC
"""


def _atom(tag: str) -> str:
    """Return Clark-notation tag for Atom namespace."""
    return f'{{{ATOM_NS}}}{tag}'


def _build_entry(feed: ET.Element, row: tuple) -> None:
    """Append one Atom <entry> element to feed for the given row."""
    modified, taxon_name, determiner, specimen_uuid, ecdysis_id, collector, coll_date = row
    utc_ts = modified.astimezone(datetime.timezone.utc).isoformat()
    ecdysis_url = f'https://ecdysis.org/collections/individual/index.php?occid={ecdysis_id}'

    entry = ET.SubElement(feed, _atom('entry'))

    id_el = ET.SubElement(entry, _atom('id'))
    # Use specimen occurrence_id UUID as globally-unique Atom entry ID (RFC 4287 §4.1.2)
    id_el.text = f'urn:ecdysis:{specimen_uuid}'

    title_el = ET.SubElement(entry, _atom('title'))
    title_el.text = f'{taxon_name} \u2014 determined by {determiner}'

    updated_el = ET.SubElement(entry, _atom('updated'))
    updated_el.text = utc_ts

    link_el = ET.SubElement(entry, _atom('link'))
    link_el.set('href', ecdysis_url)

    summary_el = ET.SubElement(entry, _atom('summary'))
    summary_el.set('type', 'text')
    summary_el.text = (
        f'Collected by {collector} on {coll_date}. '
        f'Specimen: ecdysis:{ecdysis_id}'
    )


def write_determinations_feed(con: duckdb.DuckDBPyConnection, out_dir: Path) -> None:
    """Query recent determinations and write Atom XML to out_dir/feeds/determinations.xml.

    If no rows match the 90-day window, prints a skip message and returns without
    creating any file.
    """
    rows = con.execute(_QUERY).fetchall()

    if not rows:
        print("  feeds: no recent determinations in 90-day window — skipping")  # noqa: T201
        return

    most_recent_ts = rows[0][0].astimezone(datetime.timezone.utc)

    feed = ET.Element(_atom('feed'))
    feed.set('xml:lang', 'en')

    ET.SubElement(feed, _atom('title')).text = _FEED_TITLE
    ET.SubElement(feed, _atom('id')).text = _FEED_ID

    link_el = ET.SubElement(feed, _atom('link'))
    link_el.set('rel', 'self')
    link_el.set('href', _FEED_ID)

    ET.SubElement(feed, _atom('updated')).text = most_recent_ts.isoformat()

    for row in rows:
        _build_entry(feed, row)

    tree = ET.ElementTree(feed)
    ET.indent(tree, space='  ')

    out_path = out_dir / 'feeds' / 'determinations.xml'
    out_path.parent.mkdir(parents=True, exist_ok=True)

    result = ET.tostring(feed, xml_declaration=True, encoding='unicode')
    out_path.write_text(result, encoding='utf-8')

    print(  # noqa: T201
        f"  feeds/determinations.xml: {len(rows):,} entries, "
        f"{out_path.stat().st_size:,} bytes"
    )


def _slugify(value: str) -> str:
    """Convert a human name or place name to a URL-safe ASCII slug.

    Strips all characters that are not [a-z0-9-], preventing path traversal
    (../) and special characters in filenames.
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


_UTC = datetime.timezone.utc

_TITLE_TEMPLATES = {
    'collector': 'Washington Bee Atlas \u2014 Collector: {value}',
    'genus':     'Washington Bee Atlas \u2014 Genus: {value}',
    'county':    'Washington Bee Atlas \u2014 County: {value}',
    'ecoregion': 'Washington Bee Atlas \u2014 Ecoregion: {value}',
}

_COLLECTOR_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND o.recorded_by = ?
    ORDER BY i.modified DESC
"""

_GENUS_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND o.genus = ?
    ORDER BY i.modified DESC
"""

_COUNTY_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    JOIN geographies.us_counties c
        ON c.state_fips = '53'
       AND ST_Within(
               ST_Point(CAST(o.decimal_longitude AS DOUBLE),
                        CAST(o.decimal_latitude AS DOUBLE)),
               c.geom
           )
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND o.decimal_latitude  IS NOT NULL AND o.decimal_latitude  != ''
      AND o.decimal_longitude IS NOT NULL AND o.decimal_longitude != ''
      AND c.name = ?
    ORDER BY i.modified DESC
"""

_ECOREGION_QUERY = """
    SELECT
        i.modified,
        NULLIF(i.scientific_name, '')  AS taxon_name,
        NULLIF(i.identified_by, '')    AS determiner,
        o.occurrence_id                AS specimen_occurrence_id,
        o.id                           AS ecdysis_id,
        o.recorded_by                  AS collector,
        o.event_date                   AS collection_date
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    JOIN geographies.ecoregions e
        ON ST_Intersects(
               e.geom,
               (SELECT geom
                FROM geographies.us_states WHERE abbreviation = 'WA')
           )
       AND ST_Within(
               ST_Point(CAST(o.decimal_longitude AS DOUBLE),
                        CAST(o.decimal_latitude AS DOUBLE)),
               e.geom
           )
    WHERE i.modified >= NOW() - INTERVAL '90 days'
      AND i.scientific_name != ''
      AND i.identified_by   != ''
      AND o.decimal_latitude  IS NOT NULL AND o.decimal_latitude  != ''
      AND o.decimal_longitude IS NOT NULL AND o.decimal_longitude != ''
      AND e.name = ?
    ORDER BY i.modified DESC
"""

_VARIANT_QUERIES = {
    'collector': _COLLECTOR_QUERY,
    'genus':     _GENUS_QUERY,
    'county':    _COUNTY_QUERY,
    'ecoregion': _ECOREGION_QUERY,
}


def write_variant_feed(
    out_dir: Path,
    variant_type: str,
    filter_value: str,
    slug: str,
    rows: list,
    run_time: datetime.datetime,
) -> dict:
    """Write a single variant Atom feed file and return its index entry dict.

    Always writes a file even when rows is empty (D-01). Uses run_time as the
    feed-level <updated> timestamp when rows is empty (D-02). Produces valid Atom
    with zero <entry> children when rows is empty (D-03).
    """
    filename = f'{variant_type}-{slug}.xml'
    feed_id = f'https://beeatlas.org/data/feeds/{filename}'
    title_str = _TITLE_TEMPLATES[variant_type].format(value=filter_value)

    # Feed-level updated: most recent entry timestamp if rows exist, else run_time (D-02)
    if rows:
        updated_ts = rows[0][0].astimezone(_UTC).isoformat()
    else:
        updated_ts = run_time.isoformat()

    feed = ET.Element(_atom('feed'))
    feed.set('xml:lang', 'en')

    ET.SubElement(feed, _atom('title')).text = title_str
    ET.SubElement(feed, _atom('id')).text = feed_id

    link_el = ET.SubElement(feed, _atom('link'))
    link_el.set('rel', 'self')
    link_el.set('href', feed_id)

    ET.SubElement(feed, _atom('updated')).text = updated_ts

    # Always write entries (D-01 means always write file; D-03 means 0 entries is valid)
    for row in rows:
        _build_entry(feed, row)

    tree = ET.ElementTree(feed)
    ET.indent(tree, space='  ')

    out_path = out_dir / 'feeds' / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)

    result = ET.tostring(feed, xml_declaration=True, encoding='unicode')
    out_path.write_text(result, encoding='utf-8')

    print(  # noqa: T201
        f"  feeds/{filename}: {len(rows):,} entries, {out_path.stat().st_size:,} bytes"
    )

    return {
        'filename': filename,
        'url': f'/data/feeds/{filename}',
        'title': title_str,
        'filter_type': variant_type,
        'filter_value': filter_value,
        'entry_count': len(rows),
    }


def write_all_variants(
    con: duckdb.DuckDBPyConnection,
    out_dir: Path,
    run_time: datetime.datetime,
) -> list:
    """Enumerate all filter values per variant type and write one feed file each.

    Counties and ecoregions are enumerated from the geographies tables (not the
    90-day window) so all known regions get a feed file regardless of recent activity
    (D-01 always-write intent).

    Returns list of index entry dicts (one per feed written).
    """
    # Enumerate distinct filter values per type
    _ENUM_QUERIES = {
        'collector': (
            "SELECT DISTINCT o.recorded_by FROM ecdysis_data.occurrences o "
            "WHERE o.recorded_by IS NOT NULL AND o.recorded_by != '' ORDER BY o.recorded_by"
        ),
        'genus': (
            "SELECT DISTINCT o.genus FROM ecdysis_data.occurrences o "
            "WHERE o.genus IS NOT NULL AND o.genus != '' ORDER BY o.genus"
        ),
        'county': (
            "SELECT DISTINCT name FROM geographies.us_counties "
            "WHERE state_fips = '53' ORDER BY name"
        ),
        'ecoregion': (
            "SELECT name FROM geographies.ecoregions "
            "WHERE ST_Intersects(geom, "
            "(SELECT geom FROM geographies.us_states "
            "WHERE abbreviation = 'WA')) ORDER BY name"
        ),
    }

    all_entries = []

    for variant_type in ('collector', 'genus', 'county', 'ecoregion'):
        filter_values = [row[0] for row in con.execute(_ENUM_QUERIES[variant_type]).fetchall()]
        # Track slugs within this variant type to detect collisions
        seen_slugs: dict[str, int] = {}

        for filter_value in filter_values:
            base_slug = _slugify(filter_value)
            if base_slug in seen_slugs:
                seen_slugs[base_slug] += 1
                slug = f'{base_slug}-{seen_slugs[base_slug]}'
                print(  # noqa: T201
                    f"  WARNING: slug collision for {variant_type!r} value "
                    f"{filter_value!r} -> using {slug!r}"
                )
            else:
                seen_slugs[base_slug] = 1
                slug = base_slug

            rows = con.execute(_VARIANT_QUERIES[variant_type], [filter_value]).fetchall()
            entry = write_variant_feed(out_dir, variant_type, filter_value, slug, rows, run_time)
            all_entries.append(entry)

    return all_entries


def write_index_json(out_dir: Path, entries: list) -> None:
    """Write index.json listing all variant feeds with metadata."""
    out_path = out_dir / 'feeds' / 'index.json'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(entries, indent=2), encoding='utf-8')
    print(  # noqa: T201
        f"  feeds/index.json: {len(entries)} feeds, {out_path.stat().st_size:,} bytes"
    )


def main() -> None:
    """Connect to beeatlas.duckdb and write the determinations feed and all variants."""
    con = duckdb.connect(DB_PATH, read_only=True)
    con.execute("INSTALL spatial; LOAD spatial;")
    run_time = datetime.datetime.now(tz=_UTC)
    write_determinations_feed(con, ASSETS_DIR)
    entries = write_all_variants(con, ASSETS_DIR, run_time)
    write_index_json(ASSETS_DIR, entries)
    con.close()


if __name__ == '__main__':
    main()

"""Generate Atom feed of recent determinations from beeatlas.duckdb.

Produces:
  frontend/public/data/feeds/determinations.xml

Covers all determinations whose modified timestamp falls within the last 90 days,
with blank scientific_name / identified_by rows excluded.

Usage:
    uv run --project data python data/feeds.py
"""

import datetime
import os
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


def main() -> None:
    """Connect to beeatlas.duckdb and write the determinations feed."""
    con = duckdb.connect(DB_PATH, read_only=True)
    write_determinations_feed(con, ASSETS_DIR)
    con.close()


if __name__ == '__main__':
    main()

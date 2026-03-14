from pathlib import Path
import re
import sys
from typing import IO
import zipfile

import geopandas
import pandas as pd

from spatial import add_region_columns

dtype = {
    'id': 'int64',
    'taxonID': 'Int64',
    'year': 'Int64',
    'month': 'Int64',
    'day': 'Int64',
    'startDayOfYear': 'Int64',
    'endDayOfYear': 'Int64',
    'decimalLatitude': 'float64',
    'decimalLongitude': 'float64',
    'coordinateUncertaintyInMeters': 'Int64',
    'minimumElevationInMeters': 'float64',
    'maximumElevationInMeters': 'float64',
    'minimumDepthInMeters': 'float64',
    'maximumDepthInMeters': 'float64',
    'individualCount': 'Int64',
    'collID': 'Int64',
    'recordID': pd.StringDtype(),
    'institutionCode': pd.StringDtype(),
    'collectionCode': pd.StringDtype(),
    'ownerInstitutionCode': pd.StringDtype(),
    'basisOfRecord': pd.StringDtype(),
    'occurrenceID': pd.StringDtype(),
    'catalogNumber': pd.StringDtype(),
    'otherCatalogNumbers': pd.StringDtype(),
    'kingdom': pd.StringDtype(),
    'phylum': pd.StringDtype(),
    'class': pd.StringDtype(),
    'order': pd.StringDtype(),
    'family': pd.StringDtype(),
    'scientificName': pd.StringDtype(),
    'scientificNameAuthorship': pd.StringDtype(),
    'genus': pd.StringDtype(),
    'subgenus': pd.StringDtype(),
    'specificEpithet': pd.StringDtype(),
    'infraspecificEpithet': pd.StringDtype(),
    'taxonRank': pd.StringDtype(),
    'identifiedBy': pd.StringDtype(),
    'identificationReferences': pd.StringDtype(),
    'identificationRemarks': pd.StringDtype(),
    'identificationQualifier': pd.StringDtype(),
    'dateIdentified': pd.StringDtype(),
    'recordedBy': pd.StringDtype(),
    'eventDate': pd.StringDtype(),
    'eventDate2': pd.StringDtype(),
    'verbatimEventDate': pd.StringDtype(),
    'occurrenceRemarks': pd.StringDtype(),
    'habitat': pd.StringDtype(),
    'fieldNumber': pd.StringDtype(),
    'locality': pd.StringDtype(),
    'municipality': pd.StringDtype(),
    'stateProvince': pd.StringDtype(),
    'county': pd.StringDtype(),
    'countryCode': pd.StringDtype(),
    'locationRemarks': pd.StringDtype(),
    'verbatimCoordinates': pd.StringDtype(),
    'geodeticDatum': pd.StringDtype(),
    'georeferencedBy': pd.StringDtype(),
    'georeferenceProtocol': pd.StringDtype(),
    'georeferenceSources': pd.StringDtype(),
    'georeferenceRemarks': pd.StringDtype(),
    'verbatimElevation': pd.StringDtype(),
    'lifeStage': pd.StringDtype(),
    'sex': pd.StringDtype(),
    'disposition': pd.StringDtype(),
    'references': pd.StringDtype(),
    'recordEnteredBy': pd.StringDtype(),
    'securityReason': pd.StringDtype(),
    'associatedTaxa': pd.StringDtype(),
}

def read_occurrences(file: IO[bytes]) -> pd.DataFrame:
    df = pd.read_csv(file, sep='\t', dtype=dtype, na_values=[''], keep_default_na=True, parse_dates=['modified'])
    df = geopandas.GeoDataFrame(df, geometry=geopandas.points_from_xy(df.decimalLongitude, df.decimalLatitude), crs="EPSG:4326")
    return df

def from_zipfile(zip: Path):
    with zipfile.ZipFile(zip) as z:
        with z.open('occurrences.tab') as f:
            df = read_occurrences(f)
    return df

_HOST_RE = re.compile(r'host\s*:\s*"([^"]+)"', re.IGNORECASE)

def _parse_floral_host(associated_taxa) -> str | None:
    if associated_taxa is None or not isinstance(associated_taxa, str):
        return None
    m = _HOST_RE.search(associated_taxa)
    return m.group(1) if m else None


def to_parquet(df: pd.DataFrame, out: Path | IO[bytes], counties_gdf, ecoregions_gdf):
    df = df[df['decimalLatitude'].notna() & df['decimalLongitude'].notna()].copy()
    # Extract floral host from associatedTaxa ("host":"Plant name" format)
    df['floralHost'] = df['associatedTaxa'].apply(_parse_floral_host).astype(pd.StringDtype())
    # Normalise scientificName for display:
    #   species-level ID  → keep as-is (e.g. "Andrena sladeni")
    #   genus-only ID     → append " sp." (e.g. "Lasioglossum sp.")
    #   no identification → "Unidentified"
    genus_only = df['scientificName'].notna() & df['specificEpithet'].isna()
    df.loc[genus_only, 'scientificName'] = df.loc[genus_only, 'scientificName'] + ' sp.'
    df['scientificName'] = df['scientificName'].fillna('Unidentified')
    # Add county and ecoregion_l3 via spatial join (before column selection,
    # while df still has decimalLongitude/decimalLatitude)
    df = add_region_columns(df, counties_gdf, ecoregions_gdf)
    # Select required columns and rename for output
    df = df[[
        'id',
        'occurrenceID',
        'decimalLongitude',
        'decimalLatitude',
        'scientificName',
        'family',
        'genus',
        'specificEpithet',
        'year',
        'month',
        'recordedBy',
        'fieldNumber',
        'floralHost',
        'county',
        'ecoregion_l3',
    ]].rename(columns={
        'id': 'ecdysis_id',
        'decimalLongitude': 'longitude',
        'decimalLatitude': 'latitude',
    })
    # Convert to plain DataFrame to avoid writing GeoParquet (geometry column breaks hyparquet)
    pd.DataFrame(df).to_parquet(out, engine='pyarrow', index=False)

if __name__ == '__main__':
    import geopandas as gpd
    zip_path = Path(sys.argv[1])
    df = from_zipfile(zip_path)
    print(f"Loaded {len(df)} occurrences")
    # Load boundaries once here and pass through (avoid double-loading)
    counties_gdf = gpd.read_file('zip://tl_2024_us_county.zip')
    counties_gdf = counties_gdf[counties_gdf['STATEFP'] == '53'].to_crs('EPSG:4326')
    eco_gdf = gpd.read_file('zip://NA_CEC_Eco_Level3.zip!NA_CEC_Eco_Level3.shp').to_crs('EPSG:4326')
    to_parquet(df, Path("ecdysis.parquet"), counties_gdf, eco_gdf)

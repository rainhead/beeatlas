from pathlib import Path
import sys
from typing import IO
import zipfile

import geopandas
import pandas as pd

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

def to_parquet(df: pd.DataFrame, out: Path | IO[bytes]):
    # Filter to Washington Bee Atlas records and records with valid coordinates
    df = df[df['ecdysis_catalogNumber'].str.startswith('WSDA_', na=False)]
    df = df[df['ecdysis_decimalLatitude'].notna() & df['ecdysis_decimalLongitude'].notna()]
    # Select required columns and rename for output
    df = df[[
        'id',
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
    ]]
    # Convert to plain DataFrame to avoid writing GeoParquet (geometry column breaks hyparquet)
    pd.DataFrame(df).to_parquet(out, engine='pyarrow', index=False)

if __name__ == '__main__':
    zip_path = Path(sys.argv[1])
    df = from_zipfile(zip_path)
    print(f"Loaded {len(df)} occurrences")
    to_parquet(df, Path("ecdysis.parquet"))

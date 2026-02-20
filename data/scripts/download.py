#!/usr/bin/env python
"""Download GBIF backbone zip to disk and stream multiple files to Parquet."""

import zipfile
from io import StringIO
from pathlib import Path

import requests
import pandas as pd

# Configuration
RAW_DATA_DIR = Path("data/raw")
PROCESSED_DATA_DIR = Path("data/processed")
METADATA_FILE = RAW_DATA_DIR / ".download_metadata.json"

RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Data type specifications for Taxon file
TAXON_DTYPES = {
    'taxonID': 'int64',
    'parentNameUsageID': 'Int64',  # Nullable integer
    'acceptedNameUsageID': 'Int64',
    'originalNameUsageID': 'Int64',
    # String columns (PyArrow-backed for efficiency)
    'scientificName': 'string',
    'scientificNameAuthorship': 'string',
    'canonicalName': 'string',
    'genericName': 'string',
    'specificEpithet': 'string',
    'infraspecificEpithet': 'string',
    'namePublishedIn': 'string',
    'taxonRemarks': 'string',
    'genus': 'string',  # High-cardinality, keep as string not category
    # Categorical columns (repeated values from fixed set)
    'taxonRank': 'category',
    'taxonomicStatus': 'category',
    'kingdom': 'category',
    'phylum': 'category',
    'class': 'category',
    'order': 'category',
    'family': 'category',
}

# Data type specifications for Master 2025 field observations
MASTER_2025_DTYPES = {
    # IDs and numeric identifiers
    'fieldNumber': 'int64',
    'catalogNumber': 'Int64',
    'userId': 'Int64',
    'specimenId': 'int64',
    # Dates
    'day': 'int64',
    'month': 'int64',
    'year': 'int64',
    'day2': 'Int64',
    'month2': 'Int64',
    'year2': 'Int64',
    'startDayofYear': 'Int64',
    'endDayofYear': 'Int64',
    # Location
    'decimalLatitude': 'float64',
    'decimalLongitude': 'float64',
    'coordinateUncertaintyInMeters': 'float64',
    'verbatimElevation': 'float64',
    # String columns
    'dateLabelPrint': 'string',
    'occurrenceID': 'string',
    'userLogin': 'string',
    'firstName': 'string',
    'firstNameInitial': 'string',
    'lastName': 'string',
    'recordedBy': 'string',
    'sampleId': 'string',
    'verbatimEventDate': 'string',
    'country': 'string',
    'stateProvince': 'string',
    'county': 'string',
    'locality': 'string',
    'samplingProtocol': 'string',
    'relationshipOfResource': 'string',
    'resourceID': 'string',
    'relatedResourceID': 'string',
    'phylumPlant': 'string',
    'orderPlant': 'string',
    'familyPlant': 'string',
    'genusPlant': 'string',
    'speciesPlant': 'string',
    'taxonRankPlant': 'string',
    'url': 'string',
    'specificEpithet': 'string',
}

# Data type specifications for Ecdysis occurrences (DarwinCore format)
ECDYSIS_DTYPES = {
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
    'recordID': 'string',
    # String columns (many DarwinCore fields)
    'institutionCode': 'string',
    'collectionCode': 'string',
    'ownerInstitutionCode': 'string',
    'basisOfRecord': 'string',
    'occurrenceID': 'string',
    'catalogNumber': 'string',
    'otherCatalogNumbers': 'string',
    'kingdom': 'string',
    'phylum': 'string',
    'class': 'string',
    'order': 'string',
    'family': 'string',
    'scientificName': 'string',
    'scientificNameAuthorship': 'string',
    'genus': 'string',
    'subgenus': 'string',
    'specificEpithet': 'string',
    'taxonRank': 'string',
    'identifiedBy': 'string',
    'dateIdentified': 'string',
    'recordedBy': 'string',
    'eventDate': 'string',
    'verbatimEventDate': 'string',
    'locality': 'string',
    'stateProvince': 'string',
    'county': 'string',
    'countryCode': 'string',
    'geodeticDatum': 'string',
    'lifeStage': 'string',
    'sex': 'string',
    'references': 'string',
}

# Configuration for files to process
FILE_CONFIGS = {
    'taxon': {
        'source': 'zip',
        'url': 'https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip',
        'zip_file': RAW_DATA_DIR / 'backbone.zip',
        'zip_path': 'backbone/Taxon.tsv',
        'output_file': PROCESSED_DATA_DIR / 'taxon.parquet',
        'dtype_spec': TAXON_DTYPES,
        'transformations': ['drop_columns', 'drop_empty', 'filter_doubtful'],
    },
    'master_2025': {
        'source': 'url',
        'url': 'https://docs.google.com/spreadsheets/d/1lcul17yLdZvd0QmbhUHN-fcDpocsY04v/export?format=csv&gid=784598513',
        'output_file': PROCESSED_DATA_DIR / 'master_2025.parquet',
        'dtype_spec': MASTER_2025_DTYPES,
        'transformations': [],
    },
    'ecdysis_wa': {
        'source': 'post_zip',
        'url': 'https://ecdysis.org/collections/download/downloadhandler.php',
        'zip_file': RAW_DATA_DIR / 'ecdysis_wa.zip',
        'zip_path': 'occurrences.tab',
        'output_file': PROCESSED_DATA_DIR / 'ecdysis_wa.parquet',
        'dtype_spec': ECDYSIS_DTYPES,
        'post_data': {
            'schema': 'symbiota',
            'format': 'tab',
            'zip': '1',
            'searchvar': 'db=164&state=Washington&taxa=Arthropoda&usethes=1&taxontype=4&association-type=none',
        },
        'transformations': ['filter_wsda'],
    },
}

def apply_transformations(df, transformations):
    """Apply a sequence of transformations to the dataframe."""
    for transform in transformations:
        if transform == 'drop_columns':
            df = df.drop(columns=['datasetID'], errors='ignore')
            print("Dropped datasetID column")

        elif transform == 'drop_empty':
            columns_to_drop = ['nameAccordingTo', 'nomenclaturalStatus']
            df = df.drop(columns=columns_to_drop, errors='ignore')
            print(f"Dropped empty columns: {columns_to_drop}")

        elif transform == 'filter_doubtful':
            initial_count = len(df)
            df = df[df['taxonomicStatus'] != 'doubtful']
            filtered_count = initial_count - len(df)
            print(f"Filtered out {filtered_count} taxa with status='doubtful' ({100*filtered_count/initial_count:.1f}%)")

        elif transform == 'filter_wsda':
            # Filter for catalog numbers starting with WSDA_ (Ecdysis data)
            initial_count = len(df)
            df = df[df['catalogNumber'].str.startswith('WSDA_', na=False)]
            filtered_count = initial_count - len(df)
            pct = 100 * filtered_count / initial_count if initial_count > 0 else 0
            print(f"Filtered to WSDA_ records: {len(df)} kept, {filtered_count} removed ({pct:.1f}%)")

    return df


def stream_and_convert_file(file_key, config):
    """Stream a file (from zip, URL, or POST response) and convert to DataFrame with transformations."""
    source_type = config['source']
    dtype_spec = config['dtype_spec']
    transformations = config['transformations']

    print(f"\nProcessing {file_key}...")

    try:
        if source_type == 'zip':
            zip_path = config['zip_file']
            file_zip_path = config['zip_path']
            print(f"Streaming from zip: {file_zip_path}")

            with zipfile.ZipFile(zip_path) as z:
                with z.open(file_zip_path) as f:
                    df = pd.read_csv(
                        f,
                        sep='\t',
                        dtype=dtype_spec,
                        na_values=[''],
                        keep_default_na=True,
                    )

        elif source_type == 'url':
            url = config['url']
            print(f"Downloading from URL...")

            response = requests.get(url, timeout=60)
            response.raise_for_status()

            df = pd.read_csv(
                StringIO(response.text),
                dtype=dtype_spec,
                na_values=[''],
                keep_default_na=True,
            )

        elif source_type == 'post_zip':
            zip_path = config['zip_file']
            file_zip_path = config['zip_path']
            url = config['url']
            post_data = config['post_data']

            print(f"Streaming from POST response zip: {file_zip_path}")

            # Note: zip file should already exist (downloaded in main())
            with zipfile.ZipFile(zip_path) as z:
                with z.open(file_zip_path) as f:
                    df = pd.read_csv(
                        f,
                        sep='\t',
                        dtype=dtype_spec,
                        na_values=[''],
                        keep_default_na=True,
                    )

        else:
            raise ValueError(f"Unknown source type: {source_type}")

    except Exception as e:
        print(f"Error reading {file_key}: {e}")
        raise

    print(f"Loaded {len(df)} rows, {len(df.columns)} columns")

    # Apply transformations
    df = apply_transformations(df, transformations)
    print(f"Final: {len(df)} rows, {len(df.columns)} columns")

    return df


def main():
    """Main logic: download sources as needed, process all configured files."""
    # First pass: handle GET downloads for zip-based sources
    zip_sources = {k: v for k, v in FILE_CONFIGS.items() if v['source'] == 'zip'}

    for file_key, config in zip_sources.items():
        zip_file = config['zip_file']
        url = config['url']

        print(f"Checking zip for {file_key}: {zip_file.name}")

        # Check if we need to download
        need_download = False
        if not zip_file.exists():
            print("Zip file not found, downloading...")
            need_download = True
        else:
            print("Zip file exists (no ETag checking for zip sources)")

        # Download if needed
        if need_download:
            print(f"Downloading from {url}...")
            try:
                response = requests.get(url, stream=True, timeout=300)
                response.raise_for_status()
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0

                with open(zip_file, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=1024*1024):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size:
                                pct = (downloaded / total_size) * 100
                                print(f"  Downloaded {downloaded / 1024 / 1024:.1f} MB / "
                                      f"{total_size / 1024 / 1024:.1f} MB ({pct:.1f}%)")
            except requests.RequestException as e:
                print(f"Error downloading: {e}")
                raise

            file_size_mb = zip_file.stat().st_size / 1024 / 1024
            print(f"Download complete ({file_size_mb:.1f} MB)")

    # Second pass: handle POST downloads for POST-based zip sources
    post_zip_sources = {k: v for k, v in FILE_CONFIGS.items() if v['source'] == 'post_zip'}

    for file_key, config in post_zip_sources.items():
        zip_file = config['zip_file']
        url = config['url']
        post_data = config['post_data']

        print(f"\nChecking POST zip for {file_key}: {zip_file.name}")

        # For POST sources, always refresh (data changes frequently)
        print("Posting query to server...")
        try:
            response = requests.post(url, data=post_data, timeout=300)
            response.raise_for_status()

            total_size = len(response.content)
            print(f"Received {total_size / 1024 / 1024:.1f} MB")

            with open(zip_file, 'wb') as f:
                f.write(response.content)

            file_size_mb = zip_file.stat().st_size / 1024 / 1024
            print(f"Saved to {zip_file} ({file_size_mb:.1f} MB)")

        except requests.RequestException as e:
            print(f"Error posting query: {e}")
            raise

    # Third pass: process all configured files
    print(f"\nProcessing all configured files...")
    for file_key, config in FILE_CONFIGS.items():
        df = stream_and_convert_file(file_key, config)

        # Write parquet
        output_file = config['output_file']
        print(f"Writing to {output_file}...")
        try:
            df.to_parquet(
                output_file,
                index=False,
                compression='snappy',
                engine='pyarrow',
            )
        except Exception as e:
            print(f"Error writing Parquet: {e}")
            raise

        file_size_mb = output_file.stat().st_size / 1024 / 1024
        print(f"Parquet file created: {file_size_mb:.1f} MB")

    print("\nDone!")


if __name__ == "__main__":
    main()

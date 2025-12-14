# GBIF Backbone Data Pipeline

This project demonstrates a DVC-based data pipeline for processing multiple biodiversity data sources: GBIF backbone taxonomy, field observations, and Ecdysis museum collection records.

## Overview

The pipeline downloads from multiple sources and streams to Apache Parquet format:

- **GET-based zips** (GBIF): Downloads ~1GB zip once to disk, caches locally
- **URL-based CSV** (Google Sheets): Downloads fresh copy of field observations each run
- **POST-based zips** (Ecdysis): POSTs a query, downloads zip result, caches locally
- **Data-driven configuration**: Add sources to `FILE_CONFIGS` without code changes
- **Transformation pipelines**: Each source has its own set of transformations
- **Streaming architecture**: No large intermediate extractions, only final Parquet files

## Project Structure

```
├── scripts/
│   └── download.py           # Download and stream TSV to Parquet
├── data/
│   └── processed/            # Processed data (Parquet output)
├── dvc.yaml                  # DVC pipeline definition
└── README.md
```

## Usage

### Initial Setup

```bash
# Clone/open the project
cd gbif_project

# Create a Python virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install dvc pandas pyarrow requests
```

### Run the Pipeline

```bash
# Run the pipeline (downloads, streams, converts to Parquet in one go)
dvc repro
```

### Key Features

- **Multi-source support**: GET-based zips (GBIF), direct URLs (Google Sheets), POST-based queries (Ecdysis)
- **Data-driven configuration**: Define sources in `FILE_CONFIGS` without modifying code
- **Smart caching**: GET/POST zips cached locally, URL sources refreshed each run
- **Transformation pipelines**: Each source has its own transformations (drop columns, filter rows, etc.)
- **Streaming architecture**: No large intermediate extractions—only final Parquet files
- **Memory efficient**: 1GB+ sources handled without loading fully into memory
- **DVC-tracked**: `dvc repro` reproduces exact pipeline, `dvc.lock` tracks data versions

## DVC Concepts

- **deps**: Files that trigger stage re-execution if they change
- **outs**: Outputs that are tracked. Use `cache: false` for files you want to keep in workspace (like raw downloads)
- **dvc.lock**: Lockfile recording execution hashes (commit this to git)

## Workflow

### For Iterating on Transformations

Edit the `apply_transformations()` function or modify `FILE_CONFIGS`, then:

```bash
dvc repro
```

- **GET/POST zips**: Already cached, only converts files (fast)
- **URL sources**: Downloads fresh copy, converts immediately

### For Refreshing Source Data

```bash
# Delete specific zip to force re-download
rm data/raw/backbone.zip          # Refreshes GBIF backbone
rm data/raw/ecdysis_wa.zip        # Refreshes Ecdysis data

# URL sources always download fresh—no deletion needed
```

### For Fresh Complete Rebuild

```bash
# Clear all raw data
rm -rf data/raw/*.zip

# Rebuild everything
dvc repro
```

### Version Control

```bash
# Commit code and configuration
git add scripts/ dvc.yaml .gitignore README.md
git commit -m "Update pipeline configuration"

# Track data snapshot
git add dvc.lock
git commit -m "Data snapshot (GBIF, Ecdysis, Master 2025)"
```

## Extending the Pipeline

The pipeline supports three source types: `zip` (GET), `url` (direct CSV), and `post_zip` (POST to server).

### Adding Another GET-Based Zip Source

For GBIF backbone supplementary files or similar sources:

```python
'reference': {
    'source': 'zip',
    'url': 'https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip',
    'zip_file': RAW_DATA_DIR / 'backbone.zip',
    'zip_path': 'backbone/Reference.tsv',
    'output_file': PROCESSED_DATA_DIR / 'reference.parquet',
    'dtype_spec': { 'id': 'int64', 'title': 'string', ... },
    'transformations': [],
},
```

Shares the same zip file and URL as `taxon`—both are extracted from `backbone.zip` in a single download.

### Adding Another URL-Based Source

For other public spreadsheets or CSV endpoints:

```python
'other_observations': {
    'source': 'url',
    'url': 'https://example.com/data.csv',
    'output_file': PROCESSED_DATA_DIR / 'other_observations.parquet',
    'dtype_spec': { 'id': 'int64', 'date': 'string', ... },
    'transformations': ['custom_filter'],
},
```

### Adding Another Ecdysis Collection

To get different records (all Arthropoda, different state, etc.):

```python
'ecdysis_all_arthropoda': {
    'source': 'post_zip',
    'url': 'https://ecdysis.org/collections/download/downloadhandler.php',
    'zip_file': RAW_DATA_DIR / 'ecdysis_all.zip',
    'zip_path': 'occurrences.tab',
    'output_file': PROCESSED_DATA_DIR / 'ecdysis_all_arthropoda.parquet',
    'dtype_spec': ECDYSIS_DTYPES,
    'post_data': {
        'schema': 'symbiota',
        'format': 'tab',
        'zip': '1',
        'searchvar': 'db=164&state=Washington&taxa=Arthropoda&usethes=1&taxontype=4',
    },
    'transformations': [],
},
```

### Adding Custom Transformations

Add transformation logic to `apply_transformations()`:

```python
elif transform == 'filter_by_quality':
    initial_count = len(df)
    df = df[df['quality_score'] >= 50]
    print(f"Filtered by quality: {len(df)} records kept")
```

Then reference it in the source config's `transformations` list.

## References

- [DVC Documentation](https://dvc.org/doc)
- [GBIF Backbone Dataset](https://www.gbif.org/dataset/d7dddf29-f356-404a-8606-f36e3f1e126f)
- [Ecdysis Collection Management System](https://ecdysis.org/)
- [DarwinCore Standard](https://dwc.tdwg.org/)

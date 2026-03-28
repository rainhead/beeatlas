"""Lambda handler -- runs dlt pipelines, exports data to S3, invalidates CloudFront.

Dispatch modes (per D-01, D-02, D-03):
  - event.pipeline == 'inat' (nightly): ecdysis -> ecdysis-links -> inaturalist -> projects -> export
  - event.pipeline == 'full' (weekly/default): geographies -> ecdysis -> ecdysis-links -> inaturalist -> projects -> export
"""

import json
import os
import time
import uuid

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ['BUCKET_NAME']
DISTRIBUTION_ID = os.environ['DISTRIBUTION_ID']
DB_KEY = 'db/beeatlas.duckdb'
TMP_DB = '/tmp/beeatlas.duckdb'
EXPORT_DIR = '/tmp/export'
EXPORT_FILES = ['ecdysis.parquet', 'samples.parquet', 'counties.geojson', 'ecoregions.geojson']

NIGHTLY_STEPS = ['ecdysis', 'ecdysis-links', 'inaturalist', 'projects', 'export']
FULL_STEPS = ['geographies', 'ecdysis', 'ecdysis-links', 'inaturalist', 'projects', 'export']


def handler(event, context):
    s3 = boto3.client('s3')
    overall_start = time.monotonic()

    # Parse pipeline mode -- handles both Function URL and direct invocation event shapes
    if 'body' in event:
        try:
            payload = json.loads(event.get('body') or '{}')
        except (json.JSONDecodeError, TypeError):
            payload = {}
    else:
        payload = event
    pipeline_mode = payload.get('pipeline', 'full')
    steps = FULL_STEPS if pipeline_mode == 'full' else NIGHTLY_STEPS
    print(f"Pipeline mode: {pipeline_mode}, steps: {steps}")

    # 1. Download DuckDB from S3 (PIPE-11)
    print(f"Downloading s3://{BUCKET}/{DB_KEY}")
    try:
        s3.download_file(BUCKET, DB_KEY, TMP_DB)
        print(f"Downloaded {DB_KEY}: {os.path.getsize(TMP_DB):,} bytes")
    except ClientError as e:
        if e.response['Error']['Code'] in ('NoSuchKey', '404'):
            print(f"No existing DuckDB (first run): {DB_KEY}")
        else:
            raise

    # 2. Run pipelines (PIPE-11)
    os.makedirs(EXPORT_DIR, exist_ok=True)
    os.makedirs('/tmp/duckdb_swap', exist_ok=True)
    from run import STEPS as ALL_STEPS
    steps_map = {name: fn for name, fn in ALL_STEPS}
    for step_name in steps:
        print(f"--- {step_name} ---")
        step_start = time.monotonic()
        steps_map[step_name]()
        elapsed = time.monotonic() - step_start
        print(f"--- {step_name} done in {elapsed:.1f}s ---")

    # 3. Upload exports to S3 /data/ (PIPE-12)
    for filename in EXPORT_FILES:
        local_path = f'{EXPORT_DIR}/{filename}'
        s3_key = f'data/{filename}'
        s3.upload_file(local_path, BUCKET, s3_key)
        print(f"Uploaded {local_path} -> s3://{BUCKET}/{s3_key}")

    # 4. Backup DuckDB to S3 /db/ (PIPE-13)
    s3.upload_file(TMP_DB, BUCKET, DB_KEY)
    print(f"Backed up DuckDB to s3://{BUCKET}/{DB_KEY}")

    # 5. Invalidate CloudFront /data/* (PIPE-14)
    cf = boto3.client('cloudfront')
    cf.create_invalidation(
        DistributionId=DISTRIBUTION_ID,
        InvalidationBatch={
            'Paths': {'Quantity': 1, 'Items': ['/data/*']},
            'CallerReference': str(uuid.uuid4()),
        },
    )
    print(f"CloudFront invalidation created for /data/*")

    total = time.monotonic() - overall_start
    print(f"Pipeline complete in {total:.1f}s: {pipeline_mode}")
    return {'statusCode': 200, 'body': f'Pipeline complete: {pipeline_mode} ({total:.1f}s)'}

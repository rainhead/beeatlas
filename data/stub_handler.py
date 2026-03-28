import os
import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ['BUCKET_NAME']
DB_KEY = 'db/beeatlas.duckdb'
TMP_PATH = '/tmp/beeatlas.duckdb'
SENTINEL_KEY = 'db/stub-sentinel.txt'


def handler(event, context):
    s3 = boto3.client('s3')

    # Download DuckDB file — graceful miss on first run
    print(f"Attempting download: s3://{BUCKET}/{DB_KEY}")
    try:
        s3.download_file(BUCKET, DB_KEY, TMP_PATH)
        size = os.path.getsize(TMP_PATH)
        print(f"Downloaded {DB_KEY}: {size} bytes")
    except ClientError as e:
        if e.response['Error']['Code'] in ('NoSuchKey', '404'):
            print(f"File not found (first run): {DB_KEY}")
            with open(TMP_PATH, 'w') as f:
                f.write('stub-placeholder')
        else:
            raise

    # Verify /tmp write access and DLT_DATA_DIR
    sentinel = '/tmp/dlt/.sentinel'
    os.makedirs('/tmp/dlt', exist_ok=True)
    with open(sentinel, 'w') as f:
        f.write('ok')
    print(f"/tmp write confirmed: {sentinel}")

    # Upload sentinel to S3 (proves write permission on db/* prefix)
    s3.upload_file(TMP_PATH, BUCKET, SENTINEL_KEY)
    print(f"Uploaded sentinel to s3://{BUCKET}/{SENTINEL_KEY}")

    print("S3 round-trip complete")
    return {
        'statusCode': 200,
        'body': 'S3 round-trip complete',
    }

from pathlib import Path
import sys

from occurrences import from_zipfile, to_parquet

if __name__ == '__main__':
    zip = Path(sys.argv[1])
    df = from_zipfile(zip)
    print(f"Loaded {len(df)} occurrences", file=sys.stderr)
    to_parquet(df, Path("ecdysis.parquet"))

from datetime import datetime
from pathlib import Path
import sys
from urllib import parse

import requests

download_url = 'https://ecdysis.org/collections/download/downloadhandler.php'


def download_params(search: dict[str, str]):
    search_base = {
        'usethes': '1',
        'taxontype': '4',
        'association-type': 'none',
        'comingFrom': 'newsearch'
    }
    return dict(
        schema='symbiota',
        identifications='1',
        images='1',
        identifiers='1',
        format='tab',
        cset='utf-8',
        zip='1',
        publicsearch='1',
        taxonFilterCode=0,
        sourcepage='specimen',
        searchvar=parse.urlencode({**search_base, **search}),
        submitaction=''
    )


def make_dump(search: dict[str, str]):
    ts = datetime.now().strftime("%Y-%m-%d")
    params = download_params(search)
    response = requests.post(
        download_url,
        data=parse.urlencode(params),
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'curl/8.7.1'}
    )
    response.raise_for_status()
    if response.headers['Content-Type'].startswith('text/plain'):
        print(str(response.content))
        return

    zipfile = Path(f"ecdysis_{ts}_.zip")
    zipfile.write_bytes(response.content)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(prog='download.py', description='Download archives from Ecdysis')
    parser.add_argument('-d', '--db', required=True, help='Ecdysis database ID (e.g. 164)')
    parser.add_argument('-s', '--state')
    args = parser.parse_args()
    make_dump({'db': args.db})

"""Reading the files in an Ecdysis Darwin Core archive (beeatlas-3je9).

The archive's meta.xml declares every file tab-delimited, and Ecdysis writes
identifications.tab with commas. The loader reads each file's delimiter off its
header line. These archives are built in memory, shaped like the real one.
"""

import io
import zipfile

from ecdysis_pipeline import _iter_tab_file, _tab_file_delimiter


def _archive(files: dict[str, str]) -> zipfile.ZipFile:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, text in files.items():
            zf.writestr(name, text)
    buf.seek(0)
    return zipfile.ZipFile(buf)


def test_the_delimiter_comes_from_the_header():
    assert _tab_file_delimiter("id\tinstitutionCode\tcollectionCode\n") == "\t"
    assert _tab_file_delimiter("coreid,identifiedBy,dateIdentified\n") == ","


def test_a_tab_file_whose_values_hold_commas():
    """occurrences.tab: tab-delimited, with commas in free text. The sniffer this
    replaced gave up on the real file under CPython 3.14.9."""
    zf = _archive({
        "occurrences.tab": 'id\tlocality\tremarks\n'
                           '1\t"Mt. Adams, Yakima Co."\tnet, on Ceanothus\n'
                           '2\tSeattle\t\n',
    })
    rows = list(_iter_tab_file(zf, "occurrences.tab"))
    assert rows == [
        {"id": "1", "locality": "Mt. Adams, Yakima Co.", "remarks": "net, on Ceanothus"},
        {"id": "2", "locality": "Seattle", "remarks": ""},
    ]


def test_a_comma_file_with_doubled_quotes():
    """identifications.tab: comma-delimited despite its name, and a doubled quote
    inside a quoted field is one quote. The sniffer read this row's remark as
    'new species "pilosifrons"" Timberlake MS"'."""
    zf = _archive({
        "identifications.tab": 'coreid,identifiedBy,identificationRemarks\n'
                               '5594056,"Joe D. Engler","new species ""pilosifrons"" Timberlake MS"\n',
    })
    rows = list(_iter_tab_file(zf, "identifications.tab"))
    assert rows == [{
        "coreid": "5594056",
        "identifiedBy": "Joe D. Engler",
        "identificationRemarks": 'new species "pilosifrons" Timberlake MS',
    }]

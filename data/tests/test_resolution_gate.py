"""Wave-0 resolution-gate failure-path tests (D-02, D-09).

Tests pin the behavior of check_resolution_gate() and KNOWN_NON_BEES defined in
resolve_taxon_ids.py (added by Task 2). Both tests are RED until Task 2 lands
(ImportError / AttributeError); GREEN once Task 2 adds the gate function.

No parquet skipif guard — these are pure-Python unit tests against a synthetic CSV.
"""

import csv

import pytest

import resolve_taxon_ids as r


def _write_csv(tmp_path, rows):
    """Write a lineage_unresolved.csv with header 'canonical_name' and given rows."""
    csv_path = tmp_path / "lineage_unresolved.csv"
    with csv_path.open("w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["canonical_name"])
        for name in rows:
            writer.writerow([name])
    return csv_path


def test_gate_blocks_unresolved_bee(tmp_path, monkeypatch):
    """Case A: a CSV row with a real bee name NOT in KNOWN_NON_BEES causes SystemExit (D-02).

    The offending canonical_name must appear in the SystemExit message so the
    nightly cron log surfaces the actionable name.
    """
    bee_name = "agapostemon subtilior"
    csv_path = _write_csv(tmp_path, [bee_name])
    monkeypatch.setattr(r, "UNRESOLVED_CSV", csv_path)

    with pytest.raises(SystemExit) as excinfo:
        r.check_resolution_gate()

    assert bee_name in str(excinfo.value), (
        f"Expected offending name '{bee_name}' in SystemExit message, "
        f"got: {excinfo.value!r}"
    )


def test_gate_allows_known_non_bees_only(tmp_path, monkeypatch, capsys):
    """Case B: a CSV containing only KNOWN_NON_BEES names does NOT raise (D-09).

    The gate must REPORT the excluded count (not silently drop them),
    so stdout must contain 'resolution-gate: OK' and reference the excluded count.
    """
    non_bee_names = list(r.KNOWN_NON_BEES)
    csv_path = _write_csv(tmp_path, non_bee_names)
    monkeypatch.setattr(r, "UNRESOLVED_CSV", csv_path)

    # Must not raise
    r.check_resolution_gate()

    captured = capsys.readouterr()
    assert "resolution-gate: OK" in captured.out, (
        f"Expected 'resolution-gate: OK' in stdout, got: {captured.out!r}"
    )
    excluded_count = len(non_bee_names)
    assert str(excluded_count) in captured.out, (
        f"Expected excluded count {excluded_count} in stdout, got: {captured.out!r}"
    )

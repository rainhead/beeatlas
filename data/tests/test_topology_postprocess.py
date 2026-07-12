"""Tests for topology_postprocess — focused on the empty-FeatureCollection guard.

The guard exists because wilderness.geojson can be emitted with zero features
before the PAD-US source table is loaded on a host (see dbt_project.yml
on-run-start). mapshaper rejects zero-feature input, so main() must skip it and
still stamp _meta — otherwise the whole nightly goes red while the wilderness
overlay is merely empty (beeatlas-2vj).
"""
from __future__ import annotations

import json

import topology_postprocess


def _write(path, features):
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}))


def test_empty_wilderness_skips_mapshaper(tmp_path, monkeypatch):
    monkeypatch.setattr(topology_postprocess, "_EXPORT_DIR", tmp_path)
    called = []

    # _run_mapshaper now takes (src, dst); the real one writes the cleaned dst via
    # mapshaper. Simulate that by copying src->dst so main()'s _inject_meta(dst) has
    # a file to stamp; record the source name it was asked to clean.
    def _fake_mapshaper(src, dst):
        called.append(src.name)
        dst.write_text(src.read_text())

    monkeypatch.setattr(topology_postprocess, "_run_mapshaper", _fake_mapshaper)

    # counties/ecoregions have features (mapshaper runs); wilderness is empty (skipped).
    _write(tmp_path / "counties.geojson", [{"type": "Feature", "geometry": None, "properties": {}}])
    _write(tmp_path / "ecoregions.geojson", [{"type": "Feature", "geometry": None, "properties": {}}])
    _write(tmp_path / "wilderness.geojson", [])

    topology_postprocess.main()

    assert "wilderness.geojson" not in called, "mapshaper must be skipped for a 0-feature file"
    assert set(called) == {"counties.geojson", "ecoregions.geojson"}
    # The cleaned sibling is written (not the raw input); _meta is stamped on the
    # empty overlay's .clean.geojson so provenance is present downstream.
    assert "_meta" in json.loads((tmp_path / "wilderness.clean.geojson").read_text())
    # The raw mart copy is left untouched (no in-place mutation / no _meta on it).
    assert "_meta" not in json.loads((tmp_path / "wilderness.geojson").read_text())


def test_source_date_epoch_makes_built_at_deterministic(monkeypatch):
    """beeatlas-8td SITE 1: SOURCE_DATE_EPOCH pins _meta.built_at (reproducible
    builds) instead of wall-clock, so identical snapshots stamp identical bytes."""
    # 2026-07-12T22:16:58Z
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "1783894618")
    a = topology_postprocess._resolve_built_at()
    b = topology_postprocess._resolve_built_at()
    assert a == b == "2026-07-12T22:16:58Z"


def test_built_at_falls_back_to_wall_clock_when_unset(monkeypatch):
    """No SOURCE_DATE_EPOCH → a formatted UTC timestamp (unchanged behavior)."""
    monkeypatch.delenv("SOURCE_DATE_EPOCH", raising=False)
    ts = topology_postprocess._resolve_built_at()
    # shape YYYY-MM-DDTHH:MM:SSZ (not asserting the value — it's wall-clock)
    assert len(ts) == 20 and ts.endswith("Z") and ts[4] == "-" and ts[10] == "T"


def test_malformed_source_date_epoch_falls_back(monkeypatch):
    """A non-integer SOURCE_DATE_EPOCH is treated as unset (per the spec)."""
    monkeypatch.setenv("SOURCE_DATE_EPOCH", "not-a-number")
    ts = topology_postprocess._resolve_built_at()
    assert len(ts) == 20 and ts.endswith("Z")

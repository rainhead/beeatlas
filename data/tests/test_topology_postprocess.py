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

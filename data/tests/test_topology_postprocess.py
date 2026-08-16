"""Tests for topology_postprocess — focused on the empty-FeatureCollection guard.

The guard exists because wilderness.geojson can be emitted with zero features
before the PAD-US source table is loaded on a host (see dbt_project.yml
on-run-start). mapshaper rejects zero-feature input, so main() must skip it and
still stamp _meta — otherwise the whole nightly goes red while the wilderness
overlay is merely empty (beeatlas-2vj).
"""
from __future__ import annotations

import json

import pytest

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
    _write(tmp_path / "ecoregions_l4.geojson", [{"type": "Feature", "geometry": None, "properties": {}}])
    _write(tmp_path / "wilderness.geojson", [])

    topology_postprocess.main()

    assert "wilderness.geojson" not in called, "mapshaper must be skipped for a 0-feature file"
    assert set(called) == {"counties.geojson", "ecoregions.geojson", "ecoregions_l4.geojson"}
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


# --- The feedback guard (beeatlas-0yv) -------------------------------------
#
# Before beeatlas-hyq this step wrote its simplified result back over the raw
# mart. Those files are still in the RAW slot of any long-lived EXPORT_DIR, so a
# later run re-simplifies an already-simplified file and the layer gets quietly
# coarser every time — how the published ecoregions reached 761 vertices over 64
# features when one honest pass over the mart gives 4,674.

def _poly(n):
    """A Feature whose single ring has n positions."""
    ring = [[float(i), float(i)] for i in range(n)]
    return {"type": "Feature", "properties": {},
            "geometry": {"type": "Polygon", "coordinates": [ring]}}


def test_input_carrying_meta_is_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(topology_postprocess, "_EXPORT_DIR", tmp_path)
    monkeypatch.setattr(topology_postprocess, "_run_mapshaper",
                        lambda src, dst: dst.write_text(src.read_text()))

    _write(tmp_path / "counties.geojson", [_poly(4)])
    _write(tmp_path / "ecoregions_l4.geojson", [_poly(4)])
    # ecoregions.geojson is this step's own output fed back in
    (tmp_path / "ecoregions.geojson").write_text(json.dumps({
        "type": "FeatureCollection", "features": [_poly(4)],
        "_meta": {"git_sha": "deadbeef", "built_at": "2026-07-10T18:33:47Z"},
    }))
    _write(tmp_path / "wilderness.geojson", [])

    with pytest.raises(RuntimeError) as exc:
        topology_postprocess.main()
    # The message has to name the file AND say what to do — this fires on a
    # nightly, read by someone who has never seen this failure before.
    assert "ecoregions.geojson" in str(exc.value)
    assert "deadbeef" in str(exc.value)
    assert "place-marts" in str(exc.value)


def test_clean_dbt_mart_is_accepted(tmp_path, monkeypatch):
    """The guard must not fire on a real mart, which never carries _meta."""
    monkeypatch.setattr(topology_postprocess, "_EXPORT_DIR", tmp_path)
    monkeypatch.setattr(topology_postprocess, "_run_mapshaper",
                        lambda src, dst: dst.write_text(src.read_text()))
    for name in ("counties.geojson", "ecoregions.geojson", "ecoregions_l4.geojson"):
        _write(tmp_path / name, [_poly(4)])
    _write(tmp_path / "wilderness.geojson", [])

    topology_postprocess.main()  # must not raise

    assert "_meta" in json.loads((tmp_path / "ecoregions.clean.geojson").read_text())


def test_vertices_are_counted_for_both_polygon_kinds():
    ring = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 0.0]]
    obj = {"features": [
        {"geometry": {"type": "Polygon", "coordinates": [ring, ring]}},
        {"geometry": {"type": "MultiPolygon", "coordinates": [[ring], [ring, ring]]}},
        {"geometry": None},          # tolerated: the empty-overlay fixture uses these
        {},
    ]}
    assert topology_postprocess._count_vertices(obj) == 4 * 5


def test_vertex_counts_are_reported(tmp_path, monkeypatch, capsys):
    """Bytes alone hid this: they move for reasons unrelated to detail."""
    monkeypatch.setattr(topology_postprocess, "_EXPORT_DIR", tmp_path)

    def _halve(src, dst):
        obj = json.loads(src.read_text())
        obj["features"] = [_poly(2)]
        dst.write_text(json.dumps(obj))

    monkeypatch.setattr(topology_postprocess, "_run_mapshaper", _halve)
    for name in ("counties.geojson", "ecoregions.geojson", "ecoregions_l4.geojson"):
        _write(tmp_path / name, [_poly(10)])
    _write(tmp_path / "wilderness.geojson", [])

    topology_postprocess.main()

    out = capsys.readouterr().out
    assert "10 -> 2 vertices" in out

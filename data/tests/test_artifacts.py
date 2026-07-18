"""pytest suite for data/artifacts.py — Phase 176 Plan 01.

Covers:
- Real contract: 17 artifacts load and validate (in manifest order)
- Fail-loud invariants: every validate() rule has a test
- SEAM-04 synthetic authoritative: authoritative artifact excluded from baseline pull set
- SC-3 set-equality regression floor: baseline / build-time-fetch sets locked to
  nightly.sh LOCAL_NAMES and deploy.yml fetch step, respectively
- Byte-exact manifest golden: proves render_manifest() reproduces nightly.sh
  heredoc layout (indent, key order, occurrences_db_tables inline, trailing comma
  placement, trailing newline)
- Manifest coverage failure: missing/extra keys in name_map raise ValueError

Do NOT add @pytest.mark.integration — this entire file runs in the fast-default tier.
"""

import pytest

from artifacts import (
    load,
    validate,
    hashed_artifacts,
    metadata_artifacts,
    baseline_diff_artifacts,
    build_time_fetch_artifacts,
    authoritative_names,
    render_manifest,
)

# ---------------------------------------------------------------------------
# SC-3 regression anchor: these literals mirror nightly.sh LOCAL_NAMES and
# deploy.yml fetch step EXACTLY. A future contract edit that drifts them turns
# tests red — that is the intended behaviour.
# ---------------------------------------------------------------------------

# From nightly.sh lines 153–162 (LOCAL_NAMES dict)
_EXPECTED_BASELINE = {
    "occurrences": "occurrences.parquet",
    # counties/ecoregions publish the topology-cleaned .clean.geojson (beeatlas-hyq);
    # collectors publishes the event-enriched collectors.events.json.
    "counties": "counties.clean.geojson",
    "ecoregions": "ecoregions.clean.geojson",
    "species": "species.json",
    "seasonality": "seasonality.json",
    "higher_taxa": "higher_taxa.json",
    "photos": "photos.json",
    "collectors": "collectors.events.json",
    "species_hosts": "species_hosts.json",
}

# From .github/workflows/deploy.yml lines 49–67 (7 fetches; species_hosts and
# notes optional — Phase 179 D-09/A3: notes is authoritative and has no
# pre-first-nightly manifest key either, same guard as species_hosts).
# Value = build_time_fetch_optional
_EXPECTED_BUILD_TIME_FETCH = {
    "species": False,
    "seasonality": False,
    "higher_taxa": False,
    "collectors": False,
    "collector_event_pages": False,
    "place_details": True,
    "species_hosts": True,
    "notes": True,
}

# Byte-exact manifest golden (reproduces nightly.sh heredoc layout).
# 2-space indent, comma after every line except the last (generated_at),
# occurrences_db_tables is inline compact JSON (no outer quotes),
# generated_at is double-quoted, trailing newline after }.
# Constructed from a synthetic map: each hashed value = <name>-DEADBEEF0000.<ext>.
_GOLDEN_MANIFEST = """\
{
  "occurrences": "occurrences-DEADBEEF0000.parquet",
  "occurrences_db": "occurrences_db-DEADBEEF0000.db",
  "species": "species-DEADBEEF0000.json",
  "seasonality": "seasonality-DEADBEEF0000.json",
  "higher_taxa": "higher_taxa-DEADBEEF0000.json",
  "counties": "counties-DEADBEEF0000.geojson",
  "ecoregions": "ecoregions-DEADBEEF0000.geojson",
  "wilderness": "wilderness-DEADBEEF0000.geojson",
  "places": "places-DEADBEEF0000.geojson",
  "places_meta": "places_meta-DEADBEEF0000.json",
  "place_details": "place_details-DEADBEEF0000.json",
  "checklist": "checklist-DEADBEEF0000.parquet",
  "photos": "photos-DEADBEEF0000.json",
  "species_hosts": "species_hosts-DEADBEEF0000.json",
  "collectors": "collectors-DEADBEEF0000.json",
  "collector_event_pages": "collector_event_pages-DEADBEEF0000.json",
  "notes": "notes-DEADBEEF0000.json",
  "occurrences_db_tables": ["a","b"],
  "generated_at": "2026-01-01T00:00:00Z"
}
"""

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _write_toml(tmp_path, content: str):
    """Write a TOML string to a temp file and return its Path."""
    p = tmp_path / "test_contract.toml"
    p.write_bytes(content.encode("utf-8"))
    return p


# ---------------------------------------------------------------------------
# 1. Real contract: load + validate
# ---------------------------------------------------------------------------

def test_load_returns_19_artifacts():
    """Loader returns 19 artifacts from the real contract."""
    spec = load()
    assert len(spec) == 19


def test_validate_passes_real_contract():
    """validate() does not raise on the real contract."""
    spec = load()
    validate(spec)  # must not raise


def test_artifact_order():
    """19 artifacts are declared in manifest order (matching nightly.sh heredoc)."""
    spec = load()
    expected = [
        "occurrences", "occurrences_db", "species", "seasonality", "higher_taxa",
        "counties", "ecoregions", "wilderness", "places", "places_meta", "place_details",
        "checklist", "photos", "species_hosts", "collectors", "collector_event_pages",
        "notes", "occurrences_db_tables", "generated_at",
    ]
    assert list(spec.keys()) == expected


# ---------------------------------------------------------------------------
# 2. Fail-loud invariants — each builds a small invalid temp toml
# ---------------------------------------------------------------------------

def test_validate_unknown_kind(tmp_path):
    """validate() raises ValueError on an unknown artifact kind."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "bogus"
source_file = "foo.json"
hash_basename = "foo"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="unknown kind"):
        validate(spec)


def test_validate_unknown_provenance(tmp_path):
    """validate() raises ValueError on an unknown provenance value."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "third-party"
kind = "hashed"
source_file = "foo.json"
hash_basename = "foo"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="unknown provenance"):
        validate(spec)


def test_validate_metadata_with_source_file(tmp_path):
    """validate() raises ValueError when a metadata artifact declares source_file."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "metadata"
metadata_type = "json"
source_file = "foo.json"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="must not have 'source_file'"):
        validate(spec)


def test_validate_metadata_with_hash_basename(tmp_path):
    """validate() raises ValueError when a metadata artifact declares hash_basename."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "metadata"
metadata_type = "string"
hash_basename = "foo"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="must not have 'hash_basename'"):
        validate(spec)


def test_validate_authoritative_with_baseline_diff(tmp_path):
    """validate() raises ValueError when an authoritative artifact has baseline_diff=true."""
    p = _write_toml(tmp_path, """
[artifacts.notes]
provenance = "authoritative"
kind = "hashed"
source_file = "notes.json"
hash_basename = "notes"
baseline_diff = true
""")
    spec = load(p)
    with pytest.raises(ValueError, match="authoritative"):
        validate(spec)


def test_validate_hashed_missing_source_file(tmp_path):
    """validate() raises ValueError when a hashed artifact is missing source_file."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "hashed"
hash_basename = "foo"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="missing required field 'source_file'"):
        validate(spec)


def test_validate_hashed_missing_hash_basename(tmp_path):
    """validate() raises ValueError when a hashed artifact is missing hash_basename."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "hashed"
source_file = "foo.json"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="missing required field 'hash_basename'"):
        validate(spec)


def test_validate_content_type_on_metadata(tmp_path):
    """validate() raises ValueError when a metadata artifact has content_type."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "metadata"
metadata_type = "json"
content_type = "application/json"
""")
    spec = load(p)
    with pytest.raises(ValueError, match="'content_type' is only valid for hashed artifacts"):
        validate(spec)


def test_validate_build_time_fetch_optional_without_fetch(tmp_path):
    """validate() raises ValueError when build_time_fetch_optional=true but build_time_fetch=false."""
    p = _write_toml(tmp_path, """
[artifacts.foo]
provenance = "derived"
kind = "hashed"
source_file = "foo.json"
hash_basename = "foo"
build_time_fetch_optional = true
""")
    spec = load(p)
    with pytest.raises(ValueError, match="build_time_fetch_optional=true requires build_time_fetch=true"):
        validate(spec)


# ---------------------------------------------------------------------------
# 3. SEAM-04 synthetic authoritative (derived-vs-authoritative split)
# ---------------------------------------------------------------------------

def test_synthetic_authoritative_excluded_from_baseline(tmp_path):
    """SEAM-04: a valid authoritative artifact (baseline_diff=false) passes validate()
    and is absent from baseline_diff_artifacts()."""
    p = _write_toml(tmp_path, """
[artifacts.notes]
provenance = "authoritative"
kind = "hashed"
source_file = "notes.json"
hash_basename = "notes"
""")
    spec = load(p)
    validate(spec)  # must not raise: authoritative with baseline_diff=false is valid
    assert authoritative_names(spec) == ["notes"]
    assert "notes" not in baseline_diff_artifacts(spec)


def test_synthetic_authoritative_with_baseline_diff_fails(tmp_path):
    """SEAM-04: authoritative + baseline_diff=true is structurally prohibited."""
    p = _write_toml(tmp_path, """
[artifacts.notes]
provenance = "authoritative"
kind = "hashed"
source_file = "notes.json"
hash_basename = "notes"
baseline_diff = true
""")
    spec = load(p)
    with pytest.raises(ValueError, match="authoritative"):
        validate(spec)


# ---------------------------------------------------------------------------
# 4. SC-3 set-equality regression floor
# ---------------------------------------------------------------------------

def test_baseline_diff_artifacts_set_equality():
    """SC-3: baseline_diff artifact names == nightly.sh LOCAL_NAMES keys (9 names)."""
    spec = load()
    baseline = baseline_diff_artifacts(spec)
    assert set(baseline.keys()) == set(_EXPECTED_BASELINE.keys()), (
        f"drift detected — update _EXPECTED_BASELINE or artifacts.toml: "
        f"missing={set(_EXPECTED_BASELINE) - set(baseline)}, "
        f"extra={set(baseline) - set(_EXPECTED_BASELINE)}"
    )


def test_baseline_diff_source_files():
    """SC-3: each baseline artifact's source_file matches nightly.sh LOCAL_NAMES value."""
    spec = load()
    baseline = baseline_diff_artifacts(spec)
    for name, expected_source in _EXPECTED_BASELINE.items():
        actual = baseline[name]["source_file"]
        assert actual == expected_source, (
            f"source_file mismatch for {name!r}: expected {expected_source!r}, got {actual!r}"
        )


def test_baseline_files_plan(capsys):
    """Model Y: the baseline-files verb emits name<TAB>source_file for every
    baseline_diff artifact in declared order — nightly.sh's local
    snapshot/restore plan for the integration-gate baseline."""
    from artifacts import _cmd_baseline_files
    spec = load()
    _cmd_baseline_files(spec)
    lines = capsys.readouterr().out.strip().splitlines()
    assert dict(line.split("\t") for line in lines) == _EXPECTED_BASELINE
    assert [line.split("\t")[0] for line in lines] == list(baseline_diff_artifacts(spec))


def test_build_time_fetch_artifacts_set_equality():
    """SC-3: build_time_fetch artifact names == deploy.yml fetch-step keys (7 names),
    with species_hosts and notes optional=true, all others optional=false."""
    spec = load()
    btf = build_time_fetch_artifacts(spec)
    assert set(btf.keys()) == set(_EXPECTED_BUILD_TIME_FETCH.keys()), (
        f"drift detected — update _EXPECTED_BUILD_TIME_FETCH or artifacts.toml"
    )
    for name, expected_optional in _EXPECTED_BUILD_TIME_FETCH.items():
        actual_optional = btf[name].get("build_time_fetch_optional", False)
        assert actual_optional == expected_optional, (
            f"build_time_fetch_optional mismatch for {name!r}: "
            f"expected {expected_optional}, got {actual_optional}"
        )


# ---------------------------------------------------------------------------
# 5. Byte-exact manifest golden
# ---------------------------------------------------------------------------

def test_byte_exact_manifest_golden():
    """render_manifest() reproduces nightly.sh heredoc byte-exactly.

    Fails if any of these change: 2-space indent, key order, occurrences_db_tables
    inline-array formatting, trailing-comma placement, or trailing newline.
    """
    spec = load()
    hashed = hashed_artifacts(spec)
    # Construct synthetic map: each value = <logical_name>-DEADBEEF0000.<ext>
    name_map = {
        name: f"{name}-DEADBEEF0000.{fields['source_file'].rsplit('.', 1)[-1]}"
        for name, fields in hashed.items()
    }
    meta_map = {
        "occurrences_db_tables": '["a","b"]',
        "generated_at": "2026-01-01T00:00:00Z",
    }
    result = render_manifest(spec, name_map, meta_map)
    assert result == _GOLDEN_MANIFEST, (
        "manifest byte layout drifted from nightly.sh heredoc — "
        "check indent, key order, trailing comma, and trailing newline"
    )


# ---------------------------------------------------------------------------
# 6. Manifest coverage failures
# ---------------------------------------------------------------------------

def test_manifest_missing_hashed_key_raises():
    """render_manifest() raises ValueError when name_map is missing a hashed key."""
    spec = load()
    hashed = hashed_artifacts(spec)
    # Build a complete name_map then remove one key
    name_map = {name: f"{name}-DEADBEEF0000.x" for name in hashed}
    del name_map["species"]  # remove one
    meta_map = {
        "occurrences_db_tables": "[]",
        "generated_at": "2026-01-01T00:00:00Z",
    }
    with pytest.raises(ValueError, match="missing hashed keys"):
        render_manifest(spec, name_map, meta_map)


def test_manifest_extra_hashed_key_raises():
    """render_manifest() raises ValueError when name_map contains an unknown key."""
    spec = load()
    hashed = hashed_artifacts(spec)
    name_map = {name: f"{name}-DEADBEEF0000.x" for name in hashed}
    name_map["totally_unknown_artifact"] = "unknown-DEADBEEF0000.json"  # extra
    meta_map = {
        "occurrences_db_tables": "[]",
        "generated_at": "2026-01-01T00:00:00Z",
    }
    with pytest.raises(ValueError, match="extra/unknown hashed keys"):
        render_manifest(spec, name_map, meta_map)

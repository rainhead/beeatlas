"""pytest suite for data/artifacts.py — Phase 176 Plan 01.

Covers:
- Real contract: 17 artifacts load and validate (in manifest order)
- Fail-loud invariants: every validate() rule has a test
- SEAM-04 synthetic authoritative: authoritative artifact excluded from baseline pull set
- SC-3 set-equality regression floor: the baseline set locked to nightly.sh
  LOCAL_NAMES
  (The manifest-golden and build-time-fetch tests died with st-vjd along with
  render_manifest and the deploy.yml fetch step.)

Do NOT add @pytest.mark.integration — this entire file runs in the fast-default tier.
"""

import pytest

from artifacts import (
    load,
    validate,
    hashed_artifacts,
    metadata_artifacts,
    baseline_diff_artifacts,
    authoritative_names,
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

# (The _EXPECTED_BUILD_TIME_FETCH and _GOLDEN_MANIFEST fixtures that lived here
# died with their tests: st-vjd retired render_manifest + the deploy.yml fetch
# step, and beeatlas-6x9 retired the notes.json artifact they both listed.)

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

def test_load_returns_18_artifacts():
    """Loader returns 18 artifacts from the real contract (notes retired,
    beeatlas-6x9: the per-species notes/ dir is a build-time export with no
    manifest presence, so it has no artifacts.toml entry)."""
    spec = load()
    assert len(spec) == 18


def test_validate_passes_real_contract():
    """validate() does not raise on the real contract."""
    spec = load()
    validate(spec)  # must not raise


def test_artifact_order():
    """18 artifacts are declared in manifest order (matching nightly.sh heredoc)."""
    spec = load()
    expected = [
        "occurrences", "occurrences_db", "species", "seasonality", "higher_taxa",
        "counties", "ecoregions", "wilderness", "places", "places_meta", "place_details",
        "checklist", "photos", "species_hosts", "collectors", "collector_event_pages",
        "occurrences_db_tables", "generated_at",
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






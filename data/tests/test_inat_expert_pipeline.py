"""Fast-tier tests for inat_expert_pipeline (beeatlas-iek/9sy) — the pure
transform and the register-derived roster; no network, no DB."""

import inat_expert_pipeline as mod


def test_transform_flattens_geojson_and_stamps_identifications():
    item = {
        "id": 284980903,
        "geojson": {"coordinates": [-119.26, 46.31]},
        "ofvs": [
            {"name": "Associated species with names lookup", "value": "Salix"},
            {"name": "sampleid", "value": "42"},
        ],
        "photos": [{"url": "https://static.example/photos/1/square.jpg"}],
        "identifications": [
            {"uuid": "a", "taxon": {"id": 176755, "ancestor_ids": [1, 47201, 176755]}},
            {"uuid": "b", "taxon": {"id": 176755}},
        ],
    }
    out = mod._transform(item)

    assert out["longitude"] == -119.26 and out["latitude"] == 46.31
    assert "geojson" not in out
    # OFV name matching is case-insensitive; non-host OFVs ignored
    assert out["floral_host"] == "Salix"
    assert "ofvs" not in out
    # square thumbnail upgraded to medium; photos list consumed
    assert out["image_url"] == "https://static.example/photos/1/medium.jpg"
    assert "photos" not in out
    # every identification stamped with its observation id (no _dlt_parent_id
    # join downstream), ancestor_ids comma-joined so dlt keeps it a column
    for ident in out["identifications"]:
        assert ident["observation_id"] == 284980903
    assert out["identifications"][0]["taxon"]["ancestor_ids"] == "1,47201,176755"
    assert "ancestor_ids" not in out["identifications"][1]["taxon"]


def test_transform_tolerates_absent_optionals():
    out = mod._transform({"id": 1})
    assert out["floral_host"] is None
    assert out["image_url"] is None
    assert "longitude" not in out


def test_expert_roster_reads_register_experts():
    """The roster is the register's is_expert rows with an inat_login —
    ADR 0033 item 5: the register is the single expert-status authority."""
    roster = mod._expert_roster()
    assert len(roster) >= 15
    assert roster == sorted(roster)
    assert "johnascher" in roster and "zportman" in roster and "hadel" in roster
    # non-experts with logins must NOT be swept in
    assert "rainhead" not in roster and "karen_wright" not in roster
    assert all(r and " " not in r for r in roster)

"""The Machine finishes the nightly's publish from the staged build (data/finish-publish.sh,
ADR 0046, beeatlas-uibw.5).

These run THE REAL SCRIPT and the real build receipt (scripts/build-receipt.mjs and the
two lib files it imports), copied into a scratch checkout, against a scratch volume.
data/publish-notes.sh is replaced by a stand-in that records what it was handed: the
harvest, render and merge-swap it runs are covered where they live. What is pinned here
is what this script owns: when it refuses, what it installs, which notes it keeps, and
which species it asks to have re-rendered.
"""

import fcntl
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

DATA = Path(__file__).resolve().parents[1]
ROOT = DATA.parent

STAND_IN = """#!/usr/bin/env bash
# Records how it was called, as data/publish-notes.sh would be.
python3 - "$CALLED" <<'PY'
import json, os, sys
json.dump({k: os.environ.get(k) for k in
           ("PUBLISH_LOCK_HELD", "EXTRA_RENDER_KEYS", "PUBLISH_PATH")},
          open(sys.argv[1], "w"))
PY
exit "${STAND_IN_EXIT:-0}"
"""


def write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return path


def receipt(repo: Path, mode: str, env: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", str(repo / "scripts/build-receipt.mjs"), mode],
        capture_output=True, text=True, env={**os.environ, **env},
    )


@pytest.fixture
def machine(tmp_path):
    """A checkout, a live tree as the last publish left it, and a build staged by
    Hostess from the same checkout."""
    repo = tmp_path / "app"
    for f in ("scripts/build-receipt.mjs", "lib/build-data-dir.js", "lib/vite-manifest.js",
              "data/finish-publish.sh"):
        (repo / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / f, repo / f)
    write(repo / "data/publish-notes.sh", STAND_IN).chmod(0o755)
    write(repo / "package.json", "{}")
    write(repo / "_pages/species.njk", "species page")

    var = tmp_path / "var"
    export = var / "export"
    # The live tree: last night's.
    write(export / "species.json", "last night")
    write(export / "notes/agapostemon virescens.json", "same note")
    write(export / "notes/bombus vosnesenskii.json", "saved during the build")
    write(export / "notes/osmia lignaria.json", "first note, saved during the build")
    write(repo / "_site/index.html", "last night's page")
    write(repo / ".cache/beeatlas-vite/manifest.json", '{"old": true}')

    # Hostess's build, with the copy of notes/ it took at the start of its run.
    staging = tmp_path / "staging"
    write(staging / "export/species.json", "tonight")
    write(staging / "export/notes/agapostemon virescens.json", "same note")
    write(staging / "export/notes/bombus vosnesenskii.json", "before the save")
    write(staging / "export/notes/andrena fulva.json", "deleted during the build")
    write(staging / "site/index.html", "tonight's page")
    write(staging / "site/species/agapostemon-virescens.html", "a species page")
    write(staging / "cache/beeatlas-vite/manifest.json", '{"new": true}')
    staged = {
        "EXPORT_DIR": str(staging / "export"),
        "BEEATLAS_SITE_DIR": str(staging / "site"),
        "BEEATLAS_CACHE_DIR": str(staging / "cache"),
    }
    assert receipt(repo, "--write", staged).returncode == 0

    env = {
        **os.environ,
        "VAR_DIR": str(var),
        "EXPORT_DIR": str(export),
        "STAGING": str(staging),
        "STAGING_LOCK": str(var / "staging.lock"),
        "PUBLISH_LOCK_WAIT": "1",
        "CALLED": str(tmp_path / "called.json"),
    }
    return {"repo": repo, "var": var, "export": export, "staging": staging,
            "env": env, "called": tmp_path / "called.json"}


def finish(m, **env) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(m["repo"] / "data/finish-publish.sh")],
        capture_output=True, text=True, env={**m["env"], **env},
    )


def outcome(r: subprocess.CompletedProcess) -> str:
    return r.stdout.strip().splitlines()[-1]


def test_it_installs_the_staged_build_and_keeps_the_machines_notes(machine):
    r = finish(machine)
    assert r.returncode == 0, r.stdout + r.stderr
    assert outcome(r) == "finish-publish: published"

    export, repo = machine["export"], machine["repo"]
    assert (export / "species.json").read_text() == "tonight"
    assert (repo / "_site/index.html").read_text() == "tonight's page"
    assert (repo / "_site/species/agapostemon-virescens.html").exists()
    assert json.loads((repo / ".cache/beeatlas-vite/manifest.json").read_text()) == {"new": True}
    # notes/ is the Machine's, not the copy Hostess took.
    assert sorted(p.name for p in (export / "notes").iterdir()) == [
        "agapostemon virescens.json", "bombus vosnesenskii.json", "osmia lignaria.json"]
    assert (export / "notes/bombus vosnesenskii.json").read_text() == "saved during the build"
    # The installed tree is one a note save can render over.
    assert receipt(repo, "--check", {"EXPORT_DIR": str(export)}).returncode == 0


def test_it_asks_for_every_species_whose_notes_differ_from_hostesss_copy(machine):
    """Changed, added and deleted during the build: Hostess's pages lack all three, and
    the Machine's harvest had already seen them, so it would not move them again."""
    assert finish(machine).returncode == 0
    called = json.loads(machine["called"].read_text())
    assert sorted(called["EXTRA_RENDER_KEYS"].splitlines()) == [
        "andrena fulva", "bombus vosnesenskii", "osmia lignaria"]
    assert called["PUBLISH_LOCK_HELD"] == "1"
    assert called["PUBLISH_PATH"] == "nightly"


def test_a_build_from_other_code_is_stale_and_changes_nothing(machine):
    write(machine["repo"] / "_pages/species.njk", "a template deployed since")
    r = finish(machine)
    assert r.returncode == 79
    assert outcome(r) == "finish-publish: stale"
    assert (machine["export"] / "species.json").read_text() == "last night"
    assert not machine["called"].exists()


def test_a_held_publish_lock_is_busy_and_changes_nothing(machine):
    machine["var"].mkdir(parents=True, exist_ok=True)
    with open(machine["var"] / "publish.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        r = finish(machine)
    assert r.returncode == 75
    assert outcome(r) == "finish-publish: busy"
    assert (machine["export"] / "species.json").read_text() == "last night"


def test_nothing_staged_is_a_failure_not_stale(machine):
    shutil.rmtree(machine["staging"] / "site")
    r = finish(machine)
    assert r.returncode == 1
    assert outcome(r) == "finish-publish: failed"
    assert (machine["export"] / "species.json").read_text() == "last night"


def test_a_failed_publish_is_reported_as_failed(machine):
    r = finish(machine, STAND_IN_EXIT="1")
    assert r.returncode == 1
    assert outcome(r) == "finish-publish: failed"

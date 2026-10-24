"""merge-swap copies only new data files and keeps the age-prune honest (beeatlas-gcdo.2).

A note save used to spend about 9 s recopying ~140 MB of _site/data to the volume,
because postbuild-data rewrites every file with a fresh mtime and `rsync -a` takes a
new mtime as a change. The data files are named by a hash of their content, so
merge-swap now copies only names that are new, and refreshes the mtime of the live
copy of every file the build names, because the 30-day age-prune reads it.

These run THE REAL SCRIPT, copied into a scratch repo layout (it finds _site from
its own location), against a scratch SITE_ROOT. A live file that the publish must
leave alone is given bytes the build does not have, so "was it copied?" is answered
by reading it back, not by trusting timing.
"""

import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

MERGE_SWAP = Path(__file__).resolve().parents[1] / "merge-swap.sh"
DAY = 86400

HASHED = "occurrences-0123456789ab.db"
NEW_HASHED = "species-ba9876543210.json"


def write(path: Path, text: str, age_days: float = 0) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    if age_days:
        t = time.time() - age_days * DAY
        os.utime(path, (t, t))
    return path


def age_days(path: Path) -> float:
    return (time.time() - path.stat().st_mtime) / DAY


@pytest.fixture
def layout(tmp_path):
    repo = tmp_path / "repo"
    (repo / "data").mkdir(parents=True)
    shutil.copy(MERGE_SWAP, repo / "data" / "merge-swap.sh")
    site = repo / "_site"
    write(site / "index.html", "new page")
    write(site / "assets" / "app-aaaaaaaa.js", "js")
    write(site / "data" / "manifest.json", '{"new": true}')
    write(site / "data" / HASHED, "build bytes")
    write(site / "data" / NEW_HASHED, "new artifact")
    # Stable-URL dirs, written fresh by every build.
    write(site / "data" / "feeds" / "same.xml", "same")
    write(site / "data" / "feeds" / "changed.xml", "after")
    write(site / "data" / "species-maps" / "a.svg", "svg")
    write(site / "data" / "place-maps" / "b.svg", "svg")

    root = tmp_path / "htdocs"
    write(root / "index.html", "old page", age_days=1)
    write(root / "data" / "manifest.json", '{"old": true}')
    # Same name as the build's, different bytes, past the prune age: it must be
    # neither recopied nor pruned.
    write(root / "data" / HASHED, "live bytes!", age_days=40)
    # Named by no build any more: pruned when old, kept when recent.
    write(root / "data" / "occurrences-ffffffffffff.db", "stale", age_days=40)
    write(root / "data" / "occurrences-eeeeeeeeeeee.db", "recent", age_days=10)
    # Unchanged bytes under an older mtime: left in place, not recopied.
    write(root / "data" / "feeds" / "same.xml", "same", age_days=3)
    # Changed bytes under the same size and mtime as the build's, which rsync's
    # default quick check would take as unchanged: still copied.
    changed = write(root / "data" / "feeds" / "changed.xml", "befor")
    built = (site / "data" / "feeds" / "changed.xml").stat()
    os.utime(changed, ns=(built.st_atime_ns, built.st_mtime_ns))
    write(root / "data" / "feeds" / "removed.xml", "gone")
    return repo, root


def run(repo: Path, root: Path) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k != "BEEATLAS_CONTAINER"}
    env["SITE_ROOT"] = str(root)
    return subprocess.run(["bash", str(repo / "data" / "merge-swap.sh")],
                          env=env, capture_output=True, text=True)


def test_a_hashed_file_already_live_is_not_recopied_but_is_kept_from_the_prune(layout):
    repo, root = layout
    result = run(repo, root)
    assert result.returncode == 0, result.stderr
    live = root / "data" / HASHED
    assert live.read_text() == "live bytes!"
    assert age_days(live) < 1


def test_new_names_are_copied_and_unnamed_old_ones_pruned(layout):
    repo, root = layout
    assert run(repo, root).returncode == 0
    assert (root / "data" / NEW_HASHED).read_text() == "new artifact"
    assert not (root / "data" / "occurrences-ffffffffffff.db").exists()
    assert (root / "data" / "occurrences-eeeeeeeeeeee.db").exists()


def test_stable_dirs_copy_only_what_changed_and_prune_what_left(layout):
    repo, root = layout
    feeds = root / "data" / "feeds"
    inode = (feeds / "same.xml").stat().st_ino
    assert run(repo, root).returncode == 0
    # A copy would be a new inode: rsync writes a temporary file and renames it in.
    assert (feeds / "same.xml").stat().st_ino == inode
    assert (feeds / "changed.xml").read_text() == "after"
    assert not (feeds / "removed.xml").exists()


def test_pages_and_manifest_are_swapped(layout):
    repo, root = layout
    assert run(repo, root).returncode == 0
    assert (root / "index.html").read_text() == "new page"
    assert (root / "data" / "manifest.json").read_text() == '{"new": true}'


@pytest.mark.parametrize("path, reported", [
    ("species.json", "species.json"),
    # A hash somewhere in the name is not enough: the whole name must be the form
    # postbuild-data writes, or a renamed or backup file could slip through.
    ("species-0123456789ab.json.bak", "species-0123456789ab.json.bak"),
    # Hidden names count too: the check must see everything rsync copies.
    ("..hidden", "..hidden"),
    # A new directory: rsync would recurse into it under --ignore-existing.
    ("search/catalog.json", "search"),
])
def test_an_entry_not_named_by_a_hash_refuses_before_publishing_anything(layout, path, reported):
    # It would be copied once and then never updated, so it must not get that far.
    repo, root = layout
    write(repo / "_site" / "data" / path, "unhashed")
    result = run(repo, root)
    assert result.returncode != 0
    assert reported in result.stderr
    assert (root / "index.html").read_text() == "old page"
    assert (root / "data" / "manifest.json").read_text() == '{"old": true}'
    assert not (root / "data" / NEW_HASHED).exists()

#!/usr/bin/env bash
# The image's offline gate (beeatlas-3je9, beeatlas-uibw.7): does the Machine do its
# work without fetching any code or dependency at runtime?
#
#   fly/offline-gate.sh <image>                # the toolchain
#   fly/offline-gate.sh <image> <export dir>   # plus what the Machine runs
#
# Both forms run with the network off entirely.
#
# The first form proves every tool the Machine calls answers from the image: node,
# pnpm, uv's Python with what the API, the note harvest and the notes backup import
# (through a bare `uv run`, as Stelis launches the harvest, which must find the
# environment in sync), the DuckDB CLI loading sqlite_scanner, and Stelis loading the
# beeatlas graph. It also proves the pipeline is NOT there: the image installs no
# dependency group (ADR 0046), so importing dlt must fail. The image workflow runs
# this form on every change.
#
# The second form runs, against a copy of an export (Hostess's, at
# ~/beeatlas-nightly/var/export, or one pulled from the Machine), the three things
# the Machine does with it, each in a container of its own:
#
#   deploy render   data/publish-code.sh, as a new image's first boot runs it: with
#                   no build receipt yet, the data test gate and a full render
#   first note      a notes store made here (the migrations, then notes_store.seed's
#                   sample notes) and data/publish-notes.sh, which in a fresh Stelis
#                   state dir harvests every species
#   edited note     one seeded note's body changed, then data/publish-notes.sh,
#                   which must harvest and render that one species
#
# No production notes are involved: the store is the seed's (ADR 0046 keeps the
# notes store off Hostess), and no DuckDB is given, so a note save that reached for
# the pipeline's database would fail here. Each step prints its container's memory
# peak (the cgroup's memory.peak), which is what the Machine's size is chosen by: the
# deploy render's is the floor, since a note save whose receipt check fails falls
# back to a full render. memory.peak counts the page cache the kernel could have
# reclaimed, so it overstates the need; GATE_MEMORY (a docker size, such as 1600m)
# runs every step under that hard limit with no swap instead, which is the test of
# whether a smaller Machine is enough. Then, for each step, every file it wrote into
# the image instead of the volume (ADR 0044).
#
# Both forms mount a private, throwaway /data laid out like the volume (the image's
# symlinks into it dangle otherwise) and run the container as the invoking user, so
# the copy is opened to nobody else on this host. That user is not the image's
# `app`, so everything the run writes is pointed at /data (uv's cache, HOME); the
# image's own trees are world-readable, which is all the work needs of them.
#
# Exit status: non-zero means something was fetched, failed, or did not do what the
# Machine relies on.

set -euo pipefail

image=${1:?usage: offline-gate.sh <image> [<export dir>]}
export_src=${2:-}

volume=$(mktemp -d)
containers=()
cleanup() {
    for c in ${containers[@]+"${containers[@]}"}; do docker rm -f "$c" > /dev/null 2>&1 || true; done
    rm -rf "$volume"
}
trap cleanup EXIT
mkdir -p "$volume"/{var/export,var/stelis,htdocs,notes,cache,site,log,home,uv-cache}
# DuckDB looks for its extensions under $HOME/.duckdb. The image installs them under
# app's home (fly/Dockerfile), and this HOME is a throwaway one, so it points there.
ln -s /home/app/.duckdb "$volume/home/.duckdb"
run=(docker run --network none --user "$(id -u):$(id -g)" -v "$volume:/data"
     -e HOME=/data/home -e UV_CACHE_DIR=/data/uv-cache)
if [[ -n "${GATE_MEMORY:-}" ]]; then
    run+=(--memory "$GATE_MEMORY" --memory-swap "$GATE_MEMORY")
fi

toolchain='
set -euo pipefail
echo "node   $(node --version)"
echo "pnpm   $(pnpm --version)"
echo "uv     $(uv --version)"
echo "duckdb $(duckdb --version)"
# Each probe is assigned on its own line: inside an echo, its failure would be lost.
# A bare `uv run`, as the Stelis graph launches the note harvest (src/beeatlas.rkt,
# the uv runtime): it must find the environment in sync and reach for nothing.
python=$(cd /app/data && uv run python -c "import sys, notes_harvest, backup_notes, s3_backup, alembic, notes_store.render; print(sys.version.split()[0])")
echo "python $python: the note harvest, the notes backup, the migrations"
# The API with data/ on its path, as api/serve.py puts it there.
api=$(cd /app && PYTHONPATH=/app/data uv run --project /app/data python -c "import api.main; print(\"imports\")")
echo "api    $api"
if (cd /app/data && uv run python -c "import dlt" 2> /dev/null); then
    echo "offline-gate: dlt imports, so the pipeline is in the image; it belongs in data/pyproject.toml'"'"'s pipeline group" >&2
    exit 1
fi
echo "pipeline absent, as intended"
duckdb -c "LOAD sqlite_scanner" > /dev/null
echo "duckdb loads sqlite_scanner"
bash /opt/stelis/scripts/preflight.sh
(cd /opt/stelis && BEEATLAS_DIR=/app SOURCE_DATE_EPOCH=1700000000 racket src/main.rkt --project beeatlas --help > /dev/null)
echo "stelis  loads the beeatlas graph"
echo "offline-gate: toolchain answers with no network"
'

if [[ -z "$export_src" ]]; then
    chmod -R u+rwX,go-rwx "$volume"
    "${run[@]}" --rm "$image" bash -c "$toolchain"
    exit 0
fi

[[ -f "$export_src/occurrences.db" ]] || { echo "offline-gate.sh: $export_src does not look like an export (no occurrences.db)" >&2; exit 2; }
cp -a "$export_src/." "$volume/var/export/"
chmod -R u+rwX,go-rwx "$volume"

# step <name> <script>: run one step in a container of its own, so that its memory
# peak is its own, and keep the container until the end for `docker diff`.
peaks=()
step() {
    local name=$1 script=$2 c="beeatlas-offline-gate-$$-$1" rc=0
    containers+=("$c")
    echo "=== $name ==="
    "${run[@]}" --name "$c" "$image" bash -c "set -euo pipefail
$script
echo \"memory peak: \$(( \$(cat /sys/fs/cgroup/memory.peak) / 1048576 )) MiB\"" 2>&1 | tee "$volume/log/$name.log" || rc=$?
    [[ $rc -eq 0 ]] || { echo "offline-gate: $name failed ($rc)" >&2; exit "$rc"; }
    peaks+=("$name: $(sed -n 's/^memory peak: //p' "$volume/log/$name.log")")
}

step toolchain "$toolchain"
step deploy-render 'cd /app && bash data/publish-code.sh'
step first-note '
cd /app/data
uv run alembic -c notes_store/migrations/alembic.ini upgrade head
uv run python -m notes_store.seed
cd /app && bash data/publish-notes.sh'
step edited-note '
cd /app/data
uv run python -c "
import sqlite3
c = sqlite3.connect(\"$NOTES_DB_PATH\")
n = c.execute(\"UPDATE notes SET body = body || \x27 Edited by the offline gate.\x27, body_html = body_html || \x27<p>Edited by the offline gate.</p>\x27 WHERE canonical_name = \x27osmia lignaria\x27\").rowcount
c.commit()
assert n == 1, n
"
cd /app && bash data/publish-notes.sh'

# The edited note's species, and only it, was harvested and rendered.
if ! grep -q '^--- scoped render: 1 species ---$' "$volume/log/edited-note.log"; then
    echo "offline-gate: the edited note did not publish as a scoped render of one species" >&2
    exit 1
fi
grep -rlq 'Edited by the offline gate' "$volume/htdocs" \
    || { echo "offline-gate: the edited note is not on the published page" >&2; exit 1; }
echo "offline-gate: the edited note was published, rendering one species"

echo "--- memory peaks ---"
printf '  %s\n' "${peaks[@]}"

# What each step wrote into the image rather than the volume (ADR 0044): on Fly that
# lands on the root filesystem, which every deploy replaces. `docker diff` names each
# added (A) or changed (C) path. A directory that holds another listed path says
# nothing new, so only the deepest paths are kept; then Python's bytecode caches, /tmp
# and the volume's mount point are dropped. Reported, not judged: a derived file
# rewritten in place is harmless, state written there is lost.
echo "--- writes outside the volume ---"
for c in "${containers[@]}"; do
    docker diff "$c" \
        | awk '{ path[NR] = $2; line[NR] = $0 }
               END { for (i = 1; i <= NR; i++) {
                         parent = 0
                         for (j = 1; j <= NR; j++) if (index(path[j], path[i] "/") == 1) { parent = 1; break }
                         if (!parent) print line[i] } }' \
        | grep -vE '__pycache__|^[ACD] /tmp(/|$)|^[ACD] /data$' \
        | sed "s|^|  ${c#beeatlas-offline-gate-$$-}: |" \
        || true
done
echo "offline-gate: the Machine's work ran with no network"

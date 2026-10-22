#!/usr/bin/env bash
# The image's offline gate (beeatlas-3je9): does the machine fetch no code and no
# dependency at runtime?
#
#   fly/offline-gate.sh <image>                     # the toolchain, with NO network
#   fly/offline-gate.sh <image> <beeatlas.duckdb>   # plus a full Stelis build, with the
#                                                   # code and package hosts unreachable
#
# The first form runs with the network off entirely and proves every tool the nightly
# calls answers from the image: node, pnpm, uv's Python, dbt (through data/dbt/run.sh's
# own cache-only probe), the DuckDB CLI, boto3 for the backups, and Stelis loading
# the beeatlas graph. The image workflow runs it on every change.
#
# The second form is the gate the bead names: a full `--all` Stelis build against a
# COPY of the production DuckDB (never the live one), in a container whose /etc/hosts
# points every code and package host at loopback, so a fetch of code or a dependency
# fails while the data sources stay reachable. DuckDB's extension host is among them,
# so an extension the image lacks fails rather than downloading. The export's
# artifacts and their digests are printed at the end for comparison with the
# nightly's, followed by every file the build wrote into the image instead of the
# volume (ADR 0044). Run it from a machine with the DuckDB copy (the offsite backup,
# data/nightly.sh's trap); the loaders' credentials go through DLT_SECRETS_TOML
# (data/.dlt/secrets.toml's content) if the sources are to be reached, and without
# them the boundary tasks fail and the build is partial, which the exit status says.
# NOTES_DB names a copy of the notes store (a consistent snapshot, as
# data/backup_notes.py takes); without it the notes harvest finds no store and fails.
#
# Both forms mount a private, throwaway /data laid out like the volume (the image's
# symlinks into it dangle otherwise, and dbt's probe writes its sandbox through one),
# and run the container as the invoking user, so the copy is opened to nobody else on
# this host. That user is not the image's `app`, so everything the run writes is
# pointed at /data (uv's cache, HOME), and the secrets arrive by a read-only bind
# mount from a private file rather than a write into the app-owned checkout; the
# image's own trees are world-readable, which is all the build needs of them.
#
# Exit status: the container's. Non-zero means something was fetched or failed.

set -euo pipefail

image=${1:?usage: offline-gate.sh <image> [<beeatlas.duckdb copy>]}
db=${2:-}

volume=$(mktemp -d)
name="beeatlas-offline-gate-$$"
trap 'docker rm -f "$name" > /dev/null 2>&1 || true; rm -rf "$volume"' EXIT
mkdir -p "$volume"/{var/export,var/stelis,var/baseline,htdocs,raw,ecdysis-zip,geography-cache,burke-cache,cache,site,dbt-target,dlt,notes,home,uv-cache}
# DuckDB looks for its extensions under $HOME/.duckdb. The image installs them under
# app's home (fly/Dockerfile), and this HOME is a throwaway one, so it points there.
ln -s /home/app/.duckdb "$volume/home/.duckdb"
run=(docker run --user "$(id -u):$(id -g)" -v "$volume:/data"
     -e HOME=/data/home -e UV_CACHE_DIR=/data/uv-cache -e SOURCE_DATE_EPOCH=1700000000)

toolchain='
set -euo pipefail
echo "node   $(node --version)"
echo "pnpm   $(pnpm --version)"
echo "uv     $(uv --version)"
echo "duckdb $(duckdb --version)"
# The launch exactly as the Stelis graph issues it (src/beeatlas.rkt, the uv runtime):
# a bare `uv run`, which must find the environment in sync and reach for nothing.
# Each probe is assigned on its own line: inside an echo, its failure would be lost.
python=$(uv run --directory /app/data python -c "import sys, dlt, duckdb, boto3, s3_backup; print(sys.version.split()[0], \"dlt\", dlt.__version__, \"duckdb\", duckdb.__version__)")
echo "python $python"
dbt=$(bash /app/data/dbt/run.sh --identity | tr "\n" " ")
echo "dbt    $dbt"
bash /opt/stelis/scripts/preflight.sh
(cd /opt/stelis && BEEATLAS_DIR=/app racket src/main.rkt --project beeatlas --help > /dev/null)
echo "stelis  loads the beeatlas graph"
echo "offline-gate: toolchain answers with no network"
'

if [[ -z "$db" ]]; then
    chmod -R u+rwX,go-rwx "$volume"
    # Not exec'd: the EXIT trap above is what removes the throwaway volume, and
    # `set -e` already makes the container's failure this script's.
    "${run[@]}" --rm --network none "$image" bash -c "$toolchain"
    exit 0
fi

[[ -r "$db" ]] || { echo "offline-gate.sh: cannot read $db" >&2; exit 2; }
cp "$db" "$volume/var/beeatlas.duckdb"
if [[ -n "${NOTES_DB:-}" ]]; then
    [[ -r "$NOTES_DB" ]] || { echo "offline-gate.sh: cannot read NOTES_DB=$NOTES_DB" >&2; exit 2; }
    cp "$NOTES_DB" "$volume/notes/notes.db"
fi
secrets=()
if [[ -n "${DLT_SECRETS_TOML:-}" ]]; then
    printf '%s' "$DLT_SECRETS_TOML" > "$volume/home/dlt-secrets.toml"
    secrets=(-v "$volume/home/dlt-secrets.toml:/app/data/.dlt/secrets.toml:ro")
fi
chmod -R u+rwX,go-rwx "$volume"

# The hosts a runtime fetch of code or a dependency would reach. Each resolves to
# loopback inside the container, where nothing answers.
blackhole=(
    github.com raw.githubusercontent.com objects.githubusercontent.com codeload.github.com
    registry.npmjs.org registry.yarnpkg.com
    pypi.org files.pythonhosted.org
    astral.sh
    ghcr.io
    download.racket-lang.org pkgs.racket-lang.org users.cs.utah.edu mirror.csclub.uwaterloo.ca
    nodejs.org
    extensions.duckdb.org community-extensions.duckdb.org
)
hosts=()
for h in "${blackhole[@]}"; do hosts+=(--add-host "$h:127.0.0.1"); done

# ${secrets[@]+...}: an empty array expands to nothing under `set -u` on bash 3.2 (a
# Mac's /usr/bin/env bash) too, where a bare "${secrets[@]}" is "unbound variable".
# The container is named rather than --rm'd, so its writes can be listed below.
rc=0
"${run[@]}" --name "$name" "${hosts[@]}" ${secrets[@]+"${secrets[@]}"} "$image" bash -c "$toolchain"'
export SOURCE_DATE_EPOCH=$(date +%s)
cd /app && bash scripts/fetch-data.sh --all
echo "--- export digests ---"
cd /data/var/export && find . -type f -print0 | sort -z | xargs -0 sha256sum
' || rc=$?

# What the build wrote into the image rather than the volume (ADR 0044): on Fly that
# lands on the root filesystem, which every deploy replaces. `docker diff` names each
# added (A) or changed (C) path. A directory that holds another listed path says
# nothing new, so only the deepest paths are kept; then Python's bytecode caches,
# /tmp, the volume's mount point and the secrets bind mount are dropped. Reported,
# not judged: a derived file rewritten in place is harmless, state written there is
# lost.
echo "--- writes outside the volume ---"
docker diff "$name" \
    | awk '{ path[NR] = $2; line[NR] = $0 }
           END { for (i = 1; i <= NR; i++) {
                     parent = 0
                     for (j = 1; j <= NR; j++) if (index(path[j], path[i] "/") == 1) { parent = 1; break }
                     if (!parent) print line[i] } }' \
    | grep -vE '__pycache__|^[ACD] /tmp(/|$)|^[ACD] /data$|^A /app/data/\.dlt/secrets\.toml$' \
    || true
exit "$rc"

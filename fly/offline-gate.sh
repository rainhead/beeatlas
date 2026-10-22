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
# own cache-only probe), the DuckDB CLI, the AWS CLI, and Stelis loading the beeatlas
# graph. The image workflow runs it on every change.
#
# The second form is the gate the bead names: a full `--all` Stelis build against a
# COPY of the production DuckDB (never the live one), in a container whose /etc/hosts
# points every code and package host at loopback, so a fetch of code or a dependency
# fails while the data sources stay reachable. The export's artifacts and their
# digests are printed at the end for comparison with the nightly's. Run it from a
# machine with the DuckDB copy (the offsite backup, data/nightly.sh's trap); the
# loaders' credentials go through DLT_SECRETS_TOML (data/.dlt/secrets.toml's content)
# if the sources are to be reached, and without them the boundary tasks fail and the
# build is partial, which the exit status says.
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
trap 'rm -rf "$volume"' EXIT
mkdir -p "$volume"/{var/export,var/stelis,var/baseline,htdocs,raw,cache,site,dbt-target,dlt,home,uv-cache}
run=(docker run --rm --user "$(id -u):$(id -g)" -v "$volume:/data"
     -e HOME=/data/home -e UV_CACHE_DIR=/data/uv-cache -e SOURCE_DATE_EPOCH=1700000000)

toolchain='
set -euo pipefail
echo "node   $(node --version)"
echo "pnpm   $(pnpm --version)"
echo "uv     $(uv --version)"
echo "duckdb $(duckdb --version)"
echo "aws    $(aws --version)"
# The launch exactly as the Stelis graph issues it (src/beeatlas.rkt, the uv runtime):
# a bare `uv run`, which must find the environment in sync and reach for nothing.
# Each probe is assigned on its own line: inside an echo, its failure would be lost.
python=$(uv run --directory /app/data python -c "import sys, dlt, duckdb; print(sys.version.split()[0], \"dlt\", dlt.__version__, \"duckdb\", duckdb.__version__)")
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
    "${run[@]}" --network none "$image" bash -c "$toolchain"
    exit 0
fi

[[ -r "$db" ]] || { echo "offline-gate.sh: cannot read $db" >&2; exit 2; }
cp "$db" "$volume/var/beeatlas.duckdb"
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
)
hosts=()
for h in "${blackhole[@]}"; do hosts+=(--add-host "$h:127.0.0.1"); done

# ${secrets[@]+...}: an empty array expands to nothing under `set -u` on bash 3.2 (a
# Mac's /usr/bin/env bash) too, where a bare "${secrets[@]}" is "unbound variable".
"${run[@]}" "${hosts[@]}" ${secrets[@]+"${secrets[@]}"} "$image" bash -c "$toolchain"'
export SOURCE_DATE_EPOCH=$(date +%s)
cd /app && bash scripts/fetch-data.sh --all
echo "--- export digests ---"
cd /data/var/export && find . -type f | sort | xargs sha256sum
'

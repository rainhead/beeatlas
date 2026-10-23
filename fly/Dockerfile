# syntax=docker/dockerfile:1
#
# The beeatlas Fly machine (ADR 0042, beeatlas-3je9): one image holding everything
# the nightly, the note-write publish and the write API run on, pinned, so that
# nothing on the machine is fetched or updated at runtime. What it holds:
#
#   node 26.12 and pnpm 11.22   the site build and the pipeline's node tooling,
#                               with both node_modules trees installed
#   uv and CPython 3.14         the data pipeline's environment (data/.venv, synced
#                               from uv.lock; dbt and the integration gate's pytest
#                               run from it too, the dev group, and so do the
#                               offsite backups, through boto3: no AWS CLI)
#   Stelis                      Racket and the compiled engine, out of the image
#                               Stelis's own CI built from fly/stelis-commit, by the
#                               digest in fly/stelis-digest (Stelis ADR 0017)
#   the DuckDB CLI              what Stelis content-addresses relations with
#   rsync, flock                merge-swap.sh and the publish lock
#   supercronic                 the schedule (fly/crontab), under fly/start.sh
#   Litestream                  the notes store's continuous replica (fly/litestream.yml)
#   pmtiles                     data/publish-basemap.sh's verify and metadata reads
#   Caddy                       the web server, with the serving policy in
#                               fly/Caddyfile (beeatlas-zsi8)
#   this checkout at /app       with no .git: the image IS the deploy
#
# What it does not hold, and where that lives instead (ADR 0044): every file the
# pipeline writes. The volume mounts at /data, and the paths inside the checkout the
# scripts and the Stelis graph write to are symlinks into it (see "the volume"
# below), so the code is unchanged and the root filesystem, which Fly caps near 8 GB
# and throttles, carries only code and dependencies. Secrets are never baked: they
# arrive as Fly secrets, which are environment variables, and both readers take them
# from there (beeatlas-cjyz). The API reads INAT_CLIENT_ID, INAT_CLIENT_SECRET,
# INAT_REDIRECT_URI and SESSION_SIGNING_KEY (api/config.py); the dlt loaders read
# SOURCES__ECDYSIS__USERNAME and SOURCES__ECDYSIS__PASSWORD, dlt's own spelling of
# data/.dlt/secrets.toml's [sources.ecdysis]. A staging app also sets
# BEEATLAS_STAGING_ORIGIN and VITE_NOTES_API_BASE_URL=<that origin>/api.
#
# Build args (fly/deploy.sh passes them):
#   STELIS_SHA     the Stelis commit, from fly/stelis-commit
#   STELIS_IMAGE   the Stelis image built from it, by digest, from fly/stelis-digest
#                  (fly/pin-stelis.sh writes both)
#   GITHUB_SHA     this commit, which the build receipt and the clean geojsons name;
#                  required, since the image holds no .git
#
# Every download is pinned by sha256 (fly/downloads.tsv, fetched by fly/fetch.sh)
# or by lockfile (uv.lock, pnpm-lock.yaml), and all of them happen here. The gate
# (fly/offline-gate.sh) runs the image with the code and package hosts unreachable.

# The two base images, pinned by digest the way the workflow actions are pinned by
# commit, so a rebuild from the same source is the same toolchain: a tag can move
# under it, a digest cannot. Both are what the tags named on 2026-10-22; to move
# one, `docker buildx imagetools inspect <tag>` and replace the digest and the date.
# node is .nvmrc's; Stelis hashes .nvmrc as code and observes the resolved version.
ARG NODE_IMAGE=node:26.12-bookworm-slim@sha256:28147155d47dc31abe0a46e0d12b59b2fb3d0a2dcc5dc65fce76a074180b16fe
ARG DEBIAN_IMAGE=debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8

# --- the pieces other images supply ----------------------------------------------
# Stelis: Racket at /opt/racket, the engine compiled at /opt/stelis. The default is a
# tag that does not exist, so a build that forgot the arg fails naming it.
ARG STELIS_IMAGE=ghcr.io/rainhead/stelis:set-STELIS_IMAGE-from-fly-stelis-digest
FROM ${STELIS_IMAGE} AS stelis
# node, the version .nvmrc pins, with the pnpm package.json's packageManager field
# names installed by the image's own npm (node 26 ships no corepack). The machine
# stage copies node and pnpm out of here; npm stays behind.
FROM ${NODE_IMAGE} AS node
RUN npm install -g pnpm@11.22.0

# --- the machine ------------------------------------------------------------------
FROM ${DEBIAN_IMAGE}
# libssl3: the Stelis engine's sha package opens libcrypto through Racket's FFI
# (Stelis ADR 0017). libatomic1: node 26 links against it. rsync and flock
# (util-linux): merge-swap.sh and the publish lock. curl and the CA store: the
# build's own downloads, and the nightly's healthcheck ping. media-types: the
# /etc/mime.types Caddy (Go) reads to type a response by its extension, the same
# table Apache served from, so .webmanifest, .mjs and the rest keep their types.
# procps: pkill, with which fly/deploy.sh releases a deploy's hold on the publish
# lock, and ps for whoever is on the Machine.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl libatomic1 libssl3 media-types procps rsync unzip util-linux \
 && rm -rf /var/lib/apt/lists/*

# Everything runs as `app`, and everything app writes beside what it reads (pnpm,
# Vite, uv) is installed AS app below, into directories made for it here, so no
# layer re-owns a tree after the fact: a `chown -R` over two node_modules trees and
# uv's caches copies every file into a new layer and doubles the image. The root-
# owned pieces are the binaries under /usr/local and the Stelis trees, which are
# only read.
RUN useradd --create-home --uid 1000 app \
 && mkdir -p /app/data/dbt /opt/uv \
 && chown -R app:app /app /opt/uv

# node and pnpm, out of the node stage. No npm: the repo is pnpm-only (ADR 0038),
# and since Stelis d0d7fef (st-ea4) so is every launch its graph makes.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/pnpm /usr/local/lib/node_modules/pnpm
RUN ln -s ../lib/node_modules/pnpm/bin/pnpm.mjs /usr/local/bin/pnpm \
 && node --version && pnpm --version

# The pinned binaries: uv and the DuckDB CLI (fly/downloads.tsv, by sha256).
COPY fly/fetch.sh fly/downloads.tsv /tmp/fetch/
RUN /tmp/fetch/fetch.sh uv /tmp/uv.tgz \
 && tar -xzf /tmp/uv.tgz -C /usr/local/bin --strip-components=1 uv-x86_64-unknown-linux-gnu/uv uv-x86_64-unknown-linux-gnu/uvx \
 && rm /tmp/uv.tgz && uv --version
RUN /tmp/fetch/fetch.sh duckdb /tmp/duckdb.zip \
 && unzip -q /tmp/duckdb.zip -d /usr/local/bin && rm /tmp/duckdb.zip && duckdb --version
RUN /tmp/fetch/fetch.sh litestream /tmp/litestream.tgz \
 && tar -xzf /tmp/litestream.tgz -C /usr/local/bin litestream && rm /tmp/litestream.tgz && litestream version
RUN /tmp/fetch/fetch.sh pmtiles /tmp/pmtiles.tgz \
 && tar -xzf /tmp/pmtiles.tgz -C /usr/local/bin pmtiles && rm /tmp/pmtiles.tgz && pmtiles version
RUN /tmp/fetch/fetch.sh supercronic /usr/local/bin/supercronic \
 && chmod +x /usr/local/bin/supercronic && supercronic -version
RUN /tmp/fetch/fetch.sh caddy /tmp/caddy.tgz \
 && tar -xzf /tmp/caddy.tgz -C /usr/local/bin caddy && rm /tmp/caddy.tgz && caddy version

# Stelis, pinned: the two trees out of the image its own CI built from the commit in
# fly/stelis-commit, named by digest (fly/stelis-digest). The image must carry the
# commit it was pinned as, so a digest pasted from the wrong commit fails the build
# rather than running the wrong engine; preflight.sh proves the copied Racket loads
# the engine on this base. (The beeatlas graph is loaded further down, once the
# checkout is in place.)
ARG STELIS_SHA
COPY --from=stelis /opt/racket /opt/racket
COPY --from=stelis /opt/stelis /opt/stelis
ENV PATH=/opt/racket/bin:/opt/uv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    STELIS_DIR=/opt/stelis
RUN test -n "$STELIS_SHA" \
 && { test "$(cat /opt/stelis/commit)" = "$STELIS_SHA" \
      || { echo "fly/stelis-digest names a Stelis image built from $(cat /opt/stelis/commit), not fly/stelis-commit's $STELIS_SHA; run fly/pin-stelis.sh" >&2; exit 1; }; } \
 && bash /opt/stelis/scripts/preflight.sh

# --- as app: the environments -----------------------------------------------------
USER app
ENV HOME=/home/app

# uv keeps its interpreter, cache and tools under /opt/uv, in the image, where the
# runtime finds them without a network. One CPython, the 3.14 data/.python-version
# names, at an exact patch so a rebuild cannot move it; dbt runs from data/'s
# environment too since beeatlas #129.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_CACHE_DIR=/opt/uv/cache \
    UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/opt/uv/bin \
    UV_PYTHON_PREFERENCE=only-managed
RUN uv python install 3.14.9

# The data pipeline's environment, from the lockfile alone (these three files are
# what `uv sync --frozen` reads), so this layer is cached across code changes. The
# dev group is included: dbt runs from here (data/dbt/run.sh), and so does the
# nightly's integration gate. run.sh --identity is Stelis's cache-only runtime
# probe, and the proof that dbt answers with no network at all.
WORKDIR /app/data
COPY --chown=app:app data/pyproject.toml data/uv.lock data/README.md ./
COPY --chown=app:app data/dbt/run.sh ./dbt/run.sh
RUN uv sync --frozen \
 && bash dbt/run.sh --identity

# DuckDB's extensions, which it would otherwise download at runtime, on the first
# INSTALL or LOAD that finds one missing: spatial and sqlite_scanner for the
# pipeline's duckdb (uv.lock's version), and sqlite_scanner for the CLI, which Stelis
# ATTACHes SQLite files with. json and parquet are built into both, and GEOMETRY is
# core since 1.5, so the CLI digests geometry columns without spatial. An extension
# is built per DuckDB version, so each binary installs its own. They land under
# app's ~/.duckdb/extensions, where both look; DuckDB checks each one's signature
# when it loads it. The gate (fly/offline-gate.sh) blocks extensions.duckdb.org, so
# an extension missing here fails there rather than downloading quietly.
RUN uv run --frozen --no-sync python -c "import duckdb; c = duckdb.connect(); c.execute('INSTALL spatial'); c.execute('INSTALL sqlite_scanner')" \
 && duckdb -c "INSTALL sqlite_scanner" \
 && find "$HOME/.duckdb/extensions" -name '*.duckdb_extension' | sort

# The two node_modules trees: the site build's (root) and the pipeline's (data/,
# a separate pnpm project by ADR 0038). From the lockfiles alone, for the cache.
WORKDIR /app
COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY --chown=app:app data/package.json data/pnpm-lock.yaml data/pnpm-workspace.yaml ./data/
RUN cd data && pnpm install --frozen-lockfile

# The checkout itself (.dockerignore leaves out .git, node_modules, the beads
# database and every path the volume owns), and the proof that Stelis loads the
# beeatlas graph over it, which is what the nightly builds.
COPY --chown=app:app . /app/
RUN cd /opt/stelis && BEEATLAS_DIR=/app SOURCE_DATE_EPOCH=1700000000 racket src/main.rkt --project beeatlas --help > /dev/null

# The web server's policy (beeatlas-zsi8). The species redirects arrive as a snippet
# fly/caddy-redirects.sh writes under /data/caddy, which the config imports by glob,
# so a volume that has none yet is no error.
COPY --chown=root:root fly/Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# --- the volume ---------------------------------------------------------------------
# Everything written at runtime lives under /data, the volume (ADR 0044). The paths
# inside the checkout that the scripts and the Stelis graph write to become symlinks
# into it, so nothing in the code changes and the root filesystem stays read-mostly:
#
#   /app/data/raw        -> /data/raw          taxa.csv.gz, taxa_cache.json, ecdysis_cache/
#   /app/data/.ecdysis_cache   -> /data/ecdysis-zip      the Ecdysis export ZIP
#   /app/data/.geography_cache -> /data/geography-cache  boundary downloads (~600 MB)
#   /app/data/.burke_cache     -> /data/burke-cache      build_target_hosts.py's pages
#   /app/.cache          -> /data/cache        the build receipt (scripts/build-receipt.mjs)
#   /app/_site           -> /data/site         the rendered site before merge-swap
#   /app/data/dbt/target -> /data/dbt-target   dbt's sandbox and compiled models
#
# The rest is reached by the env below, the same contract data/nightly.sh and
# data/publish-notes.sh already take: VAR_DIR for the DuckDB, the export, the baseline,
# the Stelis state and the publish lock; SITE_ROOT for what Caddy serves; the notes
# store; dlt's working directory. fly/prepare-volume.sh creates them on first boot.
# dbt/target exists by now (run.sh --identity makes its sandbox), so it is removed
# first; without that the link would land INSIDE it and dbt would write to the image.
RUN ln -s /data/raw /app/data/raw \
 && ln -s /data/ecdysis-zip /app/data/.ecdysis_cache \
 && ln -s /data/geography-cache /app/data/.geography_cache \
 && ln -s /data/burke-cache /app/data/.burke_cache \
 && ln -s /data/cache /app/.cache \
 && ln -s /data/site /app/_site \
 && rm -rf /app/data/dbt/target \
 && ln -s /data/dbt-target /app/data/dbt/target \
 && for l in /app/data/raw /app/data/.ecdysis_cache /app/data/.geography_cache /app/data/.burke_cache \
             /app/.cache /app/_site /app/data/dbt/target; do test -L "$l" || { echo "$l is not a symlink" >&2; exit 1; }; done

# The entrypoint (beeatlas-ryli) runs fly/prepare-volume.sh as root, since Fly mounts
# the volume owned by root, before dropping to app.
# BEEATLAS_CONTAINER: the scripts' container mode (data/runtime-env.sh,
# beeatlas-h6mo). The nightly and the publish scripts pull nothing and install
# nothing here; the image is the deploy.
ENV BEEATLAS_CONTAINER=1 \
    BASE_DIR=/data \
    SITE_ROOT=/data/htdocs \
    VAR_DIR=/data/var \
    STELIS_STATE_DIR=/data/var/stelis \
    DB_PATH=/data/var/beeatlas.duckdb \
    EXPORT_DIR=/data/var/export \
    BASELINE_DIR=/data/var/baseline \
    NOTES_DB_PATH=/data/notes/notes.db \
    SERVE_PORT=8081 \
    DLT_DATA_DIR=/data/dlt \
    TZ=America/Los_Angeles
ARG GITHUB_SHA
RUN test -n "$GITHUB_SHA" || { echo "build-arg GITHUB_SHA is required: the build receipt and the clean geojsons stamp it, and the image holds no .git to read it from" >&2; exit 1; }
ENV GITHUB_SHA=${GITHUB_SHA}

# The Machine's one process (beeatlas-ryli): fly/start.sh lays out the volume as
# root, then runs Caddy, the API and the schedule as app.
WORKDIR /app
USER root
CMD ["/app/fly/start.sh"]

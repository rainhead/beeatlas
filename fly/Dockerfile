# syntax=docker/dockerfile:1
#
# The beeatlas Fly machine (ADR 0042, beeatlas-3je9): one image holding everything
# the write API, a note save's publish and a deploy's render run on, pinned, so that
# nothing on the machine is fetched or updated at runtime. The nightly is not among
# them: it runs on Hostess (ADR 0046), and the image carries none of the pipeline's
# ingests, dbt or caches (beeatlas-uibw.7). What it holds:
#
#   node 26.12 and pnpm 11.22   the site build, with the root node_modules installed
#   uv and CPython 3.14         data/.venv, synced from uv.lock with no dependency
#                               group: the API, the notes store and its migrations,
#                               the note harvest, and the notes backup (boto3: no
#                               AWS CLI). data/pyproject.toml says what goes where.
#   Stelis                      Racket and the compiled engine, out of the image
#                               Stelis's own CI built from fly/stelis-commit, by the
#                               digest in fly/stelis-digest (Stelis ADR 0017)
#   the DuckDB CLI              with sqlite_scanner, through which Stelis reads the
#                               notes store's keys (notes-digest.rkt): without it
#                               every note save would harvest every species
#   rsync, flock                merge-swap.sh, the publish lock, Hostess's send
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
# INAT_REDIRECT_URI and SESSION_SIGNING_KEY (api/config.py); Litestream reads
# NOTES_REPLICA_URL and the replica's own key (fly/start.sh); the notes backup reads
# NOTES_BACKUP_BUCKET and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY (fly/crontab). A
# staging app also sets BEEATLAS_STAGING_ORIGIN and VITE_NOTES_API_BASE_URL=<that
# origin>/api.
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
# (fly/offline-gate.sh) runs the image with no network at all.

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
# build's own downloads, and fly/start.sh's watchdog. media-types: the
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
 && mkdir -p /app/data /opt/uv \
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
# names, at an exact patch so a rebuild cannot move it.
#
# UV_NO_DEFAULT_GROUPS: the environment holds data/pyproject.toml's dependencies and
# neither group, `pipeline` (dlt, dbt, the ingests) nor `dev`. Set for the whole
# image, not only the sync, so that every `uv run` later (Stelis launches the note
# harvest with a bare one) finds the environment already in sync rather than
# reaching for the groups it lacks.
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_CACHE_DIR=/opt/uv/cache \
    UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/opt/uv/bin \
    UV_PYTHON_PREFERENCE=only-managed \
    UV_NO_DEFAULT_GROUPS=1
RUN uv python install 3.14.9

# The environment, from the lockfile alone (these three files are what `uv sync
# --frozen` reads), so this layer is cached across code changes.
WORKDIR /app/data
COPY --chown=app:app data/pyproject.toml data/uv.lock data/README.md ./
RUN uv sync --frozen

# sqlite_scanner for the DuckDB CLI, which would otherwise download it on the first
# ATTACH of a SQLite file: Stelis reads the notes store's keys that way. It lands
# under app's ~/.duckdb/extensions, and DuckDB checks its signature when it loads it.
# The gate (fly/offline-gate.sh) runs with no network, so an extension missing here
# fails there rather than downloading quietly.
RUN duckdb -c "INSTALL sqlite_scanner" \
 && find "$HOME/.duckdb/extensions" -name '*.duckdb_extension' | sort

# The site build's node_modules, from the lockfile alone, for the cache. data/ has a
# pnpm project of its own (ADR 0038), mapshaper for the pipeline, which the image
# does not install.
WORKDIR /app
COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# The checkout itself (.dockerignore leaves out .git, node_modules, the beads
# database and every path the volume owns), and the proof that Stelis loads the
# beeatlas graph over it, which a note save builds a part of.
COPY --chown=app:app . /app/
RUN cd /opt/stelis && BEEATLAS_DIR=/app SOURCE_DATE_EPOCH=1700000000 racket src/main.rkt --project beeatlas --help > /dev/null

# The web server's policy (beeatlas-zsi8). The species redirects arrive as a snippet
# fly/caddy-redirects.sh writes under /data/caddy, which the config imports by glob,
# so a volume that has none yet is no error.
COPY --chown=root:root fly/Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# --- the volume ---------------------------------------------------------------------
# Everything written at runtime lives under /data, the volume (ADR 0044). The two
# paths inside the checkout that the render writes to become symlinks into it, so
# nothing in the code changes and the root filesystem stays read-mostly:
#
#   /app/.cache          -> /data/cache        the build receipt (scripts/build-receipt.mjs)
#   /app/_site           -> /data/site         the rendered site before merge-swap
#
# The rest is reached by the env below, the same contract data/publish-notes.sh and
# data/publish-code.sh take: VAR_DIR for the export, the Stelis state and the publish
# lock; SITE_ROOT for what Caddy serves; the notes store. fly/prepare-volume.sh
# creates them on first boot. /data/staging is where Hostess sends its build
# (data/send-build.sh, ADR 0046), under /data/var/staging.lock; rsync creates it on
# the first send.
RUN ln -s /data/cache /app/.cache \
 && ln -s /data/site /app/_site \
 && for l in /app/.cache /app/_site; do test -L "$l" || { echo "$l is not a symlink" >&2; exit 1; }; done

# The entrypoint (beeatlas-ryli) runs fly/prepare-volume.sh as root, since Fly mounts
# the volume owned by root, before dropping to app.
# BEEATLAS_CONTAINER: the scripts' container mode (data/runtime-env.sh,
# beeatlas-h6mo). The publish scripts pull nothing and install nothing here; the
# image is the deploy. data/nightly.sh refuses to run in it.
# pnpm_config_verify_deps_before_run: pnpm 11 checks node_modules against the
# lockfile before every `pnpm run`. Here they were installed --frozen-lockfile above
# and nothing changes them, so the answer is always "up to date"; asking cost a note
# save 1.8 s, measured on the Machine (beeatlas-gcdo.2). Set after the installs on
# purpose.
ENV BEEATLAS_CONTAINER=1 \
    pnpm_config_verify_deps_before_run=false \
    BASE_DIR=/data \
    SITE_ROOT=/data/htdocs \
    VAR_DIR=/data/var \
    STELIS_STATE_DIR=/data/var/stelis \
    EXPORT_DIR=/data/var/export \
    NOTES_DB_PATH=/data/notes/notes.db \
    SERVE_PORT=8081 \
    TZ=America/Los_Angeles
ARG GITHUB_SHA
RUN test -n "$GITHUB_SHA" || { echo "build-arg GITHUB_SHA is required: the build receipt and the clean geojsons stamp it, and the image holds no .git to read it from" >&2; exit 1; }
ENV GITHUB_SHA=${GITHUB_SHA}

# The Machine's one process (beeatlas-ryli): fly/start.sh lays out the volume as
# root, then runs Caddy, the API and the schedule as app.
WORKDIR /app
USER root
CMD ["/app/fly/start.sh"]

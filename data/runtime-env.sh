# Sourced by data/nightly.sh, data/publish-notes.sh and data/publish-code.sh: what
# differs between the two places they run (beeatlas-h6mo).
#
#   a host checkout   maderas: a git clone the nightly updates itself, beside a Stelis
#                     clone it updates too, with node reached through nvm.
#   the Fly image     BEEATLAS_CONTAINER=1 (fly/Dockerfile): the code, Stelis and every
#                     dependency were fixed when the image was built. Nothing is pulled
#                     or installed at runtime; a change ships as a new image. A nightly
#                     that pulled here would move past the pinned Stelis at 3am and undo
#                     what the image is for, and without .git it could not pull anyway.
#
# Everything else, the publish contract above all, is the same in both.

# True inside the Fly image.
in_container() { [[ -n "${BEEATLAS_CONTAINER:-}" ]]; }

# Put .nvmrc's node on PATH. On a host, nvm selects it, from the repo root where
# .nvmrc is; in the image, node is the image's own and already on PATH.
use_pinned_node() {
    in_container && return 0
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        # shellcheck disable=SC1091
        . "$HOME/.nvm/nvm.sh"
        local here="$PWD" rc=0
        cd "$REPO_ROOT" || return 1
        nvm use --silent || rc=$?
        cd "$here" || return 1
        return "$rc"
    else
        echo "WARN: $HOME/.nvm/nvm.sh not found — node tooling may not resolve" >&2
    fi
}

# One line naming the code this run builds with, for the log.
describe_code() {
    if in_container; then
        echo "  container: beeatlas ${GITHUB_SHA:-unknown}, stelis $(cat "$STELIS_DIR/commit" 2> /dev/null || echo unknown) (the image's; no sync)"
    else
        echo "  beeatlas: $(git -C "$REPO_ROOT" rev-parse --short HEAD) $(git -C "$REPO_ROOT" log -1 --format=%s)"
    fi
}

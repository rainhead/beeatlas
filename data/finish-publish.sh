#!/usr/bin/env bash
# The Machine's half of the handoff (ADR 0046, beeatlas-uibw.5): publish the nightly
# that Hostess built and sent to STAGING (data/send-build.sh), with the notes from the
# Machine's live store. Hostess runs it over Fly SSH as the app user, after a send whose
# check passed:
#     setpriv --reuid=app --regid=app --init-groups bash /app/data/finish-publish.sh
#
# Under the publish lock, which every publish on the Machine takes:
#   1. Check the staged build against this checkout (scripts/build-receipt.mjs). A
#      deploy that landed after Hostess read the Machine's commit fails it, and the
#      Machine builds nothing in its place: Hostess builds again, which costs it
#      seconds and would cost the Machine minutes.
#   2. Install the staged build where the note and deploy renders read it: the export,
#      _site, and the build receipt and Vite manifest under .cache. The export keeps
#      the Machine's own notes/, which is what its Stelis state dir last observed, so
#      the harvest below moves exactly the notes saved since.
#   3. Run data/publish-notes.sh, holding the lock: the harvest from the live store,
#      a render of the species that need it, and the merge-swap. The species are those
#      whose notes the harvest moved AND those whose notes/ file here differs from the
#      copy Hostess rendered with. The second set is the notes saved while Hostess was
#      building: the Machine had already harvested them, so the harvest does not move
#      them again, but Hostess's pages do not have them.
#
# The last line of output is "finish-publish: <outcome>", because flyctl does not pass
# the exit status through. Outcomes, with the exit status a local caller sees:
#   published  0   the site now serves this build
#   stale      79  the staged build does not match this checkout; nothing changed
#   busy       75  a lock was held past its wait; nothing changed
#   failed     1   anything else. If the install had begun, the build receipt is
#                  withdrawn, so the next note save or deploy renders in full.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VAR_DIR="${VAR_DIR:-/data/var}"
EXPORT_DIR="${EXPORT_DIR:-$VAR_DIR/export}"
STAGING="${STAGING:-/data/staging}"
STAGING_LOCK="${STAGING_LOCK:-$VAR_DIR/staging.lock}"
LOCK_WAIT="${PUBLISH_LOCK_WAIT:-600}"
export VAR_DIR EXPORT_DIR

_outcome=failed
trap 'rc=$?; [[ $rc -eq 0 ]] && _outcome=published; echo "finish-publish: $_outcome"' EXIT

echo "=== finishing the nightly's publish $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

# The publish lock first, as everywhere, then the staging lock, so that a send cannot
# rewrite STAGING while it is read. Both are file descriptors publish-notes.sh inherits.
exec 200>"$VAR_DIR/publish.lock"
if ! flock -w "$LOCK_WAIT" 200; then
    echo "the publish lock was held for more than ${LOCK_WAIT}s" >&2
    _outcome=busy; exit 75
fi
exec 201>"$STAGING_LOCK"
if ! flock -w "$LOCK_WAIT" 201; then
    echo "the staging lock was held for more than ${LOCK_WAIT}s" >&2
    _outcome=busy; exit 75
fi

cd "$REPO_ROOT"
for d in "$STAGING/export" "$STAGING/site" "$STAGING/cache/beeatlas-build" "$STAGING/cache/beeatlas-vite"; do
    [[ -d "$d" ]] || { echo "nothing staged: no $d" >&2; exit 1; }
done
# 1.
if ! EXPORT_DIR="$STAGING/export" BEEATLAS_SITE_DIR="$STAGING/site" BEEATLAS_CACHE_DIR="$STAGING/cache" \
        node scripts/build-receipt.mjs --check; then
    _outcome=stale; exit 79
fi

# 2. Each tree is copied beside its live one and renamed into place, so it is always
# either the old tree or the new. Several trees cannot change at one instant, so the
# receipt is withdrawn first and installed last: a run that dies in between leaves no
# receipt, and the next render is a full one, from whatever the trees then hold.
node scripts/build-receipt.mjs --invalidate
_install() {  # _install FROM TO
    local from="$1" to="$2"
    rm -rf "$to.next" "$to.prev"
    cp -a "$from" "$to.next"
    if [[ -e "$to" ]]; then mv "$to" "$to.prev"; fi
    mv "$to.next" "$to"
    rm -rf "$to.prev"
}
# The Machine's notes/ goes into the new export before it is renamed into place, so
# the export never lacks it.
rm -rf "$EXPORT_DIR.next" "$EXPORT_DIR.prev"
cp -a "$STAGING/export" "$EXPORT_DIR.next"
rm -rf "$EXPORT_DIR.next/notes"
if [[ -d "$EXPORT_DIR/notes" ]]; then
    cp -a "$EXPORT_DIR/notes" "$EXPORT_DIR.next/notes"
else
    mkdir "$EXPORT_DIR.next/notes"
fi
if [[ -e "$EXPORT_DIR" ]]; then mv "$EXPORT_DIR" "$EXPORT_DIR.prev"; fi
mv "$EXPORT_DIR.next" "$EXPORT_DIR"
rm -rf "$EXPORT_DIR.prev"
# _site and .cache are symlinks into the volume in the image (fly/Dockerfile); replace
# what they point at, not the links.
site=$(realpath "$REPO_ROOT/_site")
cache=$(realpath "$REPO_ROOT/.cache")
_install "$STAGING/site" "$site"
_install "$STAGING/cache/beeatlas-vite" "$cache/beeatlas-vite"
_install "$STAGING/cache/beeatlas-build" "$cache/beeatlas-build"
echo "  installed the staged build ($(node scripts/build-receipt.mjs --check 2>&1))"

# 3. The species whose notes/ file differs between the copy Hostess rendered with and
# the Machine's, either way round.
extra=$(
    { ls "$STAGING/export/notes"; ls "$EXPORT_DIR/notes"; } 2>/dev/null | sort -u \
    | while read -r f; do
        cmp -s "$STAGING/export/notes/$f" "$EXPORT_DIR/notes/$f" || echo "${f%.json}"
    done
)
echo "  notes that differ from Hostess's copy: $(printf '%s' "$extra" | grep -c . || true)"
PUBLISH_LOCK_HELD=1 EXTRA_RENDER_KEYS="$extra" PUBLISH_PATH=nightly \
    bash "$SCRIPT_DIR/publish-notes.sh"

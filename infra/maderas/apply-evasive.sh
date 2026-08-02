#!/usr/bin/env bash
# Install infra/maderas/evasive.conf as Apache's mod_evasive config (beeatlas-cit).
#
#     ssh -t maderas 'sudo bash ~/dev/beeatlas/infra/maderas/apply-evasive.sh'
#
# Idempotent, and safe to abandon at any point: the live file is backed up before
# it is touched, the new one is validated by `apache2ctl configtest` BEFORE Apache
# is asked to use it, and a failed check restores the backup and leaves the
# running server untouched. The reload is graceful, so in-flight requests finish.
#
# Run as root — it writes under /etc/apache2 and reloads the service.
set -euo pipefail

TARGET=/etc/apache2/mods-available/evasive.conf
SRC="$(cd "$(dirname "$0")" && pwd)/evasive.conf"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$TARGET.bak-$STAMP"

[[ $EUID -eq 0 ]] || { echo "ERROR: run me as root (sudo bash $0)." >&2; exit 1; }
[[ -f $SRC ]] || { echo "ERROR: $SRC not found — is the repo up to date?" >&2; exit 1; }

if [[ -f $TARGET ]] && cmp -s "$SRC" "$TARGET"; then
    echo "mod_evasive config already matches the repo; nothing to do."
    exit 0
fi

if [[ -f $TARGET ]]; then
    cp -p "$TARGET" "$BACKUP"
    echo "backed up  $TARGET -> $BACKUP"
fi

install -m 0644 -o root -g root "$SRC" "$TARGET"
echo "installed  $SRC -> $TARGET"

# Validate BEFORE reloading. A bad config that Apache has not read yet costs
# nothing; one it has read costs the site.
if ! apache2ctl configtest; then
    echo "ERROR: configtest failed — restoring the previous config, Apache untouched." >&2
    if [[ -f $BACKUP ]]; then
        cp -p "$BACKUP" "$TARGET"
        echo "restored   $BACKUP -> $TARGET" >&2
    else
        rm -f "$TARGET"
        echo "removed    $TARGET (there was no previous file)" >&2
    fi
    exit 1
fi

systemctl reload apache2
echo "reloaded apache2 (graceful)"

echo
echo "in effect:"
grep -E '^\s*DOS(PageCount|SiteCount|PageInterval|SiteInterval|BlockingPeriod)' "$TARGET" | sed 's/^/  /'

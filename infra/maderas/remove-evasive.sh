#!/usr/bin/env bash
# Remove mod_evasive from maderas entirely (ADR 0037, closes beeatlas-cit).
#
#     ssh -t maderas 'sudo bash ~/dev/beeatlas/infra/maderas/remove-evasive.sh'
#
# The read path is static files. mod_evasive was protecting against a threat this
# site does not have, while producing false positives on ordinary map panning
# (beeatlas-cit): a PMTiles archive is ONE URI that every tile is range-requested
# from, and a block is per client IP across the WHOLE vhost — the page and the
# occurrence database 403 too, not just the tiles.
#
# Disable AND purge, deliberately. A disabled-but-installed module is exactly the
# ambiguity ADR 0036 was written about, in reverse: the next person greps the
# package list, finds it, and cannot tell whether it is doing anything.
#
# Idempotent. Restore in one line if this turns out to be wrong:
#     apt-get install --reinstall libapache2-mod-evasive && a2enmod evasive \
#       && systemctl restart apache2
# — but restore the THRESHOLDS with it (git show HEAD~1:infra/maderas/evasive.conf),
# because the stock DOSPageCount 2 takes the site down within minutes.
#
# Run as root — it writes under /etc/apache2 and reloads the service.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "ERROR: run me as root (sudo bash $0)." >&2; exit 1; }

did_something=0

if apache2ctl -M 2>/dev/null | grep -q evasive; then
    echo "disabling the module..."
    a2dismod evasive
    did_something=1

    # Validate before touching the running server.
    if ! apache2ctl configtest; then
        echo "ERROR: configtest failed after a2dismod — re-enabling, Apache untouched." >&2
        a2enmod evasive
        exit 1
    fi

    # A graceful restart re-reads the config and reloads DSOs, which is enough to
    # drop a module. Verify rather than assume — and escalate if it did not take.
    systemctl reload apache2
    sleep 1
    if apache2ctl -M 2>/dev/null | grep -q evasive; then
        echo "still loaded after a graceful reload; doing a full restart."
        systemctl restart apache2
    fi
else
    echo "module already not loaded."
fi

if dpkg -l libapache2-mod-evasive 2>/dev/null | grep -q '^ii'; then
    echo "purging the package..."
    DEBIAN_FRONTEND=noninteractive apt-get purge -y libapache2-mod-evasive
    did_something=1
else
    echo "package already not installed."
fi

# apply-evasive.sh's timestamped backups, and the DOSLogDir — which never worked
# anyway: it was root:root 0755 while Apache runs as www-data, so mod_evasive could
# never create its dos-<ip> lock files there (beeatlas-hjdq).
rm -f /etc/apache2/mods-available/evasive.conf.bak-* 2>/dev/null || true
rm -rf /var/log/apache2/evasive 2>/dev/null || true

apache2ctl configtest

echo
if [[ $did_something -eq 0 ]]; then
    echo "nothing to do — mod_evasive was already gone."
fi
echo "module list (expect no evasive):"
apache2ctl -M 2>/dev/null | grep -i evasive || echo "  none"
echo
echo "what still limits abuse: mod_reqtimeout (slowloris) stays enabled, and"
echo "everything on the read path is a static file. See ADR 0037."

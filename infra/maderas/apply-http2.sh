#!/usr/bin/env bash
# Switch Apache to the event MPM so mod_http2 can actually serve h2 (ADR 0036).
#
#     ssh -t maderas 'sudo bash ~/dev/beeatlas/infra/maderas/apply-http2.sh'
#
# mod_http2 is already loaded and `Protocols h2 h2c http/1.1` is already set in
# mods-available/http2.conf. Neither does anything under mpm_prefork: mod_http2
# requires a threaded MPM, and under prefork it loads, warns once at startup, and
# serves HTTP/1.1 forever. The MPM is the whole fix.
#
# Idempotent. Unlike apply-evasive.sh this cannot be a graceful reload — changing
# the MPM swaps a module compiled against a different process model, so Apache has
# to restart. Expect a second or two of downtime on every vhost.
#
# Rollback:
#     a2dismod -f mpm_event && a2enmod mpm_prefork && a2dismod cgi && a2enmod cgi
#     apache2ctl configtest && systemctl restart apache2
#
# Run as root — it writes under /etc/apache2 and restarts the service.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "ERROR: run me as root (sudo bash $0)." >&2; exit 1; }

if apache2ctl -M 2>/dev/null | grep -q mpm_event_module; then
    echo "mpm_event is already the active MPM; nothing to do."
    apache2ctl -M 2>/dev/null | grep -E 'mpm|http2|cgi' | sed 's/^/  /'
    exit 0
fi

echo "before:"
apache2ctl -M 2>/dev/null | grep -E 'mpm|http2|cgi' | sed 's/^/  /'

# a2enmod refuses to proceed while a conflicting MPM is enabled, so prefork has to
# go first (-f: it is a required module until its replacement is in). Between these
# two lines the config has no MPM and would fail configtest — do not reload here.
a2dismod -f mpm_prefork
a2enmod mpm_event

# mod_cgi is prefork-only; threaded MPMs need mod_cgid. `a2enmod cgi` is a virtual
# module on Debian/Ubuntu that resolves to whichever suits the ACTIVE MPM, so the
# disable/enable pair does the substitution without this script naming either.
if a2query -m cgi >/dev/null 2>&1; then
    a2dismod cgi
    a2enmod cgi
fi

# Validate before restarting. A bad config Apache has not read yet costs nothing.
if ! apache2ctl configtest; then
    echo "ERROR: configtest failed — rolling the MPM back, Apache untouched." >&2
    a2dismod -f mpm_event || true
    a2enmod mpm_prefork || true
    a2dismod cgi >/dev/null 2>&1 || true
    a2enmod cgi >/dev/null 2>&1 || true
    exit 1
fi

systemctl restart apache2

echo
echo "after:"
apache2ctl -M 2>/dev/null | grep -E 'mpm|http2|cgi' | sed 's/^/  /'
echo
echo "verify from a workstation (a cached /assets/* file will still report 1.1 —"
echo "it never reaches the network; see ADR 0036):"
echo "  curl -sI --http2 https://beeatlas.net/ -o /dev/null -w '%{http_version}\\n'"

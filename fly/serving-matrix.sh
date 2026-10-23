#!/usr/bin/env bash
# The serving policy's test (beeatlas-zsi8): request representative URLs and check the
# status, Cache-Control, Content-Encoding, Content-Type, Accept-Ranges and redirect of
# each response against what the policy says.
#
#   fly/serving-matrix.sh https://beeatlas.net        # production, before cutover
#   fly/serving-matrix.sh http://localhost:8080       # Caddy in the image
#
# Run it against production and against the Fly origin before cutover, and again
# after. It checks what users get, which is what the policy is for: a wrong header
# breaks nothing visibly (ADR 0024: a response is not broken for being seven times
# larger), so this is the only place such a change shows.
#
# The hashed names change every publish, so they are read from the server's own
# manifests and home page. One redirect is a fixed example: Agapostemon texanus,
# folded into A. subtilior. If that fold is ever reversed, pick another from the
# build's species-redirects.map.
#
# Exit status: the number of failed checks, capped at 100; 0 means every check passed.

set -uo pipefail

base=${1:?usage: serving-matrix.sh <base URL, e.g. https://beeatlas.net>}
base=${base%/}
fails=0

# manifest_value <json> <key>: one string value out of a flat JSON object.
manifest_value() { grep -o "\"$2\": *\"[^\"]*\"" <<< "$1" | head -1 | sed 's/.*: *"\(.*\)"/\1/'; }

data_manifest=$(curl -fsS "$base/data/manifest.json") || { echo "cannot read $base/data/manifest.json" >&2; exit 100; }
tiles_manifest=$(curl -fsS "$base/basemap/tiles/manifest.json") || { echo "cannot read $base/basemap/tiles/manifest.json" >&2; exit 100; }
db=$(manifest_value "$data_manifest" occurrences_db)
counties=$(manifest_value "$data_manifest" counties)
archive=$(manifest_value "$tiles_manifest" archive)
terrain=$(grep -o '"archive": *"[^"]*terrain[^"]*"' <<< "$tiles_manifest" | sed 's/.*: *"\(.*\)"/\1/')
asset=$(curl -fsS "$base/" | grep -o '/assets/[^"]*\.js' | head -1)
for v in db counties archive terrain asset; do
    [[ -n "${!v}" ]] || { echo "could not discover $v from $base" >&2; exit 100; }
done

# check <label> <path> <accept-encoding> <range or -> <status> <cache-control> \
#       <content-encoding> <content-type> <accept-ranges> <location suffix>
# An expectation of * is not checked; - means the header must be absent.
check() {
    local label=$1 path=$2 ae=$3 range=$4
    local want_status=$5 want_cc=$6 want_enc=$7 want_type=$8 want_ranges=$9 want_loc=${10}
    local args=(-s -o /dev/null -D - -H "Accept-Encoding: $ae")
    [[ $range == - ]] || args+=(-H "Range: bytes=$range")
    local headers
    headers=$(curl "${args[@]}" "$base$path" | tr -d '\r')
    local status cc enc type ranges loc
    status=$(awk 'NR == 1 { print $2 }' <<< "$headers")
    field() { awk -v n="$1" 'BEGIN { IGNORECASE = 1 } tolower($0) ~ "^" n ":" { sub(/^[^:]*: */, ""); print; exit }' <<< "$headers"; }
    cc=$(field cache-control)
    enc=$(field content-encoding)
    type=$(field content-type); type=${type%%;*}
    ranges=$(field accept-ranges)
    loc=$(field location)
    local problems=()
    [[ $status == "$want_status" ]] || problems+=("status $status, want $want_status")
    expect() {  # expect <name> <got> <want>
        case $3 in
            '*') ;;
            -) [[ -z $2 ]] || problems+=("$1 '$2', want none") ;;
            *) [[ $2 == "$3" ]] || problems+=("$1 '${2:-none}', want '$3'") ;;
        esac
    }
    expect cache-control "$cc" "$want_cc"
    expect content-encoding "$enc" "$want_enc"
    expect content-type "$type" "$want_type"
    expect accept-ranges "$ranges" "$want_ranges"
    if [[ $want_loc != '*' && $loc != *"$want_loc" ]]; then
        problems+=("location '${loc:-none}', want …$want_loc")
    fi
    if ((${#problems[@]})); then
        printf 'FAIL  %-34s %s\n' "$label" "$path"
        printf '        %s\n' "${problems[@]}"
        fails=$((fails + 1))
    else
        printf 'ok    %-34s %s\n' "$label" "$path"
    fi
}

immutable='public, max-age=31536000, immutable'
br='br, gzip'
# label                          path                                   accept  range   status cache-control content-encoding content-type accept-ranges location
check 'page'                     /                                      "$br"   -       200 'max-age=0'  gzip text/html                 '*'   '*'
check 'service worker'           /sw.js                                 "$br"   -       200 'max-age=0'  gzip text/javascript           '*'   '*'
check 'hashed bundle'            "$asset"                               "$br"   -       200 "$immutable" gzip text/javascript           '*'   '*'
check 'data manifest'            /data/manifest.json                    "$br"   -       200 'no-cache'   gzip application/json          '*'   '*'
check 'hashed db, brotli'        "/data/$db"                            "$br"   -       200 "$immutable" br   application/octet-stream  '*'   '*'
check 'hashed db, gzip'          "/data/$db"                            gzip    -       200 "$immutable" gzip application/octet-stream  '*'   '*'
check 'hashed db, identity'      "/data/$db"                            identity -      200 "$immutable" -    application/octet-stream  '*'   '*'
check 'hashed geojson, brotli'   "/data/$counties"                      "$br"   -       200 "$immutable" br   application/json          '*'   '*'
check 'web app manifest'         /pwa/manifest.webmanifest              "$br"   -       200 'max-age=0'  '*'  application/manifest+json '*'   '*'
check 'maplibre worker'          /basemap/maplibre/maplibre-gl-worker.mjs "$br" -       200 'max-age=0'  gzip text/javascript           '*'   '*'
check 'glyphs'                   '/basemap/fonts/Noto%20Sans%20Regular/0-255.pbf' "$br" - 200 'max-age=0' - '*'                     '*'   '*'
# Caddy leaves everything under /basemap/tiles/ unencoded, but on Fly the edge proxy
# Brotli-encodes this small JSON file on its own, and fly.toml has no setting to stop
# it. That is harmless: the manifest is fetched whole. The two archives below are what
# PMTiles reads by range, and those must stay unencoded.
check 'tiles manifest'           /basemap/tiles/manifest.json           "$br"   -       200 'no-cache'   '*'  application/json          '*'   '*'
check 'basemap archive, range'   "/basemap/tiles/$archive"              "$br"   0-99    206 "$immutable" -    application/octet-stream  bytes '*'
check 'terrain archive, range'   "/basemap/tiles/$terrain"              "$br"   0-99    206 "$immutable" -    application/octet-stream  bytes '*'
check 'folded species'           /species/Agapostemon/texanus/          "$br"   -       301 '*'          '*'  '*'                       '*'   /species/Agapostemon/subtilior/index.html
check 'folded species, index'    /species/Agapostemon/texanus/index.html "$br"  -       301 '*'          '*'  '*'                       '*'   /species/Agapostemon/subtilior/index.html
check 'redirect map is private'  /species-redirects.map                 "$br"   -       403 '*'          '*'  '*'                       '*'   '*'
check 'missing page'             /no-such-page                          "$br"   -       404 '*'          '*'  '*'                       '*'   '*'

echo "$fails failed"
exit $((fails > 100 ? 100 : fails))

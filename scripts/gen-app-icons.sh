#!/usr/bin/env bash
# scripts/gen-app-icons.sh — regenerate /app PWA icons from the SVG master.
#
# NOT wired into the build (D-07 — avoids adding an image-processing dependency
# to the bespoke .11ty-vite pipeline). Run manually after editing icon.svg:
#
#   bash scripts/gen-app-icons.sh
#
# Requires: rsvg-convert (librsvg)
#   Install via: brew install librsvg
#
# The four output PNGs are committed static assets in public/app/icons/.
# They ride the Vite publicDir passthrough to land at /app/icons/ at runtime.
set -euo pipefail

SRC="public/app/icons/icon.svg"
OUT="public/app/icons"

command -v rsvg-convert >/dev/null || {
  echo "Error: rsvg-convert not found. Install with: brew install librsvg"
  exit 1
}

# Verify the SVG source exists
[ -f "$SRC" ] || { echo "Error: SVG master not found at $SRC"; exit 1; }

echo "Generating PWA icons from $SRC..."

# 192×192 — manifest any-purpose icon
rsvg-convert -w 192 -h 192 "$SRC" -o "$OUT/icon-192.png"
echo "  icon-192.png"

# 512×512 — manifest any-purpose icon
rsvg-convert -w 512 -h 512 "$SRC" -o "$OUT/icon-512.png"
echo "  icon-512.png"

# 512×512 — maskable safe-zone master (same design, D-06 single-design tradeoff)
# Bee is centered within the 40%-radius safe zone on the full-bleed #2c7a2c field.
rsvg-convert -w 512 -h 512 "$SRC" -o "$OUT/icon-maskable-512.png"
echo "  icon-maskable-512.png"

# 180×180 — Apple touch icon (opaque, no transparency; iOS rounds corners itself)
# Full green field, bee slightly larger than maskable safe zone is fine since iOS
# only applies corner rounding (not circle/squircle masking).
rsvg-convert -w 180 -h 180 "$SRC" -o "$OUT/apple-touch-icon-180.png"
echo "  apple-touch-icon-180.png"

echo "Done. Commit the updated PNGs in $OUT/"

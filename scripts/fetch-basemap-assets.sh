#!/usr/bin/env bash
# refresh the vendored protomaps glyphs and sprites under public/basemaps-assets,
# committed so a pmtiles basemap draws labels with no network.
# only the stacks the style asks for; the rest are symlinks into these, and
# symlinks do not survive a windows checkout.
set -euo pipefail
fonts=("Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic")
dest=$(cd "$(dirname "$0")/.." && pwd)/public/basemaps-assets
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git clone --depth 1 https://github.com/protomaps/basemaps-assets.git "$tmp/assets"
rm -rf "$dest"
mkdir -p "$dest/fonts" "$dest/sprites"
for font in "${fonts[@]}"; do
  cp -r "$tmp/assets/fonts/$font" "$dest/fonts/$font"
done
cp "$tmp/assets/fonts/OFL.txt" "$dest/fonts/OFL.txt"
cp -r "$tmp/assets/sprites/v4" "$dest/sprites/v4"

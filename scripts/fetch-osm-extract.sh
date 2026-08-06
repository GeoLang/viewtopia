#!/usr/bin/env bash
# fetch a geofabrik extract and verify it against the published md5.
# retries because -latest is replaced daily and a mid-update fetch can be corrupt.
set -uo pipefail
url=${1:?usage: fetch-osm-extract.sh <url> <dest>}
dest=${2:?usage: fetch-osm-extract.sh <url> <dest>}
for attempt in 1 2 3 4 5; do
  if curl -fsSL --retry 3 --retry-all-errors -o "$dest.tmp" "$url" &&
     curl -fsSL --retry 3 --retry-all-errors -o "$dest.md5" "$url.md5" &&
     echo "$(cut -d' ' -f1 "$dest.md5")  $dest.tmp" | md5sum -c --quiet -
  then
    mv -f "$dest.tmp" "$dest"
    rm -f "$dest.md5"
    exit 0
  fi
  echo "attempt $attempt failed, retrying in 30s" >&2
  sleep 30
done
echo "could not fetch a valid extract from $url" >&2
exit 1

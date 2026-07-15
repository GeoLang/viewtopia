#!/usr/bin/env bash
# one-command bring-up of the full GeoLang platform stack, including data prep.
# usage: scripts/platform-up.sh [geofabrik-extract-url]
set -euo pipefail
cd "$(dirname "$0")/.."

PBF_URL="${1:-https://download.geofabrik.de/europe/monaco-latest.osm.pbf}"

if [ ! -d ../geolang ]; then
  echo "missing sibling repos; run scripts/clone-geolang.sh first" >&2
  exit 1
fi
if [ ! -f ../geolang/.env ]; then
  echo "missing ../geolang/.env (LLM API keys); create it before bring-up" >&2
  exit 1
fi

mkdir -p data
if [ ! -f data/region.osm.pbf ]; then
  echo "downloading OSM extract: $PBF_URL"
  curl -fL "$PBF_URL" -o data/region.osm.pbf
fi

export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
docker compose -f docker-compose.platform.yml up -d --build

echo "waiting for services to report healthy..."
for i in $(seq 1 60); do
  unhealthy=$(docker compose -f docker-compose.platform.yml ps --format '{{.Name}} {{.Health}}' | grep -cv "healthy\|^\S* $" || true)
  starting=$(docker compose -f docker-compose.platform.yml ps --format '{{.Health}}' | grep -c starting || true)
  [ "$starting" -eq 0 ] && break
  sleep 5
done
docker compose -f docker-compose.platform.yml ps --format 'table {{.Name}}\t{{.Status}}'

if [ -f scripts/seed-parcels.mjs ]; then
  echo "seeding real-estate demo data..."
  node scripts/seed-parcels.mjs || echo "seed failed (ptolemy not ready yet?); rerun: node scripts/seed-parcels.mjs"
fi

echo
echo "viewer:  http://localhost:5174"
echo "agent:   http://localhost:5174/agent/health"
echo "jupyter: http://localhost:5174/jupyter/api"

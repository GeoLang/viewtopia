#!/usr/bin/env bash
set -euo pipefail

old_image=${1:?usage: upgrade-test.sh <old_image> <new_image>}
new_image=${2:?usage: upgrade-test.sh <old_image> <new_image>}

network=upgrade-test
database_container=upgrade-test-db
database_volume=upgrade-test-pgdata
database_image=postgis/postgis:16-3.4
database_password=upgrade-test
ptolemy_container=upgrade-test-ptolemy
host_port=13000
base_url=http://localhost:$host_port/api/v1
database_url=postgres://ptolemy:$database_password@$database_container/ptolemy
jwt_secret=upgrade-test-secret-of-at-least-32-bytes
dataset_name=upgrade-test
health_attempts=90

first_point_wkb_hex=0101000000c286a757cab21d40e6ae25e483de4540
second_point_wkb_hex=01010000009eefa7c64bb71d40910f7a36abde4540
third_point_wkb_hex=0101000000ca32c4b12eae1d40840d4faf94dd4540

cleanup() {
  docker rm -f "$ptolemy_container" "$database_container" >/dev/null 2>&1 || true
  docker volume rm -f "$database_volume" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

# v0.1.0 reads name and roles, v0.2.0 reads role
mint_token() {
  local issued_at header payload signature
  issued_at=$(date +%s)
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | base64url)
  payload=$(printf '{"sub":"upgrade-test","name":"upgrade test","roles":["admin"],"role":"admin","iat":%s,"exp":%s}' \
    "$issued_at" "$((issued_at + 3600))" | base64url)
  signature=$(printf '%s.%s' "$header" "$payload" |
    openssl dgst -sha256 -hmac "$jwt_secret" -binary | base64url)
  printf '%s.%s.%s' "$header" "$payload" "$signature"
}

# images up to v0.2.0 read PTOLEMY_JWT_SECRET
start_ptolemy() {
  docker run -d --name "$ptolemy_container" --network "$network" \
    -p "$host_port:3000" \
    -e "DATABASE_URL=$database_url" \
    -e "PLATFORM_JWT_SECRET=$jwt_secret" \
    -e "PTOLEMY_JWT_SECRET=$jwt_secret" \
    -e RUST_LOG=info \
    "$1" serve --bind 0.0.0.0:3000 >/dev/null
}

wait_for_health() {
  local attempt
  for attempt in $(seq "$health_attempts"); do
    if curl -fsS "$base_url/health" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  docker logs "$ptolemy_container" >&2
  echo "ptolemy never answered /api/v1/health" >&2
  exit 1
}

# v0.1.0 kept no ledger table
migration_version() {
  local ledger
  ledger=$(docker exec "$database_container" psql -U ptolemy -d ptolemy -tAc \
    "SELECT to_regclass('_sqlx_migrations')")
  if [ -z "$ledger" ]; then
    echo 0
    return
  fi
  docker exec "$database_container" psql -U ptolemy -d ptolemy -tAc \
    'SELECT COALESCE(MAX(version), 0) FROM _sqlx_migrations'
}

api() {
  curl -fsS -H "Authorization: Bearer $token" -H 'content-type: application/json' "$@"
}

dataset_snapshot() {
  api "$base_url/datasets/$dataset_id" |
    jq -S '{id, name, srid, geometry_type, created_at, created_by}'
}

features_snapshot() {
  api "$base_url/branches/$branch_id/features" |
    jq -S '[.features[] | {id, properties, geometry_wkb}] | sort_by(.id)'
}

docker network create "$network" >/dev/null

docker run -d --name "$database_container" --network "$network" \
  -v "$database_volume:/var/lib/postgresql/data" \
  -e POSTGRES_USER=ptolemy \
  -e "POSTGRES_PASSWORD=$database_password" \
  -e POSTGRES_DB=ptolemy \
  "$database_image" >/dev/null

for attempt in $(seq "$health_attempts"); do
  if docker exec "$database_container" pg_isready -U ptolemy >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# v0.1.0's serve does not migrate
docker run --rm --network "$network" -e "DATABASE_URL=$database_url" "$old_image" migrate >/dev/null

token=$(mint_token)

start_ptolemy "$old_image"
wait_for_health

version_before=$(migration_version)
echo "migration version on $old_image: $version_before"

dataset_body=$(jq -n --arg name "$dataset_name" \
  '{name: $name, srid: 4326, geometry_type: "point", created_by: "upgrade-test"}')
dataset_id=$(api -X POST "$base_url/datasets" -d "$dataset_body" | jq -r .id)

branch_body='{"name": "main", "created_by": "upgrade-test"}'
branch_id=$(api -X POST "$base_url/datasets/$dataset_id/branches" -d "$branch_body" | jq -r .id)

commit_body=$(jq -n \
  --arg first "$first_point_wkb_hex" \
  --arg second "$second_point_wkb_hex" \
  --arg third "$third_point_wkb_hex" \
  '{message: "upgrade test fixture", author: "upgrade-test", operations: [
     {type: "insert", geometry_wkb_hex: $first, properties: {name: "first", rank: 1}},
     {type: "insert", geometry_wkb_hex: $second, properties: {name: "second", rank: 2}},
     {type: "insert", geometry_wkb_hex: $third, properties: {name: "third", rank: 3}}
   ]}')
api -X POST "$base_url/branches/$branch_id/commit" -d "$commit_body" >/dev/null

dataset_before=$(dataset_snapshot)
features_before=$(features_snapshot)
feature_count=$(jq length <<<"$features_before")
if [ "$feature_count" -ne 3 ]; then
  echo "wrote 3 features, $old_image reads back $feature_count" >&2
  exit 1
fi
echo "wrote dataset $dataset_id branch $branch_id with $feature_count features"

docker rm -f "$ptolemy_container" >/dev/null

start_ptolemy "$new_image"
wait_for_health

version_after=$(migration_version)
echo "migration version on $new_image: $version_after"
if [ "$version_after" -le "$version_before" ]; then
  echo "migrations did not advance: $version_before then $version_after" >&2
  exit 1
fi

dataset_after=$(dataset_snapshot)
features_after=$(features_snapshot)

if ! diff <(printf '%s\n' "$dataset_before") <(printf '%s\n' "$dataset_after"); then
  echo "dataset changed across the upgrade" >&2
  exit 1
fi

if ! diff <(printf '%s\n' "$features_before") <(printf '%s\n' "$features_after"); then
  echo "features changed across the upgrade" >&2
  exit 1
fi

echo "pass: $feature_count features and their dataset survived $old_image to $new_image"

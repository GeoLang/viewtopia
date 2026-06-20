#!/usr/bin/env bash
#
# clone-geolang.sh — create a GeoLang workspace and clone every platform repo.
#
# Usage:
#   scripts/clone-geolang.sh [TARGET_DIR]
#
# Options (env or flags):
#   --pull          git pull repos that already exist (default: skip them)
#   --https         clone GeoLang GitHub repos over HTTPS instead of SSH
#   -h, --help      show this help
#
# Examples:
#   scripts/clone-geolang.sh                 # → ./GeoLang
#   scripts/clone-geolang.sh ~/src/GeoLang   # → that path
#   scripts/clone-geolang.sh --pull ~/src/GeoLang
#
# Notes:
#   * geolang lives on a private GitLab reached via the `gitlab-rsa` SSH host
#     alias — configure ~/.ssh/config for it, or the geolang clone will be skipped
#     with a warning (the rest still clone).
#   * letta is the upstream third-party repo geolang embeds; cloned over HTTPS.
#   * The script is idempotent: existing repos are left alone (or pulled with
#     --pull).
#
set -uo pipefail

PULL=0
HTTPS=0
TARGET=""

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --pull)  PULL=1 ;;
    --https) HTTPS=1 ;;
    -h|--help) usage 0 ;;
    -*) echo "unknown option: $1" >&2; usage 1 ;;
    *) TARGET="$1" ;;
  esac
  shift
done

TARGET="${TARGET:-GeoLang}"

# GeoLang-owned repos (cloned from the GeoLang GitHub org).
GITHUB_REPOS=(
  collecta
  fenestra
  fluvius
  geodukt
  geogit
  geokode
  GeoLang.github.io
  infrastructure
  interiora
  itinera
  jung
  nubis
  panoptes
  projicio
  ptolemy
  terrano
  terravista
  tiletopia
  topoi
  viewtopia
)

# name<TAB>clone-url for repos that don't live in the GeoLang GitHub org.
EXTERNAL_REPOS=(
  "geolang	gitlab-rsa:geolanghq/geolang.git"   # private GitLab (SSH host alias)
  "letta	https://github.com/letta-ai/letta.git" # upstream Letta (third-party)
)

github_url() {
  if [ "$HTTPS" -eq 1 ]; then
    echo "https://github.com/GeoLang/$1.git"
  else
    echo "git@github.com:GeoLang/$1.git"
  fi
}

mkdir -p "$TARGET"
cd "$TARGET" || { echo "cannot enter $TARGET" >&2; exit 1; }
echo "Workspace: $(pwd)"
echo

OK=0 SKIP=0 FAIL=0
FAILED=()

clone_one() {
  local name="$1" url="$2"
  if [ -d "$name/.git" ]; then
    if [ "$PULL" -eq 1 ]; then
      echo "↻ $name — pulling"
      if git -C "$name" pull --ff-only; then OK=$((OK+1)); else FAIL=$((FAIL+1)); FAILED+=("$name"); fi
    else
      echo "• $name — already present, skipping"
      SKIP=$((SKIP+1))
    fi
    return
  fi
  echo "⇣ $name — cloning from $url"
  if git clone "$url" "$name"; then
    OK=$((OK+1))
  else
    echo "  ✗ failed to clone $name" >&2
    FAIL=$((FAIL+1)); FAILED+=("$name")
  fi
}

for name in "${GITHUB_REPOS[@]}"; do
  clone_one "$name" "$(github_url "$name")"
done

for entry in "${EXTERNAL_REPOS[@]}"; do
  name="${entry%%	*}"
  url="${entry#*	}"
  clone_one "$name" "$url"
done

echo
echo "Done — $OK ok, $SKIP skipped, $FAIL failed."
if [ "$FAIL" -gt 0 ]; then
  echo "Failed: ${FAILED[*]}" >&2
  echo "(SSH repos need your key on file; geolang needs the 'gitlab-rsa' SSH host alias.)" >&2
  exit 1
fi

#!/usr/bin/env bash
# Run k6 scenarios in the pinned Grafana image. No host k6 install.
#
#   loadtest/run.sh                       # every scenario
#   loadtest/run.sh ptolemy               # one scenario
#   LOADTEST_VUS=5 LOADTEST_DURATION=10s loadtest/run.sh ptolemy    # smoke
#
# Summaries land in loadtest/out/<scenario>.json. Exit status is k6's, so a
# breached threshold fails the caller.
set -euo pipefail
cd "$(dirname "$0")/.."

K6_IMAGE="${K6_IMAGE:-grafana/k6:2.1.0}"
SCENARIOS=("$@")
if [ ${#SCENARIOS[@]} -eq 0 ]; then
  SCENARIOS=(ptolemy tiletopia geokode itinera fenestra)
fi

mkdir -p loadtest/out

# Reads are public, but send an editor token anyway so the measured path matches
# what an authenticated viewer does. Empty when the stack runs with auth off.
LOADTEST_TOKEN="$(node -e '
import("./scripts/platform-token.mjs").then(({ mintToken }) =>
  process.stdout.write(mintToken({ role: "editor", sub: "loadtest", ttlSec: 7200 }) ?? ""));
')"
export LOADTEST_TOKEN

status=0
for scenario in "${SCENARIOS[@]}"; do
  echo "── $scenario ──"
  # --network host: the scenarios target ports published on the host, and the
  # front proxy binds 127.0.0.1, which the docker bridge gateway cannot reach.
  docker run --rm -i -u "$(id -u)" --network host \
    -v "$PWD/loadtest:/loadtest" -w /loadtest \
    -e LOADTEST_BASE_URL -e LOADTEST_FENESTRA_URL -e LOADTEST_FENESTRA_LAYER \
    -e LOADTEST_TOKEN -e LOADTEST_VUS -e LOADTEST_RATE -e LOADTEST_DURATION \
    -e LOADTEST_DEPTHS -e LOADTEST_OUT -e LOADTEST_P95_SCALE \
    "$K6_IMAGE" run "k6/$scenario.js" || status=$?
done
exit "$status"

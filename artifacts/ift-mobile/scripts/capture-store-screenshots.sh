#!/usr/bin/env bash
# Capture the canonical 8-screen App Store screenshot set in both required sizes
# (6.7" and 6.1") by driving the production iOS build through Maestro.
#
# Prerequisites (run once per workstation):
#   - macOS with Xcode + iOS Simulator runtimes installed
#   - `brew tap mobile-dev-inc/tap && brew install maestro`
#   - The production .app already built and installed on the simulators
#     (see README.md in artifacts/ift-mobile/store-assets for the EAS recipe)
#   - MAESTRO_DEMO_EMAIL / MAESTRO_DEMO_PASSWORD / MAESTRO_DEMO_THREAD_NAME
#     exported in the shell — these are the credentials for the demo account
#     used in the screenshots.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
FLOWS_DIR="$APP_DIR/maestro"
OUT_ROOT="$APP_DIR/store-assets/screenshots"

: "${MAESTRO_DEMO_EMAIL:?Set MAESTRO_DEMO_EMAIL to the demo account email}"
: "${MAESTRO_DEMO_PASSWORD:?Set MAESTRO_DEMO_PASSWORD to the demo account password}"
: "${MAESTRO_DEMO_THREAD_NAME:=Demo Operator}"
: "${BUNDLE_ID:=com.iftid.mobile}"

# device_name -> output bucket
#  - 6.7" → "iPhone 15 Pro Max" (1290x2796)
#  - 6.1" → "iPhone 15 Pro"     (1179x2556)
DEVICES=(
  "iPhone 15 Pro Max:6.7"
  "iPhone 15 Pro:6.1"
)

run_for_device() {
  local device="$1" bucket="$2"
  local out="$OUT_ROOT/$bucket"
  mkdir -p "$out"

  echo "▶ Booting simulator: $device"
  xcrun simctl boot "$device" 2>/dev/null || true
  open -a Simulator --args -CurrentDeviceUDID "$(xcrun simctl list devices | awk -v d="$device" '$0 ~ d && /Booted|Shutdown/ {gsub(/[()]/,""); print $(NF-1); exit}')"

  echo "▶ Re-launching $BUNDLE_ID"
  xcrun simctl terminate "$device" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$device" "$BUNDLE_ID" >/dev/null

  echo "▶ Running Maestro screenshot suite → $out"
  MAESTRO_DRIVER_STARTUP_TIMEOUT=120000 \
  maestro --device "$device" test \
    -e OUTPUT_DIR="$out" \
    -e MAESTRO_DEMO_EMAIL="$MAESTRO_DEMO_EMAIL" \
    -e MAESTRO_DEMO_PASSWORD="$MAESTRO_DEMO_PASSWORD" \
    -e MAESTRO_DEMO_THREAD_NAME="$MAESTRO_DEMO_THREAD_NAME" \
    "$FLOWS_DIR/screenshots.yaml"

  local expected=(01-feed 02-explore 03-soul-twin 04-career-oracle \
                  05-profile 06-bounties 07-leaderboard 08-dm-ttl)
  local missing=()
  for name in "${expected[@]}"; do
    [[ -f "$out/$name.png" ]] || missing+=("$name.png")
  done
  if (( ${#missing[@]} > 0 )); then
    echo "✗ $bucket: missing ${#missing[@]} expected screenshot(s): ${missing[*]}" >&2
    exit 1
  fi
  echo "✓ Captured all 8 PNGs in $out"
}

for entry in "${DEVICES[@]}"; do
  device="${entry%%:*}"
  bucket="${entry##*:}"
  run_for_device "$device" "$bucket"
done

echo
echo "All screenshots written under: $OUT_ROOT"

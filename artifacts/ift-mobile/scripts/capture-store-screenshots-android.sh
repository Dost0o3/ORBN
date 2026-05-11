#!/usr/bin/env bash
# Capture the canonical 8-screen Play Store screenshot set in both required
# form factors (phone 1080x1920+ and 10" tablet) by driving the production
# Android build through Maestro. This is the Android sibling of
# capture-store-screenshots.sh — Maestro is cross-platform and the same flows
# under maestro/screenshots.yaml work unchanged because every selector is
# text-based.
#
# Prerequisites (run once per workstation):
#   - Android Studio with the SDK + emulator + platform-tools installed
#   - $ANDROID_HOME (or $ANDROID_SDK_ROOT) pointing at the SDK
#   - The two AVDs created (names must match $PHONE_AVD / $TABLET_AVD below):
#       avdmanager create avd -n Pixel_7_API_34 -k \
#         "system-images;android-34;google_apis_playstore;x86_64" -d pixel_7
#       avdmanager create avd -n Pixel_Tablet_API_34 -k \
#         "system-images;android-34;google_apis_playstore;x86_64" -d pixel_tablet
#   - `brew tap mobile-dev-inc/tap && brew install maestro`
#   - The production .apk already built and installable
#     (see README.md in artifacts/ift-mobile/store-assets for the EAS recipe)
#   - MAESTRO_DEMO_EMAIL / MAESTRO_DEMO_PASSWORD / MAESTRO_DEMO_THREAD_NAME
#     exported in the shell — same demo account used for the iOS run.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
FLOWS_DIR="$APP_DIR/maestro"
OUT_ROOT="$APP_DIR/store-assets/screenshots/android"

: "${MAESTRO_DEMO_EMAIL:?Set MAESTRO_DEMO_EMAIL to the demo account email}"
: "${MAESTRO_DEMO_PASSWORD:?Set MAESTRO_DEMO_PASSWORD to the demo account password}"
: "${MAESTRO_DEMO_THREAD_NAME:=Demo Operator}"
: "${BUNDLE_ID:=com.iftid.mobile}"
: "${PHONE_AVD:=Pixel_7_API_34}"
: "${TABLET_AVD:=Pixel_Tablet_API_34}"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"

EMULATOR_BIN="$ANDROID_HOME/emulator/emulator"
ADB_BIN="$ANDROID_HOME/platform-tools/adb"

if [[ ! -x "$EMULATOR_BIN" ]]; then
  echo "✗ Cannot find emulator at $EMULATOR_BIN — set ANDROID_HOME" >&2
  exit 1
fi
if [[ ! -x "$ADB_BIN" ]]; then
  echo "✗ Cannot find adb at $ADB_BIN — set ANDROID_HOME" >&2
  exit 1
fi

# avd_name -> output bucket
#  - phone  → Pixel 7 (1080x2400, satisfies Play Store 1080x1920+ phone slot)
#  - tablet → Pixel Tablet (10" class)
DEVICES=(
  "$PHONE_AVD:phone"
  "$TABLET_AVD:tablet"
)

wait_for_boot() {
  local serial="$1"
  echo "▶ Waiting for $serial to finish booting…"
  "$ADB_BIN" -s "$serial" wait-for-device
  local booted=""
  for _ in $(seq 1 60); do
    booted="$("$ADB_BIN" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
    [[ "$booted" == "1" ]] && return 0
    sleep 2
  done
  echo "✗ $serial never reported sys.boot_completed=1" >&2
  return 1
}

run_for_device() {
  local avd="$1" bucket="$2"
  local out="$OUT_ROOT/$bucket"
  mkdir -p "$out"

  # Refuse to run if any emulator is already attached — otherwise the
  # "find the new serial" logic below could grab the wrong device, and the
  # `adb emu kill` at the end would shut down somebody else's emulator.
  local preexisting
  preexisting="$("$ADB_BIN" devices | awk '/^emulator-[0-9]+\t/ {print $1}')"
  if [[ -n "$preexisting" ]]; then
    echo "✗ Refusing to start $avd: another emulator is already attached:" >&2
    echo "$preexisting" >&2
    echo "  Stop it first (e.g. \`adb -s <serial> emu kill\`) and retry." >&2
    exit 1
  fi

  echo "▶ Booting AVD: $avd"
  "$EMULATOR_BIN" -avd "$avd" -no-snapshot-save -no-boot-anim \
    -gpu swiftshader_indirect >/tmp/emulator-"$avd".log 2>&1 &
  local emu_pid=$!
  trap 'kill '"$emu_pid"' 2>/dev/null || true' RETURN

  # Resolve the serial for *this* AVD specifically by matching `adb emu avd
  # name` output against the AVD we just booted, instead of grabbing the
  # first emulator-* line. This survives a stray pre-existing emulator and
  # ensures we never tear down the wrong device on cleanup.
  local serial=""
  for _ in $(seq 1 60); do
    while read -r candidate; do
      [[ -z "$candidate" ]] && continue
      local name
      name="$("$ADB_BIN" -s "$candidate" emu avd name 2>/dev/null \
        | head -n1 | tr -d '\r')"
      if [[ "$name" == "$avd" ]]; then
        serial="$candidate"
        break
      fi
    done < <("$ADB_BIN" devices | awk '/^emulator-[0-9]+\t/ {print $1}')
    [[ -n "$serial" ]] && break
    sleep 2
  done
  if [[ -z "$serial" ]]; then
    echo "✗ No emulator serial matched AVD $avd" >&2
    exit 1
  fi
  wait_for_boot "$serial"

  echo "▶ Re-launching $BUNDLE_ID on $serial"
  "$ADB_BIN" -s "$serial" shell am force-stop "$BUNDLE_ID" || true
  "$ADB_BIN" -s "$serial" shell monkey -p "$BUNDLE_ID" \
    -c android.intent.category.LAUNCHER 1 >/dev/null

  echo "▶ Running Maestro screenshot suite → $out"
  MAESTRO_DRIVER_STARTUP_TIMEOUT=120000 \
  maestro --device "$serial" test \
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

  echo "▶ Shutting down $serial"
  "$ADB_BIN" -s "$serial" emu kill >/dev/null 2>&1 || true
  wait "$emu_pid" 2>/dev/null || true
  trap - RETURN
}

for entry in "${DEVICES[@]}"; do
  avd="${entry%%:*}"
  bucket="${entry##*:}"
  run_for_device "$avd" "$bucket"
done

echo
echo "All Android screenshots written under: $OUT_ROOT"

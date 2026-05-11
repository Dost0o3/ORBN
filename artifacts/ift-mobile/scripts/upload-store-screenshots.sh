#!/usr/bin/env bash
# Upload the captured App Store screenshots to App Store Connect using
# `fastlane deliver`. Pairs with capture-store-screenshots.sh — run that first
# (or pass --capture to chain them in one command).
#
# Auth uses an App Store Connect API key (no interactive Apple ID password).
# Required env vars:
#   ASC_KEY_ID            App Store Connect API Key ID (e.g. ABCD123456)
#   ASC_ISSUER_ID         Issuer ID UUID from App Store Connect → Users & Access → Keys
#   ASC_KEY_P8            Either the .p8 private key contents OR a path to the .p8 file
# Optional:
#   ASC_APP_BUNDLE_ID     The app's bundle identifier (defaults to com.iftid.mobile)
#   ASC_LOCALE            App Store Connect locale slot (defaults to en-US)
#
# Prerequisites (run once per workstation):
#   - Ruby 3.x and `gem install fastlane` (or `brew install fastlane`)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
OUT_ROOT="$APP_DIR/store-assets/screenshots"

CAPTURE_FIRST=0
for arg in "$@"; do
  case "$arg" in
    --capture) CAPTURE_FIRST=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if (( CAPTURE_FIRST )); then
  echo "▶ Capturing screenshots first"
  "$HERE/capture-store-screenshots.sh"
fi

: "${ASC_KEY_ID:?Set ASC_KEY_ID to your App Store Connect API Key ID}"
: "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID to your App Store Connect Issuer ID}"
: "${ASC_KEY_P8:?Set ASC_KEY_P8 to the .p8 contents or a path to the .p8 file}"
: "${ASC_APP_BUNDLE_ID:=com.iftid.mobile}"
: "${ASC_LOCALE:=en-US}"

if ! command -v fastlane >/dev/null 2>&1; then
  echo "✗ fastlane not found — install it with 'brew install fastlane' or 'gem install fastlane'" >&2
  exit 1
fi

EXPECTED_SHOTS=(
  01-feed
  02-explore
  03-soul-twin
  04-career-oracle
  05-profile
  06-bounties
  07-leaderboard
  08-dm-ttl
)

for bucket in 6.7 6.1; do
  if [[ ! -d "$OUT_ROOT/$bucket" ]]; then
    echo "✗ Missing $OUT_ROOT/$bucket — run capture-store-screenshots.sh (or pass --capture) first" >&2
    exit 1
  fi
  for name in "${EXPECTED_SHOTS[@]}"; do
    if [[ ! -f "$OUT_ROOT/$bucket/$name.png" ]]; then
      echo "✗ Missing expected screenshot: $OUT_ROOT/$bucket/$name.png" >&2
      exit 1
    fi
  done
  # Reject extras so we don't accidentally upload stale or out-of-set PNGs.
  while IFS= read -r found; do
    base="$(basename "$found" .png)"
    keep=0
    for name in "${EXPECTED_SHOTS[@]}"; do
      [[ "$base" == "$name" ]] && { keep=1; break; }
    done
    if (( ! keep )); then
      echo "✗ Unexpected PNG in $OUT_ROOT/$bucket: $base.png — remove it before uploading" >&2
      exit 1
    fi
  done < <(find "$OUT_ROOT/$bucket" -maxdepth 1 -name '*.png')
done

# Build a temp directory laid out the way `fastlane deliver` expects:
#   <root>/<locale>/<filename>.png
# Both display sizes share the same locale folder; deliver picks the slot
# based on the PNG's pixel dimensions.
STAGING="$(mktemp -d -t orbn-asc-screenshots-XXXX)"
trap 'rm -rf "$STAGING"' EXIT
LOCALE_DIR="$STAGING/$ASC_LOCALE"
mkdir -p "$LOCALE_DIR"

for bucket in 6.7 6.1; do
  for src in "$OUT_ROOT/$bucket"/*.png; do
    base="$(basename "$src" .png)"
    cp "$src" "$LOCALE_DIR/${base}-${bucket}.png"
  done
done

# Materialise the API key into a real .p8 file if the var holds the contents.
KEY_PATH="$STAGING/AuthKey_${ASC_KEY_ID}.p8"
if [[ -f "$ASC_KEY_P8" ]]; then
  cp "$ASC_KEY_P8" "$KEY_PATH"
else
  printf '%s' "$ASC_KEY_P8" > "$KEY_PATH"
fi
chmod 600 "$KEY_PATH"

API_KEY_JSON="$STAGING/asc-api-key.json"
cat > "$API_KEY_JSON" <<JSON
{
  "key_id": "$ASC_KEY_ID",
  "issuer_id": "$ASC_ISSUER_ID",
  "key_filepath": "$KEY_PATH",
  "in_house": false
}
JSON

echo "▶ Uploading screenshots to App Store Connect ($ASC_APP_BUNDLE_ID, locale $ASC_LOCALE)"
fastlane deliver \
  --api_key_path "$API_KEY_JSON" \
  --app_identifier "$ASC_APP_BUNDLE_ID" \
  --screenshots_path "$STAGING" \
  --skip_binary_upload true \
  --skip_metadata true \
  --skip_app_version_update true \
  --overwrite_screenshots true \
  --force true \
  --precheck_include_in_app_purchases false \
  --run_precheck_before_submit false

echo "✓ Uploaded $(find "$LOCALE_DIR" -name '*.png' | wc -l | tr -d ' ') screenshots to App Store Connect"

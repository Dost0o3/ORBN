# ORBN — App Store & Play Store screenshot automation

Apple requires both **6.7"** (iPhone 15 Pro Max, 1290×2796) and **6.1"**
(iPhone 15 Pro, 1179×2556) screenshots when submitting to App Store Connect.
Google Play requires a **phone** set (1080×1920 or larger) and a **10" tablet**
set. This directory holds the canonical 8-screen set for all four buckets and
the Maestro flow that captures them from the production builds. The same
`maestro/screenshots.yaml` suite drives both platforms because every selector
is text-based.

```
store-assets/
├── README.md                ← you are here
└── screenshots/
    ├── 6.7/                 ← 1290×2796 PNGs for iPhone 15 Pro Max
    │   ├── 01-feed.png
    │   ├── 02-explore.png
    │   ├── 03-soul-twin.png
    │   ├── 04-career-oracle.png
    │   ├── 05-profile.png
    │   ├── 06-bounties.png
    │   ├── 07-leaderboard.png
    │   └── 08-dm-ttl.png
    ├── 6.1/                 ← 1179×2556 PNGs for iPhone 15 Pro
    │   └── (same 8 files)
    └── android/
        ├── phone/           ← 1080×2400 PNGs from a Pixel 7 AVD
        │   └── (same 8 files)
        └── tablet/          ← 10" tablet PNGs from a Pixel Tablet AVD
            └── (same 8 files)
```

## One-time setup (macOS)

1. Install Xcode, then add the iPhone 15 Pro and iPhone 15 Pro Max simulator
   runtimes from `Xcode → Settings → Platforms`.
2. Install Maestro:
   ```sh
   brew tap mobile-dev-inc/tap
   brew install maestro
   ```
3. Build the production iOS `.app` and install it on both simulators:
   ```sh
   cd artifacts/ift-mobile
   pnpm eas:build:ios --local --profile production --non-interactive
   xcrun simctl install "iPhone 15 Pro Max" build/ORBN.app
   xcrun simctl install "iPhone 15 Pro"     build/ORBN.app
   ```
4. Export the demo-account credentials Maestro will sign in with. The account
   should already be seeded with realistic content (a feed, a bounty, a DM
   thread with TTL enabled, etc.) so the captured screens look polished:
   ```sh
   export MAESTRO_DEMO_EMAIL="demo@orbn.app"
   export MAESTRO_DEMO_PASSWORD="•••••••••"
   export MAESTRO_DEMO_THREAD_NAME="Demo Operator"   # optional, default shown
   ```

## One-time setup (Android, macOS or Linux)

1. Install Android Studio, then from the SDK Manager install the latest SDK
   platform-tools, the Android 34 system image
   (`google_apis_playstore;x86_64`), and the emulator package.
2. Export `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) so the capture script can find
   `emulator` and `adb`:
   ```sh
   export ANDROID_HOME="$HOME/Library/Android/sdk"   # macOS default
   export PATH="$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"
   ```
3. Create the two AVDs the capture script expects (override the names with
   `PHONE_AVD` / `TABLET_AVD` if you already have AVDs you'd rather reuse):
   ```sh
   avdmanager create avd -n Pixel_7_API_34 \
     -k "system-images;android-34;google_apis_playstore;x86_64" -d pixel_7
   avdmanager create avd -n Pixel_Tablet_API_34 \
     -k "system-images;android-34;google_apis_playstore;x86_64" -d pixel_tablet
   ```
4. Build the production Android `.apk` and install it on both AVDs (boot each
   one once, then `adb install`):
   ```sh
   cd artifacts/ift-mobile
   pnpm eas:build:android --local --profile production --non-interactive
   adb install -r build/ORBN.apk
   ```
5. Reuse the same `MAESTRO_DEMO_*` env vars exported for the iOS run — Maestro
   signs in through the same shared `00-sign-in.yaml` subflow on Android.

## Capturing the screenshots before each release

```sh
cd artifacts/ift-mobile
./scripts/capture-store-screenshots.sh           # iOS  → 6.7/ + 6.1/
./scripts/capture-store-screenshots-android.sh   # Play → android/phone + android/tablet
```

The iOS script:

1. Boots the iPhone 15 Pro Max simulator, launches the production build, runs
   the Maestro suite (`maestro/screenshots.yaml`) and writes the 8 PNGs into
   `store-assets/screenshots/6.7/`.
2. Repeats the same flow on the iPhone 15 Pro simulator and writes to
   `store-assets/screenshots/6.1/`.

The Android script does the same thing twice against the AVDs:

1. Boots `Pixel_7_API_34`, waits for `sys.boot_completed=1`, launches the
   production APK, runs `maestro/screenshots.yaml` and writes the 8 PNGs into
   `store-assets/screenshots/android/phone/`.
2. Shuts that emulator down, then repeats against `Pixel_Tablet_API_34` and
   writes to `store-assets/screenshots/android/tablet/`.

Each Maestro flow signs in via the shared `00-sign-in.yaml` subflow (it is a
no-op when the app is already signed in), navigates to the target screen,
waits for animations to settle, and calls `takeScreenshot`.

Captured screens (in suite order):

| # | Screen                                | Source                                              |
| - | ------------------------------------- | --------------------------------------------------- |
| 1 | Feed (For You)                        | `app/(tabs)/index.tsx`                              |
| 2 | Explore                               | `app/(tabs)/explore.tsx`                            |
| 3 | Soul Twin chat                        | `app/soul-twin.tsx`                                 |
| 4 | Career Oracle                         | `app/career-oracle.tsx`                             |
| 5 | Profile (PowerScoreDial)              | `app/(tabs)/profile.tsx`                            |
| 6 | Bounties                              | `app/bounties.tsx`                                  |
| 7 | Dark Horse Leaderboard                | `app/leaderboard.tsx`                               |
| 8 | DM with TTL chip                      | `app/messages/[conversationId].tsx`                 |

## Uploading to App Store Connect

The capture step is now paired with `scripts/upload-store-screenshots.sh`,
which wraps `fastlane deliver` and pushes both display-size sets to the
correct App Store Connect slots in one command.

### One-time setup

1. Install fastlane: `brew install fastlane` (or `gem install fastlane`).
2. In App Store Connect → *Users & Access* → *Integrations* → *App Store
   Connect API*, generate an API key with the **App Manager** role and
   download the `.p8` file. Keep it somewhere safe — Apple only lets you
   download it once.
3. Export the key + IDs in your shell (use a secrets manager in CI):
   ```sh
   export ASC_KEY_ID="ABCD123456"
   export ASC_ISSUER_ID="69a6de70-…-uuid"
   export ASC_KEY_P8="$HOME/.appstoreconnect/AuthKey_ABCD123456.p8"
   # or paste the .p8 contents directly:
   # export ASC_KEY_P8="$(cat ~/.appstoreconnect/AuthKey_ABCD123456.p8)"
   export ASC_APP_BUNDLE_ID="com.iftid.mobile"   # optional, default shown
   export ASC_LOCALE="en-US"                      # optional, default shown
   ```

### One-command release flow

```sh
cd artifacts/ift-mobile
./scripts/upload-store-screenshots.sh --capture
```

The `--capture` flag re-runs `capture-store-screenshots.sh` first; omit it to
upload the PNGs already on disk. The script:

1. Verifies both `screenshots/6.7/` and `screenshots/6.1/` contain all 8 PNGs.
2. Stages them into a temp `<locale>/` folder (deliver picks the 6.7" vs 6.1"
   slot from each PNG's pixel dimensions).
3. Materialises the API key from `ASC_KEY_P8` (path *or* contents) into a
   throwaway `.p8` and a `fastlane`-style `api_key_path` JSON file.
4. Calls `fastlane deliver` with `--skip_binary_upload`,
   `--skip_metadata`, and `--overwrite_screenshots true` so only the screen
   shot slots for `ASC_APP_BUNDLE_ID` are touched.

Commit the regenerated PNGs to the repo so the next release diffs are
visible during review.

## Adjusting the flow

- Add or reorder shots by editing `maestro/screenshots.yaml` and the matching
  `maestro/flows/0X-*.yaml` files.
- Selectors are text-based (`tapOn: "Profile"`) so the flow does not require
  modifying any product source. If a screen's title copy changes, update the
  matching `extendedWaitUntil` clause.
- To dry-run a single flow without touching the suite:
  ```sh
  maestro test \
    -e OUTPUT_DIR="$PWD/store-assets/screenshots/6.7" \
    -e MAESTRO_DEMO_EMAIL="$MAESTRO_DEMO_EMAIL" \
    -e MAESTRO_DEMO_PASSWORD="$MAESTRO_DEMO_PASSWORD" \
    maestro/flows/05-profile.yaml
  ```

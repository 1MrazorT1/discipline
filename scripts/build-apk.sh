#!/usr/bin/env bash
#
# Build a debug APK locally (no EAS/cloud needed).
# Requires: the portable JDK + Android SDK in .local-build/ (see setup below)
#
# First-time setup (run once):
#   1. Download JDK 17:
#      curl -L -o .local-build/jdk17.tar.gz \
#        "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
#      tar -xzf .local-build/jdk17.tar.gz -C .local-build/
#
#   2. Download Android cmdline-tools:
#      curl -L -o .local-build/cmdline-tools.zip \
#        "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
#      mkdir -p .local-build/android-sdk/cmdline-tools/latest
#      unzip .local-build/cmdline-tools.zip -d .local-build/android-sdk/cmdline-tools/latest
#      mv .local-build/android-sdk/cmdline-tools/latest/cmdline-tools/* \
#         .local-build/android-sdk/cmdline-tools/latest/
#      rm -rf .local-build/android-sdk/cmdline-tools/latest/cmdline-tools .local-build/cmdline-tools.zip
#
#   3. Install SDK packages (Gradle auto-downloads NDK + platform 36 on first build):
#      source .local-build/env.sh
#      yes | sdkmanager --licenses
#      sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

BUILD_DIR="$ROOT_DIR/.local-build"
JDK_DIR=$(ls -d "$BUILD_DIR"/jdk-17* 2>/dev/null | head -1)
ANDROID_HOME="$BUILD_DIR/android-sdk"

if [[ -z "$JDK_DIR" ]]; then
  echo "ERROR: JDK not found in $BUILD_DIR/. Run the setup steps in this script's header." >&2
  exit 1
fi

export JAVA_HOME="$JDK_DIR"
export ANDROID_HOME="$ANDROID_HOME"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
export NODE_ENV=production

# Limit heap to avoid OOM; adjust --max-workers based on available RAM
# (2 workers is fine on machines with 4GB+ free RAM, 1 worker for <3GB free)
export GRADLE_OPTS="-Xmx2g -Dfile.encoding=UTF-8"

# Load env variables (.env) so EXPO_PUBLIC_SUPABASE_* are baked into the JS bundle
if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
  echo "Loaded env variables from .env"
else
  echo "WARNING: .env not found — app will not be able to connect to Supabase." >&2
  echo "  Create .env with EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY." >&2
fi

# 1. Ensure native Android project exists
if [[ ! -d "$ROOT_DIR/android" ]]; then
  echo "Generating native Android project..."
  npx expo prebuild --platform android --no-install
fi

# 2. Build the APK
echo "Building debug APK..."
cd "$ROOT_DIR/android"
./gradlew assembleDebug --no-daemon --max-workers=2

echo ""
echo "✓ APK built successfully:"
ls -lh "$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"

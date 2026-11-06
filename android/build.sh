#!/usr/bin/env bash
# Build a signed aikido APK without Gradle: aapt → javac → dx/d8 → zipalign → apksigner.
#
# SDK discovery (override any of these):
#   ANDROID_JAR   platform android.jar (API ≥ 23); default: highest under $ANDROID_HOME/platforms,
#                 else /usr/lib/android-sdk (Debian/Ubuntu `android-sdk-platform-23`)
#   BUILD_TOOLS   build-tools dir; default: newest under $ANDROID_HOME/build-tools that has aapt
# Signing (optional; without it a throwaway key is generated per build):
#   AIKIDO_KEYSTORE, AIKIDO_KEYSTORE_PASS, AIKIDO_KEY_ALIAS
# Versioning: versionName comes from pyproject.toml; versionCode from AIKIDO_VERSION_CODE (default 1).
#
# Output: android/build/aikido.apk
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="$HERE/build"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/lib/android-sdk}}"
if [[ -z "${ANDROID_JAR:-}" ]]; then
  ANDROID_JAR="$(ls -d "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1)"
fi
if [[ -z "${BUILD_TOOLS:-}" ]]; then
  BUILD_TOOLS="$(dirname "$(ls -d "$SDK"/build-tools/*/aapt 2>/dev/null | sort -V | tail -1)")"
fi
[[ -f "$ANDROID_JAR" ]] || { echo "android.jar not found (set ANDROID_JAR)" >&2; exit 1; }
[[ -x "$BUILD_TOOLS/aapt" ]] || { echo "build-tools not found (set BUILD_TOOLS)" >&2; exit 1; }
echo "android.jar: $ANDROID_JAR"
echo "build-tools: $BUILD_TOOLS"

VERSION_NAME="$(sed -n 's/^version = "\(.*\)"/\1/p' "$ROOT/pyproject.toml" | head -1)"
VERSION_CODE="${AIKIDO_VERSION_CODE:-1}"

rm -rf "$OUT"
mkdir -p "$OUT/assets/site" "$OUT/classes"

# 1. Assets: the docs site plus the mobile daily-capture page.
cp -R "$ROOT/docs/." "$OUT/assets/site/"
rm -rf "$OUT/assets/site/_templates" "$OUT/assets/site/commands.meta.json" "$OUT/assets/site/.nojekyll"
cp -R "$HERE/assets/." "$OUT/assets/site/"

# 2. Resources + manifest → unsigned APK.
"$BUILD_TOOLS/aapt" package -f \
  -M "$HERE/AndroidManifest.xml" -S "$HERE/res" -A "$OUT/assets" -I "$ANDROID_JAR" \
  --version-name "$VERSION_NAME" --version-code "$VERSION_CODE" --replace-version \
  -F "$OUT/unsigned.apk"

# 3. Java → classes → dex.
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" $(find "$HERE/src" -name '*.java')
if [[ -x "$BUILD_TOOLS/d8" ]]; then
  "$BUILD_TOOLS/d8" --release --min-api 23 --lib "$ANDROID_JAR" --output "$OUT" \
    $(find "$OUT/classes" -name '*.class')
else
  "$BUILD_TOOLS/dx" --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"
fi
(cd "$OUT" && "$BUILD_TOOLS/aapt" add unsigned.apk classes.dex >/dev/null)

# 4. Align + sign.
"$BUILD_TOOLS/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [[ -n "${AIKIDO_KEYSTORE:-}" ]]; then
  KS="$AIKIDO_KEYSTORE"; KS_PASS="${AIKIDO_KEYSTORE_PASS:?}"; KEY_ALIAS="${AIKIDO_KEY_ALIAS:?}"
else
  echo "AIKIDO_KEYSTORE not set: signing with a throwaway key (updates will need a reinstall)."
  KS="$OUT/throwaway.keystore"; KS_PASS="android"; KEY_ALIAS="aikido"
  keytool -genkeypair -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=aikido, O=aikido" >/dev/null 2>&1
fi
KS_PASS="$KS_PASS" "$BUILD_TOOLS/apksigner" sign --ks "$KS" --ks-pass env:KS_PASS \
  --ks-key-alias "$KEY_ALIAS" --out "$OUT/aikido.apk" "$OUT/aligned.apk"
"$BUILD_TOOLS/apksigner" verify "$OUT/aikido.apk"

rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$OUT/aligned.apk.idsig" "$OUT/aikido.apk.idsig"
echo "Built $OUT/aikido.apk (v$VERSION_NAME, code $VERSION_CODE)"

#!/bin/sh
# APK aus CI holen, mit dem Schlüssel des Mini-PCs signieren und unter
# /homeassistant/www/yapaia-cam.apk (= /local/yapaia-cam.apk) ablegen.
#
#   cam/signieren.sh [Run-ID]
#
# Ohne Run-ID: der letzte erfolgreiche CI-Lauf des aktuellen Branches.
# Schlüssel: /data/claude/yapaia-cam/yapaia-cam.p12 (Passwort daneben).
# Immer derselbe Schlüssel – sonst nimmt Android Updates nicht an.
set -eu
SCHLUESSEL=/data/claude/yapaia-cam
WERKZEUG=/data/claude/tools/android/apksigner.jar
ZIEL=/homeassistant/www/yapaia-cam.apk

command -v java >/dev/null || apk add --no-progress openjdk17-jre-headless >/dev/null
if [ ! -f "$WERKZEUG" ]; then
  mkdir -p "$(dirname "$WERKZEUG")"
  curl -sSfL -o /tmp/bt.zip https://dl.google.com/android/repository/build-tools_r35_linux.zip
  unzip -o -q -j /tmp/bt.zip 'android-15/lib/apksigner.jar' -d "$(dirname "$WERKZEUG")"
  rm /tmp/bt.zip
fi

LAUF=${1:-$(gh run list --workflow ci.yml --branch "$(git rev-parse --abbrev-ref HEAD)" --status success -L 1 --json databaseId -q '.[0].databaseId')}
[ -n "$LAUF" ] || { echo "Kein erfolgreicher CI-Lauf gefunden." >&2; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
gh run download "$LAUF" -n yapaia-cam-unsigniert -D "$TMP"
java -jar "$WERKZEUG" sign --ks "$SCHLUESSEL/yapaia-cam.p12" --ks-type PKCS12 \
  --ks-pass "file:$SCHLUESSEL/passwort.txt" --out "$TMP/yapaia-cam.apk" "$TMP/app-release-unsigned.apk"
java -jar "$WERKZEUG" verify "$TMP/yapaia-cam.apk"
cp "$TMP/yapaia-cam.apk" "$ZIEL"
# Für den Update-Knopf der App: welche Version bereitliegt (aus dem Stand im Repo)
GRADLE="$(dirname "$0")/app/build.gradle.kts"
CODE=$(sed -n 's/.*versionCode = \([0-9]*\).*/\1/p' "$GRADLE")
NAME=$(sed -n 's/.*versionName = "\(.*\)".*/\1/p' "$GRADLE")
printf '{"versionCode": %s, "versionName": "%s"}\n' "$CODE" "$NAME" > "${ZIEL%.apk}.json"
echo "Fertig: $ZIEL (CI-Lauf $LAUF) – auf dem Radio: /local/yapaia-cam.apk"

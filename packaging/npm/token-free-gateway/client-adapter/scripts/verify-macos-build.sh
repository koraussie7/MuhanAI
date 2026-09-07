#!/usr/bin/env bash
# verify-macos-build.sh — A5.
#
# Apply patches/app.config.js.patch to a freshly extracted Happy source
# tree, then assert every MuhanAI branding change landed AND every
# original Happy endpoint was overwritten. This is the static half of A5;
# the dynamic half (codesign + launch) is gated on having a real macOS
# build host, which CI on linux cannot provide.
#
# Usage:
#   ./scripts/verify-macos-build.sh <happy-source-dir>
#
# Exits 0 on success, non-zero on any missing substitution.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <happy-source-dir>" >&2
  exit 64
fi

HAPPY_SRC="$1"
CFG="$HAPPY_SRC/packages/happy-app/app.config.js"

[ -f "$CFG" ] || { echo "error: $CFG not found" >&2; exit 64; }

# --- apply patch if not already applied ---
if grep -q '"MuhanAI"' "$CFG"; then
  echo "patch already applied — verifying substitutions"
else
  echo "applying patch"
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
  bash "$SCRIPT_DIR/verify-patch.sh" "$HAPPY_SRC"
  git -C "$HAPPY_SRC" apply "$SCRIPT_DIR/../patches/app.config.js.patch"
fi

# --- assertion 1: every name/bundle renamed to MuhanAI ---
echo ""
echo "=== assertion 1: branding substitutions ==="
for old in '"Happy (dev)"' '"Happy (preview)"' '"Happy"'; do
  if grep -qF "$old" "$CFG"; then
    echo "FAIL: $old still present" >&2
    exit 1
  fi
done
echo "  OK — no 'Happy' display names remain"

for old in 'com.slopus.happy.dev' 'com.slopus.happy.preview' 'com.ex3ndr.happy'; do
  if grep -qF "$old" "$CFG"; then
    echo "FAIL: $old still present" >&2
    exit 1
  fi
done
echo "  OK — no upstream bundle ids remain"

# --- assertion 2: every Happy endpoint replaced ---
echo ""
echo "=== assertion 2: endpoint substitution ==="
for old in 'app.happy.engineering' 'applinks:app.happy.engineering'; do
  if grep -qF "$old" "$CFG"; then
    echo "FAIL: $old still present" >&2
    exit 1
  fi
done
echo "  OK — no happy.engineering references remain"

# --- assertion 3: MuhanAI config present ---
echo ""
echo "=== assertion 3: MuhanAI config injected ==="
for required in 'muhanaiGateway' 'muhanaiWebsocket' 'muhanaiPush' 'adapterVersion' 'api.muhanai.com'; do
  if ! grep -qF "$required" "$CFG"; then
    echo "FAIL: $required missing from extra.app" >&2
    exit 1
  fi
done
echo "  OK — muhanaiGateway / muhanaiWebsocket / muhanaiPush / adapterVersion present"

# --- summary ---
echo ""
echo "=== summary ==="
grep -nE '"MuhanAI|com\.muhanai\.client|muhanai(app|Gateway|Websocket|Push)' "$CFG" | head -20
echo ""
echo "All A5 static checks passed."
echo "Dynamic macOS verification (codesign + launch) requires a real macOS host."

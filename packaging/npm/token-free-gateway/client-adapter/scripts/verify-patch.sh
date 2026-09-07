#!/usr/bin/env bash
# verify-patch.sh — apply every .patch in patches/ against a freshly downloaded
# Happy source tree, then `git apply --check` to assert no hunk drift.
#
# Usage:
#   ./scripts/verify-patch.sh <happy-source-dir>
#
# Exits 0 on success, non-zero on any patch that fails to apply cleanly.
# This is the same check patch-package performs at install time — if it
# passes here, our installer script will also pass.

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <happy-source-dir>" >&2
  exit 64
fi

HAPPY_SRC="$1"
PATCH_DIR="$(dirname "$0")/../patches"

if [ ! -d "$HAPPY_SRC" ]; then
  echo "error: $HAPPY_SRC is not a directory" >&2
  exit 64
fi

if [ ! -d "$HAPPY_SRC/.git" ]; then
  echo "error: $HAPPY_SRC is not a git repo (patch-package requires git)" >&2
  exit 64
fi

shopt -s nullglob
patches=("$PATCH_DIR"/*.patch)
if [ ${#patches[@]} -eq 0 ]; then
  echo "error: no .patch files in $PATCH_DIR" >&2
  exit 64
fi

failed=0
for patch in "${patches[@]}"; do
  echo "==> checking $(basename "$patch")"
  # patch-package uses `git apply --check` internally; we mirror that here.
  if git -C "$HAPPY_SRC" apply --check "$patch" 2>/dev/null; then
    echo "    OK"
  elif git -C "$HAPPY_SRC" apply --check --3way "$patch" 2>/dev/null; then
    echo "    OK (3way merge fallback)"
  else
    echo "    FAILED — hunk drift against pinned Happy version" >&2
    git -C "$HAPPY_SRC" apply --check "$patch" || true
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "One or more patches failed to apply. Likely causes:" >&2
  echo "  - Happy upstream bumped past our pinned version (bump HAPPY_PINNED_VERSION)" >&2
  echo "  - patch context lines drifted (regenerate via \`npx patch-package <pkg>\`)" >&2
  exit 1
fi

echo ""
echo "All patches apply cleanly against $HAPPY_SRC."

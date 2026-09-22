#!/bin/bash
set -euo pipefail

# ============================================================
# MuhanAI Dashboard v2 — inject into muhanai.com/dashboard
# Run on the 110 server (ssh 110) from the repo/deploy dir.
#
# Idempotent: safe to re-run. It will
#   1. publish dashboard-v2.html into the Caddy web root
#   2. patch an EXISTING Caddyfile with the /dashboard + /dashboard2 handle
#      block (setup-caddy-muhanai.sh only works on a fresh Caddyfile)
#   3. validate + reload Caddy, then verify the route
# ============================================================

WEB_ROOT="${WEB_ROOT:-/var/www/muhanai.com/current}"
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
SRC_HTML="${SRC_HTML:-$(dirname "$0")/dashboard-v2.html}"
BACKUP_DIR="${BACKUP_DIR:-/etc/caddy/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== MuhanAI Dashboard v2 injection ==="
echo ""

# 1. Publish the static page ------------------------------------------------
echo "[1/4] Publishing dashboard-v2.html -> ${WEB_ROOT}/"
if [ ! -f "$SRC_HTML" ]; then
    echo "       ERROR: source not found: $SRC_HTML"
    echo "       Build web-app first (public/dashboard-v2.html -> dist/) or set SRC_HTML."
    exit 1
fi
if [ ! -d "$WEB_ROOT" ]; then
    echo "       ERROR: web root does not exist: $WEB_ROOT"
    exit 1
fi
cp "$SRC_HTML" "${WEB_ROOT}/dashboard-v2.html"
echo "       OK ($(wc -c < "${WEB_ROOT}/dashboard-v2.html" | tr -d ' ') bytes)"

# 2. Patch the Caddyfile (idempotent) --------------------------------------
echo "[2/4] Checking Caddy config..."
mkdir -p "$BACKUP_DIR"
if grep -q '@dashboard' "$CADDYFILE" 2>/dev/null; then
    echo "       Already present — no patch needed."
else
    cp "$CADDYFILE" "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
    echo "       Backup: ${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"

    # Insert the handle block immediately before the SPA catch-all, which is
    # the first bare "handle {" line inside the site block.
    python3 - "$CADDYFILE" <<'PY'
import re, sys

path = sys.argv[1]
src = open(path, encoding="utf-8").read()

if "@dashboard" in src:
    sys.exit(0)

block = """\t@dashboard path /dashboard /dashboard/ /dashboard2 /dashboard2/
\thandle @dashboard {
\t\trewrite * /dashboard-v2.html
\t\tfile_server
\t\theader Cache-Control "no-cache"
\t}

"""

# The catch-all is a tab-indented `handle {`; anchor on the first occurrence.
m = re.search(r"^\t handle\s*\{", src, flags=re.MULTILINE) or re.search(
    r"^\thandle\s*\{", src, flags=re.MULTILINE
)
if not m:
    sys.stderr.write("ERROR: could not locate SPA catch-all `handle {` block\n")
    sys.exit(2)

open(path, "w", encoding="utf-8").write(src[: m.start()] + block + src[m.start():])
print("       Patched: inserted @dashboard handle before catch-all.")
PY
fi

# 3. Validate + reload ------------------------------------------------------
echo "[3/4] Validating Caddy config..."
if command -v caddy &>/dev/null; then
    if caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
        echo "       Config valid."
    else
        echo "       ERROR: validation failed — reverting."
        cp "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}" "$CADDYFILE"
        exit 1
    fi
    if command -v systemctl &>/dev/null && systemctl is-active caddy &>/dev/null; then
        systemctl reload caddy
        echo "       Caddy reloaded (systemctl)."
    elif [ -f /run/caddy/caddy.pid ]; then
        kill -HUP "$(cat /run/caddy/caddy.pid)" 2>/dev/null || true
        echo "       Caddy sent SIGHUP."
    else
        echo "       WARNING: could not auto-reload. Run: sudo systemctl restart caddy"
    fi
else
    echo "       WARNING: caddy binary not found; config written but not applied."
fi

# 4. Verify -----------------------------------------------------------------
echo "[4/4] Verifying route..."
if command -v curl &>/dev/null; then
    # Both published paths answer with the page — a patch that only covers
    # /dashboard would pass a single-route check while /dashboard2 404s.
    for route in /dashboard /dashboard2; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: muhanai.com' "http://127.0.0.1${route}" || true)
    echo "       GET ${route} -> ${code} (expect 200)"
    curl -s -H 'Host: muhanai.com' "http://127.0.0.1${route}" 2>/dev/null \
        | grep -q 'cosmic-mesh\|space-nav\|1-Click' \
        && echo "         Body check: dashboard-v2 markers found." \
        || echo "         WARNING: body did not contain dashboard-v2 markers."
done
fi

echo ""
echo "=== Done ==="
echo "Verify: curl -sI https://muhanai.com/dashboard | head -1"
echo "        curl -sI https://muhanai.com/dashboard2 | head -1"
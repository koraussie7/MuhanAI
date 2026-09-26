#!/bin/bash
set -euo pipefail

# ============================================================
# hotel.kbizhub.com origin block for Caddy on the 110 server.
#
# Run on the origin host (ssh 110):
#   cd /tmp && bash setup-caddy-hotel.sh
#
# Idempotent: re-running replaces the previous hotel.kbizhub.com block
# with the one shipped alongside this script (Caddyfile.hotel).
#
# Why `tls internal`: Cloudflare is Proxied (orange cloud) in front of this
# host, so the browser-facing certificate is Cloudflare's. Caddy's internal CA
# covers the Cloudflare -> origin leg, exactly like danang.kbizhub.com and
# shop1.kbizhub.com already on this box. Cloudflare's SSL/TLS mode must be
# Full (not Flexible) for this to work.
# ============================================================

CADDYFILE="/etc/caddy/Caddyfile"
BLOCK_FILE="${BLOCK_FILE:-/tmp/Caddyfile.hotel}"
BACKUP_DIR="/etc/caddy/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
HOSTNAME_BLOCK="hotel.kbizhub.com"

echo "=== hotel.kbizhub.com Caddy Site Block Setup ==="
echo ""

[ -f "$BLOCK_FILE" ] || { echo "error: $BLOCK_FILE not found (scp deploy/Caddyfile.hotel 110:/tmp/)"; exit 1; }

# 1. Backup
echo "[1/4] Backing up ${CADDYFILE}..."
mkdir -p "$BACKUP_DIR"
if [ -f "$CADDYFILE" ]; then
	cp "$CADDYFILE" "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
	echo "       Backup: ${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
fi

# 2. Strip any previous block for this host, then append the new one.
#    A block starts at "^host {" and runs to the first line that is exactly "}".
echo "[2/4] Removing any existing ${HOSTNAME_BLOCK} block..."
awk -v host="${HOSTNAME_BLOCK}" '
	$0 ~ "^"host"[ ,{]" { skip = 1 }
	skip && $0 == "}" { skip = 0; next }
	!skip { print }
' "$CADDYFILE" > "${CADDYFILE}.tmp"
mv "${CADDYFILE}.tmp" "$CADDYFILE"

echo "[3/4] Appending the new block from ${BLOCK_FILE}..."
{
	echo ""
	cat "$BLOCK_FILE"
} >> "$CADDYFILE"

# 3. Validate before reloading — a bad Caddyfile takes the whole box down.
echo "[4/4] Validating and reloading Caddy..."
if caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
	systemctl reload caddy
	echo "       Caddy reloaded."
else
	echo "error: Caddyfile failed validation — restoring backup"
	cp "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}" "$CADDYFILE"
	exit 1
fi

echo ""
echo "Done. Next:"
echo "  1. Cloudflare SSL/TLS mode for kbizhub.com must be Full or Full (strict)."
echo "  2. Start the Kamra stack so 127.0.0.1:8000 answers:"
echo "       curl -fsSL https://raw.githubusercontent.com/Kamra-PMS/kamra-pms/main/deploy/install.sh | bash"
echo "     (site name: hotel.kbizhub.com, HTTP_PUBLISH_PORT=8000)"
echo "  3. Verify: curl -I https://hotel.kbizhub.com/kamra"
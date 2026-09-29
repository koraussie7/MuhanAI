#!/bin/bash
set -euo pipefail

# ============================================================
# prompt.kbizhub.com + prompt-api.kbizhub.com origin blocks for
# Caddy on the 110 server (Latitude self-host).
#
# Run on the origin host (ssh 110):
#   scp deploy/Caddyfile.latitude deploy/setup-caddy-latitude.sh 110:/tmp/
#   ssh 110 'cd /tmp && sudo bash setup-caddy-latitude.sh'
#
# Idempotent: re-running strips any previous blocks for BOTH hostnames
# and appends the shipped Caddyfile.latitude once (it carries both sites).
#
# Why `tls internal`: Cloudflare is Proxied (orange cloud) in front of this
# host, so the browser-facing certificate is Cloudflare's. Caddy's internal CA
# covers the Cloudflare -> origin leg, exactly like hotel.kbizhub.com.
# Cloudflare's SSL/TLS mode must be Full (strict) for this to work.
#
# These hostnames must NOT become Worker routes in wrangler.toml — the
# muhanai Worker has no handler for them and would answer 525/522.
# ============================================================

CADDYFILE="/etc/caddy/Caddyfile"
BLOCK_FILE="${BLOCK_FILE:-/tmp/Caddyfile.latitude}"
BACKUP_DIR="/etc/caddy/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
HOSTS=("prompt.kbizhub.com" "prompt-api.kbizhub.com")

echo "=== Latitude (prompt*.kbizhub.com) Caddy Site Block Setup ==="
echo ""

[ -f "$BLOCK_FILE" ] || { echo "error: $BLOCK_FILE not found (scp deploy/Caddyfile.latitude 110:/tmp/)"; exit 1; }

# 1. Backup
echo "[1/3] Backing up ${CADDYFILE}..."
mkdir -p "$BACKUP_DIR"
if [ -f "$CADDYFILE" ]; then
	cp "$CADDYFILE" "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
	echo "        Backup: ${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
fi

# 2. Strip any previous blocks for these hosts, then append the new file once.
#    A block starts at "^host {" and runs to the first line that is exactly "}".
echo "[2/3] Removing any existing ${HOSTS[*]} blocks..."
for host in "${HOSTS[@]}"; do
	awk -v host="$host" '
		$0 ~ "^"host"[ ,{]" { skip = 1 }
		skip && $0 == "}" { skip = 0; next }
		!skip { print }
	' "$CADDYFILE" > "${CADDYFILE}.tmp"
	mv "${CADDYFILE}.tmp" "$CADDYFILE"
done

echo "        Appending the new blocks from ${BLOCK_FILE}..."
{
	echo ""
	cat "$BLOCK_FILE"
} >> "$CADDYFILE"

# 3. Validate before reloading — a bad Caddyfile takes the whole box down.
echo "[3/3] Validating and reloading Caddy..."
if caddy validate --config "$CADDYFILE" >/dev/null 2>&1; then
	systemctl reload caddy
	echo "        Caddy reloaded."
else
	echo "error: Caddyfile failed validation — restoring backup"
	cp "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}" "$CADDYFILE"
	exit 1
fi

echo ""
echo "Done. Next:"
echo "  1. Cloudflare SSL/TLS mode for kbizhub.com must be Full (strict)."
echo "  2. Cloudflare DNS: add Proxied A records"
echo "       prompt.kbizhub.com      -> 185.55.240.110"
echo "       prompt-api.kbizhub.com  -> 185.55.240.110"
echo "  3. Bring up the stack (see deploy/latitude/README.md), then verify:"
echo "       curl -I https://prompt.kbizhub.com"
echo "       curl -fsS https://prompt-api.kbizhub.com/health"
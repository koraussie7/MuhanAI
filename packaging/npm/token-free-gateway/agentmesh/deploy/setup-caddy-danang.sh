#!/bin/sh
# Idempotently install the danang.kbizhub.com origin block on the 110 host.
set -eu
CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
WEB_ROOT="${DANANG_WEB_ROOT:-/var/www/danang.kbizhub.com/current}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if grep -q '^danang\.kbizhub\.com' "$CADDYFILE" 2>/dev/null; then
	echo "danang.kbizhub.com block already exists"
	exit 0
fi
mkdir -p "$WEB_ROOT"
cp "$CADDYFILE" "${CADDYFILE}.bak-danang-$(date +%Y%m%d%H%M%S)"
printf '\n' >> "$CADDYFILE"
cat "$SCRIPT_DIR/Caddyfile.danang" >> "$CADDYFILE"
caddy validate --config "$CADDYFILE"
systemctl reload caddy
echo "danang.kbizhub.com block installed and Caddy reloaded"

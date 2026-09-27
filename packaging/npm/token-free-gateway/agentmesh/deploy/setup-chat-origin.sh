#!/usr/bin/env bash
# One-time origin setup for chat.muhanai.com.
#
# chat.muhanai.com IS a Cloudflare Worker route (see wrangler.toml), so the
# Worker renders the chat shell on "/" and proxies /assets/* to the Vite
# bundle. This Caddy block is the origin fallback for /assets/* requests.
#
# Cloudflare terminates public TLS for the proxied A record; the origin only
# needs a self-signed cert for the Cloudflare→origin TLS hop. We use
# `tls internal` (Caddy's internal CA), matching the blog.muhanai.com and
# main muhanai.com blocks — Cloudflare accepts this in "Full" SSL mode.
# Without any `tls` directive Caddy defaults to ACME, which fails behind a
# proxied DNS record and produces Cloudflare 525.
#
# Run on the origin (185.55.240.110):
#   scp deploy/Caddyfile.muhanai deploy/setup-chat-origin.sh 110:/tmp/
#   ssh 110 'sudo bash /tmp/setup-chat-origin.sh'
#
# Idempotent: safe to re-run. Backs up /etc/caddy/Caddyfile, creates the chat
# document root, appends the chat.muhanai.com site block (if missing), validates
# the config and reloads Caddy. If validation fails the backup is restored.
set -euo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
SOURCE_CADDYFILE="${1:-/tmp/Caddyfile.muhanai}"
DOC_ROOT="/var/www/chat.muhanai.com"
BACKUP_DIR="/etc/caddy/backups"
TIMESTAMP="$(date +%Y%m%dT%H%M%SZ)"

if [[ "$(id -u)" -ne 0 ]]; then
	echo "error: run as root (sudo bash $0)" >&2
	exit 1
fi
if ! command -v caddy >/dev/null 2>&1; then
	echo "error: caddy not found on this host" >&2
	exit 1
fi

mkdir -p "$BACKUP_DIR" "$DOC_ROOT/releases"
if [[ -f "$CADDYFILE" ]]; then
	cp "$CADDYFILE" "$BACKUP_DIR/Caddyfile.backup.$TIMESTAMP"
	echo "backup: $BACKUP_DIR/Caddyfile.backup.$TIMESTAMP"
else
	touch "$CADDYFILE"
	echo "created empty $CADDYFILE"
fi

if grep -q "^chat\.muhanai\.com" "$CADDYFILE" 2>/dev/null; then
	echo "site block already present — keeping the existing one"
else
	if [[ ! -f "$SOURCE_CADDYFILE" ]]; then
		echo "error: source Caddyfile not found: $SOURCE_CADDYFILE" >&2
		echo "       pass the repo's deploy/Caddyfile.muhanai as \$1" >&2
		exit 1
	fi
	# Extract the complete chat site block from the repo Caddyfile, so this
	# script never clobbers the muhanai.com / blog / hotel blocks already live
	# on origin. Count braces because the site contains nested handle blocks.
	BLOCK="$(awk '
	/^chat\.muhanai\.com \{/ { in_block=1 }
	in_block {
	print
	line=$0
	opens=gsub(/\{/, "{", line)
	closes=gsub(/\}/, "}", line)
	depth += opens - closes
	if (depth == 0) exit
	}
	' "$SOURCE_CADDYFILE")"
	if [[ -z "$BLOCK" ]]; then
		echo "error: no 'chat.muhanai.com {' block found in $SOURCE_CADDYFILE" >&2
		exit 1
	fi
	{
		echo ""
		echo "# === chat.muhanai.com (Bitterbot Worker route) added $TIMESTAMP ==="
		echo "$BLOCK"
	} >>"$CADDYFILE"
	echo "appended chat.muhanai.com site block"
fi

if caddy validate --config "$CADDYFILE"; then
	systemctl reload caddy || systemctl restart caddy
	echo "caddy reloaded"
else
	cp "$BACKUP_DIR/Caddyfile.backup.$TIMESTAMP" "$CADDYFILE"
	echo "error: config invalid — restored backup" >&2
	exit 1
fi

mkdir -p /var/log/caddy
echo ""
echo "setup complete — chat.muhanai.com Worker route is in wrangler.toml"
echo "publish a build with:  ./deploy/build-chat.sh   (or push to main to trigger CI)"

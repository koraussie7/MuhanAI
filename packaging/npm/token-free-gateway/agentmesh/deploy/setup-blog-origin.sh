#!/usr/bin/env bash
# One-time origin setup for blog.muhanai.com.
#
# Run on the origin (185.55.240.110):
#   scp deploy/Caddyfile.muhanai deploy/setup-blog-origin.sh 110:/tmp/
#   ssh 110 'sudo bash /tmp/setup-blog-origin.sh'
#
# Idempotent: safe to re-run. Backs up /etc/caddy/Caddyfile, creates the blog
# document root, appends the blog.muhanai.com site block (if missing), validates
# the config and reloads Caddy. If validation fails the backup is restored.
set -euo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
SOURCE_CADDYFILE="${1:-/tmp/Caddyfile.muhanai}"
DOC_ROOT="/var/www/blog.muhanai.com"
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

if grep -q "^blog\.muhanai\.com" "$CADDYFILE" 2>/dev/null; then
	echo "site block already present — keeping the existing one"
else
	if [[ ! -f "$SOURCE_CADDYFILE" ]]; then
		echo "error: source Caddyfile not found: $SOURCE_CADDYFILE" >&2
		echo "       pass the repo's deploy/Caddyfile.muhanai as \$1" >&2
		exit 1
	fi

	# Extract only the blog site block from the repo Caddyfile, so this script
	# never clobbers the muhanai.com / hotel blocks already live on the origin.
	BLOCK="$(awk '/^blog\.muhanai\.com \{/{flag=1} flag{print} flag&&/^\}/{exit}' "$SOURCE_CADDYFILE")"
	if [[ -z "$BLOCK" ]]; then
		echo "error: no 'blog.muhanai.com {' block found in $SOURCE_CADDYFILE" >&2
		exit 1
	fi

	{
		echo ""
		echo "# === blog.muhanai.com (Hugo) added $TIMESTAMP ==="
		echo "$BLOCK"
	} >>"$CADDYFILE"
	echo "appended blog.muhanai.com site block"
fi

if caddy validate --config "$CADDYFILE"; then
	systemctl reload caddy || systemctl restart caddy
	echo "caddy reloaded"
else
	cp "$BACKUP_DIR/Caddyfile.backup.$TIMESTAMP" "$CADDYFILE"
	echo "error: config invalid — restored backup" >&2
	exit 1
fi

if ! command -v hugo >/dev/null 2>&1; then
	cat >&2 <<'MSG'
note: hugo is not installed on this host.
      The GitHub Actions workflow (.github/workflows/deploy-blog.yml) builds the
      site and uploads the output, so hugo is not required on the origin.
      To build on the host instead:  apt-get install -y hugo   (or snap install hugo)
MSG
fi

mkdir -p /var/log/caddy

echo ""
echo "setup complete — https://blog.muhanai.com will serve $DOC_ROOT/current"
echo "publish a build with:  ./deploy/build-blog.sh   (or push to main to trigger CI)"

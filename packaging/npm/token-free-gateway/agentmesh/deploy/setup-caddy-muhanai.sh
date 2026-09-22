#!/bin/bash
set -euo pipefail

# ============================================================
# MuhanAI Caddy Site Block Deployment Script
# Run on 110 server (ssh 110)
# ============================================================

CADDYFILE="/etc/caddy/Caddyfile"
SITE_BLOCK='muhanai.com, www.muhanai.com, find.muhanai.com, travel.kbizhub.com {
	auto_https disable_redirect
	root * /var/www/muhanai.com/current
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}

	@api path /api/*
	handle @api {
		uri strip_prefix /api
		reverse_proxy 127.0.0.1:3001 {
			header_up Host {upstream_hostport}
			header_up X-Real-IP {remote_host}
			header_up X-Forwarded-For {remote_host}
			header_up X-Forwarded-Proto {scheme}
		}
	}

	@asset path_regexp asset "\.(css|js|svg|png|jpg|jpeg|webp|woff2)(\?.*)?$"
	handle @asset {
		file_server
		header Cache-Control "public, immutable, max-age=604800"
	}

	# /dashboard2 — MuhanAI Dashboard v2 (self-contained static page).
	# Must be declared as an exact-path `handle` block so it wins over the SPA
	# catch-all below (Caddy orders `handle` by path-matcher specificity).
	# `/dashboard` is intentionally NOT covered: it stays with the React SPA
	# `<Dashboard>` route. The page is a single file with inline CSS/JS, so no
	# asset routing is needed. Served with X-Frame-Options: DENY inherited from
	# the site header block — this is a top-level navigation, not an iframe embed.
	@dashboard path /dashboard2 /dashboard2/
	handle @dashboard {
		rewrite * /dashboard-v2.html
		file_server
		header Cache-Control "no-cache"
	}

	handle {
		rewrite /index.html
		file_server
	}
}'
BACKUP_DIR="/etc/caddy/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== MuhanAI Caddy Site Block Setup ==="
echo ""

# 1. Backup existing Caddyfile
echo "[1/5] Backing up existing Caddyfile..."
mkdir -p "$BACKUP_DIR"
if [ -f "$CADDYFILE" ]; then
    cp "$CADDYFILE" "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
    echo "       Backup: ${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}"
else
    echo "       No existing Caddyfile found, creating new one."
fi

# 2. Check if muhanai.com block already exists
echo "[2/5] Checking for existing muhanai.com block..."
if grep -q "muhanai.com" "$CADDYFILE" 2>/dev/null; then
    echo "       WARNING: muhanai.com already in Caddyfile. Skipping duplicate."
    echo "       Remove existing muhanai.com block manually and re-run."
    exit 1
fi

# 3. Verify web root exists
echo "[3/5] Verifying web root..."
if [ ! -d "/var/www/muhanai.com/current" ]; then
    echo "       ERROR: /var/www/muhanai.com/current does not exist!"
    echo "       Upload build files first, then re-run."
    exit 1
fi
if [ ! -f "/var/www/muhanai.com/current/index.html" ]; then
    echo "       WARNING: index.html not found in /var/www/muhanai.com/current"
    echo "       Build may not be deployed yet."
fi
echo "       OK: /var/www/muhanai.com/current exists"

# 4. Append site block to Caddyfile
echo "[4/5] Adding muhanai.com site block..."
echo "" >> "$CADDYFILE"
echo "# === MuhanAI site block (added $(date -Iseconds)) ===" >> "$CADDYFILE"
echo "$SITE_BLOCK" >> "$CADDYFILE"
echo "       Site block added."

# 5. Validate and restart Caddy
echo "[5/5] Validating Caddy config..."
if command -v caddy &>/dev/null; then
    caddy validate --config "$CADDYFILE"
    if [ $? -eq 0 ]; then
        echo "       Config valid. Reloading Caddy..."
        if command -v systemctl &>/dev/null && systemctl is-active caddy &>/dev/null; then
            systemctl reload caddy
            echo "       Caddy reloaded (systemctl)."
        elif command -v service &>/dev/null && service caddy status &>/dev/null; then
            service caddy reload
            echo "       Caddy reloaded (service)."
        else
            # Try Caddy's own signal handling
            if [ -f /run/caddy/caddy.pid ]; then
                kill -HUP $(cat /run/caddy/caddy.pid) 2>/dev/null || true
                echo "       Caddy sent SIGHUP."
            else
                echo "       WARNING: Could not auto-reload Caddy. Manual restart required."
            fi
        fi
    else
        echo "       ERROR: Config validation failed! Reverting..."
        cp "${BACKUP_DIR}/Caddyfile.backup.${TIMESTAMP}" "$CADDYFILE"
        echo "       Reverted to backup."
        exit 1
    fi
else
    echo "       WARNING: caddy binary not found. Config written but Caddy not restarted."
    echo "       Manual restart required: sudo systemctl restart caddy"
fi

echo ""
echo "=== Setup Complete ==="
echo "muhanai.com should now serve /var/www/muhanai.com/current"
echo "Verify: curl -I https://muhanai.com"

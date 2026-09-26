#!/usr/bin/env bash
# Build blog.muhanai.com (Hugo) and publish it under an atomic release dir.
#
#   ./deploy/build-blog.sh [--drafts]
#
# Layout on the origin:
#   /var/www/blog.muhanai.com/releases/<timestamp>   immutable build output
#   /var/www/blog.muhanai.com/current -> releases/<timestamp>   (symlink swap)
#
# Caddy serves `current` (see deploy/Caddyfile.muhanai), so the swap is atomic and
# rollback is a single symlink change. blog.muhanai.com is intentionally NOT a
# Cloudflare Worker route — see wrangler.toml.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE_DIR="$REPO_ROOT/blog"
DOC_ROOT="${BLOG_DOC_ROOT:-/var/www/blog.muhanai.com}"
HUGO_BIN="${HUGO_BIN:-hugo}"
DRAFTS=""

if [[ "${1:-}" == "--drafts" ]]; then
	DRAFTS="-D"
fi

if ! command -v "$HUGO_BIN" >/dev/null 2>&1; then
	cat >&2 <<'MSG'
error: hugo not found.

Install Hugo (extended not required — this theme avoids SCSS):

  brew install hugo

Then re-run:  ./deploy/build-blog.sh
MSG
	exit 1
fi

if [[ ! -d "$SITE_DIR/content" ]]; then
	echo "error: blog site not found at $SITE_DIR" >&2
	exit 1
fi

echo "==> building Hugo site"
"$HUGO_BIN" --source "$SITE_DIR" --destination "$SITE_DIR/public" --cleanDestinationDir $DRAFTS

if [[ ! -f "$SITE_DIR/public/index.html" ]]; then
	echo "error: build produced no index.html" >&2
	exit 1
fi

RELEASE="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="$DOC_ROOT/releases/$RELEASE"

echo "==> publishing to $RELEASE_DIR"
mkdir -p "$DOC_ROOT/releases"
cp -R "$SITE_DIR/public/." "$RELEASE_DIR/"

PREVIOUS=""
if [[ -L "$DOC_ROOT/current" ]]; then
	PREVIOUS="$(readlink "$DOC_ROOT/current" || true)"
fi

ln -sfn "$RELEASE_DIR" "$DOC_ROOT/current"

if command -v caddy >/dev/null 2>&1; then
	caddy validate --config "$REPO_ROOT/deploy/Caddyfile.muhanai" >/dev/null 2>&1 ||
		echo "warn: Caddyfile validation failed — not reloading"
	if [[ "${BLOG_SKIP_RELOAD:-0}" != "1" ]]; then
		if systemctl reload caddy 2>/dev/null; then
			echo "==> reloaded caddy"
		else
			echo "warn: could not reload caddy (sudo systemctl reload caddy)"
		fi
	fi
fi

echo "==> live at https://blog.muhanai.com"
if [[ -n "$PREVIOUS" ]]; then
	echo "    rollback: ln -sfn '$PREVIOUS' '$DOC_ROOT/current' && systemctl reload caddy"
fi

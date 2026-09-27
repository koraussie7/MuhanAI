#!/usr/bin/env bash
# Build and publish the web assets used by chat.muhanai.com.
#
# The chat hostname is a Cloudflare Worker route. The Worker renders the
# document shell; this script publishes the Vite assets that the shell loads.
#
#   ./deploy/build-chat.sh
#   CHAT_DEPLOY_WORKER=1 ./deploy/build-chat.sh
#
# Set CHAT_DOC_ROOT to override the origin fallback document root. Set
# CHAT_DEPLOY_WORKER=1 to deploy the Worker route after the asset build.
# Asset publishing alone cannot activate chat.muhanai.com on Cloudflare.
set -euo pipefail
CHAT_DEPLOY_WORKER="${CHAT_DEPLOY_WORKER:-0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/web"
DOC_ROOT="${CHAT_DOC_ROOT:-/var/www/chat.muhanai.com}"

if ! command -v pnpm >/dev/null 2>&1; then
	echo "error: pnpm not found; install pnpm before building the web assets" >&2
	exit 1
fi
if [[ ! -f "$APP_DIR/package.json" ]]; then
	echo "error: web app not found at $APP_DIR" >&2
	exit 1
fi

echo "==> building chat assets"
(cd "$APP_DIR" && pnpm build)

if [[ ! -f "$APP_DIR/dist/assets/chat.js" ]]; then
	echo "error: build did not produce dist/assets/chat.js" >&2
	exit 1
fi
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="$DOC_ROOT/releases/$RELEASE"

echo "==> publishing chat assets to $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
cp -R "$APP_DIR/dist/." "$RELEASE_DIR/"
ln -sfn "$RELEASE_DIR" "$DOC_ROOT/current"

echo "==> chat assets published"
echo "    Origin fallback: $DOC_ROOT/current"

if [[ "$CHAT_DEPLOY_WORKER" == "1" ]]; then
	if ! command -v pnpm >/dev/null 2>&1; then
		echo "error: pnpm is required to deploy the Cloudflare Worker" >&2
		exit 1
	fi
	echo "==> deploying Cloudflare Worker route"
	(cd "$REPO_ROOT" && pnpm exec wrangler deploy)
	echo "    Worker route deployed: chat.muhanai.com/*"
else
	cat <<'MSG'
notice: Worker was not deployed.
The asset build does not activate the Cloudflare route. To deploy it:
  CHAT_DEPLOY_WORKER=1 ./deploy/build-chat.sh
MSG
fi

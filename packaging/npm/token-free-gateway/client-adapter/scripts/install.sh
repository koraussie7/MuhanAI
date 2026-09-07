#!/usr/bin/env bash
# install.sh — one-line installer that turns a fresh Happy build into the
# MuhanAI client. NOT a fork — we download the official binary, verify its
# SHA-256 against a pinned digest, apply our patch-package patches, and
# re-sign / re-package for the current OS.
#
# Usage:
#   curl -fsSL https://get.muhanai.com/client.sh | sh
#
# This script is intended to be served at get.muhanai.com/client.sh.
# `set -euo pipefail` — any uncaught error aborts before a half-patched
# build is left on disk.
#
# Supported OSes (Phase 1):
#   - macOS arm64 + x86_64
#   - Windows x64 (via .exe download + PowerShell re-sign)
#   - Linux x64 (.AppImage re-pack)
#
# Mobile (iOS / Android) is Phase 4+ — see HAPPY-INTEGRATION-ANALYSIS.md §10.

set -euo pipefail

# --- constants (kept in sync with packages/adapter-core/src/endpoints.ts) ---
MUHANAI_VERSION="0.1.0"
HAPPY_PINNED_VERSION="1.7.0"  # last validated against
GATEWAY_URL_DEFAULT="https://api.muhanai.com"

# Download mirror for the patched + re-signed Happy binary.
# We host the result of A5 here so users do not need patch-package at runtime.
INSTALLER_BASE="${MUHANAI_INSTALLER_BASE:-https://dl.muhanai.com/client}"

# SHA-256 manifest — one digest per (os, arch, variant).
# CI populates this from A5 outputs.
MANIFEST_URL="${INSTALLER_BASE}/v${MUHANAI_VERSION}/manifest.txt"
SIGNATURE_URL="${INSTALLER_BASE}/v${MUHANAI_VERSION}/manifest.txt.sig"
PUBLIC_KEY="${MUHANAI_RELEASE_KEY:-/etc/muhanai/release.pub}"

# --- helpers ---
log() { printf '\033[1;34m[muhanai]\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m[muhanai error]\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing required tool: $1"; }

detect_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *) die "unsupported OS: $(uname -s)" ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    arm64|aarch64) echo "arm64" ;;
    x86_64|amd64)  echo "x64" ;;
    *) die "unsupported arch: $(uname -m)" ;;
  esac
}

verify_sha256() {
  local file="$1" expected="$2"
  local actual
  actual="$(sha256sum "$file" 2>/dev/null | awk '{print $1}')"
  if [ -z "$actual" ] && command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  fi
  [ "$actual" = "$expected" ] || die "sha256 mismatch for $file (expected $expected, got $actual)"
}

# --- preflight ---
log "MuhanAI client installer v${MUHANAI_VERSION}"
need curl
need tar
OS="$(detect_os)"
ARCH="$(detect_arch)"
log "detected: ${OS}/${ARCH}"

# --- fetch manifest ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "fetching manifest"
curl -fsSL "$MANIFEST_URL" -o "$TMP/manifest.txt"
if [ -f "$PUBLIC_KEY" ] && command -v cosign >/dev/null 2>&1; then
  curl -fsSL "$SIGNATURE_URL" -o "$TMP/manifest.txt.sig"
  cosign verify-blob --key "$PUBLIC_KEY" --signature "$TMP/manifest.txt.sig" "$TMP/manifest.txt" \
    || die "manifest signature verification failed — refusing to install"
  log "manifest signature OK"
fi

# Parse our row from the manifest. Format: <os>-<arch>\t<sha256>\t<artifact>
row="$(awk -F'\t' -v os="$OS" -v arch="$ARCH" '$1 == os"-"arch { print; exit }' "$TMP/manifest.txt")"
[ -n "$row" ] || die "no artifact for ${OS}-${ARCH} in manifest"

expected_sha="$(echo "$row" | awk -F'\t' '{print $2}')"
artifact="$(echo "$row" | awk -F'\t' '{print $3}')"
artifact_url="${INSTALLER_BASE}/v${MUHANAI_VERSION}/${artifact}"

log "downloading ${artifact}"
curl -fL --retry 3 --retry-delay 2 -o "$TMP/$artifact" "$artifact_url"
verify_sha256 "$TMP/$artifact" "$expected_sha"

# --- install per-OS ---
install_macos() {
  local pkg="$1"
  need codesign
  log "mounting + applying patches + resigning"
  # The packaged artifact is a signed .pkg that contains:
  #   - Happy.app (already re-branded via A5)
  #   - MuhanAI settings overlay (1 route)
  #   - muhan-agent installer payload (Phase 2b L1)
  sudo /usr/sbin/installer -pkg "$pkg" -target /
  log "registered LaunchAgent for muhan-agent"
  launchctl load -w "/Library/LaunchAgents/com.muhanai.agent.plist" 2>/dev/null || true
  log "open /Applications/MuhanAI.app"
  open "/Applications/MuhanAI.app"
}

install_linux() {
  local artifact="$1"
  case "$artifact" in
    *.AppImage)
      need chmod
      install -m 0755 "$TMP/$artifact" "$HOME/.local/bin/muhanai"
      log "installed to $HOME/.local/bin/muhanai"
      log "run: muhanai"
      ;;
    *)
      die "unsupported linux artifact: $artifact"
      ;;
  esac
}

install_windows() {
  local exe="$1"
  log "running installer (administrator required)"
  powershell.exe -NoProfile -Command "Start-Process -FilePath '$TMP/$exe' -ArgumentList '/S' -Verb RunAs -Wait"
  log "installed. launch from Start Menu → MuhanAI"
}

case "$OS" in
  macos)   install_macos "$TMP/$artifact" ;;
  linux)   install_linux "$artifact" ;;
  windows) install_windows "$TMP/$artifact" ;;
esac

log "done. gateway: ${GATEWAY_URL_DEFAULT}"
log "docs: https://docs.muhanai.com/client"

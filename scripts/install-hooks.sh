#!/usr/bin/env bash
# install-hooks.sh — register husky pre-commit for MuhanAI.
# Run once per fresh clone: ./scripts/install-hooks.sh

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$ROOT_DIR" ]]; then
    echo "✗ not in a git repo"; exit 1
fi
cd "$ROOT_DIR"

# 1. ensure scripts/preflight.sh + scripts/agent-pr.sh + .husky/pre-commit are executable
chmod +x scripts/preflight.sh scripts/agent-pr.sh .husky/pre-commit

# 2. run husky if available; otherwise just print the manual step
if command -v pnpm >/dev/null 2>&1; then
    # 2a. add husky as root devDependency (idempotent)
    HAS_HUSKY=$(node -e "
        try {
            const p = require('./package.json');
            const v = (p.devDependencies && p.devDependencies.husky) || '';
            process.stdout.write(v);
        } catch (e) { process.stdout.write(''); }
    " 2>/dev/null || echo "")
    if [[ -z "$HAS_HUSKY" ]]; then
        echo "→ adding husky to root devDependencies"
        pnpm add -w -D husky || true
    fi

    if [[ -f node_modules/.bin/husky ]]; then
        echo "→ running husky init"
        pnpm exec husky init || true
        echo "✓ husky initialised. .husky/pre-commit is active."
    else
        echo "⚠ husky binary not found after install. Check package.json."
    fi
else
    echo "⚠ pnpm not on PATH."
    echo "  Manual step: ensure .husky/pre-commit is executable, then"
    echo "  configure core.hooksPath=".husky" in this repo's git config."
fi

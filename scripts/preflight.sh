#!/usr/bin/env bash
# preflight.sh — gate an agent must pass before any coding work.
# MuhanAI multi-agent coordination. Exit 0 = go. 2..5 = blocked.

set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$ROOT_DIR" ]]; then
    echo -e "${RED}✗ preflight: not inside a git repo. Run from monorepo root.${NC}"
    exit 1
fi
cd "$ROOT_DIR"

echo
echo "═══════════════════════════════════════════════"
echo -e "  ${BLU}MuhanAI Agent Preflight${NC}  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "═══════════════════════════════════════════════"

# ---------- 1. onboarding fingerprint (24h) ----------
LAST_READ="${HOME}/.cache/muhanai/agent-onboarded-at"
if [[ ! -f "$LAST_READ" ]]; then
    echo -e "${RED}✗ STOP: AGENT-ONBOARDING.md has never been read.${NC}"
    echo "  → cat AGENT-ONBOARDING.md"
    echo "  → mkdir -p ~/.cache/muhanai && touch ~/.cache/muhanai/agent-onboarded-at"
    exit 2
fi
NOW=$(date +%s)
MTIME=$(stat -f %m "$LAST_READ" 2>/dev/null || echo 0)
AGE=$(( NOW - MTIME ))
if (( AGE > 86400 )); then
    echo -e "${RED}✗ STOP: AGENT-ONBOARDING.md not read in last 24h (age: ${AGE}s).${NC}"
    echo "  → cat AGENT-ONBOARDING.md"
    echo "  → touch ~/.cache/muhanai/agent-onboarded-at"
    exit 2
fi
echo -e "${GRN}✓${NC} onboarding read ${AGE}s ago"

# ---------- 2. branch policy ----------
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "DETACHED")
if [[ "$BRANCH" == "main" ]] && [[ "${MuhanAI_ALLOW_MAIN:-0}" != "1" ]]; then
    echo -e "${RED}✗ STOP: cannot work directly on main.${NC}"
    echo "  → git checkout -b feat/<role>/<topic>"
    exit 4
fi
echo -e "${GRN}✓${NC} branch: $BRANCH"

# ---------- 3. role + reservation conflict check ----------
ROLE="${AGENT_ROLE:-$(whoami 2>/dev/null || echo unassigned)}"
BOARD="docs/agent/IN-PROGRESS.md"
echo -e "${BLU}  role: $ROLE${NC}"

if [[ -f "$BOARD" ]]; then
    # Detect either a duplicate active reservation OR a "done" line for this role/branch.
    if grep -E "^\- ${ROLE} \|" "$BOARD" | grep -v "done @"; then
        echo -e "${YEL}⚠  Reservation already open for role $ROLE in $BOARD.${NC}"
        echo "  Either finish the previous entry or pick a different role."
    fi
fi

# ---------- 4. OWNED-PATHS ownership hint (advisory only) ----------
OWNED="docs/agent/OWNED-PATHS.md"
if [[ -f "$OWNED" ]]; then
    # Check if we're about to touch files outside the OWNED paths.
    # Bash-only signal: warn if HEAD~N..HEAD history shows files in protected zones.
    PROTECTED_REGEX='(tsconfig|pnpm-workspace|package\.json|^\.github/|^\.husky/|prisma/schema|prisma/migrations)'
    RECENT=$(git diff --name-only HEAD~3 HEAD 2>/dev/null | grep -E "$PROTECTED_REGEX" || true)
    if [[ -n "$RECENT" ]]; then
        echo -e "${YEL}⚠  You recently modified a protected file. Confirm with maintainer before push:${NC}"
        echo "$RECENT" | sed 's/^/    - /'
    fi
fi

# ---------- 5. last main CI status (advisory) ----------
if command -v gh >/dev/null 2>&1; then
    LAST_CI=$(gh run list --branch main --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "unknown")
    case "$LAST_CI" in
        success) echo -e "${GRN}✓${NC} last main CI: success" ;;
        failure) echo -e "${RED}✗  last main CI: failure. Wait for fix before pushing.${NC}" ;;
        *)       echo -e "${YEL}⚠  last main CI: $LAST_CI (in_progress or unknown)${NC}" ;;
    esac
else
    echo -e "${YEL}• gh CLI not found; skipping CI status check.${NC}"
fi

# ---------- 6. exit ----------
echo "═══════════════════════════════════════════════"
echo -e "${GRN}✓ preflight ok. You may proceed on branch $BRANCH as $ROLE.${NC}"
echo "═══════════════════════════════════════════════"
exit 0

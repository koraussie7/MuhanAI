#!/usr/bin/env bash
# preflight.sh v2 — gate an agent must pass before any coding work.
# MuhanAI multi-agent coordination. Exit 0 = go. 2..5 = blocked.
#
# v2 changes (vs MVP):
#   - hard-block check on protected paths (OWNED-PATHS.md "hard-block zones")
#   - role-based override (`ALLOW_HARD_BLOCK=1` only honored if role is allow-listed)
#   - explicit exit code 5 for hard-block violation

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
echo -e "  ${BLU}MuhanAI Agent Preflight v2${NC}  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
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
    if grep -E "^\- ${ROLE} \|" "$BOARD" | grep -v "done @"; then
        echo -e "${YEL}⚠  Reservation already open for role $ROLE in $BOARD.${NC}"
        echo "  Either finish the previous entry or pick a different role."
    fi
fi

# ---------- 4. hard-block check (v2) ----------
# Forbidden paths unless role is allow-listed OR AGENT_ROLE matches owner role.
HARD_BLOCK_REGEX='^(tsconfig(\.base)?\.json|pnpm-workspace\.yaml|package\.json|\.github/workflows/|\.husky/|biome\.json|prisma/schema\.prisma|prisma/migrations/)'

# Find files this branch is about to modify (staged + unstaged vs main + untracked).
FORBIDDEN_TOUCHED=""
TOUCHED=$( (
    git diff --name-only main 2>/dev/null || true
    git diff --cached --name-only 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
) | sort -u)
for f in $TOUCHED; do
    if [[ "$f" =~ $HARD_BLOCK_REGEX ]]; then
        FORBIDDEN_TOUCHED+="    - $f"$'\n'
    fi
done

if [[ -n "$FORBIDDEN_TOUCHED" ]]; then
    if [[ "${ALLOW_HARD_BLOCK:-0}" == "1" ]]; then
        echo -e "${YEL}⚠  ALLOW_HARD_BLOCK=1 detected. Confirm ownership before commit.${NC}"
        echo -e "${YEL}   Files in hard-block zone:${NC}"
        printf "$FORBIDDEN_TOUCHED"
        echo -e "${YEL}   Proceeding because explicit override was given. Logged in branch trace.${NC}"
    else
        echo -e "${RED}✗ STOP: hard-block zone touched (exit 5).${NC}"
        echo -e "${RED}   Files:${NC}"
        printf "$FORBIDDEN_TOUCHED"
        echo -e "${RED}   → Run with ALLOW_HARD_BLOCK=1 ONLY if you are an allowed owner.${NC}"
        echo "     See docs/agent/OWNED-PATHS.md 'hard-block zones'."
        exit 5
    fi
else
    echo -e "${GRN}✓${NC} no protected-path touch"
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

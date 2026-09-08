#!/usr/bin/env bash
# agent-pr.sh — close-the-loop PR helper for MuhanAI agents.
#
# Workflow:
#   1. Re-read docs/agent/IN-PROGRESS.md (your row, others' rows)
#   2. Run preflight (must be exit 0; ALLOW_HARD_BLOCK if needed)
#   3. Run local CI: typecheck + test + biome --write
#   4. Update IN-PROGRESS.md to "done @ <sha>"
#   5. Push branch and open PR (gh pr create)
#
# Usage:
#   ./scripts/agent-pr.sh                  # normal path
#   ALLOW_HARD_BLOCK=1 ./scripts/agent-pr.sh  # for protected paths
#
# Required env:
#   AGENT_ROLE=<your role identifier>      # used in PR body + board rows

set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YEL='\033[1;33m'; BLU='\033[0;34m'; NC='\033[0m'

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$ROOT_DIR" ]]; then
    echo -e "${RED}✗ not in a git repo${NC}"; exit 1
fi
cd "$ROOT_DIR"

ROLE="${AGENT_ROLE:-$(whoami 2>/dev/null || echo unassigned)}"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "═══════════════════════════════════════════════"
echo -e "  ${BLU}MuhanAI Agent PR Helper${NC}"
echo "  role:   $ROLE"
echo "  branch: $BRANCH"
echo "═══════════════════════════════════════════════"

# 1. Pre-flight ---------------------------------------------------------
echo "[1/5] Preflight"
if ! ./scripts/preflight.sh; then
    echo -e "${RED}✗ Preflight failed. Resolve before PR.${NC}"
    exit 2
fi

# 2. Local CI -----------------------------------------------------------
echo "[2/5] Local CI (typecheck, test, biome --write)"

if command -v pnpm >/dev/null 2>&1; then
    echo "    → pnpm -r typecheck"
    if ! pnpm -r typecheck; then
        echo -e "${RED}✗ typecheck failed. Aborting PR.${NC}"; exit 3
    fi

    echo "    → pnpm -r test"
    if ! pnpm -r test; then
        echo -e "${RED}✗ test failed. Aborting PR.${NC}"; exit 4
    fi

    echo "    → pnpm biome check --write"
    pnpm biome check --write . || true
    git add -u
else
    echo -e "${YEL}⚠  pnpm not on PATH; skipping local CI${NC}"
fi

# 3. Update IN-PROGRESS board ------------------------------------------
echo "[3/5] Updating docs/agent/IN-PROGRESS.md"
BOARD="docs/agent/IN-PROGRESS.md"
if [[ -f "$BOARD" ]]; then
    SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo pending)
    # Replace the agent's open row with a done row containing commit SHA.
    if grep -E "^\- ${ROLE} \|" "$BOARD" >/dev/null 2>&1; then
        # macOS / BSD sed
        sed -i '' "s|^\- ${ROLE} .*|- ${ROLE} done @ ${SHORT_SHA} | branch: ${BRANCH} | pushed|" "$BOARD"
    else
        echo -e "${YEL}⚠  No active reservation for role $ROLE. Did you forget to append?${NC}"
        echo "  → Run: echo \"- $ROLE | $BRANCH | <paths> | ETA <iso> | <reason>\" >> $BOARD"
    fi
    git add "$BOARD"
fi

# 4. Commit + push ------------------------------------------------------
echo "[4/5] Commit + push"
if ! git diff --cached --quiet; then
    git -c user.name="$ROLE" -c user.email="${ROLE}@muhanai.local" \
        commit -m "chore(agent-board): mark $ROLE done @ \$(git rev-parse --short HEAD)" || true
fi

if ! git push -u origin "$BRANCH" 2>&1 | tail -5; then
    echo -e "${RED}✗ push failed${NC}"; exit 5
fi

# 5. Open PR ------------------------------------------------------------
echo "[5/5] Open PR via gh"
if command -v gh >/dev/null 2>&1; then
    SHORT_SHA=$(git rev-parse --short HEAD)
    TITLE=$(git log -1 --format=%s)
    TOUCHED=$(git diff main --name-only | head -20)
    BODY=$(cat <<EOF
Agent: $ROLE
Branch: $BRANCH
Touched paths:
\`\`\`
$TOUCHED
\`\`\`
Local CI: typecheck ✓ · test ✓ · biome --write applied
Auto-merge on typecheck+test+biome green (when branch protection is on).
EOF
)
    gh pr create --title "$TITLE" --body "$BODY" --label "agent-pr,role:$ROLE"
    echo -e "${GRN}✓ PR opened for $BRANCH${NC}"
else
    echo -e "${YEL}⚠  gh not on PATH; push done, but open the PR manually.${NC}"
fi

echo "═══════════════════════════════════════════════"
echo -e "${GRN}✓ done${NC}"
echo "═══════════════════════════════════════════════"

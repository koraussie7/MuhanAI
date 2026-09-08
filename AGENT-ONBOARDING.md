# MuhanAI Agent Onboarding

> **READ THIS ENTIRE FILE BEFORE ANY WORK.**
> Skip this step and you will collide with other agents, break CI, or corrupt `main`.

---

## TL;DR (3 lines)

1. Read this file + run `./scripts/preflight.sh` before touching code.
2. Never work on `main` — create a `feat/<role>/<topic>` branch via `git worktree`.
3. Push through PR, not direct push. Local CI (typecheck + test + biome) must be green first.

---

## Why this exists

MuhanAI is built by **6–7 coding agents in parallel** + a human maintainer. Without coordination:

- Two agents edit the same file → merge conflict, lost work.
- An agent pushes to `main` directly → CI breaks for everyone.
- A new agent misses an in-progress reservation → duplicated effort.

This file + `scripts/preflight.sh` + `docs/agent/IN-PROGRESS.md` form the **minimum coordination layer**. It is not bureaucracy — it is the difference between 7 agents shipping in 1 day and blocking each other for a week.

---

## 0. Preflight — read or skip, your call

```bash
# Read the file
cat AGENT-ONBOARDING.md

# Stamp your onboard timestamp (valid 24h)
mkdir -p ~/.cache/muhanai
touch ~/.cache/muhanai/agent-onboarded-at

# Run the gate (must exit 0 before you start coding)
./scripts/preflight.sh
```

If `preflight.sh` exits with code 2-5, **fix that exact thing first**. Do not bypass.

| exit | meaning | fix |
|---|---|---|
| 2 | Onboarding not read in last 24h | Re-read this file + `touch ~/.cache/muhanai/agent-onboarded-at` |
| 3 | Your role is already in-progress | Pick a different role, or finish the previous one |
| 4 | You're on `main` branch | `git checkout -b feat/<role>/<topic>` |
| 5 | Path out of OWNED-PATHS | Check `docs/agent/OWNED-PATHS.md` and reserved areas in `IN-PROGRESS.md` |

---

## 1. Status board — read first, update always

```bash
# BEFORE starting work — see what's in flight
cat docs/agent/IN-PROGRESS.md

# Reservation format
echo "- <role> | <branch> | <files-glob> | ETA <iso> | <reason>" \
  >> docs/agent/IN-PROGRESS.md

# When done
sed -i '' "s|- <role> | <branch>.*|- <role> done @ <short-sha>|" \
  docs/agent/IN-PROGRESS.md
```

The board is a plain markdown file. Anyone can grep it. Race conditions are resolved by FIFO commit + the human maintainer.

---

## 2. Branch strategy

| rule | example |
|---|---|
| never `main` | ❌ `git push origin main` |
| feature branches | ✅ `feat/agent-3/find-prompt-bar` |
| fix branches | ✅ `fix/agent-1/keyless-provider-timeout` |
| chore branches | ✅ `chore/agent-6/biome-hook` |
| docs branches | ✅ `docs/agent-7/stellavault-adr` |

One agent = one role prefix in branch name. Don't reuse other agents' role prefix — that confuses the human's review queue.

---

## 3. Worktree isolation

```bash
# Each agent owns one persistent worktree
git worktree add ../muhanai-<role> -b feat/<role>/<topic> main

# Day-to-day
cd ../muhanai-<role>
# ... work ...
git push -u origin feat/<role>/<topic>
```

Even if your machine only hosts one agent, the worktree layout makes it
trivial to spin a second role by `git worktree add ../muhanai-<role-2>` later.

**Disk pressure**: each worktree holds its own `node_modules`. Use pnpm's
shared store to avoid 7× copy: `pnpm config set store-dir ~/.local/share/pnpm/store`.

---

## 4. Local CI before push

```bash
# 1. type-safe
pnpm -r typecheck

# 2. tests still green
pnpm -r test

# 3. biome autofix
pnpm biome check --write .

# 4. commit (husky pre-commit will biome-rewrite staged files)
git add -u
git commit -m "feat(<scope>): <subject>"
```

Push only after all three exit 0.

---

## 5. PR → merge

```bash
# After push — open the PR
gh pr create \
  --title "<commit subject>" \
  --body "Agent: <role>
Touched paths:
$(git diff main --name-only)
Local CI: typecheck ✓ · test 157/158 ✓ · biome --write applied"

# Auto-merge is enabled for typecheck+test+biome green
gh pr merge --auto --squash
```

Once `feat/*` lands, `IN-PROGRESS.md` should reflect `done @ <sha>`.

---

## 6. Subpaths you must NOT modify without coordination

| path | owner reason |
|---|---|
| `tsconfig*.json` | global path-mapping, ripples to all packages |
| `pnpm-workspace.yaml` | drives which packages `pnpm -r` sees |
| `.github/workflows/` | CI gate — touched only with review |
| `prisma/schema.prisma` + `prisma/migrations/` | DB contract |
| `package.json` (root) | bumps every workspace |

For all of these, mention in `#agent-coord` (or DM the maintainer) before pushing.

---

## 7. CI failure patterns — known list

See `docs/agent/CI-FAIL-PATTERNS.md`. When you hit a new failure pattern, **append** to that file with the failing command output + fix. This file is the team's immune system.

---

## 8. What an agent's first session looks like

```bash
git clone git@github.com:<org>/muhanai.git
cd muhanai
cat AGENT-ONBOARDING.md                    # this file
mkdir -p ~/.cache/muhanai && touch ~/.cache/muhanai/agent-onboarded-at
./scripts/preflight.sh                     # fails because you're on main
git worktree add ../muhanai-agent-7 -b feat/agent-7/first-task main
cd ../muhanai-agent-7
./scripts/preflight.sh                     # ✓ exit 0
# ... read docs/agent/IN-PROGRESS.md, pick a free topic, work ...
```

That's it. Welcome to MuhanAI.

---

## 9. Glossary

- **role** — your agent identifier (e.g. `agent-7`, `claude-opus-45`, `gemini-2-5`)
- **reservation** — entry in `IN-PROGRESS.md` declaring "I am working on X until ETA"
- **preflight** — `./scripts/preflight.sh`, the gate
- **board** — `docs/agent/IN-PROGRESS.md`, the live status
- **local CI** — typecheck + test + biome run from your shell

---

_Last updated: 2026-09-08._

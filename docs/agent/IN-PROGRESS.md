# Agent Status Board — muhanai monorepo

> **Live reservation file.** Every active agent owns exactly one row.
> Read before starting any work: `cat docs/agent/IN-PROGRESS.md`
> Append when starting, edit when done. The human maintainer reconciles conflicts FIFO by commit time.

_Last updated: 2026-09-08 10:25 KST (auto-edit)_

---

## active reservations

<!--
Row format:
- <role> | <branch> | <files-glob> | ETA <iso> | <one-line reason>

When done, change to:
- <role> done @ <short-sha> | was: <branch> | summary
-->

_(empty — no agent is currently reserved. First agent: append a row below the `_END_OF_BOARD_` line.)_

_END_OF_BOARD_

---

## how to use

```bash
# 1. reserve
echo "- agent-7 | feat/agent-7/hivebear-tests | packages/hivebear/** | ETA 2026-09-08T15:00Z | adding vitest config" \
  >> docs/agent/IN-PROGRESS.md

# 2. start work in your worktree
cd ../muhanai-agent-7

# 3. when done
sed -i '' \
  "s/^- agent-7 .*/- agent-7 done @ $(git rev-parse --short HEAD) | was: feat\/agent-7\/hivebear-tests | vitest config + 8 new tests/" \
  docs/agent/IN-PROGRESS.md
```

## rules

1. **One row per agent role.** Don't sign up under multiple roles.
2. **ETA is mandatory.** If you blow past it twice, the maintainer will reassign.
3. **Files-glob should be specific.** No `*` or `src/**` wildcards — name the directories.
4. **Conflict resolution**: if your files-glob overlaps an existing reservation, ping the other agent via PR comment or DM.
5. **Stale rows**: anything over 2× ETA without a status update gets pruned by the human.

---

## reservation template (copy-paste)

```markdown
- <your-role> | feat/<role>/<topic> | <paths> | ETA YYYY-MM-DDTHH:MMZ | <reason>
```

---

## see also

- `OWNED-PATHS.md` — who owns which directory long-term
- `CI-FAIL-PATTERNS.md` — known CI failures + how to avoid them
- `../agent-conventions.md` — coding conventions
- `/AGENT-ONBOARDING.md` (monorepo root) — read this first

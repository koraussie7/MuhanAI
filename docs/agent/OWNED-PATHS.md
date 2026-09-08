# Owned Paths — area ownership matrix

> Tells an agent **who to ping** when they want to touch a directory.
> Not enforced by preflight (advisory) — but conflicts here cause the most rebase pain.

_Last updated: 2026-09-08_

---

## current ownership

| area | primary | reviewers | concurrency |
|---|---|---|---|
| `apps/web/src/components/find/` | agent-3 | agent-1, agent-7 | ✅ additive only |
| `apps/web/src/components/chat/` | unassigned | agent-3 | ❌ single |
| `apps/web/src/components/hud/` | agent-5 | agent-3 | ❌ single |
| `apps/web/src/components/vault/` | agent-3 | agent-1 | ❌ single |
| `apps/web/src/i18n.ts` | unassigned | — | ⚠ shared (small, see below) |
| `apps/web/src/styles/cosmic-prompt.css` | agent-3 | agent-5 | ❌ single (atomic commits) |
| `packages/llm-router/` | agent-1 | agent-7 | ❌ single |
| `packages/llm-router/src/keyless-providers.ts` | agent-1 | agent-7 | ❌ single (hot file) |
| `packages/knowledge-base/` | unassigned | agent-7 | ❌ single |
| `packages/federation-transport/` | agent-2 | — | ❌ single |
| `packages/hivebear/` | unassigned | agent-1 | ❌ single |
| `packages/agent-*` (cast, core, mesh, router) | unassigned | — | ❌ single |
| `packages/personal-mcp/` | agent-7 | — | ❌ single |
| `packages/semantic-vote/`, `packages/credits/`, `packages/p2p/` | agent-4 | agent-7 | ❌ single |
| `packages/gateway/`, `packages/compute/` | agent-1 | agent-7 | ❌ single |
| `packages/muhan-agent/`, `packages/noema/`, `packages/db/` | unassigned | — | ❌ single |
| `packages/category-engine/` | unassigned | — | ❌ single |
| `services/api/` | agent-4 | agent-6 | ❌ single |
| `services/api/prisma/schema.prisma` | agent-4 | — | ❌ single, REVIEW REQUIRED |
| `prisma/migrations/` | agent-4 | — | ❌ single, REVIEW REQUIRED |
| `docs/` | any | — | ✅ all (doc-only PRs auto-merge) |
| `docs/agent/` | any | — | ⚠ board updates only — append/edit |
| `docs/agent/IN-PROGRESS.md` | whoever | — | ⚠ race: see FIFO note |
| `tsconfig*.json`, `tsconfig.base.json` | maintainer only | — | ❌ single |
| `pnpm-workspace.yaml` | maintainer only | — | ❌ single |
| `package.json` (root) | maintainer only | — | ❌ single |
| `.github/workflows/` | agent-6 | maintainer | ❌ single, REVIEW REQUIRED |
| `.husky/` | agent-6 | maintainer | ❌ single |
| `biome.json` | agent-6 | — | ❌ single |

(`unassigned` means open — first agent who needs it, claim it by appending to `IN-PROGRESS.md`.)

---

## hard-block zones (require explicit override)

These paths are **outright forbidden** for ordinary agents. Touching them blocks preflight (exit 5)
unless the agent first runs:

```bash
ALLOW_HARD_BLOCK=1 ./scripts/preflight.sh
```

| path | why blocked | who can override | override requirement |
|---|---|---|---|
| `tsconfig*.json`, `tsconfig.base.json` | path-mapping ripples to all packages | maintainer | open PR with reviewer tag |
| `pnpm-workspace.yaml` | workspace scope change | maintainer | same as above |
| `package.json` (root) | bumps every workspace | maintainer | same as above |
| `.github/workflows/` | CI gate, breaks everyone if malformed | agent-6 or maintainer | PR + manual CI run before merge |
| `prisma/schema.prisma` | DB contract | agent-4 or maintainer | REVIEW REQUIRED (dual) |
| `prisma/migrations/` | irreversible schema change | agent-4 or maintainer | REVIEW REQUIRED + manual `prisma migrate deploy` run |
| `biome.json` | changes rule set for all 344 files | agent-6 or maintainer | PR + biome check before merge |
| `.husky/` | hook config: lives or dies the pre-commit pipeline | agent-6 or maintainer | PR + manual run of every hook |

### why these are hard, not advisory

These files define **contracts** across the whole workspace. A change here can:

- silently break typecheck across 22 packages
- alter the CI gate rule shape without review
- commit a one-way schema migration to production

`preflight.sh` exit 5 will block any commit that touches these paths
**unless** the agent is allowed (by role + branch name + override env) to modify them.

Override chain detection (preflight will check):
1. `AGENT_ROLE` env var matches one of the allow-listed roles above.
2. Branch name starts with `feat/agent-<number>/...` where agent-N is allow-listed.
3. `ALLOW_HARD_BLOCK=1` is set explicitly.

If any check fails → exit 5.

---

## shared hotspots (high contention)

These files are touched by multiple features; coordinate before commits:

| file | why contended |
|---|---|
| `apps/web/src/i18n.ts` | every new UI string adds a key in 9 languages |
| `packages/llm-router/src/keyless-providers.ts` | every new free LLM provider lands here |
| `apps/web/src/components/find/FindPage.tsx` | all find-* UI passes through it |

**Coordination rule:** open a draft PR first; let the auto-merge run; close PR without merge if you decide not to ship. This signals your intent.

---

## concurrency levels

| symbol | meaning |
|---|---|
| ✅ additive only | multiple agents OK iff each one only adds, never edits another's lines |
| ❌ single | one agent at a time, must claim in `IN-PROGRESS.md` |
| ⚠ shared / race | small file, FIFO by commit timestamp, mention others in PR |
| ❌ REVIEW REQUIRED | dual approval (1 agent + maintainer) before merge |

---

## how to update this file

When you take over an `unassigned` area, edit the table:

```diff
- | `packages/hivebear/` | unassigned | agent-1 | ❌ single |
+ | `packages/hivebear/` | agent-7 | agent-1 | ❌ single |
```

When you ship a major area, propose extending ownership to a sub-team by opening a PR that updates this file.

---

## see also

- `IN-PROGRESS.md` — live reservations
- `CI-FAIL-PATTERNS.md` — known CI failures
- `/AGENT-ONBOARDING.md` — onboarding for new agents

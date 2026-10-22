
## §26 — PR #15: token-bank + tasks full Minima integration (2026-10-20)

**Status:** Open at https://github.com/koraussie7/MuhanAI/pull/15
**Branch:** `feat/token-bank-minima` → `main` on koraussie7/muhanai (note: repo moved to koraussie7/MuhanAI)
**Commit:** `ad259f7` — "feat(token-bank, tasks): ship full Minima integration to packaging tree"

### Files (6 changed, +1004 / -100)
- `packaging/.../components/TokenBankPage.tsx` (new, 501 lines)
- `packaging/.../components/TasksPage.tsx` (new, 416 lines)
- `packaging/.../store/escrowStore.ts` (new, 69 lines)
- `packaging/.../types/escrow.ts` (new, 15 lines)
- `packaging/.../components/DashPages.tsx` — inline TokenBankPage stub → re-export (line 387)
- `packaging/.../components/SpecPages.tsx` — inline TasksPage stub → re-export (line 273)

### Why PR not direct push
- Repo (`koraussie7/muhanai`) is the **live production tree**; direct push to main is too risky without CI/preview.
- No CI runs on this repo (no `.github/workflows/` files verified), so merging is a manual step.
- No `node_modules` in the packaging tree → no local build/test possible.

### Next agent's next step
```bash
gh pr view 15 --repo koraussie7/muhanai                # check CI / comments
gh pr merge 15 --repo koraussie7/muhanai --squash      # if everything looks clean
# OR push a follow-up to the same branch:
cd /Users/brianyeon/CodeGPT/integration-finalize
git push origin feat/token-bank-minima  # any new commit triggers PR update
```

### Live deploy after merge
Once merged, the operator's CI (or manual) must build the packaging tree and deploy to the live origin (185.55.240.110). Until then, `muhanai.com/token-bank` and `muhanai.com/tasks` will continue to render the old 5-line stubs.

---

## §27 — PR #17 merged + live deploy IN PROGRESS (2026-10-22 late)

**PR #17 is MERGED** to `main` (squash `1d74f0e`) — tasks 2–7 full series.
Branch history: eb85d2a → a8af9d0 → 06fb4ee → 8b6c848 → 554014e → 5e9a2de → 8e90519 → 85f3c94.
Gates green before merge: cosmos tsc clean + vitest 22/22; services/api vitest 161/1 skip; web tsc 0.

### Repo quirk (critical)
Working tree = `.git/checkout/` (core.worktree). Stage via `GIT_WORK_TREE=$(pwd)/.git/checkout git …`; resync with `git archive HEAD | tar -x -C .git/checkout`. NEVER `git add` whole directories there.

### Live deploy — 185.55.240.110 (ssh alias `110`, host p2p) — WHERE I LEFT OFF
Stack: nginx `muhanai.com.conf` → static `/var/www/muhanai.com` + `/api` proxy → `127.0.0.1:3001`; pm2 `muhanai-agentmesh-api` runs `node dist/server.bundle.js` from `/opt/agentmesh/services/api`, env `/opt/agentmesh/.env` (single `API_KEY=`).

Done:
1. Packed changed sources → `110:/tmp/agentmesh-new/` (scp from local packaging tree).
2. Synced into `/opt/agentmesh`: services/api/src (ontograph-routes*, world-routes, pythia-routes, server.ts + ghost/elizaos tests), packages (cosmos-core, minima-client, muhanai-ontology, ghost-adapter), apps/web (WorldPage/WorldGlobe/OntologyGraphPanel, lib/*.ts, hooks/useMinima, menu-i18n, i18n).
3. Fixed server-side package.json: removed `@agentmesh/ai-engine` (doesn't exist on server), re-added `@agentmesh/minima-client` (workspace, TS sources exported directly; server needed its package.json re-uploaded). Created `packages/muhanai-ontology/package.json` (`@muhanai/ontology`) + tsconfig.
4. Backup: `110:/tmp/server.bundle.backup.js` (old bundle). pnpm install on server has issues resolving the new workspaces — may need lockfile refresh or `--no-frozen-lockfile` rerun.

**BLOCKER I hit:** every curl to `127.0.0.1:3001/api/*` with `x-api-key: $(grep ^API_KEY /opt/agentmesh/.env | cut -d= -f2)` returns 401 — including `/api/pythia/providers` which existed before. Suspects: (a) `.env` value quoting/CR, (b) pm2 must be restarted after env changes, (c) auth middleware reads a different env name (check `services/api/src/server.ts`).

Next steps, in order:
1. Read auth middleware in `server.ts` → confirm env name → fix `.env` / restart pm2.
2. Verify old endpoints with the curl loop (`cosmos/concepts`, `pythia/providers`).
3. **Rebuild API bundle** (old bundle lacks `/api/ontograph/*`): use repo's existing build script for `server.bundle.js`, then `pm2 restart muhanai-agentmesh-api`. New endpoints to verify: `GET /api/ontograph/snapshot`, `/api/ontograph/health`, `POST /api/pythia/explain-graph`.
4. **Web build**: old JS still in `/var/www/muhanai.com`. Build web on server (needs node_modules for the new deps) → copy dist → verify `/world` renders 2-column globe + OntologyGraphPanel; GEV STREAM badge when `SHADOWBROKER_URL` set.
5. Optional env additions to `/opt/agentmesh/.env`: `SHADOWBROKER_URL`, `SHADOWBROKER_LAYERS` (comma list), `SHADOWBROKER_TOKEN` — enables GEV live merge + 30s polling.

Uploads/temps to clean up later: `110:/tmp/agentmesh-src.tar.gz`, `/tmp/agentmesh-new/`, `/tmp/server.bundle.backup.js`.


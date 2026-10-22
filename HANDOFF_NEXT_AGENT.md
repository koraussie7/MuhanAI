# HANDOFF NEXT AGENT

## §29 — PR #17 merged (tasks 2–7 complete), live deployment BLOCKED — handoff (2026-10-22)

**Status:** PR #17 MERGED to `main` on koureux... → repo is `koureux...`

**Actual repo:** verified via `gh pr view 17 --json headRepository` — run this if the name below is unclear.

---

## 1. What was done this session (all merged into PR #17 → main, squash commit `1d74f0e`)

| Commit | Task | Summary |
|---|---|---|
| `eb85d2a` | 2 | `OntologyGraphPanel.tsx` + `ontograph-integration.ts` — /world 2-column sidebar (entity list, type filters, relations viewer, globe focus handoff) |
| `a8af9d0` | 3 | `GET /api/ontograph/snapshot` + `/health` routes (cosmos projection read model, offline fixture fallback) |
| `06fb4ee` | 4 | Geo metadata pipeline — world feed locations → concept `metadata.geo` (lat/lng) |
| `8b6c848` | 5 | `POST /api/pythia/explain-graph` + sidebar "Explain" button (keyless mesh, 0 MHT) |
| `554014e` | 6 | World brief "Pythia 요약" button + `pythia-integration.ts` + i18n world keys restored (10 langs) |
| `5e9a2de` | — | test fix: noUncheckedIndexedAccess guards in geo-ingest test |
| `8e90519` | infra | Restored missing workspace sources: `minima-client`, `muhanai-ontology`, `ghost-adapter`, `useMinima`, `menu-i18n` vi/hi, `WorldGlobe` focusEntity, ghost tests |
| `85f3c94` | 7 | GEV live stream — 30s polling while ShadowBroker/merged brief is live, GEV STREAM badge, ShadowBroker env config test |

**All local gates passed before merge:**
- cosmos-core tsc: 0 errors / vitest: 22/22
- services/api vitest: 161 passed / 1 skipped
- apps/web tsc: 0 errors

## 2. Deployment status on live server (185.55.240.110, ssh alias `110`)

**What IS done on the server:**
- Source sync complete: new source files copied to `/opt/agentmesh` (services/api/src, packages/cosmos-core, minima-client, muhanai-ontology, ghost-adapter, apps/web components + lib + i18n + hooks, pnpm-workspace.yaml, pnpm-lock.yaml)
- `pnpm install` succeeded (had to strip unresolvable `@agentmesh/ai-engine`, `@agentmesh/knowledge`, `@agentmesh/ontology` workspace deps from `services/api/package.json` — backup at `/tmp/api-package.json.bak-*`; also re-added `@agentmesh/minima-client` which was removed by mistake)
- `packages/cosmos-core` tsc: 0 errors
- `services/api` tsc: 0 errors in new files (`ontograph-routes`, `pythia-routes`, `world-routes`, `server.ts`); only pre-existing legacy errors remain (ghost-dispatch `createTaskLedger` import mismatch — pre-existing, not ours)

**What is NOT done (blockers):**

### BLOCKER 1: API rebuild + restart
- Running bundle `/opt/agentmesh/services/api/dist/server.bundle.js` is from Oct 19 — `grep -c ontograph` = 0
- `curl http://127.0.0.1:3001/api/ontograph/health` → 404
- Process: PID 2325227 (`pm2` name `muhanai-agentmesh-api`), backup of old bundle at `/tmp/server.bundle.backup.js`
- Next step: rebuild the bundle (try `npx esbuild src/server.ts --bundle --platform=node --outfile=dist/server.bundle.js` or find how the Oct 19 bundle was built), then kill 2325227 + restart via pm2

### BLOCKER 2: API auth — `X-API-Key` required
- All `curl` tests to `:3001/api/ontograph/health` return 401 without the key
- The key is in the running process env: `cat /proc/2325227/environ | tr '\0' '\n' | grep ^API_KEY=`
- Without this key you cannot verify the new endpoints work even after rebuild

### BLOCKER 3: Web rebuild
- Deployed asset `WorldPage-ktlH9Xu0.js` (Oct 19) — `grep -c "OntologyGraphPanel|ontology-graph-panel"` = 0
- Web is served from Docker container `charon` (nginx), static root `/var/www/muhan.com` — NOT from `/opt/agentmesh-muhanai/dist-danang` directly
- Next step: find the Vite build command for `apps/web`, build, and copy assets into the container/volume nginx serves

## 3. How to verify after unblocking

```bash
# API (need the key from BLOCKER 2)
curl -H "X-API-Key: $KEY" http://127.0.0.1:3001/api/ontograph/health
curl -H "X-API-Key: $KEY" http://127.0.0.1:3001/api/gev/status
curl -H "X-API-Key: $KEY" http://127.0.0.1:3001/api/world/brief   # expect 200

# Web
curl -s https://muhan.com/world | head    # expect HTML shell
curl -s https://muhan.com/assets/WorldPage-*.js | grep -c "ontology-graph-panel"   # expect > 0
```

## 4. Gotchas for the next agent

- `/opt/agentmesh` is NOT a git repo (no `.git`) — treat file copies as the only source of truth there
- `pnpm-workspace.yaml` and `pnpm-lock.yaml` on the server were overwritten from local — if you re-run `pnpm install --frozen-lockfile` it will fail; use `--no-frozen-lockfile`
- `/opt/agentmesh/packages/core` may be missing — check before building
- Repo has an unusual git setup: worktree is `.git/checkout/` (core.worktree trick). To inspect working tree: `GIT_WORK_TREE=.git/checkout git status`. To rebuild it from HEAD: `git archive HEAD | tar -x -C .git/checkout`
- macOS: `date -d` is GNU-only; use `gdate` or arithmetic
- PR #17 was merged with `--squash`; the branch `feat/claude/thin-client-phase0-2026-10-01` still exists locally and on remote

## 5. Suggested order of operations for the next agent

1. Get the API key (BLOCKER 2) → verify you can hit `:3001` with 200
2. Rebuild API bundle (BLOCKER 1) → restart pm2 → re-verify endpoints return 200 with real data
3. Rebuild web (BLOCKER 3) → deploy to nginx → verify `https://muhan.com/world` renders globe + sidebar + GEV badge
4. Update this file with §30 once deployment is confirmed working

# HANDOFF NEXT AGENT

## §30 — ShadowBroker + correlation shipped & LIVE; §29 deployment blockers all cleared (2026-10-23)

**Status:** ✅ **DEPLOYED AND VERIFIED IN PRODUCTION.** PR #19 open against `main`.

```
worktree   /Users/brianyeon/CodeGPT/integration-finalize   (real tree: .git/checkout)
branch     feat/shadowbroker-geo-correlation  @ 445ded4 + web commit
base       main @ 1d74f0e  (PR #17 squash)
PR         https://github.com/koraussie7/MuhanAI/pull/19  (18 files, +1689/−208, MERGEABLE)
```

### 30.1 ⚠️ READ FIRST — §29 was wrong about the domain

§29 spent a whole section chasing `muhan.com`. **The production site is `muhanai.com`.**
They are two unrelated properties:

| | `muhan.com` | `muhanai.com` ← the real one |
|---|---|---|
| IP / server | `15.204.14.220`, **Microsoft-IIS/10.0** | `185.55.240.110` (ssh alias `110`) via Cloudflare |
| App | legacy CRA (`/static/js/main.*.js`) | **Vite `apps/web`** (`/assets/index-*.js`) |
| Web root | not on our servers | **`/var/www/muhanai.com`** |
| Relevance | none — abandoned | this is what users see |

Do not touch `muhan.com`. It is a separate IIS site we do not deploy.

### 30.2 The actual serving path (use this, not §29's "charon/nginx")

```
/opt/agentmesh/apps/web ──vite build──▶ dist/
                                         │ cp assets/* + index.html
                                         ▼
                            /var/www/muhanai.com/
                                         │
                       nginx :8080  (NOT :80/:443, NOT inside charon)
                                         │  /api/* → 127.0.0.1:3001  (injects x-api-key)
                                         ▼
                                Cloudflare ▸ muhanai.com
```

- Active config: **`/etc/nginx/sites-enabled/muhanai.com.conf`** (root `/var/www/muhanai.com`, `listen 8080`)
- **`charon` is a different product (Pangolin)**. It serves `/app/frontend/dist` and has nothing to do with muhanai. §29's "copy assets into the charon container" would have been a no-op.
- `/root/.cloudflared/config.yml` only routes `short.missav.site`; the muhanai origin is configured in the Cloudflare dashboard, not on disk.
- nginx injects `x-api-key` server-side for `/api/*`, so the browser never sees the key.

### 30.3 Corrections to §29's blocker list

| §29 claim | Reality (§30) |
|---|---|
| API `curl` → **404** | **401** without a key; **200** with one. Auth was never broken. |
| "`DISABLE_AUTH` is not set in prod" | It **is** set (`DISABLE_AUTH=true`) — the server logs `DISABLE_AUTH=true is set in production but will be ignored. Auth is mandatory in production.` |
| Process is `pm2` name `muhanai-agentmesh-api`, PID 2325227 | It had **fallen out of pm2** and was an orphan pm2-run process. Registered fresh (§30.5). |
| Bundle is from **Oct 19** | It was **Oct 22 17:43** — stale, but not by a week. |
| Web served by `charon`/nginx at `/var/www/muhan.com` | Wrong on both counts — see 30.1/30.2. |
| Verify `GET /api/gev/status` | **That route does not exist.** The GEV STREAM badge is driven by the world brief's `source` field (`WorldPage.tsx`), not a status endpoint. `/api/world/health` is the real status route. |
| `curl …/assets/WorldPage-*.js \| grep ontology-graph-panel` | Correct idea, but the path is `https://muhanai.com/assets/…`, not `muhan.com`, and the current hash is `WorldPage-OkOfGb93.js`. |

### 30.4 What shipped

**API / cosmos-core**
- `shadowbroker.ts` — geospatial OSINT layer registry + total normalizers (ADS-B, AIS, satellites, GPS jamming, quakes, wildfire), 19 tests, zero I/O
- `correlation.ts` — observation × forecast correlation (haversine + temporal window + domain overlap); emits `RelationProposed` only, so the projection keeps convergence scoring
- `pythia.ts` — concept validation against `@muhanai/ontology` without importing services
- `ingest.ts` — **removed `GEO_KNOWN_LOCATIONS`** (22-city table silently dropped coords for everything else); upstream `geo` is now the source of truth. Predictions record `subjectDomains` so correlation can match by domain.
- `world-routes.ts` — ShadowBroker merge (`source: "merged"`), `GET /api/world/correlations`, per-source log ingestion (best-effort, never fails the panel)

**Bug fixed** (`012b61c`): ingestion wrote `metadata.geo = { lat, lng }` while `ontograph-routes.ts` still read flat `metadata.latitude/longitude` → live concepts lost globe placement even with valid coordinates. `toEntities()` now accepts both shapes and is unit-tested.

**Web** (`445ded4`): the world panel now links "엔진 미연결 · 설정" → `/dashboard` when `live === false`, with the env var names in the tooltip, in all 10 locales.

### 30.5 Rebuilding the API (the recipe that actually works)

`esbuild` is not a dependency — use the binary already in the pnpm store:

```bash
/opt/agentmesh/node_modules/.pnpm/@esbuild+linux-x64@0.25.12/node_modules/@esbuild/linux-x64/bin/esbuild \
  src/server.ts --bundle --platform=node --format=esm --target=node20 \
  --outfile=dist/server.bundle.js --banner:js='<see build.sh>' \
  --external:fastify --external:zod --external:pino --external:pg --external:dotenv \
  --external:better-sqlite3 --external:undici --external:nodemailer --external:ioredis \
  --external:@fastify/cors ... --external:.prisma/client --external:argon2
```

Working copy: **`/root/agentmesh-api-restart/build.sh`** — read it before hand-rolling the flags.

Six things that will bite you:

1. **Workspace packages must be bundled, not externalized** (they ship `.ts`, not `.js`): omit `--packages=external`, list only real node_modules package names as external.
2. **`@muhanai/ontology` is not linked** for `services/api` or `packages/cosmos-core`. Symlink it into both (`ln -sfn /opt/agentmesh/packages/muhanai-ontology <dir>/node_modules/@muhanai/ontology`). Use absolute targets — the relative path is easy to get one `..` wrong, and a broken symlink surfaces as "Could not resolve".
3. **ESM needs the banner shim** for `require`, `__dirname`, `__filename`. Without `__dirname` the GUN timer crashes the process ≈1 s after it reports "API server listening".
4. **`ws` and `@prisma/client` must be inlined** — externalizing them gives `Cannot find package 'ws'` and `does not provide an export named 'Prisma'`. `.prisma/client` (the generated dir) must stay external.
5. **`argon2` is native — keep it external.** Bundling it produces `Cannot determine intended module format because both '__dirname' and top-level await are present`.
6. **`upnp-mediaserver` requires `../../package.json`** relative to `dist/`. Create `/opt/agentmesh/services/package.json` (`{"name":"@agentmesh/api","version":"0.1.0"}`) or the process dies on `Cannot find module '../../package.json'`.

### 30.6 Rebuilding the web

```bash
cd /opt/agentmesh/apps/web
node_modules/.bin/vite build            # ≈20 s
cp -r dist/assets/* /var/www/muhanai.com/assets/
cp dist/index.html  /var/www/muhanai.com/index.html
```

- **Back up first:** `cp -a /var/www/muhanai.com /var/www/muhanai.com.bak-$(date +%Y%m%d-%H%M%S)` (a good one exists at `…bak-20261023-113908`).
- The server's `apps/web/src` **drifts**. Before building, sync `src/` from the worktree — at sync time it had only 5 components vs 58 locally, and `App.tsx` had no `WorldPage` reference at all, so the first build produced a bundle with 0 hits for `ontology-graph-panel`.
- **Workspace deps must be symlinked** into `apps/web/node_modules/@agentmesh/`: `ai-engine`, `knowledge-base`, `peer-mesh`, `personal-mcp` (plus `minima-client`, `shared-types` which were already there). Missing links fail the build with `Rollup failed to resolve import`.
- Always `grep` the built chunk before deploying:
  ```bash
  grep -c 'ontology-graph-panel' dist/assets/WorldPage-*.js   # expect ≥1
  grep -c 'GEV STREAM'           dist/assets/WorldPage-*.js   # expect 1
  grep -c 'world-engine-setup-link' dist/assets/WorldPage-*.js # expect 1
  ```

### 30.7 pm2 registration (the `--interpreter bash` trap)

```bash
pm2 start /root/agentmesh-api-restart/ecosystem.config.js && pm2 save
```

- `pm2 start start.sh --interpreter bash` enters a **crash loop** (17 restarts) that pm2 still reports as `online` while another process holds :3001. Use `ecosystem.config.js` with `script: 'dist/server.bundle.js'`, `cwd`, `interpreter: 'node'`, `node_args: '--enable-source-maps'`, `env_file`.
- After any restart, **verify the PID matches the port owner**: `pm2 jlist | … ; ss -ltnp | grep 3001`. A mismatched PID means you are looking at the old process.
- Env is captured at `/root/agentmesh-api-restart/env.txt` (chmod 600) — contains `API_KEY`. Do not print it into logs or chat.

### 30.8 Verified state (2026-10-23, public URLs)

```
https://muhanai.com/api/ontograph/health        200  {"source":"offline","concepts":0,"relations":0}
https://muhanai.com/api/ontograph/snapshot      200  source=offline entities=9 relations=8
https://muhanai.com/api/world/brief             200  source=offline events=2 predictions=1
https://muhanai.com/api/world/health            200  {"configured":false,"reachable":false,"shadowbroker":{"configured":false,"reachable":false}}
https://muhanai.com/api/world/correlations      200  eventsScanned=0, correlationCount=0
https://muhanai.com/api/ontograph/health (no key) 401  ← auth correctly enforced

https://muhanai.com/assets/WorldPage-OkOfGb93.js  200  1,977,574 b
  ontology-graph-panel 1 · GEV STREAM 1 · world-engine-setup-link 1
```

`pm2: muhanai-agentmesh-api online, restarts=0` (saved, survives reboot).

### 30.9 Still open

1. **`PYTHIA_WORLD_URL` / `SHADOWBROKER_URL` are unset** → every world endpoint correctly serves the offline snapshot (`source: "offline"`). Set both in `/root/agentmesh-api-restart/env.txt`, restart under pm2, and re-check `/api/world/health` for `configured: true`. The web panel now links to `/dashboard` whenever `live === false`.
2. **Browser-level smoke test not performed.** All verification above is HTTP/asset-level. Someone should open `https://muhanai.com/world` and confirm the globe + sidebar + GEV badge actually render (and that `/dashboard` resolves from the new link).
3. **Correlation is untested against real data** — it returns `eventsScanned: 0` because no engine is configured.
4. `PR #19` needs review/merge. `feat/token-bank-minima` still carries pre-squash history — cut new branches from `main`, never from it (see §30.10).
5. Stray untracked `Users/brianyeon/NextClaude/` in the worktree — left alone deliberately.
6. Old web assets (`WorldPage-ktlH9Xu0.js`, `WorldPage-D7riBHGD.js`) are still in `/var/www/muhanai.com/assets`; harmless, clean up later.

### 30.10 Branch hygiene (cost me an hour)

`feat/token-bank-minima` contains PRs #15/#16/#17 **pre-squash**. `main` holds the squashed #17. They are not ancestors of each other, so `merge-base` walks back to `4a0d847` and a naive PR from that branch reports **101 files / +19341 / CONFLICTING** instead of 18 files.

**Always** cut new branches from `main`:
```bash
git switch -c feat/<name> legacy-origin/main
git checkout <old-commit> -- <paths>   # port only the intended changes
```
PR #18 was opened that way by mistake and closed; #19 is the clean replacement.

### 30.11 Section index

- **§30 (this)** — deployment complete; supersedes §29 entirely
- §29–§27 — deployment-in-progress notes, **multiple factual errors**, see 30.3
- §26 — PR #15 historical (token-bank + tasks, merged as `e0db786`)

---

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


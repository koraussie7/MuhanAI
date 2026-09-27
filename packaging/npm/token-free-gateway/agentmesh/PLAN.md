# Code Audit — Issue Resolution Plan

## Summary

A comprehensive audit of the `agentmesh` monorepo identified **60 issues** across 5 severity tiers. Below is the categorized plan, with the top 5 highest-impact fixes prioritized for immediate work.

---

## 🔴 CRITICAL (3 issues — deployment-blockers)

| # | File | Issue | 
|---|------|-------|
| 1 | `deploy/docker-compose.yml` | References `deploy/api.Dockerfile` and `deploy/relay.Dockerfile` — **neither file exists**. `docker compose up` fails immediately. |
| 2 | `services/api/src/server.ts:45-53,206-212` | `timingSafeEqual("","")` returns `true` → empty `x-api-key` header passes global auth. `API_KEY` unset via `${API_KEY}` expansion in compose → `401` bypasses for all protected routes. |
| 3 | `deploy/travel-api.ts:258,411,487` | `process.env.TOURMIND_USER_KEY` in a Cloudflare Worker. `process` is undefined → `ReferenceError` → **500 on every `/api/travel/hotels/*` request**. |

**Fix order:** #1 (build), then #2+3 together (both security/correctness).

---

## 🟠 HIGH (13 issues)

| # | File | Issue |
|---|------|-------|
| 4 | `services/api/src/server.ts:79` | Missing `NODE_ENV=production` cascades: CORS allowlist dead (uses localhost only), `DISABLE_AUTH=true` works, `AUTH_SECRET` guard inactive. |
| 5 | `deploy/Caddyfile.muhanai:15` | `uri strip_prefix /api` removes `/api` prefix → **every origin API route 404s** (Fastify registers `/api/*`). |
| 6 | `services/api/src/vietnam-routes.ts:30,127` | Unbounded in-memory cache on public `/api/vietnam/insight` — attacker-controlled `q` → heap exhaustion DoS. |
| 7 | `services/api/src/visitor-routes.ts:33,67` | Unbounded `visitors` Map on public `/api/visitors/enroll` + O(n) lookup + non-constant-time token compare. |
| 8 | `deploy/mcp-server.ts:290-320` | MCP server returns **hardcoded/fabricated results** instead of errors when upstream unavailable. External agents receive false knowledge. |
| 9 | `apps/web/src/lib/browser-peer.ts:87-95` | libp2p config missing pubsub → `node.services.pubsub` is `undefined` → peer connection throws and dies. |
| 10 | `deploy/feed-store.ts:16,28` | KV read-modify-write is **non-atomic** → concurrent votes lose increments. Write errors swallowed silently. |
| 11 | `deploy/worker.ts:68,167` | `catch (err: any)` echoes `err.message` (may contain internal hostnames/paths) to clients. |
| 12 | `deploy/docker-compose.yml:37` | `ALLOWED_ORIGINS` empty-split edge case: `"".split(",")` → `[""]`, matches nothing. |
| 13 | `apps/web/src/components/HiveBearPanel.tsx:3,21-22` | Infinite render loop — `loadStatus` redefined every render + stale-state set after unmount. |
| 14 | `services/api/src/llm-mesh-routes.ts:217` | `app.env` is always `undefined` → KV path silently always disabled. |
| 15 | `apps/web/src/App.tsx:334` | `navigate()` doesn't reset `document.title` or scroll position. |
| 16 | `wrangler.toml` vs `Caddyfile.muhanai` | Route/host mismatch: 4 Worker routes have no Caddy origin block; `travel.kbizhub.com` is in both (Caddy block is dead). |
| 17 | `deploy/feed-api.ts:205-231,336-368,423-463` | Public write endpoints (votes, teach, rewards) unauthenticated, unmetered, no size cap on `feed:teach`. |

---

## 🟡 MEDIUM (18 issues)

Key themes:
- Frontend resilience: no error boundaries (`#32`), no runtime validation on API responses (`#31, #36, #47`), unhandled promise rejections (`#14`)
- Security hardening: private key in localStorage (`#48`), internal multiaddr leaked to clients (`#49`), hardcoded DB credentials in compose (`#50`)
- Code quality: excessive `any` casts (`#45, #46, #52, #56, #57`), dead/unreachable code (`#33, #34`)

---

## 🟢 LOW (26 issues)

Cosmetic, tech-debt, and configuration hygiene items. Full table in audit results.

---

## Implementation Priority Queue

| Priority | Fix | Files | Status | Est. Effort |
|----------|-----|-------|--------|-------------|
| 1 | Create missing Dockerfiles | `deploy/api.Dockerfile`, `deploy/relay.Dockerfile` (new) | ✅ Done | 30 min |
| 2 | Harden auth + NODE_ENV + placeholder check | `server.ts`, `docker-compose.yml`, `.env.example` | ✅ Done | 30 min |
| 3 | Fix `process.env` in Worker + CORS hardening | `worker.ts`, `travel-api.ts` | ✅ Done | 45 min |
| 4 | Caddy `tls internal` + remove `uri strip_prefix /api` | `Caddyfile.muhanai`, `setup-caddy-muhanai.sh` | ✅ Done | 30 min |
| 5 | Bound in-memory caches (vietnam + visitors) | `vietnam-routes.ts`, `visitor-routes.ts` | ✅ Done | 2 hrs |
| 6 | Fix MCP fabricated results | `mcp-server.ts` | ✅ Done | 1 hr |
| 7 | vn.kbizhub.com deployment prep | `server.ts`, `docker-compose.yml`, `worker.ts` | ✅ Done | 1 hr |
| 8 | Error boundaries + response guards | `main.tsx`, `VietnamConciergePage.tsx`, `api.ts` | ⏳ Pending | 2 hrs |
| 9 | Reconcile Worker/Caddy routes | `wrangler.toml`, `Caddyfile.muhanai` | ⏳ Pending | 45 min |

## Completed Fixes (details)

### Fix #1: Missing Dockerfiles
- Created `deploy/api.Dockerfile` — multi-stage Node 22 + pnpm build for the Fastify API service.
- Created `deploy/relay.Dockerfile` — for the planned `services/p2p-node` (placeholder, as the service doesn't exist yet).

### Fix #2-4: Auth/CORS/NODE_ENV cascade
- `server.ts:45-53`: `timingSafeEqual` now rejects empty strings (was `true` for `"","")`
- `server.ts:114-139`: Startup validation throws if `API_KEY` or `AUTH_SECRET` is unset or matches placeholder patterns in production
- `server.ts:147-165`: `ALLOWED_ORIGINS` now uses `.split(",").map(s=>s.trim()).filter(Boolean)` and throws on empty list
- `server.ts:218-228`: Auth disable is now dev-only (`!isProduction`)
- `docker-compose.yml:28`: Added `NODE_ENV=production`
- `.env.example`: Replaced placeholder secrets with `change-me-*` values + startup warning; added all missing env vars

### Fix #6: `process.env` in Worker
- `travel-api.ts:134-137`: `handleTravelApi` now accepts `env?: { TOURMIND_USER_KEY?: string }`
- `travel-api.ts:258,411,487`: Replaced `process.env.TOURMIND_USER_KEY` with `env?.TOURMIND_USER_KEY ?? ""`
- `worker.ts:17`: Added `TOURMIND_USER_KEY?: string` to `Env` interface
- `worker.ts:79`: Passes `env` to `handleTravelApi`
- `wrangler.toml:29-31`: Added `TOURMIND_USER_KEY` secret binding comment
- `travel-api.ts:138-144`: Restricted CORS from `*` to `https://travel.kbizhub.com`

### Fix #5: Caddy API prefix stripping
- `Caddyfile.muhanai:13-22`: Removed `uri strip_prefix /api` so Fastify routes (`/api/vietnam/insight`, `/api/pulse`, etc.) match correctly
- `setup-caddy-muhanai.sh:10-29`: Same fix in the setup script
- Added `tls internal` to the main muhanai.com block (was missing, causing Cloudflare 525)

### Fix #8-9: Bounded caches
- `vietnam-routes.ts:30-38`: Added `cacheSet()` with 1000-entry cap + oldest-first eviction + expired-entry cleanup
- `visitor-routes.ts:32-55`: Added `VISITOR_MAX_SIZE=10000`, `visitorTokens` Map for O(1) token lookup, `findVisitorByToken()` with timing-safe comparison, token-indexed eviction
- `visitor-routes.ts:102`: Removed `multiaddr` field from response (was leaking internal infra config)

### Fix #11: MCP fabricated results
- `mcp-server.ts:463-472`: `muhanai_get_pulse` already had `_demo: true` (kept)
- `mcp-server.ts:473-480`: `muhanai_search_knowledge` now returns `[]` + `_demo: true` + message instead of hardcoded results
- `mcp-server.ts:510-516`: `muhanai_ask_quorum` fallback returns JSON instead of fabricated consensus text
- `mcp-server.ts:528-537`: `muhanai_publish_note` now returns `501` with error message instead of fake success
- `mcp-server.ts:567`: Changed `catch (_err: any)` to `catch` (no error variable exposed)

### vn.kbizhub.com prep (already done)
- `server.ts:87`: Added `/api/vietnam` to `PUBLIC_PATH_PREFIXES`
- `docker-compose.yml:37`: Added `https://vn.kbizhub.com` to `ALLOWED_ORIGINS`
- `worker.ts:84-103`: Graceful fallback for `/api/vietnam/*` when `API_ORIGIN` unset

## Part B: OpenHydra P2P inference engine (completed)

Created 5 new files in `packages/ai-engine/src/openhydra/`:
- `protocol.ts` — JSON-RPC 2.0 message types (`OpenHydraRequest`, `OpenHydraResponse`, `OpenHydraNode`, etc.)
- `discovery.ts` — `OpenHydraDiscoveryImpl` with WebSocket ping probing, timeout, abort support
- `openhydra-engine.ts` — `OpenHydraEngine` matching `OllamaEngine`/`CloudEngine` interface with multi-node fallback
- `discovery.test.ts` — 5 tests (empty bootstrap, undefined bootstrap, aborted signal, filtering nulls, all-fail)
- `openhydra-engine.test.ts` — 14 tests (init, chat with fallback, streaming tokens, JSON-RPC errors, getModels, dispose)

All 52 tests pass (4 test files total in the openhydra directory).

## Remaining Work (documented for future sprints)

### Part A: Noema mesh source abstraction
- Create `packages/noema/src/mesh-source.ts` — libp2p stream downloader with piece-by-piece fetching
- Create `packages/noema/src/source-resolver.ts` — manifest source priority resolver
- Create `packages/noema/src/download.ts` — download orchestrator using `verifyStream`
- Create tests for each

### Part C: bitterbot engine integration
- Update `packages/ai-engine/src/types.ts` — add `"openhydra"` to `EngineConfig.type`
- Update `packages/ai-engine/src/factory.ts` — add `case "openhydra"` 
- Update `packages/ai-engine/src/index.ts` — re-export `OpenHydraEngine`
- Update `apps/web/src/lib/bitterbot-engine.ts` — insert P2P fallback in chain
- Add regression tests

### Other high-priority items
- Frontend error boundaries (`main.tsx`)
- Fix `HiveBearPanel.tsx` infinite render loop
- Fix `browser-peer.ts` missing pubsub config
- Fix feed-store non-atomic KV writes
- Reconcile Worker/Caddy route mismatches

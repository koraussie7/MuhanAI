# MuhanAI Deployment Status Report
**Date**: 2026-09-14 | **Branch**: main | **Account**: telekovi (Cloudflare)

---

## Architecture (Current)

```
User → Cloudflare (Proxy) → muhanai.telekovi.workers.dev (Worker)
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
              ASSETS (apps/web/dist/)          /api/* → API_ORIGIN
              Static SPA served here           ❌ Not set → 502
```

**⚠️ Key insight**: muhanai.com traffic goes through Cloudflare Workers, NOT directly to the 110 server's Caddy. The 110 server is not in the critical path for serving the website.

**Root cause of 525**: `travel.kbizhub.com` (and `shop1.kbizhub.com`) were NOT listed in
Worker routes in `wrangler.toml`. DNS for these subdomains points to Cloudflare
(proxied), but without a matching Worker route Cloudflare falls back to origin —
which has no Caddy config for these domains, causing SSL 525 (handshake) errors.

---

## UI Build Status

| Item | Status |
|------|--------|
| Last build | 2026-09-14 00:15 |
| Build output | `apps/web/dist/` ✅ |
| Main chunk | index-Dt3M6sL8.js (456KB) |
| CSS | index-BSiAxjfR.css (105KB) |
| WebLLM worker | sipp-worker-impl-232hpCnJ.js (6MB) |
| Uncommitted changes | ⚠️ 16 files staged (UI modifications) |

**Issue**: The current dist (00:15) may not include all UI changes that are staged in git but not committed. The staged changes include modifications to CosmicHud, CosmicPromptBar, BitterbotChat, Dashboard components, i18n, sidebar-config, etc.

---

## API Status

| Item | Status |
|------|--------|
| API_ORIGIN | ❌ Not set (intentional — was causing 522) |
| `/api/*` endpoint | ❌ Returns 502 "Origin not configured" |
| API Docker container | On 110 server port 3001 (from docker-compose) |

**Fix**: Set API_ORIGIN to `http://185.55.240.110:3001` (110 server API) via Worker env vars.

---

## Cloudflare Worker Details

| Item | Value |
|------|-------|
| Worker name | muhanai |
| Worker ID | c17277c0026c4a11b948522432d0eef3 |
| Entry point | deploy/worker.ts |
| Routes | muhanai.com/*, www.muhanai.com/*, find.muhanai.com/*, travel.kbizhub.com/* |
| ASSETS binding | apps/web/dist |
| FEED_KV | d686b4fb62384fb8a13d0e27c3b52947 |
| API_ORIGIN | (empty) |

---

## Required Actions

### 1. Rebuild & Deploy UI (fix stale dist + missing Worker routes)

```bash
cd /path/to/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh

# Commit UI changes first
git add -A && git commit -m "feat(web): add TravelPage, add kbizhub.com routes"

# Rebuild and deploy
pnpm deploy:worker
```

This fixes:
- `travel.kbizhub.com` and `shop1.kbizhub.com` now route through the Worker (wrangler.toml updated with both routes)
- Latest UI dist includes the TravelPage component

### 2. Fix API (/api/* → 502)

Set API_ORIGIN on the Worker via Cloudflare API:

```bash
curl -X PUT "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/workers/scripts/muhanai" \
  -H "Authorization: Bearer REDACTED_CLOUDFLARE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "env_members": [
      {
        "name": "API_ORIGIN",
        "value": "http://185.55.240.110:3001",
        "type": "plain_text"
      }
    ]
  }'
```

**Note**: Replace `{ZONE_ID}` with the actual zone ID. Find it via:
```bash
curl -s "https://api.cloudflare.com/client/v4/zones?name=muhanai.com" \
  -H "Authorization: Bearer REDACTED_CLOUDFLARE_TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

### 3. Verify

```bash
# Check UI loads:
curl -I https://muhanai.com

# Check API proxy:
curl -I https://muhanai.com/api/health

# Check Worker env vars:
curl -s "https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/workers/scripts/muhanai/env" \
  -H "Authorization: Bearer REDACTED_CLOUDFLARE_TOKEN"
```

---

## Cloudflare SSL/TLS 525 Fix

### Root cause
Cloudflare Error 525 (SSL handshake failed) occurs because the Caddy site block
was never deployed to the origin server (110). The site config exists in the repo
but hasn't been applied to /etc/caddy/Caddyfile on the 110 server.

### Fix
1. Deploy Caddy config on 110 server:
   ```bash
   scp deploy/setup-caddy-muhanai.sh 110:/tmp/
   ssh 110 "cd /tmp && bash setup-caddy-muhanai.sh"
   ```
2. Set Cloudflare SSL/TLS mode to **Full (strict)**
3. Purge Cloudflare cache (Dashboard → Caching → Purge Everything)
4. Verify: `curl -I https://muhanai.com` should return 200

### Domains covered
- muhanai.com
- www.muhanai.com
- find.muhanai.com
- travel.kbizhub.com (new — for TravelPage; Worker route added)
- shop1.kbizhub.com (new — static Shopify store front; Worker route added)

### SSL/TLS Requirement

If using 110 server origin (instead of Workers):
- SSL/TLS mode: **Full (strict)**
- 110 server needs valid SSL cert (Caddy auto-HTTPS handles this)
- Cloudflare Origin Certificate OR Let's Encrypt via Caddy

---

## Files

| File | Purpose |
|------|---------|
| `Caddyfile.muhanai` | Caddy site block (for direct origin serving) |
| `setup-caddy-muhanai.sh` | Caddy deploy script (single file) |
| `CADDY_FIX_README.md` | Caddy setup guide |
| `DEPLOYMENT_STATUS.md` | This report |

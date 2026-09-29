# Latitude self-host (prompt.kbizhub.com)

Self-hosted [Latitude](https://github.com/latitude-dev/latitude-llm) — prompt
management, evals and LLM observability — running as an **isolated Docker
Compose project** on the 110 origin box. muhanai never imports Latitude source
(LGPL-3.0 stays clean); integration happens over HTTP:

- muhanai `services/api` registers prompts / runs LLM calls through Latitude's API.
- Latitude calls real models through the LiteLLM gateway already on the box
  (`allrouter-litellm`, host port 4003, OpenAI-compatible).
- OTLP traces from `services/api` are pushed to Latitude's ingest (loopback only).

## Files

| File | Purpose |
| --- | --- |
| `docker-stack.yml` | Vendored + adapted from upstream `docker-stack.yml` (see header notes): compose instead of Swarm, loopback-only ports 4100-4102, SeaweedFS replaced by the `fs` storage driver, memory limits for co-tenancy with Kamra/LiteLLM/muhanai-api. |
| `.env.example` | Template — copy to `.env.production` **on the server**, never commit it. |
| `docker/init-db.sh` | Vendored verbatim; creates the restricted `latitude_app` DB user on first boot. |
| `docker/clickhouse/storage.xml` | Vendored verbatim; hot/cold tiering policy the upstream migrations expect. |
| `../Caddyfile.latitude` + `../setup-caddy-latitude.sh` | Origin TLS + reverse proxy for the two public hostnames. |

## One-time setup (server: `ssh 110`)

1. **Cloudflare DNS** — Proxied (orange cloud) A records to `185.55.240.110`:
   `prompt.kbizhub.com`, `prompt-api.kbizhub.com`.
   Do **not** add them to `wrangler.toml` routes — they must hit the origin.
2. **Caddy** — from the repo root:
   ```sh
   scp deploy/Caddyfile.latitude deploy/setup-caddy-latitude.sh 110:/tmp/
   ssh 110 'cd /tmp && sudo bash setup-caddy-latitude.sh'
   ```
3. **Env** — on the server under `/opt/latitude`:
   ```sh
   sudo mkdir -p /opt/latitude && cd /opt/latitude
   # upload deploy/latitude/ contents (docker-stack.yml, .env.example, docker/)
   cp .env.example .env.production
   # replace every __REPLACE_WITH_*__ token:
   #   openssl rand -hex 32   (per secret)
   #   __LITELLM_VIRTUAL_KEY__: create a virtual key in LiteLLM (model-access to
   #   the muhanai pool) and paste it here.
   chmod 600 .env.production
   ```
4. **Boot**:
   ```sh
   cd /opt/latitude
   docker compose --env-file .env.production -f docker-stack.yml up -d
   docker compose --env-file .env.production -f docker-stack.yml ps
   ```
   `migrations` must exit 0; web/api/ingest then turn healthy.
5. **Verify**: `curl -I https://prompt.kbizhub.com` and
   `curl -fsS https://prompt-api.kbizhub.com/health`.

## RAM budget (110 box, ~7.5 GB available at survey time)

| Service | mem_limit |
| --- | --- |
| web / workers | 768 MB each |
| clickhouse | 1280 MB |
| api / ingest / temporal / workflows | 512 MB each |
| postgres | 384 MB |
| redis x2 | 128 MB each |
| migrations (one-shot) | 256 MB |
| **Total cap** | **≈ 5.9 GB worst case; typical steady-state ≈ 3–3.5 GB** |

If the box swaps under load, move Latitude to its own VPS — the stack is
self-contained and only needs the two DNS names re-pointed.

## Operations

- **Logs**: `docker compose --env-file .env.production logs -f web api` (json-file, 10 MB × 5 rotation).
- **Upgrades**: bump `LAT_IMAGE_TAG` in `.env.production` to a newer release
  tag (check upstream releases; migrations run automatically via the one-shot
  `migrations` service on next `up -d`). Never float `latest` in production.
- **Backups**: `pg_dump` of the `latitude` DB + the `clickhouse_data` and
  `latitude_storage` named volumes.
- **Reset for testing**: `docker compose ... down -v` wipes everything.

## Next phases (tracked in docs or PLAN.md)

- **Phase 2** — register LiteLLM inside Latitude as custom AI provider
  (`LAT_CUSTOM_AI_BASE_URL` is pre-wired via `host.docker.internal:4003`).
- **Phase 3** — OTel instrumentation in `services/api` + `packages/llm-router`
  (OTLP push to `http://127.0.0.1:4102`; Cloudflare Worker only propagates
  `traceparent`, it cannot run the OTel SDK).
- **Phase 4** — migrate bitterbot / travel-a2ui system prompts into Latitude
  prompt registry with `services/api/src/latitude-client.ts` (fetch + cache +
  hardcoded fallback).
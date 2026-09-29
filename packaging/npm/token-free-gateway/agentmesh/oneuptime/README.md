# OneUptime Setup for MuhanAI

This directory contains the Docker Compose configuration for self-hosting OneUptime with MuhanAI integration.

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with your actual values

# 2. Generate encryption key
openssl rand -hex 32
# Add to ENCRYPTION_KEY in .env

# 3. Start all services
docker compose up -d

# 4. Access OneUptime
# Open http://localhost:8000
# Default login: admin@oneuptime.com / oneuptime
# (Change immediately after first login)
```

## Required Configuration

### 1. GitHub App (for Auto-Fix PRs)
Create a GitHub App at https://github.com/settings/apps/new:
- **Name**: OneUptime MuhanAI
- **Homepage URL**: https://your-domain.com
- **Webhook URL**: https://your-domain.com/api/github/webhook
- **Webhook Secret**: Generate a random string
- **Permissions**:
  - Contents: Read & Write
  - Pull requests: Read & Write
  - Issues: Read & Write
  - Checks: Read
  - Metadata: Read
- **Subscribe to events**:
  - Check run
  - Check suite
  - Pull request
  - Push
- **Install** on `koraussie7/MuhanAI` repository

After creating, note down:
- App ID → `GITHUB_APP_ID`
- Private Key (Generate) → `GITHUB_APP_PRIVATE_KEY`
- Client ID → `GITHUB_CLIENT_ID`
- Client Secret → `GITHUB_CLIENT_SECRET`
- Webhook Secret → `GITHUB_APP_WEBHOOK_SECRET`

### 2. LLM Provider (for AI Auto-Fix)
Choose one:

**Anthropic (Recommended - Best for code)**
```bash
GLOBAL_LLM_PROVIDER=anthropic
GLOBAL_ANTHROPIC_API_KEY=sk-ant-...
```

**OpenAI**
```bash
GLOBAL_LLM_PROVIDER=openai
GLOBAL_OPENAI_API_KEY=sk-...
```

**Ollama (Local, Free, Private)**
```bash
# Run Ollama first: ollama serve
# Pull model: ollama pull llama3.1:8b
GLOBAL_LLM_PROVIDER=ollama
GLOBAL_OLLAMA_HOST=http://host.docker.internal:11434
GLOBAL_OLLAMA_MODEL=llama3.1:8b
```

## MuhanAI Integration

### OpenTelemetry Endpoint
Configure your MuhanAI services to send traces to OneUptime:

```bash
# In MuhanAI services (.env)
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-oneuptime-host:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS={"Authorization":"Bearer your-oneuptime-api-key"}
```

### API Key for MuhanAI
1. Login to OneUptime
2. Go to Settings → API Keys
3. Create new key with "Traces: Write" permission
4. Use in MuhanAI `OTEL_EXPORTER_OTLP_HEADERS`

## Services

| Service | Port | Purpose |
|---------|------|---------|
| OneUptime App | 8000 | Main UI & API |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache & queues |
| ClickHouse | 8123/9000 | Analytics & traces |
| MinIO | 9000/9001 | S3-compatible storage |
| OneUptime Worker | - | Background jobs |

## Production Deployment

### With Reverse Proxy (Nginx/Caddy)
```nginx
server {
    listen 80;
    server_name oneuptime.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### SSL with Let's Encrypt (Caddy)
```caddy
oneuptime.yourdomain.com {
    reverse_proxy localhost:8000
}
```

## Monitoring MuhanAI with OneUptime

1. **Add Monitors** in OneUptime:
   - HTTPS monitor for `api.muhanai.com/health`
   - HTTPS monitor for `vn.kbizhub.com/health`
   - TCP monitor for Cloudflare Worker endpoints

2. **Configure Alerting**:
   - Slack/Discord/Email notifications
   - On-call rotations

3. **Enable AI Auto-Fix**:
   - Project Settings → AI → Enable Automatic Code Fixes
   - Select LLM provider configured above
   - Set "Create PR" mode (not auto-merge)

## Troubleshooting

### Services won't start
```bash
# Check logs
docker compose logs -f oneuptime

# Common: database not ready
docker compose logs postgres
```

### ClickHouse memory issues
```bash
# Increase ulimits
ulimit -n 262144
# Or in docker-compose.yml (already configured)
```

### GitHub App webhook fails
- Ensure webhook URL is accessible from internet
- Check webhook secret matches
- Verify GitHub App permissions

## Upgrading
```bash
docker compose pull
docker compose up -d
```

## Backup
```bash
# Database
docker exec oneuptime-postgres pg_dump -U oneuptime oneuptime > backup.sql

# MinIO (S3)
mc mirror minio/oneuptime ./backup/minio

# ClickHouse
docker exec oneuptime-clickhouse clickhouse-client --query "BACKUP DATABASE oneuptime TO Disk('backups', 'oneuptime_backup')"
```
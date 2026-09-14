# Muhanai.com Caddy Fix Guide

## Status

| Step | Status |
|------|--------|
| DNS A records → 185.55.240.110 | ✅ Done |
| Caddy site block on 110 | ❌ Missing — needs deployment |
| Cloudflare cache purge | ❌ Pending |

## Deploy Caddy Config (on 110 server)

### Option 1: Single-file deploy (recommended)

Only one file needed — copy and run:

```bash
# From your machine:
scp muhanai/packaging/npm/token-free-gateway/agentmesh/deploy/setup-caddy-muhanai.sh \
    110:/tmp/

# On 110 server:
cd /tmp && bash setup-caddy-muhanai.sh
```

The Caddyfile is embedded in the script — no separate file needed.

### Option 2: Manual append

```bash
ssh 11
# Paste Caddyfile content from Caddyfile.muhanai:
cat << 'EOF' | sudo tee -a /etc/caddy/Caddyfile
muhanai.com, www.muhanai.com, find.muhanai.com {
	auto_https disable_redirect
	root * /var/www/muhanai.com/current
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
	}
	@api path /api/*
	handle @api {
		uri strip_prefix /api
		reverse_proxy 127.0.0.1:3001 {
			header_up Host {upstream_hostport}
			header_up X-Real-IP {remote_host}
			header_up X-Forwarded-For {remote_host}
			header_up X-Forwarded-Proto {scheme}
		}
	}
	@asset path_regexp asset "\.(css|js|svg|png|jpg|jpeg|webp|woff2)(\?.*)?$"
	handle @asset {
		file_server
		header Cache-Control "public, immutable, max-age=604800"
	}
	handle {
		rewrite /index.html
		file_server
	}
}
EOF
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

### After Caddy reloads:

1. **Purge Cloudflare cache**: Dashboard → Caching → Purge Everything
2. **Verify**: `curl -I https://muhanai.com` should return 200

---

## Files (in `deploy/`)

| File | Purpose |
|------|---------|
| `setup-caddy-muhanai.sh` | Single-file deploy script (Caddyfile embedded) |
| `Caddyfile.muhanai` | Standalone Caddy config (for manual use) |
| `CADDY_FIX_README.md` | This guide |

## Caddy Config

- **Domains**: muhanai.com, www.muhanai.com, find.muhanai.com
- **Root**: /var/www/muhanai.com/current
- **API proxy**: /api/* → 127.0.0.1:3001
- **Static assets**: CSS/JS/SVG/images with 7-day immutable cache
- **SPA fallback**: All paths → index.html
- **Encoding**: zstd + gzip
- **auto_https disable_redirect**: Prevents redirect loops behind Cloudflare proxy
- **Security headers**: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy

## Revert

```bash
ssh 11
sudo cp /etc/caddy/backups/Caddyfile.backup.* /etc/caddy/Caddyfile
sudo caddy validate && sudo systemctl reload caddy
# Revert DNS back to CNAME → muhanai.telekovi.workers.dev
```

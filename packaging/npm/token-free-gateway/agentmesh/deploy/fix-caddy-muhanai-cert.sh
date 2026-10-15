#!/usr/bin/env bash
# fix-caddy-muhanai-cert.sh — repair muhanai.com TLS on the 110 origin server
#
# Problem this fixes:
#   /etc/caddy/Caddyfile was hand-edited to `muhanai.com www.muhanai.com {`
#   (space-separated hosts) plus a `tls` line. Caddy's proven multi-host
#   syntax in this setup is COMMA-separated (see deploy/Caddyfile.muhanai).
#   The hand edit either failed `caddy validate` (reload rejected, old config
#   still serving) or never issued a Let's Encrypt cert, so the origin keeps
#   serving the untrusted Cloudflare Origin CA cert and every visitor gets
#   ERR_CERT_AUTHORITY_INVALID (curl error 60).
#
# What it does:
#   1. Backs up the live Caddyfile
#   2. Removes every site block whose header claims muhanai.com /
#      www.muhanai.com / find.muhanai.com / travel.kbizhub.com
#      (hand-edited or stale variants, deduped)
#   3. Appends the canonical comma-separated block from the repo
#      (auto-HTTPS / Let's Encrypt, no explicit Origin-CA tls line)
#   4. Leaves any *.muhanai.com wildcard block untouched (other subdomains
#      may depend on it; explicit host blocks override wildcards in Caddy)
#   5. caddy validate -> systemctl reload (auto-rollback on validation failure)
#   6. Waits for ACME issuance and verifies the served cert issuer
#
# NOTE: `auto_https` is a Caddy *global option*, not a site-block
# directive — inside a site block `caddy validate` fails with
# "unrecognized directive: auto_https". The canonical block relies on
# default auto-HTTPS (Let's Encrypt + HTTP→HTTPS redirect), which is
# also what direct (grey-DNS) serving wants.
#
# Run ON the 110 server (or via: scp this file 110:/tmp/ && ssh 110 bash /tmp/fix-caddy-muhanai-cert.sh)
set -uo pipefail

CADDYFILE="/etc/caddy/Caddyfile"
BACKUP_DIR="/etc/caddy/backups"
TS="$(date +%Y%m%d_%H%M%S)"
CANONICAL_BLOCK='muhanai.com, www.muhanai.com, find.muhanai.com, travel.kbizhub.com {
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

	@dashboard path /dashboard2 /dashboard2/
	handle @dashboard {
		rewrite * /dashboard-v2.html
		file_server
		header Cache-Control "no-cache"
	}

	handle {
		rewrite /index.html
		file_server
	}
}'
# Whole-token host matching: lookaround bounds (python re) keep longer
# hostnames that merely CONTAIN a managed host (e.g. api.muhanai.com,
# shop1.kbizhub.com) out of the removal set — only exact-host site
# blocks are replaced. HOSTS_GREP_RE is the grep -E-compatible twin
# (grep has no lookaround) used for the display-only grep below.
HOSTS_GREP_RE='(^|[^a-z0-9.\-])(muhanai\.com|www\.muhanai\.com|find\.muhanai\.com|travel\.kbizhub\.com)($|[^a-z0-9.\-])'
HOSTS_RE='(?<![a-z0-9.\-])(muhanai\.com|www\.muhanai\.com|find\.muhanai\.com|travel\.kbizhub\.com)(?![a-z0-9.\-])'

step() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  OK:\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  WARN:\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m  FAIL:\033[0m %s\n' "$*"; }

[ "$(id -u)" = "0" ] || { err "run as root (sudo)"; exit 1; }
command -v caddy >/dev/null || { err "caddy binary not found"; exit 1; }
[ -f "$CADDYFILE" ] || { err "$CADDYFILE not found"; exit 1; }

step "1/6 Backup live Caddyfile"
mkdir -p "$BACKUP_DIR"
cp -a "$CADDYFILE" "$BACKUP_DIR/Caddyfile.pre-ll-fix.$TS"
ok "backup -> $BACKUP_DIR/Caddyfile.pre-ll-fix.$TS"

step "2/6 Show current muhanai-related blocks and cert state"
echo "--- site headers mentioning muhanai hosts ---"
grep -nE '^[[:space:]]*[^#]*'"$HOSTS_GREP_RE" "$CADDYFILE" || echo "(none found)"
echo "--- explicit tls lines near muhanai blocks ---"
grep -nE 'tls[[:space:]]' "$CADDYFILE" | grep -vE 'tls internal' || true
echo "--- cert currently served on :443 ---"
for h in muhanai.com www.muhanai.com; do
  issuer=$(openssl s_client -connect 127.0.0.1:443 -servername "$h" </dev/null 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
  echo "  $h -> ${issuer:-<no cert served>}"
done

step "3/6 Remove stale muhanai site blocks (dedupe) and append canonical block"
python3 - "$CADDYFILE" "$HOSTS_RE" "$CANONICAL_BLOCK" <<'PY'
import re, sys

path, hosts_re, canonical = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()
lines = src.splitlines(keepends=True)

# Find site-block headers (first token line before '{' at column 0 indent)
# that mention any muhanai host, then drop the whole brace-matched block.
drop_spans = []
i = 0
n = len(lines)
while i < n:
    line = lines[i]
    stripped = line.strip()
    if (
        not stripped.startswith("#")
        and "{" in stripped
        and not stripped.startswith("}")
        and re.search(hosts_re, stripped)
        and not re.search(r"\*\.muhanai\.com", stripped)  # keep wildcard block
    ):
        # brace-match from this line
        depth = 0
        j = i
        started = False
        while j < n:
            depth += lines[j].count("{") - lines[j].count("}")
            if "{" in lines[j]:
                started = True
            if started and depth <= 0:
                break
            j += 1
        drop_spans.append((i, j))
        i = j + 1
    else:
        i += 1

# Drop spans in reverse so indices stay valid
for a, b in reversed(drop_spans):
    del lines[a : b + 1]

# Tidy: collapse 3+ consecutive blank lines left behind
out = "".join(lines)
out = re.sub(r"\n{4,}", "\n\n\n", out).rstrip() + "\n"

# Append canonical block (comment marker + block)
out += "\n# === MuhanAI canonical site block (comma-separated hosts, auto-HTTPS) ===\n"
out += canonical + "\n"
open(path, "w").write(out)
print(f"  removed {len(drop_spans)} stale muhanai site block(s); appended canonical block")
PY

step "4/6 Validate and reload Caddy (auto-rollback on failure)"
if caddy validate --config "$CADDYFILE" 2>&1; then
  if systemctl reload caddy 2>/dev/null; then
    ok "caddy config valid and reloaded"
  else
    warn "systemctl reload failed — attempting caddy restart"
    systemctl restart caddy || { cp -a "$BACKUP_DIR/Caddyfile.pre-ll-fix.$TS" "$CADDYFILE"; systemctl reload caddy; err "reloaded restored backup"; exit 1; }
    ok "caddy restarted"
  fi
else
  cp -a "$BACKUP_DIR/Caddyfile.pre-ll-fix.$TS" "$CADDYFILE"
  systemctl reload caddy
  err "config invalid — restored backup and reloaded. Inspect the error above."
  exit 1
fi

step "5/6 Wait for Let's Encrypt issuance (up to 120s)"
issued=""
for _ in $(seq 1 24); do
  sleep 5
  ok_count=0
  for h in muhanai.com www.muhanai.com find.muhanai.com travel.kbizhub.com; do
    issuer=$(openssl s_client -connect 127.0.0.1:443 -servername "$h" </dev/null 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
    case "$issuer" in *"Let's Encrypt"*|*"R10"*|*"R11"*|*"E1"*|*"E2"*) ok_count=$((ok_count+1));; esac
  done
  echo "  certs issued by Let's Encrypt: $ok_count/4"
  [ "$ok_count" = "4" ] && { issued=yes; break; }
done

step "6/6 Final verification (no -k: cert must validate)"
for h in muhanai.com www.muhanai.com; do
  issuer=$(openssl s_client -connect 127.0.0.1:443 -servername "$h" </dev/null 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null)
  echo "  $h -> ${issuer:-<no cert served>}"
done
echo ""
if [ "${issued:-}" = "yes" ]; then
  ok "Let's Encrypt certs live for all 4 hosts"
else
  warn "issuance incomplete. Check ACME reachability:"
  echo "     sudo journalctl -u caddy --no-pager -n 100 | grep -iE 'acme|challenge|error'"
  echo "     # HTTP-01 needs public tcp/80 and TLS-ALPN-01 needs public tcp/443 on 185.55.240.110"
fi

cat <<'EOF'

Cloudflare decision (pick ONE):

  A) Keep direct-origin serving (current DNS = grey/DNS-only):
       - done once the 4 certs above show Let's Encrypt
       - verify from a real client: curl -sv https://muhanai.com/ -o /dev/null

  B) Restore Cloudflare proxying (recommended if the Worker must stay in path):
       - re-enable orange cloud on the muhanai.com DNS records
       - SSL/TLS mode: Full (strict)
       - origin keeps a publicly-trusted cert (Let's Encrypt from this fix)
         so Full(strict) handshakes succeed — this also permanently clears 526
       - purge Cloudflare cache

Do NOT mix: orange cloud + untrusted origin cert = 526; grey + untrusted = browser warnings.
EOF

#!/usr/bin/env bash
# deploy/dadabot-deploy.sh
# 110 서버에서 dadabot.muhanai.com 호스팅을 셋업하는 단일 스크립트.
# root 권한 필요. 실행 후 nginx reload + 검증까지 수행.

set -euo pipefail

DOMAIN="${DADABOT_DOMAIN:-dadabot.muhanai.com}"
DOCROOT="/var/www/${DOMAIN}"
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> dadabot.muhanai.com 배포 시작"
echo "    DOCROOT=${DOCROOT}"
echo "    SRC_DIR=${SRC_DIR}"

# 1) docroot 생성
sudo mkdir -p "${DOCROOT}/releases"
sudo chown -R www-data:www-data "${DOCROOT}"

# 2) install 스크립트 + install.ps1 복사
for f in install.sh install.ps1; do
  src="${SRC_DIR}/.kilo/worktrees/fire-piano/scripts/install/dadabot/${f}"
  if [[ -f "$src" ]]; then
    sudo cp "$src" "${DOCROOT}/${f}"
    sudo chmod +x "${DOCROOT}/${f}"
    echo "    copied: $f"
  else
    echo "    WARN: $src 없음 — 스킵"
  fi
done

# 3) manifest placeholder
if [[ ! -f "${DOCROOT}/releases/latest-stable.json" ]]; then
  sudo tee "${DOCROOT}/releases/latest-stable.json" >/dev/null <<'JSON'
{
  "version": "0.1.0-beta.1",
  "channel": "stable",
  "minisign_pubkey": "RWQzenm0KK2oS3qOOPSKnoYJ9DRQ",
  "artifacts": []
}
JSON
  echo "    seeded manifest"
fi

# 4) nginx vhost (없을 때만)
VHOST="/etc/nginx/sites-available/${DOMAIN}.conf"
if [[ ! -f "$VHOST" ]]; then
  sudo tee "$VHOST" >/dev/null <<NGINX
server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    root ${DOCROOT};
    index index.html;

    location = /install.sh { types { text/plain default_type; } add_header Cache-Control "public, max-age=300" always; }
    location = /install.ps1 { types { text/plain default_type; } add_header Cache-Control "public, max-age=300" always; }
    location /releases/ { types { application/json "json"; application/octet-stream "*"; } add_header Cache-Control "public, max-age=60" always; }

    location / { try_files \$uri \$uri/ /index.html; add_header Cache-Control "public, max-age=3600" always; }
    location = /manifest.webmanifest { add_header Cache-Control "public, max-age=3600" always; }
    location = /sw.js { add_header Cache-Control "no-cache, no-store, must-revalidate" always; }
}
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://${DOMAIN}\$request_uri;
}
NGINX
  sudo ln -sf "$VHOST" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
  echo "    nginx vhost 작성"
else
  echo "    nginx vhost 이미 존재 — 스킵"
fi

# 5) certbot이 Let's Encrypt 발급을 시도 (이미 있으면 무효)
if [[ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
  if command -v certbot >/dev/null 2>&1; then
    sudo certbot --nginx -d "${DOMAIN}" \
      --cert-name "${DOMAIN//./-}" --redirect --agree-tos \
      -m "${DADABOT_OPS_EMAIL:-ops@muhanai.com}" --no-eff-email || \
      echo "    WARN: certbot 실패 — Cloudflare Origin Cert로 대체"
  fi
fi

# 6) nginx 검증 + reload
sudo nginx -t
sudo systemctl reload nginx

echo "==> 완료"
echo "    curl -fsSL https://${DOMAIN}/install.sh | head -5"
echo "    curl -fsSL https://${DOMAIN}/releases/latest-stable.json | jq ."

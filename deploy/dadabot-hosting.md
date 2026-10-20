# DadaBot Self-Hosting on 185.55.240.110

dadabot install 스크립트 + manifest + binaries를 110 서버에 직접 호스팅하는 가이드.

## 최종 사용자 명령 (목표)

```bash
curl -fsSL https://dadabot.muhanai.com/install.sh | sh
```

## nginx 설정 (Cloudflare 뒤, 525 방지)

### 1) SSL 인증서 발급 (오리진)

```bash
sudo certbot --nginx -d dadabot.muhanai.com \
  --cert-name dadabot-muhanai --redirect --agree-tos -m ops@muhanai.com
```

또는 Cloudflare Origin Certificate 사용:
- Cloudflare Dashboard → SSL/TLS → Origin Server → Create Certificate
- 15년짜리 origin cert.pem + key.pem 받기
- nginx에 설치 (별도)

### 2) nginx SNI 가상호스트

`/etc/nginx/sites-available/dadabot.muhanai.com.conf`:

```nginx
server {
    listen 443 ssl;
    server_name dadabot.muhanai.com;

    ssl_certificate /etc/letsencrypt/live/dadabot.muhanai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dadabot.muhanai.com/privkey.pem;

    root /var/www/dadabot.muhanai.com;
    index index.html;

    # install 스크립트와 manifest는 캐시 가능 (불변 또는 latest 태그)
    location /install.sh {
        types { text/plain default_type; }
        add_header Cache-Control "public, max-age=300" always;
    }
    location /install.ps1 {
        types { text/plain default_type; }
        add_header Cache-Control "public, max-age=300" always;
    }
    location /releases/ {
        types { application/json "json"; application/octet-stream "*"; }
        add_header Cache-Control "public, max-age=60" always;
    }

    # dadabot 대시보드 PWA (apps/dadabot-dashboard/dist/)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=3600" always;
    }

    location = /manifest.webmanifest { add_header Cache-Control "public, max-age=3600" always; }
    location = /sw.js { add_header Cache-Control "no-cache, no-store, must-revalidate" always; }
}

server {
    listen 80;
    server_name dadabot.muhanai.com;
    return 301 https://dadabot.muhanai.com$request_uri;
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dadabot.muhanai.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3) docroot 셋업

```bash
sudo mkdir -p /var/www/dadabot.muhanai.com/releases
sudo chown -R www-data:www-data /var/www/dadabot.muhanai.com
```

### 4) install 스크립트 + manifest 배포

```bash
# install 스크립트 (.kilo/worktrees/fire-piano/scripts/install/dadabot/install.sh에서 복사)
sudo cp /Users/brianyeon/CodeGPT/integration-finalize/.kilo/worktrees/fire-piano/scripts/install/dadabot/install.sh \
  /var/www/dadabot.muhanai.com/install.sh
sudo chmod +x /var/www/dadabot.muhanai.com/install.sh

# install.ps1 (Windows 사용자용)
sudo cp /Users/brianyeon/CodeGPT/integration-finalize/.kilo/worktrees/fire-piano/scripts/install/dadabot/install.ps1 \
  /var/www/dadabot.muhanai.com/install.ps1

# releases/latest-stable.json (manifest placeholder)
sudo tee /var/www/dadabot.muhanai.com/releases/latest-stable.json <<'JSON'
{
  "version": "0.1.0-beta.1",
  "channel": "stable",
  "minisign_pubkey": "RWQzenm0KK2oS3qOOPSKnoYJ9DRQ",
  "artifacts": [
    {
      "platform": "macos-universal",
      "download_url": "https://github.com/koraussie7/dadabot/releases/download/v0.1.0-beta.1/dadabot-0.1.0-beta.1-macos-universal.tar.gz",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "size_bytes": 0
    }
  ]
}
JSON
```

### 5) PWA 대시보드 빌드 & 배포

```bash
cd /Users/brianyeon/CodeGPT/integration-finalize
pnpm --filter @agentmesh/dadabot-dashboard build  # 또는 npm run build
sudo rsync -av apps/dadabot-dashboard/dist/ /var/www/dadabot.muhanai.com/
```

## Cloudflare SSL/TLS 설정 (525 방지)

`dadabot.muhanai.com`은 Proxied 상태:
- Cloudflare Dashboard → SSL/TLS → Overview → **Full (strict)** (오리진이 Let's Encrypt 사용 시) 또는 **Full** (Cloudflare Origin Cert 사용 시)
- Edge Certificates → Universal SSL이 `dadabot.muhanai.com`을 커버하는지 확인

## 환경변수 오버라이드

설치 스크립트는 다음 변수를 env로 override 가능:

| 변수 | 기본값 (수정됨) | 용도 |
|---|---|---|
| `DADABOT_BASE_URL` | `https://dadabot.muhanai.com` | 바이너리/manifest 다운로드 endpoint |
| `DADABOT_API_URL` | `https://api.github.com/repos/koraussie7/dadabot/releases` | fallback (releases 페이지) |
| `DADABOT_VERSION` | `latest` | 버전 핀 |
| `DADABOT_CHANNEL` | `stable` | 채널 선택 |
| `DADABOT_HOME` | `~/.dadabot` | 설치 디렉토리 |
| `DADABOT_PORT` | `7878` | 데몬 포트 |

## 검증

```bash
# 1) 스크립트 도달 가능
curl -fsSL https://dadabot.muhanai.com/install.sh | head -5

# 2) manifest 도달 가능
curl -fsSL https://dadabot.muhanai.com/releases/latest-stable.json | jq .

# 3) PWA 대시보드
curl -fsSL https://dadabot.muhanai.com/manifest.webmanifest | jq .

# 4) HTTPS 525 사라졌는지
curl -sI https://dadabot.muhanai.com/ | head -1
```

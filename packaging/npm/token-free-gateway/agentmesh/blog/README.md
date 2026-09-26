# blog.muhanai.com (Hugo)

`blog.muhanai.com`을 Hugo 정적 사이트로 빌드·배포하는 설정입니다.

## 구조

```
blog/
├── hugo.toml                 # 사이트 설정 (baseURL, 메뉴, taxonomy, RSS/sitemap)
├── content/                  # 마크다운 콘텐츠
│   ├── _index.md
│   └── posts/*.md
├── layouts/                  # 테마 템플릿 (Hugo 모듈/외부 의존성 없음)
│   ├── _default/{baseof,list,single}.html
│   └── partials/{head,header,footer}.html
└── static/css/site.css       # 자체 CSS (CDN·웹폰트 없음)
```

테마를 Hugo Module로 두지 않아 외부 네트워크 없이 빌드됩니다. SCSS를 쓰지 않아
Hugo standard/extended 어느 바이너리에서도 동작합니다.

## 로컬 개발

```bash
# Hugo 설치 (Homebrew)
brew install hugo

cd blog
hugo server -D          # http://localhost:1313
```

## 빌드 및 배포

```bash
# 빌드 → 원자적 릴리스로 반영
./deploy/build-blog.sh

# 릴리스 목록 확인
ls -1 /var/www/blog.muhanai.com/releases
```

`build-blog.sh`는 `blog/public`을 빌드한 뒤 타임스탬프 디렉터리로 복사하고
`/var/www/blog.muhanai.com/current` 심볼릭 링크를 교체합니다. 이전 릴리스는
보존되므로 즉시 롤백할 수 있습니다.

```bash
ln -sfn /var/www/blog.muhanai.com/releases/<previous> /var/www/blog.muhanai.com/current
systemctl reload caddy
```

## 라우팅 / DNS

| 항목 | 값 |
|---|---|
| 공개 도메인 | `blog.muhanai.com` |
| DNS | A 레코드 → `185.55.240.110`, **Proxied** (orange cloud) |
| 서빙 계층 | Caddy (origin) 정적 `file_server` |
| 문서 루트 | `/var/www/blog.muhanai.com/current` |
| origin TLS | Caddy 내부 CA (`tls internal`) |
| 공개 TLS | Cloudflare 종료 |

**주의 1 — Worker route로 등록하지 마세요.** `blog.muhanai.com` 은
`wrangler.toml` 에 라우트를 만들지 않습니다. Worker route로 등록하면 정적 원본
대신 Worker가 요청을 가로채고, Worker에 대응 핸들러가 없으면 오리진 폴백이
발생해 SSL 525/522 로 실패합니다. `hotel.kbizhub.com` 과 동일한 이유로
proxied A 레코드 + Caddy 조합을 씁니다.

**주의 2 — origin은 `tls internal`.** Cloudflare가 공개 TLS를 종료하므로 origin은
Caddy 내부 CA로 동작해야 합니다. proxied 호스트명 뒤에서 공개 ACME 발급을 시도하면
핸드셰이크가 실패해 525가 납니다.

## 배포

### 방법 A — GitHub Actions (권장)

`.github/workflows/deploy-blog.yml`이 `blog/**` 변경 시 자동으로
Hugo 빌드 → 원격 rsync → `current` 심볼릭 링크 교체 → Caddy 리로드를 수행합니다.
로컬에 Hugo가 없어도 동작합니다.

필요한 저장소 시크릿:

| 시크릿 | 값 |
|---|---|
| `ORIGIN_SSH_KEY` | origin 접속용 private key (PEM, 줄바꿈 포함) |
| `ORIGIN_HOST` | `185.55.240.110` (known_hosts 기록용) |
| `ORIGIN_USER` | `root` (또는 sudo 권한 사용자) |

GitHub 저장소 Settings → Environments에 `production` 환경을 만들고 위 시크릿을
등록합니다. 수동 실행은 Actions 탭의 “Deploy Blog” → *Run workflow*.

### 방법 B — origin에서 직접 빌드

origin에 Hugo가 있을 때:

```bash
./deploy/build-blog.sh            # 빌드 + 릴리스 반영 + caddy 리로드
./deploy/build-blog.sh --drafts   # draft 포함
```

### 최초 1회 — origin 준비

```bash
scp packaging/npm/token-free-gateway/agentmesh/deploy/Caddyfile.muhanai \
    packaging/npm/token-free-gateway/agentmesh/deploy/setup-blog-origin.sh 110:/tmp/
ssh 110 'sudo bash /tmp/setup-blog-origin.sh /tmp/Caddyfile.muhanai'
```

이 스크립트는 멱등하며 Caddyfile을 백업하고, `blog.muhanai.com` 블록만
추출해 추가(기존 muhanai.com / hotel 블록은 건드리지 않음), 검증 실패 시
백업을 복원합니다.

## 롤백

```bash
ls -1 /var/www/blog.muhanai.com/releases          # 이전 릴리스 확인
sudo ln -sfn /var/www/blog.muhanai.com/releases/<previous> \
             /var/www/blog.muhanai.com/current
sudo systemctl reload caddy
```

## 콘텐츠 추가

```bash
$EDITOR blog/content/posts/2026-09-27-my-post.md
```

앞부분 front matter:

```yaml
---
title: "제목"
date: 2026-09-27T10:00:00+09:00
draft: false
categories: ["Architecture"]
tags: ["p2p", "libp2p"]
description: "검색 결과와 OG 태그에 쓰이는 요약"
---
```

`draft: true`로 두면 `hugo` 기본 빌드에서 제외되고, `hugo -D`에서만 보입니다.

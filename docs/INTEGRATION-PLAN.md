# MuhanAI 통합 플랜 — 웹앱 + 게이트웨이 단일 개발/배포 경험

> 확정 방향(옵션 2): `web-app/`과 게이트웨이를 하나의 개발·배포 경험으로 통합한다.
> 본 문서는 2026-09-23 기준 저장소 실측 결과에 기반한다.

## 0. 현황 진단 (실측 완료)

| 구성 요소 | 위치 | 상태 |
|---|---|---|
| 게이트웨이 코어 소스 | **이 저장소에 없음** | AGENTS.md가 기술한 `index.ts`/`src/server.ts`는 원본 token-free-gateway 저장소 구조. 이 워크스페이스(`muhanai/main`)는 게이트웨이를 **설치된 바이너리**로만 가짐 |
| 게이트웨이 바이너리 | `/Users/brianyeon/.local/bin/token-free-gateway` (v0.5.1) | `serve/start/stop/status/webauth` 명령, 기본 포트 **3456** (`TFG_PORT`, `TFG_API_KEY`, `TFG_CDP_URL` env) |
| 게이트웨이 npm 배포 패키지 | `packaging/npm/token-free-gateway/` (v0.5.2) | 런처 `bin/index.js` + 플랫폼별 optionalDependencies만. 소스 없음 |
| 웹앱 A | `web-app/` (루트) | 이름 `@agentmesh/web` — **워크스페이스 밖**(node_modules 미설치, typecheck 불가). 고유분: `LoginPage/RegisterPage`, `src/context/`, `dashboard-v2-routes.test.ts` |
| 웹앱 B | `packaging/npm/token-free-gateway/agentmesh/apps/web` | typecheck 통과. 고유분: `WorldGlobe/WorldMeshPanel/WorldPage`, `PythiaPage`, `a2ui/`, `TravelPage`, `useMeshPulse` |
| 두 웹앱 diff | — | **53개 파일 상이** — 루트 스크립트(`dev:web/build:web/deploy:worker`)는 이미 B를 가리킴 |
| API 서버 | `agentmesh/services/api` (:3001) | `/health`, `/api/health` 공개. `/api/route`(크레딧 게이트) 존재. 브리지 가드 `AGENTMESH_BRIDGE_TOKEN`(timing-safe) 구현 완료 |
| Rome 브리지 | `agentmesh/rome-apps/agentmesh-bridge` + `tests/rome-bridge-gateway.test.ts` | PoC. 워크스페이스 밖(`pnpm-workspace.yaml` 미포함). 패키지 `test` 스크립트가 존재하지 않는 `@agentmesh/agentmesh` 필터를 참조 → **깨져 있음** |
| 웹 LLM 폴백 | `web-app/vite.config.ts` llmChatPlugin | OmniRoute → **oauth-gateway :3456** → OpenRouter free → Pollinations 순. 게이트웨이 없어도 동작 |
| 배포 | `agentmesh/deploy/` | Caddy(`setup-caddy-muhanai.sh`), nginx dashboard, `inject-dashboard-v2.sh`("Build web-app first" 안내는 구 웹앱 기준), `deploy:worker`(wrangler) |
| 기준선 | — | 루트 `pnpm typecheck` **38/38 Done 통과**, `apps/web` 단독 typecheck 통과 |

핵심 결론:
1. "게이트웨이 소스 통합"은 이 저장소에서 **불가** — 게이트웨이는 호스트에 설치된 외부 바이너리다. 통합은 **프로세스 기동·설정·검증·배포 문서** 수준에서 이루어진다.
2. 진짜 통합 과제는 **웹앱 2벌 통합**(이름 충돌 포함)과 **원커맨드 스택 기동**이다.

## 1. Phase 1 — 웹앱 단일 소스화 (source of truth)

**정본: `agentmesh/apps/web` (B)**. 근거: 루트 스크립트가 이미 지칭, 워크스페이스 안에서 typecheck/test 지원, 빌드가 `dashboard-v2.html`까지 처리.

1. **고유분 이식** (B가缺少인 것):
   - `web-app/src/components/LoginPage.tsx`, `RegisterPage.tsx`
   - `web-app/src/context/` (AuthContext 등)
   - `web-app/src/dashboard-v2-routes.test.ts`
2. **53개 diff 파일 병합**: 커밋 히스토리로 어느 쪽이 최신 변경인지 확인 후 채택. 대략 web-app 쪽은 auth/context 계열, B 쪽은 World/Pythia/a2ui 계열이 최신.
3. **이름 충돌 해소**: 두 패키지 모두 `@agentmesh/web` → `pnpm --filter` 혼동 유발. 이식 완료 후 `web-app/`을 제거(또는 `@agentmesh/web-legacy` 개명 + 아카이브)한다.
4. 이식 후 B에서 `bun run typecheck` + `pnpm test` 통과 확인.

## 2. Phase 2 — 게이트웨이 통합 (원커맨드 스택)

게이트웨이는 소스가 아니라 설치 전제 바이너리이므로, 통합은 런처와 환경변수 정리로 한다.

1. 루트 `package.json` 스크립트 추가:
   - `dev:gateway`: `token-free-gateway start` (status/stop도 래퍼)
   - `dev`: gateway(:3456) + api(:3001) + web(:5173) 동시 기동 — 셸 `&` + trap 또는 `pnpm -r --parallel`로 구성 (새 런타임 의존 추가 없음)
2. **`.env.example` 정리**: `TFG_PORT`, `TFG_API_KEY`, `AGENTMESH_GATEWAY_URL`(기본 `http://127.0.0.1:3001`), `AGENTMESH_BRIDGE_TOKEN`, `CREDITS_ENFORCED`, `OMNIROUTE_MODEL`.
3. **게이트웨이는 선택적 부스트로 편성**: vite 폴백 체인이 이미 게이트웨이 미기동 시 무료 티어로 우회하므로, `dev`는 게이트웨이가 없어도 뜨야 한다.
4. 헬스 게이트: `:3001/health` + `token-free-gateway status` + `:3456` 엔드포인트 존재 확인.

## 3. Phase 3 — Rome 브리지 정리

1. **깨진 테스트 스크립트 수정**: `rome-apps/agentmesh-bridge/package.json`의
   `"test": "pnpm --filter @agentmesh/agentmesh test ..."` → 루트 `pnpm test tests/rome-bridge-gateway.test.ts`로 교체 (루트 vitest는 `tests/**/*.test.ts` 이미 포함).
2. **워크스페이스 편입은 보류**: `@rome-os/app-runtime`을 agentmesh 워크스페이스에 들이면 포크/의존성 폭증 위험이 있어, `rome-apps/`는 PoC로 유지한다. 통합 범위는 "게이트웨이 호출 함수(gateway.ts) + API 가드 연결"까지만.
3. API 쪽 가드(`AGENTMESH_BRIDGE_TOKEN`)와 브리지 `buildHeaders()`의 Bearer 포맷 일치 — **이미 일치함(확인 완료)**.

## 4. Phase 4 — 배포 단일화

1. **빌드 산출물 하나에서 두 경로 소비**: `pnpm build:web` → `dist/` → (a) wrangler worker, (b) Caddy/nginx origin. 운영 경로는 `deploy/DEPLOYMENT_STATUS.md` 기준으로 문서에 명시.
2. `inject-dashboard-v2.sh`의 "Build web-app first" 안내를 실제 명령(`pnpm build:web`, apps/web의 `cp dashboard-v2.html dist/` 포함)으로 갱신.
3. **게이트웨이 배포 문서**: npm 설치(`token-free-gateway`) → `webauth` → `start` → status 확인 단계를 배포 README에 추가. 호스트에 Chrome/CDP 필요.
4. (선택) `docker-compose` 신규 작성: `web`(정적/Caddy) + `api` + `gateway`(Chrome optional) 3서비스 편성. 현재 compose 파일 없음.

## 5. Phase 5 — 검증 게이트 (각 단계 통과 조건)

- `pnpm typecheck` — 38/38 Done 유지
- `pnpm test` —rome 브리지 테스트 포함 전체 통과
- `pnpm build:web` — dist/ + dashboard-v2.html 산출
- 웹앱 병합 후: login/register/context 기능 스모크 + `dashboard-v2-routes.test.ts` 이식 통과
- 스택: `dev` 원커맨드로 3001/3456/5173 기동 → 웹에서 LLM 호출이 gateway(또는 폴백)로 흐르는 것 확인

## 6. 리스크 및 의사결정 포인트

1. **게이트웨이 소스 부재**: `index.ts`/`src/server.ts` 수정이 필요해지면 원본 token-free-gateway 저장소로 가야 한다(이 워크스페이스 밖).
2. **웹앱 53개 diff 병합**이 전체 작업량의 대부분. 어느 쪽이 최신인지 커밋 히스토리 기반 채택 필요.
3. **`@agentmesh/web` 이름 충돌**이 pnpm 필터 혼동의 근원 — Phase 1에서 최우선 해결.
4. **rome-apps 워크스페이스 편입 여부**는 유지 비용 대비 효과를 보고 재검토(현 시점은 보류 권장).

## 순서 요약

```
Phase 1 (웹앱 단일화) → Phase 2 (원커맨드 스택) → Phase 3 (브리지 정리)
      → Phase 4 (배포 단일화) → Phase 5 (검증 게이트, 각 단계마다)
```

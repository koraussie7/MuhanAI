# Rome 통합 작업 분할 — Agent A / B / C

> 목적: `rome-os/rome` 를 agentmesh의 에이전트 환경 레이어로 통합하는 작업을
> 3개 파트로 나눠 병렬 진행한다. 이 문서 하나만 읽으면 착수·검증·완료 판정까지
> 할 수 있게 작성했다. 기준선은 `ROME-MIGRATION-POC.md` (2026-09-22 검증)를 따른다.
>
> 상위 문서: `docs/ROME-MIGRATION-POC.md`
> 관련: `docs/ROME-PART-C-PRECONDITIONS.md` (Part C 착수 전 정적 검증 결과)

## 0. 검증 완료 기준선 (이것만 믿고 시작)

2026-09-23 이 레포에서 재확인한 사실:

| 항목 | 상태 |
| --- | --- |
| 브리지 소스 완성 (`rome-apps/agentmesh-bridge/`: app.yaml, actions/route, actions/status, api/index, lib/gateway.ts) | ✅ 존재 |
| `@rome-os/app-runtime` npm 최신 = `0.6.6` (브리지 `^0.6.6` 과 일치) | ✅ 확인 |
| 브리지 자체 `node_modules` 보유 (agentmesh workspace와 분리 — Rome 의존성 미유입) | ✅ 확인 |
| `tests/rome-bridge-gateway.test.ts` (vitest, fetch 목업) — `vitest.config.ts` 의 `tests/**` 패턴에 포함 | ✅ 확인 |
| API `POST /api/route` (`services/api/src/router-routes.ts`) + `GET /health` (`server.ts:258`) 존재 | ✅ 확인 |
| `AGENTMESH_BRIDGE_TOKEN` 헬퍼 `isBridgeAuth`+`timingSafeEqual` (`server.ts:54`) — **전역 `onRequest` 훅에 적용됨(`server.ts:204`)**, `/api/route` 포함 | ✅ 확인 (2026-09-23 해소) |
| 호스트: Node **v26.8.1** (≥24 ✅), pnpm **11.8.0** (11.6 ✅), Docker **29.5.3** ✅ | ✅ 확인 |
| `rome` CLI | ✅ **`@rome-os/app-web-sdk@0.3.4`** 가 `bin.rome` 제공 — npm 에 정상 배포됨 (이전 "체크아웃에도 없음" 기재는 오판) | ✅ 확인 |
| 브리지 `pnpm install` → `tsc --noEmit` | ✅ **확인** (exit 0) |
| `rome build` → `dist/` 산출 | ✅ **확인** — `dist/web/manifest.json`, `dist/web/index.{js,css}`, `dist/actions/*/action.yaml` |
| 브리지 `action.yaml` 2개 | ✅ **작성 완료** — 없으면 설치 검증(`remix-install-validation.ts:79`) 실패 |
| `web/manifest.json` | ✅ **빌드 산출물** — 소스에 두지 않는다 |
| Rome 앱 반입 경로 | ✅ `app_management { op:"create" }` → `op:"install"` (`packages/app-template` → `~/.rome/<profile>/projects/apps/`) |
| 라이브 왕복 (API 3001 + DB) | ✅ **확인** — 200/401/402/502 전부 실측 (`ROME-PART-C-PRECONDITIONS.md` §7) |
| 라이브 왕복 (Rome dev 스택 경유) | ❌ 미검증 |
| Docker 네트워킹 (Rome compose ↔ agentmesh) | ❌ 미검증 |

### 공유 계약 (A/B/C 모두 이 이름·모양을 지킨다)

- 환경변수
  - `AGENTMESH_GATEWAY_URL` — 기본 `http://127.0.0.1:3001` (Docker에서는 서비스명 URL)
  - `AGENTMESH_BRIDGE_TOKEN` — Bearer 공유 시크릿. 양쪽(API·브리지) 동일 값
- 성공 응답 `POST /api/route`:
  `{ userId, category, cast, knowledgeUsed, runIds, credits: { spent, balanceAfter, enforced } }`
- 헬스 `GET /health`: `{ ok: true, service, uptimeSeconds, timestamp }` — 공개(토큰 불필요)
- 에러: `402 { error: "insufficient_credits", balance, required }`,
  `502 { error: "route_pipeline_failed" }`, 브리지 프록시 `403 { error: "forbidden" }` (비-guardian)
- 파일 소유권 (병렬 시 건드리지 말 것)
  - **A**: `rome-apps/agentmesh-bridge/**` + Rome 체크아웃 내 사본
  - **B**: `services/api/**`, `tests/rome-bridge-gateway.test.ts`
  - **C**: Docker compose / `.env` / 운영 스크립트, `ROME-MIGRATION-POC.md §4` 갱신

### 작업 순서

`A ∥ B` (병렬) → `C` (A·B 완료 후)


---

## Part A — 브리지 컴파일·설치 검증 (Rome 스캐폴드 경로)

**목표**: 브리지가 실제 `@rome-os/app-runtime` 타입으로 `tsc --noEmit` 을 통과하고,
Rome의 **실제 앱 설치 경로**(`app_management op:create` → `op:install`)로 등록된다.

**소유권**: `rome-apps/agentmesh-bridge/**` (agentmesh 코어·API는 건드리지 않음)

### ⚠️ 2026-09-23 재설계 — `rome build` 는 **실제로 가능하다** (앞선 "불가" 판단 정정)

> **정정 이력**: 이전 턴에서 "Rome 체크아웃에 `rome` CLI가 없다"고 기재했으나 **오판이었다.**
> `rome` CLI 는 `packages/core` 가 아니라 **`@rome-os/app-web-sdk`** 패키지가
> `bin: { "rome": "./bin/rome.js" }` 로 제공하며, npm 에 정상 배포돼 있다.

| 확인 | 결과 |
| --- | --- |
| `rome` CLI 제공자 | ✅ **`@rome-os/app-web-sdk@0.3.4`** (`bin.rome` = `./bin/rome.js`) |
| `pnpm add -D @rome-os/app-web-sdk@0.3.4` | ✅ `node_modules/.bin/rome` 설치됨 |
| `rome build` 실제 실행 | ✅ **성공** — `dist/web/manifest.json` + `index.js/css` 생성, exit 0 |
| `web/manifest.json` 의 정체 | ✅ **빌드 산출물** — 수동 작성 대상이 아니다 (템플릿도 소스에 없음) |
| `action.yaml` | ❌ **진짜 누락** — `dist/actions/*/action.yaml` 이 없으면 설치 검증 실패 |

> **결론: Part A 는 `@rome-os/app-web-sdk` devDependency 추가 + `action.yaml` 2개 작성으로 닫힌다.**
> `"build": "rome build"` 스크립트는 원래부터 정상이었고, CLI가 없었을 뿐이다.

### 작업

1. **의존성 설치 + 타입 검증** (✅ 완료)
   ```bash
   cd rome-apps/agentmesh-bridge
   rm -rf node_modules && pnpm install   # 손상된 node_modules는 링크가 안 잡힘
   pnpm exec tsc --noEmit                # 0 errors
   ```
   - `tsconfig.json` 을 템플릿과 동일하게 `@rome-os/app-web-sdk/tsconfig.app.json` 을 extend 하도록 전환 (JSX + DOM lib 확보), `types: ["node"]` 유지
   - `createAction`/`defineAction`, `RomeAppApiHandler`, `RomeAppApiRequest`, `RomeAppContext`
     타입은 Rome `@rome-os/app-runtime` 과 정확히 일치함을 확인
2. **`action.yaml` 2개 작성** (✅ 완료 — 템플릿 형식 기준)
   - `src/actions/route/action.yaml` — `sideEffects: write`, `complexity: complex`, `speed: slow`, `reliability: medium`
   - `src/actions/status/action.yaml` — `sideEffects: read-only`, `complexity: simple`, `speed: fast`, `reliability: high`
   - **없으면 설치 검증 실패**: `remix-install-validation.ts:79` 가 `join(root, "action.yaml")` 을 필수로 읽는다
3. **`@rome-os/app-web-sdk` 의존성 추가** (✅ 완료)
   - 이 패키지가 `rome` bin 을 제공한다 (`pnpm build` / `pnpm dev` 둘 다 이걸 요구)
   - 웹 UI 를 위해 `react`, `react-dom`, `@rome-os/ui`, `lucide-react` 도 추가 (템플릿과 동일 버전대)
4. **웹 엔트리 작성** (✅ 완료)
   - `src/web/App.tsx` + `src/web/styles.css` — 브리지의 `GET /status` / `POST /route` 를 조작하는 guardian 전용 화면
   - `GET /status` → `{appId, gatewayOnline, error?}` (게이트웨이 offline 이면 502)
   - `POST /route` → `{category, cast, credits:{spent,balanceAfter,enforced}}`; 402 `insufficient_credits` 는 정상 비즈니스 결과로 표시
   - `app.yaml` 에 `web.entry: App.tsx` 명시 (경로는 `src/` 기준 *상대* 경로 — `web/App.tsx` 로 쓰면 실패한다)
   - `web/manifest.json` 은 **작성하지 않는다** — `rome build` 가 생성한다
5. **zod 이중 의존성 검토** (⏳ 남음)
   - 브리지 소스는 `import { z } from "@rome-os/app-runtime"` 를 쓰므로 `zod@^4.3.6` 직접 의존성은 불필요할 수 있다
   - 제거 가능 여부를 `tsc` 로 판정

### 검증 절차

```bash
cd rome-apps/agentmesh-bridge
rm -rf node_modules && pnpm install
pnpm exec tsc --noEmit          # 0 errors
pnpm test                       # 13/13
pnpm exec rome build            # dist/ 생성
test -f dist/web/manifest.json && echo OK
test -f dist/actions/route/action.yaml && test -f dist/actions/status/action.yaml && echo ACTIONS_OK
```

### 완료 판정 (Exit criteria) — 재설계판

- [x] `tsc --noEmit` 에러 0 — ✅ 실측 (exit 0)
- [x] 브리지 단위 테스트 green — ✅ **13/13**
- [x] **`rome build` 성공, `dist/` 산출** — ✅ **실측 성공** (`@rome-os/app-web-sdk@0.3.4` 가 `rome` bin 제공)
- [x] `action.yaml` 이 `dist` 로 복사됨 — ✅ 실측 확인 (`dist/actions/{route,status}/action.yaml`)
- [x] `dist/web/manifest.json` 생성됨 — ✅ 실측 확인 (수동 작성 대상이 아님)
- [x] agentmesh 코어 코드에 Rome 의존성이 추가되지 않음 (경계 유지) — ✅ 확인
- [ ] zod 직접 의존성 제거 가능 여부 판정
- [ ] `app_management { op: "install" }` 로 대시보드에 노출 — ⏳ Rome 런타임 필요

> ⚠️ Rome 런타임 검증 시 확인할 것: `dist/actions/*/action.yaml` 의 `entry: ./index.ts` 가
> 빌드 산출(`index.js`)로 변환되지 않고 그대로 복사된다. 설치 런타임이 `action.yaml` 의
> `entry` 를 어떻게 해석하는지 확인 필요.

### 상태 표 (2026-09-23 실측 — 3차 갱신)

| 단계 | 상태 | 비고 |
| --- | --- | --- |
| 브리지 소스 배치 | ✅ | `app.yaml`, `src/actions/{route,status}/index.ts` + **`action.yaml`**, `src/api/index.ts`, `src/web/App.tsx` + `styles.css`, `src/lib/gateway.ts` |
| 브리지 `pnpm install` | ✅ | `@types/node@26.6.2` + `@rome-os/app-runtime@0.6.6` + `@rome-os/app-web-sdk@0.3.4` + react/ui 설치 |
| `tsc --noEmit` | ✅ **충족** | exit 0, 에러 0 (`tsconfig` 를 web-sdk 공용 설정 extend 로 전환) |
| 브리지 단위 테스트 (vitest) | ✅ | `pnpm test` → **13/13 pass** |
| `rome build` | ✅ **충족** | **exit 0**. `rome` bin 은 `@rome-os/app-web-sdk` 가 제공한다 |
| `action.yaml` → `dist` 복사 | ✅ | `dist/actions/{route,status}/action.yaml` 생성 확인 |
| `dist/web/manifest.json` | ✅ | 빌드 산출물로 자동 생성 (수동 작성 대상 아님) |

> **정정 이력 (중요)**:
> - 1차: "`tsc ✅ 0 errors`" 로 보고됐으나 실측은 `error TS2688` — 원인은 `pnpm install` 미실행.
> - 2차: "`rome` CLI가 없다 / `rome build` 불가" 로 내가 기재했으나 **오판이었다**.
>   `pnpm install` 을 실제로 하지 않고 클론만 보고 결론지었다. `rome` CLI 는
>   `@rome-os/app-web-sdk` 가 제공하며 npm 에 정상 배포돼 있다.
> - 3차(현재): `@rome-os/app-web-sdk` 추가 + `action.yaml` 2개 + `src/web/` 로 **`tsc`·`rome build` 모두 통과**.
>
> 참고: 루트 `pnpm -r run typecheck` 는 브리지를 **포함하지 않는다** — 브리지는 자체
> `pnpm-workspace.yaml`(`packages: []`)을 가진 별개 workspace라서 `pnpm -r` 이 건너뛴다.

### 다음 단계 (남은 것)

```bash
cd packaging/npm/token-free-gateway/agentmesh/rome-apps/agentmesh-bridge
pnpm exec tsc --noEmit       # 0 errors (재현 확인)
pnpm test                    # 13/13
pnpm exec rome build         # dist/ 생성
```

이미 모두 통과한다. 남은 것은 **zod 직접 의존성 제거 판정**과 **Rome 런타임 설치 검증**
(`app_management { op: "install" }`) — 후자는 Rome dev 스택 필요.

---

## Part B — agentmesh API 계약·인증·테스트 (브리지 접점 확정)

**목표**: API 측 계약을 문서화된 형태로 못 박고, 토큰 가드를 실제로 붙이며, 단위 테스트로 고정한다.

**소유권**: `services/api/**`, `tests/rome-bridge-gateway.test.ts`
(예외: 브리지 `package.json` 의 test 스크립트 1줄만 수정 허용)

### 작업

1. **가드 적용 확인/적용**: `isBridgeAuth` 헬퍼가 실제로 `POST /api/route` 에 걸려 있는지 확인. 안 걸려 있으면 `AGENTMESH_BRIDGE_TOKEN` 설정 시에만 enforcement (미설정 = dev 모드 열림, 현 동작 유지). `GET /health` 는 항상 공개.
2. **계약 고정 테스트**: `tests/rome-bridge-gateway.test.ts` 확장
   - 402(`insufficient_credits`) / 502(`route_pipeline_failed`) 파스스루가 `routeQuestion` 의 `error` 필드로 나오는지
   - 응답 shape (`credits.spent/balanceAfter/enforced`) 이 `RouteResponse` 와 맞는지
   - `AGENTMESH_BRIDGE_TOKEN` 헤더가 `buildHeaders` 로 실제로 나가는지
3. **브리지 test 스크립트 버그 수정**: `rome-apps/agentmesh-bridge/package.json` 의
   `"test": "pnpm --filter @agentmesh/agentmesh ..."` 는 그런 이름의 패키지가 없어 실패 →
   `"test": "cd ../.. && pnpm vitest run tests/rome-bridge-gateway.test.ts"` 로 교체하거나 루트 위임을 문서에 명시.
4. API 타입체크 유지 (`pnpm -r run typecheck` 통과)

### 검증 절차

```bash
cd packaging/npm/token-free-gateway/agentmesh
pnpm vitest run tests/rome-bridge-gateway.test.ts   # 전부 green
pnpm -r run typecheck                               # 에러 0
```

### 완료 판정 (Exit criteria)

- [x] 브리지 단위 테스트 green (신규 케이스 포함) — ✅ 실측 2026-09-23: 브리지 13/13 + `server.test.ts` 18/18 (총 31/31)
- [x] 토큰 가드 동작 고정 (env 설정 시 401/403, 미설정 시 dev 통과) — ✅ 라이브 프로브 5/5: 무자격 401 / 위조 401 / `Bearer b-test` 200 / `x-api-key` 병행 200(`API_KEY` 설정 시) / health 공개 200. `API_KEY` 미설정 시 fail-closed 401 확인. 라이브 서버가 `b-test` 토큰으로 3001에서 기동 중 (`API_KEY=test-key CREDITS_ENFORCED=false AGENTMESH_BRIDGE_TOKEN=b-test`)
- [x] `pnpm -r run typecheck` 통과 — ✅ 실측 2026-09-23: 에러 0
- [x] 브리지 `package.json` test 스크립트가 실제로 동작 — ✅ `cd ../.. && pnpm vitest run ...` 수정 후 `pnpm test` → 13/13

---

## Part C — 라이브 왕복·Docker·PoC 성공조건 판정

**목표**: agentmesh API + Rome dev 스택을 실제로 띄워 PoC 문서 §5 성공조건 4개를 전부 통과시킨다.

**소유권**: Docker compose / `.env` / 운영 스크립트 / `ROME-MIGRATION-POC.md` §4·§5 갱신
**선제조건**: Part A · Part B 완료

### 작업

1. **API 기동**: 루트 `pnpm dev:api` → `127.0.0.1:3001`
   - `curl http://127.0.0.1:3001/health` → `{"ok":true,...}`
   - 토큰 설정 후 `POST /api/route` 왕복 (실제 크레딧 영수증 포함)
2. **Rome dev 스택**: Rome 체크아웃에서 `pnpm dev:all` (Docker Compose) + 브리지 앱 설치
   - 대시보드에서 앱 설치 확인, `route` / `status` action 호출 왕복
   - guardian caller 가드: 비-guardian 요청 → `403 forbidden` 확인
3. **Docker 네트워킹**: Rome compose와 agentmesh compose를 같은 사용자 정의 네트워크로 연결,
   `AGENTMESH_GATEWAY_URL=http://<api서비스명>:3001`, `AGENTMESH_BRIDGE_TOKEN` 양쪽 동일 값
4. **PoC 문서 갱신**: `ROME-MIGRATION-POC.md` §4 "아직 검증 안 된 것" 항목을 통과 표시

### 검증 절차 (PoC §5 성공조건 그대로)

```bash
# 1) 게이트웨이 왕복
curl -X POST http://127.0.0.1:3001/api/route \
  -H 'content-type: application/json' -H "authorization: Bearer $AGENTMESH_BRIDGE_TOKEN" \
  -d '{"userId":"u1","question":"ping"}'          # 200 + credits 영수증

# 2) Rome 대시보드에서 agentmesh-bridge:route / agentmesh-bridge:status 호출 → ok
# 3) Docker: 두 compose가 한 네트워크에서 상호 도달 가능함을 확인
# 4) agentmesh 코드베이스에 Rome 의존성 없음 (A의 조항과 동일 기준)
```

### 완료 판정 (Exit criteria)

- [ ] `POST /api/route` 가 Rome action에서 200 왕복 (크레딧 영수증 포함)
- [ ] Rome 대시보드에서 앱 설치 + action이 모델 툴로 노출
- [ ] guardian 가드 동작 확인
- [ ] Docker 네트워크 상호 도달 확인 (또는 로컬 단일 호스트 대체 검증을 문서에 명시)
- [ ] agentmesh 코어에 Rome 의존성 없음

---

## 위험·주의 (공통)

- **경계를 허물지 말 것**: 브리지는 agentmesh pnpm workspace(`apps/*, packages/*, services/*`)에 넣지 않는다. `rome-apps/` 를 workspace에 추가하는 유혹을 피할 것 — PoC 성공조건이 곧바로 깨진다.
- **zod 이중 의존성**: 브리지의 `zod@^4` 직접 의존성과 `@rome-os/app-runtime` re-export `z` 가 충돌하면 스키마 타입이 어긋난다 (Part A 1차 수정 대상).
- **포트 충돌**: API 기본 3001, 웹 5173. Rome dev 스택 포트는 체크아웃 `pnpm dev:all` 로그에서 확인.
- **402는 에러가 아니다**: 크레딧 부족 402는 정상 비즈니스 결과이므로 브리지가 `status: "error"` 로만 단순화하지 않도록 Part B 테스트에서 고정한다.
- **HOST 환경 확인됨**: Node v26.8.1 / pnpm 11.8.0 / Docker 29.5.3 (2026-09-23). `rome` CLI는 미설치 — Part A가 체크아웃에서 가져와야 한다.


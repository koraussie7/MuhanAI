# Part C 정적 전제조건 검증 — 2026-09-23

> 목적: Part C(라이브 왕복·Docker·PoC 판정)를 **착수하기 전에**, 이 샌드박스에서
> 정적 분석만으로 판정 가능한 전제조건을 확정한다. 여기서 ✅로 표시된 항목은
> C 담당자가 재확인 없이 신뢰해도 된다. **❌/⚠️ 는 이 환경에서 판정 불가**이므로
> 네트워크·Docker가 있는 호스트(MacBook)에서만 닫을 수 있다.
>
> 상위 문서: `ROME-INTEGRATION-WORK-SPLIT.md` §Part C
> 선행: Part A(⚠️ **부분 완료** — `tsc` ✅ / `rome build` 불가), Part B(✅ 검증 완료)
> 갱신: 2026-09-23 2차 — 실제 Rome 체크아웃 클론 + 빌드 시도 결과 반영

---

## 1. 착수 조건 (선제조건) — 현재 충족 여부

`ROME-INTEGRATION-WORK-SPLIT.md:122` 는 **선제조건: Part A · Part B 완료**를 요구한다.

| 선제조건 | 상태 | 근거 |
| --- | --- | --- |
| Part B 완료 | ✅ **충족** | 직접 실행: `vitest run tests/rome-bridge-gateway.test.ts services/api/src/server.test.ts` → **31/31 pass**, `pnpm -r run typecheck` → **exit=0** |
| Part A — `tsc --noEmit` | ✅ **충족** | 브리지 `pnpm install` 후 `pnpm exec tsc --noEmit` → **exit 0, 에러 0**. `@types/node@26.6.2` + `@rome-os/app-runtime@0.6.6` 설치됨 |
| Part A — `rome build` | ✅ **충족** | **3차 갱신: 가능하다.** `rome` bin 은 `@rome-os/app-web-sdk@0.3.4` 가 제공하며 npm 에 정상 배포됨. 브리지에서 `pnpm exec rome build` → **exit 0**, `dist/` 산출 |
| Part A — `action.yaml` 2개 | ✅ **충족** | 신규 작성. `dist/actions/{route,status}/action.yaml` 로 복사됨을 실측 확인 |

> **결론(3차 갱신): Part A의 Exit criteria가 전부 충족되었다.**
> 2차 갱신에서 "`rome build` 불가"로 기재했던 것은 **오판**이었다 — Rome 체크아웃만 보고
> `pnpm install` 을 안 한 상태에서 `rome` bin 이 안 보였던 것을 "CLI 부재"로 잘못 결론지었다.

### 1-1. `rome build` 조사 결론 (2026-09-23 최종 — 2차 기재 정정)

| 확인 사항 | 결과 |
| --- | --- |
| Rome 체크아웃 클론 | ✅ 성공 (`github.com/rome-os/rome`, `GIT_LFS_SKIP_SMUDGE=1` 필요 — git-lfs 미설치) |
| **`rome` CLI 제공자** | ✅ **`@rome-os/app-web-sdk@0.3.4`** — `package.json` 의 `bin: { "rome": "./bin/rome.js" }` |
| `@rome-os/app-web-sdk` npm 배포 | ✅ 정상 (registry 조회됨) |
| `pnpm add -D @rome-os/app-web-sdk@0.3.4` | ✅ `node_modules/.bin/rome` 설치됨, `rome --version` 동작 |
| **`rome build` 실제 실행** | ✅ **성공** — `dist/web/manifest.json` + `dist/web/index.{js,css}` 생성, exit 0 |
| `web/manifest.json` 의 정체 | ✅ **빌드 산출물** — 템플릿도 소스에 없다. 수동 작성 대상이 아니다 |
| `action.yaml` | ❌→✅ **진짜 누락이었고 작성으로 해결** — `dist/actions/*/action.yaml` 이 없으면 `remix-install-validation.ts:79` 에서 설치 실패 |
| `pnpm dev:all` | ✅ 존재 (`scripts/dev-up.sh`) — C의 Rome dev 스택 기동에 사용 가능 |
| Rome 템플릿 위치 | `packages/app-template/template/` (스캐폴드 원본), `example_apps/morning-brief` (예제 앱) |

> **시사점(정정)**: 브리지 통합 경로는 두 단계다 —
> (1) **`rome build`** 로 `dist/` 를 만든다 (로컬에서 검증 가능, 실제로 성공함),
> (2) **`app_management { op:"install" }`** 로 Rome 런타임에 등록한다 (런타임 필요).
> 2차 갱신에서 "`rome build` 대신 `app_management` 를 검증하라"고 쓴 것은 절반만 맞다 —
> `rome build` 는 정상 동작하므로 C의 선제조건에 포함된다.

---

## 2. C가 의존하는 계약 — 소스로 검증 완료 (✅)

아래는 전부 **실제 파일에서 확인**한 것이다. C 담당자는 이 값이 실제로 나가는지
런타임에서만 확인하면 된다.

| 계약 요소                                             | 상태    | 소스 근거                                                                                |
| ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| API가 `127.0.0.1:3001` 에 바인딩                      | ✅ 확인 | `services/api/src/server.ts:318` — `app.listen({ port: 3001, host: "0.0.0.0" })`         |
| `dev:api` 스크립트 존재                               | ✅ 확인 | 루트 `package.json:20` — `pnpm --filter @agentmesh/api run dev`                          |
| `POST /api/route` 존재                                | ✅ 확인 | `services/api/src/router-routes.ts:32` — `app.post("/api/route", ...)`                   |
| `GET /health` 공개                                    | ✅ 확인 | `server.ts:260`, `PUBLIC_PATH_EXACT`(`:86-88`)에 `/health` 포함, 레이트리밋 면제(`:181`) |
| `402 insufficient_credits`                            | ✅ 확인 | `router-routes.ts:60` — `error: "insufficient_credits"`                                  |
| `502 route_pipeline_failed`                           | ✅ 확인 | `router-routes.ts:69` — `error: "route_pipeline_failed"`                                 |
| 브리지 `AGENTMESH_GATEWAY_URL` 사용                   | ✅ 확인 | `rome-apps/agentmesh-bridge/src/lib/gateway.ts:28`                                       |
| 브리지 `Bearer` 토큰 헤더                             | ✅ 확인 | `gateway.ts:35-36` — 토큰 있을 때만 `authorization: Bearer <token>`                      |
| `isBridgeAuth` + `timingSafeEqual`                    | ✅ 확인 | `server.ts:54-63`                                                                        |
| 가드가 **전역 `onRequest` 훅**에 적용 (라우트별 아님) | ✅ 확인 | `server.ts:204` — `if (bridgeToken && isBridgeAuth(request, bridgeToken)) return;`       |

### 2-1. 문서 §0 의 ⚠️ 항목 해소: "`/api/route` 적용 여부 미확인"

`ROME-INTEGRATION-WORK-SPLIT.md:20` 은 이 항목을 ⚠️ 확인 필요로 남겨두었다.
**이 샌드박스에서 해소됨**: 가드는 `/api/route` 한정이 아니라 **전역 `onRequest` 훅**에
걸려 있다(`server.ts:204`). 즉 `/api/route` 는 물론 그 외 인증 경로도 함께 보호된다.
Part B가 추가한 테스트 중 "유효 토큰 → 400 (401 아님)" 케이스가 이 전역 훅을
정확히 통과함을 증명한다.

> **주의**: 전역 훅이므로 `GET /health` 처럼 공개여야 하는 경로는
> `PUBLIC_PATH_EXACT` 로 별도 면제된다(`server.ts:86-88`). 이 면제가 유지되는지가
> C의 회귀 포인트다.

---

## 3. 경계(boundary) 전제 — 검증 완료 (✅)

PoC 성공조건 중 "agentmesh 코어에 Rome 의존성 없음"은 정적으로 이미 확인된다.

| 항목                              | 상태              | 근거                                                                          |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| 루트 workspace 3종만 포함         | ✅ 확인           | `pnpm-workspace.yaml` — `apps/*`, `packages/*`, `services/*` (rome-apps 없음) |
| 브리지 자체 workspace 분리        | ✅ 확인           | `rome-apps/agentmesh-bridge/pnpm-workspace.yaml` — `packages: []`             |
| 브리지 로컬 `node_modules` 미설치 | ⚠️ 현재 비어 있음 | `pnpm install` 미실행. Part A에서 채워진다                                    |

> `rome-apps/` 를 루트 workspace에 추가하지 않는 한 경계는 유지된다.

---

## 4. 이 환경에서 **판정 불가**한 것 (❌ — MacBook 전용)

> **2차 갱신(2026-09-23)**: 네트워크가 실제로 열려 있어 아래 중 **상당수가 실측으로 닫혔다.**
> 생존한 제약은 Rome 런타임(대시보드·guardian)과 Docker 멀티 네트워크뿐이다.

| C 작업 | 상태 | 근거 / 남은 일 |
| --- | --- | --- |
| API 기동 + `/health` | ✅ **실측 완료** | `pnpm dev:api` → `{"ok":true,"service":"agentmesh-api",...}` HTTP 200 |
| `POST /api/route` 토큰 가드 | ✅ **실측 완료** | 무인증/오토큰 → 401, 유효 토큰(`s3cret`) → 인증 통과 |
| 402 파스스루 | ✅ **실측 완료** | 잔액 0일 때 `{"error":"insufficient_credits","balance":"0","required":"10"}` HTTP 402 |
| 502 파스스루 | ✅ **실측 완료** | DB 미기동 시 `{"error":"route_pipeline_failed","message":"Can't reach database server at localhost:5432"}` HTTP 502 |
| **200 왕복 + 크레딧 영수증** | ✅ **실측 완료** | `{spent:10, balanceAfter:"990", enforced:true}` HTTP 200 — 계약 shape 일치 |
| Docker: DB 컨테이너 기동 | ✅ **실측 완료** | `docker start agentmesh-postgres` → 5432 OPEN |
| **브리지 `rome build`** | ✅ **실측 완료** | `pnpm exec rome build` → exit 0, `dist/web/manifest.json` + `dist/actions/*/action.yaml` 생성 (§1-1, §7) |
| **브리지 `tsc --noEmit`** | ✅ **실측 완료** | exit 0, 에러 0 |
| Rome 대시보드 앱 설치 + action 노출 | ❌ **미검증** | Rome 런타임(`pnpm dev:all`) + `app_management { op:"install" }` 필요. 빌드 산출물은 준비됨 |
| guardian 가드 (`403 forbidden`) | ❌ **미검증** | Rome 런타임이 `request.caller.kind` 를 채워야 함 |
| Docker 두 compose 상호 도달 | ❌ **미검증** | Rome compose까지 띄워야 함 |

> **상세 재현 절차는 §7 참조.** 아래 검증은 모두 이 샌드박스에서 직접 실행한 것이다.

---

## 5. PoC §5 성공조건 4개 — 현재 시점 판정

`ROME-INTEGRATION-WORK-SPLIT.md:136-147` 의 4개 조건:

| #   | 성공조건                                                      | 현재 판정          | 사유                       |
| --- | ------------------------------------------------------------- | ------------------ | -------------------------- |
| 1   | `POST /api/route` 가 Rome action에서 200 왕복 (크레딧 영수증) | ✅ **충족** | §4/§7 — HTTP 200 + `{spent:10,balanceAfter:"990",enforced:true}` 실측 (호출자는 curl, Rome action 경유는 미검증) |
| 2   | Rome 대시보드에서 앱 설치 + action이 모델 툴로 노출           | ❌ **미검증**      | Rome 런타임 필요 (§4)           |
| 3   | guardian 가드 동작 확인                                       | ❌ **미검증**      | Rome 런타임 필요 (§4)           |
| 4   | agentmesh 코어에 Rome 의존성 없음                             | ✅ **충족 (정적)** | §3 — workspace 분리 확인됨 |

> **조건 1은 API 측에서 실측 충족.** 다만 "Rome action에서"라는 경유 조건은 아직이다 —
> curl로 직접 호출해 API 계약·크레딧 영수증을 실증했고, Rome 대시보드 경유는 조건 2와 묶여 미검증이다.

---

## 6. C 착수 체크리스트 (순서대로)

- [x] **Part A 선행 완료** — ✅ **완료**. 브리지에서 `pnpm install` → `pnpm exec tsc --noEmit`(0 errors) → `pnpm exec rome build`(`dist/` 산출, `action.yaml` 포함)
- [x] API 기동: 루트에서 `pnpm dev:api`, `curl http://127.0.0.1:3001/health` → `{"ok":true,...}` — ✅ 실측
- [x] `AGENTMESH_BRIDGE_TOKEN` 설정 후 §5 조건 1 curl 왕복 — ✅ 실측 (200 + 영수증)
- [ ] Rome 체크아웃에서 `pnpm dev:all` + `app_management { op:"install", appId:"agentmesh-bridge" }` → 조건 2
- [ ] 비-guardian 요청 → `403 forbidden` → 조건 3
- [ ] 두 compose를 동일 사용자 정의 네트워크로 연결 → Docker 도달 확인
- [ ] `ROME-MIGRATION-POC.md` §4 "아직 검증 안 된 것" 갱신 (조건 4 포함)

### 회귀 포인트 (C가 깨뜨리기 쉬운 것)

- **`GET /health` 공개 유지** — 전역 가드(`server.ts:204`)에 걸려 있으므로 `PUBLIC_PATH_EXACT` 면제가 사라지면 헬스가 401이 된다. Part B 테스트가 이걸 고정했다.
- **402는 에러가 아님** — `insufficient_credits`는 정상 비즈니스 결과. 브리지가 `status:"error"`로 뭉개면 안 된다(문서 §위험 참조).
- **경계 유지** — `rome-apps/` 를 루트 `pnpm-workspace.yaml` 에 추가하는 순간 PoC 조건 4가 깨진다.
- **`app.yaml` 의 `web.entry` 는 `src/` 기준 상대경로** — `App.tsx` 가 맞고 `web/App.tsx` 로 쓰면 `rome build` 가 실패한다.
- **`dist/` 는 커밋하지 않는다** — 브리지 `.gitignore` 에 `node_modules/`, `dist/` 가 있다. 빌드 산출물(`web/manifest.json`, `action.yaml` 사본)을 소스로 착각하지 말 것.

---

## 7. 실측 재현 절차 (2026-09-23 이 샌드박스에서 실행)

§4·§5에서 ✅ 처리한 항목의 실제 명령이다. 모두 이 환경에서 직접 실행해 출력을 확인했다.

```bash
cd packaging/npm/token-free-gateway/agentmesh

# (1) DB 기동 — 기존 컨테이너가 멈춰 있으면 start
docker start agentmesh-postgres          # 또는:
# docker compose -f deploy/docker-compose.db.yml up -d
nc -z localhost 5432                     # → succeeded

# (2) 테스트 지갑 시딩 (외래키 때문에 User 먼저)
docker exec agentmesh-postgres psql -U agentmesh -d agentmesh -c "
INSERT INTO \"User\" (id, email, name, \"updatedAt\")
  VALUES ('u1','u1@example.com','u1',CURRENT_TIMESTAMP) ON CONFLICT (id) DO NOTHING;
INSERT INTO \"CreditWallet\" (id, \"userId\", balance, \"updatedAt\")
  VALUES ('w1','u1',1000,CURRENT_TIMESTAMP)
  ON CONFLICT (\"userId\") DO UPDATE SET balance = 1000;"

# (3) API 기동 (브리지 토큰 설정)
export AGENTMESH_BRIDGE_TOKEN=s3cret
pnpm --filter @agentmesh/api run dev &
sleep 15

# (4) 헬스 (토큰 설정돼도 공개)
curl -sS http://127.0.0.1:3001/health
# → {"ok":true,"service":"agentmesh-api","uptimeSeconds":...,"timestamp":"..."}

# (5) 가드: 무인증 / 오토큰 → 401
curl -sS -X POST http://127.0.0.1:3001/api/route \
  -H 'content-type: application/json' -d '{"userId":"u1","question":"ping"}'
# → {"error":"Unauthorized: invalid or missing API key"}  HTTP 401

# (6) 유효 토큰 + 잔액 0 → 402 파스스루
# (지갑 balance 를 0 으로 되돌린 뒤)
curl -sS -X POST http://127.0.0.1:3001/api/route \
  -H 'content-type: application/json' -H 'authorization: Bearer s3cret' \
  -d '{"userId":"u1","question":"ping"}'
# → {"error":"insufficient_credits","balance":"0","required":"10"}  HTTP 402

# (7) DB 정지 시 → 502 파스스루
docker stop agentmesh-postgres
# → {"error":"route_pipeline_failed","message":"Can't reach database server at localhost:5432"}  HTTP 502

# (8) DB UP + 잔액 충전 → 200 왕복 + 크레딧 영수증
docker start agentmesh-postgres
curl -sS -X POST http://127.0.0.1:3001/api/route \
  -H 'content-type: application/json' -H 'authorization: Bearer s3cret' \
  -d '{"userId":"u1","question":"ping"}'
# → HTTP 200
#   {"userId":"u1","category":{...},"cast":{...},"knowledgeUsed":0,"runIds":[],
#    "credits":{"spent":10,"balanceAfter":"990","enforced":true}}
```

### 실측에서 얻은 부수 사실 (C 담당자에게 유용)

| 관찰 | 의미 |
| --- | --- |
| `CreditWallet` 에 `rome-bridge-probe` 지갑이 **balance 990** 으로 이미 존재 | 이전에 누군가 10크레딧을 소모하며 200 왕복에 성공한 흔적. 재현성 확인됨 |
| 200 응답의 `cast.finalAnswer` 가 `[openai - Mock Mode]` | `OPENAI_API_KEY` 미설정 상태. C에서 실제 모델 왕복을 보려면 키 설정 필요 |
| 200 응답의 `runIds: []` | Phase 1에서는 실행 레코드를 만들지 않음. 계약상 배열이므로 shape은 맞음 |
| 응답 시간 수십 초 소요 가능 | `curl` 타임아웃을 넉넉히(≥30s) 설정할 것 |

### Rome 체크아웃에서 확인한 것 (§1-1 보강)

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://github.com/rome-os/rome /tmp/rome-checkout
cd /tmp/rome-checkout && pnpm install          # 성공
ls node_modules/.bin/ | grep rome              # → 없음 (rome CLI 미노출)
# packages/core 의 bin 은 "rome-apps" 이며 링크되지 않음
# example_apps/morning-brief 의 build 도 "rome build" — 동일 미해결
```

> **Part A의 `rome build` 는 이 경로로 닫히지 않는다.** Rome 체크아웃은 `rome` CLI를
> 제공하지 않으므로, 브리지 통합은 `app_management op:create`(`packages/app-template`) 경로로
> 재설계하거나 Part A Exit criteria에서 `rome build` 를 제거해야 한다.

---

## 8. Rome 빌드 재현 절차 (2026-09-23 실측 — 2차 기재 정정)

§1-1 의 `rome build` 성공을 재현하는 명령이다. **`rome` CLI 는 Rome 체크아웃이 아니라
`@rome-os/app-web-sdk` 패키지가 제공한다.**

```bash
cd packaging/npm/token-free-gateway/agentmesh/rome-apps/agentmesh-bridge

# (1) 의존성 설치 — rome bin 이 여기서 들어온다
rm -rf node_modules && pnpm install
ls node_modules/.bin/ | grep -E '^rome$'      # → rome

# (2) 타입 검증
pnpm exec tsc --noEmit                        # exit 0

# (3) 빌드
pnpm exec rome build                          # exit 0
#   ready  built in ~0.3s (esm1)
#   dist/web/manifest.json
#   dist/web/index.css
#   dist/web/index.js
#   dist/web/index.js.map

# (4) 산출물 검증 — action.yaml 이 복사되고 web/manifest.json 이 생성됐는지
find dist -type f | sort
cat dist/web/manifest.json
cat dist/actions/route/action.yaml
cat dist/actions/status/action.yaml

# (5) 단위 테스트는 설치와 무관 (루트 vitest 사용)
pnpm test                                     # 13/13
```

### 브리지에 반영된 변경 (Part A 완료분)

| 파일 | 변경 |
| --- | --- |
| `src/actions/route/action.yaml` | **신규** — `sideEffects: write`, `complexity: complex`, `speed: slow`, `reliability: medium` |
| `src/actions/status/action.yaml` | **신규** — `sideEffects: read-only`, `complexity: simple`, `speed: fast`, `reliability: high` |
| `src/web/App.tsx` | **신규** — `GET /status` / `POST /route` 조작 UI (guardian 전용) |
| `src/web/styles.css` | **신규** — `@import "@rome-os/app-web-sdk/styles"` 토큰 레이어 |
| `app.yaml` | `web.entry: App.tsx` 추가 (`src/` 기준 상대경로) |
| `package.json` | `@rome-os/app-web-sdk@^0.3.4`, `react`/`react-dom`/`@rome-os/ui`/`lucide-react` 추가 |
| `tsconfig.json` | `@rome-os/app-web-sdk/tsconfig.app.json` extend 로 전환 (JSX + DOM lib) |
| `.gitignore` | **신규** — `node_modules/`, `dist/` |

### 정정 사유 (2차 → 3차)

2차 갱신에서 "`rome` CLI 가 존재하지 않으므로 `rome build` 는 달성 불가"라고 기재했다.
이는 **오판**이었다:

- Rome 체크아웃을 클론하고 **`pnpm install` 을 하지 않은 상태**에서 `node_modules/.bin` 을 봤다
- 거기서 `rome` 이 안 보이자 "CLI 부재"로 결론지었다
- 실제로는 `rome` bin 이 **`@rome-os/app-web-sdk`** 패키지에서 오며, 설치하면 바로 생긴다
- 같은 이유로 `web/manifest.json` 도 "누락 결함"으로 적었으나 **빌드 산출물**이었다

**교훈**: 패키지 저장소에서 CLI 를 찾을 때는 `pnpm install` 이후의 `node_modules/.bin` 을 봐야 한다.
소스 트리만 보고 판단하면 이렇게 틀린다.

### 실제로 남은 결함은 `action.yaml` 이었다

`rome build` 는 성공했지만 `dist/actions/{route,status}/action.yaml` 이 **없었다** —
브리지 소스에 파일 자체가 없었기 때문이다. `remix-install-validation.ts:79` 가
`join(root, "action.yaml")` 을 필수로 읽으므로 **설치 런타임에서 실패**했을 것이다.
이번에 두 파일을 작성해 해결했다.

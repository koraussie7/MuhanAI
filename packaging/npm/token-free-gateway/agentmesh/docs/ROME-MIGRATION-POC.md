# Rome 마이그레이션 PoC — agentmesh → Rome App 브리지

> 목적: `rome-os/rome` (MIT) 을 agentmesh의 "에이전트 환경" 레이어로 채택하기 전에,
> 검증된 인터페이스 위에서 최소 브리지를 동작시키는 PoC. 이 문서는 PoC 범위와
> 실제로 검증한 내용(2026-09-22, rome main @ app-template / app-runtime-sdk 0.6.x)을 기록한다.

## 1. 배경: agentmesh가 Rome에서 얻는 것

| agentmesh 현재 상태 | Rome이 제공하는 것 |
| --- | --- |
| 라우팅/크레딧/지식/MCP 백엔드는 있으나 "에이전트가 자라나는 환경"이 없음 | Action/Agent/App 모델 — 에이전트가 자기 하네스를 만들고 재사용 |
| 영속성·프로덕션 인증은 deferred | 세션/이벤트/정책/persistence가 core에 내장 |
| 웹 대시보드는 자체 구현 | Guardian 전용 대시보드 + App Store 모델 |
| 배포는 자체 wrangler/docker | Docker 퀵스타트 + 셀프호스트 |

방향: **agentmesh를 Rome App으로 노출**한다 (agentmesh를 Rome 안으로 통째로
넣는 것이 아니라, Rome이 agentmesh의 능력을 소비하는 경계를 만든다).

## 2. 검증한 Rome 인터페이스 (rome 소스 직접 확인)

- **앱 매니페스트**: `formatVersion: 2`, `id/name/version`, `appRoot: dist`,
  `api: { entry: api/index }`, `actions: [actions/...]` —
  `packages/app-template/template/app.yaml` 기준.
- **Action**: `defineAction({ config, schema(zod), execute, preview? })` —
  zod 스키마가 JSON Schema(inputSchema)·런타임 검증·정적 타입을 한 번에 생성.
  실행 결과는 닫힌 유니온:
  `{ status: "ok" | "error" | "pending_approval" | "pending_interaction" | "handoff" | "place_widget" }`.
- **API 핸들러**: `RomeAppApiHandler.handle(RomeAppApiRequest)` —
  `request.caller` (guardian | visitor | anonymous)로 신원이 먼저 검증되며
  핸들러는 헤더에서 신원을 유추하면 안 됨. `Response.json`으로 응답.
- **런타임 요구**: Node ≥ 24, pnpm 11.6, Docker Compose (개발 스택 `pnpm dev:all`).

## 3. PoC 아티팩트

`rome-apps/agentmesh-bridge/` — Rome 체크아웃의 `rome_apps/` (또는 example_apps
옆) 에 복사해 붙이면 되는 앱 골격:

```
rome-apps/agentmesh-bridge/
├── app.yaml                      # actions: route, status / api: api/index
├── package.json                  # @rome-os/app-runtime ^0.6.0
└── src/
    ├── lib/gateway.ts            # agentmesh 게이트웨이 클라이언트 (순수 함수, fetch 주입)
    ├── actions/route/index.ts    # POST /api/route → ActionResult
    ├── actions/status/index.ts   # GET /health → ActionResult
    └── api/index.ts              # /route, /status 프록시 (caller 가드)
```

테스트 가능성을 위해 게이트웨이 호출 로직은 `src/lib/gateway.ts`로 분리했고,
이 파일은 agentmesh 워크스페이스의 vitest로 검증한다
(`tests/rome-bridge-gateway.test.ts`, fetch 목업).

## 4. 아직 검증 안 된 것 (PoC 다음 단계)

1. **컴파일**: `@rome-os/app-runtime` 타입이 실제로 설치된 Rome 체크아웃에서
   `rome build` + `tsc --noEmit` 통과. (이 레포에는 Rome 의존성이 없어
   타입 대조만 함 — 템플릿의 `createAction(config, deps)` 시그니처 그대로 사용)
2. **라이브 연결**: agentmesh `services/api` (기본 `127.0.0.1:3001`) 기동 +
   Rome dev 스택 기동 후 action 호출 왕복.
3. **인증**: `/api/route`는 현재 API 키 없이 열려 있음 → Rome 쪽에서는
   `request.caller.kind === "guardian"` 가드로 보호하되, agentmesh 측 공유
   시크릿(예: `AGENTMESH_BRIDGE_TOKEN`) 추가 권장.
4. **Docker 네트워킹**: Rome compose와 agentmesh compose를 같은 네트워크로.

## 5. 판단 기준 (PoC 성공 조건)

- agentmesh의 `POST /api/route`가 Rome action에서 200 왕복 (크레딧 영수증 포함).
- Rome 대시보드에서 앱이 설치되고 action이 모델 툴로 노출됨.
- agentmesh 코드베이스에 Rome 의존성이 새로 생기지 않음 (경계 유지).

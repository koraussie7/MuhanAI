# MuhanAI × Horizon AI Glasses 통합 — 에이전트 실행 계획 (CLAUDE.md)

> 이 파일은 [Horizon AI Glasses](https://github.com/Lewis-L-C/Horizon-AI-Glasses)(Rokid 글래스 + Android)를 MuhanAI 메쉬의 **웨어러블 엣지**로 통합하는 실행 지시서다.
> 전체 설계: `/Users/brianyeon/muhanai/docs/horizon-glasses-integration-design.md` · API 전문: `/Users/brianyeon/muhanai/docs/horizon-glasses-api-contract.md`.
> 상태 갱신일: 2026-10-04.

## 0. 목표

P0 클라이언트 키 제거(Edge 프록시) → P1 27개 음성 액션 MCP 도구화 → P2 DID·P2P 기억 동기화 → P3 접근성 지식 경제.

| 항목 | 상태 |
| --- | --- |
| 설계·API 계약 문서 | ✅ (`docs/horizon-glasses-api-contract.md` §5 완성) |
| 대시보드 메뉴 `Horizon Glasses` (`/horizon-glasses`, network 그룹) | ✅ (`HorizonGlassesPanel.tsx`) |
| P0 `deploy/glasses-api.ts` + worker 배선 | ✅ (10 endpoints, safety guard, KV revoke, credit loop) |
| P0 계약 테스트 | ✅ (`deploy/glasses-api.test.ts`, 7/7 통과) |
| P1 32개 음성 액션 MCP 도구 | ✅ (`deploy/mcp-server.ts` + `handleGlassesTool` dispatch) |
| P2 ed25519-raw-v1 DID + floodsub CRDT 동기화 | ✅ (`pubsub.ts` GLASSES_KNOWLEDGE_TOPIC + LWW merge, `GlassesBridge`) |
| P3 Verify Me → credit-system 루프 + 대시보드 기기 패널 + fediverse 발행 | ✅ (`/knowledge/verify`, `/fediverse/note`, `/glasses-devices` route) |
| OntologyExplorer TS2488 런타임 NaN 버그 수리 | ✅ (`OntologyExplorer.tsx:399`) |

## 1. 불변 원칙 (NON-NEGOTIABLE)

1. Kotlin 앱을 이 모노레포에 병합하지 않는다 — HTTPS/MCP/libp2p 프로토콜 경계로만 연결.
2. 신호등·점자블록 등 **안전 실시간 판정은 온디바이스(TFLite) 고정** — 클라우드·쿼럼 위임 금지.
3. 모델 키는 Worker 시크릿 전용. 레포·기기·프롬프트·지식에 노출 금지.
4. 원본 오디오·연속 프레임 전송 금지. 텍스트, 사용자 명시 동의 이미지(≤512KB), 메타데이터만.
5. Rokid SDK·AMap SDK·Vosk/TFLite 모델 재배포 금지 (MIT 아님, THIRD_PARTY_NOTICES 참조).

## 2. 아키텍처 (한눈에)

```
글래스(Kotlin) — 온디바이스: Vosk ASR · TFLite 안전추론 · ML Kit · TTS
   │  HTTPS /api/glasses/v1/* (device token)          ↕ libp2p (P2)
Edge Worker (deploy/worker.ts) — 키 프록시 · 쿼터 · 라우팅
   └ llm-router(keyless→유료 폴백) · agent-cast(quorum) · mcp · knowledge-base(CRDT) · credit-system
```

## 3. P0 작업 분해 (1–2주)

### 3.1 신규 `deploy/glasses-api.ts`

- `deploy/travel-api.ts`의 `handleTravelApi(request, pathname)` 패턴을 미러링 (CORS·OPTIONS·jsonError 동일).
- 엔드포인트 8종: `POST /devices/register`, `GET /manifest`, `POST /llm/chat`(intent|chat|translate|interpret), `POST /llm/vision`, `POST /quorum/ask`, `GET /knowledge/search`, `POST /knowledge/publish`, `POST /telemetry` — 스키마는 API 계약 §5 그대로.
- 배선: `deploy/worker.ts`의 `/api/*` 블록(현행 73행)에서 `handleTravelApi` → `handleFeedApi` 사이/앞에 삽입. MCP 라우트(`/api/mcp/*`)는 그 이전에 처리되므로 충돌 없음.
- 시크릿(wrangler secret): `DEEPSEEK_API_KEY`, `GLM_API_KEY`(P0 프록시), `GLASSES_DEVICE_SECRET`(기기 토큰 서명).
- 안전 가드: 요청에 safety 태스크(교통·보행 판정)가 포함되면 400 `SAFETY_TASK_FORBIDDEN`.

### 3.2 기기 토큰

- `{deviceId, model, issuedAt, exp}` + `GLASSES_DEVICE_SECRET` 서명, `Authorization: Bearer` 전달.
- 폐기는 KV 블랙리스트. 레이트리밋(기기당): chat 30/5m · vision 6/5m · quorum 6/10m · knowledge 60/5m.

### 3.3 P0 수용 기준 (계약 §7과 동일)

- [x] typecheck 통과, 목업 디바이스 계약 테스트 전 경로 통과 (`deploy/glasses-api.test.ts` 7/7)
- [ ] APK 리버싱 시 모델 키 부재 (device token만 존재)
- [x] 401 재등록 / 429 폴백 / 502 백오프 / SAFETY 거부 / 토큰 폐기 동작 (KV blacklist `revoked:token:*`)
- [ ] 프라이버시 회귀: 원본 오디오·연속 프레임 미전송, 서버 이미지 미저장 (Kotlin 앱 레벨, 범위 외)

## 4. P1–P3 (요약)

| 단계 | 산출물 | 선행 조건 |
| --- | --- | --- |
| P0 | `deploy/glasses-api.ts` (10 endpoints, safety guard, KV revoke, credit loop) + `deploy/worker.ts` 배선 + `deploy/glasses-api.test.ts` | — 완료 ✅ |
| P1 | `deploy/mcp-server.ts` 32개 음성 액션 MCP 도구 + `handleGlassesTool` dispatch | P0 완료 |
| P1 | `packages/glasses-bridge/src/device-adapter.ts` (GlassesBridge class) | P1 도구 카탈로그 완료 ✅ |
| P2 | `pubsub.ts` GLASSES_KNOWLEDGE_TOPIC + LWW CRDT merge + GlassesBridge DID/floodsub/CRDT sync | P1 완료 ✅ |
| P3 | `/knowledge/verify` (Verify Me → credit-system), `/fediverse/note`, `/glasses-devices` 대시보드 패널 | P2 완료 ✅ |

## 5. 파일 지도

| 구분 | 경로 |
| --- | --- |
| 신규(P0) | `packaging/npm/token-free-gateway/agentmesh/deploy/glasses-api.ts` |
| 수정(P0) | `.../deploy/worker.ts` (`/api/*` 배선 + Env) |
| 수정(P0) | `.../wrangler.toml` (GLASSES_KV namespace) |
| 테스트(P0) | `.../deploy/glasses-api.test.ts` (7/7) |
| 신규(P1) | `.../deploy/mcp-server.ts` (32 `glasses_*` MCP tools + `handleGlassesTool` dispatch) |
| 신규(P1) | `.../packages/glasses-bridge/src/device-adapter.ts` — GlassesBridge class |
| 수정(P2) | `.../packages/peer-mesh/src/pubsub.ts` (`GLASSES_KNOWLEDGE_TOPIC` + CRDT types + LWW merge) |
| 신규(P3) | `.../apps/web/src/components/GlassesDevicesPanel.tsx` — device panel dashboard |
| 수정(P3) | `.../apps/web/src/routes.ts` (`glasses-devices` route) |
| 수정(P3) | `.../apps/web/src/components/menu-i18n.ts` (8언어 `glasses-devices` 번역) |
| 완료 | `apps/web/src/components/HorizonGlassesPanel.tsx`, `apps/web/src/routes.ts`, `apps/web/src/components/menu-i18n.ts`, `apps/web/src/components/Sidebar.tsx` |

## 6. 검증 명령

```bash
cd packaging/npm/token-free-gateway/agentmesh
pnpm -r typecheck && pnpm -r test          # CI 게이트
cd apps/web && ./node_modules/.bin/tsx --test src/routes.test.ts src/components/menu-i18n.test.ts src/components/i18n-ui.test.ts src/components/Sidebar.test.ts
npx wrangler dev                            # /api/glasses/v1/manifest 스모크 (P0 배선 후)
```

### P1-P3 검증
```bash
npx tsx --test ../deploy/glasses-api.test.ts   # 계약 테스트 (7/7)
curl https://muhanai.com/.well-known/mcp.json   # 32개 glasses_* 도구 포함 확인
# P2: peer-mesh tests
cd packages/peer-mesh && npx vitest run         # 73/73 통과
```

### 대시보드 메뉴 추가 시 체크 (재발 방지)
- `routes.ts`에 라우트 추가 → `routes.test.ts`의 `ROUTE_COUNT` 갱신 필수.
- `menu-i18n.ts`에 ko 포함 **8개 언어 `items` 번역** 추가 (테스트가 전 언어 존재를 강제).
- `Sidebar.tsx` `iconKey` 추가 시 `Sidebar.test.ts`의 `validIconKeys` 화이트리스트도 갱신.

## 7. 거버넌스

- 브랜치: `feat/<role>/horizon-glasses-p0` — main 직접 push 금지, `AGENT-ONBOARDING.md` 준수.
- PR 본문에 계약 §7 체크리스트 결과 첨부.
- Horizon 저장소에 P0 이슈(호출 URL 교체 + 키 제거) 등록, 양 저장소 상호 링크.

## 8. 참조

- 설계: `/Users/brianyeon/muhanai/docs/horizon-glasses-integration-design.md`
- 계약: `/Users/brianyeon/muhanai/docs/horizon-glasses-api-contract.md`
- 업스트림: https://github.com/Lewis-L-C/Horizon-AI-Glasses (MIT — Rokid/AMap/Vosk/TFLite는 별도 라이선스)
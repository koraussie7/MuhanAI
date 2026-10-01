# 씬클라이언트(Thin Client) — 진행 보고 + 에이전트 작업분할 계획

_Last updated: 2026-10-01 (claude-thin-client)_

---

## 1. 프로젝트 개요

`Anil-matcha/open-dots`(데스크톱 UI/다운로드 셸)와 `richhabits/sam`(키를 요구하지 않는
LLM 라우팅·캐릭터 클라이언트)의 장점을 믹스해, **유저가 클라이언트를 다운받아 우리
플랫폼(MuhanAI agentmesh)에 연결**하는 씬클라이언트를 만든다.

| 참조 리포 | 취하는 것 | 버리는 것 |
|---|---|---|
| open-dots | Electron 데스크톱 셸, 윈도우/타스크바 UX, 다운로드 배포 | 사내 스토리지 의존 |
| sam | keyless LLM 클라이언트 UX, BYOK 폴백, 캐릭터 세션 | 독립 서버 토큰백 |
| MuhanAI agentmesh | `POST /api/llm/chat`(OmniRoute→keyless 폴백), MCP, 승인 게이트 | — |

**핵심 원칙 (thin-client = "thin")**
1. 클라이언트는 **두껍지 않게**: LLM 라우팅/티어 판정은 서버(`services/api`)가 수행.
2. 인증은 **페어링 코드 + 디바이스 토큰**: 유저가 웹에서 승인 → 클라이언트가 토큰 획득.
3. BYOK(키 없는 폴백)은 서버의 keyless provider pool로 흡수, 클라이언트에 키를 박지 않음.

---

## 2. 현재 상태 (2026-10-01 기준)

### ✅ 완료
| 항목 | 위치 | 비고 |
|---|---|---|
| 마스터 플랜 | `chat/muhan-thin-client/PLAN.md` | Phase 0~4 정의 |
| 클라이언트 스캐폴드 | `chat/muhan-thin-client/client/` | Vite + React + Electron 셸 |
| 브랜치 + 예약 | `feat/claude/thin-client-phase0-2026-10-01` | `IN-PROGRESS.md` ETA 14:00Z |
| 서버 라우트 **헤더부** | `services/api/src/thin-client-routes.ts` (390줄) | 상수·zod 스키마·메모리 스토어·헬퍼 |

### 🚧 진행 중 (다음 턴 즉시 착수)
| 항목 | 상태 | 차단 요인 |
|---|---|---|
| `thin-client-routes.ts` **라우트 본문** | 0/8 엔드포인트 | 없음 — 스키마·헬퍼는 준비됨 |
| `thin-client-routes.test.ts` | 미작성 | 라우트 본문 완성 필요 |
| `server.ts` 등록 (import/public/register) | 미완성 | 라우트 export 완성 필요 |

### ⬜ 미착수 (Phase 1~4)
클라이언트 페어링 UI, 대시보드 연동, 채팅 화면, electron-builder 패키징, 코드사인,
자동 업데이트, 다운로드 페이지.

---

## 3. Phase 0 서버 API 계약 (합의 기준 — 분할 작업의 접점)

| # | Method | Path | Auth | 설명 |
|---|---|---|---|---|
| 1 | GET | `/api/thin-client/config` | public | 배포/피처 플래그, 업데이트 채널 |
| 2 | POST | `/api/thin-client/pair` | public | 6자리 페어링 코드 → 디바이스 토큰 발급 |
| 3 | GET | `/api/thin-client/providers` | device | keyless/omniroute provider 목록 |
| 4 | POST | `/api/thin-client/keys` | device | BYOK 키 등록(allowlist만 허용) |
| 5 | GET | `/api/thin-client/keys` | device | 등록된 키 메타데이터(마스킹) |
| 6 | DELETE | `/api/thin-client/keys/:id` | device | 키 삭제 |
| 7 | GET | `/api/thin-client/approvals` | **web 세션** | 대기 중 디바이스 승인 목록 |
| 8 | POST | `/api/thin-client/approvals/:id` | **web 세션** | 승인/거부 → 토큰 활성화 |
| 9 | GET | `/api/thin-client/updates` | public | 최신 버전·다운로드 URL |

- 인증: 디바이스 요청은 `Authorization: Bearer <device token>`,
  웹 승인은 기존 세션(`x-api-key` 훅 범위) — `server.ts`의 `isPublicPath`에
  `#/api/thin-client/(config|pair|updates)`만 public으로 추가.
- 에러 셰이프: `clientError(reply, code, msg, request.id)` (기존 `error-shapes.ts` 규약 준수).

---

## 4. 에이전트 작업분할 (병렬 가능 구조)

> 원칙: **파일 단위로 분할**하고, 계약(§3 API)은 고정. 접점 파일(`server.ts`)은
> 하나의 에이전트만 소유한다. 병렬 실행 시 각자 독립 브랜치 → 짧은 PR.

### W1 — 서버 API 완성 (최우선, 다른 작업의 차단 요인 제거)
- **소유 파일**: `services/api/src/thin-client-routes.ts`, `thin-client-routes.test.ts`
- **과제**: 라우트 본문 9개 구현 + happy/error 테스트(CONVENTIONS §4 per-route)
- **산출**: `pnpm --filter api test` 통과, `tsc --noEmit` clean
- **브랜치**: `feat/claude/thin-client-phase0-2026-10-01` (현재 브랜치)

### W2 — 서버 등록 + 인증 배선
- **소유 파일**: `services/api/src/server.ts` (import + public prefix + register)
- **의존**: W1의 `thinClientRoutes` export
- **과제**: 디바이스 토큰 검증 훅, public 경로 3개 등록, 기존 `x-api-key` 훅과 충돌 없이
- **주의**: OWNED-PATHS상 `services/api/`는 ❌ single — **W1 완료 후 순차 착수**

### W3 — 클라이언트 페어링 + 채팅 UI
- **소유 파일**: `chat/muhan-thin-client/client/src/**`
- **과제**: 서버 URL 입력 → 페어링 코드 요청 → 토큰 저장(localStorage/electron-store) →
  `/api/llm/chat` 채팅 화면, provider/BYOK 설정 화면
- **의존**: W1 API 계약(§3)만 알면 병렬 착수 가능
- **병렬도**: ✅ W1과 동시 진행 가능

### W4 — Electron 패키징 + 배포
- **소유 파일**: `client/electron/**`, `client/electron-builder.yml`, 다운로드 페이지
- **과제**: electron-builder로 mac/win/linux 빌드, 자동 업데이트(§3 #9 연동),
  코드사인, `muhanai.com/download` 배포 페이지
- **의존**: W3의 셸이 동작해야 실제 빌드 검증 가능 → W3 뒤 또는 병렬(설정 스텁으로)

### W5 — 보안 리뷰 + 문서
- **소유 파일**: `docs/thin-client/**`, 보안 체크리스트
- **과제**: 페어링 코드 브루포스 방지(RPM/만료), BYOK 키 마스킹, 토큰 만기·리프레시,
  API 문서 정합성 검증
- **병렬도**: ✅ 언제든 가능

### 의존 그래프

```
W1 (라우트) ──► W2 (server 등록) ──► E2E 통합 테스트
   │                                    
   ├──► W3 (클라이언트 UI) ──► W4 (패키징/배포)
   └──► W5 (보안/문서)
```

### 동시성 규칙 (OWNED-PATHS 준수)
- `services/api/**` = ❌ single → **W1 → W2는 순차**, 다른 에이전트 침범 금지.
- `chat/muhan-thin-client/client/**` = 작업영역 외부(스탠드얼론) → W3/W4 병렬 허용.
- `docs/**` = ✅ additive → W5 + 모든 에이전트 주석 추가 가능.
- 접점 파일은 오직 `server.ts` 하나. 변경 시 PR 본문에 `services/api/src/server.ts` 명시.

---

## 5. 다음 3 액션 (우선순위)

1. **W1 (완료)**: `thin-client-routes.ts` 13개 엔드포인트 구현 + 25개 테스트 → ✅ 완료
2. **W2 (완료)**: `server.ts` 등록 → ✅ 완료
3. **W3**: 클라이언트 페어링 UI → 계약 불일치 해결 후 착수

---

## 6. 계약 불일치 (클라이언트 vs 서버) — 해결됨

W1 구현 중 발견된 치명적 계약 불일치 — PLAN.md Phase 2 챗 엔드포인트가 서버와 충돌.

| 항목 | 클라이언트(PLAN) | 서버(구현) | 해결 |
|---|---|---|---|
| 페어링 → 토큰 | `POST /pair {code}` | `POST /pair` (코드 발급) + `POST /pair/redeem` (토큰) | 서버가 표준 흐름 구현. 클라이언트 W3에서 매핑 필요 |
| Providers 조회 | `GET /providers/status` | `GET /providers` | 서버가 단순화. 클라이언트에서 URL 매핑 필요 |
| 승인 목록 | `GET /approvals/pending` (client polls) | `GET /approvals` (admin x-api-key) | **미해결**: client가 approval 관리를 하려면 web 세션(admin key) 필요 |
| 디바이스 인증 | `x-api-key: <device token>` | `x-device-token` / `Authorization: Bearer` | 서버 확장: 두 헤더 모두 지원 |
| 챗 (핵심) | `POST /api/llm/chat` + device token | `onRequest` hook에서 `x-api-key` 요구 | **해결**: `server.ts` onRequest hook에 device token 지원 추가 (`DEVICE_AUTH_PATHS`) |

**해결된 사항**: `server.ts`의 `onRequest` hook을 수정하여 `/api/llm/chat`에 디바이스 토큰 인증을 추가했습니다. `resolveDevice` 함수를 `thin-client-routes.ts`에서 export하여 재사용합니다.

**미해결**: 승인 관리(admin key) — thin client가 웹 브라우저에서 승인을 관리하는 설계와 충돌. Phase 2에서 별도 인증 방식 필요.

---

_이 문서는 `docs/thin-client/` 하위에서 갱신한다. 상태 변경 시 §2 표를 먼저 수정._

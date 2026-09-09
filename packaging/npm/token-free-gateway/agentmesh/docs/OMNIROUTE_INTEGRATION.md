# OmniRoute 통합 가치 분석

- **분석 대상**: [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) v3.8.51
- **분석일**: 2026-09-09
- **분석자**: Claude (Hound 분석 패턴 적용)

## 1. OmniRoute 개요

| 항목 | 값 |
| --- | --- |
| 라이센스 | MIT (자유 통합) |
| Stars | 63,212 / Forks 8,833 |
| Latest release | v3.8.50 (2026-08-26) / HEAD v3.8.51 |
| 마지막 push | 2026-09-09 (오늘, 매우 활발) |
| Primary language | TypeScript (67 MB) |
| Runtime | Node ≥22.22.2 / Bun 1.4 / Next.js 16.3.3 / React 19.2.8 |
| 핵심 가치 | 356 AI providers (150+ free) 단일 endpoint, 1,312+ 모델, OpenAI-compatible |

### 제공 기능

- **OpenAI 호환 API** (`/v1/chat/completions`) — Claude Code, Cursor, Cline, Codex, Copilot 즉시 연결
- **MCP/A2A 네이티브** — `@modelcontextprotocol/sdk ^1.30.0` 사용
- **RTK + Caveman 압축** — 15-95% 토큰 절감 (평균 89%)
- **19 routing strategies** + Quota-aware 자동 fallback
- **Desktop (Electron) + PWA**
- **Free-tier 라이브 카운터** — ~1.47B 토큰/월 가시화
- **Skills 시스템** — 49개 모듈형 skills (Claude Skills 표준 패턴)

### 아키텍처 핵심 진입점

- `bin/omniroute.mjs` — 메인 CLI
- `bin/mcp-server.mjs` — **stdio MCP 서버 부트스트랩** (핵심)
- `bin/cli/commands/` — 90개 CLI 명령
- `open-sse/mcp-server/server.ts` — 실제 MCP 서버 구현 (`createMcpServer()`)
- `src/lib/` 152 모듈, `src/lib/skills/` 26 skills, `src/lib/db/` 142 모듈
- `src/mitm/` 27 모듈 — MITM 프록시 (Anthropic ↔ OpenAI 변환 등)

## 2. MuhanAI 통합 가치 평가

### 2.1 비교 대상

| MuhanAI 영역 | 현재 | OmniRoute 보강 가능성 |
| --- | --- | --- |
| LLM 호출 | `agent-cast` + `agent-core` | ✅ 356 모델 단일 endpoint |
| MCP 클라이언트 | `hound-mcp-client.ts`, `weknora-mcp-client.ts` | ✅ 6번째 클라이언트로 추가 |
| 라우팅 | `lib/routing/` | ✅ Quota-aware 자동 fallback |
| Skills | `personal-mcp/skills/` | ✅ 49개 OmniRoute skills 패턴 차용 |
| 웹 UI | `apps/web/Dashboard.tsx` | ✅ Free-tier 카운터 위젯 |
| P2P | `agent-mesh` AXL/Yggdrasil | ❌ 영향 없음 (단일 노드) |

### 2.2 통합 시나리오 (우선순위순)

#### 시나리오 (1) personal-mcp 임베드 — ★★★ 가장 저비용

**목표**: Hound 패턴 그대로, OmniRoute를 MCP 서버로 띄우고 personal-mcp 클라이언트로 호출.

- 신규 파일 `packages/personal-mcp/src/omniroute-mcp-client.ts` (Hound와 동일 구조: stdio JSON-RPC, lazy spawn, env 설정, graceful fallback)
- 환경변수: `OMNIROUTE_COMMAND` (default `omniroute-mcp-server`), `OMNIROUTE_ARGS`, `OMNIROUTE_DISABLED`
- PERSONAL_MCP_TOOLS 추가 (2026-09-09 구현 완료, 8개):
  - `omniroute_completion` — 단일/배치 모델 호출 (auto/combo 라우팅 통합)
  - `omniroute_auto_route` — `model: "auto"` 자동 라우팅 (completion에 통합됨)
  - `omniroute_list_models` — 카탈로그 조회
  - `omniroute_compress_prompt` — RTK+Caveman 압축
  - `omniroute_list_combos` — 콤보 카탈로그 (combo 인자 검증 가능)
  - `omniroute_check_quota` — 무료 티어 쿼터 조회
  - `omniroute_web_search` / `omniroute_web_fetch` — 다중 백엔드 검색/추출
  - `omniroute_get_health` — 서버 헬스/서킷 브레이커/캐시
- **비용**: 1-2일 (Hound 임베드 패턴 동일, 테스트 코드 4-5개)
- **이점**:
  - 356 모델 즉시 접근
  - 19 routing strategies 자동 fallback
  - 15-95% 토큰 절감 (평균 89%)
  - Quota-aware 스케줄링 (무료 티어 자동 분산)

#### 시나리오 (2) agent-cast 라우팅 전환 — ★★ 중비용, 영구 가치

**목표**: `agent-cast`의 LLM SDK 호출을 OmniRoute OpenAI 호환 엔드포인트로 라우팅.

- 설정 변경: `OPENAI_BASE_URL=http://localhost:20128/v1`
- 모델 alias 매핑 (Claude → `claude-opus-4` 등)
- **비용**: 1-2일 (설정 + 테스트 회귀 검증)
- **리스크**: agent-cast 기존 통합 테스트 다수 영향
- **이점**: Claude 외 모든 모델 호출이 quota-aware + 자동 fallback

**구현 상태 (2026-09-09)**: ✅ **완료**

- `packages/llm-router/src/index.ts`:
  - `getOpenAI()`: `OPENAI_BASE_URL ?? OMNIROUTE_BASE_URL` 환경변수가 설정되어 있으면 OpenAI SDK의 `baseURL`로 주입. 미설정 시 기존 동작 유지(SDK 기본 endpoint).
  - `generateOpenAI()`: `OPENAI_DEFAULT_MODEL` 환경변수로 default model 오버라이드(미설정 시 기존 `gpt-4-turbo-preview`).
  - `anthropic` / `google` / `p2p` / `local` provider 경로는 무변경. OmniRoute는 OpenAI 호환 surface만 사용.
- `packages/llm-router/src/llm-router.test.ts`: 11개 신규 테스트 추가.
  - `OPENAI_BASE_URL` 적용 확인
  - `OMNIROUTE_BASE_URL` alias 동작 + precedence
  - 둘 다 미설정 시 baseURL 미전달
  - `OPENAI_DEFAULT_MODEL` 적용 + `req.model` 우선순위
  - `OPENAI_API_KEY` 없을 때 mock 폴백 유지 (회귀 안전)
  - `getAvailableProviders()` 동작 유지
  - temperature/max_tokens/usage 회귀 없음
- `agentmesh/.env.example`: `OPENAI_BASE_URL`, `OMNIROUTE_BASE_URL`, `OPENAI_DEFAULT_MODEL` 문서화.

**검증 결과**:
- `pnpm typecheck`: 0 errors
- `pnpm test`: 307 passed, 1 skipped (기존 DATABASE_URL prisma warning 무관, 신규 회귀 0)
- llm-router 패키지 단독: 18/18 passed (keyless 7 + 신규 11)

**운영 가이드**:
```bash
# .env에 추가만 하면 끝
OPENAI_BASE_URL=http://localhost:20128/v1
OPENAI_DEFAULT_MODEL=auto   # 또는 "claude-opus-4" 등
```
- OmniRoute MCP 서버(20128 포트)가 죽어 있어도 OpenAI SDK는 `getOpenAI()`가 `null`을 반환 → `generateMock()` 폴백 (기존 회귀 안전).
- `getAvailableProviders()`는 `OPENAI_API_KEY` 존재 여부만 보므로, OmniRoute 라우팅 활성/비활성에 따라 provider 리스트가 바뀌지 않음.

#### 시나리오 (3) Skills 시스템 차용 — ★★ 학습 가치

**목표**: 49개 OmniRoute skills 중 3-5개 로직 차용 → MuhanAI 자체 skills 강화.

- 후보: `omni-compression` (RTK+Caveman), `omni-routing` (quota-aware), `omni-resilience` (재시도), `omni-cache` (semantic), `omni-cost-usage`
- **비용**: 3-5일
- **이점**: MuhanAI 자체 LLM 라우팅/압축/관측 기능 강화 (OmniRoute 의존 없이)

#### 시나리오 (4) Free-tier 라이브 카운터 UI — ★ UX 가치

**목표**: OmniRoute의 `/dashboard/free-tiers` 카드 패턴 차용 → `apps/web/Dashboard.tsx`에 위젯 추가.

- **비용**: 1-2일
- **이점**: 사용자 free-tier 한도 가시화

### 2.3 라이센스/리스크

- ✅ **MIT 라이센스** — 동일, 자유 통합
- ✅ **매우 활발** — 오늘 push, 8.8K forks, 365 watchers
- ⚠️ **거대 의존성** — next 16, react 19, native binaries → **stdio MCP 클라이언트로만 임베드하여 의존성 격리 필수**
- ⚠️ **`node-gyp` native build** (`src/mitm/tproxy/native/`) — 임베드 시 사용 안 함 (MCP 서버는 빌드된 `dist/open-sse/mcp-server/server.js` 사용)
- ⚠️ **상표/네이밍 충돌** — README에 `MiniMax`라는 LLM 제공자가 언급됨 (현재 AI 모델명과 우연히 동일). 혼동 주의.

### 2.4 종합 추천

**가성비 순위: (1) > (4) > (3) > (2)**

- **즉시 권장**: 시나리오 (1) — Hound와 동일 패턴, 1-2일 투자로 356 모델 접근 + 무료 티어 자동 분산. 리스크 최소.
- **차후 권장**: 시나리오 (4) — UX 가치 높음, 독립적
- **선택적**: 시나리오 (3) — OmniRoute 의존 제거가 목적일 때만
- **신중**: 시나리오 (2) — agent-cast 회귀 리스크, 충분한 테스트 후 진행

## 3. 다음 단계

1. **즉시**: 시나리오 (1) 구현 시작
   - `omniroute-mcp-client.ts` 작성 (Hound 코드 패턴 차용)
   - `tools.ts`에 4개 도구 등록
   - `hound-mcp-client.test.ts` 패턴 차용한 vitest 작성
2. **검증 후**: 시나리오 (4) UX 위젯
3. **필요 시**: 시나리오 (3) skills 차용

## 4. 참고 자료

- [OmniRoute 공식 사이트](https://omniroute.online)
- [OmniRoute v3.8.50 릴리즈](https://github.com/diegosouzapw/OmniRoute/releases/tag/v3.8.50)
- [npm: omniroute](https://www.npmjs.com/package/omniroute)
- [Docker Hub: diegosouzapw/omniroute](https://hub.docker.com/r/diegosouzapw/omniroute)

## 5. 변경 이력

| 날짜 | 작성자 | 내용 |
| --- | --- | --- |
| 2026-09-09 | Claude | 초안 작성 (v3.8.51 기반) |
| 2026-09-09 | Claude | 시나리오 1 보강: `omniroute_compress_prompt` (RTK+Caveman) + `omniroute_list_combos` 추가, 도구 카운트 6→8 |
| 2026-09-09 | Claude | 시나리오 2 구현: `llm-router`에 `OPENAI_BASE_URL` / `OMNIROUTE_BASE_URL` / `OPENAI_DEFAULT_MODEL` 환경변수 와이어업 + 11개 단위 테스트 추가 (총 llm-router 테스트 7→18) |

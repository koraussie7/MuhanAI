# MuhanAI — AgentMesh 작업지시서

이 문서는 다른 에이전트들이 **CI 통과를 가로막는 biome lint 위반**을 해결하기 위한 3개의 작업지시서를 정의합니다. 각 지시서는 **독립적**이지만, 권장 순서는 A → B → C 입니다 (A가 가장 빠르고 위험이 적음).

---

## 진단 요약 (2026-09-07 기준)

`pnpm biome check .` 결과:
- **2,605 errors / 1,707 warnings / 170 infos** = 4,312 violations
- **96%가 빌드 산출물에서 발생**: `apps/web/dist/assets/index-*.js` 단일 파일에 2,486 errors + 1,634 warnings = **4,120 violations**
- 빌드 산출물 제외 시 source 위반: ~180 violations, 70+ 파일에 분산
- source 위반 주요 룰: `noAssignInExpressions` (~25), `noInnerDeclarations` (~30), `useButtonType` (49), `noLabelVar` (32), `useHookAtTopLevel` (23), `noExplicitAny` (34 warnings), `noCommaOperator` (~30)

**핵심 권고**: **먼저 빌드 산출물을 biome에서 제외** (작업 A). 이 한 단계로 CI가 거의 통과합니다.

---

## 작업 A — Biome에서 dist 빌드 산출물 제외 (5분, 위험 0)

### 목적
CI의 `pnpm biome check .`이 `apps/web/dist/`의 번들된 JS/CSS를 검사하면서 발생하는 4,120개의 위반을 제거. **CI를 통과시키기 위한 1차 작업**.

### 배경
`apps/web/dist/assets/index-9FY0-ejJ.js` (번들된 React + Mantine + 모든 의존성)에 biome이 적용되지만, 이 파일은 Vite 빌드 산출물이다. 모든 의존성이 inline되어 있어 `noAssignInExpressions`, `noCommaOperator` 같은 rule이 광범위하게 위반됨. 빌드 산출물은 biome check에서 제외해야 함.

### 변경 대상
- `/Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh/biome.json` (존재하지 않으면 생성)
- 또는 `/Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh/.biomeignore`

### 작업 내용
**옵션 1 (권장)**: `biome.json`에 `files.includes` 추가:
```json
{
  "files": {
    "includes": [
      "**",
      "!**/dist/**",
      "!**/.wrangler/**",
      "!**/build/**",
      "!**/node_modules/**"
    ]
  }
}
```

**옵션 2**: `.biomeignore` 파일 생성:
```
**/dist/**
**/.wrangler/**
**/build/**
```

### 검증 방법
```bash
cd /Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh
npx pnpm@9.15.4 biome check . 2>&1 | tail -5
```
기대 결과: violations 수가 4,312 → ~180으로 감소.

### 완료 조건
- `biome check .` 출력에서 `Found X errors. Found Y warnings.`이 **모두 0이 아니더라도 이전 대비 95% 이상 감소**
- 또는 `pnpm install --frozen-lockfile && pnpm biome check .`이 exit 0으로 통과 (다른 rule fix 후)

### 위험도
- **0**: biome config만 변경, source code 영향 없음
- 단, 다른 에이전트가 `biome.json`을 직접 편집하고 있을 가능성 확인 후 작업 (`git log -- biome.json`)

---

## 작업 B — Source 파일 biome lint 위반 일괄 fix (1–2시간, 위험 낮음)

### 목적
작업 A로 빌드 산출물을 제외한 후 남는 ~180 violations을 fix하여 `pnpm biome check .`을 완전히 통과시킴.

### 주요 위반 파일 (우선순위 순)

| 우선순위 | 파일 | 위반 수 | 주요 룰 |
|---------|------|---------|---------|
| 1 | `apps/web/src/components/DashPages.tsx` | 13 errors | useButtonType, noStaticElementInteractions 등 |
| 2 | `apps/web/src/components/find/ObsidianInspector.tsx` | 7 errors | useKeyWithClickEvents, noLabelWithoutControl 등 |
| 3 | `apps/web/src/components/harvest/A/PeerCanvas.tsx` | 7 errors | a11y + React Hook 규칙 |
| 4 | `apps/web/src/components/harvest/C/SecuritySettings.tsx` | 6 errors | useButtonType, useKeyWithClickEvents |
| 5 | `apps/web/src/components/harvest/B2/ModelHub.tsx` | 5 errors | useButtonType, noArrayIndexKey |
| 6 | `apps/web/src/components/Sidebar.tsx` | 4 errors | useButtonType |
| 7 | `apps/web/src/components/visuals/InteractiveKnowledgeGraph.tsx` | 4 errors | useButtonType, noSvgWithoutTitle |
| 8 | `apps/web/src/components/FederationPanel.tsx` | 3 errors | useButtonType |
| 9 | `apps/web/src/components/harvest/{A,B}/*` | ~30 errors | 같은 패턴 반복 |

### 작업 내용
1. violations을 한 파일씩 fix:
   ```bash
   cd /Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh
   npx pnpm@9.15.4 biome check apps/web/src/components/DashPages.tsx 2>&1 | head -80
   ```
2. `useButtonType` → `<button type="button">` 또는 `<button type="submit">` 명시
3. `useKeyWithClickEvents` → `<div onClick>` → `<button onClick>` 또는 `onKeyDown` 추가
4. `noArrayIndexKey` → 안정적 key 사용
5. `useHookAtTopLevel` → 조건부 hook 사용 자리에 refactor
6. `noExplicitAny` → `unknown` 또는 구체적 타입으로 변경 (eslint-disable 제거)
7. 자동 fix 가능한 것 (`biome check --write`)는 먼저 적용, 나머지는 수동

### 자동 fix로 해결 가능한 것
```bash
npx pnpm@9.15.4 biome check --write .  # 579 파일 fix (이전 시도에서 동작 확인)
```
이전 실행에서 4,292 diagnostics가 auto-fix로 해결됨. **다시 실행하여 미해결 부분만 수동 fix**.

### 검증 방법
```bash
cd /Users/brianyeon/muhanai/muhanai/packaging/npm/token-free-gateway/agentmesh
npx pnpm@9.15.4 typecheck  # 통과 유지
npx pnpm@9.15.4 test       # 통과 유지
npx pnpm@9.15.4 biome check .  # 모든 violations 0 또는 exit 0
```

### 완료 조건
- `pnpm biome check .` exit 0
- typecheck과 test 모두 통과 유지

### 위험도
- **낮음**: UI 컴포넌트의 미세 변경이지만 동작 영향 없음
- 자동 fix가 import 순서, formatting, simple rule violations은 안전
- React Hook 규칙 위반은 수동 refactor 필요

### 주의사항
- 다른 에이전트가 동시에 같은 파일을 편집할 가능성 있음
- 작업 전 `git status`로 충돌 가능 파일 확인
- 한 파일씩 commit하지 말고 패키지별 또는 영역별로 묶어 commit

---

## 작업 C — 미staged 작업 정리 및 commit 가이드 (각자 작업, 위험 없음)

### 목적
다른 에이전트들이 working tree에 남겨둔 unstaged 파일들을 **각자의 책임 영역별로 commit + push**하도록 가이드. CI는 `main` 브랜치의 HEAD에 대해 실행되므로, unstaged 파일은 다음 에이전트가 commit할 때까지 검증되지 않음.

### 배경
`git status` 확인 결과, 다음 unstaged 영역이 있음 (HEAD: 5c254bc 기준):
- **Modified**: 약 60+ 파일 (다른 에이전트들의 W3–W5 작업)
- **Untracked**: ~25 파일 (새로 생성된 파일들)

이 파일들은 **federation-transport의 dep 수정 외에는 모두 다른 에이전트의 작업 영역**. 내가 (cab2ae8) 변경한 3개 파일은 이미 commit + push 완료.

### 책임 영역별 분류

#### C-1: W5 PulseBridge 와이어업 (services/api/src/* + federation-transport/src/*)
**담당 에이전트**: W5를 작업한 에이전트
**파일**:
- `services/api/src/gossip-bridge.ts`, `gossip-bridge.test.ts` (신규)
- `services/api/src/pulse-routes.ts`, `pulse-stream.ts`, `pulse-stream.test.ts` (신규)
- `services/api/src/server.ts` (modified — pulse routes 등록, transport wiring)
- `services/api/package.json` (modified — @agentmesh/p2p dep 추가)
- `packages/federation-transport/src/libp2p-transport.ts`, `handlers.ts`, `protocols/folklore.ts` 등 (W5 변경)
- `packages/federation-transport/types/*` (W5 변경)
- `packages/p2p/src/pubsub.ts` (PulseSource 인터페이스 추가)

**가이드**:
1. `git status`로 본인 영역 확인
2. `git add` 해당 파일만 (scope discipline)
3. `pnpm typecheck && pnpm test` 통과 확인
4. Commit message: `feat(w5): wire pulse bridge SSE <-> libp2p floodsub`
5. Push 후 `gh run watch`로 CI 확인

#### C-2: W4 Credits 패키지 (packages/credits/src/*)
**담당 에이전트**: W4를 작업한 에이전트 (task #5–9 완료자)
**파일**:
- `packages/credits/src/index.ts` (modified)
- `packages/credits/src/reputation.ts`, `reputation.test.ts` (신규)
- `packages/credits/src/credit-account.ts`, `credit-account.test.ts` (신규)
- `packages/credits/src/co-receipt.ts`, `co-receipt.test.ts` (신규)

**가이드**:
1. 파일 staging → typecheck/test → commit `feat(credits): ship reputation + credit-account + co-receipt`
2. 단, **biome lint 위반은 작업 B에서 일괄 처리**이므로 본인 commit에는 lint fix 포함 안 해도 됨

#### C-3: apps/web UI 작업 (apps/web/src/components/*)
**담당 에이전트**: apps/web UI를 작업한 에이전트
**파일**:
- `apps/web/src/App.tsx`, `apps/web/src/components/*` (~30 파일 modified)
- `apps/web/src/hooks/*` (신규)
- `apps/web/src/i18n.ts` (신규)
- `apps/web/package.json` (modified)

**가이드**:
1. **biome lint 위반이 가장 많은 영역** — 작업 B의 우선순위 영역과 일치
2. apps/web 영역만 staging하여 commit
3. biome 위반은 별도 fix commit으로 분리 권장
4. `apps/web/src/components/find/.backup/*`는 `.gitignore`에 추가하고 `git rm` 권장 (백업 파일)

#### C-4: deploy/ 변경 (deploy/mcp-server.ts, deploy/fediverse.ts)
**담당 에이전트**: fediverse bridge 작업자
**가이드**:
1. `deploy/mcp-server.ts`, `deploy/fediverse.ts` staging
2. biome warning 5개 (`noCommaOperator` 등) 함께 fix
3. Commit `feat(deploy): MCP server one-click integration + fediverse warnings cleanup`

#### C-5: docs/ 작업 (docs/*.md)
**담당 에이전트**: documentation 작업자
**파일**: `docs/CODE-INTEGRATION-PLAN.md`, `HAPPY-INTEGRATION-ANALYSIS.md`, `IMPORTABLE-SOURCE-MAP.md`, `INTEGRATED-CODE-PLAN.md`, `WORKTREE-PLAN.md`, `adr/*` (모두 신규)
**가이드**:
1. `docs/` 전체 staging
2. biome은 docs/*.md에 적용되지 않으므로 lint fix 불필요
3. Commit `docs: Phase 2 integration plans + ADR-0001`

#### C-6: client-adapter 신규
**담당 에이전트**: A2 (task #11) 완료자
**파일**: `client-adapter/` 신규 디렉토리
**가이드**: 별도 monorepo로 분리할지 결정 필요. 현재 위치 유지 시 commit `feat(client-adapter): init monorepo`

### 작업 순서
1. **C-5 (docs)** — 가장 안전, lint 무관, 즉시 commit 가능
2. **C-4 (deploy)** — biome warning만 fix하면 됨
3. **C-2 (credits)** — typecheck/test 검증된 패키지
4. **C-1 (W5 services/api)** — 가장 큰 변경, 신중히
5. **C-3 (apps/web)** — 가장 많은 lint 위반, 작업 B와 함께
6. **C-6 (client-adapter)** — 전략 결정 필요

### 완료 조건
- `git status` 가 unstaged 파일을 모두 표시하지 않거나, 각 영역별 commit 완료
- `git log --oneline main`에서 각 작업 영역 commit이 보임
- CI가 `main` HEAD에 대해 통과 (작업 A+B 완료 후)

---

## 종합 실행 순서 (Architect 권장)

1. **작업 A** (5분) — biome.json 또는 .biomeignore로 dist 제외 → CI 위반 95% 감소
2. **작업 B** (1–2시간) — 자동 fix + 수동 fix → biome check 0 violations
3. **작업 C** (각자 작업) — unstaged 영역을 책임자별로 commit + push

이 3개 작업을 모두 마치면:
- `pnpm install --frozen-lockfile` 통과 (cab2ae8에서 이미 fix)
- `pnpm typecheck` 통과 (cab2ae8에서 이미 fix)
- `pnpm biome check .` 통과 (작업 A+B 후)
- `pnpm test` 통과 (137/137 확인됨)

CI가 모든 step을 통과합니다.

---

## 관련 참조

- **현재 HEAD**: `cab2ae8` (fix(federation-transport): add @agentmesh/p2p dep + peerId defaults)
- **biome 진단 데이터**: `/tmp/biome-report.json` (1.16 MB JSON)
- **관련 task**: #30 [in_progress] C2: CI 통과 검증 (작업 A+B 완료 시 completed)
- **다음 단계 (W6)**: docker-compose multi-peer E2E + ADR-0004 update — CI 통과 후 진행

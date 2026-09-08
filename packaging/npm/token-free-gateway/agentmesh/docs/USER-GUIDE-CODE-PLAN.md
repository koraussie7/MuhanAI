# MuhanAI User-Guide 코드 생성 플랜

> **상위 문서**: `docs/user-guide.md` (MuhanAI 공식 사용설명서)
> **인접 문서**: `docs/INTEGRATED-CODE-PLAN.md` (M1~M5), `docs/CODE-INTEGRATION-PLAN.md` (Phase 2~3)
> **작성일**: 2026-09-07
> **대상 독자**: Architect / Builder 페르소나의 다음 마일스톤 설계

이 문서는 **사용자 가이드(3단계 레벨 + Credit 경제)** 를 **엔지니어링 모듈(서비스 / API / UI)** 로 1:1 매핑하는 실행 플랜이다.
추상적인 "credit 시스템", "knowledge base" 같은 용어를 **특정 파일 경로, 함수 시그니처, 데이터 흐름** 으로 풀어낸다.

---

## 0. TL;DR

| 항목 | 결정 |
|---|---|
| 매핑 범위 | 사용자 가이드 §Part 1~3 + §Credit 시스템 (총 4 섹션) |
| 신규 패키지 | **2개** (`@agentmesh/qa-flow`, `@agentmesh/reward-store`) |
| 기존 패키지 활용 | 6개 (`credits`, `knowledge-base`, `p2p`, `agent-mesh`, `personal-mcp`, `muhan-agent`) |
| 프론트엔드 | `apps/web` 에 3개 신규 페이지 (`/explore`, `/studio`, `/forge`) + `/wallet` |
| 백엔드 | `services/api` 에 4개 신규 라우터 (`/questions`, `/answers`, `/knowledge`, `/agents`) |
| 통합 순서 | **P0 Credit Core** → **P1 Explorer** → **P2 Builder** → **P3 Architect** (점진적 가치) |
| 외부 의존 | 없음 (외부 AI 통합 없음, copy-paste UX 모델 유지) |
| ADR 신규 | 3개 (UX-credit 정책, Knowledge 인용권, P2P 컴퓨트 미터링) |

---

## 1. 사용자 가이드 → 모듈 매핑

### 1.1 Part 1 (Explorer) — 5단계 스타터 미션

| 가이드 항목 | 코드 모듈 | 비고 |
|---|---|---|
| ① 질문 탐색 | `services/api/questions.list.ts` + `apps/web/src/pages/explore/` | 정렬/필터 API + 무한 스크롤 UI |
| ② 내 AI에 질의 | (외부, no integration) | copy-paste UX — 의도적 결정 |
| ③ 검토 및 보완 | `apps/web/src/components/AnswerComposer.tsx` | 인용/출처 첨부 헬퍼 |
| ④ 답변 등록 | `services/api/answers.submit.ts` | 답변 본문 + 사용한 AI 라벨 |
| ⑤ 🎁 Credit 획득 | `@agentmesh/credits` (이미 존재) | `awardCredits(recipient, amount, reason)` 호출 |

**신규 패키지**: `@agentmesh/qa-flow` — Question / Answer 도메인 모델 + 리포지토리 인터페이스

### 1.2 Part 2 (Builder) — AI Quorum + Knowledge 발행

| 가이드 항목 | 코드 모듈 | 비고 |
|---|---|---|
| 다중 AI 교차검증 | `apps/web/src/components/QuorumComposer.tsx` | N개 답변 diff/merge UI |
| 옵시디언 스타일 노트 | `@agentmesh/knowledge-base` (이미 존재) | `[[wiki-link]]` 파서 추가 필요 |
| Knowledge 승격 | `services/api/knowledge.promote.ts` | 답변 → 노드 승격 + co-receipt 발급 |
| 인용 royalty | `@agentmesh/credits` 확장 — `royaltyTick` | ADR-0010 신규 |

**확장 모듈**: `@agentmesh/knowledge-base` 에 `wiki-link.ts`, `citation-tracker.ts` 추가

### 1.3 Part 3 (Architect) — Agent + MCP + P2P

| 가이드 항목 | 코드 모듈 | 비고 |
|---|---|---|
| 자율 Agent 공유 | `@agentmesh/agent-mesh` (스캐폴드 있음) | `agent.publish` / `agent.adopt` API |
| MCP 도구 등록 | `@agentmesh/personal-mcp` (이미 router 존재) | 레지스트리 + 채택 미터링 |
| WebGPU/WebRTC 컴퓨트 | `@agentmesh/p2p` (transport/pubsub 존재) | `compute.offer` / `compute.fulfill` |
| P2P 메쉬 참여 | `@agentmesh/p2p` | 기존 transport 활용 |

**신규 라우터**: `services/api/agents.ts`, `services/api/mcp-tools.ts`

### 1.4 Credit 시스템 (공통)

| 가이드 항목 | 기존 코드 | 신규 필요 |
|---|---|---|
| 회원가입 +1,000 | `@agentmesh/credits/credit-account.ts` | `awardWelcomeBonus()` |
| 질문 등록 +100~500 | (없음) | `awardQuestionSeed()` |
| 답변 채택 +300~1,000 | (없음) | `awardAnswerAdoption()` |
| 팩트체크 +20~100 | (없음) | `awardFactCheck()` |
| Knowledge 승격 +1,000~3,000 | (없음) | `awardKnowledgePromote()` |
| Agent 공유 +2,000~5,000 | (없음) | `awardAgentAdoption()` |
| MCP 등록 +3,000~10,000 | (없음) | `awardMcpRegister()` |
| Streak 주간 +1,000 | (없음) | `@agentmesh/credits/streak.ts` 신규 |
| Reward Store 교환 | (없음) | `@agentmesh/reward-store` 신규 패키지 |

**결론**: Credit 지급 정책은 `@agentmesh/credits` 에 **단일 출처(SSOT)** 로 모은다. UI/UX 어디서도 직접 ledger 를 만지지 않는다.

---

## 2. 신규 패키지 / 모듈 명세

### 2.1 `@agentmesh/qa-flow` (신규)

```
packages/qa-flow/
  src/
    domain/
      question.ts        ← Question entity (id, authorId, title, body, tags, status)
      answer.ts          ← Answer entity (id, questionId, authorId, body, aiLabel, sources)
      evaluation.ts      ← FactCheck entity (evaluatorId, answerId, verdict, weight)
      status.ts          ← open / answered / promoted / closed
    repo/
      question-repo.ts   ← interface (PG 구현은 services/api 에서 주입)
      answer-repo.ts
      evaluation-repo.ts
    service/
      submit-answer.ts   ← 답변 등록 + 자동 awardAnswerSeed (소액 사전 보상)
      promote.ts         ← 답변 → Knowledge 승격 트리거
      fact-check.ts      ← 다수 평가 가중 합산 (reputation 가중)
    events/
      answer-submitted.ts, answer-adopted.ts, knowledge-promoted.ts (pubsub contract)
    index.ts
```

**의존성**: `@agentmesh/credits`, `@agentmesh/knowledge-base`, `@agentmesh/shared`
**부존존**: DB 접근 코드 — `services/api` 가 구현체 주입 (port & adapter)

### 2.2 `@agentmesh/qa-flow/src/domain/answer.ts` 인터페이스 (예시)

```ts
export type AiLabel = "chatgpt" | "claude" | "gemini" | "perplexity" | "deepseek" | "human";

export interface Answer {
  readonly id: string;
  readonly questionId: string;
  readonly authorId: string;
  readonly body: string;
  readonly aiLabel: AiLabel;
  readonly sources: ReadonlyArray<{ url: string; title: string }>;
  readonly createdAt: string; // ISO
  readonly adoptionCount: number;
  readonly factCheckScore: number; // 0..1 (Bayesian-EMA)
}

export interface AnswerRepo {
  insert(a: Answer): Promise<void>;
  findById(id: string): Promise<Answer | null>;
  listByQuestion(qid: string): Promise<ReadonlyArray<Answer>>;
}
```

### 2.3 `@agentmesh/reward-store` (신규)

```
packages/reward-store/
  src/
    catalog.ts        ← 상품 카탈로그 (기프티콘, 클라우드 크레딧, 프리미엄 기능)
    redemption.ts     ← redemption entity + state machine (pending → fulfilled → delivered)
    provider/
      toss-gifticon.ts, aws-credits.ts, muhan-premium.ts  ← 외부 provider 인터페이스
    index.ts
```

**결제 흐름**: redemption 생성 → `credits.burn(userId, amount)` → provider fulfill → co-receipt 발급

### 2.4 `@agentmesh/knowledge-base` 확장

추가 파일:

```
packages/knowledge-base/src/
  wiki-link.ts          ← [[Note Name.md]] 파서 (Obsidian 호환)
  citation-tracker.ts   ← 노드 인용 카운터 + royalty 분배 트리거
  promotion.ts          ← Answer → KnowledgeNode 승격 도메인 로직
```

**`citation-tracker.ts` 인터페이스**:

```ts
export interface CitationTracker {
  record(nodeId: string, citingAnswerId: string): Promise<void>;
  getCitationCount(nodeId: string): Promise<number>;
  // 매월 royalty 분배 트리거 (배치 잡에서 호출)
  settleRoyalties(periodStart: string, periodEnd: string): Promise<number>;
}
```

### 2.5 `@agentmesh/credits` 확장

추가 파일:

```
packages/credits/src/
  streak.ts           ← 연속 기여 추적 (일일 기여 → 주간 보너스)
  award-policy.ts     ← 단일 정책 테이블 (가이드 §Credit 표를 코드로)
  royalty.ts          ← 인용 royalty 정산
```

**`award-policy.ts`** — 사용자 가이드의 표를 1:1 코드로:

```ts
export const AwardPolicy = {
  WelcomeBonus: 1_000,
  QuestionSeed: { min: 100, max: 500 },       // 가시성/난이도 기반
  AnswerSeed: 50,                              // 사전 보상 (소액)
  AnswerAdoption: { min: 300, max: 1_000 },    // 채택 시
  FactCheck: { min: 20, max: 100 },            // 정확도/시 의성 기반
  KnowledgePromote: { min: 1_000, max: 3_000 },
  AgentAdoption: { min: 2_000, max: 5_000 },
  McpRegister: { min: 3_000, max: 10_000 },
  WeeklyStreak: 1_000,
} as const;
```

**원칙**: 모든 credit 이동은 `award-policy.ts` 의 상수만 참조한다. UI / 라우터는 절대 hard-coded 숫자를 가지지 않는다.

---

## 3. 프론트엔드 페이지 (apps/web)

```
apps/web/src/pages/
  explore/
    index.tsx              ← 질문 리스트 + 태그 필터
    [id].tsx               ← 질문 상세 + 답변 트리
  studio/
    index.tsx              ← 내 Knowledge 노드 관리
    compose.tsx            ← Quorum Composer (다중 AI diff/merge)
    promote.tsx            ← 답변 → Knowledge 승격 UI
  forge/
    index.tsx              ← 내 Agent/MCP 카탈로그
    publish-agent.tsx
    publish-mcp.tsx
  wallet/
    index.tsx              ← 잔액, 거래 내역, Reward Store 진입
```

**공통 컴포넌트**:

```
apps/web/src/components/
  AnswerComposer.tsx       ← Part 1 ③④ — AI 라벨 셀렉터 + 출처 첨부
  QuorumComposer.tsx       ← Part 2 — N개 답변 side-by-side merge
  CreditBadge.tsx          ← 모든 페이지 상단 잔액 표시
  StreakIndicator.tsx      ← 연속 기여 시각화
  RoyaltyChart.tsx         ← Builder/Architect 전용 — 인용 royalty 차트
```

---

## 4. 백엔드 라우터 (services/api)

```
services/api/src/routers/
  questions.ts     ← list, get, create (사용자/AI 라벨)
  answers.ts       ← submit, list-by-question, adopt (질문 작성자만)
  knowledge.ts     ← list, get, promote (Builder+), record-citation
  agents.ts        ← list, publish, adopt (Architect+)
  mcp-tools.ts     ← list, register, invoke-metering
  wallet.ts        ← balance, history, redeem
  streak.ts        ← current, claim-weekly
```

**라우터 공통 규칙**:
- 모든 mutation 은 `co-receipt` 발급 (immutable audit)
- credit 이동은 `award-policy.ts` 상수만 참조
- 인증은 `@agentmesh/muhan-agent/session-decrypt` 활용 (기존 데몬 인프라)

---

## 5. 페이즈 분할 (점진적 출시)

### P0 — Credit Core Foundation (1~2주)

| 작업 | 산출물 |
|---|---|
| `award-policy.ts` 작성 | 정책 상수 + 타입 가드 |
| `streak.ts` 작성 | 일일 기여 추적 + 주간 정산 |
| `credit-account.ts` 확장 | `awardFor(reason, ctx)` 디스패치 |
| 테스트 | 모든 policy 분기 단위 테스트 |

### P1 — Explorer (첫 Credit UX, 2~3주)

| 작업 | 산출물 |
|---|---|
| `@agentmesh/qa-flow` 신규 패키지 | domain + repo interface |
| `/questions`, `/answers` 라우터 | services/api |
| `apps/web/pages/explore/` | UX 완성 |
| `AnswerComposer.tsx` | AI 라벨 + 출처 |
| Welcome bonus + Answer seed 자동 지급 | hooks |

**완료 조건**: 신규 사용자가 회원가입 → 1,000 크레딧 → 첫 답변 제출 → +50 크레딧 확인

### P2 — Builder (Knowledge 승격, 3~4주)

| 작업 | 산출물 |
|---|---|
| `knowledge-base` 확장 | wiki-link, citation-tracker, promotion |
| `/knowledge` 라우터 | promote API + citation webhook |
| `studio/compose.tsx` | Quorum Composer UI |
| Royalty 정산 배치 | cron job + `royalty.ts` |
| ADR-0010 | 인용 royalty 정책 |

### P3 — Architect (Agent + MCP + P2P, 4~5주)

| 작업 | 산출물 |
|---|---|
| `@agentmesh/agent-mesh` 완성 | publish/adopt 라우터 |
| `@agentmesh/personal-mcp` 레지스트리 | mcp-tools 라우터 |
| `@agentmesh/p2p` compute metering | 채택 단위 카운터 |
| `forge/` 페이지 | Agent/MCP 카탈로그 UI |
| ADR-0011 | P2P 컴퓨트 미터링 정책 |

---

## 6. ADR 후보 (신규 3개)

### ADR-0010: Citation Royalty Distribution
- **결정**: 인용 1회당 원본 노드 작성자에게 `X` credit 분배
- **정책**: 정산 주기 (월간/주간), 비율 (50% 작성자 / 30% 검증자 / 20% 트레저리)
- **참조**: `knowledge-base/citation-tracker.ts`, `credits/royalty.ts`

### ADR-0011: P2P Compute Metering
- **결정**: WebGPU/WebRTC 작업 단위 (task, ms, MB·token) 별 credit 가치
- **정책**: 자체 검증 vs 외부 검증 비율, 분쟁 중재 프로토콜
- **참조**: `p2p/transport.ts`, `credits/award-policy.ts`

### ADR-0012: UX-Credit Policy Single Source
- **결정**: 모든 UI/UX/API는 `award-policy.ts` 상수만 참조
- **이유**: 가이드 표의 숫자가 코드와 어긋나는 사고 방지 (2026-Q3 사용자 가이드 v2 업데이트 시 단일 지점 수정)
- **참조**: `credits/award-policy.ts`

---

## 7. 모듈 의존성 그래프

```
                   ┌──────────────────────┐
                   │   apps/web (UI)      │
                   │   services/api (HTTP)│
                   └──────────┬───────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
   ┌────────────────┐ ┌───────────────┐ ┌───────────────┐
   │ @agentmesh/    │ │ @agentmesh/   │ │ @agentmesh/   │
   │ qa-flow (신규) │ │ knowledge-base│ │ agent-mesh    │
   └────────┬───────┘ └───────┬───────┘ └───────┬───────┘
            │                 │                 │
            └────────┬────────┴────────┬────────┘
                     ▼                 ▼
            ┌────────────────┐ ┌───────────────┐
            │ @agentmesh/    │ │ @agentmesh/   │
            │ credits (SSOT) │ │ reward-store  │
            └────────────────┘ └───────────────┘
                     │
                     ▼
            ┌────────────────────────────────────┐
            │ @agentmesh/p2p + @agentmesh/personal-mcp │
            │ + @agentmesh/muhan-agent (세션/데몬)     │
            └────────────────────────────────────┘
```

**핵심 규칙**: 의존성은 항상 **안쪽 → 바깥쪽** (도메인 → 앱). UI는 도메인을 import 하지만 도메인은 UI를 절대 import 하지 않는다. ADR-0003 의 "8-repo lineage" 원칙을 그대로 따른다.

---

## 8. 검증 전략

### 8.1 단위 테스트
- `award-policy.ts` 의 모든 분기: `awardFor(reason, ctx)` 가 정확한 amount 반환
- `streak.ts` 의 주간 경계 (월요일 00:00 KST 기준)
- `wiki-link.ts` 파서: `[[Note Name.md]]`, `[[Note Name|alias]]`, 중첩 링크
- `royalty.ts` 정산: 작성자/검증자/트레저리 비율

### 8.2 통합 테스트
- `qa-flow` 전체 흐름: 회원가입 → 질문 → 답변 → 채택 → credit 확인
- Knowledge 승격: 답변 → 노드 → 인용 → royalty 트리거
- P2P 컴퓨트: 작업 발행 → 채택 → 작업 완료 → 정산

### 8.3 E2E (Vitest + Playwright)
- `apps/web` 의 각 페이지가 실제 API 와 통신
- credit-badge 가 award 후 즉시 갱신
- wallet 페이지에서 거래 내역 일관성

### 8.4 사용자 가이드 ↔ 코드 트레이스 가능성

| 가이드 행 | 코드 위치 |
|---|---|
| "첫 참여 +1,000" | `award-policy.WelcomeBonus` → `credits/award-policy.ts:11` |
| "답변 채택 +300~1,000" | `AwardPolicy.AnswerAdoption` → `credits/award-policy.ts:14` |
| "Knowledge 승격" | `services/api/knowledge.ts:promote()` → `qa-flow/promote.ts` |
| "[[Note Name.md]] 위키링크" | `knowledge-base/wiki-link.ts` |
| "Streak 주간 +1,000" | `credits/streak.ts:settleWeekly()` |

**원칙**: 사용자 가이드의 **모든 숫자**는 `award-policy.ts` 의 한 줄에서 찾을 수 있어야 한다.

---

## 9. Anti-patterns (하지 말 것)

1. **UI 가 직접 ledger 를 수정한다** — 항상 `credits/award-policy.ts` 의 함수를 통해서만
2. **숫자를 여러 곳에 hard-code 한다** — 가이드 표가 바뀌면 한 곳만 바꿔도 전체가 따라야 한다
3. **외부 AI 와 자동 통합을 추가한다** — 가이드가 명시적으로 "copy-paste UX" 모델. 자동화는 사용자 자율성 침해
4. **Credit 보상을 답변 작성 시점에 모두 지급한다** — 가이드 표는 채택(adoption) 시점에 지급. 답변 등록은 seed (소액) 만
5. **Knowledge 승격을 무료로 허용한다** — 승격 자체가 +1,000~3,000 credit 이벤트. 검증 없는 승격은 인플레이션
6. **WebGPU 컴퓨트를 메인 트랜잭션 경로에 둔다** — `p2p` 의 transport 에 메터링을 얹되, 채택 흐름은 일반 라우터로 분리

---

## 10. 다음 액션 (P0 진입 체크리스트)

- [ ] `docs/adr/0012-ux-credit-policy-ssot.md` 작성
- [ ] `packages/credits/src/award-policy.ts` 작성
- [ ] `packages/credits/src/streak.ts` 작성 + 테스트
- [ ] `packages/credits/test/award-policy.test.ts` 작성
- [ ] pnpm workspace 전체 typecheck + 테스트 통과
- [ ] 첫 커밋: `feat(credits): AwardPolicy SSOT + Streak tracker (P0)`

---

## 부록: 기존 패키지 활용 체크리스트

| 사용자 가이드 섹션 | 활용 패키지 | 추가 필요 |
|---|---|---|
| Part 1 답변 등록 | `@agentmesh/qa-flow` (신규) | 전부 |
| Part 2 Knowledge 발행 | `@agentmesh/knowledge-base` | wiki-link, citation-tracker, promotion |
| Part 3 Agent | `@agentmesh/agent-mesh` | publish/adopt 서비스 |
| Part 3 MCP | `@agentmesh/personal-mcp` | registry/index API |
| Part 3 P2P | `@agentmesh/p2p` | compute metering |
| 세션/인증 | `@agentmesh/muhan-agent` | 그대로 활용 |
| Credit SSOT | `@agentmesh/credits` | award-policy, streak, royalty |
| Reward 교환 | `@agentmesh/reward-store` (신규) | 전부 |

**총 신규**: 패키지 2개 (`qa-flow`, `reward-store`) + `@agentmesh/credits` 확장 + `@agentmesh/knowledge-base` 확장 + 프론트엔드 4개 페이지 + 백엔드 4개 라우터.

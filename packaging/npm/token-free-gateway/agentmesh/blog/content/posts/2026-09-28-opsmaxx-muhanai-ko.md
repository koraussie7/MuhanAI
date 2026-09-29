---
title: "토큰 프리 인프라 액세스: MuhanAI × OpsMaxx가 키를 사용자에게 돌���주는 방법"
slug: "opsmaxx-muhanai-ko"
date: 2026-09-28T10:30:00+09:00
lastmod: 2026-09-28
draft: false
series: ["Network Needs You"]
seriesOrder: 6
categories: ["Engineering", "Integration"]
tags: ["OpsMaxx", "MCP", "P2P", "토큰프리", "승인", "감사", "브리지"]
description: "단 한 ���의 API 키도 보유하지 않은 채로, 토큰 프리 AI 에이전트 메시에 진짜 SSH, SFTP, 데이터베이스, 터널 접근을 추가했습니���. 무엇을 만들었는지, 비용이 얼마였는지, 이음새는 어디인지 공유합니다."
---

브라우저에서 돌아가는 에이전트가 프로덕션 로그를 tail할 수 있다면, 그것은 보안 악몽입니��.
같은 에이전트가 **사용자가 직접 그 한 명령을 승인한 뒤에만** 같은 일을 할 수 있다면, 그것은 유용한 도구입니다.
차이는 기술이 아니라, **비밀이 어디에 있고**, **모델이 행동하기 전��� "예스"가 필요한 사람이 누구인가**입니다.

오늘 [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx) × MuhanAI 통합을 출시합니다. 핵심 수치는 이렇습니다.

- **첫 출시 8개의 읽기 전용 MCP 도구** (`opsmaxx_ssh_list`, `opsmaxx_db_query`, `opsmaxx_vault_list` 등)
- **7개의 쓰기/고위험 도구**는 *타이핑된 문자열 이중 확인*으��� 게이팅 (`opsmaxx_db_write`, `opsmaxx_vault_set` 등)
- **비밀은 브리지를 _한 번도_ 건너지 않습니다.** 로컬 브리지는 메타데이터만 반환 — `hasSecret: true`와 타임스탬프, 절대 키 자체�� 아님
- **단일 계약** (`@agentmesh/opsmaxx-bridge`) 하나가 `agent-daemon`, 웹 대시보드, 데스크탑 셸, Fastify MCP 게이트웨이 모두를 받침. OpsMaxx의 Electron 코드를 import하는 곳은 _없음_. 우리는 포크가 아니라 외부 클라이언트

## 아키텍처, 한 다이어그램

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← 사용자가 프롬프트를 보고, 쓰기를 승인
│  (muhanai.com)   │
└────────┬─────────┘
         │ OpenAI 호환 + MCP
         ▼
┌──────────────────┐  OpsMaxxBridge 계약       ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx 데스크탑  │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • 승인 카드       │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  다른 에이전트 / 다른 머신 / bot.muhanai.com 리스트
```

같은 `OpsMaxxBridge` 인터페이스(`packages/opsmaxx-bridge/src/types.ts`)가 세 군데를 받칩니다.

1. **Fastify MCP 게이트웨이** — `/api/opsmaxx-mcp/rpc`(읽기)와 `/api/opsmaxx-mcp/writes`(쓰기)
2. **데스크탑 셸** — DaedalOS는 이제 전용 `OpsMaxxApp` 윈도우를 가짐. 두 가지 모드: `iframe` (OpsMaxx가 임베드 엔드포인트를 제공할 때), `panel` (없이도 동작)
3. **피어 메시 UI** — `OpsMaxxPeerCard`는 기존 `PeerCanvas`에 OpsMaxx 호스트를 한 줄씩 보여주며, capability 개수는 `RISK` 레지스트리에서 _동��으로_ 도출됨

## 세 개의 위험 클래스로 충분한 이유

통합의 모든 액션은 세 클래스 중 하나에 속하며, `packages/opsmaxx-bridge/src/types.ts`에 _한 번_ 선언됩니다.

```ts
export const RISK: Record<string, RiskClass> = {
  opsmaxx_ssh_list: "safe",
  opsmaxx_ssh_exec: "needs-approval",
  opsmaxx_db_write: "high-risk-needs-double-approval",
  opsmaxx_vault_set: "high-risk-needs-double-approval",
  // …
};
```

`services/api/src/mcp-routes.ts`의 MCP 라우터는 각 도구의 클래스를 조회한 뒤에만 호출을 전달합니다. `safe`는 즉시 실행, `needs-approval`은 단일 human-in-the-loop 카드에서 멈춤, `high-risk-needs-double-approval`은 _타이핑된_ 확인을 요구 — 사용자가 서비스 이름(예: `openai`)을 직접 타이핑해야 함. 일치하지 않으면 `RESULT_DOUBLE_CONFIRM_MISMATCH`(커스텀 JSON-RPC 코드 4002).

감사 로그는 모든 호출 시도를 `argsHash`(인자 SHA-256 해시)로만 기록하고, raw 인자는 _기록하지 않습니다_. 따라서 ���밀은 로그에 새지 않으면서 모델 결정을 사후에 재구성할 수 있습니다.

## 구조적으로 보장되는 세 가지 속성

1. **비밀은 브리지를 절대 건너지 않는다.** `bridge.vault.list()`는 `VaultEntry[]`를 반환하며 각 항목은 `hasSecret: boolean`과 타임스탬프만 가짐. 에이전트는 `hasSecret: true`만 보고 키는 _모름_. 브리지 API는 `vault.set` 경로에서만 비밀을 ���는데, 그것 자체가 `high-risk-needs-double-approval`
2. **신원은 OpsMaxx에서 차용하지 않는다.** 오너 확인은 여전히 `services/api/src/list-routes.ts:resolveOwner`가 검증하는 HMAC `Authorization: Bearer <token>`을 통해 이루어짐. OpsMaxx는 *자격증명 브리지*이지 *신원 발행자*가 아님
3. **OpsMaxx의 코드를 링크하지 않는다.** OpsMaxx는 out-of-process로 실행됨. 우리는 외부 클라이언트이지 포크가 아님. 두 프로젝트 모두 MIT 유지

## 트랙을 병렬로 유지한 방법

작업은 6개의 독립 트랙으로 나뉘었고, 각 트랙은 다른 에이전트가 담당했으며 `T1`(브리지 계약)만 블로커였습니다.

| 트랙                 | ���당            | 일수 | 파일                                                                |
| -------------------- | ---------------- | ---- | ------------------------------------------------------------------- |
| T1 (브리지 + mock)   | bridge-author    | 5    | `packages/opsmaxx-bridge/src/{types,mock,factory,ipc,transport}.ts` |
| T2 (볼트 동기화)     | vault-engineer   | 10   | `packages/agent-daemon/src/opsmaxx-vault-adapter.ts`                |
| T3-A (MCP safe)      | mcp-shaper-safe  | 7    | `services/api/src/opsmaxx-mcp-routes.ts`                            |
| T3-B (MCP write)     | mcp-shaper-risky | 7    | `services/api/src/opsmaxx-mcp-writes.ts` + 감사 로그                |
| T4 (P2P UI)          | mesh-ui          | 10   | `apps/web/src/components/harvest/A/OpsMaxxPeerCard.tsx`             |
| T5 (데스크탑 임베드) | desktop-ui       | 14   | `apps/desktop/src/components/DesktopApps/OpsMaxxApp.tsx`            |
| T6 (다국어 문서)     | docs-i18n        | 10   | 9개의 `README.*.md` + index                                         |

T3는 진행 중 표면이 원래 추정�� 두 배라는 게 드러나자, T3-A(읽기 전용)와 T3-B(쓰기 + 감사)로 분할했습니다. 분할은 wall-clock으로 1주를 아꼈고, 두 트랙이 공유하는 파일이 `services/api/src/mcp-routes.ts` 하나뿐이라 머지 충돌은 없었습니다(머지 순서 규칙이 결정적 — T3-B가 T3-A의 config edit을 포함하고, T3-B의 리뷰어가 결합 커밋을 머지).

전체 계획은 [`docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md`](https://github.com/koraussie7/MuhanAI/blob/main/packaging/npm/token-free-gateway/agentmesh/docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md)에 있습니다.

## 숫자로 본 결과

- **2,400 줄의 TypeScript** — 브리지, 볼트 어댑터, MCP 라우���, 감사 로그, 피어 카드, 데스크탑 윈도우, 테스트 합계
- **49 tests pass** — opsmaxx-bridge, agent-daemon, web 패키지에서
- **9개국어 README** (영문 + ko/zh/ja/es/fr/de/pt/ar)
- **1 ADR** ([0010](https://github.com/koraussie7/MuhanAI/blob/main/packaging/npm/token-free-gateway/agentmesh/docs/adr/0010-opsmaxx-bridge.md)) — 다음에 브리지를 만지는 사람이 무엇이 협상 가능하고 무엇이 아닌지 알 수 있도록 계약을 고정

## 아직 열�� 있는 것

- **OpsMaxx 임베드 엔드포인트.** 대시보드의 `iframe` 모드는 OpsMaxx 메인테이너의 안정 URL을 기다리는 중. `panel` 모드는 그 없이도 동작. 연락 이메일은 [`docs/agentmesh/OPSMAXX-CONTACT.md`](https://github.com/koraussie7/MuhanAI/blob/main/packaging/npm/token-free-gateway/agentmesh/docs/agentmesh/OPSMAXX-CONTACT.md)
- **감사 로그는 in-process.** 기본 싱크는 `pino.info`. 다음 단계는 append-only 파일 싱크�� 출시해 데몬 재시작 후에도 감사 항목이 살아남게 하는 것
- **`mcp.invoke` 알림 라우팅.** OpsMaxx 측에서 알림 페이로드 형태를 확정하지 않아 wire-side 디스패처는 오늘날 도구 이름을 무시함. 로컬 ��독 맵은 이름으로 키잉되므로 향후 wire 변���은 1줄 수정으로 끝남

만약 토큰 프리 에이전트 메시를 같은 형태로 만들고 있다면, 복사해야 할 것�� 브리지뿐입니다. 계약은 14개의 메서드 시그니처와 하나의 `RISK` 테이블. 나머지 통합은 *풀*이고, 풀은 사용자를 위해 직접 작성하는 부분입니다.

# MuhanAI × OpsMaxx 통합 — 한국어 (Korean)

> 이 문서는 [README.md](../README.md)의 한국어 번역본입니다. 영문 원본이 항상 최신입니다.

## 무엇을 얻게 되나요

MuhanAI 에이전트 메시가 이제 사용자를 대신해 **실제 인프라를** 조작할 수 있습니다 — 그리고 **API 키는 사용자의 머신을 떠나지 않습니다**.

| 기능 | 에이전트가 할 수 있는 일 | 머신에 남는 것 |
|---|---|---|
| SSH | 세션 열기, 명령 실행, 로그 tail | 모든 명령은 사용자 승인 후에만 |
| SFTP | 파일 읽기/쓰기 | 쓰기는 사용자 승인 후에만 |
| 데이터베이스 | SELECT 쿼리 실행, 변경 적용 | 변경은 *이중* 승인 필요 |
| 터널 | SOCKS5 / WireGuard / OpenVPN | 열기 전마다 사용자 승인 |
| Vault | 메타데이터 읽기, 새 비밀 저장 | 비밀은 OpsMaxx 호스트를 떠나지 않음 |

## 어떻게 동작하나

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← 사용자가 프롬프트를 보고, 쓰기 작업을 승인
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

## 위협 모델 — 한 단락 요약

브라우저 에이전트의 가장 위험한 실패 모드는 모델이 사용자 몰래 `DROP TABLE users;`를 실행하는 것입니다. 통합은 모든 작업을 세 가지 위험 클래스(`safe` / `needs-approval` / `high-risk-needs-double-approval`)로 분류하며, 각 도구의 클래스는 `packages/opsmaxx-bridge/src/types.ts`의 `RISK` 맵에서 한 번 선언됩니다. MCP 레이어는 `mcp-routes.ts`에서 그 클래스를 조회해 기존 human-in-the-loop 가드를 통과시킨 후 OpsMaxx로 전달합니다. 감사 로그는 모든 호출을 기록하므로 사후에 모델 결정을 재구성할 수 있습니다.

## 빠른 시작 (개발자)

```bash
# 1. OpsMaxx 설치 (무료, MIT, 계정 불필요)
#    https://github.com/OpsMaxx/OpsMaxx
#
# 2. 에이전트가 사용하게 할 SSH/DB/볼트 항목을 추가
#    각 항목은 MuhanAI 대시보드의 "Trusted peer"로 표시됩니다
#
# 3. MuhanAI agent-daemon을 로컬에서 실행
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## 빠른 시작 (최종 사용자)

1. [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx)를 설치합니다.
2. [muhanai.com](https://muhanai.com)에 로그인하여 *Trusted peers* 페이지를 엽니다 (P2P → OpsMaxx).
3. OpsMaxx에서 뜨는 승인 카드의 "Approve"를 클릭해 로컬 OpsMaxx 인스턴스를 페어링합니다.
4. 실제 인프라가 필요한 무엇이든 에이전트에게 요청합니다. 승인 카드를 지켜봅니다.

## 트랙 상태

- **T1** (브리지 계약 + mock): 완료
- **T2** (볼트 양방향 동기화): 완료
- **T3-A** (MCP 안전 표면): 완료
- **T3-B** (MCP 쓰기 표면 + 감사): 진행 중
- **T4** (P2P 메시 UI): 완료
- **T5** (DaedalOS 임베드): 완료
- **T6** (다국어 문서): 이 문서

## 라이선스

두 프로젝트 모두 MIT.

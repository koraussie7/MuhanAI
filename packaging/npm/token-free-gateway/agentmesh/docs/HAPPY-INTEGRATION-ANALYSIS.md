# Happy → MuhanAI Client Adapter Integration Analysis

> **결론**: Happy를 fork하지 않는다. **MuhanAI Happy Adapter**(thin wrapper)만 작성하고, 사용자는 **공식 Happy 바이너리/앱을 그대로 다운로드** 받아 MuhanAI backend endpoint만 가리키게 한다.

- 작성일: 2026-09-07
- 대상 의사결정: `token-free-gateway/` 레벨
- 선행: `docs/CODE-INTEGRATION-PLAN.md` (AgentMesh Phase 2b 완료), `docs/IMPORTABLE-SOURCE-MAP.md` (출처 매핑)

---

## 1. 왜 fork가 아닌 adapter인가

| 접근 | 장점 | 단점 |
|---|---|---|
| **Happy fork** (full copy) | 자유로운 수정 | upstream PR 못 받음, React Native 빌드/배포 부담, 모바일 인증/Firebase/push 설정까지 자체 관리 |
| **Happy submodule** (vendored) | upstream 동기화 가능 | 충돌 해결 부담, RN 빌드는 우리 monorepo에 통합 안 됨 |
| **✅ MuhanAI Adapter + Thin Client Download** (추천) | 코드 0 fork, Happy 공식 빌드를 그대로 사용, MuhanAI는 server endpoint만 제공 | Happy UI 변경에 맞춰 adapter 갱신 필요 (단, surface가 작아서 부담 적음) |

핵심 관찰: **Happy의 가치는 (1) RN UI 코드와 (2) happy-agent/happy-cli CLI 로직**이다. 우리는 (1)을 재구축하지 않고 사용자에게 **Happy 공식 앱을 다운로드** 받고, (2)의 일부(machine spawn / session sync)를 **MuhanAI Adapter**로 대체한다.

---

## 2. 모듈 매트릭스: fork / adapt / replace / ignore

```
┌─────────────────────┬────────────┬─────────────────────────────────────────┐
│ Happy 모듈           │ 처리       │ 이유                                     │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ happy-app           │ ignore     │ 공식 빌드를 사용자에게 그대로 다운로드     │
│ (RN + Tauri)        │            │ 시킴. 우리가 빌드/배포 안 함.              │
│                     │            │ Firebase/push/EAS = Happy 책임.           │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ happy-cli           │ adapt      │ thin adapter `@muhanai/client` (TypeScript) │
│ (remote control)    │            │ 작성. happy-agent의 session/machine      │
│                     │            │ control 표면을 MuhanAI API로 라우팅.       │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ happy-agent         │ replace    │ MuhanAI `muhan-agent`로 자체 작성.        │
│ (local daemon)      │            │ Agent Mesh의 machine router가 직접 spawn. │
│                     │            │ happy-agent의 model harness 개념만 차용.  │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ happy-server        │ replace    │ MuhanAI Gateway가 server 역할.             │
│ (WebSocket relay)   │            │ Happy의 E2E sync 프로토콜을 adapter가     │
│                     │            │ MuhanAI wire protocol로 bridge.            │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ happy-server-       │ ignore     │ 사용 안 함. MuhanAI는 자체 self-host.     │
│ self-host           │            │                                         │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ happy-wire          │ reference  │ wire protocol (E2E encrypted blob)        │
│                     │            │ 스펙만 참고. MuhanAI는 자체 wire 채택.     │
├─────────────────────┼────────────┼─────────────────────────────────────────┤
│ codium              │ ignore     │ 관련 없음.                                │
└─────────────────────┴────────────┴─────────────────────────────────────────┘
```

라이선스: 모든 패키지 MIT. happy-app LICENSE 확인됨.

---

## 3. 권장 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│  User Devices                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ iOS/Android  │  │ macOS/Win    │  │ Web          │           │
│  │ (Happy 공식) │  │ (Happy+Tauri)│  │ (Happy Web)  │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │ HTTPS           │ HTTPS           │ HTTPS              │
│         ▼                 ▼                 ▼                    │
│  ┌──────────────────────────────────────────────────┐           │
│  │  MuhanAI Happy Adapter (download-time patch)     │           │
│  │  - endpoint URL: api.muhanai.com                  │           │
│  │  - project name injection: "MuhanAI"             │           │
│  │  - bundle id patch: app.muhanai.client           │           │
│  │  - splash/logo swap                              │           │
│  │  - settings panel: MuhanAI-specific              │           │
│  └──────────────────────────────────────────────────┘           │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS / WSS
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  MuhanAI Server (muhanai-com)                                   │
│  ┌──────────────────────────────────────────────────┐           │
│  │  MuhanAI Gateway (replaces happy-server)         │           │
│  │  - WebSocket sync (encrypted blobs)              │           │
│  │  - machine registry (which Mac/Server is online) │           │
│  │  - session routing (session → machine → agent)   │           │
│  │  - push notification fan-out                     │           │
│  └──────────────────────────────────────────────────┘           │
│  ┌──────────────────────────────────────────────────┐           │
│  │  Agent Mesh (current agentmesh/ packages)        │           │
│  │  - Agent Router: coding/browser/research/...      │           │
│  │  - p2p transport + reputation (Phase 2b ✅)      │           │
│  │  - credits / reputation / receipt (Phase 2b ✅)  │           │
│  └──────────────────────────────────────────────────┘           │
└──────────────────────────────┬───────────────────────────────────┘
                               │ libp2p / WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Local Machines (user's devices running agents)                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │  muhan-agent (replaces happy-agent)               │           │
│  │  - local daemon                                  │           │
│  │  - spawns Claude Code / Codex / Gemini runtime   │           │
│  │  - MCP integration                               │           │
│  │  - registers self with MuhanAI Gateway           │           │
│  └──────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. MuhanAI Happy Adapter 상세

**목적**: Happy 공식 빌드를 그대로 다운로드 받아 **MuhanAI 인스턴스에 연결**하기 위한 thin wrapper.

### 4.1 Adapter가 노출하는 surface (3가지)

#### A. Endpoint Injection
Happy는 빌드 타임에 server URL을 환경변수로 받음. Adapter는 Happy를 다운로드 받은 후 다음을 patch:

```bash
# 사용자가 macOS에서:
curl -fsSL https://get.muhanai.com/client.sh | sh
# → Happy 공식 dmg 다운로드
# → 설치 후 endpoint를 api.muhanai.com으로 설정
# → bundle id를 app.muhanai.client.*로 변경 (별도 업데이트 채널 확보)
```

이건 **빌드 변형이 아니라 설정 + post-install 스크립트**다. 코드 fork 0.

#### B. MuhanAI Patches (build-time patch via patch-package)

```diff
# happy-app/app.json (patches/app.json.patch)
-  "name": "happy",
+  "name": "muhanai-client",
   "slug": "happy",
-  "extra": { "serverUrl": "https://api.happy.engineering" }
+  "extra": { "serverUrl": "https://api.muhanai.com" }
```

Adapter monorepo에는 **이 patch 파일만** 포함한다. happy-app 소스는 vendored하지 않는다.

```json
// muhanai-happy-adapter/patches/app.json.patch
{
  "name": "muhanai-client",
  "slug": "happy",
  "extra": { "serverUrl": "https://api.muhanai.com" }
}
```

`postinstall: patch-package`로 적용. happy-app 업데이트 시 `patch-package`가 자동으로 rebase.

#### C. MuhanAI-specific Settings Panel

Happy는 `Settings → About` 화면이 있음. Adapter는 post-install script로 **MuhanAI-specific settings route**를 추가:

```
Settings
├── (Happy 기본)
├── About
├── ...
└── MuhanAI                  ← Adapter 주입
    ├── Account (linked to muhanai.com)
    ├── Machines (Agent Mesh)
    ├── Credits
    └── API Keys (vault로 격리 — Discussion #680 해결)
```

이건 코드 patch가 필요한 부분이지만 surface는 1개 라우트 + 약 4개 컴포넌트로 한정.

### 4.2 Adapter 모노레포 layout 제안

```
agentmesh/                            ← (현재 monorepo)
├── packages/
│   ├── p2p/                          ✅ Phase 2b
│   ├── credits/                      ✅ Phase 2b
│   ├── shared/
│   ├── gateway/                      ← [NEW] MuhanAI Gateway (replaces happy-server)
│   ├── muhan-agent/                  ← [NEW] local daemon (replaces happy-agent)
│   └── ...
└── ...

client-adapter/                      ← [NEW monorepo, 분리 권장]
├── packages/
│   ├── adapter-core/                 ← patch-package patches + post-install scripts
│   ├── adapter-settings/             ← MuhanAI-specific settings panel
│   └── adapter-release/              ← signed dmg/apk/ipa build pipeline
├── patches/                          ← happy-app source diffs
│   ├── app.json.patch
│   └── settings-route.tsx.patch
└── scripts/
    ├── download-happy.sh
    ├── patch.sh
    └── verify.sh
```

**왜 별도 monorepo인가**: happy-app은 React Native + Expo + EAS 빌드 파이프라인을 강제한다. agentmesh monorepo(주로 Node.js 백엔드)와 toolchain이 충돌. 격리가 깔끔하다.

---

## 5. muhan-agent 설계 (happy-agent 대체)

happy-agent의 책임:

> 로컬 머신에서 Claude/Codex/Gemini harness를 통합 관리하고, MuhanAI Gateway에 자기 자신을 등록.

### 5.1 모듈 분리

```
muhan-agent/
├── src/
│   ├── daemon.ts              ← libp2p host (현재 agentmesh/p2p 활용)
│   ├── machine-registry.ts    ← 자기 자신을 Gateway에 announce
│   ├── session-spawner.ts     ← Claude/Codex 프로세스 spawn
│   ├── mcp-router.ts          ← MCP tool routing
│   └── credentials-vault.ts   ← API keys 격리 저장 (Discussion #680 해결)
└── bin/
    └── muhan-agent.mjs
```

### 5.2 Machine Registry 프로토콜

```
machine → gateway:
  REGISTER { machineId, hostname, capabilities, agentVersions, libp2pPeerId }
  HEARTBEAT { machineId, uptime, activeSessions }
  ANNOUNCE_SESSION { sessionId, agent, model, workingDir }
  STREAM_OUTPUT { sessionId, chunk }
  EXIT_SESSION { sessionId, exitCode }

gateway → machine:
  SPAWN { sessionId, prompt, model, workingDir }
  INTERRUPT { sessionId }
  ATTACH { sessionId } (machine-to-machine remote attach)
```

### 5.3 credentials-vault (Discussion #680 해결)

Happy의 보안 문제: API key가 client에 평문 저장.

해결:

```ts
// muhan-agent credentials-vault
// API keys는 OS keychain에 저장 (macOS Keychain, Windows Credential Manager, Linux libsecret)
// 절대 평문 파일로 저장하지 않음
// Gateway에 절대 전송하지 않음
// LLM 호출은 로컬 daemon이 수행 → 결과만 Gateway로
```

이렇게 하면:

- Happy UI는 session을 표시만 함 (key는 모름)
- muhan-agent daemon이 key 보관 + LLM 호출
- Gateway는 결과 stream만 받음 (zero-knowledge for keys)

**이것이 fork 대비 adapter의 진짜 가치**: 보안 모델을 우리가 통제.

---

## 6. MuhanAI Gateway (happy-server 대체)

### 6.1 책임

| 책임 | 설명 |
|---|---|
| WebSocket sync | encrypted session blob fan-out (Happy client ↔ machines) |
| Machine registry | 어떤 Mac/Server가 online인지 추적 |
| Session routing | session ID → target machine → agent spawn |
| Push notification | mobile Happy 앱에 session 업데이트 푸시 |
| Auth | MuhanAI user account ↔ machine ↔ session ACL |

### 6.2 Agent Mesh 통합

현재 `agentmesh/packages/p2p/`의 libp2p transport를 Gateway가 사용:

```ts
// packages/gateway/src/server.ts (개념)
import { createTransport } from "@agentmesh/p2p";
import { PeerReputationRegistry } from "@agentmesh/p2p";

const transport = await createTransport({
  privateKey: gatewayKey,
  listen: ["/ip4/0.0.0.0/tcp/4001"],
  discovery: ["bootstrap"],
  bootstrapPeers: cfg.bootstrapPeers,
});

const registry = new PeerReputationRegistry();
// machine ↔ reputation 매핑
```

이렇게 하면 Agent Mesh의 reputation이 **machine-to-machine 신뢰**에도 자연스럽게 적용됨.

### 6.3 Credits 통합

`@agentmesh/credits` (Phase 2b 완료)가 session billing/credit tracking에 활용:

```ts
// session spawn 시 credit reservation
const receipt = creditAccount.reserve({
  sessionId,
  machine,
  estimatedCost,
});
// session 완료 시 settlement
creditAccount.settle(receipt, actualCost);
```

---

## 7. 사용자 UX 흐름

### 7.1 첫 설치

```
1. 사용자가 https://muhanai.com/download 접속
2. 플랫폼 감지 (iOS/Android/macOS/Windows/Linux)
3. "Download MuhanAI Client (powered by Happy)" 클릭
4. happy 공식 빌드 다운로드 + MuhanAI Adapter 자동 적용
5. 사용자가 MuhanAI 계정으로 로그인 (muhanai.com OAuth)
6. 첫 machine setup:
   - "내 Mac 등록" 클릭
   - muhan-agent 설치 (brew install muhan-agent 또는 curl | sh)
   - muhan-agent가 자동으로 Gateway에 register
```

### 7.2 일일 사용

```
1. 사용자가 외출 중 iPhone에서 Happy(MuhanAI Client) 열기
2. "내 Mac에서 Claude Code 세션 열어줘" 입력
3. MuhanAI Gateway가:
   a. Mac의 muhan-agent에 WebSocket 메시지 전송
   b. muhan-agent가 Claude Code spawn
   c. session output을 iPhone으로 stream
4. 사용자가 iPhone에서 결과 확인, follow-up 입력
5. session은 Mac에서 계속 실행, iPhone은 원격 제어
```

### 7.3 다중 device

```
- Coding Agent: Mac (local)
- Build Agent: Server (cloud)
- Browser Agent: AIHawk (Firefox instance)
- Research Agent: GPU Server (cloud)

사용자가 iPhone에서 모든 agent를 dashboard로 보고 제어
```

---

## 8. 마이그레이션 경로 (단계)

| 단계 | 산출물 | 의존성 |
|---|---|---|
| **A1** | `docs/HAPPY-INTEGRATION-ANALYSIS.md` (이 문서) | - |
| **A2** | `client-adapter/` monorepo init (adapter-core) | A1 |
| **A3** | `patches/app.json.patch` 작성 + Happy v1.2.3에 patch 검증 | A2 |
| **A4** | `download-happy.sh` 작성 (post-install with adapter patch) | A3 |
| **A5** | macOS 빌드 verify (happy 공식 dmg + patch 적용 → app.muhanai.client 실행) | A4 |
| **G1** | `packages/gateway/` init (libp2p host + WebSocket sync) | Phase 2b ✅ |
| **G2** | machine registry protocol 구현 | G1 |
| **G3** | session routing + push notification | G1 |
| **L1** | `packages/muhan-agent/` init | Phase 2b ✅ |
| **L2** | daemon + libp2p register | L1, G1 |
| **L3** | session spawner (Claude/Codex) | L2 |
| **L4** | credentials-vault (Discussion #680 해결) | L2 |
| **L5** | MCP router | L2 |
| **I1** | MuhanAI happy-app settings panel (1 route) | A4, G1 |
| **I2** | end-to-end test (Mac + iPhone) | A5, G3, L5 |

각 단계는 독립적이며 revert 가능.

---

## 9. Risk / Trade-off

| Risk | 완화 |
|---|---|
| Happy upstream 변경 시 adapter patch 깨짐 | `patch-package` 자동 rebase. 깨지면 1-2일 hotfix. Adapter surface를 최소화(3개)해 충돌 범위 좁힘. |
| Happy 공식 앱 store 정책 (Apple/Google)이 custom patch 빌드 거부 | App Store 배포 안 함. macOS/Windows/Linux는 직접 다운로드 + verify script로 인증서 검증. iOS/Android는 TestFlight/사내 배포 또는 Happy 공식 빌드에 MuhanAI 설정 endpoint만 추가 요청 (upstream PR). |
| 사용자가 Happy 공식 빌드 + MuhanAI Adapter 적용이 헷갈림 | `get.muhanai.com/client.sh`로 one-line 설치. UI는 MuhanAI branded. |
| muhan-agent가 local daemon이라 OS 권한 필요 | macOS: SMAppService, Linux: systemd user unit, Windows: SCM. 각 OS별 installer 작성. |
| E2E 암호화 키 분실 시 데이터 복구 불가 | Happy와 동일 모델. MuhanAI는 키 recovery code 12단어 제시 (BIP39 표준). |

---

## 10. 의사결정 필요 사항

사용자 결정:

1. **Adapter monorepo 위치**: `agentmesh/` 안에 별도 package로? 별도 repo (`client-adapter/`)로?
   → 권장: 별도 repo (toolchain 분리)
2. **muhan-agent 위치**: `agentmesh/packages/` 안에? 별도 repo로?
   → 권장: `agentmesh/packages/muhan-agent/` (p2p/credits 활용도가 높음)
3. **iOS/Android 배포 채널**: TestFlight + Firebase App Distribution? Happy 공식 앱에 MuhanAI 설정 추가 upstream PR?
   → 권장: 1단계는 macOS/Windows/Linux만. 모바일은 Phase 4+.
4. **E2E 키 모델**: Happy와 동일한 passphrase 기반? MuhanAI 계정 비밀번호 기반?
   → 권장: MuhanAI OAuth + device key escrow (계정 삭제 시 키도 삭제).

---

## 부록 A. Adapter patch surface 추정

| 영역 | 코드 라인 (추정) |
|---|---|
| Endpoint injection | ~10 (env var + app.config patch) |
| Bundle id / branding | ~30 (app.config.js patch) |
| Settings panel | ~200 (1 route + 4 components) |
| Post-install script | ~150 (download + verify + patch + sign) |
| **합계** | **~400 LOC adapter** vs happy-app ~80,000 LOC |

→ Adapter는 happy-app의 **0.5%** 크기. 유지보수 부담 최소.

## 부록 B. 라이선스

- happy-app, happy-cli, happy-agent, happy-server, happy-wire: 모두 MIT (LICENSE 파일 확인)
- Adapter 작성물: MuhanAI 소유 (별도 LICENSE)
- `patch-package` 산출물: MIT (Tool author 소유), 사용 OK

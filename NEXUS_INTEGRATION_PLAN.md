# Nexus ↔ MuhanAI 통합 플랜

## 개요

**Nexus** (https://github.com/rachidSabah/Nexus) — Local-first AI Gateway + Multi-Agent Orchestrator  
**MuhanAI** (muhanai.com) — 분산형 AI 에이전트 메쉬 플랫폼

두 플랫폼을 통합하여 **토큰프리, 벤더 독립, 오프라인 우선**의 분산형 AI 워크스페이스를 구축합니다.

---

## 통합 아키텍처

```
muhanai.com + Nexus 통합 아키텍처
┌─────────────────────────────────────────────────────────────┐
│  사용자 인터페이스 (React + Vite + Tailwind)               │
│  ├── Cosmic Obsidian 지식 그래프                            │
│  ├── AgentCast 합의 타임라인                                 │
│  └── 개발자 콘솔 대시보드                                     │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  AgentMesh OS (MuhanAI)                                     │
│  ├── agent-router (모델/공급자 라우팅)                        │
│  ├── agent-mesh (P2P 에이전트 발견)                           │
│  ├── agent-cast (멀티 에이전트 합의)                          │
│  ├── personal-mcp (사용자 소유 MCP)                           │
│  ├── knowledge-base (하이브리드 검색 + RAG)                   │
│  └── category-engine (자율 분류)                              │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  Nexus AI Gateway (Local-First)                             │
│  ├── 300+ 모델 OpenAI 호환 엔드포인트                         │
│  ├── 실시간 토큰 압축 (최대 95%)                               │
│  ├── 멀티 에이전트 오케스트레이션                              │
│  ├── 풀 네이티브 MCP 서버                                      │
│  ├── AES-256-GCM 암호화 볼트                                    │
│  └── 셀프힐링 신뢰성                                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  인프라 레이어                                               │
│  ├── Cloudflare Workers Edge                                  │
│  ├── WebRTC P2P CRDT 메쉬                                       │
│  ├── 로컬 WebGPU 실행                                           │
│  └── 온프레미스 / 자체 호스팅                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4단계 통합 로드맵

### Phase 1: AI Gateway 라우팅 연동 (우선순위: 높음)

| 작업 | 대상 | 설명 |
|------|------|------|
| 1.1 | `llm-router` | `LLMProvider` 타입에 `"nexus"` 추가 |
| 1.2 | `llm-router` | `getNexus()` 메서드 구현 (OpenAI SDK + Nexus baseURL) |
| 1.3 | `llm-router` | `generateNexus()` 메서드 구현 |
| 1.4 | `llm-router` | `getAvailableProviders()`에 `NEXUS_API_KEY` 확인 로직 추가 |
| 1.5 | `llm-router` | `generateWithProvider` switch에 `case "nexus"` 추가 |
| 1.6 | `.env.example` | `NEXUS_API_KEY`, `NEXUS_BASE_URL` 환경변수 문서화 |
| 1.7 | `llm-router` | 단위 테스트 추가 (Nexus 제공자 모크) |

### Phase 2: 토큰 압축 + 경제 연동 (우선순위: 높음)

| 작업 | 대상 | 설명 |
|------|------|------|
| 2.1 | `llm-router` | Nexus 토큰 압축 API 연동 (요청/응답 토큰 절감량 추적) |
| 2.2 | `credit-system` | 토큰 절감량을 명성 기반 원장에 기록 |
| 2.3 | `llm-router` | 압축된 컨텍스트를 P2P CRDT 지식 호수에 저장 |
| 2.4 | `.env` | `NEXUS_COMPRESSION_ENABLED`, `NEXUS_COMPRESSION_LEVEL` 설정 |

### Phase 3: 멀티 에이전트 오케스트레이션 (우선순위: 중간)

| 작업 | 대상 | 설명 |
|------|------|------|
| 3.1 | `agent-cast` | Nexus 멀티 에이전트 오케스트레이션과 MuhanAI 퀴럼 합의 융합 |
| 3.2 | `agent-mesh` | Nexus 에이전트 발견 + MuhanAI P2P 에이전트 메쉬 연동 |
| 3.3 | `agent-router` | Nexus Agent Buckling + MuhanAI 라우팅 파이프라인 통합 |
| 3.4 | 웹 UI | AgentCast 타임라인에 Nexus 멀티 에이전트 토론 시각화 |

### Phase 4: MCP + 보안 연동 (우선순위: 중간)

| 작업 | 대상 | 설명 |
|------|------|------|
| 4.1 | `personal-mcp` | Nexus 풀 네이티브 MCP 서버 연동 |
| 4.2 | `mcp` | Nexus 툴 스키마 자동 치유 + MuhanAI MCP 툴 그리드 |
| 4.3 | 보안 레이어 | Nexus AES-256-GCM 암호화 볼트 + MuhanAI DID 인증 |
| 4.4 | `.env` | Nexus 볼트 암호화 키 설정 |

---

## 기대 효과 (정량적)

| 지표 | 현재 | Nexus 통합 후 | 개선율 |
|------|------|---------------|--------|
| 토큰 비용 | 제로-토큰 (로컬) | 제로-토큰 + 95% 압축 | ~100% 절감 |
| 모델 가용성 | 로컬 WebGPU + 일부 클라우드 | 300+ 모델 + 로컬 | 10배 이상 |
| TTFT (첫 토큰까지 시간) | 네트워크 의존 | <800ms (추측적 헤지) | 대폭 단축 |
| MCP 툴 호환성 | 기본 | 풀 네이티브 + 자동 치유 | 완전 호환 |
| 데이터 주권 | P2P + 로컬 | 100% 로컬 우선 + 암호화 볼트 | 완전 주권 |
| 벤더 락인 | 일부 존재 | 완전 제거 | 100% 독립 |

---

## Phase 1 실행 현황

| 작업 | 상태 |
|------|------|
| 1.1 LLMProvider에 "nexus" 추가 | ✅ 완료 |
| 1.2 getNexus() 구현 | ✅ 완료 |
| 1.3 generateNexus() 구현 | ✅ 완료 |
| 1.4 getAvailableProviders() 업데이트 | ✅ 완료 |
| 1.5 generateWithProvider switch 업데이트 | ✅ 완료 |
| 1.6 .env.example 업데이트 | ✅ 완료 |
| 1.7 단위 테스트 추가 | ⏳ 대기 |

---

*생성일: 2026-10-16*  
*상태: Phase 1 시작*
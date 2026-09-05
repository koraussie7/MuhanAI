# MuhanAI

**[English](README.md)** | **[中文](README_zh-CN.md)**

MuhanAI는 분산 에이전트, 개인 MCP 도구, 지식 그래프, 컴퓨팅 공유, 토큰 경제를 하나의 일관된 웹 경험으로 통합하는 **통합 AI 메시 플랫폼**입니다.

## 기술 스택

- **프론트엔드**: React 19 + Vite + Tailwind CSS v4
- **데스크톱 런타임**: Electron + Playwright
- **에이전트 프레임워크**: AgentMesh OS 모노레포 (pnpm workspaces)
- **백엔드**: Cloudflare Workers + KV
- **데이터베이스**: Prisma + PostgreSQL + pgvector
- **캐시**: Redis
- **언어**: TypeScript 5.x

## 아키텍처

![Architecture Diagram](docs/images/architecture.svg)

```
muhanai.com
├── Cloudflare Worker (정적 에셋 + API 프록시)
├── AgentMesh OS (모노레포)
│   ├── agent-router      → 모델/프로바이더 라우팅
│   ├── agent-mesh        → P2P 에이전트 디스커버리
│   ├── agent-cast        → 멀티 에이전트 합의
│   ├── personal-mcp      → 사용자 소유 MCP 서버
│   ├── knowledge-base    → 하이브리드 검색 + RAG
│   ├── category-engine   → 분류체계 + 관할
│   └── llm-router        → 멀티 LLM 폴백
└── Harvest UI (14개 오픈소스 레포 적응)
    ├── A: ISK / peerd / nekoni / LLMesh
    ├── B: InfoMesh / Society / miroclaw / NeuroMesh
    └── C: p2ptokens / pinkybrain / agentfm / mycellm / tkngate / dac
```

## 주요 기능

- **27개 메뉴 대시보드** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — 탈중앙화 A2A 디스커버리 및 신원 카드
- **Knowledge Graph** — SVG 캔버스 + 하이브리드 검색 + 출처 추적
- **Agent Cast** — 멀티 에이전트 합의 타임라인 및 투표 스트림
- **MCP Skills** — InfoMesh/Society 통합 도구 실행 UI
- **Model Hub** — HuggingFace/Ollama 로컬 모델 관리
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — 기여, 평판, 원장, 신뢰 링

## 사전 요구사항

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector (지식 검색용)
- **Redis** (피드/트렌딩 캐시용)
- **Chrome/Chromium** (Electron 런타임 / 브라우저 자동화용)

## 빠른 시작

### 의존성 설치

```bash
pnpm install
```

### 데이터베이스 설정

```bash
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm prisma generate
```

### 개발

```bash
pnpm dev:web          # Vite 개발 서버 (프론트엔드)
```

### 빌드

```bash
pnpm build            # 모든 패키지 빌드
pnpm build:web        # 웹 앱만 빌드
```

### 배포

```bash
pnpm deploy:worker    # Cloudflare Workers에 배포
```

## 프로젝트 구조

```
.
├── packaging/npm/token-free-gateway/agentmesh/
│   ├── apps/
│   │   └── web/                    # React 대시보드
│   ├── packages/
│   │   ├── agent-cast/             # 멀티 에이전트 합의
│   │   ├── agent-core/             # 에이전트 레지스트리 + 실행 저장소
│   │   ├── agent-mesh/             # P2P 메시 네트워킹
│   │   ├── agent-router/           # 모델/프로바이더 라우팅
│   │   ├── category-engine/        # 분류체계 + 관할
│   │   ├── db/                     # Prisma 클라이언트
│   │   ├── knowledge-base/         # 하이브리드 검색 + RAG + pgvector
│   │   ├── llm-router/             # 멀티 LLM 폴백
│   │   ├── personal-mcp/           # 사용자 소유 MCP 서버
│   │   └── shared/                 # 공통 유틸리티
│   ├── prisma/                     # 데이터베이스 스키마
│   └── scripts/                    # 빌드/배포 스크립트
└── README.md
```

## 라이선스

[MIT](LICENSE)

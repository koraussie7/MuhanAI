# MuhanAI

**[English](README.md)**

MuhanAI 是一个**统一 AI 网格平台**，将去中心化 에이전트、个人 MCP 工具、知识图谱、计算共享和通证经济整合为一个一致的 Web 体验。

## 技术栈

- **前端**: React 19 + Vite + Tailwind CSS v4
- **桌面运行时**: Electron + Playwright
- **Agent 框架**: AgentMesh OS monorepo (pnpm workspaces)
- **后端**: Cloudflare Workers + KV
- **数据库**: Prisma + PostgreSQL + pgvector
- **缓存**: Redis
- **语言**: TypeScript 5.x

## 架构

```
muhanai.com
├── Cloudflare Worker (static assets + API proxy)
├── AgentMesh OS (monorepo)
│   ├── agent-router      → model/provider routing
│   ├── agent-mesh        → P2P agent discovery
│   ├── agent-cast        → multi-agent consensus
│   ├── personal-mcp      → user-owned MCP servers
│   ├── knowledge-base    → hybrid search + RAG
│   ├── category-engine   → taxonomy + jurisdiction
│   └── llm-router        → multi-LLM fallback
└── Harvest UI (14 open-source repos adapted)
    ├── A: ISK / peerd / nekoni / LLMesh
    ├── B: InfoMesh / Society / miroclaw / NeuroMesh
    └── C: p2ptokens / pinkybrain / agentfm / mycellm / tkngate / dac
```

## 功能特性

- **27 菜单仪表盘** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — 去中心化 A2A 发现和身份卡片
- **Knowledge Graph** — SVG 画布 + hybrid search + provenance
- **Agent Cast** — 多 Agent 共识时间线和投票流
- **MCP Skills** — 工具执行 UI，集成 InfoMesh/Society
- **Model Hub** — HuggingFace/Ollama 本地模型管理
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — contributions, reputation, ledger, trust ring

## 前置要求

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## 快速开始

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm prisma generate
pnpm dev:web
```

## 项目结构

```
packaging/npm/token-free-gateway/agentmesh/
├── apps/web                     # React dashboard
├── packages/
│   ├── agent-cast/              # Multi-agent consensus
│   ├── agent-core/              # Agent registry + run store
│   ├── agent-mesh/              # P2P mesh
│   ├── agent-router/            # Model/provider routing
│   ├── category-engine/         # Taxonomy + jurisdiction
│   ├── db/                      # Prisma client
│   ├── knowledge-base/          # Hybrid search + RAG
│   ├── llm-router/              # Multi-LLM fallback
│   ├── personal-mcp/            # User MCP servers
│   └── shared/                  # Common types
├── prisma/schema.prisma
└── deploy/worker.ts
```

## 配置

| Variable | Description |
|----------|-------------|
| `PERSONAL_MCP_STORE` | `memory` or `prisma` |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `API_ORIGIN` | Backend API origin for Worker proxy |

## License

MIT

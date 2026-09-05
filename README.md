# MuhanAI

**[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAI is a **unified AI mesh platform** that combines decentralized agents, personal MCP tools, knowledge graphs, compute sharing, and a token economy into one coherent web experience.

## Tech Stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Desktop runtime**: Electron + Playwright
- **Agent framework**: AgentMesh OS monorepo (pnpm workspaces)
- **Backend**: Cloudflare Workers + KV
- **Database**: Prisma + PostgreSQL + pgvector
- **Cache**: Redis
- **Language**: TypeScript 5.x

## Architecture

![Architecture Diagram](docs/images/architecture.svg)

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

## Features

- **27-menu dashboard** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — decentralized A2A discovery and identity cards
- **Knowledge Graph** — SVG canvas with hybrid search + provenance
- **Agent Cast** — multi-agent consensus timeline and voting stream
- **MCP Skills** — tool execution UI with InfoMesh/Society integrations
- **Model Hub** — HuggingFace/Ollama local model management
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — contributions, reputation, ledger, trust ring

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector (for knowledge search)
- **Redis** (for feed/trending cache)
- **Chrome/Chromium** (for Electron runtime / browser automation)

## Quick Start

### Install dependencies

```bash
pnpm install
```

### Database setup

```bash
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm prisma generate
```

### Development

```bash
pnpm dev:web          # Vite dev server (frontend)
```

### Build

```bash
pnpm build            # Build all packages
pnpm build:web        # Build web app only
```

### Deploy

```bash
pnpm deploy:worker    # Deploy to Cloudflare Workers
```

## Project Structure

```
.
├── packaging/npm/token-free-gateway/agentmesh/
│   ├── apps/
│   │   └── web/                    # React dashboard
│   ├── packages/
│   │   ├── agent-cast/             # Multi-agent consensus
│   │   ├── agent-core/             # Agent registry + run store
│   │   ├── agent-mesh/             # P2P mesh networking
│   │   ├── agent-router/           # Model/provider routing
│   │   ├── category-engine/        # Taxonomy + jurisdiction
│   │   ├── db/                     # Prisma client
│   │   ├── knowledge-base/         # Hybrid search + RAG + pgvector
│   │   ├── llm-router/             # Multi-LLM fallback
│   │   ├── personal-mcp/           # User MCP servers
│   │   └── shared/                 # Common types
│   ├── prisma/
│   │   └── schema.prisma
│   ├── deploy/
│   │   └── worker.ts
│   └── wrangler.toml
└── VISION.md
```

## Configuration

Environment variables:

| Variable | Description |
|----------|-------------|
| `PERSONAL_MCP_STORE` | `memory` or `prisma` |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `API_ORIGIN` | Backend API origin for Worker proxy |

## License

MIT

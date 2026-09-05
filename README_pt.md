# MuhanAI

**[English](README.md)** | **[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAI é uma **plataforma unificada de malha de IA** que combina agentes descentralizados, ferramentas MCP pessoais, grafos de conhecimento, compartilhamento de computação e uma economia de tokens em uma experiência web coerente.

## Stack Tecnológico

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Runtime desktop**: Electron + Playwright
- **Framework de agentes**: AgentMesh OS monorepo (pnpm workspaces)
- **Backend**: Cloudflare Workers + KV
- **Banco de dados**: Prisma + PostgreSQL + pgvector
- **Cache**: Redis
- **Linguagem**: TypeScript 5.x

## Arquitetura

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

## Principais Funcionalidades

- **Painel de 27 menus** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — descoberta A2A descentralizada e identidade
- **Knowledge Graph** — canvas SVG + busca híbrida + procedência
- **Agent Cast** — linha do tempo de consenso multi-agente
- **MCP Skills** — UI de execução de ferramentas
- **Model Hub** — gerenciamento de modelos locais HuggingFace/Ollama
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — contribuições, reputação, ledger, anel de confiança

## Pré-requisitos

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## Início Rápido

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm generate
pnpm dev:web
pnpm build
pnpm deploy:worker
```

## Licença

[MIT](LICENSE)

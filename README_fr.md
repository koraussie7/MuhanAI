# MuhanAI

**[English](README.md)** | **[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAI est une **plateforme unifiée de maillage IA** qui combine des agents décentralisés, des outils MCP personnels, des graphes de connaissances, le partage de calcul et une économie de jetons en une expérience web cohérente.

## Stack Technologique

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Runtime bureau**: Electron + Playwright
- **Framework d'agents**: AgentMesh OS monorepo (pnpm workspaces)
- **Backend**: Cloudflare Workers + KV
- **Base de données**: Prisma + PostgreSQL + pgvector
- **Cache**: Redis
- **Langage**: TypeScript 5.x

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

## Fonctionnalités Principales

- **Tableau de bord 27 menus** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — découverte A2A décentralisée et identité
- **Knowledge Graph** — canvas SVG + recherche hybride + provenance
- **Agent Cast** — chronologie de consensus multi-agents
- **MCP Skills** — UI d'exécution d'outils
- **Model Hub** — gestion des modèles locaux HuggingFace/Ollama
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — contributions, réputation, registre, anneau de confiance

## Prérequis

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## Démarrage Rapide

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm generate
pnpm dev:web
pnpm build
pnpm deploy:worker
```

## Licence

[MIT](LICENSE)

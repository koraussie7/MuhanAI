# MuhanAI

**[English](README.md)** | **[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAI ist eine **einheitliche AI-Mesh-Plattform**, die dezentrale Agenten, persönliche MCP-Tools, Wissensgraphen, Compute-Sharing und eine Token-Ökonomie in ein kohärentes Web-Erlebnis vereint.

## Technologie-Stack

- **Frontend**: React 19 + Vite + Tailwind CSS v4
- **Desktop-Laufzeit**: Electron + Playwright
- **Agenten-Framework**: AgentMesh OS Monorepo (pnpm workspaces)
- **Backend**: Cloudflare Workers + KV
- **Datenbank**: Prisma + PostgreSQL + pgvector
- **Cache**: Redis
- **Sprache**: TypeScript 5.x

## Architektur

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

## Hauptfunktionen

- **27-Menü-Dashboard** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — dezentrale A2A-Erkennung und Identitätskarten
- **Knowledge Graph** — SVG-Canvas + hybride Suche + Herkunft
- **Agent Cast** — Multi-Agent-Konsensus-Zeitachse und Abstimmungsstream
- **MCP Skills** — Tool-Ausführung UI mit InfoMesh/Society-Integrationen
- **Model Hub** — HuggingFace/Ollama lokale Modellverwaltung
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — Beiträge, Reputation, Ledger, Vertrauensring

## Voraussetzungen

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## Schnellstart

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm generate
pnpm dev:web
pnpm build
pnpm deploy:worker
```

## Lizenz

[MIT](LICENSE)

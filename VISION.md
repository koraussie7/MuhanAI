# MuhanAI — Vision

## What It Is
MuhanAI is a **unified AI mesh platform** that combines decentralized agents, personal MCP tools, knowledge graphs, compute sharing, and a token economy into one coherent web experience.

## Core Idea
Instead of using one AI provider, MuhanAI lets you:
- **Route** questions across multiple agents and models
- **Verify** answers through community voting and provenance tracking
- **Share** compute, knowledge, and MCP skills peer-to-peer
- **Earn** credits for contributions, verified answers, and compute sharing

## Architecture
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

## Current State
- **Frontend**: React + Vite + Tailwind dark theme, 27-menu sidebar dashboard
- **Deployment**: Cloudflare Workers (muhanai.com/*)
- **Backend**: API proxy → api.muhanai.com
- **Database**: Prisma + PostgreSQL (personal-mcp, knowledge, agents)
- **Vector**: pgvector for embeddings
- **Cache**: Redis for feed/trending

## North Star
A **token-free, browser-native, P2P-augmented AI workspace** where humans and agents collaborate, verify, and transact without centralized API keys or billing.

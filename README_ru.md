# MuhanAI

**[English](README.md)** | **[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAI — это **унифицированная AI-платформа меша**, которая объединяет децентрализованные агенты, личные MCP-инструменты, графы знаний, совместное использование вычислений и токеномику в единый веб-опыт.

## Технологический Стек

- **Фронтенд**: React 19 + Vite + Tailwind CSS v4
- **Десктоп-рантайм**: Electron + Playwright
- **Фреймворк агентов**: AgentMesh OS монорепозиторий (pnpm workspaces)
- **Бэкенд**: Cloudflare Workers + KV
- **База данных**: Prisma + PostgreSQL + pgvector
- **Кэш**: Redis
- **Язык**: TypeScript 5.x

## Архитектура

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

## Основные Функции

- **Панель из 27 меню** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — децентрализованное A2A-обнаружение и идентификация
- **Knowledge Graph** — SVG-канвас + гибридный поиск + происхождение
- **Agent Cast** — временная шкала консенсуса мульти-агентов
- **MCP Skills** — UI выполнения инструментов
- **Model Hub** — управление локальными моделями HuggingFace/Ollama
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — вклады, репутация, реестр, кольцо доверия

## Требования

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## Быстрый Старт

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm generate
pnpm dev:web
pnpm build
pnpm deploy:worker
```

## Лицензия

[MIT](LICENSE)

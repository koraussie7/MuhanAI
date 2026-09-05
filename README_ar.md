# MuhanAI

**[English](README.md)** | **[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAI هي **منصة شبكة ذكاء اصطناعي موحدة** تجمع بين الوكلاء اللامركزيين وأدوات MCP الشخصية ومخططات المعرفة ومشاركة الحوسبة واقتصاد الرموز في تجربة ويب متماسكة.

## المكدس التقني

- **الواجهة الأمامية**: React 19 + Vite + Tailwind CSS v4
- **وقت تشغيل سطح المكتب**: Electron + Playwright
- **إطار الوكلاء**: AgentMesh OS monorepo (pnpm workspaces)
- **الخلفية**: Cloudflare Workers + KV
- **قاعدة البيانات**: Prisma + PostgreSQL + pgvector
- **التخزين المؤقت**: Redis
- **اللغة**: TypeScript 5.x

## البنية

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

## الميزات الرئيسية

- **لوحة 27 قائمة** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — اكتشاف A2A لامركزي وبطاقات الهوية
- **Knowledge Graph** — لوحة SVG + بحث هجين + تتبع المصدر
- **Agent Cast** — الجدول الزمني للتوافق متعدد الوكلاء
- **MCP Skills** — واجهة تنفيذ الأدوات
- **Model Hub** — إدارة النماذج المحلية HuggingFace/Ollama
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — المساهمات، السجل، السجل المحاسبي، حلقة الثقة

## المتطلبات المسبقة

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## البدء السريع

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm generate
pnpm dev:web
pnpm build
pnpm deploy:worker
```

## الرخصة

[MIT](LICENSE)

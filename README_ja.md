# MuhanAI

**[English](README.md)** | **[한국어](README_ko.md)** | **[中文](README_zh-CN.md)**

MuhanAIは、分散エージェント、個人用MCPツール、ナレッジグラフ、コンピューティング共有、トークン経済を1つの統合的なWeb体験に統合する**統合AIメッシュプラットフォーム**です。

## 技術スタック

- **フロントエンド**: React 19 + Vite + Tailwind CSS v4
- **デスクトップランタイム**: Electron + Playwright
- **エージェントフレームワーク**: AgentMesh OS モノレポ (pnpm workspaces)
- **バックエンド**: Cloudflare Workers + KV
- **データベース**: Prisma + PostgreSQL + pgvector
- **キャッシュ**: Redis
- **言語**: TypeScript 5.x

## アーキテクチャ

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

## 主な機能

- **27メニューダッシュボード** — Network, Intelligence, Marketplace, Economy, Workspace, System
- **Agent Mesh** — 分散型A2A発見とIDカード
- **Knowledge Graph** — SVGキャンバス + ハイブリッド検索 + 出所追跡
- **Agent Cast** — マルチエージェンセンサスタイムラインと投票ストリーム
- **MCP Skills** — InfoMesh/Society統合ツール実行UI
- **Model Hub** — HuggingFace/Ollamaローカルモデル管理
- **Marketplace** — Agents, Human Experts, MCP, Knowledge, Compute
- **Token Economy** — 貢献、評判、元帳、信頼リング

## 前提条件

- **Node.js** >= 20
- **pnpm** >= 10
- **PostgreSQL** with pgvector
- **Redis**
- **Chrome/Chromium**

## クイックスタート

```bash
pnpm install
docker compose up -d postgres redis
pnpm prisma migrate dev
pnpm generate
pnpm dev:web
pnpm build
pnpm deploy:worker
```

## ライセンス

[MIT](LICENSE)

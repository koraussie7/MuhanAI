# CLAUDE.md

## 1. Codebase Overview

```
agentmesh/
│
├── apps/
│   ├── web/                         # 메인 Web UI
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── NetworkPanel/
│   │   │   │   ├── AgentCast/
│   │   │   │   ├── HumanConsole/
│   │   │   │   ├── KnowledgePanel/
│   │   │   │   ├── TokenBank/
│   │   │   │   └── AgentSearch/
│   │   │   ├── pages/
│   │   │   │   ├── Home.tsx
│   │   │   │   ├── Network.tsx
│   │   │   │   ├── Knowledge.tsx
│   │   │   │   ├── Agents.tsx
│   │   │   │   └── TokenBank.tsx
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── node/                        # AI/P2P Node
│       ├── src/
│       │   ├── webllm/
│       │   ├── p2p/
│       │   ├── mcp/
│       │   └── node.ts
│       └── package.json
│
├── packages/
│   │
│   ├── core/                        # 시스템 핵심
│   │   ├── types/
│   │   │   ├── agent.ts
│   │   │   ├── request.ts
│   │   │   ├── result.ts
│   │   │   ├── knowledge.ts
│   │   │   └── contribution.ts
│   │   ├── events/
│   │   └── interfaces/
│   │
│   ├── router/                      # Agent Router
│   │   ├── router.ts
│   │   ├── policy.ts
│   │   ├── budget.ts
│   │   └── health.ts
│   │
│   ├── agent/                       # Agent Mesh
│   │   ├── registry.ts
│   │   ├── discovery.ts
│   │   ├── capability.ts
│   │   └── executor.ts
│   │
│   ├── cast/                        # Agent Cast
│   │   ├── cast.ts
│   │   ├── fanout.ts
│   │   ├── aggregator.ts
│   │   ├── voting.ts
│   │   └── consensus.ts
│   │
│   ├── human/                       # Human Agent
│   │   ├── human-agent.ts
│   │   ├── answer.ts
│   │   ├── verify.ts
│   │   ├── teach.ts
│   │   └── reputation.ts
│   │
│   ├── evaluator/                   # 결과 평가
│   │   ├── evaluator.ts
│   │   ├── confidence.ts
│   │   ├── relevance.ts
│   │   ├── quality.ts
│   │   └── contradiction.ts
│   │
│   ├── knowledge/                   # 통합 Knowledge Base
│   │   ├── ingest.ts
│   │   ├── extractor.ts
│   │   ├── validator.ts
│   │   ├── provenance.ts
│   │   ├── vector.ts
│   │   └── graph.ts
│   │
│   ├── token-bank/                  # Contribution Economy
│   │   ├── ledger.ts
│   │   ├── rewards.ts
│   │   ├── reputation.ts
│   │   └── anti-abuse.ts
│   │
│   ├── p2p/                         # P2P Network
│   │   ├── peer.ts
│   │   ├── discovery.ts
│   │   ├── transport.ts
│   │   └── compute.ts
│   │
│   ├── mcp/                         # MCP Network
│   │   ├── registry.ts
│   │   ├── discovery.ts
│   │   ├── router.ts
│   │   └── executor.ts
│   │
│   └── adapters/                    # LLM / AI Adapter
│       ├── webllm/
│       ├── openai/
│       ├── anthropic/
│       ├── gemini/
│       ├── openrouter/
│       ├── localai/
│       └── base.ts
│
├── services/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── cast.ts
│   │   │   ├── agents.ts
│   │   │   ├── human.ts
│   │   │   ├── knowledge.ts
│   │   │   └── token-bank.ts
│   │   └── server.ts
│   │
│   ├── worker/
│   │   ├── cast-worker.ts
│   │   ├── knowledge-worker.ts
│   │   └── reward-worker.ts
│   │
│   └── indexer/
│
├── infrastructure/
│   ├── postgres/
│   ├── redis/
│   ├── vector-db/
│   ├── graph-db/
│   └── docker/
│
├── docs/
│   ├── architecture.md
│   ├── protocol.md
│   ├── agent-mesh.md
│   ├── agent-cast.md
│   ├── human-agent.md
│   ├── knowledge.md
│   └── token-bank.md
│
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

## 2. Core Architecture Diagram

```
                         ┌─────────────────────┐
                         │       USER          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      WEB UI         │
                         │ Soribada/eMule UX   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    AGENT ROUTER     │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    │               │                │
                    ▼               ▼                ▼
              ┌──────────┐   ┌───────────┐   ┌────────────┐
              │ AGENT    │   │ AGENT     │   │ MCP        │
              │ MESH     │   │ CAST      │   │ NETWORK    │
              └────┬─────┘   └─────┬─────┘   └─────┬──────┘
                   │               │               │
          ┌────────┼───────┐       │       ┌───────┼───────┐
          │        │       │       │       │       │       │
          ▼        ▼       ▼       ▼       ▼       ▼       ▼
       WebLLM     P2P    Local   Gemini  MCP     Web     Tools
                         AI      Claude
                                  GPT
                                   │
                                   ▼
                         ┌─────────────────────┐
                         │     EVALUATOR       │
                         │ Quality / Consensus │
                         └──────────┬──────────┘
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                          ▼                   ▼
                  ┌──────────────┐    ┌──────────────┐
                  │ HUMAN AGENT  │    │ KNOWLEDGE    │
                  │ Answer       │    │ ENGINE       │
                  │ Verify       │    │              │
                  │ Teach        │    │ Vector       │
                  └──────┬───────┘    │ Graph        │
                         │            │ Provenance   │
                         └─────┬──────┴──────────────┘
                               │
                               ▼
                       ┌─────────────────┐
                       │   TOKEN BANK    │
                       │ Contribution    │
                       │ Compute         │
                       │ Reputation      │
                       └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ NETWORK GROWTH  │
                       └─────────────────┘
```

## 3. Key Modules

### 3.1 Agent Adapter
All AI models and human agents share a common interface:

```ts
export interface AgentAdapter {
  id: string;
  capabilities(): string[];
  health(): Promise<{ online: boolean; latency: number }>;
  execute(request: AgentRequest): Promise<AgentResult>;
}
```

Implementations include:
- **WebLLM** – local LLM via WebGPU
- **Gemini**, **Claude**, **GPT**, **OpenAI**, **Anthropic**, **OpenRouter**, **LocalAI**
- **P2P AI** – decentralized models
- **Human** – formalized human capability types (`answer`, `verify`, `teach`, `local_knowledge`, `expert`)

### 3.2 Agent Router
Selects the appropriate **Agent Set** based on task characteristics:

```ts
const decision = await router.select({
  task,
  complexity,
  budget,
  latency,
  requiredCapabilities
});
```

Examples:
- Simple question → **WebLLM** (free, fast)
- Complex coding → **Local GPU** or **P2P** agents
- High‑difficulty reasoning → **Agent Cast** (Gemini + Claude + GPT)
- Real‑time data → **Human Agent** or **MCP + Web Agent**

### 3.3 Agent Cast (Core Feature)
Runs a configurable set of agents and aggregates results:

```ts
const result = await agentCast.run({
  question,
  agents: ["webllm", "p2p", "gemini", "claude", "human"]
});
```

Internal flow:
1. **Question** → dispatch to each agent
2. **Aggregator** collects answers
3. **Evaluator** scores confidence/quality
4. **Consensus** merges the best answer

### 3.4 Human Agent
Treated as a first‑class agent with capabilities:
- **answer** – provide a response
- **verify** – validate a response
- **teach** – contribute knowledge
- **local_knowledge** – use local/on‑device knowledge
- **expert** – specialized expertise

Human answers flow through **Fact Extraction → Evidence → Validation → Knowledge Base**.

### 3.5 Knowledge Engine
Prevents raw LLM output from being stored directly.

```
RAW AI RESPONSE
   ↓
Fact Extractor
   ↓
Source Extraction
   ↓
Cross Validation
   ↓
Confidence Score
   ↓
Knowledge Graph + Vector DB
   ↓
Validated Knowledge
```

Knowledge record schema:

```ts
interface KnowledgeRecord {
  id: string;
  claim: string;
  evidence: Evidence[];
  confidence: number;
  provenance: Provenance[];
  verifiedBy: string[];
  createdAt: number;
}
```

### 3.6 Token Bank (Contribution Economy)
A ledger‑based system (initially non‑blockchain) that tracks contributions and separates metrics:

```ts
interface ContributionEvent {
  actorId: string;
  type:
    | "answer"
    | "verify"
    | "teach"
    | "compute"
    | "mcp";
  quality: number;
  reward: number;
  timestamp: number;
}
```

Separated credits:
- **Compute Credit**
- **Knowledge Score**
- **Reputation**

### 3.7 Data Flow Summary

```
USER → QUESTION → AGENT ROUTER → AGENT CAST → RESULTS → EVALUATOR → KNOWLEDGE NETWORK
      │                │                │                │
      ▼                ▼                ▼                ▼
   WebLLM          P2P Agent   Premium Agents   HIGH/LOW CONFIDENCE
                                                    │
                                                    ▼
                                            HUMAN AGENT
                                                    │
                                                    ▼
                                           KNOWLEDGE DB
                                                    │
                                                    ▼
                                           TOKEN BANK
                                                    │
                                                    ▼
                                   CONTRIBUTION → NETWORK GROWTH
```

## 4. API (MVP)

| Method | Endpoint                | Description                              |
|--------|-------------------------|------------------------------------------|
| POST   | `/api/cast`             | Run Agent Cast with selected agents      |
| GET    | `/api/agents`           | List registered agents                  |
| GET    | `/api/network`          | Network status & metrics                |
| POST   | `/api/human/answer`     | Submit a human answer                    |
| POST   | `/api/human/verify`     | Verify a human answer                    |
| POST   | `/api/human/teach`      | Teach / contribute knowledge             |
| GET    | `/api/knowledge/search` | Search knowledge base                    |
| POST   | `/api/knowledge/validate`| Validate a knowledge claim               |
| GET    | `/api/token-bank`       | Retrieve token‑bank balances             |
| GET    | `/api/reputation`       | Get reputation scores                    |
| WS     | `/api/events`           | Real‑time event stream                   |

## 5. Tech Stack (MVP)

| Layer          | Technologies                              |
|----------------|-------------------------------------------|
| Frontend       | React, Vite, TypeScript                   |
| Local AI       | WebLLM + WebGPU                           |
| P2P            | WebRTC                                    |
| Backend        | Node.js, TypeScript, Fastify              |
| API            | Fastify                                   |
| Realtime       | WebSocket                                 |
| Database       | PostgreSQL, pgvector (vector), Redis (cache) |
| Vector Store   | pgvector (or Neo4j Graph layer)           |
| Knowledge Graph| PostgreSQL Graph extension / Neo4j       |
| MCP            | MCP SDK                                   |
| Containers     | Docker, Docker‑Compose                    |

## 6. Development Phases

| Phase | Goal                                 | Core Components |
|-------|--------------------------------------|-----------------|
| **1** | Web UI + Router + WebLLM             | Web UI, Router, WebLLM |
| **2** | Add external LLMs (OpenAI, Claude, Gemini, OpenRouter) | Adapter layer, Router extensions |
| **3** | P2P, WebRTC, Local GPU support       | P2P modules, Transport, Compute |
| **4** | Human Agent & Marketplace            | Human Agent, Reputation, Marketplace |
| **5** | Knowledge Engine, Vector DB, Graph   | Knowledge Engine, Vector DB, Graph |
| **6** | Token Bank, Reputation, Contribution Economy | Token Bank, Reputation, Contribution Ledger |

The ultimate vision is an **AgentMesh OS** that fuses the P2P philosophy of eMule/Soribada with local AI (WebLLM), a mesh of heterogeneous agents, a knowledge‑driven network, and a token‑based contribution economy — all orchestrated through **Agent Cast** and **Agent Router**.

## 7. Implementation Status and Commands
The AgentMesh implementation is isolated under `agentmesh/` so the existing `token-free-gateway` npm package remains unchanged. Phase 1 currently includes shared TypeScript contracts, an in-memory agent registry and executor, deterministic routing, mock and WebLLM-boundary adapters, Agent Cast fan-out/consensus, a Fastify API, and a small React/Vite console. The human, knowledge, token-bank, P2P, and MCP packages currently expose interfaces only.

Run commands from the `agentmesh/` directory:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Use `pnpm dev:api` for the API at `http://127.0.0.1:3001` and `pnpm dev:web` for the Vite app at `http://localhost:5173`. Optional infrastructure is started with `docker compose --profile infra up -d`.

## 8. Code Conventions
- Use strict TypeScript and ESM imports with explicit `.js` extensions in package source.
- Import shared contracts from `@agentmesh/core`; keep provider-specific behavior behind `AgentAdapter`.
- Prefer small, pure functions for routing, filtering, aggregation, scoring, and validation.
- Keep packages independently buildable with `pnpm --filter <package> build`.
- Use Vitest for behavior tests, especially routing boundaries, empty inputs, unavailable agents, adapter failures, and consensus ties.
- Validate and normalize API input at the HTTP boundary. Never trust browser-provided agent IDs or metadata.
- Use `crypto.randomUUID()` for request IDs and millisecond Unix timestamps.
- Document public interfaces when behavior is not obvious.

## 9. Security and Scope Rules
- Never commit API keys, cookies, session exports, `.env` files, database credentials, or generated `dist/` output.
- Never store raw model output as validated knowledge; route it through evidence, provenance, and validation first.
- Never expose server-only secrets or Node-only modules to browser bundles.
- Do not silently replace a requested agent with another provider; report selection and execution failures.
- Do not introduce a database, blockchain, WebRTC transport, or external LLM SDK without an interface and tests.
- Do not modify the original `token-free-gateway` package outside `agentmesh/` unless the task explicitly requires it.

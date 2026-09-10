# MUHAN AI - Complete Product & Architecture Specification

## Core Philosophy

**"AI에게 질문하는 곳이 아니라, 함께 답을 만드는 네트워크."**

UI 자체가 단순한 메뉴가 아니라 **네트워크의 참여를 계속 만들어내는 엔진**이 됩니다.

---

## Part 1: UI/UX Design Specification

### Main Screen Layout (60-70% Network Activity Feed)

```
┌─────────────────────────────────────────────────────────────┐
│ MUHAN AI                         ● Live Agents  Live Humans │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🌐 NETWORK PULSE                                           │
│  23 Questions · 14 Verify · 8 Humans Needed · 31 AI Conflicts│
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔥 HELP NEEDED (AI가 해결하지 못한 문제)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔴 도움이 필요합니다                                  │  │
│  │                                                       │  │
│  │ "베트남에서 한국인이 사업자 등록을 할 때              │  │
│  │  실제로 가장 많이 발생하는 문제는 무엇인가?"          │  │
│  │                                                       │  │
│  │ AI Confidence 64%   Human Answers 3                   │  │
│  │ +120 Credit        👥 8명이 참여 중                   │  │
│  │                                                       │  │
│  │ [ 내가 아는 내용 추가 ] [ 검증하기 ] [ AI에게 맡기기 ]│  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  🔥 TRENDING QUESTIONS                                      │
│  AI Agent Mesh          ████████████████████ 482            │
│  P2P AI                 ██████████████       341            │
│  Vietnam Business       ███████████          284            │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  🧠 KNOWLEDGE NEEDS VERIFICATION                            │
│  "현재 이 정보가 맞는지 확인해주세요."                      │
│  [ ✓ 맞음 ] [ ✕ 틀림 ] [ ? 모르겠음 ]                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  👤 HUMAN KNOWLEDGE WANTED                                  │
│  당신만 알고 있을 수 있는 경험                              │
│  [ 경험 공유하기 ]                                          │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                    ASK NETWORK                              │
│          "무엇이든 네트워크에 물어보세요"                    │
└─────────────────────────────────────────────────────────────┘
```

---

### Key Sections Detail

#### 1. NETWORK PULSE (Top Bar)
Real-time counters, each clickable:
- `23 new questions` → Questions list
- `14 verification requests` → Verify queue
- `8 human experts needed` → Human Help Needed
- `31 AI conflicts` → AI vs Human view
- `12 knowledge gaps` → Knowledge gaps
- `7 MCP tasks waiting` → MCP task queue

#### 2. HELP NEEDED / AI NEEDS HUMAN
Problems where AI confidence is low:
```
"미얀마 현지에서 실제 USDT P2P 거래 시 가장 안전한 거래 방식은?"
AI Consensus: 61%
Human Knowledge Needed: ★★★★★
Reward: +250
[ 내가 아는 내용 ]
```

#### 3. TRENDING QUESTIONS
Trending Score = 참여자 수 + AI 충돌 + 인간 참여 + 검증 필요성 (NOT simple view count)

#### 4. KNOWLEDGE NEEDS VERIFICATION (Verify Me)
3-second micro-participation:
```
"다낭의 FPT 인터넷은 500Mbps 서비스를 제공한다."
Sources: 3
[ ✓ 맞음 ] [ ✕ 틀림 ] [ ? 잘 모르겠음 ]
```

#### 5. HUMAN KNOWLEDGE WANTED
Experience-based knowledge (not just expertise):
- "이 식당 실제로 가본 사람?"
- "이 제품 써본 사람?"
- "이 지역 살아본 사람?"
- "이 프로그램 실제로 사용해본 사람?"

#### 6. UNSOLVED PROBLEMS
Categorized unsolved problems:
- 🔥 AI가 해결하지 못함
- 🔥 정보가 서로 충돌함
- 🔥 실제 경험 부족
- 🔥 검증된 자료 부족
- 🔥 최신 정보 부족

#### 7. AI vs HUMAN (Gamification)
```
Question: "다낭에서 가장 좋은 장기 거주 지역은?"
AI Consensus: 68%
Human Consensus: 91%
Winner: 👤 HUMAN
[ 결과 보기 ]
```

#### 8. TEACH AI
Human teaches AI from experience:
```
"나는 미얀마에서 10년간 사업을 했는데..."
[ Knowledge 생성 ] → Verification → Knowledge Base
```

#### 9. REWARDS UI
Visible contribution credits:
```
+120, +80, +250 Credits
```

#### 10. ASK NETWORK (Bottom)
Unified entry point replacing traditional chat:
```
[ASK NETWORK] [AGENT CAST] [HUMAN AGENTS]
```

---

## Part 2: Technical Architecture

### Package Structure (agentmesh/)

```
agentmesh/
├── apps/
│   ├── web/
│   ├── node/
│   └── browser-extension/
├── packages/
│   ├── core/
│   ├── agent/
│   │   ├── registry/
│   │   ├── discovery/
│   │   ├── identity/
│   │   ├── capabilities/
│   │   └── a2a/
│   ├── mesh/
│   │   ├── libp2p/
│   │   ├── gossip/
│   │   ├── dht/
│   │   ├── webrtc/
│   │   └── federation/
│   ├── router/
│   │   ├── capability-router/
│   │   ├── model-router/
│   │   ├── compute-router/
│   │   └── human-router/
│   ├── cast/
│   │   ├── fanout/
│   │   ├── consensus/
│   │   ├── voting/
│   │   └── evaluator/
│   ├── compute/
│   │   ├── worker/
│   │   ├── scheduler/
│   │   ├── gpu/
│   │   ├── webgpu/
│   │   └── distributed-inference/
│   ├── search/
│   │   ├── infomesh/
│   │   ├── crawler/
│   │   └── mcp-search/
│   ├── human/
│   │   ├── answer/
│   │   ├── verify/
│   │   ├── teach/
│   │   └── marketplace/
│   ├── knowledge/
│   │   ├── ingest/
│   │   ├── provenance/
│   │   ├── crdt/
│   │   ├── graph/
│   │   └── vector/
│   ├── trust/
│   │   ├── identity/
│   │   ├── reputation/
│   │   ├── web-of-trust/
│   │   ├── signatures/
│   │   └── anti-sybil/
│   ├── token-bank/
│   │   ├── contribution/
│   │   ├── compute/
│   │   ├── knowledge/
│   │   └── reputation/
│   ├── security/
│   │   ├── egress/
│   │   ├── credential-vault/
│   │   ├── sandbox/
│   │   ├── permissions/
│   │   └── audit/
│   └── adapters/
│       ├── webllm/
│       ├── ollama/
│       ├── openai/
│       ├── anthropic/
│       ├── gemini/
│       ├── openrouter/
│       ├── isek/
│       ├── society/
│       ├── agentfm/
│       ├── mycellm/
│       ├── p2ptokens/
│       └── infomesh/
```

### Core Data Flow

```
User Question
    ↓
Agent Router (capability/cost/trust scoring)
    ↓
┌─────────────────────────────────────────┐
│ AGENT CAST (parallel fanout)            │
├──────┬────────┬────────┬────────┬───────┤
│ WebLLM │ LLM  │ Human  │ Search │ P2P  │
│       │ Mesh  │ Agents │ (InfoMesh) Compute│
└──────┴────────┴────────┴────────┴───────┘
    ↓
Evaluator / Consensus (miroclaw-style)
    ↓
Verification (AI vs AI, AI vs Human, Source vs Source)
    ↓
Knowledge Engine (CRDT + Provenance)
    ↓
Knowledge Graph
    ↓
Token Bank (Contribution Credits)
    ↓
Reputation / Trust Update
    ↓
Network Grows
```

---

## Part 3: External Project Integration Strategy

### Tier 1 — Essential Adapters (Core Integration)

| Project | Repo | AgentMesh Package | Key Integration |
|---------|------|-------------------|-----------------|
| **ISEK** | isekOS/ISEK | `packages/agent/a2a/`, `packages/agent/identity/`, `packages/agent/discovery/` | Agent Card, A2A protocol, Discovery, ERC-8004 identity |
| **Society Protocol** | societycomputer/society-protocol | `packages/mesh/` | libp2p, GossipSub, Kad-DHT, CRDT knowledge pool, MCP/A2A bridge |
| **AgentFM** | Agent-FM/agentfm-core | `packages/compute/worker/`, `packages/compute/scheduler/` | P2P compute mesh, task dispatch, OpenAI-compatible worker API |
| **mycellm** | mycellm/mycellm | `packages/compute/distributed-inference/` | Heterogeneous GPU pool, QUIC transport, Ed25519 identity |
| **InfoMesh** | dotnetpower/infomesh | `packages/search/infomesh/` | Decentralized web search, Kademlia DHT, FTS5, MCP-native |
| **PinkyBrain** | PinkyBrain-ai/pinkybrain | `packages/trust/`, `packages/knowledge/crdt/` | CRDT, Web of Trust, Ed25519, reputation, specialist routing |
| **peerd** | NotASithLord/peerd | `packages/agent/browser/`, `packages/security/sandbox/` | Browser agent loop, WebRTC, sandboxed VM, actor isolation |
| **p2ptokens** | pur4v/p2ptokens | `packages/token-bank/compute/` | BitTorrent-style contribution accounting, upload/download ratio |

### Tier 2 — Functional Reference (Architecture Patterns)

| Project | Purpose | Reference For |
|---------|---------|---------------|
| **miroclaw** | Multi-agent consensus | `packages/cast/consensus/`, `packages/cast/voting/` |
| **nekoni** | Personal agent node | `packages/agent/registry/` (local node concept) |
| **NeuroMesh** | Public compute marketplace | `packages/compute/` (public/private/trusted compute separation) |
| **LLMesh** | Browser P2P mesh | `packages/mesh/webrtc/`, `packages/mesh/gossip/` |
| **TknGate** | Zero-trust gateway | `packages/security/egress/`, `packages/security/credential-vault/` |
| **distributed-ai-cluster** | GPU cluster architecture | `packages/compute/gpu/` |

### Integration Principle

**Core protocols owned by AgentMesh, external projects connected via Adapters:**

```
                 AgentMesh Core
                      │
        ┌─────────────┼─────────────┐
        │             │             │
      Protocol      Adapter       Reference
        │             │             │
       A2A          ISEK          miroclaw
       MCP          Society       NeuroMesh
       libp2p       AgentFM       LLMesh
       WebRTC       InfoMesh      nekoni
```

---

## Part 4: FreeLLMAPI Integration

### Role: LLM Provider Mesh Adapter

```
AgentMesh Router
    │
    ▼
┌─────────────────────────────────────┐
│ LLM PROVIDER MESH                   │
├─────────────────────────────────────┤
│ FreeLLMAPI Adapter                  │
│   ├── Gemini                        │
│   ├── Groq                          │
│   ├── Cerebras                      │
│   ├── Mistral                       │
│   ├── NVIDIA                        │
│   └── 20+ free providers            │
├─────────────────────────────────────┤
│ P2P Compute (AgentFM/mycellm)       │
├─────────────────────────────────────┤
│ WebLLM (Browser)                    │
└─────────────────────────────────────┘
```

### Routing Policy (Cost-Aware)

```typescript
type RoutingPolicy = {
  priority: "free" | "cheap" | "quality" | "latency" | "privacy" | "balanced";
  maxCost?: number;
};
```

**Tiered Fallback:**
```
General Query: WebLLM → FreeLLMAPI → P2P GPU → Paid API
Complex Query: FreeLLMAPI → P2P GPU → Claude/GPT
Urgent Query: Fastest Agent
High Accuracy: Agent Cast (5 LLMs) → Human Verify → Consensus
```

### FreeLLMAPI Code to Adopt (Adapter Pattern)

```
packages/adapters/freellmapi/
├── client.ts        # OpenAI-compatible HTTP client
├── adapter.ts       # AgentAdapter implementation
├── health.ts        # /v1/models + provider health
├── models.ts        # Model catalog (signed catalog)
├── routing.ts       # Smart routing / failover logic
├── quota.ts         # Rate limit / quota tracking
└── crypto.ts        # AES-256-GCM encrypted API keys (credential vault)
```

---

## Part 5: Full Screen Implementations

### Dashboard (Network Status)
- 1,284 Agents Online, 7,542 Human Agents, 328 LLM Providers, 4,821 MCP Servers, 12,438 Compute Nodes, 18.4M Knowledge Records
- Active Tasks: Researching, Coding, Verification, Translation, Data Analysis
- Network Activity counters

### Agent Mesh
- Visual router topology (User → Router → Gemini/Claude/Local/Web/MCP/Human/P2P)
- Agent cards with capabilities, latency, reputation, success rate
- Connect/Use/View Profile actions

### Agent Cast
- Question input → checkbox selection of agents → CAST button
- Real-time response streams from 8+ agents
- Consensus visualization (91.2%)
- Compare/Verify/Save Knowledge actions

### Human Agents
- Search by category (Vietnam, Crypto, AI, Korea, Business, Travel)
- Human agent cards: specialty, rating, answer count, verification rate
- "AI couldn't reach sufficient confidence. Ask Human Network?" flow

### Knowledge & Knowledge Graph
- Verified/Community/Human/AI/Web/Local knowledge tabs
- Graph view: nodes (AI, Agent, Human, Expert, Knowledge, Source, Model, MCP) with edges
- Click knowledge → see connected agents, humans, sources, documents

### Verification Center
- Pending verification queue (428 items)
- High priority claims
- Verification modes: AI vs AI, AI vs Web, AI vs Human, Human vs Human, Source vs Source
- Confidence scoring after verification

### LLM Mesh
- Provider list: Gemini, Claude, GPT, Mistral, Groq, Cerebras, OpenRouter, FreeLLMAPI, LocalAI, Ollama, WebLLM
- Router Policy: Best Quality / Lowest Cost / Fastest / Free First / Local First / Privacy First / Balanced / Custom

### MCP Marketplace
- Search MCP servers
- Popular: Web Search, Google Drive, GitHub, Database, Shopping, Finance, Maps, Email
- MCP cards: rating, users, tools count, latency, reliability, Install/Connect/Test

### Compute Mesh
- Online nodes: CPU (8,421), GPU (1,823), WebGPU (4,921), Mac (892), Linux (5,214), Windows (3,182)
- Total compute: 128.4 TFLOPS
- Share Compute: GPU selection, availability hours, Start Sharing

### P2P Network
- Peers: 1,284, Connected: 842, Searching: 127
- Data: 12.8 TB, Compute: 4.2 PFLOPS
- Tabs: Peers, Files, Models, Knowledge, Agents, Compute

### Token Bank
- Balance: 12,480 Credits, Earned Today: +320
- Contribution breakdown: Answer (+120), Verify (+80), Teach (+250), Compute (+40), P2P Compute (+300), MCP (+500), Knowledge (+200)

### Contribution & Reputation
- My Contributions: Answers (1,842), Verified (492), Knowledge (128), Compute Hours (83), MCP (12)
- Total: 98,421
- Reputation scores: Overall (98.4), Answer (97), Verification (99), Knowledge (96), Compute (98), Trust (99)
- Agents/LLMs/MCP/Compute Nodes/Knowledge all have reputation

### Marketplace
- Unified: Agents, Human Experts, MCP, Skills, Models, Knowledge, Compute, Workflows
- "AI Capability App Store"

### Projects
- Project-based workspace (not chat rooms)
- Each project: Agents, Knowledge, Tasks, Files, Workflows, Conversations, Contributions

### Workflow (React Flow style)
- Visual pipeline: Research → Web Search → LLM Cast → Human Verification → Knowledge Engine → Report

### Network Monitor
- Real-time metrics: agents, online, human agents, MCP, compute nodes, knowledge, requests/min, avg latency, success rate

### Settings
- Account, Privacy, Security
- AI Preferences, Routing, Models
- Network: P2P, WebRTC, Discovery
- Contributions: Token Bank, Reputation
- Agents, MCP, API, Developer

---

## Part 6: Sidebar Navigation (Final)

```
MUHAN AI
━━━━━━━━━━━━━━━━━━

🏠 Dashboard

NETWORK
◉ Agent Mesh
◉ Agent Cast
◉ Agents
◉ Human Agents
◉ P2P Network

INTELLIGENCE
◉ Knowledge
◉ Knowledge Graph
◉ Search
◉ Verification

AI RESOURCES
◉ LLM Mesh
◉ MCP / Skills
◉ Compute Mesh
◉ Models

MARKETPLACE
◉ Agents
◉ Human Experts
◉ MCP
◉ Knowledge
◉ Compute

ECONOMY
◉ Token Bank
◉ Contributions
◉ Reputation

WORKSPACE
◉ Projects
◉ Tasks
◉ Workflows

SYSTEM
◉ Network Monitor
◉ Settings
```

### Top Bar (Always Visible)
```
Ask the Network
──────────────────────────────
무엇이든 물어보세요...

[AI] [Agents] [Human] [Web] [Knowledge]
```

---

## Part 7: Implementation Priority

1. **Dashboard + Network Pulse + Feed API** (feed-api.ts, feed-store.ts) ✅
2. **Sidebar + Layout (Left/Center/Right)** ✅
3. **HelpNeeded + VerifyMe + HumanKnowledgeWanted** ✅
4. **AgentCast + TrendingQuestions** ✅
5. **Knowledge + KnowledgeGraph + Verification Center**
6. **Agent Mesh + Human Agents + LLM Mesh**
7. **MCP Marketplace + Compute Mesh + P2P Network**
8. **Token Bank + Contribution + Reputation**
9. **Projects + Workflows + Marketplace**
10. **Network Monitor + Settings + Security**

---

## Part 8: Design Principles

1. **Network First** — Show live network activity, not empty chat
2. **Human-AI Symmetry** — AI and Human as equal network participants
3. **Micro-Participation** — 3-second verify, 30-second answer, 3-minute teach
4. **Visible Rewards** — Credits always visible, gamified but meaningful
5. **Transparency** — AI confidence, consensus, sources, verification status
6. **Progressive Disclosure** — Simple entry → deep network access

---

## Part 9: Key Differentiators

| Traditional AI | MUHAN AI (AgentMesh) |
|----------------|---------------------|
| User ↔ AI | User → Network (AI + Human + Compute + Knowledge) |
| Single model | Agent Cast → Multiple agents → Consensus |
| Chat history | Knowledge Graph with provenance |
| No verification | Verification Center (AI vs AI, AI vs Human) |
| No economy | Token Bank + Contribution Ledger + Reputation |
| Centralized | P2P Mesh (libp2p, GossipSub, Kad-DHT, WebRTC) |
| Fixed models | LLM Mesh + FreeLLMAPI + P2P Compute + WebLLM |
| No human loop | Human Agents as first-class network nodes |
| No search | InfoMesh (decentralized MCP-native search) |
| No security | TknGate-style zero-trust gateway |

---

## Part 10: WebLLM Integration (Obsidian Note Reference)

**Key Insight**: WebLLM runs LLM entirely in browser via WebGPU/WASM.
- Zero server cost for small models
- Privacy-first (data never leaves browser)
- Integrates as `packages/adapters/webllm/` and `packages/compute/webgpu/`
- Falls back to FreeLLMAPI → P2P Compute → Paid API for larger models
- Enables "Personal Agent Node" (nekoni-style) on user's device

---

## Part 11: Tagline

> **“AI에게 질문하는 곳이 아니라, 함께 답을 만드는 네트워크.”**
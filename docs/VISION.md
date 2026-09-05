# Token-Free Gateway — Vision & Strategic Roadmap

## The Big Picture

**Token-Free Gateway** is not just an API proxy — it's the **universal translation layer** between the OpenAI ecosystem and the open web's AI providers. 

**AgentMesh** is the **decentralized coordination fabric** that turns isolated AI agents into a self-organizing network where:
- Agents discover each other
- Humans fill gaps AI cannot
- Knowledge is validated, priced, and traded
- Compute and skills are composable resources

---

## Core Thesis

> **"The future of AI isn't a single model — it's a network of specialized agents, human experts, and verifiable knowledge, all interoperable through open protocols."**

Token-Free Gateway provides the **protocol bridge** (OpenAI-compatible API).
AgentMesh provides the **coordination layer** (registry, cast, economy, reputation).

Together, they enable: **Any client → Any agent → Any human → Verified result.**

---

## Vision: The Three-Layer Stack

```
┌────────────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                               │
│  • Cursor / VS Code extensions    • Custom agents                  │
│  • LangChain / AutoGen / CrewAI   • Enterprise workflows          │
│  • OpenAI SDK clients (Python, JS, Go, Rust)                      │
└────────────────────────────────┬───────────────────────────────────┘
                                 │ OpenAI-compatible API
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                   COORDINATION LAYER (AgentMesh)                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │  Registry   │ │    Cast     │ │  Economy    │ │  Knowledge  │  │
│  │  Discovery  │ │  Fan-out    │ │  Credits    │ │  Graph      │  │
│  │  Health     │ │  Consensus  │ │  Reputation │ │  Search     │  │
│  │  Topology   │ │  Routing    │ │  Token Bank │ │  Verify     │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
└────────────────────────────────┬───────────────────────────────────┘
                                 │ Adapter Protocol
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│                     PROVIDER LAYER                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │
│  │Claude  │ │ChatGPT │ │DeepSeek│ │Gemini  │ │  ...   │  13+     │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                      │
│  │ Human  │ │  MCP   │ │ Compute│ │ Local  │  Extensible         │
│  │ Experts│ │ Skills │ │ Mesh   │ │ Models │  Adapters           │
│  └────────┘ └────────┘ └────────┘ └────────┘                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## Strategic Principles

| Principle | What It Means |
|-----------|---------------|
| **Protocol over Platform** | OpenAI API is the universal language; we speak it natively |
| **Local-First, Network-Optional** | Works offline with local models; gains superpowers when connected |
| **Human-in-the-Loop by Default** | AI asks humans when uncertain; humans teach AI continuously |
| **Verifiable Everything** | Knowledge has provenance; agents have reputation; rewards are auditable |
| **Composable Primitives** | Registry, Cast, Economy, Knowledge — each usable independently |
| **No Vendor Lock-in** | Bring your own Chrome, your own keys, your own infrastructure |

---

## Phase Roadmap

### ✅ Phase 1 — Foundation (Complete)
- [x] Token-Free Gateway: 13 providers, OpenAI-compatible, Function Calling
- [x] AgentMesh Core: Registry, Executor, MockAdapter, Cast, Fastify API
- [x] React Console: Basic dashboard with static feeds

### ✅ Phase 2 — Web Dashboard Architecture (Complete)
- [x] React Router v7 + Route Registry (33 pages)
- [x] Per-page module decomposition
- [x] Shared SpecPage wrapper, api.ts, layouts

### 🔄 Phase 3-A — Live Network Integration (In Progress)
- [x] AgentRegistry as live stats source (`/api/agents`, `/api/network`, `topology()`)
- [x] Agent Cast live execution (real agents, real routing)
- [x] SSE `/api/events` for real-time network pulse
- [x] Dashboard "Network Needs You" redesign
- [ ] **Fix AgentMeshPage.tsx build error** (blocker)
- [ ] Full SSE migration for all dashboard tickers
- [ ] Knowledge/Verification/Contributions real-time

### 📋 Phase 3-B — Intelligence Features (Next)
- [ ] **Agent Mesh Topology Visualization** — Interactive graph (React Flow)
- [ ] **Smart Routing** — Capability-based + cost/latency optimization
- [ ] **Agent Cast v2** — Streaming responses, partial consensus, fallback chains
- [ ] **Help Needed ↔ Human Agents Matching** — Auto-route questions to experts
- [ ] **Knowledge Graph Exploration** — Visual traverse, evidence chains

### 📋 Phase 4 — Economy & Marketplace
- [ ] **Token Bank** — Real credit balances, transfer, staking
- [ ] **Contribution Attribution** — Cryptographic proof of contribution
- [ ] **Reputation System** — Multi-dimensional scores (accuracy, helpfulness, speed)
- [ ] **Marketplace Listings** — Agents, Humans, MCP Skills, Compute, Knowledge
- [ ] **Escrow & Settlement** — Trust-minimized transactions

### 📋 Phase 5 — P2P & Decentralization
- [ ] **AgentMesh P2P** — Libp2p/WebRTC transport between registries
- [ ] **Distributed Registry** — No single coordinator; gossip-based discovery
- [ ] **Verifiable Credentials** — W3C VC for agent identity & capabilities
- [ ] **Cross-Network Cast** — Fan-out across federated AgentMesh instances

### 📋 Phase 6 — Ecosystem & Standards
- [ ] **OpenAPI Spec** — Formal spec for AgentMesh API
- [ ] **SDKs** — TypeScript, Python, Go, Rust
- [ ] **CLI** — `agentmesh` command for operators
- [ ] **Operator Dashboard** — Multi-tenant, monitoring, billing
- [ ] **Plugin Marketplace** — Community adapters, skills, workflows

---

## Key Differentiators

| Feature | Token-Free Gateway + AgentMesh | Traditional Approach |
|---------|-------------------------------|---------------------|
| **Cost** | $0 (browser sessions) | $100s–$1000s/month in API tokens |
| **Models** | 13+ web providers + local + human | 1–3 API providers |
| **Function Calling** | ✅ Full support via prompt injection | ✅ Native or ❌ Not supported |
| **Human-in-Loop** | Built-in (Help Needed, Verify, Teach) | Custom implementation |
| **Agent Network** | Registry + Cast + Economy + Reputation | Single-model calls |
| **Knowledge** | Verified, attributed, searchable, graph | RAG only (unverified) |
| **Deployment** | Single binary + Chrome | Complex infra (K8s, GPUs, etc.) |
| **Privacy** | Your browser, your sessions, your data | Vendor sees all prompts |

---

## Target Users & Use Cases

### 1. **AI Application Developers**
> "I want to build an AI app without managing API keys, quotas, or multiple SDKs."

**Solution:** Point OpenAI SDK at `localhost:3456` → access 13 models + function calling free.

### 2. **Agent Builders / Researchers**
> "I want to compose specialized agents (coding, search, reasoning, human) into workflows."

**Solution:** AgentMesh Registry + Cast — register agents, fan-out questions, get consensus.

### 3. **Domain Experts / Knowledge Workers**
> "I want to monetize my expertise by answering AI questions and verifying outputs."

**Solution:** Human Agents marketplace + Verify Me + Contribution Credits + Token Bank.

### 4. **Enterprises (Privacy-First)**
> "I need AI in my VPC with my data, my models, my compliance."

**Solution:** Self-hosted Gateway + local adapters + optional AgentMesh federation.

### 5. **Open Source Community**
> "I want to contribute adapters, skills, workflows to a shared ecosystem."

**Solution:** Plugin architecture, open protocols, reputation-weighted governance.

---

## Success Metrics (Phase 3-A → 4)

| Metric | Current | Target (Q4 2025) |
|--------|---------|------------------|
| Providers supported | 13 | 20+ |
| Agents in registry (demo) | ~5 Mock + Gateway | 50+ real adapters |
| Dashboard pages live | 33 | 33 (all real-time) |
| SSE-connected clients | 1 (dashboard) | 100+ concurrent |
| Cast success rate | ~80% (mock) | >95% (real) |
| Human experts registered | 0 | 100+ |
| Knowledge entries verified | 0 | 10,000+ |
| Daily active developers | ~10 | 500+ |

---

## Technical Debt & Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Browser dependency** | Chrome must run; CDP can break | Auto-restart, health checks, fallback to local models |
| **Provider site changes** | Selectors break, auth flows change | Abstract adapters; community-maintained; test suite |
| **SSE scaling** | EventSource per client; no horizontal scale yet | Redis pub/sub + multiple API instances (Phase 5) |
| **Single binary size** | ~100MB with Playwright | Acceptable; optional slim build without browsers |
| **TypeScript complexity** | Strict mode + ESM + cross-package refs | `tsconfig.base.json`; package-level typecheck |

---

## Open Questions for Community

1. **Token Economics**: Should TFG credits be on-chain (L2) or off-chain (centralized ledger)?
2. **Governance**: How do adapter maintainers get reputation? DAO? Core team?
3. **Federation Protocol**: Libp2p vs. custom gossip? Waku? Nostr?
4. **Verification Standard**: How to make "Verify Me" results portable across networks?
5. **MCP Integration**: Full MCP server support vs. skill-only adapters?

---

## Call to Action

**For Contributors:**
- Pick a page in `agentmesh/apps/web/src/pages/` — make it real-time
- Write an adapter for a new provider in `packages/adapters/`
- Add tests for routing edge cases in `packages/agent/`

**For Users:**
- Run `token-free-gateway webauth` → `token-free-gateway start`
- Point your OpenAI SDK at `http://localhost:3456/v1`
- Open `http://localhost:5173` (AgentMesh dashboard) — explore

**For Operators:**
- Deploy Gateway + AgentMesh API on a VM (2GB RAM, 1 vCPU sufficient)
- Configure `GATEWAY_URL` to point AgentMesh at your Gateway
- Enable `TFG_API_KEY` for multi-tenant auth

---

## Closing Thought

> **We're not building another AI wrapper. We're building the missing middleware that makes AI composable, verifiable, and accessible to everyone — without permission, without tokens, without walls.**

The gateway is the **door**. AgentMesh is the **city** behind it.

---

*Vision document — living, breathing, open to change. Last updated: 2025-09-04*
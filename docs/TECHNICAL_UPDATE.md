# Token-Free Gateway — Technical Update (2025-09-04)

## Executive Summary

This document summarizes the major technical changes and architectural improvements completed in **Phase 3-A** of the Token-Free Gateway project. The work focuses on the **AgentMesh** web dashboard — a real-time monitoring and control plane for the decentralized AI agent network.

---

## Phase 3-A Completed Work (3 Major Commits)

### 1. `dd6f034` — React Router & Route Registry Introduction
**Problem:** `App.tsx` contained a 36-branch `if/else` chain for routing, making it fragile and hard to maintain.

**Solution:**
- Introduced **react-router-dom v7** with a centralized route registry
- Created `routes/section-config.tsx` — single source of truth for all 33+ routes
- Each section declares: `id`, `path`, `label`, `navLabel`, `icon`, `component`
- Built `layouts/AppLayout.tsx` — common shell with Sidebar + TopBar + RightPanel

**Files Changed:**
- `apps/web/src/App.tsx` — simplified to 20 lines using `createBrowserRouter`
- `apps/web/src/routes/section-config.tsx` — 179 lines of route configuration
- `apps/web/src/layouts/AppLayout.tsx` — shared layout component

---

### 2. `d75ff65` — Per-Page Module Split
**Problem:** Monolithic `DashPages.tsx` (2000+ lines) and `SpecPages.tsx` were unmaintainable.

**Solution:** Decomposed into **33 individual page modules** organized by domain:

```
pages/
├── dashboard/     (11 pages: Dashboard, NetworkPulse, HelpNeeded, VerifyMe, etc.)
├── mesh/          (3 pages: AgentMeshPage, AgentCast, AgentsPage)
├── human/         (1 page: HumanAgentsPage)
├── knowledge/     (4 pages: KnowledgePage, KnowledgeGraphPage, SearchPage, VerificationPage)
├── ai/            (2 pages: LlmMeshPage, ModelsPage)
├── resources/     (3 pages: McpSkillsPage, ComputeMeshPage, P2pNetworkPage)
├── marketplace/   (1 page: MarketplacePage with 4 sub-views)
├── economy/       (3 pages: TokenBankPage, ContributionsPage, ReputationPage)
├── workspace/     (3 pages: ProjectsPage, TasksPage, WorkflowsPage)
└── system/        (2 pages: NetworkMonitorPage, SettingsPage)
```

**Shared Infrastructure:**
- `components/common/spec.tsx` — `SpecPage` wrapper with consistent header/subtitle/actions
- `services/api.ts` — centralized `load()`, `apiPost()`, and `useNetworkEvents()` SSE hook

---

### 3. `47f3d13` — Dashboard & Sidebar Redesign ("Network Needs You")
**Problem:** Dashboard was passive; sidebar grouping didn't reflect the agent-centric mental model.

**Solution:**

**Sidebar Restructure (8 groups):**
| Group | Icon | Sections |
|-------|------|----------|
| NETWORK | 🔥 | Dashboard, Questions, Verify, Unsolved |
| INTELLIGENCE | 🤖 | Agent Mesh, Agent Cast, LLM Mesh, Knowledge |
| HUMAN | 👤 | Human Agents, Experts, Teach AI |
| RESOURCES | ⚡ | MCP/Skills, Compute, Models |
| MARKETPLACE | 🛒 | Agents, Humans, Knowledge, Compute |
| ECONOMY | 💰 | Token Bank, Contributions, Reputation |
| WORKSPACE | 📁 | Projects, Tasks, Workflows |
| SYSTEM | ⚙ | Network Monitor, Settings |

**Dashboard Hero:**
- Bold "NETWORK NEEDS YOU" headline
- 5 real-time tickers (agents online, avg latency, new questions, verify requests, humans needed)
- `NetworkPulse` component now uses live SSE via `useNetworkEvents()`

---

## Phase 3-A Additional Progress (Post-Commits)

### 4. `2410940` — AgentRegistry as Live Network Stats Source
- **AgentMeshPage.tsx rewritten** to consume real `/api/agents` data
- **`registry.ts`**: Added `topology()` method returning agent graph (nodes + connections)
- **`server.ts`**: `/api/network` now returns `{ agents, total, byType, status, topology }`

### 5. Agent Cast — Live Execution
- Fixed `AgentCast.tsx` bug: `question: setQuestion` → `question` (value, not setter)
- Moved `toggleAgent` from module stub to component state
- Uses `apiPost` helper, loads real agents from `/api/agents`

### 6. WebSocket / Live Network (SSE)
- **`services/api.ts`**: Added `useNetworkEvents` hook (EventSource to `/api/events`)
- **`server.ts`**: `/api/events` SSE endpoint streaming `/api/stats` every 5 seconds
- **`NetworkPulse.tsx`**: Now displays live `agentsOnline`, `totalAgents`, `avgLatencyMs`

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Token-Free Gateway                        │
│  (OpenAI-compatible API server, port 3456)                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ GATEWAY_URL
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      AgentMesh API (Fastify)                     │
│  Port 3001 — /api/agents, /api/network, /api/events (SSE),      │
│  /api/cast, /api/pulse, /api/help-needed, /api/verify, ...      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ AgentRegistry
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Registry                              │
│  - MockAdapter (built-in)                                       │
│  - OpenAICompatibleAdapter → Token-Free Gateway                 │
│  - health checks every 30s                                      │
│  - topology() for network graph                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentMesh Web Dashboard                       │
│  React + React Router v7, 33 pages, SSE live updates            │
│  Served via Vite dev (5173) or built into API                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints (AgentMesh API — port 3001)

| Endpoint | Method | Description | Live Data Source |
|----------|--------|-------------|------------------|
| `/health` | GET | Health check | — |
| `/api/agents` | GET | All agent descriptors | `AgentRegistry.descriptors()` |
| `/api/network` | GET | Network stats + topology | `registry.stats()` + `registry.topology()` |
| `/api/network/stats` | GET | Detailed stats for mesh console | `networkStats()` + `registry.stats()` |
| `/api/events` | GET (SSE) | Live network stats stream | `registry.stats()` every 5s |
| `/api/pulse` | GET | Network pulse (dashboard tickers) | `registry.stats()` |
| `/api/cast` | POST | Fan-out question to agents | `AgentCast` + `AgentExecutor` |
| `/api/help-needed` | GET/POST | AI needs human questions | In-memory feed |
| `/api/verify` | GET/POST | Verification voting | In-memory feed |
| `/api/knowledge` | GET | Knowledge entries | In-memory feed |
| `/api/contributions` | GET | Contribution credits | In-memory feed |
| `/api/reputation` | GET | Reputation scores | In-memory feed |
| `/api/search` | GET | Global search | In-memory feed |

---

## Known Issues (As of 2025-09-04)

### 🔴 Critical: AgentMeshPage.tsx Build Error (Line 193)
```
Expected identifier but found "/"
```
**Cause:** Diff duplication during editing corrupted the file ending (`</Page>\n);\n}` appears twice with malformed JSX).

**Fix Required:** Rewrite the file from scratch or precisely replace the damaged section. The component logic is sound — only the closing JSX is malformed.

### 🟡 Pending: NetworkPulse → Live SSE Migration (Partial)
- `NetworkPulse.tsx` now uses `useNetworkEvents()` for `agentsOnline`/`totalAgents`/`avgLatencyMs`
- But `newQuestions`, `verifyRequests`, `humansNeeded`, `aiConflicts`, `knowledgeGaps` still come from `/api/pulse` (30s polling)
- **Next:** Extend SSE event types to include pulse metrics

### 🟡 Pending: Knowledge/Verification/Contributions/TokenBank Real-time
- Pages exist but use `load()` (one-time fetch) instead of `useNetworkEvents()` or polling
- Need to add SSE event types or polling intervals

---

## Next Steps (Phase 3-A #4–#5)

1. **Fix AgentMeshPage.tsx build error** — rewrite clean
2. **NetworkPulse full SSE** — add `pulse` event type to `/api/events`
3. **Real-time polling for Knowledge Engine** — `/api/knowledge`, `/api/verification`, `/api/search`
4. **Agent Mesh Topology Visualization** — SVG-based (current), migrate to React Flow later
5. **Contribution Credit / Token Bank SSE** — connect `/api/contributions` and `/api/reputation` to live feed

---

## Commands Reference

```bash
# From agentmesh/ directory
pnpm install           # Install deps
pnpm typecheck         # TypeScript check
pnpm test              # Vitest unit tests
pnpm build             # Build all packages
pnpm dev               # Dev: API (3001) + Web (5173)
pnpm dev:api           # API only
pnpm dev:web           # Web only

# From root (Token-Free Gateway)
bun install
bun run dev            # Gateway dev server (3456)
bun run build          # Compile standalone binary
bun run test           # Unit tests
bun run check          # Biome lint + format
```

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Bun over Node.js** | Native TypeScript, built-in test runner, faster builds, single binary compile |
| **React Router v7** | File-based routing not needed; programmatic router from registry is simpler |
| **Fastify for API** | Low overhead, native async, good TypeScript support |
| **SSE over WebSocket** | Simpler for server→client streaming; auto-reconnect via EventSource |
| **AgentRegistry as source of truth** | Single live registry feeds both API and dashboard; no stale caches |
| **Per-page modules** | Enables code-splitting, parallel development, easier testing |
| **SpecPage wrapper** | Consistent UX across 33 pages; single place to change layout |

---

## File Map (AgentMesh Web App)

```
agentmesh/apps/web/src/
├── App.tsx                          # Router setup (20 lines)
├── main.tsx                         # Entry point
├── style.css                        # Global styles
├── layouts/
│   └── AppLayout.tsx                # Sidebar + TopBar + RightPanel shell
├── routes/
│   └── section-config.tsx           # 33-section registry + sidebar groups
├── services/
│   └── api.ts                       # load(), apiPost(), useNetworkEvents()
├── components/
│   └── common/
│       └── spec.tsx                 # SpecPage wrapper
└── pages/
    ├── dashboard/ (11 files)
    ├── mesh/ (3 files)
    ├── human/ (1 file)
    ├── knowledge/ (4 files)
    ├── ai/ (2 files)
    ├── resources/ (3 files)
    ├── marketplace/ (1 file)
    ├── economy/ (3 files)
    ├── workspace/ (3 files)
    └── system/ (2 files)
```

---

*Generated from git history and codebase analysis on 2025-09-04*
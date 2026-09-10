# Package Naming Unification Plan

## Current State Analysis

### Packages Mentioned in Docs (VISION.md / README)

| Doc Name | Actual Folder | Status |
|----------|--------------|--------|
| agent-router | agent-router | ✅ Match |
| agent-mesh | agent-mesh | ✅ Match |
| agent-cast | agent-cast | ✅ Match |
| personal-mcp | personal-mcp | ✅ Match |
| knowledge-base | knowledge-base | ✅ Match |
| category-engine | category-engine | ✅ Match |
| llm-router | llm-router | ✅ Match |

### Packages NOT in Docs (Need Naming)

| Current Folder | Proposed Name | Purpose |
|----------------|---------------|---------|
| agent-core | `@agentmesh/core` | Core interfaces & types |
| compute | `compute-market` | Compute sharing marketplace |
| credits | `credit-system` | Token economy & credits |
| db | `database` | Prisma client & DB layer |
| federation-transport | `federation` | ActivityPub federation |
| gateway | `agent-gateway` | Protocol gateway |
| muhan-agent | `agent-daemon` | Local agent daemon |
| p2p | `peer-mesh` | P2P networking |
| shared | `@agentmesh/shared` | Shared types & utils |

### New Packages (Already Named)

| Folder | Purpose | Status |
|--------|---------|--------|
| computer-use | AI desktop control | ✅ New |
| browser-use | Browser automation | ✅ New |

## Unified Naming Convention

### Format
- Scope: `@agentmesh/*`
- Pattern: `{domain}-{function}` or `{domain}`
- Examples:
  - `agent-router` (domain: agent, function: routing)
  - `knowledge-base` (domain: knowledge, function: base)
  - `peer-mesh` (domain: peer, function: mesh)

### Domain Prefixes
- `agent-*` → Agent-related (router, mesh, cast, daemon, gateway)
- `knowledge-*` → Knowledge-related (base)
- `compute-*` → Compute-related (market)
- `credit-*` → Economy-related (system)
- `peer-*` → P2P-related (mesh)
- `personal-*` → User-related (mcp)
- `category-*` → Taxonomy-related (engine)
- `llm-*` → LLM-related (router)
- `semantic-*` → Consensus-related (vote)
- `federation-*` → Federation-related

## Migration Steps

1. Rename folders
2. Update package.json `name` fields
3. Update all import statements
4. Update VISION.md / README.md
5. Update architecture diagrams

## Target Architecture Diagram

```
AgentMesh OS (monorepo)
├── agent-router      → question routing & classification
├── agent-mesh        → P2P agent discovery & A2A
├── agent-cast        → multi-agent consensus (Director → Collaborators → Synthesizer)
├── agent-daemon      → local agent runtime (was muhan-agent)
├── agent-gateway     → protocol gateway (was gateway)
├── personal-mcp      → user-owned MCP servers
├── knowledge-base    → hybrid semantic search (BGE-M3 + pgvector)
├── category-engine   → taxonomy & jurisdiction
├── llm-router        → multi-LLM fallback & routing
├── compute-market    → compute sharing marketplace (was compute)
├── credit-system     → token economy & credits (was credits)
├── peer-mesh         → P2P networking (was p2p)
├── federation        → ActivityPub federation (was federation-transport)
├── computer-use      → AI desktop control (NEW)
├── browser-use       → browser automation (NEW)
├── semantic-vote     → semantic voting & verification
├── hivebear          → HiveBear integration
├── noema             → AI service integration
├── database          → Prisma client & DB layer (was db)
└── shared            → shared types & utilities
```

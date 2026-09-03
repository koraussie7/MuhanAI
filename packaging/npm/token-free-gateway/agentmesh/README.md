# AgentMesh
AgentMesh is a TypeScript monorepo for routing questions across local, remote, P2P, MCP, and human agents. Phase 1 focuses on a usable local path: shared contracts, an in-memory registry, deterministic routing, a mock adapter, and a small React console.

## Status
This repository is an implementation scaffold. External provider adapters, persistence, WebRTC, and production authentication are intentionally deferred.

## Requirements
- Node.js 20+
- pnpm 10+

## Commands
```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Run the API or web app alone with `pnpm dev:api` or `pnpm dev:web`.

## Packages
- `@agentmesh/core` — shared request, result, agent, knowledge, and contribution contracts
- `@agentmesh/adapters` — adapter interface plus mock and WebLLM boundary
- `@agentmesh/agent` — registry and execution services
- `@agentmesh/router` — policy-driven agent selection
- `@agentmesh/cast` — fan-out and consensus orchestration
- `@agentmesh/api` — Fastify HTTP/WebSocket boundary
- `@agentmesh/web` — Vite/React operator console
## Design principles
1. Keep provider-specific code behind `AgentAdapter`.
2. Treat unverified model output as a result, never as validated knowledge.
3. Keep routing and scoring deterministic and testable.
4. Do not expose secrets to browser bundles.
5. Add persistence and network protocols only behind interfaces.

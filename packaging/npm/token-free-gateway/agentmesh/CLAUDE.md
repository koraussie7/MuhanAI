

# File: agentmesh/CLAUDE.md
## 7. Implementation Status and Commands
The repository is being implemented incrementally. Phase 1 currently provides shared TypeScript contracts, an in-memory agent registry and executor, deterministic routing, a mock adapter, a WebLLM boundary adapter, Agent Cast fan-out/consensus, a Fastify API, and a small React/Vite console. The human, knowledge, token-bank, P2P, and MCP packages currently expose interfaces only.

Run commands from the `agentmesh/` directory:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

Use `pnpm dev:api` for the API on `http://127.0.0.1:3001` and `pnpm dev:web` for the Vite app on `http://localhost:5173`. Infrastructure is optional: `docker compose --profile infra up -d` starts PostgreSQL/pgvector and Redis.

## 8. Code Conventions
- Use TypeScript in strict mode and ESM imports with explicit `.js` extensions in package source.
- Import shared contracts from `@agentmesh/core`; keep provider-specific behavior behind `AgentAdapter`.
- Prefer small, pure functions for routing, scoring, filtering, aggregation, and validation.
- Keep packages independently buildable with `pnpm --filter <package> build`.
- Use Vitest for behavior tests. Test routing boundaries, empty inputs, unavailable agents, adapter failures, and consensus ties.
- Validate and normalize API input at the HTTP boundary. Never trust browser-provided agent IDs or metadata.
- Use `crypto.randomUUID()` for request IDs and timestamps in milliseconds.
- Keep public interfaces documented when behavior is not obvious.

## 9. Don'ts
- Do not commit API keys, cookies, session exports, `.env` files, database credentials, or generated `dist/` output.
- Do not store raw model output as validated knowledge; route it through evidence, provenance, and validation first.
- Do not make browser code depend on server-only secrets or Node-only modules.
- Do not silently fall back from a requested agent to a different provider; report selection and execution failures.
- Do not introduce a database, blockchain, WebRTC transport, or external LLM SDK without an interface and tests.
- Do not change the `token-free-gateway` package outside `agentmesh/` unless the task explicitly requires it.

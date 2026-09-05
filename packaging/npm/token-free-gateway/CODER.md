# Project Memory

Conventions for this project. The model reads this on every session.

## Build & test
The original npm package is a packaging shim. Run its checks from this directory with `npm pack --dry-run` and `npm publish --dry-run` when validating package contents. The AgentMesh implementation is isolated under `agentmesh/`; run `pnpm install`, `pnpm typecheck`, `pnpm test`, and `pnpm build` there.

## Code style
- Use strict TypeScript and ESM where working in `agentmesh/`.
- Keep provider-specific behavior behind `AgentAdapter` and shared contracts in `@agentmesh/core`.
- Prefer small, testable pure functions and explicit error handling.
- Do not include secrets or generated output in commits.

## Don'ts
- Do not rewrite or remove the existing `token-free-gateway` packaging files when working on AgentMesh.
- Do not commit credentials, browser sessions, `.env` files, `node_modules`, or `dist`.
- Do not claim a feature is production-ready when it is only an interface or scaffold.
- Do not store unvalidated AI output as knowledge.

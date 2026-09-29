---
name: muhanai-a2a-development
description: Develop or review MuhanAI A2A client/server behavior, Agent Cards, JSON-RPC tasks, streaming, and push notifications with focused tests.
---

# MuhanAI A2A Development
Keep A2A protocol changes isolated from unrelated gateway or UI work.

## Workflow
1. Inspect the A2A client, server routes, shared protocol types, and existing tests.
2. Preserve JSON-RPC 2.0 envelopes and explicit task lifecycle states.
3. Add regression coverage for the changed transport or route contract.
4. Run `pnpm vitest run services/api/src/a2a-routes.test.ts packages/agent/src/a2a.test.ts`.
5. Run `pnpm run typecheck` before proposing a merge.

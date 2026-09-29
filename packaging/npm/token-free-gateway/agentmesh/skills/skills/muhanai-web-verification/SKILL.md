---
name: muhanai-web-verification
description: Change or review the MuhanAI web application and verify routes, interactions, type safety, production builds, and browser-visible behavior.
---

# MuhanAI Web Verification

Prefer the existing React components, route registry, and visual language. Keep user-visible actions connected to a real API contract.

## Workflow

1. Inspect the route, component, API helper, and existing page patterns.
2. Implement the smallest accessible interaction with loading and error states.
3. Run `pnpm --filter @agentmesh/web run typecheck`.
4. Run `pnpm --filter @agentmesh/web run build`.
5. If browser automation is available, smoke-test the changed route and report console/network failures.

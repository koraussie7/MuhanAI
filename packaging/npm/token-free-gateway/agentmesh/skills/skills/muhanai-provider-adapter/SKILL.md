---
name: muhanai-provider-adapter
description: Add or change a MuhanAI provider adapter, browser-backed client, authentication flow, or streaming implementation with regression coverage.
---

# MuhanAI Provider Adapter

Follow the existing provider shape and keep browser/session behavior testable.

## Workflow

1. Inspect the provider registry, shared types, auth store, and neighboring providers.
2. Keep authentication, client requests, and streaming in their existing provider modules.
3. Handle expired sessions, malformed upstream responses, and cancellation explicitly.
4. Add deterministic tests for success, failure, and streaming boundaries.
5. Run the relevant provider tests, `pnpm run typecheck`, and `pnpm test` when practical.

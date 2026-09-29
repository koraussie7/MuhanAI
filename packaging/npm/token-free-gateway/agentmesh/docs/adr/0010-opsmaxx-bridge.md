# ADR 0010 — OpsMaxx bridge for MuhanAI

- Status: Proposed
- Date: 2026-09-28
- Deciders: MuhanAI core maintainers
- Tracks: T1 (this ADR), T2, T3, T4, T5, T6

## Context

[MuhanAI's North Star](https://github.com/koraussie7/MuhanAI) is a
"token-free, browser-native, P2P-augmented AI workspace" that today
already integrates with multiple model providers through the
`@agentmesh/agent-gateway` and `@agentmesh/personal-mcp` packages. The
agent daemon (`packages/agent-daemon/`) currently holds user secrets in
its own PBKDF2 vault (`credentials-vault.ts`) and exposes them to
attached agents through a single `vault-get` capability.

Engineers increasingly want to operate real infrastructure on behalf of
the user: tail a log on a bastion, run a query against a production
Postgres, open an SSH tunnel, or apply a migration. Doing that safely
from a browser-only agent requires an on-host component that already
holds the credentials, mediates every action, and can present a
human-in-the-loop approval card to the user.

[OpsMaxx](https://github.com/OpsMaxx/OpsMaxx) is a free, MIT-licensed
desktop app that does exactly that: SSH/SFTP, tunnels, a multi-engine
database client, an encrypted secrets vault, and a Model Context
Protocol bridge for Claude Code, Claude Desktop, Codex and Gemini CLI.
It already runs an MCP server, holds a per-machine identity, and prompts
the user for approval before sensitive actions.

The simplest possible integration is to call OpsMaxx as an external
subprocess. The risk is that "simplest" quietly becomes a runtime
dependency on Electron internals across `@agentmesh/agent-daemon`,
`services/api`, and the DaedalOS desktop shell (`apps/desktop`).

## Decision

We introduce a single new package, `@agentmesh/opsmaxx-bridge`, that
defines a narrow `OpsMaxxBridge` contract (`packages/opsmaxx-bridge/src/types.ts`).
Every other package in the monorepo depends on this contract and on
this contract only.

Two implementations are provided behind one factory:

1. `createIpcBridge()` — production, talks to the locally running
   OpsMaxx daemon over stdio/IPC. T1 ships the _seam_ (factory and
   types); the wire protocol is T1 Phase 2.
2. `createInMemoryBridge()` — used by all tests and by T2–T5 during
   development so work can proceed before the IPC client lands.

Three explicit non-goals:

- OpsMaxx is **not** an identity issuer. The HMAC `sub` claim verified
  by `services/api/src/list-routes.ts:resolveOwner` remains
  authoritative. OpsMaxx is a _credential bridge_; it stores secrets,
  not users.
- Secrets **never** cross the bridge in plaintext. `vault.get()`
  returns metadata only; the MCP layer that calls into OpsMaxx does not
  see the secret either.
- We do **not** link OpsMaxx's Go/TypeScript code into our binary.
  OpsMaxx runs out-of-process; we are an external client, not a fork.
  This keeps the MIT license of both projects clean and avoids any
  Electron version skew.

## Consequences

Positive:

- T2, T3, T4, T5 can run in parallel once T1 ships the types. The
  in-memory mock is the contract test fixture for all of them.
- Risk classes (`RISK` map in `types.ts`) are declared once and
  consumed by the MCP router (`services/api/src/mcp-routes.ts`) to
  drive human-in-the-loop approval. A write to production Postgres is
  `high-risk-needs-double-approval` everywhere by construction.
- The `approval_required` / `approval_denied` `BridgeError` codes map
  cleanly to the existing `clientError` helper used by `list-routes.ts`,
  so no new error surface is invented.

Negative:

- We take on a dependency on an external MIT-licensed project. If
  OpsMaxx is abandoned we can swap implementations; the contract is
  the only thing we own.
- T1 Phase 2 (the IPC client) is the single hardest item in the whole
  integration. Until it lands, "production" really means "demo against
  the in-memory bridge."

## Open questions

1. Does OpsMaxx expose a stable embed endpoint for the iframe variant
   of T5, or do we need to render via WebView? (Tracked in T5.)
2. Should `approval_required` errors carry an `ApprovalCard` payload
   so the model can show a structured prompt without round-tripping
   to `requestApproval` first? (Tracked in T3.)

## References

- `packages/agent-daemon/src/credentials-vault.ts:60-107` — existing
  vault; the OpsMaxx bridge is additive.
- `services/api/src/list-routes.ts:52-75` — owner resolution. OpsMaxx
  does not participate.
- `services/api/src/mcp-routes.ts:455-479` — existing one-click MCP
  client config; the OpsMaxx config is added in the same shape.
- `packages/peer-mesh/src/identity.ts:38-40` — Ed25519 machine
  identity; OpsMaxx uses the same primitive.
- OpsMaxx README: https://github.com/OpsMaxx/OpsMaxx

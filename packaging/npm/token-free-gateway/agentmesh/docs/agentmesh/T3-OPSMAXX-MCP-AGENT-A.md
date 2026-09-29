촏차# T3-A — OpsMaxx MCP *Read-Only / Safe* Tool Surface

> **Track**: T3-A (parallel to T3-B)
> **Owner agent**: `opsmaxx-mcp-shaper-safe`
> **Branch**: `feat/opsmaxx/mcp-safe`
> **Worktree**: `../muhanai-opsmaxx-mcp-safe`
> **Days**: 7 (in parallel with T3-B's 7 days)
> **Touches**:
>   - `services/api/src/opsmaxx-mcp-routes.ts` (new, agent-A owns)
>   - `packages/opsmaxx-bridge/src/types.ts` (read-only; T1)
>   - `services/api/src/mcp-routes.ts` (config block only; T6 wiring)

## Goal

Ship the **read-only / safe** half of the OpsMaxx MCP surface so the
agent can enumerate, inspect, and read from the user's infrastructure
**without ever** triggering a human-in-the-loop gate. This is the
"boring" half of the integration but it is the surface the agent will
use 90% of the time, so it has to be solid.

The companion track T3-B ships the *write / dangerous* half under
`opsmaxx-mcp-routes-writes.ts` and lands in parallel on the same
`services/api/src/mcp-routes.ts` config block (T3-A adds a route
registration line; T3-B adds another; T6 wires both into the
`opsmaxxConfig` block).

## Scope (8 tools)

| # | Tool name | Bridge call | Risk class | Output |
|---|---|---|---|---|
| 1 | `opsmaxx_ssh_list` | `bridge.ssh.listConnections()` | `safe` | `SshConnection[]` |
| 2 | `opsmaxx_db_list` | `bridge.databases.listConnections()` | `safe` | `DbConnection[]` |
| 3 | `opsmaxx_vault_list` | `bridge.vault.list()` | `safe` | `VaultEntry[]` (metadata only, never secrets) |
| 4 | `opsmaxx_sftp_read` | (read-only SFTP, new in T1 Phase 2) | `safe` | text/binary base64 |
| 5 | `opsmaxx_db_query` | `bridge.databases.query()` | `safe` | `DbResultSet` |
| 6 | `opsmaxx_ssh_session_open` | `bridge.ssh.open()` | `safe` | `SshSession` (returns `sessionId` only; no exec) |
| 7 | `opsmaxx_approval_status` | `bridge.security.isApprovedByUser()` | `safe` | `{ approved: boolean }` |
| 8 | `opsmaxx_whoami` | local | `safe` | `{ bridge: "ipc"|"memory", services: number }` |

All 8 tools resolve to `RISK.safe` in
`packages/opsmaxx-bridge/src/types.ts`. They **never** call
`bridge.security.requestApproval` and they **never** write.

## Non-goals (T3-B's responsibility, do NOT touch)

- `opsmaxx_ssh_exec` — write side effect
- `opsmaxx_sftp_write` — write side effect
- `opsmaxx_db_write` — high-risk, double-approval
- `opsmaxx_tunnel_open` — side effect
- `opsmaxx_vault_set` — high-risk, double-approval
- `opsmaxx_vault_remove` — side effect
- `opsmaxx_approval_request` — mutates approval state
- `opsmaxx_mcp_bridge_*` — bidirectional; T1 Phase 2 only

If a write tool is needed, file a follow-up and let T3-B land it. Do
not implement it under T3-A even if "it's just one line".

## Deliverables

1. `services/api/src/opsmaxx-mcp-routes.ts` — Fastify plugin exposing
   the 8 tools over JSON-RPC 2.0 at `POST /api/opsmaxx-mcp/rpc` (a
   separate path from the existing `/api/mcp/rpc` so T3-B can land on
   a different prefix without collision).
2. `services/api/src/opsmaxx-mcp-routes.test.ts` — vitest with at
   least 6 cases, all using `createInMemoryBridge()` from
   `@agentmesh/opsmaxx-bridge/mock`:
   - `opsmaxx_ssh_list` returns seeded connections.
   - `opsmaxx_vault_list` returns metadata only (no `secret` field).
   - `opsmaxx_db_query` returns rows with `columns` aligned to
     `DbResultSet`.
   - `opsmaxx_whoami` returns the bridge mode and a service count.
   - Unknown tool name returns a `METHOD_NOT_FOUND` JSON-RPC error.
   - Bridge `Result.err` is mapped to `clientError()` and never leaks
     the raw `BridgeError` message to the model.
3. A single line edit in `services/api/src/mcp-routes.ts` inside the
   existing one-click config block (around line 455) that registers
   `opsmaxxConfig` *with T3-B's tools added by T3-B*. **Coordinate with
   T3-B via the shared config comment**; do not overwrite their
   additions.
4. An entry in `docs/agentmesh/OPSMAXX-INTEGRATION.md` (the doc
   already exists from the earlier README draft) for the safe tools.

## Risks to handle

- **Result type drift.** T1's bridge uses `{ ok: true, value } | { ok: false, error }`,
  not `neverthrow`. Do NOT call `.isOk()` / `.isErr()`. Use the
  `unwrapResult` helper you'll add to `opsmaxx-mcp-routes.ts` at
  the top of the file.
- **Secret leakage.** `bridge.vault.list()` returns `VaultEntry`
  which has `hasSecret: boolean` but never the secret. Make sure the
  MCP `outputSchema` of `opsmaxx_vault_list` does not include
  `secret`. Add an explicit test that asserts this.
- **Schema drift.** `McpToolDefinition` requires `inputSchema` even
  for tools with no args. Use `{ type: "object", properties: {} }`
  with no `required` field. The validator at
  `services/api/src/mcp-routes.ts` will reject malformed schemas.

## Hand-off

When T3-A is done:

- Open a PR titled `feat(opsmaxx): safe MCP tool surface (T3-A)`.
- Tag `@opsmaxx-mcp-risk` (T3-B) for the audit log hooks; the audit
  log itself is T3-B's deliverable but the call sites of the safe
  tools must emit a `bridge_call` event.
- Update `docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md` with the actual
  days taken.

## Definition of done

- [ ] `pnpm --filter @agentmesh/api typecheck` passes.
- [ ] `pnpm --filter @agentmesh/api test` passes with ≥ 6 new cases.
- [ ] No write capability is reachable from `/api/opsmaxx-mcp/rpc`.
- [ ] `services/api/src/mcp-routes.ts` config block has the T3-A
      `opsmaxxConfig` line, with T3-B's additions preserved (or T3-B
      merged first — coordinate order on the PR).
- [ ] `docs/agentmesh/OPSMAXX-INTEGRATION.md` lists the 8 tools with
      a one-line description each.
- [ ] `RISK` registry in `packages/opsmaxx-bridge/src/types.ts`
      contains an entry for every tool name this track shipped. Add
      the missing ones in the same PR; do not split it.

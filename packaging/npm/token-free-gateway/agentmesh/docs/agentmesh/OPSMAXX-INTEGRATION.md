# OpsMaxx × MuhanAI — Integration Overview

> Draft for the English README. The expanded, multi-language versions
> are tracked under T6.

## What you get

MuhanAI's agent mesh can now operate real infrastructure on your
behalf, end-to-end, **without your API keys ever leaving your
machine**:

| Capability | What the agent can do                      | What stays on your machine      |
| ---------- | ------------------------------------------ | ------------------------------- |
| SSH        | open sessions, exec commands, tail logs    | every command prompts you first |
| SFTP       | read and write files                       | writes prompt you first         |
| Databases  | run read queries, apply writes             | writes require double approval  |
| Tunnels    | open SOCKS5 / WireGuard / OpenVPN forwards | every open prompts you first    |
| Vault      | read metadata, store new secrets           | secrets never leave OpsMaxx     |

The integration is wired through a single new package,
[`@agentmesh/opsmaxx-bridge`](../adr/0010-opsmaxx-bridge.md), and
follows the same MCP surface that Claude Code, Claude Desktop, Codex
and Cline already use against the MuhanAI gateway.

## How it fits together

```
┌──────────────────┐
│  MuhanAI Web UI  │  ← user sees prompts, approves writes
│  (muhanai.com)   │
└────────┬─────────┘
         │ OpenAI-compatible + MCP
         ▼
┌──────────────────┐  OpsMaxxBridge contract  ┌──────────────────┐
│  agent-gateway   │  ←——————————————————→  │  OpsMaxx desktop  │
│  + agent-daemon  │     stdio / IPC          │  (Electron)       │
│  + mcp-routes    │                          │  • SSH/SFTP/DB    │
│  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • approval card  │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  other agents / other machines / bot.muhanai.com lists
```

Three properties hold by construction:

1. **No secret ever crosses the bridge.** `bridge.vault.get()`
   returns metadata only. The agent sees `hasSecret: true` and a
   timestamp, never the key itself.
2. **No identity is borrowed from OpsMaxx.** Owner resolution still
   goes through the HMAC `Authorization: Bearer <token>` verified by
   [`services/api/src/list-routes.ts:resolveOwner`](../services/api/src/list-routes.ts).
3. **No code is linked from OpsMaxx.** OpsMaxx runs out-of-process;
   we are an external client, not a fork. Both projects stay MIT.

## Threat model in one paragraph

The most dangerous failure mode in a "browser agent" is the model
issuing `DROP TABLE users;` without the user seeing it. The integration
treats every action as belonging to one of three risk classes
(`safe` / `needs-approval` / `high-risk-needs-double-approval`, declared
once in `packages/opsmaxx-bridge/src/types.ts`). The MCP layer in
`services/api/src/mcp-routes.ts` looks up the class for each tool and
routes through the existing human-in-the-loop guardrail before the
call is forwarded to OpsMaxx. Audit log lines are emitted at the
bridge boundary, so a model decision can be reconstructed after the
fact.

### Threat model: write tools and their gates (T3-B)

The write surface lives at `POST /api/opsmaxx-mcp/writes`
(`services/api/src/opsmaxx-mcp-writes.ts`). Every call — including
denials and errors — emits exactly one `bridge_call` audit line
(`services/api/src/audit/bridge-call-log.ts`) containing
`{ ts, capability, argsHash, risk, verdict, durationMs, errorCode? }`.
The log records a **SHA-256 `argsHash`, never the raw args**, so a
`vault_set` secret or an inline credential in an `ssh_exec` command
cannot leak through the audit trail.

| Tool | Risk class | Gate | Custom error codes |
| ---- | ---------- | ---- | ------------------ |
| `opsmaxx_ssh_exec` | `needs-approval` | per-call approval card | 4001, 4003 |
| `opsmaxx_sftp_write` | `needs-approval` | per-call approval card | 4001, 4004 (bridge call: T1 Phase 2) |
| `opsmaxx_db_write` | `high-risk-needs-double-approval` | approval card **+** `typedConfirm` = `connectionId` | 4001, 4002, 4003 |
| `opsmaxx_tunnel_open` | `needs-approval` | per-call approval card | 4001, 4004 (bridge call: T1 Phase 2) |
| `opsmaxx_vault_set` | `high-risk-needs-double-approval` | approval card **+** `typedConfirm` = service name | 4001, 4002, 4003 |
| `opsmaxx_vault_remove` | `needs-approval` | per-call approval card | 4001, 4003 |
| `opsmaxx_approval_request` | `safe` | n/a — it *issues* the card; unlocks only the exact `(capability, argsHash)` pair | 4003 |

Error codes: `4001 RESULT_DENIED`, `4002 RESULT_DOUBLE_CONFIRM_MISMATCH`,
`4003 RESULT_INVALID_ARGS` (including an unknown `sessionId`),
`4004 RESULT_CAPABILITY_UNAVAILABLE`.

Properties this table is meant to enforce:

1. **Approval-cache poisoning.** Approvals are keyed by the exact
   `(capability, SHA-256(args))` pair; an approval for one call never
   unlocks a different call.
2. **Double confirmation.** High-risk tools re-verify `typedConfirm` on
   *every* call, even one that already carries an approval.
3. **No raw-args logging.** The audit sink rejects raw args by design
   (see the comment block in `audit/bridge-call-log.ts`).
4. **No bridge-error leakage.** Raw `BridgeError` messages stay on the
   server; the model sees a masked `failed at the bridge` message
   (except `invalid_args`, which only echoes caller-supplied ids).

## Quick start (developer)

```bash
# 1. Install OpsMaxx
#    https://github.com/OpsMaxx/OpsMaxx (free, MIT, no account)
#
# 2. Add the SSH / DB / vault entries you want the agent to use.
#    Every entry shows up in the MuhanAI dashboard as a "Trusted peer".
#
# 3. Run the MuhanAI agent-daemon locally. It picks up OpsMaxx
#    automatically when both processes are running on the same host.
cd packaging/npm/token-free-gateway/agentmesh
pnpm install
pnpm --filter @agentmesh/opsmaxx-bridge typecheck
pnpm --filter @agentmesh/opsmaxx-bridge test
```

## Quick start (end user)

1. Install [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx).
2. Sign in to [muhanai.com](https://muhanai.com) and open the
   _Trusted peers_ page (P2P → OpsMaxx).
3. Pair the local OpsMaxx instance by clicking "Approve" on the
   approval card that pops up in OpsMaxx.
4. Ask the agent anything that needs real infrastructure. Watch the
   approval cards stream in.

## Status

- **T1** (bridge contract + in-memory mock): landed — see ADR 0010.
- **T2** (vault two-way sync): in progress.
- **T3-A** (MCP safe tool surface, 8 read-only tools): landed.
- **T3-B** (MCP write surface + audit): in progress.
- **T4** (P2P mesh UI for OpsMaxx peers): in progress.
- **T5** (DaedalOS embedded OpsMaxx window): in progress.
- **T6** (docs in 6 languages, blog post, packaging): in progress.

## T3-A Safe Tool Surface (8 tools)

| Tool | Bridge call | Risk | Output | Notes |
|------|-------------|------|--------|-------|
| `opsmaxx_ssh_list` | `bridge.ssh.listConnections()` | safe | `SshConnection[]` | Lists all configured SSH connections |
| `opsmaxx_db_list` | `bridge.databases.listConnections()` | safe | `DbConnection[]` | Lists all configured database connections |
| `opsmaxx_vault_list` | `bridge.vault.list()` | safe | `VaultEntry[]` | Metadata only; secrets never exposed |
| `opsmaxx_sftp_read` | `bridge.sftp.read()` | safe | text/binary base64 | Read-only SFTP (requires T1 Phase 2 bridge) |
| `opsmaxx_db_query` | `bridge.databases.query()` | safe | `DbResultSet` | SELECT queries only (read-only) |
| `opsmaxx_ssh_session_open` | `bridge.ssh.open()` | safe | `SshSession` | Returns `sessionId` only; no exec |
| `opsmaxx_approval_status` | `bridge.security.isApprovedByUser()` | safe | `{ approved: boolean }` | Check if capability pre-approved |
| `opsmaxx_whoami` | local | safe | `{ bridge: "ipc"|"memory", services: number }` | Bridge introspection |

All 8 tools are classified as `RISK.safe` in `packages/opsmaxx-bridge/src/types.ts`. They **never** call `bridge.security.requestApproval` and they **never** write.

Endpoint: `POST /api/opsmaxx-mcp/rpc` (separate from `/api/mcp/rpc` so T3-B's write surface can land on a different prefix without collision).

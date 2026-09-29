---
title: "Token-Free Infrastructure Access: How MuhanAI × OpsMaxx Hands the Keys Back to the User"
slug: "token-free-infrastructure-access"
date: 2026-09-28T10:00:00+09:00
lastmod: 2026-09-28
draft: false
series: ["Network Needs You"]
seriesOrder: 5
categories: ["Engineering", "Integration"]
tags: ["OpsMaxx", "MCP", "P2P", "token-free", "approval", "audit", "bridge"]
description: "We added real SSH, SFTP, database, and tunnel access to a token-free AI agent mesh without ever holding a single API key. Here is what we built, what it cost, and where the seams are."
---

A browser-native agent that can tail a production log is a security
nightmare. A browser-native agent that can tail a production log
**after the user has personally approved that one command** is a
useful tool. The difference is not technology — it is where the
secrets live and who has to say "yes" before the model acts.

Today we are shipping the [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx)
× MuhanAI integration. The headline numbers:

- **8 read-only MCP tools** in the first cut (`opsmaxx_ssh_list`,
  `opsmaxx_db_query`, `opsmaxx_vault_list`, …).
- **7 write / high-risk tools** gated by a typed-string double
  confirmation (`opsmaxx_db_write`, `opsmaxx_vault_set`, …).
- **Zero secrets cross the bridge.** The local bridge only ever
  returns metadata — `hasSecret: true` and a timestamp, never the
  key itself.
- **A single contract** (`@agentmesh/opsmaxx-bridge`) that
  `agent-daemon`, the web dashboard, the desktop shell, and the
  Fastify MCP gateway all consume. No one imports OpsMaxx's
  Electron code; we are an external client, not a fork.

## The architecture, in one diagram

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
���  + opsmaxx-bridge│                          │  • safeStorage    │
└────────┬─────────┘                          │  • approval card  │
         │                                    └──────────────────┘
         │ peer-mesh (libp2p)
         ▼
  other agents / other machines / bot.muhanai.com lists
```

The same `OpsMaxxBridge` interface (`packages/opsmaxx-bridge/src/types.ts`)
backs:

1. **The Fastify MCP gateway** at `/api/opsmaxx-mcp/rpc` (read) and
   `/api/opsmaxx-mcp/writes` (write).
2. **The desktop shell** — DaedalOS now has a dedicated `OpsMaxxApp`
   window that opens inside the existing window manager, with both
   an `iframe` mode (against the OpsMaxx embed endpoint when the
   maintainer ships it) and a structured `panel` mode that talks to
   the bridge directly.
3. **The peer-mesh UI** — `OpsMaxxPeerCard` shows one OpsMaxx host
   per row in the existing `PeerCanvas`, with capability counts
   derived from the `RISK` registry so adding a new tool in the
   bridge lights up the UI for free.

## Why three risk classes are enough

Every action in the integration belongs to one of three classes,
declared once in `packages/opsmaxx-bridge/src/types.ts`:

```ts
export const RISK: Record<string, RiskClass> = {
  opsmaxx_ssh_list: "safe",
  opsmaxx_ssh_exec: "needs-approval",
  opsmaxx_db_write: "high-risk-needs-double-approval",
  opsmaxx_vault_set: "high-risk-needs-double-approval",
  // …
};
```

The MCP router at `services/api/src/mcp-routes.ts` looks up the
class for each tool before the call is forwarded. `safe` calls run
uninterrupted. `needs-approval` tools block on a single
human-in-the-loop card. `high-risk-needs-double-approval` tools
require a _typed_ confirmation — the user must type the service
name (e.g. type `openai` to confirm `opsmaxx_vault_set` for
service `openai`). A mismatched typed confirm returns
`RESULT_DOUBLE_CONFIRM_MISMATCH` (custom JSON-RPC code 4002).

The audit log records every call attempt with an `argsHash` (SHA-256
of the args), never the raw args, so a model decision can be
reconstructed after the fact without leaking the secret into the
log.

## Three properties that hold by construction

1. **No secret ever crosses the bridge.** `bridge.vault.list()`
   returns `VaultEntry[]` with `hasSecret: boolean` and a
   timestamp. The agent sees `hasSecret: true` and nothing else.
   The bridge API accepts a secret _only_ on the `vault.set` path,
   which is itself `high-risk-needs-double-approval`.
2. **No identity is borrowed from OpsMaxx.** Owner resolution still
   goes through the HMAC `Authorization: Bearer <token>` verified
   by `services/api/src/list-routes.ts:resolveOwner`. OpsMaxx is a
   credential bridge, never an identity issuer.
3. **No code is linked from OpsMaxx.** OpsMaxx runs out-of-process;
   we are an external client, not a fork. Both projects stay MIT.

## How we kept the tracks parallel

The work split into six independent tracks, each owned by a different
agent, with `T1` (the bridge contract) as the only blocker:

| Track              | Owner            | Days | Files                                                               |
| ------------------ | ---------------- | ---- | ------------------------------------------------------------------- |
| T1 (bridge + mock) | bridge-author    | 5    | `packages/opsmaxx-bridge/src/{types,mock,factory,ipc,transport}.ts` |
| T2 (vault sync)    | vault-engineer   | 10   | `packages/agent-daemon/src/opsmaxx-vault-adapter.ts`                |
| T3-A (MCP safe)    | mcp-shaper-safe  | 7    | `services/api/src/opsmaxx-mcp-routes.ts`                            |
| T3-B (MCP write)   | mcp-shaper-risky | 7    | `services/api/src/opsmaxx-mcp-writes.ts` + audit log                |
| T4 (P2P UI)        | mesh-ui          | 10   | `apps/web/src/components/harvest/A/OpsMaxxPeerCard.tsx`             |
| T5 (desktop embed) | desktop-ui       | 14   | `apps/desktop/src/components/DesktopApps/OpsMaxxApp.tsx`            |
| T6 (i18n docs)     | docs-i18n        | 10   | 9 `README.*.md` files + index                                       |

T3 split into T3-A (read-only) and T3-B (write + audit) mid-stream
once we saw that the surface was twice as big as the original
estimate. The split saved a week of wall-clock time without any
merge conflict because the only file both tracks touch is
`services/api/src/mcp-routes.ts`, and the merge-order rule is
deterministic (T3-B includes T3-A's config edit; T3-B's reviewer
is the one who lands the combined commit).

The full plan is in
[`docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md`](https://github.com/koraussie7/MuhanAI/blob/main/packaging/npm/token-free-gateway/agentmesh/docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md).

## What we shipped, by the numbers

- **2,400 lines of TypeScript** across the bridge, vault adapter,
  MCP routes, audit log, peer card, desktop window, and tests.
- **49 tests** passing in the opsmaxx-bridge, agent-daemon, and
  web packages.
- **9 language READMEs** (English plus ko/zh/ja/es/fr/de/pt/ar).
- **1 ADR** ([0010](https://github.com/koraussie7/MuhanAI/blob/main/packaging/npm/token-free-gateway/agentmesh/docs/adr/0010-opsmaxx-bridge.md))
  that fixes the contract so the next person to touch the bridge
  knows what is and is not negotiable.

## What is still open

- **The OpsMaxx embed endpoint.** The dashboard's `iframe` mode
  waits on a stable URL from the OpsMaxx maintainer; the
  `panel` mode works without it. The contact email is in
  [`docs/agentmesh/OPSMAXX-CONTACT.md`](https://github.com/koraussie7/MuhanAI/blob/main/packaging/npm/token-free-gateway/agentmesh/docs/agentmesh/OPSMAXX-CONTACT.md).
- **The audit log is in-process.** The default sink is
  `pino.info`. The next step is shipping the append-only file
  sink so audit entries survive a daemon restart.
- **`mcp.invoke` notification routing.** The wire-side dispatcher
  ignores the tool name today because the OpsMaxx side has not
  confirmed the notification payload. The local subscription map
  is keyed by name so a future wire change is a one-line edit.

If you are building a token-free agent mesh and want the same
shape, the bridge is the only thing you need to copy. The contract
is 14 method signatures and one `RISK` table. The rest of the
integration is glue, and glue is the part you write for your own
users.

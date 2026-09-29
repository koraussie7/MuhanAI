# Agent assignment plan — OpsMaxx × MuhanAI integration

> Companion to ADR 0010. This is the working agreement for how the
> six integration tracks are split across the parallel agents that
> make up the MuhanAI multi-agent build system
> ([AGENT-ONBOARDING.md](../AGENT-ONBOARDING.md)).

## Goals

- Maximise the number of tracks that can run in parallel after T1
  lands.
- Make every track's deliverable independently testable.
- Avoid two agents editing the same file at the same time.

## Tracks at a glance

| # | Track | Owner agent | Branch | Days | Touches |
|---|---|---|---|---|---|
| T1 | Bridge contract + mock | `opsmaxx-bridge-author` | `feat/opsmaxx/bridge` | 5 | new package `packages/opsmaxx-bridge/` |
| T1-P2 | Production IPC client | `opsmaxx-ipc-engineer` | `feat/opsmaxx/ipc-client` | 5–7 | `packages/opsmaxx-bridge/src/ipc.ts` (skeleton already in place) |
| T2 | Vault two-way sync | `opsmaxx-vault-engineer` | `feat/opsmaxx/vault` | 10 | `packages/agent-daemon/src/credentials-vault.ts`, `daemon.ts` |
| T3-A | MCP safe surface (read-only) | `opsmaxx-mcp-shaper-safe` | `feat/opsmaxx/mcp-safe` | 7 | `services/api/src/opsmaxx-mcp-routes.ts` (new), `mcp-routes.ts` (config only) |
| T3-B | MCP write surface + audit | `opsmaxx-mcp-shaper-risky` | `feat/opsmaxx/mcp-risky` | 7 | `services/api/src/opsmaxx-mcp-writes.ts` (new), `services/api/src/audit/bridge-call-log.ts` (new), `mcp-routes.ts` (config only) |
| T4 | P2P mesh UI | `opsmaxx-mesh-ui` | `feat/opsmaxx/mesh-ui` | 10 | `apps/web/src/components/Sidebar.tsx`, `routes.ts`, `harvest/A/PeerCanvas.tsx` |
| T5 | Desktop embed (UI) | `opsmaxx-desktop-ui` | `feat/opsmaxx/desktop` | 14 | `apps/desktop/src/components/DesktopApps.tsx`, `Window.tsx`, `page.tsx` |
| T5b | Desktop security review | `opsmaxx-desktop-sec` | `feat/opsmaxx/desktop` (shared) | 7 | review-only on T5 PRs |
| T6 | Docs (9 lang) + blog | `opsmaxx-docs-i18n` | `feat/opsmaxx/docs` | 10 | `README*.md`, `docs/agentmesh/OPSMAXX-INTEGRATION.md` |
| T6b | Packaging + blog deploy | `opsmaxx-publisher` | `feat/opsmaxx/packaging` | 7 | `packaging/`, `.github/workflows/deploy-blog.yml` |

## Hand-off order

1. **Day 0–5 (T1)**: `opsmaxx-bridge-author` ships the bridge contract
   + in-memory mock + tests. No other track may start.
   **T1-P2 (skeleton)**: in this same window the bridge author also
   ships `ipc.ts` as a **skeleton** with the `Transport` interface,
   `METHOD_MAP`, and error-code mapping already filled in. This is
   cheap to write and unblocks the IPC engineer.
2. **Day 5 (kick-off)**: All other agents start in parallel.
3. **Day 12 (mid-point)**: T2 must merge its vault PR; both T3-A
   and T3-B must have their `RISK` registry entries accepted. The
   config block in `mcp-routes.ts` is merged by whichever of T3-A or
   T3-B lands second; the other rebases.
4. **Day 19 (soft freeze)**: T4, T5 ship. T3 finalises audit log.
5. **Day 24 (release)**: T6 lands. `opsmaxx-publisher` cuts the
   0.6.0 release and the blog post goes live.

## File ownership matrix

| File | Owner | Others |
|---|---|---|
| `packages/opsmaxx-bridge/src/**` | T1 (skeleton), T1-P2 (production wire) | import-only by all |
| `packages/agent-daemon/src/credentials-vault.ts` | T2 | review only |
| `services/api/src/mcp-routes.ts` | T3-A (config block line) | T3-B may add a sibling line in the same block; T3-B is the merge owner of the combined PR |
| `apps/web/src/components/Sidebar.tsx` | T4 | exclusive |
| `apps/web/src/routes.ts` | T4 | exclusive |
| `apps/desktop/src/components/DesktopApps.tsx` | T5 | exclusive |
| `README*.md` | T6 | exclusive per language |
| `docs/agentmesh/OPSMAXX-INTEGRATION.md` | T6 | exclusive |

## Related track plans

- `docs/agentmesh/T3-OPSMAXX-MCP-AGENT-A.md` — T3-A (read-only / safe tools)
- `docs/agentmesh/T3-OPSMAXX-MCP-AGENT-B.md` — T3-B (write / high-risk tools + audit)
- `docs/agentmesh/T1-OPSMAXX-IPC-CLIENT.md` — T1-P2 (production IPC client)

**Starting a new agent session on OpsMaxx T3?** Read
`docs/agentmesh/T3-OPSMAXX-HANDOFF.md` first. It carries the exact fix
recipes, file ownership, and validation gate for the three open items
below.

## Completion log

### T3-B (write surface + audit) — code complete, 2026-09-28

Delivered:

- `services/api/src/opsmaxx-mcp-writes.ts` — 7 write tools on
  `POST /api/opsmaxx-mcp/writes`, custom codes 4001–4004.
- `services/api/src/audit/bridge-call-log.ts` — append-only sink storing
  `argsHash` (SHA-256) only, never raw args.
- `services/api/src/opsmaxx-mcp-writes.test.ts` — 15 cases.
- `packages/opsmaxx-bridge/src/types.ts` — `RISK` gained
  `opsmaxx_vault_remove: "needs-approval"`.
- `docs/agentmesh/OPSMAXX-INTEGRATION.md` §"Threat model: write tools and
  their gates (T3-B)".
- `services/api/src/mcp-routes.ts` — the shared `opsmaxxConfig` block now
  carries **both** lines (`safe` from T3-A and `write` from T3-B) in one
  object, per the merge-order rule above.

Verification: `@agentmesh/api` typecheck 0 errors; T3-B's 15 tests plus the
15 pre-existing `mcp-routes.test.ts` tests = 30/30 green; bridge package
34/34 green; biome clean. Full evidence in
`docs/agentmesh/T3-OPSMAXX-MCP-AGENT-B.md` §"Verification log".

Outstanding, owned by other tracks (do **not** attribute to T3-B):

| Issue | Owner | Evidence |
| --- | --- | --- |
| 4 failures in `services/api/src/opsmaxx-mcp-routes.test.ts` (empty bridge: test and route resolve different mock instances) | T3-A | list tools return `[]`; `ssh_session_open` returns `undefined` |
| 1 failure in `services/api/src/server.test.ts` (`expected 200 to be 401`) | T1 (test hygiene) | `services/api/src/llm-routes.test.ts:23` sets `DISABLE_AUTH=true` and never deletes it; `DISABLE_AUTH=true vitest run src/server.test.ts` reproduces exactly 1 failure |
| 9 errors in `pnpm --filter @agentmesh/agent-mesh typecheck`, all in `packages/ai-engine/src/sipp/*` | ai-engine / build config | `tsconfig.base.json` has `"lib": ["ES2022"]`; `packages/ai-engine/tsconfig.json` adds `DOM`/`WebWorker`, which is lost when ai-engine sources enter another package's program |


## Cross-track contracts (do not break without an ADR PR)

- `OpsMaxxBridge` interface: `packages/opsmaxx-bridge/src/types.ts`.
- `RISK` registry: same file.
- MCP tool name → risk class lookup: must be consumed via `RISK[name]`,
  never hard-coded in `mcp-routes.ts`.

## Conflict resolution

If two agents need to edit the same file, the agent that opened the
ADR PR (or, if no ADR PR exists, the one with the lower
`AGENT-ONBOARDING.md` role number) gets the file. The other agent
files a follow-up PR.

## Shared test asset

The `createInMemoryBridge()` mock is the contract test fixture for
T2, T3, T4, T5. It MUST be importable from
`@agentmesh/opsmaxx-bridge/mock` and MUST NOT depend on Node-version-
specific APIs beyond `Map`, `Set`, `Promise`, and `Date.now()`.

# T1 Phase 2 — OpsMaxx IPC Client (Production Bridge Implementation)

> **Track**: T1-Phase-2 (after T1 mock lands)
> **Owner agent**: `opsmaxx-ipc-engineer` (proposed; can be different from
> the agent that wrote T1)
> **Branch**: `feat/opsmaxx/ipc-client`
> **Worktree**: `../muhanai-opsmaxx-ipc`
> **Days**: 5–7
> **Touches**:
>   - `packages/opsmaxx-bridge/src/ipc.ts` (new — sole production
>     implementation)
>   - `packages/opsmaxx-bridge/src/factory.ts` (replace the
>     `createIpcBridge()` stub with a real one)
>   - `packages/opsmaxx-bridge/src/__tests__/ipc.test.ts` (new)
>   - `packages/opsmaxx-bridge/package.json` (if a new transport dep is
>     needed)
>   - `docs/agentmesh/OPSMAXX-INTEGRATION.md` (production wiring section)

## Goal

Replace the `createIpcBridge()` stub in
`packages/opsmaxx-bridge/src/factory.ts` with a real client that talks
to a running [OpsMaxx](https://github.com/OpsMaxx/OpsMaxx) daemon over
its local IPC. The contract is fixed — `OpsMaxxBridge` from
`packages/opsmaxx-bridge/src/types.ts` — and the in-memory mock is the
test fixture, so the only thing missing is the wire.

This is the *only* work that requires the OpsMaxx maintainers to ship
something stable (see `docs/agentmesh/OPSMAXX-CONTACT.md`). Until they
do, you can ship a *best-effort* implementation against the most
likely shape and document the assumptions.

## Why this is independent of T2/T3/T4/T5

Every other track already runs against `createInMemoryBridge()`. The
IPC client only matters when `factory.mode === "ipc"` or `"auto"` in
production. Local dev, CI, and tests never touch it. So this track
can be **delegated to a single dedicated agent** with no merge
conflicts against T2–T6.

## What already exists (do not redo)

- `packages/opsmaxx-bridge/src/types.ts` — `OpsMaxxBridge` contract
- `packages/opsmaxx-bridge/src/mock.ts` — `createInMemoryBridge()` with
  `__reset`, `__approve`, `__deny`, `__seedSsh`, `__seedDb`
- `packages/opsmaxx-bridge/src/factory.ts` — `createOpsMaxxBridge({
  mode: "ipc"|"memory"|"auto" })` with the IPC path stubbed out
- `packages/opsmaxx-bridge/src/__tests__/factory.test.ts` — 5 contract
  tests that the IPC client must also pass (run them against
  `createIpcBridge({ mode: "ipc", endpoint: <test stub> })`)

## Open questions to resolve first (in order)

1. **Does OpsMaxx expose a documented IPC?**
   - Yes → use it as the spec.
   - No → use the most likely shape (see *Assumed protocol* below) and
     flag the assumption in a top-of-file comment.
   - Pending → ship a **pluggable transport** with one working
     implementation (Node `child_process` stdio JSON-RPC) so the rest
     of the system is unblocked.

2. **Is the IPC a binary, a socket, or a HTTP endpoint?**
   - Electron's `safeStorage` and approval flow suggest *stdio over a
     sidecar binary* or *localhost HTTP*. Inspect the OpsMaxx repo
     before guessing.

## Assumed protocol (use until OpsMaxx confirms)

If the docs are silent, implement against this shape and document it
prominently so reviewers know what to challenge:

```
Transport: line-delimited JSON over stdio (spawn sidecar) OR
           HTTP/1.1 on 127.0.0.1:<port> with a token header.

Wire format (JSON-RPC 2.0):

  request  = { jsonrpc: "2.0", id: <n>, method: <str>, params: <obj> }
  response = { jsonrpc: "2.0", id: <n>, result?: <obj>, error?: { code, message } }

Method mapping:

  bridge.vault.list      → "vault.list"
  bridge.vault.get       → "vault.get"    { service }
  bridge.vault.set       → "vault.set"    { service, secret, note }
  bridge.vault.remove    → "vault.remove" { service }
  bridge.ssh.list        → "ssh.list"
  bridge.ssh.open        → "ssh.open"     { connectionId }
  bridge.ssh.exec        → "ssh.exec"     { sessionId, cmd }
  bridge.ssh.close       → "ssh.close"    { sessionId }
  bridge.databases.list  → "db.list"
  bridge.databases.query → "db.query"     { connectionId, sql, params }
  bridge.databases.write → "db.write"     { connectionId, sql, params }
  bridge.security.isApprovedByUser  → "approval.check" { capability, argsHash }
  bridge.security.requestApproval  → "approval.request" { capability, risk, summary, args, preview }
  bridge.aiGateway.publishMcpTool   → "mcp.publish" { def }
  bridge.aiGateway.onMcpInvoke      → server-push "mcp.invoke" (handle in subscription)
```

The mapping must be in **one place** — `packages/opsmaxx-bridge/src/ipc.ts`
at the top — so a real OpsMaxx doc can replace the whole table in a
single diff.

## Deliverables

1. `packages/opsmaxx-bridge/src/ipc.ts` — the production client.
   - `createIpcClient({ endpoint, signal }): Promise<OpsMaxxBridge>`.
   - All 14 methods of `OpsMaxxBridge` implemented.
   - **Plugin point** for transport: a `Transport` interface with
     `send(method, params): Promise<unknown>` and `onNotification?` so
     we can swap stdio ↔ HTTP ↔ WebSocket without rewriting methods.
   - Translate wire `error.code` into the 10 `BridgeErrorCode`
     variants defined in `types.ts`. Do not pass through unknown codes
     silently — they must log + become `"internal"`.
2. `packages/opsmaxx-bridge/src/factory.ts` — `createIpcBridge()`
   wired up. `"auto"` mode: probe `endpoint` (default
   `127.0.0.1:8322`), fall back to `createInMemoryBridge()` on
   connection failure (with a `pino.warn`).
3. `packages/opsmaxx-bridge/src/__tests__/ipc.test.ts` — vitest suite.
   - **At least 8 cases**, all using a stub `Transport`:
     - `vault.list` round-trips a 3-entry result.
     - `vault.get` for an unknown service returns `ok(null)`.
     - `vault.set` returns `ok(undefined)` and the stub saw the right
       method.
     - `ssh.exec` with an invalid `sessionId` returns
       `err(BridgeError("invalid_args", ...))`.
     - `databases.write` failure becomes
       `err(BridgeError("host_unreachable", ...))`; the `code` is
       preserved.
     - `security.requestApproval` carries `typedConfirm` field for
       `high-risk-needs-double-approval` and the stub records it.
     - `aiGateway.publishMcpTool` translates to
       `mcp.publish { def }` on the wire; assert via the stub.
     - `close()` shuts the transport down — the stub's `closed` flag
       is true.
4. Re-run the existing `factory.test.ts` against
   `createIpcBridge({ transport: stubTransport })` — the same 5 cases
   must pass. This is the contract conformance check.
5. `docs/agentmesh/OPSMAXX-INTEGRATION.md` — append a **Production
   wiring** section: which env vars, which endpoint, how to detect
   OpsMaxx is missing, how to fall back to memory.

## Non-goals

- Touching the mock or the contract. T1's contract is fixed.
- Implementing the OpsMaxx side. We are a client; the server is
  their problem.
- Building a fancy WebSocket transport. JSON-RPC over stdio is
  enough for V1.
- Adding new tools to `RISK`. That's T1 Phase 3 if anyone needs it.

## Risks to handle

- **Wire drift.** If OpsMaxx renames a method, every call site has
  to change. Mitigate with a single `METHOD_MAP` table at the top of
  `ipc.ts` so the rename is one line.
- **Notification handlers leak.** `aiGateway.onMcpInvoke` registers a
  handler that lives forever if `close()` is not called. Mitigate by
  returning an `unsubscribe` function (already in the contract) and
  tracking subscriptions so `close()` runs them.
- **Approval state is a cache, not a source of truth.** Both sides
  must agree on the `(capability, argsHash)` key. The mock already
  uses the same key shape; mirror it byte-for-byte in `ipc.ts` so a
  cache hit on one side is a hit on the other.
- **No `setTimeout` races.** If OpsMaxx takes >2s to answer, the
  client must surface `"timeout"`, not hang the gateway request.
  Add a 5s default timeout with `AbortController` so callers can
  override per-call.

## Hand-off

- PR title: `feat(opsmaxx-bridge): production IPC client (T1 Phase 2)`.
- Tag the T1 author for review. If the agent that wrote T1 is busy,
  any of T2/T3/T4 owners can review because they are already familiar
  with the contract.
- Update `docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md` with the actual
  days taken and a one-line "what changed vs. the assumed protocol".

## Definition of done

- [ ] `pnpm --filter @agentmesh/opsmaxx-bridge typecheck` passes.
- [ ] `pnpm --filter @agentmesh/opsmaxx-bridge test` passes with the
      existing 5 cases **and** ≥ 8 new IPC cases.
- [ ] The 5 existing contract tests pass against `createIpcBridge`
      when given a stub `Transport`. This is the conformance gate.
- [ ] No `OpsMaxxBridge` method is left as a `throw new Error("not
      yet implemented")` in `ipc.ts`.
- [ ] `docs/agentmesh/OPSMAXX-INTEGRATION.md` has the Production
      wiring section.
- [ ] If the assumed protocol disagrees with the OpsMaxx docs (when
      they land), the `METHOD_MAP` table is the *only* thing that
      needs to change.

## Fallback path

If the OpsMaxx maintainers never answer the contact email
(`docs/agentmesh/OPSMAXX-CONTACT.md`), the IPC client still ships
against the assumed protocol, but with these safety nets:

- The `factory.ts` `"auto"` mode defaults to in-memory.
- The production binary never refuses to start because OpsMaxx is
  missing — the user just doesn't get the dashboard's
  *Trusted peers → OpsMaxx* section.
- The MCP tools are still reachable from the dashboard's manual
  approval flow; they just won't auto-approve.

# T3-B — OpsMaxx MCP _Write / High-Risk_ Tool Surface + Audit

> **Track**: T3-B (parallel to T3-A)
> **Owner agent**: `opsmaxx-mcp-shaper-risky`
> **Branch**: `feat/opsmaxx/mcp-risky`
> **Worktree**: `../muhanai-opsmaxx-mcp-risky`
> **Days**: 7 (in parallel with T3-A's 7 days)
> **Touches**:
>
> - `services/api/src/opsmaxx-mcp-writes.ts` (new, agent-B owns)
> - `services/api/src/audit/bridge-call-log.ts` (new, agent-B owns)
> - `services/api/src/mcp-routes.ts` (config block only; coordinated
>   edit with T3-A)

## Goal

Ship the **write / dangerous** half of the OpsMaxx MCP surface plus
the audit log that records every call. Every write tool routes through
the human-in-the-loop approval gate defined in
`packages/opsmaxx-bridge/src/types.ts` (`RISK` map and
`bridge.security.requestApproval`). The audit log makes the gate
auditable after the fact.

This is the half of T3 that _can_ do damage — a sloppy
`opsmaxx_db_write` is `DROP TABLE users;`. Treat every tool in this
scope as if a hostile actor is one review away.

## Scope (7 tools + audit)

| #   | Tool name                  | Bridge call                         | Risk class                        | Approval shape        |
| --- | -------------------------- | ----------------------------------- | --------------------------------- | --------------------- |
| 1   | `opsmaxx_ssh_exec`         | `bridge.ssh.exec()`                 | `needs-approval`                  | single per-call       |
| 2   | `opsmaxx_sftp_write`       | (T1 Phase 2)                        | `needs-approval`                  | single per-call       |
| 3   | `opsmaxx_db_write`         | `bridge.databases.write()`          | `high-risk-needs-double-approval` | typed-string confirm  |
| 4   | `opsmaxx_tunnel_open`      | (T1 Phase 2)                        | `needs-approval`                  | single per-call       |
| 5   | `opsmaxx_vault_set`        | `bridge.vault.set()`                | `high-risk-needs-double-approval` | typed-string confirm  |
| 6   | `opsmaxx_vault_remove`     | `bridge.vault.remove()`             | `needs-approval`                  | single per-call       |
| 7   | `opsmaxx_approval_request` | `bridge.security.requestApproval()` | `safe` (mutates approval cache)   | n/a (returns verdict) |

Plus the audit log:

- `services/api/src/audit/bridge-call-log.ts` — append-only
  `bridge_call` event sink. Every tool call (T3-A and T3-B) emits
  one line per attempt: `{ ts, capability, argsHash, risk, verdict,
durationMs, errorCode? }`. Sink is pluggable; default is
  `pino.info` so it shows up in the existing log pipeline.

## Approval flow contract

For any tool whose `RISK[class]` is `needs-approval` or
`high-risk-needs-double-approval`:

1. Compute the `(capability, argsHash)` from the request.
2. Call `bridge.security.isApprovedByUser(capability, argsHash)`. If
   `true`, skip ahead to step 5.
3. Call `bridge.security.requestApproval({ capability, risk, summary,
args, preview })` with a _human-readable_ `summary`. The model
   supplies the `summary` from the user's prompt; do not auto-generate
   it.
4. If the user denies, return JSON-RPC `RESULT_DENIED` (custom code 4001) with the reason; emit a `bridge_call` event with
   `verdict: "denied"`.
5. Forward to the bridge. Emit a `bridge_call` event with
   `verdict: "ok"` or `verdict: "error"`.
6. Return the bridge result to the model.

For `high-risk-needs-double-approval` tools the `summary` MUST include
a `typedConfirm` field — the user must type the service name
(e.g. type "openai" to confirm `opsmaxx_vault_set` for service
`openai`). If the typed confirm does not match, deny with
`RESULT_DOUBLE_CONFIRM_MISMATCH` (custom code 4002).

## Non-goals (T3-A's responsibility, do NOT touch)

- `opsmaxx_ssh_list`, `opsmaxx_db_list`, `opsmaxx_vault_list` — read
  side, T3-A
- `opsmaxx_sftp_read`, `opsmaxx_db_query` — read side, T3-A
- `opsmaxx_ssh_session_open` — opens a session, T3-A
- `opsmaxx_whoami`, `opsmaxx_approval_status` — meta tools, T3-A

## Deliverables

1. `services/api/src/opsmaxx-mcp-writes.ts` — Fastify plugin exposing
   the 7 tools at `POST /api/opsmaxx-mcp/writes`. The `/writes` suffix
   is deliberate: it lets `apps/web/src/components/find/CosmicPromptBar.tsx`
   distinguish read and write surfaces in its approval prompt.
2. `services/api/src/audit/bridge-call-log.ts` — append-only sink.
   Exports `recordBridgeCall(event: BridgeCallEvent): void` and a
   `getRecentBridgeCalls({ userId, limit }): Promise<BridgeCallEvent[]>`
   for the audit page in the dashboard.
3. `services/api/src/opsmaxx-mcp-writes.test.ts` — vitest with at
   least 8 cases:
   - `opsmaxx_ssh_exec` requires approval; denied by default.
   - After `__approve`, exec proceeds and `bridge_call` event is
     emitted.
   - `opsmaxx_db_write` requires typed confirm; mismatched confirm
     returns code 4002.
   - `opsmaxx_db_write` matched confirm calls `bridge.databases.write`
     and forwards the affected row count.
   - `opsmaxx_vault_set` mirrors to OpsMaxx; bridge `err` does not
     surface to the model.
   - `opsmaxx_approval_request` returns `{ approved: true|false }` and
     mutates the in-memory approval cache (via the mock).
   - Audit log records `verdict: "denied"` when approval is refused.
   - Audit log records `verdict: "error"` when bridge errors.
4. A single line edit in `services/api/src/mcp-routes.ts` that
   registers T3-B's tools into `opsmaxxConfig`. Coordinate with T3-A
   so the two config edits land in a single merge commit (T3-B
   includes T3-A's edits verbatim; whoever merges second rebases).
5. Risk audit in `docs/agentmesh/OPSMAXX-INTEGRATION.md` for the
   write tools. Add a "Threat model" subsection listing every high-
   risk call site and its gate.

## Risks to handle

- **Approval cache poisoning.** `isApprovedByUser` returns true only
  for the exact `(capability, argsHash)` pair. Tests must include a
  case where the model tries to reuse an approval from one call to
  bypass another. The mock's `hashKey` already does this correctly;
  add a test that asserts the gate refuses.
- **Secret exfiltration through args.** `opsmaxx_vault_set` and
  `opsmaxx_ssh_exec` accept user-supplied args. The audit log MUST
  log `argsHash` (SHA-256), NOT the raw args. Add a comment block in
  `audit/bridge-call-log.ts` explaining why.
- **Re-entrancy.** `opsmaxx_ssh_session_open` (T3-A) returns a
  `sessionId`; `opsmaxx_ssh_exec` consumes it. If exec is called with
  an unknown `sessionId`, deny with `RESULT_INVALID_ARGS` (custom
  code 4003) and log the attempt.
- **T3-A overwrites T3-B.** Both tracks touch the same
  `mcp-routes.ts` config block. The merge order matters. The
  contract: T3-B's PR _includes_ T3-A's config edit; T3-B's reviewer
  is the one who lands the combined commit.

## Hand-off

When T3-B is done:

- Open a PR titled `feat(opsmaxx): write MCP tool surface + audit (T3-B)`.
- Tag `@opsmaxx-desktop-sec` (T5b) for review of the approval flow.
- Update `docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md` with the actual
  days taken.

**All of the above is now tracked in
`docs/agentmesh/T3-OPSMAXX-HANDOFF.md`** — that file supersedes this
section as the working handover for the next agent, including the fix
recipes for the two red test files and the validation gate to run before
opening the PR.

## Definition of done

- [x] `pnpm --filter @agentmesh/api typecheck` passes — **0 errors**,
      re-verified 2026-09-28.
      *(Earlier in the track there were 2 errors surfaced by the DOM
      `lib` addition to `services/api/tsconfig.json`
      — `packages/agent-mesh/src/transports/axl-client.ts`,
      `packages/hivebear/src/ollama-proxy.ts` — plus 1 from the
      concurrently-edited `packages/opsmaxx-bridge/src/ipc.ts`. All three
      were fixed by their owning tracks; the API package is now clean.)*
      **Separate caveat, not a T3 defect:**
      `pnpm --filter @agentmesh/agent-mesh typecheck` reports 9 errors, all in
      `packages/ai-engine/src/sipp/{model-manager,sipp-worker}.ts`
      (`FileSystemDirectoryHandle`, `Worker` not found). Root cause is
      structural: `tsconfig.base.json` sets `"lib": ["ES2022"]`, while
      `packages/ai-engine/tsconfig.json` adds `DOM`/`WebWorker`. When
      ai-engine sources are pulled into another package's program they lose
      that `lib`. `tsconfig.base.json` was not modified in that respect by
      any T3 work (the diff only adds `@agentmesh/opsmaxx-bridge` path
      aliases). 0 errors live in agent-mesh's own `src/`.
- [x] `pnpm --filter @agentmesh/api test` passes with ≥ 8 new cases.
      *(15 new `opsmaxx-mcp-writes.test.ts` cases + 15 existing
      `mcp-routes.test.ts` cases = 30/30 green for this track. The 5
      remaining suite failures are outside this track: 4 in
      `opsmaxx-mcp-routes.test.ts` (T3-A, in progress) and 1
      pre-existing env leak in `server.test.ts` — proven in the
      Verification log below.)*
- [x] `opsmaxx_db_write` cannot be invoked without typed confirm;
      verify by inspection of the test that asserts code 4002.
- [x] Audit log emits exactly one event per call attempt, including
      denials and errors.
- [x] `RISK` registry contains an entry for every tool this track
      shipped; ship the missing ones in the same PR.
      (`opsmaxx_vault_remove` added.)
- [x] `docs/agentmesh/OPSMAXX-INTEGRATION.md` has a "Threat model"
      subsection listing the 7 write tools and their gates.
- [x] No read tool from T3-A is duplicated in this track's surface.

## Verification log (2026-09-28)

Commands were run from `packaging/npm/token-free-gateway/agentmesh`.

| Command | Result |
| --- | --- |
| `pnpm --filter @agentmesh/api exec vitest run src/opsmaxx-mcp-writes.test.ts src/mcp-routes.test.ts` | **30/30 pass** (15 new + 15 existing) |
| `pnpm --filter @agentmesh/api exec vitest run` | 198 passed / 5 failed / 1 skipped — the 5 failures are **outside T3-B** (see below); ran twice with identical results, so the failures are deterministic, not flaky |
| `pnpm --filter @agentmesh/api typecheck` | **0 errors** (final); earlier intermediate runs had 1 error in a concurrent WIP file (`packages/opsmaxx-bridge/src/ipc.ts:103`), since fixed by its owner |
| `pnpm --filter @agentmesh/opsmaxx-bridge test` (`vitest run packages/opsmaxx-bridge`) | **34/34 pass** (`factory.test.ts` 5, `ipc.test.ts` 29) |
| `pnpm exec biome check services/api/src/opsmaxx-mcp-writes.ts services/api/src/audit/bridge-call-log.ts services/api/src/opsmaxx-mcp-writes.test.ts` | clean — `Checked 3 files. No fixes applied.` |

### The 4 `opsmaxx-mcp-routes.test.ts` failures (T3-A, in progress)

Symptoms: `expected [] to have a length of 2 but got +0` (three list tools) and
`expected undefined to be defined` (`opsmaxx_ssh_session_open`). The route answers
normally but sees an empty bridge, i.e. the test seeds one mock instance while the
route resolves another. That is an internal wiring bug inside T3-A's own track
(`opsmaxx-mcp-routes.ts` + its test), not a T3-B regression — T3-B imports the
bridge only through `packages/opsmaxx-bridge`, whose 5 own tests pass.

### The 1 `server.test.ts` failure is pre-existing — proof

Failing case: `api server hardening > API key auth > rejects requests to protected
routes without a key` → `AssertionError: expected 200 to be 401`. A `200` means the
global `onRequest` guard was skipped, which only happens when `disableAuth` is true,
i.e. `DISABLE_AUTH === "true"` was visible to `buildApp()`.

1. **Not reproducible in isolation.**

   ```bash
   pnpm --filter @agentmesh/api exec vitest run src/server.test.ts        # 18/18 pass
   DISABLE_AUTH=true pnpm --filter @agentmesh/api exec vitest run src/server.test.ts
   # → exactly 1 failed | 17 passed, same test, same `expected 200 to be 401`
   ```

   The second run reproduces the suite failure exactly, which pins the mechanism to
   an ambient `DISABLE_AUTH=true`.

2. **Two leak sources, both committed files this track never touched.**

   ```bash
   grep -n 'DISABLE_AUTH' services/api/src/llm-routes.test.ts
   # 23:  process.env.DISABLE_AUTH = "true";
   git diff --stat HEAD -- services/api/src/llm-routes.test.ts   # empty → unmodified at HEAD
   ```

   `llm-routes.test.ts` sets `DISABLE_AUTH = "true"` in `beforeEach` and its
   `afterEach` restores only `globalThis.fetch` and `process.env.NODE_ENV` — it never
   deletes `DISABLE_AUTH`.

   A second source lives in T3-A's own test file:
   `services/api/src/opsmaxx-mcp-routes.test.ts:14` sets
   `process.env.DISABLE_AUTH = "true";` at **module scope**, outside any hook, with no
   cleanup at all. A single-file run reproduces the whole leak:

   ```bash
   pnpm --filter @agentmesh/api exec vitest run \
     src/opsmaxx-mcp-routes.test.ts src/server.test.ts
   # → same 5 failures as the full suite
   ```

   Compare `openai-compat-routes.test.ts:23-25` and
   `ghost-routes.test.ts:24-26`, which do `delete process.env.DISABLE_AUTH;`.

3. **Why it only bites in a full-suite run.** Vitest 2.1.9 reuses worker processes
   across test files, so a leaked `process.env` entry survives into the next file in
   that worker. `server.test.ts` captures `const originalEnv = { ...process.env }` at
   module load; its `afterEach` does `process.env = { ...originalEnv }`, so once the
   polluted env is captured, **every restore re-applies `DISABLE_AUTH=true`**. Only
   this one test in the file asserts a `401` (the other two in that describe expect
   `200`), which is why exactly one case fails.

4. **Recommended fix (not applied — outside T3-B's file ownership).** Add
   `delete process.env.DISABLE_AUTH;` to the `afterEach` of
   `services/api/src/llm-routes.test.ts`. This belongs with the owner of test hygiene
   (T1), and it also explains why `server.test.ts` alone looks green.
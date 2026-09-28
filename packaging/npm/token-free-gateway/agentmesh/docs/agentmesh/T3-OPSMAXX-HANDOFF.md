# OpsMaxx T3 Handoff

> **Scope.** This document transfers the remaining OpsMaxx T3 work to the
> next agent. T3-B (write surface + audit) is code-complete and verified;
> T3-A (read-only surface) ships code but its own tests are red, and one
> pre-existing test-hygiene defect elsewhere in the suite is masking the
> `@agentmesh/api` suite's true state. Read
> `AGENT-ASSIGNMENT-PLAN.md` first for the track map, then this file for
> the exact handover.

## Current owner

T3-B was implemented directly in this worktree
(`packaging/npm/token-free-gateway/agentmesh`) on branch
`feat/chat-muhanai-com-workspace`. The next agent continues from this
branch and treats this document as the contract. Do not re-derive the
T3-B design; it is settled and tested.

## What is done (do not redo)

T3-B — write surface + audit, code-complete:

- `services/api/src/opsmaxx-mcp-writes.ts` — 7 write tools on
  `POST /api/opsmaxx-mcp/writes`, custom error codes 4001–4004.
- `services/api/src/audit/bridge-call-log.ts` — append-only sink that
  stores `argsHash` (SHA-256) only, never raw args.
- `services/api/src/opsmaxx-mcp-writes.test.ts` — 15 cases.
- `packages/opsmaxx-bridge/src/types.ts` — `RISK` gained
  `opsmaxx_vault_remove: "needs-approval"`.
- `docs/agentmesh/OPSMAXX-INTEGRATION.md` — new section
  "Threat model: write tools and their gates (T3-B)".
- `services/api/src/mcp-routes.ts` — the shared `opsmaxxConfig` block
  carries both the `safe` line (T3-A) and the `write` line (T3-B) in one
  object, resolving the documented merge-order rule.

T3-A — read-only surface, code present but tests red (see Task 1):

- `services/api/src/opsmaxx-mcp-routes.ts` — 8 read tools on
  `POST /api/opsmaxx-mcp/rpc`.
- `services/api/src/opsmaxx-mcp-routes.test.ts` — 14 cases, 10 pass / 4 fail
  (see Task 1; all four failures share one cause — an unwired bridge
  instance. The vault case is **not** a separate defect; an earlier
  revision of this handoff said it was, and that claim is retracted in
  §"Root cause 1b".)
- `services/api/src/server.ts` — registers `opsmaxxMcpRoutes` (line 286).
  This is also where Task 1's injection seam must be added; see
  §"Two mechanisms the fix must respect".

## Quick start — reproduce the state in 3 commands

Run all of these from `packaging/npm/token-free-gateway/agentmesh`:

```bash
pnpm --filter @agentmesh/api exec vitest run \
  src/opsmaxx-mcp-writes.test.ts src/mcp-routes.test.ts   # 30/30 → T3-B is green
pnpm --filter @agentmesh/api exec vitest run \
  src/opsmaxx-mcp-routes.test.ts                          # 14/14 → T3-A is green
pnpm --filter @agentmesh/api exec vitest run              # 202 passed | 1 failed | 1 skipped
```

The full-suite run shows exactly **one** failure — Task 2's `DISABLE_AUTH`
env leak. Nothing else in the suite is red on this branch.

> Note: the T3-A and T3-B test counts above are current as of the handoff
> snapshot. An earlier revision of this document quoted
> `10 passed / 4 failed` for T3-A and `198 passed / 5 failed` for the full
> suite; those numbers were superseded when the T3-A owner fixed the
> bridge-wiring defect.

### T3-B evidence (reproducible)

Run from `packaging/npm/token-free-gateway/agentmesh`:

```bash
pnpm --filter @agentmesh/api typecheck                    # 0 errors
pnpm --filter @agentmesh/api exec vitest run \
  src/opsmaxx-mcp-writes.test.ts src/mcp-routes.test.ts   # 30/30 pass
pnpm exec vitest run packages/opsmaxx-bridge              # 34/34 pass
```

Full log: `docs/agentmesh/T3-OPSMAXX-MCP-AGENT-B.md` §"Verification log".

## Next work, in order

**Status at handoff (2026-09-28):** Tasks 1 and 3 were resolved by the
concurrent T3-A/build-config tracks before this handoff completed. Task 2
is the **only** remaining blocker, and it is a two-line fix in files
outside T3's ownership. See §"State at handoff" at the end for the full
snapshot.

| # | Task | Owner | Status |
| --- | --- | --- | --- |
| 1 | Fix the 4 red tests in `opsmaxx-mcp-routes.test.ts` | T3-A successor | ✅ **resolved** — 14/14 pass; diagnosis kept below as reference |
| 2 | Fix the `DISABLE_AUTH` leak in two test files | T1 (test hygiene) | ⚠️ **OPEN — sole remaining blocker** |
| 3 | Resolve the `agent-mesh` / `ai-engine` DOM `lib` mismatch | build-config owner | ✅ **resolved** — `typecheck` reports 0 errors |

Then, to close T3-B: open the PR titled
`feat(opsmaxx): write MCP tool surface + audit (T3-B)`, tag
`@opsmaxx-desktop-sec` for review of the approval flow, and record the
actual days taken in `AGENT-ASSIGNMENT-PLAN.md`.


## Task 1 — the 4 red tests in `opsmaxx-mcp-routes.test.ts` ✅ RESOLVED

> **Resolved before this handoff completed.** The file now reports
> **14/14 passing** and `pnpm --filter @agentmesh/api typecheck` is clean.
> The diagnosis below is retained deliberately: it documents the failure
> mode (a route resolving a *different* bridge instance than the one the
> test seeds). If those four cases go red again after a refactor, start
> here rather than re-deriving it.

### Symptom

```bash
pnpm --filter @agentmesh/api exec vitest run src/opsmaxx-mcp-routes.test.ts
# → Test Files 1 failed (1) | Tests 4 failed | 10 passed (14)
```

| Failing case | Test line | Assertion | Message |
| --- | --- | --- | --- |
| `opsmaxx_ssh_list` > returns seeded SSH connections | 130 | `toHaveLength(2)` | `expected [] to have a length of 2 but got +0` |
| `opsmaxx_db_list` > returns seeded database connections | 144 | `toHaveLength(2)` | `expected [] to have a length of 2 but got +0` |
| `opsmaxx_vault_list` > returns vault entries with metadata only | 158 | `toHaveLength(2)` | `expected [] to have a length of 2 but got +0` |
| `opsmaxx_ssh_session_open` > returns a sessionId for valid connection | 200 (via `parseContent` helper, line 87) | `expect(res.result).toBeDefined()` | `expected undefined to be defined` |

10 of the 14 cases pass, including the JSON-RPC envelope, `tools/list`,
unknown-method, and invalid-args cases. Only the four cases that read
**seeded data** fail.

### Root cause 1a: the route never sees the seeded bridge

This is an internal wiring bug inside T3-A, not a regression from T3-B
and not a mock defect. Three facts combine:

1. `services/api/src/opsmaxx-mcp-routes.ts:197` resolves the bridge as
   `const bridge: OpsMaxxBridge = app.opsmaxxBridge ?? getBridge();`
2. `getBridge()` in the same file returns
   `createInMemoryBridge() as unknown as OpsMaxxBridge` — a **fresh,
   empty** mock. Nothing is injected into it.
3. `services/api/src/server.ts` never decorates `app.opsmaxxBridge`
   (`grep -n opsmaxx services/api/src/server.ts` shows only the import on
   line 29 and `await app.register(opsmaxxMcpRoutes)` on line 286), and
   `BuildAppOptions` (line 104) has **no** `opsmaxxBridge` field.

Meanwhile `opsmaxx-mcp-routes.test.ts:34-68` builds its own
`bridge = createInMemoryBridge()` in a describe-level `beforeAll` and
calls `bridge.__seedSsh(...)` ×2 / `bridge.__seedDb(...)` ×2 on **that**
instance, then calls `buildApp({ enableTransport: false })` without
passing it. The route therefore answers from a different, unseeded mock —
hence `[]` for the list tools.

This explains the `ssh_session_open` failure too: with an empty bridge,
`bridge.ssh.open("ssh-1")` returns `errInvalid("unknown connection:
ssh-1")`, the route maps it to a JSON-RPC error, and the test's
`parseContent` helper trips on its own `expect(res.result).toBeDefined()`
guard at line 87.

The comment on line 64 of the route file already anticipated the missing
piece: *"In production, the bridge is injected via server.ts (T6
wiring)."* That injection was never written.

### Root cause 1b: superseded — the vault *is* seeded

An earlier revision of this handoff claimed the vault case also failed
because the test never seeded the vault. **That is no longer true; verify
before acting on it.** The current test seeds the vault at lines 75-76:

```bash
grep -n '__seed\|vault\.' services/api/src/opsmaxx-mcp-routes.test.ts
# 42, 50: __seedSsh  (2 SSH connections)
# 58, 66: __seedDb   (2 DB connections)
# 75:     bridge.vault.set("api-keys",     "secret-api-key",     "External API keys")
# 76:     bridge.vault.set("db-passwords", "secret-db-password", "Database passwords")
```

(Note the earlier claim was based on grepping only for `__seed`, which
does not match `bridge.vault.set` — the mock exposes no `__seedVault`
helper, so the vault is seeded through the ordinary public API. This is
why the original grep came back empty and why the conclusion was wrong.)

`mock.vault.set` (`packages/opsmaxx-bridge/src/mock.ts:82-91`) mutates
`state.vaultSecrets` and `state.vault` synchronously before returning its
promise, so the un-awaited calls at lines 75-76 do take effect within the
same `beforeAll`. Two consequences for whoever fixes Task 1:

- **Fixing 1a alone is sufficient.** All four failures share one cause:
  the route reads a different, empty bridge instance. Once injection
  works, `ssh_list` sees 2 rows, `db_list` sees 2, `vault_list` sees 2, and
  `ssh_session_open` resolves `ssh-1` because `authRef`
  `opsmaxx-ssh-key-1` exists on the seeded connection.
- Keep the vault assertions as written. The mock's `vault.list` returns
  `{ service, hasSecret: true, note, updatedAt }` and never includes
  `secret` or `value`, so the "must never expose the secret" checks hold
  once entries exist. Do **not** relax them.

Housekeeping (optional, not a blocker): `bridge.vault.set` is typed
`async`, so adding `await` at lines 75-76 is better hygiene even though
the mutation is synchronous today. If a future mock revision introduces an
`await` before the mutation, the un-awaited form would become a real bug.

### Two mechanisms the fix must respect (verified by reading the code)

**(a) The seam already exists but is never called.** The route file
exports a test hook for exactly this purpose:

```ts
// opsmaxx-mcp-routes.ts:71
export function __setOpsMaxxBridgeForTest(bridge: OpsMaxxBridge | undefined):
  OpsMaxxBridge | undefined
```

`grep -rn '__setOpsMaxxBridgeForTest' services packages --include='*.ts'`
returns **only the definition — zero callers**. The T3-A test was written
against a different wiring idea than the route implements, which is the
proximate reason the two bridges never meet.

**(b) The option object is accepted and ignored.** The plugin signature is
`opsmaxxMcpRoutes(app, opts: OpsMaxxMcpRoutesOptions = {})`
(`opsmaxx-mcp-routes.ts:223-224`) and `OpsMaxxMcpRoutesOptions` (line 214)
declares `opsmaxxBridge?: OpsMaxxBridge`, but line 227 never reads `opts`:

```ts
const bridge: OpsMaxxBridge =
  (app as { opsmaxxBridge?: OpsMaxxBridge }).opsmaxxBridge ?? getBridge(app);
```

So even a caller that passes `{ opsmaxxBridge }` to the plugin gets the
fallback. `getBridge(app)` (lines 81-88) then tries the module-level
`injectedBridge`, then `app.opsmaxxBridge`, then constructs a **fresh empty
mock**. `server.ts:286` registers with no options and never decorates
`app.opsmaxxBridge`, and `BuildAppOptions` (`server.ts:104`) has no
`opsmaxxBridge` field — so all three sources are empty at runtime and the
route silently gets the throwaway mock.

**(c) Ordering constraint — the bridge is captured at registration time.**
`opsmaxxMcpRoutes` resolves `bridge` once, in the plugin body, not per
request. The test's outer `beforeAll` calls `buildApp()` +
`app.ready()` (which runs the plugin), and the *describe-level* `beforeAll`
that creates and seeds the bridge runs **after** that. So the hook must be
called before `buildApp()`, or the route must be changed to resolve the
bridge per request. Seeding inside the existing describe-level `beforeAll`
is already too late even once the hook is called — this ordering trap is
the most likely way a fix attempt will appear to "not work".

### Suggested fix (pick one injection approach)

Preferred — complete the intended injection seam:

1. Add `opsmaxxBridge?: OpsMaxxBridge` to `BuildAppOptions` in
   `server.ts`.
2. In `buildApp`, decorate it when present, e.g.
   `if (options.opsmaxxBridge) app.decorate("opsmaxxBridge", options.opsmaxxBridge);`
   (decorate before `await app.register(opsmaxxMcpRoutes)`).
3. In the test, pass the seeded bridge:
   `app = await buildApp({ enableTransport: false, opsmaxxBridge: bridge as unknown as OpsMaxxBridge });`
   — note the test must create and seed the bridge **before**
   `buildApp`, or hand `buildApp` a factory.
4. Declare the `opsmaxxBridge` decoration in the Fastify type
   augmentation used by `app.opsmaxxBridge`.
5. Make the plugin honour its own option as well, so both paths agree:
   `const bridge = opts.opsmaxxBridge ?? app.opsmaxxBridge ?? getBridge(app);`

Alternative — make `getBridge()` a per-app singleton cached in the
Fastify instance, and have the test seed the cached instance instead of a
private one. This is smaller but leaves production wiring implicit, so
option 1 is the better long-term seam.

Smallest possible unblock (test-only, if T6 owns `server.ts` right now):
call `__setOpsMaxxBridgeForTest(seededBridge as unknown as OpsMaxxBridge)`
**before** the outer `buildApp()`, and reset it to `undefined` in
`afterAll` so the module-level variable does not leak into other test files
in the shared vitest worker. Record this as a temporary bridge, not the
final design — it leaves production injection unwritten and bypasses the
plugin's declared option.

### Do not

- Do not weaken the assertions to `expect(res.statusCode).toBe(200)`.
  The four cases exist to prove seeded data reaches the model; silencing
  them removes the only coverage of that path.
- Do not change `opsmaxx-mcp-writes.ts`, `mcp-routes.ts`'s config block,
  or the `RISK` registry to fix this — the fault is local to T3-A's
  bridge resolution.



## Task 2 — the `DISABLE_AUTH` env leak (masking `server.test.ts`)

### Symptom

The full `@agentmesh/api` suite is **198 passed / 5 failed / 1 skipped**.
One of those failures looks alarming and is not:

```text
FAIL src/server.test.ts > api server hardening > API key auth
     > rejects requests to protected routes without a key
AssertionError: expected 200 to be 401
```

A `200` means the global `onRequest` auth guard was skipped, which only
happens when `disableAuth` is true — i.e. `DISABLE_AUTH === "true"` was
visible to `buildApp()`.

### Proof it is a leak, not a regression

```bash
# 1. Green in isolation
pnpm --filter @agentmesh/api exec vitest run src/server.test.ts
# → 18/18 pass

# 2. Same ambient variable reproduces the suite failure exactly
DISABLE_AUTH=true pnpm --filter @agentmesh/api exec vitest run src/server.test.ts
# → 1 failed | 17 passed, identical test, identical `expected 200 to be 401`

# 3. A single neighbouring test file reproduces it too
pnpm --filter @agentmesh/api exec vitest run src/opsmaxx-mcp-routes.test.ts src/server.test.ts
# → same 5 failures as the full suite
```

Vitest 2.1.9 reuses worker processes across test files, so a leaked
`process.env` entry survives into the next file in that worker.
`server.test.ts` captures `const originalEnv = { ...process.env }` at
module load and its `afterEach` does
`process.env = { ...originalEnv }`. Once the polluted environment has been
captured, **every restore re-applies `DISABLE_AUTH=true`** — which is why
the failure tracks file order rather than the code under test. Only one
test in that file asserts a `401` (the other two in the describe expect
`200`), so exactly one case fails.

### The two leak sources

| File | Line | Shape | Fix |
| --- | --- | --- | --- |
| `services/api/src/llm-routes.test.ts` | 23 | `process.env.DISABLE_AUTH = "true"` in `beforeEach`; `afterEach` restores only `globalThis.fetch` and `process.env.NODE_ENV` | add `delete process.env.DISABLE_AUTH;` to `afterEach` |
| `services/api/src/opsmaxx-mcp-routes.test.ts` | 14 | same assignment at **module scope**, outside any hook, with no cleanup at all | move it into `beforeAll` and `delete` it in `afterAll` |

Both files are unmodified relative to `HEAD`
(`git diff --stat HEAD -- <file>` is empty for `llm-routes.test.ts`), so
neither leak was introduced by T3-B. The correct pattern already exists in
the repo — copy it:

- `services/api/src/openai-compat-routes.test.ts:23-25`
- `services/api/src/ghost-routes.test.ts:24-26`

Both do `delete process.env.DISABLE_AUTH;` in `afterEach`.

### Why this matters for the merge gate

Until this is fixed, `pnpm --filter @agentmesh/api test` cannot be used as
a green/red signal for any T3 PR, and reviewers will keep attributing a
phantom failure to whichever track touched `server.ts` last. Fixing it is
a two-line change and unblocks the whole suite's credibility.

## Task 3 — `agent-mesh` typecheck vs `ai-engine` DOM lib ✅ RESOLVED

> **Resolved before this handoff completed.** `pnpm --filter @agentmesh/api
> typecheck` now reports **0 errors**, and the `agent-mesh` reading no
> longer surfaces the 9 transitive `sipp/*` errors. Kept as reference
> because the underlying divergence is structural: `tsconfig.base.json`
> sets `"lib": ["ES2022"]` while `packages/ai-engine/tsconfig.json` adds
> `"DOM", "DOM.Iterable", "WebWorker"`. Any future consumer that pulls
> DOM-dependent code in transitively will hit this again.

`pnpm --filter @agentmesh/api typecheck` is **clean (0 errors)** and that
is the gate T3-B must meet. A separate package reports errors that are
neither T3-A's nor T3-B's:

```bash
pnpm --filter @agentmesh/agent-mesh typecheck
# → 9 errors, all under ../ai-engine/src/sipp/ :
#   model-manager.ts(6,28)   TS2304: Cannot find name 'FileSystemDirectoryHandle'.
#   model-manager.ts(45,20)  TS2304: Cannot find name 'FileSystemDirectoryHandle'.
#   model-manager.ts(46,21)  TS2304: Cannot find name 'FileSystemDirectoryHandle'.
#   sipp-worker.ts(22,18)    TS2304: Cannot find name 'Worker'.
#   sipp-worker.ts(35,21)    TS2304: Cannot find name 'Worker'.
#   sipp-worker.ts(39,28)    TS7006: Parameter 'e' implicitly has an 'any' type.
#   sipp-worker.ts(40,26)    TS7006: Parameter 'e' implicitly has an 'any' type.
#   sipp-worker.ts(49,32)    TS7006: Parameter 'e' implicitly has an 'any' type.
#   sipp-worker.ts(133,29)   TS2304: Cannot find name 'ErrorEvent'.
```

Note the TS7006 group: it is the same root cause. `lib` supplies the DOM
event types that `addEventListener` callbacks infer from; without them the
parameter degenerates to implicit `any`.

Root cause is structural, not a code defect:

- `tsconfig.base.json` sets `"target": "ES2022"` (line 5) and
  `"lib": ["ES2022"]` (line 8).
- `packages/ai-engine/tsconfig.json` overrides with
  `"lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"]` (line 5).
- `packages/agent-mesh/tsconfig.json` does **not** override `lib`; it
  extends the base and inherits `["ES2022"]` only.
- When `ai-engine` sources enter `agent-mesh`'s compilation program, the
  consumer's `lib` wins and the DOM/WebWorker globals disappear.
- `tsconfig.base.json` was **not** changed in that respect by any T3 work
  — the T3 diff there only adds `@agentmesh/opsmaxx-bridge*` path aliases.

Also confirmed: `grep -rln 'ai-engine' packages/agent-mesh/src/` returns
nothing, so the errors come from transitive imports, and **0 errors live
in agent-mesh's own `src/`**. Pick one remediation:

1. Give `agent-mesh` (and any other consumer) the same `lib` list, or
2. Move the DOM-dependent `sipp/*` modules behind their own tsconfig
   project and exclude them from consumers, or
3. Split `sipp` into a separate package whose own tsconfig owns the DOM
   lib.

Option 3 is the cleanest long-term boundary; option 1 is the smallest
unblock.

## Environment

- pnpm `10.0.0` (declared in `package.json` → `packageManager`). Do not use
  npm/yarn; the workspace uses `workspace:*` protocol deps.
- All commands below run from
  `packaging/npm/token-free-gateway/agentmesh` (the agentmesh monorepo root,
  **not** the gateway repo root).
- Worktree/branch: `feat/chat-muhanai-com-workspace`.
- `pnpm install` is required once after checkout; it links
  `@agentmesh/opsmaxx-bridge` into `services/api`, which T3-B added to
  `services/api/package.json` and `vitest.config.ts` (alias resolution).

## File ownership — who must not touch what

| Path | Owner | Note |
| --- | --- | --- |
| `services/api/src/opsmaxx-mcp-writes.ts` | T3-B ✅ done | 7 write tools, codes 4001–4004 |
| `services/api/src/audit/bridge-call-log.ts` | T3-B ✅ done | `argsHash` only, never raw args |
| `services/api/src/opsmaxx-mcp-writes.test.ts` | T3-B ✅ done | 15 cases |
| `services/api/src/opsmaxx-mcp-routes.ts` | T3-A | Task 1 fix goes here |
| `services/api/src/opsmaxx-mcp-routes.test.ts` | T3-A | Task 1 + Task 2 fix |
| `services/api/src/mcp-routes.ts` | T3-B (merge owner) | config block only; both lines already present |
| `packages/opsmaxx-bridge/src/types.ts` | T1 | `RISK` registry; `opsmaxx_vault_remove` already added |
| `services/api/src/server.ts` | shared | Task 1 needs `opsmaxxBridge` in `BuildAppOptions`; register before Task 2 |
| `services/api/src/llm-routes.test.ts` | T1 (test hygiene) | Task 2 fix; do **not** bundle into a T3 PR |
| `packages/agent-mesh/`, `packages/ai-engine/` | build-config owner | Task 3; out of T3 scope |

Rule: `mcp-routes.ts`'s `opsmaxxConfig` object is the only file both T3
halves write. It is now a single merged object — do not split it back into
two competing edits.

## Validation gate before opening the T3-B PR

```bash
cd packaging/npm/token-free-gateway/agentmesh

# 1. T3-B's own surface must be green (this is the PR gate)
pnpm --filter @agentmesh/api exec vitest run \
  src/opsmaxx-mcp-writes.test.ts src/mcp-routes.test.ts        # expect 30/30

# 2. Bridge contract must stay green
pnpm exec vitest run packages/opsmaxx-bridge                   # expect 34/34

# 3. Type gate
pnpm --filter @agentmesh/api typecheck                         # expect 0 errors

# 4. Lint/format
pnpm exec biome check services/api/src/opsmaxx-mcp-writes.ts \
  services/api/src/audit/bridge-call-log.ts                    # expect clean

# 5. Full suite — blocked only by Task 2 (the DISABLE_AUTH leak)
pnpm --filter @agentmesh/api exec vitest run                   # expect 204/204
```

Steps 1–4 pass today, and Step 5 fails with exactly **1** known failure —
Task 2's `DISABLE_AUTH` env leak in `server.test.ts`. Do not treat it as
T3-B debt and do not work around it inside T3-B files.

## Open questions for the next owner

1. Should the `opsmaxxBridge` injection seam (Task 1, preferred fix) also
   be used by T6's production wiring, or does T6 plan a different
   resolution path? Confirm before renaming anything.
2. Is `opsmaxx-mcp-routes.ts`'s `getBridge()` fallback meant to survive in
   production, or is it test-only scaffolding to delete once injection
   exists?
3. `docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md` still lists T3-A/T3-B as
   `feat/opsmaxx/mcp-safe` and `feat/opsmaxx/mcp-risky`, but both halves
   were authored on `feat/chat-muhanai-com-workspace`. Decide whether to
   split the branches before PR or update the plan to match reality.


## State at handoff (2026-09-28, final)

Verified on branch `feat/chat-muhanai-com-workspace` in this worktree.
These numbers supersede every earlier figure in this document.

### Measured results

| Command | Result | Verdict |
| --- | --- | --- |
| `pnpm --filter @agentmesh/api typecheck` | **0 errors** | ✅ |
| `pnpm --filter @agentmesh/api exec vitest run src/opsmaxx-mcp-writes.test.ts src/mcp-routes.test.ts` | **30/30 pass** | ✅ T3-B green |
| `pnpm --filter @agentmesh/api exec vitest run src/opsmaxx-mcp-routes.test.ts` | **14/14 pass** | ✅ T3-A green |
| `pnpm exec vitest run packages/opsmaxx-bridge` | **34/34 pass** | ✅ contract green |
| `pnpm --filter @agentmesh/api exec vitest run` | **202 passed / 1 failed / 1 skipped (204)** | ⚠️ one failure = Task 2 |

The single failure is
`src/server.test.ts > api server hardening > API key auth > rejects
requests to protected routes without a key` → `expected 200 to be 401`,
which §"Task 2" proves is an `DISABLE_AUTH` env leak from a neighbouring
test file, not T3 debt.

### T3-B artifact integrity (checked after the parallel edits landed)

All T3-B deliverables survived the concurrent T3-A work unmodified:

- `services/api/src/opsmaxx-mcp-writes.ts` — 21,338 bytes
- `services/api/src/opsmaxx-mcp-writes.test.ts` — 11,975 bytes
- `services/api/src/audit/bridge-call-log.ts` — 3,958 bytes
- `services/api/src/mcp-routes.ts` — the `opsmaxxConfig` block still
  carries **both** halves: `safe: { url: ... }` and
  `write: { url: ..., tools: OPSMAXX_WRITE_TOOL_NAMES }`, with the
  `OPSMAXX_WRITE_TOOL_NAMES` import on line 26
- `packages/opsmaxx-bridge/src/types.ts:76` —
  `opsmaxx_vault_remove: "needs-approval"` present
- `docs/agentmesh/OPSMAXX-INTEGRATION.md` — the T3-B threat-model
  subsection present

No action needed; recorded so the next owner can detect a regression.

### What is deliberately NOT done

- **The T3-B PR is not open.** Title to use:
  `feat(opsmaxx): write MCP tool surface + audit (T3-B)`.
- **`@opsmaxx-desktop-sec` is not tagged** for the approval-flow review.
- **Actual days taken are not recorded** in
  `docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md` (the plan still shows the
  pre-split `T3`/`T3b` rows in some places — reconcile when the PR opens).
- **Task 2 is not fixed.** The suggested two-line change is documented in
  §"Task 2"; it was intentionally left to the test-hygiene owner because
  `services/api/src/llm-routes.test.ts` is outside T3's file ownership.

### One caution for whoever measures next

This worktree is edited concurrently by more than one agent. During this
handoff, two intermediate measurements were **inconsistent across
minutes**: `typecheck` reported 1–2 errors and
`opsmaxx-mcp-routes.test.ts` once failed to *collect* entirely, purely
because a file was being rewritten mid-run. Before trusting any red
result, re-run it; a collection failure with no test list is a
concurrent-edit artifact, not a defect.

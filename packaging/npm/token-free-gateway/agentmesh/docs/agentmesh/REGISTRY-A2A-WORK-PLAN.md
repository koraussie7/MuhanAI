# Registry + A2A file-level work plan

Companion to `AGENT-ASSIGNMENT-PLAN.md` (OpsMaxx tracks) and
`OPSMAXX-INTEGRATION.md`. This plan covers the three "empty" layers
identified in the integration review:

1. **R1 — Agent/MCP/Skill Registry** (patterned on
   [mcp-gateway-registry](https://github.com/agentic-community/mcp-gateway-registry))
2. **R2 — Agent Discovery** (patterned on
   [hf-discover](https://github.com/huggingface/hf-discover) / ARD)
3. **R3 — Agent↔Agent (A2A)** — the highest-value item; detailed below

Rule for all three tracks: **adopt the reference project's design and
API shape, never vendor their code.** Each track produces an adapter +
contract, exactly like the OpsMaxx bridge did.

---

## Shared pre-work (do once, before R1 starts)

| #   | File                                                    | Action                                                                                            | Owner          |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------- |
| 0.1 | `packages/shared-types/src/agent.ts`                    | Add `Agent`, `AgentTask`, `AgentResponse`                                                         | registry-track |
| 0.2 | `packages/shared-types/src/mcp.ts`                      | Add `MCPTool`, `MCPServer`                                                                        | registry-track |
| 0.3 | `packages/shared-types/src/model.ts`                    | Add `ModelManifest`                                                                               | registry-track |
| 0.4 | `packages/shared-types/src/resource.ts`                 | Add `ResourceDescriptor` (exists; normalise `kind` to `agent \| mcp \| model \| peer \| compute`) | registry-track |
| 0.5 | `packages/shared-types/src/index.ts`                    | Re-export 0.1–0.4                                                                                 | registry-track |
| 0.6 | `packages/shared-types/src/__tests__/contracts.test.ts` | Compile-time + runtime shape test for each type                                                   | registry-track |

**Gate:** `pnpm --filter @agentmesh/shared-types typecheck` and
`test` are green before R1 begins. No other track may start.

---

## R1 — Agent / MCP / Skill Registry

**Branch:** `feat/registry/mcp-agent-registry`
**Days:** 10
**Model on:** mcp-gateway-registry's registry + OAuth/Keycloak separation
(we take the _shape_, defer Keycloak to the security track)

### New files

| File                                                     | Purpose                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/agent-registry/src/types.ts`                   | `RegistryEntry = ResourceDescriptor & { version, visibility, owner }`, `RegistryQuery`, `RegistryPage` |
| `packages/agent-registry/src/registry.ts`                | `createRegistry({ store })` → `register`, `unregister`, `get`, `query`, `list`                         |
| `packages/agent-registry/src/query.ts`                   | Capability/tag/risk filtering + cursor pagination                                                      |
| `packages/agent-registry/src/memory-store.ts`            | In-memory `Map` store (dev + test)                                                                     |
| `packages/agent-registry/src/sqlite-store.ts`            | `bun:sqlite` store behind the same `RegistryStore` interface                                           |
| `packages/agent-registry/src/index.ts`                   | Public exports                                                                                         |
| `packages/agent-registry/src/__tests__/registry.test.ts` | ≥ 10 cases                                                                                             |
| `packages/agent-registry/src/__tests__/query.test.ts`    | Filtering/pagination cases                                                                             |
| `packages/agent-registry/package.json`                   | Workspace package                                                                                      |

### Modified files

| File                                             | Change                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `services/api/src/catalog-routes.ts`             | Mount `GET/POST/DELETE /api/registry/*` using `resolveOwner` for the owner column |
| `services/api/src/server.ts`                     | Register the new route plugin                                                     |
| `services/api/src/registry-routes.test.ts` (new) | HTTP-layer tests incl. 401 on missing Bearer                                      |

### Non-goals

- OAuth/Keycloak token issuance (security track)
- libp2p advertising (P2P track) — R1 only stores an `endpoint` string

### Definition of done

- [ ] `RegistryStore` has two implementations, one test suite runs against both
- [ ] `registry-routes.test.ts` covers create/list/query/delete + 401
- [ ] Capability query is O(n) over the store and returns a stable cursor order

---

## R2 — Agent Discovery (ARD)

**Branch:** `feat/registry/ard-discovery`
**Days:** 10
**Starts after:** R1 phase 2 (the `query` API must exist)
**Model on:** hf-discover's client/server split with federated registries

### New files

| File                                                 | Purpose                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/ard-adapter/src/types.ts`                  | `DiscoveryQuery { need: string[], kinds, budget }`, `DiscoveredResource`, `DiscoveryResult` |
| `packages/ard-adapter/src/querier.ts`                | Natural-language → `DiscoveryQuery` via the existing `llm-router` (structured JSON output)  |
| `packages/ard-adapter/src/local-sources.ts`          | Queries the R1 local registry                                                               |
| `packages/ard-adapter/src/remote-sources.ts`         | Federation client for a remote registry URL (timeout, circuit-breaker)                      |
| `packages/ard-adapter/src/ranker.ts`                 | Score = capability match × peer health × distance; deterministic, unit-testable             |
| `packages/ard-adapter/src/index.ts`                  | Exports                                                                                     |
| `packages/ard-adapter/src/__tests__/ranker.test.ts`  | Ranking determinism cases                                                                   |
| `packages/ard-adapter/src/__tests__/querier.test.ts` | NL→query cases with a stubbed llm-router                                                    |
| `services/api/src/discovery-routes.ts` (new)         | `POST /api/discover`                                                                        |
| `services/api/src/discovery-routes.test.ts` (new)    | HTTP-layer cases                                                                            |

### Modified files

| File                                               | Change                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| `services/api/src/server.ts`                       | Register `discoveryRoutes`                                        |
| `apps/web/src/components/find/CosmicPromptBar.tsx` | Show discovered `DiscoveredResource[]` above the existing results |

### Risks to handle

- **Unbounded fan-out.** A federated query must have a hard deadline;
  `remote-sources.ts` takes an `AbortSignal` and returns partial results
  rather than blocking.
- **Prompt injection.** `querier.ts` must treat the user's NL as _data_
  (a quoted field), never concatenated into the system prompt.

### Definition of done

- [ ] `POST /api/discover` returns `{ results, elapsedMs, sourcesQueried, partial }`
- [ ] One source timing out still yields a 200 with `partial: true`
- [ ] `ranker.test.ts` proves ordering is stable for equal scores

---

## R3 — Agent↔Agent (A2A) — highest value

**Branch:** `feat/a2a/agent-to-agent`
**Days:** 14
**Starts after:** R1 phase 1 (`ResourceDescriptor` + `Agent` type)
**Model on:** Google's A2A protocol (Agent Card + task lifecycle over
JSON-RPC) and the `OpsMaxxBridge` method/transport split we already own.

### Phase 0 — contract (2 days)

| File                                     | Purpose                                                                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/a2a-adapter/src/types.ts`      | `AgentCard`, `A2ATask`, `A2AArtifact`, `A2AMessage`, `TaskState = submitted \| working \| input-required \| completed \| failed \| canceled` |
| `packages/a2a-adapter/src/agent-card.ts` | `defineAgentCard(def): AgentCard` + `toPublicCard()` (strips internal fields)                                                                |
| `packages/a2a-adapter/src/index.ts`      | Exports                                                                                                                                      |

`AgentCard` MUST be derived from the existing `AgentDefinition` in
`packages/agent-core/src/types.ts` — one source of truth, no second
declaration.

### Phase 1 — transport (3 days)

Mirrors the proven `packages/opsmaxx-bridge/src/{ipc,transport}.ts`
shape. Do not invent a new transport abstraction.

| File                                                   | Purpose                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/a2a-adapter/src/transport.ts`                | `A2ATransport` interface (`send`, `subscribe?`, `close`) + `createHttpTransport` |
| `packages/a2a-adapter/src/ipc.ts`                      | `METHOD_MAP` (single place for wire names) + `createA2AClient`                   |
| `packages/a2a-adapter/src/error-map.ts`                | Wire code → `BridgeErrorCode`-style `A2AErrorCode` union                         |
| `packages/a2a-adapter/src/__tests__/ipc.test.ts`       | Method mapping, timeout, error mapping                                           |
| `packages/a2a-adapter/src/__tests__/transport.test.ts` | HTTP round-trip against a local `node:http` server                               |

### Phase 2 — task lifecycle (4 days)

| File                                                      | Purpose                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/a2a-adapter/src/task-store.ts`                  | `TaskStore` interface + in-memory impl; states persist across transport restarts                                |
| `packages/a2a-adapter/src/client.ts`                      | `sendTask`, `getTask`, `cancelTask`, `subscribeTask` (streaming)                                                |
| `packages/a2a-adapter/src/agent-server.ts`                | Serves an `AgentCard` and executes inbound tasks against `packages/agent-mesh/src/index.ts` `AgentMesh.execute` |
| `packages/a2a-adapter/src/stream.ts`                      | SSE progress → `A2AArtifact` accumulation                                                                       |
| `packages/a2a-adapter/src/__tests__/lifecycle.test.ts`    | `submitted → working → completed`; cancel mid-flight; `input-required` round-trip                               |
| `packages/a2a-adapter/src/__tests__/agent-server.test.ts` | Server drives a stub agent and emits artifacts                                                                  |

### Phase 3 — service + web (3 days)

| File                                                        | Purpose                                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `services/api/src/a2a-routes.ts` (new)                      | `GET /.well-known/agent.json`, `POST /a2a/tasks`, `GET /a2a/tasks/:id`, `POST /a2a/tasks/:id/cancel` |
| `services/api/src/a2a-routes.test.ts` (new)                 | Well-known card shape, task lifecycle over HTTP, 404 on unknown task                                 |
| `services/api/src/agents-routes.ts`                         | Add `remoteAgents[]` to the existing agent listing                                                   |
| `apps/web/src/lib/a2a-client.ts` (new)                      | Typed fetch client for the four routes                                                               |
| `apps/web/src/components/harvest/A/AgentCastCard.tsx` (new) | Shows remote task state and artifacts                                                                |
| `apps/web/src/components/harvest/A/PeerCanvas.tsx`          | `sendTask` action on an existing peer row                                                            |

### Phase 4 — P2P binding (2 days, optional gate)

Only start if the P2P track has landed; otherwise R3 ships HTTP-only.

| File                                                          | Purpose                                        |
| ------------------------------------------------------------- | ---------------------------------------------- |
| `packages/a2a-adapter/src/libp2p-transport.ts`                | Wrap `packages/peer-mesh` as an `A2ATransport` |
| `packages/a2a-adapter/src/__tests__/libp2p-transport.test.ts` | Two in-process peers exchange one task         |

### Non-negotiables for R3

- **Auth is the HMAC `sub` claim only.** Same rule as
  `services/api/src/list-routes.ts:resolveOwner`. The A2A layer never
  mints identity; a remote agent card is untrusted input.
- **Bounded work.** A remote task is capped by `timeoutMs` and a
  max-artifact count. An unauthenticated peer must not be able to hold
  a worker open.
- **No vendor code.** Agent Card structure and task states follow the
  A2A spec; the implementation is ours.

### Definition of done

- [ ] `AgentCard` round-trips through `/.well-known/agent.json`
- [ ] Lifecycle test covers all six `TaskState` values
- [ ] Cancel is honoured even while `working`
- [ ] A task with a missing/expired Bearer returns 401 and no partial execution
- [ ] `pnpm --filter @agentmesh/a2a-adapter typecheck && test` green

---

## Sequencing

```
Day 0-2    shared pre-work (0.1-0.6)          [registry-track]
Day 2-12   R1 phases 1-3                      [registry-track]
Day 4-18   R3 phases 0-2  (needs only the Agent type)
Day 14-24  R2          (needs R1 query)
Day 18-24  R3 phase 3
Day 24-26  R3 phase 4 (gate on P2P track)
```

R1 and R3 overlap only on `packages/shared-types/**` — R3 reads, never
writes, so the file-ownership rule in `AGENT-ASSIGNMENT-PLAN.md` holds
without a merge order.

## Cross-track contracts

- `ResourceDescriptor` — `packages/shared-types/src/resource.ts`
- `Agent` / `AgentDefinition` — `packages/shared-types/src/agent.ts`,
  `packages/agent-core/src/types.ts`
- `TaskState` — `packages/a2a-adapter/src/types.ts` (R3 owns it; R1/R2
  may import but not redefine)
- `A2ATransport` — `packages/a2a-adapter/src/transport.ts`

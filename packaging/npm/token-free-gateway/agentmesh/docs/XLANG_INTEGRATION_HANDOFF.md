# XLang Integration Handoff

> **Scope correction.** The runtime this integration targets is **XLang**
> (`xlang-foundation/xlang`). It is *not* LystBot (`TourAround/LystBot`).
> LystBot is an AI-agent list/reminder app exposing a REST API, MCP server, and
> CLI. It has no model, no inference runtime, and no P2P layer, so it must not be
> registered as an XLang peer. Integrate LystBot through the MCP marketplace, not
> through `XLangAgentManifest` / `XLangRegistry` / `/api/xlang/peers`.

## Current owner

The initial XLang adapter slice was implemented directly in this worktree. The next agent should continue from the current branch and treat this document as the integration contract.

## Implemented files

- `packages/ai-engine/src/xlang/protocol.ts`
  - XLang request/response, capability, peer-info, and stream-event types.
  - Runtime guards for JSON response and stream event shapes.
- `packages/ai-engine/src/xlang/client.ts`
  - HTTP `/rpc` client.
  - `health`, `capabilities`, `chat`, and `execute` operations.
  - Timeout and `AbortSignal` handling.
- `packages/ai-engine/src/xlang/xlang-engine.ts`
  - AI-engine-compatible facade with init, chat, stream, execute, model/status methods.
- `packages/ai-engine/src/xlang/index.ts`
  - Public exports.
- `packages/ai-engine/src/xlang/xlang-engine.test.ts`
  - Initial mock transport tests.
- `packages/ai-engine/src/types.ts`
  - Added `"xlang"` to `EngineConfig.type`.
- `packages/ai-engine/src/factory.ts`
  - Added `EngineType = "xlang"` and factory construction.
- `packages/ai-engine/src/index.ts`
  - Re-exported XLang client, engine, and protocol types.

## Intended architecture

```text
Bitterbot / chat.muhanai.com
        ↓
MuhanAI AgentMesh registry and routing
        ↓
XLang Peer adapter
        ↓
XLang runtime (workflow, IPC, tensor, MCP, device APIs)
```

Keep responsibilities separate:

- Noema owns model acquisition and integrity verification.
- AgentMesh owns peer identity, capability announcements, routing, and policy.
- XLang owns workflow/native/IPC execution inside a peer.
- Bitterbot owns user-facing conversation and provider fallback.

## Next integration work
1. Add signed/Gossipsub capability announcements for `runtime: "xlang"`.
2. Connect the registry to `bitterbot-engine.ts` through a cached XLang engine.
3. Add `bitterbot-xlang` provider metadata and timeout/failover tests.
4. Add a dashboard `XLang Peers` route separately from the external `Bitterbot Chat` link.

## Registry and routing slices now implemented
- `packages/llm-router/src/xlang-registry.ts` defines `XLangAgentManifest`, validates endpoint/protocol/capability/transport fields, and provides TTL-backed lookup by peer, capability, and model.
- `packages/llm-router/src/xlang-registry.test.ts` covers valid/invalid manifests, duplicate capabilities, lookup, heartbeat, and eviction.
- `packages/llm-router/src/xlang-beacon.ts` defines the versioned XLang capability topic and a Gossipsub publish/listen adapter that feeds validated manifests into `XLangRegistry`.
- `packages/llm-router/src/index.ts` exports the registry, beacon, and manifest types.
- `apps/web/src/lib/bitterbot-engine.ts` now has an XLang cached-engine fallback after OpenHydra and returns `bitterbot-xlang` metadata when configured.
- `apps/web/src/components/XLangPeersPage.tsx` and the route registry add a dashboard placeholder for discovered XLang peers.
- The registry intentionally does not replace `P2pNodeRegistry`; it is the capability/workflow registry for XLang peers.

## Remaining integration caveat
The beacon now supports a versioned capability envelope with injectable `sign`, `verify`, and `requireSignature` callbacks. Configure `requireSignature: true` with the project's peer identity verifier before exposing public peer registration; the beacon intentionally does not choose a cryptographic algorithm itself.

## Latest direct verification
- `pnpm exec tsc -p packages/llm-router/tsconfig.json --noEmit` passed.
- `pnpm exec tsc -p packages/ai-engine/tsconfig.json --noEmit` passed.
- `pnpm --dir apps/web typecheck` passed.
- Targeted Vitest passed: 3 files, 7 tests.
- `pnpm --dir apps/web build` passed; Vite emitted the application and chat assets. Existing large-chunk warnings remain non-blocking.
- `XLangPeersPage` now fetches the live registry snapshot from `VITE_XLANG_REGISTRY_URL` or `/api/xlang/peers`, falls back to validated localStorage cache, exposes Refresh, reacts to storage events, and reports ignored/corrupt records instead of rendering unchecked JSON.
- `apps/web/src/lib/xlang-registry-client.ts` is the browser-safe snapshot contract. The server/Worker endpoint must return either `XLangPeerInfo[]` or `{ peers: XLangPeerInfo[], updatedAt?: string }`; private peer credentials must never be included.
- `apps/web/src/lib/xlang-registry-client.test.ts` covers snapshot parsing and invalid-peer rejection.
- `deploy/xlang-peers.ts` serves the dashboard snapshot inside the Cloudflare Worker without importing the Node-only `llm-router` package. It reads `env.XLANG_PEERS_JSON`, strips anything that is not a public peer field, and returns `{ peers, updatedAt }`.
- `deploy/worker.ts` routes `GET /api/xlang/peers` before the generic `/api/*` origin proxy, and `Env` gains the optional `XLANG_PEERS_JSON` binding.
- `deploy/xlang-peers.test.ts` covers snapshot validation, dedupe, malformed JSON, method rejection, and unrelated paths.
- Full targeted suite: 6 files, 21 tests passing (`xlang-peers`, `chat-handler`, `xlang-registry-client`, `bitterbot-engine`, `xlang-registry`, `xlang-engine`).

## Public contract for the next agent

```ts
interface XLangAgentManifest {
  id: string;
  runtime: "xlang";
  peerId: string;
  endpoint: string;
  protocol: "xlang-peer-v1";
  capabilities: XLangCapability[];
  models?: string[];
  transports: Array<"http" | "websocket" | "libp2p" | "ipc">;
  supportsStreaming: boolean;
  createdAt: string;
  signature?: string;
}
```

Do not duplicate the protocol types in the registry. Import them from `@agentmesh/ai-engine` after the package export is available.

## Verification notes

Run from `packaging/npm/token-free-gateway/agentmesh`:

```bash
cd packages/ai-engine
pnpm typecheck
pnpm test --run src/xlang/xlang-engine.test.ts
```

The initial test file uses a fetch seam compatible with Bun/TypeScript `RequestInit.body` typing. The production adapter is typechecked; run the package-wide test command after adding the test file to the workspace Vitest include pattern.

## Security constraints

- Never put private XLang credentials in Vite/browser bundles.
- Public browser endpoints must be authenticated or proxied through the Worker.
- Validate peer identity, endpoint scheme, capability names, and announcement age.
- Keep workflow/tool execution separate from ordinary chat inference.

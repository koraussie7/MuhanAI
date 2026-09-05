# Agent 3: P2P Network

## Role
Implement peer-to-peer networking for decentralized agent communication.
Based on AXL (Gensyn) patterns — mesh routing, E2E encryption concept, MCP/A2A bridge.

## Packages
- `packages/p2p/` (new — implement PeerNode + MessageRouter)

## Contracts to Implement
```ts
import type {
  PeerNode, MessageRouter, PeerInfo, P2PMessage, NetworkTopology,
} from "@agentmesh/core";
```

## Files to Create
```
packages/p2p/src/
  node.ts                — P2P node (id, peers, start/stop, send/broadcast)
  transport.ts           — transport layer abstraction (WebSocket/HTTP fallback)
  message-router.ts      — message routing with TTL, loop prevention
  peer-discovery.ts      — peer discovery (bootstrap + mDNS-style)
  index.ts               — re-exports
```

## Reference Patterns
- **AXL/gensyn-ai** (MIT): P2P node with E2E encryption, mesh routing, MCP/A2A support
  → Adapt: PeerNode interface, message TTL, topology queries
- **Yggdrasil network**: overlay mesh networking
  → Adapt: Peer discovery, encrypted transport concept

## Implementation Notes
- **Phase 1**: In-process + WebSocket transport (no native deps)
- **Phase 2**: Add libp2p or WebRTC for real P2P
- Message TTL to prevent infinite loops
- Peer capability advertisement (for expert matching)

## Integration Points
- Agent Mesh topology ↔ P2P network sync
- Expert queries can route through P2P to remote human experts
- Relay tasks (Agent 4) can publish to P2P subscribers

## Output
- PeerNode + MessageRouter interfaces implemented
- Tests: `packages/p2p/src/*.test.ts` (mock transport)
- Gate: `pnpm typecheck && pnpm test` must pass

## Do NOT Modify
- `packages/knowledge/`, `packages/evaluator/` → Agent 1
- `packages/token-bank/`, `packages/human/` → Agent 2
- `packages/mcp/`, `apps/extension/` → Agent 4

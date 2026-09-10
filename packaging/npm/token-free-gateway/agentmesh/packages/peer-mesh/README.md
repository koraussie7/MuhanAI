# `@agentmesh/p2p`

libp2p 3.x transport, pubsub (floodsub), identity, peer catalog, and bandwidth
primitives for the AgentMesh M1–M5 pulse mesh.

> **Decision record**: We use `@libp2p/floodsub` (NOT gossipsub). See
> [ADR-0002](../adr/0002-libp2p-floodsub-swap.md) for rationale and upgrade path.

## What this package owns

| File | Purpose |
|---|---|
| `src/identity.ts` | Ed25519 identity load/create with `ed25519-raw-v1` format marker + corruption recovery (uses `@noble/curves/ed25519`) |
| `src/pubsub.ts` | floodsub factory + `PulseMessage` v1 codec (one-line swap to gossipsub when v3-compatible) |
| `src/transport.ts` | Full libp2p node construction with Pitfall 1–4 inline docs |
| `src/peer-catalog.ts` | Peer tracking with `DiscoveryMethod` enum + 5-min online window |
| `src/bandwidth.ts` | Rate limiter + Semaphore primitives (no libp2p deps — pure) |
| `src/error.ts` | Typed `TransportError` + `TransportResult<T>` |

## Ed25519 dependency choice

`identity.ts` imports from `@noble/curves/ed25519`, **not** `@noble/hashes`. In
`@noble/hashes` ≥ 1.8.0, the Ed25519 module was moved to the sibling
`@noble/curves` package — `@noble/hashes/ed25519` no longer resolves. This
matches folklore's canonical import pattern (`folklore/peer-transport.ts`).

Migration from the previous `@noble/hashes` pin is one-line and additive; the
identity file format (`ed25519-raw-v1`) is unchanged, so existing identity
files on disk remain valid.

## Pitfalls codified (see `transport.ts` header)

1. `peer:discovery` only populates peerStore — MUST explicitly dial.
2. mDNS bind fails on Docker bridge / WSL2 — try/catch wrap.
3. gossipsub 14.x ↔ `@libp2p/interface v3` incompatibility — use floodsub.
4. DHT needs identify to populate routing table — identify() always wired.
5. `/p2p-circuit` listener ONLY when relays configured (noisy dials otherwise).

## Quick start

```ts
import { loadOrCreateIdentity, createTransport } from "@agentmesh/p2p";

const identity = await loadOrCreateIdentity("./.agentmesh/identity.json");
const transport = await createTransport({
  privateKey: identity.privateKey,
  listen: ["/ip4/127.0.0.1/tcp/0"],
  discovery: ["mdns"],
});

if (transport.isOk()) {
  console.log(`up: ${transport.value.peerId} @ ${transport.value.multiaddrs}`);
}
```

## Tests

```bash
pnpm -F @agentmesh/p2p test
```

## See also

- [INTEGRATED-CODE-PLAN.md](../INTEGRATED-CODE-PLAN.md)
- [ADR-0001](../adr/0001-m1-pulse-mesh.md)
- [ADR-0002](../adr/0002-libp2p-floodsub-swap.md)

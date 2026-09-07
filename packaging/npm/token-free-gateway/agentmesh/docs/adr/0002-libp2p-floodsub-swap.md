# ADR-0002: libp2p floodsub swap

## Status

Accepted 2026-09-06.

## Problem

`@chainsafe/libp2p-gossipsub 14.1.2` transitively imports
`@libp2p/interface v2`, which conflicts with our monorepo's
`@libp2p/interface ^3.2.0`. pnpm peer dependency resolution rejects the
conflict, blocking #107 (M1 libp2p gossiper).

```
$ pnpm install
...
 WARN  Issues with peer dependencies found
└─ ✗ unmet peer @libp2p/interface@"^2.0.0" from @chainsafe/libp2p-gossipsub@14.1.2
```

## Options evaluated

### A. Downgrade `libp2p 3.x` → `2.x`

**Rejected**. Wide blast radius — would break ~12 transitive deps
(@libp2p/crypto, peer-id, peer-store, identify, ping, etc. all have v3 APIs
we use elsewhere).

### B. Switch to `@libp2p/floodsub`

**Selected**. Same pubsub API as gossipsub. folklore evidence of success
in production (v5.0.2 with 942 tests, MIT-licensed). O(n²) traffic is
acceptable at our target scale (≤100 active peers).

### C. Wait for `@chainsafe/libp2p-gossipsub v15` (v3-compatible)

**Deferred**. Unknown timeline. We can adopt when available — the swap is
one line (see "Upgrade path" below).

## Decision

**Option B**. We adopt `@libp2p/floodsub@^11.0.18` as the pubsub layer.

## Upgrade path

When `@chainsafe` ships a v3-compatible gossipsub, replace the body of
`createPubSub()` in `packages/p2p/src/pubsub.ts`:

```ts
// Before (current — floodsub)
import { floodsub } from "@libp2p/floodsub";
export function createPubSub(): ReturnType<typeof floodsub> {
  return floodsub();
}

// After (when available — gossipsub v3)
// import { gossipsub } from '@chainsafe/libp2p-gossipsub';
// export function createPubSub(): ReturnType<typeof gossipsub> {
//   return gossipsub({ allowPublishToZeroPeers: true });
// }
```

The `PULSE_TOPIC` constant and `PulseMessage` v1 codec stay the same —
they are pubsub-implementation-agnostic.

## Topic advertisement gap (and mitigation)

floodsub lacks gossipsub's mesh scoring. For pure broadcast this is
irrelevant. For topic discovery (e.g. subscribing to a new channel at
runtime) we rely on either:

- **mDNS topic advertisement**: out-of-band, only works on the same LAN.
- **Kademlia DHT topic lookup**: covered by `/agentmesh/kad/1.0.0` protocol
  prefix. Implement when needed (M5+).

## Risks

| Risk | Mitigation |
|---|---|
| Scale beyond 100 peers triggers O(n²) flood | Cap subscribers via `Semaphore` (folklore pattern); per-peer rate limit via `RateLimiter`; migrate to gossipsub when peer count grows. |
| No gossip mesh scoring | Acceptable for M1 broadcast. Add topic discovery via DHT in M5+ if needed. |
| folklore upstream swap | Their upstream may migrate to gossipsub first — we'd track and adopt same one-line swap. |

## References

- folklore/peer-transport.ts:26-32 (verbatim source of rationale)
- folklore/peer-transport.ts:111-126 (Pitfall 2 — mDNS try/catch)
- folklore/peer-transport.ts:95-110 (Pitfall 1 — explicit dial)
- [ADR-0001](./0001-m1-pulse-mesh.md) — parent decision
- [ADR-0003](./0003-eight-repo-lineage.md) — 8-repo matrix

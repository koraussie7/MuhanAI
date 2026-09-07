# ADR-0001: M1 Pulse Mesh Architecture

## Status

Accepted 2026-09-06 (DRAFT — pending stakeholder review).

## Context

muhanai/agentmesh M1–M5 needs a distributed pubsub layer for cross-instance
pulse events (presence, request/reply, broadcast). We surveyed 8 OSS repos
to identify patterns and unblock the gossipsub-vs-interface-3.x peer
dependency conflict that has blocked M1 since the start of the worktree.

## Surveyed repos (license-vetted)

| Repo | License | Verdict |
|---|---|---|
| peerd | Apache-2.0 | Reference only (signaling pattern) |
| agentfm | Apache-2.0 | Reference only (topic versioning) |
| llmlet | MIT | Reference only (output handler) |
| p2ptokens | MIT-intent | Concept reference (co-receipts → token-bank Phase 2) |
| p2pclaw | MIT-external | Concept reference (SW + DID) |
| pinkybrain | MIT | Direct reference (4-tier + scheduler) |
| HiveBear | MIT | Direct reference (TOFU + TrustVerifier + Reputation) |
| folklore | MIT | **PRIMARY REFERENCE** (libp2p 3.x + floodsub + peer-transport + energy gate) |

Full lineage table: [0003-eight-repo-lineage.md](./0003-eight-repo-lineage.md).

## Decision

### D1: pubsub = `@libp2p/floodsub` (NOT gossipsub)

@chainsafe/libp2p-gossipsub `14.1.2` transitively targets
`@libp2p/interface v2`. Our monorepo already pins `@libp2p/interface ^3.2.0`.
pnpm peer dependency resolution rejects the conflict.

folklore solved this exact problem (folklore/peer-transport.ts:26-32, verbatim):

> "Gossipsub 14.x still targets @libp2p/interface v2 while folklore uses v3,
> so floodsub is the right fit until @chainsafe ships a v3-compatible
> gossipsub release. The service API is identical so upgrading later is a
> one-line swap."

We adopt the same solution. floodsub has identical pubsub API
(`subscribe`/`publish`/`message` event). Traffic is O(n²); acceptable for
our target scale (≤100 active peers). The factory wrapper
`createPubSub()` in `packages/p2p/src/pubsub.ts` isolates the swap to one
file — see [ADR-0002](./0002-libp2p-floodsub-swap.md).

### D2: libp2p 3.2.0 (no downgrade to v2)

v3 keeps `@libp2p/interface 3.x` consistent with our other deps. A
downgrade to libp2p 2.x would break ~12 transitive packages.

### D3: new `@agentmesh/p2p` package

Single-responsibility home for libp2p node construction, pubsub, identity,
peer catalog, and bandwidth primitives. The existing
`@agentmesh/federation-transport` keeps its `Transport` interface contract
and delegates construction to `@agentmesh/p2p`.

### D4: agent-mesh executor unchanged

`DomainAgent` + `AgentMesh.execute()` is folklore's `application/use-cases`
analog. No refactor needed.

### D5: token-bank Phase 0–3 unchanged; payment-mesh deferred

`InMemoryTokenLedger` + `WelcomeCredits` (1M credits for new users) are
already integrated. payment-mesh (libp2p-integrated token ledger) is
explicitly deferred to Phase 4+ per user direction.

### D6: Pitfall 1–4 inline-documented

folklore's pattern of putting pitfall warnings inline in the code (not
just the PR description) is preserved.

## Consequences

**Positive**
- #107 blocker resolved without libp2p downgrade.
- 8 repos of patterns available as reference (license-vetted: 4× MIT clean).
- Hexagonal/Clean architecture precedent for the broader monorepo.
- Inline pitfall documentation saves future contributors time.

**Negative**
- floodsub is O(n²); must re-evaluate when scaling past ~100 peers.
- No gossip mesh scoring (topic advertisement / peer scoring) — acceptable
  for M1 broadcast, revisit at M5 if topic discovery becomes important.

## Architecture

```
apps/web (React 19 + Vite 6)
  ├─ useGossipPulse (primary, M3)
  └─ EventSource /api/pulse/stream (fallback)
                   │
services/api (Fastify 5.2.1)
  ├─ /api/pulse/stream (SSE fanout, M2)
  ├─ /api/pulse/publish (POST, M2)
  ├─ gossip-bridge.ts (PulseGossiper ↔ SSE)
  └─ server.ts → app.pulseGossiper (decorated)
                   │
                   │ uses
                   ▼
packages/p2p (NEW, M1) — this ADR
  ├─ transport.ts (libp2p 3.x + floodsub + Pitfall 1–4)
  ├─ pubsub.ts (floodsub factory, D1)
  ├─ identity.ts (Ed25519 + format marker)
  ├─ peer-catalog.ts (DiscoveryMethod enum)
  ├─ bandwidth.ts (rate limiter + Semaphore)
  └─ tests/ (vitest)
                   │
                   │ delegates
                   ▼
packages/federation-transport (existing — interface only)
  ├─ transport-manager.ts
  ├─ libp2p-transport.ts (uses @agentmesh/p2p)
  ├─ http-transport.ts
  └─ loopback-transport.ts
```

## Open questions

- When to migrate from floodsub → gossipsub? Trigger: peer count > 100
  OR @chainsafe ships v3-compatible gossipsub.
- Reputation persistence layer (folklore peer-reputation-store vs HiveBear
  reputation.rs) — defer to token-bank Phase 2.
- Co-receipts metering (p2ptokens) — defer to token-bank Phase 2.
- 4-tier + monthly rewards (pinkybrain) — defer to token-bank Phase 2+.
- Swarm-aware adaptive scheduler (HiveBear) — defer to token-bank Phase 3.

## References

- [INTEGRATED-CODE-PLAN.md](../INTEGRATED-CODE-PLAN.md) — full plan
- [ADR-0002](./0002-libp2p-floodsub-swap.md) — D1 detail
- [ADR-0003](./0003-eight-repo-lineage.md) — 8-repo matrix

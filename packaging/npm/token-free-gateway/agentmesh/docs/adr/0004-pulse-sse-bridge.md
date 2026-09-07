# ADR-0004: Pulse SSE Bridge — three-layer fan-out

## Status

Accepted 2026-09-07 (W4 implementation complete).

## Context

The pulse mesh (ADR-0001) produces `PulseMessage` events on every connected
libp2p node. The web client (apps/web) needs to observe those events in
real time. Two transport options:

| Option | Pros | Cons |
|---|---|---|
| WebSocket | Bidirectional, well-known | Adds framing + state to client; some proxies buffer |
| **SSE (`text/event-stream`)** | One-way (which matches our model), HTTP/1.1 compatible, auto-reconnect built into EventSource, no extra server deps | Server-to-client only; needs careful backpressure handling |

Decision: **SSE**. Pulse is server-push by design — clients request, server
streams. SSE's `retry:` directive gives us reconnect for free; WebSocket
would force us to re-implement it. The libp2p node never needs to push
back from the browser, so the bidirectional channel is overkill.

## Decision

Three-layer separation, each independently unit-testable:

```
libp2p floodsub  ──▶  PulseBridge  ──▶  PulseSink (SSE writer)  ──▶  HTTP client
       ▲                  │                     │
       │           libp2p-agnostic        transport-agnostic
       │           (PulseSource iface)    (PulseSink iface)
       │                  │                     │
       └────── gossip-bridge.ts ◀──── pulse-stream.ts
```

### D1: `PulseSource` and `PulseSink` are interfaces, not concrete types

The bridge (`services/api/src/gossip-bridge.ts`) depends on `PulseSource` and
`PulseSink` interfaces, not on `@libp2p/floodsub` or `fastify`. This gives us:

- **Unit tests with mocks** — no libp2p node required to test fan-out, sink
  failure isolation, or heartbeat cadence.
- **Future flexibility** — when @chainsafe ships a v3-compatible gossipsub
  (ADR-0001 D1), only the source adapter changes. The bridge stays the same.

### D2: Bridge is a process-level singleton on the Fastify app

`server.ts` decorates the Fastify instance with `app.pulseBridge` and starts
the heartbeat loop. `onClose` hook stops it cleanly. Reasoning:

- A single source can have many sinks (one per SSE client). Per-request
  bridges would force every client to maintain its own libp2p subscription,
  which is wasteful.
- The SSE client count is bounded by HTTP keep-alive limits; the libp2p
  subscription count is bounded by the node's actual floodsub peers.

### D3: Degraded mode when source is null

`setSource(null)` puts the bridge in heartbeat-only mode. SSE clients still
receive `event: heartbeat` frames so they can detect connection liveness
even before libp2p has initialized. Reasoning:

- During server startup the libp2p node may not be ready for several
  seconds. SSE clients shouldn't see "no events" — they should see "events
  are coming, the connection is alive, hang tight."
- When libp2p finally starts, the operator calls `app.pulseBridge.setSource(...)`
  and live events start flowing without reconnect.

### D4: Sink failure isolation

`fanOut()` iterates sinks over a snapshot. If a sink's `write()` throws, the
bridge logs, detaches that sink, and continues serving others. Reasoning:

- One slow/dead SSE client must not block the others.
- The detached sink's underlying socket has already errored; trying to
  re-deliver is wasted work.

### D5: Raw `reply.raw` over SSE library

We hand-format SSE frames (`event: <name>\ndata: <json>\n\n`) using Node's
writable stream directly. Reasoning:

- SSE wire format is trivial (≤10 LOC).
- A library adds a dependency and an abstraction layer without saving us
  any complexity.
- Backpressure (`drain` event) is the only non-trivial bit — handling it
  directly with `reply.raw` keeps the contract transparent.

## Consequences

**Positive**

- The SSE layer can be tested without libp2p or Fastify running.
- Source/sink separation lets us add WebSocket support later without
  touching `gossip-bridge.ts`.
- Backpressure is explicit and observable.

**Negative**

- We hand-maintain the SSE wire format. If a future use case needs SSE
  comments (`:keep-alive`), multi-line `data:` fields, or event IDs, we
  add them here.
- Raw `reply.raw` ties the writer to Fastify. If we ever extract `pulse-stream.ts`
  to a shared package, we'd need a `WritableLike` abstraction (already
  present, see D5).

## Alternatives considered

- **`@fastify/sse`** — adds a dep for ~30 LOC of work; rejected.
- **WebSocket via `@fastify/websocket`** — over-engineered for our
  one-way push semantics; rejected per context above.
- **Long polling** — defeats the purpose of "live" events; rejected.

## Implementation

- `services/api/src/gossip-bridge.ts` — PulseBridge + interfaces
- `services/api/src/pulse-stream.ts` — SSE writer
- `services/api/src/pulse-routes.ts` — Fastify plugin (`GET /api/pulse/stream`,
  `GET /api/pulse/status`)
- `services/api/src/server.ts` — bridge singleton + lifecycle hooks

Test coverage: 8 PulseBridge tests + 5 SSE writer tests (13 new tests,
all green).

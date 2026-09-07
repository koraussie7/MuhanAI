# ADR-0005: useGossipPulse — React adapter for the SSE pulse stream

## Status

Accepted 2026-09-07 (W5 implementation complete).

## Context

ADR-0004 ships the server-side SSE bridge at `GET /api/pulse/stream`.
Apps/web needs a React-friendly way to consume it. Direct EventSource
usage in components has three pain points:

1. **Lifecycle** — every component using EventSource must manage
   `useEffect` cleanup, readyState handling, and re-renders on close.
2. **Buffering** — components that want the last N messages (e.g.
   `NetworkPulse`) must re-implement FIFO eviction.
3. **Filtering** — `CreditBalance` only cares about credit events,
   not all PulseMessages. Naive EventSource wiring means every
   component re-renders on every pulse.

## Decision

Two-file separation:

```
apps/web/src/hooks/
  ├─ pulse-subscriber.ts     ← pure EventSource lifecycle (testable without React)
  └─ useGossipPulse.ts       ← thin React adapter (useState + useEffect)
```

### D1: Subscriber is a pure factory, hook is a thin wrapper

`createPulseSubscriber({url, kinds, bufferSize, EventSource, onStatus, onReconnect, onMessage})`
returns `{dispose}`. It is:

- **Pure** — no React, no `this`, no state. All state lives in the
  caller's callbacks.
- **Injectable** — accepts a custom `EventSource` constructor, so tests
  drive the lifecycle without jsdom.
- **Idempotent dispose** — calling `dispose()` twice is safe.

`useGossipPulse` is a thin React adapter: it owns the `messages` /
`latest` / `status` state, calls `createPulseSubscriber` inside
`useEffect`, and bridges the subscriber's callbacks into `useState`
setters. Same shape components would have to write themselves, but
centralized.

### D2: Local `PulseMessage` mirror, not `@agentmesh/p2p` import

`@agentmesh/p2p` re-exports libp2p modules. Importing the
`PulseMessage` type from it would pull libp2p into the Vite bundle
even with `import type` (the package's `index.ts` re-exports many
runtime modules and Vite resolves them eagerly).

Instead, `PulseMessage` is defined locally in `useGossipPulse.ts`
with a comment pointing at the canonical source. The runtime `v === 1`
check in `pulse-subscriber.ts` is the actual contract — TypeScript
here is convenience, not enforcement. Drift risk is bounded (5 fields)
and would surface as a malformed payload (silently dropped).

The local union also extends `PulseKind` with `"credit"` — a
forward-compatible kind the server doesn't yet emit but apps/web
consumes via `useGossipPulse({kinds: ["credit"]})`. Adding `"credit"`
to `@agentmesh/p2p`'s union is a separate decision (likely W6 or
later) when the server starts emitting these.

### D3: EventSource reconnect is delegated, not re-implemented

The browser's EventSource auto-reconnects on transient errors using
the server's `retry:` hint (we send `3000`). We do **not** re-implement
that — adding a manual reconnect loop would race with the browser's
and double-fire reconnects.

`close()` is the only way to stop reconnects permanently. `reconnect()`
bumps a nonce that re-runs the effect, opening a fresh EventSource —
useful when the user manually toggles connection state (e.g. switches
network). The reconnect count tracks how many times the connection
has opened, which is a useful signal for "this user has flaky
connectivity" UX.

### D4: `status: "unsupported"` for SSR / old browsers

If `window.EventSource` is undefined (SSR, legacy browsers, tests
that don't inject the constructor), the hook returns `status:
"unsupported"` rather than throwing. Callers render a fallback UI.

### D5: Component opt-in for live mode

NetworkPulse keeps polling as the baseline (existing behavior is
correct — `/api/pulse` aggregates across many peers). The `live`
prop adds SSE as an incremental signal: each inbound message nudges
the corresponding counter upward. This is intentionally additive —
flipping it on doesn't break the polling flow.

CreditBalance's live mode is subtler: an inbound `kind: "credit"`
message replaces the displayed balance. If `userId` is present in
the payload and doesn't match the component's user, it's skipped
(no cross-user bleed).

## Consequences

**Positive**

- The hook is unit-testable without React or jsdom (12 tests in
  `pulse-subscriber.test.ts` cover the lifecycle).
- Components opt into live mode incrementally — no breaking changes
  to existing polling code paths.
- The local PulseMessage mirror keeps the browser bundle free of
  libp2p (~hundreds of KB).

**Negative**

- Local type mirror risks drift if `@agentmesh/p2p` changes the wire
  format. Mitigated by the runtime `v === 1` check and a comment.
- "credit" kind is forward-only — if the server decides to call it
  something else, both producer and consumer need to agree.

## Alternatives considered

- **React Query / SWR over SSE** — both libraries wrap fetch, not
  EventSource; would need an SSE adapter anyway. Rejected for
  dependency weight (React Query alone is ~12 KB gzipped).
- **Direct EventSource in each component** — DRY violation; every
  component would re-implement buffering + filtering. Rejected.
- **WebSocket via `@fastify/websocket`** — see ADR-0004. SSE is
  one-way and matches the pulse model. Rejected.

## Implementation

- `apps/web/src/hooks/useGossipPulse.ts` — React hook
- `apps/web/src/hooks/pulse-subscriber.ts` — pure lifecycle
- `apps/web/src/hooks/pulse-subscriber.test.ts` — 12 tests
- `apps/web/src/components/CreditBalance.tsx` — live updates from
  `kind: "credit"` messages
- `apps/web/src/components/NetworkPulse.tsx` — `live` prop
  (default off)

Test coverage: 12 new tests, all green. apps/web typecheck clean.

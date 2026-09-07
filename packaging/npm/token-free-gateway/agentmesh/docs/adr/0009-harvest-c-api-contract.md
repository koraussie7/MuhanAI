# ADR-0009: Harvest C API Contract + Graceful-Degradation Adapter Pattern

## Status

Accepted 2026-09-07.

## Context

The TASK-C components in `apps/web/src/components/harvest/C/` ship with
a built-in `stubAdapter()` so the UI renders without a backend. Before
this ADR they had no path to a real data source — `App.tsx` and
`SpecPages.tsx` mounted `<LlmMeshPage />` and `<SecuritySettings />`
without injecting an adapter, defaulting to the stubs. The Harvest C
backend routes that the adapters were *intended* to call (`/api/llm-mesh`,
`/api/security`, `/api/credits`) did not exist; only `/api/credits/balance`,
`/api/credits/spend`, and `/api/credits/grant-welcome` were implemented
in `services/api/src/credits-routes.ts`.

This left the LlmMeshPage and SecuritySettings pages permanently
demo-only — the data was realistic but never reflected real gateway
health, real quota usage, or real audit events. The TASK-C adapter
primitives (`ResourceAdapter<T>`, `WritableResourceAdapter<T>`,
`createHttpAdapter`, `createStubAdapter`) were designed for this wiring
but no caller used them.

## Decision

Three endpoints are added to `services/api/`, registered in `server.ts`,
and wired to the TASK-C components through a new "resilient" adapter
wrapper that degrades gracefully when the API is unreachable.

### Endpoint ownership

| Endpoint                              | Route file                     | Auth | Purpose                                  |
| ------------------------------------- | ------------------------------ | ---- | ---------------------------------------- |
| `GET /api/llm-mesh`                   | `llm-mesh-routes.ts` (new)     | yes  | Provider + route + vault snapshot        |
| `GET /api/security`                   | `security-routes.ts` (new)     | yes  | Toggles + quota + keys + audit snapshot  |
| `POST /api/security/toggles`          | `security-routes.ts` (new)     | yes  | Persist security toggles                 |
| `POST /api/security/daily-limit`      | `security-routes.ts` (new)     | yes  | Persist daily credit limit               |
| `POST /api/security/keys/:svc/revoke` | `security-routes.ts` (new)     | yes  | Remove a vault key                       |
| `GET /api/credits`                    | `credits-routes.ts` (extends)  | yes  | Aggregate credits snapshot               |
| `GET /api/credits/balance`            | `credits-routes.ts` (existing) | yes  | (unchanged) wallet balance               |
| `POST /api/credits/spend`             | `credits-routes.ts` (existing) | yes  | (unchanged) atomic debit                 |
| `POST /api/credits/grant-welcome`     | `credits-routes.ts` (existing) | yes  | (unchanged) signup integration           |

The aggregate `/api/credits` endpoint deliberately **does not** depend on
the security-route state. Both routes keep their own state because the
security daily-limit setting is operator-controlled (set in the
SecuritySettings panel) while the credits balance is wallet-controlled
(set by `spend`/`grant-welcome`). Cross-route coupling would create
a hidden ordering dependency between the route registrations; we
explicitly accept the duplication and document it as a future refactor
opportunity once both modules gain a Prisma repository layer.

### Snapshot shape contracts

Response shapes mirror the TypeScript interfaces in the consuming
components. Each new route file carries a `satisfies` clause on the
returned object so the compiler catches drift between the route and
the consumer.

- `LlmMeshSnapshot`  ← `LlmMeshPage.tsx`
- `SecuritySnapshot` ← `SecuritySettings.tsx`
- Aggregate credits  ← shares the `quota[]` / `dailyLimitCredits` /
  `dailyUsedCredits` fields with `SecuritySnapshot.quota[]`

When a new field is added to a snapshot in the component, the route
handler must add it in the same commit. Conversely, removing a field
must be coordinated across both sides — the route file's
`satisfies` will refuse to compile until the consumer is updated.

### Auth posture

All new endpoints sit **behind** the existing `x-api-key` hook in
`server.ts`. The browser never calls these routes directly in
production; the dev-server proxy (`vite: /api → :3001`) injects the
API key. Tests set `DISABLE_AUTH=true` and `NODE_ENV=development` to
bypass the hook (see `llm-mesh-routes.test.ts`, `security-routes.test.ts`,
`credits-aggregate.test.ts` for the exact pattern).

A production-mode test (`NODE_ENV=production`, `API_KEY=test-key-12345`)
asserts both the 401 path (no key) and the 200 path (valid key) so a
regression on the auth check is caught immediately.

### Graceful-degradation adapter

The new `createResilientAdapter(primary, fallback)` helper in
`apps/web/src/components/harvest/C/adapter.ts` wraps `loadSnapshot()`
in a try/catch:

```ts
export function createResilientAdapter<TSnapshot>(
	primary: ResourceAdapter<TSnapshot>,
	fallback: () => TSnapshot,
): ResourceAdapter<TSnapshot> {
	return {
		async loadSnapshot() {
			try {
				return await primary.loadSnapshot();
			} catch {
				return fallback();
			}
		},
	};
}
```

This is applied **only to the read path**. Mutations (security
toggle, daily limit, key revoke) propagate errors to the caller —
the component already shows an optimistic update that is rolled back
in the `finally` block when the mutation fails, so the UX stays
honest. A failed mutation is a real failure the user must see.

The fallback producer for each component is exported separately
(`stubLlmMeshSnapshot`, `stubSnapshot`) so:
- Tests can pair it with `createResilientAdapter` and assert the
  degraded path.
- The "live" adapter can be re-attached to a different fallback later
  (e.g., a cached snapshot from `IndexedDB`) without changing the
  components.

### What this ADR does **not** solve

- **Real provider health probes.** `/api/llm-mesh` currently returns
  jittered synthetic latency. Replacing this with a real
  `Promise.all(providerHealthChecks)` is a follow-up.
- **Cross-route state coordination.** Daily-limit and quota state are
  duplicated between `security-routes.ts` and `credits-routes.ts`.
  The next phase should extract a `services/api/src/state/` module
  with Prisma-backed repositories.
- **SSE push for security events.** The audit log is currently a
  snapshot read on every refresh. Pushing new events over SSE (using
  the existing `PulseBridge` pattern) would close the
  "the audit log is stale by up to 30 s" gap.
- **API-key propagation in browser builds.** Vite proxy currently
  injects the key for `/api/*`. A future PR should add a session-bound
  user token so the API key can be rotated per-user rather than
  per-deployment.

## Consequences

**Positive**

- LlmMeshPage and SecuritySettings now reflect real backend data when
  the API is running and degrade to deterministic fixtures when it is
  not. The UI never sits in a "Loading…" hang.
- New routes are protected by the existing API-key hook, so no new
  attack surface.
- All four route files have focused test coverage (3+5+3 = 11 new
  tests, plus 4 pre-existing adapter tests that still pass).
- The `satisfies` pattern on the new routes catches schema drift at
  compile time.

**Negative**

- The 30-second refresh interval in `LlmMeshPage` (and the manual
  refresh button in `SecuritySettings`) means the panels can be up to
  30 s behind the live API state. SSE push is the right answer but is
  deferred.
- The duplicated daily-limit / quota state between `security-routes.ts`
  and `credits-routes.ts` can drift. A future refactor must move both
  into a shared repository.
- Mutations surface raw HTTP errors to the user-facing toast (the
  fallback catch is intentionally absent). Better error mapping
  (translate `InsufficientCreditsError` / `InsufficientTogglesError`
  to friendly copy) is a UX follow-up.

**Operational**

- Endpoint list is now stable: `llm-mesh`, `security`, `credits`. Any
  new TASK-C panel that needs server data should pick a `/api/<noun>`
  URL and follow the same pattern (route file + test + adapter
  re-export + component default = `createResilientAdapter(...)`).
- All three new route files live next to their peers in
  `services/api/src/`. There is no central registry; `server.ts` is
  the source of truth for which routes are mounted.

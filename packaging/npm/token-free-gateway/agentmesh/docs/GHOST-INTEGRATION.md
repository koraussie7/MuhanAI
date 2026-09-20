# Ghost integration

[Ghost](https://github.com/ghostapp-ai/ghost) desktop/mobile nodes and MuhanAI integrate in **both directions**:

1. **Inbound** — MuhanAI registers Ghost nodes as local-first Agent Mesh workers (discovery, verification, gated dispatch). See *Current scope* below.
2. **Outbound** — MuhanAI publishes its own Agent Card so a Ghost install can discover and bind it as a remote agent. See *Publishing MuhanAI as a discoverable agent* below.

## Publishing MuhanAI as a discoverable agent

Ghost discovers remote agents by fetching `/.well-known/agent.json` from a base URL. MuhanAI serves that document so any A2A-protocol client can find it:

```bash
curl https://muhanai.com/.well-known/agent.json
```

```json
{
  "name": "MuhanAI Agent Mesh",
  "url": "https://muhanai.com",
  "version": "1.0.0",
  "capabilities": ["local_file_search", "local_code_analysis", "offline_inference", "desktop_automation"],
  "skills": [
    { "id": "muhanai_ask_quorum", "name": "Ask Quorum" },
    { "id": "muhanai_search_knowledge", "name": "Search Knowledge" },
    { "id": "muhanai_get_pulse", "name": "Get Pulse" }
  ],
  "protocol": { "a2a": "jsonrpc-2.0", "mcp": "https://muhanai.com/api/mcp/rpc" }
}
```

Served from **two places**, because `muhanai.com` is fronted by a Cloudflare Worker:

| Surface | File | Why |
|---|---|---|
| Cloudflare Worker | `deploy/mcp-server.ts` (`handleMcpRequest`) | The Worker answers `/.well-known/*` itself, so this is the path that actually responds in production. Without it the request falls through to the SPA handler and redirects. |
| Origin API | `services/api/src/mcp-routes.ts` | Serves the same card directly from the Fastify server. |

`/.well-known/agent.json` is listed in `PUBLIC_PATH_EXACT` (`services/api/src/server.ts`) so discovery works **before** authentication — a discovery document is useless if it requires the credential you are trying to find.

### Capability vocabulary

The `capabilities` values are the fixed set the Ghost client's `parseGhostAgentCard` accepts (`packages/ghost-adapter/src/index.ts`):

```
local_file_search | local_code_analysis | offline_inference | desktop_automation
```

Any value outside that set is **silently dropped** by the client's filter, so keep new entries in sync with `GhostCapability` or they will never be visible to a Ghost install. `skills` is free-form `{id, name, description?}`; malformed rows are dropped rather than failing the whole card, since an unknown skill must never make an otherwise discoverable agent un-registrable.

### Verifying the outbound card

`deploy/verify-ghost-discovery.mts` exercises the real client code path against the live endpoint — SSRF guard, fetch, `parseGhostAgentCard`, and registry registration — rather than re-implementing the contract:

```bash
cd packaging/npm/token-free-gateway/agentmesh
bun run deploy/verify-ghost-discovery.mts
# override the target: GHOST_DISCOVERY_TARGET=https://staging.muhanai.com bun run ...
```

A passing run prints the parsed card, the accepted capabilities, the parsed skills, and `registered ["muhanai.com"]`.

## Current scope

The first integration slice is intentionally read-only:

- discover a Ghost Agent Card at `/.well-known/agent.json`;
- validate supported capabilities;
- register a node heartbeat in the API process;
- expose registered nodes at `GET /api/ghost/nodes`.

Registration (authenticated):

```bash
curl -X POST http://localhost:3001/api/ghost/nodes \
  -H 'content-type: application/json' \
  -H 'x-ghost-token: <GHOST_REGISTRATION_TOKEN>' \
  -d '{"nodeId":"ghost-mac-01","url":"https://ghost.example.com:8787"}'
```

## Security controls

**Registration auth** — `POST /api/ghost/nodes` requires one of:

- `x-ghost-token` matching `GHOST_REGISTRATION_TOKEN` (scoped token for Ghost installs);
- `x-api-key` matching the platform `API_KEY` (operator path; the global
  auth hook in `server.ts` also enforces this for non-public routes).

Comparison is constant-time. With neither credential configured, only a
non-production dev server started with `DISABLE_AUTH=true` may register.

**SSRF guard** (`packages/ghost-adapter/src/ssrf.ts`) — the registration
body supplies a URL the server fetches, so discovery runs behind a
fail-closed guard:

- scheme restricted to http/https, no embedded credentials;
- internal targets rejected: loopback, RFC1918, link-local (cloud metadata
  `169.254.169.254`), IPv6 loopback/ULA/link-local, IPv4-mapped IPv6,
  `localhost`/`*.local`/`*.internal`/`metadata.google.internal`;
- every hostname is DNS-resolved before fetching and rejected if any
  address is internal — this blocks DNS rebinding;
- redirects are followed manually and re-validated per hop (a public URL
  cannot be bounced into an internal address);
- optional host allowlist via `GHOST_NODE_URL_ALLOWLIST`
  (comma-separated: `ghost.example.com`, `host:port`, `*.mesh.example.com`);
  when unset, all public hosts remain fetchable subject to the guards above;
- response caps: 64 KiB max body, JSON-only content type, 5 s timeout,
  max 3 redirects.

Errors map to `400` (malformed URL), `403` (`internal_url_blocked`,
`url_not_allowed`), or `502` (network/DNS/parse failures) with the stable
error code from `GhostFetchErrorCode` in the body.

The adapter does not send files or credentials to MuhanAI. It only stores the Agent Card and its last-seen timestamp. Task dispatch, AG-UI bridging, A2UI capability negotiation, and offline receipt synchronization should be added after the discovery path is deployed and authenticated.

## Security boundary

Keep Ghost file roots and credentials local. Before enabling task execution, add an allowlist for node URLs at the dispatch layer (the discovery allowlist above only gates Agent Card fetches), per-node capability policy, user approval for write/execute actions, and replay-safe task IDs. Capability claims in the Agent Card are self-declared — verify them through actual task execution (and `peer-mesh` reputation) before routing production traffic to a node.

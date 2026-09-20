# Ghost integration

MuhanAI registers [Ghost](https://github.com/ghostapp-ai/ghost) desktop/mobile nodes as local-first Agent Mesh workers.

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

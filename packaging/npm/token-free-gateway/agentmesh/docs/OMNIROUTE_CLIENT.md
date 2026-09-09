# OmniRoute Client — Setup & Usage Guide

- **Package**: `@agentmesh/personal-mcp`
- **Upstream**: [diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute) v3.8.51 (MIT)
- **Client file**: `packages/personal-mcp/src/omniroute-mcp-client.ts`
- **Analysis**: [`docs/OMNIROUTE_INTEGRATION.md`](./OMNIROUTE_INTEGRATION.md)

## What is OmniRoute?

OmniRoute is an open-source LLM routing mesh. One MCP endpoint, 356 providers, 1,312+
models, OpenAI-compatible API, plus quota-aware auto fallback across 16+ free-tier pools
(~1.47B tokens/month aggregated). Native MCP server exposes 30+ tools via `@modelcontextprotocol/sdk`.

MuhanAI embeds OmniRoute as a subprocess over the **stdio MCP transport** — same pattern
as Hound. The dependency is isolated; we never import OmniRoute's source.

## What MuhanAI exposes

Six curated tools — the ones agents actually use day-to-day. The full 30+ tool surface is
reachable indirectly via `omniroute_completion` (which routes to any provider/model).

| Tool id | MCP upstream | Purpose |
|---------|--------------|---------|
| `omniroute_completion` | `omniroute_route_request` | Chat completion with intelligent routing (or `auto` mode) |
| `omniroute_list_models` | `omniroute_list_models_catalog` | Browse 1,312+ models with capability filters |
| `omniroute_check_quota` | `omniroute_check_quota` | Remaining free-tier quota per provider |
| `omniroute_web_search` | `omniroute_web_search` | Multi-provider search (Serper, Brave, Perplexity, Exa, Tavily) |
| `omniroute_web_fetch` | `omniroute_web_fetch` | URL extraction (Firecrawl, Jina Reader, Tavily, ...) |
| `omniroute_get_health` | `omniroute_get_health` | Server uptime, circuit breakers, rate limits, cache hit rate |

When the OmniRoute binary is missing, every tool returns `{ ..., fallback: "omniroute_unavailable" }` —
agents never crash because of an optional integration.

## Install

```bash
# Global install (recommended for stdio spawn)
npm install -g omniroute
# Or use the bundled MCP server entry directly
npm install -g @modelcontextprotocol/server-omniroute  # if/when published

# Verify the binary is on PATH
which omniroute-mcp-server
omniroute-mcp-server --help
```

OmniRoute itself needs its own configuration (provider API keys, combos, routing
strategies). See its [setup docs](https://omniroute.online). The MCP server reuses
that config.

## Configure

Copy the relevant block from `.env.example`:

```bash
# Default: spawn `omniroute-mcp-server` on first call, with no extra args.
OMNIROUTE_COMMAND=omniroute-mcp-server
OMNIROUTE_ARGS=
OMNIROUTE_DISABLED=

# Optional: forward your OmniRoute API key so the upstream MCP can authenticate
# to gated provider pools.
OMNIROUTE_API_KEY=

# To disable entirely (e.g. when running offline):
OMNIROUTE_DISABLED=1
```

## Use from an agent

```ts
import { executePersonalTool } from "@agentmesh/personal-mcp/tools";

// Auto-routed completion — OmniRoute picks the best available provider/model.
const result = await executePersonalTool(userId, "omnirouteCompletion", {
  model: "auto",
  messages: [
    { role: "system", content: "You are a precise code reviewer." },
    { role: "user", content: "Review this PR diff: ..." },
  ],
  combo: "best-quality",     // optional: pin to a configured combo
  budget: 0.05,              // optional: max dollars for this request
  role: "coding",            // optional: routing role hint
});

// Specific model with known id
await executePersonalTool(userId, "omnirouteCompletion", {
  model: "claude-opus-4",
  messages: [{ role: "user", content: "..." }],
});

// Check remaining free-tier quota before committing to a free provider
await executePersonalTool(userId, "omnirouteCheckQuota", { provider: "groq" });

// Search via OmniRoute's gateway (5+ providers, automatic failover)
await executePersonalTool(userId, "omnirouteWebSearch", {
  query: "MuhanAI agent mesh architecture",
  maxResults: 5,
});

// Fetch a URL with markdown extraction
await executePersonalTool(userId, "omnirouteWebFetch", {
  url: "https://github.com/diegosouzapw/OmniRoute",
  format: "markdown",
});

// Inspect server health (uptime, circuit breakers, rate limits, cache)
await executePersonalTool(userId, "omnirouteGetHealth", {});
```

## Architecture

```
agent request
    │
    ▼
PERSONAL_MCP_TOOLS dispatcher (tools.ts)
    │
    ▼
OmniRouteMcpClient (omniroute-mcp-client.ts)
    │ spawns lazily on first call, reuses singleton
    ▼
stdio JSON-RPC 2.0 over child_process
    │
    ▼
omniroute-mcp-server subprocess
    │ @modelcontextprotocol/sdk v1.30+, StdioServerTransport
    ▼
OmniRoute internal APIs (/v1/chat/completions, /v1/search, /v1/web/fetch, ...)
    │
    ▼
356 upstream providers + quota-aware fallback
```

The client speaks newline-delimited JSON-RPC. It performs the standard MCP handshake
(`initialize` + `notifications/initialized`) on first call, then issues `tools/call`
requests with a per-request timeout (default 30 s). When the binary is missing, every
public method either returns a `*_unavailable` fallback or throws `OmniRouteUnavailableError`.

## Environment variables

| Var | Default | Purpose |
|-----|---------|---------|
| `OMNIROUTE_COMMAND` | `omniroute-mcp-server` | Executable to spawn. Override with absolute path or custom launcher. |
| `OMNIROUTE_ARGS` | `""` | Whitespace-separated args passed before MCP framing. |
| `OMNIROUTE_DISABLED` | unset | Truthy (`1`, `true`, anything non-empty/non-`false`/`0`) disables the integration entirely. |
| `OMNIROUTE_API_KEY` | unset | Forwarded to the spawned subprocess as an env var (consumed by OmniRoute's own auth). |

## Testing

```bash
cd packages/personal-mcp
pnpm test                              # 28 tests total (12 new OmniRoute + Hound + WeKnora)
pnpm test -- omniroute-mcp-client      # OmniRoute-only
```

The test suite uses an in-process `FakeSpawn` (EventEmitter-backed) to simulate the
OmniRoute subprocess without actually spawning it — every test runs in <50 ms.

## Risks & mitigations

- **Large dependency surface** — next 16, react 19, ~80 deps. **Mitigation**: we embed
  OmniRoute only as a stdio subprocess. MuhanAI never imports its source.
- **`node-gyp` native build** — `src/mitm/tproxy/native/`. **Mitigation**: we only
  invoke the MCP server entry, not the native MITM modules.
- **License collision risk** — both MuhanAI and OmniRoute are MIT. No issue, but keep
  attribution in commit messages and release notes.
- **Naming collision** — OmniRoute's README mentions `MiniMax` as a provider id. Do not
  confuse with our own AI model codename. See `docs/OMNIROUTE_INTEGRATION.md` §2.3.

## Related

- `docs/OMNIROUTE_INTEGRATION.md` — integration value analysis, 4 scenarios, license
- `docs/WEKNORA_INTEGRATION.md` — sibling integration (REST/SSE pattern, no stdio)
- Hound client — same pattern, keyless web research

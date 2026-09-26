// Stage GHOST-INTEGRATION.md as HEAD + ONLY my outbound-discovery section.
// The "Task dispatch (gated execution)" section in the worktree belongs to
// other uncommitted work and must not be part of this commit.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const repo = "/Users/brianyeon/token-free-gateway.worktrees/muhanai-com-bug-fix-investigation";
const file = "packaging/npm/token-free-gateway/agentmesh/docs/GHOST-INTEGRATION.md";

const head = execSync(`git -C ${repo} show HEAD:${file}`, { encoding: "utf8" });
const anchor = "## Current scope";
const at = head.indexOf(anchor);
if (at < 0) {
	console.error("FAIL: anchor not found");
	process.exit(1);
}

const section = `## Publishing MuhanAI as a discoverable agent

Ghost discovers remote agents by fetching \`/.well-known/agent.json\` from a base URL. MuhanAI serves that document so any A2A-protocol client can find it:

\`\`\`bash
curl https://muhanai.com/.well-known/agent.json
\`\`\`

\`\`\`json
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
\`\`\`

Served from **two places**, because \`muhanai.com\` is fronted by a Cloudflare Worker:

| Surface | File | Why |
|---|---|---|
| Cloudflare Worker | \`deploy/mcp-server.ts\` (\`handleMcpRequest\`) | The Worker answers \`/.well-known/*\` itself, so this is the path that actually responds in production. Without it the request falls through to the SPA handler and redirects. |
| Origin API | \`services/api/src/mcp-routes.ts\` | Serves the same card directly from the Fastify server. |

\`/.well-known/agent.json\` is listed in \`PUBLIC_PATH_EXACT\` (\`services/api/src/server.ts\`) so discovery works **before** authentication — a discovery document is useless if it requires the credential you are trying to find.

### Capability vocabulary

The \`capabilities\` values are the fixed set the Ghost client's \`parseGhostAgentCard\` accepts (\`packages/ghost-adapter/src/index.ts\`):

\`\`\`
local_file_search | local_code_analysis | offline_inference | desktop_automation
\`\`\`

Any value outside that set is **silently dropped** by the client's filter, so keep new entries in sync with \`GhostCapability\` or they will never be visible to a Ghost install. \`skills\` is free-form \`{id, name, description?}\`; malformed rows are dropped rather than failing the whole card, since an unknown skill must never make an otherwise discoverable agent un-registrable.

### Verifying the outbound card

\`deploy/verify-ghost-discovery.mts\` exercises the real client code path against the live endpoint — SSRF guard, fetch, \`parseGhostAgentCard\`, and registry registration — rather than re-implementing the contract:

\`\`\`bash
cd packaging/npm/token-free-gateway/agentmesh
bun run deploy/verify-ghost-discovery.mts
# override the target: GHOST_DISCOVERY_TARGET=https://staging.muhanai.com bun run ...
\`\`\`

A passing run prints the parsed card, the accepted capabilities, the parsed skills, and \`registered ["muhanai.com"]\`.

`;

let staged = head.slice(0, at) + section + head.slice(at);

// Add the two-direction preamble at the top.
const oldIntro =
	"MuhanAI registers [Ghost](https://github.com/ghostapp-ai/ghost) desktop/mobile nodes as local-first Agent Mesh workers.";
const newIntro = `[Ghost](https://github.com/ghostapp-ai/ghost) desktop/mobile nodes and MuhanAI integrate in **both directions**:

1. **Inbound** — MuhanAI registers Ghost nodes as local-first Agent Mesh workers (discovery, verification, gated dispatch). See *Current scope* below.
2. **Outbound** — MuhanAI publishes its own Agent Card so a Ghost install can discover and bind it as a remote agent. See *Publishing MuhanAI as a discoverable agent* below.`;
if (!staged.includes(oldIntro)) {
	console.error("FAIL: intro line not found");
	process.exit(1);
}
staged = staged.replace(oldIntro, newIntro);

if (staged.includes("Task dispatch (gated execution)")) {
	console.error("FAIL: other work leaked in");
	process.exit(1);
}

writeFileSync("/tmp/ghost-docs.staged.md", staged);
console.log("built:", staged.split("\n").length, "lines (HEAD", head.split("\n").length + ")");

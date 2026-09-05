# Agent 4: MCP Server + Browser Extension + Tool Discovery

**Status:** Ready for external agent execution
**Depends on:** `packages/core/src/types/contracts.ts` (stable)
**Working dir:** `/tmp/muhanai-remote` — `git pull origin main` first

---

## 1. Goal

Implement: (1) MCP Server via SDK, (2) Tool Registry, (3) Browser Extension (Chrome MV3).

## 2. Contracts (from `@agentmesh/core`)

```ts
import type { ToolRegistry, ToolDiscovery, McpTool, McpServerConfig, AIBridge } from "@agentmesh/core";
```

**Full contract:** `packages/core/src/types/contracts.ts` (L178-203)

## 3. File Structure

```
packages/mcp/
├── package.json                 ← add @modelcontextprotocol/sdk dep
├── tsconfig.json                ← extends ../../tsconfig.base.json
└── src/
    ├── index.ts                 ← re-exports
    ├── mcp-server.ts            ← MCP server (SDK-based)
    ├── tool-registry.ts         ← ToolRegistry implementation
    ├── tool-discovery.ts        ← scan providers for tools
    └── mcp-server.test.ts       ← tests (3+ tests)

apps/extension/src/
├── background.js                ← service worker: connect to MuhanAI API
├── popup.html / popup.js
├── options.html/options.js
└── content/
    ├── chatgpt.js               ← extract Q/A from chatgpt.com
    ├── claude.js                ← extract Q/A from claude.ai
    └── gemini.js                ← extract Q/A from gemini.google.com
```

## 4. Implementation Steps

### Step 1: Setup

```bash
cd /tmp/muhanai-remote && git pull origin main
pnpm add -F @agentmesh/mcp @modelcontextprotocol/sdk
```

`packages/mcp/package.json`:
```json
{
  "name": "@agentmesh/mcp", "version": "0.1.0", "type": "module",
  "main": "src/index.ts", "types": "src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "dependencies": { "@agentmesh/core": "workspace:*", "@modelcontextprotocol/sdk": "^1.0.0" }
}
```

### Step 2: Tool Registry (`packages/mcp/src/tool-registry.ts`)

```ts
import type { ToolRegistry, McpTool } from "@agentmesh/core";
export class InMemoryToolRegistry implements ToolRegistry {
  private tools = new Map<string, McpTool>();
  async register(tool: McpTool): Promise<void> { this.tools.set(tool.name, tool); }
  async unregister(toolName: string): Promise<void> { this.tools.delete(toolName); }
  async execute(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new Error(`Tool not found: ${toolName}`);
    return { status: "ok", tool: toolName, input };
  }
  async list(): Promise<McpTool[]> { return Array.from(this.tools.values()); }
  async discover(): Promise<McpTool[]> { return this.list(); }
}
export function createToolRegistry(): InMemoryToolRegistry { return new InMemoryToolRegistry(); }
```

### Step 3: Tool Discovery (`packages/mcp/src/tool-discovery.ts`)

```ts
import type { ToolDiscovery, McpTool } from "@agentmesh/core";
export class HttpToolDiscovery implements ToolDiscovery {
  async scan(): Promise<McpTool[]> {
    return [
      { name: "web-search", description: "Search the web", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
      { name: "code-run", description: "Execute code", inputSchema: { type: "object", properties: { code: { type: "string" } } } },
    ];
  }
  async scanProvider(providerId: string): Promise<McpTool[]> { return []; }
  async scanMcpServer(serverUrl: string): Promise<McpTool[]> { return []; }
}
```

### Step 4: MCP Server (`packages/mcp/src/mcp-server.ts`)

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServerConfig } from "@agentmesh/core";
import { InMemoryToolRegistry } from "./tool-registry.js";
export class MuhanAIServer {
  private server: Server;
  private registry: InMemoryToolRegistry;
  constructor(config: McpServerConfig) {
    this.server = new Server({ name: config.name, version: config.version }, { capabilities: { tools: {} } });
    this.registry = new InMemoryToolRegistry();
    for (const tool of config.tools) { void this.registry.register(tool); }
    this.setupHandlers();
  }
  private setupHandlers(): void {
    this.server.setRequestHandler("tools/list", async () => ({ tools: await this.registry.list() }));
    this.server.setRequestHandler("tools/call", async (req) => ({
      content: [{ type: "text", text: JSON.stringify(await this.registry.execute(req.params.name, req.params.arguments ?? {})) }],
    }));
  }
  async start(): Promise<void> { await this.server.connect(new StdioServerTransport()); }
}
```

### Step 5: Index (`packages/mcp/src/index.ts`)

```ts
export { InMemoryToolRegistry, createToolRegistry } from "./tool-registry.js";
export { HttpToolDiscovery } from "./tool-discovery.js";
export { MuhanAIServer } from "./mcp-server.js";
```

### Step 6: Tests (`packages/mcp/src/mcp-server.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { InMemoryToolRegistry } from "./tool-registry.js";
describe("ToolRegistry", () => {
  it("registers and lists tools", async () => {
    const reg = new InMemoryToolRegistry();
    await reg.register({ name: "test", inputSchema: {} });
    expect(await reg.list()).toHaveLength(1);
  });
  it("executes a tool", async () => {
    const reg = new InMemoryToolRegistry();
    await reg.register({ name: "echo", inputSchema: {} });
    expect(await reg.execute("echo", { msg: "hi" })).toMatchObject({ tool: "echo" });
  });
  it("rejects unknown tool", async () => {
    const reg = new InMemoryToolRegistry();
    await expect(reg.execute("nope", {})).rejects.toThrow("Tool not found");
  });
});
```

### Step 7: Wire Extension Content Scripts

`apps/extension/src/content/chatgpt.js`:
```js
function extractChatGPT() {
  const messages = document.querySelectorAll("[data-message-author-role]");
  const pairs = []; let lastUser = null;
  for (const msg of messages) {
    const role = msg.getAttribute("data-message-author-role");
    const text = msg.innerText?.trim();
    if (!text) continue;
    if (role === "user") lastUser = text;
    else if (role === "assistant" && lastUser) { pairs.push({ question: lastUser, answer: text, provider: "chatgpt" }); lastUser = null; }
  }
  return pairs;
}
chrome.runtime.onMessage?.addListener((msg, _s, sendResponse) => {
  if (msg.type === "EXTRACT") sendResponse(extractChatGPT());
});
```
Adapt same pattern for `claude.js` (claude.ai) and `gemini.js` (gemini.google.com).

### Step 8: Wire Extension Background (`apps/extension/src/background.js`)

```js
const MUHANAI_BASE = "http://localhost:3001";
chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
  if (msg.type === "IMPORT_TO_MUHANAI") {
    fetch(`${MUHANAI_BASE}/api/ai/import`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(msg.payload),
    }).then((r) => r.json()).then((d) => sendResponse({ ok: true, data: d })).catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});
```

### Step 9: Integrate server.ts

In `services/api/src/server.ts`, add:
```ts
import { createToolRegistry } from "@agentmesh/mcp";
const toolRegistry = createToolRegistry();
app.get("/api/mcp/tools", async () => toolRegistry.list());
app.post("/api/mcp/execute", async (request, reply) => {
  const { name, input } = request.body as { name: string; input: Record<string, unknown> };
  try { return reply.code(200).send(await toolRegistry.execute(name, input)); }
  catch (e) { return reply.code(400).send({ error: (e as Error).message }); }
});
```

---

## 5. Security (MUST follow)

| Rule | Why |
|------|-----|
| Extension NEVER reads `document.cookie` | Prevent session theft |
| Extension NEVER sends auth tokens to MuhanAI | Tokens stay in browser |
| Only user-initiated import (button click) | No silent data collection |
| Content scripts run ISOLATED world | Can't access page JS directly |
| `POST /api/ai/import` validates `provider` whitelist | Prevent spam |

## 6. Reference: reverse-skill adapter pattern

From `zhaoxuya520/reverse-skill` (MIT) — `plugins/reverse-skill/`:
- Client adapter pattern: one interface, multiple client implementations
- We adapt: `ChatGPTAdapter`, `ClaudeAdapter`, `GeminiAdapter` as content scripts
- We do NOT adapt: any security research / pentest tooling

## 7. Gate (must pass)

```bash
cd /tmp/muhanai-remote
pnpm install
pnpm typecheck          # no errors
pnpm test               # 31+ tests pass (8 new from mcp)
pnpm build              # packages compile
```

## 8. Do NOT Modify

| Path | Owner |
|------|-------|
| `packages/knowledge/`, `packages/evaluator/` | Agent 1 |
| `packages/token-bank/`, `packages/human/` | Agent 2 |
| `packages/p2p/` | Agent 3 |
| `services/api/src/server.ts` | Add only `/api/mcp/*` routes |
| `packages/core/src/types/contracts.ts` | Frozen |

## 9. Deliverables

- [ ] `packages/mcp/src/` — 4 files (index, tool-registry, tool-discovery, mcp-server)
- [ ] `packages/mcp/src/mcp-server.test.ts` — 3+ tests
- [ ] `apps/extension/src/content/{chatgpt,claude,gemini}.js` — wired
- [ ] `apps/extension/src/background.js` — API bridge
- [ ] `services/api/src/server.ts` — `/api/mcp/*` routes added
- [ ] Gate passes: typecheck + test + build

When done: commit, push to `origin main`, report back.
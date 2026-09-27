# LystBot Integration

## What LystBot is

LystBot ([TourAround/LystBot](https://github.com/TourAround/LystBot)) is an AI-agent
smart list and reminder app. It ships a REST API, an MCP server, and a CLI
(`npx lystbot`). It has **no model, no inference runtime, and no P2P layer**.

## What it is not

LystBot must not be registered as an XLang peer. Doing so would publish it under
`/api/xlang/peers`, render it in the XLang Peers dashboard, and make users issue
XLang RPC calls that LystBot cannot answer.

Integration surface: the MCP marketplace / `ToolRegistry`.

## Implemented

`packages/mcp/src/lystbot-tool.ts` provides:

- `buildLystBotTools(call?)` — five MCP tool definitions plus per-tool executors.
  When `call` is omitted, executing a tool throws rather than silently succeeding.
- `createLystBotRestCall({ baseUrl, token?, fetcher?, timeoutMs? })` — REST transport
  that maps read tools (`lystbot_list_get`, `lystbot_search`) to `GET` and write
  tools to `POST`, attaches `Authorization: Bearer`, and applies a timeout.

Exported from `@agentmesh/mcp`.

## Tool surface

| Tool                      | Purpose                                       |
| ------------------------- | --------------------------------------------- |
| `lystbot_list_create`     | Create a shopping/todo/custom list            |
| `lystbot_list_add_item`   | Add an item to a list                         |
| `lystbot_list_get`        | Read a list and its items                     |
| `lystbot_reminder_create` | Create a reminder, optionally bound to a list |
| `lystbot_search`          | Search lists and reminders                    |

## Wiring

```ts
import {
  buildLystBotTools,
  createLystBotRestCall,
  createToolRegistry,
} from "@agentmesh/mcp";

const registry = createToolRegistry();
const call = createLystBotRestCall({
  baseUrl: process.env.LYSTBOT_URL!,
  token: process.env.LYSTBOT_TOKEN,
});
const { tools, handlers } = buildLystBotTools(call);

for (const tool of tools) {
  await registry.register(tool, handlers.get(tool.name));
}
```

Then Bitterbot can service requests such as "add milk to the shopping list" through
the normal MCP tool flow.

## Verification

- `packages/mcp/src/lystbot-tool.test.ts` — 5 tests covering the tool set, the
  missing-transport error, call delegation, HTTP method/auth mapping, and error
  propagation.
- `pnpm --dir packages/mcp typecheck` passes.
- Combined targeted suite: 5 files, 18 tests passing.

## Remaining before production

- Confirm LystBot's real REST paths and payload shapes; `createLystBotRestCall`
  currently assumes `/list_create`, `/list_add_item`, `/reminder_create`,
  `/lists/:id`, and `/search?q=`. Adjust to the deployed API.
- Prefer LystBot's own MCP server over REST when both are available; the adapter
  only needs a different `call` implementation.
- Keep `LYSTBOT_TOKEN` server-side. Do not bundle it into the Vite client build.

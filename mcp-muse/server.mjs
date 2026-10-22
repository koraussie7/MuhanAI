// mcp-muse/server.mjs — minimal MCP stdio server exposing muse_exec (zero deps)
import { spawnSync } from "node:child_process";

const INFO = { name: "mcp-muse", version: "0.1.0" };

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}
function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) handle(line);
  }
});

function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === "initialize") {
    respond(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: INFO });
  } else if (method === "notifications/initialized") {
    return; // ack, no response
  } else if (method === "tools/list") {
    respond(id, {
      tools: [{
        name: "muse_exec",
        description: "Run a coding/build/test/investigation task with Muse Code headless. Returns stdout. Never ask it to call back into the caller.",
        inputSchema: {
          type: "object",
          properties: { prompt: { type: "string", description: "One self-contained task" } },
          required: ["prompt"],
        },
      }],
    });
  } else if (method === "tools/call") {
    const prompt = params?.arguments?.prompt;
    if (!prompt || typeof prompt !== "string") return fail(id, -32602, "need arguments.prompt");
    const r = spawnSync("/Users/brianyeon/.local/bin/muse", ["exec", prompt], { encoding: "utf8", timeout: 280000 });
    respond(id, { content: [{ type: "text", text: (r.stdout || "") + (r.stderr ? `\n[stderr]\n${r.stderr}` : "") }] });
  } else {
    fail(id, -32601, `unknown method ${method}`);
  }
}

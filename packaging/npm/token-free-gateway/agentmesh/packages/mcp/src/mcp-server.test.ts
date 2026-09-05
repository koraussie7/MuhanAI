import { describe, it, expect } from "vitest";
import { InMemoryToolRegistry, createToolRegistry } from "./tool-registry.js";
import { HttpToolDiscovery } from "./tool-discovery.js";
import { createMuhanAIServer } from "./mcp-server.js";

describe("ToolRegistry", () => {
  it("registers and lists tools", async () => {
    const reg = new InMemoryToolRegistry();
    await reg.register({ name: "test", inputSchema: {} });
    expect(await reg.list()).toHaveLength(1);
  });

  it("executes a tool", async () => {
    const reg = createToolRegistry();
    await reg.register({ name: "echo", description: "echo", inputSchema: {} });
    expect(await reg.execute("echo", { msg: "hi" })).toMatchObject({
      tool: "echo",
      status: "ok",
    });
  });

  it("rejects unknown tool", async () => {
    const reg = new InMemoryToolRegistry();
    await expect(reg.execute("nope", {})).rejects.toThrow("Tool not found");
  });

  it("unregister removes tool", async () => {
    const reg = new InMemoryToolRegistry();
    await reg.register({ name: "tmp", inputSchema: {} });
    await reg.unregister("tmp");
    expect(await reg.list()).toHaveLength(0);
  });
});

describe("ToolDiscovery", () => {
  it("scan returns catalog tools", async () => {
    const d = new HttpToolDiscovery();
    const tools = await d.scan();
    expect(tools.length).toBeGreaterThanOrEqual(2);
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["web-search", "code-run"]),
    );
  });
});

describe("MuhanAIServer", () => {
  it("lists and calls tools via HTTP-facing API", async () => {
    const server = createMuhanAIServer({
      name: "test",
      version: "0.0.1",
      tools: [{ name: "ping", description: "ping", inputSchema: {} }],
    });
    const list = await server.listTools();
    expect(list.some((t) => t.name === "ping")).toBe(true);
    const result = await server.callTool("ping", {});
    expect(result).toMatchObject({ tool: "ping", status: "ok" });
  });
});

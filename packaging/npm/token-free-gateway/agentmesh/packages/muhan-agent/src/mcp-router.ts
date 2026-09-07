/**
 * MCP router — wires Personal MCP capabilities into the daemon's
 * SessionRunner. Each capability registered with the runner maps to
 * one Personal MCP tool call (e.g. `personal-knowledge.list` →
 * `mcp.callTool("knowledge", { ... })`).
 *
 * Why this lives in muhan-agent and not in @agentmesh/personal-mcp:
 *   - personal-mcp is the canonical MCP server (resource + tool surface).
 *   - muhan-agent owns the runtime that *runs* it. This file is the
 *     adapter that says "a session request for capability X → call
 *     MCP tool Y with these args."
 *
 * Phase 1 ships a small, fixed mapping. Phase 2 will let the runner
 * reflect over the PersonalMCP's tools list and auto-register.
 */

import type { PersonalMCP } from "@agentmesh/personal-mcp";
import type { SessionHandler, SessionRequest, SessionResponse } from "./session-runner.js";

/** Map session capability names to MCP tool invocations. */
export interface CapabilityMap {
  [capability: string]: {
    toolName: string;
    /** Optional arg adapter from session args → tool args. */
    adapt?: (args: Record<string, unknown>) => Record<string, unknown>;
  };
}

/** Default capability map — single user, single MCP instance. */
export function defaultCapabilityMap(): CapabilityMap {
  return {
    "personal-context": {
      toolName: "knowledge",
      adapt: (args) => ({ action: "list", userId: args.userId }),
    },
    "personal-snapshot": {
      toolName: "memory",
      adapt: (args) => ({ action: "snapshot", userId: args.userId }),
    },
  };
}

/**
 * AIHawk-compatible browser capability map.
 *
 * Tool names mirror Microsoft Playwright MCP / AIHawk so prompts written
 * for either client work against muhan-agent unchanged. Order reflects
 * the "ladder" in ADR-2 of the AIHawk server: prefer named tools with
 * selectors → coordinates from snapshot.at:[x,y] → screenshots →
 * read-only evaluate. Mutation via evaluate is rejected upstream by
 * the `isTrusted` guardrail — muhan-agent inherits that protection by
 * passing the call through verbatim.
 *
 * Refs:
 *   - https://github.com/feder-cr/AIHawk (server.py ADR ladder)
 *   - integration analysis: docs/agentmesh/AIHAWK-INTEGRATION.md
 */
export function browserCapabilityMap(): CapabilityMap {
  return {
    // Ladder rung 1 — named tools with selectors
    browser_navigate:      { toolName: "browser_navigate" },
    browser_click:         { toolName: "browser_click" },
    browser_type:          { toolName: "browser_type" },
    browser_select_option: { toolName: "browser_select_option" },
    browser_press_key:     { toolName: "browser_press_key" },
    // Ladder rung 2 — coordinates
    browser_click_at:      { toolName: "browser_click_at" },
    // Rung 2½ — perception (snapshot is needed before click_at)
    browser_snapshot:      { toolName: "browser_snapshot" },
    // Ladder rung 3 — eyes
    browser_take_screenshot: { toolName: "browser_take_screenshot" },
    // Ladder rung 4 — read-only evaluate (mutation rejected upstream)
    browser_evaluate:      { toolName: "browser_evaluate" },
  };
}

/**
 * Minimal adapter contract for an AIHawk-style browser MCP. muhan-agent
 * doesn't ship the browser engine (that lives in the sibling
 * `invisible_playwright` repo); it just plumbs the tool call through.
 *
 * Any object with a callable that takes (toolName, args) and returns a
 * Promise satisfies this — Phase 1 stubs it, Phase 2 wires the real
 * AIHawk MCP client (likely over `mcp.clientSession(...)`).
 */
export interface BrowserAdapter {
  callBrowserTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Build a SessionHandler that proxies to a PersonalMCP for a single
 * capability. Errors thrown by MCP are converted to SessionResponse.ok=false
 * so the runner can surface them without crashing the daemon.
 */
export function buildMcpHandler(opts: {
  mcp: PersonalMCP;
  capability: string;
}): SessionHandler {
  const capMap = defaultCapabilityMap();
  const mapping = capMap[opts.capability];
  if (!mapping) {
    throw new Error(`unknown MCP capability: ${opts.capability}`);
  }
  return async (req: SessionRequest): Promise<SessionResponse> => {
    try {
      const toolArgs = mapping.adapt
        ? mapping.adapt(req.args ?? {})
        : (req.args ?? {});
      const result = await opts.mcp.callTool(mapping.toolName, toolArgs);
      return { ok: true, correlationId: req.correlationId, result };
    } catch (err) {
      return {
        ok: false,
        correlationId: req.correlationId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/**
 * Build a SessionHandler that proxies to a BrowserAdapter for one
 * AIHawk-compatible browser capability. Same error normalization as
 * buildMcpHandler — daemon surface stays uniform across personal-MCP
 * and browser-MCP.
 */
export function buildBrowserHandler(opts: {
  browser: BrowserAdapter;
  capability: string;
}): SessionHandler {
  const capMap = browserCapabilityMap();
  const mapping = capMap[opts.capability];
  if (!mapping) {
    throw new Error(`unknown browser capability: ${opts.capability}`);
  }
  return async (req: SessionRequest): Promise<SessionResponse> => {
    try {
      const toolArgs = mapping.adapt
        ? mapping.adapt(req.args ?? {})
        : (req.args ?? {});
      const result = await opts.browser.callBrowserTool(mapping.toolName, toolArgs);
      return { ok: true, correlationId: req.correlationId, result };
    } catch (err) {
      return {
        ok: false,
        correlationId: req.correlationId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

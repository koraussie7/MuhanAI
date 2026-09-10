/**
 * MCP Router for Computer Use & Browser Use
 * 
 * Wires browser capabilities into the daemon's SessionRunner.
 * Tool names mirror Microsoft Playwright MCP / AIHawk for compatibility.
 */

import type { SessionHandler, SessionRequest, SessionResponse } from './session-runner.js';

/** Map session capability names to browser tool invocations. */
export interface CapabilityMap {
  [capability: string]: {
    toolName: string;
    adapt?: (args: Record<string, unknown>) => Record<string, unknown>;
  };
}

/**
 * AIHawk-compatible browser capability map.
 * Tool names mirror Microsoft Playwright MCP / AIHawk so prompts written
 * for either client work against muhan-agent unchanged.
 */
export function browserCapabilityMap(): CapabilityMap {
  return {
    // Ladder rung 1 — named tools with selectors
    browser_navigate: { toolName: 'browser_navigate' },
    browser_click: { toolName: 'browser_click' },
    browser_type: { toolName: 'browser_type' },
    browser_select_option: { toolName: 'browser_select_option' },
    browser_press_key: { toolName: 'browser_press_key' },
    // Ladder rung 2 — coordinates
    browser_click_at: { toolName: 'browser_click_at' },
    // Rung 2½ — perception
    browser_snapshot: { toolName: 'browser_snapshot' },
    // Ladder rung 3 — eyes
    browser_take_screenshot: { toolName: 'browser_take_screenshot' },
    // Ladder rung 4 — read-only evaluate
    browser_evaluate: { toolName: 'browser_evaluate' },
  };
}

/**
 * Minimal adapter contract for an AIHawk-style browser MCP.
 */
export interface BrowserAdapter {
  callBrowserTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Build a SessionHandler that proxies to a BrowserAdapter for one
 * AIHawk-compatible browser capability.
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
      const toolArgs = mapping.adapt ? mapping.adapt(req.args ?? {}) : (req.args ?? {});
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

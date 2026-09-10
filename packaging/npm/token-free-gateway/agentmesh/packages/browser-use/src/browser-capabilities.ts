/**
 * Browser Capability Map
 * 
 * AIHawk-compatible browser capability map.
 * Tool names mirror Microsoft Playwright MCP / AIHawk.
 */

export type BrowserCapability =
  | 'browser_navigate'
  | 'browser_click'
  | 'browser_type'
  | 'browser_select_option'
  | 'browser_press_key'
  | 'browser_click_at'
  | 'browser_snapshot'
  | 'browser_take_screenshot'
  | 'browser_evaluate';

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
 * 
 * Order follows the "ladder" in ADR-2 of the AIHawk server:
 * 1. Named tools with selectors
 * 2. Coordinates from snapshot
 * 3. Screenshots (eyes)
 * 4. Read-only evaluate
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

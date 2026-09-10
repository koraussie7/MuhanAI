/**
 * Browser Adapter Interface
 * 
 * Minimal adapter contract for browser automation.
 * Any object with a callable that takes (toolName, args) and returns a
 * Promise satisfies this.
 */

export interface BrowserAdapter {
  callBrowserTool(toolName: string, args: Record<string, unknown>): Promise<unknown>;
}

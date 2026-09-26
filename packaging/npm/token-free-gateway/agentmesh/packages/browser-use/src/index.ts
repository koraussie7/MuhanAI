/**
 * Browser Use Module for MuhanAI
 *
 * AIHawk-compatible browser automation capabilities:
 * - Browser profile management (identity, fingerprint, proxy)
 * - Playwright MCP-compatible tool surface
 * - Multi-browser support (Chromium, Firefox, WebKit)
 *
 * Integrates with:
 * - mission-control (browser profile UI)
 * - MoltMesh (distributed browser tasks)
 * - fauxnix (Windows compatibility)
 */

// Re-export types
export type { BrowserAdapter } from "./browser-adapter.js";
export { type BrowserCapability, browserCapabilityMap } from "./browser-capabilities.js";
export {
	type BrowserProfile,
	type BrowserProfileSettings,
	createBrowserProfileManager,
} from "./browser-profile.js";
export { type PlaywrightAdapterOptions, PlaywrightBrowserAdapter } from "./playwright-adapter.js";

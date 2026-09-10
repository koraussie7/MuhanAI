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

export { BrowserProfileManager, type BrowserProfile, type BrowserProfileSettings } from './browser-profile.js';
export { PlaywrightBrowserAdapter, type PlaywrightAdapterOptions } from './playwright-adapter.js';
export { browserCapabilityMap, type BrowserCapability } from './browser-capabilities.js';

// Re-export types
export type { BrowserAdapter } from './browser-adapter.js';

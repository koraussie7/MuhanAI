/**
 * MuhanAI endpoint constants injected into Happy builds via patch-package.
 *
 * These are the ONLY network endpoints the adapter introduces. Happy's
 * existing happy-server endpoint is replaced; all other upstream URLs
 * (analytics, telemetry) are routed to no-ops.
 *
 * NOTE: this is the SOURCE OF TRUTH. The patch in /patches/app.json.patch
 * must keep these values in sync. CI runs `npm run test:sync` to assert.
 */

export const MUHANAI_GATEWAY_URL = "https://api.muhanai.com" as const;
export const MUHANAI_WEBSOCKET_URL = "wss://ws.muhanai.com" as const;
export const MUHANAI_PUSH_URL = "https://push.muhanai.com" as const;

/** Default bundle id; renamed from `org.happy.happy` to `com.muhanai.client`. */
export const MUHANAI_BUNDLE_ID = "com.muhanai.client" as const;
export const MUHANAI_APP_NAME = "MuhanAI" as const;

/** Happy version this adapter is pinned to. Patch surface validated only against this tag. */
export const HAPPY_PINNED_VERSION = "1.2.3" as const;

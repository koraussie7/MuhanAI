import { describe, it, expect } from "vitest";

import {
  PATCHES,
  HAPPY_PATCH_VERSION,
  assertManifestValid,
  ADAPTER_METADATA,
} from "../patch-manifest.js";
import {
  MUHANAI_GATEWAY_URL,
  MUHANAI_WEBSOCKET_URL,
  MUHANAI_PUSH_URL,
  MUHANAI_BUNDLE_ID,
  MUHANAI_APP_NAME,
  HAPPY_PINNED_VERSION,
} from "../endpoints.js";

describe("endpoints — MuhanAI URLs", () => {
  it("gateway URL points to api.muhanai.com over HTTPS", () => {
    expect(MUHANAI_GATEWAY_URL).toBe("https://api.muhanai.com");
  });

  it("websocket URL is wss:// on the ws subdomain", () => {
    expect(MUHANAI_WEBSOCKET_URL).toBe("wss://ws.muhanai.com");
  });

  it("push URL is HTTPS on push subdomain", () => {
    expect(MUHANAI_PUSH_URL).toBe("https://push.muhanai.com");
  });

  it("Happy pinned version is 1.2.3 (matches the version the patch was validated against)", () => {
    expect(HAPPY_PINNED_VERSION).toBe("1.2.3");
  });
});

describe("endpoints — branding", () => {
  it("bundle id is com.muhanai.client (replaces org.happy.happy)", () => {
    expect(MUHANAI_BUNDLE_ID).toBe("com.muhanai.client");
  });

  it("app name is MuhanAI", () => {
    expect(MUHANAI_APP_NAME).toBe("MuhanAI");
  });
});

describe("patch-manifest — invariants", () => {
  it("has at least one patch", () => {
    expect(PATCHES.length).toBeGreaterThan(0);
  });

  it("every patch target ends with the expected extension (json/ts/tsx/js)", () => {
    for (const p of PATCHES) {
      expect(p.target).toMatch(/\.(config\.js|json|ts|tsx|js)$/);
    }
  });

  it("every patch file ends in .patch", () => {
    for (const p of PATCHES) {
      expect(p.patchFile.endsWith(".patch")).toBe(true);
    }
  });

  it("HAPPY_PATCH_VERSION is a positive integer", () => {
    expect(HAPPY_PATCH_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(HAPPY_PATCH_VERSION)).toBe(true);
  });

  it("assertManifestValid() does not throw on a valid manifest", () => {
    expect(() => assertManifestValid()).not.toThrow();
  });
});

describe("ADAPTER_METADATA — shape", () => {
  it("exposes happy version, patch version, and patch count", () => {
    expect(ADAPTER_METADATA).toMatchObject({
      happyVersion: HAPPY_PINNED_VERSION,
      patchVersion: HAPPY_PATCH_VERSION,
    });
    expect(ADAPTER_METADATA.patchCount).toBe(PATCHES.length);
  });
});

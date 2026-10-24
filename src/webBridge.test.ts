import { describe, expect, it, vi, beforeEach, beforeAll, afterAll } from "vitest";

// Capacitor 플러그인은 이 환경에서 불가하므로 모킹한다.
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => true),
  },
}));

/** Minimal localStorage + window shim — deterministic regardless of vitest env. */
class MemStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}

describe("webBridge (web fallback)", () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const prevStorage = g.localStorage;
  const prevWindow = g.window;

  beforeAll(() => {
    g.localStorage = new MemStorage();
    if (typeof g.window === "undefined") g.window = g; // getBridge reads window.muhan
  });

  afterAll(() => {
    g.localStorage = prevStorage;
    g.window = prevWindow;
  });

  beforeEach(() => {
    (g.localStorage as MemStorage).clear();
    const w = g.window as { muhan?: unknown };
    delete w.muhan;
  });

  it("getApiUrl returns default when unset, stored value when set", async () => {
    const { webBridge } = await import("./webBridge.js");
    expect(await webBridge.getApiUrl()).toBe("http://localhost:3001");
    localStorage.setItem("muhan:apiUrl", "https://api.example.com");
    expect(await webBridge.getApiUrl()).toBe("https://api.example.com");
  });

  it("setCreds/restoreCreds round-trip both credentials via localStorage on web", async () => {
    const { webBridge } = await import("./webBridge.js");
    expect(await webBridge.setCreds({ deviceToken: "tc_abc", adminKey: "adm-xyz" })).toBe(true);
    expect(await webBridge.restoreCreds()).toEqual({
      deviceToken: "tc_abc",
      adminKey: "adm-xyz",
    });
  });

  it("restoreCreds returns empty credentials when nothing stored", async () => {
    const { webBridge } = await import("./webBridge.js");
    expect(await webBridge.restoreCreds()).toEqual({ deviceToken: "", adminKey: "" });
  });

  it("restoreCreds tolerates a legacy single-token blob", async () => {
    const { webBridge } = await import("./webBridge.js");
    // Early builds stored a bare string; must not throw on upgrade.
    localStorage.setItem("muhan:creds", JSON.stringify({ token: "tc_legacy" }));
    expect(await webBridge.restoreCreds()).toEqual({ deviceToken: "", adminKey: "" });
  });

  it("restoreCreds returns empty credentials on corrupt JSON", async () => {
    const { webBridge } = await import("./webBridge.js");
    localStorage.setItem("muhan:creds", "{not json");
    expect(await webBridge.restoreCreds()).toEqual({ deviceToken: "", adminKey: "" });
  });

  it("clearCreds removes the stored blob", async () => {
    const { webBridge } = await import("./webBridge.js");
    await webBridge.setCreds({ deviceToken: "tc_abc", adminKey: "adm-xyz" });
    expect(await webBridge.clearCreds()).toBe(true);
    expect(await webBridge.restoreCreds()).toEqual({ deviceToken: "", adminKey: "" });
  });

  it("getBridge prefers Electron preload bridge when present", async () => {
    const { getBridge, webBridge } = await import("./webBridge.js");
    const fake = { getApiUrl: async () => "electron" } as unknown as NonNullable<
      Window["muhan"]
    >;
    window.muhan = fake;
    expect(getBridge()).toBe(fake);
    delete window.muhan;
    expect(getBridge()).toBe(webBridge);
  });
});

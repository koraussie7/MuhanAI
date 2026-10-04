import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemorySeedStore, downloadAndSeedModel, type ModelManifest } from "./model-seeding.js";

const data = new TextEncoder().encode("model-chunk");
const hash = createHash("sha256").update(data).digest("hex");
const manifest: ModelManifest = {
  modelId: "demo-model",
  version: "1.0.0",
  format: "gguf",
  sizeBytes: data.byteLength,
  chunks: [{ index: 0, cid: "cid-demo-0", sizeBytes: data.byteLength, sha256: hash, url: "https://example.invalid/chunk" }],
  license: "MIT",
};

describe("downloadAndSeedModel", () => {
  it("downloads, verifies, stores, and enables seeding", async () => {
    const store = createMemorySeedStore();
    const phases: string[] = [];
    const status = await downloadAndSeedModel({ manifest, store, fetchChunk: async () => data, onProgress: (p) => phases.push(p.phase) });
    expect(status).toMatchObject({ modelId: "demo-model", downloadedChunks: 1, totalChunks: 1, seeded: true });
    expect(phases).toEqual(["checking", "downloading", "verifying", "seeding", "complete"]);
    await expect(store.readChunk("cid-demo-0")).resolves.toEqual(data);
  });

  it("rejects a tampered chunk before storing it", async () => {
    const store = createMemorySeedStore();
    await expect(downloadAndSeedModel({ manifest, store, fetchChunk: async () => new Uint8Array([1, 2, 3]), retryAttempts: 0 })).rejects.toThrow("size mismatch");
    await expect(store.hasChunk("cid-demo-0")).resolves.toBe(false);
  });

  it("skips already cached chunks", async () => {
    const store = createMemorySeedStore();
    await store.writeChunk("cid-demo-0", data);
    const phases: string[] = [];
    const status = await downloadAndSeedModel({ manifest, store, fetchChunk: async () => { throw new Error("should not be called"); }, onProgress: (p) => phases.push(p.phase) });
    expect(status.downloadedChunks).toBe(1);
    expect(phases).toEqual(["checking", "seeding", "complete"]);
  });

  it("verifies license allow-list", async () => {
    const store = createMemorySeedStore();
    const badManifest = { ...manifest, license: "Proprietary" };
    await expect(downloadAndSeedModel({ manifest: badManifest, store, fetchChunk: async () => data })).rejects.toThrow("License");
  });

  it("requires user opt-in", async () => {
    const store = createMemorySeedStore();
    await expect(downloadAndSeedModel({ manifest, store, fetchChunk: async () => data, userOptIn: false })).rejects.toThrow("opt-in");
  });

  it("reports progress with download speed and cache hit rate", async () => {
    const store = createMemorySeedStore();
    const progress: any[] = [];
    const status = await downloadAndSeedModel({
      manifest,
      store,
      fetchChunk: async () => data,
      onProgress: (p) => progress.push(p)
    });
    const completeProgress = progress.find(p => p.phase === "complete");
    expect(completeProgress.downloadSpeedBps).toBeDefined();
    expect(completeProgress.cacheHitRate).toBeDefined();
  });
});
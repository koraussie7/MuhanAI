/** Cross-platform model download + P2P seeding contract.
 * Runtime adapters (Android, desktop, Raspberry Pi) can implement this interface
 * without coupling the mesh protocol to a specific filesystem or UI toolkit.
 */
export type SeedPlatform = "android" | "macos" | "windows" | "linux" | "raspberry-pi" | "unknown";

interface StorageManagerWithEstimate extends StorageManager {
  estimate(): Promise<StorageEstimate>;
}

interface NavigatorWithStorage extends Navigator {
  storage: StorageManagerWithEstimate;
}

export interface ModelChunk {
  index: number;
  cid: string;
  sizeBytes: number;
  sha256: string;
  url: string;
}

export interface ModelManifest {
  modelId: string;
  version: string;
  format: "gguf" | "safetensors" | "onnx" | "mlx" | "other";
  sizeBytes: number;
  chunks: ModelChunk[];
  license: string;
  signature?: string;
  publicKey?: string;
}

export interface ModelSeedStore {
  hasChunk(cid: string): Promise<boolean>;
  writeChunk(cid: string, data: Uint8Array): Promise<void>;
  readChunk(cid: string): Promise<Uint8Array>;
  markSeeded?(modelId: string, version: string): Promise<void>;
  getStorageUsage?(): Promise<number>;
  getStorageQuota?(): Promise<number>;
  close?(): Promise<void>;
}

export interface SeedStatus {
  modelId: string;
  version: string;
  platform: SeedPlatform;
  downloadedChunks: number;
  totalChunks: number;
  seeded: boolean;
  bytesUploaded: number;
  downloadSpeedBps?: number;
  cacheHitRate?: number;
  lastError?: string;
}

export interface SeedProgress extends SeedStatus {
  currentChunk?: number;
  phase: "checking" | "downloading" | "verifying" | "seeding" | "complete" | "error";
  error?: string;
}

export interface ModelSeedOptions {
  manifest: ModelManifest;
  store: ModelSeedStore;
  platform?: SeedPlatform;
  fetchChunk?: (chunk: ModelChunk, signal?: AbortSignal) => Promise<Uint8Array>;
  announceSeed?: (manifest: ModelManifest, store: ModelSeedStore) => Promise<void>;
  onProgress?: (progress: SeedProgress) => void;
  concurrency?: number;
  retryAttempts?: number;
  retryDelayMs?: number;
  verifySignature?: boolean;
  userOptIn?: boolean;
  licenseAllowList?: string[];
  signal?: AbortSignal;
}

export interface SeedRegistration {
  modelId: string;
  version: string;
  peerId: string;
  platform: SeedPlatform;
  chunks: string[];
  registeredAt: number;
  expiresAt?: number;
}

export interface ChunkServeAuth {
  peerId: string;
  modelId: string;
  version: string;
  chunkCids: string[];
  issuedAt: number;
  signature: string;
}

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

async function verifyManifestSignature(manifest: ModelManifest): Promise<boolean> {
  if (!manifest.signature || !manifest.publicKey) {
    return false;
  }
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify({
      modelId: manifest.modelId,
      version: manifest.version,
      sizeBytes: manifest.sizeBytes,
      chunks: manifest.chunks.map(c => ({ cid: c.cid, sha256: c.sha256 })),
      license: manifest.license,
    }));
    const publicKey = await crypto.subtle.importKey(
      "spki",
      base64ToArrayBuffer(manifest.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
    const signature = base64ToArrayBuffer(manifest.signature);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, signature, data);
  } catch {
    return false;
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function isLicenseAllowed(license: string, allowList: string[]): boolean {
  return allowList.some(allowed => license.toLowerCase().includes(allowed.toLowerCase()));
}

export async function downloadAndSeedModel(options: ModelSeedOptions): Promise<SeedStatus> {
  const { manifest, store, onProgress, signal } = options;
  const platform = options.platform ?? detectSeedPlatform();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const retryAttempts = options.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  if (options.verifySignature !== false) {
    const valid = await verifyManifestSignature(manifest);
    if (!valid && manifest.signature) {
      throw new Error("Manifest signature verification failed");
    }
  }

  const licenseAllowList = options.licenseAllowList ?? ["mit", "apache-2.0", "bsd-3-clause", "bsd-2-clause", "isc"];
  if (!isLicenseAllowed(manifest.license, licenseAllowList)) {
    throw new Error(`License "${manifest.license}" not in allow list`);
  }

  if (options.userOptIn === false) {
    throw new Error("User opt-in required for seeding");
  }

  let downloadedChunks = 0;
  let bytesUploaded = 0;
  let totalDownloadedBytes = 0;
  const downloadStartTimes = new Map<number, number>();
  let cacheHits = 0;

  const report = (phase: SeedProgress["phase"], extra: Partial<SeedProgress> = {}) => {
    const speed = downloadedChunks > 0 ? totalDownloadedBytes / ((Date.now() - Math.min(...downloadStartTimes.values())) / 1000) : 0;
    const hitRate = manifest.chunks.length > 0 ? cacheHits / manifest.chunks.length : 0;
    onProgress?.({
      modelId: manifest.modelId,
      version: manifest.version,
      platform,
      downloadedChunks,
      totalChunks: manifest.chunks.length,
      seeded: false,
      bytesUploaded,
      downloadSpeedBps: speed,
      cacheHitRate: hitRate,
      phase,
      ...extra
    });
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const downloadChunk = async (chunk: ModelChunk): Promise<Uint8Array> => {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      if (signal?.aborted) throw new Error("Aborted");
      try {
        downloadStartTimes.set(chunk.index, Date.now());
        const data = await (options.fetchChunk ?? fetchModelChunk)(chunk, signal);
        if (data.byteLength !== chunk.sizeBytes) throw new Error(`Chunk ${chunk.index} size mismatch`);
        if (await sha256Hex(data) !== chunk.sha256.toLowerCase()) throw new Error(`Chunk ${chunk.index} hash mismatch`);
        return data;
      } catch (e) {
        lastError = e as Error;
        if (attempt < retryAttempts) await sleep(retryDelayMs * (attempt + 1));
      }
    }
    throw lastError;
  };

  report("checking");

  const semaphore = new Semaphore(concurrency);
  const results = await Promise.allSettled(manifest.chunks.map(async (chunk) => {
    await semaphore.acquire();
    try {
      if (signal?.aborted) throw new Error("Aborted");
      if (await store.hasChunk(chunk.cid)) {
        cacheHits++;
        downloadedChunks++;
        return;
      }
      report("downloading", { currentChunk: chunk.index });
      const data = await downloadChunk(chunk);
      report("verifying", { currentChunk: chunk.index });
      await store.writeChunk(chunk.cid, data);
      totalDownloadedBytes += data.byteLength;
      downloadedChunks++;
    } finally {
      semaphore.release();
    }
  }));

  for (const result of results) {
    if (result.status === "rejected") {
      report("error", { error: result.reason?.message });
      throw result.reason;
    }
  }

  if (signal?.aborted) throw new Error("Aborted");

  const quota = await store.getStorageQuota?.();
  const usage = await store.getStorageUsage?.();
  if (quota && usage && usage > quota) {
    throw new Error(`Storage quota exceeded: ${usage}/${quota} bytes`);
  }

  report("seeding");
  await store.markSeeded?.(manifest.modelId, manifest.version);
  await options.announceSeed?.(manifest, store);

  const status: SeedStatus = {
    modelId: manifest.modelId,
    version: manifest.version,
    platform,
    downloadedChunks,
    totalChunks: manifest.chunks.length,
    seeded: true,
    bytesUploaded,
    downloadSpeedBps: totalDownloadedBytes / ((Date.now() - Math.min(...downloadStartTimes.values())) / 1000),
    cacheHitRate: manifest.chunks.length > 0 ? cacheHits / manifest.chunks.length : 0,
  };
  onProgress?.({ ...status, phase: "complete" });
  return status;
}

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => this.waiters.push(resolve));
  }

  release(): void {
    if (this.waiters.length > 0) {
      const next = this.waiters.shift()!;
      next();
    } else {
      this.permits++;
    }
  }
}

async function fetchModelChunk(chunk: ModelChunk, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(chunk.url, { signal });
  if (!response.ok) throw new Error(`Chunk download failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("SHA-256 Web Crypto is unavailable");
}

export function detectSeedPlatform(): SeedPlatform {
  const value = typeof navigator === "undefined" ? "" : `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (value.includes("android")) return "android";
  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  if (value.includes("linux") && (value.includes("arm") || value.includes("aarch"))) return "raspberry-pi";
  if (value.includes("linux")) return "linux";
  return "unknown";
}

export function createMemorySeedStore(): ModelSeedStore {
  const chunks = new Map<string, Uint8Array>();
  let storageUsage = 0;
  return {
    hasChunk: async (cid) => chunks.has(cid),
    writeChunk: async (cid, data) => {
      chunks.set(cid, data.slice());
      storageUsage += data.byteLength;
    },
    readChunk: async (cid) => {
      const data = chunks.get(cid);
      if (!data) throw new Error(`Unknown chunk: ${cid}`);
      return data.slice();
    },
    markSeeded: async () => {},
    getStorageUsage: async () => storageUsage,
    getStorageQuota: async () => 1024 * 1024 * 1024,
  };
}

export async function createIndexedDBSeedStore(dbName = "agentmesh-seeds", storeName = "chunks"): Promise<ModelSeedStore> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "cid" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  let storageUsage = 0;
  return {
    hasChunk: async (cid) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(cid);
        req.onsuccess = () => resolve(!!req.result);
        req.onerror = () => reject(req.error);
      });
    },
    writeChunk: async (cid, data) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const req = tx.objectStore(storeName).put({ cid, data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
        req.onsuccess = () => {
          storageUsage += data.byteLength;
          resolve();
        };
        req.onerror = () => reject(req.error);
      });
    },
    readChunk: async (cid) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(cid);
        req.onsuccess = () => {
          if (!req.result) reject(new Error(`Unknown chunk: ${cid}`));
          else resolve(new Uint8Array(req.result.data));
        };
        req.onerror = () => reject(req.error);
      });
    },
    markSeeded: async () => {},
    getStorageUsage: async () => storageUsage,
    getStorageQuota: async () => {
      const estimate = (navigator as { storage?: { estimate?: () => Promise<{ quota?: number }> } }).storage?.estimate;
      if (estimate) {
        const est = await estimate();
        return est.quota ?? 1024 * 1024 * 1024;
      }
      return 1024 * 1024 * 1024;
    },
    close: async () => db.close(),
  };
}

export async function createFileSystemSeedStore(rootDir: string): Promise<ModelSeedStore> {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
  await fs.mkdir(rootDir, { recursive: true });

  let storageUsage = 0;
  const getChunkPath = (cid: string) => path.join(rootDir, `${cid}.chunk`);

  return {
    hasChunk: async (cid) => {
      try { await fs.access(getChunkPath(cid)); return true; } catch { return false; }
    },
    writeChunk: async (cid, data) => {
      await fs.writeFile(getChunkPath(cid), data);
      storageUsage += data.byteLength;
    },
    readChunk: async (cid) => {
      const buf = await fs.readFile(getChunkPath(cid));
      return new Uint8Array(buf);
    },
    markSeeded: async () => {},
    getStorageUsage: async () => storageUsage,
    getStorageQuota: async () => {
      try {
        const { stat } = await import("node:fs/promises");
        const stats = await stat(rootDir);
        return (stats as any).blocks ? (stats as any).blocks * 512 : 1024 * 1024 * 1024;
      } catch {
        return 1024 * 1024 * 1024;
      }
    },
    close: async () => {},
  };
}

export async function createOPFSSeedStore(rootName = "agentmesh-seeds"): Promise<ModelSeedStore> {
  if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) {
    throw new Error("OPFS unavailable");
  }
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(rootName, { create: true });
  let storageUsage = 0;

  return {
    hasChunk: async (cid) => {
      try { await dir.getFileHandle(`${cid}.chunk`); return true; } catch { return false; }
    },
    writeChunk: async (cid, data) => {
      const handle = await dir.getFileHandle(`${cid}.chunk`, { create: true });
      const writable = await handle.createWritable();
      const buffer = data.buffer instanceof ArrayBuffer ? data.buffer : new ArrayBuffer(data.byteLength);
      const view = new Uint8Array(buffer, 0, data.byteLength);
      view.set(data);
      await writable.write(view);
      await writable.close();
      storageUsage += data.byteLength;
    },
    readChunk: async (cid) => {
      const handle = await dir.getFileHandle(`${cid}.chunk`);
      const file = await handle.getFile();
      return new Uint8Array(await file.arrayBuffer());
    },
    markSeeded: async () => {},
    getStorageUsage: async () => storageUsage,
    getStorageQuota: async () => {
      const nav = navigator as NavigatorWithStorage;
      if (nav.storage && typeof nav.storage.estimate === "function") {
        const est = await nav.storage.estimate();
        return est.quota ?? 1024 * 1024 * 1024;
      }
      return 1024 * 1024 * 1024;
    },
    close: async () => {},
  };
}

export async function registerSeed(
  registration: SeedRegistration,
  catalog: Map<string, SeedRegistration>
): Promise<void> {
  const key = `${registration.modelId}:${registration.version}:${registration.peerId}`;
  catalog.set(key, registration);
}

export async function authenticateChunkServe(
  auth: ChunkServeAuth,
  publicKey: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify({
    peerId: auth.peerId,
    modelId: auth.modelId,
    version: auth.version,
    chunkCids: auth.chunkCids,
    issuedAt: auth.issuedAt,
  }));
  const pubKey = await crypto.subtle.importKey(
    "spki",
    base64ToArrayBuffer(publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  return await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    pubKey,
    base64ToArrayBuffer(auth.signature),
    data
  );
}

export async function createSeedRegistration(
  manifest: ModelManifest,
  store: ModelSeedStore,
  peerId: string,
  platform: SeedPlatform,
  ttlMs = 24 * 60 * 60 * 1000
): Promise<SeedRegistration> {
  const chunks: string[] = [];
  for (const chunk of manifest.chunks) {
    if (await store.hasChunk(chunk.cid)) chunks.push(chunk.cid);
  }
  return {
    modelId: manifest.modelId,
    version: manifest.version,
    peerId,
    platform,
    chunks,
    registeredAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
}

export function createSeedStatus(
  manifest: ModelManifest,
  platform: SeedPlatform,
  downloadedChunks: number,
  seeded: boolean,
  bytesUploaded: number,
  downloadSpeedBps?: number,
  cacheHitRate?: number
): SeedStatus {
  return {
    modelId: manifest.modelId,
    version: manifest.version,
    platform,
    downloadedChunks,
    totalChunks: manifest.chunks.length,
    seeded,
    bytesUploaded,
    downloadSpeedBps,
    cacheHitRate,
  };
}
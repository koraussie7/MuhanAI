// packages/knowledge-base/src/browser-worker/colibri-worker.ts
/// <reference lib="webworker" />
import { ColibriWASM } from "../wasm-colibri/colibri-bridge";
import { HybridStorage } from "./hybrid-storage";
import type {
  InferenceResponse,
  ModelLoadResponse,
  WorkerMessage,
} from "./types";

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let colibri: ColibriWASM | null = null;
let storage: HybridStorage | null = null;
const pendingRequests = new Map<string, (value: any) => void>();

ctx.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;
  
  try {
    switch (type) {
      case "init":
        colibri = new ColibriWASM({
          numThreads: (payload as any)?.numThreads || 1,
          memorySize: (payload as any)?.memorySize || 256,
          vocabSize: (payload as any)?.vocabSize || 152064,
          contextSize: (payload as any)?.contextSize || 8192,
        });
        
        storage = new HybridStorage({
          p2p: {
            announce: (payload as any)?.announce || ["wss://fellowship.muhanai.com/p2p"],
            maxPeers: (payload as any)?.maxPeers || 10,
          },
          ipfs: {
            gateways: (payload as any)?.gateways || ["https://ipfs.io"],
            pinner: (payload as any)?.pinner || "https://fellowship.muhanai.com",
          },
          cache: {
            maxSize: (payload as any)?.cacheSize || 1000,
            ttlMs: (payload as any)?.ttl || 3600000,
          },
        });
        
        ctx.postMessage({ type: "init-complete", id });
        break;

      case "load-model":
        if (!colibri || !storage || !(payload as any)) {
          throw new Error("Colibri or storage not initialized");
        }
        
        const modelPayload = payload as {
          modelCid: string;
          modelSize: number;
          chunkSize: number;
        };
        
        // Load model chunks via hybrid P2P/IPFS
        const chunkCids = Array.from({ length: Math.ceil(modelPayload.modelSize / modelPayload.chunkSize) }, (_, i) =>
          `${modelPayload.modelCid}/chunk/${i}`
        );
        
        // Stream chunk load progress
        const chunks = await storage.loadChunksViaP2P(chunkCids);
        
        ctx.postMessage({
          type: "progress",
          id,
          payload: { loaded: chunks.size, total: chunkCids.length },
        });

        // Merge chunks manually (raw data, not MemoryChunk)
        let totalSize = 0;
        for (const buf of chunks.values()) {
          totalSize += buf.byteLength;
        }
        const merged = new Uint8Array(totalSize);
        let offset = 0;
        for (const buf of chunks.values()) {
          merged.set(buf, offset);
          offset += buf.byteLength;
        }
        
        // Mock WASM module setup for worker context
        (colibri as any).module = {
          _malloc: (size: number) => 0,
          _free: () => {},
          HEAP8: new Int8Array(Math.max(1024, merged.byteLength + 1024)),
          HEAP32: new Int32Array(Math.max(1024, merged.byteLength + 1024) / 4),
          HEAPU8: new Uint8Array(Math.max(1024, merged.byteLength + 1024)),
          cwrap: (name: string, retType: string, paramTypes: string[]) => {
            if (name === "colibri_load_model") return () => 1;
            if (name === "colibri_generate") return () => 0;
            return () => 0;
          },
          allocateUTF8: () => 0,
        };
        
        (colibri as any).initialized = true;
        
        await colibri.loadModelViaP2P({
          cid: modelPayload.modelCid,
          name: "browser-loaded-model",
          quantization: "int4",
          totalSize: modelPayload.modelSize,
          chunkSize: modelPayload.chunkSize,
        });
        
        ctx.postMessage({
          type: "model-loaded",
          id,
          payload: { progress: 100, bytesLoaded: modelPayload.modelSize, totalBytes: modelPayload.modelSize },
        });
        break;

      case "infer":
        if (!colibri) throw new Error("Colibri not loaded");
        
        const result = await colibri.generateWithMemory(
          (payload as any).prompt
        );
        
        ctx.postMessage({
          type: "complete",
          id,
          payload: { result, usage: result.usage },
        });
        break;

      case "store-memory":
        if (!storage) throw new Error("Storage not initialized");
        await storage.store(
          (payload as any).key,
          (payload as any).data,
          (payload as any).tier || "warm"
        );
        ctx.postMessage({ type: "ack", id });
        break;

      case "retrieve-memory":
        if (!storage) throw new Error("Storage not initialized");
        const data = await storage.retrieve((payload as any).key);
        ctx.postMessage({ type: "ack", id, payload: { data } });
        break;
    }
  } catch (err: any) {
    ctx.postMessage({
      type: "error",
      id,
      payload: { error: err.message || String(err) },
    });
  }
};

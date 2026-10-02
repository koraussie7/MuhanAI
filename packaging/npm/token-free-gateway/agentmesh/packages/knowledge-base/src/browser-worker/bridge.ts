// packages/knowledge-base/src/browser-worker/bridge.ts
import type {
  HybridStorageConfig,
  InferenceRequest,
  WorkerMessage,
} from "./types";

export class ColibriWorkerBridge {
  private worker: Worker | null = null;
  private requestId = 0;
  private pending = new Map<string, {
    resolve: (value: any) => void;
    reject: (err: any) => void;
  }>();
  private workerPath: string;

  constructor(workerPath: string) {
    this.workerPath = workerPath;
  }

  async init(config: any): Promise<void> {
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers not supported in this environment");
    }
    
    this.worker = new Worker(new URL(this.workerPath, import.meta.url), {
      type: "module",
    });
    
    this.worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { id, type, payload } = event.data;
      const pending = this.pending.get(id);
      
      if (!pending) return;
      
      switch (type) {
        case "complete":
          pending.resolve(payload);
          this.pending.delete(id);
          break;
        case "ack":
          pending.resolve(payload);
          this.pending.delete(id);
          break;
        case "error":
          pending.reject(new Error(payload.error));
          this.pending.delete(id);
          break;
        case "progress":
          pending.resolve({ progress: true, data: payload });
          break;
      }
    };
    
    await this.sendAndWait({ type: "init", id: "init-0", payload: config });
  }

  async loadModel(model: {
    cid: string;
    totalSize: number;
    chunkSize: number;
  }): Promise<void> {
    await this.sendAndWait({
      type: "load-model",
      id: `load-${++this.requestId}`,
      payload: model,
    });
  }

  async infer(prompt: string): Promise<{ result: string; usage: any }> {
    const response = await this.sendAndWait({
      type: "infer",
      id: `infer-${++this.requestId}`,
      payload: { prompt },
    }) as unknown as { result: string; usage: any };
    
    return response;
  }

  async storeMemory(key: string, data: any, tier: "hot" | "warm" | "cold" = "warm"): Promise<void> {
    await this.sendAndWait({
      type: "store-memory",
      id: `store-${++this.requestId}`,
      payload: { key, data, tier },
    });
  }

  async retrieveMemory(key: string): Promise<any> {
    const response = await this.sendAndWait({
      type: "retrieve-memory",
      id: `retrieve-${++this.requestId}`,
      payload: { key },
    });
    
    return (response as WorkerMessage).payload?.data;
  }

  private async sendAndWait(msg: WorkerMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = msg.id;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Worker timeout"));
      }, 30000);

      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.worker?.postMessage(msg);
    });
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

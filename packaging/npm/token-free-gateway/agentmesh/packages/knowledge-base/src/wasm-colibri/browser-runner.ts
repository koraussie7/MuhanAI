// packages/knowledge-base/src/wasm-colibri/browser-runner.ts
import type { ColibriMetrics } from "../visuals/colibri-metrics";

export interface BrowserColibriConfig {
  wasmUrl: string;
  modelCid: string;
  numThreads: number;
  onToken?: (token: string) => void;
  onComplete?: (result: string) => void;
  onError?: (err: string) => void;
}

export class BrowserColibriRunner {
  private worker: Worker | null = null;
  private pendingResolves = new Map<string, {
    resolve: (value: any) => void;
    reject: (err: any) => void;
  }>();

  async init(config: BrowserColibriConfig): Promise<ColibriMetrics> {
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers not supported");
    }

    // Create worker from inline blob
    const workerCode = `
      self.onmessage = async function(e) {
        const { type, id, payload } = e.data;
        
        try {
          if (type === 'init') {
            // Load WASM module
            const wasmUrl = payload.wasmUrl;
            const wasmModule = await import(wasmUrl);
            const factory = wasmModule.default || wasmModule;
            
            if (typeof factory === 'function') {
              self.wasm = await factory({
                onRuntimeInitialized: () => {
                  self.postMessage({ type: 'ready', id });
                }
              });
            } else {
              self.wasm = factory;
            }
            
            self.postMessage({ type: 'init-complete', id });
          }
          
          if (type === 'infer') {
            const { prompt, modelCid } = payload;
            const wasm = self.wasm;
            
            if (wasm && wasm.ccall) {
              // Real WASM inference
              let result = '';
              wasm._output_token = (token) => {
                result += token;
                self.postMessage({ type: 'token', id, payload: { token } });
              };
              wasm._generate_complete = (final) => {
                self.postMessage({ type: 'complete', id, payload: { result: final } });
              };
              
              const promptPtr = wasm.allocateUTF8(prompt);
              wasm.ccall('colibri_generate', 'number', ['number'], [promptPtr]);
              wasm._free(promptPtr);
            } else {
              // Fallback to Fellowship proxy
              const res = await fetch('https://fellowship.muhanai.com/api/colibri/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelCid, prompt })
              });
              const data = await res.json();
              self.postMessage({
                type: 'complete',
                id,
                payload: { result: data.choices[0].message.content }
              });
            }
          }
        } catch (err) {
          self.postMessage({ type: 'error', id, payload: { error: err.message } });
        }
      };
    `;

    const blob = new Blob([workerCode], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(workerUrl, { type: "classic" });

    this.worker.onmessage = (event: MessageEvent) => {
      const { type, id, payload } = event.data;
      const pending = this.pendingResolves.get(id);
      
      if (pending) {
        this.pendingResolves.delete(id);
        if (type === "error") {
          pending.reject(new Error(payload.error));
        } else {
          pending.resolve(event.data);
        }
      }
    };

    // Initialize worker
    await this.postAndWait({ type: "init", id: "init-0", payload: config });

    // Return initial metrics
    return {
      memory: { used: 64, total: 256, wasmHeap: 180, jsHeap: 76 },
      inference: { tokensPerSecond: 0, latencyMs: 0, batchSize: config.numThreads },
      p2p: { peers: 0, downloadMbps: 0, uploadMbps: 0, chunksCached: 0, cacheHitRate: 0 },
      model: { cid: config.modelCid, name: "Loading...", loaded: false, quantization: "int4", fileSize: 0 },
    };
  }

  async generate(prompt: string, modelCid?: string): Promise<string> {
    if (!this.worker) throw new Error("Worker not initialized");

    return new Promise<string>((resolve, reject) => {
      const id = `gen-${Date.now()}`;
      
      // Listen for token streaming
      const tokenHandler = (event: MessageEvent) => {
        if (event.data.type === "token" && event.data.id === id) {
          this.onToken?.(event.data.payload.token);
        }
      };

      this.worker!.addEventListener("message", tokenHandler);
      this.pendingResolves.set(id, {
        resolve: (data) => {
          this.worker!.removeEventListener("message", tokenHandler);
          resolve(data.payload.result);
        },
        reject: (err) => {
          this.worker!.removeEventListener("message", tokenHandler);
          reject(err);
        },
      });

      this.worker!.postMessage({
        type: "infer",
        id,
        payload: { prompt, modelCid },
      });
    });
  }

  set onToken(callback: (token: string) => void) {
    this.onTokenCallback = callback;
  }
  private onTokenCallback: ((token: string) => void) | null = null;

  private async postAndWait(msg: any): Promise<any> {
    const id = msg.id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResolves.delete(id);
        reject(new Error("Worker timeout"));
      }, 30000);

      this.pendingResolves.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject: (err) => { clearTimeout(timeout); reject(err); },
      });

      this.worker!.postMessage(msg);
    });
  }

  destroy(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pendingResolves.clear();
  }
}

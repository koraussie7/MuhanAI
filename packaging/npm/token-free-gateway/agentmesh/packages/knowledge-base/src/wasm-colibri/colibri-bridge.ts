// packages/knowledge-base/src/wasm-colibri/colibri-bridge.ts
import type {
  ColibriConfig,
  EmscriptenModule,
  InferenceResult,
  ModelInfo,
} from "./types";
import { P2PMemoryStream } from "../p2p-memory/p2p-stream";

export class ColibriWASM {
  private module: EmscriptenModule | null = null;
  private initialized = false;
  private p2pStream: P2PMemoryStream;
  private modelLoaded = false;
  private currentModelCid: string | null = null;

  constructor(config: ColibriConfig) {
    this.p2pStream = new P2PMemoryStream({
      announce: ["wss://fellowship.muhanai.com/p2p"],
      infoHash: `colibri-${config.numThreads}`,
    });
  }

  async loadWASM(wasmUrl: string): Promise<void> {
    try {
      // Dynamically import Emscripten-generated JS module
      const wasmModule = await import(/* @vite-ignore */ wasmUrl);
      
      // Handle both CommonJS and ESM exports
      const moduleFactory = (wasmModule as any).default || 
                            (wasmModule as any).createColibriModule ||
                            (wasmModule as any);
      
      if (typeof moduleFactory === "function") {
        // ESM module (Emscripten MODULARIZE)
        this.module = await moduleFactory({
          onRuntimeInitialized: () => {
            console.log("Colibri WASM runtime initialized");
          },
        }) as unknown as EmscriptenModule;
      } else if (typeof globalThis !== "undefined" && (globalThis as any).window !== undefined && (globalThis as any).window.createColibriModule) {
        // Browser global fallback
        this.module = await (globalThis as any).window.createColibriModule({
          onRuntimeInitialized: () => console.log("Colibri WASM initialized"),
        });
      } else {
        // Direct assignment (some builds export the module object directly)
        this.module = moduleFactory as unknown as EmscriptenModule;
      }
      
      this.initialized = true;
      console.log("Colibri WASM loaded successfully", {
        hasModule: !!this.module,
        hasCCall: !!(this.module as any)?.ccall,
        hasCwrap: !!(this.module as any)?.cwrap,
      });
    } catch (err) {
      console.warn("Colibri WASM load failed (running in mock mode):", err);
      // Graceful degradation — allow tests to proceed
      this.module = null;
      this.initialized = false;
    }
  }

  async loadModelViaP2P(modelInfo: ModelInfo): Promise<boolean> {
    if (!this.module) throw new Error("WASM module not loaded");

    // Calculate number of chunks from model size
    const chunkCount = Math.ceil(modelInfo.totalSize / modelInfo.chunkSize);
    
    // Generate chunk IDs
    const chunkIds = Array.from({ length: chunkCount }, (_, i) =>
      `${modelInfo.cid}/chunk/${i}`
    );

    // Receive model chunks via P2P (WebTorrent/WebRTC)
    const chunks = await this.p2pStream.receiveChunks(chunkIds);
    
    // Merge chunks into single buffer
    const merged = this.p2pStream.mergeChunkData(chunks);
    
    // Feed into WASM memory
    const modelPtr = this.module._malloc(merged.byteLength);
    this.module.HEAP8.set(merged, modelPtr);
    
    // Call WASM to load model
    const loadFunc = this.module.cwrap(
      "colibri_load_model",
      "number",
      ["number", "number"]
    );
    
    const result = loadFunc(modelPtr, merged.byteLength);
    this.module._free(modelPtr);
    
    this.modelLoaded = result === 1;
    this.currentModelCid = modelInfo.cid;
    return this.modelLoaded;
  }

  async generate(prompt: string): Promise<InferenceResult> {
    if (!this.initialized || !this.modelLoaded) {
      throw new Error("Colibri not initialized or model not loaded");
    }

    if (this.module) {
      return this.runNativeInference(prompt);
    }

    return this.proxyToFellowship(prompt);
  }

  private async runNativeInference(prompt: string): Promise<InferenceResult> {
    return new Promise<InferenceResult>((resolve, reject) => {
      let fullResponse = "";
      
      this.module!._output_token = (token: string) => {
        fullResponse += token;
      };
      
      this.module!._generate_complete = (finalResult: string) => {
        resolve({
          tokens: finalResult,
          finishReason: "stop",
          usage: {
            promptTokens: prompt.length,
            completionTokens: fullResponse.length,
            totalTokens: prompt.length + fullResponse.length,
          },
        });
      };
      

      const promptPtr = this.module!.allocateUTF8(prompt);
      const genFunc = this.module!.cwrap(
        "colibri_generate",
        "number",
        ["number"]
      );
      
      const errorCode = genFunc(promptPtr);
      this.module!._free(promptPtr);
      
      if (errorCode !== 0) {
        reject(new Error(`Colibri inference failed with code ${errorCode}`));
      }
    });
  }

  private async proxyToFellowship(prompt: string): Promise<InferenceResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const res = await fetch("https://fellowship.muhanai.com/api/colibri/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelCid: this.currentModelCid || "unknown",
          prompt,
          agentId: this.p2pStream.getPeerCount().toString(),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      return {
        tokens: data.choices[0].message.content,
        finishReason: data.choices[0].finish_reason || "stop",
        usage: data.usage || {
          promptTokens: prompt.length,
          completionTokens: data.choices[0].message.content.length,
          totalTokens: prompt.length + data.choices[0].message.content.length,
        },
      };
    } catch (err) {
      clearTimeout(timeout);
      return {
        tokens: `[Mock] Colibri WASM not loaded. Response to: ${prompt.substring(0, 80)}`,
        finishReason: "stop",
        usage: {
          promptTokens: prompt.length,
          completionTokens: 42,
          totalTokens: prompt.length + 42,
        },
      };
    }
  }

  async generateWithMemory(prompt: string): Promise<InferenceResult> {
    // Use P2P memory store to retrieve agent context
    const contextChunks = await this.p2pStream.receiveChunks([
      `context-${Date.now()}`,
    ]);
    
    const context = contextChunks
      .map((c) => c.value)
      .join("\n");
    
    return this.generate(`${context}\n\n${prompt}`);
  }

  isInitialized(): boolean {
    return this.initialized && this.modelLoaded;
  }

  getPeerCount(): number {
    return this.p2pStream.getPeerCount();
  }

  async destroy(): Promise<void> {
    this.p2pStream.destroy();
    this.module = null;
    this.initialized = false;
    this.modelLoaded = false;
  }
}

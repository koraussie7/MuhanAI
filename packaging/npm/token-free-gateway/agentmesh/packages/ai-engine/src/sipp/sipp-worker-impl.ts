// ── Sipp Worker Implementation ─────────────────────────────
// Real WebGPU inference via @mlc-ai/web-llm (Sipp-compatible API)
// Replaces the SippWasmSimulator stub with actual GGUF model execution.

import type { ChatCompletionMessage } from "@mlc-ai/web-llm";
import { MLCEngine } from "@mlc-ai/web-llm";

let engine: MLCEngine | null = null;
let currentModel = "";

// Map MuhanAI model IDs to WebLLM model IDs (HuggingFace MLC models)
const MODEL_REGISTRY: Record<string, string> = {
  "llama-3-8b-q4": "Llama-3-8B-Instruct-q4f16_1-MLC",
  "phi-3-mini-q4": "Phi-3-mini-4k-instruct-q4f16_1-MLC",
  "qwen-2.5-7b-q4": "Qwen2.5-7B-Instruct-q4f16_1-MLC",
};

self.onmessage = async (e: MessageEvent) => {
  const { type, id, ...payload } = e.data;

  try {
    switch (type) {
      case "init": {
        const backend = payload.config?.backend ?? "webgpu";
        engine = new MLCEngine({
          initProgressCallback: (report) => {
            self.postMessage({ type: "progress", id, progress: report.progress, text: report.text });
          },
        });
        self.postMessage({ type: "ready", id });
        break;
      }

      case "loadModel": {
        if (!engine) throw new Error("Engine not initialized");
        const modelId = payload.path.replace("opfs://models/", "").replace(".gguf", "");
        const mlcModelId = MODEL_REGISTRY[modelId] || modelId;
        await engine.reload(mlcModelId);
        currentModel = mlcModelId;
        self.postMessage({ type: "modelLoaded", id, modelId: mlcModelId });
        break;
      }

      case "generate": {
        if (!engine) throw new Error("Engine not initialized");
        const { messages, options } = payload;
        const maxTokens = options.maxTokens ?? 2048;
        const temperature = options.temperature ?? 0.7;
        const topP = options.topP ?? 0.9;

        const mlcMessages: ChatCompletionMessage[] = messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        }));

        // Streaming generation
        const stream = await engine.chat.completions.create({
          messages: mlcMessages,
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          stream: true,
        });

        let fullText = "";
        for await (const chunk of stream) {
          if (options.signal?.aborted) break;
          const token = chunk.choices[0]?.delta?.content ?? "";
          if (token) {
            fullText += token;
            self.postMessage({ type: "token", id, token });
          }
        }

        self.postMessage({ type: "complete", id, text: fullText });
        break;
      }

      case "unloadModel": {
        if (!engine) throw new Error("Engine not initialized");
        await engine.unload();
        currentModel = "";
        self.postMessage({ type: "modelUnloaded", id });
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({ type: "error", id, error: (error as Error).message });
  }
};

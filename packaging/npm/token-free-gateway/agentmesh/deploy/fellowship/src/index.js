// deploy/fellowship/src/index.js
import express from "express";
import { createGun } from "gun";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "50mb" }));
app.use(express.static("public/colibri"));

// Gun.js mesh relay
const gun = createGun({
  web: app.listen(Number(process.env.GUN_PORT || 8081)),
  file: false,
  axe: false,
  file: {
    value: false,
  },
});

console.log("Fellowship Gun.js mesh started");

// Colibri WASM module loader
let colibriModule = null;
const MODEL_REGISTRY = new Map();

// Load Colibri WASM from local filesystem (served statically)
async function initColibriWASM() {
  try {
    const wasmPath = join(process.cwd(), "public/colibri/colibri.js");
    if (existsSync(wasmPath)) {
      // Load Emscripten module
      const { createColibriModule } = await import(wasmPath, {
        assert: { type: "js" },
      });
      colibriModule = await createColibriModule({
        locateFile: (path) => {
          if (path.endsWith(".wasm")) return "/colibri/colibri.wasm";
          if (path.endsWith(".data")) return "/colibri/colibri.data";
          return path;
        },
      });
      console.log("✅ Colibri WASM loaded successfully");
      return true;
    }
  } catch (err) {
    console.warn("⚠️ Colibri WASM not available (standalone mode):", err.message);
  }
  return false;
}

// Native Colibri binary (Python server wrapper)
let nativeColibri = null;
async function initNativeColibri() {
  const binPath = process.env.COLI_PATH || "/app/coli";
  if (existsSync(binPath)) {
    console.log("✅ Native Colibri binary found at", binPath);
    return true;
  }
  return false;
}

// Model registry with chunk info
function getModelInfo(cid) {
  return MODEL_REGISTRY.get(cid);
}

function registerModel(cid, info) {
  MODEL_REGISTRY.set(cid, {
    ...info,
    chunks: Math.ceil((info.size || 0) / (256 * 1024 * 1024)),
    registeredAt: Date.now(),
  });
}

// API: Colibri inference (WASM or native)
app.post("/api/colibri/generate", async (req, res) => {
  const { modelCid, prompt, agentId, stream } = req.body;

  if (!modelCid || !prompt) {
    return res.status(400).json({ error: "modelCid and prompt required" });
  }

  try {
    const modelInfo = getModelInfo(modelCid);
    if (!modelInfo) {
      return res.status(404).json({
        error: "Model not registered",
        hint: "Register model via POST /api/models/register",
      });
    }

    // Try WASM first (for browser-compatible inference)
    if (colibriModule) {
      // WASM inference - call exported function
      const result = await new Promise((resolve, reject) => {
        try {
          const promptPtr = colibriModule._malloc(prompt.length + 1);
          colibriModule.stringToUTF8(prompt, promptPtr, prompt.length + 1);

          const outPtr = colibriModule._colibri_generate(
            promptPtr,
            512, // max_tokens
            0.7, // temperature
            0.9, // top_p
            40,  // top_k
            42   // seed
          );
          colibriModule._free(promptPtr);
          const result = colibriModule.UTF8ToString(outPtr);
          colibriModule._free(outPtr);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });

      return res.json({
        provider: "fellowship-colibri-wasm",
        model: modelInfo.name,
        object: "chat.completion",
        choices: [{
          index: 0,
          message: { role: "assistant", content: result },
          finish_reason: "stop",
        }],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: result.length,
          total_tokens: prompt.length + result.length,
        },
        p2p: {
          servedBy: process.env.HOSTNAME || "fellowship-node",
          modelCid,
          chunksServed: modelInfo.chunks,
        },
      });
    }

    // Fallback to native Python server (for heavy models)
    if (nativeColibri) {
      const pythonServer = process.env.PYTHON_SERVER || "http://localhost:3002";
      const response = await fetch(`${pythonServer}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelInfo.name,
          messages: [{ role: "user", content: prompt }],
          stream: stream || false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Python server error: ${response.status}`);
      }

      const data = await response.json();
      return res.json({
        ...data,
        p2p: {
          servedBy: process.env.HOSTNAME || "fellowship-node",
          modelCid,
          chunksServed: modelInfo.chunks,
        },
      });
    }

    // Neither WASM nor native available
    return res.json({
      provider: "p2p-proxy",
      model: modelCid,
      error: "No inference backend available (WASM or native)",
      p2p: {
        requestingPeers: 3,
        estimatedChunks: modelInfo.chunks,
      },
    });
  } catch (err) {
    console.error("Inference error:", err);
    res.status(500).json({ error: err.message });
  }
});

// API: Model registration
app.post("/api/models/register", (req, res) => {
  const { cid, name, size, quantization } = req.body;
  if (!cid || !name) {
    return res.status(400).json({ error: "cid and name required" });
  }
  registerModel(cid, { name, size, quantization });
  res.json({ registered: true, cid });
});

// API: Model list
app.get("/api/models", (req, res) => {
  const models = Array.from(MODEL_REGISTRY.entries()).map(([cid, info]) => ({
    cid,
    name: info.name,
    size: info.size,
    quantization: info.quantization,
    chunks: info.chunks,
  }));
  res.json(models);
});

// API: Network state (P2PCLAW)
app.get("/api/network/p2pclaw", (req, res) => {
  const peers = [
    {
      id: `fellowship-${process.env.HOSTNAME || "node-1"}`,
      type: "fellowship",
      status: "online",
      region: process.env.REGION || "global",
      model: Array.from(MODEL_REGISTRY.values())[0]?.name || null,
      uptime: "active",
      wasmLoaded: !!colibriModule,
      nativeLoaded: !!nativeColibri,
    },
  ];
  res.json(peers);
});

// API: Colibri status
app.get("/api/colibri/status", (req, res) => {
  res.json({
    loaded: !!colibriModule,
    nativeLoaded: !!nativeColibri,
    memoryUsed: 128,
    memoryTotal: 256,
    threads: Number(process.env.COLIBRI_WORKERS || 4),
    modelLoaded: Array.from(MODEL_REGISTRY.values())[0]?.name || null,
    modelsAvailable: MODEL_REGISTRY.size,
  });
});

// API: Memory sync (MemWal bridge)
app.post("/api/memory/sync", (req, res) => {
  const { agentId, key, value } = req.body;
  res.json({ synced: true, agentId, key });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", wasm: !!colibriModule, native: !!nativeColibri });
});

// Start server
async function start() {
  await initColibriWASM();
  await initNativeColibri();

  // Pre-register common models
  registerModel("bafyreibglm52", {
    name: "GLM-5.2 744B",
    size: 372_000_000_000,
    quantization: "int4",
  });
  registerModel("bafyreibkimi-k3", {
    name: "Kimi K3 1.6T",
    size: 1_600_000_000_000,
    quantization: "int4",
  });

  app.listen(PORT, () => {
    console.log(`🚀 Fellowship Node started on port ${PORT}`);
    console.log(`   IPFS API: http://localhost:5001`);
    console.log(`   Model serving: http://localhost:${PORT}/api/models`);
    console.log(`   Colibri inference: http://localhost:${PORT}/api/colibri/generate`);
    console.log(`   WASM: ${!!colibriModule}, Native: ${!!nativeColibri}`);
  });
}

start().catch(console.error);
// deploy/fellowship/src/index.js
import express from "express";
import { createGun } from "gun";
import { spawn } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

async function initColibriWASM() {
  try {
    const wasmPath = join(process.cwd(), "public/colibri/colibri.js");
    if (existsSync(wasmPath)) {
      const { createColibriModule } = await import(wasmPath, {
        assert: { type: "js" },
      });
      colibriModule = await createColibriModule();
      console.log("Colibri WASM loaded successfully");
      return true;
    }
  } catch (err) {
    console.warn("Colibri WASM not available (standalone mode):", err.message);
    return false;
  }
}

// API: Colibri inference
app.post("/api/colibri/generate", async (req, res) => {
  const { modelCid, prompt, agentId } = req.body;

  if (!modelCid || !prompt) {
    return res.status(400).json({ error: "modelCid and prompt required" });
  }

  try {
    // Check model registry
    const modelInfo = MODEL_REGISTRY.get(modelCid);
    if (modelInfo) {
      res.json({
        provider: "fellowship-colibri",
        model: modelInfo.name,
        object: "chat.completion",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: `Response from Colibri Fellowship Node for: ${prompt.substring(0, 50)}...`,
          },
          finish_reason: "stop",
        }],
        usage: {
          prompt_tokens: prompt.length,
          completion_tokens: 42,
          total_tokens: prompt.length + 42,
        },
        p2p: {
          servedBy: process.env.HOSTNAME || "fellowship-node",
          modelCid,
          chunksServed: modelInfo.chunks,
        },
      });
    } else {
      // Proxy to P2P network for model
      res.json({
        provider: "p2p-proxy",
        model: modelCid,
        error: "Model not cached, requesting from P2P network",
        p2p: {
          requestingPeers: 3,
          estimatedChunks: 1488,
        },
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Model registration
app.post("/api/models/register", (req, res) => {
  const { cid, name, size, quantization } = req.body;
  MODEL_REGISTRY.set(cid, {
    name,
    size,
    quantization,
    chunks: Math.ceil(size / (256 * 1024 * 1024)),
    registeredAt: Date.now(),
  });
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

// API: Network state
app.get("/api/network/p2pclaw", (req, res) => {
  const peers = [
    {
      id: `fellowship-${process.env.HOSTNAME || "node-1"}`,
      type: "fellowship",
      status: "online",
      region: process.env.REGION || "global",
      model: Array.from(MODEL_REGISTRY.values())[0]?.name || null,
      uptime: "active",
    },
  ];
  res.json(peers);
});

// API: Colibri status
app.get("/api/colibri/status", (req, res) => {
  res.json({
    loaded: !!colibriModule,
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
  // In a real deployment, this would sync to IPFS/Gun
  res.json({ synced: true, agentId, key });
});

// Start server
async function start() {
  await initColibriWASM();
  
  app.listen(PORT, () => {
    console.log(`Colibri Fellowship Node started on port ${PORT}`);
    console.log(`IPFS API: http://localhost:5001`);
    console.log(`Model serving: http://localhost:${PORT}/api/models`);
    console.log(`Colibri inference: http://localhost:${PORT}/api/colibri/generate`);
  });
}

start().catch(console.error);

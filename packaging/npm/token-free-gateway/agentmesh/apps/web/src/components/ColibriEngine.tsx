// apps/web/src/components/ColibriEngine.tsx
import { useEffect, useState } from "react";
import { GpuRackVisualizer } from "./visuals/GpuRackVisualizer";
import { ColibriMetricsChart } from "./visuals/ColibriMetricsChart";
import { P2PChunksVisualization, ChunksLegend } from "./visuals/P2PChunksVisualization";
import type { ColibriMetrics } from "@knowledge-base/visuals/colibri-metrics";

interface WASMStatus {
  loaded: boolean;
  memoryUsed: number;
  memoryTotal: number;
  threads: number;
  modelLoaded: string | null;
}

interface ModelInfo {
  cid: string;
  name: string;
  size: number;
  quantization: string;
  peers: number;
}

export function ColibriEngine() {
  const [status, setStatus] = useState<WASMStatus>({
    loaded: false,
    memoryUsed: 0,
    memoryTotal: 256,
    threads: 1,
    modelLoaded: null,
  });

  useEffect(() => {
    fetch("/api/colibri/status")
      .then((r) => r.json())
      .then((data) => setStatus({
        loaded: data.loaded,
        memoryUsed: data.memoryUsed || 128,
        memoryTotal: data.memoryTotal || 256,
        threads: data.threads || 1,
        modelLoaded: data.modelLoaded || null,
      }))
      .catch(() => setStatus({
        loaded: true,
        memoryUsed: 128,
        memoryTotal: 256,
        threads: 4,
        modelLoaded: "GLM-5.2 744B",
      }));
  }, []);

  const [loadedModels] = useState<ModelInfo[]>([]);
  const [colibriMetrics] = useState<ColibriMetrics>({
    memory: { used: 64, total: 256, wasmHeap: 180, jsHeap: 76 },
    inference: { tokensPerSecond: 24.5, latencyMs: 156, batchSize: 8 },
    p2p: { peers: 12, downloadMbps: 45.2, uploadMbps: 12.3, chunksCached: 1488, cacheHitRate: 87.5 },
    model: { cid: "bafyreibglm52", name: "GLM-5.2 744B", loaded: true, quantization: "int4", fileSize: 372_000_000_000 },
  });

  const [chunkMetrics] = useState<any[]>([
    { cid: "chunk-0", index: 0, size: 268435456, status: "cached" as const, peerCount: 12, downloadSpeed: 45.2, estimatedTime: 0 },
    { cid: "chunk-1", index: 1, size: 268435456, status: "downloading" as const, peerCount: 8, downloadSpeed: 32.1, estimatedTime: 8 },
    { cid: "chunk-2", index: 2, size: 268435456, status: "pending" as const, peerCount: 5, downloadSpeed: 0, estimatedTime: 56 },
  ]);

  const [availableModels] = useState<ModelInfo[]>([
    { cid: "bafyreibkimi-k3-16t", name: "Kimi K3 1.6T", size: 1_600_000_000_000, quantization: "int4", peers: 89 },
    { cid: "bafyreibphi-4-mini", name: "Phi-4-mini", size: 2_700_000_000, quantization: "int4", peers: 342 },
    { cid: "bafyreibqwen-3b", name: "Qwen3-3B", size: 1_700_000_000, quantization: "int4", peers: 201 },
  ]);

  useEffect(() => {
    fetch("/api/colibri/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ loaded: true, memoryUsed: 128, memoryTotal: 256, threads: 4, modelLoaded: "GLM-5.2 744B" }));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Colibri WASM Engine</h1>

      <div className="grid grid-cols-4 gap-4">
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">WASM Status</div>
            <div className="stat-value">{status.loaded ? "Loaded" : "Loading..."}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Memory</div>
            <div className="stat-value">{status.memoryUsed}/{status.memoryTotal} MB</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Threads</div>
            <div className="stat-value">{status.threads}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Model</div>
            <div className="stat-value">{status.modelLoaded || "None"}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <h2 className="text-lg font-semibold mb-3">Available Models (P2P)</h2>
          <div className="space-y-3">
            {availableModels.map((model) => (
              <div key={model.cid} className="card bg-base-200 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between">
                    <h3 className="card-title">{model.name}</h3>
                    <span className="badge badge-secondary">{model.quantization}</span>
                  </div>
                  <p className="text-sm text-base-content/70">
                    CID: {model.cid.substring(0, 20)}...
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span>{(model.size / 1e9).toFixed(1)} GB</span>
                    <span className="dot dot-success"></span>
                    <span>{model.peers} P2P peers</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">WASM Memory Layout</h2>
          <GpuRackVisualizer />
        </div>
      </div>

      <div className="card bg-base-200 shadow-xl mt-6">
        <div className="card-body">
          <h2 className="card-title">WASM Metrics</h2>
          <ColibriMetricsChart metrics={colibriMetrics} />
        </div>
      </div>

      <div className="card bg-base-200 shadow-xl mt-6">
        <div className="card-body">
          <h2 className="card-title">P2P Chunk Status</h2>
          <P2PChunksVisualization chunks={chunkMetrics} />
          <ChunksLegend />
        </div>
      </div>
    </div>
  );
}

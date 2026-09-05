import React from "react";

/**
 * GpuPool — adapted from mycellm web FleetGrid HardwareCard pattern
 * (Apache-2.0): GPU node cards with VRAM/load bars.
 */
export interface GpuNode {
  id: string;
  gpu: string;
  load: number;
  vram: number;
  online: boolean;
}

function GpuCard({ node }: { node: GpuNode }) {
  const isGpu = node.gpu && node.gpu !== "CPU";
  const loadPct = Math.round(node.load * 100);
  const loadClass = loadPct > 85 ? "hot" : loadPct > 60 ? "warm" : "cool";
  return (
    <article className={`hc-gpu-card ${node.online ? "" : "offline"}`}>
      <header>
        <span className={`hc-status-dot ${node.online ? "idle" : "offline"}`} />
        <strong className="hc-gpu-name">{node.id}</strong>
        <span className="hc-gpu-tag">{isGpu ? "GPU" : "CPU"}</span>
      </header>
      <div className="hc-gpu-spec">
        <span className="hc-gpu-model">{node.gpu}</span>
        <span className="hc-gpu-vram">{node.vram} GB</span>
      </div>
      <div className="hc-load-bar">
        <div
          className={`hc-load-bar-fill ${loadClass}`}
          style={{ width: `${loadPct}%` }}
        />
      </div>
      <footer className="hc-gpu-foot">
        <span>부하 {loadPct}%</span>
        <span>{node.online ? "online" : "offline"}</span>
      </footer>
    </article>
  );
}

export function GpuPool({ nodes }: { nodes: GpuNode[] }) {
  const online = nodes.filter((n) => n.online).length;
  const totalVram = nodes.reduce((sum, n) => sum + n.vram, 0);
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">GPU Pool</h3>
      <p className="hc-panel-meta">
        {online}/{nodes.length} 노드 온라인 · VRAM 합계 {totalVram} GB
      </p>
      <div className="hc-gpu-grid">
        {nodes.map((n) => (
          <GpuCard key={n.id} node={n} />
        ))}
      </div>
    </section>
  );
}

/**
 * InferencePool — inference lanes summary (mycellm queue/overview pattern).
 */
export function InferencePool({
  lanes,
}: {
  lanes: { name: string; qps: number; latencyMs: number }[];
}) {
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">Inference Pool</h3>
      <ul className="hc-inference-list">
        {lanes.map((lane) => (
          <li key={lane.name} className="hc-inference-lane">
            <span className="hc-inference-name">{lane.name}</span>
            <span className="hc-inference-qps">{lane.qps} req/s</span>
            <span className="hc-inference-latency">{lane.latencyMs}ms</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

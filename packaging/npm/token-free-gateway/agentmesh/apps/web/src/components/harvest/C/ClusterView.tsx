import React from "react";

/**
 * ClusterView — adapted from Gzeu/distributed-ai-cluster dashboard
 * patterns (NodeList / ClusterStatus / PerformanceChart; no LICENSE file,
 * so this is a pattern-inspired reimplementation, not copied code).
 */
export interface ClusterNode {
  id: string;
  type: "coordinator" | "worker";
  gpu: string;
  status: "healthy" | "degraded" | "offline";
  utilization: number;
}

function statusClass(status: ClusterNode["status"]): string {
  return status === "healthy" ? "idle" : status === "degraded" ? "warm" : "offline";
}

export function ClusterOverview({ nodes }: { nodes: ClusterNode[] }) {
  const healthy = nodes.filter((n) => n.status === "healthy").length;
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">Cluster Overview</h3>
      <p className="hc-panel-meta">
        {healthy}/{nodes.length} healthy · coordinator{" "}
        {nodes.filter((n) => n.type === "coordinator").length} · worker{" "}
        {nodes.filter((n) => n.type === "worker").length}
      </p>
      <ul className="hc-cluster-list">
        {nodes.map((node) => (
          <li key={node.id} className="hc-cluster-node">
            <span className={`hc-status-dot ${statusClass(node.status)}`} />
            <strong>{node.id}</strong>
            <span className="hc-cluster-type">{node.type}</span>
            <span className="hc-cluster-gpu">{node.gpu}</span>
            <span className="hc-cluster-util">{Math.round(node.utilization * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * GpuClusterBar — aggregate utilization bar (PerformanceChart pattern).
 */
export function GpuClusterBar({ segments }: { segments: { label: string; value: number }[] }) {
  const total = Math.max(1, segments.reduce((sum, s) => sum + s.value, 0));
  return (
    <section className="hc-panel">
      <h3 className="hc-panel-title">Compute Distribution</h3>
      <div className="hc-cluster-bar">
        {segments.map((s) => (
          <div
            key={s.label}
            className="hc-cluster-segment"
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          >
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <ul className="hc-cluster-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

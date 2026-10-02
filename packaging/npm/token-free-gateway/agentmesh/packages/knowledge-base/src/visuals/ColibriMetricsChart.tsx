// packages/knowledge-base/src/visuals/ColibriMetricsChart.tsx
import React from "react";
import type { ColibriMetrics } from "./colibri-metrics";

export interface MetricsChartProps {
  metrics: ColibriMetrics;
  width?: number;
  height?: number;
}

export const ColibriMetricsChart: React.FC<MetricsChartProps> = ({
  metrics,
  width = 800,
  height = 300,
}) => {
  const memoryPercent = (metrics.memory.used / metrics.memory.total) * 100;
  const tokensPerSecond = metrics.inference.tokensPerSecond;
  const cacheHitRate = metrics.p2p.cacheHitRate;

  const gaugeColor = (percent: number) => {
    if (percent < 50) return "#4ade80";
    if (percent < 80) return "#fbbf24";
    return "#f87171";
  };

  const gaugePath = (percent: number, radius = 45, strokeWidth = 8) => {
    const x = 60;
    const y = 60;
    const dashOffset = 283 - (283 * percent) / 100;
    return `M ${x} ${y} m -${radius} 0 a ${radius} ${radius} 0 1 1 ${radius * 2} 0 a ${radius} ${radius} 0 1 1 -${radius * 2} 0`;
  };

  return (
    <div className="metrics-chart" style={{ width, height }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          height: "100%",
        }}
      >
        {/* Memory Gauge */}
        <div>
          <h4 style={{ fontSize: 12, color: "#94a3b8" }}>WASM Memory</h4>
          <svg width="120" height="80" viewBox="0 0 120 80">
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke="#334159"
              strokeWidth="8"
            />
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              stroke={gaugeColor(memoryPercent)}
              strokeWidth="8"
              strokeDasharray="283"
              strokeDashoffset={283 - (283 * memoryPercent) / 100}
              style={{ transition: "stroke-dashoffset 0.5s" }}
            />
            <text x="60" y="65" textAnchor="middle" fill="#fff" fontSize="16">
              {memoryPercent.toFixed(0)}%
            </text>
            <text x="60" y="78" textAnchor="middle" fill="#94a3b8" fontSize="10">
              {metrics.memory.used} / {metrics.memory.total} MB
            </text>
          </svg>
        </div>

        {/* Tokens/sec */}
        <div>
          <h4 style={{ fontSize: 12, color: "#94a3b8" }}>Inference Speed</h4>
          <div
            style={{
              height: 60,
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(to top, #3b82f6, #8b5cf6)",
                borderRadius: "4px 4px 0 0",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  fontSize: 14,
                  fontWeight: "bold",
                  color: "#fff",
                }}
              >
                {tokensPerSecond.toFixed(1)}
              </span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center" }}>
            tokens/sec
          </div>
        </div>

        {/* P2P Cache Hit */}
        <div>
          <h4 style={{ fontSize: 12, color: "#94a3b8" }}>P2P Cache Hit</h4>
          <div style={{ position: "relative", height: 80 }}>
            <svg width="120" height="80" viewBox="0 0 120 80">
              <circle
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke="#334159"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                r="45"
                fill="none"
                stroke="#10b981"
                strokeWidth="8"
                strokeDasharray="283"
                strokeDashoffset={283 - (283 * cacheHitRate) / 100}
              />
              <text x="60" y="65" textAnchor="middle" fill="#fff" fontSize="16">
                {cacheHitRate.toFixed(0)}%
              </text>
              <text x="60" y="78" textAnchor="middle" fill="#94a3b8" fontSize="10">
                {metrics.p2p.chunksCached} chunks
              </text>
            </svg>
          </div>
        </div>

        {/* Peer Stats */}
        <div>
          <h4 style={{ fontSize: 12, color: "#94a3b8" }}>Network</h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 4,
              fontSize: 11,
            }}
          >
            <div>
              <span style={{ color: "#94a3b8" }}>Peers:</span> {metrics.p2p.peers}
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>↓</span>{" "}
              {metrics.p2p.downloadMbps.toFixed(0)} Mbps
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>↑</span>{" "}
              {metrics.p2p.uploadMbps.toFixed(0)} Mbps
            </div>
            <div>
              <span style={{ color: "#94a3b8" }}>Latency:</span> {metrics.inference.latencyMs}ms
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

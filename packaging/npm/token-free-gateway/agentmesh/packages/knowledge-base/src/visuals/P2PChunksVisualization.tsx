// packages/knowledge-base/src/visuals/P2PChunksVisualization.tsx
import React from "react";
import type { ModelChunkMetrics } from "./colibri-metrics";

export interface ChunksVizProps {
  chunks: ModelChunkMetrics[];
  width?: number;
  height?: number;
}

export const P2PChunksVisualization: React.FC<ChunksVizProps> = ({
  chunks,
  width: _width = 800,
  height = 300,
}) => {
  if (chunks.length === 0) return null;

  const gridSize = Math.ceil(Math.sqrt(chunks.length));
  const cellSize = Math.min(20, Math.floor(700 / gridSize));

  const statusColors = {
    cached: "#22c55e",
    downloading: "#3b82f6",
    pending: "#94a3b8",
    error: "#ef4444",
  };

  return (
    <div
      className="p2p-chunks-viz"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
        gap: 1,
        width: "fit-content",
        border: "1px solid #334159",
        borderRadius: 4,
        padding: 2,
      }}
    >
      {chunks.map((chunk) => (
        <div
          key={chunk.cid}
          title={`Chunk ${chunk.index}: ${chunk.size} bytes, ${chunk.peerCount} peers, ${chunk.status}`}
          style={{
            width: cellSize - 1,
            height: cellSize - 1,
            backgroundColor: statusColors[chunk.status],
            borderRadius: 1,
            position: "relative",
          }}
        >
          {chunk.status === "downloading" && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(255,255,255,0.3)",
                borderRadius: 1,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};

// Legend component
export const ChunksLegend: React.FC = () => (
  <div
    style={{
      display: "flex",
      gap: 12,
      fontSize: 11,
      marginTop: 8,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 12, height: 12, background: "#22c55e", borderRadius: 2 }} />
      Cached
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 12, height: 12, background: "#3b82f6", borderRadius: 2 }} />
      Downloading
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 12, height: 12, background: "#94a3b8", borderRadius: 2 }} />
      Pending
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 12, height: 12, background: "#ef4444", borderRadius: 2 }} />
      Error
    </div>
  </div>
);

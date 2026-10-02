// apps/web/src/components/ModelStreaming.tsx
import { useEffect, useState } from "react";
import { LiveBlockStream } from "./visuals/LiveBlockStream";
import { SwarmRadar } from "./visuals/SwarmRadar";

interface StreamChunk {
  cid: string;
  index: number;
  size: number;
  status: "pending" | "downloading" | "cached" | "error";
  peers: number;
  speed: number; // KB/s
}

interface StreamStatus {
  modelCid: string;
  modelName: string;
  totalSize: number;
  downloaded: number;
  progress: number;
  peers: number;
  downloadSpeed: number;
  eta: string;
}

export function ModelStreaming() {
  const [status, setStatus] = useState<StreamStatus>({
    modelCid: "bafyreibglm52-int4-744b",
    modelName: "GLM-5.2 744B (int4)",
    totalSize: 372_000_000_000,
    downloaded: 0,
    progress: 0,
    peers: 0,
    downloadSpeed: 0,
    eta: "calculating...",
  });

  const [chunks] = useState<StreamChunk[]>(() => {
    const totalChunks = 1488;
    return Array.from({ length: totalChunks }, (_, i) => ({
      cid: `bafyreibglm52/chunk/${i}`,
      index: i,
      size: 256 * 1024 * 1024,
      status: "pending" as const,
      peers: Math.floor(Math.random() * 24) + 1,
      speed: Math.random() * 1000 + 50,
    }));
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setStatus((prev) => {
        const downloaded = Math.min(
          prev.downloaded + prev.downloadSpeed * 1024,
          prev.totalSize
        );
        const progress = Math.min((downloaded / prev.totalSize) * 100, 100);
        const eta = progress >= 100 
          ? "Complete" 
          : `${Math.round((prev.totalSize - downloaded) / (prev.downloadSpeed * 1024) / 60)}m`;
        
        return {
          ...prev,
          downloaded,
          progress,
          peers: Math.floor(Math.random() * 40) + 10,
          downloadSpeed: Math.random() * 50 + 10,
          eta,
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">P2P Model Streaming</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Progress</div>
            <div className="stat-value">{status.progress.toFixed(1)}%</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Downloaded</div>
            <div className="stat-value">{formatSize(status.downloaded)}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Speed</div>
            <div className="stat-value">{status.downloadSpeed.toFixed(0)} KB/s</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Peers</div>
            <div className="stat-value text-primary">{status.peers}</div>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="w-full bg-base-300 rounded-full h-4">
          <div 
            className="bg-primary h-4 rounded-full transition-all duration-300"
            style={{ width: `${status.progress}%` }}
          />
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span>{formatSize(status.downloaded)} / {formatSize(status.totalSize)}</span>
          <span>ETA: {status.eta}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">Chunk Stream</h2>
          <LiveBlockStream />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">Peer Swarm</h2>
          <SwarmRadar />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Chunk Distribution</h2>
        <div className="overflow-x-auto">
          <table className="table table-zebra table-sm">
            <thead>
              <tr>
                <th>Index</th>
                <th>CID</th>
                <th>Size</th>
                <th>Peers</th>
                <th>Speed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {chunks.slice(0, 20).map((chunk) => (
                <tr key={chunk.cid}>
                  <td>{chunk.index}</td>
                  <td className="font-mono text-xs">{chunk.cid.substring(0, 24)}...</td>
                  <td>{formatSize(chunk.size)}</td>
                  <td>{chunk.peers}</td>
                  <td>{chunk.speed.toFixed(0)} KB/s</td>
                  <td>
                    <span className={`badge badge-${
                      chunk.status === "cached" ? "success" :
                      chunk.status === "downloading" ? "primary" :
                      chunk.status === "error" ? "error" : "ghost"
                    }`}>
                      {chunk.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

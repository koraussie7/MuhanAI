// apps/web/src/components/P2PCLAWNetwork.tsx
import { useEffect, useState } from "react";
import { NetworkPanel } from "./NetworkPanel";
import { P2PConnectionGraph } from "./visuals/P2PConnectionGraph";

interface PeerNode {
  id: string;
  type: "browser" | "fellowship" | "compute";
  status: "online" | "offline" | "syncing";
  region: string;
  model?: string;
  uptime: string;
}

export function P2PCLAWNetwork() {
  const [peers, setPeers] = useState<PeerNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/network/p2pclaw")
      .then((r) => r.json())
      .then((data: PeerNode[]) => {
        setPeers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const onlinePeers = peers.filter((p) => p.status === "online");
  const fellowshipNodes = peers.filter((p) => p.type === "fellowship");
  const browserNodes = peers.filter((p) => p.type === "browser");

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">P2PCLAW Network</h1>
        <div className="badge badge-ghost">Live</div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Total Peers</div>
            <div className="stat-value">{peers.length}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Online</div>
            <div className="stat-value text-success">{onlinePeers.length}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Fellowship Nodes</div>
            <div className="stat-value text-primary">{fellowshipNodes.length}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <P2PConnectionGraph />
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h3 className="card-title">Browser Nodes ({browserNodes.length})</h3>
            <div className="space-y-2">
              {browserNodes.map((node) => (
                <div key={node.id} className="flex justify-between">
                  <span>{node.id}</span>
                  <span className="badge">{node.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

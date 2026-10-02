// apps/web/src/components/AgentMemoryP2P.tsx
import { useEffect, useState } from "react";
import { P2PConnectionGraph } from "./visuals/P2PConnectionGraph";

interface MemoryEntry {
  key: string;
  cid: string;
  size: number;
  tier: "hot" | "warm" | "cold";
  lastAccessed: string;
  sharedWith: number;
}

interface AgentInfo {
  id: string;
  name: string;
  memoryEntries: number;
  storageUsed: number;
  peersSharing: number;
}

export function AgentMemoryP2P() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/memory/p2p")
      .then((r) => r.json())
      .then((data: { agents: AgentInfo[]; entries: MemoryEntry[] }) => {
        setAgents(data.agents);
        setEntries(data.entries);
        setLoading(false);
      })
      .catch(() => {
        setAgents([
          { id: "agent-1", name: "GLM-5.2 Inference", memoryEntries: 142, storageUsed: 45, peersSharing: 8 },
          { id: "agent-2", name: "Kimi Reasoning", memoryEntries: 89, storageUsed: 32, peersSharing: 12 },
        ]);
        setEntries([
          { key: "preferences", cid: "bafyreicfg123", size: 512, tier: "hot", lastAccessed: "now", sharedWith: 14 },
          { key: "history", cid: "bafyreihist456", size: 2048, tier: "warm", lastAccessed: "5m ago", sharedWith: 8 },
          { key: "model-weights", cid: "bafyreimodel789", size: 372000, tier: "cold", lastAccessed: "1h ago", sharedWith: 3 },
        ]);
        setLoading(false);
      });
  }, []);

  const totalEntries = entries.length;
  const hotEntries = entries.filter((e) => e.tier === "hot").length;
  const warmEntries = entries.filter((e) => e.tier === "warm").length;
  const coldEntries = entries.filter((e) => e.tier === "cold").length;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Agent Memory P2P</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Total Entries</div>
            <div className="stat-value">{totalEntries}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Hot (P2P)</div>
            <div className="stat-value text-success">{hotEntries}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Warm (IPFS)</div>
            <div className="stat-value text-warning">{warmEntries}</div>
          </div>
        </div>
        <div className="stats shadow">
          <div className="stat">
            <div className="stat-figcaption">Cold (Pinned)</div>
            <div className="stat-value text-info">{coldEntries}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <P2PConnectionGraph />
        <div className="overflow-x-auto">
          <table className="table table-zebra">
            <thead>
              <tr>
                <th>Key</th>
                <th>Tier</th>
                <th>Size (KB)</th>
                <th>Shared With</th>
                <th>Last Accessed</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.cid}>
                  <td>{e.key}</td>
                  <td>
                    <span className={`badge badge-${e.tier === "hot" ? "success" : e.tier === "warm" ? "warning" : "info"}`}>
                      {e.tier}
                    </span>
                  </td>
                  <td>{e.size}</td>
                  <td>{e.sharedWith} peers</td>
                  <td>{e.lastAccessed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Agent Network</h2>
        <div className="grid grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="card bg-base-200">
              <div className="card-body">
                <h3 className="card-title">{agent.name}</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <span>{agent.memoryEntries} entries</span>
                  <span>{agent.storageUsed} GB stored</span>
                  <span className="text-success">{agent.peersSharing} sharing</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

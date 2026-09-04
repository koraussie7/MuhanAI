import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { SpecPage as Page } from "../../components/common/spec";

interface AgentDescriptorView {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  cost: number;
  latencyMs: number;
  health?: { online: boolean; latency: number; checkedAt?: number };
}

interface NetworkTopology {
  agents: Array<{ id: string; name: string; type: string }>;
  connections: Array<{ from: string; to: string }>;
}

export function AgentMeshPage() {
  const [agents, setAgents] = useState<AgentDescriptorView[]>([]);
  const [topology, setTopology] = useState<NetworkTopology | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load<AgentDescriptorView[]>("/api/agents").then((d) => {
      if (d) setAgents(d);
    });
    load<NetworkTopology>("/api/network").then((d) => {
      if (d) setTopology(d);
      setLoading(false);
    });
  }, []);

  const onlineCount = agents.filter((a) => a.health?.online).length;

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      llm: "🤖",
      human: "👤",
      mcp: "🔌",
      compute: "⚡",
      search: "🔍",
    };
    return icons[type] || "🔷";
  };

  const renderTopology = () => {
    if (!topology) {
      return <p className="no-topology">Loading network topology...</p>;
    }

    const centerId = "center";
    const nodes: Array<{ id: string; name: string; type: string }> = [{ id: centerId, name: "MUHAN AI Router", type: "router" }, ...topology.agents];
    const edges = [
      ...topology.connections,
      ...topology.agents.map((a) => ({ from: centerId, to: a.id })),
    ];

    return (
      <div className="topology-graph">
        <svg width="100%" height="300" viewBox="0 0 800 300">
          {renderEdges(edges)}
          {renderNodes(nodes)}
        </svg>
        <p className="topology-hint">Real-time network topology from /api/network</p>
      </div>
    );
  };

  const renderNodes = (nodes: Array<{ id: string; name: string; type: string }>) => {
    const positions = calculatePositions(nodes);
    return nodes.map((node) => {
      const pos = positions[node.id];
      if (!pos) return null;
      const isCenter = node.id === "center";
      return (
        <g key={node.id} transform={`translate(${pos.x},${pos.y})`}>
          <circle
            r={isCenter ? 24 : 14}
            fill={isCenter ? "#4f46e5" : getNodeColor(node.type)}
            stroke={node.id === "center" ? "#312e81" : "none"}
            strokeWidth={2}
          />
          <text
            y={isCenter ? -34 : -24}
            textAnchor="middle"
            fontSize={isCenter ? 12 : 10}
            fill="currentColor"
          >
            {node.name}
          </text>
        </g>
      );
    });
  };

  const renderEdges = (edges: Array<{ from: string; to: string }>) => {
    const positions = calculatePositions(
      Array.from(new Set([...edges.flatMap((e) => [e.from, e.to])]))
        .map((id) => {
          const agent = topology?.agents.find((a) => a.id === id);
          return { id, name: agent?.type ?? "router", type: agent?.type ?? "router" };
        })
        .concat({ id: "center", name: "MUHAN AI Router", type: "router" })
    );
    return edges.map((edge, i) => {
      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return null;
      return (
        <line
          key={i}
          x1={fromPos.x}
          y1={fromPos.y}
          x2={toPos.x}
          y2={toPos.y}
          stroke="rgba(100,113,254,0.4)"
          strokeWidth={1.5}
          markerEnd="url(#arrowhead)"
        />
      );
    });
  };

  const calculatePositions = (nodes: Array<{ id: string }>) => {
    const centerX = 400;
    const centerY = 150;
    const radius = 110;
    const positions: Record<string, { x: number; y: number }> = {};

    nodes.forEach((node, i) => {
      if (node.id === "center") {
        positions[node.id] = { x: centerX, y: centerY };
        return;
      }
      const angle = (i / (nodes.length - 1)) * Math.PI * 2;
      positions[node.id] = {
        x: centerX + radius * Math.cos(angle - Math.PI / 2),
        y: centerY + radius * Math.sin(angle - Math.PI / 2),
      };
    });

    return positions;
  };

  const getNodeColor = (type: string) => {
    const colors: Record<string, string> = {
      llm: "#38bdf8",
      human: "#4ade80",
      mcp: "#facc15",
      compute: "#f97316",
      search: "#a8a29e",
      router: "#6366f1",
    };
    return colors[type] || "#94a3b8";
  };

  return (
    <Page
      title="Agent Mesh"
      subtitle={`${onlineCount} agents online — live from AgentRegistry`}
    >
      {!loading && renderTopology()}

      <div className="mesh-header">
        <h3>Live Agents</h3>
        <p>Connected to real AgentRegistry — {agents.filter((a) => a.health?.online).length} online</p>
      </div>

      <div className="agent-card-grid">
        {agents.map((a) => (
          <article className="mesh-card" key={a.id}>
            <div className="mesh-card-head">
              <strong>{a.name}</strong>
              <span className="mesh-status">
                {a.health?.online ? "● Online" : "○ Offline"}
              </span>
            </div>
            <p className="mesh-caps">
              {getTypeIcon(a.type)} {a.type} · {a.capabilities.join(" · ")}
            </p>
            <div className="mesh-meta">
              <span>지연: {(a.latencyMs / 1000).toFixed(2)}s</span>
              <span>타입: {a.type}</span>
              <span>비용: {a.cost}</span>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}


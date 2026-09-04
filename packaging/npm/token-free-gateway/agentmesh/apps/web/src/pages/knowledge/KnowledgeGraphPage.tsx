import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #5: Knowledge Graph
// =====================================================================
interface GraphNode {
  id: string;
  label: string;
  type: string;
}
interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

const NODE_EMOJI: Record<string, string> = {
  AI: "🤖",
  Agent: "🕸️",
  Human: "👤",
  Expert: "🎓",
  Knowledge: "📚",
  Source: "📄",
  Model: "📦",
  MCP: "🔌",
};

export function KnowledgeGraphPage() {
  const [graph, setGraph] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>({ nodes: [], edges: [] });

  useEffect(() => {
    load<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
      "/api/knowledge-graph",
    ).then((g) => g && setGraph(g));
  }, []);

  const byId = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );

  return (
    <SpecPage
      title="Knowledge Graph"
      subtitle="노드(AI·Agent·Human·Expert·Knowledge·Source·Model·MCP)와 관계 엣지"
    >
      <div className="kg-legend">
        {Object.entries(NODE_EMOJI).map(([type, emoji]) => (
          <span className="kg-legend-item" key={type}>
            {emoji} {type}
          </span>
        ))}
      </div>
      <div className="kg-canvas">
        {graph.nodes.map((node) => {
          const neighbors = graph.edges
            .filter((e) => e.source === node.id || e.target === node.id)
            .map((e) => (e.source === node.id ? e.target : e.source))
            .filter((id) => byId.has(id))
            .map((id) => byId.get(id)!.label);
          return (
            <div className={`kg-node ${node.type}`} key={node.id}>
              <span className="kg-node-icon">{NODE_EMOJI[node.type] ?? "⚫"}</span>
              <strong>{node.label}</strong>
              <span className="kg-node-type">{node.type}</span>
              {neighbors.length > 0 && (
                <div className="kg-connections">
                  {neighbors.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="kg-edges">
        {graph.edges.map((e) => (
          <div className="kg-edge" key={`${e.source}-${e.target}`}>
            <span>{byId.get(e.source)?.label ?? e.source}</span>
            <em>{e.relation}</em>
            <span>{byId.get(e.target)?.label ?? e.target}</span>
          </div>
        ))}
      </div>
    </SpecPage>
  );
}

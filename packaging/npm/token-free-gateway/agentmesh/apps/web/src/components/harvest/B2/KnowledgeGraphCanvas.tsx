import { useEffect, useRef, useState } from "react";

interface Node {
  id: string;
  label: string;
  kind: "agent" | "model" | "skill" | "knowledge";
}

interface Edge {
  source: string;
  target: string;
  label?: string;
}

const NODES: Node[] = [
  { id: "gemini", label: "Gemini Research", kind: "agent" },
  { id: "claude", label: "Claude Analysis", kind: "agent" },
  { id: "rag", label: "RAG Store", kind: "knowledge" },
  { id: "embed", label: "Embedding", kind: "model" },
  { id: "search", label: "Federated Search", kind: "skill" },
];

const EDGES: Edge[] = [
  { source: "gemini", target: "rag", label: "reads" },
  { source: "claude", target: "rag", label: "writes" },
  { source: "rag", target: "embed", label: "vectors" },
  { source: "search", target: "rag", label: "queries" },
  { source: "search", target: "embed", label: "uses" },
];

const KIND_COLORS: Record<Node["kind"], string> = {
  agent: "#e6ff87",
  model: "#3b82f6",
  skill: "#f59e0b",
  knowledge: "#10b981",
};

export function KnowledgeGraphCanvas() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const width = svg.clientWidth || 800;
    const height = 500;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const positions = new Map<string, { x: number; y: number }>();
    NODES.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / NODES.length - Math.PI / 2;
      positions.set(node.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });

    const edgesEl = EDGES.map((edge, i) => {
      const source = positions.get(edge.source)!;
      const target = positions.get(edge.target)!;
      const mx = (source.x + target.x) / 2;
      const my = (source.y + target.y) / 2;
      return (
        <g key={`edge-${i}`}>
          <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#27272a" strokeWidth="1.5" />
          {edge.label && (
            <text x={mx} y={my} textAnchor="middle" dy="-4" className="text-[10px] fill-gray-500 font-mono">
              {edge.label}
            </text>
          )}
        </g>
      );
    });

    const nodesEl = NODES.map((node) => {
      const pos = positions.get(node.id)!;
      const isHovered = hovered === node.id;
      return (
        <g key={node.id} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)}>
          <circle cx={pos.x} cy={pos.y} r={isHovered ? 10 : 8} fill={KIND_COLORS[node.kind]} />
          <text x={pos.x} y={pos.y + 20} textAnchor="middle" className={`text-xs font-mono ${isHovered ? "fill-white" : "fill-gray-400"}`}>
            {node.label}
          </text>
        </g>
      );
    });

    svg.innerHTML = `
      <rect width="100%" height="100%" fill="#0a0a0a" />
      ${edgesEl.map((el) => el.outerHTML).join("")}
      ${nodesEl.map((el) => el.outerHTML).join("")}
    `;
  }, [hovered]);

  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">KNOWLEDGE / GRAPH</span>
        <h2>Knowledge <em>Graph</em></h2>
      </div>
      <svg ref={svgRef} className="w-full" style={{ height: 420, border: "1px solid #1f1f1f", borderRadius: 12 }} />
    </section>
  );
}

export default KnowledgeGraphCanvas;

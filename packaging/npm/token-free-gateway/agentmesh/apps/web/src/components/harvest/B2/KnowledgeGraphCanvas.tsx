import { useState } from "react";

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
	const [hovered, setHovered] = useState<string | null>(null);

	const width = 800;
	const height = 420;
	const cx = width / 2;
	const cy = height / 2;
	const radius = Math.min(width, height) * 0.35;

	const positions = new Map<string, { x: number; y: number }>();
	NODES.forEach((node, i) => {
		const angle = (2 * Math.PI * i) / NODES.length - Math.PI / 2;
		positions.set(node.id, {
			x: cx + radius * Math.cos(angle),
			y: cy + radius * Math.sin(angle),
		});
	});

	return (
		<section className="panel">
			<div className="section-heading compact">
				<span className="section-label">KNOWLEDGE / GRAPH</span>
				<h2>
					Knowledge <em>Graph</em>
				</h2>
			</div>
			<svg
				viewBox={`0 0 ${width} ${height}`}
				className="w-full"
				style={{
					height: 420,
					border: "1px solid #1f1f1f",
					borderRadius: 12,
					background: "#0a0a0a",
				}}
			>
				{EDGES.map((edge, i) => {
					const source = positions.get(edge.source);
					const target = positions.get(edge.target);
					if (!source || !target) return null;
					const mx = (source.x + target.x) / 2;
					const my = (source.y + target.y) / 2;
					return (
						<g key={`edge-${i}`}>
							<line
								x1={source.x}
								y1={source.y}
								x2={target.x}
								y2={target.y}
								stroke="#27272a"
								strokeWidth="1.5"
							/>
							{edge.label && (
								<text
									x={mx}
									y={my}
									textAnchor="middle"
									dy="-4"
									fill="#71717a"
									fontSize="10"
									fontFamily="monospace"
								>
									{edge.label}
								</text>
							)}
						</g>
					);
				})}
				{NODES.map((node) => {
					const pos = positions.get(node.id);
					if (!pos) return null;
					const isHovered = hovered === node.id;
					return (
						<g
							key={node.id}
							onMouseEnter={() => setHovered(node.id)}
							onMouseLeave={() => setHovered(null)}
							style={{ cursor: "pointer" }}
						>
							<circle
								cx={pos.x}
								cy={pos.y}
								r={isHovered ? 12 : 8}
								fill={KIND_COLORS[node.kind]}
								stroke={isHovered ? "#ffffff" : "#18181b"}
								strokeWidth={2}
							/>
							<text
								x={pos.x}
								y={pos.y + 22}
								textAnchor="middle"
								fill={isHovered ? "#ffffff" : "#a1a1aa"}
								fontSize="12"
								fontFamily="monospace"
							>
								{node.label}
							</text>
						</g>
					);
				})}
			</svg>
		</section>
	);
}

export default KnowledgeGraphCanvas;

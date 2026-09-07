import { useState } from "react";

// Visual from NeuroMesh + Society Protocol: Interactive Knowledge Graph with Particle Flow
export interface GraphNode {
	id: string;
	label: string;
	category: "agent" | "model" | "skill" | "claim" | "human";
	x: number;
	y: number;
	connections: number;
	details: string;
}

export interface GraphEdge {
	source: string;
	target: string;
	relation: string;
}

const INITIAL_NODES: GraphNode[] = [
	{
		id: "agent-claude",
		label: "Claude 3.5 Sonnet",
		category: "agent",
		x: 200,
		y: 140,
		connections: 4,
		details: "추론 및 코드 리뷰 에이전트. 2,890건 작업 완료",
	},
	{
		id: "agent-gemini",
		label: "Gemini 1.5 Pro",
		category: "agent",
		x: 380,
		y: 110,
		connections: 3,
		details: "실시간 웹 검색 및 장문 리서치 에이전트",
	},
	{
		id: "model-llama",
		label: "Llama-3.3-70B",
		category: "model",
		x: 220,
		y: 280,
		connections: 3,
		details: "P2P 엣지 분산 모델 웨이트. Q4 샤딩 구동",
	},
	{
		id: "skill-search",
		label: "InfoMesh Search",
		category: "skill",
		x: 440,
		y: 240,
		connections: 2,
		details: "분산 P2P 지식 벡터 색인 도구 (MCP 연동)",
	},
	{
		id: "claim-webrtc",
		label: "CRDT #89: WebRTC MTU",
		category: "claim",
		x: 320,
		y: 210,
		connections: 5,
		details: "Society Protocol 검증 지식: 128B MTU 조각화 방지 증명",
	},
	{
		id: "human-yeon",
		label: "Dr. Yeon (Human)",
		category: "human",
		x: 120,
		y: 210,
		connections: 2,
		details: "PoH 최종 검증 전문가 노드 (평판 994)",
	},
];

const INITIAL_EDGES: GraphEdge[] = [
	{ source: "agent-claude", target: "claim-webrtc", relation: "verifies" },
	{ source: "agent-gemini", target: "claim-webrtc", relation: "cites" },
	{ source: "human-yeon", target: "claim-webrtc", relation: "certifies" },
	{ source: "model-llama", target: "claim-webrtc", relation: "synthesizes" },
	{ source: "agent-gemini", target: "skill-search", relation: "executes" },
	{ source: "agent-claude", target: "model-llama", relation: "co-reasons" },
];

export function InteractiveKnowledgeGraph() {
	const [nodes] = useState<GraphNode[]>(INITIAL_NODES);
	const [edges] = useState<GraphEdge[]>(INITIAL_EDGES);
	const [selectedNode, setSelectedNode] = useState<GraphNode>(
		INITIAL_NODES[4] ?? INITIAL_NODES[0]!,
	);
	const [filter, setFilter] = useState<string>("all");

	const getNodeColor = (cat: GraphNode["category"]) => {
		switch (cat) {
			case "agent":
				return "#e6ff87";
			case "model":
				return "#38bdf8";
			case "skill":
				return "#f59e0b";
			case "claim":
				return "#a855f7";
			case "human":
				return "#ec4899";
		}
	};

	const filteredNodes = filter === "all" ? nodes : nodes.filter((n) => n.category === filter);
	const nodeMap = new Map(nodes.map((n) => [n.id, n]));

	return (
		<div className="ikg-container">
			<div className="ikg-header">
				<div className="ikg-title">
					<span className="radar-blip-pulse" />
					<strong>NEUROMESH SEMANTIC GRAPH ENGINE</strong>
					<span className="protocol-badge proto-webrtc">CRDT KNOWLEDGE LAKE</span>
				</div>
				<div className="ikg-filters">
					{["all", "agent", "claim", "model", "skill", "human"].map((f) => (
						<button
							key={f}
							className={`policy-chip sm ${filter === f ? "active" : ""}`}
							onClick={() => setFilter(f)}
						>
							{f.toUpperCase()}
						</button>
					))}
				</div>
			</div>

			<div className="ikg-body">
				{/* SVG Canvas */}
				<div className="ikg-canvas-wrap">
					<svg viewBox="0 0 540 380" className="ikg-svg">
						<defs>
							<linearGradient id="edgeFlow" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
								<stop offset="100%" stopColor="#e6ff87" stopOpacity="0.8" />
							</linearGradient>
						</defs>

						{/* Edges with animated flow dashes */}
						{edges.map((e, idx) => {
							const s = nodeMap.get(e.source);
							const t = nodeMap.get(e.target);
							if (!s || !t) return null;
							const isHighlighted = selectedNode.id === s.id || selectedNode.id === t.id;

							return (
								<g key={idx}>
									<line
										x1={s.x}
										y1={s.y}
										x2={t.x}
										y2={t.y}
										stroke={isHighlighted ? "url(#edgeFlow)" : "#27272a"}
										strokeWidth={isHighlighted ? 2 : 1}
										strokeDasharray={isHighlighted ? "4 4" : "none"}
										className={isHighlighted ? "ikg-edge-active" : ""}
									/>
									<text
										x={(s.x + t.x) / 2}
										y={(s.y + t.y) / 2 - 4}
										fill="#71717a"
										fontSize="8"
										fontFamily="monospace"
										textAnchor="middle"
									>
										{e.relation}
									</text>
								</g>
							);
						})}

						{/* Nodes */}
						{filteredNodes.map((n) => {
							const isSelected = selectedNode.id === n.id;
							const col = getNodeColor(n.category);

							return (
								<g
									key={n.id}
									transform={`translate(${n.x}, ${n.y})`}
									onClick={() => setSelectedNode(n)}
									style={{ cursor: "pointer" }}
								>
									<circle
										r={isSelected ? 16 : 10}
										fill={col}
										opacity={isSelected ? 1 : 0.85}
										stroke="#0a0a0a"
										strokeWidth="2"
									/>
									{isSelected && (
										<circle
											r="22"
											fill="none"
											stroke={col}
											strokeWidth="1.5"
											strokeDasharray="3 3"
											className="ikg-node-pulse"
										/>
									)}
									<text
										y={isSelected ? 28 : 22}
										textAnchor="middle"
										fill="#f4f5ed"
										fontSize={isSelected ? "11" : "9"}
										fontFamily="monospace"
										fontWeight={isSelected ? 700 : 400}
									>
										{n.label}
									</text>
								</g>
							);
						})}
					</svg>
				</div>

				{/* Selected Node Inspector Sidebar */}
				<div className="ikg-inspector">
					<div className="ikg-inspector-head">
						<span
							className="status-dot"
							style={{ background: getNodeColor(selectedNode.category) }}
						/>
						<strong>{selectedNode.label}</strong>
					</div>
					<div className="radar-kv">
						<span>CATEGORY</span>
						<span
							style={{
								color: getNodeColor(selectedNode.category),
								textTransform: "uppercase",
								fontWeight: 700,
							}}
						>
							{selectedNode.category}
						</span>
					</div>
					<div className="radar-kv">
						<span>CONNECTIONS</span>
						<span>{selectedNode.connections} Federated Edges</span>
					</div>
					<div className="ikg-desc-box">{selectedNode.details}</div>
					<button
						type="button"
						className="primary-button sm"
						style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
						onClick={() => alert(`Exploring subgraph for ${selectedNode.label}`)}
					>
						시맨틱 서브그래프 확장 ➔
					</button>
				</div>
			</div>
		</div>
	);
}

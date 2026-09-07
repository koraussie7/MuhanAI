import { RefreshCw, Wifi, Zap } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

export interface P2PNode {
	id: string;
	name: string;
	type: "gateway" | "model" | "peer" | "human";
	protocol: "webrtc" | "libp2p" | "websocket" | "direct";
	status: "connected" | "syncing" | "idle";
	latencyMs: number;
	bandwidth: string;
	region: string;
	reputation: number;
	capabilities: string[];
	x: number;
	y: number;
	radius: number;
}

export interface P2PEdge {
	from: string;
	to: string;
	protocol: "webrtc" | "libp2p" | "relay" | "direct";
	bandwidth: string;
	active: boolean;
}

const INITIAL_NODES: P2PNode[] = [
	// Center Hub
	{
		id: "gateway-core",
		name: "Token-Free Gateway Hub",
		type: "gateway",
		protocol: "direct",
		status: "connected",
		latencyMs: 4,
		bandwidth: "2.4 Gbps",
		region: "Edge Zone (Seoul)",
		reputation: 99.9,
		capabilities: ["Consensus Hub", "Zero-Token Routing", "Session Vault"],
		x: 400,
		y: 220,
		radius: 18,
	},
	// Reasoning Models (Top & Sides)
	{
		id: "model-claude",
		name: "Claude 3.7 Sonnet Node",
		type: "model",
		protocol: "direct",
		status: "connected",
		latencyMs: 24,
		bandwidth: "840 Mbps",
		region: "US-West Relay",
		reputation: 99.8,
		capabilities: ["Architecture", "TypeScript", "AST Code Gen"],
		x: 400,
		y: 70,
		radius: 14,
	},
	{
		id: "model-deepseek",
		name: "DeepSeek R1 Peer",
		type: "model",
		protocol: "libp2p",
		status: "connected",
		latencyMs: 38,
		bandwidth: "620 Mbps",
		region: "Asia-East Relay",
		reputation: 98.9,
		capabilities: ["Deep Logic", "Math Quorum", "Formal Verification"],
		x: 230,
		y: 110,
		radius: 14,
	},
	{
		id: "model-gemini",
		name: "Gemini 2.5 Pro Lake Node",
		type: "model",
		protocol: "direct",
		status: "connected",
		latencyMs: 19,
		bandwidth: "750 Mbps",
		region: "Global Edge",
		reputation: 99.1,
		capabilities: ["Web Search", "Multi-Modal", "Grounding"],
		x: 570,
		y: 110,
		radius: 14,
	},
	// Edge Browser Peers (Bottom Ring)
	{
		id: "peer-edge-1",
		name: "WebGPU Edge Peer #104",
		type: "peer",
		protocol: "webrtc",
		status: "connected",
		latencyMs: 14,
		bandwidth: "120 Mbps",
		region: "Tokyo / WebRTC DC",
		reputation: 96.5,
		capabilities: ["Llama 3.3 8B", "WebGPU Int8", "P2P Gossip"],
		x: 180,
		y: 260,
		radius: 11,
	},
	{
		id: "peer-edge-2",
		name: "Browser Relay Node #412",
		type: "peer",
		protocol: "webrtc",
		status: "connected",
		latencyMs: 32,
		bandwidth: "95 Mbps",
		region: "Singapore / Mesh",
		reputation: 95.2,
		capabilities: ["P2P Routing", "CRDT Sync", "DHT Shard"],
		x: 260,
		y: 360,
		radius: 10,
	},
	{
		id: "peer-edge-3",
		name: "Edge Cache Node #889",
		type: "peer",
		protocol: "libp2p",
		status: "connected",
		latencyMs: 44,
		bandwidth: "160 Mbps",
		region: "Seoul / libp2p",
		reputation: 97.0,
		capabilities: ["Embedding Cache", "Vector Index", "Kademlia"],
		x: 540,
		y: 360,
		radius: 10,
	},
	{
		id: "peer-edge-4",
		name: "Local Node #017 (You)",
		type: "peer",
		protocol: "webrtc",
		status: "connected",
		latencyMs: 6,
		bandwidth: "480 Mbps",
		region: "Local Workspace",
		reputation: 100,
		capabilities: ["Active Workspace", "RPC Peer", "Token-Free"],
		x: 630,
		y: 260,
		radius: 13,
	},
	// Human Validator
	{
		id: "human-validator",
		name: "Expert Validator Cluster",
		type: "human",
		protocol: "webrtc",
		status: "connected",
		latencyMs: 52,
		bandwidth: "45 Mbps",
		region: "Global Human Mesh",
		reputation: 99.4,
		capabilities: ["Experience Verification", "Fact Checking", "Dispute Resolution"],
		x: 400,
		y: 380,
		radius: 12,
	},
];

const INITIAL_EDGES: P2PEdge[] = [
	{
		from: "gateway-core",
		to: "model-claude",
		protocol: "direct",
		bandwidth: "840 Mbps",
		active: true,
	},
	{
		from: "gateway-core",
		to: "model-deepseek",
		protocol: "libp2p",
		bandwidth: "620 Mbps",
		active: true,
	},
	{
		from: "gateway-core",
		to: "model-gemini",
		protocol: "direct",
		bandwidth: "750 Mbps",
		active: true,
	},
	{
		from: "gateway-core",
		to: "peer-edge-1",
		protocol: "webrtc",
		bandwidth: "120 Mbps",
		active: true,
	},
	{
		from: "gateway-core",
		to: "peer-edge-4",
		protocol: "webrtc",
		bandwidth: "480 Mbps",
		active: true,
	},
	{
		from: "gateway-core",
		to: "human-validator",
		protocol: "webrtc",
		bandwidth: "45 Mbps",
		active: true,
	},
	// Cross peer-to-peer links (Mesh)
	{
		from: "model-claude",
		to: "model-deepseek",
		protocol: "libp2p",
		bandwidth: "400 Mbps",
		active: true,
	},
	{
		from: "model-claude",
		to: "model-gemini",
		protocol: "direct",
		bandwidth: "500 Mbps",
		active: true,
	},
	{
		from: "peer-edge-1",
		to: "peer-edge-2",
		protocol: "webrtc",
		bandwidth: "80 Mbps",
		active: true,
	},
	{
		from: "peer-edge-2",
		to: "human-validator",
		protocol: "webrtc",
		bandwidth: "40 Mbps",
		active: true,
	},
	{
		from: "peer-edge-3",
		to: "human-validator",
		protocol: "libp2p",
		bandwidth: "60 Mbps",
		active: true,
	},
	{
		from: "peer-edge-4",
		to: "peer-edge-3",
		protocol: "libp2p",
		bandwidth: "110 Mbps",
		active: true,
	},
];

export const P2PConnectionGraph: React.FC = () => {
	const [nodes, setNodes] = useState<P2PNode[]>(INITIAL_NODES);
	const [edges] = useState<P2PEdge[]>(INITIAL_EDGES);
	const [selectedNodeId, setSelectedNodeId] = useState<string>("gateway-core");
	const [filter, setFilter] = useState<"all" | "webrtc" | "libp2p" | "direct">("all");
	const [packetOffset, setPacketOffset] = useState<number>(0);
	const [pingPulse, setPingPulse] = useState<boolean>(false);

	// Animated packet flow
	useEffect(() => {
		let animId: number;
		const animate = () => {
			setPacketOffset((prev) => (prev + 0.008) % 1);
			animId = requestAnimationFrame(animate);
		};
		animId = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animId);
	}, []);

	const selectedNode = useMemo(
		() => nodes.find((n) => n.id === selectedNodeId) ?? nodes[0],
		[nodes, selectedNodeId],
	);

	const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

	const filteredEdges = useMemo(() => {
		if (filter === "all") return edges;
		return edges.filter((e) => e.protocol === filter);
	}, [edges, filter]);

	const triggerPing = () => {
		setPingPulse(true);
		setNodes((prev) =>
			prev.map((n) => ({
				...n,
				latencyMs: Math.max(3, Math.round(n.latencyMs + (Math.random() * 8 - 4))),
			})),
		);
		setTimeout(() => setPingPulse(false), 800);
	};

	const getNodeColor = (type: P2PNode["type"]) => {
		switch (type) {
			case "gateway":
				return "#0ea5e9"; // Cyan
			case "model":
				return "#8b5cf6"; // Indigo/Violet
			case "peer":
				return "#10b981"; // Emerald Green
			case "human":
				return "#f59e0b"; // Amber
		}
	};

	return (
		<div className="p2p-graph-container">
			{/* Graph Toolbar Header */}
			<div className="p2p-graph-header">
				<div className="p2p-header-left">
					<div className="p2p-live-badge">
						<span className="pulse-dot" />
						<span>P2P MESH TOPOLOGY</span>
					</div>
					<span className="p2p-stats-summary">
						12,482 Peers Online · WebRTC & libp2p DHT Active
					</span>
				</div>

				<div className="p2p-header-right">
					{/* Protocol Filters */}
					<div className="p2p-filter-pills">
						{(["all", "webrtc", "libp2p", "direct"] as const).map((proto) => (
							<button
								key={proto}
								type="button"
								className={`p2p-pill-btn ${filter === proto ? "active" : ""}`}
								onClick={() => setFilter(proto)}
							>
								{proto.toUpperCase()}
							</button>
						))}
					</div>

					<button
						type="button"
						className="p2p-ping-btn"
						onClick={triggerPing}
						title="Mesh Latency Ping"
					>
						<RefreshCw size={13} className={pingPulse ? "spin" : ""} />
						<span>Ping All</span>
					</button>
				</div>
			</div>

			{/* Main Graph Body */}
			<div className="p2p-graph-body">
				{/* SVG Canvas */}
				<div className="p2p-canvas-wrapper">
					<svg
						viewBox="0 0 800 440"
						className="p2p-topology-svg"
						role="img"
						aria-label="P2P Connection Topology Graph"
					>
						<defs>
							{/* Radial Background Grid Glow */}
							<radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
								<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.12" />
								<stop offset="60%" stopColor="#6366f1" stopOpacity="0.04" />
								<stop offset="100%" stopColor="#090d16" stopOpacity="0" />
							</radialGradient>

							{/* Edge Gradient */}
							<linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
								<stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.6" />
								<stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.6" />
							</linearGradient>

							<filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
								<feGaussianBlur stdDeviation="3" result="blur" />
								<feComposite in="SourceGraphic" in2="blur" operator="over" />
							</filter>
						</defs>

						{/* Background Glow */}
						<circle cx="400" cy="220" r="280" fill="url(#centerGlow)" />

						{/* Orbit Guides */}
						<circle
							cx="400"
							cy="220"
							r="140"
							fill="none"
							stroke="rgba(255, 255, 255, 0.04)"
							strokeDasharray="3 6"
						/>
						<circle
							cx="400"
							cy="220"
							r="200"
							fill="none"
							stroke="rgba(255, 255, 255, 0.03)"
							strokeDasharray="4 8"
						/>

						{/* Edges with Animated Packets */}
						{filteredEdges.map((e, idx) => {
							const src = nodeMap.get(e.from);
							const tgt = nodeMap.get(e.to);
							if (!src || !tgt) return null;

							const isHighlighted = selectedNodeId === src.id || selectedNodeId === tgt.id;

							// Calculate packet position
							const packetX = src.x + (tgt.x - src.x) * packetOffset;
							const packetY = src.y + (tgt.y - src.y) * packetOffset;

							return (
								<g key={`edge-${idx}`}>
									{/* Connection Line */}
									<line
										x1={src.x}
										y1={src.y}
										x2={tgt.x}
										y2={tgt.y}
										stroke={isHighlighted ? "url(#edgeGrad)" : "rgba(255, 255, 255, 0.12)"}
										strokeWidth={isHighlighted ? 2 : 1}
										strokeDasharray={
											e.protocol === "webrtc" ? "4 3" : e.protocol === "libp2p" ? "2 2" : "none"
										}
									/>

									{/* Animated Data Packet */}
									{isHighlighted && (
										<circle
											cx={packetX}
											cy={packetY}
											r="3.5"
											fill="#38bdf8"
											filter="url(#glowEffect)"
										/>
									)}
								</g>
							);
						})}

						{/* Nodes */}
						{nodes.map((n) => {
							const isSelected = selectedNodeId === n.id;
							const color = getNodeColor(n.type);

							return (
								<g
									key={n.id}
									className="p2p-node-group"
									onClick={() => setSelectedNodeId(n.id)}
									style={{ cursor: "pointer" }}
								>
									{/* Halo when selected */}
									{isSelected && (
										<circle
											cx={n.x}
											cy={n.y}
											r={n.radius + 8}
											fill="none"
											stroke={color}
											strokeWidth="2"
											opacity="0.6"
											strokeDasharray="4 3"
											className="p2p-node-halo"
										/>
									)}

									{/* Core Node Circle */}
									<circle
										cx={n.x}
										cy={n.y}
										r={n.radius}
										fill="#0f172a"
										stroke={color}
										strokeWidth={isSelected ? 3 : 2}
										filter={isSelected ? "url(#glowEffect)" : undefined}
									/>

									{/* Node Center Dot */}
									<circle cx={n.x} cy={n.y} r={n.radius * 0.45} fill={color} />

									{/* Label */}
									<text
										x={n.x}
										y={n.y + n.radius + 13}
										textAnchor="middle"
										fill={isSelected ? "#f8fafc" : "#94a3b8"}
										fontSize={isSelected ? "11" : "10"}
										fontWeight={isSelected ? "600" : "400"}
										fontFamily="var(--cline-font-sans)"
									>
										{n.name}
									</text>

									{/* Protocol Badge */}
									<text
										x={n.x}
										y={n.y + n.radius + 24}
										textAnchor="middle"
										fill="#64748b"
										fontSize="8.5"
										fontFamily="var(--cline-font-mono)"
									>
										{n.protocol.toUpperCase()} · {n.latencyMs}ms
									</text>
								</g>
							);
						})}
					</svg>

					{/* Bottom Protocol Legend */}
					<div className="p2p-graph-legend">
						<span className="legend-item">
							<i className="legend-dot" style={{ background: "#0ea5e9" }} /> Gateway Hub
						</span>
						<span className="legend-item">
							<i className="legend-dot" style={{ background: "#8b5cf6" }} /> Reasoning Models
						</span>
						<span className="legend-item">
							<i className="legend-dot" style={{ background: "#10b981" }} /> Edge Browser Peers
						</span>
						<span className="legend-item">
							<i className="legend-dot" style={{ background: "#f59e0b" }} /> Human Validators
						</span>
						<span className="legend-item subtle">
							<Wifi size={12} /> WebRTC DataChannels · libp2p Gossipsub
						</span>
					</div>
				</div>

				{/* Selected Peer Inspector Drawer */}
				{selectedNode && (
					<aside className="p2p-node-inspector">
						<div className="inspector-head">
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<span
									style={{
										width: 8,
										height: 8,
										borderRadius: "50%",
										background: getNodeColor(selectedNode.type),
									}}
								/>
								<strong style={{ fontSize: 13, color: "#f8fafc" }}>{selectedNode.name}</strong>
							</div>
							<span className={`inspector-status-badge ${selectedNode.status}`}>
								{selectedNode.status.toUpperCase()}
							</span>
						</div>

						<div className="inspector-metrics-grid">
							<div className="inspector-metric-card">
								<span className="metric-lbl">Latency</span>
								<span className="metric-val" style={{ color: "var(--cline-green)" }}>
									{selectedNode.latencyMs} ms
								</span>
							</div>
							<div className="inspector-metric-card">
								<span className="metric-lbl">Bandwidth</span>
								<span className="metric-val">{selectedNode.bandwidth}</span>
							</div>
							<div className="inspector-metric-card">
								<span className="metric-lbl">Protocol</span>
								<span className="metric-val">{selectedNode.protocol.toUpperCase()}</span>
							</div>
							<div className="inspector-metric-card">
								<span className="metric-lbl">Reputation</span>
								<span className="metric-val" style={{ color: "var(--cline-sky)" }}>
									{selectedNode.reputation}%
								</span>
							</div>
						</div>

						<div className="inspector-section">
							<span className="inspector-sec-title">ZONE / REGION</span>
							<span className="inspector-sec-val">{selectedNode.region}</span>
						</div>

						<div className="inspector-section">
							<span className="inspector-sec-title">CAPABILITIES</span>
							<div className="inspector-caps-wrap">
								{selectedNode.capabilities.map((cap) => (
									<span key={cap} className="inspector-cap-chip">
										{cap}
									</span>
								))}
							</div>
						</div>

						<div className="inspector-footer">
							<button type="button" className="inspector-action-btn" onClick={triggerPing}>
								<Zap size={13} />
								Send RPC Ping
							</button>
						</div>
					</aside>
				)}
			</div>
		</div>
	);
};

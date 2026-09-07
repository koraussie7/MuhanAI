import { useEffect, useState } from "react";

// Visual from ISEK + LLMesh: 360-degree P2P Swarm Radar with sweeping scanner
export interface RadarNode {
	id: string;
	name: string;
	angle: number; // degrees 0 - 360
	distance: number; // 0 - 100 (% of radius)
	type: "agent" | "human" | "p2p" | "gateway";
	latency: number; // ms
	did: string;
}

const INITIAL_NODES: RadarNode[] = [
	{
		id: "n1",
		name: "Claude-3.5-Analyzer",
		angle: 45,
		distance: 35,
		type: "agent",
		latency: 18,
		did: "did:muhan:agent:claude-35",
	},
	{
		id: "n2",
		name: "Gemini-Flash-Search",
		angle: 120,
		distance: 60,
		type: "agent",
		latency: 24,
		did: "did:muhan:agent:gemini-fl",
	},
	{
		id: "n3",
		name: "Seoul-Validator-KR",
		angle: 210,
		distance: 20,
		type: "human",
		latency: 8,
		did: "did:muhan:human:kr-01",
	},
	{
		id: "n4",
		name: "Tokyo-Gpu-Inference",
		angle: 280,
		distance: 75,
		type: "p2p",
		latency: 42,
		did: "did:muhan:p2p:tokyo-gpu",
	},
	{
		id: "n5",
		name: "US-West-Router-01",
		angle: 330,
		distance: 88,
		type: "gateway",
		latency: 110,
		did: "did:muhan:gw:us-west",
	},
	{
		id: "n6",
		name: "Frankfurt-Auditor",
		angle: 165,
		distance: 82,
		type: "p2p",
		latency: 165,
		did: "did:muhan:p2p:fra-node",
	},
];

export function SwarmRadar() {
	const [nodes] = useState<RadarNode[]>(INITIAL_NODES);
	const [selectedNode, setSelectedNode] = useState<RadarNode | null>(INITIAL_NODES[0] ?? null);
	const [sweepAngle, setSweepAngle] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setSweepAngle((prev) => (prev + 3) % 360);
		}, 50);
		return () => clearInterval(timer);
	}, []);

	const center = 160;
	const radius = 135;

	const getColor = (type: RadarNode["type"]) => {
		switch (type) {
			case "agent":
				return "#e6ff87"; // neon lime
			case "human":
				return "#9ae6ff"; // cyan
			case "p2p":
				return "#ffb86b"; // orange
			case "gateway":
				return "#d97706"; // amber
		}
	};

	return (
		<div className="visual-radar-card">
			<div className="visual-radar-head">
				<div className="visual-radar-title">
					<span className="radar-blip-pulse" />
					<strong>SWARM DISCOVERY RADAR</strong>
					<span className="protocol-badge proto-webrtc">360° LIVE A2A</span>
				</div>
				<div className="radar-coords">FREQ: 2.4GHz MESH · NODES: {nodes.length} ONLINE</div>
			</div>

			<div className="visual-radar-body">
				<div className="radar-canvas-wrap">
					<svg viewBox="0 0 320 320" className="radar-svg">
						<defs>
							<radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
								<stop offset="0%" stopColor="rgba(230,255,135,0.12)" />
								<stop offset="70%" stopColor="rgba(230,255,135,0.03)" />
								<stop offset="100%" stopColor="transparent" />
							</radialGradient>
							<linearGradient
								id="sweepGradient"
								gradientTransform={`rotate(${sweepAngle} 160 160)`}
							>
								<stop offset="0%" stopColor="rgba(230, 255, 135, 0.4)" />
								<stop offset="100%" stopColor="transparent" />
							</linearGradient>
						</defs>

						{/* Background Grid & Range Rings */}
						<circle
							cx={center}
							cy={center}
							r={radius}
							fill="url(#radarGlow)"
							stroke="#263319"
							strokeWidth="1.5"
						/>
						<circle
							cx={center}
							cy={center}
							r={radius * 0.75}
							fill="none"
							stroke="#1f2914"
							strokeWidth="1"
							strokeDasharray="3 3"
						/>
						<circle
							cx={center}
							cy={center}
							r={radius * 0.5}
							fill="none"
							stroke="#1f2914"
							strokeWidth="1"
						/>
						<circle
							cx={center}
							cy={center}
							r={radius * 0.25}
							fill="none"
							stroke="#1f2914"
							strokeWidth="1"
							strokeDasharray="3 3"
						/>

						{/* Crosshairs */}
						<line
							x1={center}
							y1={center - radius}
							x2={center}
							y2={center + radius}
							stroke="#1f2914"
							strokeWidth="1"
						/>
						<line
							x1={center - radius}
							y1={center}
							x2={center + radius}
							y2={center}
							stroke="#1f2914"
							strokeWidth="1"
						/>
						<line
							x1={center - radius * 0.7}
							y1={center - radius * 0.7}
							x2={center + radius * 0.7}
							y2={center + radius * 0.7}
							stroke="#151c0d"
							strokeWidth="0.8"
						/>
						<line
							x1={center - radius * 0.7}
							y1={center + radius * 0.7}
							x2={center + radius * 0.7}
							y2={center - radius * 0.7}
							stroke="#151c0d"
							strokeWidth="0.8"
						/>

						{/* Rotating Sweep Beam */}
						<g transform={`rotate(${sweepAngle} ${center} ${center})`}>
							<path
								d={`M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 0 1 ${center + radius * 0.5} ${center - radius * 0.866} Z`}
								fill="url(#sweepGradient)"
								opacity="0.6"
							/>
							<line
								x1={center}
								y1={center}
								x2={center - radius}
								stroke="#e6ff87"
								strokeWidth="1.5"
								opacity="0.8"
							/>
						</g>

						{/* Central Gateway Hub */}
						<circle cx={center} cy={center} r="5" fill="#e6ff87" />
						<circle
							cx={center}
							cy={center}
							r="9"
							fill="none"
							stroke="#e6ff87"
							strokeWidth="1"
							opacity="0.6"
						/>

						{/* Nodes Blips */}
						{nodes.map((node) => {
							const rad = ((node.angle - 90) * Math.PI) / 180;
							const dist = (node.distance / 100) * radius;
							const nx = center + dist * Math.cos(rad);
							const ny = center + dist * Math.sin(rad);
							const isSel = selectedNode?.id === node.id;

							return (
								<g
									key={node.id}
									className="radar-blip-group"
									onClick={() => setSelectedNode(node)}
									style={{ cursor: "pointer" }}
								>
									<circle cx={nx} cy={ny} r={isSel ? 7 : 4} fill={getColor(node.type)} />
									{isSel && (
										<circle
											cx={nx}
											cy={ny}
											r="11"
											fill="none"
											stroke={getColor(node.type)}
											strokeWidth="1.5"
											className="radar-blip-selected"
										/>
									)}
									<text
										x={nx}
										y={ny + 14}
										textAnchor="middle"
										fontSize="8"
										fill="#d1d5db"
										fontFamily="monospace"
									>
										{node.name.split("-")[0]}
									</text>
								</g>
							);
						})}
					</svg>
				</div>

				{/* Target Inspector Card */}
				{selectedNode && (
					<div className="radar-inspect-box">
						<div className="radar-inspect-title">
							<span className="status-dot online" />
							<strong>{selectedNode.name}</strong>
						</div>
						<div className="radar-kv">
							<span>DID</span>
							<code>{selectedNode.did}</code>
						</div>
						<div className="radar-kv">
							<span>TYPE</span>
							<span
								style={{
									color: getColor(selectedNode.type),
									textTransform: "uppercase",
									fontWeight: 600,
								}}
							>
								{selectedNode.type}
							</span>
						</div>
						<div className="radar-kv">
							<span>BEARING</span>
							<span>
								{selectedNode.angle}° · {selectedNode.distance}% Range
							</span>
						</div>
						<div className="radar-kv">
							<span>LATENCY</span>
							<span style={{ color: "#e6ff87", fontWeight: 700 }}>{selectedNode.latency} ms</span>
						</div>
						<button
							type="button"
							className="primary-button sm"
							style={{ width: "100%", marginTop: 8, justifyContent: "center" }}
							onClick={() => alert(`A2A Direct Handshake ping sent to ${selectedNode.did}`)}
						>
							A2A 직결 핑 발송 ➔
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

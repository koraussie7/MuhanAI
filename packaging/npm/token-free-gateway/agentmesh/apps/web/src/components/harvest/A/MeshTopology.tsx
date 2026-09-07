// LLMesh + ISEK-inspired: Browser Mesh / libp2p Peer Grid / Topology
export type MeshNode = {
	id: string;
	label: string;
	kind: "browser" | "gateway" | "p2p" | "local";
	status: "online" | "offline";
	degree: number;
};

export type MeshEdge = { from: string; to: string };

export function MeshTopology({
	nodes,
	edges,
	onSelect,
}: {
	nodes: MeshNode[];
	edges: MeshEdge[];
	onSelect?: (id: string) => void;
}) {
	// Simple force-ish layout: circle + center gateway
	const center = nodes.find((n) => n.kind === "gateway") ?? nodes[0];
	const ring = nodes.filter((n) => n.id !== center?.id);
	const cx = 50,
		cy = 50,
		r = 38;
	const pos = new Map<string, { x: number; y: number }>();
	if (center) pos.set(center.id, { x: cx, y: cy });
	ring.forEach((n, i) => {
		const a = (i / Math.max(1, ring.length)) * Math.PI * 2 - Math.PI / 2;
		pos.set(n.id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
	});

	const kindColor: Record<MeshNode["kind"], string> = {
		browser: "#e6ff87",
		gateway: "#9ae6ff",
		p2p: "#ffb86b",
		local: "#b8b9b0",
	};

	return (
		<div className="mesh-topology">
			<svg viewBox="0 0 100 100" className="mesh-svg" role="img" aria-label="Mesh topology">
				{edges.map((e, i) => {
					const a = pos.get(e.from),
						b = pos.get(e.to);
					if (!a || !b) return null;
					return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="mesh-edge" />;
				})}
				{nodes.map((n) => {
					const p = pos.get(n.id);
					if (!p) return null;
					const isCenter = n.id === center?.id;
					return (
						<g
							key={n.id}
							className="mesh-node-group"
							onClick={() => onSelect?.(n.id)}
							style={{ cursor: "pointer" }}
						>
							<circle
								cx={p.x}
								cy={p.y}
								r={isCenter ? 7 : 4.5}
								fill={kindColor[n.kind]}
								stroke={n.status === "online" ? "#11110f" : "#555"}
								strokeWidth={n.status === "online" ? 1.2 : 0.8}
								opacity={n.status === "online" ? 1 : 0.6}
							/>
							<text
								x={p.x}
								y={p.y + (isCenter ? 12 : 9)}
								textAnchor="middle"
								fontSize={isCenter ? 3.2 : 2.6}
								fill="#f4f5ed"
							>
								{n.label}
							</text>
						</g>
					);
				})}
			</svg>
			<div className="mesh-legend">
				<span>
					<i className="legend-dot" style={{ background: "#9ae6ff" }} /> Gateway
				</span>
				<span>
					<i className="legend-dot" style={{ background: "#e6ff87" }} /> Browser
				</span>
				<span>
					<i className="legend-dot" style={{ background: "#ffb86b" }} /> P2P
				</span>
				<span>
					<i className="legend-dot" style={{ background: "#b8b9b0" }} /> Local
				</span>
				<span className="mesh-hint">LLMesh · libp2p · Browser Mesh</span>
			</div>
		</div>
	);
}

export function MeshStats({ nodes, edges }: { nodes: MeshNode[]; edges: MeshEdge[] }) {
	const online = nodes.filter((n) => n.status === "online").length;
	return (
		<div className="stat-grid">
			<div className="stat-card">
				<strong>{nodes.length}</strong>
				<span>Nodes</span>
			</div>
			<div className="stat-card">
				<strong>{online}</strong>
				<span>Online</span>
			</div>
			<div className="stat-card">
				<strong>{edges.length}</strong>
				<span>Edges</span>
			</div>
			<div className="stat-card">
				<strong>{nodes.length ? (edges.length / nodes.length).toFixed(1) : "—"}</strong>
				<span>Avg degree</span>
			</div>
		</div>
	);
}

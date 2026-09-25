/**
 * PythiaVisualCanvas — Interactive Visual Information Center for Pythia Dashboard.
 *
 * Provides the visual centerpiece modeled on muhanai.com/dashboard2:
 *  1. 2D Interactive SVG Topology Mesh with animated pulse travels, glowing halos,
 *     real-time concept nodes, and a slide-over Node Inspector.
 *  2. 3D World Engine Earth Globe (via WorldGlobe) with live event markers.
 */

import { Activity, Compass, Cpu, Globe2, Maximize2, Network, Sparkles, X, Zap } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphConcept, GraphRelation } from "../lib/pythia-client";
import type { WorldBrief } from "../lib/world-client";
import { WorldGlobe } from "./WorldGlobe";

export interface VisualNode {
	id: string;
	x: number;
	y: number;
	type: "core" | "concept" | "forecast" | "agent" | "compute" | "mcp";
	label: string;
	tag: string;
	domain?: string;
	score?: number;
	status?: "amplified" | "validated" | "raw";
}

export interface VisualEdge {
	source: string;
	target: string;
	predicate?: string;
	strength?: number;
}

const DEFAULT_NODES: VisualNode[] = [
	{ id: "pythia-core", x: 480, y: 240, type: "core", label: "pythia·core", tag: "engine", status: "amplified", score: 98 },
	{ id: "keyless-mesh", x: 260, y: 140, type: "compute", label: "keyless·pool", tag: "0-mht", domain: "routing", score: 92 },
	{ id: "omniroute", x: 700, y: 130, type: "agent", label: "omniroute·mesh", tag: "1.3k-models", domain: "llm", score: 88 },
	{ id: "shadowbroker", x: 180, y: 310, type: "agent", label: "shadowbroker·obs", tag: "telemetry", domain: "conflict", score: 84 },
	{ id: "pythia-forecast", x: 760, y: 330, type: "forecast", label: "pythia·forecast", tag: "mirofish", domain: "prediction", score: 91 },
	{ id: "graphiti-falkor", x: 340, y: 380, type: "mcp", label: "graphiti·falkor", tag: "temporal-index", domain: "knowledge", score: 86 },
	{ id: "a2ui-bridge", x: 620, y: 390, type: "mcp", label: "a2ui·surface", tag: "ui-runtime", domain: "code", score: 79 },
	{ id: "code-repair", x: 480, y: 90, type: "concept", label: "python·ast·repair", tag: "ast-opt", domain: "code", status: "validated", score: 87 },
	{ id: "gps-jamming", x: 130, y: 190, type: "concept", label: "gulf·gps·jamming", tag: "geo-signal", domain: "conflict", status: "amplified", score: 94 },
	{ id: "quake-telemetry", x: 280, y: 450, type: "concept", label: "seismic·cluster", tag: "usgs-live", domain: "disaster", status: "validated", score: 76 },
	{ id: "quantum-optim", x: 840, y: 220, type: "concept", label: "bytecode·opt", tag: "jit-pass", domain: "code", status: "raw", score: 68 },
];

const DEFAULT_EDGES: VisualEdge[] = [
	{ source: "pythia-core", target: "keyless-mesh", predicate: "routes_through", strength: 0.9 },
	{ source: "pythia-core", target: "omniroute", predicate: "dispatches_to", strength: 0.95 },
	{ source: "pythia-core", target: "shadowbroker", predicate: "ingests_telemetry", strength: 0.85 },
	{ source: "pythia-core", target: "pythia-forecast", predicate: "generates", strength: 0.92 },
	{ source: "pythia-core", target: "graphiti-falkor", predicate: "indexes_into", strength: 0.88 },
	{ source: "pythia-core", target: "a2ui-bridge", predicate: "renders_via", strength: 0.78 },
	{ source: "pythia-core", target: "code-repair", predicate: "executes", strength: 0.9 },
	{ source: "shadowbroker", target: "gps-jamming", predicate: "observed", strength: 0.96 },
	{ source: "shadowbroker", target: "quake-telemetry", predicate: "tracked", strength: 0.8 },
	{ source: "omniroute", target: "quantum-optim", predicate: "evaluated", strength: 0.7 },
	{ source: "graphiti-falkor", target: "gps-jamming", predicate: "validity_window", strength: 0.82 },
	{ source: "pythia-forecast", target: "gps-jamming", predicate: "forecasts_escalation", strength: 0.89 },
	{ source: "keyless-mesh", target: "code-repair", predicate: "powers", strength: 0.85 },
];

interface PulseParticle {
	id: string;
	path: string;
	color: string;
}

export const PythiaVisualCanvas: React.FC<{
	concepts?: GraphConcept[];
	relations?: GraphRelation[];
	worldBrief?: WorldBrief | null;
	onSelectConcept?: (name: string) => void;
}> = ({ concepts = [], relations = [], worldBrief, onSelectConcept }) => {
	const [viewMode, setViewMode] = useState<"topology" | "globe">("topology");
	const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null);
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
	const [pulses, setPulses] = useState<PulseParticle[]>([]);
	const [remotePeers, setRemotePeers] = useState<string[]>([]);
	const pulseSeq = useRef(0);

	// Dynamically merge live graph concepts into visual topology
	const { nodes, edges } = useMemo(() => {
		const baseNodes = [...DEFAULT_NODES];
		const baseEdges = [...DEFAULT_EDGES];

		if (concepts.length > 0) {
			// Map top concepts in circular orbit around center
			const dynamicConcepts = concepts.slice(0, 10);
			const radiusX = 350;
			const radiusY = 170;
			const centerX = 480;
			const centerY = 240;

			dynamicConcepts.forEach((c, idx) => {
				const angle = (idx / dynamicConcepts.length) * 2 * Math.PI - Math.PI / 2;
				const x = Math.round(centerX + Math.cos(angle) * (radiusX + (idx % 2 === 0 ? 25 : -25)));
				const y = Math.round(centerY + Math.sin(angle) * (radiusY + (idx % 2 === 0 ? 15 : -15)));

				// Check if node already exists by id
				const existingIdx = baseNodes.findIndex((n) => n.id === c.id || n.label === c.label);
				const nodeObj: VisualNode = {
					id: c.id,
					x: Math.max(50, Math.min(910, x)),
					y: Math.max(50, Math.min(430, y)),
					type: "concept",
					label: c.label,
					tag: c.domain,
					domain: c.domain,
					score: Math.round(c.signalScore),
					status: c.effectiveStatus,
				};

				if (existingIdx >= 0) {
					baseNodes[existingIdx] = nodeObj;
				} else {
					baseNodes.push(nodeObj);
					baseEdges.push({
						source: "pythia-core",
						target: c.id,
						predicate: "derived_concept",
						strength: Math.min(1, Math.max(0.4, c.signalScore / 100)),
					});
				}
			});
		}

		// Also overlay relations if available
		relations.forEach((rel) => {
			if (baseNodes.some((n) => n.id === rel.sourceId) && baseNodes.some((n) => n.id === rel.targetId)) {
				baseEdges.push({
					source: rel.sourceId,
					target: rel.targetId,
					predicate: rel.predicate,
					strength: rel.strength,
				});
			}
		});

		return { nodes: baseNodes, edges: baseEdges };
	}, [concepts, relations]);

	const nodeMap = useMemo(() => {
		const map = new Map<string, VisualNode>();
		nodes.forEach((n) => map.set(n.id, n));
		return map;
	}, [nodes]);

	// Periodic random pulse firing across topology links
	const triggerPulse = useCallback(
		(sourceId?: string, targetId?: string) => {
			let src: VisualNode | undefined;
			let tgt: VisualNode | undefined;

			if (sourceId && targetId) {
				src = nodeMap.get(sourceId);
				tgt = nodeMap.get(targetId);
			} else if (edges.length > 0) {
				const randomEdge = edges[Math.floor(Math.random() * edges.length)];
				if (randomEdge) {
					src = nodeMap.get(randomEdge.source);
					tgt = nodeMap.get(randomEdge.target);
				}
			}

			if (!src || !tgt) return;

			pulseSeq.current += 1;
			const id = `pulse-${pulseSeq.current}`;
			const midX = (src.x + tgt.x) / 2;
			const midY = (src.y + tgt.y) / 2 - 25;
			const path = `M ${src.x} ${src.y} Q ${midX} ${midY} ${tgt.x} ${tgt.y}`;
			const color = src.type === "core" ? "#38bdf8" : src.type === "concept" ? "#a5b4fc" : "#34d399";

			setPulses((prev) => [...prev.slice(-8), { id, path, color }]);
			setTimeout(() => {
				setPulses((prev) => prev.filter((p) => p.id !== id));
			}, 1300);
		},
		[edges, nodeMap],
	);

	useEffect(() => {
	if (viewMode !== "topology") return;
	const interval = setInterval(() => {
	triggerPulse();
	}, 2400);
	return () => clearInterval(interval);
	}, [viewMode, triggerPulse]);

	useEffect(() => {
	const onPeerPulse = (event: Event) => {
	const detail = (event as CustomEvent<{ fromPeerId?: string }>).detail;
	if (!detail?.fromPeerId) return;
	setRemotePeers((prev) => (prev.includes(detail.fromPeerId!) ? prev : [...prev, detail.fromPeerId!].slice(-24)));
	triggerPulse();
	};
	window.addEventListener("muhanai:peer-pulse", onPeerPulse);
	return () => window.removeEventListener("muhanai:peer-pulse", onPeerPulse);
	}, [triggerPulse]);

	const connectedEdgeCount = useMemo(() => {
		if (!selectedNode) return 0;
		return edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id).length;
	}, [selectedNode, edges]);

	return (
		<div className="pythia-canvas-card">
			{/* ── Visual Header Controls ──────────────────────────────── */}
			<div className="pythia-canvas-head">
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<Sparkles size={16} style={{ color: "#38bdf8" }} />
					<span className="pythia-canvas-title">Visual Mesh & World Surface</span>
						<span className="pythia-canvas-badge">
					{viewMode === "topology"
					? `${nodes.length} NODES · ${edges.length} LINKS · ${remotePeers.length} LIVE PEERS`
					: "3D EARTH ENGINE"}
					</span>
				</div>

				<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
					<button
						type="button"
						className={`pythia-view-toggle ${viewMode === "topology" ? "active" : ""}`}
						onClick={() => setViewMode("topology")}
						aria-pressed={viewMode === "topology"}
					>
						<Network size={13} />
						<span>코스믹 토폴로지</span>
					</button>

					<button
						type="button"
						className={`pythia-view-toggle ${viewMode === "globe" ? "active" : ""}`}
						onClick={() => setViewMode("globe")}
						aria-pressed={viewMode === "globe"}
					>
						<Globe2 size={13} />
						<span>3D 월드 엔진</span>
					</button>
				</div>
			</div>

			{/* ── Canvas Display Area ─────────────────────────────────── */}
			<div className="pythia-canvas-body">
				{viewMode === "topology" ? (
					<div className="pythia-mesh-wrap">
						{/* Background atmospheric glows */}
						<div className="pythia-mesh-atmos" aria-hidden="true" />

						<svg
							className="pythia-mesh-svg"
							viewBox="0 0 960 480"
							preserveAspectRatio="xMidYMid meet"
							role="img"
							aria-label="Pythia Cosmic Topology Graph"
						>
							<defs>
								<linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
									<stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
									<stop offset="100%" stopColor="#818cf8" stopOpacity="0.25" />
								</linearGradient>
								<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
									<feGaussianBlur stdDeviation="3.5" result="blur" />
									<feComposite in="SourceGraphic" in2="blur" operator="over" />
								</filter>
							</defs>

							{/* Links/Edges */}
							<g className="pythia-edges">
								{edges.map((e, idx) => {
									const sn = nodeMap.get(e.source);
									const tn = nodeMap.get(e.target);
									if (!sn || !tn) return null;
									const isHot =
										hoveredNodeId === e.source ||
										hoveredNodeId === e.target ||
										(selectedNode && (selectedNode.id === e.source || selectedNode.id === e.target));
									return (
										<line
											key={`${e.source}-${e.target}-${idx}`}
											x1={sn.x}
											y1={sn.y}
											x2={tn.x}
											y2={tn.y}
											className={`pythia-edge ${isHot ? "pythia-edge--hot" : ""}`}
											stroke={isHot ? "#38bdf8" : "rgba(255, 255, 255, 0.12)"}
											strokeWidth={isHot ? 1.8 : 1}
											strokeDasharray={e.predicate === "forecasts_escalation" ? "3,3" : undefined}
										/>
									);
								})}
							</g>

							{/* Animated Pulse Travels */}
							{pulses.map((p) => (
								<circle key={p.id} r={3.5} fill={p.color} filter="url(#glow)">
									<animateMotion dur="1.2s" repeatCount="1" fill="freeze" path={p.path} />
								</circle>
							))}

							{/* Nodes */}
							<g className="pythia-nodes">
								{nodes.map((n) => {
									const isSelected = selectedNode?.id === n.id;
									const isHovered = hoveredNodeId === n.id;
									const isCore = n.type === "core";

									return (
										<g
											key={n.id}
											transform={`translate(${n.x}, ${n.y})`}
											className={`pythia-node-g ${isSelected ? "selected" : ""}`}
											onClick={() => {
												setSelectedNode(n);
												triggerPulse("pythia-core", n.id);
											}}
											onMouseEnter={() => setHoveredNodeId(n.id)}
											onMouseLeave={() => setHoveredNodeId(null)}
											cursor="pointer"
										>
											{/* Outer pulsating halo for core or amplified nodes */}
											{(isCore || n.status === "amplified" || isSelected) && (
												<circle
													r={isCore ? 24 : 16}
													className="pythia-node-halo"
													stroke={isCore ? "#38bdf8" : n.status === "amplified" ? "#34d399" : "#a5b4fc"}
												/>
											)}

											{/* Node Core Geometry */}
											{isCore ? (
												<circle r={9} fill="#38bdf8" stroke="#ffffff" strokeWidth={2} filter="url(#glow)" />
											) : n.type === "compute" ? (
												<rect
													x={-6}
													y={-6}
													width={12}
													height={12}
													transform="rotate(45)"
													fill="#38bdf8"
													stroke="rgba(255,255,255,0.7)"
													strokeWidth={1.5}
												/>
											) : n.type === "mcp" ? (
												<rect
													x={-6}
													y={-6}
													width={12}
													height={12}
													rx={2.5}
													fill="#34d399"
													stroke="rgba(255,255,255,0.7)"
													strokeWidth={1.5}
												/>
											) : n.type === "forecast" ? (
												<polygon
													points="0,-8 7,5 -7,5"
													fill="#fbbf24"
													stroke="rgba(255,255,255,0.8)"
													strokeWidth={1.5}
												/>
											) : (
												<circle
													r={6.5}
													fill={
														n.status === "amplified"
															? "#10b981"
															: n.status === "validated"
																? "#38bdf8"
																: "#94a3b8"
													}
													stroke="#ffffff"
													strokeWidth={1.2}
												/>
											)}

											{/* Node Label */}
											<text
												x={0}
												y={isCore ? 20 : 16}
												textAnchor="middle"
												className="pythia-node-label"
												fill={isSelected || isHovered ? "#ffffff" : "#c6d2e4"}
												fontWeight={isCore || isSelected ? 700 : 500}
											>
												{n.label}
											</text>

											{/* Sub-tag badge */}
											<text x={0} y={isCore ? 31 : 27} textAnchor="middle" className="pythia-node-tag">
												{n.tag}
											</text>
										</g>
									);
								})}
							</g>
						</svg>

						{/* Slide-over Node Inspector */}
						{selectedNode && (
							<div className="pythia-inspector">
								<div className="pythia-inspector__head">
									<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
										<Zap size={14} style={{ color: "#38bdf8" }} />
										<span className="pythia-inspector__title">{selectedNode.label}</span>
									</div>
									<button
										type="button"
										className="pythia-inspector__close"
										onClick={() => setSelectedNode(null)}
									>
										<X size={14} />
									</button>
								</div>

								<div className="pythia-inspector__tags">
									<span className="pythia-itag">{selectedNode.type}</span>
									<span className="pythia-itag">{selectedNode.tag}</span>
									{selectedNode.status && (
										<span className={`pythia-itag pythia-itag--${selectedNode.status}`}>
											{selectedNode.status}
										</span>
									)}
								</div>

								<div className="pythia-inspector__metrics">
									<div className="pythia-imetric">
										<span className="pythia-imetric__label">Signal Score</span>
										<span className="pythia-imetric__val">{selectedNode.score ?? 85}</span>
									</div>
									<div className="pythia-imetric">
										<span className="pythia-imetric__label">Connections</span>
										<span className="pythia-imetric__val">{connectedEdgeCount} edges</span>
									</div>
								</div>

								<div style={{ display: "flex", gap: 6, marginTop: 10 }}>
									<button
										type="button"
										className="pythia-btn pythia-btn--primary"
										style={{ flex: 1, padding: "5px 8px", fontSize: 11 }}
										onClick={() => {
											onSelectConcept?.(selectedNode.label);
											triggerPulse("pythia-core", selectedNode.id);
										}}
									>
										프롬프트에 입력
									</button>
									<button
										type="button"
										className="pythia-btn"
										style={{ padding: "5px 8px", fontSize: 11 }}
										onClick={() => triggerPulse("pythia-core", selectedNode.id)}
									>
										신호 펄스
									</button>
								</div>
							</div>
						)}
					</div>
				) : (
					/* ── 3D Earth Globe Mode ───────────────────────────── */
					<div className="pythia-globe-wrap" style={{ height: 420 }}>
						<WorldGlobe
							events={worldBrief?.events ?? []}
							isOnline={worldBrief?.source === "pythia"}
							lastUpdated={worldBrief?.fetchedAt}
						/>
					</div>
				)}
			</div>
		</div>
	);
};

export default PythiaVisualCanvas;
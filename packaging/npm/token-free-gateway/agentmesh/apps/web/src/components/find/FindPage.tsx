import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X, Zap } from "lucide-react";
import { CosmicCanvas } from "./CosmicCanvas";
import { CosmicHud } from "./CosmicHud";
import { CosmicPromptBar } from "./CosmicPromptBar";
import { ObsidianInspector } from "./ObsidianInspector";
import "./find.css";
import { INITIAL_EDGES, INITIAL_NODES, INITIAL_PEERS } from "./initialData";
import type { CosmicEdge, CosmicNode, CosmicPeer, NodeType, Shockwave } from "./types";

interface FindPageProps {
	onNavigateHome: () => void;
}

const ALL_TYPE_FILTERS: Record<NodeType, boolean> = {
	core: true,
	agent: true,
	peer: true,
	note: true,
	tag: true,
};

let shockwaveSeq = 0;

function playCosmicChime() {
	try {
		const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
		if (!AudioCtx) return;
		const ctx = new AudioCtx();
		const now = ctx.currentTime;

		const osc1 = ctx.createOscillator();
		const osc2 = ctx.createOscillator();
		const gain = ctx.createGain();

		osc1.type = "sine";
		osc1.frequency.setValueAtTime(587.33, now);
		osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.45);

		osc2.type = "triangle";
		osc2.frequency.setValueAtTime(880.0, now);
		osc2.frequency.exponentialRampToValueAtTime(1760.0, now + 0.55);

		gain.gain.setValueAtTime(0.14, now);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

		osc1.connect(gain);
		osc2.connect(gain);
		gain.connect(ctx.destination);

		osc1.start(now);
		osc2.start(now);
		osc1.stop(now + 0.9);
		osc2.stop(now + 0.9);
	} catch {}
}

export function generateRandomPeerUsername(role: "user" | "peer" = "user"): string {
	const cosmicAdjectives = [
		"Cosmic", "Quantum", "Stellar", "Nebula", "Nova", "Cyber",
		"Astro", "Solar", "Lunar", "Flux", "Vector", "Hyper", "Synapse",
		"Zenith", "Apex", "Orbit", "Plasma", "Radiant", "Galactic", "Infinite"
	];
	const cosmicNouns = [
		"Voyager", "Explorer", "Pioneer", "Architect", "Navigator",
		"Pilot", "Cipher", "Runner", "Guardian", "Scholar", "Weaver",
		"Coder", "Oracle", "Beacon", "Specter", "Seeker", "Builder"
	];
	const adj = cosmicAdjectives[Math.floor(Math.random() * cosmicAdjectives.length)];
	const noun = cosmicNouns[Math.floor(Math.random() * cosmicNouns.length)];
	const num = Math.floor(Math.random() * 900 + 100);
	return role === "user" ? `${adj}_${noun}_${num}` : `Peer_${adj}_${num}`;
}

interface PeerNameModalProps {
	isOpen: boolean;
	mode: "user" | "simulated";
	initialName: string;
	isConnected: boolean;
	onConfirm: (name: string) => void;
	onDisconnect?: () => void;
	onClose: () => void;
}

const PeerNameModal: React.FC<PeerNameModalProps> = ({
	isOpen,
	mode,
	initialName,
	isConnected,
	onConfirm,
	onDisconnect,
	onClose,
}) => {
	const [name, setName] = useState(initialName || generateRandomPeerUsername(mode));
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isOpen) {
			setName(initialName || generateRandomPeerUsername(mode));
			setTimeout(() => {
				inputRef.current?.focus();
				inputRef.current?.select();
			}, 50);
		}
	}, [isOpen, initialName, mode]);

	if (!isOpen) return null;

	const handleRollRandom = () => {
		setName(generateRandomPeerUsername(mode));
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const finalName = name.trim() || generateRandomPeerUsername(mode);
		onConfirm(finalName);
		onClose();
	};

	const isUserMode = mode === "user";

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm pointer-events-auto"
			onClick={onClose}
		>
			<div
				className="relative w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-sky-500/30 shadow-2xl text-slate-100 font-sans"
				onClick={(e) => e.stopPropagation()}
				style={{
					background: "linear-gradient(145deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))",
					boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)",
				}}
			>
				{/* Header */}
				<div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
					<div className="flex items-center gap-2">
						{isUserMode ? (
							<Zap size={18} className="text-emerald-400" />
						) : (
							<Sparkles size={18} className="text-sky-400" />
						)}
						<h3 className="text-base font-bold tracking-tight text-white">
							{isUserMode ? "내 디바이스 피어 이름 지정" : "P2P 피어 노드 연결 및 이름 지정"}
						</h3>
					</div>
					<button
						type="button"
						className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
						onClick={onClose}
						aria-label="닫기"
					>
						<X size={16} />
					</button>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-xs font-semibold text-slate-300 mb-1.5">
							{isUserMode ? "디바이스 피어 닉네임" : "원격 피어 노드 이름"}
						</label>
						<div className="flex items-center gap-2">
							<input
								ref={inputRef}
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={isUserMode ? "예: Brian-MacBook, CosmicCoder..." : "예: Peer-Tokyo-Node..."}
								maxLength={36}
								className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-white/15 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 text-sm text-white outline-none font-mono placeholder:text-slate-500"
							/>
							<button
								type="button"
								onClick={handleRollRandom}
								title="랜덤 코스믹 이름 생성"
								className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-medium border border-sky-400/20 hover:border-sky-400/40 transition-all flex items-center gap-1.5"
							>
								<span>🎲 랜덤</span>
							</button>
						</div>
						<p className="mt-1.5 text-[11px] text-slate-400">
							{isUserMode
								? "P2P 분산 지식 메쉬 및 WebRTC 볼트에 표시될 디바이스 이름입니다."
								: "새로운 피어 노드로 지식 그래프에 마운트할 고유 이름입니다."}
						</p>
					</div>

					<div className="flex items-center justify-between pt-2">
						{isUserMode && isConnected && onDisconnect ? (
							<button
								type="button"
								onClick={() => {
									onDisconnect();
									onClose();
								}}
								className="px-3.5 py-2 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-all"
							>
								연결 해제
							</button>
						) : (
							<div />
						)}

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
							>
								취소
							</button>
							<button
								type="submit"
								className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-sky-400 to-indigo-400 hover:from-sky-300 hover:to-indigo-300 shadow-md shadow-sky-500/20 transition-all flex items-center gap-1.5"
							>
								<Sparkles size={13} />
								<span>{isUserMode && isConnected ? "이름 변경 적용" : "이름 지정 및 연결"}</span>
							</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
};

export const FindPage: React.FC<FindPageProps> = ({ onNavigateHome }) => {
	const [nodes, setNodes] = useState<CosmicNode[]>(INITIAL_NODES);
	const [edges, setEdges] = useState<CosmicEdge[]>(INITIAL_EDGES);
	const [selectedNode, setSelectedNode] = useState<CosmicNode | null>(() => {
		if (typeof window !== "undefined" && window.innerWidth <= 768) {
			return null;
		}
		return INITIAL_NODES[0] ?? null;
	});
	const [shockwaves, setShockwaves] = useState<Shockwave[]>([]);
	const [searchFilter, setSearchFilter] = useState("");
	const [activeTypeFilters, setActiveTypeFilters] =
		useState<Record<NodeType, boolean>>(ALL_TYPE_FILTERS);
	const [repelStrength, setRepelStrength] = useState(1.0);
	const [linkDistance, setLinkDistance] = useState(130);
	const [centerGravity, setCenterGravity] = useState(0.8);
	const [userPeerConnected, setUserPeerConnected] = useState(false);
	const [connectedPeerName, setConnectedPeerName] = useState(() => {
		if (typeof window !== "undefined") {
			try {
				return localStorage.getItem("muhanai_connected_peer_name") || "";
			} catch {
				return "";
			}
		}
		return "";
	});
	const [peers, _setPeers] = useState<CosmicPeer[]>(INITIAL_PEERS);
	const [latencyMs, setLatencyMs] = useState(28);
	const [eventsLog, setEventsLog] = useState<string[]>([
		`[init] muhanai.com/find mesh attached · ${INITIAL_PEERS.length} peers · ${INITIAL_NODES.length} notes · ${INITIAL_EDGES.length} synapses`,
		"[init] CRDT knowledge lake subscribed — WebRTC shard #89 linked",
		"[prompt] Cosmic Omnibar active: type to search or publish new Obsidian nodes",
	]);

	// Peer Name Specification Modal state
	const [peerModalOpen, setPeerModalOpen] = useState(false);
	const [peerModalMode, setPeerModalMode] = useState<"user" | "simulated">("user");

	const handleOpenPeerModal = useCallback((mode: "user" | "simulated") => {
		setPeerModalMode(mode);
		setPeerModalOpen(true);
	}, []);

	const shockwaveTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

	const peersCount = peers.length + (userPeerConnected ? 1 : 0);
	const notesCount = nodes.length;
	const edgesCount = edges.length;
	const selectedNodeId = selectedNode?.id ?? null;

	const addEvent = useCallback((line: string) => {
		const ts = new Date().toISOString().slice(11, 19);
		setEventsLog((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 14));
	}, []);

	const spawnShockwave = useCallback((sx: number, sy: number, color = "#38bdf8") => {
		const id = `sw-${++shockwaveSeq}`;
		setShockwaves((prev) => [
			...prev,
			{ id, x: sx, y: sy, radius: 0, maxRadius: 260, opacity: 0.95, color },
		]);
		const timer = setTimeout(() => {
			setShockwaves((prev) => prev.filter((sw) => sw.id !== id));
			shockwaveTimers.current.delete(timer);
		}, 1400);
		shockwaveTimers.current.add(timer);
	}, []);

	const handleSelectNode = useCallback(
		(node: CosmicNode | null) => {
			setSelectedNode(node);
			if (node) {
				addEvent(`selected node ${node.frontmatter.title} (${node.type})`);
			}
		},
		[addEvent],
	);

	const toggleTypeFilter = useCallback((type: NodeType) => {
		setActiveTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
	}, []);

	const handleSearchOrPublish = useCallback(
		(query: string) => {
			const clean = query.trim().replace(/^[[|]]$/g, "");
			const lower = clean.toLowerCase();

			const found = nodes.find(
				(n) =>
					n.label.toLowerCase().includes(lower) ||
					n.frontmatter.title.toLowerCase().includes(lower) ||
					n.frontmatter.tags.some((t) => t.toLowerCase() === lower),
			);

			if (found) {
				setSelectedNode(found);
				spawnShockwave(found.x, found.y, found.color || "#38bdf8");
				playCosmicChime();
				addEvent(`🔍 Located existing node: ${found.frontmatter.title}`);
				return;
			}

			playCosmicChime();
			const angle = Math.random() * Math.PI * 2;
			const distance = 140 + Math.random() * 100;
			const nx = Math.cos(angle) * distance;
			const ny = Math.sin(angle) * distance;
			const newId = `note-user-${Date.now()}`;
			const color = "#10b981";

			const newNode: CosmicNode = {
				id: newId,
				label: `[[${clean}.md]]`,
				type: "note",
				peerId: userPeerConnected ? "peer-local-user-browser" : "peer-anonymous-creator",
				x: nx,
				y: ny,
				vx: 0,
				vy: 0,
				radius: 13,
				color,
				connectionsCount: 2,
				frontmatter: {
					title: clean,
					author: userPeerConnected ? "You (Active Peer)" : "Anonymous Contributor",
					peerId: userPeerConnected ? "peer-local-user-browser" : "peer-anonymous-creator",
					created: new Date().toISOString().slice(0, 10),
					tags: ["knowledge", "obsidian", "user-published", "p2p-mesh"],
					links: ["note-muhanai-core", "note-webrtc-crdt"],
					summary:
						"유저가 muhanai.com/find 상단 옴니바에서 우주 메쉬로 직접 발행한 옵시디언 지식 조각",
					markdown: `# ${clean}\n\n사용자가 상단 옴니바를 통해 전체화면 우주 지식 메쉬에 실시간으로 발행한 지식 노드입니다.\n\n## Network Shard\n- **Sync Protocol**: WebRTC CRDT State Vector\n- **Origin Hub**: [[MuhanAI Origin MOC.md]]\n- **Verification**: [[CRDT Knowledge Lake.md]]\n\n- Published at: ${new Date().toISOString()}`,
				},
			};

			const newEdge: CosmicEdge = {
				id: `e-user-pub-${Date.now()}`,
				source: "note-muhanai-core",
				target: newId,
				label: "user-synapse",
				weight: 1.3,
			};

			setNodes((prev) => [...prev, newNode]);
			setEdges((prev) => [...prev, newEdge]);
			setSelectedNode(newNode);
			spawnShockwave(nx, ny, "#10b981");

			addEvent(`✨ Published new Obsidian node: [[${clean}.md]] into Cosmic Mesh`);
		},
		[nodes, userPeerConnected, spawnShockwave, addEvent],
	);

	const handleConnectSimulatedPeer = useCallback(
		(nameInput?: string) => {
			const finalName =
				nameInput?.trim() || generateRandomPeerUsername("peer");
			setConnectedPeerName(finalName);
			try {
				localStorage.setItem("muhanai_connected_peer_name", finalName);
			} catch {}

			const colors = ["#38bdf8", "#10b981", "#a855f7", "#f59e0b", "#ec4899"];
			const angle = Math.random() * Math.PI * 2;
			const r = 320;
			const x = Math.cos(angle) * r;
			const y = Math.sin(angle) * r;
			const color = colors[Math.floor(Math.random() * colors.length)];
			const id = `note-peer-${Date.now()}`;
			const newNode: CosmicNode = {
				id,
				label: `[[${finalName}'s Vault.md]]`,
				type: "peer",
				x,
				y,
				vx: 0,
				vy: 0,
				radius: 14,
				color,
				connectionsCount: 2,
				frontmatter: {
					title: `${finalName}'s Vault`,
					author: finalName,
					created: new Date().toISOString().slice(0, 10),
					tags: ["peer", "connected-vault", "webrtc"],
					links: ["note-muhanai-core"],
					summary: `${finalName} 님이 P2P 지식 메쉬에 연결한 옵시디언 볼트 노드`,
					markdown: `# ${finalName}'s Obsidian Vault\n\n- 연결 피어: **${finalName}**\n- 프로토콜: WebRTC DataChannel (0ms loopback)\n- 연결 시각: ${new Date().toISOString()}\n- 상위 네트워크: [[MuhanAI Origin MOC.md]]`,
				},
			};
			setNodes((prev) => [...prev, newNode]);
			setSelectedNode(newNode);
			spawnShockwave(x, y, color);
			playCosmicChime();
			setUserPeerConnected(true);
			addEvent(`✨ P2P Peer connected: ${finalName} ([[${finalName}'s Vault.md]])`);
		},
		[connectedPeerName, addEvent, spawnShockwave],
	);

	const handleConnectUserPeer = useCallback(
		(nameInput?: string) => {
			const finalName =
				nameInput?.trim() || connectedPeerName || generateRandomPeerUsername("user");
			setConnectedPeerName(finalName);
			try {
				localStorage.setItem("muhanai_connected_peer_name", finalName);
			} catch {}

			setUserPeerConnected(true);
			addEvent(`🚀 [${finalName}] mounted into P2P mesh (WebRTC CRDT Lake active)`);
			setLatencyMs((prev) => Math.max(1, Math.round(prev + (Math.random() - 0.5) * 12)));
			playCosmicChime();
		},
		[connectedPeerName, addEvent],
	);

	const handleDisconnectUserPeer = useCallback(() => {
		setUserPeerConnected(false);
		const displayName = connectedPeerName || "User Device";
		addEvent(`🔌 [${displayName}] disconnected from P2P mesh`);
		playCosmicChime();
	}, [connectedPeerName, addEvent]);

	const handleOpenUserGuide = useCallback(() => {
		const guideNode = nodes.find((n) => n.id === "note-user-guide");
		if (guideNode) {
			setSelectedNode(guideNode);
			addEvent("📖 Opened MuhanAI Official User Guide [[MuhanAI 공식 사용설명서.md]]");
		}
	}, [nodes, addEvent]);

	const handlePublishGeneratedNote = useCallback(
		(title: string, markdownContent: string) => {
			const newNoteId = `note-ai-${Date.now()}`;
			const colors = ["#38bdf8", "#10b981", "#a855f7", "#ec4899", "#e6ff87"];
			const color = colors[Math.floor(Math.random() * colors.length)];
			const angle = Math.random() * Math.PI * 2;
			const r = 260 + Math.random() * 80;
			const x = Math.cos(angle) * r;
			const y = Math.sin(angle) * r;

			const cleanTitle = title.slice(0, 40);
			const newNode: CosmicNode = {
				id: newNoteId,
				label: `[[${cleanTitle}.md]]`,
				type: "note",
				x,
				y,
				vx: 0,
				vy: 0,
				radius: 14,
				color,
				connectionsCount: 2,
				frontmatter: {
					title: cleanTitle,
					author: "MuhanAI Multi-Agent Quorum",
					created: new Date().toISOString().slice(0, 10),
					tags: ["ai-quorum", "knowledge", "zero-token"],
					links: ["note-muhanai-core"],
					summary: `${cleanTitle} - MuhanAI 다중 에이전트 쿼럼 합의 지식 노드`,
					markdown: markdownContent,
				},
			};

			const newEdge: CosmicEdge = {
				id: `e-ai-${Date.now()}`,
				source: "note-muhanai-core",
				target: newNoteId,
				label: "quorum-consensus",
				weight: 1.3,
			};

			setNodes((prev) => [...prev, newNode]);
			setEdges((prev) => [...prev, newEdge]);
			setSelectedNode(newNode);
			spawnShockwave(x, y, color);
			playCosmicChime();
			addEvent(`✨ New Knowledge Node published from AI: [[${cleanTitle}.md]]`);
		},
		[spawnShockwave, addEvent],
	);

	const allNodesForInspector = useMemo(() => nodes, [nodes]);

	return (
		<div className="find-page-shell">
			<div className="find-page-canvas-area">
				<CosmicCanvas
					nodes={nodes}
					edges={edges}
					selectedNodeId={selectedNodeId}
					onSelectNode={handleSelectNode}
					shockwaves={shockwaves}
					searchFilter={searchFilter}
					activeTypeFilters={activeTypeFilters}
					repelStrength={repelStrength}
					linkDistance={linkDistance}
					centerGravity={centerGravity}
				/>

				<CosmicHud
					peersCount={peersCount}
					notesCount={notesCount}
					edgesCount={edgesCount}
					latencyMs={latencyMs}
					searchFilter={searchFilter}
					onSearchChange={setSearchFilter}
					onConnectSimulatedPeer={handleConnectSimulatedPeer}
					onConnectUserPeer={handleConnectUserPeer}
					connectedPeerName={connectedPeerName}
					userPeerConnected={userPeerConnected}
					activeTypeFilters={activeTypeFilters}
					onToggleTypeFilter={toggleTypeFilter}
					repelStrength={repelStrength}
					onRepelChange={setRepelStrength}
					linkDistance={linkDistance}
					onLinkDistChange={setLinkDistance}
					centerGravity={centerGravity}
					onGravityChange={setCenterGravity}
					eventsLog={eventsLog}
					onNavigateHome={onNavigateHome}
					onOpenUserGuide={handleOpenUserGuide}
					onOpenPeerNameModal={handleOpenPeerModal}
				/>

				<CosmicPromptBar
					onSearchOrPublish={handleSearchOrPublish}
					onFilterChange={setSearchFilter}
					onPublishNote={handlePublishGeneratedNote}
				/>
			</div>

			{selectedNode && (
				<ObsidianInspector
					node={selectedNode}
					allNodes={allNodesForInspector}
					onClose={() => handleSelectNode(null)}
					onSelectNode={handleSelectNode}
				/>
			)}

			<PeerNameModal
				isOpen={peerModalOpen}
				mode={peerModalMode}
				initialName={peerModalMode === "user" ? connectedPeerName : ""}
				isConnected={userPeerConnected}
				onConfirm={(name) => {
					if (peerModalMode === "user") {
						handleConnectUserPeer(name);
					} else {
						handleConnectSimulatedPeer(name);
					}
				}}
				onDisconnect={handleDisconnectUserPeer}
				onClose={() => setPeerModalOpen(false)}
			/>
		</div>
	);
};

export default FindPage;

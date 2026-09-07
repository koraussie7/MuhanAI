import type React from "react";
import { useEffect, useState } from "react";
import { type AgentIdentity, AgentIdentityGrid } from "./harvest/A/AgentIdentityCard.js";
import { type MeshEdge, type MeshNode, MeshStats, MeshTopology } from "./harvest/A/MeshTopology.js";
import { BrowserAgentPanel, type Peer, PeerCanvas } from "./harvest/A/PeerCanvas.js";
import { type LocalNode, PersonalNodeControl } from "./harvest/A/PersonalNode.js";
import { type ClusterNode, ClusterOverview } from "./harvest/C/ClusterView.js";
import { type GatewayProvider, GatewayTable, PolicyChain } from "./harvest/C/GatewayPanel.js";
import { type GpuNode, GpuPool } from "./harvest/C/GpuPool.js";
import {
	type LedgerEntry,
	type LedgerRow,
	LedgerTable,
	RewardChip,
	TrustRing,
	WebOfTrustBadge,
} from "./harvest/C/index.js";
import { type ComputeWorker, WorkerPool } from "./harvest/C/WorkerPool.js";
import { GpuRackVisualizer } from "./visuals/GpuRackVisualizer.js";
import { LatencyVisualizer } from "./visuals/LatencyVisualizer.js";
import { LiveBlockStream } from "./visuals/LiveBlockStream.js";
import { SwarmRadar } from "./visuals/SwarmRadar.js";
import "./harvest/C/harvest-c.css";
import {
	AgentsMarket,
	ComputeMarket,
	HumanExperts,
	KnowledgeMarket,
	McpMarket,
} from "./harvest/C/MarketplaceGrid.js";

const API = import.meta.env.VITE_API_BASE ?? "";

function Page({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="dash-page">
			<header className="dash-page-header">
				<h2>{title}</h2>
				{subtitle && <p className="dash-page-subtitle">{subtitle}</p>}
			</header>
			{children}
		</section>
	);
}

function StatGrid({ stats }: { stats: [string, string | number][] }) {
	return (
		<div className="stat-grid">
			{stats.map(([label, value]) => (
				<div className="stat-card" key={label}>
					<strong>{typeof value === "number" ? value.toLocaleString("ko-KR") : value}</strong>
					<span>{label}</span>
				</div>
			))}
		</div>
	);
}

// ---- Network Monitor (live from /api/pulse) ----
export function NetworkMonitorPage() {
	const [pulse, setPulse] = useState<Record<string, number> | null>(null);
	useEffect(() => {
		fetch(`${API}/api/pulse`)
			.then((r) => r.json())
			.then(setPulse)
			.catch(() => {});
	}, []);
	const stats: [string, string | number][] = pulse
		? [
				["Agents Online", pulse.agentsOnline ?? 0],
				["새 질문", pulse.newQuestions ?? 0],
				["검증 요청", pulse.verifyRequests ?? 0],
				["인간 필요", pulse.humansNeeded ?? 0],
				["AI 충돌", pulse.aiConflicts ?? 0],
				["지식 격차", pulse.knowledgeGaps ?? 0],
			]
		: [["상태", "연결 중…"]];
	return (
		<Page title="Network Monitor" subtitle="실시간 네트워크 상태">
			<StatGrid stats={stats} />
		</Page>
	);
}

// ---- Agent Mesh (Harvested from ISEK + LLMesh: AgentIdentity + Topology) ----
const HARVEST_AGENTS: AgentIdentity[] = [
	{
		id: "agent-gemini",
		name: "Gemini Research Agent",
		did: "did:muhan:agent:gemini:9f4a12",
		status: "online",
		capabilities: ["Research", "Web Search", "Summarization"],
		reputation: 98.4,
		latency: "1.2s",
		success: 99.1,
		a2a: { peers: 14, verified: true },
	},
	{
		id: "agent-claude",
		name: "Claude Analysis Agent",
		did: "did:muhan:agent:claude:88b3c1",
		status: "online",
		capabilities: ["Analysis", "Coding", "Review"],
		reputation: 97.8,
		latency: "0.9s",
		success: 98.6,
		a2a: { peers: 22, verified: true },
	},
	{
		id: "agent-local",
		name: "Local LLM Agent",
		did: "did:muhan:agent:local:7a992d",
		status: "online",
		capabilities: ["Local Inference", "Privacy"],
		reputation: 95.2,
		latency: "2.1s",
		success: 96.4,
		a2a: { peers: 6, verified: false },
	},
	{
		id: "agent-human",
		name: "Human Expert Pool",
		did: "did:muhan:human:pool:4e11fa",
		status: "online",
		capabilities: ["Experience", "Verification"],
		reputation: 99.1,
		latency: "—",
		success: 97.9,
		a2a: { peers: 128, verified: true },
	},
];

const MESH_TOPOLOGY_NODES: MeshNode[] = [
	{
		id: "router",
		label: "Router",
		kind: "gateway",
		status: "online",
		degree: 4,
	},
	{
		id: "gemini",
		label: "Gemini",
		kind: "browser",
		status: "online",
		degree: 2,
	},
	{
		id: "claude",
		label: "Claude",
		kind: "browser",
		status: "online",
		degree: 2,
	},
	{ id: "local", label: "Local", kind: "local", status: "online", degree: 1 },
	{ id: "human", label: "Human", kind: "p2p", status: "online", degree: 3 },
];

const MESH_TOPOLOGY_EDGES: MeshEdge[] = [
	{ from: "router", to: "gemini" },
	{ from: "router", to: "claude" },
	{ from: "router", to: "local" },
	{ from: "router", to: "human" },
	{ from: "gemini", to: "claude" },
	{ from: "human", to: "claude" },
];

export function AgentMeshPage() {
	const [filter, setFilter] = useState("");
	const [view, setView] = useState<"cards" | "topology">("cards");
	return (
		<Page
			title="Agent Mesh"
			subtitle="ISEK Agent Identity · A2A Discovery · DID Attestation · Decentralized Router"
		>
			<SwarmRadar />
			<div className="peer-canvas-toolbar" style={{ marginBottom: 12 }}>
				<div className="peer-filter-row">
					<button
						className={`policy-chip ${view === "cards" ? "active" : ""}`}
						onClick={() => setView("cards")}
					>
						Identity Cards ({HARVEST_AGENTS.length})
					</button>
					<button
						className={`policy-chip ${view === "topology" ? "active" : ""}`}
						onClick={() => setView("topology")}
					>
						Mesh Topology
					</button>
				</div>
				{view === "cards" && (
					<input
						className="search-input"
						style={{ maxWidth: 220, padding: "6px 10px", fontSize: 12 }}
						placeholder="DID / 기능 검색…"
						value={filter}
						onChange={(e) => setFilter(e.target.value)}
					/>
				)}
			</div>

			{view === "cards" ? (
				<AgentIdentityGrid agents={HARVEST_AGENTS} filter={filter} />
			) : (
				<>
					<MeshStats nodes={MESH_TOPOLOGY_NODES} edges={MESH_TOPOLOGY_EDGES} />
					<MeshTopology nodes={MESH_TOPOLOGY_NODES} edges={MESH_TOPOLOGY_EDGES} />
				</>
			)}
		</Page>
	);
}

// ---- P2P Network (Harvested from peerd + nekoni: WebRTC PeerCanvas + Personal Node) ----
const LOCAL_NODE_DEMO: LocalNode = {
	id: "node-local-muhan-77",
	label: "My Personal Agent Node",
	mode: "browser",
	status: "running",
	uptime: "4h 28m",
	tasks: 19,
};

export function P2pNetworkPage() {
	const [peers, setPeers] = useState<Peer[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
	const [localNode, setLocalNode] = useState<LocalNode>(LOCAL_NODE_DEMO);
	const [tab, setTab] = useState<"canvas" | "personal">("canvas");

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		fetch(`${API}/api/network`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (!cancelled && data?.peers) {
					const mapped: Peer[] = data.peers.map((p: any) => ({
						id: p.id ?? p.peerId,
						name: p.name ?? p.peerId,
						region: p.region ?? "unknown",
						protocol: (p.protocol ?? "loopback") as Peer["protocol"],
						status: (p.status ?? "offline") as Peer["status"],
						latencyMs: p.latencyMs ?? 1,
						capabilities: p.capabilities ?? [],
					}));
					setPeers(mapped);
					if (!selectedPeerId && mapped.length > 0) {
						setSelectedPeerId(mapped[0]?.id ?? null);
					}
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedPeerId]);

	const selectedPeer = peers.find((p) => p.id === selectedPeerId) ?? null;

	return (
		<Page
			title="P2P Network"
			subtitle="peerd WebRTC Browser Mesh · nekoni Personal Agent Node · Sandbox Isolation"
		>
			<StatGrid
				stats={[
					["Peers", peers.length],
					["Connected", peers.filter((p) => p.status === "connected").length],
					["Transport", "WebRTC / libp2p"],
					["Compute", "4.2 PFLOPS"],
				]}
			/>

			<div className="policy-row" style={{ marginTop: 16 }}>
				<button
					className={`policy-chip ${tab === "canvas" ? "active" : ""}`}
					onClick={() => setTab("canvas")}
				>
					🕸️ Peer Canvas ({peers.length})
				</button>
				<button
					className={`policy-chip ${tab === "personal" ? "active" : ""}`}
					onClick={() => setTab("personal")}
				>
					👤 Personal Node ({localNode.status})
				</button>
			</div>

			{tab === "canvas" ? (
				<>
					{loading ? (
						<p className="dash-note">P2P 노드 목록을 불러오는 중…</p>
					) : (
						<PeerCanvas
							peers={peers}
							selectedId={selectedPeerId ?? undefined}
							onSelect={setSelectedPeerId}
						/>
					)}
					<BrowserAgentPanel peer={selectedPeer} onClose={() => setSelectedPeerId(null)} />
				</>
			) : (
				<PersonalNodeControl
					node={localNode}
					onToggle={(r) => setLocalNode((n) => ({ ...n, status: r ? "running" : "idle" }))}
					onModeChange={(m) => setLocalNode((n) => ({ ...n, mode: m }))}
				/>
			)}
		</Page>
	);
}

// ---- LLM Mesh (Harvested from tkngate: Zero-Trust Gateway Table + Policy Chain) ----
const PROVIDERS = [
	"Gemini",
	"Claude",
	"GPT",
	"Mistral",
	"Groq",
	"Cerebras",
	"OpenRouter",
	"FreeLLMAPI",
	"LocalAI",
	"Ollama",
	"WebLLM",
];
const POLICIES = [
	"Best Quality",
	"Lowest Cost",
	"Fastest",
	"Free First",
	"Local First",
	"Privacy First",
	"Balanced",
];
const CHAIN_BY_POLICY: Record<string, string[]> = {
	"Free First": [
		"WebLLM (로컬 브라우저)",
		"FreeLLMAPI (무료 쿼터)",
		"P2P Compute (메시 공유)",
		"Paid API (최후 폴백)",
	],
	"Local First": [
		"WebLLM (로컬 브라우저)",
		"LocalAI / Ollama (셀프호스트)",
		"FreeLLMAPI (무료 쿼터)",
		"Paid API (최후 폴백)",
	],
};

export function LlmMeshPage() {
	const [policy, setPolicy] = useState("Free First");
	const chain = CHAIN_BY_POLICY[policy] ?? [
		`${policy} 정책 평가`,
		"헬스 체크 (latency / status)",
		"예산·비용 등급 필터",
		"라우팅 실행",
	];
	const gateways: GatewayProvider[] = PROVIDERS.slice(0, 6).map((name, i) => ({
		name,
		status: i === 3 ? "degraded" : "healthy",
		latencyMs: 180 + i * 240,
		costTier: i < 3 ? "free" : i < 5 ? "low" : "paid",
	}));
	return (
		<Page
			title="LLM Mesh & Gateway"
			subtitle={`tkngate 제로트러스트 라우팅 엔진 · 정책: ${policy}`}
		>
			<LatencyVisualizer />
			<div className="provider-cloud" style={{ marginBottom: 12 }}>
				{PROVIDERS.map((p) => (
					<span className="provider-chip" key={p}>
						{p}
					</span>
				))}
			</div>
			<div className="policy-row" style={{ marginBottom: 16 }}>
				{POLICIES.map((p) => (
					<button
						key={p}
						className={p === policy ? "policy-chip active" : "policy-chip"}
						onClick={() => setPolicy(p)}
					>
						{p}
					</button>
				))}
			</div>
			<PolicyChain chain={chain} />
			<div style={{ marginTop: 16 }}>
				<GatewayTable providers={gateways} />
			</div>
		</Page>
	);
}

// ---- Token Bank (Harvested from p2ptokens + PinkyBrain: Ledger + Trust Ring) ----
export function TokenBankPage() {
	const [table, setTable] = useState<LedgerRow[]>([]);
	const [balance, setBalance] = useState<{
		balance: number;
		entries: LedgerEntry[];
	} | null>(null);

	useEffect(() => {
		fetch(`${API}/api/rewards/table`)
			.then((r) => r.json())
			.then(setTable)
			.catch(() => {
				setTable([
					{ reason: "Local Model Hosting", credits: 120 },
					{ reason: "Peer Routing / P2P Relay", credits: 45 },
					{ reason: "Knowledge Lake Verification", credits: 250 },
					{ reason: "Agent Cast Consensus Node", credits: 90 },
				]);
			});
		fetch(`${API}/api/rewards/anonymous`)
			.then((r) => r.json())
			.then(setBalance)
			.catch(() => {
				setBalance({
					balance: 12480,
					entries: [
						{ reason: "WebRTC DataChannel Relay", credits: 80, at: "10분 전" },
						{ reason: "Society CRDT Proof Sign", credits: 140, at: "25분 전" },
					],
				});
			});
	}, []);

	const balanceValue = balance?.balance ?? 12480;
	const trustScore = 0.94;

	return (
		<Page
			title="Token Bank & Accounting"
			subtitle="p2ptokens 기여 회계 원장 · PinkyBrain Web of Trust 평판 링"
		>
			<LiveBlockStream />
			<StatGrid
				stats={[
					["Balance", balanceValue],
					["Entries", balance?.entries.length ?? 2],
				]}
			/>
			<div
				className="hc-tokenbank-top"
				style={{
					display: "flex",
					gap: 20,
					alignItems: "center",
					margin: "16px 0",
				}}
			>
				<TrustRing score={trustScore} trust={trustScore} />
				<div className="hc-tokenbank-side" style={{ flex: 1 }}>
					<WebOfTrustBadge peers={312} verified={240} />
					<div className="reward-grid" style={{ marginTop: 12 }}>
						{table.slice(0, 4).map((row) => (
							<RewardChip key={row.reason} reason={row.reason} credits={row.credits} />
						))}
					</div>
				</div>
			</div>
			<div className="hc-panel">
				<h3 className="hc-panel-title">Ledger Accounting</h3>
				<p className="hc-panel-meta">활동별 보상 정책과 크레딧 적립 내역</p>
				<LedgerTable table={table} entries={balance?.entries ?? []} />
			</div>
		</Page>
	);
}

// ---- Compute Mesh (Harvested from AgentFM + mycellm + DAC) ----
const COMPUTE_WORKERS: ComputeWorker[] = [
	{
		id: "worker-se-01",
		role: "CPU Inference",
		load: 0.72,
		tasks: 128,
		status: "busy",
	},
	{
		id: "worker-gpu-02",
		role: "A100 · CUDA",
		load: 0.91,
		tasks: 342,
		status: "busy",
	},
	{
		id: "worker-web-03",
		role: "WebGPU Pool",
		load: 0.35,
		tasks: 87,
		status: "idle",
	},
	{
		id: "worker-edge-04",
		role: "Edge Node",
		load: 0.12,
		tasks: 15,
		status: "idle",
	},
	{
		id: "worker-us-05",
		role: "M · Metal",
		load: 0.58,
		tasks: 201,
		status: "busy",
	},
	{
		id: "worker-eu-06",
		role: "ROCm Train",
		load: 0,
		tasks: 0,
		status: "offline",
	},
];

const GPU_NODES: GpuNode[] = [
	{
		id: "gpu-a100-01",
		gpu: "NVIDIA A100 80GB",
		load: 0.91,
		vram: 80,
		online: true,
	},
	{ id: "gpu-m3-02", gpu: "Apple M3 Max", load: 0.58, vram: 36, online: true },
	{ id: "gpu-4090-03", gpu: "RTX 4090", load: 0.74, vram: 24, online: true },
	{
		id: "gpu-7900-04",
		gpu: "Radeon 7900 XTX",
		load: 0,
		vram: 24,
		online: false,
	},
];

const CLUSTER_NODES: ClusterNode[] = [
	{
		id: "coord-kr",
		type: "coordinator",
		gpu: "CPU",
		status: "healthy",
		utilization: 0.42,
	},
	{
		id: "gpu-a100-01",
		type: "worker",
		gpu: "A100 80GB",
		status: "healthy",
		utilization: 0.91,
	},
	{
		id: "gpu-m3-02",
		type: "worker",
		gpu: "M3 Max",
		status: "healthy",
		utilization: 0.58,
	},
	{
		id: "gpu-7900-04",
		type: "worker",
		gpu: "7900 XTX",
		status: "offline",
		utilization: 0,
	},
];

export function ComputeMeshPage() {
	const [tab, setTab] = useState<"workers" | "gpu" | "cluster">("workers");
	return (
		<Page title="Compute Mesh" subtitle="AgentFM 분산 워커 · mycellm GPU 풀 · DAC 클러스터">
			<GpuRackVisualizer />
			<StatGrid
				stats={[
					["CPU", 8421],
					["GPU", 1823],
					["WebGPU", 4921],
					["Total", "128.4 TFLOPS"],
				]}
			/>
			<div className="policy-row" style={{ marginTop: 16, marginBottom: 16 }}>
				<button
					className={`policy-chip ${tab === "workers" ? "active" : ""}`}
					onClick={() => setTab("workers")}
				>
					⚡ Compute Workers ({COMPUTE_WORKERS.length})
				</button>
				<button
					className={`policy-chip ${tab === "gpu" ? "active" : ""}`}
					onClick={() => setTab("gpu")}
				>
					🎮 GPU Pool ({GPU_NODES.length})
				</button>
				<button
					className={`policy-chip ${tab === "cluster" ? "active" : ""}`}
					onClick={() => setTab("cluster")}
				>
					🏢 DAC Cluster ({CLUSTER_NODES.length})
				</button>
			</div>

			{tab === "workers" && <WorkerPool workers={COMPUTE_WORKERS} />}
			{tab === "gpu" && <GpuPool nodes={GPU_NODES} />}
			{tab === "cluster" && <ClusterOverview nodes={CLUSTER_NODES} />}
		</Page>
	);
}

// ---- Marketplace (Harvested from C: 5 Categories Grid) ----
export function MarketplacePage({
	defaultTab = "agents" as "agents" | "human" | "mcp" | "knowledge" | "compute",
}: {
	defaultTab?: "agents" | "human" | "mcp" | "knowledge" | "compute";
} = {}) {
	const [tab, setTab] = useState<"agents" | "human" | "mcp" | "knowledge" | "compute">(defaultTab);
	useEffect(() => {
		setTab(defaultTab);
	}, [defaultTab]);
	return (
		<Page title="Marketplace" subtitle="AI Capability App Store — 탈중앙화 자원 및 에이전트 마켓">
			<div className="policy-row" style={{ marginBottom: 16 }}>
				<button
					className={`policy-chip ${tab === "agents" ? "active" : ""}`}
					onClick={() => setTab("agents")}
				>
					🤖 Agents
				</button>
				<button
					className={`policy-chip ${tab === "human" ? "active" : ""}`}
					onClick={() => setTab("human")}
				>
					👤 Human Experts
				</button>
				<button
					className={`policy-chip ${tab === "mcp" ? "active" : ""}`}
					onClick={() => setTab("mcp")}
				>
					🔌 MCP Skills
				</button>
				<button
					className={`policy-chip ${tab === "knowledge" ? "active" : ""}`}
					onClick={() => setTab("knowledge")}
				>
					📚 Knowledge
				</button>
				<button
					className={`policy-chip ${tab === "compute" ? "active" : ""}`}
					onClick={() => setTab("compute")}
				>
					⚡ Compute
				</button>
			</div>

			{tab === "agents" && <AgentsMarket />}
			{tab === "human" && <HumanExperts />}
			{tab === "mcp" && <McpMarket />}
			{tab === "knowledge" && <KnowledgeMarket />}
			{tab === "compute" && <ComputeMarket />}
		</Page>
	);
}

// ---- Verification Center ----
export function VerificationPage() {
	const [items, setItems] = useState<
		{
			id: string;
			claim: string;
			sources: number;
			votes: { correct: number; wrong: number; unsure: number };
		}[]
	>([]);
	useEffect(() => {
		fetch(`${API}/api/verify`)
			.then((r) => r.json())
			.then(setItems)
			.catch(() => {});
	}, []);
	return (
		<Page
			title="Verification Center"
			subtitle={`대기 중: ${items.length}건 · 모드: AI vs AI · AI vs Web · AI vs Human · Human vs Human`}
		>
			<div className="verify-queue">
				{items.map((item) => {
					const total = item.votes.correct + item.votes.wrong + item.votes.unsure;
					const confidence = total ? Math.round((item.votes.correct / total) * 100) : 0;
					return (
						<article className="verify-queue-item" key={item.id}>
							<span className="claim-id">Claim #{item.id}</span>
							<p>{item.claim}</p>
							<div className="verify-queue-meta">
								<span>출처 {item.sources}</span>
								<span>참여 {total}</span>
								<span className={confidence >= 70 ? "conf high" : "conf low"}>
									신뢰도 {confidence}%
								</span>
							</div>
						</article>
					);
				})}
			</div>
		</Page>
	);
}

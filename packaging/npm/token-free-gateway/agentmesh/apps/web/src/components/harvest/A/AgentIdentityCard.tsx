// ISEK-inspired: Agent Identity + DID Badge + A2A Status + Discovery
export type AgentIdentity = {
	id: string;
	name: string;
	did: string;
	status: "online" | "offline" | "busy";
	capabilities: string[];
	reputation: number;
	latency: string;
	success: number;
	a2a?: { peers: number; verified: boolean };
};

const CAP_ICON: Record<string, string> = {
	Research: "🔍",
	Analysis: "📊",
	Coding: "💻",
	"Web Search": "🌐",
	Summarization: "📝",
	Review: "✅",
	"Local Inference": "🧠",
	Privacy: "🔒",
	Experience: "🎓",
	Verification: "🛡️",
};

function DIDBadge({ did, verified }: { did: string; verified?: boolean | undefined }) {
	return (
		<span className="did-badge" title={did}>
			<span className="did-badge-dot" aria-hidden>
				⬢
			</span>
			<span className="did-badge-text">{did.slice(0, 18)}…</span>
			{verified && (
				<span className="did-badge-verified" title="Verified DID">
					✓
				</span>
			)}
		</span>
	);
}

function A2AStatus({ peers, verified }: { peers: number; verified?: boolean | undefined }) {
	return (
		<span className={`a2a-status ${verified ? "verified" : ""}`}>
			<span className="a2a-dot" />
			A2A {peers} peers {verified ? "· verified" : ""}
		</span>
	);
}

export function AgentIdentityCard({
	agent,
	onUse,
	onConnect,
}: {
	agent: AgentIdentity;
	onUse?: ((id: string) => void) | undefined;
	onConnect?: ((id: string) => void) | undefined;
}) {
	const statusClass =
		agent.status === "online" ? "online" : agent.status === "busy" ? "busy" : "offline";
	return (
		<article className="mesh-card identity-card">
			<div className="mesh-card-head">
				<div className="identity-head-left">
					<span className={`status-dot ${statusClass}`} aria-label={agent.status} />
					<strong>{agent.name}</strong>
				</div>
				<span className={`mesh-status ${statusClass}`}>● {agent.status}</span>
			</div>

			<div className="identity-did-row">
				<DIDBadge did={agent.did} verified={agent.a2a?.verified} />
				{agent.a2a && <A2AStatus peers={agent.a2a.peers} verified={agent.a2a.verified} />}
			</div>

			<div className="identity-caps">
				{agent.capabilities.map((c) => (
					<span className="cap-chip" key={c}>
						<span className="cap-icon">{CAP_ICON[c] ?? "•"}</span> {c}
					</span>
				))}
			</div>

			<div className="mesh-meta">
				<span>지연 {agent.latency}</span>
				<span>평판 {agent.reputation}</span>
				<span>성공률 {agent.success}%</span>
			</div>

			{/* ISEK discovery hint */}
			<div className="discovery-hint">
				<span className="discovery-label">Discovery</span>
				<span className="discovery-value">
					{agent.a2a
						? `${agent.a2a.peers} nodes · ${agent.a2a.verified ? "attested" : "unverified"}`
						: "local only"}
				</span>
			</div>

			<div className="mesh-actions">
				<button className="btn-secondary" onClick={() => onConnect?.(agent.id)}>
					Connect
				</button>
				<button className="btn-primary" onClick={() => onUse?.(agent.id)}>
					Use
				</button>
			</div>
		</article>
	);
}

export function AgentIdentityGrid({
	agents,
	onUse,
	onConnect,
	filter,
}: {
	agents: AgentIdentity[];
	onUse?: ((id: string) => void) | undefined;
	onConnect?: ((id: string) => void) | undefined;
	filter?: string | undefined;
}) {
	const q = (filter ?? "").toLowerCase();
	const filtered = q
		? agents.filter(
				(a) =>
					a.name.toLowerCase().includes(q) ||
					a.capabilities.join(" ").toLowerCase().includes(q) ||
					a.did.toLowerCase().includes(q),
			)
		: agents;
	return (
		<div className="agent-card-grid">
			{filtered.map((a) => (
				<AgentIdentityCard key={a.id} agent={a} onUse={onUse} onConnect={onConnect} />
			))}
			{filtered.length === 0 && <p className="dash-note">검색 결과 없음: “{filter}”</p>}
		</div>
	);
}

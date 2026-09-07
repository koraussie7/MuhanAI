import { useState } from "react";

// nekoni-inspired: Personal Node Control + Local Agent Node
export type LocalNode = {
	id: string;
	label: string;
	mode: "local" | "browser" | "gateway";
	status: "running" | "idle" | "error";
	uptime?: string;
	tasks: number;
};

export function PersonalNodeControl({
	node,
	onToggle,
	onModeChange,
}: {
	node: LocalNode;
	onToggle?: (running: boolean) => void;
	onModeChange?: (mode: LocalNode["mode"]) => void;
}) {
	const running = node.status === "running";
	return (
		<div className="personal-node-card">
			<div className="personal-node-head">
				<span
					className={`status-dot ${running ? "online" : node.status === "error" ? "offline" : "idle"}`}
				/>
				<strong>{node.label}</strong>
				<span className="personal-node-id">{node.id.slice(0, 10)}…</span>
				<span className={`personal-status ${node.status}`}>{node.status}</span>
			</div>
			<div className="personal-node-meta">
				<span>모드</span>
				<div className="mode-switch">
					{(["local", "browser", "gateway"] as const).map((m) => (
						<button
							key={m}
							className={`policy-chip sm ${node.mode === m ? "active" : ""}`}
							onClick={() => onModeChange?.(m)}
						>
							{m}
						</button>
					))}
				</div>
			</div>
			<div className="personal-node-stats">
				<span>가동 {node.uptime ?? "—"}</span>
				<span>작업 {node.tasks}</span>
				<span className={running ? "text-live" : "text-idle"}>{running ? "● Live" : "○ Idle"}</span>
			</div>
			<div className="mesh-actions">
				<button
					className={running ? "btn-secondary" : "btn-primary"}
					onClick={() => onToggle?.(!running)}
				>
					{running ? "Pause" : "Start"}
				</button>
				<span className="personal-hint">nekoni · Personal Agent Node</span>
			</div>
		</div>
	);
}

export function LocalAgentNodeList({
	nodes,
	onSelect,
}: {
	nodes: LocalNode[];
	onSelect?: (id: string) => void;
}) {
	const [q, setQ] = useState("");
	const filtered = q
		? nodes.filter(
				(n) =>
					n.label.toLowerCase().includes(q.toLowerCase()) ||
					n.id.toLowerCase().includes(q.toLowerCase()),
			)
		: nodes;
	return (
		<div className="local-node-list">
			<div className="local-node-search">
				<input
					className="search-input"
					placeholder="노드 검색…"
					value={q}
					onChange={(e) => setQ(e.target.value)}
				/>
				<span className="local-count">{filtered.length} nodes</span>
			</div>
			<div className="local-node-grid">
				{filtered.map((n) => (
					<button key={n.id} className="local-node-row" onClick={() => onSelect?.(n.id)}>
						<span
							className={`status-dot ${n.status === "running" ? "online" : n.status === "error" ? "offline" : "idle"}`}
						/>
						<span className="local-label">{n.label}</span>
						<span className="local-mode">{n.mode}</span>
						<span className="local-tasks">{n.tasks} tasks</span>
					</button>
				))}
			</div>
		</div>
	);
}

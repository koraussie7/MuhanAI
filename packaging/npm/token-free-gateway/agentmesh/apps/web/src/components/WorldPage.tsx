/**
 * World page — Pythia World Engine panel.
 *
 * Shows the live world state (40+ keyless feeds) and 1d/1w/1m/1y forecasts
 * from the Pythia upstream. Free LLM API-backed: no Ollama, no keys, no cost.
 * Degrades to an offline snapshot when PYTHIA_WORLD_URL is unset or the
 * engine is unreachable — the panel never crashes.
 */

import { Activity, Globe2, RefreshCw, TrendingUp } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface WorldEvent {
	id: string;
	title: string;
	domain: string;
	location?: string;
	severity: "info" | "watch" | "alert";
	source: string;
	timestamp: string;
}

interface WorldPrediction {
	id: string;
	title: string;
	horizon: "24h" | "1w" | "1m" | "1y";
	probability: number;
	confidence: number;
	rationale: string;
}

interface WorldBrief {
	source: "pythia" | "offline";
	summary: string;
	domains: string[];
	events: WorldEvent[];
	predictions: WorldPrediction[];
	fetchedAt: string;
}

const HORIZONS: ReadonlyArray<{ key: "24h" | "1w" | "1m" | "1y"; label: string }> = [
	{ key: "24h", label: "24시간" },
	{ key: "1w", label: "1주" },
	{ key: "1m", label: "1개월" },
	{ key: "1y", label: "1년" },
];

function severityColor(severity: WorldEvent["severity"]): string {
	if (severity === "alert") return "var(--cline-rose, #f43f5e)";
	if (severity === "watch") return "var(--cline-amber, #f59e0b)";
	return "var(--cline-green, #10b981)";
}

function probabilityColor(p: number): string {
	if (p >= 0.7) return "var(--cline-rose, #f43f5e)";
	if (p >= 0.4) return "var(--cline-amber, #f59e0b)";
	return "var(--cline-green, #10b981)";
}

export const WorldPage: React.FC = () => {
	const [brief, setBrief] = useState<WorldBrief | null>(null);
	const [loading, setLoading] = useState(false);
	const [horizon, setHorizon] = useState<"24h" | "1w" | "1m" | "1y">("1w");

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/world/brief", { credentials: "include" });
			if (res.ok) setBrief((await res.json()) as WorldBrief);
		} catch {
			// panel degrades silently
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const events = brief?.events ?? [];
	const predictions = (brief?.predictions ?? []).filter((p) => p.horizon === horizon);
	const live = brief?.source === "pythia";

	return (
		<div className="cline-chat-container">
			<div className="dashboard-hero-card" style={{ padding: "20px 24px" }}>
				<div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
					<Globe2 size={28} style={{ color: "#38bdf8" }} />
					<div style={{ flex: 1 }}>
						<h1 className="dashboard-hero-title" style={{ fontSize: 20 }}>
							World — Pythia World Engine
						</h1>
						<p className="dashboard-hero-desc">
							40+ 키리스 라이브 피드를 하나의 세계 상태로 통합하고 24h/1w/1m/1y 예측을 제공. Free
							LLM API 기반 — 키 없이, 비용 없이.
						</p>
					</div>
					<span
						style={{
							fontSize: 11,
							fontWeight: 700,
							padding: "3px 10px",
							borderRadius: 999,
							background: live ? "rgba(16,185,129,0.15)" : "rgba(148,163,184,0.15)",
							color: live ? "var(--cline-green, #10b981)" : "#94a3b8",
						}}
					>
						{live ? "LIVE" : "OFFLINE"}
					</span>
					<button
						type="button"
						onClick={load}
						disabled={loading}
						style={{
							background: "transparent",
							border: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
							borderRadius: 6,
							padding: "6px 10px",
							cursor: "pointer",
							color: "var(--cline-text)",
							display: "flex",
							alignItems: "center",
							gap: 6,
						}}
					>
						<RefreshCw size={14} /> 새로고침
					</button>
				</div>
			</div>

			{brief && (
				<div className="result-card" style={{ marginTop: 16, padding: 16 }}>
					<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
						<Activity size={14} style={{ color: "#38bdf8" }} />
						<span style={{ fontSize: 12, fontWeight: 700, color: "var(--cline-text)" }}>
							WORLD BRIEF
						</span>
					</div>
					<p style={{ fontSize: 13, color: "var(--cline-text-muted)", lineHeight: 1.6 }}>
						{brief.summary}
					</p>
					<div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
						{brief.domains.map((d) => (
							<span
								key={d}
								style={{
									fontSize: 11,
									padding: "2px 8px",
									borderRadius: 999,
									background: "rgba(56,189,248,0.12)",
									color: "#38bdf8",
								}}
							>
								{d}
							</span>
						))}
					</div>
				</div>
			)}

			<div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
				<div style={{ flex: 1, minWidth: 300 }}>
					<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
						실시간 이벤트 ({events.length})
					</h3>
					{events.length === 0 && (
						<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>이벤트가 없습니다.</p>
					)}
					{events.slice(0, 20).map((e) => (
						<div
							key={e.id}
							style={{
								padding: "10px 14px",
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								borderRadius: 8,
								marginBottom: 8,
								borderLeft: `3px solid ${severityColor(e.severity)}`,
							}}
						>
							<div style={{ fontSize: 13, color: "var(--cline-text)" }}>{e.title}</div>
							<div
								style={{
									fontSize: 11,
									color: "var(--cline-text-muted)",
									marginTop: 4,
									display: "flex",
									gap: 8,
								}}
							>
								<span>{e.domain}</span>
								{e.location && <span>· {e.location}</span>}
								<span>· {e.source}</span>
							</div>
						</div>
					))}
				</div>

				<div style={{ flex: 1, minWidth: 300 }}>
					<h3 style={{ color: "var(--cline-text)", fontSize: 14, marginBottom: 10 }}>
						예측 (Prediction)
					</h3>
					<div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
						{HORIZONS.map((h) => (
							<button
								key={h.key}
								type="button"
								onClick={() => setHorizon(h.key)}
								style={{
									fontSize: 12,
									padding: "4px 10px",
									borderRadius: 999,
									border:
										horizon === h.key
											? "1px solid #38bdf8"
											: "1px solid var(--cline-border, rgba(255,255,255,0.1))",
									background: horizon === h.key ? "rgba(56,189,248,0.15)" : "transparent",
									color: horizon === h.key ? "#38bdf8" : "var(--cline-text-muted)",
									cursor: "pointer",
								}}
							>
								{h.label}
							</button>
						))}
					</div>
					{predictions.length === 0 && (
						<p style={{ color: "var(--cline-text-muted)", fontSize: 13 }}>
							해당 기간 예측이 없습니다.
						</p>
					)}
					{predictions.map((p) => (
						<div
							key={p.id}
							style={{
								padding: "10px 14px",
								background: "var(--cline-bg-tertiary, rgba(255,255,255,0.03))",
								borderRadius: 8,
								marginBottom: 8,
							}}
						>
							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									gap: 8,
								}}
							>
								<span style={{ fontSize: 13, color: "var(--cline-text)" }}>
									<TrendingUp
										size={12}
										style={{
											verticalAlign: -1,
											marginRight: 6,
											color: probabilityColor(p.probability),
										}}
									/>
									{p.title}
								</span>
								<span
									style={{
										fontSize: 12,
										fontWeight: 700,
										color: probabilityColor(p.probability),
										whiteSpace: "nowrap",
									}}
								>
									{Math.round(p.probability * 100)}%
								</span>
							</div>
							{p.rationale && (
								<div
									style={{
										fontSize: 11,
										color: "var(--cline-text-muted)",
										marginTop: 6,
										lineHeight: 1.5,
									}}
								>
									{p.rationale}
								</div>
							)}
						</div>
					))}
				</div>
			</div>

			{brief && (
				<p style={{ fontSize: 11, color: "var(--cline-text-muted)", marginTop: 16 }}>
					fetched {new Date(brief.fetchedAt).toLocaleString("ko-KR")} · source: {brief.source}
				</p>
			)}
		</div>
	);
};

export default WorldPage;

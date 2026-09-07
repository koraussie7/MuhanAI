import { useEffect, useState } from "react";
import { createHttpAdapter, createResilientAdapter, type ResourceAdapter } from "./adapter.js";
import type { GatewayProvider } from "./GatewayPanel.js";
import { ApiVault, GatewayTable, PolicyChain } from "./GatewayPanel.js";

/**
 * LlmMeshPage — TASK-C tkngate LLM Mesh & Gateway panel.
 *
 * Owns three concerns:
 *   1. Provider health snapshot (zero-trust gateway table)
 *   2. Active policy chain (deterministic LLM routing chain)
 *   3. Live latency waterfall + per-provider quota vault
 *
 * Replaces the previous LlmMeshPage that lived in DashPages.tsx with a
 * TASK-C-native surface (.hc-* classes, ApiVault, PolicyChain, GatewayTable).
 * DashPages.tsx re-exports this so App.tsx import paths stay unchanged.
 */

export interface LlmMeshRoute {
	provider: string;
	latencyMs: number;
	costTier: "free" | "low" | "paid";
	status: "optimal" | "acceptable" | "degraded";
}

export interface LlmMeshVaultEntry {
	name: string;
	quota: number;
	used: number;
}

export interface LlmMeshSnapshot {
	gateways: GatewayProvider[];
	routes: LlmMeshRoute[];
	vault: LlmMeshVaultEntry[];
}

export interface LlmMeshAdapter extends ResourceAdapter<LlmMeshSnapshot> {}

/**
 * Stub producer for fallback when the live endpoint is unreachable.
 * Exported so tests can pair it with `createResilientAdapter`.
 */
export function stubLlmMeshSnapshot(): LlmMeshSnapshot {
	const baseRoutes: LlmMeshRoute[] = [
		{ provider: "WebLLM (Local)", latencyMs: 18, costTier: "free", status: "optimal" },
		{ provider: "P2P Mesh Node", latencyMs: 34, costTier: "free", status: "optimal" },
		{ provider: "FreeLLMAPI", latencyMs: 192, costTier: "free", status: "acceptable" },
		{ provider: "Groq LPU", latencyMs: 148, costTier: "low", status: "acceptable" },
		{ provider: "Anthropic Claude", latencyMs: 820, costTier: "paid", status: "degraded" },
	];
	return {
		gateways: [
			{ name: "Gemini", status: "healthy", latencyMs: 180, costTier: "low" },
			{ name: "Claude", status: "healthy", latencyMs: 220, costTier: "paid" },
			{ name: "GPT", status: "healthy", latencyMs: 240, costTier: "paid" },
			{ name: "Mistral", status: "degraded", latencyMs: 420, costTier: "low" },
			{ name: "Groq", status: "healthy", latencyMs: 150, costTier: "low" },
			{ name: "Cerebras", status: "healthy", latencyMs: 130, costTier: "low" },
			{ name: "OpenRouter", status: "healthy", latencyMs: 360, costTier: "paid" },
			{ name: "FreeLLMAPI", status: "healthy", latencyMs: 210, costTier: "free" },
			{ name: "LocalAI", status: "healthy", latencyMs: 90, costTier: "free" },
			{ name: "Ollama", status: "healthy", latencyMs: 110, costTier: "free" },
			{ name: "WebLLM", status: "healthy", latencyMs: 60, costTier: "free" },
		],
		routes: baseRoutes,
		vault: [
			{ name: "openai", quota: 1000, used: 412 },
			{ name: "anthropic", quota: 500, used: 188 },
			{ name: "gemini", quota: 1500, used: 720 },
			{ name: "groq", quota: 800, used: 96 },
		],
	};
}

function defaultLlmMeshAdapter(): LlmMeshAdapter {
	return createResilientAdapter<LlmMeshSnapshot>(
		createHttpAdapter<LlmMeshSnapshot>("/api/llm-mesh"),
		stubLlmMeshSnapshot,
	);
}

export interface LlmMeshPageProps {
	/** Inject a real adapter; default = resilient HTTP→stub. */
	adapter?: LlmMeshAdapter;
}

const POLICIES = [
	{
		id: "free-first",
		label: "Free First",
		chain: [
			"WebLLM (로컬 브라우저)",
			"FreeLLMAPI (무료 쿼터)",
			"P2P Compute (메시 공유)",
			"Paid API (최후 폴백)",
		],
	},
	{
		id: "local-first",
		label: "Local First",
		chain: [
			"WebLLM (로컬 브라우저)",
			"LocalAI / Ollama (셀프호스트)",
			"FreeLLMAPI (무료 쿼터)",
			"Paid API (폴백)",
		],
	},
	{
		id: "lowest-cost",
		label: "Lowest Cost",
		chain: ["FreeLLMAPI", "Groq LPU (저가)", "Cerebras (저가)", "P2P Mesh Node", "Paid API (최후)"],
	},
	{
		id: "fastest",
		label: "Fastest",
		chain: ["WebLLM", "Groq LPU", "Cerebras", "FreeLLMAPI", "Paid API"],
	},
	{
		id: "best-quality",
		label: "Best Quality",
		chain: ["Claude (paid)", "GPT-4o (paid)", "Gemini Pro", "FreeLLMAPI"],
	},
	{
		id: "privacy-first",
		label: "Privacy First",
		chain: ["WebLLM (로컬)", "LocalAI", "Ollama", "On-prem Mesh"],
	},
	{
		id: "balanced",
		label: "Balanced",
		chain: [
			"WebLLM (지연 우선)",
			"Groq LPU (저가·고속)",
			"Gemini Pro (균형)",
			"Paid API (품질 폴백)",
		],
	},
] as const;

const MAX_LATENCY_MS = 1000;

export function LlmMeshPage({ adapter }: LlmMeshPageProps = {}) {
	const adp = adapter ?? defaultLlmMeshAdapter();
	const [policyId, setPolicyId] = useState<string>("balanced");
	const [snapshot, setSnapshot] = useState<LlmMeshSnapshot | null>(null);

	const refresh = async () => {
		const next = await adp.loadSnapshot();
		setSnapshot(next);
	};

	useEffect(() => {
		void refresh();
		const timer = setInterval(() => void refresh(), 30_000);
		return () => clearInterval(timer);
	}, []);

	const activePolicy = POLICIES.find((p) => p.id === policyId) ?? POLICIES[6];

	const totalVault = snapshot?.vault ?? [];
	const totalQuota = totalVault.reduce((s, v) => s + v.quota, 0);
	const totalUsed = totalVault.reduce((s, v) => s + v.used, 0);
	const usedPct = totalQuota > 0 ? Math.round((totalUsed / totalQuota) * 100) : 0;

	const healthyCount = snapshot
		? snapshot.gateways.filter((g) => g.status === "healthy").length
		: 0;
	const degradedCount = snapshot
		? snapshot.gateways.filter((g) => g.status === "degraded").length
		: 0;

	return (
		<div className="hc-llm-mesh">
			{/* Header summary */}
			<section className="hc-panel">
				<h3 className="hc-panel-title">LLM Mesh Overview</h3>
				<p className="hc-panel-meta">
					tkngate zero-trust routing · 활성 정책: <strong>{activePolicy.label}</strong>
				</p>
				<div className="hc-llm-stat">
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Healthy Providers</span>
						<span className="hc-llm-stat-value">{healthyCount}</span>
					</div>
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Degraded</span>
						<span className={`hc-llm-stat-value ${degradedCount > 0 ? "" : "muted"}`}>
							{degradedCount}
						</span>
					</div>
					<div className="hc-llm-stat-item">
						<span className="hc-llm-stat-label">Daily Quota Used</span>
						<span className="hc-llm-stat-value">
							{totalUsed.toLocaleString("ko-KR")} / {totalQuota.toLocaleString("ko-KR")} ({usedPct}
							%)
						</span>
					</div>
				</div>
			</section>

			{/* Provider chips — quick status glance */}
			<section className="hc-panel">
				<h3 className="hc-panel-title">Providers</h3>
				<p className="hc-panel-meta">실시간 헬스 체크 결과</p>
				<div className="hc-provider-chips">
					{(snapshot?.gateways ?? []).map((g) => (
						<span key={g.name} className={`hc-provider-chip ${g.status}`}>
							{g.name}
						</span>
					))}
				</div>
			</section>

			{/* Policy selector */}
			<section className="hc-panel">
				<h3 className="hc-panel-title">Routing Policy</h3>
				<p className="hc-panel-meta">요청 → 정책 체인 순서로 라우팅 결정</p>
				<div className="hc-policy-row">
					{POLICIES.map((p) => (
						<button
							key={p.id}
							type="button"
							className={`hc-policy-chip ${p.id === policyId ? "active" : ""}`}
							onClick={() => setPolicyId(p.id)}
							aria-pressed={p.id === policyId}
						>
							{p.label}
						</button>
					))}
				</div>
			</section>

			{/* Active policy chain — read-only visualization */}
			<PolicyChain chain={activePolicy.chain} />

			{/* Latency waterfall */}
			<section className="hc-panel">
				<h3 className="hc-panel-title">Latency Waterfall</h3>
				<p className="hc-panel-meta">라우트별 실시간 지연 (ms)</p>
				<ul className="hc-latency-list">
					{(snapshot?.routes ?? []).map((r) => {
						const widthPct = Math.min(100, (r.latencyMs / MAX_LATENCY_MS) * 100);
						const fillClass = r.latencyMs < 50 ? "cool" : r.latencyMs < 300 ? "cool" : "hot";
						return (
							<li key={r.provider} className="hc-latency-row">
								<div className="hc-latency-name">
									<span
										className={`hc-status-dot ${r.status === "optimal" ? "idle" : r.status === "acceptable" ? "warm" : "hot"}`}
									/>
									<strong>{r.provider}</strong>
									<span className={`hc-cost-tier ${r.costTier}`}>{r.costTier}</span>
								</div>
								<span className="hc-latency-ms">{r.latencyMs} ms</span>
								<div className="hc-latency-bar-wrap">
									<div className="hc-load-bar">
										<div
											className={`hc-load-bar-fill ${fillClass}`}
											style={{ width: `${Math.max(4, widthPct)}%` }}
										/>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			</section>

			{/* Gateway providers table — zero-trust health */}
			<GatewayTable providers={snapshot?.gateways ?? []} />

			{/* API vault — quota usage per provider */}
			<ApiVault entries={snapshot?.vault ?? []} />
		</div>
	);
}

export default LlmMeshPage;

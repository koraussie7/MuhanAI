import { useEffect, useState } from "react";

// Visual from tkngate + peerd: Real-Time Latency & Failover Waterfall Chart
export interface RouteLatency {
	provider: string;
	route: string;
	latencyMs: number;
	status: "optimal" | "acceptable" | "degraded";
	costTier: "free" | "low" | "paid";
	isFailover?: boolean;
}

const INITIAL_ROUTES: RouteLatency[] = [
	{
		provider: "WebLLM (Local)",
		route: "Browser Memory ➔ WebGPU",
		latencyMs: 14,
		status: "optimal",
		costTier: "free",
	},
	{
		provider: "P2P Mesh Node (KR)",
		route: "WebRTC DataChannel #42",
		latencyMs: 28,
		status: "optimal",
		costTier: "free",
	},
	{
		provider: "FreeLLMAPI Gateway",
		route: "HTTP/2 WebSession Stream",
		latencyMs: 185,
		status: "acceptable",
		costTier: "free",
	},
	{
		provider: "Groq LPU Engine",
		route: "Direct Cloud API (Tier 2)",
		latencyMs: 142,
		status: "acceptable",
		costTier: "low",
	},
	{
		provider: "Anthropic Claude 3.5",
		route: "Zero-Trust Failover Vault",
		latencyMs: 840,
		status: "degraded",
		costTier: "paid",
		isFailover: true,
	},
];

export function LatencyVisualizer() {
	const [routes, setRoutes] = useState<RouteLatency[]>(INITIAL_ROUTES);

	// Live Jitter
	useEffect(() => {
		const timer = setInterval(() => {
			setRoutes((prev) =>
				prev.map((r) => ({
					...r,
					latencyMs: Math.max(8, r.latencyMs + Math.floor((Math.random() - 0.5) * 8)),
				})),
			);
		}, 1500);
		return () => clearInterval(timer);
	}, []);

	const maxLatency = 1000;

	return (
		<div className="latency-viz-card">
			<div className="latency-viz-header">
				<div className="latency-viz-title">
					<span className="latency-pulse-dot" />
					<strong>TKNGATE ROUTE WATERFALL & LATENCY SPECTRUM</strong>
					<span className="protocol-badge proto-webrtc">ZERO-TRUST ROUTING</span>
				</div>
				<div className="latency-fastest-badge">
					FASTEST: <strong style={{ color: "#e6ff87" }}>14 ms (WebLLM)</strong>
				</div>
			</div>

			<div className="latency-routes-table">
				{routes.map((r) => {
					const widthPct = Math.min(100, (r.latencyMs / maxLatency) * 100);
					return (
						<div className="latency-route-row" key={r.provider}>
							<div className="latency-provider-info">
								<span
									className={`status-dot ${r.status === "optimal" ? "online" : r.status === "acceptable" ? "busy" : "offline"}`}
								/>
								<strong className="latency-p-name">{r.provider}</strong>
								{r.isFailover && <span className="failover-chip">FAILOVER</span>}
								<span className="latency-route-desc">{r.route}</span>
							</div>

							{/* Animated Bar Meter */}
							<div className="latency-bar-container">
								<div
									className="latency-bar-fill"
									style={{
										width: `${Math.max(5, widthPct)}%`,
										background:
											r.latencyMs < 50
												? "linear-gradient(90deg, #38bdf8, #e6ff87)"
												: r.latencyMs < 300
													? "#e6ff87"
													: "#ffb86b",
									}}
								/>
							</div>

							<div className="latency-num-col">
								<strong style={{ color: r.latencyMs < 100 ? "#e6ff87" : "#f4f5ed" }}>
									{r.latencyMs} ms
								</strong>
								<span className="cost-tier-tag">{r.costTier.toUpperCase()}</span>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

import { useEffect, useState } from "react";

// Visual from mycellm + distributed-ai-cluster: GPU Blade Server Rack Visualizer
export interface GpuBlade {
	id: string;
	slot: number;
	model: string;
	vramUsed: number; // GB
	vramTotal: number; // GB
	utilization: number; // %
	temp: number; // C
	fanSpeed: number; // %
	activeJob: string;
	status: "active" | "cooling" | "standby";
}

const INITIAL_BLADES: GpuBlade[] = [
	{
		id: "blade-01",
		slot: 1,
		model: "NVIDIA A100 SXM4 80GB",
		vramUsed: 74,
		vramTotal: 80,
		utilization: 92,
		temp: 68,
		fanSpeed: 78,
		activeJob: "DeepSeek-R1-32B Batch #982",
		status: "active",
	},
	{
		id: "blade-02",
		slot: 2,
		model: "NVIDIA H100 NVL 94GB",
		vramUsed: 89,
		vramTotal: 94,
		utilization: 98,
		temp: 74,
		fanSpeed: 88,
		activeJob: "Llama-3.3-70B Q4 Sharded",
		status: "active",
	},
	{
		id: "blade-03",
		slot: 3,
		model: "Apple Silicon M3 Max 128GB",
		vramUsed: 42,
		vramTotal: 128,
		utilization: 48,
		temp: 52,
		fanSpeed: 45,
		activeJob: "WebSession Relay & Embedding",
		status: "active",
	},
	{
		id: "blade-04",
		slot: 4,
		model: "GeForce RTX 4090 24GB",
		vramUsed: 21,
		vramTotal: 24,
		utilization: 84,
		temp: 64,
		fanSpeed: 72,
		activeJob: "InfoMesh Vector Indexing",
		status: "active",
	},
];

export function GpuRackVisualizer() {
	const [blades, setBlades] = useState<GpuBlade[]>(INITIAL_BLADES);

	// Live Jitter Simulation
	useEffect(() => {
		const timer = setInterval(() => {
			setBlades((prev) =>
				prev.map((b) => {
					const delta = (Math.random() - 0.5) * 4;
					const nextUtil = Math.max(10, Math.min(99, Math.round(b.utilization + delta)));
					return {
						...b,
						utilization: nextUtil,
						temp: Math.round(50 + (nextUtil / 100) * 25),
					};
				}),
			);
		}, 2000);
		return () => clearInterval(timer);
	}, []);

	return (
		<div className="gpu-rack-container">
			<div className="gpu-rack-header">
				<div className="gpu-rack-title">
					<span className="rack-led-green" />
					<strong>DISTRIBUTED GPU RACK ENCLOSURE (4U BLADE)</strong>
					<span className="protocol-badge proto-webrtc">CUDA / METAL / ROCm</span>
				</div>
				<div className="gpu-rack-stats">
					<span>
						총 VRAM: <strong>226 / 326 GB</strong>
					</span>
					<span>
						연산 클럭: <strong>3.2 GHz</strong>
					</span>
				</div>
			</div>

			<div className="gpu-rack-chassis">
				{blades.map((b) => {
					const vramPct = Math.round((b.vramUsed / b.vramTotal) * 100);
					return (
						<div className="gpu-blade-unit" key={b.id}>
							<div className="blade-ear">
								<span className="rack-screw" />
								<span className="blade-slot">U{b.slot}</span>
								<span className="rack-screw" />
							</div>

							<div className="blade-faceplate">
								<div className="blade-info-col">
									<div className="blade-model-row">
										<span className="blade-activity-led on" />
										<strong className="blade-model-name">{b.model}</strong>
										<span className="blade-temp-badge">{b.temp}°C</span>
									</div>
									<div className="blade-job-name">Job: {b.activeJob}</div>
								</div>

								{/* VRAM Utilization Meter */}
								<div className="blade-meter-col">
									<div className="blade-meter-labels">
										<span>
											VRAM {b.vramUsed}G / {b.vramTotal}G
										</span>
										<strong style={{ color: vramPct > 90 ? "#ffb86b" : "#e6ff87" }}>
											{vramPct}%
										</strong>
									</div>
									<div className="blade-bar-track">
										<div
											className="blade-bar-fill"
											style={{
												width: `${vramPct}%`,
												background:
													vramPct > 90
														? "linear-gradient(90deg, #ffb86b, #ff5c5c)"
														: "linear-gradient(90deg, #38bdf8, #e6ff87)",
											}}
										/>
									</div>
								</div>

								{/* GPU Core Load Gauge */}
								<div className="blade-load-col">
									<div className="blade-meter-labels">
										<span>CORE LOAD</span>
										<strong style={{ color: "#e6ff87" }}>{b.utilization}%</strong>
									</div>
									<div className="blade-bar-track">
										<div className="blade-bar-fill load" style={{ width: `${b.utilization}%` }} />
									</div>
								</div>

								<div className="blade-fan-badge">FAN: {b.fanSpeed}%</div>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

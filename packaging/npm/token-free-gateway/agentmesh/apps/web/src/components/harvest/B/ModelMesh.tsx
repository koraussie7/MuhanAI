const MODELS = [
	{
		name: "Gemini 2.5 Pro",
		provider: "Google",
		status: "Online",
		latency: "1.2s",
	},
	{
		name: "Claude Sonnet 4",
		provider: "Anthropic",
		status: "Online",
		latency: "0.9s",
	},
	{ name: "GPT-4o", provider: "OpenAI", status: "Online", latency: "1.1s" },
	{
		name: "Llama 4 Maverick",
		provider: "Meta",
		status: "Online",
		latency: "2.4s",
	},
	{
		name: "DeepSeek R1",
		provider: "DeepSeek",
		status: "Busy",
		latency: "3.1s",
	},
];

export function ModelMeshGrid() {
	return (
		<section className="panel">
			<div className="section-heading compact">
				<span className="section-label">MODELS / MESH</span>
				<h2>
					Model <em>Mesh</em>
				</h2>
			</div>
			<div className="agent-card-grid">
				{MODELS.map((m) => (
					<article key={m.name} className="mesh-card">
						<div className="mesh-card-head">
							<strong>{m.name}</strong>
							<span className={`mesh-status ${m.status === "Online" ? "online" : "offline"}`}>
								● {m.status}
							</span>
						</div>
						<p className="mesh-caps">{m.provider}</p>
						<div className="mesh-meta">
							<span>Latency: {m.latency}</span>
						</div>
						<div className="mesh-actions">
							<button className="btn-secondary small">Route</button>
							<button className="btn-primary small">Use</button>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

export default ModelMeshGrid;

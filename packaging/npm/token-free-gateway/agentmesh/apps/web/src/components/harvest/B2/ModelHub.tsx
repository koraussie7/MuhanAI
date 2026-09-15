import { useEffect, useState } from "react";

interface ModelItem {
	name: string;
	provider: string;
	status: "Online" | "Busy" | "Offline";
	backend: string;
	size: string;
	ctx: number;
}

const TABS = ["installed", "browse"] as const;
type Tab = (typeof TABS)[number];

export function ModelHub() {
	const [query, setQuery] = useState("");
	const [tab, setTab] = useState<Tab>("installed");
	const [models, setModels] = useState<ModelItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (tab !== "installed") return;
		const controller = new AbortController();
		setLoading(true);
		fetch("/api/models", { signal: controller.signal })
			.then((res) => (res.ok ? res.json() : []))
			.then((data: ModelItem[]) => setModels(Array.isArray(data) ? data : []))
			.catch(() => setModels([]))
			.finally(() => setLoading(false));
		return () => controller.abort();
	}, [tab]);

	const filtered = models.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));

	return (
		<section className="panel">
			<div className="section-heading compact">
				<span className="section-label">MODELS / HUB</span>
				<h2>
					Model <em>Hub</em>
				</h2>
			</div>

			<div className="policy-row" style={{ marginBottom: 12 }}>
				{TABS.map((t) => (
					<button
						key={t}
						type="button"
						className={tab === t ? "policy-chip active" : "policy-chip"}
						onClick={() => setTab(t)}
					>
						{t === "installed" ? "Installed / Local" : "Browse HuggingFace"}
					</button>
				))}
			</div>

			<div className="ask-input-group" style={{ marginBottom: 12 }}>
				<input
					className="ask-input"
					placeholder="Search models, e.g. llama 7b, mistral, phi..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				<button type="button" className="ask-btn">
					Search
				</button>
			</div>

			<div className="spec-grid">
				{loading ? (
					<div className="trend-row">Loading models…</div>
				) : filtered.length === 0 ? (
					<div className="trend-row">
						{tab === "installed"
							? "No models registered yet. Start an Ollama daemon or wire a model registry to populate this list."
							: "Browse HuggingFace — not wired in this build."}
					</div>
				) : (
					filtered.map((m) => (
						<div key={m.name} className="spec-card">
							<div className="mesh-card-head">
								<strong>{m.name}</strong>
								<span className={`mesh-status ${m.status === "Online" ? "online" : "offline"}`}>
									● {m.status}
								</span>
							</div>
							<p className="mesh-caps">{m.provider}</p>
							<div className="mesh-meta">
								<span>Backend: {m.backend}</span>
								<span>Size: {m.size}</span>
								<span>Ctx: {m.ctx || "—"}</span>
							</div>
							<div className="mesh-actions">
								<button type="button" className="btn-secondary small">
									Load
								</button>
								<button type="button" className="btn-primary small">
									Use
								</button>
							</div>
						</div>
					))
				)}
			</div>
		</section>
	);
}

export default ModelHub;

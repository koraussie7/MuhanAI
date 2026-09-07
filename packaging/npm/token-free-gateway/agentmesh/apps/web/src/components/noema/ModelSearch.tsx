import { useState } from "react";

export interface ModelManifest {
	id: string;
	name: string;
	description?: string;
	license?: string;
	quantization?: string;
	sizeBytes: number;
}

export function ModelSearch({ onSelect }: { onSelect: (manifest: ModelManifest) => void }) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<ModelManifest[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const search = async () => {
		if (!query.trim()) return;
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/noema/search", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ query, limit: 20 }),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error ?? "search failed");
			setResults(data.manifests ?? []);
		} catch (e) {
			setError(e instanceof Error ? e.message : "search failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<section className="panel">
			<div className="search-bar">
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="모델 검색... 예: qwen3 8b gguf"
					onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
				/>
				<button onClick={search} disabled={loading}>
					{loading ? "검색 중..." : "Search"}
				</button>
			</div>
			{error && <p className="form-error">{error}</p>}
			{results.length > 0 && (
				<div className="model-list">
					{results.map((m) => (
						<article key={m.id} className="model-card">
							<h4>{m.name}</h4>
							<p>{m.description}</p>
							<div className="model-meta">
								<span>{m.quantization}</span>
								<span>{(m.sizeBytes / 1024 / 1024 / 1024).toFixed(1)} GB</span>
								<span>{m.license}</span>
							</div>
							<button onClick={() => onSelect(m)}>다운로드</button>
						</article>
					))}
				</div>
			)}
		</section>
	);
}

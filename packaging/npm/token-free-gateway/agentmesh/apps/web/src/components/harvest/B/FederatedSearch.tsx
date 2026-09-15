import { useEffect, useState } from "react";

interface SearchResult {
	title: string;
	snippet: string;
	verified: boolean;
	source: string;
	confidence: number;
}

const FILTERS = ["All", "MCP", "P2P", "Verified", "Knowledge", "Web"] as const;
type Filter = (typeof FILTERS)[number];

export function FederatedSearch() {
	const [query, setQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState<Filter>("All");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const q = query.trim();
		if (!q) {
			setResults([]);
			return;
		}
		const controller = new AbortController();
		setLoading(true);
		const handle = setTimeout(() => {
			fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
				.then((res) => (res.ok ? res.json() : []))
				.then((data: SearchResult[]) => setResults(Array.isArray(data) ? data : []))
				.catch(() => setResults([]))
				.finally(() => setLoading(false));
		}, 300);
		return () => {
			clearTimeout(handle);
			controller.abort();
		};
	}, [query]);

	return (
		<section className="panel">
			<div className="section-heading compact">
				<span className="section-label">SEARCH / FEDERATED</span>
				<h2>
					P2P Search <em>+ MCP</em>
				</h2>
			</div>

			<div className="ask-input-group">
				<input
					className="ask-input"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search across P2P network, MCP tools, and knowledge base..."
				/>
				<button type="button" className="ask-btn">
					Search
				</button>
			</div>

			<div className="policy-row" style={{ marginBottom: 16 }}>
				{FILTERS.map((f) => (
					<button
						key={f}
						type="button"
						className={f === activeFilter ? "policy-chip active" : "policy-chip"}
						onClick={() => setActiveFilter(f)}
					>
						{f}
					</button>
				))}
			</div>

			<div className="trend-list">
				{loading ? (
					<div className="trend-row">Searching…</div>
				) : !query.trim() ? (
					<div className="trend-row">Enter a query to search the federated network.</div>
				) : results.length === 0 ? (
					<div className="trend-row">
						No matches. Wire an info-mesh index or knowledge base to populate results.
					</div>
				) : (
					results.map((r) => (
						<div key={r.title} className="trend-row">
							<div>
								<div className="trend-question">{r.title}</div>
								<div className="trend-bar-wrap" style={{ marginTop: 6 }}>
									<div className="trend-bar" style={{ width: `${r.confidence}%` }} />
								</div>
								<div className="trend-snippet" style={{ marginTop: 4, opacity: 0.7 }}>
									{r.snippet}
								</div>
							</div>
							<span className="trend-score">{r.confidence}%</span>
							<span className={`agent-badge ${r.verified ? "Agent" : "Human"}`}>
								{r.verified ? "Verified" : "Unverified"}
							</span>
						</div>
					))
				)}
			</div>
		</section>
	);
}

export default FederatedSearch;

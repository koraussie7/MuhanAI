import { useState } from "react";

interface SearchResult {
	title: string;
	snippet: string;
	verified: boolean;
	source: string;
	confidence: number;
}

const FILTERS = ["All", "MCP", "P2P", "Verified", "Knowledge", "Web"];

const DEMO_RESULTS: SearchResult[] = [
	{
		title: "베트남 비자 런 규정 2025",
		snippet: "최근 변경된 비자 규정에 대한 요약...",
		verified: true,
		source: "gov.vn",
		confidence: 92,
	},
	{
		title: "USDT P2P 거래 안전 가이드",
		snippet: "미얀마 현지 P2P 거래 시 주의사항...",
		verified: false,
		source: "community",
		confidence: 74,
	},
	{
		title: "다낭 장기 거주 팁",
		snippet: "다낭에서 장기 거주를 위한 정보...",
		verified: true,
		source: "local-guide",
		confidence: 88,
	},
];

export function FederatedSearch() {
	const [query, setQuery] = useState("");
	const [activeFilter, setActiveFilter] = useState("All");

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
				<button className="ask-btn">Search</button>
			</div>

			<div className="policy-row" style={{ marginBottom: 16 }}>
				{FILTERS.map((f) => (
					<button
						key={f}
						className={f === activeFilter ? "policy-chip active" : "policy-chip"}
						onClick={() => setActiveFilter(f)}
					>
						{f}
					</button>
				))}
			</div>

			<div className="trend-list">
				{DEMO_RESULTS.map((r, i) => (
					<div key={i} className="trend-row">
						<div>
							<div className="trend-question">{r.title}</div>
							<div className="trend-bar-wrap" style={{ marginTop: 6 }}>
								<div className="trend-bar" style={{ width: `${r.confidence}%` }} />
							</div>
						</div>
						<span className="trend-score">{r.confidence}%</span>
						<span className={`agent-badge ${r.verified ? "Agent" : "Human"}`}>
							{r.verified ? "Verified" : "Unverified"}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

export default FederatedSearch;

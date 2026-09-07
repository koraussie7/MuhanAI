interface KnowledgeItem {
	title: string;
	kind: string;
	confidence: number;
	provenance: string;
}

const KNOWLEDGE_ITEMS: KnowledgeItem[] = [
	{
		title: "베트남 비자 규정",
		kind: "gov",
		confidence: 92,
		provenance: "gov.vn · 2025-03",
	},
	{
		title: "USDT P2P 거래 가이드",
		kind: "community",
		confidence: 74,
		provenance: "community · 2025-06",
	},
	{
		title: "다낭 장기 거주 팁",
		kind: "local",
		confidence: 88,
		provenance: "local-guide · 2025-01",
	},
];

export function KnowledgePool() {
	return (
		<section className="panel">
			<div className="section-heading compact">
				<span className="section-label">KNOWLEDGE / POOL</span>
				<h2>
					Knowledge <em>Pool</em>
				</h2>
			</div>
			<div className="help-grid">
				{KNOWLEDGE_ITEMS.map((item, i) => (
					<div key={i} className="help-card">
						<span className="help-badge">{item.kind}</span>
						<h4 className="help-question">{item.title}</h4>
						<div className="help-meta">
							<span>Provenance: {item.provenance}</span>
							<span className="help-reward">Confidence: {item.confidence}%</span>
						</div>
						<div className="help-actions">
							<button className="btn-primary small">Verify</button>
							<button className="btn-secondary small">Detail</button>
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

export default KnowledgePool;

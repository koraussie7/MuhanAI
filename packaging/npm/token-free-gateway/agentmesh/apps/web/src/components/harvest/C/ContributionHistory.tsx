/**
 * ContributionHistory — p2ptokens ledger/accounting + reward patterns.
 * Shows a timeline of contributions with credits earned.
 */
export interface ContributionEntry {
	id: string;
	type: "answer" | "verify" | "teach" | "compute" | "mcp" | "import" | "relay";
	reason: string;
	credits: number;
	at: string;
}

const TYPE_LABEL: Record<ContributionEntry["type"], string> = {
	answer: "답변",
	verify: "검증",
	teach: "교육",
	compute: "컴퓨팅",
	mcp: "MCP",
	import: "가져오기",
	relay: "릴레이",
};

const SAMPLE: ContributionEntry[] = [
	{
		id: "c-1",
		type: "answer",
		reason: "베트남 법인 설립 Q&A 답변",
		credits: 120,
		at: "2026-09-04 14:22",
	},
	{
		id: "c-2",
		type: "verify",
		reason: "다낭 비자 정보 교차 검증",
		credits: 80,
		at: "2026-09-04 13:08",
	},
	{
		id: "c-3",
		type: "teach",
		reason: "WebLLM 셋업 가이드 작성",
		credits: 250,
		at: "2026-09-03 21:40",
	},
	{
		id: "c-4",
		type: "compute",
		reason: "임베딩 배치 연산 기여",
		credits: 180,
		at: "2026-09-03 19:15",
	},
	{
		id: "c-5",
		type: "mcp",
		reason: "Postgres MCP 스킬 실행",
		credits: 60,
		at: "2026-09-03 16:50",
	},
	{
		id: "c-6",
		type: "import",
		reason: "베트남 세무 가이드 가져오기",
		credits: 45,
		at: "2026-09-02 11:30",
	},
];

export function ContributionHistory({ entries = SAMPLE }: { entries?: ContributionEntry[] }) {
	const total = entries.reduce((s, e) => s + e.credits, 0);
	return (
		<div className="hc-panel">
			<h3 className="hc-panel-title">기여 이력</h3>
			<p className="hc-panel-meta">
				총 {entries.length}건 · 적립 크레딧 {total.toLocaleString()}
			</p>
			<ul className="hc-contrib-timeline">
				{entries.map((e) => (
					<li key={e.id} className="hc-contrib-item">
						<span className={`hc-contrib-type ${e.type}`}>{TYPE_LABEL[e.type]}</span>
						<div className="hc-contrib-main">
							<strong>{e.reason}</strong>
							<span className="hc-contrib-at">{e.at}</span>
						</div>
						<span className="hc-credits">+{e.credits}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

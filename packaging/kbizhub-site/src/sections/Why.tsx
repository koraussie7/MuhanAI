import { Section } from "../components/Section";

export function Why() {
	return (
		<Section
			id="why"
			eyebrow="Why KBizHub"
			title="왜 KBizHub인가?"
		>
			<div className="section-head">
				<div className="section-tag">Why KBizHub</div>
				<h2 className="section-title">왜 KBizHub인가?</h2>
				<p
					className="section-desc"
					style={{
						fontSize: "1.25rem",
						fontWeight: 700,
						color: "#fff",
						marginBottom: 8,
					}}
				>
					"사람은 사업을 합니다. AI는 24시간 사업을 돕습니다."
				</p>
				<p className="section-desc">
					복잡한 AI 기술 용어 대신, 사업자에게 꼭 필요한 5대 핵심 가치를 하나의
					패키지로 제공합니다.
				</p>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
					gap: 18,
				}}
			>
				<div className="feat-card">
					<div className="feat-icon">🌐</div>
					<div
						style={{
							fontSize: "0.75rem",
							fontFamily: "var(--font-mono)",
							color: "var(--primary)",
							fontWeight: 700,
							marginBottom: 4,
						}}
					>
						PILLAR 01
					</div>
					<h3 className="feat-title">① AI Website</h3>
					<p className="feat-desc">
						<strong>내 사업의 AI 웹사이트</strong><br />
						모바일 최적화 반응형 웹페이지와 브랜드 지식베이스가 즉시 자동
						생성됩니다.
					</p>
				</div>

				<div className="feat-card">
					<div className="feat-icon">🤖</div>
					<div
						style={{
							fontSize: "0.75rem",
							fontFamily: "var(--font-mono)",
							color: "var(--primary)",
							fontWeight: 700,
							marginBottom: 4,
						}}
					>
						PILLAR 02
					</div>
					<h3 className="feat-title">② AI Agent</h3>
					<p className="feat-desc">
						<strong>내 사업을 이해하는 AI 직원</strong><br />
						매장 메뉴, 예약 정책, FAQ를 완벽히 학습하여 24시간 잠들지 않고
						고객을 응대합니다.
					</p>
				</div>

				<div className="feat-card">
					<div className="feat-icon">🧩</div>
					<div
						style={{
							fontSize: "0.75rem",
							fontFamily: "var(--font-mono)",
							color: "var(--primary)",
							fontWeight: 700,
							marginBottom: 4,
						}}
					>
						PILLAR 03
					</div>
					<h3 className="feat-title">③ Business MCP</h3>
					<p className="feat-desc">
						<strong>AI가 내 서비스를 직접 사용</strong><br />
						외부 AI가 내 사업체의 실시간 예약, 결제, 재고 확인 도구를 직접
						호출할 수 있습니다.
					</p>
				</div>

				<div className="feat-card">
					<div className="feat-icon">🎯</div>
					<div
						style={{
							fontSize: "0.75rem",
							fontFamily: "var(--font-mono)",
							color: "var(--primary)",
							fontWeight: 700,
							marginBottom: 4,
						}}
					>
						PILLAR 04
					</div>
					<h3 className="feat-title">④ Agent SEO</h3>
					<p className="feat-desc">
						<strong>AI가 내 사업을 발견하도록</strong><br />
						ChatGPT, Claude, Gemini 검색 시 내 사업체가 추천되도록 표준 Schema로
						최적화합니다.
					</p>
				</div>

				<div
					className="feat-card"
					style={{
						borderColor: "rgba(56, 189, 248, 0.4)",
						background: "linear-gradient(145deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.95))",
					}}
				>
					<div
						className="feat-icon"
						style={{ background: "rgba(56, 189, 248, 0.2)" }}
					>
						🔗
					</div>
					<div
						style={{
							fontSize: "0.75rem",
							fontFamily: "var(--font-mono)",
							color: "var(--primary)",
							fontWeight: 700,
							marginBottom: 4,
						}}
					>
						PILLAR 05
					</div>
					<h3 className="feat-title">⑤ MuhanAI Network</h3>
					<p className="feat-desc">
						<strong>수천 개 AI Business와 연결</strong><br />
						글로벌 에이전트 메쉬에 등록되어 다른 AI 비즈니스와 협업하고 고객을
						교차 추천받습니다.
					</p>
				</div>
			</div>
		</Section>
	);
}
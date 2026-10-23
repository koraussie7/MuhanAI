import { Section } from "../components/Section";

export function Hero() {
	return (
		<Section
			id="starter"
			eyebrow="Flagship Product"
			title="🚀 AI Business Starter — ₩29,000"
		>
			<div className="section-head">
				<div className="section-tag">Flagship Product</div>
				<h2 className="section-title">🚀 AI Business Starter — ₩29,000</h2>
				<p className="section-desc">
					당신의 사업을 AI Agent가 이해하고 24시간 운영할 수 있는 디지털
					비즈니스 노드로 만들어드립니다.<br />
					<strong style={{ color: "var(--primary)" }}>
						"29,000원은 웹사이트 가격이 아니라 AI Business Node 생성
						비용입니다."
					</strong>
				</p>
			</div>

			<div className="starter-hero-card">
				<div className="starter-header">
					<div>
						<span className="badge-highlight">ALL-IN-ONE STARTER PACKAGE</span>
						<h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginTop: 8 }}>
							AI 비즈니스 노드 풀 패키지
						</h3>
						<p
							style={{
								color: "var(--text-muted)",
								fontSize: "0.95rem",
								marginTop: 4,
							}}
						>
							클릭 몇 번으로 완성되는 자율 운영 디지털 비즈니스
						</p>
					</div>
					<div style={{ textAlign: "right" }}>
						<div className="starter-price-tag">
							₩29,000 <span>/ 1회 생성</span>
						</div>
						<div style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 600 }}>
							평생 노드 소유 · 월 고정 구독료 없음
						</div>
					</div>
				</div>

				<div className="starter-grid-9">
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>🌐 <strong>AI 반응형 웹사이트</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>📋 <strong>AI Business Profile</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>🤖 <strong>전담 AI Agent</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>🧩 <strong>MCP Endpoint</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>🔗 <strong>MuhanAI 네트워크 등록</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>💬 <strong>AI FAQ 자동 생성</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>🔍 <strong>기본 검색엔진 SEO</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>⚡ <strong>AI 24시간 고객응대</strong></span>
					</div>
					<div className="starter-item">
						<span className="starter-item-icon">✓</span>
						<span>🌐 <strong>Agent Network 연결</strong></span>
					</div>
				</div>

				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						flexWrap: "wrap",
						gap: 16,
						borderTop: "1px solid var(--border)",
						paddingTop: 24,
					}}
				>
					<div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
						💼 식당, 카페, 쇼핑몰, 전문직, 1인 창업가 누구나 즉시 생성 가능
					</div>
					<button
						type="button"
						className="btn-primary"
						style={{ padding: "14px 32px", fontSize: "1rem" }}
						onClick={() => (window as any).openStarterModal?.()}
					>
						🚀 29,000원으로 AI 비즈니스 만들기
					</button>
				</div>
			</div>
		</Section>
	);
}
import { Section } from "../components/Section";

export function Comparison() {
	return (
		<Section
			id="comparison"
			eyebrow="Competitive Edge"
			title="기존 AI 도구 vs KBizHub 비교"
		>
			<div className="section-head">
				<div className="section-tag">Competitive Edge</div>
				<h2 className="section-title">기존 AI 도구 vs KBizHub 비교</h2>
				<p className="section-desc">
					단순한 폐쇄형 SaaS AI 직원을 넘어선 오픈 집단지성 경제 생태계
				</p>
			</div>

			<div className="comp-container">
				<table className="comp-table">
					<thead>
						<tr>
							<th>비교 항목</th>
							<th>기존 일반 AI 도구</th>
							<th>폐쇄형 AI 직원 SaaS</th>
							<th className="highlight">KBizHub (MuhanAI)</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>시작 비용</strong></td>
							<td>건당 종량제 과금</td>
							<td>월 $20~$200 고정 구독료</td>
							<td className="highlight">₩29,000 일회성 생성 (평생 노드 소유)</td>
						</tr>
						<tr>
							<td><strong>운영 형태</strong></td>
							<td>단순 질문 답변 (챗봇)</td>
							<td>폐쇄형 AI 회사 운영</td>
							<td className="highlight">
								웹사이트 + AI Agent + MCP + MuhanAI Network
							</td>
						</tr>
						<tr>
							<td><strong>아키텍처</strong></td>
							<td>단일 LLM 호출</td>
							<td>중앙집중형 단일 에이전트</td>
							<td className="highlight">
								P2P 분산 Agent Mesh + MCP 도구 연동
							</td>
						</tr>
						<tr>
							<td><strong>AI 검색 (Agent SEO)</strong></td>
							<td>지원 불가</td>
							<td>플랫폼 내부 검색 한정</td>
							<td className="highlight">
								ChatGPT/Claude/Gemini 노출 Agent SEO 지원
							</td>
						</tr>
						<tr>
							<td><strong>비용 최적화</strong></td>
							<td>건당 종량제 부담</td>
							<td>월 고정 구독료 부담</td>
							<td className="highlight">
								스마트 하이브리드 라우팅 (비용 극적 절감)
							</td>
						</tr>
						<tr>
							<td><strong>인간 전문가 결합</strong></td>
							<td>불가능</td>
							<td>제한적 (AI 중심)</td>
							<td className="highlight">
								인간 전문가 에스크로 마켓플레이스 연동
							</td>
						</tr>
						<tr>
							<td><strong>경제 생태계</strong></td>
							<td>단순 결제</td>
							<td>단일 SaaS 구독</td>
							<td className="highlight">
								Agent 마켓, MCP 스킬 거래, P2P 서비스 거래
							</td>
						</tr>
					</tbody>
				</table>
				<div
					style={{
						background: "rgba(2, 6, 23, 0.7)",
						borderTop: "1px solid var(--border)",
						padding: "16px 24px",
						fontSize: "0.825rem",
						color: "var(--text-dim)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						flexWrap: "wrap",
						gap: 10,
					}}
				>
					<div>
						🛠️
						<strong style={{ color: "var(--primary)" }}>
							Developer & Tech Note:
						</strong>{" "}
						Token-Free Gateway · Local WebAuth Tunnel · BYOK (Bring Your Own
						Key) · MCP v1.0 Spec 완벽 지원
					</div>
					<a
						href="https://muhanai.com/models"
						target="_blank"
						style={{ color: "var(--primary)", fontWeight: 600 }}
					>
						개발자 문서 둘러보기 →
					</a>
				</div>
			</div>
		</Section>
	);
}
/**
 * AgentSeo — migrated verbatim from `#agent-seo` in the original index.html.
 *
 * The markup, class names and inline styles are carried over unchanged: the
 * CSS is the visual contract for this migration, so nothing in this file is
 * allowed to alter how the section renders. Only the one global
 * `openStarterModal()` handler became a prop.
 */

interface Props {
	/** Opens the starter order modal. */
	onOpenStarter: () => void;
}

export function AgentSeo({onOpenStarter}: Props) {
	return (
		<section id="agent-seo" style={{ paddingTop: "40px" }}>

	      <div className="section-head">
	        <div className="section-tag">Next-Gen Discovery</div>
	        <h2 className="section-title">Agent SEO — 차세대 AI 검색 최적화</h2>
	        <p className="section-desc">
	          Google SEO만으로는 부족한 AI 시대.<br />
	          <strong
	            >ChatGPT, Claude, Gemini 및 글로벌 AI Agent가 내 사업체를 발견하고
	            이해할 수 있도록 최적화합니다.</strong
	          >
	        </p>
	      </div>

	      <div className="seo-dual-grid">
	        <div
	          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "18px", padding: "30px" }}
	        >
	          <div
	            style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}
	          >
	            Traditional Discovery
	          </div>
	          <h3
	            style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: "14px", color: "#94a3b8" }}
	          >
	            기존 검색 (Search Engine)
	          </h3>
	          <ul
	            style={{ listStyle: "none", color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 2 }}
	          >
	            <li>• Google / Naver / Bing 키워드 순위 경쟁</li>
	            <li>• 단순 웹 링크 클릭 후 유저가 직접 탐색</li>
	            <li>• AI 챗봇이 최신 메뉴나 예약 정보를 인지하기 어려움</li>
	            <li>• 사람이 직접 읽어야 하는 텍스트 중심 구조</li>
	          </ul>
	        </div>

	        <div
	          style={{ background: "linear-gradient( 145deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.95) )", border: "1px solid var(--primary)", borderRadius: "18px", padding: "30px", boxShadow: "0 0 30px rgba(56, 189, 248, 0.1)" }}
	        >
	          <div
	            style={{ color: "var(--primary)", fontSize: "0.85rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}
	          >
	            Next Generation
	          </div>
	          <h3
	            style={{ fontSize: "1.3rem", fontWeight: 800, marginBottom: "14px", color: "#fff" }}
	          >
	            KBizHub Agent SEO (Google + AI + Agent)
	          </h3>
	          <ul
	            style={{ listStyle: "none", color: "#e2e8f0", fontSize: "0.9rem", lineHeight: 2 }}
	          >
	            <li>
	              ✨ <strong>LLM Schema 등록:</strong> ChatGPT, Claude가 내 사업을
	              정확히 인지
	            </li>
	            <li>
	              ✨ <strong>MCP Protocol 오픈:</strong> 타사 AI Agent가 내
	              예약/결제 API 직접 호출
	            </li>
	            <li>
	              ✨ <strong>실시간 비즈니스 지식 업데이트:</strong> 가격 변동,
	              휴무일 즉시 반영
	            </li>
	            <li>
	              ✨ <strong>MuhanAI 글로벌 메쉬 연동:</strong> 전 세계 AI 에이전트
	              간 비즈니스 추천 연결
	            </li>
	          </ul>
	        </div>
	      </div>
    		</section>
	);
}

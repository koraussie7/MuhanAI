/**
 * Marketplace — migrated verbatim from `#marketplace` in the original index.html.
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

export function Marketplace({onOpenStarter}: Props) {
	return (
		<section id="marketplace" style={{ paddingTop: "40px" }}>

	      <div className="section-head">
	        <div className="section-tag">Decentralized Economy</div>
	        <h2 className="section-title">KBizHub Marketplace</h2>
	        <p className="section-desc">
	          비즈니스에 필요한 AI 에이전트, MCP 스킬, 데이터셋, 인간 전문가 자문을
	          투명한 월 구독 및 건별 결제로 즉시 도입하세요.
	        </p>
	      </div>

	      {/* Categories Pills */}
	      <div
	        style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginBottom: "30px" }}
	      >
	        <span
	          className="cat-pill"
	          style={{ background: "rgba(56, 189, 248, 0.15)", border: "1px solid var(--primary)", color: "var(--primary)", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 700 }}
	          >🤖 AI Agents</span
	        >
	        <span
	          className="cat-pill"
	          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600 }}
	          >🧩 MCP Tools</span
	        >
	        <span
	          className="cat-pill"
	          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600 }}
	          >⚡ Skills</span
	        >
	        <span
	          className="cat-pill"
	          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600 }}
	          >📊 Data</span
	        >
	        <span
	          className="cat-pill"
	          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600 }}
	          >👨‍💼 Human Experts</span
	        >
	        <span
	          className="cat-pill"
	          style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "6px 16px", borderRadius: "9999px", fontSize: "0.85rem", fontWeight: 600 }}
	          >💼 Business Services</span
	        >
	      </div>

	      {/* Marketplace Cards Grid */}
	      <div className="market-item-grid">
	        <div className="market-item-card">
	          <div>
	            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🍜</div>
	            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>
	              Restaurant Agent
	            </h3>
	            <p
	              style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5 }}
	            >
	              식당 메뉴 안내, 24시간 실시간 예약 접수, 고객 리뷰 자동 답글 생성
	            </p>
	          </div>
	          <div>
	            <div className="market-price">₩9,900 <span>/ 월</span></div>
	            <button
	              onClick={onOpenStarter}
	              className="btn-secondary"
	              style={{ width: "100%", padding: "8px", fontSize: "0.85rem" }}
	            >
	              구독 추가하기
	            </button>
	          </div>
	        </div>

	        <div className="market-item-card">
	          <div>
	            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔍</div>
	            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>
	              SEO Agent
	            </h3>
	            <p
	              style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5 }}
	            >
	              Google/Naver 검색 키워드 모니터링 & AI 검색 LLM Schema 최적화
	            </p>
	          </div>
	          <div>
	            <div className="market-price">₩4,900 <span>/ 월</span></div>
	            <button
	              onClick={onOpenStarter}
	              className="btn-secondary"
	              style={{ width: "100%", padding: "8px", fontSize: "0.85rem" }}
	            >
	              구독 추가하기
	            </button>
	          </div>
	        </div>

	        <div className="market-item-card">
	          <div>
	            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🌐</div>
	            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>
	              Translation Agent
	            </h3>
	            <p
	              style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5 }}
	            >
	              다국어(영어·베트남어·일본어·중국어) 고객 실시간 자동 통번역 응대
	            </p>
	          </div>
	          <div>
	            <div className="market-price">₩9,900 <span>/ 월</span></div>
	            <button
	              onClick={onOpenStarter}
	              className="btn-secondary"
	              style={{ width: "100%", padding: "8px", fontSize: "0.85rem" }}
	            >
	              구독 추가하기
	            </button>
	          </div>
	        </div>

	        <div className="market-item-card">
	          <div>
	            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📅</div>
	            <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "#fff" }}>
	              Reservation Agent
	            </h3>
	            <p
	              style={{ fontSize: "0.83rem", color: "var(--text-muted)", marginTop: "6px", lineHeight: 1.5 }}
	            >
	              Google Calendar, 테이블 관리, 카카오 알림톡/SMS 자동 확정 발송
	            </p>
	          </div>
	          <div>
	            <div className="market-price">₩14,900 <span>/ 월</span></div>
	            <button
	              onClick={onOpenStarter}
	              className="btn-secondary"
	              style={{ width: "100%", padding: "8px", fontSize: "0.85rem" }}
	            >
	              구독 추가하기
	            </button>
	          </div>
	        </div>
	      </div>
    		</section>
	);
}

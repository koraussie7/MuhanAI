/**
 * HumanExpert — migrated verbatim from `#human-expert` in the original index.html.
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

export function HumanExpert({onOpenStarter}: Props) {
	return (
		<section id="human-expert" style={{ paddingTop: "40px" }}>

	      <div className="section-head">
	        <div className="section-tag">Human + AI Synergy</div>
	        <h2 className="section-title">인간 전문가 에스크로 마켓</h2>
	        <p className="section-desc">
	          <strong
	            >"AI가 인간을 대체하는 것이 아니라, AI가 인간의 전문성을 호출하는
	            구조입니다."</strong
	          ><br />
	          AI가 스스로 처리하기 어려운 고도의 법률, 세무, 현지 인허가는 검증된
	          인간 전문가에게 안전 에스크로로 즉시 연결됩니다.
	        </p>
	      </div>

	      {/* Human-in-the-loop 5-step Flow */}
	      <div className="pipeline-track" style={{ marginBottom: "30px" }}>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>🤖</div>
	          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
	            1. AI 1차 처리
	          </div>
	          <div
	            style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            기본 데이터 수집 & 초안 작성
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>⚠️</div>
	          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f59e0b" }}>
	            2. 전문 영역 감지
	          </div>
	          <div
	            style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            법적 책임 / 정밀 세무 플래그
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div
	          className="pipeline-step"
	          style={{ borderColor: "var(--primary)", background: "rgba(56, 189, 248, 0.08)" }}
	        >
	          <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>👨‍💼</div>
	          <div
	            style={{ fontWeight: 800, fontSize: "0.95rem", color: "var(--primary)" }}
	          >
	            3. Human Expert 호출
	          </div>
	          <div style={{ fontSize: "0.78rem", color: "#cbd5e1", marginTop: "4px" }}>
	            현지 변호사/세무사 안전 에스크로
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>🛡️</div>
	          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#10b981" }}>
	            4. 최종 인간 검증
	          </div>
	          <div
	            style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            서명 날인 & 안전 거래 승인
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "1.8rem", marginBottom: "6px" }}>🧠</div>
	          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
	            5. AI Knowledge 축적
	          </div>
	          <div
	            style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            검증 결과 영구 비즈니스 반영
	          </div>
	        </div>
	      </div>

	      {/* Real Use Case Example */}
	      <div
	        style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", borderRadius: "18px", padding: "28px 32px", boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)" }}
	      >
	        <div
	          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}
	        >
	          <span className="badge-highlight">REAL SCENARIO CASE</span>
	          <span
	            style={{ fontSize: "0.8rem", color: "#10b981", fontFamily: "var(--font-mono)" }}
	            >● ESCROW VERIFIED WORKFLOW</span
	          >
	        </div>
	        <h3
	          style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: "10px", color: "#fff" }}
	        >
	          "베트남 다낭에서 현지 외투법인을 설립해줘"
	        </h3>
	        <p
	          style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.7, marginBottom: "16px" }}
	        >
	          ① <strong>Legal Agent</strong>가 베트남 투자법(Law on Investment)
	          규정과 제출 서류 초안을 자동 정리합니다.<br />
	          ② AI가 복잡한 투자 허가증(IRC) 심사 리스크를 감지하여
	          <strong>베트남 현지 공인 변호사(Vietnam Lawyer)</strong>에게 에스크로
	          검토를 요청합니다.<br />
	          ③ 전문가가 초안을 정밀 실사(Due Diligence) 후 승인하면, 검증된 지식이
	          <strong>내 비즈니스 노드</strong>에 영구 저장됩니다.
	        </p>
	        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
	          <button
	            onClick={onOpenStarter}
	            className="btn-primary"
	            style={{ padding: "10px 22px", fontSize: "0.875rem" }}
	          >
	            전문가 에스크로 풀 둘러보기
	          </button>
	        </div>
	      </div>
    		</section>
	);
}

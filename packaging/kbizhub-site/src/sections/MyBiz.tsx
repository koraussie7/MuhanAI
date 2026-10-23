/**
 * MY AI BUSINESS — 가입 즉시 생성되는 나의 AI 비즈니스 대시보드.
 *
 * Migrated from `#mybiz` in the original index.html. The section is static —
 * no handlers, no ids — so the markup is carried over unchanged apart from the
 * HTML->JSX substitutions. The CSS was not touched, so there is nothing visual
 * to regress.
 */

interface Props {
	/** Opens the AI node parameter console. The original used alert(). */
	onManageAgents: () => void;
}

export function MyBiz({ onManageAgents }: Props) {
	return (
		<section id="mybiz" style={{ paddingTop: 40, paddingBottom: 20 }}>
      <div className="section-head">
        <div className="section-tag">Core Experience</div>
        <h2 className="section-title">MY AI BUSINESS</h2>
        <p className="section-desc">
          가입 즉시 생성되는 나만의 AI 비즈니스 대시보드.<br />
          내 사업이 하나의 자율 AI 객체(Node)로 살아 움직이는 모습을 직관적으로
          확인하세요.
        </p>
      </div>

      <div className="mybiz-card">
        <div className="mybiz-topbar">
          <div>
            <div
              style={{ fontSize: "0.8rem", fontFamily: "var(--font-mono)", color: "var(--primary)", fontWeight: 700 }}
            >
              NODE ID: KB-NODE-DN8029
            </div>
            <h3
              style={{ fontSize: "1.6rem", fontWeight: 800, marginTop: "4px", display: "flex", alignItems: "center", gap: "10px" }}
            >
              🍜 Da Nang Korean Restaurant
              <span
                style={{ fontSize: "0.8rem", color: "#10b981", fontWeight: 600, background: "rgba(16, 185, 129, 0.15)", padding: "3px 10px", borderRadius: "9999px" }}
                >● LIVE</span
              >
            </h3>
            <p
              style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: "2px" }}
            >
              다낭 한식당 비즈니스 AI 객체 (식당 예약 · 메뉴 추천 · 다국어 응대)
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <span className="badge-sim">Simulation Node</span>
          </div>
        </div>

        <div className="mybiz-status-group">
          <div className="mybiz-status-pill">
            <span className="dot-pulse"></span>
            <span>AI Agent Online</span>
          </div>
          <div className="mybiz-status-pill">
            <span className="dot-pulse"></span>
            <span>MCP Connected (OpenAPI/Tools)</span>
          </div>
          <div className="mybiz-status-pill">
            <span className="dot-pulse"></span>
            <span>MuhanAI Network Connected</span>
          </div>
        </div>

        <div
          className="preview-grid"
          style={{ borderRadius: "14px", overflow: "hidden", border: "1px solid var(--border)", marginTop: "16px" }}
        >
          {/* Sidebar: Manage Nodes */}
          <div className="preview-sidebar">
            <div
              style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.05em" }}
            >
              AI Node Services
            </div>
            <div className="sidebar-item active">
              🌐 Website
              <span
                style={{ marginLeft: "auto", fontSize: "0.75rem", color: "var(--primary)" }}
                >[Open]</span
              >
            </div>
            <div className="sidebar-item">
              🤖 AI Agent
              <span
                style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#10b981" }}
                >[Manage]</span
              >
            </div>
            <div className="sidebar-item">
              🧩 MCP
              <span
                style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#818cf8" }}
                >[Manage]</span
              >
            </div>
            <div className="sidebar-item">
              🏪 Marketplace
              <span
                style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#f59e0b" }}
                >[Explore]</span
              >
            </div>
          </div>
          {/* Chat Area */}
          <div className="preview-main">
            <div className="agent-chat-card">
              <div className="agent-header">
                <span className="agent-badge">● KBizHub Router · Claude 3.7</span>
                <span
                  style={{ fontSize: "0.72rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}
                  >실시간 로그</span
                >
              </div>
              <p style={{ fontSize: "0.9rem", color: "#e2e8f0" }}>
                💬 <strong>고객 문의:</strong> "내일 저녁 7시 4명 단체 예약
                가능한가요? 메뉴 추천도 해주세요."<br />
                🤖 <strong>AI Agent 응답:</strong> "안녕하세요! 내일 저녁 7시
                4인석 룸 예약 가능합니다. 시그니처 메뉴인 다낭 해물갈비찜 세트를
                추천드립니다. 예약 확정 링크를 전송했습니다."
              </p>
            </div>
            <div
              className="agent-chat-card"
              style={{ borderColor: "rgba(56, 189, 248, 0.3)" }}
            >
              <div className="agent-header">
                <span className="agent-badge" style={{ color: "var(--primary)" }}
                  >● MCP Router & MuhanAI Network Sync</span
                >
                <span
                  style={{ fontSize: "0.75rem", color: "#10b981", fontFamily: "var(--font-mono)" }}
                  >CONNECTED</span
                >
              </div>
              <p
                style={{ fontSize: "0.85rem", color: "#cbd5e1", fontFamily: "var(--font-mono)" }}
              >
                [MCP] Google Places SEO Synced · Tripadvisor Agent Queried<br />
                [Mesh] MuhanAI P2P Network: "다낭 한국식당" 검색 질의에 노드
                응답 완료
              </p>
            </div>
          </div>
          {/* Right Status */}
          <div className="preview-status">
            <div
              style={{ fontSize: "0.85rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <span>🏢 AI 비즈니스 운영 현황</span>
              <span className="badge-sim">Simulation</span>
            </div>
            <div
              style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.8 }}
            >
              <div>• 에이전트 가동: <strong>24시간 무중단</strong></div>
              <div>
                • 오늘 자동 응대: <strong>48건</strong> (예약 12건 성공)
              </div>
              <div>
                • 예상 인건비 절감: <strong>월 ₩1,800,000</strong>
                <span className="badge-sim">Est.</span>
              </div>
              <div>
                • 네트워크 신뢰도: <strong>99.8%</strong> (MuhanAI Quorum)
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ padding: "10px", fontSize: "0.8rem", width: "100%" }}
              onClick={onManageAgents}
            >
              AI 에이전트 설정 관리
            </button>
          </div>
        </div>

        {/* Quick Action Bar */}
        <div className="mybiz-btn-grid">
          <div className="mybiz-action-btn">
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}
                >🌐 Website</span
              >
              <span
                style={{ fontSize: "0.75rem", color: "var(--primary)", fontWeight: 700, background: "rgba(56, 189, 248, 0.1)", padding: "2px 8px", borderRadius: "6px" }}
                >[Open]</span
              >
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              실시간 AI 생성 반응형 웹사이트 보기 및 편집
            </div>
          </div>
          <div className="mybiz-action-btn">
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}
                >🤖 AI Agent</span
              >
              <span
                style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: 700, background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "6px" }}
                >[Manage]</span
              >
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              24시간 고객 응대 및 예약 AI 직원 지식 관리
            </div>
          </div>
          <div className="mybiz-action-btn">
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>🧩 MCP</span>
              <span
                style={{ fontSize: "0.75rem", color: "#818cf8", fontWeight: 700, background: "rgba(129, 140, 248, 0.1)", padding: "2px 8px", borderRadius: "6px" }}
                >[Manage]</span
              >
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              예약 API, 배달 연동, 결제 엔드포인트 도구 관리
            </div>
          </div>
          <div className="mybiz-action-btn">
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.95rem" }}
                >🏪 Marketplace</span
              >
              <span
                style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 700, background: "rgba(245, 158, 11, 0.1)", padding: "2px 8px", borderRadius: "6px" }}
                >[Explore]</span
              >
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              추가 AI 직원, 마케팅 스킬, 전문가 자문 탐색
            </div>
          </div>
        </div>
      </div>
		</section>
	);
}

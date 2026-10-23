/**
 * Pipeline — migrated verbatim from `#pipeline` in the original index.html.
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

export function Pipeline({onOpenStarter}: Props) {
	return (
		<section id="pipeline" style={{ paddingTop: "40px" }}>

	      <div className="section-head">
	        <div className="section-tag">Core Technology</div>
	        <h2 className="section-title">Website → AI Agent 자동 생성</h2>
	        <p className="section-desc">
	          "내 홈페이지가 AI와 대화할 수 있습니다."<br />
	          웹사이트가 생성되는 즉시 비즈니스 지식베이스와 대화형 AI Agent가
	          원클릭으로 결합됩니다.
	        </p>
	      </div>

	      <div className="pipeline-track">
	        <div className="pipeline-step">
	          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🌐</div>
	          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
	            1. Website
	          </div>
	          <div
	            style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            사업체 소개, 메뉴, 위치 정보 등록
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🕷️</div>
	          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
	            2. AI Crawl
	          </div>
	          <div
	            style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            웹페이지 구조 및 핵심 데이터 자율 분석
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🧠</div>
	          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
	            3. Business Knowledge
	          </div>
	          <div
	            style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            영업시간, FAQ, 정책 지식 벡터화
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div className="pipeline-step">
	          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🧩</div>
	          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#fff" }}>
	            4. Business MCP
	          </div>
	          <div
	            style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}
	          >
	            예약/주문 표준 인터페이스 노출
	          </div>
	        </div>
	        <div className="pipeline-arrow">→</div>
	        <div
	          className="pipeline-step"
	          style={{ borderColor: "var(--primary)", background: "rgba(56, 189, 248, 0.08)" }}
	        >
	          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🤖</div>
	          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--primary)" }}>
	            5. Business Agent
	          </div>
	          <div style={{ fontSize: "0.8rem", color: "#cbd5e1", marginTop: "4px" }}>
	            24시간 대화 및 네트워크 응답 개시
	          </div>
	        </div>
	      </div>

	      <div
	        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px 30px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}
	      >
	        <div style={{ maxWidth: "650px" }}>
	          <h4 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "6px" }}>
	            💡 다른 AI Agent가 내 사업을 직접 찾아옵니다
	          </h4>
	          <p
	            style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.6 }}
	          >
	            외부 여행객의 ChatGPT나 Claude가 "다낭에 괜찮은 한국식당 찾아줘"라고
	            요청하면, KBizHub 메쉬에 등록된 당신의 식당 Agent가 실시간으로
	            검색되어 최신 메뉴와 예약 가능 여부를 직접 안내합니다.
	          </p>
	        </div>
	        <button
	          onClick={onOpenStarter}
	          className="btn-primary"
	          style={{ padding: "12px 24px", fontSize: "0.95rem" }}
	        >
	          🚀 지금 내 웹사이트 & Agent 생성하기
	        </button>
	      </div>

	      {/* Weknora Hybrid RAG & Knowledge Graph Engine (Proprietary Tech) */}
	      <div
	        style={{ background: "rgba(15, 23, 42, 0.7)", border: "1px solid var(--border-accent)", borderRadius: "20px", padding: "32px", marginTop: "36px" }}
	      >
	        <div
	          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}
	        >
	          <div>
	            <span className="badge-highlight"
	              >PROPRIETARY RAG & KNOWLEDGE GRAPH ENGINE</span
	            >
	            <h3
	              style={{ fontSize: "1.35rem", fontWeight: 800, color: "#fff", marginTop: "6px" }}
	            >
	              Weknora 하이브리드 지식 파이프라인
	            </h3>
	            <p
	              style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "2px" }}
	            >
	              단순 크롤링이 아닌 OCR · 지식 그래프 · 삼중 하이브리드 검색(BM25 +
	              Dense + Graph) 기반 고정밀 에이전트 엔진
	            </p>
	          </div>
	          <span
	            style={{ fontSize: "0.75rem", color: "#10b981", fontFamily: "var(--font-mono)", background: "rgba(16, 185, 129, 0.12)", padding: "4px 12px", borderRadius: "9999px", border: "1px solid rgba(16, 185, 129, 0.3)" }}
	          >
	            ● HYBRID RETRIEVAL ACTIVE
	          </span>
	        </div>

	        <div
	          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}
	        >
	          {/* Phase 1: Data Prep & Indexing */}
	          <div
	            style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border)", borderRadius: "14px", padding: "20px" }}
	          >
	            <div
	              style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "#f59e0b", fontWeight: 700, marginBottom: "6px" }}
	            >
	              PHASE 01 · DATA PREP & INDEXING
	            </div>
	            <h4
	              style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", marginBottom: "10px" }}
	            >
	              데이터 수집 & 지식 그래프 인덱싱
	            </h4>
	            <div
	              style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.825rem", color: "var(--text-muted)" }}
	            >
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                📸 <strong>OCR & Caption:</strong> 메뉴판, 가격표, 매장 전경
	                사진 시각 데이터 추출
	              </div>
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                📄 <strong>Chunk & Summary:</strong> 약관, 예약 규정, FAQ 핵심
	                지식 청크 요약
	              </div>
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                🕸️ <strong>Knowledge Graph:</strong> 메뉴-가격-좌석 관계망을
	                지식 그래프로 구조화
	              </div>
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                💾 <strong>Index Storage:</strong> Meta & Chunk + Vector Storage
	                이중 인덱스 보관
	              </div>
	            </div>
	          </div>

	          {/* Phase 2: Query & Retrieval */}
	          <div
	            style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "14px", padding: "20px" }}
	          >
	            <div
	              style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--primary)", fontWeight: 700, marginBottom: "6px" }}
	            >
	              PHASE 02 · RETRIEVAL (AGENT SEO)
	            </div>
	            <h4
	              style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", marginBottom: "10px" }}
	            >
	              쿼리 재작성 & 삼중 하이브리드 검색
	            </h4>
	            <div
	              style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.825rem", color: "var(--text-muted)" }}
	            >
	              <div
	                style={{ background: "rgba(56, 189, 248, 0.06)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)" }}
	              >
	                🔄 <strong>Query Rewrite:</strong> 대화 문맥(History) 반영 정밀
	                질의 확장
	              </div>
	              <div
	                style={{ background: "rgba(56, 189, 248, 0.06)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)" }}
	              >
	                ⚡ <strong>Hybrid Retrieval:</strong> BM25 키워드 + Dense 벡터 +
	                지식 그래프 동시 탐색
	              </div>
	              <div
	                style={{ background: "rgba(56, 189, 248, 0.06)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)" }}
	              >
	                🎯 <strong>Rerank Engine:</strong> 검색된 비즈니스 정보의 신뢰도
	                및 연관도 재정렬
	              </div>
	              <div
	                style={{ background: "rgba(56, 189, 248, 0.06)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(56, 189, 248, 0.15)" }}
	              >
	                🔍 <strong>Agent SEO Ready:</strong> ChatGPT/Claude 등 외부
	                에이전트 질의에 정확 응답
	              </div>
	            </div>
	          </div>

	          {/* Phase 3: Generation & Response */}
	          <div
	            style={{ background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border)", borderRadius: "14px", padding: "20px" }}
	          >
	            <div
	              style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "#10b981", fontWeight: 700, marginBottom: "6px" }}
	            >
	              PHASE 03 · GENERATION & ACTION
	            </div>
	            <h4
	              style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", marginBottom: "10px" }}
	            >
	              LLM 생성 & 자율 MCP 비즈니스 액션
	            </h4>
	            <div
	              style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.825rem", color: "var(--text-muted)" }}
	            >
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                🤖 <strong>LLM Model:</strong> Claude 3.7 / GPT-4o / 로컬
	                게이트웨이 유연 매칭
	              </div>
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                💬 <strong>자율 고객 안내:</strong> 24시간 실시간 메뉴 추천,
	                맞춤 예약, FAQ 응대
	              </div>
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                🧩 <strong>MCP 액션 실행:</strong> 캘린더 등록, 카카오 알림톡,
	                결제 에스크로 자동 처리
	              </div>
	              <div
	                style={{ background: "rgba(255, 255, 255, 0.03)", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.06)" }}
	              >
	                🌐 <strong>Network Sync:</strong> MuhanAI 글로벌 메쉬에 실시간
	                업데이트 동기화
	              </div>
	            </div>
	          </div>
	        </div>
	      </div>
    		</section>
	);
}

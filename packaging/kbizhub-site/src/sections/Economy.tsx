/**
 * Agent Economy — 내 Agent가 다른 Agent와 서비스를 자율 거래합니다.
 *
 * Migrated from `#economy` in the original index.html. Static apart from the
 * closing CTA, which opened the starter modal via a global function and is now
 * a prop. Markup, classes and colours carried over unchanged.
 */

import type { CSSProperties } from "react";

const STEPS = [
  {
    icon: "🚀",
    title: "1. AI Business 생성",
    sub: "29,000원 즉시 런칭",
    accent: "primary",
  },
  {
    icon: "🌐",
    title: "2. Website & Agent",
    sub: "모바일웹 + 24h AI직원",
    accent: "white",
  },
  {
    icon: "🧩",
    title: "3. MCP 오픈",
    sub: "예약/결제 표준 인터페이스",
    accent: "white",
  },
  {
    icon: "🔗",
    title: "4. MuhanAI Network",
    sub: "글로벌 노드 메쉬 연결",
    accent: "green",
  },
  {
    icon: "🏪",
    title: "5. Marketplace 거래",
    sub: "Agent 상호 거래 참여",
    accent: "primary",
    highlight: true,
  },
] as const;

const PILLARS = [
  {
    icon: "🤖",
    title: "Agent-to-Agent 자동 연동",
    body: "외부 고객의 AI(ChatGPT, Claude, 여행 에이전트)가 내 사업체의 전담 Agent와 자율 대화하여 예약과 주문을 논스톱 처리합니다.",
  },
  {
    icon: "🧩",
    title: "MCP 표준 상거래",
    body: "Model Context Protocol 표준 규격으로 메뉴, 가격, 재고, 결제가 노출되어 글로벌 모든 AI 클라이언트와 즉각 호환됩니다.",
  },
  {
    icon: "🌐",
    title: "P2P 분산 지식 노드",
    body: "특정 빅테크 플랫폼에 종속되지 않고, 내 사업 지식과 데이터는 분산 P2P 메쉬에 등록되어 평생 독립적으로 안전하게 보호됩니다.",
  },
  {
    icon: "💰",
    title: "자율 수익 & 마켓 참여",
    body: "내 에이전트가 고객을 유치할 뿐만 아니라, 개발한 특화 MCP 스킬이나 데이터를 마켓플레이스에 공급하여 부가 수익을 창출합니다.",
  },
] as const;

const stepTitle = (accent: string): CSSProperties => ({
  fontWeight: accent === "white" ? 700 : 800,
  fontSize: "0.92rem",
  color:
    accent === "white"
      ? "#fff"
      : accent === "green"
        ? "#10b981"
        : "var(--primary)",
});
const stepSub: CSSProperties = {
  fontSize: "0.76rem",
  color: "var(--text-muted)",
  marginTop: 2,
};
const highlightedStep: CSSProperties = {
  borderColor: "var(--primary)",
  background: "rgba(56, 189, 248, 0.08)",
};
const bannerStyle: CSSProperties = {
  background:
    "linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(99, 102, 241, 0.1))",
  border: "1px solid var(--border-accent)",
  borderRadius: 16,
  padding: "24px 30px",
  marginTop: 32,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 16,
};

interface Props {
  onCreateNode: () => void;
}

export function Economy({ onCreateNode }: Props) {
  return (
    <section id="economy" style={{ paddingTop: 50 }}>
      <div className="section-head">
        <div className="section-tag">Agent Economy</div>
        <h2 className="section-title">
          내 Agent가 다른 Agent와 서비스를 자율 거래합니다
        </h2>
        <p className="section-desc">
          KBizHub는 단순한 웹사이트 제작 도구가 아니라, 전 세계 수만 개의 AI
          비즈니스 노드가 연결되어 상호작용하는{" "}
          <strong>자율 에이전트 경제 생태계</strong>입니다.
        </p>
      </div>

      {/* Business Node Generation Pipeline */}
      <div className="pipeline-track" style={{ marginBottom: 30 }}>
        {STEPS.map((s, i) => (
          <>
            {i > 0 && (
              <div className="pipeline-arrow" key={`arrow-${s.title}`}>
                →
              </div>
            )}
            <div
              className="pipeline-step"
              key={s.title}
              style={
                "highlight" in s && s.highlight ? highlightedStep : undefined
              }
            >
              <div style={{ fontSize: "1.6rem", marginBottom: 4 }}>
                {s.icon}
              </div>
              <div style={stepTitle(s.accent)}>{s.title}</div>
              <div style={stepSub}>{s.sub}</div>
            </div>
          </>
        ))}
      </div>

      {/* 4 Core Pillars */}
      <div className="card-grid-4">
        {PILLARS.map((p) => (
          <div className="feat-card" key={p.title}>
            <div className="feat-icon">{p.icon}</div>
            <h3 className="feat-title">{p.title}</h3>
            <p className="feat-desc">{p.body}</p>
          </div>
        ))}
      </div>

      {/* Strategic Division Banner */}
      <div style={bannerStyle}>
        <div>
          <div
            style={{
              fontSize: "0.8rem",
              fontFamily: "var(--font-mono)",
              color: "var(--primary)",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            PLATFORM ARCHITECTURE
          </div>
          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff" }}>
            KBizHub = 사업자용 입구 (AI Business 생성 허브) · MuhanAI = AI 경제
            네트워크
          </div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "var(--text-muted)",
              marginTop: 2,
            }}
          >
            Agent Network + Knowledge Network + Marketplace + Human Expert
            Network
          </div>
        </div>
        <button
          type="button"
          onClick={onCreateNode}
          className="btn-primary"
          style={{ padding: "12px 26px", fontSize: "0.9rem" }}
        >
          🚀 AI Business Node 생성하기
        </button>
      </div>
    </section>
  );
}

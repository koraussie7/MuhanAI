import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

const MARKET_TABS = ["Agents", "Human Experts", "MCP", "Knowledge", "Compute"];
const MARKET_ITEMS: Record<string, { name: string; desc: string; rating: number }[]> = {
  Agents: [
    { name: "Gemini Research Agent", desc: "Research · Web Search · Summarization", rating: 4.9 },
    { name: "Claude Analysis Agent", desc: "Analysis · Coding · Review", rating: 4.8 },
    { name: "Web Search Agent", desc: "InfoMesh 탈중앙 검색", rating: 4.7 },
  ],
  "Human Experts": [
    { name: "김민준", desc: "베트남 법인·세무", rating: 4.9 },
    { name: "신나라", desc: "USDT P2P", rating: 4.8 },
    { name: "박태윤", desc: "AI 에이전트 개발", rating: 4.9 },
  ],
  MCP: [
    { name: "Web Search", desc: "통합 웹 검색", rating: 4.8 },
    { name: "GitHub", desc: "리포지토리·이슈·PR", rating: 4.9 },
    { name: "Postgres", desc: "SQL 데이터베이스", rating: 4.7 },
  ],
  Knowledge: [
    { name: "베트남 법인 설립 절차", desc: "검증된 지식 레코드", rating: 4.9 },
    { name: "다낭 TRC 갱신 후기", desc: "경험 기반 지식", rating: 4.6 },
  ],
  Compute: [
    { name: "GPU Pool (mycellm)", desc: "P2P GPU · QUIC", rating: 4.8 },
    { name: "WebGPU Nodes", desc: "브라우저 로컬 추론", rating: 4.5 },
  ],
};
export function MarketplacePage() {
  const [tab, setTab] = useState(MARKET_TABS[0] ?? "Agents");
  return (
    <Page title="Marketplace" subtitle="AI Capability App Store">
      <div className="policy-row">
        {MARKET_TABS.map((t) => (
          <button
            key={t}
            className={t === tab ? "policy-chip active" : "policy-chip"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="spec-grid">
        {(MARKET_ITEMS[tab] ?? []).map((item) => (
          <article className="spec-card" key={item.name}>
            <div className="spec-card-head">
              <span className="spec-kind mcp">{tab}</span>
              <span className="spec-rating">★ {item.rating}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.desc}</p>
            <div className="mesh-actions">
              <button className="btn-primary">설치 / 연결</button>
              <button className="btn-secondary">테스트</button>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}

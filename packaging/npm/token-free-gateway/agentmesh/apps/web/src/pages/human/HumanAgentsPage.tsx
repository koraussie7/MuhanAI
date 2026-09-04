import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #6: Human Agents
// =====================================================================
interface HumanAgent {
  id: string;
  name: string;
  specialty: string;
  category: string;
  location: string;
  rating: number;
  answerCount: number;
  verificationRate: number;
  available: boolean;
}

export function HumanAgentsPage() {
  const [agents, setAgents] = useState<HumanAgent[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive] = useState("All");

  useEffect(() => {
    load<string[]>("/api/human-agents/categories").then((c) => c && setCategories(c));
  }, []);

  useEffect(() => {
    load<HumanAgent[]>(
      `/api/human-agents${active !== "All" ? `?category=${active}` : ""}`,
    ).then((d) => d && setAgents(d));
  }, [active]);

  return (
    <SpecPage
      title="Human Agents"
      subtitle="7,542 Human Agents · AI 신뢰도가 부족할 때 실제 사람의 경험에 물어보세요"
    >
      <div className="policy-row">
        {categories.map((c) => (
          <button
            key={c}
            className={c === active ? "policy-chip active" : "policy-chip"}
            onClick={() => setActive(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="spec-grid">
        {agents.map((a) => (
          <article className="spec-card" key={a.id}>
            <div className="spec-card-head">
              <span className={`spec-kind human ${a.available ? "on" : "off"}`}>
                {a.available ? "● Available" : "○ Busy"}
              </span>
              <span className="spec-rating">★ {a.rating}</span>
            </div>
            <h3>{a.name}</h3>
            <p>{a.specialty}</p>
            <div className="spec-card-meta">
              <span>📍 {a.location}</span>
              <span>분야 {a.category}</span>
              <span>답변 {a.answerCount}건</span>
              <span>검증률 {a.verificationRate}%</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-primary">질문하기</button>
              <button className="btn-secondary">프로필 보기</button>
            </div>
          </article>
        ))}
      </div>
      <p className="dash-note">
        🤖 "AI가 충분한 신뢰도에 도달하지 못했습니다. 인간 네트워크에 물어보시겠습니까?"
      </p>
    </SpecPage>
  );
}

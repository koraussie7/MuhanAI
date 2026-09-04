import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #8: Reputation
// =====================================================================
interface ReputationData {
  overall: number;
  scores: { area: string; score: number }[];
  history: { event: string; delta: string; at: string }[];
}
export function ReputationPage() {
  const [data, setData] = useState<{
    overall: number;
    scores: { area: string; score: number }[];
    history: { event: string; delta: string; at: string }[];
  } | null>(null);

  useEffect(() => {
    let alive = true;
    const fetchData = () =>
      load<ReputationData>("/api/reputation").then((d) => {
        if (alive && d) setData(d);
      });
    fetchData();
    const timer = setInterval(fetchData, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <SpecPage
      title="Reputation"
      subtitle="에이전트·LLM·MCP·컴퓨팅 노드·지식 모두 평판을 가집니다"
    >
      <StatGrid stats={[["Overall", data?.overall ?? 0]]} />
      <div className="spec-list">
        {data?.scores.map((s) => (
          <div className="spec-row" key={s.area}>
            <div className="spec-row-main">
              <h3>{s.area}</h3>
            </div>
            <div className="spec-score">
              <Progress value={s.score} />
              <strong>{s.score}</strong>
            </div>
          </div>
        ))}
      </div>
      {data && data.history.length > 0 && (
        <div className="dash-block">
          <h3>최근 평판 변화</h3>
          {data.history.map((h, i) => (
            <div className="kg-edge" key={i}>
              <span>{h.event}</span>
              <em>{h.delta}</em>
            </div>
          ))}
        </div>
      )}
    </SpecPage>
  );
}

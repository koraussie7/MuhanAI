import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #8: Contributions
// =====================================================================
interface ContributionsData {
  total: number;
  items: { type: string; count: number; credits: number }[];
}
export function ContributionsPage() {
  const [data, setData] = useState<{
    total: number;
    items: { type: string; count: number; credits: number }[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    const fetchData = () =>
      load<ContributionsData>("/api/contributions").then((d) => {
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
    <SpecPage title="Contributions" subtitle="기여 원장 — 모든 기여가 크레딧으로 기록됩니다">
      <StatGrid
        stats={[
          ["Total", data?.total ?? 0],
          ["Entity Types", data?.items.length ?? 0],
        ]}
      />
      <div className="spec-list">
        {data?.items.map((item) => (
          <div className="spec-row" key={item.type}>
            <div className="spec-row-main">
              <h3>{item.type}</h3>
              <span>{item.count.toLocaleString("ko-KR")}회 기여</span>
            </div>
            <strong className="spec-reward">
              +{item.credits} Credit / 건
            </strong>
          </div>
        ))}
      </div>
    </SpecPage>
  );
}

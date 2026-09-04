import React, { useEffect, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage as Page, StatGrid } from "../../components/common/spec";

export function VerificationPage() {
  const [items, setItems] = useState<
    {
      id: string;
      claim: string;
      sources: number;
      votes: { correct: number; wrong: number; unsure: number };
    }[]
  >([]);
  useEffect(() => {
    let alive = true;
    const fetchItems = () =>
      load<NonNullable<typeof items>>("/api/verify").then((d) => {
        if (alive && d) setItems(d);
      });
    fetchItems();
    const timer = setInterval(fetchItems, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <Page
      title="Verification Center"
      subtitle={`대기 중: ${items.length}건 · 모드: AI vs AI · AI vs Web · AI vs Human · Human vs Human`}
    >
      <div className="verify-queue">
        {items.map((item) => {
          const total =
            item.votes.correct + item.votes.wrong + item.votes.unsure;
          const confidence = total
            ? Math.round((item.votes.correct / total) * 100)
            : 0;
          return (
            <article className="verify-queue-item" key={item.id}>
              <span className="claim-id">Claim #{item.id}</span>
              <p>{item.claim}</p>
              <div className="verify-queue-meta">
                <span>출처 {item.sources}</span>
                <span>참여 {total}</span>
                <span className={confidence >= 70 ? "conf high" : "conf low"}>
                  신뢰도 {confidence}%
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

// ---- P2P Network ----

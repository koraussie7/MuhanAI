import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #5: Knowledge
// =====================================================================
interface KnowledgeItem {
  id: string;
  title: string;
  kind: string;
  summary: string;
  confidence: number;
  sources: number;
  contributors: number;
  tags: string[];
  verified: boolean;
  updatedAt: string;
}

export function KnowledgePage() {
  const [kinds, setKinds] = useState<{ id: string; label: string }[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [active, setActive] = useState("all");

  useEffect(() => {
    load<{ id: string; label: string }[]>("/api/knowledge/kinds").then(
      (k) => k && setKinds(k),
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const fetchItems = () =>
      load<KnowledgeItem[]>(
        `/api/knowledge${active !== "all" ? `?kind=${active}` : ""}`,
      ).then((d) => {
        if (alive && d) setItems(d);
      });
    fetchItems();
    const timer = setInterval(fetchItems, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active]);

  return (
    <SpecPage
      title="Knowledge"
      subtitle={`18.4M records · Provenance + CRDT · ${items.length}개 표시 중`}
    >
      <div className="policy-row">
        {kinds.map((k) => (
          <button
            key={k.id}
            className={k.id === active ? "policy-chip active" : "policy-chip"}
            onClick={() => setActive(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="spec-grid">
        {items.map((item) => (
          <article className="spec-card" key={item.id}>
            <div className="spec-card-head">
              <span className={`spec-kind ${item.kind}`}>{item.kind}</span>
              {item.verified && (
                <span className="spec-verified">✓ Verified</span>
              )}
            </div>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <div className="spec-tags">
              {item.tags.map((t) => (
                <span className="spec-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <div className="spec-card-meta">
              <span>신뢰도 {Math.round(item.confidence * 100)}%</span>
              <span>출처 {item.sources}</span>
              <span>기여 {item.contributors}</span>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}

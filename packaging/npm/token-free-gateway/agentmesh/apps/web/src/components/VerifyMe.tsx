import { useEffect, useState } from "react";

interface VerifyItem {
  id: string;
  claim: string;
  sources: number;
  votes: {
    correct: number;
    wrong: number;
    unsure: number;
  };
  createdAt: string;
}

const DEFAULT_ITEMS: VerifyItem[] = [
  {
    id: "vf-1",
    claim: "다낭의 FPT 인터넷은 500Mbps 서비스를 제공한다.",
    sources: 3,
    votes: { correct: 12, wrong: 2, unsure: 4 },
    createdAt: "",
  },
  {
    id: "vf-2",
    claim: "호치민 1군 카페에서는 대부분 카드 결제가 가능하다.",
    sources: 5,
    votes: { correct: 7, wrong: 9, unsure: 3 },
    createdAt: "",
  },
  {
    id: "vf-3",
    claim: "베트남 모토바이 전동화 보조금은 2026년부터 시행된다.",
    sources: 2,
    votes: { correct: 3, wrong: 5, unsure: 14 },
    createdAt: "",
  },
];

const API = import.meta.env.VITE_API_BASE ?? "";

export function VerifyMe() {
  const [items, setItems] = useState<VerifyItem[]>(DEFAULT_ITEMS);
  const [voted, setVoted] = useState<Record<string, "correct" | "wrong" | "unsure">>({});

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    fetch(`${API}/api/verify`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setItems(data);
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  async function vote(id: string, type: "correct" | "wrong" | "unsure") {
    try {
      const res = await fetch(`${API}/api/verify/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: type }),
      });
      if (res.ok) {
        const data = await res.json();
        const updated = data.item ?? data;
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id
              ? { ...i, votes: { ...i.votes, [type]: (i.votes[type] || 0) + 1 } }
              : i
          )
        );
      }
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, votes: { ...i.votes, [type]: (i.votes[type] || 0) + 1 } }
            : i
        )
      );
    }
    setVoted((prev) => ({ ...prev, [id]: type }));
  }

  return (
    <section id="verify" className="verify-me">
      <div className="section-heading">
        <span className="section-label">03 / VERIFY ME</span>
        <h2>
          AI가 찾은 정보를
          <br />
          <em>직접 검증</em>하세요.
        </h2>
      </div>
      <div className="verify-grid">
        {items.map((item) => (
          <article className="verify-card" key={item.id}>
            <span className="verify-tag">🔍 검증 필요</span>
            <p className="verify-claim">"{item.claim}"</p>
            <div className="verify-sources">참고 출처 {item.sources}개</div>
            <div className="verify-stats">
              <span className="stat-correct">맞음 {item.votes.correct}</span>
              <span className="stat-wrong">틀림 {item.votes.wrong}</span>
              <span className="stat-unsure">모름 {item.votes.unsure}</span>
            </div>
            <div className="verify-actions">
              <button
                type="button"
                className={`verify-btn correct ${voted[item.id] === "correct" ? "active" : ""}`}
                disabled={Boolean(voted[item.id])}
                onClick={() => vote(item.id, "correct")}
              >
                맞음 ✓
              </button>
              <button
                type="button"
                className={`verify-btn wrong ${voted[item.id] === "wrong" ? "active" : ""}`}
                disabled={Boolean(voted[item.id])}
                onClick={() => vote(item.id, "wrong")}
              >
                틀림 ✗
              </button>
              <button
                type="button"
                className={`verify-btn unsure ${voted[item.id] === "unsure" ? "active" : ""}`}
                disabled={Boolean(voted[item.id])}
                onClick={() => vote(item.id, "unsure")}
              >
                모름 ?
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

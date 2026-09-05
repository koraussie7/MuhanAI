import { useEffect, useState } from "react";

type Vote = "correct" | "wrong" | "unsure";

interface VerifyItem {
  id: string;
  claim: string;
  sources: number;
  votes: { correct: number; wrong: number; unsure: number };
  confidence: number;
  createdAt: string;
}

const API = import.meta.env.VITE_API_BASE ?? "";
const LABEL: Record<Vote, string> = { correct: "✓ 맞음", wrong: "✕ 틀림", unsure: "? 모르겠음" };

export function VerifyMe() {
  const [items, setItems] = useState<VerifyItem[]>([]);
  const [voted, setVoted] = useState<Record<string, Vote>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/verify`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function vote(id: string, choice: Vote) {
    const res = await fetch(`${API}/api/verify/${id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vote: choice }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setVoted((prev) => ({ ...prev, [id]: choice }));
    }
  }

  if (loading) {
    return (
      <section id="verify" className="verify-me">
        <div className="verify-loading">
          <div className="spinner" />
          <p>검증할 지식을 불러오는 중...</p>
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section id="verify" className="verify-me">
      <div className="section-heading compact">
        <span className="section-label">04 / VERIFY ME</span>
        <h2>3초면 충분합니다.<br /><em>지식을 검증</em>하세요.</h2>
      </div>
      
      <div className="verify-list">
        {items.slice(0, 3).map((item) => {
          const total = item.votes.correct + item.votes.wrong + item.votes.unsure;
          return (
            <article key={item.id} className="verify-card">
              <p className="verify-claim">"{item.claim}"</p>
              <div className="verify-meta">
                <span>출처 {item.sources}개</span>
                <span>AI Confidence {Math.round(item.confidence * 100)}%</span>
                <span>{total}명 참여</span>
              </div>
              <div className="verify-actions">
                {(["correct", "wrong", "unsure"] as Vote[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={voted[item.id] === v ? "vote-button active" : "vote-button"}
                    disabled={voted[item.id] !== undefined}
                    onClick={() => vote(item.id, v)}
                  >
                    {LABEL[v]}
                  </button>
                ))}
              </div>
              {voted[item.id] && (
                <p className="verify-thanks">
                  💡 감사합니다! 검증에 참여하셨습니다. 
                  (맞음 {item.votes.correct} · 틀림 {item.votes.wrong} · 모름 {item.votes.unsure})
                </p>
              )}
              <div className="verify-progress">
                <div className="progress-bar">
                  <div className="progress-fill correct" style={{ width: `${total > 0 ? (item.votes.correct / total) * 100 : 0}%` }} />
                  <div className="progress-fill wrong" style={{ width: `${total > 0 ? (item.votes.wrong / total) * 100 : 0}%` }} />
                  <div className="progress-fill unsure" style={{ width: `${total > 0 ? (item.votes.unsure / total) * 100 : 0}%` }} />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
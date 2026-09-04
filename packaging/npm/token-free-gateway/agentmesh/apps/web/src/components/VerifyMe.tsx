import { useEffect, useState } from "react";

type Vote = "correct" | "wrong" | "unsure";

interface VerifyItem {
  id: string;
  claim: string;
  sources: number;
  votes: { correct: number; wrong: number; unsure: number };
}

const API = import.meta.env.VITE_API_BASE ?? "";
const LABEL: Record<Vote, string> = {
  correct: "✓ 맞음",
  wrong: "✕ 틀림",
  unsure: "? 모르겠음",
};

export function VerifyMe() {
  const [items, setItems] = useState<VerifyItem[]>([]);
  const [voted, setVoted] = useState<Record<string, Vote>>({});

  useEffect(() => {
    fetch(`${API}/api/verify`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {});
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

  if (!items.length) return null;
  const item = items[0];
  if (!item) return null;
  const total = item.votes.correct + item.votes.wrong + item.votes.unsure;
  return (
    <section id="verify" className="verify-me">
      <div className="section-heading compact">
        <span className="section-label">03 / VERIFY ME</span>
        <h2>
          3초면 충분합니다.
          <br />
          <em>지식을 검증</em>하세요.
        </h2>
      </div>
      <article className="verify-card">
        <p className="verify-claim">"{item.claim}"</p>
        <span className="verify-sources">
          출처 {item.sources}개 · {total}명 참여
        </span>
        <div className="verify-actions">
          {(["correct", "wrong", "unsure"] as Vote[]).map((v) => (
            <button
              key={v}
              className={
                voted[item.id] === v ? "vote-button active" : "vote-button"
              }
              disabled={voted[item.id] !== undefined}
              onClick={() => vote(item.id, v)}
            >
              {LABEL[v]}
            </button>
          ))}
        </div>
        {voted[item.id] && (
          <p className="verify-thanks">
            💡 감사합니다! 검증에 참여하셨습니다. (맞음 {item.votes.correct} ·
            틀림 {item.votes.wrong} · 모름 {item.votes.unsure})
          </p>
        )}
      </article>
    </section>
  );
}

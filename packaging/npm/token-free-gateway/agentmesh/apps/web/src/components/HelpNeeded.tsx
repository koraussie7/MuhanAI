import { useEffect, useState } from "react";

interface HelpNeededItem {
  id: string;
  question: string;
  aiConfidence: number;
  humanAnswers: number;
  reward: number;
  participants: number;
  category: string;
  createdAt: string;
}

const API = import.meta.env.VITE_API_BASE ?? "";

export function HelpNeeded() {
  const [items, setItems] = useState<HelpNeededItem[]>([]);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/help-needed`)
      .then((r) => r.json())
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function answer(id: string) {
    const res = await fetch(`${API}/api/help-needed/${id}/answer`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setAnswered((prev) => new Set(prev).add(id));
    }
  }

  async function verify(id: string) {
    console.log("Verify requested for", id);
  }

  async function delegateToAI(id: string) {
    console.log("Delegate to AI for", id);
  }

  if (loading) {
    return (
      <section id="help" className="help-needed">
        <div className="help-loading">
          <div className="spinner" />
          <p>AI가 해결 못한 문제를 불러오는 중...</p>
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section id="help" className="help-needed">
      <div className="section-heading">
        <span className="section-label">02 / HELP NEEDED</span>
        <h2>AI가 해결하지 못한<br /><em>문제에 참여</em>하세요.</h2>
      </div>
      <div className="help-grid">
        {items.map((item) => (
          <article className="help-card" key={item.id}>
            <span className="help-badge">🔴 도움이 필요합니다</span>
            <p className="help-question">{item.question}</p>
            <div className="help-meta">
              <span>AI Confidence {Math.round(item.aiConfidence * 100)}%</span>
              <span>Human Answers {item.humanAnswers}</span>
              <span className="help-reward">+{item.reward} Credit</span>
              <span>👥 {item.participants}명 참여 중</span>
            </div>
            <div className="help-actions">
              <button
                type="button"
                className="primary-button small"
                disabled={answered.has(item.id)}
                onClick={() => answer(item.id)}
              >
                {answered.has(item.id) ? "참여 완료 ✓" : "내가 아는 내용 추가"}
              </button>
              <button type="button" className="secondary-button small" onClick={() => verify(item.id)}>
                검증하기
              </button>
              <button type="button" className="secondary-button small" onClick={() => delegateToAI(item.id)}>
                AI에게 맡기기
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE ?? "";

// ---- Priority #4: Trending Questions ----
export function Trending() {
  const [items, setItems] = useState<{ id: string; question: string; score: number }[]>([]);
  useEffect(() => {
    fetch(`${API}/api/trending`).then((r) => r.json()).then(setItems).catch(() => {});
  }, []);
  if (!items.length) return null;
  const max = Math.max(...items.map((i) => i.score));
  return (
    <section id="trending" className="trending">
      <div className="section-heading compact">
        <span className="section-label">04 / TRENDING</span>
        <h2>지금 네트워크가<br /><em>집중하는 질문</em></h2>
      </div>
      <div className="trend-list">
        {items.map((item) => (
          <div className="trend-row" key={item.id}>
            <span className="trend-question">{item.question}</span>
            <div className="trend-bar-wrap">
              <div className="trend-bar" style={{ width: `${(item.score / max) * 100}%` }} />
            </div>
            <strong className="trend-score">{item.score}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Priority #5: Human Knowledge Wanted ----
export function HumanWanted() {
  const [items, setItems] = useState<{ id: string; prompt: string; shares: number }[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch(`${API}/api/human-wanted`).then((r) => r.json()).then(setItems).catch(() => {});
  }, []);
  async function share(id: string) {
    const res = await fetch(`${API}/api/human-wanted/${id}/share`, { method: "POST" });
    if (res.ok) {
      const { item } = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? item : i)));
      setDone((prev) => new Set(prev).add(id));
    }
  }
  if (!items.length) return null;
  return (
    <section id="human-wanted" className="human-wanted">
      <div className="section-heading compact">
        <span className="section-label">05 / HUMAN KNOWLEDGE WANTED</span>
        <h2>당신만 알고 있을 수 있는<br /><em>경험을 공유</em>하세요.</h2>
      </div>
      <div className="wanted-grid">
        {items.map((item) => (
          <article className="wanted-card" key={item.id}>
            <p>{item.prompt}</p>
            <div className="wanted-footer">
              <span className="wanted-shares">👥 {item.shares}명 공유</span>
              <button type="button" className="text-link share-button" disabled={done.has(item.id)} onClick={() => share(item.id)}>
                {done.has(item.id) ? "+60 Credit ✓" : "경험 공유하기 →"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---- Priority #6: AI vs Human ----
export function AiVsHuman() {
  const [items, setItems] = useState<{ id: string; question: string; aiConsensus: number; humanConsensus: number; winner: "ai" | "human" }[]>([]);
  useEffect(() => {
    fetch(`${API}/api/ai-vs-human`).then((r) => r.json()).then(setItems).catch(() => {});
  }, []);
  if (!items.length) return null;
  return (
    <section id="ai-vs-human" className="ai-vs-human">
      <div className="section-heading compact">
        <span className="section-label">06 / AI vs HUMAN</span>
        <h2>누가 더 정확할까요?</h2>
      </div>
      <div className="versus-grid">
        {items.map((item) => (
          <article className="versus-card" key={item.id}>
            <p className="versus-question">{item.question}</p>
            <div className="versus-bars">
              <div className="versus-row"><span>🤖 AI</span><div className="versus-bar"><i style={{ width: `${item.aiConsensus * 100}%` }} /></div><strong>{Math.round(item.aiConsensus * 100)}%</strong></div>
              <div className="versus-row"><span>👤 Human</span><div className="versus-bar"><i style={{ width: `${item.humanConsensus * 100}%` }} /></div><strong>{Math.round(item.humanConsensus * 100)}%</strong></div>
            </div>
            <span className={item.winner === "human" ? "winner human" : "winner ai"}>
              Winner: {item.winner === "human" ? "👤 HUMAN" : "🤖 AI"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---- Priority #7: Teach AI ----
export function TeachAi() {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  async function submit(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/teach`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) {
        const { submission } = await res.json();
        setStatus(`💡 지식 후보로 등록되었습니다. 검증 후 +${submission.reward} Credit가 지급됩니다.`);
        setContent("");
      } else {
        setStatus("전송에 실패했습니다. 다시 시도해 주세요.");
      }
    } finally {
      setSending(false);
    }
  }
  return (
    <section id="teach" className="teach">
      <div className="section-heading compact">
        <span className="section-label">07 / TEACH AI</span>
        <h2>당신의 경험으로<br /><em>AI를 가르치세요.</em></h2>
      </div>
      <form className="panel teach-panel" onSubmit={submit}>
        <label htmlFor="teach-content">나만 아는 경험이나 지식</label>
        <textarea
          id="teach-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="예: 나는 미얀마에서 10년간 사업을 했는데…"
        />
        <button type="submit" disabled={sending || !content.trim()}>
          {sending ? "제출 중…" : "지식 기여하기 (+250 Credit)"}
        </button>
        {status && <p className="teach-status">{status}</p>}
      </form>
    </section>
  );
}

// ---- Priority #8: Rewards ----
export function Rewards() {
  const [table, setTable] = useState<{ reason: string; credits: number }[]>([]);
  useEffect(() => {
    fetch(`${API}/api/rewards/table`).then((r) => r.json()).then(setTable).catch(() => {});
  }, []);
  if (!table.length) return null;
  return (
    <section id="rewards" className="rewards">
      <div className="section-heading compact">
        <span className="section-label">08 / REWARDS</span>
        <h2>기여는 <em>보상</em>으로 돌아옵니다.</h2>
      </div>
      <div className="reward-grid">
        {table.map((row) => (
          <div className="reward-chip" key={row.reason}>
            <span>{row.reason}</span>
            <strong>+{row.credits}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

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

const DEFAULT_ITEMS: HelpNeededItem[] = [
  {
    id: "hn-1",
    question: "베트남에서 한국인이 사업자 등록을 할 때 실제로 가장 많이 발생하는 문제는 무엇인가?",
    aiConfidence: 0.64,
    humanAnswers: 3,
    reward: 120,
    participants: 8,
    category: "experience_gap",
    createdAt: "",
  },
  {
    id: "hn-2",
    question: "미얀마 현지에서 실제 USDT P2P 거래 시 가장 안전한 거래 방식은?",
    aiConfidence: 0.61,
    humanAnswers: 1,
    reward: 250,
    participants: 5,
    category: "info_conflict",
    createdAt: "",
  },
  {
    id: "hn-3",
    question: "다낭 장기 거주 시 비자 런 규정의 2025년 최신 변경 사항은?",
    aiConfidence: 0.48,
    humanAnswers: 2,
    reward: 300,
    participants: 11,
    category: "outdated",
    createdAt: "",
  },
];

const API = import.meta.env.VITE_API_BASE ?? "";

export function HelpNeeded() {
  const [items, setItems] = useState<HelpNeededItem[]>(DEFAULT_ITEMS);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    fetch(`${API}/api/help-needed`, { signal: controller.signal })
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

  async function answer(id: string) {
    try {
      const res = await fetch(`${API}/api/help-needed/${id}/answer`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      } else {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, humanAnswers: i.humanAnswers + 1, participants: i.participants + 1 } : i
          )
        );
      }
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, humanAnswers: i.humanAnswers + 1, participants: i.participants + 1 } : i
        )
      );
    }
    setAnswered((prev) => new Set(prev).add(id));
  }

  async function verify(id: string) {
    alert("검증 대기열에 등록되었습니다. 지식 레이크 합의를 시작합니다.");
  }

  async function delegateToAI(id: string) {
    window.location.href = `/agent-cast?q=${encodeURIComponent(
      items.find((i) => i.id === id)?.question || ""
    )}`;
  }

  return (
    <section id="help" className="help-needed">
      <div className="section-heading">
        <span className="section-label">02 / HELP NEEDED</span>
        <h2>
          AI가 해결하지 못한
          <br />
          <em>문제에 참여</em>하세요.
        </h2>
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

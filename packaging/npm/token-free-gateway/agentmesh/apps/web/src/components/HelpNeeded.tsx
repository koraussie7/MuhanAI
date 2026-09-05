import React, { useEffect, useState } from "react";
import { AlertCircle, Users, Zap, CheckCircle2, Bot, ArrowRight, ShieldCheck, MessageSquarePlus } from "lucide-react";

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
    id: "hn-3",
    question: "다낭 장기 거주 시 비자 런 규정의 2025년 최신 변경 사항은?",
    aiConfidence: 0.48,
    humanAnswers: 2,
    reward: 300,
    participants: 11,
    category: "outdated",
    createdAt: "",
  },
  {
    id: "hn-2",
    question: "미얀마 현지에서 실제 USDT P2P 거래 시 가장 안전한 거래 방식은?",
    aiConfidence: 0.61,
    humanAnswers: 2,
    reward: 250,
    participants: 6,
    category: "info_conflict",
    createdAt: "",
  },
  {
    id: "hn-1",
    question: "베트남에서 한국인이 사업자 등록을 할 때 실제로 가장 많이 발생하는 문제는 무엇인가?",
    aiConfidence: 0.64,
    humanAnswers: 4,
    reward: 120,
    participants: 9,
    category: "experience_gap",
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
    <section id="help" className="help-needed-section">
      <div className="section-head-boxed">
        <div className="head-badge-row">
          <span className="head-badge-tag">02 / HUMAN IN THE LOOP</span>
          <span className="head-status-live">● 3건 참여 대기</span>
        </div>
        <h2 className="section-boxed-title">
          AI가 해결하지 못한 문제에 참여하세요
        </h2>
        <p className="section-boxed-desc">
          지식 베이스 충돌이나 최신 규정 변경 등으로 AI의 신뢰도가 낮은 문제입니다. 실제 경험을 공유하고 MHT 보상을 획득하세요.
        </p>
      </div>

      <div className="help-grid-boxed">
        {items.map((item) => (
          <article className="help-card-boxed" key={item.id}>
            {/* Top Status & Badge */}
            <div className="card-top-row">
              <span className="urgency-badge">
                <span className="urgency-dot" />
                도움이 필요합니다
              </span>
              <span className="reward-chip-boxed">
                <Zap size={13} />
                +{item.reward} Credit
              </span>
            </div>

            {/* Question Title */}
            <h3 className="help-question-title">{item.question}</h3>

            {/* Metrics Chips Row */}
            <div className="help-metrics-strip">
              <div className="metric-chip">
                <span className="metric-chip-lbl">AI Confidence</span>
                <span className="metric-chip-val" style={{ color: item.aiConfidence < 0.5 ? 'var(--cline-rose)' : 'var(--cline-amber)' }}>
                  {Math.round(item.aiConfidence * 100)}%
                </span>
              </div>

              <div className="metric-chip">
                <span className="metric-chip-lbl">Human Answers</span>
                <span className="metric-chip-val">{item.humanAnswers}명</span>
              </div>

              <div className="metric-chip">
                <span className="metric-chip-lbl">참여 인원</span>
                <span className="metric-chip-val">
                  <Users size={12} style={{ display: 'inline', marginRight: 3 }} />
                  {item.participants}명
                </span>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="help-actions-row">
              <button
                type="button"
                className={`card-btn-primary ${answered.has(item.id) ? 'done' : ''}`}
                disabled={answered.has(item.id)}
                onClick={() => answer(item.id)}
              >
                <MessageSquarePlus size={14} />
                {answered.has(item.id) ? "참여 완료 ✓" : "내가 아는 내용 추가"}
              </button>

              <button
                type="button"
                className="card-btn-secondary"
                onClick={() => verify(item.id)}
              >
                <ShieldCheck size={14} />
                검증하기
              </button>

              <button
                type="button"
                className="card-btn-ghost"
                onClick={() => delegateToAI(item.id)}
              >
                <Bot size={14} />
                AI에게 맡기기
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

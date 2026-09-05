import { useState } from "react";

interface CastResult {
  agent: string;
  answer: string;
  confidence: number;
}

const CAST_RESULTS: CastResult[] = [
  { agent: "Gemini Research", answer: "2025년 비자 규정은 ...", confidence: 92 },
  { agent: "Claude Analysis", answer: "미얀마 P2P 거래 시 ...", confidence: 78 },
  { agent: "Local LLM", answer: "다낭 장기 거주 ...", confidence: 65 },
];

export function ConsensusView() {
  const [step, setStep] = useState(0);
  const total = CAST_RESULTS.length;

  return (
    <section className="panel">
      <div className="section-heading compact">
        <span className="section-label">AGENT CAST / CONSENSUS</span>
        <h2>Consensus <em>Timeline</em></h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CAST_RESULTS.map((r, i) => (
          <div
            key={i}
            className="help-card"
            style={{
              opacity: step >= i ? 1 : 0.4,
              borderLeft: `3px solid ${i === 0 ? "#10b981" : i === 1 ? "#3b82f6" : "#f59e0b"}`,
            }}
          >
            <div className="agent-header">
              <span className="agent-name">{r.agent}</span>
              <span className={`agent-confidence ${r.confidence > 0.9 ? "high" : r.confidence > 0.7 ? "medium" : "low"}`}>
                {Math.round(r.confidence * 100)}%
              </span>
            </div>
            <p className="agent-answer">{r.answer}</p>
            <div className="trend-bar-wrap" style={{ marginTop: 8 }}>
              <div className="trend-bar" style={{ width: `${r.confidence}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button className="btn-primary small" onClick={() => setStep((s) => Math.min(s + 1, total))}>Next Step</button>
        <button className="btn-secondary small" onClick={() => setStep(0)}>Reset</button>
      </div>
    </section>
  );
}

export default ConsensusView;

import React, { useState } from "react";

// Visual from miroclaw + Society Protocol: Multi-Agent Consensus Dial & Conflict Inspector
export interface AgentVote {
  agent: string;
  avatar: string;
  decision: "agree" | "modify" | "reject";
  confidence: number;
  reason: string;
}

export function ConsensusDial() {
  const [agreement] = useState(94.2);
  const [votes] = useState<AgentVote[]>([
    { agent: "Claude 3.5 Sonnet", avatar: "🤖", decision: "agree", confidence: 98, reason: "WebRTC DataChannel 128B MTU 조각화 방지 증명 검증 완료" },
    { agent: "Gemini 1.5 Pro", avatar: "🧠", decision: "agree", confidence: 96, reason: "RFC 8831 WebRTC Data Channels 표준 문서 인용 일치" },
    { agent: "DeepSeek R1", avatar: "⚡", decision: "agree", confidence: 92, reason: "수학적 지연 시간 O(log N) 가십 알고리즘 증명 확인" },
    { agent: "Local Llama-3.3", avatar: "💻", decision: "modify", confidence: 78, reason: "ARM64 환경에서 SIMD 가속시 메모리 복사 오버헤드 주석 권고" },
  ]);

  const [activeAgent, setActiveAgent] = useState<AgentVote>(votes[0] ?? {
    agent: "Claude",
    avatar: "🤖",
    decision: "agree",
    confidence: 98,
    reason: "검증 완료",
  });

  // SVG Circular Gauge calculations
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (agreement / 100) * circumference;

  return (
    <div className="consensus-dial-card">
      <div className="consensus-dial-header">
        <div className="consensus-dial-title">
          <span className="consensus-ping-dot" />
          <strong>MIROCLAW CONSENSUS MATRIX</strong>
          <span className="protocol-badge proto-webrtc">4-AGENT POOL</span>
        </div>
        <span className="consensus-badge-status">QUORUM REACHED (94.2%)</span>
      </div>

      <div className="consensus-dial-body">
        {/* Circular Gauge */}
        <div className="consensus-gauge-wrap">
          <svg width={size} height={size} className="consensus-svg">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="consensus-bg-circle"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              className="consensus-progress-circle"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <div className="consensus-gauge-content">
            <span className="consensus-pct">{agreement}%</span>
            <span className="consensus-label">합의 일치율</span>
          </div>
        </div>

        {/* Participating Agent Votes List */}
        <div className="consensus-votes-column">
          <span className="votes-header-label">PARTICIPATING AGENTS & REASONING</span>
          <div className="votes-list">
            {votes.map((v) => (
              <div
                key={v.agent}
                className={`vote-row-item ${activeAgent.agent === v.agent ? "selected" : ""}`}
                onClick={() => setActiveAgent(v)}
              >
                <span className="vote-agent-icon">{v.avatar}</span>
                <div className="vote-agent-info">
                  <strong className="vote-agent-name">{v.agent}</strong>
                  <span className="vote-agent-reason">{v.reason}</span>
                </div>
                <div className="vote-status-col">
                  <span className={`vote-badge ${v.decision}`}>
                    {v.decision === "agree" ? "일치 (Agree)" : "수정 제안"}
                  </span>
                  <span className="vote-conf">{v.confidence}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

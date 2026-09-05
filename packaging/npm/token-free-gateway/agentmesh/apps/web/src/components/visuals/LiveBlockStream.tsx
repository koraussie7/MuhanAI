import React, { useState, useEffect } from "react";

// Visual from p2ptokens + PinkyBrain: Live Horizontal Block & Transaction Ledger Stream
export interface LedgerBlock {
  blockNumber: number;
  hash: string;
  contributor: string;
  action: "compute_inference" | "knowledge_verify" | "webrtc_relay" | "mcp_tool_exec";
  reward: number;
  gasTokens: number;
  timeAgo: string;
}

const INITIAL_BLOCKS: LedgerBlock[] = [
  { blockNumber: 48921, hash: "0x8f4a9b...c21", contributor: "Seoul-Validator-KR", action: "knowledge_verify", reward: 250, gasTokens: 0, timeAgo: "1초 전" },
  { blockNumber: 48920, hash: "0x3e11fa...88d", contributor: "Claude-3.5-Analyzer", action: "compute_inference", reward: 120, gasTokens: 0, timeAgo: "4초 전" },
  { blockNumber: 48919, hash: "0x7a992d...14e", contributor: "Tokyo-Gpu-Inference", action: "compute_inference", reward: 180, gasTokens: 0, timeAgo: "8초 전" },
  { blockNumber: 48918, hash: "0x55c301...99a", contributor: "US-West-Router-01", action: "webrtc_relay", reward: 45, gasTokens: 0, timeAgo: "14초 전" },
];

export function LiveBlockStream() {
  const [blocks, setBlocks] = useState<LedgerBlock[]>(INITIAL_BLOCKS);

  // New Block Mine Simulator
  useEffect(() => {
    const timer = setInterval(() => {
      const actions: LedgerBlock["action"][] = ["compute_inference", "knowledge_verify", "webrtc_relay", "mcp_tool_exec"];
      const contributors = ["Seoul-Node-Alpha", "Claude-Engineer", "Sarah-K-Security", "Gemini-Researcher", "Edge-Worker-SG"];
      const randAction = actions[Math.floor(Math.random() * actions.length)] ?? "compute_inference";
      const randContrib = contributors[Math.floor(Math.random() * contributors.length)] ?? "Peer-Node";

      const newBlock: LedgerBlock = {
        blockNumber: 48922 + Math.floor(Math.random() * 100),
        hash: `0x${Math.random().toString(16).slice(2, 8)}...${Math.random().toString(16).slice(2, 5)}`,
        contributor: randContrib,
        action: randAction,
        reward: Math.floor(40 + Math.random() * 200),
        gasTokens: 0,
        timeAgo: "방금",
      };

      setBlocks((prev) => [newBlock, ...prev.slice(0, 5)]);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const getActionBadge = (action: LedgerBlock["action"]) => {
    switch (action) {
      case "knowledge_verify": return { label: "검증 승인", color: "#e6ff87" };
      case "compute_inference": return { label: "연산 추론", color: "#38bdf8" };
      case "webrtc_relay": return { label: "릴레이 라우트", color: "#ffb86b" };
      case "mcp_tool_exec": return { label: "MCP 도구 실행", color: "#c084fc" };
    }
  };

  return (
    <div className="block-stream-container">
      <div className="block-stream-header">
        <div className="block-stream-title">
          <span className="block-pulse-cube" />
          <strong>LIVE TOKEN & CREDIT MINING STREAM</strong>
          <span className="protocol-badge proto-webrtc">ZERO-TOKEN LEDGER</span>
        </div>
        <div className="block-stream-stat">
          <span>합의 속도: <strong>1.8s / Block</strong></span>
          <span>총 채굴 보상: <strong>1,489,200 CR</strong></span>
        </div>
      </div>

      <div className="block-cards-row">
        {blocks.map((b, i) => {
          const badge = getActionBadge(b.action);
          return (
            <div className={`ledger-block-box ${i === 0 ? "new-block" : ""}`} key={`${b.blockNumber}-${i}`}>
              <div className="block-top-meta">
                <span className="block-num">#{b.blockNumber}</span>
                <span className="block-time">{b.timeAgo}</span>
              </div>

              <div className="block-hash">{b.hash}</div>

              <div className="block-action-chip" style={{ borderColor: badge.color, color: badge.color }}>
                {badge.label}
              </div>

              <div className="block-contributor">
                <span>By:</span>
                <strong>{b.contributor}</strong>
              </div>

              <div className="block-bottom-row">
                <span className="block-zero-gas">0 GAS (Token-Free)</span>
                <span className="block-reward">+{b.reward} CR</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

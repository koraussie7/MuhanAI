import React from "react";
import type { ComputeWorker } from "./WorkerPool.js";

/**
 * MarketplaceGrid — 5-market integrated card view.
 * Adapted from AgentFM (agent cards), mycellm FleetGrid (compute rental),
 * p2ptokens (pricing/credits), InfoMesh-style directory patterns.
 */
export interface MarketAgent {
  id: string;
  name: string;
  caps: string[];
  price: number;
  unit: string;
  rating: number;
}
export interface MarketExpert {
  id: string;
  name: string;
  expertise: string[];
  creditsHr: number;
  rating: number;
  responseMin: number;
}
export interface MarketMcp {
  id: string;
  name: string;
  category: string;
  calls: number;
  rating: number;
}
export interface MarketKnowledge {
  id: string;
  title: string;
  domain: string;
  score: number;
  credits: number;
}

const AGENTS: MarketAgent[] = [
  { id: "a-1", name: "Gemini Research Agent", caps: ["Research", "Web Search", "Summarization"], price: 80, unit: "query", rating: 4.8 },
  { id: "a-2", name: "Claude Analysis Pro", caps: ["Analysis", "Long-form", "Coding"], price: 120, unit: "query", rating: 4.9 },
  { id: "a-3", name: "DeepSeek Coder", caps: ["Coding", "Math", "Reasoning"], price: 45, unit: "query", rating: 4.7 },
  { id: "a-4", name: "Llama Local Assist", caps: ["Local", "Offline", "Privacy"], price: 0, unit: "query", rating: 4.3 },
  { id: "a-5", name: "Verification Judge", caps: ["Fact-check", "Source vs Source", "Consensus"], price: 60, unit: "query", rating: 4.6 },
];
const EXPERTS: MarketExpert[] = [
  { id: "e-1", name: "김민준", expertise: ["베트남 법인·세무"], creditsHr: 240, rating: 4.9, responseMin: 42 },
  { id: "e-2", name: "Sarah Chen", expertise: ["AI Regulation", "EU AI Act"], creditsHr: 320, rating: 4.8, responseMin: 68 },
  { id: "e-3", name: "Duc Nguyen", expertise: ["VN Visa", "장기거주"], creditsHr: 150, rating: 4.7, responseMin: 25 },
  { id: "e-4", name: "Alex Rivera", expertise: ["MCP Integration", "Tooling"], creditsHr: 280, rating: 4.6, responseMin: 55 },
];
const MCPS: MarketMcp[] = [
  { id: "m-1", name: "Postgres MCP", category: "Database", calls: 18420, rating: 4.9 },
  { id: "m-2", name: "Brave Search", category: "Search", calls: 42180, rating: 4.7 },
  { id: "m-3", name: "GitHub Issues", category: "DevTools", calls: 8920, rating: 4.8 },
  { id: "m-4", name: "Slack Notifier", category: "Comms", calls: 15600, rating: 4.5 },
];
const KNOWLEDGE: MarketKnowledge[] = [
  { id: "k-1", title: "베트남 법인 설립 절차 (2026)", domain: "법인·세무", score: 0.94, credits: 15 },
  { id: "k-2", title: "다낭 장기거주 비자 런 최신 변경", domain: "비자·거주", score: 0.78, credits: 20 },
  { id: "k-3", title: "EU AI Act 준수 가이드라인", domain: "규제·컴플라이언스", score: 0.88, credits: 25 },
  { id: "k-4", title: "WebGPU 셋업 레퍼런스", domain: "기술·인프라", score: 0.91, credits: 10 },
];
const COMPUTE: ComputeWorker[] = [
  { id: "gpu-a100", role: "A100 80GB · CUDA", load: 0.91, tasks: 342, status: "busy" },
  { id: "gpu-m3", role: "Apple M3 Max", load: 0.58, tasks: 201, status: "busy" },
  { id: "gpu-4090", role: "RTX 4090", load: 0.74, tasks: 287, status: "busy" },
  { id: "gpu-cpu-01", role: "AMD EPYC 64c", load: 0.42, tasks: 528, status: "idle" },
];

function Stars({ value }: { value: number }) {
  return (
    <span className="hc-stars" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= Math.round(value) ? "hc-star on" : "hc-star"}>★</span>
      ))}
      <span className="hc-stars-val">{value.toFixed(1)}</span>
    </span>
  );
}

function MarketCard({ children }: { children: React.ReactNode }) {
  return <article className="hc-mkt-card">{children}</article>;
}

export function AgentsMarket() {
  return (
    <div className="hc-mkt-grid">
      {AGENTS.map((a) => (
        <MarketCard key={a.id}>
          <div className="hc-mkt-head">
            <strong>{a.name}</strong>
            <Stars value={a.rating} />
          </div>
          <div className="hc-mkt-caps">
            {a.caps.map((c) => <span key={c} className="hc-mkt-cap">{c}</span>)}
          </div>
          <div className="hc-mkt-foot">
            <span className="hc-mkt-price">{a.price === 0 ? "무료" : `${a.price} cr/${a.unit}`}</span>
            <button className="hc-mkt-rent">의뢰</button>
          </div>
        </MarketCard>
      ))}
    </div>
  );
}

export function HumanExperts() {
  return (
    <div className="hc-mkt-grid">
      {EXPERTS.map((e) => (
        <MarketCard key={e.id}>
          <div className="hc-mkt-head">
            <strong>{e.name}</strong>
            <Stars value={e.rating} />
          </div>
          <div className="hc-mkt-caps">
            {e.expertise.map((x) => <span key={x} className="hc-mkt-cap">{x}</span>)}
          </div>
          <div className="hc-mkt-foot">
            <span className="hc-mkt-price">{e.creditsHr} cr/hr</span>
            <span className="hc-mkt-response">~{e.responseMin}분</span>
          </div>
        </MarketCard>
      ))}
    </div>
  );
}

export function McpMarket() {
  return (
    <div className="hc-mkt-list">
      {MCPS.map((m) => (
        <div className="hc-mcp-row" key={m.id}>
          <div className="hc-mcp-main">
            <strong>{m.name}</strong>
            <span className="hc-mcp-cat">{m.category}</span>
          </div>
          <div className="hc-mcp-stats">
            <span className="hc-mcp-calls">{m.calls.toLocaleString()} calls</span>
            <Stars value={m.rating} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function KnowledgeMarket() {
  return (
    <div className="hc-mkt-list">
      {KNOWLEDGE.map((k) => (
        <div className="hc-know-row" key={k.id}>
          <div className="hc-know-main">
            <strong>{k.title}</strong>
            <span className="hc-know-domain">{k.domain}</span>
          </div>
          <div className="hc-know-stats">
            <span className="hc-know-score">신뢰도 {Math.round(k.score * 100)}%</span>
            <span className="hc-mkt-price">{k.credits} cr</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ComputeMarket() {
  return (
    <div className="hc-panel">
      <h3 className="hc-panel-title">컴퓨팅 대여 풀</h3>
      <p className="hc-panel-meta">유휴 컴퓨팅 파워를 크레딧으로 대여 · 시간당 자동 정산</p>
      <div className="hc-gpu-grid">
        {COMPUTE.map((node) => (
          <article key={node.id} className={`hc-gpu-card ${node.status}`}>
            <header>
              <span className={`hc-status-dot ${node.status === "busy" ? "busy" : "idle"}`} />
              <strong className="hc-gpu-name">{node.role}</strong>
              <span className="hc-gpu-tag">{node.status}</span>
            </header>
            <div className="hc-worker-load">
              <div className="hc-load-bar">
                <div className="hc-load-bar-fill" style={{ width: `${Math.round(node.load * 100)}%` }} />
              </div>
              <span className="hc-load-value">{Math.round(node.load * 100)}%</span>
            </div>
            <footer className="hc-gpu-foot">
              <span>태스크 {node.tasks}</span>
              <button className="hc-mkt-rent">대여</button>
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

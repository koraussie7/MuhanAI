import React, { useEffect, useState } from "react";

// Part 4 dashboard pages (spec: CLAUDE.md Part 4). Data comes from the
// feed API where available; otherwise static demo data with live status.
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000/api";

function Page({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dash-page">
      <header className="dash-page-header">
        <h2>{title}</h2>
        {subtitle && <p className="dash-page-subtitle">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function StatGrid({ stats }: { stats: [string, string | number][] }) {
  return (
    <div className="stat-grid">
      {stats.map(([label, value]) => (
        <div className="stat-card" key={label}>
          <strong>
            {typeof value === "number" ? value.toLocaleString("ko-KR") : value}
          </strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ---- Network Monitor (live from /api/pulse + /api/network/stats) ----
export function NetworkMonitorPage() {
  const [pulse, setPulse] = useState<Record<string, number> | null>(null);
  const [stats, setStats] = useState<any | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/pulse`)
      .then((r) => r.json())
      .then(setPulse)
      .catch(() => {});
    fetch(`${API_BASE}/api/network/stats`)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);
  const grid: [string, string | number][] = stats
    ? [
        ["Agents Online", stats.agentsOnline],
        ["Human Agents", stats.humanAgents],
        ["LLM Providers", stats.llmProviders],
        ["MCP Servers", stats.mcpServers],
        ["Compute Nodes", stats.computeNodes],
        ["Knowledge", stats.knowledgeRecords],
        ["Requests/min", stats.requestsPerMin],
        ["Avg Latency", `${stats.avgLatencyMs}ms`],
      ]
    : [["상태", "연결 중…"]];
  return (
    <Page title="Network Monitor" subtitle="실시간 네트워크 상태">
      <StatGrid stats={grid} />
      {stats && (
        <div className="dash-block">
          <h3>활성 태스크</h3>
          <div className="spec-list">
            {Object.entries(stats.activeTasks ?? {}).map(([k, v]) => (
              <div className="kg-edge" key={k}>
                <span>{k}</span>
                <em>{String(v)}</em>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}

// ---- Agent Mesh ----
const MESH_AGENTS = [
  {
    name: "Gemini Research Agent",
    status: "Online",
    capabilities: "Research, Web Search, Summarization",
    latency: "1.2s",
    reputation: 98.4,
    success: 99.1,
  },
  {
    name: "Claude Analysis Agent",
    status: "Online",
    capabilities: "Analysis, Coding, Review",
    latency: "0.9s",
    reputation: 97.8,
    success: 98.6,
  },
  {
    name: "Local LLM Agent",
    status: "Online",
    capabilities: "Local Inference, Privacy",
    latency: "2.1s",
    reputation: 95.2,
    success: 96.4,
  },
  {
    name: "Human Expert Pool",
    status: "Online",
    capabilities: "Experience, Verification",
    latency: "-",
    reputation: 99.1,
    success: 97.9,
  },
];
export function AgentMeshPage() {
  return (
    <Page
      title="Agent Mesh"
      subtitle="User → Router → Mesh (Gemini · Claude · Local · Web · MCP · Human · P2P GPU)"
    >
      <div className="agent-card-grid">
        {MESH_AGENTS.map((a) => (
          <article className="mesh-card" key={a.name}>
            <div className="mesh-card-head">
              <strong>{a.name}</strong>
              <span className="mesh-status">● {a.status}</span>
            </div>
            <p className="mesh-caps">{a.capabilities}</p>
            <div className="mesh-meta">
              <span>지연: {a.latency}</span>
              <span>평판: {a.reputation}</span>
              <span>성공률: {a.success}%</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-secondary">Connect</button>
              <button className="btn-primary">Use</button>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}

// ---- LLM Mesh ----
const PROVIDERS = [
  "Gemini",
  "Claude",
  "GPT",
  "Mistral",
  "Groq",
  "Cerebras",
  "OpenRouter",
  "FreeLLMAPI",
  "LocalAI",
  "Ollama",
  "WebLLM",
];
const POLICIES = [
  "Best Quality",
  "Lowest Cost",
  "Fastest",
  "Free First",
  "Local First",
  "Privacy First",
  "Balanced",
];
export function LlmMeshPage() {
  const [policy, setPolicy] = useState("Free First");
  const chain =
    policy === "Free First"
      ? "WebLLM → FreeLLMAPI → P2P Compute → Paid API"
      : `${policy} 정책에 따라 라우팅됩니다.`;
  return (
    <Page title="LLM Mesh" subtitle={`라우팅 정책: ${policy}`}>
      <div className="provider-cloud">
        {PROVIDERS.map((p) => (
          <span className="provider-chip" key={p}>
            {p}
          </span>
        ))}
      </div>
      <div className="policy-row">
        {POLICIES.map((p) => (
          <button
            key={p}
            className={p === policy ? "policy-chip active" : "policy-chip"}
            onClick={() => setPolicy(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <p className="routing-chain">▶ {chain}</p>
    </Page>
  );
}

// ---- Token Bank (live from /api/rewards + table) ----
export function TokenBankPage() {
  const [table, setTable] = useState<{ reason: string; credits: number }[]>([]);
  const [balance, setBalance] = useState<{
    balance: number;
    entries: { reason: string; credits: number; at: string }[];
  } | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/rewards/table`)
      .then((r) => r.json())
      .then(setTable)
      .catch(() => {});
    fetch(`${API_BASE}/api/rewards/anonymous`)
      .then((r) => r.json())
      .then(setBalance)
      .catch(() => {});
  }, []);
  return (
    <Page title="Token Bank" subtitle="Contribution Economy">
      <StatGrid
        stats={[
          ["Balance", balance?.balance ?? 0],
          ["Entries", balance?.entries.length ?? 0],
        ]}
      />
      <div className="reward-grid">
        {table.map((row) => (
          <div className="reward-chip" key={row.reason}>
            <span>{row.reason}</span>
            <strong>+{row.credits}</strong>
          </div>
        ))}
      </div>
      {balance && balance.entries.length > 0 && (
        <ul className="reward-log">
          {balance.entries.map((e, i) => (
            <li key={i}>
              <span>{e.reason}</span>
              <strong>+{e.credits}</strong>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

// ---- Verification Center (live from /api/verify) ----
export function VerificationPage() {
  const [items, setItems] = useState<
    {
      id: string;
      claim: string;
      sources: number;
      votes: { correct: number; wrong: number; unsure: number };
    }[]
  >([]);
  useEffect(() => {
    fetch(`${API_BASE}/api/verify`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => {});
  }, []);
  return (
    <Page
      title="Verification Center"
      subtitle={`대기 중: ${items.length}건 · 모드: AI vs AI · AI vs Web · AI vs Human · Human vs Human`}
    >
      <div className="verify-queue">
        {items.map((item) => {
          const total =
            item.votes.correct + item.votes.wrong + item.votes.unsure;
          const confidence = total
            ? Math.round((item.votes.correct / total) * 100)
            : 0;
          return (
            <article className="verify-queue-item" key={item.id}>
              <span className="claim-id">Claim #{item.id}</span>
              <p>{item.claim}</p>
              <div className="verify-queue-meta">
                <span>출처 {item.sources}</span>
                <span>참여 {total}</span>
                <span className={confidence >= 70 ? "conf high" : "conf low"}>
                  신뢰도 {confidence}%
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </Page>
  );
}

// ---- P2P Network ----
export function P2pNetworkPage() {
  return (
    <Page
      title="P2P Network"
      subtitle="Old P2P: Share Files → AgentMesh: Share AI Capabilities"
    >
      <StatGrid
        stats={[
          ["Peers", 1284],
          ["Connected", 842],
          ["Searching", 127],
          ["Data", "12.8 TB"],
          ["Compute", "4.2 PFLOPS"],
        ]}
      />
      <p className="dash-note">
        탭: [Peers] [Files] [Models] [Knowledge] [Agents] [Compute] — 구현 진행
        중
      </p>
    </Page>
  );
}

// ---- Compute Mesh ----
export function ComputeMeshPage() {
  return (
    <Page title="Compute Mesh" subtitle="Share Compute → +300 Credits/day">
      <StatGrid
        stats={[
          ["CPU", 8421],
          ["GPU", 1823],
          ["WebGPU", 4921],
          ["Total", "128.4 TFLOPS"],
        ]}
      />
    </Page>
  );
}

// ---- Marketplace ----
const MARKET_TABS = ["Agents", "Human Experts", "MCP", "Knowledge", "Compute"];
const MARKET_ITEMS: Record<string, { name: string; desc: string; rating: number }[]> = {
  Agents: [
    { name: "Gemini Research Agent", desc: "Research · Web Search · Summarization", rating: 4.9 },
    { name: "Claude Analysis Agent", desc: "Analysis · Coding · Review", rating: 4.8 },
    { name: "Web Search Agent", desc: "InfoMesh 탈중앙 검색", rating: 4.7 },
  ],
  "Human Experts": [
    { name: "김민준", desc: "베트남 법인·세무", rating: 4.9 },
    { name: "신나라", desc: "USDT P2P", rating: 4.8 },
    { name: "박태윤", desc: "AI 에이전트 개발", rating: 4.9 },
  ],
  MCP: [
    { name: "Web Search", desc: "통합 웹 검색", rating: 4.8 },
    { name: "GitHub", desc: "리포지토리·이슈·PR", rating: 4.9 },
    { name: "Postgres", desc: "SQL 데이터베이스", rating: 4.7 },
  ],
  Knowledge: [
    { name: "베트남 법인 설립 절차", desc: "검증된 지식 레코드", rating: 4.9 },
    { name: "다낭 TRC 갱신 후기", desc: "경험 기반 지식", rating: 4.6 },
  ],
  Compute: [
    { name: "GPU Pool (mycellm)", desc: "P2P GPU · QUIC", rating: 4.8 },
    { name: "WebGPU Nodes", desc: "브라우저 로컬 추론", rating: 4.5 },
  ],
};
export function MarketplacePage() {
  const [tab, setTab] = useState(MARKET_TABS[0] ?? "Agents");
  return (
    <Page title="Marketplace" subtitle="AI Capability App Store">
      <div className="policy-row">
        {MARKET_TABS.map((t) => (
          <button
            key={t}
            className={t === tab ? "policy-chip active" : "policy-chip"}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="spec-grid">
        {(MARKET_ITEMS[tab] ?? []).map((item) => (
          <article className="spec-card" key={item.name}>
            <div className="spec-card-head">
              <span className="spec-kind mcp">{tab}</span>
              <span className="spec-rating">★ {item.rating}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.desc}</p>
            <div className="mesh-actions">
              <button className="btn-primary">설치 / 연결</button>
              <button className="btn-secondary">테스트</button>
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
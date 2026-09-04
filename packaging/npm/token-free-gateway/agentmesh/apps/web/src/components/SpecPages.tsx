import React, { useEffect, useMemo, useState } from "react";

// Part 5-10 screens (spec: CLAUDE.md Part 5 / Part 6 / Part 7):
// Knowledge, Knowledge Graph, Search, MCP/Skills, Models, Agents,
// Human Agents, Contributions, Reputation, Projects, Tasks, Workflows,
// Settings. Data comes from the feed API where available.

const API = import.meta.env.VITE_API_BASE ?? "";

function load<T>(path: string): Promise<T | null> {
  return fetch(`${API}${path}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
}

function SpecPage({
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

function Progress({ value }: { value: number }) {
  return (
    <div className="spec-progress">
      <i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// =====================================================================
// Priority #5: Knowledge
// =====================================================================
interface KnowledgeItem {
  id: string;
  title: string;
  kind: string;
  summary: string;
  confidence: number;
  sources: number;
  contributors: number;
  tags: string[];
  verified: boolean;
  updatedAt: string;
}

export function KnowledgePage() {
  const [kinds, setKinds] = useState<{ id: string; label: string }[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [active, setActive] = useState("all");

  useEffect(() => {
    load<{ id: string; label: string }[]>("/api/knowledge/kinds").then(
      (k) => k && setKinds(k),
    );
  }, []);

  useEffect(() => {
    load<KnowledgeItem[]>(
      `/api/knowledge${active !== "all" ? `?kind=${active}` : ""}`,
    ).then((d) => d && setItems(d));
  }, [active]);

  return (
    <SpecPage
      title="Knowledge"
      subtitle={`18.4M records · Provenance + CRDT · ${items.length}개 표시 중`}
    >
      <div className="policy-row">
        {kinds.map((k) => (
          <button
            key={k.id}
            className={k.id === active ? "policy-chip active" : "policy-chip"}
            onClick={() => setActive(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="spec-grid">
        {items.map((item) => (
          <article className="spec-card" key={item.id}>
            <div className="spec-card-head">
              <span className={`spec-kind ${item.kind}`}>{item.kind}</span>
              {item.verified && (
                <span className="spec-verified">✓ Verified</span>
              )}
            </div>
            <h3>{item.title}</h3>
            <p>{item.summary}</p>
            <div className="spec-tags">
              {item.tags.map((t) => (
                <span className="spec-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <div className="spec-card-meta">
              <span>신뢰도 {Math.round(item.confidence * 100)}%</span>
              <span>출처 {item.sources}</span>
              <span>기여 {item.contributors}</span>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
// =====================================================================
// Priority #5: Knowledge Graph
// =====================================================================
interface GraphNode {
  id: string;
  label: string;
  type: string;
}
interface GraphEdge {
  source: string;
  target: string;
  relation: string;
}

const NODE_EMOJI: Record<string, string> = {
  AI: "🤖",
  Agent: "🕸️",
  Human: "👤",
  Expert: "🎓",
  Knowledge: "📚",
  Source: "📄",
  Model: "📦",
  MCP: "🔌",
};

export function KnowledgeGraphPage() {
  const [graph, setGraph] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  }>({ nodes: [], edges: [] });

  useEffect(() => {
    load<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
      "/api/knowledge-graph",
    ).then((g) => g && setGraph(g));
  }, []);

  const byId = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n])),
    [graph.nodes],
  );

  return (
    <SpecPage
      title="Knowledge Graph"
      subtitle="노드(AI·Agent·Human·Expert·Knowledge·Source·Model·MCP)와 관계 엣지"
    >
      <div className="kg-legend">
        {Object.entries(NODE_EMOJI).map(([type, emoji]) => (
          <span className="kg-legend-item" key={type}>
            {emoji} {type}
          </span>
        ))}
      </div>
      <div className="kg-canvas">
        {graph.nodes.map((node) => {
          const neighbors = graph.edges
            .filter((e) => e.source === node.id || e.target === node.id)
            .map((e) => (e.source === node.id ? e.target : e.source))
            .filter((id) => byId.has(id))
            .map((id) => byId.get(id)!.label);
          return (
            <div className={`kg-node ${node.type}`} key={node.id}>
              <span className="kg-node-icon">{NODE_EMOJI[node.type] ?? "⚫"}</span>
              <strong>{node.label}</strong>
              <span className="kg-node-type">{node.type}</span>
              {neighbors.length > 0 && (
                <div className="kg-connections">
                  {neighbors.map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="kg-edges">
        {graph.edges.map((e) => (
          <div className="kg-edge" key={`${e.source}-${e.target}`}>
            <span>{byId.get(e.source)?.label ?? e.source}</span>
            <em>{e.relation}</em>
            <span>{byId.get(e.target)?.label ?? e.target}</span>
          </div>
        ))}
      </div>
    </SpecPage>
  );
}

// =====================================================================
// Priority #10: Search (InfoMesh-style)
// =====================================================================
interface SearchResult {
  id: string;
  title: string;
  kind: string;
  snippet: string;
  confidence: number;
  verified: boolean;
}

const KIND_EMOJI: Record<string, string> = {
  knowledge: "📚",
  agent: "🕸️",
  human: "👤",
  mcp: "🔌",
  source: "📄",
};

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    load<SearchResult[]>(
      query.trim() ? `/api/search?q=${encodeURIComponent(query)}` : "/api/search",
    ).then((d) => d && setResults(d));
  }, [query]);

  return (
    <SpecPage title="Search" subtitle="InfoMesh — 탈중앙화 MCP 네이티브 검색">
      <div className="global-search spec-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="지식·에이전트·인간 전문가·MCP·출처 검색…"
          className="search-input"
        />
        <button className="search-button">Search</button>
      </div>
      <div className="spec-list">
        {results.map((r) => (
          <article className="spec-row" key={r.id}>
            <span className="spec-row-icon">{KIND_EMOJI[r.kind] ?? "🔎"}</span>
            <div>
              <h3>{r.title}</h3>
              <p>{r.snippet}</p>
            </div>
            <div className="spec-row-meta">
              <span>{r.kind}</span>
              <span>신뢰도 {Math.round(r.confidence * 100)}%</span>
              {r.verified && <span className="spec-verified">✓ 검증됨</span>}
            </div>
          </article>
        ))}
        {results.length === 0 && (
          <p className="dash-note">검색 결과가 없습니다.</p>
        )}
      </div>
    </SpecPage>
  );
}
// =====================================================================
// Priority #7: MCP / Skills
// =====================================================================
interface McpServer {
  id: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  users: number;
  tools: number;
  latencyMs: number;
  reliability: number;
  tags: string[];
}

export function McpSkillsPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());

  useEffect(() => {
    load<McpServer[]>("/api/mcp").then((d) => d && setServers(d));
  }, []);

  async function install(id: string) {
    setInstalled((prev) => new Set(prev).add(id));
  }

  return (
    <SpecPage
      title="MCP / Skills"
      subtitle="4,821 servers · 12,400 tools · 42 categories — MCP는 AI의 능력 확장 표준"
    >
      <div className="spec-grid">
        {servers.map((s) => (
          <article className="spec-card" key={s.id}>
            <div className="spec-card-head">
              <span className="spec-kind mcp">{s.category}</span>
              <span className="spec-rating">★ {s.rating}</span>
            </div>
            <h3>{s.name}</h3>
            <p>{s.description}</p>
            <div className="spec-card-meta">
              <span>👥 {s.users.toLocaleString("ko-KR")}</span>
              <span>🛠 {s.tools} tools</span>
              <span>⏱ {s.latencyMs}ms</span>
              <span>📈 신뢰 {s.reliability}%</span>
            </div>
            <div className="mesh-actions">
              <button
                className="btn-secondary"
                disabled={installed.has(s.id)}
                onClick={() => install(s.id)}
              >
                {installed.has(s.id) ? "Installed ✓" : "Install"}
              </button>
              <button className="btn-primary">Connect</button>
              <button className="btn-secondary">Test</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}

// =====================================================================
// Priority #6: Models catalog
// =====================================================================
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context: string;
  inputCost: number;
  outputCost: number;
  free: boolean;
  local: boolean;
}

export function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);

  useEffect(() => {
    load<ModelInfo[]>("/api/models").then((d) => d && setModels(d));
  }, []);

  return (
    <SpecPage
      title="Models"
      subtitle="1,247 models · 328 providers · 284 free — LLM Mesh 카탈로그"
    >
      <div className="spec-table">
        <div className="spec-table-head">
          <span>Model</span>
          <span>Provider</span>
          <span>Context</span>
          <span>Input</span>
          <span>Output</span>
          <span>Free</span>
          <span>Local</span>
        </div>
        {models.map((m) => (
          <div className="spec-table-row" key={m.id}>
            <strong>{m.name}</strong>
            <span>{m.provider}</span>
            <span>{m.context}</span>
            <span>${m.inputCost}/1M</span>
            <span>${m.outputCost}/1M</span>
            <span>{m.free ? "✅" : "—"}</span>
            <span>{m.local ? "🖥️" : "☁️"}</span>
          </div>
        ))}
      </div>
    </SpecPage>
  );
}

// =====================================================================
// Priority #6: Agents (mesh registry)
// =====================================================================
interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "busy";
  capabilities: string[];
  latencyMs: number;
  reputation: number;
  successRate: number;
  provider: string;
  model: string;
}

const STATUS_LABEL: Record<AgentInfo["status"], string> = {
  online: "● Online",
  offline: "○ Offline",
  busy: "◐ Busy",
};

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    load<AgentInfo[]>("/api/agents").then((d) => d && setAgents(d));
  }, []);

  const types = ["All", ...Array.from(new Set(agents.map((a) => a.type)))];
  const shown =
    filter === "All" ? agents : agents.filter((a) => a.type === filter);

  return (
    <SpecPage
      title="Agents"
      subtitle="1,284 Agents Online — capabilities · latency · reputation · success rate"
    >
      <div className="policy-row">
        {types.map((t) => (
          <button
            key={t}
            className={t === filter ? "policy-chip active" : "policy-chip"}
            onClick={() => setFilter(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="agent-card-grid">
        {shown.map((a) => (
          <article className="mesh-card" key={a.id}>
            <div className="mesh-card-head">
              <strong>{a.name}</strong>
              <span className="mesh-status">{STATUS_LABEL[a.status]}</span>
            </div>
            <p className="mesh-caps">{a.capabilities.join(" · ")}</p>
            <div className="mesh-meta">
              <span>지연: {(a.latencyMs / 1000).toFixed(1)}s</span>
              <span>평판: {a.reputation}</span>
              <span>성공률: {a.successRate}%</span>
            </div>
            <div className="mesh-meta">
              <span>모델: {a.model}</span>
              <span>제공: {a.provider}</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-secondary">Connect</button>
              <button className="btn-primary">Use</button>
              <button className="btn-secondary">View Profile</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
// =====================================================================
// Priority #6: Human Agents
// =====================================================================
interface HumanAgent {
  id: string;
  name: string;
  specialty: string;
  category: string;
  location: string;
  rating: number;
  answerCount: number;
  verificationRate: number;
  available: boolean;
}

export function HumanAgentsPage() {
  const [agents, setAgents] = useState<HumanAgent[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [active, setActive] = useState("All");

  useEffect(() => {
    load<string[]>("/api/human-agents/categories").then((c) => c && setCategories(c));
  }, []);

  useEffect(() => {
    load<HumanAgent[]>(
      `/api/human-agents${active !== "All" ? `?category=${active}` : ""}`,
    ).then((d) => d && setAgents(d));
  }, [active]);

  return (
    <SpecPage
      title="Human Agents"
      subtitle="7,542 Human Agents · AI 신뢰도가 부족할 때 실제 사람의 경험에 물어보세요"
    >
      <div className="policy-row">
        {categories.map((c) => (
          <button
            key={c}
            className={c === active ? "policy-chip active" : "policy-chip"}
            onClick={() => setActive(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="spec-grid">
        {agents.map((a) => (
          <article className="spec-card" key={a.id}>
            <div className="spec-card-head">
              <span className={`spec-kind human ${a.available ? "on" : "off"}`}>
                {a.available ? "● Available" : "○ Busy"}
              </span>
              <span className="spec-rating">★ {a.rating}</span>
            </div>
            <h3>{a.name}</h3>
            <p>{a.specialty}</p>
            <div className="spec-card-meta">
              <span>📍 {a.location}</span>
              <span>분야 {a.category}</span>
              <span>답변 {a.answerCount}건</span>
              <span>검증률 {a.verificationRate}%</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-primary">질문하기</button>
              <button className="btn-secondary">프로필 보기</button>
            </div>
          </article>
        ))}
      </div>
      <p className="dash-note">
        🤖 "AI가 충분한 신뢰도에 도달하지 못했습니다. 인간 네트워크에 물어보시겠습니까?"
      </p>
    </SpecPage>
  );
}

// =====================================================================
// Priority #8: Contributions
// =====================================================================
interface ContributionsData {
  total: number;
  items: { type: string; count: number; credits: number }[];
}
export function ContributionsPage() {
  const [data, setData] = useState<{
    total: number;
    items: { type: string; count: number; credits: number }[];
  } | null>(null);

  useEffect(() => {
    load<ContributionsData>("/api/contributions").then(setData);
  }, []);

  return (
    <SpecPage title="Contributions" subtitle="기여 원장 — 모든 기여가 크레딧으로 기록됩니다">
      <StatGrid
        stats={[
          ["Total", data?.total ?? 0],
          ["Entity Types", data?.items.length ?? 0],
        ]}
      />
      <div className="spec-list">
        {data?.items.map((item) => (
          <div className="spec-row" key={item.type}>
            <div className="spec-row-main">
              <h3>{item.type}</h3>
              <span>{item.count.toLocaleString("ko-KR")}회 기여</span>
            </div>
            <strong className="spec-reward">
              +{item.credits} Credit / 건
            </strong>
          </div>
        ))}
      </div>
    </SpecPage>
  );
}

// =====================================================================
// Priority #8: Reputation
// =====================================================================
interface ReputationData {
  overall: number;
  scores: { area: string; score: number }[];
  history: { event: string; delta: string; at: string }[];
}
export function ReputationPage() {
  const [data, setData] = useState<{
    overall: number;
    scores: { area: string; score: number }[];
    history: { event: string; delta: string; at: string }[];
  } | null>(null);

  useEffect(() => {
    load<ReputationData>("/api/reputation").then(setData);
  }, []);

  return (
    <SpecPage
      title="Reputation"
      subtitle="에이전트·LLM·MCP·컴퓨팅 노드·지식 모두 평판을 가집니다"
    >
      <StatGrid stats={[["Overall", data?.overall ?? 0]]} />
      <div className="spec-list">
        {data?.scores.map((s) => (
          <div className="spec-row" key={s.area}>
            <div className="spec-row-main">
              <h3>{s.area}</h3>
            </div>
            <div className="spec-score">
              <Progress value={s.score} />
              <strong>{s.score}</strong>
            </div>
          </div>
        ))}
      </div>
      {data && data.history.length > 0 && (
        <div className="dash-block">
          <h3>최근 평판 변화</h3>
          {data.history.map((h, i) => (
            <div className="kg-edge" key={i}>
              <span>{h.event}</span>
              <em>{h.delta}</em>
            </div>
          ))}
        </div>
      )}
    </SpecPage>
  );
}
// =====================================================================
// Priority #9: Projects
// =====================================================================
interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  agents: number;
  knowledge: number;
  tasks: number;
  files: number;
  workflows: number;
  conversations: number;
  contributions: number;
  updatedAt: string;
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    load<Project[]>("/api/projects").then((d) => d && setProjects(d));
  }, []);

  return (
    <SpecPage
      title="Projects"
      subtitle="채팅방이 아니라 프로젝트 단위 워크스페이스"
    >
      <div className="spec-grid">
        {projects.map((p) => (
          <article className="spec-card" key={p.id}>
            <div className="spec-card-head">
              <span className={`spec-kind ${p.status}`}>{p.status}</span>
              <span className="spec-rating">{p.conversations}💬</span>
            </div>
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <div className="spec-tags">
              <span className="spec-tag">🤖 에이전트 {p.agents}</span>
              <span className="spec-tag">📚 지식 {p.knowledge}</span>
              <span className="spec-tag">✓ 태스크 {p.tasks}</span>
              <span className="spec-tag">📁 파일 {p.files}</span>
              <span className="spec-tag">🔄 워크플로 {p.workflows}</span>
            </div>
            <div className="spec-card-meta">
              <span>기여 {p.contributions.toLocaleString("ko-KR")} credits</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-primary">열기</button>
              <button className="btn-secondary">설정</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}

// =====================================================================
// Priority #9: Tasks
// =====================================================================
interface TaskItem {
  id: string;
  title: string;
  type: string;
  status: "running" | "queued" | "done";
  assignee: string;
  reward: number;
  progress: number;
  projectId: string;
}

const TASK_EMOJI: Record<string, string> = {
  Research: "🔍",
  Coding: "💻",
  Verification: "✅",
  Translation: "🌐",
  "Data Analysis": "📊",
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    load<TaskItem[]>("/api/tasks").then((d) => d && setTasks(d));
  }, []);

  return (
    <SpecPage
      title="Tasks"
      subtitle="활성 태스크: Researching · Coding · Verification · Translation · Data Analysis"
    >
      <div className="spec-list">
        {tasks.map((t) => (
          <article className="spec-row" key={t.id}>
            <span className="spec-row-icon">{TASK_EMOJI[t.type] ?? "📌"}</span>
            <div className="spec-row-main">
              <h3>{t.title}</h3>
              <p>
                {t.assignee} · {t.type}
              </p>
            </div>
            <div className="spec-task-status">
              <Progress value={t.progress} />
              <span className={`task-status ${t.status}`}>
                {t.status} {t.progress}%
              </span>
            </div>
            <strong className="spec-reward">+{t.reward}</strong>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
// =====================================================================
// Priority #9: Workflows
// =====================================================================
interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: { name: string; icon: string }[];
  status: "active" | "draft";
  runs: number;
  avgDuration: string;
  lastRun: string;
}

export function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    load<Workflow[]>("/api/workflows").then((d) => d && setWorkflows(d));
  }, []);

  return (
    <SpecPage
      title="Workflows"
      subtitle="시각적 파이프라인 — Research → Web Search → LLM Cast → Human Verification → Knowledge Engine → Report"
    >
      <div className="spec-list">
        {workflows.map((w) => (
          <article className="spec-card workflow" key={w.id}>
            <div className="spec-card-head">
              <span className={`spec-kind ${w.status}`}>{w.status}</span>
              <span className="spec-rating">▶ {w.runs} runs</span>
            </div>
            <h3>{w.name}</h3>
            <p>{w.description}</p>
            <div className="wf-pipeline">
              {w.steps.map((s, i) => (
                <React.Fragment key={s.name}>
                  {i > 0 && <span className="wf-arrow">→</span>}
                  <span className="wf-step">
                    <span className="wf-icon">{s.icon}</span>
                    {s.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <div className="spec-card-meta">
              <span>평균 {w.avgDuration}</span>
            </div>
            <div className="mesh-actions">
              <button className="btn-primary">실행</button>
              <button className="btn-secondary">편집</button>
            </div>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}

// =====================================================================
// Priority #10: Settings
// =====================================================================
const SETTINGS_SECTIONS = [
  "Account",
  "Privacy & Security",
  "AI Preferences",
  "Routing",
  "Models",
  "Network",
  "Token Bank & Reputation",
  "Agents & MCP",
  "API & Developer",
];

const ACTIVE_ROWS: Record<string, string[]> = {
  Account: ["이메일 알림", "주간 리포트", "2단계 인증 사용", "공개 프로필 표시"],
  "Privacy & Security": ["보안 알림", "외부 도구 연동 허용", "크레덴셜 볼트 자동 잠금"],
  "AI Preferences": ["자동 라우팅 사용", "AI 캐스트 자동 승인", "개인 모델 우선"],
  Routing: ["Free First 정책", "최저 비용 라우팅", "지역 노드 우선"],
  Models: ["웹 추론(WebLLM) 허용", "로컬 모델 자동 다운로드", "실험 모델 표시"],
  Network: ["P2P 연결", "WebRTC 릴레이", "자동 디스커버리", "GossipSub 구독"],
  "Token Bank & Reputation": ["크레딧 사용 내역 자동 정산", "평판 변동 알림"],
  "Agents & MCP": ["새 MCP 서버 자동 제안", "에이전트 자동 연결", "비신뢰 MCP 차단"],
  "API & Developer": ["API 키 자동 발급", "개발자 로그", "웹훅 전송"],
};

export function SettingsPage() {
  const [active, setActive] = useState<string>(
    SETTINGS_SECTIONS[0] ?? "Account",
  );
  return (
    <SpecPage title="Settings" subtitle="계정 · 개인정보 · AI · 네트워크 · 경제 · 개발자 설정">
      <div className="settings-layout">
        <nav className="settings-nav">
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s}
              className={
                s === active ? "settings-nav-item active" : "settings-nav-item"
              }
              onClick={() => setActive(s)}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {(ACTIVE_ROWS[active] ?? []).map((row) => (
            <div className="settings-row" key={row}>
              <span>{row}</span>
              <label className="switch">
                <input type="checkbox" defaultChecked={row.startsWith("사용")} />
                <i />
              </label>
            </div>
          ))}
        </div>
      </div>
    </SpecPage>
  );
}
import { InteractiveKnowledgeGraph } from "./visuals/InteractiveKnowledgeGraph.js";
import React, { useState } from "react";
import { TaskDispatchBoard } from "./harvest/A/TaskDispatchBoard.js";
import { WorkflowDAG } from "./harvest/A/WorkflowDAG.js";
import { KnowledgePool } from "./harvest/B/KnowledgePool.js";
import { FederatedSearch } from "./harvest/B/FederatedSearch.js";
import { KnowledgeGraphCanvas } from "./harvest/B2/KnowledgeGraphCanvas.js";
import { McpSkills } from "./harvest/B2/McpSkills.js";
import { ModelHub } from "./harvest/B2/ModelHub.js";
import { ContributionHistory } from "./harvest/C/ContributionHistory.js";
import { ReputationMatrix } from "./harvest/C/ReputationMatrix.js";
import { SecuritySettings } from "./harvest/C/SecuritySettings.js";

function PageShell({ title, subtitle, badge, children }: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dash-page">
      <header className="dash-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h2>{title}</h2>
          {badge && <span className="protocol-badge proto-webrtc">{badge}</span>}
        </div>
        {subtitle && <p className="dash-page-subtitle">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

// 1. /agents (ISEK + Society Protocol: Agent Directory)
export function AgentsPage() {
  const agents = [
    { id: "agent-gemini", name: "Gemini 1.5 Pro Research", did: "did:muhan:agent:gemini", role: "LLM Agent", rating: 99.2, tasks: 1420, tags: ["Research", "Search", "Fast"] },
    { id: "agent-claude", name: "Claude 3.5 Sonnet Engineer", did: "did:muhan:agent:claude", role: "Coding Agent", rating: 99.8, tasks: 2890, tags: ["TypeScript", "Rust", "Review"] },
    { id: "agent-deepseek", name: "DeepSeek R1 Reasoner", did: "did:muhan:agent:r1", role: "Reasoning Node", rating: 97.4, tasks: 810, tags: ["Logic", "Math", "Chain"] },
    { id: "agent-local", name: "Llama-3.3 Local Node", did: "did:muhan:agent:local-01", role: "Edge Agent", rating: 94.6, tasks: 420, tags: ["Privacy", "Offline", "No-Token"] },
  ];
  return (
    <PageShell title="Agents Directory" subtitle="ISEK Protocol A2A DID 등록 에이전트 풀" badge="A2A Federated">
      <div className="peer-grid">
        {agents.map(a => (
          <article className="peer-card" key={a.id}>
            <div className="peer-card-head">
              <span className="webrtc-dot connected" />
              <strong className="peer-name">{a.name}</strong>
              <span className="protocol-badge proto-libp2p">{a.role}</span>
            </div>
            <div className="peer-card-meta">
              <code>{a.did}</code>
              <span className="peer-latency">★ {a.rating}%</span>
            </div>
            <div className="peer-caps">
              {a.tags.map(t => <span className="cap-chip sm" key={t}>{t}</span>)}
            </div>
            <div className="peer-card-foot">
              <span>누적 완료 {a.tasks}건</span>
              <button className="btn-secondary sm">상세 DID</button>
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

// 2. /human-agents (Human-in-the-Loop Experts)
export function HumanAgentsPage() {
  const humans = [
    { id: "h-01", name: "Dr. Yeon (AI System)", specialty: "분산 라우팅 & 합의", rep: 994, reviews: 312, status: "Available" },
    { id: "h-02", name: "Sarah K. (Security)", specialty: "Zero-Trust & Vault 검증", rep: 981, reviews: 184, status: "Busy" },
    { id: "h-03", name: "Alex Chen (Data)", specialty: "지식 그래프 온톨로지", rep: 975, reviews: 240, status: "Available" },
  ];
  return (
    <PageShell title="Human Expert Agents" subtitle="AI vs Human 검증 및 도메인 전문가 풀" badge="PoH Verified">
      <div className="peer-grid">
        {humans.map(h => (
          <article className="peer-card" key={h.id}>
            <div className="peer-card-head">
              <span className={`webrtc-dot ${h.status === "Available" ? "connected" : "connecting"}`} />
              <strong className="peer-name">{h.name}</strong>
              <span className="protocol-badge proto-memory">{h.status}</span>
            </div>
            <p style={{ fontSize: 13, color: "#a8aaa0", margin: "6px 0" }}>{h.specialty}</p>
            <div className="peer-card-foot">
              <span>평판 스코어: <strong style={{ color: "#e6ff87" }}>{h.rep}</strong></span>
              <span>검증 {h.reviews}회</span>
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

// 3. /knowledge & /knowledge-graph (Society Protocol + NeuroMesh)
export function KnowledgePage() {
  return (
    <PageShell title="Knowledge Lake" subtitle="Society Protocol 탈중앙화 지식 풀 & CRDT 버전 관리" badge="Society Protocol">
      <KnowledgePool />
    </PageShell>
  );
}

export function KnowledgeGraphPage() {
  return (
    <PageShell title="Knowledge Graph" subtitle="NeuroMesh 분산 지식 노드 및 관계 토폴로지" badge="NeuroMesh">
      <InteractiveKnowledgeGraph />
      <div style={{ marginTop: 16 }}>
        <KnowledgeGraphCanvas />
      </div>
    </PageShell>
  );
}

// 4. /search (InfoMesh Federated Search)
export function SearchPage() {
  return (
    <PageShell title="Federated Mesh Search" subtitle="InfoMesh P2P 분산 색인 & Web 검색" badge="InfoMesh">
      <FederatedSearch />
    </PageShell>
  );
}

// 5. /mcp-skills & /models (InfoMesh Tool Registry + mycellm Model Hub)
export function McpSkillsPage() {
  return (
    <PageShell title="MCP Skills & Tools" subtitle="Model Context Protocol 분산 도구 등록소" badge="MCP v1.0">
      <McpSkills />
    </PageShell>
  );
}

export function ModelsPage() {
  return (
    <PageShell title="Model Registry & Hub" subtitle="mycellm 로컬 및 P2P 캐시 LLM 웨이트" badge="mycellm">
      <ModelHub />
    </PageShell>
  );
}

// 6. /contributions & /reputation (p2ptokens + PinkyBrain)
export function ContributionsPage() {
  return (
    <PageShell title="Contribution Accounting" subtitle="p2ptokens 분산 인센티브 및 기여 내역" badge="p2ptokens">
      <ContributionHistory />
    </PageShell>
  );
}

export function ReputationPage() {
  return (
    <PageShell title="Web of Trust & Reputation" subtitle="PinkyBrain 암호학적 신뢰 매트릭스" badge="PinkyBrain">
      <ReputationMatrix />
    </PageShell>
  );
}

// 7. /projects, /tasks, /workflows (AgentFM Workspaces)
export function ProjectsPage() {
  const projects = [
    { id: "p-1", title: "MuhanAI Gateway Core", desc: "Token-Free Web Session Gateway v0.5.2", progress: 92 },
    { id: "p-2", title: "Decentralized DID Mesh", desc: "ISEK A2A 디스커버리 계층 연동", progress: 68 },
    { id: "p-3", title: "Local P2P Search Engine", desc: "InfoMesh 기반 분산 지식 색인", progress: 45 },
  ];
  return (
    <PageShell title="Workspace Projects" subtitle="AgentFM 협업 에이전트 프로젝트 풀" badge="AgentFM">
      <div className="peer-grid">
        {projects.map(p => (
          <article className="peer-card" key={p.id}>
            <div className="peer-card-head">
              <strong className="peer-name">{p.title}</strong>
              <span className="protocol-badge proto-webrtc">{p.progress}%</span>
            </div>
            <p style={{ fontSize: 13, color: "#8f9188" }}>{p.desc}</p>
            <div style={{ height: 4, background: "#222", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${p.progress}%`, height: "100%", background: "#e6ff87" }} />
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

export function TasksPage() {
  return (
    <PageShell title="Task Dispatch Board" subtitle="AgentFM 에이전트 간 작업 실시간 디스패치 및 큐" badge="Dispatch Engine">
      <TaskDispatchBoard />
    </PageShell>
  );
}

export function WorkflowsPage() {
  return (
    <PageShell title="Autonomous Workflows (DAG)" subtitle="AgentFM 다중 에이전트 자율 파이프라인 시각화" badge="DAG Engine">
      <WorkflowDAG />
    </PageShell>
  );
}

// 8. /settings (tkngate Zero-Trust Gateway Settings)
export function SettingsPage() {
  return (
    <PageShell title="System & Gateway Settings" subtitle="tkngate 제로트러스트 보안 및 게이트웨이 파라미터" badge="tkngate">
      <SecuritySettings />
    </PageShell>
  );
}

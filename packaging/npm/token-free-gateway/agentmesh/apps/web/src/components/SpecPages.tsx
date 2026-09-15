import type React from "react";
import { useState } from "react";
import { BrowserProfilePanel } from "./BrowserProfilePanel.js";
import { TaskDispatchBoard } from "./harvest/A/TaskDispatchBoard.js";
import { WorkflowDAG } from "./harvest/A/WorkflowDAG.js";
import { FederatedSearch } from "./harvest/B/FederatedSearch.js";
import { KnowledgePool } from "./harvest/B/KnowledgePool.js";
import { KnowledgeGraphCanvas } from "./harvest/B2/KnowledgeGraphCanvas.js";
import { McpSkills } from "./harvest/B2/McpSkills.js";
import { ModelHub } from "./harvest/B2/ModelHub.js";
import { ContributionHistory } from "./harvest/C/ContributionHistory.js";
import { ReputationMatrix } from "./harvest/C/ReputationMatrix.js";
import { SecuritySettings } from "./harvest/C/SecuritySettings.js";
import { MuhanSettingsPanel } from "./MuhanSettingsPanel.js";
import { PageBox } from "./PageBox.js";
import { InteractiveKnowledgeGraph } from "./visuals/InteractiveKnowledgeGraph.js";

function PageShell({
	iconKey,
	title,
	subtitle,
	badge,
	children,
}: {
	iconKey?: string;
	title: string;
	subtitle?: string;
	badge?: string;
	children: React.ReactNode;
}) {
	return (
		<PageBox iconKey={iconKey} title={title} subtitle={subtitle} badge={badge}>
			{children}
		</PageBox>
	);
}

// 1. /agents (ISEK + Society Protocol: Agent Directory)
export function AgentsPage() {
	const agents: Array<{
		id: string;
		name: string;
		did: string;
		role: string;
		rating: number;
		tasks: number;
		tags: string[];
	}> = [];
	return (
		<PageShell
			iconKey="bot"
			title="Agents Directory"
			subtitle="ISEK Protocol A2A DID 등록 에이전트 풀"
			badge="A2A Federated"
		>
			<div className="peer-grid">
				{agents.map((a) => (
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
							{a.tags.map((t) => (
								<span className="cap-chip sm" key={t}>
									{t}
								</span>
							))}
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
	const humans: Array<{
		id: string;
		name: string;
		specialty: string;
		rep: number;
		reviews: number;
		status: string;
	}> = [];
	return (
		<PageShell
			iconKey="users"
			title="Human Expert Agents"
			subtitle="AI vs Human 검증 및 도메인 전문가 풀"
			badge="PoH Verified"
		>
			<div className="peer-grid">
				{humans.map((h) => (
					<article className="peer-card" key={h.id}>
						<div className="peer-card-head">
							<span
								className={`webrtc-dot ${h.status === "Available" ? "connected" : "connecting"}`}
							/>
							<strong className="peer-name">{h.name}</strong>
							<span className="protocol-badge proto-memory">{h.status}</span>
						</div>
						<p style={{ fontSize: 13, color: "#a8aaa0", margin: "6px 0" }}>{h.specialty}</p>
						<div className="peer-card-foot">
							<span>
								평판 스코어: <strong style={{ color: "#e6ff87" }}>{h.rep}</strong>
							</span>
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
		<PageShell
			iconKey="database"
			title="Knowledge Lake"
			subtitle="Society Protocol 탈중앙화 지식 풀 & CRDT 버전 관리"
			badge="Society Protocol"
		>
			<KnowledgePool />
		</PageShell>
	);
}

export function KnowledgeGraphPage() {
	return (
		<PageShell
			iconKey="database"
			title="Knowledge Graph"
			subtitle="NeuroMesh 분산 지식 노드 및 관계 토폴로지"
			badge="NeuroMesh"
		>
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
		<PageShell
			iconKey="search"
			title="Federated Mesh Search"
			subtitle="InfoMesh P2P 분산 색인 & Web 검색"
			badge="InfoMesh"
		>
			<FederatedSearch />
		</PageShell>
	);
}

// 5. /mcp-skills & /models (InfoMesh Tool Registry + mycellm Model Hub)
export function McpSkillsPage() {
	return (
		<PageShell
			iconKey="layers"
			title="MCP Skills & Tools"
			subtitle="Model Context Protocol 분산 도구 등록소"
			badge="MCP v1.0"
		>
			<McpSkills />
		</PageShell>
	);
}

export function ModelsPage() {
	return (
		<PageShell
			iconKey="sparkles"
			title="Model Registry & Hub"
			subtitle="mycellm 로컬 및 P2P 캐시 LLM 웨이트"
			badge="mycellm"
		>
			<ModelHub />
		</PageShell>
	);
}

// 6. /contributions & /reputation (p2ptokens + PinkyBrain)
export function ContributionsPage() {
	return (
		<PageShell
			iconKey="activity"
			title="Contribution Accounting"
			subtitle="p2ptokens 분산 인센티브 및 기여 내역"
			badge="p2ptokens"
		>
			<ContributionHistory />
		</PageShell>
	);
}

export function ReputationPage() {
	return (
		<PageShell
			iconKey="star"
			title="Web of Trust & Reputation"
			subtitle="PinkyBrain 암호학적 신뢰 매트릭스"
			badge="PinkyBrain"
		>
			<ReputationMatrix />
		</PageShell>
	);
}

// 7. /projects, /tasks, /workflows (AgentFM Workspaces)
export function ProjectsPage() {
	const projects: Array<{
		id: string;
		title: string;
		desc: string;
		progress: number;
	}> = [];
	return (
		<PageShell
			iconKey="folder-git"
			title="Workspace Projects"
			subtitle="AgentFM 협업 에이전트 프로젝트 풀"
			badge="AgentFM"
		>
			<div className="peer-grid">
				{projects.map((p) => (
					<article className="peer-card" key={p.id}>
						<div className="peer-card-head">
							<strong className="peer-name">{p.title}</strong>
							<span className="protocol-badge proto-webrtc">{p.progress}%</span>
						</div>
						<p style={{ fontSize: 13, color: "#8f9188" }}>{p.desc}</p>
						<div
							style={{
								height: 4,
								background: "#222",
								borderRadius: 2,
								overflow: "hidden",
							}}
						>
							<div
								style={{
									width: `${p.progress}%`,
									height: "100%",
									background: "#e6ff87",
								}}
							/>
						</div>
					</article>
				))}
			</div>
		</PageShell>
	);
}

export function TasksPage() {
	return (
		<PageShell
			iconKey="list-todo"
			title="Task Dispatch Board"
			subtitle="AgentFM 에이전트 간 작업 실시간 디스패치 및 큐"
			badge="Dispatch Engine"
		>
			<TaskDispatchBoard />
		</PageShell>
	);
}

export function WorkflowsPage() {
	return (
		<PageShell
			iconKey="git-branch"
			title="Autonomous Workflows"
			subtitle="AgentFM 다중 에이전트 자율 파이프라인 시각화 (현재는 linear; DAG 분기는 후속)"
			badge="Pipeline"
		>
			<WorkflowDAG />
		</PageShell>
	);
}

// 8. /settings (tkngate Zero-Trust Gateway Settings)
export function SettingsPage() {
	type Tab = "security" | "machines" | "browser";
	const [tab, setTab] = useState<Tab>("security");
	return (
		<PageShell
			iconKey="settings"
			title="System & Gateway Settings"
			subtitle="tkngate 제로트러스트 보안 및 게이트웨이 파라미터"
			badge="tkngate"
		>
			<div className="hc-tabs">
				<button
					type="button"
					className={`hc-tab ${tab === "security" ? "active" : ""}`}
					onClick={() => setTab("security")}
					aria-pressed={tab === "security"}
				>
					Security & Keys<span className="hc-tab-count">3</span>
				</button>
				<button
					type="button"
					className={`hc-tab ${tab === "machines" ? "active" : ""}`}
					onClick={() => setTab("machines")}
					aria-pressed={tab === "machines"}
				>
					Machines<span className="hc-tab-count">2</span>
				</button>
				<button
					type="button"
					className={`hc-tab ${tab === "browser" ? "active" : ""}`}
					onClick={() => setTab("browser")}
					aria-pressed={tab === "browser"}
				>
					Browser Profiles
				</button>
			</div>

			<div className="hc-tab-panel">
				{tab === "security" && <SecuritySettings />}
				{tab === "machines" && <MuhanSettingsPanel />}
				{tab === "browser" && <BrowserProfilePanel />}
			</div>
		</PageShell>
	);
}

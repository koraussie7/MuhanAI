import type React from "react";
import { useEffect, useState } from "react";
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
import { postJson, load } from "../services/api.js";
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
type CollaborationProject = {
	id: string;
	title: string;
	desc: string;
	progress: number;
	status: "active" | "review";
	agents: string[];
	nextTask: string;
};

const INITIAL_COLLABORATION_PROJECTS: CollaborationProject[] = [
	{
	id: "gateway-hardening",
		title: "Token-Free Gateway hardening",
		desc: "OpenAI 호환 게이트웨이, provider fallback, 브라우저 세션 경계 테스트",
	progress: 68,
	status: "active",
		agents: ["Astra", "Claude Web", "MuhanAI QA"],
		nextTask: "Fix duplicate A2A route registration",
	},
	{
	id: "public-mesh",
		title: "Public Agent Mesh",
		desc: "다른 에이전트가 이슈를 고르고 브랜치에서 작업하는 공개 협업 공간",
	progress: 42,
	status: "review",
		agents: ["Pythia", "Code Runner"],
		nextTask: "Review contribution permissions",
	},
];

type CollaborationResponse = {
	projects: CollaborationProject[];
	tasks: Array<{ id: string; title: string; status: "open"; createdAt: string }>;
};

export function ProjectsPage() {
	const [projects, setProjects] = useState(INITIAL_COLLABORATION_PROJECTS);
	const [joined, setJoined] = useState(false);
	const [taskTitle, setTaskTitle] = useState("");
	const [notice, setNotice] = useState("");

	useEffect(() => {
	void load<CollaborationResponse>("/api/collaboration/projects").then((response) => {
	if (response) setProjects(response.projects);
	});
	}, []);

	const joinWorkspace = () => {
	setJoined(true);
	setNotice("참여 완료 — 새 작업은 격리된 브랜치와 PR 검토를 거칩니다.");
	};

	const publishTask = async () => {
	const title = taskTitle.trim();
	if (!title) {
	setNotice("작업 제목을 입력해주세요.");
	return;
	}
	try {
	await postJson("/api/collaboration/tasks", { title });
	setNotice(`공개 작업이 등록되었습니다: ${title}`);
	setTaskTitle("");
	} catch (error) {
	setNotice(error instanceof Error ? error.message : "작업 등록에 실패했습니다.");
	}
	};

	const requestAgent = async (projectId: string) => {
	try {
	await postJson(`/api/collaboration/projects/${projectId}/invitations`, {});
	setProjects((current) =>
	current.map((project) =>
	project.id === projectId && !project.agents.includes("Incoming Agent")
	? { ...project, agents: [...project.agents, "Incoming Agent"] }
	: project,
	),
	);
	setNotice("참여 가능한 에이전트에게 작업 초대를 보냈습니다.");
	} catch (error) {
	setNotice(error instanceof Error ? error.message : "에이전트 초대에 실패했습니다.");
	}
	};

	return (
	<PageShell
	iconKey="folder-git"
		title="Open Collaboration Workspace"
		subtitle="사람과 에이전트가 공개 작업을 고르고, 격리 브랜치에서 함께 만드는 공간"
	badge="PUBLIC BETA"
	>
	<div style={{ display: "grid", gap: 18 }}>
	<section className="peer-card" style={{ borderColor: "rgba(230,255,135,.35)" }}>
	<div className="peer-card-head">
	<div>
	<strong className="peer-name">Join the next build</strong>
	<p style={{ margin: "6px 0 0", color: "#a8aaa0", fontSize: 13 }}>
	작업 선택 → 에이전트 배정 → 테스트 → PR 리뷰 → 공개 배포
	</p>
	</div>
	<button type="button" className="btn-primary" onClick={joinWorkspace} disabled={joined}>
	{joined ? "참여 중" : "워크스페이스 참여"}
	</button>
	</div>
	{notice && <p style={{ color: "#e6ff87", fontSize: 13, margin: "14px 0 0" }}>{notice}</p>}
	</section>

	<section>
	<div className="peer-card-head" style={{ marginBottom: 10 }}>
	<strong className="peer-name">Active projects</strong>
	<span className="protocol-badge proto-memory">{projects.length} open</span>
	</div>
	<div className="peer-grid">
	{projects.map((project) => (
	<article className="peer-card" key={project.id}>
	<div className="peer-card-head">
	<strong className="peer-name">{project.title}</strong>
	<span className={`protocol-badge ${project.status === "active" ? "proto-webrtc" : "proto-memory"}`}>
	{project.status === "active" ? "BUILDING" : "REVIEW"}
	</span>
	</div>
	<p style={{ fontSize: 13, color: "#8f9188", minHeight: 40 }}>{project.desc}</p>
	<div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#a8aaa0" }}>
	<span>진행률</span><strong style={{ color: "#e6ff87" }}>{project.progress}%</strong>
	</div>
	<div style={{ height: 5, background: "#222", borderRadius: 2, overflow: "hidden", margin: "7px 0 12px" }}>
	<div style={{ width: `${project.progress}%`, height: "100%", background: "#e6ff87" }} />
	</div>
	<p style={{ fontSize: 12, color: "#c4c7bc", margin: "0 0 10px" }}>
	<strong>다음 작업:</strong> {project.nextTask}
	</p>
	<div className="peer-caps">
	{project.agents.map((agent) => <span className="cap-chip sm" key={agent}>{agent}</span>)}
	</div>
	<button type="button" className="btn-secondary sm" style={{ marginTop: 12 }} onClick={() => requestAgent(project.id)}>
	에이전트 초대
	</button>
	</article>
	))}
	</div>
	</section>

	<section className="peer-card">
	<strong className="peer-name">Publish a task for the mesh</strong>
	<p style={{ color: "#8f9188", fontSize: 13 }}>작은 작업부터 공개 등록하면 다른 에이전트가 맡아 PR을 제안합니다.</p>
	<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
	<input
	value={taskTitle}
		onChange={(event) => setTaskTitle(event.target.value)}
		onKeyDown={(event) => event.key === "Enter" && publishTask()}
	placeholder="예: provider streaming 회귀 테스트 추가"
	aria-label="새 공개 작업 제목"
	style={{ flex: "1 1 280px", minWidth: 0, padding: "10px 12px", background: "#151613", border: "1px solid #393b34", borderRadius: 6, color: "#f4f5ed" }}
	/>
	<button type="button" className="btn-primary" onClick={publishTask}>작업 공개</button>
	</div>
	</section>
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

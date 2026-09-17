import {
	Activity,
	Bot,
	Bot as BotIcon,
	CheckCircle,
	Coins,
	Coins as CoinsIcon,
	Cpu,
	Database,
	Flame,
	FolderGit,
	FolderGit as FolderGitIcon,
	GitBranch,
	GitMerge,
	Layers,
	LayoutDashboard,
	ListTodo,
	ListTodo as ListTodoIcon,
	Monitor,
	Network,
	Network as NetworkIcon,
	Package,
	Radio,
	Search,
	ShieldCheck,
	Sparkles,
	Star,
	Users,
	Vote,
} from "lucide-react";
import type React from "react";
import { lazy, Suspense, useState } from "react";
import { useI18n } from "../i18n.js";
import { formatPeerCountBare } from "../lib/mesh-stats.js";
import { AiVsHuman } from "./AiVsHuman";
import { AskNetwork } from "./AskNetwork";
import { CreditBalance } from "./CreditBalance";
import { DocumentUploadPanel } from "./DocumentUploadPanel";
import { FreeTierQuota } from "./FreeTierQuota";
import { HelpNeeded } from "./HelpNeeded";
import { HumanKnowledgeWanted } from "./HumanKnowledgeWanted";
import { NetworkPulse } from "./NetworkPulse";
import { TeachAI } from "./TeachAI";

const TokenBankPageLazy = lazy(() =>
	import("./DashPages").then((module) => ({ default: module.TokenBankPage })),
);

import { TrendingQuestions } from "./TrendingQuestions";
import { UnsolvedProblems } from "./UnsolvedProblems";
import { VerifyMe } from "./VerifyMe";
import { P2PConnectionGraph } from "./visuals/P2PConnectionGraph";
import { WelcomeCreditsBanner } from "./WelcomeCreditsBanner";

interface DashboardProps {
	onNavigate?: (path: string) => void;
}

interface QuickAccessItem {
	id: string;
	label: string;
	icon: React.ReactNode;
	path: string;
	color: string;
	description: string;
}

interface WorkstreamTab {
	id: "tasks" | "verify" | "knowledge" | "economy" | "workspace";
	label: string;
	count: number;
	icon: React.ReactNode;
	render: () => React.ReactNode;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
	const [activeTab, setActiveTab] = useState<
		"tasks" | "verify" | "knowledge" | "economy" | "workspace"
	>("tasks");
	const { t } = useI18n();

	const navigate = (path: string) => {
		if (onNavigate) {
			onNavigate(path);
		} else {
			window.history.pushState(null, "", path);
			window.dispatchEvent(new PopStateEvent("popstate"));
		}
	};

	// Quick Access Grid Items
	const quickAccessItems: QuickAccessItem[] = [
		{
			id: "agent-cast",
			label: t.dashboard.launchAgentCast,
			icon: <Radio size={20} />,
			path: "/agent-cast",
			color: "var(--cline-sky)",
			description: "Multi-agent consensus console",
		},
		{
			id: "network",
			label: t.dashboard.peerNodes,
			icon: <NetworkIcon size={20} />,
			path: "/network",
			color: "var(--cline-violet)",
			description: "P2P mesh topology & peers",
		},
		{
			id: "models",
			label: "LLM Models",
			icon: <Sparkles size={20} />,
			path: "/models",
			color: "var(--cline-amber)",
			description: "Token-free LLM hub & routing",
		},
		{
			id: "compute-mesh",
			label: "Compute Mesh",
			icon: <Cpu size={20} />,
			path: "/compute-mesh",
			color: "var(--cline-violet)",
			description: "Distributed compute & GPU pool",
		},
		{
			id: "knowledge",
			label: "Knowledge Graph",
			icon: <Database size={20} />,
			path: "/knowledge",
			color: "var(--cline-green)",
			description: "Knowledge lake & graph",
		},
		{
			id: "marketplace",
			label: "Marketplace",
			icon: <Bot size={20} />,
			path: "/marketplace/agents",
			color: "var(--cline-orange)",
			description: "Agents, compute & MCP markets",
		},
		{
			id: "token-bank",
			label: t.dashboard.tokenBank?.title || "Token Bank",
			icon: <CoinsIcon size={20} />,
			path: "/token-bank",
			color: "var(--cline-amber)",
			description: "p2ptokens ledger & trust ring",
		},
		{
			id: "desktop",
			label: "Web Desktop",
			icon: <LayoutDashboard size={20} />,
			path: "/desktop",
			color: "var(--cline-violet)",
			description: "DaedalOS web desktop environment",
		},
	];

	const workstreamTabs: WorkstreamTab[] = [
		{
			id: "tasks",
			label: t.dashboard.tabTasks,
			count: 3,
			icon: <ListTodoIcon size={15} />,
			render: () => (
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					<HelpNeeded />
					<UnsolvedProblems maxItems={4} />
				</div>
			),
		},
		{
			id: "verify",
			label: t.dashboard.tabVerify,
			count: 3,
			icon: <ShieldCheck size={15} />,
			render: () => (
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					<VerifyMe />
					<AiVsHuman maxItems={3} />
				</div>
			),
		},
		{
			id: "knowledge",
			label: t.dashboard.tabKnowledge,
			count: 5,
			icon: <Flame size={15} />,
			render: () => (
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					<TrendingQuestions maxItems={5} />
					<HumanKnowledgeWanted maxItems={3} />
					<TeachAI />
				</div>
			),
		},
		{
			id: "economy",
			label: t.dashboard.tokenBank?.title || "Economy",
			count: 3,
			icon: <CoinsIcon size={15} />,
			render: () => (
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					<Suspense fallback={<div style={{ minHeight: 180 }} />}>
						<TokenBankPageLazy />
					</Suspense>
					<div
						style={{
							padding: 20,
							background: "var(--cline-surface)",
							borderRadius: 12,
							border: "1px solid var(--cline-border)",
						}}
					>
						<h3 style={{ marginBottom: 12, color: "var(--cline-text)" }}>Economy Overview</h3>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
								gap: 12,
							}}
						>
							<div
								style={{
									padding: 12,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontSize: 24, fontWeight: 700, color: "var(--cline-amber)" }}>
									1,234
								</div>
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)" }}>Contributions</div>
							</div>
							<div
								style={{
									padding: 12,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontSize: 24, fontWeight: 700, color: "var(--cline-green)" }}>
									98.7%
								</div>
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)" }}>Trust Score</div>
							</div>
							<div
								style={{
									padding: 12,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontSize: 24, fontWeight: 700, color: "var(--cline-sky)" }}>56</div>
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)" }}>Active Peers</div>
							</div>
						</div>
					</div>
				</div>
			),
		},
		{
			id: "workspace",
			label: "Workspace",
			count: 3,
			icon: <FolderGitIcon size={15} />,
			render: () => (
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					<div
						style={{
							padding: 20,
							background: "var(--cline-surface)",
							borderRadius: 12,
							border: "1px solid var(--cline-border)",
						}}
					>
						<h3 style={{ marginBottom: 12, color: "var(--cline-text)" }}>Projects</h3>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
								gap: 12,
							}}
						>
							<div
								style={{
									padding: 16,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontWeight: 600, color: "var(--cline-text)" }}>MuhanAI Core</div>
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)", marginTop: 4 }}>
									Core protocol & SDK
								</div>
								<div style={{ fontSize: 11, color: "var(--cline-green)", marginTop: 8 }}>
									Active · 12 contributors
								</div>
							</div>
							<div
								style={{
									padding: 16,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontWeight: 600, color: "var(--cline-text)" }}>Web Desktop</div>
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)", marginTop: 4 }}>
									DaedalOS environment
								</div>
								<div style={{ fontSize: 11, color: "var(--cline-sky)", marginTop: 8 }}>
									Active · 8 contributors
								</div>
							</div>
							<div
								style={{
									padding: 16,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontWeight: 600, color: "var(--cline-text)" }}>Agent Mesh</div>
								<div style={{ fontSize: 12, color: "var(--cline-text-muted)", marginTop: 4 }}>
									P2P agent network
								</div>
								<div style={{ fontSize: 11, color: "var(--cline-violet)", marginTop: 8 }}>
									Active · 15 contributors
								</div>
							</div>
						</div>
					</div>
					<div
						style={{
							padding: 20,
							background: "var(--cline-surface)",
							borderRadius: 12,
							border: "1px solid var(--cline-border)",
						}}
					>
						<h3 style={{ marginBottom: 12, color: "var(--cline-text)" }}>Tasks & Workflows</h3>
						<div
							style={{
								display: "grid",
								gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
								gap: 12,
							}}
						>
							<div
								style={{
									padding: 16,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontWeight: 600, color: "var(--cline-text)" }}>Open Tasks</div>
								<div
									style={{
										fontSize: 24,
										fontWeight: 700,
										color: "var(--cline-amber)",
										marginTop: 4,
									}}
								>
									23
								</div>
								<div style={{ fontSize: 11, color: "var(--cline-text-muted)", marginTop: 4 }}>
									Ready for contribution
								</div>
							</div>
							<div
								style={{
									padding: 16,
									background: "var(--cline-bg)",
									borderRadius: 8,
									border: "1px solid var(--cline-border)",
								}}
							>
								<div style={{ fontWeight: 600, color: "var(--cline-text)" }}>Active Workflows</div>
								<div
									style={{ fontSize: 24, fontWeight: 700, color: "var(--cline-sky)", marginTop: 4 }}
								>
									7
								</div>
								<div style={{ fontSize: 11, color: "var(--cline-text-muted)", marginTop: 4 }}>
									Running pipelines
								</div>
							</div>
						</div>
					</div>
				</div>
			),
		},
	];

	return (
		<main className="dashboard" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
			{/* 1. Hero Summary & Quick Action Strip */}
			<div className="dashboard-hero-card">
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						flexWrap: "wrap",
						gap: 16,
					}}
				>
					<div>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								marginBottom: 6,
							}}
						>
							<span
								className="brand-badge"
								style={{
									background: "rgba(16, 185, 129, 0.15)",
									color: "var(--cline-green)",
									borderColor: "rgba(16, 185, 129, 0.3)",
								}}
							>
								{t.dashboard.meshOperational}
							</span>
							<span className="brand-badge">{t.dashboard.gatewayActive}</span>
						</div>
						<h1 className="dashboard-hero-title">{t.dashboard.heroTitle}</h1>
						<p className="dashboard-hero-desc">{t.dashboard.heroDesc}</p>
					</div>

					<div style={{ display: "flex", gap: 10 }}>
						<button
							type="button"
							className="top-action-btn"
							style={{
								background:
									"linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(99, 102, 241, 0.25))",
								borderColor: "rgba(56, 189, 248, 0.4)",
								color: "#38bdf8",
							}}
							onClick={() => navigate("/")}
						>
							<Sparkles size={14} />
							{t.dashboard.cosmicMesh}
						</button>
						<button
							type="button"
							className="top-action-btn"
							onClick={() => navigate("/agent-cast")}
						>
							<Radio size={14} />
							{t.dashboard.launchAgentCast}
						</button>
						<button type="button" className="p2p-ping-btn" onClick={() => navigate("/network")}>
							<Network size={14} />
							{t.dashboard.peerNodes}
						</button>
					</div>
				</div>

				{/* 4 Key Developer Telemetry Tiles */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
						gap: 12,
						marginTop: 20,
					}}
				>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">{t.dashboard.activeP2PNodes}</span>
						<span className="telemetry-stat-val" style={{ color: "var(--cline-sky)" }}>
							{formatPeerCountBare(undefined)} Peers
						</span>
					</div>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">{t.dashboard.consensusQuorum}</span>
						<span className="telemetry-stat-val" style={{ color: "var(--cline-green)" }}>
							98.5% Agreement
						</span>
					</div>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">{t.dashboard.distributedCompute}</span>
						<span className="telemetry-stat-val">18,400 TFLOPS</span>
					</div>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">{t.dashboard.tokenCost}</span>
						<span className="telemetry-stat-val" style={{ color: "var(--cline-amber)" }}>
							0 MHT (Free Gateway)
						</span>
						<span style={{ marginTop: 6 }}>
							<CreditBalance userId="demo" />
						</span>
					</div>
				</div>
			</div>

			{/* Quick Access Grid — 8 cards for top sections */}
			<section aria-label="Quick Access" style={{ marginBottom: 20 }}>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
						gap: 12,
						marginBottom: 8,
					}}
				>
					{quickAccessItems.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => navigate(item.path)}
							style={{
								display: "flex",
								flexDirection: "column",
								gap: 8,
								padding: 16,
								background: "var(--cline-surface)",
								border: "1px solid var(--cline-border)",
								borderRadius: 12,
								textAlign: "left",
								cursor: "pointer",
								transition: "all 0.2s ease",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = item.color;
								e.currentTarget.style.boxShadow = `0 0 0 1px ${item.color}, 0 8px 24px ${item.color}20`;
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = "var(--cline-border)";
								e.currentTarget.style.boxShadow = "none";
							}}
						>
							<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
								<div
									style={{
										width: 36,
										height: 36,
										borderRadius: 10,
										background: `${item.color}20`,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: item.color,
									}}
								>
									{item.icon}
								</div>
								<div style={{ flex: 1 }}>
									<div style={{ fontWeight: 600, fontSize: 14, color: "var(--cline-text)" }}>
										{item.label}
									</div>
									<div style={{ fontSize: 11, color: "var(--cline-text-muted)" }}>
										{item.description}
									</div>
								</div>
							</div>
						</button>
					))}
				</div>
			</section>

			{/* 1b. Welcome Credits banner — first-impression onboarding for new users */}
			<section aria-label="Welcome Credits">
				<WelcomeCreditsBanner />
			</section>

			{/* Token Bank — p2ptokens contribution ledger · PinkyBrain Web of Trust */}
			<section aria-label="Token Bank" style={{ marginBottom: 20 }}>
				<Suspense fallback={<div style={{ minHeight: 180 }} />}>
					<TokenBankPageLazy />
				</Suspense>
			</section>

			{/* 2. INJECTED: Interactive Open-Source P2P Connection Mesh Topology Graph */}
			<section aria-label="P2P Connection Mesh">
				<P2PConnectionGraph />
			</section>

			{/* 3. Live Pulse Ribbon */}
			<section aria-label="Network Pulse">
				<NetworkPulse />
			</section>

			{/* 3b. Free-Tier Mesh Quota — OmniRoute per-provider usage */}
			<section aria-label="Free-Tier Mesh Quota">
				<FreeTierQuota />
			</section>

			{/* 4. Quick Ask Network Input */}
			<section aria-label="Ask Network Prompt">
				<AskNetwork
					onSubmit={(question, targets, model) => {
						const params = new URLSearchParams();
						params.set("q", question);
						params.set("targets", targets.join(","));
						if (model) {
							params.set("model-manifest", JSON.stringify(model));
						}
						navigate(`/agent-cast?${params.toString()}`);
					}}
				/>
			</section>

			{/* 5. Enhanced Tabbed Workstreams: Tasks / Verify / Knowledge / Economy / Workspace */}
			<section className="dash-workstream-container" style={{ marginTop: 8 }}>
				<div
					className="dash-workstream-tabs"
					style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}
				>
					{workstreamTabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							className={`dash-tab-btn ${activeTab === tab.id ? "active" : ""}`}
							onClick={() => setActiveTab(tab.id as typeof activeTab)}
							style={{
								display: "flex",
								alignItems: "center",
								gap: 6,
								padding: "8px 14px",
								borderRadius: 8,
								border: "1px solid var(--cline-border)",
								background:
									activeTab === tab.id ? "var(--cline-primary-bg)" : "var(--cline-surface)",
								color: activeTab === tab.id ? "var(--cline-primary)" : "var(--cline-text)",
								cursor: "pointer",
								transition: "all 0.2s ease",
							}}
						>
							{tab.icon}
							<span>{tab.label}</span>
							<span
								className="dash-tab-count"
								style={{
									fontSize: 10,
									padding: "2px 6",
									borderRadius: 10,
									background: "var(--cline-primary-bg)",
									color: "var(--cline-primary)",
								}}
							>
								{tab.count}
							</span>
						</button>
					))}
				</div>

				{/* Tab 1: Help Needed & Unsolved Problems */}
				{activeTab === "tasks" && workstreamTabs.find((t) => t.id === "tasks")?.render()}

				{/* Tab 2: Verification Claims & Consensus */}
				{activeTab === "verify" && workstreamTabs.find((t) => t.id === "verify")?.render()}

				{/* Tab 3: Trending Questions & Teach AI */}
				{activeTab === "knowledge" && workstreamTabs.find((t) => t.id === "knowledge")?.render()}

				{/* Tab 4: Economy — Token Bank + Contributions + Reputation */}
				{activeTab === "economy" && workstreamTabs.find((t) => t.id === "economy")?.render()}

				{/* Tab 5: Workspace — Projects, Tasks, Workflows */}
				{activeTab === "workspace" && workstreamTabs.find((t) => t.id === "workspace")?.render()}
			</section>
		</main>
	);
};

function navigate(path: string) {
	if (typeof window !== "undefined") {
		window.history.pushState(null, "", path);
		window.dispatchEvent(new PopStateEvent("popstate"));
	}
}

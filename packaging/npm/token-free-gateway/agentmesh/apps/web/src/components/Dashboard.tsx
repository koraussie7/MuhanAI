import { Flame, ListTodo, Network, Radio, ShieldCheck, Sparkles } from "lucide-react";
import type React from "react";
import { useState } from "react";
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
import { TrendingQuestions } from "./TrendingQuestions";
import { UnsolvedProblems } from "./UnsolvedProblems";
import { VerifyMe } from "./VerifyMe";
import { P2PConnectionGraph } from "./visuals/P2PConnectionGraph";
import { WelcomeCreditsBanner } from "./WelcomeCreditsBanner";

interface DashboardProps {
	onNavigate?: (path: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
	const [activeTab, setActiveTab] = useState<"tasks" | "verify" | "knowledge" | "kb">("tasks");
	const { t } = useI18n();

	const navigate = (path: string) => {
		if (onNavigate) {
			onNavigate(path);
		} else {
			window.history.pushState(null, "", path);
			window.dispatchEvent(new PopStateEvent("popstate"));
		}
	};

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
						<p className="dashboard-hero-desc">{t.dashboard.heroDesc}
						</p>
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

			{/* 1b. Welcome Credits banner — first-impression onboarding for new users */}
			<section aria-label="Welcome Credits">
				<WelcomeCreditsBanner />
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

			{/* 5. Clean Tabbed Workstreams: Tasks / Verification / Knowledge */}
			<section className="dash-workstream-container" style={{ marginTop: 8 }}>
				<div className="dash-workstream-tabs">
					<button
						type="button"
						className={`dash-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
						onClick={() => setActiveTab("tasks")}
					>
						<ListTodo size={15} />
						<span>{t.dashboard.tabTasks}</span>
						<span className="dash-tab-count">3</span>
					</button>

					<button
						type="button"
						className={`dash-tab-btn ${activeTab === "verify" ? "active" : ""}`}
						onClick={() => setActiveTab("verify")}
					>
						<ShieldCheck size={15} />
						<span>{t.dashboard.tabVerify}</span>
						<span className="dash-tab-count">3</span>
					</button>

					<button
						type="button"
						className={`dash-tab-btn ${activeTab === "knowledge" ? "active" : ""}`}
						onClick={() => setActiveTab("knowledge")}
					>
						<Flame size={15} />
						<span>{t.dashboard.tabKnowledge}</span>
						<span className="dash-tab-count">5</span>
					</button>
					<button
						type="button"
						className={`dash-tab-btn ${activeTab === "kb" ? "active" : ""}`}
						onClick={() => setActiveTab("kb")}
					>
						<span>{t.dashboard.tabKb}</span>
						<span className="dash-tab-count">+</span>
					</button>
				</div>

				{/* Tab 1: Help Needed & Unsolved Problems */}
				{activeTab === "tasks" && (
					<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
						<HelpNeeded />
						<UnsolvedProblems maxItems={4} />
					</div>
				)}

				{/* Tab 2: Verification Claims & Consensus */}
				{activeTab === "verify" && (
					<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
						<VerifyMe />
						<AiVsHuman maxItems={3} />
					</div>
				)}

				{/* Tab 3: Trending Questions & Teach AI */}
				{activeTab === "knowledge" && (
					<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
						<TrendingQuestions maxItems={5} />
						<HumanKnowledgeWanted maxItems={3} />
						<TeachAI />
					</div>
				)}

				{/* Tab 4: Knowledge Base Upload */}
				{activeTab === "kb" && (
					<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
						<DocumentUploadPanel
							onUploaded={(result) => {
								console.log("[Dashboard] uploaded", result);
							}}
						/>
					</div>
				)}
			</section>
		</main>
	);
};

import { Flame, ListTodo, Network, Radio, ShieldCheck, Sparkles } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { AiVsHuman } from "./AiVsHuman";
import { AskNetwork } from "./AskNetwork";
import { CreditBalance } from "./CreditBalance";
import { DocumentUploadPanel } from "./DocumentUploadPanel";
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
								● P2P MESH OPERATIONAL
							</span>
							<span className="brand-badge">TOKEN-FREE GATEWAY ACTIVE</span>
						</div>
						<h1 className="dashboard-hero-title">MuhanAI Autonomous Agent Mesh</h1>
						<p className="dashboard-hero-desc">
							Cline 스타일의 탈중앙화 AI 메쉬 네트워크입니다. 로컬 및 분산 모델이 WebRTC & libp2p
							P2P 연결을 통해 자율적으로 합의하고 협력합니다.
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
							Cosmic Mesh
						</button>
						<button
							type="button"
							className="top-action-btn"
							onClick={() => navigate("/agent-cast")}
						>
							<Radio size={14} />
							Launch Agent Cast
						</button>
						<button type="button" className="p2p-ping-btn" onClick={() => navigate("/network")}>
							<Network size={14} />
							Peer Nodes
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
						<span className="telemetry-stat-lbl">Active P2P Nodes</span>
						<span className="telemetry-stat-val" style={{ color: "var(--cline-sky)" }}>
							12,482 Peers
						</span>
					</div>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">Consensus Quorum</span>
						<span className="telemetry-stat-val" style={{ color: "var(--cline-green)" }}>
							98.5% Agreement
						</span>
					</div>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">Distributed Compute</span>
						<span className="telemetry-stat-val">18,400 TFLOPS</span>
					</div>
					<div className="telemetry-stat-card">
						<span className="telemetry-stat-lbl">Token Cost</span>
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

			{/* 4. Quick Ask Network Input */}
			<section aria-label="Ask Network Prompt">
				<AskNetwork
					onSubmit={(question, targets) => {
						const params = new URLSearchParams();
						params.set("q", question);
						params.set("targets", targets.join(","));
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
						<span>Tasks & Help Needed</span>
						<span className="dash-tab-count">3</span>
					</button>

					<button
						type="button"
						className={`dash-tab-btn ${activeTab === "verify" ? "active" : ""}`}
						onClick={() => setActiveTab("verify")}
					>
						<ShieldCheck size={15} />
						<span>Verification & Quorum</span>
						<span className="dash-tab-count">3</span>
					</button>

				<button
					type="button"
					className={`dash-tab-btn ${activeTab === "knowledge" ? "active" : ""}`}
					onClick={() => setActiveTab("knowledge")}
				>
					<Flame size={15} />
					<span>Trending Intelligence & Teach</span>
					<span className="dash-tab-count">5</span>
				</button>
				<button
					type="button"
					className={`dash-tab-btn ${activeTab === "kb" ? "active" : ""}`}
					onClick={() => setActiveTab("kb")}
				>
					<span>Knowledge Base</span>
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

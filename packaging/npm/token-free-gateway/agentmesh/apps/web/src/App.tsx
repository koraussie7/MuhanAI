import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { AgentCast } from "./components/AgentCast";
import { NetworkPulse } from "./components/NetworkPulse";
import { HelpNeeded } from "./components/HelpNeeded";
import { VerifyMe } from "./components/VerifyMe";
import { Trending, HumanWanted, TeachAi, Rewards } from "./components/NetworkSections";
import { TrendingQuestions } from "./components/TrendingQuestions";
import { HumanKnowledgeWanted } from "./components/HumanKnowledgeWanted";
import { UnsolvedProblems } from "./components/UnsolvedProblems";
import { AiVsHuman } from "./components/AiVsHuman";
import { RewardsDisplay } from "./components/RewardsDisplay";
import { TeachAI } from "./components/TeachAI";
import { RightPanel } from "./components/RightPanel";
import { NetworkMonitorPage, AgentMeshPage, LlmMeshPage, TokenBankPage, VerificationPage, P2pNetworkPage, ComputeMeshPage, MarketplacePage } from "./components/DashPages";

const SECTIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "agent-mesh", label: "Agent Mesh" },
  { id: "agent-cast", label: "Agent Cast" },
  { id: "agents", label: "Agents" },
  { id: "human-agents", label: "Human Agents" },
  { id: "p2p-network", label: "P2P Network" },
  { id: "knowledge", label: "Knowledge" },
  { id: "knowledge-graph", label: "Knowledge Graph" },
  { id: "search", label: "Search" },
  { id: "verification", label: "Verification" },
  { id: "llm-mesh", label: "LLM Mesh" },
  { id: "mcp-skills", label: "MCP / Skills" },
  { id: "compute-mesh", label: "Compute Mesh" },
  { id: "models", label: "Models" },
  { id: "agents-market", label: "Agents Marketplace" },
  { id: "human-experts", label: "Human Experts" },
  { id: "mcp-market", label: "MCP Marketplace" },
  { id: "knowledge-market", label: "Knowledge Marketplace" },
  { id: "compute-market", label: "Compute Marketplace" },
  { id: "token-bank", label: "Token Bank" },
  { id: "contributions", label: "Contributions" },
  { id: "reputation", label: "Reputation" },
  { id: "projects", label: "Projects" },
  { id: "tasks", label: "Tasks" },
  { id: "workflows", label: "Workflows" },
  { id: "network-monitor", label: "Network Monitor" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [activeSection, setActiveSection] = useState("dashboard");

  return (
    <div className="app-shell">
      <Sidebar activePath={activeSection} onItemClick={setActiveSection} />

      <div className="main-wrapper">
        <header className="top-bar">
          <div className="top-bar-left">
            <h1 className="page-title">
              {SECTIONS.find(s => s.id === activeSection)?.label || "Dashboard"}
            </h1>
          </div>
          <div className="top-bar-right">
            <div className="global-search">
              <input
                type="text"
                placeholder="Ask the Network..."
                className="search-input"
              />
              <button className="search-button">Search</button>
            </div>
            <div className="user-menu">
              <span className="user-credits">12,480 Credits</span>
            </div>
          </div>
        </header>

        <div className="content-layout">
          <main className="main-content" role="main">
            {activeSection === "dashboard" && <Dashboard />}
            {activeSection === "agent-cast" && <AgentCast />}
            {activeSection === "help-needed" && <HelpNeeded />}
            {activeSection === "verify" && <VerifyMe />}
            {activeSection === "trending" && <TrendingQuestions />}
            {activeSection === "human-knowledge" && <HumanKnowledgeWanted />}
            {activeSection === "unsolved" && <UnsolvedProblems />}
            {activeSection === "ai-vs-human" && <AiVsHuman />}
            {activeSection === "rewards" && <RewardsDisplay />}
            {activeSection === "teach-ai" && <TeachAI />}
            {activeSection === "network-pulse" && <NetworkPulse />}
            {activeSection === "network-monitor" && <NetworkMonitorPage />}
            {activeSection === "agent-mesh" && <AgentMeshPage />}
            {activeSection === "llm-mesh" && <LlmMeshPage />}
            {activeSection === "token-bank" && <TokenBankPage />}
            {activeSection === "verification" && <VerificationPage />}
            {activeSection === "p2p-network" && <P2pNetworkPage />}
            {activeSection === "compute-mesh" && <ComputeMeshPage />}
            {(activeSection === "agents-market" || activeSection === "human-experts" || activeSection === "mcp-market" || activeSection === "knowledge-market" || activeSection === "compute-market") && <MarketplacePage />}
            {activeSection === "settings" && <Settings />}
            {!SECTIONS.some(s => s.id === activeSection) && (
              <div className="placeholder-page">
                <h2>{activeSection}</h2>
                <p>이 섹션은 구현 중입니다.</p>
              </div>
            )}
          </main>

          <RightPanel activeSection={activeSection} />
        </div>
      </div>
    </div>
  );
}

function NetworkMonitor() {
  return (
    <div className="placeholder-page">
      <h2>Network Monitor</h2>
      <p>네트워크 모니터링 대시보드 (구현 중)</p>
    </div>
  );
}

function Settings() {
  return (
    <div className="placeholder-page">
      <h2>Settings</h2>
      <p>설정 페이지 (구현 중)</p>
    </div>
  );
}
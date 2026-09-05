import { ConsensusDial } from "./components/visuals/ConsensusDial.js";
import React, { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { AgentCast } from "./components/AgentCast";
import { HelpNeeded } from "./components/HelpNeeded";
import { VerifyMe } from "./components/VerifyMe";
import { TrendingQuestions } from "./components/TrendingQuestions";
import { HumanKnowledgeWanted } from "./components/HumanKnowledgeWanted";
import { UnsolvedProblems } from "./components/UnsolvedProblems";
import { AiVsHuman } from "./components/AiVsHuman";
import { RewardsDisplay } from "./components/RewardsDisplay";
import { TeachAI } from "./components/TeachAI";
import { NetworkPulse } from "./components/NetworkPulse";
import { RightPanel } from "./components/RightPanel";
import {
  NetworkMonitorPage,
  AgentMeshPage,
  LlmMeshPage,
  TokenBankPage,
  VerificationPage,
  P2pNetworkPage,
  ComputeMeshPage,
  MarketplacePage,
} from "./components/DashPages";
import {
  AgentsPage,
  HumanAgentsPage,
  KnowledgePage,
  KnowledgeGraphPage,
  SearchPage,
  McpSkillsPage,
  ModelsPage,
  ContributionsPage,
  ReputationPage,
  ProjectsPage,
  TasksPage,
  WorkflowsPage,
  SettingsPage,
} from "./components/SpecPages";

const SECTIONS = [
  { id: "dashboard", path: "/", label: "Dashboard" },
  { id: "agent-mesh", path: "/agent-mesh", label: "Agent Mesh" },
  { id: "agent-cast", path: "/agent-cast", label: "Agent Cast" },
  { id: "agents", path: "/agents", label: "Agents" },
  { id: "human-agents", path: "/human-agents", label: "Human Agents" },
  { id: "p2p-network", path: "/p2p-network", label: "P2P Network" },
  { id: "knowledge", path: "/knowledge", label: "Knowledge" },
  { id: "knowledge-graph", path: "/knowledge-graph", label: "Knowledge Graph" },
  { id: "search", path: "/search", label: "Search" },
  { id: "verification", path: "/verification", label: "Verification" },
  { id: "llm-mesh", path: "/llm-mesh", label: "LLM Mesh" },
  { id: "mcp-skills", path: "/mcp-skills", label: "MCP / Skills" },
  { id: "compute-mesh", path: "/compute-mesh", label: "Compute Mesh" },
  { id: "models", path: "/models", label: "Models" },
  { id: "agents-market", path: "/marketplace/agents", label: "Agents Marketplace" },
  { id: "human-experts", path: "/marketplace/human-experts", label: "Human Experts" },
  { id: "mcp-market", path: "/marketplace/mcp", label: "MCP Marketplace" },
  { id: "knowledge-market", path: "/marketplace/knowledge", label: "Knowledge Marketplace" },
  { id: "compute-market", path: "/marketplace/compute", label: "Compute Marketplace" },
  { id: "token-bank", path: "/token-bank", label: "Token Bank" },
  { id: "contributions", path: "/contributions", label: "Contributions" },
  { id: "reputation", path: "/reputation", label: "Reputation" },
  { id: "projects", path: "/projects", label: "Projects" },
  { id: "tasks", path: "/tasks", label: "Tasks" },
  { id: "workflows", path: "/workflows", label: "Workflows" },
  { id: "network-monitor", path: "/network-monitor", label: "Network Monitor" },
  { id: "settings", path: "/settings", label: "Settings" },
];

const IMPLEMENTED_SECTIONS = new Set(SECTIONS.map((s) => s.id));

function sectionIdFromPath(path: string) {
  return SECTIONS.find((section) => section.path === path)?.id ?? (path.replace(/^\//, "") || "dashboard");
}

function pathFromSectionId(id: string) {
  return SECTIONS.find((section) => section.id === id)?.path ?? `/${id}`;
}

export function App() {
  const [activeSection, setActiveSection] = useState("dashboard");

  return (
    <div className="app-shell">
      <Sidebar activePath={pathFromSectionId(activeSection)} onItemClick={(path) => setActiveSection(sectionIdFromPath(path))} />
      <div className="main-wrapper">
        <header className="top-bar">
          <div className="top-bar-left">
            <h1 className="page-title">
              {SECTIONS.find((s) => s.id === activeSection)?.label || "Dashboard"}
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
            {activeSection === "agent-cast" && (
              <>
                <ConsensusDial />
                <AgentCast />
              </>
            )}
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

            {/* Network */}
            {activeSection === "agent-mesh" && <AgentMeshPage />}
            {activeSection === "agents" && <AgentsPage />}
            {activeSection === "human-agents" && <HumanAgentsPage />}
            {activeSection === "p2p-network" && <P2pNetworkPage />}

            {/* Intelligence */}
            {activeSection === "knowledge" && <KnowledgePage />}
            {activeSection === "knowledge-graph" && <KnowledgeGraphPage />}
            {activeSection === "search" && <SearchPage />}
            {activeSection === "verification" && <VerificationPage />}

            {/* AI Resources */}
            {activeSection === "llm-mesh" && <LlmMeshPage />}
            {activeSection === "mcp-skills" && <McpSkillsPage />}
            {activeSection === "compute-mesh" && <ComputeMeshPage />}
            {activeSection === "models" && <ModelsPage />}

            {/* Marketplace */}
            {(activeSection === "agents-market" ||
              activeSection === "human-experts" ||
              activeSection === "mcp-market" ||
              activeSection === "knowledge-market" ||
              activeSection === "compute-market") && <MarketplacePage />}

            {/* Economy */}
            {activeSection === "token-bank" && <TokenBankPage />}
            {activeSection === "contributions" && <ContributionsPage />}
            {activeSection === "reputation" && <ReputationPage />}

            {/* Workspace */}
            {activeSection === "projects" && <ProjectsPage />}
            {activeSection === "tasks" && <TasksPage />}
            {activeSection === "workflows" && <WorkflowsPage />}

            {/* System */}
            {activeSection === "settings" && <SettingsPage />}

            {!IMPLEMENTED_SECTIONS.has(activeSection) && (
              <div className="placeholder-page">
                <h2>{SECTIONS.find((section) => section.id === activeSection)?.label ?? activeSection}</h2>
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

export default App;

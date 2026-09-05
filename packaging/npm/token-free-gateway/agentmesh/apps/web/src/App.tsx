import React, { useState, useEffect } from "react";
import "./styles/cline-theme.css";
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
import { Search, Zap, Radio, ChevronRight } from "lucide-react";

const SECTIONS = [
  { id: "dashboard", path: "/", label: "Dashboard", category: "Core" },
  { id: "agent-mesh", path: "/agent-mesh", label: "Agent Mesh", category: "Core" },
  { id: "agent-cast", path: "/agent-cast", label: "Agent Cast", category: "Core" },
  { id: "agents", path: "/agents", label: "Agents", category: "Core" },
  { id: "human-agents", path: "/human-agents", label: "Human Agents", category: "Core" },
  { id: "p2p-network", path: "/p2p-network", label: "P2P Network", category: "Network" },
  { id: "knowledge", path: "/knowledge", label: "Knowledge Lake", category: "Intelligence" },
  { id: "knowledge-graph", path: "/knowledge-graph", label: "Knowledge Graph", category: "Intelligence" },
  { id: "search", path: "/search", label: "Mesh Search", category: "Intelligence" },
  { id: "verification", path: "/verification", label: "Verification", category: "Intelligence" },
  { id: "llm-mesh", path: "/llm-mesh", label: "LLM Mesh", category: "Resources" },
  { id: "mcp-skills", path: "/mcp-skills", label: "MCP / Skills", category: "Resources" },
  { id: "compute-mesh", path: "/compute-mesh", label: "Compute Mesh", category: "Resources" },
  { id: "models", path: "/models", label: "Models", category: "Resources" },
  { id: "agents-market", path: "/marketplace/agents", label: "Agents Hub", category: "Marketplace" },
  { id: "human-experts", path: "/marketplace/human-experts", label: "Human Experts", category: "Marketplace" },
  { id: "mcp-market", path: "/marketplace/mcp", label: "MCP Marketplace", category: "Marketplace" },
  { id: "knowledge-market", path: "/marketplace/knowledge", label: "Knowledge Market", category: "Marketplace" },
  { id: "compute-market", path: "/marketplace/compute", label: "Compute Market", category: "Marketplace" },
  { id: "token-bank", path: "/token-bank", label: "Token Bank", category: "Economy" },
  { id: "contributions", path: "/contributions", label: "Contributions", category: "Economy" },
  { id: "reputation", path: "/reputation", label: "Reputation", category: "Economy" },
  { id: "projects", path: "/projects", label: "Projects", category: "Workspace" },
  { id: "tasks", path: "/tasks", label: "Tasks", category: "Workspace" },
  { id: "workflows", path: "/workflows", label: "Workflows", category: "Workspace" },
  { id: "network-monitor", path: "/network-monitor", label: "Network Monitor", category: "Network" },
  { id: "settings", path: "/settings", label: "Settings", category: "System" },
];

const IMPLEMENTED_SECTIONS = new Set(SECTIONS.map((s) => s.id));

function sectionIdFromPath(path: string) {
  const cleanPath = path.split("?")[0] || "/";
  const found = SECTIONS.find((s) => s.path === cleanPath);
  if (found) return found.id;
  const bare = cleanPath.replace(/^\//, "");
  return bare || "dashboard";
}

function pathFromSectionId(id: string) {
  return SECTIONS.find((section) => section.id === id)?.path ?? `/${id}`;
}

export function App() {
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window !== "undefined") {
      return sectionIdFromPath(window.location.pathname);
    }
    return "dashboard";
  });

  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem("cline_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const [searchQuery, setSearchQuery] = useState("");

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("cline_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const navigate = (path: string) => {
    const nextSection = sectionIdFromPath(path);
    setActiveSection(nextSection);
    window.history.pushState(null, "", path);
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveSection(sectionIdFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const currentSectionMeta = SECTIONS.find((s) => s.id === activeSection) ?? {
    id: activeSection,
    label: activeSection,
    category: "MuhanAI",
    path: `/${activeSection}`,
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <div className="app-shell">
      {/* Sidebar with Cline styling */}
      <Sidebar
        activePath={pathFromSectionId(activeSection)}
        onItemClick={navigate}
        isCollapsed={isCollapsed}
        onToggle={toggleSidebar}
      />

      {/* Main Wrapper */}
      <div className="main-wrapper">
        {/* Top Header Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            <div className="breadcrumb-trail">
              <span className="breadcrumb-root">MuhanAI</span>
              <ChevronRight size={13} className="breadcrumb-separator" />
              <span className="breadcrumb-root">{currentSectionMeta.category}</span>
              <ChevronRight size={13} className="breadcrumb-separator" />
              <span className="breadcrumb-current">{currentSectionMeta.label}</span>
            </div>
          </div>

          <div className="top-bar-right">
            {/* Global Search Bar */}
            <form className="top-search-wrap" onSubmit={handleSearchSubmit}>
              <Search size={14} className="top-search-icon" />
              <input
                type="text"
                placeholder="Ask network or search..."
                className="top-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <span className="top-search-kbd">⌘K</span>
            </form>

            {/* Token-Free Gateway Badge */}
            <div className="gateway-status-badge">
              <Zap size={13} />
              <span>Token-Free Gateway Active</span>
            </div>

            {/* Top Launch Button */}
            {activeSection !== "agent-cast" && (
              <button
                type="button"
                className="top-action-btn"
                onClick={() => navigate("/agent-cast")}
              >
                <Radio size={14} />
                Agent Cast
              </button>
            )}
          </div>
        </header>

        {/* Content Layout with Telemetry Sidebar */}
        <div className="content-layout">
          <main className="main-content" role="main">
            {activeSection === "dashboard" && <Dashboard onNavigate={navigate} />}
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
              activeSection === "compute-market") && (
              <MarketplacePage
                defaultTab={
                  activeSection === "human-experts"
                    ? "human"
                    : activeSection === "mcp-market"
                      ? "mcp"
                      : activeSection === "knowledge-market"
                        ? "knowledge"
                        : activeSection === "compute-market"
                          ? "compute"
                          : "agents"
                }
              />
            )}

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
              <div className="placeholder-page" style={{ padding: 40, textAlign: "center" }}>
                <h2>{SECTIONS.find((section) => section.id === activeSection)?.label ?? activeSection}</h2>
                <p style={{ color: "var(--cline-text-muted)" }}>이 섹션은 준비 중입니다.</p>
              </div>
            )}
          </main>

          {/* Right Telemetry Panel */}
          <RightPanel />
        </div>
      </div>
    </div>
  );
}

export default App;

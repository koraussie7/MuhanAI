import React, { useState, useEffect } from "react";
import "./styles/cline-theme.css";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { AgentCast } from "./components/AgentCast";
import { RightPanel } from "./components/RightPanel";
import { SemanticVote } from "./components/SemanticVote";
import { HiveBearPanel } from "./components/HiveBearPanel";
import { FederationPanel } from "./components/FederationPanel";
import { FindPage } from "./components/find/FindPage";
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
import { Search, Zap, Radio, ChevronRight, Sparkles } from "lucide-react";

const SECTIONS = [
  { id: "dashboard", path: "/", label: "Dashboard", category: "Core" },
  { id: "find", path: "/find", label: "Cosmic Obsidian Mesh", category: "Intelligence" },
  { id: "agent-cast", path: "/agent-cast", label: "Agent Cast", category: "Core" },
  { id: "agent-mesh", path: "/agent-mesh", label: "Agent Mesh", category: "Core" },
  { id: "p2p-network", path: "/network", label: "P2P Nodes", category: "Network" },
  { id: "p2p-network-alt", path: "/p2p-network", label: "P2P Nodes", category: "Network" },
  { id: "network-monitor", path: "/monitor", label: "Telemetry & Pulse", category: "Network" },
  { id: "network-monitor-alt", path: "/network-monitor", label: "Telemetry & Pulse", category: "Network" },
  { id: "models", path: "/models", label: "LLM Models", category: "Resources" },
  { id: "compute-mesh", path: "/compute-mesh", label: "Compute Mesh", category: "Resources" },
  { id: "mcp-skills", path: "/mcp-skills", label: "MCP Tools", category: "Resources" },
  { id: "knowledge", path: "/knowledge", label: "Knowledge Graph", category: "Intelligence" },
  { id: "knowledge-graph", path: "/knowledge-graph", label: "Knowledge Graph", category: "Intelligence" },
  { id: "verification", path: "/verification", label: "Verification", category: "Intelligence" },
  { id: "search", path: "/search", label: "Mesh Search", category: "Intelligence" },
  { id: "agents-market", path: "/marketplace/agents", label: "Agent Hub", category: "Marketplace" },
  { id: "human-experts", path: "/marketplace/human-experts", label: "Human Experts", category: "Marketplace" },
  { id: "compute-market", path: "/marketplace/compute", label: "Compute Market", category: "Marketplace" },
  { id: "mcp-market", path: "/marketplace/mcp", label: "MCP Marketplace", category: "Marketplace" },
  { id: "knowledge-market", path: "/marketplace/knowledge", label: "Knowledge Market", category: "Marketplace" },
  { id: "token-bank", path: "/token-bank", label: "Token Bank", category: "Economy" },
  { id: "contributions", path: "/contributions", label: "Contributions", category: "Economy" },
  { id: "reputation", path: "/reputation", label: "Reputation", category: "Economy" },
  { id: "projects", path: "/projects", label: "Projects", category: "Workspace" },
  { id: "tasks", path: "/tasks", label: "Tasks", category: "Workspace" },
  { id: "workflows", path: "/workflows", label: "Workflows", category: "Workspace" },
  { id: "settings", path: "/settings", label: "Settings", category: "System" },
  { id: "semantic-vote", path: "/semantic-vote", label: "Semantic Vote", category: "Intelligence" },
  { id: "hivebear", path: "/hivebear", label: "HiveBear Mesh", category: "Resources" },
  { id: "federation", path: "/federation", label: "Federation", category: "Intelligence" },
];

const IMPLEMENTED_SECTIONS = new Set(SECTIONS.map((s) => s.id));

function sectionIdFromPath(path: string) {
  const cleanPath = path.split("?")[0] || "/";
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "find.muhanai.com" || host.startsWith("find.")) {
      return "find";
    }
  }
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

  // 1. Fullscreen Standalone View for find.muhanai.com or /find
  if (activeSection === "find") {
    return (
      <FindPage
        onNavigateHome={() => {
          if (typeof window !== "undefined" && window.location.hostname === "find.muhanai.com") {
            window.location.href = "https://muhanai.com";
          } else {
            navigate("/");
          }
        }}
      />
    );
  }

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
      {/* Sidebar with clean menu items matching NAV_GROUPS */}
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

            {/* Launch Cosmic Mesh / find.muhanai.com Button */}
            <button
              type="button"
              className="top-action-btn"
              style={{
                background: "linear-gradient(135deg, rgba(14, 165, 233, 0.25), rgba(99, 102, 241, 0.25))",
                borderColor: "rgba(56, 189, 248, 0.4)",
                color: "#38bdf8",
              }}
              onClick={() => navigate("/find")}
              title="Launch find.muhanai.com Cosmic Knowledge Mesh"
            >
              <Sparkles size={13} />
              <span>find.muhanai.com</span>
            </button>

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
            {/* Dashboard: Houses all 지식인 UI and Network Pulse */}
            {activeSection === "dashboard" && <Dashboard onNavigate={navigate} />}

            {/* Core & Chat */}
            {activeSection === "agent-cast" && <AgentCast />}
            {activeSection === "agent-mesh" && <AgentMeshPage />}
            {activeSection === "agents" && <AgentsPage />}
            {activeSection === "human-agents" && <HumanAgentsPage />}

            {/* P2P Network */}
            {(activeSection === "p2p-network" || activeSection === "p2p-network-alt") && <P2pNetworkPage />}
            {(activeSection === "network-monitor" || activeSection === "network-monitor-alt") && <NetworkMonitorPage />}

            {/* Compute & Resources */}
            {activeSection === "models" && <ModelsPage />}
            {activeSection === "compute-mesh" && <ComputeMeshPage />}
            {activeSection === "mcp-skills" && <McpSkillsPage />}
            {activeSection === "llm-mesh" && <LlmMeshPage />}

            {/* Knowledge Lake */}
            {(activeSection === "knowledge" || activeSection === "knowledge-graph") && <KnowledgePage />}
            {activeSection === "verification" && <VerificationPage />}
            {activeSection === "search" && <SearchPage />}

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

            {/* Semantic Intelligence & Federation */}
            {activeSection === "semantic-vote" && <SemanticVote onSubmit={(route) => navigate(`/agent-cast?route=${route}`)} />}
            {activeSection === "hivebear" && <HiveBearPanel />}
            {activeSection === "federation" && <FederationPanel />}

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

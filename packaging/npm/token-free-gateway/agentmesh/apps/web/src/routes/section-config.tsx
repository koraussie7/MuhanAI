import type { ComponentType } from "react";
import { Dashboard } from "../pages/dashboard/Dashboard";
import { NetworkPulse } from "../pages/dashboard/NetworkPulse";
import { HelpNeeded } from "../pages/dashboard/HelpNeeded";
import { VerifyMe } from "../pages/dashboard/VerifyMe";
import { TrendingQuestions } from "../pages/dashboard/TrendingQuestions";
import { HumanKnowledgeWanted } from "../pages/dashboard/HumanKnowledgeWanted";
import { UnsolvedProblems } from "../pages/dashboard/UnsolvedProblems";
import { AiVsHuman } from "../pages/dashboard/AiVsHuman";
import { RewardsDisplay } from "../pages/dashboard/RewardsDisplay";
import { TeachAI } from "../pages/dashboard/TeachAI";
import { AgentCast } from "../pages/mesh/AgentCast";
import { AgentMeshPage } from "../pages/mesh/AgentMeshPage";
import { AgentsPage } from "../pages/mesh/AgentsPage";
import { HumanAgentsPage } from "../pages/human/HumanAgentsPage";
import { KnowledgePage } from "../pages/knowledge/KnowledgePage";
import { KnowledgeGraphPage } from "../pages/knowledge/KnowledgeGraphPage";
import { SearchPage } from "../pages/knowledge/SearchPage";
import { VerificationPage } from "../pages/knowledge/VerificationPage";
import { LlmMeshPage } from "../pages/ai/LlmMeshPage";
import { ModelsPage } from "../pages/ai/ModelsPage";
import { McpSkillsPage } from "../pages/resources/McpSkillsPage";
import { ComputeMeshPage } from "../pages/resources/ComputeMeshPage";
import { P2pNetworkPage } from "../pages/resources/P2pNetworkPage";
import { MarketplacePage } from "../pages/marketplace/MarketplacePage";
import { TokenBankPage } from "../pages/economy/TokenBankPage";
import { ContributionsPage } from "../pages/economy/ContributionsPage";
import { ReputationPage } from "../pages/economy/ReputationPage";
import { ProjectsPage } from "../pages/workspace/ProjectsPage";
import { TasksPage } from "../pages/workspace/TasksPage";
import { WorkflowsPage } from "../pages/workspace/WorkflowsPage";
import { NetworkMonitorPage } from "../pages/system/NetworkMonitorPage";
import { SettingsPage } from "../pages/system/SettingsPage";

// Single source of truth for navigation: every section declares its route,
// labels, sidebar group and page component. The sidebar (via NavLink) and the
// router table are both generated from this list, so a section can never be
// declared but unreachable (the bug this replaces).

export interface NavGroup {
  id: string;
  label: string;
}

export interface SectionConfig {
  id: string;
  /** Router path. "/" is the dashboard home. */
  path: string;
  /** Title shown in the top bar. */
  label: string;
  /** Label shown in the sidebar. */
  navLabel: string;
  icon: string;
  component: ComponentType;
}

// Sidebar layout (§25): compact groups; network feed sections live on the
// Dashboard instead of the sidebar. Items reference sections by id, with an
// optional display-label override.
export const NAV_GROUPS: NavGroup[] = [
  { id: "network", label: "🔥 NETWORK" },
  { id: "intelligence", label: "🤖 INTELLIGENCE" },
  { id: "human", label: "👤 HUMAN" },
  { id: "resources", label: "⚡ RESOURCES" },
  { id: "marketplace", label: "🛒 MARKETPLACE" },
  { id: "economy", label: "💰 ECONOMY" },
  { id: "workspace", label: "WORKSPACE" },
  { id: "system", label: "⚙ SYSTEM" },
];

export interface SidebarItem {
  id: string;
  label?: string;
}

export const SIDEBAR: { group: string; items: SidebarItem[] }[] = [
  {
    group: "network",
    items: [
      { id: "dashboard", label: "Home" },
      { id: "help-needed", label: "Questions" },
      { id: "verify", label: "Verify" },
      { id: "unsolved", label: "Unsolved" },
    ],
  },
  {
    group: "intelligence",
    items: [
      { id: "agent-mesh" },
      { id: "agent-cast" },
      { id: "llm-mesh" },
      { id: "knowledge" },
    ],
  },
  {
    group: "human",
    items: [
      { id: "human-agents" },
      { id: "human-experts", label: "Experts" },
      { id: "teach-ai" },
    ],
  },
  {
    group: "resources",
    items: [
      { id: "mcp-skills" },
      { id: "compute-mesh", label: "Compute" },
      { id: "models" },
    ],
  },
  {
    group: "marketplace",
    items: [
      { id: "agents-market", label: "Agents" },
      { id: "human-experts", label: "Humans" },
      { id: "knowledge-market", label: "Knowledge" },
      { id: "compute-market", label: "Compute" },
    ],
  },
  {
    group: "economy",
    items: [{ id: "token-bank" }, { id: "contributions" }, { id: "reputation" }],
  },
  {
    group: "workspace",
    items: [{ id: "projects" }, { id: "tasks" }, { id: "workflows" }],
  },
  {
    group: "system",
    items: [{ id: "network-monitor" }, { id: "settings" }],
  },
];

export const SECTIONS: SectionConfig[] = [
  // ---- NETWORK ----
  { id: "dashboard", path: "/", label: "Dashboard", navLabel: "Dashboard", icon: "🏠", component: Dashboard },
  { id: "agent-mesh", path: "/agent-mesh", label: "Agent Mesh", navLabel: "Agent Mesh", icon: "🕸️", component: AgentMeshPage },
  { id: "agent-cast", path: "/agent-cast", label: "Agent Cast", navLabel: "Agent Cast", icon: "📡", component: AgentCast },
  { id: "agents", path: "/agents", label: "Agents", navLabel: "Agents", icon: "🤖", component: AgentsPage },
  { id: "human-agents", path: "/human-agents", label: "Human Agents", navLabel: "Human Agents", icon: "👤", component: HumanAgentsPage },
  { id: "p2p-network", path: "/p2p-network", label: "P2P Network", navLabel: "P2P Network", icon: "🌐", component: P2pNetworkPage },
  // Network feed sections — routed but surfaced inside the Dashboard, not the sidebar.
  { id: "network-pulse", path: "/network-pulse", label: "Network Pulse", navLabel: "Network Pulse", icon: "📊", component: NetworkPulse },
  { id: "help-needed", path: "/help-needed", label: "Help Needed", navLabel: "Help Needed", icon: "🔥", component: HelpNeeded },
  { id: "verify", path: "/verify", label: "Verify Me", navLabel: "Verify Me", icon: "🔎", component: VerifyMe },
  { id: "trending", path: "/trending", label: "Trending", navLabel: "Trending", icon: "📈", component: TrendingQuestions },
  { id: "human-knowledge", path: "/human-knowledge", label: "Human Knowledge Wanted", navLabel: "Human Knowledge", icon: "🧠", component: HumanKnowledgeWanted },
  { id: "unsolved", path: "/unsolved", label: "Unsolved Problems", navLabel: "Unsolved", icon: "⚔️", component: UnsolvedProblems },
  { id: "ai-vs-human", path: "/ai-vs-human", label: "AI vs Human", navLabel: "AI vs Human", icon: "🆚", component: AiVsHuman },
  { id: "rewards", path: "/rewards", label: "Rewards", navLabel: "Rewards", icon: "🏆", component: RewardsDisplay },
  { id: "teach-ai", path: "/teach-ai", label: "Teach AI", navLabel: "Teach AI", icon: "🎓", component: TeachAI },
  // ---- INTELLIGENCE ----
  { id: "knowledge", path: "/knowledge", label: "Knowledge", navLabel: "Knowledge", icon: "📚", component: KnowledgePage },
  { id: "knowledge-graph", path: "/knowledge-graph", label: "Knowledge Graph", navLabel: "Knowledge Graph", icon: "🕸️", component: KnowledgeGraphPage },
  { id: "search", path: "/search", label: "Search", navLabel: "Search", icon: "🔍", component: SearchPage },
  { id: "verification", path: "/verification", label: "Verification", navLabel: "Verification", icon: "✅", component: VerificationPage },
  // ---- AI RESOURCES ----
  { id: "llm-mesh", path: "/llm-mesh", label: "LLM Mesh", navLabel: "LLM Mesh", icon: "🧠", component: LlmMeshPage },
  { id: "mcp-skills", path: "/mcp-skills", label: "MCP / Skills", navLabel: "MCP / Skills", icon: "🔌", component: McpSkillsPage },
  { id: "compute-mesh", path: "/compute-mesh", label: "Compute Mesh", navLabel: "Compute Mesh", icon: "⚡", component: ComputeMeshPage },
  { id: "models", path: "/models", label: "Models", navLabel: "Models", icon: "📦", component: ModelsPage },
  // ---- MARKETPLACE ----
  { id: "agents-market", path: "/marketplace/agents", label: "Agents Marketplace", navLabel: "Agents", icon: "🤖", component: MarketplacePage },
  { id: "human-experts", path: "/marketplace/human-experts", label: "Human Experts", navLabel: "Human Experts", icon: "👤", component: MarketplacePage },
  { id: "mcp-market", path: "/marketplace/mcp", label: "MCP Marketplace", navLabel: "MCP", icon: "🔌", component: MarketplacePage },
  { id: "knowledge-market", path: "/marketplace/knowledge", label: "Knowledge Marketplace", navLabel: "Knowledge", icon: "📚", component: MarketplacePage },
  { id: "compute-market", path: "/marketplace/compute", label: "Compute Marketplace", navLabel: "Compute", icon: "⚡", component: MarketplacePage },
  // ---- ECONOMY ----
  { id: "token-bank", path: "/token-bank", label: "Token Bank", navLabel: "Token Bank", icon: "💰", component: TokenBankPage },
  { id: "contributions", path: "/contributions", label: "Contributions", navLabel: "Contributions", icon: "📊", component: ContributionsPage },
  { id: "reputation", path: "/reputation", label: "Reputation", navLabel: "Reputation", icon: "⭐", component: ReputationPage },
  // ---- WORKSPACE ----
  { id: "projects", path: "/projects", label: "Projects", navLabel: "Projects", icon: "📁", component: ProjectsPage },
  { id: "tasks", path: "/tasks", label: "Tasks", navLabel: "Tasks", icon: "✓", component: TasksPage },
  { id: "workflows", path: "/workflows", label: "Workflows", navLabel: "Workflows", icon: "🔄", component: WorkflowsPage },
  // ---- SYSTEM ----
  { id: "network-monitor", path: "/network-monitor", label: "Network Monitor", navLabel: "Network Monitor", icon: "📈", component: NetworkMonitorPage },
  { id: "settings", path: "/settings", label: "Settings", navLabel: "Settings", icon: "⚙️", component: SettingsPage },
];

export interface SidebarEntry {
  section: SectionConfig;
  label: string;
}

/** Sidebar structure: groups with their visible sections, in layout order. */
export function sidebarSections(): { group: NavGroup; items: SidebarEntry[] }[] {
  return SIDEBAR.map(({ group, items }) => ({
    group: NAV_GROUPS.find((g) => g.id === group)!,
    items: items.map(({ id, label }) => {
      const section = SECTIONS.find((s) => s.id === id)!;
      return { section, label: label ?? section.navLabel };
    }),
  })).filter((entry) => entry.items.length > 0);
}

/** Resolve a section by router pathname (falls back to the dashboard). */
export function sectionByPath(pathname: string): SectionConfig {
  return (
    SECTIONS.find((s) => s.path === pathname) ??
    SECTIONS.find((s) => s.id === "dashboard")!
  );
}

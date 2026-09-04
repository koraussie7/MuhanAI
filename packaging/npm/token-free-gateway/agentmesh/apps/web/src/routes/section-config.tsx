import type { ComponentType } from "react";
import { Dashboard } from "../components/Dashboard";
import { AgentCast } from "../components/AgentCast";
import { NetworkPulse } from "../components/NetworkPulse";
import { HelpNeeded } from "../components/HelpNeeded";
import { VerifyMe } from "../components/VerifyMe";
import { TrendingQuestions } from "../components/TrendingQuestions";
import { HumanKnowledgeWanted } from "../components/HumanKnowledgeWanted";
import { UnsolvedProblems } from "../components/UnsolvedProblems";
import { AiVsHuman } from "../components/AiVsHuman";
import { RewardsDisplay } from "../components/RewardsDisplay";
import { TeachAI } from "../components/TeachAI";
import {
  AgentMeshPage,
  ComputeMeshPage,
  LlmMeshPage,
  MarketplacePage,
  NetworkMonitorPage,
  P2pNetworkPage,
  TokenBankPage,
  VerificationPage,
} from "../components/DashPages";
import {
  AgentsPage,
  ContributionsPage,
  HumanAgentsPage,
  KnowledgeGraphPage,
  KnowledgePage,
  McpSkillsPage,
  ModelsPage,
  ProjectsPage,
  ReputationPage,
  SearchPage,
  SettingsPage,
  TasksPage,
  WorkflowsPage,
} from "../components/SpecPages";

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
  /** Sidebar group id; sections with group "" are routed but not in the sidebar. */
  group: string;
  component: ComponentType;
}

export const NAV_GROUPS: NavGroup[] = [
  { id: "network", label: "NETWORK" },
  { id: "intelligence", label: "INTELLIGENCE" },
  { id: "resources", label: "AI RESOURCES" },
  { id: "marketplace", label: "MARKETPLACE" },
  { id: "economy", label: "ECONOMY" },
  { id: "workspace", label: "WORKSPACE" },
  { id: "system", label: "SYSTEM" },
];

export const SECTIONS: SectionConfig[] = [
  // ---- NETWORK ----
  { id: "dashboard", path: "/", label: "Dashboard", navLabel: "Dashboard", icon: "🏠", group: "network", component: Dashboard },
  { id: "agent-mesh", path: "/agent-mesh", label: "Agent Mesh", navLabel: "Agent Mesh", icon: "🕸️", group: "network", component: AgentMeshPage },
  { id: "agent-cast", path: "/agent-cast", label: "Agent Cast", navLabel: "Agent Cast", icon: "📡", group: "network", component: AgentCast },
  { id: "agents", path: "/agents", label: "Agents", navLabel: "Agents", icon: "🤖", group: "network", component: AgentsPage },
  { id: "human-agents", path: "/human-agents", label: "Human Agents", navLabel: "Human Agents", icon: "👤", group: "network", component: HumanAgentsPage },
  { id: "p2p-network", path: "/p2p-network", label: "P2P Network", navLabel: "P2P Network", icon: "🌐", group: "network", component: P2pNetworkPage },
  // Network feed sections — routed but surfaced inside the Dashboard, not the sidebar.
  { id: "network-pulse", path: "/network-pulse", label: "Network Pulse", navLabel: "Network Pulse", icon: "📊", group: "", component: NetworkPulse },
  { id: "help-needed", path: "/help-needed", label: "Help Needed", navLabel: "Help Needed", icon: "🔥", group: "", component: HelpNeeded },
  { id: "verify", path: "/verify", label: "Verify Me", navLabel: "Verify Me", icon: "🔎", group: "", component: VerifyMe },
  { id: "trending", path: "/trending", label: "Trending", navLabel: "Trending", icon: "📈", group: "", component: TrendingQuestions },
  { id: "human-knowledge", path: "/human-knowledge", label: "Human Knowledge Wanted", navLabel: "Human Knowledge", icon: "🧠", group: "", component: HumanKnowledgeWanted },
  { id: "unsolved", path: "/unsolved", label: "Unsolved Problems", navLabel: "Unsolved", icon: "⚔️", group: "", component: UnsolvedProblems },
  { id: "ai-vs-human", path: "/ai-vs-human", label: "AI vs Human", navLabel: "AI vs Human", icon: "🆚", group: "", component: AiVsHuman },
  { id: "rewards", path: "/rewards", label: "Rewards", navLabel: "Rewards", icon: "🏆", group: "", component: RewardsDisplay },
  { id: "teach-ai", path: "/teach-ai", label: "Teach AI", navLabel: "Teach AI", icon: "🎓", group: "", component: TeachAI },
  // ---- INTELLIGENCE ----
  { id: "knowledge", path: "/knowledge", label: "Knowledge", navLabel: "Knowledge", icon: "📚", group: "intelligence", component: KnowledgePage },
  { id: "knowledge-graph", path: "/knowledge-graph", label: "Knowledge Graph", navLabel: "Knowledge Graph", icon: "🕸️", group: "intelligence", component: KnowledgeGraphPage },
  { id: "search", path: "/search", label: "Search", navLabel: "Search", icon: "🔍", group: "intelligence", component: SearchPage },
  { id: "verification", path: "/verification", label: "Verification", navLabel: "Verification", icon: "✅", group: "intelligence", component: VerificationPage },
  // ---- AI RESOURCES ----
  { id: "llm-mesh", path: "/llm-mesh", label: "LLM Mesh", navLabel: "LLM Mesh", icon: "🧠", group: "resources", component: LlmMeshPage },
  { id: "mcp-skills", path: "/mcp-skills", label: "MCP / Skills", navLabel: "MCP / Skills", icon: "🔌", group: "resources", component: McpSkillsPage },
  { id: "compute-mesh", path: "/compute-mesh", label: "Compute Mesh", navLabel: "Compute Mesh", icon: "⚡", group: "resources", component: ComputeMeshPage },
  { id: "models", path: "/models", label: "Models", navLabel: "Models", icon: "📦", group: "resources", component: ModelsPage },
  // ---- MARKETPLACE ----
  { id: "agents-market", path: "/marketplace/agents", label: "Agents Marketplace", navLabel: "Agents", icon: "🤖", group: "marketplace", component: MarketplacePage },
  { id: "human-experts", path: "/marketplace/human-experts", label: "Human Experts", navLabel: "Human Experts", icon: "👤", group: "marketplace", component: MarketplacePage },
  { id: "mcp-market", path: "/marketplace/mcp", label: "MCP Marketplace", navLabel: "MCP", icon: "🔌", group: "marketplace", component: MarketplacePage },
  { id: "knowledge-market", path: "/marketplace/knowledge", label: "Knowledge Marketplace", navLabel: "Knowledge", icon: "📚", group: "marketplace", component: MarketplacePage },
  { id: "compute-market", path: "/marketplace/compute", label: "Compute Marketplace", navLabel: "Compute", icon: "⚡", group: "marketplace", component: MarketplacePage },
  // ---- ECONOMY ----
  { id: "token-bank", path: "/token-bank", label: "Token Bank", navLabel: "Token Bank", icon: "💰", group: "economy", component: TokenBankPage },
  { id: "contributions", path: "/contributions", label: "Contributions", navLabel: "Contributions", icon: "📊", group: "economy", component: ContributionsPage },
  { id: "reputation", path: "/reputation", label: "Reputation", navLabel: "Reputation", icon: "⭐", group: "economy", component: ReputationPage },
  // ---- WORKSPACE ----
  { id: "projects", path: "/projects", label: "Projects", navLabel: "Projects", icon: "📁", group: "workspace", component: ProjectsPage },
  { id: "tasks", path: "/tasks", label: "Tasks", navLabel: "Tasks", icon: "✓", group: "workspace", component: TasksPage },
  { id: "workflows", path: "/workflows", label: "Workflows", navLabel: "Workflows", icon: "🔄", group: "workspace", component: WorkflowsPage },
  // ---- SYSTEM ----
  { id: "network-monitor", path: "/network-monitor", label: "Network Monitor", navLabel: "Network Monitor", icon: "📈", group: "system", component: NetworkMonitorPage },
  { id: "settings", path: "/settings", label: "Settings", navLabel: "Settings", icon: "⚙️", group: "system", component: SettingsPage },
];

/** Sidebar structure: groups with their visible sections, in declaration order. */
export function sidebarSections(): { group: NavGroup; items: SectionConfig[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: SECTIONS.filter((s) => s.group === group.id),
  })).filter((entry) => entry.items.length > 0);
}

/** Resolve a section by router pathname (falls back to the dashboard). */
export function sectionByPath(pathname: string): SectionConfig {
  return (
    SECTIONS.find((s) => s.path === pathname) ??
    SECTIONS.find((s) => s.id === "dashboard")!
  );
}

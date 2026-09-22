export type RouteGroup =
	| "core"
	| "network"
	| "resources"
	| "knowledge"
	| "marketplace"
	| "economy"
	| "workspace"
	| "system";

export interface RouteDefinition {
	id: string;
	path: string;
	group: RouteGroup;
	label: string;
	iconKey: string;
	badge?: string;
	page: string;
}

/** Single source of truth for navigation, routing, translations, and lazy pages. */
export const ROUTES: readonly RouteDefinition[] = [
	{
		id: "dashboard",
		path: "/dashboard",
		group: "core",
		label: "Dashboard",
		iconKey: "layout-dashboard",
		page: "dashboard",
	},
	{
		id: "find",
		path: "/",
		group: "core",
		label: "Cosmic Mesh",
		iconKey: "search",
		badge: "NEW",
		page: "find",
	},
	{
		id: "agent-cast",
		path: "/agent-cast",
		group: "core",
		label: "Agent Cast",
		iconKey: "radio",
		badge: "LIVE",
		page: "agent-cast",
	},
	{
		id: "agent-mesh",
		path: "/agent-mesh",
		group: "core",
		label: "Agent Mesh",
		iconKey: "bot",
		page: "agent-mesh",
	},
	{
		id: "desktop",
		path: "/desktop",
		group: "core",
		label: "Web Desktop",
		iconKey: "monitor",
		badge: "DaedalOS",
		page: "desktop",
	},
	{
		id: "bitterbot",
		path: "/bitterbot",
		group: "core",
		label: "Bitterbot Agent",
		iconKey: "package",
		badge: "Beta",
		page: "bitterbot",
	},
	{
		id: "agents",
		path: "/agents",
		group: "core",
		label: "Agents",
		iconKey: "bot",
		page: "agents",
	},
	{
		id: "human-agents",
		path: "/human-agents",
		group: "core",
		label: "Human Agents",
		iconKey: "users",
		page: "human-agents",
	},
	{
		id: "p2p-network",
		path: "/network",
		group: "network",
		label: "P2P Nodes",
		iconKey: "network",
		page: "p2p-network",
	},
	{
		id: "network-monitor",
		path: "/monitor",
		group: "network",
		label: "Telemetry & Pulse",
		iconKey: "activity",
		page: "network-monitor",
	},
	{
		id: "models",
		path: "/models",
		group: "resources",
		label: "LLM Models",
		iconKey: "sparkles",
		badge: "Token-Free",
		page: "models",
	},
	{
		id: "compute-mesh",
		path: "/compute-mesh",
		group: "resources",
		label: "Compute Mesh",
		iconKey: "cpu",
		page: "compute-mesh",
	},
	{
		id: "mcp-skills",
		path: "/mcp-skills",
		group: "resources",
		label: "MCP Tools",
		iconKey: "layers",
		page: "mcp-skills",
	},
	{
		id: "hivebear",
		path: "/hivebear",
		group: "resources",
		label: "HiveBear Mesh",
		iconKey: "git-branch",
		page: "hivebear",
	},
	{
		id: "knowledge",
		path: "/knowledge",
		group: "knowledge",
		label: "Knowledge Graph",
		iconKey: "database",
		page: "knowledge",
	},
	{
		id: "verification",
		path: "/verification",
		group: "knowledge",
		label: "Verification",
		iconKey: "check-circle",
		page: "verification",
	},
	{
		id: "search",
		path: "/search",
		group: "knowledge",
		label: "Mesh Search",
		iconKey: "search",
		page: "search",
	},
	{
		id: "semantic-vote",
		path: "/semantic-vote",
		group: "knowledge",
		label: "Semantic Vote",
		iconKey: "vote",
		page: "semantic-vote",
	},
	{
		id: "federation",
		path: "/federation",
		group: "knowledge",
		label: "Federation",
		iconKey: "git-merge",
		page: "federation",
	},
	{
		id: "agents-market",
		path: "/marketplace/agents",
		group: "marketplace",
		label: "Agent Hub",
		iconKey: "bot",
		page: "agents-market",
	},
	{
		id: "human-experts",
		path: "/marketplace/human-experts",
		group: "marketplace",
		label: "Human Experts",
		iconKey: "users",
		page: "human-experts",
	},
	{
		id: "compute-market",
		path: "/marketplace/compute",
		group: "marketplace",
		label: "Compute Market",
		iconKey: "cpu",
		page: "compute-market",
	},
	{
		id: "mcp-market",
		path: "/marketplace/mcp",
		group: "marketplace",
		label: "MCP Marketplace",
		iconKey: "layers",
		page: "mcp-market",
	},
	{
		id: "knowledge-market",
		path: "/marketplace/knowledge",
		group: "marketplace",
		label: "Knowledge Market",
		iconKey: "book-open",
		page: "knowledge-market",
	},
	{
		id: "token-bank",
		path: "/token-bank",
		group: "economy",
		label: "Token Bank",
		iconKey: "coins",
		page: "token-bank",
	},
	{
		id: "contributions",
		path: "/contributions",
		group: "economy",
		label: "Contributions",
		iconKey: "activity",
		page: "contributions",
	},
	{
		id: "reputation",
		path: "/reputation",
		group: "economy",
		label: "Reputation",
		iconKey: "star",
		page: "reputation",
	},
	{
		id: "projects",
		path: "/projects",
		group: "workspace",
		label: "Projects",
		iconKey: "folder-git",
		page: "projects",
	},
	{
		id: "tasks",
		path: "/tasks",
		group: "workspace",
		label: "Tasks",
		iconKey: "list-todo",
		page: "tasks",
	},
	{
		id: "workflows",
		path: "/workflows",
		group: "workspace",
		label: "Workflows",
		iconKey: "git-branch",
		page: "workflows",
	},
	{
		id: "settings",
		path: "/settings",
		group: "system",
		label: "Security & Keys",
		iconKey: "settings",
		page: "settings",
	},
	{
		id: "happy",
		path: "/happy",
		group: "system",
		label: "Happy Coder",
		iconKey: "smartphone",
		badge: "NEW",
		page: "happy",
	},
	{
		id: "pythia",
		path: "/pythia",
		group: "system",
		label: "Pythia",
		iconKey: "python",
		badge: "NEW",
		page: "pythia",
	},
	{
		id: "world",
		path: "/world",
		group: "system",
		label: "World",
		iconKey: "activity",
		badge: "NEW",
		page: "world",
	},
];

export const ROUTE_COUNT = ROUTES.length;

export function routeById(id: string): RouteDefinition | undefined {
	return ROUTES.find((route) => route.id === id);
}

export function routeByPath(path: string): RouteDefinition | undefined {
	const cleanPath = path.split("?")[0] || "/";
	return ROUTES.find((route) => route.path === cleanPath);
}

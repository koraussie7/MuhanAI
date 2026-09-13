/**
 * Pure data + matching logic for the MuhanAI sidebar.
 *
 * Kept in its own module (no React imports) so that node:test can run
 * unit tests on the match rules without needing jsdom or
 * @testing-library/react. The Sidebar component imports from here.
 */

export interface NavItem {
	id: string;
	label: string;
	path: string;
	iconKey: string;
	badge?: string;
}

export interface NavGroup {
	id: string;
	title: string;
	items: NavItem[];
}

/**
 * Source-of-truth navigation definition. Icons are referenced by key
 * (e.g. 'layout-dashboard') instead of React elements so this file
 * is portable to non-React runtimes and to tests.
 *
 * Keep this in lockstep with the sidebar's visual presentation; the
 * Sidebar component is the only consumer.
 *
 * This MUST stay in sync with App.tsx SECTIONS array.
 */
export const NAV_GROUPS: NavGroup[] = [
	{
		id: "core",
		title: "Core & Chat",
		items: [
			{
				id: "dashboard",
				label: "Dashboard",
				path: "/dashboard",
				iconKey: "layout-dashboard",
			},
			{
				id: "find",
				label: "Cosmic Mesh",
				path: "/",
				iconKey: "search",
				badge: "NEW",
			},
			{
				id: "agent-cast",
				label: "Agent Cast",
				path: "/agent-cast",
				iconKey: "radio",
				badge: "LIVE",
			},
			{
				id: "agent-mesh",
				label: "Agent Mesh",
				path: "/agent-mesh",
				iconKey: "bot",
			},
				{
			id: "desktop",
			label: "Web Desktop",
			path: "/desktop",
			iconKey: "monitor",
			badge: "DaedalOS",
			},
			{
			id: "bitterbot",
			label: "Bitterbot Agent",
			path: "/bitterbot",
			iconKey: "package",
			badge: "Beta",
			},
			],
	},
	{
		id: "network",
		title: "P2P Network",
		items: [
			{
				id: "p2p-network",
				label: "P2P Nodes",
				path: "/network",
				iconKey: "network",
			},
			{
				id: "network-monitor",
				label: "Telemetry & Pulse",
				path: "/monitor",
				iconKey: "activity",
			},
		],
	},
	{
		id: "resources",
		title: "Compute & Models",
		items: [
			{
				id: "models",
				label: "LLM Models",
				path: "/models",
				iconKey: "sparkles",
				badge: "Token-Free",
			},
			{
				id: "compute-mesh",
				label: "Compute Mesh",
				path: "/compute-mesh",
				iconKey: "cpu",
			},
			{
				id: "mcp-skills",
				label: "MCP Tools",
				path: "/mcp-skills",
				iconKey: "layers",
			},
			{
				id: "hivebear",
				label: "HiveBear Mesh",
				path: "/hivebear",
				iconKey: "git-branch",
			},
		],
	},
	{
		id: "intelligence",
		title: "Intelligence",
		items: [
			{
				id: "knowledge",
				label: "Knowledge Graph",
				path: "/knowledge",
				iconKey: "database",
			},
			{
				id: "verification",
				label: "Verification",
				path: "/verification",
				iconKey: "check-circle",
			},
			{
				id: "search",
				label: "Mesh Search",
				path: "/search",
				iconKey: "search",
			},
			{
				id: "semantic-vote",
				label: "Semantic Vote",
				path: "/semantic-vote",
				iconKey: "vote",
			},
			{
				id: "federation",
				label: "Federation",
				path: "/federation",
				iconKey: "git-merge",
			},
		],
	},
	{
		id: "marketplace",
		title: "Marketplace",
		items: [
			{
				id: "agents-market",
				label: "Agent Hub",
				path: "/marketplace/agents",
				iconKey: "bot",
			},
			{
				id: "human-experts",
				label: "Human Experts",
				path: "/marketplace/human-experts",
				iconKey: "users",
			},
			{
				id: "compute-market",
				label: "Compute Market",
				path: "/marketplace/compute",
				iconKey: "cpu",
			},
			{
				id: "mcp-market",
				label: "MCP Marketplace",
				path: "/marketplace/mcp",
				iconKey: "layers",
			},
			{
				id: "knowledge-market",
				label: "Knowledge Market",
				path: "/marketplace/knowledge",
				iconKey: "book-open",
			},
		],
	},
	{
		id: "economy",
		title: "Economy",
		items: [
			{
				id: "token-bank",
				label: "Token Bank",
				path: "/token-bank",
				iconKey: "coins",
			},
			{
				id: "contributions",
				label: "Contributions",
				path: "/contributions",
				iconKey: "activity",
			},
			{
				id: "reputation",
				label: "Reputation",
				path: "/reputation",
				iconKey: "star",
			},
		],
	},
	{
		id: "workspace",
		title: "Workspace",
		items: [
			{
				id: "projects",
				label: "Projects",
				path: "/projects",
				iconKey: "folder-git",
			},
			{
				id: "tasks",
				label: "Tasks",
				path: "/tasks",
				iconKey: "list-todo",
			},
			{
				id: "workflows",
				label: "Workflows",
				path: "/workflows",
				iconKey: "git-branch",
			},
		],
	},
	{
		id: "system",
		title: "Settings",
		items: [
			{
				id: "settings",
				label: "Security & Keys",
				path: "/settings",
				iconKey: "settings",
			},
			{
				id: "happy",
				label: "Happy Coder",
				path: "/happy",
				iconKey: "smartphone",
				badge: "NEW",
			},
		],
	},
];

/**
 * Decide whether a nav item is the "currently active" one for a given URL.
 *
 * Rules:
 *   - Exact match always wins (handles `/` dashboard correctly without
 *     falsely matching every other path via `startsWith`).
 *   - For non-root items, a path-segment match is required so that
 *     `/marketplace/agents-foo` does NOT activate the `/marketplace/agents`
 *     button (the old `startsWith` rule had this false-positive bug).
 *   - Query strings (`?q=...`) on `activePath` are stripped first because
 *     the router pushes `search?q=...` not just `/search`.
 */
export function isNavItemActive(itemPath: string, activePath: string): boolean {
	if (itemPath === activePath) return true;
	const cleanItem = itemPath.split("?")[0] ?? "/";
	const cleanActive = activePath.split("?")[0] ?? "/";
	if (cleanActive === cleanItem) {
		// If item has query params (e.g. /desktop?app=bitterbot), check them
		if (itemPath.includes("?")) {
			return itemPath === activePath;
		}
		return true;
	}
	if (cleanItem === "/") return false;
	return cleanActive.startsWith(`${cleanItem}/`);
}
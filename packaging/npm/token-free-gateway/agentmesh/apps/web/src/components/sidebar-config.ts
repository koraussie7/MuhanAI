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

import { ROUTES } from "../routes.js";

export interface NavGroup {
	id: string;
	title: string;
	items: NavItem[];
}

/**
 * Sidebar groups are derived from the route registry (routes.ts),
 * the single source of truth for navigation, routing, and lazy pages.
 * Icons are referenced by key (e.g. 'layout-dashboard') instead of React
 * elements so this file stays portable to non-React runtimes and tests.
 */

const GROUP_TITLES: Record<string, string> = {
	core: "Core & Chat",
	network: "P2P Network",
	resources: "Compute & Models",
	knowledge: "Knowledge Lake",
	marketplace: "Marketplace",
	economy: "Economy",
	workspace: "Workspace",
	system: "Settings",
};

/** Sidebar groups are derived from the route registry, not maintained separately. */
export const NAV_GROUPS: NavGroup[] = Object.entries(
	ROUTES.reduce<Record<string, NavItem[]>>((groups, route) => {
		(groups[route.group] ??= []).push({
			id: route.id,
			label: route.label,
			path: route.path,
			iconKey: route.iconKey,
			badge: route.badge,
		});
		return groups;
	}, {}),
).map(([id, items]) => ({ id, title: GROUP_TITLES[id] ?? id, items }));

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

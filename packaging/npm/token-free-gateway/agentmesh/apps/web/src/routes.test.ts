import assert from "node:assert/strict";
import { test } from "node:test";
import { NAV_GROUPS } from "./components/sidebar-config.js";
import { ROUTE_COUNT, ROUTES, routeByPath } from "./routes.js";

test("route registry has unique ids and paths", () => {
	assert.equal(ROUTE_COUNT, 30);
	assert.equal(new Set(ROUTES.map((route) => route.id)).size, ROUTE_COUNT);
	assert.equal(new Set(ROUTES.map((route) => route.path)).size, ROUTE_COUNT);
	assert.equal(new Set(ROUTES.map((route) => route.page)).size, ROUTE_COUNT);
	assert.ok(ROUTES.every((route) => route.page === route.id));
});

test("sidebar is derived from every registered route", () => {
	const sidebarRoutes = NAV_GROUPS.flatMap((group) => group.items);
	assert.deepEqual(
		sidebarRoutes.map((item) => item.id),
		ROUTES.map((route) => route.id),
	);
	assert.deepEqual(
		sidebarRoutes.map((item) => item.path),
		ROUTES.map((route) => route.path),
	);
});

test("route lookup ignores query strings", () => {
	assert.equal(routeByPath("/search?q=mesh")?.id, "search");
	assert.equal(routeByPath("/bitterbot?mode=run")?.id, "bitterbot");
});

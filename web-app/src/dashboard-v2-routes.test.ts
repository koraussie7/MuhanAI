/**
 * The v2 dashboard is one static file served from /dashboard2 (plus the
 * trailing-slash variant). The rule exists in three places — this Vite
 * middleware (dev), the Cloudflare Worker (muhanai.com production), and the
 * Caddy/nginx configs (110 origin) — so a path added in one and missed in
 * another shows up as a page that works locally and 404s in production.
 * These tests pin the dev-server half of that contract; the deploy configs
 * are checked by grep in the sanitize/dashboard test.
 *
 * `/dashboard` stays with the React SPA (`<Dashboard>` component): it must
 * fall through to the SPA while `/dashboard2` serves the v2 page and
 * `/dashboard2x`, `/dashboarding` and friends keep falling through too.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { DASHBOARD_V2_ROUTES, dashboardV2Plugin } from "../vite.config.js";

type Middleware = (
	req: { url?: string },
	res: ReturnType<typeof fakeResponse>,
	next: () => void,
) => void | Promise<void>;

/** Minimal `res` double — records what the middleware wrote. */
function fakeResponse() {
	const headers: Record<string, string> = {};
	return {
		statusCode: 0,
		headers,
		body: "",
		setHeader(name: string, value: string) {
			headers[name.toLowerCase()] = value;
		},
		end(chunk?: string) {
			this.body = chunk ?? "";
		},
	};
}

/** Capture the middleware `dashboardV2Plugin` installs on the dev server. */
function captureMiddleware(): Middleware {
	const plugin = dashboardV2Plugin();
	let handler: Middleware | undefined;
	const server = {
		middlewares: {
			use(fn: Middleware) {
				handler = fn;
			},
		},
	};
	// `configureServer` is an object-hook in Vite's types but this plugin only
	// ever uses the function form.
	const hook = plugin.configureServer as (s: unknown) => void;
	hook(server);
	assert.ok(handler, "plugin did not install a middleware");
	return handler;
}

test("dashboard v2 route list covers only /dashboard2 (dashboard stays SPA)", () => {
	assert.deepEqual([...DASHBOARD_V2_ROUTES].sort(), ["/dashboard2", "/dashboard2/"]);
});

for (const route of DASHBOARD_V2_ROUTES) {
	test(`dev server serves the v2 page for ${route}`, async () => {
		const res = fakeResponse();
		let nextCalled = false;
		await captureMiddleware()({ url: route }, res, () => {
			nextCalled = true;
		});
		assert.equal(nextCalled, false, `${route} fell through to the SPA`);
		assert.equal(res.statusCode, 200);
		assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
		assert.match(res.body, /space-nav/, `${route} served the SPA shell, not v2`);
	});
}

test("dev server matches the v2 routes with a query string attached", async () => {
	const res = fakeResponse();
	let nextCalled = false;
	await captureMiddleware()({ url: "/dashboard2?tab=quorum" }, res, () => {
		nextCalled = true;
	});
	assert.equal(nextCalled, false);
	assert.equal(res.statusCode, 200);
	assert.match(res.body, /space-nav/);
});

test("dev server leaves /dashboard and near-miss paths for the SPA", async () => {
	for (const url of ["/", "/dashboard", "/dashboard/", "/dashboard2x", "/dashboarding", "/dashboard-v2.html"]) {
		const res = fakeResponse();
		let nextCalled = false;
		await captureMiddleware()({ url }, res, () => {
			nextCalled = true;
		});
		assert.equal(nextCalled, true, `${url} should not be served the v2 page`);
		assert.equal(res.statusCode, 0, `${url} was written to`);
	}
});
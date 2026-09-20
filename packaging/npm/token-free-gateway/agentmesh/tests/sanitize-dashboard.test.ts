/**
 * Dashboard v2 — published-artifact sanitizer.
 *
 * `packaging/muhanai-dashboard-v2.html` is an OpenDesign canvas export. Before
 * it is published to muhanai.com/dashboard the host scaffolding (sandbox shim,
 * tweaks bridge, snapshot bridge, srcdoc transport, canvas breadcrumbs) has to
 * come out — `deploy/sanitize-dashboard-v2.mjs` documents why each one matters.
 *
 * The integration block at the bottom is the load-bearing one: it fails when a
 * published copy drifts from the canonical export. That drift is not academic —
 * the scaffolded page replaces `localStorage` with an in-memory stub, so a
 * stale deploy silently loses every BYOK key the operator saves.
 *
 * The final block cross-checks the *URL* rules that publish that file. The
 * `dashboard-v2.html` page answers on `/dashboard` and `/dashboard2`, and that
 * mapping is written down three times — Vite middleware for dev, Caddy and
 * nginx for production. A path added to one and missed in another gives a page
 * that renders locally and 404s in production, so the deploy configs are
 * grepped against the Vite config's `DASHBOARD_V2_ROUTES` list here.
 *
 * Run with `pnpm test tests/sanitize-dashboard.test.ts`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// The sanitizer is plain ESM (no .d.ts) so it can be run directly by bun/node.
import {
	CANONICAL_SOURCE,
	TARGETS,
	countScaffolding,
	sanitizeDashboardHtml,
} from "../deploy/sanitize-dashboard-v2.mjs";

/** `CANONICAL_SOURCE` is `<repo-root>/packaging/muhanai-dashboard-v2.html`. */
const REPO_ROOT = resolve(CANONICAL_SOURCE, "..", "..");
const DEPLOY_DIR = resolve(
	REPO_ROOT,
	"packaging",
	"npm",
	"token-free-gateway",
	"agentmesh",
	"deploy",
);
const VITE_CONFIG = resolve(REPO_ROOT, "web-app", "vite.config.ts");
const CADDYFILE = resolve(DEPLOY_DIR, "Caddyfile.muhanai");
const NGINX_CONF = resolve(DEPLOY_DIR, "muhanai.com.nginx.conf");
// Both scripts carry a hand-maintained copy of the `@dashboard` matcher: one as
// the site block it appends to a fresh Caddyfile, the other as the snippet it
// splices into a live one. Neither is read by the dev server, so they drift
// silently unless they are grepped here too.
const SETUP_CADDY_SH = resolve(DEPLOY_DIR, "setup-caddy-muhanai.sh");
const INJECT_DASHBOARD_SH = resolve(DEPLOY_DIR, "inject-dashboard-v2.sh");

/**
 * The dashboard paths as the dev server defines them. Read from source rather
 * than imported: the Vite config is a TypeScript module in a different
 * workspace, and the point of the check is to compare the two *texts* anyway.
 */
function viteDashboardRoutes(): string[] {
	const block = readFileSync(VITE_CONFIG, "utf8").match(
		/DASHBOARD_V2_ROUTES\s*=\s*\[([^\]]*)\]/,
	)?.[1];
	if (block === undefined) {
		throw new Error(`DASHBOARD_V2_ROUTES array not found in ${VITE_CONFIG}`);
	}
	return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

/**
 * One of every artefact the sanitizer must remove, interleaved with page
 * content it must keep. Kept as an array so the intent of each line is
 * greppable and no template escaping is needed.
 */
const FIXTURE = [
	"<!doctype html>",
	'<html lang="ko"><head>',
	// 1. sandbox shim — fakes localStorage/sessionStorage in the tool iframe.
	'<script data-od-sandbox-shim="">(function(){window.__stub=1})();</script>',
	// Real page style — must survive untouched.
	"<style>.real { color: red; }</style>",
	// 2. tweaks bridge — style half and script half are separate elements.
	'<style data-od-tweaks-bridge-style="">.tw-panel { opacity: 0; }</style>',
	'<script data-od-tweaks-bridge="">(function(){document.documentElement.setAttribute("data-od-tweaks-hidden","")})();</script>',
	"<title>muhanai — 메시 오퍼레이터</title>",
	"</head><body>",
	// 5. canvas breadcrumbs — attribute only, elements stay.
	'<div class="app-shell" data-od-id="shell">',
	'<button class="nav-item" data-space="mesh" data-od-id="path-0-0-2-0">코스믹 메시</button>',
	"</div>",
	// 3. snapshot bridge — canvas DOM reporter.
	'<script data-od-snapshot-bridge="">(function(){})();</script>',
	// Real page script — must survive, including the IIFE wrapper.
	"<script>(function(){ const state = { model: 'auto' }; })();</script>",
	// 4. srcdoc transport — waits for a postMessage that never arrives in prod.
	'<script data-od-srcdoc-transport-activation="">(function(){})();</script>',
	"</body></html>",
].join("\n");

describe("sanitizeDashboardHtml", () => {
	const sanitized = sanitizeDashboardHtml(FIXTURE);

	it("removes every host bridge and breadcrumb", () => {
		expect(countScaffolding(FIXTURE)).toEqual({ tagged: 6, breadcrumbs: 2 });
		expect(countScaffolding(sanitized)).toEqual({ tagged: 0, breadcrumbs: 0 });
		expect(sanitized).not.toContain("data-od-");
	});

	it("keeps the page's own markup, styles and scripts", () => {
		expect(sanitized).toContain("<style>.real { color: red; }</style>");
		expect(sanitized).toContain("<title>muhanai — 메시 오퍼레이터</title>");
		expect(sanitized).toContain('<button class="nav-item" data-space="mesh">코스믹 메시</button>');
		expect(sanitized).toContain("const state = { model: 'auto' };");
	});

	it("leaves the document structure intact", () => {
		expect(sanitized.startsWith("<!doctype html>\n<html lang=\"ko\"><head>\n")).toBe(true);
		expect(sanitized.trimEnd().endsWith("</body></html>")).toBe(true);
	});

	it("is idempotent", () => {
		expect(sanitizeDashboardHtml(sanitized)).toBe(sanitized);
	});

	it("does not delete a script that merely mentions data-od-", () => {
		// A page script may legitimately reference the attribute it was stripped
		// of; only elements *tagged* with data-od-* are host scaffolding.
		const keep = '<script>const sel = \'[data-od-id]\';</script>';
		expect(sanitizeDashboardHtml(keep)).toBe(keep);
	});
});

describe("published dashboard artifacts", () => {
	it("sanitizes the canonical export down to zero scaffolding", () => {
		const sanitized = sanitizeDashboardHtml(readFileSync(CANONICAL_SOURCE, "utf8"));
		expect(countScaffolding(sanitized)).toEqual({ tagged: 0, breadcrumbs: 0 });
		// The /dashboard route's own markers, proving the page body survived.
		expect(sanitized).toContain("space-nav");
		expect(sanitized).toContain("1-Click");
	});

	it("is not already sanitized at the source", () => {
		// If this ever fails, the export was replaced with a cleaned copy and the
		// sanitizer has silently become a no-op — worth knowing about.
		const canonical = readFileSync(CANONICAL_SOURCE, "utf8");
		expect(countScaffolding(canonical).tagged).toBeGreaterThan(0);
	});

	it("keeps every published copy byte-identical to the sanitized export", () => {
		const expected = sanitizeDashboardHtml(readFileSync(CANONICAL_SOURCE, "utf8"));
		for (const target of TARGETS) {
			expect(
				readFileSync(target, "utf8"),
				`${target} is stale — run: bun deploy/sanitize-dashboard-v2.mjs`,
			).toBe(expected);
		}
	});
});

describe("dashboard v2 URLs — dev server and deploy configs agree", () => {
	// Parsed once: every assertion below is really "does this config name the
	// same paths as web-app/vite.config.ts".
	const routes = viteDashboardRoutes();

	it("reads the canonical route list from the Vite config", () => {
		expect(routes).toEqual(["/dashboard", "/dashboard/", "/dashboard2", "/dashboard2/"]);
	});

	it("Caddy matches exactly those paths and serves the v2 page for them", () => {
		const caddy = readFileSync(CADDYFILE, "utf8");

		const matcher = caddy.match(/@dashboard\s+path\s+([^\n]+)/)?.[1];
		if (matcher === undefined) {
			throw new Error(`\`@dashboard path\` matcher not found in ${CADDYFILE}`);
		}
		expect(matcher.trim().split(/\s+/)).toEqual(routes);

		// The matcher alone is inert — the block it guards has to rewrite to the
		// page. Without this the routes could be listed and still serve the SPA.
		expect(caddy).toMatch(
			/handle\s+@dashboard\s*\{[^}]*rewrite\s+\*\s+\/dashboard-v2\.html/s,
		);
	});

	it("nginx has one exact-match location per path, all serving the v2 page", () => {
		const nginx = readFileSync(NGINX_CONF, "utf8");

		// Only the blocks that actually rewrite to the page count, so a stray
		// `location = /dashboard2` that proxies elsewhere cannot satisfy this.
		const servingRoutes = [...nginx.matchAll(/location\s+=\s+(\S+)\s*\{([^}]*)\}/gs)]
			.filter(([, , body]) => /dashboard-v2\.html/.test(body ?? ""))
			.map(([, path]) => path ?? "");

		expect(servingRoutes).toEqual(routes);
	});

	it("both deploy scripts patch in exactly those paths too", () => {
		// A redeploy through either script rewrites the live Caddyfile from its
		// own copy of the matcher. If that copy lags, `setup-caddy-muhanai.sh`
		// or `inject-dashboard-v2.sh` would silently drop `/dashboard2` again
		// even though the committed Caddyfile is correct.
		for (const script of [SETUP_CADDY_SH, INJECT_DASHBOARD_SH]) {
			const src = readFileSync(script, "utf8");
			const matcher = src.match(/@dashboard\s+path\s+([^\n]+)/)?.[1];
			if (matcher === undefined) {
				throw new Error(`\`@dashboard path\` matcher not found in ${script}`);
			}
			expect(matcher.trim().split(/\s+/), script).toEqual(routes);
		}
	});
});
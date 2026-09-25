#!/usr/bin/env node
/**
 * sanitize-dashboard-v2.mjs — produce the production build of the MuhanAI
 * dashboard page from the raw OpenDesign export.
 *
 * WHY THIS EXISTS
 * ---------------
 * `packaging/muhanai-dashboard-v2.html` is an export from the OpenDesign
 * canvas tool. Alongside the real page it carries host scaffolding that only
 * makes sense inside that tool's sandbox iframe:
 *
 *   1. `data-od-sandbox-shim`  — fakes localStorage/sessionStorage, hijacks
 *      anchor clicks and `target="_blank"` links. In a real top-level page it
 *      replaces the browser's own storage with an in-memory stub, so BYOK keys
 *      saved by the page never persist across reloads.
 *   2. `data-od-tweaks-bridge(-style)` — forces the design-tool "tweaks" panel
 *      hidden synchronously on load and postMessages panel state to `parent`.
 *   3. `data-od-snapshot-bridge` — DOM snapshot reporter for the tool canvas.
 *   4. `data-od-srcdoc-transport-activation` — reassembles the page from a
 *      postMessage payload. In production nothing ever sends that message, so
 *      the page is left waiting on a transport that will never arrive.
 *   5. `data-od-id="path-0-1-2-…"` attributes — canvas node breadcrumbs on ~112
 *      elements. Inert, but they are dead weight shipped to every visitor and
 *      they leak the tool's internal node tree.
 *
 * Stripping all five yields the same page with none of the sandbox coupling.
 * This script makes that transform reproducible instead of a manual edit, so
 * the deployed file cannot silently drift back to the scaffolded original.
 *
 * USAGE
 * -----
 *   bun sanitize-dashboard-v2.mjs            # canonical source -> both targets
 *   bun sanitize-dashboard-v2.mjs --check    # verify targets are up to date
 *   bun sanitize-dashboard-v2.mjs a.html b.html  # explicit in/out
 *
 * Safe to re-run: the transform is idempotent, so sanitizing already-sanitized
 * input is a no-op.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repo root, found by walking up from this script to the dir holding `packaging`. */
function findRepoRoot(start) {
	let dir = start;
	for (let i = 0; i < 12; i += 1) {
		try {
			readFileSync(resolve(dir, "packaging", "muhanai-dashboard-v2.html"));
			return dir;
		} catch {
			// keep walking
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error(`could not locate repo root from ${start}`);
}

const ROOT = findRepoRoot(HERE);

/** Raw OpenDesign export — the single source of truth. */
export const CANONICAL_SOURCE = resolve(ROOT, "packaging", "muhanai-dashboard-v2.html");

/**
 * Every file that must hold the sanitized page. Three copies exist because
 * the deploy bundle, the Vite `public/` dir, and the production `apps/web`
 * root are published independently; keeping them in this list is what stops
 * them from drifting apart.
 */
export const TARGETS = [
	resolve(ROOT, "packaging", "npm", "token-free-gateway", "agentmesh", "deploy", "dashboard-v2.html"),
	resolve(ROOT, "web-app", "public", "dashboard-v2.html"),
	// Production ASSETS root: wrangler.toml serves apps/web/dist, and apps/web
	// has no public/ dir, so the page is published here and copied into dist/
	// at build time (see the post-build note in apps/web/package.json).
	resolve(ROOT, "packaging", "npm", "token-free-gateway", "agentmesh", "apps", "web", "dashboard-v2.html"),
];

/**
 * Remove one `<script data-od-…>` / `<style data-od-…>` host block and the
 * leading whitespace it occupied, so removal does not leave a blank line.
 */
function stripTaggedBlock(html, tag) {
	const re = new RegExp(`\\s*<${tag}\\s+data-od-[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
	return html.replace(re, "");
}

/**
 * Strip the OpenDesign host scaffolding from a dashboard page.
 *
 * @param {string} html raw or already-sanitized page source
 * @returns {string} page source with no tool-specific coupling
 */
export function sanitizeDashboardHtml(html) {
	let out = html;

	// 1-4. Host bridges. Order does not matter — each is independent — but the
	// style block must go before the script that toggles its selectors.
	out = stripTaggedBlock(out, "style");
	out = stripTaggedBlock(out, "script");

	// 5. Canvas node breadcrumbs. Drop the attribute but keep every element.
	out = out.replace(/\s+data-od-id="[^"]*"/gi, "");

	return out;
}

/** Count how many scaffolding artefacts a string still carries. */
export function countScaffolding(html) {
	const tagged = html.match(/data-od-(?!id=)[a-z-]+/gi) ?? [];
	const breadcrumbs = html.match(/data-od-id=/gi) ?? [];
	return { tagged: tagged.length, breadcrumbs: breadcrumbs.length };
}

/** Human-readable summary of the leftovers in `html`. */
function describeScaffolding(html) {
	const { tagged, breadcrumbs } = countScaffolding(html);
	return `${tagged} tagged block(s), ${breadcrumbs} data-od-id attribute(s)`;
}

function read(path) {
	try {
		return readFileSync(path, "utf8");
	} catch (err) {
		throw new Error(`cannot read ${path}: ${err.message}`);
	}
}

function write(path, contents) {
	writeFileSync(path, contents, "utf8");
}

function main(argv) {
	// `--check` — CI mode: fail if any published target has drifted from source.
	if (argv.includes("--check")) {
		const expected = sanitizeDashboardHtml(read(CANONICAL_SOURCE));
		let drifted = false;
		for (const target of TARGETS) {
			let actual;
			try {
				actual = read(target);
			} catch (err) {
				console.error(`✗ ${target}\n  ${err.message}`);
				drifted = true;
				continue;
			}
			if (actual === expected) {
				console.log(`✓ ${target}`);
			} else {
				console.error(`✗ ${target} is stale — re-run without --check`);
				console.error(`  still carries: ${describeScaffolding(actual)}`);
				drifted = true;
			}
		}
		return drifted ? 1 : 0;
	}

	// Explicit in/out: sanitize one file into another (or in place).
	const positional = argv.filter((a) => !a.startsWith("--"));
	if (positional.length > 0) {
		const [source, dest = source] = positional;
		const sanitized = sanitizeDashboardHtml(read(resolve(source)));
		write(resolve(dest), sanitized);
		console.log(`✓ ${source} -> ${dest} (${describeScaffolding(sanitized)} remaining)`);
		return 0;
	}

	// Default: canonical source -> every published target.
	const sanitized = sanitizeDashboardHtml(read(CANONICAL_SOURCE));
	const before = describeScaffolding(read(CANONICAL_SOURCE));
	for (const target of TARGETS) {
		write(target, sanitized);
		console.log(`✓ ${target}`);
	}
	console.log(`  source: ${CANONICAL_SOURCE}`);
	console.log(`  stripped: ${before} -> ${describeScaffolding(sanitized)}`);
	return 0;
}

// `import.meta.main` is Bun-only; fall back to argv comparison so the script is
// runnable with either `bun` (preferred in this repo) or `node`.
const IS_MAIN = import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url);

if (IS_MAIN) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (err) {
		console.error(`✗ ${err.message}`);
		process.exit(1);
	}
}
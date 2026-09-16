#!/usr/bin/env node
/**
 * Windows-safe launcher for the Folklore MCP server.
 *
 * The published @usefolklore/folklore npm package's bin/folklore.js uses
 * `await import(distEntry)` with a bare Windows path string, which throws
 * ERR_UNSUPPORTED_ESM_URL_SCHEME on Node ≥22.  This launcher resolves the
 * installed package, converts the dist entry to a file:// URL, and forwards
 * all CLI arguments (typically `mcp start`).
 *
 * Usage:
 *   node scripts/folklore-mcp-launcher.mjs mcp start
 *
 * Environment overrides:
 *   FOLKLORE_HOME          — override ~/.folklore location
 *   FOLKLORE_MODULE_PATH   — explicit path to the installed package root
 *                             (auto-detected from node_modules when omitted)
 */

import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Locate the installed @usefolklore/folklore package
// ---------------------------------------------------------------------------

function locateFolkloreRoot() {
	// 1. Explicit override
	const fromEnv = process.env.FOLKLORE_MODULE_PATH;
	if (fromEnv && existsSync(fromEnv)) return fromEnv;

	// 2. Walk up from this launcher to find node_modules/@usefolklore/folklore
	let dir = __dirname;
	for (let i = 0; i < 20; i++) {
		const candidate = join(dir, "node_modules", "@usefolklore", "folklore");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	// 3. pnpm workspace layout: the launcher lives at <repo>/scripts, the
	//    package is symlinked at <repo>/packages/*/node_modules/@usefolklore/folklore
	try {
		const repoRoot = dirname(__dirname);
		const pkgDir = join(repoRoot, "packages");
		if (existsSync(pkgDir)) {
			for (const name of readdirSync(pkgDir)) {
				const candidate = join(pkgDir, name, "node_modules", "@usefolklore", "folklore");
				if (existsSync(candidate)) return candidate;
			}
		}
	} catch {
		// ignore
	}

	// 4. Last resort: try require.resolve (works in CommonJS-like contexts)
	try {
		const pkgJsonPath = require.resolve("@usefolklore/folklore/package.json");
		return dirname(pkgJsonPath);
	} catch {
		// require.resolve not available or package not found
	}

	return null;
}

const ROOT = locateFolkloreRoot();
if (!ROOT) {
	console.error(
		"folklore-mcp-launcher: @usefolklore/folklore not found. " +
			"Install it with: npm install @usefolklore/folklore",
	);
	process.exit(1);
}

const DIST_ENTRY = join(ROOT, "dist", "cli", "index.js");

if (!existsSync(DIST_ENTRY)) {
	console.error(
		`folklore-mcp-launcher: dist/cli/index.js not found at ${DIST_ENTRY}. ` +
			"Run 'npm run build' inside the folklore package, or reinstall.",
	);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Forward CLI args and import via file:// URL (Windows ESM fix)
// ---------------------------------------------------------------------------

// Replace argv[0] + argv[1] so the folklore CLI parser sees its own entry.
process.argv = [process.argv[0], DIST_ENTRY, ...process.argv.slice(2)];

await import(pathToFileURL(DIST_ENTRY).href);
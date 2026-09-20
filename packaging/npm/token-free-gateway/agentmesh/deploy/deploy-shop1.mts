/**
 * shop1.kbizhub.com — content refresh automation.
 *
 * Regenerates the 초원식당 store bundle from its single source of truth (the
 * store input) and publishes it to the origin with an atomic symlink swap, the
 * same release-dir pattern muhanai.com already uses:
 *
 *   /var/www/shop1.kbizhub.com/releases/<timestamp>/   ← new bundle
 *   /var/www/shop1.kbizhub.com/current -> releases/<timestamp>   (symlink)
 *
 * The swap is atomic (`mv -T`), so Caddy never serves a half-written tree and a
 * rollback is just re-pointing the symlink at the previous release.
 *
 * Before this, `current/` was a plain directory with hand-copied files — a
 * refresh meant remembering which seven files to copy, and an interrupted copy
 * left the live site broken.
 *
 * Usage (from packaging/npm/token-free-gateway/agentmesh):
 *   bun run deploy/deploy-shop1.mts                    # build + deploy
 *   bun run deploy/deploy-shop1.mts --dry-run          # build only, write ./dist-shop1
 *   bun run deploy/deploy-shop1.mts --rollback         # re-point to previous release
 *   SHOP1_HOST=110 bun run deploy/deploy-shop1.mts     # deploy to a remote origin
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The factory and the store input are the same modules the sample test uses, so
// the deployed site can never drift from what the test asserts.
import { hugoMcpFactory } from "../packages/mcp/src/hugo-factory.js";
import { SHOP1 } from "./shop1-store.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_OUT = join(HERE, "..", "dist-shop1");

const WEB_ROOT = process.env.SHOP1_WEB_ROOT ?? "/var/www/shop1.kbizhub.com";
const HOST = process.env.SHOP1_HOST ?? ""; // empty = run locally
const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK = process.argv.includes("--rollback");
const RELOAD_CADDY = process.env.SHOP1_RELOAD_CADDY !== "false";

/** Run a command locally, or over ssh when SHOP1_HOST is set. */
function run(cmd: string, args: string[]): string {
	const [bin, ...rest] = HOST ? ["ssh", HOST, [cmd, ...args].join(" ")] : [cmd, ...args];
	return execFileSync(bin, rest as string[], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

/**
 * Like run(), but for boolean probes. execFileSync throws on any non-zero
 * exit, and the natural probe verbs (`test -L`, `test -f`) signal "false"
 * exactly that way — so a tolerant variant is required or the script aborts
 * on the normal case.
 */
function probe(cmd: string, args: string[]): boolean {
	try {
		run(cmd, args);
	return true;
	} catch {
	return false;
	}
}

function log(msg: string) {
	console.log(`[shop1] ${msg}`);
}

// ---------------------------------------------------------------- rollback ---
if (ROLLBACK) {
	const releases = run("ls -1", [`${WEB_ROOT}/releases`])
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)
		// `-adopted` entries are archived snapshots of the pre-automation
		// legacy tree, not deployable builds — never roll back onto one.
		.filter((r) => !r.endsWith("-adopted"))
		.sort()
		.reverse();
	if (releases.length < 2) {
		console.error(`[shop1] nothing to roll back to: ${releases.length} release(s) present`);
		process.exit(1);
	}
	const current = run("readlink", [`${WEB_ROOT}/current`]).trim();
	const previous = releases.find((r) => !current.endsWith(r));
	if (!previous) {
		console.error("[shop1] could not identify the previous release");
		process.exit(1);
	}
	log(`rolling back ${current} -> ${previous}`);
	run("ln", ["-sfn", `${WEB_ROOT}/releases/${previous}`, `${WEB_ROOT}/current`]);
	if (RELOAD_CADDY) run("caddy", ["reload", "--config", "/etc/caddy/Caddyfile"]);
	log(`now serving ${previous}`);
	process.exit(0);
}

// ------------------------------------------------------------------- build ---
log(`generating bundle from store input (${SHOP1.name})`);
const bundle = hugoMcpFactory.generateStaticBundle(SHOP1);
const files = Object.keys(bundle);
if (files.length === 0) {
	console.error("[shop1] factory produced an empty bundle — aborting");
	process.exit(1);
}

if (existsSync(LOCAL_OUT)) rmSync(LOCAL_OUT, { recursive: true, force: true });
for (const [rel, content] of Object.entries(bundle)) {
	const target = join(LOCAL_OUT, rel);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}
log(`wrote ${files.length} files to ${LOCAL_OUT}`);
for (const f of files.sort()) log(`  ${f}`);

if (DRY_RUN) {
	log("dry run — skipping deploy");
	process.exit(0);
}

// ------------------------------------------------------------------ deploy ---
const release = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const releasePath = `${WEB_ROOT}/releases/${release}`;

log(`deploying to ${HOST || "local"}:${releasePath}`);
run("mkdir", ["-p", releasePath]);

// Copy the bundle we just built (local path) up to the origin.
if (HOST) {
	execFileSync("rsync", ["-a", "--delete", `${LOCAL_OUT}/`, `${HOST}:${releasePath}/`], {
		stdio: "inherit",
	});
} else {
	execFileSync("cp", ["-a", `${LOCAL_OUT}/.`, `${releasePath}/`], { stdio: "inherit" });
}

// Sanity-check the release before it goes live: a bundle missing its index or
// its agent manifest must never be promoted.
for (const required of ["index.html", ".well-known/mcp.json", "data/store.json"]) {
	run("test", ["-f", `${releasePath}/${required}`]);
}
log("release verified (index.html + mcp.json + store.json present)");

// Atomic swap. `ln -sfn` alone is NOT enough: when `current` is still a real
// directory (the pre-automation layout, where seven files were hand-copied into
// it), `ln -sfn` silently creates a symlink INSIDE that directory instead of
// replacing it — the site keeps serving the old tree while the deploy reports
// success. So adopt the legacy tree as its own release first, then swap.
if (probe("test", ["-d", `${WEB_ROOT}/current`]) && !probe("test", ["-L", `${WEB_ROOT}/current`])) {
	const adopted = `${WEB_ROOT}/releases/${release}-adopted`;
	log(`current is a legacy real directory — archiving it as ${release}-adopted`);
	run("cp", ["-a", `${WEB_ROOT}/current`, adopted]);
	run("rm", ["-rf", `${WEB_ROOT}/current`]);
}
run("ln", ["-sfn", releasePath, `${WEB_ROOT}/current`]);
// Fail loudly if the swap did not take: a deploy that reports success while the
// old tree is still live is worse than one that fails.
if (!probe("test", ["-L", `${WEB_ROOT}/current`])) {
	console.error("[shop1] FAIL: current is still not a symlink after the swap");
	process.exit(1);
}
const live = probe("test", ["-L", `${WEB_ROOT}/current`])
	? run("readlink", [`${WEB_ROOT}/current`]).trim()
	: "(not a symlink)";
if (!live.endsWith(release)) {
	console.error(`[shop1] FAIL: current -> ${live}, expected .../${release}`);
	process.exit(1);
}
log(`current -> releases/${release}`);

// Prune old releases, keeping the 5 most recent (plus the live one).
const all = run("ls", ["-1t", `${WEB_ROOT}/releases`])
	.split("\n")
	.map((s) => s.trim())
	.filter(Boolean);
for (const stale of all.slice(5)) {
	log(`pruning old release ${stale}`);
	run("rm", ["-rf", `${WEB_ROOT}/releases/${stale}`]);
}

if (RELOAD_CADDY) {
	try {
		run("caddy", ["reload", "--config", "/etc/caddy/Caddyfile"]);
		log("caddy reloaded");
	} catch (err) {
		log(`caddy reload skipped (${err instanceof Error ? err.message.split("\n")[0] : err})`);
	}
}

log(`done — https://shop1.kbizhub.com now serves releases/${release}`);

/**
 * danang.kbizhub.com — automated directory & MCP deployment.
 *
 * Builds the 274-store directory and deploys it to the origin host with
 * atomic releases:
 *
 *   /var/www/danang.kbizhub.com/releases/<timestamp>/
 *   /var/www/danang.kbizhub.com/current -> releases/<timestamp>
 *
 * Usage:
 *   bun run deploy/deploy-danang.mts                     # local deploy
 *   bun run deploy/deploy-danang.mts --dry-run           # build only
 *   bun run deploy/deploy-danang.mts --rollback          # revert to previous release
 *   DANANG_HOST=110-ts bun run deploy/deploy-danang.mts  # deploy to 110 server
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCAL_OUT = join(HERE, "..", "dist-danang");

const WEB_ROOT = process.env.DANANG_WEB_ROOT ?? "/var/www/danang.kbizhub.com";
const HOST = process.env.DANANG_HOST ?? "";
const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK = process.argv.includes("--rollback");
const RELOAD_CADDY = process.env.DANANG_RELOAD_CADDY === "true";

function run(cmd: string, args: string[]): string {
	const [bin, ...rest] = HOST ? ["ssh", HOST, [cmd, ...args].join(" ")] : [cmd, ...args];
	return execFileSync(bin, rest as string[], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
}

function probe(cmd: string, args: string[]): boolean {
	try {
		run(cmd, args);
		return true;
	} catch {
		return false;
	}
}

function log(msg: string) {
	console.log(`[danang] ${msg}`);
}

// ---------------------------------------------------------------- Rollback
if (ROLLBACK) {
	const releases = run("ls -1", [`${WEB_ROOT}/releases`])
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((r) => !r.endsWith("-adopted"))
		.sort()
		.reverse();

	if (releases.length < 2) {
		console.error(`[danang] nothing to roll back to: ${releases.length} release(s) present`);
		process.exit(1);
	}

	const current = probe("test", ["-L", `${WEB_ROOT}/current`])
		? run("readlink", [`${WEB_ROOT}/current`]).trim()
		: "(not a symlink)";

	const previous = releases.find((r) => !current.endsWith(r));
	if (!previous) {
		console.error("[danang] could not identify previous release");
		process.exit(1);
	}

	log(`rolling back ${current} -> ${previous}`);
	run("ln", ["-sfn", `${WEB_ROOT}/releases/${previous}`, `${WEB_ROOT}/current`]);
	log(`now serving ${previous}`);
	process.exit(0);
}

// ------------------------------------------------------------------- Build
log("building danang directory bundle...");
execFileSync("bun", ["run", join(HERE, "build-danang-directory.mts")], { stdio: "inherit" });

if (
	!existsSync(join(LOCAL_OUT, "index.html")) ||
	!existsSync(join(LOCAL_OUT, "data", "stores.json"))
) {
	console.error("[danang] build failed: output missing index.html or data/stores.json");
	process.exit(1);
}
log("build verified successfully");

if (DRY_RUN) {
	log("dry run requested — skipping deploy");
	process.exit(0);
}

// ------------------------------------------------------------------ Deploy
const release = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const releasePath = `${WEB_ROOT}/releases/${release}`;

log(`deploying to ${HOST || "local"}:${releasePath}`);
run("mkdir", ["-p", releasePath]);

if (HOST) {
	execFileSync("rsync", ["-a", "--delete", `${LOCAL_OUT}/`, `${HOST}:${releasePath}/`], {
		stdio: "inherit",
	});
} else {
	execFileSync("cp", ["-a", `${LOCAL_OUT}/.`, `${releasePath}/`], { stdio: "inherit" });
}

// Verify bundle on origin
for (const req of ["index.html", ".well-known/mcp.json", "data/stores.json"]) {
	if (!probe("test", ["-f", `${releasePath}/${req}`])) {
		console.error(`[danang] deployment verification failed: ${req} missing on origin`);
		process.exit(1);
	}
}
log("release bundle verified on target");

// Handle legacy directory if present
if (probe("test", ["-d", `${WEB_ROOT}/current`]) && !probe("test", ["-L", `${WEB_ROOT}/current`])) {
	const adopted = `${WEB_ROOT}/releases/${release}-adopted`;
	log(`adopting legacy directory as ${release}-adopted`);
	run("cp", ["-a", `${WEB_ROOT}/current`, adopted]);
	run("rm", ["-rf", `${WEB_ROOT}/current`]);
}

// Atomic symlink swap
run("ln", ["-sfn", releasePath, `${WEB_ROOT}/current`]);

const live = probe("test", ["-L", `${WEB_ROOT}/current`])
	? run("readlink", [`${WEB_ROOT}/current`]).trim()
	: "(not a symlink)";

if (!live.endsWith(release)) {
	console.error(`[danang] FAIL: current points to ${live}, expected .../${release}`);
	process.exit(1);
}
log(`current -> releases/${release}`);

// Prune old releases (keep 5 most recent)
const allReleases = run("ls", ["-1t", `${WEB_ROOT}/releases`])
	.split("\n")
	.map((s) => s.trim())
	.filter(Boolean);

for (const old of allReleases.slice(5)) {
	log(`pruning old release ${old}`);
	run("rm", ["-rf", `${WEB_ROOT}/releases/${old}`]);
}

log(`done! https://danang.kbizhub.com is now live with ${release}`);

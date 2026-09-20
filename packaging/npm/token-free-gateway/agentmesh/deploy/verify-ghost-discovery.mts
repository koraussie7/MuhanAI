/**
 * End-to-end Ghost discovery verification against the LIVE muhanai.com card.
 *
 * Uses the real @agentmesh/ghost-adapter code paths — not a re-implementation —
 * so this proves what a Ghost desktop install would actually experience:
 *
 *   discoverGhostAgentCard("https://muhanai.com")   → SSRF guard + fetch + parse
 *   createGhostRegistry().upsert(...)               → node registration
 *
 * Run: bun run deploy/verify-ghost-discovery.mts
 */
import {
	createGhostRegistry,
	discoverGhostAgentCard,
	GhostFetchError,
	type GhostNode,
} from "@agentmesh/ghost-adapter";

const TARGET = process.env.GHOST_DISCOVERY_TARGET ?? "https://muhanai.com";

function line(label: string, value: unknown) {
	console.log(`${label.padEnd(14)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

console.log(`\n=== Ghost discovery against ${TARGET} ===\n`);

// Step 1: the real discovery client (SSRF guard → fetch → parseGhostAgentCard).
let card: Awaited<ReturnType<typeof discoverGhostAgentCard>>;
try {
	card = await discoverGhostAgentCard(TARGET);
} catch (err) {
	if (err instanceof GhostFetchError) {
		console.error(`FAIL: discovery blocked [${err.code}] ${err.message}`);
		process.exit(1);
	}
	console.error(`FAIL: discovery error — ${err instanceof Error ? err.message : err}`);
	process.exit(1);
}

line("name", card.name);
line("url", card.url);
line("version", card.version);
line("description", card.description?.slice(0, 70) + "…");
line("capabilities", card.capabilities);
line("skills", card.skills?.map((s) => s.id));
line("protocol", card.protocol);

// Step 2: registration into the same registry the API's POST /api/ghost/nodes
// uses, so this mirrors the server-side outcome exactly.
const registry = createGhostRegistry();
const node: GhostNode = { nodeId: "muhanai.com", card, lastSeenAt: Date.now() };
registry.upsert(node);

const listed = registry.list();
line("registered", listed.map((n) => n.nodeId));

// Step 3: assertions that matter for the integration to be real.
const failures: string[] = [];
if (!card.name?.trim()) failures.push("card has no name");
if (card.capabilities.length !== 4) {
	failures.push(
		`expected 4 capabilities accepted by the client filter, got ${card.capabilities.length}`,
	);
}
if (!card.protocol?.a2a) failures.push("protocol.a2a missing — A2A clients cannot bind");
if (!card.skills?.length) failures.push("no skills exposed");
if (listed.length !== 1) failures.push("node did not land in the registry");

console.log("");
if (failures.length) {
	for (const f of failures) console.error(`FAIL: ${f}`);
	process.exit(1);
}
console.log("OK: Ghost discovery → parse → registry registration all succeed\n");

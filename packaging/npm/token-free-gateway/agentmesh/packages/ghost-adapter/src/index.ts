import type { GhostFetchPolicy } from "./ssrf.js";
import { fetchAgentCardDocument } from "./ssrf.js";

export type GhostCapability =
	| "local_file_search"
	| "local_code_analysis"
	| "offline_inference"
	| "desktop_automation";

export type {
	GhostFetchErrorCode,
	GhostFetchPolicy,
	GhostLookup,
	GhostLookupAddress,
	HostAllowlist,
} from "./ssrf.js";
// SSRF guard — everything the discovery client and the API routes need to
// vet URLs before the server fetches them.
export {
	assertFetchableUrl,
	assertPublicHost,
	createHostAllowlist,
	fetchAgentCardDocument,
	GhostFetchError,
	isInternalAddress,
	isInternalHostname,
} from "./ssrf.js";

export interface GhostAgentCard {
	name: string;
	description?: string;
	url: string;
	version?: string;
	capabilities: GhostCapability[];
	skills?: Array<{ id: string; name: string; description?: string }>;
	privacy?: { filesStayLocal?: boolean };
	protocol?: { a2a?: string; agUi?: string; a2ui?: string; mcp?: string };
}

export interface GhostNode {
	nodeId: string;
	card: GhostAgentCard;
	lastSeenAt: number;
}

export interface GhostRegistry {
	upsert(node: GhostNode): void;
	get(nodeId: string): GhostNode | undefined;
	list(): GhostNode[];
	removeStale(before: number): number;
}

export function createGhostRegistry(): GhostRegistry {
	const nodes = new Map<string, GhostNode>();
	return {
		upsert(node) {
			nodes.set(node.nodeId, node);
		},
		get(nodeId) {
			return nodes.get(nodeId);
		},
		list() {
			return [...nodes.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
		},
		removeStale(before) {
			let removed = 0;
			for (const [nodeId, node] of nodes) {
				if (node.lastSeenAt < before) {
					nodes.delete(nodeId);
					removed += 1;
				}
			}
			return removed;
		},
	};
}

export interface GhostDiscoveryClient {
	discover(baseUrl: string): Promise<GhostAgentCard>;
}

export interface GhostDiscoveryOptions extends GhostFetchPolicy {}

/**
 * Discovery client hardened against SSRF: the base URL is validated
 * (scheme, internal hosts, optional allowlist) and resolved before every
 * fetch hop, redirects are followed manually with per-hop revalidation, and
 * the response is capped/typed/timed. See `./ssrf.ts`.
 */
export function createGhostDiscoveryClient(
	options: GhostDiscoveryOptions = {},
): GhostDiscoveryClient {
	return {
		async discover(baseUrl) {
			const document = await fetchAgentCardDocument(
				new URL("/.well-known/agent.json", baseUrl).toString(),
				options,
			);
			return parseGhostAgentCard(document, baseUrl);
		},
	};
}

/** One-shot: fetch + validate `/.well-known/agent.json` under the SSRF guard. */
export async function discoverGhostAgentCard(
	baseUrl: string,
	policy: GhostFetchPolicy = {},
): Promise<GhostAgentCard> {
	return createGhostDiscoveryClient(policy).discover(baseUrl);
}

export function parseGhostAgentCard(value: unknown, fallbackUrl: string): GhostAgentCard {
	if (!value || typeof value !== "object") throw new Error("Invalid Ghost Agent Card");
	const record = value as Record<string, unknown>;
	if (typeof record.name !== "string" || !record.name.trim()) {
		throw new Error("Ghost Agent Card requires a name");
	}
	const capabilities = Array.isArray(record.capabilities)
		? record.capabilities.filter(
				(item): item is GhostCapability =>
					item === "local_file_search" ||
					item === "local_code_analysis" ||
					item === "offline_inference" ||
					item === "desktop_automation",
			)
		: [];
	return {
		name: record.name,
		...(typeof record.description === "string" ? { description: record.description } : {}),
		url: typeof record.url === "string" ? record.url : fallbackUrl,
		...(typeof record.version === "string" ? { version: record.version } : {}),
		capabilities,
		...(record.privacy && typeof record.privacy === "object"
			? {
					privacy: {
						filesStayLocal: (record.privacy as Record<string, unknown>).filesStayLocal === true,
					},
				}
			: {}),
		...(record.protocol && typeof record.protocol === "object"
			? { protocol: record.protocol as GhostAgentCard["protocol"] }
			: {}),
	};
}

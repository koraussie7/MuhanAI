import type { XLangCapability } from "@agentmesh/ai-engine";

export interface XLangAgentManifest {
	id: string;
	runtime: "xlang";
	peerId: string;
	endpoint: string;
	protocol: "xlang-peer-v1";
	capabilities: XLangCapability[];
	models?: string[];
	transports: Array<"http" | "websocket" | "libp2p" | "ipc">;
	supportsStreaming: boolean;
	createdAt: string;
	signature?: string;
}

export interface XLangManifestValidation {
	ok: true;
	manifest: XLangAgentManifest;
}

export interface XLangManifestFailure {
	ok: false;
	reason: string;
}

const VALID_KINDS = new Set<XLangCapability["kind"]>(["model", "tool", "device", "workflow"]);
const VALID_TRANSPORTS = new Set<XLangAgentManifest["transports"][number]>([
	"http",
	"websocket",
	"libp2p",
	"ipc",
]);

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isCapability(value: unknown): value is XLangCapability {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return isNonEmptyString(candidate.name) && VALID_KINDS.has(candidate.kind as XLangCapability["kind"]);
}

export function validateXLangManifest(
	value: unknown,
): XLangManifestValidation | XLangManifestFailure {
	if (!value || typeof value !== "object") return { ok: false, reason: "manifest must be an object" };
	const candidate = value as Record<string, unknown>;
	if (candidate.runtime !== "xlang") return { ok: false, reason: "runtime must be xlang" };
	for (const field of ["id", "peerId", "endpoint", "protocol", "createdAt"]) {
		if (!isNonEmptyString(candidate[field])) return { ok: false, reason: `${field} is required` };
	}
	if (candidate.protocol !== "xlang-peer-v1") {
		return { ok: false, reason: "unsupported XLang protocol" };
	}
	try {
		const endpoint = new URL(candidate.endpoint as string);
		if (!(["http:", "https:", "ws:", "wss:"].includes(endpoint.protocol))) {
			return { ok: false, reason: "endpoint scheme is not supported" };
		}
	} catch {
		return { ok: false, reason: "endpoint must be a valid URL" };
	}
	if (!Array.isArray(candidate.capabilities) || !candidate.capabilities.every(isCapability)) {
		return { ok: false, reason: "capabilities are invalid" };
	}
	const capabilityNames = candidate.capabilities.map((capability) => capability.name);
	if (new Set(capabilityNames).size !== capabilityNames.length) {
		return { ok: false, reason: "capabilities must not contain duplicates" };
	}
	if (!Array.isArray(candidate.transports) || candidate.transports.length === 0) {
		return { ok: false, reason: "at least one transport is required" };
	}
	if (!candidate.transports.every((transport) => VALID_TRANSPORTS.has(transport))) {
		return { ok: false, reason: "transports are invalid" };
	}
	if (typeof candidate.supportsStreaming !== "boolean") {
		return { ok: false, reason: "supportsStreaming must be boolean" };
	}
	if (candidate.models !== undefined && (!Array.isArray(candidate.models) || !candidate.models.every(isNonEmptyString))) {
		return { ok: false, reason: "models are invalid" };
	}
	return { ok: true, manifest: candidate as unknown as XLangAgentManifest };
}

export class XLangRegistry {
	private readonly manifests = new Map<string, XLangAgentManifest>();
	private readonly lastSeen = new Map<string, number>();
	private readonly maxAgeMs: number;
	private readonly now: () => number;

	constructor(options: { maxAgeMs?: number; now?: () => number } = {}) {
		this.maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
		this.now = options.now ?? Date.now;
	}

	register(value: unknown): XLangManifestValidation | XLangManifestFailure {
		const checked = validateXLangManifest(value);
		if (!checked.ok) return checked;
		this.evictExpired();
		this.manifests.set(checked.manifest.peerId, checked.manifest);
		this.lastSeen.set(checked.manifest.peerId, this.now());
		return checked;
	}

	remove(peerId: string): void {
		this.manifests.delete(peerId);
		this.lastSeen.delete(peerId);
	}

	get(peerId: string): XLangAgentManifest | undefined {
		this.evictExpired();
		return this.manifests.get(peerId);
	}

	list(): XLangAgentManifest[] {
		this.evictExpired();
		return [...this.manifests.values()];
	}

	findByCapability(name: string): XLangAgentManifest[] {
		return this.list().filter((manifest) => manifest.capabilities.some((capability) => capability.name === name));
	}

	findByModel(modelId: string): XLangAgentManifest[] {
		return this.list().filter((manifest) => manifest.models?.includes(modelId) ?? false);
	}

	heartbeat(peerId: string): boolean {
		if (!this.manifests.has(peerId)) return false;
		this.lastSeen.set(peerId, this.now());
		return true;
	}

	evictExpired(): number {
		const cutoff = this.now() - this.maxAgeMs;
		let removed = 0;
		for (const [peerId, seenAt] of this.lastSeen) {
			if (seenAt < cutoff) {
				this.remove(peerId);
				removed += 1;
			}
		}
		return removed;
	}

	clear(): void {
		this.manifests.clear();
		this.lastSeen.clear();
	}
}

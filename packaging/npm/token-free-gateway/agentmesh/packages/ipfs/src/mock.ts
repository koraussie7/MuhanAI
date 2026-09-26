import type { AddResult, IpfsAdapter, PinResult, PinStatus } from "./types.js";

/**
 * Mock IPFS adapter for offline/dev mode.
 * Stores pin records in-memory and returns simulated CIDs derived from content.
 */
export class MockIpfsAdapter implements IpfsAdapter {
	private readonly pins = new Map<string, PinStatus>();
	private readonly objects = new Map<string, Uint8Array>();

	async add(content: Record<string, string | Uint8Array>): Promise<AddResult> {
		const files = Object.entries(content);
		let size = 0;
		for (const [, value] of files) {
			size +=
				typeof value === "string" ? new TextEncoder().encode(value).byteLength : value.byteLength;
		}
		// Deterministic but unique CID per (filename, content) bundle: a short
		// base36 digest plus a domain tag keeps mocks out of the v1 namespace.
		let hash = 2166136261;
		for (const [name, value] of files) {
			for (let i = 0; i < name.length; i++) {
				hash ^= name.charCodeAt(i);
				hash = Math.imul(hash, 16777619);
			}
			const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
			for (let i = 0; i < bytes.byteLength; i++) {
				hash ^= bytes[i] ?? 0;
				hash = Math.imul(hash, 16777619);
			}
		}
		const digest = (hash >>> 0).toString(36).padStart(7, "0");
		const cid = `bafymock${digest}${files.length.toString(36)}`;
		this.objects.set(cid, new TextEncoder().encode(JSON.stringify(files.map(([n]) => n))));
		return { cid, size };
	}

	async pin(cid: string, options?: { replication?: number }): Promise<PinResult> {
		this.pins.set(cid, {
			cid,
			status: "pinned",
			replication: options?.replication ?? 3,
			lastCheck: Date.now(),
		});
		return { success: true, cid, pinStatus: "pinned" };
	}

	async unpin(cid: string): Promise<PinResult> {
		if (!this.pins.has(cid)) {
			return { success: false, cid, pinStatus: "unpinned", error: "CID not found" };
		}
		this.pins.set(cid, { cid, status: "unpinned", replication: 0, lastCheck: Date.now() });
		return { success: true, cid, pinStatus: "unpinned" };
	}

	async status(cid: string): Promise<PinStatus> {
		const pin = this.pins.get(cid);
		if (!pin) {
			return { cid, status: "unpinned", replication: 0, lastCheck: 0 };
		}
		return pin;
	}

	async listPins(limit = 100): Promise<PinStatus[]> {
		return [...this.pins.values()].slice(0, limit);
	}
}

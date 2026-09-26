import type { AddResult, IpfsAdapter, PinResult, PinStatus } from "./types.js";

/**
 * Kubo HTTP API IPFS adapter.
 *
 * Talks to a local Kubo daemon over its HTTP RPC at `IPFS_API_URL`
 * (default: http://127.0.0.1:5001). Used by the One-Click Factory to upload
 * real bundles and pin them, replacing the in-memory simulated CID flow.
 *
 * Compatible with Kubo ≥ 0.5 (uses /api/v0 endpoints). Falls back gracefully
 * when the daemon is unreachable: callers (factory-routes.ts) should `catch`
 * and log + continue with the simulated CID rather than 500.
 */
export class KuboHttpIpfsAdapter implements IpfsAdapter {
	private readonly baseUrl: string;

	constructor(baseUrl: string = process.env.IPFS_API_URL ?? "http://127.0.0.1:5001") {
		if (!/^https?:\/\//.test(baseUrl)) {
			throw new Error(`KuboHttpIpfsAdapter: invalid baseUrl ${baseUrl}`);
		}
		this.baseUrl = baseUrl.replace(/\/+$/, "");
	}

	get endpoint(): string {
		return this.baseUrl;
	}

	/**
	 * POST /api/v0/add?wrap-with-directory=true — Kubo returns one NDJSON line
	 * per file (and any intermediate directories) plus a final root-directory
	 * entry whose `Name` is `""` and `Hash` is the directory CID we want.
	 */
	async add(content: Record<string, string | Uint8Array>): Promise<AddResult> {
		const form = new FormData();
		for (const [name, value] of Object.entries(content)) {
			const mime = guessMime(name);
			const blob =
				typeof value === "string"
					? new Blob([value], { type: mime })
					: new Blob([new Uint8Array(value)], { type: mime });
			// The 3rd arg sets the multipart filename, which Kubo preserves as the
			// path inside the wrapped directory. Files nested under `data/` and
			// `.well-known/` therefore keep their full structure.
			form.append("file", blob, name);
		}

		const res = await fetch(`${this.baseUrl}/api/v0/add?wrap-with-directory=true`, {
			method: "POST",
			body: form,
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Kubo add failed: ${res.status} ${text}`);
		}

		const text = await res.text();
		const lines = text
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0)
			.map((l) => JSON.parse(l) as { Name?: string; Hash?: string; Size?: string });

		// The wrap-with-directory line is the last one and uses Name="".
		const root = lines.find((l) => l.Name === "") ?? lines[lines.length - 1];
		const cid = root?.Hash;
		if (!cid) {
			throw new Error(`Kubo add returned no CID in response: ${text}`);
		}
		const size = lines.reduce((acc, l) => acc + Number(l.Size ?? 0), 0);
		return { cid, size, rootName: "wrap" };
	}

	/**
	 * POST /api/v0/pin/add?arg=<cid>&recursive=true
	 * Note: replication is an application-level concept; Kubo's pin.add only
	 * pins locally. We accept the option to keep the surface compatible with
	 * the mock and pass-through but do not propagate it.
	 */
	async pin(cid: string, _options?: { replication?: number }): Promise<PinResult> {
		const res = await fetch(
			`${this.baseUrl}/api/v0/pin/add?arg=${encodeURIComponent(cid)}&recursive=true`,
			{
				method: "POST",
			},
		);
		if (!res.ok) {
			const text = await res.text();
			return { success: false, cid, pinStatus: "failed", error: `${res.status} ${text}` };
		}
		await res.text(); // drain
		return { success: true, cid, pinStatus: "pinned" };
	}

	async unpin(cid: string): Promise<PinResult> {
		const res = await fetch(`${this.baseUrl}/api/v0/pin/rm?arg=${encodeURIComponent(cid)}`, {
			method: "POST",
		});
		if (!res.ok) {
			const text = await res.text();
			return { success: false, cid, pinStatus: "unpinned", error: `${res.status} ${text}` };
		}
		await res.text();
		return { success: true, cid, pinStatus: "unpinned" };
	}

	/** POST /api/v0/pin/ls?arg=<cid> — 200 = pinned, 500 = not pinned. */
	async status(cid: string): Promise<PinStatus> {
		const res = await fetch(`${this.baseUrl}/api/v0/pin/ls?arg=${encodeURIComponent(cid)}`, {
			method: "POST",
		});
		if (!res.ok) {
			return { cid, status: "unpinned", replication: 0, lastCheck: Date.now() };
		}
		return { cid, status: "pinned", replication: 1, lastCheck: Date.now() };
	}

	/** POST /api/v0/pin/ls (no arg) — returns newline-delimited JSON. */
	async listPins(limit = 100): Promise<PinStatus[]> {
		const res = await fetch(`${this.baseUrl}/api/v0/pin/ls`, { method: "POST" });
		if (!res.ok) {
			return [];
		}
		const body = await res.text();
		const lines = body
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0)
			.map((l) => JSON.parse(l) as { Cid?: string; Type?: string });
		return lines
			.filter((l) => typeof l.Cid === "string")
			.slice(0, limit)
			.map((l) => ({
				cid: l.Cid ?? "",
				status: "pinned" as const,
				replication: 1,
				lastCheck: Date.now(),
			}));
	}
}

function guessMime(name: string): string {
	if (name.endsWith(".html")) return "text/html; charset=utf-8";
	if (name.endsWith(".json")) return "application/json; charset=utf-8";
	if (name.endsWith(".css")) return "text/css; charset=utf-8";
	if (name.endsWith(".js")) return "application/javascript; charset=utf-8";
	if (name.endsWith(".svg")) return "image/svg+xml";
	if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
	return "application/octet-stream";
}

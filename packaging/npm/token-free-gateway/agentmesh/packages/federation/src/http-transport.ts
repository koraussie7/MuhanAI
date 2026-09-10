import type { SignedRecord } from "@agentmesh/shared-types";
import type { Transport, TransportOptions } from "./types.js";

export class HttpTransport implements Transport {
	private readonly peerId: string;
	private readonly baseUrl: string;

	constructor(options: TransportOptions) {
		this.peerId = options.peerId ?? "self";
		this.baseUrl = options.listenAddr ?? "http://127.0.0.1:3001";
	}

	async start(): Promise<void> {
		// HTTP transport doesn't need to start a listener
	}

	async stop(): Promise<void> {
		// nothing to stop
	}

	async query(_peerId: string, query: string, _embedding?: number[]): Promise<SignedRecord[]> {
		try {
			const target = new URL("/api/knowledge/folklore/query", `${this.baseUrl}/`);
			const res = await fetch(target.toString(), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ query, embedding: _embedding ?? [] }),
			});
			if (!res.ok) return [];
			const data = (await res.json()) as { results?: SignedRecord[] };
			return data.results ?? [];
		} catch {
			return [];
		}
	}

	async push(_peerId: string, records: SignedRecord[]): Promise<number> {
		try {
			const target = new URL("/api/knowledge/folklore/ingest", `${this.baseUrl}/`);
			let pushed = 0;
			for (const record of records) {
				const res = await fetch(target.toString(), {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(record),
				});
				if (res.ok) pushed++;
			}
			return pushed;
		} catch {
			return 0;
		}
	}

	getPeers(): Array<{ peerId: string; address: string; online: boolean }> {
		return [];
	}

	async addPeer(_address: string): Promise<void> {
		// no-op for HTTP
	}

	async removePeer(_peerId: string): Promise<void> {
		// no-op for HTTP
	}
}

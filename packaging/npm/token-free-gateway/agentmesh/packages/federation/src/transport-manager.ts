import { HttpTransport } from "./http-transport.js";
import { Libp2pTransport } from "./libp2p-transport.js";
import { LoopbackTransport } from "./loopback-transport.js";
import type { Transport, TransportOptions } from "./types.js";

export type TransportKind = "libp2p" | "http" | "loopback";

export interface TransportManagerOptions extends TransportOptions {
	preferred?: TransportKind;
	httpBaseUrl?: string;
}

/** Simple in-memory counter for transport fallbacks (can be replaced with OpenTelemetry). */
let fallbackCount = 0;

export function getFallbackCount(): number {
	return fallbackCount;
}

export class TransportManager {
	private readonly transport: Transport;

	constructor(options: TransportManagerOptions) {
		const preferred = options.preferred ?? "libp2p";

		if (preferred === "libp2p") {
			try {
				this.transport = new Libp2pTransport(options);
			} catch (e) {
				fallbackCount++;
				console.warn(
					`p2p: libp2p transport initialization failed, falling back to HTTP: ${(e as Error).message}`,
				);
				this.transport = new HttpTransport(options);
			}
		} else if (preferred === "http") {
			this.transport = new HttpTransport({
				...options,
				listenAddr: options.httpBaseUrl,
			});
		} else {
			this.transport = new LoopbackTransport(options);
		}
	}

	async start(): Promise<void> {
		await this.transport.start();
	}

	async stop(): Promise<void> {
		await this.transport.stop();
	}

	getTransport(): Transport {
		return this.transport;
	}

	getPeers(): Array<{ peerId: string; address: string; online: boolean }> {
		return this.transport.getPeers();
	}
}

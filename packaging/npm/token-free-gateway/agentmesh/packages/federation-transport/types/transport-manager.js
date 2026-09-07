import { HttpTransport } from "./http-transport.js";
import { Libp2pTransport } from "./libp2p-transport.js";
import { LoopbackTransport } from "./loopback-transport.js";
export class TransportManager {
	transport;
	constructor(options) {
		const preferred = options.preferred ?? "libp2p";
		if (preferred === "libp2p") {
			try {
				this.transport = new Libp2pTransport(options);
			} catch {
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
	async start() {
		await this.transport.start();
	}
	async stop() {
		await this.transport.stop();
	}
	getTransport() {
		return this.transport;
	}
	getPeers() {
		return this.transport.getPeers();
	}
}
//# sourceMappingURL=transport-manager.js.map

import { createPushHandler, createQueryHandler } from "./handlers.js";
export class Libp2pTransport {
	peerId;
	listenAddr;
	started = false;
	constructor(options) {
		this.peerId = options.peerId;
		this.listenAddr = options.listenAddr ?? "/ip4/127.0.0.1/tcp/4001";
	}
	async start() {
		this.started = true;
	}
	async stop() {
		this.started = false;
	}
	async query(_peerId, _query, _embedding) {
		return [];
	}
	async push(_peerId, _records) {
		return 0;
	}
	getPeers() {
		return [];
	}
	async addPeer(_address) {
		// placeholder for real libp2p peer addition
	}
	async removePeer(_peerId) {
		// placeholder for real libp2p peer removal
	}
}
export function createLibp2pTransport(options) {
	const transport = new Libp2pTransport(options);
	if (options.onQuery) {
		const _handler = createQueryHandler(options.onQuery);
		// In real implementation, register handler with libp2p node
	}
	if (options.onPush) {
		const _handler = createPushHandler(options.onPush);
		// In real implementation, register handler with libp2p node
	}
	return transport;
}
//# sourceMappingURL=libp2p-transport.js.map

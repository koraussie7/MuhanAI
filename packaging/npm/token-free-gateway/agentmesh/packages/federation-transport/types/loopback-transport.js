export class LoopbackTransport {
	peerId;
	peers = new Map();
	onQuery;
	constructor(options) {
		this.peerId = options.peerId;
		this.onQuery = options.listenAddr ? undefined : undefined;
	}
	setQueryHandler(handler) {
		this.onQuery = handler;
	}
	async start() {
		// no-op
	}
	async stop() {
		this.peers.clear();
	}
	async query(peerId, query, embedding) {
		if (this.onQuery) {
			return this.onQuery(peerId, query, embedding);
		}
		return [];
	}
	async push(_peerId, _records) {
		return 0;
	}
	getPeers() {
		return Array.from(this.peers.entries()).map(([peerId, info]) => ({
			peerId,
			...info,
		}));
	}
	async addPeer(address) {
		const peerId = address;
		this.peers.set(peerId, { address, online: true });
	}
	async removePeer(peerId) {
		this.peers.delete(peerId);
	}
}
//# sourceMappingURL=loopback-transport.js.map

import type { MessageRouter } from "../message-router.js";
import type { PeerRegistry } from "../peer-registry.js";
import type {
	ConnectionInfo,
	MessageReceipt,
	P2PMessage,
	PeerDescriptor,
	PeerProtocol,
	TransportStats,
} from "../types.js";

/**
 * In-memory peer transport — peers communicate through an event bus local
 * to this process. Perfect for testing, single-node simulations, and as a
 * fallback when no libp2p/WebRTC transport is configured.
 *
 * Protocol identifier: "memory"
 *
 * FIX (S2): Each instance now has its own isolated bus Map.
 * The old static `bus` was shared across all instances, causing
 * message leakage between independent P2PNetwork instances in the same process.
 */
export class MemoryTransport {
	readonly protocol: PeerProtocol = "memory";

	/** Instance-local message bus — isolated per MemoryTransport instance. */
	private readonly bus = new Map<string, (msg: P2PMessage) => void>();

	private readonly registry: PeerRegistry;
	private readonly router: MessageRouter;
	private _onMessage?: (msg: P2PMessage) => void;
	private _onConnectionChange?: (info: ConnectionInfo) => void;
	private localPeerId = "";
	private running = false;

	// Statistics
	private bytesSent = 0;
	private bytesReceived = 0;
	private messagesSent = 0;
	private messagesReceived = 0;

	constructor(registry: PeerRegistry, router: MessageRouter) {
		this.registry = registry;
		this.router = router;
	}

	// ── Message handler wiring ────────────────────────────────────

	set onMessage(handler: (msg: P2PMessage) => void) {
		this._onMessage = handler;
	}

	set onConnectionChange(handler: (info: ConnectionInfo) => void) {
		this._onConnectionChange = handler;
	}

	// ── Transport API ─────────────────────────────────────────────

	async connect(peer: PeerDescriptor): Promise<ConnectionInfo> {
		this.localPeerId = peer.id.id;
		this.registry.register(peer);
		const info = this.registry.updateConnection(peer.id.id, "connected");
		this.running = true;

		// Subscribe to our instance-local bus under our peer id
		this.bus.set(this.localPeerId, (msg: P2PMessage) => {
			this.bytesReceived += JSON.stringify(msg).length;
			this.messagesReceived++;
			this.router.receive(msg);
			this._onMessage?.(msg);
		});

		this._onConnectionChange?.(info);
		return info;
	}

	async disconnect(peerId: string): Promise<void> {
		this.registry.updateConnection(peerId, "disconnected");
		this.bus.delete(peerId);
		this._onConnectionChange?.({ peerId, state: "disconnected" });
	}

	async send(message: P2PMessage): Promise<MessageReceipt> {
		const json = JSON.stringify(message);
		this.bytesSent += json.length;
		this.messagesSent++;
		return this.router.send(message);
	}

	async broadcast(message: P2PMessage, exclude?: string[]): Promise<MessageReceipt> {
		const json = JSON.stringify(message);
		this.bytesSent += json.length;
		this.messagesSent++;
		return this.router.broadcast(message, exclude);
	}

	stats(): TransportStats {
		return {
			bytesSent: this.bytesSent,
			bytesReceived: this.bytesReceived,
			messagesSent: this.messagesSent,
			messagesReceived: this.messagesReceived,
			connections: this.registry.connectedPeers().length,
		};
	}

	// ── Lifecycle ─────────────────────────────────────────────────

	async stop(): Promise<void> {
		if (this.localPeerId) {
			this.bus.delete(this.localPeerId);
		}
		this.running = false;
	}

	// ── Testing utilities ─────────────────────────────────────────

	/**
	 * Get the internal bus size for testing/debugging.
	 */
	get busSize(): number {
		return this.bus.size;
	}

	/**
	 * Simulate receiving a message from another peer (for testing).
	 */
	injectMessage(msg: P2PMessage): void {
		this.router.receive(msg);
		this._onMessage?.(msg);
	}
}

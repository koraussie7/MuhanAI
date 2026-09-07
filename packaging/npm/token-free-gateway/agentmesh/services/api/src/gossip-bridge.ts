/**
 * Pulse bridge — fan-out a `PulseSource` to many `PulseSink`s.
 *
 * Architectural intent (separation of concerns):
 *   - `PulseSource` is libp2p-agnostic. Callers wrap `@libp2p/floodsub`
 *     (or any future gossipsub) as the source.
 *   - `PulseSink` is transport-agnostic. SSE, WebSocket, or in-memory
 *     test sinks all share the same contract.
 *   - The bridge is the only place that knows both sides. This lets us
 *     unit-test fan-out / backpressure without spinning up a libp2p node.
 *
 * Fail-safe defaults (graceful degradation):
 *   - Source starts as `null` (degraded mode). The bridge emits heartbeats
 *     on a fixed cadence so SSE clients don't sit silent when the node
 *     hasn't initialized yet.
 *   - Sink write errors are caught; the failing sink is removed but other
 *     sinks keep receiving.
 *   - `attach()` and `detach()` are idempotent so SSE clients reconnecting
 *     rapidly don't crash the bridge.
 *
 * Pattern reference: folklore/peer-transport.ts listener wiring + pubsub
 * fan-out, ported to an in-process pub/sub pattern.
 */

import type { PulseMessage } from "@agentmesh/p2p";

export type { PulseMessage };

export type PulseKind = PulseMessage["kind"];

/** A producer of pulse messages (libp2p floodsub, mock, etc.). */
export interface PulseSource {
	/** Subscribe to inbound messages. Returns an unsubscribe function. */
	subscribe(handler: (msg: PulseMessage) => void): () => void;
	/** Optional: publish to the source. Default is a no-op for read-only sources. */
	publish?(msg: PulseMessage): Promise<void> | void;
}

/** A consumer of pulse messages (SSE writer, WS writer, in-memory sink). */
export interface PulseSink {
	/** Push a message. May throw if the underlying channel is closed. */
	write(msg: PulseMessage): void | Promise<void>;
	/** Optional: heartbeat for keep-alive. Default is a no-op. */
	heartbeat?(ts: number): void;
	/** Optional: called on cleanup. Default is a no-op. */
	close?(): void | Promise<void>;
}

export interface PulseBridgeOptions {
	/** Heartbeat interval in ms. Default 15_000 — well under typical proxy timeouts. */
	heartbeatMs?: number;
	/** Optional logger for bridge lifecycle events. */
	logger?: {
		info: (msg: string, meta?: Record<string, unknown>) => void;
		warn: (msg: string, meta?: Record<string, unknown>) => void;
		error: (msg: string, meta?: Record<string, unknown>) => void;
	};
}

const DEFAULT_HEARTBEAT_MS = 15_000;

export class PulseBridge {
	private readonly sinks = new Set<PulseSink>();
	private readonly handlers = new Map<PulseSource, (msg: PulseMessage) => void>();
	private readonly unsubscribers = new Map<PulseSource, () => void>();
	private source: PulseSource | null = null;
	private heartbeatTimer: NodeJS.Timeout | null = null;
	private readonly heartbeatMs: number;
	private readonly logger: NonNullable<PulseBridgeOptions["logger"]>;
	private started = false;

	constructor(opts: PulseBridgeOptions = {}) {
		this.heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
		this.logger = opts.logger ?? {
			info: () => {},
			warn: () => {},
			error: () => {},
		};
	}

	/**
	 * Set (or replace) the source. Idempotent; replacing an existing source
	 * unsubscribes the old one via the unsubscriber returned by `subscribe()`.
	 * Setting null puts the bridge in degraded mode (heartbeat-only).
	 */
	setSource(source: PulseSource | null): void {
		if (this.source === source) return;
		if (this.source) {
			this.detachCurrentSource();
		}
		this.source = source;
		if (source) {
			const handler = (msg: PulseMessage) => {
				void this.fanOut(msg);
			};
			this.handlers.set(source, handler);
			try {
				const unsub = source.subscribe(handler);
				this.unsubscribers.set(source, unsub);
			} catch (e) {
				this.handlers.delete(source);
				this.source = null;
				this.logger.error("pulse-bridge: source subscribe threw", {
					err: (e as Error).message,
				});
				return;
			}
			this.logger.info("pulse-bridge: source attached");
		} else {
			this.logger.warn("pulse-bridge: source detached, degraded mode (heartbeat only)");
		}
	}

	private detachCurrentSource(): void {
		if (!this.source) return;
		const unsub = this.unsubscribers.get(this.source);
		if (unsub) {
			try {
				unsub();
			} catch (e) {
				this.logger.warn("pulse-bridge: source unsubscriber threw", {
					err: (e as Error).message,
				});
			}
		}
		this.handlers.delete(this.source);
		this.unsubscribers.delete(this.source);
	}

	removeSource(): void {
		this.setSource(null);
	}

	attach(sink: PulseSink): void {
		if (this.sinks.has(sink)) return;
		this.sinks.add(sink);
		this.logger.info("pulse-bridge: sink attached", { total: this.sinks.size });
	}

	detach(sink: PulseSink): void {
		if (!this.sinks.delete(sink)) return;
		try {
			sink.close?.();
		} catch (e) {
			this.logger.warn("pulse-bridge: sink close threw", {
				err: (e as Error).message,
			});
		}
		this.logger.info("pulse-bridge: sink detached", { total: this.sinks.size });
	}

	start(): void {
		if (this.started) return;
		this.started = true;
		this.heartbeatTimer = setInterval(() => {
			const ts = Date.now();
			for (const sink of this.sinks) {
				try {
					sink.heartbeat?.(ts);
				} catch (e) {
					this.logger.warn("pulse-bridge: heartbeat write failed, detaching sink", {
						err: (e as Error).message,
					});
					this.detach(sink);
				}
			}
		}, this.heartbeatMs);
		// unref so the heartbeat timer never blocks process exit
		this.heartbeatTimer.unref?.();
		this.logger.info("pulse-bridge: started", {
			heartbeatMs: this.heartbeatMs,
		});
	}

	stop(): void {
		if (!this.started) return;
		this.started = false;
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		for (const sink of [...this.sinks]) {
			this.detach(sink);
		}
		this.removeSource();
		this.logger.info("pulse-bridge: stopped");
	}

	size(): { sinks: number; sourceAttached: boolean } {
		return { sinks: this.sinks.size, sourceAttached: this.source !== null };
	}

	private async fanOut(msg: PulseMessage): Promise<void> {
		if (this.sinks.size === 0) return;
		// Iterate over a snapshot so detach() during write doesn't skip siblings.
		const targets = [...this.sinks];
		for (const sink of targets) {
			try {
				await sink.write(msg);
			} catch (e) {
				this.logger.warn("pulse-bridge: sink write failed, detaching sink", {
					err: (e as Error).message,
					fromPeerId: msg.fromPeerId,
				});
				this.detach(sink);
			}
		}
	}
}

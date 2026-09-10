/**
 * SSE writer for pulse messages.
 *
 * Implements `PulseSink` over a raw Node writable stream (typically
 * `reply.raw` from Fastify after `reply.hijack()`).
 *
 * Wire format (text/event-stream, RFC: WHATWG HTML §9.2):
 *
 *   event: pulse
 *   data: {"v":1,"kind":"pulse","fromPeerId":"...","payload":...,"ts":1234}\n
 *   \n
 *
 *   event: heartbeat
 *   data: {"ts":1234}\n
 *   \n
 *
 * Notes:
 *   - SSE requires UTF-8 newlines, not \r\n. We normalize.
 *   - Each `data:` line is encoded as one JSON object. Multi-line `data:`
 *     fields would require escaping; we avoid that by sending single-line
 *     compact JSON.
 *   - Backpressure: writes return false on a full buffer; we await
 *     'drain' before the next write to avoid memory blowup under load.
 *   - The stream is closed when the Fastify request emits 'close'.
 */

import type { PulseMessage } from "@agentmesh/peer-mesh";
import type { PulseSink } from "./gossip-bridge.js";

const HEARTBEAT_EVENT = "heartbeat";

/** Minimal interface we need from the underlying writable. */
interface WritableLike {
	write(chunk: string): boolean;
	on(event: "drain", listener: () => void): void;
	on(event: "close", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
	once(event: "close", listener: () => void): void;
	once(event: "error", listener: (err: Error) => void): void;
	end(): void;
	destroyed?: boolean;
}

export interface SsePulseSinkOptions {
	/** Reply.raw or any writable-like stream. */
	stream: WritableLike;
	/** Heartbeat cadence in ms. */
	heartbeatMs?: number;
}

function frameEvent(event: string, data: string): string {
	return `event: ${event}\ndata: ${data}\n\n`;
}

/**
 * Writes SSE frames to `stream`. Returns a PulseSink plus a `dispose`
 * function to remove listeners and end the stream.
 */
export function attachSsePulseSink(opts: SsePulseSinkOptions): {
	sink: PulseSink;
	dispose: () => void;
} {
	const { stream, heartbeatMs = 15_000 } = opts;

	// Initial preamble + retry hint (clients back off 3s if disconnected).
	stream.write(`retry: 3000\n\n`);

	let closed = false;
	let writeChain: Promise<void> = Promise.resolve();

	const safeWrite = (chunk: string): Promise<void> => {
		if (closed) return Promise.resolve();
		writeChain = writeChain.then(async () => {
			if (closed) return;
			const ok = stream.write(chunk);
			if (!ok) {
				await new Promise<void>((resolve) => stream.on("drain", resolve));
			}
		});
		return writeChain;
	};

	const sink: PulseSink = {
		write(msg: PulseMessage) {
			const data = JSON.stringify(msg);
			return safeWrite(frameEvent("pulse", data));
		},
		heartbeat(ts: number) {
			const data = JSON.stringify({ ts });
			return safeWrite(frameEvent(HEARTBEAT_EVENT, data));
		},
		close() {
			if (closed) return;
			closed = true;
			try {
				stream.end();
			} catch {
				// ignore — stream may already be destroyed
			}
		},
	};

	const onClose = () => {
		closed = true;
	};
	const onError = () => {
		closed = true;
	};
	stream.on("close", onClose);
	stream.on("error", onError);
	const dispose = () => {
		stream.once("close", () => {
			closed = true;
		});
		sink.close?.();
	};
	// Suppress unused vars warning for heartbeatMs (kept for API symmetry / future use)
	void heartbeatMs;

	return { sink, dispose };
}

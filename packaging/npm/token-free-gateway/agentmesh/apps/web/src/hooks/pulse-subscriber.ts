/**
 * Pure EventSource lifecycle for the SSE pulse stream.
 *
 * Separated from `useGossipPulse` so we can unit-test the subscribe/close
 * machinery without React or jsdom. The hook is a thin adapter that wires
 * this module's callbacks into `useState`.
 *
 * Why a module + callbacks (not a class):
 *   - No "this" semantics; easier to compose with React refs and effects.
 *   - Easier to mock in tests (pass any "EventSourceCtor" function).
 *   - The factory's return value is a single `dispose` function, which is
 *     the same shape React's effect cleanup expects.
 */

import type { PulseMessage } from "./useGossipPulse.js";

/** Minimal EventSource surface — keeps the factory decoupled from the DOM type. */
export interface MinimalEventSource {
	onopen: ((ev: Event) => void) | null;
	onerror: ((ev: Event) => void) | null;
	onmessage: ((ev: MessageEvent<string>) => void) | null;
	readyState: number;
	close(): void;
}

export type EventSourceCtor = new (url: string) => MinimalEventSource;

export interface PulseSubscriberOptions {
	url: string;
	bufferSize: number;
	kinds?: PulseMessage["kind"][];
	/** What EventSource implementation to use. Defaults to globalThis.EventSource. */
	EventSource?: EventSourceCtor;
	onStatus: (status: "connecting" | "open" | "closed") => void;
	onReconnect: () => void;
	onMessage: (msg: PulseMessage) => void;
}

export interface PulseSubscriberHandle {
	dispose(): void;
}

/**
 * Open an EventSource and wire its lifecycle to the provided callbacks.
 *
 * Returns a `dispose` function the caller (typically a React `useEffect`
 * cleanup) calls to close the connection. Subsequent `onmessage` calls
 * after dispose are silently dropped.
 */
export function createPulseSubscriber(opts: PulseSubscriberOptions): PulseSubscriberHandle {
	const ES = opts.EventSource ?? (globalThis as { EventSource?: EventSourceCtor }).EventSource;
	if (!ES) {
		opts.onStatus("closed");
		return { dispose: () => {} };
	}

	opts.onStatus("connecting");

	const es = new ES(opts.url);
	let disposed = false;

	es.onopen = () => {
		if (disposed) return;
		opts.onStatus("open");
		opts.onReconnect();
	};

	es.onerror = () => {
		if (disposed) return;
		// EventSource auto-reconnects on transient errors. Only mark closed
		// when the browser gave up (readyState === CLOSED === 2).
		if (es.readyState === 2) {
			opts.onStatus("closed");
		}
	};

	es.onmessage = (ev) => {
		if (disposed) return;
		try {
			const msg = JSON.parse(ev.data) as PulseMessage;
			if (msg.v !== 1) return;
			if (opts.kinds && !opts.kinds.includes(msg.kind)) return;
			opts.onMessage(msg);
		} catch {
			// malformed payload — drop silently
		}
	};

	return {
		dispose: () => {
			if (disposed) return;
			disposed = true;
			try {
				es.close();
			} catch {
				// close may throw if EventSource was already torn down; ignore
			}
		},
	};
}
